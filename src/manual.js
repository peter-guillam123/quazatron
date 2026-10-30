// How to play, as an illustrated manual: a chapter a page, each with a
// drawing made of the same shapes as the game (droids seen from above, the
// lock-on bracket, floor warnings, the hack board). The drawings are SVG,
// so they stay sharp at any size; the little motion in them stops for
// anyone who prefers reduced motion.
import { Book } from './book.js';
import { MODULES, SLOTS, SLOT_NAMES, ICONS, iconSvg } from './world/modules.js';
import { DECKS } from './config.js';

const Y = '#2ef2ff', F = '#ff3ad8', G = '#ffc24a', M = '#8b93a6', T = '#e6ebf3', BODY = '#10131c', LINE = '#3a4256';
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

// ---------------------------------------------------------------- drawing kit

const DEFS = `<defs>
  ${[['y', Y], ['f', F], ['g', G], ['m', M]].map(([k, c]) => `<marker id="ah-${k}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`).join('')}
  <filter id="glow" filterUnits="userSpaceOnUse" x="-40" y="-40" width="560" height="360"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#161a26"/><line x1="0" y1="0" x2="0" y2="7" stroke="#2b3245" stroke-width="3"/></pattern>
</defs>`;

const art = (body, label, h = 250) => `<svg viewBox="0 0 480 ${h}" role="img" aria-label="${label}">${DEFS}${body}</svg>`;
const txt = (x, y, s, o = {}) => `<text x="${x}" y="${y}" fill="${o.c || M}" font-size="${o.size || 10.5}" text-anchor="${o.a || 'middle'}" class="${o.cls || 'lbl'}">${s}</text>`;

// A droid seen from above. face: degrees, 0 is up the page.
function droid(x, y, r, c, face = 0, o = {}) {
  const f = (n) => n.toFixed(1);
  return `<g transform="translate(${x} ${y}) rotate(${face})"${o.cls ? ` class="${o.cls}"` : ''}${o.op ? ` opacity="${o.op}"` : ''}>
    <circle r="${r}" fill="${o.fill || BODY}" stroke="${c}" stroke-width="2.2"${o.dash ? ' stroke-dasharray="4 4"' : ''}/>
    <circle r="${f(r * 0.56)}" fill="none" stroke="${c}" stroke-opacity="0.4" stroke-width="1.6"/>
    ${o.dash ? '' : `<path d="M${f(-r * 0.55)} ${f(-r * 0.58)}A${f(r * 0.8)} ${f(r * 0.8)} 0 0 1 ${f(r * 0.55)} ${f(-r * 0.58)}" fill="none" stroke="${c}" stroke-width="3.2" stroke-linecap="round" filter="url(#glow)"/>`}
    ${o.barrel ? `<rect x="${f(r * 0.45)}" y="${f(-r - 12)}" width="5" height="14" rx="2" fill="#9aa1ad"/>` : ''}
  </g>`;
}
const klp = (x, y, face = 0, o) => droid(x, y, 13, Y, face, o);

function bracket(x, y, s, c = Y) {
  const k = s * 0.42;
  return `<g class="pulse" stroke="${c}" stroke-width="2.6" fill="none" stroke-linecap="round" filter="url(#glow)">${[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([dx, dy]) => `<path d="M${x + dx * s} ${y + dy * (s - k)}L${x + dx * s} ${y + dy * s}L${x + dx * (s - k)} ${y + dy * s}"/>`).join('')}</g>`;
}

function burst(x, y, word, c, wy = -30) {
  const pts = [];
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = i % 2 ? 9 : 19; pts.push(`${(x + Math.cos(a) * r).toFixed(1)},${(y + Math.sin(a) * r).toFixed(1)}`); }
  return `<polygon points="${pts.join(' ')}" fill="${c}" fill-opacity="0.2" stroke="${c}" stroke-width="1.5"/>${txt(x, y + wy, word, { c, size: 14 })}`;
}

const wall = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="url(#hatch)" stroke="${LINE}"/>`;
const icon = (id, x, y, s = 1, c = Y) => `<g transform="translate(${x - 12 * s} ${y - 12 * s}) scale(${s})" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[id]}</g>`;
const star = (x, y) => `<path d="M${x} ${y - 5}L${x + 1.5} ${y - 1.5}L${x + 5} ${y}L${x + 1.5} ${y + 1.5}L${x} ${y + 5}L${x - 1.5} ${y + 1.5}L${x - 5} ${y}L${x - 1.5} ${y - 1.5}z" fill="#ffe27a"/>`;
function key(x, y, w, label, cap, c = T) {
  return `<g class="key"><rect x="${x}" y="${y + 3}" width="${w}" height="32" rx="6" fill="#0a0c12"/><rect x="${x}" y="${y}" width="${w}" height="31" rx="6" fill="#171b28" stroke="${LINE}"/>
    ${txt(x + w / 2, y + 20, label, { c, size: 13, cls: 'cap' })}${cap ? txt(x + w / 2, y + 50, cap, { size: 9.5 }) : ''}</g>`;
}

// ---------------------------------------------------------------- the drawings

