// How the tower's droids behave. A droid's parts decide its tactics: a
// laser keeps its distance, an arc coil closes in, a tractor pulls, a shield
// faces you. Every attack is telegraphed by the droid's lights brightening.
import { FAMILIES } from './roster.js';
import { T } from './grid.js';

const TAU = Math.PI * 2;

export class Brain {
  constructor(d, world) {
    this.d = d;
    this.w = world;
    this.fam = FAMILIES[d.family] || { temper: 'hunter' };
    this.state = 'patrol';
    this.home = d.pos.clone();
    this.wander = null;
    this.wanderT = 0;
    this.seenT = 0;
    this.lostT = 0;
    this.lookT = Math.random() * 0.3;
    this.sees = false;
    this.attack = null;          // { slot, t, dur }
    this.cool = 1 + Math.random() * 1.5;
    this.driveCool = 2 + Math.random() * 2;
    this.strafe = Math.random() < 0.5 ? -1 : 1;
    this.strafeT = 0;
    this.shieldRest = 0;
    this.grade = Math.max(1, Math.floor(d.cls / 100));
    this.reaction = Math.max(0.12, 0.55 - this.grade * 0.045);
    this.sight = 6.5 + this.grade * 0.25 + (d.command ? 1.5 : 0);
    this.fleeT = 0;
    this.hitT = 0;
    this.revealT = 0;
  }

  // Something hit us: wake up.
  provoke() {
    this.hitT = 2.5;
    if (this.state === 'patrol') { this.state = 'chase'; this.seenT = 1; }
    if (this.fam.temper === 'timid') this.fleeT = 2.5;
    if (this.d.cloaked) this.d.cloaked = false;
  }

  update(dt) {
    const d = this.d, w = this.w;
    const it = d.intent;
    it.mx = 0; it.mz = 0; it.arm = false; it.drive = false; it.core = false; it.aim = null;
    if (d.stunned) { this.attack = null; d.charge = 0; return; }

    const p = w.player;
    const target = p && p.alive && p.state === 'active' ? p : null;
    this.hitT = Math.max(0, this.hitT - dt);
    this.cool -= dt; this.driveCool -= dt; this.fleeT -= dt; this.strafeT -= dt;
    this.shieldRest = Math.max(0, this.shieldRest - dt);

    // ---- perception, a few times a second
    this.lookT -= dt;
    if (this.lookT <= 0) {
      this.lookT = 0.18;
      this.sees = false;
      if (target) {
        const dist = d.pos.distanceTo(target.pos);
        const cloakedFar = target.cloaked && dist > 1.4;
        if (!cloakedFar && dist < this.sight && w.canSee(d.pos, target.pos)) this.sees = true;
        if (!cloakedFar && dist < 1.6) this.sees = true;
      }
    }
    if (this.sees) {
      this.seenT += dt; this.lostT = 0;
      if (this.state === 'patrol' && this.seenT > this.reaction) { this.state = 'chase'; w.alertRoom(d); }
    } else {
      this.seenT = 0; this.lostT += dt;
      if (this.state === 'chase' && this.lostT > 4 && this.hitT <= 0) this.state = 'patrol';
    }

    // hover droids float everywhere; everyone else minds the edges
    const temper = this.fam.temper;

    // ---- cloak: hidden until it means to strike
    if (d.modId('core') === 'cloak') {
      const wantCloak = !this.attack && this.hitT <= 0 && this.revealT <= 0;
      if (wantCloak !== d.cloaked && Math.random() < dt * 2) d.cloaked = wantCloak;
      this.revealT = Math.max(0, (this.revealT || 0) - dt);
      d.revealT = this.attack ? Math.min(1, (d.revealT || 0) + dt * 2) : Math.max(0, (d.revealT || 0) - dt);
    }

    if (this.state === 'patrol' || !target) {
      this.patrol(dt);
      return;
    }

    const dx = target.pos.x - d.pos.x, dz = target.pos.z - d.pos.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const ux = dx / dist, uz = dz / dist;
    it.aim = { x: dx, z: dz };

    // ---- an attack in progress: hold still-ish and charge
    if (this.attack) {
      const a = this.attack;
      a.t += dt;
      d.charge = Math.min(1, a.t / a.dur);
      if (a.slot === 'arm' && d.modId('arm') === 'tractor') {
        it.arm = true;
        if (a.t > a.dur + 1.4 || dist > d.stats.arm.range * 1.2) { this.attack = null; d.charge = 0; this.cool = 2.4; }
        return;
      }
      if (a.t >= a.dur) {
        if (a.slot === 'arm') {
          // a little aiming error on the cheaper models
          const err = (Math.random() - 0.5) * Math.max(0.02, 0.22 - this.grade * 0.022);
          const ang = Math.atan2(dx, dz) + err;
          it.aim = { x: Math.sin(ang), z: Math.cos(ang) };
          d.facing = ang;
          it.arm = true;
          it.mx = ux * 0.01; it.mz = uz * 0.01;
          this.cool = this.armCooldown();
        } else {
          it.drive = true;
          it.mx = ux; it.mz = uz;
          this.driveCool = 2.5 + Math.random() * 2;
        }
        this.attack = null;
        d.charge = 0;
        this.shieldRest = 1.2;
        this.revealT = 0.6;
      }
      return;
    }

    // ---- shield up when facing the player
    if (d.modId('core') === 'shield' && this.shieldRest <= 0 && dist < 8 && this.sees) {
      it.core = true;
      if (Math.random() < dt * 0.25) this.shieldRest = 1.5;   // it has to rest sometimes
    }
    // ---- phase out of trouble
    if (d.modId('core') === 'phase' && d.cd.core <= 0 && (w.boltThreat(d) || (target.dash && dist < 3))) it.core = true;

    // ---- choose movement
    let mx = 0, mz = 0;
    const arm = d.modId('arm');
    const drive = d.modId('drive');
    if (temper === 'timid' || this.fleeT > 0) {
      mx = -ux; mz = -uz;
    } else if (arm === 'laser') {
      const want = 5;
      if (dist > want + 1.5) { mx = ux; mz = uz; } else if (dist < want - 1.5) { mx = -ux; mz = -uz; }
      if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = 1.5 + Math.random() * 2; }
      mx += -uz * this.strafe * 0.7; mz += ux * this.strafe * 0.7;
    } else if (arm === 'tractor') {
      const want = 4.5;
      if (dist > want + 1) { mx = ux; mz = uz; } else if (dist < want - 1.5) { mx = -ux; mz = -uz; }
      mx += -uz * this.strafe * 0.4; mz += ux * this.strafe * 0.4;
    } else {
      mx = ux; mz = uz;
      if (dist < 1.2) { mx *= 0.2; mz *= 0.2; }
    }
    const steer = this.steer(mx, mz);
    it.mx = steer.x; it.mz = steer.z;
    if (d.modId('core') === 'shield' && it.core) { it.mx *= 0.6; it.mz *= 0.6; }

