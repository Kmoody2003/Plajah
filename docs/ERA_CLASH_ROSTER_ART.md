# Era Clash: paintings needed for the new warriors

Nine historical warriors are playable now with a drawn stand-in body and a generated portrait. Each one needs two paintings from Muse, matching the original six.

## What to deliver per warrior

| File | Size | Notes |
|---|---|---|
| `public/games/era-clash/assets/sprite-<id>.png` | about 310–360 × 720, RGBA | Full body, feet to crown, **facing right**, in a ready fighting stance, on a transparent background. One figure only, with nothing else cropped into the frame. Same painterly style and lighting as `sprite-samurai.png`. |
| `public/games/era-clash/assets/portrait-<id>.webp` | 1600 × 1600 | Painted portrait for the select card and HUD, waist up, with the arena or homeland behind. |

When a pair lands, Claude rigs it in `rig2d.js`: adds the warrior to `RIGS` with joint positions, and removes `pending` and `img:null` from the fighter in `index.html`. Their move list, style and AI already work.

## The nine

| id | Warrior | Era | Wearing / carrying (for the painting) | Fighting style |
|---|---|---|---|---|
| `shaka` | Shaka | Zulu Kingdom, c. 1787–1828 | Isicoco head ring or feathered headdress, cow-tail and fur regalia, oval cowhide isihlangu shield, short iklwa stabbing spear | Nguni stick fighting (guard breaker) |
| `nzinga` | Nzinga | Ndongo & Matamba, c. 1583–1663 | Royal cloth and jewellery of the Mbundu court, a war axe | Engolo kicks (low evader). Engolo is from southern Angola, her court was in the north, so this pairing is a creative choice. |
| `amanirenas` | Amanirenas | Kingdom of Kush, fl. 25–21 BCE | Kushite royal cap with uraeus, layered robes, a bow, archer's thumb ring; Strabo calls her one-eyed | Kushite archery (zoner) |
| `lapulapu` | Lapu-Lapu | Mactan, 1521 | Putong headcloth, tattoos, bahag, kampilan sword, wooden shield | Kali / Eskrima (double striker) |
| `hangtuah` | Hang Tuah | Melaka Sultanate, 15th c. (legend) | Tengkolok headcloth, baju and samping, the keris Taming Sari | Silat Melayu (counter-grappler) |
| `naresuan` | Naresuan | Ayutthaya, 1555–1605 | Mongkhon headband, pra jiad armbands, dap sword | Muay Boran (clinch striker) |
| `tecumseh` | Tecumseh | Shawnee Confederacy, 1768–1813 | Head wrap with feather, trade-cloth shirt, silver ornaments, tomahawk and war club | War club & tomahawk (thrower) |
| `lautaro` | Lautaro | Mapuche, c. 1534–1557 | Trarilonko silver headband, poncho, macana club | Mapuche war tactics (ambusher) |
| `zumbi` | Zumbi dos Palmares | Quilombo dos Palmares, 1655–1695 | Simple cotton clothing, facão machete | Capoeira (ginga dodger). The link to Palmares is tradition, not record. |

None of the nine has a home arena painted yet, so the CPU picks a random arena for them. New stages (for example the Zulu kraal, Melaka harbour, the Mactan shallows, the Ayutthaya temple court, the Ohio forest, the Araucanía, the Palmares hills) would need paintings at the same size as the existing `stage-*.webp`.
