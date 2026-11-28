# Pip: Character Forge (Colab GPU) report

2026-11-27 01:14 · character `public/games/lexicon/assets/characters/pip.glb` · role: Curious young villager · height 1.18 m (child)

## Against the 95% gate

| Gate | Target | Now | Status |
|---|---|---|---|
| Overall (front / true side / back) | 95% | 94.4% | **0.6 short** |
| 58-joint Forge rig 3-pose stretch (p99.5 / max) | < 3.0x | 1.72x / 3.58x | 8 tris > 3x |

## By view

| View | Silhouette IoU | Colour | Score (0.6 IoU + 0.4 colour) |
|---|---|---|---|
| front (front) | 93.2% | 97.5% | 94.9% |
| side (right) | 92.2% | 96.4% | 93.9% |
| back (back) | 93.0% | 96.9% | 94.5% |

Delta images: `D:\Plajah Runtime\eraclash3d\forge\lexicon-colab-out\pip\score_three` (`front_delta.png`, `side_delta.png`, `back_delta.png`).
