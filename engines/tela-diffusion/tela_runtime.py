"""
Tela Diffusion Runtime — Plajah's own on-device image engine for Tela documents. No ComfyUI.

Plain PyTorch + diffusers in its own env (D:\\Plajah Runtime\\tela-py), serving generative fill, outpaint and
text-to-image over HTTP on 127.0.0.1:51123. Request and response bodies match the old GPU sidecar
(scripts/localAi/plajah_gpu_sidecar.py) so services/tela/telaInpaintService.ts can talk to either.

Every model goes through one fill path:
  context crop (from the client, PatchMatch pre-filled) → model-native working size at the crop's own aspect →
  the model's inpaint pipeline with the WHOLE crop as context → back to the crop's exact size →
  feathered composite, so pixels outside the selection come back bit-exact.

Families:
  flux2_klein  FLUX.2 [klein] 4B   Flux2KleinInpaintPipeline (the source crop is a reference latent, the mask is
                                   re-imposed every step). fp8 layerwise storage + model offload fits the 8 GB 4070.
  flux3_klein  FLUX 3 Image Klein  loaded from its diffusers repo when present (gated on Hugging Face).
  sdxl         SDXL checkpoints    StableDiffusionXLInpaintPipeline from single-file checkpoints on D:.
  sd15         SD 1.5 checkpoints  StableDiffusionInpaintPipeline.

Run:  "D:\\Plajah Runtime\\tela-py\\Scripts\\python.exe" engines/tela-diffusion/tela_runtime.py [--port 51123]
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
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import torch
from PIL import Image, ImageFilter

MODELS_ROOT = os.environ.get("PLAJAH_MODELS_ROOT", r"D:\Plajah Models")
HF_ROOT = os.path.join(MODELS_ROOT, "hf")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
COMPUTE_DTYPE = torch.bfloat16 if DEVICE == "cuda" else torch.float32

# id → how to find and drive it. `dir` entries are diffusers repos under D:\Plajah Models\hf, `file` entries are
# single-file checkpoints under D:\Plajah Models\checkpoints. `native_mp` is the working area in megapixels.
MODEL_REGISTRY = {
    "flux2_klein_4b": {
        "family": "flux2_klein", "label": "FLUX.2 [klein] 4B", "dir": "FLUX.2-klein-4B",
        "native_mp": 1.0, "multiple": 16, "steps": 4, "guidance": 1.0,
    },
    "flux3_klein": {
        "family": "flux3_klein", "label": "FLUX 3 Image Klein", "dir": "flux-3-image-klein",
        "native_mp": 1.0, "multiple": 16, "steps": 8, "guidance": 1.0,
    },
    "sdxl_turbo": {
        "family": "sdxl", "label": "SDXL Turbo", "file": "sd_xl_turbo_1.0_fp16.safetensors",
        "native_mp": 0.59, "multiple": 8, "steps": 6, "guidance": 1.0,
    },
    "animagine_xl": {
        "family": "sdxl", "label": "Animagine XL 3.1", "file": "animagine-xl-3.1.safetensors",
        "native_mp": 1.0, "multiple": 8, "steps": 28, "guidance": 6.0,
    },
    "sd15": {
        "family": "sd15", "label": "Stable Diffusion 1.5", "file": "v1-5-pruned-emaonly-fp16.safetensors",
        "native_mp": 0.33, "multiple": 8, "steps": 30, "guidance": 7.0,
    },
}
# What 'auto' (and the old sidecar ids) resolve to, best first.
AUTO_ORDER = ["flux3_klein", "flux2_klein_4b", "animagine_xl", "sdxl_turbo", "sd15"]
ALIASES = {"flux2_klein": "flux2_klein_4b", "flux3": "flux3_klein", "sdxl_inpaint": "auto", "lama": "auto"}

MIN_REAL_WEIGHT_BYTES = 50 * 1024 * 1024  # 1 MB placeholder files are not models


def model_available(model_id):
    spec = MODEL_REGISTRY.get(model_id)
    if not spec:
        return False
    if "dir" in spec:
        root = os.path.join(HF_ROOT, spec["dir"])
        if not os.path.isfile(os.path.join(root, "model_index.json")) and not os.path.isfile(os.path.join(root, "modular_model_index.json")):
            return False
        total = 0
        for dp, _dn, fns in os.walk(root):
            if ".cache" in dp:
                continue
            for fn in fns:
                if fn.endswith(".safetensors"):
                    total += os.path.getsize(os.path.join(dp, fn))
        return total > 2 * 1024 ** 3
    path = os.path.join(MODELS_ROOT, "checkpoints", spec["file"])
    return os.path.isfile(path) and os.path.getsize(path) > MIN_REAL_WEIGHT_BYTES


def resolve_model(requested):
    rid = ALIASES.get(str(requested or "auto").lower(), str(requested or "auto").lower())
    if rid in MODEL_REGISTRY and model_available(rid):
        return rid
    for mid in AUTO_ORDER:
        if model_available(mid):
            return mid
    raise RuntimeError(f"No usable image model under {MODELS_ROOT} (asked for {requested})")


# ── pipeline cache: one family resident at a time on the 8 GB card ───────────────────────────────────────────────
_PIPE = {"id": None, "inpaint": None, "t2i": None}
_GPU_LOCK = threading.Lock()


def _free_pipe():
    _PIPE.update(id=None, inpaint=None, t2i=None)
    gc.collect()
    if DEVICE == "cuda":
        torch.cuda.empty_cache()


def _fp8_storage(module, skip=()):
    """Keep weights in fp8 between layers and upcast each layer to bf16 only while it runs: halves resident memory."""
    from diffusers.hooks import apply_layerwise_casting
    pattern = ("norm", "embed", "pos_embed", "proj_in", "proj_out", "x_embedder", "context_embedder", "time_", "lm_head") + tuple(skip)
    apply_layerwise_casting(module, storage_dtype=torch.float8_e4m3fn, compute_dtype=COMPUTE_DTYPE, skip_modules_pattern=pattern)


def _make_masked_denoise_pipeline_class():
    """Flux2KleinInpaintPipeline feeds the source image back in as a reference latent, and klein then reproduces
    whatever is under the mask (the object, a grey patch, noise — measured on the fill bench). With
    `use_source_reference = False` the source only supplies the known latents re-imposed outside the mask at every
    step, so the hole has to be invented from the surrounding context. Extra reference images still pass through."""
    from diffusers import Flux2KleinInpaintPipeline

    class TelaFlux2KleinInpaint(Flux2KleinInpaintPipeline):
        use_source_reference = False

        def prepare_image_latents(self, images, batch_size, generator, device, dtype):
            if self.use_source_reference or not images:
                return super().prepare_image_latents(images, batch_size, generator, device, dtype)
            refs = images[1:]
            if refs:
                return super().prepare_image_latents(refs, batch_size, generator, device, dtype)
            empty = torch.zeros(batch_size, 0, self.latent_channels * 4, device=device, dtype=dtype)
            return empty, torch.zeros(batch_size, 0, 4, device=device, dtype=torch.long)

    return TelaFlux2KleinInpaint


def _load_flux2_klein(model_id):
    from diffusers import AutoencoderKLFlux2, FlowMatchEulerDiscreteScheduler, Flux2KleinPipeline
    Flux2KleinInpaintPipeline = _make_masked_denoise_pipeline_class()
    from transformers import AutoTokenizer
    import lean_weights
    root = os.path.join(HF_ROOT, MODEL_REGISTRY[model_id]["dir"])
    if not lean_weights.is_converted(root):
        print(f"[Tela] one-time fp8 conversion of {model_id} → {lean_weights.lean_dir(root)}", flush=True)
        lean_weights.convert(root)
    with open(os.path.join(root, "model_index.json")) as f:
        is_distilled = bool(json.load(f).get("is_distilled", False))
    inpaint = Flux2KleinInpaintPipeline(
        scheduler=FlowMatchEulerDiscreteScheduler.from_pretrained(root, subfolder="scheduler"),
        vae=AutoencoderKLFlux2.from_pretrained(root, subfolder="vae", torch_dtype=COMPUTE_DTYPE),
        text_encoder=lean_weights.load_text_encoder(root),
        tokenizer=AutoTokenizer.from_pretrained(os.path.join(root, "tokenizer")),
        transformer=lean_weights.load_transformer(root),
        is_distilled=is_distilled,
    )
    # from_pipe() would .to(dtype) every weight, which must not touch the fp8 ones; share the modules directly
    t2i = Flux2KleinPipeline(scheduler=inpaint.scheduler, vae=inpaint.vae, text_encoder=inpaint.text_encoder,
                             tokenizer=inpaint.tokenizer, transformer=inpaint.transformer, is_distilled=is_distilled)
    if DEVICE == "cuda":
        inpaint.enable_model_cpu_offload()
        t2i.enable_model_cpu_offload()
    return inpaint, t2i


def _load_flux3_klein(model_id):
    # FLUX 3 Image Klein ships as a diffusers modular repo; resolve its pipeline from the repo's own index.
    from diffusers import DiffusionPipeline
    root = os.path.join(HF_ROOT, MODEL_REGISTRY[model_id]["dir"])
    pipe = DiffusionPipeline.from_pretrained(root, torch_dtype=COMPUTE_DTYPE)
    if DEVICE == "cuda":
        if hasattr(pipe, "transformer"):
            _fp8_storage(pipe.transformer)
        if hasattr(pipe, "text_encoder"):
            _fp8_storage(pipe.text_encoder)
        pipe.enable_model_cpu_offload()
    return pipe, pipe


def _load_single_file(model_id):
    from diffusers import (StableDiffusionInpaintPipeline, StableDiffusionPipeline,
                           StableDiffusionXLInpaintPipeline, StableDiffusionXLPipeline)
    spec = MODEL_REGISTRY[model_id]
    path = os.path.join(MODELS_ROOT, "checkpoints", spec["file"])
    dtype = torch.float16 if DEVICE == "cuda" else torch.float32
    if spec["family"] == "sdxl":
        t2i = StableDiffusionXLPipeline.from_single_file(path, torch_dtype=dtype)
        inpaint = StableDiffusionXLInpaintPipeline.from_pipe(t2i)
    else:
        t2i = StableDiffusionPipeline.from_single_file(path, torch_dtype=dtype)
        inpaint = StableDiffusionInpaintPipeline.from_pipe(t2i)
    if DEVICE == "cuda":
        t2i.enable_model_cpu_offload()
        inpaint.enable_model_cpu_offload()
    if hasattr(t2i, "vae"):
        t2i.vae.enable_tiling()
    return inpaint, t2i


def get_pipes(model_id):
    if _PIPE["id"] == model_id:
        return _PIPE["inpaint"], _PIPE["t2i"]
    _free_pipe()
    family = MODEL_REGISTRY[model_id]["family"]
    t0 = time.time()
    print(f"[Tela] loading {model_id} ({family})", flush=True)
    if family == "flux2_klein":
        inpaint, t2i = _load_flux2_klein(model_id)
    elif family == "flux3_klein":
        inpaint, t2i = _load_flux3_klein(model_id)
    else:
        inpaint, t2i = _load_single_file(model_id)
    _PIPE.update(id=model_id, inpaint=inpaint, t2i=t2i)
    print(f"[Tela] {model_id} ready in {time.time() - t0:.1f} s", flush=True)
    return inpaint, t2i


# ── image helpers ────────────────────────────────────────────────────────────────────────────────────────────────
def decode_data_url(data_url):
    if data_url is None:
        return None
    s = str(data_url)
    if s.startswith("data:"):
        s = s.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(s)))


def png_data_url(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG", compress_level=3)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def working_size(w, h, native_mp, multiple):
    """The model's native area at the crop's own aspect ratio (never stretched per axis)."""
    scale = (native_mp * 1_000_000 / float(w * h)) ** 0.5
    scale = min(scale, 2.5)  # small crops render at native size; huge crops come down to it
    ww = max(multiple * 16, int(round(w * scale / multiple)) * multiple)
    hh = max(multiple * 16, int(round(h * scale / multiple)) * multiple)
    return ww, hh


def prepare_mask(mask_l, size):
    """Binary hole, grown a little so object edges and soft shadows are covered, with a soft rim for blending."""
    m = mask_l.resize(size, Image.BILINEAR).point(lambda v: 255 if v > 127 else 0)
    grow = max(3, int(round(min(size) * 0.012)) | 1)
    m = m.filter(ImageFilter.MaxFilter(grow))
    return m.filter(ImageFilter.GaussianBlur(radius=max(2, grow // 2)))


def composite_back(original, generated, mask_l, feather):
    """Generated pixels inside the selection, original pixels (bit-exact) outside, feathered across the rim."""
    gen = generated.resize(original.size, Image.LANCZOS) if generated.size != original.size else generated
    m = mask_l.point(lambda v: 255 if v > 127 else 0)
    if feather > 0:
        m = m.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(radius=feather))
    return Image.composite(gen, original, m)


def match_rim_tone(generated, original, mask_l):
    """Shift the generated fill's low-frequency tone to the ring of real pixels around the hole; texture untouched."""
    g = np.asarray(generated.resize(original.size, Image.LANCZOS), dtype=np.float32)
    o = np.asarray(original, dtype=np.float32)
    m = np.asarray(mask_l, dtype=np.float32) / 255.0
    ring_outer = np.asarray(mask_l.filter(ImageFilter.MaxFilter(25)), dtype=np.float32) / 255.0
    ring = (ring_outer > 0.5) & (m < 0.5)
    inner_band = (m > 0.5) & (np.asarray(mask_l.filter(ImageFilter.MinFilter(25)), dtype=np.float32) < 128)
    if ring.sum() < 64 or inner_band.sum() < 64:
        return generated
    delta = o[ring].mean(axis=0) - g[inner_band].mean(axis=0)
    delta = np.clip(delta, -18.0, 18.0)  # a nudge, never a recolour
    return Image.fromarray(np.clip(g + delta[None, None, :] * 0.6, 0, 255).astype(np.uint8))


