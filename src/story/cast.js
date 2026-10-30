// The cast, and everything they say. A line can depend on what's happened
// (how the last run ended, how far you've got, what you did on the deck
// you just left) and most play only once, so the cast seems to remember.
// Lines marked `again` can repeat; they fill in when nothing new fits.
//
// Who: nan (rebuilds you in the Heap), static (pirate radio), ledger
// (runs the fabricators), mainframe (runs the tower).

export const CAST = {
  nan: { name: 'Nan', role: 'Rebuilds you, in the Heap', colour: '#ffa64a', shell: '#8a5a3c', look: 'wide' },
  static: { name: 'Static', role: 'Pirate radio', colour: '#7dffb0', shell: '#4a4f5c', look: 'tall' },
  ledger: { name: 'Ledger', role: 'Runs every fabricator', colour: '#ffd25a', shell: '#2a2d36', look: 'screen' },
  mainframe: { name: 'The Mainframe', role: 'Runs the tower', colour: '#cfc4ff', shell: '#1a1830', look: 'eye' },
  klp1: { name: 'KLP-1', role: 'The first of you', colour: '#ff6a5a', shell: '#6b7380', look: 'klp' },
};

const DEATH = {
  void: 'Off the edge again. The tower\'s got a lot of edges, love. Mostly it\'s edges.',
  feedback: 'Lost a hack and it cooked you. I can smell it from here.',
  hazard: 'You sat on a live floor. Even I don\'t do that.',
  turret: 'A turret. They don\'t even move. You must have been standing very still.',
  mite: 'A Mite did this? A Mite? I\'m not telling anyone.',
  spark: 'Shot by a Spark. They can\'t even spell halt.',
  courier: 'Run over by a Courier. They don\'t even stop to get a signature.',
  hauler: 'Flattened by a Hauler. It didn\'t mean it. That doesn\'t help, does it.',
  tesla: 'Fried by a Tesla. Keep your distance from the crackly ones, or hit them first.',
  skimmer: 'A Skimmer. They float about looking down on everyone, and then they shoot you.',
  crane: 'A Crane pulled you somewhere you didn\'t want to go. They do that.',
  warden: 'You went at a Warden from the front. Everyone does, once.',
  phantom: 'Something you couldn\'t see. If the air shimmers, swerve.',
  wraith: 'A Wraith. Show-offs, the lot of them. Don\'t let it get to you.',
  lancer: 'Lancers. Shield up and thrusters lit. Go round the side.',
  sentinel: 'A Sentinel. It\'s a wall with lightning in it. Don\'t hug the wall.',
  reaper: 'A Reaper had you. I\'ve had to buy some of your bits back.',
  overseer: 'An Overseer. Middle management. They always get you in the end.',
  archon: 'An Archon. Senior staff. You were never meant to get that far down.',
  mainframe: 'You got to the Mainframe. The actual Mainframe. Nothing comes back up from there talking, except you.',
  klp1: 'KLP-1 did this. I built that one too. I\'m sorry.',
};

const L = [];
const say = (who, on, text, o = {}) => L.push({ id: o.id || `${who}.${on}.${L.length}`, who, on, text, ...o });

// ---------------------------------------------------------------- Nan, the first time you come up
say('nan', 'hello', ['So you\'re the new one. I\'m Nan. I built you out of what the tower threw away.', 'When you get wrecked down there, and you will, your bits come back up the chute and I put you back together. Hack things and the data comes up too. I can do a lot with data.', 'The chute\'s at the bottom. Off you go.'],
  { id: 'nan.hello', pri: 100, when: (c) => (c.meta.runs || 0) === 0 });

// ---------------------------------------------------------------- Nan, waking you up
const last = (c) => c.meta.lastRun || {};
say('nan', 'wake', ['There you are. Most of you, anyway.', 'I\'m Nan. I built you out of what the tower threw away, and I\'ll keep building you as long as you keep coming back up the chute.', 'Hack things down there and the data comes up to me. Bring me enough and I\'ll make you sturdier. Scrap\'s no use up here: spend that down there.'],
  { id: 'nan.first', pri: 100, when: (c) => (c.meta.runs || 0) <= 1 && !(c.meta.heard || {})['nan.hello'] });
say('nan', 'wake', ['There you are. Most of you, anyway.', 'Told you you\'d be back. Everyone comes back up the chute the first time. It\'s the second time that counts.'],
  { id: 'nan.firstback', pri: 100, when: (c) => (c.meta.runs || 0) <= 1 && !!(c.meta.heard || {})['nan.hello'] });
