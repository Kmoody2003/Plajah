# Maya: Character Forge (Colab GPU) report

2026-11-27 01:16 · character `public/games/lexicon/assets/characters/maya.glb` · role: Village alchemist · height 1.58 m (adult)

## Against the 95% gate

| Gate | Target | Now | Status |
|---|---|---|---|
| Overall (front / true side / back) | 95% | 90.7% | **4.3 short** |
| 58-joint Forge rig 3-pose stretch (p99.5 / max) | < 3.0x | 2.02x / 4.78x | 53 tris > 3x |

## By view

| View | Silhouette IoU | Colour | Score (0.6 IoU + 0.4 colour) |
|---|---|---|---|
| front (front) | 88.9% | 96.8% | 92.1% |
| side (right) | 90.5% | 95.9% | 92.6% |
| back (back) | 83.8% | 93.0% | 87.5% |

Delta images: `D:\Plajah Runtime\eraclash3d\forge\lexicon-colab-out\maya\score_three` (`front_delta.png`, `side_delta.png`, `back_delta.png`).
