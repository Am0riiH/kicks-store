import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const Stripe = require('stripe');

export const TEST_ADMIN_USER = 'test-admin';
export const TEST_ADMIN_PASSWORD = 'test-admin-password';

export function adminHeader(user = TEST_ADMIN_USER, password = TEST_ADMIN_PASSWORD) {
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
}

export async function loadApp() {
  const db = require('../db.js');
  await db.init();

  const app = require('../index.js');

  return { app, db };
}

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

export function signWebhook(event, secret = process.env.STRIPE_WEBHOOK_SECRET) {
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return { payload, signature };
}

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
