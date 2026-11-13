# Character Forge: current-gen characters built in Plajah

Kenne (2026-11-11): build the capability to make and rig high-quality characters inside Plajah's own game design environment (Game Studio, `docs/game-studio-and-mocap.md`), with Plajah's tools, not Blender. The bar is current-gen games:
- armour and clothing are real objects on the body;
- bodies have muscle and mass, bend correctly and react.

The Forge is Game Studio's **Characters** room. It replaces the image-to-shell route (`buildSheetCast.py`, `buildWarriors.py`), which can only make one fused surface (`docs/era-clash-3d-characters-v2.md`).

## The workflow: from a creator's art to a scored character and kit

The Forge is a repeatable process, not a one-off. A character is one folder of data; one command runs every stage; every
result is measured against the creator's own art and checked against quality gates. This is how Plajah's creators will
bring their characters to life, so the same steps must give the same quality for anyone's art.

### 1. What a creator brings

| Art | What it is | Used for |
|---|---|---|
| Portrait | The face, straight on | The face's shape (468 landmarks) and its painting |
| Turnaround | The character standing, front, side and back, on a plain ground | Body proportions, the head's outline, every part's shape, the clothes' painting, all scoring |
| Flat-lay (optional) | Each piece of the outfit and every prop laid out on a plain ground | Each piece as its own asset, painted clean and unoccluded |

The spec, `scripts/eraclash3d/characters/<id>/forge.json`, names these files and sets:
- the body's settings (height, build, musculature, weight, age) and the head's starting fit;
- the kit (`tosei-gusoku` today);
- where the character and its kit are written;
- the quality gates (overall, head, every part).

A rough box per flat-lay piece goes in `flatlay_pieces.json`; intake snaps each box to the piece.

### 2. One command

```bash
FORGE_SPEC=scripts/eraclash3d/characters/<id>/forge.json npx tsx scripts/eraclash3d/forge.ts
```

Nine stages run in order. A stage whose inputs haven't changed since it last ran is skipped. Name stages to run only those (`forge.ts parts score`), and add `--force` to rerun.

