# Apex Elohim: hero building facade sheets and prompts

## Where the sheets are

I copied all 36 current hero facade sheets (1600 x 1600 PNG, one per landmark building) into one folder so you can find them:

`D:\plajah game assets deign from promtps\racer\flow-textures\hero-sheets\`

File names are the building's number and name, for example `29-old-cathedral.png`. (The originals live in `ironport-complete\textures\hero-facades\` as `tex-hero-29-old-cathedral_base.png`; the game reads a 1024 pixel copy of them.)

## What a sheet is, and why I can't swap in a different photo

Each landmark's 3D model has its walls mapped to **specific parts of its own sheet**: the door is in one place, the columns in another, the rose window on a particular spot. That is why dropping in an unrelated facade photo smeared the walls. A replacement sheet must keep **exactly the same layout**: same composition, every window, door, column and ornament in the same place, same edges and borders.

These sheets are already photographs. What they lack is **resolution and cleanliness** (the game currently uses them at 1024 px, and some have baked-in sky, haze or slight perspective). So the job is an **upscale and clean-up of the same picture**, not a new design.

## The prompt (use the building's sheet as the reference image)

Attach the sheet as the reference/source image, then use:

> Recreate this image as a sharper, higher resolution photograph, keeping the **exact same composition and layout**: every window, door, column, ornament, mortar line and edge in exactly the same place and the same size, same borders on all four sides. Real-world architectural photograph, orthographic straight-on view, flat even overcast lighting, **no cast shadows, no sky or horizon, no people, no cars, no text, no watermark, no vignette**. Crisp stone, brick, metal and glass texture detail with natural weathering. Output square, **2048 x 2048**, as sharp as possible.

If Flow lets you set an "image strength" or "similarity", set it **high** so the layout does not change.

Save each result as a PNG named exactly like the source file (for example `29-old-cathedral.png`) in `D:\plajah game assets deign from promtps\racer\flow-textures\hero-sheets-new\`.

## Per building: what the sheet shows (add this line to the prompt)

| Sheet | What it shows | Extra instruction |
|---|---|---|
| `01-ironport-towers` | blue glass curtain wall, white mullions, repeating grid | keep the regular window grid; reflections of sky are fine but subtle |
| `02-harborfront-expo` | large glass and steel hall front, band of vents at the bottom | keep the big glazing bays and the bottom vent band |
| `03-founders-plaza` | tall concrete piers with deep dark recesses | keep the vertical piers and dark gaps |
| `04-marina-clubhouse` | white frame, black glass doors, balcony | keep the door and balcony layout |
| `05-riverfront-silos` | four weathered concrete silos topped with rusty machinery | keep the four silos and the rust structure on top |
| `06-ferry-terminal` | cream Art Deco front with a clock at the top and glass-block band | keep the clock position and glass-block strip |
| `07-the-guardian` | orange brick tower with teal ornament bands | keep the colour bands and window rows |
| `08-penobscot-tower` | limestone Art Deco tower with tall vertical piers | keep the pier rhythm |
| `09-kestrel-hq` | bronze glass with a black grid | keep the grid; bottom dark band stays |
| `10-aurelia-hq` | blue glass with vertical fins | keep the vertical fins |
| `11-meridian-hq` | glass upper floors over a red brick factory base | keep the glass over brick split |
| `12-halcyon-hq` | white panels with black and silver chequer blocks | keep the chequer pattern exactly |
| `13-regent-theatre` | rust-copper Art Deco relief with gold detail | keep the panel and relief layout |
| `14-ironport-ballpark` | green iron arches over red brick | keep the three arches |
| `15-ironport-dome` | glass dome and band over brick | keep the dome position and size |
| `16-majestic-music-hall` | brick and stone with a large arched window and carved top | keep the arch in the same place |
| `17-parthenon-casino` | glass tower over a columned pediment | keep the pediment and column spacing |
| `18-opera-house` | four stone columns, balcony and doors | keep the four columns and the doors |
| `19-market-hall-a` | open iron market hall, dark interior | keep the iron frame and dark openings |
| `20-market-hall-b` | green iron frame, glass panes, brick lower wall | keep the frame and pane positions |
| `21-museum-of-art` | white colonnade and steps | keep the column positions and steps |
| `22-central-library` | two rows of arched windows with carved bands | keep the arch rows exactly |
| `23-university-hall` | collegiate Gothic stone with central window and doors | keep the central bay and door positions |
| `24-the-temple` | tall stained glass lancet windows | keep the lancet window layout |
| `25-central-station` | stone station front with a clock tower and arched windows | keep the tower and window arches |
| `26-ironworks-ruins` | ruined industrial wall with twisted rusted steel | keep the damage and steel shapes |
| `27-foundry-tower` | stone Art Deco with vertical piers | keep the vertical bays |
| `28-ledger-tower` | ornate cream palazzo facade, many windows | keep the window grid and decoration bands |
| `29-old-cathedral` | gothic stone with a central rose window and lancets | keep the rose window centred where it is |
| `30-roundhouse` | brick with black arched bays | keep the row of arches |
| `31-city-hall` | grey stone grid of windows on a dark base | already replaced with a photographic version; leave this one |
| `32-ironport-arena` | black steel and glass with a brick base | keep the horizontal glazing bands |
| `33-conservatory` | white iron glass dome | keep the dome and frame |
| `34-grand-theatre-garage` | ornate rust-orange relief over a parking deck | keep the carved band and the open deck |
| `35-woodward-row` | red brick with shopfronts and awnings | keep windows and the awning band |
| `36-greenway-station` | timber slats with a glass entrance and green roof planting | keep the slat bands and the entrance |

## How I wire them in

When the new sheets are in `hero-sheets-new`, tell me. I will:
1. Convert them (colour with occlusion folded in at 2048, normal and roughness at 1024) with the same script as the other sets.
2. Add each name to the list the game reads from the better folder instead of the packed 1024 copy.
3. Check each building from the street to make sure the walls line up (a wrong layout shows as smearing or misplaced doors).

## A free option while you generate them

The 1600 px originals are already sharper than what the game uses. I can switch the 12 landmarks nearest the circuit to the full 1600 px sheets right now, at the cost of more graphics memory. Say the word.
