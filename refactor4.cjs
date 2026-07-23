const fs = require('fs');
let content = fs.readFileSync('server/index.js', 'utf8');

const replacements = [
  {
    old: `app.get('/api/admin/products', (req, res) => {
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
  if (login === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    return res.json({ products: db.getAllProducts() });
  }
  res.status(401).send('Authentication required.');
});`,
    new: `app.get('/api/admin/products', (req, res) => {
  return res.json({ products: db.getAllProducts() });
});`
  },
  {
    old: `app.post('/api/admin/products', (req, res) => {
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
  if (login === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    const product = db.createProduct(req.body);
    return res.status(201).json({ product });
  }
  res.status(401).send('Authentication required.');
});`,
    new: `app.post('/api/admin/products', validate(productSchema), (req, res) => {
  const product = db.createProduct(req.body);
  return res.status(201).json({ product });
});`
  },
  {
    old: `app.put('/api/admin/products/:id', (req, res) => {
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
  if (login === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    const updated = db.updateProduct(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    return res.json({ success: true });
  }
  res.status(401).send('Authentication required.');
});`,
    new: `app.put('/api/admin/products/:id', validate(productSchema.partial()), (req, res) => {
  const updated = db.updateProduct(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  return res.json({ success: true });
});`
  },
  {
    old: `app.delete('/api/admin/products/:id', (req, res) => {
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
  if (login === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    const deleted = db.deleteProduct(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    return res.json({ success: true });
  }
  res.status(401).send('Authentication required.');
});`,
    new: `app.delete('/api/admin/products/:id', (req, res) => {
  const deleted = db.deleteProduct(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  return res.json({ success: true });
});`
  },
  {
    old: `app.post('/api/admin/products/:id/variants', (req, res) => {
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
  if (login === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    const variant = db.addVariant({ ...req.body, product_id: req.params.id });
    return res.status(201).json({ variant });
  }
  res.status(401).send('Authentication required.');
});`,
    new: `app.post('/api/admin/products/:id/variants', validate(variantSchema), (req, res) => {
  const variant = db.addVariant({ ...req.body, product_id: req.params.id });
  return res.status(201).json({ variant });
});`
  },
  {
    old: `app.put('/api/admin/variants/:id', (req, res) => {
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
  if (login === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    const updated = db.updateVariant(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    return res.json({ success: true });
  }
  res.status(401).send('Authentication required.');
});`,
    new: `app.put('/api/admin/variants/:id', validate(variantSchema.partial()), (req, res) => {
  const updated = db.updateVariant(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  return res.json({ success: true });
});`
  },
  {
    old: `app.delete('/api/admin/variants/:id', (req, res) => {
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
  if (login === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    const deleted = db.deleteVariant(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    return res.json({ success: true });
  }
  res.status(401).send('Authentication required.');
});`,
    new: `app.delete('/api/admin/variants/:id', (req, res) => {
  const deleted = db.deleteVariant(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  return res.json({ success: true });
});`
  }
];

let replaced = 0;
for (const r of replacements) {
  if (content.includes(r.old)) {
    content = content.replace(r.old, r.new);
    replaced++;
  } else {
    console.log("Could not find:", r.old);
  }
}

console.log('Replaced', replaced, 'blocks.');

fs.writeFileSync('server/index.js', content);
