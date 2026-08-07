/**
 * /api/admin/* — auth enforcement and CRUD.
 *
 * Auth is applied as a mount, not per route: app.use('/api/admin/', …, adminAuth)
 * at index.js:322. The enforcement block below therefore walks every admin route
 * so a future route added under that prefix cannot quietly skip the check.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import { loadApp, adminHeader, TEST_ADMIN_USER, TEST_ADMIN_PASSWORD } from './helpers.mjs';

let app;
let db;

beforeAll(async () => {
  ({ app, db } = await loadApp());
});

afterEach(() => {
  vi.restoreAllMocks();
});

const uid = (p) => `${p}-${Math.random().toString(36).slice(2, 10)}`;

const validProduct = (over = {}) => ({
  id: uid('prod'),
  name: 'Admin Test Shoe',
  category: 'High-Top',
  price: 150,
  sku: uid('SKU'),
  image: 'https://example.com/shoe.png',
  ...over,
});

/** Every route behind the /api/admin/ mount. */
const ADMIN_ROUTES = [
  ['get', '/api/admin/orders'],
  ['patch', '/api/admin/orders/cs_test_1/status'],
  ['get', '/api/admin/upload-signature'],
  ['get', '/api/admin/products'],
  ['post', '/api/admin/products'],
  ['put', '/api/admin/products/some-id'],
  ['delete', '/api/admin/products/some-id'],
  ['post', '/api/admin/products/some-id/variants'],
  ['put', '/api/admin/variants/1'],
  ['delete', '/api/admin/variants/1'],
];

describe('auth enforcement', () => {
  it.each(ADMIN_ROUTES)('401s on %s %s with no credentials', async (method, path) => {
    const res = await request(app)[method](path).send({});

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Authentication required.' });
  });

  it.each(ADMIN_ROUTES)('401s on %s %s with a wrong password', async (method, path) => {
    const res = await request(app)[method](path)
      .set('Authorization', adminHeader(TEST_ADMIN_USER, 'wrong-password'))
      .send({});

    expect(res.status).toBe(401);
  });

  it('401s with a wrong username', async () => {
    const res = await request(app).get('/api/admin/orders')
      .set('Authorization', adminHeader('not-the-admin', TEST_ADMIN_PASSWORD));

    expect(res.status).toBe(401);
  });

  it('sets WWW-Authenticate so a browser can prompt', async () => {
    const res = await request(app).get('/api/admin/orders');

    expect(res.headers['www-authenticate']).toBe('Basic realm="Admin Area"');
  });

  it.each([
    ['malformed base64', 'Basic !!!not-base64!!!'],
    ['no scheme', Buffer.from('a:b').toString('base64')],
    ['bearer token', 'Bearer some.jwt.token'],
    ['empty header', ''],
    ['scheme only', 'Basic'],
    ['no colon in credentials', `Basic ${Buffer.from('adminpassword').toString('base64')}`],
  ])('401s on a %s header without crashing', async (_label, header) => {
    const res = await request(app).get('/api/admin/orders').set('Authorization', header);

    expect(res.status).toBe(401);
  });

  it('401s when ADMIN_PASSWORD_HASH is unset on the server', async () => {
    const original = process.env.ADMIN_PASSWORD_HASH;
    delete process.env.ADMIN_PASSWORD_HASH;

    try {
      const res = await request(app).get('/api/admin/orders').set('Authorization', adminHeader());
      // Fails closed: no hash configured means nobody gets in.
      expect(res.status).toBe(401);
    } finally {
      process.env.ADMIN_PASSWORD_HASH = original;
    }
  });

  it('accepts the correct credentials', async () => {
    const res = await request(app).get('/api/admin/orders').set('Authorization', adminHeader());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.orders)).toBe(true);
  });
});

describe('GET /api/admin/orders', () => {
  it('returns full order rows including the fields order-status withholds', async () => {
    const id = uid('cs_test');
    db.upsertOrder({
      id,
      amount_total: 5000,
      currency: 'usd',
      customer_details: { email: 'x@y.com', name: 'X Y', phone: '+15559999999' },
      shipping_details: { name: 'X Y', address: { line1: '1 St', city: 'Town', country: 'US' } },
    });

    const res = await request(app).get('/api/admin/orders').set('Authorization', adminHeader());

    const order = res.body.orders.find((o) => o.id === id);
    expect(order).toBeDefined();
    // Authenticated admins legitimately see shipping data.
    expect(order.shipping_phone).toBe('+15559999999');
    expect(order.shipping_line1).toBe('1 St');
    expect(order.fulfillment_status).toBe('pending');
  });
});

