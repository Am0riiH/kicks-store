/**
 * Air Jordan Store — Express Server
 * ===================================
 * Endpoints
 * ─────────
 *   GET  /health                          — liveness / readiness check
 *   POST /api/create-checkout-session     — creates a Stripe Checkout Session
 *   POST /api/webhook                     — receives verified Stripe webhook events
 *   GET  /api/order-status?session_id=…  — checks whether an order is in the DB
 *
 * Environment variables (see .env.example)
 * ─────────────────────────────────────────
 *   STRIPE_SECRET_KEY      sk_test_… / sk_live_… (never in frontend)
 *   STRIPE_WEBHOOK_SECRET  whsec_… — from `stripe listen` (local) or Dashboard (prod)
 *   PORT                   defaults to 3001
 *
 * ⚠️  BODY-PARSER ORDER IS CRITICAL FOR WEBHOOKS
 * ─────────────────────────────────────────────────
 * Stripe's signature verification requires the raw, unparsed request body bytes.
 * express.raw() is registered BEFORE express.json() so the webhook route captures
 * the raw Buffer. All other routes get the JSON middleware. Swapping this order
 * would silently break signature verification.
 */

'use strict';

require('dotenv').config();

const express = require('express');
const { z } = require('zod');
const helmet  = require('helmet');
const cors    = require('cors');
const Stripe  = require('stripe');
const bcrypt  = require('bcryptjs');
const db      = require('./db');          // ← SQLite via sql.js (pure WebAssembly)
const email   = require('./email');       // ← Resend email module

// ─── Validate required env vars before starting ───────────────────────────────
if (!process.env.STRIPE_SECRET_KEY) {
  console.error('❌  Missing STRIPE_SECRET_KEY in environment.');
  console.error('    Copy server/.env.example → server/.env and fill in your key.');
  process.exit(1);
}

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const app    = express();

