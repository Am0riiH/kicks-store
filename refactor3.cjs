const fs = require('fs');
let content = fs.readFileSync('server/index.js', 'utf8');

// Insert zod import
if (!content.includes("const { z } = require('zod');")) {
  content = content.replace("const express = require('express');", "const express = require('express');\nconst { z } = require('zod');");
}

// 1. Zod schemas
const schemasCode = `
// ─── ZOD SCHEMAS ─────────────────────────────────────────────────────────────
const checkoutSchema = z.object({
  items: z.array(z.object({
    name: z.string().min(1),
    price: z.number().positive(),
    quantity: z.number().int().positive(),
    variant_id: z.union([z.string(), z.number()]).optional(),
    image: z.string().url().optional()
  })).min(1)
});

const productSchema = z.object({
  name: z.string().min(1),
  price: z.number().positive(),
  description: z.string().optional(),
  colorway: z.string().optional(),
  image: z.string().url().or(z.literal('')).optional(),
  tag: z.string().optional(),
  sku: z.string().optional()
});

const variantSchema = z.object({
  size: z.string().min(1),
  color: z.string().min(1),
  quantity: z.number().int().nonnegative(),
  sku: z.string().optional()
});

// Zod validation middleware wrapper
const validate = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (err) {
    return res.status(400).json({ error: 'Validation Error', details: err.errors });
  }
};
`;

if (!content.includes("ZOD SCHEMAS")) {
  content = content.replace("// ─── GET /health", schemasCode + "\n// ─── GET /health");
}

// Fix POST checkout
content = content.replace(
  "app.post('/api/create-checkout-session', checkoutLimiter, async (req, res) => {",
  "app.post('/api/create-checkout-session', checkoutLimiter, validate(checkoutSchema), async (req, res) => {"
);

// Fix GET /api/admin/products
const oldGetProducts = `app.get('/api/admin/products', (req, res) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    if (login === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
      return res.json({ products: db.getAllProducts() });
    }
    res.status(401).send('Authentication required.');
  });`;
const newGetProducts = `app.get('/api/admin/products', (req, res) => {
  return res.json({ products: db.getAllProducts() });
});`;
content = content.replace(oldGetProducts, newGetProducts);

// Fix POST /api/admin/products
const oldPostProducts = `app.post('/api/admin/products', (req, res) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    if (login === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
      const product = db.createProduct(req.body);
      return res.status(201).json({ product });
    }
    res.status(401).send('Authentication required.');
  });`;
const newPostProducts = `app.post('/api/admin/products', validate(productSchema), (req, res) => {
  const product = db.createProduct(req.body);
  return res.status(201).json({ product });
});`;
content = content.replace(oldPostProducts, newPostProducts);

// Fix PUT /api/admin/products/:id
const oldPutProducts = `app.put('/api/admin/products/:id', (req, res) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    if (login === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
      const updated = db.updateProduct(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Not found' });
      return res.json({ success: true });
    }
    res.status(401).send('Authentication required.');
  });`;
const newPutProducts = `app.put('/api/admin/products/:id', validate(productSchema.partial()), (req, res) => {
  const updated = db.updateProduct(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  return res.json({ success: true });
});`;
content = content.replace(oldPutProducts, newPutProducts);

// Fix DELETE /api/admin/products/:id
const oldDelProducts = `app.delete('/api/admin/products/:id', (req, res) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    if (login === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
      const deleted = db.deleteProduct(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Not found' });
      return res.json({ success: true });
    }
    res.status(401).send('Authentication required.');
  });`;
const newDelProducts = `app.delete('/api/admin/products/:id', (req, res) => {
  const deleted = db.deleteProduct(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  return res.json({ success: true });
});`;
content = content.replace(oldDelProducts, newDelProducts);

// Fix POST /api/admin/products/:id/variants
const oldPostVariants = `app.post('/api/admin/products/:id/variants', (req, res) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    if (login === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
      const variant = db.addVariant({ ...req.body, product_id: req.params.id });
      return res.status(201).json({ variant });
    }
    res.status(401).send('Authentication required.');
  });`;
const newPostVariants = `app.post('/api/admin/products/:id/variants', validate(variantSchema), (req, res) => {
  const variant = db.addVariant({ ...req.body, product_id: req.params.id });
  return res.status(201).json({ variant });
});`;
content = content.replace(oldPostVariants, newPostVariants);

// Fix PUT /api/admin/variants/:id
const oldPutVariants = `app.put('/api/admin/variants/:id', (req, res) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    if (login === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
      const updated = db.updateVariant(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Not found' });
      return res.json({ success: true });
    }
    res.status(401).send('Authentication required.');
  });`;
const newPutVariants = `app.put('/api/admin/variants/:id', validate(variantSchema.partial()), (req, res) => {
  const updated = db.updateVariant(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  return res.json({ success: true });
});`;
content = content.replace(oldPutVariants, newPutVariants);

// Fix DELETE /api/admin/variants/:id
const oldDelVariants = `app.delete('/api/admin/variants/:id', (req, res) => {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    if (login === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
      const deleted = db.deleteVariant(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Not found' });
      return res.json({ success: true });
    }
    res.status(401).send('Authentication required.');
  });`;
const newDelVariants = `app.delete('/api/admin/variants/:id', (req, res) => {
  const deleted = db.deleteVariant(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  return res.json({ success: true });
});`;
content = content.replace(oldDelVariants, newDelVariants);

// Remove the manual items validation in checkout since Zod handles it
content = content.replace(`    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty or malformed.' });
    }`, "");

fs.writeFileSync('server/index.js', content);
console.log('Zod refactor complete!');
