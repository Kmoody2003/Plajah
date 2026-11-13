# Haru: Forge report

2026-11-13 01:36 · spec `scripts/eraclash3d/characters/haru/forge.json` · character `public/games/era-clash/3d/assets/characters/samurai_v3.glb` · kit `public/games/era-clash/3d/assets/props/haru`

## Against the gates

| Gate | Target | Now | |
|---|---|---|---|
| Overall (shape and colour, every view) | 95% | 83.6% | **11 short** |
| Head (outline overlap, mean of views) | 85% | 86.2% | pass |
| Every part (overlap with the art's own part) | 80% | weakest sword 29.4% | **51 short** |

## By view

| View | Shape | Colour | Head IoU | Torso IoU | Legs IoU |
|---|---|---|---|---|---|
| front | 84.2% | 82.5% | 0.898 | 0.878 | 0.868 |
| side | 76.8% | 87.8% | 0.798 | 0.895 | 0.81 |
| back | 84.0% | 86.4% | 0.889 | 0.87 | 0.87 |

## By part (weakest first)

| Part | IoU | Front / side / back | Colour ΔE | Gate |
|---|---|---|---|---|
| sword | 29.4% | 25 / 27 / 36 | 16.2 | **51 short** |
| arms | 51.9% | 51 / 39 / 56 | 4.0 | **28 short** |
| obi | 53.4% | 59 / 38 / 57 | 4.1 | **27 short** |
| feet | 58.8% | 56 / 62 / – | 4.4 | **21 short** |
| do | 69.7% | 69 / 57 / 75 | 10.1 | **10 short** |
| kusazuri | 72.2% | 75 / 55 / 77 | 5.0 | **8 short** |
| sode | 72.3% | 45 / 85 / 48 | 7.3 | **8 short** |
| shins | 73.3% | 69 / 68 / 79 | 3.2 | **7 short** |
| hakama | 75.5% | 79 / 66 / 77 | 2.6 | **5 short** |
| head | 76.4% | 80 / 71 / 80 | 8.8 | **4 short** |

Images: `D:\Plajah Runtime\eraclash3d\forge\haru\fidelity` (fidelity_<view>.png: art, model, overlay; delta_<view>.png: where colour is lost, green to red by ΔE, shape misses in red (art only) and blue (model only); parts_<view>.png: each art part tinted, the model's outlined).
