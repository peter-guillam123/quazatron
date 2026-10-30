// The Heap: where the tower's rejects live, at the top of the scrap chute.
// KLP-2 comes back here, in pieces, after every run. Nan rebuilds it and
// sells permanent upgrades for data; Static runs a pirate radio; the
// archive reader holds the droid archive; the chute leads down into the
// tower. A single hand-built room, never rotated.
//
//   N Nan   Q Static   J where KLP-1 stands, once it's home
//   Y archive reader   U the chute   S start

export const HEAP_DECK = {
  n: 0, name: 'The Heap', ink: 0xffa040, paper: 0x1c1208, fog: 0x0d0804,
  blurb: 'Where the tower\'s rejects live, at the top of the scrap chute.',
  classes: [0, 0], rooms: [1, 1], music: 0,
};

export const HEAP_ROOM = {
  id: 'heap', role: 'heap', exits: [], map: [
    '    .......    ',
    '   .........   ',
    ' ...N....c.... ',
    ' .#........... ',
    '............Q..',
    '...............',
    '.#.....S.......',
    '...............',
    '...........J..#',
    ' .Y........... ',
    ' .........U... ',
    '   c..#.....   ',
    '    .......    ',
  ],
  signs: [
    { x: 5, z: 4, text: 'Nan', sub: 'Rebuilds you. Upgrades for data', wide: 4.6 },
    { x: 3, z: 8, text: 'Droid archive', sub: 'Everything you\'ve met', wide: 3.6 },
    { x: 8, z: 9, text: 'The chute', sub: 'Down into the tower', wide: 3.6 },
  ],
};

// The cast who live here, and how they look.
export const HEAP_NPCS = {
  N: {
    id: 'nan', name: 'Nan', accent: 0xffa64a,
    mods: { drive: { id: 'treads', grade: 1 }, arm: { id: 'tractor', grade: 1 }, core: null },
    look: { shape: 'wide', shell: 0x8a5a3c, label: 'NAN' },
  },
  Q: {
    id: 'static', name: 'Static', accent: 0x7dffb0,
    mods: { drive: { id: 'wheels', grade: 1 }, arm: { id: 'arc', grade: 1 }, core: null },
    look: { shape: 'tall', shell: 0x4a4f5c, label: 'FM' },
  },
  J: {
    id: 'klp1', name: 'KLP-1', accent: 0xff6a5a, needs: 'klp1Turned',
    mods: { drive: { id: 'thrusters', grade: 1 }, arm: { id: 'laser', grade: 1 }, core: { id: 'shield', grade: 1 } },
    look: { shape: 'player', shell: 0x6b7380, label: 'K-1' },
  },
};

export function heapPlan() {
  const cell = { x: 0, z: 0, role: 'heap', links: [] };
  cell.room = { tags: ['heap'], solves: [], ...HEAP_ROOM, rot: 0 };
  return { cells: [cell], links: [] };
}
