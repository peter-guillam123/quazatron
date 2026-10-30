// Headless playtest: a simple bot plays runs at high speed with no
// rendering, to catch crashes and see how hard each deck is.
// Run: node tests/sim.mjs [runs] [seed]
// the stub has to be in place before anything imports three
await import('./stub-dom.mjs');
const THREE = await import('three');
const { generateDeck } = await import('../src/world/deckgen.js');
const { World } = await import('../src/world/world.js');
const { makeRng } = await import('../src/rng.js');
const { T } = await import('../src/world/grid.js');
const { MODULES, SLOTS } = await import('../src/world/modules.js');
const { generateBoard, HackRound, reach } = await import('../src/hack/board.js');
const { HackAI } = await import('../src/hack/ai.js');
const { TUNING } = await import('../src/config.js');
const { hackSkill } = await import('../src/world/roster.js');

const noop = () => {};
const RUNS = +process.argv[2] || 3;
const SEED = +process.argv[3] || 1;

function fakeGame(run) {
  const g = {
    run,
    settings: { assist: false, hints: false, slowHack: false },
    audio: { play: noop },
    fx: { burst: noop, ring: noop, emit: noop, lightning: noop, ribbon: () => ({ points: [], width: 0 }), removeRibbon: noop },
    renderer: { scene: new THREE.Scene(), addShake: noop, follow: noop, flash: noop },
    env: { setMix: noop },
    hasPerk: (id) => run.perks.includes(id),
    stat: (k) => { run.stats[k] = (run.stats[k] || 0) + 1; },
    archiveSee: noop, toast: noop, announce: noop, hint: noop, hintOnce: noop,
    onPlayerRefresh: noop, attachPlayerGhost: noop, onEnterRoom: noop, onClearance: noop,
    onPlayerHurt: (a, src) => { run.hurt[src.kind || 'other'] = (run.hurt[src.kind || 'other'] || 0) + a; },
    flashEnergy: noop, deckClaimed: noop, offerFirmware: noop, victory: () => { run.won = true; },
    playerDied: () => { run.dead = true; },
    addScrap: (n) => { run.scrap = (run.scrap || 0) + n; }, ringOut: () => { run.ringouts = (run.ringouts || 0) + 1; },
    bountyClaimed: (d) => { if (d.bountyDone) return; d.bountyDone = true; run.bounties = (run.bounties || 0) + 1; },
    allyLost: noop, say: noop, onDroidHurt: noop, onSpotted: noop,
    hitFeedback: noop, word: noop, dodged: noop, prizeUnlocked: (room) => { run.prizes = (run.prizes || 0) + 1; },
    state: 'play', hitStop: 0,
  };
  return g;
}

// ---- tile pathfinding for the bot
function walkable(grid, x, z) {
  const t = grid.typeAt(x, z);
  if (t === T.VOID || t === T.WALL || t === T.PIT) return false;
  if (t === T.BRIDGE && !grid.on[grid.idx(x, z)]) return false;
  if (grid.block[grid.idx(x, z)] !== 0) return false;
  return true;
}
function edgeOk(grid, ax, az, bx, bz) {
  const mx = (ax + bx) / 2 + 0.5, mz = (az + bz) / 2 + 0.5;
  const ha = grid.surface(ax, az, Math.min(ax + 0.999, Math.max(ax + 0.001, mx)), Math.min(az + 0.999, Math.max(az + 0.001, mz)));
  const hb = grid.surface(bx, bz, Math.min(bx + 0.999, Math.max(bx + 0.001, mx)), Math.min(bz + 0.999, Math.max(bz + 0.001, mz)));
  if (ha === null || hb === null) return false;
  return Math.abs(ha - hb) < 0.3 || hb < ha;   // dropping down is fine
}
function path(grid, from, to) {
  const W = grid.w;
  const key = (x, z) => z * W + x;
  const start = key(from[0], from[1]), goal = key(to[0], to[1]);
  const prev = new Map([[start, -1]]);
  const q = [start];
  let end = -1;
  while (q.length) {
    const k = q.shift();
    // close enough: next to the goal will do
    if (Math.abs((k % W) - to[0]) <= 1 && Math.abs(Math.floor(k / W) - to[1]) <= 1) { end = k; break; }
    const x = k % W, z = Math.floor(k / W);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, nk = key(nx, nz);
      if (prev.has(nk) || !grid.inside(nx, nz)) continue;
      if (!walkable(grid, nx, nz) && nk !== goal) continue;
      if (grid.typeAt(nx, nz) === T.HAZARD && nk !== goal) continue;
      if (!edgeOk(grid, x, z, nx, nz)) continue;
      prev.set(nk, k);
      q.push(nk);
    }
  }
  if (end < 0) return null;
  const out = [];
  for (let k = end; k !== -1; k = prev.get(k)) out.unshift([k % W, Math.floor(k / W)]);
  out.push(to);
  return out;
}

