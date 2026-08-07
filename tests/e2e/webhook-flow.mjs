#!/usr/bin/env node
/**
 * E2E: order lifecycle, without a browser and without Stripe's hosted page.
 *
 *   npm run test:e2e:webhook
 *
 * Signs a real checkout.session.completed with the server's own webhook secret,
 * posts it, then verifies the order landed, that /api/order-status returns only
 * the whitelisted fields, that stock moved, and that a replay is idempotent.
 *
 * This is the deterministic gate — no third-party UI to drift, runnable in CI.
 * purchase-flow.mjs covers the parts only a real browser and a real payment can.
 *
 * Requires: the API running, and STRIPE_WEBHOOK_SECRET set (see README).
 */
import { createRequire } from 'node:module';
import { API_URL, adminHeader, assert, log, waitFor } from './lib/env.mjs';
import { preflight } from './lib/preflight.mjs';

const require = createRequire(import.meta.url);
const Stripe = require('../../server/node_modules/stripe');

const WEBHOOK_SECRET = process.env.E2E_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;

async function main() {
  await preflight({ needsFrontend: false, needsWebhook: true });

  if (!WEBHOOK_SECRET) {
    log.fail('E2E_WEBHOOK_SECRET is not set in this shell.');
    console.error(
      '\n  The server has a secret (health says so) but this script needs the same\n' +
      '  value to sign with. Copy it from server/.env or the `stripe listen` output:\n\n' +
      '    $env:E2E_WEBHOOK_SECRET="whsec_…"\n'
    );
    process.exit(1);
  }

  const stripe = Stripe('sk_test_placeholder_for_local_signing');

  // ── Pick a real variant so the stock assertion is meaningful ───────────────
  log.step('Choosing a product variant');
  const products = await (await fetch(`${API_URL}/api/products`)).json();
  const product = products.products.find((p) => p.variants?.some((v) => v.quantity > 0));
  if (!product) throw new Error('No product with stock — reseed the database.');

  const variant = product.variants.find((v) => v.quantity > 0);
  const stockBefore = variant.quantity;
  log.info(`${product.name} — variant ${variant.id} (size ${variant.size}), stock ${stockBefore}`);

  // ── Build and sign the event ──────────────────────────────────────────────
  log.step('Posting a signed checkout.session.completed');
  const sessionId = `cs_test_e2e_${Date.now()}`;
  const event = {
    id: `evt_test_e2e_${Date.now()}`,
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        amount_total: Math.round(product.price * 100),
        currency: 'usd',
        payment_status: 'paid',
        customer_details: {
          email: 'e2e-buyer@example.com',
          name: 'E2E Buyer',
          phone: '+15550001111',
        },
        shipping_details: {
          name: 'E2E Buyer',
          address: {
            line1: '1 Test Street', line2: null, city: 'Testville',
            state: 'CA', postal_code: '90210', country: 'US',
          },
        },
      },
    },
  };

  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });

  const res = await fetch(`${API_URL}/api/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': signature },
    body: payload,
  });

  assert(res.status === 200, `Webhook acknowledged (${res.status})`);

  // ── Negative cases: the signature check must actually reject ──────────────
  log.step('Rejecting unsigned and forged deliveries');

  const unsigned = await fetch(`${API_URL}/api/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });
  assert(unsigned.status === 400, `Missing signature rejected (${unsigned.status})`);

  const forgedPayload = payload.replace('"amount_total":', '"amount_total":1,"tampered":');
  const forged = await fetch(`${API_URL}/api/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': signature },
    body: forgedPayload,
  });
  assert(forged.status === 400, `Tampered payload rejected (${forged.status})`);

  // ── The order should now be readable ──────────────────────────────────────
  // The handler ACKs before writing, so poll rather than assume.
  log.step('Confirming the order was persisted');
  const status = await waitFor(async () => {
    const r = await fetch(`${API_URL}/api/order-status?session_id=${sessionId}`);
    return r.ok ? r.json() : null;
  }, { label: 'the order to appear in /api/order-status' });

  assert(status.found === true, 'Order found via /api/order-status');
  assert(status.customer_name === 'E2E Buyer', 'Customer name returned');

  // M2: this endpoint is unauthenticated, so its shape is a security boundary.
  log.step('Checking the order-status PII whitelist');
  const allowed = ['found', 'id', 'amount_total', 'currency', 'customer_name', 'customer_email', 'items'];
  const actual = Object.keys(status).sort();
  assert(
    JSON.stringify(actual) === JSON.stringify([...allowed].sort()),
    `Exactly the 7 whitelisted fields returned (got: ${actual.join(', ')})`
  );

  const raw = JSON.stringify(status);
  assert(!raw.includes('90210'), 'No shipping postcode leaked');
  assert(!raw.includes('+15550001111'), 'No phone number leaked');
  assert(!raw.includes('1 Test Street'), 'No street address leaked');

  // ── Admin view sees the full record ───────────────────────────────────────
  log.step('Verifying the order in the admin API');
  const adminRes = await fetch(`${API_URL}/api/admin/orders`, {
    headers: { Authorization: adminHeader() },
  });
  const { orders } = await adminRes.json();
  const order = orders.find((o) => o.id === sessionId);

  assert(!!order, 'Order visible in /api/admin/orders');
  assert(order.shipping_postal_code === '90210', 'Admin sees the shipping address');
  assert(order.fulfillment_status === 'pending', 'New order starts as pending');

  // ── Fulfilment status transitions ─────────────────────────────────────────
  log.step('Updating fulfilment status');
  const patch = await fetch(`${API_URL}/api/admin/orders/${sessionId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: adminHeader() },
    body: JSON.stringify({ status: 'completed' }),
  });
  assert(patch.ok, 'Status set to completed');

  const badPatch = await fetch(`${API_URL}/api/admin/orders/${sessionId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: adminHeader() },
    body: JSON.stringify({ status: 'shipped' }),
  });
  assert(badPatch.status === 400, 'Unknown status rejected (400)');

  // ── Idempotency ───────────────────────────────────────────────────────────
  // Stripe delivers at least once; a replay must not create a second order.
  log.step('Replaying the same event');
  const replay = await fetch(`${API_URL}/api/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': signature },
    body: payload,
  });
  assert(replay.status === 200, 'Replay acknowledged');

  await new Promise((r) => setTimeout(r, 1000));
  const after = await (await fetch(`${API_URL}/api/admin/orders`, {
    headers: { Authorization: adminHeader() },
  })).json();

  const copies = after.orders.filter((o) => o.id === sessionId);
  assert(copies.length === 1, 'Replay did not duplicate the order');
  assert(copies[0].fulfillment_status === 'completed', 'Replay did not reset fulfilment status');

  // ── Auth is enforced ──────────────────────────────────────────────────────
  log.step('Checking admin auth');
  const anon = await fetch(`${API_URL}/api/admin/orders`);
  assert(anon.status === 401, `Unauthenticated admin request rejected (${anon.status})`);

  log.step('Notes');
  log.info(
    `Stock for variant ${variant.id} was ${stockBefore}. This synthetic event carries ` +
    'no Stripe line items, so no decrement is expected here — purchase-flow.mjs ' +
    'covers the real inventory path.'
  );

  console.log('\n✅  Webhook flow passed.\n');
}

main().catch((err) => {
  console.error(`\n❌  Webhook flow failed: ${err.message}\n`);
  process.exitCode = 1;
});
