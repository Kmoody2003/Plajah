"""
uv_atlas.py: unique UV atlases for many meshes in one call (xatlas), for painting them from art.

  python uv_atlas.py jobs.json

jobs.json: [{"positions": "a.f32", "indices": "a.u32", "out": "a", "resolution": 1024}, ...]. Positions are raw
float32 xyz, indices raw uint32. Each job writes <out>.vmap.u32 (new vertex -> original vertex), <out>.idx.u32 and
<out>.uv.f32 (0..1), so every other attribute of the mesh is carried over by index: nothing about the mesh is lost.
"""
import json
import sys

import numpy as np
import xatlas

for job in json.load(open(sys.argv[1])):
    pos = np.fromfile(job["positions"], dtype=np.float32).reshape(-1, 3)
    idx = np.fromfile(job["indices"], dtype=np.uint32).reshape(-1, 3)
    atlas = xatlas.Atlas()
    atlas.add_mesh(pos, idx)
    pack = xatlas.PackOptions()
    pack.resolution = int(job.get("resolution", 1024))
    pack.padding = 4
    pack.bilinear = True
    atlas.generate(pack_options=pack)
    vmapping, indices, uvs = atlas[0]
    vmapping.astype(np.uint32).tofile(job["out"] + ".vmap.u32")
    indices.astype(np.uint32).tofile(job["out"] + ".idx.u32")
    uvs.astype(np.float32).tofile(job["out"] + ".uv.f32")
    print(f"{job['out']}: {len(pos)} -> {len(vmapping)} verts, {atlas.width}x{atlas.height}", flush=True)
