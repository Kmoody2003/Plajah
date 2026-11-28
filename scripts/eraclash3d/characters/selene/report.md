# Selene: Character Forge (Colab GPU) report

2026-11-27 01:18 · character `public/games/lexicon/assets/characters/selene.glb` · role: Master village weaver · height 1.65 m (adult)

## Against the 95% gate

| Gate | Target | Now | Status |
|---|---|---|---|
| Overall (front / true side / back) | 95% | 93.6% | **1.4 short** |
| 58-joint Forge rig 3-pose stretch (p99.5 / max) | < 3.0x | 3.01x / 4.78x | 294 tris > 3x |

## By view

| View | Silhouette IoU | Colour | Score (0.6 IoU + 0.4 colour) |
|---|---|---|---|
| front (front) | 94.1% | 97.7% | 95.5% |
| side (right) | 92.6% | 95.6% | 93.8% |
| back (back) | 88.1% | 96.4% | 91.4% |

Delta images: `D:\Plajah Runtime\eraclash3d\forge\lexicon-colab-out\selene\score_three` (`front_delta.png`, `side_delta.png`, `back_delta.png`).
