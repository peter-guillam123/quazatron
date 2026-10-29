// What survives between runs, kept in this browser: settings, the droid
// archive, the parts you've ever stolen, and a few records.

const KEY = 'klepto.v1';

const DEFAULTS = {
  settings: {
    master: 0.8, music: 0.5, sfx: 0.8,
    reducedMotion: null,   // null follows the system setting
    shake: true, retro: false, hints: true, assist: false, slowHack: false, gridControls: false,
  },
  archive: {},
  stolen: {},
  hints: {},
  tutorialHack: false,
  runs: 0, wins: 0, bestDeck: 0, hacks: 0,
};

export function loadMeta() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { data = null; }
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
