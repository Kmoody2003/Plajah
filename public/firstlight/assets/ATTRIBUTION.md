# Firstlight asset provenance

## Surface maps — CC0

- Grass004, ambientCG / Lennart Demes: https://ambientcg.com/view?id=Grass004
- Fabric030, ambientCG / Lennart Demes: https://ambientcg.com/view?id=Fabric030
- License: https://docs.ambientcg.com/license/
- Imported 1K JPEG color, OpenGL normal, roughness and ambient-occlusion maps. Grass color/normal/roughness and fabric normal/roughness are used in game. Other downloaded maps are retained for authoring.

## HDR lighting — CC0

- Kloppenheim 01, Greg Zaal / Poly Haven: https://polyhaven.com/a/kloppenheim_01
- License: https://polyhaven.com/license
- 1K HDR, used for filtered image-based lighting and reflections. The stadium's existing sky remains the visible backdrop.

## Motion capture — CMU terms, not CC0

- CMU Graphics Lab: https://mocap.cs.cmu.edu/
- Terms: https://mocap.cs.cmu.edu/faqs.php
- Download mirror: https://huggingface.co/datasets/gbionics/cmu-fbx
- BVH conversion: cgspeed; FBX conversion: RancidMilk. See `mocap/SOURCE-LICENSE.md`.
- 02_03: run/jog; 33_01 and 34_01: football throw/catch.
- Runtime samples are derived from 02_03 and 33_01 by `scripts/bakeFirstlightMocap.mjs`. 34_01 is retained as source material, not currently played.
- Data can be included in commercial products but must not be resold as motion-capture data, including converted data. This condition follows redistributed copies.
- The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.

The current athlete is a procedural articulated model, not a scanned human. Retargeted motion is a simplified limb-direction transfer, not full skeletal retargeting with foot planting and hand-to-ball constraints.
