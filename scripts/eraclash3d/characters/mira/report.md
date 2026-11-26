# Elder Mira: Forge report

2026-11-26 00:43 · spec `scripts/eraclash3d/characters/mira/forge.json` · character `public/games/lexicon/assets/characters/mira.glb` · kit `D:/Plajah Runtime/eraclash3d/forge/mira/kit`

## Against the gates

| Gate | Target | Now | |
|---|---|---|---|
| Overall (shape and colour, every view) | 95% | 74.0% | **21 short** |
| Head (outline overlap, mean of views) | 85% | 67.0% | **18 short** |
| Every part (overlap with the art's own part) | 80% | weakest feet 38.8% | **41 short** |

## By view

| View | Shape | Colour | Head IoU | Torso IoU | Legs IoU |
|---|---|---|---|---|---|
| front | 62.5% | 91.1% | 0.678 | 0.863 | 0.77 |
| side | 54.0% | 80.4% | 0.626 | 0.794 | 0.729 |
| back | 63.2% | 92.9% | 0.706 | 0.849 | 0.775 |

## By part (weakest first)

| Part | IoU | Front / side / back | Colour ΔE | Gate |
|---|---|---|---|---|
| feet | 38.8% | 42 / 29 / – | 2.4 | **41 short** |
| shins | 40.4% | 38 / 31 / 45 | 3.5 | **40 short** |
| do | 41.9% | 45 / 10 / ? | 3.6 | **38 short** |
| hakama | 46.7% | 60 / 38 / 35 | 4.7 | **33 short** |
| arms | 49.3% | 52 / 42 / 54 | 13.4 | **31 short** |
| head | 59.4% | 55 / 48 / 72 | 7.1 | **21 short** |

## Who the Forge built

- **Elder** (100%, from spec context); bearing *settled*; body searched within build 0.82–0.94–1.04, musculature 0–0.15–0.35, weight 0.1–0.32–0.6.
- **Fantasy village (Lexicon, Glossa Hollow), Invented; late-medieval European dress (1300–1500)** (100%, from spec context).
- Worn: Keys, purses and books hang from a girdle or belt at the hip, as medieval householders and scholars carried them.
- Anchored to 23 museum objects (materials recorded: gold 4, silk 2, silver 2, paper 2, wood 1, iron 1, steel 1) and the Combat Atlas: .

Images: `D:\Plajah Runtime\eraclash3d\forge\mira\fidelity` (fidelity_<view>.png: art, model, overlay; delta_<view>.png: where colour is lost, green to red by ΔE, shape misses in red (art only) and blue (model only); parts_<view>.png: each art part tinted, the model's outlined).
