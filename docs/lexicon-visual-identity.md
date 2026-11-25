# Lexicon: The Unwriting — Visual Identity

Source art: `D:\plajah game assets deign from promtps\Word gaem\Nov 24 - 22_56\` (65 pieces, Kenne, 2026-11-24).
The art is the authority: every in-game shot is scored against it (game-dev canon, art fidelity loop).

## 1. The idea: the world is a living manuscript

Lexicon mixes **drawn** and **photoreal** on purpose, and the mix *is* the game state.

- **Written** (language alive): painted-real. Real light, real materials, real atmosphere (PBR stone, wet
  moss, god rays, dust, lantern glow), seen through an illustrator's hand: a warm ink contour, paper tooth,
  slightly brushed colour. Think a concept painting you can walk through (art: village in the hollow forest,
  sunset square, Temple of Numerals interior).
- **Fading** (the Unwriting is near): colour drains, the ink line takes over, form turns into hatching and
  pencil construction lines, like an unfinished drawing (art: language loss corrupting the town).
- **Unwritten** (erased): blank paper white. Stone crumbles into white void, loose pages and letters drift,
  only faint pencil ghosts of what was there (art: stone walkway over the white void; the Redactor's strike
  turning the library floor to white paper and ink splash).

Rescuing a word runs it backwards: colour and light repaint outward from where the word came home.
Erasure is never "darkness". Darkness is night. **Erasure is white.** The enemy's material is black ink.

## 2. Palette

Measured from the art (median-cut, `palette.py` in the session scratchpad; Scribe swatches read from his sheet).

| Role | Colours | Where it comes from |
|---|---|---|
| The Scribe | navy cloak `#343c51` · leather `#674836` · saddle `#8c5e44` · brass `#e6c983` · lumen cyan `#b1f9f6` · parchment `#ebdbc1` | Scribe turnaround swatches |
| Living world, forest | moss shadow `#242518` `#393d2b` · olive light `#807b58` `#ada87b` · bark `#4e4730` | village in the hollow forest |
| Living world, evening | ember `#bc8965` · clay `#845f4f` · roof shadow `#382a25` | village square at sunset |
| Stone and temple | `#191813` → `#615a4d` → `#8e8372` | Temple of Numerals interior |
| High places, sky | `#a3bfce` `#cadfeb` · slate `#5b6a6e` | Temple of Numerals perched on the cliffs |
| Erasure | paper `#fafafa` `#e9edef` · fog grey `#ced6d9` `#b1b9bb` | white-void walkway, Redactor strike |
| The Unwriting's ink | `#1d1d1b` `#33322e` | Redactor, Hushlings |
| UI parchment | `#e8d9bd` `#dac9ac` `#ceba98` on `#292118` leather | Archive menu |

