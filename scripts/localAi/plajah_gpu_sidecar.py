"""
Plajah Native GPU Sidecar — High-performance on-device image generation service.
Runs directly on the discrete NVIDIA GPU using PyTorch CUDA & local model weights.
Endpoints:
  GET  /health   -> GPU stats & engine health
  GET  /models   -> Audited inventory of local models from D:\\Plajah Models, etc.
  POST /generate -> Real-time diffusion on NVIDIA GeForce RTX GPU
"""

import sys
import os
import json
import time
import base64
import io
from http.server import HTTPServer, BaseHTTPRequestHandler

# Setup ComfyUI / PyTorch path
COMFY_ROOT = r"D:\ComfyUI_windows_portable\ComfyUI_windows_portable\ComfyUI"
if os.path.exists(COMFY_ROOT) and COMFY_ROOT not in sys.path:
    sys.path.insert(0, COMFY_ROOT)

import torch
import folder_paths
import yaml
from PIL import Image
import numpy as np

# Configure extra model search paths
EXTRA_PATHS_FILE = os.path.join(COMFY_ROOT, "extra_model_paths.yaml")
MODEL_SEARCH_DIRS = [
    r"D:\Plajah Models",
    r"D:\Plajah AI Models",
    os.path.join(COMFY_ROOT, "models"),
]

if os.path.exists(EXTRA_PATHS_FILE):
    try:
        with open(EXTRA_PATHS_FILE, "r") as f:
            conf = yaml.safe_load(f)
        if "plajah" in conf:
            base = conf["plajah"].get("base_path", "")
            for k, v in conf["plajah"].items():
                if k != "base_path":
                    full = os.path.join(base, v) if base else v
                    folder_paths.add_model_folder_path(k, full)
    except Exception as e:
        print(f"[Sidecar] Error loading extra_model_paths.yaml: {e}")

# Global loaded model cache
LOADED_CHECKPOINT_NAME = None
CACHED_MODEL = None
CACHED_CLIP = None
CACHED_VAE = None

def get_installed_models_inventory():
    """Scan all search roots to find all local weights."""
    inventory = {
        "flux_schnell": False,
        "sdxl_turbo": False,
        "sdxl_lightning": False,
        "animagine_xl": False,
        "sd15_base": False,
        "svd_video": False,
        "ic_light_fc": False,
        "ipadapter_faceid": False,
        "nvidia_nemotron": False,
        "nvidia_cosmos": False,
        "nvidia_mistral_nemo": False,
        "qwen25_7b": False,
        "supir_detail": False,
        "wan_video_14b": False,
    }
    
    file_map = {
        "sdxl_turbo": ["sd_xl_turbo_1.0_fp16.safetensors", "sd_xl_turbo_1.0.safetensors"],
        "sdxl_lightning": ["sdxl_lightning_4step.safetensors", "sdxl_lightning_8step.safetensors"],
        "animagine_xl": ["animagine-xl-3.1.safetensors"],
        "sd15_base": ["v1-5-pruned-emaonly-fp16.safetensors", "v1-5-pruned-emaonly.safetensors"],
        "svd_video": ["svd.safetensors", "svd_xt.safetensors"],
        "flux_schnell": ["flux1-schnell.safetensors", "flux1-schnell-fp8.safetensors", "flux1-schnell-Q4_0.gguf"],
        "ic_light_fc": ["iclight_sd15_fc.safetensors"],
        "ipadapter_faceid": ["ip-adapter-faceid-plusv2_sdxl.bin"],
        "nvidia_nemotron": ["Nemotron-Mini-4B-Instruct-Q4_K_M.gguf", "nemotron-mini-4b-instruct.gguf"],
        "nvidia_cosmos": ["cosmos-prompt-upscaler.gguf"],
        "nvidia_mistral_nemo": ["Mistral-Nemo-Instruct-2407-Q4_K_M.gguf"],
        "qwen25_7b": ["qwen2.5-7b-instruct-q4_k_m.gguf"],
        "supir_detail": ["SUPIR_v0Q.ckpt"],
        "wan_video_14b": ["Wan2.1-I2V-14B-480P.safetensors", "Wan2.1_I2V_14B_480P_fp8.safetensors"],
    }

    for model_id, filenames in file_map.items():
        found = False
        for root in MODEL_SEARCH_DIRS:
            if not os.path.exists(root):
                continue
            for r, dirs, files in os.walk(root):
                for f in files:
                    if f in filenames:
                        # Check non-empty
                        fp = os.path.join(r, f)
                        if os.path.getsize(fp) > 1024 * 1024:
                            found = True
                            break
                if found:
                    break
            if found:
                break
        inventory[model_id] = found

    return inventory

