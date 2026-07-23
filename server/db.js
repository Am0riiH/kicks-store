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
  const countStmt = _db.prepare('SELECT count(*) as count FROM products');
  countStmt.step();
  const { count } = countStmt.getAsObject();
  countStmt.free();

  if (count === 0) {
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

  // Check if we need to seed variants (either because it's a fresh DB or variants were missed)
  const varCountStmt = _db.prepare('SELECT count(*) as count FROM product_variants');
  varCountStmt.step();
  const varCount = varCountStmt.getAsObject().count;
  varCountStmt.free();

  // Get current product count, because 'count' might be 0 from before we seeded products
  const currentCountStmt = _db.prepare('SELECT count(*) as count FROM products');
  currentCountStmt.step();
  const currentProductCount = currentCountStmt.getAsObject().count;
  currentCountStmt.free();

  if (varCount === 0 && currentProductCount !== 0) {
    // If variants are empty but we have products, seed default variants
    console.log(`    Database      : seeding initial variants`);
    const allProds = _db.exec('SELECT id, colorway FROM products');
    if (allProds.length > 0) {
      const { columns, values } = allProds[0];
      const prodRows = values.map(row => {
        const obj = {};
        columns.forEach((col, i) => { obj[col] = row[i]; });
        return obj;
      });

      const sizes = ['8', '9', '10', '11', '12', '13'];
      for (const prod of prodRows) {
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
  }

  // Initial persist (creates the file if it doesn't exist yet)
  _persist();
}

// ── Disk persistence ──────────────────────────────────────────────────────────
// sql.js keeps the DB in memory. After every write we export it and write
// the binary to disk so data survives process restarts.
function _persist() {
  const data = _db.export();                 // Uint8Array of the SQLite binary
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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
    if (!_db) throw new Error('DB not initialised — call db.init() first');

    const existing = _getOrderById(session.id);
    if (existing) return { inserted: false, duplicate: true };

    _db.run(
      `INSERT INTO orders
         (id, status, amount_total, currency, customer_email, customer_name, items, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.payment_status ?? 'paid',
        session.amount_total   ?? 0,
        session.currency       ?? 'usd',
        session.customer_details?.email ?? null,
        session.customer_details?.name  ?? null,
        JSON.stringify(items),
        new Date().toISOString(),
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
    if (!_db) throw new Error('DB not initialised — call db.init() first');
    const row = _getOrderById(sessionId);
    if (!row) return null;
    return { ...row, items: JSON.parse(row.items ?? '[]') };
  },

  /**
   * Return all orders — for debugging / admin CLI.
   * @returns {Array}
   */
  getAllOrders() {
    if (!_db) throw new Error('DB not initialised — call db.init() first');
    const result = _db.exec('SELECT * FROM orders ORDER BY created_at DESC');
    if (!result.length) return [];
    const { columns, values } = result[0];
    return values.map(row => {
      const obj = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      obj.items = JSON.parse(obj.items ?? '[]');
      return obj;
    });
  },

  /**
   * Update the fulfillment status of an order.
   * @param {string} sessionId
   * @param {string} status ('pending', 'completed', 'rejected')
   * @returns {boolean} true if updated, false if order not found
   */
  updateOrderStatus(sessionId, status) {
    if (!_db) throw new Error('DB not initialised — call db.init() first');
    const stmt = _db.prepare('UPDATE orders SET fulfillment_status = ? WHERE id = ?');
    stmt.bind([status, sessionId]);
    stmt.step();
    stmt.free();
    
    // Check if any rows were modified
    const modified = _db.exec('SELECT changes() AS changed')[0].values[0][0];
    if (modified > 0) {
      _persist();
      return true;
    }
    return false;
  },

  // ── Products API ─────────────────────────────────────────────────────────────

  getAllProducts() {
    if (!_db) throw new Error('DB not initialised — call db.init() first');
    const result = _db.exec('SELECT * FROM products ORDER BY created_at DESC');
    if (!result.length) return [];
    const { columns, values } = result[0];
    return values.map(row => {
      const obj = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  },

  getProduct(id) {
    if (!_db) throw new Error('DB not initialised — call db.init() first');
    const result = _db.exec("SELECT * FROM products WHERE id = ?", [id]);
    if (!result.length) return null;
    const { columns, values } = result[0];
    const row = values[0];
    const obj = {};
    columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  },

  createProduct(data) {
    if (!_db) throw new Error('DB not initialised');
    _db.run(
      `INSERT INTO products (id, name, colorway, category, price, sku, tag, image, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.id, data.name, data.colorway, data.category, data.price,
        data.sku, data.tag, data.image, new Date().toISOString()
      ]
    );
    _persist();
    return data;
  },

  updateProduct(id, data) {
    if (!_db) throw new Error('DB not initialised');
    const stmt = _db.prepare(`
      UPDATE products 
      SET name = ?, colorway = ?, category = ?, price = ?, sku = ?, tag = ?, image = ?
      WHERE id = ?
    `);
    stmt.bind([
      data.name, data.colorway, data.category, data.price,
      data.sku, data.tag, data.image, id
    ]);
    stmt.step();
    stmt.free();
    
    const modified = _db.exec('SELECT changes() AS changed')[0].values[0][0];
    if (modified > 0) {
      _persist();
      return true;
    }
    return false;
  },

  deleteProduct(id) {
    if (!_db) throw new Error('DB not initialised');
    
    // Delete variants first (foreign key constraint might not be strictly enforced in this SQLite setup without PRAGMA foreign_keys = ON, but good practice)
    const varStmt = _db.prepare('DELETE FROM product_variants WHERE product_id = ?');
    varStmt.bind([id]);
    varStmt.step();
    varStmt.free();

    const stmt = _db.prepare('DELETE FROM products WHERE id = ?');
    stmt.bind([id]);
    stmt.step();
    stmt.free();

    const modified = _db.exec('SELECT changes() AS changed')[0].values[0][0];
    if (modified > 0) {
      _persist();
      return true;
    }
    return false;
  },

  // ── Product Variants API ───────────────────────────────────────────────────

  getVariantsForProduct(productId) {
    if (!_db) throw new Error('DB not initialised');
    const stmt = _db.prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY size ASC');
    stmt.bind([productId]);
    
    const variants = [];
    while (stmt.step()) {
      variants.push(stmt.getAsObject());
    }
    stmt.free();
    return variants;
  },

  getVariant(id) {
    if (!_db) throw new Error('DB not initialised');
    const stmt = _db.prepare('SELECT * FROM product_variants WHERE id = ?');
    stmt.bind([id]);
    let variant = null;
    if (stmt.step()) {
      variant = stmt.getAsObject();
    }
    stmt.free();
    return variant;
  },

  addVariant(data) {
    if (!_db) throw new Error('DB not initialised');
    _db.run(
      `INSERT INTO product_variants (product_id, size, color, quantity, sku)
       VALUES (?, ?, ?, ?, ?)`,
      [data.product_id, data.size, data.color, data.quantity || 0, data.sku || null]
    );
    _persist();
    // Fetch the inserted row (sqlite last_insert_rowid)
    const id = _db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
    return { ...data, id };
  },

  updateVariant(id, data) {
    if (!_db) throw new Error('DB not initialised');
    const stmt = _db.prepare(`
      UPDATE product_variants 
      SET size = ?, color = ?, quantity = ?, sku = ?
      WHERE id = ?
    `);
    stmt.bind([data.size, data.color, data.quantity, data.sku || null, id]);
    stmt.step();
    stmt.free();
    
    const modified = _db.exec('SELECT changes() AS changed')[0].values[0][0];
    if (modified > 0) {
      _persist();
      return true;
    }
    return false;
  },

  deleteVariant(id) {
    if (!_db) throw new Error('DB not initialised');
    const stmt = _db.prepare('DELETE FROM product_variants WHERE id = ?');
    stmt.bind([id]);
    stmt.step();
    stmt.free();

    const modified = _db.exec('SELECT changes() AS changed')[0].values[0][0];
    if (modified > 0) {
      _persist();
      return true;
    }
    return false;
  },

  decrementVariantQuantity(id, qty) {
    if (!_db) throw new Error('DB not initialised');
    
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
    
    const modified = _db.exec('SELECT changes() AS changed')[0].values[0][0];
    if (modified === 0) {
      // Stock was insufficient by the time webhook ran
      console.error(`    🚨 OVERSELL CONFLICT: Variant ${id} (${variant.product_id} - ${variant.color} - ${variant.size}) had ${variant.quantity} in stock, but order tried to deduct ${qty}. Manual review needed!`);
      return false;
    }
    
    _persist();
    return true;
  }
};
