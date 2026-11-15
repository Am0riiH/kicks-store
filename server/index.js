'use strict';

require('dotenv').config();

const express = require('express');
const crypto = require('node:crypto');
const { z } = require('zod');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const Stripe = require('stripe');
const bcrypt = require('bcryptjs');
const db = require('./db');
const email = require('./email');

if (!process.env.STRIPE_SECRET_KEY) {
  console.error(
    'Missing STRIPE_SECRET_KEY. Copy server/.env.example to server/.env first.'
  );
  process.exit(1);
}

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const app = express();
const PORT = process.env.PORT || 3001;

// Behind Render's proxy: trust exactly one hop so rate limits are per client IP.
app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];
if (process.env.FRONTEND_URL) {
  ALLOWED_ORIGINS.push(process.env.FRONTEND_URL.replace(/\/+$/, ''));
}
const PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin) || PREVIEW_ORIGIN.test(origin)) {
        return callback(null, true);
      }
      const err = new Error(`CORS: origin "${origin}" not allowed`);
      err.status = 403;
      callback(err);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'stripe-signature', 'Authorization'],
  })
);

async function fetchLineItems(sessionId) {
  try {
    const result = await stripe.checkout.sessions.listLineItems(sessionId, {
      limit: 100,
      expand: ['data.price.product'],
    });
    return result.data.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      amount: item.amount_total,
      currency: item.currency,
      variant_id: item.price?.product?.metadata?.variant_id,
    }));
  } catch (err) {
    console.warn(`Could not fetch line items for ${sessionId}: ${err.message}`);
    return [];
  }
}

async function handleCheckoutCompleted(session) {
  console.log(
    `checkout.session.completed ${session.id} (${session.payment_status}, ` +
      `${(session.amount_total / 100).toFixed(2)} ${session.currency.toUpperCase()})`
  );

  const lineItems = await fetchLineItems(session.id);
  const { inserted, duplicate } = db.upsertOrder(session, lineItems);

  if (duplicate) {
    console.log(`Order ${session.id} already stored, skipping`);
    return;
  }
  if (!inserted) return;

  try {
    for (const item of lineItems) {
      if (item.variant_id && item.quantity) {
        db.decrementVariantQuantity(item.variant_id, item.quantity);
      }
    }
  } catch (err) {
    console.error('Could not decrement variant stock:', err);
  }

  email
    .sendOrderConfirmation({
      customerName: session.customer_details?.name,
      customerEmail: session.customer_details?.email,
      sessionId: session.id,
      amountTotal: session.amount_total,
      currency: session.currency,
      items: lineItems,
    })
    .catch((err) => console.error(`Confirmation email failed: ${err.message}`));
}

// Registered before express.json(): Stripe needs the raw body to verify the signature.
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.warn('STRIPE_WEBHOOK_SECRET is not set, webhook ignored.');
    return res.sendStatus(process.env.NODE_ENV === 'production' ? 500 : 200);
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      webhookSecret
    );
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  // Answer after the work is done so a failure returns 500 and Stripe retries.
  try {
    if (event.type === 'checkout.session.completed') {
      await handleCheckoutCompleted(event.data.object);
    } else if (event.type === 'checkout.session.expired') {
      console.log(`checkout.session.expired ${event.data.object.id}`);
    } else if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object;
      console.log(
        `payment_intent.payment_failed ${intent.id}: ` +
          `${intent.last_payment_error?.message ?? 'unknown reason'}`
      );
    } else {
      console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error('Webhook handling failed:', err);
    return res.sendStatus(500);
  }

  res.sendStatus(200);
});

app.use(express.json());

// The test suite shares one process (and one IP), so it can switch limits off.
const skipWhenTesting = () =>
  process.env.NODE_ENV === 'test' && process.env.DISABLE_RATE_LIMIT === '1';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

const makeLimiter = (max, message, extra = {}) =>
  rateLimit({
    windowMs: FIFTEEN_MINUTES,
    max,
    skip: skipWhenTesting,
    message: { error: message },
    ...extra,
  });

const generalApiLimiter = makeLimiter(100, 'Too many requests, please try again later.');
const checkoutLimiter = makeLimiter(
  10,
  'Too many checkout attempts, please try again later.'
);
const adminApiLimiter = makeLimiter(100, 'Too many requests, please try again later.');
const newsletterLimiter = makeLimiter(
  5,
  'Too many signup attempts, please try again later.'
);

// Only 401s count as failed logins, so validation errors cannot lock the admin out.
const adminLoginLimiter = makeLimiter(
  5,
  'Too many failed login attempts, please try again later.',
  {
    skipSuccessfulRequests: true,
    requestWasSuccessful: (req, res) => res.statusCode !== 401,
  }
);

