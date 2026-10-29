// The hack: two sides of a circuit board fight over a column of cells in
// the middle. Fire a pulse down a wire and it powers whatever cell the wire
// reaches, turning it your colour. When the timer runs out, whoever owns
// more cells wins. Pure logic, no drawing, so it can be tested in Node.
//
// Parts on the wires:
//   wire   carries the pulse
//   break  stops it dead
//   fork   splits one wire into two cells
//   and    joins two wires, but only passes when both are lit at once
//   invert flips the colour, so the pulse paints your opponent's colour
//   lock   once lit, stays lit for the rest of the round

export const TRAVEL = 0.32;       // seconds for a pulse to reach the middle
export const DURATION = 2.8;      // how long a pulse keeps its cell powered

export function makeSide(rng, rows, cols, opts = {}) {
  const grid = [];
  const pFork = opts.pFork ?? 0.11, pAnd = opts.pAnd ?? 0.07;
  for (let c = 0; c < cols; c++) {
    const col = new Array(rows).fill(null);
    let r = 0;
    while (r < rows) {
      const roll = rng();
      const last = c === cols - 1;
      if (r + 1 < rows && roll < pFork && c < cols - 1) {
        const comp = { t: 'fork', a: r, src: rng() < 0.5 ? 0 : 1 };
        col[r] = comp; col[r + 1] = comp; r += 2; continue;
      }
      if (r + 1 < rows && roll < pFork + pAnd) {
        const comp = { t: 'and', a: r, dst: rng() < 0.5 ? 0 : 1 };
        col[r] = comp; col[r + 1] = comp; r += 2; continue;
      }
      const s = rng();
      let t = 'wire';
      if (s < (opts.pBreak ?? 0.09)) t = 'break';
      else if (s < (opts.pBreak ?? 0.09) + (opts.pInv ?? 0.07)) t = 'inv';
      else if (s < (opts.pBreak ?? 0.09) + (opts.pInv ?? 0.07) + (last || c === cols - 2 ? 0.05 : 0.0)) t = 'lock';
      col[r] = { t, a: r };
      r += 1;
    }
    grid.push(col);
  }
  if (opts.hidden) {
    for (const col of grid) for (const comp of new Set(col)) if (comp && comp.t !== 'wire' && rng() < opts.hidden) comp.hidden = true;
  }
  const ports = [];
  for (let r = 0; r < rows; r++) ports.push({ free: false });
  if (rng() < (opts.pFree ?? 0.45)) ports[Math.floor(rng() * rows)].free = true;
  return { rows, cols, grid, ports };
}

// Run signals across one side. live: per-row 0/1 at the ports.
// Returns per-column traces; the last entry is what reaches the cells.
// Values: 0 dead, 1 lit, 2 lit but inverted.
export function evalSide(side, live, commit = false) {
  const { rows, cols, grid } = side;
  let v = live.map((x) => (x ? 1 : 0));
  const trace = [v];
  for (let c = 0; c < cols; c++) {
    const nv = new Array(rows).fill(0);
    const col = grid[c];
    for (let r = 0; r < rows; r++) {
      const comp = col[r];
      if (!comp) { nv[r] = v[r]; continue; }
      if (comp.a !== r) continue;   // two-row parts are handled at their top row
      switch (comp.t) {
        case 'wire': nv[r] = v[r]; break;
        case 'break': nv[r] = 0; break;
        case 'inv': nv[r] = v[r] ? 3 - v[r] : 0; break;
        case 'lock': {
          if (comp.latched) nv[r] = comp.latched;
          else {
            nv[r] = v[r];
            if (commit && v[r]) comp.latched = v[r];
          }
          break;
        }
        case 'fork': {
          const input = v[r + comp.src];
          nv[r] = input; nv[r + 1] = input;
          break;
        }
        case 'and': {
          const a = v[r], b = v[r + 1];
          const out = a && b ? (a === 2 || b === 2 ? 2 : 1) : 0;
          nv[r + comp.dst] = out;
          nv[r + 1 - comp.dst] = 0;
          break;
        }
        default: nv[r] = v[r];
      }
      if (commit && comp.hidden && v[r]) comp.hidden = false;
      if (commit && comp.hidden && (comp.t === 'fork' || comp.t === 'and') && v[r + 1]) comp.hidden = false;
    }
    v = nv;
    trace.push(v);
  }
  return trace;
}

// What a single port reaches, ignoring everything else: rows painted, and how.
export function reach(side, row) {
  const live = new Array(side.rows).fill(0);
  live[row] = 1;
  const tr = evalSide(side, live, false);
  return tr[tr.length - 1];
}

