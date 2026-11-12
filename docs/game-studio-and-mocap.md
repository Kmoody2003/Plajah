# Plajah Game Studio + Camera Motion Capture — design (draft 1, 2026-11-11)

Working names only ("Game Studio", "Motion Capture"); Kenne picks the product names.

**What Kenne asked for:**
1. Motion capture from a camera, a live video or an uploaded video file. Bipeds (people) and multi-legged
   bodies (animals, creatures).
2. An authoring environment, 2.5D and 3D, to make Plajah's two episodic 3D games (Ravencrest, Era Clash 3D)
   and later anyone's game.
3. Images become **editable** game maps and level designs, not baked meshes.
4. All of it built on what already exists: Plajah Build (2D/3D CAD), Plajah 3D (Argilla), the Tela 3D runtime,
   the generative lanes, and the Ravencrest / Era Clash engine.

This doc is engine-aligned with `docs/playable-engine-design.md` (Experience schema, `playkit`) and
`docs/plajah-3d-animation-scope.md` ("Act it" lane). It does not start a second engine.

---

## 1. What we already have (so nothing is rebuilt)

| Need | Already built | Where |
|---|---|---|
| Live body tracking | MediaPipe PoseLandmarker (lite/full), in a worker, One-Euro smoothing | `services/vtuber/poseTracker*.ts`, `poseWorker.worker.ts`, `oneEuro.ts` |
| Live face capture | ARKit-style blendshapes → VRM / Kaiju face rigs | `services/vtuber/faceTracker*.ts`, `retarget.ts`, `rigBuilder/` |
| Reliable camera | One camera owner, phone flips, recovery | `services/camera/cameraRig.ts` |
| Mocap → game rig | CMU takes retargeted to the contract rig, strikes cut by limb extension | `games/era-clash-3d/src/moves.ts` (`CMU_TO_CONTRACT`), `core/character.ts` `addMove` |
| Auto-rig | Mesh → contract skeleton + weights | `scripts/ravencrest/autoRig.py` |
| Creature rigs | 33 bones, gait + IK, reactions | `services/argilla/creature/*` |
| Image → 3D object | Hunyuan-mini + paint-from-views, SAM 2.1 parts, Gemma 4 part names | `engines/tela-3d`, `services/argilla/understand/*` |
| Parametric town kits | Machiya, walls, gates, piers, scatter, splat terrain, sea | `games/era-clash-3d/src/{village,otsu,ground,grassField,landmarks,props}.ts` |
| Look / lighting | HDRI, sun-aware haze, LUT grade, raid blend | `games/era-clash-3d/src/look.ts` |
| Engine core | Collision, player, combat director, mobs, post, foliage | Ravencrest core, copied into `games/era-clash-3d/src/core` |
| CAD / BIM | Walls, openings, stairs, mech parts | Plajah Build (`hub_build`) |
| Co-editing, autosave | CRDT, cloud versions | `services/coedit`, creative cloud autosave |
| Game rules | 34-principle Ravencrest Canon + Game Council | `services/game/council/ravencrestCanon.ts` |

The hand work done this week on Era Clash (Otsu-no-ura relayout from a map picture, sheet-to-character,
CMU strike cuts) is exactly what these features automate. **Era Clash Chapter I is the pilot for all three.**

---

## 2. Motion capture from a camera or video

### 2.1 Inputs

- **Live camera** (webcam or phone, through `cameraRig`): preview the retarget live, record takes.
- **Live stream** (a Go Live session): record the performer's track as a take.
- **Video upload** (any file in Content HQ): offline, so it can use slower, better models and look
  forwards and backwards in time.
- **Several phones at once** (optional "multi-cam take"): 2–4 phones around the performer, synced by a clap
  (audio onset) — triangulation fixes the depth that one camera can only guess.

### 2.2 Bipeds (people) — pipeline

```
video ──► person detect + track ids (several actors per clip)
      ──► 2D/3D keypoints per frame: body 33 + hands 21×2 + face blendshapes
      ──► temporal solve (offline: bidirectional smoothing; live: One-Euro)
      ──► skeleton fit: bone lengths fixed per actor, joint limits, no knee hyperextension
      ──► root + ground: camera height/tilt from the floor, foot contacts, root path in metres
      ──► cleanup: foot lock (IK pins on contact), de-jitter, gap fill on occlusion
      ──► MotionClip (our format) ──► retarget to contract rig / VRM / creature rig
```

- **First release uses what we already ship:** MediaPipe Pose (`full`, plus `heavy` for uploads) world
  landmarks + Hand Landmarker + the face pipeline. Good enough for idles, walks, gestures, emotes and
  strikes once cleaned up; weak on fast spins, floor work and depth.
- **Quality upgrade (desktop GPU lane, per desktop-first AI):** a stronger 2D whole-body model plus a
  2D→3D lifting model run in the WinUI app's native engine. Candidates listed in §6 — **each licence must be
  checked before anything is downloaded.** GVHMR, WHAM and anything needing the SMPL/SMPL-X body model stay
  out (research-only / paid licence, already ruled in the 3D animation scope).
