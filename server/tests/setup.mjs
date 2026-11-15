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

const TMP_DIR = path.join(os.tmpdir(), 'ajs-tests');
fs.mkdirSync(TMP_DIR, { recursive: true });

const DB_PATH = path.join(TMP_DIR, `${process.pid}-${randomUUID()}.db`);

if (path.resolve(DB_PATH) === path.resolve(REAL_DB)) {
  throw new Error(
    `Refusing to run tests against the real database at ${REAL_DB}. ` +
      'DB_PATH must point somewhere disposable.'
  );
}

process.env.DB_PATH = DB_PATH;

process.env.NODE_ENV = 'test';
process.env.PORT = '0';

// Both gates required before the limiters stand down (server/index.js).
process.env.DISABLE_RATE_LIMIT = '1';

process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_unit_tests';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret_for_signature_verification';

export const TEST_ADMIN_USER = 'test-admin';
export const TEST_ADMIN_PASSWORD = 'test-admin-password';
process.env.ADMIN_USERNAME = TEST_ADMIN_USER;
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(TEST_ADMIN_PASSWORD, 4);

delete process.env.RESEND_API_KEY;
delete process.env.RESEND_AUDIENCE_ID;

delete process.env.CLOUDINARY_CLOUD_NAME;
delete process.env.CLOUDINARY_API_KEY;
delete process.env.CLOUDINARY_API_SECRET;

delete process.env.FRONTEND_URL;

nock.disableNetConnect();
nock.enableNetConnect((host) => host.includes('127.0.0.1') || host.includes('localhost'));

// nock 13 hooks http/https but NOT undici's global fetch, so a fetch-based SDK

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
