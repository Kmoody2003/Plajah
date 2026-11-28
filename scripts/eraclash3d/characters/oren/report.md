# Oren: Character Forge (Colab GPU) report

2026-11-27 01:15 · character `public/games/lexicon/assets/characters/oren.glb` · role: Archivist & historian · height 1.72 m (elder)

## Against the 95% gate

| Gate | Target | Now | Status |
|---|---|---|---|
| Overall (front / true side / back) | 95% | 91.9% | **3.1 short** |
| 58-joint Forge rig 3-pose stretch (p99.5 / max) | < 3.0x | 1.91x / 3.63x | 19 tris > 3x |

## By view

| View | Silhouette IoU | Colour | Score (0.6 IoU + 0.4 colour) |
|---|---|---|---|
| front (front) | 91.6% | 97.9% | 94.1% |
| side (left) | 89.7% | 96.0% | 92.2% |
| back (back) | 85.8% | 95.1% | 89.5% |

Delta images: `D:\Plajah Runtime\eraclash3d\forge\lexicon-colab-out\oren\score_three` (`front_delta.png`, `side_delta.png`, `back_delta.png`).