- **Root motion** is the hard part with one camera. We solve it with: a floor plane from the first still
  frames, foot contact detection (low velocity + low height), and pinning contacts so the body does not
  skate. Multi-cam takes skip the guessing.

### 2.3 Multi-legged bodies (animals, creatures) — pipeline

There is no commercial-safe, any-animal pose model as good as the human ones, so the plan does not depend on one:

1. **Pick or draw a skeleton template:** quadruped, hexapod/insect, bird, serpent, octopod (kraken) — or the
   creature rig already made in Plajah 3D. Each template lists named keypoints (paws, hocks, spine, tail tip…).
2. **Mark a few frames:** the user clicks keypoints on 2–3 frames (Aria pre-places them; see below).
3. **Track by parts with SAM 2.1** (already installed, Apache-2.0): each limb/part becomes a tracked mask
   through the video; keypoints are read from the masks (extremities, centroids, joint bends) and from
   optical flow between marks.
4. **Depth** from Depth Anything V2 **Small** (Apache-2.0; already the adopted model) gives each keypoint a z.
5. **Fit the template** with bone-length and joint-limit constraints, the same solve as bipeds.
6. **Gait help:** for walks/trots/gallops, detect the footfall pattern and lock contacts, so even a noisy
   track gives a clean cycle.

Optional speed-up if a licence checks out: an animal keypoint model (see §6) pre-places keypoints for common
quadrupeds so step 2 becomes "confirm".

This same path also covers **props and cloth** (a sword, a cape, a flag) — any part SAM can follow.

### 2.4 The capture room (UI)

- **Record / Import** → takes list (per actor, per camera).
- **Overlay player:** source video with the skeleton drawn on top, and the retargeted character beside it.
- **Fix tools:** trim, loop point finder, foot-lock toggles on a contact strip, re-mark a keypoint on a bad
  frame and re-solve, mirror, root edit (straighten a walk, set facing), speed warp (the Era Clash
  `act()` wind-up squeeze becomes a general "snap" control).
- **Cut moves:** auto-segment a long take into moves (strike peaks by limb extension — the `moves.ts`
  rule — plus pauses and contact changes), name them, send to a character's move set.
- **Quality score** per take (jitter, skate, occlusion %), so bad takes are flagged, not shipped.

### 2.5 Output

- **`MotionClip`** (our JSON: skeleton template id, fps, joint rotations, root path, contacts, curves for face,
  source refs + rights) — cached by key like every derived asset.
