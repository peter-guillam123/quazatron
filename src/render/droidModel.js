// Droids are assembled from the same parts they carry. What you see on a
// droid (treads, a laser barrel, a tesla coil) is what you can steal from it.
import * as THREE from 'three';
import { makeNumberTexture } from './textures.js';

const geo = {};
function G(key, make) { return geo[key] || (geo[key] = make()); }

const TAU = Math.PI * 2;

// Body proportions per silhouette.
const SHAPES = {
  squat: { r: 0.3, h: 0.26, dome: 1.0 },
  tall: { r: 0.27, h: 0.46, dome: 0.85 },
  wide: { r: 0.37, h: 0.28, dome: 0.55 },
  orb: { r: 0.33, h: 0.0, dome: 1.0 },
  player: { r: 0.29, h: 0.24, dome: 0.95 },
};

export class DroidModel {
  // spec: { shape, scale, shell, accent, label, drive, arm, core, player, command }
  constructor(spec) {
    this.spec = spec;
    this.group = new THREE.Group();
    this.body = new THREE.Group();     // everything above the drive
    this.group.add(this.body);
    this.t = Math.random() * 10;
    this.flash = 0;
    this.charge = 0;
    this.spin = 0;
    this.build();
  }

  build() {
    const s = this.spec;
    const shape = SHAPES[s.shape] || SHAPES.squat;
    const accent = new THREE.Color(s.accent);
    this.mats = {
      shell: new THREE.MeshPhysicalMaterial({
        color: s.shell, roughness: 0.3, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.22,
        emissive: 0xffffff, emissiveIntensity: 0,
      }),
      dark: new THREE.MeshStandardMaterial({ color: 0x15171d, roughness: 0.55, metalness: 0.6 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x9aa1ad, roughness: 0.3, metalness: 0.9 }),
      accent: new THREE.MeshStandardMaterial({ color: 0x050505, emissive: accent, emissiveIntensity: 2.4, roughness: 0.4 }),
      glow: new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(2.2), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    };
    const m = this.mats;
    const add = (parent, g, mat, pos, rot, scale) => {
      const mesh = new THREE.Mesh(g, mat);
      if (pos) mesh.position.set(pos[0], pos[1], pos[2]);
      if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
      if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // ---- drive
    const drive = s.drive || 'wheels';
    this.wheels = [];
    let lift = 0.04;
    if (drive === 'hover') {
      lift = 0.2;
      const ring = add(this.group, G('hoverRing', () => new THREE.TorusGeometry(0.27, 0.035, 10, 40)), m.accent, [0, 0.16, 0], [Math.PI / 2, 0, 0]);
      ring.castShadow = false;
      this.hoverGlow = add(this.group, G('disc', () => new THREE.CircleGeometry(0.3, 32)), new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(0.9), transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }), [0, 0.03, 0], [-Math.PI / 2, 0, 0]);
      this.hoverGlow.castShadow = false;
      add(this.body, G('hoverCone', () => new THREE.CylinderGeometry(0.22, 0.12, 0.12, 24)), m.dark, [0, 0.14, 0]);
    } else if (drive === 'treads') {
      for (const side of [-1, 1]) {
        add(this.group, G('tread', () => new THREE.BoxGeometry(0.15, 0.17, 0.66)), m.dark, [side * 0.33, 0.09, 0]);
        for (let i = 0; i < 4; i++) {
          const w = add(this.group, G('roller', () => new THREE.CylinderGeometry(0.055, 0.055, 0.16, 12)), m.metal, [side * 0.33, 0.07, -0.24 + i * 0.16], [0, 0, Math.PI / 2]);
          this.wheels.push(w);
        }
        add(this.group, G('treadGlow', () => new THREE.BoxGeometry(0.02, 0.03, 0.5)), m.accent, [side * 0.415, 0.12, 0]);
      }
      add(this.body, G('skirt', () => new THREE.CylinderGeometry(0.28, 0.34, 0.12, 28)), m.dark, [0, 0.12, 0]);
      lift = 0.06;
    } else {
      add(this.body, G('skirt', () => new THREE.CylinderGeometry(0.28, 0.34, 0.12, 28)), m.dark, [0, 0.1, 0]);
      for (const [x, z] of [[-0.27, 0.17], [0.27, 0.17], [-0.27, -0.17], [0.27, -0.17]]) {
        const w = add(this.group, G('wheel', () => new THREE.CylinderGeometry(0.075, 0.075, 0.07, 14)), m.metal, [x, 0.075, z], [0, 0, Math.PI / 2]);
        this.wheels.push(w);
      }
      if (drive === 'thrusters') {
        this.jets = [];
        for (const x of [-0.14, 0.14]) {
          add(this.body, G('nozzle', () => new THREE.CylinderGeometry(0.06, 0.085, 0.2, 14)), m.metal, [x, 0.3, -0.31], [-Math.PI / 2 + 0.25, 0, 0]);
          const j = add(this.body, G('jet', () => new THREE.ConeGeometry(0.07, 0.5, 12, 1, true)), m.glow, [x, 0.28, -0.52], [-Math.PI / 2 + 0.25, 0, 0]);
          j.castShadow = false;
          j.scale.set(1, 0.2, 1);
          this.jets.push(j);
        }
      }
    }
    this.lift = lift;

