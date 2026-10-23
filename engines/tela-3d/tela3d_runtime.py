"""
Tela 3D Runtime — Plajah's own on-device image-to-3D engine. No ComfyUI, no cloud credits.

Plain PyTorch in its own env (D:\\Plajah Runtime\\tela3d-py), serving image → GLB over HTTP on 127.0.0.1:51124.
The model code is the official open-source repos cloned under D:\\Plajah Runtime\\tela3d-src; the weights live
under D:\\Plajah Models\\hf and are NEVER fetched by this process (HF_HUB_OFFLINE) — they are downloaded on purpose,
one by one, with engines/tela-3d/fetch_weights.py.

Backends (one resident at a time on the 8 GB 4070):
  sf3d          Stable Fast 3D       textured GLB with UVs, ~1-3 s. Stability AI Community License (free < $1M/yr).
  triposr       TripoSR              vertex-coloured mesh, ~1 s. MIT.
  hunyuan_mini  Hunyuan3D-2mini      the most detailed geometry, untextured (its texture painter needs 12+ GB).
                (turbo, shape only)  Tencent Hunyuan Community License: not licensed in the EU, UK or South Korea.

Run:  "D:\\Plajah Runtime\\tela3d-py\\Scripts\\python.exe" engines/tela-3d/tela3d_runtime.py [--port 51124]
"""

import argparse
import base64
import gc
import io
import json
import os
import sys
import threading
import time
import traceback
import types
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

MODELS_ROOT = os.environ.get("PLAJAH_MODELS_ROOT", r"D:\Plajah Models")
HF_ROOT = os.path.join(MODELS_ROOT, "hf")
SRC_ROOT = os.environ.get("TELA3D_SRC", r"D:\Plajah Runtime\tela3d-src")
os.environ.setdefault("U2NET_HOME", os.path.join(MODELS_ROOT, "u2net"))
os.environ.setdefault("HY3DGEN_MODELS", os.path.join(HF_ROOT, "hy3dgen"))
for repo in ("stable-fast-3d", "TripoSR", "Hunyuan3D-2"):
    p = os.path.join(SRC_ROOT, repo)
    if os.path.isdir(p) and p not in sys.path:
        sys.path.insert(0, p)

import numpy as np
import torch
import trimesh
from PIL import Image

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
# Refuse new jobs above this: the laptop has bugchecked under sustained GPU load at 87-89 °C.
MAX_GPU_TEMP_C = int(os.environ.get("TELA3D_MAX_GPU_TEMP", 86))

BACKENDS = {
    "sf3d": {
        "label": "Stable Fast 3D", "dir": "stable-fast-3d", "files": ("config.yaml", "model.safetensors"),
        "textured": True, "license": "Stability AI Community License (free under $1M annual revenue)",
    },
    "triposr": {
        "label": "TripoSR", "dir": "TripoSR", "files": ("config.yaml", "model.ckpt"),
        "textured": True, "license": "MIT",
    },
    "hunyuan_mini": {
        "label": "Hunyuan3D-2mini (shape)", "dir": os.path.join("hy3dgen", "tencent", "Hunyuan3D-2mini", "hunyuan3d-dit-v2-mini-turbo"),
        "files": ("config.yaml", "model.fp16.safetensors"),
        "textured": False, "license": "Tencent Hunyuan Community License (not licensed in the EU, UK or South Korea)",
    },
}
AUTO_ORDER = {"fast": ["sf3d", "triposr", "hunyuan_mini"], "detail": ["hunyuan_mini", "sf3d", "triposr"]}


def backend_dir(bid):
    return os.path.join(HF_ROOT, BACKENDS[bid]["dir"])


def backend_available(bid):
    root = backend_dir(bid)
    # Hunyuan's turbo (FlashVDM) path swaps in its own VAE from a sibling folder.
    vae_ok = bid != "hunyuan_mini" or os.path.isdir(os.path.join(os.path.dirname(root), "hunyuan3d-vae-v2-mini-turbo"))
    return vae_ok and all(os.path.isfile(os.path.join(root, f)) for f in BACKENDS[bid]["files"]) and \
        os.path.isdir(os.path.join(SRC_ROOT, {"sf3d": "stable-fast-3d", "triposr": "TripoSR", "hunyuan_mini": "Hunyuan3D-2"}[bid]))


def rembg_available():
    return os.path.isfile(os.path.join(os.environ["U2NET_HOME"], "u2net.onnx"))


