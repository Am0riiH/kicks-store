/**
 * capture-poster.mjs  (v2 — headed mode + dark background)
 *
 * Captures the 3D shoe in its resting pose on the site's dark background (#0a0a0b).
 * Uses headed mode for proper GPU-accelerated WebGL rendering.
 *
 * Usage:
 *   1. Start the dev server: npm run dev
 *   2. Run: node scripts/capture-poster.mjs
 */

import puppeteer from 'puppeteer-core';
import { mkdir } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, '..', 'public', 'posters');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEV_URL = 'http://localhost:5173/';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, dpr: 2 },
  { name: 'mobile', width: 390, height: 844, dpr: 2 },
];

async function captureAtViewport(browser, { name, width, height, dpr }) {
  console.log(`\n📐 Capturing ${name} (${width}×${height} @${dpr}x)...`);

  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: dpr });

  // Navigate and wait for network idle
  await page.goto(DEV_URL, { waitUntil: 'networkidle0', timeout: 60000 });

  // Wait for the 3D model to finish loading
  console.log('   ⏳ Waiting for model to load...');
  await page.waitForFunction(() => window.__isModelLoaded === true, {
    timeout: 60000,
    polling: 200,
  });
  console.log('   ✅ Model loaded');

  // Wait for the intro animation to finish playing (~2s after model load)
  await new Promise((r) => setTimeout(r, 2500));

  // Position shoe in its resting pose + reset inner spin + hide DOM overlays
  await page.evaluate(() => {
    const shoe = window.__shoeGroup;
    if (!shoe) throw new Error('__shoeGroup not found on window');

    // Resting pose — matches where the intro animation settles
    shoe.position.set(0, -0.8, 0);
    shoe.rotation.set(0.2, 0, 0.1);

    // Scale depends on viewport (mobile uses 0.72, desktop uses 1)
    const isMobile = window.innerWidth < 640;
    const heroEndScale = isMobile ? 0.72 : 1;
    shoe.scale.set(heroEndScale, heroEndScale, heroEndScale);

    // Reset inner spin to rotation 0 for deterministic capture
    const innerGroup = shoe.getObjectByName('innerSpin');
    if (innerGroup) innerGroup.rotation.y = 0;

    // Force a re-render in demand mode
    if (window.__invalidate) window.__invalidate();

    // Hide ALL visible DOM content — we only want the canvas shoe
    // The canvas is position:fixed, so hiding the root children reveals it alone
    const rootChildren = document.getElementById('root')?.children;
    if (rootChildren) {
      // The first child is the SceneCanvas wrapper (position:fixed), keep it visible
      // Hide everything else (GrainOverlay, page content div, InstallPrompt)
      for (let i = 0; i < rootChildren.length; i++) {
        const child = rootChildren[i];
        // Keep the fixed canvas wrapper, hide everything else
        if (child.style.position !== 'fixed') {
          child.style.setProperty('visibility', 'hidden', 'important');
          child.style.setProperty('opacity', '0', 'important');
        }
      }
    }

    // Also hide the grain overlay specifically
    document.querySelectorAll('[class*="grain"], [class*="Grain"]').forEach((el) => {
      el.style.setProperty('visibility', 'hidden', 'important');
    });
  });

  // Wait for the frame to render with new pose
  await new Promise((r) => setTimeout(r, 800));

  // Force another invalidate
  await page.evaluate(() => {
    if (window.__invalidate) window.__invalidate();
  });
  await new Promise((r) => setTimeout(r, 500));

  // Take screenshot — keep the dark background (no omitBackground)
  // This is correct because the poster will sit on the same dark page bg
  const outputPath = resolve(OUTPUT_DIR, `shoe-poster-${name}.png`);
  await page.screenshot({
    path: outputPath,
    omitBackground: false,
    fullPage: false,
  });

  console.log(`   💾 Saved: ${outputPath}`);
  await page.close();
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  // Try Edge first, fall back to Chrome
  let executablePath = EDGE_PATH;
  try {
    const { accessSync } = await import('fs');
    accessSync(executablePath);
  } catch {
    console.log('Edge not found, trying Chrome...');
    executablePath = CHROME_PATH;
  }

  console.log(`🚀 Launching browser (headed mode for GPU WebGL): ${executablePath}`);
  const browser = await puppeteer.launch({
    executablePath,
    headless: false, // headed mode for real GPU WebGL
    args: [
      '--enable-webgl',
      '--no-sandbox',
      '--disable-extensions',
      '--window-size=1920,1080',
      '--disable-infobars',
    ],
    defaultViewport: null, // let setViewport handle it per page
  });

  try {
    for (const vp of VIEWPORTS) {
      await captureAtViewport(browser, vp);
    }
    console.log('\n✅ All captures complete!');
    console.log(`   Files in: ${OUTPUT_DIR}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('❌ Capture failed:', err);
  process.exit(1);
});
