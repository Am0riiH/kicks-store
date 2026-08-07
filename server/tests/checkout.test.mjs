/**
 * POST /api/create-checkout-session.
 *
 * The headline test here is the C1 regression: a client-supplied `price` must
 * never reach Stripe. Rather than trusting the route's own response, these
 * tests intercept the outbound HTTPS call with nock and assert on the exact
 * form body Stripe would have received.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import nock from 'nock';
import { loadApp } from './helpers.mjs';

let app;
let db;

/** Raw form body of the last intercepted Stripe request. */
let capturedBody;

beforeAll(async () => {
  ({ app, db } = await loadApp());
});

afterEach(() => {
  capturedBody = undefined;
  nock.cleanAll();
});

/**
 * Intercepts Stripe's session-create call. filteringRequestBody hands us the
 * raw urlencoded string before nock parses it, which is the only way to see
 * the exact bracket-notation keys the SDK serialises.
 */
function interceptStripeSessionCreate(sessionUrl = 'https://checkout.stripe.com/c/pay/cs_test_x') {
  return nock('https://api.stripe.com')
    .filteringRequestBody((body) => {
      capturedBody = body;
      return '*';
    })
    .post('/v1/checkout/sessions', '*')
    .reply(200, {
      id: 'cs_test_x',
      object: 'checkout.session',
      url: sessionUrl,
    });
}

const params = () => new URLSearchParams(capturedBody);

/** A seeded variant with known stock, plus its product's authoritative price. */
async function seededVariant(productId = 'sk1-chicago') {
  const variants = db.getVariantsForProduct(productId);
  const product = db.getProduct(productId);
  return { variant: variants[0], price: product.price };
}

