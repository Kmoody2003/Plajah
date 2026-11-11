# Era Clash 3D: era-accuracy audit of Otsu-no-ura

Kenne wants the buildings and objects historically accurate, checked against Plajah's own history and museum platforms. Era Clash stays a hybrid: an accurate Sengoku setting, with the Elohim time seam as the fiction on top.

## Sources

Period evidence was pulled through Plajah's museum service (`services/museum`: the Met, the Art Institute of Chicago, Cleveland, the Smithsonian, Europeana, Wikimedia Commons, the Library of Congress, Harvard, the Rijksmuseum, Japan Search, the National Palace Museum) by `scripts/eraclash3d/eraReference.ts`. That produced 259 objects, saved to `games/era-clash-3d/review/era-references.json`. The strongest:

| Work | Date | Holder | Evidence for |
|---|---|---|---|
| Scenes in and around the Capital (Rakuchū-rakugai) | 17th c. | The Met | Kyoto streets, townhouses, roofs, crowds |
| Rakuchū-rakugai-zu, pair of six-fold screens | early 17th c. | Wikimedia Commons | The same, a second hand |
| Street Scenes in Kyoto | late 17th c. | The Met | Shopfronts, noren, signs, street life |
| 番匠町家雛形 (carpenter's townhouse patterns) | 1770 | Japan Search | Machiya construction and proportions (later, so read with care) |
| Nanban screens (Kanō Naizen and others) | c. 1600 | Wikimedia Commons, the Met | A port town: ships, warehouses, waterfront |
| 唐船・南蛮船図屏風 (Chinese and Nanban ships) | 17th c. | Japan Search | Ships in harbour |
| 紺糸威南蛮胴具足 (armour with a European-style cuirass) | Azuchi-Momoyama, 16th c. | Japan Search | Period armour |
| Tachidō tosei-gusoku armour | Momoyama–Edo | Wikimedia Commons | Armour construction |
| 柳橋水車図屏風 (willow bridge and waterwheel screen) | 16th–17th c. | Japan Search | Bridges over water |
| Battle of Nagashino map screen | 18th c. after 1575 | Wikimedia Commons | Castles, field fortifications, armies |

**Next step for the sources:** carry each work's museum link through the script (the field isn't mapped yet), and use `museumContextBlock` to ground the Scholar notes.

## Findings

Confidence: **H** = well established; **M** = likely, check against the screens before changing.

| What we built | Period record | Verdict | Fix |
|---|---|---|---|
| **The date: c. 1570** | Tall, white, multi-tiered keeps on stone bases follow Azuchi Castle (1576–79) and spread in the 1580s–1610s. **H** | The castle we show is anachronistic for 1570. | **Decision:** move the chapter to the 1590s (late Sengoku and Momoyama, also the age of the Nanban port trade), or keep 1570 and make the castle an earlier fortress. |
| **Kawara tile on every townhouse** | Late-16th-century Kyoto townhouses mostly had board or shingle roofs (itabuki) held down by stones. Tile spread to townhouses in the Edo period, under fire-prevention rules. **H** | Anachronistic for the commoners' houses. | Board-and-stone roofs for most machiya; tile for the castle, temples, storehouses (kura) and the richest merchants. |
| **Plastered upper storeys and slatted windows (mushiko)** | Mostly Edo-period. Momoyama machiya fronts were largely timber, with low upper floors (tsushi-nikai). **M** | Too late for most houses. | Fewer plastered upper floors; low timber upper floors. |
| **Udatsu firewalls** | Some appear on Rakuchū-rakugai screens. **M** | Plausible in small numbers. | Keep on a few. |
| **Fire-bucket pyramids (tensui-oke)** | An Edo-period fire-watch custom. **M** | Anachronistic. | Remove. |
| **Paper lanterns (chōchin)** | The collapsible ribbed lantern appears in the late 16th century. **M** | Fine for the 1590s. | Keep. |
| **Cobbled main road** | Town streets were packed earth. Stone paving (ishidatami) was used on slopes and on temple and shrine approaches. **H** | The cobbles are a European look. | **Decision:** you love the road. Options: dressed ishidatami flags only on the castle avenue and the hill approach, packed earth elsewhere; or keep the cobbles as artistic licence. |
| **Canal with stone banks; arched bridges** | Stone-banked canals belong to the Momoyama and early Edo merchant cities. Steep taikobashi bridges were mostly at shrines; town bridges were flatter. **M** | Fine for the 1590s; the arches run a little high. | Flatter arches on the town bridges; keep a steep taikobashi at the shrine. |
| **Masugata, ishigaki walls, yagura, a gate with an upper storey** | Momoyama castle practice. **H** | Accurate for the 1590s. | Keep. |
| **Stone lanterns (tōrō) in the castle forecourt** | Mostly temples, shrines and gardens. **M** | Unusual in a castle. | Move most of them to the shrine. |
| **Haru's armour** | Tosei-gusoku, the "modern" armour of the Momoyama period. **H** | Accurate. | Build the armour from period construction (see the characters plan). |
| **The raiders** | Norse arms and armour of the 9th–11th centuries, brought by the seam (the fiction). | Accurate as Norse. | Check axes, shields and helmets against the museum Viking pieces. |
| **Townsfolk dress** | Kosode for townspeople. **H** | Right. | Keep. |

## Proportions (Plajah Build)

Japanese carpentry works on the ken module, about 1.82 m. Machiya frontages run 2–4 ken (3.6–7.3 m); ours run 4.6–6.8 m. The pass will snap frontages, posts and bays to ken multiples, and check storey heights against the 1770 pattern book using the CAD module (`services/cad`).

## Decisions for Kenne

1. **The year:** 1590s, or 1570 with an earlier castle?
2. **Townhouse roofs:** board and stone (accurate), or tile everywhere (the look of the stills)?
3. **The main road:** stone flags only where they belong, or the cobbles kept as licence?
