// Turns a Grid into a few merged meshes: floor tops, platform sides, walls,
// glowing edge trims and live hazard floors. Only visible faces are built.
import * as THREE from 'three';
import { T, DIRS, WALL_LEVELS } from '../world/grid.js';
import { LEVEL_H } from '../config.js';
import { makeFloorTextures, makeSideTexture, makeWallTextures } from './textures.js';

const ABYSS = -3.2;      // how far platform sides hang below their top
const PIT_DEPTH = 1.0;

let shared = null;
function sharedTextures() {
  if (!shared) {
    shared = { floor: makeFloorTextures(), side: makeSideTexture(), wall: makeWallTextures() };
  }
  return shared;
}

class GeoBuilder {
  constructor() { this.pos = []; this.uv = []; this.col = []; this.idx = []; }
  quad(a, b, c, d, uvs, cols) {
    const base = this.pos.length / 3;
    for (const p of [a, b, c, d]) this.pos.push(p[0], p[1], p[2]);
    for (const u of uvs) this.uv.push(u[0], u[1]);
    for (const c2 of cols) this.col.push(c2[0], c2[1], c2[2]);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
  get empty() { return this.idx.length === 0; }
}

// corners of a tile edge in direction d, ordered so the face points outward
function edgeCorners(tx, tz, d) {
  switch (d) {
    case 0: return [[tx + 1, tz], [tx, tz]];          // north edge, faces -z
    case 1: return [[tx + 1, tz + 1], [tx + 1, tz]];  // east edge, faces +x
    case 2: return [[tx, tz + 1], [tx + 1, tz + 1]];  // south edge, faces +z
    default: return [[tx, tz], [tx, tz + 1]];         // west edge, faces -x
  }
}

// Top height of tile at a corner point, nudged inside the tile so ramps read right.
function topAtCorner(grid, tx, tz, cx, cz) {
  const t = grid.typeAt(tx, tz);
  if (t === T.WALL) return (grid.hAt(tx, tz) + WALL_LEVELS) * LEVEL_H;
  if (t === T.PIT) return grid.hAt(tx, tz) * LEVEL_H - PIT_DEPTH;
  if (t === T.VOID) return null;
  if (t === T.BRIDGE) return null; // bridges are drawn by their device
  const x = Math.min(tx + 0.999, Math.max(tx + 0.001, cx));
  const z = Math.min(tz + 0.999, Math.max(tz + 0.001, cz));
  return grid.surface(tx, tz, x, z);
}

export function buildLevelMesh(grid, deck, rng) {
  const tex = sharedTextures();
  const tops = new GeoBuilder();
  const hazards = new GeoBuilder();
  const sides = new GeoBuilder();
  const walls = new GeoBuilder();
  const wallTops = new GeoBuilder();
  const trims = new GeoBuilder();
  const pits = new GeoBuilder();

  const shade = () => { const s = 0.86 + rng() * 0.14; return [s, s, s]; };

  for (let z = 0; z < grid.d; z++) {
    for (let x = 0; x < grid.w; x++) {
      const t = grid.typeAt(x, z);
      if (t === T.VOID || t === T.BRIDGE) continue;
      const h = grid.hAt(x, z);
      const y = h * LEVEL_H;

      if (t === T.PIT) {
        const yb = y - PIT_DEPTH;
        pits.quad([x, yb, z + 1], [x + 1, yb, z + 1], [x + 1, yb, z], [x, yb, z],
          [[0, 0], [1, 0], [1, 1], [0, 1]], [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]]);
        continue;
      }

      // --- top face
      const v = grid.variant[grid.idx(x, z)] & 3;
      const u0 = (v % 2) * 0.5, v0 = 1 - Math.floor(v / 2) * 0.5;
      const uvs = [[u0 + 0.004, v0 - 0.496], [u0 + 0.496, v0 - 0.496], [u0 + 0.496, v0 - 0.004], [u0 + 0.004, v0 - 0.004]];
      if (t === T.WALL) {
        const yt = (h + WALL_LEVELS) * LEVEL_H;
        const c = [0.55, 0.55, 0.6];
        wallTops.quad([x, yt, z + 1], [x + 1, yt, z + 1], [x + 1, yt, z], [x, yt, z], uvs, [c, c, c, c]);
      } else {
        const p = [[x, z + 1], [x + 1, z + 1], [x + 1, z], [x, z]];
        const ys = p.map(([cx, cz]) => topAtCorner(grid, x, z, cx, cz));
        const c = shade();
        const target = t === T.HAZARD ? hazards : tops;
        target.quad([p[0][0], ys[0], p[0][1]], [p[1][0], ys[1], p[1][1]], [p[2][0], ys[2], p[2][1]], [p[3][0], ys[3], p[3][1]],
          t === T.HAZARD ? [[0, 0], [1, 0], [1, 1], [0, 1]] : uvs, [c, c, c, c]);
      }

      // --- side faces where the neighbour is lower
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d][0], nz = z + DIRS[d][1];
        const [c0, c1] = edgeCorners(x, z, d);
        const a0 = topAtCorner(grid, x, z, c0[0], c0[1]);
        const a1 = topAtCorner(grid, x, z, c1[0], c1[1]);
        let b0 = topAtCorner(grid, nx, nz, c0[0], c0[1]);
        let b1 = topAtCorner(grid, nx, nz, c1[0], c1[1]);
        const nt = grid.typeAt(nx, nz);
        const intoVoid = b0 === null || nt === T.VOID || nt === T.BRIDGE;
        if (intoVoid) { b0 = ABYSS + y * 0.3; b1 = b0; }
        if (b0 >= a0 - 0.001 && b1 >= a1 - 0.001) continue;
        b0 = Math.min(b0, a0); b1 = Math.min(b1, a1);
        const isWall = t === T.WALL;
        const target = isWall ? walls : sides;
        const scale = isWall ? WALL_LEVELS * LEVEL_H : 2;
        const top = Math.max(a0, a1);
        const ca = isWall ? [1, 1, 1] : [1, 1, 1];
        const fade = (yy) => {
          if (isWall) return [1, 1, 1];
          const k = intoVoid ? Math.max(0, Math.min(1, (yy - (ABYSS + y * 0.3)) / (top - (ABYSS + y * 0.3) + 0.001))) : 1;
          const s = 0.15 + 0.85 * k;
          return [s, s, s];
        };
        target.quad(
          [c0[0], b0, c0[1]], [c1[0], b1, c1[1]], [c1[0], a1, c1[1]], [c0[0], a0, c0[1]],
          [[0, (top - b0) / scale], [1, (top - b1) / scale], [1, (top - a1) / scale], [0, (top - a0) / scale]],
          [fade(b0), fade(b1), ca, ca]);

        // glowing trim along the lip
        if (Math.max(a0 - b0, a1 - b1) > 0.2) {
          const o = 0.004;
          const nxo = DIRS[d][0] * o, nzo = DIRS[d][1] * o;
          const th = isWall ? 0.035 : 0.05;
          const w = [1, 1, 1];
          trims.quad(
            [c0[0] + nxo, a0 - th, c0[1] + nzo], [c1[0] + nxo, a1 - th, c1[1] + nzo],
            [c1[0] + nxo, a1, c1[1] + nzo], [c0[0] + nxo, a0, c0[1] + nzo],
            [[0, 0], [1, 0], [1, 1], [0, 1]], [w, w, w, w]);
        }
      }
    }
  }

  const group = new THREE.Group();
  group.name = 'level';

  const paper = new THREE.Color(deck.paper);
  const floorMat = new THREE.MeshStandardMaterial({
    map: tex.floor.map, emissiveMap: tex.floor.emissiveMap,
    color: new THREE.Color(0x8a8fa0).lerp(paper, 0.25),
    emissive: new THREE.Color(deck.ink), emissiveIntensity: 0.28,
    roughness: 0.62, metalness: 0.25, vertexColors: true,
  });
  const sideMat = new THREE.MeshStandardMaterial({
    map: tex.side, color: new THREE.Color(0x737a8c).lerp(paper, 0.3),
    roughness: 0.75, metalness: 0.2, vertexColors: true,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    map: tex.wall.map, emissiveMap: tex.wall.emissiveMap,
    color: new THREE.Color(0x7c8396).lerp(paper, 0.25),
    emissive: new THREE.Color(deck.ink), emissiveIntensity: 0.9,
    roughness: 0.55, metalness: 0.3, vertexColors: true,
  });
  const wallTopMat = new THREE.MeshStandardMaterial({
    map: tex.floor.map, color: 0x4a4f5e, roughness: 0.7, metalness: 0.2, vertexColors: true,
  });
  const trimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(deck.ink).multiplyScalar(2.2), vertexColors: true });
  const hazardMat = new THREE.MeshStandardMaterial({
    color: 0x111111, emissive: new THREE.Color(deck.ink), emissiveIntensity: 1.0,
    emissiveMap: makeHazardTexture(), roughness: 0.4, metalness: 0.1, vertexColors: true,
  });
  const pitMat = new THREE.MeshBasicMaterial({ map: makePitTexture(), color: new THREE.Color(deck.ink).multiplyScalar(0.9) });

  const add = (b, mat, opts = {}) => {
    if (b.empty) return null;
    const m = new THREE.Mesh(b.build(), mat);
    m.receiveShadow = true;
    m.castShadow = !!opts.cast;
    group.add(m);
    return m;
  };
  add(tops, floorMat);
  add(sides, sideMat, { cast: true });
  add(walls, wallMat, { cast: true });
  add(wallTops, wallTopMat, { cast: true });
  const trimMesh = add(trims, trimMat);
  if (trimMesh) trimMesh.receiveShadow = false;
  const hazardMesh = add(hazards, hazardMat);
  add(pits, pitMat);

  return {
    group,
    materials: { floorMat, sideMat, wallMat, trimMat, hazardMat, pitMat },
    hazardMesh,
    dispose() {
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      for (const m of [floorMat, sideMat, wallMat, wallTopMat, trimMat, hazardMat, pitMat]) m.dispose();
    },
  };
}

let hazardTex = null;
function makeHazardTexture() {
  if (hazardTex) return hazardTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
  g.strokeRect(6, 6, 116, 116);
  g.strokeStyle = '#fff'; g.lineWidth = 3; g.lineJoin = 'bevel';
  let s = 5;
  const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    let x = 10, y = 20 + k * 40;
    g.moveTo(x, y);
    while (x < 118) { x += 8 + r() * 12; y += (r() - 0.5) * 24; g.lineTo(Math.min(118, x), Math.max(10, Math.min(118, y))); }
    g.stroke();
  }
  hazardTex = new THREE.CanvasTexture(c);
  hazardTex.colorSpace = THREE.SRGBColorSpace;
  return hazardTex;
}

let pitTex = null;
function makePitTexture() {
  if (pitTex) return pitTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#050505'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2;
  for (let i = 0; i <= 64; i += 16) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke();
  }
  pitTex = new THREE.CanvasTexture(c);
  pitTex.colorSpace = THREE.SRGBColorSpace;
  return pitTex;
}
