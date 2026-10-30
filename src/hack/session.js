// Runs a hack from first board to last: the lesson line, side choice,
// play, the result banner, and extra rounds for the Mainframe.
import { generateBoard, HackRound, pathOf, partsOn, DURATION, TRAVEL } from './board.js';
import { HackAI } from './ai.js';
import { HIDDEN_LESSON } from './lessons.js';
import { makeRng, randomSeed } from '../rng.js';
import { PLAYER_HEX } from '../config.js';
import { hackSkill } from '../world/roster.js';

export class HackSession {
  constructor(game, target, spec, opts = {}) {
    this.game = game;
    this.target = target;
    this.spec = spec;
    this.rng = makeRng(randomSeed());
    this.roundsTotal = spec.rounds || 1;
    this.roundIndex = 0;
    this.wins = [0, 0];
    this.youColour = PLAYER_HEX;
    this.themColour = `#${game.world.deck.ink.toString(16).padStart(6, '0')}`;
    this.title = `Hacking ${spec.title}`;
    this.subtitle = `CLASS ${spec.cls}`;
    this.opts = opts;
    // a lesson board, while you're still learning the parts
    this.lesson = spec.boss ? null : opts.lesson || null;
    // what your fighting has done to it: pulsers knocked out, a late start
    const L = this.lesson;
    // a lesson caps the opponent, and a dent still counts below the cap
    const full = spec.fullPulsers ?? spec.pulsers;
    const base = L ? Math.min(full, L.enemy) : full;
    this.enemyPulsers = Math.max(1, base - (spec.dent || 0));
    this.dented = base - this.enemyPulsers;
    this.late = spec.stunned ? 'stunned' : opts.ambush ? 'ambushed' : null;
    // arrows coloured by where each wire lands: while learning, or by choice
    this.hints = !!L || !!game.settings.wireHints;
    // what each side will start with, shown while you pick a side
    this.expected = { you: game.playerPulsers(), them: this.enemyPulsers };
    this.done = false;
    this.lastTick = 99;
    this.updateKeys();
    this.newRound();
  }

  updateKeys() {
    const pad = this.game.input.lastDevice === 'pad';
    this.keys = pad
      ? { choose: 'D-pad ← → choose a side  ·  A to start', play: 'D-pad ↑ ↓ choose a wire  ·  A fires', start: 'A to start' }
      : { choose: '← → choose a side  ·  Space to start', play: '↑ ↓ choose a wire  ·  Space fires', start: 'Space to start' };
  }

  newRound() {
    const s = this.spec;
    const L = this.lesson;
    this.board = L
      ? generateBoard(this.rng, { rows: Math.min(L.rows, s.rows), cls: s.cls, parts: L.parts, focus: L.focus, side: L.side })
      : generateBoard(this.rng, { rows: s.rows, cls: s.cls });
    this.rows = this.board.rows;
    this.parts = partsOn(this.board);
    // the line along the top: this lesson, or the first time a part is hidden
    this.callout = L || null;
    this.focus = L ? L.focus : null;
    if (!L && this.parts.has('hidden') && !this.game.meta.seenHidden) {
      this.callout = HIDDEN_LESSON;
      this.focus = 'hidden';
      this.sawHidden = true;
    }
    this.fresh = !!this.callout && (!L || this.game.meta.lessonSeen !== this.opts.lessonIndex);
    this.phase = 'choose';
    this.canSwap = !L || L.side;
    // no clock while you read something new
    if (!this.canSwap || (L && L.focus === 'break')) this.chooseT = Infinity;
    else if (this.fresh) this.chooseT = 10;
    else this.chooseT = this.roundIndex === 0 ? 6 : 4;
    this.playerSide = 0;
    this.cursor = Math.floor(this.rows / 2);
    this.emptyAt = null;
    this.toldEmpty = false;
    this.introT = 0;
    // an inert round so the board can be drawn while choosing
    this.round = new HackRound(this.board, { timer: s.timer, pulsers: [0, 0] });
    this.startPulsers = [0, 0];
    this.preview = null;
    let how = this.canSwap ? 'Choose a side with left and right, then press Space.' : 'Press Space to start.';
    if (this.dented) how = `It's dented: ${this.dented === 1 ? 'one pulser' : `${this.dented} pulsers`} short. ${how}`;
    if (this.late) how = `It's ${this.late}, so it starts late. ${how}`;
    if (this.callout) this.game.announce(`${this.title}. ${this.callout.title}. ${this.callout.line} ${how}`);
    else this.game.announce(this.roundIndex === 0 ? `${this.title}. ${how}` : `Round ${this.roundIndex + 1}. ${how}`);
  }

  begin() {
    const g = this.game;
    const s = this.spec;
    const ps = this.playerSide, es = 1 - ps;
    const pulsers = [];
    pulsers[ps] = g.playerPulsers();
    const L = this.lesson;
    pulsers[es] = this.enemyPulsers;
    const duration = [], travel = [], freeFirst = [];
    duration[ps] = DURATION * (g.hasPerk('longpulse') ? 1.4 : 1);
    duration[es] = DURATION;
    travel[ps] = TRAVEL * (g.hasPerk('fastpulse') ? 0.45 : 1);
    travel[es] = TRAVEL;
    freeFirst[ps] = g.hasPerk('firstfree');
    freeFirst[es] = false;
    if (g.hasPerk('scanner')) for (const col of this.board.sides[ps].grid) for (const c of col) if (c) c.hidden = false;
    // a fresh copy of the cells, since choosing didn't change anything
    // Nan's Patience notches add a little time to every hack
    const timer = (L ? L.timer : s.timer) + ((g.run && g.run.hackTime) || 0);
    this.round = new HackRound(this.board, { timer: timer * (g.settings.slowHack ? 1.5 : 1), pulsers, duration, travel, freeFirst });
    this.startPulsers = pulsers.slice();
    let delay = 0.5 + Math.random() * 0.4;
    if (s.stunned) delay += 2.2;
    if (this.opts.ambush) delay += this.opts.ambush;
    if (g.hasPerk('firststrike')) delay += 1.5;
    if (L) delay += L.delay;
    const skill = Math.min(hackSkill(s.cls), L ? L.skill : 1);
    this.ai = new HackAI(this.round, es, skill, { delay });
    this.phase = 'play';
    this.updatePreview();
    g.audio.play('hackStart');
  }

