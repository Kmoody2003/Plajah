---
trigger: always_on
description: Hard Editorial Rule — Comic & Graphic Novel dialogue balloons, thought clouds, and captions must NEVER cover a character's face or obstruct key action in a panel.
---

# Comic & Graphic Novel Lettering Safe-Zone Rules

Across the Comic Book / Graphic Novel Council (`services/council/comicMangaCouncil.ts`), Story Intelligence Bridge (`services/storyIntelBridge.ts`), Comic Script Parser (`services/comicScript.ts`), and Interactive Comic Panel Builder (`components/ComicPanelBuilder.tsx`), the following **5 Non-Negotiable Lettering Rules** must always be enforced:

1. **RULE 1 — NO FACE OCCLUSION:**
   A speech balloon, thought cloud, or caption box must **NEVER** overlap a character's eyes, nose, mouth, or primary facial expression bounding box (`x: 26%–74%, y: 12%–56%` in close-ups/mediums, or pixel-detected skin/edge clusters via `analyzeImageElementForFaceAndActionSafeZones`).

2. **RULE 2 — NO KEY-ACTION CORRIDOR OCCLUSION:**
   Balloons must **NEVER** sit in the dead-center focal action corridor (`x: 22%–78%, y: 18%–78%`) where physical gestures, props, impacts, or body language occur.

3. **RULE 3 — NEGATIVE-SPACE & GUTTER DOCKING:**
   All balloons must dock into perimeter negative space (`top-left`, `top-right`, `bottom-left`, `bottom-right`) or flush against the panel's top/bottom border rail (`top-gutter-flush`, `bottom-gutter-flush`) via `computeSafeBalloonPlacement(...)`.

4. **RULE 4 — CLOSE-UP CHIN / GUTTER RAIL DOCKING:**
   On Close-Up (`CU`) and Extreme Close-Up (`ECU`) panels where a face fills the upper/middle frame, balloons must dock strictly at the extreme bottom gutter rail (`y >= 72%`) or extreme top border strip (`y <= 4%`) with compact width (`<= 44%`).

5. **RULE 5 — DIRECTIONAL TAIL VECTORING:**
   Because the balloon body sits in safe negative space away from the face, the pointer tail (`tailDir` / `tailTargetX` / `tailTargetY`) bridges the distance by pointing toward the speaker's mouth without the balloon body intruding on the face.
