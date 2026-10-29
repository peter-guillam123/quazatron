// The hack, taught one part at a time. Each lesson is a small board built
// around one new part, against a slow opponent, with a single line to read.
// You move on to the next lesson by winning one. After the last, boards are
// drawn at full size for the droid's class.
//
//   rows      board size
//   parts     what may appear on the wires (plain wire always can)
//   focus     the new part: the board is built to carry plenty of it
//   side      whether you get to pick a side
//   enemy     at most this many pulsers for your opponent
//   skill     the opponent's skill, at most
//   delay     extra seconds before the opponent starts
//   timer     seconds on the clock

export const LESSONS = [
  {
    id: 'wires', rows: 4, parts: [], side: false, enemy: 1, skill: 0.1, delay: 2.2, timer: 8,
    title: 'The hack',
    line: 'Fire pulses down your wires to turn the cells in the middle cyan. Own more of them when the clock runs out.',
  },
  {
    id: 'fork', rows: 5, parts: ['fork'], focus: 'fork', side: false, enemy: 2, skill: 0.15, delay: 1.6, timer: 9,
    title: 'New: fork',
    line: 'A fork splits one wire in two, so a single pulse lights two cells.',
  },
  {
    id: 'side', rows: 6, parts: ['fork', 'break'], focus: 'break', side: true, enemy: 2, skill: 0.2, delay: 1.1, timer: 9,
    title: 'New: pick a side',
    line: 'The two sides are wired differently, and some wires are cut. Pick the side that reaches more cells.',
  },
  {
    id: 'inv', rows: 6, parts: ['fork', 'break', 'inv'], focus: 'inv', side: true, enemy: 2, skill: 0.25, delay: 0.8, timer: 9,
    title: 'New: invert',
    line: 'A ring on a wire swaps the colours. Your pulse lands in their colour, so leave those wires alone.',
  },
  {
    id: 'and', rows: 8, parts: ['fork', 'break', 'inv', 'and'], focus: 'and', side: true, enemy: 3, skill: 0.3, delay: 0.5, timer: 10,
    title: 'New: AND gate',
    line: 'Two wires join at a gate. It only passes while both are lit, so fire the pair close together.',
  },
  {
    id: 'lock', rows: 8, parts: ['fork', 'break', 'inv', 'and', 'lock'], focus: 'lock', side: true, enemy: 3, skill: 0.35, delay: 0.4, timer: 10,
    title: 'New: lock',
    line: 'Get a pulse through a padlock and it stays lit until the end. Worth a pulser early.',
  },
  {
    id: 'free', rows: 8, parts: ['fork', 'break', 'inv', 'and', 'lock', 'free'], focus: 'free', side: true, enemy: 4, skill: 0.45, delay: 0.3, timer: 10,
    title: 'New: free wire',
    line: 'A wire marked ∞ costs nothing to fire. Use it as often as you like.',
  },
];

export const HIDDEN_LESSON = {
  id: 'hidden', title: 'New: hidden part',
  line: 'A ? hides what is on the wire. A pulse through it shows you, for both of you.',
};
