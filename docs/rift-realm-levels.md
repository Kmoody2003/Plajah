# Rift Realm — Level Design Bible

Status: 2026-11-17. Level 1 (Cyber-Forest Shrine) built; Level 2 (Glacial Citadel) in build.
Art source: `D:\plajah game assets deign from promtps\Shooter` (concept shots, blueprints, material sheets, flythrough videos).

## The feel: fast, frantic, upbeat

Kenne, 2026-11-18: Rift Realm is **fast-paced, frantic fun**. It moves fast and nimble and the tone is upbeat, not a slow
tactical shooter. Every system serves that:

- **Movement:** run speed 8.8–11.2 m/s depending on class, snappy acceleration (top speed in ~0.08 s), double jump,
  coyote time + jump buffer, and 2 dash charges (0.9 s refill) that carry momentum. The camera FOV opens with speed and kicks on a dash.
  Tuning lives in `src/player.ts` (top constants) and `src/vessels.ts`.
- **Enemies:** quick and jukey (5–7 m/s, strafe flips, 0.9 s attack cadence), so fights keep moving.
- **Levels:** the geometry has to reward speed. Wide lanes, jump-up ledges a double jump can clear (≈4 m), dash gaps,
  short time-to-contact, and verticality everywhere. Avoid long walks with nothing in them and narrow corridors that stall movement.
  The art still sets the look; the layout around it is tuned for flow.

## The rule: the art is the level

Every map is built so that a camera placed where the concept artist "stood" reproduces the concept shot: the same
landmarks in the same places, the same silhouettes, materials, light and weather. The concept shots are the acceptance
bar (paired capture: in-game frame beside the art). Where a shot does not show something (the back of a building, the
far side of a chasm), we design it in the same language, and it has to read as the same place.

The art shows big places, so maps are built at the scale the art implies (a person is about 1.8 m; read the doors, stairs and
railings against that). They are not shrunk to arena-toy size.

## Game Developer Council: how each seat shaped the levels

| Seat | What it insists on in Rift Realm |
|---|---|
| **Gameplay Virtuoso** (level design, feel) | Three lanes with distinct ranges: long, mid and close quarters. Every spawn has at least 3 exits, and no spawn sits in a dead end. One "weenie" landmark is visible from everywhere for orientation. Control points have high ground and at least 2 approaches. First contact comes 8–12 s from spawn in 6v6. |
| **Japanese World Auteur** (landmark, *ma*) | One iconic silhouette per map, such as the shrine monolith or the Void Shrine cathedral, framed by the lanes. Leave sky and mist (*ma*) around dense combat spaces so the place breathes. |
| **Real-time 3D Guru** (rendering) | PBR from the art's own material sheets, real-scale UVs, merged static geometry and one material per surface family. Fog and sky carry the mood rather than per-pixel noise. |
| **Silicon Pioneer** (hardware) | The Intel iGPU in a browser is the baseline. Use tiers (iGPU low, discrete high), measure on the target, and keep instanced foliage and debris culled. |

Canon: `services/game/council/ravencrestCanon.ts` (perf targets, art authority, never-stuck, fair tools).

## Research notes (online + battleground design)

- **Three-lane arena layout** with mixed engagement ranges. Lower floors are close quarters; upper floors give long sightlines (6v6 arena studies).
- **Spawn safety**: no dead-end spawns, and at least 3 distinct paths out of each spawn zone. Spawn selection checks enemy line of sight and proximity.
- **Large battlegrounds**: WoW runs 10v10/15v15 and 40v40 "epic" fights. GW2 WvW objectives can be contested by small *and* large groups. In Battlefield Conquest, the spacing of objectives is the real difficulty setting: front lines beat scattered points, and objectives must be close enough to guarantee contact.
- Capture points need **multiple elevations** so a small team can defend against a zerg, plus side objectives (buffs, boss) to split the battle.
- FFXIV Frontlines uses an inner arena worth extra points and outer capturable flags (three-team variant).

