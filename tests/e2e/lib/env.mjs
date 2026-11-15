import { accessSync } from 'node:fs';

export const FRONTEND_URL = (
  process.env.E2E_FRONTEND_URL || 'http://localhost:5173'
).replace(/\/$/, '');
export const API_URL = (process.env.E2E_API_URL || 'http://localhost:3001').replace(
  /\/$/,
  ''
);

export const ADMIN_USER = process.env.E2E_ADMIN_USER;
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

export const HEADED = process.argv.includes('--headed');

export function adminHeader() {
  return `Basic ${Buffer.from(`${ADMIN_USER}:${ADMIN_PASSWORD}`).toString('base64')}`;
}

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
      // not installed here, try the next one
    }
  }
  throw new Error(
    'No Chromium-based browser found. Set E2E_BROWSER_PATH to a Chrome or Edge ' +
      `executable. Looked in:\n  ${CANDIDATES.join('\n  ')}`
  );
}

export const log = {
  step: (msg) => console.log(`\n▶  ${msg}`),
  ok: (msg) => console.log(`   ✅ ${msg}`),
  info: (msg) => console.log(`   ·  ${msg}`),
  warn: (msg) => console.warn(`   ⚠️  ${msg}`),
  fail: (msg) => console.error(`   ❌ ${msg}`),
};

export function assert(condition, message) {
  if (!condition) throw new Error(message);
  log.ok(message);
}

export async function waitFor(
  fn,
  { timeout = 20000, interval = 500, label = 'condition' } = {}
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return result;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`Timed out after ${timeout}ms waiting for ${label}`);
}
