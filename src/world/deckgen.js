// Builds a deck: lays out a path of rooms on a grid of cells, hangs vaults
// and extras off it, picks and rotates templates to fit, stamps them into a
// tile grid and joins them with bridges. Then decides which droids live where.
import { Grid, T, DIRS } from './grid.js';
import { ROOMS, rotateRoom, roomExits } from './rooms.js';
import { DECKS } from '../config.js';
import { FAMILIES, familiesForRange } from './roster.js';
import { STEALABLE } from './modules.js';

const FLOOR_CHARS = new Set(['.', 'd', 'k', 'S', 'm', '$', 'p', 'P', '+', 'c', 'C', 'A', 'T', 't', 'x', 'g', 'L', 'D', 'F', 'f', 'R', 'M']);

export function generateDeck(n, rng, opts = {}) {
  const deck = DECKS[n - 1];
  const plan = layout(n, rng, opts);
  const CELL = n === 6 ? 24 : 16;

  // ---- choose templates
  const used = new Set();
  const available = availableModules(deck, opts.playerMods);
  for (const cell of plan.cells) {
    const need = cell.links.map((o) => dirTo(cell, o));
    const tag = cell.role;
    let cands = ROOMS.filter((r) => r.tags.includes(tag) && (r.minDeck || 1) <= n && (r.maxDeck || 9) >= n);
    if (tag === 'vault') {
      cands = cands.filter((r) => !r.solves.length || r.solves.some((m) => available.has(m)));
    }
    const fresh = cands.filter((r) => !used.has(r.id));
    const pool = rng.shuffle((fresh.length ? fresh : cands).slice());
    let chosen = null;
    for (const r of pool) {
      const ks = rng.shuffle([0, 1, 2, 3]);
      for (const k of ks) {
        const rr = rotateRoom(r, k);
        const ex = roomExits(rr);
        if (need.every((d) => ex.includes(d))) { chosen = rr; break; }
      }
      if (chosen) break;
    }
    if (!chosen) throw new Error(`No ${tag} room fits exits ${need}`);
    used.add(chosen.id);
    cell.room = chosen;
  }

  // ---- grid bounds
  const xs = plan.cells.map((c) => c.x), zs = plan.cells.map((c) => c.z);
  const minX = Math.min(...xs), minZ = Math.min(...zs);
  const W = (Math.max(...xs) - minX + 1) * CELL;
  const D = (Math.max(...zs) - minZ + 1) * CELL;
  const grid = new Grid(W, D);
  const things = [];
  const rooms = [];

  plan.cells.forEach((cell, index) => {
    const r = cell.room;
    const w = r.map[0].length, d = r.map.length;
    const ox = (cell.x - minX) * CELL + Math.floor((CELL - w) / 2);
    const oz = (cell.z - minZ) * CELL + Math.floor((CELL - d) / 2);
    const heights = resolveHeights(r);
    const info = {
      index, id: r.id, role: cell.role, tags: r.tags, hint: r.hint, solves: r.solves || [],
      ox, oz, w, d, cx: ox + (w - 1) / 2, cz: oz + (d - 1) / 2,
      cell: { x: cell.x - minX, z: cell.z - minZ }, links: [], spawns: [], visited: false,
    };
    rooms.push(info);
    for (let j = 0; j < d; j++) {
      for (let i = 0; i < w; i++) {
        const c = r.map[j][i];
        // claim the whole rectangle, holes included, so bridges never fill them
        grid.room[grid.idx(ox + i, oz + j)] = index;
        if (c === ' ') continue;
        const x = ox + i, z = oz + j;
        const h = heights[j * w + i];
        const ch = r.ch ? r.ch[j][i] : '1';
        let type = T.FLOOR, dir = 0;
        if (c === '#') type = T.WALL;
        else if (c === '~') type = T.HAZARD;
        else if (c === 'o') type = T.PIT;
        else if (c === '=') type = T.BRIDGE;
        else if ('^>v<'.includes(c)) { type = T.RAMP; dir = '^>v<'.indexOf(c); }
        grid.set(x, z, type, h, dir);
        grid.room[grid.idx(x, z)] = index;
        grid.variant[grid.idx(x, z)] = floorVariant(rng);
        if (c === 'd' || c === 'k') info.spawns.push({ x: x + 0.5, z: z + 0.5, h, command: c === 'k' });
        else if (FLOOR_CHARS.has(c) && c !== '.' || c === '=' || c === 'o') {
          things.push({ t: c, x, z, h, room: index, ch: `${index}:${/[1-9]/.test(ch) ? ch : '1'}` });
        }
      }
    }
  });

  // ---- bridges between linked rooms
  for (const [a, b] of plan.links) {
    const A = rooms[a], B = rooms[b];
    A.links.push(b); B.links.push(a);
    const ca = plan.cells[a], cb = plan.cells[b];
    const d = dirTo(ca, cb);
    const [dx, dz] = DIRS[d];
    // walk from A's centre to B's centre, filling void along a 3-wide strip
    let x = Math.round(A.cx), z = Math.round(A.cz);
    const tx = Math.round(B.cx), tz = Math.round(B.cz);
    while (x !== tx || z !== tz) {
      x += dx; z += dz;
      for (let s = -1; s <= 1; s++) {
        const bx = x + (dz !== 0 ? s : 0), bz = z + (dx !== 0 ? s : 0);
        if (grid.typeAt(bx, bz) === T.VOID && grid.room[grid.idx(bx, bz)] === -1) {
          grid.set(bx, bz, T.FLOOR, 0);
          grid.variant[grid.idx(bx, bz)] = 2 + (s === 0 ? 1 : 0);
          grid.room[grid.idx(bx, bz)] = -2;   // bridge
        }
      }
    }
  }

  // ---- start
  const startThing = things.find((t) => t.t === 'S');
  const start = { x: startThing.x + 0.5, z: startThing.z + 0.5, h: startThing.h };

  // ---- droids
  const droids = placeDroids(n, deck, rng, rooms, opts);

  // ---- module caches get their contents now, so a seed replays the same
  for (const t of things) {
    if (t.t === 'm') {
      const grade = Math.min(9, Math.floor(deck.classes[1] / 100) + 1);
      const ids = rng.shuffle(STEALABLE.slice()).slice(0, 2);
      t.offer = ids.map((id) => ({ id, grade }));
    }
  }

  return { n, deck, grid, rooms, things, droids, start, links: plan.links, cell: CELL };
}

