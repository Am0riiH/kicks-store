/**
 * Shared helpers for the server suite.
 *
 * Every test file calls `loadApp()` once in beforeAll. It awaits db.init()
 * before returning, because server/index.js only calls it from start(), which
 * the require.main guard skips under test — without it every db.* call throws
 * "DB not initialised".
 */
import { createRequire } from 'node:module';

// server/ is CommonJS. Loading it through native require — rather than the ESM
// `import()` that Vite would transform — is what keeps the app and the tests on
// ONE sql.js instance.
//
// Vite processes a dynamically imported index.js but leaves its internal
// `require('./db')` to Node, so `import('../db.js')` here would hand back a
// SECOND, uninitialised copy of the module: db.init() would resolve against an
// instance no route ever touches, and every request would 500 with
// "DB not initialised". Native require on both sides shares Node's CJS cache.
const require = createRequire(import.meta.url);

const Stripe = require('stripe');

export const TEST_ADMIN_USER = 'test-admin';
export const TEST_ADMIN_PASSWORD = 'test-admin-password';

/** Basic auth header matching the credentials setup.mjs installed. */
export function adminHeader(
  user = TEST_ADMIN_USER,
  password = TEST_ADMIN_PASSWORD
) {
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
}

/**
 * Loads the Express app and the db module, sharing one sql.js instance.
 *
 * db.init() must be awaited here: index.js only calls it from start(), which
 * the `require.main === module` guard skips under test.
 */
export async function loadApp() {
  const db = require('../db.js');
  await db.init();

  const app = require('../index.js');

  return { app, db };
}

// ─── Stripe webhook signing ──────────────────────────────────────────────────
// generateTestHeaderString is pure local HMAC — no network, so it works under
// nock's disableNetConnect.
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

/** Serialised payload plus a valid `stripe-signature` for it. */
export function signWebhook(event, secret = process.env.STRIPE_WEBHOOK_SECRET) {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return { payload, signature };
}

/** A checkout.session.completed event with sensible, overridable defaults. */
export function checkoutSessionCompleted(overrides = {}) {
  const session = {
    id: `cs_test_${Math.random().toString(36).slice(2, 12)}`,
    object: 'checkout.session',
    amount_total: 21000,
    currency: 'usd',
    payment_status: 'paid',
    customer_details: {
      email: 'buyer@example.com',
      name: 'Test Buyer',
      phone: '+15550000000',
    },
    shipping_details: {
      name: 'Test Buyer',
      address: {
        line1: '1 Test Street',
        line2: 'Apt 2',
        city: 'Testville',
        state: 'CA',
        postal_code: '90210',
        country: 'US',
      },
    },
    ...overrides,
  };

  return {
    id: `evt_test_${Math.random().toString(36).slice(2, 12)}`,
    object: 'event',
    type: 'checkout.session.completed',
    data: { object: session },
  };
}

/**
 * The webhook ACKs with 200 BEFORE it writes to the database (index.js:124), so
 * supertest resolves while the upsert is still in flight. Poll rather than sleep.
 */
export async function waitFor(predicate, { timeout = 5000, interval = 25 } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await predicate();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`waitFor timed out after ${timeout}ms`);
}