function adminAuth(req, res, next) {
  const encoded = (req.headers.authorization || '').split(' ')[1] || '';
  const decoded = Buffer.from(encoded, 'base64').toString();
  const separator = decoded.indexOf(':');
  const login = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);

  const validUsername = process.env.ADMIN_USERNAME;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;

  if (
    separator !== -1 &&
    validUsername &&
    passwordHash &&
    login === validUsername &&
    bcrypt.compareSync(password, passwordHash)
  ) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
  res.status(401).json({ error: 'Authentication required.' });
}

app.use('/api/', generalApiLimiter);
app.use('/api/admin/', adminApiLimiter, adminLoginLimiter, adminAuth);

// validate() replaces req.body with the parsed result, so unknown fields are dropped.
// The checkout schema has no price on purpose: it is always read from the database.
const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        quantity: z.number().int().positive(),
        variant_id: z.union([z.string(), z.number()]),
        image: z.string().url().optional(),
      })
    )
    .min(1),
});

const productSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  name: z.string().min(1),
  price: z.number().positive(),
  sku: z.string(),
  image: z.string().url().or(z.literal('')),
  colorway: z.string().optional(),
  tag: z.string().optional(),
});

const newsletterSchema = z.object({
  email: z.string().trim().min(1).email(),
});

const variantSchema = z.object({
  size: z.string().min(1),
  color: z.string().min(1),
  quantity: z.number().int().nonnegative(),
  sku: z.string().optional(),
});

const validate = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (err) {
    return res
      .status(400)
      .json({ error: 'Validation Error', details: err.errors || err.issues || err });
  }
};

app.get('/health', (_req, res) =>
  res.json({
    ok: true,
    mode: process.env.NODE_ENV || 'development',
    webhookSecretSet: !!process.env.STRIPE_WEBHOOK_SECRET,
  })
);

app.post(
  '/api/create-checkout-session',
  checkoutLimiter,
  validate(checkoutSchema),
  async (req, res) => {
    try {
      const lineItems = [];

      for (const item of req.body.items) {
        const variant = db.getVariant(item.variant_id);
        if (!variant) {
          return res
            .status(400)
            .json({ error: `Variant ${item.name} is no longer available.` });
        }
        if (variant.quantity < item.quantity) {
          return res.status(400).json({
            error: `Only ${variant.quantity} units of ${item.name} (${variant.size}) are available.`,
          });
        }

        const product = db.getProduct(variant.product_id);
        if (!product || typeof product.price !== 'number') {
          return res
            .status(400)
            .json({ error: `Pricing unavailable for ${item.name}. Please try again.` });
        }

        const productData = {
          name: item.name,
          metadata: { variant_id: String(item.variant_id) },
        };
        if (item.image && /^https?:\/\//.test(item.image)) {
          productData.images = [item.image];
        }

        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: productData,
            unit_amount: Math.round(product.price * 100),
          },
          quantity: item.quantity,
        });
      }

      const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(
        /\/$/,
        ''
      );

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'payment',
        shipping_address_collection: {
          allowed_countries: [
            'US',
            'CA',
            'GB',
            'AU',
            'FR',
            'DE',
            'JP',
            'LY',
            'AE',
            'SA',
            'EG',
            'QA',
          ],
        },
        phone_number_collection: { enabled: true },
        success_url: `${frontendUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendUrl}/checkout/cancel`,
      });

      res.json({ url: session.url });
    } catch (err) {
      console.error('Stripe session creation failed:', err.message);
      res.status(500).json({
        error: err.message || 'Failed to create checkout session. Please try again.',
      });
    }
  }
);

// Whitelisted fields only: the session id travels in URLs, so no address or phone here.
app.get('/api/order-status', (req, res) => {
  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({ error: 'session_id query param is required.' });
  }

  const order = db.getOrder(session_id);
  if (!order) {
    return res.status(404).json({ found: false });
  }

  res.json({
    found: true,
    id: order.id,
    amount_total: order.amount_total,
    currency: order.currency,
    customer_name: order.customer_name,
    customer_email: order.customer_email,
    items: order.items,
  });
});

