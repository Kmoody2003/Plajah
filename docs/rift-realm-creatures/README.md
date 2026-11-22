# Rift Realm — Elderwood creature skeletons and clips (2026-11-22)

All six Cyber Forest / Elderwood creatures now have real skeletons. They are skinned meshes that play animation
clips, replacing the per-vertex TSL motion. The combat code's reactions reach them through `EnemyBody.rig`
(enemies.ts `anim(e)`), and so can the predator code, through `CreatureBody.rig`.

- Rigged GLBs: `public/games/rift-realm/assets/creatures/rigged/<file>.glb`. The mesh, UVs, textures and glow map are
  the same as the originals, with the skin and clips added.
- Runtime: `games/rift-realm/src/creatureRig.ts` (`CreatureRig`: `has / play / strike / hold / release / update`, plus
  additive `crouch` and `tell` pose layers). `creatures.ts` `CreatureBody` uses it when the rigged file loads, and
  falls back to the old TSL motion when it doesn't. `CreatureBody.rig` is a stable proxy for the one-shot API.
  `elderwood.ts` and `cyberforest.ts` pass `rig: b.rig` to the enemies.
- Moth swarm: still one instanced draw. At load, the moth rig's `fly` clip is skinned on the CPU into a
  vertex-animation texture, and every moth plays it at its own phase.
- Build: `scripts/riftrealm/creatures/` (`specs.py` skeletons, `rig.py` fit / skin / GLB writer, `tracks.py` video marks,
  `clips.py` + `clips_other.py` clips). `python rig.py <kind> --write` rebuilds one creature. Add
  `--pose <clip>` to get posed check renders in `D:/rr_work/creatures`.
- Lab: `creature-lab.html?kind=wolf&speed=4` on the rift-realm dev server (:4335). It shows clips as buttons and has
  `view=front|side|back`, `clip=…&t=…` and `swarm` options.
- Captures: `scripts/riftrealm/creature_shots.mjs` (in the level), `creature_lab_shots.mjs` (lab views).

## Skeletons

Each skeleton was placed on orthographic guide renders of its mesh (front, side and top, on a 0.1 m grid) and
checked against the turnaround. Leg joints are re-centred in the mesh's cross-section. Skin weights are geodesic:
they are measured along the surface from each bone's segment, so a leg never drags the belly it sits next to. Left
bones only reach the left side and right bones the right. Weights keep the top 4 bones per vertex and are smoothed.

| creature | bones | layout |
|---|---|---|
| electric_wolf | 28 | quadruped: pelvis, spine, chest, neck, head and jaw; 3-bone tail; scapula, shoulder, elbow, wrist and paw; hip, stifle, hock and foot |
| lumen_deer | 30 | quadruped as above, with a 2-bone neck and ears (no jaw). The built antlers ride on the head bone |
| venom_mantis | 27 | insect: thorax, 2-bone abdomen, prothorax, neck, head, antennae; raptor arms (coxa, femur, tibia); 4 walking legs (the mesh and art have 4 plus the raptors) |
| plasma_wasp | 33 | insect: thorax, head, antennae; abdomen chain of 3 plus the stinger; forewing (2 bones) and hindwing; 6 legs (3 bones each) |
| storm_bat | 29 | bat: pelvis, spine, chest, head, ears; arm, forearm, hand, and 3 wing fingers (d2 and d3 two-bone, d4); legs. The finger layout follows the skeleton overlay in "Bat motion study and skeleton" (faa32975) |
| glow_moth | 25 | insect: thorax, head, 2-bone abdomen, feathered antennae, forewing (2 bones), hindwing, 6 legs |

## Clips: what came from video and what was authored

| creature | from video | authored |
|---|---|---|
| wolf | **run**: be8ff43f frames 160–171, one gallop cycle in the skeleton pass. Near-side paws, shoulder, hip, skull and tail tip were marked on 6 frames and solved with leg IK. The far legs are hidden in the frames, so they trail the near legs by 0.12 cycle. **attack**: rearing lunge-bite, frames 312–332 (rear angle, paw reach, jaw timing) | idle, hit, hit_heavy, parried, launch, knockdown, get_up, death, eat, crouch / tell layers |
| deer | **walk**: 118ce3df frames 171–207. The overlay is too busy to mark every joint, so the cycle length (32 frames), stride reach, hoof lift, duty factor and footfall order were measured there. The foot paths are generated from those numbers | attack (antler butt; the footage has none), idle, eat, all reactions, layers |
| mantis | **attack**: 5cac7ba7 frames 120–153. Guard, wind-up, slash, then snap and follow-through, keyed off those frames. **attack_2**: the one-arm swipe, frames 147–153 | walk (diagonal pairs on the 4 legs), idle, reactions, layers, `art` pose |
| wasp | **attack**: 2c45a3d5 frames 140–187 (abdomen curls under and fires). **fly**: stroke amplitude from the blur in the front views. The beat itself is too fast for 24 fps footage, so its frequency is authored | reactions, layers, `art` pose |
| bat | **fly**: 203f70c5 frames 31–54, one beat of shoulder elevation and hand fold. **attack**: screech (frames 62–90) and forward wing sweep (frames 109–124), keyed as poses | reactions, layers |
| moth | **fly**: ecc03df8 frames 93–115, one beat of forewing elevation (front view) | attack (a dart; not an enemy today), reactions, layers |

Clip names everywhere: `idle`, `run|walk|fly`, `attack` (+ `attack_2` on the mantis), `hit`, `hit_heavy`, `parried`,
`launch`, `knockdown`, `get_up`, `death`, `eat` (wolf, deer). The provenance of each clip is in the GLB:
`asset.extras.rig.clips[name] = { source, video, frames, note, hit_at }`. `attack()` starts the clip just before its
contact frame (`hit_at`), because enemies.ts and the predators call it when the hit lands.

## Fidelity against the turnarounds (`render_views.mjs` → `score_views.py`, 0.6 × IoU + 0.4 × colour)

| creature | front | side | back | note |
|---|---|---|---|---|
| wolf | 83.0 | 85.4 | 87.1 | |
| mantis | 64.3 | 83.6 | 64.7 | scythe spread and proportions differ from the art |
| wasp | 58.2 | 89.7 | 59.6 | the art's front and back show the wings spread; the mesh's wings sweep back (an `art` pose gets 65 / 76 / 69) |
| deer | 76.0 | 89.0 | 71.2 | the art's antlers and ears are much bigger |
| bat | 91.2 | — | — | the mesh is the spread-wing frame from 203f70c5; the turnarounds show the wings folded |
| moth | 93.5 | 49.3 | 71.0 | the art's side view shows the wings swept back; the mesh's wings are flat |

The rigged rest pose scores the same as the original unrigged meshes (within ±0.3 on every view), so rigging kept
the look. The gaps to the 95 % bar are in the meshes themselves, from the image-to-3D shells and turnarounds whose
views disagree with each other. Closing them is a modelling pass, not a rigging one. Animated (idle) scores are
within 0–6 points of rest.

Pictures: `side_by_side.jpg` (art | rig, front / side / back), `in_level.jpg` (the rigged creatures in Elderwood
Hollow, playing run / attack / hit / parried / launch / death through `body.rig`, plus the moth swarm).
