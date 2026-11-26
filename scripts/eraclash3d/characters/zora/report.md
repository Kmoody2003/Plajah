# Zora: Character Forge (Colab GPU) report

2026-11-25 23:15 · character `public/games/lexicon/assets/characters/zora.glb` · role: Cartographer & astronomer · height 1.67 m (adult)

## Against the 95% gate

| Gate | Target | Now | Status |
|---|---|---|---|
| Overall (front / true side / back) | 95% | 93.1% | **1.9 short** |
| 58-joint Forge rig 3-pose stretch (p99.5 / max) | < 3.0x | 1.87x / 4.76x | 21 tris > 3x |

## By view

| View | Silhouette IoU | Colour | Score (0.6 IoU + 0.4 colour) |
|---|---|---|---|
| front (front) | 96.6% | 97.4% | 96.9% |
| side (right) | 95.0% | 97.9% | 96.2% |
| back (back) | 79.8% | 95.7% | 86.1% |

Delta images: `D:\Plajah Runtime\eraclash3d\forge\lexicon-colab-out\zora\score_three` (`front_delta.png`, `side_delta.png`, `back_delta.png`).
