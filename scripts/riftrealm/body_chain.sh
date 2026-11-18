#!/bin/bash
# body chain after fit_silhouette: paint -> autoRig -> geo weights -> clips -> render + score
set -e
PY="/d/Plajah Runtime/tela3d-py/Scripts/python.exe"; R=/c/Users/Kenne/plajah
c=$1; tag=$2; W=/d/rr_work/$c
if [ "$c" = void_stalker ]; then VL="--view left=$W/side.png --view right=$W/side_r.png"; BK=$W/back_body.png; REF=$W/ref_body
else VL="--view left=$W/side_r.png --view right=$W/side.png"; BK=$W/back.png; REF=$W/ref_score; fi
cd $R/engines/tela-3d
"$PY" paint_from_views.py --mesh $W/shape_$tag.glb --out $W/painted_$tag.glb --faces 58000 --res 2048 --view front=$W/front.png --view back=$BK $VL | tail -3
cd $R
"$PY" scripts/ravencrest/autoRig.py --rig public/games/ravencrest/assets/characters/muse/vampire.glb --mesh $W/painted_$tag.glb --out $W/rigged_$tag.glb --debug $W/joints_$tag.json | tail -1
"$PY" scripts/riftrealm/geo_weights.py $W/rigged_$tag.glb $W/joints_$tag.json $W/geo_$tag.glb | tail -1
"$PY" scripts/riftrealm/author_clips.py $W/geo_$tag.glb $W/body_$tag.glb | tail -1
node scripts/riftrealm/render_views.mjs $W/body_$tag.glb $W/r_$tag > /dev/null
"$PY" scripts/riftrealm/score_views.py $W/r_$tag $REF $W/score_$tag
