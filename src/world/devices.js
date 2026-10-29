// The machinery of a deck: doors, force fields, bridges, crates, plates,
// targets, conduits, terminals, turrets, repair pads, caches and the lift.
// Locked or hostile things glow in the deck's colour; anything you've
// claimed glows cyan, like the cells on the hack board.
import * as THREE from 'three';
import { LEVEL_H, PLAYER_COLOUR } from '../config.js';
import { T, DIRS } from './grid.js';
import { makeNumberTexture } from '../render/textures.js';
import { iconSvg } from './modules.js';

const geoCache = {};
const G = (k, f) => geoCache[k] || (geoCache[k] = f());
const CYAN = new THREE.Color(PLAYER_COLOUR);

export function deviceMaterials(deck) {
  const ink = new THREE.Color(deck.ink);
  return {
    ink,
    metal: new THREE.MeshStandardMaterial({ color: 0x2a2e38, roughness: 0.45, metalness: 0.7 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8b93a3, roughness: 0.3, metalness: 0.9 }),
    panel: new THREE.MeshStandardMaterial({ color: 0x3c4250, roughness: 0.6, metalness: 0.3 }),
    inkGlow: new THREE.MeshStandardMaterial({ color: 0x050505, emissive: ink, emissiveIntensity: 2.2 }),
    cyanGlow: new THREE.MeshStandardMaterial({ color: 0x050505, emissive: CYAN, emissiveIntensity: 2.2 }),
  };
}

function glowMat(color, intensity = 2.2) {
  return new THREE.MeshStandardMaterial({ color: 0x050505, emissive: new THREE.Color(color), emissiveIntensity: intensity });
}

class Device {
  constructor(world, t) {
    this.world = world;
    this.x = t.x; this.z = t.z; this.h = t.h;
    this.y = t.h * LEVEL_H;
    this.room = t.room;
    this.ch = t.ch;
    this.t = t;
    this.group = new THREE.Group();
    this.group.position.set(t.x + 0.5, this.y, t.z + 0.5);
    world.root.add(this.group);
    this.pos = new THREE.Vector3(t.x + 0.5, this.y, t.z + 0.5);
    this.alive = true;
  }
  get idx() { return this.world.grid.idx(this.x, this.z); }
  block(v) { this.world.grid.block[this.idx] = v; }
  mesh(geo, mat, pos, rot, cast = true) {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    m.castShadow = cast; m.receiveShadow = true;
    this.group.add(m);
    return m;
  }
  // Which way does a doorway run? true when walls sit east and west.
  spansX() {
    const g = this.world.grid;
    const solid = (x, z) => { const t = g.typeAt(x, z); return t === T.WALL || t === T.VOID; };
    const isSame = (x, z) => this.world.charAt(x, z) === this.t.t;
    const ew = (solid(this.x - 1, this.z) || isSame(this.x - 1, this.z)) && (solid(this.x + 1, this.z) || isSame(this.x + 1, this.z));
    return ew;
  }
  update() {}
  dispose() { this.world.root.remove(this.group); }
}

// ------------------------------------------------------------------ door
export class Door extends Device {
  constructor(world, t) {
    super(world, t);
    this.kind = 'door';
    this.open = false;
    this.k = 0;
    const m = world.mats;
    const along = this.spansX();
    this.group.rotation.y = along ? 0 : Math.PI / 2;
    const H = 1.5;
    this.mesh(G('doorPost', () => new THREE.BoxGeometry(0.12, H, 0.3)), m.metal, [-0.47, H / 2, 0]);
    this.mesh(G('doorPost', () => new THREE.BoxGeometry(0.12, H, 0.3)), m.metal, [0.47, H / 2, 0]);
    this.mesh(G('doorLintel', () => new THREE.BoxGeometry(1.06, 0.14, 0.32)), m.metal, [0, H - 0.07, 0]);
    this.lightMat = glowMat(world.deck.ink);
    this.light = this.mesh(G('doorLight', () => new THREE.BoxGeometry(0.7, 0.04, 0.34)), this.lightMat, [0, H - 0.16, 0], null, false);
    this.panels = [];
    for (const s of [-1, 1]) {
      const p = this.mesh(G('doorPanel', () => new THREE.BoxGeometry(0.42, H - 0.2, 0.12)), m.panel, [s * 0.21, (H - 0.2) / 2, 0]);
      const stripe = new THREE.Mesh(G('doorStripe', () => new THREE.BoxGeometry(0.04, H - 0.5, 0.13)), this.lightMat);
      stripe.position.set(-s * 0.16, 0, 0);
      p.add(stripe);
      this.panels.push(p);
    }
    this.block(1);
  }
  setActive(on) {
    if (on === this.open) return;
    this.open = on;
    this.block(on ? 0 : 1);
    this.lightMat.emissive.copy(on ? CYAN : this.world.mats.ink);
    this.world.audio.play(on ? 'doorOpen' : 'doorClose', { at: this.pos });
    if (!on) this.world.unstick(this.x, this.z);
  }
  update(dt) {
    this.k += ((this.open ? 1 : 0) - this.k) * Math.min(1, dt * 6);
    this.panels[0].position.x = -0.21 - this.k * 0.36;
    this.panels[1].position.x = 0.21 + this.k * 0.36;
  }
}

