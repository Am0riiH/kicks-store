/**
 * Confirm the "Cannot update a component" warning is gone after the fix.
 */
import puppeteer from 'puppeteer-core';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const browser = await puppeteer.launch({
  executablePath: EDGE_PATH,
  headless: false,
  args: ['--enable-webgl', '--no-sandbox', '--window-size=1440,900'],
  defaultViewport: null,
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

const warnings = [];
page.on('console', msg => {
  const text = msg.text();
  if (text.includes('Cannot update a component')) {
    warnings.push(text);
  }
});

await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 15000 });

try {
  await page.waitForFunction(() => window.__isModelLoaded === true, { timeout: 30000 });
} catch {
  // The model may never report loaded on a slow machine. Carry on regardless —
  // this script measures React warnings, not load success.
}
await new Promise(r => setTimeout(r, 3000));

console.log(`\n[ProgressBridge ENABLED (fixed)] "Cannot update" warnings: ${warnings.length}`);
if (warnings.length > 0) {
  for (const w of warnings) {
    console.log(`  ↳ ${w.substring(0, 300)}`);
  }
} else {
  console.log('  ✅ No warnings! Fix confirmed.');
}

await browser.close();
