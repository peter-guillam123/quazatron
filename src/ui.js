// The DOM side: HUD, menus, cards, minimap, labels over droids, toasts and
// hints. Menus are real buttons, so they work with a keyboard, a screen
// reader or a gamepad (which moves the focus for you).
import { MODULES, SLOTS, SLOT_NAMES, iconSvg, moduleLabel, roman, statLine } from './world/modules.js';
import { CAST } from './story/cast.js';
import { drawPortrait } from './story/portrait.js';
import { BENCH, rank, nextCost, benchNow } from './progress.js';
import { FAMILIES, FAMILY_ORDER } from './world/roster.js';
import { PERKS } from './perks.js';
import { PLAYER_HEX } from './config.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class UI {
  constructor(game) {
    this.game = game;
    this.screen = null;
    this.stack = [];
    this.labels = [];
    this.bubbles = [];
    this.toastEls = [];
    this.hintT = 0;
    this.el = {
      hud: $('#hud'), integrity: $('#bar-integrity'), energy: $('#bar-energy'), rating: $('#hud-rating'), pips: $('#hud-pips'),
      valIntegrity: $('#val-integrity'), valEnergy: $('#val-energy'), statIntegrity: $('#stat-integrity'),
      claimPc: $('#hud-claim-pc'), gangRow: $('#hud-gang-row'),
      deck: $('#hud-deck'), gang: $('#hud-gang'), bounty: $('#hud-bounty'), room: $('#hud-room'), claim: $('#hud-claim span'), clearance: $('#hud-clearance'),
      sockets: $('#hud-sockets'), prompt: $('#hud-prompt'), hint: $('#hud-hint'), toasts: $('#toasts'),
      minimap: $('#minimap'), labels: $('#labels'), announce: $('#announce'), alert: $('#alert'),
      fade: $('#fade'), deckCard: $('#deck-card'), scrap: $('#hud-scrap'), banner: $('#banner'),
    };
    this.mm = this.el.minimap.getContext('2d');

    // menu actions
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || !this.screen || !this.screen.contains(b)) return;
      e.preventDefault();
      this.game.audio.play('uiSelect');
      this.game.onAction(this.screen.id.replace('screen-', ''), b.dataset.act, b);
    });
    // arrow keys move between buttons; Escape goes back
    document.addEventListener('keydown', (e) => {
      if (!this.screen) return;
      if (e.key === 'Escape' || (e.key === 'Backspace' && e.target.tagName !== 'INPUT')) {
        e.preventDefault();
        e.stopPropagation();   // or the game would see the same Escape and pause again
        this.back();
        return;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (e.target.type === 'range' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
        e.preventDefault();
        this.moveFocus(e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1);
      }
    });
    this.socketEls = {};
  }

  // ------------------------------------------------------------------ screens
  show(id, opts = {}) {
    if (this.screen && opts.push) this.stack.push(this.screen.id);
    else if (!opts.push) this.stack = [];
    if (this.screen) this.screen.hidden = true;
    const el = $(`#screen-${id}`);
    this.screen = el;
    el.hidden = false;
    // the first thing that can take focus: not hidden, not disabled
    requestAnimationFrame(() => {
      if (this.screen !== el) return;
      const want = opts.focus && el.querySelector(opts.focus);
      const first = want && !want.disabled && want.offsetParent !== null ? want : this.focusables()[0];
      if (first) first.focus({ preventScroll: true });
    });
  }

  hide() {
    if (this.screen) this.screen.hidden = true;
    this.screen = null;
    this.stack = [];
  }

  back() {
    if (!this.screen) return;
    this.game.audio.play('uiBack');
    const id = this.screen.id.replace('screen-', '');
    if (this.stack.length) {
      const prev = this.stack.pop();
      this.screen.hidden = true;
      this.screen = $(`#${prev}`);
      this.screen.hidden = false;
      const first = this.screen.querySelector('button, .button, input');
      if (first) first.focus({ preventScroll: true });
      return;
    }
    this.game.onAction(id, 'back');
  }

  focusables() {
    if (!this.screen) return [];
    return [...this.screen.querySelectorAll('button:not([disabled]), a.button, input')].filter((e) => e.offsetParent !== null);
  }

  moveFocus(dir) {
    const list = this.focusables();
    if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    const n = i < 0 ? 0 : (i + dir + list.length) % list.length;
    list[n].focus({ preventScroll: false });
    this.game.audio.play('uiMove');
  }

  // gamepad driving the menus
  pollPad(input) {
    if (!this.screen) return;
    const a = document.activeElement;
    const slider = a && a.type === 'range';
    if (slider && (input.padHit('left') || input.padHit('right'))) {
      if (input.padHit('left')) a.stepDown(); else a.stepUp();
      a.dispatchEvent(new Event('input'));
    } else {
      if (input.padHit('up') || input.padHit('left')) this.moveFocus(-1);
      if (input.padHit('down') || input.padHit('right')) this.moveFocus(1);
    }
    if (input.padHit('confirm')) {
      const a = document.activeElement;
      if (a && this.screen.contains(a)) a.click();
    }
    if (input.padHit('back')) this.back();
  }

  // ------------------------------------------------------------------ announcements
  announce(text, urgent = false) {
    const el = urgent ? this.el.alert : this.el.announce;
    el.textContent = '';
    setTimeout(() => { el.textContent = text; }, 30);
  }

  toast(text) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    this.el.toasts.appendChild(t);
    this.toastEls.push(t);
    while (this.toastEls.length > 4) this.toastEls.shift().remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, 3200);
    this.announce(text);
  }

  hint(html, secs = 6) {
    this.el.hint.innerHTML = html;
    this.el.hint.classList.add('on');
    this.hintT = secs;
    this.announce(this.el.hint.textContent);
  }

  clearHint() { this.el.hint.classList.remove('on'); this.hintT = 0; }

  // A big word across the screen, for ring-outs and the like.
  banner(title, sub = '', tone = '') {
    const b = this.el.banner;
    b.classList.toggle('gold', tone === 'gold');
    b.classList.toggle('rival', tone === 'rival');
    b.firstElementChild.textContent = title;
    b.lastElementChild.textContent = sub;
    b.hidden = true;
    void b.offsetWidth;
    b.hidden = false;
    clearTimeout(this.bannerT);
    // gold news (a bounty) stays up long enough to read the line under it
    this.bannerT = setTimeout(() => { b.hidden = true; }, tone === 'gold' ? 3200 : 1900);
  }

  // ------------------------------------------------------------------ HUD
  setScrap(n, bump = false) {
    const el = this.el.scrap;
    el.querySelector('b').textContent = String(n);
    if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  }

  setData(n, bump = false) {
    const el = $('#hud-data');
    el.querySelector('b').textContent = String(n);
    if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  }

  showHud(on) { this.el.hud.hidden = !on; if (!on) this.clearLabels(); }

  // ------------------------------------------------------------------ the cast
  // A conversation: pages of text, typed out, then a choice of replies.
  // t: { who, pages: [text], options: [{ act, label }] }
  talk(t) {
    const c = CAST[t.who];
    this.talkState = { ...t, page: 0 };
    const scr = $('#screen-talk');
    scr.style.setProperty('--who', c.colour);
    $('#talk-name').textContent = c.name;
    $('#talk-role').textContent = c.role;
    this.show('talk');
    this.talkPage();
  }

  talkPage() {
    const s = this.talkState;
    const text = s.pages[s.page];
    const last = s.page >= s.pages.length - 1;
    $('#talk-said').textContent = `${CAST[s.who].name}: ${text}`;
    const opts = last ? (s.options && s.options.length ? s.options : [{ act: 'close', label: 'Bye' }]) : [{ act: 'next', label: 'Go on' }];
    $('#talk-opts').innerHTML = opts.map((o) => `<button data-act="${o.act}">${esc(o.label)}</button>`).join('');
    this.typeOut($('#talk-text'), text, s.who);
    requestAnimationFrame(() => { const b = $('#talk-opts button'); if (b) b.focus({ preventScroll: true }); });
  }

  // Type a line out a few letters at a time, with a little voice.
  typeOut(el, text, who) {
    clearInterval(this.typeT);
    this.typing = null;
    if (document.body.classList.contains('reduced')) { el.textContent = text; return; }
    let i = 0;
    el.textContent = '';
    this.typing = { el, text };
    const pitch = { nan: 0.8, static: 1.35, ledger: 1.05, mainframe: 0.55, klp1: 0.95 }[who] || 1;
    this.typeT = setInterval(() => {
      i = Math.min(text.length, i + 2);
      el.textContent = text.slice(0, i);
      if (i % 6 === 0 && text[i - 1] !== ' ') this.game.audio.play('blip', { pitch: pitch * (0.92 + Math.random() * 0.16) });
      if (i >= text.length) { clearInterval(this.typeT); this.typing = null; }
    }, 26);
  }

  // Skip to the end of the line being typed. True if there was one.
  finishTyping() {
    if (!this.typing) return false;
    clearInterval(this.typeT);
    this.typing.el.textContent = this.typing.text;
    this.typing = null;
    return true;
  }

  // A line on the radio: in a box at the bottom, typed out, gone after a while.
  radio(who, text, secs = 7) {
    this.radioQ = this.radioQ || [];
    this.radioQ.push({ who, text, secs });
    if (!this.radioOn) this.nextRadio();
  }

  nextRadio() {
    const el = $('#radio');
    const r = this.radioQ.shift();
    clearTimeout(this.radioT);
    if (!r) { el.classList.add('out'); this.radioT = setTimeout(() => { el.hidden = true; this.radioOn = null; }, 400); return; }
    const c = CAST[r.who];
    this.radioOn = r;
    el.style.setProperty('--who', c.colour);
    $('#radio-name').textContent = c.name;
    el.hidden = false;
    el.classList.remove('out');
    this.typeRadio($('#radio-text'), r.text, r.who);
    this.announce(`${c.name}: ${r.text}`);
    this.radioT = setTimeout(() => this.nextRadio(), (r.secs + r.text.length * 0.03) * 1000);
  }

  typeRadio(el, text, who) {
    clearInterval(this.radioTypeT);
    if (document.body.classList.contains('reduced')) { el.textContent = text; return; }
    let i = 0;
    el.textContent = '';
    this.radioTypeT = setInterval(() => {
      i = Math.min(text.length, i + 2);
      el.textContent = text.slice(0, i);
      if (i % 8 === 0 && text[i - 1] !== ' ') this.game.audio.play('blip', { pitch: who === 'static' ? 1.35 : 1, soft: true });
      if (i >= text.length) clearInterval(this.radioTypeT);
    }, 30);
  }

  clearRadio() {
    this.radioQ = [];
    clearTimeout(this.radioT);
    clearInterval(this.radioTypeT);
    $('#radio').hidden = true;
    this.radioOn = null;
  }

  // Keep the faces on screen alive: blinking, the radio's aerial.
  tickPortraits(t) {
    if (this.screen && this.screen.id === 'screen-talk' && this.talkState) drawPortrait($('#talk-portrait'), this.talkState.who, t);
    if (this.radioOn) drawPortrait($('#radio-portrait'), this.radioOn.who, t);
    if (this.screen && this.screen.id === 'screen-fab') drawPortrait($('#fab-portrait'), 'ledger', t);
    if (this.screen && this.screen.id === 'screen-bench') drawPortrait($('#bench-portrait'), 'nan', t);
  }

  // Nan's bench: permanent upgrades, a notch at a time.
  bench(meta, line, focus) {
    const data = meta.data || 0;
    const wallet = $('#bench-wallet');
    wallet.querySelector('b').textContent = String(data);
    wallet.setAttribute('aria-label', `You have ${data} data`);
    $('#bench-line').textContent = line || '';
    $('#bench-list').innerHTML = BENCH.map((b) => {
      const r = rank(meta, b.id);
      const cost = nextCost(meta, b);
      const [now, next, what] = benchNow(meta, b);
      const full = cost == null;
      const short = !full && cost > data;
      const notches = `<span class="notches" aria-label="${r} of ${b.ranks}">${Array.from({ length: b.ranks }, (_, i) => `<i class="${i < r ? 'on' : ''}"></i>`).join('')}</span>`;
      const line = full ? `Full: ${what} ${now}.` : `Each notch: ${b.each}. ${what[0].toUpperCase()}${what.slice(1)} ${now} → ${next}.`;
      return `<button class="fab-item" data-act="buy" data-id="${b.id}"${full || short ? ' disabled' : ''}>
        <span class="fab-name">${esc(b.name)}${notches}</span>
        <span class="fab-line">${esc(line)}</span>
        <span class="fab-cost">${full ? '' : short ? `${cost} data · need ${cost - data} more` : `${cost} data`}</span>
      </button>`;
    }).join('');
    this.show('bench', focus ? { focus: `[data-id="${focus}"]` } : {});
  }

  setDeck(deck, n, daily = false) {
    this.el.deck.textContent = n === 0 ? deck.name : `${daily ? 'Today’s tower · ' : ''}Deck ${n} · ${deck.name}`;
    document.documentElement.style.setProperty('--ink', `#${deck.ink.toString(16).padStart(6, '0')}`);
  }

  deckCard(deck, n, bounty = '', label = '', quote = '') {
    const c = this.el.deckCard;
    $('#deck-num').textContent = label || (n === 6 ? 'THE BOTTOM OF THE TOWER' : `DECK ${n} OF 5`);
    $('#deck-title').textContent = deck.name;
    $('#deck-blurb').textContent = deck.blurb;
    $('#deck-bounty').textContent = bounty;
    $('#deck-quote').textContent = quote;
    c.hidden = true;
    void c.offsetWidth;
    c.hidden = false;
    clearTimeout(this.deckCardT);
    this.deckCardT = setTimeout(() => { c.hidden = true; }, 3400);
    this.announce(`Deck ${n}, ${deck.name}. ${deck.blurb} ${bounty ? `${bounty}.` : ''}${quote ? ` The Mainframe says: ${quote}` : ''}`);
  }

  buildSockets(player) {
    const box = this.el.sockets;
    box.innerHTML = '';
    for (const slot of SLOTS) {
      const d = document.createElement('div');
      d.className = 'socket';
      box.appendChild(d);
      this.socketEls[slot] = d;
    }
    this.refreshSockets(player);
  }

  refreshSockets(player) {
    const input = this.game.input;
    for (const slot of SLOTS) {
      const d = this.socketEls[slot];
      if (!d) continue;
      const mod = player.mods[slot];
      const id = mod ? mod.id : slot === 'arm' ? 'ram' : null;
      const empty = !id || (slot === 'drive' && id === 'wheels');
      const name = id ? moduleLabel(mod || { id }) : 'Empty';
      d.className = `socket${empty ? ' empty' : ''}`;
      d.innerHTML = `<div class="slot">${SLOT_NAMES[slot]} <kbd>${input.label(slot)}</kbd></div><div class="mod">${iconSvg(id || 'empty', 20)}<span>${esc(name)}</span></div><div class="cool"></div>`;
    }
    // the pulsers you take into each hack, drawn like the dots on the board
    const n = this.game.playerPulsers();
    this.el.pips.innerHTML = '<i></i>'.repeat(n);
    this.el.rating.textContent = `${n} pulsers`;
  }

  updateHud(world, dt) {
    const p = world.player;
    if (!p) return;
    const ip = Math.max(0, p.integrity / p.maxIntegrity);
    const ep = Math.max(0, p.energy / p.maxEnergy);
    this.el.integrity.firstElementChild.style.width = `${ip * 100}%`;
    this.el.integrity.lastElementChild.style.width = `${ip * 100}%`;
    this.el.integrity.classList.toggle('low', ip < 0.3);
    this.el.statIntegrity.classList.toggle('low', ip < 0.3);
    // numbers beside the bars, only touched when they change
    const iv = `${Math.max(0, Math.ceil(p.integrity))}<small>/${Math.round(p.maxIntegrity)}</small>`;
    if (iv !== this.lastIv) { this.lastIv = iv; this.el.valIntegrity.innerHTML = iv; this.el.integrity.setAttribute('aria-label', `Integrity ${Math.ceil(p.integrity)} of ${Math.round(p.maxIntegrity)}`); }
    const ev = String(Math.max(0, Math.floor(p.energy)));
    if (ev !== this.lastEv) { this.lastEv = ev; this.el.valEnergy.textContent = ev; this.el.energy.setAttribute('aria-label', `Energy ${ev}`); }
    this.el.energy.firstElementChild.style.width = `${ep * 100}%`;
    this.el.claim.style.width = `${world.claimShown * 100}%`;
    const pc = `${Math.round(world.claim * 100)}% claimed`;
    if (pc !== this.lastPc) { this.lastPc = pc; this.el.claimPc.textContent = pc; }
    const cl = this.el.clearance;
    const boss = world.mainframe;
    if (boss) {
      cl.textContent = boss.beaten ? 'The tower is yours' : boss.relaysUp > 0 ? `Relays holding the shield: ${boss.relaysUp}` : 'Shield down: grapple the Mainframe';
      cl.classList.toggle('ok', !boss.relaysUp);
    } else if (world.build.heap) {
      cl.textContent = 'The chute at the bottom leads down into the tower';
      cl.classList.add('ok');
    } else {
      cl.textContent = world.clearance ? 'Clearance granted: find the lift' : 'Lift locked: take the ◆ command droid';
      cl.classList.toggle('ok', world.clearance);
    }
    // this room's prize, and what stands between you and it
    const room = world.roomNow >= 0 ? world.build.rooms[world.roomNow] : null;
    const k = room && room.prizePickup && !room.prizePickup.removed ? room.prizePickup : null;
    let rt = '';
    if (k && k.locked) { const n = world.roomGuards(room.index); rt = `Room prize: ${k.label().toLowerCase()} · ${n} droid${n === 1 ? '' : 's'} to deal with`; }
    else if (k) rt = `Room clear: ${k.label().toLowerCase()} is yours`;
    if (this.el.room.textContent !== rt) this.el.room.textContent = rt;
    this.el.room.classList.toggle('open', !!k && !k.locked);
    const b = world.bounty;
    const bt = !b ? '' : b.bountyDone || b.team === 'k' ? `★ Bounty claimed: ${b.bounty}` : `★ Bounty: ${b.bounty}, ${FAMILIES[b.family].name} ${b.cls}${b.spotted ? '' : ', not yet found'}`;
    if (this.el.bounty.textContent !== bt) this.el.bounty.textContent = bt;
    this.el.bounty.classList.toggle('done', !!b && (b.bountyDone || b.team === 'k'));
    // sockets: cooldowns and active states
    for (const slot of SLOTS) {
      const d = this.socketEls[slot];
      if (!d) continue;
      const cool = d.lastElementChild;
      const st = p.stats[slot];
      const max = st && st.cooldown ? st.cooldown : 0;
      cool.style.width = max ? `${Math.min(1, p.cd[slot] / max) * 100}%` : '0';
      const active = (slot === 'drive' && (p.hovering || p.dash)) || (slot === 'core' && (p.shielding || p.cloaked || p.phasing)) || (slot === 'arm' && p.mod.arm.target);
      d.classList.toggle('active', !!active);
    }
    // the gang, with a little bar each
    const gang = world.allies();
    const key = gang.map((d) => `${d.cls}:${Math.round((d.integrity / d.maxIntegrity) * 20)}`).join(',');
    if (key !== this.gangKey) {
      this.gangKey = key;
      this.el.gangRow.hidden = !gang.length;
      this.el.gang.innerHTML = gang.map((d) => `<span class="ally" title="${esc(FAMILIES[d.family].name)} ${d.cls}">${d.cls}<i style="width:${Math.round((d.integrity / d.maxIntegrity) * 100)}%"></i></span>`).join('');
      this.el.gang.setAttribute('aria-label', gang.length ? `Gang: ${gang.map((d) => `${FAMILIES[d.family].name} ${d.cls}`).join(', ')}` : '');
    }
    // hint timer
    if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) this.el.hint.classList.remove('on'); }
  }

  setPrompt(html, warn = false) {
    const el = this.el.prompt;
    if (!html) { el.classList.remove('on'); this.lastPrompt = null; return; }
    if (html !== this.lastPrompt) { el.innerHTML = html; this.lastPrompt = html; }
    el.classList.add('on');
    el.classList.toggle('warn', warn);
  }

  // class numbers floating over droids
  updateLabels(world, renderer) {
    const out = { x: 0, y: 0, visible: false };
    let n = 0;
    const p = world.player;
    for (const d of world.droids) {
      if (d.isPlayer || !d.alive || d.state !== 'active') continue;
      if (d.cloaked) continue;
      if (p && d.pos.distanceTo(p.pos) > 13) continue;
      const v = d.pos.clone();
      v.y += d.model.height + 0.25;
      renderer.project(v, out);
      if (!out.visible || out.x < -40 || out.y < -40 || out.x > innerWidth + 40 || out.y > innerHeight + 40) continue;
      let el = this.labels[n];
      if (!el) {
        el = document.createElement('div');
        el.className = 'label';
        el.innerHTML = '<span></span><i class="hp"><i></i></i>';
        this.el.labels.appendChild(el);
        this.labels.push(el);
      }
      el.hidden = false;
      el.style.left = `${out.x}px`;
      el.style.top = `${out.y}px`;
      const dent = d.team === 'k' ? 0 : d.dentShown || 0;
      const txt = d.npc ? d.npc.name : d.family === 'klp1' ? `KLP-1${dent ? ` −${dent}` : ''}` : `${d.bounty ? `${d.bounty} ${d.cls}` : d.cls}${dent ? ` −${dent}` : ''}`;
      el.classList.toggle('rival', d.family === 'klp1' && d.team !== 'k');
      el.classList.toggle('npc', !!d.npc);
      if (d.npc) el.style.color = `#${d.accent.toString(16).padStart(6, '0')}`; else el.style.color = '';
      if (el.firstChild.textContent !== txt) el.firstChild.textContent = txt;
      el.classList.toggle('dented', dent > 0);
      el.classList.toggle('locked', world.lock && world.lock.target === d);
      el.classList.toggle('cmd', d.command && d.team !== 'k');
      el.classList.toggle('bounty', !!d.bounty && d.team !== 'k');
      el.classList.toggle('ally', d.team === 'k');
      const hp = d.integrity / d.maxIntegrity;
      el.lastChild.style.visibility = hp < 0.999 || (world.lock && world.lock.target === d) ? 'visible' : 'hidden';
      el.lastChild.firstChild.style.width = `${hp * 100}%`;
      n++;
    }
    for (let i = n; i < this.labels.length; i++) this.labels[i].hidden = true;
  }
  clearLabels() {
    for (const l of this.labels) l.hidden = true;
    for (const b of this.bubbles) b.el.remove();
    this.bubbles = [];
    for (const p of this.pops || []) p.el.remove();
    this.pops = [];
  }

  // A number or a word that jumps off a droid and fades: damage, SLAM, DODGE.
  pop(at, text, cls = '') {
    this.pops = this.pops || [];
    if (this.pops.length > 18) this.pops.shift().el.remove();
    const el = document.createElement('div');
    el.className = `pop ${cls}`;
    el.textContent = text;
    el.setAttribute('aria-hidden', 'true');
    this.el.labels.appendChild(el);
    const word = cls.includes('word');
    const p = { el, at: at.clone(), t: 0, life: word ? 0.95 : 0.75, dx: word ? 0 : (Math.random() - 0.5) * 22 };
    this.pops.push(p);
    return p;
  }

  // A symbol over a droid's head that follows it: ! seen you, ? lost you, z asleep.
  emote(d, text, cls) {
    const p = this.pop(d.pos, text, `emote ${cls}`);
    p.d = d;
    p.life = 1.1;
    p.dx = 0;
    return p;
  }

  unpop(p) {
    const i = this.pops ? this.pops.indexOf(p) : -1;
    if (i >= 0) { p.el.remove(); this.pops.splice(i, 1); }
  }

  updatePops(renderer, dt) {
    if (!this.pops || !this.pops.length) return;
    const out = { x: 0, y: 0, visible: false };
    const still = document.body.classList.contains('reduced');
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t += dt;
      if (p.t > p.life) { p.el.remove(); this.pops.splice(i, 1); continue; }
      if (p.d) { p.at.copy(p.d.pos); p.at.y += p.d.model.height + 0.3; }
      renderer.project(p.at, out);
      const k = p.t / p.life;
      const rise = still ? 0 : 30 * (1 - (1 - k) * (1 - k));
      const grow = still ? 1 : k < 0.12 ? 0.6 + k / 0.12 * 0.5 : 1.1 - Math.min(0.1, (k - 0.12));
      p.el.style.left = `${out.x}px`;
      p.el.style.top = `${out.y}px`;
      p.el.style.transform = `translate(calc(-50% + ${p.dx}px), calc(-100% - ${rise}px)) scale(${grow})`;
      p.el.style.opacity = k > 0.6 ? String((1 - k) / 0.4) : '1';
      p.el.style.visibility = out.visible ? 'visible' : 'hidden';
    }
  }

  // A droid says something, in a bubble over its head.
  say(d, text, force = false) {
    if (!text || !d.model) return false;
    const now = performance.now();
    if (!force && (now - (d.saidAt || -1e9) < 7000 || this.bubbles.length >= 3)) return false;
    d.saidAt = now;
    const old = this.bubbles.find((b) => b.d === d);
    if (old) { old.el.remove(); this.bubbles.splice(this.bubbles.indexOf(old), 1); }
    const el = document.createElement('div');
    el.className = `bubble${d.team === 'k' ? ' ally' : ''}`;
    el.textContent = text;
    this.el.labels.appendChild(el);
    this.bubbles.push({ d, el, until: now + 1800 + text.length * 45, y: d.model.height + 0.62 });
    return true;
  }

  updateBubbles(renderer) {
    const now = performance.now();
    const out = { x: 0, y: 0, visible: false };
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      if (now > b.until) { b.el.remove(); this.bubbles.splice(i, 1); continue; }
      const v = b.d.pos.clone();
      v.y += b.y;
      renderer.project(v, out);
      b.el.style.left = `${out.x}px`;
      b.el.style.top = `${out.y}px`;
      b.el.style.visibility = out.visible ? 'visible' : 'hidden';
      b.el.classList.toggle('fading', now > b.until - 350);
    }
  }

  drawMinimap(world) {
    const ctx = this.mm;
    const W = 168;
    ctx.clearRect(0, 0, W, W);
    const rooms = world.build.rooms;
    const xs = rooms.map((r) => r.cell.x), zs = rooms.map((r) => r.cell.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const cols = maxX - minX + 1, rowsN = maxZ - minZ + 1;
    const cs = Math.min(30, (W - 16) / Math.max(cols, rowsN));
    const ox = (W - cols * cs) / 2, oz = (W - rowsN * cs) / 2;
    const ink = `#${world.deck.ink.toString(16).padStart(6, '0')}`;
    const C = (r) => [ox + (r.cell.x - minX + 0.5) * cs, oz + (r.cell.z - minZ + 0.5) * cs];
    const known = (r) => r.visited || r.links.some((l) => rooms[l].visited);
    ctx.lineWidth = 2;
    for (const [a, b] of world.build.links) {
      if (!known(rooms[a]) || !known(rooms[b])) continue;
      if (!rooms[a].visited && !rooms[b].visited) continue;
      const [x1, y1] = C(rooms[a]), [x2, y2] = C(rooms[b]);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    const b = world.bounty;
    let bountyRoom = -1;
    if (b && b.spotted && b.alive && b.team === 'h' && !b.bountyDone) {
      const bx = Math.floor(b.pos.x), bz = Math.floor(b.pos.z);
      if (world.grid.inside(bx, bz)) bountyRoom = world.grid.room[world.grid.idx(bx, bz)];
    }
    for (const r of rooms) {
      if (!known(r)) continue;
      const [x, y] = C(r);
      const s = cs * 0.62;
      ctx.fillStyle = r.visited ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.4)';
      ctx.strokeStyle = r.index === world.roomNow ? PLAYER_HEX : r.visited ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = r.index === world.roomNow ? 2 : 1;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
      ctx.strokeRect(x - s / 2, y - s / 2, s, s);
      ctx.font = '600 9px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (r.role === 'lift' && r.visited) { ctx.fillStyle = world.clearance ? PLAYER_HEX : ink; ctx.fillText('▼', x, y); }
      else if (r.role === 'vault') { ctx.fillStyle = '#c8cfdc'; ctx.fillText('◇', x, y); }
      else if (r.role === 'archive' && r.visited) { ctx.fillStyle = '#ffffff'; ctx.fillText('A', x, y); }
      else if (r.role === 'repair' && r.visited) { ctx.fillStyle = PLAYER_HEX; ctx.fillText('+', x, y); }
      else if (r.role === 'boss') { ctx.fillStyle = ink; ctx.fillText('999', x, y); }
      // the room's prize: a hollow dot while caged, filled once it's open
      const k = r.prizePickup;
      if (k && !k.removed) {
        ctx.beginPath();
        ctx.arc(x + s * 0.3, y + s * 0.3, 2.6, 0, Math.PI * 2);
        const col = { bale: '#ffc867', kit: PLAYER_HEX, cache: '#ffffff', chip: '#ffe9b0' }[k.what.type] || '#fff';
        if (k.locked) { ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.stroke(); } else { ctx.fillStyle = col; ctx.fill(); }
      }
      // the bounty, once you've seen it
      if (r.index === bountyRoom) { ctx.font = '700 11px "IBM Plex Mono", monospace'; ctx.fillStyle = '#ffcf6e'; ctx.fillText('★', x + s * 0.28, y - s * 0.28); }
    }
    // the player, placed within the current cell
    const p = world.player;
    if (p && world.roomNow >= 0) {
      const cell = world.build.cell;
      const fx = p.pos.x / cell - 0.5 - minX + 0.5, fz = p.pos.z / cell - 0.5 - minZ + 0.5;
      ctx.fillStyle = PLAYER_HEX;
      ctx.beginPath(); ctx.arc(ox + fx * cs, oz + fz * cs, 2.6, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ------------------------------------------------------------------ cards
  moduleCard(mod, current, opts = {}) {
    const def = MODULES[mod.id];
    const cur = current ? moduleLabel(current) : 'nothing';
    const better = !current || MODULES[current.id].starter || current.id !== mod.id || mod.grade > current.grade;
    const swap = current && current.id === mod.id
      ? (mod.grade > current.grade ? `Upgrade from Mk ${roman(current.grade)}` : `You already have Mk ${roman(current.grade)}`)
      : `Replaces <b>${esc(cur)}</b>${current && !MODULES[current.id].starter ? ' (it drops at your feet)' : ''}`;
    return `<button class="card${better ? ' better' : ''}" data-act="${opts.act || 'take'}" data-id="${mod.id}" data-grade="${mod.grade}">
      <span class="slot-tag">${SLOT_NAMES[def.slot]}</span>
      <span class="card-head">${iconSvg(mod.id, 26)}${esc(moduleLabel(mod))}</span>
      <span class="line">${esc(def.line)}</span>
      <span class="use">${esc(def.use)}</span>
      <span class="stats">${esc(statLine(mod))}</span>
      <span class="swap">${swap}</span>
    </button>`;
  }

  turnCard(d, gang, max) {
    const F = FAMILIES[d.family];
    const parts = [d.mods.drive && d.mods.drive.id !== 'wheels' ? d.mods.drive : null, d.mods.arm, d.mods.core].filter(Boolean).map((m) => MODULES[m.id].name.toLowerCase());
    const weak = gang.length >= max ? gang.slice().sort((a, b) => a.cls - b.cls)[0] : null;
    const note = weak ? `Gang full: ${esc(FAMILIES[weak.family].name)} ${weak.cls} goes home` : `Gang: ${gang.length} of ${max}`;
    return `<button class="card turn" data-act="turn">
      <span class="slot-tag">Your gang</span>
      <span class="card-head">${iconSvg('gang', 26)}Turn it</span>
      <span class="line">${esc(F.name)} ${d.cls} turns cyan and follows you. It fights for you and rides the lift down with you.</span>
      <span class="use">${parts.length ? `It keeps its ${esc(parts.join(' and '))}.` : 'It has only its bumper, but it will use it.'}</span>
      <span class="swap">${note}</span>
    </button>`;
  }

  // KLP-1 won't join a gang. Beat it enough times and it'll go home instead.
  homeCard(wins, need) {
    const ready = wins >= need;
    return `<button class="card turn${ready ? '' : ' dim'}" data-act="${ready ? 'home' : 'notyet'}"${ready ? '' : ' aria-disabled="true"'}>
      <span class="slot-tag">KLP-1</span>
      <span class="card-head">${iconSvg('gang', 26)}${ready ? 'Bring it home' : 'Not yet'}</span>
      <span class="line">${ready ? 'KLP-1 goes up the chute to the Heap, to Nan. It won\'t come for you again.' : 'It won\'t follow you, and it won\'t go home. Not yet.'}</span>
      <span class="swap">Beaten in a hack ${Math.min(wins, need)} of ${need} times</span>
    </button>`;
  }

  perkCard(id) {
    const p = PERKS[id];
    return `<button class="card" data-act="perk" data-id="${id}">
      <span class="slot-tag">Firmware</span>
      <span class="card-head">${esc(p.name)}</span>
      <span class="line">${esc(p.line)}</span>
    </button>`;
  }

  fab(items, scrap, focus, line = null) {
    if (line != null) $('#fab-line').textContent = line;
    const wallet = $('#fab-wallet');
    const was = wallet.dataset.n;
    wallet.querySelector('b').textContent = String(scrap);
    wallet.setAttribute('aria-label', `You have ${scrap} scrap`);
    wallet.classList.remove('spent');
    if (was !== undefined && +was !== scrap && this.screen && this.screen.id === 'screen-fab') { void wallet.offsetWidth; wallet.classList.add('spent'); }
    wallet.dataset.n = String(scrap);
    $('#fab-list').innerHTML = items.map((i) => {
      const short = i.ok && i.cost > scrap;
      const off = !i.ok || short;
      const cost = !i.ok ? '' : short ? `${i.cost} scrap · need ${i.cost - scrap} more` : `${i.cost} scrap`;
      return `<button class="fab-item" data-act="buy" data-id="${i.id}"${off ? ' disabled' : ''}>
        <span class="fab-name">${i.icon ? iconSvg(i.icon, 20) : ''}${esc(i.name)}</span>
        <span class="fab-line">${esc(i.line)}</span>
        <span class="fab-cost">${cost}</span>
      </button>`;
    }).join('');
    this.show('fab', focus ? { focus: `[data-id="${focus}"]` } : {});
  }

  offer({ title, lede, cards, extra }) {
    $('#offer-h').textContent = title;
    $('#offer-lede').innerHTML = lede || '';
    $('#offer-cards').innerHTML = cards.join('');
    $('#offer-row').innerHTML = extra || '';
    this.show('offer');
  }

  loadout(player, perks, pulsers) {
    const parts = SLOTS.map((slot) => {
      const mod = player.mods[slot];
      const id = mod ? mod.id : slot === 'arm' ? 'ram' : null;
      const def = id ? MODULES[id] : null;
      return `<div class="box"><h3>${SLOT_NAMES[slot]} · <kbd>${this.game.input.label(slot)}</kbd></h3>
        <div class="name">${iconSvg(id || 'empty', 22)}${esc(id ? moduleLabel(mod || { id }) : 'Empty')}</div>
        <p>${esc(def ? def.use : 'Nothing fitted. Steal a part from a droid to fill this socket.')}</p>
        ${id ? `<p class="stats">${esc(statLine(mod || { id, grade: 1 }))}</p>` : ''}</div>`;
    }).join('');
    const fw = perks.length
      ? `<ul>${perks.map((id) => `<li><b>${esc(PERKS[id].name)}</b>: ${esc(PERKS[id].line)}</li>`).join('')}</ul>`
      : '<p>None yet. Hack an archive terminal or pick up a chip.</p>';
    $('#loadout-body').innerHTML = `${parts}<div class="box"><h3>Firmware</h3>${fw}</div>
      <div class="box"><h3>Hacking</h3><p>You start each hack with <b>${pulsers}</b> pulsers. Higher-grade parts add more.</p></div>`;
    this.show('loadout', { push: true });
  }

  archive(meta) {
    const seen = FAMILY_ORDER.filter((k) => meta.archive[k]).length;
    $('#archive-lede').textContent = `${seen} of ${FAMILY_ORDER.length} families on file. Droids you see go in; hack one to read its parts. The archive stays with you between runs.`;
    $('#archive-body').innerHTML = FAMILY_ORDER.map((k) => {
      const F = FAMILIES[k];
      const a = meta.archive[k];
      if (!a) return `<div class="droid unknown"><h3>Unknown <span>${F.rival ? '???' : `${F.min}–${F.max}`}</span></h3><p>Not yet seen.</p></div>`;
      const parts = [F.drive, F.arm, F.core].filter(Boolean).map((m) => `<span title="${esc(MODULES[m].name)}">${iconSvg(m, 20)}</span>`).join('');
      const names = [F.drive, F.arm, F.core].filter(Boolean).map((m) => MODULES[m].name).join(', ');
      return `<div class="droid"><h3>${esc(F.name)} <span>${F.min}–${F.max}</span></h3>
        ${a.hacked ? `<div class="parts" aria-label="Parts: ${esc(names)}">${parts}</div>` : '<p class="tally">Hack one to read its parts.</p>'}
        <p>${esc(F.role)}. ${esc(F.blurb)}</p>
        <p class="tally">Hacked ${a.hacked || 0} · destroyed ${a.destroyed || 0}${a.best ? ` · best class ${a.best}` : ''}</p></div>`;
    }).join('');
    this.show('archive', { push: !!this.screen });
  }
}
