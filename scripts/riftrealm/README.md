# Rift Realm characters (scripts/riftrealm)

Turnaround sheet -> cut-outs -> Hunyuan3D-2mini shape (octree 380) -> painted from the sheet views -> Muse
skeleton rig -> geodesic re-skin -> shooter clips -> emissive map -> three.js check + score.
Work folder (heavy files) lives on D:\rr_work\<id>\ ; Python = `D:\Plajah Runtime\tela3d-py\Scripts\python.exe` ("$PY").

```
# 0. runtime (one job at a time, refuses >= 86 C)
powershell -File engines\tela-3d\restart.ps1

# 1. cut-outs: rembg (u2net) on the sheet crops (2x upscale), largest component only; pedestal bits, the weapon inset and
#    labels are outside the crop boxes / zeroed by hand (see clean_vs.py logic: zero alpha left/right of the boots, polygon mask for the back
#    view, because the wings made rembg drop the torso).  Crop boxes (sheet px, 1376x768):
#    Void Stalker front 95,55,415,700  side 430,55,760,700  back 780,55,1100,700
#    Robot Paladin front 55,115,395,690  side 400,115,625,690  back 625,115,960,690
# 2. shape (front cut-out only), octree 380, 300k faces, then keep the largest connected piece
$PY shape.py front.png shape.glb ; $PY clean_shape.py shape.glb shape_clean.glb
# 3. paint (front/back/left = side, right = mirrored side), 58k faces, 2048 PBR set
$PY engines\tela-3d\paint_from_views.py --mesh shape_clean.glb --out painted.glb --faces 58000 --res 2048 \
    --view front=front.png --view back=back.png --view left=side.png --view right=side_r.png
# 4. rig onto the Muse humanoid skeleton (same as Ravencrest), keeping its clips
$PY scripts\ravencrest\autoRig.py --rig public\games\ravencrest\assets\characters\muse\vampire.glb --mesh painted.glb --out rigged.glb --debug joints.json
# 5. geodesic weights (autoRig's air-distance weights drag the coat with the arms)
$PY scripts\riftrealm\geo_weights.py rigged.glb joints.json geo.glb
# 6. shooter clips baked as glTF animations
$PY scripts\riftrealm\author_clips.py geo.glb geo_clips.glb
# 7. emissive map from glow-coloured paint
$PY scripts\riftrealm\add_emissive.py geo_clips.glb public\games\rift-realm\assets\characters\void_stalker.glb --hue 265 345 --vmin 0.3 --smin 0.25
# 8. check + score (GLTFLoader in headless chromium via playwright; unlit base colour, ortho front/side/back)
node scripts\riftrealm\render_views.mjs <glb> <outDir> [--clip run --t 0.2]
$PY scripts\riftrealm\score_views.py <outDir> <refCutoutDir> <scoreDir>
```
(`shape.py`, `clean_shape.py`, `cut.py`, `clean_vs.py` are the small helpers in D:\rr_work\tools; copies are in this folder.)

## Rig contract (all characters)
Bones (22, Muse contract): Hips, Spine, Spine1, Spine2, Neck, Head, LeftShoulder, LeftArm, LeftForeArm, LeftHand,
RightShoulder, RightArm, RightForeArm, RightHand, LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase, RightUpLeg, RightLeg,
RightFoot, RightToeBase. Y up, faces +Z, feet at y=0, ~1.99 units tall, Left = +X. One skinned mesh, one material
(base colour, normal, ORM, emissive; 2048). Clips: idle, walk, run, chase, hit, death, attack_1..3 (Muse) and
aim_idle, shoot, strafe_left, strafe_right, reload (authored). Weapon sockets: LeftHand / RightHand (no weapon mesh baked).

## Pass 2 (2026-11-17): silhouette fit, side-view fix, parts, art-projected emissive
```
# masks (VS only): clean back cut-out from the mirrored front + wing membrane alpha + wing-ref for scoring
$PY scripts/riftrealm/vs_masks.py                      # -> back_body.png, wing_alpha(_full).png, back_wings.png
# fit the raw shape to the art silhouettes (front -> X, side -> Z), BEFORE paint/rig
$PY scripts/riftrealm/fit_silhouette.py shape_clean.glb <refDir> shape_fit7.glb --iters 10 --mesh-smooth 6 [--side-flip]
#   refDir: VS = D:/rr_work/void_stalker/ref_body ; Paladin = D:/rr_work/robot_paladin (+ --side-flip)
# paint (CORRECT side mapping) -> autoRig -> geo weights -> clips -> render + score
bash scripts/riftrealm/body_chain.sh void_stalker fit7 ; bash scripts/riftrealm/body_chain.sh robot_paladin fit7
# parts + emissive, merged into the ONE skinned primitive / ONE material (rr_parts.py), textures WebP
$PY scripts/riftrealm/vs_parts.py      body_fit7.glb joints_fit7.json vs_final.glb     # wing cloak (Spine2) + daggers (hands)
$PY scripts/riftrealm/paladin_parts.py body_fit7.glb joints_fit7.json pal_final.glb    # tower shield (LeftHand) + tech-lance (RightHand)
```
Side views: paint_from_views' `left` camera (+X) sees a +Z-facing model facing screen-LEFT. The Void Stalker sheet
side faces left (left=side.png); the Paladin sheet side faces RIGHT, so left=side_r.png, right=side.png (pass 1 had
them swapped, painting the paladin's sides back-to-front). Score the paladin against D:/rr_work/robot_paladin/ref_score
(side mirrored). Material is now alphaMode MASK + doubleSided (body alpha 255); the body atlas is shrunk to 1741 (x0.85)
to free strips for the parts. Parts stay under the head top because the game normalises height by the bind-pose bbox.
KTX2 not produced (no toktx/basisu installed); textures are WebP via EXT_texture_webp. Previous GLBs: D:/rr_work/backup_prev/.
Review images: *_body_* = body only (pass 2), *_final_views / both_clips_parts = with parts; un-prefixed *_delta = pass 1.
