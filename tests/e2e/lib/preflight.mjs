/**
 * Fails fast, with an actionable message, when the local stack is not ready.
 *
 * Without this an E2E run dies 30 seconds in on an opaque selector timeout, and
 * the real cause (a webhook forwarder that was never started) stays hidden.
 */
import { FRONTEND_URL, API_URL, ADMIN_USER, ADMIN_PASSWORD, adminHeader, log } from './env.mjs';

class PreflightError extends Error {}

async function check(label, fn) {
  try {
    await fn();
    log.ok(label);
  } catch (err) {
    log.fail(`${label} — ${err.message}`);
    throw new PreflightError(err.message);
  }
}

/**
 * @param {object} opts
 * @param {boolean} opts.needsFrontend  browser flows need Vite running
 * @param {boolean} opts.needsWebhook   flows that wait for an order need `stripe listen`
 */
export async function preflight({ needsFrontend = true, needsWebhook = true } = {}) {
  log.step('Preflight');
  const failures = [];

  const run = async (label, fn, remedy) => {
    try {
      await check(label, fn);
    } catch {
      failures.push(remedy);
    }
  };

  await run(
    `Backend reachable at ${API_URL}`,
    async () => {
      const res = await fetch(`${API_URL}/health`);
      if (!res.ok) throw new Error(`/health returned ${res.status}`);
      const body = await res.json();
      if (!body.ok) throw new Error('/health did not report ok');
    },
    `Start the API:  cd server && npm start`
  );

  if (needsWebhook) {
    await run(
      'Stripe webhook secret is configured',
      async () => {
        const res = await fetch(`${API_URL}/health`);
        const body = await res.json();
        if (!body.webhookSecretSet) {
          throw new Error('STRIPE_WEBHOOK_SECRET is not set on the server');
        }
      },
      'Run:  stripe listen --forward-to localhost:3001/api/webhook\n' +
      '       then copy the printed whsec_… into server/.env and restart the API.\n' +
      '       Without it the webhook is acknowledged but no order is ever stored.'
    );
  }

  if (needsFrontend) {
    await run(
      `Frontend reachable at ${FRONTEND_URL}`,
      async () => {
        const res = await fetch(FRONTEND_URL);
        if (!res.ok) throw new Error(`returned ${res.status}`);
      },
      'Start the frontend:  npm run dev'
    );
  }

  await run(
    'Admin credentials accepted',
    async () => {
      if (!ADMIN_USER || !ADMIN_PASSWORD) {
        throw new Error('E2E_ADMIN_USER / E2E_ADMIN_PASSWORD are not set');
      }
      const res = await fetch(`${API_URL}/api/admin/orders`, {
        headers: { Authorization: adminHeader() },
      });
      if (res.status === 401) throw new Error('credentials rejected (401)');
      if (res.status === 429) {
        throw new Error('rate limited (429) — 5 failed logins per 15 minutes; wait it out');
      }
      if (!res.ok) throw new Error(`returned ${res.status}`);
    },
    'Set the admin credentials from server/.env:\n' +
    '       $env:E2E_ADMIN_USER="…"; $env:E2E_ADMIN_PASSWORD="…"'
  );

  if (failures.length) {
    console.error('\n───────────────────────────────────────────────');
    console.error('Preflight failed. To fix:\n');
    failures.forEach((f, i) => console.error(`  ${i + 1}. ${f}\n`));
    console.error('See tests/e2e/README.md for the full setup.');
    console.error('───────────────────────────────────────────────\n');
    process.exit(1);
  }
}
