// Plays one of KLP-2's memories (story/memories.js): builds its little
// scene out of the game's own pieces, hides the deck, draws it the way a ZX
// Spectrum would have (the 1986 mode) with a slow camera, and types its
// lines over it like the caption on old footage. Space moves the lines on;
// Escape skips. Reduced motion holds the camera still and shows the lines
// whole.
import * as THREE from 'three';
import { Grid, T } from './world/grid.js';
import { buildLevelMesh } from './render/levelMesh.js';
import { DroidModel } from './render/droidModel.js';
import { makeRng } from './rng.js';
import { FAMILIES } from './world/roster.js';
import { DECKS, PLAYER_COLOUR, LEVEL_H } from './config.js';
import { MEMORIES, MEMORY_COUNT } from './story/memories.js';

// KLP-2 as it was before the wipe: whole, and wearing its old parts
const OLD_KLP2 = { plating: 8, cells: 8, servos: 5, patience: 3, pockets: 0, condition: 1, relics: ['claw', 'optic', 'corekey'] };

const $ = (s) => document.querySelector(s);

export class MemoryPlayer {
  constructor(game) {
    this.game = game;
    this.m = null;
  }

  get playing() { return !!this.m; }

  play(n, done) {
    const mem = MEMORIES[n];
    if (!mem) { done(); return; }
    const i = Object.keys(MEMORIES).indexOf(String(n)) + 1;
    this.stage(mem, `Memory recovered · ${i} of ${MEMORY_COUNT} · ${mem.title}`, done, n);
  }

