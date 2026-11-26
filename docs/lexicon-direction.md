# Lexicon: The Unwriting — direction (Kenne, 2026-11-25)

The game's shape as Kenne set it. Visual identity lives in `lexicon-visual-identity.md`; this file is what the game
*plays* like and what is still to build.

## The shape

- **Zelda style and Tomb Raider hybrid, still open world.** Words and reading stay the main mechanic. Exploration,
  climbing and traversal puzzles sit alongside them.
- **Plajah Academia's full stack of math and science comes into the game:** math puzzles and physics puzzles
  (levers, weights, ramps, light and mirrors, water flow, buoyancy, pendulums), not only spelling and sums.
- **The Unwriting's look stays:** where the enemy is, the world drains to the black-and-white ink-on-paper field.
  Kenne: "an amazing concept."

## To build

1. **Walk the player through the first process.** A guided opening, not only the HUD guide
   (`games/lexicon/src/guide.ts`): the game leads step by step through talk → find a word → fight → rescue → give it home.
2. **Combat triggers after the word.** Kenne: "make the combat trigger after word." Meaning still to confirm. A likely
   reading: the first fight starts only after the player has learned what a word is and taken one.
3. **The lasso.** The Scribe carries a lasso that catches letters and words loose in the wild (floating glyphs,
   fleeing words). It's both a traversal tool and a way to gather words outside combat.
4. **Math and physics puzzles** from the Plajah Academia curriculum (`services/` year curriculum), placed in the world.
5. **The waterfall and the cave.** Outside the village, up the creek: a grand, gorgeous waterfall. Behind/under it, a
   cave to explore.
6. **The cast.** The other villagers and the props, built from Kenne's sheets through the Character Forge (below).

## The cast (Kenne's sheets, Word gaem/Nov 24 - 22_56)

| Sheet | Role in the art | In the game now |
|---|---|---|
| Elder Mira | Town matriarch & chronicler | Elder Mira (same) |
| Bram | Veteran village guard | — |
| Thorne | Village elder, council of law | — |
| Kaelen | Herbalist & healer | — |
| Maya | Village alchemist (ink vials) | — |
| Nico | Village messenger | — |
| Zora | Cartographer & astronomer | — |
| Tolo | Blacksmith apprentice | "Tolo the Baker": the art makes him a smith |
| Oren | Archivist & historian | "Oren the Ferryman": the art makes him an archivist |
| Pip | Curious young villager | Pip (same) |
| Selene | Master village weaver | — |
| Lyra | Town bard (lyre) | — |

The art is the reference: Tolo's and Oren's roles in `content.ts` should follow their sheets.

**The pipeline.** The Forge reads a front / side / back turnaround on white (see the Scribe's
`D:/Plajah Runtime/forge/scribe-ref/sheet.png`). The villager design sheets show a 3/4 view and a back view only, so
each one first gets a turnaround sheet, made from Kenne's sheet in the same painted style
(Magnific character sheet, turnaround format, 145 credits each). Then: prep (crop the views), intake, parts, pose fit,
build, paint, score, as for the Scribe (`docs/character-forge.md`).

Props: the Adventurer Equipment sheet (quill-staff, cipher-compass, spellbooks, ink vials).

## The cast through the Forge (2026-11-25)

All twelve have Forge sheets in `D:/Plajah Runtime/forge/<name>-ref/` (`scripts/lexicon/prep_cast_art.py`: front, side
mirrored to face left, back, cut out onto white, soles on one line; `front.png` the head for the face landmarks).

New Forge capability (no character-only constants, per the Forge rule):

- **Body:** `body.sex` (0 male … 1 female): narrower shoulders, wider pelvis, a waist, the bust, a slimmer neck and arms.
- **Hair:** `hair.style: 'braids'`: swept back, a crown braid, front plaits (`frontPlaits`), loose length at the back.
- **Village wardrobe** (`wardrobe.ts`, sized from the body's joints so any height fits): `gown`, `overrobe` (bell
  sleeves, embroidered borders), `capelet` (hood down, brooch), `wideSash`, `beltPouch`, `keys`, `tome`,
  `spectacles`; materials `gown`, `robe`, `capelet`, `trim`, `parchment`. Preset `elder-chronicler` (Mira).

Pieces each of the others still needs (reuse first, then add):

| Villager | Reuses | Still to add |
|---|---|---|
| Thorne | overrobe, gown, wideSash, beltPouch | long hooded cloak, medallion, scales-of-justice staff, long hair + beard |
| Oren | beltPouch, spectacles | long coat, scroll case on the back, cane, beard |
| Selene | gown, wideSash, beltPouch | shawl, apron, braid down the back |
| Lyra | beltPouch | vest, wide sash, cape, lyre on the back, braids |
| Bram | belt (scholar), boots | gambeson, mail, brigandine, kettle helm, round shield on the back, beard |
| Kaelen | trousers, shirt, boots | hooded tunic-robe, apron, herb satchel |
| Maya | trousers, shirt, boots | apron, vest, satchel, ink vials, side braid |
| Tolo | trousers, shirt, boots | smith's apron, goggles, runic hammer |
| Nico | trousers, shirt, boots | vest, letter satchel, leg wraps, short tousled hair |
| Zora | trousers, shirt, boots | vest, cloak, map tube, goggles |
| Pip | trousers, boots | tunic, rope belt; a child's proportions (big head) |