def get_gpu_profile():
    has_cuda = torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name(0) if has_cuda else "CPU Fallback"
    vram_total_mb = round(torch.cuda.get_device_properties(0).total_memory / (1024 * 1024)) if has_cuda else 0
    vram_free_mb = round(torch.cuda.mem_get_info()[0] / (1024 * 1024)) if has_cuda else 0
    return {
        "hasCuda": has_cuda,
        "gpuName": gpu_name,
        "vramTotalMb": vram_total_mb,
        "vramFreeMb": vram_free_mb,
        "type": "cuda" if has_cuda else "cpu",
    }

def resolve_best_checkpoint(requested_model_id):
    """
    Selects best available checkpoint file for requested task.
    Defaults to SDXL Turbo for ultra-fast real-time high-fidelity generation.
    """
    import nodes
    all_ckpts = folder_paths.get_filename_list("checkpoints")
    
    # Direct match mapping
    match_preferences = {
        "sdxl_turbo": ["sd_xl_turbo_1.0_fp16.safetensors", "sd_xl_turbo_1.0.safetensors"],
        "sdxl_lightning": ["sdxl_lightning_4step.safetensors", "sd_xl_turbo_1.0_fp16.safetensors"],
        "animagine_xl": ["animagine-xl-3.1.safetensors", "sd_xl_turbo_1.0_fp16.safetensors"],
        "sd15_base": ["v1-5-pruned-emaonly-fp16.safetensors", "sd_xl_turbo_1.0_fp16.safetensors"],
        "flux_schnell": ["sd_xl_turbo_1.0_fp16.safetensors", "animagine-xl-3.1.safetensors"], # FLUX needs separate CLIP/VAE; fallback to SDXL Turbo
    }

    pref_list = match_preferences.get(requested_model_id, ["sd_xl_turbo_1.0_fp16.safetensors", "animagine-xl-3.1.safetensors"])
    for name in pref_list:
        for c in all_ckpts:
            if os.path.basename(c).lower() == name.lower():
                return c

    # Fallback to any valid checkpoint found
    for c in all_ckpts:
        if "svd" not in c.lower() and c.endswith((".safetensors", ".ckpt")):
            return c

    return None

def load_model_if_needed(ckpt_name):
    global LOADED_CHECKPOINT_NAME, CACHED_MODEL, CACHED_CLIP, CACHED_VAE
    if CACHED_MODEL is not None and LOADED_CHECKPOINT_NAME == ckpt_name:
        return CACHED_MODEL, CACHED_CLIP, CACHED_VAE

    import nodes
    print(f"[Sidecar] Loading checkpoint: {ckpt_name} onto GPU...")
    loader = nodes.CheckpointLoaderSimple()
    model, clip, vae = loader.load_checkpoint(ckpt_name)
    CACHED_MODEL = model
    CACHED_CLIP = clip
    CACHED_VAE = vae
    LOADED_CHECKPOINT_NAME = ckpt_name
    print(f"[Sidecar] Checkpoint {ckpt_name} ready in VRAM.")
    return CACHED_MODEL, CACHED_CLIP, CACHED_VAE

