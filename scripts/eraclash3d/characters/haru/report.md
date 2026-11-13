# Haru: Forge report

2026-11-13 02:22 · spec `scripts/eraclash3d/characters/haru/forge.json` · character `public/games/era-clash/3d/assets/characters/samurai_v3.glb` · kit `public/games/era-clash/3d/assets/props/haru`

## Against the gates

| Gate | Target | Now | |
|---|---|---|---|
| Overall (shape and colour, every view) | 95% | 83.7% | **11 short** |
| Head (outline overlap, mean of views) | 85% | 85.7% | pass |
| Every part (overlap with the art's own part) | 80% | weakest sword 28.1% | **52 short** |

## By view

| View | Shape | Colour | Head IoU | Torso IoU | Legs IoU |
|---|---|---|---|---|---|
| front | 84.9% | 83.5% | 0.9 | 0.896 | 0.853 |
| side | 76.0% | 86.0% | 0.788 | 0.878 | 0.805 |
| back | 84.3% | 87.8% | 0.882 | 0.892 | 0.856 |

## By part (weakest first)

| Part | IoU | Front / side / back | Colour ΔE | Gate |
|---|---|---|---|---|
| sword | 28.1% | 31 / 21 / 32 | 23.6 | **52 short** |
| arms | 50.2% | 53 / 44 / 50 | 3.3 | **30 short** |
| obi | 54.8% | 40 / 43 / 73 | 4.6 | **25 short** |
| feet | 55.4% | 57 / 54 / – | 4.3 | **25 short** |
| kusazuri | 64.8% | 66 / 64 / 64 | 5.9 | **15 short** |
| do | 70.1% | 66 / 63 / 76 | 8.6 | **10 short** |
| sode | 72.5% | 44 / 85 / 48 | 7.2 | **8 short** |
| shins | 72.8% | 69 / 67 / 79 | 3.5 | **7 short** |
| hakama | 73.6% | 76 / 68 / 74 | 2.5 | **6 short** |
| head | 78.1% | 84 / 75 / 78 | 8.8 | **2 short** |

Images: `D:\Plajah Runtime\eraclash3d\forge\haru\fidelity` (fidelity_<view>.png: art, model, overlay; delta_<view>.png: where colour is lost, green to red by ΔE, shape misses in red (art only) and blue (model only); parts_<view>.png: each art part tinted, the model's outlined).
