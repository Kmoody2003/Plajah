# Era Clash — Claude art pack (all-in-one)

Everything Claude needs to rig the nine new Era Clash warriors and give
each a home arena. Drop everything into
`public/games/era-clash/assets/`.

## Character art (14 files)

Per warrior: `sprite-<id>.png` (~352×720 RGBA, full body feet-to-crown,
facing right, transparent background) and `portrait-<id>.webp`
(1600×1600, waist up, homeland behind). When a pair lands, rig it in
`rig2d.js` (add the warrior to `RIGS` with joint positions; remove
`pending` and `img:null` from the fighter in `index.html`).

- sprite-shaka.png + portrait-shaka.webp — Shaka, Zulu
- sprite-nzinga.png + portrait-nzinga.webp — Nzinga, Ndongo & Matamba
- sprite-amanirenas.png — Amanirenas, Kush (portrait missing, see below)
- sprite-hangtuah.png + portrait-hangtuah.webp — Hang Tuah, Melaka
- sprite-naresuan.png — Naresuan, Ayutthaya (portrait missing)
- sprite-tecumseh.png + portrait-tecumseh.webp — Tecumseh, Shawnee
- sprite-lautaro.png + portrait-lautaro.webp — Lautaro, Mapuche
- sprite-zumbi.png + portrait-zumbi.webp — Zumbi dos Palmares

## Home arenas (9 files, all 1920×1280)

- stage-zulu.webp — Zulu kraal (Shaka)
- stage-melaka.webp — Melaka harbour (Hang Tuah)
- stage-mactan.webp — Mactan shallows (Lapu-Lapu)
- stage-ayutthaya.webp — Ayutthaya temple court (Naresuan)
- stage-ohio.webp — Ohio forest (Tecumseh)
- stage-araucania.webp — Araucanía (Lautaro)
- stage-palmares.webp — Palmares hills (Zumbi)
- stage-kush.webp — Meroe pyramids + temple court (Amanirenas)
- stage-ndongo.webp — Ndongo highlands, royal court village (Nzinga)

## Still missing — 4 images Omie could not generate

- portrait-amanirenas.webp
- sprite-lapulapu.png + portrait-lapulapu.webp
- portrait-naresuan.webp

Source these another way (paint them, or send art for Omie to finish
to spec) — do not leave the warriors on stand-in bodies.

## Notes

- Melaka harbour ships fly flags that look modern — repaint the flags
  before wiring that stage in if it matters.
- Character art and stages match the original six warriors' painterly
  style (see sprite-samurai.png / portrait-samurai.webp /
  stage-japan.webp in the shipped game build).
