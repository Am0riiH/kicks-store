/**
 * process-posters.mjs
 * Converts captured PNG posters into optimized WebP variants.
 * Run after capture-poster.mjs.
 */
import sharp from 'sharp';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(__dirname, '..', 'public', 'posters');

async function convert(name, quality) {
  const input = resolve(DIR, `${name}.png`);
  const output = resolve(DIR, `${name}.webp`);
  const info = await sharp(input).webp({ quality }).toFile(output);
  console.log(`✅ ${name}.webp — ${(info.size / 1024).toFixed(1)} KB  (${info.width}×${info.height})`);
}

await convert('shoe-poster-desktop', 82);
await convert('shoe-poster-mobile', 80);

console.log('\nDone! WebP variants ready in public/posters/');