const ART = {
  idea: () => art(`
    ${klp(110, 140, 90)}
    ${droid(318, 132, 30, F, 270, { barrel: true })}
    <path class="zap" d="M126 140L150 128L170 146L192 126L214 146L236 128L258 144L284 134" fill="none" stroke="${Y}" stroke-width="2.4" stroke-linejoin="round" filter="url(#glow)"/>
    <path d="M314 96Q220 6 126 112" fill="none" stroke="${Y}" stroke-width="2" stroke-dasharray="5 5" marker-end="url(#ah-y)" class="flow"/>
    <rect x="198" y="34" width="36" height="36" rx="9" fill="${BODY}" stroke="${Y}" stroke-width="1.6"/>${icon('laser', 216, 52, 1.05)}
    ${txt(110, 176, 'KLP-2', { c: Y })}${txt(318, 184, 'A Spark, class 240', { c: F })}
    ${[['1  Grapple', 92], ['2  Win the hack', 240], ['3  Take a part', 388]].map(([s, x]) => `<rect x="${x - 66}" y="206" width="132" height="26" rx="13" fill="#141824" stroke="${LINE}"/>${txt(x, 223, s, { c: T, size: 11 })}`).join('')}
    <path d="M160 219H170" stroke="${M}" stroke-width="2" marker-end="url(#ah-m)"/><path d="M308 219H318" stroke="${M}" stroke-width="2" marker-end="url(#ah-m)"/>`,
  'KLP-2 grapples a bigger droid, wins the hack and takes its laser.'),

  keys: () => art(`
    ${key(20, 22, 44, 'Esc', 'pause')}
    ${key(20, 80, 56, 'Tab', 'parts')}
    ${key(124, 80, 34, 'W')}
    ${key(86, 120, 34, 'A')}${key(124, 120, 34, 'S')}${key(162, 120, 34, 'D')}
    ${txt(141, 174, 'move (or arrows)', { size: 9.5 })}
    ${key(70, 190, 160, 'Space', '')}${txt(150, 246, 'grapple · pick up · use the lift', { size: 9.5 })}
    ${key(292, 120, 40, 'J', 'arm', Y)}${key(340, 120, 40, 'K', 'drive', Y)}${key(388, 120, 40, 'L', 'core', Y)}
    ${txt(360, 200, 'or Z  X  C', { size: 9.5 })}
    ${key(372, 22, 34, '+')}${key(414, 22, 34, '−')}${txt(410, 74, 'zoom', { size: 9.5 })}`,
  'The keyboard: W A S D to move, Space to grapple, J K L for arm, drive and core, Tab for parts, Escape to pause.', 256),

  pad: () => art(`
    <path d="M150 58Q240 44 330 58Q378 66 392 130Q404 190 368 196Q340 198 318 162H162Q140 198 112 196Q76 190 88 130Q102 66 150 58Z" fill="#11141d" stroke="${LINE}" stroke-width="2"/>
    <rect x="132" y="40" width="46" height="12" rx="6" fill="#171b28" stroke="${LINE}"/><rect x="302" y="40" width="46" height="12" rx="6" fill="#171b28" stroke="${LINE}"/>
    <circle cx="160" cy="98" r="15" fill="#171b28" stroke="${Y}" stroke-width="1.8"/><circle cx="276" cy="140" r="15" fill="#171b28" stroke="${Y}" stroke-width="1.8"/>
    <path d="M196 132h8v-8h8v8h8v8h-8v8h-8v-8h-8z" fill="#171b28" stroke="${LINE}"/>
    <rect x="232" y="88" width="16" height="8" rx="4" fill="#171b28" stroke="${LINE}"/>
    ${[['Y', 318, 82], ['X', 302, 98], ['B', 334, 98], ['A', 318, 114]].map(([b, x, y]) => `<circle cx="${x}" cy="${y}" r="8" fill="#171b28" stroke="${Y}" stroke-width="1.5"/>${txt(x, y + 3.5, b, { c: T, size: 9, cls: 'cap' })}`).join('')}
    <path d="M327 82H404M343 98H404M294 98Q290 128 404 122M327 114Q330 146 404 146" fill="none" stroke="${LINE}"/>
    ${txt(408, 85, 'Y  core', { a: 'start', c: T })}${txt(408, 101, 'B  drive', { a: 'start', c: T })}${txt(408, 125, 'X  arm', { a: 'start', c: T })}${txt(408, 149, 'A  grapple', { a: 'start', c: T })}
    <path d="M145 98H76" stroke="${LINE}"/>${txt(72, 101, 'move', { a: 'end', c: T })}
    <path d="M276 156V214" stroke="${LINE}"/>${txt(276, 228, 'aim: picks the target', { c: T })}
    <path d="M240 88V70" stroke="${LINE}"/>${txt(240, 64, 'pause', { c: T })}
    ${txt(155, 30, 'LB parts · LT drive', { c: T })}${txt(325, 30, 'RB core · RT arm', { c: T })}`,
  'A gamepad: left stick moves, right stick aims, A grapples, X arm, B drive, Y core.', 240),

  fight: () => art(`
    ${txt(120, 22, 'Lock-on', { c: Y, size: 12 })}
    ${klp(62, 176, 50)}
    ${droid(168, 92, 18, F, 220)}${bracket(168, 92, 28)}
    ${droid(188, 190, 15, F, 300, { op: 0.55 })}
    <path class="bolts" d="M74 166L152 106" stroke="${Y}" stroke-width="3" stroke-dasharray="7 9" stroke-linecap="round" filter="url(#glow)"/>
    ${txt(120, 238, 'The bracket picks your target', { c: T })}
    <path d="M240 18V232" stroke="${LINE}" stroke-dasharray="3 5"/>
    ${txt(360, 22, 'Shove', { c: Y, size: 12 })}
    ${wall(440, 40, 26, 180)}
    <path d="M296 130H392" stroke="${Y}" stroke-width="16" stroke-opacity="0.16" stroke-linecap="round"/>
    <path d="M300 130H386" stroke="${Y}" stroke-width="3" marker-end="url(#ah-y)" filter="url(#glow)"/>
    ${klp(280, 130, 90)}<circle cx="280" cy="130" r="20" fill="none" stroke="${Y}" stroke-width="2" stroke-dasharray="80 46" class="spin" filter="url(#glow)"/>
    ${droid(414, 130, 18, F, 250)}${star(400, 104)}${star(416, 100)}${star(430, 106)}
    ${burst(438, 130, 'Slam', G, -34)}
    <path d="M378 116h-14M376 144h-12" stroke="${F}" stroke-opacity="0.6" stroke-width="2"/>
    ${txt(360, 238, 'Into a wall: hurt and stunned', { c: T })}`,
  'Left: a cyan bracket marks the droid your arm will hit. Right: a charged shove sends a droid into a wall, which stuns it.'),

  dodge: () => art(`
    ${droid(78, 66, 18, F, 125, { barrel: true })}
    <g class="lane"><path d="M92 82L330 176" stroke="${F}" stroke-width="26" stroke-opacity="0.14" stroke-linecap="round"/>
    <path d="M92 82L330 176" stroke="${F}" stroke-width="1.4" stroke-dasharray="5 6" fill="none"/>
    ${[0.25, 0.45, 0.65, 0.85].map((t) => { const x = 92 + 238 * t, y = 82 + 94 * t; return `<path d="M${x - 6} ${y - 9}L${x + 4} ${y}L${x - 6} ${y + 9}" transform="rotate(21.5 ${x} ${y})" fill="none" stroke="${F}" stroke-width="2"/>`; }).join('')}</g>
    <circle class="bolt" cx="140" cy="101" r="5" fill="${F}" filter="url(#glow)" style="--dx:190px;--dy:75px"/>
    ${klp(330, 176, 300, { dash: true, op: 0.6 })}
    <path class="flow" d="M340 164Q368 132 378 112" fill="none" stroke="${Y}" stroke-width="2" stroke-dasharray="4 5" marker-end="url(#ah-y)"/>
    ${klp(386, 98, 300)}
    ${txt(196, 72, '1  A warning follows you', { c: F, a: 'start' })}
    ${txt(302, 210, '2  It stops: move', { c: T })}
    ${txt(420, 136, 'Swerve', { c: Y, a: 'start' })}
    ${droid(96, 196, 15, F, 0)}<circle cx="96" cy="196" r="42" fill="${F}" fill-opacity="0.08" stroke="${F}" stroke-dasharray="4 5"/>
    ${txt(96, 252, 'Teslas paint a ring', { c: F })}`,
  'A Spark paints a warning lane on the floor towards KLP-2. When it stops moving, KLP-2 swerves out of it before the bolt arrives. A Tesla paints a ring.', 262),

  hack: () => {
    const rows = [64, 94, 124, 154, 184, 214];
    const cells = [Y, F, Y, M, Y, F];
    const left = [true, false, true, false, true, false];
    const right = [false, true, false, false, false, true];
    return art(`
      <rect x="60" y="6" width="360" height="10" rx="5" fill="#141824" stroke="${LINE}"/>
      <rect x="60" y="6" width="200" height="10" rx="5" fill="${Y}" opacity="0.85"/><rect x="260" y="6" width="160" height="10" rx="5" fill="${F}" opacity="0.85"/>
      <path d="M240 2V20" stroke="${T}" stroke-width="2"/>
      ${txt(40, 15, 'You', { c: Y, a: 'end' })}${txt(440, 15, 'Them', { c: F, a: 'start' })}
      <rect x="20" y="40" width="440" height="192" rx="12" fill="#0b0e16" stroke="#2a3142"/>
      ${txt(100, 34, 'Your side', { c: Y })}${txt(240, 34, 'Cells', { c: T })}${txt(380, 34, 'Their side', { c: F })}
      ${rows.map((y, i) => `
        <path d="M44 ${y}H226" stroke="#4a3624" stroke-width="3"/>
        ${left[i] ? `<path d="M44 ${y}H226" stroke="${Y}" stroke-width="2.6" filter="url(#glow)"/>` : ''}
        <path d="M254 ${y}H436" stroke="#4a3624" stroke-width="3"/>
        ${right[i] ? `<path d="M254 ${y}H436" stroke="${F}" stroke-width="2.6" filter="url(#glow)"/>` : ''}
        <rect x="36" y="${y - 6}" width="12" height="12" rx="3" fill="${BODY}" stroke="${Y}"/><rect x="432" y="${y - 6}" width="12" height="12" rx="3" fill="${BODY}" stroke="${F}"/>
        <rect x="228" y="${y - 9}" width="24" height="18" rx="9" fill="${cells[i]}" fill-opacity="${cells[i] === M ? 0.15 : 0.75}" stroke="${cells[i]}" stroke-width="1.5"/>`).join('')}
      <path class="comet" d="M44 124H226" stroke="#fff" stroke-width="3" stroke-dasharray="14 240" stroke-linecap="round" filter="url(#glow)"/>
      <path d="M150 154V184" stroke="#8b93a6" stroke-width="2.4"/><circle cx="150" cy="154" r="4.5" fill="#8b93a6"/>
      <path d="M318 65h8a14 14 0 0 1 0 28h-8z" fill="#141924" stroke="#c8cfdc" stroke-width="1.6"/>
      <circle cx="360" cy="214" r="9" fill="none" stroke="${F}" stroke-width="2"/><path d="M360 205a9 9 0 0 1 0 18" fill="none" stroke="${Y}" stroke-width="2"/>
      ${txt(150, 145, 'fork', { size: 9 })}${txt(330, 112, 'and', { size: 9 })}
      ${[0, 1, 2].map((i) => `<circle cx="${50 + i * 14}" cy="248" r="5" fill="${Y}"/>`).join('')}${txt(100, 252, '3 pulses left', { c: Y, a: 'start' })}
      ${[0, 1, 2].map((i) => `<circle cx="${430 - i * 14}" cy="248" r="5" fill="${F}"/>`).join('')}${txt(380, 252, 'theirs', { c: F, a: 'end' })}`,
    'A hack board. Your wires on the left, theirs on the right, the column of cells in the middle. Three cells are cyan, two magenta, one empty. A bar across the top shows you ahead.', 262);
  },

  gates: () => {
    const cell = (cx, cy, glyph, name, line) => `<g>
      <rect x="${cx - 70}" y="${cy - 46}" width="140" height="98" rx="10" fill="#0b0e16" stroke="#2a3142"/>
      ${glyph}
      ${txt(cx, cy + 30, name, { c: T, size: 11 })}${txt(cx, cy + 43, line, { size: 9 })}</g>`;
    const wire = (x1, y1, x2, y2, c = Y) => `<path d="M${x1} ${y1}H${x2}${y2 != null ? `V${y2}` : ''}" stroke="${c}" stroke-width="2.4" fill="none" filter="url(#glow)"/>`;
    return art(`
      ${cell(85, 66, `${wire(35, 50, 85)}<path d="M85 40V60" stroke="${Y}" stroke-width="2.4" filter="url(#glow)"/><circle cx="85" cy="50" r="4.5" fill="${Y}"/>${wire(85, 40, 135)}${wire(85, 60, 135)}`, 'Fork', 'one pulse, two cells')}
      ${cell(240, 66, `${wire(190, 40, 222)}${wire(190, 60, 222, null, '#4a3624')}<path d="M222 34h8a16 16 0 0 1 0 32h-8z" fill="#141924" stroke="#c8cfdc" stroke-width="1.6"/>${wire(246, 50, 290, null, '#4a3624')}`, 'And', 'both wires at once')}
      ${cell(395, 66, `${wire(345, 50, 383)}<circle cx="395" cy="50" r="11" fill="none" stroke="${F}" stroke-width="2.4"/><path d="M395 39a11 11 0 0 0 0 22" fill="none" stroke="${Y}" stroke-width="2.4"/>${wire(407, 50, 445, null, F)}`, 'Invert', 'in yours, out theirs')}
      ${cell(85, 186, `${wire(35, 172, 76)}<rect x="76" y="168" width="18" height="13" rx="3" fill="${Y}" stroke="${Y}"/><path d="M79 168a6 6 0 0 1 12 0" fill="none" stroke="${Y}" stroke-width="2"/>${wire(94, 172, 135)}`, 'Lock', 'once lit, stays lit')}
      ${cell(240, 186, `${wire(190, 172, 290)}<rect x="226" y="160" width="28" height="22" rx="5" fill="#0b0e16"/>${txt(240, 178, '∞', { c: T, size: 16, cls: 'say' })}`, '∞ wire', 'costs no pulse')}
      ${cell(395, 186, `${wire(345, 172, 388)}<path d="M388 162V182M400 162V182" stroke="#8b93a6" stroke-width="2.4"/>${wire(400, 172, 445, null, '#4a3624')}`, 'Break', 'goes nowhere')}`,
    'The special parts of a board: fork, and gate, invert, lock, infinite wire and break.', 250);
  },

  parts: () => art(`
    ${droid(240, 122, 42, Y, 0)}
    <circle cx="240" cy="122" r="58" fill="none" stroke="${Y}" stroke-opacity="0.25" stroke-dasharray="3 6"/>
    <path d="M240 180V206" stroke="${LINE}"/>${icon('wheels', 240, 222, 1)}${txt(240, 250, 'Drive: how you move', { c: T })}
    <path d="M298 122H322" stroke="${LINE}"/>${icon('ram', 338, 122, 1)}${txt(356, 118, 'Arm', { c: T, a: 'start' })}${txt(356, 132, 'what you hit with', { a: 'start' })}
    <path d="M182 122H144" stroke="${LINE}"/>${icon('empty', 126, 122, 1, M)}${txt(106, 118, 'Core', { c: T, a: 'end' })}${txt(106, 132, 'a trick', { a: 'end' })}
    ${txt(240, 26, 'Three sockets', { c: Y, size: 12 })}`,
  'KLP-2 seen from above with its three sockets: drive below, arm to the right, core to the left.', 262),

  rooms: () => art(`
    ${txt(120, 22, 'Room prize', { c: Y, size: 12 })}
    <rect x="70" y="64" width="100" height="100" rx="8" fill="#0b0e16" stroke="${LINE}" stroke-width="2"/>
    ${[90, 110, 130, 150].map((x) => `<path d="M${x} 64V164" stroke="#5a6278" stroke-width="2.4"/>`).join('')}
    <path class="pulse" d="M120 96l17 10v20l-17 10-17-10v-20z" fill="${G}" fill-opacity="0.25" stroke="${G}" stroke-width="2" filter="url(#glow)"/>
    <rect x="110" y="158" width="20" height="15" rx="3" fill="${BODY}" stroke="${M}" stroke-width="1.6"/><path d="M114 158a6 6 0 0 1 12 0" fill="none" stroke="${M}" stroke-width="1.6"/>
    ${droid(38, 120, 14, F, 60)}${droid(204, 52, 14, F, 200)}
    ${txt(120, 214, 'Opens when the room\'s', { c: T })}${txt(120, 228, 'droids are dealt with', { c: T })}
    <path d="M240 18V232" stroke="${LINE}" stroke-dasharray="3 5"/>
    ${txt(360, 22, 'Bounty', { c: G, size: 12 })}
    <rect x="344" y="30" width="32" height="100" fill="${G}" opacity="0.09"/>
    <circle cx="360" cy="140" r="40" fill="none" stroke="${G}" stroke-width="2.2" stroke-dasharray="10 6" class="spin" filter="url(#glow)"/>
    ${droid(360, 140, 24, G, 210, { fill: '#2a2110' })}
    <rect x="320" y="58" width="80" height="20" rx="10" fill="#2a2110" stroke="${G}"/>${txt(360, 72, 'Grudge', { c: G, size: 11 })}
    ${txt(360, 214, 'Better parts, scrap', { c: T })}${txt(360, 228, 'and a firmware chip', { c: T })}`,
  'Left: a prize in a cage, guarded by two droids. Right: a bounty droid in a gold ring, with its name above it.'),

  gang: () => art(`
    ${klp(150, 140, 90)}
    ${droid(98, 104, 15, Y, 100, { fill: '#0c1f26' })}${droid(90, 176, 15, Y, 80, { fill: '#0c1f26' })}
    <path d="M110 112Q130 124 138 132M104 168Q126 156 138 148" fill="none" stroke="${Y}" stroke-opacity="0.5" stroke-dasharray="3 4"/>
    ${droid(370, 132, 20, F, 270)}
    <path class="bolts" d="M166 138L346 132" stroke="${Y}" stroke-width="3" stroke-dasharray="7 9" stroke-linecap="round" filter="url(#glow)"/>
    <path class="bolts" d="M112 100Q250 60 352 120" fill="none" stroke="${Y}" stroke-width="2.4" stroke-dasharray="6 10" stroke-linecap="round" filter="url(#glow)"/>
    <rect x="28" y="40" width="128" height="26" rx="8" fill="#0c1f26" stroke="${Y}"/><path d="M80 66l10 12 4-12" fill="#0c1f26" stroke="${Y}"/>
    ${txt(92, 57, 'Where to, boss?', { c: Y, cls: 'say', size: 10.5 })}
    ${txt(240, 222, 'They follow you and fight for you', { c: T })}`,
  'KLP-2 with two turned droids, now cyan, following it and firing at a hostile droid.'),

  scrap: () => art(`
    ${[[-30, -22], [26, -30], [34, 18], [-24, 26], [4, -40]].map(([dx, dy], i) => `<path d="M${110 + dx} ${110 + dy}l${i % 2 ? 7 : -6} ${i % 2 ? -4 : 5}" stroke="${F}" stroke-width="3" stroke-linecap="round"/>`).join('')}
    ${burst(110, 110, 'Wreck', F, -50)}
    ${[[150, 80, 200, 150], [160, 120, 205, 160], [130, 150, 196, 172]].map(([x1, y1, x2, y2]) => `<path d="M${x1} ${y1}Q${(x1 + x2) / 2 + 20} ${y1 - 20} ${x2} ${y2}" fill="none" stroke="${G}" stroke-opacity="0.6" stroke-dasharray="3 4"/><path d="M${x1} ${y1 - 6}l5 3v6l-5 3-5-3v-6z" fill="${G}" fill-opacity="0.3" stroke="${G}"/>`).join('')}
    ${klp(222, 172, 60)}
    ${txt(150, 206, 'Roll over it to pick it up', { c: T })}
    <rect x="300" y="36" width="150" height="104" rx="10" fill="#11131a" stroke="#ffd25a" stroke-width="2"/>
    <rect x="312" y="48" width="126" height="80" rx="6" fill="#1a1608"/>
    <rect x="344" y="70" width="14" height="10" rx="2" fill="#ffd25a"/><rect x="392" y="70" width="14" height="10" rx="2" fill="#ffd25a"/><path d="M356 104h40" stroke="#ffd25a" stroke-width="3" stroke-linecap="round"/>
    ${[['Repair', '12'], ['Spot weld', '8'], ['Upgrade', '30']].map(([a, b], i) => `${txt(312, 162 + i * 18, a, { c: T, a: 'start' })}${txt(450, 162 + i * 18, `${b} scrap`, { c: '#ffd25a', a: 'end' })}`).join('')}
    ${txt(375, 28, 'Ledger, at a fabricator', { c: '#ffd25a' })}`,
  'A wrecked droid bursts into scrap that KLP-2 picks up. Ledger sells repairs and upgrades for scrap at a fabricator.', 222),

  heap: () => {
    const slabs = [{ name: 'The Heap', ink: 0xffa040 }, ...DECKS];
    return art(`
      ${slabs.map((d, i) => { const y = 22 + i * 34; return `<rect x="100" y="${y}" width="200" height="22" rx="5" fill="${hex(d.ink)}" fill-opacity="${i ? 0.16 : 0.28}" stroke="${hex(d.ink)}"/>${txt(90, y + 15, d.name, { c: hex(d.ink), a: 'end' })}`; }).join('')}
      <path d="M330 236V34H300" fill="none" stroke="${LINE}" stroke-width="10" stroke-linejoin="round"/>
      <path d="M330 236V34H300" fill="none" stroke="#0b0e16" stroke-width="6" stroke-linejoin="round"/>
      ${[0, 1, 2, 3].map((i) => `<rect class="rise" x="326" y="220" width="8" height="8" rx="2" fill="${Y}" filter="url(#glow)" style="animation-delay:${-i * 0.6}s"/>`).join('')}
      ${txt(346, 140, 'The chute', { c: T, a: 'start' })}${txt(346, 154, 'data goes up,', { a: 'start' })}${txt(346, 168, 'whatever happens', { a: 'start' })}${txt(346, 182, 'to you', { a: 'start' })}
      ${droid(280, 33, 8, '#ffa64a', 270)}${txt(266, 37, 'Nan', { c: '#ffa64a', a: 'end' })}`,
    'The tower in cross-section: the Heap at the top, six decks below it, and the scrap chute running from the bottom back up to the Heap, carrying data.', 262);
  },

  daily: () => {
    const sq = (x, c, o = {}) => `<rect x="${x}" y="96" width="44" height="44" rx="8" fill="${c}" fill-opacity="${o.op ?? 0.7}" stroke="${c}"/>`;
    return art(`
      ${DECKS.slice(0, 3).map((d, i) => sq(90 + i * 52, hex(d.ink))).join('')}
      ${burst(90 + 3 * 52 + 22, 118, '', F, 0)}
      ${sq(90 + 4 * 52, '#262b38', { op: 1 })}${sq(90 + 5 * 52, '#262b38', { op: 1 })}
      ${txt(240, 70, 'KLEPTO · today\'s tower', { c: T, size: 12 })}
      ${txt(240, 172, 'Deck 4 · 9 hacked · 3 ring-outs · 7:42', { c: M, cls: 'say', size: 11 })}
`,
  'A row of squares to share: three decks cleared, destroyed on deck four.', 236);
  },
};

