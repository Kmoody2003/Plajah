# Haru: Forge report

2026-11-13 07:00 · spec `scripts/eraclash3d/characters/haru/forge.json` · character `public/games/era-clash/3d/assets/characters/samurai_v3.glb` · kit `public/games/era-clash/3d/assets/props/haru`

## Against the gates

| Gate | Target | Now | |
|---|---|---|---|
| Overall (shape and colour, every view) | 95% | 83.8% | **11 short** |
| Head (outline overlap, mean of views) | 85% | 83.1% | **2 short** |
| Every part (overlap with the art's own part) | 80% | weakest sword 51.4% | **29 short** |

## By view

| View | Shape | Colour | Head IoU | Torso IoU | Legs IoU |
|---|---|---|---|---|---|
| front | 82.5% | 83.7% | 0.858 | 0.903 | 0.853 |
| side | 77.8% | 87.7% | 0.795 | 0.886 | 0.839 |
| back | 81.8% | 89.5% | 0.84 | 0.897 | 0.853 |

## By part (weakest first)

| Part | IoU | Front / side / back | Colour ΔE | Gate |
|---|---|---|---|---|
| sword | 51.4% | 40 / 56 / 53 | 17.2 | **29 short** |
| feet | 55.2% | 60 / 51 / 18 | 5.3 | **25 short** |
| arms | 57.8% | 54 / 61 / 60 | 3.4 | **22 short** |
| obi | 58.0% | 40 / 41 / 79 | 4.3 | **22 short** |
| kusazuri | 62.0% | 54 / 57 / 70 | 5.2 | **18 short** |
| sode | 64.5% | 39 / 75 / 48 | 7.3 | **16 short** |
| hakama | 67.6% | 65 / 71 / 69 | 2.6 | **12 short** |
| do | 67.7% | 64 / 60 / 74 | 7.8 | **12 short** |
| head | 75.4% | 81 / 71 / 76 | 8.8 | **5 short** |
| shins | 75.6% | 73 / 73 / 80 | 3.1 | **4 short** |

## Who the Forge built

- **Warrior / fighter** (97%, from katana, wakizashi, do, kusazuri, sode, kote, suneate, kabuto, samurai); bearing *commanding*; body searched within build 1–1.06–1.18, musculature 0.62–0.8–0.96, weight 0.04–0.14–0.32.
- **Japanese (samurai), Sengoku to early Edo (1467–1615)** (100%, from tosei-gusoku, katana, wakizashi, do, kusazuri, sode, kote, suneate, …).
- **Uchigatana (katana)**, worn (the turnaround wears it): blade 0.7 m, sori 0.016 m, tsuka 0.242 m, saya 0.735 m, bo-hi, midare hamon. uchigatana saya 0.642 m from the art is outside the record (0.66–0.84 m): held at 0.660; uchigatana saya 0.66 m cannot hold a 0.7 m blade: lengthened to 0.735 m.
- **Wakizashi**, kit (the flat-lay has it; the turnaround does not wear it): blade 0.45 m, sori 0.011 m, tsuka 0.2 m, saya 0.52 m, notare hamon. wakizashi is laid out sheathed: its hilt measured against the scabbard; the blade's features are not seen; wakizashi tsuka 0.313 m from the art is outside the record (0.14–0.2 m): held at 0.200.
- Worn: Over armour the swords are thrust through the uwa-obi, an outer sash tied over the dō (tosei-gusoku); without armour, through the obi over the kosode.
- Anchored to 31 museum objects (materials recorded: iron 8, gold 8, steel 6, lacquer 5, wood 5, silk 5, copper 5, leather 5) and the Combat Atlas: Kendo (ASI-007), Judo (ASI-004), Sumo (ASI-006).

Images: `D:\Plajah Runtime\eraclash3d\forge\haru\fidelity` (fidelity_<view>.png: art, model, overlay; delta_<view>.png: where colour is lost, green to red by ΔE, shape misses in red (art only) and blue (model only); parts_<view>.png: each art part tinted, the model's outlined).