def resolve_backend(requested, quality="fast"):
    rid = str(requested or "auto").lower()
    if rid in BACKENDS:
        if not backend_available(rid):
            raise RuntimeError(f"{BACKENDS[rid]['label']} weights are not installed under {backend_dir(rid)}")
        return rid
    for bid in AUTO_ORDER.get(quality, AUTO_ORDER["fast"]):
        if backend_available(bid):
            return bid
    raise RuntimeError(f"No image-to-3D weights installed under {HF_ROOT} — run engines/tela-3d/fetch_weights.py")


# ── TripoSR wants torchmcubes (a CUDA/CMake build). skimage's marching cubes gives the same surface. ──────────────
def _install_torchmcubes_shim():
    if "torchmcubes" in sys.modules:
        return
    from skimage.measure import marching_cubes as sk_mc

    def marching_cubes(vol, level):
        v, f, _n, _vals = sk_mc(vol.detach().float().cpu().numpy(), level=level)
        # torchmcubes reports (x, y, z) with x along the LAST axis; TripoSR swaps back to index order.
        v = np.ascontiguousarray(v[:, ::-1])
        return torch.from_numpy(v.copy()).float(), torch.from_numpy(f.astype(np.int64))

    mod = types.ModuleType("torchmcubes")
    mod.marching_cubes = marching_cubes
    sys.modules["torchmcubes"] = mod


def _sf3d_offline_encoders():
    """SF3D builds DINOv2 and CLIP from their hub weights, then overwrites them with its own checkpoint (a strict
    load, so every encoder weight is in model.safetensors). Build both empty instead: no 1.8 GB of extra downloads."""
    import open_clip
    from sf3d.models.tokenizers import dinov2
    from transformers.models.dinov2.configuration_dinov2 import Dinov2Config
    if getattr(dinov2.Dinov2Model, "_tela3d_offline", False):
        return
    dinov2.Dinov2Model.from_pretrained = classmethod(lambda cls, name, *a, **k: cls(Dinov2Config.from_pretrained(name)))
    dinov2.Dinov2Model._tela3d_offline = True
    create = open_clip.create_model_and_transforms
    open_clip.create_model_and_transforms = lambda name, *a, **k: create(name, **{**k, "pretrained": None})


_ST_DTYPES = {"F32": torch.float32, "F16": torch.float16, "BF16": torch.bfloat16, "I64": torch.int64,
              "I32": torch.int32, "U8": torch.uint8, "BOOL": torch.bool}


def _read_safetensors(path, device):
    """Read a .safetensors file one tensor at a time with plain reads. safetensors' own loader memory-maps the
    whole file, and Windows charges that 4 GB view against a commit limit this laptop is already near."""
    out = {}
    with open(path, "rb") as f:
        n = int.from_bytes(f.read(8), "little")
        header = json.loads(f.read(n))
        base = 8 + n
        for name, meta in header.items():
            if name == "__metadata__":
                continue
            start, end = meta["data_offsets"]
            f.seek(base + start)
            buf = bytearray(f.read(end - start))
            t = torch.frombuffer(buf, dtype=_ST_DTYPES[meta["dtype"]]) if buf else torch.empty(0, dtype=_ST_DTYPES[meta["dtype"]])
            out[name] = t.reshape(meta["shape"]).to(device)
    return out


# ── one model on the card at a time ────────────────────────────────────────────────────────────────────────────────
_RESIDENT = {"id": None, "model": None}
_REMBG = {"session": None}
_GPU_LOCK = threading.Lock()


def _free():
    _RESIDENT.update(id=None, model=None)
    gc.collect()
    if DEVICE == "cuda":
        torch.cuda.empty_cache()


def get_model(bid):
    if _RESIDENT["id"] == bid:
        return _RESIDENT["model"]
    _free()
    root = backend_dir(bid)
    if bid == "sf3d":
        _sf3d_offline_encoders()
        from uv_raster import patch_texture_baker
        patch_texture_baker()
        from omegaconf import OmegaConf
        from sf3d.system import SF3D
        # SF3D.from_pretrained builds the 1B-param model in RAM, then reads a second 4 GB copy of the weights: ~9 GB
        # of commit on a laptop whose page file sits on a full C:. Build it on the GPU and stream the weights there.
        cfg = OmegaConf.load(os.path.join(root, "config.yaml"))
        OmegaConf.resolve(cfg)
        with torch.device(DEVICE):
            model = SF3D(cfg)
        model.to(DEVICE)  # open_clip builds its CLIP on the CPU whatever the default device
        sd = _read_safetensors(os.path.join(root, "model.safetensors"), DEVICE)
        missing, unexpected = model.load_state_dict(sd, strict=False)
        # The ada-norm modulations are registered twice (on the DINO layers and in a ModuleList); the file stores
        # each tensor once, like safetensors' own loader expects. Only those shared aliases may be "missing".
        params = model.state_dict()
        loaded = {params[k].data_ptr() for k in sd if k in params}
        really_missing = [k for k in missing if params[k].data_ptr() not in loaded]
        if really_missing or unexpected:
            raise RuntimeError(f"SF3D checkpoint mismatch: missing {really_missing[:5]}, unexpected {unexpected[:5]}")
        del sd
        model.eval()
    elif bid == "triposr":
        _install_torchmcubes_shim()
        from tsr.system import TSR
        model = TSR.from_pretrained(root, config_name="config.yaml", weight_name="model.ckpt")
        model.renderer.set_chunk_size(8192)
        model.to(DEVICE)
    else:
        from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
        model = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
            "tencent/Hunyuan3D-2mini", subfolder="hunyuan3d-dit-v2-mini-turbo", use_safetensors=True, device=DEVICE)
        model.enable_flashvdm(mc_algo="mc")
    _RESIDENT.update(id=bid, model=model)
    return model