function hackOutcome(spec, playerPulsers, rng) {
  const board = generateBoard(rng, { rows: spec.rows, cls: spec.cls });
  // like a player, pick the side whose wires reach more cells cleanly
  const score = (side) => { let s = 0; for (let r = 0; r < side.rows; r++) { const o = reach(side, r); s += o.filter((x) => x === 1).length - o.filter((x) => x === 2).length; } return s; };
  const ps = score(board.sides[0]) >= score(board.sides[1]) ? 0 : 1;
  const pulsers = []; pulsers[ps] = playerPulsers; pulsers[1 - ps] = spec.pulsers;
  const round = new HackRound(board, { timer: spec.timer, pulsers });
  const you = new HackAI(round, ps, 0.5, { rng, delay: 0.5 });
  const them = new HackAI(round, 1 - ps, hackSkill(spec.cls), { rng, delay: spec.stunned ? 2.7 : 0.6 });
  while (!round.over) { you.update(1 / 20); them.update(1 / 20); round.update(1 / 20); }
  return round.result[ps] > round.result[1 - ps];
}

function playerPulsers(p, run) {
  let g = 0;
  for (const s of SLOTS) { const m = p.mods[s]; if (m && !MODULES[m.id].starter) g += m.grade; }
  return Math.min(8, 4 + Math.floor(g / 6) + (run.perks.includes('overclock') ? 1 : 0));
}

