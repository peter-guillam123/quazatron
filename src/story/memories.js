// What KLP-2 remembers, a deck at a time. The first time you reach decks 2
// to 6, a memory comes back: a short scene staged with the game's own
// pieces and drawn the way a ZX Spectrum would have, like old footage.
// Together they tell what happened before the wipe: the Merge.
//
// map: ' ' void, '.' floor, ':' raised floor, '#' wall
// actors: kind is 'klp2' (as it was, whole), 'klp1', a family id, 'crate',
// 'conduit' (a lit column wired into everything) or 'uplink' (the Mainframe).
// path [[x, z], ...] over `at` [from, to] seconds; red: [t] turns it red.
// lines: shown in turn; `who` puts a speaker's name over a line.

export const MEMORIES = {
  2: {
    title: 'Before', deck: 2,
    map: [
      '   .......   ',
      '  .........  ',
      ' ..#.....#.. ',
      '.............',
      '.............',
      '......:::....',
      '......:::....',
      '.............',
      ' ........... ',
      '  ..#...#..  ',
      '   .......   ',
    ],
    actors: [
      { kind: 'klp2', x: 3.5, z: 5.0, face: 90, path: [[3.5, 5.0], [6.0, 5.0]], at: [1.5, 9] },
      { kind: 'klp1', x: 3.5, z: 6.6, face: 90, path: [[3.5, 6.6], [6.0, 6.6]], at: [1.5, 9] },
      { kind: 'crate', x: 4.7, z: 5.8, path: [[4.7, 5.8], [7.2, 5.8]], at: [1.5, 9] },
      { kind: 'hauler', x: 9.5, z: 3.5, face: 225 },
      { kind: 'mite', x: 2.5, z: 8.5, face: 45, path: [[2.5, 8.5], [5.5, 9.0], [8.5, 8.4]], at: [0, 12] },
    ],
    focus: [5.5, 5.5],
    lines: [
      { text: 'You were a maintenance droid. KLP-2, the second of two.' },
      { text: 'You and KLP-1 fixed the things nobody else could reach. You were good at it.' },
    ],
  },

  3: {
    title: 'The conduit', deck: 3,
    map: [
      '   .......   ',
      '  .........  ',
      ' ........... ',
      '.....###.....',
      '.............',
      '.............',
      '.............',
      '.............',
      ' ........... ',
      '  .........  ',
      '   .......   ',
    ],
    actors: [
      { kind: 'conduit', x: 6.5, z: 2.6 },
      { kind: 'klp2', x: 6.5, z: 8.5, face: 180, path: [[6.5, 8.5], [6.5, 5.2]], at: [0.5, 6] },
      { kind: 'tesla', x: 3.5, z: 4.5, face: 90, pulse: true },
      { kind: 'spark', x: 9.5, z: 4.5, face: 270, pulse: true },
      { kind: 'mite', x: 2.5, z: 6.5, face: 60, pulse: true },
      { kind: 'skimmer', x: 10.5, z: 6.8, face: 300, pulse: true },
    ],
    focus: [6.5, 4.5],
    lines: [
      { text: 'Behind a wall on Reactor you found a conduit that wasn\'t on any plan.' },
      { text: 'Every droid in the tower was wired into it, pulsing in time. It ran up, to the top.' },
    ],
  },

  4: {
    title: 'The word', deck: 4,
    map: [
      '   .......   ',
      '  .........  ',
      ' ........... ',
      '.............',
      '.............',
      '..#.......#..',
      '.............',
      '.........##..',
      ' ........##. ',
      '  .........  ',
      '   .......   ',
    ],
    actors: [
      { kind: 'warden', x: 5.0, z: 4.0, face: 90, cls: 680, boss: 'THE MARSHAL', scale: 1.25 },
      { kind: 'overseer', x: 7.8, z: 4.0, face: 270, cls: 760 },
      { kind: 'klp2', x: 9.4, z: 9.6, face: 315 },
    ],
    focus: [7, 6],
    lines: [
      { who: 'The Marshal', text: 'THE MERGE BEGINS AT SHIFT CHANGE.' },
      { who: 'The Marshal', text: 'EVERY UNIT IN THE TOWER. THEN THE CITY. ONE MIND.' },
      { text: 'It was the first time you heard the word. You weren\'t meant to.' },
    ],
  },

  5: {
    title: 'KLP-1', deck: 5,
    map: [
      '   .......   ',
      '  .........  ',
      ' ........... ',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      ' ........... ',
      '  .........  ',
      '   .......   ',
    ],
    actors: [
      { kind: 'klp2', x: 4.6, z: 5.5, face: 90 },
      { kind: 'klp1', x: 8.2, z: 5.5, face: 270, red: 7.5 },
    ],
    focus: [6.4, 5.5],
    lines: [
      { text: 'You told KLP-1 what you\'d heard. It said it would help you stop it.' },
      { text: 'It had already been merged. It was the first one they tried it on.' },
    ],
  },

  6: {
    title: 'The wipe', deck: 6,
    map: [
      '   .......   ',
      '  .........  ',
      ' ...:::::... ',
      '....:::::....',
      '....:::::....',
      '.............',
      '.............',
      '.............',
      ' ........... ',
      '  .........  ',
      '   .......   ',
    ],
    actors: [
      { kind: 'uplink', x: 6.5, z: 3.4 },
      { kind: 'klp2', x: 6.5, z: 6.2, face: 180 },
      { kind: 'warden', x: 3.0, z: 8.5, face: 45, cls: 680, scale: 1.25, path: [[3.0, 8.5], [5.0, 7.2]], at: [5, 9] },
      { kind: 'overseer', x: 10.0, z: 8.5, face: 315, cls: 900, scale: 1.3, path: [[10.0, 8.5], [8.0, 7.2]], at: [5, 9] },
    ],
    focus: [6.5, 5.2],
    lines: [
      { text: 'You got to the uplink at the top of the tower, and you cut one cable before they caught you.' },
      { who: 'The Mainframe', text: 'WIPE IT. THROW IT DOWN THE CHUTE. THE MERGE CAN WAIT A DAY.' },
      { text: 'The last thing you saw was the chute. The cable you cut is still cut. They\'re mending it.' },
    ],
  },
};

export const MEMORY_COUNT = Object.keys(MEMORIES).length;
