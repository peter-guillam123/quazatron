// "1986 mode": renders the game the way a ZX Spectrum would have had to.
// The picture drops to 192 lines, and every 8x8 block may only use two
// colours from the Spectrum's fifteen, which is where attribute clash came from.
import * as THREE from 'three';

const PALETTE = [
  [0, 0, 0], [0, 0, 0.84], [0.84, 0, 0], [0.84, 0, 0.84], [0, 0.84, 0], [0, 0.84, 0.84], [0.84, 0.84, 0], [0.84, 0.84, 0.84],
  [0, 0, 1], [1, 0, 0], [1, 0, 1], [0, 1, 0], [0, 1, 1], [1, 1, 0], [1, 1, 1],
];

const attrShader = {
  uniforms: {
    tSrc: { value: null },
    res: { value: new THREE.Vector2(256, 192) },
    palette: { value: PALETTE.map((c) => new THREE.Vector3(...c)) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tSrc;
    uniform vec2 res;
    uniform vec3 palette[15];
    varying vec2 vUv;

    vec3 aces(vec3 x) {
      x *= 0.75;
      return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
    }
    vec3 toSrgb(vec3 c) { return pow(c, vec3(1.0 / 2.2)); }
    vec3 fetch(vec2 px) { return toSrgb(aces(texture2D(tSrc, (px + 0.5) / res).rgb)); }

    int nearest(vec3 c) {
      int best = 0; float bd = 1e9;
      for (int i = 0; i < 15; i++) {
        vec3 d = c - palette[i];
        float dist = dot(d, d * vec3(0.30, 0.59, 0.11) * 3.0);
        if (dist < bd) { bd = dist; best = i; }
      }
      return best;
    }

    float bayer(vec2 p) {
      int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
      int i = x + y * 4;
      float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
      return (m[i] + 0.5) / 16.0;
    }

    void main() {
      vec2 px = floor(vUv * res);
      vec2 block = floor(px / 8.0) * 8.0;
      float counts[15];
      for (int i = 0; i < 15; i++) counts[i] = 0.0;
      for (int y = 0; y < 8; y++) {
        for (int x = 0; x < 8; x++) {
          vec3 c = fetch(block + vec2(float(x), float(y)));
          int k = nearest(c);
          // bright colours weigh a little more, so lit edges win their block
          counts[k] += 1.0 + dot(c, vec3(0.3, 0.59, 0.11));
        }
      }
      int ink = 0; float bi = -1.0;
      for (int i = 0; i < 15; i++) if (counts[i] > bi) { bi = counts[i]; ink = i; }
      int paper = 0; float bp = -1.0;
      for (int i = 0; i < 15; i++) if (i != ink && counts[i] > bp) { bp = counts[i]; paper = i; }
      if (bp <= 0.0) paper = 0;
      vec3 a = palette[ink], b = palette[paper];
      vec3 c = fetch(px);
      vec3 ab = b - a;
      float t = clamp(dot(c - a, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
      vec3 col = t > bayer(px) ? b : a;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class SpectrumPass {
  constructor(renderer) {
    this.r = renderer;
    this.src = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 0 });
    this.low = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
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
  }

  setSize(w, h) {
    const H = 192;
    const W = Math.max(64, Math.round((H * (w / h)) / 8) * 8);
    this.src.setSize(W, H);
    this.low.setSize(W, H);
    this.attr.uniforms.res.value.set(W, H);
  }

  render(scene, camera) {
    const r = this.r;
    r.setRenderTarget(this.src);
    r.render(scene, camera);
    this.attr.uniforms.tSrc.value = this.src.texture;
    r.setRenderTarget(this.low);
    r.render(this.quadScene, this.quadCam);
    r.setRenderTarget(null);
    r.render(this.blitScene, this.quadCam);
  }
}