# ── input image → RGBA cut-out ─────────────────────────────────────────────────────────────────────────────────────
def decode_image(data):
    if not data:
        raise ValueError("image is required (data URL or base64)")
    if data.startswith("data:"):
        data = data.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(data))).convert("RGBA")


def cut_out(img):
    """Use the image's own transparency when it has some; otherwise remove the background with rembg (u2net)."""
    alpha = np.asarray(img)[:, :, 3]
    if (alpha < 250).mean() > 0.02:
        return img, "alpha"
    if not rembg_available():
        raise RuntimeError("This image has no transparent background and the background-removal weights (u2net) "
                           "are not installed — use a transparent PNG or run fetch_weights.py rembg")
    import rembg
    if _REMBG["session"] is None:
        _REMBG["session"] = rembg.new_session("u2net", providers=["CPUExecutionProvider"])
    return rembg.remove(img, session=_REMBG["session"]).convert("RGBA"), "rembg"


def frame_object(img, ratio):
    """Crop to the object and pad it square so it fills `ratio` of the frame (what every model was trained on)."""
    arr = np.asarray(img)
    ys, xs = np.nonzero(arr[:, :, 3] > 8)
    if len(xs) == 0:
        raise ValueError("No object found in the image")
    crop = arr[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = crop.shape[:2]
    side = int(max(h, w) / ratio)
    out = np.zeros((side, side, 4), dtype=np.uint8)
    y0, x0 = (side - h) // 2, (side - w) // 2
    out[y0:y0 + h, x0:x0 + w] = crop
    return Image.fromarray(out, "RGBA")


def on_grey(img):
    a = np.asarray(img).astype(np.float32) / 255.0
    rgb = a[:, :, :3] * a[:, :, 3:4] + (1 - a[:, :, 3:4]) * 0.5
    return Image.fromarray((rgb * 255).astype(np.uint8), "RGB")


# ── generation ─────────────────────────────────────────────────────────────────────────────────────────────────────
def gpu_temp():
    if DEVICE != "cuda":
        return None
    try:
        return int(torch.cuda.temperature())
    except Exception:
        return None


def run_sf3d(img, opts):
    model = get_model("sf3d")
    framed = frame_object(img, float(opts.get("foregroundRatio") or 0.85))
    with torch.no_grad(), torch.autocast(device_type=DEVICE, dtype=torch.bfloat16, enabled=DEVICE == "cuda"):
        mesh, _glob = model.run_image(
            framed, bake_resolution=int(opts.get("textureResolution") or 1024),
            remesh=str(opts.get("remesh") or "none"), vertex_count=int(opts.get("vertexCount") or -1))
    # SF3D's GLBs face -Z; the drop-in contract (and the other backends) face +Z.
    mesh.apply_transform(trimesh.transformations.rotation_matrix(np.pi, [0, 1, 0]))
    return mesh


def run_triposr(img, opts):
    model = get_model("triposr")
    framed = on_grey(frame_object(img, float(opts.get("foregroundRatio") or 0.85)))
    with torch.no_grad():
        codes = model([framed], device=DEVICE)
        mesh = model.extract_mesh(codes, has_vertex_color=True, resolution=int(opts.get("mcResolution") or 256))[0]
    # TripoSR is Z-up; GLB is Y-up, facing +Z (their own viewer applies the same turn).
    mesh.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0]))
    mesh.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
    return mesh


