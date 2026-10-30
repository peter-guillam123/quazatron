// One deck, alive: tiles, devices, droids, bolts and the rules that tie
// them together (rams, falls, grapples, switches and claiming the deck).
import * as THREE from 'three';
import { buildLevelMesh } from '../render/levelMesh.js';
import { LEVEL_H, PLAYER_COLOUR, TUNING, VOID_Y } from '../config.js';
import { T } from './grid.js';
import { Droid } from './droid.js';
import { Brain } from './ai.js';
import { resolveBodies } from './physics.js';
import {
  deviceMaterials, Door, Field, Bridge, Crate, Plate, Target, Conduit, Terminal, Turret, Repair, Lift, Pickup, Fabricator, Chute, Reader,
} from './devices.js';
import { HEAP_NPCS } from './heap.js';
import { ScrapField, scrapFor } from './scrap.js';
import { FAMILIES, modulesOf, rowsFor, pulsersFor, timerFor, rareMods } from './roster.js';
import { makeRng } from '../rng.js';
import { MODULES } from './modules.js';
import { Mainframe } from './mainframe.js';
import { FloorSign } from '../render/signs.js';
import { LockOn } from './lockon.js';
import { Telegraphs } from '../render/telegraph.js';

const CYAN = new THREE.Color(PLAYER_COLOUR);
const boltGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.55, 6, 1);
boltGeo.rotateX(Math.PI / 2);
const boltMats = new Map();
function boltMat(color) {
  if (!boltMats.has(color)) {
    boltMats.set(color, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3.2), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  }
  return boltMats.get(color);
}

export class World {
  constructor(game, build, run) {
    this.game = game;
    this.build = build;
    this.deck = build.deck;
    this.grid = build.grid;
    this.audio = game.audio;
    this.fx = game.fx;
    this.renderer = game.renderer;
    this.root = new THREE.Group();
    this.root.name = 'deck';
    game.renderer.scene.add(this.root);
    this.mats = deviceMaterials(this.deck);
    this.inkColour = new THREE.Color(this.deck.ink);
    this.time = 0;

    const rng = makeRng(build.n * 977 + 13);
    this.level = buildLevelMesh(this.grid, this.deck, rng);
    this.root.add(this.level.group);

    this.droids = [];
    this.bolts = [];
    this.devices = [];
    this.crates = [];
    this.pickups = [];
    this.channels = new Map();
    this.channelDirty = true;
    this.clearance = false;
    this.lift = null;
    this.mainframe = null;
    this.relays = [];
    this.claimTotal = 0;
    this.claimed = 0;
    this.claimShown = 0;
    this.roomNow = -1;
    this.chars = new Map();
    for (const t of build.things) this.chars.set(`${t.x},${t.z}`, t.t);
    this.scrap = new ScrapField(this);
    this.lock = new LockOn(this);
    this.tele = new Telegraphs(this.root);
    this.tele.reduced = game.reducedMotion;

    this.makeDevices(build.things);
    this.signs = (build.signs || []).map((sg) => new FloorSign(this.root, sg, game.input ? game.input.lastDevice : 'keyboard'));
    this.makeDroids(build.droids);
    if (this.bounty) this.makeBountyMarker();
    this.makePrizes();
    this.makeNpcs(build.things);
    this.makePlayer(run);
    this.claimTotal = this.droids.filter((d) => !d.isPlayer && d.team !== 'n').length
      + this.devices.filter((d) => d.kind === 'turret' || d.kind === 'terminal' || d.kind === 'archive').length;
    for (const g of run.gang || []) this.spawnAlly(g);
    this.evaluateChannels();
  }

  charAt(x, z) { return this.chars.get(`${x},${z}`); }

  // ------------------------------------------------------------------ setup
  makeDevices(things) {
    for (const t of things) {
      let dev = null;
      switch (t.t) {
        case 'D': dev = new Door(this, t); break;
        case 'F': dev = new Field(this, t, false); break;
        case 'f': dev = new Field(this, t, true); break;
        case '=': dev = new Bridge(this, t); break;
        case 'c': dev = new Crate(this, t, false); this.crates.push(dev); break;
        case 'C': dev = new Crate(this, t, true); this.crates.push(dev); break;
        case 'p': dev = new Plate(this, t, false); break;
        case 'P': dev = new Plate(this, t, true); break;
        case 't': dev = new Target(this, t); break;
        case 'x': dev = new Conduit(this, t); break;
        case 'T': dev = new Terminal(this, t, 'terminal'); break;
        case 'A': dev = new Terminal(this, t, 'archive'); break;
        case 'R': dev = new Terminal(this, t, 'relay'); this.relays.push(dev); break;
        case 'g': dev = new Turret(this, t); break;
        case '+': dev = new Repair(this, t); break;
        case 'L': dev = new Lift(this, t); this.lift = dev; break;
        case 'B': dev = new Fabricator(this, t); break;
        case 'M': dev = new Mainframe(this, t); this.mainframe = dev; break;
        case 'm': dev = new Pickup(this, t, { type: 'cache', offer: t.offer }); this.pickups.push(dev); break;
        case '$': dev = new Pickup(this, t, { type: 'chip' }); this.pickups.push(dev); break;
        case 'U': dev = new Chute(this, t); this.chute = dev; break;
        case 'Y': dev = new Reader(this, t); break;
        default: break;
      }
      if (!dev) continue;
      if (dev.kind !== 'pickup') this.devices.push(dev);
      // wire switches to the things they move
      const isTrigger = ['p', 'P', 't', 'x', 'T'].includes(t.t);
      const isTarget = ['D', 'F', '='].includes(t.t);
      if (isTrigger || isTarget) {
        if (!this.channels.has(t.ch)) this.channels.set(t.ch, { triggers: [], targets: [], active: null });
        this.channels.get(t.ch)[isTrigger ? 'triggers' : 'targets'].push(dev);
      }
    }
  }

