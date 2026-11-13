# Kith Party — Collection 01

A playable browser party-game collection in the Plajah repository. Ten characters, three games, solo and two-player shared-device play, and a three-round Party Cup. No account or external service is needed by the games.

## Play

- In Plajah, open **Games → Kith Party**. The game is lazy loaded into the Arcade.
- For development, run `npm run kith:dev` and open `http://127.0.0.1:3188/kith-party.html`.
- For a local release, run `npm run kith:build`, then `npm run kith:local`. Open `http://127.0.0.1:3188`.
- The standalone `dist-kith-party` folder contains all required assets. It can be hosted at a website root or copied to another computer with Node.js and started with `node start-kith-party.mjs` from that folder. No internet is required to play the local build. This is a browser build, not a native executable.

## Games

**Kith Racing** (game id `circuit`) — a 3D kart racer. Sim in `race.ts`, track data in `course3d.ts`, set pieces in `trackFeatures3d.ts`, rendering in `circuit3d.ts`, FX and post-processing in `fx3d.ts`.

- **Driving:** real throttle / brake / reverse (auto-gas is on by default), kart stats per Kith type (`abilities.ts`: speed, accel, handling, weight, off-road), hop-drift with Blue → Orange → Ultra mini-turbos, brake dive / accel squat / landing compression on 4-wheel suspension, rubber burn (skid marks + tyre smoke) on drifts, hard turns, hard braking and wheelspin, wall scrapes, kart-to-kart bumps by weight, slipstream, rocket start on the last beat of the countdown.
- **Courses (6):** five circuits (3 laps) and **Ember Ridge Run**, a point-to-point volcano sprint (open route). Every course has jump ramps (some over gaps — too slow and a rescue drone lifts you back), a mid-air trick boost, tunnels and bridges, timed obstacles (crushers, pendulum hammers, rolling boulders, fire / geyser jets, slicks), item-box rows and boost pads. Amazon Canopy has 3 vertical loops, Polar Vortex 1. Shortcuts are found automatically across hairpins that clear all other road (currently Crestfall, Dune Canyon, Polar Vortex); they are dirt, so they pay off with a boost or a Grove kart.
- **Items:** Seed Bolt, Homing Hornet, Goo Mine, Nitro, Triple Nitro, Bubble Shield, Thunder Crown — position-weighted rolls.
- **Type Specials** (meter fills over time, from drift boosts, item boxes and hits): Flare Inferno Afterburner, Resonance Bass Drop, Grove Bramble Snare, Volt Chain Lightning, Tide Riptide Wave, Bloom Confetti Storm, Terra Boulder Bash, Astral Moon Warp, Alloy Gear Shield, Frost Glacier Wake.
- **Controls:** P1 arrows · Space drift/trick · Enter item · Right Shift special. P2 WASD · F · G · H. Gamepad: stick, A drift, X item, Y special, RT gas, LT brake. C toggles the camera.

**Track morphs:** each course has 1–3 morph zones (`courseMorphs` in `course3d.ts`) right after a jump or beside a bridge. When the leader passes the trigger, a seeded 60% roll may shift the section for 6–12 s into either a **short** shape (straightened + compressed, ~20% less distance) or a **long** humped arc. `trackFrame` is morph-aware, so road strips, karts, items, obstacles, camera and minimap all follow; energy rails and a chevron field mark the zone. **Steering** is a heading model (front-wheel angle → yaw rate capped by grip, self-aligning), so karts turn rather than strafe. **Intro:** 8 s course flyover (crane orbit, low fly-through, start-grid sweep; skip with Space/Enter/tap) then a drone shot into each player's kart during 3-2-1. Chora/Reello drivers are the Draco-compressed `rello.glb`/`chora.glb` (decoder self-hosted at `public/kith-party/draco/`).