function floorVariant(rng) {
  const r = rng();
  return r < 0.5 ? 0 : r < 0.72 ? 1 : r < 0.82 ? 2 : 3;
}

function dirTo(a, b) {
  if (b.x > a.x) return 1;
  if (b.x < a.x) return 3;
  if (b.z > a.z) return 2;
  return 0;
}

function layout(n, rng, opts) {
  if (n === 6) {
    const cells = [{ x: 0, z: 1, role: 'start', links: [] }, { x: 0, z: 0, role: 'boss', links: [] }];
    cells[0].links.push(cells[1]); cells[1].links.push(cells[0]);
    return { cells, links: [[0, 1]] };
  }
  const mainLen = [4, 5, 5, 6, 6][n - 1] + (n > 1 && rng.chance(0.4) ? 1 : 0);
  let cells = null;
  for (let attempt = 0; attempt < 200 && !cells; attempt++) {
    const path = [{ x: 0, z: 0 }];
    const occ = new Set(['0,0']);
    let heading = rng.int(0, 3);
    for (let i = 1; i < mainLen; i++) {
      const last = path[path.length - 1];
      const opts2 = [];
      for (let d = 0; d < 4; d++) {
        const nx = last.x + DIRS[d][0], nz = last.z + DIRS[d][1];
        if (occ.has(`${nx},${nz}`)) continue;
        // don't let the path touch itself except where it came from
        let touches = 0;
        for (let e = 0; e < 4; e++) if (occ.has(`${nx + DIRS[e][0]},${nz + DIRS[e][1]}`)) touches++;
        if (touches > 1) continue;
        opts2.push({ d, x: nx, z: nz, w: d === heading ? 3 : (d + 2) % 4 === heading ? 0 : 1.5 });
      }
      if (!opts2.length) break;
      const total = opts2.reduce((s, o) => s + o.w, 0);
      let r = rng() * total, pick = opts2[0];
      for (const o of opts2) { r -= o.w; if (r <= 0) { pick = o; break; } }
      heading = pick.d;
      path.push({ x: pick.x, z: pick.z });
      occ.add(`${pick.x},${pick.z}`);
    }
    if (path.length < mainLen) continue;

    const all = path.map((p, i) => ({ ...p, role: i === 0 ? 'start' : i === mainLen - 1 ? 'lift' : 'combat', links: [] }));
    const links = [];
    for (let i = 1; i < all.length; i++) links.push([i - 1, i]);

    // branches: vaults, an archive, maybe a repair bay
    const branches = [];
    const vaults = n === 1 ? 1 : n <= 2 ? rng.int(1, 2) : 2;
    for (let i = 0; i < vaults; i++) branches.push('vault');
    if (n === 1 || rng.chance(0.6)) branches.push('archive');
    if (n >= 2 && rng.chance(0.55)) branches.push('repair');
    let ok = true;
    for (const role of branches) {
      const hosts = rng.shuffle(all.map((c, i) => i).filter((i) => all[i].role === 'combat' || (role !== 'vault' && all[i].role === 'start')));
      let placed = false;
      for (const h of hosts) {
        const host = all[h];
        const dirs = rng.shuffle([0, 1, 2, 3]);
        for (const d of dirs) {
          const nx = host.x + DIRS[d][0], nz = host.z + DIRS[d][1];
          if (all.some((c) => c.x === nx && c.z === nz)) continue;
          all.push({ x: nx, z: nz, role, links: [] });
          links.push([h, all.length - 1]);
          placed = true;
          break;
        }
        if (placed) break;
      }
      if (!placed) { ok = false; break; }
    }
    if (!ok) continue;
    for (const [a, b] of links) { all[a].links.push(all[b]); all[b].links.push(all[a]); }
    cells = { cells: all, links };
  }
  if (!cells) throw new Error('Could not lay out deck');
  return cells;
}

