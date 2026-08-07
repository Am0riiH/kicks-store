/**
 * server/db.js — SQLite database module (sql.js / pure WebAssembly)
 * ==================================================================
 * Uses sql.js instead of better-sqlite3 to avoid native compilation
 * (node-gyp / MSVC) on Windows. sql.js is a WebAssembly build of SQLite —
 * zero native dependencies, works everywhere Node.js runs.
 *
 * Trade-off vs better-sqlite3:
 *   • sql.js keeps the DB in memory; we flush to disk after every write.
 *     For this workload (one write per order) that's imperceptible.
 *   • On startup we load the file from disk into memory (if it exists).
 *   • If the process crashes between a write and the flush, the last write
 *     is lost. Acceptable for a small store; in production use better-sqlite3
 *     once the C++ build toolchain is available.
 *
 * Schema
 * ──────
 * orders
 *   id             TEXT  PRIMARY KEY  — Stripe session ID (cs_…)
 *   status         TEXT               — 'paid'
 *   amount_total   INTEGER            — in cents
 *   currency       TEXT
 *   customer_email TEXT               — NULL for guest checkouts
 *   customer_name  TEXT               — NULL for guest checkouts
 *   items          TEXT               — JSON array of line items
 *   created_at     TEXT               — ISO 8601 timestamp
 *
 * Idempotency: the PRIMARY KEY on `id` (Stripe session ID) makes duplicate
 * inserts detectable. upsertOrder() checks with SELECT before INSERT — if
 * the row already exists, it's a duplicate webhook delivery and we skip it.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// sql.js exposes an async init function that resolves to a SQL constructor.
// We wrap everything in an init promise so the rest of the module can call
// the db synchronously once it's ready.
const initSqlJs = require('sql.js');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');

// ── Module state — populated by init() ────────────────────────────────────────
let _db = null;   // the sql.js Database instance

/**
 * Open (or create) the SQLite database and run the schema migration.
 * Called once at server startup — await this before serving requests.
 */
