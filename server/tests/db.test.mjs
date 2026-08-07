/**
 * Unit tests for server/db.js.
 *
 * Only functions with real logic are covered — branching, merging, guards.
 * Pure `SELECT * → map rows` passthroughs (getAllProducts, getSubscribers,
 * getAllOrders) are exercised incidentally through the route tests instead.
 */
import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import { loadApp } from './helpers.mjs';

let db;

beforeAll(async () => {
  ({ db } = await loadApp());
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Unique ids keep tests order-independent — one seeded DB serves the whole file. */
const uid = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

/** The row as actually stored, for asserting DB-applied defaults. */
function storedVariant(id) {
  return db.getVariant(id);
}

function makeProduct(over = {}) {
  return {
    id: uid('prod'),
    name: 'Test Shoe',
    colorway: 'Black/Red',
    category: 'High-Top',
    price: 199.99,
    sku: uid('SKU'),
    tag: null,
    image: 'https://example.com/shoe.png',
    ...over,
  };
}

describe('seeding', () => {
  it('seeds 6 products and 6 variants each on a fresh database', () => {
    const products = db.getAllProductsWithVariants();

    // Other tests in this file add products, so assert on the known seed ids.
    const seeded = products.filter((p) =>
      ['sk3-fire-red', 'sk4-bred', 'sk11-concord', 'sk1-chicago', 'sk5-raging-bull', 'sk1-low-volt']
        .includes(p.id)
    );

    expect(seeded).toHaveLength(6);
    expect(seeded.every((p) => p.variants.length === 6)).toBe(true);
    expect(seeded.every((p) => p.variants.every((v) => v.quantity === 5))).toBe(true);
  });
});

describe('createProduct', () => {
  it('inserts a row and stamps created_at', () => {
    const product = makeProduct();
    db.createProduct(product);

    const stored = db.getProduct(product.id);
    expect(stored.name).toBe('Test Shoe');
    expect(stored.price).toBe(199.99);
    expect(stored.created_at).toBeTruthy();
    expect(() => new Date(stored.created_at).toISOString()).not.toThrow();
  });

  it('returns the input object, not the stored row (no created_at)', () => {
    const product = makeProduct();
    const returned = db.createProduct(product);

    // Why this matters: POST /api/admin/products echoes this straight back as
    // the 201 body, so the response omits created_at by design.
    expect(returned).toBe(product);
    expect(returned).not.toHaveProperty('created_at');
  });

  it('coerces undefined to null so SQLite reports the real constraint', () => {
    // sql.js throws "Wrong API use" on undefined before SQLite sees the row.
    // _bind() converts it to null so the NOT NULL constraint speaks instead.
    const product = makeProduct({ sku: undefined });

    expect(() => db.createProduct(product)).toThrow(/NOT NULL constraint failed/i);
  });

  it('rejects a duplicate id', () => {
    const product = makeProduct();
    db.createProduct(product);

    expect(() => db.createProduct(product)).toThrow(/UNIQUE constraint failed/i);
  });
});

describe('updateProduct', () => {
  it('merges a partial update onto the stored row', () => {
    const product = makeProduct({ price: 100, name: 'Original', tag: 'HOT' });
    db.createProduct(product);

    expect(db.updateProduct(product.id, { price: 250 })).toBe(true);

    const stored = db.getProduct(product.id);
    expect(stored.price).toBe(250);
    // Untouched fields survive — this is what stops a price-only edit blanking
    // the rest of the row.
    expect(stored.name).toBe('Original');
    expect(stored.tag).toBe('HOT');
    expect(stored.colorway).toBe('Black/Red');
  });

  it('ignores explicit undefined values rather than nulling the column', () => {
    const product = makeProduct({ tag: 'LIMITED' });
    db.createProduct(product);

    db.updateProduct(product.id, { name: 'Renamed', tag: undefined });

    const stored = db.getProduct(product.id);
    expect(stored.name).toBe('Renamed');
    expect(stored.tag).toBe('LIMITED');
  });

  it('cannot change the id', () => {
    const product = makeProduct();
    db.createProduct(product);

    db.updateProduct(product.id, { id: 'hijacked', name: 'Renamed' });

    expect(db.getProduct(product.id).name).toBe('Renamed');
    expect(db.getProduct('hijacked')).toBeNull();
  });

  it('returns false for an unknown id and writes nothing', () => {
    expect(db.updateProduct('no-such-product', { price: 1 })).toBe(false);
  });
});

describe('deleteProduct', () => {
  it('deletes the product and cascades to its variants', () => {
    const product = makeProduct();
    db.createProduct(product);
    db.addVariant({ product_id: product.id, size: '10', color: 'Black', quantity: 3 });
    db.addVariant({ product_id: product.id, size: '11', color: 'Black', quantity: 4 });

    expect(db.getVariantsForProduct(product.id)).toHaveLength(2);

    expect(db.deleteProduct(product.id)).toBe(true);
    expect(db.getProduct(product.id)).toBeNull();
    expect(db.getVariantsForProduct(product.id)).toHaveLength(0);
  });

  it('returns false for an unknown id', () => {
    expect(db.deleteProduct('never-existed')).toBe(false);
  });
});

describe('addSubscriber', () => {
  it('creates a new subscriber', () => {
    const email = `${uid('sub')}@example.com`;
    expect(db.addSubscriber(email)).toEqual({ created: true });
  });

  it('reports a duplicate instead of throwing', () => {
    const email = `${uid('sub')}@example.com`;
    db.addSubscriber(email);

    expect(db.addSubscriber(email)).toEqual({ created: false });
  });

  it('treats differing case as the same subscriber (UNIQUE COLLATE NOCASE)', () => {
    const email = `${uid('sub')}@example.com`;
    db.addSubscriber(email.toLowerCase());

    expect(db.addSubscriber(email.toUpperCase())).toEqual({ created: false });
  });

  it('re-throws errors that are not the UNIQUE constraint', () => {
    expect(() => db.addSubscriber(undefined)).toThrow(/NOT NULL constraint failed/i);
  });
});

describe('upsertOrder', () => {
  const session = (over = {}) => ({
    id: uid('cs_test'),
    amount_total: 21000,
    currency: 'usd',
    payment_status: 'paid',
    customer_details: { email: 'a@b.com', name: 'A B', phone: '+15551112222' },
    shipping_details: {
      name: 'A B',
      address: {
        line1: '1 Road', line2: null, city: 'Town',
        state: 'CA', postal_code: '90210', country: 'US',
      },
    },
    ...over,
  });

  it('inserts an order with shipping details flattened onto the row', () => {
    const s = session();
    expect(db.upsertOrder(s, [{ description: 'Shoe', quantity: 1 }]))
      .toEqual({ inserted: true, duplicate: false });

    const order = db.getOrder(s.id);
    expect(order.amount_total).toBe(21000);
    expect(order.customer_email).toBe('a@b.com');
    expect(order.shipping_city).toBe('Town');
    expect(order.shipping_postal_code).toBe('90210');
    // Phone comes from customer_details, not shipping_details.
    expect(order.shipping_phone).toBe('+15551112222');
    expect(order.items).toEqual([{ description: 'Shoe', quantity: 1 }]);
  });

  it('defaults fulfillment_status to pending', () => {
    const s = session();
    db.upsertOrder(s);

    expect(db.getOrder(s.id).fulfillment_status).toBe('pending');
  });

  it('is idempotent — a replayed session is reported as a duplicate', () => {
    const s = session();
    db.upsertOrder(s, [{ description: 'First' }]);

    const second = db.upsertOrder(s, [{ description: 'Second' }]);

    expect(second).toEqual({ inserted: false, duplicate: true });
    // The original row is untouched, not overwritten.
    expect(db.getOrder(s.id).items).toEqual([{ description: 'First' }]);
  });

  it('falls back to defaults when Stripe omits optional fields', () => {
    const s = { id: uid('cs_test') };
    db.upsertOrder(s);

    const order = db.getOrder(s.id);
    expect(order.status).toBe('paid');
    expect(order.amount_total).toBe(0);
    expect(order.currency).toBe('usd');
    expect(order.customer_email).toBeNull();
    expect(order.shipping_line1).toBeNull();
    expect(order.items).toEqual([]);
  });

  it('getOrder returns null for an unknown session', () => {
    expect(db.getOrder('cs_test_nope')).toBeNull();
  });
});

describe('updateOrderStatus', () => {
  it('updates fulfillment_status and reports success', () => {
    const id = uid('cs_test');
    db.upsertOrder({ id });

    expect(db.updateOrderStatus(id, 'completed')).toBe(true);
    expect(db.getOrder(id).fulfillment_status).toBe('completed');
  });

  it('returns false for an unknown order', () => {
    expect(db.updateOrderStatus('cs_test_missing', 'completed')).toBe(false);
  });
});

describe('addVariant', () => {
  it('inserts the row with the supplied values', () => {
    const product = makeProduct();
    db.createProduct(product);

    const created = db.addVariant({
      product_id: product.id, size: '10', color: 'Red', quantity: 7, sku: 'V-1',
    });

    expect(storedVariant(created.id)).toMatchObject({
      product_id: product.id, size: '10', color: 'Red', quantity: 7, sku: 'V-1',
    });
  });

  it('defaults quantity to 0 and sku to null', () => {
    const product = makeProduct();
    db.createProduct(product);

    const created = db.addVariant({ product_id: product.id, size: '9', color: 'Blue' });

    const stored = storedVariant(created.id);
    expect(stored.quantity).toBe(0);
    expect(stored.sku).toBeNull();
  });

  // Regression: addVariant used to return id 0 for every insert, because
  // _persist() ran before the last_insert_rowid() read. _persist() calls
  // _db.export(), which sql.js implements by closing and reopening the handle,
  // and last_insert_rowid() is per-connection state — so the reopened handle
  // always reported 0. POST /api/admin/products/:id/variants echoed that 0
  // straight back to the admin UI.
  it('returns the real row id, matching a fresh lookup of that row', () => {
    const product = makeProduct();
    db.createProduct(product);

    const created = db.addVariant({
      product_id: product.id, size: '10', color: 'Red', quantity: 1, sku: 'REAL-ID',
    });

    // Not merely non-zero: it must address the row that was just written.
    const found = db.getVariant(created.id);
    expect(found).not.toBeNull();
    expect(found.id).toBe(created.id);
    expect(found.sku).toBe('REAL-ID');

    // And it must agree with the row the product query returns.
    const [viaProduct] = db.getVariantsForProduct(product.id);
    expect(created.id).toBe(viaProduct.id);
  });

  it('returns a distinct, ascending id for each insert', () => {
    const product = makeProduct();
    db.createProduct(product);

    const first = db.addVariant({ product_id: product.id, size: '9', color: 'Red', quantity: 1 });
    const second = db.addVariant({ product_id: product.id, size: '10', color: 'Red', quantity: 1 });

    expect(second.id).toBeGreaterThan(first.id);
    expect(db.getVariant(first.id).size).toBe('9');
    expect(db.getVariant(second.id).size).toBe('10');
  });

  it('survives the export/reopen cycle — the id is still correct after persisting', () => {
    const product = makeProduct();
    db.createProduct(product);

    // Several inserts in a row: each one triggers an export()/reopen, so a
    // regression here would show up as 0 or a stale id on every call but the
    // first.
    const ids = ['8', '9', '10', '11'].map((size) =>
      db.addVariant({ product_id: product.id, size, color: 'Red', quantity: 2 }).id
    );

    expect(new Set(ids).size).toBe(4);
    for (const id of ids) {
      expect(db.getVariant(id)).not.toBeNull();
    }
  });
});

describe('getVariant', () => {
  it('finds a variant by numeric id', () => {
    const product = makeProduct();
    db.createProduct(product);
    const created = db.addVariant({
      product_id: product.id, size: '10', color: 'Red', quantity: 7,
    });

    expect(db.getVariant(created.id)).toMatchObject({
      product_id: product.id, size: '10', color: 'Red', quantity: 7,
    });
  });

  it('finds the same variant given a string id', () => {
    const product = makeProduct();
    db.createProduct(product);
    const created = db.addVariant({
      product_id: product.id, size: '11', color: 'Blue', quantity: 2,
    });

    // The checkout schema accepts string | number, so column affinity must
    // resolve '12' to 12. If this ever regressed, checkout would 400 on
    // every request from the real frontend.
    expect(db.getVariant(String(created.id))).toMatchObject({ id: created.id });
  });

  it('returns null for an unknown id', () => {
    expect(db.getVariant(99999999)).toBeNull();
  });
});

describe('decrementVariantQuantity', () => {
  const withStock = (quantity) => {
    const product = makeProduct();
    db.createProduct(product);
    return db.addVariant({ product_id: product.id, size: '10', color: 'Red', quantity });
  };

  it('decrements when there is enough stock', () => {
    const v = withStock(5);

    expect(db.decrementVariantQuantity(v.id, 3)).toBe(true);
    expect(db.getVariant(v.id).quantity).toBe(2);
  });

  it('allows draining stock to exactly zero', () => {
    const v = withStock(2);

    expect(db.decrementVariantQuantity(v.id, 2)).toBe(true);
    expect(db.getVariant(v.id).quantity).toBe(0);
  });

  it('refuses to oversell and leaves stock untouched', () => {
    const v = withStock(2);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(db.decrementVariantQuantity(v.id, 3)).toBe(false);
    expect(db.getVariant(v.id).quantity).toBe(2);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('OVERSELL CONFLICT'));
  });

  it('returns false for an unknown variant', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(db.decrementVariantQuantity(88888888, 1)).toBe(false);
    expect(spy).toHaveBeenCalled();
  });
});

