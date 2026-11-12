# Character Forge: current-gen characters built in Plajah

Kenne (2026-11-11): build the capability to make and rig high-quality characters inside Plajah's own game design environment (Game Studio, `docs/game-studio-and-mocap.md`), with Plajah's tools, not Blender. The bar is current-gen games:
- armour and clothing are real objects on the body;
- bodies have muscle and mass, bend correctly and react.

The Forge is Game Studio's **Characters** room. It replaces the image-to-shell route (`buildSheetCast.py`, `buildWarriors.py`), which can only make one fused surface (`docs/era-clash-3d-characters-v2.md`).

## What it builds on (nothing rebuilt)

| Need | Already in Plajah |
|---|---|
| A body built inside out (skeleton → muscle → skin), the rig and muscles the same data as the skin, one shared topology | Plajah 3D (Argilla) creature pipeline: `services/argilla/creature/anatomy.ts` (33 joints, 25 muscles), `pipeline.ts`, `finish.ts`, `exportCreature.ts` (GLB with clips and morphs), `motion.ts` (gait and IK) |
| A field to sculpt, collide and bake | Argilla's sparse SDF; its sim layer is planned as the collider |
| Parts and materials ("not just blue, a uniform") | `services/argilla/understand/parts.ts`, `materials.ts`, SAM 2.1 on the Tela 3D runtime |
| Paint from the art | `engines/tela-3d/paint_from_views.py`, Argilla character sheets (per-view cut-outs) |
| A face rig | VTuber `services/vtuber/rigBuilder/` (43 ARKit shapes, canonical face) |
| Motion | `services/mocap` (capture from camera or video), the CMU library, Era Clash's retargeting and move cutting |
| Period accuracy | The museum service (`services/museum`) and the era audit (`docs/era-clash-3d-era-accuracy.md`) |
| Shipping | The game core (`playkit`, per the Playables design) |

## The Forge, layer by layer

### 1. Body: a human anatomy plan