**Art benchmark:** `docs/kith-party/kith-racing-benchmark.jpg` (the KITH PARTY "Kart & World Exploration" key art) is the visual target for every course. `sanctuaryKit3d.ts` builds the environment kit from it, themed per course: stratified cliff massifs with terraced waterfalls and rim shrubs, two-tier stone viaducts, the white-stone balustrade with glowing ▲▼ inlays, lantern pillars and pennants (replaces the flat barrier walls), carved tunnel ridges with masonry portals, stone arcades under arch bridges, crystal flame-blades in pointed stone frames, gnarled sakura (Crestfall) and craggy horizon spires.

**Kart Kombat** (game id `kombat`, outside the Party Cup) — 8-kart battle royale in a stadium arena with a shrinking storm, loot crates (gold crates in the centre), 100 HP and 3 lives per kart, items and Type Specials. Last kart standing, or most KOs at 3:30. Engine `kombat.ts`, renderer `kombat3d.ts`, UI `KombatSession.tsx`.

**Kith Tennis** (game id `tennis`, in the Party Cup) — 3D arcade tennis, singles or doubles, on six venues that reuse the Kith Racing worlds and art: Crestfall Garden Court (grass, fast, low), Dune Canyon Clay (slow, high kick), Canopy Hard Court, Polar Vortex Ice Court (fast, players slide), Abyssal Dome (neon carpet) and Ember Ridge Basalt (high bounce). Engine `tennis.ts`, renderer `tennis3d.ts`, UI `TennisSession.tsx` + `tennis.css`, tests `tests/kithTennis.test.ts`.

- **Rules:** real court dimensions and net sag, real scoring (15/30/40, deuce and advantage, tie-break at games-all), first and second serves, faults, lets on net cords, double faults, aces. Formats: Quick (first to 2 games, golden point; used by the Party Cup), Classic (4 games), Full set (6). Bots: Rookie, Pro, Ace.
- **Shots:** press a shot button early and hold it to plant and charge; the stroke fires when the ball arrives, and steering at contact aims it (toward the net = deeper). Topspin dips and kicks, slice floats and skids, lob, drop shot (slice then topspin), automatic volleys at the net, smashes on high balls, and a dive when the ball is out of reach. Timing gives PERFECT shots; pace and hitting on the run add error. Humans who press nothing still block-return close balls. Serve: toss, then hit at the top of the toss.
- **Kith Specials:** each type has its own special shot (meter fills from good shots and points): Inferno Drive, Bass Drop, Bramble Kick, Chain Zag, Riptide Curve, Confetti Decoy, Boulder Smash, Moon Warp, Gear Lob, Glacier Slice.
- **Art:** same sky dome, environment map, tone mapping, FX and PostFx as the races. `buildArenaKit` in `sanctuaryKit3d.ts` lays the sanctuary kit (terraced massifs and waterfalls, carved Kith masks, viaducts, crystal shrines, sakura, horizon spires, white balustrade with ▲▼ inlays, lantern pillars, pennants) around the stadium. Stands with an animated crowd, umpire chair, live scoreboard, signage boards, landing marker, shot-coloured ball trail, bounce marks, surface-specific bounce FX. Chora/Reello use their rigged GLBs (idle/hop/cheer/excited/almost), others the drivers.glb models; every Kith carries a racket in its kart colours.
- **Controls:** P1 arrows · Space topspin · Enter slice · Left Shift lob · Right Shift special. P2 WASD · F · G · R · H. Gamepad: stick/D-pad, A topspin, B slice, X lob, Y/RB special. C switches Broadcast / Behind-player camera.
- The old 2D court rally in `engine.ts`/`render.ts` is no longer routed but is kept for its existing tests.

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

`npm run typecheck:kith`, `npm run test:kith`, `npx tsx --test tests/kartKombat.test.ts`, `npm run kith:build`. Labs: `labs/kart-kombat` (:3253) and `labs/kith-fx` (:3261).

Browser smoke checks: `node scripts/kith-party/proof.mjs` (Edge). They exercise gallery filters, roster selection, game controls, pause/resume, all three games, mobile layout, and runtime errors. Evidence is saved under `artifacts/kith-party`.