describe('validation', () => {
  it('400s on an empty items array', async () => {
    const res = await request(app).post('/api/create-checkout-session').send({ items: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('400s when items is missing entirely', async () => {
    const res = await request(app).post('/api/create-checkout-session').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('400s when variant_id is missing — there is no safe price without it', async () => {
    const res = await request(app)
      .post('/api/create-checkout-session')
      .send({ items: [{ name: 'Chicago', quantity: 1 }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
    expect(JSON.stringify(res.body.details)).toContain('variant_id');
  });

  it('400s on a zero or negative quantity', async () => {
    const { variant } = await seededVariant();

    for (const quantity of [0, -1]) {
      const res = await request(app)
        .post('/api/create-checkout-session')
        .send({ items: [{ name: 'Chicago', quantity, variant_id: variant.id }] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    }
  });

  it('400s on a non-integer quantity', async () => {
    const { variant } = await seededVariant();

    const res = await request(app)
      .post('/api/create-checkout-session')
      .send({ items: [{ name: 'Chicago', quantity: 1.5, variant_id: variant.id }] });

    expect(res.status).toBe(400);
  });

  it('400s on a non-URL image', async () => {
    const { variant } = await seededVariant();

    const res = await request(app)
      .post('/api/create-checkout-session')
      .send({
        items: [{ name: 'Chicago', quantity: 1, variant_id: variant.id, image: 'not-a-url' }],
      });

    expect(res.status).toBe(400);
  });
});

describe('stock and pricing guards', () => {
  it('400s for a variant that does not exist', async () => {
    const res = await request(app)
      .post('/api/create-checkout-session')
      .send({ items: [{ name: 'Ghost', quantity: 1, variant_id: 99999999 }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Variant Ghost is no longer available.');
  });

  it('400s when the requested quantity exceeds stock', async () => {
    const { variant } = await seededVariant();

    const res = await request(app)
      .post('/api/create-checkout-session')
      .send({ items: [{ name: 'Chicago', quantity: variant.quantity + 1, variant_id: variant.id }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^Only \d+ units of Chicago \(.+\) are available\.$/);
  });

  it('400s when the owning product has no resolvable price', async () => {
    // An orphan variant: no products row, so there is no trustworthy price.
    // PRAGMA foreign_keys is never enabled, so SQLite permits this state — the
    // route must refuse outright rather than fall back to anything the client sent.
    db.addVariant({ product_id: 'no-such-product', size: '10', color: 'X', quantity: 5 });
    const orphan = db.getVariantsForProduct('no-such-product')[0];

    expect(db.getProduct('no-such-product')).toBeNull();

    const res = await request(app)
      .post('/api/create-checkout-session')
      .send({ items: [{ name: 'Orphan', quantity: 1, variant_id: orphan.id }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Pricing unavailable for Orphan. Please try again.');
  });
});

describe('C1 regression — the charged price comes from the database', () => {
  it('ignores a client-supplied price and charges the product row price', async () => {
    const { variant, price } = await seededVariant('sk1-chicago');
    expect(price).toBe(180);

    interceptStripeSessionCreate();

    const res = await request(app)
      .post('/api/create-checkout-session')
      .send({
        items: [{
          name: 'Chicago',
          quantity: 1,
          variant_id: variant.id,
          // The exact attack from the audit: a $180 shoe offered at 50 cents.
          price: 0.5,
        }],
      });

    expect(res.status).toBe(200);

    // Assert on what Stripe actually received, not on our own response.
    const body = params();
    expect(body.get('line_items[0][price_data][unit_amount]')).toBe('18000');
    expect(body.get('line_items[0][quantity]')).toBe('1');

    // The tampered value must appear nowhere in the outbound request.
    expect(capturedBody).not.toContain('50');
    expect(capturedBody).not.toMatch(/price_data\]\[unit_amount\]=50(&|$)/);
  });

  it('strips `price` before the handler can read it', async () => {
    const { variant } = await seededVariant('sk11-concord');
    interceptStripeSessionCreate();

    await request(app)
      .post('/api/create-checkout-session')
      .send({ items: [{ name: 'Concord', quantity: 1, variant_id: variant.id, price: 9999 }] });

    // zod object schemas strip unknown keys and validate() reassigns req.body,
    // so `price` is gone before any handler code runs.
    expect(capturedBody).not.toContain('9999');
    expect(params().get('line_items[0][price_data][unit_amount]')).toBe('22500');
  });

  it('prices each line independently across a multi-item cart', async () => {
    const chicago = db.getVariantsForProduct('sk1-chicago')[0];   // $180
    const concord = db.getVariantsForProduct('sk11-concord')[0];  // $225

    interceptStripeSessionCreate();

    const res = await request(app)
      .post('/api/create-checkout-session')
      .send({
        items: [
          { name: 'Chicago', quantity: 2, variant_id: chicago.id, price: 1 },
          { name: 'Concord', quantity: 1, variant_id: concord.id, price: 1 },
        ],
      });

    expect(res.status).toBe(200);

    const body = params();
    expect(body.get('line_items[0][price_data][unit_amount]')).toBe('18000');
    expect(body.get('line_items[0][quantity]')).toBe('2');
    expect(body.get('line_items[1][price_data][unit_amount]')).toBe('22500');
    expect(body.get('line_items[1][quantity]')).toBe('1');
  });

  it('rounds fractional prices to whole cents', async () => {
    db.createProduct({
      id: 'odd-price', name: 'Odd', colorway: 'X', category: 'Low-Top',
      price: 19.995, sku: 'ODD-1', tag: null, image: 'https://example.com/o.png',
    });
    db.addVariant({ product_id: 'odd-price', size: '10', color: 'X', quantity: 5 });
    const variant = db.getVariantsForProduct('odd-price')[0];

    interceptStripeSessionCreate();

    await request(app)
      .post('/api/create-checkout-session')
      .send({ items: [{ name: 'Odd', quantity: 1, variant_id: variant.id }] });

    expect(params().get('line_items[0][price_data][unit_amount]')).toBe('2000');
  });
});

describe('session payload', () => {
  it('carries variant_id in product metadata so the webhook can decrement stock', async () => {
    const { variant } = await seededVariant();
    interceptStripeSessionCreate();

    await request(app)
      .post('/api/create-checkout-session')
      .send({ items: [{ name: 'Chicago', quantity: 1, variant_id: variant.id }] });

    expect(params().get('line_items[0][price_data][product_data][metadata][variant_id]'))
      .toBe(String(variant.id));
  });

  it('accepts a string variant_id from the client', async () => {
    const { variant } = await seededVariant();
    interceptStripeSessionCreate();

    const res = await request(app)
      .post('/api/create-checkout-session')
      .send({ items: [{ name: 'Chicago', quantity: 1, variant_id: String(variant.id) }] });

    expect(res.status).toBe(200);
    expect(params().get('line_items[0][price_data][unit_amount]')).toBe('18000');
  });

  it('sets mode, success and cancel URLs', async () => {
    const { variant } = await seededVariant();
    interceptStripeSessionCreate();

    await request(app)
      .post('/api/create-checkout-session')
      .send({ items: [{ name: 'Chicago', quantity: 1, variant_id: variant.id }] });

    const body = params();
    expect(body.get('mode')).toBe('payment');
    expect(body.get('success_url'))
      .toBe('http://localhost:5173/checkout/success?session_id={CHECKOUT_SESSION_ID}');
    expect(body.get('cancel_url')).toBe('http://localhost:5173/checkout/cancel');
    expect(body.get('phone_number_collection[enabled]')).toBe('true');
    expect(body.get('shipping_address_collection[allowed_countries][0]')).toBe('US');
  });

  it('forwards an http(s) image but drops anything else', async () => {
    const { variant } = await seededVariant();

    interceptStripeSessionCreate();
    await request(app)
      .post('/api/create-checkout-session')
      .send({
        items: [{
          name: 'Chicago', quantity: 1, variant_id: variant.id,
          image: 'https://cdn.example.com/shoe.png',
        }],
      });
    expect(params().get('line_items[0][price_data][product_data][images][0]'))
      .toBe('https://cdn.example.com/shoe.png');

    // A data: URI is a valid z.string().url() but must not be forwarded.
    nock.cleanAll();
    interceptStripeSessionCreate();
    await request(app)
      .post('/api/create-checkout-session')
      .send({
        items: [{
          name: 'Chicago', quantity: 1, variant_id: variant.id,
          image: 'data:image/png;base64,iVBORw0KGgo=',
        }],
      });
    expect(capturedBody).not.toContain('images');
  });

  it('returns the Stripe-hosted URL to the client', async () => {
    const { variant } = await seededVariant();
    interceptStripeSessionCreate('https://checkout.stripe.com/c/pay/cs_test_returned');

    const res = await request(app)
      .post('/api/create-checkout-session')
      .send({ items: [{ name: 'Chicago', quantity: 1, variant_id: variant.id }] });

    expect(res.body).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test_returned' });
  });
});

describe('Stripe failures', () => {
  it('500s when the Stripe API rejects the session', async () => {
    const { variant } = await seededVariant();

    nock('https://api.stripe.com')
      .post('/v1/checkout/sessions')
      .reply(402, { error: { message: 'Your card was declined.', type: 'card_error' } });

    const res = await request(app)
      .post('/api/create-checkout-session')
      .send({ items: [{ name: 'Chicago', quantity: 1, variant_id: variant.id }] });

    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
  });

  it('does not decrement stock when session creation fails', async () => {
    const { variant } = await seededVariant();
    const before = db.getVariant(variant.id).quantity;

    nock('https://api.stripe.com')
      .post('/v1/checkout/sessions')
      .reply(500, { error: { message: 'boom' } });

    await request(app)
      .post('/api/create-checkout-session')
      .send({ items: [{ name: 'Chicago', quantity: 1, variant_id: variant.id }] });

    // Stock only moves on the webhook, never at session creation.
    expect(db.getVariant(variant.id).quantity).toBe(before);
  });
});
