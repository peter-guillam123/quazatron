# KLEPTO

A roguelite for the browser after *Quazatron* (Graftgold, 1986). You are
KLP-2, a small droid with a grapple in a tower full of bigger ones. Latch on
to a droid, beat it in a circuit-board duel and steal one of its parts:
thrusters, a laser, a cloak and six more. Or turn it cyan and it joins your
gang. Each part changes how you fight and which sealed vaults you can open.
Five decks, then the Mainframe.

Your first run starts with the induction, a hand-built deck that brings
things in one at a time, and the hack teaches its parts one board at a time.
After that: scrap from wrecked droids to spend at fabricators, ring-outs for
knocking droids into the void, a named bounty on every deck, and today's
tower, the same five decks for everyone each day.

**Play it at https://peter-guillam123.github.io/quazatron/**

Desktop only, played with a keyboard or a gamepad. There's an
[About page](https://peter-guillam123.github.io/quazatron/about.html) with
the story of how it was made.

## Controls

| | Keyboard | Gamepad |
|---|---|---|
| Move | WASD or arrow keys | Left stick |
| Aim (the bracket picks a target for you) | | Right stick |
| Grapple, pick up, use the lift or a fabricator | Space | A |
| Arm part (fire, discharge, pull; hold the bumper to wind up a shove) | J or Z | X |
| Drive part (swerve on wheels, dash, hover, stamp) | K, X or Shift | B |
| Core part (shield, cloak, phase) | L or C | Y |
| Parts and firmware | Tab or I | Back |
| Pause | Esc or P | Start |
| Zoom | + and - | |

In a hack: up and down pick a wire, Space fires; left and right pick a side
before it starts.

## Running it

There's no build step. From the repository root:

    python3 -m http.server 8080

then open http://localhost:8080.

## Tests

These run in Node with no browser:

- `node tests/decks.mjs` generates 1,800 decks, plus the induction, and
  checks that every one can be finished: from the start you can reach the
  lift, the command droid, every droid, terminal and fabricator without
  needing a particular part.
- `node tests/hack-balance.mjs` plays thousands of hacks between a decent
  player bot and the droid AI and prints win rates by class, then for each
  of the lesson boards.
- `node tests/sim.mjs` sends a simple bot through whole runs with no
  rendering, to catch crashes and see where the damage comes from.

With a local server running, `node tests/smoke.cjs` drives the real game
in headless Chromium through a hack, a salvage and a lift ride, and fails on
any page error. `tests/hack-board.html` lets two AIs play a hack board so
the drawing can be checked by eye.

## How it's built

- `src/world/`: the tile grid, physics, droids, parts, AI, devices, room
  templates, the induction, scrap and the deck generator.
- `src/hack/`: the hack's rules, its lessons, its AI opponent, the session
  and the drawing.
- `src/render/`: the three.js renderer, level meshes, droid models,
  particles, lighting and the 1986 mode shader.
- `src/game.js`, `src/ui.js`, `src/audio.js`, `src/input.js`: the run, the
  menus and HUD, the synthesised sound and the controls. `src/lines.js` is
  what the droids say; `src/daily.js` is today's tower.
- `vendor/three/`: three.js 0.186.1 and its post-processing passes, copied
  from npm by `pnpm install && pnpm vendor`.

It deploys to GitHub Pages from `main` through `.github/workflows/pages.yml`.

## Credits

*Quazatron* was written by Steve Turner at Graftgold and published by Hewson
in 1986, after Andrew Braybrook's *Paradroid* (1985). KLEPTO borrows their
ideas, not their code or graphics. Built with [three.js](https://threejs.org).
Fonts: Chakra Petch and IBM Plex, under the SIL Open Font License.