| Stage | What it does | Writes |
|---|---|---|
| intake | Measures the art. Turnaround: each view's columns, the soles, the chin and face length (MediaPipe on the front figure's head). Portrait: its landmarks. Flat-lay: each piece cut out (SAM). Flags anything doubtful. | `intake.json` |
| context | Works out who the character is before anything is built. It recognises the archetype (a warrior) and the tradition (Sengoku Japan) from the kit, the flat-lay and the spec, and resolves the arms that belong from the Heritage Codex. It measures them from the flat-lay and holds them to the historical record, then anchors them to museum objects and Combat Atlas entries. See §7. | `context.json` |
| build | Body from the anatomy, face from the art, the head fitted by its warp, the wardrobe fitted by its armour fit, rig and springs. Every kit piece also as its own GLB, painted from the flat-lay. | the character GLB, the kit folder, `kit.json` |
| fit-head | Measures the head and neck against the art's outline row by row and folds the gap into the warp, until the head stops improving. | `head_warp.json` |
| parts | Cuts the art into its parts (SAM, prompted by the model's own parts, one prompt per piece, the smaller cut owning a shared pixel) and flags doubtful cuts. | the art's part masks |
| fit-body | Searches the body's build, musculature and weight against the art; the anatomy grows skeleton, muscle, fat and skin from them. | `body_fit.json` |
| fit-armour | Searches the kit's shape parameters (dō, watagami, collar, kusazuri, sode, hakama, greaves, scabbard) against the whole silhouette and each part's overlap with the art. It's a parallel pattern search: every parameter is stepped both ways, and the candidates are built and scored four at a time. The improving moves are then combined, and the best combination is kept. | `armour_fit.json` |
| paint | Paints everything the turnaround draws from it, each texel from the views that see it: clothes, armour, skin, scalp and face. Instanced pieces (the lacing cords) get one colour per instance. | the painted character |
| score | Scores every view and every part, checks the gates, and writes the report. | `report.md` |

### 3. Quality, measured

- **Scores, not impressions:** every result is scored against the art from every view, on shape (silhouette overlap, outline distance) and colour (CIE Lab), whole figure and part by part. The report states the gates, what passed, and by how much the rest fell short.
- **Below the gates, the work isn't finished.** The report says so, and the fit stages are what close the gap.
- **Where it loses, drawn:** `delta_<view>.png` tints each scored block by its colour error (green to red) and marks shape misses (red: the art only; blue: the model only). Read it before changing anything: it says which piece to fix.
- **The scorer can be wrong too.** Doubtful SAM cuts are flagged and left out of the search, never silently scored.
- **The scores miss some things**, such as a crease in a surface or cloth through armour in motion. Close-ups in the game viewer (`forge.html`, `kit.html`) are part of the check.

### 4. Adding a character

1. Make `scripts/eraclash3d/characters/<id>/forge.json`, using Haru's as the pattern, and point it at the art.
2. Choose the outfit with `kit` (see below).
3. If there's a flat-lay, add `flatlay_pieces.json` with a rough box per piece, and `flatlay_paint.json` saying how each piece lies in it.
4. Run `forge.ts`. Then read `report.md` and the images it points to.

### 5. Outfits are pieces, not code

The wardrobe (`services/argilla/creature/wardrobe.ts`) is a library of pieces: `PIECES` lists each one with the fit parameters it reads.
- **A kit is a list of pieces.** A spec names a preset (`"kit": "tosei-gusoku"`) or composes its own: `{ "preset": "kosode-hakama", "add": ["sode"], "without": ["hachimaki"] }`, or `{ "pieces": [...] }`.
- **Pieces left out are never built, rigged or simulated.** Their bones, spring chains and cloth go too. The body stays visible where nothing covers it: a bare forearm, a shin with no greave.
- **The search only tunes what is worn.** `fit-armour` takes its parameters from the pieces in the kit.
- **Proof:** `characters/haru-ronin/` is Haru out of armour, the `kosode-hakama` preset with his hakama let down to the ankle in his `armour_fit.json`. It builds with no code changes. His turnaround shows armour, so only intake and build apply to him; paint and score need art of the outfit worn.
- **A new kind of garment** (a coat, a cloak, plate armour) is a new entry in `PIECES` and its builder section. Every character can then wear it.

### 6. The body is fitted too

`fit-body` searches the anatomy's own sliders against the art, the same way `fit-armour` searches the kit: shoulder breadth (`build`), `musculature` and `weight`. The anatomy grows the skeleton, muscle groups, fat and skin from those sliders. Skin weights and the corrective shapes follow from that body. The result goes to `body_fit.json`; height stays the spec's, since the art's scale is set by it.

### 7. Context: the Forge knows what it is building

Before the build, the `context` stage works out **who the character is**, and that decides a great deal: how the body is built and stands, which arms go with which, how each is made, what it is made of, how it is worn, and how it moves. The knowledge lives in the **Heritage Codex** (`services/argilla/heritage/codex.ts`), and every Forge reads it.

- **Recognise.**
  - The evidence is what the Forge already holds: the kit's pieces, the flat-lay's item ids and the spec's words. Each archetype and tradition in the codex has weighted cues.
  - The result comes with a confidence and the cues that decided it. For Haru: warrior 97%, Sengoku Japan 100%.
  - A `"context": { "archetype", "tradition", "words", "worn" }` block in `forge.json` confirms or overrides it.
- **The archetype shapes the body.**
  - A warrior's anatomy is searched among strong, lean bodies: `fit-body` takes the archetype's bounds.
  - The archetype also sets a **bearing**, *commanding* for a warrior: chest open, shoulders settled, weight low and centred, gaze level. It goes into the GLB's `extras.forge.bearing`.
  - It lists the fighting arts to study in the Combat Atlas.
- **The tradition names the arms, and what goes with them.**
  - It names the arms that belong, and their companions. A katana implies a wakizashi beside it and a sageo cord tying the saya to the obi.
  - It also says how they are worn, for example through the uwa-obi over the dō, edge up, at the left hip. A tachi, slung edge-down, is never confused with it.
  - An arm the turnaround wears is *worn*. One only the flat-lay shows is *kit*: it is built, but not put on the body.
- **Each arm is measured, then held to the record.**
  - The codex gives dimensions as [least, typical, most] (nagasa, sori, motohaba, kasane, kissaki, tsuka, tsuba, saya), plus construction, fittings, materials, carry and behaviour, each with sources.
  - The flat-lay gives proportions (hilt to blade, scabbard to blade), colours (wrap, ray skin, fittings, lacquer) and features (a bo-hi groove, a midare or notare hamon). It also tells whether a sword is laid out bare or sheathed, from lacquer's tint against steel's grey.
  - Anything outside the record is held to it and reported, never obeyed. The art's wakizashi hilt is twice any real one's. Physics comes before pictures: a scabbard is always long enough for its blade.
- **Anchored to the real world.**
  - Plajah's museum layer (`services/museum`: the Met, Cleveland, the Art Institute, Japan Search, …) is searched for period objects. Their recorded materials are tallied; Haru's arms have 31 objects behind them.
  - The Combat Atlas gives the arts that teach how these people moved: Kendo, Judo and Sumo for a samurai.

**The arms are built the way the craft builds them** (`services/argilla/creature/koshirae.ts`, painted by `scripts/eraclash3d/forgeArmsLook.ts`):
- **The blade.** Shinogi-zukuri section, with the edge on the outside of a koshi-zori curve. It has the kissaki's fukura, and the bo-hi cut in when the art shows one.
- **Its maps.** UVs lie across the blade, so the hamon's line is painted where a polisher raises it: frosted, milky and less metallic than the dark mirror of the ji. The ji has itame grain and nie along the line.
- **The fittings.**
  - Habaki, seppa, and an iron tsuba with its mimi rim and relief.
  - On the hilt: fuchi, ray skin with real nodules, and the hishi-maki wrap. Two braids cross in the middle of each face and leave diamonds. Menuki sit under the wrap, with the mekugi and kashira.
  - Gilt pieces are chased with nanako.
- **The saya.** Urushi over its curve, with horn koiguchi, kurikata and kojiri, and the sageo wrapped and knotted.
- **Metals.** A metal takes its *hue* from the art and its *brightness* from the codex. A photo of polished steel is mostly the room it reflects.

**Worn and moving as the record says.**
- The sword in the hand and the one in the obi are the same koshirae.
- The build turns it edge-up or edge-down as its carry requires, and turns the kurikata to the omote face, away from the body.
- The scabbard rides a `SayaPivot` spring bone, pinned at the obi and limited to the codex's swing (7° for an uchigatana). The sageo's free ends are cords on their own spring chains.

**To teach the Forge a new tradition or weapon:** add an archetype, a tradition or an arms entry to the codex, with its cues, dimensions, carry, behaviour and sources. Every creator's Forge then knows it. A new builder (a European longsword, a spear) goes beside `koshirae.ts` and is named in the entry's `builder`.

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
  - **The search on parts** (2026-11-12, second pass).
    - The art's SAM cuts are cached, so `--fast` reports each part's IoU in seconds. The search scores half whole-figure shape, half the part IoUs (dō, kusazuri, sode, obi, hakama, shins, sword), with the hakama's fullness and the scabbard's angle added.
    - The pose fit also scores the arms against the art's arm masks.
    - Result: hakama front/back fullness 13 → 7 cm, scabbard 40° down and 28° out (from 17°/16°), wakizashi off by default (the art shows one sword, `FORGE_WAKIZASHI=1`).
    - Part IoU after: dō 57, kusazuri 65, hakama 47 (side 66), obi 40.
  - **The part scorer, fixed** (2026-11-12). The first version mis-cut the arms from behind, the sash and the sword.
    - **Per piece:** a part made of separate pieces (two arms, two shins) gets one SAM prompt per piece, joined after. SAM cuts one object per prompt.
    - **Prompts on the art:** inside points only where the art has the figure.
    - **Several prompt styles:** each piece is tried as box with points, points alone and box alone, keeping the cut that best fits the model's piece (grown 6 px) times SAM's confidence.
    - **One owner per pixel:** the smaller cut wins (a sash over the tassets, a foot below the shin). Never the model's part, which would flatter the score, and never the surer cut, which swallowed small neighbours.
    - **Doubtful cuts:** a cut far smaller or larger than the model's part, or fitting it badly, is marked `.unreliable` and left out of `--fast` and the search.
    - The run takes 2.3 min (OpenCV dilation, not PIL's MaxFilter).
    - Honest part IoU now: head 77, dō 67, kusazuri 70, sode 65, arms 54, obi 45, hakama 51, shins 69, feet 62, sword 31. The art's sword still includes the sheathed hilt the model's scabbard lacks.
  - What's left: shape (72–75%): the shoulder guards stand out like wings and the dō's top is off by 2–3 cm. The head is 78–81% IoU. The GLB is now about 25 MB with the paintings.

- **Every piece its own asset** (Kenne, 2026-11-12: weapons, armour and hardware modelled separately as real 3D assets for the game and anything else).
  - The wardrobe tags each vertex with its piece. `forgeKit.ts` (run by the build) writes each piece as its own GLB to `public/games/era-clash/3d/assets/props/haru/`:
    - **Armour:** dō, kusazuri, sode, kote, suneate, kabuto.
    - **Garments:** hakama, eri, kosode, obi.
    - **Weapons:** katana, the katana in its saya with the hilt out, wakizashi.
  - Each GLB is in its own frame (origin at the bottom of its middle) and split into nodes by what moves on its own: each tasset, each sode, left and right. The dō's instanced lacing becomes real cords on it.
  - `kit.json` lists for each piece: label, era and evidence, size, triangle count, the bone it hangs from, and where it sits as worn.
  - `games/era-clash-3d/kit.html` lays the kit out like a flat-lay.
  - **Rebuilt from the flat-lay** (2026-11-12, `forgeKitPaint.ts`).
    - Each asset is painted from its own flat-lay picture on one xatlas atlas:
      - dō, kusazuri and sode together from the assembled armour, the dō's back from its back plate;
      - hakama and kosode as worn;
      - obi and hachimaki unrolled round the body;
      - kote, suneate, tabi and waraji per side along their length;
      - swords along the blade.
    - New pieces: hachimaki (knotted, two tails) and waraji (straw soles, navy cords). The kote takes its cloth sleeve, the suneate its kyahan, and the tabi are an asset of their own (all cut from the body).
    - Six kusazuri (`ArmourFit.kusaCount`), as the flat-lay shows. Garments are double-sided.
    - Sizes: 16 assets, 20 MB (dō 5.6 MB; the armour atlases are 2048).
    - Open: the kabuto has no picture (the art shows none), the tabi's white cut-out is still patchy, and the shells are not yet solid.
- **The flat-lay** (`D:\Plajah Runtimeorge\haru-ref\outfit-props.png`, Muse) shows every piece clean and unoccluded.
  - `engines/tela-3d/cut_pieces.py` (SAM, box prompts per item, pairs halved) cuts its 15 items into `haru-ref/pieces/`, with size, aspect and k-means colours. The boxes are in `scripts/eraclash3d/data/haru_outfit_pieces.json`.
  - The white tabi on the pale ground still cuts patchily.
  - It differs from the turnaround: it adds a wakizashi, white tabi and a hachimaki, and shows 6 tassets where the model has 7.

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
