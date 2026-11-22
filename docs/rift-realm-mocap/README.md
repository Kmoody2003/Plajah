# Rift Realm — characters from their motion videos (track 2), 2026-11-21

Every clip in `public/games/rift-realm/assets/characters/clips/<id>.json` comes from a motion video in
`D:\plajah game assets deign from promtps\Shooter\Nov 15 - 14_43`. The JSON's `source` gives the video hash and the
seconds for each clip. `rootMotion` gives the travel the game should apply (clips play in place). The specs that produce
them are `scripts/riftrealm/clips/<id>.json`. Side-by-side frames (video | game rig | solver skeleton) for every clip are
in `void_stalker/` and `robot_paladin/` next to this file.

## Re-bake

```
preview_start mocap-lab            (launch.json, :3248)
rrBake.capture('<hash>', { passes: [{}, { confidence: 0.2 }, { confidence: 0.2, pad: 0.3 }] })   # once per video, cached in D:/rr_work/mocap_t2/takes
rrBake.bakeFile('void_stalker')    # or bakeFile('robot_paladin'); { only: ['run'] } re-bakes some clips and keeps the rest
```
Then run `scripts/riftrealm/ktxPack.py chars` if the GLBs changed.

## Mocap body footage (2026-11-21)

Kenne's studio reference takes in `D:\plajah game assets deign from promtps\Shooter\motion capture body` (36 clean,
full-body, plain-background videos). The mocap lab serves them through `/__rrvideo/<hash>` next to the reels. All 36
were captured (3 passes each; body found in every frame except the sliding run 140/192 and crate vault 157/192). These
clips now come from that footage on both characters, replacing the CMU and reel proxies:

| clip | video | seconds | grade |
|---|---|---|---|
| aim_idle / rifle_aim | 8e1c58e3 Soldier aiming assault rifle | 2.0–5.0 loop | good (hands reach the chest, stock short of the shoulder: forearms point at the camera) |
| shoot / rifle_fire | ad5f76e1 Soldier firing rifle in stance | 1.5–2.1 / 1.0–4.0 loop | good |
| pistol_hold / pistol_aim / pistol_shoot | 3084cdd8 Soldier firing pistol | 0.3–1.9 loop / 2.0–2.6 | good |
| reload / reload_pistol / switch_weapon (new) | 5db86210 / 95edb996 / 2ca130a9 | 0.9–6.6 / 0.9–6.4 / 0.9–6.8 | good |
| hit / hit_heavy | 7658dcff flinch / 8f48f048 stagger | 0.9–2.2 / 0.9–3.3 | good |
| knockdown (new) / get_up | ae5947ac knocked back and stands | 0.9–3.1 / 4.0–6.6 | usable / good |
| death / death_back | 5cf6fb49 collapse / b47ff154 shot falling backwards | 0.9–4.6 / 2.8–5.2 | usable / good |
| slide / vault / dive_roll | 5c2c32f7 / 269e1775 / 3d2a4c79 | 0.8–4.4 / 2.2–5.0 / 0.9–3.8 | usable / usable / good |
| jump / land | cfecf33d Soldier jumping | 1.2–2.6 / 3.0–4.4 | good |
| crouch_walk / run_rifle (new) | b994e900 / c83a055a | 1.5–7.0 loop / 1.0–7.0 loop | good |

Unused so far: the knight takes, stairs runs, martial-arts / boxing / dagger / spear strikes, the hurdle leap and floor
slide, the sideways run and the walk / run cycles (CMU cycles stay). Not yet wired in the game: reload, switch_weapon,
crouch_walk, run_rifle, knockdown.

## Model fidelity pass (2026-11-22)

Scored with `scripts/riftrealm/render_views.mjs` → `score_views.py` (0.6 × silhouette IoU + 0.4 × colour). Before/after:
`models_before_after.jpg`; in the level (Glacial, third + first person): `in_level_glacial.jpg`.

| | front | side | back | back with wings |
|---|---|---|---|---|
| Void Stalker before (old bbox scorer, wings scored against wingless art) | 81.6 | 82.0 | 82.3 | 85.5 (body-sized) |
| **Void Stalker now** | **96.3** | **97.0** | **95.0** | **95.6** |
| Robot Paladin before | 85.2 | 90.1 | 81.2 | — |
| **Robot Paladin now** | **95.8** | **96.6** | **91.9** | — |

What changed:
- **Measurement.** The body is scored against the body art (`--parts body` drops the rigid add-ons: the Spine2 wing
  cloak and weapons pinned 100 % to a hand bone); the cloak against the back-with-wings art (`--wings`, sized by
  feet → hood). Registration is translation + uniform scale by best overlap (a held prop shifted the old bbox fit).
- **Wings at the art's height** (`vs_parts.py --full-wings`). They had been squashed under the hood because the game
  sized characters by their bbox; `CharacterRig` now sizes by the body (`bodyHeight`, rigid Spine2 parts excluded).
