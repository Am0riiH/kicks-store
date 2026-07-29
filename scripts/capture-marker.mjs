import puppeteer from 'puppeteer-core';
import { mkdir } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, '..', 'public', 'ui');
const RAW_DIR = resolve(__dirname, '..', 'test-screenshots');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DEV_URL = 'http://localhost:5173/';

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(RAW_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: false,
    args: ['--enable-webgl', '--no-sandbox', '--window-size=1440,900'],
    defaultViewport: null,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

  await page.goto(DEV_URL, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__isModelLoaded === true, { timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  await page.evaluate(() => {
    const shoe = window.__shoeGroup;
    shoe.position.set(0, -0.8, 0);
    shoe.rotation.set(0.2, 0, 0.1);
    const innerGroup = shoe.getObjectByName('innerSpin');
    if (innerGroup) innerGroup.rotation.y = 0;

    const rootChildren = document.getElementById('root')?.children;
    if (rootChildren) {
      for (let i = 0; i < rootChildren.length; i++) {
        const child = rootChildren[i];
        if (child.style.position !== 'fixed') {
          child.style.setProperty('visibility', 'hidden', 'important');
        }
      }
    }
    
    // Hide background explicitly in DOM for transparent capture
    document.body.style.background = 'transparent';
    document.documentElement.style.background = 'transparent';
  });

  await new Promise(r => setTimeout(r, 1000));
  
  const rawPath = resolve(RAW_DIR, 'marker-raw.png');
  await page.screenshot({ path: rawPath, omitBackground: true });
  await browser.close();
  
  console.log('Captured raw transparent shoe, processing with sharp...');
  
  // Crop tightly and resize to ~96px wide
  const finalPath = resolve(OUTPUT_DIR, 'sneaker-marker.webp');
  await sharp(rawPath)
    .trim() // Automatically trims transparent pixels
    .resize({ width: 96, withoutEnlargement: true })
    .webp({ quality: 80, effort: 6 })
    .toFile(finalPath);
    
  console.log('Done! Saved to:', finalPath);
}

main();
