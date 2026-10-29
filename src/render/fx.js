// Particles, shockwave rings, lightning and beams. Everything is pooled so
// a busy fight doesn't create garbage or new shaders.
import * as THREE from 'three';
import { makeGlowTexture } from './textures.js';

const MAX_P = 2400;

export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.reduced = false;

    // ---- particles
    const g = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_P * 3);
    this.pCol = new Float32Array(MAX_P * 3);
    this.pSize = new Float32Array(MAX_P);
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: makeGlowTexture() }, scale: { value: 600 } },
      vertexShader: /* glsl */`
        attribute float size;
        varying vec3 vCol;
        uniform float scale;
        void main() {
          vCol = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D map;
        varying vec3 vCol;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vCol * t.a, t.a);
        }`,
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.parts = [];
    for (let i = 0; i < MAX_P; i++) this.parts.push({ life: 0 });
    this.pNext = 0;

    // ---- rings
    this.rings = [];
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 48);
    this.ringGeo.rotateX(-Math.PI / 2);

    // ---- ribbons (lightning, beams, tethers)
    this.ribbons = [];
    this.tmp = new THREE.Vector3();
    this.camPos = new THREE.Vector3();
  }

  setReduced(r) { this.reduced = r; }

  // one particle
  emit(x, y, z, vx, vy, vz, color, life, size, grav = 0, drag = 1.5) {
    const p = this.parts[this.pNext];
    this.pNext = (this.pNext + 1) % MAX_P;
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = life; p.max = life; p.size = size; p.grav = grav; p.drag = drag;
    const c = color.isColor ? color : new THREE.Color(color);
    p.r = c.r; p.g = c.g; p.b = c.b;
  }

  burst(pos, color, n = 16, speed = 3, life = 0.6, size = 0.12, grav = 6) {
    if (this.reduced) n = Math.ceil(n / 2);
    const c = new THREE.Color(color).multiplyScalar(2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const s = speed * (0.4 + Math.random() * 0.8);
      const r = Math.sqrt(1 - u * u);
      this.emit(pos.x, pos.y, pos.z, Math.cos(a) * r * s, Math.abs(u) * s * 0.9 + 0.5, Math.sin(a) * r * s, c, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), grav);
    }
  }

  ring(pos, color, radius = 2, life = 0.5, y = 0.06) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    m.position.set(pos.x, pos.y + y, pos.z);
    m.scale.setScalar(0.1);
    this.scene.add(m);
    this.rings.push({ m, life, max: life, radius });
  }

  // A flat strip through points, turned to face the camera.
  ribbon(points, color, width = 0.06, life = 0.12, opts = {}) {
    const n = points.length;
    const pos = new Float32Array(n * 2 * 3);
    const idx = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(opts.bright ?? 2.5), transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    m.frustumCulled = false;
    m.renderOrder = 6;
    this.scene.add(m);
    const r = { m, points: points.map((p) => p.clone()), width, life, max: life, persist: !!opts.persist };
    this.layoutRibbon(r);
    this.ribbons.push(r);
    return r;
  }

  layoutRibbon(r) {
    const pos = r.m.geometry.attributes.position.array;
    const cam = this.camPos;
    const d = new THREE.Vector3(), v = new THREE.Vector3(), side = new THREE.Vector3();
    for (let i = 0; i < r.points.length; i++) {
      const p = r.points[i];
      const q = r.points[Math.min(i + 1, r.points.length - 1)];
      const o = r.points[Math.max(i - 1, 0)];
      d.subVectors(q, o).normalize();
      v.subVectors(cam, p).normalize();
      side.crossVectors(d, v).normalize().multiplyScalar(r.width * 0.5);
      pos[i * 6] = p.x + side.x; pos[i * 6 + 1] = p.y + side.y; pos[i * 6 + 2] = p.z + side.z;
      pos[i * 6 + 3] = p.x - side.x; pos[i * 6 + 4] = p.y - side.y; pos[i * 6 + 5] = p.z - side.z;
    }
    r.m.geometry.attributes.position.needsUpdate = true;
  }

  // Jagged lightning between two points.
  lightning(a, b, color, life = 0.14, width = 0.07) {
    const pts = [];
    const n = Math.max(4, Math.ceil(a.distanceTo(b) * 3));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = a.clone().lerp(b, t);
      if (i > 0 && i < n) {
        const j = 0.18 * Math.sin(t * Math.PI);
        p.x += (Math.random() - 0.5) * j * 2; p.y += (Math.random() - 0.5) * j * 2; p.z += (Math.random() - 0.5) * j * 2;
      }
      pts.push(p);
    }
    this.ribbon(pts, color, width, life);
    this.ribbon(pts, 0xffffff, width * 0.35, life * 0.8, { bright: 1.5 });
  }

  update(dt, camera) {
    this.camPos.copy(camera.position);
    // particles
    let k = 0;
    for (let i = 0; i < MAX_P; i++) {
      const p = this.parts[i];
      if (p.life <= 0) { this.pSize[i] = 0; continue; }
      p.life -= dt;
      const f = Math.exp(-p.drag * dt);
      p.vx *= f; p.vz *= f; p.vy = p.vy * f - p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const t = Math.max(0, p.life / p.max);
      this.pPos[i * 3] = p.x; this.pPos[i * 3 + 1] = p.y; this.pPos[i * 3 + 2] = p.z;
      this.pCol[i * 3] = p.r * t; this.pCol[i * 3 + 1] = p.g * t; this.pCol[i * 3 + 2] = p.b * t;
      this.pSize[i] = p.size * (0.4 + 0.6 * t);
      k++;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
    this.points.material.uniforms.scale.value = window.innerHeight * 0.9;

    // rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const t = 1 - r.life / r.max;
      r.m.scale.setScalar(0.1 + r.radius * (1 - (1 - t) * (1 - t)));
      r.m.material.opacity = Math.max(0, 1 - t);
      if (r.life <= 0) { this.scene.remove(r.m); r.m.material.dispose(); this.rings.splice(i, 1); }
    }
    // ribbons
    for (let i = this.ribbons.length - 1; i >= 0; i--) {
      const r = this.ribbons[i];
      if (!r.persist) r.life -= dt;
      r.m.material.opacity = Math.max(0, r.life / r.max);
      if (r.life <= 0) { this.kill(r); this.ribbons.splice(i, 1); continue; }
      this.layoutRibbon(r);
    }
  }

  kill(r) {
    this.scene.remove(r.m);
    r.m.geometry.dispose();
    r.m.material.dispose();
    r.dead = true;
  }

  removeRibbon(r) {
    const i = this.ribbons.indexOf(r);
    if (i >= 0) { this.kill(r); this.ribbons.splice(i, 1); }
  }

  clear() {
    for (const p of this.parts) p.life = 0;
    for (const r of this.rings) { this.scene.remove(r.m); r.m.material.dispose(); }
    for (const r of this.ribbons) this.kill(r);
    this.rings = []; this.ribbons = [];
  }
}
