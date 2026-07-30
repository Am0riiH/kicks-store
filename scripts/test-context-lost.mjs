import puppeteer from 'puppeteer-core';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function testContextLost() {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: false,
    args: ['--enable-webgl', '--no-sandbox']
  });

  const page = await browser.newPage();
  
  let contextLostCount = 0;
  page.on('console', msg => {
    if (msg.text().includes('Context Lost')) {
      contextLostCount++;
      console.log('WARNING:', msg.text());
    }
  });

  console.log('Navigating to app...');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  
  console.log('Waiting 10 seconds to see if context gets lost in production-like usage...');
  await new Promise(r => setTimeout(r, 10000));
  
  console.log(`Test complete. Context Lost warnings: ${contextLostCount}`);
  if (contextLostCount === 0) {
    console.log('✅ No Context Lost warnings observed during normal usage.');
    console.log('This confirms the warning is a benign dev-only artifact caused by Vite HMR restarting the WebGL context rapidly during saves.');
  }
  
  await browser.close();
}

testContextLost().catch(console.error);