  makeDroids(list) {
    for (const s of list) {
      const mods = modulesOf(s.family, s.cls);
      const d = new Droid(this, {
        family: s.family, cls: s.cls, command: s.command, x: s.x, z: s.z, y: s.h * LEVEL_H,
        mods: s.bounty ? rareMods(mods) : mods, accent: this.deck.ink, room: s.room, bounty: s.bounty,
        facing: Math.random() * Math.PI * 2,
      });
      if (s.bounty) this.bounty = d;
      d.dozy = !!s.dozy;
      d.brain = new Brain(d, this);
      this.root.add(d.model.group);
      this.droids.push(d);
    }
  }

  // A gold ring on the floor under the bounty, and a column of light over
  // it for a moment when you first see it.
  makeBountyMarker() {
    const gold = new THREE.Color(0xffc24a);
    const ringGeo = new THREE.RingGeometry(0.62, 0.74, 48);
    ringGeo.rotateX(-Math.PI / 2);
    this.bountyRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: gold.clone().multiplyScalar(1.8), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.bountyRing.renderOrder = 3;
    this.root.add(this.bountyRing);
    const beamGeo = new THREE.CylinderGeometry(0.45, 0.6, 6, 24, 1, true);
    beamGeo.translate(0, 3, 0);
    this.bountyBeam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: gold.clone().multiplyScalar(1.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.bountyBeam.visible = false;
    this.root.add(this.bountyBeam);
    this.bountyBeamT = 0;
  }

  updateBountyMarker(dt) {
    const b = this.bounty, ring = this.bountyRing;
    if (!ring) return;
    const on = b.alive && b.state === 'active' && b.team === 'h' && !b.bountyDone;
    ring.visible = on && !b.cloaked;
    if (on) {
      const pulse = this.game.reducedMotion ? 1 : 1 + Math.sin(this.time * 4) * 0.06;
      ring.position.set(b.pos.x, (b.groundY ?? b.pos.y) + 0.04, b.pos.z);
      ring.scale.setScalar(b.scale * pulse);
    }
    this.bountyBeamT = Math.max(0, this.bountyBeamT - dt);
    const beam = this.bountyBeam;
    beam.visible = on && this.bountyBeamT > 0;
    if (beam.visible) {
      beam.position.copy(b.pos);
      beam.material.opacity = Math.min(1, this.bountyBeamT / 0.6) * 0.35;
    }
  }

  // The cast who live in the Heap. They stand still, face you, and talk.
  makeNpcs(things) {
    this.npcs = [];
    for (const t of things) {
      const spec = HEAP_NPCS[t.t];
      if (!spec || (spec.needs && !this.game.meta[spec.needs])) continue;
      const d = new Droid(this, {
        x: t.x + 0.5, z: t.z + 0.5, y: t.h * LEVEL_H, mods: spec.mods, accent: spec.accent, team: 'n', look: spec.look,
        facing: Math.PI * 0.25,
      });
      d.fixed = true;
      d.npc = { id: spec.id, name: spec.name };
      this.root.add(d.model.group);
      this.droids.push(d);
      this.npcs.push(d);
    }
  }

  npcNear(p) {
    let best = null, bd = 1.5;
    for (const d of this.npcs) {
      const dist = Math.hypot(d.pos.x - p.pos.x, d.pos.z - p.pos.z) - d.radius;
      if (dist < bd) { bd = dist; best = d; }
    }
    return best;
  }

  // Each fighting room's prize, caged until its droids are dealt with.
  makePrizes() {
    this.prizeT = 0;
    for (const room of this.build.rooms) {
      if (!room.prize || !room.prizeAt) continue;
      const at = room.prizeAt;
      const what = { type: room.prize, locked: true, room: room.index };
      if (room.prize === 'cache') what.offer = room.prizeOffer;
      const k = new Pickup(this, { t: 'prize', x: at.x, z: at.z, h: at.h, room: room.index, ch: '' }, what);
      this.pickups.push(k);
      room.prizePickup = k;
    }
  }

  // Droids still standing between you and a room's prize.
  roomGuards(index) {
    let n = 0;
    for (const d of this.droids) if (d.room === index && d.team === 'h' && d.alive && d.state === 'active') n++;
    return n;
  }

  updatePrizes(dt) {
    this.prizeT -= dt;
    if (this.prizeT > 0) return;
    this.prizeT = 0.3;
    for (const room of this.build.rooms) {
      const k = room.prizePickup;
      if (!k || !k.locked || !room.visited) continue;
      if (this.roomGuards(room.index) === 0) {
        k.unlock();
        this.game.prizeUnlocked?.(room, k);
      }
    }
  }

  makePlayer(run) {
    const s = this.build.start;
    const p = new Droid(this, { player: true, x: s.x, z: s.z, y: s.h * LEVEL_H, mods: run.mods, facing: Math.PI * 1.25 });
    p.maxIntegrity = run.maxIntegrity;
    p.integrity = Math.min(run.integrity, p.maxIntegrity);
    p.maxEnergy = run.maxEnergy;
    p.energy = p.maxEnergy;
    p.speedBonus = run.speed || 1;
    p.onRefresh = () => this.game.onPlayerRefresh(p);
    this.root.add(p.model.group);
    this.droids.unshift(p);
    this.player = p;
    this.game.attachPlayerGhost(p);
  }

  // One of KLP-2's gang, arriving on a new deck beside it.
  spawnAlly(g) {
    const p = this.player;
    const at = this.freeSpotNear(p.pos, 1.4) || p.pos.clone();
    const d = new Droid(this, {
      family: g.family, cls: g.cls, command: g.command, x: at.x, z: at.z, y: at.y, bounty: g.bounty,
      mods: g.bounty ? rareMods(modulesOf(g.family, g.cls)) : modulesOf(g.family, g.cls), accent: PLAYER_COLOUR, team: 'k', facing: p.facing,
    });
    d.integrity = Math.max(1, d.maxIntegrity * (g.hp ?? 1));
    d.brain = new Brain(d, this);
    d.brain.state = 'follow';
    this.root.add(d.model.group);
    this.droids.push(d);
    return d;
  }

  // Somewhere flat and empty near a point, for a droid to appear.
  freeSpotNear(pos, r) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + 0.4, rr = r * (1 + Math.floor(i / 8) * 0.6);
      const x = pos.x + Math.sin(a) * rr, z = pos.z + Math.cos(a) * rr;
      const g = this.grid.groundAt(x, z);
      const tx = Math.floor(x), tz = Math.floor(z);
      if (g === null || Math.abs(g - pos.y) > 0.3 || this.grid.block[this.grid.idx(tx, tz)] !== 0 || this.grid.typeAt(tx, tz) === T.HAZARD) continue;
      if (this.droids.some((o) => o.alive && Math.hypot(o.pos.x - x, o.pos.z - z) < 0.8)) continue;
      return new THREE.Vector3(x, g, z);
    }
    return null;
  }

  // A gang member left behind blinks back to KLP-2's side.
  warpToPlayer(d) {
    const p = this.player;
    const at = this.freeSpotNear(p.pos, 1.3);
    if (!at) return;
    this.fx.burst(d.pos.clone().setY(d.pos.y + 0.4), PLAYER_COLOUR, 14, 2, 0.5, 0.1, 0);
    d.pos.copy(at); d.vel.x = d.vel.z = 0; d.vy = 0;
    d.lastSafe.copy(at);
    this.fx.burst(d.pos.clone().setY(d.pos.y + 0.4), PLAYER_COLOUR, 14, 2, 0.5, 0.1, 0);
  }

  allies() { return this.droids.filter((d) => d.team === 'k' && !d.isPlayer && d.alive && d.state === 'active'); }

  spawnDroid(family, cls, x, z, opts = {}) {
    const g = this.grid.groundAt(x, z) ?? 0;
    const d = new Droid(this, {
      family, cls, x, z, y: g, mods: modulesOf(family, cls), accent: this.deck.ink, room: this.grid.room[this.grid.idx(Math.floor(x), Math.floor(z))],
      facing: Math.random() * Math.PI * 2, ...opts,
    });
    d.brain = new Brain(d, this);
    d.brain.state = 'chase';
    this.root.add(d.model.group);
    this.droids.push(d);
    this.claimTotal += 1;
    this.fx.burst(d.pos.clone().setY(d.pos.y + 0.5), this.deck.ink, 24, 3, 0.7, 0.12, 0);
    this.fx.ring(d.pos, this.deck.ink, 1.6, 0.6);
    return d;
  }

  // ------------------------------------------------------------------ queries
  bodies() { return this.droids.filter((d) => d.alive && d.state === 'active'); }

  crateAtIdx(i) {
    for (const c of this.crates) if (!c.removed && this.grid.idx(c.x, c.z) === i) return c;
    return null;
  }
  crateOnTile(x, z) {
    for (const c of this.crates) if (!c.falling && c.x === x && c.z === z && (!c.removed || c.filled) && !c.filled) return c;
    return null;
  }
  bodyOnTile(x, z) {
    for (const d of this.droids) {
      if (!d.alive || d.state !== 'active') continue;
      const cx = Math.max(x, Math.min(x + 1, d.pos.x)), cz = Math.max(z, Math.min(z + 1, d.pos.z));
      if (Math.hypot(cx - d.pos.x, cz - d.pos.z) < d.radius * 0.9) return d;
    }
    return null;
  }

  hostilesOf(d) {
    const out = [];
    for (const o of this.droids) if (o !== d && o.alive && o.state === 'active' && o.team !== d.team && o.team !== 'n') out.push(o);
    for (const t of this.devices) if (t.kind === 'turret' && t.integrity > 0 && t.team !== d.team) out.push(t);
    return out;
  }

  canSee(a, b) {
    const g = this.grid;
    const ay = a.y + 0.5, by = b.y + 0.5;
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.ceil(dist / 0.3);
    for (let i = 1; i < n; i++) {
      const k = i / n;
      const x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k;
      const tx = Math.floor(x), tz = Math.floor(z);
      if (!g.inside(tx, tz)) continue;
      const ti = g.idx(tx, tz);
      if (g.type[ti] === T.WALL || g.block[ti] === 1) return false;
      const s = g.surface(tx, tz, x, z);
      if (s !== null && s > ay + (by - ay) * k - 0.1) return false;
    }
    return true;
  }

  clearRun(d, ux, uz, dist) {
    for (let s = 0.5; s < dist; s += 0.4) {
      const x = d.pos.x + ux * s, z = d.pos.z + uz * s;
      const gy = this.grid.groundAt(x, z);
      if (gy === null || Math.abs(gy - d.pos.y) > 0.4) return false;
      const t = this.grid.typeAt(Math.floor(x), Math.floor(z));
      if (t === T.WALL || t === T.HAZARD) return false;
    }
    return true;
  }

  boltThreat(d) {
    for (const b of this.bolts) {
      if (b.team === d.team) continue;
      const dx = d.pos.x - b.pos.x, dz = d.pos.z - b.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.6) continue;
      if ((dx * b.vx + dz * b.vz) / (dist * b.speed) > 0.9) return true;
    }
    return false;
  }

  arcTargets(d, range, chains, first = null) {
    const out = [];
    let from = d.pos;
    const pool = this.hostilesOf(d).filter((o) => !o.phasing);
    if (d.isPlayer || d.team === 'k') for (const c of this.devices) if (c.kind === 'conduit' && !c.on) pool.push(c);
    // the locked target goes first, if it's in reach
    if (first && pool.includes(first) && Math.hypot(first.pos.x - d.pos.x, first.pos.z - d.pos.z) < range) { out.push(first); from = first.pos; }
    for (let i = out.length; i <= chains; i++) {
      let best = null, bd = i === 0 ? range : 2.8;
      for (const o of pool) {
        if (out.includes(o)) continue;
        const dist = Math.hypot(o.pos.x - from.x, o.pos.z - from.z);
        if (dist < bd && Math.abs(o.pos.y - from.y) < 1.5) { bd = dist; best = o; }
      }
      if (!best) break;
      out.push(best);
      from = best.pos;
    }
    return out;
  }

  tractorTarget(d, range, prefer = null) {
    if (prefer && prefer.kind === 'droid' && prefer.alive && prefer.state === 'active' && prefer.pos.distanceTo(d.pos) < range) return prefer;
    const f = d.forward();
    let best = null, bestScore = Infinity;
    const consider = (o, kind) => {
      const dx = o.pos.x - d.pos.x, dz = o.pos.z - d.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range || dist < 0.5) return;
      const cos = (dx * f.x + dz * f.z) / dist;
      if (cos < 0.72) return;
      const score = dist * (2 - cos) + (kind === 'crate' ? 0.5 : 0);
      if (score < bestScore) { bestScore = score; best = o; }
    };
    if (d.isPlayer) {
      for (const o of this.hostilesOf(d)) if (o.kind === 'droid') consider(o, 'droid');
      for (const c of this.crates) if (!c.removed && !c.heavy) consider(c, 'crate');
      for (const p of this.pickups) if (!p.locked) consider(p, 'pickup');
    } else {
      const t = d.brain && d.brain.target;
      if (t && t.kind === 'droid' && t.alive && !t.cloaked) consider(t, 'droid');
    }
    return best;
  }

  turretTarget(t) {
    const range = 8.5;
    let best = null, bd = range;
    for (const d of this.droids) {
      if (d.team === t.team || !d.alive || d.state !== 'active' || d.cloaked) continue;
      const dist = d.pos.distanceTo(t.pos);
      if (dist < bd && this.canSee(t.pos.clone().setY(t.y + 0.3), d.pos)) { bd = dist; best = d; }
    }
    return best;
  }

  // ------------------------------------------------------------------ actions
  pushCrate(crate, dx, dz, by, opts = {}) {
    if (crate.heavy && !by.heavy && !opts.force) {
      if (by.isPlayer) this.game.hintOnce('heavy', 'Too heavy for wheels. Treads could shift it.');
      return false;
    }
    return crate.tryMove(dx, dz);
  }

  spawnBolt(o) {
    const m = new THREE.Mesh(boltGeo, boltMat(o.color));
    m.position.copy(o.pos);
    m.rotation.y = Math.atan2(o.dx, o.dz);
    m.renderOrder = 6;
    this.root.add(m);
    this.bolts.push({
      pos: o.pos.clone(), vx: o.dx * o.speed, vz: o.dz * o.speed, speed: o.speed,
      team: o.team, owner: o.owner, damage: o.damage, life: o.range / o.speed, mesh: m, color: o.color,
    });
  }

  updateBolts(dt) {
    const g = this.grid;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      let dead = b.life <= 0;
      const steps = 3;
      for (let s = 0; s < steps && !dead; s++) {
        b.pos.x += (b.vx * dt) / steps;
        b.pos.z += (b.vz * dt) / steps;
        const tx = Math.floor(b.pos.x), tz = Math.floor(b.pos.z);
        if (g.inside(tx, tz)) {
          const ti = g.idx(tx, tz);
          const surf = g.surface(tx, tz, b.pos.x, b.pos.z);
          if (g.block[ti] === 1 || g.type[ti] === T.WALL || (surf !== null && surf > b.pos.y)) {
            const dev = this.devices.find((d) => d.x === tx && d.z === tz && d.kind !== 'pickup');
            if (dev && dev.kind === 'target') dev.hit(b);
            else if (dev && dev.kind === 'turret' && dev.integrity > 0) {
              const dmg = dev.damage(b.damage, { by: b.owner });
              if (dmg && b.owner === this.player) this.audio.play('hit', { at: dev.pos });
            }
            this.fx.burst(b.pos, b.color, 8, 2.5, 0.3, 0.08, 4);
            dead = true;
            break;
          }
        }
        for (const d of this.droids) {
          if (!d.alive || d.state !== 'active' || d.team === b.team || d.phasing) continue;
          const dx = d.pos.x - b.pos.x, dz = d.pos.z - b.pos.z;
          if (dx * dx + dz * dz > (d.radius + 0.1) ** 2) continue;
          const midY = d.pos.y + 0.45 * d.scale;
          if (Math.abs(b.pos.y - midY) > 0.55 * d.scale + 0.1) continue;
          // a swerve lets it straight through
          if (d.dodging) {
            if (!b.dodged) { b.dodged = true; if (d.isPlayer) this.game.dodged?.(d); }
            continue;
          }
          const dir = { x: b.vx, z: b.vz };
          if (d.shielding && d.inFront(dir, d.stats.core.arc)) {
            // reflect, and it's ours now
            const f = d.forward();
            const dot = b.vx * f.x + b.vz * f.z;
            b.vx -= 2 * dot * f.x; b.vz -= 2 * dot * f.z;
            b.team = d.team; b.owner = d;
            b.damage *= d.stats.core.reflectMult;
            b.life = 1.2;
            b.color = d.accent;
            b.mesh.material = boltMat(d.accent);
            b.mesh.rotation.y = Math.atan2(b.vx, b.vz);
            b.pos.x += b.vx * 0.03; b.pos.z += b.vz * 0.03;
            this.audio.play('reflect', { at: d.pos });
            this.fx.burst(b.pos, d.accent, 10, 2, 0.3, 0.1, 2);
            if (d.isPlayer) this.game.stat('reflects');
            break;
          }
          d.damage(b.damage, { by: b.owner, kind: 'bolt', dir });
          d.knock(b.vx * 0.08, b.vz * 0.08);
          if (d.brain) d.brain.provoke();
          this.fx.burst(b.pos, b.color, 10, 2.5, 0.35, 0.09, 4);
          this.audio.play(d.isPlayer ? 'hurt' : 'hit', { at: d.pos });
          dead = true;
          break;
        }
      }
      if (dead) {
        this.root.remove(b.mesh);
        this.bolts.splice(i, 1);
        continue;
      }
      b.mesh.position.copy(b.pos);
      if (Math.random() < 0.5) this.fx.emit(b.pos.x, b.pos.y, b.pos.z, 0, 0, 0, new THREE.Color(b.color).multiplyScalar(1.4), 0.18, 0.08, 0, 0);
    }
  }

  // Two bodies met. Was it a ram?
  onImpact(a, b, speed, nx, nz) {
    // a shove from KLP-2's side counts towards a ring-out, however gentle
    if (a.team !== b.team) {
      if (a.team === 'k') b.lastHit = { by: a, t: this.time };
      if (b.team === 'k') a.lastHit = { by: b, t: this.time };
    }
    if (speed < TUNING.ramSpeed) return;
    // whoever was moving into the other is the rammer
    const va = a.vel.x * nx + a.vel.z * nz;
    const vb = -(b.vel.x * nx + b.vel.z * nz);
    const [atk, vic, dirx, dirz] = va >= vb ? [a, b, nx, nz] : [b, a, -nx, -nz];
    if (atk.team === vic.team) {
      // knocked into a workmate: a pile-up, and both of them feel it
      const h = atk.lastHit;
      if (atk.team !== 'k' && !atk.dash && !atk.lunge && speed > 4.5 && h && h.by && h.by.team !== atk.team && this.time - h.t < 1) {
        const dmg = (speed - 3) * 2.2;
        vic.lastHit = { by: h.by, t: this.time };
        vic.damage(dmg, { by: h.by, kind: 'slam', dir: { x: dirx, z: dirz } });
        atk.damage(dmg * 0.5, { by: h.by, kind: 'slam' });
        vic.knock(dirx * speed * 0.6, dirz * speed * 0.6, 0.7);
        if (vic.brain) vic.brain.provoke();
        const mid = atk.pos.clone().lerp(vic.pos, 0.5); mid.y += 0.35;
        this.fx.burst(mid, 0xffffff, 18, 3.5, 0.4, 0.1, 6);
        this.fx.ring(mid.clone().setY(vic.pos.y), 0xffffff, 1.2, 0.3);
        this.audio.play('slam', { at: mid });
        this.game.word?.(mid, 'PILE-UP', 'slam');
        if (h.by.team === 'k') this.game.hitStop = Math.max(this.game.hitStop || 0, 0.07);
        this.shake(vic, 0.3);
        return;
      }
      this.audio.play('bump', { at: atk.pos });
      return;
    }
    let mult = 1, knockMult = 1;
    if (atk.dash) mult = knockMult = atk.stats.drive.ramMult || 2;
    else if (atk.lunge) { mult = atk.lunge.mult ?? (atk.stats.arm.ramMult || 1.5); knockMult = atk.lunge.knock ?? mult; }
    if (atk.isPlayer && this.game.hasPerk('ramplate')) { mult *= 1.6; knockMult *= 1.3; }
    // a raised shield takes a ram head-on
    if (vic.shielding && vic.inFront({ x: dirx, z: dirz }, vic.stats.core.arc)) {
      atk.knock(-dirx * 6, -dirz * 6, 0.5);
      this.audio.play('reflect', { at: vic.pos });
      this.fx.burst(vic.pos.clone().setY(vic.pos.y + 0.4), vic.accent, 12, 2.5, 0.35, 0.1, 2);
      return;
    }
    const dmg = (speed - 1.6) * 2.0 * Math.sqrt(atk.mass) * mult;
    vic.damage(dmg, { by: atk, kind: 'ram', dir: { x: dirx, z: dirz } });
    const charge = atk.lunge ? atk.lunge.charge || 0 : 0;
    const push = Math.min(vic.isPlayer ? 7 : 9 + charge * 2, (2 + speed * 0.7) * knockMult * Math.sqrt(atk.mass / vic.mass));
    vic.knock(dirx * push, dirz * push, atk.dash ? 0.5 : 0.15 + charge * 0.3);
    if (vic.brain) vic.brain.provoke();
    const mid = atk.pos.clone().lerp(vic.pos, 0.5); mid.y += 0.3;
    this.fx.burst(mid, 0xffffff, 10 + Math.floor(mult * 4), 3, 0.35, 0.09, 6);
    this.audio.play('ram', { at: mid, pitch: 1 / Math.sqrt(atk.mass) });
    if (atk.isPlayer || vic.isPlayer) {
      this.shake(atk, Math.min(0.5, 0.12 * mult + speed * 0.03));
      this.game.hitStop = Math.max(this.game.hitStop || 0, Math.min(0.1, 0.025 + dmg * 0.002 + charge * 0.03));
      if (atk.isPlayer && this.game.input) this.game.input.rumble(Math.min(1, 0.2 + dmg / 40), 90);
    }
    // a dash or a shove lands once
    if (atk.dash) { atk.dash = null; atk.vel.x *= 0.2; atk.vel.z *= 0.2; }
    if (atk.lunge) { atk.lunge = null; atk.vel.x *= 0.15; atk.vel.z *= 0.15; }
  }

  damageScale(d, src) {
    let k = 1;
    if (d.isPlayer) {
      if (src.kind === 'ram' || src.kind === 'stomp' || src.kind === 'slam') k *= 0.45;
      if (src.kind === 'bolt' && src.by && !src.by.isPlayer) k *= 0.75;
      if (this.game.settings.assist) k *= 0.55;
      if (this.game.hasPerk('plating')) k *= 0.8;
    } else if (d.team === 'k') {
      k *= 0.7;   // the gang is a little tougher than it looks
    } else if (src.by && src.by.team === 'k') {
      if (src.by.isPlayer && this.game.hasPerk('overcharge')) k *= 1.25;
      // a stunned droid can't brace: double damage
      if (d.stunned && src.kind !== 'slam' && src.kind !== 'hazard') { k *= 2; src.crit = true; }
    }
    return k;
  }

  energyRegenScale(d) {
    return d.isPlayer && this.game.hasPerk('capacitor') ? 1.5 : 1;
  }

  onDamaged(d, amount, src) {
    if (d.isPlayer) {
      this.game.onPlayerHurt(amount, src);
      return;
    }
    if (src.by && src.by.isPlayer && this.game.hasPerk('leech') && src.kind === 'bolt') {
      this.player.energy = Math.min(this.player.maxEnergy, this.player.energy + 3);
    }
    if (amount > 0.5) this.game.onDroidHurt?.(d, src);
    this.game.hitFeedback?.(d, amount, src);
  }

  // A droid knocked flying into a wall: damage and a stun, credited to
  // whoever sent it there.
  onSlam(d, into, nx, nz) {
    const h = d.lastHit;
    if (d.slamT > 0 || !h || !h.by || h.by.team === d.team || this.time - h.t > 1) return;
    d.slamT = 0.4;
    const dmg = (Math.min(into, 12) - 4) * 1.5;
    d.damage(dmg, { by: h.by, kind: 'slam', dir: { x: -nx, z: -nz } });
    d.stun = Math.max(d.stun, Math.min(1.4, 0.6 + (into - 5) * 0.09) * (1 - (d.stats.drive.knockResist || 0) * 0.5));
    if (d.brain) d.brain.provoke();
    const at = d.pos.clone(); at.x -= nx * d.radius; at.z -= nz * d.radius; at.y += 0.3;
    this.fx.burst(at, 0xffffff, 16, 3.2, 0.35, 0.09, 6);
    this.fx.burst(at, d.accent, 10, 2.5, 0.4, 0.1, 4);
    this.audio.play('slam', { at });
    this.game.word?.(at, 'SLAM', 'slam');
    if (h.by.team === 'k' || d.isPlayer) {
      this.game.hitStop = Math.max(this.game.hitStop || 0, 0.06);
      this.shake(d, 0.3);
    }
  }

  onDestroyed(d, src) {
    if (d.isPlayer) { this.game.playerDied(src); return; }
    d.alive = false;
    if (d.team === 'k') {
      this.explode(d.pos.clone().setY(d.pos.y + 0.4), PLAYER_COLOUR, 0.8 + d.scale * 0.3);
      this.removeDroid(d);
      this.game.allyLost(d, 'destroyed');
      return;
    }
    this.explode(d.pos.clone().setY(d.pos.y + 0.4), this.deck.ink, 1 + d.scale * 0.4);
    this.scrap.burst(d.pos, scrapFor(d.cls));
    if (d.bounty) this.game.bountyClaimed(d, 'destroyed');
    if (src && src.by && src.by.team === 'k' && !src.by.isPlayer && Math.random() < 0.6) this.game.say?.(src.by, 'allyKill');
    this.removeDroid(d);
    this.claimEvent('droid', d);
    this.game.stat('destroyed');
    this.game.archiveSee(d, 'destroyed');
    if (d.command) this.grantClearance('destroyed');
  }

  removeDroid(d) {
    if (this.lock && this.lock.target === d) this.lock.target = null;
    d.releaseParts();
    // anyone pulling this droid lets go
    for (const o of this.droids) if (o.mod.arm.target === d) o.releaseParts();
    this.root.remove(d.model.group);
    d.model.dispose();
    const i = this.droids.indexOf(d);
    if (i >= 0) this.droids.splice(i, 1);
  }

  onFellIntoVoid(d) {
    if (d.isPlayer) {
      this.audio.play('fall');
      // nothing up in the Heap can hurt you
      if (!this.build.heap) d.damage(TUNING.voidDamage, { force: true, kind: 'void' });
      if (!d.alive || d.integrity <= 0) return;
      d.pos.copy(d.lastSafe);
      d.vel.x = d.vel.z = 0; d.vy = 0; d.dash = null; d.hovering = false;
      d.invuln = 1.2;
      this.fx.burst(d.pos.clone().setY(d.pos.y + 0.5), PLAYER_COLOUR, 26, 2.2, 0.7, 0.12, 0);
      this.game.toast('Lost to the void. Rebuilt at the last safe floor.');
      this.game.renderer.follow(d.pos, 0, true);
      return;
    }
    d.alive = false;
    if (d.team === 'k') { this.removeDroid(d); this.game.allyLost(d, 'void'); return; }
    const ko = d.koBy || this.ringOutBy(d);
    this.removeDroid(d);
    this.claimEvent('droid', d);
    this.game.stat('voided');
    this.game.archiveSee(d, 'destroyed');
    if (ko) this.game.addScrap(scrapFor(d.cls) * 2, 0, true);
    if (d.bounty) this.game.bountyClaimed(d, 'void');
    else this.game.toast(`${FAMILIES[d.family].name} ${d.cls} lost to the void`);
    if (d.command) this.grantClearance('void');
  }

  // Who put this droid over the edge, if it was us: someone on KLP-2's side
  // hit, rammed or pulled it in the last few seconds.
  ringOutBy(d) {
    const h = d.lastHit;
    if (!h || this.time - h.t > 3 || !h.by || h.by.team !== 'k') return null;
    return h.by;
  }

  // A droid has gone over an edge with nothing below it.
  onDoomed(d) {
    if (d.team === 'k') return;
    const by = this.ringOutBy(d);
    if (by) { d.koBy = by; this.game.ringOut(d, by); }
  }

  onLanding(d, impact) {
    if (d.isPlayer) this.audio.play('land', { at: d.pos });
  }
  onDashBonk(d) { this.audio.play('bump', { at: d.pos }); this.shake(d, 0.15); }
  noEnergy(d) { if (d.isPlayer) { this.audio.play('empty'); this.game.flashEnergy(); } }
  shake(d, a) { if (!d || d.isPlayer || (this.player && d.pos.distanceTo(this.player.pos) < 6)) this.renderer.addShake(a); }

  explode(pos, color, size = 1) {
    this.fx.burst(pos, color, Math.floor(30 * size), 4.5 * size, 0.8, 0.16, 5);
    this.fx.burst(pos, 0xffffff, Math.floor(12 * size), 3 * size, 0.4, 0.12, 3);
    this.fx.ring(pos.clone().setY(pos.y - 0.3), color, 2.2 * size, 0.5);
    this.audio.play('explode', { at: pos });
    if (this.player && pos.distanceTo(this.player.pos) < 8) this.renderer.addShake(0.3 * size);
  }

  // A door or field closed on somebody: nudge them out.
  unstick(x, z) {
    for (const d of this.droids) {
      if (!d.alive) continue;
      const cx = Math.max(x, Math.min(x + 1, d.pos.x)), cz = Math.max(z, Math.min(z + 1, d.pos.z));
      if (Math.hypot(cx - d.pos.x, cz - d.pos.z) < d.radius) {
        d.pos.copy(d.lastSafe.distanceTo(d.pos) < 3 ? d.lastSafe : d.pos.clone().add(new THREE.Vector3(0, 0, 1)));
      }
    }
  }

  alertRoom(src) {
    for (const d of this.droids) {
      if (d === src || d.isPlayer || !d.brain || d.team !== src.team) continue;
      if (d.room === src.room && d.pos.distanceTo(src.pos) < 8 && d.brain.state === 'patrol') {
        d.brain.state = 'chase'; d.brain.seenT = 1;
      }
    }
  }

  // ------------------------------------------------------------------ claiming
  claimEvent(kind, who) {
    if (kind === 'target' || kind === 'conduit' || kind === 'relay' || kind === 'mainframe') return;
    this.claimed = Math.min(this.claimTotal, this.claimed + 1);
    if (this.claimed >= this.claimTotal && this.claimTotal > 0 && !this.fullyClaimed) {
      this.fullyClaimed = true;
      this.game.deckClaimed();
    }
  }
  get claim() { return this.claimTotal ? this.claimed / this.claimTotal : 0; }

  grantClearance(how) {
    if (this.clearance) return;
    this.clearance = true;
    if (this.lift) this.lift.unlock();
    this.game.onClearance(how);
  }

  // ------------------------------------------------------------------ hacking
  hackSpecFor(t) {
    if (t.kind !== 'droid') return t.hackSpec();
    const F = FAMILIES[t.family];
    const hurt = 1 - t.integrity / t.maxIntegrity;
    // a dented droid hacks back with fewer pulsers
    const full = pulsersFor(t.cls) + (t.command ? 1 : 0) + (t.bounty ? 1 : 0);
    const dent = hurt > 0.66 ? 2 : hurt > 0.33 ? 1 : 0;
    const pulsers = Math.max(1, full - dent);
    return {
      fullPulsers: full, dent,
      title: t.bounty ? `${t.bounty}, ${F.name} ${t.cls}` : `${F.name} ${t.cls}`, cls: t.cls, rows: rowsFor(t.cls), pulsers, timer: timerFor(t.cls),
      stunned: t.stunned, hurt, command: t.command, family: t.family,
    };
  }

  // Best thing in grappling reach.
  grappleTarget(p) {
    const reach = 0.55 + (this.game.hasPerk('longreach') ? 0.6 : 0);
    let best = null, bd = Infinity;
    for (const d of this.droids) {
      if (d === p || !d.alive || d.state !== 'active' || d.team === p.team || d.team === 'n') continue;
      if (d.graceT > 0) continue;
      if (Math.abs(d.pos.y - p.pos.y) > 0.7) continue;
      const dist = Math.hypot(d.pos.x - p.pos.x, d.pos.z - p.pos.z) - d.radius - p.radius;
      if (dist < reach && dist < bd) { bd = dist; best = d; }
    }
    for (const t of this.devices) {
      // the Mainframe is offered even while shielded, so you're told why it won't work
      const hackable = t.kind === 'mainframe' ? !t.beaten : t.canHack && t.canHack();
      if (!hackable) continue;
      if (Math.abs(t.y - p.pos.y) > 0.7) continue;
      const dist = Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z) - (t.radius || 0.5) - p.radius;
      if (dist < reach && dist < bd) { bd = dist; best = t; }
    }
    return best;
  }

  pickupNear(p) {
    let best = null, bd = 0.9;
    for (const k of this.pickups) {
      if (k.locked) continue;
      const dist = Math.hypot(k.pos.x - p.pos.x, k.pos.z - p.pos.z);
      if (dist < bd && Math.abs(k.pos.y - 0.45 - p.pos.y) < 0.8) { bd = dist; best = k; }
    }
    return best;
  }

  fabNear(p) {
    for (const f of this.devices) {
      if (f.kind !== 'fabricator') continue;
      if (Math.hypot(f.pos.x - p.pos.x, f.pos.z - p.pos.z) < 1.2 && Math.abs(f.y - p.pos.y) < 0.4) return f;
    }
    return null;
  }

  onLift(p) {
    const l = this.lift;
    if (!l) return false;
    return Math.hypot(l.pos.x - p.pos.x, l.pos.z - p.pos.z) < 0.7 && Math.abs(l.y - p.pos.y) < 0.4;
  }

  // What would Space do right now?
  interaction() {
    const p = this.player;
    if (!p || !p.alive || p.state !== 'active') return null;
    if (this.onLift(p)) return { kind: 'lift', ready: this.clearance };
    if (this.chute && Math.hypot(this.chute.pos.x - p.pos.x, this.chute.pos.z - p.pos.z) < 0.9) return { kind: 'chute', target: this.chute };
    const n = this.npcs.length ? this.npcNear(p) : null;
    if (n) return { kind: 'talk', target: n };
    for (const r of this.devices) {
      if (r.kind === 'reader' && Math.hypot(r.pos.x - p.pos.x, r.pos.z - p.pos.z) < 1.3) return { kind: 'reader', target: r };
    }
    const k = this.pickupNear(p);
    if (k) return { kind: 'pickup', target: k };
    const f = this.fabNear(p);
    if (f) return { kind: 'fabricator', target: f };
    const t = this.grappleTarget(p);
    if (t) return { kind: 'grapple', target: t };
    return null;
  }

  dropModule(mod, at) {
    const x = Math.floor(at.x), z = Math.floor(at.z);
    const t = { t: 'drop', x, z, h: this.grid.hAt(x, z), room: this.grid.room[this.grid.idx(x, z)] ?? -1, ch: '' };
    const k = new Pickup(this, t, { type: 'module', mod });
    k.pos.set(at.x, at.y + 0.45, at.z);
    this.pickups.push(k);
    return k;
  }

  removePickup(k) {
    k.removed = true;
    k.dispose();
    const i = this.pickups.indexOf(k);
    if (i >= 0) this.pickups.splice(i, 1);
  }

  onRelayDown() {
    if (this.mainframe) this.mainframe.relayDown();
  }

  // ------------------------------------------------------------------ frame
  evaluateChannels() {
    for (const ch of this.channels.values()) {
      const on = ch.triggers.length > 0 && ch.triggers.every((t) => t.on);
      if (on !== ch.active) {
        ch.active = on;
        for (const t of ch.targets) t.setActive(on);
      }
    }
    this.channelDirty = false;
  }

  update(dt) {
    this.time += dt;
    for (const d of this.droids) if (d.graceT > 0) d.graceT -= dt;
    // the Heap's residents turn to look at you when you come near
    for (const d of this.npcs) {
      const p = this.player;
      d.intent.aim = p && d.pos.distanceTo(p.pos) < 5 ? { x: p.pos.x - d.pos.x, z: p.pos.z - d.pos.z } : null;
    }
    for (const d of this.droids) if (d.brain && d.alive && d.state === 'active') d.brain.update(dt);
    for (let i = this.droids.length - 1; i >= 0; i--) {
      const d = this.droids[i];
      d.update(dt);
      if (d.state === 'hacked' && d.downT > 3.5) {
        this.fx.burst(d.pos.clone().setY(d.pos.y + 0.3), PLAYER_COLOUR, 16, 1.5, 0.6, 0.1, -1);
        this.removeDroid(d);
      }
    }
    resolveBodies(this.grid, this.bodies(), (a, b, s, nx, nz) => this.onImpact(a, b, s, nx, nz));
    this.updateBolts(dt);
    this.lock.update(dt);
    this.tele.update(dt);
    for (const dev of this.devices) dev.update(dt);
    for (const k of this.pickups) k.update(dt);
    this.scrap.update(dt);
    this.updateBountyMarker(dt);
    this.updatePrizes(dt);
    this.evaluateChannels();

    // which room are we in?
    const p = this.player;
    if (p && p.alive) {
      const tx = Math.floor(p.pos.x), tz = Math.floor(p.pos.z);
      const r = this.grid.inside(tx, tz) ? this.grid.room[this.grid.idx(tx, tz)] : -1;
      if (r >= 0 && r !== this.roomNow) {
        this.roomNow = r;
        const room = this.build.rooms[r];
        const first = !room.visited;
        room.visited = true;
        this.game.onEnterRoom(room, first);
      }
    }

    // the deck's light drifts towards cyan as you claim it
    this.claimShown += (this.claim - this.claimShown) * Math.min(1, dt * 1.5);
    // blend by hue, so magenta passes through blue on its way to cyan
    // rather than through grey
    const mix = this.inkColour.clone().lerpHSL(CYAN, this.claimShown);
    const L = this.level.materials;
    L.floorMat.emissive.copy(mix);
    L.wallMat.emissive.copy(mix);
    L.trimMat.color.copy(mix).multiplyScalar(2.2);
    L.hazardMat.emissiveIntensity = 0.8 + Math.sin(this.time * 9) * 0.25 + Math.sin(this.time * 23) * 0.15;
    if (this.level.hazardMesh) this.level.hazardMesh.material.emissiveMap.offset.x = (this.time * 0.37) % 1;
    this.game.env.setMix(mix, this.claimShown);
  }

  dispose() {
    this.lock.dispose();
    this.tele.dispose();
    for (const b of this.bolts) this.root.remove(b.mesh);
    for (const d of this.droids) d.model.dispose();
    this.scrap.dispose();
    for (const sg of this.signs) sg.dispose();
    this.level.dispose();
    // device materials belong to this deck; geometry is shared and stays
    const keep = new Set([...boltMats.values()]);
    const mats = new Set();
    this.root.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m)); });
    for (const m of mats) if (!keep.has(m)) m.dispose();
    for (const m of Object.values(this.mats)) if (m && m.dispose) m.dispose();
    this.renderer.scene.remove(this.root);
  }
}