// Apply Helmet security headers
app.use(helmet({
  // Since this is a cross-origin API for the frontend, we need to allow cross-origin resource sharing
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

const PORT   = process.env.PORT || 3001;

// ─── CORS ─────────────────────────────────────────────────────────────────────
// PRODUCTION: replace with your real domain(s), e.g. ['https://yourstore.com']
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];
if (process.env.FRONTEND_URL) {
  ALLOWED_ORIGINS.push(process.env.FRONTEND_URL);
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);   // curl / Postman / Stripe CLI
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin "${origin}" not allowed`));
    },
    methods:      ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'stripe-signature', 'Authorization'],
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  WEBHOOK ROUTE — registered BEFORE express.json() middleware
// ─────────────────────────────────────────────────────────────────────────────
app.post(
  '/api/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig           = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.warn(
        '⚠️  STRIPE_WEBHOOK_SECRET is not set.\n' +
        '    Webhook received but signature verification is SKIPPED.\n' +
        '    Set the variable (see .env.example) to enable verification.'
      );
      return res.sendStatus(200);
    }

    // ── Verify Stripe signature ────────────────────────────────────────────────
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error(`❌  Webhook signature verification failed: ${err.message}`);
      return res.status(400).json({ error: `Webhook error: ${err.message}` });
    }

    // ── ACK immediately — Stripe expects a 2xx within ~30 s ───────────────────
    // DB writes with better-sqlite3 are synchronous and sub-millisecond, so we
    // can do the work inline before the ACK without risking a timeout. For slow
    // work (email sends, third-party APIs) you'd move this after res.sendStatus.
    res.sendStatus(200);

    // ── Route by event type ────────────────────────────────────────────────────
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object;

        console.log('\n✅  checkout.session.completed received');
        console.log('    ─────────────────────────────────────');
        console.log(`    Session ID    : ${session.id}`);
        console.log(`    Payment status: ${session.payment_status}`);
        console.log(`    Amount total  : $${(session.amount_total / 100).toFixed(2)} ${session.currency.toUpperCase()}`);
        console.log(`    Customer email: ${session.customer_details?.email ?? '(guest)'}`);
        console.log(`    Customer name : ${session.customer_details?.name  ?? '(guest)'}`);

        // ── Fetch line items from Stripe so we can store them ─────────────────
        // stripe.checkout.sessions.listLineItems returns the items exactly as
        // they were in the session — name, price, quantity.
        // We expand data.price.product to access the variant_id metadata we set on creation.
        let lineItems = [];
        try {
          const li = await stripe.checkout.sessions.listLineItems(session.id, { 
            limit: 100,
            expand: ['data.price.product'] 
          });
          lineItems = li.data.map(item => ({
            description: item.description,
            quantity:    item.quantity,
            amount:      item.amount_total,   // cents
            currency:    item.currency,
            variant_id:  item.price?.product?.metadata?.variant_id
          }));
        } catch (liErr) {
          console.warn(`    ⚠️  Could not fetch line items: ${liErr.message}`);
        }

        // ── Idempotency: insert only if not already stored ────────────────────
        // The PRIMARY KEY on orders.id (session.id) enforces uniqueness at the
        // DB level. upsertOrder() checks first with a SELECT and only INSERTs if
        // the row doesn't exist. This safely handles Stripe's "at least once"
        // delivery — the same webhook may fire more than once for the same event.
        let inserted = false;
        let duplicate = false;
        try {
          const result = db.upsertOrder(session, lineItems);
          inserted = result.inserted;
          duplicate = result.duplicate;
        } catch (dbErr) {
          console.error(`    ❌  Error persisting order to DB:`, dbErr);
        }

        if (inserted) {
          console.log('    💾  Order persisted to DB ✅');

          // ── Decrement Variant Inventory ──────────────────────────────────────
          try {
            console.log('    📦  Line items received from Stripe:', JSON.stringify(lineItems, null, 2));
            lineItems.forEach(item => {
              console.log(`    🔍  Checking item: ${item.description} | Qty: ${item.quantity} | variant_id: ${item.variant_id}`);
              if (item.variant_id && item.quantity) {
                db.decrementVariantQuantity(item.variant_id, item.quantity);
              }
            });
          } catch (decErr) {
            console.error('    ❌  Error decrementing variant stock:', decErr);
          }

          // ── Send Order Confirmation Email ──────────────────────────────────
          // Fire and forget — we don't await this because Resend API latency
          // shouldn't block the 200 OK to Stripe.
          try {
            email.sendOrderConfirmation({
              customerName:  session.customer_details?.name,
              customerEmail: session.customer_details?.email,
              sessionId:     session.id,
              amountTotal:   session.amount_total,
              currency:      session.currency,
              items:         lineItems,
            }).catch(e => {
              // Catch errors from the unawaited promise
              console.error(`    ❌  Failed to send confirmation email: ${e.message}`);
            });
          } catch (e) {
            console.error(`    ❌  Failed to initialize email send: ${e.message}`);
          }
          
        } else if (duplicate) {
          console.log('    ♻️   Duplicate delivery — already in DB, skipped re-insert');
        }

        console.log();
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object;
        console.log(`\n⏰  checkout.session.expired: ${session.id}\n`);
        // v4 hook point: release reserved inventory
        break;
      }

      case 'payment_intent.payment_failed': {
        const intent = event.data.object;
        console.log(`\n❌  payment_intent.payment_failed: ${intent.id}`);
        console.log(`    Reason: ${intent.last_payment_error?.message ?? 'unknown'}\n`);
        // v4 hook point: notify customer
        break;
      }

      default:
        console.log(`    ℹ️  Unhandled event type: ${event.type}`);
    }
  }
);

// ─── Global JSON middleware — applied AFTER the webhook route ─────────────────
app.use(express.json());

const rateLimit = require('express-rate-limit');

// 1. General API Limiter (100 per 15 min)
const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});

// 2. Checkout Limiter (10 per 15 min)
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many checkout attempts, please try again later.' }
});

// 3. Admin Login Limiter (5 failed attempts per 15 min)
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true, // Only count failed logins (401s)
  message: { error: 'Too many failed login attempts, please try again later.' }
});

// Admin Auth Middleware
function adminAuth(req, res, next) {
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

  const validUsername = process.env.ADMIN_USERNAME;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;

  if (
    validUsername && passwordHash &&
    login === validUsername && 
    bcrypt.compareSync(password, passwordHash)
  ) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
  res.status(401).json({ error: 'Authentication required.' });
}

// Apply general API limiter to all API routes
app.use('/api/', generalApiLimiter);

// Apply admin auth and rate limiter to all admin routes
app.use('/api/admin/', adminLoginLimiter, adminAuth);



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
    return res.status(400).json({ error: 'Validation Error', details: err.errors || err.issues || err });
  }
};

// ─── GET /health ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) =>
  res.json({
    ok:               true,
    mode:             process.env.NODE_ENV || 'development',
    webhookSecretSet: !!process.env.STRIPE_WEBHOOK_SECRET,
  })
);

// ─── POST /api/create-checkout-session ────────────────────────────────────────
app.post('/api/create-checkout-session', checkoutLimiter, validate(checkoutSchema), async (req, res) => {
  try {
    const { items } = req.body;



    // Server-side validation: Check stock BEFORE creating Stripe session
    for (const item of items) {
      if (item.variant_id) {
        const variant = db.getVariant(item.variant_id);
        console.log(`[VALIDATION DEBUG] Variant:`, variant, `Item qty:`, item.quantity);
        if (!variant) {
          return res.status(400).json({ error: `Variant ${item.name} is no longer available.` });
        }
        if (variant.quantity < item.quantity) {
          return res.status(400).json({ error: `Only ${variant.quantity} units of ${item.name} (${variant.size}) are available.` });
        }
      }
    }

    const lineItems = items.map((item) => {
      if (!item.name || typeof item.price !== 'number' || !item.quantity) {
        throw new Error(`Invalid item: ${JSON.stringify(item)}`);
      }
      const productData = { name: item.name };
      if (item.image && /^https?:\/\//.test(item.image)) {
        productData.images = [item.image];
      }
      
      // Store the variant_id in Stripe product metadata so we can access it during the webhook
      if (item.variant_id) {
        console.log(`    👉  Adding variant_id to product_data.metadata: ${item.variant_id}`);
        productData.metadata = { variant_id: String(item.variant_id) };
      } else {
        console.warn(`    ⚠️  Missing variant_id for item in cart: ${item.name}`);
      }

      return {
        price_data: {
          currency:     'usd',
          product_data: productData,
          unit_amount:  Math.round(item.price * 100),
        },
        quantity: item.quantity,
      };
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items:           lineItems,
      mode:                 'payment',
      // {CHECKOUT_SESSION_ID} is filled by Stripe — lets the success page
      // call /api/order-status?session_id=cs_… to confirm server-side.
      // PRODUCTION NOTE: Replace localhost:5173 with your real domain.
      success_url: `http://localhost:5173/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `http://localhost:5173/checkout/cancel`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe session creation failed:', err.message);
    res.status(500).json({
      error: err.message || 'Failed to create checkout session. Please try again.',
    });
  }
});