- **Paladin leg webbing removed** (`clean_webs.py`, between mid-thigh and knee).
- Both re-rigged with the Character Forge (`forgeRigMesh.ts`, holds dagger / fist), sockets and bone names unchanged;
  KTX copies rebuilt; every clip re-baked on the new rigs.

Not reached: the **Paladin back is 91.9 %, under the 95 % gate**, and is capped by the art itself — the turnaround's
front and back silhouettes agree only 90.4 % with each other (mirrored front vs back), so no single 3D shape can
match both. (The Void Stalker's front and back agree 95.9 %.) The geometry is still the original generated mesh;
no from-scratch re-model was done.

Strafes now come from `Soldier_running_sideways` (3c1728a1, facing the camera: 3.5–4.5 s = his right, 2.0–3.0 s =
his left), looped with `travel: 'side'` (makeLoop keeps the sideways path). The solver under-reads a side-run's
travel, so `CharacterRig` plays strafes at a 2.8 m/s cadence unless the recorded speed is at least 1.5 m/s.

## Pipeline changes (services/mocap)

- **Shot cuts** (`capture.ts` ShotCuts, `shots.ts` findShots / sliceTake): every captured frame gets a
  picture-change score. A cut is a one-frame spike that the performer's on-screen jump confirms. A landmark jump only
  counts when it holds for several frames. VFX flashes, camera moves and one-frame mis-detections don't split a take.
  When a cut is found, the performer lock resets.
- **Hard-to-detect bodies**: `confidence` (pose thresholds below MediaPipe's 0.5) and `pad` (letterbox, so a body
  that fills the frame edge to edge is still found). `mergeTakes` fills the frames the base pass missed from the other
  passes. Results: Paladin robot 96 → 177 of 240 frames found, Archangel 37 → 111, Void Stalker 218 → 233.
- **Game clips** (`gameClip.ts`): subClip, `level` (camera-tilt correction, used only when it is between 3° and 25°),
  `faceForward` (+Z from the start, mean or travel facing), `cleanContacts` (drops short plants and re-locks the feet
  with leg IK), `makeLoop` (best loop points, an end blend that closes the pose exactly, sideways drift removed),
  `mirror`, `reverse`, `retime`, `rootMotion`, and `bakeRecipe` (one recorded recipe per clip).
- **Depth**: the bake runs the Plajah pose lifter (`lifter.apply`) before solving. For a performer facing the
  camera, MediaPipe's depth threw the knees about 0.3 m forward (a deep false crouch). With the lifter, idle hip
  height went from 0.78 to 1.01 m, and jitter roughly halved (idle 7.4 → 3.4, run 30 → 13, light_1 13.6 → 5.1).

## Clips (Void Stalker)

Grades are the solver's own (jitter = landmark shake left after smoothing, in mm; hidden = share of frames where the
performer was hidden by VFX or out of frame). Videos: 888b0e94 Void Stalker combat reel, b230aae3 Void Stalker
executing combo, a9340b37 Assassin high-agility, e5f8c560 Assassin shadow combat, 1247d50a Cyber-Assassin,
566a3ead Archangel, abf39cd6 Robot Paladin.

