# Children's picture-book templates: art direction (v2)

**Why v2:** the first pass (story-space / forest / ocean / bedtime / city / folktale) was judged too muted, too tidy, too similar to each other and "adult-looking". It was built from a written brief and shared helpers, with **no art direction and no study of real picture books**. This document replaces it.

## How this was produced (honest provenance)
- **Research** (web, 2026-10-09): picture books are designed as **spreads**, not pages; 32-page structure (half-title, front matter, ~12-14 story spreads, back matter; first/last pages single); **page turns are designed**; layout **variety** across spreads (full-bleed, vignette, spot, multi-panel, colour-block pause); text is short (15-30 words a page), **large, loosely leaded and often hand-lettered / shaped to the art, sitting inside the illustration**; infants' attention is held by **vivid, high-contrast colour and simple big shapes** (Univ. of Sussex eye-tracking study of 100 books); ornament and playful details add excitement.
- **The real Council of Art Directors** (`scripts/council/runChildrensBookCouncil.ts`, output `docs/tela/council/childrens-book.json`) was convened on this brief. **Round 1 (PROPOSE) completed for 5 of 6 directors** (Classical, Rebel, Futurist, Baroque, Radical Minimalist; the World-Eclectic director's proposal did not return). **Rounds 2-4 (DISPUTE, SYNTHESISE, REFLECT) failed: the free Gemini daily quota (20 requests/day) ran out and the Claude key is rejected locally.** The synthesis below is therefore **written by the build session from the five real proposals, not by the council**. Re-run the script when quota resets or a working Claude key is set (`COUNCIL_LANE=claude`) for the council's own synthesis.

## What the directors said (kept as tension, not averaged)
| Director | Proposal in one line | What we take | What we leave |
|---|---|---|---|
| **Rebel** | Torn paper, stencil, woodblock, wax-resist; brutally saturated; characters spill over safe zones; text locked in rough-cut banners | Tactile edges, saturation, text inside shapes, off-register print feel | Chaos for its own sake; any look that fails at thumbnail size |
| **Radical Minimal** | One shape language + one contrast per book (circles / columns / bands / arcs / blocks / triangles); body ≥ 24pt | **One shape language per book**; huge scale contrast; reading distance clarity | "No faces": children need characters, so characters get minimal faces |
| **Baroque** | Layered stage, one dramatic light source per book, spread rhythm: overture / whisper / crescendo / intrigue / reveal / epilogue | **The spread rhythm** and one light source per book | Heavy gothic type; clutter that drowns the short text |
| **Classical** | Root-two grid, golden verticals, text on structural shelves, hand-pressed imperfection | A real **grid + gutter protection**; visible hand-made imperfection | Rigid placement that makes pages feel formal |
| **Futurist** | Parametric systems per book (polar, L-system, sine bands, isometric, voxels, mirror axes) | **Mathematical generators for the art** (they make procedural art varied and alive) | Cold sheen; tilt/parallax motion (static templates for now) |

## Rules every template follows (the shared family)
1. **Spread = one picture.** 1024x768 landscape; compose each page pair as one field; characters and faces stay **out of a 48px centre strip**; skies/grounds may cross.
2. **At least FIVE different layout types** per book, never the same type twice in a row: (a) full-bleed hero, (b) vignette/spot floating on a colour field, (c) multi-panel strip, (d) colour-block pause / quiet turn, (e) scale-play (tiny character on a huge page, or a giant close-up), (f) text-as-shape (words on a path, wave, cloud, trail).
3. **Spread rhythm** (Baroque): overture (loud, full colour) -> whisper (quiet spot) -> crescendo (double-page wide) -> intrigue (panels) -> reveal (burst / scale shock) -> epilogue (soft). Every spread sets up the next page turn.
4. **Text lives inside the art**, never in a tidy box floating on top: on a banner, cloud, wave, trail, sign. **>= 22px at 1024 wide, line height ~1.5, 15 to 30 words a page.** Titles are **hand-lettered style**: per-letter bounce/rotation/colour, thick outline or drop-shadow, sized huge.
5. **Colour is saturated and high-contrast** (>= 3 clearly different hues at high saturation + one deep dark + one bright light). Pastels only where a book *chooses* calm (bedtime), and even then with one hot accent.
6. **Characters have faces** (two dots and a mouth is enough), built from the book's shape language; each book has one hero character and one companion, drawn the same way on every page.
7. **One shape language per book** (Minimal) and **one light source per book** (Baroque), and a **procedural generator** behind the art (Futurist) so pages vary without repeating.
8. **Texture by procedure**: torn/jagged edges (midpoint displacement), crayon hatching, halftone dots, wax-resist speckle, sticker outlines, paper-grain speckle. Visible hand-made imperfection (Classical/Rebel).
9. **Each cover reads as a poster at thumbnail size**: one big character or shape, huge lettered title, a bright ground. **The six covers must be tellable apart at a glance**.
10. Image slots remain (labelled) for generated art later, but **every page must already look finished and joyful with no image dropped in**.
11. Originality: art-direction FAMILIES only (cut-paper collage, woodblock/stencil, wax-resist crayon, gouache night, mid-century geometric, folk papercut). No living illustrator imitated, no copyrighted characters.

## The six books (distinct on purpose)
| Template | Family / shape language | Lead lens (counterpoint) | Palette (hex) | Display / body type | Hero + light |
|---|---|---|---|---|---|
| **story-space** "Orbit Party" | Torn **cut-paper** collage; **circles only**; planets bleed off the edge | Rebel (Radical Minimal) | ink `#0D0015`, hot pink `#FF0055`, mint `#00FFCC`, sun `#FFF200`, violet `#7000FF`, white `#FFFFFF` | Rubik Mono One or Chango / Fredoka | A round little astronaut-blob + a comet pup; light = a huge sun |
| **story-forest** "Little Fox, Big Trees" | **Woodblock / stencil**, off-register print; **vertical columns + triangles** (trunks, firs, light beams) | Classical (Rebel) | pine `#0B3C1A`, vermilion `#FF4500`, gold `#FFD700`, bark `#8B4513`, lime `#ADFF2F`, cream `#FFF3D6` | Slackey / Andika | A fox + a fawn built from triangles; light = low gold sun through trunks |
| **story-ocean** "Below the Blue" | **Wax-resist crayon**; **horizontal bands + waves**, thick scribbled outlines | Futurist sine-band generator (Rebel) | navy `#002244`, aqua `#00A8E8`, teal `#00C9A7`, coral `#FF3366`, orange `#FF9F1C`, foam `#F4F4F9` | Fredoka / Quicksand or Andika | A round coral fish + a tiny lantern-fish; light = bioluminescent glow |
| **story-bedtime** "Moon Blanket" | **Oil-pastel / gouache night**; **concentric arcs** (blankets, moon phases); a warm candle on a deep ground, with one hot accent | Baroque (Minimal) | midnight `#120A2C`, indigo `#3F2B96`, periwinkle `#A8C0FF`, candle `#FBC707`, ember `#FF8008`, cloud `#E3D2FF` | DynaPuff / Nunito | A sleepy bear + a moth; light = the bedside candle |
| **story-city** "Beep Block Street" | **Mid-century geometric / screen print**; **90-degree blocks**, windows, signs; voxel-grid rhythm | Rebel stencil (Futurist grid) | black `#1A1A1D`, red `#E5173F`, yellow `#FFC300`, blue `#1E88E5`, mint `#00D68F`, paper `#FFF6E5` | Bungee (+ Bungee Outline) / Rubik | A square bus + a pigeon; light = streetlamp cones |
| **story-folktale** "The Golden Thread" | **Folk papercut / block print**; **45-degree triangles and mirror symmetry**, ornament borders | Classical (Baroque) | wine `#4A1525`, crimson `#C0392B`, saffron `#E67E22`, gold `#F1C40F`, deep teal `#14505C`, ivory `#F1E6CF` | Almendra Display / Andika | A weaver girl + a golden-thread spirit; light = the gold thread |

Add a 7th/8th later if useful: a **board book / first words** (huge single objects, tap-and-name) and an **ABC book** (one giant letter per spread). They are different formats from picture books.

## Acceptance checks (each template must pass; reviewers LOOK at the PNGs)
- Thumbnail test: the cover at 200px wide still shows a character, a huge title and a bright ground.
- Cross-template test: the six covers on one sheet are unmistakably different (shape language, palette, lettering).
- >= 5 layout types, none repeated back-to-back; a quiet turn and a scale-shock spread exist.
- No page where text sits in a plain box on a plain background; all body text >= 22px; every page has art that is finished without an image.
- `npm run test:tela` and `npx tsx scripts/telaGallery.ts` lint clean; every page type each template lists builds with >= 10 objects.

---

# v3 (2026-10-09): a different MEDIUM per book, and different FORMATS per age group

**Owner feedback on v2:** the six redesigned books are lively but still share one visual vocabulary (flat vector shapes, thick outlines, halftone) and one layout format (landscape picture book). **Each template needs a drastically different children's art style (painting, anime, cut-out, vibrant graphic...) and the layouts must be far more diverse across age groups.**

## What the engine can fake (so we promise only what is real)
Tela vector objects support: paths/rects/ellipses, linear + radial **gradients**, **gaussian blur**, **drop shadow**, **blend modes** (multiply, screen, overlay...), opacity, dashed strokes, rotation, rounded corners, text with per-object font. There is NO raster brush engine. So: *watercolor* = many overlapping translucent blobs with blur + multiply, darker wet-edge strokes at low opacity, paper-grain speckle, blooms and salt dots; *anime* = clean variable-weight line, cel-shaded two-tone fills, big glossy eyes with highlights, gradient skies, sparkle stars, petals, speed lines; *felt* = stitched dashed outlines, fuzzy edge (tiny spikes), button eyes, soft shadows, fabric speckle; *pixel* = a true pixel grid of squares (batched paths); *ink & wash* = loose wobbly outline paths + soft washes offset from the line; *scratchboard* = black field with fine white hatching and one spot colour. **Real painted or photographic quality only arrives when generated art is dropped into the labelled image slots**: every template keeps slots, but must look finished and in-medium without them.

## Age-group formats (roughly: board 0-3, concept 2-4, picture 3-7, early reader 5-8, chapter 7-10, activity all ages)
| Format | Trim / orientation (96 px per inch) | Pages | Text per page | Layout rules |
|---|---|---|---|---|
| **Board book** (0-2) | square ~6x6 in (576x576) | 12-16, single pages (no spread) | 1-5 words | ONE giant object per page, thick border/frame, extreme contrast, rounded corners, word in huge lettering, a tactile cue (shape to touch/ point), no fine detail |
| **Concept / counting / ABC** (2-4) | square ~8x8 | 24-32 | 1-8 words | Grid-driven: one huge letter or numeral + the thing; counting groups laid out so each can be pointed at |
| **Picture book** (3-7) | landscape 10x8 or square 8.5x8.5 or portrait 8x10 | 32, spreads | 15-30 words | Spread = one picture; five+ layout types; text inside art |
| **Early reader** (5-8) | portrait ~6x9 (576x864) | 32-64 | 25-80 short decodable words | Illustration on top 50-60%, large text block below (>= 20px, leading 1.6, ragged right), repeated sight words highlighted, a speech-bubble or two, picture-text pairs, a 'did you notice?' prompt page |
| **Chapter book** (7-10) | portrait ~5.5x8.5 (528x816) | 64-150 | 150-300 words | Text-dominant pages; illustrated CHAPTER OPENER (big numeral + title + spot illustration); spot illustrations; drop caps; full-page illustration plates now and then; running heads and folios |
| **Activity / colouring** (all ages) | portrait 8.5x11 (816x1056) or square | 24-48 | instructions only | Black line art on white (print-friendly), mazes, dot-to-dot, find-and-circle, draw-the-other-half, big empty areas to colour; no fills that waste ink |

## The set (existing 6 + 6 new). Media must be told apart at a glance.
| Id | Age / format | MEDIUM (drastically different) | Status |
|---|---|---|---|
| story-space "Orbit Party" | 3-7 landscape picture book | **Cut-paper collage** | keep |
| story-city "Beep Block Street" | 3-7 landscape picture book | **Vibrant pop / screen-print graphic** | keep |
| story-forest "Little Fox, Big Trees" | 3-7 landscape picture book | **Linocut / woodblock** | keep |
| story-folktale "The Golden Thread" | 4-9 landscape | **Folk ornament papercut with gold** | keep |
| story-ocean "Below the Blue" | 3-7 square 8.5x8.5 picture book | **WATERCOLOR PAINTING** (washes, blooms, wet edges, paper grain, salt, soft bleed) | REBUILD |
| story-bedtime "Moon Blanket" | 2-5 portrait 8x10 picture book | **FELT & STITCHED TEXTILE** (appliqué, stitching, button eyes, fabric speckle, soft shadow) | REBUILD |
| story-anime "Sakura and the Sky Whale" | 4-8 picture book | **ANIME / MANGA-INSPIRED** (cel shading, huge glossy eyes, sparkle, speed lines, soft pastel gradient skies, cherry petals; Plajah-original, imitate no studio or artist) | NEW |
| story-pixel "Pixel Quest" | 6-12 landscape adventure/activity book | **PIXEL ART / 8-bit** (true pixel grid, limited palette, dithering, HUD-style text boxes, level-map spreads) | NEW |
| story-board "Hello, Colors!" | 0-2 square board book | **BOLD PRIMARY SHAPES** (huge single objects, thick black outline, pure primary colours, rounded frame) | NEW |
| story-reader "Pip the Pup Can Read" | 5-8 portrait early reader | **INK & COLOUR WASH** (loose wobbly pen line with off-register watery colour; friendly, light, lots of white) | NEW |
| story-chapter "The Moonlight Detectives" | 7-10 portrait chapter book | **SCRATCHBOARD / PEN + ONE SPOT COLOUR** (black field with white hatching, one teal or amber spot colour) | NEW |
| story-doodle "Doodle Day" | all ages portrait activity book | **PURE LINE ART** (black line on white: colouring pages, mazes, dot-to-dot, draw-the-other-half) | NEW |

## Acceptance checks added in v3
- **Medium test:** with the title hidden, a viewer can name each book's medium from one page (cut paper / pop print / linocut / folk papercut / watercolour / felt / anime / pixel / bold shapes / ink wash / scratchboard / line art). No two books share outline treatment, texture or shading method.
- **Format test:** trim and orientation, words per page, page count and layout rules match the age-group table; a board book page has ONE object; an early-reader page has a clear picture/text split; chapter-book pages are mostly text; the activity book is printable black-on-white.
- Every v2 check still applies (hero with a face where the format has characters, finished without images, >= 22px body text except where a format legitimately sets smaller print such as chapter-book body >= 16px, thumbnail test, lint clean, tests green).