- Export **BVH** and **glTF animation**; import BVH/FBX (CMU shelf, the user's own mocap).
- Retarget targets: contract rig (games), VRM (VTubers), Argilla creature rigs, Anima 2D rigs
  (Era Clash `rig2d.js` poses can be driven from 2D keypoints directly).
- **Motion Library:** the user's takes + the CMU shelf + later the Motion Lab capture program, searchable by
  name and tag.

### 2.6 Rights and consent

- A capture of a person is that person's performance. Uploads get the same rights questions as other media:
  "Is this you, or do you have permission?" Captures of other people are kept private until confirmed.
- No capture from someone else's copyrighted film to resell as motion packs; the copyright intake rules apply.
- Practitioner sessions (Motion Lab program) use the signed release + revenue share already planned.

---

## 3. Game Studio — the authoring environment

### 3.1 Shape

One editor, inside the same renderer the games ship on (the Ravencrest/Era Clash core, extracted into
`playkit` as the Playables doc says). **Play-in-editor is one key**: you are standing in the level you just
edited, at 60 fps on the Arc baseline.

Rooms (tabs), all sharing one project:

| Room | What it does | Builds on |
|---|---|---|
| **Level** | Terrain sculpt + splat paint, roads/rivers as splines, water, scatter (grass, trees, rocks), placing prefabs, sections/zones, nav, spawn & wave zones, triggers | `ground.ts`, `grassField.ts`, `landmarks.ts`, `otsu.ts` |
| **Kits** | Parametric prefabs (machiya, walls, gates, piers, stalls) with sliders; import Plajah Build CAD/BIM as prefabs | `village.ts`, Plajah Build |
| **Characters** | Sheet → 3D → auto-rig → face rig; move sets; AI style | `buildSheetCast.py`, `autoRig.py`, `rigBuilder`, `mobs.ts` |
| **Motion** | The capture room (§2.4) + Motion Library | §2 |
| **Look** | Sky, sun, haze, grade, weather, time of day, "raid"-style blends | `look.ts` |
| **Story** | Episode → chapters → sections, dialogue (ink), cinematics on camera rails, objectives | Playables schema, `tale.ts` |
| **Sound** | Cues and SFX per zone/event, Chora score | Era Clash audio manifest |
| **Test** | Play, bot runs ("mashing loses, blocking wins"), perf HUD per pass, Game Council review | Canon, bot checks |

### 3.2 2.5D and 3D are one level, two cameras

- **3D:** free third-person (Era Clash 3D, Ravencrest).
- **2.5D:** the same level with a **play band** (a spline lane + depth range, like the Era Clash campaign
  `z 0..ZMAX`) and a rail camera. Backgrounds can be real 3D or depth-parallax layers from a painting.
- A section can switch cameras (walk a 2.5D street, enter a 3D plaza). Authors pick per section.

### 3.3 Episodic projects

```
Game ─► Seasons ─► Episodes ─► Chapters ─► Sections (levels)
   shared: cast, kits, motion library, look presets, score themes
   per episode: overrides, new kits, new cast, its own save/version
```

- Episode N+1 starts as a copy-on-write of the shared library, so fixing a kit fixes every episode unless
  an episode overrode it.
- Autosave + versions to cloud (creative cloud autosave rule); co-edit with `services/coedit` so two people
  can work one level.
- Publish an episode to Games/Arcade as its own build; asset hosting decision (the open ~100 MB question from
  Ravencrest) has to be settled before the first public episode.

### 3.4 Level document (extends the Playables Experience schema)

Everything is **objects with parameters**, never one baked mesh, so every generated thing stays editable:

- `terrain`: heightmap tiles + splat layers + material set
- `splines`: roads, rivers, walls, rails (with width/profile)
- `instances`: prefab id + transform + parameter overrides
- `scatter`: rule (type, density, exclusion splines/zones, seed)
- `zones`: sections, spawn/wave, triggers, nav regions, play band (2.5D)
- `lights`, `look` preset, `weather`
- `cameras`: rails, cinematic shots
- `refs`: source images and what was derived from each (so "regenerate from picture" keeps your edits)

---

## 4. Picture → editable level

Two kinds of picture, two routes. Both end as a Level document (§3.4), not a mesh.

### 4.1 A map / layout (top-down or isometric) — e.g. the Otsu-no-ura map in the reference pack

1. **Read the map:** SAM 2.1 regions + Gemma 4 naming (the part-naming lane already built) label water,
   coast, roads, building blocks, walls, fields, forest, hills, landmarks; text on the map is read as names.
2. **Vectorise:** roads/rivers/walls → splines; building blocks → footprints; forests/fields → scatter zones;
   water → sea/river planes; hills → height hints (shading, contour lines, labels).
3. **Scale:** the author gives one measurement ("the harbour is 40 m wide") or picks a preset; Aria proposes one.
4. **Fill with kits:** footprints become kit instances (machiya rows, walls, gates) chosen by style and size;
   unknown landmarks become placeholders with a "build this from a picture" button (Plajah 3D).
5. **Gameplay pass:** propose sections, a critical path, spawn/wave zones and a 2.5D play band if asked.
6. Everything lands as editable splines, footprints and instances. Re-running on an edited map keeps manual edits.

### 4.2 A perspective painting / concept shot — e.g. the 31 target shots

1. Depth (DA V2 Small) + SAM regions + camera solve (horizon, vanishing lines, eye height).
2. **Blockout:** ground, walls, big masses at the right sizes and positions as simple editable shapes.
3. **Match to kits/landmarks:** blocks become kit instances where they match; the rest stay as blockout or go
   to Plajah 3D.
4. **Shot camera saved** with the level, plus a side-by-side compare (picture vs render) — the same check
   used by hand this week for Era Clash's visual target.
5. Option: a 2.5D "Picture Walk" scene straight from depth layers (the Playables first template) for fast
   episodes or backgrounds.

### 4.3 From words

"A fishing harbour with three piers under a volcano, raid at dusk" → the same Level document via Aria tools
(place kit, draw spline, scatter, set look), reviewed against the Canon.

---

## 5. Phases (each ends with a check Kenne can see)

| Phase | Build | Gate |
|---|---|---|
| **0 — Licences + extract** | Check every model in §6; pull the Era Clash/Ravencrest core into `playkit` without breaking either game | Both games still run; licence table filled |
| **1 — Biped capture v1** | Capture room on MediaPipe (live + upload), skeleton fit, foot lock, `MotionClip`, retarget to contract rig, BVH/glTF export | Kenne records a kata on the webcam → Haru plays it in Era Clash 3D with no foot skate |
| **2 — Level editor v1** | Level document, gizmos, outliner/inspector, terrain + splat brushes, splines, scatter, kit instances, play-in-editor | Otsu-no-ura Chapter I re-expressed as a Level doc, edited in the editor, plays the same |
| **3 — Map → level** | §4.1 on the Otsu map | Auto result within an hour of hand-editing of the shipped relayout |
| **4 — Multi-legged capture** | Templates, SAM part tracking, depth, gait lock | A horse/dog clip drives a creature rig with clean footfalls |
| **5 — Upload quality lane** | Desktop GPU whole-body + lifting models (if licences pass), multi-cam phones | Side-by-side vs v1 on fast strikes and turns |
| **6 — Episodes + 2.5D** | Seasons/episodes, shared libraries, play band + rail camera, Story room, publish | Ravencrest Episode 2 or Era Clash Chapter II authored entirely in the Studio |
| **7 — Picture → level (perspective)** | §4.2 | Target shot vs render compare passes Kenne's eye |

Phases 1 and 2 can run side by side after phase 0 (different files).

---

## 5a. Phase 1 as built (2026-11-11, uncommitted)

- **Engine** `services/mocap/`: `types.ts` (RawTake, MotionClip), `solve.ts` (resample → visibility-weighted
  smoothing both ways → fixed bone lengths → per-bone rotations from landmark directions with fallbacks for straight
  limbs → root path: planted foot carries the hips, a camera estimate (body pixel size vs. metric size, per segment
  across the image plane) carries hand-offs and flight → floor at y = 0 → flights timed from their peak height,
  T = sqrt(8p/g)), `bvh.ts` (BVH export in CMU joint names, ZXY, cm; three.js preview clip), `moves.ts` (strikes
  cut by limb extension, the Era Clash rule; loop finder), `capture.ts` (upload: fetched whole, seek-and-detect with
  the heavy model; live: full model, MediaRecorder keeps the footage; `PerformerLock` follows one person when
  several are in frame), `library.ts` (IndexedDB + creative cloud kind `motion`, raw take kept for re-solving).
- **Room** `components/mocap/CaptureRoom.tsx` + `SkeletonView.tsx`: camera / upload, landmarks over the footage,
  3D skeleton with planted feet and root path, contact strip, trim, loop finder, moves, smoothing re-solve,
  quality grade with plain-words notes, "Who is performing?", save, BVH export (take or one move).
- **Lab** `mocap-lab` :3248 (`/mocap-lab.html?video=<url>` processes a clip on open); dev POST `/__mocap` writes
  `public/games/era-clash/3d/assets/mocap/captures/<name>.bvh|json`.
- **Era Clash 3D**: `loadTake` reads `.bvh`; `captureMoves` maps a capture's strikes onto Haru's slots;
  `?capture=<name>` or `eraclash3d.useCapture(name)`.
- **Tests** `npm run test:mocap` (9): synthetic performers through MediaPipe-shaped landmarks — limbs back within
  2 cm, a walk's distance within 8% with no planted-foot slide, jump height from airtime, noise graded calm, gaps
  counted, BVH read back exactly by three's BVHLoader, a punch cut at the right frame, the performer lock.
- **First real take (2026-11-11, Wikimedia "Karate, Hean Shodan", CC BY-SA 4.0, 28 s, 640×480, performer's torso
  only 49 px):** found in 100% of frames; raw MediaPipe shake 148 mm/frame² → 6 mm after spike removal (running
  median) + size-based smoothing (`autoSmooth`), graded usable; 17 blows found (kata has ~21 moves). On Haru: grounded
  (fixed: BVH root rest offset must be the standing hip height), each strike turned to face forward at contact,
  turning blows marked down, punch slots take chest-height blows first (blocks are high/low). Measured at contact:
  arm 92–100% straight, fist 0.29–0.47 m ahead of the shoulder (CMU punches reach 0.53–0.65 m — single-camera
  depth is flattened for a small, distant performer). Offline speed ~2 frames/s in the hidden pane.
- **Kenne's test folder (2026-11-11, `public/games/era-clash/assets/Mocap data`, 6 generated warrior clips,
  1280×720, 15 s, white studio):** found in 100% of frames in all six. What the real footage forced:
  foot locking with two-bone leg IK (pinned-foot slide 28 → 3 cm/s on kicks, 6 → 0.7 standing); hips placed from
  the pins instead of summed foot deltas; per-landmark smoothing from each point's measured noise (hidden or
  blurred limbs smoothed hard, a visible fist kept sharp; the room's slider is now an override, default Auto);
  shake graded from raw-landmark noise (median third difference), not second differences that punished fast
  moves; followed-camera / treadmill takes detected (hips still on screen while feet stride) and planted by height
  with the stance foot never moving forward; left/right limb mix-ups repaired by a whole-take shortest path (a
  per-frame version inverted a whole take after one wrong call); a foot up around hip height outranks the
  balancing arm, so kicks aren't logged as punches. Results: kicks/martial arts static-cam, never airborne, 0.7–1.2
  cm/s pinned slide; run 22% flight / 1% double support; walk 30% double support. On Haru the warrior's two kicks
  land at 1.11–1.21 m, leg 96–100% straight.