describe('getAllProductsWithVariants', () => {
  it('groups variants under their product in a single pass', () => {
    const product = makeProduct();
    db.createProduct(product);
    db.addVariant({ product_id: product.id, size: '9', color: 'Red', quantity: 1 });
    db.addVariant({ product_id: product.id, size: '10', color: 'Red', quantity: 2 });

    const found = db.getAllProductsWithVariants().find((p) => p.id === product.id);

    expect(found.variants).toHaveLength(2);
    expect(found.variants.every((v) => v.product_id === product.id)).toBe(true);
  });

  it('gives a product with no variants an empty array, not undefined', () => {
    const product = makeProduct();
    db.createProduct(product);

    const found = db.getAllProductsWithVariants().find((p) => p.id === product.id);

    expect(found.variants).toEqual([]);
  });
});

describe('updateVariant', () => {
  it('updates a variant when every field is supplied', () => {
    const product = makeProduct();
    db.createProduct(product);
    const v = db.addVariant({ product_id: product.id, size: '10', color: 'Red', quantity: 5 });

    expect(db.updateVariant(v.id, { size: '10', color: 'Red', quantity: 9, sku: 'X' })).toBe(true);
    expect(db.getVariant(v.id).quantity).toBe(9);
  });

  // ── BUG (documented, not fixed) ────────────────────────────────────────────
  // PUT /api/admin/variants/:id validates with variantSchema.partial(), so a
  // body of { quantity: 3 } is accepted by the route — but updateVariant binds
  // data.size and data.color raw, with no _bind() coercion and no merge against
  // the existing row (contrast updateProduct above, which does both). sql.js
  // rejects the undefined bind before SQLite sees it.
  //
  // Fix would be to mirror updateProduct: read the row, merge only defined
  // values, bind through _bind().
  it('BUG: throws on a partial update instead of merging', () => {
    const product = makeProduct();
    db.createProduct(product);
    const v = db.addVariant({ product_id: product.id, size: '10', color: 'Red', quantity: 5 });

    expect(() => db.updateVariant(v.id, { quantity: 3 })).toThrow(/Wrong API use/i);
    expect(db.getVariant(v.id).quantity).toBe(5);
  });

  it('BUG: silently blanks sku when the field is omitted', () => {
    const product = makeProduct();
    db.createProduct(product);
    const v = db.addVariant({
      product_id: product.id, size: '10', color: 'Red', quantity: 5, sku: 'KEEP-ME',
    });

    db.updateVariant(v.id, { size: '10', color: 'Red', quantity: 5 });

    expect(db.getVariant(v.id).sku).toBeNull();
  });
});

describe('deleteVariant', () => {
  it('deletes an existing variant', () => {
    const product = makeProduct();
    db.createProduct(product);
    const v = db.addVariant({ product_id: product.id, size: '10', color: 'Red', quantity: 1 });

    expect(db.deleteVariant(v.id)).toBe(true);
    expect(db.getVariant(v.id)).toBeNull();
  });

  it('returns false for an unknown variant', () => {
    expect(db.deleteVariant(77777777)).toBe(false);
  });
});