// ─── GET /api/order-status ────────────────────────────────────────────────────
// The success page polls this endpoint after redirect to confirm server-side
// that the order was actually paid (webhook → DB) rather than trusting the
// redirect URL alone.
//
// Query params:
//   session_id   — the Stripe checkout session ID (cs_…)
//
// Responses:
//   200  { found: true,  id, status, amount_total, currency,
//          customer_email, customer_name, items, created_at }
//   404  { found: false }
//   400  { error: 'session_id query param is required' }
app.get('/api/order-status', (req, res) => {
  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({ error: 'session_id query param is required.' });
  }

  const order = db.getOrder(session_id);

  if (!order) {
    // 404 = not in DB yet. The success page retries this — webhook may still
    // be in flight (browser redirect often arrives before Stripe's webhook POST).
    return res.status(404).json({ found: false });
  }

  res.json({ found: true, ...order });
});

// ─── GET /api/products ────────────────────────────────────────────────────────
// Public endpoint for the storefront to fetch all products
app.get('/api/products', (req, res) => {
  try {
    const products = db.getAllProducts();
    res.json({ products });
  } catch (err) {
    console.error('Failed to fetch products:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/products/:id ────────────────────────────────────────────────────
// Public endpoint for the storefront to fetch a single product
app.get('/api/products/:id', (req, res) => {
  try {
    const product = db.getProduct(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ product });
  } catch (err) {
    console.error(`Failed to fetch product ${req.params.id}:`, err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/admin/orders ────────────────────────────────────────────────────
// Protected by HTTP Basic Auth. Returns all orders.
app.get('/api/admin/orders', (req, res) => {

    const orders = db.getAllOrders();
    return res.json({ orders });

});

// ─── PATCH /api/admin/orders/:id/status ───────────────────────────────────────
// Protected by HTTP Basic Auth. Updates an order's fulfillment status.
app.patch('/api/admin/orders/:id/status', (req, res) => {

    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'completed', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updated = db.updateOrderStatus(id, status);
    if (!updated) {
      return res.status(404).json({ error: 'Order not found' });
    }

    return res.json({ success: true, status });

});

// ─── GET /api/admin/products ──────────────────────────────────────────────────
app.get('/api/admin/products', (req, res) => {
  return res.json({ products: db.getAllProducts() });
});

// ─── POST /api/admin/products ─────────────────────────────────────────────────
app.post('/api/admin/products', validate(productSchema), (req, res) => {
  const product = db.createProduct(req.body);
  return res.status(201).json({ product });
});

// ─── PUT /api/admin/products/:id ──────────────────────────────────────────────
app.put('/api/admin/products/:id', validate(productSchema.partial()), (req, res) => {
  const updated = db.updateProduct(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  return res.json({ success: true });
});

// ─── DELETE /api/admin/products/:id ───────────────────────────────────────────
app.delete('/api/admin/products/:id', (req, res) => {
  const deleted = db.deleteProduct(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  return res.json({ success: true });
});

// ─── GET /api/products/:id/variants ───────────────────────────────────────────
app.get('/api/products/:id/variants', (req, res) => {
  try {
    const variants = db.getVariantsForProduct(req.params.id);
    res.json({ variants });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/admin/products/:id/variants ────────────────────────────────────
app.post('/api/admin/products/:id/variants', validate(variantSchema), (req, res) => {
  const variant = db.addVariant({ ...req.body, product_id: req.params.id });
  return res.status(201).json({ variant });
});

// ─── PUT /api/admin/variants/:id ──────────────────────────────────────────────
app.put('/api/admin/variants/:id', validate(variantSchema.partial()), (req, res) => {
  const updated = db.updateVariant(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  return res.json({ success: true });
});

// ─── DELETE /api/admin/variants/:id ───────────────────────────────────────────
app.delete('/api/admin/variants/:id', (req, res) => {
  const deleted = db.deleteVariant(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  return res.json({ success: true });
});

// ─── 404 fallback ─────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ─── Start ────────────────────────────────────────────────────────────────────
// db.init() is async (sql.js loads a WASM binary), so we wrap startup.
(async () => {
  const keyPrefix    = process.env.STRIPE_SECRET_KEY.slice(0, 12);
  const isTest       = process.env.STRIPE_SECRET_KEY.includes('_test_');
  const webhookReady = !!process.env.STRIPE_WEBHOOK_SECRET;

  console.log(`\n🚀  Air Jordan Store — checkout server starting on port ${PORT}`);
  console.log(`    Stripe key    : ${keyPrefix}… (${isTest ? '✅ TEST mode' : '⚠️  LIVE mode — double-check this!'})`); 
  console.log(`    Webhook secret: ${webhookReady ? '✅ set' : '⚠️  not set — run: stripe listen --forward-to localhost:3001/api/webhook'}`);

  // Initialise the SQLite database (loads WASM, opens/creates data.db, runs migrations)
  await db.init();

  app.listen(PORT, () => {
    console.log(`    Health        : http://localhost:${PORT}/health\n`);

    if (!isTest) {
      console.warn('⚠️  WARNING: You are using a LIVE Stripe key.');
      console.warn('    Real charges will be made. Confirm this is intentional.\n');
    }
  });
})();