- **Fixed after that (same day):** moves need a *snap* — a hand blow's arm straightens by ≥0.10 of its length in
  the 0.4 s before contact, a kick's foot rises ≥0.35 leg lengths in 0.6 s (measured: guard / arm swing / held kick
  0.00–0.06, real punches 0.15–0.32). Every take now reads right: 2 kicks per kick clip, 2 strikes in martial arts B,
  6 step-punches in the kata, nothing from the run or walks. Walk B is a turnaround video (the warrior turns 389°
  while walking), which the solver read correctly as a loop; **Straighten path** (shown when a moving take turns
  >90°) takes out the slow turn and the slow sideways drift, keeps the stride's sway: net 0.08 → 0.23 m/s of 0.28,
  pinned-foot slide 2.8 cm/s.
- **Results in the room:** a row of tiles (grade, performer found, shake, foot slide, camera still/following, feet,
  travel and turn, moves found, left/right fixes) from `MotionClip.stats`; library takes remember their video
  (`source.url`) and re-solve from the raw take with the current solver when opened. The seven test takes are in
  the lab's Motion Library (browser storage of the lab origin).
- **Still open:** upload capture speed with the pane visible (play-then-fill path unverified); straightened walk B
  slide 2.8 cm/s; the lab must restart to serve new files under `public/`.