export function generateBoard(rng, spec) {
  const rows = spec.rows || 10;
  const cols = spec.cols || 4;
  const cls = spec.cls || 200;
  const opts = { hidden: cls >= 400 ? 0.1 + (cls - 400) / 3000 : 0 };
  // keep regenerating until both sides have enough useful wires
  let best = null;
  for (let tries = 0; tries < 30; tries++) {
    const sides = [makeSide(rng, rows, cols, opts), makeSide(rng, rows, cols, opts)];
    const useful = sides.map((s, i) => {
      let n = 0;
      for (let r = 0; r < rows; r++) {
        const out = reach(s, r);
        if (out.some((x) => x === 1)) n++;
      }
      return n;
    });
    const ok = useful.every((n) => n >= Math.ceil(rows * 0.5));
    best = { rows, cols, sides };
    if (ok) break;
  }
  // cells start split evenly, in a random order
  const owners = [];
  for (let r = 0; r < rows; r++) owners.push(r % 2);
  for (let i = owners.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [owners[i], owners[j]] = [owners[j], owners[i]]; }
  best.cells = owners.map((o) => ({ owner: o, contested: false, flipT: 0 }));
  return best;
}

// One round of the hack, from side choice to the final count.
export class HackRound {
  constructor(board, opts) {
    this.board = board;
    this.rows = board.rows;
    this.time = 0;
    this.timer = opts.timer;
    this.pulsers = [opts.pulsers[0], opts.pulsers[1]];   // indexed by side
    this.duration = [opts.duration?.[0] ?? DURATION, opts.duration?.[1] ?? DURATION];
    this.travel = [opts.travel?.[0] ?? TRAVEL, opts.travel?.[1] ?? TRAVEL];
    this.freeFirst = [!!opts.freeFirst?.[0], !!opts.freeFirst?.[1]];
    this.pulses = [];
    this.over = false;
    this.traces = [null, null];
    this.events = [];
    this.update(0);
  }

  busy(side, row) {
    for (const p of this.pulses) if (p.side === side && p.row === row && this.time < p.t0 + this.travel[side] + this.duration[side]) return true;
    return false;
  }

  canFire(side, row) {
    if (this.over) return false;
    if (this.busy(side, row)) return false;
    const port = this.board.sides[side].ports[row];
    return port.free || this.freeFirst[side] || this.pulsers[side] > 0;
  }

  fire(side, row) {
    if (!this.canFire(side, row)) return false;
    const port = this.board.sides[side].ports[row];
    if (!port.free) {
      if (this.freeFirst[side]) this.freeFirst[side] = false;
      else this.pulsers[side] -= 1;
    }
    this.pulses.push({ side, row, t0: this.time });
    this.events.push({ type: 'fire', side, row });
    return true;
  }

  liveAt(side, t) {
    const live = new Array(this.rows).fill(0);
    for (const p of this.pulses) {
      if (p.side !== side) continue;
      const on = p.t0 + this.travel[side];
      if (t >= on && t < on + this.duration[side]) live[p.row] = 1;
    }
    return live;
  }

  update(dt) {
    if (this.over) return;
    this.time += dt;
    const outs = [];
    for (let s = 0; s < 2; s++) {
      this.traces[s] = evalSide(this.board.sides[s], this.liveAt(s, this.time), true);
      outs.push(this.traces[s][this.traces[s].length - 1]);
    }
    for (let r = 0; r < this.rows; r++) {
      const cell = this.board.cells[r];
      const paint = new Set();
      for (let s = 0; s < 2; s++) {
        const v = outs[s][r];
        if (v === 1) paint.add(s);
        else if (v === 2) paint.add(1 - s);
      }
      if (paint.size === 1) {
        const o = [...paint][0];
        if (cell.owner !== o) { cell.owner = o; cell.flipT = 0; this.events.push({ type: 'flip', row: r, owner: o }); }
        cell.contested = false;
      } else if (paint.size === 2) {
        if (!cell.contested) this.events.push({ type: 'contest', row: r });
        cell.contested = true;
      } else {
        cell.contested = false;
      }
      cell.flipT += dt;
    }
    if (this.time >= this.timer) this.finish();
  }

  count() {
    const n = [0, 0];
    for (const c of this.board.cells) if (!c.contested && (c.owner === 0 || c.owner === 1)) n[c.owner]++;
    return n;
  }

  finish() {
    this.over = true;
    this.result = this.count();
    this.events.push({ type: 'end', result: this.result });
  }

  drainEvents() { const e = this.events; this.events = []; return e; }
}
