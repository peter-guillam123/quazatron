// The droid archive, written up as a field guide. Each family's page fills
// in as you go: a dark outline until you've seen one; its looks, habits and
// a line it says once you have; its parts, numbers and how to take one
// after your first hack; and the full page, with Nan's second note, after
// three. The cast have pages too, unlocked as you meet them.
import { DECKS } from '../config.js';
import { FAMILIES, FAMILY_ORDER, integrityFor, pulsersFor, rowsFor, timerFor } from '../world/roster.js';
import { VOICES, LINES } from '../lines.js';
import { CAST, STORY, MAINFRAME_DECK } from './cast.js';

export const COMPLETE = 3;   // hacks that finish a page

// Written for each family: its manner, its habits, how to take one, and
// Nan's notes in the margin (the second once the page is complete).
export const GUIDE = {
  mite: {
    temper: 'A cleaner, and frightened of everything.',
    habits: 'Scurries about its patch of floor and bolts the moment it sees you. Corner it against a wall and it has nowhere left to go.',
    tip: 'It won\'t fight back, so this is the place to practise hacking: the board is small and slow. Wrecking one is a waste. It carries nothing.',
    nan: 'Harmless. I had one up here for a while. Swept the same bit of floor till it wore through.',
    nan2: 'Be nice to the Mites. They see everything, and nobody ever asks them.',
  },
  spark: {
    temper: 'A sentry who lives by the rulebook.',
    habits: 'Stands and looks about. Once it sees you it keeps its distance and fires down a straight line, which it paints on the floor first.',
    tip: 'When the line on the floor stops moving, step out of it, then close in. Up close it can\'t back away fast enough. Its laser is the first good part most KLPs get.',
    nan: 'They fire in straight lines. Don\'t stand in straight lines. That\'s the whole trick.',
    nan2: 'A Spark once gave me a written warning for welding. I welded it to the floor.',
  },
  courier: {
    temper: 'Always late, always in a hurry.',
    habits: 'Runs errands all over its deck. When it sees you it lines up and dashes straight at you, over gaps if it has to.',
    tip: 'Wait for the lane on the floor, then swerve. A Courier that misses keeps going, and if you\'ve put a wall behind you, it hits that instead.',
    nan: 'Never stand between a Courier and where it\'s going. Or between a Courier and the void, come to that.',
    nan2: 'Its thrusters will get you over gaps. Mind you land.',
  },
  hauler: {
    temper: 'Slow, heavy and quite friendly really.',
    habits: 'Plods between the crates. Too heavy to shove far, and if you get close its treads stamp a shockwave that stuns.',
    tip: 'Don\'t try to push it off anything. Stay out of stamping range and chip at it, or grapple it while it turns. Its treads shift heavy crates and hold down heavy plates.',
    nan: 'Haulers mean no harm. They just don\'t look where they\'re going, and they weigh a ton.',
    nan2: 'I rode one right across Freight once. Took most of a shift.',
  },
  tesla: {
    temper: 'Keeps the conduits charged, and itself.',
    habits: 'Paces until it sees you, then closes in. It crackles before it lets go, and the lightning jumps to anything near you.',
    tip: 'When the ring appears on the floor, get out of it. Better still, shove it while it winds up. Its arc coil wakes dead conduits too.',
    nan: 'Keep your distance from the crackly ones, or hit them first. There isn\'t a third way.',
    nan2: 'I used one as a kettle for a week. Best tea I ever made. Worst week.',
  },
  skimmer: {
    temper: 'Looks down on everyone, from a little way up.',
    habits: 'Floats over live floors and the void as if they weren\'t there, and fires at you from the far side.',
    tip: 'It floats, so you can\'t knock it off an edge. Get across to its side, or send its bolts back with a shield. Its hover takes you over anything, for as long as your energy lasts.',
    nan: 'Never trust anything that won\'t keep its feet on the floor.',
    nan2: 'Hover drinks energy. Plan the crossing before you start it, love.',
  },
  crane: {
    temper: 'Moves cargo. Thinks you are cargo.',
    habits: 'Stands where it can see, then holds a beam on you and pulls, usually towards an edge.',
    tip: 'Keep a wall or a crate between you and the drop, and step out of the beam\'s line to break it. With its tractor you can pull droids off ledges yourself.',
    nan: 'A Crane will pull you anywhere. Usually somewhere with no floor.',
    nan2: 'Turn the beam round on them. They hate that.',
  },
  warden: {
    temper: 'Takes its job very seriously. Its job is standing still.',
    habits: 'Stands its ground with its shield up, turning to face you. Bolts that hit the shield come straight back.',
    tip: 'Go round it. The shield covers the front, so come at it from the side or behind, or shove it while it turns. Steal the shield and bolts bounce off you instead.',
    nan: 'Wardens only look one way. That\'s their whole problem.',
    nan2: 'Get the shield, stand behind it, and let them shoot themselves.',
  },
  phantom: {
    temper: 'Whispers, mostly to itself.',
    habits: 'Drifts about cloaked and nearly invisible. You hear it before you see it. It shows itself up close, just before the arc.',
    tip: 'Watch for a shimmer in the air. Any hit knocks its cloak off. Its cloak lets you slip past droids rather than fight them.',
    nan: 'If the air shimmers, swerve. If it whispers, swerve faster.',
    nan2: 'I\'ve never seen one. That\'s rather the point, isn\'t it.',
  },
  wraith: {
    temper: 'A show-off.',
    habits: 'Dashes in, fires and dashes out again. It can phase, and while it does, nothing touches it.',
    tip: 'Don\'t chase it. Let it come to you and hit it as it lands. Its phase core takes you through force fields.',
    nan: 'All that dashing about. It\'ll wear itself out. It won\'t, actually, but it\'s nice to think so.',
    nan2: 'Phasing through a field feels like a cold bath. So I\'m told.',
  },
  lancer: {
    temper: 'Chest out. Always.',
    habits: 'Shield up, thrusters lit. It charges you behind its shield, then fires.',
    tip: 'Swerve the charge and hit it from the side as it goes past. Into a wall, a Lancer stuns like anything else.',
    nan: 'Anything with a shield: go round the side.',
    nan2: 'Lancers escort officers. If you see one, something important is close.',
  },
  sentinel: {
    temper: 'A wall with lightning in it.',
    habits: 'Guards its post behind a shield and lets the lightning reach for anything that comes close.',
    tip: 'Stay out of arc range and make it turn. From behind it\'s as soft as anything else, which is to say not very.',
    nan: 'Treads, a shield and an arc. Somebody upstairs was frightened of something.',
    nan2: 'They never leave their post. I knew one that stood in a doorway for eleven years.',
  },
  reaper: {
    temper: 'Polite. Patient. Collects you anyway.',
    habits: 'Drifts about unseen until its beam has you, then draws you towards the void.',
    tip: 'Keep away from edges and watch for the shimmer. It floats, so you can\'t knock it off anything: hack it instead.',
    nan: 'They sell what they collect. Some of it comes up here. Some of it was you.',
    nan2: 'A cloak and a beam. Horrible together. Lovely parts, though.',
  },
  overseer: {
    temper: 'Middle management.',
    habits: 'Runs a deck. Walks through its own force fields, dashes into reach and discharges.',
    tip: 'Dent it before you grapple: every dent costs it a pulser in the hack. Its phase core takes you through force fields too.',
    nan: 'Never met one I liked. Never met one who liked me. That\'s management.',
    nan2: 'Hack one and read its diary. It\'s all meetings.',
  },
  archon: {
    temper: 'Senior staff. Has never lost a hack.',
    habits: 'Floats at a distance behind its shield and fires. Nothing in the tower hacks back harder.',
    tip: 'Dent it as far as you dare before you grapple, make it turn its shield the wrong way, and take your time on the board.',
    nan: 'I saw one once, being carried up to a meeting. It didn\'t look at me. Good.',
    nan2: 'It had never lost a hack. Then you came along. Three times.',
  },
};

