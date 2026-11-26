# Pip: Character Forge (Colab GPU) report

2026-11-25 23:12 · character `public/games/lexicon/assets/characters/pip.glb` · role: Curious young villager · height 1.18 m (child)

## Against the 95% gate

| Gate | Target | Now | Status |
|---|---|---|---|
| Overall (front / true side / back) | 95% | 95.6% | pass |
| 58-joint Forge rig 3-pose stretch (p99.5 / max) | < 3.0x | 1.57x / 3.76x | 5 tris > 3x |

## By view

| View | Silhouette IoU | Colour | Score (0.6 IoU + 0.4 colour) |
|---|---|---|---|
| front (front) | 96.1% | 97.8% | 96.8% |
| side (right) | 95.8% | 96.4% | 96.1% |
| back (back) | 91.8% | 96.9% | 93.8% |

Delta images: `D:\Plajah Runtime\eraclash3d\forge\lexicon-colab-out\pip\score_three` (`front_delta.png`, `side_delta.png`, `back_delta.png`).
