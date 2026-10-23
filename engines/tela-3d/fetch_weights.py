"""
Download one Tela 3D backend's weights into D:\\Plajah Models — on purpose, one at a time (the runtime never downloads).

  python engines/tela-3d/fetch_weights.py sf3d | triposr | hunyuan_mini | rembg

sf3d is gated on Hugging Face: accept the license at https://huggingface.co/stabilityai/stable-fast-3d with the account
whose token is in HF_HOME first.
"""

import os
import sys
import urllib.request

MODELS_ROOT = os.environ.get("PLAJAH_MODELS_ROOT", r"D:\Plajah Models")
HF_ROOT = os.path.join(MODELS_ROOT, "hf")
os.environ.setdefault("HF_HOME", r"D:\Plajah Runtime\cache\hf")

from huggingface_hub import hf_hub_download, snapshot_download  # noqa: E402


def fetch_sf3d():
    dst = os.path.join(HF_ROOT, "stable-fast-3d")
    for f in ("config.yaml", "model.safetensors"):
        hf_hub_download("stabilityai/stable-fast-3d", f, local_dir=dst)
    # The 4 GB checkpoint carries the DINOv2 and CLIP weights; the runtime only needs DINOv2's config (a few KB).
    hf_hub_download("facebook/dinov2-large", "config.json")


def fetch_triposr():
    dst = os.path.join(HF_ROOT, "TripoSR")
    for f in ("config.yaml", "model.ckpt"):
        hf_hub_download("stabilityai/TripoSR", f, local_dir=dst)
    # TripoSR builds its ViT from this config (a few KB) — cached so the runtime can stay offline.
    hf_hub_download("facebook/dino-vitb16", "config.json")


def fetch_hunyuan_mini():
    dst = os.path.join(HF_ROOT, "hy3dgen", "tencent", "Hunyuan3D-2mini")
    snapshot_download("tencent/Hunyuan3D-2mini", local_dir=dst,
                      allow_patterns=[f"{sub}/{f}" for sub in ("hunyuan3d-dit-v2-mini-turbo", "hunyuan3d-vae-v2-mini-turbo")
                                      for f in ("config.yaml", "model.fp16.safetensors")])


def fetch_rembg():
    dst = os.path.join(MODELS_ROOT, "u2net")
    os.makedirs(dst, exist_ok=True)
    urllib.request.urlretrieve("https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx",
                               os.path.join(dst, "u2net.onnx"))


FETCHERS = {"sf3d": fetch_sf3d, "triposr": fetch_triposr, "hunyuan_mini": fetch_hunyuan_mini, "rembg": fetch_rembg}

if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in FETCHERS:
        sys.exit(f"usage: fetch_weights.py {{{'|'.join(FETCHERS)}}}")
    FETCHERS[sys.argv[1]]()
    print(f"[Tela3D] {sys.argv[1]} weights in place")