describe('PATCH /api/admin/orders/:id/status', () => {
  const seedOrder = () => {
    const id = uid('cs_test');
    db.upsertOrder({ id, amount_total: 1000, currency: 'usd' });
    return id;
  };

  it.each(['pending', 'completed', 'rejected'])('accepts %s', async (status) => {
    const id = seedOrder();

    const res = await request(app)
      .patch(`/api/admin/orders/${id}/status`)
      .set('Authorization', adminHeader())
      .send({ status });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, status });
    expect(db.getOrder(id).fulfillment_status).toBe(status);
  });

  it.each([
    ['an unknown value', 'shipped'],
    ['the wrong case', 'COMPLETED'],
    ['an empty string', ''],
    ['a number', 1],
  ])('400s on %s', async (_label, status) => {
    const id = seedOrder();

    const res = await request(app)
      .patch(`/api/admin/orders/${id}/status`)
      .set('Authorization', adminHeader())
      .send({ status });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid status' });
    expect(db.getOrder(id).fulfillment_status).toBe('pending');
  });

  it('400s when status is missing entirely', async () => {
    const id = seedOrder();

    const res = await request(app)
      .patch(`/api/admin/orders/${id}/status`)
      .set('Authorization', adminHeader())
      .send({});

    expect(res.status).toBe(400);
  });

  it('404s for an unknown order', async () => {
    const res = await request(app)
      .patch('/api/admin/orders/cs_test_missing/status')
      .set('Authorization', adminHeader())
      .send({ status: 'completed' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Order not found' });
  });
});

describe('GET /api/admin/upload-signature', () => {
  it('503s when Cloudinary is not configured', async () => {
    const res = await request(app)
      .get('/api/admin/upload-signature')
      .set('Authorization', adminHeader());

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/Image upload is not configured/);
  });

  it('returns a correct SHA-1 signature when configured', async () => {
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    process.env.CLOUDINARY_API_KEY = 'test-key';
    process.env.CLOUDINARY_API_SECRET = 'test-secret';

    try {
      const res = await request(app)
        .get('/api/admin/upload-signature')
        .set('Authorization', adminHeader());

      expect(res.status).toBe(200);
      expect(res.body.cloudName).toBe('test-cloud');
      expect(res.body.apiKey).toBe('test-key');
      expect(res.body.folder).toBe('products');

      // Recompute Cloudinary's algorithm independently: params sorted, joined
      // k=v&k=v, secret appended, SHA-1 hex.
      const expected = crypto
        .createHash('sha1')
        .update(`folder=products&timestamp=${res.body.timestamp}test-secret`)
        .digest('hex');

      expect(res.body.signature).toBe(expected);
    } finally {
      delete process.env.CLOUDINARY_CLOUD_NAME;
      delete process.env.CLOUDINARY_API_KEY;
      delete process.env.CLOUDINARY_API_SECRET;
    }
  });

  it('never returns the API secret', async () => {
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    process.env.CLOUDINARY_API_KEY = 'test-key';
    process.env.CLOUDINARY_API_SECRET = 'super-secret-value';

    try {
      const res = await request(app)
        .get('/api/admin/upload-signature')
        .set('Authorization', adminHeader());

      expect(res.text).not.toContain('super-secret-value');
    } finally {
      delete process.env.CLOUDINARY_CLOUD_NAME;
      delete process.env.CLOUDINARY_API_KEY;
      delete process.env.CLOUDINARY_API_SECRET;
    }
  });

  it('503s when only some Cloudinary vars are set', async () => {
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';

    try {
      const res = await request(app)
        .get('/api/admin/upload-signature')
        .set('Authorization', adminHeader());

      expect(res.status).toBe(503);
    } finally {
      delete process.env.CLOUDINARY_CLOUD_NAME;
    }
  });
});

