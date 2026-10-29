# KLEPTO

Kind: Personal

A roguelite for the browser, built with three.js, after Quazatron (Steve Turner,
Graftgold, 1986). You play KLP-2, a small droid that grapples other droids,
beats them in a circuit-board duel and steals their parts.

## Decisions so far

- Desktop only: keyboard and gamepad. On a touch-only phone the game says so
  plainly; the About page works everywhere. A controller paired to a phone works.
- Name: KLEPTO, after KLP-2 ("Klepto") in the original. Credit Quazatron and
  Graftgold; don't use their name as the title.
- Structure: roguelite. Each deck is assembled from hand-made rooms. The way
  down never needs a particular module; sealed vaults do.
- Three sockets: DRIVE, ARM, CORE. Taking a module drops the old one as a
  pickup. Module grade comes from the class number of the droid you took it from.
- Colour: the player is always cyan. Each deck has its own hostile colour taken
  from the ZX Spectrum palette, and the deck shifts towards cyan as you claim it.
- No build step. Static ES modules; three.js is vendored into `vendor/` from
  npm (`pnpm install && pnpm vendor` after changing the version in package.json).
- Hosting: GitHub Pages via GitHub Actions, deployed from `main`. Public, live at
  https://peter-guillam123.github.io/quazatron/ with a card on the
  peter-guillam123.github.io index.

## Layout

- `index.html`: the game. `about.html`: the About page and diary.
- `src/`: game code (see the header comment in each file).
- `css/`: styles for the game UI and the About page.
- `vendor/three/`: three.js and the post-processing addons we use.
- `tests/`: Playwright smoke test and a headless balance check for the hack game.

## Running locally

    python3 -m http.server 8080

then open http://localhost:8080.

## Checking changes

- `node tests/decks.mjs` after touching rooms or the generator: every deck
  must stay finishable.
- `node tests/hack-balance.mjs` after touching the hack's rules or AI.
- `node tests/sim.mjs` after touching combat, parts or the AI: a bot plays
  whole runs headless and reports crashes and where the damage came from.
- For anything visual, drive the page with Playwright (preinstalled in cloud
  sessions) and look at screenshots. `window.klepto` is the game instance;
  `klepto.timeScale` speeds things up and `klepto.forceSeed` pins the next
  deck's layout.
