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
  Teaching the loop (November 2026): the first droid you ever break open
  freezes the game with a big "Now hack it" call-out (`Game.teachOpen`, state
  `teach`, `meta.taught.open`); the first hack is a walk-through
  (`HackSession.guide`, `meta.taught.hack`) that holds the clock and the
  opponent until a cell changes hands; a new lesson opens on a big sign
  (`HackSession.sign`, drawn by `HackView.drawSign`). In the induction a strip
  shows ram it open, hack it, take it (`Game.updateLoop`, `UI.setLoop`), the
  Mite cowers instead of fleeing, and a lost hack does no harm. The
  induction's Mite and Spark always teach hack lessons 0 and 1 (`hackLesson`,
  `opts.forced`), and the Mite always freezes, so a replay teaches everything
  again; `meta.lesson` only ever goes up.
- Fun layer (October 2026 round): scrap and fabricators, ring-outs, clean
  hacks (win by 4+: two parts), turning droids into a gang of up to three,
  speech bubbles, a named bounty per generated deck, today's tower (seeded
  by the date, first go counts, shareable squares).
- Hack difficulty slope: lesson boards carry 2-3 of the new part and 4-6
  parts in all; ordinary boards follow `partsBudget(cls)` in
  `src/hack/board.js` below class 500 and are untouched from 500 up (their
  balance relies on the old generator's habits). Open and critical (below
  `OPEN_AT`, `CRIT_AT`) cost the droid one and two pulsers, shown on the board. Wire hints
  colour each port by where it lands: on in lessons, or via the setting.
- Combat (October 2026 review): lock-on bracket (`src/world/lockon.js`) picks the
  arm's target, right stick aims; bumper taps to jab, holds to wind up a shove;
  wheels swerve (bolts pass through); knocks into walls slam and stun, into
  droids pile up; stunned droids take double damage; every enemy attack paints
  a floor warning that locks a moment before it lands (`src/render/telegraph.js`);
  damage numbers (setting) and the open line on health bars; each combat room has
  a caged prize that opens when its droids are dealt with.
- Sealed and open (November 2026): a hostile droid above `OPEN_AT` (60%) of
  its integrity is sealed (`Droid.sealed`): grapples bounce, knocks are
  halved and it braces at edges (no ring-outs). Below it, it's open and fizzes;
  below `CRIT_AT` (30%) it's critical. Cloak ambush gets in regardless. Raised
  shields stop jabs and bolts; a full shove, a dash or the arc breaks the guard
  (`World.breakGuard`, `Droid.guardT`). Recruits keep their integrity and hit
  by `condition` (0.4 + 0.6 x health when turned).
- Droid personality: each family has its own voice in `src/lines.js` (VOICES,
  falling back to LINES), overheard droid-to-droid CHATS (some keyed to your
  history), ! and ? emotes, family body language in `DroidModel.manner`, and
  patrol habits by temper in `src/world/ai.js` (PATROL).
- The Heap and progression: between runs KLP-2 is rebuilt in the Heap
  (`src/world/heap.js`, deck 0, built by hand), at the bottom of the tower.
  Runs climb: up the chute into Intake, lifts up to the Mainframe at the top
  (`Game.ascend`); wrecked, KLP-2 falls back down the chute. Data from hacks persists
  (`meta.data`); Nan's bench sells permanent notches (`src/progress.js`).
  Fresh start is 60/60; eight notches each of plating and cells reach 100.
  Today's tower uses a fixed 80/80 kit. Repairs show on KLP-2
  (`wear(meta)`, `DroidModel.buildWear`): holes and a flapping panel
  (plating), a sputtering visor (cells), a wobbly wheel (servos), the aerial
  (patience), a back pocket (pockets); the bench shows KLP-2 turning
  (`UI.benchKlp`). Saves moved to `klepto.v2` in November 2026; an older
  save starts again, keeping settings, archive and lessons (`src/meta.js`).
  The cast and every story line live in `src/story/cast.js` (`pick` chooses
  by priority and marks once-only lines heard in `meta.heard`); portraits are
  drawn in `src/story/portrait.js`. `START=70 node tests/sim.mjs` runs the
  bot at a given starting strength.
- Kept and this run are kept apart everywhere: gold for this run (scrap,
  parts, firmware, gang), cyan for kept (data, Nan's repairs, spares, the
  archive). HUD counters carry captions; Tab opens the KLP-2 sheet
  (`UI.loadout`, every stat split into kept and run); the end screen closes
  with a Kept / Lost tally (`Game.ledger`), explained the first time.