// Heights: digits are explicit; ramps take their low neighbour's height;
// everything else copies the commonest height around it.
function resolveHeights(room) {
  const m = room.map;
  const w = m[0].length, d = m.length;
  const H = new Array(w * d).fill(null);
  const at = (i, j) => (i < 0 || j < 0 || i >= w || j >= d ? ' ' : m[j][i]);
  for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
    const c = m[j][i];
    if (c === '.' || c === ' ') H[j * w + i] = 0;
    else if (/[0-9]/.test(c)) H[j * w + i] = +c;
  }
  for (let pass = 0; pass < 6; pass++) {
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
      const c = m[j][i];
      const k = '^>v<'.indexOf(c);
      if (k < 0 || H[j * w + i] !== null) continue;
      const li = i - DIRS[k][0], lj = j - DIRS[k][1];
      const lc = at(li, lj);
      if (lc === ' ') continue;
      const lh = H[lj * w + li];
      if (lh === null) continue;
      H[j * w + i] = lc === c ? lh + 1 : lh;
    }
  }
  for (let pass = 0; pass < 4; pass++) {
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
      if (H[j * w + i] !== null) continue;
      const counts = new Map();
      for (const [dx, dz] of DIRS) {
        const ni = i + dx, nj = j + dz;
        const c = at(ni, nj);
        if (c === ' ' || '^>v<'.includes(c)) continue;
        const v = H[nj * w + ni];
        if (v === null || v === undefined) continue;
        counts.set(v, (counts.get(v) || 0) + 1);
      }
      if (!counts.size) continue;
      let best = null, bc = -1;
      for (const [v, c] of counts) if (c > bc || (c === bc && v < best)) { best = v; bc = c; }
      H[j * w + i] = best;
    }
  }
  return H.map((v) => v ?? 0);
}

function availableModules(deck, playerMods) {
  const set = new Set();
  for (const f of familiesForRange(deck.classes[0], deck.classes[1])) {
    const F = FAMILIES[f];
    for (const m of [F.drive, F.arm, F.core]) if (m) set.add(m);
  }
  if (playerMods) for (const s of ['drive', 'arm', 'core']) if (playerMods[s]) set.add(playerMods[s].id);
  return set;
}

