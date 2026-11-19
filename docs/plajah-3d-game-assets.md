# Plajah 3D: game assets from the art and the motion videos

Kenne, 2026-11-19: Rift Realm has to look current-gen (Xbox Series S/X) and match the art. Use the Plajah-built tools.
When they can't do something, build that capability into them first, then build the asset with them. The art AND the
motion videos drive every model, rig and movement.

## What went wrong before
The Cyber Forest creatures were made with one-off scripts around the tela-3d engine (scripts/riftrealm/cut_pale.py,
cf_creature_export.py, hand trims). The moth and bat wings were first hand-built in code and looked nothing like the art.
Movement was invented in a shader instead of studied from the motion videos. Props (data pods, crystal pylons, power
nodes, building blocks) are still primitives from code.

## Gaps found, each becomes a Plajah 3D capability

| # | Capability | Where it lives | Replaces |
|---|---|---|---|
| A | Engine: paint a mesh from several sheet views (`/tela3d/paint-views`) and release the model + memory after a job (`/tela3d/release`) | engines/tela-3d | running paint_from_views.py by hand; force-killing a runtime holding ~12 GB |
| B | Build from a sheet: panels found (suggestBoxes), each view cut with pale/thin parts kept, the best view generated, strays and spurs trimmed, painted from every view, back filled from the mirrored front for thin symmetric parts | services/argilla/understand + studio | cut_pale.py, hand trims, composite backs |
| C | Motion study from a video: frames decoded, subject cut per frame, cycle timing and amplitude measured per body region (wingbeat Hz, gait period, leg phase, strike timing), key poses picked (e.g. wings fully spread) as build inputs | services/argilla/creature/motionStudy | guessing gait numbers; picking frames by eye |
| D | Rig from the art + study: bones placed from the model's regions (wings: shoulder/wrist, legs, head, tail), skinned, clips authored from the motion study, exported as a skinned GLB | services/argilla/creature (forgeToGlb) | the TSL vertex "rig" in games/rift-realm/src/creatures.ts |
| E | Game export: glow map from the art's bio-light hues, compressed textures, size budget per tier | services/argilla export | cf_creature_export.py |

## Order
A → B → rebuild the Cyber Forest props from their sheets → C → D → re-rig every creature from its motion video → E for
all of it. Every result is checked against the art from front, side and back (and against the video for motion) before
it goes into the game; look is judged on the high tier.
