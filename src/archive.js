// The droid archive, as a field guide: book.js lays out the index and the
// page, story/fieldguide.js holds what's written on them, and
// render/studio.js takes the pictures. Droid pages show the real model
// turning on a plinth; the cast's pages show their portraits.
import { Book } from './book.js';
import { Studio } from './render/studio.js';
import { saveMeta } from './meta.js';
import { FAMILIES } from './world/roster.js';
import { MODULES, SLOT_NAMES, iconSvg } from './world/modules.js';
import { CAST } from './story/cast.js';
import { drawPortrait } from './story/portrait.js';
import { GUIDE, DROIDS, PEOPLE, BIOS, COMPLETE, tier, quotes, specs, decksFor, homeDeck, met, heardLines, sayings } from './story/fieldguide.js';
import { dataFor } from './progress.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const thumbs = new Map();   // index pictures, kept for the session
const PORTRAIT = 220;

export class Archive {
  constructor(ui) {
    this.ui = ui;
    this.screen = document.getElementById('screen-archive');
    this.book = new Book('archive');
    this.book.onTurn = (key, page) => this.onTurn(key, page);
    this.last = null;
    this.pending = [];
    this.raf = 0;
  }

  get reduced() { return document.body.classList.contains('reduced'); }

  open(meta) {
    this.meta = meta;
    meta.read = meta.read || {};
    const seen = DROIDS.filter((k) => tier(meta, k) > 0).length;
    const done = DROIDS.filter((k) => tier(meta, k) >= 3).length;
    const people = PEOPLE.filter((k) => met(meta, k)).length;
    document.getElementById('archive-lede').textContent =
      `${seen} of ${DROIDS.length} droids on file · ${done} page${done === 1 ? '' : 's'} complete · ${people} of ${PEOPLE.length} people met`;
    this.ui.show('archive', { push: !!this.ui.screen, focus: '[aria-selected="true"]' });
    this.pending = DROIDS.filter((k) => !thumbs.has(this.thumbKey(k)));
    const start = [...DROIDS, ...PEOPLE].find((k) => this.isNew(k)) || this.last || DROIDS[0];
    this.book.fill([
      { title: 'Droids', items: DROIDS.map((k) => this.droidTab(k)) },
      { title: 'People', items: PEOPLE.map((k) => this.personTab(k)) },
    ], (k) => this.page(k), start);
    this.loop();
  }

  // ---------------------------------------------------------------- the index

  // What a page holds now, as a number that only goes up: when it's higher
  // than when you last looked, the page is marked new.
  stamp(k) {
    const m = this.meta;
    if (FAMILIES[k] && !FAMILIES[k].rival) return tier(m, k);
    if (!met(m, k)) return 0;
    return 1 + heardLines(m, k).got.length + (k === 'klp1' ? (m.klp1Wins || 0) + (m.klp1Turned ? 1 : 0) : 0);
  }

  isNew(k) { const s = this.stamp(k); return s > 0 && s > (this.meta.read[k] || 0); }

  thumbKey(k) { return `${k}:${tier(this.meta, k) ? 'lit' : 'dark'}`; }

  thumbImg(key) {
    const src = thumbs.get(key);
    return src ? `<img src="${src}" alt="" width="48" height="48">` : '<i class="thumb-wait"></i>';
  }

  flag(k, progress) {
    if (this.isNew(k)) return '<span class="new">New</span>';
    if (progress == null) return '';
    if (progress >= COMPLETE) return '<span class="done">✓</span>';
    return `<span class="ticks">${Array.from({ length: COMPLETE }, (_, i) => `<i${i < progress ? ' class="on"' : ''}></i>`).join('')}</span>`;
  }

  droidTab(k) {
    const F = FAMILIES[k], t = tier(this.meta, k), a = this.meta.archive[k] || {};
    const h = Math.min(COMPLETE, a.hacked || 0);
    const state = t === 0 ? 'Not yet seen' : t === 3 ? 'Page complete' : `Hacked ${h} of ${COMPLETE}`;
    return {
      key: k, label: t ? F.name : '???', sub: t ? F.role : `Class ${F.min}–${F.max}`,
      thumb: this.thumbImg(this.thumbKey(k)), dim: !t, style: `--ink:${hex(homeDeck(k).ink)}`,
      flag: this.flag(k, t ? h : null),
      aria: `${t ? `${F.name}, ${F.role.toLowerCase()}` : `Unknown droid, class ${F.min} to ${F.max}`}. ${state}.${this.isNew(k) ? ' New.' : ''}`,
    };
  }

