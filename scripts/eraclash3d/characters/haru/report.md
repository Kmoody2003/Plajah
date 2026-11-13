# Haru: Forge report

2026-11-13 06:11 · spec `scripts/eraclash3d/characters/haru/forge.json` · character `public/games/era-clash/3d/assets/characters/samurai_v3.glb` · kit `public/games/era-clash/3d/assets/props/haru`

## Against the gates

| Gate | Target | Now | |
|---|---|---|---|
| Overall (shape and colour, every view) | 95% | 84.5% | **10 short** |
| Head (outline overlap, mean of views) | 85% | 86.3% | pass |
| Every part (overlap with the art's own part) | 80% | weakest sword 46.0% | **34 short** |

## By view

| View | Shape | Colour | Head IoU | Torso IoU | Legs IoU |
|---|---|---|---|---|---|
| front | 84.7% | 83.0% | 0.901 | 0.881 | 0.866 |
| side | 78.5% | 87.6% | 0.798 | 0.902 | 0.839 |
| back | 84.4% | 88.4% | 0.889 | 0.875 | 0.869 |

## By part (weakest first)

| Part | IoU | Front / side / back | Colour ΔE | Gate |
|---|---|---|---|---|
| sword | 46.0% | 39 / 50 / 51 | 19.3 | **34 short** |
| arms | 53.8% | 49 / 62 / 55 | 3.4 | **26 short** |
| feet | 56.0% | 54 / 59 / 16 | 4.8 | **24 short** |
| obi | 58.9% | 38 / 49 / 78 | 4.3 | **21 short** |
| kusazuri | 67.0% | 64 / 58 / 74 | 5.5 | **13 short** |
| sode | 69.7% | 44 / 82 / 48 | 7.3 | **10 short** |
| do | 70.0% | 64 / 64 / 78 | 8.6 | **10 short** |
| shins | 74.3% | 70 / 72 / 79 | 3.1 | **6 short** |
| hakama | 75.0% | 76 / 71 / 77 | 2.6 | **5 short** |
| head | 77.4% | 81 / 76 / 76 | 8.6 | **3 short** |

## Who the Forge built

- **Warrior / fighter** (97%, from katana, wakizashi, do, kusazuri, sode, kote, suneate, kabuto, samurai); bearing *commanding*; body searched within build 1–1.06–1.18, musculature 0.62–0.8–0.96, weight 0.04–0.14–0.32.
- **Japanese (samurai), Sengoku to early Edo (1467–1615)** (100%, from tosei-gusoku, katana, wakizashi, do, kusazuri, sode, kote, suneate, …).
- **Uchigatana (katana)**, worn (the turnaround wears it): blade 0.7 m, sori 0.016 m, tsuka 0.242 m, saya 0.735 m, bo-hi, midare hamon. uchigatana saya 0.642 m from the art is outside the record (0.66–0.84 m): held at 0.660; uchigatana saya 0.66 m cannot hold a 0.7 m blade: lengthened to 0.735 m.
- **Wakizashi**, kit (the flat-lay has it; the turnaround does not wear it): blade 0.45 m, sori 0.011 m, tsuka 0.2 m, saya 0.52 m, notare hamon. wakizashi is laid out sheathed: its hilt measured against the scabbard; the blade's features are not seen; wakizashi tsuka 0.313 m from the art is outside the record (0.14–0.2 m): held at 0.200.
- Worn: Over armour the swords are thrust through the uwa-obi, an outer sash tied over the dō (tosei-gusoku); without armour, through the obi over the kosode.
- Anchored to 31 museum objects (materials recorded: iron 8, gold 8, steel 6, lacquer 5, wood 5, silk 5, copper 5, leather 5) and the Combat Atlas: Kendo (ASI-007), Judo (ASI-004), Sumo (ASI-006).

Images: `D:\Plajah Runtime\eraclash3d\forge\haru\fidelity` (fidelity_<view>.png: art, model, overlay; delta_<view>.png: where colour is lost, green to red by ΔE, shape misses in red (art only) and blue (model only); parts_<view>.png: each art part tinted, the model's outlined).
