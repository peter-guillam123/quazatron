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
- Onboarding: a first run starts with the induction, a fixed deck 1 in
  `src/world/induction.js` (skippable, replayable from the title). The hack
  teaches one part per won board (`src/hack/lessons.js`, `meta.lesson`).
- Fun layer (October 2026 round): scrap and fabricators, ring-outs, clean
  hacks (win by 4+: two parts), turning droids into a gang of up to three,
  speech bubbles, a named bounty per generated deck, today's tower (seeded
  by the date, first go counts, shareable squares).
- Hack difficulty slope: lesson boards carry 2-3 of the new part and 4-6
  parts in all; ordinary boards follow `partsBudget(cls)` in
  `src/hack/board.js` below class 500 and are untouched from 500 up (their
  balance relies on the old generator's habits). Dents (a third, two thirds
  of integrity) cost the droid pulsers and are shown on the board. Wire hints
  colour each port by where it lands: on in lessons, or via the setting.
- Combat (October 2026 review): lock-on bracket (`src/world/lockon.js`) picks the
  arm's target, right stick aims; bumper taps to jab, holds to wind up a shove;
  wheels swerve (bolts pass through); knocks into walls slam and stun, into
  droids pile up; stunned droids take double damage; every enemy attack paints
  a floor warning that locks a moment before it lands (`src/render/telegraph.js`);
  damage numbers (setting) and dent marks on health bars; each combat room has
  a caged prize that opens when its droids are dealt with.
- Droid personality: each family has its own voice in `src/lines.js` (VOICES,
  falling back to LINES), overheard droid-to-droid CHATS (some keyed to your
  history), ! and ? emotes, family body language in `DroidModel.manner`, and
  patrol habits by temper in `src/world/ai.js` (PATROL).
- The Heap and progression: between runs KLP-2 is rebuilt in the Heap
  (`src/world/heap.js`, deck 0, built by hand). Data from hacks persists
  (`meta.data`); Nan's bench sells permanent notches (`src/progress.js`).
  Fresh start is 70/70 (was 100/100); today's tower uses a fixed 80/80 kit.
  The cast and every story line live in `src/story/cast.js` (`pick` chooses
  by priority and marks once-only lines heard in `meta.heard`); portraits are
  drawn in `src/story/portrait.js`. `START=70 node tests/sim.mjs` runs the
  bot at a given starting strength.
- Hack presentation (`src/hack/view.js`): a cached circuit-board substrate,
  copper traces that glow and flow when lit, comet pulses, glass capsule
  cells (a fresh board's cells start settled, `flipT: 9`), a tug-of-war tally,
  a fuse and clock, faces either side when the window is wide enough, and
  family heckles from `session.heckle()` (lines `hackStart`, `hackAhead`,
  `hackBehind`, `hackEmpty`). The reveal is keyed on the board, not the round.
- Extras: the end screen is the Tower Gazette (`src/story/gazette.js`,
  written from the run). KLP-1 is a rival family (`rival: true`, never
  generated): from your third run it may drop into a combat room on one deck
  (`run.klp1Deck`). Three hack wins (`meta.klp1Wins`) offer "Bring it home",
  which sets `meta.klp1Turned` and puts it in the Heap.
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
  deck's layout. `klepto.meta.lesson = 99` skips the hack lessons and
  `klepto.meta.inductionDone = true` skips the induction prompt.
- Software rendering in the test browser runs at a couple of frames a
  second, so wait on conditions (state, flags) rather than fixed delays, and
  raise `timeScale` for long waits like the lift ride.