app.post(
  '/api/newsletter/subscribe',
  newsletterLimiter,
  validate(newsletterSchema),
  async (req, res) => {
    const subscriberEmail = req.body.email;

    let created;
    try {
      ({ created } = db.addSubscriber(subscriberEmail));
    } catch (err) {
      console.error('Failed to save newsletter subscriber:', err);
      return res
        .status(500)
        .json({ error: `Could not save subscription: ${err.message}` });
    }

    let synced = false;
    if (created) {
      try {
        ({ added: synced } = await email.addNewsletterContact(subscriberEmail));
      } catch (err) {
        console.error(
          'Newsletter contact sync failed (subscriber still saved):',
          err.message
        );
      }
    }

    return res.json({ ok: true, alreadySubscribed: !created, synced });
  }
);

app.get('/api/products', (req, res) => {
  try {
    res.json({ products: db.getAllProductsWithVariants() });
  } catch (err) {
    console.error('Failed to fetch products:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/products/:id', (req, res) => {
  try {
    const product = db.getProduct(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ product: { ...product, variants: db.getVariantsForProduct(product.id) } });
  } catch (err) {
    console.error(`Failed to fetch product ${req.params.id}:`, err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/products/:id/variants', (req, res) => {
  try {
    res.json({ variants: db.getVariantsForProduct(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/orders', (req, res) => {
  res.json({ orders: db.getAllOrders() });
});

app.patch('/api/admin/orders/:id/status', (req, res) => {
  const { status } = req.body;

  if (!['pending', 'completed', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  if (!db.updateOrderStatus(req.params.id, status)) {
    return res.status(404).json({ error: 'Order not found' });
  }

  res.json({ success: true, status });
});

const CLOUDINARY_FOLDER = 'products';

// Signed uploads: the browser sends the image straight to Cloudinary, the secret stays here.
app.get('/api/admin/upload-signature', (req, res) => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return res.status(503).json({
      error:
        'Image upload is not configured. Set CLOUDINARY_CLOUD_NAME, ' +
        'CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET on the server, ' +
        'or paste an image URL instead.',
    });
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = `folder=${CLOUDINARY_FOLDER}&timestamp=${timestamp}`;
  const signature = crypto
    .createHash('sha1')
    .update(toSign + apiSecret)
    .digest('hex');

  res.json({ cloudName, apiKey, timestamp, signature, folder: CLOUDINARY_FOLDER });
});

app.get('/api/admin/products', (req, res) => {
  res.json({ products: db.getAllProducts() });
});

app.post('/api/admin/products', validate(productSchema), (req, res) => {
  try {
    res.status(201).json({ product: db.createProduct(req.body) });
  } catch (err) {
    console.error('Failed to create product:', err);
    res.status(500).json({ error: `Could not save product: ${err.message}` });
  }
});

app.put('/api/admin/products/:id', validate(productSchema.partial()), (req, res) => {
  try {
    if (!db.updateProduct(req.params.id, req.body)) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to update product:', err);
    res.status(500).json({ error: `Could not update product: ${err.message}` });
  }
});

app.delete('/api/admin/products/:id', (req, res) => {
  if (!db.deleteProduct(req.params.id)) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.json({ success: true });
});

app.post('/api/admin/products/:id/variants', validate(variantSchema), (req, res) => {
  if (!db.getProduct(req.params.id)) {
    return res.status(404).json({ error: 'Product not found' });
  }
  const variant = db.addVariant({ ...req.body, product_id: req.params.id });
  res.status(201).json({ variant });
});

app.put('/api/admin/variants/:id', validate(variantSchema.partial()), (req, res) => {
  if (!db.updateVariant(req.params.id, req.body)) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.json({ success: true });
});

app.delete('/api/admin/variants/:id', (req, res) => {
  if (!db.deleteVariant(req.params.id)) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.json({ success: true });
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Express only treats a function with four arguments as an error handler.
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return;

  let status = 500;
  let message = 'Internal server error.';

  if (err.type === 'entity.too.large' || err.status === 413) {
    status = 413;
    message = 'Request body is too large.';
  } else if (err instanceof SyntaxError && 'body' in err) {
    status = 400;
    message = 'Malformed JSON in request body.';
  } else if (err.status === 403 || String(err.message).startsWith('CORS:')) {
    status = 403;
    message = 'Origin not allowed.';
  }

  res.status(status).json({ error: message });
});

async function start() {
  const isTest = process.env.STRIPE_SECRET_KEY.includes('_test_');

  await db.init();

  app.listen(PORT, () => {
    console.log(`Sneakers Store server listening on port ${PORT}`);
    console.log(`Stripe mode: ${isTest ? 'test' : 'LIVE, real charges will be made'}`);
    console.log(
      `Webhook secret: ${process.env.STRIPE_WEBHOOK_SECRET ? 'set' : 'not set'}`
    );
  });
}

if (require.main === module) {
  start();
}

module.exports = app;
module.exports.start = start;
