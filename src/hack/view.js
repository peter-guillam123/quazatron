// Draws the hack board on a 2D canvas over the game. Lit wires glow in the
// colour they paint; each cell carries a chevron pointing at its owner, so
// the board reads without relying on colour alone.
import { reach, evalSide } from './board.js';

const DIM = '#2c3240';
const DIM2 = '#454d5f';

export class HackView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = false;
    this.t = 0;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.dpr = dpr; this.w = w; this.h = h;
  }

  layout(rows) {
    const W = Math.min(980, this.w - 32);
    const H = Math.min(640, this.h - 40);
    const x = (this.w - W) / 2, y = (this.h - H) / 2;
    const top = 78, bottom = 74;
    const boardY = y + top, boardH = H - top - bottom;
    const rowH = boardH / rows;
    const cw = Math.max(64, Math.min(96, W * 0.09));
    const cx = x + W / 2;
    return { x, y, W, H, boardY, boardH, rowH, cw, cx };
  }

  clear() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // s: session state for drawing
  draw(s, dt) {
    this.t += dt;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    const R = s.round;
    const B = R.board;
    const L = this.layout(B.rows);
    const colour = (side) => (side === s.playerSide ? s.youColour : s.themColour);
    const valColour = (side, v) => (v === 1 ? colour(side) : v === 2 ? colour(1 - side) : null);

    // ---- panel
    ctx.save();
    ctx.fillStyle = 'rgba(5,7,12,0.95)';
    roundRect(ctx, L.x, L.y, L.W, L.H, 14);
    ctx.fill();
    const grad = ctx.createLinearGradient(L.x, 0, L.x + L.W, 0);
    grad.addColorStop(0, colour(0)); grad.addColorStop(0.5, 'rgba(255,255,255,0.15)'); grad.addColorStop(1, colour(1));
    ctx.strokeStyle = grad; ctx.lineWidth = 1.5;
    roundRect(ctx, L.x + 0.5, L.y + 0.5, L.W - 1, L.H - 1, 14);
    ctx.stroke();
    // faint grid
    ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 1;
    for (let gx = L.x + 20; gx < L.x + L.W; gx += 20) { ctx.beginPath(); ctx.moveTo(gx, L.y + 4); ctx.lineTo(gx, L.y + L.H - 4); ctx.stroke(); }
    ctx.restore();

    // ---- header
    ctx.save();
    ctx.fillStyle = '#e8edf5';
    ctx.font = '700 18px "Chakra Petch", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.title.toUpperCase(), L.x + 22, L.y + 24);
    ctx.font = '500 12px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#9aa3b5';
    const sub = s.roundsTotal > 1 ? `ROUND ${s.roundIndex + 1} OF ${s.roundsTotal}  ·  YOU ${s.wins[0]} – ${s.wins[1]} THEM` : s.subtitle;
    ctx.textAlign = 'right';
    ctx.fillText(sub, L.x + L.W - 22, L.y + 24);
    ctx.textAlign = 'left';
    // timer bar
    const tf = s.phase === 'choose' ? 1 : Math.max(0, 1 - R.time / R.timer);
    const barY = L.y + 44;
    ctx.fillStyle = '#1a1f2a';
    ctx.fillRect(L.x + 22, barY, L.W - 44, 6);
    ctx.fillStyle = tf < 0.25 ? '#ff5a5a' : '#e8edf5';
    ctx.fillRect(L.x + 22 + (L.W - 44) * (1 - tf) / 2, barY, (L.W - 44) * tf, 6);
    ctx.restore();

    // ---- both sides
    for (let side = 0; side < 2; side++) this.drawSide(s, L, side, colour, valColour);

    // ---- centre column
    for (let r = 0; r < B.rows; r++) {
      const cell = B.cells[r];
      const y = L.boardY + r * L.rowH;
      const x0 = L.cx - L.cw / 2 + 6, w = L.cw - 12, h = L.rowH - 6;
      ctx.save();
      const flash = Math.max(0, 1 - cell.flipT * 4);
      if (cell.contested) {
        // striped, both colours
        ctx.beginPath(); ctx.rect(x0, y + 3, w, h); ctx.clip();
        const off = this.reduced ? 0 : (this.t * 14) % 16;
        for (let i = -2; i < w / 8 + 4; i++) {
          ctx.fillStyle = i % 2 ? colour(0) : colour(1);
          ctx.globalAlpha = 0.75;
          ctx.beginPath();
          const sx = x0 + i * 8 - off;
          ctx.moveTo(sx, y + 3 + h); ctx.lineTo(sx + 8, y + 3 + h); ctx.lineTo(sx + 8 + h, y + 3); ctx.lineTo(sx + h, y + 3);
          ctx.fill();
        }
      } else {
        const c = colour(cell.owner);
        ctx.shadowColor = c; ctx.shadowBlur = 10 + flash * 20;
        ctx.fillStyle = c;
        ctx.globalAlpha = 0.78 + flash * 0.22;
        roundRect(ctx, x0, y + 3, w, h, 4);
        ctx.fill();
        // chevron towards the owner
        ctx.shadowBlur = 0; ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#05070c';
        const mx = x0 + w / 2, my = y + 3 + h / 2, k = Math.min(7, h * 0.28);
        const dir = cell.owner === 0 ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(mx + dir * k, my); ctx.lineTo(mx - dir * k * 0.4, my - k); ctx.lineTo(mx - dir * k * 0.4, my + k);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      // preview: which cells the selected wire reaches
      if (s.preview && s.preview[r]) {
        ctx.save();
        ctx.strokeStyle = s.preview[r] === 1 ? s.youColour : s.themColour;
        ctx.setLineDash([4, 3]); ctx.lineWidth = 2;
        roundRect(ctx, x0 - 3, y + 1, w + 6, h + 4, 6);
        ctx.stroke();
        ctx.restore();
      }
    }

    // ---- counts under the column
    const n = R.count();
    ctx.save();
    ctx.font = '700 16px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const yb = L.boardY + L.boardH + 8;
    ctx.fillStyle = colour(0); ctx.fillText(String(n[0]), L.cx - 18, yb);
    ctx.fillStyle = '#6b7385'; ctx.fillText('·', L.cx, yb);
    ctx.fillStyle = colour(1); ctx.fillText(String(n[1]), L.cx + 18, yb);
    ctx.restore();

    // ---- footer: legend and keys
    this.drawLegend(L, s);

    // ---- phase overlays
    if (s.phase === 'choose') this.drawChoose(s, L, colour);
    if (s.phase === 'result') this.drawResult(s, L);
    if (s.tutorial) this.drawTutorial(s, L);
  }

  drawSide(s, L, side, colour, valColour) {
    const ctx = this.ctx;
    const R = s.round;
    const B = R.board;
    const S = B.sides[side];
    const trace = R.traces[side];
    const mirror = (x) => (side === 0 ? x : 2 * L.cx - x);
    const x0 = L.x + 18;
    const xPort = x0 + 16;
    const xs = x0 + 46;
    const xe = L.cx - L.cw / 2 - 10;
    const sw = (xe - xs) / S.cols;
    const rowY = (r) => L.boardY + r * L.rowH + L.rowH / 2;
    const you = side === s.playerSide;
    const hiddenView = !you && s.phase !== 'choose' ? false : false;

    // side label and pulsers
    ctx.save();
    ctx.font = '700 13px "Chakra Petch", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = side === 0 ? 'left' : 'right';
    ctx.fillStyle = colour(side);
    const lx = mirror(x0 + 4);
    ctx.fillText(you ? 'YOU' : 'THEM', lx, L.y + 64);
    const pips = R.pulsers[side];
    const total = Math.max(pips, s.startPulsers[side]);
    for (let i = 0; i < total; i++) {
      const px = side === 0 ? lx + 44 + i * 13 : lx - 44 - i * 13;
      ctx.beginPath(); ctx.arc(px, L.y + 64, 4.2, 0, Math.PI * 2);
      if (i < pips) { ctx.fillStyle = colour(side); ctx.fill(); } else { ctx.strokeStyle = DIM2; ctx.lineWidth = 1.2; ctx.stroke(); }
    }
    if (R.freeFirst[side]) {
      ctx.fillStyle = colour(side);
      ctx.font = '500 11px "IBM Plex Mono", monospace';
      const fx = side === 0 ? lx + 52 + total * 13 : lx - 52 - total * 13;
      ctx.fillText('+1 free', fx, L.y + 64);
    }
    ctx.restore();

    // which segments a travelling pulse has reached
    const travelling = R.pulses.filter((p) => p.side === side && R.time < p.t0 + R.travel[side]);
    const partial = travelling.map((p) => {
      const live = new Array(B.rows).fill(0); live[p.row] = 1;
      return { tr: evalSide(S, live, false), k: (R.time - p.t0) / R.travel[side] };
    });
    const segColour = (c, r, half) => {
      // half: the value entering column c (trace[c]) or leaving it (trace[c+1])
      const v = trace ? trace[c + half][r] : 0;
      return valColour(side, v);
    };
    const partialLit = (c, r, half, xFrac) => {
      for (const p of partial) if (p.tr[c + half][r] && xFrac <= p.k) return valColour(side, p.tr[c + half][r]);
      return null;
    };
    const frac = (x) => (x - xs + 46) / (xe - xs + 46 + L.cw / 2);

    const line = (xa, ya, xb, yb, col, width = 2) => {
      ctx.beginPath();
      ctx.moveTo(mirror(xa), ya); ctx.lineTo(mirror(xb), yb);
      if (col) {
        ctx.strokeStyle = col; ctx.lineWidth = width + 1.5;
        ctx.shadowColor = col; ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.55; ctx.lineWidth = 1;
        ctx.stroke(); ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = DIM; ctx.lineWidth = width; ctx.stroke();
      }
    };

    ctx.save();
    ctx.lineCap = 'round';
    // selection highlight
    if (you && s.phase === 'play' && s.cursor != null) {
      const y = rowY(s.cursor);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      const a = mirror(x0), b = mirror(xe + 6);
      ctx.fillRect(Math.min(a, b), y - L.rowH / 2 + 2, Math.abs(b - a), L.rowH - 4);
    }

    for (let r = 0; r < B.rows; r++) {
      const y = rowY(r);
      // port to first slot
      const pv = trace ? trace[0][r] : 0;
      const pc = valColour(side, pv) || partialLit(0, r, 0, 0);
      line(xPort + 8, y, xs, y, pc);
      // last slot to the cell
      const lc = segColour(S.cols - 1, r, 1) || partialLit(S.cols - 1, r, 1, frac(xe));
      line(xe, y, L.cx - L.cw / 2 + 4, y, lc);
    }

    for (let c = 0; c < S.cols; c++) {
      const sx = xs + c * sw, mx = sx + sw / 2, ex = sx + sw;
      const done = new Set();
      for (let r = 0; r < B.rows; r++) {
        const comp = S.grid[c][r];
        if (!comp || done.has(comp)) continue;
        done.add(comp);
        const inC = (rr) => segColour(c, rr, 0) || partialLit(c, rr, 0, frac(mx));
        const outC = (rr) => segColour(c, rr, 1) || partialLit(c, rr, 1, frac(ex));
        if (comp.hidden) {
          // the wiring in this slot is unknown until a pulse runs through it
          const rows = comp.t === 'fork' || comp.t === 'and' ? [comp.a, comp.a + 1] : [comp.a];
          for (const rr of rows) { line(sx, rowY(rr), mx - 9, rowY(rr), inC(rr)); line(mx + 9, rowY(rr), ex, rowY(rr), outC(rr)); }
          const top = rowY(rows[0]) - 9, bot = rowY(rows[rows.length - 1]) + 9;
          ctx.fillStyle = '#141924';
          ctx.strokeStyle = DIM2; ctx.lineWidth = 1.2;
          const bx = Math.min(mirror(mx - 10), mirror(mx + 10));
          roundRect(ctx, bx, top, 20, bot - top, 4); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#9aa3b5'; ctx.font = '700 12px "Chakra Petch", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('?', mirror(mx), (top + bot) / 2);
          continue;
        }
        const y = rowY(comp.a);
        switch (comp.t) {
          case 'wire':
            line(sx, y, mx, y, inC(comp.a)); line(mx, y, ex, y, outC(comp.a));
            break;
          case 'break': {
            line(sx, y, mx - 7, y, inC(comp.a));
            line(mx + 7, y, ex, y, null);
            ctx.strokeStyle = '#8b93a6'; ctx.lineWidth = 2;
            for (const d of [-7, 7]) { ctx.beginPath(); ctx.moveTo(mirror(mx + d), y - 6); ctx.lineTo(mirror(mx + d), y + 6); ctx.stroke(); }
            break;
          }
          case 'inv': {
            line(sx, y, mx - 8, y, inC(comp.a)); line(mx + 8, y, ex, y, outC(comp.a));
            const col = inC(comp.a) ? outC(comp.a) || '#c8cfdc' : '#8b93a6';
            ctx.strokeStyle = col; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(mirror(mx), y, 8, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(mirror(mx - 4), y - 3.5); ctx.lineTo(mirror(mx + 4), y - 3.5); ctx.moveTo(mirror(mx + 1.5), y - 6); ctx.lineTo(mirror(mx + 4), y - 3.5); ctx.lineTo(mirror(mx + 1.5), y - 1);
            ctx.moveTo(mirror(mx + 4), y + 3.5); ctx.lineTo(mirror(mx - 4), y + 3.5); ctx.moveTo(mirror(mx - 1.5), y + 1); ctx.lineTo(mirror(mx - 4), y + 3.5); ctx.lineTo(mirror(mx - 1.5), y + 6);
            ctx.stroke();
            break;
          }
          case 'lock': {
            line(sx, y, mx - 7, y, inC(comp.a)); line(mx + 7, y, ex, y, outC(comp.a));
            const col = comp.latched ? valColour(side, comp.latched) : '#8b93a6';
            ctx.strokeStyle = col; ctx.fillStyle = comp.latched ? col : '#141924'; ctx.lineWidth = 2;
            const bx = mirror(mx) - 7;
            roundRect(ctx, bx, y - 3, 14, 10, 2); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.arc(mirror(mx), y - 3, 4.5, Math.PI, 0); ctx.stroke();
            break;
          }
          case 'fork': {
            const a = comp.a, src = a + comp.src, other = a + 1 - comp.src;
            line(sx, rowY(src), mx, rowY(src), inC(src));
            // the other row's incoming wire ends here
            line(sx, rowY(other), mx - 8, rowY(other), inC(other));
            ctx.strokeStyle = '#8b93a6'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(mirror(mx - 8), rowY(other) - 5); ctx.lineTo(mirror(mx - 8), rowY(other) + 5); ctx.stroke();
            const oc = outC(a);
            line(mx, rowY(a), mx, rowY(a + 1), oc);
            line(mx, rowY(a), ex, rowY(a), oc);
            line(mx, rowY(a + 1), ex, rowY(a + 1), outC(a + 1));
            ctx.fillStyle = oc || '#8b93a6';
            ctx.beginPath(); ctx.arc(mirror(mx), rowY(src), 4.5, 0, Math.PI * 2); ctx.fill();
            break;
          }
          case 'and': {
            const a = comp.a, dst = a + comp.dst;
            const ya = rowY(a), yb = rowY(a + 1), gy = (ya + yb) / 2;
            const hh = Math.min(L.rowH / 2 + 4, 26), gw = 6 + hh * 0.8;
            const gx = mx - gw / 2 - 4;
            const nose = gx + gw;
            const lit = outC(dst);
            line(sx, ya, gx, ya, inC(a));
            line(sx, yb, gx, yb, inC(a + 1));
            line(nose, gy, nose + 6, gy, lit);
            line(nose + 6, gy, nose + 6, rowY(dst), lit);
            line(nose + 6, rowY(dst), ex, rowY(dst), lit);
            ctx.save();
            ctx.translate(mirror(gx), gy);
            ctx.scale(side === 0 ? 1 : -1, 1);
            ctx.beginPath();
            ctx.moveTo(0, -hh); ctx.lineTo(6, -hh);
            ctx.ellipse(6, 0, hh * 0.8, hh, 0, -Math.PI / 2, Math.PI / 2);
            ctx.lineTo(0, hh); ctx.closePath();
            ctx.fillStyle = '#141924';
            ctx.strokeStyle = lit || '#8b93a6'; ctx.lineWidth = 2;
            if (lit) { ctx.shadowColor = lit; ctx.shadowBlur = 10; }
            ctx.fill(); ctx.stroke();
            ctx.restore();
            ctx.fillStyle = '#c8cfdc'; ctx.font = '700 12px "IBM Plex Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('&', mirror(gx + gw * 0.45), gy + 0.5);
            break;
          }
          default: break;
        }
      }
    }

    // ports
    for (let r = 0; r < B.rows; r++) {
      const y = rowY(r);
      const port = S.ports[r];
      const busy = R.busy(side, r);
      const sel = you && s.cursor === r && s.phase === 'play';
      const px = mirror(xPort);
      const dir = side === 0 ? 1 : -1;
      ctx.fillStyle = busy ? colour(side) : sel ? '#ffffff' : '#5d6578';
      ctx.shadowColor = colour(side); ctx.shadowBlur = busy || sel ? 12 : 0;
      ctx.beginPath();
      ctx.moveTo(px + dir * 8, y); ctx.lineTo(px - dir * 6, y - 7); ctx.lineTo(px - dir * 6, y + 7); ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      if (port.free) {
        ctx.fillStyle = colour(side); ctx.font = '700 13px "IBM Plex Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('∞', px + dir * 20, y - 9);
      }
      if (sel) {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
        const bx = px - dir * 22;
        ctx.beginPath();
        ctx.moveTo(bx, y - L.rowH / 2 + 4); ctx.lineTo(bx - dir * 0, y - L.rowH / 2 + 4); ctx.lineTo(bx, y + L.rowH / 2 - 4);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawLegend(L, s) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = '500 11.5px "IBM Plex Mono", monospace';
    ctx.textBaseline = 'middle';
    const y = L.y + L.H - 42;
    const items = [
      ['fork', 'Fork: two cells'],
      ['and', 'AND: needs both'],
      ['inv', 'Invert: their colour'],
      ['lock', 'Lock: stays lit'],
      ['free', 'Free wire'],
    ];
    const widths = items.map(([, t]) => 22 + ctx.measureText(t).width);
    const total = widths.reduce((a, b) => a + b, 0) + 22 * (items.length - 1);
    let x = L.cx - total / 2;
    items.forEach(([k, label], i) => {
      this.glyph(k, x + 8, y);
      ctx.fillStyle = '#8f98ab';
      ctx.textAlign = 'left';
      ctx.fillText(label, x + 20, y);
      x += widths[i] + 22;
    });
    ctx.fillStyle = '#c8cfdc';
    ctx.textAlign = 'center';
    const keys = s.phase === 'choose' ? s.keys.choose : s.keys.play;
    ctx.fillText(keys, L.cx, L.y + L.H - 18);
    ctx.restore();
  }

  glyph(k, x, y) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = '#c8cfdc'; ctx.fillStyle = '#c8cfdc'; ctx.lineWidth = 1.6;
    if (k === 'fork') {
      ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x, y); ctx.lineTo(x, y - 5); ctx.lineTo(x + 7, y - 5); ctx.moveTo(x, y); ctx.lineTo(x, y + 5); ctx.lineTo(x + 7, y + 5); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
    } else if (k === 'and') {
      ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x, y - 6); ctx.arc(x, y, 6, -Math.PI / 2, Math.PI / 2); ctx.lineTo(x - 6, y + 6); ctx.closePath(); ctx.stroke();
    } else if (k === 'inv') {
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 3, y - 2); ctx.lineTo(x + 3, y - 2); ctx.moveTo(x + 3, y + 2); ctx.lineTo(x - 3, y + 2); ctx.stroke();
    } else if (k === 'lock') {
      ctx.strokeRect(x - 5, y - 2, 10, 8);
      ctx.beginPath(); ctx.arc(x, y - 2, 3.5, Math.PI, 0); ctx.stroke();
    } else if (k === 'free') {
      ctx.font = '700 13px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText('∞', x, y);
    }
    ctx.restore();
  }

  drawChoose(s, L, colour) {
    const ctx = this.ctx;
    ctx.save();
    const left = s.playerSide === 0;
    ctx.strokeStyle = s.youColour; ctx.lineWidth = 2.5;
    ctx.shadowColor = s.youColour; ctx.shadowBlur = 16;
    const x = left ? L.x + 10 : L.cx + L.cw / 2 + 2;
    const w = L.cx - L.cw / 2 - L.x - 12;
    roundRect(ctx, x, L.boardY - 6, w, L.boardH + 12, 10);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // the prompt sits in the header, so the wires stay visible while you compare
    ctx.fillStyle = '#e8edf5';
    ctx.font = '700 15px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`Choose your side  ·  ${Math.ceil(s.chooseT)}`, L.cx, L.y + 64);
    ctx.restore();
  }

  drawResult(s, L) {
    const ctx = this.ctx;
    ctx.save();
    const won = s.roundWon;
    const col = won === 1 ? s.youColour : won === 0 ? s.themColour : '#e8edf5';
    const bw = 420, bh = 92;
    const bx = L.cx - bw / 2, by = L.y + L.H / 2 - bh / 2;
    ctx.fillStyle = 'rgba(5,7,12,0.94)';
    roundRect(ctx, bx, by, bw, bh, 12); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.shadowColor = col; ctx.shadowBlur = 18; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.fillStyle = col;
    ctx.font = '700 26px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(s.resultTitle, L.cx, by + 36);
    ctx.font = '500 13px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#c8cfdc';
    ctx.fillText(s.resultLine, L.cx, by + 66);
    ctx.restore();
  }

  drawTutorial(s, L) {
    const ctx = this.ctx;
    const tip = s.tutorial;
    ctx.save();
    const bw = Math.min(560, L.W - 60);
    ctx.font = '500 14px "IBM Plex Mono", monospace';
    const lines = wrap(ctx, tip.text, bw - 40);
    const bh = 54 + lines.length * 20;
    const bx = L.cx - bw / 2, by = L.y + L.H / 2 - bh / 2;
    ctx.fillStyle = 'rgba(8,10,16,0.97)';
    roundRect(ctx, bx, by, bw, bh, 12); ctx.fill();
    ctx.strokeStyle = s.youColour; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = s.youColour;
    ctx.font = '700 15px "Chakra Petch", sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(tip.title, bx + 20, by + 16);
    ctx.fillStyle = '#d6dce8';
    ctx.font = '500 14px "IBM Plex Mono", monospace';
    lines.forEach((ln, i) => ctx.fillText(ln, bx + 20, by + 42 + i * 20));
    ctx.fillStyle = '#8f98ab';
    ctx.font = '500 12px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(tip.more, bx + bw - 20, by + bh - 22);
    ctx.restore();
  }
}

function wrap(ctx, text, width) {
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const t = line ? `${line} ${word}` : word;
      if (ctx.measureText(t).width > width && line) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export { reach };