    // ---- body and dome
    const b = this.body;
    let top;
    if (s.shape === 'orb') {
      add(b, G('orb', () => new THREE.SphereGeometry(shape.r, 32, 20)), m.shell, [0, 0.16 + shape.r, 0]);
      add(b, G('orbBand', () => new THREE.TorusGeometry(shape.r + 0.005, 0.022, 8, 48)), m.accent, [0, 0.16 + shape.r, 0], [Math.PI / 2, 0, 0]);
      top = 0.16 + shape.r * 1.7;
      this.visorY = 0.16 + shape.r * 1.25;
      this.visorR = shape.r * 0.72;
      this.frontZ = shape.r * 0.94;
      this.bodyMidY = 0.16 + shape.r * 0.75;
    } else {
      const y0 = 0.16;
      add(b, G(`body${shape.r}${shape.h}`, () => new THREE.CylinderGeometry(shape.r, shape.r + 0.012, shape.h, 36)), m.shell, [0, y0 + shape.h / 2, 0]);
      add(b, G(`band${shape.r}`, () => new THREE.CylinderGeometry(shape.r + 0.008, shape.r + 0.008, 0.035, 36, 1, true)), m.accent, [0, y0 + 0.05, 0]);
      add(b, G(`rim${shape.r}`, () => new THREE.TorusGeometry(shape.r, 0.018, 8, 40)), m.metal, [0, y0 + shape.h, 0], [Math.PI / 2, 0, 0]);
      const dome = add(b, G(`dome${shape.r}`, () => new THREE.SphereGeometry(shape.r * 0.94, 36, 14, 0, TAU, 0, Math.PI / 2)), m.shell, [0, y0 + shape.h, 0]);
      dome.scale.y = shape.dome;
      top = y0 + shape.h + shape.r * 0.94 * shape.dome;
      this.visorY = y0 + shape.h + shape.r * 0.32 * shape.dome;
      this.visorR = shape.r * 0.94 * Math.cos(Math.asin(0.34)) + 0.004;
      this.frontZ = shape.r + 0.004;
      this.bodyMidY = y0 + shape.h * 0.5;
    }
    this.top = top;

    // visor: a lit band across the front of the dome
    this.visor = add(b, G(`visor${this.visorR.toFixed(3)}`, () => new THREE.CylinderGeometry(this.visorR, this.visorR, 0.055, 32, 1, true, -0.75, 1.5)), m.accent, [0, this.visorY, 0]);
    this.visor.castShadow = false;