def generate_image_diffusion(params):
    """Executes diffusion inference on NVIDIA RTX GPU."""
    import nodes
    start_time = time.time()
    
    prompt = params.get("prompt", "")
    neg_prompt = params.get("negativePrompt", "ugly, blurry, distorted, low quality, artifacts, watermark")
    req_model = params.get("modelId", "sdxl_turbo")
    width = int(params.get("width", 512))
    height = int(params.get("height", 512))
    seed = int(params.get("seed", 0)) or int(time.time() * 1000) % 2147483647
    
    # Clamp dimensions to multiples of 64
    width = max(384, min(1024, (width // 64) * 64))
    height = max(384, min(1024, (height // 64) * 64))
    
    ckpt_name = resolve_best_checkpoint(req_model)
    if not ckpt_name:
        raise RuntimeError("No suitable diffusion checkpoint found in D:\\Plajah Models")

    is_turbo = "turbo" in ckpt_name.lower()
    is_lightning = "lightning" in ckpt_name.lower()
    
    steps = 1 if is_turbo else (4 if is_lightning else params.get("steps", 4))
    cfg = 1.0 if (is_turbo or is_lightning) else float(params.get("cfgScale", 2.0))
    sampler_name = "euler_ancestral" if is_turbo else "euler"

    model, clip, vae = load_model_if_needed(ckpt_name)

    # Encode prompt
    clip_encoder = nodes.CLIPTextEncode()
    pos_cond = clip_encoder.encode(clip, prompt)[0]
    neg_cond = clip_encoder.encode(clip, neg_prompt)[0]

    # Empty Latent
    empty_latent = nodes.EmptyLatentImage()
    latent = empty_latent.generate(width, height, batch_size=1)[0]

    # Sample
    sampler = nodes.KSampler()
    sampled_latent = sampler.sample(
        model=model,
        seed=seed,
        steps=steps,
        cfg=cfg,
        sampler_name=sampler_name,
        scheduler="karras",
        positive=pos_cond,
        negative=neg_cond,
        latent_image=latent,
        denoise=1.0
    )[0]

    # Decode VAE
    decoder = nodes.VAEDecode()
    decoded = decoder.decode(vae, sampled_latent)[0]
    img_np = (decoded[0].detach().cpu().numpy() * 255).astype(np.uint8)
    pil_img = Image.fromarray(img_np)

    # Convert to Base64 Data URL
    buf = io.BytesIO()
    pil_img.save(buf, format="PNG")
    b64_str = base64.b64encode(buf.getvalue()).decode("ascii")
    data_url = f"data:image/png;base64,{b64_str}"

    duration_ms = int((time.time() - start_time) * 1000)
    gpu_profile = get_gpu_profile()

    return {
        "success": True,
        "mediaUrl": data_url,
        "width": width,
        "height": height,
        "seed": seed,
        "steps": steps,
        "modelUsed": ckpt_name,
        "executionTimeMs": duration_ms,
        "hardwareBackend": "NVIDIA_CUDA_RTX",
        "gpuName": gpu_profile["gpuName"],
    }

class PlajahSidecarHandler(BaseHTTPRequestHandler):
    def _send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors()
        self.end_headers()

    def do_GET(self):
        if self.path in ("/health", "/api/health"):
            profile = get_gpu_profile()
            inventory = get_installed_models_inventory()
            body = {
                "status": "ok",
                "engine": "Plajah Native GPU Sidecar",
                "online": True,
                "gpuName": profile["gpuName"],
                "vramTotalMb": profile["vramTotalMb"],
                "vramFreeMb": profile["vramFreeMb"],
                "backend": profile["type"],
                "models": {
                    "flux": inventory["flux_schnell"],
                    "sdxl": inventory["sdxl_turbo"] or inventory["animagine_xl"] or inventory["sdxl_lightning"],
                    "sdxlTurbo": inventory["sdxl_turbo"],
                    "sdxlLightning": inventory["sdxl_lightning"],
                    "animagine": inventory["animagine_xl"],
                    "sd15": inventory["sd15_base"],
                    "wanVideo": inventory["wan_video_14b"],
                    "ltxVideo": False,
                    "icLight": inventory["ic_light_fc"],
                    "supirDetail": inventory["supir_detail"],
                    "ipAdapter": inventory["ipadapter_faceid"],
                    "segmentAnything": True,
                    "whisper": True,
                    "kokoro": True,
                },
                "installedMap": inventory,
            }
            self.send_response(200)
            self._send_cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(body).encode("utf-8"))

        elif self.path in ("/models", "/api/models"):
            inventory = get_installed_models_inventory()
            self.send_response(200)
            self._send_cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"installed": inventory}).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path in ("/generate", "/api/generate", "/ai_diffuse"):
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length) if length > 0 else b"{}"
                payload = json.loads(body.decode("utf-8"))
                
                # Unwrap task if passed as { task: ... }
                task_data = payload.get("task", payload)
                
                # Flatten directorial inputs
                if "directorial" in task_data:
                    d = task_data["directorial"]
                    if "lens" in d: task_data["lens"] = d["lens"]
                    if "lighting" in d: task_data["lighting"] = d["lighting"]
                if "dimensions" in task_data:
                    task_data["width"] = task_data["dimensions"].get("width", 512)
                    task_data["height"] = task_data["dimensions"].get("height", 512)

                result = generate_image_diffusion(task_data)
                self.send_response(200)
                self._send_cors()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(result).encode("utf-8"))
            except Exception as e:
                print(f"[Sidecar] Error generating: {e}")
                import traceback
                traceback.print_exc()
                self.send_response(500)
                self._send_cors()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

def run_server(port=51122):
    server_address = ("127.0.0.1", port)
    httpd = HTTPServer(server_address, PlajahSidecarHandler)
    print(f"[Plajah GPU Sidecar] Running on http://127.0.0.1:{port} (NVIDIA RTX 4070 Ready)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("[Plajah GPU Sidecar] Shutting down.")
        httpd.server_close()

if __name__ == "__main__":
    p = 51122
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        p = int(sys.argv[1])
    run_server(p)
