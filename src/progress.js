// What carries over between runs. Hacking downloads data, which falls down
// the scrap chute to the Heap whatever happens to KLP-2; Nan spends it on
// small permanent upgrades, a notch at a time. Scrap stays in the run.

// KLP-2 comes out of the rubbish at its weakest: 60 and 60. Eight notches
// each of Nan's plating and cells bring it to 100. The first notches are
// cheap, so one decent run buys a visible repair.
export const BASE = { integrity: 60, energy: 60 };

// Today's tower is the same for everyone: no bench, no kit.
export const DAILY = { integrity: 80, energy: 80 };

const STEPS8 = [3, 5, 8, 11, 15, 20, 26, 33];

// Nan's repairs, each to a part of KLP-2 you can see mended: `look` says
// what changes on the model.
export const BENCH = [
  { id: 'plating', name: 'Hull plating', each: '+5 maximum integrity', look: 'patches the holes in KLP-2\'s shell', ranks: 8, cost: STEPS8 },
  { id: 'cells', name: 'Power cells', each: '+5 maximum energy', look: 'steadies its flickering visor', ranks: 8, cost: STEPS8 },
  { id: 'servos', name: 'Wheel bearings', each: 'rolls 2% faster', look: 'stops the wobble in its bad wheel', ranks: 5, cost: [6, 10, 14, 19, 25] },
  { id: 'patience', name: 'Logic board', each: 'half a second more on every hack', look: 'gives it back its aerial', ranks: 3, cost: [8, 14, 22] },
  { id: 'pockets', name: 'Back pocket', each: 'start each run with 6 scrap', look: 'a pocket on its back, a little bigger each time', ranks: 5, cost: [5, 8, 12, 16, 21] },
  { id: 'cradle', name: 'Lift cradle', each: 'the lift repairs 5% more', look: '', ranks: 3, cost: [8, 14, 22] },
  { id: 'spares', name: 'Spares shelf', each: 'your starting part comes a grade higher', look: '', ranks: 2, cost: [16, 28] },
];

// How mended KLP-2 is, for its looks: the body repairs, and how far along
// they are in all (0 to 1).
export function wear(meta) {
  const r = (id) => rank(meta, id);
  const body = BENCH.filter((b) => b.look);
  const done = body.reduce((n, b) => n + r(b.id), 0), all = body.reduce((n, b) => n + b.ranks, 0);
  return { plating: r('plating'), cells: r('cells'), servos: r('servos'), patience: r('patience'), pockets: r('pockets'), condition: done / all };
}

export function conditionWord(c) {
  return c < 0.12 ? 'scrap' : c < 0.35 ? 'battered' : c < 0.6 ? 'patched' : c < 0.88 ? 'sound' : 'gleaming';
}

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
    case 'record': return 4;     // a new highest deck
    case 'page': return 5;       // a page of the droid archive filled in
    default: return 0;
  }
}
