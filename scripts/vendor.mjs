// Copies the parts of three.js the game uses from node_modules into vendor/,
// so the site runs as plain static files with no build step.
// Run after changing the three version in package.json: pnpm install && pnpm vendor
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

const src = 'node_modules/three';
const dest = 'vendor/three';
const files = [
  'LICENSE',
  'build/three.module.js',
  'build/three.core.js',
  'examples/jsm/postprocessing/EffectComposer.js',
  'examples/jsm/postprocessing/MaskPass.js',
  'examples/jsm/postprocessing/OutputPass.js',
  'examples/jsm/postprocessing/Pass.js',
  'examples/jsm/postprocessing/RenderPass.js',
  'examples/jsm/postprocessing/ShaderPass.js',
  'examples/jsm/postprocessing/UnrealBloomPass.js',
  'examples/jsm/shaders/CopyShader.js',
  'examples/jsm/shaders/LuminosityHighPassShader.js',
  'examples/jsm/shaders/OutputShader.js',
];

rmSync(dest, { recursive: true, force: true });
for (const f of files) {
  const to = join(dest, f);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(join(src, f), to);
}
console.log(`Copied ${files.length} files to ${dest}`);
