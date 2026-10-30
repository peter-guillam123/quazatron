// Signs painted on the floor, for the induction. Drawn on a canvas and laid
// flat, turned to read straight across the screen and stretched to make up
// for the camera looking down at an angle.
import * as THREE from 'three';
import { LEVEL_H } from '../config.js';

const W = 1024, H = 256;
const WIDE = 5.2;                  // world units across
const LOOK = 0.68;                 // how much the camera squashes the floor

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

function drawLine(g, text, device, y, font, size, colour) {
  const W = g.canvas.width;
  const rs = runs(text, device);
  g.font = `${font}`;
  const pad = size * 0.35;
  const widths = rs.map((r) => g.measureText(r.t).width + (r.cap ? pad * 2 : 0));
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

function paint(canvas, sign, device) {
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
  if (sign.sub) {
    drawLine(g, sign.text, device, 92, '700 64px "Chakra Petch", sans-serif', 64, '#ffffff');
    drawLine(g, sign.sub, device, 178, '500 40px "IBM Plex Mono", monospace', 40, '#a9f6ff');
  } else {
    drawLine(g, sign.text, device, H / 2, '700 66px "Chakra Petch", sans-serif', 66, '#ffffff');
  }
}

export class FloorSign {
  constructor(root, sign, device) {
    this.sign = sign;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mat = new THREE.MeshBasicMaterial({
      map: this.tex, transparent: true, depthWrite: false, color: new THREE.Color(0.82, 0.82, 0.82),
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    // a short sign is drawn on a narrower canvas, so the words keep their size
    this.wide = sign.wide || WIDE;
    this.canvas.width = Math.round(W * this.wide / WIDE);
    const deep = (WIDE * H / W) / LOOK;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.wide, deep), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = 1;
    this.group = new THREE.Group();
    this.group.position.set(sign.x + 0.5, sign.h * LEVEL_H + 0.02, sign.z + 0.5);
    // turned so the words run across the screen
    this.group.rotation.y = Math.PI / 4;
    this.group.add(this.mesh);
    root.add(this.group);
    this.setDevice(device);
  }

  setDevice(device) {
    if (device === this.device) return;
    this.device = device;
    paint(this.canvas, this.sign, device);
    this.tex.needsUpdate = true;
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.tex.dispose();
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
