// A droid: KLP-2 or any of the tower's machines. Both are driven the same
// way, by an "intent" (where to go, which part to use), which the player's
// controls or the AI fill in each frame.
import * as THREE from 'three';
import { DroidModel } from '../render/droidModel.js';
import { MODULES, moduleStats, SLOTS } from './modules.js';
import { moveBody, updateVertical } from './physics.js';
import { TUNING, VOID_Y, PLAYER_COLOUR } from '../config.js';
import { T } from './grid.js';
import { ABILITIES } from './abilities.js';
import { FAMILIES, integrityFor } from './roster.js';

let nextId = 1;
const DUST = new THREE.Color(0.22, 0.22, 0.26);

export class Droid {
  constructor(world, o) {
    this.id = nextId++;
    this.world = world;
    this.isPlayer = !!o.player;
    this.team = o.player ? 'k' : (o.team || 'h');
    this.family = o.family || null;
    this.cls = o.cls || 0;
    this.command = !!o.command;
    this.kind = 'droid';
    this.pos = new THREE.Vector3(o.x, o.y ?? 0, o.z);
    this.vel = { x: 0, z: 0 };
    this.vy = 0;
    this.facing = o.facing ?? Math.PI * 1.25;
    this.solid = true;
    this.fixed = false;
    this.grounded = true;
    this.groundY = this.pos.y;
    this.airborne = 0;
    this.hovering = false;
    this.phaseT = 0;
    this.shielding = false;
    this.cloaked = false;
    this.dash = null;
    this.lunge = null;
    this.stun = 0;
    this.invuln = 0;
    this.charge = 0;
    this.alive = true;
    this.state = 'active';     // active | hacked | dead
    this.mods = o.mods;
    this.cd = { drive: 0, arm: 0, core: 0 };
    this.intent = { mx: 0, mz: 0, drive: false, arm: false, core: false, aim: null };
    this.prev = { drive: false, arm: false, core: false };
    this.mod = { drive: {}, arm: {}, core: {} };   // per-part scratch state
    this.pushT = 0; this.pushTile = -1;
    this.energyIdle = 0;
    this.hazardT = 0;
    this.lastSafe = this.pos.clone();
    this.room = o.room ?? -1;
    this.damageTaken = 0;

    const scale = this.isPlayer ? 1.0 : 0.92 + 0.045 * Math.max(1, Math.floor(this.cls / 100)) + (this.command ? 0.12 : 0);
    this.scale = scale;
    this.maxIntegrity = o.integrity ?? (this.isPlayer ? TUNING.playerIntegrity : integrityFor(this.cls) * (this.command ? 1.4 : 1));
    this.integrity = this.maxIntegrity;
    this.maxEnergy = this.isPlayer ? TUNING.playerEnergy : 100;
    this.energy = this.maxEnergy;
    this.accent = o.accent ?? (this.isPlayer ? PLAYER_COLOUR : 0xff00ff);
    this.refresh();
  }

  get phasing() { return this.phaseT > 0; }
  get stunned() { return this.stun > 0; }
  get heavy() { return !!this.stats.drive.heavy; }

  modStats(slot) {
    const m = this.mods[slot];
    return m ? moduleStats(m) : (slot === 'arm' ? MODULES.ram.stats(1) : null);
  }
  modId(slot) {
    const m = this.mods[slot];
    return m ? m.id : (slot === 'arm' ? 'ram' : null);
  }

  // Let go of anything a part is holding on to, like a tractor beam.
  releaseParts() {
    const st = this.mod && this.mod.arm;
    if (st && st.beam) { this.world.fx.removeRibbon(st.beam); st.beam = null; }
    if (st) st.target = null;
    this.charge = 0;
  }

  // Recompute stats and rebuild the model after a part changes.
  refresh() {
    if (this.mod) this.releaseParts();
    if (!this.mods.drive) this.mods.drive = { id: 'wheels', grade: 1 };
    this.stats = {
      drive: moduleStats(this.mods.drive),
      arm: this.modStats('arm'),
      core: this.mods.core ? moduleStats(this.mods.core) : null,
    };
    this.mass = this.stats.drive.mass * (0.8 + this.scale * 0.25) * (this.command ? 1.3 : 1);
    this.radius = 0.36 * this.scale;
    if (this.hovering && this.mods.drive.id !== 'hover') this.hovering = false;
    if (this.shielding && this.modId('core') !== 'shield') this.shielding = false;
    if (this.cloaked && this.modId('core') !== 'cloak') this.cloaked = false;
    this.mod = { drive: {}, arm: {}, core: {} };

    const fam = this.family ? FAMILIES[this.family] : null;
    const spec = {
      shape: this.isPlayer ? 'player' : fam ? fam.shape : 'squat',
      scale: this.scale,
      shell: this.isPlayer ? 0xb4bcc8 : this.command ? 0x1d1f26 : 0x555b6b,
      accent: this.accent,
      label: this.isPlayer ? 'K-2' : String(this.cls),
      drive: this.mods.drive.id,
      arm: this.mods.arm ? this.mods.arm.id : null,
      core: this.mods.core ? this.mods.core.id : null,
      player: this.isPlayer,
      command: this.command,
    };
    const old = this.model;
    this.model = new DroidModel(spec);
    this.model.group.position.copy(this.pos);
    this.model.group.rotation.y = this.facing;
    if (old) {
      const parent = old.group.parent;
      if (parent) { parent.remove(old.group); parent.add(this.model.group); }
      old.dispose();
    }
    this.model.group.userData.droid = this;
    if (this.onRefresh) this.onRefresh();
  }

