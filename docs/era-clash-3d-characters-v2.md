# Era Clash 3D: characters to a current-gen standard (plan v2)

Kenne (2026-11-11): the characters must step up. Armour and clothes should be real objects and geometry on the body, on proper bodies that bend and react with mass and muscle, to the standard of current-generation games.

## Why the current method can't get there

Every cast model today comes from one painting (or a front and back pair) through image-to-3D (Hunyuan3D-2mini), with the paint projected on and an automatic rig. The result is a single fused shell: armour, cloth, skin and hair are one surface.

- **Armour:** nothing is separate, so nothing can hang, swing or keep its rigid shape.
- **Topology:** there is no muscle structure, so joints bend like rubber.
- **Paint:** the sides and back are stretched from a single view.

More polygons and softer weights help (done in `4c219779`), but they can't turn a shell into a body wearing armour.

## The pipeline

1. **A real body.** Start from a professionally structured human base mesh: MakeHuman / MPFB (CC0 for the bodies it outputs).
   - Clean quad topology, proper joint loops and a standard skeleton with good weights; faces and proportions are adjustable per character.
   - Bodies are sized from the reference sheets.
   - It deforms correctly at shoulders, elbows, hips and knees, because the topology is built for it.
2. **Muscle and mass.**
   - **Corrective shapes** (pose-space deformation) at the shoulders, elbows, knees and hips: the biceps bulge as the arm bends, and the shoulder keeps its volume when raised.
   - **Dual-quaternion skinning** in the engine, so twisting wrists and forearms don't collapse.
3. **Armour and clothing as real geometry**, built from the museum's period evidence (`docs/era-clash-3d-era-accuracy.md`).
   - **Haru's tosei-gusoku:** a lacquered cuirass of lamellar plates with real silk lacing rows, tassets, shoulder guards, armoured sleeves, thigh and shin guards, a helmet (kabuto) and its neck guard, the hakama, the obi with the katana and wakizashi.
   - **The raiders:** a mail byrnie, leather and riveted plates, a fur cloak, a round shield on a strap, and a bearded axe, checked against the museum's Viking pieces.
   - **Rigid pieces** (plates, helmets, swords) are bound to single bones, so they never bend.
   - **Hanging pieces** (tassets, shoulder guards, cloak, sleeves, hair and topknot) get **spring-bone secondary motion** in the engine: they swing with mass, settle and collide with the body.
4. **Materials** with full PBR per part: lacquer with clear-coat sheen, silk cord, forged iron, oiled leather, woven fabric, fur, and skin with a subsurface tint.
   - The scans and textures come from the existing Poly Haven pool, plus procedural detail.
   - The painted faces from the sheets are projected onto the real heads, so each character still looks like the art.
5. **Animation:** the existing CMU motion capture and Haru's strike set retarget onto the standard skeleton unchanged. They gain the corrective shapes and the spring bones for free.

## Tools

- **Blender**, scripted from Python: building bodies, modelling armour, corrective shape keys, weight transfer, glTF export. Not installed here.
- **MPFB**, the MakeHuman plug-in for Blender: bodies and skeletons. Not installed.
- Both would go on D:\Plajah Runtime (C: is tight). In the engine: a spring-bone module and a dual-quaternion skinning node, built in-house.

## Order

1. Haru first, as the bar for everyone.
2. The raider, so enemies match.
3. Chen and Roland, then the villagers and townsfolk (lighter: kosode on the same bodies).

## Needs from Kenne

- **Permission to download** Blender (portable, about 350 MB, blender.org) and MPFB with its MakeHuman assets (about 500 MB, static.makehumancommunity.org), both to D:.
- **Optional:** front, side and back turnarounds of Haru, Chen and Roland from Muse. The kit can be built from the museum armour without them, but turnarounds lock in each character's look.
