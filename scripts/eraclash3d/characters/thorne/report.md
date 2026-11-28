# Thorne: Character Forge (Colab GPU) report

2026-11-27 01:15 · character `public/games/lexicon/assets/characters/thorne.glb` · role: Village elder, council of law · height 1.78 m (elder)

## Against the 95% gate

| Gate | Target | Now | Status |
|---|---|---|---|
| Overall (front / true side / back) | 95% | 87.8% | **7.2 short** |
| 58-joint Forge rig 3-pose stretch (p99.5 / max) | < 3.0x | 2.85x / 5.56x | 192 tris > 3x |

## By view

| View | Silhouette IoU | Colour | Score (0.6 IoU + 0.4 colour) |
|---|---|---|---|
| front (front) | 80.2% | 94.6% | 85.9% |
| side (right) | 86.2% | 95.9% | 90.1% |
| back (back) | 81.6% | 96.3% | 87.5% |

Delta images: `D:\Plajah Runtime\eraclash3d\forge\lexicon-colab-out\thorne\score_three` (`front_delta.png`, `side_delta.png`, `back_delta.png`).