  setAccent(hex) { this.accent = hex; this.model.setAccent(hex); }

  useEnergy(n) {
    if (!this.isPlayer) return true;   // the tower's droids run on mains power
    if (this.energy < n) return false;
    this.energy -= n;
    this.energyIdle = TUNING.energyRegenDelay;
    return true;
  }
  drain(n) {
    if (!this.isPlayer) return true;
    this.energy = Math.max(0, this.energy - n);
    this.energyIdle = TUNING.energyRegenDelay;
    return this.energy > 0;
  }

  forward() { return { x: Math.sin(this.facing), z: Math.cos(this.facing) }; }

  moveDir() {
    const m = Math.hypot(this.intent.mx, this.intent.mz);
    if (m > 0.1) return { x: this.intent.mx / m, z: this.intent.mz / m };
    return this.forward();
  }

  damage(amount, src = {}) {
    if (!this.alive || this.state !== 'active') return 0;
    if (this.isPlayer && this.invuln > 0 && !src.force) return 0;
    if (this.phasing && !src.force) return 0;
    if (this.shielding && src.dir && this.inFront(src.dir, this.stats.core.arc)) {
      amount *= 0.15;
    }
    amount *= this.world.damageScale(this, src);
    if (src.by && src.by !== this) this.lastHit = { by: src.by, t: this.world.time };
    this.integrity -= amount;
    this.damageTaken += amount;
    this.model.hit();
    if (this.isPlayer) this.invuln = 0.35;
    if (this.cloaked && amount > 1 && src.kind !== 'hazard') this.cloaked = false;
    this.world.onDamaged(this, amount, src);
    if (this.integrity <= 0) {
      this.integrity = 0;
      this.world.onDestroyed(this, src);
    }
    return amount;
  }

  // Is an incoming direction (pointing from the attacker to us) within our front arc?
  inFront(dir, halfArc) {
    const f = this.forward();
    const dot = -(dir.x * f.x + dir.z * f.z) / (Math.hypot(dir.x, dir.z) || 1);
    return dot > Math.cos(halfArc);
  }

  knock(vx, vz, stun = 0) {
    const resist = this.stats.drive.knockResist || 0;
    this.vel.x += vx * (1 - resist);
    this.vel.z += vz * (1 - resist);
    if (stun > 0) this.stun = Math.max(this.stun, stun * (1 - resist * 0.5));
  }

