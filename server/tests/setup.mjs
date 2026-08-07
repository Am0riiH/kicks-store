/**
 * Server test setup — runs before EVERY server test file, in that file's own
 * isolated worker.
 *
 * Ordering matters more than usual here, because server/index.js and server/db.js
 * both read env vars at module-load time:
 *
 *   - db.js:43     freezes DB_PATH into a const when it is first required
 *   - index.js:40  calls process.exit(1) if STRIPE_SECRET_KEY is missing
 *   - index.js:27  runs dotenv.config(), which resolves .env from process.cwd().
 *                  Vitest runs from the repo root, where no .env exists, so
 *                  nothing is loaded and every value below must be set explicitly.
 *
 * Vitest executes setup files before it imports the test file, so assigning
 * process.env at this module's top level lands before any of the above.
 */
import { afterAll, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import nock from 'nock';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(HERE, '..');
const REAL_DB = path.join(SERVER_DIR, 'data.db');

// ─── Throwaway database ──────────────────────────────────────────────────────
// One file per test file (setup runs per worker), under the OS temp dir so a
// stray file can never land in the repo. db.init() seeds it: 6 products,
// 36 variants.
const TMP_DIR = path.join(os.tmpdir(), 'ajs-tests');
fs.mkdirSync(TMP_DIR, { recursive: true });

const DB_PATH = path.join(TMP_DIR, `${process.pid}-${randomUUID()}.db`);

// Belt and braces: db.js persists the WHOLE database on every mutation, so a
// wrong DB_PATH would silently overwrite real order history. Refuse to run.
if (path.resolve(DB_PATH) === path.resolve(REAL_DB)) {
  throw new Error(
    `Refusing to run tests against the real database at ${REAL_DB}. ` +
    'DB_PATH must point somewhere disposable.'
  );
}

process.env.DB_PATH = DB_PATH;

// ─── Environment ─────────────────────────────────────────────────────────────
process.env.NODE_ENV = 'test';
process.env.PORT = '0';

// Both gates required before the limiters stand down (server/index.js).
process.env.DISABLE_RATE_LIMIT = '1';

// Shaped like a real key so the "_test_" mode check in index.js sees test mode.
// Never used against the network: nock blocks all outbound connections below.
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_unit_tests';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret_for_signature_verification';

// Cost 4 keeps per-file setup at ~1ms instead of ~100ms; compareSync reads the
// cost from the hash, so verification behaves identically to production's cost 10.
export const TEST_ADMIN_USER = 'test-admin';
export const TEST_ADMIN_PASSWORD = 'test-admin-password';
process.env.ADMIN_USERNAME = TEST_ADMIN_USER;
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(TEST_ADMIN_PASSWORD, 4);

// Left UNSET on purpose so email.js short-circuits and no Resend call is made.
delete process.env.RESEND_API_KEY;
delete process.env.RESEND_AUDIENCE_ID;

// Unset so the Cloudinary signature route returns its 503 branch by default;
// the admin test sets them per-test to exercise the success branch.
delete process.env.CLOUDINARY_CLOUD_NAME;
delete process.env.CLOUDINARY_API_KEY;
delete process.env.CLOUDINARY_API_SECRET;

// Not set at module load, so the CORS allow-list stays at localhost:5173 only.
delete process.env.FRONTEND_URL;

// ─── Network lockdown ────────────────────────────────────────────────────────
// nock patches http.ClientRequest at the Node core level, so it intercepts the
// Stripe SDK regardless of how that module was loaded — no Vitest module mocking
// and no CJS-interop guesswork.
//
// PINNED TO nock 13 ON PURPOSE. nock 14 replaced its own http override with
// @mswjs/interceptors, which does not complete a request made by stripe@14's
// default NodeHttpClient: the call hangs until the test times out. Verified
// outside Vitest — plain https.request works under nock 14, stripe's client does
// not. nock 13.5.6 intercepts both. Re-test before bumping the major.
nock.disableNetConnect();
nock.enableNetConnect((host) => host.includes('127.0.0.1') || host.includes('localhost'));

// nock 13 hooks http/https but NOT undici's global fetch, so a fetch-based SDK
// would sail straight past it to the real internet. Nothing on the server uses
// fetch today (Resend returns early while RESEND_API_KEY is unset), so anything
// reaching here is unintended — fail loudly rather than make a live call.
globalThis.fetch = () => {
  throw new Error(
    'Unexpected global fetch() in a server test. Outbound HTTP must be stubbed ' +
    'with nock; if a dependency switched to fetch, stub it explicitly.'
  );
};

beforeEach(() => {
  nock.cleanAll();
});

afterAll(() => {
  nock.cleanAll();
  nock.enableNetConnect();
  try {
    fs.rmSync(DB_PATH, { force: true });
  } catch {
    // A locked temp file is not worth failing a green run over.
  }
});

export { DB_PATH };
