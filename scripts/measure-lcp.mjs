import puppeteer from 'puppeteer-core';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function measureLCP() {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: false,
    args: ['--enable-webgl', '--no-sandbox']
  });

  const page = await browser.newPage();
  
  // Inject script to observe LCP
  await page.evaluateOnNewDocument(() => {
    window.__lcpData = [];
    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        const el = entry.element;
        let identifier = entry.id || entry.url || (el ? el.tagName + (el.className ? '.' + el.className.split(' ').join('.') : '') : 'Unknown');
        
        // Truncate identifier if it's too long
        if (identifier && identifier.length > 100) {
          identifier = identifier.substring(0, 100) + '...';
        }
        
        window.__lcpData.push({
          time: entry.startTime,
          element: identifier
        });
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });

  console.log('Measuring LCP...');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  
  await new Promise(r => setTimeout(r, 2000));
  
  const lcp = await page.evaluate(() => {
    return window.__lcpData;
  });
  
  console.log('\nLCP Candidates:');
  lcp.forEach(l => {
    console.log(`- ${l.time.toFixed(2)}ms : ${l.element}`);
  });
  
  await browser.close();
}

measureLCP().catch(console.error);