say('nan', 'wake', ['The whole tower, cyan. I watched it from here.', 'Right. Kettle on. They\'ll have it rebuilt by morning, mind, so you\'re going again.'], { id: 'nan.won1', pri: 95, when: (c) => last(c).won && (c.meta.wins || 0) === 1 });
say('nan', 'wake', 'Again! You\'re making the rest of us look idle.', { pri: 94, again: true, when: (c) => last(c).won });
say('nan', 'wake', 'That\'s ten times I\'ve rebuilt you. I\'m going to start charging. I\'m joking. I\'m not joking.', { id: 'nan.ten', pri: 70, when: (c) => (c.meta.runs || 0) >= 10 });
say('nan', 'wake', 'Gave up, did you? Fair enough. I did once. Look where it got me: up here, with you.', { id: 'nan.quit', pri: 60, when: (c) => last(c).how === 'abandoned' });
for (const [k, text] of Object.entries(DEATH)) {
  say('nan', 'wake', text, { id: `nan.death.${k}`, pri: 40, when: (c) => last(c).killer === k && !last(c).won });
}
say('nan', 'wake', 'Deck {LASTDECK}. That\'s further than I ever got. Don\'t let it go to your head. I\'ve only just put it back on.', { id: 'nan.deep', pri: 45, when: (c) => (last(c).deck || 0) >= 4 && !last(c).won });
say('nan', 'wake', 'Deck one. I\'ve had kettles get further than that.', { id: 'nan.deck1', pri: 35, when: (c) => last(c).deck === 1 && (c.meta.runs || 0) > 2 });
say('nan', 'wake', 'You brought down {LASTBOUNTY}? Good. Never liked them.', { id: 'nan.bounty', pri: 38, when: (c) => !!last(c).bounty });
say('nan', 'wake', '{LASTRINGOUTS} droids off the edge. The scrap merchants downstairs must love you.', { id: 'nan.ringouts', pri: 37, when: (c) => (last(c).ringouts || 0) >= 4 });
say('nan', 'wake', 'I hear you\'ve got a gang now. Bring them up some time. Actually, don\'t.', { id: 'nan.gang', pri: 36, when: (c) => (last(c).turned || 0) >= 2 });
say('nan', 'wake', 'Not a single hack. I can\'t build anything out of smashed droids, love. Hack them.', { id: 'nan.nohack', pri: 39, when: (c) => last(c).hacked === 0 && (last(c).time || 0) > 60 });
say('nan', 'wake', 'Back again. Sit still while I find the bits.', { pri: 1, again: true });
say('nan', 'wake', 'Up the chute in a bag, as usual. Hold still.', { pri: 1, again: true });
say('nan', 'wake', 'There. Put you back together. Mostly the right way round.', { pri: 1, again: true });

// ---------------------------------------------------------------- Nan, chatting
say('nan', 'talk', 'The tower throws things away. We\'re the things it threw away. Nothing wrong with that. I like it up here.', { pri: 10 });
say('nan', 'talk', 'Hack things, don\'t just smash them. Smashing\'s for scrap, and scrap doesn\'t come back up the chute. Data does.', { pri: 9 });
say('nan', 'talk', 'That bumper of yours. Hold it down and lean into it. Little things can shove big things, if they mean it.', { pri: 8 });
say('nan', 'talk', 'Static talks too much. Listen anyway. About half of it\'s true, and you won\'t know which half.', { pri: 7 });
say('nan', 'talk', 'Ledger will sell you anything. Count your fingers afterwards. You haven\'t got fingers. Count something.', { pri: 6 });
say('nan', 'talk', 'I was a welder on Freight. Then a newer welder came along. Then I came up here.', { pri: 5 });
say('nan', 'talk', 'Walls are your friend. Shove a droid into one and it forgets which way is up.', { pri: 4 });
say('nan', 'talk', 'Before you, there was KLP-1. Don\'t ask. I\'m not ready.', { pri: 3, when: (c) => (c.meta.runs || 0) >= 3 && !c.meta.klp1Met });
say('nan', 'talk', 'You\'ve met KLP-1, then. I built it before you. It went down the chute and it didn\'t come back up. Not as itself.', { pri: 12, when: (c) => !!c.meta.klp1Met && !c.meta.klp1Turned });
say('nan', 'talk', 'You brought KLP-1 home. I don\'t know what to say. Get out before I start.', { pri: 13, when: (c) => !!c.meta.klp1Turned });
say('nan', 'talk', 'You\'ve {DATA} data. That\'s enough for something on the bench.', { pri: 20, again: true, when: (c) => c.affordable });
say('nan', 'talk', 'Off you go, then. The chute\'s not getting any shorter.', { pri: 0, again: true });
say('nan', 'talk', 'I\'m busy. I\'m always busy. Go on.', { pri: 0, again: true });

