# Rift Realm — sound effects from the Flow videos, and the particle / special FX to build

Kenne, 2026-11-22: "a lot of sound fx clips in videos that I generated specifically for sound fx have not been used … the
main thing is being able to clip the sound fx … and study the particle fx and special fx we need to create in game."

## 1. Sound effects clipped from the videos

**Source:** all 155 videos in `D:\plajah game assets deign from promtps\Shooter`:
- `Nov 15 - 14_43`: 94 videos. They include the dedicated sound-design clips (Foley ×4, footsteps, cyber-melee, creature, monster, announcer ×2), the combat reels, creature reels and fly-throughs.
- `Cyber Forest Level Assets`: 25 creature motion studies.
- `motion capture body`: 36 videos (firing, reloading, hits, falls).

Every one of them has a generated soundtrack.

**Pipeline** (`scripts/riftrealm/sfx/`, run with `D:/Plajah Runtime/tela-py/Scripts/python.exe -I`):

| Step | Script | What it does |
|---|---|---|
| 1 | `extract.py` | Audio out of every video (48 kHz wav), via the ffmpeg in `imageio-ffmpeg`. This PC has no system ffmpeg. |
| 2 | `segment.py` | Splits each soundtrack into separate events: energy above the clip's own noise floor, gaps under 80 ms closed. |
| 3 | `classify.py` | Labels every event with the AudioSet AST classifier (`MIT/ast-finetuned-audioset-10-10-0.4593`, local, on the GPU), plus music and speech scores, so music beds and talking are filtered out. |
| 4 | `cut.py` | Sorts events into game categories. Each clip is mono mp3, 3 ms fade-in, 30 ms fade-out, tail trimmed at −40 dB, peak −1 dBFS, with a frame from the video at the event. |
| 5 | `build_review.py` | A review page with picture, player, labels and source time for each clip, plus a Keep tick box. |

**Result:** 807 events found, 694 clips cut (17 MB) in `D:/plajah-tmp/rift-sfx/clips/<category>/`. A copy for review
is in `scratch/rift-sfx/` (gitignored).

| Category | Clips | Category | Clips |
|---|---|---|---|
| energy (zaps, beams, magic) | 134 | ambience | 48 |
| impact (short hits) | 112 | gunshot / blasts | 37 |
| boom (long hits, explosions) | 93 | whoosh / swing | 28 |
| vocal (grunts, gasps) | 25 | metal / clang | 23 |
| creature | 21 | reload / weapon switch | 18 |
| footsteps | 8 | announcer | 5 |
| insect | 3 | misc (unlabelled, often good) | 139 |

**Review:** with the play server on 4358 running, open
`http://127.0.0.1:4358/@fs/C:/Users/Kenne/plajah/scratch/rift-sfx/review.html`.
- Click a picture to hear the clip and tick Keep.
- Picks are saved in that page's localStorage. "Copy kept list" copies them out, or Claude can read them from the browser pane.
- Labels are AudioSet's, so they're coarse. "Explosion" covers most heavy cinematic hits, and some "gunshot" clips are energy blasts. The picture shows what made the sound.

**Next:** the kept clips go to `public/games/rift-realm/assets/audio/sfx/` and into `rhythm.ts`'s sample banks (shots, hits,
kills, melee, reload, creatures, ambience), alongside the 22 ElevenLabs sounds from da70caab. Not done yet; it waits on Kenne's picks.

## 2. Particle and special FX seen in the videos

Frame sheets: `docs/rift-realm-fx/sheet0.jpg` … `sheet3.jpg` (5 frames each from 16 effect-heavy videos).

