// Scrap: the bits that burst out of a wrecked droid. They bounce, settle and
// get pulled into KLP-2 when it rolls near. Spend it at a fabricator.
import * as THREE from 'three';
import { VOID_Y } from '../config.js';

const MAX = 240;
const LIFE = 30;
const MAGNET = 3.4;

// How much a droid of this class is worth in scrap.
export function scrapFor(cls) {
  return 2 + Math.floor(cls / 70);
}

export class ScrapField {
  constructor(world) {
    this.world = world;
    const geo = new THREE.BoxGeometry(0.13, 0.08, 0.13);
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.35, metalness: 0.9, emissive: 0xffe2a8, emissiveIntensity: 0.55 });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    world.root.add(this.mesh);
    this.bits = [];
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.s = new THREE.Vector3(1, 1, 1);
    this.v = new THREE.Vector3();
    this.chain = 0;
    this.chainT = 0;
  }

  // n bits flying out of a point
  burst(pos, n, opts = {}) {
    for (let i = 0; i < n; i++) {
      if (this.bits.length >= MAX) this.bits.shift();
      const a = Math.random() * Math.PI * 2;
      const s = (opts.speed ?? 2.6) * (0.5 + Math.random() * 0.7);
      this.bits.push({
        x: pos.x, y: pos.y + 0.3, z: pos.z,
        vx: Math.cos(a) * s, vy: 3 + Math.random() * 3, vz: Math.sin(a) * s,
        rx: Math.random() * 6, ry: Math.random() * 6, spin: (Math.random() - 0.5) * 14,
        t: 0, rest: false, pull: opts.pull || 0,
      });
    }
  }

  update(dt) {
    const w = this.world, g = w.grid, p = w.player;
    this.chainT -= dt;
    if (this.chainT <= 0) this.chain = 0;
    let n = 0;
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.t += dt;
      let gone = b.t > LIFE;
      // drawn in once it has had a moment to fly
      if (p && p.alive && b.t > 0.4) {
        const dx = p.pos.x - b.x, dy = p.pos.y + 0.35 - b.y, dz = p.pos.z - b.z;
        const d = Math.hypot(dx, dy, dz);
        if (d < MAGNET + b.pull) {
          b.rest = false;
          const k = 26 / Math.max(0.4, d);
          b.vx += (dx / d) * k * dt; b.vy += (dy / d) * k * dt; b.vz += (dz / d) * k * dt;
          const f = Math.exp(-3 * dt);
          b.vx *= f; b.vy *= f; b.vz *= f;
          b.homing = true;
          if (d < 0.4) { this.collect(); gone = true; }
        } else b.homing = false;
      }
      if (!gone && !b.rest) {
        if (!b.homing) b.vy -= 18 * dt;
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        b.rx += b.spin * dt; b.ry += b.spin * 0.7 * dt;
        const gy = g.groundAt(b.x, b.z);
        if (!b.homing && gy !== null && b.y < gy + 0.04 && b.y > gy - 0.5) {
          b.y = gy + 0.04;
          if (Math.abs(b.vy) < 1.2) { b.rest = true; b.vx = b.vz = b.vy = 0; } else { b.vy *= -0.35; b.vx *= 0.6; b.vz *= 0.6; }
        }
        if (b.y < VOID_Y) gone = true;
      }
      if (gone) { this.bits.splice(i, 1); continue; }
    }
    for (const b of this.bits) {
      // blink out in the last few seconds
      const blink = b.t > LIFE - 4 && Math.floor(b.t * 6) % 2 === 0;
      this.e.set(b.rx, b.ry, 0);
      this.q.setFromEuler(this.e);
      this.s.setScalar(blink ? 0.001 : 1);
      this.v.set(b.x, b.y + (b.rest ? Math.sin(b.t * 3 + b.x) * 0.02 : 0), b.z);
      this.m4.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(n++, this.m4);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  collect() {
    this.chain = Math.min(this.chain + 1, 24);
    this.chainT = 0.5;
    this.world.game.addScrap(1, this.chain);
  }

  dispose() {
    this.world.root.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
