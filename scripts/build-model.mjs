import { execSync } from 'child_process';
import fs from 'fs';

const args = process.argv.slice(2);
let ratio = "0.5";
let error = "1";
let variantName = "default";

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--ratio') {
    ratio = args[i + 1];
  }
  if (args[i] === '--error') {
    error = args[i + 1];
  }
  if (args[i] === '--name') {
    variantName = args[i + 1];
  }
}

const input = "public/models/air-jordan.glb";
const temp1 = "public/models/temp-weld-simplify.glb";
const temp2 = "public/models/temp-ktx2.glb";
const output = `public/models/air-jordan-${variantName}.glb`;

console.log(`Building variant: ${variantName}`);
console.log(`- Ratio: ${ratio}`);
console.log(`- Error: ${error}`);

try {
  console.log(`\n1. Welding...`);
  execSync(`npx -y @gltf-transform/cli weld ${input} ${temp1}`, { stdio: 'inherit' });
  
  console.log(`\n2. Simplifying...`);
  execSync(`npx -y @gltf-transform/cli simplify ${temp1} ${temp1} --ratio ${ratio} --error ${error}`, { stdio: 'inherit' });

  console.log(`\n3. Compressing Textures to KTX2...`);
  execSync(`.\\gltfpack.exe -i ${temp1} -o ${temp2} -tc`, { stdio: 'inherit' });

  console.log(`\n4. Compressing Geometry with Draco...`);
  execSync(`npx -y @gltf-transform/cli draco ${temp2} ${output}`, { stdio: 'inherit' });

  // Cleanup
  if (fs.existsSync(temp1)) fs.unlinkSync(temp1);
  if (fs.existsSync(temp2)) fs.unlinkSync(temp2);

  console.log(`\nDone! Output saved to ${output}`);
} catch (e) {
  console.error("Pipeline failed:", e.message);
  process.exit(1);
}
