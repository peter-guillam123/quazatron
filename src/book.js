// A two-page book: an index down the left, a page on the right. The droid
// archive and the how-to both use it. The index is a list of tabs, and
// moving the focus along it turns to that page, so arrow keys and a gamepad
// leaf through the book. Enter (or the gamepad's A) steps into the page to
// read and scroll it; left arrow comes back out.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Book {
  constructor(name) {
    this.name = name;
    this.index = document.getElementById(`${name}-index`);
    this.page = document.getElementById(`${name}-page`);
    this.current = null;
    this.onTurn = null;
    this.index.addEventListener('focusin', (e) => {
      const b = e.target.closest('[role="tab"]');
      if (b) this.turn(b.dataset.key);
    });
    this.index.addEventListener('click', (e) => {
      const b = e.target.closest('[role="tab"]');
      if (!b) return;
      this.turn(b.dataset.key);
      // from the keyboard or a gamepad, step into the page to read it
      if (e.detail === 0) this.page.focus({ preventScroll: true });
      else b.focus({ preventScroll: true });
    });
    this.page.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.focusTab(); }
    });
  }

  // groups: [{ title, items: [{ key, label, sub, thumb, flag, aria }] }]
  // render(key): the page's HTML.
  fill(groups, render, key) {
    this.render = render;
    this.index.innerHTML = groups.map((g) => `
      <p class="book-group" aria-hidden="true">${esc(g.title)}</p>
      <div role="tablist" aria-orientation="vertical" aria-label="${esc(g.title)}">${g.items.map((it) => `
        <button role="tab" type="button" class="book-tab${it.dim ? ' dim' : ''}" id="${this.name}-tab-${it.key}" data-key="${it.key}" aria-controls="${this.name}-page" aria-selected="false" tabindex="-1"${it.aria ? ` aria-label="${esc(it.aria)}"` : ''}${it.style ? ` style="${it.style}"` : ''}>
          <span class="book-thumb" aria-hidden="true">${it.thumb || ''}</span>
          <span class="book-label"><b>${esc(it.label)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>
          ${it.flag ? `<span class="book-flag" aria-hidden="true">${it.flag}</span>` : ''}
        </button>`).join('')}
      </div>`).join('');
    this.current = null;
    const first = this.index.querySelector('[role="tab"]');
    this.turn(key && this.tab(key) ? key : first && first.dataset.key);
  }

  tab(key) { return this.index.querySelector(`[data-key="${key}"]`); }

  focusTab() {
    const b = this.tab(this.current);
    if (b) b.focus({ preventScroll: false });
  }

  turn(key) {
    if (!key || key === this.current) return;
    this.current = key;
    for (const b of this.index.querySelectorAll('[role="tab"]')) {
      const on = b.dataset.key === key;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    }
    this.page.setAttribute('aria-labelledby', `${this.name}-tab-${key}`);
    this.page.innerHTML = this.render(key);
    this.page.scrollTop = 0;
    if (this.onTurn) this.onTurn(key, this.page);
  }

  // Update one tab's label, thumbnail or flag without rebuilding the index.
  setThumb(key, html) {
    const b = this.tab(key);
    if (b) b.querySelector('.book-thumb').innerHTML = html;
  }

  clearFlag(key) {
    const b = this.tab(key);
    const f = b && b.querySelector('.book-flag');
    if (f) f.remove();
  }
}
