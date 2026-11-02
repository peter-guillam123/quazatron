// "1986 mode": renders the game the way a ZX Spectrum would have had to.
// The picture drops to 192 lines and every 8x8 block gets one bright ink on
// black paper. Where KLP-2's cyan meets a magenta deck, the block has to
// pick one: that's attribute clash.
//
// It's drawn as line art, the way Quazatron itself was: outlines come from
// the shapes (where the depth of the scene folds or jumps), not from
// textures, so floors don't turn to speckle. Droids are filled in solid,
// from a mask of droid shapes, with their dark parts cut out in black.
// Only the brightest lights are drawn as fills. No dither.
import * as THREE from 'three';

// droids register their models here so the mask can find them
export const DROID_LAYER = 3;
export const DROID_ROOTS = new Set();
const PALETTE = [
  [0, 0, 0], [0, 0, 0.84], [0.84, 0, 0], [0.84, 0, 0.84], [0, 0.84, 0], [0, 0.84, 0.84], [0.84, 0.84, 0], [0.84, 0.84, 0.84],
  [0, 0, 1], [1, 0, 0], [1, 0, 1], [0, 1, 0], [0, 1, 1], [1, 1, 0], [1, 1, 1],
];

const attrShader = {
  uniforms: {
    tSrc: { value: null },
    tDepth: { value: null },
    tMask: { value: null },
    tMaskDepth: { value: null },
    res: { value: new THREE.Vector2(256, 192) },
    near: { value: 1 },
    far: { value: 400 },
    palette: { value: PALETTE.map((c) => new THREE.Vector3(...c)) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tSrc;
    uniform sampler2D tDepth;
    uniform sampler2D tMask;
    uniform sampler2D tMaskDepth;
    uniform vec2 res;
    uniform float near;
    uniform float far;
    uniform vec3 palette[15];
    varying vec2 vUv;

    vec2 at(vec2 px) { return (px + 0.5) / res; }
    vec3 aces(vec3 x) {
      x *= 0.75;
      return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
    }
    vec3 fetch(vec2 px) { return clamp(pow(aces(texture2D(tSrc, at(px)).rgb * 1.4), vec3(1.0 / 2.2)), 0.0, 1.0); }
    float lum(vec3 c) { return max(c.r, max(c.g, c.b)); }

    // depth, as distance, and as one over distance (which runs in straight
    // lines across any flat surface, so it only bends where shapes fold)
    float raw(vec2 px) { return texture2D(tDepth, at(px)).x; }
    float dist(float d) { float z = d * 2.0 - 1.0; return (2.0 * near * far) / (far + near - z * (far - near)); }
    float inv(vec2 px) { return 1.0 / dist(raw(px)); }
    bool empty(vec2 px) { return raw(px) > 0.99999; }

    // a fold (> 0 on the near side of an edge, < 0 in an inside corner)
    float fold(vec2 px) {
      float c = inv(px);
      float s = inv(px + vec2(1.0, 0.0)) + inv(px - vec2(1.0, 0.0)) + inv(px + vec2(0.0, 1.0)) + inv(px - vec2(0.0, 1.0));
      return (4.0 * c - s) / c;
    }

    // is this pixel a droid, and the nearest thing here?
    bool droid(vec2 px) {
      if (texture2D(tMask, at(px)).r < 0.5) return false;
      return abs(dist(texture2D(tMaskDepth, at(px)).x) - dist(raw(px))) < 0.25;
    }

    void main() {
      vec2 px = floor(vUv * res);
      vec2 block = floor(px / 8.0) * 8.0;
      // Paper is always black, as in the original. Each block picks one bright
      // ink: the hue that carries most light in it, droids counting double.
      float w[7];
      for (int i = 0; i < 7; i++) w[i] = 0.0;
      for (int y = 0; y < 8; y++) {
        for (int x = 0; x < 8; x++) {
          vec2 q = block + vec2(float(x), float(y));
          vec3 c = fetch(q);
          float m = lum(c);
          if (m < 0.04) continue;
          vec3 n = c / m;
          int best = 6; float bd = 1e9;
          for (int i = 0; i < 7; i++) {
            vec3 d = n - palette[8 + i];
            float dd = dot(d, d);
            if (dd < bd) { bd = dd; best = i; }
          }
          w[best] += m * m * (droid(q) ? 2.0 : 1.0);
        }
      }
      int ink = 6; float bw = 0.0;
      for (int i = 0; i < 7; i++) if (w[i] > bw) { bw = w[i]; ink = i; }

      float l = lum(fetch(px));
      bool on = false;
      if (droid(px)) {
        // solid, with the dark parts (visors, wheels) and its sharp folds cut
        // out; gentle curves (a dome) stay solid
        float f = empty(px) ? 0.0 : fold(px);
        on = l > 0.12 && abs(f) < 0.03;
      } else if (!empty(px)) {
        float f = fold(px);
        // outlines: the near side of every edge, and inside corners, but
        // not the far side of a big step (that would double the line)
        on = f > 0.0016 || (f < -0.0016 && f > -0.012) || l > 0.66;
      } else {
        on = l > 0.66;   // sparks and glows over the void
      }
      gl_FragColor = vec4(on ? palette[8 + ink] : vec3(0.0), 1.0);
    }`,
};

export class SpectrumPass {
  constructor(renderer) {
    this.r = renderer;
    const depth = () => { const d = new THREE.DepthTexture(4, 4); d.type = THREE.UnsignedIntType; return d; };
    this.src = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 0, depthTexture: depth() });
    this.mask = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthTexture: depth() });
    this.low = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    for (const t of [this.src.texture, this.src.depthTexture, this.mask.texture, this.mask.depthTexture]) { t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; }
    this.white = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    this.attr = new THREE.ShaderMaterial({ ...attrShader, uniforms: THREE.UniformsUtils.clone(attrShader.uniforms) });
    this.attr.uniforms.palette.value = PALETTE.map((c) => new THREE.Vector3(...c));
    // a raw copy: the attribute pass already wrote display-ready colours
    this.blit = new THREE.ShaderMaterial({
      uniforms: { t: { value: this.low.texture } },
      vertexShader: attrShader.vertexShader,
      fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main() { gl_FragColor = texture2D(t, vUv); }',
    });
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.attr);
    this.quadScene.add(this.quad);
    this.blitScene = new THREE.Scene();
    const bq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blit);
    this.blitScene.add(bq);
    this.clear = new THREE.Color();
  }

  setSize(w, h) {
    const H = 192;
    const W = Math.max(64, Math.round((H * (w / h)) / 8) * 8);
    this.src.setSize(W, H);
    this.mask.setSize(W, H);
    this.low.setSize(W, H);
    this.attr.uniforms.res.value.set(W, H);
  }

  render(scene, camera) {
    const r = this.r;
    r.setRenderTarget(this.src);
    r.render(scene, camera);
    // the droids alone, in white on black: what gets filled in solid
    // (see-through parts, like a raised shield, stay out of it)
    for (const g of DROID_ROOTS) {
      g.traverse((o) => { if (o.material && o.material.transparent) o.layers.disable(DROID_LAYER); else o.layers.enable(DROID_LAYER); });
    }
    const layers = camera.layers.mask, bg = scene.background, fog = scene.fog;
    r.getClearColor(this.clear);
    const alpha = r.getClearAlpha();
    camera.layers.set(DROID_LAYER);
    scene.overrideMaterial = this.white;
    scene.background = null; scene.fog = null;
    r.setClearColor(0x000000, 1);
    r.setRenderTarget(this.mask);
    r.clear();
    r.render(scene, camera);
    scene.overrideMaterial = null;
    scene.background = bg; scene.fog = fog;
    camera.layers.mask = layers;
    r.setClearColor(this.clear, alpha);
    const u = this.attr.uniforms;
    u.tSrc.value = this.src.texture;
    u.tDepth.value = this.src.depthTexture;
    u.tMask.value = this.mask.texture;
    u.tMaskDepth.value = this.mask.depthTexture;
    u.near.value = camera.near; u.far.value = camera.far;
    r.setRenderTarget(this.low);
    r.render(this.quadScene, this.quadCam);
    r.setRenderTarget(null);
    r.render(this.blitScene, this.quadCam);
  }
}
