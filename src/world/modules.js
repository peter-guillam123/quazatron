// The nine parts KLP-2 can steal, plus the defaults it starts with.
// Every droid uses these same parts, so an enemy with thrusters dashes at
// you exactly the way you will once you've taken them.

export const SLOTS = ['drive', 'arm', 'core'];
export const SLOT_NAMES = { drive: 'Drive', arm: 'Arm', core: 'Core' };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const MODULES = {
  // ---------------------------------------------------------------- drives
  wheels: {
    slot: 'drive', name: 'Wheels', starter: true,
    line: 'Four wheels and a good attitude.',
    use: 'No special move.',
    stats: () => ({ speed: 4.6, accel: 30, friction: 10, mass: 1 }),
  },
  thrusters: {
    slot: 'drive', name: 'Thrusters',
    line: 'Dash in a straight line, over gaps and into droids.',
    use: 'Press to dash. Clears gaps up to about three tiles. Dashing into a droid hits it hard.',
    stats: (g) => ({
      speed: 4.8, accel: 30, friction: 10, mass: 1,
      dashSpeed: 12.5, dashTime: 0.2 + 0.014 * g, cost: 18 - g, cooldown: 0.95 - 0.04 * g, ramMult: 2.4 + 0.15 * g,
    }),
  },
  hover: {
    slot: 'drive', name: 'Hover',
    line: 'Hold to float over live floors, pits and open void.',
    use: 'Hold to hover. Drains energy fast, so plan the crossing. Floating droids don’t press plates.',
    stats: (g) => ({ speed: 3.9, accel: 10, friction: 2.4, mass: 0.8, drain: 26 - 1.6 * g }),
  },
  treads: {
    slot: 'drive', name: 'Treads',
    line: 'Heavy and hard to shift. Pushes heavy crates.',
    use: 'Heavy: you can push heavy crates, weigh down heavy plates and shrug off knockback. Press to stamp a shockwave that stuns.',
    stats: (g) => ({
      speed: 3.4, accel: 22, friction: 14, mass: 3.2, heavy: true, knockResist: 0.75,
      radius: 2 + 0.1 * g, stun: 0.8 + 0.08 * g, damage: 6 + g, cost: 30, cooldown: 2.6,
    }),
  },

  // ---------------------------------------------------------------- arms
  ram: {
    slot: 'arm', name: 'Bumper', starter: true,
    line: 'A short lunge. KLP-2’s only weapon until it steals a better one.',
    use: 'Press to lunge forwards and bump whatever is in front.',
    stats: () => ({ lungeSpeed: 9, lungeTime: 0.13, cost: 6, cooldown: 0.7, ramMult: 1.2 }),
  },
  laser: {
    slot: 'arm', name: 'Laser',
    line: 'Bolts that travel in a straight line. Hits switches across gaps.',
    use: 'Press or hold to fire. Bolts trip targets across gaps and bounce off raised shields.',
    stats: (g) => ({ speed: 13, damage: 6 + 1.6 * g, cost: 6, cooldown: 0.34 - 0.012 * g, range: 11 }),
  },
  arc: {
    slot: 'arm', name: 'Arc coil',
    line: 'Lightning that jumps between droids and wakes dead conduits.',
    use: 'Press to discharge at the nearest droid, turret or conduit. Stuns, and jumps on to others close by.',
    stats: (g) => ({ range: 2.9 + 0.15 * g, damage: 9 + 2.2 * g, stun: 1.0 + 0.1 * g, chains: 1 + Math.floor(g / 3), cost: 22, cooldown: 1.0 }),
  },
  tractor: {
    slot: 'arm', name: 'Tractor',
    line: 'Pulls droids, crates and loose parts towards you.',
    use: 'Hold to pull whatever is in front: droids off ledges, crates out of corners, parts across gaps.',
    stats: (g) => ({ range: 6 + 0.4 * g, pull: 9 + 1.2 * g, drain: 16, tug: 0.42 - 0.02 * g }),
  },

  // ---------------------------------------------------------------- cores
  shield: {
    slot: 'core', name: 'Shield',
    line: 'Blocks from the front and sends bolts back where they came from.',
    use: 'Hold to raise. Reflected bolts can hit droids and receivers. You move slowly behind it.',
    stats: (g) => ({ drain: 15 - 0.8 * g, arc: 1.25 + 0.03 * g, reflectMult: 1.2 + 0.08 * g }),
  },
  cloak: {
    slot: 'core', name: 'Cloak',
    line: 'Turrets and droids can’t see you. Grapple from cloak to ambush.',
    use: 'Press to turn on and off. Drains energy. Firing breaks it; grappling from cloak starts the hack with your opponent stunned.',
    stats: (g) => ({ drain: 11 - 0.6 * g, ambush: 1.8 + 0.15 * g }),
  },
  phase: {
    slot: 'core', name: 'Phase',
    line: 'Slip through force fields, droids and bolts for a moment.',
    use: 'Press to phase. Walls still stop you; force fields don’t.',
    stats: (g) => ({ time: 0.9 + 0.08 * g, cost: 24, cooldown: 1.5 }),
  },
};

export const STEALABLE = Object.keys(MODULES).filter((k) => !MODULES[k].starter);

export function moduleStats(mod) {
  if (!mod) return null;
  return MODULES[mod.id].stats(mod.grade || 1);
}

export function gradeFromClass(cls) {
  return clamp(Math.floor(cls / 100), 1, 9);
}

export function moduleLabel(mod) {
  if (!mod) return 'Empty';
  const def = MODULES[mod.id];
  return def.starter ? def.name : `${def.name} Mk ${roman(mod.grade)}`;
}

export function roman(n) {
  return ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][clamp(n | 0, 1, 9)];
}

// Small inline SVG icons for each part, drawn in currentColor.
export const ICONS = {
  wheels: '<circle cx="7" cy="16" r="3.5"/><circle cx="17" cy="16" r="3.5"/><path d="M4 11h16"/>',
  thrusters: '<path d="M5 12h9l5-4v8l-5-4"/><path d="M2 9l3 3-3 3"/>',
  hover: '<ellipse cx="12" cy="17" rx="8" ry="2.5"/><path d="M7 13c0-4 2-7 5-7s5 3 5 7z"/>',
  treads: '<rect x="3" y="12" width="18" height="7" rx="3.5"/><circle cx="7.5" cy="15.5" r="1.4"/><circle cx="12" cy="15.5" r="1.4"/><circle cx="16.5" cy="15.5" r="1.4"/><path d="M8 12V7h8v5"/>',
  ram: '<path d="M4 7v10M8 12h11M15 8l4 4-4 4"/>',
  laser: '<path d="M3 12h8"/><path d="M14 12h7" stroke-dasharray="2 2"/><circle cx="12" cy="12" r="1.5"/>',
  arc: '<path d="M13 2L6 13h5l-2 9 8-12h-5z"/>',
  tractor: '<path d="M4 6a8 8 0 0 1 0 12"/><path d="M8 8.5a5 5 0 0 1 0 7"/><rect x="15" y="9" width="6" height="6"/>',
  shield: '<path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/>',
  cloak: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><path d="M4 20L20 4"/>',
  phase: '<path d="M12 3l3 9-3 9-3-9z"/><path d="M5 12h3M16 12h3" stroke-dasharray="1.5 1.5"/>',
  empty: '<circle cx="12" cy="12" r="7" stroke-dasharray="2 3"/>',
};

export function iconSvg(id, size = 24) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id] || ICONS.empty}</svg>`;
}
