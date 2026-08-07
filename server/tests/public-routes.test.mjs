import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import { loadApp, waitFor } from './helpers.mjs';

let app;
let db;

beforeAll(async () => {
  ({ app, db } = await loadApp());
});

describe('test harness', () => {
  it('runs against a throwaway database, never server/data.db', () => {
    expect(process.env.DB_PATH).toBeTruthy();
    expect(path.basename(path.dirname(process.env.DB_PATH))).toBe('ajs-tests');
    expect(process.env.DB_PATH).not.toContain(path.join('server', 'data.db'));
  });

  it('shares one sql.js instance between the test and the app', async () => {
    // If the test's `db` were a different module instance from the one
    // index.js required, this row would be invisible to the route below.
    db.createProduct({
      id: 'harness-probe',
      name: 'Harness Probe',
      category: 'Low-Top',
      price: 1,
      sku: 'HP-1',
      image: 'https://example.com/p.png',
    });

    const res = await request(app).get('/api/products/harness-probe');
    expect(res.status).toBe(200);
    expect(res.body.product.name).toBe('Harness Probe');

    db.deleteProduct('harness-probe');
  });
});

describe('GET /health', () => {
  it('reports ok, mode and whether the webhook secret is set', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      mode: 'test',
      webhookSecretSet: true,
    });
  });
});

describe('GET /api/products', () => {
  it('returns the seeded catalogue', async () => {
    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.products)).toBe(true);
    expect(res.body.products.length).toBeGreaterThanOrEqual(6);

    const chicago = res.body.products.find((p) => p.id === 'sk1-chicago');
    expect(chicago).toBeDefined();
    expect(chicago.price).toBe(180);
  });

  it('embeds variants on every product (M5: one request, not 1+N)', async () => {
    const res = await request(app).get('/api/products');

    for (const product of res.body.products) {
      expect(Array.isArray(product.variants)).toBe(true);
    }

    const chicago = res.body.products.find((p) => p.id === 'sk1-chicago');
    expect(chicago.variants.length).toBe(6);
    expect(chicago.variants.every((v) => v.product_id === 'sk1-chicago')).toBe(true);
    expect(chicago.variants.map((v) => v.size).sort()).toEqual(
      ['10', '11', '12', '13', '8', '9']
    );
  });
});

describe('GET /api/products/:id', () => {
  it('returns a product with its variants embedded', async () => {
    const res = await request(app).get('/api/products/sk11-concord');

    expect(res.status).toBe(200);
    expect(res.body.product.id).toBe('sk11-concord');
    expect(res.body.product.price).toBe(225);
    expect(res.body.product.variants.length).toBe(6);
  });

  it('404s for an unknown id', async () => {
    const res = await request(app).get('/api/products/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Product not found' });
  });
});

describe('GET /api/products/:id/variants', () => {
  it('returns the variants for a product', async () => {
    const res = await request(app).get('/api/products/sk4-bred/variants');

    expect(res.status).toBe(200);
    expect(res.body.variants.length).toBe(6);
    expect(res.body.variants.every((v) => v.quantity === 5)).toBe(true);
  });

  it('returns an empty array — not a 404 — for an unknown product', async () => {
    const res = await request(app).get('/api/products/nope/variants');

    expect(res.status).toBe(200);
    expect(res.body.variants).toEqual([]);
  });
});

describe('GET /api/order-status', () => {
  const SESSION_ID = 'cs_test_order_status_whitelist';

  beforeAll(async () => {
    db.upsertOrder(
      {
        id: SESSION_ID,
        amount_total: 18000,
        currency: 'usd',
        payment_status: 'paid',
        customer_details: {
          email: 'buyer@example.com',
          name: 'Test Buyer',
          phone: '+15551234567',
        },
        shipping_details: {
          name: 'Test Buyer',
          address: {
            line1: '99 Private Road',
            line2: 'Flat 4',
            city: 'Testville',
            state: 'CA',
            postal_code: '90210',
            country: 'US',
          },
        },
      },
      [{ description: 'Chicago', quantity: 1, amount: 18000, currency: 'usd' }]
    );

    await waitFor(() => db.getOrder(SESSION_ID));
  });

  it('400s without a session_id', async () => {
    const res = await request(app).get('/api/order-status');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'session_id query param is required.' });
  });

  it('404s with { found: false } for an unknown session', async () => {
    const res = await request(app)
      .get('/api/order-status')
      .query({ session_id: 'cs_test_never_existed' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ found: false });
  });

  it('returns exactly the seven whitelisted fields and nothing else', async () => {
    const res = await request(app)
      .get('/api/order-status')
      .query({ session_id: SESSION_ID });

    expect(res.status).toBe(200);

    // M2 regression. This is an unauthenticated endpoint: anyone holding a
    // session id can call it, so the response shape is a security boundary.
    // Asserting the exact key set means any new column added to `orders` fails
    // this test rather than silently leaking.
    expect(Object.keys(res.body).sort()).toEqual([
      'amount_total',
      'currency',
      'customer_email',
      'customer_name',
      'found',
      'id',
      'items',
    ]);

    expect(res.body.found).toBe(true);
    expect(res.body.amount_total).toBe(18000);
    expect(res.body.items).toHaveLength(1);
  });

  it('leaks no shipping address, phone, fulfillment status or timestamps', async () => {
    const res = await request(app)
      .get('/api/order-status')
      .query({ session_id: SESSION_ID });

    // Present on the stored row — prove they are withheld.
    const stored = db.getOrder(SESSION_ID);
    expect(stored.shipping_postal_code).toBe('90210');
    expect(stored.shipping_phone).toBe('+15551234567');

    const forbidden = [
      'shipping_name', 'shipping_phone', 'shipping_line1', 'shipping_line2',
      'shipping_city', 'shipping_state', 'shipping_postal_code', 'shipping_country',
      'status', 'fulfillment_status', 'created_at',
    ];

    for (const key of forbidden) {
      expect(res.body).not.toHaveProperty(key);
    }

    // Also assert on the raw body, in case a value is nested somewhere.
    expect(res.text).not.toContain('90210');
    expect(res.text).not.toContain('+15551234567');
    expect(res.text).not.toContain('99 Private Road');
  });
});
