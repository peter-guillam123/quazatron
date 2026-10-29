// Just enough of a browser for the world code to run in Node: canvases
// that accept drawing calls and do nothing, and an import map for three.
import { register } from 'node:module';

const ctx = new Proxy({}, {
  get(target, prop) {
    if (prop === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (prop === 'measureText') return () => ({ width: 10 });
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (prop in target) return target[prop];
    return () => {};
  },
  set(target, prop, v) { target[prop] = v; return true; },
});

globalThis.document = {
  createElement: () => ({ width: 1, height: 1, getContext: () => ctx, style: {} }),
};
globalThis.window = globalThis;
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;

// resolve the bare 'three' import the same way the browser's import map does
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, context, next) {
  if (spec === 'three') return next(new URL('../vendor/three/build/three.module.js', '${import.meta.url}').href, context);
  return next(spec, context);
}`));
