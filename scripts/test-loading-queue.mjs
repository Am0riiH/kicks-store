import puppeteer from 'puppeteer-core';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function testLoadingQueue() {
  console.log('Launching browser with Slow 3G throttling...');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: false,
    args: ['--enable-webgl', '--no-sandbox']
  });

  const page = await browser.newPage();
  
  // Emulate Slow 3G
  const client = await page.target().createCDPSession();
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (500 * 1024) / 8, // 500 kbps
    uploadThroughput: (500 * 1024) / 8,
    latency: 400
  });

  // Track network requests
  page.on('request', req => {
    const url = req.url();
    if (url.match(/\.(glb|gltf|hdr|exr|png|jpg)$/i) || url.includes('rawcdn.githack.com')) {
      console.log(`[NETWORK] Started: ${url}`);
    }
  });
  
  page.on('response', async res => {
    const url = res.url();
    if (url.match(/\.(glb|gltf|hdr|exr|png|jpg)$/i) || url.includes('rawcdn.githack.com')) {
      try {
        const buffer = await res.buffer();
        console.log(`[NETWORK] Finished: ${url} - Size: ${(buffer.length / 1024).toFixed(2)} KB`);
      } catch (e) {
        console.log(`[NETWORK] Finished: ${url} - (Size unavailable)`);
      }
    }
  });

  // Also log the actual zustand useProgress values
  page.on('console', msg => {
    if (msg.text().includes('[PROGRESS]')) {
      console.log(msg.text());
    }
  });

  console.log('Navigating...');
  const startTime = Date.now();
  await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  
  // Wait for the scene to report ready
  await page.waitForFunction(() => window.__isSceneReady === true, { timeout: 120000 });
  const loadTime = Date.now() - startTime;
  console.log(`\nTime to 3D visible (Slow 3G): ${(loadTime / 1000).toFixed(2)}s`);
  
  await browser.close();
}

testLoadingQueue().catch(console.error);
