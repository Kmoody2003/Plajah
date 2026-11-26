# Maya: Character Forge (Colab GPU) report

2026-11-25 23:14 · character `public/games/lexicon/assets/characters/maya.glb` · role: Village alchemist · height 1.58 m (adult)

## Against the 95% gate

| Gate | Target | Now | Status |
|---|---|---|---|
| Overall (front / true side / back) | 95% | 92.9% | **2.1 short** |
| 58-joint Forge rig 3-pose stretch (p99.5 / max) | < 3.0x | 2.00x / 4.17x | 57 tris > 3x |

## By view

| View | Silhouette IoU | Colour | Score (0.6 IoU + 0.4 colour) |
|---|---|---|---|
| front (front) | 95.5% | 97.0% | 96.1% |
| side (right) | 96.4% | 97.1% | 96.7% |
| back (back) | 80.2% | 94.7% | 86.0% |

Delta images: `D:\Plajah Runtime\eraclash3d\forge\lexicon-colab-out\maya\score_three` (`front_delta.png`, `side_delta.png`, `back_delta.png`).