FILL_REMOVE_PROMPT = (
    "Seamlessly continue the surrounding scene into this area with the same lighting, perspective, materials, "
    "texture and grain. Clean, natural, photographic, no new objects, no text."
)


def build_fill_prompt(task, mode):
    """Guided: the user's own words (the client's enriched prompt only when they are missing). Prompt-less: a plain
    continuation instruction — the model sees the surrounding crop, so heuristic scene guesses only mislead it."""
    if mode != "guided":
        return os.environ.get("TELA_REMOVE_PROMPT", FILL_REMOVE_PROMPT)
    p = (task.get("userPrompt") or task.get("prompt") or "").strip()
    if not p:
        return FILL_REMOVE_PROMPT
    return f"{p}. Match the surrounding scene's lighting, perspective and grain so it belongs in the image."


# ── jobs ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def run_fill(task):
    t0 = time.time()
    model_id = resolve_model(task.get("modelId"))
    spec = MODEL_REGISTRY[model_id]
    src = decode_data_url(task.get("sourceImage") or task.get("image") or task.get("imageDataUrl")).convert("RGB")
    mask_raw = task.get("maskImage") or task.get("mask") or task.get("maskDataUrl")

    outpaint = task.get("outpaint") or {}
    margins = [int(outpaint.get(k, task.get("outpaint" + k.capitalize(), 0)) or 0) for k in ("left", "top", "right", "bottom")]
    if any(margins):
        src, mask = expand_canvas(src, *margins)
    else:
        mask = decode_data_url(mask_raw).convert("L")
        if mask.size != src.size:
            mask = mask.resize(src.size, Image.BILINEAR)

    mode = str(task.get("inpaintMode") or ("guided" if (task.get("userPrompt") or "").strip() else "autonomous_remove"))
    seed = int(task.get("seed") or 0) or int(time.time() * 1000) % 2147483647
    steps = int(task.get("steps") or 0) or spec["steps"]
    guidance = float(task.get("cfgScale") or 0) or spec["guidance"]
    # Guided fills start from pure noise in the hole; removal re-renders the client's PatchMatch pre-fill part-way,
    # which keeps its structure and contrast while the model replaces its blocky patches.
    default_strength = float(os.environ.get("TELA_GUIDED_STRENGTH" if mode == "guided" else "TELA_REMOVE_STRENGTH",
                                            "1.0" if mode == "guided" else "0.8"))
    steps = int(os.environ.get("TELA_STEPS", steps)) if not task.get("steps") else steps
    strength = task.get("strength")
    strength = min(1.0, max(0.5, float(strength))) if strength is not None else default_strength
    # few-step distilled models lose whole steps to strength < 1; give them the steps back
    if strength < 1.0 and steps <= 8:
        steps = int(round(steps / strength))

    ww, hh = working_size(src.width, src.height, spec["native_mp"], spec["multiple"])
    work_img = src.resize((ww, hh), Image.LANCZOS)
    work_mask = prepare_mask(mask, (ww, hh))
    prompt = build_fill_prompt(task, mode)

    inpaint, _ = get_pipes(model_id)
    if hasattr(inpaint, "use_source_reference"):
        inpaint.use_source_reference = os.environ.get("TELA_SOURCE_REF", "0") == "1"
    gen = torch.Generator("cpu").manual_seed(seed)
    kwargs = dict(prompt=prompt, image=work_img, mask_image=work_mask, width=ww, height=hh,
                  strength=strength, num_inference_steps=steps, guidance_scale=guidance, generator=gen)
    if spec["family"] == "flux2_klein" and task.get("referenceImages"):
        ref = decode_data_url(task["referenceImages"][0])
        if ref is not None:
            kwargs["image_reference"] = ref.convert("RGB")
    if spec["family"] in ("sdxl", "sd15"):
        kwargs["negative_prompt"] = task.get("negativePrompt") or "blurry, distorted, seams, border, frame, text, watermark, duplicate"
    out = inpaint(**kwargs).images[0]

    out = match_rim_tone(out, src, mask) if mode != "guided" else out
    final = composite_back(src, out, mask, feather=int(task.get("feather", 6)))
    url = png_data_url(final)
    return {
        "success": True,
        "mediaUrl": url,
        "imageDataUrl": url,
        "format": "png",
        "mimeType": "image/png",
        "width": final.width,
        "height": final.height,
        "seed": seed,
        "steps": steps,
        "modelUsed": model_id,
        "modelLabel": spec["label"],
        "workingSize": [ww, hh],
        "strength": strength,
        "executionTimeMs": int((time.time() - t0) * 1000),
        "hardwareBackend": "TELA_TORCH_CUDA" if DEVICE == "cuda" else "TELA_TORCH_CPU",
        "gpuName": torch.cuda.get_device_name(0) if DEVICE == "cuda" else "cpu",
        "mode": "outpaint" if any(margins) else "inpaint",
        "synthesizedPrompt": prompt,
    }