  update(dt) {
    if (this.state === 'hacked') return this.updatePowerDown(dt);
    if (!this.alive) return;
    const w = this.world;

    // timers
    for (const s of SLOTS) this.cd[s] = Math.max(0, this.cd[s] - dt);
    this.stun = Math.max(0, this.stun - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.phaseT > 0) {
      this.phaseT -= dt;
      // don't drop out of phase inside a force field
      if (this.phaseT <= 0 && this.insideField()) this.phaseT = 0.05;
    }
    if (this.airborne > 0) this.airborne -= dt;

    const it = this.intent;
    if (this.stunned) { it.mx = 0; it.mz = 0; it.drive = it.arm = it.core = false; }

    // parts: press / hold / release
    for (const slot of SLOTS) {
      const id = this.modId(slot);
      const ab = id && ABILITIES[id];
      const held = !!it[slot];
      if (ab) {
        const s = this.stats[slot];
        if (held && !this.prev[slot] && ab.press) ab.press(this, w, s);
        else if (held && ab.hold) ab.hold(this, w, s, dt);
        else if (!held && this.prev[slot] && ab.release) ab.release(this, w, s);
        if (ab.passive) ab.passive(this, w, s, dt);
      }
      this.prev[slot] = held;
    }

    // movement
    const ds = this.stats.drive;
    // KLP-2 is a little quicker than the tower's droids, so it can catch a Mite
    const top = ds.speed * (this.isPlayer ? TUNING.playerSpeed : 1);
    let speed = top;
    if (this.shielding) speed *= 0.55;
    if (this.charge > 0 && !this.isPlayer) speed *= 0.5;
    if (this.hovering && this.mods.drive.id !== 'hover') speed *= 0.8;
    const tx = it.mx * speed, tz = it.mz * speed;
    if (this.dash) {
      this.vel.x = this.dash.dx * this.dash.speed;
      this.vel.z = this.dash.dz * this.dash.speed;
      this.dash.t -= dt;
      if (this.dash.t <= 0) { this.dash = null; this.vel.x *= 0.4; this.vel.z *= 0.4; }
    } else if (this.lunge) {
      this.vel.x = this.lunge.dx * this.lunge.speed;
      this.vel.z = this.lunge.dz * this.lunge.speed;
      this.lunge.t -= dt;
      if (this.lunge.t <= 0) { this.lunge = null; this.vel.x *= 0.5; this.vel.z *= 0.5; }
    } else {
      const inputMag = Math.hypot(it.mx, it.mz);
      const cur = Math.hypot(this.vel.x, this.vel.z);
      let rate = inputMag > 0.05 ? ds.accel * (this.isPlayer ? TUNING.playerSpeed : 1) : ds.friction;
      if (cur > speed * 1.1) rate = Math.max(12, ds.friction);          // knockback carries, briefly
      if (!this.grounded && !this.hovering) rate *= 0.15;                 // little control in the air
      const k = rate * dt;
      let dvx = tx - this.vel.x, dvz = tz - this.vel.z;
      const dl = Math.hypot(dvx, dvz);
      if (dl > k) { dvx *= k / dl; dvz *= k / dl; }
      this.vel.x += dvx; this.vel.z += dvz;
    }

    let mdx = this.vel.x * dt, mdz = this.vel.z * dt;
    // KLP-2 won't roll itself off into the void. A ram, a stamp, a tractor
    // beam or a dash still can.
    if (this.isPlayer && this.grounded && !this.hovering && !this.dash && Math.hypot(this.vel.x, this.vel.z) <= top * 1.15 + 0.01) {
      const drop = (x, z) => { const g = w.grid.groundAt(x, z); return g === null || g < this.pos.y - 1.1; };
      if (mdx && drop(this.pos.x + mdx + Math.sign(mdx) * 0.06, this.pos.z)) { mdx = 0; this.vel.x = 0; }
      if (mdz && drop(this.pos.x + mdx, this.pos.z + mdz + Math.sign(mdz) * 0.06)) { mdz = 0; this.vel.z = 0; }
    }
    const hit = moveBody(w.grid, this, mdx, mdz);
    if (hit.hitX !== -1) { this.onBump(hit.hitX, Math.sign(this.vel.x), 0, dt); this.vel.x *= -0.15; }
    if (hit.hitZ !== -1) { this.onBump(hit.hitZ, 0, Math.sign(this.vel.z), dt); this.vel.z *= -0.15; }
    if (hit.hitX === -1 && hit.hitZ === -1) this.pushT = 0;
    if ((hit.hitX !== -1 || hit.hitZ !== -1) && this.dash) { this.dash = null; w.onDashBonk(this); }

    const impact = updateVertical(w.grid, this, dt);
    if (impact > 6) w.onLanding(this, impact);

    // face the way we're going, or our aim
    let fx = it.aim ? it.aim.x : it.mx, fz = it.aim ? it.aim.z : it.mz;
    if (this.dash) { fx = this.dash.dx; fz = this.dash.dz; }
    if (Math.hypot(fx, fz) > 0.1 && !this.stunned) {
      const target = Math.atan2(fx, fz);
      let d = target - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * Math.min(1, dt * (this.isPlayer ? 16 : 7));
    }

    // energy
    if (this.energyIdle > 0) this.energyIdle -= dt;
    else this.energy = Math.min(this.maxEnergy, this.energy + TUNING.energyRegen * w.energyRegenScale(this) * dt);

    // floors
    const tx0 = Math.floor(this.pos.x), tz0 = Math.floor(this.pos.z);
    const tt = w.grid.typeAt(tx0, tz0);
    if (this.grounded && !this.hovering && tt === T.HAZARD && !this.phasing) {
      this.hazardT += dt;
      if (this.hazardT > 0.25) {
        this.hazardT = 0;
        this.damage(TUNING.hazardDps * 0.25, { kind: 'hazard' });
        w.fx.burst(this.pos.clone().setY(this.pos.y + 0.1), w.deck.ink, 5, 2, 0.3, 0.08, 4);
      }
    }
    if (this.grounded && w.grid.isGround(tx0, tz0) && tt !== T.HAZARD && !this.dash) {
      // remember a safe spot to come back to after a fall
      const cx = tx0 + 0.5, cz = tz0 + 0.5;
      if (Math.hypot(this.pos.x - cx, this.pos.z - cz) < 0.35 && w.grid.block[w.grid.idx(tx0, tz0)] === 0) this.lastSafe.set(cx, this.pos.y, cz);
    }
    // over an edge with nothing underneath: it's going
    if (!this.doomed && !this.grounded && !this.hovering && this.airborne <= 0 && this.groundY === null && this.vy < -2) {
      this.doomed = true;
      w.onDoomed(this);
    }
    if (this.groundY !== null) this.doomed = false;
    if (this.pos.y < VOID_Y) w.onFellIntoVoid(this);

    // a little dust when rolling fast
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (this.grounded && !this.hovering && sp > 3 && Math.random() < dt * sp * 2.2 && (this.isPlayer || (w.player && this.pos.distanceTo(w.player.pos) < 10))) {
      const f = this.forward();
      w.fx.emit(this.pos.x - f.x * 0.3 + (Math.random() - 0.5) * 0.3, this.pos.y + 0.05, this.pos.z - f.z * 0.3 + (Math.random() - 0.5) * 0.3,
        -this.vel.x * 0.1, 0.3 + Math.random() * 0.3, -this.vel.z * 0.1, DUST, 0.5, 0.16, -0.4, 2.5);
    }

    this.syncModel(dt);
  }

