# Thorne: Character Forge (Colab GPU) report

2026-11-25 23:13 · character `public/games/lexicon/assets/characters/thorne.glb` · role: Village elder, council of law · height 1.78 m (elder)

## Against the 95% gate

| Gate | Target | Now | Status |
|---|---|---|---|
| Overall (front / true side / back) | 95% | 91.2% | **3.8 short** |
| 58-joint Forge rig 3-pose stretch (p99.5 / max) | < 3.0x | 2.51x / 5.01x | 110 tris > 3x |

## By view

| View | Silhouette IoU | Colour | Score (0.6 IoU + 0.4 colour) |
|---|---|---|---|
| front (front) | 85.3% | 97.2% | 90.0% |
| side (right) | 91.9% | 97.1% | 94.0% |
| back (back) | 84.3% | 97.7% | 89.7% |

Delta images: `D:\Plajah Runtime\eraclash3d\forge\lexicon-colab-out\thorne\score_three` (`front_delta.png`, `side_delta.png`, `back_delta.png`).
