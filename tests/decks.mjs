// Every deck must be fully reachable: from the start you can roll to the
// lift, the command droid, every droid and every terminal, without needing
// any particular part. Run: node tests/decks.mjs [seeds]
await import('./stub-dom.mjs');
const { T } = await import('../src/world/grid.js');
const { generateDeck } = await import('../src/world/deckgen.js');
const { makeRng } = await import('../src/rng.js');

const SEEDS = +process.argv[2] || 300;

// Same rules as the physics, made conservative: four-way moves only, a step
// up must be under the step height, dropping down is fine.
function edgeOk(g, ax, az, bx, bz) {
  const mx = (ax + bx) / 2 + 0.5, mz = (az + bz) / 2 + 0.5;
  const cl = (v, t) => Math.min(t + 0.999, Math.max(t + 0.001, v));
  const ha = g.surface(ax, az, cl(mx, ax), cl(mz, az));
  const hb = g.surface(bx, bz, cl(mx, bx), cl(mz, bz));
  if (ha === null || hb === null) return false;
  return hb - ha < 0.3;
}
function passable(g, x, z, blocked) {
  const t = g.typeAt(x, z);
  if (t === T.VOID || t === T.WALL || t === T.PIT || t === T.BRIDGE || t === T.HAZARD) return false;
  return !blocked.has(z * g.w + x);
}

let failures = 0, decks = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  for (const n of [1, 2, 3, 4, 5, 6]) {
    const b = generateDeck(n, makeRng(seed * 7919 + n), {});
    decks++;
    const g = b.grid;
    const blocked = new Set();
    // switched doors and fields open from a terminal in the same room, so
    // they count as passable; permanent fields don't
    const solid = 'fcCtxTAgRM';
    for (const t of b.things) if (solid.includes(t.t)) blocked.add(t.z * g.w + t.x);
    // the Mainframe fills a 3x3 block
    for (const t of b.things) if (t.t === 'M') for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) blocked.add((t.z + dz) * g.w + t.x + dx);
    const seen = new Set();
    const st = [Math.floor(b.start.x), Math.floor(b.start.z)];
    const q = [st];
    seen.add(st[1] * g.w + st[0]);
    while (q.length) {
      const [x, z] = q.shift();
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, k = nz * g.w + nx;
        if (seen.has(k) || !g.inside(nx, nz) || !passable(g, nx, nz, blocked) || !edgeOk(g, x, z, nx, nz)) continue;
        seen.add(k); q.push([nx, nz]);
      }
    }
    const near = (x, z) => seen.has(z * g.w + x) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => seen.has((z + dz) * g.w + x + dx));
    const problems = [];
    for (const t of b.things) {
      if (b.rooms[t.room] && b.rooms[t.room].role === 'vault') continue;
      if ('LTAR'.includes(t.t) && !near(t.x, t.z)) problems.push(`${t.t} in ${b.rooms[t.room].id}`);
      // the Mainframe is grappled from the ring of floor around its block
      if (t.t === 'M') {
        let ok = false;
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (seen.has((t.z + dz) * g.w + t.x + dx)) ok = true;
        if (!ok) problems.push('the Mainframe');
      }
    }
    for (const d of b.droids) {
      if (!near(Math.floor(d.x), Math.floor(d.z))) problems.push(`${d.command ? 'command ' : ''}droid in ${b.rooms[d.room].id}`);
    }
    // every room's exits should be reachable too
    for (const r of b.rooms) {
      if (r.role === 'vault') continue;
      const inside = [];
      for (let z = r.oz; z < r.oz + r.d; z++) for (let x = r.ox; x < r.ox + r.w; x++) if (seen.has(z * g.w + x)) inside.push(1);
      if (!inside.length) problems.push(`room ${r.id} unreachable`);
    }
    if (problems.length) {
      failures++;
      if (failures <= 12) console.log(`deck ${n} seed ${seed * 7919 + n}: ${[...new Set(problems)].join('; ')}`);
    }
  }
}
console.log(`${decks - failures} of ${decks} decks fully reachable`);
process.exitCode = failures ? 1 : 0;
