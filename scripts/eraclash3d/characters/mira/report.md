# Elder Mira: Character Forge (Colab GPU) report

2026-11-27 01:13 · character `public/games/lexicon/assets/characters/mira.glb` · role: Town matriarch & chronicler · height 1.62 m (elder)

## Against the 95% gate

| Gate | Target | Now | Status |
|---|---|---|---|
| Overall (front / true side / back) | 95% | 91.8% | **3.2 short** |
| 58-joint Forge rig 3-pose stretch (p99.5 / max) | < 3.0x | 3.09x / 7.62x | 328 tris > 3x |

## By view

| View | Silhouette IoU | Colour | Score (0.6 IoU + 0.4 colour) |
|---|---|---|---|
| front (front) | 92.8% | 97.7% | 94.8% |
| side (right) | 84.8% | 96.3% | 89.4% |
| back (back) | 86.9% | 97.9% | 91.3% |

Delta images: `D:\Plajah Runtime\eraclash3d\forge\lexicon-colab-out\mira\score_three` (`front_delta.png`, `side_delta.png`, `back_delta.png`).