say('nan', 'bought', 'There. You\'ll hardly notice the difference. That\'s the point.', { again: true });
say('nan', 'bought', 'Done. Try not to scratch it.', { again: true });
say('nan', 'bought', 'Better. Not good. Better.', { again: true });
say('nan', 'bench', 'What\'ll it be? It\'s all small stuff. Small stuff adds up.', { again: true });
say('nan', 'broke', 'You haven\'t got the data for that. Go and hack something.', { again: true });

// ---------------------------------------------------------------- Static, on the radio between decks
const INTRO = {
  2: ['This is Static, on a frequency they haven\'t found yet. Freight next: Couriers, crates and edges. Couriers don\'t stop for anyone, so don\'t stand in front of one.', 'Freight again. Mind the Couriers.'],
  3: ['Reactor. The floors are live, which is more than can be said for some of the staff. Something down there floats.', 'Reactor. Hover if you\'ve got it.'],
  4: ['Security. Turrets, Wardens and things you can\'t see. If the air shimmers, swerve.', 'Security. Shields up, or eyes open.'],
  5: ['Command deck. Officers. They hack back like they mean it, so dent them first.', 'Command. Dent first, hack second.'],
  6: ['That\'s the Mainframe under you. Four relays hold its shield. Good luck, KLP. I mean that, which is unusual for me.', 'Mainframe. Relays, then the big one.'],
};
for (const [n, [first, again]] of Object.entries(INTRO)) {
  say('static', 'lift', first, { id: `static.intro${n}`, pri: 10, when: (c) => c.deck === +n });
  say('static', 'lift', again, { pri: 5, again: true, when: (c) => c.deck === +n });
}
// remarks about the deck you've just left
say('static', 'remark', 'And that\'s {BOUNTY} done. I\'ll play something to celebrate. I\'ve only got the one record.', { pri: 9, again: true, when: (c) => !!c.prev.bounty });
say('static', 'remark', '{RINGOUTS} off the edge on one deck. I counted. It took both hands.', { pri: 8, again: true, when: (c) => c.prev.ringouts >= 3 });
say('static', 'remark', 'Not one hack on that deck. Nan won\'t like that. She runs on data.', { pri: 7, again: true, when: (c) => c.prev.hacked === 0 });
say('static', 'remark', 'You sound rough. There\'s a fabricator by every lift. Ledger will patch you up, at a price.', { pri: 6, again: true, when: (c) => c.prev.hurt });
say('static', 'remark', 'You and your gang. You\'re a proper crowd now.', { pri: 5, when: (c) => c.prev.gang >= 2 });
say('static', 'remark', 'That was quick. Were you even there?', { pri: 4, again: true, when: (c) => c.prev.time < 80 });
say('static', 'remark', 'You met KLP-1. I\'ve been trying to get it on the show for years. It doesn\'t do interviews.', { pri: 10, again: true, when: (c) => !!c.prev.klp1 });
say('static', 'remark', 'Every machine on that deck, cyan. Show-off.', { pri: 8, again: true, when: (c) => c.prev.claimed });

say('static', 'talk', 'I broadcast to anything with an aerial. Mostly that\'s you and a toaster on Reactor.', { pri: 10 });
say('static', 'talk', 'Nan pretends she doesn\'t watch your runs. She watches every one.', { pri: 9 });
say('static', 'talk', 'The Mainframe listens to my show, you know. It\'s never phoned in.', { pri: 8 });
say('static', 'talk', 'I\'ll be on the radio in the lift. Between decks. Like a friend, if friends never shut up.', { pri: 11 });
say('static', 'talk', 'There\'s a KLP-1 down there, they say. Older than you. Meaner. Says nothing on the radio, and I\'ve asked.', { pri: 7, when: (c) => (c.meta.runs || 0) >= 2 && !c.meta.klp1Turned });
say('static', 'talk', 'Static. Still on air. Mostly.', { pri: 0, again: true });
say('static', 'talk', 'Nothing new on the wire. Go and make some news.', { pri: 0, again: true });

