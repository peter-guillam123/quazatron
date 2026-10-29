// What the droids say. Short, flat and in capitals, like a status display
// that has opinions. Picked at random, never the same line twice running.

export const LINES = {
  spot: ['INTRUDER.', 'OI.', 'YOU THERE.', 'NOT ON MY SHIFT.', 'A KLP? ON THIS DECK?', 'HALT. PLEASE.', 'STATE YOUR CLASS.', 'THAT ONE STEALS.', 'HOSTILE. SMALL, BUT HOSTILE.', 'I SEE YOU.'],
  spotMite: ['EEP!', 'NOT ME!', 'NOPE.', 'I ONLY SWEEP!', 'HELP!', 'TOO SMALL TO HACK!'],
  command: ['CLEARANCE DENIED.', 'THIS DECK IS MINE.', 'ACCESS: NO.', 'YOU WANT THE LIFT? COME AND GET IT.'],
  hit: ['OW.', 'RUDE.', 'HEY!', 'MY PAINT.', 'THAT WAS NEW.', 'LOGGED.', 'DENT DETECTED.'],
  low: ['CRITICAL.', 'REQUESTING BACKUP.', 'NOT LIKE THIS.', 'WARRANTY VOID.'],
  fall: ['WAAAAH', 'NOOOOO', 'MIND THE GAP...', 'BYE, THEN.', 'NOT AGAIN.', 'I CAN FLY. NO.'],
  rejected: ['ACCESS DENIED.', 'NICE TRY.', 'FIREWALL WINS.', 'NOT TODAY.', 'TRY HARDER.'],
  turned: ['CYAN NOW.', 'WHERE TO, BOSS?', 'FOLLOWING.', 'I SEE THE LIGHT.', 'REPORTING IN.', 'WHAT WERE WE FIGHTING ABOUT?'],
  turnedMite: ['I CAN BE BRAVE.', 'FRIENDS?', 'I WILL SWEEP FOR YOU.'],
  allyKill: ['GOT ONE.', 'FOR K-2!', 'TIDY.', 'SCRAP FOR YOU.', 'OLD WORKMATE. SORRY.'],
  allyHit: ['OOF.', 'COVER ME.', 'THEY HIT BACK.'],
  idle: ['NICE DECK.', 'ARE WE NEARLY THERE?', 'I USED TO WORK HERE.', 'WHERE ARE WE GOING?', 'I LIKE THE CYAN.', 'SHALL I CARRY SOMETHING?', 'DOWN IS GOOD.'],
};

const last = {};

export function line(kind) {
  const list = LINES[kind];
  if (!list) return '';
  let s = list[Math.floor(Math.random() * list.length)];
  if (s === last[kind] && list.length > 1) s = list[(list.indexOf(s) + 1) % list.length];
  last[kind] = s;
  return s;
}
