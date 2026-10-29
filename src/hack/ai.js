// The opponent in the hack. It reads its own side of the board, weighs
// what each wire would win, and saves pulsers for the end. Better droids
// think faster, waste less and plan around AND gates.
import { evalSide } from './board.js';

export class HackAI {
  constructor(round, side, skill, opts = {}) {
    this.round = round;
    this.side = side;
    this.skill = Math.max(0.05, Math.min(1, skill));
    this.think = opts.delay ?? 0.6 + (1 - this.skill) * 0.6;
    this.queue = [];
    this.rng = opts.rng || Math.random;
    this.total = round.pulsers[side];
  }

  // Score the board from this side's point of view if `extra` ports were lit.
  value(extra) {
    const R = this.round, s = this.side, o = 1 - s;
    const mine = R.liveAt(s, R.time + R.travel[s]);
    for (const r of extra) mine[r] = 1;
    const theirs = R.liveAt(o, R.time + R.travel[s]);
    const a = evalSide(R.board.sides[s], mine, false);
    const b = evalSide(R.board.sides[o], theirs, false);
    const outA = a[a.length - 1], outB = b[b.length - 1];
    let v = 0;
    for (let r = 0; r < R.rows; r++) {
      const paint = new Set();
      if (outA[r] === 1) paint.add(s); else if (outA[r] === 2) paint.add(o);
      if (outB[r] === 1) paint.add(o); else if (outB[r] === 2) paint.add(s);
      const cell = R.board.cells[r];
      let owner = cell.owner, contested = false;
      if (paint.size === 1) owner = [...paint][0];
      else if (paint.size === 2) contested = true;
      v += contested ? 0.45 : owner === s ? 1 : 0;
    }
    return v;
  }

  update(dt) {
    const R = this.round;
    if (R.over) return;
    if (this.queue.length) {
      const q = this.queue[0];
      q.t -= dt;
      if (q.t <= 0) { this.queue.shift(); R.fire(this.side, q.row); }
      return;
    }
    this.think -= dt;
    if (this.think > 0) return;
    this.think = (0.28 + (1 - this.skill) * 0.45) * (0.7 + this.rng() * 0.6);

    const s = this.side;
    const ports = R.board.sides[s].ports;
    const avail = [];
    for (let r = 0; r < R.rows; r++) if (R.canFire(s, r)) avail.push(r);
    if (!avail.length) return;

    const base = this.value([]);
    const noise = () => (this.rng() - 0.5) * (1 - this.skill) * 1.6;
    let best = null, bestGain = -Infinity;
    for (const r of avail) {
      let g = this.value([r]) - base + noise();
      if (ports[r].free) g += 0.15;
      if (g > bestGain) { bestGain = g; best = [r]; }
    }
    // pairs, for AND gates (sharper droids only)
    if (this.skill > 0.35 && R.pulsers[s] >= 2) {
      for (let i = 0; i < avail.length; i++) {
        for (let j = i + 1; j < avail.length; j++) {
          const g = (this.value([avail[i], avail[j]]) - base) / 2 + noise() * 0.5;
          if (g > bestGain + 0.3) { bestGain = g; best = [avail[i], avail[j]]; }
        }
      }
    }
    if (!best) return;

    // how much of the budget should be spent by now
    const f = R.time / R.timer;
    const spent = this.total - R.pulsers[s];
    const allowed = Math.ceil(this.total * Math.min(1, 0.2 + 0.85 * Math.pow(f, 1.2)));
    const free = best.every((r) => ports[r].free);
    const late = f > 0.72;
    const worth = bestGain >= (late ? 0.35 : 0.9);
    if (!worth) return;
    if (!free && spent + best.length > allowed && !(late && bestGain >= 1)) return;

    R.fire(s, best[0]);
    if (best.length > 1) this.queue.push({ row: best[1], t: 0.05 + (1 - this.skill) * 0.15 });
  }
}
