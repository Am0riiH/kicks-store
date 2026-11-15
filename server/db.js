'use strict';

const fs = require('fs');
const path = require('path');

// sql.js (SQLite compiled to WebAssembly) keeps the database in memory;
// the file on disk is rewritten after every change.
const initSqlJs = require('sql.js');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');

let _db = null;

async function init() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(fileBuffer);
    console.log(`Database: loaded from ${DB_PATH}`);
  } else {
    _db = new SQL.Database();
    console.log(`Database: created new ${DB_PATH}`);
  }

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
    _db.run(
      `ALTER TABLE orders ADD COLUMN fulfillment_status TEXT NOT NULL DEFAULT 'pending';`
    );
  } catch {
    // the column already exists
  }

  const tableInfoStmt = _db.prepare('PRAGMA table_info(orders)');
  const existingColumns = [];
  while (tableInfoStmt.step()) {
    existingColumns.push(tableInfoStmt.getAsObject().name);
  }
  tableInfoStmt.free();

  const requiredColumns = [
    'shipping_name',
    'shipping_phone',
    'shipping_line1',
    'shipping_line2',
    'shipping_city',
    'shipping_state',
    'shipping_postal_code',
    'shipping_country',
  ];

  for (const col of requiredColumns) {
    if (!existingColumns.includes(col)) {
      _db.run(`ALTER TABLE orders ADD COLUMN ${col} TEXT;`);
    }
  }

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

  _db.run(`
    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at TEXT NOT NULL
    );
  `);

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

  if (_count('products') === 0) {
    console.log(`Database: seeding initial products`);
    const seedData = [
      {
        id: 'sk3-fire-red',
        name: 'Sneakers Retro 3',
        colorway: 'Fire Red',
        category: 'Mid-Top',
        price: 200,
        sku: 'SK3-MD-FRD-26',
        tag: 'New',
        image: 'https://images.unsplash.com/photo-1552346154-21d32810aba3?w=800&q=80',
      },
      {
        id: 'sk4-bred',
        name: 'Sneakers Retro 4',
        colorway: 'Bred Reimagined',
        category: 'Mid-Top',
        price: 210,
        sku: 'SK4-MD-BRD-26',
        tag: 'Restock',
        image: 'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=800&q=80',
      },
      {
        id: 'sk11-concord',
        name: 'Sneakers Retro 11',
        colorway: 'Concord',
        category: 'High-Top',
        price: 225,
        sku: 'SK11-HI-CON-26',
        tag: 'Limited',
        image: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800&q=80',
      },
      {
        id: 'sk1-chicago',
        name: 'Sneakers Classic High',
        colorway: 'Chicago',
        category: 'High-Top',
        price: 180,
        sku: 'SK1-HI-CHI-26',
        tag: 'Icon',
        image: 'https://images.unsplash.com/photo-1584735175315-9d5df23860e6?w=800&q=80',
      },
      {
        id: 'sk5-raging-bull',
        name: 'Sneakers Retro 5',
        colorway: 'Raging Bull',
        category: 'Mid-Top',
        price: 215,
        sku: 'SK5-MD-RGB-26',
        tag: 'Hyped',
        image: 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=800&q=80',
      },
      {
        id: 'sk1-low-volt',
        name: 'Sneakers Classic Low',
        colorway: 'Volt Strike',
        category: 'Low-Top',
        price: 140,
        sku: 'SK1-LO-VLT-26',
        tag: 'Exclusive',
        image: 'https://images.unsplash.com/photo-1595341888016-a392ef81b7de?w=800&q=80',
      },
    ];

    for (const p of seedData) {
      _db.run(
        `INSERT INTO products (id, name, colorway, category, price, sku, tag, image, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.id,
          p.name,
          p.colorway,
          p.category,
          p.price,
          p.sku,
          p.tag,
          p.image,
          new Date().toISOString(),
        ]
      );
    }
  }

  if (_count('product_variants') === 0 && _count('products') !== 0) {
    console.log(`Database: seeding initial variants`);

    const sizes = ['8', '9', '10', '11', '12', '13'];
    for (const prod of _rows('SELECT id, colorway FROM products')) {
      const color = prod.colorway || 'Standard';
      for (const size of sizes) {
        _db.run(
          `INSERT INTO product_variants (product_id, size, color, quantity)
           VALUES (?, ?, ?, ?)`,
          [prod.id, size, color, 5]
        );
      }
    }
  }

  _persist();
}

// sql.js throws on undefined, so absent values are bound as null.
function _bind(value) {
  return value === undefined ? null : value;
}

function _persist() {
  const data = _db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function _assertReady() {
  if (!_db) throw new Error('DB not initialised — call db.init() first');
}

function _rows(sql, params) {
  const result = params === undefined ? _db.exec(sql) : _db.exec(sql, params);
  if (!result.length) return [];
  const { columns, values } = result[0];
  return values.map((row) => {
    const obj = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
}

function _count(table) {
  return _rows(`SELECT count(*) AS count FROM ${table}`)[0].count;
}

function _changed() {
  return _db.exec('SELECT changes() AS changed')[0].values[0][0];
}

function _persistIfChanged() {
  if (_changed() > 0) {
    _persist();
    return true;
  }
  return false;
}

function _getOrderById(sessionId) {
  const stmt = _db.prepare('SELECT * FROM orders WHERE id = ?');
  stmt.bind([sessionId]);

  const found = stmt.step();
  if (!found) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject();
  stmt.free();
  return row;
}

module.exports = {
  init,

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
        session.amount_total ?? 0,
        session.currency ?? 'usd',
        session.customer_details?.email ?? null,
        session.customer_details?.name ?? null,
        JSON.stringify(items),
        new Date().toISOString(),
        shippingName,
        shippingPhone,
        address.line1 ?? null,
        address.line2 ?? null,
        address.city ?? null,
        address.state ?? null,
        address.postal_code ?? null,
        address.country ?? null,
      ]
    );

    _persist();

    return { inserted: true, duplicate: false };
  },

  getOrder(sessionId) {
    _assertReady();
    const row = _getOrderById(sessionId);
    if (!row) return null;
    return { ...row, items: JSON.parse(row.items ?? '[]') };
  },

  getAllOrders() {
    _assertReady();
    return _rows('SELECT * FROM orders ORDER BY created_at DESC').map((order) => ({
      ...order,
      items: JSON.parse(order.items ?? '[]'),
    }));
  },

  updateOrderStatus(sessionId, status) {
    _assertReady();
    const stmt = _db.prepare('UPDATE orders SET fulfillment_status = ? WHERE id = ?');
    stmt.bind([status, sessionId]);
    stmt.step();
    stmt.free();

    return _persistIfChanged();
  },

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
        _bind(data.id),
        _bind(data.name),
        _bind(data.colorway),
        _bind(data.category),
        _bind(data.price),
        _bind(data.sku),
        _bind(data.tag),
        _bind(data.image),
        new Date().toISOString(),
      ]
    );
    _persist();
    return data;
  },

  updateProduct(id, data) {
    _assertReady();

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
      _bind(merged.name),
      _bind(merged.colorway),
      _bind(merged.category),
      _bind(merged.price),
      _bind(merged.sku),
      _bind(merged.tag),
      _bind(merged.image),
      id,
    ]);
    stmt.step();
    stmt.free();

    return _persistIfChanged();
  },

  deleteProduct(id) {
    _assertReady();

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

  addSubscriber(email) {
    _assertReady();
    try {
      _db.run('INSERT INTO newsletter_subscribers (email, created_at) VALUES (?, ?)', [
        _bind(email),
        new Date().toISOString(),
      ]);
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

  getVariantsForProduct(productId) {
    _assertReady();

    return _rows(
      'SELECT * FROM product_variants WHERE product_id = ? ORDER BY CAST(size AS REAL), size',
      [productId]
    );
  },

  getAllProductsWithVariants() {
    _assertReady();
    const products = this.getAllProducts();
    if (!products.length) return products;

    const byProduct = new Map();
    for (const variant of _rows(
      'SELECT * FROM product_variants ORDER BY CAST(size AS REAL), size'
    )) {
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

    // Read the id before persisting: export() resets last_insert_rowid().
    const id = _db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];

    _persist();

    return { ...data, id };
  },

  updateVariant(id, data) {
    _assertReady();

    const existing = this.getVariant(id);
    if (!existing) return false;

    const merged = { ...existing };
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) merged[key] = value;
    }

    const stmt = _db.prepare(`
      UPDATE product_variants
      SET size = ?, color = ?, quantity = ?, sku = ?
      WHERE id = ?
    `);
    stmt.bind([merged.size, merged.color, merged.quantity, _bind(merged.sku), id]);
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

    const stmt = _db.prepare(
      'SELECT quantity, product_id, size, color FROM product_variants WHERE id = ?'
    );
    stmt.bind([id]);

    let variant = null;
    if (stmt.step()) {
      variant = stmt.getAsObject();
    }
    stmt.free();

    if (!variant) {
      console.warn(`Variant ${id} not found when trying to decrement stock.`);
      return false;
    }

    const updateStmt = _db.prepare(
      'UPDATE product_variants SET quantity = quantity - ? WHERE id = ? AND quantity >= ?'
    );
    updateStmt.bind([qty, id, qty]);
    updateStmt.step();
    updateStmt.free();

    if (_changed() === 0) {
      console.error(
        `OVERSELL CONFLICT: Variant ${id} (${variant.product_id} - ${variant.color} - ${variant.size}) had ${variant.quantity} in stock, but order tried to deduct ${qty}. Manual review needed!`
      );
      return false;
    }

    _persist();
    return true;
  },
};
