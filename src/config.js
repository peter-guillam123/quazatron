// Shared constants: world scale, physics tuning and the deck palettes.

export const LEVEL_H = 0.5;      // world units per height level
export const STEP_UP = 0.3;      // highest ledge a droid can roll up
export const GRAVITY = 24;
export const VOID_Y = -9;        // below this, you are lost to the void
export const CELL = 16;          // tiles per room cell when assembling a deck

export const PLAYER_COLOUR = 0x2ef2ff;   // KLP-2 is always cyan
export const PLAYER_HEX = '#2ef2ff';

// Each deck borrows one ink from the ZX Spectrum's bright palette as its
// hostile colour. Claiming the deck pulls its light towards cyan.
export const DECKS = [
  {
    n: 1, name: 'Intake', ink: 0xff3ad8, paper: 0x1a0d36, fog: 0x0d0722,
    blurb: 'Where scrap comes in to be sorted. The droids here are small and slow.',
    classes: [101, 289], rooms: [5, 6], music: 0,
  },
  {
    n: 2, name: 'Freight', ink: 0xffc21a, paper: 0x21170a, fog: 0x130c04,
    blurb: 'Loaders, couriers and crates. Watch the edges.',
    classes: [180, 420], rooms: [6, 7], music: 1,
  },
  {
    n: 3, name: 'Reactor', ink: 0x3dff72, paper: 0x07200f, fog: 0x031008,
    blurb: 'Live floors and charged conduits. Something here can float.',
    classes: [290, 560], rooms: [6, 8], music: 2,
  },
  {
    n: 4, name: 'Security', ink: 0xff3346, paper: 0x22070c, fog: 0x130306,
    blurb: 'Turrets, wardens and things you cannot see.',
    classes: [450, 760], rooms: [7, 8], music: 3,
  },
  {
    n: 5, name: 'Command', ink: 0x5a78ff, paper: 0x0a0f2e, fog: 0x05071a,
    blurb: 'The tower’s officers. They hack back hard.',
    classes: [640, 899], rooms: [7, 9], music: 4,
  },
  {
    n: 6, name: 'Mainframe', ink: 0xcfc4ff, paper: 0x0e0b1c, fog: 0x06050c,
    blurb: 'Class 999. The thing that runs the tower.',
    classes: [800, 999], rooms: [3, 3], music: 5,
  },
];

export const TUNING = {
  playerIntegrity: 100,
  playerEnergy: 100,
  energyRegen: 14,        // per second, after a short pause
  energyRegenDelay: 0.7,
  playerSpeed: 1.18,      // KLP-2's drive runs this much faster than a droid's
  ramSpeed: 2.6,          // relative speed that counts as a ram
  voidDamage: 15,
  hazardDps: 26,
};
