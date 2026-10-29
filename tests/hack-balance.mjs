// Headless balance check for the hack: a fair-to-good player bot against
// the droid AI, across classes and pulser counts. Run: node tests/hack-balance.mjs
import { generateBoard, HackRound, reach } from '../src/hack/board.js';
import { HackAI } from '../src/hack/ai.js';
import { makeRng } from '../src/rng.js';
import { rowsFor, pulsersFor } from '../src/world/roster.js';

function sideScore(side) {
  let s = 0;
  for (let r = 0; r < side.rows; r++) {
    const out = reach(side, r);
    s += out.filter((x) => x === 1).length - out.filter((x) => x === 2).length;
  }
  return s;
}

function play(cls, playerPulsers, playerSkill, seed) {
  const rng = makeRng(seed);
  const board = generateBoard(rng, { rows: rowsFor(cls), cls });
  // the player looks at both sides and picks the better one
  const ps = sideScore(board.sides[0]) >= sideScore(board.sides[1]) ? 0 : 1;
  const es = 1 - ps;
  const pulsers = [];
  pulsers[ps] = playerPulsers;
  pulsers[es] = pulsersFor(cls);
  const round = new HackRound(board, { timer: 10, pulsers });
  const you = new HackAI(round, ps, playerSkill, { rng, delay: 0.4 });
  const them = new HackAI(round, es, Math.min(0.95, cls / 1000 + 0.1), { rng });
  const dt = 1 / 30;
  while (!round.over) { you.update(dt); them.update(dt); round.update(dt); }
  const [a, b] = [round.result[ps], round.result[es]];
  return a > b ? 1 : a === b ? 0.5 : 0;
}

const N = +process.argv[2] || 300;
console.log('class  pulsers  (enemy)  win% at player skill 0.45 / 0.7');
for (const cls of [130, 250, 400, 550, 700, 850, 999]) {
  for (const pp of [4, 5, 6]) {
    const res = [0.45, 0.7].map((sk) => {
      let w = 0;
      for (let i = 0; i < N; i++) w += play(cls, pp, sk, i * 7919 + cls);
      return ((w / N) * 100).toFixed(0).padStart(3);
    });
    console.log(`${String(cls).padStart(5)}  ${pp}        (${pulsersFor(cls)})     ${res.join(' / ')}`);
  }
}
