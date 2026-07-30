import puppeteer from 'puppeteer-core';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function captureFailure() {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: false,
    args: ['--enable-webgl', '--no-sandbox', '--window-size=1440,900'],
    defaultViewport: null,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  console.log('Loading page with invalid GLB path...');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  
  // Wait 5 seconds to ensure any loading timeout or error state settles
  console.log('Waiting 5 seconds...');
  await new Promise(r => setTimeout(r, 5000));
  
  const hasLoadingBar = await page.evaluate(() => {
    const bars = Array.from(document.querySelectorAll('*')).filter(el => 
      el.textContent && el.textContent.includes('INITIALIZING') || 
      el.textContent && el.textContent.includes('%') && el.textContent.length < 5
    );
    return bars.length > 0;
  });
  
  console.log('Loading bar still visible?', hasLoadingBar);
  
  await page.screenshot({ path: 'test-screenshots/failure-state.png' });
  console.log('Saved screenshot to test-screenshots/failure-state.png');
  
  await browser.close();
}

captureFailure().catch(console.error);
