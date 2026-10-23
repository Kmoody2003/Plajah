# Ravencrest: Bridge Troll + River Kraken (brief for Muse)

## The scene these are for

Jack is crossing the plank bridge over the moat to Ravencrest's gate. A **Bridge Troll** vaults up from underneath the bridge and fights him on the deck. Shortly after, **eight kraken tentacles** (four each side) burst out of the river. They are 40–50 ft tall and move like an octopus's arms: they coil, slap the water and wrap and smash the bridge until parts of it break away. Meanwhile, **Wicked Witch Miriam** (on her hover broom) and her **flying monkey army** fight the tentacles in the air behind the duel. The monkeys strafe with rifles and Miriam blasts green electricity.

Your job is the **two creatures that don't exist yet: the troll and the tentacle**. Everything else (bridge damage, water, Miriam, effects) is handled in the engine.

## Look: match what we already have

Use these files as the style bible:

- `public/models/halloween/sheets/monsters_sheet.png`: production asset-sheet format, with front and side views, a height ruler and a grey backdrop. Grounded, photoreal creature design, not cartoon.
- `public/models/halloween/sheets/miriam_sheet.png`: material and PBR breakdown style. Gothic, desaturated, and wet-leather and metal heavy.
- `public/models/halloween/ravencrest/castle_exterior_moon.jpg` and the master Ravencrest art: the lighting world is a moonlit storm, cold blue-grey, with sodium and torch-orange accents.
- The Pumpkin Patch film and comic: `public/generated/comics/pumpkin_patch_v4/` (e.g. `panel_042.jpg`, `char_3_portrait.jpg`). It is cinematic, gritty and high-contrast, with dark horror treated as live-action.

Both creatures must read clearly **in silhouette at night**: strong shapes and a few cold rim-catching highlights (wet skin, suckers, tusks). No bright saturated colours, because the purple orb beams, the green witch-lightning and the orange tank fire need that colour space.

## Asset A: Bridge Troll (`bridge_troll.glb`)

**Concept.** It has lived under the Ravencrest bridge for centuries and collects the toll in bones. It is a river-damp, hulking brute:

- **Build:** knuckle-dragging long arms, a short bowed legs-to-torso ratio, a hunched back with a ridge of stone-like growths along the spine. Height is **3.2 m** standing hunched (about 3.8 m if it straightened).
- **Skin:** mottled grey-green, like wet slate. Patches are crusted with lichen and moss and there are freshwater barnacles at the elbows and shoulders. A slick, wet sheen.
- **Head:** small and low-slung, with a heavy brow, two broken lower **tusks** (one snapped), small deep-set amber eyes (the only warm point on it) and a long drooping nose. Ragged ears are notched like a fighting dog's.
- **Dress:** a waist-wrap of rotten sailcloth and fishing net, hung with rusted toll-coins, padlocks and small bones. A heavy iron **shackle and broken chain** on one wrist (the left), dragging about 1 m. Bare feet with thick split toenails.
- **Hands:** huge, with three thick fingers and a thumb, and cracked black nails.

**Deliverables:**

1. A concept/asset sheet (front, side, back, a ¾ hero view and a head close-up with a height ruler), plus a material breakdown like Miriam's sheet.
2. The GLB, built to the same drop-in contract as your monster deliveries:
   - Y-up, metres, facing +Z, feet at origin.
   - One PBR material: 2048² base + normal + packed ORM.
   - About 30k tris.
   - **Contract humanoid bone names** (as in `SKELETONS.md`), **plus a `Jaw` bone**. The chain is a separate skinned part from `LeftHand`, so it can swing.
3. **Baked clips:**
   - `idle`, `walk`, `run`, `hit`, `death`, `chase`
   - `attack_1`: two-handed overhead hammer-fist slam
   - `attack_2`: backhand swipe
   - `attack_3`: lunging grab-and-throw
   - **`climb_flip`**: hangs from the bridge edge, then vaults up and over onto the deck, landing in a crouch. About 1.6 s, root motion **+1.8 m up and +1.5 m forward**, starting below the deck.
   - **`roar`**: chest-forward roar with jaw open, about 1.5 s.
   - **`stagger`**: a long knocked-back stumble used for the "about to fall" moment, about 1.2 s.
4. **No props in hands.** The chain and coins are part of the mesh.

## Asset B: River Kraken tentacle (`kraken_tentacle.glb`, two variants)

**Concept.** It is one arm of something enormous asleep in the moat. Only arms ever surface, so each one must sell the scale on its own.

- **Size:** **14 m long** above the water (it reads as 40–50 ft). The base is 1.6 m in diameter where it leaves the water, tapering smoothly to a whip-thin 0.1 m tip.
- **Topside:** near-black slate with deep bruise-purple mottling and wet, rubbery specular. Old scars and gouges. Clusters of barnacles and trailing river weed near the base.
- **Underside:** paler, cold grey-violet, with **two rows of suckers** that grow from the size of coins near the tip to the size of dinner plates at the base. Each sucker has a hard, toothed rim ring.
- **Accent:** faint **cold teal bioluminescent freckles** along the side seam, so the arm is readable in the dark.
  - Put this in a separate **emissive mask** (greyscale) so the engine can pulse it.
- **Variants:**
  - **A:** classic tapering arm.
  - **B:** slightly thicker, with a hooked, club-like tip that is spiked like a squid's. We place eight of them around the bridge.

**Deliverables:**

1. A concept/asset sheet (side, top and underside views; a sucker close-up; and a scale figure of a 1.8 m human next to it), plus a material breakdown.
2. The GLB:
   - Y-up, metres. The origin is at the **waterline centre of the base**, and the arm extends straight up **+Y** in rest pose.
   - One PBR material (2048² base + normal + ORM) **plus an emissive mask**.
   - About 15–20k tris each. The silhouette must stay smooth when it bends hard, so put more edge loops toward the tip.
3. **Skeleton:** a single chain, `Tentacle_Root` → `Tentacle_01` … `Tentacle_24`, evenly spaced along the arm, with clean skin weights so that it curls tightly (tip coils over 360°) without collapsing.
4. **Optional baked clips** (the engine drives the arm procedurally anyway, so clean weights matter more):
   - `emerge`: bursts up from below the origin to full height, about 1.2 s
   - `idle_sway`
   - `slam`: rears back, then whips down onto the deck
   - `wrap`: coils around a 1 m-thick post
   - `recoil`: struck and pulls back
   - `retract`: sinks back underwater

## Acceptance

- Same validator pass as your last delivery: bone names, clip set, tri budget, texture set, origin and height.
- Turntable renders under **moonlit, wet, night lighting** (not studio grey only), so we can judge the silhouette the way players will see it.
- Files go in `public/games/ravencrest/assets/characters/` (the troll) and `public/games/ravencrest/assets/creatures/` (the tentacles). Sheets go in `public/models/halloween/sheets/`.