**Light means meaning:**
- **Gold** (`#e6c983` → `#ffd98a`): a word that is alive. Glyphs, rescued letters, the floor geometry in the Temple.
- **Cyan** (`#b1f9f6`): song and knowledge. The quill-staff tip, the Lyre, sigils answering.
- **Black ink + white paper**: the Unwriting. Never coloured.
- **Violet** (`#7c3aed`-ish glow on `#38273c`): reserved for *corruption alerts* in UI (the Rescue Panel's void meter). Not used in the world.

## 3. Light and atmosphere

- Warm lanterns (amber) against cool blue-green shade; shafts of light through canopy and rose windows; dust and drifting letters in the beams.
- Night is cool moonlight, readable, never black. Lanterns matter more.
- Interiors: one strong key (rose window, gate portal) plus floor glyph light from below.
- Fog: warm-white in the living world; paper-white where the Unwriting is.

## 4. Characters

Painted-real proportions (the hero about 7 heads; villagers storybook-real), hand-painted albedo over PBR,
an ink contour on silhouettes, gold or cyan accents where a character touches language.

**The Scribe** (hero; turnaround, side profile, back view, portrait): young Black man, short locs with an
undercut, navy scholar's cloak with rune embroidery, layered brown leather armour with scroll tubes, a
leather backpack, a glowing **quill-staff** (feather-blade tip, cyan core) and a brass **cipher-compass**.
Alternate heroes in the set (glasses scholar; goggles adventurer) are kept as variants, not the default.

**Villagers** (Glossa Hollow): Elder Mira (town matriarch and chronicler, glowing chronicle tome) · Oren
(archivist and historian, scrolls, brass spectacles) · Tolo (blacksmith apprentice, runic hammer with
mathematical engravings, forging goggles) · Pip (curious child, glowing alphabet block) · Nico (village
messenger) · Zora (cartographer and astronomer, brass armillary sphere) · Bram (veteran guard, glyph shield)
· Lyra (town bard, engraved lyre with glowing runes: she teaches the Lyre) · Thorne (council elder, staff of
law) · Selene (master weaver, golden story thread) · Kaelen (herbalist and healer, glowing ink flora) · Maya
(alchemist, glowing ink vials).

## 5. The Unwritten (enemy families)

| Family | Look | Pieces in the set |
|---|---|---|
| **Hushlings** (the silent void) | faceless fog-heads, tattered shadow cloaks, levitate soundlessly, absorb light and sound; redaction bars | concept sheet; void-weaver (many-armed thread weaver); book-shield knight; low quadruped beast; hooded ink spellcaster |
| **Numerals** (clockwork arithmetic) | brass and obsidian mechanisms, glowing red or teal numerals and operator sigils | fractional orb; arithmetic arachnid; prime serpent; stone titan with + − × ÷ |
| **Glyphmaws** (devourers) | ink-black hide, bioluminescent rune spines, jaws that eat letters | apex stalker panther; punctuation hydra (! ? ; heads); winged ink-maw; scroll-crushing ape; letter devourer |
| **The Redactor** (boss) | faceless hooded judge in dark armour, black redaction bars orbiting, ink dripping; strikes turn the world to white paper | boss sheet (ethereal judge, gavel); obsidian chisel; mechanical variant; shadow monarch |

## 6. Places

- **Glossa Hollow**: a village sunk in a hollow forest. Root-wrapped stone cottages, a creek with water wheels and rope bridges, hanging lanterns (amber and violet-blue), mossy giants of trees. Evening square with bunting and market stalls. Under attack: black ink blots tearing the sky, buildings dissolving into pixels and pages.
- **The Cipher Gate**: a rune-ringed stone portal that spins open into a blue-gold vortex; corrupted, it is chained, cracked and ink-stained.
- **Temple of Numerals**: outside, a stepped temple on a cliff with aqueducts, waterfalls and floating obelisks. Inside, a cathedral nave with giant bronze gears in the arches, floating stone numeral tiles, rose windows and gold geometric figures glowing on the floor.
- **Puzzle spaces**: numbered stone blocks forming an equation over water; an archway bridge that assembles when the fraction is right.
- **Deep places**: the ink-waterfall fortress; the Redactor's arena (a ring of pillars under a vortex of pages); white-void walkways.

## 7. UI

Parchment and tooled leather with brass filigree (the Archive); engraved gold letter tiles; the Lyre as a rune
wheel with a melody input bar. **Signature:** every letter tile carries its value as a small subscript
(E₅, U₂₁, S₁₉): word and number on the same tile, which is the game in one glyph.
Type: a carved roman display face for titles (Cinzel, OFL) and a book serif for text (EB Garamond, OFL).

**Rescue puzzle (from the Rescue Panel art):** a corrupted word with empty slots (R _ S C _ E), each slot
bound to an arithmetic cipher (`slot + 4 = E₅`, `slot × 3 = U₂₁`). Players drag letter tiles from a tray;
the tile's value has to satisfy the cipher. This merges the letter and arithmetic challenges and replaces the
four-button prompt as the main rescue UI.

## 8. Rendering recipe

WebGPU (WebGL2 fallback) through the playkit post pipeline, with one new stage:

scene (PBR, painted albedo, gold/cyan glyph emissive) → GTAO → godrays → bloom (glyphs only, high
threshold) → grade → **manuscript stage** (`playkit/render/manuscriptLook.ts`):
1. ink contour from depth and normal edges, warm sepia `#2a2118`, thicker near, thinner far;
2. paper tooth and slight pigment pooling (edge darkening) over everything, so the painting reads as painted;
3. the **Unwriting field**: per pixel world position → erasure amount from erasure zones (enemies, the
   Redactor's strikes, the island's eroded edges, the overall preserved %), mapped Written → Fading
   (desaturate, hatching by luminance, ink lines strengthen) → Unwritten (paper white with pencil ghosts);
→ FXAA/TRAA → FSR at 720p internal on iGPUs → LUT.

Budget (canon): 60 fps on Intel Arc iGPU, every post pass at internal resolution, no per-pixel fbm (noise is
screen-space hash or baked texture).

## 9. Reference shots (fidelity targets)

Ten target shots to score renders against, in build order: village in the hollow forest · village square at
sunset · Scribe turnaround (model) · Hushlings sheet (model) · Cipher Gate opening · Temple of Numerals
perched · Temple of Numerals interior · math platforms over water · white-void walkway · Redactor arena.

## 10. Status (2026-11-25): realism foundation

Built on the shared Plajah pieces, no new engine code:
- **Sky** (`games/lexicon/src/sky.ts`): three's SkyMesh (physical sky with its own clouds), image-based light baked
  from that sky into one reused PMREM target, aerial haze that warms toward the sun, sun → moon after dusk.
- **Forest** (`services/vegetation`, new `catalog/glossaHollow.ts`): grown root giants, oaks and ash with LOD and
  impostors, meadow and moss grass that the Scribe tramples, ferns and undergrowth. `world.ts` only places tree spots.
- **Ground and houses**: CC0 Poly Haven / ambientCG surfaces in the repo (cobblestone_floor_04, forest_ground_04,
  Grass004, clay_plaster, medieval_blocks_02, roof_slates_02, dark_wooden_planks), ground sampled in world space at two
  scales with the vertex colours as the painter's wash.
- **Manuscript stage** (`playkit/render/manuscriptLook.ts`): sky never erased; paper lit like the world it replaced;
  erasure zones can keep a written centre so the Unwritten stay black ink.
- **Graphics profiles by GPU adapter** (Rift Realm's gfx pattern): `intel` = 0.6 internal + FSR, lean bloom, FXAA, no
  GTAO, 100 trees, 1024 shadows; `high` = GTAO, full bloom, TRAA, full forest, 2048 shadows. `?gfx=` forces one.
  Static meshes batched with Rift's `mergeRigid`; everything that changes is marked `userData.dynamic`.

Measured on the Intel Xe-LPG iGPU (`node scripts/lexicon/probe.mjs`, 6 s warm-up, 5 s sample): 5 fps → **43 fps**,
worst frame 1.9 s → 87 ms. Without vegetation 58 fps. Fixes that mattered: the Intel profile; re-baking the sky light
into the same render target (a new environment texture rebuilt every vegetation pipeline: 1–2 s stalls); moss blade
density. Review shots: `node scripts/lexicon/shots.mjs` (headed Playwright; the hidden Browser pane can't present
WebGPU frames, and canvas/render-target readback was stale or black).

Known gaps: far-tree impostors are baked in daylight and glow at night (vegetation service: re-bake or relight
impostors on the day/night switch); the horizon reads very bright by day; the temple has not had this pass; villagers,
the Scribe and the Unwritten are still primitives (Character Forge next); the leaf atlas is a tinted cyber-forest
atlas, not one cut from this art; tree species are hand-set, not fitted to the art (fromArt/fitSpecies).
