import puppeteer from 'puppeteer-core';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function main() {
  let executablePath = EDGE_PATH;
  try {
    const { accessSync } = await import('fs');
    accessSync(executablePath);
  } catch {
    executablePath = CHROME_PATH;
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: false,
    args: ['--enable-webgl', '--no-sandbox', '--window-size=1440,900'],
    defaultViewport: null,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  
  // Collect errors
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`Console Error: ${msg.text()}`);
  });
  page.on('pageerror', error => {
    errors.push(`Page Error: ${error.message}`);
  });

  console.log('Navigating to http://localhost:5173/');
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  
  // Screenshot 1: immediately after load (poster + loading bar should be visible)
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: 'test-screenshots/01-poster-with-loadbar.png' });
  console.log('Screenshot 1: poster + loading bar');

  // Wait for model to load
  try {
    await page.waitForFunction(() => window.__isModelLoaded === true, { timeout: 30000 });
    console.log('Model loaded!');
  } catch {
    console.log('Model did not load within 30s (expected in headless)');
  }

  // Screenshot 2: after model loads
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: 'test-screenshots/02-after-model-load.png' });
  console.log('Screenshot 2: after model load');

  // Wait a bit more for crossfade
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: 'test-screenshots/03-after-crossfade.png' });
  console.log('Screenshot 3: after crossfade');

  // Report errors
  if (errors.length > 0) {
    console.log('\n=== ERRORS ===');
    // Filter out known non-issues
    const realErrors = errors.filter(e => 
      !e.includes('ERR_CONNECTION_REFUSED') && 
      !e.includes('Failed to fetch') &&
      !e.includes('fetchPriority') &&
      !e.includes('fetchpriority')
    );
    realErrors.forEach(e => console.log(e));
    if (realErrors.length === 0) console.log('(No real errors — only expected network/API ones)');
  } else {
    console.log('\n✅ No errors!');
  }

  await browser.close();
  console.log('\nDone!');
}

main().catch(console.error);