// ---------------------------------------------------------------- the chapters

const K = (s) => `<kbd>${s}</kbd>`;

function chapters(input) {
  const L = (a) => K(input.label(a));
  const partsChart = SLOTS.map((slot) => `<section><h4>${SLOT_NAMES[slot]}</h4><ul class="parts">${
    Object.entries(MODULES).filter(([, m]) => m.slot === slot).map(([id, m]) => `<li>${iconSvg(id, 22)}<span><b>${m.name}${m.starter ? ' <small>you start with this</small>' : ''}</b>${m.line}</span></li>`).join('')
  }</ul></section>`).join('');
  return [
    {
      key: 'idea', title: 'The idea', sub: 'Grapple, hack, steal', ink: Y,
      lede: 'You are KLP-2, a small droid in a tower full of bigger ones. You can\'t win a straight fight, so you steal.',
      art: ART.idea(), cap: 'Every droid is built from the parts it carries: what you see on it is what you get.',
      body: `<p>Get close and grapple a droid to start a hack. Win, and you can take one of its parts.</p>
        <p>Each deck has a lift down. It stays locked until you take the deck's <b>◆ command droid</b>, by hack or by force.</p>
        <p class="tip"><b>Start here.</b> Your first hacks are small boards that bring in one new idea at a time. Mites don't fight back, so practise on them.</p>`,
    },
    {
      key: 'controls', title: 'Controls', sub: 'Keyboard and gamepad', ink: Y,
      lede: 'Move with one hand, use your parts with the other. Up is always up the screen.',
      art: ART.keys(), cap: `${L('loadout')} shows your parts and firmware. ${L('pause')} pauses.`,
      art2: ART.pad(), cap2: 'A gamepad works too, and its right stick picks what your arm aims at.',
      body: `<ul class="points">
        <li>${K('Space')} grapples a droid or terminal, picks things up and uses the lift.</li>
        <li>${K('J')} or ${K('Z')} uses your arm: fire, discharge, pull. With the Bumper you start with, tap to jab or hold to wind up a shove.</li>
        <li>${K('K')} or ${K('X')} uses your drive. Wheels swerve, thrusters dash, hover floats, treads stamp.</li>
        <li>${K('L')} or ${K('C')} uses your core: shield, cloak or phase.</li>
      </ul>`,
    },
    {
      key: 'fighting', title: 'Fighting', sub: 'Lock-on, shoves, slams', ink: F,
      lede: 'Most fights are won by putting a droid somewhere it doesn\'t want to be.',
      art: ART.fight(), cap: 'You fire at the bracketed droid whichever way you\'re rolling, so you can back off and shoot.',
      body: `<ul class="points">
        <li>A cyan bracket marks the droid your arm will hit. Standing still, it picks the nearest; moving, it picks what's ahead. The right stick picks on a gamepad.</li>
        <li>Hold the arm button with the Bumper to wind up a shove; an arrow on the floor shows where it will go. Let go to launch.</li>
        <li>Shove a droid off an edge for a ring-out, worth double scrap. Into a wall, it's slammed: hurt and stunned. Into another droid, both get it.</li>
        <li>A stunned droid takes double damage.</li>
        <li>The two marks on a droid's health bar are its dent points. Below each one it hacks back with a pulser fewer.</li>
      </ul>
      <p class="tip"><b>Wreck or hack?</b> Destroy a droid and its parts are lost. Hack it and they're yours.</p>`,
    },
    {
      key: 'dodging', title: 'Staying alive', sub: 'Warnings and swerves', ink: F,
      lede: 'Nothing in the tower attacks without warning you first. Learn to read the floor.',
      art: ART.dodge(), cap: 'The warning follows you until a moment before the attack, then holds still.',
      body: `<ul class="points">
        <li>Lasers paint a lane, arcs and stamps paint a ring, dashes paint their path.</li>
        <li>When the warning stops moving, get out of it.</li>
        <li>On wheels, ${K('K')} swerves: a quick sidestep that bolts and rams pass straight through. A dash slips past bolts for its first moment too.</li>
        <li>A ! over a droid means it has seen you; a ? means it has given up looking. Two droids chatting are less watchful.</li>
      </ul>`,
    },
    {
      key: 'hack', title: 'The hack', sub: 'The circuit duel', ink: Y,
      lede: 'Two sides of a circuit fight over the column of cells in the middle. Own more cells when the clock runs out and you win.',
      art: ART.hack(), cap: 'The bar across the top shows who owns more cells right now. Get your colour past the middle mark.',
      body: `<ul class="points">
        <li>First pick a side: the one whose wires run cleaner.</li>
        <li>Then fire pulses down your wires. A powered cell takes your colour.</li>
        <li>The dots by your name are your pulses, one a shot. Theirs are on the other side. The fuse and the clock are the time left.</li>
        <li>The wire you've picked shows a faint trail in the colour it would paint.</li>
        <li>Win by four cells or more and it's a clean hack: take two parts.</li>
      </ul>
      <p class="tip"><b>While you're learning</b>, each wire's arrow is coloured by where it lands: your colour, theirs, or grey for nowhere. Turn on Wire hints in the settings to keep them.</p>`,
    },
    {
      key: 'gates', title: 'Board parts', sub: 'Forks, gates, inverts', ink: Y,
      lede: 'Harder boards add parts to the wires. Each one changes where a pulse ends up.',
      art: ART.gates(), cap: 'Each part arrives on its own lesson board the first time you meet it.',
      body: `<ul class="points">
        <li><b>Forks</b> split one pulse to reach two cells.</li>
        <li><b>And gates</b> need two wires lit at the same time.</li>
        <li><b>Inverts</b> paint the other side's colour. The ring is split: in one colour, out the other.</li>
        <li><b>Locks</b> stay lit once lit, so the cell stays painted.</li>
        <li><b>∞ wires</b> cost no pulse. <b>Breaks</b> go nowhere.</li>
      </ul>`,
    },
    {
      key: 'parts', title: 'Parts', sub: 'Drive, arm and core', ink: Y,
      lede: 'KLP-2 has three sockets. Taking a part drops the old one at your feet, so you can swap back.',
      art: ART.parts(), cap: 'A part\'s grade comes from the class of the droid you took it from.',
      body: `<p>Sealed vaults need the right part: thrusters for a gap, treads for a heavy crate, phase for a field. The way down never does.</p>
        <div class="chart">${partsChart}</div>`,
    },
    {
      key: 'rooms', title: 'Prizes and bounties', sub: 'Worth the trouble', ink: G,
      lede: 'Every room with droids in it holds a prize, and every deck has a droid with a price on its head.',
      art: ART.rooms(), cap: 'The map shows each room\'s prize as a dot, hollow until it\'s open.',
      body: `<ul class="points">
        <li>A room's prize sits in a cage: scrap, a repair kit, a parts cache or firmware. Deal with every droid from that room, by hack, wreck or turning, and the cage opens.</li>
        <li>One droid on each deck has a name, a brass shell and parts two grades better than its class. Static names it on the radio as the deck starts. Take it down, by hack or by force, for scrap and a firmware chip.</li>
        <li>Once you've been at it a while, KLP-1, the KLP before you, starts turning up. Beat it in a hack three times, across as many runs as it takes, and you can bring it home.</li>
      </ul>`,
    },
    {
      key: 'gang', title: 'Your gang', sub: 'Turning droids', ink: Y,
      lede: 'After a won hack you can turn the droid instead of taking a part.',
      art: ART.gang(), cap: 'A turned droid goes cyan and keeps its parts.',
      body: `<p>It follows you, fights for you and rides the lift down with you. You can have up to three at a time.</p>`,
    },
    {
      key: 'scrap', title: 'Scrap and Ledger', sub: 'Spending it', ink: '#ffd25a',
      lede: 'Wrecked droids burst into scrap, which KLP-2 picks up as it rolls past. Scrap lasts for the run.',
      art: ART.scrap(), cap: 'There\'s a fabricator near every lift.',
      body: `<ul class="points">
        <li>Win a hack and you can strip the droid for scrap instead of taking a part.</li>
        <li>At a fabricator, Ledger sells repairs, spot welds and spare cells (small boosts for this run), better grades of the parts you carry, and firmware.</li>
      </ul>`,
    },
    {
      key: 'heap', title: 'The Heap, and data', sub: 'Getting stronger', ink: '#ffa64a',
      lede: 'When KLP-2 is destroyed, its bits go up the scrap chute to the Heap, where Nan rebuilds it.',
      art: ART.heap(), cap: 'Data reaches Nan whatever happens to you. Scrap doesn\'t.',
      body: `<ul class="points">
        <li>Hacking downloads data. Spend it on Nan's bench for small, permanent upgrades.</li>
        <li>Nan keeps every part you've ever stolen: take one down the chute with you.</li>
        <li>Fill in a page of the droid archive, by hacking three of a family, and it sends data up too.</li>
        <li>Static talks to you on the radio as each deck starts.</li>
      </ul>`,
    },
    {
      key: 'daily', title: 'Today\'s tower', sub: 'One go a day', ink: Y,
      lede: 'The same five decks for everyone, all day, with the same kit.',
      art: ART.daily(), cap: 'Only your first go counts, and you get a line of squares to share.',
      body: '<p>No bench upgrades and no starting part: everyone starts level.</p>',
    },
  ];
}

