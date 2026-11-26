# Nico: Character Forge (Colab GPU) report

2026-11-25 23:14 · character `public/games/lexicon/assets/characters/nico.glb` · role: Village messenger · height 1.48 m (youth)

## Against the 95% gate

| Gate | Target | Now | Status |
|---|---|---|---|
| Overall (front / true side / back) | 95% | 92.6% | **2.4 short** |
| 58-joint Forge rig 3-pose stretch (p99.5 / max) | < 3.0x | 1.82x / 3.76x | 4 tris > 3x |

## By view

| View | Silhouette IoU | Colour | Score (0.6 IoU + 0.4 colour) |
|---|---|---|---|
| front (front) | 93.9% | 97.6% | 95.4% |
| side (right) | 95.8% | 96.1% | 95.9% |
| back (back) | 82.7% | 92.3% | 86.5% |

Delta images: `D:\Plajah Runtime\eraclash3d\forge\lexicon-colab-out\nico\score_three` (`front_delta.png`, `side_delta.png`, `back_delta.png`).
