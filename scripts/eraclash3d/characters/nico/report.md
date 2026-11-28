# Nico: Character Forge (Colab GPU) report

2026-11-27 01:17 · character `public/games/lexicon/assets/characters/nico.glb` · role: Village messenger · height 1.48 m (youth)

## Against the 95% gate

| Gate | Target | Now | Status |
|---|---|---|---|
| Overall (front / true side / back) | 95% | 91.3% | **3.7 short** |
| 58-joint Forge rig 3-pose stretch (p99.5 / max) | < 3.0x | 2.03x / 7.92x | 42 tris > 3x |

## By view

| View | Silhouette IoU | Colour | Score (0.6 IoU + 0.4 colour) |
|---|---|---|---|
| front (front) | 88.2% | 97.2% | 91.8% |
| side (right) | 90.9% | 95.0% | 92.5% |
| back (back) | 86.9% | 93.4% | 89.5% |

Delta images: `D:\Plajah Runtime\eraclash3d\forge\lexicon-colab-out\nico\score_three` (`front_delta.png`, `side_delta.png`, `back_delta.png`).
