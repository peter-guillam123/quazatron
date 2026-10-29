// The droid families of the tower. Each family has fixed parts and a class
// range; the class number sets toughness, hack strength and the grade of
// anything you take from it.

export const FAMILIES = {
  mite: {
    name: 'Mite', role: 'Maintenance', shape: 'squat', min: 101, max: 199,
    drive: 'wheels', arm: null, core: null, temper: 'timid',
    blurb: 'Sweeps the intake floors and runs from trouble. Carries nothing worth taking, which makes it a safe one to practise on.',
  },
  spark: {
    name: 'Spark', role: 'Sentry', shape: 'tall', min: 120, max: 299,
    drive: 'wheels', arm: 'laser', core: null, temper: 'sniper',
    blurb: 'Keeps its distance and fires. The first laser most KLP units ever steal.',
  },
  courier: {
    name: 'Courier', role: 'Runner', shape: 'squat', min: 210, max: 399,
    drive: 'thrusters', arm: null, core: null, temper: 'charger',
    blurb: 'Built to cross the tower in a hurry. It dashes at you, and it dashes over gaps.',
  },
  hauler: {
    name: 'Hauler', role: 'Loader', shape: 'wide', min: 230, max: 420,
    drive: 'treads', arm: null, core: null, temper: 'brute',
    blurb: 'Slow, heavy and hard to knock off anything. Its treads can shift the heavy crates.',
  },
  tesla: {
    name: 'Tesla', role: 'Lineman', shape: 'orb', min: 300, max: 520,
    drive: 'wheels', arm: 'arc', core: null, temper: 'hunter',
    blurb: 'Keeps the conduits charged. Gets close, crackles, then lets go.',
  },
  skimmer: {
    name: 'Skimmer', role: 'Inspector', shape: 'squat', min: 320, max: 560,
    drive: 'hover', arm: 'laser', core: null, temper: 'sniper',
    blurb: 'Floats over the live floors and the void as if neither were there.',
  },
  crane: {
    name: 'Crane', role: 'Handler', shape: 'tall', min: 380, max: 620,
    drive: 'wheels', arm: 'tractor', core: null, temper: 'puller',
    blurb: 'Moves cargo with a beam. It will happily move you towards the nearest edge.',
  },
  warden: {
    name: 'Warden', role: 'Guard', shape: 'wide', min: 420, max: 680,
    drive: 'treads', arm: null, core: 'shield', temper: 'guard',
    blurb: 'Faces you with its shield up and waits. Go round it.',
  },
  phantom: {
    name: 'Phantom', role: 'Infiltrator', shape: 'orb', min: 500, max: 760,
    drive: 'hover', arm: 'arc', core: 'cloak', temper: 'ambush',
    blurb: 'You usually hear it before you see it.',
  },
  wraith: {
    name: 'Wraith', role: 'Skirmisher', shape: 'tall', min: 540, max: 780,
    drive: 'thrusters', arm: 'laser', core: 'phase', temper: 'skirmish',
    blurb: 'Dashes in, fires, and slips through whatever you throw back.',
  },
  lancer: {
    name: 'Lancer', role: 'Escort', shape: 'squat', min: 620, max: 840,
    drive: 'thrusters', arm: 'laser', core: 'shield', temper: 'charger',
    blurb: 'Shield up, thrusters lit. An escort for things that matter.',
  },
  sentinel: {
    name: 'Sentinel', role: 'Bulwark', shape: 'wide', min: 660, max: 880,
    drive: 'treads', arm: 'arc', core: 'shield', temper: 'guard',
    blurb: 'A wall with lightning in it.',
  },
  reaper: {
    name: 'Reaper', role: 'Collector', shape: 'orb', min: 700, max: 899,
    drive: 'hover', arm: 'tractor', core: 'cloak', temper: 'puller',
    blurb: 'Collects stray droids for scrap. Unseen until the beam has you.',
  },
  overseer: {
    name: 'Overseer', role: 'Officer', shape: 'tall', min: 760, max: 940,
    drive: 'thrusters', arm: 'arc', core: 'phase', temper: 'hunter',
    blurb: 'Runs a deck. Moves through its own force fields like they were curtains.',
  },
  archon: {
    name: 'Archon', role: 'Executive', shape: 'orb', min: 800, max: 980,
    drive: 'hover', arm: 'laser', core: 'shield', temper: 'sniper',
    blurb: 'The tower’s senior staff. It has never lost a hack.',
  },
};

export const FAMILY_ORDER = Object.keys(FAMILIES);

export function familiesForRange(lo, hi) {
  return FAMILY_ORDER.filter((k) => FAMILIES[k].max >= lo && FAMILIES[k].min <= hi);
}

export function modulesOf(familyId, cls) {
  const f = FAMILIES[familyId];
  const g = Math.max(1, Math.min(9, Math.floor(cls / 100)));
  return {
    drive: { id: f.drive || 'wheels', grade: f.drive && f.drive !== 'wheels' ? g : 1 },
    arm: f.arm ? { id: f.arm, grade: g } : null,
    core: f.core ? { id: f.core, grade: g } : null,
  };
}

export function integrityFor(cls) {
  return Math.round(18 + cls * 0.085);
}

// Hack strength: pulsers the droid gets in the circuit duel.
export function pulsersFor(cls) {
  return 3 + Math.floor(cls / 250);
}

export function rowsFor(cls) {
  return cls < 200 ? 8 : cls < 500 ? 10 : 12;
}
