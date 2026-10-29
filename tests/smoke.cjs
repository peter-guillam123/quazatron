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
    await page.evaluate(() => { window.klepto.settings.hints = false; window.klepto.meta.lesson = 99; window.klepto.meta.inductionDone = true; });
  });
  await step('deck1', () => page.keyboard.press('Enter'), 3000);
  await step('move', async () => { await page.keyboard.down('ArrowUp'); await page.waitForTimeout(600); await page.keyboard.up('ArrowUp'); });
  await step('grapple', async () => {
    // try droids nearest first until one is standing somewhere we can reach
    for (let i = 0; i < 6; i++) {
      const placed = await page.evaluate((i) => {
        const w = window.klepto.world, p = w.player;
        const ds = w.droids.filter((x) => !x.isPlayer && x.alive).sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos));
        const d = ds[i];
        if (!d) return false;
        d.brain.update = () => {};
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const x = d.pos.x + dx * (d.radius + p.radius + 0.1), z = d.pos.z + dz * (d.radius + p.radius + 0.1);
          const g = w.grid.groundAt(x, z);
          if (g !== null && Math.abs(g - d.pos.y) < 0.1) { p.pos.set(x, g, z); p.vel.x = p.vel.z = 0; return true; }
        }
        return false;
      }, i);
      if (!placed) continue;
      await page.waitForTimeout(200);
      await page.keyboard.press('Space');
      await page.waitForTimeout(1200);
      if (await page.evaluate(() => window.klepto.state === 'hack')) break;
    }
  }, 300);
  const state = await page.evaluate(() => window.klepto.state);
  if (state !== 'hack') { errors.push(`expected a hack, got ${state}`); await browser.close(); console.log('FAILED\n' + errors.join('\n')); process.exit(1); }
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
    // software rendering is slow; give the ride down up to 30 seconds
    for (let i = 0; i < 60; i++) {
      if (await page.evaluate(() => window.klepto.state === 'play' && window.klepto.run.deck === 2)) break;
      await page.waitForTimeout(500);
    }
  }, 500);
  const deck = await page.evaluate(() => window.klepto.run && window.klepto.run.deck);
  if (deck !== 2) errors.push(`expected deck 2, got ${deck}`);

  await browser.close();
  if (errors.length) { console.log('FAILED\n' + errors.join('\n')); process.exitCode = 1; } else console.log('smoke test passed');
})();
