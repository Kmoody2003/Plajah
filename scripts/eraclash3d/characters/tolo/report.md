# Tolo: Character Forge (Colab GPU) report

2026-11-25 23:12 · character `public/games/lexicon/assets/characters/tolo.glb` · role: Blacksmith apprentice · height 1.74 m (adult)

## Against the 95% gate

| Gate | Target | Now | Status |
|---|---|---|---|
| Overall (front / true side / back) | 95% | 92.6% | **2.4 short** |
| 58-joint Forge rig 3-pose stretch (p99.5 / max) | < 3.0x | 1.65x / 2.56x | 0 tris > 3x |

## By view

| View | Silhouette IoU | Colour | Score (0.6 IoU + 0.4 colour) |
|---|---|---|---|
| front (front) | 96.1% | 97.7% | 96.7% |
| side (right) | 89.8% | 95.5% | 92.1% |
| back (back) | 84.9% | 95.2% | 89.0% |

Delta images: `D:\Plajah Runtime\eraclash3d\forge\lexicon-colab-out\tolo\score_three` (`front_delta.png`, `side_delta.png`, `back_delta.png`).