Sources: [multiplayer level design techniques](https://themindstudios.com/blog/multiplayer-level-design-techniques), [Lyra fissure arena (6v6 three-lane)](https://jasonvento.squarespace.com/game-projects/lyra-projects), [UT map design guide](https://www.seeles.ai/resources/blogs/unreal-tournament-map-design-arena-shooter-guide), [WoW battlegrounds](https://warcraft.wiki.gg/wiki/Battleground), [WoW epic battlegrounds](https://warcraft.wiki.gg/wiki/Epic_Battleground), [GW2 WvW](https://www.gamebanshee.com/u6da), [Battlefield player count vs map density](https://geekvibesnation.com/battlefield-player-count-vs-map-density/), [FFXIV Frontlines](https://www.redbull.com/ca-en/final-fantasy-14-frontlines-pvp-guide).

## Map sizes by mode (targets)

| Mode | Players | Playable footprint | Spawn → first contact | Objectives |
|---|---|---|---|---|
| Duel / Trials (solo vs waves) | 1 + bots | any | — | waves |
| Skirmish | 3v3 | 35–45 m | 4–6 s | power node |
| Team Arena | 6v6 | 90–130 m | 8–12 s | 3 control points (A/B/C) |
| Battleground (MMO-style) | 12v12 → 20v20 | 160–240 m | 12–18 s | 3 points + 2 side objectives (buff shrine, boss) + capturable forward spawns |

Every map ships with spawn sets for each mode it supports. Big maps fence off wings for smaller modes, so one art set serves 3v3 up to 20v20.

## Level 1: Cyber-Forest Shrine (3v3 Skirmish, 6v6 with outer ring)

Built from the *Cyber-Forest Arena* compact 3v3 blueprint and the central-shrine and chapel art. It is an octagon roughly 44 m across: W/E spawn alcoves, a raised ring with four stairways, a sunken pit holding the crystal monolith and the mega power-up node, ruined cover on the diagonals, and steel overlook galleries N/S.

## Level 2: Glacial Citadel (6v6 Team Arena, 12v12 Battleground)

Art: `Glacial_citadel_complex_shooter_map` (primary), `Glacial_Void_Shrine_temple_map`, plus the flythroughs (landing pad, ice bridge, ice cave, sniper balcony). Footprint ≈ 140 m × 200 m. North is the Void Shrine.

```
                N   VOID SHRINE CATHEDRAL (Team B spawn, portal)  ← weenie, aurora above
                    twin grand stairs ─ aqueduct bridges W/E
   ┌──────────────┬──────────────────────────┬─────────────────────┐
   │ ICE CLIFFS   │   RUINED GOTHIC HALL      │  EAST TOWER         │
   │ sniper       │   (2 floors, stairs)      │  (balcony, sniper)  │
   │ balcony      │                           │        ║ upper      │
   │   ║          │   SNOW COURTYARD  [B]     │  hard-light bridge   │
   │ ICE CAVE [A] │   pillars, crates, walls  │ ════ CHASM ═══ [C]   │
   │ (CQB tunnel) │                           │  lower hard-light    │
   │              │                           │  bridge (long)       │
   └──────────────┴────────── S ──────────────┴─────────────────────┘
           LANDING PAD + BATTLEMENT OVERLOOK (Team A spawn)
```

- **West lane, close quarters:** the ice cave tunnel under the cliff (point A), with the icy sniper balcony above it.
- **Centre lane, mid range:** the snow courtyard (point B) with broken columns, supply crates and low walls. The ruined hall gives a two-storey flank.
- **East lane, long range:** the chasm crossed by two hard-light bridges (point C on the lower bridge deck). The tower balcony overlooks it.
- **Spawns:** the landing pad and battlement (A team, S) and the Void Shrine portal (B team, N). Each has 3 exits (W, centre and E stairs).
- **Battleground extras:** a buff shrine in the ice cave's back chamber, and a forward spawn at the ruined hall.

## Levels 3–5 (built; art-match pass 2, 2026-11-18)

Each one is shot from the concept's camera and compared side by side: `docs/rift-realm-<level>-pass2.jpg` (art left, game right).

- **Obsidian Volcanic Compound** (`src/volcanic.ts`): Team A overlook 10 m up (SW). Below it, the flagstone compound with three
  lethal lava trenches (catwalks over two; the third is a dash gap). Then the gated two-level fortress block with a roof
  bridge onto the castle's 8 m upper tier, and the great gothic keep (Team B) with a 56 m spire. East: the lava chasm
  with grated bridges and the spiked laser-grid towers. The volcano sits right of frame with rivulets and an ash plume.
  Three ways onto the upper tier: grand stair, roof bridge, west-lane flight.
  **Interiors** (2026-11-18, `docs/rift-realm-volcanic-interiors.jpg`, art left):
  - **Forge hall** under the castle tier: a lower lane that runs from the compound up to the throne. Enter through
    the arch between the two tier stairs onto a deck. Stairs drop to walkways either side of a lethal lava channel,
    which two bridges cross. The hall holds rune anvils, weapon racks with cyan blades, lava falls from wall spouts,
    cyan wall circuits, and the forge reactor ring at the far end. Two steel stairs climb out: one to the tier top
    (west), one up into the throne hall.
  - **Throne hall** inside the keep: a gothic nave with clustered piers, pointed arcades and ribs, and a gold circuit
    runner down to a three-step dais. The spiked obsidian throne sits against three leaded lancets that picture the
    erupting volcano. Entrances: the great gate, side doors east and west, and the forge stair. The spire tower moved
    behind the keep.
- **Sunken Marshland Village** (`src/marsh.ts`): the balustrade overlook faces north, as in the concept. The manor sits
  left (three storeys, broken spire, 8 m grand stair into the water), green-lit causeways snake up the middle, with
  fallen giants as mid-ground cover and bridges. The stilt village and rope bridges sit right, under a 46 m hero
  cypress, with a treehouse platform at 13 m (sniper nest, one stair). Night is blue-grey, and the water is dark.
- **Celestial Void Citadel** (`src/celestial.ts`): Team A ledge 10 m above the ruin court. The citadels are weathered
  moss-grown stone, and the islands are deep inverted mountains. Hard-light bridges link six islands. The space has
  lit moons, asteroids, a void beam and nebula.
- Texture note: five material sheets (ash, lava, volcanic rock, swamp water, glacial ice) use their own panel
  layouts. `tools/prepAssets.mjs` now carries measured boxes for them, and every normal map's edges are checked
  for sheet-background bleed.

Still to do, by level:
- **Volcanic:** the interiors are built. Still short of the art: the stone reads warmer than the art's grey, and the
  forge lacks the overhead steel mezzanine and smoke.
- **Marsh:** the sunken shrine (N) and the swamp docks (NE) are built (`docs/rift-realm-marsh-shrine-docks.jpg`).
  - **Shrine:** a stepped temple tower on a two-tier plinth, with a sanctum room and an orb altar, guardian statues,
    steles, glowing mushrooms and cyan forecourt circuits. A causeway branch runs to it. It is the battleground buff shrine.
  - **Docks:** a spine pier, a cross pier, rift wells, rune circles, lantern gallows, a crane and boats. They form the
    low flank lane north of the village.
  - The wells are decorative: the engine has no jump pads yet. The canopy is still made of card clusters.
- **Celestial:** the lit cavern under the centre island needs real geometry. The nebula needs more structure.
- **All:** the Void Sanctum hub and its three maps from `void-sanctum-complete`.
