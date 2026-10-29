// Textures drawn at load time on 2D canvases, so the game ships no images.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function noise(ctx, w, h, amount, seed = 1) {
  const img = ctx.getImageData(0, 0, w, h);
  let s = seed * 9301 + 49297;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 9301 + 49297) % 233280;
    const n = (s / 233280 - 0.5) * amount;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function finish(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Floor tops: a 2x2 atlas of panel designs. The emissive map holds the
// circuit traces, which glow in the deck's colour, so every floor reads as
// a circuit board, like the hack game.
export function makeFloorTextures() {
  const S = 256, N = 512;
  const [c, g] = canvas(N, N);
  const [e, ge] = canvas(N, N);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, N, N);

  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * S, oy = Math.floor(v / 2) * S;
    // base panel
    const grad = g.createLinearGradient(ox, oy, ox + S, oy + S);
    grad.addColorStop(0, '#6a7080');
    grad.addColorStop(1, '#4c5160');
    g.fillStyle = grad;
    g.fillRect(ox, oy, S, S);
    // bevel
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(ox, oy, S, 6); g.fillRect(ox, oy, 6, S);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(ox, oy + S - 6, S, 6); g.fillRect(ox + S - 6, oy, 6, S);
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 3;
    g.strokeRect(ox + 1.5, oy + 1.5, S - 3, S - 3);
    // emissive border hairline
    ge.strokeStyle = 'rgba(255,255,255,0.22)'; ge.lineWidth = 2;
    ge.strokeRect(ox + 10, oy + 10, S - 20, S - 20);

    if (v === 0) {
      // plain panel with bolts
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (const [bx, by] of [[22, 22], [S - 22, 22], [22, S - 22], [S - 22, S - 22]]) {
        g.beginPath(); g.arc(ox + bx, oy + by, 7, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.beginPath(); g.arc(ox + bx - 1, oy + by - 1, 4, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(0,0,0,0.25)';
      }
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(ox + S / 2, oy + 30); g.lineTo(ox + S / 2, oy + S - 30); g.stroke();
    } else if (v === 1) {
      // circuit traces
      ge.strokeStyle = 'rgba(255,255,255,0.75)'; ge.lineWidth = 4; ge.lineCap = 'round';
      g.strokeStyle = 'rgba(20,24,32,0.8)'; g.lineWidth = 9;
      const traces = [
        [[30, 70], [110, 70], [140, 100], [226, 100]],
        [[30, 160], [80, 160], [110, 190], [226, 190]],
        [[170, 30], [170, 60], [200, 60]],
      ];
      for (const t of traces) {
        for (const ctx of [g, ge]) {
          ctx.beginPath();
          t.forEach(([x, y], i) => (i ? ctx.lineTo(ox + x, oy + y) : ctx.moveTo(ox + x, oy + y)));
          ctx.stroke();
        }
        for (const [x, y] of [t[0], t[t.length - 1]]) {
          ge.fillStyle = 'rgba(255,255,255,0.9)';
          ge.beginPath(); ge.arc(ox + x, oy + y, 7, 0, Math.PI * 2); ge.fill();
          g.fillStyle = '#2a2e38';
          g.beginPath(); g.arc(ox + x, oy + y, 11, 0, Math.PI * 2); g.fill();
        }
      }
    } else if (v === 2) {
      // vent grate
      g.fillStyle = 'rgba(0,0,0,0.55)';
      for (let i = 0; i < 7; i++) g.fillRect(ox + 40, oy + 46 + i * 24, S - 80, 10);
      g.fillStyle = 'rgba(255,255,255,0.07)';
      for (let i = 0; i < 7; i++) g.fillRect(ox + 40, oy + 56 + i * 24, S - 80, 3);
      ge.fillStyle = 'rgba(255,255,255,0.18)';
      for (let i = 0; i < 7; i++) ge.fillRect(ox + 44, oy + 48 + i * 24, S - 88, 4);
    } else {
      // inset plate with chevrons
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(ox + 56, oy + 56, S - 112, S - 112);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(ox + 60, oy + 60, S - 120, 4);
      ge.strokeStyle = 'rgba(255,255,255,0.55)'; ge.lineWidth = 5;
      for (let i = 0; i < 3; i++) {
        ge.beginPath();
        ge.moveTo(ox + 96 + i * 22, oy + 104); ge.lineTo(ox + 112 + i * 22, oy + 128); ge.lineTo(ox + 96 + i * 22, oy + 152);
        ge.stroke();
      }
    }
  }
  noise(g, N, N, 9, 3);
  const map = finish(c);
  const emissiveMap = finish(e);
  map.wrapS = map.wrapT = emissiveMap.wrapS = emissiveMap.wrapT = THREE.ClampToEdgeWrapping;
  return { map, emissiveMap };
}

// Platform sides: dark panels with vertical seams, fading to black below.
export function makeSideTexture() {
  const [c, g] = canvas(128, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#3a3f4c');
  grad.addColorStop(1, '#2a2e38');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(0, 0, 3, 256); g.fillRect(64, 0, 2, 256);
  g.fillStyle = 'rgba(255,255,255,0.07)';
  g.fillRect(3, 0, 2, 256); g.fillRect(66, 0, 1, 256);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i < 4; i++) g.fillRect(0, 60 + i * 64, 128, 3);
  noise(g, 128, 256, 14, 7);
  return finish(c);
}

// Wall faces: tall panels with lit slots.
export function makeWallTextures() {
  const [c, g] = canvas(128, 256);
  const [e, ge] = canvas(128, 256);
  g.fillStyle = '#353a47'; g.fillRect(0, 0, 128, 256);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(0, 0, 4, 256); g.fillRect(0, 0, 128, 4);
  g.fillStyle = 'rgba(255,255,255,0.06)';
  g.fillRect(4, 4, 120, 3);
  g.fillStyle = '#20232b'; g.fillRect(52, 30, 24, 150);
  ge.fillStyle = 'rgba(255,255,255,0.5)'; ge.fillRect(58, 36, 12, 138);
  noise(g, 128, 256, 12, 11);
  return { map: finish(c), emissiveMap: finish(e) };
}

// A soft round dot for particles and glows.
export function makeGlowTexture() {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A droid's class number, drawn as a lit display.
export function makeNumberTexture(text, colour = '#ffffff') {
  const [c, g] = canvas(128, 64);
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 64);
  g.font = '700 46px "Chakra Petch", "IBM Plex Mono", monospace';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = colour;
  g.fillText(text, 64, 35);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Big soft gradient for the light far below the tower.
export function makeAbyssTexture() {
  const [c, g] = canvas(256, 256);
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
