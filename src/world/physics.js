// Movement and collision for round bodies on the tile grid. Bodies slide
// along walls, roll up ramps, drop off ledges and bump into each other.
import { STEP_UP, GRAVITY } from '../config.js';

// The tile that blocks a body at (x, z) most deeply, and how deep it
// reaches into the body: { idx, depth }, with idx -1 when nothing does.
const probeOut = { idx: -1, depth: 0 };
function probe(grid, body, x, z, y) {
  const r = body.radius;
  const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
  const z0 = Math.floor(z - r), z1 = Math.floor(z + r);
  probeOut.idx = -1; probeOut.depth = 0;
  for (let tz = z0; tz <= z1; tz++) {
    for (let tx = x0; tx <= x1; tx++) {
      const cx = Math.max(tx, Math.min(tx + 1, x));
      const cz = Math.max(tz, Math.min(tz + 1, z));
      const dx = cx - x, dz = cz - z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      const top = grid.collideTop(body, tx, tz, cx, cz);
      if (top > y + STEP_UP) {
        const depth = r - Math.sqrt(d2);
        if (depth > probeOut.depth || probeOut.idx === -1) { probeOut.depth = depth; probeOut.idx = grid.inside(tx, tz) ? grid.idx(tx, tz) : -2; }
      }
    }
  }
  return probeOut;
}

// Returns the index of a tile that blocks a body at (x, z), or -1.
export function blockingTile(grid, body, x, z, y) {
  return probe(grid, body, x, z, y).idx;
}

// Can the body step to (x, z)? Yes if nothing's in the way, or if it's
// already caught on something (say it dropped off a ledge and landed
// against it) and this step takes it further out.
function stepTo(grid, body, x, z) {
  const y = body.pos.y;
  const next = probe(grid, body, x, z, y);
  if (next.idx === -1) return -1;
  const idx = next.idx, depth = next.depth;
  const now = probe(grid, body, body.pos.x, body.pos.z, y);
  if (now.idx !== -1 && depth < now.depth - 1e-4) return -1;
  return idx;
}

// Moves a body by (dx, dz), sliding along anything in the way.
// Returns the tiles that stopped it on each axis (-1 when clear).
export function moveBody(grid, body, dx, dz) {
  const dist = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(dist / (body.radius * 0.45)));
  const sx = dx / steps, sz = dz / steps;
  let hitX = -1, hitZ = -1;
  for (let i = 0; i < steps; i++) {
    if (sx !== 0) {
      const b = stepTo(grid, body, body.pos.x + sx, body.pos.z);
      if (b === -1) body.pos.x += sx; else hitX = b;
    }
    if (sz !== 0) {
      const b = stepTo(grid, body, body.pos.x, body.pos.z + sz);
      if (b === -1) body.pos.z += sz; else hitZ = b;
    }
  }
  return { hitX, hitZ };
}

// Gravity, landing and ramp-hugging. Returns impact speed on landing (0 if none).
export function updateVertical(grid, body, dt) {
  const g = grid.groundAt(body.pos.x, body.pos.z);
  body.groundY = g;
  if (body.airborne > 0 || body.hovering) {
    if (g !== null && g > body.pos.y) body.pos.y = g;
    body.vy = 0;
    body.grounded = false;
    return 0;
  }
  if (g !== null && body.vy <= 0 && body.pos.y <= g + 0.03) {
    body.pos.y = g; body.vy = 0; body.grounded = true;
    return 0;
  }
  // stay glued to the floor when rolling down a ramp
  if (body.grounded && g !== null && body.pos.y - g < 0.2 && body.vy <= 0) {
    body.pos.y = g; body.vy = 0;
    return 0;
  }
  body.grounded = false;
  body.vy -= GRAVITY * dt;
  body.pos.y += body.vy * dt;
  if (g !== null && body.pos.y <= g && body.pos.y > g - 0.6) {
    const impact = -body.vy;
    body.pos.y = g; body.vy = 0; body.grounded = true;
    return impact;
  }
  return 0;
}

// Push overlapping bodies apart and exchange momentum. onImpact(a, b, speed, nx, nz)
// fires when two bodies meet hard enough to count as a ram.
export function resolveBodies(grid, bodies, onImpact) {
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    if (!a.solid || a.phasing) continue;
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      if (!b.solid || b.phasing) continue;
      if (Math.abs(a.pos.y - b.pos.y) > 0.6) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const min = a.radius + b.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.0001;
      const nx = dx / d, nz = dz / d;
      const overlap = min - d;
      const ima = a.fixed ? 0 : 1 / a.mass, imb = b.fixed ? 0 : 1 / b.mass;
      const sum = ima + imb;
      if (sum === 0) continue;
      moveBody(grid, a, -nx * overlap * (ima / sum), -nz * overlap * (ima / sum));
      moveBody(grid, b, nx * overlap * (imb / sum), nz * overlap * (imb / sum));
      const rv = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
      if (rv < 0) {
        const e = 0.35;
        const jImp = (-(1 + e) * rv) / sum;
        a.vel.x -= jImp * ima * nx; a.vel.z -= jImp * ima * nz;
        b.vel.x += jImp * imb * nx; b.vel.z += jImp * imb * nz;
        if (onImpact) onImpact(a, b, -rv, nx, nz);
      }
    }
  }
}
