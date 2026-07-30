import puppeteer from 'puppeteer-core';
import fs from 'fs';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function generateSmallHDR() {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: false,
    args: ['--enable-webgl', '--no-sandbox']
  });

  const page = await browser.newPage();
  
  // Go to the dev server to have access to THREE
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  
  console.log('Page loaded. Running exporter script...');
  
  const exrData = await page.evaluate(async () => {
    return new Promise((resolve) => {
      Promise.all([
        import('https://esm.sh/three@0.160.0'),
        import('https://esm.sh/three@0.160.0/examples/jsm/loaders/RGBELoader.js'),
        import('https://esm.sh/three@0.160.0/examples/jsm/exporters/EXRExporter.js')
      ]).then(([THREE, { RGBELoader }, { EXRExporter }]) => {
        
        const loader = new RGBELoader();
        loader.load('https://raw.githack.com/pmndrs/drei-assets/456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri/potsdamer_platz_1k.hdr', function(texture) {
          console.log('Loaded HDR:', texture.image.width, texture.image.height);
          
          const width = 256;
          const height = 128;
          
          const renderer = new THREE.WebGLRenderer();
          renderer.setSize(width, height);
          
          const scene = new THREE.Scene();
          const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
          
          const material = new THREE.MeshBasicMaterial({ map: texture });
          const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
          scene.add(quad);
          
          const renderTarget = new THREE.WebGLRenderTarget(width, height, {
            type: THREE.HalfFloatType,
            format: THREE.RGBAFormat,
            colorSpace: THREE.LinearSRGBColorSpace,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
          });
          
          renderer.setRenderTarget(renderTarget);
          renderer.render(scene, camera);
          
          const exporter = new EXRExporter();
          const exrBuffer = exporter.parse(renderer, renderTarget);
          
          const binary = Array.from(exrBuffer).map(b => String.fromCharCode(b)).join('');
          resolve(btoa(binary));
        });
      }).catch(err => {
        resolve("ERROR: " + err.toString());
      });
    });
  });
  
  if (exrData.startsWith("ERROR")) {
    console.error(exrData);
  } else {
    const buffer = Buffer.from(exrData, 'base64');
    fs.writeFileSync('public/ui/potsdamer_platz_256.exr', buffer);
    console.log('Saved 256x128 EXR to public/ui/potsdamer_platz_256.exr');
    console.log('Size:', (buffer.length / 1024).toFixed(2), 'KB');
  }

  await browser.close();
}

generateSmallHDR().catch(console.error);