// Decks a family turns up on, and the one it calls home (whose colour it
// wears in the archive).
export function decksFor(k) {
  const F = FAMILIES[k];
  return DECKS.filter((d) => F.max >= d.classes[0] && F.min <= d.classes[1]);
}

export function homeDeck(k) {
  const F = FAMILIES[k];
  const mid = (F.min + F.max) / 2;
  let best = DECKS[0], gap = Infinity;
  for (const d of DECKS.slice(0, 5)) {
    const g = Math.abs((d.classes[0] + d.classes[1]) / 2 - mid);
    if (g < gap) { gap = g; best = d; }
  }
  return best;
}

export const DROIDS = FAMILY_ORDER.filter((k) => !FAMILIES[k].rival);

// How far a family's page has filled in: 0 unseen, 1 seen, 2 hacked, 3 complete.
export function tier(meta, k) {
  const a = meta.archive[k];
  if (!a) return 0;
  if ((a.hacked || 0) >= COMPLETE) return 3;
  if (a.hacked) return 2;
  return 1;
}

// Real lines from its voice, the first of each kind, more as the page fills.
const QUOTE_ORDER = ['spot', 'hit', 'beaten', 'flee', 'turned', 'gangIdle', 'hackAhead'];
export function quotes(k, n) {
  const v = VOICES[k] || {};
  const out = [];
  for (const kind of QUOTE_ORDER) {
    const pool = v[kind] || (out.length < 1 ? LINES[kind] : null);
    if (pool && pool.length) out.push(pool[0]);
    if (out.length >= n) break;
  }
  return out;
}

