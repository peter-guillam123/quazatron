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
  const pBreak = opts.pBreak ?? 0.09, pInv = opts.pInv ?? 0.07, pLock = opts.pLock ?? 0.05;
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
      if (r + 1 < rows && pAnd > 0 && roll < pFork + pAnd) {
        const comp = { t: 'and', a: r, dst: rng() < 0.5 ? 0 : 1 };
        col[r] = comp; col[r + 1] = comp; r += 2; continue;
      }
      const s = rng();
      let t = 'wire';
      if (s < pBreak) t = 'break';
      else if (s < pBreak + pInv) t = 'inv';
      else if (s < pBreak + pInv + (last || c === cols - 2 ? pLock : 0)) t = 'lock';
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

// How many of a part a side carries (free wires count as ports).
export function countPart(side, t) {
  if (t === 'free') return side.ports.filter((p) => p.free).length;
  const seen = new Set();
  for (const col of side.grid) for (const comp of col) if (comp && comp.t === t) seen.add(comp);
  return seen.size;
}

// Every kind of part on the board, for the legend.
export function partsOn(board) {
  const out = new Set();
  for (const side of board.sides) {
    for (const col of side.grid) for (const comp of col) if (comp && comp.t !== 'wire') out.add(comp.hidden ? 'hidden' : comp.t);
    if (side.ports.some((p) => p.free)) out.add('free');
  }
  return out;
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

// Where a pulse down one wire would go, column by column, for drawing it
// before you fire. Locks already lit are left out, since they'd glow anyway,
// and the path stops at the first hidden part: that stays a surprise.
export function pathOf(side, row) {
  const zero = new Array(side.rows).fill(0);
  const live = zero.slice(); live[row] = 1;
  const tr = evalSide(side, live, false), base = evalSide(side, zero, false);
  const path = tr.map((col, c) => col.map((v, r) => (base[c][r] ? 0 : v)));
  let stop = side.cols;
  for (let c = 0; c < side.cols && stop === side.cols; c++) {
    for (let r = 0; r < side.rows; r++) {
      const comp = side.grid[c][r];
      if (path[c][r] && comp && comp.hidden) { stop = c; break; }
    }
  }
  // a cut-off path shows how far it gets, but no cells
  for (let c = stop + 1; c < path.length; c++) path[c].fill(0);
  // did it reach an AND gate, which needs a second wire?
  let and = false;
  for (let c = 0; c < Math.min(stop + 1, side.cols); c++) for (let r = 0; r < side.rows; r++) {
    const comp = side.grid[c][r];
    if (path[c][r] && comp && comp.t === 'and' && !comp.hidden) and = true;
  }
  return { path, cells: stop < side.cols ? null : path[side.cols], and };
}

// What a single port reaches, ignoring everything else: rows painted, and how.
export function reach(side, row) {
  const live = new Array(side.rows).fill(0);
  live[row] = 1;
  const tr = evalSide(side, live, false);
  return tr[tr.length - 1];
}

const KINDS = ['fork', 'and', 'break', 'inv', 'lock', 'free'];

// Every part on one side, free wires included.
export function partCount(side) {
  return KINDS.reduce((n, t) => n + countPart(side, t), 0);
}

// How busy a droid's side of the board can be, by its class: four parts on
// a Mite, rising to the full mix (eleven to thirteen) from class 500, where
// the board is left as it always was. Rows grow with class too (roster.js).
export function partsBudget(cls) {
  return cls < 200 ? 4 : cls < 300 ? 6 : cls < 400 ? 7 : cls < 500 ? 9 : null;
}

// spec: rows, cols, cls, and for a lesson: parts (allowed), focus (the new
// part) and side (whether both sides must carry it).
export function generateBoard(rng, spec) {
  const rows = spec.rows || 10;
  const cols = spec.cols || 4;
  const cls = spec.cls || 200;
  const lesson = !!spec.parts;
  let opts, budget;
  if (lesson) {
    // the new part two or three times, the ones you know now and then
    const has = (t) => spec.parts.includes(t);
    const p = (t, focus) => (has(t) ? (spec.focus === t ? focus : 0.035) : 0);
    opts = {
      hidden: 0,
      pFork: p('fork', 0.15), pAnd: p('and', 0.13), pBreak: p('break', 0.13), pInv: p('inv', 0.13), pLock: p('lock', 0.22),
      pFree: has('free') ? (spec.focus === 'free' ? 1 : 0.3) : 0,
    };
    budget = rows <= 6 ? 5 : 6;
  } else {
    // the usual mix, thinned to the budget for the smaller droids
    budget = spec.budget !== undefined ? spec.budget : partsBudget(cls);
    const k = budget ? Math.min(1, budget / (rows * 1.04)) : 1;
    // smaller droids lean on forks, the friendly part, and go easy on AND
    // gates, the hardest to read
    const mix = budget ? { fork: 0.16, and: 0.03, break: 0.08, inv: 0.06, lock: 0.05 } : { fork: 0.11, and: 0.07, break: 0.09, inv: 0.07, lock: 0.05 };
    opts = {
      hidden: cls >= 400 ? 0.1 + (cls - 400) / 3000 : 0,
      pFork: mix.fork * k, pAnd: mix.and * k, pBreak: mix.break * k, pInv: mix.inv * k, pLock: mix.lock * k, pFree: 0.45,
    };
  }
  const want = spec.focus === 'free' ? 1 : 2;
  // make boards until one fits; failing that, keep the closest. Officers'
  // boards (no budget) keep their old habit: thirty goes, then the last one,
  // which is often a messier board. Their hacks are balanced around it.
  const messy = !lesson && !budget;
  let best = null, bestCost = Infinity;
  for (let tries = 0; tries < (lesson ? 200 : messy ? 30 : 80) && bestCost > 0; tries++) {
    const sides = [makeSide(rng, rows, cols, opts), makeSide(rng, rows, cols, opts)];
    const useful = sides.map((sd) => {
      let n = 0;
      for (let r = 0; r < rows; r++) if (reach(sd, r).some((x) => x === 1)) n++;
      return n;
    });
    let cost = 0;
    // enough wires on each side that reach a cell cleanly
    for (const n of useful) cost += Math.max(0, Math.ceil(rows * 0.5) - n) * 3;
    if (lesson) {
      // the new part has to be there to be learned, on your side when you
      // don't choose and on both when you do, but not swamping the board
      const need = spec.side ? sides : [sides[0]];
      for (const sd of need) {
        const n = spec.focus ? countPart(sd, spec.focus) : 0;
        if (spec.focus) cost += Math.max(0, want - n) * 4 + Math.max(0, n - 3) * 2;
        cost += Math.max(0, partCount(sd) - budget) * 2;
      }
      // when you're learning to choose, make the choice worth making
      if (spec.focus === 'break' && Math.abs(useful[0] - useful[1]) < 1) cost += 3;
    } else {
      // a ceiling, not a target: the two sides should still differ, or
      // picking the better one stops mattering
      if (budget) {
        for (const sd of sides) cost += Math.max(0, partCount(sd) - budget - 1);
        // simple boards need one side to be the better pick, or reading
        // the board stops paying
        if (Math.abs(useful[0] - useful[1]) < 1) cost += 2;
      }
    }
    if (cost < bestCost || messy) { bestCost = cost; best = { rows, cols, sides }; }
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
