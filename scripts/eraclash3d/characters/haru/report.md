# Haru: Forge report

2026-11-12 23:02 · spec `scripts/eraclash3d/characters/haru/forge.json` · character `public/games/era-clash/3d/assets/characters/samurai_v3.glb` · kit `public/games/era-clash/3d/assets/props/haru`

## Against the gates

| Gate | Target | Now | |
|---|---|---|---|
| Overall (shape and colour, every view) | 95% | 72.7% | **22 short** |
| Head (outline overlap, mean of views) | 85% | 79.3% | **6 short** |
| Every part (overlap with the art's own part) | 80% | weakest sword 30.0% | **50 short** |

## By view

| View | Shape | Colour | Head IoU | Torso IoU | Legs IoU |
|---|---|---|---|---|---|
| front | 76.9% | 68.3% | 0.81 | 0.855 | 0.813 |
| side | 74.5% | 69.2% | 0.779 | 0.884 | 0.79 |
| back | 76.1% | 71.4% | 0.79 | 0.848 | 0.816 |

## By part (weakest first)

| Part | IoU | Front / side / back | Colour ΔE | Gate |
|---|---|---|---|---|
| sword | 30.0% | ? / 27 / 33 | 18.2 | **50 short** |
| obi | 50.1% | 61 / 40 / 44 | 4.2 | **30 short** |
| arms | 51.8% | 54 / 31 / 57 | 8.5 | **28 short** |
| hakama | 56.0% | 56 / 59 / 55 | 2.4 | **24 short** |
| feet | 60.1% | 61 / 59 / – | 4.5 | **20 short** |
| do | 66.3% | 67 / 52 / 70 | 16.0 | **14 short** |
| shins | 68.4% | 63 / 66 / 74 | 3.1 | **12 short** |
| kusazuri | 68.5% | 76 / 35 / 71 | 4.7 | **12 short** |
| sode | 70.5% | 42 / 82 / 46 | 6.9 | **10 short** |
| head | 74.0% | 80 / 69 / 75 | 13.9 | **6 short** |

Images: `D:\Plajah Runtime\eraclash3d\forge\haru\fidelity` (fidelity_<view>.png: art, model, overlay; parts_<view>.png: each art part tinted, the model's outlined).
