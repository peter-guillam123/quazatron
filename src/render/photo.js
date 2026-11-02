// The Tower Gazette's photographer. Takes a black-and-white picture of the
// game as it's drawn, framed on whatever matters (KLP-2 and what got it, a
// droid going over the edge, a boss going down), and prints it later as a
// newspaper halftone: a dot screen on newsprint, a little grainy.
//
// Pictures are taken straight after a frame is drawn (`develop`), because
// the WebGL canvas doesn't keep its picture once the frame is shown. They're
// kept small and grey, as JPEGs, so a run's two pictures and ten back issues
// fit easily in the browser's storage.

const PAPER = [241, 236, 224];   // the Gazette's newsprint, #f1ece0
const INK = [28, 26, 22];        // #1c1a16

export class Photographer {
  constructor(renderer) {
    this.renderer = renderer;
    this.queue = [];
  }

  // Ask for a picture at the end of this frame. `points` are world positions
  // to frame; `w` and `h` the size of the print; `done(url)` gets the result
  // (null if there was nothing to take).
  take(points, { w = 480, h = 320 } = {}, done) {
    this.queue.push({ points, w, h, done });
  }

  develop() {
    if (!this.queue.length) return;
    const jobs = this.queue.splice(0);
    const canvas = this.renderer.r.domElement;
    for (const job of jobs) {
      let url = null;
      try { url = this.shoot(canvas, job); } catch { url = null; }
      job.done(url);
    }
  }

  shoot(canvas, { points, w, h }) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const sx = canvas.width / vw, sy = canvas.height / vh;
    // frame the points with room round them, at the print's shape
    const out = { x: 0, y: 0, visible: false };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of points || []) {
      if (!p) continue;
      this.renderer.project(p, out);
      if (!out.visible) continue;
      x0 = Math.min(x0, out.x); y0 = Math.min(y0, out.y); x1 = Math.max(x1, out.x); y1 = Math.max(y1, out.y);
    }
    if (!Number.isFinite(x0)) { x0 = x1 = vw / 2; y0 = y1 = vh / 2; }
    const aspect = w / h;
    let cw = Math.max(x1 - x0 + 260, vh * 0.42 * aspect), ch = Math.max(y1 - y0 + 220, vh * 0.42);
    if (cw / ch > aspect) ch = cw / aspect; else cw = ch * aspect;
    cw = Math.min(cw, vw); ch = Math.min(ch, vh);
    if (cw / ch > aspect) cw = ch * aspect; else ch = cw / aspect;
    const cx = Math.max(cw / 2, Math.min(vw - cw / 2, (x0 + x1) / 2));
    const cy = Math.max(ch / 2, Math.min(vh - ch / 2, (y0 + y1) / 2 - 20));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(canvas, (cx - cw / 2) * sx, (cy - ch / 2) * sy, cw * sx, ch * sy, 0, 0, w, h);
    // grey, with the levels stretched: the tower is dark, so lift it
    const img = g.getImageData(0, 0, w, h), d = img.data;
    const lum = new Float32Array(w * h);
    const hist = new Uint32Array(256);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      lum[j] = l;
      hist[Math.min(255, l | 0)]++;
    }
    const pct = (q) => { let n = 0; for (let v = 0; v < 256; v++) { n += hist[v]; if (n >= q * lum.length) return v; } return 255; };
    // a few bright lights shouldn't leave the rest in the dark
    const lo = pct(0.03), hi = Math.max(lo + 24, pct(0.97));
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      let v = Math.max(0, Math.min(1, (lum[j] - lo) / (hi - lo)));
      v = 0.06 + 0.94 * Math.pow(v, 0.62);
      d[i] = d[i + 1] = d[i + 2] = Math.round(v * 255);
    }
    // nothing worth printing: all one shade
    if (hi - lo < 25 && pct(0.5) < 8) return null;
    g.putImageData(img, 0, 0);
    return c.toDataURL('image/jpeg', 0.74);
  }
}

// Print a grey picture as a halftone: dots on a screen turned 45 degrees,
// bigger where it's darker, on the Gazette's paper. Returns a data URL.
export function halftone(url, { scale = 2, cell = 5.5 } = {}) {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return; }
    const img = new Image();
    img.onerror = () => resolve(null);
    img.onload = () => {
      const w = img.width, h = img.height;
      const src = document.createElement('canvas');
      src.width = w; src.height = h;
      const sg = src.getContext('2d', { willReadFrequently: true });
      sg.drawImage(img, 0, 0);
      const px = sg.getImageData(0, 0, w, h).data;
      const at = (x, y) => {
        const xi = Math.max(0, Math.min(w - 1, x | 0)), yi = Math.max(0, Math.min(h - 1, y | 0));
        return px[(yi * w + xi) * 4] / 255;
      };
      const out = document.createElement('canvas');
      out.width = w * scale; out.height = h * scale;
      const g = out.getContext('2d');
      g.fillStyle = `rgb(${PAPER.join(',')})`;
      g.fillRect(0, 0, out.width, out.height);
      // the dot screen, turned 45 degrees
      const step = cell, cos = Math.SQRT1_2, sin = Math.SQRT1_2;
      const reach = Math.hypot(w, h);
      const dot = (ox, oy, alpha) => {
        g.fillStyle = `rgba(${INK.join(',')},${alpha})`;
        for (let u = -reach; u < reach; u += step) {
          for (let v = -reach; v < reach; v += step) {
            const x = w / 2 + u * cos - v * sin, y = h / 2 + u * sin + v * cos;
            if (x < -step || y < -step || x > w + step || y > h + step) continue;
            const dark = 1 - at(x, y);
            if (dark < 0.04) continue;
            const r = step * 0.74 * Math.sqrt(dark);
            g.beginPath();
            g.arc((x + ox) * scale, (y + oy) * scale, r * scale, 0, Math.PI * 2);
            g.fill();
          }
        }
      };
      // a faint second pass a hair out of register, then the real one
      dot(0.6, 0.4, 0.1);
      dot(0, 0, 0.92);
      // newsprint grain
      const grain = g.getImageData(0, 0, out.width, out.height), gd = grain.data;
      for (let i = 0; i < gd.length; i += 4) {
        const n = (Math.random() - 0.5) * 22;
        gd[i] += n; gd[i + 1] += n; gd[i + 2] += n;
      }
      g.putImageData(grain, 0, 0);
      resolve(out.toDataURL('image/jpeg', 0.86));
    };
    img.src = url;
  });
}