def run_hunyuan_mini(img, opts):
    from hy3dgen.shapegen import DegenerateFaceRemover, FaceReducer, FloaterRemover
    pipe = get_model("hunyuan_mini")
    framed = frame_object(img, float(opts.get("foregroundRatio") or 0.9))
    seed = int(opts.get("seed") or 0) or int(time.time() * 1000) % 2147483647
    with torch.no_grad():
        mesh = pipe(image=framed, num_inference_steps=int(opts.get("steps") or 5),
                    octree_resolution=int(opts.get("octreeResolution") or 256), num_chunks=20000,
                    generator=torch.manual_seed(seed), output_type="trimesh")[0]
    mesh = FloaterRemover()(mesh)
    mesh = DegenerateFaceRemover()(mesh)
    mesh = FaceReducer()(mesh, max_facenum=int(opts.get("faceLimit") or 60000))
    return mesh


RUNNERS = {"sf3d": run_sf3d, "triposr": run_triposr, "hunyuan_mini": run_hunyuan_mini}


def image_to_mesh(task):
    t0 = time.time()
    temp = gpu_temp()
    if temp is not None and temp >= MAX_GPU_TEMP_C:
        raise RuntimeError(f"GPU is at {temp} °C — let it cool below {MAX_GPU_TEMP_C} °C before generating")
    opts = task.get("options") or {}
    bid = resolve_backend(task.get("backend"), str(task.get("quality") or "fast"))
    img, cut = cut_out(decode_image(task.get("image") or task.get("imageDataUrl")))
    mesh = RUNNERS[bid](img, opts)
    if isinstance(mesh, trimesh.Scene):
        mesh = mesh.dump(concatenate=True)
    if mesh.is_volume and mesh.volume < 0:
        mesh.invert()
    glb = mesh.export(file_type="glb")
    peak = torch.cuda.max_memory_allocated() // 2 ** 20 if DEVICE == "cuda" else 0
    return {
        "success": True, "glbBase64": base64.b64encode(glb).decode("ascii"), "format": "glb",
        "backendUsed": bid, "backendLabel": BACKENDS[bid]["label"], "textured": BACKENDS[bid]["textured"],
        "vertices": int(len(mesh.vertices)), "faces": int(len(mesh.faces)), "cutout": cut,
        "executionTimeMs": int((time.time() - t0) * 1000), "vramPeakMb": int(peak),
        "gpuTempC": gpu_temp(), "hardwareBackend": "TELA3D_TORCH_CUDA" if DEVICE == "cuda" else "TELA3D_TORCH_CPU",
    }


def backends_report():
    return [{"id": bid, "label": s["label"], "installed": backend_available(bid), "textured": s["textured"],
             "license": s["license"]} for bid, s in BACKENDS.items()]


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        pass

    def do_OPTIONS(self):
        self._send(204, {})

    def do_GET(self):
        if self.path in ("/health", "/api/health"):
            free = total = 0
            if DEVICE == "cuda":
                free, total = torch.cuda.mem_get_info()
            self._send(200, {"ok": True, "engine": "tela-3d", "comfyui": False, "device": DEVICE,
                             "vramFreeMb": free // 2 ** 20, "vramTotalMb": total // 2 ** 20, "gpuTempC": gpu_temp(),
                             "maxGpuTempC": MAX_GPU_TEMP_C, "resident": _RESIDENT["id"], "busy": _GPU_LOCK.locked(),
                             "backgroundRemoval": rembg_available(), "backends": backends_report()})
        elif self.path in ("/backends", "/api/backends"):
            self._send(200, {"backends": backends_report()})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length) or b"{}")
            if self.path not in ("/tela3d/image-to-mesh", "/api/tela3d/image-to-mesh"):
                return self._send(404, {"error": "not found"})
            # One job at a time: a queue of GPU jobs is what overheated the laptop before.
            if not _GPU_LOCK.acquire(blocking=False):
                return self._send(429, {"success": False, "error": "A 3D generation is already running"})
            try:
                result = image_to_mesh(body.get("task") or body)
            finally:
                _GPU_LOCK.release()
            self._send(200, result)
        except Exception as e:
            traceback.print_exc()
            if DEVICE == "cuda":
                torch.cuda.empty_cache()
            self._send(500, {"success": False, "error": f"{type(e).__name__}: {e}"})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("TELA3D_RUNTIME_PORT", 51124)))
    a = ap.parse_args()
    print(f"[Tela3D] runtime on 127.0.0.1:{a.port} · {DEVICE} · backends: "
          + (", ".join(b["id"] for b in backends_report() if b["installed"]) or "none installed"), flush=True)
    ThreadingHTTPServer(("127.0.0.1", a.port), Handler).serve_forever()


if __name__ == "__main__":
    sys.exit(main())