async function init() {
  const SQL = await initSqlJs();

  // Load existing data from disk if the file exists, otherwise start empty
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(fileBuffer);
    console.log(`    Database      : loaded from ${DB_PATH}`);
  } else {
    _db = new SQL.Database();
    console.log(`    Database      : created new ${DB_PATH}`);
  }

  // ── Schema migration — safe to run repeatedly ─────────────────────────────
  _db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id             TEXT    NOT NULL PRIMARY KEY,
      status         TEXT    NOT NULL DEFAULT 'paid',
      amount_total   INTEGER NOT NULL,
      currency       TEXT    NOT NULL,
      customer_email TEXT,
      customer_name  TEXT,
      items          TEXT    NOT NULL DEFAULT '[]',
      created_at     TEXT    NOT NULL
    );
  `);

  // Add fulfillment_status column if it doesn't exist (safe migration)
  try {
    _db.run(`ALTER TABLE orders ADD COLUMN fulfillment_status TEXT NOT NULL DEFAULT 'pending';`);
  } catch (err) {
    // Ignore error if column already exists
  }

  // ── Shipping Details Migration ──────────────────────────────────────────────
  const tableInfoStmt = _db.prepare("PRAGMA table_info(orders)");
  const existingColumns = [];
  while (tableInfoStmt.step()) {
    existingColumns.push(tableInfoStmt.getAsObject().name);
  }
  tableInfoStmt.free();

  const requiredColumns = [
    'shipping_name', 'shipping_phone', 'shipping_line1', 'shipping_line2',
    'shipping_city', 'shipping_state', 'shipping_postal_code', 'shipping_country'
  ];

  for (const col of requiredColumns) {
    if (!existingColumns.includes(col)) {
      _db.run(`ALTER TABLE orders ADD COLUMN ${col} TEXT;`);
    }
  }

  // Create products table
  _db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id         TEXT NOT NULL PRIMARY KEY,
      name       TEXT NOT NULL,
      colorway   TEXT,
      category   TEXT NOT NULL,
      price      REAL NOT NULL,
      sku        TEXT NOT NULL,
      tag        TEXT,
      image      TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Newsletter subscribers. COLLATE NOCASE on the UNIQUE email means
  // "A@Example.com" and "a@example.com" are the same subscriber, so duplicate
  // signups are caught by the constraint rather than by ad-hoc normalising.
  _db.run(`
    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL
    );
  `);

  // Create product_variants table
  _db.run(`
    CREATE TABLE IF NOT EXISTS product_variants (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL,
      size       TEXT NOT NULL,
      color      TEXT NOT NULL,
      quantity   INTEGER NOT NULL DEFAULT 0,
      sku        TEXT,
      FOREIGN KEY(product_id) REFERENCES products(id)
    );
  `);

  // Seed products if empty
  if (_count('products') === 0) {
    console.log(`    Database      : seeding initial products`);
    const seedData = [
      { id: 'sk3-fire-red', name: 'Sneakers Retro 3', colorway: 'Fire Red', category: 'Mid-Top', price: 200, sku: 'SK3-MD-FRD-26', tag: 'New', image: 'https://images.unsplash.com/photo-1552346154-21d32810aba3?w=800&q=80' },
      { id: 'sk4-bred', name: 'Sneakers Retro 4', colorway: 'Bred Reimagined', category: 'Mid-Top', price: 210, sku: 'SK4-MD-BRD-26', tag: 'Restock', image: 'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=800&q=80' },
      { id: 'sk11-concord', name: 'Sneakers Retro 11', colorway: 'Concord', category: 'High-Top', price: 225, sku: 'SK11-HI-CON-26', tag: 'Limited', image: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800&q=80' },
      { id: 'sk1-chicago', name: 'Sneakers Classic High', colorway: 'Chicago', category: 'High-Top', price: 180, sku: 'SK1-HI-CHI-26', tag: 'Icon', image: 'https://images.unsplash.com/photo-1584735175315-9d5df23860e6?w=800&q=80' },
      { id: 'sk5-raging-bull', name: 'Sneakers Retro 5', colorway: 'Raging Bull', category: 'Mid-Top', price: 215, sku: 'SK5-MD-RGB-26', tag: 'Hyped', image: 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=800&q=80' },
      { id: 'sk1-low-volt', name: 'Sneakers Classic Low', colorway: 'Volt Strike', category: 'Low-Top', price: 140, sku: 'SK1-LO-VLT-26', tag: 'Exclusive', image: 'https://images.unsplash.com/photo-1595341888016-a392ef81b7de?w=800&q=80' }
    ];
    
    for (const p of seedData) {
      _db.run(
        `INSERT INTO products (id, name, colorway, category, price, sku, tag, image, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.id, p.name, p.colorway, p.category, p.price, p.sku, p.tag, p.image, new Date().toISOString()]
      );
    }
  }

  // Seed variants when they are missing but products exist — either a fresh
  // database, or one where the variant seed was skipped. Re-counting products
  // matters: the count above was taken before the seed block ran.
  if (_count('product_variants') === 0 && _count('products') !== 0) {
    console.log(`    Database      : seeding initial variants`);

    const sizes = ['8', '9', '10', '11', '12', '13'];
    for (const prod of _rows('SELECT id, colorway FROM products')) {
      const color = prod.colorway || 'Standard';
      for (const size of sizes) {
        _db.run(
          `INSERT INTO product_variants (product_id, size, color, quantity)
           VALUES (?, ?, ?, ?)`,
          [prod.id, size, color, 5] // default quantity of 5
        );
      }
    }
  }

  // Initial persist (creates the file if it doesn't exist yet)
  _persist();
}

/* sql.js accepts null but throws on undefined ("Wrong API use : tried to bind a
   value of an unknown type"). Every positional bind goes through this so an
   absent field surfaces as a real SQLite constraint error instead. */
function _bind(value) {
  return value === undefined ? null : value;
}

