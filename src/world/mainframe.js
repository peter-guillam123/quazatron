// Class 999, the Mainframe. It sits behind a shield held up by four relays,
// calls droids to its defence and sprays bolts. Hack all four relays to drop
// the shield, then grapple the Mainframe itself: best of three boards.
import * as THREE from 'three';
import { LEVEL_H, PLAYER_COLOUR } from '../config.js';
import { makeNumberTexture } from '../render/textures.js';
import { familiesForRange } from './roster.js';

const CYAN = new THREE.Color(PLAYER_COLOUR);

export class Mainframe {
  constructor(world, t) {
    this.world = world;
    this.kind = 'mainframe';
    this.x = t.x; this.z = t.z; this.h = t.h;
    this.y = t.h * LEVEL_H;
    this.pos = new THREE.Vector3(t.x + 0.5, this.y, t.z + 0.5);
    this.room = t.room;
    this.radius = 1.5;
    this.team = 'h';
    this.cls = 999;
    this.relaysUp = 4;
    this.spawnT = 6;
    this.fireT = 4;
    this.spin = 0;
    this.awake = false;
    this.beaten = false;

    const g = new THREE.Group();
    g.position.copy(this.pos);
    world.root.add(g);
    this.group = g;
    const ink = new THREE.Color(world.deck.ink);
    this.glow = new THREE.MeshStandardMaterial({ color: 0x050505, emissive: ink, emissiveIntensity: 2.4 });
    const dark = new THREE.MeshPhysicalMaterial({ color: 0x15161c, roughness: 0.25, metalness: 0.6, clearcoat: 1 });
    const steel = world.mats.steel;

    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 0.4, 8), dark);
    base.position.y = 0.2; base.castShadow = true; g.add(base);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.8, 2.4, 8), dark);
    column.position.y = 1.6; column.castShadow = true; g.add(column);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.0, 0.06), this.glow);
      strip.position.set(Math.cos(a) * 0.7, 1.6, Math.sin(a) * 0.7);
      g.add(strip);
    }
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), this.glow);
    this.core.position.y = 3.3;
    g.add(this.core);
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.95 + i * 0.28, 0.05, 8, 64), i === 1 ? this.glow : steel);
      r.position.y = 3.3;
      r.castShadow = true;
      g.add(r);
      this.rings.push(r);
    }
    const tex = makeNumberTexture('999', '#ffffff');
    this.numMat = new THREE.MeshBasicMaterial({ map: tex, color: ink.clone().multiplyScalar(1.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), this.numMat);
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      p.position.set(Math.sin(a) * 0.79, 1.9, Math.cos(a) * 0.79);
      p.rotation.y = a;
      g.add(p);
    }
    this.shieldMat = new THREE.MeshBasicMaterial({ color: ink.clone().multiplyScalar(0.7), transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, wireframe: false });
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(2.1, 40, 24), this.shieldMat);
    this.shield.position.y = 1.7;
    g.add(this.shield);
    this.wire = new THREE.Mesh(new THREE.IcosahedronGeometry(2.12, 2), new THREE.MeshBasicMaterial({ color: ink.clone().multiplyScalar(0.9), wireframe: true, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.wire.position.y = 1.7;
    g.add(this.wire);

    // the Mainframe fills a 3x3 block of tiles
    const grid = world.grid;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) grid.block[grid.idx(t.x + dx, t.z + dz)] = 1;
  }

  get alive() { return !this.beaten; }
  get integrity() { return 1; }

  relayDown() {
    this.relaysUp = Math.max(0, this.relaysUp - 1);
    const w = this.world;
    w.audio.play('relay');
    w.renderer.addShake(0.4);
    if (this.relaysUp === 0) {
      w.game.toast('The shield is down. Grapple the Mainframe.');
      w.game.announce('The Mainframe’s shield is down.');
    } else {
      w.game.toast(`Relay down. ${this.relaysUp} to go.`);
    }
  }

  relayUp() {
    const down = this.world.relays.filter((r) => r.on);
    if (!down.length) return;
    const r = down[Math.floor(Math.random() * down.length)];
    r.on = false;
    r.screenMat.color.copy(new THREE.Color(this.world.deck.ink)).multiplyScalar(1.6);
    r.lightMat.emissive.copy(new THREE.Color(this.world.deck.ink));
    this.relaysUp += 1;
    this.world.game.toast('The Mainframe rebooted a relay.');
  }

  canHack() { return this.relaysUp === 0 && !this.beaten; }
  hackSpec() { return { title: 'Mainframe 999', cls: 999, rows: 12, pulsers: 6, timer: 11, rounds: 3, boss: true }; }
  onHackWin() {
    this.beaten = true;
    this.glow.emissive.copy(CYAN);
    this.numMat.color.copy(CYAN).multiplyScalar(1.8);
    this.world.claimEvent('mainframe');
    this.world.game.victory();
  }
  onHackLose() { this.relayUp(); }

  update(dt) {
    const w = this.world;
    this.spin += dt;
    this.core.rotation.y += dt * 0.8;
    this.core.rotation.x += dt * 0.3;
    this.rings.forEach((r, i) => { r.rotation.x = Math.PI / 2 + Math.sin(this.spin * 0.6 + i) * 0.5; r.rotation.y = this.spin * (0.4 + i * 0.25) * (i % 2 ? -1 : 1); });
    const shielded = this.relaysUp > 0;
    const target = shielded ? 1 : 0;
    this.shield.scale.setScalar(Math.max(0.01, this.shield.scale.x + (target - this.shield.scale.x) * Math.min(1, dt * 3)));
    this.wire.scale.copy(this.shield.scale);
    this.wire.rotation.y += dt * 0.2;
    this.shield.visible = this.wire.visible = this.shield.scale.x > 0.02;
    if (this.beaten) return;

    const p = w.player;
    if (!p || !p.alive) return;
    const dist = p.pos.distanceTo(this.pos);
    if (!this.awake && dist < 11) { this.awake = true; w.game.announce('The Mainframe is awake.'); w.audio.play('alarm'); }
    if (!this.awake) return;

    // call for help
    this.spawnT -= dt;
    const alive = w.droids.filter((d) => d.team === 'h' && d.alive && d.state === 'active').length;
    if (this.spawnT <= 0 && alive < (shielded ? 3 : 4)) {
      this.spawnT = shielded ? 13 : 9;
      const room = w.build.rooms[this.room];
      const spots = room.spawns.filter((s) => Math.hypot(s.x - p.pos.x, s.z - p.pos.z) > 4);
      if (spots.length) {
        const s = spots[Math.floor(Math.random() * spots.length)];
        const pool = familiesForRange(640, 900);
        const fam = pool[Math.floor(Math.random() * pool.length)];
        w.spawnDroid(fam, 700 + Math.floor(Math.random() * 180), s.x, s.z);
        w.audio.play('spawn');
      }
    }
    // spray bolts in a slow spiral
    this.fireT -= dt;
    if (this.fireT <= 0 && dist < 13) {
      this.fireT = shielded ? 2.6 : 1.9;
      const n = 10;
      const off = this.spin * 0.7;
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * Math.PI * 2;
        // start beyond the dais, at the height of a droid on the arena floor
        const pos = this.pos.clone(); pos.y = 0.42; pos.x += Math.sin(a) * 2.9; pos.z += Math.cos(a) * 2.9;
        w.spawnBolt({ owner: this, team: 'h', pos, dx: Math.sin(a), dz: Math.cos(a), speed: 5.5, damage: 9, range: 14, color: w.deck.ink });
      }
      w.audio.play('laser', { at: this.pos, pitch: 0.5 });
    }
  }

  dispose() { this.world.root.remove(this.group); }
}