- Hack presentation (`src/hack/view.js`): a cached circuit-board substrate,
  copper traces that glow and flow when lit, comet pulses, glass capsule
  cells (a fresh board's cells start settled, `flipT: 9`), a tug-of-war tally,
  a fuse and clock, faces either side when the window is wide enough, and
  family heckles from `session.heckle()` (lines `hackStart`, `hackAhead`,
  `hackBehind`, `hackEmpty`). The reveal is keyed on the board, not the round.
- Books: the archive and the how-to share `src/book.js` (index of tabs on the
  left, page on the right; focus turns the page). The archive
  (`src/archive.js`, words in `src/story/fieldguide.js`) shows each family's
  real model turning on a plinth (`src/render/studio.js`, its own WebGL
  canvas) and fills in by tier: seen, hacked once, complete at three hacks
  (+5 data, Nan's second note). Cast pages list story lines heard. The
  how-to is `src/manual.js`: chapters with SVG drawings.
- Each run deals its decks different bounty names (`run.bountyNames`).
- Bosses and pieces of you (`src/story/relics.js`): each generated deck's
  command droid is its boss (`Droid.boss`, tougher by deck, `bossMult`) and,
  while it still has one, wears a piece of the old KLP-2 (`Droid.relic`, a
  cyan core on its back). Beating it (`World.grantClearance` checks it's
  really down) offers the remaining pieces for that deck; one is kept in
  `meta.relics` and shows on KLP-2 (`buildWear`). Effects go through
  `Game.hasRelic` (off in today's tower), `Game.applyRelics` and
  `World.refreshRelics`.
- The story (the Merge): a new player's New run boots KLP-2 (`Game.wakeUp`,
  the boot screen), then Nan's `woke` lines in the Heap (`meta.woke`); the
  first climb is the induction. The first time a deck from 2 to 6 is
  reached, a memory plays first (`src/story/memories.js` for the scenes,
  `src/memory.js` stages and plays them through the Spectrum pass, state
  `memory`, `meta.memories`). The archive has a Memories group.
- The ending and pressure: beating the Mainframe plays `ENDING` (in
  `memories.js`, full colour, `retro: false`) before the special-edition
  Gazette. Reaching the roof at pressure p unlocks p + 1 (`meta.pressureMax`,
  up to 5); the chute then offers a choice (`Game.choosePressure`,
  `run.pressure`): droids +15% integrity and +10% damage a notch, bosses +1
  pulser from 2, data +25% a notch. Not in today's tower or the induction.
- Saying less (November 2026 audit): a deck starts with its name only
  (`UI.deckCard`). Static says one line per deck at most (`Game.radioLift`:
  first-visit intro, else a remark on the last deck, never the same twice
  running) and explains bosses and bounties once, at first sight
  (`Game.radioFirst`, `bossSpotted`, `bountySpotted`). The HUD deck panel is
  name, claim and lift. Tips queue one at a time and wait out a deck's first
  seconds (`UI.hint`, `holdHints`); none in the induction (`Game.quietTips`).
  A toast only for news nothing else on screen shows; otherwise `announce`.
  The induction's lesson rooms are gated (`gates` in `inductionPlan`,
  `World.makeGates`, opened when `roomGuards` hits 0) and its droids leashed
  (`Droid.leash`: bridges are walls to them, and they ignore targets outside
  their room). A droid's `lesson` ('hack': can't be wrecked or rung out,
  and comes back if it falls; 'ringout': can't be wrecked) keeps each lesson
  from being skipped, and `give` makes its hack offer that one part. Floor
  signs size themselves to their words (`src/render/signs.js`).
- Gazette photos (November 2026): `src/render/photo.js` takes pictures
  straight after a frame is drawn (`Photographer.take`, `develop` in the
  frame loop), framed on given points, grey and small, and prints them as a
  halftone (`halftone`). The main picture is the death (`Game.deathShot`,
  `takeDeathShot`, KLP-2 hidden after it), the roof (`ENDING.photo`), or the
  last moment when you leave; "Also in this issue" is the run's biggest
  moment (`Game.pressPhoto`, scored: boss 100, bounty 80, KLP-1 70, ring-out
  60, claim 50, recruit 30). The last ten issues are kept apart from the
  save in `klepto.v2.issues` (`src/issues.js`) and shown in the archive's
  Back issues.
- Share card: `assets/social.jpg` (1200 by 630), a staged full-colour scene
  (`MemoryPlayer.stage` with `retro: false`) with the title laid over it;
  Open Graph and Twitter tags on both pages.
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
