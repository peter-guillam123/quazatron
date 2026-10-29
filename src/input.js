// Keyboard and gamepad, mapped to game actions and polled once per frame.
// Movement is screen-relative: "up" means up the screen, whatever the grid.

const KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  grapple: ['Space', 'Enter', 'NumpadEnter'],
  arm: ['KeyJ', 'KeyZ'],
  drive: ['KeyK', 'KeyX', 'ShiftLeft', 'ShiftRight'],
  core: ['KeyL', 'KeyC'],
  loadout: ['Tab', 'KeyI'],
  pause: ['Escape', 'KeyP'],
  zoomIn: ['Equal', 'NumpadAdd'],
  zoomOut: ['Minus', 'NumpadSubtract'],
  confirm: ['Enter', 'Space', 'NumpadEnter'],
  back: ['Escape', 'Backspace'],
};

// Standard gamepad layout
const PAD = {
  grapple: [0], confirm: [0], back: [1],
  arm: [2, 7], drive: [1, 6], core: [3, 5],
  loadout: [8, 4], pause: [9],
  up: [12], down: [13], left: [14], right: [15],
};

const GAME_KEYS = new Set(Object.values(KEYS).flat());

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.padButtons = [];
    this.padPrev = [];
    this.padAxes = [0, 0];
    this.padStickPrev = { x: 0, y: 0 };
    this.padConnected = false;
    this.capture = false;     // when true, game keys don't reach the page
    this.lastDevice = 'keyboard';
    this.listeners = new Set();

    window.addEventListener('keydown', (e) => {
      if (e.repeat && this.keys.has(e.code)) {
        if (this.capture && GAME_KEYS.has(e.code)) e.preventDefault();
        return;
      }
      this.keys.add(e.code);
      this.pressedKeys.add(e.code);
      this.lastDevice = 'keyboard';
      if (this.capture && GAME_KEYS.has(e.code) && !e.metaKey && !e.ctrlKey) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); for (const fn of this.listeners) fn('blur'); });
    window.addEventListener('gamepadconnected', () => { this.padConnected = true; for (const fn of this.listeners) fn('pad'); });
    window.addEventListener('gamepaddisconnected', () => { this.padConnected = !!this.pad(); });
  }

  on(fn) { this.listeners.add(fn); }

  pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  // Call at the start of each frame.
  poll() {
    const p = this.pad();
    this.padPrev = this.padButtons;
    if (p) {
      this.padConnected = true;
      this.padButtons = p.buttons.map((b) => b.pressed || b.value > 0.5);
      let x = p.axes[0] || 0, y = p.axes[1] || 0;
      const m = Math.hypot(x, y);
      if (m < 0.22) { x = 0; y = 0; } else { const k = (m - 0.22) / (1 - 0.22) / m; x *= k; y *= k; }
      this.padAxes = [x, y];
      if (this.padButtons.some((b, i) => b && !this.padPrev[i]) || m > 0.5) this.lastDevice = 'pad';
    } else {
      this.padButtons = [];
      this.padAxes = [0, 0];
    }
    // Stick flicks count as d-pad presses in menus and the hack board.
    this.stickHit = { up: false, down: false, left: false, right: false };
    const [ax, ay] = this.padAxes;
    const prev = this.padStickPrev;
    if (ay < -0.6 && prev.y >= -0.6) this.stickHit.up = true;
    if (ay > 0.6 && prev.y <= 0.6) this.stickHit.down = true;
    if (ax < -0.6 && prev.x >= -0.6) this.stickHit.left = true;
    if (ax > 0.6 && prev.x <= 0.6) this.stickHit.right = true;
    this.padStickPrev = { x: ax, y: ay };
  }

  // Call at the end of each frame.
  endFrame() { this.pressedKeys.clear(); }

  held(action) {
    for (const k of KEYS[action] || []) if (this.keys.has(k)) return true;
    for (const b of PAD[action] || []) if (this.padButtons[b]) return true;
    return false;
  }

  hit(action) {
    for (const k of KEYS[action] || []) if (this.pressedKeys.has(k)) return true;
    for (const b of PAD[action] || []) if (this.padButtons[b] && !this.padPrev[b]) return true;
    if (this.stickHit && this.stickHit[action]) return true;
    return false;
  }

  // Gamepad only, for driving menus (the keyboard drives them natively).
  padHit(action) {
    for (const b of PAD[action] || []) if (this.padButtons[b] && !this.padPrev[b]) return true;
    if (this.stickHit && this.stickHit[action]) return true;
    return false;
  }

  // Screen-space movement: x right, y up, length up to 1.
  move() {
    let x = 0, y = 0;
    if (this.held('left')) x -= 1;
    if (this.held('right')) x += 1;
    if (this.held('up')) y += 1;
    if (this.held('down')) y -= 1;
    const m = Math.hypot(x, y);
    if (m > 0) { x /= m; y /= m; }
    const [ax, ay] = this.padAxes;
    if (Math.hypot(ax, ay) > Math.hypot(x, y)) { x = ax; y = -ay; }
    return { x, y };
  }

  clear() { this.keys.clear(); this.pressedKeys.clear(); }

  // A short buzz on a controller that supports it.
  rumble(strength = 0.5, ms = 120) {
    if (this.lastDevice !== 'pad' || this.noRumble) return;
    const p = this.pad();
    const act = p && p.vibrationActuator;
    if (!act || !act.playEffect) return;
    try {
      act.playEffect('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strength), weakMagnitude: Math.min(1, strength * 0.6) }).catch(() => {});
    } catch { /* not supported here */ }
  }

  label(action) {
    const pad = this.lastDevice === 'pad';
    const names = pad
      ? { grapple: 'A', arm: 'X', drive: 'B', core: 'Y', loadout: 'Back', pause: 'Start', confirm: 'A', back: 'B' }
      : { grapple: 'Space', arm: 'J', drive: 'K', core: 'L', loadout: 'Tab', pause: 'Esc', confirm: 'Enter', back: 'Esc' };
    return names[action] || action;
  }
}
