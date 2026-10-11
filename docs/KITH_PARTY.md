# Kith Party — Collection 01

A playable 2D browser party-game foundation in the Plajah repository. Ten characters, three games, solo and two-player shared-device play, and a three-round Party Cup. No account or external service is needed by the games.

## Play

- In Plajah, open **Games → Kith Party**. The game is lazy loaded into the Arcade.
- For development, run `npm run kith:dev` and open `http://127.0.0.1:3188/kith-party.html`.
- For a local release, run `npm run kith:build`, then `npm run kith:local`. Open `http://127.0.0.1:3188`.
- The standalone `dist-kith-party` folder contains all required assets. It can be hosted at a website root or copied to another computer with Node.js and started with `node start-kith-party.mjs` from that folder. No internet is required to play the local build. This is a browser build, not a native executable.

## Games

**Kith Circuit** — a top-down, guided-track kart racer with lane steering, throttle, braking, charged drift boosts, golden turbo pads, off-road penalties, three laps, and three bots in solo or two bots in local multiplayer. Arrow up / W accelerates; left/right or A/D moves across the track; hold Space / F while steering, then release to boost. First completed human race ends solo play; multiplayer waits for both humans or a two-minute limit.

**Crystal Scramble** — collect crystals in a shared arena for 60 seconds. Moving bumpers cost two crystals. Dash grants brief protection and has a cooldown. Bots compete for the same crystals.

**Chora’s Beat Garden** — a 45-second rhythm round with four lanes, perfect/good timing windows, combos, misses, and independent scores. Optional synthesized beat cues follow the chart. Solo plays for a personal best; two players compete side by side.

Keyboard: P1 arrows + Space; P2 WASD + F. Rhythm lanes: P1 left/down/up/right, P2 A/S/W/D. Standard controllers use stick/D-pad and A; rhythm uses the D-pad; Start pauses. Touch buttons are included for both players. Escape, window blur, and tab changes pause play. Physical controller testing remains manual.

## The Kith

Rello and Chora are exported from `components/mascots/mascot2dRuntime.ts`, retaining the canonical art. The runtime calls Rello `reello`; only the UI uses the requested spelling. Regenerate portraits using `node scripts/kith-party/portraits.mjs` with Edge installed.

Eight new editable vector characters: **Moki** (forest), **Zippi** (lightning), **Nori** (tide), **Pippa** (confetti), **Bram** (mountain), **Luma** (moon), **Tavi** (tinkerer), **Fenn** (snow). They follow the established outline-free hood, pale face, eye patches, colorful fin fan, speckles, and belly-symbol language. All characters have equal gameplay abilities. The new art is an initial vector interpretation, not final rigged 3D production art.

## Extending the gallery

`components/kithParty/catalog.ts` defines characters and game metadata. `engine.ts` holds deterministic, fixed-step game rules independent of React. `render.ts` draws each game in a 960×560 logical field. `KithParty.tsx` shares selection, input, pause, results, best scores, and the Party Cup. Add a game ID, catalog entry, state/step/render handling, and corresponding rule tests. The Cup iterates the catalog.

Best scores use a versioned localStorage key and tolerate unavailable storage. No accounts, online rooms, network synchronization, purchases, or cloud saves are implemented. Platform integration is source-level; deployment is separate.

## Validation

`npm run typecheck:kith`, `npm run test:kith`, `npm run kith:build`.

Browser smoke checks: `node scripts/kith-party/proof.mjs` (Edge). They exercise gallery filters, roster selection, game controls, pause/resume, all three games, mobile layout, and runtime errors. Evidence is saved under `artifacts/kith-party`.