  // Any scene: a memory, or the ending.
  stage(mem, head, done, n = 0) {
    const g = this.game, r = g.renderer;
    const deck = mem.deckSpec || DECKS[mem.deck - 1];
    // the floor
    const rows = mem.map, D = rows.length, W = rows[0].length;
    const grid = new Grid(W, D);
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const c = rows[z][x];
      if (c === '.') grid.set(x, z, T.FLOOR, 0);
      else if (c === ':') grid.set(x, z, T.FLOOR, 1);
      else if (c === '#') grid.set(x, z, T.WALL, 0);
      grid.variant[grid.idx(x, z)] = (x * 7 + z * 3) % 4;
    }
    const level = buildLevelMesh(grid, deck, makeRng(n * 31));
    const root = new THREE.Group();
    root.add(level.group);
    const ground = (x, z) => (grid.groundAt(x, z) ?? 0);
    // the cast
    const actors = mem.actors.map((a) => {
      const act = { a, x: a.x, z: a.z, model: null, mesh: null };
      if (a.kind === 'crate') {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 0.75), new THREE.MeshStandardMaterial({ color: 0x3a3226, roughness: 0.7, metalness: 0.2 }));
        m.position.set(a.x, ground(a.x, a.z) + 0.375, a.z);
        act.mesh = m;
      } else if (a.kind === 'conduit') {
        const grp = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x050505, emissive: new THREE.Color(0xd8fff6), emissiveIntensity: 2.5 });
        grp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 9, 20), mat));
        for (let i = 0; i < 6; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.04, 8, 28), mat);
          ring.rotation.x = Math.PI / 2; ring.position.y = -3.5 + i * 1.4;
          grp.add(ring);
        }
        grp.position.set(a.x, ground(a.x, a.z) + 4.5, a.z);
        act.mesh = grp; act.pulseMat = mat;
      } else if (a.kind === 'uplink') {
        const grp = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x050505, emissive: new THREE.Color(a.dark ? 0x2a2438 : deck.ink), emissiveIntensity: a.dark ? 0.6 : 2.2 });
        act.dark = !!a.dark;
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.85, 32, 20), new THREE.MeshStandardMaterial({ color: 0x14121e, roughness: 0.3, metalness: 0.6 }));
        eye.position.y = 1.6;
        grp.add(eye);
        const iris = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), mat);
        iris.position.set(0, 1.6, 0.86);
        grp.add(iris);
        for (let i = 0; i < 2; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2 + i * 0.35, 0.05, 8, 48), mat);
          ring.position.y = 1.6; ring.rotation.x = Math.PI / 2 + i * 0.4;
          grp.add(ring);
          act[`ring${i}`] = ring;
        }
        grp.position.set(a.x, ground(a.x, a.z), a.z);
        act.mesh = grp; act.pulseMat = mat;
      } else {
        let spec;
        if (a.kind === 'klp2') spec = { shape: 'player', shell: 0xe9eef5, accent: PLAYER_COLOUR, label: 'K-2', drive: 'wheels', player: true, wear: OLD_KLP2 };
        else if (a.kind === 'klp2now') spec = { shape: 'player', shell: 0xe9eef5, accent: PLAYER_COLOUR, label: 'K-2', drive: 'wheels', player: true, wear: g.klpWear() };
        else if (a.kind === 'klp1') spec = { shape: 'player', shell: 0x9aa2b0, accent: PLAYER_COLOUR, label: 'K-1', drive: 'wheels', player: true };
        else {
          const F = FAMILIES[a.kind];
          // a freed droid wears KLP-2's cyan
          spec = { shape: F.shape, shell: 0x555b6b, accent: a.free ? PLAYER_COLOUR : deck.ink, label: String(a.cls || F.min), drive: F.drive || 'wheels', arm: F.arm, core: F.core, family: a.kind, command: !!a.boss };
        }
        act.model = new DroidModel({ scale: a.scale || 1, ...spec });
        act.model.group.position.set(a.x, ground(a.x, a.z), a.z);
      }
      root.add(act.mesh || act.model.group);
      return act;
    });
    r.scene.add(root);
    const w = g.world;
    if (w) w.root.visible = false;
    this.prevRetro = r.retro;
    r.retro = mem.retro !== false;
    const centre = new THREE.Vector3(mem.focus[0], 0.4, mem.focus[1]);
    g.env.setDeck(deck, centre);
    g.audio.play('unlock');
    this.m = { n, mem, deck, root, level, actors, ground, done, t: 0, line: -1, lineT: 0, centre };
    // the caption
    const el = $('#memory');
    el.hidden = false;
    // the ending is happening now: no old-footage lines over it
    el.classList.toggle('now', mem.retro === false);
    el.style.setProperty('--ink', `#${deck.ink.toString(16).padStart(6, '0')}`);
    $('#mem-head').textContent = head;
    this.next();
  }

  get reduced() { return document.body.classList.contains('reduced'); }

  // On to the next line, or the end.
  next() {
    const s = this.m;
    if (!s) return;
    s.line++;
    if (s.line >= s.mem.lines.length) { this.finish(); return; }
    const l = s.mem.lines[s.line];
    s.lineT = 0;
    s.lineDur = 2.6 + l.text.length * 0.055;
    $('#mem-who').textContent = l.who || '';
    $('#mem-who').hidden = !l.who;
    const text = $('#mem-text');
    text.classList.toggle('loud', !!l.who && l.text === l.text.toUpperCase());
    this.game.ui.announce(`${l.who ? `${l.who}: ` : ''}${l.text}`);
    clearInterval(this.typeT);
    if (this.reduced) { text.textContent = l.text; return; }
    let i = 0;
    text.textContent = '';
    this.typeT = setInterval(() => {
      i = Math.min(l.text.length, i + 2);
      text.textContent = l.text.slice(0, i);
      if (i % 6 === 0) this.game.audio.play('blip', { pitch: 0.8, soft: true });
      if (i >= l.text.length) clearInterval(this.typeT);
    }, 32);
  }

  update(dt) {
    const s = this.m;
    if (!s) return;
    const g = this.game, r = g.renderer, inp = g.input;
    if (inp.hit('back') || inp.hit('pause')) { this.finish(); return; }
    if (inp.hit('confirm') || inp.hit('grapple') || inp.padHit('confirm')) this.next();
    if (!this.m) return;
    s.t += dt;
    s.lineT += dt;
    if (s.lineT > s.lineDur) this.next();
    if (!this.m) return;
    for (const act of s.actors) {
      const a = act.a;
      // walk the path between its times
      if (a.path) {
        const [t0, t1] = a.at;
        const k = Math.max(0, Math.min(1, (s.t - t0) / (t1 - t0)));
        const seg = k * (a.path.length - 1), i = Math.min(a.path.length - 2, Math.floor(seg)), f = seg - i;
        const [x0, z0] = a.path[i], [x1, z1] = a.path[i + 1];
        const nx = x0 + (x1 - x0) * f, nz = z0 + (z1 - z0) * f;
        act.speed = Math.hypot(nx - act.x, nz - act.z) / Math.max(dt, 1e-4);
        act.x = nx; act.z = nz;
      } else act.speed = 0;
      const y = s.ground(act.x, act.z);
      if (act.model) {
        act.model.group.position.set(act.x, y, act.z);
        if (a.red && s.t > a.red && !act.turned) { act.turned = true; act.model.setAccent(0xff3040); g.audio.play('dent'); }
        act.model.update(dt, {
          speed: act.speed, facing: ((a.face ?? 0) * Math.PI) / 180, visibility: 1, mood: 'patrol',
          charge: a.pulse ? (Math.sin(s.t * 3) + 1) * 0.3 : 0,
        });
      } else if (act.mesh) {
        if (a.kind === 'crate') act.mesh.position.set(act.x, y + 0.375, act.z);
        if (act.pulseMat && !act.dark) act.pulseMat.emissiveIntensity = 2 + Math.sin(s.t * 3) * 0.8;
        if (act.ring0) { act.ring0.rotation.z += dt * 0.6; act.ring1.rotation.z -= dt * 0.9; }
      }
    }
    // a slow turn round the scene
    const a = Math.PI * 0.25 + (this.reduced ? 0 : s.t * 0.04);
    const dist = this.reduced ? 15 : 17 - Math.min(3, s.t * 0.25);
    r.camera.position.set(s.centre.x + Math.sin(a) * dist, 10.5, s.centre.z + Math.cos(a) * dist);
    // aim a little short of the middle, so the scene sits above the caption
    r.camera.lookAt(s.centre.x + Math.sin(a) * 3, 0, s.centre.z + Math.cos(a) * 3);
    g.env.update(dt, s.centre);
    const klp = s.actors.find((x) => x.a.kind === 'klp2' || x.a.kind === 'klp2now');
    if (klp) { g.env.playerLight.position.set(klp.x, 2.6, klp.z); g.env.playerLight.intensity = 3; }
  }

  finish() {
    const s = this.m;
    if (!s) return;
    this.m = null;
    clearInterval(this.typeT);
    const g = this.game, r = g.renderer;
    r.scene.remove(s.root);
    s.level.dispose();
    for (const act of s.actors) {
      if (act.model) act.model.dispose();
      if (act.mesh) act.mesh.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    }
    r.retro = this.prevRetro;
    if (g.world) { g.world.root.visible = true; g.env.setDeck(g.world.deck, g.world.player.pos); }
    $('#memory').hidden = true;
    g.input.clear();
    s.done();
  }
}
