// The DOM side: HUD, menus, cards, minimap, labels over droids, toasts and
// hints. Menus are real buttons, so they work with a keyboard, a screen
// reader or a gamepad (which moves the focus for you).
import { MODULES, SLOTS, SLOT_NAMES, iconSvg, moduleLabel, roman } from './world/modules.js';
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
    this.toastEls = [];
    this.hintT = 0;
    this.el = {
      hud: $('#hud'), integrity: $('#bar-integrity'), energy: $('#bar-energy'), rating: $('#hud-rating'),
      deck: $('#hud-deck'), claim: $('#hud-claim span'), clearance: $('#hud-clearance'),
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
    const first = opts.focus ? el.querySelector(opts.focus) : el.querySelector('button, .button, input, [tabindex="0"]');
    if (first) requestAnimationFrame(() => first.focus({ preventScroll: true }));
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

  // A big word across the screen, for ring-outs and the like.
  banner(title, sub = '') {
    const b = this.el.banner;
    b.firstElementChild.textContent = title;
    b.lastElementChild.textContent = sub;
    b.hidden = true;
    void b.offsetWidth;
    b.hidden = false;
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => { b.hidden = true; }, 1900);
  }

  // ------------------------------------------------------------------ HUD
  setScrap(n, bump = false) {
    const el = this.el.scrap;
    el.querySelector('b').textContent = String(n);
    if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  }

  showHud(on) { this.el.hud.hidden = !on; if (!on) this.clearLabels(); }

  setDeck(deck, n) {
    this.el.deck.textContent = `Deck ${n} · ${deck.name}`;
    document.documentElement.style.setProperty('--ink', `#${deck.ink.toString(16).padStart(6, '0')}`);
  }

  deckCard(deck, n) {
    const c = this.el.deckCard;
    $('#deck-num').textContent = n === 6 ? 'THE TOP OF THE TOWER' : `DECK ${n} OF 5`;
    $('#deck-title').textContent = deck.name;
    $('#deck-blurb').textContent = deck.blurb;
    c.hidden = true;
    void c.offsetWidth;
    c.hidden = false;
    clearTimeout(this.deckCardT);
    this.deckCardT = setTimeout(() => { c.hidden = true; }, 3400);
    this.announce(`Deck ${n}, ${deck.name}. ${deck.blurb}`);
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
    this.el.rating.textContent = `· ${this.game.playerPulsers()} pulsers`;
  }

  updateHud(world, dt) {
    const p = world.player;
    if (!p) return;
    const ip = Math.max(0, p.integrity / p.maxIntegrity);
    const ep = Math.max(0, p.energy / p.maxEnergy);
    this.el.integrity.firstElementChild.style.width = `${ip * 100}%`;
    this.el.integrity.lastElementChild.style.width = `${ip * 100}%`;
    this.el.integrity.classList.toggle('low', ip < 0.3);
    this.el.integrity.setAttribute('aria-label', `Integrity ${Math.round(p.integrity)} of ${Math.round(p.maxIntegrity)}`);
    this.el.energy.firstElementChild.style.width = `${ep * 100}%`;
    this.el.energy.setAttribute('aria-label', `Energy ${Math.round(p.energy)}`);
    this.el.claim.style.width = `${world.claimShown * 100}%`;
    const cl = this.el.clearance;
    const boss = world.mainframe;
    if (boss) {
      cl.textContent = boss.beaten ? 'The tower is yours' : boss.relaysUp > 0 ? `Relays holding the shield: ${boss.relaysUp}` : 'Shield down: grapple the Mainframe';
      cl.classList.toggle('ok', !boss.relaysUp);
    } else {
      cl.textContent = world.clearance ? 'Clearance granted: find the lift' : 'Lift locked: take the ◆ command droid';
      cl.classList.toggle('ok', world.clearance);
    }
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
      const txt = String(d.cls);
      if (el.firstChild.textContent !== txt) el.firstChild.textContent = txt;
      el.classList.toggle('cmd', d.command);
      const hp = d.integrity / d.maxIntegrity;
      el.lastChild.style.visibility = hp < 0.999 ? 'visible' : 'hidden';
      el.lastChild.firstChild.style.width = `${hp * 100}%`;
      n++;
    }
    for (let i = n; i < this.labels.length; i++) this.labels[i].hidden = true;
  }
  clearLabels() { for (const l of this.labels) l.hidden = true; }

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
      <span class="swap">${swap}</span>
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

  fab(items, scrap, focus) {
    $('#fab-lede').textContent = `You have ${scrap} scrap.`;
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
    this.show('fab', focus ? { focus: `[data-id="${focus}"]:not([disabled])` } : {});
    if (focus && !$(`#fab-list [data-id="${focus}"]:not([disabled])`)) requestAnimationFrame(() => { const b = this.focusables()[0]; if (b) b.focus(); });
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
        <p>${esc(def ? def.use : 'Nothing fitted. Steal a part from a droid to fill this socket.')}</p></div>`;
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
      if (!a) return `<div class="droid unknown"><h3>Unknown <span>${F.min}–${F.max}</span></h3><p>Not yet seen.</p></div>`;
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
