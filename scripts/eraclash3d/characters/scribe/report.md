# The Scribe: Forge report

2026-11-25 16:47 · spec `scripts/eraclash3d/characters/scribe/forge.json` · character `public/games/lexicon/assets/characters/scribe.glb` · kit `D:/Plajah Runtime/eraclash3d/forge/scribe/kit`

## Against the gates

| Gate | Target | Now | |
|---|---|---|---|
| Overall (shape and colour, every view) | 95% | 62.6% | **32 short** |
| Head (outline overlap, mean of views) | 85% | 51.2% | **34 short** |
| Every part (overlap with the art's own part) | 80% | weakest staff 12.0% | **68 short** |

## By view

| View | Shape | Colour | Head IoU | Torso IoU | Legs IoU |
|---|---|---|---|---|---|
| front | 50.2% | 79.2% | 0.476 | 0.841 | 0.776 |
| side | 43.1% | 71.1% | 0.551 | 0.706 | 0.497 |
| back | 47.1% | 84.8% | 0.509 | 0.789 | 0.692 |

## By part (weakest first)

| Part | IoU | Front / side / back | Colour ΔE | Gate |
|---|---|---|---|---|
| staff | 12.0% | 12 / 12 / ? | 25.0 | **68 short** |
| legs | 36.3% | 36 / – / – | 5.0 | **44 short** |
| arms | 37.7% | 43 / 36 / 22 | 8.3 | **42 short** |
| cloak | 50.8% | 31 / 35 / 61 | 5.0 | **29 short** |
| pack | 55.1% | ? / ? / 55 | 1.4 | **25 short** |
| belt | 56.5% | 58 / 48 / – | 4.9 | **24 short** |
| boots | 60.5% | 62 / 35 / 71 | 6.9 | **20 short** |
| jerkin | 60.6% | 65 / 41 / 33 | 3.4 | **19 short** |
| skirt | 61.8% | 63 / 22 / – | 5.0 | **18 short** |
| head | 71.1% | 74 / 61 / 78 | 10.0 | **9 short** |

Images: `D:\Plajah Runtime\eraclash3d\forge\scribe\fidelity` (fidelity_<view>.png: art, model, overlay; delta_<view>.png: where colour is lost, green to red by ΔE, shape misses in red (art only) and blue (model only); parts_<view>.png: each art part tinted, the model's outlined).
