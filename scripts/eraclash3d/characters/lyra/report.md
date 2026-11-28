# Lyra: Character Forge (Colab GPU) report

2026-11-27 01:19 · character `public/games/lexicon/assets/characters/lyra.glb` · role: Town bard · height 1.66 m (adult)

## Against the 95% gate

| Gate | Target | Now | Status |
|---|---|---|---|
| Overall (front / true side / back) | 95% | 87.9% | **7.1 short** |
| 58-joint Forge rig 3-pose stretch (p99.5 / max) | < 3.0x | 1.95x / 5.42x | 20 tris > 3x |

## By view

| View | Silhouette IoU | Colour | Score (0.6 IoU + 0.4 colour) |
|---|---|---|---|
| front (front) | 84.8% | 97.8% | 90.0% |
| side (right) | 75.7% | 96.2% | 83.9% |
| back (back) | 84.7% | 97.2% | 89.7% |

Delta images: `D:\Plajah Runtime\eraclash3d\forge\lexicon-colab-out\lyra\score_three` (`front_delta.png`, `side_delta.png`, `back_delta.png`).
