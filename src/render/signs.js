// Signs painted on the floor, for the induction. Drawn on a canvas and laid
// flat, turned to read straight across the screen and stretched to make up
// for the camera looking down at an angle.
import * as THREE from 'three';
import { LEVEL_H } from '../config.js';

const W = 1024, H = 256;
const WIDE = 5.2;                  // world units across, for a canvas W wide
const LOOK = 0.68;                 // how much the camera squashes the floor
const PAD = 54;                    // canvas pixels left and right of the words
const MIN_WIDE = 2.6, MAX_WIDE = 6.6;
const TITLE = (px) => `700 ${px}px "Chakra Petch", sans-serif`;
const SUB = (px) => `500 ${px}px "IBM Plex Mono", monospace`;

// The keys a sign mentions, for keyboard or pad.
function keys(device) {
  return device === 'pad'
    ? { move: ['Left stick'], grapple: ['A'], arm: ['X'], drive: ['B'] }
    : { move: ['WASD', ' or ', '← ↑ → ↓'], grapple: ['Space'], arm: ['J'], drive: ['K'] };
}

// Split text into runs of plain words and key caps.
function runs(text, device) {
  const k = keys(device);
  const out = [];
  for (const part of text.split(/(\{\w+\})/)) {
    if (!part) continue;
    const m = part.match(/^\{(\w+)\}$/);
    if (m && k[m[1]]) k[m[1]].forEach((t, i) => out.push({ t, cap: i % 2 === 0 }));
    else out.push({ t: part, cap: false });
  }
  return out;
}

// How wide a line comes out, key caps included.
function measure(g, text, device, font, size) {
  g.font = font;
  const pad = size * 0.35;
  return runs(text, device).map((r) => g.measureText(r.t).width + (r.cap ? pad * 2 : 0));
}

function drawLine(g, text, device, y, font, size, colour) {
  const W = g.canvas.width;
  const rs = runs(text, device);
  const widths = measure(g, text, device, font, size);
  g.font = font;
  const pad = size * 0.35;
  let x = (W - widths.reduce((a, b) => a + b, 0)) / 2;
  rs.forEach((r, i) => {
    if (r.cap) {
      const h = size * 1.25;
      g.fillStyle = '#2ef2ff';
      roundRect(g, x, y - h / 2, widths[i], h, 10);
      g.fill();
      g.fillStyle = '#021014';
      g.fillText(r.t, x + pad, y + 2);
    } else {
      g.fillStyle = colour;
      g.fillText(r.t, x, y + 2);
    }
    x += widths[i];
  });
}

// The sizes a sign's words are drawn at: full size if they fit on a sign
// no wider than MAX_WIDE, smaller if not.
function sizes(sign, k = 1) {
  return sign.sub ? { t: Math.round(64 * k), s: Math.round(40 * k) } : { t: Math.round(66 * k), s: 0 };
}

// How wide a sign needs to be, in world units, and how far its words must
// shrink to fit, so nothing is ever cut off at the edge.
function fit(sign, device) {
  const g = document.createElement('canvas').getContext('2d');
  const z = sizes(sign);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  let px = sum(measure(g, sign.text, device, TITLE(z.t), z.t));
  if (sign.sub) px = Math.max(px, sum(measure(g, sign.sub, device, SUB(z.s), z.s)));
  const need = ((px + PAD * 2) / W) * WIDE;
  const wide = Math.min(MAX_WIDE, Math.max(MIN_WIDE, need));
  return { wide, k: need > MAX_WIDE ? MAX_WIDE / need : 1 };
}

function paint(canvas, sign, device, k = 1) {
  const g = canvas.getContext('2d');
  const W = canvas.width;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(4, 8, 14, 0.62)';
  roundRect(g, 6, 6, W - 12, H - 12, 28);
  g.fill();
  g.strokeStyle = 'rgba(46, 242, 255, 0.85)';
  g.lineWidth = 5;
  g.stroke();
  g.textBaseline = 'middle';
  const z = sizes(sign, k);
  if (sign.sub) {
    drawLine(g, sign.text, device, 92, TITLE(z.t), z.t, '#ffffff');
    drawLine(g, sign.sub, device, 178, SUB(z.s), z.s, '#a9f6ff');
  } else {
    drawLine(g, sign.text, device, H / 2, TITLE(z.t), z.t, '#ffffff');
  }
}

export class FloorSign {
  constructor(root, sign, device) {
    this.sign = sign;
    this.canvas = document.createElement('canvas');
    this.canvas.height = H;
    this.mat = new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, color: new THREE.Color(0.82, 0.82, 0.82),
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.deep = (WIDE * H / W) / LOOK;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, this.deep), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = 1;
    this.group = new THREE.Group();
    this.group.position.set(sign.x + 0.5, sign.h * LEVEL_H + 0.02, sign.z + 0.5);
    // turned so the words run across the screen
    this.group.rotation.y = Math.PI / 4;
    this.group.add(this.mesh);
    root.add(this.group);
    this.setDevice(device);
    // the fonts may still be on their way: measure again once they're here
    document.fonts?.ready.then(() => { if (this.group.parent) this.layout(); });
  }

  setDevice(device) {
    if (device === this.device) return;
    this.device = device;
    this.layout();
  }

  // Size the sign to its words (the keys differ for keyboard and pad), then
  // paint it. The words keep their size from sign to sign; a sign only
  // shrinks them when it would otherwise grow too wide for its room.
  layout() {
    const { wide, k } = fit(this.sign, this.device);
    const cw = Math.round(W * wide / WIDE);
    if (cw !== this.canvas.width || !this.tex) {
      this.canvas.width = cw;
      this.tex?.dispose();
      this.tex = new THREE.CanvasTexture(this.canvas);
      this.tex.colorSpace = THREE.SRGBColorSpace;
      this.tex.anisotropy = 4;
      this.mat.map = this.tex;
      this.mat.needsUpdate = true;
      this.mesh.scale.x = wide;
    }
    paint(this.canvas, this.sign, this.device, k);
    this.tex.needsUpdate = true;
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.tex?.dispose();
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