    // class number display
    if (s.label) {
      const tex = makeNumberTexture(s.label, '#ffffff');
      this.displayMat = new THREE.MeshBasicMaterial({ map: tex, color: accent.clone().multiplyScalar(1.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const d = add(b, G('display', () => new THREE.PlaneGeometry(0.24, 0.12)), this.displayMat, [0, this.bodyMidY + (s.shape === 'orb' ? 0 : 0.02), this.frontZ + 0.002]);
      d.castShadow = false;
      this.display = d;
    }

    // ---- arm
    const arm = s.arm;
    if (arm === 'laser') {
      const g2 = new THREE.Group();
      g2.position.set(this.frontZ * 0.95, this.bodyMidY + 0.04, 0.05);
      b.add(g2);
      add(g2, G('mount', () => new THREE.BoxGeometry(0.08, 0.1, 0.14)), m.dark, [0, 0, 0]);
      add(g2, G('barrel', () => new THREE.CylinderGeometry(0.035, 0.045, 0.34, 12)), m.metal, [0.02, 0, 0.18], [Math.PI / 2, 0, 0]);
      this.muzzle = add(g2, G('muzzle', () => new THREE.TorusGeometry(0.04, 0.012, 8, 16)), m.accent, [0.02, 0, 0.35]);
      this.muzzleWorld = g2;
    } else if (arm === 'arc') {
      const g2 = new THREE.Group();
      g2.position.set(0, top - 0.02, 0);
      b.add(g2);
      add(g2, G('rod', () => new THREE.CylinderGeometry(0.018, 0.025, 0.26, 8)), m.metal, [0, 0.13, 0]);
      add(g2, G('coil1', () => new THREE.TorusGeometry(0.085, 0.016, 8, 24)), m.metal, [0, 0.1, 0], [Math.PI / 2, 0, 0]);
      add(g2, G('coil2', () => new THREE.TorusGeometry(0.06, 0.014, 8, 24)), m.metal, [0, 0.17, 0], [Math.PI / 2, 0, 0]);
      this.coilBall = add(g2, G('ball', () => new THREE.SphereGeometry(0.05, 16, 10)), m.accent, [0, 0.28, 0]);
      top += 0.3;
    } else if (arm === 'tractor') {
      const g2 = new THREE.Group();
      g2.position.set(0, this.bodyMidY + 0.02, this.frontZ + 0.03);
      b.add(g2);
      add(g2, G('dish', () => new THREE.CylinderGeometry(0.15, 0.06, 0.08, 24, 1, true)), m.metal, [0, 0, 0.03], [Math.PI / 2, 0, 0]);
      this.tractorCore = add(g2, G('tcore', () => new THREE.SphereGeometry(0.05, 16, 10)), m.accent, [0, 0, 0.04]);
      add(g2, G('tring', () => new THREE.TorusGeometry(0.15, 0.015, 8, 28)), m.accent, [0, 0, 0.07]);
      if (this.display) this.display.position.y -= 0.0;
    } else if (s.player) {
      // KLP-2's grapple: two prongs and a coil, its one trick
      const g2 = new THREE.Group();
      g2.position.set(0, 0.2, this.frontZ - 0.02);
      b.add(g2);
      add(g2, G('gbase', () => new THREE.CylinderGeometry(0.06, 0.07, 0.08, 14)), m.dark, [0, 0, 0.03], [Math.PI / 2, 0, 0]);
      for (const x of [-0.05, 0.05]) {
        add(g2, G('prong', () => new THREE.BoxGeometry(0.025, 0.03, 0.12)), m.metal, [x, 0, 0.11], [0, x > 0 ? -0.35 : 0.35, 0]);
      }
      this.claw = g2;
    } else {
      // a plain ram bumper
      add(b, G('bumper', () => new THREE.CylinderGeometry(0.36, 0.36, 0.06, 24, 1, true, -0.7, 1.4)), m.metal, [0, 0.2, 0]);
    }

    // ---- core
    const core = s.core;
    if (core === 'shield') {
      for (const x of [-1, 1]) {
        add(b, G('fin', () => new THREE.BoxGeometry(0.03, 0.22, 0.16)), m.dark, [x * (this.frontZ + 0.02), this.bodyMidY + 0.08, 0]);
        add(b, G('finGlow', () => new THREE.BoxGeometry(0.035, 0.18, 0.02)), m.accent, [x * (this.frontZ + 0.03), this.bodyMidY + 0.08, 0.07]);
      }
      const bub = new THREE.Mesh(
        G('bubble', () => new THREE.SphereGeometry(0.62, 32, 16, -1.2, 2.4, 0.35, 1.9)),
        new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(1.4), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      bub.position.y = this.bodyMidY + 0.08;
      bub.visible = false;
      this.group.add(bub);
      this.bubble = bub;
    } else if (core === 'cloak') {
      for (let i = 0; i < 3; i++) {
        const a = -0.5 + i * 0.5;
        add(b, G('crod', () => new THREE.CylinderGeometry(0.01, 0.014, 0.3, 6)), m.metal, [Math.sin(a) * 0.18, top - 0.02, -0.18 - Math.cos(a) * 0.02], [-0.35, 0, a * 0.6]);
        add(b, G('ctip', () => new THREE.SphereGeometry(0.022, 8, 6)), m.accent, [Math.sin(a) * 0.23, top + 0.12, -0.27]);
      }
    } else if (core === 'phase') {
      this.shards = [];
      for (let i = 0; i < 2; i++) {
        const sh = add(this.group, G('shard', () => new THREE.OctahedronGeometry(0.06)), m.accent, [0, this.bodyMidY + 0.2, 0]);
        sh.scale.y = 1.8;
        this.shards.push(sh);
      }
    }

    // KLP-2 as far as Nan has mended it
    if (s.player && s.wear) this.buildWear(s.wear);
    // a boss wearing a piece of the old KLP-2: a cyan core on its back
    if (s.relic) {
      const cyan = new THREE.Color(0x2ef2ff);
      this.mats.relic = new THREE.MeshStandardMaterial({ color: 0x050505, emissive: cyan, emissiveIntensity: 3 });
      const g2 = new THREE.Group();
      g2.position.set(0, this.bodyMidY + 0.12, -this.frontZ - 0.06);
      add(g2, G('relicCore', () => new THREE.OctahedronGeometry(0.075)), this.mats.relic);
      this.relicRing = add(g2, G('relicRing', () => new THREE.TorusGeometry(0.13, 0.012, 8, 32)), this.mats.relic);
      b.add(g2);
      this.relicCore = g2;
    }

    if (s.command) {
      // command droids wear a crown of three lit spikes
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU;
        add(b, G('spike', () => new THREE.ConeGeometry(0.03, 0.16, 8)), m.accent, [Math.cos(a) * 0.12, top + 0.06, Math.sin(a) * 0.12]);
      }
      top += 0.14;
    }
    this.height = top;

    // stars that circle a stunned droid's head
    if (!s.player) {
      this.stars = new THREE.Group();
      this.stars.position.y = top + 0.12;
      const starMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe27a).multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      this.mats.star = starMat;
      for (let i = 0; i < 3; i++) {
        const st = new THREE.Mesh(G('star', () => new THREE.OctahedronGeometry(0.045)), starMat);
        const a = (i / 3) * TAU;
        st.position.set(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2);
        st.castShadow = false;
        this.stars.add(st);
      }
      this.stars.visible = false;
      b.add(this.stars);
    }

    this.body.position.y = lift;
    const sc = s.scale || 1;
    this.group.scale.setScalar(sc);
    this.height *= sc;
  }

  // KLP-2 starts out of the rubbish in a bad way: holes in a dull shell, a
  // panel flapping at the back, a visor that sputters, a wheel that
  // wobbles, no aerial. Each of Nan's repairs mends a piece of it.
  buildWear(w) {
    const m = this.mats, b = this.body, add = (parent, g, mat, pos, rot) => {
      const mesh = new THREE.Mesh(g, mat);
      if (pos) mesh.position.set(pos[0], pos[1], pos[2]);
      if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
      parent.add(mesh);
      return mesh;
    };
    const shape = SHAPES.player, y0 = 0.16;
    const t = Math.min(1, w.plating / 8);
    // the shell: dull and scuffed, polished as it's plated
    m.shell.color.copy(new THREE.Color(0x60656f).lerp(new THREE.Color(0xe9eef5), t));
    m.shell.clearcoat = 0.1 + 0.9 * t;
    m.shell.roughness = 0.7 - 0.4 * t;
    // holes in the shell, with a glow of loose wiring inside: one fewer for
    // every two notches of plating
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x050608, polygonOffset: true, polygonOffsetFactor: -2 });
    const emberMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff7a2a).multiplyScalar(1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    this.mats.hole = holeMat; this.mats.ember = emberMat;
    const spots = [[0.9, 0.35], [2.4, 0.6], [3.7, 0.3], [5.1, 0.55]];
    const holes = Math.max(0, 4 - Math.floor(w.plating / 2));
    for (let i = 0; i < holes; i++) {
      const [a, hf] = spots[i], r = shape.r + 0.006;
      const g = new THREE.Group();
      g.position.set(Math.sin(a) * r, y0 + shape.h * hf, Math.cos(a) * r);
      g.rotation.y = a;
      add(g, G('hole', () => new THREE.PlaneGeometry(0.135, 0.1)), holeMat);
      add(g, G('ember', () => new THREE.PlaneGeometry(0.05, 0.025)), emberMat, [0.015, -0.015, 0.001]);
      b.add(g);
    }
    // a loose panel at the back, until the plating's begun
    if (w.plating < 2) {
      const hinge = new THREE.Group();
      hinge.position.set(0, y0 + shape.h, -shape.r - 0.005);
      add(hinge, G('flap', () => new THREE.BoxGeometry(0.16, 0.12, 0.012)), m.shell, [0, -0.06, -0.006]);
      b.add(hinge);
      this.flap = hinge;
    }
    // fully plated: a lit trim round the shell
    if (w.plating >= 8) add(b, G('trim', () => new THREE.TorusGeometry(shape.r + 0.012, 0.01, 8, 48)), m.accent, [0, y0 + shape.h * 0.62, 0], [Math.PI / 2, 0, 0]);
    // the aerial: a bent stub, then straight, then with a light on top
    if (w.patience >= 1) {
      const ag = new THREE.Group();
      ag.position.set(-0.12, this.top - 0.04, -0.08);
      ag.rotation.z = w.patience === 1 ? 0.7 : 0.15;
      const len = 0.1 + 0.07 * w.patience;
      add(ag, G(`aer${w.patience}`, () => new THREE.CylinderGeometry(0.008, 0.011, len, 6)), m.metal, [0, len / 2, 0]);
      if (w.patience >= 3) this.aerialTip = add(ag, G('aerTip', () => new THREE.SphereGeometry(0.022, 10, 8)), m.accent, [0, len + 0.01, 0]);
      b.add(ag);
    }
    // a pocket on its back
    if (w.pockets >= 1) {
      const k = 0.7 + w.pockets * 0.1;
      const box = add(b, G('pocket', () => new THREE.BoxGeometry(0.16, 0.1, 0.07)), m.dark, [0, y0 + 0.08, -shape.r - 0.03]);
      box.scale.set(k, k, 1);
    }
    // a second visor line once the cells are full
    if (w.cells >= 8) {
      const v2 = add(b, G(`visor2${this.visorR.toFixed(3)}`, () => new THREE.CylinderGeometry(this.visorR - 0.01, this.visorR - 0.01, 0.02, 32, 1, true, -0.6, 1.2)), m.accent, [0, this.visorY - 0.06, 0]);
      v2.castShadow = false;
    }
    // chrome hubs once the bearings are done
    if (w.servos >= 5) m.metal.color.set(0xdfe6f0);
    // pieces of the old KLP-2, taken back from the bosses
    const rel = new Set(w.relics || []);
    if (rel.has('claw') && this.claw) {
      this.claw.scale.setScalar(1.6);
      add(this.claw, G('clawRing', () => new THREE.TorusGeometry(0.075, 0.012, 8, 24)), m.accent, [0, 0, 0.09]);
    }
    if (rel.has('plate')) add(b, G('ramPlate', () => new THREE.BoxGeometry(0.28, 0.07, 0.03)), m.metal, [0, y0 + 0.02, shape.r + 0.03]);
    if (rel.has('plate')) add(b, G('ramPlateEdge', () => new THREE.BoxGeometry(0.28, 0.012, 0.032)), m.accent, [0, y0 + 0.06, shape.r + 0.03]);
    if (rel.has('gyro')) this.gyro = add(this.group, G('gyro', () => new THREE.TorusGeometry(0.33, 0.014, 8, 48)), m.accent, [0, 0.14, 0], [Math.PI / 2, 0, 0]);
    if (rel.has('magnet')) add(b, G('magnet', () => new THREE.TorusGeometry(0.05, 0.016, 8, 16, Math.PI)), new THREE.MeshStandardMaterial({ color: 0xc23a3a, roughness: 0.4 }), [0.1, y0 + shape.h + 0.02, -shape.r - 0.02], [0, 0, Math.PI]);
    if (rel.has('capacitor')) {
      for (const x of [-0.07, 0.07]) add(b, G('cap', () => new THREE.CylinderGeometry(0.028, 0.028, 0.12, 12)), m.accent, [x, y0 + shape.h * 0.6, -shape.r - 0.025]);
    }
    if (rel.has('insulation')) add(b, G('skirt2', () => new THREE.CylinderGeometry(0.33, 0.37, 0.05, 28, 1, true)), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95, side: THREE.DoubleSide }), [0, 0.07, 0]);
    if (rel.has('firewall')) add(b, G('shade', () => new THREE.CylinderGeometry(this.visorR + 0.02, this.visorR + 0.02, 0.025, 32, 1, true, -0.8, 1.6)), m.dark, [0, this.visorY + 0.05, 0]);
    if (rel.has('optic')) {
      const eye = add(b, G('optic', () => new THREE.SphereGeometry(0.035, 12, 10)), m.accent, [0.14, this.visorY + 0.06, shape.r * 0.62]);
      eye.castShadow = false;
    }
    if (rel.has('corekey')) add(b, G('chestCore', () => new THREE.SphereGeometry(0.04, 14, 10)), m.accent, [0, y0 + shape.h * 0.35, shape.r + 0.012]);
    if (rel.has('override')) this.halo = add(b, G('halo', () => new THREE.TorusGeometry(0.16, 0.012, 8, 40)), m.accent, [0, this.top + 0.08, 0], [Math.PI / 2, 0, 0]);
    this.flicker = Math.max(0, 1 - w.cells / 8);
    this.wobble = Math.max(0, 1 - w.servos / 5);
    this.flickT = 0;
  }

  setAccent(hex, intensity = 2.4) {
    const c = new THREE.Color(hex);
    this.mats.accent.emissive.copy(c);
    this.mats.accent.emissiveIntensity = intensity;
    this.mats.glow.color.copy(c).multiplyScalar(2.2);
    if (this.displayMat) this.displayMat.color.copy(c).multiplyScalar(1.8);
    if (this.bubble) this.bubble.material.color.copy(c).multiplyScalar(1.4);
  }

  // info: { speed, facing, charge (0..1 telegraph), stunned, shielding, cloak (0..1 visibility),
  //         phasing, dashing, hovering, dead }
  update(dt, info) {
    this.t += dt;
    const sc = this.spec.scale || 1;
    this.spin += (info.speed || 0) * dt / (0.075 * sc);
    for (const w of this.wheels) w.rotation.x = this.spin;
    const hoverBob = this.spec.drive === 'hover' ? Math.sin(this.t * 3) * 0.03 : 0;
    this.body.position.y = this.lift + hoverBob + (info.bob || 0) - (info.windup || 0) * 0.035;
    // recoil after a shot, and a crouch while winding up a shove
    this.kickT = Math.max(0, (this.kickT || 0) - dt);
    this.body.position.z = -0.06 * (this.kickK || 0) * (this.kickT / 0.09);
    const wu = info.windup || 0;
    this.body.scale.set(1 + wu * 0.05, 1 - wu * 0.1, 1 + wu * 0.05);
    if (this.hoverGlow) {
      this.hoverGlow.material.opacity = 0.22 + Math.sin(this.t * 8) * 0.06;
    }
    if (this.jets) {
      const k = info.dashing ? 1 : (info.speed || 0) > 0.5 ? 0.35 : 0.15;
      for (const j of this.jets) j.scale.y += (k + Math.random() * 0.1 - j.scale.y) * Math.min(1, dt * 14);
    }
    if (this.shards) {
      this.shards.forEach((sh, i) => {
        const a = this.t * 2.2 + i * Math.PI;
        sh.position.set(Math.cos(a) * 0.42, this.bodyMidY + 0.18 + Math.sin(this.t * 3 + i) * 0.05, Math.sin(a) * 0.42);
        sh.rotation.y = a * 2;
      });
    }
    if (this.coilBall) this.coilBall.scale.setScalar(1 + (info.charge || 0) * 1.2 + Math.sin(this.t * 20) * 0.05 * (info.charge || 0));
    if (this.tractorCore) this.tractorCore.scale.setScalar(1 + (info.charge || 0) * 1.5);
    if (this.bubble) this.bubble.visible = !!info.shielding;
    if (!info.dead && !this.spec.player) this.manner(dt, info);
    else if (this.stars) this.stars.visible = false;
    // the visor turns to watch what the droid is watching, or looks round
    if (this.visor) {
      const look = Math.max(-0.9, Math.min(0.9, this.scan ?? info.look ?? 0));
      this.visor.rotation.y += (look - this.visor.rotation.y) * Math.min(1, dt * 6);
    }

    // telegraph: the visor and accents brighten before an attack
    const base = info.dead ? 0.15 : 2.4;
    const stunFlicker = info.stunned ? (Math.sin(this.t * 40) > 0 ? 0.4 : 1.4) : 1;
    this.mats.accent.emissiveIntensity = (base + (info.charge || 0) * 4) * stunFlicker;

    // a sputtering visor and a wobbly wheel, until Nan mends them
    if (this.flicker) {
      this.flickT = Math.max(0, this.flickT - dt);
      if (!this.flickT && Math.random() < dt * this.flicker * 2.5) this.flickT = 0.05 + Math.random() * 0.14;
      if (this.flickT) this.mats.accent.emissiveIntensity *= 0.12;
    }
    if (this.wobble) {
      const moving = (info.speed || 0) > 0.4;
      if (this.wheels[0]) this.wheels[0].rotation.z = Math.PI / 2 + Math.sin(this.t * 14) * 0.35 * this.wobble;
      this.body.rotation.z = Math.sin(this.t * (moving ? 11 : 3)) * (moving ? 0.035 : 0.012) * this.wobble;
    }
    if (this.flap) this.flap.rotation.x = 0.35 + Math.sin(this.t * 6) * 0.25 + (info.speed || 0) * 0.06;
    if (this.gyro) this.gyro.rotation.z += dt * 3;
    if (this.halo) { this.halo.rotation.z += dt * 1.2; this.halo.position.y = this.top + 0.08 + Math.sin(this.t * 2) * 0.01; }
    if (this.relicCore) { this.relicCore.rotation.y += dt * 1.6; this.relicRing.rotation.x += dt * 2.4; }
    if (this.aerialTip) this.aerialTip.visible = Math.sin(this.t * 4) > -0.2;

    this.flash = Math.max(0, this.flash - dt * 5);
    this.mats.shell.emissiveIntensity = this.flash * 0.9;

    // cloak and phase both fade the droid out
    const vis = info.visibility ?? 1;
    const fading = vis < 0.999;
    if (fading !== this._fading) {
      this._fading = fading;
      this.group.traverse((o) => {
        if (o.isMesh && o.material !== this.mats.glow && o.material.blending !== THREE.AdditiveBlending) {
          o.material.transparent = fading;
          o.material.depthWrite = !fading;
          o.material.needsUpdate = true;
          o.castShadow = !fading;
        }
      });
    }
    if (fading) {
      for (const k of ['shell', 'dark', 'metal', 'accent']) this.mats[k].opacity = vis;
    }

    this.group.rotation.y = (info.facing ?? this.group.rotation.y) + (this.cheerSpin || 0);
  }

  // Body language, by family: how it moves when nothing much is happening,
  // and how it reacts when something is.
  manner(dt, info) {
    const t = this.t, b = this.body;
    const moving = (info.speed || 0) > 0.4;
    const k = info.still ? 0.35 : 1;
    let rx = 0, rz = 0, dx = 0, dy = 0;
    this.scan = null;
    switch (this.spec.family) {
      case 'mite':
        // sweeps as it goes; shakes when it runs
        if (moving && info.mood !== 'chase') rz = Math.sin(t * 9) * 0.07;
        if (info.fleeing && !info.still) { dx = (Math.random() - 0.5) * 0.025; rz = Math.sin(t * 31) * 0.05; }
        break;
      case 'courier':
        // can't keep still: revving on the spot
        dy = Math.abs(Math.sin(t * 15)) * 0.012;
        break;
      case 'hauler': case 'sentinel':
        rz = Math.sin(t * 1.3) * 0.03;
        break;
      case 'spark': case 'skimmer': case 'archon':
        // sentries look round while they wait
        if (info.mood === 'patrol') this.scan = Math.sin(t * 0.9) * 0.8;
        break;
      case 'phantom': case 'reaper':
        rx = Math.sin(t * 0.7) * 0.05; rz = Math.cos(t * 0.6) * 0.04;
        break;
      case 'lancer':
        rx = -0.05;   // chest out
        break;
      case 'wraith':
        // twitchy: a quick glance every so often
        if (info.mood === 'patrol') this.scan = Math.sin(t * 0.5) > 0.6 ? 0.8 : Math.sin(t * 0.5) < -0.6 ? -0.8 : 0;
        break;
      default: break;
    }
    // leans in when it's coming for you
    if (info.mood === 'chase' && moving && !info.fleeing) rx += Math.min(0.09, info.speed * 0.02);
    // knocked back a little by a hit
    this.hitTilt = Math.max(0, (this.hitTilt || 0) - dt * 4);
    rx -= this.hitTilt * 0.22;
    // dizzy while stunned
    if (this.stars) this.stars.visible = !!info.stunned;
    if (info.stunned) {
      rx += Math.sin(t * 7) * 0.1 * k; rz += Math.cos(t * 7) * 0.1 * k;
      this.stars.rotation.y = info.still ? 0 : t * 5;
    }
    // a quick spin to celebrate
    if (this.cheerT > 0) {
      this.cheerT = Math.max(0, this.cheerT - dt);
      this.cheerSpin = (1 - this.cheerT / 0.7) * Math.PI * 2;
    } else this.cheerSpin = 0;
    b.rotation.x = rx * k; b.rotation.z = rz * k;
    b.position.x = dx;
    b.position.y += dy * k;
  }

  hit() { this.flash = 1; this.hitTilt = 1; }
  cheer() { this.cheerT = 0.7; }
  kick(k = 1) { this.kickT = 0.09; this.kickK = k; }

  dispose() {
    for (const k in this.mats) this.mats[k].dispose();
    if (this.displayMat) { this.displayMat.map.dispose(); this.displayMat.dispose(); }
    if (this.bubble) this.bubble.material.dispose();
  }
}
