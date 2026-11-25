# The Scribe: Forge report

2026-11-25 07:01 · spec `scripts/eraclash3d/characters/scribe/forge.json` · character `public/games/lexicon/assets/characters/scribe.glb` · kit `D:/Plajah Runtime/eraclash3d/forge/scribe/kit`

## Against the gates

| Gate | Target | Now | |
|---|---|---|---|
| Overall (shape and colour, every view) | 95% | 72.4% | **23 short** |
| Head (outline overlap, mean of views) | 85% | 67.5% | **17 short** |
| Every part (overlap with the art's own part) | 80% | weakest staff 28.2% | **52 short** |

## By view

| View | Shape | Colour | Head IoU | Torso IoU | Legs IoU |
|---|---|---|---|---|---|
| front | 69.4% | 80.2% | 0.702 | 0.88 | 0.786 |
| side | 48.1% | 87.8% | 0.61 | 0.742 | 0.668 |
| back | 66.5% | 82.1% | 0.714 | 0.832 | 0.722 |

## By part (weakest first)

| Part | IoU | Front / side / back | Colour ΔE | Gate |
|---|---|---|---|---|
| staff | 28.2% | 29 / – / 27 | 20.9 | **52 short** |
| arms | 34.8% | 38 / 36 / 22 | 3.0 | **45 short** |
| legs | 35.3% | 35 / – / – | 1.4 | **45 short** |
| cloak | 50.6% | 31 / 46 / 58 | 3.3 | **29 short** |
| pack | 54.1% | ? / 34 / 56 | 2.6 | **26 short** |
| belt | 56.5% | 56 / – / – | 2.3 | **24 short** |
| skirt | 59.6% | 60 / 43 / – | 1.6 | **20 short** |
| jerkin | 62.8% | 67 / 32 / 30 | 2.1 | **17 short** |
| boots | 66.6% | 66 / 56 / 74 | 2.0 | **13 short** |
| head | 76.7% | 73 / 77 / 80 | 9.1 | **3 short** |

Images: `D:\Plajah Runtime\eraclash3d\forge\scribe\fidelity` (fidelity_<view>.png: art, model, overlay; delta_<view>.png: where colour is lost, green to red by ΔE, shape misses in red (art only) and blue (model only); parts_<view>.png: each art part tinted, the model's outlined).
