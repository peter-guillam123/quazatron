// Runs a hack from first board to last: side choice, play, the result
// banner, extra rounds for the Mainframe, and the first-time walkthrough.
import { generateBoard, HackRound, reach, DURATION, TRAVEL } from './board.js';
import { HackAI } from './ai.js';
import { makeRng, randomSeed } from '../rng.js';
import { PLAYER_HEX } from '../config.js';

const TUTORIAL = [
  { id: 'goal', when: 'choose', title: 'The hack', text: 'You’re wired into its circuits. Win the middle column: when the timer runs out, whoever owns more cells wins.' },
  { id: 'side', when: 'choose', title: 'Pick a side', text: 'The two sides are wired differently. Look for wires that run clean to the middle.\n← → to swap sides, then Space to start.' },
  { id: 'fire', when: 'play', title: 'Fire pulses', text: '↑ ↓ picks one of your wires. Space fires a pulse down it. The dotted outline shows the cells it will reach.\nA pulse holds its cell for a few seconds. The cell stays yours until they power it back.' },
  { id: 'parts', when: 'play', title: 'Parts on the wires', text: 'Forks reach two cells. AND gates need two of your pulses at once. Inverts paint their colour, so avoid them. Locks stay lit. You have a few pulsers; spend them well, and keep some for the end.' },
];

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
    this.tutorialQueue = opts.tutorial ? TUTORIAL.slice() : [];
    this.tutorial = null;
    this.done = false;
    this.lastTick = 99;
    this.updateKeys();
    this.newRound();
  }

  updateKeys() {
    const pad = this.game.input.lastDevice === 'pad';
    this.keys = pad
      ? { choose: 'D-pad ← → choose a side  ·  A to start', play: 'D-pad ↑ ↓ choose a wire  ·  A fires' }
      : { choose: '← → choose a side  ·  Space to start', play: '↑ ↓ choose a wire  ·  Space fires' };
  }

  newRound() {
    const s = this.spec;
    this.board = generateBoard(this.rng, { rows: s.rows, cls: s.cls });
    this.phase = 'choose';
    this.chooseT = this.roundIndex === 0 ? 7 : 5;
    this.playerSide = 0;
    this.cursor = Math.floor(s.rows / 2);
    // an inert round so the board can be drawn while choosing
    this.round = new HackRound(this.board, { timer: s.timer, pulsers: [0, 0] });
    this.startPulsers = [0, 0];
    this.preview = null;
    this.nextTutorial('choose');
    this.game.announce(this.roundIndex === 0 ? `${this.title}. Choose a side with left and right, then press Space.` : `Round ${this.roundIndex + 1}. Choose a side.`);
  }

  nextTutorial(phase) {
    if (this.tutorial) return;
    const i = this.tutorialQueue.findIndex((t) => t.when === phase);
    if (i < 0) return;
    const t = this.tutorialQueue.splice(i, 1)[0];
    this.tutorial = { ...t, more: this.game.input.lastDevice === 'pad' ? 'A to continue' : 'Space to continue' };
    this.game.announce(`${t.title}. ${t.text}`);
  }

  begin() {
    const g = this.game;
    const s = this.spec;
    const ps = this.playerSide, es = 1 - ps;
    const pulsers = [];
    pulsers[ps] = g.playerPulsers();
    pulsers[es] = s.pulsers;
    const duration = [], travel = [], freeFirst = [];
    duration[ps] = DURATION * (g.hasPerk('longpulse') ? 1.4 : 1);
    duration[es] = DURATION;
    travel[ps] = TRAVEL * (g.hasPerk('fastpulse') ? 0.45 : 1);
    travel[es] = TRAVEL;
    freeFirst[ps] = g.hasPerk('firstfree');
    freeFirst[es] = false;
    if (g.hasPerk('scanner')) for (const col of this.board.sides[ps].grid) for (const c of col) if (c) c.hidden = false;
    // a fresh copy of the cells, since choosing didn't change anything
    this.round = new HackRound(this.board, { timer: s.timer * (g.settings.slowHack ? 1.5 : 1), pulsers, duration, travel, freeFirst });
    this.startPulsers = pulsers.slice();
    let delay = 0.5 + Math.random() * 0.4;
    if (s.stunned) delay += 2.2;
    if (this.opts.ambush) delay += this.opts.ambush;
    if (g.hasPerk('firststrike')) delay += 1.5;
    const skill = Math.min(0.95, s.cls / 1000 + 0.1);
    this.ai = new HackAI(this.round, es, skill, { delay });
    this.phase = 'play';
    this.updatePreview();
    this.nextTutorial('play');
    g.audio.play('hackStart');
  }

  updatePreview() {
    if (this.phase !== 'play') { this.preview = null; return; }
    const out = reach(this.board.sides[this.playerSide], this.cursor);
    this.preview = out.map((v) => v);
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
    if (this.tutorial) {
      if (input.hit('grapple') || input.hit('confirm') || input.hit('arm')) { this.tutorial = null; audio.play('uiSelect'); this.nextTutorial(this.phase); }
      return;
    }
    if (this.phase === 'choose') {
      if (input.hit('left') && this.playerSide !== 0) { this.playerSide = 0; audio.play('uiMove'); }
      if (input.hit('right') && this.playerSide !== 1) { this.playerSide = 1; audio.play('uiMove'); }
      this.chooseT -= dt;
      if (input.hit('grapple') || input.hit('arm') || this.chooseT <= 0) this.begin();
      return;
    }
    if (this.phase === 'play') {
      const R = this.round;
      if (input.hit('up')) { this.cursor = (this.cursor + R.rows - 1) % R.rows; this.updatePreview(); audio.play('uiMove'); }
      if (input.hit('down')) { this.cursor = (this.cursor + 1) % R.rows; this.updatePreview(); audio.play('uiMove'); }
      if (input.hit('grapple') || input.hit('arm')) {
        if (R.fire(this.playerSide, this.cursor)) audio.play('pulse', { pitch: 1 + (R.rows - this.cursor) * 0.03 });
        else audio.play('empty');
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
      if (this.resultT <= 0 || ((input.hit('grapple') || input.hit('confirm')) && this.resultT < 1.0)) this.afterRound();
    }
  }

  endRound() {
    const R = this.round;
    const ps = this.playerSide;
    const you = R.result[ps], them = R.result[1 - ps];
    this.phase = 'result';
    this.resultT = 1.8;
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
