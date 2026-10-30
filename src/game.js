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
import { MODULES, STEALABLE, SLOTS, moduleLabel, iconSvg, roman, statDiff } from './world/modules.js';
import { FAMILIES, BOUNTY_NAMES } from './world/roster.js';
import { HackSession } from './hack/session.js';
import { LESSONS } from './hack/lessons.js';
import { HackView } from './hack/view.js';
import { Pickup } from './world/devices.js';
import { Brain } from './world/ai.js';
import { scrapFor } from './world/scrap.js';
import { makeRng, randomSeed } from './rng.js';
import { line, CHATS } from './lines.js';
import { runStats, dataFor, BENCH, rank, nextCost, cheapest } from './progress.js';
import { pick, hasNew } from './story/cast.js';
import { frontPage } from './story/gazette.js';
import { today, prettyDate, dailySeed, shareText, shareSummary } from './daily.js';

const CYAN = new THREE.Color(PLAYER_COLOUR);
const GANG_MAX = 3;
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
    this.input.blocked = () => !!this.ui.screen;
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
      if (what === 'blur' && this.state === 'hack' && this.session) this.session.paused = true;
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
    this.renderer.userZoom = s.zoom || 1;
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
    // floor signs show the keys for whatever you last pressed
    if (this.world && this.world.signs.length && this.input.lastDevice !== this.signDevice) {
      this.signDevice = this.input.lastDevice;
      for (const sg of this.world.signs) sg.setDevice(this.signDevice);
    }
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
      // a ring-out plays out slowly
      let wdt = dt;
      if (this.slowT > 0 && this.state === 'play') { this.slowT -= dt; wdt = dt * 0.3; }
      if (this.state === 'play' && this.hitStop > 0) {
        // a heartbeat's pause on a big hit
        this.hitStop -= dt;
      } else if (this.state === 'play') {
        this.controlPlayer(wdt);
        w.update(wdt);
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
          this.ui.updateBubbles(r);
          this.ui.updatePops(r, dt);
          this.chatter(dt);
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
            // the first sight of this deck's bounty
            const b = w.bounty;
            if (b && !b.spotted && b.alive && b.team === 'h' && !b.cloaked && b.pos.distanceTo(p.pos) < 10 && w.canSee(p.pos, b.pos)) this.bountySpotted(b);
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
    this.ui.tickPortraits(performance.now() / 1000);
  }

  // ------------------------------------------------------------------ title
  toTitle() {
    this.disposeWorld();
    this.ui.clearRadio();
    this.run = null;
    this.state = 'title';
    this.ui.showHud(false);
    this.buildTitleScene();
    const m = this.meta;
    const rec = [];
    if (m.runs) rec.push(`${m.runs} run${m.runs === 1 ? '' : 's'}`);
    if (m.bestDeck) rec.push(`deepest: deck ${Math.min(5, m.bestDeck)}${m.wins ? `, tower claimed ${m.wins} time${m.wins === 1 ? '' : 's'}` : ''}`);
    if (m.data) rec.push(`${m.data} data for Nan`);
    document.getElementById('title-records').textContent = rec.join(' · ');
    document.getElementById('btn-induction').hidden = !m.inductionDone;
    const done = m.daily && m.daily[today()];
    document.getElementById('daily-note').textContent = done
      ? (done.won ? 'claimed today' : `today: deck ${done.deck}`)
      : prettyDate(today()).replace(/ \d{4}$/, '');
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
    // a slow orbit, held still for anyone who prefers less motion
    const a = (this.reducedMotion ? 0 : s.t * 0.06) + Math.PI * 0.25;
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
        if (act === 'new') { if (this.meta.inductionDone) this.goHeap(); else this.ui.show('first'); }
        else if (act === 'induction') this.startRun(null, { induction: true });
        else if (act === 'daily') this.startRun(null, { daily: today() });
        else if (act === 'archive') this.ui.archive(this.meta);
        else if (act === 'howto') this.showHowto();
        else if (act === 'settings') this.showSettings();
        break;
      case 'first':
        if (act === 'induction') this.startRun(null, { induction: true });
        else if (act === 'skip') { this.meta.inductionDone = true; saveMeta(this.meta); this.goHeap(); }
        else if (act === 'back') this.ui.show('title');
        break;
      case 'phone':
        if (act === 'anyway') this.toTitle();
        break;
      case 'kit':
        if (act === 'back') this.resume();
        else if (act === 'kit') this.startRun(el.dataset.id || null);
        break;
      case 'talk':
        // a press while a line is still typing finishes the line
        if (act !== 'back' && this.ui.finishTyping()) break;
        if (act === 'next') { this.ui.talkState.page++; this.ui.talkPage(); }
        else if (act === 'bench') this.showBench();
        else if (act === 'more') this.talkTo(this.talking, 'talk');
        else { this.talking = null; this.resume(); }
        break;
      case 'bench':
        if (act === 'buy') this.buyBench(el.dataset.id);
        else if (act === 'back') this.resume();
        break;
      case 'pause':
        if (act === 'resume' || act === 'back') this.resume();
        else if (act === 'loadout') this.ui.loadout(this.world.player, this.run.perks, this.playerPulsers());
        else if (act === 'howto') this.showHowto();
        else if (act === 'settings') this.showSettings();
        else if (act === 'abandon') { if (this.run.heap) this.toTitle(); else this.endRun(false, 'abandoned'); }
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
      case 'fab':
        if (act === 'buy') this.buyFab(el.dataset.id);
        else if (act === 'back') { this.fab = null; this.resume(); }
        break;
      case 'end':
        if (act === 'copy') this.copyShare();
        else if (act === 'again') this.goHeap({ wake: true });
        else if (act === 'title' || act === 'back') this.toTitle();
        break;
      default: break;
    }
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'menu';
    const w = this.world;
    const heap = !!this.run.heap;
    document.getElementById('pause-info').textContent = heap ? 'The Heap. Take the chute when you\'re ready.' : `Deck ${this.run.deck}, ${w.deck.name}. ${Math.round(w.claim * 100)}% claimed.`;
    document.querySelector('#screen-pause [data-act=abandon]').textContent = heap ? 'Title screen' : 'Abandon run';
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
      check('damageNumbers', 'Damage numbers', 'Show how hard each hit landed.'),
      check('slowHack', 'Slower hacks', 'Hack timers run half as long again.'),
      check('wireHints', 'Wire hints', 'In a hack, colour each of your wires by where it lands: your colour, theirs, or grey for nowhere. Always on while you’re learning the parts.'),
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
        <dt><kbd>J</kbd> or <kbd>Z</kbd></dt><dd>Use your arm part (fire, discharge, pull). With the bumper, tap to jab or hold to wind up a shove.</dd>
        <dt><kbd>K</kbd> or <kbd>X</kbd></dt><dd>Use your drive part. Wheels swerve, thrusters dash, hover floats, treads stamp.</dd>
        <dt><kbd>L</kbd> or <kbd>C</kbd></dt><dd>Use your core part (shield, cloak, phase)</dd>
        <dt>${L('loadout')}</dt><dd>Parts and firmware</dd>
        <dt><kbd>+</kbd> <kbd>-</kbd></dt><dd>Zoom in and out</dd>
        <dt>${L('pause')}</dt><dd>Pause</dd>
      </dl><p>A gamepad works too: left stick moves, right stick aims, A grapple, X arm, B drive, Y core.</p></div>
      <div><h3>The idea</h3>
        <p>You are KLP-2, a small droid in a tower full of bigger ones. You can't win a straight fight, so you steal.</p>
        <p>Get close and grapple a droid to start a hack. Win, and you can take one of its parts. Every droid is built from the parts it carries: what you see on it is what you get.</p>
        <p>Each deck has a lift down, locked until you take its <b>◆ command droid</b>, by hack or by force.</p></div>
      <div><h3>The hack</h3>
        <p>Two sides of a circuit fight over the column of cells in the middle. Pick the side whose wires run cleaner, then fire pulses down your wires. A powered cell takes your colour. Own more cells when the timer ends and you win.</p>
        <p>The dots next to YOU are your pulses, one per shot, with the number left beside them. Theirs are on the other side.</p>
        <p>The bar across the top shows who owns more cells right now: get your colour past the middle mark. The fuse under it, and the clock, are the time left.</p>
        <p>Forks reach two cells. AND gates need two wires lit at once. Inverts paint their colour. Locks stay lit. ∞ wires cost nothing.</p>
        <p>The wire you've selected shows a faint trail in the colour it would paint. An invert's ring is split: in one colour, out the other.</p>
        <p>While you're learning, each wire's arrow is coloured by where it lands: your colour, theirs, or grey for nowhere. & means it needs a second wire. Turn on Wire hints in the settings to keep them.</p>
        <p>Your first hacks are small boards that bring in one part at a time.</p></div>
      <div><h3>Fighting</h3>
        <ul><li>A cyan bracket marks the droid your arm will hit. You fire at it whichever way you're rolling, so you can back off and shoot. On a gamepad the right stick picks.</li>
        <li>Hold the bumper to wind up a shove, and let go. Knock a droid off an edge for a ring-out, worth double scrap. Into a wall, it's slammed: hurt and stunned. Into another droid, both get it.</li>
        <li>A stunned droid takes double damage.</li>
        <li>Before a droid attacks it paints a warning on the floor. When the warning stops moving, get out of the way. On wheels, swerve: shots pass straight through you.</li>
        <li>The two marks on a droid's health bar are its dent points. Below each, it hacks back with one pulser fewer. A stunned one starts late.</li>
        <li>Destroy a droid and its parts are lost. Hack it and they're yours.</li>
        <li>A ! means a droid has seen you; a ? means it's given up looking. Two droids chatting are less watchful.</li></ul></div>
      <div><h3>Room prizes</h3>
        <p>Rooms with droids in them hold a prize in a cage: scrap, a repair kit, a parts cache or firmware. Deal with every droid from that room, by hack, wreck or turning, and the cage opens. The map shows each room's prize as a dot, hollow until it's open.</p></div>
      <div><h3>Bounties</h3>
        <p>One droid on each deck has a name, a brass shell and better parts than its class should allow. Take it down, by hack or by force, for scrap and a firmware chip.</p></div>
      <div><h3>KLP-1</h3>
        <p>Once you've been at it a while, the KLP before you starts turning up: thrusters, a laser, a shield, and a grudge. Beat it in a hack three times, across as many runs as it takes, and you can bring it home.</p></div>
      <div><h3>Your gang</h3>
        <p>After a won hack you can <b>turn</b> the droid instead of taking a part. It goes cyan, follows you, fights for you and rides the lift down with you. Up to three at a time.</p></div>
      <div><h3>Scrap</h3>
        <p>Wrecked droids burst into scrap, which KLP-2 picks up as it rolls past. Win a hack and you can strip the droid for scrap instead of taking a part.</p>
        <p>Spend it at a <b>fabricator</b>, near each deck's lift, where Ledger sells repairs, spot welds and spare cells (small boosts for this run), better grades of the parts you have, and firmware.</p>
        <p>Win a hack by four cells or more and it's a clean hack: take two parts.</p></div>
      <div><h3>Parts</h3>
        <p>Three sockets: drive, arm and core. Taking a part drops the old one at your feet, so you can swap back. A part's grade comes from the class of the droid you took it from.</p>
        <p>Sealed vaults need the right part: thrusters for a gap, treads for a heavy crate, phase for a field. The way down never does.</p></div>
      <div><h3>The Heap, and data</h3>
        <p>When KLP-2 is destroyed, its bits go up the scrap chute to the Heap, where Nan rebuilds it. Hacking things downloads <b>data</b>, which reaches her whatever happens to you. Spend it on her bench for small permanent upgrades. Scrap only lasts for the run.</p>
        <p>Nan keeps every part you've ever stolen: take one down the chute with you. Static talks to you on the radio between decks.</p>
        <p><b>Today's tower</b> is the same five decks for everyone, all day. Only your first go counts, and you get a line of squares to share.</p></div>`;
    this.ui.show('howto', { push: true });
  }

  // ------------------------------------------------------------------ runs
  // Down the chute: pick a part to take, if you've ever stolen one.
  newRun() {
    const stolen = STEALABLE.filter((id) => this.meta.stolen[id]);
    if (!stolen.length) { this.startRun(null); return; }
    const g = runStats(this.meta).kitGrade;
    this.state = 'menu';
    document.querySelector('#screen-kit .lede').textContent = `Nan keeps every part you've ever stolen. Take one down with you, at Mk ${roman(g)}, or go in with wheels and a bumper.`;
    document.getElementById('kit-cards').innerHTML = [
      `<button class="card" data-act="kit" data-id=""><span class="slot-tag">Nothing extra</span><span class="card-head">${iconSvg('wheels', 26)}Wheels and bumper</span><span class="line">The way KLP-2 left the factory.</span></button>`,
      ...stolen.map((id) => this.ui.moduleCard({ id, grade: g }, null, { act: 'kit' })),
    ].join('');
    this.ui.show('kit');
  }

  startRun(kit, opts = {}) {
    this.ui.hide();
    this.ui.clearRadio();
    // what Nan's bench gives you; today's tower is the same for everyone
    const st = runStats(this.meta, !!opts.daily);
    const mods = { drive: { id: 'wheels', grade: 1 }, arm: null, core: null };
    if (kit) mods[MODULES[kit].slot] = { id: kit, grade: st.kitGrade };
    this.run = {
      seed: opts.daily ? dailySeed(opts.daily) : randomSeed(), daily: opts.daily || null, deck: 1, mods,
      integrity: st.integrity, maxIntegrity: st.integrity, maxEnergy: st.energy, speed: st.speed, hackTime: st.hackTime, cradle: st.cradle,
      perks: [], lastGaspUsed: false, newStolen: [], scrap: st.scrap, fabPerks: 0, gang: [], welds: 0, cells: 0,
      stats: { hacked: 0, destroyed: 0, voided: 0, ringouts: 0, parts: 0, time: 0, reflects: 0, decks: 0, scrap: 0, data: 0 },
      induction: !!opts.induction, bounties: [],
    };
    // a different bounty name on every deck of the run
    this.run.bountyNames = makeRng(this.run.seed ^ 0x5bd1e995).shuffle(BOUNTY_NAMES.slice());
    // KLP-1 turns up on some runs, once you've been at it a while
    const m = this.meta;
    if (!opts.daily && !opts.induction && (m.runs || 0) >= 2 && !m.klp1Turned && (Math.random() < 0.6 || (!m.klp1Met && m.runs >= 3))) {
      this.run.klp1Deck = 2 + Math.floor(Math.random() * 4);
    }
    this.disposeTitleScene();
    this.loadDeck(1);
  }

  // KLP-1 drops into the room: the KLP before you, as a mini-boss.
  spawnKlp1(room) {
    const w = this.world, r = this.run, p = w.player;
    const at = w.freeSpotNear(new THREE.Vector3(room.cx + 0.5, p.pos.y, room.cz + 0.5), 1.2) || w.freeSpotNear(p.pos, 3);
    if (!at) return;
    r.klp1Seen = true;
    const cls = 300 + 110 * r.deck;
    const d = w.spawnDroid('klp1', cls, at.x, at.z, { accent: 0xff6a5a, look: { shape: 'player', shell: 0x6b7380, label: 'K-1' } });
    d.maxIntegrity *= 1.5; d.integrity = d.maxIntegrity;
    d.brain.target = p;
    const first = !this.meta.klp1Met;
    this.meta.klp1Met = (this.meta.klp1Met || 0) + 1;
    saveMeta(this.meta);
    if (r.deckStats) r.deckStats.klp1 = true;
    this.ui.banner('KLP-1', first ? 'The first of you' : `Meeting ${this.meta.klp1Met}`, 'rival');
    this.audio.play('spawn', { at: d.pos });
    w.fx.ring(d.pos, 0xff6a5a, 2.2, 0.7);
    setTimeout(() => { if (d.alive) this.speak(d, first ? 'SO NAN BUILT ANOTHER ONE.' : line('spot', 'klp1'), true); }, 900);
    this.ui.announce(first ? 'KLP-1 is here: the KLP before you.' : 'KLP-1 is back.');
    setTimeout(() => this.hintOnce('klp1', 'KLP-1: the KLP before you, with thrusters, a laser and a shield. Beat it in a hack and it might listen.', 8), 3400);
  }

  // A run-shaped stand-in for the time spent in the Heap.
  heapRun() {
    const st = runStats(this.meta);
    return {
      heap: true, seed: 1, deck: 0, mods: { drive: { id: 'wheels', grade: 1 }, arm: null, core: null },
      integrity: st.integrity, maxIntegrity: st.integrity, maxEnergy: st.energy, speed: st.speed, hackTime: st.hackTime, cradle: st.cradle,
      perks: [], newStolen: [], scrap: 0, fabPerks: 0, gang: [], welds: 0, cells: 0, bounties: [],
      stats: { hacked: 0, destroyed: 0, voided: 0, ringouts: 0, parts: 0, time: 0, reflects: 0, decks: 0, scrap: 0, data: 0 },
    };
  }

  // Up to the Heap, between runs. After a run, Nan has something to say.
  async goHeap(opts = {}) {
    this.ui.hide();
    this.ui.clearRadio();
    this.run = this.heapRun();
    this.disposeTitleScene();
    await this.loadDeck(0);
    const ctx = this.storyContext();
    const said = opts.wake ? pick('nan', 'wake', ctx) : hasNew('nan', 'hello', ctx) ? pick('nan', 'hello', ctx) : null;
    if (said) {
      saveMeta(this.meta);
      setTimeout(() => { if (this.state === 'play' && this.run && this.run.heap) this.talkTo(this.world.npcs.find((d) => d.npc.id === 'nan'), null, said); }, 700);
    }
  }

  // What the cast know when they choose what to say.
  storyContext(extra = {}) {
    const meta = this.meta;
    const c = cheapest(meta);
    return { meta, affordable: c != null && (meta.data || 0) >= c, ...extra };
  }

  async loadDeck(n) {
    this.state = 'transition';
    const fade = document.getElementById('fade');
    fade.classList.add('on');
    await sleep(this.world ? 650 : 350);
    // the run was saved on the way down; a fresh run must not inherit the last KLP-2
    this.disposeWorld();
    this.disposeTitleScene();
    this.fx.clear();
    this.slowT = 0; this.koStreak = 0; this.koLast = -99;
    const heap = n === 0;
    const seed = heap ? 1 : this.forceSeed != null ? this.forceSeed : this.run.seed + n * 7919;
    if (!heap) this.forceSeed = null;
    const induction = this.run.induction && n === 1;
    // today's tower must come out the same for everyone, whatever they carry
    const build = generateDeck(n, makeRng(seed), { heap, induction, playerMods: this.run.daily ? null : this.run.mods, bountyName: this.run.bountyNames && this.run.bountyNames[n - 1] });
    this.world = new World(this, build, this.run);
    const w = this.world;
    const centre = new THREE.Vector3(build.grid.w / 2, 0, build.grid.d / 2);
    this.env.setDeck(w.deck, centre);
    this.renderer.zoomTarget = 1; this.renderer.zoom = 1;
    this.renderer.follow(w.player.pos, 0, true);
    this.ui.setDeck(w.deck, n, !!this.run.daily);
    this.ui.el.hud.classList.toggle('in-heap', heap);
    this.ui.clearHint();
    this.ui.buildSockets(w.player);
    this.ui.setScrap(this.run.scrap);
    this.ui.setData(this.meta.data || 0);
    this.ui.showHud(true);
    this.audio.startMusic(w.deck.music);
    this.run.deckStats = { hacked: 0, ringouts: 0, bounty: null, t0: this.run.stats.time };
    let record = false;
    if (!heap) {
      this.run.stats.decks = Math.max(this.run.stats.decks, n);
      record = n > 1 && n > (this.meta.bestDeck || 0);
      this.meta.bestDeck = Math.max(this.meta.bestDeck || 0, n);
    }
    saveMeta(this.meta);
    fade.classList.remove('on');
    if (heap) this.ui.announce('The Heap. Nan, Static, the archive and the chute down into the tower.');
    else if (induction) this.ui.deckCard(w.deck, n, 'One thing at a time. Follow the signs on the floor.', 'THE INDUCTION');
    else {
      const mf = pick('mainframe', 'deck', this.storyContext({ deck: n }));
      this.ui.deckCard(w.deck, n, w.bounty ? `Bounty: ${w.bounty.bounty}, a ${FAMILIES[w.bounty.family].name} ${w.bounty.cls}` : '', this.run.daily ? `TODAY’S TOWER · ${n === 6 ? 'THE BOTTOM' : `DECK ${n} OF 5`}` : '', mf ? mf.pages[0] : '');
    }
    this.state = 'play';
    this.input.clear();
    if (record) setTimeout(() => this.addData(dataFor('record'), `New deepest deck: ${n}`), 1200);
    // Static, on the radio, once the deck card has gone
    if (!heap && !induction) setTimeout(() => this.radioLift(n, w), 3600);
    if (n === 6) setTimeout(() => this.hint('The Mainframe hides behind four relays. Hack each one to bring its shield down.', 8), 9000);
  }

  // Static's bit as a deck starts: a remark on the last one, what's on this
  // one, and who has a price on their head.
  radioLift(n, w) {
    if (this.world !== w || !this.run) return;
    const b = w.bounty;
    const ctx = this.storyContext({ deck: n, prev: this.run.prev || {}, bounty: b && b.alive && !b.bountyDone && b.team === 'h' ? this.bountyFacts(b) : null });
    const remark = n >= 2 && this.run.prev ? pick('static', 'remark', ctx) : null;
    const intro = n >= 2 ? pick('static', 'lift', ctx) : null;
    const wanted = ctx.bounty ? pick('static', 'bounty', ctx) : null;
    if (remark) this.ui.radio('static', remark.pages[0], 5);
    if (intro) this.ui.radio('static', intro.pages[0], 6);
    if (wanted) for (const page of wanted.pages) this.ui.radio('static', page, 6);
    saveMeta(this.meta);
  }

  // What Static can tell you about a bounty: its name, its family and the
  // best part it carries.
  bountyFacts(b) {
    const m = b.mods.arm && b.mods.arm.id !== 'ram' ? b.mods.arm : b.mods.core || (b.mods.drive.id !== 'wheels' ? b.mods.drive : null);
    const name = m ? `Mk ${roman(m.grade)} ${MODULES[m.id].name.toLowerCase()}` : '';
    const part = !m ? 'better parts' : /s$/.test(MODULES[m.id].name) ? name : `a ${name}`;
    return { name: b.bounty, family: b.family, familyName: FAMILIES[b.family].name, part };
  }

  saveRunFromPlayer() {
    const p = this.world && this.world.player;
    if (!p || !this.run) return;
    this.run.integrity = Math.max(1, p.integrity);
    this.run.mods = { drive: p.mods.drive, arm: p.mods.arm, core: p.mods.core };
    // the gang rides down too
    this.run.gang = this.world.allies().map((d) => ({ family: d.family, cls: d.cls, command: d.command, bounty: d.bounty, hp: d.integrity / d.maxIntegrity }));
  }

  disposeWorld() {
    this.convo = null;
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
    // a tap shorter than a frame still counts
    p.intent.arm = inp.held('arm') || inp.hit('arm');
    p.intent.drive = inp.held('drive') || inp.hit('drive');
    p.intent.core = inp.held('core') || inp.hit('core');
    if (p.modId('arm') !== 'tractor') p.intent.aim = null;
    // the right stick aims, and the lock-on follows it
    const a = inp.aim();
    const aim = a ? this.renderer.screenToWorld(a.x, a.y) : null;
    w.lock.aim = aim;
    if (aim && p.modId('arm') !== 'tractor') p.intent.aim = aim;
    if (inp.hit('grapple')) this.interact();
    if (inp.hit('zoomIn') || inp.hit('zoomOut')) {
      const z = Math.max(0.7, Math.min(1.4, (this.settings.zoom || 1) * (inp.hit('zoomIn') ? 0.9 : 1.1)));
      this.settings.zoom = Math.round(z * 100) / 100;
      this.saveSettings();
    }
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
    if (it.kind === 'fabricator') {
      this.ui.setPrompt(`${key}Use the fabricator<span class="sub">${this.run.scrap} scrap</span>`);
      return;
    }
    if (it.kind === 'talk') {
      const who = it.target.npc;
      const sub = who.id === 'nan' ? `${this.meta.data || 0} data for the bench` : '';
      this.ui.setPrompt(`${key}Talk to ${who.name}${sub ? `<span class="sub">${sub}</span>` : ''}`);
      return;
    }
    if (it.kind === 'chute') { this.ui.setPrompt(`${key}Take the chute<span class="sub">down into the tower</span>`); return; }
    if (it.kind === 'reader') { this.ui.setPrompt(`${key}Read the droid archive`); return; }
    if (it.kind === 'pickup') {
      const k = it.target;
      if (k.what.type === 'module') this.ui.setPrompt(`${key}Take ${moduleLabel(k.what.mod)}`);
      else this.ui.setPrompt(`${key}Open ${k.label().toLowerCase()}`);
      return;
    }
    const t = it.target;
    let name, sub = '';
    if (t.kind === 'droid') {
      name = t.family === 'klp1' ? 'KLP-1' : `${FAMILIES[t.family].name} ${t.cls}`;
      const p = this.world.player;
      const hurt = 1 - t.integrity / t.maxIntegrity;
      const dent = hurt > 0.66 ? 2 : hurt > 0.33 ? 1 : 0;
      const easier = [dent ? `${dent} pulser${dent > 1 ? 's' : ''} down` : '', t.stunned ? 'starts late' : ''].filter(Boolean).join(', ');
      if (t.shielding && t.inFront({ x: t.pos.x - p.pos.x, z: t.pos.z - p.pos.z }, t.stats.core.arc)) sub = 'its shield is up';
      else if (easier) sub = `${t.stunned ? 'stunned' : 'dented'}: ${easier}`;
      if (p.cloaked) sub = 'ambush from cloak';
    } else if (t.kind === 'mainframe') {
      name = 'the Mainframe';
      if (!t.canHack()) sub = 'shielded: take down its relays first';
    }
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
    if (it.kind === 'fabricator') { this.openFab(it.target); return; }
    if (it.kind === 'talk') { this.talkTo(it.target, 'talk'); return; }
    if (it.kind === 'chute') { this.audio.play('descend'); this.newRun(); return; }
    if (it.kind === 'reader') { this.state = 'menu'; this.ui.setPrompt(null); this.ui.archive(this.meta); return; }
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
    // a shove being wound up is dropped, not let loose after the hack
    if (p.mod.arm) p.mod.arm.charging = false;
    p.charge = 0;
    w.lock.hide();
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
    const k = Math.min(1, g.t / 0.18);
    const end = from.clone().lerp(to, k);
    if (g.rib) w.fx.removeRibbon(g.rib);
    g.rib = w.fx.ribbon([from, end], PLAYER_COLOUR, 0.06, 1, { persist: true, bright: 2.5 });
    if (k >= 1 && !g.sparked) { g.sparked = true; w.fx.burst(to, PLAYER_COLOUR, 16, 2, 0.4, 0.1, 0); this.renderer.flash(PLAYER_HEX, 0.15); }
    p.syncModel(dt);
    if (t.syncModel) t.syncModel(dt);
    if (g.t > 0.32) {
      if (g.rib) w.fx.removeRibbon(g.rib);
      this.startHack(t, { ambush: g.ambush });
    }
  }

  startHack(target, opts = {}) {
    const spec = this.world.hackSpecFor(target);
    // until you've won a board of each kind, hacks are lessons
    const i = this.meta.lesson || 0;
    const lesson = LESSONS[i] || null;
    this.session = new HackSession(this, target, spec, { ...opts, lesson, lessonIndex: i });
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
    this.meta.hacks = (this.meta.hacks || 0) + 1;
    if (session.lesson) {
      this.meta.lessonSeen = session.opts.lessonIndex;
      if (won) this.meta.lesson = session.opts.lessonIndex + 1;
    }
    if (session.sawHidden) this.meta.seenHidden = true;
    saveMeta(this.meta);
    this.state = 'play';
    this.input.clear();
    if (won) {
      this.renderer.flash(PLAYER_HEX, 0.35);
      this.input.rumble(0.4, 220);
      const from = t.pos.clone(); from.y += t.kind === 'droid' ? 0.5 * t.scale : 0.7;
      const to = p.pos.clone(); to.y += 0.45;
      w.fx.stream(from, to, PLAYER_COLOUR, 46);
      const heal = (t.kind === 'droid' ? 0.12 : 0.04) + (this.hasPerk('siphon') ? 0.25 : 0);
      p.integrity = Math.min(p.maxIntegrity, p.integrity + p.maxIntegrity * heal);
      p.energy = p.maxEnergy;
      if (t.kind === 'droid') {
        this.stat('hacked');
        if (this.run.deckStats) this.run.deckStats.hacked++;
        // the first of a family you've ever hacked is worth extra to Nan
        const newFamily = !(this.meta.archive[t.family] && this.meta.archive[t.family].hacked);
        this.archiveSee(t, 'hacked');
        this.addData(dataFor('droid', t.cls) + (newFamily ? dataFor('family') : 0), newFamily ? `New in the archive: ${FAMILIES[t.family].name}` : '');
        if (t.bounty) this.bountyClaimed(t, 'hacked');
        const offers = [];
        for (const s of SLOTS) {
          const m = t.mods[s];
          if (m && !MODULES[m.id].starter) offers.push({ id: m.id, grade: m.grade });
        }
        this.powerDown(t);
        this.say(t, 'beaten', true);
        if (t.family === 'klp1') { this.meta.klp1Wins = (this.meta.klp1Wins || 0) + 1; this.addData(4, 'KLP-1 hacked'); saveMeta(this.meta); }
        // win by four or more and it's a clean hack: two parts, or a bonus
        const clean = session.roundsTotal === 1 && session.margin >= 4;
        if (clean && offers.length < 2) {
          w.scrap.burst(t.pos, scrapFor(t.cls), { pull: 2 });
          this.toast('Clean hack. Bonus scrap.');
        }
        this.offerState = { kind: 'salvage', offers, target: t, picks: clean && offers.length >= 2 ? 2 : 1, taken: 0, strip: scrapFor(t.cls) + 2 };
        this.showSalvage();
        this.state = 'menu';
      } else {
        t.onHackWin();
        this.addData(dataFor(t.kind === 'archive' ? 'archive' : 'device'));
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
        t.model.cheer();
        this.toast('Rejected. Feedback surge.');
        setTimeout(() => this.say(t, 'rejected', true), 250);
      } else {
        t.onHackLose();
        p.knock(0, 0, 0.4);
      }
    }
    this.ui.refreshSockets(p);
  }

  showSalvage() {
    const o = this.offerState, t = o.target, p = this.world.player;
    const name = t.family === 'klp1' ? 'KLP-1' : `${FAMILIES[t.family].name} ${t.cls}`;
    let title, lede;
    if (o.taken) {
      title = 'One more part';
      lede = 'A clean hack: take a second part, or stop there.';
    } else {
      title = o.picks > 1 ? `Clean hack. ${name} is yours` : `${name} is yours`;
      const first = !Object.keys(this.meta.stolen || {}).length;
      if (!o.offers.length) lede = 'Nothing worth fitting. Turn it to your side, or strip it for scrap.';
      else if (o.picks > 1) lede = 'You won by four cells or more, so take two parts. Or turn it, or strip it for scrap.';
      else if (first) lede = 'Take a part: it goes in the matching socket, and anything it replaces drops at your feet. Or turn the droid to your side, or strip it for scrap.';
      else lede = 'Take a part, turn it to your side, or strip it for scrap.';
      if (t.family === 'klp1') lede = 'Beaten, for now. Take one of its parts, or strip it for scrap. It won\'t join a gang.';
    }
    const cards = o.offers.map((m) => this.ui.moduleCard(m, p.mods[MODULES[m.id].slot]));
    if (!o.taken) cards.push(t.family === 'klp1' ? this.ui.homeCard(this.meta.klp1Wins || 0, 3) : this.ui.turnCard(t, this.world.allies(), GANG_MAX));
    this.ui.offer({
      title, lede, cards,
      extra: o.taken ? '<button data-act="leave">Done</button>' : `<button data-act="strip">Strip it for ${o.strip} scrap</button>`,
    });
  }

  // A hacked droid comes back on, cyan, and joins KLP-2's gang.
  turnDroid(d) {
    const w = this.world;
    const gang = w.allies();
    if (gang.length >= GANG_MAX) {
      // the weakest goes home to make room
      const weak = gang.sort((a, b) => a.cls - b.cls)[0];
      w.fx.burst(weak.pos.clone().setY(weak.pos.y + 0.4), PLAYER_COLOUR, 20, 2, 0.6, 0.1, -1);
      w.removeDroid(weak);
      weak.alive = false;
      this.toast(`${FAMILIES[weak.family].name} ${weak.cls} goes home.`);
    }
    d.state = 'active';
    d.alive = true;
    d.solid = true;
    d.team = 'k';
    d.downT = 0;
    d.vel.x = d.vel.z = 0;
    d.integrity = Math.max(d.integrity, d.maxIntegrity * 0.6);
    d.model.body.rotation.x = 0;
    d.setAccent(PLAYER_COLOUR);
    d.brain = new Brain(d, w);
    d.brain.state = 'follow';
    d.lastHit = null;
    w.fx.ring(d.pos, PLAYER_COLOUR, 1.4, 0.5);
    w.fx.burst(d.pos.clone().setY(d.pos.y + 0.5), PLAYER_COLOUR, 24, 2.5, 0.6, 0.1, 1);
    this.audio.play('turn', { at: d.pos });
    this.run.stats.turned = (this.run.stats.turned || 0) + 1;
    this.toast(`${FAMILIES[d.family].name} ${d.cls} joins your gang.`);
    setTimeout(() => this.say(d, 'turned', true), 600);
    this.hintOnce('gang', 'Your gang follows you, fights for you and rides the lift with you. Up to three at a time.', 7);
  }

  allyLost(d, how) {
    this.toast(how === 'void' ? `${FAMILIES[d.family].name} ${d.cls} fell into the void.` : `${FAMILIES[d.family].name} ${d.cls} was wrecked.`);
    this.audio.play('allyLost', { at: d.pos });
  }

  powerDown(d) {
    d.releaseParts();
    for (const o of this.world.droids) if (o.mod.arm.target === d) o.releaseParts();
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
    } else if (what.type === 'bale') {
      const n = 6 + 3 * Math.min(5, this.run.deck);
      w.removePickup(k);
      w.scrap.burst(k.pos, n, { pull: 3, speed: 1.6 });
      this.audio.play('crate', { at: k.pos });
      this.toast(`Scrap bale: ${n} scrap`);
    } else if (what.type === 'kit') {
      const p = w.player;
      w.removePickup(k);
      p.integrity = Math.min(p.maxIntegrity, p.integrity + p.maxIntegrity * 0.3);
      w.fx.burst(p.pos.clone().setY(p.pos.y + 0.5), PLAYER_COLOUR, 20, 2, 0.8, 0.12, -1);
      this.audio.play('repair', { at: p.pos });
      this.toast('Repair kit: patched up');
    }
  }

  // A room's droids are all dealt with: its prize comes out of the cage.
  prizeUnlocked(room, k) {
    const w = this.world;
    const at = k.pos.clone(); at.y += 0.6;
    w.fx.ring(k.pos.clone().setY(k.y), PLAYER_COLOUR, 1.6, 0.6);
    w.fx.burst(at, PLAYER_COLOUR, 22, 2.4, 0.7, 0.1, -1);
    this.word(at, 'ROOM CLEAR', 'clear');
    this.audio.play('prize', { at: k.pos });
    this.ui.announce(`Room clear. ${k.label()} unlocked.`);
    this.hintOnce('prize', `Room clear. Its prize is out of the cage: roll over to the ${k.label().toLowerCase()} and press <b>${this.input.label('grapple')}</b>.`, 7);
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
      title: source === 'archive' ? 'Archive unlocked' : source === 'claim' ? 'Deck claimed' : source === 'fab' ? 'Fabricator' : 'Firmware chip',
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
      if (o.kind === 'salvage') {
        o.taken += 1;
        o.offers = o.offers.filter((m) => m.id !== el.dataset.id);
        if (o.taken < o.picks && o.offers.length) { this.showSalvage(); return; }
      }
    } else if (act === 'perk') {
      this.addPerk(el.dataset.id);
      if (o.pickup) this.world.removePickup(o.pickup);
    } else if (act === 'notyet') {
      return;
    } else if (act === 'home') {
      // up the chute it goes, to Nan
      const t = o.target;
      this.meta.klp1Turned = true;
      saveMeta(this.meta);
      this.world.fx.burst(t.pos.clone().setY(t.pos.y + 0.5), 0xff6a5a, 30, 3, 1, 0.12, -2);
      t.downT = Math.max(t.downT || 0, 3.2);
      this.ui.banner('KLP-1 goes home', 'Up the chute, to the Heap', 'rival');
      this.audio.play('turn', { at: t.pos });
      this.ui.announce('KLP-1 has gone up the chute to the Heap. It won\'t come for you again.');
    } else if (act === 'turn') {
      this.turnDroid(o.target);
    } else if (act === 'strip') {
      const t = o.target;
      this.world.scrap.burst(t.pos, o.strip, { pull: 2 });
      this.world.fx.burst(t.pos.clone().setY(t.pos.y + 0.4), 0xffe2a8, 18, 3, 0.5, 0.1, 4);
      this.audio.play('crate', { at: t.pos });
      t.downT = Math.max(t.downT || 0, 3.2);
    } else if (act === 'back' && (o.kind === 'perk' || (o.kind === 'salvage' && !o.taken))) {
      return; // a choice that can't be skipped by accident
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

  // ------------------------------------------------------------------ scrap and the fabricator
  addScrap(n, chain = 0, quiet = false) {
    if (!this.run) return;
    this.run.scrap += n;
    this.run.stats.scrap += n;
    if (!quiet) this.audio.play('scrap', { pitch: 1 + Math.min(chain, 16) * 0.045 });
    this.ui.setScrap(this.run.scrap, true);
  }

  ringOut(d, by) {
    const now = this.world.time;
    this.koStreak = now - (this.koLast ?? -99) < 6 ? (this.koStreak || 1) + 1 : 1;
    this.koLast = now;
    this.run.stats.ringouts += 1;
    if (this.run.deckStats) this.run.deckStats.ringouts++;
    const n = scrapFor(d.cls) * 2;
    const word = ['', '', 'Double', 'Triple', 'Quadruple'][this.koStreak] || `${this.koStreak} in a row:`;
    const title = this.koStreak > 1 ? `${word} ring out` : 'Ring out';
    const who = by.isPlayer ? '' : by.family ? ` · ${FAMILIES[by.family].name} did it` : ' · your turret did it';
    this.ui.banner(title, `+${n} scrap${who}`);
    this.say(d, 'fall', true);
    this.slowT = this.reducedMotion ? 0.3 : 0.75;
    this.audio.play('ringout');
    this.input.rumble(0.6, 220);
    this.renderer.flash('#ffffff', 0.18);
    this.ui.announce(`${title}. ${FAMILIES[d.family].name} ${d.cls} knocked into the void. ${n} scrap.`);
  }

  // The bounty comes into view: a gold banner, a column of light over it,
  // and its room marked on the map.
  bountySpotted(b) {
    b.spotted = true;
    const w = this.world;
    const name = `${FAMILIES[b.family].name} ${b.cls}`;
    this.ui.banner('Bounty spotted', `${b.bounty}, ${name} · better parts, scrap and a firmware chip`, 'gold');
    this.audio.play('bounty');
    w.bountyBeamT = 2.6;
    w.fx.ring(b.pos, 0xffc24a, 2.6, 0.9);
    w.fx.burst(b.pos.clone().setY(b.pos.y + 0.6), 0xffc24a, 24, 2.5, 0.8, 0.12, -1);
    this.input.rumble(0.3, 120);
    const el = this.ui.el.bounty;
    el.classList.remove('spotted'); void el.offsetWidth; el.classList.add('spotted');
    this.ui.announce(`Bounty spotted: ${b.bounty}, a ${name}. It carries better parts. Hack it or wreck it for scrap and a firmware chip.`);
    // the tip waits for the banner to clear
    setTimeout(() => {
      if (this.state === 'play' && this.world === w) this.hintOnce('bounty', 'A bounty: the droid in the gold ring. Its parts are two grades better than its class. Hack it to take one, or wreck it.', 7);
    }, 3200);
  }

  // A bounty is down: scrap, a firmware chip, and a cheer.
  bountyClaimed(d, how) {
    if (d.bountyDone) return;
    d.bountyDone = true;
    const w = this.world, p = w.player;
    const n = 10 + 3 * Math.min(5, this.run.deck);
    this.addScrap(n, 0, true);
    this.run.stats.bounties = (this.run.stats.bounties || 0) + 1;
    this.run.bounties.push(d.bounty);
    if (this.run.deckStats) this.run.deckStats.bounty = d.bounty;
    this.addData(dataFor('bounty'));
    const at = w.freeSpotNear(p.pos, 1.1) || p.pos.clone();
    const x = Math.floor(at.x), z = Math.floor(at.z);
    const chip = new Pickup(w, { t: '$', x, z, h: w.grid.hAt(x, z), room: -1, ch: '' }, { type: 'chip' });
    chip.pos.set(at.x, at.y + 0.45, at.z);
    w.pickups.push(chip);
    setTimeout(() => {
      this.ui.banner('Bounty claimed', `${d.bounty} · +${n} scrap and a firmware chip`, 'gold');
      this.audio.play('unlock');
    }, how === 'hacked' ? 0 : 500);
    this.ui.announce(`Bounty claimed: ${d.bounty}. ${n} scrap, and a firmware chip by your side.`);
  }

  // Ledger runs every fabricator, through its screen.
  openFab(f) {
    this.state = 'menu';
    this.fab = f;
    this.ui.setPrompt(null);
    const p = this.world.player;
    const items = this.fabItems().filter((i) => i.ok);
    const broke = items.length && Math.min(...items.map((i) => i.cost)) > this.run.scrap;
    const said = pick('ledger', broke ? 'broke' : 'open', this.storyContext({ scrap: this.run.scrap, hurt: p.integrity < p.maxIntegrity * 0.5 }));
    saveMeta(this.meta);
    this.showFab(null, said ? said.pages[0] : '');
    this.ui.announce(`Fabricator. Ledger says: ${said ? said.pages[0] : ''} You have ${this.run.scrap} scrap.`);
    this.hintOnce('fab', 'Scrap comes from wrecked droids. Knock one into the void and you get double.', 7);
  }

  fabItems() {
    const r = this.run, p = this.world.player;
    const deck = Math.min(5, r.deck);
    const items = [];
    const missing = p.maxIntegrity - p.integrity;
    const fix = Math.round(Math.min(missing, p.maxIntegrity * 0.3));
    const now = Math.ceil(p.integrity);
    items.push({ id: 'repair', name: 'Repair', line: missing > 0.5 ? `Patch up ${fix} integrity: ${now} → ${Math.min(Math.round(p.maxIntegrity), now + fix)}.` : 'You’re in one piece.', cost: 4 + 2 * deck, ok: missing > 0.5 });
    // small, cheap notches for this run only
    items.push({ id: 'weld', name: 'Spot weld', line: r.welds < 6 ? `+5 maximum integrity for this run: ${Math.round(p.maxIntegrity)} → ${Math.round(p.maxIntegrity) + 5}.` : 'No room for more welds.', cost: 5 + 2 * r.welds, ok: r.welds < 6 });
    items.push({ id: 'cell', name: 'Spare cell', line: r.cells < 6 ? `+5 maximum energy for this run: ${Math.round(p.maxEnergy)} → ${Math.round(p.maxEnergy) + 5}.` : 'No room for more cells.', cost: 5 + 2 * r.cells, ok: r.cells < 6 });
    for (const slot of SLOTS) {
      const m = p.mods[slot];
      if (!m || MODULES[m.id].starter) continue;
      items.push({
        id: `up-${slot}`, name: `Upgrade ${MODULES[m.id].name}`, icon: m.id,
        line: m.grade < 9 ? `Mk ${roman(m.grade)} → Mk ${roman(m.grade + 1)}: ${statDiff(m)}.` : 'Already Mk IX, as good as it gets.',
        cost: 8 + 3 * m.grade, ok: m.grade < 9,
      });
    }
    const gang = this.world.allies();
    if (gang.length) {
      const hurt = gang.filter((d) => d.integrity < d.maxIntegrity - 0.5).length;
      items.push({ id: 'gang', name: 'Patch up the gang', line: hurt ? `Repair all ${gang.length === 1 ? 'of your gang' : `${gang.length} of your gang`} in full.` : 'Your gang is in one piece.', cost: 4 + 2 * gang.length, ok: hurt > 0 });
    }
    const left = PERK_IDS.filter((id) => !r.perks.includes(id)).length;
    items.push({ id: 'firmware', name: 'Firmware', line: left ? 'Pick one of three upgrades for the rest of the run.' : 'Nothing left to install.', cost: 24 + 12 * r.fabPerks, ok: left > 0 });
    return items;
  }

  showFab(focus, line = null) {
    this.ui.fab(this.fabItems(), this.run.scrap, focus, line);
  }

  buyFab(id) {
    const r = this.run, p = this.world.player;
    const item = this.fabItems().find((i) => i.id === id);
    if (!item || !item.ok || item.cost > r.scrap) { this.audio.play('empty'); return; }
    r.scrap -= item.cost;
    this.ui.setScrap(r.scrap);
    this.audio.play('buy');
    setTimeout(() => this.ui.announce(`${r.scrap} scrap left.`), 600);
    if (id === 'repair') {
      p.integrity = Math.min(p.maxIntegrity, p.integrity + p.maxIntegrity * 0.3);
      this.world.fx.burst(p.pos.clone().setY(p.pos.y + 0.5), PLAYER_COLOUR, 20, 2, 0.8, 0.12, -1);
      this.toast('Repaired');
    } else if (id === 'weld') {
      r.welds += 1;
      p.maxIntegrity += 5; p.integrity += 5; r.maxIntegrity += 5;
      this.toast(`Spot weld: ${Math.round(p.maxIntegrity)} maximum integrity`);
    } else if (id === 'cell') {
      r.cells += 1;
      p.maxEnergy += 5; p.energy += 5; r.maxEnergy += 5;
      this.toast(`Spare cell: ${Math.round(p.maxEnergy)} maximum energy`);
    } else if (id === 'gang') {
      for (const d of this.world.allies()) {
        d.integrity = d.maxIntegrity;
        this.world.fx.burst(d.pos.clone().setY(d.pos.y + 0.5), PLAYER_COLOUR, 14, 2, 0.7, 0.1, -1);
      }
      this.toast('Gang repaired');
    } else if (id.startsWith('up-')) {
      const slot = id.slice(3);
      p.mods[slot] = { id: p.mods[slot].id, grade: p.mods[slot].grade + 1 };
      p.refresh();
      this.ui.refreshSockets(p);
      this.toast(`${moduleLabel(p.mods[slot])} fitted`);
    } else if (id === 'firmware') {
      r.fabPerks += 1;
      this.fab = null;
      this.offerFirmware('fab');
      return;
    }
    const said = pick('ledger', 'buy', this.storyContext());
    this.showFab(id, said ? said.pages[0] : null);
  }

  // ------------------------------------------------------------------ the cast
  // Talk to someone in the Heap. `said` is a line already chosen.
  talkTo(d, on = 'talk', said = null) {
    if (!d) return;
    const who = d.npc.id;
    const line = said || pick(who, on, this.storyContext()) || { who, pages: ['...'] };
    saveMeta(this.meta);
    this.talking = d;
    this.state = 'menu';
    this.ui.setPrompt(null);
    d.facing = Math.atan2(this.world.player.pos.x - d.pos.x, this.world.player.pos.z - d.pos.z);
    const options = who === 'nan'
      ? [{ act: 'bench', label: 'The bench (upgrades)' }, { act: 'more', label: 'Anything else?' }, { act: 'close', label: 'Bye' }]
      : [{ act: 'more', label: 'Anything else?' }, { act: 'close', label: 'Bye' }];
    this.ui.talk({ who, pages: line.pages, options });
  }

  showBench(focus, said) {
    const line = said || pick('nan', 'bench', this.storyContext());
    this.state = 'menu';
    this.ui.bench(this.meta, line ? line.pages[0] : '', focus);
  }

  buyBench(id) {
    const b = BENCH.find((x) => x.id === id);
    const cost = b && nextCost(this.meta, b);
    if (cost == null || cost > (this.meta.data || 0)) {
      this.audio.play('empty');
      this.showBench(id, pick('nan', 'broke', this.storyContext()));
      return;
    }
    this.meta.data -= cost;
    this.meta.bench = this.meta.bench || {};
    this.meta.bench[id] = rank(this.meta, id) + 1;
    saveMeta(this.meta);
    this.audio.play('buy');
    this.ui.setData(this.meta.data, true);
    // the next run starts with it; KLP-2 in the Heap gets it now too
    if (this.run && this.run.heap && this.world) {
      const st = runStats(this.meta), p = this.world.player;
      p.maxIntegrity = st.integrity; p.integrity = st.integrity;
      p.maxEnergy = st.energy; p.energy = st.energy;
      p.speedBonus = st.speed;
    }
    this.ui.announce(`${b.name} fitted. ${this.meta.data} data left.`);
    this.showBench(id, pick('nan', 'bought', this.storyContext()));
  }

  // Data comes up the chute to Nan whatever happens to KLP-2.
  addData(n, why = '') {
    if (!n || !this.run) return;
    this.meta.data = (this.meta.data || 0) + n;
    this.meta.dataTotal = (this.meta.dataTotal || 0) + n;
    this.run.stats.data = (this.run.stats.data || 0) + n;
    saveMeta(this.meta);
    this.ui.setData(this.meta.data, true);
    const p = this.world && this.world.player;
    if (p) this.word(p.pos.clone().setY(p.pos.y + p.model.height + 0.55), `+${n} DATA`, 'data');
    if (why) this.toast(`${why}: +${n} data`);
  }

  // ------------------------------------------------------------------ chatter
  say(d, kind, force = false) {
    if (!d || !d.alive && kind !== 'fall' && kind !== 'beaten') return false;
    // bounties and command droids speak for their office, not their family
    const own = kind === 'bounty' || kind === 'command' ? null : d.family;
    const text = line(kind, own).replace('{N}', (d.bounty || '').toUpperCase());
    return this.speak(d, text, force);
  }

  speak(d, text, force = false) {
    if (!this.ui.say(d, text, force)) return false;
    // whispers are quiet; big droids are low
    this.audio.play('chirp', { at: d.pos, pitch: 1.25 / (d.scale || 1), soft: d.family === 'phantom' });
    return true;
  }

  // ------------------------------------------------------------------ hit feedback
  // Numbers off every hit, a word for the big ones, and a beat's pause.
  hitFeedback(d, amount, src) {
    if (amount < 0.5 || !this.world) return;
    const at = d.pos.clone(); at.y += d.model.height + 0.1;
    if (d.isPlayer) {
      if (this.settings.damageNumbers && amount >= 1) this.ui.pop(at, `-${Math.round(amount)}`, 'hurt');
      return;
    }
    if (!src.by || src.by.team !== 'k' || d.team === 'k') return;
    const mine = src.by.isPlayer;
    if (this.settings.damageNumbers) this.ui.pop(at, src.crit ? `${Math.round(amount)}!` : String(Math.round(amount)), src.crit ? 'crit' : mine ? '' : 'ally');
    if (src.crit) {
      this.audio.play('crit', { at: d.pos });
      this.world.fx.burst(at, 0xffd25a, 12, 2.6, 0.35, 0.1, 3);
      this.hintOnce('crit', 'A stunned droid takes double damage. Stun it, slam it into a wall, then hit it.', 7);
    }
    if (mine) {
      const stop = src.kind === 'arc' ? 0.035 : src.kind === 'bolt' ? 0.02 : 0;
      if (stop) this.hitStop = Math.max(this.hitStop || 0, stop + (src.crit ? 0.025 : 0));
    }
    // a dent costs it a pulser in the hack: say so when it happens
    if (d.kind === 'droid' && d.alive) {
      const hurt = 1 - d.integrity / d.maxIntegrity;
      const dent = hurt > 0.66 ? 2 : hurt > 0.33 ? 1 : 0;
      if (dent > (d.dentShown || 0) && d.integrity > 0) {
        d.dentShown = dent;
        const up = at.clone(); up.y += 0.35;
        // a second dent straight after the first replaces its word
        if (d.dentPop) this.ui.unpop(d.dentPop);
        d.dentPop = this.word(up, dent === 2 ? 'DENTED −2' : 'DENTED −1', 'dent');
        this.audio.play('dent', { at: d.pos });
        this.hintOnce('dent', 'Dented: it hacks back with a pulser fewer. Dent it twice and it\'s two.', 6);
      }
    }
  }

  word(at, text, kind = '') { return this.ui.pop(at, text, `word ${kind}`); }

  dodged(p) {
    this.word(p.pos.clone().setY(p.pos.y + p.model.height + 0.2), 'DODGE', 'dodge');
    this.audio.play('dodge', { at: p.pos });
  }

  onSpotted(d) {
    if (d.team === 'h') this.ui.emote(d, '!', 'alert');
    if (this.convo && this.convo.who.includes(d)) this.convo = null;
    if (d.bounty) { this.say(d, 'bounty', true); return; }
    if (d.family === 'mite') { this.audio.play('squeak', { at: d.pos }); this.say(d, 'spot', true); return; }
    if (d.command) { this.say(d, 'command'); return; }
    if (Math.random() < 0.55) this.say(d, 'spot');
  }

  // lost sight of you and gave up looking
  onLost(d) {
    this.ui.emote(d, '?', 'puzzled');
    if (Math.random() < 0.35) this.say(d, 'lost');
  }

  onFlee(d) { if (Math.random() < 0.6) this.say(d, 'flee'); }

  // about to attack: sometimes it says so, which is another warning
  onWindup(d) { if (Math.random() < 0.3) this.say(d, 'windup'); }

  onDozing(d) { this.ui.emote(d, 'z', 'dozing'); }

  onDroidHurt(d, src) {
    if (d.team === 'k') { if (Math.random() < 0.2) this.say(d, 'allyHit'); return; }
    if (d.family === 'mite') this.audio.play('squeak', { at: d.pos });
    if (!d.saidLow && d.integrity > 0 && d.integrity < d.maxIntegrity * 0.3) { d.saidLow = true; this.say(d, 'low', true); return; }
    if (src.by && src.by.team === 'k' && Math.random() < 0.3) this.say(d, 'hit');
  }

  // now and then, one of the gang passes a remark
  chatter(dt) {
    const w = this.world;
    this.updateConvo(dt);
    // in the Heap, a resident with something new to say shows it
    if (w.npcs.length) {
      this.npcT = (this.npcT ?? 1) - dt;
      if (this.npcT <= 0) {
        this.npcT = 3.5;
        const ctx = this.storyContext();
        for (const d of w.npcs) if (hasNew(d.npc.id, 'talk', ctx) || (d.npc.id === 'nan' && ctx.affordable)) this.ui.emote(d, '…', 'talky');
      }
    }
    this.chatT = (this.chatT ?? 20) - dt;
    if (this.chatT > 0) return;
    this.chatT = 18 + Math.random() * 16;
    const gang = w.allies().filter((d) => d.brain && d.brain.state === 'follow');
    if (gang.length && !w.droids.some((d) => d.team === 'h' && d.brain && d.brain.state === 'chase')) this.say(gang[Math.floor(Math.random() * gang.length)], 'gangIdle');
  }

  // Two of the tower's droids talking shop, before they've noticed you.
  // While they talk they're a little less watchful.
  overhear(room) {
    const w = this.world, p = w.player;
    if (this.convo || !this.run || Math.random() > 0.7) return;
    const near = w.droids.filter((d) => d.team === 'h' && d.room === room.index && d.alive && d.state === 'active' && !d.cloaked && d.brain && d.brain.state === 'patrol' && d.pos.distanceTo(p.pos) < 13);
    if (near.length < 2) return;
    this.run.heard = this.run.heard || [];
    const pool = CHATS.filter((c, i) => (!c.when || c.when(this.meta)) && !this.run.heard.includes(i));
    if (!pool.length) return;
    const c = pool[Math.floor(Math.random() * pool.length)];
    this.run.heard.push(CHATS.indexOf(c));
    near.sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos));
    this.convo = { who: [near[0], near[1]], lines: c.lines, i: 0, t: 1.2 };
    for (const d of this.convo.who) d.chatting = true;
  }

  updateConvo(dt) {
    const c = this.convo;
    if (!c) return;
    const over = c.i >= c.lines.length || c.who.some((o) => !o.alive || o.state !== 'active' || !o.brain || o.brain.state !== 'patrol');
    if (over) {
      for (const d of c.who) d.chatting = false;
      this.convo = null;
      return;
    }
    c.t -= dt;
    if (c.t > 0) return;
    const text = c.lines[c.i].replace('{DECK}', String(Math.max(2, this.meta.bestDeck || 2)));
    this.speak(c.who[c.i % 2], text, true);
    c.i += 1;
    c.t = 1.4 + text.length * 0.05;
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
    this.input.rumble(Math.min(1, 0.25 + amount / 30), 140);
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
    this.addData(dataFor('claim'));
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
    if (this.run && this.run.klp1Deck === this.run.deck && !this.run.klp1Seen && room.role === 'combat') this.spawnKlp1(room);
    else if (!room.signs && room.role !== 'start') this.overhear(room);
    if (room.signs) {
      // read the floor signs out, with the right keys in
      const keys = (t) => t.replace(/\{(\w+)\}/g, (m, k) => (k === 'move' ? (this.input.lastDevice === 'pad' ? 'Left stick' : 'WASD or the arrow keys') : this.input.label(k)));
      const said = room.signs.map((sg) => `${keys(sg.text)}${sg.sub ? `${/^[a-z]/.test(sg.sub) ? ' ' : '. '}${keys(sg.sub)}` : ''}.`).join(' ');
      // in 1986 mode the floor is too coarse to read, so put the words on screen too
      if (this.renderer.retro) this.ui.hint(said.replace(/[&<>"]/g, ''), 7);
      else this.ui.announce(said);
      return;
    }
    if (room.role === 'vault' && room.hint) this.hint(`A sealed vault. ${room.hint}`, 6);
    if (room.role === 'lift' && !this.world.clearance) this.hintOnce('lift', 'The lift is here, locked. The droid marked <b>◆</b> holds the clearance: hack it or destroy it.', 8);
    if (room.role === 'archive') this.hintOnce('archive', 'An archive terminal. Hack it to pick a firmware upgrade.', 6);
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
    if (this.run.deck === 1 && this.run.induction) { this.meta.inductionDone = true; saveMeta(this.meta); }
  }

  updateDescend(dt) {
    const w = this.world, p = w.player;
    if (this.descendT === 0) this.descendY = p.pos.y;
    this.descendT += dt;
    p.pos.y = this.descendY - 6 * this.descendT * this.descendT;
    p.syncModel(dt);
    w.lift.group.position.y = p.pos.y;
    if (this.descendT > 1.1 && this.state === 'descending') {
      this.state = 'transition';
      // how the deck went, for Static
      const ds = this.run.deckStats || {};
      this.run.prev = {
        hacked: ds.hacked || 0, ringouts: ds.ringouts || 0, bounty: ds.bounty, time: this.run.stats.time - (ds.t0 || 0),
        hurt: p.integrity < p.maxIntegrity * 0.35, gang: w.allies().length, claimed: !!w.fullyClaimed, klp1: !!ds.klp1,
      };
      this.run.deck += 1;
      this.saveRunFromPlayer();
      // the lift's cradle patches KLP-2 up on the way down
      this.run.integrity = Math.min(this.run.maxIntegrity, this.run.integrity + this.run.maxIntegrity * (this.run.cradle ?? 0.25));
      this.loadDeck(this.run.deck);
    }
  }

  playerDied(src = {}) {
    const w = this.world, p = w.player;
    // remember what did it, for Nan
    const by = src.by;
    this.run.diedTo = by ? (by.npc ? by.npc.id : by.family || by.kind || 'droid') : src.kind || 'unknown';
    if (this.state === 'won' || this.state === 'end') { p.integrity = 1; return; }
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
    const w = this.world, p = w.player;
    w.fullyClaimed = true;     // no "deck claimed" fanfare on top of the win
    w.claimed = w.claimTotal;
    p.invuln = 999;
    p.intent.mx = p.intent.mz = 0; p.intent.arm = p.intent.drive = p.intent.core = false;
    for (const b of w.bolts) w.root.remove(b.mesh);
    w.bolts.length = 0;
    this.renderer.flash(PLAYER_HEX, 0.8);
    this.audio.play('hackWin');
    this.ui.announce('The Mainframe is yours. The tower is claimed.', true);
    for (const d of w.droids) if (d.team === 'h' && d.alive && d.state === 'active') this.powerDown(d);
    setTimeout(() => this.endRun(true, 'won'), 3600);
  }

  async copyShare() {
    const note = document.getElementById('share-note');
    try {
      await navigator.clipboard.writeText(this.shareText);
      document.getElementById('share-copy').textContent = 'Copied';
      this.ui.announce('Result copied.');
    } catch {
      // no clipboard: select the text so it can be copied by hand
      const pre = document.getElementById('share-text');
      const range = document.createRange();
      range.selectNodeContents(pre);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
      note.textContent = 'Copying isn’t allowed here. The text is selected: press Ctrl+C or Cmd+C.';
    }
  }

  endRun(won, how) {
    const r = this.run;
    if (this.state === 'end') return;    // a second call (death timer after a win) changes nothing
    if (!r) { this.toTitle(); return; }
    this.meta.runs = (this.meta.runs || 0) + 1;
    if (won) this.meta.wins = (this.meta.wins || 0) + 1;
    // what Nan will want to talk about when you're back in the Heap
    this.meta.lastRun = {
      deck: r.deck, how, won, killer: won ? null : how === 'abandoned' ? 'abandoned' : r.diedTo || 'unknown',
      hacked: r.stats.hacked, ringouts: r.stats.ringouts, turned: r.stats.turned || 0, bounty: (r.bounties || []).slice(-1)[0] || null,
      time: Math.round(r.stats.time), data: r.stats.data || 0, daily: !!r.daily,
    };
    saveMeta(this.meta);
    this.ui.clearRadio();
    this.state = 'end';
    this.audio.stopMusic(1.5);
    this.ui.showHud(false);
    this.ui.setPrompt(null);
    const mins = Math.floor(r.stats.time / 60), secs = Math.floor(r.stats.time % 60);
    // the run, as the front page of the tower's newspaper
    const page = frontPage(r, this.meta, how);
    document.getElementById('end-h').textContent = page.head;
    document.getElementById('end-lede').textContent = page.stand;
    document.getElementById('gz-body').innerHTML = page.body.map((t) => `<p>${t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</p>`).join('');
    document.getElementById('gz-edition').textContent = r.daily ? 'Today\'s tower edition' : page.edition;
    document.getElementById('gz-date').textContent = prettyDate(today());
    document.getElementById('gz-weather').textContent = page.weather;
    document.getElementById('gz-classified').textContent = page.classified;
    const st = r.stats;
    document.getElementById('end-stats').innerHTML = [
      ['Deepest deck', r.deck === 6 ? 'Mainframe' : r.deck], ['Droids hacked', st.hacked], ['Destroyed', st.destroyed + st.voided],
      ['Ring-outs', st.ringouts], ['Turned', st.turned || 0], ['Bounties', st.bounties || 0], ['Parts fitted', st.parts], ['Firmware', r.perks.length], ['Scrap', st.scrap], ['Data', st.data || 0], ['Time', `${mins}:${String(secs).padStart(2, '0')}`],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    const data = r.stats.data || 0;
    document.getElementById('end-unlocks').textContent = [
      data ? `${data} data went up the chute to Nan. You have ${this.meta.data || 0} to spend.` : 'No data this time: hack things, and it goes up the chute to Nan.',
      r.newStolen.length ? `New parts in Nan's spares: ${r.newStolen.map((id) => MODULES[id].name).join(', ')}.` : '',
    ].filter(Boolean).join(' ');
    // today's tower: the first go counts, and you get a line to share
    const share = document.getElementById('end-share');
    share.hidden = !r.daily;
    if (r.daily) {
      const result = { date: r.daily, deck: r.deck, won, how, hacked: st.hacked, ringouts: st.ringouts, time: st.time };
      this.meta.daily = this.meta.daily || {};
      const first = !this.meta.daily[r.daily];
      if (first) { this.meta.daily[r.daily] = result; saveMeta(this.meta); }
      const shown = this.meta.daily[r.daily];
      this.shareText = shareText(shown);
      document.getElementById('share-text').textContent = this.shareText;
      document.getElementById('share-summary').textContent = `Today's tower: ${shareSummary(shown, DECKS.map((d) => d.name))}`;
      document.getElementById('share-note').textContent = first ? '' : 'Only your first go counts, so this is the one you share.';
      document.getElementById('share-copy').textContent = 'Copy result';
    }
    this.ui.show('end');
    this.run = null;
  }
}