  personTab(k) {
    const C = CAST[k], ok = met(this.meta, k);
    const key = `${k}:${ok ? 'lit' : 'dark'}`;
    if (!thumbs.has(key)) {
      const c = document.createElement('canvas');
      drawPortrait(c, k, 0, 48, !ok);
      thumbs.set(key, c.toDataURL());
    }
    return {
      key: k, label: ok ? C.name : '???', sub: ok ? C.role : 'Not met yet',
      thumb: this.thumbImg(key), dim: !ok, style: `--ink:${C.colour}`, flag: this.flag(k, null),
      aria: `${ok ? `${C.name}, ${C.role.toLowerCase()}` : 'Someone you haven\'t met'}.${this.isNew(k) ? ' New.' : ''}`,
    };
  }

  // ---------------------------------------------------------------- pages

  page(k) {
    return FAMILIES[k] && !FAMILIES[k].rival ? this.droidPage(k) : this.personPage(k);
  }

  droidPage(k) {
    const m = this.meta, F = FAMILIES[k], G = GUIDE[k], t = tier(m, k), a = m.archive[k] || {};
    const deck = homeDeck(k), n = DROIDS.indexOf(k) + 1, no = String(n).padStart(2, '0');
    const chips = decksFor(k).map((d) => `<span class="chip" style="--c:${hex(d.ink)}">${esc(d.name)}</span>`).join('');
    const style = `--ink:${hex(deck.ink)}`;
    if (!t) {
      return `<div class="entry unseen" style="${style}">
        <figure class="plate"><div class="plate-stage"></div><figcaption>Plate ${n}. Not yet seen: only its outline is on file.</figcaption></figure>
        <header class="entry-head">
          <p class="kicker">No. ${no} · Unknown</p>
          <h3 class="entry-name">???</h3>
          <p class="entry-meta">Class ${F.min}–${F.max}</p>
          <p class="entry-lede">Not yet seen. A droid goes in the archive the first time KLP-2 gets a good look at one.</p>
          <p class="entry-where"><span>Look on</span>${chips}</p>
        </header>
      </div>`;
    }
    const h = Math.min(COMPLETE, a.hacked || 0);
    const slots = [['drive', F.drive || 'wheels'], ['arm', F.arm || 'ram'], ['core', F.core]];
    const parts = t >= 2
      ? slots.map(([slot, id]) => {
        if (!id) return `<li class="none">${iconSvg('empty', 22)}<span><b>${SLOT_NAMES[slot]}</b>Nothing fitted.</span></li>`;
        const M = MODULES[id];
        return `<li class="${M.starter ? 'starter' : ''}">${iconSvg(id, 22)}<span><b>${SLOT_NAMES[slot]}: ${esc(M.name)}</b>${M.starter ? 'Nothing to steal: you have one.' : esc(M.line)}</span></li>`;
      }).join('')
      : slots.map(([slot]) => `<li class="unknown">${iconSvg('empty', 22)}<span><b>${SLOT_NAMES[slot]}</b>Hack one to read it.</span></li>`).join('');
    const sheet = specs(k).map(([l, v]) => `<dt>${l}</dt><dd>${esc(v)}</dd>`).join('');
    const pips = Array.from({ length: COMPLETE }, (_, i) => `<i${i < h ? ' class="on"' : ''}></i>`).join('');
    const left = COMPLETE - h;
    const cls = a.best || F.min;
    return `<div class="entry tier-${t}" style="${style}">
      <figure class="plate"><div class="plate-stage"></div><figcaption>Plate ${n}. A ${esc(F.name)}, class ${cls}, in ${esc(deck.name)} colours.${this.reduced ? '' : ' Drag to turn it.'}</figcaption></figure>
      <header class="entry-head">
        ${t >= 3 ? '<p class="stamp" aria-label="Page complete">Complete</p>' : ''}
        <p class="kicker">No. ${no} · ${esc(F.role)}</p>
        <h3 class="entry-name">${esc(F.name)}</h3>
        <p class="entry-meta">Class ${F.min}–${F.max}</p>
        <p class="entry-lede">${esc(F.blurb)}</p>
        <p class="entry-where"><span>Found on</span>${chips}</p>
      </header>
      <div class="notes">
        <aside class="note" style="--who:${CAST.nan.colour}" aria-label="Nan's note"><span class="note-by">Nan</span>${esc(G.nan)}</aside>
        ${t >= 3 ? `<aside class="note later" style="--who:${CAST.nan.colour}" aria-label="Nan's second note"><span class="note-by">Nan, later</span>${esc(G.nan2)}</aside>` : ''}
      </div>
      <div class="entry-cols">
        <section><h4>Manner</h4><p class="temper">${esc(G.temper)}</p><p>${esc(G.habits)}</p></section>
        <section><h4>Overheard</h4><ul class="quotes">${quotes(k, t >= 3 ? 5 : t >= 2 ? 3 : 1).map((q) => `<li>${esc(q)}</li>`).join('')}</ul></section>
        <section><h4>Parts</h4><ul class="parts">${parts}</ul></section>
        <section><h4>How to take one</h4>${t >= 2 ? `<p>${esc(G.tip)}</p>` : '<p class="locked">Hack one to find out.</p>'}</section>
        <section><h4>Specifications</h4>${t >= 2 ? `<dl class="sheet">${sheet}</dl>` : '<p class="locked">Hack one to read them.</p>'}</section>
        <section class="record"><h4>Your record</h4>
          <p class="ticks big" aria-label="Hacked ${h} of ${COMPLETE}">${pips}</p>
          <p>${t >= 3 ? 'Page complete. Nan has added a note.' : `Hack ${left} more to complete this page. A complete page sends ${dataFor('page')} data up the chute.`}</p>
          <p class="tally">Hacked ${a.hacked || 0} · destroyed ${a.destroyed || 0}${a.best ? ` · best class ${a.best}` : ''}</p>
        </section>
      </div>
    </div>`;
  }

