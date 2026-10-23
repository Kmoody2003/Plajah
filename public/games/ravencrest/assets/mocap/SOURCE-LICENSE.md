---
license: other
license_name: cmu-mocap
language:
- en
tags:
- motion-capture
- animation
- 3d
- fbx
- skeleton
- human-motion
- robotics
size_categories:
- 1K<n<10K
---

# CMU Motion Capture Library — FBX Format

A large-scale library of **2,548 human motion capture animations** in `.fbx` format, organized by subject/motion number. This dataset is derived from the [CMU Graphics Lab Motion Capture Database](http://mocap.cs.cmu.edu) and is intended for use in robotics, computer animation, game development, and machine learning research involving human motion.

> **Source page:** [https://rancidmilk.itch.io/free-character-animations](https://rancidmilk.itch.io/free-character-animations)

---

## Dataset Summary

This dataset contains over 2,500 human full-body skeletal animations covering a wide range of everyday and athletic motions (walking, running, jumping, crouching, etc.). The animations were originally recorded as optical motion capture data at Carnegie Mellon University, then converted from `.bvh` format to `.fbx` using Blender by [RancidMilk](https://rancidmilk.itch.io) via BVH files sourced from [cgspeed.com](https://sites.google.com/a/cgspeed.com/cgspeed/manifesto).

The animations are stored as bones-only armatures (no mesh). They include root motion and do **not** have finger animations.

---

## Dataset Structure

Files are organized into folders by subject-number range, and named using the convention `{subject}_{motion}.fbx`:

```
animations/
├── 01-09_V1/
│   └── 01-09_V1/
│       ├── 01_01.fbx   # Subject 01, Motion 01
│       ├── 01_02.fbx
│       └── ...
├── 10-14_V1/
├── 15-19_V1/
├── 20-29_V1/
├── 30-34_V1/
├── 35-39_V1/
├── 40-45_V1/
├── 46-56_V1/
├── 60-75_V1/
├── 76-80_V1/
├── 81-85_V1/
├── 86-94_V1/
├── 102-111_V1/
├── 113-128_V1/
├── 131-135_V1/
├── 136-140_V1/
└── 141-144_V1/
```

| Property | Value |
|---|---|
| Total files | 2,548 `.fbx` files |
| Format | FBX (Filmbox), importable in Blender, Unreal Engine, Unity, Godot |
| Skeleton | Bones-only armature (no mesh) |
| Root motion | Yes (not in-place) |
| Finger animations | No |
| Version | V1_01 |

### Metadata labels

- `metadata.csv` is the only label file and contains one row per clip.
- Columns are: `file_name`, `clip_id`, `subject_id`, `motion_id`, `label`.

### File naming convention

Each file is named `{SS}_{MM}.fbx` where:
- `SS` — zero-padded subject number (e.g. `01`, `86`)
- `MM` — zero-padded motion trial number within that subject (e.g. `01`, `12`)

An index of animation contents (i.e. what action each subject/motion number corresponds to) is available from [cgspeed.com](https://sites.google.com/a/cgspeed.com/cgspeed/manifesto) and was originally published alongside the CMU database.

---

## Source Data

### Original data

The motion capture recordings were produced by the **CMU Graphics Lab** and are freely available at [http://mocap.cs.cmu.edu](http://mocap.cs.cmu.edu). The database was created with funding from **NSF EIA-0196217**.

### BVH conversion

The `.bvh` intermediate files used for this conversion were sourced from [cgspeed.com](https://sites.google.com/a/cgspeed.com/cgspeed/manifesto), where Bruce (cgspeed) converted the original CMU data to BVH format with no additional restrictions.

### FBX conversion

[RancidMilk](https://rancidmilk.itch.io) converted the BVH files to `.fbx` using [Blender](https://www.blender.org/) and the [Auto-Rig Pro](https://blendermarket.com/products/auto-rig-pro) add-on for re-targeting onto a CC0 character model by [Quaternius](https://quaternius.com). This dataset distributes the **Anims_Only FBX** variant (bones/armature only, no character mesh), which results in a smaller file size.

---

## Usage Notes

### Loading in Blender

Use **File → Import → FBX** (not File → Open). The armature will appear as a bones-only rig.

---

## License

### Animations

The animations follow the CMU Motion Capture Database terms of use:

> "The motion capture data may be copied, modified, or redistributed without permission."
> — [http://mocap.cs.cmu.edu/faqs.php](http://mocap.cs.cmu.edu/faqs.php)

> "You may include this data in commercially-sold products, but you may not resell this data directly, even in converted form."
> — [http://mocap.cs.cmu.edu](http://mocap.cs.cmu.edu)

**In short:** Free to use, modify, and redistribute — including in commercial products — as long as you do not sell the animations themselves (even as conversions). If you redistribute them, you should make these same terms clear to recipients and credit **mocap.cs.cmu.edu**.

### Attribution

If you publish results using this data, please include the following acknowledgement:

> "The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217."

---

## Acknowledgements

| Source | Role | Link |
|---|---|---|
| CMU Graphics Lab | Original motion capture recordings | [http://mocap.cs.cmu.edu](http://mocap.cs.cmu.edu) |
| cgspeed (Bruce) | BVH conversion of CMU data | [cgspeed.com](https://sites.google.com/a/cgspeed.com/cgspeed/manifesto) |
| RancidMilk | BVH → FBX conversion via Blender | [itch.io](https://rancidmilk.itch.io/free-character-animations) |
| Quaternius | CC0 character model used for re-targeting | [quaternius.com](https://quaternius.com) |

> This dataset re-distributes data originally published by the parties above. None of these parties necessarily endorse this distribution.