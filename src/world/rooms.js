// Hand-made rooms. Each deck is stitched together from these, rotated as
// needed, so layouts change every run but every room was designed.
//
//   ' ' void      .  floor (height 0)    1-9 raised floor
//   #   wall      ^ > v <  ramp rising north / east / south / west
//   ~   live floor          o  pit (a crate fills it)
//   =   bridge that extends when its switch is on
//   D   door      F  force field (switch turns it off)   f  permanent force field
//   c   crate     C  heavy crate     p  plate     P  heavy plate
//   t   laser target         x  conduit (needs an arc)
//   T   terminal (hack it)   A  archive terminal (pick firmware)
//   +   repair pad           g  turret           L  lift
//   S   start                d  droid            k  command droid
//   m   module cache         $  firmware chip
//   R   relay (the Mainframe's shield)      M  the Mainframe
//
// Exits are the middle three tiles of each edge, when they are floor at
// height 0, unless the room lists its own `exits`. Switches and the things they move share channel 1 unless a
// room gives a `ch` grid.

export const ROOMS = [
  // ------------------------------------------------------------------ start
  {
    id: 'start-bay', tags: ['start'], map: [
      '   .......   ',
      '  .........  ',
      ' ........... ',
      '...#.....#...',
      '.............',
      '.............',
      '......S......',
      '.............',
      '.............',
      '...#.....#...',
      ' ........... ',
      '  .........  ',
      '   .......   ',
    ],
  },
  {
    id: 'start-dais', tags: ['start'], map: [
      '   .....   ',
      '  .......  ',
      ' ......... ',
      '....#v#....',
      '...#111#...',
      '...>1S1<...',
      '...#111#...',
      '....#^#....',
      ' ......... ',
      '  .......  ',
      '   .....   ',
    ],
  },

  // ------------------------------------------------------------------ lift
  {
    id: 'lift-hall', tags: ['lift'], map: [
      '  .1111111.  ',
      ' .>111L111<. ',
      '...1111111...',
      '...##1^1##...',
      '.............',
      '..d...k...d..',
      '.............',
      '...#.....#...',
      '.............',
      ' ..d.....d.. ',
      '  .........  ',
    ],
  },
  {
    id: 'lift-island', tags: ['lift'], exits: [2], map: [
      '   .......   ',
      '   ...L...   ',
      '   ..k....   ',
      '   .......   ',
      '      .      ',
      '      .      ',
      '      .      ',
      '  .........  ',
      ' ..d.....d.. ',
      ' ........... ',
      ' ...#...#... ',
      ' ........... ',
      '   .......   ',
    ],
  },
  {
    id: 'lift-gate', tags: ['lift'], minDeck: 2, map: [
      '   #######   ',
      '   #..L..#   ',
      '   #.....#   ',
      '   ##...##   ',
      '.....k.......',
      '.............',
      '..d.......d..',
      '.............',
      '...#.....#...',
      '.............',
      ' ..d.....d.. ',
      '  .........  ',
      '   .......   ',
    ],
  },

  // ------------------------------------------------------------------ combat
  {
    id: 'plaza', tags: ['combat'], map: [
      '   .......   ',
      '  .........  ',
      ' ..d.....d.. ',
      '......v......',
      '....11111....',
      '....11111....',
      '...>11d11<...',
      '....11111....',
      '....11111....',
      '......^......',
      ' ..d.....d.. ',
      '  .........  ',
      '   .......   ',
    ],
  },
  {
    id: 'pillars', tags: ['combat'], map: [
      '   .......   ',
      '  .........  ',
      ' ..#..d..#.. ',
      '.............',
      '..#..#.#..#..',
      '....d...d....',
      '......#......',
      '....d...d....',
      '..#..#.#..#..',
      '.............',
      ' ..#..d..#.. ',
      '  .........  ',
      '   .......   ',
    ],
  },
  {
    id: 'ring', tags: ['combat'], map: [
      '   .......   ',
      '  .........  ',
      ' ...d...d... ',
      '....     ....',
      '...  ...  ...',
      '...  .d.  ...',
      '...  ...  ...',
      '...   .   ...',
      '...   .   ...',
      '....  .  ....',
      ' ...d...d... ',
      '  .........  ',
      '   .......   ',
    ],
  },
  {
    id: 'terraces', tags: ['combat'], map: [
      '   .......   ',
      ' ........... ',
      ' .222222222. ',
      '..2d22222d2..',
      '..222222222..',
      '..1^11111^1..',
      '..111d1d111..',
      '..111111111..',
      '..^.......^..',
      '.............',
      ' ..d.....d.. ',
      '  .........  ',
      '   .......   ',
    ],
  },
  {
    id: 'gauntlet', tags: ['combat'], minDeck: 2, map: [
      '   .......   ',
      '  .g.....g.  ',
      ' ........... ',
      '...##...##...',
      '.............',
      '..d.......d..',
      '....#...#....',
      '.............',
      '...##...##...',
      '.............',
      ' ..d.....d.. ',
      '  .g.....g.  ',
      '   .......   ',
    ],
  },
  {
    id: 'crossroads', tags: ['combat'], map: [
      '    .....    ',
      '    ..d..    ',
      '    .....    ',
      '    .....    ',
      '.............',
      '.d...#.#...d.',
      '......d......',
      '.d...#.#...d.',
      '.............',
      '    .....    ',
      '    .....    ',
      '    ..d..    ',
      '    .....    ',
    ],
  },
  {
    id: 'live-grid', tags: ['combat'], minDeck: 3, map: [
      '   .......   ',
      '  ..~...~..  ',
      ' ...~...~... ',
      '..~~~.~.~~~..',
      '....~...~....',
      '..d.......d..',
      '.~~~..d..~~~.',
      '..d.......d..',
      '....~...~....',
      '..~~~.~.~~~..',
      ' ...~...~... ',
      '  ..~...~..  ',
      '   .......   ',
    ],
  },
  {
    id: 'strongroom', tags: ['combat'], map: [
      '   .......   ',
      '  .........  ',
      ' ..d.....d.. ',
      '.............',
      '...#######...',
      '...#..$..#...',
      '...#+....#...',
      '...###D###...',
      '.............',
      '..T.......d..',
      ' ........... ',
      '  .........  ',
      '   .......   ',
    ],
  },
  {
    id: 'cargo', tags: ['combat'], minDeck: 2, map: [
      '   .......   ',
      '  ..c...c..  ',
      ' ..d.....d.. ',
      '...cc...cc...',
      '.............',
      '..c...C...c..',
      '......d......',
      '..c.......c..',
      '.............',
      '...cc...cc...',
      ' ..d.....d.. ',
      '  ..c...c..  ',
      '   .......   ',
    ],
  },
  {
    id: 'checkpoint', tags: ['combat'], minDeck: 3, map: [
      '  #########  ',
      '  #...$...#  ',
      '  #.......#  ',
      '  ##FFFFF##  ',
      '.............',
      '..d.......d..',
      '......g......',
      '..d.......d..',
      '.............',
      '..##.....##..',
      '..T.......d..',
      ' ........... ',
      '   .......   ',
    ],
  },

  // ------------------------------------------------------------------ vaults
  // All vaults are entered from the south; the generator rotates them.
  {
    id: 'vault-pits', tags: ['vault'], exits: [2], solves: [], hint: 'Fill the pits with crates.', map: [
      '  .....  ',
      '  ..$..  ',
      '  .....  ',
      '    o    ',
      '    o    ',
      '  .....  ',
      '  .c.c.  ',
      '  .....  ',
      '   ...   ',
    ],
  },
  {
    id: 'vault-gap', tags: ['vault'], exits: [2], solves: ['thrusters', 'hover'], hint: 'A gap too wide to roll over.', map: [
      '  .....  ',
      '  ..m..  ',
      '  .....  ',
      '         ',
      '         ',
      '  .....  ',
      '  .....  ',
      '   ...   ',
      '   ...   ',
    ],
  },
  {
    id: 'vault-reach', tags: ['vault'], exits: [2], minDeck: 2, solves: ['tractor', 'hover'], hint: 'Out of reach. Something could pull it in.', map: [
      '  .....  ',
      '  ..m..  ',
      '         ',
      '         ',
      '         ',
      '         ',
      '  .....  ',
      '  .....  ',
      '   ...   ',
    ],
  },
  {
    id: 'vault-heavy', tags: ['vault'], exits: [2], solves: ['treads'], hint: 'The crate is too heavy for wheels.', map: [
      '  #####  ',
      '  #.m.#  ',
      '  ##D##  ',
      ' ....... ',
      ' ..C.... ',
      ' ....... ',
      ' ....P.. ',
      ' ....... ',
      '   ...   ',
    ],
  },
  {
    id: 'vault-target', tags: ['vault'], exits: [2], solves: ['laser', 'hover'], hint: 'A target on the far side.', map: [
      '  ..t..  ',
      '  ..m..  ',
      '  .....  ',
      '   ===   ',
      '   ===   ',
      '   ===   ',
      '  .....  ',
      '  .....  ',
      '   ...   ',
    ],
  },
  {
    id: 'vault-conduit', tags: ['vault'], exits: [2], minDeck: 2, solves: ['arc'], hint: 'Dead conduits. They want a charge.', map: [
      '  #####  ',
      '  #.$.#  ',
      '  ##D##  ',
      ' x.....x ',
      ' ....... ',
      ' ....... ',
      ' ....... ',
      '  .....  ',
      '   ...   ',
    ],
  },
  {
    id: 'vault-field', tags: ['vault'], exits: [2], minDeck: 3, solves: ['phase'], hint: 'A field with no switch.', map: [
      '  .....  ',
      '  ..m..  ',
      '  .....  ',
      '  #fff#  ',
      '  .....  ',
      '  .....  ',
      '   ...   ',
    ],
  },
  {
    id: 'vault-live', tags: ['vault'], exits: [2], minDeck: 2, solves: ['hover'], hint: 'A long live floor. Painful on wheels.', map: [
      '  .....  ',
      '  ..m..  ',
      '  .....  ',
      '   ~~~   ',
      '   ~~~   ',
      '   ~~~   ',
      '   ~~~   ',
      '   ~~~   ',
      '   ~~~   ',
      '  .....  ',
      '   ...   ',
    ],
  },
  {
    id: 'vault-turrets', tags: ['vault'], exits: [2], minDeck: 2, solves: ['cloak', 'shield'], hint: 'Turrets. Go unseen, or go shielded.', map: [
      '  .....  ',
      '  ..$..  ',
      '  .....  ',
      ' g.....g ',
      '  .....  ',
      ' g.....g ',
      '  .....  ',
      '  .....  ',
      '   ...   ',
    ],
  },

  // ------------------------------------------------------------------ extras
  {
    id: 'archive', tags: ['archive'], map: [
      '  .......  ',
      ' ..#.A.#.. ',
      ' ..#...#.. ',
      '...........',
      '..d.....d..',
      '...........',
      '....#.#....',
      '...........',
      ' ..d...d.. ',
      '  .......  ',
      '   .....   ',
    ],
  },
  {
    id: 'repair', tags: ['repair'], map: [
      '  .....  ',
      ' ....... ',
      '..#...#..',
      '....+....',
      '.........',
      '....+....',
      '..#...#..',
      ' ....... ',
      '  .....  ',
    ],
  },

  // ------------------------------------------------------------------ the end
  {
    id: 'mainframe', tags: ['boss'], exits: [2], map: [
      '      .........      ',
      '    .............    ',
      '   ...R.......R...   ',
      '  .................  ',
      ' ....##.......##.... ',
      ' ...#...........#... ',
      '.......11111.........',
      '.......11111.........',
      '..d....11M11....d....',
      '.......11111.........',
      '.......11^11.........',
      '.....................',
      ' ...#...........#... ',
      ' ....##.......##.... ',
      '  .................  ',
      '   ...R.......R...   ',
      '    .............    ',
      '      .........      ',
      '        .....        ',
    ],
  },
];

