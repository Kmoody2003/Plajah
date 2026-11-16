# Apex Elohim: photoreal texture prompts (for Google Flow)

Goal: replace the painted-looking colour maps with real photographic ones. We only need the **colour (albedo) image** for each: the game rebuilds the normal, roughness, height and occlusion maps from it with a script, so don't ask Flow for those.

## Rules that apply to every prompt below

Paste this block at the end of every prompt:

> Photographic, orthographic flat-on view (camera exactly perpendicular to the surface, no perspective, no tilt), flat even diffuse lighting like an overcast day, no cast shadows, no highlights, no reflections of the environment, no people, no text, no watermark, no vignette. Seamless tileable texture (left edge matches right edge, top edge matches bottom edge). Real-world photo scan quality, natural wear. 1:1 square, highest resolution available.

Ask for **2048 x 2048** (or the largest square). Save as PNG, named exactly as in the "File" column so it drops in. If Flow can't do seamless, that's fine, say so and I'll make them seamless with a script.

## Shared building materials (highest priority first)

| File | Prompt (before the rules block) |
|---|---|
| `tex-shared-01-red-brick_base.png` | Close-up of a weathered American red brick wall, running bond, slightly irregular bricks in several shades of red and brown, light grey mortar joints, subtle soot staining and a few chipped bricks |
| `tex-shared-14-steel-panel_base.png` | Brushed grey painted steel cladding panels with fine vertical seams and rows of small bolts, light weathering and faint rust at the edges |
| `tex-shared-07-glass-curtain-blue_base.png` | Modern high-rise curtain wall seen straight on: dark blue-green tinted glass panes in a grid of slim aluminium mullions, slight differences in tint between panes, subtle dirt at the frame edges |
| `tex-shared-18-timber-siding_base.png` | Horizontal weathered grey-brown timber siding boards with visible wood grain and knots, thin shadow gaps between boards |
| `tex-shared-21-corrugated-steel_base.png` | Industrial corrugated galvanised steel sheet, vertical ribs, mild rust streaks and dull zinc finish |
| `tex-shared-17-white-stucco_base.png` | Off-white painted stucco wall, fine sand texture, hairline cracks and light grime |
| `tex-shared-16-concrete-weathered_base.png` | Weathered cast concrete wall with formwork lines, small air holes, rain staining and faint moss at the bottom edge |
| `tex-shared-15-concrete-boardformed_base.png` | Board-formed concrete wall showing the wood-grain imprint of the timber formwork, horizontal board lines, natural grey colour variation |
| `tex-shared-04-limestone_base.png` | Pale limestone ashlar blocks in a regular course pattern, fine joints, warm beige with soft natural veining |
| `tex-shared-05-white-marble_base.png` | White marble cladding slabs with soft grey veining and thin joints |
| `tex-shared-06-granite_base.png` | Polished-then-weathered grey granite blocks, speckled crystalline texture, thin joints |
| `tex-shared-02-weathered-brick_base.png` | Old, heavily weathered brown-red brick wall with eroded faces, uneven mortar, efflorescence and patches of lime wash |
| `tex-shared-03-orange-brick_base.png` | Orange-brown industrial brick wall with dark header bricks mixed in, pale mortar |
| `tex-shared-10-terracotta_base.png` | Terracotta rainscreen cladding tiles, muted orange, regular joints, subtle glaze variation |
| `tex-shared-12-bronze-metal_base.png` | Dark bronze anodised aluminium panels with narrow reveals, slight colour variation |
| `tex-shared-13-copper-roof_base.png` | Standing-seam copper roof with partial green verdigris patina |
| `tex-shared-22-asphalt-shingle_base.png` | Dark grey asphalt roof shingles in overlapping rows, granule texture, light moss |
| `tex-shared-23-slate-roof_base.png` | Natural dark slate roof tiles, overlapping rows, subtle colour variation |
| `tex-shared-20-white-clapboard_base.png` | White painted clapboard siding, slightly peeling paint, horizontal shadow lines kept very soft |
| `tex-shared-19-red-timber_base.png` | Red-stained timber boards, barn style, faded and weathered |
| `tex-shared-24-stone-rubble_base.png` | Dry-laid rough stone rubble wall, mixed grey and tan stones, dark gaps |
| `tex-shared-08-glass-curtain-cerulean_base.png` | Curtain wall with light cerulean blue reflective glass panes and silver mullions |
| `tex-shared-09-glass-curtain-bronze_base.png` | Curtain wall with bronze-tinted glass panes and dark mullions |
| `tex-shared-11-glazed-tile_base.png` | Glazed ceramic wall tiles, deep green, with subtle glaze crazing |

