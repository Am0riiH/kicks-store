/**
 * webhook-test.js — local end-to-end webhook verification test
 *
 * Creates a properly signed Stripe webhook payload using the same
 * secret that the server has, then POSTs it and checks:
 *   1. Valid signature → 200 + console log appears
 *   2. Tampered payload → 400 signature mismatch
 *
 * Run from /server with:  node webhook-test.js
 */

require('dotenv').config();
const Stripe = require('stripe');
const http   = require('http');

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const PORT           = process.env.PORT || 3001;

if (!WEBHOOK_SECRET) {
  console.error('❌  STRIPE_WEBHOOK_SECRET not set in .env — cannot run test.');
  console.error('    Set it to the whsec_… value from `stripe listen` first.');
  process.exit(1);
}

// Build a realistic checkout.session.completed payload
const fakeSession = {
  id:             'cs_test_local_' + Date.now(),
  object:         'checkout.session',
  payment_status: 'paid',
  amount_total:   21999,
  currency:       'usd',
  customer_details: {
    email: 'test@example.com',
    name:  'Test Customer',
  },
};

const payload   = JSON.stringify({ type: 'checkout.session.completed', data: { object: fakeSession } });
const timestamp = Math.floor(Date.now() / 1000);
const stripe    = Stripe(process.env.STRIPE_SECRET_KEY);

// Stripe signs: "timestamp.payload" with HMAC-SHA256
const crypto = require('crypto');
const signedPayload = `${timestamp}.${payload}`;
const signature = crypto
  .createHmac('sha256', WEBHOOK_SECRET.replace('whsec_', Buffer.from(WEBHOOK_SECRET.replace('whsec_', ''), 'base64')))
  .update(signedPayload)
  .digest('hex');

// Use stripe.webhooks.generateTestHeaderString for a correctly formatted header
const header = stripe.webhooks.generateTestHeaderString({
  payload,
  secret: WEBHOOK_SECRET,
});

function post(path, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const bodyBuf = Buffer.from(body);
    const req = http.request(
      { host: 'localhost', port: PORT, path, method: 'POST',
        headers: {
          'Content-Type':   'application/json',
          'Content-Length': bodyBuf.length,
          ...extraHeaders,
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end',  () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    req.write(bodyBuf);
    req.end();
  });
}

(async () => {
  console.log('\n🧪  Webhook endpoint test\n');

  // ── Test 1: Valid signature ──────────────────────────────────────────────────
  console.log('1️⃣   Sending correctly signed payload…');
  const good = await post('/api/webhook', payload, { 'stripe-signature': header });
  console.log(`    Status: ${good.status} (expected 200)`);
  console.log(good.status === 200 ? '    ✅  PASS\n' : '    ❌  FAIL\n');

  // ── Test 2: Tampered payload (bad signature) ─────────────────────────────────
  console.log('2️⃣   Sending tampered payload with original signature…');
  const tamperedPayload = payload.replace('paid', 'failed');
  const bad = await post('/api/webhook', tamperedPayload, { 'stripe-signature': header });
  console.log(`    Status: ${bad.status} (expected 400)`);
  console.log(bad.status === 400 ? '    ✅  PASS\n' : '    ❌  FAIL\n');

  // ── Test 3: No signature header ──────────────────────────────────────────────
  console.log('3️⃣   Sending request without stripe-signature header…');
  const nosig = await post('/api/webhook', payload, {});
  console.log(`    Status: ${nosig.status} (expected 400)`);
  console.log(nosig.status === 400 ? '    ✅  PASS\n' : '    ❌  FAIL (ok if STRIPE_WEBHOOK_SECRET was not set when server started)\n');

  console.log('Done.\n');
})();