const RAMP_ROT = { '^': '>', '>': 'v', 'v': '<', '<': '^' };

// Rotate a room a quarter turn clockwise, k times.
export function rotateRoom(room, k) {
  let map = room.map.slice();
  let ch = room.ch ? room.ch.slice() : null;
  for (let r = 0; r < (k & 3); r++) {
    const h = map.length, w = map[0].length;
    const out = [];
    const outCh = ch ? [] : null;
    for (let x = 0; x < w; x++) {
      let row = '', rowCh = '';
      for (let z = h - 1; z >= 0; z--) {
        const c = map[z][x];
        row += RAMP_ROT[c] || c;
        if (ch) rowCh += ch[z][x];
      }
      out.push(row);
      if (outCh) outCh.push(rowCh);
    }
    map = out; ch = outCh;
  }
  return { ...room, map, ch, rot: k & 3 };
}

// Which sides (N E S W) can take a bridge.
export function roomExits(room) {
  if (room.exits) return room.exits.map((e) => (e + (room.rot || 0)) % 4).sort();
  const m = room.map;
  const h = m.length, w = m[0].length;
  const cx = (w - 1) / 2, cz = (h - 1) / 2;
  const ok = (c) => c === '.' || c === '0';
  const exits = [];
  const N = [m[0][cx - 1], m[0][cx], m[0][cx + 1]];
  const S = [m[h - 1][cx - 1], m[h - 1][cx], m[h - 1][cx + 1]];
  const W = [m[cz - 1][0], m[cz][0], m[cz + 1][0]];
  const E = [m[cz - 1][w - 1], m[cz][w - 1], m[cz + 1][w - 1]];
  if (N.every(ok)) exits.push(0);
  if (E.every(ok)) exits.push(1);
  if (S.every(ok)) exits.push(2);
  if (W.every(ok)) exits.push(3);
  return exits;
}

export function validateRooms() {
  const problems = [];
  for (const r of ROOMS) {
    const w = r.map[0].length;
    r.map.forEach((row, i) => { if (row.length !== w) problems.push(`${r.id} row ${i} is ${row.length}, expected ${w}`); });
    if (w % 2 === 0 || r.map.length % 2 === 0) problems.push(`${r.id} has even size ${w}x${r.map.length}`);
    if (w > 15 && !r.tags.includes('boss')) problems.push(`${r.id} too wide`);
  }
  return problems;
}
