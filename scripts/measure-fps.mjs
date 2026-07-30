import puppeteer from 'puppeteer-core';
import fs from 'fs';
import { execSync } from 'child_process';

const TARGET_FILE = 'public/models/air-jordan-draco.glb';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function measure(modelFile) {
  console.log(`Setting up ${modelFile}...`);
  fs.copyFileSync(`public/models/${modelFile}`, TARGET_FILE);
  execSync('npm run build');

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: false,
    args: ['--enable-webgl', '--no-sandbox']
  });
  const page = await browser.newPage();

  // Emulate mobile
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1');

  // Throttle CPU (4x slowdown)
  const client = await page.target().createCDPSession();
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  console.log('Navigating and waiting for 3D render...');
  await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' });

  // Wait for the canvas and for the model to be fully visible
  // The progress bar fades out when done
  await page.waitForSelector('.loading-bar', { hidden: true, timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000)); // wait for crossfade

  console.log('Measuring FPS during scroll for 4 seconds...');
  const fpsData = await page.evaluate(async () => {
    return new Promise((resolve) => {
      let frames = 0;
      let startTime = performance.now();
      let lastTime = startTime;
      const frameDeltas = [];

      const loop = (now) => {
        frameDeltas.push(now - lastTime);
        lastTime = now;
        frames++;
        if (now - startTime < 4000) {
          requestAnimationFrame(loop);
        } else {
          resolve({ frames, duration: now - startTime, frameDeltas });
        }
      };

      // Trigger scroll
      let scrollY = 0;
      const scrollLoop = setInterval(() => {
        scrollY += 100;
        window.scrollTo(0, scrollY);
      }, 50);

      requestAnimationFrame(loop);

      setTimeout(() => {
        clearInterval(scrollLoop);
      }, 4000);
    });
  });

  const fps = (fpsData.frames / (fpsData.duration / 1000)).toFixed(2);
  const droppedFrames = fpsData.frameDeltas.filter(d => d > 33.33).length; // < 30fps frames
  const severeDrops = fpsData.frameDeltas.filter(d => d > 50).length; // < 20fps frames
  
  console.log(`\nResults for ${modelFile}:`);
  console.log(`Average FPS: ${fps}`);
  console.log(`Frames taking >33ms: ${droppedFrames}`);
  console.log(`Frames taking >50ms (severe jank): ${severeDrops}`);
  console.log('-------------------------------------------\n');

  await browser.close();
}

(async () => {
  try {
    await measure('air-jordan-err01.glb');      // 139k
    await measure('air-jordan-draco-ktx2.glb'); // 514k
    
    // Restore the correct one
    fs.copyFileSync(`public/models/air-jordan-err01.glb`, TARGET_FILE);
    execSync('npm run build');
    console.log('Restored to optimized model.');
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
