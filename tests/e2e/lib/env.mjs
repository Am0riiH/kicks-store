/**
 * Shared environment discovery for the E2E scripts.
 *
 * Everything is overridable by env var so the same scripts can point at a
 * staging deployment, but the defaults match `npm run dev` + `cd server && npm start`.
 */
import { accessSync } from 'node:fs';

export const FRONTEND_URL = (process.env.E2E_FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
export const API_URL = (process.env.E2E_API_URL || 'http://localhost:3001').replace(/\/$/, '');

export const ADMIN_USER = process.env.E2E_ADMIN_USER;
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

export const HEADED = process.argv.includes('--headed');

/** Basic auth header for the admin API. */
export function adminHeader() {
  return `Basic ${Buffer.from(`${ADMIN_USER}:${ADMIN_PASSWORD}`).toString('base64')}`;
}

// puppeteer-core ships no browser, so an executable path is mandatory. Same
// Edge-then-Chrome probe the scripts/ capture tools use.
const CANDIDATES = [
  process.env.E2E_BROWSER_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

export function findBrowser() {
  for (const candidate of CANDIDATES) {
    try {
      accessSync(candidate);
      return candidate;
    } catch {
      // try the next one
    }
  }
  throw new Error(
    'No Chromium-based browser found. Set E2E_BROWSER_PATH to a Chrome or Edge ' +
    `executable. Looked in:\n  ${CANDIDATES.join('\n  ')}`
  );
}

// ─── Small console helpers ───────────────────────────────────────────────────
export const log = {
  step: (msg) => console.log(`\n▶  ${msg}`),
  ok: (msg) => console.log(`   ✅ ${msg}`),
  info: (msg) => console.log(`   ·  ${msg}`),
  warn: (msg) => console.warn(`   ⚠️  ${msg}`),
  fail: (msg) => console.error(`   ❌ ${msg}`),
};

/** Throws with a readable message when an expectation does not hold. */
export function assert(condition, message) {
  if (!condition) throw new Error(message);
  log.ok(message);
}

/** Polls `fn` until it returns a truthy value or the timeout elapses. */
export async function waitFor(fn, { timeout = 20000, interval = 500, label = 'condition' } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return result;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`Timed out after ${timeout}ms waiting for ${label}`);
}
