// The induction: a hand-built first deck for a first run. Each room brings
// in one thing, with a sign on the floor saying what to do. The path runs
// north and west, so it climbs up the screen as you go.
//
// Room maps use the same characters as rooms.js and are never rotated.
// `droids` fill the room's d and k spots in order; `dozy` droids wander
// and ignore you until something hits them. Sign positions are in the
// room's own tiles; {move}, {grapple} and {arm} become the right keys.

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
    droids: [{ family: 'mite', cls: 112, dozy: true }],
    signs: [{ x: 7, z: 8, text: 'Get close to a droid', sub: 'and press {grapple} to grapple it' }],
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
    droids: [{ family: 'spark', cls: 126, dozy: true }],
    signs: [
      { x: 9, z: 6, text: 'Shove it, then hack it', sub: 'A dented droid hacks back weaker' },
      { x: 4, z: 9, text: '{drive} to swerve', sub: 'Its shots pass through you', wide: 4.2 },
      { x: 6, z: 1, text: 'Take its laser', sub: 'for the target to the north', wide: 3.8 },
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
    droids: [{ family: 'mite', cls: 104, dozy: true }, { family: 'mite', cls: 118, dozy: true }, { family: 'mite', cls: 109, dozy: true }],
    signs: [{ x: 9, z: 5, text: 'Hold {arm}, then let go', sub: 'Shove one off the edge: double scrap' }],
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
      { x: 5, z: 8, text: 'Take the ◆ command droid', sub: 'by hack or by force, to unlock the lift' },
      { x: 11, z: 5, text: 'Fabricator', sub: 'Spend scrap here', wide: 3.4 },
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
  for (const c of cells) {
    c.links = [];
    c.room = { tags: [c.role], solves: [], ...c.room, rot: 0 };
  }
  for (const [a, b] of links) { cells[a].links.push(cells[b]); cells[b].links.push(cells[a]); }
  return { cells, links };
}
