# The Scribe: Forge report

2026-11-25 07:39 · spec `scripts/eraclash3d/characters/scribe/forge.json` · character `public/games/lexicon/assets/characters/scribe.glb` · kit `D:/Plajah Runtime/eraclash3d/forge/scribe/kit`

## Against the gates

| Gate | Target | Now | |
|---|---|---|---|
| Overall (shape and colour, every view) | 95% | 71.9% | **23 short** |
| Head (outline overlap, mean of views) | 85% | 66.8% | **18 short** |
| Every part (overlap with the art's own part) | 80% | weakest staff 31.7% | **48 short** |

## By view

| View | Shape | Colour | Head IoU | Torso IoU | Legs IoU |
|---|---|---|---|---|---|
| front | 70.5% | 79.9% | 0.703 | 0.89 | 0.786 |
| side | 47.5% | 85.8% | 0.595 | 0.751 | 0.628 |
| back | 66.3% | 81.6% | 0.707 | 0.842 | 0.703 |

## By part (weakest first)

| Part | IoU | Front / side / back | Colour ΔE | Gate |
|---|---|---|---|---|
| staff | 31.7% | 29 / – / 36 | 21.1 | **48 short** |
| legs | 33.6% | 34 / – / – | 1.5 | **46 short** |
| arms | 38.7% | 47 / 34 / 36 | 4.3 | **41 short** |
| pack | 51.9% | ? / 22 / 54 | 2.3 | **28 short** |
| skirt | 57.2% | 57 / ? / – | 1.8 | **23 short** |
| cloak | 58.5% | 28 / ? / 65 | 2.5 | **22 short** |
| boots | 61.0% | 60 / 59 / 64 | 2.3 | **19 short** |
| jerkin | 61.4% | 66 / 38 / 31 | 2.4 | **19 short** |
| belt | 61.7% | 62 / ? / – | 2.8 | **18 short** |
| head | 75.0% | 74 / 72 / 79 | 9.3 | **5 short** |

Images: `D:\Plajah Runtime\eraclash3d\forge\scribe\fidelity` (fidelity_<view>.png: art, model, overlay; delta_<view>.png: where colour is lost, green to red by ΔE, shape misses in red (art only) and blue (model only); parts_<view>.png: each art part tinted, the model's outlined).