The creature plan generalized to humans.
- **Proportions:** from anthropometric ranges, set by a few sliders (height, build, musculature, age, weight). Each character's sheet sets its numbers.
- **Skeleton:**
  - Joint names follow the shared contract skeleton, so every animation (CMU, captures, Haru's strikes) retargets.
  - Real hands: three joints per finger and a thumb, so weapons are gripped, not glued.
  - Twist joints in the forearms and upper arms.
- **Muscle groups:** about 30 human ones on the skeleton, each with an origin, an insertion and a belly: deltoids, pectorals, lats, trapezius, biceps, triceps, forearm flexors and extensors, abdominals, obliques, glutes, quadriceps, hamstrings, calves, neck.
- **Skin and face:**
  - Skin over the muscle on the shared body topology, with edge loops at every joint.
  - The face uses the canonical face mesh, so the VTuber rig builder's 43 expressions apply without fitting.

### 2. Muscle and mass

- **Corrective shapes** baked from the anatomy itself: bend the elbow in the field, the biceps belly shortens and bulges, and the result is stored as a morph. Shoulders keep their volume when raised, and knees and hips fold without pinching. In game, joint angles drive the morphs.
- **Dual-quaternion skinning** in the engine (a skinning node), so twisting wrists and forearms keep their volume.
- **Soft tissue:** a light spring on the belly, chest and thighs for impact and landing weight. Hit reactions already exist in combat.

### 3. Wardrobe: clothes and armour as real geometry

Each piece is its own mesh with its own material, made from parametric period patterns and fitted to the body by offsetting from its field. Every piece carries an era tag and its museum references.

- **Cloth:**
  - **Japanese:** kosode, hakama, haori, obi, tabi and waraji.
  - **Norse:** tunic, trousers, wool cloak.
  - **How they move:** cut as panels around the body, then skinned, with spring chains on hems, sleeves and cloak edges. Garments collide with body capsules taken from the anatomy.
- **Armour (rigid):** plates are bound to a single bone, so they never bend.
  - **Tosei-gusoku:**
    - The cuirass (dō) as rows of lamellar plates (kozane) on the torso's shape, with real laced silk cords (odoshi), instanced.
    - Hanging panels: 5–7 tassets (kusazuri) and the shoulder guards (sode), each a column of plates on spring bones.
    - The rest: armoured sleeves (kote) of plates over mail, thigh guard (haidate) and greaves (suneate).
    - The helmet: kabuto bowl, neck guard (shikoro) and turnbacks.
  - **Norse:** mail byrnie (a mail layer over the cloth shell), riveted leather, spangenhelm helmet, round shield (planks, boss, rim) on a strap, bearded axe.
- **Weapons and props:** sockets on the hand and hip, so a katana sits in the obi and in the grip.

### 4. Look

- **PBR material library:**
  - Lacquer with a clear-coat sheen, silk cord, forged iron, oiled leather, woven fabric, fur and mail.
  - Skin with a subsurface tint.
  - Detail from the Poly Haven pool plus procedural wear.
- **Paint from the reference art**, part by part:
  - Sheet cut-outs projected per part with `paint_from_views` and the SAM parts.
  - Each character still looks like Muse's art, but on real geometry.

- **Fit to the art, by measurement** (Haru v3, 2026-11-12):
  - `scripts/eraclash3d/forgeSilhouette.ts` lays the GLB's rest silhouette over the turnaround, front and side, scaled so sole and chin agree. It prints art-against-model widths per height, and draws the model's outline over the art.
  - **Face shape:** `forgeFaceFit.ts` takes MediaPipe's 468 landmarks on the front portrait (not the average canonical face), scaled to the sheet's face length. Their depth comes from MediaPipe, with the midline pulled onto the side view's profile (brow, nose, lips, chin).
  - **Head:** the cranium, jaw and neck follow the face through the anatomy's head fit (`HumanTune.head`: forward, up, scale, width, neck).
  - **Sides and back of the head:** painted from the sheet's side and back views, blended by the surface normal and tone-matched to the portrait's skin. Only skin and hair pixels are used: no collar, no background, and not the art's own ear.

- **The fidelity loop** (Kenne, 2026-11-12: re-check the art from every angle and keep correcting until it scores 95%):
  - `npx tsx scripts/eraclash3d/forgeFidelity.ts` scores the GLB against the turnaround.
    - It poses Haru like the art (pose fitted to the silhouette) and settles the spring bones with the playkit's own `SpringBones`.
    - It renders the front, side and back views in software, in the sheet's frame.
    - It scores each region (head, torso, legs) on shape (silhouette IoU, outline distance) and colour (CIE Lab, 1.2 cm blocks).
    - Images and `fidelity.json` go to `D:\Plajah Runtime\eraclash3dorgeidelity`.
  - `--update-warp` measures the head's outline row by row against the art: front, back (without the ponytail), half-width and crown. It folds 80% of the gap into `scripts/eraclash3d/data/haru_head_warp.json`, which the build bends the head's distance field by.
  - `bash scripts/eraclash3d/forgeFitLoop.sh [passes] [target]` builds, scores and updates until the score passes the target or stops improving.
  - Scores so far (overall / head IoU front, side, back):
    - start: 53.8% / 0.73, 0.65, 0.74
    - after the loop and the art's ponytail arc: 53.5% / 0.81, 0.78, 0.78
  - `--paint <glb>` (`forgePaint.ts`) paints every garment and armour piece from the turnaround.
    - **Atlas:** each piece gets its own atlas (xatlas, `engines/tela-3d/uv_atlas.py`) on TEXCOORD_1, so the tiling detail maps on TEXCOORD_0 keep working.
    - **Projection:** in the art's pose with the springs settled, each texel takes the views that see it, depth-tested and weighted by facing. The side view is mirrored for the right side, which the sheet doesn't draw.
    - **Unseen texels** keep the piece's colour.
    - Measured after painting: 70.1%. Colour went from 31–38% to 66–68%, with the legs at ΔE 4–6.
  - **Armour fit** (`forgeArmourFit.ts`): coordinate descent over `ArmourFit` (dō, kusazuri, sode).
    - Each try rebuilds with the cached body (8 s), then scores torso and legs with `forgeFidelity --fast` (5 s).
    - The result lives in `data/haru_armour_fit.json`.
    - First run: 73.1% → 75.2% torso/legs shape. Kusazuri lames 5.8 → 8 cm, the dō 2 cm taller, the sode 3 cm wider, further back and leaning out 20°.
  - The haidate is off by default (`FORGE_HAIDATE=1`): the art shows the hakama straight below the kusazuri.
  - **In motion:** the hakama is slim under the tassets and the tassets collide as thick as the cloth, so a lifted knee no longer pushes the hakama through them. The static score cannot see this: check clips in the viewer.
  - **Part by part** (`--parts`, `forgeParts.ts`, `engines/tela-3d/sam_prompt.py`).
    - **Model parts:** each part of the posed model (head, dō, kusazuri, sode, arms, obi, hakama, shins, feet, sword) is rendered in the art's frame. A triangle's part comes from its mesh, material and dominant bone.
    - **Art parts:** each model part prompts SAM 2.1 on the art with points inside it, points inside its neighbours as "not this", and its box. SAM cuts the art's matching part along the art's own edges.
    - **Comparison:** each pair is compared on IoU, outline distance and colour. Overlays are written to `parts_<view>.png` (art part tinted, model part outlined, same colour).
    - First run, IoU front / side / back:

      | Part | IoU (front / side / back) |
      |---|---|
      | head | 66 / 75 / 63 |
      | dō | 53 / 26 / 64 |
      | kusazuri | 60 / 54 / 68 |
      | sode | 32 / 82 / 33 |
      | arms | 20 / 38 / 28 |
      | obi | 42 / 24 / 47 |
      | hakama | 47 / 54 / 34 |
      | shins | 64 / 33 / 75 |
      | feet | 49 / 63 / – |
      | sword | 18 / 0 / 31 |

    - The worst offenders are named: the scabbard sticks out level where the art's hangs diagonally, the arms stand off the body, the hakama is too wide and too high, and the sode spread wider than the art's.
  - What's left: shape (72–75%): the shoulder guards stand out like wings and the dō's top is off by 2–3 cm. The head is 78–81% IoU. The GLB is now about 25 MB with the paintings.

### 5. Rig and export

- **The GLB contains:**
  - the contract skeleton, finger and twist joints, and the spring chains (tagged per piece);
  - the corrective morphs and the face's ARKit shapes;
  - the clips;
  - level of detail: the full figure near the camera, a lighter one for crowds (meshoptimizer, as the townsfolk use).
- **One file per character**, usable in Era Clash, Ravencrest and anything built on `playkit`.

### 6. Engine: shared, in `playkit`

- **Spring bones:** verlet chains with stiffness, drag, gravity and collision with the body's capsules. For rigid pieces that swing: tassets, shoulder guards, the ponytail.
- **Cloth** (`clothSim.ts`): soft garments (hakama legs, kosode sleeves) as XPBD cloth.
  - **The grid:** a coarse particle grid sampled from the surface the garment was modelled on, exported in `extras.forge.cloth`.
  - **Anchors:** each particle is skinned on the CPU with the garment's own weights. Tied rows are pinned. Elsewhere a max-distance tether to the anchor holds through any animation, with a gentle pull back to the cut.
  - **Solve:** stretch, shear and bend constraints, small substeps at 120 Hz, and the body capsules.
  - **The mesh:** the garment mesh follows the grid triangle by triangle, keeping its pleats.
  - **Check:** `npx tsx scripts/eraclash3d/benchCloth.ts` times the solve and checks the tether.
- **Morph drivers:** joint angle in, morph weight out.
- **Skinning:** the dual-quaternion skinning node.
- **Cost:** budgeted against the Arc iGPU (a spring pass under 0.3 ms for a full cast).

### 7. The Characters room (UI)

1. **Body:** sliders, plus "from the sheet" (fit the proportions to the reference).
2. **Wardrobe:** pick pieces from period kits, with their era tag and the museum objects they're drawn from.
3. **Paint:** project the art, adjust per part.
4. **Rig test:** play any clip from the motion library (CMU, captures) and watch springs and muscles live; strike the character to test hit reactions.
5. **Export to the game:** the character is live in Era Clash at once.

## First slice: Haru v3

The bar for everything after:
- the human body plan;
- the tosei-gusoku kit (cuirass with laced rows, tassets and shoulder guards on springs, helmet, sleeves, thigh guards, greaves);
- hakama and kosode;
- the katana and wakizashi;
- elbow and shoulder corrective morphs;
- spring bones in the engine.

**Gate:** side by side with the current Haru, mid-strike and mid-sprint. The tassets and shoulder guards swing and settle, the elbows and shoulders hold their volume, and nothing tears.

**Then:**
1. The raider (Norse kit).
2. Chen and Roland.
3. The townsfolk's kosode bodies on the crowd level of detail.
4. The Forge room in Game Studio.
