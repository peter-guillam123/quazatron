// Firmware: passive upgrades found in archives, caches and claimed decks.
// They stack with your parts and last for the rest of the run.

export const PERKS = {
  overclock: { name: 'Overclock', line: 'One more pulser in every hack.' },
  fastpulse: { name: 'Short wires', line: 'Your pulses reach the middle twice as fast.' },
  longpulse: { name: 'Long pulse', line: 'Your pulses hold their cells 40% longer.' },
  firstfree: { name: 'Opening move', line: 'The first pulse of every hack costs nothing.' },
  scanner: { name: 'Scanner', line: 'See the hidden parts on your side of the board.' },
  firststrike: { name: 'First strike', line: 'Your opponent starts every hack a second and a half late.' },
  siphon: { name: 'Siphon', line: 'Winning a hack repairs another quarter of your integrity.' },
  plating: { name: 'Plating', line: 'Take a fifth less damage.' },
  reinforced: { name: 'Reinforced shell', line: '+30 maximum integrity, and a repair now.' },
  capacitor: { name: 'Capacitor', line: 'Energy comes back half as fast again.' },
  battery: { name: 'Battery', line: '+40 maximum energy.' },
  ramplate: { name: 'Ram plate', line: 'Shoves, rams and dashes hit 60% harder.' },
  overcharge: { name: 'Overcharge', line: 'Your weapons do a quarter more damage.' },
  leech: { name: 'Leech', line: 'Laser hits give you back energy.' },
  longreach: { name: 'Long grapple', line: 'Grapple from further away.' },
  lastgasp: { name: 'Last gasp', line: 'Once this run, survive a blow that would finish you.' },
};

export const PERK_IDS = Object.keys(PERKS);
