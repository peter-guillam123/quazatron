// Headless balance check for the hack: a fair-to-good player bot against
// the droid AI, across classes and pulser counts. Run: node tests/hack-balance.mjs
import { generateBoard, HackRound, reach } from '../src/hack/board.js';
import { HackAI } from '../src/hack/ai.js';
import { makeRng } from '../src/rng.js';
import { rowsFor, pulsersFor, timerFor, hackSkill } from '../src/world/roster.js';
import { LESSONS } from '../src/hack/lessons.js';

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
  const round = new HackRound(board, { timer: timerFor(cls), pulsers });
  const you = new HackAI(round, ps, playerSkill, { rng, delay: 0.4 });
  const them = new HackAI(round, es, hackSkill(cls), { rng });
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

// the lessons: a beginner (skill 0.25) against the lesson's opponent
console.log('\nlesson   win% for a beginner / a decent player');
for (const L of LESSONS) {
  const res = [0.25, 0.5].map((sk) => {
    let w = 0;
    for (let i = 0; i < N; i++) {
      const rng = makeRng(i * 31 + L.rows);
      const board = generateBoard(rng, { rows: L.rows, cls: 150, parts: L.parts, focus: L.focus, side: L.side });
      const ps = L.side && sideScore(board.sides[1]) > sideScore(board.sides[0]) ? 1 : 0;
      const pulsers = []; pulsers[ps] = 4; pulsers[1 - ps] = Math.min(3, L.enemy);
      const round = new HackRound(board, { timer: L.timer, pulsers });
      const you = new HackAI(round, ps, sk, { rng, delay: 1.0 });
      const them = new HackAI(round, 1 - ps, Math.min(0.25, L.skill), { rng, delay: 0.7 + L.delay });
      while (!round.over) { you.update(1 / 30); them.update(1 / 30); round.update(1 / 30); }
      const [a, b] = [round.result[ps], round.result[1 - ps]];
      w += a > b ? 1 : a === b ? 0.5 : 0;
    }
    return ((w / N) * 100).toFixed(0).padStart(3);
  });
  console.log(`${L.id.padEnd(8)} ${res.join(' / ')}`);
}
