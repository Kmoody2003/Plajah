# Tolo: Character Forge (Colab GPU) report

2026-11-27 01:14 · character `public/games/lexicon/assets/characters/tolo.glb` · role: Blacksmith apprentice · height 1.74 m (adult)

## Against the 95% gate

| Gate | Target | Now | Status |
|---|---|---|---|
| Overall (front / true side / back) | 95% | 89.4% | **5.6 short** |
| 58-joint Forge rig 3-pose stretch (p99.5 / max) | < 3.0x | 1.76x / 3.96x | 8 tris > 3x |

## By view

| View | Silhouette IoU | Colour | Score (0.6 IoU + 0.4 colour) |
|---|---|---|---|
| front (front) | 91.6% | 96.6% | 93.6% |
| side (right) | 78.0% | 93.8% | 84.3% |
| back (back) | 87.0% | 95.3% | 90.3% |

Delta images: `D:\Plajah Runtime\eraclash3d\forge\lexicon-colab-out\tolo\score_three` (`front_delta.png`, `side_delta.png`, `back_delta.png`).
