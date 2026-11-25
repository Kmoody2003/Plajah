"""Colab GPU 360° Hunyuan3D-Paint runner (executed inside Colab via exec() from Cell 5)."""
import gc
import glob
import json
import os
import subprocess
import sys
import time
import zipfile
import numpy as np
import torch
import trimesh
from PIL import Image
from google.colab import files

IN_DIR = "/content/titans_paint_in"
OUT_DIR = "/content/titans_paint_out"
os.makedirs(OUT_DIR, exist_ok=True)

subprocess.run([sys.executable, "-m", "pip", "install", "-q", "xatlas", "ninja", "pybind11"], check=True)
if "/content/Hunyuan3D-2" not in sys.path:
    sys.path.insert(0, "/content/Hunyuan3D-2")

try:
    import custom_rasterizer  # noqa: F401
    print("custom_rasterizer already installed.", flush=True)
except ImportError:
    print("Building custom_rasterizer (CUDA)...", flush=True)
    cr_dir = "/content/Hunyuan3D-2/hy3dgen/texgen/custom_rasterizer"
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "--no-build-isolation", "-e", cr_dir], check=True)
    import importlib, site
    if cr_dir not in sys.path:
        sys.path.insert(0, cr_dir)
    for sp in site.getsitepackages():
        site.addsitedir(sp)
    importlib.invalidate_caches()
    import custom_rasterizer  # noqa: F401
    print("custom_rasterizer loaded OK!", flush=True)

dr_dir = "/content/Hunyuan3D-2/hy3dgen/texgen/differentiable_renderer"
if not glob.glob(os.path.join(dr_dir, "mesh_processor*.so")):
    print("Building differentiable_renderer mesh_processor (C++)...", flush=True)
    subprocess.run([sys.executable, "setup.py", "build_ext", "--inplace"], cwd=dr_dir, check=True)

if "_HY3D_PIPE" in globals():
    del globals()["_HY3D_PIPE"]
    globals().pop("_HY3D_SUBFOLDER", None)
    gc.collect()
    torch.cuda.empty_cache()

# Patch diffusers >= 0.32 trust_remote_code requirement on local hunyuanpaint custom pipeline
mv_path = "/content/Hunyuan3D-2/hy3dgen/texgen/utils/multiview_utils.py"
mv_src = open(mv_path, "r", encoding="utf-8").read()
if "trust_remote_code" not in mv_src:
    open(mv_path, "w", encoding="utf-8").write(
        mv_src.replace("torch_dtype=torch.float16)", "torch_dtype=torch.float16, trust_remote_code=True)")
    )
for k in [k for k in list(sys.modules) if k.startswith("hy3dgen.texgen")]:
    del sys.modules[k]

from hy3dgen.texgen import Hunyuan3DPaintPipeline  # noqa: E402

if "_HY3D_PAINT" not in globals():
    print("Loading Hunyuan3DPaintPipeline...", flush=True)
    t0 = time.time()
    try:
        _HY3D_PAINT = Hunyuan3DPaintPipeline.from_pretrained("tencent/Hunyuan3D-2", subfolder="hunyuan3d-paint-v2-0-turbo")
    except Exception as e:
        print("Turbo paint fallback -> hunyuan3d-paint-v2-0:", e, flush=True)
        _HY3D_PAINT = Hunyuan3DPaintPipeline.from_pretrained("tencent/Hunyuan3D-2", subfolder="hunyuan3d-paint-v2-0")
    print(f"Hunyuan3DPaintPipeline loaded in {time.time() - t0:.1f}s", flush=True)

manifest = json.load(open(os.path.join(IN_DIR, "manifest.json"), "r", encoding="utf-8"))
items = manifest["items"]
print(f"Painting {len(items)} Titan Bosses in 360° 2048x2048...", flush=True)

for item in items:
    cid = item["id"]
    c_out = os.path.join(OUT_DIR, cid)
    os.makedirs(c_out, exist_ok=True)
    out_glb = os.path.join(c_out, "painted_360.glb")
    if os.path.isfile(out_glb):
        print(f"[{cid}] Cached painted_360.glb, skipping.", flush=True)
        continue
    t0 = time.time()
    mesh = trimesh.load(os.path.join(IN_DIR, cid, item["mesh"]), force="mesh")
    if isinstance(mesh, trimesh.Scene):
        mesh = mesh.dump(concatenate=True)
    img = Image.open(os.path.join(IN_DIR, cid, item["image"])).convert("RGBA")
    textured = _HY3D_PAINT(mesh, image=img)
    textured.export(out_glb)
    print(f"[{cid}] 360° painted in {time.time() - t0:.1f}s -> {os.path.getsize(out_glb) / 1e6:.2f} MB", flush=True)
    gc.collect()
    torch.cuda.empty_cache()

ZIP_OUT = "/content/batch_titans_painted.zip"
with zipfile.ZipFile(ZIP_OUT, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for root, _, fnames in os.walk(OUT_DIR):
        for fn in sorted(fnames):
            full = os.path.join(root, fn)
            zf.write(full, os.path.relpath(full, OUT_DIR))
print(f"READY: {ZIP_OUT} ({os.path.getsize(ZIP_OUT) / 1e6:.2f} MB)", flush=True)
files.download(ZIP_OUT)
