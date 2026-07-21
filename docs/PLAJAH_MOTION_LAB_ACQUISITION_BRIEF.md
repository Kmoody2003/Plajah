# Plajah Motion Lab — Capture & Volumetric Acquisition Brief
Verified July 2026. This is the data plan behind the Motion Lab section of the Combat Atlas: what exists, what its license really allows, and what Plajah must build to own the category.

## 1. Verified motion datasets (Asian styles & general combat)

**UMONS-TAICHI — the flagship open capture set.** University of Mons (Belgium): 2,200 Taijiquan gesture samples across 13 technique classes, performed by 12 practitioners of expert-ranked skill levels, captured simultaneously on a Qualisys optical system (11 cameras, 68 markers, 179 Hz) and Kinect V2. Published in Data in Brief (2018), distributed via GitHub (numediart/UMONS-TAICHI). **License: CC BY-NC-SA 4.0 — non-commercial.** Meaning for Plajah: perfect for research, prototyping the player, and skill-analysis experiments; public-facing commercial deployment requires either permission from the authors or treating it as reference-only. The skill-ranking dimension (novice→expert scored by three teachers) is a museum exhibit in itself: *what expertise looks like in data*.

**CMU Graphics Lab Motion Capture Database — the commercial workhorse.** ~2,500 motions, 140+ subjects, includes fight-style content (kicks, punches, stances). Free, no license fee, historically permissive and widely used in shipped commercial products. Formats: ASF/AMC, C3D, plus community BVH conversions (cgspeed; GitHub mirrors; Ohio State ACCAD re-exports with better retargeting). This is the safe default for anything that ships.

**Bandai Namco Research motion dataset.** ~3,000 professionally captured moves in BVH, including a fighting category, with a Blender visualization script. **License: CC BY-NC-ND — non-commercial, no derivatives.** Prototyping and internal reference only; not for the production museum.

**SFU / NUS mocap sets.** Well-organized BVH/C3D action libraries; NUS explicitly research-only. Secondary references.

**Video-derived combat motion (the new frontier).** Recent research (e.g., the 2026 "Kung Fu Athlete" robotics dataset) reconstructed 1,700+ motion segments — Changquan, Taijiquan, Southern fist, staff and saber forms, flips — *directly from ordinary training videos* using video-to-motion pipelines (GVHMR-class models). Strategic implication: Plajah can bootstrap kinetic data for any art that has festival footage, long before a capture rig ever reaches the field. Rights note: motion data derived from someone else's video inherits questions from the source footage — use own-shot or licensed video.

**HKMALA (Hong Kong Martial Arts Living Archive).** The world's largest ICH motion archive (130+ sequences, 19 kung fu styles, ~2TB) — but not a public download. Route: institutional partnership with the International Guoshu Association / EPFL eM+ lab. A Plajah×HKMALA exhibition would be a headline event; treat as a business-development target, not a dataset to pull.

## 2. Volumetric: the playback target
The technology has matured exactly in Plajah's direction:
- **4D Gaussian Splatting** is now the state of the art for human performance capture — photoreal free-viewpoint playback with dramatic compression (DualGS, HiFi4G, SIGGRAPH/TOG 2024–26 line of work), with published cross-platform players spanning desktop, mobile, and XR.
- **Rig cost has collapsed:** research pipelines now demonstrate credible volumetric human capture from portable ~10-camera RGB rigs in unprepared environments — meaning a Laamb arène or a kalari pit, not just a lab. High-end reference rigs (81 cameras) define the ceiling; the portable tier defines Plajah's field kit.
- Heritage institutions are already adopting GS for sites; **applying 4DGS to living combat performance is still nearly unclaimed territory.**

## 3. The Plajah Capture Program (three tiers)
**Tier 1 — Video-to-motion (now, ~$0 hardware).** Own-shot or licensed multi-angle video of practitioners → GVHMR-class reconstruction → BVH/FBX into the Motion Lab player. First targets: Taijiquan (validate against UMONS-TAICHI), then Dambe and Laamb from commissioned field video.

**Tier 2 — Marker/suit capture (field kit).** Inertial suit or markerless multi-camera capture on location: clean skeletal data for technique libraries, teacher-vs-student comparisons (the UMONS skill-scoring model), and Labs education content.

**Tier 3 — Volumetric 4DGS (flagship exhibits).** Portable ~10-camera rig sessions with master practitioners: free-viewpoint "walk around the technique" exhibits — the Louvre-piece experiences only Plajah would have. Every session recorded under signed releases with revenue-share terms for practitioners and communities; masters credited as co-authors of their accessions.

## 4. Why this is the moat
Search the entire internet: there is no motion dataset — skeletal or volumetric — of Dambe, Laamb, Engolo, Nguni stick fighting, Musangwe, Moraingy, Evala, or Nuba wrestling. None. The written record exists (Desch-Obi), the video record exists (scattered), but the *kinetic* record has never been made. The first institution to capture it doesn't join the field — it founds it. Combined with the rights-tiered archive, the Chora music layer, the Labs education layer, and the TV broadcast stack, that's the museum only plajah.com can deliver.

## 5. Immediate actions
1. Clone UMONS-TAICHI (research use) and load one sequence into the Motion Lab player to replace a keyframe clip — proof of real-data playback.
2. Pull the CMU BVH conversion set (commercial-safe) as the production-legal motion shelf.
3. Draft the practitioner release + revenue-share template (pairs with the IP counsel review already queued).
4. Open the HKMALA partnership conversation (EPFL eM+ / International Guoshu Association).
5. Spec the Tier-3 field rig (10× genlocked cameras + portable compute) against the published portable-pipeline papers.
