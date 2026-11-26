# Selene: Character Forge (Colab GPU) report

2026-11-25 23:15 · character `public/games/lexicon/assets/characters/selene.glb` · role: Master village weaver · height 1.65 m (adult)

## Against the 95% gate

| Gate | Target | Now | Status |
|---|---|---|---|
| Overall (front / true side / back) | 95% | 94.3% | **0.7 short** |
| 58-joint Forge rig 3-pose stretch (p99.5 / max) | < 3.0x | 3.07x / 4.57x | 324 tris > 3x |

## By view

| View | Silhouette IoU | Colour | Score (0.6 IoU + 0.4 colour) |
|---|---|---|---|
| front (front) | 95.9% | 97.7% | 96.6% |
| side (right) | 95.9% | 95.9% | 95.9% |
| back (back) | 86.3% | 96.5% | 90.4% |

Delta images: `D:\Plajah Runtime\eraclash3d\forge\lexicon-colab-out\selene\score_three` (`front_delta.png`, `side_delta.png`, `back_delta.png`).
