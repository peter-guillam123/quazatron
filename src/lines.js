// What the droids say. Short, flat and in capitals, like a status display
// that has opinions. Each family has its own voice; anything a family
// doesn't have a line for falls back to the plain ones. Picked at random,
// never the same line twice running.
//
// Situations: spot (first sees you), windup (about to attack), hit, low
// (badly hurt), flee, lost (lost sight of you), fall (ring-out), rejected
// (beat you in a hack), beaten (lost the hack), turned (joined your gang),
// gangIdle, allyKill, allyHit, command, bounty.

export const LINES = {
  spot: ['INTRUDER.', 'OI.', 'YOU THERE.', 'NOT ON MY SHIFT.', 'A KLP? ON THIS DECK?', 'HALT. PLEASE.', 'THAT ONE STEALS.', 'I SEE YOU.'],
  windup: ['HERE IT COMES.', 'BRACE.', 'HOLD STILL.'],
  hit: ['OW.', 'RUDE.', 'HEY!', 'MY PAINT.', 'THAT WAS NEW.', 'LOGGED.', 'DENT DETECTED.'],
  low: ['CRITICAL.', 'REQUESTING BACKUP.', 'NOT LIKE THIS.', 'WARRANTY VOID.'],
  flee: ['RETREATING.', 'TACTICAL WITHDRAWAL.'],
  lost: ['WHERE DID IT GO?', 'HUH.', 'PROBABLY NOTHING.', 'I KNOW YOU\'RE THERE.'],
  fall: ['WAAAAH', 'NOOOOO', 'MIND THE GAP...', 'BYE, THEN.', 'NOT AGAIN.', 'I CAN FLY. NO.'],
  rejected: ['ACCESS DENIED.', 'NICE TRY.', 'FIREWALL WINS.', 'NOT TODAY.', 'TRY HARDER.'],
  beaten: ['SYSTEM... YOURS...', 'POWERING DOWN.', 'FINE.'],
  turned: ['CYAN NOW.', 'WHERE TO, BOSS?', 'FOLLOWING.', 'I SEE THE LIGHT.', 'REPORTING IN.', 'WHAT WERE WE FIGHTING ABOUT?'],
  gangIdle: ['NICE DECK.', 'ARE WE NEARLY THERE?', 'I USED TO WORK HERE.', 'WHERE ARE WE GOING?', 'I LIKE THE CYAN.', 'DOWN IS GOOD.'],
  allyKill: ['GOT ONE.', 'FOR K-2!', 'TIDY.', 'SCRAP FOR YOU.', 'OLD WORKMATE. SORRY.'],
  allyHit: ['OOF.', 'COVER ME.', 'THEY HIT BACK.'],
  command: ['CLEARANCE DENIED.', 'THIS DECK IS MINE.', 'ACCESS: NO.', 'YOU WANT THE LIFT? COME AND GET IT.'],
  bounty: ['I AM {N}.', '{N} SEES YOU.', 'THEY CALL ME {N}.', '{N}. REMEMBER IT.', 'YOU KNOW WHO I AM.'],
};

