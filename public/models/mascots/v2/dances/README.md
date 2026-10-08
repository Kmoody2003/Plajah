# v2 Kaiju dances, locomotion and stands (Chora / Reello)

Motion data from mocap.cs.cmu.edu (funded by NSF EIA-0196217) — CMU Graphics Lab Motion Capture Database, free for any use.
Retargeted by `scripts/mocap/bakeKaijuDancesV2.mjs`. Raw FBX stay in `acquisitions/motion/cmu-fbx/` (not shipped).

    node scripts/mocap/bakeKaijuDancesV2.mjs [chora|reello] [--only=02_01,09_01]     # re-bake
    python scripts/mocap/v2_foot_soles.py                                            # only if the foot meshes change
    python scripts/mocap/render_v2_dances.py chora 02_01,09_01 out.png --views front,side,feet   # contact sheets (bpy)

## Files

One bake PER CHARACTER (the limb rest axes / foot sizes differ, so quaternions are not interchangeable):

    public/models/mascots/v2/dances/chora/dances.{json,bin}
    public/models/mascots/v2/dances/reello/dances.{json,bin}

Load with `kaijuDances.ts` by changing only the base URL, e.g. `/models/mascots/v2/dances/chora/`.
Format is identical to v1 (`public/models/mascots/dances/`): int16 frames, 30 fps, `perFrame = bones*4 + 3`
(local quaternions `quatScale` 32767, then hips position `posScale` 4000, written to the `hips.position` track).

Differences from v1 in the index: `bones` has 16 entries (v1's 14 + `foot_L`, `foot_R` appended; always map by name via
`index.bones`), and the index has extra `skeleton: 'v2'`, `character`.

## Clip meta (all additions are optional; old `DanceMeta` fields are unchanged)

| field | on | meaning |
|---|---|---|
| `kind` | all | `'dance' \| 'walk' \| 'run' \| 'turn' \| 'stand' \| 'idle'` |
| `loop` | non-dance | true = seamless loop (loop window found by pose+velocity matching, last 6 frames crossfaded into the first, circular smoothing) |
| `gait` | non-dance | `'walk' \| 'run'` (run keeps the scaled flight height) |
| `role` | jog start/stop | `'start' \| 'stop'` (kind is `run`, loop false) |
| `speed` | non-dance | **planted ground speed in m/s (kaiju world)** — the speed at which the stance foot of THIS baked clip does not slide (median of the stance-foot velocity). Move the character at `speed * playbackRate`. For non-loops it is the 75th percentile of stance-foot speed |
| `speedHuman` | non-dance | the original hips speed x `KAIJU_SCALE` (0.42), as literally requested. The stubby kaiju legs cannot cover that much ground per step, so use `speed` for foot sync |
| `speedStart`, `speedEnd` | non-loop | planted speed in the first / last 0.5 s (ramp for jog start/stop/turns); `speedStartHuman`/`speedEndHuman` likewise for the human data |
| `stride` | non-dance | metres covered by one loop cycle (two steps) at `speed`; for non-loops the whole clip |
| `cycleSec`, `cycles` | walk/run loops | duration of ONE gait cycle (left+right step) and how many cycles the loop holds (all are 1). `beat` = step period (`cycleSec/2`, `beatConf` 0.9) |
| `yawDeg` | non-dance | total heading change of the clip, baked into the `hips` rotation. **Positive = counter-clockwise from above = toward the character's LEFT** (+Z facing rotates toward +X). Loops are about 0 |
| `srcStart` | all | start time (s) of the window inside the source FBX |

Locomotion is a treadmill: horizontal hips travel is removed (a little per-step pelvis sway is kept), vertical bob + yaw stay.
The character always starts facing +Z. Un-rotate the root by `-yawDeg` after a turn clip.

IMPORTANT for consumers: `pickDance()`'s fallback pool (`!greet`) contains every clip. Filter on `kind === 'dance'` (or
`styles.length`) before choosing dances; locomotion/stand clips have `styles: []`.

## Clips (per character: 47 = 35 dances + 12 locomotion/stand)

Dances (35, `kind:'dance'`): the same table, windows and style tags as v1 (Arabesque turn, Jete en tournant, ... Conducting).

| id | name | kind | loop | length | notes |
|---|---|---|---|---|---|
| 02_01 | Walk - easy | walk | yes | 1.10 s | 1 cycle, speed 0.33 m/s |
| 08_01 | Walk - brisk | walk | yes | 1.00 s | 1 cycle, speed 0.44 |
| 137_29 | Walk - normal | walk | yes | 1.20 s | 1 cycle, speed 0.32 (straightest piece of a curving walk) |
| 09_01 | Run | run | yes | 0.73 s | speed 0.74 |
| 09_02 | Jog | run | yes | 0.73 s | speed 0.73 |
| 104_06 | Jog start | run (role start) | no | 2.7 s | standing to jog, speedEnd 0.7 |
| 104_09 | Jog stop | run (role stop) | no | 2.8 s | jog to standing |
| 102_01 | Run turn - right, wide | turn | no | 2.2 s | yawDeg -15 |
| 102_02 | Run turn - left, wide | turn | no | 1.3 s | yawDeg +38 |
| 102_33 | Run turn - right, tight | turn | no | 1.7 s | yawDeg -36 |
| 137_26 | Stand - calm | stand | yes | 4.5 s | breathing / tiny shifts, one hand lifts |
| 137_28 | Wait - weight shifts | idle | yes | 3.0 s | gentle pelvis sway, +-12 deg |

## How the feet work

* `foot_L/foot_R` world rotation = the human foot's rotation from its frame-0 T-pose (flat) on the kaiju foot's rest rotation (gain 0.9).
* Ground contact uses 4 sole points per foot taken from the real v2 foot meshes (`scripts/mocap/v2_foot_soles.json`),
  forward-kinematics'd every frame. Dances: hips y = max(old scaled bob, height that puts the lowest sole point on the floor)
  -> never sinks (0 sunk frames in all 35 dances, both characters). Locomotion: the lowest sole point is ON the floor
  every frame (+ scaled flight for runs), so there is no vertical slide.
* The legs are rigid and stubby (no knee), so a human swing-foot lift cannot come from the leg. For locomotion the
  pelvis rolls (up to 17 deg) until the foot-height difference matches the scaled human ankle difference — a chibi
  waddle. Legs aim hip -> ankle with gain 1.2-1.25 (dances keep v1's hip -> knee at 70%).

## Known limits

* The three 102_xx "turn" clips are jogging arcs, not 90-degree turns: yawDeg is only -15 / +38 / -36 and they carry a strong forward lean.
* Planted speed is about 0.45-0.6x of the human speed scaled by 0.42; step length is limited by the 0.12 m leg bone.
* The gait loops are single cycles (about 1 s), baked at 30 fps.
* 137_28 / 137_26 were chosen as calm windows from a long wandering "Normal Wait"; the rest of those clips is not shipped.
