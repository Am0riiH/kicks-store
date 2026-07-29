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
    args: ['--enable-webgl', '--no-sandbox'],
  });

  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') console.error('Browser Console Error:', msg.text());
  });
  page.on('pageerror', error => {
    console.error('Browser Page Error:', error.message);
  });

  console.log('Navigating to http://localhost:5173/');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' });
  
  // Wait a few seconds for the crash to occur
  await new Promise(r => setTimeout(r, 5000));
  
  await browser.close();
  console.log('Done');
}

main().catch(console.error);
