// The game: owns the renderer, sound and UI, and runs the loop through the
// title, a run of decks, hacks, menus and the end of the run.
import * as THREE from 'three';
import { Renderer } from './render/renderer.js';
import { Environment } from './render/environment.js';
import { Fx } from './render/fx.js';
import { buildLevelMesh } from './render/levelMesh.js';
import { DroidModel } from './render/droidModel.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { loadMeta, saveMeta } from './meta.js';
import { PERKS, PERK_IDS } from './perks.js';
import { DECKS, PLAYER_COLOUR, PLAYER_HEX, TUNING, LEVEL_H } from './config.js';
import { generateDeck } from './world/deckgen.js';
import { World } from './world/world.js';
import { Grid, T } from './world/grid.js';
import { MODULES, STEALABLE, SLOTS, moduleLabel, iconSvg } from './world/modules.js';
import { FAMILIES } from './world/roster.js';
import { HackSession } from './hack/session.js';
import { HackView } from './hack/view.js';
import { Pickup } from './world/devices.js';
import { makeRng, randomSeed } from './rng.js';

const CYAN = new THREE.Color(PLAYER_COLOUR);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Game {
  constructor() {
    this.meta = loadMeta();
    this.settings = this.meta.settings;
    this.renderer = new Renderer(document.getElementById('view'));
    this.env = new Environment(this.renderer.scene);
    this.fx = new Fx(this.renderer.scene);
    this.input = new Input();
    this.audio = new Audio();
    this.ui = new UI(this);
    this.hackView = new HackView(document.getElementById('hack'));
    this.hackView.resize();
    window.addEventListener('resize', () => this.hackView.resize());
    this.state = 'boot';
    this.world = null;
    this.run = null;
    this.session = null;
    this.last = performance.now();
    this.ghostMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PLAYER_COLOUR).multiplyScalar(0.55), blending: THREE.AdditiveBlending, depthFunc: THREE.GreaterDepth, depthWrite: false });
    this.applySettings();

    // sound can only start after a key press or click
    const unlock = () => { this.audio.unlock(); };
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
    this.input.on((what) => {
      if (what === 'blur' && this.state === 'play') this.pause();
      if (what === 'pad' && !document.getElementById('screen-phone').hidden) this.toTitle();
    });
  }

  // ------------------------------------------------------------------ settings
  get reducedMotion() {
    if (this.settings.reducedMotion === null) return matchMedia('(prefers-reduced-motion: reduce)').matches;
    return this.settings.reducedMotion;
  }

  applySettings() {
    const s = this.settings;
    this.audio.volume = { master: s.master, music: s.music, sfx: s.sfx };
    this.audio.applyVolume();
    const rm = this.reducedMotion;
    this.renderer.reducedMotion = rm || !s.shake;
    this.renderer.retro = !!s.retro;
    this.fx.setReduced(rm);
    this.hackView.reduced = rm;
    document.body.classList.toggle('reduced', rm);
  }

  saveSettings() { this.meta.settings = this.settings; saveMeta(this.meta); this.applySettings(); }

  // ------------------------------------------------------------------ boot and loop
  start() {
    document.getElementById('loading').classList.add('done');
    const touchOnly = matchMedia('(hover: none) and (pointer: coarse)').matches;
    if (touchOnly && !this.input.pad()) {
      this.buildTitleScene();
      this.ui.show('phone');
      this.state = 'menu';
    } else {
      this.toTitle();
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  frame(now) {
    const dt = Math.min(1 / 20, (now - this.last) / 1000) * (this.timeScale || 1);
    this.last = now;
    this.input.poll();
    this.input.capture = this.state === 'play' || this.state === 'hack';
    try {
      this.update(dt);
    } catch (err) {
      console.error(err);
    }
    this.input.endFrame();
    requestAnimationFrame((t) => this.frame(t));
  }

  update(dt) {
    const r = this.renderer;
    if (this.ui.screen) this.ui.pollPad(this.input);

    if (this.state === 'title' || (this.titleScene && !this.world)) this.updateTitleScene(dt);

    if (this.world) {
      const w = this.world;
      const p = w.player;
      if (this.state === 'play') {
        this.controlPlayer(dt);
        w.update(dt);
        this.run.stats.time += dt;
      } else if (this.state === 'grapple') {
        this.updateGrapple(dt);
      } else if (this.state === 'hack') {
        this.session.update(dt);
        // the world keeps breathing, slowly
        for (const d of w.droids) d.syncModel(dt * 0.15);
      } else if (this.state === 'dying' || this.state === 'won') {
        w.update(dt * 0.3);
      } else if (this.state === 'descending') {
        this.updateDescend(dt);
      }
      if (p) {
        const focus = p.pos.clone();
        if (this.state === 'hack' && this.session) focus.lerp(this.session.target.pos, 0.5);
        r.follow(focus, dt);
        this.env.update(dt, p.pos);
        this.env.playerLight.position.set(p.pos.x, p.pos.y + 3, p.pos.z);
        this.env.playerLight.intensity = 4;
        this.audio.setListener(p.pos);
        if (this.state === 'play') {
          this.ui.updateHud(w, dt);
          this.ui.updateLabels(w, r);
          this.updatePrompt();
          this.musicIntensity(dt);
          this.minimapT = (this.minimapT || 0) - dt;
          if (this.minimapT <= 0) {
            this.minimapT = 0.2;
            this.ui.drawMinimap(w);
            // anything in plain sight goes in the archive
            for (const d of w.droids) {
              if (d.isPlayer || !d.family || d.cloaked || this.meta.archive[d.family]) continue;
              if (d.pos.distanceTo(p.pos) < 9) this.archiveSee(d, 'seen');
            }
          }
        }
      }
    }

    // post effects follow the state
    const g = r.grade.uniforms;
    const hacking = this.state === 'hack' || this.state === 'grapple';
    g.desat.value += ((hacking ? 0.55 : 0) - g.desat.value) * Math.min(1, dt * 4);
    g.dim.value += ((hacking ? 0.35 : this.ui.screen && this.world ? 0.25 : 0) - g.dim.value) * Math.min(1, dt * 4);
    if (this.session && this.state === 'hack') this.hackView.draw(this.session, dt);
    else if (this.hackDrawn) { this.hackView.clear(); this.hackDrawn = false; }
    if (this.state === 'hack') this.hackDrawn = true;

    this.fx.update(dt, r.camera);
    r.render(dt);
  }

  // ------------------------------------------------------------------ title
  toTitle() {
    this.disposeWorld();
    this.state = 'title';
    this.ui.showHud(false);
    this.buildTitleScene();
    const m = this.meta;
    const rec = [];
    if (m.runs) rec.push(`${m.runs} run${m.runs === 1 ? '' : 's'}`);
    if (m.bestDeck) rec.push(`deepest: deck ${Math.min(5, m.bestDeck)}${m.wins ? `, tower claimed ${m.wins} time${m.wins === 1 ? '' : 's'}` : ''}`);
    document.getElementById('title-records').textContent = rec.join(' · ');
    this.ui.show('title');
    this.audio.startMusic(6);
  }

  buildTitleScene() {
    if (this.titleScene) return;
    const deck = DECKS[Math.floor(Math.random() * 5)];
    const grid = new Grid(13, 13);
    for (let z = 0; z < 13; z++) for (let x = 0; x < 13; x++) {
      const d = Math.hypot(x - 6, z - 6);
      if (d < 5.6) grid.set(x, z, T.FLOOR, 0);
      grid.variant[grid.idx(x, z)] = (x * 7 + z * 3) % 4;
    }
    for (let z = 4; z <= 8; z++) for (let x = 4; x <= 8; x++) grid.set(x, z, T.FLOOR, 1);
    grid.set(6, 9, T.RAMP, 0, 0);
    grid.set(3, 3, T.WALL, 0); grid.set(9, 3, T.WALL, 0); grid.set(3, 9, T.WALL, 0); grid.set(9, 9, T.WALL, 0);
    const level = buildLevelMesh(grid, deck, makeRng(5));
    const root = new THREE.Group();
    root.add(level.group);
    const klp = new DroidModel({ shape: 'player', scale: 1, shell: 0xe9eef5, accent: PLAYER_COLOUR, label: 'K-2', drive: 'wheels', player: true });
    klp.group.position.set(6.5, 0.5, 6.5);
    root.add(klp.group);
    const foes = [];
    const fams = ['spark', 'hauler', 'tesla', 'wraith'];
    fams.forEach((f, i) => {
      const F = FAMILIES[f];
      const cls = F.min + 37;
      const m = new DroidModel({ shape: F.shape, scale: 0.9 + 0.05 * Math.floor(cls / 100), shell: 0x555b6b, accent: deck.ink, label: String(cls), drive: F.drive, arm: F.arm, core: F.core });
      const a = (i / fams.length) * Math.PI * 2 + 0.6;
      m.group.position.set(6.5 + Math.cos(a) * 3.6, 0, 6.5 + Math.sin(a) * 3.6);
      m.group.rotation.y = Math.atan2(6.5 - m.group.position.x, 6.5 - m.group.position.z);
      root.add(m.group);
      foes.push(m);
    });
    this.renderer.scene.add(root);
    this.env.setDeck(deck, new THREE.Vector3(6.5, 0, 6.5));
    this.titleScene = { root, level, klp, foes, t: 0, deck };
  }

  updateTitleScene(dt) {
    const s = this.titleScene;
    if (!s) return;
    s.t += dt;
    s.klp.update(dt, { speed: 0.4, facing: s.t * 0.4, visibility: 1 });
    s.foes.forEach((m, i) => m.update(dt, { speed: 0, facing: m.group.rotation.y, charge: (Math.sin(s.t * 1.3 + i * 2) + 1) * 0.25, visibility: 1 }));
    const r = this.renderer;
    const a = s.t * 0.06 + Math.PI * 0.25;
    const c = new THREE.Vector3(6.5, 0.4, 6.5);
    r.camera.position.set(c.x + Math.sin(a) * 25, 19, c.z + Math.cos(a) * 25);
    // keep the diorama to the right of the menu
    const right = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
    const look = c.clone().addScaledVector(right, innerWidth > 800 ? -3.2 : 0);
    r.camera.lookAt(look);
    this.env.update(dt, c);
    this.env.playerLight.position.set(6.5, 2.6, 6.5);
    this.env.playerLight.intensity = 2;
  }

  disposeTitleScene() {
    const s = this.titleScene;
    if (!s) return;
    this.renderer.scene.remove(s.root);
    s.level.dispose();
    s.klp.dispose();
    s.foes.forEach((f) => f.dispose());
    this.titleScene = null;
  }

  // ------------------------------------------------------------------ menus
  onAction(screen, act, el) {
    switch (screen) {
      case 'title':
        if (act === 'new') this.newRun();
        else if (act === 'archive') this.ui.archive(this.meta);
        else if (act === 'howto') this.showHowto();
        else if (act === 'settings') this.showSettings();
        break;
      case 'phone':
        if (act === 'anyway') this.toTitle();
        break;
      case 'kit':
        if (act === 'back') this.toTitle();
        else if (act === 'kit') this.startRun(el.dataset.id || null);
        break;
      case 'pause':
        if (act === 'resume' || act === 'back') this.resume();
        else if (act === 'loadout') this.ui.loadout(this.world.player, this.run.perks, this.playerPulsers());
        else if (act === 'howto') this.showHowto();
        else if (act === 'settings') this.showSettings();
        else if (act === 'abandon') this.endRun(false, 'abandoned');
        break;
      case 'loadout':
        if (act === 'back') this.resume();
        break;
      case 'settings': case 'howto': case 'archive':
        if (act === 'back') { if (this.state === 'title') this.ui.show('title'); else this.resume(); }
        break;
      case 'offer':
        this.onOffer(act, el);
        break;
      case 'end':
        if (act === 'again') this.newRun();
        else if (act === 'title' || act === 'back') this.toTitle();
        break;
      default: break;
    }
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'menu';
    const w = this.world;
    document.getElementById('pause-info').textContent = `Deck ${this.run.deck}, ${w.deck.name}. ${Math.round(w.claim * 100)}% claimed.`;
    this.ui.show('pause');
    this.ui.setPrompt(null);
  }

  resume() {
    this.ui.hide();
    if (this.world && this.world.player && this.world.player.alive) {
      this.state = 'play';
      this.input.clear();
    } else if (!this.world) this.toTitle();
  }

  showSettings() {
    const s = this.settings;
    const range = (key, label) => `<div class="setting"><label for="set-${key}">${label}</label><input type="range" id="set-${key}" min="0" max="100" value="${Math.round(s[key] * 100)}" data-key="${key}"></div>`;
    const check = (key, label, small) => `<div class="setting"><label for="set-${key}">${label}${small ? `<small>${small}</small>` : ''}</label><input type="checkbox" id="set-${key}" data-key="${key}" ${s[key] ? 'checked' : ''}></div>`;
    const rmNow = this.reducedMotion;
    document.getElementById('settings-body').innerHTML = [
      range('master', 'Volume'),
      range('music', 'Music'),
      range('sfx', 'Effects'),
      `<div class="setting"><label for="set-reducedMotion">Reduced motion<small>Less shake, flash and flicker. Starts from your system setting.</small></label><input type="checkbox" id="set-reducedMotion" data-key="reducedMotion" ${rmNow ? 'checked' : ''}></div>`,
      check('shake', 'Screen shake'),
      check('hints', 'Hints', 'Short tips the first time things happen.'),
      check('assist', 'Assist', 'Take a little over half the damage.'),
      check('slowHack', 'Slower hacks', 'Hack timers run half as long again.'),
      check('gridControls', 'Grid controls', 'Up moves along the floor grid (up and right on screen) instead of straight up the screen.'),
      check('retro', '1986 mode', 'Two colours per 8 by 8 block, like a ZX Spectrum.'),
    ].join('');
    document.querySelectorAll('#settings-body input').forEach((el) => {
      el.addEventListener('input', () => {
        const k = el.dataset.key;
        s[k] = el.type === 'checkbox' ? el.checked : el.value / 100;
        this.saveSettings();
        if (el.type === 'range') this.audio.play('uiMove');
      });
    });
    this.ui.show('settings', { push: true });
  }

  showHowto() {
    const L = (a) => `<kbd>${this.input.label(a)}</kbd>`;
    document.getElementById('howto-body').innerHTML = `
      <div><h3>Controls</h3><dl>
        <dt><kbd>WASD</kbd> / arrows</dt><dd>Move. Up is up the screen.</dd>
        <dt><kbd>Space</kbd></dt><dd>Grapple a droid or terminal, pick things up, use the lift</dd>
        <dt><kbd>J</kbd> or <kbd>Z</kbd></dt><dd>Use your arm part (fire, discharge, pull)</dd>
        <dt><kbd>K</kbd> or <kbd>X</kbd></dt><dd>Use your drive part (dash, hover, stamp)</dd>
        <dt><kbd>L</kbd> or <kbd>C</kbd></dt><dd>Use your core part (shield, cloak, phase)</dd>
        <dt>${L('loadout')}</dt><dd>Parts and firmware</dd>
        <dt>${L('pause')}</dt><dd>Pause</dd>
      </dl><p>A gamepad works too: left stick, A grapple, X arm, B drive, Y core.</p></div>
      <div><h3>The idea</h3>
        <p>You are KLP-2, a small droid in a tower full of bigger ones. You can't win a straight fight, so you steal.</p>
        <p>Get close and grapple a droid to start a hack. Win, and you can take one of its parts. Every droid is built from the parts it carries: what you see on it is what you get.</p>
        <p>Each deck has a lift down, locked until you take its <b>◆ command droid</b>, by hack or by force.</p></div>
      <div><h3>The hack</h3>
        <p>Two sides of a circuit fight over the column of cells in the middle. Pick the side whose wires run cleaner, then fire pulses down your wires. A powered cell takes your colour. Own more cells when the timer ends and you win.</p>
        <p>Forks reach two cells. AND gates need two wires lit at once. Inverts paint their colour. Locks stay lit. ∞ wires cost nothing.</p></div>
      <div><h3>Fighting</h3>
        <ul><li>Ram droids to dent them, and knock them off edges into the void.</li>
        <li>A damaged droid hacks back with fewer pulsers. A stunned one starts late.</li>
        <li>Destroy a droid and its parts are lost. Hack it and they're yours.</li>
        <li>Watch for lights brightening: that's an attack coming.</li></ul></div>
      <div><h3>Parts</h3>
        <p>Three sockets: drive, arm and core. Taking a part drops the old one at your feet, so you can swap back. A part's grade comes from the class of the droid you took it from.</p>
        <p>Sealed vaults need the right part: thrusters for a gap, treads for a heavy crate, phase for a field. The way down never does.</p></div>
      <div><h3>Between runs</h3>
        <p>When KLP-2 is destroyed the run ends. You keep the droid archive, and any part you've ever stolen can come with you, at grade I, on the next run.</p></div>`;
    this.ui.show('howto', { push: true });
  }

  // ------------------------------------------------------------------ runs
  newRun() {
    const stolen = STEALABLE.filter((id) => this.meta.stolen[id]);
    if (!stolen.length) { this.startRun(null); return; }
    document.getElementById('kit-cards').innerHTML = [
      `<button class="card" data-act="kit" data-id=""><span class="slot-tag">Nothing extra</span><span class="card-head">${iconSvg('wheels', 26)}Wheels and bumper</span><span class="line">The way KLP-2 left the factory.</span></button>`,
      ...stolen.map((id) => this.ui.moduleCard({ id, grade: 1 }, null, { act: 'kit' })),
    ].join('');
    this.ui.show('kit');
  }

  startRun(kit) {
    this.ui.hide();
    const mods = { drive: { id: 'wheels', grade: 1 }, arm: null, core: null };
    if (kit) mods[MODULES[kit].slot] = { id: kit, grade: 1 };
    this.run = {
      seed: randomSeed(), deck: 1, mods,
      integrity: TUNING.playerIntegrity, maxIntegrity: TUNING.playerIntegrity, maxEnergy: TUNING.playerEnergy,
      perks: [], lastGaspUsed: false, newStolen: [],
      stats: { hacked: 0, destroyed: 0, voided: 0, parts: 0, time: 0, reflects: 0, decks: 0 },
      tutorial: !this.meta.tutorialDone && this.settings.hints,
    };
    this.disposeTitleScene();
    this.loadDeck(1);
  }

  async loadDeck(n) {
    this.state = 'transition';
    const fade = document.getElementById('fade');
    fade.classList.add('on');
    await sleep(this.world ? 650 : 350);
    this.saveRunFromPlayer();
    this.disposeWorld();
    this.disposeTitleScene();
    this.fx.clear();
    const seed = this.forceSeed != null ? this.forceSeed : this.run.seed + n * 7919;
    this.forceSeed = null;
    const build = generateDeck(n, makeRng(seed), { tutorial: this.run.tutorial, playerMods: this.run.mods });
    this.world = new World(this, build, this.run);
    const w = this.world;
    const centre = new THREE.Vector3(build.grid.w / 2, 0, build.grid.d / 2);
    this.env.setDeck(w.deck, centre);
    this.renderer.zoomTarget = 1; this.renderer.zoom = 1;
    this.renderer.follow(w.player.pos, 0, true);
    this.ui.setDeck(w.deck, n);
    this.ui.buildSockets(w.player);
    this.ui.showHud(true);
    this.audio.startMusic(w.deck.music);
    this.run.stats.decks = Math.max(this.run.stats.decks, n);
    this.meta.bestDeck = Math.max(this.meta.bestDeck || 0, n);
    saveMeta(this.meta);
    fade.classList.remove('on');
    this.ui.deckCard(w.deck, n);
    this.state = 'play';
    this.input.clear();
    if (n === 1 && this.run.tutorial) {
      setTimeout(() => this.hintOnce('move', '<b>WASD</b> or the <b>arrow keys</b> to move. Up is up the screen. Find a droid and get close.', 8), 3200);
    }
    if (n === 6) setTimeout(() => this.hint('The Mainframe hides behind four relays. Hack each one to bring its shield down.', 8), 3400);
  }

  saveRunFromPlayer() {
    const p = this.world && this.world.player;
    if (!p || !this.run) return;
    this.run.integrity = Math.max(1, p.integrity);
    this.run.mods = { drive: p.mods.drive, arm: p.mods.arm, core: p.mods.core };
  }

  disposeWorld() {
    if (this.world) { this.world.dispose(); this.world = null; }
    this.session = null;
    this.ui.setPrompt(null);
    this.ui.clearLabels();
  }

  playerPulsers() {
    const mods = this.world && this.world.player ? this.world.player.mods : this.run ? this.run.mods : {};
    let g = 0;
    for (const s of SLOTS) { const m = mods[s]; if (m && !MODULES[m.id].starter) g += m.grade; }
    return Math.min(8, 4 + Math.floor(g / 6) + (this.hasPerk('overclock') ? 1 : 0));
  }

  hasPerk(id) { return !!this.run && this.run.perks.includes(id); }

  stat(k) { if (this.run) this.run.stats[k] = (this.run.stats[k] || 0) + 1; }

  // ------------------------------------------------------------------ the player
  controlPlayer(dt) {
    const w = this.world, p = w.player, inp = this.input;
    if (!p || !p.alive) return;
    let mv = inp.move();
    // optional: turn the controls an eighth so "up" runs along the grid
    if (this.settings.gridControls) {
      const c = Math.SQRT1_2;
      mv = { x: (mv.x + mv.y) * c, y: (mv.y - mv.x) * c };
    }
    const v = this.renderer.screenToWorld(mv.x, mv.y);
    p.intent.mx = v.x; p.intent.mz = v.z;
    p.intent.arm = inp.held('arm');
    p.intent.drive = inp.held('drive');
    p.intent.core = inp.held('core');
    if (p.modId('arm') !== 'tractor') p.intent.aim = null;
    if (inp.hit('grapple')) this.interact();
    if (inp.hit('loadout')) { this.state = 'menu'; this.ui.loadout(p, this.run.perks, this.playerPulsers()); this.ui.stack = []; }
    else if (inp.hit('pause')) this.pause();
  }

  updatePrompt() {
    const it = this.world.interaction();
    const key = `<kbd>${this.input.label('grapple')}</kbd>`;
    if (!it) { this.ui.setPrompt(null); return; }
    if (it.kind === 'lift') {
      if (it.ready) this.ui.setPrompt(`${key}Take the lift down`);
      else this.ui.setPrompt(`${key}Lift locked<span class="sub">needs the ◆ command droid's clearance</span>`, true);
      return;
    }
    if (it.kind === 'pickup') {
      const k = it.target;
      if (k.what.type === 'module') this.ui.setPrompt(`${key}Take ${moduleLabel(k.what.mod)}`);
      else this.ui.setPrompt(`${key}Open ${k.label().toLowerCase()}`);
      return;
    }
    const t = it.target;
    let name, sub = '';
    if (t.kind === 'droid') {
      name = `${FAMILIES[t.family].name} ${t.cls}`;
      const p = this.world.player;
      if (t.shielding && t.inFront({ x: t.pos.x - p.pos.x, z: t.pos.z - p.pos.z }, t.stats.core.arc)) sub = 'its shield is up';
      else if (t.stunned) sub = 'stunned: it will start late';
      else if (t.integrity < t.maxIntegrity * 0.66) sub = 'damaged: fewer pulsers';
      if (p.cloaked) sub = 'ambush from cloak';
    } else if (t.kind === 'mainframe') name = 'the Mainframe';
    else name = t.kind === 'archive' ? 'archive terminal' : t.kind === 'relay' ? 'relay' : t.kind;
    this.ui.setPrompt(`${key}Grapple ${name}${sub ? `<span class="sub">${sub}</span>` : ''}`, !!sub && sub.includes('shield'));
  }

  interact() {
    const w = this.world;
    const it = w.interaction();
    if (!it) return;
    if (it.kind === 'lift') {
      if (it.ready) this.descend();
      else { this.toast('The lift needs clearance. Hack or destroy the ◆ command droid.'); this.audio.play('empty'); }
      return;
    }
    if (it.kind === 'pickup') { this.usePickup(it.target); return; }
    this.tryGrapple(it.target);
  }

  tryGrapple(t) {
    const w = this.world, p = w.player;
    if (t.kind === 'droid' && t.shielding && t.inFront({ x: t.pos.x - p.pos.x, z: t.pos.z - p.pos.z }, t.stats.core.arc)) {
      this.audio.play('reflect', { at: t.pos });
      p.knock((p.pos.x - t.pos.x) * 4, (p.pos.z - t.pos.z) * 4, 0.3);
      this.toast('Its shield is up. Get round the side, or stun it first.');
      return;
    }
    if (t.kind === 'mainframe' && !t.canHack()) { this.toast('The Mainframe is shielded. Take down its relays first.'); return; }
    let ambush = 0;
    if (p.cloaked && p.stats.core) { ambush = p.stats.core.ambush; p.cloaked = false; }
    this.state = 'grapple';
    this.grapple = { t: 0, target: t, ambush };
    p.facing = Math.atan2(t.pos.x - p.pos.x, t.pos.z - p.pos.z);
    p.vel.x = p.vel.z = 0;
    if (t.kind === 'droid') { t.vel.x = t.vel.z = 0; t.charge = 0; if (t.brain) t.brain.attack = null; }
    this.audio.play('grapple', { at: p.pos });
    this.ui.setPrompt(null);
  }

  updateGrapple(dt) {
    const g = this.grapple;
    const w = this.world, p = w.player, t = g.target;
    g.t += dt;
    const from = p.pos.clone(); from.y += 0.25; from.x += Math.sin(p.facing) * 0.35; from.z += Math.cos(p.facing) * 0.35;
    const to = t.pos.clone(); to.y += (t.kind === 'droid' ? 0.4 * t.scale : 0.6);
    const k = Math.min(1, g.t / 0.22);
    const end = from.clone().lerp(to, k);
    if (g.rib) w.fx.removeRibbon(g.rib);
    g.rib = w.fx.ribbon([from, end], PLAYER_COLOUR, 0.06, 1, { persist: true, bright: 2.5 });
    if (k >= 1 && !g.sparked) { g.sparked = true; w.fx.burst(to, PLAYER_COLOUR, 16, 2, 0.4, 0.1, 0); this.renderer.flash(PLAYER_HEX, 0.15); }
    p.syncModel(dt);
    if (t.syncModel) t.syncModel(dt);
    if (g.t > 0.4) {
      if (g.rib) w.fx.removeRibbon(g.rib);
      this.startHack(t, { ambush: g.ambush });
    }
  }

  startHack(target, opts = {}) {
    const spec = this.world.hackSpecFor(target);
    const tutorial = !this.meta.tutorialHack && this.settings.hints;
    this.session = new HackSession(this, target, spec, { ...opts, tutorial });
    this.state = 'hack';
    this.audio.setHack(true);
    this.renderer.zoomTarget = 0.72;
    this.ui.setPrompt(null);
    this.ui.clearLabels();
    this.ui.el.hud.classList.add('hacking');
  }

  endHack(session, won) {
    const w = this.world, p = w.player, t = session.target;
    this.session = null;
    this.audio.setHack(false);
    this.renderer.zoomTarget = 1;
    this.ui.el.hud.classList.remove('hacking');
    this.meta.tutorialHack = true;
    this.meta.hacks = (this.meta.hacks || 0) + 1;
    saveMeta(this.meta);
    this.state = 'play';
    this.input.clear();
    if (won) {
      this.renderer.flash(PLAYER_HEX, 0.35);
      const heal = (t.kind === 'droid' ? 0.12 : 0.04) + (this.hasPerk('siphon') ? 0.25 : 0);
      p.integrity = Math.min(p.maxIntegrity, p.integrity + p.maxIntegrity * heal);
      p.energy = p.maxEnergy;
      if (t.kind === 'droid') {
        this.stat('hacked');
        this.archiveSee(t, 'hacked');
        const offers = [];
        for (const s of SLOTS) {
          const m = t.mods[s];
          if (m && !MODULES[m.id].starter) offers.push({ id: m.id, grade: m.grade });
        }
        this.powerDown(t);
        if (offers.length) {
          this.offerState = { kind: 'salvage', offers };
          const first = !this.meta.stolen || !Object.keys(this.meta.stolen).length;
          this.ui.offer({
            title: `${FAMILIES[t.family].name} ${t.cls} is yours`,
            lede: first ? 'Take one part. It goes in the matching socket; anything it replaces drops at your feet.' : 'Take one part, or leave them.',
            cards: offers.map((m) => this.ui.moduleCard(m, p.mods[MODULES[m.id].slot])),
            extra: '<button data-act="leave">Take nothing</button>',
          });
          this.state = 'menu';
        } else {
          this.toast(`${FAMILIES[t.family].name} ${t.cls} wiped. Nothing worth taking.`);
        }
      } else {
        t.onHackWin();
        if (t.kind === 'terminal') this.toast('Terminal hacked.');
        if (t.kind === 'turret') this.toast('Turret hacked. It works for you now.');
      }
    } else {
      const dmg = 6 + (session.spec.cls || 100) / 60;
      p.damage(dmg, { force: true, kind: 'feedback' });
      this.renderer.flash('#ff3030', 0.3);
      this.renderer.addShake(0.4);
      if (t.kind === 'droid') {
        const dx = p.pos.x - t.pos.x, dz = p.pos.z - t.pos.z, m = Math.hypot(dx, dz) || 1;
        p.knock((dx / m) * 3.5, (dz / m) * 3.5, 0.4);
        t.graceT = 2.5;
        if (t.brain) t.brain.provoke();
        this.toast('Rejected. Feedback surge.');
      } else {
        t.onHackLose();
        p.knock(0, 0, 0.4);
      }
    }
    this.ui.refreshSockets(p);
  }

  powerDown(d) {
    d.state = 'hacked';
    d.solid = false;
    d.downT = 0;
    d.setAccent(PLAYER_COLOUR);
    d.cloaked = false; d.shielding = false; d.hovering = false;
    this.world.fx.burst(d.pos.clone().setY(d.pos.y + 0.5), PLAYER_COLOUR, 20, 2, 0.6, 0.1, 1);
    this.world.claimEvent('droid', d);
    if (d.command) this.world.grantClearance('hacked');
  }

  equip(mod) {
    const w = this.world, p = w.player;
    const slot = MODULES[mod.id].slot;
    const old = p.mods[slot];
    if (old && !MODULES[old.id].starter) {
      // drop it beside us, somewhere with floor under it
      const k = w.dropModule(old, p.pos);
      for (let i = 0; i < 12; i++) {
        const a = p.facing + Math.PI + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.6;
        const x = p.pos.x + Math.sin(a) * 0.8, z = p.pos.z + Math.cos(a) * 0.8;
        const gy = w.grid.groundAt(x, z);
        if (gy !== null && Math.abs(gy - p.pos.y) < 0.3 && !w.pickups.some((o) => o !== k && Math.hypot(o.pos.x - x, o.pos.z - z) < 0.5)) {
          k.pos.x = x; k.pos.z = z;
          break;
        }
      }
      this.hintOnce('dropped', 'Your old part dropped. Stand by it and press <b>Space</b> to swap back.');
    }
    p.mods[slot] = { id: mod.id, grade: mod.grade };
    p.refresh();
    if (!this.meta.stolen[mod.id]) { this.meta.stolen[mod.id] = true; this.run.newStolen.push(mod.id); saveMeta(this.meta); }
    this.run.stats.parts++;
    this.audio.play('pickup', { at: p.pos });
    this.toast(`Fitted ${moduleLabel(mod)}`);
    this.hintOnce(`use-${slot}`, `${MODULES[mod.id].name}: press <b>${this.input.label(slot)}</b>. ${MODULES[mod.id].use}`, 8);
    this.ui.refreshSockets(p);
  }

  usePickup(k) {
    const w = this.world;
    const what = k.what;
    if (what.type === 'module') {
      w.removePickup(k);
      this.equip(what.mod);
    } else if (what.type === 'cache') {
      this.offerState = { kind: 'cache', pickup: k, offers: what.offer };
      this.ui.offer({
        title: 'Parts cache',
        lede: 'Sealed spares. Take one.',
        cards: what.offer.map((m) => this.ui.moduleCard(m, w.player.mods[MODULES[m.id].slot])),
        extra: '<button data-act="leave">Leave it</button>',
      });
      this.state = 'menu';
    } else if (what.type === 'chip') {
      this.offerFirmware('chip', k);
    }
  }

  offerFirmware(source, pickup) {
    const rng = makeRng(randomSeed());
    const pool = PERK_IDS.filter((id) => !this.run.perks.includes(id));
    if (!pool.length) {
      const p = this.world.player;
      p.integrity = p.maxIntegrity;
      this.toast('Nothing new on it. Used it for a repair.');
      if (pickup) this.world.removePickup(pickup);
      return;
    }
    const picks = rng.shuffle(pool.slice()).slice(0, 3);
    this.offerState = { kind: 'perk', pickup, source };
    this.ui.offer({
      title: source === 'archive' ? 'Archive unlocked' : source === 'claim' ? 'Deck claimed' : 'Firmware chip',
      lede: 'Pick one upgrade. It lasts for the rest of the run.',
      cards: picks.map((id) => this.ui.perkCard(id)),
    });
    this.state = 'menu';
    this.ui.setPrompt(null);
  }

  onOffer(act, el) {
    const o = this.offerState;
    if (!o) { this.resume(); return; }
    if (act === 'take') {
      this.equip({ id: el.dataset.id, grade: +el.dataset.grade });
      if (o.kind === 'cache' && o.pickup) this.world.removePickup(o.pickup);
    } else if (act === 'perk') {
      this.addPerk(el.dataset.id);
      if (o.pickup) this.world.removePickup(o.pickup);
    } else if (act === 'back' && o.kind === 'perk') {
      return; // a perk choice can't be skipped by accident
    }
    this.offerState = null;
    this.ui.hide();
    this.state = 'play';
    this.input.clear();
  }

  addPerk(id) {
    this.run.perks.push(id);
    const p = this.world.player;
    if (id === 'reinforced') { p.maxIntegrity += 30; this.run.maxIntegrity += 30; p.integrity = p.maxIntegrity; }
    if (id === 'battery') { p.maxEnergy += 40; this.run.maxEnergy += 40; p.energy = p.maxEnergy; }
    this.audio.play('unlock');
    this.toast(`Firmware: ${PERKS[id].name}`);
    this.ui.refreshSockets(p);
  }

  // ------------------------------------------------------------------ world callbacks
  onPlayerRefresh(p) { this.attachPlayerGhost(p); }

  attachPlayerGhost(p) {
    // a cyan silhouette shows through anything standing in front of KLP-2
    p.model.group.traverse((m) => {
      if (!m.isMesh || m.userData.ghost || m.material.blending === THREE.AdditiveBlending) return;
      m.renderOrder = 2;
      const g = new THREE.Mesh(m.geometry, this.ghostMat);
      g.userData.ghost = true;
      g.renderOrder = 1;
      g.castShadow = false;
      m.add(g);
    });
  }

  onPlayerHurt(amount, src) {
    this.renderer.flash('#ff2020', Math.min(0.35, amount / 40));
    this.renderer.addShake(Math.min(0.4, amount / 30));
    const p = this.world.player;
    if (p.integrity < p.maxIntegrity * 0.25 && !this.lowWarned) { this.lowWarned = true; this.ui.announce('Integrity low.', true); }
    if (p.integrity > p.maxIntegrity * 0.4) this.lowWarned = false;
  }

  flashEnergy() {
    const el = document.getElementById('bar-energy');
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    this.hintOnce('energy', 'Out of energy. It comes back when you stop using parts for a moment.');
  }

  onClearance(how) {
    this.toast(how === 'hacked' ? 'Clearance taken. The lift is open.' : 'Clearance code recovered. The lift is open.');
    this.audio.play('unlock');
    this.ui.announce('Clearance granted. The lift is open.');
  }

  deckClaimed() {
    const w = this.world, p = w.player;
    p.integrity = Math.min(p.maxIntegrity, p.integrity + p.maxIntegrity * 0.3);
    this.toast('Deck claimed. Every machine here is yours.');
    const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z);
    const chip = new Pickup(w, { t: '$', x, z, h: w.grid.hAt(x, z), room: -1, ch: '' }, { type: 'chip' });
    chip.pos.set(p.pos.x, p.pos.y + 0.45, p.pos.z);
    w.pickups.push(chip);
    this.hint('A firmware chip dropped at your feet.', 4);
  }

  onEnterRoom(room, first) {
    if (!first) return;
    if (room.role === 'vault' && room.hint) this.hint(`A sealed vault. ${room.hint}`, 6);
    if (room.role === 'lift' && !this.world.clearance) this.hintOnce('lift', 'The lift is here, locked. The droid marked <b>◆</b> holds the clearance: hack it or destroy it.', 8);
    if (room.role === 'archive') this.hintOnce('archive', 'An archive terminal. Hack it to pick a firmware upgrade.', 6);
    if (room.role === 'combat' && this.run.tutorial && this.run.deck === 1) {
      this.hintOnce('grapple', 'Get close to a droid and press <b>Space</b> to grapple it. Ram it first and it hacks back weaker.', 8);
    }
  }

  archiveSee(d, how) {
    if (!d.family) return;
    const a = this.meta.archive[d.family] || (this.meta.archive[d.family] = { hacked: 0, destroyed: 0, best: 0 });
    if (how === 'hacked') { a.hacked++; a.best = Math.max(a.best || 0, d.cls); }
    else if (how === 'destroyed') a.destroyed++;
    saveMeta(this.meta);
  }

  hint(html, secs = 6) { if (this.settings.hints) this.ui.hint(html, secs); }
  hintOnce(key, html, secs = 6) {
    if (!this.settings.hints || this.meta.hints[key]) return;
    this.meta.hints[key] = true;
    saveMeta(this.meta);
    this.ui.hint(html, secs);
  }
  toast(text) { this.ui.toast(text); }
  announce(text) { this.ui.announce(text); }

  musicIntensity() {
    const w = this.world;
    let n = 0;
    for (const d of w.droids) if (d.brain && d.brain.state === 'chase' && d.pos.distanceTo(w.player.pos) < 12) n++;
    this.audio.setIntensity(Math.min(1, n * 0.35));
  }

  // ------------------------------------------------------------------ lift, death, victory
  descend() {
    const w = this.world, p = w.player;
    this.state = 'descending';
    this.descendT = 0;
    this.ui.setPrompt(null);
    this.ui.clearLabels();
    p.pos.x = w.lift.pos.x; p.pos.z = w.lift.pos.z;
    this.audio.play('descend');
    if (this.run.deck === 1) { this.meta.tutorialDone = true; saveMeta(this.meta); }
  }

  updateDescend(dt) {
    const w = this.world, p = w.player;
    this.descendT += dt;
    p.pos.y -= dt * dt * 40 * this.descendT;
    p.syncModel(dt);
    w.lift.group.position.y = p.pos.y;
    if (this.descendT > 1.1 && this.state === 'descending') {
      this.state = 'transition';
      this.run.deck += 1;
      this.saveRunFromPlayer();
      // the lift's cradle patches KLP-2 up on the way down
      this.run.integrity = Math.min(this.run.maxIntegrity, this.run.integrity + this.run.maxIntegrity * 0.25);
      this.loadDeck(this.run.deck);
    }
  }

  playerDied() {
    const w = this.world, p = w.player;
    if (this.hasPerk('lastgasp') && !this.run.lastGaspUsed) {
      this.run.lastGaspUsed = true;
      p.integrity = 1; p.invuln = 2;
      this.toast('Last gasp. One more chance.');
      this.renderer.flash(PLAYER_HEX, 0.5);
      return;
    }
    p.alive = false;
    p.state = 'dead';
    this.state = 'dying';
    w.explode(p.pos.clone().setY(p.pos.y + 0.4), PLAYER_COLOUR, 1.6);
    p.model.group.visible = false;
    this.ui.setPrompt(null);
    this.ui.announce('KLP-2 destroyed.', true);
    setTimeout(() => this.endRun(false, 'destroyed'), 2200);
  }

  victory() {
    this.state = 'won';
    const w = this.world;
    w.claimed = w.claimTotal;
    this.renderer.flash(PLAYER_HEX, 0.8);
    this.audio.play('hackWin');
    this.ui.announce('The Mainframe is yours. The tower is claimed.', true);
    for (const d of w.droids) if (!d.isPlayer && d.alive && d.state === 'active') this.powerDown(d);
    setTimeout(() => this.endRun(true, 'won'), 3600);
  }

  endRun(won, how) {
    const r = this.run;
    if (!r) { this.toTitle(); return; }
    this.meta.runs = (this.meta.runs || 0) + 1;
    if (won) this.meta.wins = (this.meta.wins || 0) + 1;
    saveMeta(this.meta);
    this.state = 'end';
    this.audio.stopMusic(1.5);
    this.ui.showHud(false);
    this.ui.setPrompt(null);
    const mins = Math.floor(r.stats.time / 60), secs = Math.floor(r.stats.time % 60);
    document.getElementById('end-h').textContent = won ? 'The tower is yours' : how === 'abandoned' ? 'Run abandoned' : 'KLP-2 destroyed';
    document.getElementById('end-lede').textContent = won
      ? 'The Mainframe went quiet and every light in the tower turned cyan. Not bad for a droid that started with wheels and a bumper.'
      : `It got as far as deck ${r.deck}, ${DECKS[r.deck - 1].name}. The archive keeps what it learned.`;
    const st = r.stats;
    document.getElementById('end-stats').innerHTML = [
      ['Deepest deck', r.deck === 6 ? 'Mainframe' : r.deck], ['Droids hacked', st.hacked], ['Destroyed', st.destroyed + st.voided],
      ['Parts fitted', st.parts], ['Firmware', r.perks.length], ['Time', `${mins}:${String(secs).padStart(2, '0')}`],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    document.getElementById('end-unlocks').textContent = r.newStolen.length
      ? `New starting parts: ${r.newStolen.map((id) => MODULES[id].name).join(', ')}.`
      : '';
    this.ui.show('end');
    this.run = null;
  }
}