function pickFamily(rng, pool, lo, hi) {
  // lower classes turn up more often
  const weights = pool.map((f) => 1 + 2 * (1 - (FAMILIES[f].min - lo) / Math.max(1, hi - lo)));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

function classIn(rng, fam, lo, hi) {
  const F = FAMILIES[fam];
  const a = Math.max(F.min, lo), b = Math.min(F.max, hi);
  return a <= b ? rng.int(a, b) : rng.int(F.min, F.max);
}

function placeDroids(n, deck, rng, rooms, opts) {
  const [lo, hi] = deck.classes;
  const pool = familiesForRange(lo, hi);
  const out = [];
  const perRoom = { combat: [2, 3, 3, 4, 4, 5][n - 1], lift: [1, 2, 2, 2, 3, 2][n - 1], archive: [1, 2, 2, 2, 3, 2][n - 1], boss: 2 };

  for (const room of rooms) {
    const spawns = room.spawns.filter((s) => !s.command);
    const cmd = room.spawns.find((s) => s.command);
    let count = perRoom[room.role] || 0;
    if (room.role === 'combat' && rng.chance(0.4)) count += 1;
    if (room.role === 'boss') count = 0;   // the Mainframe calls its own
    rng.shuffle(spawns);
    for (let i = 0; i < Math.min(count, spawns.length); i++) {
      const fam = pickFamily(rng, pool, lo, hi);
      out.push({ family: fam, cls: classIn(rng, fam, lo, hi), x: spawns[i].x, z: spawns[i].z, h: spawns[i].h, room: room.index });
    }
    if (cmd && room.role === 'lift') {
      const top = pool.filter((f) => FAMILIES[f].max >= hi - 80);
      const fam = rng.pick(top.length ? top : pool);
      const F = FAMILIES[fam];
      const cls = Math.max(F.min, Math.min(F.max, hi - rng.int(0, 40)));
      out.push({ family: fam, cls, x: cmd.x, z: cmd.z, h: cmd.h, room: room.index, command: true });
    }
  }

  // First run: the first room teaches the hack with easy targets.
  if (opts.tutorial && n === 1) {
    const first = rooms.find((r) => r.role === 'combat' && r.links.includes(0)) || rooms.find((r) => r.role === 'combat');
    const inFirst = out.filter((d) => d.room === first.index);
    const want = ['mite', 'spark'];
    inFirst.forEach((d, i) => { if (i < want.length) { d.family = want[i]; d.cls = classIn(rng, want[i], 101, 160); } });
    while (inFirst.length < 2 && first.spawns.length > inFirst.length) {
      const s = first.spawns[inFirst.length];
      const fam = want[inFirst.length];
      const d = { family: fam, cls: classIn(rng, fam, 101, 160), x: s.x, z: s.z, h: s.h, room: first.index };
      out.push(d); inFirst.push(d);
    }
  }

  // Every vault's key should be walking around somewhere on the deck.
  const have = new Set();
  if (opts.playerMods) for (const s of ['drive', 'arm', 'core']) if (opts.playerMods[s]) have.add(opts.playerMods[s].id);
  for (const room of rooms) {
    if (room.role !== 'vault' || !room.solves.length) continue;
    if (room.solves.some((m) => have.has(m))) continue;
    const carries = (d) => { const F = FAMILIES[d.family]; return room.solves.some((m) => m === F.drive || m === F.arm || m === F.core); };
    if (out.some(carries)) continue;
    const fams = pool.filter((f) => { const F = FAMILIES[f]; return room.solves.some((m) => m === F.drive || m === F.arm || m === F.core); });
    if (!fams.length) continue;
    fams.sort((a, b) => FAMILIES[a].min - FAMILIES[b].min);
    const victims = out.filter((d) => !d.command && rooms[d.room].role === 'combat');
    const v = victims.length ? rng.pick(victims) : null;
    if (v) { v.family = fams[0]; v.cls = classIn(rng, fams[0], lo, hi); }
  }
  return out;
}
