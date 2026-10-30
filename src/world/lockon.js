// Lock-on: which droid KLP-2's arm will hit, shown as a cyan bracket on the
// floor under it. It prefers whatever is ahead, holds on to a target until
// it leaves range, and follows the right stick on a gamepad. Also draws the
// arrow for a charged shove.
import * as THREE from 'three';
import { PLAYER_COLOUR } from '../config.js';

function bracketTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff';
  g.lineWidth = 9;
  g.lineCap = 'round';
  const a = 14, b = 44;
  for (const [x, y, sx, sy] of [[a, a, 1, 1], [128 - a, a, -1, 1], [a, 128 - a, 1, -1], [128 - a, 128 - a, -1, -1]]) {
    g.beginPath();
    g.moveTo(x, y + sy * (b - a));
    g.lineTo(x, y);
    g.lineTo(x + sx * (b - a), y);
    g.stroke();
  }
  // a faint ring between the corners
  g.lineWidth = 2;
  g.globalAlpha = 0.45;
  g.beginPath(); g.arc(64, 64, 40, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function arrowTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 256, 0, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.05)');
  grad.addColorStop(1, 'rgba(255,255,255,0.9)');
  g.fillStyle = grad;
  g.fillRect(22, 40, 20, 216);
  g.fillStyle = '#fff';
  g.beginPath(); g.moveTo(32, 0); g.lineTo(62, 48); g.lineTo(2, 48); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class LockOn {
  constructor(world) {
    this.world = world;
    this.target = null;
    this.aim = null;          // world direction from the right stick, or null
    this.markerMat = new THREE.MeshBasicMaterial({ map: bracketTexture(), color: new THREE.Color(PLAYER_COLOUR).multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.marker = new THREE.Mesh(geo, this.markerMat);
    this.marker.renderOrder = 4;
    this.marker.visible = false;
    world.root.add(this.marker);

    this.arrowMat = new THREE.MeshBasicMaterial({ map: arrowTexture(), color: new THREE.Color(PLAYER_COLOUR).multiplyScalar(1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const ag = new THREE.PlaneGeometry(1, 1);
    ag.rotateX(-Math.PI / 2);
    ag.translate(0, 0, -0.5);       // runs from the origin out along -z, turned below
    this.arrow = new THREE.Mesh(ag, this.arrowMat);
    this.arrow.renderOrder = 4;
    this.arrow.visible = false;
    world.root.add(this.arrow);
    this.t = 0;
  }

  // How far each arm reaches, for picking a target.
  range(p) {
    const id = p.modId('arm');
    const s = p.stats.arm;
    if (id === 'laser') return s.range * 0.9;
    if (id === 'arc') return s.range + 0.4;
    if (id === 'tractor') return s.range;
    return 3.4;
  }

  valid(o, p, range) {
    if (!o) return false;
    const droid = o.kind === 'droid';
    if (o.kind === 'target') { if (o.on) return false; }
    else if (droid ? !o.alive || o.state !== 'active' : o.integrity <= 0) return false;
    else if (o.team === p.team || o.cloaked) return false;
    const oy = droid ? o.pos.y : o.y;
    if (Math.abs(oy - p.pos.y) > (o.kind === 'target' ? 1.6 : 1.2)) return false;
    const dx = o.pos.x - p.pos.x, dz = o.pos.z - p.pos.z, dist = Math.hypot(dx, dz);
    if (dist > range) return false;
    if (droid) return this.world.canSee(p.pos, o.pos);
    // turrets and switches fill their own tile, so look at the near edge of it
    const k = Math.max(0, dist - 0.6) / (dist || 1);
    return this.world.canSee(p.pos, { x: p.pos.x + dx * k, y: oy, z: p.pos.z + dz * k });
  }

  update(dt) {
    const w = this.world, p = w.player;
    this.t += dt;
    if (!p || !p.alive || p.state !== 'active' || w.game.state !== 'play') { this.target = null; this.hide(); return; }
    const range = this.range(p);
    const laser = p.modId('arm') === 'laser';
    // the way KLP-2 is looking: the right stick if it's held, else where it's going
    let dir = this.aim;
    const moving = Math.hypot(p.intent.mx, p.intent.mz) > 0.2;
    if (!dir) dir = moving ? { x: p.intent.mx / Math.hypot(p.intent.mx, p.intent.mz), z: p.intent.mz / Math.hypot(p.intent.mx, p.intent.mz) } : p.forward();
    // standing still, anything not behind you will do
    const cone = this.aim ? 0.55 : moving ? 1.15 : 2.0;
    const score = (o) => {
      const dx = o.pos.x - p.pos.x, dz = o.pos.z - p.pos.z;
      const dist = Math.hypot(dx, dz) || 0.01;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * dir.x + dz * dir.z) / dist)));
      // anything right beside you counts, wherever you're facing
      if (ang > cone && dist > 1.6) return Infinity;
      return ang * 3 + dist * 0.35;
    };
    // hold on to the current target while it's still fair game
    let t = this.target;
    if (t && (!this.valid(t, p, range * 1.2) || (this.aim && score(t) === Infinity))) t = null;
    let best = null, bs = Infinity;
    const pool = w.hostilesOf(p);
    if (laser) for (const d of w.devices) if (d.kind === 'target' && !d.on) pool.push(d);
    for (const o of pool) {
      if (!this.valid(o, p, range)) continue;
      const s = score(o) + (o.kind === 'target' ? 1.5 : 0);
      if (s < bs) { bs = s; best = o; }
    }
    // switch only for something clearly better
    if (!t || (best && best !== t && bs < score(t) - 1.2)) t = best;
    this.target = t;

    // the bracket
    if (t) {
      const r = t.kind === 'droid' ? t.radius : 0.42;
      const y = t.kind === 'droid' ? (t.groundY ?? t.pos.y) : t.y;
      this.marker.visible = true;
      this.marker.position.set(t.pos.x, y + 0.05, t.pos.z);
      const pulse = w.game.reducedMotion ? 1 : 1 + Math.sin(this.t * 6) * 0.05;
      this.marker.scale.setScalar(r * 3.4 * pulse);
      this.marker.rotation.y = w.game.reducedMotion ? Math.PI / 4 : this.t * 0.8;
      this.markerMat.opacity = 0.85;
    } else this.marker.visible = false;

    // the shove arrow
    const st = p.mod.arm;
    if (st && st.charging) {
      const s = p.stats.arm;
      const c = st.charge || 0;
      const d = this.shoveDir(p);
      const reach = (s.lungeSpeed + (s.fullSpeed - s.lungeSpeed) * c) * (s.lungeTime + (s.fullTime - s.lungeTime) * c) + 0.6;
      this.arrow.visible = true;
      this.arrow.position.set(p.pos.x + d.x * 0.3, (p.groundY ?? p.pos.y) + 0.04, p.pos.z + d.z * 0.3);
      this.arrow.rotation.y = Math.atan2(d.x, d.z) + Math.PI;
      this.arrow.scale.set(0.34 + 0.2 * c, 1, reach);
      const full = c >= 1;
      this.arrowMat.color.set(full ? 0xd8fbff : PLAYER_COLOUR).multiplyScalar(full ? 1.15 : 0.9 + c * 0.5);
      this.arrowMat.opacity = 0.35 + 0.65 * c;
    } else this.arrow.visible = false;
  }

  hide() { this.marker.visible = false; this.arrow.visible = false; }

  // Which way a shove would go: at the target if there is one in reach.
  shoveDir(p) {
    const t = this.target;
    if (t && Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z) < 3.6) {
      const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z, m = Math.hypot(dx, dz) || 1;
      return { x: dx / m, z: dz / m };
    }
    return p.moveDir();
  }

  // Direction to the target, for anything that fires.
  dirTo(p) {
    const t = this.target;
    if (!t) return null;
    const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z, m = Math.hypot(dx, dz);
    return m > 0.01 ? { x: dx / m, z: dz / m } : null;
  }

  dispose() {
    this.world.root.remove(this.marker, this.arrow);
    this.marker.geometry.dispose(); this.markerMat.map.dispose(); this.markerMat.dispose();
    this.arrow.geometry.dispose(); this.arrowMat.map.dispose(); this.arrowMat.dispose();
  }
}