  personPage(k) {
    const m = this.meta, C = CAST[k], P = BIOS[k], ok = met(m, k);
    const style = `--ink:${C.colour}`;
    if (!ok) {
      return `<div class="entry person unseen" style="${style}">
        <figure class="plate likeness"><canvas id="archive-portrait" aria-hidden="true"></canvas><figcaption>Not met yet.</figcaption></figure>
        <header class="entry-head">
          <p class="kicker">People</p>
          <h3 class="entry-name">???</h3>
          <p class="entry-lede">Not met yet. ${esc(P.find)}</p>
        </header>
      </div>`;
    }
    const { got, total } = heardLines(m, k);
    const note = k === 'klp1' && m.klp1Turned ? P.home : P.note;
    const say = sayings(k, m);
    let extra = '';
    if (k === 'klp1') {
      const w = Math.min(3, m.klp1Wins || 0);
      extra = `<section><h4>Parts</h4><ul class="parts">${['thrusters', 'laser', 'shield'].map((id) => `<li>${iconSvg(id, 22)}<span><b>${SLOT_NAMES[MODULES[id].slot]}: ${MODULES[id].name}</b>${esc(MODULES[id].line)}</span></li>`).join('')}</ul></section>
        <section class="record"><h4>Your record</h4>
          <p class="ticks big" aria-label="Beaten in a hack ${w} of 3 times">${[0, 1, 2].map((i) => `<i${i < w ? ' class="on"' : ''}></i>`).join('')}</p>
          <p>${m.klp1Turned ? 'Beaten three times, and brought home. It lives in the Heap now.' : `Met ${m.klp1Met} time${m.klp1Met === 1 ? '' : 's'}. Beat it in a hack ${3 - w} more time${3 - w === 1 ? '' : 's'} and you can bring it home.`}</p>
        </section>`;
    }
    return `<div class="entry person" style="${style}">
      <figure class="plate likeness"><canvas id="archive-portrait" aria-hidden="true"></canvas><figcaption>${esc(C.name)}. ${esc(C.role)}.</figcaption></figure>
      <header class="entry-head">
        <p class="kicker">People · ${esc(C.role)}</p>
        <h3 class="entry-name">${esc(C.name)}</h3>
        <p class="entry-meta">${esc(P.where)}</p>
        <p class="entry-lede">${esc(P.bio)}</p>
      </header>
      <div class="notes">
        <aside class="note" style="--who:${CAST[note.by].colour}" aria-label="${esc(CAST[note.by].name)}'s note"><span class="note-by">${esc(CAST[note.by].name)}</span>${esc(note.text)}</aside>
      </div>
      <div class="entry-cols">
        ${extra}
        ${say.length ? `<section><h4>Often heard</h4><ul class="${k === 'mainframe' ? 'quotes' : 'said'}">${say.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></section>` : ''}
        ${total ? `<section class="wide"><h4>What ${esc(C.name)} has told you</h4>
          <p class="tally">${got.length} of ${total} heard${got.length < total ? '. There\'s more to hear.' : '. That\'s everything, for now.'}</p>
          ${got.length ? `<ul class="said told">${got.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}</section>` : ''}
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------- pictures

  spec(k) {
    const F = FAMILIES[k], a = this.meta.archive[k] || {};
    return { shape: F.shape, scale: 1, shell: 0x555b6b, label: String(a.best || F.min), drive: F.drive || 'wheels', arm: F.arm, core: F.core, family: k };
  }

  onTurn(k, page) {
    this.last = k;
    const s = this.stamp(k);
    if (s > (this.meta.read[k] || 0)) {
      this.meta.read[k] = s;
      saveMeta(this.meta);
      const tab = this.book.tab(k);
      if (tab) {
        const isDroid = FAMILIES[k] && !FAMILIES[k].rival;
        const f = tab.querySelector('.book-flag');
        const html = this.flag(k, isDroid && tier(this.meta, k) ? Math.min(COMPLETE, (this.meta.archive[k] || {}).hacked || 0) : null);
        if (f) { if (html) f.innerHTML = html; else f.remove(); }
        tab.setAttribute('aria-label', (tab.getAttribute('aria-label') || '').replace(' New.', ''));
      }
    }
    const stage = page.querySelector('.plate-stage');
    if (!stage) return;
    try {
      this.studio = this.studio || new Studio();
    } catch {
      stage.classList.add('no-gl');
      return;
    }
    stage.appendChild(this.studio.canvas);
    const t = tier(this.meta, k);
    this.studio.pose(this.spec(k), homeDeck(k).ink, t === 0);
    this.studio.still = this.reduced;
    this.dirty = true;
  }

  // Draws while the archive is open: the turning model or the portrait,
  // and one index picture a frame until they're all done.
  loop() {
    if (this.raf) return;
    let last = null;
    const tick = (now) => {
      if (this.screen.hidden) { this.raf = 0; return; }
      // the first frame's timestamp can be older than the last one
      const dt = last == null ? 0 : Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      this.thumbStep();
      const page = this.book.page;
      const stage = page.querySelector('.plate-stage');
      const st = this.studio;
      if (st && stage && st.canvas.parentNode === stage) {
        if (st.setSize(stage.clientWidth, stage.clientHeight)) this.dirty = true;
        if (!st.still || st.held || this.dirty) { st.frame(st.still ? 0 : dt); this.dirty = false; }
      }
      const pc = page.querySelector('#archive-portrait');
      if (pc) drawPortrait(pc, this.book.current, this.reduced ? 0 : now / 1000, PORTRAIT, !met(this.meta, this.book.current));
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  thumbStep() {
    const k = this.pending.shift();
    if (!k) return;
    const key = this.thumbKey(k);
    if (!thumbs.has(key)) {
      try {
        this.thumbStudio = this.thumbStudio || new Studio();
        thumbs.set(key, this.thumbStudio.snapshot(this.spec(k), homeDeck(k).ink, tier(this.meta, k) === 0));
      } catch { return; }
    }
    this.book.setThumb(k, this.thumbImg(key));
  }
}
