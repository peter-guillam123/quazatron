// Warnings painted on the floor before a droid attacks: a line where a
// laser will go, a lane for a dash or a charge, a ring that fills before a
// stamp or a discharge. They lock in place a moment before the attack, so
// that's the moment to move.
import * as THREE from 'three';

let chevrons = null;
function chevronTexture() {
  if (chevrons) return chevrons;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#fff';
  g.lineWidth = 9;
  g.lineJoin = 'miter';
  g.beginPath(); g.moveTo(8, 50); g.lineTo(32, 20); g.lineTo(56, 50); g.stroke();
  chevrons = new THREE.CanvasTexture(c);
  chevrons.wrapS = chevrons.wrapT = THREE.RepeatWrapping;
  chevrons.colorSpace = THREE.SRGBColorSpace;
  return chevrons;
}

const laneGeo = new THREE.PlaneGeometry(1, 1);
laneGeo.rotateX(-Math.PI / 2);
laneGeo.translate(0, 0, -0.5);
const discGeo = new THREE.CircleGeometry(1, 40);
discGeo.rotateX(-Math.PI / 2);
const rimGeo = new THREE.RingGeometry(0.93, 1, 48);
rimGeo.rotateX(-Math.PI / 2);

export class Telegraphs {
  constructor(root) {
    this.root = root;
    this.list = [];
    this.reduced = false;
  }

  // kind: 'lane' (along an angle) or 'disc' (around the droid)
  add(owner, attack, kind, colour) {
    const col = new THREE.Color(colour);
    const t = { owner, attack, kind, t: 0, group: new THREE.Group() };
    if (kind === 'lane') {
      const map = chevronTexture().clone();
      map.needsUpdate = true;
      t.mat = new THREE.MeshBasicMaterial({ map, color: col.clone().multiplyScalar(2.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      t.mesh = new THREE.Mesh(laneGeo, t.mat);
      t.group.add(t.mesh);
    } else {
      t.mat = new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      t.rimMat = new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      t.mesh = new THREE.Mesh(discGeo, t.mat);
      t.rim = new THREE.Mesh(rimGeo, t.rimMat);
      t.group.add(t.mesh, t.rim);
    }
    t.group.renderOrder = 3;
    t.mesh.renderOrder = 3;
    this.root.add(t.group);
    this.list.push(t);
    return t;
  }

  // Place a lane: from (x, y, z) along angle `ang`, `len` long, `wide` across.
  // `k` is how far through the wind-up we are, `locked` once it can't turn.
  lane(t, x, y, z, ang, len, wide, k, locked) {
    t.group.position.set(x, y + 0.035, z);
    t.group.rotation.y = ang + Math.PI;
    t.mesh.scale.set(wide * (locked ? 1.25 : 1), 1, len);
    const map = t.mat.map;
    map.repeat.set(1, Math.max(1, len / Math.max(0.3, wide * 1.4)));
    if (!this.reduced) map.offset.y = -t.t * 2.2;
    t.mat.opacity = locked ? 0.95 : 0.25 + 0.5 * k;
  }

  // Place a disc of radius r that fills as the wind-up runs.
  disc(t, x, y, z, r, k, locked) {
    t.group.position.set(x, y + 0.035, z);
    t.rim.scale.setScalar(r);
    t.mesh.scale.setScalar(Math.max(0.01, r * k));
    t.mat.opacity = locked ? 0.45 : 0.22;
    t.rimMat.opacity = locked ? 1 : 0.6;
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const t = this.list[i];
      t.t += dt;
      const o = t.owner;
      // gone when the attack is over, or the droid is
      if (!o.alive || o.state !== 'active' || !o.brain || o.brain.attack !== t.attack) this.remove(t, i);
    }
  }

  remove(t, i = this.list.indexOf(t)) {
    if (i < 0) return;
    this.root.remove(t.group);
    if (t.mat.map) t.mat.map.dispose();
    t.mat.dispose();
    if (t.rimMat) t.rimMat.dispose();
    this.list.splice(i, 1);
  }

  dispose() {
    for (let i = this.list.length - 1; i >= 0; i--) this.remove(this.list[i], i);
  }
}
