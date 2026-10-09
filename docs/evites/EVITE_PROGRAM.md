# Plajah Evites — program plan (v2, 2026-10-08)

Plajah Events lives under **Community** in the side pillar (Marquee landing; Command Center for people running events).
Every evite is a **layered Tela document**: generated art plate → transparent cut-outs (tilt parallax) → WebGL effects
through masks (foil, light, particles) → live Tela text (never baked). Guests RSVP from any phone browser, no account.

## Standing rules
- **Generative only** until there is budget to commission artists (council policy in `services/council/councilPrompts.ts`).
- **No third-party IP.** No league/team marks, no game trade dress (generic "blocky voxel", never Minecraft/Roblox),
  no official military insignia or seals, no licensed characters. Open-licensed fonts only.
- **Both councils sign off.** The Art Council sets the direction per collection; the Motion Council (6 directors +
  Studio Roster crew) sets entrance, idle, interaction and reduced-motion timing per collection.

## Catalogue v2 (≈206 authored + Tela-era versions)
| Collection | Count | Notes |
|---|---|---|
| Kids · Everyone | 12 | zoo, circus, pajama party, bounce house, mad science, farm, camping, magic show, slime lab, bubbles, pool splash, superstar |
| Kids · Boys | 12 | dinosaurs, space, trucks, soccer, pirates, heroes, robots, sharks, safari, knights, race cars, ninjas |
| Kids · Girls | 12 | unicorns, castle, mermaids, fairy garden, butterflies, ballet, cupcakes, rainbow, kittens, art, carousel, pop star |
| Kids · Chora & Reello | 12 | council's 12 scenarios (cake eruption, disco, kelp rave, countdown, haunted creep, jungle gym, pillow fort, premiere, picnic stampede, wave crash, skate bowl, snow howl) |
| Gaming | 12 | pixel arcade, retro 8-bit, neon esports, LAN party, block-world builder, block adventure, obstacle course, laser tag, VR arcade, racing game, controller, game-show |
| Sports | 16 | basketball, football, soccer, baseball, hockey, motor racing, tennis, volleyball, golf, swimming, gymnastics, boxing, skate, cheer, track, martial arts |
| Patriotic | 6 | Independence Day, Memorial Day, Labor Day, Flag Day, stars-and-stripes block party, fireworks (palette swappable for any nation's day) |
| Military | 8 | welcome home, deployment send-off, promotion, retirement, Veterans Day, homecoming, change of command, military ball |
| Adult parties | 24 | as built |
| Life moments | 12 | baby shower, gender reveal, bridal shower, engagement, graduation, sweet 16, quinceañera, retirement, farewell, celebration of life, reunion, housewarming |
| Holidays | 16 | Christmas, Hanukkah, Diwali, Eid, Lunar New Year, Kwanzaa, Halloween, Friendsgiving, New Year's Eve, Galentine's, St. Patrick's, Easter, Juneteenth, Día de los Muertos*, summer solstice, office holiday party |
| Faith milestones | 8 | baptism, christening, first communion, confirmation, bar mitzvah, bat mitzvah, church homecoming, vow renewal |
| Anniversary | 12 | as built |
| Gatherings | 12 | as built |
| Weddings | 36 | three families: watercolor botanicals, painted villa, deco/celestial |
| **Tela Design History** | ~45 | one evite per style era (Art Deco, Bauhaus, Memphis, Ukiyo-e principles…), built procedurally from the era's palette/type/ornament: no credits |

\*Culturally specific holidays are collaboration-gated per the council method: reviewed before release.

## Art production (Magnific)
- A Magnific One **draft grid costs a flat 250 credits for 4, 8 or 16 tiles**. Tiles are phone-resolution; a plate is
  upscaled only when someone orders print (cost folded into the print price).
- Each template ships with **several art variations** from its grid, so a host can swap the plate in one tap.
- Flagship heroes (wedding covers, landing art) get a full-quality Magnific One render (180 credits each).

## Themes as a creator economy
- Any user can build a theme in Tela (art plate + layout + motion preset) and publish it: **free**, **paid**
  (sold in their merch shop at the 5% direct-sale rate), **Sanctuary-gated** (members only), or **tradable**.
- A purchased theme is a license to use it for your own events; the theme's source document stays the creator's.
- Personal events themselves carry no platform cut; gifts carry none either.

## Print
- `printService` sits on the existing provider-agnostic `services/fulfillment.ts` (Gelato first, it prints flat cards;
  generic HTTP adapter for any print API).
- Export: 5×7 in (and A6/A7), 300 dpi, 0.125 in bleed, safe area, CMYK-safe palette check, PDF/X-friendly output
  from the Tela document with live text burned in at export time.
- Flow: host picks size/paper/quantity → quote → Stripe checkout → provider order → tracking on the event dashboard.

## Order of work
1. Councils (art + motion) re-run under the generative policy for all collections, new ones included.
2. Plates: draft grids per collection, picks, hero finals.
3. Layered renderer + motion presets; guest page; host studio; Events home + Create buttons.
4. Theme marketplace (publish / price / Sanctuary gate / trade).
5. Print export + provider adapter.
