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
    this.target = null;
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
    if (this.temper === 'timid') this.fleeT = 2.5;
    if (this.d.cloaked) this.d.cloaked = false;
  }

  get temper() {
    // a Mite on your side finds its nerve
    return this.ally && this.fam.temper === 'timid' ? 'hunter' : this.fam.temper;
  }

  get ally() { return this.d.team === 'k'; }

  // Who to fight. The tower's droids go for KLP-2, or for one of its gang
  // if that's nearer; the gang goes for whatever is near KLP-2.
  perceive() {
    const d = this.d, w = this.w, p = w.player;
    this.sees = false;
    const visible = (o, range) => {
      if (!o || !o.alive || o.state === 'hacked' || (o.kind === 'droid' && o.state !== 'active')) return false;
      const dist = d.pos.distanceTo(o.pos);
      if (o.cloaked && dist > 1.4) return false;
      if (dist < 1.6) return true;
      return dist < range && w.canSee(d.pos, o.pos);
    };
    if (this.ally) {
      let best = null, bd = Infinity;
      for (const o of w.hostilesOf(d)) {
        if (!p || o.pos.distanceTo(p.pos) > 9) continue;
        const dist = d.pos.distanceTo(o.pos);
        if (dist < bd && visible(o, 7.5)) { bd = dist; best = o; }
      }
      this.target = best;
      this.sees = !!best;
      return;
    }
    const live = p && p.alive && p.state === 'active' ? p : null;
    let best = live, bd = live ? d.pos.distanceTo(live.pos) - 1.5 : Infinity;
    let seen = live && visible(live, this.sight);
    for (const o of w.droids) {
      if (o === p || o.team !== 'k' || !o.alive || o.state !== 'active') continue;
      const dist = d.pos.distanceTo(o.pos);
      if (dist < bd && visible(o, this.sight)) { bd = dist; best = o; seen = true; }
    }
    this.target = best;
    this.sees = !!seen;
  }

  update(dt) {
    const d = this.d, w = this.w;
    const it = d.intent;
    it.mx = 0; it.mz = 0; it.arm = false; it.drive = false; it.core = false; it.aim = null;
    if (d.stunned) { this.attack = null; d.charge = 0; return; }

    this.hitT = Math.max(0, this.hitT - dt);
    this.cool -= dt; this.driveCool -= dt; this.fleeT -= dt; this.strafeT -= dt;
    this.shieldRest = Math.max(0, this.shieldRest - dt);

    // ---- perception, a few times a second
    this.lookT -= dt;
    if (this.lookT <= 0) { this.lookT = 0.18; this.perceive(); }
    const target = this.target && (this.target.alive !== false) ? this.target : null;

    // ---- cloak: hidden until it means to strike
    if (d.modId('core') === 'cloak') {
      const wantCloak = !this.attack && this.hitT <= 0 && this.revealT <= 0;
      if (wantCloak !== d.cloaked && Math.random() < dt * 2) d.cloaked = wantCloak;
      this.revealT = Math.max(0, (this.revealT || 0) - dt);
      d.revealT = this.attack ? Math.min(1, (d.revealT || 0) + dt * 2) : Math.max(0, (d.revealT || 0) - dt);
    }

    if (this.ally) {
      if (target && this.sees) { this.state = 'chase'; this.fight(dt, target); } else { this.state = 'follow'; this.attack = null; d.charge = 0; this.follow(dt); }
      return;
    }

    if (this.sees) {
      this.seenT += dt; this.lostT = 0;
      if (this.state === 'patrol' && this.seenT > this.reaction) { this.state = 'chase'; w.alertRoom(d); this.w.game.onSpotted?.(d); }
    } else {
      this.seenT = 0; this.lostT += dt;
      if (this.state === 'chase' && this.lostT > 4 && this.hitT <= 0) this.state = 'patrol';
    }

    if (this.state === 'patrol' || !target) {
      this.patrol(dt);
      return;
    }
    this.fight(dt, target);
  }

  // Close in, keep away or circle, depending on parts; then attack.
  fight(dt, target) {
    const d = this.d, w = this.w;
    const it = d.intent;
    const temper = this.temper;
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

    // ---- shield up when facing the enemy
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
      else if (arm === 'tractor' && dist < d.stats.arm.range * 0.9 && target.kind === 'droid') this.begin('arm', 0.45);
      else if ((arm === 'ram' || !arm) && dist < 2.2 && temper !== 'timid') this.begin('arm', 0.38);
    }
    if (this.sees && this.driveCool <= 0 && !this.attack) {
      if (drive === 'thrusters' && dist > 2.2 && dist < 5.5 && w.clearRun(d, ux, uz, dist)) this.begin('drive', 0.45);
      else if (drive === 'treads' && dist < 1.9) this.begin('drive', 0.5);
    }
  }

  // The gang keeps close to KLP-2, each in its own spot, and catches up if
  // it gets left behind.
  follow(dt) {
    const d = this.d, w = this.w, p = w.player;
    if (!p || !p.alive) return;
    const slot = w.droids.filter((o) => o.team === 'k' && !o.isPlayer).indexOf(d);
    const a = p.facing + Math.PI + (slot - 1) * 0.9;
    const gx = p.pos.x + Math.sin(a) * 1.5, gz = p.pos.z + Math.cos(a) * 1.5;
    const dx = gx - d.pos.x, dz = gz - d.pos.z;
    const m = Math.hypot(dx, dz);
    const far = d.pos.distanceTo(p.pos);
    if (m > 0.5) {
      const k = Math.min(1, m / 2.5);
      const s = this.steer((dx / m) * k, (dz / m) * k);
      d.intent.mx = s.x; d.intent.mz = s.z;
    }
    // left behind, or stuck on another level: catch up
    this.lagT = far > 8 || Math.abs(p.pos.y - d.pos.y) > 1.2 ? (this.lagT || 0) + dt : 0;
    if (this.lagT > 2.5 && p.grounded) {
      this.lagT = 0;
      w.warpToPlayer(d);
    }
  }

  armCooldown() {
    const arm = this.d.modId('arm');
    const g = this.grade;
    if (arm === 'laser') return Math.max(0.9, 2.4 - g * 0.13) + Math.random() * 0.7;
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