## Ground, road and track surfaces

| File (new) | Prompt |
|---|---|
| `ground_asphalt_dry.png` | Dry worn city asphalt, dark grey, visible aggregate stones, fine cracks, a few tar-filled crack lines, no road markings |
| `ground_asphalt_wet.png` | The same kind of asphalt but evenly damp (matte darker grey, not mirror-like), no puddles |
| `ground_gravel_rally.png` | Compacted gravel rally stage road surface, mix of tan and grey stones 5-20 mm, dusty fine material between, subtle tyre-pressed areas |
| `ground_dirt_track.png` | Dry packed dirt track, tan-brown, small stones and fine cracks |
| `ground_mud.png` | Wet churned mud, dark brown, glossy wet patches kept soft, small stones |
| `ground_grass_meadow.png` | Top-down real meadow grass, mixed blade lengths and a little clover, mid green with some straw colour, natural not lawn-perfect |
| `ground_grass_dry.png` | Dry late-summer grass, straw yellow and green mix |
| `ground_forest_floor.png` | Forest floor with pine needles, small twigs and fallen leaves, brown and dark green |
| `ground_sand.png` | Fine beach sand, pale warm beige, tiny shell fragments, subtle ripples |
| `ground_concrete_sidewalk.png` | City concrete sidewalk slabs with fine expansion joints, light grey, slight wear and stains |
| `ground_curb_granite.png` | Granite street curb stone, grey, chipped edge, 3 sections visible with thin joints |
| `ground_paver_brick.png` | Red-grey interlocking brick pavers in a herringbone pattern, slightly worn |
| `ground_cobblestone.png` | Old granite cobblestone street, rounded grey stones, dark joints |
| `ground_rumble_strip.png` | Race circuit kerb, alternating red and white painted concrete, scuffed by tyres |

## The 7 hero buildings nearest the course (generate 1 each, 2048)

Use this template, filling in the building: *"Front facade of [DESCRIPTION], orthographic straight-on, whole facade fills the frame edge to edge, real photographic detail in windows, stonework and signage-free walls..."* then the rules block, **but without the "tileable" line** (these are single-sheet facades, not tiles).

| File | Building |
|---|---|
| `tex-hero-01-ironport-towers_base.png` | Ironport Towers: pair of glass and steel office towers, 1990s, dark blue glass with silver vertical fins |
| `tex-hero-03-founders-plaza_base.png` | Founders Plaza: mid-rise limestone-clad civic office building with a colonnaded base |
| `tex-hero-04-marina-clubhouse_base.png` | Marina Clubhouse: low white timber and glass yacht club with a shingle roof |
| `tex-hero-05-riverfront-silos_base.png` | Riverfront Silos: old concrete grain silos, weathered and stained, partly converted |
| `tex-hero-07-the-guardian_base.png` | The Guardian: Art Deco skyscraper, orange-brown brick and terracotta ornament, stepped crown |
| `tex-hero-08-penobscot-tower_base.png` | Penobscot Tower: early 20th century Art Deco skyscraper, buff brick with tall setbacks |
| `tex-hero-31-city-hall_base.png` | City Hall: neoclassical limestone building with columns and a pediment, symmetrical |

## How to hand them back

Drop the PNGs in `D:\plajah game assets deign from promtps\racer\flow-textures\` (any subfolder is fine, keep the file names). Tell me when they're there and I'll make them seamless where needed, rebuild the normal, roughness, height and occlusion maps, resize them for the GPU budget, and wire them in.
