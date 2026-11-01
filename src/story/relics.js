// When the Mainframe had KLP-2 wiped and thrown down the chute, it handed
// out the best of its parts to the bosses of the tower's decks, like medals.
// Each deck's ◆ command droid is its boss, and carries two pieces of the old
// KLP-2. Beat it and take one back for good; the other stays with the boss
// until you beat it again on another run. Each piece shows on KLP-2.

export const BOSSES = {
  1: { name: 'The Sorter', line: 'Decides what\'s rubbish. Decided you were.' },
  2: { name: 'The Quartermaster', line: 'Signs for everything that comes through Freight. Signed for you.' },
  3: { name: 'The Stoker', line: 'Keeps the reactor fed. Fed it most of you.' },
  4: { name: 'The Marshal', line: 'Runs Security. Ran the wipe.' },
  5: { name: 'The Director', line: 'Gave the order. Kept the best bits.' },
};

export const RELICS = {
  // deck 1, the Sorter
  claw: {
    deck: 1, name: 'Your old claw', icon: 'grab',
    line: 'Grapple from further away, and droids open sooner: at 70% instead of 60%.',
    look: 'a bigger claw, lit cyan',
  },
  plate: {
    deck: 1, name: 'Your old ram plate', icon: 'ram',
    line: 'Jabs and shoves hit 40% harder.',
    look: 'a plate on the front',
  },
  // deck 2, the Quartermaster
  gyro: {
    deck: 2, name: 'Your old gyro', icon: 'wheels',
    line: 'Swerves, dashes and stamps cost 40% less energy.',
    look: 'a ring turning under it',
  },
  magnet: {
    deck: 2, name: 'Your old magnet', icon: 'scrap',
    line: 'Scrap flies to you from twice as far, and there\'s a quarter more of it.',
    look: 'a magnet on its back',
  },
  // deck 3, the Stoker
  capacitor: {
    deck: 3, name: 'Your old capacitor', icon: 'energy',
    line: 'Energy comes back 40% faster.',
    look: 'two glowing cells on its back',
  },
  insulation: {
    deck: 3, name: 'Your old insulation', icon: 'shield',
    line: 'Live floors and lightning do half as much to you.',
    look: 'a rubber skirt',
  },
  // deck 4, the Marshal
  firewall: {
    deck: 4, name: 'Your old firewall', icon: 'hack',
    line: 'A lost hack no longer burns you.',
    look: 'a shade over the visor',
  },
  optic: {
    deck: 4, name: 'Your old optic', icon: 'eye',
    line: 'Lock on from 30% further, and see cloaked droids.',
    look: 'a second eye on the dome',
  },
  // deck 5, the Director
  corekey: {
    deck: 5, name: 'Your old core key', icon: 'core',
    line: 'One more pulser in every hack.',
    look: 'a core glowing in its chest',
  },
  override: {
    deck: 5, name: 'Your old override', icon: 'gang',
    line: 'Droids you turn join in full working order and hit at full strength.',
    look: 'a halo over the dome',
  },
};

export const RELIC_ORDER = Object.keys(RELICS);

export function relicsFor(deck) {
  return RELIC_ORDER.filter((id) => RELICS[id].deck === deck);
}

// Pieces of you this boss still has.
export function relicsLeft(meta, deck) {
  return relicsFor(deck).filter((id) => !(meta.relics || {})[id]);
}
