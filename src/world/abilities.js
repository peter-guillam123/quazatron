// What each part does when its button is pressed, held or let go.
// The same code runs for KLP-2 and for every droid in the tower.
import * as THREE from 'three';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

function muzzle(d) {
  const f = d.forward();
  const s = d.scale;
  // laser sits on the droid's right side
  const rx = f.z, rz = -f.x;
  return v3(d.pos.x + f.x * 0.42 * s - rx * 0.26 * s, d.pos.y + (d.model.bodyMidY + d.model.lift + 0.04) * s, d.pos.z + f.z * 0.42 * s - rz * 0.26 * s);
}

function aimDir(d, w) {
  // KLP-2 fires at whatever it has locked on to, wherever it's going
  if (d.isPlayer && w.lock) {
    const t = w.lock.dirTo(d);
    if (t) return t;
  }
  if (d.intent.aim) {
    const m = Math.hypot(d.intent.aim.x, d.intent.aim.z) || 1;
    return { x: d.intent.aim.x / m, z: d.intent.aim.z / m };
  }
  return d.forward();
}

const lerp = (a, b, k) => a + (b - a) * k;

export const ABILITIES = {
  // ------------------------------------------------------------ drives
  // Plain wheels can swerve: a quick sidestep that bolts and rams pass through.
  wheels: {
    press(d, w, s) {
      if (d.cd.drive > 0 || d.swerve || d.dash || d.lunge || d.stunned || !d.grounded) return;
      if (!d.useEnergy(s.cost)) { w.noEnergy(d); return; }
      // swerve the way you're steering; standing still, step back
      const m = Math.hypot(d.intent.mx, d.intent.mz);
      const f = d.forward();
      const dir = m > 0.1 ? { x: d.intent.mx / m, z: d.intent.mz / m } : { x: -f.x, z: -f.z };
      d.swerve = { t: s.swerveTime, dx: dir.x, dz: dir.z, speed: s.swerveSpeed };
      d.cd.drive = s.cooldown;
      w.audio.play('swerve', { at: d.pos });
      const c = new THREE.Color(d.accent).multiplyScalar(1.4);
      for (let i = 0; i < 8; i++) {
        w.fx.emit(d.pos.x + (Math.random() - 0.5) * 0.3, d.pos.y + 0.15 + Math.random() * 0.4, d.pos.z + (Math.random() - 0.5) * 0.3, -dir.x * 2, 0.2, -dir.z * 2, c, 0.3, 0.12, 0, 3);
      }
    },
    passive(d, w) {
      if (d.swerve && Math.random() < 0.7) {
        w.fx.emit(d.pos.x, d.pos.y + 0.3, d.pos.z, 0, 0, 0, new THREE.Color(d.accent).multiplyScalar(0.9), 0.22, 0.32, 0, 0);
      }
    },
  },

  thrusters: {
    press(d, w, s) {
      if (d.cd.drive > 0 || d.dash || d.stunned) return;
      if (!d.grounded && !d.hovering && d.vy < -2) return;
      if (!d.useEnergy(s.cost)) { w.noEnergy(d); return; }
      const dir = d.moveDir();
      d.dash = { t: s.dashTime, dx: dir.x, dz: dir.z, speed: s.dashSpeed };
      // the first moment of a dash slips past bolts, like a swerve
      d.dodgeT = 0.12;
      d.airborne = s.dashTime + 0.04;
      d.vy = 0;
      d.cd.drive = s.cooldown;
      d.cloaked = false;
      w.audio.play('dash', { at: d.pos });
      w.fx.ring(d.pos, d.accent, 1.2, 0.35, 0.15);
      for (let i = 0; i < 10; i++) {
        w.fx.emit(d.pos.x, d.pos.y + 0.3, d.pos.z, -dir.x * 4 + (Math.random() - 0.5) * 2, Math.random(), -dir.z * 4 + (Math.random() - 0.5) * 2, new THREE.Color(d.accent).multiplyScalar(2), 0.35, 0.14, 0, 3);
      }
    },
    passive(d, w) {
      if (d.dash && Math.random() < 0.8) {
        w.fx.emit(d.pos.x + (Math.random() - 0.5) * 0.2, d.pos.y + 0.3, d.pos.z + (Math.random() - 0.5) * 0.2, 0, 0.2, 0, new THREE.Color(d.accent).multiplyScalar(1.6), 0.3, 0.16, 0, 2);
      }
    },
  },

  hover: {
    hold(d, w, s, dt) {
      if (!d.hovering) {
        if (d.energy < 4 || d.stunned) return;
        if (!d.grounded && d.vy < -4) return;
        d.hovering = true;
        d.vy = 0;
        w.audio.play('hoverOn', { at: d.pos });
      } else if (!d.drain(s.drain * dt)) {
        d.hovering = false;
        w.noEnergy(d);
      }
    },
    release(d) { d.hovering = false; },
    passive(d, w, s, dt) {
      // the tower's hover droids never land
      if (!d.isPlayer && d.state === 'active') d.hovering = true;
      if (d.hovering && Math.random() < dt * 30) {
        w.fx.emit(d.pos.x + (Math.random() - 0.5) * 0.5, d.pos.y + 0.05, d.pos.z + (Math.random() - 0.5) * 0.5, 0, -0.6, 0, new THREE.Color(d.accent).multiplyScalar(1.3), 0.5, 0.1, 0, 1);
      }
    },
  },

  treads: {
    press(d, w, s) {
      if (d.cd.drive > 0 || d.stunned || !d.grounded) return;
      if (!d.useEnergy(s.cost)) { w.noEnergy(d); return; }
      d.cd.drive = s.cooldown;
      w.audio.play('stomp', { at: d.pos });
      w.fx.ring(d.pos, d.accent, s.radius, 0.45);
      w.shake(d, 0.35);
      for (const o of w.hostilesOf(d)) {
        const dx = o.pos.x - d.pos.x, dz = o.pos.z - d.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > s.radius + o.radius || Math.abs(o.pos.y - d.pos.y) > 0.8) continue;
        const k = 7 / Math.max(0.6, dist);
        o.knock((dx / (dist || 1)) * k, (dz / (dist || 1)) * k, s.stun);
        o.damage(s.damage, { by: d, kind: 'stomp', dir: { x: dx, z: dz } });
      }
    },
  },

  // ------------------------------------------------------------ arms
  // The bumper: tap to jab, hold to wind up a shove. The tower's droids only jab.
  ram: {
    press(d, w, s) {
      const st = d.mod.arm;
      if (d.cd.arm > 0 || d.lunge || d.dash || d.swerve || d.stunned) { st.charging = false; return; }
      if (!d.isPlayer) { ABILITIES.ram.launch(d, w, s, 0); return; }
      st.charging = true;
      st.charge = 0;
    },
    hold(d, w, s, dt) {
      const st = d.mod.arm;
      if (!st.charging) return;
      if (d.stunned) { st.charging = false; d.charge = 0; return; }
      const before = st.charge;
      st.charge = Math.min(1, st.charge + dt / s.chargeTime);
      // no winding up past what you can pay for
      const afford = (d.energy - s.cost) / (s.fullCost - s.cost);
      if (st.charge > afford) st.charge = Math.max(0, Math.min(before, afford));
      d.charge = st.charge;
      if (before < 1 && st.charge >= 1) {
        w.audio.play('charged', { at: d.pos });
        w.fx.ring(d.pos, d.accent, 0.9, 0.3, 0.1);
      }
    },
    release(d, w, s) {
      const st = d.mod.arm;
      if (!st.charging) return;
      st.charging = false;
      d.charge = 0;
      ABILITIES.ram.launch(d, w, s, st.charge < 0.15 ? 0 : st.charge);
    },
    launch(d, w, s, c) {
      if (!d.useEnergy(lerp(s.cost, s.fullCost, c))) { w.noEnergy(d); return; }
      const dir = d.isPlayer && w.lock ? w.lock.shoveDir(d) : d.moveDir();
      d.lunge = {
        t: lerp(s.lungeTime, s.fullTime, c), dx: dir.x, dz: dir.z, speed: lerp(s.lungeSpeed, s.fullSpeed, c),
        mult: lerp(s.ramMult, s.fullMult, c), knock: lerp(s.ramMult, s.fullKnock, c), charge: c,
      };
      d.facing = Math.atan2(dir.x, dir.z);
      d.cd.arm = s.cooldown;
      w.audio.play(c > 0.5 ? 'shove' : 'lunge', { at: d.pos, pitch: 1 + c * 0.3 });
      if (c > 0.5) w.fx.ring(d.pos, d.accent, 1 + c, 0.3, 0.1);
    },
  },

  laser: {
    fire(d, w, s) {
      if (d.cd.arm > 0 || d.stunned) return;
      if (!d.useEnergy(s.cost)) { w.noEnergy(d); return; }
      const dir = aimDir(d, w);
      if (d.isPlayer) d.facing = Math.atan2(dir.x, dir.z);
      const p = muzzle(d);
      // the tower's bolts are slower than yours, so you can sidestep them
      const speed = d.isPlayer ? s.speed : 8 + (d.mods.arm ? d.mods.arm.grade : 1) * 0.6;
      w.spawnBolt({ owner: d, team: d.team, pos: p, dx: dir.x, dz: dir.z, speed, damage: s.damage, range: s.range, color: d.accent });
      // a flash at the muzzle and a little kick back
      w.fx.burst(p, d.accent, d.isPlayer ? 6 : 4, 1.4, 0.18, 0.09, 0);
      d.model.kick(d.isPlayer ? 1 : 0.6);
      d.cd.arm = s.cooldown;
      d.cloaked = false;
      w.audio.play('laser', { at: d.pos, pitch: d.isPlayer ? 1 : 0.8 });
    },
    press(d, w, s) { ABILITIES.laser.fire(d, w, s); },
    hold(d, w, s) { if (d.isPlayer) ABILITIES.laser.fire(d, w, s); },
  },

  arc: {
    press(d, w, s) {
      if (d.cd.arm > 0 || d.stunned) return;
      const from = d.pos.clone();
      from.y += d.model.height * 0.95;
      const chain = w.arcTargets(d, s.range, s.chains, d.isPlayer && w.lock ? w.lock.target : null);
      const cost = chain.length ? s.cost : s.cost * 0.4;
      if (!d.useEnergy(cost)) { w.noEnergy(d); return; }
      d.cd.arm = s.cooldown;
      d.cloaked = false;
      w.audio.play('arc', { at: d.pos });
      if (!chain.length) {
        // nothing in reach: a harmless crackle
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2;
          w.fx.lightning(from, from.clone().add(v3(Math.cos(a) * 1.2, -0.3, Math.sin(a) * 1.2)), d.accent, 0.12, 0.05);
        }
        return;
      }
      let prev = from;
      for (const t of chain) {
        const to = t.arcPoint ? t.arcPoint() : t.pos.clone().setY(t.pos.y + 0.4);
        w.fx.lightning(prev, to, d.accent, 0.2, 0.08);
        w.fx.burst(to, d.accent, 10, 2.5, 0.4, 0.1, 5);
        if (t.kind === 'droid' || t.kind === 'turret') {
          t.damage(s.damage, { by: d, kind: 'arc', dir: { x: t.pos.x - d.pos.x, z: t.pos.z - d.pos.z } });
          if (t.kind === 'droid') t.stun = Math.max(t.stun, s.stun);
          else t.stun = Math.max(t.stun || 0, s.stun * 1.5);
        } else if (t.onArc) {
          t.onArc(d);
        }
        prev = to;
      }
    },
  },

  tractor: {
    hold(d, w, s, dt) {
      const st = d.mod.arm;
      if (d.stunned) { ABILITIES.tractor.release(d, w); return; }
      if (!st.target) {
        if (st.retry > 0) { st.retry -= dt; return; }
        st.target = w.tractorTarget(d, s.range, d.isPlayer && w.lock ? w.lock.target : null);
        st.tug = 0;
        if (!st.target) { st.retry = 0.2; return; }
        w.audio.play('tractor', { at: d.pos });
        d.cloaked = false;
      }
      const t = st.target;
      if (!t.alive || t.removed || t.pos.distanceTo(d.pos) > s.range * 1.25 || t.state === 'hacked') {
        ABILITIES.tractor.release(d, w);
        return;
      }
      if (d.isPlayer && !d.drain(s.drain * dt)) { ABILITIES.tractor.release(d, w); w.noEnergy(d); return; }
      const dx = d.pos.x - t.pos.x, dz = d.pos.z - t.pos.z;
      const dist = Math.hypot(dx, dz) || 1;
      d.intent.aim = { x: -dx, z: -dz };
      if (t.kind === 'droid') {
        t.lastHit = { by: d, t: w.time };
        if (dist > d.radius + t.radius + 0.25) {
          const resist = t.stats.drive.knockResist ? 0.15 : 1;
          const k = (s.pull * dt * resist) / Math.max(0.6, t.mass);
          t.vel.x += (dx / dist) * k; t.vel.z += (dz / dist) * k;
        }
      } else if (t.kind === 'crate') {
        st.tug += dt;
        if (st.tug > s.tug && dist > 1.4) {
          st.tug = 0;
          const ax = Math.abs(dx), az = Math.abs(dz);
          const mx = ax >= az ? Math.sign(dx) : 0, mz = ax >= az ? 0 : Math.sign(dz);
          if (!w.pushCrate(t, mx, mz, d, { pull: true })) { ABILITIES.tractor.release(d, w); return; }
        }
      } else if (t.kind === 'pickup') {
        if (dist > 0.6) { t.pos.x += (dx / dist) * 5 * dt; t.pos.z += (dz / dist) * 5 * dt; t.pos.y += ((d.pos.y + 0.3) - t.pos.y) * Math.min(1, dt * 3); t.pulled = 0.3; }
      }
      // the beam
      const from = d.pos.clone(); from.y += (d.model.bodyMidY + d.model.lift) * d.scale;
      const to = t.pos.clone(); to.y += 0.35;
      if (!st.beam || st.beam.dead) st.beam = w.fx.ribbon([from, to], d.accent, 0.12, 1, { persist: true, bright: 1.6 });
      const n = 10;
      const pts = [];
      const time = performance.now() / 1000;
      for (let i = 0; i <= n; i++) {
        const k = i / n;
        const p = from.clone().lerp(to, k);
        p.y += Math.sin(k * Math.PI * 4 - time * 14) * 0.05;
        pts.push(p);
      }
      st.beam.points = pts;
      st.beam.width = 0.1 + Math.sin(time * 20) * 0.03;
      d.charge = 0.5;
    },
    release(d, w) {
      const st = d.mod.arm;
      if (st.beam) { w.fx.removeRibbon(st.beam); st.beam = null; }
      st.target = null;
      d.charge = 0;
      d.intent.aim = null;
    },
  },

  // ------------------------------------------------------------ cores
  shield: {
    hold(d, w, s, dt) {
      if (d.stunned) { d.shielding = false; return; }
      if (!d.shielding) { if (d.energy < 5) return; d.shielding = true; w.audio.play('shield', { at: d.pos }); }
      if (!d.drain(s.drain * dt)) { d.shielding = false; w.noEnergy(d); }
    },
    release(d) { d.shielding = false; },
  },

  cloak: {
    press(d, w) {
      if (d.cloaked) { d.cloaked = false; w.audio.play('uncloak', { at: d.pos }); return; }
      if (d.energy < 8 || d.stunned) { w.noEnergy(d); return; }
      d.cloaked = true;
      w.audio.play('cloak', { at: d.pos });
      w.fx.burst(d.pos.clone().setY(d.pos.y + 0.4), d.accent, 14, 1.5, 0.5, 0.1, 0);
    },
    passive(d, w, s, dt) {
      if (d.cloaked && d.isPlayer && !d.drain(s.drain * dt)) { d.cloaked = false; w.noEnergy(d); }
    },
  },

  phase: {
    press(d, w, s) {
      if (d.cd.core > 0 || d.phasing || d.stunned) return;
      if (!d.useEnergy(s.cost)) { w.noEnergy(d); return; }
      d.phaseT = s.time;
      d.cd.core = s.cooldown + s.time;
      w.audio.play('phase', { at: d.pos });
      w.fx.burst(d.pos.clone().setY(d.pos.y + 0.4), d.accent, 18, 2, 0.5, 0.12, 0);
    },
    passive(d, w, s, dt) {
      if (d.phasing && Math.random() < dt * 40) {
        w.fx.emit(d.pos.x + (Math.random() - 0.5) * 0.6, d.pos.y + Math.random() * 0.8, d.pos.z + (Math.random() - 0.5) * 0.6, 0, 0.4, 0, new THREE.Color(d.accent).multiplyScalar(1.5), 0.4, 0.09, 0, 1);
      }
    },
  },
};
