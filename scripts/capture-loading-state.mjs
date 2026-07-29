import puppeteer from 'puppeteer-core';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, dpr: 2 },
  { name: 'mobile', width: 390, height: 844, dpr: 2 },
];

async function run() {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: false,
    args: ['--enable-webgl', '--no-sandbox', '--window-size=1440,900'],
    defaultViewport: null,
  });

  for (const vp of VIEWPORTS) {
    console.log(`Capturing ${vp.name}...`);
    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr });

    // Intercept the GLB request and delay it forever to capture the loading state
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (request.url().endsWith('.glb')) {
        setTimeout(() => request.continue(), 15000);
      } else {
        request.continue();
      }
    });

    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
    
    // Wait a moment for the watermark animation to settle slightly
    await new Promise(r => setTimeout(r, 2000));
    
    await page.screenshot({ path: `test-screenshots/loading-${vp.name}.png` });
    await page.close();
  }
  
  await browser.close();
  console.log('Screenshots saved!');
}

run();
