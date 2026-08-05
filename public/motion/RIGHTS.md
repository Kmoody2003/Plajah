# Motion Lab — capture data rights

Everything in this folder is **cleared for commercial use** and ships publicly.

- `cmu_*.bvh` — CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu),
  BVH conversion by B. Hahne (cgspeed). Free for any use, including commercial.
  Required credit, rendered in the Motion Lab UI:
  "Data from mocap.cs.cmu.edu (funded by NSF EIA-0196217)".

## Deliberately NOT in this folder

`umons_taichi_sample.txt` — one segmented Kinect V2 sequence from UMONS-TAICHI
(numediart / Université de Mons; Zenodo record 2784581), **CC BY-NC-SA 4.0**.

The non-commercial clause is not something a commercial platform can satisfy,
and anything under `public/` is publicly downloadable — which would be
redistribution, not fair display. So the file lives outside the deployed tree,
in `acquisitions/motion/` (git-ignored), and the Motion Lab filters the clip out
of public builds via `SHOW_NC_PREVIEW` in `components/CombatAtlasView.tsx`.

To restore it for local research use: set `SHOW_NC_PREVIEW = true` and copy the
file back into this folder. Do not commit it, and do not deploy with the flag on.

Permission has been drafted but not yet requested — see
`docs/outreach/01-umons-taichi-licence-request.md`. If the authors grant terms,
revisit both the flag and this note.
