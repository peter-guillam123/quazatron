// The tile grid every deck is built on. One tile is one world unit square;
// heights are in levels of LEVEL_H. North is -z, east is +x.
import { LEVEL_H } from '../config.js';

export const T = {
  VOID: 0, FLOOR: 1, RAMP: 2, WALL: 3, PIT: 4, HAZARD: 5, BRIDGE: 6,
};

// Tile directions, N E S W
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export const WALL_LEVELS = 3;

export class Grid {
  constructor(w, d) {
    this.w = w; this.d = d;
    const n = w * d;
    this.type = new Uint8Array(n);
    this.h = new Int8Array(n);
    this.dir = new Uint8Array(n);
    this.block = new Uint8Array(n);   // 0 open, 1 solid (door, crate, terminal), 2 force field
    this.on = new Uint8Array(n);      // bridges: 1 when extended
    this.room = new Int16Array(n).fill(-1);
    this.variant = new Uint8Array(n);
  }

  idx(x, z) { return z * this.w + x; }
  inside(x, z) { return x >= 0 && z >= 0 && x < this.w && z < this.d; }

  typeAt(x, z) { return this.inside(x, z) ? this.type[this.idx(x, z)] : T.VOID; }
  hAt(x, z) { return this.inside(x, z) ? this.h[this.idx(x, z)] : 0; }

  set(x, z, type, h = 0, dir = 0) {
    if (!this.inside(x, z)) return;
    const i = this.idx(x, z);
    this.type[i] = type; this.h[i] = h; this.dir[i] = dir;
  }

  // True where something can stand (ignores dynamic blockers).
  isGround(x, z) {
    const t = this.typeAt(x, z);
    if (t === T.VOID || t === T.PIT || t === T.WALL) return false;
    if (t === T.BRIDGE) return this.on[this.idx(x, z)] === 1;
    return true;
  }

  // Surface height of tile (tx, tz) at world point (x, z), or null for a hole.
  surface(tx, tz, x, z) {
    if (!this.inside(tx, tz)) return null;
    const i = this.idx(tx, tz);
    const t = this.type[i];
    const h = this.h[i];
    switch (t) {
      case T.VOID: case T.PIT: return null;
      case T.BRIDGE: return this.on[i] ? h * LEVEL_H : null;
      case T.WALL: return (h + WALL_LEVELS) * LEVEL_H;
      case T.RAMP: {
        const fx = Math.min(1, Math.max(0, x - tx));
        const fz = Math.min(1, Math.max(0, z - tz));
        const d = this.dir[i];
        const k = d === 0 ? 1 - fz : d === 1 ? fx : d === 2 ? fz : 1 - fx;
        return (h + k) * LEVEL_H;
      }
      default: return h * LEVEL_H;
    }
  }

  groundAt(x, z) {
    return this.surface(Math.floor(x), Math.floor(z), x, z);
  }

  // Top of a tile as an obstacle for a body at point (x, z).
  collideTop(body, tx, tz, x, z) {
    if (!this.inside(tx, tz)) return -Infinity;
    const i = this.idx(tx, tz);
    const b = this.block[i];
    if (b === 1) return Infinity;
    if (b === 2 && !body.phasing) return Infinity;
    const t = this.type[i];
    if (t === T.WALL) return Infinity;
    const s = this.surface(tx, tz, x, z);
    return s === null ? -Infinity : s;
  }

  // Height of the top edge of a tile at a corner, for meshing. Holes give null.
  cornerTop(tx, tz, cx, cz) {
    return this.surface(tx, tz, cx, cz);
  }
}
