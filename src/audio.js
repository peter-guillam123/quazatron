// Every sound in the game is synthesised here with the Web Audio API, and
// each deck has a small generative score that gets busier in a fight.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Chord progressions per deck, as MIDI roots plus minor/major flags.
const SCORES = [
  { bpm: 96, root: 57, prog: [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M']] },     // Intake, A minor
  { bpm: 102, root: 50, prog: [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M']] },    // Freight, D minor
  { bpm: 92, root: 52, prog: [[0, 'm'], [1, 'M'], [0, 'm'], [-2, 'M']] },      // Reactor, E phrygian
  { bpm: 108, root: 48, prog: [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M']] },    // Security, C minor
  { bpm: 100, root: 54, prog: [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M']] },    // Command, F# minor
  { bpm: 112, root: 47, prog: [[0, 'm'], [-4, 'M'], [-7, 'm'], [-5, 'M']] },   // Mainframe, B minor
  { bpm: 84, root: 45, prog: [[0, 'm'], [-4, 'M'], [-7, 'm'], [-2, 'M']] },    // title
];

export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = { master: 0.8, music: 0.5, sfx: 0.8 };
    this.listener = { x: 0, y: 0, z: 0 };
    this.intensity = 0;
    this.targetIntensity = 0;
    this.score = null;
    this.hackMode = false;
    this.muted = false;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.music = ctx.createGain();
    this.sfx.connect(this.master);
    this.music.connect(this.master);
    // a generated room for reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.4, 2.2);
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = 0.32;
    this.reverbIn.connect(this.reverb).connect(this.master);
    this.noiseBuf = this.makeNoise();
    this.applyVolume();
    if (this.pendingScore != null) this.startMusic(this.pendingScore);
  }

  applyVolume() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume.master, t, 0.05);
    this.music.gain.setTargetAtTime(this.volume.music * 0.55, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.volume.sfx, t, 0.05);
  }

  setVolume(k, v) { this.volume[k] = v; this.applyVolume(); }

  impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  makeNoise() {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  setListener(p) { this.listener.x = p.x; this.listener.y = p.y; this.listener.z = p.z; }

  // ------------------------------------------------------------------ building blocks
  out(at, gain = 1, wet = 0.15) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    let vol = gain;
    let pan = 0;
    if (at) {
      const dx = at.x - this.listener.x, dz = at.z - this.listener.z;
      const dist = Math.hypot(dx, dz);
      vol *= Math.max(0, 1 - dist / 18) ** 1.4;
      // screen-right is (+x, -z) in this view
      pan = Math.max(-1, Math.min(1, (dx - dz) / 14));
    }
    g.gain.value = vol;
    if (vol <= 0.001) return null;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = pan; g.connect(p).connect(this.sfx); } else g.connect(this.sfx);
    if (wet > 0) {
      const w = ctx.createGain(); w.gain.value = wet;
      g.connect(w).connect(this.reverbIn);
    }
    return g;
  }

  osc(type, f0, f1, t0, dur, dest, peak = 0.3, attack = 0.005) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  }

  noise(t0, dur, dest, peak = 0.3, filter = 'lowpass', f0 = 2000, f1 = null, q = 1, attack = 0.004) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = filter; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  }

  // ------------------------------------------------------------------ sounds
  play(name, opts = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.005;
    const p = opts.pitch || 1;
    const at = opts.at;
    const O = (gain, wet) => this.out(at, gain, wet);
    let d;
    switch (name) {
      case 'laser':
        if (!(d = O(0.55, 0.2))) return;
        this.osc('square', 1200 * p, 180 * p, t, 0.14, d, 0.22);
        this.osc('sawtooth', 600 * p, 90 * p, t, 0.1, d, 0.12);
        break;
      case 'arc':
        if (!(d = O(0.7, 0.25))) return;
        for (let i = 0; i < 6; i++) this.noise(t + i * 0.035, 0.05, d, 0.5, 'bandpass', 1800 + Math.random() * 2400, null, 3);
        this.osc('sawtooth', 70, 50, t, 0.3, d, 0.15);
        break;
      case 'tractor':
        if (!(d = O(0.5, 0.3))) return;
        this.osc('sine', 180, 260, t, 0.5, d, 0.25, 0.08);
        this.osc('triangle', 183, 262, t, 0.5, d, 0.15, 0.08);
        break;
      case 'dash':
        if (!(d = O(0.6, 0.1))) return;
        this.noise(t, 0.28, d, 0.5, 'bandpass', 600, 3200, 1.5);
        this.osc('sine', 120, 300, t, 0.2, d, 0.2);
        break;
      case 'lunge':
        if (!(d = O(0.5, 0.05))) return;
        this.noise(t, 0.12, d, 0.35, 'bandpass', 900, 400, 2);
        break;
      case 'stomp':
        if (!(d = O(0.9, 0.3))) return;
        this.osc('sine', 90, 28, t, 0.5, d, 0.7);
        this.noise(t, 0.35, d, 0.5, 'lowpass', 900, 120);
        break;
      case 'ram':
        if (!(d = O(0.9, 0.15))) return;
        this.noise(t, 0.16, d, 0.6, 'lowpass', 2400 * p, 300);
        this.osc('sine', 160 * p, 50, t, 0.22, d, 0.5);
        this.osc('square', 420 * p, 380 * p, t, 0.09, d, 0.08);
        this.osc('square', 437 * p, 395 * p, t, 0.11, d, 0.08);
        break;
      case 'bump':
        if (!(d = O(0.4, 0.05))) return;
        this.osc('sine', 170, 90, t, 0.09, d, 0.3);
        break;
      case 'hit':
        if (!(d = O(0.5, 0.1))) return;
        this.noise(t, 0.08, d, 0.4, 'highpass', 1200);
        this.osc('square', 320, 160, t, 0.07, d, 0.12);
        break;
      case 'hurt':
        if (!(d = O(0.8, 0.1))) return;
        this.osc('sawtooth', 220, 70, t, 0.28, d, 0.35);
        this.noise(t, 0.15, d, 0.4, 'lowpass', 1600, 300);
        break;
      case 'explode':
        if (!(d = O(1, 0.4))) return;
        this.noise(t, 0.9, d, 0.8, 'lowpass', 3200, 120, 0.7);
        this.osc('sine', 80, 26, t, 0.8, d, 0.7);
        break;
      case 'fall':
        if (!(d = O(0.7, 0.4))) return;
        this.osc('sine', 700, 90, t, 0.9, d, 0.3, 0.02);
        break;
      case 'land':
        if (!(d = O(0.5, 0.05))) return;
        this.osc('sine', 110, 50, t, 0.14, d, 0.4);
        break;
      case 'empty':
        if (!(d = O(0.35, 0))) return;
        this.osc('square', 190, 190, t, 0.05, d, 0.12);
        this.osc('square', 150, 150, t + 0.07, 0.06, d, 0.12);
        break;
      case 'shield':
        if (!(d = O(0.45, 0.3))) return;
        this.osc('sine', 300, 340, t, 0.3, d, 0.2, 0.04);
        this.osc('sine', 452, 510, t, 0.3, d, 0.1, 0.04);
        break;
      case 'reflect':
        if (!(d = O(0.6, 0.35))) return;
        this.osc('triangle', 1400, 2200, t, 0.18, d, 0.3);
        break;
      case 'cloak':
        if (!(d = O(0.5, 0.4))) return;
        this.noise(t, 0.45, d, 0.35, 'bandpass', 3000, 300, 3, 0.02);
        this.osc('sine', 900, 300, t, 0.4, d, 0.12, 0.02);
        break;
      case 'uncloak':
        if (!(d = O(0.5, 0.4))) return;
        this.noise(t, 0.35, d, 0.3, 'bandpass', 300, 2600, 3, 0.02);
        break;
      case 'phase':
        if (!(d = O(0.55, 0.6))) return;
        for (const f of [620, 930, 1395]) this.osc('sine', f, f * 1.5, t, 0.45, d, 0.12, 0.03);
        break;
      case 'hoverOn':
        if (!(d = O(0.4, 0.2))) return;
        this.noise(t, 0.3, d, 0.25, 'bandpass', 400, 1400, 2, 0.05);
        break;
      case 'telegraph':
        if (!(d = O(0.3, 0.2))) return;
        this.osc('sine', 300 * p, 900 * p, t, 0.3, d, 0.12, 0.08);
        break;
      case 'doorOpen': case 'doorClose':
        if (!(d = O(0.5, 0.2))) return;
        this.osc('sawtooth', name === 'doorOpen' ? 90 : 140, name === 'doorOpen' ? 150 : 80, t, 0.35, d, 0.12, 0.03);
        this.noise(t, 0.3, d, 0.15, 'bandpass', 500, 900, 2);
        break;
      case 'fieldOn': case 'fieldOff':
        if (!(d = O(0.5, 0.2))) return;
        this.osc('sawtooth', name === 'fieldOn' ? 60 : 120, name === 'fieldOn' ? 120 : 40, t, 0.4, d, 0.15, 0.02);
        break;
      case 'bridge':
        if (!(d = O(0.5, 0.3))) return;
        [0, 4, 7, 12].forEach((n, i) => this.osc('triangle', NOTE(64 + n), null, t + i * 0.06, 0.12, d, 0.15));
        break;
      case 'crate': case 'crateHeavy':
        if (!(d = O(0.5, 0.05))) return;
        this.noise(t, 0.18, d, 0.35, 'bandpass', name === 'crate' ? 700 : 300, null, 2);
        break;
      case 'thud':
        if (!(d = O(0.7, 0.2))) return;
        this.osc('sine', 120, 40, t, 0.3, d, 0.6);
        break;
      case 'plateOn': case 'plateOff':
        if (!(d = O(0.4, 0.1))) return;
        this.osc('square', name === 'plateOn' ? 880 : 440, null, t, 0.05, d, 0.08);
        break;
      case 'ding':
        if (!(d = O(0.6, 0.5))) return;
        this.osc('sine', 1320, null, t, 0.8, d, 0.25);
        this.osc('sine', 1980, null, t, 0.5, d, 0.1);
        break;
      case 'charge':
        if (!(d = O(0.6, 0.4))) return;
        this.osc('sawtooth', 110, 880, t, 0.45, d, 0.15, 0.05);
        break;
      case 'repair': case 'unlock':
        if (!(d = O(0.6, 0.5))) return;
        [0, 4, 7, 12, 16].forEach((n, i) => this.osc('sine', NOTE(72 + n), null, t + i * 0.07, 0.35, d, 0.16));
        break;
      case 'relay':
        if (!(d = O(1, 0.5))) return;
        this.osc('sawtooth', 400, 40, t, 1.0, d, 0.3);
        this.noise(t, 0.8, d, 0.4, 'lowpass', 2000, 100);
        break;
      case 'spawn':
        if (!(d = O(0.6, 0.6))) return;
        this.osc('sine', 80, 600, t, 0.5, d, 0.2, 0.4);
        break;
      case 'alarm':
        if (!(d = O(0.5, 0.4))) return;
        for (let i = 0; i < 4; i++) this.osc('square', i % 2 ? 520 : 690, null, t + i * 0.18, 0.16, d, 0.1);
        break;
      case 'grapple':
        if (!(d = O(0.6, 0.2))) return;
        this.noise(t, 0.22, d, 0.3, 'bandpass', 800, 4000, 3);
        this.osc('sine', 400, 1400, t, 0.2, d, 0.18);
        this.osc('square', 140, 90, t + 0.22, 0.08, d, 0.2);
        break;
      case 'pickup':
        if (!(d = O(0.6, 0.4))) return;
        [0, 7, 12].forEach((n, i) => this.osc('triangle', NOTE(76 + n), null, t + i * 0.05, 0.25, d, 0.18));
        break;
      // ---- the hack
      case 'hackStart':
        if (!(d = O(0.6, 0.4))) return;
        this.noise(t, 0.4, d, 0.25, 'bandpass', 200, 3000, 2);
        [0, 3, 7].forEach((n) => this.osc('sawtooth', NOTE(57 + n), null, t, 0.6, d, 0.06, 0.05));
        break;
      case 'pulse':
        if (!(d = O(0.45, 0.25))) return;
        this.osc('square', 660 * p, 990 * p, t, 0.08, d, 0.12);
        break;
      case 'flipYou': case 'flipThem': {
        if (!(d = O(0.45, 0.35))) return;
        const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26];
        const n = (name === 'flipYou' ? 72 : 60) + scale[(11 - (opts.row || 0)) % 12];
        this.osc('triangle', NOTE(n), null, t, 0.25, d, 0.2);
        break;
      }
      case 'contest':
        if (!(d = O(0.35, 0.1))) return;
        this.osc('sawtooth', 110, 105, t, 0.18, d, 0.08);
        break;
      case 'tick':
        if (!(d = O(0.4, 0))) return;
        this.osc('square', 1800, null, t, 0.03, d, 0.08);
        break;
      case 'hackWin':
        if (!(d = O(0.7, 0.5))) return;
        [0, 4, 7, 12, 16, 19].forEach((n, i) => this.osc('triangle', NOTE(69 + n), null, t + i * 0.06, 0.4, d, 0.18));
        break;
      case 'hackLose':
        if (!(d = O(0.7, 0.5))) return;
        [12, 8, 5, 0].forEach((n, i) => this.osc('sawtooth', NOTE(52 + n), null, t + i * 0.1, 0.35, d, 0.12));
        break;
      case 'deadlock':
        if (!(d = O(0.5, 0.4))) return;
        this.osc('square', 330, null, t, 0.2, d, 0.1);
        this.osc('square', 330, null, t + 0.25, 0.2, d, 0.1);
        break;
      case 'uiMove':
        if (!(d = O(0.25, 0))) return;
        this.osc('sine', 900, null, t, 0.03, d, 0.1);
        break;
      case 'uiSelect':
        if (!(d = O(0.35, 0.1))) return;
        this.osc('triangle', 660, 990, t, 0.08, d, 0.15);
        break;
      case 'uiBack':
        if (!(d = O(0.3, 0.1))) return;
        this.osc('triangle', 660, 440, t, 0.08, d, 0.12);
        break;
      case 'descend':
        if (!(d = O(0.8, 0.6))) return;
        this.osc('sawtooth', 300, 40, t, 2.2, d, 0.2, 0.3);
        this.noise(t, 2.2, d, 0.2, 'lowpass', 1200, 80, 1, 0.4);
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------ music
  startMusic(i) {
    this.pendingScore = i;
    if (!this.ctx) return;
    this.stopMusic();
    this.score = SCORES[i] || SCORES[0];
    this.scoreIndex = i;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.0001;
    this.musicBus.gain.exponentialRampToValueAtTime(1, this.ctx.currentTime + 2);
    this.musicBus.connect(this.music);
    const w = this.ctx.createGain(); w.gain.value = 0.5;
    this.musicBus.connect(w).connect(this.reverbIn);
    this.timer = setInterval(() => this.schedule(), 50);
  }

  stopMusic(fade = 0.6) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.musicBus && this.ctx) {
      const b = this.musicBus;
      b.gain.cancelScheduledValues(this.ctx.currentTime);
      b.gain.setTargetAtTime(0.0001, this.ctx.currentTime, fade / 4);
      setTimeout(() => b.disconnect(), fade * 1000 + 200);
    }
    this.musicBus = null;
  }

  setIntensity(k) { this.targetIntensity = Math.max(0, Math.min(1, k)); }
  setHack(on) { this.hackMode = on; }

  schedule() {
    if (!this.ctx || !this.musicBus) return;
    this.intensity += (this.targetIntensity - this.intensity) * 0.05;
    const sc = this.score;
    const stepDur = 60 / sc.bpm / 4 / (this.hackMode ? 0.75 : 1);
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      this.note(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  note(step, t, sd) {
    const sc = this.score;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const [off, kind] = sc.prog[Math.floor(bar / 2) % sc.prog.length];
    const root = sc.root + off;
    const third = kind === 'm' ? 3 : 4;
    const chord = [0, third, 7, 12];
    const bus = this.musicBus;
    const I = this.intensity;
    const hack = this.hackMode;

    // pad: on the bar, every two bars
    if (s === 0 && bar % 2 === 0) {
      for (const n of [0, third, 7]) {
        for (const det of [-6, 6]) {
          const o = this.ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = NOTE(root + 12 + n);
          o.detune.value = det;
          const f = this.ctx.createBiquadFilter();
          f.type = 'lowpass'; f.frequency.value = 500 + I * 700; f.Q.value = 0.5;
          const g = this.ctx.createGain();
          const len = sd * 32;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.022, t + len * 0.3);
          g.gain.exponentialRampToValueAtTime(0.0001, t + len);
          o.connect(f).connect(g).connect(bus);
          o.start(t); o.stop(t + len + 0.1);
        }
      }
    }
    // bass
    const bassPat = hack ? [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0] : [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    if (bassPat[s]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = NOTE(root - 12 + (s === 14 ? 7 : 0));
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.setValueAtTime(200 + I * 500 + (hack ? 400 : 0), t); f.Q.value = 6;
      f.frequency.exponentialRampToValueAtTime(90, t + sd * 2);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.13, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + sd * 2.5);
      o.connect(f).connect(g).connect(bus);
      o.start(t); o.stop(t + sd * 3);
    }
    // arpeggio, when things get going
    if ((I > 0.25 || hack) && s % (hack ? 1 : 2) === 0) {
      const seq = [0, 1, 2, 3, 2, 1, 3, 2];
      const n = chord[seq[(s / (hack ? 1 : 2)) % seq.length | 0]];
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = NOTE(root + 24 + n);
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 1400 + I * 1800;
      const g = this.ctx.createGain();
      const vol = hack ? 0.035 : 0.025 * Math.min(1, (I - 0.25) * 2);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + sd * 0.9);
      o.connect(f).connect(g).connect(bus);
      o.start(t); o.stop(t + sd);
    }
    // drums in a fight
    if (I > 0.5 || hack) {
      if (s % 4 === 0) {
        const o = this.ctx.createOscillator();
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.25, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.connect(g).connect(bus);
        o.start(t); o.stop(t + 0.2);
      }
      if (s % 2 === 1) this.noise(t, 0.04, bus, 0.04, 'highpass', 7000);
    }
  }
}