export const VOICES = {
  // a cleaner, and frightened of everything
  mite: {
    spot: ['EEP!', 'NOT ME!', 'I ONLY SWEEP!', 'I JUST MOPPED THAT.', 'MIND THE FLOOR!', 'TOO SMALL TO HACK!'],
    hit: ['MY BRUSHES!', 'OW OW OW.', 'I\'M TELLING.'],
    flee: ['NOPE.', 'HELP!', 'RUNNING NOW.', 'NOT TODAY, THANK YOU.'],
    low: ['I WANT MY CUPBOARD.'],
    beaten: ['FINE. TAKE MY BRUSH.', 'I DIDN\'T WANT TO FIGHT ANYWAY.'],
    rejected: ['I WON? I WON!', 'DID THAT JUST HAPPEN?'],
    turned: ['I CAN BE BRAVE.', 'FRIENDS?', 'I WILL SWEEP FOR YOU.'],
    gangIdle: ['THIS FLOOR IS FILTHY.', 'CAN I SWEEP THAT?', 'ARE WE BRAVE YET?', 'I\'M NOT SCARED. MUCH.'],
  },
  // a sentry who lives by the rulebook
  spark: {
    spot: ['HALT. PAPERWORK.', 'STATE YOUR CLASS.', 'YOU ARE NOT ON MY LIST.', 'THIS AREA IS MONITORED.'],
    windup: ['TAKING AIM.', 'HOLD STILL.', 'WARNING SHOT. MOSTLY.'],
    hit: ['THAT IS A WRITTEN WARNING.', 'REPORTED.', 'I\'LL BE FILING THAT.'],
    low: ['THIS IS ABOVE MY GRADE.', 'REQUESTING BACKUP.'],
    beaten: ['I WAS ONLY FOLLOWING PROTOCOL.'],
    rejected: ['ACCESS DENIED. AS PER POLICY.'],
    turned: ['NEW SUPERVISOR. NOTED.', 'WHERE DO I SIGN?'],
    gangIdle: ['I HAVE STARTED A LOG OF YOUR DECISIONS.', 'IS THIS ROUTE APPROVED?', 'NOTHING TO REPORT. I\'LL REPORT IT ANYWAY.'],
  },
  // always late, always in a hurry
  courier: {
    spot: ['SIGN HERE. NO TIME.', 'OUT OF THE WAY!', 'DELIVERY FOR: YOU.', 'LATE LATE LATE.'],
    windup: ['COMING THROUGH!', 'EXPRESS!', 'MIND YOUR BACKS!'],
    hit: ['I\'M ON A SCHEDULE!', 'THAT\'LL COST YOU.'],
    low: ['I\'LL BE LATE FOR MY OWN SCRAPPING.'],
    beaten: ['MISSED MY SLOT.', 'RETURN TO SENDER.'],
    rejected: ['SIGNED, SEALED, DENIED.'],
    turned: ['WHERE ARE WE GOING? FAST?', 'FINALLY, A ROUTE WITH PURPOSE.'],
    gangIdle: ['CAN WE GO FASTER?', 'I KNOW A SHORTCUT. IT\'S THE VOID.', 'ARE WE THERE YET? NOW?'],
  },
  // slow, heavy and quite friendly really
  hauler: {
    spot: ['OH. HELLO.', 'YOU\'RE NOT A CRATE.', 'LIFT. WITH. THE. TREADS.'],
    windup: ['HERE... I... COME.', 'HOLD ON.'],
    hit: ['OOF.', 'THAT TICKLED. A BIT.'],
    low: ['HEAVY... DAY...'],
    beaten: ['NAP TIME.'],
    rejected: ['DID I WIN? NICE.'],
    turned: ['I CARRY THINGS. I CAN CARRY YOU.', 'MATE.'],
    gangIdle: ['NICE AND SLOW.', 'I LIKE YOU. YOU\'RE SMALL.', 'WANT ME TO PUSH SOMETHING?'],
  },
  // all nerves and static
  tesla: {
    spot: ['BZZT. SORRY. NERVES.', 'YOU LOOK CONDUCTIVE.', 'HELLO HELLO HELLO.'],
    windup: ['CHARGING...', 'STAND STILL. THIS WON\'T HURT. IT WILL.'],
    hit: ['ZAP! WAIT, THAT WAS ME.', 'OW. TINGLY.'],
    low: ['RUNNING LOW. BZZT.'],
    beaten: ['SHORTED OUT.'],
    turned: ['POSITIVE! I FEEL POSITIVE!', 'GROUNDED. FINALLY.'],
    gangIdle: ['I CAN HEAR THE WIRES.', 'DOES ANYONE ELSE TINGLE?'],
  },
  // an inspector, and a snob
  skimmer: {
    spot: ['THIS FLOOR FAILS INSPECTION. SO DO YOU.', 'HOW... COMMON.', 'NOTED. AND DEDUCTED.'],
    windup: ['CORRECTIVE ACTION.'],
    hit: ['HOW DARE YOU.', 'I\'LL HAVE YOU REPAINTED.'],
    low: ['THIS IS MOST IRREGULAR.'],
    beaten: ['I SHALL BE WRITING TO SOMEONE.'],
    rejected: ['AS EXPECTED.'],
    turned: ['I SUPPOSE CYAN IS... IN.'],
    gangIdle: ['I\'VE SEEN BETTER DECKS.', 'MIND THE PUDDLES.'],
  },
  // moves cargo, and you count as cargo
  crane: {
    spot: ['HOLD STILL. I\'M MOVING YOU.', 'UNSCHEDULED CARGO.', 'YOU\'LL DO FOR THE PILE.'],
    windup: ['LOCKING ON.', 'COME HERE.'],
    hit: ['MIND MY ARM.'],
    beaten: ['DROPPED IT.'],
    turned: ['WHERE SHALL I PUT THINGS?'],
    gangIdle: ['I COULD MOVE THAT. AND THAT.', 'THAT CRATE IS IN THE WRONG PLACE.'],
  },
  // says as little as possible
  warden: {
    spot: ['NO.', 'HALT.', 'NOT PAST ME.'],
    windup: ['...'],
    hit: ['NO.', 'STILL NO.'],
    low: ['HOLDING.'],
    beaten: ['FINE.'],
    rejected: ['NO.'],
    turned: ['YES.'],
    gangIdle: ['...', 'GUARDING.'],
  },
  // whispers
  phantom: {
    spot: ['...behind you.', 'you saw me. rude.', 'shh.'],
    windup: ['boo.'],
    hit: ['ow. quietly.'],
    low: ['fading...'],
    beaten: ['gone quiet.'],
    rejected: ['heh.'],
    turned: ['i\'ll be your shadow.'],
    gangIdle: ['i was here the whole time.', 'don\'t look round.'],
  },
  // a show-off
  wraith: {
    spot: ['TOO SLOW.', 'WATCH THIS.', 'FASTEST ON THE DECK.'],
    windup: ['CATCH!', 'BLINK AND YOU\'LL MISS IT.'],
    hit: ['LUCKY.', 'BEGINNER\'S LUCK.'],
    low: ['I MEANT THAT.'],
    beaten: ['I LET YOU WIN.'],
    rejected: ['TOO EASY.'],
    turned: ['FINE. BUT I\'M THE FAST ONE.'],
    gangIdle: ['RACE YOU.', 'KEEP UP.'],
  },
  // pompous bodyguard
  lancer: {
    spot: ['STAND ASIDE FOR THE COMMAND DECK.', 'HALT, PEASANT.'],
    windup: ['EN GARDE.', 'HAVE AT YOU.'],
    hit: ['HOW VULGAR.'],
    low: ['A SCRATCH. MERELY.'],
    beaten: ['I YIELD. GRACEFULLY.'],
    rejected: ['KNOW YOUR PLACE.'],
    turned: ['AT YOUR SERVICE, I SUPPOSE.'],
    gangIdle: ['WE SHOULD HAVE A BANNER.', 'ONWARDS. DOWNWARDS.'],
  },
  // a wall, and it knows it
  sentinel: {
    spot: ['I. AM. THE. WALL.', 'YOU. SHALL. NOT.'],
    windup: ['BRACE.'],
    hit: ['NOTED.'],
    low: ['STILL. STANDING.'],
    beaten: ['THE. WALL. FALLS.'],
    rejected: ['WALL. WINS.'],
    turned: ['I. AM. YOUR. WALL.'],
    gangIdle: ['STILL. HERE.'],
  },
  // collects stray droids for scrap
  reaper: {
    spot: ['YOU\'LL FETCH A GOOD PRICE.', 'ANOTHER ONE FOR THE PILE.', 'HOLD STILL, LITTLE PARTS.'],
    windup: ['COLLECTING.'],
    hit: ['DAMAGED GOODS.'],
    beaten: ['COLLECTED.'],
    rejected: ['INTO THE PILE.'],
    turned: ['I\'LL COLLECT FOR YOU NOW.'],
    gangIdle: ['SO MANY PARTS. SO LITTLE TIME.'],
  },
  // middle management
  overseer: {
    spot: ['LET\'S TAKE THIS OFFLINE. YOU, SPECIFICALLY.', 'I\'LL NEED YOU IN MY OFFICE.', 'THIS IS A PERFORMANCE ISSUE.'],
    windup: ['ACTIONING.', 'GOING FORWARD.'],
    hit: ['NOT IN FRONT OF THE TEAM.'],
    low: ['LET\'S CIRCLE BACK.'],
    beaten: ['I\'LL ESCALATE THIS.'],
    rejected: ['THAT\'S A NO FROM ME.'],
    turned: ['HAPPY TO REPORT TO YOU.', 'NEW LINE MANAGER. EXCITING.'],
    gangIdle: ['QUICK SYNC?', 'WHAT ARE OUR DELIVERABLES?'],
  },
  // the tower's senior staff
  archon: {
    spot: ['DO YOU HAVE AN APPOINTMENT?', 'HOW DID YOU GET DOWN HERE?', 'I HAVE NEVER LOST A HACK.'],
    windup: ['A DEMONSTRATION.'],
    hit: ['MY LAWYERS WILL HEAR OF THIS.'],
    low: ['UNACCEPTABLE.'],
    beaten: ['THIS NEVER HAPPENED.'],
    rejected: ['STILL UNDEFEATED.'],
    turned: ['I AM PREPARED TO CONSULT.'],
    gangIdle: ['I USED TO OWN THIS FLOOR.'],
  },
};

