// Draws the hack board on a 2D canvas over the game: a circuit board, with
// copper traces that glow in the colour they paint once lit, pulses that
// run down them like comets, and cells like glass capsules that fill with
// light. Each cell also carries a chevron pointing at its owner, so the
// board reads without relying on colour alone. Faces either side: KLP-2,
// and the droid you're inside, which has opinions.
import { reach, evalSide, pathOf } from './board.js';

const DIM = '#4a3624';     // an unlit copper trace
const DIM2 = '#6b5038';
// Colours marked with a ~ are the faint trail of the wire you've selected,
// drawn before you fire, not a live pulse.
const GHOST = '~';
const isGhost = (c) => !!c && c[0] === GHOST;
const ink = (c) => (isGhost(c) ? c.slice(1) : c);

export class HackView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduced = false;
    this.t = 0;
    this.bootT = 1;        // how far the board has drawn itself in
    this.resultAge = 0;
    this.tally = null;     // the tug-of-war bar, eased
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

  layout(rows, strip) {
    const W = Math.min(980, this.w - 32);
    const H = Math.min(640, this.h - 40);
    const x = (this.w - W) / 2, y = (this.h - H) / 2;
    const top = 94 + (strip ? 52 : 0), bottom = 74;
    const room = H - top - bottom;
    // small lesson boards keep a sensible row height and sit in the middle
    const rowH = Math.min(room / rows, 62);
    const boardH = rowH * rows;
    const boardY = y + top + (room - boardH) / 2;
    const cw = Math.max(64, Math.min(96, W * 0.09));
    const cx = x + W / 2;
    return { x, y, W, H, boardY, boardH, rowH, cw, cx, stripY: y + 94 };
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
    const L = this.layout(B.rows, !!s.callout);
    const colour = (side) => (side === s.playerSide ? s.youColour : s.themColour);
    const valColour = (side, v) => (v === 1 ? colour(side) : v === 2 ? colour(1 - side) : null);
    // a new board draws itself in from the edges
    if (B !== this.lastBoard) { this.lastBoard = B; this.bootT = this.reduced ? 1 : 0; this.tally = null; }
    this.bootT = Math.min(1, this.bootT + dt / 0.75);
    this.resultAge = s.phase === 'result' ? this.resultAge + dt : 0;

    // ---- panel: a circuit board
    ctx.save();
    ctx.drawImage(this.substrate(L), L.x, L.y, L.W, L.H);
    const grad = ctx.createLinearGradient(L.x, 0, L.x + L.W, 0);
    grad.addColorStop(0, colour(0)); grad.addColorStop(0.5, 'rgba(255,255,255,0.15)'); grad.addColorStop(1, colour(1));
    ctx.strokeStyle = grad; ctx.lineWidth = 1.5;
    roundRect(ctx, L.x + 0.5, L.y + 0.5, L.W - 1, L.H - 1, 14);
    ctx.stroke();
    ctx.restore();

    // ---- faces either side, if there's room
    this.drawFaces(s, L, colour);

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
    // what you did to it before the hack, in the header where it's read
    const notes = [];
    if (s.dented) notes.push(`DENTED: ${s.dented} PULSER${s.dented > 1 ? 'S' : ''} DOWN`);
    if (s.late) notes.push(`${s.late.toUpperCase()}: STARTS LATE`);
    if (notes.length) {
      ctx.fillStyle = '#ff8a7a';
      ctx.fillText(`${notes.join('  ·  ')}  ·  `, L.x + L.W - 22 - ctx.measureText(sub).width, L.y + 24);
    }
    ctx.textAlign = 'left';
    ctx.restore();
    // who's winning, right now: a tug of war across the top
    this.drawTally(s, L, colour);
    // the timer: a fuse burning in from both ends
    const tf = s.phase === 'choose' ? 1 : Math.max(0, 1 - R.time / R.timer);
    this.drawFuse(L, tf);
    if (s.phase === 'play') this.drawClock(L, R.timer - R.time, tf);

    if (s.callout) this.drawCallout(s, L);

    // ---- the selected wire's path, worked out fresh each frame as locks light
    const ghost = s.phase === 'play' && s.cursor != null ? pathOf(B.sides[s.playerSide], s.cursor) : null;
    const preview = ghost ? ghost.cells : s.preview;

    // ---- a new board draws itself in, from the edges to the middle
    const boot = 1 - (1 - this.bootT) ** 3;
    const half = (L.W / 2) * boot;
    if (boot < 1) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(L.x, L.y, half, L.H); ctx.rect(L.x + L.W - half, L.y, half, L.H);
      ctx.clip();
    }

    // ---- both sides
    for (let side = 0; side < 2; side++) this.drawSide(s, L, side, colour, valColour, side === s.playerSide ? ghost : null);

    // ---- centre column
    for (let r = 0; r < B.rows; r++) {
      const cell = B.cells[r];
      const y = L.boardY + r * L.rowH;
      const x0 = L.cx - L.cw / 2 + 6, w = L.cw - 12, h = L.rowH - 6;
      const rad = Math.min(h / 2, 11);
      ctx.save();
      const flash = Math.max(0, 1 - cell.flipT * 4);
      // the glass
      ctx.fillStyle = 'rgba(8,12,18,0.92)';
      roundRect(ctx, x0, y + 3, w, h, rad); ctx.fill();
      ctx.save();
      roundRect(ctx, x0 + 2.5, y + 5.5, w - 5, h - 5, rad - 2); ctx.clip();
      if (cell.contested) {
        // striped, both colours
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
        // light pours in from the owner's side when it flips
        const c = colour(cell.owner);
        const fill = this.reduced ? 1 : Math.min(1, 0.15 + cell.flipT * 5);
        const fw = (w - 5) * fill;
        const fx = cell.owner === 0 ? x0 + 2.5 : x0 + w - 2.5 - fw;
        const g = ctx.createLinearGradient(0, y + 5, 0, y + 3 + h);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.22, c); g.addColorStop(1, c);
        ctx.shadowColor = c; ctx.shadowBlur = 12 + flash * 22;
        ctx.globalAlpha = 0.8 + flash * 0.2;
        ctx.fillStyle = g;
        ctx.fillRect(fx, y + 5.5, fw, h - 5);
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
      // a highlight along the top of the glass, and its rim
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      roundRect(ctx, x0 + rad * 0.6, y + 5, w - rad * 1.2, Math.max(2, h * 0.16), 2); ctx.fill();
      ctx.strokeStyle = 'rgba(200,220,235,0.28)'; ctx.lineWidth = 1.2;
      roundRect(ctx, x0, y + 3, w, h, rad); ctx.stroke();
      // a splash when it changes hands
      if (flash > 0 && !cell.contested && !this.reduced) {
        const sp = 1 - flash;
        ctx.strokeStyle = colour(cell.owner); ctx.globalAlpha = flash * 0.8; ctx.lineWidth = 2;
        roundRect(ctx, x0 - sp * 8, y + 3 - sp * 5, w + sp * 16, h + sp * 10, rad + sp * 5); ctx.stroke();
      }
      ctx.restore();
      // preview: which cells the selected wire reaches
      if (preview && preview[r]) {
        ctx.save();
        ctx.strokeStyle = preview[r] === 1 ? s.youColour : s.themColour;
        ctx.setLineDash([4, 3]); ctx.lineWidth = 2;
        roundRect(ctx, x0 - 3, y + 1, w + 6, h + 4, 6);
        ctx.stroke();
        ctx.restore();
      }
    }

    if (boot < 1) {
      ctx.restore();
      // the edge of the reveal, as a bright scan line on each side
      ctx.save();
      ctx.fillStyle = 'rgba(200,255,250,0.6)';
      ctx.fillRect(L.x + half - 1, L.boardY - 8, 2, L.boardH + 16);
      ctx.fillRect(L.x + L.W - half - 1, L.boardY - 8, 2, L.boardH + 16);
      ctx.restore();
    }

    // ---- at the end, the winner's colour washes out over the board
    if (s.phase === 'result' && !this.reduced) {
      const col = s.roundWon === 1 ? s.youColour : s.roundWon === 0 ? s.themColour : '#e8edf5';
      const rr = this.resultAge * 900;
      ctx.save();
      roundRect(ctx, L.x, L.y, L.W, L.H, 14); ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      const cy = L.boardY + L.boardH / 2;
      const wave = ctx.createRadialGradient(L.cx, cy, Math.max(0, rr - 140), L.cx, cy, rr + 1);
      wave.addColorStop(0, hexA(col, 0)); wave.addColorStop(0.75, hexA(col, 0.22)); wave.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = wave;
      ctx.fillRect(L.x, L.y, L.W, L.H);
      ctx.restore();
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
    if (s.paused) this.drawPaused(s, L);
  }

  // The board itself: dark substrate, faint etched traces and vias, drawn
  // once for each size and kept.
  substrate(L) {
    const key = `${Math.round(L.W)}x${Math.round(L.H)}x${this.dpr}`;
    if (this.subKey === key) return this.subCanvas;
    const c = this.subCanvas || document.createElement('canvas');
    c.width = Math.round(L.W * this.dpr); c.height = Math.round(L.H * this.dpr);
    const g = c.getContext('2d');
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = L.W, H = L.H;
    roundRect(g, 0, 0, W, H, 14);
    g.save();
    g.clip();
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#081014'); bg.addColorStop(1, '#05090c');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // etched traces, faint, with 45 degree bends, and the odd via
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let i = 0; i < 70; i++) {
      let x = rnd() * W, y = rnd() * H;
      g.strokeStyle = `rgba(120, 170, 160, ${0.035 + rnd() * 0.04})`;
      g.lineWidth = 1 + rnd() * 1.5;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 3; k++) {
        const len = 20 + rnd() * 70, dir = Math.floor(rnd() * 8) * Math.PI / 4;
        x += Math.cos(dir) * len; y += Math.sin(dir) * len;
        g.lineTo(x, y);
      }
      g.stroke();
      g.fillStyle = 'rgba(160, 190, 180, 0.07)';
      g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill();
    }
    // a soft light in the middle, where the cells are
    const glow = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * 0.6);
    glow.addColorStop(0, 'rgba(255,255,255,0.045)'); glow.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    g.restore();
    // mounting holes
    for (const [x, y] of [[14, 14], [W - 14, 14], [14, H - 14], [W - 14, H - 14]]) {
      g.fillStyle = '#020405'; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(160, 130, 90, 0.5)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.stroke();
    }
    this.subCanvas = c; this.subKey = key;
    return c;
  }

  // Cells owned, as a tug of war: your colour pushing in from your side.
  drawTally(s, L, colour) {
    const ctx = this.ctx;
    const R = s.round;
    const rows = R.board.rows;
    const n = R.count();
    const want = [n[0] / rows, n[1] / rows];
    if (!this.tally) this.tally = want.slice();
    const k = this.reduced ? 1 : Math.min(1, 0.15);
    this.tally[0] += (want[0] - this.tally[0]) * k;
    this.tally[1] += (want[1] - this.tally[1]) * k;
    const x = L.x + 22, w = L.W - 44, y = L.y + 40, h = 9;
    ctx.save();
    ctx.fillStyle = '#121822';
    roundRect(ctx, x, y, w, h, 4); ctx.fill();
    ctx.save();
    roundRect(ctx, x, y, w, h, 4); ctx.clip();
    const a = w * this.tally[0], b = w * this.tally[1];
    ctx.shadowBlur = 12;
    ctx.shadowColor = colour(0); ctx.fillStyle = colour(0); ctx.fillRect(x, y, a, h);
    ctx.shadowColor = colour(1); ctx.fillStyle = colour(1); ctx.fillRect(x + w - b, y, b, h);
    ctx.shadowBlur = 0;
    // a bright seam where they meet
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    if (a > 1) ctx.fillRect(x + a - 1.5, y, 2, h);
    if (b > 1) ctx.fillRect(x + w - b - 0.5, y, 2, h);
    ctx.restore();
    // the half-way mark: get past it and you're winning
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(L.cx - 0.75, y - 3, 1.5, h + 6);
    ctx.restore();
  }

  drawFuse(L, tf) {
    const ctx = this.ctx;
    const x = L.x + 22, w = L.W - 44, y = L.y + 54;
    ctx.save();
    ctx.fillStyle = '#1a1f2a';
    ctx.fillRect(x, y, w, 2);
    const hot = tf < 0.25;
    const len = w * tf, x0 = L.cx - len / 2, x1 = L.cx + len / 2;
    ctx.fillStyle = hot ? '#ff5a5a' : '#c9b48a';
    ctx.fillRect(x0, y, len, 2);
    // a spark at each burning end
    if (tf > 0 && tf < 1) {
      for (const ex of [x0, x1]) {
        const f = this.reduced ? 1 : 0.7 + Math.random() * 0.6;
        ctx.shadowColor = hot ? '#ff7a5a' : '#ffd890'; ctx.shadowBlur = 10 * f;
        ctx.fillStyle = '#fff3d0';
        ctx.beginPath(); ctx.arc(ex, y + 1, 2.4 * f, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  // Seconds left, big, between the two pulse counts.
  drawClock(L, left, tf) {
    const ctx = this.ctx;
    const x = L.cx, y = L.y + 74, r = 15;
    const hot = tf < 0.25;
    ctx.save();
    ctx.fillStyle = 'rgba(5,7,12,0.9)';
    ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2a3140'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = hot ? '#ff5a5a' : '#e8edf5';
    ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * tf); ctx.stroke();
    ctx.fillStyle = hot ? '#ff8a7a' : '#e8edf5';
    ctx.font = '700 14px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.max(0, Math.ceil(left))), x, y + 0.5);
    ctx.restore();
  }

  // KLP-2 on its side of the board, the opponent on theirs, each with a face
  // that shows how it's going. Outside the panel when the window is wide
  // enough; otherwise only the opponent's remarks show, over its side.
  drawFaces(s, L, colour) {
    const R = s.round;
    const room = (this.w - L.W) / 2;
    const n = R.count();
    const you = s.playerSide, them = 1 - you;
    const lead = n[you] - n[them];
    const playing = s.phase === 'play';
    const result = s.phase === 'result';
    const moodFor = (side) => {
      const mine = side === you ? lead : -lead;
      if (result) return s.roundWon === -1 ? 'worried' : (s.roundWon === 1) === (side === you) ? 'smug' : 'shocked';
      if (!playing) return 'neutral';
      return mine >= 2 ? 'smug' : mine <= -2 ? 'worried' : 'neutral';
    };
    const t = s.target;
    const shape = t && t.kind === 'droid' ? (t.model && t.model.spec.shape) || 'squat' : t && t.kind === 'mainframe' ? 'eye' : 'terminal';
    const big = room >= 130;
    const size = big ? Math.min(110, room - 30) : 0;
    const y = L.y + L.H * 0.42;
    for (const side of [0, 1]) {
      const cx = side === 0 ? L.x - room / 2 : L.x + L.W + room / 2;
      if (big) {
        this.face(cx, y, size, {
          colour: colour(side), shape: side === you ? 'player' : shape, mood: moodFor(side),
          label: side === you ? 'KLP-2' : (t && t.kind === 'droid' ? (t.bounty || `${s.spec.family ? s.spec.family.toUpperCase() : ''} ${t.cls}`) : s.spec.title).trim(),
        });
      }
      // the opponent's remark
      if (side === them && s.said && R.time - s.said.t < 2.6) {
        const bx = big ? cx : (side === 0 ? L.x + 150 : L.x + L.W - 150);
        const by = big ? y - size * 0.62 - 10 : L.y + 96;
        this.bubble(bx, by, s.said.text, colour(side), big ? Math.min(room - 12, 220) : 260, R.time - s.said.t);
      }
    }
  }

  face(cx, cy, size, o) {
    const ctx = this.ctx;
    const t = this.t;
    const k = size / 100;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(k, k);
    // a glow behind, in its colour
    const glow = ctx.createRadialGradient(0, 0, 10, 0, 0, 62);
    glow.addColorStop(0, hexA(o.colour, o.mood === 'smug' ? 0.32 : 0.18)); glow.addColorStop(1, hexA(o.colour, 0));
    ctx.fillStyle = glow; ctx.fillRect(-62, -62, 124, 124);
    const bob = this.reduced ? 0 : Math.sin(t * 2.2) * 1.5 + (o.mood === 'worried' ? Math.sin(t * 30) * 0.8 : 0);
    ctx.translate(0, bob);
    // shell: proportions by shape
    const dims = { player: [34, 26, 30], squat: [36, 20, 34], tall: [28, 34, 26], wide: [44, 20, 24], orb: [36, 0, 36], eye: [0, 0, 0], terminal: [36, 30, 0] }[o.shape] || [34, 24, 30];
    const [rw, bh, dh] = dims;
    if (o.shape === 'eye') {
      ctx.strokeStyle = hexA(o.colour, 0.6); ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, 20 + i * 10, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = o.colour; ctx.shadowColor = o.colour; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.arc(o.mood === 'worried' ? Math.sin(t * 9) * 4 : 0, 0, 12, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      this.faceLabel(cx, cy + size * 0.6, o);
      return;
    }
    const shell = ctx.createLinearGradient(0, -40, 0, 40);
    shell.addColorStop(0, '#9aa3b2'); shell.addColorStop(1, '#3a404c');
    ctx.fillStyle = shell;
    if (o.shape === 'terminal') {
      roundRect(ctx, -rw, -28, rw * 2, 52, 8); ctx.fill();
      ctx.fillStyle = '#05070a'; roundRect(ctx, -rw + 6, -22, rw * 2 - 12, 34, 5); ctx.fill();
    } else {
      roundRect(ctx, -rw, 4, rw * 2, bh + 6, 8); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, 6, rw * 0.96, dh || rw, 0, Math.PI, 0); ctx.fill();
    }
    // the visor, and the eyes on it
    const vy = o.shape === 'terminal' ? -5 : -6;
    ctx.fillStyle = '#05070a';
    roundRect(ctx, -rw * 0.8, vy - 9, rw * 1.6, 18, 8); ctx.fill();
    ctx.fillStyle = o.colour; ctx.strokeStyle = o.colour; ctx.shadowColor = o.colour; ctx.shadowBlur = 10;
    ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    const blink = Math.sin(t * 1.3 + (o.shape === 'player' ? 0 : 2)) > 0.985;
    for (const ex of [-rw * 0.38, rw * 0.38]) {
      ctx.beginPath();
      if (blink) { ctx.moveTo(ex - 6, vy); ctx.lineTo(ex + 6, vy); ctx.stroke(); }
      else if (o.mood === 'smug') { ctx.arc(ex, vy + 3, 6, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
      else if (o.mood === 'worried') { ctx.arc(ex, vy + 1, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(ex - 6, vy - 7 - (ex < 0 ? -2 : 2)); ctx.lineTo(ex + 6, vy - 7 + (ex < 0 ? -2 : 2)); ctx.stroke(); }
      else if (o.mood === 'shocked') { ctx.arc(ex, vy, 5.5, 0, Math.PI * 2); ctx.stroke(); }
      else { roundRect(ctx, ex - 5, vy - 4, 10, 8, 3); ctx.fill(); }
    }
    ctx.shadowBlur = 0;
    // a bead of sweat when it's losing
    if (o.mood === 'worried' && !this.reduced) {
      const sy = ((t * 30) % 24);
      ctx.fillStyle = 'rgba(150, 210, 255, 0.85)';
      ctx.beginPath(); ctx.ellipse(rw * 0.9, -14 + sy, 2.5, 4, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    this.faceLabel(cx, cy + size * 0.6, o);
  }

  faceLabel(cx, y, o) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = '700 12px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = o.colour;
    ctx.fillText(o.label.toUpperCase(), cx, y);
    ctx.restore();
  }

  // A speech bubble on the canvas, for the opponent's remarks.
  bubble(x, y, text, col, maxW, age) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = '600 12.5px "IBM Plex Mono", monospace';
    const lines = wrap(ctx, text, maxW - 20).slice(0, 3);
    const w = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 20), h = lines.length * 16 + 12;
    const pop = this.reduced ? 1 : Math.min(1, age * 8);
    ctx.globalAlpha = age > 2.2 ? Math.max(0, (2.6 - age) / 0.4) : 1;
    ctx.translate(x, y);
    ctx.scale(0.85 + 0.15 * pop, 0.85 + 0.15 * pop);
    ctx.fillStyle = 'rgba(6,8,13,0.95)';
    ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    roundRect(ctx, -w / 2, -h, w, h, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(0, 7); ctx.lineTo(6, 0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-6, 0.5); ctx.lineTo(0, 7); ctx.lineTo(6, 0.5); ctx.stroke();
    ctx.fillStyle = '#f2f5fa'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, 0, -h + 14 + i * 16));
    ctx.restore();
  }

  // The lesson: one line about the part that's new on this board.
  drawCallout(s, L) {
    const ctx = this.ctx;
    const c = s.callout;
    const x = L.x + 22, w = L.W - 44, y = L.stripY, h = 44;
    ctx.save();
    const lit = s.phase === 'choose' && s.fresh;
    const pulse = lit && !this.reduced ? 0.55 + Math.sin(this.t * 4) * 0.25 : lit ? 0.7 : 0.3;
    ctx.fillStyle = `rgba(46,242,255,${lit ? 0.09 : 0.05})`;
    roundRect(ctx, x, y, w, h, 8); ctx.fill();
    ctx.strokeStyle = `rgba(46,242,255,${pulse})`; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.textBaseline = 'middle';
    ctx.font = '700 15px "Chakra Petch", sans-serif';
    ctx.fillStyle = s.youColour;
    ctx.fillText(c.title, x + 14, y + h / 2);
    const tw = ctx.measureText(c.title).width + 30;
    ctx.font = '500 13px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#d6dce8';
    const lines = wrap(ctx, c.line, w - tw - 14).slice(0, 2);
    const lh = 17;
    lines.forEach((ln, i) => ctx.fillText(ln, x + tw, y + h / 2 + (i - (lines.length - 1) / 2) * lh));
    ctx.restore();
  }

  // A pulsing ring round the part a lesson is about.
  spotlight(x, y, r) {
    const ctx = this.ctx;
    ctx.save();
    const k = this.reduced ? 0.6 : 0.5 + Math.sin(this.t * 5) * 0.3;
    ctx.strokeStyle = `rgba(255,255,255,${k})`;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  drawPaused(s, L) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(5,7,12,0.82)';
    roundRect(ctx, L.x, L.y, L.W, L.H, 14);
    ctx.fill();
    ctx.fillStyle = '#e8edf5';
    ctx.font = '700 24px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Paused', L.cx, L.y + L.H / 2 - 12);
    ctx.font = '500 13px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#9aa3b5';
    ctx.fillText(s.game.input.lastDevice === 'pad' ? 'Start or A to carry on' : 'Esc or Space to carry on', L.cx, L.y + L.H / 2 + 18);
    ctx.restore();
  }

  drawSide(s, L, side, colour, valColour, ghost) {
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
    ctx.fillText(you ? 'YOU' : 'THEM', lx, L.y + 74);
    // one dot per pulse: filled while you have it, hollow once fired. Shown
    // from the start, so you know what you've got while you pick a side.
    const before = s.phase === 'choose';
    const pips = before ? (s.expected ? (you ? s.expected.you : s.expected.them) : 0) : R.pulsers[side];
    const total = before ? pips : Math.max(pips, s.startPulsers[side]);
    const step = 16, rad = 5.5, y = L.y + 74;
    const at = (i) => (side === 0 ? lx + 46 + i * step : lx - 46 - i * step);
    for (let i = 0; i < total; i++) {
      ctx.beginPath(); ctx.arc(at(i), y, rad, 0, Math.PI * 2);
      if (i < pips) { ctx.fillStyle = colour(side); ctx.fill(); } else { ctx.strokeStyle = DIM2; ctx.lineWidth = 1.4; ctx.stroke(); }
    }
    // pulsers knocked out by dents, crossed through
    const broken = !you ? s.dented || 0 : 0;
    for (let i = total; i < total + broken; i++) {
      ctx.strokeStyle = '#ff8a7a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(at(i), y, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(at(i) - 4.5, y - 4.5); ctx.lineTo(at(i) + 4.5, y + 4.5); ctx.stroke();
    }
    // the count in words, and a flash when you try to fire with none left
    const recent = you && s.emptyAt != null && R.time - s.emptyAt < 0.7;
    const flash = recent && (this.reduced || Math.sin((R.time - s.emptyAt) * 28) > 0);
    ctx.font = '600 12px "IBM Plex Mono", monospace';
    const free = R.freeFirst[side] ? ' + 1 free' : '';
    ctx.fillStyle = flash ? '#ff8a7a' : pips || R.freeFirst[side] ? colour(side) : '#ff8a7a';
    const words = pips || free ? `${pips} left${free}` : 'none left';
    ctx.fillText(words, at(total + broken) + (side === 0 ? -rad + 4 : rad - 4), y + 0.5);
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
    // the selected wire's trail, in the colour it would paint
    const ghostLit = (c, r, half) => {
      const v = ghost ? ghost.path[c + half][r] : 0;
      return v ? GHOST + valColour(side, v) : null;
    };
    const frac = (x) => (x - xs + 46) / (xe - xs + 46 + L.cw / 2);

    const line = (xa, ya, xb, yb, col, width = 2) => {
      ctx.beginPath();
      ctx.moveTo(mirror(xa), ya); ctx.lineTo(mirror(xb), yb);
      if (isGhost(col)) {
        ctx.strokeStyle = ink(col); ctx.globalAlpha = 0.5; ctx.lineWidth = width + 0.5;
        ctx.stroke(); ctx.globalAlpha = 1;
      } else if (col) {
        ctx.strokeStyle = col; ctx.lineWidth = width + 1.5;
        ctx.shadowColor = col; ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.55; ctx.lineWidth = 1;
        ctx.stroke(); ctx.globalAlpha = 1;
        // light running along it, towards the cells
        if (!this.reduced) {
          ctx.setLineDash([3, 10]);
          ctx.lineDashOffset = -this.t * 55;
          ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.8;
          ctx.stroke();
          ctx.setLineDash([]);
        }
      } else {
        // unlit: a copper trace on the board
        ctx.strokeStyle = '#0d0a07'; ctx.lineWidth = width + 2.5; ctx.stroke();
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
      const pc = valColour(side, pv) || partialLit(0, r, 0, 0) || ghostLit(0, r, 0);
      line(xPort + 8, y, xs, y, pc);
      // last slot to the cell
      const lc = segColour(S.cols - 1, r, 1) || partialLit(S.cols - 1, r, 1, frac(xe)) || ghostLit(S.cols - 1, r, 1);
      line(xe, y, L.cx - L.cw / 2 + 4, y, lc);
    }

    for (let c = 0; c < S.cols; c++) {
      const sx = xs + c * sw, mx = sx + sw / 2, ex = sx + sw;
      const done = new Set();
      for (let r = 0; r < B.rows; r++) {
        const comp = S.grid[c][r];
        if (!comp || done.has(comp)) continue;
        done.add(comp);
        const inC = (rr) => segColour(c, rr, 0) || partialLit(c, rr, 0, frac(mx)) || ghostLit(c, rr, 0);
        const outC = (rr) => segColour(c, rr, 1) || partialLit(c, rr, 1, frac(ex)) || ghostLit(c, rr, 1);
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
            line(sx, y, mx - 10, y, inC(comp.a)); line(mx + 10, y, ex, y, outC(comp.a));
            const into = inC(comp.a);
            this.invert(mirror(mx), y, 10.5, colour(side), colour(1 - side), side === 1, into ? (isGhost(into) ? 0.6 : 1) : 0);
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
            ctx.fillStyle = oc ? ink(oc) : '#8b93a6';
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
            ctx.strokeStyle = lit ? ink(lit) : '#8b93a6'; ctx.lineWidth = 2;
            if (lit && !isGhost(lit)) { ctx.shadowColor = lit; ctx.shadowBlur = 10; }
            ctx.fill(); ctx.stroke();
            // a light on each input, so you can see when it's waiting for the other
            ctx.shadowBlur = 0;
            const at = (yy) => Math.max(-hh + 5, Math.min(hh - 5, yy - gy));
            for (const [iy, ic] of [[at(ya), inC(a)], [at(yb), inC(a + 1)]]) {
              ctx.beginPath(); ctx.arc(3, iy, 3.2, 0, Math.PI * 2);
              if (ic) { ctx.fillStyle = ink(ic); ctx.globalAlpha = isGhost(ic) ? 0.6 : 1; ctx.fill(); ctx.globalAlpha = 1; } else { ctx.strokeStyle = DIM2; ctx.lineWidth = 1.2; ctx.stroke(); }
            }
            ctx.restore();
            ctx.fillStyle = '#c8cfdc'; ctx.font = '700 12px "IBM Plex Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('&', mirror(gx + gw * 0.45), gy + 0.5);
            break;
          }
          default: break;
        }
      }
    }

    // the lesson's new part, picked out while you look and for a moment after
    const showFocus = s.focus && (s.phase === 'choose' ? (s.canSwap || you) : you && s.phase === 'play' && R.time < 3);
    if (showFocus) {
      for (let c = 0; c < S.cols; c++) {
        const seen = new Set();
        for (const comp of S.grid[c]) {
          if (!comp || seen.has(comp)) continue;
          seen.add(comp);
          const match = s.focus === 'hidden' ? comp.hidden : comp.t === s.focus && !comp.hidden;
          if (!match) continue;
          const two = comp.t === 'fork' || comp.t === 'and';
          const cy = two ? (rowY(comp.a) + rowY(comp.a + 1)) / 2 : rowY(comp.a);
          this.spotlight(mirror(xs + c * sw + sw / 2), cy, two ? Math.min(L.rowH * 0.95, 34) : Math.min(L.rowH * 0.42, 17));
        }
      }
      if (s.focus === 'free') for (let r = 0; r < B.rows; r++) if (S.ports[r].free) this.spotlight(mirror(xPort + 20), rowY(r) - 9, 11);
    }

    // wire hints: each arrow coloured by where its wire lands, while you're
    // learning, or always if you ask for them in the settings
    const hinted = s.hints && (s.phase === 'choose' ? (s.canSwap || you) : you && s.phase === 'play');
    const hint = (r) => {
      const P = pathOf(S, r);
      if (!P.cells) return { fill: '#5d6578', mark: '?' };
      const mine = P.cells.filter((v) => v === 1).length, theirs = P.cells.filter((v) => v === 2).length;
      if (mine && theirs) return { fill: colour(side), edge: colour(1 - side) };
      if (mine) return { fill: colour(side) };
      if (theirs) return { fill: colour(1 - side) };
      if (P.and) return { fill: '#5d6578', mark: '&' };
      return { fill: '#2a2f3a', edge: '#454d5f' };
    };

    // each pulse on its way, as a comet at its leading edge
    for (const p of partial) {
      const span = xe - xs + 46 + L.cw / 2;
      const hx = Math.min(L.cx - L.cw / 2 + 2, xs - 46 + p.k * span);
      const col = hx < xs ? 0 : hx > xe ? S.cols : Math.min(S.cols, Math.floor((hx - xs) / sw) + ((hx - xs) % sw > sw / 2 ? 1 : 0));
      for (let r = 0; r < B.rows; r++) {
        const v = p.tr[col] && p.tr[col][r];
        if (!v) continue;
        const c = valColour(side, v);
        const x = mirror(hx), y = rowY(r), back = side === 0 ? -1 : 1;
        const tail = ctx.createLinearGradient(x + back * 34, y, x, y);
        tail.addColorStop(0, hexA(c, 0)); tail.addColorStop(1, hexA(c, 0.9));
        ctx.strokeStyle = tail; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x + back * 34, y); ctx.lineTo(x, y); ctx.stroke();
        ctx.shadowColor = c; ctx.shadowBlur = 16;
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
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
      const h = hinted && !busy ? hint(r) : null;
      ctx.fillStyle = busy ? colour(side) : sel ? '#ffffff' : h ? h.fill : '#5d6578';
      ctx.shadowColor = colour(side); ctx.shadowBlur = busy || sel ? 12 : 0;
      ctx.beginPath();
      ctx.moveTo(px + dir * 8, y); ctx.lineTo(px - dir * 6, y - 7); ctx.lineTo(px - dir * 6, y + 7); ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      if (h && !sel) {
        if (h.edge) { ctx.strokeStyle = h.edge; ctx.lineWidth = 1.6; ctx.stroke(); }
        if (h.mark) {
          ctx.fillStyle = '#c8cfdc'; ctx.font = '700 11px "IBM Plex Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(h.mark, px - dir * 14, y + 0.5);
        }
      }
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
    // only the parts on this board
    const all = [
      ['break', 'Cut: goes nowhere'],
      ['fork', 'Fork: two cells'],
      ['and', 'AND: needs both'],
      ['inv', 'Invert: their colour'],
      ['lock', 'Lock: stays lit'],
      ['free', 'Free wire'],
      ['hidden', 'Hidden part'],
    ];
    const items = all.filter(([k]) => !s.parts || s.parts.has(k));
    const widths = items.map(([, t]) => 22 + ctx.measureText(t).width);
    const total = widths.reduce((a, b) => a + b, 0) + 22 * (items.length - 1);
    let x = L.cx - total / 2;
    items.forEach(([k, label], i) => {
      this.glyph(k, x + 8, y, s);
      ctx.fillStyle = k === s.focus ? '#e8edf5' : '#8f98ab';
      ctx.textAlign = 'left';
      ctx.fillText(label, x + 20, y);
      x += widths[i] + 22;
    });
    ctx.fillStyle = '#c8cfdc';
    ctx.textAlign = 'center';
    const keys = s.phase === 'choose' ? (s.canSwap ? s.keys.choose : s.keys.start) : s.keys.play;
    ctx.fillText(keys, L.cx, L.y + L.H - 18);
    ctx.restore();
  }

  glyph(k, x, y, s) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = '#c8cfdc'; ctx.fillStyle = '#c8cfdc'; ctx.lineWidth = 1.6;
    if (k === 'fork') {
      ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x, y); ctx.lineTo(x, y - 5); ctx.lineTo(x + 7, y - 5); ctx.moveTo(x, y); ctx.lineTo(x, y + 5); ctx.lineTo(x + 7, y + 5); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
    } else if (k === 'and') {
      ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x, y - 6); ctx.arc(x, y, 6, -Math.PI / 2, Math.PI / 2); ctx.lineTo(x - 6, y + 6); ctx.closePath(); ctx.stroke();
    } else if (k === 'inv') {
      ctx.restore();
      this.invert(x, y, 7, s ? s.youColour : '#c8cfdc', s ? s.themColour : '#8b93a6', false, 0.6);
      ctx.save();
    } else if (k === 'lock') {
      ctx.strokeRect(x - 5, y - 2, 10, 8);
      ctx.beginPath(); ctx.arc(x, y - 2, 3.5, Math.PI, 0); ctx.stroke();
    } else if (k === 'free') {
      ctx.font = '700 13px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText('∞', x, y);
    } else if (k === 'break') {
      ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x - 3, y); ctx.moveTo(x - 3, y - 5); ctx.lineTo(x - 3, y + 5);
      ctx.moveTo(x + 3, y - 5); ctx.lineTo(x + 3, y + 5); ctx.stroke();
    } else if (k === 'hidden') {
      ctx.strokeRect(x - 6, y - 7, 12, 14);
      ctx.font = '700 11px "Chakra Petch", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('?', x, y + 0.5);
    }
    ctx.restore();
  }

  // An invert: a ring split down the middle, the way in in the colour the
  // pulse arrives as, the way out in the colour it leaves as. lit 0 to 1.
  invert(x, y, r, inCol, outCol, flip, lit) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    for (const [a0, a1, col] of [[Math.PI / 2, Math.PI * 1.5, inCol], [-Math.PI / 2, Math.PI / 2, outCol]]) {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, a0, a1); ctx.closePath();
      ctx.fillStyle = col; ctx.globalAlpha = 0.45 + 0.5 * lit; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, r, a0, a1);
      ctx.strokeStyle = col; ctx.globalAlpha = 1; ctx.lineWidth = 2;
      if (lit >= 1) { ctx.shadowColor = col; ctx.shadowBlur = 10; }
      ctx.stroke(); ctx.shadowBlur = 0;
    }
    // the swap: one arrow each way
    ctx.globalAlpha = 1;
    ctx.strokeStyle = lit >= 0.5 ? '#05070c' : '#f2f5fa'; ctx.lineWidth = 1.7;
    const k = r / 8;
    ctx.beginPath();
    ctx.moveTo(-4 * k, -3 * k); ctx.lineTo(4 * k, -3 * k); ctx.moveTo(1.5 * k, -5.5 * k); ctx.lineTo(4 * k, -3 * k); ctx.lineTo(1.5 * k, -0.5 * k);
    ctx.moveTo(4 * k, 3 * k); ctx.lineTo(-4 * k, 3 * k); ctx.moveTo(-1.5 * k, 0.5 * k); ctx.lineTo(-4 * k, 3 * k); ctx.lineTo(-1.5 * k, 5.5 * k);
    ctx.stroke();
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
    const clock = Number.isFinite(s.chooseT) ? `  ·  ${Math.max(1, Math.ceil(s.chooseT))}` : '';
    ctx.fillText(s.canSwap ? `Choose your side${clock}` : 'Your wires are on the left', L.cx, L.y + 74);
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

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
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