// ------------------------------------------------------------------ force field
const fieldShader = {
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform float time, alpha;
    uniform vec3 color;
    varying vec2 vUv;
    void main() {
      float stripes = 0.5 + 0.5 * sin(vUv.y * 22.0 - time * 4.0);
      float hex = 0.5 + 0.5 * sin(vUv.x * 30.0 + sin(vUv.y * 18.0 + time) * 2.0);
      float scan = smoothstep(0.93, 1.0, fract(vUv.y - time * 0.5));
      float fadeTop = smoothstep(1.0, 0.6, vUv.y);
      float a = (0.12 + 0.22 * stripes * hex + scan * 0.7) * alpha * fadeTop;
      gl_FragColor = vec4(color * a * 2.2, a);
    }`,
};

export class Field extends Device {
  constructor(world, t, permanent) {
    super(world, t);
    this.kind = 'field';
    this.permanent = permanent;
    this.on = true;
    this.k = 1;
    const along = this.spansX();
    this.group.rotation.y = along ? 0 : Math.PI / 2;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: Math.random() * 10 }, alpha: { value: 1 }, color: { value: new THREE.Color(permanent ? 0xb07cff : world.deck.ink) } },
      vertexShader: fieldShader.vertexShader, fragmentShader: fieldShader.fragmentShader,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.plane = this.mesh(G('fieldPlane', () => new THREE.PlaneGeometry(1, 1.3)), this.mat, [0, 0.65, 0], null, false);
    this.plane.renderOrder = 4;
    const m = world.mats;
    this.emitter = this.mesh(G('fieldBase', () => new THREE.BoxGeometry(1, 0.08, 0.16)), m.metal, [0, 0.04, 0]);
    this.emitMat = glowMat(permanent ? 0xb07cff : world.deck.ink, 2.5);
    this.mesh(G('fieldLine', () => new THREE.BoxGeometry(0.96, 0.02, 0.06)), this.emitMat, [0, 0.09, 0], null, false);
    this.block(2);
  }
  setActive(on) {
    if (this.permanent) return;
    const fieldOn = !on;
    if (fieldOn === this.on) return;
    this.on = fieldOn;
    this.block(fieldOn ? 2 : 0);
    this.emitMat.emissive.copy(fieldOn ? this.world.mats.ink : CYAN);
    this.world.audio.play(fieldOn ? 'fieldOn' : 'fieldOff', { at: this.pos });
    if (fieldOn) this.world.unstick(this.x, this.z);
  }
  update(dt) {
    this.mat.uniforms.time.value += dt;
    this.k += ((this.on ? 1 : 0) - this.k) * Math.min(1, dt * 5);
    this.mat.uniforms.alpha.value = this.k;
    this.plane.visible = this.k > 0.02;
  }
}

// ------------------------------------------------------------------ bridge
export class Bridge extends Device {
  constructor(world, t) {
    super(world, t);
    this.kind = 'bridge';
    this.on = false;
    this.k = 0;
    const m = world.mats;
    this.slab = this.mesh(G('bridgeSlab', () => new THREE.BoxGeometry(1, 0.16, 1)), m.panel, [0, -0.08, 0]);
    this.edgeMat = glowMat(world.deck.ink, 1.6);
    this.edge = this.mesh(G('bridgeEdge', () => new THREE.BoxGeometry(1.01, 0.03, 1.01)), this.edgeMat, [0, -0.02, 0], null, false);
    this.slab.scale.setScalar(0.001);
    this.edge.scale.setScalar(0.001);
    this.delay = ((t.x * 7 + t.z * 3) % 5) * 0.06;
  }
  setActive(on) {
    if (on === this.on) return;
    this.on = on;
    this.world.grid.on[this.idx] = on ? 1 : 0;
    this.edgeMat.emissive.copy(on ? CYAN : this.world.mats.ink);
    if (on) this.world.audio.play('bridge', { at: this.pos });
  }
  update(dt) {
    const target = this.on ? 1 : 0;
    if (this.on && this.delay > 0) { this.delay -= dt; return; }
    this.k += (target - this.k) * Math.min(1, dt * 8);
    const s = Math.max(0.001, this.k);
    this.slab.scale.set(s, 1, s);
    this.edge.scale.set(s, 1, s);
  }
}

// ------------------------------------------------------------------ crate
export class Crate extends Device {
  constructor(world, t, heavy) {
    super(world, t);
    this.kind = 'crate';
    this.heavy = heavy;
    this.removed = false;
    const m = world.mats;
    const size = heavy ? 0.94 : 0.86;
    this.size = size;
    this.body = this.mesh(G(`crate${heavy}`, () => new THREE.BoxGeometry(size, size, size)), heavy ? m.metal : m.panel, [0, size / 2, 0]);
    const bandMat = heavy ? glowMat(0xffa21a, 1.6) : glowMat(world.deck.ink, 1.2);
    this.bandMat = bandMat;
    for (const y of [0.15, size - 0.15]) {
      const b = new THREE.Mesh(G(`crateBand${heavy}`, () => new THREE.BoxGeometry(size + 0.01, 0.035, size + 0.01)), bandMat);
      b.position.y = y - size / 2;
      this.body.add(b);
    }
    if (heavy) {
      const cross = new THREE.Mesh(G('crateCross', () => new THREE.BoxGeometry(size + 0.012, size * 0.6, 0.06)), m.steel);
      this.body.add(cross);
      const cross2 = cross.clone(); cross2.rotation.y = Math.PI / 2; this.body.add(cross2);
    }
    this.from = this.pos.clone();
    this.to = this.pos.clone();
    this.moveT = 1;
    this.fallV = 0;
    this.block(1);
  }
  // Slide one tile. Returns false if it can't.
  tryMove(dx, dz) {
    if (this.moveT < 1 || this.removed) return false;
    const w = this.world, g = w.grid;
    const nx = this.x + dx, nz = this.z + dz;
    if (!g.inside(nx, nz)) return false;
    const i = g.idx(nx, nz);
    if (g.block[i] !== 0) return false;
    if (w.bodyOnTile(nx, nz)) return false;
    const t = g.typeAt(nx, nz);
    const nh = g.hAt(nx, nz);
    if (t === T.WALL || t === T.RAMP) return false;
    const groundOk = t === T.FLOOR || t === T.HAZARD || (t === T.BRIDGE && g.on[i]);
    if (groundOk && nh !== this.h) return false;
    this.block(0);
    this.x = nx; this.z = nz;
    this.from.copy(this.pos);
    this.to.set(nx + 0.5, this.y, nz + 0.5);
    this.moveT = 0;
    if (groundOk) this.block(1);
    else if (t === T.PIT) this.fillPit = true;
    else this.falling = true;   // off an edge, into the void
    w.audio.play(this.heavy ? 'crateHeavy' : 'crate', { at: this.pos });
    return true;
  }
  update(dt) {
    if (this.removed) return;
    if (this.moveT < 1) {
      this.moveT = Math.min(1, this.moveT + dt / (this.heavy ? 0.28 : 0.17));
      const k = this.moveT * this.moveT * (3 - 2 * this.moveT);
      this.pos.lerpVectors(this.from, this.to, k);
      this.group.position.copy(this.pos);
      if (this.moveT >= 1) {
        if (this.fillPit) this.sinkT = 0;
      }
    } else if (this.fillPit) {
      // drop into the pit and become floor
      this.sinkT += dt;
      const k = Math.min(1, this.sinkT / 0.3);
      this.group.position.y = this.y - k * 1.0;
      if (k >= 1) {
        this.fillPit = false;
        const g = this.world.grid;
        g.set(this.x, this.z, T.FLOOR, this.h, 0);
        this.filled = true;
        this.removed = true;   // no longer pushable, but the mesh stays as floor
        this.bandMat.emissive.copy(CYAN);
        this.world.audio.play('thud', { at: this.pos });
        this.world.fx.burst(this.pos.clone().setY(this.y + 0.05), PLAYER_COLOUR, 14, 2, 0.5, 0.1, 3);
      }
    } else if (this.falling) {
      this.fallV += 20 * dt;
      this.group.position.y -= this.fallV * dt;
      if (this.group.position.y < -12) { this.removed = true; this.world.root.remove(this.group); }
    }
  }
}

// ------------------------------------------------------------------ plate
export class Plate extends Device {
  constructor(world, t, heavy) {
    super(world, t);
    this.kind = 'plate';
    this.heavy = heavy;
    this.on = false;
    const m = world.mats;
    this.mesh(G('plateBase', () => new THREE.BoxGeometry(0.86, 0.05, 0.86)), m.metal, [0, 0.025, 0]);
    this.mat = glowMat(world.deck.ink, 1.5);
    this.pad = this.mesh(G(heavy ? 'plateHeavy' : 'platePad', () => heavy ? new THREE.BoxGeometry(0.62, 0.05, 0.62) : new THREE.CylinderGeometry(0.3, 0.3, 0.05, 28)), m.panel, [0, 0.07, 0]);
    this.ring = this.mesh(G(heavy ? 'plateRingH' : 'plateRing', () => heavy ? new THREE.BoxGeometry(0.74, 0.02, 0.74) : new THREE.TorusGeometry(0.36, 0.02, 6, 32)), this.mat, [0, 0.06, 0], heavy ? null : [Math.PI / 2, 0, 0], false);
    if (heavy) {
      for (let i = 0; i < 3; i++) this.mesh(G('plateBar', () => new THREE.BoxGeometry(0.5, 0.02, 0.06)), this.mat, [0, 0.1, -0.16 + i * 0.16], null, false);
    }
  }
  update(dt) {
    const w = this.world;
    let pressed = false;
    const crate = w.crateOnTile(this.x, this.z);
    if (crate && (!this.heavy || crate.heavy)) pressed = true;
    if (!pressed) {
      for (const d of w.droids) {
        if (!d.alive || d.hovering || d.state !== 'active') continue;
        if (Math.floor(d.pos.x) !== this.x || Math.floor(d.pos.z) !== this.z) continue;
        if (Math.abs(d.pos.y - this.y) > 0.3) continue;
        if (this.heavy && !d.heavy) continue;
        pressed = true; break;
      }
    }
    if (pressed !== this.on) {
      this.on = pressed;
      this.mat.emissive.copy(pressed ? CYAN : w.mats.ink);
      w.audio.play(pressed ? 'plateOn' : 'plateOff', { at: this.pos });
      w.channelDirty = true;
    }
    this.pad.position.y += ((pressed ? 0.04 : 0.07) - this.pad.position.y) * Math.min(1, dt * 12);
  }
}

// ------------------------------------------------------------------ laser target
export class Target extends Device {
  constructor(world, t) {
    super(world, t);
    this.kind = 'target';
    this.on = false;
    const m = world.mats;
    this.mesh(G('tPost', () => new THREE.CylinderGeometry(0.08, 0.14, 0.6, 12)), m.metal, [0, 0.3, 0]);
    this.head = new THREE.Group();
    this.head.position.y = 0.78;
    this.group.add(this.head);
    this.mat = glowMat(world.deck.ink, 2);
    const ring = new THREE.Mesh(G('tRing', () => new THREE.TorusGeometry(0.24, 0.05, 10, 32)), m.steel);
    const eye = new THREE.Mesh(G('tEye', () => new THREE.SphereGeometry(0.16, 20, 14)), this.mat);
    const inner = new THREE.Mesh(G('tInner', () => new THREE.TorusGeometry(0.12, 0.018, 8, 24)), this.mat);
    inner.position.z = 0.1;
    this.head.add(ring, eye, inner);
    this.block(1);
  }
  hit() {
    if (this.on) return;
    this.on = true;
    this.mat.emissive.copy(CYAN);
    this.world.audio.play('ding', { at: this.pos });
    this.world.fx.burst(this.pos.clone().setY(this.y + 0.78), PLAYER_COLOUR, 18, 2.5, 0.6, 0.12, 2);
    this.world.channelDirty = true;
    this.world.claimEvent('target');
  }
  update(dt) {
    // face the camera-ish (south-east), wobble a little
    this.head.rotation.y = Math.PI * 0.25 + Math.sin(performance.now() / 700 + this.x) * 0.15;
  }
}

// ------------------------------------------------------------------ conduit
export class Conduit extends Device {
  constructor(world, t) {
    super(world, t);
    this.kind = 'conduit';
    this.on = false;
    const m = world.mats;
    this.mesh(G('cBase', () => new THREE.CylinderGeometry(0.3, 0.36, 0.16, 16)), m.metal, [0, 0.08, 0]);
    this.mesh(G('cRod', () => new THREE.CylinderGeometry(0.06, 0.08, 1.1, 10)), m.steel, [0, 0.66, 0]);
    this.mat = glowMat(world.deck.ink, 0.6);
    this.coils = [];
    for (let i = 0; i < 4; i++) this.coils.push(this.mesh(G('cCoil', () => new THREE.TorusGeometry(0.2 - 0.0, 0.035, 8, 24)), this.mat, [0, 0.35 + i * 0.2, 0], [Math.PI / 2, 0, 0]));
    this.top = this.mesh(G('cTop', () => new THREE.SphereGeometry(0.13, 16, 12)), this.mat, [0, 1.25, 0]);
    this.block(1);
  }
  arcPoint() { return this.pos.clone().setY(this.y + 1.25); }
  onArc() {
    if (this.on) return;
    this.on = true;
    this.mat.emissive.copy(CYAN);
    this.mat.emissiveIntensity = 2.4;
    this.world.audio.play('charge', { at: this.pos });
    this.world.channelDirty = true;
    this.world.claimEvent('conduit');
  }
  update(dt) {
    if (this.on) {
      this.coils.forEach((c, i) => { c.scale.setScalar(1 + Math.sin(performance.now() / 120 + i) * 0.06); });
      if (Math.random() < dt * 4) this.world.fx.lightning(this.arcPoint(), this.pos.clone().setY(this.y + 0.3).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6)), PLAYER_COLOUR, 0.08, 0.03);
    }
  }
}

// ------------------------------------------------------------------ hackable consoles
let screenTex = null;
function screenTexture() {
  if (screenTex) return screenTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#fff'; g.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const y = 8 + i * 9;
    g.beginPath(); g.moveTo(4, y); g.lineTo(18 + (i * 7) % 20, y); g.lineTo(26 + (i * 5) % 14, y + 4); g.lineTo(60, y + 4); g.stroke();
  }
  g.fillStyle = '#fff'; g.fillRect(28, 26, 8, 12);
  screenTex = new THREE.CanvasTexture(c);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  return screenTex;
}

export class Terminal extends Device {
  constructor(world, t, kind = 'terminal') {
    super(world, t);
    this.kind = kind;       // terminal | archive | relay
    this.on = false;
    this.solid = true;
    const m = world.mats;
    const tall = kind !== 'terminal';
    this.mesh(G('termBase', () => new THREE.BoxGeometry(0.7, 0.18, 0.6)), m.metal, [0, 0.09, 0]);
    this.mesh(G(tall ? 'termBodyT' : 'termBody', () => new THREE.BoxGeometry(0.56, tall ? 1.0 : 0.62, 0.42)), m.panel, [0, tall ? 0.68 : 0.49, -0.02]);
    const col = kind === 'archive' ? 0xffffff : world.deck.ink;
    this.screenMat = new THREE.MeshBasicMaterial({ map: screenTexture(), color: new THREE.Color(col).multiplyScalar(1.6) });
    this.screen = this.mesh(G('termScreen', () => new THREE.PlaneGeometry(0.46, 0.36)), this.screenMat, [0, tall ? 1.0 : 0.66, 0.2], [-0.3, 0, 0], false);
    this.lightMat = glowMat(col, 2);
    this.mesh(G('termLight', () => new THREE.BoxGeometry(0.58, 0.035, 0.44)), this.lightMat, [0, 0.2, -0.02], null, false);
    if (tall) {
      this.halo = this.mesh(G('termHalo', () => new THREE.TorusGeometry(0.42, 0.025, 8, 40)), this.lightMat, [0, 1.45, 0], [Math.PI / 2, 0, 0], false);
    }
    // face south-east, towards the camera
    this.group.rotation.y = Math.PI * 0.25;
    this.block(1);
    const deck = world.deck.n;
    this.cls = kind === 'relay' ? 820 + deck * 10 : 60 + deck * 90;
    this.radius = 0.5;
  }
  hackSpec() {
    const deck = this.world.deck.n;
    if (this.kind === 'relay') return { title: 'Relay', cls: 860, rows: 10, pulsers: 5, timer: 10 };
    if (this.kind === 'archive') return { title: 'Archive', cls: 100 + deck * 120, rows: 8, pulsers: 3 + Math.floor(deck / 2), timer: 9 };
    return { title: 'Terminal', cls: 80 + deck * 100, rows: 6, pulsers: 2 + Math.floor(deck / 2), timer: 8 };
  }
  canHack() { return !this.on; }
  onHackWin() {
    this.on = true;
    this.screenMat.color.copy(CYAN).multiplyScalar(1.6);
    this.lightMat.emissive.copy(CYAN);
    this.world.channelDirty = true;
    this.world.claimEvent(this.kind);
    if (this.kind === 'archive') this.world.game.offerFirmware('archive');
    if (this.kind === 'relay') this.world.onRelayDown(this);
  }
  onHackLose() {}
  update(dt) {
    if (this.halo) this.halo.rotation.z += dt * (this.on ? 0.4 : 1.2);
  }
}

// ------------------------------------------------------------------ turret
export class Turret extends Device {
  constructor(world, t) {
    super(world, t);
    this.kind = 'turret';
    this.team = 'h';
    this.solid = true;
    const deck = world.deck.n;
    this.cls = 90 + deck * 110;
    this.maxIntegrity = 24 + deck * 8;
    this.integrity = this.maxIntegrity;
    this.cool = 1 + Math.random();
    this.charge = 0;
    this.stun = 0;
    this.radius = 0.45;
    const m = world.mats;
    this.mesh(G('turBase', () => new THREE.CylinderGeometry(0.34, 0.42, 0.32, 16)), m.metal, [0, 0.16, 0]);
    this.head = new THREE.Group();
    this.head.position.y = 0.48;
    this.group.add(this.head);
    this.accent = glowMat(world.deck.ink, 2.2);
    const dome = new THREE.Mesh(G('turDome', () => new THREE.SphereGeometry(0.28, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2)), m.panel);
    dome.castShadow = true;
    const band = new THREE.Mesh(G('turBand', () => new THREE.CylinderGeometry(0.285, 0.285, 0.05, 20, 1, true)), this.accent);
    band.position.y = 0.03;
    const barrel = new THREE.Mesh(G('turBarrel', () => new THREE.CylinderGeometry(0.05, 0.06, 0.42, 10)), m.steel);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.1, 0.32);
    this.lens = new THREE.Mesh(G('turLens', () => new THREE.SphereGeometry(0.06, 12, 8)), this.accent);
    this.lens.position.set(0, 0.1, 0.54);
    this.head.add(dome, band, barrel, this.lens);
    this.block(1);
    this.facing = Math.random() * Math.PI * 2;
  }
  get alive2() { return this.integrity > 0; }
  hackSpec() { return { title: 'Turret', cls: this.cls, rows: 6, pulsers: 2 + Math.floor(this.world.deck.n / 2), timer: 8 }; }
  canHack() { return this.integrity > 0 && this.team !== 'k'; }
  onHackWin() {
    this.team = 'k';
    this.accent.emissive.copy(CYAN);
    this.world.claimEvent('turret');
  }
  onHackLose() { this.cool = 0.3; }
  arcPoint() { return this.pos.clone().setY(this.y + 0.55); }
  knock() {}   // bolted to the floor
  damage(n, src = {}) {
    if (this.integrity <= 0) return 0;
    if (src.by && src.by.team === this.team) return 0;
    this.integrity -= n;
    this.world.fx.burst(this.arcPoint(), 0xffffff, 6, 2, 0.3, 0.08, 4);
    if (this.integrity <= 0) {
      this.integrity = 0;
      this.alive = false;
      this.accent.emissive.setRGB(0.05, 0.05, 0.05);
      this.head.rotation.x = 0.5;
      this.world.explode(this.arcPoint(), this.world.deck.ink, 0.8);
      if (this.team !== 'k') this.world.claimEvent('turret');   // a hacked one was counted already
    }
    return n;
  }
  update(dt) {
    if (this.integrity <= 0) return;
    const w = this.world;
    this.stun = Math.max(0, (this.stun || 0) - dt);
    if (this.stun > 0) { this.head.rotation.y += dt * 8; return; }
    const target = w.turretTarget(this);
    if (target) {
      const dx = target.pos.x - this.pos.x, dz = target.pos.z - this.pos.z;
      const want = Math.atan2(dx, dz);
      let d = want - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * Math.min(1, dt * 5);
      this.cool -= dt;
      if (this.cool <= 0 && Math.abs(d) < 0.2) {
        this.charge += dt / 0.55;
        if (this.charge >= 1) {
          this.charge = 0;
          this.cool = this.team === 'k' ? 0.8 : 1.5 - this.world.deck.n * 0.08;
          const f = { x: Math.sin(this.facing), z: Math.cos(this.facing) };
          const p = this.pos.clone(); p.y += 0.58; p.x += f.x * 0.5; p.z += f.z * 0.5;
          w.spawnBolt({ owner: this, team: this.team, pos: p, dx: f.x, dz: f.z, speed: 10, damage: 7 + this.world.deck.n * 2, range: 10, color: this.team === 'k' ? PLAYER_COLOUR : w.deck.ink });
          w.audio.play('laser', { at: this.pos, pitch: 0.7 });
        }
      }
    } else {
      this.facing += dt * 0.6;
      this.charge = Math.max(0, this.charge - dt * 2);
    }
    this.head.rotation.y = this.facing;
    this.accent.emissiveIntensity = 2.2 + this.charge * 5;
    this.lens.scale.setScalar(1 + this.charge * 1.5);
  }
}

// ------------------------------------------------------------------ repair pad
export class Repair extends Device {
  constructor(world, t) {
    super(world, t);
    this.kind = 'repair';
    this.used = false;
    const m = world.mats;
    this.mesh(G('repBase', () => new THREE.CylinderGeometry(0.44, 0.46, 0.06, 32)), m.metal, [0, 0.03, 0]);
    this.mat = glowMat(PLAYER_COLOUR, 1.8);
    this.ring = this.mesh(G('repRing', () => new THREE.TorusGeometry(0.36, 0.025, 6, 40)), this.mat, [0, 0.07, 0], [Math.PI / 2, 0, 0], false);
    const crossH = this.mesh(G('repCross', () => new THREE.BoxGeometry(0.34, 0.03, 0.1)), this.mat, [0, 0.08, 0], null, false);
    const crossV = this.mesh(G('repCross2', () => new THREE.BoxGeometry(0.1, 0.03, 0.34)), this.mat, [0, 0.08, 0], null, false);
    this.cross = [crossH, crossV];
  }
  update(dt) {
    if (this.used) return;
    this.ring.scale.setScalar(1 + Math.sin(performance.now() / 300) * 0.05);
    const p = this.world.player;
    if (!p || !p.alive || p.hovering) return;
    if (Math.floor(p.pos.x) === this.x && Math.floor(p.pos.z) === this.z && Math.abs(p.pos.y - this.y) < 0.3) {
      if (p.integrity >= p.maxIntegrity - 0.5 && p.energy >= p.maxEnergy - 0.5) return;
      this.used = true;
      p.integrity = Math.min(p.maxIntegrity, p.integrity + p.maxIntegrity * 0.5);
      p.energy = p.maxEnergy;
      this.mat.emissive.setRGB(0.1, 0.12, 0.14);
      this.world.audio.play('repair', { at: this.pos });
      this.world.fx.burst(p.pos.clone().setY(p.pos.y + 0.5), PLAYER_COLOUR, 30, 2, 0.9, 0.12, -1);
      this.world.game.toast('Repaired');
    }
  }
}

// ------------------------------------------------------------------ lift
export class Lift extends Device {
  constructor(world, t) {
    super(world, t);
    this.kind = 'lift';
    const m = world.mats;
    this.mesh(G('liftBase', () => new THREE.CylinderGeometry(0.62, 0.7, 0.12, 40)), m.metal, [0, 0.06, 0]);
    this.padMat = glowMat(world.deck.ink, 1.4);
    this.ring = this.mesh(G('liftRing', () => new THREE.TorusGeometry(0.56, 0.035, 8, 48)), this.padMat, [0, 0.13, 0], [Math.PI / 2, 0, 0], false);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      this.mesh(G('liftPylon', () => new THREE.BoxGeometry(0.1, 1.2, 0.1)), m.steel, [Math.cos(a) * 0.62, 0.6, Math.sin(a) * 0.62]);
      this.mesh(G('liftPylonLight', () => new THREE.BoxGeometry(0.04, 0.9, 0.11)), this.padMat, [Math.cos(a) * 0.62, 0.65, Math.sin(a) * 0.62], null, false);
    }
    this.beamMat = new THREE.MeshBasicMaterial({ color: CYAN.clone().multiplyScalar(1.2), alphaMap: beamFade(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.beam = this.mesh(G('liftBeam', () => new THREE.CylinderGeometry(0.5, 0.58, 3.5, 32, 1, true)), this.beamMat, [0, 1.75, 0], null, false);
    this.unlocked = false;
  }
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    this.padMat.emissive.copy(CYAN);
    this.world.audio.play('unlock', { at: this.pos });
  }
  update(dt) {
    this.beamMat.opacity += ((this.unlocked ? 0.5 + Math.sin(performance.now() / 400) * 0.12 : 0) - this.beamMat.opacity) * Math.min(1, dt * 3);
    this.ring.rotation.z += dt * (this.unlocked ? 1.5 : 0.3);
  }
}

// a vertical fade, bright at the floor and gone at the top
let beamTex = null;
function beamFade() {
  if (beamTex) return beamTex;
  const c = document.createElement('canvas');
  c.width = 4; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#000'); grad.addColorStop(0.7, '#555'); grad.addColorStop(1, '#fff');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 128);
  beamTex = new THREE.CanvasTexture(c);
  return beamTex;
}

// ------------------------------------------------------------------ pickups: dropped parts, caches, chips
export class Pickup extends Device {
  // what: { type: 'module', mod } | { type: 'cache', offer } | { type: 'chip' }
  constructor(world, t, what) {
    super(world, t);
    this.kind = 'pickup';
    this.what = what;
    this.pos.y = this.y + 0.45;
    this.pivot = new THREE.Group();
    this.group.position.copy(this.pos);
    this.group.add(this.pivot);
    const colour = what.type === 'chip' ? 0xffffff : PLAYER_COLOUR;
    this.mat = glowMat(colour, 1.8);
    if (what.type === 'chip') {
      const chip = new THREE.Mesh(G('chip', () => new THREE.BoxGeometry(0.36, 0.06, 0.36)), world.mats.metal);
      const top = new THREE.Mesh(G('chipTop', () => new THREE.BoxGeometry(0.22, 0.07, 0.22)), this.mat);
      this.pivot.add(chip, top);
      for (let i = 0; i < 4; i++) {
        for (const s of [-1, 1]) {
          const pin = new THREE.Mesh(G('pin', () => new THREE.BoxGeometry(0.04, 0.02, 0.1)), world.mats.steel);
          pin.position.set(-0.12 + i * 0.08, 0, s * 0.22);
          this.pivot.add(pin);
        }
      }
      this.pivot.rotation.x = 0.5;
    } else {
      const crystal = new THREE.Mesh(G('crystal', () => new THREE.OctahedronGeometry(0.2)), this.mat);
      crystal.scale.y = 1.4;
      const cage = new THREE.Mesh(G('cage', () => new THREE.IcosahedronGeometry(0.32, 0)), new THREE.MeshBasicMaterial({ color: new THREE.Color(colour).multiplyScalar(1.2), wireframe: true, transparent: true, opacity: 0.5 }));
      this.pivot.add(crystal, cage);
      if (what.type === 'cache') {
        const base = new THREE.Mesh(G('cacheBase', () => new THREE.CylinderGeometry(0.3, 0.36, 0.14, 6)), world.mats.metal);
        base.position.y = -0.38;
        this.group.add(base);
      }
    }
    this.radius = 0.3;
    this.pulled = 0;
    this.bobT = Math.random() * 10;
  }
  label() {
    const w = this.what;
    if (w.type === 'chip') return 'Firmware chip';
    if (w.type === 'cache') return 'Parts cache';
    return null;
  }
  update(dt) {
    this.bobT += dt;
    this.pivot.rotation.y += dt * 1.4;
    if (this.pulled > 0) {
      this.pulled -= dt;
      this.group.position.copy(this.pos);
    } else {
      const g = this.world.grid.groundAt(this.pos.x, this.pos.z);
      if (g !== null) this.pos.y += (g + 0.45 - this.pos.y) * Math.min(1, dt * 4);
      this.group.position.set(this.pos.x, this.pos.y + Math.sin(this.bobT * 2) * 0.06, this.pos.z);
    }
    this.x = Math.floor(this.pos.x); this.z = Math.floor(this.pos.z);
  }
}

export function moduleIconHtml(id) { return iconSvg(id, 22); }
