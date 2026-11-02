// The induction: a hand-built first deck for a first run. Each room brings
// in one thing, with a sign on the floor saying what to do. The path runs
// north and west, so it climbs up the screen as you go.
//
// Room maps use the same characters as rooms.js and are never rotated.
// `droids` fill the room's d and k spots in order; `dozy` droids wander
// and ignore you until something hits them. Sign positions are in the
// room's own tiles; {move}, {grapple} and {arm} become the right keys. A
// sign's `open` words replace its own once the room's lesson droid is open.
// A droid's `lesson` keeps it from being dealt with the wrong way: 'hack'
// can't be wrecked or put over an edge, 'ringout' can't be wrecked. `give`
// is the one part its hack offers.
// Gates hold each lesson room shut until it's done, and its droids are
// leashed to it, so one lesson never spills into the next.

export const INDUCTION_ROOMS = {
  start: {
    id: 'ind-start', exits: [0], map: [
      '   .......   ',
      '  .........  ',
      ' ........... ',
      '.............',
      '.............',
      '.............',
      '......S......',
      '.............',
      '  .........  ',
      '   .......   ',
      '    .....    ',
    ],
    signs: [{ x: 6, z: 3, text: '{move} to move', sub: 'Head up the screen' }],
  },
  grapple: {
    id: 'ind-grapple', exits: [2, 3], map: [
      '   .......   ',
      '  .........  ',
      ' ..#.....#.. ',
      '.............',
      '.............',
      '.....d.......',
      '.............',
      '.............',
      ' ..#........ ',
      '  .........  ',
      '   .......   ',
    ],
    droids: [{ family: 'mite', cls: 112, dozy: true, lesson: 'hack' }],
    signs: [{ x: 7, z: 8, text: 'Ram it with {arm}', sub: 'till its seal breaks', open: { text: '{grapple} to hack it', sub: 'Its seal is broken' } }],
  },
  spark: {
    id: 'ind-spark', exits: [0, 1, 3], map: [
      '   .......   ',
      '  .........  ',
      ' ........... ',
      '....#........',
      '.............',
      '.....d.......',
      '.............',
      '....#........',
      ' ........... ',
      '  .........  ',
      '   .......   ',
    ],
    droids: [{ family: 'spark', cls: 126, dozy: true, lesson: 'hack', give: 'laser' }],
    signs: [
      { x: 9, z: 6, text: 'Ram it open, then hack it', sub: 'It opens below the white line on its bar', open: { text: '{grapple} to hack it', sub: 'Then take its laser' } },
      { x: 4, z: 9, text: '{drive} to swerve', sub: 'Its shots pass through you' },
      { x: 6, z: 1, text: 'Take its laser', sub: 'for the target to the north' },
    ],
  },
  target: {
    id: 'ind-target', role: 'vault', exits: [2], hint: 'A target over the gap. A laser could reach it.', solves: ['laser'], map: [
      '  .....  ',
      '  ..$..  ',
      '  ..t..  ',
      '   ===   ',
      '   ===   ',
      '   ===   ',
      '  .....  ',
      '  .....  ',
      '   ...   ',
    ],
    signs: [{ x: 4, z: 7, text: 'Fire the laser with {arm}', sub: 'Hit the target to raise the bridge' }],
  },
  ledge: {
    id: 'ind-ledge', exits: [0, 1], map: [
      '     ...     ',
      '     ...     ',
      '    .....    ',
      '   .d....    ',
      '   ..........',
      '   ..........',
      '   ..........',
      '   .d....    ',
      '    .....    ',
      '     .d.     ',
      '             ',
    ],
    droids: [{ family: 'mite', cls: 104, dozy: true, lesson: 'ringout' }, { family: 'mite', cls: 118, dozy: true, lesson: 'ringout' }, { family: 'mite', cls: 109, dozy: true, lesson: 'ringout' }],
    signs: [{ x: 9, z: 5, text: 'Hold {arm}, then let go', sub: 'Open droids go over the edge: double scrap' }],
  },
  terminal: {
    id: 'ind-terminal', exits: [0, 2], map: [
      '  ####D####  ',
      '  #.......#  ',
      '  #...T...#  ',
      '  #.......#  ',
      '  .........  ',
      ' ........... ',
      '.............',
      ' ........... ',
      '  .........  ',
      '   .......   ',
      '    .....    ',
    ],
    signs: [{ x: 6, z: 7, text: 'Hack the terminal', sub: 'to open the door' }],
  },
  lift: {
    id: 'ind-lift', role: 'lift', exits: [2], map: [
      '   .......   ',
      '  ...L.....  ',
      ' ..........  ',
      '.........B...',
      '.............',
      '......k......',
      '.............',
      ' ...d....... ',
      '  .........  ',
      '   .......   ',
      '    .....    ',
    ],
    droids: [{ family: 'spark', cls: 148 }, { family: 'mite', cls: 121, dozy: true }],
    signs: [
      { x: 5, z: 8, text: 'Beat the ◆ boss', sub: 'by hack or by force, to open the lift' },
      { x: 11, z: 5, text: 'Fabricator', sub: 'Spend scrap here' },
    ],
  },
};

// Where each room sits, on a grid of cells, and what joins to what.
export function inductionPlan() {
  const R = INDUCTION_ROOMS;
  const cells = [
    { x: 0, z: 0, role: 'start', room: R.start },
    { x: 0, z: -1, role: 'combat', room: R.grapple },
    { x: -1, z: -1, role: 'combat', room: R.spark },
    { x: -1, z: -2, role: 'vault', room: R.target },
    { x: -2, z: -1, role: 'combat', room: R.ledge },
    { x: -2, z: -2, role: 'combat', room: R.terminal },
    { x: -2, z: -3, role: 'lift', room: R.lift },
  ];
  const links = [[0, 1], [1, 2], [2, 3], [2, 4], [4, 5], [5, 6]];
  // Each lesson room is shut by a gate on the way on, which opens once its
  // droids are dealt with (the terminal room has its own door).
  const gates = [[1, 2], [2, 4], [4, 5]];
  for (const c of cells) {
    c.links = [];
    c.room = { tags: [c.role], solves: [], ...c.room, rot: 0 };
  }
  for (const [a, b] of links) { cells[a].links.push(cells[b]); cells[b].links.push(cells[a]); }
  return { cells, links, gates };
}
