// A small photo studio for droids: a plinth, three lights, a little bloom
// and a dark backdrop in the colour of the deck the droid comes from. The
// droid archive uses it for the pictures in its index and for the model
// that turns on each page. It has its own WebGL canvas, made the first
// time the archive opens, and only draws while a page is showing.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { DroidModel } from './droidModel.js';

const SIL = new THREE.MeshBasicMaterial({ color: 0x05060a });

// A soft glow behind the subject, fading to near black at the edges.
function backdrop(hex, dim) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const col = new THREE.Color(hex);
  const mid = col.clone().multiplyScalar(dim ? 0.12 : 0.16).lerp(new THREE.Color(0x0b0d16), 0.45);
  const grad = g.createRadialGradient(128, 112, 10, 128, 128, 180);
  grad.addColorStop(0, `#${mid.getHexString()}`);
  grad.addColorStop(1, '#040509');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Studio {
  constructor() {
    const canvas = document.createElement('canvas');
    canvas.className = 'studio';
    canvas.setAttribute('aria-hidden', 'true');
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.1;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.r = r;
    this.canvas = canvas;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);

    const s = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    s.add(new THREE.HemisphereLight(0x9aa6d0, 0x07070b, 1.2));
    const key = this.key = new THREE.DirectionalLight(0xfff2e6, 3.2);
    key.position.set(-1.6, 3.2, 2.4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 1.5, bottom: -1.5, near: 0.5, far: 8 });
    key.shadow.bias = -0.0008;
    s.add(key);
    this.rim = new THREE.DirectionalLight(0xffffff, 2.6);
    this.rim.position.set(1.8, 1.6, -2.4);
    s.add(this.rim);
    this.fill = new THREE.PointLight(0xffffff, 1.4, 6, 2);
    this.fill.position.set(1.4, 0.8, 2);
    s.add(this.fill);

    // the plinth: a dark drum with a lit ring round its top
    const p = this.plinth = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.14, 48), new THREE.MeshStandardMaterial({ color: 0x14161d, roughness: 0.55, metalness: 0.6 }));
    top.position.y = -0.07;
    top.receiveShadow = true;
    p.add(top);
    this.ringMat = new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0xffffff, emissiveIntensity: 2.2 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.63, 0.012, 8, 64), this.ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.005;
    p.add(ring);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.78, 0.18, 48), new THREE.MeshStandardMaterial({ color: 0x0b0c11, roughness: 0.8, metalness: 0.3 }));
    base.position.y = -0.23;
    p.add(base);
    s.add(p);

    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(s, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(128, 128), 0.55, 0.45, 0.78);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.backdrops = new Map();
    this.model = null;
    this.angle = 0.55;
    this.t = 0;
    this.w = 0; this.h = 0;
    this.still = false;

    // drag to turn it
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, a: this.angle }; canvas.setPointerCapture(e.pointerId); this.held = true; });
    canvas.addEventListener('pointermove', (e) => { if (drag) this.angle = drag.a + (e.clientX - drag.x) * 0.012; });
    const end = () => { drag = null; this.held = false; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  setSize(w, h, dpr = this.dpr) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    if (w === this.w && h === this.h && dpr === this.curDpr) return false;
    this.w = w; this.h = h; this.curDpr = dpr;
    this.r.setPixelRatio(dpr);
    this.r.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    return true;
  }

  // Put a droid on the plinth. spec is a DroidModel spec; ink is the deck
  // colour it's lit with; dark draws it as a silhouette.
  pose(spec, ink, dark = false) {
    if (this.model) { this.scene.remove(this.model.group); this.model.dispose(); }
    const m = this.model = new DroidModel({ ...spec, accent: dark ? 0x30343f : ink });
    this.dark = dark;
    if (dark) {
      // a flat black shape: glows, jets and screens go out altogether
      m.group.traverse((o) => {
        if (!o.isMesh) return;
        if (o.material.blending === THREE.AdditiveBlending) o.visible = false;
        else o.material = SIL;
      });
    }
    this.scene.add(m.group);
    const key = `${ink}${dark ? 'd' : ''}`;
    if (!this.backdrops.has(key)) this.backdrops.set(key, backdrop(ink, dark));
    this.scene.background = this.backdrops.get(key);
    this.ringMat.emissive.set(dark ? 0x3a3f4c : ink);
    this.rim.color.set(dark ? 0x8890a8 : ink);
    this.rim.intensity = dark ? 4.5 : 2.6;
    // frame it: the whole droid and the top of the plinth
    const H = Math.max(0.55, m.height);
    const look = new THREE.Vector3(0, H * 0.46, 0);
    const dist = 1.15 + H * 2.05;
    this.camera.position.set(0, look.y + dist * 0.32, dist);
    this.camera.lookAt(look);
    this.t = 0;
    return m;
  }

  // Advance the idle animation and draw a frame.
  frame(dt) {
    const m = this.model;
    if (!m) return;
    dt = Math.max(0, dt);
    this.t += dt;
    if (!this.still && !this.held) this.angle += dt * 0.45;
    if (!this.dark) {
      m.update(dt, { speed: 0, facing: this.angle, mood: 'patrol', visibility: 1, charge: this.still ? 0.1 : (Math.sin(this.t * 1.4) + 1) * 0.12 });
    } else {
      m.group.rotation.y = this.angle;
    }
    this.composer.render(dt);
  }

  // A still picture for the index, as an image URL.
  snapshot(spec, ink, dark, size = 112) {
    this.pose(spec, ink, dark);
    this.setSize(size, size, 1);
    const a = this.angle;
    this.angle = 0.55;
    if (!dark) this.model.update(0.016, { speed: 0, facing: this.angle, mood: 'patrol', visibility: 1, charge: 0.1 });
    else this.model.group.rotation.y = this.angle;
    this.composer.render(0.016);
    this.angle = a;
    return this.canvas.toDataURL('image/png');
  }
}