| clip | source | solve | travel |
|---|---|---|---|
| idle | 888b0e94 8.4–9.9s | usable (jitter 3.4) | in place |
| combat_idle | a9340b37 0–1.05s | usable (5.0) | in place |
| dash | a9340b37 1.2–2.15s | usable (5.5) | 1.15 m |
| jump | 1247d50a 2.1–2.6s | poor (19.6) | — |
| land / land_soft / rise | 888b0e94 5.85–6.95 / 1247d50a 3.7–4.3 / 888b0e94 7.0–7.9 | usable / poor / good | |
| dodge_back | e5f8c560 5.2–7.0s | poor (9.1) | 0.61 m |
| light_1 / light_2 / light_3 | b230aae3 3.5–4.05 / 4.05–4.65 / 888b0e94 3.62–4.25 | usable / poor / good | |
| heavy_1 / heavy_2 / heavy_3 | a9340b37 4.05–5.1 / 888b0e94 2.4–3.45 / 1247d50a 2.4–3.7 | poor / usable / poor | |
| attack_1..3 (old names) | 888b0e94 2.4–3.1 / 3.5–4.6 / 1247d50a 2.45–3.45 | usable / good / poor | |
| finisher / finisher_2 | b230aae3 4.55–5.6 / 566a3ead 6.4–8.6 | poor / poor (63% hidden) | |
| block | abf39cd6 5.2–6.5s (Paladin's shield wall) | poor | |
| pistol_aim / pistol_shoot | a9340b37 5.3–6.5 / 6.5–6.95 (arm locked out at target) | poor | |
| shoot | a9340b37 6.5–6.95s (Assassin's arm thrust; replaced the Paladin's hunched lance recoil) | poor | |
| throw | a9340b37 7.0–7.95s | poor (9.4) | |
| wing_hover | 888b0e94 4.25–5.45s | usable (4.5) | |

Robot Paladin (all from abf39cd6): idle, walk, run, attack_1..3, block, aim_idle, rifle_aim, shoot, recover. All of
them grade poor: the gold robot is hard for the pose model, and much of the reel is close-ups or beam flashes.

## CMU library clips (both characters)

The walk, run and sprint cycles come from CMU too (Kenne, 2026-11-21: the reel's walk mixed rising and stepping and played badly). The reels have no clean gait cycle: measured in game, the planted foot never travelled backward and the run faced 13–17° off. `CharacterRig` plays each cycle at (ground speed ÷ the clip's own speed from its root motion).

No video shows these moves. They come from the CMU Motion Capture Library already on D: (Kenne, 2026-11-21: "Use CMU
mocap"). Licence: usable in products, not resellable; credit "Data from mocap.cs.cmu.edu (funded by NSF
EIA-0196217)". `source.<clip>.cmu` names the take. The bake retargets it onto the rig with its travel, turns it to face
+Z, records the travel as `rootMotion`, then plays it in place. Mirrored clips also mirror their travel.
`scripts/mocap/cmuScan.mjs <take>` prints a take's hip path, which is how the cuts were picked.

| clip | take | what |
|---|---|---|
| walk / walk_back | 35_01 (loop cut where the stride repeats; back = reversed) | clean walk, 1.1 s cycle, 1.5 m/s |
| run / run_back | 16_35 (back = reversed) | run/jog, 0.8 s cycle, 3.6 m/s |
| sprint | 09_01 | fast run, 4.4 m/s |
| strafe_right / strafe_left | 41_02 3.6–5.6 s (left = mirrored) | walking sideways |
| dodge_left / dodge_right | 127_13 / 127_14 | side-step at a run |
| vault | 41_07 22.1–23.9 s | jump over a stepstool (1.8 m forward) |
| dive_roll | 127_23 0.45–2.6 s | dive over, roll, up |
| slide | 134_01 1.3–2.6 s | duck under at a run (the local library has no true slide) |
| draw | 139_05 0.25–2.0 s | pulling a gun |
| aim_idle = rifle_aim | 139_05 1.45–2.85 s, looped | the steady hold after the draw, hand raised at shoulder height. Replaced the Paladin's lance aim, which leaned the standing stance 47° forward (now 10–22°). One-handed: there's no two-handed rifle hold in the local CMU library |
| death / get_up | 88_04 8.0–9.1 / 8.9–10.0 s | a flip that ends on the floor; getting up |

## Rig: Character Forge

Both GLBs are rigged by the Character Forge (`scripts/eraclash3d/forgeRigMesh.ts` → `services/argilla/creature/meshRig.ts`):
- the Forge's human skeleton (58 joints: contract bones, three-joint fingers and thumb, arm twist joints, eyes), laid
  onto the old rig's joint positions;
- the Forge's skin weights (`humanSkinWeights` on a solid field voxelised from the mesh), with weapons and the wing
  cloak kept on one bone;
- `extras.forge` (twist drivers, grips relaxed / fist / dagger / katana, body capsules) and sockets `hand_r_weapon`,
  `hand_l_weapon`, `back_weapon`.

In the game, `CharacterRig` runs the Forge runtime (`playkit/character/forgeRig.ts`) after the mixer. The look didn't
change: fidelity 0.82 / 0.84 against the sheets.

Re-rig:
```
npx tsx scripts/eraclash3d/forgeRigMesh.ts D:/rr_work/backup_t2/void_stalker.glb public/games/rift-realm/assets/characters/void_stalker.glb --hold Right:dagger,Left:dagger
```
Then run `scripts/riftrealm/ktxPack.py chars` and re-bake the clips.

Pipeline fix found here: `retarget()` sampled with a looping action, so every retargeted clip's last frame wrapped
back to its first pose. It now plays once and holds.

## Gaps (honest list)

- **Hit reactions and reload** are in neither the videos nor CMU. The Paladin's `play('hit')` in enemies.ts is now a
  no-op. **A clean death fall** and **gun firing** exist in the full CMU library (e.g. 90_16 fall on face, 85_15,
  79_96 / 80_03 shooting a gun) but aren't downloaded. Fetching them is a separate download to approve.
- **Guns**: no character fires a gun in the footage. Rifle poses come from the Paladin's two-handed lance aim. Pistol
  poses come from the Assassin's arm-out disc cast. Both are the closest real motion we have, not gun handling.
- The **"poor" clips** come from VFX-heavy shots. They are usable in game, but a re-shoot with clean, full-body,
  camera-facing takes per move would lift them.
- **Models**: rigged by the Character Forge (see above). **No re-model was done.** Fidelity against the sheets is still Void Stalker 0.82 (front 0.82, side 0.82, back 0.82) and Paladin 0.84
  (0.83 / 0.90 / 0.80), below the 95 % gate. The hands are mitten-shaped in the Hunyuan mesh, so the finger bones
  carry few vertices.
