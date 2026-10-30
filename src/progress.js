// What carries over between runs. Hacking downloads data, which goes up
// the scrap chute to the Heap whatever happens to KLP-2; Nan spends it on
// small permanent upgrades, a notch at a time. Scrap stays in the run.

// KLP-2 leaves the Heap weaker than it used to (it was 100 and 100): six
// notches of Plating and Cells on Nan's bench bring it back.
export const BASE = { integrity: 70, energy: 70 };

// Today's tower is the same for everyone: no bench, no kit.
export const DAILY = { integrity: 80, energy: 80 };

const STEPS6 = [6, 9, 13, 18, 24, 30];

export const BENCH = [
  { id: 'plating', name: 'Plating', each: '+5 maximum integrity', ranks: 6, cost: STEPS6 },
  { id: 'cells', name: 'Cells', each: '+5 maximum energy', ranks: 6, cost: STEPS6 },
  { id: 'servos', name: 'Servos', each: 'rolls 2% faster', ranks: 5, cost: [10, 15, 20, 26, 33] },
  { id: 'patience', name: 'Patience', each: 'half a second more on every hack', ranks: 3, cost: [14, 22, 32] },
  { id: 'pockets', name: 'Pockets', each: 'start each run with 6 scrap', ranks: 5, cost: [8, 12, 16, 20, 25] },
  { id: 'cradle', name: 'Lift cradle', each: 'the lift repairs 5% more', ranks: 3, cost: [12, 20, 30] },
  { id: 'spares', name: 'Spares shelf', each: 'your starting part comes a grade higher', ranks: 2, cost: [20, 35] },
];

export function rank(meta, id) {
  return (meta.bench && meta.bench[id]) || 0;
}

// Cost of the next notch, or null when it's full.
export function nextCost(meta, b) {
  const r = rank(meta, b.id);
  return r >= b.ranks ? null : b.cost[r];
}

export function cheapest(meta) {
  let best = null;
  for (const b of BENCH) { const c = nextCost(meta, b); if (c != null && (best == null || c < best)) best = c; }
  return best;
}

// What a run starts with, given the bench.
export function runStats(meta, daily = false) {
  if (daily) return { integrity: DAILY.integrity, energy: DAILY.energy, speed: 1, scrap: 0, hackTime: 0, cradle: 0.25, kitGrade: 1 };
  const r = (id) => rank(meta, id);
  return {
    integrity: BASE.integrity + 5 * r('plating'),
    energy: BASE.energy + 5 * r('cells'),
    speed: 1 + 0.02 * r('servos'),
    scrap: 6 * r('pockets'),
    hackTime: 0.5 * r('patience'),
    cradle: 0.25 + 0.05 * r('cradle'),
    kitGrade: 1 + r('spares'),
  };
}

// The value of a bench notch, now and after, for the screen.
export function benchNow(meta, b) {
  const s = runStats(meta);
  const r = rank(meta, b.id);
  switch (b.id) {
    case 'plating': return [`${s.integrity}`, `${s.integrity + 5}`, 'integrity'];
    case 'cells': return [`${s.energy}`, `${s.energy + 5}`, 'energy'];
    case 'servos': return [`+${2 * r}%`, `+${2 * (r + 1)}%`, 'speed'];
    case 'patience': return [`+${s.hackTime}s`, `+${s.hackTime + 0.5}s`, 'hack time'];
    case 'pockets': return [`${s.scrap}`, `${s.scrap + 6}`, 'starting scrap'];
    case 'cradle': return [`${Math.round(s.cradle * 100)}%`, `${Math.round(s.cradle * 100) + 5}%`, 'lift repair'];
    case 'spares': return [`Mk ${['I', 'II', 'III'][r]}`, `Mk ${['I', 'II', 'III'][r + 1] || 'III'}`, 'starting part'];
    default: return ['', '', ''];
  }
}

// Data for each thing you do. Hacking is the main source.
export function dataFor(kind, cls = 0) {
  switch (kind) {
    case 'droid': return 1 + Math.floor(cls / 200);
    case 'device': return 1;
    case 'archive': return 2;
    case 'bounty': return 4;
    case 'claim': return 3;
    case 'family': return 3;     // first of a family you've ever hacked
    case 'record': return 4;     // a new deepest deck
    default: return 0;
  }
}