// ── Disk persistence ──────────────────────────────────────────────────────────
// sql.js keeps the DB in memory. After every write we export it and write
// the binary to disk so data survives process restarts.
function _persist() {
  const data = _db.export();                 // Uint8Array of the SQLite binary
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/* Every exported function opened with this guard, in two different wordings.
   One helper keeps the message consistent and the intent obvious. */
function _assertReady() {
  if (!_db) throw new Error('DB not initialised — call db.init() first');
}

/* sql.js exec() returns [{ columns, values }] with values as positional arrays.
   Turning that into plain objects was open-coded in six places. */
function _rows(sql, params) {
  const result = params === undefined ? _db.exec(sql) : _db.exec(sql, params);
  if (!result.length) return [];
  const { columns, values } = result[0];
  return values.map((row) => {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

/* Row count for a table. Only ever called with literal table names from init(). */
function _count(table) {
  return _rows(`SELECT count(*) AS count FROM ${table}`)[0].count;
}

/* Rows affected by the statement that just ran. Read after a write to tell
   "updated" from "no such row" — the pattern behind every boolean this module
   returns from an UPDATE or DELETE. */
function _changed() {
  return _db.exec('SELECT changes() AS changed')[0].values[0][0];
}

/* Runs a mutation, persists only when it actually changed something, and
   reports whether it did. The `if (modified > 0) { _persist(); return true; }
   return false;` tail was repeated after every update and delete. */
function _persistIfChanged() {
  if (_changed() > 0) {
    _persist();
    return true;
  }
  return false;
}

function _getOrderById(sessionId) {
  const stmt  = _db.prepare('SELECT * FROM orders WHERE id = ?');
  stmt.bind([sessionId]);
  // step() returns true if a row was found, false if no rows
  const found = stmt.step();
  if (!found) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject();
  stmt.free();
  return row;
}

// ── Public API ────────────────────────────────────────────────────────────────

module.exports = {
  init,

  /**
   * Persist a completed Stripe checkout session as an order.
   *
   * @param {object} session  — the Stripe CheckoutSession object from the webhook
   * @param {Array}  items    — line items from stripe.checkout.sessions.listLineItems()
   * @returns {{ inserted: boolean, duplicate: boolean }}
   */
  upsertOrder(session, items = []) {
    _assertReady();

    const existing = _getOrderById(session.id);
    if (existing) return { inserted: false, duplicate: true };

    const shipping = session.shipping_details || {};
    const address = shipping.address || {};
    const shippingName = shipping.name || null;
    const shippingPhone = session.customer_details?.phone || null;

    _db.run(
      `INSERT INTO orders
         (id, status, amount_total, currency, customer_email, customer_name, items, created_at,
          shipping_name, shipping_phone, shipping_line1, shipping_line2, shipping_city, shipping_state, shipping_postal_code, shipping_country)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.payment_status ?? 'paid',
        session.amount_total   ?? 0,
        session.currency       ?? 'usd',
        session.customer_details?.email ?? null,
        session.customer_details?.name  ?? null,
        JSON.stringify(items),
        new Date().toISOString(),
        shippingName,
        shippingPhone,
        address.line1 ?? null,
        address.line2 ?? null,
        address.city ?? null,
        address.state ?? null,
        address.postal_code ?? null,
        address.country ?? null
      ]
    );

    _persist();   // flush to disk

    return { inserted: true, duplicate: false };
  },

  /**
   * Find an order by Stripe session ID.
   * Parses items JSON string back to an Array.
   *
   * @param {string} sessionId
   * @returns {object|null}
   */
  getOrder(sessionId) {
    _assertReady();
    const row = _getOrderById(sessionId);
    if (!row) return null;
    return { ...row, items: JSON.parse(row.items ?? '[]') };
  },

  /**
   * Return all orders — for debugging / admin CLI.
   * @returns {Array}
   */
  getAllOrders() {
    _assertReady();
    return _rows('SELECT * FROM orders ORDER BY created_at DESC').map((order) => ({
      ...order,
      items: JSON.parse(order.items ?? '[]'),
    }));
  },

  /**
   * Update the fulfillment status of an order.
   * @param {string} sessionId
   * @param {string} status ('pending', 'completed', 'rejected')
   * @returns {boolean} true if updated, false if order not found
   */
  updateOrderStatus(sessionId, status) {
    _assertReady();
    const stmt = _db.prepare('UPDATE orders SET fulfillment_status = ? WHERE id = ?');
    stmt.bind([status, sessionId]);
    stmt.step();
    stmt.free();

    return _persistIfChanged();
  },

  // ── Products API ─────────────────────────────────────────────────────────────

  getAllProducts() {
    _assertReady();
    return _rows('SELECT * FROM products ORDER BY created_at DESC');
  },

  getProduct(id) {
    _assertReady();
    return _rows('SELECT * FROM products WHERE id = ?', [id])[0] ?? null;
  },

  createProduct(data) {
    _assertReady();
    _db.run(
      `INSERT INTO products (id, name, colorway, category, price, sku, tag, image, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        // sql.js cannot bind `undefined` — it throws "Wrong API use: tried to
        // bind a value of an unknown type" before SQLite ever sees the row.
        // Coercing to null lets the real constraint speak instead, so a genuinely
        // missing NOT NULL field reports "NOT NULL constraint failed: products.sku"
        // rather than an opaque binding error.
        _bind(data.id), _bind(data.name), _bind(data.colorway), _bind(data.category),
        _bind(data.price), _bind(data.sku), _bind(data.tag), _bind(data.image),
        new Date().toISOString()
      ]
    );
    _persist();
    return data;
  },

  updateProduct(id, data) {
    _assertReady();

    // The PUT route validates with productSchema.partial(), so any field may be
    // absent. Merge onto the stored row first — otherwise a legitimate partial
    // update (say, price only) would bind undefined for every other column and
    // blow up, or blank out data that the caller never intended to touch.
    const existing = this.getProduct(id);
    if (!existing) return false;

    const merged = { ...existing };
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) merged[key] = value;
    }

    const stmt = _db.prepare(`
      UPDATE products
      SET name = ?, colorway = ?, category = ?, price = ?, sku = ?, tag = ?, image = ?
      WHERE id = ?
    `);
    stmt.bind([
      _bind(merged.name), _bind(merged.colorway), _bind(merged.category), _bind(merged.price),
      _bind(merged.sku), _bind(merged.tag), _bind(merged.image), id
    ]);
    stmt.step();
    stmt.free();

    return _persistIfChanged();
  },

  deleteProduct(id) {
    _assertReady();
    
    // Delete variants first (foreign key constraint might not be strictly enforced in this SQLite setup without PRAGMA foreign_keys = ON, but good practice)
    const varStmt = _db.prepare('DELETE FROM product_variants WHERE product_id = ?');
    varStmt.bind([id]);
    varStmt.step();
    varStmt.free();

    const stmt = _db.prepare('DELETE FROM products WHERE id = ?');
    stmt.bind([id]);
    stmt.step();
    stmt.free();

    return _persistIfChanged();
  },

  // ── Newsletter API ───────────────────────────────────────────────────────────

  /**
   * Record a newsletter signup.
   *
   * Duplicates are a normal, expected outcome — people re-submit forms — so the
   * UNIQUE constraint is caught and reported rather than thrown. The caller can
   * then answer "you're already on the list" instead of showing an error.
   *
   * @param {string} email
   * @returns {{ created: boolean }}
   */
  addSubscriber(email) {
    _assertReady();
    try {
      _db.run(
        'INSERT INTO newsletter_subscribers (email, created_at) VALUES (?, ?)',
        [_bind(email), new Date().toISOString()]
      );
    } catch (err) {
      if (/UNIQUE constraint failed/i.test(err.message)) return { created: false };
      throw err;
    }
    _persist();
    return { created: true };
  },

  getSubscribers() {
    _assertReady();
    return _rows('SELECT * FROM newsletter_subscribers ORDER BY created_at DESC');
  },

  // ── Product Variants API ───────────────────────────────────────────────────

  getVariantsForProduct(productId) {
    _assertReady();
    // NB: size is TEXT, so ASC orders lexicographically — 10, 11, 12, 13, 8, 9.
    return _rows(
      'SELECT * FROM product_variants WHERE product_id = ? ORDER BY size ASC',
      [productId]
    );
  },

  /**
   * Every product with its variants embedded, in TWO queries total rather than
   * 1-per-product. The storefront previously fetched /api/products and then one
   * /api/products/:id/variants per card, so a 8-product page cost 9 round trips.
   *
   * @returns {Array} products, each with a `variants` array (possibly empty)
   */
  getAllProductsWithVariants() {
    _assertReady();
    const products = this.getAllProducts();
    if (!products.length) return products;

    const byProduct = new Map();
    for (const variant of _rows('SELECT * FROM product_variants ORDER BY size ASC')) {
      if (!byProduct.has(variant.product_id)) byProduct.set(variant.product_id, []);
      byProduct.get(variant.product_id).push(variant);
    }

    return products.map((p) => ({ ...p, variants: byProduct.get(p.id) || [] }));
  },

  getVariant(id) {
    _assertReady();
    return _rows('SELECT * FROM product_variants WHERE id = ?', [id])[0] ?? null;
  },

  addVariant(data) {
    _assertReady();
    _db.run(
      `INSERT INTO product_variants (product_id, size, color, quantity, sku)
       VALUES (?, ?, ?, ?, ?)`,
      [data.product_id, data.size, data.color, data.quantity || 0, data.sku || null]
    );

    // Read the new row id BEFORE persisting. _persist() calls _db.export(),
    // which sql.js implements by closing and reopening the database handle —
    // and last_insert_rowid() is per-connection state, so it reports 0 on the
    // reopened handle. Reading it after _persist() returned 0 for every insert.
    const id = _db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];

    _persist();

    return { ...data, id };
  },

  updateVariant(id, data) {
    _assertReady();
    const stmt = _db.prepare(`
      UPDATE product_variants 
      SET size = ?, color = ?, quantity = ?, sku = ?
      WHERE id = ?
    `);
    stmt.bind([data.size, data.color, data.quantity, data.sku || null, id]);
    stmt.step();
    stmt.free();
    
    return _persistIfChanged();
  },

  deleteVariant(id) {
    _assertReady();
    const stmt = _db.prepare('DELETE FROM product_variants WHERE id = ?');
    stmt.bind([id]);
    stmt.step();
    stmt.free();

    return _persistIfChanged();
  },

  decrementVariantQuantity(id, qty) {
    _assertReady();
    
    // First fetch current state for logging purposes
    const stmt = _db.prepare('SELECT quantity, product_id, size, color FROM product_variants WHERE id = ?');
    stmt.bind([id]);
    
    let variant = null;
    if (stmt.step()) {
      variant = stmt.getAsObject();
    }
    stmt.free();

    if (!variant) {
      console.warn(`    ⚠️  Variant ${id} not found when trying to decrement stock.`);
      return false;
    }

    // STRICT DATABASE-LEVEL GUARD: Update only succeeds if quantity >= requested
    const updateStmt = _db.prepare('UPDATE product_variants SET quantity = quantity - ? WHERE id = ? AND quantity >= ?');
    updateStmt.bind([qty, id, qty]);
    updateStmt.step();
    updateStmt.free();
    
    // Not _persistIfChanged(): a no-op here means the guard rejected the
    // decrement, which is an oversell worth shouting about rather than a
    // routine "no such row".
    if (_changed() === 0) {
      console.error(`    🚨 OVERSELL CONFLICT: Variant ${id} (${variant.product_id} - ${variant.color} - ${variant.size}) had ${variant.quantity} in stock, but order tried to deduct ${qty}. Manual review needed!`);
      return false;
    }

    _persist();
    return true;
  }
};