function playDeck(n, run, seed) {
  const rng = makeRng(seed);
  const build = generateDeck(n, rng, { playerMods: run.mods });
  const game = fakeGame(run);
  const w = new World(game, build, run);
  game.world = w;
  const p = w.player;
  const dt = 1 / 30;
  let t = 0, lastPathT = -1, route = null, target = null, stuck = 0, lastPos = p.pos.clone();
  const log = { n, time: 0, hacks: 0, lost: 0, rams: 0, startHp: Math.round(p.integrity), voids: 0 };
  const origVoid = w.onFellIntoVoid.bind(w);
  w.onFellIntoVoid = (d) => { if (d.isPlayer) log.voids++; origVoid(d); };

  while (t < 360 && !run.dead && !run.won) {
    t += dt;
    // ---- bot brain
    const hostiles = w.droids.filter((d) => !d.isPlayer && d.alive && d.state === 'active');
    const room = w.grid.room[w.grid.idx(Math.floor(p.pos.x), Math.floor(p.pos.z))];
    let goal = null;
    const cmd = hostiles.find((d) => d.command);
    const near = hostiles.filter((d) => d.pos.distanceTo(p.pos) < 7).sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos))[0];
    if (w.mainframe) {
      const relay = w.relays.find((r) => !r.on);
      target = near || relay || w.mainframe;
    } else if (!w.clearance) target = near || cmd || hostiles[0];
    else target = near && near.pos.distanceTo(p.pos) < 3 ? near : w.lift;
    if (!target) break;
    goal = [Math.floor(target.pos.x), Math.floor(target.pos.z)];
    if (t - lastPathT > 0.5) {
      lastPathT = t;
      route = path(w.grid, [Math.floor(p.pos.x), Math.floor(p.pos.z)], goal);
    }
    let mx = 0, mz = 0;
    if (route && route.length > 1) {
      // aim for the next tile centre
      let i = 1;
      while (i < route.length - 1 && Math.hypot(route[i][0] + 0.5 - p.pos.x, route[i][1] + 0.5 - p.pos.z) < 0.4) i++;
      const nx = route[i][0] + 0.5, nz = route[i][1] + 0.5;
      const dx = nx - p.pos.x, dz = nz - p.pos.z, m = Math.hypot(dx, dz) || 1;
      mx = dx / m; mz = dz / m;
    } else {
      const dx = target.pos.x - p.pos.x, dz = target.pos.z - p.pos.z, m = Math.hypot(dx, dz) || 1;
      mx = dx / m; mz = dz / m;
    }
    // wriggle free when wedged against something
    if (stuck > 0.8) { const a = (Math.floor(t * 2) * 2.4) % (Math.PI * 2); mx = Math.cos(a); mz = Math.sin(a); }
    p.intent.mx = mx; p.intent.mz = mz;
    p.intent.arm = false; p.intent.drive = false; p.intent.core = false;
    const dist = target.pos.distanceTo(p.pos);
    if (target.kind === 'droid' && dist < 2.4 && p.cd.arm <= 0 && Math.random() < 0.2) p.intent.arm = true;
    if (p.modId('arm') === 'laser' && target.kind === 'droid' && dist < 8 && target.integrity > target.maxIntegrity * 0.5) p.intent.arm = true;

    // ---- interact
    const it = w.interaction();
    if (it && it.kind === 'lift' && it.ready) { log.time = t; break; }
    if (it && it.kind === 'grapple') {
      const tg = it.target;
      const spec = w.hackSpecFor(tg);
      const won = hackOutcome(spec, playerPulsers(p, run), rng);
      run.hackLog = run.hackLog || []; run.hackLog.push(`${tg.kind === 'droid' ? tg.family + tg.cls : tg.kind}:${won ? 'W' : 'L'}${spec.stunned ? 's' : ''}p${spec.pulsers}v${playerPulsers(p, run)}`);
      log.hacks++;
      if (won) {
        if (tg.kind === 'droid') {
          // take the best upgrade on offer
          for (const s of SLOTS) {
            const m = tg.mods[s];
            if (m && !MODULES[m.id].starter && (!p.mods[s] || MODULES[p.mods[s].id].starter || p.mods[s].grade < m.grade)) {
              p.mods[s] = { id: m.id, grade: m.grade }; p.refresh(); run.parts++;
              break;
            }
          }
          p.integrity = Math.min(p.maxIntegrity, p.integrity + p.maxIntegrity * 0.12);
          tg.state = 'hacked'; tg.solid = false; tg.downT = 0;
          w.claimEvent('droid', tg);
          if (tg.command) w.grantClearance('hacked');
        } else tg.onHackWin();
      } else {
        log.lost++;
        p.damage(8 + spec.cls / 45, { force: true, kind: 'feedback' });
        if (tg.kind === 'droid') tg.graceT = 2.5; else tg.onHackLose();
      }
    }
    w.update(dt);
    if (p.pos.distanceTo(lastPos) < 0.01) stuck += dt; else stuck = 0;
    lastPos.copy(p.pos);
    if (stuck > 8) {
      log.stuck = `at ${p.pos.x.toFixed(1)},${p.pos.y.toFixed(1)},${p.pos.z.toFixed(1)} target ${target.kind}${target.family || ''} at ${target.pos.x.toFixed(1)},${target.pos.y.toFixed(1)},${target.pos.z.toFixed(1)} route ${route ? route.length : 'none'} state ${p.state} stun ${p.stun.toFixed(1)}`;
      break;
    }
  }
  if (t >= 360 && target) log.timeout = `at ${p.pos.x.toFixed(1)},${p.pos.y.toFixed(1)},${p.pos.z.toFixed(1)} target ${target.kind}${target.family || ''}${target.command ? '*' : ''} at ${target.pos.x.toFixed(1)},${target.pos.y.toFixed(1)},${target.pos.z.toFixed(1)} route ${route ? route.length : 'none'} clearance ${w.clearance}`;
  log.time = Math.round(t);
  log.endHp = Math.round(p.integrity);
  log.claim = Math.round(w.claim * 100);
  run.mods = { drive: p.mods.drive, arm: p.mods.arm, core: p.mods.core };
  run.integrity = Math.max(1, p.integrity);
  run.integrity = Math.min(run.maxIntegrity, run.integrity + run.maxIntegrity * 0.25);
  w.dispose();
  return log;
}

for (let r = 0; r < RUNS; r++) {
  const run = {
    mods: { drive: { id: 'wheels', grade: 1 }, arm: null, core: null },
    integrity: TUNING.playerIntegrity, maxIntegrity: TUNING.playerIntegrity, maxEnergy: TUNING.playerEnergy,
    perks: [], stats: {}, hurt: {}, parts: 0,
  };
  const out = [];
  for (let n = 1; n <= 6 && !run.dead && !run.won; n++) {
    try {
      const log = playDeck(n, run, SEED * 1000 + r * 97 + n);
      out.push(log);
      if (log.stuck || log.time >= 360) break;
    } catch (e) {
      console.log(`run ${r} deck ${n} CRASH`, e.stack);
      break;
    }
  }
  console.log(`run ${r}: ${run.won ? 'WON' : run.dead ? 'died' : 'stopped'}`);
  for (const l of out) console.log('  ', JSON.stringify(l));
  console.log('   stats', JSON.stringify(run.stats));
  console.log('   hurt by', JSON.stringify(Object.fromEntries(Object.entries(run.hurt).map(([k, v]) => [k, Math.round(v)]))), 'mods', JSON.stringify(run.mods));
}
