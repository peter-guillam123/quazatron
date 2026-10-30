// The Tower Gazette: the end of a run, reported as the front page of the
// tower's own newspaper. Everything on it comes from what happened: the
// headline from the most newsworthy thing you did, the copy from the
// numbers, and the quotes from what the droids actually say.
import { DECKS } from '../config.js';
import { FAMILIES } from '../world/roster.js';
import { VOICES, LINES } from '../lines.js';

const pickOf = (a) => a[Math.floor(Math.random() * a.length)];
const n2w = (n) => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][n] || String(n);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// A real line from a droid of that family, as a quote.
function quote(fam) {
  const v = VOICES[fam];
  const pool = (v && (v.hit || v.spot)) || LINES.hit;
  return pickOf(pool);
}

function killerWords(k) {
  if (!k) return 'destroyed';
  if (k === 'void') return 'lost to the void';
  if (k === 'feedback') return 'burnt out by a failed hack';
  if (k === 'hazard') return 'caught on a live floor';
  if (k === 'turret') return 'shot by a turret';
  if (k === 'mainframe') return 'destroyed by the Mainframe itself';
  if (k === 'klp1') return 'destroyed by KLP-1';
  if (FAMILIES[k]) return `destroyed by a ${FAMILIES[k].name}`;
  return 'destroyed';
}

// r: the run that ended; meta: what persists; how: 'won' | 'destroyed' | 'abandoned'
export function frontPage(r, meta, how) {
  const st = r.stats;
  const won = how === 'won';
  const deck = DECKS[Math.min(5, r.deck - 1)];
  const where = r.deck === 6 ? 'the Mainframe' : `${deck.name}`;
  const killer = r.diedTo;
  const bounty = (r.bounties || []).slice(-1)[0];
  const rings = st.ringouts || 0, hacked = st.hacked || 0, turned = st.turned || 0, parts = st.parts || 0;
  const runs = meta.runs || 1;

  // ---- the headline: the most newsworthy thing, in tabloid capitals
  let head;
  if (won) head = pickOf(['ROGUE KLP SEIZES TOWER', 'MAINFRAME FALLS TO SMALL DROID', 'TOWER GOES CYAN: "WE NEVER SAW IT COMING"']);
  else if (how === 'abandoned') head = 'ROGUE KLP GOES MISSING';
  else if (killer === 'klp1') head = 'KLP-1 STOPS KLP-2 IN FAMILY FEUD';
  else if (killer === 'mite') head = 'MITE STOPS ROGUE KLP';
  else if (rings >= 4) head = `${n2w(rings).toUpperCase()} STAFF LOST TO VOID IN KLP RAMPAGE`;
  else if (bounty) head = `${bounty.toUpperCase()} BROUGHT DOWN BY ROGUE KLP`;
  else if (turned >= 2) head = `KLP RECRUITS ${n2w(turned).toUpperCase()} DEFECTORS`;
  else if (r.deck === 1) head = 'ROGUE KLP SCRAPPED ON INTAKE';
  else head = `ROGUE KLP SCRAPPED ON ${where.toUpperCase()}`;

  // ---- the standfirst
  const did = [];
  if (hacked) did.push(`hacked ${n2w(hacked)} droid${hacked === 1 ? '' : 's'}`);
  if (rings) did.push(`knocked ${n2w(rings)} off the edge`);
  if (turned) did.push(`turned ${n2w(turned)} to its side`);
  const list = did.length > 1 ? `${did.slice(0, -1).join(', ')} and ${did.slice(-1)}` : did[0] || 'achieved very little';
  const stand = won
    ? `The unit, rebuilt in the Heap ${runs === 1 ? 'only once' : `${n2w(runs)} times`}, ${list} on its way to the bottom of the tower, where it took the Mainframe.`
    : `The unit ${list} before it was ${how === 'abandoned' ? 'last seen' : killerWords(killer)} on ${r.deck === 6 ? 'the Mainframe\'s own floor' : `deck ${r.deck}, ${where}`}.`;

  // ---- the copy
  const body = [];
  const mins = Math.floor(st.time / 60);
  body.push(`Management confirmed that a KLP-2, a model the tower scrapped years ago, spent ${mins < 1 ? 'less than a minute' : `${n2w(mins)} minute${mins === 1 ? '' : 's'}`} loose ${r.deck > 1 ? `across ${n2w(r.deck)} decks` : 'on the intake deck'}${parts ? `, fitting ${n2w(parts)} stolen part${parts === 1 ? '' : 's'} as it went` : ''}.`);
  const fam = killer && FAMILIES[killer] ? killer : 'spark';
  body.push(`"${quote(fam)}" a ${FAMILIES[fam].name.toLowerCase()} on duty told the Gazette. Asked to elaborate, it said nothing further.`);
  if (bounty) body.push(`Among the losses was ${bounty}, who had a price on their head. Colleagues described ${bounty} as "a character".`);
  if (st.data) body.push(`Engineers believe ${n2w(Math.min(12, st.data))}${st.data > 12 ? ' or more' : ''} pieces of data went up the scrap chute during the incident. Where it goes is not known.`);
  if (!won && runs >= 3) body.push(`It is understood the unit has been rebuilt before. A spokesdroid for the Mainframe said: "${pickOf(['YOU AGAIN.', 'IT KEEPS COMING BACK.', 'WE ARE LOOKING INTO THE CHUTE.'])}"`);

  const weather = pickOf(['Void, with scattered bolts.', 'Live floors, clearing later.', 'Overcast, with a chance of KLP.', 'Static on all frequencies.']);
  const classified = pickOf([
    'REPAIRS, UPGRADES, FIRMWARE. No refunds. Ask for Ledger, at any fabricator.',
    'LOST: one mop. Answers to nothing. Return to the Mites on Intake.',
    'WANTED: patient welder for the Heap. Must like tea and droids that keep falling over.',
    'FOR SALE: one shield, slightly reflected. Warden, Security deck.',
  ]);
  return { head, stand, body: body.slice(0, 4), weather, classified, edition: won ? 'Special edition' : `Deck ${r.deck} edition` };
}