export function specs(k) {
  const F = FAMILIES[k];
  const range = (f) => { const a = f(F.min), b = f(F.max); return a === b ? `${a}` : `${a}–${b}`; };
  const grade = (c) => Math.max(1, Math.min(9, Math.floor(c / 100)));
  return [
    ['Integrity', range(integrityFor)],
    ['Hack pulsers', range(pulsersFor)],
    ['Board', `${range(rowsFor)} rows`],
    ['Clock', `${range(timerFor)} s`],
    ['Part grade', range((c) => `Mk ${['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][grade(c)]}`)],
  ];
}

// ---------------------------------------------------------------- the cast

export const PEOPLE = ['nan', 'static', 'ledger', 'mainframe', 'klp1'];

export const BIOS = {
  nan: {
    where: 'The Heap',
    bio: 'A welder from Freight, until a newer welder came along and she went up the chute. She built KLP-2 out of what the tower threw away, and rebuilds it every time it comes back up in a bag. Her bench in the Heap turns data into small, permanent improvements.',
    note: { by: 'static', text: 'She reads this, you know. Hello, Nan.' },
    find: 'Start a run and she\'ll find you.',
  },
  static: {
    where: 'The Heap, and the radio between decks',
    bio: 'Runs a pirate radio from the Heap on a frequency the tower hasn\'t found yet. Comes on as each deck starts, names its bounty, and is right about half the time.',
    note: { by: 'nan', text: 'Half of it\'s true. I still don\'t know which half.' },
    find: 'Listen to the radio as a deck starts.',
  },
  ledger: {
    where: 'Every fabricator',
    bio: 'Runs every fabricator in the tower, through the screens. Sells repairs, upgrades and firmware for scrap, and never gives refunds. Nobody knows where Ledger actually is, and Ledger isn\'t saying.',
    note: { by: 'nan', text: 'Never seen it. Never paid full price either. Count something afterwards.' },
    find: 'Find a fabricator. There\'s one near every lift.',
  },
  mainframe: {
    where: 'The bottom of the tower',
    bio: 'Class 999. Runs the tower from the bottom deck, behind a shield held up by four relays. Speaks in capitals, and mostly on deck cards.',
    note: { by: 'nan', text: 'Nobody goes down there and comes back up talking. Except you.' },
    find: 'Start a run.',
  },
  klp1: {
    where: 'Somewhere in the tower',
    bio: 'The KLP before you. Nan built it and sent it down the chute, and it never came back up as itself. It steals parts too: thrusters, a laser and a shield. From your third run it may turn up on any deck.',
    note: { by: 'nan', text: 'I\'m not ready to write about this one.' },
    home: { by: 'nan', text: 'Home. About time.' },
    find: 'Keep going. It will find you.',
  },
};

const heardAny = (meta, who) => Object.keys(meta.heard || {}).some((k) => k.startsWith(`${who}.`));

export function met(meta, who) {
  switch (who) {
    case 'nan': return heardAny(meta, 'nan') || (meta.runs || 0) > 0;
    case 'static': return heardAny(meta, 'static');
    case 'ledger': return heardAny(meta, 'ledger');
    case 'mainframe': return (meta.bestDeck || 0) >= 1;
    case 'klp1': return !!meta.klp1Met;
    default: return false;
  }
}

// What they've said to you, once-only lines with no blanks to fill in.
export function heardLines(meta, who) {
  const heard = meta.heard || {};
  const all = STORY.filter((l) => l.who === who && !l.again && !(Array.isArray(l.text) ? l.text.join(' ') : l.text).includes('{'));
  const got = all.filter((l) => heard[l.id]).map((l) => (Array.isArray(l.text) ? l.text.join(' ') : l.text));
  return { got, total: all.length };
}

// A few of the things they say over and over.
export function sayings(who, meta) {
  if (who === 'mainframe') {
    const top = Math.min(6, meta.bestDeck || 0);
    return Object.entries(MAINFRAME_DECK).filter(([n]) => +n <= top).map(([n, t]) => `Deck ${n}: ${t}`);
  }
  const seen = new Set();
  return STORY.filter((l) => l.who === who && l.again && !String(l.text).includes('{') && !Array.isArray(l.text))
    .map((l) => l.text).filter((t) => !seen.has(t) && seen.add(t)).slice(0, 3);
}

export function castColour(who) { return CAST[who].colour; }