  insideField() {
    const g = this.world.grid;
    const tx = Math.floor(this.pos.x), tz = Math.floor(this.pos.z);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const x = tx + dx, z = tz + dz;
      if (!g.inside(x, z) || g.block[g.idx(x, z)] !== 2) continue;
      const cx = Math.max(x, Math.min(x + 1, this.pos.x)), cz = Math.max(z, Math.min(z + 1, this.pos.z));
      if (Math.hypot(cx - this.pos.x, cz - this.pos.z) < this.radius) return true;
    }
    return false;
  }

  // Ran into a solid tile: maybe it's a crate we can push.
  onBump(tileIdx, sx, sz, dt) {
    const w = this.world;
    const crate = w.crateAtIdx ? w.crateAtIdx(tileIdx) : null;
    if (!crate) { this.pushT = 0; return; }
    const m = Math.hypot(this.intent.mx, this.intent.mz);
    if (m < 0.3) { this.pushT = 0; return; }
    if (this.pushTile !== tileIdx) { this.pushTile = tileIdx; this.pushT = 0; }
    this.pushT += dt;
    if (this.pushT > 0.16) {
      this.pushT = 0;
      // push along whichever axis we're leaning on hardest
      const ax = Math.abs(this.intent.mx), az = Math.abs(this.intent.mz);
      const dx = ax >= az ? Math.sign(this.intent.mx) : 0;
      const dz = ax >= az ? 0 : Math.sign(this.intent.mz);
      w.pushCrate(crate, dx, dz, this);
    }
  }

  syncModel(dt) {
    const m = this.model;
    m.group.position.copy(this.pos);
    let vis = 1;
    if (this.cloaked) vis = this.isPlayer ? 0.28 : 0.06 + (this.revealT || 0) * 0.5;
    if (this.phasing) vis = Math.min(vis, 0.45);
    let look = 0;
    const p = this.world.player;
    const seen = this.brain && this.brain.state === 'chase' ? this.brain.target : this.brain && this.brain.state === 'follow' ? p : null;
    if (!this.isPlayer && seen) {
      const a = Math.atan2(seen.pos.x - this.pos.x, seen.pos.z - this.pos.z) - this.facing;
      look = Math.atan2(Math.sin(a), Math.cos(a));
    }
    m.update(dt, {
      look,
      speed: Math.hypot(this.vel.x, this.vel.z),
      facing: this.facing,
      charge: this.charge,
      stunned: this.stunned,
      shielding: this.shielding,
      visibility: vis,
      dashing: !!this.dash,
      dead: this.state !== 'active',
    });
  }

  // After a lost hack the droid sags and goes dark.
  updatePowerDown(dt) {
    this.downT = (this.downT || 0) + dt;
    const k = Math.min(1, this.downT / 0.8);
    this.model.group.position.copy(this.pos);
    this.model.body.rotation.x = k * 0.35;
    updateVertical(this.world.grid, this, dt);
    this.model.update(dt, { speed: 0, facing: this.facing, dead: true, visibility: 1, bob: -k * 0.12 });
  }
}