  updatePreview() {
    if (this.phase !== 'play') { this.preview = null; return; }
    // recomputed as you move, and again in the drawing as locks light up
    this.preview = pathOf(this.board.sides[this.playerSide], this.cursor).cells;
  }

  update(dt) {
    const input = this.game.input;
    const audio = this.game.audio;
    if (input.hit('pause')) {
      this.paused = !this.paused;
      audio.play(this.paused ? 'uiBack' : 'uiSelect');
      this.game.announce(this.paused ? 'Hack paused. Press Escape to carry on.' : 'Hack resumed.');
    }
    if (this.paused) {
      if (input.hit('grapple') || input.hit('confirm')) { this.paused = false; audio.play('uiSelect'); }
      return;
    }
    this.introT += dt;
    if (this.phase === 'choose') {
      if (this.canSwap && input.hit('left') && this.playerSide !== 0) { this.playerSide = 0; audio.play('uiMove'); }
      if (this.canSwap && input.hit('right') && this.playerSide !== 1) { this.playerSide = 1; audio.play('uiMove'); }
      this.chooseT -= dt;
      if (input.hit('grapple') || input.hit('arm') || this.chooseT <= 0) this.begin();
      return;
    }
    if (this.phase === 'play') {
      const R = this.round;
      if (input.hit('up')) { this.cursor = (this.cursor + R.rows - 1) % R.rows; this.updatePreview(); audio.play('uiMove'); }
      if (input.hit('down')) { this.cursor = (this.cursor + 1) % R.rows; this.updatePreview(); audio.play('uiMove'); }
      if (input.hit('grapple') || input.hit('arm')) {
        if (R.fire(this.playerSide, this.cursor)) {
          audio.play('pulse', { pitch: 1 + (R.rows - this.cursor) * 0.03 });
          const left = R.pulsers[this.playerSide];
          if (left === 0 && !this.toldEmpty) {
            this.toldEmpty = true;
            const free = this.board.sides[this.playerSide].ports.some((p) => p.free);
            this.game.announce(`That was your last pulse.${free ? ' Free wires still fire.' : ''}`);
          }
        } else if (!R.busy(this.playerSide, this.cursor)) {
          // nothing left to fire with: say so, on screen and out loud
          audio.play('empty');
          this.emptyAt = R.time;
          this.game.announce('No pulses left.');
        } else audio.play('empty');
      }
      this.ai.update(dt);
      R.update(dt);
      for (const e of R.drainEvents()) {
        if (e.type === 'fire' && e.side !== this.playerSide) audio.play('pulse', { pitch: 0.7 });
        if (e.type === 'flip') audio.play(e.owner === this.playerSide ? 'flipYou' : 'flipThem', { row: e.row });
        if (e.type === 'contest') audio.play('contest');
      }
      const left = R.timer - R.time;
      if (left < 3.5 && Math.ceil(left) !== this.lastTick) { this.lastTick = Math.ceil(left); audio.play('tick'); }
      if (R.over) this.endRound();
      return;
    }
    if (this.phase === 'result') {
      this.resultT -= dt;
      if (this.resultT <= 0 || ((input.hit('grapple') || input.hit('confirm')) && this.resultT < 1.1)) this.afterRound();
    }
  }

  endRound() {
    const R = this.round;
    const ps = this.playerSide;
    const you = R.result[ps], them = R.result[1 - ps];
    this.phase = 'result';
    this.resultT = 1.4;
    this.margin = you - them;
    if (you > them) { this.roundWon = 1; this.wins[0]++; }
    else if (them > you) { this.roundWon = 0; this.wins[1]++; }
    else this.roundWon = -1;
    const finalRound = this.roundWon !== -1 && (this.roundsTotal === 1 || this.wins[0] * 2 > this.roundsTotal || this.wins[1] * 2 > this.roundsTotal);
    if (this.roundWon === -1) { this.resultTitle = 'Deadlock'; this.resultLine = `${you} each. Rewiring for another go.`; }
    else if (this.roundWon === 1) { this.resultTitle = finalRound ? 'Access granted' : 'Round to you'; this.resultLine = `${you} cells to ${them}`; }
    else { this.resultTitle = finalRound ? 'Rejected' : 'Round to them'; this.resultLine = `${you} cells to ${them}`; }
    this.finalRound = finalRound;
    this.game.audio.play(this.roundWon === 1 ? 'hackWin' : this.roundWon === 0 ? 'hackLose' : 'deadlock');
    this.game.announce(`${this.resultTitle}. ${this.resultLine}.`);
  }

  afterRound() {
    if (this.finalRound) {
      this.done = true;
      this.game.endHack(this, this.wins[0] > this.wins[1]);
      return;
    }
    if (this.roundWon !== -1) this.roundIndex++;
    this.newRound();
  }
}
