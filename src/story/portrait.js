// Faces for the cast, drawn on a small canvas: no image files, like the
// rest of the game. Each look is a few shapes in the character's colours.
import { CAST } from './cast.js';

export function drawPortrait(canvas, who, t = 0) {
  const c = CAST[who];
  if (!c) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const S = 120;
  if (canvas.width !== S * dpr) { canvas.width = S * dpr; canvas.height = S * dpr; }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, S, S);
  // backdrop: a soft glow in their colour
  const bg = g.createRadialGradient(60, 70, 8, 60, 70, 70);
  bg.addColorStop(0, hexA(c.colour, 0.28));
  bg.addColorStop(1, hexA(c.colour, 0));
  g.fillStyle = bg;
  g.fillRect(0, 0, S, S);
  const blink = Math.sin(t * 1.7) > 0.985;
  switch (c.look) {
    case 'wide': nan(g, c, blink); break;
    case 'tall': radio(g, c, t, blink); break;
    case 'screen': screen(g, c, t, blink); break;
    case 'eye': eye(g, c, t); break;
    case 'klp': klp(g, c, blink); break;
    default: break;
  }
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function body(g, c, x, y, w, h, r) {
  const grad = g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, lighten(c.shell, 0.35));
  grad.addColorStop(1, c.shell);
  g.fillStyle = grad;
  round(g, x, y, w, h, r);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = 2;
  g.stroke();
}

function lighten(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(v + (255 - v) * k);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function glow(g, colour, blur) {
  g.shadowColor = colour;
  g.shadowBlur = blur;
}

// Nan: a broad old welder with a mask pushed up and one lit slit for eyes
function nan(g, c, blink) {
  body(g, c, 18, 46, 84, 64, 26);
  // dome
  g.fillStyle = lighten(c.shell, 0.2);
  g.beginPath(); g.ellipse(60, 50, 40, 28, 0, Math.PI, 0); g.fill();
  // the welding mask, pushed up
  g.fillStyle = '#1b1d24';
  round(g, 30, 22, 60, 16, 6); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(34, 25, 52, 3);
  // eyes: a warm slit
  glow(g, c.colour, 12);
  g.fillStyle = c.colour;
  round(g, 32, 55, 56, blink ? 2 : 9, 4); g.fill();
  g.shadowBlur = 0;
  // rivets and a soldering arm
  g.fillStyle = 'rgba(0,0,0,0.45)';
  for (const x of [26, 94]) for (const y of [72, 88]) { g.beginPath(); g.arc(x, y, 2.5, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#9aa1ad'; g.lineWidth = 4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(100, 84); g.lineTo(112, 70); g.lineTo(108, 58); g.stroke();
  glow(g, '#ffffff', 10);
  g.fillStyle = '#fff6d8';
  g.beginPath(); g.arc(108, 56, 3, 0, Math.PI * 2); g.fill();
  g.shadowBlur = 0;
}

// Static: tall, thin, an aerial and a speaker grille
function radio(g, c, t, blink) {
  body(g, c, 32, 30, 56, 84, 18);
  // aerial with a blinking tip
  g.strokeStyle = '#9aa1ad'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(76, 30); g.lineTo(90, 6); g.stroke();
  glow(g, c.colour, 14);
  g.fillStyle = Math.sin(t * 6) > 0 ? c.colour : hexA(c.colour, 0.35);
  g.beginPath(); g.arc(90, 6, 4, 0, Math.PI * 2); g.fill();
  // visor
  g.fillStyle = c.colour;
  round(g, 38, 42, 44, blink ? 2 : 12, 6); g.fill();
  g.shadowBlur = 0;
  // the grille
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2;
  for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(42, 70 + i * 7); g.lineTo(78, 70 + i * 7); g.stroke(); }
}

// Ledger: a screen, with a face drawn on it in pixels
function screen(g, c, t, blink) {
  body(g, c, 14, 18, 92, 80, 12);
  g.fillStyle = '#0a0c08';
  round(g, 22, 26, 76, 60, 8); g.fill();
  glow(g, c.colour, 10);
  g.fillStyle = c.colour;
  const px = (x, y, w = 6, h = 6) => g.fillRect(x, y, w, h);
  // eyes, and the mouth of someone who's always pricing you up
  if (blink) { px(38, 46, 12, 3); px(70, 46, 12, 3); } else { px(40, 40, 8, 10); px(72, 40, 8, 10); }
  px(46, 66, 28, 4);
  px(74, 62, 4, 4);
  g.shadowBlur = 0;
  // scanlines
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 26 + ((t * 20) % 4); y < 86; y += 4) g.fillRect(22, y, 76, 1.5);
  // stand
  g.fillStyle = c.shell;
  g.fillRect(52, 98, 16, 12);
  g.fillRect(38, 108, 44, 6);
}

// The Mainframe: one eye
function eye(g, c, t) {
  g.strokeStyle = hexA(c.colour, 0.5); g.lineWidth = 2;
  for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(60, 60, 26 + i * 12, 0, Math.PI * 2); g.stroke(); }
  glow(g, c.colour, 20);
  g.fillStyle = c.colour;
  g.beginPath(); g.arc(60 + Math.sin(t * 0.8) * 6, 60, 14, 0, Math.PI * 2); g.fill();
  g.shadowBlur = 0;
  g.fillStyle = '#05040c';
  g.beginPath(); g.arc(60 + Math.sin(t * 0.8) * 7, 60, 5, 0, Math.PI * 2); g.fill();
}

// KLP-1: like KLP-2, older, dented, red-eyed
function klp(g, c, blink) {
  body(g, c, 24, 52, 72, 52, 20);
  g.fillStyle = lighten(c.shell, 0.25);
  g.beginPath(); g.ellipse(60, 56, 36, 30, 0, Math.PI, 0); g.fill();
  glow(g, c.colour, 12);
  g.fillStyle = c.colour;
  round(g, 30, 46, 60, blink ? 2 : 10, 5); g.fill();
  g.shadowBlur = 0;
  // a dent and a crack
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(40, 30); g.lineTo(46, 38); g.lineTo(44, 44); g.stroke();
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath(); g.ellipse(80, 78, 8, 5, 0.4, 0, Math.PI * 2); g.fill();
}

function round(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
