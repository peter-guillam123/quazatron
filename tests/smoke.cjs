// Browser smoke test: loads the game, starts a run, grapples a droid, wins
// the hack by decree, takes a part, descends a deck, and fails on any page
// error. Needs a static server on :8080 and Playwright.
//   python3 -m http.server 8080 &
//   node tests/smoke.cjs [screenshot-dir]
const { chromium } = require('playwright');

(async () => {
  const out = process.argv[2];
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 680 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const step = async (name, fn, wait = 800) => {
    await fn();
    await page.waitForTimeout(wait);
    if (out) await page.screenshot({ path: `${out}/smoke-${name}.png` });
    console.log('ok', name);
  };

  await page.goto('http://localhost:8080/index.html');
  await page.waitForTimeout(1500);
  await step('title', async () => {
    await page.evaluate(() => { window.klepto.settings.hints = false; window.klepto.meta.tutorialHack = true; });
  });
  await step('deck1', () => page.keyboard.press('Enter'), 3000);
  await step('move', async () => { await page.keyboard.down('ArrowUp'); await page.waitForTimeout(600); await page.keyboard.up('ArrowUp'); });
  await step('grapple', async () => {
    await page.evaluate(() => {
      const w = window.klepto.world, p = w.player;
      const d = w.droids.filter((x) => !x.isPlayer).sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos))[0];
      d.brain.update = () => {};
      p.pos.set(d.pos.x + d.radius + p.radius + 0.1, d.pos.y, d.pos.z);
    });
    await page.keyboard.press('Space');
  }, 1500);
  const state = await page.evaluate(() => window.klepto.state);
  if (state !== 'hack') errors.push(`expected a hack, got ${state}`);
  await step('salvage', () => page.evaluate(() => { const g = window.klepto; g.endHack(g.session, true); }), 1200);
  await step('take', () => page.evaluate(() => {
    const b = document.querySelector('#screen-offer button');
    if (b) b.click();
  }));
  await step('descend', async () => {
    await page.evaluate(() => {
      const w = window.klepto.world;
      w.grantClearance('hacked');
      w.player.pos.set(w.lift.pos.x, w.lift.y, w.lift.pos.z);
    });
    await page.waitForTimeout(300);
    await page.keyboard.press('Space');
  }, 6000);
  const deck = await page.evaluate(() => window.klepto.run && window.klepto.run.deck);
  if (deck !== 2) errors.push(`expected deck 2, got ${deck}`);

  await browser.close();
  if (errors.length) { console.log('FAILED\n' + errors.join('\n')); process.exitCode = 1; } else console.log('smoke test passed');
})();