    // ---- start an attack?
    if (this.sees && this.cool <= 0) {
      if (arm === 'laser' && dist < d.stats.arm.range * 0.8) this.begin('arm', 0.5 - this.grade * 0.02);
      else if (arm === 'arc' && dist < d.stats.arm.range * 0.8) this.begin('arm', 0.65);
      else if (arm === 'tractor' && dist < d.stats.arm.range * 0.9) this.begin('arm', 0.45);
      else if ((arm === 'ram' || !arm) && dist < 2.2 && temper !== 'timid') this.begin('arm', 0.38);
    }
    if (this.sees && this.driveCool <= 0 && !this.attack) {
      if (drive === 'thrusters' && dist > 2.2 && dist < 5.5 && w.clearRun(d, ux, uz, dist)) this.begin('drive', 0.45);
      else if (drive === 'treads' && dist < 1.9) this.begin('drive', 0.5);
    }
  }

  armCooldown() {
    const arm = this.d.modId('arm');
    const g = this.grade;
    if (arm === 'laser') return Math.max(0.6, 1.9 - g * 0.12) + Math.random() * 0.6;
    if (arm === 'arc') return 2.2 - g * 0.1 + Math.random() * 0.5;
    return 1.4 + Math.random() * 0.8;
  }

  begin(slot, dur) {
    this.attack = { slot, t: 0, dur: Math.max(0.25, dur) };
    this.w.audio.play('telegraph', { at: this.d.pos, pitch: slot === 'drive' ? 0.7 : 1 });
  }

  patrol(dt) {
    const d = this.d, w = this.w;
    d.charge = 0;
    this.wanderT -= dt;
    if (!this.wander || this.wanderT <= 0 || Math.hypot(this.wander.x - d.pos.x, this.wander.z - d.pos.z) < 0.4) {
      // pick a spot near home
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * TAU, r = 1 + Math.random() * 3.5;
        const x = this.home.x + Math.cos(a) * r, z = this.home.z + Math.sin(a) * r;
        if (this.safe(x, z)) { this.wander = { x, z }; break; }
      }
      this.wanderT = 2 + Math.random() * 3;
    }
    if (this.wander && Math.random() < 0.985) {
      const dx = this.wander.x - d.pos.x, dz = this.wander.z - d.pos.z;
      const m = Math.hypot(dx, dz);
      if (m > 0.4) {
        const s = this.steer(dx / m * 0.45, dz / m * 0.45);
        d.intent.mx = s.x; d.intent.mz = s.z;
      } else this.wander = null;
    }
  }

  // Is (x, z) somewhere this droid is happy to roll?
  safe(x, z) {
    const d = this.d, g = this.w.grid;
    const tx = Math.floor(x), tz = Math.floor(z);
    if (!g.inside(tx, tz)) return false;
    const t = g.typeAt(tx, tz);
    if (t === T.WALL) return false;
    if (g.block[g.idx(tx, tz)] === 1) return false;
    if (g.block[g.idx(tx, tz)] === 2 && !d.phasing) return false;
    if (d.hovering) return true;
    if (t === T.HAZARD) return false;
    const gy = g.groundAt(x, z);
    if (gy === null) return false;
    if (gy < d.pos.y - 0.6) return false;
    return true;
  }

  // Bend a wanted direction away from edges and walls.
  steer(mx, mz) {
    const d = this.d;
    const m = Math.hypot(mx, mz);
    if (m < 0.01) return { x: 0, z: 0 };
    const base = Math.atan2(mx, mz);
    const look = 0.55 + d.radius;
    for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3]) {
      const a = base + off;
      const sx = Math.sin(a), sz = Math.cos(a);
      if (this.safe(d.pos.x + sx * look, d.pos.z + sz * look) && this.safe(d.pos.x + sx * look * 0.5, d.pos.z + sz * look * 0.5)) {
        const k = Math.min(1, m) * (off === 0 ? 1 : 0.8);
        return { x: sx * k, z: sz * k };
      }
    }
    return { x: 0, z: 0 };
  }
}
