// What survives between runs, kept in this browser: settings, the droid
// archive, the parts you've ever stolen, and a few records.

const KEY = 'klepto.v2';
// The November 2026 redesign starts everyone again from a broken KLP-2.
// From an older save it keeps your settings, the archive, the hack lessons
// you've done and your days in today's tower.
const OLD = 'klepto.v1';
const CARRY = ['settings', 'archive', 'read', 'lesson', 'lessonSeen', 'seenHidden', 'daily', 'hints', 'inductionDone'];

const DEFAULTS = {
  settings: {
    master: 0.8, music: 0.5, sfx: 0.8,
    reducedMotion: null,   // null follows the system setting
    shake: true, retro: false, hints: true, assist: false, damageNumbers: true, slowHack: false, wireHints: false, gridControls: false, zoom: 1,
  },
  archive: {},
  stolen: {},
  hints: {},
  lesson: 0, lessonSeen: -1, seenHidden: false,
  runs: 0, wins: 0, bestDeck: 0, hacks: 0,
  // the Heap: data to spend, what Nan has fitted, what the cast have said
  data: 0, dataTotal: 0, bench: {}, heard: {}, lastRun: null,
};

export function loadMeta() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { data = null; }
  if (!data) {
    let old = null;
    try { old = JSON.parse(localStorage.getItem(OLD) || 'null'); } catch { old = null; }
    if (old && typeof old === 'object') {
      data = { freshStart: true };
      for (const k of CARRY) if (k in old) data[k] = old[k];
    }
  }
  const m = structuredClone(DEFAULTS);
  if (data && typeof data === 'object') {
    Object.assign(m, data);
    m.settings = { ...DEFAULTS.settings, ...(data.settings || {}) };
  }
  return m;
}

export function saveMeta(m) {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* private mode: fine */ }
}
