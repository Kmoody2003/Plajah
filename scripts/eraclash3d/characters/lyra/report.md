# Lyra: Character Forge (Colab GPU) report

2026-11-25 23:16 · character `public/games/lexicon/assets/characters/lyra.glb` · role: Town bard · height 1.66 m (adult)

## Against the 95% gate

| Gate | Target | Now | Status |
|---|---|---|---|
| Overall (front / true side / back) | 95% | 90.4% | **4.6 short** |
| 58-joint Forge rig 3-pose stretch (p99.5 / max) | < 3.0x | 1.89x / 6.84x | 30 tris > 3x |

## By view

| View | Silhouette IoU | Colour | Score (0.6 IoU + 0.4 colour) |
|---|---|---|---|
| front (front) | 90.8% | 96.6% | 93.1% |
| side (right) | 89.6% | 97.2% | 92.6% |
| back (back) | 79.2% | 94.5% | 85.4% |

Delta images: `D:\Plajah Runtime\eraclash3d\forge\lexicon-colab-out\lyra\score_three` (`front_delta.png`, `side_delta.png`, `back_delta.png`).
