# Oren: Character Forge (Colab GPU) report

2026-11-25 23:12 · character `public/games/lexicon/assets/characters/oren.glb` · role: Archivist & historian · height 1.72 m (elder)

## Against the 95% gate

| Gate | Target | Now | Status |
|---|---|---|---|
| Overall (front / true side / back) | 95% | 93.4% | **1.6 short** |
| 58-joint Forge rig 3-pose stretch (p99.5 / max) | < 3.0x | 1.71x / 3.57x | 11 tris > 3x |

## By view

| View | Silhouette IoU | Colour | Score (0.6 IoU + 0.4 colour) |
|---|---|---|---|
| front (front) | 96.1% | 96.9% | 96.4% |
| side (left) | 92.6% | 96.1% | 94.0% |
| back (back) | 86.1% | 95.4% | 89.8% |

Delta images: `D:\Plajah Runtime\eraclash3d\forge\lexicon-colab-out\oren\score_three` (`front_delta.png`, `side_delta.png`, `back_delta.png`).