export class Manual {
  constructor(ui) {
    this.ui = ui;
    this.book = new Book('howto');
    this.last = null;
    this.book.onTurn = (k) => { this.last = k; };
    // the next and previous buttons at the foot of each page
    this.book.page.addEventListener('click', (e) => {
      const b = e.target.closest('[data-go]');
      if (!b) return;
      this.book.turn(b.dataset.go);
      this.book.focusTab();
    });
  }

  open(input) {
    const ch = chapters(input);
    this.ui.show('howto', { push: true, focus: '[aria-selected="true"]' });
    this.book.fill([{
      title: 'Chapters',
      items: ch.map((c, i) => ({ key: c.key, label: c.title, sub: c.sub, style: `--ink:${c.ink}`, thumb: `<span class="ch-no">${String(i + 1).padStart(2, '0')}</span>` })),
    }], (k) => this.page(ch, k), this.last || 'idea');
  }

  page(ch, k) {
    const i = ch.findIndex((c) => c.key === k), c = ch[i];
    const prev = ch[i - 1], next = ch[i + 1];
    return `<div class="chapter" style="--ink:${c.ink}">
      <header><p class="kicker">Chapter ${String(i + 1).padStart(2, '0')}</p><h3 class="entry-name">${c.title}</h3><p class="entry-lede">${c.lede}</p></header>
      <figure class="art">${c.art}<figcaption>${c.cap}</figcaption></figure>
      ${c.art2 ? `<figure class="art">${c.art2}<figcaption>${c.cap2}</figcaption></figure>` : ''}
      <div class="chapter-body">${c.body}</div>
      <nav class="chapter-nav" aria-label="More chapters">
        ${prev ? `<button type="button" data-go="${prev.key}">← ${prev.title}</button>` : '<span></span>'}
        ${next ? `<button type="button" data-go="${next.key}">${next.title} →</button>` : ''}
      </nav>
    </div>`;
  }
}
