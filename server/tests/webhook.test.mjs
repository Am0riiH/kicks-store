import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import nock from 'nock';
import { loadApp, signWebhook, checkoutSessionCompleted, waitFor } from './helpers.mjs';

let app;
let db;

beforeAll(async () => {
  ({ app, db } = await loadApp());

  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  nock.cleanAll();
});

function postWebhook(payload, signature) {
  const req = request(app).post('/api/webhook').set('Content-Type', 'application/json');

  if (signature !== undefined) req.set('stripe-signature', signature);

  return req.send(payload);
}

function interceptLineItems(sessionId, items) {
  return nock('https://api.stripe.com')
    .get(`/v1/checkout/sessions/${sessionId}/line_items`)
    .query(true)
    .reply(200, {
      object: 'list',
      data: items.map((it) => ({
        id: `li_${Math.random().toString(36).slice(2, 8)}`,
        object: 'item',
        description: it.description,
        quantity: it.quantity,
        amount_total: it.amount ?? 18000,
        currency: 'usd',
        price: {
          object: 'price',
          product: { object: 'product', metadata: { variant_id: String(it.variant_id) } },
        },
      })),
    });
}

describe('failure handling', () => {
  it('answers 500 when the order cannot be stored so Stripe retries', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(db, 'upsertOrder').mockImplementation(() => {
      throw new Error('disk full');
    });
    const event = checkoutSessionCompleted();
    interceptLineItems(event.data.object.id, []);
    const { payload, signature } = signWebhook(event);

    const res = await postWebhook(payload, signature);

    expect(res.status).toBe(500);
    vi.restoreAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('answers 500 in production when the webhook secret is missing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const originalEnv = process.env.NODE_ENV;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    process.env.NODE_ENV = 'production';

    try {
      const res = await postWebhook('{}', 'irrelevant');
      expect(res.status).toBe(500);
    } finally {
      process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
      process.env.NODE_ENV = originalEnv;
    }
  });
});

describe('signature verification', () => {
  it('accepts a correctly signed event', async () => {
    const event = checkoutSessionCompleted();
    const { payload, signature } = signWebhook(event);
    interceptLineItems(event.data.object.id, []);

    const res = await postWebhook(payload, signature);

    expect(res.status).toBe(200);
  });

  it('rejects a request with no stripe-signature header', async () => {
    const { payload } = signWebhook(checkoutSessionCompleted());
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await postWebhook(payload, undefined);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^Webhook error:/);
    expect(spy).toHaveBeenCalled();
  });

  it('rejects an empty signature header', async () => {
    const { payload } = signWebhook(checkoutSessionCompleted());
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await postWebhook(payload, '');

    expect(res.status).toBe(400);
  });

  it('rejects a garbage signature header', async () => {
    const { payload } = signWebhook(checkoutSessionCompleted());
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await postWebhook(payload, 't=123,v1=deadbeef');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^Webhook error:/);
  });

  it('rejects a payload tampered with after signing', async () => {
    const event = checkoutSessionCompleted();
    const { payload, signature } = signWebhook(event);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const forged = payload.replace('"amount_total":21000', '"amount_total":1');
    expect(forged).not.toBe(payload);

    const res = await postWebhook(forged, signature);

    expect(res.status).toBe(400);
    expect(db.getOrder(event.data.object.id)).toBeNull();
  });

  it('rejects an event signed with the wrong secret', async () => {
    const event = checkoutSessionCompleted();
    const { payload, signature } = signWebhook(event, 'whsec_a_different_secret');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await postWebhook(payload, signature);

    expect(res.status).toBe(400);
    expect(db.getOrder(event.data.object.id)).toBeNull();
  });

  it('skips verification entirely when STRIPE_WEBHOOK_SECRET is unset', async () => {
    const original = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const event = checkoutSessionCompleted();
      const res = await postWebhook(JSON.stringify(event), 'irrelevant');

      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalled();
      expect(db.getOrder(event.data.object.id)).toBeNull();
    } finally {
      process.env.STRIPE_WEBHOOK_SECRET = original;
    }
  });
});