| Effect | Where it's seen | Building blocks |
|---|---|---|
| **Frost breath beam**: twisting cyan energy, ice shards bursting at the target, a frost burst on the ground, a round hex shield blocking it | Dragon exhaling frost beam | beam (scrolling noise, two helices), shard burst (mesh particles), ground decal, shield (fresnel bubble with hex cells) |
| **Laser roar**: purple charge ring with arcs, a thick beam, sparks and debris at the hit | Dragon laser roar | charge ring (radial lightning), beam, spark burst, rock debris (physics chunks), screen shake |
| **Ice magic**: a growing crystal wall, frost trail on the staff swing, ice spikes in a ring, snow mist | Sorceress magic combat | crystal growth (mesh scale-in), ribbon trail, ground spikes (instanced mesh pop), soft mist particles |
| **Prism / hard light**: orbiting prism drones, a cloud of shards, a crystal barrier, light lances | Prism Archon | orbiters, GPU point cloud, procedural shard wall, line beams with glow |
| **Fire weapons**: flaming axe trail, radial spark burst on block, ground fire, embers | Pyre Knight Berserker, Demon combat | ribbon trail (additive flame texture), spark burst (stretched velocity sprites), ground fire decal, rising embers |
| **Lava ground-slam**: cracked lava web spreading, magma chunks flying, smoke | Titan battling warrior, Demon combat | crack decal with an animated emissive mask, chunk particles, smoke |
| **Electric body**: lightning crawling over a creature's skin and tail, eye arcs | Creature electrical, Bioluminescent wasp (stinger bolt) | surface arcs (emissive noise lines on the mesh), branching bolt (L-system line), spark puffs |
| **Holographic wall break**: a glowing cube wall shatters into floating voxels | Rhino charging through hologram | voxel shatter (instanced cubes with velocity, fade), additive cyan material |
| **Shadow strike**: purple crescent slash arcs, a burst of dark shards on the finisher, a speed-trail afterimage | Assassin shadow combat, Void Stalker | crescent slash mesh (UV-scrolled), shard burst, ghost trail (copies of the skinned mesh fading out) |
| **Cyber melee impacts**: sparks off armour, a cracked-armour glow, steam vents | Cyber-melee sound design | sparks, damage decal, steam particles |
| **Spore / pollen drift**: glowing motes and wisps round the sloth and the mushrooms | Sloth emitting, Glowing mushrooms | slow curl-noise particles: one GPU system for the whole forest |
| **Energy bridge**: cyan grid surface with circuit flow | Camera crossing cyan energy bridge | scrolling circuit material (we already have `decals.ts circuitTexture`) |
| **Forge**: lava channels, heat haze, smoke columns, sparks | Volcanic armory forge | flow-mapped lava, screen distortion, smoke, sparks |

### What the game has today
- The shot beam with an impact flash, and the viewmodel's muzzle kick (`main.ts spawnBeam`, `player.ts`).
- Water, wetness, the nebula sky, and the vegetation's GPU spores (`services/vegetation/fungi/field.ts`).
- No general particle system, trails, decals pool or shatter.

### What to build: a shared `services/vfx` in TSL (WebGPU compute)

These are the reusable pieces behind all the effects above.

1. **GPU particle system.** Compute-driven emitters: burst / rate / attached, plus forces (gravity, drag, curl noise, attractor) and depth collision. Render modes: soft additive sprite, velocity-stretched spark, and instanced mesh (shards, chunks, voxels). Sorting is only needed for alpha smoke.
2. **Ribbon trails.** Weapon and limb trails, and slash crescents from a socket's past positions, with a texture scroll.
3. **Beams.** Core plus glow, noise-scrolled, optional helices, branching lightning. The shot beam moves onto it.
4. **Decals pool.** Scorch, frost, cracks with an animated emissive mask, blood or ichor, projected on terrain and kit.
5. **Shockwaves and distortion.** A ring mesh plus a screen-space refraction pass for heat haze and blast waves.
6. **Shields and bubbles.** Fresnel, hex cells, hit ripples at the contact point.
7. **Shatter.** Turns a mesh or box into instanced pieces with velocities (holo walls, crystal walls, ice).
8. **Screen feedback.** Shake, hit-stop, chromatic kick, vignette flash. Some of this exists in `post.ts`.

Each effect is a small JSON recipe over these pieces (emitters, colours, timings, sound cue), so a recipe can name the
clip from section 1 that plays with it. That ties the sound library and the FX together, and Game Studio can edit both.

Suggested order: particles and sparks (they fix the bare look of hits) → trails and slashes (gun-fu melee) → beams and
lightning → decals → shatter, shields and distortion.
