# Elder Mira: Character Forge (Colab GPU) report

2026-11-25 23:11 · character `public/games/lexicon/assets/characters/mira.glb` · role: Town matriarch & chronicler · height 1.62 m (elder)

## Against the 95% gate

| Gate | Target | Now | Status |
|---|---|---|---|
| Overall (front / true side / back) | 95% | 94.2% | **0.8 short** |
| 58-joint Forge rig 3-pose stretch (p99.5 / max) | < 3.0x | 2.97x / 6.10x | 260 tris > 3x |

## By view

| View | Silhouette IoU | Colour | Score (0.6 IoU + 0.4 colour) |
|---|---|---|---|
| front (front) | 96.6% | 97.6% | 97.0% |
| side (right) | 95.3% | 96.9% | 96.0% |
| back (back) | 84.9% | 97.0% | 89.7% |

Delta images: `D:\Plajah Runtime\eraclash3d\forge\lexicon-colab-out\mira\score_three` (`front_delta.png`, `side_delta.png`, `back_delta.png`).