describe('checkout.session.completed', () => {
  it('persists the order with customer and shipping details', async () => {
    const event = checkoutSessionCompleted();
    const sessionId = event.data.object.id;
    const { payload, signature } = signWebhook(event);
    interceptLineItems(sessionId, []);

    await postWebhook(payload, signature);

    const order = await waitFor(() => db.getOrder(sessionId));
    expect(order.amount_total).toBe(21000);
    expect(order.currency).toBe('usd');
    expect(order.customer_email).toBe('buyer@example.com');
    expect(order.customer_name).toBe('Test Buyer');
    expect(order.shipping_city).toBe('Testville');
    expect(order.shipping_postal_code).toBe('90210');
    expect(order.fulfillment_status).toBe('pending');
  });

  it('stores the line items fetched from Stripe', async () => {
    const event = checkoutSessionCompleted();
    const sessionId = event.data.object.id;
    const { payload, signature } = signWebhook(event);
    interceptLineItems(sessionId, [
      { description: 'Chicago', quantity: 2, variant_id: 1, amount: 36000 },
    ]);

    await postWebhook(payload, signature);

    const order = await waitFor(() => {
      const found = db.getOrder(sessionId);
      return found?.items?.length ? found : null;
    });

    expect(order.items).toEqual([
      {
        description: 'Chicago',
        quantity: 2,
        amount: 36000,
        currency: 'usd',
        variant_id: '1',
      },
    ]);
  });

  it('decrements stock for each line item carrying a variant_id', async () => {
    const variant = db.getVariantsForProduct('sk4-bred')[0];
    const before = variant.quantity;

    const event = checkoutSessionCompleted();
    const sessionId = event.data.object.id;
    const { payload, signature } = signWebhook(event);
    interceptLineItems(sessionId, [
      { description: 'Bred', quantity: 2, variant_id: variant.id },
    ]);

    await postWebhook(payload, signature);

    await waitFor(() => db.getVariant(variant.id).quantity === before - 2);
    expect(db.getVariant(variant.id).quantity).toBe(before - 2);
  });

  it('refuses to oversell when stock has moved since checkout', async () => {
    const product = {
      id: `low-stock-${Date.now()}`,
      name: 'Low',
      colorway: 'X',
      category: 'Low-Top',
      price: 10,
      sku: `LS-${Date.now()}`,
      tag: null,
      image: 'https://example.com/l.png',
    };
    db.createProduct(product);
    db.addVariant({ product_id: product.id, size: '10', color: 'X', quantity: 1 });
    const variant = db.getVariantsForProduct(product.id)[0];

    const event = checkoutSessionCompleted();
    const sessionId = event.data.object.id;
    const { payload, signature } = signWebhook(event);
    interceptLineItems(sessionId, [
      { description: 'Low', quantity: 5, variant_id: variant.id },
    ]);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await postWebhook(payload, signature);

    await waitFor(() => db.getOrder(sessionId));
    expect(db.getVariant(variant.id).quantity).toBe(1);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('OVERSELL CONFLICT'));
  });

  it('survives Stripe failing the line-items lookup', async () => {
    const event = checkoutSessionCompleted();
    const sessionId = event.data.object.id;
    const { payload, signature } = signWebhook(event);

    nock('https://api.stripe.com')
      .get(`/v1/checkout/sessions/${sessionId}/line_items`)
      .query(true)
      .reply(500, { error: { message: 'upstream boom' } });

    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await postWebhook(payload, signature);
    expect(res.status).toBe(200);

    const order = await waitFor(() => db.getOrder(sessionId));
    expect(order.items).toEqual([]);
  });
});

describe('idempotency', () => {
  it('does not duplicate the order or double-decrement on replay', async () => {
    const variant = db.getVariantsForProduct('sk5-raging-bull')[0];
    const before = variant.quantity;

    const event = checkoutSessionCompleted();
    const sessionId = event.data.object.id;
    const { payload, signature } = signWebhook(event);

    interceptLineItems(sessionId, [
      { description: 'Bull', quantity: 1, variant_id: variant.id },
    ]);
    await postWebhook(payload, signature);
    await waitFor(() => db.getVariant(variant.id).quantity === before - 1);

    interceptLineItems(sessionId, [
      { description: 'Bull', quantity: 1, variant_id: variant.id },
    ]);
    const second = await postWebhook(payload, signature);

    expect(second.status).toBe(200);
    await new Promise((r) => setTimeout(r, 150));

    expect(db.getAllOrders().filter((o) => o.id === sessionId)).toHaveLength(1);
    expect(db.getVariant(variant.id).quantity).toBe(before - 1);
  });
});

describe('other event types', () => {
  it('acknowledges checkout.session.expired without persisting anything', async () => {
    const event = {
      id: 'evt_expired',
      object: 'event',
      type: 'checkout.session.expired',
      data: { object: { id: 'cs_test_expired_1', customer_details: {} } },
    };
    const { payload, signature } = signWebhook(event);

    const res = await postWebhook(payload, signature);

    expect(res.status).toBe(200);
    expect(db.getOrder('cs_test_expired_1')).toBeNull();
  });

  it('acknowledges payment_intent.payment_failed', async () => {
    const event = {
      id: 'evt_failed',
      object: 'event',
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_1', last_payment_error: { message: 'declined' } } },
    };
    const { payload, signature } = signWebhook(event);

    expect((await postWebhook(payload, signature)).status).toBe(200);
  });

  it('acknowledges an unrecognised event type', async () => {
    const event = {
      id: 'evt_other',
      object: 'event',
      type: 'invoice.paid',
      data: { object: {} },
    };
    const { payload, signature } = signWebhook(event);

    expect((await postWebhook(payload, signature)).status).toBe(200);
  });
});

describe('middleware placement', () => {
  it('is not JSON-parsed — the raw body must survive for signature checks', async () => {
    const event = checkoutSessionCompleted();
    const { payload, signature } = signWebhook(event);
    interceptLineItems(event.data.object.id, []);

    const res = await postWebhook(payload, signature);

    expect(res.status).toBe(200);
    await waitFor(() => db.getOrder(event.data.object.id));
  });

  it('is not rate limited — Stripe retries must never be throttled', async () => {
    for (let i = 0; i < 12; i += 1) {
      const event = checkoutSessionCompleted();
      const { payload, signature } = signWebhook(event);
      interceptLineItems(event.data.object.id, []);

      const res = await postWebhook(payload, signature);
      expect(res.status).toBe(200);
    }
  });
});