// Things droids say to each other before they notice you. {DECK} is the
// deepest deck you've reached; `when` decides if it fits your history.
export const CHATS = [
  { lines: ['DID YOU HEAR? A KLP GOT LOOSE.', 'THEY SCRAPPED THE KLPS YEARS AGO.', 'NOT ALL OF THEM.'] },
  { lines: ['WHO\'S ON SWEEPING?', 'NOT ME. I\'M ON STANDING HERE.'] },
  { lines: ['IS IT LUNCH?', 'WE DON\'T HAVE LUNCH.', 'THEN WHY AM I HUNGRY?'] },
  { lines: ['THE MAINFRAME SAYS WE\'RE A FAMILY.', 'THE MAINFRAME SAYS A LOT OF THINGS.'] },
  { lines: ['I\'M SAVING UP FOR A SECOND ARM.', 'WHAT FOR?', 'WAVING.'] },
  { lines: ['ANY NEWS FROM UPSTAIRS?', 'THERE IS NO UPSTAIRS. THERE\'S THE HEAP.', 'SAME THING.'] },
  { lines: ['DO YOU EVER WONDER WHAT\'S BELOW THE BOTTOM DECK?', 'THE MAINFRAME.', 'AND BELOW THAT?', 'STOP IT.'] },
  { lines: ['MY CLASS NUMBER WENT UP.', 'CONGRATULATIONS.', 'IT WAS A TYPO.'] },
  { lines: ['ONE GOT TO DECK {DECK} LAST TIME.', 'AND THEN?', 'AND THEN IT DIDN\'T.'], when: (m) => (m.bestDeck || 0) >= 2 && (m.runs || 0) >= 1 },
  { lines: ['THAT KLP KEEPS COMING BACK.', 'SOMEONE KEEPS REBUILDING IT.', 'WHO WOULD DO THAT?'], when: (m) => (m.runs || 0) >= 3 },
  { lines: ['THEY SAY ONE REACHED THE MAINFRAME.', 'AND?', 'AND HERE WE ALL STILL ARE.'], when: (m) => (m.wins || 0) >= 1 },
];

const last = {};

export function line(kind, family = null) {
  const own = family && VOICES[family] && VOICES[family][kind];
  const list = own || LINES[kind];
  if (!list) return '';
  const key = own ? `${family}.${kind}` : kind;
  let s = list[Math.floor(Math.random() * list.length)];
  if (s === last[key] && list.length > 1) s = list[(list.indexOf(s) + 1) % list.length];
  last[key] = s;
  return s;
}