- **Ground-truth benchmark (2026-11-11, `labs/mocap/bench.ts`, `mocapBench` in the lab):** CMU takes retargeted
  (new `services/mocap/retarget.ts`, ported from Era Clash) onto the peasant character, rendered from a still or
  following camera, run through the real pipeline, scored against the character's own bones in the camera frame:
  bone angles, joint positions, MediaPipe's raw error as baseline, travel, hip height, contacts, moves, speed.
  Ten cases (walks side/front, run, lunge punch, front/roundhouse kick, boxing, jumps, Heian Shodan, get-up);
  renders stored in IndexedDB, `rescoreStored` re-scores a solver change in seconds.
  What it showed and what changed (measured):
  - MediaPipe's own 3D is the accuracy ceiling for angles: 25.1° mean bone error, ours 24.2°. Its depth is
    compressed (bones 20–40% short; a body turned 78° reads ~35°); 2D is good (feet 5–12 px). Rebuilding depth from
    2D + bone lengths (`liftDepth`, opt-in) measured worse (26–28°) and stays off.
  - Smoothing was eating motion: a walking stride came out at half size. Noise is now measured on slow frames only
    and smoothing is speed-adaptive (wide when still, narrow when fast): side-walk travel 2.0 → 2.4 m (truth 4.0),
    front walk 0.1 → 1.1 m, run bones 20.3 → 18.9°.
  - Contacts: one camera-free rule (near floor, lower foot, not moving forward under the hips); following camera
    judged from the planted feet themselves, not the stride direction.
  - Reliability: unseen frames don't move the hips, 9 m/s cap; get-up travel 23 m → 0.6 m (truth 0.9); grade
    also goes by frames actually found.
  - Moves: gates made parameters and swept against true blows with zero allowed on run/walks: F1 0.22 → 0.55.
  - Speed: uploads decode straight through with WebCodecs (mediabunny, already a dependency): 484 s → 39 s for a
    15 s clip (12.5×), identical landmarks; pose model 50 ms/frame on the Arc iGPU.
  Still short: travel 27–60% of truth on walks/runs (planted-foot sweep from MediaPipe's 3D is ~70% of real),
  contact precision 0.1–0.5, angles bounded by MediaPipe. Next levers: stride from the 2D picture, a stronger
  desktop pose model (licences first), several cameras.
- **Not yet:** a close-up webcam take (needs Kenne on a webcam: the phase gate), hands/fingers, camera tilt
  (assumes a level camera), the room inside the app (lab only), a worker for live tracking, retargeted character
  preview inside the room.

## 6. Models to check before use (licences NOT yet verified)

| Model | Use | Status |
|---|---|---|
| MediaPipe Pose / Hand Landmarker | biped v1 | Already shipped in VTuber; reconfirm model-card licence |
| SAM 2.1 small | part tracking, map regions | Installed; Apache-2.0 (recorded in Argilla work) |
| Depth Anything V2 **Small** | depth | Adopted (Apache-2.0); Base/Large are non-commercial — do not use |
| RTMPose / RTMW (MMPose) | better 2D whole-body | To verify (code and weights separately) |
| MotionBERT or similar 2D→3D lifter | better 3D | To verify, including the training data terms |
| ViTPose(+) animal / SuperAnimal (DeepLabCut) | quadruped pre-placement | To verify; DeepLabCut code licence differs from its model-zoo weights |
| GVHMR, WHAM, SMPL/SMPL-X, Kimodo SMPL-X | — | **Out** (research-only / paid) |
| Ultralytics YOLO pose | — | **Out** (AGPL) |
| CoTracker | — | Likely out (non-commercial) — verify before ruling |

No downloads without Kenne's OK (standing rule); single GPU runs only, no batches.

---

## 6a. Stronger models: licence check (2026-11-11)

Our benchmark says MediaPipe's own 3D (25° mean bone error) is the ceiling: its 2D is good, its depth is squashed.
So the question is which model gives better *depth*, under terms Plajah can ship.

| Model | What it gives | Code | Weights / data | Verdict |
|---|---|---|---|---|
| MediaPipe Pose (in use) | 2D + 3D landmarks, realtime, browser | Apache-2.0 | Apache-2.0 (BlazePose GHUM card) | keep as the live/default engine |
| **SAM 3D Body** (Meta, 11/2025) | full-body + hands 3D mesh from one image, MHR rig; 3DPW MPJPE 54.8 | SAM License | SAM License; gated on Hugging Face; 631M (ViT-H) / 840M (DINOv3-H+) params | **only serious candidate**; commercial use not expressly granted or barred; no-military/ITAR, indemnity, Meta may change terms; outputs' status unstated: needs a lawyer before shipping; single image, no video mode; no VRAM/speed published |
| MHR (Momentum Human Rig) | the rig SAM 3D Body outputs | Apache-2.0 | assets downloaded separately, terms unconfirmed | usable, assets to confirm |
| RTMW3D / RTMPose3D | whole-body 3D, fast | Apache-2.0 | trained with H3WB (built from Human3.6M, academic-only) | risky lineage, skip |
| FMPose3D (CVPR 2026) | SOTA lifting | Apache-2.0 | weights non-commercial | no |
| NLF / MeTRAbs | strong 3D | MIT | weights non-commercial research | no |
| MotionBERT, VideoPose3D, most lifters | 2D→3D lifting | various | Human3.6M (academic-only) | no |
| GVHMR, WHAM, 4DHumans | world-space SMPL motion | various | SMPL body model (paid licence) | no (ruled out before) |
| Sapiens | strong 2D | CC-BY-NC | non-commercial | no |
| ViTPose / RTMPose 2D | better 2D | Apache-2.0 | some checkpoints derive from MAE (CC-BY-NC) | 2D isn't our bottleneck; skip for now |
| YOLO-pose | 2D | AGPL | — | no |

**Recommendation: train our own lifter.** The licence-clean path to beating the ceiling is a small model that
learns MediaPipe's own mistakes: input = MediaPipe's 2D + 3D landmarks over a short window of frames, output = true
bone directions and foot contacts. Training data comes from the benchmark renderer: CMU motion capture (free for
commercial use) on Plajah characters from random cameras, lights and backgrounds, run through MediaPipe exactly as
real footage is. Clean data, runs in the browser in milliseconds, and the benchmark scores it on held-out takes and
characters. Needs: more CMU takes (43 on disk; the full set is ~2,500, download needs Kenne's OK) and a few hours of
rendering on this PC. SAM 3D Body can be tested in parallel as an offline "studio quality" pass if Kenne requests
access on Hugging Face (only he can accept Meta's terms) and a lawyer clears the SAM License. Two phones (true 3D by
triangulation) remain the licence-free big jump for serious capture sessions.

Sources: [SAM 3D Body](https://github.com/facebookresearch/sam-3d-body), [SAM License](https://github.com/facebookresearch/sam-3d-body/blob/main/LICENSE), [MHR](https://github.com/facebookresearch/MHR), [RTMW paper](https://arxiv.org/abs/2407.08634), [FMPose3D](https://github.com/AdaptiveMotorControlLab/FMPose3D), [Human3.6M licence](https://vision.imar.ro/human3.6m/eula.php), [NLF](https://awesome.ecosyste.ms/projects/github.com%2Fisarandi%2Fnlf), [BlazePose GHUM model card](https://dcmpx.remotevs.com/com/googleapis/storage/SL/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf), [ViTPose card](https://huggingface.co/usyd-community/vitpose-base), [MAE-lineage note](https://huggingface.co/ruisv/bcdl-vitpose-wholebody).

**Training data on disk (2026-11-11):** 417 CMU clips, 128 MB, 95 performers, 12 kinds of motion (walk 55, run
40, jump 40, dance 45, fight 40, sport 35, floor 35, climb 25, carry 30, gesture 35, move 25, animal 15) at
`D:/Plajah Models/mocap/cmu-fbx` (`manifest.json`, `CREDITS.md`), fetched by `scripts/mocap/fetchCmuTraining.mjs`.
Benchmark performers (02, 13, 111, 135, 143) are held out. CMU terms: may be included in products, **may not be
resold, even converted**: never offer CMU clips as a store motion pack.

**Multi-view from a video model?** Not as ground truth: a generated 2×2 grid paints each panel independently (limb
angles, stride and timing drift; no known cameras), and it carries no true 3D. The renderer gives exact, synced,
calibrated multi-view with truth; video models are useful later to restyle renders into realistic people (same
motion, known truth), licence-checked per model.

## 6b. Virtual camera rigs + multi-view renders (2026-11-11, uncommitted)

**One rig model for the whole platform:** `services/cameraRig/rig.ts`. A rig is plain data (each camera's
position, look point, lens as field of view or mm, roll, and follow: locked / pan / track), described round a
subject at the origin facing +Z. It has:
- `toThree`, `place`, `calibration` (pinhole numbers), `project` and `triangulate` (weighted least squares; a view
  the tracker is unsure of counts for little but is kept when it's all there is);
- presets: `twoPhones`, `fourCorners`, `eightRing`, `coverage` (24 mm wide master, 50 mm medium, 85 mm close),
  `dialogue` (two-shot plus over-the-shoulders), `action` (low wide, tracking side, high angle);
- `randomRig`, and `fitRadius` to keep a whole path in shot.

The same rig is meant for:
- mocap triangulation (two or four phones);
- **scene staging**: Fabula / Stage previz, shot lists with wide/medium/close coverage on the same action;
- **generative video blocking**: render each blocked camera's depth, pose or edges as the guide for its shot.

Tests: `tests/virtualCameraRig.test.ts` (3; in `npm run test:mocap`). The older `tests/cameraRig.test.ts` is Go Live's phone camera owner, unrelated.

**Multi-view renderer:** `labs/mocap/multiview.ts` (lab: `mocapMulti`). It works like the benchmark, but every
camera of a rig films the same frame through its own tracker.
- `render` returns per camera the frames and the per-frame calibration, plus world truth and contact sheets.
- `scoreViews` compares each single camera with triangulating any subset of cameras.
- `travel: 'fit' | 'track' | 'auto'`: on a moving performer the cameras either pull back or move with them.
- Training clips come from D: through the lab's dev-only `/__cmu/` route.

First result: 02_01 walk, 5 s, `fourCorners`, peasant, heavy model.

| Cameras | Bone error |
|---|---|
| Each camera alone (MediaPipe 3D) | 18.4 / 24.8 / 20.5 / 14.2° (mean 19.5°) |
| Two cameras about 90° apart | 11.0–15.1° |
| Two cameras facing each other | 23.6–24.7° (no gain: they share one line of sight) |
| All four | **11.7°**, reprojection 5.7 px |

Shins and spine come out at 4–5° and thighs/forearms at 15–19°. Some of that is MediaPipe's hip and wrist points
sitting elsewhere than the rig's joints, which the lifter can learn. Contact sheet:
`docs/mocap-fourcorners-sheet.jpg`. **Phone-setup rule:** place phones 60–120° apart, never opposite each other.

**Lifter training rows:** `generate()` writes `D:/Plajah Models/mocap/lifter-data/v1/<clip>.f32 + .json`. Each clip:
- a random character (9 Era Clash bodies);
- a random 4-camera rig;
- a random backdrop, floor and light;
- a 6 s window;
- on travelling clips, tracking cameras half the time.

Each row is one camera at one frame, 261 float32 values (`LAYOUT` in multiview.ts):
- MediaPipe's 33 picture points with visibility;
- its 33 world points;
- the truth's 15 joints in that camera's frame;
- the camera's rotation, shift and lens;
- foot heights;
- found/not found.

Choices are seeded by clip name, so reruns reproduce, and it resumes, skipping clips already written. Cost: about
1 KB per row, roughly 0.7 MB per clip; 417 clips ≈ 0.3 GB. Runs at about 165 ms per camera-frame with the heavy
model, so the full set takes several hours in a lab tab that must stay open.

## 6c. The Plajah pose lifter (2026-11-11/12, uncommitted)

**What it is:** a correction network that takes MediaPipe's output from one camera and returns a better 3D body.

**Training** (`scripts/mocap/train_lifter.py`):
- Runs in the Tela runtime's PyTorch (`D:/Plajah Runtime/tela-py`, CUDA on the 4070) and takes seconds per run.
- Input: a 9-frame window of MediaPipe's 33 picture points (as camera rays, hip-relative, torso-scaled), their
  visibility, and its 33 world points.
- Output: 15 hip-relative joints in the camera frame, in hip→neck units.
- Network: a residual MLP (512 wide, 2 blocks), trained from scratch with L1 plus a bone-direction loss and mirror
  augmentation.
- Validation is on performers held out from training.
- Weights are saved as JSON + float16 (4 MB). No ONNX: the exporter isn't in tela-py, and a plain file needs no
  runtime in the browser.

**Browser** (`services/mocap/lifter.ts`):
- `loadLifter()` loads `public/models/mocap/lifter-v1.*`.
- `predict(take)` gives the corrected joints; `apply(take)` writes them back into MediaPipe's world points at
  MediaPipe's scale, so the whole solver runs unchanged on the result.
- Speed: 2.5 ms per frame in plain TypeScript (live-capable). Its output matches Python exactly.
- Tests: `tests/lifter.test.ts` (19 in `test:mocap`).
- Benchmark switch: `mocapBench.rescoreStored(keys, {}, { lifter: url })`.

**First model** (97 clips, which happened to be only walk, run and jump, because the generator goes in list order):
- On held-out performers: bone error 26.4° → **12.1°** from one camera, as good as two triangulated phones.
- Benchmark takes (other performers, other renders):

| Take | Before (MediaPipe) | With lifter |
|---|---|---|
| Walk, side | 19.9° | **10.2°** |
| Walk, front | 18.1° | **10.0°** (travel 1.1 → 2.3 m of 4.0) |
| Jumps | 14.9° | 12.8° |
| Run | 22.3° | 16.6° |
| Kicks, kata | — | about flat |
| Boxing | 34° | **43° (worse)** |
| Get-up | 43° | **55° (worse)** |

Motion it hasn't seen, it makes worse.

**Full model** (2026-11-12, all 417 clips, 94 performers, 303k windows; about 3 minutes on the 4070):
- Held-out performers (11, harder mix with fights and floor work): 32.0° → **19.1°**; forearm/hand 57–67° → 36–39°.
- On its own it still lost two cases (boxing 34.3 → 34.9°, get-up 43 → 49.6°: the performer is lying down and is
  found in only 27% of frames).
- **Confidence gate** (`apply(take, gate)`, on by default): per frame, the lifter fades out when the limbs are
  poorly seen (mean visibility < 0.5) or when it disagrees with MediaPipe's limb directions by more than 40°. The
  weight is smoothed over ±4 frames so nothing pops. `apply(take, false)` turns the gate off.

| Take | MediaPipe | Lifter, no gate | **Lifter + gate** |
|---|---|---|---|
| Walk, side | 19.9° | 10.1° | **10.1°** |
| Walk, front | 18.1° | 8.0° | **8.0°** (travel 1.1 → 2.5 m of 4.0) |
| Run | 22.3° | 19.9° | **18.0°** |
| Punch | 35.1° | 28.6° | **29.4°** |
| Kick | 23.6° | 18.8° | **18.4°** |
| Roundhouse | 27.5° | 22.1° | **22.3°** |
| Boxing | 34.3° | 34.9° | **33.2°** |
| Jumps | 14.9° | 11.1° | **10.9°** |
| Kata | 30.1° | 26.7° | **25.5°** |
| Get-up | 43.0° | 49.6° | **43.0°** |
| Mean | 26.9° | 23.0° | **21.9°** |

With the gate, no case gets worse, so **Body correction is on by default in the capture room** (toggle under
Smoothing; it appears once the model has loaded, and a take solved before that is re-solved). On a real clip
(Kenne's warrior walk A) shake drops 5.0 → 2.4 mm and the grade goes Usable → Good; hip height reads ~0.12 m lower,
worth checking on a real person.

**Live** (`lifter.stream(camera, gate)`, one frame at a time, no look-ahead, about 2.5 ms per frame):

| Mode | Mean | Worse than MediaPipe |
|---|---|---|
| Offline (`apply`, ±4 frames) | 21.9° | none |
| Live, same model streamed (newest frame repeated in place of the future) | **22.7°** | none |
| Live, model trained causal (`train_lifter.py --causal`, val 19.9°) | 22.8° | boxing 36.0° |
| Live, causal, no gate | 24.0° | boxing, get-up |

One model serves both; the causal one is kept off the site (`D:/Plajah Models/mocap/lifters/`). Live, the gate
falls at once on a bad frame and climbs back over 4 frames. `mocapBench.rescoreStored(keys, {}, {lifter, live: true})`
scores the live path. Not yet wired into a live consumer: the capture room's live view draws only 2D points, so the
users are the VTuber and character puppets (`services/vtuber/poseTracker.ts` world points).

**Why boxing stays bad** (diagnose `boxing-20`): MediaPipe's own 2D points are wrong. Left elbow and wrist sit
50–100 px off at high confidence (0.8–0.97), and the two wrists are swapped in 48 of 180 frames. A render of the
take shows why: the performer has turned nearly side-on and **the left arm is hidden behind the body**. MediaPipe
guesses the hidden arm and still reports it as seen, so neither the lifter nor the gate can catch it.

**Hand pass, tried and parked** (`services/mocap/hands.ts`, 2026-11-12). MediaPipe's hand landmarker runs on zoomed
crops around each wrist and elbow, and the wrists are moved onto the hands it finds (left/right from its own call,
else by reach from each shoulder). Benchmark option: `hands: true` keeps both takes from one render.

| Test | Result |
|---|---|
| Boxing, peasant | hands found in 12 of 180 frames; 34.3° → 34.3° |
| Punch / kata, monk, fisherman, samurai | found in 5–42% of frames, 80–210 ms a frame |
| Punch, fisherman, wrists it moved | 32.7 → **38.3 px** from the truth (better in 9 of 29); 27.8° → 27.9° |

The game characters' hands are too coarse for the hand model, and the boxing arm is hidden, so it can't help
there. It is off everywhere; re-test it on footage of real people before deciding. **A hidden limb from one
camera is a job for a second camera**, which moves the two-phone mode up the list.

**Next:**
1. A real two-phone capture mode (the fix for hidden limbs): sync by a clap or flash, calibrate from the
   performer's own body, triangulate with `services/cameraRig` (two phones at ~90° gave 11–15° in the renders).
2. Stream the lifter into the VTuber/puppet pose path behind a setting, and measure it on a real webcam.
3. Kenne's own webcam take, to confirm on a real person (and re-test the hand pass on it).

## 7. Decisions for Kenne

1. Product names for the Studio and the capture room.
2. Which game pilots the Studio first: **Era Clash Chapter I** (proposed; the hand work exists to compare
   against) or Ravencrest.
3. Is the Studio for Plajah's own team first, or opened to creators from day one (tiers, Plajah+)?
4. Multi-phone capture in phase 5, or earlier?
5. Hosting for game assets (the ~100 MB question) before the first public episode.