describe('POST /api/admin/products', () => {
  it('creates a product and echoes it back as 201', async () => {
    const product = validProduct();

    const res = await request(app)
      .post('/api/admin/products')
      .set('Authorization', adminHeader())
      .send(product);

    expect(res.status).toBe(201);
    expect(res.body.product).toMatchObject({ id: product.id, name: product.name });
    expect(db.getProduct(product.id)).not.toBeNull();
  });

  it.each([
    ['a missing id', { id: undefined }],
    ['an empty id', { id: '' }],
    ['a missing category', { category: undefined }],
    ['a missing name', { name: undefined }],
    ['a zero price', { price: 0 }],
    ['a negative price', { price: -5 }],
    ['a string price', { price: '150' }],
    ['a non-URL image', { image: 'not-a-url' }],
  ])('400s on %s', async (_label, over) => {
    const res = await request(app)
      .post('/api/admin/products')
      .set('Authorization', adminHeader())
      .send(validProduct(over));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('accepts an empty-string image (the documented "no image" value)', async () => {
    const res = await request(app)
      .post('/api/admin/products')
      .set('Authorization', adminHeader())
      .send(validProduct({ image: '' }));

    expect(res.status).toBe(201);
  });

  it('500s with a JSON body — never HTML — on a duplicate id', async () => {
    const product = validProduct();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await request(app).post('/api/admin/products')
      .set('Authorization', adminHeader()).send(product);

    const res = await request(app).post('/api/admin/products')
      .set('Authorization', adminHeader()).send(product);

    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.error).toMatch(/^Could not save product:/);
  });

  // ── BUG (documented, not fixed) ────────────────────────────────────────────
  // productSchema marks `sku` and `image` optional, but both columns are
  // NOT NULL. Omitting either passes validation and then fails at the database,
  // surfacing as a 500 where a 400 would be correct.
  //
  // Fix would be to make them required in the schema, or give the columns
  // defaults.
  it.each(['sku', 'image'])('BUG: omitting %s passes validation then 500s at the DB', async (field) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const product = validProduct();
    delete product[field];

    const res = await request(app)
      .post('/api/admin/products')
      .set('Authorization', adminHeader())
      .send(product);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/NOT NULL constraint failed: products\./);
  });

  // ── BUG (documented, not fixed) ────────────────────────────────────────────
  // productSchema accepts `description`, but the products table has no such
  // column. The value is accepted, echoed back in the 201, and silently dropped.
  it('BUG: accepts description but never stores it', async () => {
    const product = validProduct({ description: 'A detailed write-up.' });

    const res = await request(app)
      .post('/api/admin/products')
      .set('Authorization', adminHeader())
      .send(product);

    expect(res.status).toBe(201);
    // Echoed back, so the admin UI believes it saved.
    expect(res.body.product.description).toBe('A detailed write-up.');
    // But it is nowhere in the database.
    expect(db.getProduct(product.id)).not.toHaveProperty('description');
  });

  it('strips unknown fields rather than storing them', async () => {
    const product = validProduct();

    const res = await request(app)
      .post('/api/admin/products')
      .set('Authorization', adminHeader())
      .send({ ...product, injected: 'should-not-persist' });

    expect(res.status).toBe(201);
    expect(res.body.product).not.toHaveProperty('injected');
  });
});

