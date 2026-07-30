import puppeteer from 'puppeteer-core';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function captureShoe() {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: false,
    args: ['--enable-webgl', '--no-sandbox']
  });

  const page = await browser.newPage();
  
  // Desktop
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__isSceneReady === true, { timeout: 30000 });
  // Wait an extra second for crossfade
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: 'test-screenshots/shoe-desktop.png' });
  
  // Mobile
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__isSceneReady === true, { timeout: 30000 });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: 'test-screenshots/shoe-mobile.png' });

  await browser.close();
}

captureShoe().catch(console.error);
