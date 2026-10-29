// Today's tower: the same seed for everyone on the same day, and a line of
// coloured squares to share afterwards, one per deck.

const SQUARES = ['🟪', '🟨', '🟩', '🟥', '🟦', '⬜'];

// The date where you are, as 2026-10-29.
export function today(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function prettyDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// FNV-1a: a string to a 32-bit seed.
export function dailySeed(iso) {
  let h = 0x811c9dc5;
  for (const ch of `klepto:${iso}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

// One square per deck: its colour if cleared, a bang where KLP-2 went down.
export function squares(deck, won, how) {
  let s = '';
  for (let n = 1; n <= 6; n++) {
    if (won || n < deck) s += SQUARES[n - 1];
    else if (n === deck) s += how === 'abandoned' ? '✖️' : '💥';
    else s += '⬛';
  }
  return s;
}

export function shareText(result) {
  const t = Math.floor(result.time / 60) + ':' + String(Math.floor(result.time % 60)).padStart(2, '0');
  const how = result.won ? 'Tower claimed' : result.deck === 6 ? 'Reached the Mainframe' : `Deck ${result.deck}`;
  return [
    `KLEPTO · today's tower, ${prettyDate(result.date)}`,
    squares(result.deck, result.won, result.how),
    `${how} · ${result.hacked} hacked · ${result.ringouts} ring-outs · ${t}`,
    'peter-guillam123.github.io/quazatron',
  ].join('\n');
}

// The same, in words, for screen readers.
export function shareSummary(result, deckNames) {
  if (result.won) return 'Every deck cleared and the Mainframe beaten.';
  const cleared = result.deck - 1;
  const where = result.deck === 6 ? 'at the Mainframe' : `on deck ${result.deck}, ${deckNames[result.deck - 1]}`;
  return `${cleared ? `${cleared} deck${cleared === 1 ? '' : 's'} cleared, then ` : ''}${result.how === 'abandoned' ? 'abandoned' : 'destroyed'} ${where}.`;
}
