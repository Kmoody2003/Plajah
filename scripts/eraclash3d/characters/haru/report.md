# Haru: Forge report

2026-11-13 04:28 · spec `scripts/eraclash3d/characters/haru/forge.json` · character `public/games/era-clash/3d/assets/characters/samurai_v3.glb` · kit `public/games/era-clash/3d/assets/props/haru`

## Against the gates

| Gate | Target | Now | |
|---|---|---|---|
| Overall (shape and colour, every view) | 95% | 83.8% | **11 short** |
| Head (outline overlap, mean of views) | 85% | 85.9% | pass |
| Every part (overlap with the art's own part) | 80% | weakest sword 27.6% | **52 short** |

## By view

| View | Shape | Colour | Head IoU | Torso IoU | Legs IoU |
|---|---|---|---|---|---|
| front | 84.5% | 83.0% | 0.9 | 0.879 | 0.864 |
| side | 76.1% | 86.5% | 0.788 | 0.878 | 0.81 |
| back | 84.2% | 88.3% | 0.889 | 0.873 | 0.865 |

## By part (weakest first)

| Part | IoU | Front / side / back | Colour ΔE | Gate |
|---|---|---|---|---|
| sword | 27.6% | 29 / 21 / 34 | 23.1 | **52 short** |
| arms | 53.2% | 49 / 68 / 50 | 3.2 | **27 short** |
| feet | 56.2% | 59 / 52 / – | 4.4 | **24 short** |
| obi | 56.6% | 41 / 42 / 76 | 4.9 | **23 short** |
| kusazuri | 65.6% | 67 / 59 / 67 | 5.9 | **14 short** |
| sode | 71.8% | 44 / 84 / 48 | 7.4 | **8 short** |
| do | 72.6% | 67 / 68 / 79 | 8.6 | **7 short** |
| shins | 73.7% | 72 / 67 / 79 | 3.5 | **6 short** |
| hakama | 74.1% | 76 / 70 / 75 | 2.6 | **6 short** |
| head | 76.8% | 81 / 75 / 76 | 8.8 | **3 short** |

Images: `D:\Plajah Runtime\eraclash3d\forge\haru\fidelity` (fidelity_<view>.png: art, model, overlay; delta_<view>.png: where colour is lost, green to red by ΔE, shape misses in red (art only) and blue (model only); parts_<view>.png: each art part tinted, the model's outlined).
