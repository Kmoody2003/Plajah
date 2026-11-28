# Zora: Character Forge (Colab GPU) report

2026-11-27 01:18 · character `public/games/lexicon/assets/characters/zora.glb` · role: Cartographer & astronomer · height 1.67 m (adult)

## Against the 95% gate

| Gate | Target | Now | Status |
|---|---|---|---|
| Overall (front / true side / back) | 95% | 91.4% | **3.6 short** |
| 58-joint Forge rig 3-pose stretch (p99.5 / max) | < 3.0x | 2.02x / 7.44x | 37 tris > 3x |

## By view

| View | Silhouette IoU | Colour | Score (0.6 IoU + 0.4 colour) |
|---|---|---|---|
| front (front) | 92.2% | 97.3% | 94.2% |
| side (right) | 88.9% | 97.0% | 92.1% |
| back (back) | 83.0% | 95.1% | 87.9% |

Delta images: `D:\Plajah Runtime\eraclash3d\forge\lexicon-colab-out\zora\score_three` (`front_delta.png`, `side_delta.png`, `back_delta.png`).