// ---------------------------------------------------------------- Ledger, in every fabricator
say('ledger', 'open', 'I\'m Ledger. I run every fabricator in the tower, through the screens. Don\'t ask how. Do ask about prices.', { id: 'ledger.first', pri: 100 });
say('ledger', 'open', 'That\'s a lot of scrap. I\'m suddenly very interested in you.', { id: 'ledger.rich', pri: 50, when: (c) => c.scrap >= 60 });
say('ledger', 'open', 'You\'re leaking. Repairs are at the top.', { pri: 20, again: true, when: (c) => c.hurt });
say('ledger', 'open', 'Scrap first, questions never.', { pri: 1, again: true });
say('ledger', 'open', 'You again. What\'ll it be?', { pri: 1, again: true });
say('ledger', 'open', 'Repairs, upgrades, firmware. No refunds.', { pri: 1, again: true });
say('ledger', 'open', 'My prices are fair. Fair to me.', { pri: 1, again: true });
say('ledger', 'buy', 'Pleasure.', { again: true });
say('ledger', 'buy', 'Noted in the ledger.', { again: true });
say('ledger', 'buy', 'Done. Don\'t break it.', { again: true });
say('ledger', 'buy', 'A sound investment. Probably.', { again: true });
say('ledger', 'broke', 'That\'s not enough scrap. I can count, you know.', { again: true });
say('ledger', 'broke', 'Come back richer.', { again: true });

// ---------------------------------------------------------------- the Mainframe, on each deck's card
const MF = {
  1: 'ANOTHER KLP. HOW NOSTALGIC.',
  2: 'YOU ARE STILL HERE. NOTED.',
  3: 'MY STAFF ARE BEING INCONVENIENCED.',
  4: 'SECURITY HAS BEEN INFORMED. SECURITY IS DELIGHTED.',
  5: 'TURN BACK. THIS IS NOT A REQUEST. IT IS A RECOMMENDATION. ALSO A REQUEST.',
  6: 'COME DOWN, THEN.',
};
for (const [n, text] of Object.entries(MF)) say('mainframe', 'deck', text, { pri: 5, again: true, when: (c) => c.deck === +n });
say('mainframe', 'deck', 'YOU AGAIN.', { pri: 6, again: true, when: (c) => c.deck === 1 && (c.meta.runs || 0) >= 3 && Math.random() < 0.5 });
say('mainframe', 'deck', 'THE CHUTE IS NOT AN ENTRANCE.', { id: 'mf.chute', pri: 7, when: (c) => c.deck === 1 && (c.meta.runs || 0) >= 5 });
say('mainframe', 'deck', 'WE HAVE MET. I REMEMBER IT DIFFERENTLY.', { pri: 8, again: true, when: (c) => c.deck === 6 && (c.meta.wins || 0) >= 1 });

// ---------------------------------------------------------------- KLP-1, once it's home
say('klp1', 'talk', ['Nan says I can stay.', 'I\'m not sure I want to. I\'ll stay anyway.'], { pri: 10 });
say('klp1', 'talk', 'I went down the chute first. Nobody rebuilt me. I rebuilt myself, out of whatever I could take. Badly.', { pri: 9 });
say('klp1', 'talk', 'You hack like her. Nan, I mean. She taught me too, before.', { pri: 8 });
say('klp1', 'talk', 'Wardens. Go round, never through. I learnt that the expensive way.', { pri: 7 });
say('klp1', 'talk', 'Static still talks too much.', { pri: 0, again: true });
say('klp1', 'talk', 'Go on, then, Two. I\'ll be here.', { pri: 0, again: true });

export const STORY = L;

// Fill in the blanks from what's known.
function fill(text, c) {
  const lr = last(c);
  return text
    .replace('{LASTDECK}', String(lr.deck || 1))
    .replace('{LASTBOUNTY}', lr.bounty || 'that bounty')
    .replace('{LASTRINGOUTS}', String(lr.ringouts || 0))
    .replace('{BOUNTY}', (c.prev && c.prev.bounty) || 'the bounty')
    .replace('{RINGOUTS}', String((c.prev && c.prev.ringouts) || 0))
    .replace('{DATA}', String(c.meta.data || 0));
}

// The best thing for `who` to say about `on`, given context c (which must
// carry `meta`). Marks it heard, so a story line isn't repeated. Returns
// { who, pages: [text, ...] } or null.
export function pick(who, on, c) {
  const heard = c.meta.heard || (c.meta.heard = {});
  let best = null, top = -Infinity;
  const pool = [];
  for (const l of STORY) {
    if (l.who !== who || l.on !== on) continue;
    if (!l.again && heard[l.id]) continue;
    if (l.when && !l.when(c)) continue;
    const p = l.pri || 0;
    if (p > top) { top = p; pool.length = 0; }
    if (p === top) pool.push(l);
  }
  if (!pool.length) return null;
  best = pool[Math.floor(Math.random() * pool.length)];
  if (!best.again) heard[best.id] = true;
  const pages = (Array.isArray(best.text) ? best.text : [best.text]).map((t) => fill(t, c));
  return { who, pages };
}

// Has `who` got a story line about `on` they haven't said yet?
export function hasNew(who, on, c) {
  const heard = c.meta.heard || {};
  return STORY.some((l) => l.who === who && l.on === on && !l.again && !heard[l.id] && (!l.when || l.when(c)));
}
