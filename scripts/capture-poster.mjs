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

  await page.goto(DEV_URL, { waitUntil: 'networkidle0', timeout: 60000 });

  console.log('   ⏳ Waiting for model to load...');
  await page.waitForFunction(() => window.__isModelLoaded === true, {
    timeout: 60000,
    polling: 200,
  });
  console.log('   ✅ Model loaded');

  await new Promise((r) => setTimeout(r, 2500));

  await page.evaluate(() => {
    const shoe = window.__shoeGroup;
    if (!shoe) throw new Error('__shoeGroup not found on window');

    shoe.position.set(0, -0.8, 0);
    shoe.rotation.set(0.2, 0, 0.1);

    const isMobile = window.innerWidth < 640;
    const heroEndScale = isMobile ? 0.72 : 1;
    shoe.scale.set(heroEndScale, heroEndScale, heroEndScale);

    const innerGroup = shoe.getObjectByName('innerSpin');
    if (innerGroup) innerGroup.rotation.y = 0;

    if (window.__invalidate) window.__invalidate();

    const rootChildren = document.getElementById('root')?.children;
    if (rootChildren) {
      for (let i = 0; i < rootChildren.length; i++) {
        const child = rootChildren[i];

        if (child.style.position !== 'fixed') {
          child.style.setProperty('visibility', 'hidden', 'important');
          child.style.setProperty('opacity', '0', 'important');
        }
      }
    }

    document.querySelectorAll('[class*="grain"], [class*="Grain"]').forEach((el) => {
      el.style.setProperty('visibility', 'hidden', 'important');
    });
  });

  await new Promise((r) => setTimeout(r, 800));

  await page.evaluate(() => {
    if (window.__invalidate) window.__invalidate();
  });
  await new Promise((r) => setTimeout(r, 500));

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
    headless: false,
    args: [
      '--enable-webgl',
      '--no-sandbox',
      '--disable-extensions',
      '--window-size=1920,1080',
      '--disable-infobars',
    ],
    defaultViewport: null,
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
