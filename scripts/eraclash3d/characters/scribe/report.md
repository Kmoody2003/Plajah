# The Scribe: Forge report

2026-11-25 09:55 · spec `scripts/eraclash3d/characters/scribe/forge.json` · character `public/games/lexicon/assets/characters/scribe.glb` · kit `D:/Plajah Runtime/eraclash3d/forge/scribe/kit`

## Against the gates

| Gate | Target | Now | |
|---|---|---|---|
| Overall (shape and colour, every view) | 95% | 66.0% | **29 short** |
| Head (outline overlap, mean of views) | 85% | 62.7% | **22 short** |
| Every part (overlap with the art's own part) | 80% | weakest staff 28.5% | **52 short** |

## By view

| View | Shape | Colour | Head IoU | Torso IoU | Legs IoU |
|---|---|---|---|---|---|
| front | 64.8% | 74.6% | 0.628 | 0.855 | 0.793 |
| side | 48.1% | 69.8% | 0.614 | 0.703 | 0.538 |
| back | 59.9% | 78.8% | 0.639 | 0.82 | 0.665 |

## By part (weakest first)

| Part | IoU | Front / side / back | Colour ΔE | Gate |
|---|---|---|---|---|
| staff | 28.5% | 32 / 21 / 27 | 21.9 | **52 short** |
| arms | 32.4% | 38 / 29 / 20 | 10.3 | **48 short** |
| legs | 37.2% | 37 / – / – | 3.0 | **43 short** |
| pack | 49.1% | 30 / ? / 52 | 4.4 | **31 short** |
| cloak | 53.7% | ? / 35 / 61 | 5.3 | **26 short** |
| boots | 55.7% | 57 / 49 / 60 | 6.1 | **24 short** |
| skirt | 57.2% | 57 / – / – | 3.9 | **23 short** |
| belt | 57.5% | 57 / ? / – | 4.9 | **23 short** |
| jerkin | 65.4% | 70 / 22 / ? | 5.6 | **15 short** |
| head | 74.4% | 72 / 75 / 76 | 11.1 | **6 short** |

Images: `D:\Plajah Runtime\eraclash3d\forge\scribe\fidelity` (fidelity_<view>.png: art, model, overlay; delta_<view>.png: where colour is lost, green to red by ΔE, shape misses in red (art only) and blue (model only); parts_<view>.png: each art part tinted, the model's outlined).