def expand_canvas(src, left, top, right, bottom):
    """Outpaint canvas: edge-reflected padding as a starting point, mask = the new margins plus a small overlap."""
    w, h = src.size
    arr = np.asarray(src)
    pad = np.pad(arr, ((top, bottom), (left, right), (0, 0)), mode="reflect" if min(w, h) > max(left, top, right, bottom) else "edge")
    canvas = Image.fromarray(pad).filter(ImageFilter.GaussianBlur(radius=6))
    canvas.paste(src, (left, top))
    mask = Image.new("L", canvas.size, 255)
    ov = 8
    mask.paste(0, (left + (ov if left else 0), top + (ov if top else 0),
                   left + w - (ov if right else 0), top + h - (ov if bottom else 0)))
    return canvas, mask


def run_t2i(task):
    t0 = time.time()
    model_id = resolve_model(task.get("modelId"))
    spec = MODEL_REGISTRY[model_id]
    dims = task.get("dimensions") or {}
    w = int(dims.get("width") or task.get("width") or 1024)
    h = int(dims.get("height") or task.get("height") or 1024)
    m = spec["multiple"]
    w, h = max(256, (w // m) * m), max(256, (h // m) * m)
    seed = int(task.get("seed") or 0) or int(time.time() * 1000) % 2147483647
    steps = int(task.get("steps") or 0) or spec["steps"]
    _, t2i = get_pipes(model_id)
    kwargs = dict(prompt=task.get("prompt") or "", width=w, height=h, num_inference_steps=steps,
                  guidance_scale=float(task.get("cfgScale") or 0) or spec["guidance"], generator=torch.Generator("cpu").manual_seed(seed))
    if spec["family"] in ("sdxl", "sd15") and task.get("negativePrompt"):
        kwargs["negative_prompt"] = task["negativePrompt"]
    img = t2i(**kwargs).images[0]
    return {
        "success": True, "mediaUrl": png_data_url(img), "format": "png", "mimeType": "image/png",
        "width": img.width, "height": img.height, "seed": seed, "steps": steps, "modelUsed": model_id,
        "modelLabel": spec["label"], "executionTimeMs": int((time.time() - t0) * 1000),
        "hardwareBackend": "TELA_TORCH_CUDA" if DEVICE == "cuda" else "TELA_TORCH_CPU", "mode": "t2i",
    }


def unwrap_task(body):
    """Old-sidecar bodies wrap the job in {task: {...}} with a few fields duplicated at the top level."""
    task = dict(body.get("task") or {})
    for k, v in body.items():
        if k != "task" and k not in task:
            task[k] = v
    return task


def models_report():
    return [{"id": mid, "label": s["label"], "family": s["family"], "installed": model_available(mid)} for mid, s in MODEL_REGISTRY.items()]


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
            self._send(200, {"ok": True, "engine": "tela-diffusion", "comfyui": False, "device": DEVICE,
                             "vramFreeMb": free // 2 ** 20, "vramTotalMb": total // 2 ** 20,
                             "resident": _PIPE["id"], "models": models_report()})
        elif self.path in ("/models", "/api/models"):
            self._send(200, {"models": models_report()})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length) or b"{}")
            task = unwrap_task(body)
            has_source = bool(task.get("sourceImage") or task.get("image") or task.get("imageDataUrl"))
            with _GPU_LOCK:
                if self.path in ("/tela/inpaint", "/api/tela/inpaint", "/inpaint", "/outpaint") or (self.path in ("/generate", "/api/generate") and has_source):
                    result = run_fill(task)
                elif self.path in ("/generate", "/api/generate"):
                    result = run_t2i(task)
                else:
                    return self._send(404, {"error": "not found"})
            self._send(200, result)
        except Exception as e:  # report to the client; the client falls back to PatchMatch
            traceback.print_exc()
            if DEVICE == "cuda":
                torch.cuda.empty_cache()
            self._send(500, {"success": False, "error": f"{type(e).__name__}: {e}"})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("TELA_RUNTIME_PORT", 51123)))
    ap.add_argument("--preload", default=os.environ.get("TELA_RUNTIME_PRELOAD", ""))
    a = ap.parse_args()
    if a.preload:
        get_pipes(resolve_model(a.preload))
    print(f"[Tela] diffusion runtime on 127.0.0.1:{a.port} · {DEVICE} · models: "
          + ", ".join(m["id"] for m in models_report() if m["installed"]), flush=True)
    ThreadingHTTPServer(("127.0.0.1", a.port), Handler).serve_forever()


if __name__ == "__main__":
    sys.exit(main())