describe('PUT /api/admin/products/:id', () => {
  it('applies a partial update', async () => {
    const product = validProduct({ price: 100 });
    db.createProduct(product);

    const res = await request(app)
      .put(`/api/admin/products/${product.id}`)
      .set('Authorization', adminHeader())
      .send({ price: 275 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(db.getProduct(product.id).price).toBe(275);
    expect(db.getProduct(product.id).name).toBe(product.name);
  });

  it('404s for an unknown product', async () => {
    const res = await request(app)
      .put('/api/admin/products/never-existed')
      .set('Authorization', adminHeader())
      .send({ price: 10 });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Product not found' });
  });

  it('400s on an invalid partial value', async () => {
    const product = validProduct();
    db.createProduct(product);

    const res = await request(app)
      .put(`/api/admin/products/${product.id}`)
      .set('Authorization', adminHeader())
      .send({ price: -1 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });
});

describe('DELETE /api/admin/products/:id', () => {
  it('deletes a product and its variants', async () => {
    const product = validProduct();
    db.createProduct(product);
    db.addVariant({ product_id: product.id, size: '10', color: 'Red', quantity: 1 });

    const res = await request(app)
      .delete(`/api/admin/products/${product.id}`)
      .set('Authorization', adminHeader());

    expect(res.status).toBe(200);
    expect(db.getProduct(product.id)).toBeNull();
    expect(db.getVariantsForProduct(product.id)).toHaveLength(0);
  });

  it('404s for an unknown product', async () => {
    const res = await request(app)
      .delete('/api/admin/products/never-existed')
      .set('Authorization', adminHeader());

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });
});

describe('variant routes', () => {
  const seedProduct = () => {
    const product = validProduct();
    db.createProduct(product);
    return product;
  };

  it('creates a variant', async () => {
    const product = seedProduct();

    const res = await request(app)
      .post(`/api/admin/products/${product.id}/variants`)
      .set('Authorization', adminHeader())
      .send({ size: '10', color: 'Red', quantity: 4 });

    expect(res.status).toBe(201);
    expect(res.body.variant).toMatchObject({
      product_id: product.id, size: '10', color: 'Red', quantity: 4,
    });

    const stored = db.getVariantsForProduct(product.id);
    expect(stored).toHaveLength(1);
    expect(stored[0].quantity).toBe(4);
  });

  it('accepts a zero quantity', async () => {
    const product = seedProduct();

    const res = await request(app)
      .post(`/api/admin/products/${product.id}/variants`)
      .set('Authorization', adminHeader())
      .send({ size: '10', color: 'Red', quantity: 0 });

    expect(res.status).toBe(201);
  });

  it.each([
    ['a missing size', { color: 'Red', quantity: 1 }],
    ['a missing color', { size: '10', quantity: 1 }],
    ['a negative quantity', { size: '10', color: 'Red', quantity: -1 }],
    ['a fractional quantity', { size: '10', color: 'Red', quantity: 1.5 }],
    ['a string quantity', { size: '10', color: 'Red', quantity: '3' }],
  ])('400s on %s', async (_label, body) => {
    const product = seedProduct();

    const res = await request(app)
      .post(`/api/admin/products/${product.id}/variants`)
      .set('Authorization', adminHeader())
      .send(body);

    expect(res.status).toBe(400);
  });

  it('updates a variant when the full body is supplied', async () => {
    const product = seedProduct();
    db.addVariant({ product_id: product.id, size: '10', color: 'Red', quantity: 5, sku: 'V1' });
    const variant = db.getVariantsForProduct(product.id)[0];

    const res = await request(app)
      .put(`/api/admin/variants/${variant.id}`)
      .set('Authorization', adminHeader())
      .send({ size: '10', color: 'Red', quantity: 8, sku: 'V1' });

    expect(res.status).toBe(200);
    expect(db.getVariant(variant.id).quantity).toBe(8);
  });

  // ── BUG (documented, not fixed) ────────────────────────────────────────────
  // The route validates with variantSchema.partial(), so { quantity: 3 } is
  // accepted — but db.updateVariant binds data.size and data.color raw, with no
  // _bind() coercion and no merge against the stored row. sql.js rejects the
  // undefined bind, the throw is uncaught in the route, and the global handler
  // turns it into a 500.
  //
  // This is on a hot path: AdminProducts.jsx fires this PUT on every keystroke
  // of the quantity input, sending only the changed fields.
  it('BUG: 500s on the partial update its own schema allows', async () => {
    const product = seedProduct();
    db.addVariant({ product_id: product.id, size: '10', color: 'Red', quantity: 5 });
    const variant = db.getVariantsForProduct(product.id)[0];
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app)
      .put(`/api/admin/variants/${variant.id}`)
      .set('Authorization', adminHeader())
      .send({ quantity: 3 });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error.' });
    expect(db.getVariant(variant.id).quantity).toBe(5);
  });

  it('404s when updating an unknown variant', async () => {
    const res = await request(app)
      .put('/api/admin/variants/99999999')
      .set('Authorization', adminHeader())
      .send({ size: '10', color: 'Red', quantity: 1, sku: 'X' });

    expect(res.status).toBe(404);
  });

  it('deletes a variant', async () => {
    const product = seedProduct();
    db.addVariant({ product_id: product.id, size: '10', color: 'Red', quantity: 1 });
    const variant = db.getVariantsForProduct(product.id)[0];

    const res = await request(app)
      .delete(`/api/admin/variants/${variant.id}`)
      .set('Authorization', adminHeader());

    expect(res.status).toBe(200);
    expect(db.getVariant(variant.id)).toBeNull();
  });

  it('404s when deleting an unknown variant', async () => {
    const res = await request(app)
      .delete('/api/admin/variants/99999999')
      .set('Authorization', adminHeader());

    expect(res.status).toBe(404);
  });
});
