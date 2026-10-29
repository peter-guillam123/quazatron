// three.js renderer, camera rig and post-processing. The camera sits high to
// the south-east with a long lens, so the view reads as isometric but keeps
// real perspective for the drop into the void.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SpectrumPass } from './spectrum.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignette: { value: 0.55 },
    grain: { value: 0.018 },
    aberration: { value: 0.0025 },
    flash: { value: 0 },
    flashColor: { value: new THREE.Color(1, 1, 1) },
    desat: { value: 0 },
    dim: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float time, vignette, grain, aberration, flash, desat, dim;
    uniform vec3 flashColor;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * aberration * r2 * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l), desat);
      col *= 1.0 - vignette * smoothstep(0.08, 0.55, r2);
      col *= 1.0 - dim;
      col = mix(col, col * 0.4 + flashColor * 0.35, flash);
      col += (hash(vUv * 1000.0 + time) - 0.5) * grain;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export class Renderer {
  constructor(canvas) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.r = r;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(22, 1, 1, 400);
    this.camDir = new THREE.Vector3(1, 1.32, 1).normalize();
    this.camDist = 28;
    this.userZoom = 1;
    this.camTarget = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.shake = 0;
    this.zoom = 1;
    this.zoomTarget = 1;

    const size = new THREE.Vector2();
    r.getDrawingBufferSize(size);
    const rt = new THREE.WebGLRenderTarget(size.x || 1, size.y || 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.5, 0.72);
    this.grade = new ShaderPass(GradeShader);
    this.output = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.grade);
    this.composer.addPass(this.output);

    this.spectrum = new SpectrumPass(r);
    this.retro = false;
    this.reducedMotion = false;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.r.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep roughly the same amount of floor in view on narrow windows
    this.camera.fov = w / h < 1.2 ? 30 : 22;
    this.camera.updateProjectionMatrix();
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.spectrum.setSize(w, h);
  }

  // Ease the camera towards a point. snap=true jumps straight there.
  follow(target, dt, snap = false) {
    if (snap) this.camTarget.copy(target);
    else this.camTarget.lerp(target, 1 - Math.exp(-dt * 5));
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-dt * 3));
    this.camLook.copy(this.camTarget);
    const dist = this.camDist * this.zoom * this.userZoom;
    this.camera.position.copy(this.camTarget).addScaledVector(this.camDir, dist);
    if (this.shake > 0 && !this.reducedMotion) {
      const s = this.shake * this.shake * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.camera.lookAt(this.camLook);
  }

  addShake(a) { this.shake = Math.min(1, this.shake + a); }

  flash(color, amount) {
    if (this.reducedMotion) amount *= 0.35;
    this.grade.uniforms.flashColor.value.set(color);
    this.grade.uniforms.flash.value = Math.max(this.grade.uniforms.flash.value, amount);
  }

  // Screen-relative input to world direction on the ground plane.
  screenToWorld(x, y) {
    // camera looks along -camDir; screen right is perpendicular on the ground
    const fx = -this.camDir.x, fz = -this.camDir.z;
    const fl = Math.hypot(fx, fz);
    const ux = fx / fl, uz = fz / fl;      // screen up on the ground
    const rx = -uz, rz = ux;               // screen right
    return { x: rx * x + ux * y, z: rz * x + uz * y };
  }

  // World position to CSS pixels, for HUD labels.
  project(v, out) {
    const p = v.clone().project(this.camera);
    out.x = (p.x * 0.5 + 0.5) * window.innerWidth;
    out.y = (-p.y * 0.5 + 0.5) * window.innerHeight;
    out.visible = p.z < 1;
    return out;
  }

  render(dt) {
    const u = this.grade.uniforms;
    u.time.value = (u.time.value + dt) % 100;
    u.flash.value = Math.max(0, u.flash.value - dt * 4);
    if (this.retro) {
      this.spectrum.render(this.scene, this.camera, dt);
    } else {
      this.composer.render(dt);
    }
  }
}
