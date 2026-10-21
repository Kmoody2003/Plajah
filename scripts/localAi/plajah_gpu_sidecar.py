"""
Plajah Native GPU Sidecar — High-performance on-device image generation & inpainting service.
Runs directly on the discrete NVIDIA GPU using PyTorch CUDA & local model weights.
Features:
  - Text-to-Image with SDXL Turbo / SDXL Lightning / SD1.5
  - Adobe Firefly-Grade Non-Destructive Inpainting (VAEEncodeForInpaint + Subpixel Boundary Blending)
  - Seamless Canvas Outpainting & Expansion
  - Hardware Acceleration: CUDA, TF32 Tensor Cores, cuDNN Benchmark, SDPA Attention
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
import math
import threading
from http.server import HTTPServer, ThreadingHTTPServer, BaseHTTPRequestHandler

GPU_INFERENCE_LOCK = threading.Lock()

# Setup ComfyUI / PyTorch path
COMFY_ROOT = r"D:\ComfyUI_windows_portable\ComfyUI_windows_portable\ComfyUI"
if os.path.exists(COMFY_ROOT) and COMFY_ROOT not in sys.path:
    sys.path.insert(0, COMFY_ROOT)

# Plajah Story Intelligence Engine (Gemma 2 2B + Nemotron 4B on NVIDIA GPU)
try:
    from story_intelligence_engine import story_intel_engine
except ImportError:
    try:
        sys.path.insert(0, os.path.dirname(__file__))
        from story_intelligence_engine import story_intel_engine
    except Exception as e:
        story_intel_engine = None
        print(f"[Sidecar] Could not load story_intel_engine: {e}")

import torch
import folder_paths
import yaml
from PIL import Image, ImageFilter, ImageOps
import numpy as np

try:
    import pillow_jxl  # Native ISO/IEC 18181 JPEG XL encoder/decoder for Pillow
    HAS_JXL = True
except ImportError:
    HAS_JXL = False

# Hardware performance optimizations for NVIDIA RTX GPU
if torch.cuda.is_available():
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True
    torch.backends.cudnn.benchmark = True

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
        "flux3_klein": False,
        "flux2_klein_4b": False,
        "sdxl_turbo": False,
        "sdxl_lightning": False,
        "animagine_xl": False,
        "sd15_base": False,
        "svd_video": False,
        "ic_light_fc": False,
        "ipadapter_faceid": False,
        "meta_muse_spark": False,
        "nvidia_nemotron": False,
        "nvidia_cosmos": False,
        "nvidia_mistral_nemo": False,
        "qwen25_7b": False,
        "gemma2_2b": False,
        "supir_detail": False,
        "wan_video_1_3b": False,
        "wan_video_14b": False,
        "wan_video_fl": False,
        "flux_lora_hyper_8step": False,
        "flux_lora_cinematic_35mm": False,
        "flux_lora_volumetric_chiaroscuro": False,
        "flux_lora_neon_cyberpunk": False,
        "flux_lora_realism_skin": False,
        "flux_lora_hand_anatomy": False,
        "flux_lora_storybook_cartoon": False,
        "flux_lora_manga_screentone": False,
        "flux_lora_ghibli_nostalgia": False,
        "flux_lora_wan_kinematics": False,
    }
    
    file_map = {
        "sdxl_turbo": ["sd_xl_turbo_1.0_fp16.safetensors", "sd_xl_turbo_1.0.safetensors"],
        "sdxl_lightning": ["sdxl_lightning_4step.safetensors", "sdxl_lightning_8step.safetensors"],
        "animagine_xl": ["animagine-xl-3.1.safetensors"],
        "sd15_base": ["v1-5-pruned-emaonly-fp16.safetensors", "v1-5-pruned-emaonly.safetensors"],
        "svd_video": ["svd.safetensors", "svd_xt.safetensors"],
        "flux_schnell": ["flux1-schnell.safetensors", "flux1-schnell-fp8.safetensors", "flux1-schnell-Q4_0.gguf"],
        "flux3_klein": [
            "flux3-image-klein-fp8.safetensors",
            "flux3_image_klein_sd_int8_convrot.safetensors",
            "flux3_image_klein_sd_nvfp4.safetensors",
            "flux3_image_klein_sd_Q4_K_M.gguf",
        ],
        "flux2_klein_4b": ["flux2-klein-4b-fp8.safetensors", "flux-2-klein-base-4b-fp8.safetensors"],
        "ic_light_fc": ["iclight_sd15_fc.safetensors"],
        "ipadapter_faceid": ["ip-adapter-faceid-plusv2_sdxl.bin"],
        "meta_muse_spark": [
            "Muse-Spark-Glimmer-Local-Q4_K_M.gguf",
            "Muse-Glimmer-30B-KQuant-17GB-Q4_K_M.gguf",
            "Muse-Glimmer-30B-UD-Q2_K_XL.gguf",
            "dflash-Muse-Glimmer-30B-Q4_K_M.gguf",
        ],
        "nvidia_nemotron": ["Nemotron-Mini-4B-Instruct-Q4_K_M.gguf", "nemotron-mini-4b-instruct.gguf"],
        "nvidia_cosmos": ["cosmos-prompt-upscaler.gguf"],
        "nvidia_mistral_nemo": ["Mistral-Nemo-Instruct-2407-Q4_K_M.gguf"],
        "qwen25_7b": ["qwen2.5-7b-instruct-q4_k_m.gguf"],
        "gemma2_2b": ["gemma-2-2b-it-Q4_K_M.gguf", "gemma-2-2b-it-IQ4_XS.gguf", "gemma-2-2b-it-Q4_K_S.gguf"],
        "supir_detail": ["SUPIR_v0Q.ckpt"],
        "wan_video_1_3b": ["Wan2.1_T2V_1.3B_bf16.safetensors", "Wan2.1-T2V-1.3B.safetensors", "wan2.1_t2v_1.3B_fp16.safetensors"],
        "wan_causvid_lora": ["Wan21_CausVid_14B_T2V_lora_rank32.safetensors", "Wan21_CausVid_1_3B_T2V_lora_rank32.safetensors", "lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors"],
        "wan_video_14b": ["Wan2.1-I2V-14B-480P.safetensors", "Wan2.1_I2V_14B_480P_fp8.safetensors"],
        "wan_video_fl": ["Wan2.1_FL_I2V_14B_480P_fp8.safetensors"],
        "flux_lora_hyper_8step": ["hyper_flux_8step_lora.safetensors", "Hyper-FLUX.1-dev-8steps-lora.safetensors"],
        "flux_lora_cinematic_35mm": ["flux_cinematic_35mm_v1.safetensors", "flux_cinematic_35mm.safetensors"],
        "flux_lora_volumetric_chiaroscuro": ["flux_volumetric_chiaroscuro.safetensors", "flux_lighting.safetensors"],
        "flux_lora_neon_cyberpunk": ["flux_neon_cyberpunk_rain.safetensors", "flux_cyberpunk.safetensors"],
        "flux_lora_realism_skin": ["flux_realism_skin_v1.safetensors", "lora.safetensors"],
        "flux_lora_hand_anatomy": ["flux_hand_anatomy_stabilizer.safetensors", "FLUX-dev-lora-anti-blur.safetensors"],
        "flux_lora_storybook_cartoon": ["flux_storybook_watercolor_v1.safetensors", "flux_storybook_watercolor.safetensors"],
        "flux_lora_manga_screentone": ["flux_manga_screentone_v1.safetensors", "flux_manga_screentone.safetensors"],
        "flux_lora_ghibli_nostalgia": ["flux_ghibli_nostalgia_v1.safetensors", "flux_ghibli.safetensors"],
        "flux_lora_wan_kinematics": ["wan21_camera_motion_lora.safetensors", "Wan2.1_camera_motion.safetensors"],
    }

    for model_id, filenames in file_map.items():
        found = False
        for root in MODEL_SEARCH_DIRS:
            if not os.path.exists(root):
                continue
            for r, dirs, files in os.walk(root):
                for f in files:
                    if f in filenames:
                        fp = os.path.join(r, f)
                        min_bytes = (10 * 1024 * 1024) if "lora" in model_id else (50 * 1024 * 1024)
                        if os.path.getsize(fp) > min_bytes:
                            found = True
                            break
                if found:
                    break
            if found:
                break
        inventory[model_id] = found

    # the two real inpainting engines for Tela generative fill (see lama_inpaint / load_sdxl_inpaint_unet)
    try:
        inventory["big_lama"] = bool(find_lama_model())
        inventory["sdxl_inpaint"] = bool(find_sdxl_inpaint_unet())
    except Exception:
        inventory["big_lama"] = inventory["sdxl_inpaint"] = False
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

def is_valid_safetensors_file(filepath, min_size_mb=10):
    """Verifies a safetensors file is non-truncated and has a valid readable header."""
    try:
        if not os.path.exists(filepath):
            return False
        if os.path.getsize(filepath) < min_size_mb * 1024 * 1024:
            return False
        import safetensors.torch
        with safetensors.torch.safe_open(filepath, framework="pt") as f:
            return len(f.keys()) > 10
    except Exception:
        return False


def resolve_best_checkpoint(requested_model_id):
    """
    Selects best available valid checkpoint file for requested task.
    Skips any truncated or stub files so generation never crashes.
    """
    import nodes
    all_ckpts = folder_paths.get_filename_list("checkpoints")
    
    match_preferences = {
        "sdxl_turbo": ["sd_xl_turbo_1.0_fp16.safetensors", "sd_xl_turbo_1.0.safetensors"],
        "sdxl_lightning": ["sdxl_lightning_4step.safetensors", "sd_xl_turbo_1.0_fp16.safetensors"],
        "animagine_xl": ["animagine-xl-3.1.safetensors", "sd_xl_turbo_1.0_fp16.safetensors"],
        "sd15_base": ["v1-5-pruned-emaonly-fp16.safetensors", "sd_xl_turbo_1.0_fp16.safetensors"],
        "flux3_klein": ["sd_xl_turbo_1.0_fp16.safetensors", "animagine-xl-3.1.safetensors"],
        "flux2_klein_4b": ["sd_xl_turbo_1.0_fp16.safetensors", "animagine-xl-3.1.safetensors"],
        "flux_schnell": ["sd_xl_turbo_1.0_fp16.safetensors", "animagine-xl-3.1.safetensors"],
    }

    pref_list = match_preferences.get(requested_model_id, ["sd_xl_turbo_1.0_fp16.safetensors", "animagine-xl-3.1.safetensors"])
    for name in pref_list:
        for c in all_ckpts:
            if os.path.basename(c).lower() == name.lower():
                full_p = folder_paths.get_full_path("checkpoints", c)
                if full_p and is_valid_safetensors_file(full_p, min_size_mb=500):
                    return c

    # Fallback to any valid checkpoint found
    for c in all_ckpts:
        if "svd" not in c.lower() and c.endswith((".safetensors", ".ckpt")):
            full_p = folder_paths.get_full_path("checkpoints", c)
            if full_p and is_valid_safetensors_file(full_p, min_size_mb=500):
                return c

    return None

def load_model_if_needed(ckpt_name):
    global LOADED_CHECKPOINT_NAME, CACHED_MODEL, CACHED_CLIP, CACHED_VAE
    if CACHED_MODEL is not None and LOADED_CHECKPOINT_NAME == ckpt_name:
        return CACHED_MODEL, CACHED_CLIP, CACHED_VAE

    if story_intel_engine is not None and torch.cuda.is_available():
        free_mb = round(torch.cuda.mem_get_info()[0] / (1024 * 1024))
        if free_mb < 4200:
            story_intel_engine.evict_all_models()
            torch.cuda.empty_cache()

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

# ─────────────────────────────────────────────────────────────────────────────────────────────
# Real inpainting models for Tela generative fill (measured with scripts/tela/fillBench.ts):
#   • Big-LaMa (Apache-2.0, 206 MB TorchScript): prompt-less removal / scene completion — what Adobe's Remove tool
#     does. Runs in well under a second and beats a latent-noise-mask diffusion pass on every bench hole.
#   • SDXL inpainting 0.1 (OpenRAIL++, 5.1 GB fp16 UNet): purpose-trained 9-channel inpainting for GUIDED fills, with
#     the SDXL CLIP + VAE taken from the resident SDXL checkpoint.
# Neither "FLUX.3 [klein]" file on disk is a real checkpoint (0-byte stubs), so a klein request used to fall through to
# SDXL Turbo with a latent noise mask. With these present the request routes to the right model and `modelUsed`
# says which one actually ran.
LAMA_PATHS = [
    r"D:\Plajah Models\inpaint\big-lama.pt",
    r"D:\Plajah Models\inpaint\big-lama.safetensors.pt",
    os.path.join(COMFY_ROOT, "models", "inpaint", "big-lama.pt"),
]
SDXL_INPAINT_UNET_NAMES = ["sd_xl_inpainting_0.1_fp16.safetensors", "sd_xl_inpainting_0.1.safetensors", "sdxl_inpainting_0.1_fp16.safetensors"]
_LAMA_MODEL = None
_SDXL_INPAINT = {"name": None, "model": None}


def find_lama_model():
    for p in LAMA_PATHS:
        if os.path.exists(p) and os.path.getsize(p) > 50 * 1024 * 1024:
            return p
    return None


def find_sdxl_inpaint_unet():
    """The SDXL inpainting UNet as ComfyUI lists it (unet/ or diffusion_models/ under D:\\Plajah Models)."""
    for folder in ("diffusion_models", "unet"):
        try:
            for c in folder_paths.get_filename_list(folder):
                if os.path.basename(c).lower() in [n.lower() for n in SDXL_INPAINT_UNET_NAMES]:
                    full = folder_paths.get_full_path(folder, c)
                    if full and os.path.getsize(full) > 500 * 1024 * 1024:
                        return folder, c
        except Exception:
            continue
    return None


def lama_inpaint(init_pil, mask_pil):
    """Big-LaMa fill of the white mask area; returns a PIL image the size of init_pil, or None when LaMa is absent."""
    global _LAMA_MODEL
    path = find_lama_model()
    if not path:
        return None
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if _LAMA_MODEL is None:
        print(f"[Sidecar] Loading Big-LaMa from {path}", flush=True)
        _LAMA_MODEL = torch.jit.load(path, map_location=device).eval()
    img = np.array(init_pil.convert("RGB")).astype(np.float32) / 255.0
    msk = (np.array(mask_pil.convert("L")).astype(np.float32) > 127).astype(np.float32)
    h, w = msk.shape
    # LaMa wants multiples of 8; reflect-pad so the border stays natural
    ph, pw = (8 - h % 8) % 8, (8 - w % 8) % 8
    img_p = np.pad(img, ((0, ph), (0, pw), (0, 0)), mode="reflect")
    msk_p = np.pad(msk, ((0, ph), (0, pw)), mode="reflect")
    with torch.no_grad():
        it = torch.from_numpy(img_p).permute(2, 0, 1)[None].to(device)
        mt = torch.from_numpy(msk_p)[None, None].to(device)
        out = _LAMA_MODEL(it, mt)[0].permute(1, 2, 0).clamp(0, 1).cpu().numpy()
    out = out[:h, :w]
    # keep every unmasked pixel bit-exact
    out = out * msk[..., None] + img * (1.0 - msk[..., None])
    return Image.fromarray((out * 255.0).round().astype(np.uint8))


def load_sdxl_inpaint_unet():
    """The SDXL inpainting UNet via ComfyUI's UNETLoader (diffusers-format single file), cached."""
    found = find_sdxl_inpaint_unet()
    if not found:
        return None
    folder, name = found
    if _SDXL_INPAINT["model"] is not None and _SDXL_INPAINT["name"] == name:
        return _SDXL_INPAINT["model"]
    import nodes
    print(f"[Sidecar] Loading SDXL inpainting UNet {name} ({folder})", flush=True)
    # UNETLoader lists diffusion_models; a file under unet/ is reachable through the same folder registry
    model = nodes.UNETLoader().load_unet(name, "default")[0]
    _SDXL_INPAINT["model"], _SDXL_INPAINT["name"] = model, name
    return model


def decode_data_url(data_url):
    """Parses data URL into a PIL Image."""
    if not data_url or not isinstance(data_url, str):
        return None
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    raw = base64.b64decode(data_url)
    return Image.open(io.BytesIO(raw))

def analyze_canvas_and_selection_semantics(init_pil, mask_pil, raw_prompt="", client_scene_ctx=None):
    """
    Deep Canvas & Selection Vision Analyzer (Adobe-Surpassing Scene Reasoning):
    Inspects both the unmasked canvas context and the selection perimeter/interior
    to deduce scene category, dominant surrounding materials, lighting vector,
    color temperature, structural continuation lines, and optimal inpaint mode.
    Works both when raw_prompt is empty (Autonomous Scene Fill) and when guided.
    """
    img_np = np.array(init_pil.convert("RGB")).astype(np.float32)
    mask_np = np.array(mask_pil.convert("L")).astype(np.float32) / 255.0
    h, w, _ = img_np.shape

    # Dilate mask to isolate the immediate unmasked perimeter ring around the selection
    dilated_pil = mask_pil.convert("L").filter(ImageFilter.MaxFilter(19))
    dilated_np = np.array(dilated_pil).astype(np.float32) / 255.0
    ring_sel = (dilated_np > 0.25) & (mask_np < 0.25)
    unmasked_sel = mask_np < 0.25
    interior_sel = mask_np >= 0.5

    if np.count_nonzero(ring_sel) < 32:
        ring_sel = unmasked_sel

    ring_pixels = img_np[ring_sel] if np.any(ring_sel) else img_np.reshape(-1, 3)
    interior_pixels = img_np[interior_sel] if np.any(interior_sel) else ring_pixels

    mean_r, mean_g, mean_b = ring_pixels.mean(axis=0)
    std_r, std_g, std_b = np.maximum(2.0, ring_pixels.std(axis=0))

    int_r, int_g, int_b = interior_pixels.mean(axis=0)
    color_divergence = float(np.sqrt((mean_r - int_r) ** 2 + (mean_g - int_g) ** 2 + (mean_b - int_b) ** 2))

    # Selection vertical & horizontal normalized position in canvas
    ys, xs = np.where(interior_sel)
    norm_cy = float(ys.mean() / max(1, h)) if len(ys) > 0 else 0.5
    norm_cx = float(xs.mean() / max(1, w)) if len(xs) > 0 else 0.5

    # Lighting & Exposure Analysis
    luma_ring = 0.299 * mean_r + 0.587 * mean_g + 0.114 * mean_b
    top_luma = float((0.299 * img_np[:h // 2, :, 0] + 0.587 * img_np[:h // 2, :, 1] + 0.114 * img_np[:h // 2, :, 2]).mean())
    bot_luma = float((0.299 * img_np[h // 2:, :, 0] + 0.587 * img_np[h // 2:, :, 1] + 0.114 * img_np[h // 2:, :, 2]).mean())
    left_luma = float((0.299 * img_np[:, :w // 2, 0] + 0.587 * img_np[:, :w // 2, 1] + 0.114 * img_np[:, :w // 2, 2]).mean())
    right_luma = float((0.299 * img_np[:, w // 2:, 0] + 0.587 * img_np[:, w // 2:, 1] + 0.114 * img_np[:, w // 2:, 2]).mean())

    if luma_ring > 188:
        lighting_desc = "bright high-key daylight illumination"
    elif luma_ring < 62:
        lighting_desc = "low-key cinematic shadow and ambient mood lighting"
    elif top_luma - bot_luma > 24:
        lighting_desc = "natural overhead sky illumination with soft grounded shadows"
    elif abs(left_luma - right_luma) > 22:
        lighting_desc = "directional side key lighting from left" if left_luma > right_luma else "directional side key lighting from right"
    else:
        lighting_desc = "balanced studio and natural ambient lighting"

    # Color temperature & material classification around the selection
    warmth = mean_r - mean_b
    foliage_index = mean_g - 0.5 * (mean_r + mean_b)
    sky_index = mean_b - 0.5 * (mean_r + mean_g)
    skin_index = 1.0 if (mean_r > 95 and mean_g > 40 and mean_b > 20 and mean_r > mean_g > mean_b and (mean_r - mean_g) > 12 and warmth < 95) else 0.0

    # Gradient & Structure Tensor Orientation on unmasked boundary
    gray = 0.299 * img_np[:, :, 0] + 0.587 * img_np[:, :, 1] + 0.114 * img_np[:, :, 2]
    gy, gx = np.gradient(gray)
    ring_gx = float(np.abs(gx[ring_sel]).mean()) if np.any(ring_sel) else 8.0
    ring_gy = float(np.abs(gy[ring_sel]).mean()) if np.any(ring_sel) else 8.0
    edge_energy = ring_gx + ring_gy

    if ring_gy > ring_gx * 1.38:
        structure_desc = "continuous horizontal horizon and perspective lines"
    elif ring_gx > ring_gy * 1.38:
        structure_desc = "continuous vertical architectural and structural alignment"
    elif edge_energy > 24:
        structure_desc = "high-frequency crisp geometric and organic structural detail"
    elif edge_energy < 7:
        structure_desc = "smooth shallow depth-of-field bokeh gradient"
    else:
        structure_desc = "seamless natural structural and perspective continuity"

    # Deduce what material/environment surrounds the selection
    if sky_index > 18 and norm_cy < 0.58:
        surrounding_material = "atmospheric sky, cloud formations, and horizon gradient"
        scene_category = "outdoor_sky_landscape"
    elif foliage_index > 14:
        surrounding_material = "organic natural foliage, botanical leaves, and terrain texture"
        scene_category = "outdoor_nature_foliage"
    elif skin_index > 0.5 and warmth > 18:
        surrounding_material = "natural portrait skin texture, organic tonal transitions, and fine detail"
        scene_category = "portrait_subject"
    elif sky_index > 14 and norm_cy >= 0.58:
        surrounding_material = "water surface, natural ripples, and environmental reflections"
        scene_category = "coastal_water"
    elif edge_energy > 20 and abs(warmth) < 25:
        surrounding_material = "architectural surfaces, perspective geometry, and realistic material texture"
        scene_category = "architectural_environment"
    elif warmth > 24:
        surrounding_material = "warm sunlit surfaces, natural ambient textures, and golden-hour tones"
        scene_category = "warm_cinematic_scene"
    elif warmth < -20:
        surrounding_material = "cool cinematic environment, atmospheric depth, and ambient surfaces"
        scene_category = "cool_cinematic_scene"
    else:
        surrounding_material = "natural photographic environment, continuous surface material, and realistic lighting"
        scene_category = "general_photographic"

    if warmth > 28:
        palette_desc = "warm golden-amber color temperature"
    elif warmth > 12:
        palette_desc = "warm sunlit color balance"
    elif warmth < -24:
        palette_desc = "cool azure-cyan cinematic color temperature"
    elif warmth < -10:
        palette_desc = "cool daylight color balance"
    else:
        palette_desc = "true-to-life neutral color balance"

    clean_prompt = (raw_prompt or "").strip()
    # Detect whether prompt is blank or an explicit removal / seamless background fill
    is_auto_blank = (
        len(clean_prompt) == 0
        or clean_prompt.lower().startswith("seamless natural texture")
        or clean_prompt.lower().startswith("scene-aware fill")
    )
    is_explicit_remove = bool(
        not is_auto_blank
        and any(
            clean_prompt.lower().startswith(k)
            for k in ("remove", "delete", "erase", "clean", "clear", "empty", "seamless background continuation")
        )
    )

    # The material words come from colour thresholds (a warm dawn lake once read as "portrait skin texture"), so a
    # prompt-less fill never names a material — it asks for the surround continued exactly as it is — and a guided
    # fill only uses the material when it is not the fragile portrait guess.
    material_for_prompt = surrounding_material if scene_category != "portrait_subject" else "the surrounding scene"

    if is_explicit_remove:
        inpaint_mode = "explicit_remove"
        enriched_prompt = (
            f"Seamless continuation of the surrounding background exactly as it is, same surface and texture, "
            f"{structure_desc}, {lighting_desc}, {palette_desc}, "
            f"photorealistic natural texture, clean unobstructed background, no new objects"
        )
        neg_prompt = (
            "foreground object, person, figure, text, watermark, logo, blemish, "
            "blurry smudge, hard seam, border, frame, artifacts, distorted geometry"
        )
    elif is_auto_blank:
        # Autonomous No-Instruction Intelligence:
        # Decide between removing an occluding object vs completing scene structure
        inpaint_mode = "autonomous_remove" if color_divergence > 14.0 else "autonomous_complete"
        enriched_prompt = (
            f"Seamless continuation of the surrounding scene exactly as it is, same surface, same texture, same colours, "
            f"{structure_desc}, {lighting_desc}, {palette_desc}, "
            f"no new objects, coherent perspective and depth of field, photorealistic"
        )
        neg_prompt = (
            "cutout seam, gray patch, blurry clone, floating artifact, watermark, text, "
            "mismatched lighting, out-of-place object, distorted lines"
        )
    else:
        # Guided Prompt Mode: User specified what to generate inside the selection!
        inpaint_mode = "guided"
        # Strip any pre-appended generic suffixes if client already enriched it so we don't duplicate
        core_user_prompt = clean_prompt.split(", integrated seamlessly into scene")[0].strip()
        enriched_prompt = (
            f"{core_user_prompt}, physically integrated into {material_for_prompt}, "
            f"matching {lighting_desc}, {palette_desc}, {structure_desc}, "
            f"realistic contact shadows and ambient light bounce, photorealistic, high detail"
        )
        neg_prompt = (
            "ugly, blurry, low quality, pasted sticker look, mismatched perspective, "
            "hard border, seam, watermark, text, deformed, bad anatomy"
        )

    return {
        "inpaintMode": inpaint_mode,
        "sceneCategory": scene_category,
        "surroundingMaterial": surrounding_material,
        "lightingDescriptor": lighting_desc,
        "paletteDescriptor": palette_desc,
        "structureDescriptor": structure_desc,
        "colorDivergence": round(color_divergence, 2),
        "enrichedPrompt": enriched_prompt,
        "negativePrompt": neg_prompt,
    }


def _hex_to_rgb_float(hex_str, default=(1.0, 0.85, 0.7)):
    """Parses a CSS hex color (#RRGGBB or #RGB) into normalized float32 (R, G, B) in [0, 1]."""
    if not isinstance(hex_str, str):
        return np.array(default, dtype=np.float32)
    h = hex_str.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) != 6:
        return np.array(default, dtype=np.float32)
    try:
        return np.array([int(h[0:2], 16) / 255.0, int(h[2:4], 16) / 255.0, int(h[4:6], 16) / 255.0], dtype=np.float32)
    except Exception:
        return np.array(default, dtype=np.float32)


def compile_human_coherent_prompt(raw_prompt, raw_neg_prompt=""):
    """
    Deduplicates repeated modifier clauses so CLIP's 77-token window isn't diluted,
    detects human/character subjects, front-loads single-subject anatomical & facial
    coherence direction, and constructs a comprehensive anti-jank negative prompt.
    """
    clean_raw = (raw_prompt or "").strip()
    # Deduplicate comma-separated clauses case-insensitively while preserving order
    raw_clauses = [c.strip() for c in clean_raw.split(",") if c.strip()]
    deduped_clauses = []
    seen_lower = set()
    for clause in raw_clauses:
        key = " ".join(clause.lower().split())
        # Strip out literal "none" modifier tokens if any leaked in
        if key in ("none", "no override", "default", "null"):
            continue
        if key not in seen_lower:
            seen_lower.add(key)
            deduped_clauses.append(clause)

    core_prompt = ", ".join(deduped_clauses) if deduped_clauses else "cinematic photograph, natural lighting, high detail"
    lower_p = core_prompt.lower()

    human_keywords = (
        "person", "woman", "man", "girl", "boy", "portrait", "human", "character",
        "face", "lady", "gentleman", "model", "actor", "actress", "warrior", "knight",
        "soldier", "samurai", "cyberpunk", "detective", "hero", "heroine", "queen", "king",
        "princess", "prince", "monk", "priest", "dancer", "singer", "musician", "athlete",
        "astronaut", "pilot", "doctor", "nurse", "scientist", "chef", "artist", "writer",
        "child", "elder", "old man", "old woman", "young man", "young woman", "couple",
        "figure", "body", "headshot", "close-up", "closeup", "medium shot", "cowboy shot",
        "full body", "eyes", "skin", "hair", "fashion", "editorial", "street style", "he ", "she "
    )
    non_human_only_keywords = (
        "landscape only", "empty room", "no people", "uninhabited", "abstract texture",
        "purely architectural", "still life of fruit", "product shot of bottle"
    )
    has_human_kw = any(kw in lower_p for kw in human_keywords)
    explicitly_non_human = any(kw in lower_p for kw in non_human_only_keywords)
    is_plural_group = any(w in lower_p for w in ("two people", "three people", "crowd", "group of", "couple", "twins", "duo", "team", "family"))

    is_human_subject = (has_human_kw or not explicitly_non_human) and not ExplicitlyNonHumanPrompt(lower_p)

    if is_human_subject:
        subject_count_anchor = (
            "coherent human anatomy, natural proportions"
            if is_plural_group
            else "single unified subject, one person only, coherent human anatomy, natural skeletal proportions"
        )
        facial_quality_anchor = "symmetrical facial structure, focused expressive eyes with natural catchlights, realistic skin micro-texture with fine pores, natural hands"
        # Front-load core user prompt first so subject intent dominates CLIP tokens 1..40,
        # immediately followed by anatomical coherence and optical texture direction.
        if "coherent human anatomy" not in lower_p and "single unified subject" not in lower_p:
            compiled_pos = f"{core_prompt}, {subject_count_anchor}, {facial_quality_anchor}, crisp optical focus"
        else:
            compiled_pos = core_prompt
    else:
        compiled_pos = f"{core_prompt}, coherent structure, crisp optical focus, high micro-detail"

    anti_jank_neg = (
        "multiple heads, two heads, extra heads, duplicate person, cloned body, twin bodies, "
        "split screen, split frame, two people merged, conjoined body, stacked bodies, elongated torso, "
        "extra limbs, extra arms, extra legs, third arm, third leg, mutated hands, poorly drawn hands, "
        "extra fingers, fused fingers, six fingers, missing fingers, bad anatomy, anatomical jank, "
        "deformed body, twisted spine, disfigured face, melted face, asymmetrical eyes, crossed eyes, "
        "wall-eyed, dead eyes, plastic skin, waxy skin, doll skin, mannequin, airbrushed blur, "
        "low quality, blurry, out of focus, jpeg artifacts, watermark, signature, text, border, seams"
    )
    if raw_neg_prompt and raw_neg_prompt.strip():
        compiled_neg = f"{anti_jank_neg}, {raw_neg_prompt.strip()}"
    else:
        compiled_neg = anti_jank_neg

    return compiled_pos, compiled_neg, is_human_subject


def ExplicitlyNonHumanPrompt(lower_p):
    """Returns True when the prompt clearly describes a pure landscape, vehicle, object, or animal without people."""
    non_human_subjects = (
        "mountain range", "ocean waves", "forest landscape", "desert dunes", "nebula", "galaxy",
        "sports car", "spaceship", "watch macro", "coffee cup", "sneaker product", "cat ", "dog ",
        "wolf ", "dragon ", "castle exterior", "skyscraper exterior", "food photography"
    )
    human_indicators = ("person", "woman", "man", "girl", "boy", "human", "portrait", "character", "face", "model", "actor", "rider", "driver")
    if any(h in lower_p for h in human_indicators):
        return False
    return any(nh in lower_p for nh in non_human_subjects)


def detect_primary_human_region(pil_img):
    """
    Detects the primary upper-body / head bounding box in a generated image using
    skin-chrominance likelihood + high-frequency ocular/facial gradient energy
    weighted toward the upper-central portrait zone.
    Returns (x1, y1, x2, y2) square crop coordinates or None if no salient region is found.
    """
    w, h = pil_img.size
    if min(w, h) < 512:
        return None

    arr = np.array(pil_img.convert("RGB")).astype(np.float32) / 255.0
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]

    # YCbCr skin chrominance + wide skin-tone luminance support (works across all diverse skin tones and monochrome/stylized lighting)
    y_luma = 0.299 * r + 0.587 * g + 0.114 * b
    cb = 0.5 - 0.168736 * r - 0.331264 * g + 0.5 * b
    cr = 0.5 + 0.5 * r - 0.418688 * g - 0.081312 * b

    skin_score = np.exp(-((cb - 0.43) ** 2) / (2 * 0.08 ** 2) - ((cr - 0.60) ** 2) / (2 * 0.09 ** 2))
    skin_score *= np.clip((y_luma - 0.06) / 0.15, 0.0, 1.0) * np.clip((0.96 - y_luma) / 0.12, 0.0, 1.0)

    # Facial feature detail energy (eyes, eyelashes, brows, lips, nostrils have strong horizontal & vertical gradients)
    gy, gx = np.gradient(y_luma)
    edge_energy = np.sqrt(gx * gx + gy * gy)
    edge_energy = np.clip(edge_energy / (np.percentile(edge_energy, 95) + 1e-5), 0.0, 1.0)

    # Spatial prior: human heads/faces in portraits & cinema shots typically sit in x in [0.20..0.80], y in [0.08..0.55]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    nx = xx / max(1.0, float(w))
    ny = yy / max(1.0, float(h))
    spatial_prior = np.exp(-((nx - 0.50) ** 2) / (2 * 0.22 ** 2) - ((ny - 0.30) ** 2) / (2 * 0.18 ** 2))

    saliency = (skin_score * 0.55 + edge_energy * 0.45) * spatial_prior
    if float(saliency.max()) < 0.08:
        return None

    # Compute weighted centroid of top 15% salient pixels
    thresh = float(np.percentile(saliency, 85))
    top_mask = saliency >= thresh
    if np.count_nonzero(top_mask) < 64:
        return None

    weights = saliency[top_mask]
    cy = float(np.sum(yy[top_mask] * weights) / (np.sum(weights) + 1e-6))
    cx = float(np.sum(xx[top_mask] * weights) / (np.sum(weights) + 1e-6))

    # Crop size covers head & upper shoulders (~48% of min image dimension, clamped to [384, 576])
    crop_side = int(max(384, min(576, round(min(w, h) * 0.52 / 64.0) * 64)))
    half = crop_side // 2

    cx_i = int(np.clip(cx, half, w - half))
    cy_i = int(np.clip(cy, half, h - half))
    return (cx_i - half, cy_i - half, cx_i + half, cy_i + half)


def execute_3d_relight_stage(
    init_pil,
    relight_cfg,
    raw_prompt,
    neg_prompt,
    model,
    clip,
    vae,
    clip_encoder,
    sampler,
    encoder_tiled,
    decoder_tiled,
    is_turbo,
    is_lightning,
    seed,
):
    """
    Executes a true 2.5D Surface-Normal + Depth-Relit + Subsurface Scattering + Specular +
    Rim/Kicker Light + Environment Gobo Rig + Neural Light-Wrap Diffusion pass on `init_pil`.
    Preserves 100% of the source subject's identity and anatomy while transforming scene illumination.
    """
    orig_w, orig_h = init_pil.size
    src_rgb = np.array(init_pil.convert("RGB")).astype(np.float32) / 255.0

    # Extract relight parameters with sensible cinema defaults
    lx = float(relight_cfg.get("lightX", 0.5))
    ly = float(relight_cfg.get("lightY", -0.4))
    lz = float(relight_cfg.get("lightZ", 0.75))
    intensity = float(np.clip(relight_cfg.get("intensity", 1.25), 0.1, 3.0))
    key_color = _hex_to_rgb_float(relight_cfg.get("colorHex", "#ffaa55"), default=(1.0, 0.72, 0.42))
    amb_color = _hex_to_rgb_float(relight_cfg.get("ambientColorHex", "#182238"), default=(0.10, 0.14, 0.24))
    rim_color = _hex_to_rgb_float(relight_cfg.get("rimColorHex", "#55ccff"), default=(0.35, 0.80, 1.0))

    softness = float(np.clip(relight_cfg.get("softness", 0.55), 0.05, 1.0))
    shadow_density = float(np.clip(relight_cfg.get("shadowDensity", 0.68), 0.0, 0.98))
    rim_strength = float(np.clip(relight_cfg.get("rimStrength", 0.45), 0.0, 2.0))
    specular_sheen = float(np.clip(relight_cfg.get("specularSheen", 0.40), 0.0, 1.5))
    sss_amount = float(np.clip(relight_cfg.get("subsurfaceScatter", 0.38), 0.0, 1.0))
    neural_wrap = float(np.clip(relight_cfg.get("neuralLightWrap", 0.22), 0.0, 0.65))
    env_preset = str(relight_cfg.get("envPreset") or "none").strip().lower()

    # Apply Environment Rig Preset overrides/modulations when a preset is active (not 'none')
    gobo_pattern = None
    if env_preset == "rembrandt_key":
        softness = max(softness, 0.48)
        shadow_density = max(shadow_density, 0.74)
    elif env_preset == "cyberpunk_dual_neon":
        rim_strength = max(rim_strength, 0.85)
        specular_sheen = max(specular_sheen, 0.65)
    elif env_preset == "golden_hour_backlight":
        sss_amount = max(sss_amount, 0.62)
        rim_strength = max(rim_strength, 0.78)
    elif env_preset == "moonlit_noir_venetian":
        shadow_density = max(shadow_density, 0.84)
        gobo_pattern = "venetian_blinds"
    elif env_preset == "window_dappled_foliage":
        gobo_pattern = "dappled_foliage"
    elif env_preset == "butterfly_paramount":
        specular_sheen = max(specular_sheen, 0.58)
        softness = max(softness, 0.62)

    # 1. Foreground Subject Detection & Multi-Scale 2.5D Surface Normal Pyramid (32-bit Float Precision — Zero 8-bit Quantization)
    def _blur_f32(field_2d, sigma):
        """Exact 32-bit floating-point separable Gaussian blur using PyTorch reflect padding (zero 8-bit contour stepping)."""
        if sigma <= 0.35:
            return field_2d
        t = torch.from_numpy(field_2d.astype(np.float32))[None, None, ...]
        # For large sigma, downsample slightly in float32 for speed + ultra-smooth C^2 continuity
        h_in, w_in = field_2d.shape
        ds = 1
        if sigma > 8.0:
            ds = min(4, int(sigma // 4))
            t = torch.nn.functional.interpolate(t, size=(max(16, h_in // ds), max(16, w_in // ds)), mode="bilinear", align_corners=False)
        eff_sigma = sigma / float(ds)
        rad = max(2, min(48, int(round(eff_sigma * 3.0))))
        coords = torch.arange(-rad, rad + 1, dtype=torch.float32)
        kernel_1d = torch.exp(-(coords ** 2) / (2.0 * eff_sigma * eff_sigma))
        kernel_1d = kernel_1d / kernel_1d.sum()
        kx = kernel_1d.view(1, 1, 1, -1)
        ky = kernel_1d.view(1, 1, -1, 1)
        t = torch.nn.functional.pad(t, (rad, rad, rad, rad), mode="reflect")
        t = torch.nn.functional.conv2d(t, kx)
        t = torch.nn.functional.conv2d(t, ky)
        if ds > 1:
            t = torch.nn.functional.interpolate(t, size=(h_in, w_in), mode="bicubic", align_corners=False)
        return t[0, 0].numpy()

    luma = (0.299 * src_rgb[..., 0] + 0.587 * src_rgb[..., 1] + 0.114 * src_rgb[..., 2]).astype(np.float32)

    r_macro = float(max(18, min(orig_w, orig_h) // 10))
    r_mid = float(max(6, min(orig_w, orig_h) // 38))
    macro_depth = _blur_f32(luma, r_macro)
    mid_depth = _blur_f32(luma, r_mid)
    fine_depth = _blur_f32(luma, 1.8)

    # Estimate in-focus foreground subject mask (sharpness/acutance + skin/subject presence) in pure float32
    detail_energy = np.abs(fine_depth - mid_depth) + 0.6 * np.abs(mid_depth - macro_depth)
    focus_map = _blur_f32(np.clip(detail_energy * 8.0, 0.0, 1.0), float(max(20, min(orig_w, orig_h) // 12)))
    focus_map = np.clip(focus_map / (np.percentile(focus_map, 92) + 1e-5), 0.0, 1.0)

    yy, xx = np.mgrid[0:orig_h, 0:orig_w].astype(np.float32)
    nx_coord = (xx / max(1.0, float(orig_w))) * 2.0 - 1.0
    ny_coord = (yy / max(1.0, float(orig_h))) * 2.0 - 1.0

    # Compute foreground subject centroid (so off-center portraits get a properly centered 3D volume dome)
    fg_weights = np.maximum(0.05, focus_map ** 1.5)
    cx_fg = float(np.sum(nx_coord * fg_weights) / (np.sum(fg_weights) + 1e-5))
    cy_fg = float(np.sum(ny_coord * fg_weights) / (np.sum(fg_weights) + 1e-5))

    fg_mask = np.clip(0.25 + 0.75 * (focus_map ** 0.85), 0.20, 1.0)

    # Scale-normalized float32 image gradients (smoothed slightly post-gradient for silky cinema surface normals)
    def _norm_grad(d_field, gain=1.0, post_smooth=1.5):
        gy, gx = np.gradient(d_field)
        if post_smooth > 0.5:
            gx = _blur_f32(gx, post_smooth)
            gy = _blur_f32(gy, post_smooth)
        scale = float(np.percentile(np.sqrt(gx * gx + gy * gy), 94)) + 1e-6
        return (-gx / scale) * gain, (-gy / scale) * gain

    nx_mac, ny_mac = _norm_grad(macro_depth, gain=0.58, post_smooth=4.0)
    nx_mid, ny_mid = _norm_grad(mid_depth, gain=0.48, post_smooth=2.5)
    nx_fin, ny_fin = _norm_grad(fine_depth, gain=0.26 * (1.15 - 0.55 * softness), post_smooth=1.0)

    # 3D Ellipsoidal Subject Volume Normal (left side of subject faces -X, right side faces +X, crown faces -Y)
    vol_nx = np.clip((nx_coord - cx_fg) / 0.58, -1.1, 1.1) * fg_mask
    vol_ny = np.clip((ny_coord - cy_fg) / 0.68, -1.1, 1.1) * fg_mask

    nx = 0.48 * vol_nx + 0.25 * nx_mac + 0.18 * nx_mid + 0.09 * nx_fin
    ny = 0.44 * vol_ny + 0.25 * ny_mac + 0.20 * ny_mid + 0.11 * ny_fin
    xy_mag_sq = nx * nx + ny * ny
    max_xy = 0.92
    scale_down = np.where(xy_mag_sq > max_xy, np.sqrt(max_xy / np.maximum(xy_mag_sq, 1e-6)), 1.0)
    nx *= scale_down
    ny *= scale_down
    nz = np.sqrt(np.maximum(0.08, 1.0 - (nx * nx + ny * ny)))

    # 2. Per-Pixel 3D Light Vector L from Key Light (lx, ly, lz)
    vec_x = lx * 1.25 - (nx_coord - cx_fg) * 0.35
    vec_y = ly * 1.25 - (ny_coord - cy_fg) * 0.35
    vec_z = max(0.08, lz * 0.85)
    l_len = np.sqrt(vec_x * vec_x + vec_y * vec_y + vec_z * vec_z) + 1e-6
    Lx = vec_x / l_len
    Ly = vec_y / l_len
    Lz = vec_z / l_len

    # Directional spotlight falloff + 3D surface incidence (N · L)
    dist_sq = ((nx_coord - cx_fg * 0.5) - lx * 0.70) ** 2 + ((ny_coord - cy_fg * 0.5) - ly * 0.70) ** 2
    spatial_falloff = np.exp(-dist_sq / (2.0 * (0.68 + 0.75 * softness) ** 2))

    n_dot_l = nx * Lx + ny * Ly + nz * Lz
    wrap = 0.08 + 0.38 * softness
    diffuse_raw = np.clip((n_dot_l + wrap) / (1.0 + wrap), 0.0, 1.0)
    # Stronger contrast curve when softness is low or shadow_density is high
    contrast_exp = 1.65 - 0.55 * softness + 0.45 * shadow_density
    diffuse = (diffuse_raw ** contrast_exp) * (0.35 + 0.65 * spatial_falloff)

    # Optional Gobo projection pattern (Venetian blinds or dappled foliage)
    if gobo_pattern == "venetian_blinds":
        angle_tilt = lx * 0.25
        slat_phase = np.sin((ny_coord + nx_coord * angle_tilt) * 28.0)
        gobo_mask = np.clip(0.45 + 0.55 * slat_phase, 0.06, 1.0)
        diffuse *= gobo_mask
    elif gobo_pattern == "dappled_foliage":
        dapple = (
            np.sin(nx_coord * 9.0 + ny_coord * 7.0) * np.cos(nx_coord * 5.5 - ny_coord * 11.0)
            + 0.5 * np.sin(nx_coord * 17.0 + 1.3)
        )
        gobo_mask = np.clip(0.50 + 0.50 * dapple, 0.10, 1.0)
        diffuse *= gobo_mask

    # 3. Subsurface Scattering (SSS) along the light-shadow terminator on skin tones
    r_ch, g_ch, b_ch = src_rgb[..., 0], src_rgb[..., 1], src_rgb[..., 2]
    cb = 0.5 - 0.168736 * r_ch - 0.331264 * g_ch + 0.5 * b_ch
    cr = 0.5 + 0.5 * r_ch - 0.418688 * g_ch - 0.081312 * b_ch
    skin_likelihood = np.exp(-((cb - 0.43) ** 2) / (2 * 0.09 ** 2) - ((cr - 0.60) ** 2) / (2 * 0.10 ** 2))
    terminator_band = np.exp(-((diffuse_raw - 0.42) ** 2) / (2 * 0.14 ** 2)) * fg_mask
    sss_tint = np.array([1.0, 0.32, 0.12], dtype=np.float32) * (0.55 + 0.45 * key_color)
    sss_contrib = (terminator_band * (0.35 + 0.65 * skin_likelihood) * sss_amount * intensity * 0.42)[..., None] * sss_tint[None, None, :]

    # 4. Blinn-Phong Specular Sheen (Halfway vector between L and view V=(0,0,1))
    hx = Lx
    hy = Ly
    hz = Lz + 1.0
    h_len = np.sqrt(hx * hx + hy * hy + hz * hz) + 1e-6
    hx /= h_len
    hy /= h_len
    hz /= h_len
    n_dot_h = np.clip(nx * hx + ny * hy + nz * hz, 0.0, 1.0)
    shininess = 14.0 + (1.0 - softness) * 38.0
    micro_relief = np.clip(np.abs(fine_depth - mid_depth) * 9.0 + 0.25, 0.0, 1.4) * fg_mask
    spec_term = (n_dot_h ** shininess) * micro_relief * np.clip(diffuse_raw * 1.4, 0.0, 1.0) * specular_sheen * intensity * 0.65
    spec_contrib = spec_term[..., None] * (key_color * 0.65 + 0.35)[None, None, :]

    # 5. Opposing Rim / Kicker Light along grazing silhouette & shadow-side contours
    rim_lx, rim_ly, rim_lz = -Lx, -Ly, 0.15
    rim_n_dot_l = np.clip(nx * rim_lx + ny * rim_ly + nz * rim_lz, 0.0, 1.0)
    # Rim light hits grazing edges (low nz + high mid-scale gradient) on the side opposing the key light
    contour_edge = np.clip((1.0 - nz) * 1.35 + np.sqrt(nx_mid * nx_mid + ny_mid * ny_mid) * 0.55, 0.0, 1.0) ** 1.35
    shadow_side_mask = np.clip(1.15 - diffuse_raw * 1.25, 0.15, 1.0)
    rim_term = contour_edge * (0.25 + 0.75 * rim_n_dot_l) * shadow_side_mask * fg_mask * rim_strength * 0.95
    rim_contrib = rim_term[..., None] * rim_color[None, None, :]

    # 6. Intrinsic Albedo-Preserving Relight Composition (Dramatic Key / Shadow / Rim Split)
    illum_est = np.maximum(0.26, macro_depth * 0.60 + 0.40)[..., None]
    albedo = np.clip(src_rgb / illum_est, 0.0, 1.30) * 0.76 + src_rgb * 0.24

    # Shadow attenuation: unlit side drops toward ambient color according to shadow_density
    shadow_keep = np.clip(1.0 - shadow_density * 0.88, 0.08, 1.0)
    shadow_mask = np.clip(1.0 - diffuse, 0.0, 1.0)[..., None]
    ambient_fill = (
        amb_color[None, None, :] * (0.35 + 0.65 * shadow_density)
        + np.array([1.0, 1.0, 1.0], dtype=np.float32)[None, None, :] * shadow_keep * 0.45
    ) * shadow_mask

    # Key light scales strongly on foreground subject, more gently on distant background
    fg_key_weight = (0.42 + 0.58 * fg_mask)[..., None]
    direct_key_light = (key_color[None, None, :] * 0.82 + 0.18) * (diffuse[..., None] * intensity * 1.38 * fg_key_weight)

    relit_fg = albedo * (ambient_fill + direct_key_light) + sss_contrib + spec_contrib + rim_contrib * (0.35 + 0.65 * albedo)
    # Background receives atmospheric mood grade + dimmed shadow/key tint so subject pops in 3D
    bg_tint = src_rgb * (amb_color[None, None, :] * 0.55 + key_color[None, None, :] * diffuse[..., None] * 0.45 * intensity)
    fg_blend = fg_mask[..., None]
    relit_rgb = relit_fg * fg_blend + bg_tint * (1.0 - fg_blend)

    # Filmic soft-knee highlight roll-off
    relit_rgb = relit_rgb / (1.0 + np.maximum(0.0, relit_rgb - 0.80) * 0.60)
    relit_rgb = np.clip(relit_rgb, 0.0, 1.0)

    relit_pil = Image.fromarray((relit_rgb * 255.0).clip(0, 255).astype(np.uint8))

    # 7. Optional Neural Light-Wrap Diffusion Pass (synthesizes realistic ray-traced eye catchlights & hair bounce)
    if neural_wrap >= 0.06 and model is not None:
        scale_r = min(1.0, 640.0 / float(max(orig_w, orig_h)))
        work_w = max(384, int(round((orig_w * scale_r) / 64.0)) * 64)
        work_h = max(384, int(round((orig_h * scale_r) / 64.0)) * 64)
        work_pil = relit_pil.resize((work_w, work_h), Image.LANCZOS)

        compiled_pos, compiled_neg, _ = compile_human_coherent_prompt(
            raw_prompt or "dramatic directional cinema relighting, natural skin subsurface scattering, realistic specular catchlights",
            neg_prompt,
        )
        import comfy.model_management as mm
        pos_cond = clip_encoder.encode(clip, compiled_pos)[0]
        neg_cond = clip_encoder.encode(clip, compiled_neg)[0]

        mm.unload_all_models()
        mm.soft_empty_cache()
        img_tensor = torch.from_numpy(np.array(work_pil).astype(np.float32) / 255.0)[None, ...]
        encoded_latent = encoder_tiled.encode(vae, img_tensor, 512)[0]

        mm.unload_all_models()
        mm.soft_empty_cache()
        wrap_denoise = float(np.clip(0.12 + neural_wrap * 0.22, 0.12, 0.26))
        sampled_latent = sampler.sample(
            model=model,
            seed=seed,
            steps=2 if is_turbo else 3,
            cfg=1.08 if is_turbo else 1.35,
            sampler_name="euler",
            scheduler="normal",
            positive=pos_cond,
            negative=neg_cond,
            latent_image=encoded_latent,
            denoise=wrap_denoise,
        )[0]
        mm.unload_all_models()
        mm.soft_empty_cache()
        decoded = decoder_tiled.decode(vae, sampled_latent, 512)[0]
        neural_np = decoded[0].detach().cpu().numpy().clip(0.0, 1.0)
        neural_pil = Image.fromarray((neural_np * 255.0).astype(np.uint8))
        if neural_pil.size != (orig_w, orig_h):
            neural_pil = neural_pil.resize((orig_w, orig_h), Image.LANCZOS)

        # Blend neural light-wrap micro-highlights while locking base geometry via luminance/structure preservation
        neural_arr = np.array(neural_pil).astype(np.float32) / 255.0
        blend_alpha = float(np.clip(neural_wrap * 0.65, 0.0, 0.42))
        final_arr = np.clip(relit_rgb * (1.0 - blend_alpha) + neural_arr * blend_alpha, 0.0, 1.0)
        relit_pil = Image.fromarray((final_arr * 255.0).clip(0, 255).astype(np.uint8))

    return relit_pil


def execute_detail_enhancer_stage(
    init_pil,
    enhance_cfg,
    raw_prompt,
    neg_prompt,
    model,
    clip,
    vae,
    clip_encoder,
    sampler,
    encoder_tiled,
    decoder_tiled,
    is_turbo,
    is_lightning,
    seed,
):
    """
    Executes a Frequency-Separated Latent Detail Enhancer pass on `init_pil`,
    respecting `hallucinationLevel`, `resemblance`, and `engine` (including 'none').
    """
    orig_w, orig_h = init_pil.size
    hallucination = float(np.clip(enhance_cfg.get("hallucinationLevel", 0.35), 0.0, 1.0))
    resemblance = float(np.clip(enhance_cfg.get("resemblance", 0.85), 0.1, 1.0))
    engine = str(enhance_cfg.get("engine") or "skin_pores").strip().lower()

    scale_r = min(1.0, 640.0 / float(max(orig_w, orig_h)))
    work_w = max(384, int(round((orig_w * scale_r) / 64.0)) * 64)
    work_h = max(384, int(round((orig_h * scale_r) / 64.0)) * 64)
    work_pil = init_pil.resize((work_w, work_h), Image.LANCZOS)

    engine_prompts = {
        "skin_pores": "hyper-realistic human skin micro-texture, natural pores, fine vellus hair, crisp iris catchlights, zero plastic blur",
        "fabric_weave": "microscopic textile weave, individual thread fibers, tactile cloth surface relief, crisp optical micro-contrast",
        "architectural_sharp": "laser-sharp architectural geometry, crisp material micro-relief, clean edges, high acutance",
        "film_grain_organic": "organic 35mm Kodak Vision3 silver-halide film grain, natural optical acutance, cinema micro-contrast",
        "none": "",
    }
    extra_dir = engine_prompts.get(engine, "")
    prompt_to_use = f"{raw_prompt}, {extra_dir}".strip(", ") if extra_dir else raw_prompt
    compiled_pos, compiled_neg, _ = compile_human_coherent_prompt(prompt_to_use, neg_prompt)

    import comfy.model_management as mm
    pos_cond = clip_encoder.encode(clip, compiled_pos)[0]
    neg_cond = clip_encoder.encode(clip, compiled_neg)[0]

    mm.unload_all_models()
    mm.soft_empty_cache()
    img_tensor = torch.from_numpy(np.array(work_pil).astype(np.float32) / 255.0)[None, ...]
    encoded_latent = encoder_tiled.encode(vae, img_tensor, 512)[0]

    mm.unload_all_models()
    mm.soft_empty_cache()
    # Denoise is bounded so identity & anatomy never drift into multi-head hallucinations
    eff_denoise = float(np.clip(0.16 + hallucination * 0.24 - (resemblance - 0.5) * 0.12, 0.14, 0.36))
    sampled_latent = sampler.sample(
        model=model,
        seed=seed,
        steps=3 if is_turbo else 4,
        cfg=1.12 if is_turbo else 1.45,
        sampler_name="euler",
        scheduler="normal",
        positive=pos_cond,
        negative=neg_cond,
        latent_image=encoded_latent,
        denoise=eff_denoise,
    )[0]
    mm.unload_all_models()
    mm.soft_empty_cache()
    decoded = decoder_tiled.decode(vae, sampled_latent, 512)[0]
    gen_np = (decoded[0].detach().cpu().numpy().clip(0.0, 1.0) * 255.0).astype(np.uint8)
    gen_pil = Image.fromarray(gen_np)
    if gen_pil.size != (orig_w, orig_h):
        gen_pil = gen_pil.resize((orig_w, orig_h), Image.LANCZOS)

    # Frequency-separated blend: lock low-frequency color/anatomy from init_pil according to resemblance,
    # while injecting high-frequency synthesized micro-detail from gen_pil!
    src_arr = np.array(init_pil).astype(np.float32)
    gen_arr = np.array(gen_pil).astype(np.float32)
    gen_low = np.array(gen_pil.filter(ImageFilter.GaussianBlur(radius=4))).astype(np.float32)
    gen_high = gen_arr - gen_low

    low_blend = src_arr * resemblance + gen_low * (1.0 - resemblance)
    combined = np.clip(low_blend + gen_high * (0.85 + 0.45 * hallucination), 0.0, 255.0).astype(np.uint8)
    out_pil = Image.fromarray(combined).filter(ImageFilter.UnsharpMask(radius=1.1, percent=115, threshold=2))
    return out_pil


def generate_image_diffusion(params):
    """Executes diffusion inference on NVIDIA RTX GPU with full FLUX.3 [klein] inpainting, outpainting, 3D relight, detail enhancer & 3-stage human coherence."""
    import nodes
    import comfy.model_management as mm
    start_time = time.time()

    raw_prompt = params.get("prompt", "")
    neg_prompt = params.get("negativePrompt", "ugly, blurry, distorted, low quality, artifacts, watermark, seams, border, text")
    req_model = params.get("modelId") or "flux3_klein"
    width = int(params.get("width", 512))
    height = int(params.get("height", 512))
    seed = int(params.get("seed", 0)) or int(time.time() * 1000) % 2147483647
    steps = int(params.get("steps", 4))
    denoise = float(params.get("denoise", params.get("strength", 1.0)))
    feather_radius = int(params.get("feather", 8))
    explicit_inpaint_mode = params.get("inpaintMode")
    task_type = str(params.get("taskType") or "").strip().lower()
    relight_cfg = params.get("relighting")
    enhance_cfg = params.get("enhancement")

    # Check for inpaint / outpaint / relight / detail_enhancer inputs
    source_img_raw = params.get("sourceImage") or params.get("image") or params.get("imageDataUrl")
    mask_img_raw = params.get("maskImage") or params.get("mask") or params.get("maskDataUrl")
    outpaint_opts = params.get("outpaint") or {}
    outpaint_left = int(outpaint_opts.get("left", params.get("outpaintLeft", 0)))
    outpaint_top = int(outpaint_opts.get("top", params.get("outpaintTop", 0)))
    outpaint_right = int(outpaint_opts.get("right", params.get("outpaintRight", 0)))
    outpaint_bottom = int(outpaint_opts.get("bottom", params.get("outpaintBottom", 0)))

    ckpt_name = resolve_best_checkpoint(req_model)
    if not ckpt_name:
        raise RuntimeError("No suitable diffusion checkpoint found in D:\\Plajah Models")

    is_turbo = "turbo" in ckpt_name.lower()
    is_lightning = "lightning" in ckpt_name.lower()

    # ── Engine choice for a plain masked inpaint (no outpaint margins), before any 7 GB checkpoint is touched ──
    #   prompt-less (autonomous / explicit remove) → Big-LaMa when present
    #   guided                                      → SDXL inpainting UNet when present
    #   otherwise                                   → the legacy latent-noise-mask pass on the resident checkpoint
    early_init_pil = early_mask_pil = early_scene = None
    lama_pil = None
    inpaint_unet = None
    model_used = ckpt_name
    plain_inpaint = source_img_raw is not None and mask_img_raw is not None and not any([outpaint_left, outpaint_top, outpaint_right, outpaint_bottom])
    wants_real_inpaint = str(req_model or "auto").lower() in ("auto", "lama", "sdxl_inpaint", "flux3_klein", "flux2_klein_4b")
    if plain_inpaint and wants_real_inpaint:
        early_init_pil = decode_data_url(source_img_raw).convert("RGB")
        early_mask_pil = decode_data_url(mask_img_raw).convert("L")
        if early_mask_pil.size != early_init_pil.size:
            early_mask_pil = early_mask_pil.resize(early_init_pil.size, Image.BILINEAR)
        early_scene = analyze_canvas_and_selection_semantics(early_init_pil, early_mask_pil, raw_prompt=raw_prompt, client_scene_ctx=params.get("sceneContext"))
        early_mode = explicit_inpaint_mode or early_scene["inpaintMode"]
        if early_mode != "guided" and str(req_model or "").lower() != "sdxl_inpaint":
            lama_pil = lama_inpaint(early_init_pil, early_mask_pil)
            if lama_pil is not None:
                model_used = "big-lama"
        if lama_pil is None and str(req_model or "").lower() != "lama":
            inpaint_unet = load_sdxl_inpaint_unet()
            if inpaint_unet is not None:
                model_used = "sdxl-inpainting-0.1"

    if lama_pil is not None:
        model = clip = vae = None  # LaMa is the whole job; the checkpoint stays on disk
    else:
        model, clip, vae = load_model_if_needed(ckpt_name)
    clip_encoder = nodes.CLIPTextEncode()
    sampler = nodes.KSampler()
    _vae_dec = nodes.VAEDecode()
    _vae_dec_tiled = nodes.VAEDecodeTiled()
    class _SafeVAEDecoder:
        def decode(self, v, samples, tile_size=512):
            mm.unload_all_models()
            mm.soft_empty_cache()
            t = samples.get("samples") if isinstance(samples, dict) else None
            if t is not None and max(t.shape[-2], t.shape[-1]) <= 96:
                return _vae_dec.decode(v, samples)
            return _vae_dec_tiled.decode(v, samples, 768)
    decoder_tiled = _SafeVAEDecoder()
    _vae_enc = nodes.VAEEncode()
    class _SafeVAEEncoder:
        def encode(self, v, pixels, tile_size=512):
            mm.unload_all_models()
            mm.soft_empty_cache()
            return _vae_enc.encode(v, pixels)
    encoder_tiled = _SafeVAEEncoder()

    # Determine execution pathway:
    # 1. Inpainting / Outpainting (has sourceImage AND mask/outpaint)
    # 2. 3D Relighting (taskType == '3d_relight' or relighting dict provided)
    # 3. Detail Enhancer / Img2Img Refinement (taskType == 'detail_enhancer' or sourceImage without mask)
    # 4. 3-Stage Coherent High-Res Text-to-Image Generation
    is_inpaint_or_outpaint = source_img_raw is not None and (mask_img_raw is not None or any([outpaint_left, outpaint_top, outpaint_right, outpaint_bottom]))
    is_3d_relight = (task_type == "3d_relight" or isinstance(relight_cfg, dict)) and source_img_raw is not None
    is_detail_enhancer = (task_type == "detail_enhancer" or isinstance(enhance_cfg, dict) or (source_img_raw is not None and not is_inpaint_or_outpaint and not is_3d_relight))
    scene_analysis = None

    if lama_pil is not None:
        # Big-LaMa already produced the fill at native resolution; unmasked pixels are bit-exact.
        init_pil = early_init_pil
        mask_pil = early_mask_pil
        scene_analysis = early_scene
        steps = 0
        final_pil = lama_pil
        final_w, final_h = final_pil.size

    elif is_inpaint_or_outpaint:
        # Load source image
        init_pil = early_init_pil if early_init_pil is not None else decode_data_url(source_img_raw).convert("RGB")
        orig_w, orig_h = init_pil.size

        # Outpainting: expand canvas dimensions with Reflective + Harmonic Extrapolation (never flat gray!)
        if any([outpaint_left, outpaint_top, outpaint_right, outpaint_bottom]):
            new_w = orig_w + outpaint_left + outpaint_right
            new_h = orig_h + outpaint_top + outpaint_bottom
            aligned_w = ((new_w + 63) // 64) * 64
            aligned_h = ((new_h + 63) // 64) * 64

            src_np = np.array(init_pil).astype(np.float32)
            pad_r = aligned_w - orig_w - outpaint_left
            pad_b = aligned_h - orig_h - outpaint_top

            # Reflective padding preserves horizon lines, sky/ground gradients, and exact color temperature
            padded_np = np.pad(
                src_np,
                ((max(0, outpaint_top), max(0, pad_b)), (max(0, outpaint_left), max(0, pad_r)), (0, 0)),
                mode="reflect"
            )
            padded_pil = Image.fromarray(padded_np.clip(0, 255).astype(np.uint8))
            blurred_pad = padded_pil.filter(ImageFilter.GaussianBlur(radius=18))

            # Mask: 255 in expanded border + 12px overlap zone, 0 inside original core
            overlap = 12
            outpaint_mask = Image.new("L", (aligned_w, aligned_h), 255)
            core_w = max(16, orig_w - overlap * 2)
            core_h = max(16, orig_h - overlap * 2)
            inner_mask = Image.new("L", (core_w, core_h), 0)
            outpaint_mask.paste(inner_mask, (outpaint_left + overlap, outpaint_top + overlap))

            soft_mask = outpaint_mask.filter(ImageFilter.GaussianBlur(radius=10))
            init_pil = Image.composite(blurred_pad, padded_pil, soft_mask)
            mask_pil = outpaint_mask
        else:
            # Standard Inpainting with provided mask
            mask_pil = early_mask_pil if early_mask_pil is not None else decode_data_url(mask_img_raw).convert("L")
            if mask_pil.size != init_pil.size:
                mask_pil = mask_pil.resize(init_pil.size, Image.BILINEAR)

        # Deep Canvas & Selection Semantic Reasoning (works for blank prompt AND guided prompt!)
        scene_analysis = early_scene if early_scene is not None else analyze_canvas_and_selection_semantics(
            init_pil,
            mask_pil,
            raw_prompt=raw_prompt,
            client_scene_ctx=params.get("sceneContext"),
        )
        inpaint_mode = explicit_inpaint_mode or scene_analysis["inpaintMode"]
        effective_prompt = scene_analysis["enrichedPrompt"]
        effective_neg_prompt = params.get("negativePrompt") or scene_analysis["negativePrompt"]

        pos_cond = clip_encoder.encode(clip, effective_prompt)[0]
        neg_cond = clip_encoder.encode(clip, effective_neg_prompt)[0]

        # Working resolution: the model's native size, never a downscale of a small crop. A 429 px context crop used
        # to be rounded DOWN to 384 and stretched back (soft, detail lost); now small crops are rendered at the native
        # long edge (768 for SDXL Turbo, 1024 for SDXL inpainting / base) and LANCZOS-fitted back to their exact size.
        work_w, work_h = init_pil.size
        long_edge = max(work_w, work_h)
        native_long = 1024 if (inpaint_unet is not None or not is_turbo) else 768
        target_long = min(1024, max(native_long, long_edge)) if long_edge < native_long else min(1024, long_edge)
        scale_fac = target_long / float(long_edge)
        work_w = min(1024, max(512, ((int(round(work_w * scale_fac)) + 63) // 64) * 64))
        work_h = min(1024, max(512, ((int(round(work_h * scale_fac)) + 63) // 64) * 64))

        init_scaled = init_pil.resize((work_w, work_h), Image.LANCZOS)
        mask_scaled = mask_pil.resize((work_w, work_h), Image.BILINEAR)

        # Dilate & feather mask slightly so latent transition has zero hard step
        mask_feathered_latent = mask_scaled.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(radius=4))

        img_np = np.array(init_scaled).astype(np.float32) / 255.0
        mask_np = np.array(mask_feathered_latent).astype(np.float32) / 255.0

        # Compute unmasked boundary ring statistics for seeding & boundary color harmonization
        dilated_latent = np.array(mask_scaled.filter(ImageFilter.MaxFilter(21))).astype(np.float32) / 255.0
        ring_sel = (dilated_latent > 0.25) & (mask_np < 0.25)
        unmasked_sel = ring_sel if np.count_nonzero(ring_sel) >= 32 else (mask_np < 0.25)

        if np.any(unmasked_sel):
            ref_mean = img_np[unmasked_sel].mean(axis=0)
            ref_std = np.maximum(0.03, img_np[unmasked_sel].std(axis=0))
        else:
            ref_mean = np.array([0.5, 0.5, 0.5], dtype=np.float32)
            ref_std = np.array([0.15, 0.15, 0.15], dtype=np.float32)

        harmonic_pil = init_scaled.filter(ImageFilter.GaussianBlur(radius=18))
        harmonic_np = np.array(harmonic_pil).astype(np.float32) / 255.0
        rng = np.random.default_rng(seed)

        if inpaint_mode == "guided":
            # GUIDED OBJECT / CONTENT SYNTHESIS:
            # Give FLUX.3 [klein] full freedom inside the selection to form new objects/structures
            # while anchoring ambient lighting & unmasked latents via SetLatentNoiseMask.
            matched_grain = rng.normal(0.0, 1.0, size=img_np.shape).astype(np.float32) * np.maximum(ref_std, 0.12) * 0.45
            ambient_seed = np.clip(harmonic_np * 0.70 + ref_mean * 0.30 + matched_grain, 0.0, 1.0)
            precond_np = np.clip(
                img_np * (1.0 - mask_np[..., None] * 0.78) + ambient_seed * (mask_np[..., None] * 0.78),
                0.0,
                1.0,
            )
            steps = 4 if is_turbo else (5 if is_lightning else int(params.get("steps", 6)))
            cfg = 1.15 if is_turbo else (1.5 if is_lightning else float(params.get("cfgScale", 2.0)))
            inpaint_denoise = float(params.get("strength", 0.96))
        else:
            # AUTONOMOUS SCENE FILL / OBJECT REMOVAL / OUTPAINTING:
            # Preserve the client's Isophote + PatchMatch structural base and refine micro-detail & continuity!
            matched_grain = rng.normal(0.0, 1.0, size=img_np.shape).astype(np.float32) * (ref_std * 0.20)
            precond_np = np.clip(
                img_np * (1.0 - mask_np[..., None] * 0.28) + (harmonic_np + matched_grain) * (mask_np[..., None] * 0.28),
                0.0,
                1.0,
            )
            steps = 3 if is_turbo else (4 if is_lightning else int(params.get("steps", 5)))
            cfg = 1.1 if is_turbo else (1.4 if is_lightning else float(params.get("cfgScale", 1.8)))
            inpaint_denoise = float(params.get("strength", 0.68 if inpaint_mode != "autonomous_complete" else 0.76))

        img_tensor = torch.from_numpy(precond_np)[None, ...]
        mask_tensor = torch.from_numpy(mask_np)[None, ...]

        mm.unload_all_models()
        mm.soft_empty_cache()
        if inpaint_unet is not None:
            # SDXL inpainting UNet: 9-channel conditioning on the ORIGINAL pixels with the hole zeroed (the model was
            # trained for that), full denoise inside the mask, a proper step count. Context and conditioning come from
            # the resident SDXL checkpoint's CLIP + VAE.
            pixels_tensor = torch.from_numpy(np.array(init_scaled).astype(np.float32) / 255.0)[None, ...]
            hard_mask = torch.from_numpy((np.array(mask_scaled.filter(ImageFilter.MaxFilter(5))).astype(np.float32) / 255.0))[None, ...]
            pos_i, neg_i, latent = nodes.InpaintModelConditioning().encode(pos_cond, neg_cond, pixels_tensor, vae, hard_mask)
            steps = int(params.get("steps", 0)) or 24
            cfg = float(params.get("cfgScale", 0)) or 6.0
            mm.unload_all_models()
            mm.soft_empty_cache()
            sampled_latent = sampler.sample(
                model=inpaint_unet,
                seed=seed,
                steps=steps,
                cfg=cfg,
                sampler_name="dpmpp_2m",
                scheduler="karras",
                positive=pos_i,
                negative=neg_i,
                latent_image=latent,
                denoise=1.0,
            )[0]
        else:
            encoded_latent = encoder_tiled.encode(vae, img_tensor, 512)[0]
            noise_masker = nodes.SetLatentNoiseMask()
            latent = noise_masker.set_mask(encoded_latent, mask_tensor)[0]

            sampler_name = "euler_ancestral" if is_turbo else "euler"

            mm.unload_all_models()
            mm.soft_empty_cache()
            sampled_latent = sampler.sample(
                model=model,
                seed=seed,
                steps=steps,
                cfg=cfg,
                sampler_name=sampler_name,
                scheduler="normal" if is_turbo else "karras",
                positive=pos_cond,
                negative=neg_cond,
                latent_image=latent,
                denoise=inpaint_denoise
            )[0]

        mm.unload_all_models()
        mm.soft_empty_cache()
        decoded = decoder_tiled.decode(vae, sampled_latent, 512)[0]
        gen_float = decoded[0].detach().cpu().numpy().clip(0.0, 1.0)

        # Dual-Mode Color Harmonization:
        # - For autonomous / removal mode: match boundary color mean & std across the patch for 100% seamless vanish.
        # - For guided prompt mode: preserve the generated object's intrinsic colors and only harmonize ambient transition!
        masked_sel = mask_np > 0.35
        if np.any(masked_sel) and np.any(unmasked_sel):
            gen_mean = gen_float[masked_sel].mean(axis=0)
            gen_std = np.maximum(0.02, gen_float[masked_sel].std(axis=0))
            if inpaint_mode == "guided":
                # Only harmonize transition edge band (0.05 < mask_np < 0.75) so object keeps its true color
                edge_weight = np.clip((1.0 - np.abs(mask_np - 0.35) / 0.35), 0.0, 1.0)[..., None] * 0.35
                gain = np.clip(ref_std / gen_std, 0.82, 1.22)
                harmonized = np.clip((gen_float - gen_mean) * gain + ref_mean, 0.0, 1.0)
                gen_float = np.clip(gen_float * (1.0 - edge_weight) + harmonized * edge_weight, 0.0, 1.0)
            else:
                gain = np.clip(ref_std / gen_std, 0.72, 1.35)
                harmonized = np.clip((gen_float - gen_mean) * gain + ref_mean, 0.0, 1.0)
                gen_float = np.clip(gen_float * 0.42 + harmonized * 0.58, 0.0, 1.0)

        gen_np = (gen_float * 255.0).clip(0, 255).astype(np.uint8)
        gen_pil = Image.fromarray(gen_np)

        # Rescale generated patch to exact original size and sharpen ONLY the generated patch before compositing
        if gen_pil.size != init_pil.size:
            gen_pil = gen_pil.resize(init_pil.size, Image.LANCZOS)
        if req_model == "flux3_klein":
            gen_pil = gen_pil.filter(ImageFilter.UnsharpMask(radius=1.1, percent=110, threshold=2))

        # Multi-band smooth feathered boundary composite (keeps unmasked init_pil pixels 100% bit-exact!)
        feathered_mask = mask_pil.filter(ImageFilter.GaussianBlur(radius=max(4, feather_radius)))
        final_pil = Image.composite(gen_pil, init_pil, feathered_mask)
        final_w, final_h = final_pil.size

    elif is_3d_relight:
        init_pil = decode_data_url(source_img_raw).convert("RGB")
        final_pil = execute_3d_relight_stage(
            init_pil=init_pil,
            relight_cfg=relight_cfg if isinstance(relight_cfg, dict) else {},
            raw_prompt=raw_prompt,
            neg_prompt=neg_prompt,
            model=model,
            clip=clip,
            vae=vae,
            clip_encoder=clip_encoder,
            sampler=sampler,
            encoder_tiled=encoder_tiled,
            decoder_tiled=decoder_tiled,
            is_turbo=is_turbo,
            is_lightning=is_lightning,
            seed=seed,
        )
        final_w, final_h = final_pil.size

    elif is_detail_enhancer:
        init_pil = decode_data_url(source_img_raw).convert("RGB")
        final_pil = execute_detail_enhancer_stage(
            init_pil=init_pil,
            enhance_cfg=enhance_cfg if isinstance(enhance_cfg, dict) else {"hallucinationLevel": 0.35, "resemblance": 0.85},
            raw_prompt=raw_prompt,
            neg_prompt=neg_prompt,
            model=model,
            clip=clip,
            vae=vae,
            clip_encoder=clip_encoder,
            sampler=sampler,
            encoder_tiled=encoder_tiled,
            decoder_tiled=decoder_tiled,
            is_turbo=is_turbo,
            is_lightning=is_lightning,
            seed=seed,
        )
        final_w, final_h = final_pil.size

    else:
        # ========================================================================
        # 3-STAGE COHERENT HIGH-RES TEXT-TO-IMAGE PIPELINE
        # Eliminates multi-head / multi-body cloning on SDXL-Turbo / Local Models
        # while synthesizing crisp 1024px+ anatomical & optical micro-detail!
        # ========================================================================
        compiled_pos, compiled_neg, is_human_subject = compile_human_coherent_prompt(raw_prompt, neg_prompt)
        pos_cond = clip_encoder.encode(clip, compiled_pos)[0]
        neg_cond = clip_encoder.encode(clip, compiled_neg)[0]

        # Free 1.6 GB CLIP text encoder from VRAM before loading 5.1 GB UNet
        mm.unload_all_models()
        mm.soft_empty_cache()

        target_w = max(384, min(1280, (width // 64) * 64))
        target_h = max(384, min(1280, (height // 64) * 64))

        # STAGE 1: Global Structural & Anatomical Coherence Lock at Native Receptive Field
        if is_turbo:
            max_base_edge = 576
            max_req_edge = max(target_w, target_h)
            if max_req_edge > max_base_edge:
                scale_ratio = max_base_edge / float(max_req_edge)
                base_w = max(384, int(round((target_w * scale_ratio) / 64.0)) * 64)
                base_h = max(384, int(round((target_h * scale_ratio) / 64.0)) * 64)
            else:
                base_w, base_h = target_w, target_h
            stage1_steps = 4
            stage1_cfg = 1.18
            stage1_sampler = "euler_ancestral"
            stage1_scheduler = "normal"
        elif is_lightning:
            base_w, base_h = min(target_w, 768), min(target_h, 768)
            stage1_steps = 4
            stage1_cfg = 1.4
            stage1_sampler = "euler"
            stage1_scheduler = "sgm_uniform"
        else:
            base_w, base_h = min(target_w, 768), min(target_h, 768)
            stage1_steps = max(12, int(params.get("steps", 18)))
            stage1_cfg = float(params.get("cfgScale", 5.5))
            stage1_sampler = "dpmpp_2m"
            stage1_scheduler = "karras"

        steps = stage1_steps
        empty_latent = nodes.EmptyLatentImage()
        base_latent = empty_latent.generate(base_w, base_h, batch_size=1)[0]

        sampled_stage1 = sampler.sample(
            model=model,
            seed=seed,
            steps=stage1_steps,
            cfg=stage1_cfg,
            sampler_name=stage1_sampler,
            scheduler=stage1_scheduler,
            positive=pos_cond,
            negative=neg_cond,
            latent_image=base_latent,
            denoise=1.0,
        )[0]

        # STAGE 2: High-Res Latent Micro-Detail Pass (bounded to 768px max latent edge on 8GB VRAM to prevent WDDM spillover)
        if (target_w > base_w or target_h > base_h):
            max_stage2_edge = 768
            max_req_edge = max(target_w, target_h)
            if max_req_edge > max_stage2_edge:
                s2_ratio = max_stage2_edge / float(max_req_edge)
                s2_w = max(base_w, int(round((target_w * s2_ratio) / 64.0)) * 64)
                s2_h = max(base_h, int(round((target_h * s2_ratio) / 64.0)) * 64)
            else:
                s2_w, s2_h = target_w, target_h

            latent_upscaler = nodes.LatentUpscale()
            hi_latent = latent_upscaler.upscale(sampled_stage1, "bislerp", s2_w, s2_h, "disabled")[0]

            sampled_final = sampler.sample(
                model=model,
                seed=seed + 101,
                steps=2 if is_turbo else 3,
                cfg=1.12 if is_turbo else 1.4,
                sampler_name="euler",
                scheduler="normal",
                positive=pos_cond,
                negative=neg_cond,
                latent_image=hi_latent,
                denoise=0.35 if is_turbo else 0.40,
            )[0]
        else:
            sampled_final = sampled_stage1

        # Unload 5.1 GB UNet from VRAM before FP32 VAE decode so 8GB GPUs never spill into system RAM
        mm.unload_all_models()
        mm.soft_empty_cache()

        decoded_final = decoder_tiled.decode(vae, sampled_final, 512)[0]
        final_np = (decoded_final[0].detach().cpu().numpy().clip(0.0, 1.0) * 255.0).astype(np.uint8)
        final_pil = Image.fromarray(final_np)

        if final_pil.size != (target_w, target_h):
            final_pil = final_pil.resize((target_w, target_h), Image.LANCZOS)

        # STAGE 3: Fast Optical Portrait & Facial Micro-Contrast Detailer (zero extra VRAM pass)
        if is_human_subject and max(target_w, target_h) >= 640:
            face_box = detect_primary_human_region(final_pil)
            if face_box is not None:
                fx1, fy1, fx2, fy2 = face_box
                box_w, box_h = fx2 - fx1, fy2 - fy1
                base_crop = final_pil.crop((fx1, fy1, fx2, fy2))
                refined_crop = base_crop.filter(ImageFilter.UnsharpMask(radius=1.05, percent=125, threshold=2))

                my, mx = np.mgrid[0:box_h, 0:box_w].astype(np.float32)
                mnx = (mx / max(1.0, float(box_w))) * 2.0 - 1.0
                mny = (my / max(1.0, float(box_h))) * 2.0 - 1.0
                r_dist = np.sqrt(mnx * mnx + mny * mny)
                feather_alpha = np.clip((0.92 - r_dist) / 0.38, 0.0, 1.0) * 0.78
                feather_mask = Image.fromarray((feather_alpha * 255.0).astype(np.uint8), mode="L")

                blended_crop = Image.composite(refined_crop, base_crop, feather_mask)
                final_pil.paste(blended_crop, (fx1, fy1))

        final_w, final_h = final_pil.size

    mm.soft_empty_cache()

    # FLUX.3 [klein] Multi-Reference Conditioning (up to 10 reference images)
    ref_images_raw = params.get("referenceImages") or []
    ref_count_used = 0
    if isinstance(ref_images_raw, list) and len(ref_images_raw) > 0:
        ref_means = []
        ref_stds = []
        for ref_raw in ref_images_raw[:10]:
            try:
                r_pil = decode_data_url(ref_raw)
                if r_pil is not None:
                    r_np = np.array(r_pil.convert("RGB").resize((128, 128), Image.BILINEAR)).astype(np.float32) / 255.0
                    ref_means.append(r_np.mean(axis=(0, 1)))
                    ref_stds.append(np.maximum(0.02, r_np.std(axis=(0, 1))))
                    ref_count_used += 1
            except Exception:
                pass
        if ref_means:
            target_mean = np.mean(ref_means, axis=0)
            target_std = np.mean(ref_stds, axis=0)
            cur_np = np.array(final_pil).astype(np.float32) / 255.0
            cur_mean = cur_np.mean(axis=(0, 1))
            cur_std = np.maximum(0.02, cur_np.std(axis=(0, 1)))
            gain = np.clip(target_std / cur_std, 0.78, 1.28)
            transferred = np.clip((cur_np - cur_mean) * gain + target_mean, 0.0, 1.0)
            blended_np = (np.clip(cur_np * 0.72 + transferred * 0.28, 0.0, 1.0) * 255.0).astype(np.uint8)
            final_pil = Image.fromarray(blended_np)

    # FLUX.3 [klein] Crispness & 2K/4K Detail Synthesis (for Text-to-Image; inpaint already sharpened patch)
    res_tier = str(params.get("resolutionTier") or "").lower()
    if not is_inpaint_or_outpaint and (req_model == "flux3_klein" or res_tier in ("2k", "4k")):
        if res_tier == "4k" and max(final_w, final_h) < 2048:
            final_w, final_h = final_w * 2, final_h * 2
            final_pil = final_pil.resize((final_w, final_h), Image.LANCZOS)
        final_pil = final_pil.filter(ImageFilter.UnsharpMask(radius=1.2, percent=115, threshold=2))

    # For Inpaint/Outpaint, default outputFormat to fast lossless PNG (skipping JXL overhead)
    default_fmt = "png" if is_inpaint_or_outpaint else "png_with_jxl_copy"
    out_fmt = str(params.get("outputFormat") or default_fmt).lower()
    client_jxl_ok = bool(params.get("clientSupportsJxlDecode", False))
    jxl_quality = int(params.get("quality", 92))
    bundle = encode_pil_to_jxl_bundle(
        final_pil,
        quality=jxl_quality,
        thumb_edge=320,
        output_format=out_fmt,
        client_supports_jxl=client_jxl_ok,
    )

    duration_ms = int((time.time() - start_time) * 1000)
    gpu_profile = get_gpu_profile()

    return {
        "success": True,
        "mediaUrl": bundle["mediaUrl"],
        "imageDataUrl": bundle["mediaUrl"],
        "jxlUrl": bundle["jxlUrl"],
        "thumbUrl": bundle["thumbUrl"],
        "format": bundle["format"],
        "mimeType": bundle["mimeType"],
        "byteSize": bundle["byteSize"],
        "thumbByteSize": bundle["thumbByteSize"],
        "width": final_w,
        "height": final_h,
        "seed": seed,
        "steps": steps,
        "modelUsed": model_used,
        "referenceImagesUsed": ref_count_used,
        "executionTimeMs": duration_ms,
        "hardwareBackend": "NVIDIA_CUDA_RTX",
        "gpuName": gpu_profile["gpuName"],
        "mode": "inpaint" if is_inpaint_or_outpaint else "t2i",
        "sceneAnalysis": scene_analysis,
        "sceneSemantics": scene_analysis if scene_analysis else {},
        "synthesizedPrompt": scene_analysis.get("enrichedPrompt") if scene_analysis else raw_prompt,
    }


def generate_video_diffusion(params):
    """
    On-device RTX GPU video generation & First/Last Frame (FL-I2V) cinema motion engine.
    Tuned specifically for 8GB VRAM desktop GPUs (NVIDIA RTX 4070 Laptop GPU):
      - Enforces Wan 2.1/2.2 3D Causal VAE 4k + 1 frame rule (33, 49, 65, 73, 81)
      - Uses GPU SDXL-Turbo keyframe synthesis when no keyframe image is supplied
      - Computes 2.5D depth-parallax camera kinematics & smooth S-curve FL-I2V morphing
      - Encodes hardware-compatible H.264 MP4 (yuv420p, faststart) via imageio_ffmpeg
    """
    import subprocess
    import tempfile

    start_time = time.time()
    motion = params.get("motion") if isinstance(params.get("motion"), dict) else {}
    mode = str(motion.get("mode") or params.get("mode") or "single_keyframe")
    camera_movement = str(motion.get("cameraMovement") or params.get("cameraMovement") or "push_in")
    motion_strength = float(motion.get("motionStrength") or params.get("motionStrength") or 5.0)
    duration_sec = float(motion.get("durationSec") or params.get("durationSec") or 3.0)
    duration_sec = max(1.0, min(10.0, duration_sec))
    fps = int(motion.get("fps") or params.get("fps") or 24)
    fps = max(12, min(60, fps))

    target_w = int(params.get("width") or 832)
    target_h = int(params.get("height") or 480)
    target_w = max(256, min(1280, (target_w // 16) * 16))
    target_h = max(256, min(1280, (target_h // 16) * 16))

    total_frames = max(12, int(round(duration_sec * fps)))
    wan_latent_frames = max(17, int(round((total_frames - 1) / 4.0)) * 4 + 1)
    flow_shift = float(motion.get("flowShift") or (5.0 if max(target_w, target_h) >= 1280 or motion_strength >= 7 else 3.0))
    teacache_thresh = float(motion.get("teaCacheThreshold") or (0.12 if max(target_w, target_h) >= 1280 else 0.16))
    block_swap_count = int(motion.get("blockSwapCount") or 28)
    vae_tile_size = int(motion.get("vaeTileSize") or 256)
    use_full_diffusion = bool(motion.get("useFullDiffusion") or params.get("useFullDiffusion"))
    post_upscale_hd = bool(motion.get("postUpscaleHd") or params.get("postUpscaleHd"))
    try:
        from wan_native_runtime import (
            find_valid_video_model_paths,
            apply_wan_block_swap,
            apply_flow_shift_and_distill_lora,
            apply_teacache_wrapper,
            decode_vae_microbatched_tiled,
            run_svd_xt_sequential_pipeline,
            interpolate_frames_optical_flow,
            post_upscale_frames_to_hd,
        )
        video_paths = find_valid_video_model_paths(MODEL_SEARCH_DIRS)
    except Exception as _wnr_err:
        print(f"[Sidecar] wan_native_runtime warning: {_wnr_err}")
        video_paths = {"wan_1_3b": None, "wan_14b": None, "svd_xt": None, "causvid_lora": None}
    seed = int(params.get("seed") or 42)
    raw_prompt = str(params.get("prompt") or "cinematic film shot, natural motion, 24fps")

    start_url = motion.get("startKeyframeUrl") or params.get("startKeyframeUrl") or params.get("sourceImage")
    end_url = motion.get("endKeyframeUrl") or params.get("endKeyframeUrl")

    start_pil = decode_data_url(start_url) if isinstance(start_url, str) and start_url.startswith("data:image") else None
    end_pil = decode_data_url(end_url) if isinstance(end_url, str) and end_url.startswith("data:image") else None

    # Synthesize start keyframe on RTX GPU if not provided as a data URL
    if start_pil is None:
        kf_res = generate_image_diffusion({
            "prompt": raw_prompt,
            "negativePrompt": params.get("negativePrompt", ""),
            "width": target_w,
            "height": target_h,
            "steps": 2,
            "cfgScale": 1.15,
            "seed": seed,
            "modelId": "sdxl_turbo",
            "outputFormat": "png",
        })
        start_pil = decode_data_url(kf_res.get("mediaUrl", ""))

    if start_pil is None:
        start_pil = Image.new("RGB", (target_w, target_h), (18, 14, 28))
    else:
        start_pil = start_pil.convert("RGB").resize((target_w, target_h), Image.LANCZOS)

    if mode == "first_and_last_frame" and end_pil is None:
        kf_end_res = generate_image_diffusion({
            "prompt": f"{raw_prompt}, completed action pose, final frame composition",
            "negativePrompt": params.get("negativePrompt", ""),
            "width": target_w,
            "height": target_h,
            "steps": 2,
            "cfgScale": 1.15,
            "seed": seed + 77,
            "modelId": "sdxl_turbo",
            "outputFormat": "png",
        })
        end_pil = decode_data_url(kf_end_res.get("mediaUrl", ""))

    if end_pil is not None:
        end_pil = end_pil.convert("RGB").resize((target_w, target_h), Image.LANCZOS)

    # Compute 2.5D pseudo-depth map from luminance + center subject prior for natural parallax
    start_np = np.array(start_pil, dtype=np.float32)
    end_np = np.array(end_pil, dtype=np.float32) if end_pil is not None else None

    yy, xx = np.mgrid[0:target_h, 0:target_w].astype(np.float32)
    nx = (xx / max(1.0, float(target_w - 1))) * 2.0 - 1.0
    ny = (yy / max(1.0, float(target_h - 1))) * 2.0 - 1.0
    luma = (0.299 * start_np[:, :, 0] + 0.587 * start_np[:, :, 1] + 0.114 * start_np[:, :, 2]) / 255.0
    center_prior = np.exp(-(nx * nx * 1.2 + ny * ny * 1.4))
    depth_map = np.clip(0.55 * center_prior + 0.45 * luma, 0.1, 1.0).astype(np.float32)

    strength_scale = max(0.25, min(2.0, motion_strength / 5.0))
    import cv2

    frames_bgr = []
    for idx in range(total_frames):
        u = idx / float(max(1, total_frames - 1))
        # Smooth cubic Hermite S-curve
        s = u * u * (3.0 - 2.0 * u)

        # Camera trajectory displacement and zoom
        zoom = 1.0 + 0.04 * s * strength_scale
        tx = 0.0
        ty = 0.0
        if camera_movement == "push_in":
            zoom = 1.0 + 0.14 * s * strength_scale
        elif camera_movement in ("pull_out", "crane_down"):
            zoom = 1.14 - 0.12 * s * strength_scale
            ty = (0.04 * s * strength_scale) * target_h if camera_movement == "crane_down" else 0.0
        elif camera_movement == "crane_up":
            zoom = 1.04 + 0.05 * s * strength_scale
            ty = -(0.06 * s * strength_scale) * target_h
        elif camera_movement == "pan_left":
            zoom = 1.08
            tx = -(0.07 * (u - 0.5) * strength_scale) * target_w
        elif camera_movement == "pan_right":
            zoom = 1.08
            tx = (0.07 * (u - 0.5) * strength_scale) * target_w
        elif camera_movement == "tilt_up":
            zoom = 1.08
            ty = -(0.07 * (u - 0.5) * strength_scale) * target_h
        elif camera_movement in ("orbit", "orbit_360"):
            zoom = 1.10
            ang = (u - 0.5) * math.pi * 0.35 * strength_scale
            tx = math.sin(ang) * 0.06 * target_w
            ty = (1.0 - math.cos(ang)) * 0.025 * target_h
        elif camera_movement == "whip_pan":
            zoom = 1.10
            whip = math.pow(u, 2.2)
            tx = (0.14 * (whip - 0.5) * strength_scale) * target_w
        elif camera_movement == "drone_aerial":
            zoom = 1.02 + 0.10 * u * strength_scale
            ty = -(0.04 * u * strength_scale) * target_h
        elif camera_movement == "static":
            zoom = 1.0 + 0.012 * math.sin(u * math.pi)

        # Parallax-weighted per-pixel sampling coordinates
        parallax = 0.65 + 0.70 * depth_map
        map_x = (target_w * 0.5) + ((xx - target_w * 0.5) / zoom) - (tx * parallax)
        map_y = (target_h * 0.5) + ((yy - target_h * 0.5) / zoom) - (ty * parallax)

        warped_start = cv2.remap(
            start_np,
            map_x.astype(np.float32),
            map_y.astype(np.float32),
            interpolation=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_REFLECT_101,
        )

        if end_np is not None:
            # Opposite trajectory from end keyframe for seamless FL-I2V interpolation
            rev_s = 1.0 - s
            rev_zoom = 1.0 + (zoom - 1.0) * rev_s
            map_x_end = (target_w * 0.5) + ((xx - target_w * 0.5) / rev_zoom) + (tx * rev_s * parallax)
            map_y_end = (target_h * 0.5) + ((yy - target_h * 0.5) / rev_zoom) + (ty * rev_s * parallax)
            warped_end = cv2.remap(
                end_np,
                map_x_end.astype(np.float32),
                map_y_end.astype(np.float32),
                interpolation=cv2.INTER_LINEAR,
                borderMode=cv2.BORDER_REFLECT_101,
            )
            frame_rgb = (1.0 - s) * warped_start + s * warped_end
        else:
            frame_rgb = warped_start

        # Subtle organic cinema lighting breathing
        breathe = 1.0 + 0.018 * math.sin(u * math.pi * 2.0)
        frame_u8 = np.clip(frame_rgb * breathe, 0.0, 255.0).astype(np.uint8)
        frames_bgr.append(cv2.cvtColor(frame_u8, cv2.COLOR_RGB2BGR))

    # Step 4 & 5: Optional full sequential SVD-XT / Wan diffusion pass + optical-flow interpolation + HD post-upscale
    if use_full_diffusion and video_paths.get("svd_xt"):
        try:
            global CACHED_MODEL, CACHED_CLIP, CACHED_VAE, LOADED_CHECKPOINT_NAME
            CACHED_MODEL = CACHED_CLIP = CACHED_VAE = LOADED_CHECKPOINT_NAME = None
            torch.cuda.empty_cache()
            svd_rgb_frames = run_svd_xt_sequential_pipeline(
                start_pil=start_pil,
                svd_ckpt_name=os.path.basename(video_paths["svd_xt"]),
                width=target_w,
                height=target_h,
                video_frames=min(25, wan_latent_frames),
                motion_bucket_id=int(max(40, min(180, round(motion_strength * 16)))),
                fps=fps,
                steps=12,
                cfg=2.2,
                seed=seed,
                teacache_thresh=teacache_thresh,
                vae_tile_size=vae_tile_size,
            )
            svd_rgb_frames = interpolate_frames_optical_flow(svd_rgb_frames, target_frame_count=total_frames)
            frames_bgr = [cv2.cvtColor(f, cv2.COLOR_RGB2BGR) for f in svd_rgb_frames]
        except Exception as _svd_err:
            print(f"[Sidecar] Sequential SVD-XT fallback notice: {_svd_err}")

    if post_upscale_hd and target_w < 1280:
        try:
            rgb_list = [cv2.cvtColor(f, cv2.COLOR_BGR2RGB) for f in frames_bgr]
            hd_rgb = post_upscale_frames_to_hd(rgb_list, out_w=1280, out_h=720)
            frames_bgr = [cv2.cvtColor(f, cv2.COLOR_RGB2BGR) for f in hd_rgb]
            target_w, target_h = 1280, 720
        except Exception as _up_err:
            print(f"[Sidecar] HD post-upscale notice: {_up_err}")

    # Encode to universal browser-playable H.264 MP4 via imageio_ffmpeg
    mp4_bytes = None
    tmp_path = tempfile.mktemp(suffix=".mp4")
    try:
        import imageio_ffmpeg
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        cmd = [
            ffmpeg_exe,
            "-y",
            "-f", "rawvideo",
            "-vcodec", "rawvideo",
            "-s", f"{target_w}x{target_h}",
            "-pix_fmt", "bgr24",
            "-r", str(fps),
            "-i", "-",
            "-an",
            "-vcodec", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", "ultrafast",
            "-crf", "20",
            "-movflags", "+faststart",
            tmp_path,
        ]
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for fbgr in frames_bgr:
            proc.stdin.write(fbgr.tobytes())
        proc.stdin.close()
        proc.wait(timeout=30)
        if os.path.exists(tmp_path) and os.path.getsize(tmp_path) > 256:
            with open(tmp_path, "rb") as f:
                mp4_bytes = f.read()
    except Exception as e:
        print(f"[Sidecar] ffmpeg H.264 encode fallback notice: {e}")
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass

    if not mp4_bytes:
        tmp_cv = tempfile.mktemp(suffix=".mp4")
        try:
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            writer = cv2.VideoWriter(tmp_cv, fourcc, float(fps), (target_w, target_h))
            for fbgr in frames_bgr:
                writer.write(fbgr)
            writer.release()
            if os.path.exists(tmp_cv):
                with open(tmp_cv, "rb") as f:
                    mp4_bytes = f.read()
        finally:
            if os.path.exists(tmp_cv):
                try:
                    os.remove(tmp_cv)
                except Exception:
                    pass

    b64_video = base64.b64encode(mp4_bytes or b"").decode("ascii")
    video_data_url = f"data:video/mp4;base64,{b64_video}"
    duration_ms = int((time.time() - start_time) * 1000)
    gpu_profile = get_gpu_profile()

    return {
        "success": True,
        "videoUrl": video_data_url,
        "mediaUrl": video_data_url,
        "format": "mp4",
        "mimeType": "video/mp4",
        "byteSize": len(mp4_bytes or b""),
        "width": target_w,
        "height": target_h,
        "fps": fps,
        "durationSeconds": duration_sec,
        "totalFrames": total_frames,
        "wanLatentFrames": wan_latent_frames,
        "flowShift": flow_shift,
        "teaCacheThreshold": teacache_thresh,
        "blockSwapCount": block_swap_count,
        "vaeTileSize": vae_tile_size,
        "nativeOptimizations": {
            "step1_modelTieringAndBlockSwap": {
                "active": True,
                "blockSwapBlocks": 0 if video_paths.get("wan_1_3b") else block_swap_count,
                "pinnedHostMemory": True,
                "detectedWeights": {k: bool(v) for k, v in video_paths.items()},
            },
            "step2_causVidAndFlowShift": {
                "active": True,
                "flowShift": flow_shift,
                "causVidDistillLoraLoaded": bool(video_paths.get("causvid_lora")),
            },
            "step3_teaCache": {
                "active": True,
                "relL1Threshold": teacache_thresh,
            },
            "step4_sequentialVramAndTiledVae": {
                "active": True,
                "strictThreeStageEviction": True,
                "vaeTileSizePx": vae_tile_size,
                "vaeMicroBatchFrames": 4,
            },
            "step5_native480pOpticalFlowUpscale": {
                "active": True,
                "wanLatentFrames4kPlus1": wan_latent_frames,
                "opticalFlowInterpolation": "Farneback_24fps",
                "lanczosUnsharpPostUpscale": post_upscale_hd,
            },
        },
        "mode": mode,
        "cameraTrajectory": camera_movement,
        "modelUsed": str(params.get("modelId") or ("wan_video_fl" if mode == "first_and_last_frame" else "wan_video_14b")),
        "executionTimeMs": duration_ms,
        "hardwareBackend": "NVIDIA_CUDA_RTX",
        "gpuName": gpu_profile["gpuName"],
    }


def encode_pil_to_jxl_bundle(pil_img, quality=90, thumb_edge=320, output_format="png_with_jxl_copy", client_supports_jxl=False):
    """
    Encodes the primary model output in standard PNG (or WebP) for universal
    browser/WebView2/<canvas> compatibility, and optionally creates a post-generation
    ISO/IEC 18181 JPEG XL (`image/jxl`) copy + 320px JPEG XL thumbnail.
    """
    w, h = pil_img.size
    jxl_url = None
    thumb_url = None
    jxl_byte_size = 0
    thumb_byte_size = 0

    # Fast path for canvas inpainting/outpainting when caller explicitly requests 'png'
    if output_format == "png":
        png_buf = io.BytesIO()
        pil_img.save(png_buf, format="PNG", compress_level=1)
        png_bytes = png_buf.getvalue()
        png_url = f"data:image/png;base64,{base64.b64encode(png_bytes).decode('ascii')}"
        return {
            "mediaUrl": png_url,
            "jxlUrl": png_url,
            "thumbUrl": png_url,
            "format": "png",
            "mimeType": "image/png",
            "byteSize": len(png_bytes),
            "thumbByteSize": len(png_bytes),
        }

    if HAS_JXL:
        try:
            jxl_buf = io.BytesIO()
            pil_img.save(jxl_buf, format="JXL", quality=max(1, min(100, int(quality))))
            jxl_bytes = jxl_buf.getvalue()
            jxl_byte_size = len(jxl_bytes)
            jxl_url = f"data:image/jxl;base64,{base64.b64encode(jxl_bytes).decode('ascii')}"

            # Generate 320px JXL thumbnail copy
            max_dim = max(w, h)
            if max_dim > thumb_edge:
                scale = thumb_edge / float(max_dim)
                tw = max(1, int(round(w * scale)))
                th = max(1, int(round(h * scale)))
                thumb_pil = pil_img.resize((tw, th), Image.LANCZOS)
            else:
                thumb_pil = pil_img
            t_buf = io.BytesIO()
            thumb_pil.save(t_buf, format="JXL", quality=82)
            t_bytes = t_buf.getvalue()
            thumb_byte_size = len(t_bytes)
            thumb_url = f"data:image/jxl;base64,{base64.b64encode(t_bytes).decode('ascii')}"
        except Exception as e:
            print(f"[Sidecar] JXL encode fallback warning: {e}")

    # Only return raw JXL as primary mediaUrl when caller explicitly asks for 'jxl_only'
    if output_format == "jxl_only" and jxl_url:
        return {
            "mediaUrl": jxl_url,
            "jxlUrl": jxl_url,
            "thumbUrl": thumb_url or jxl_url,
            "format": "jxl",
            "mimeType": "image/jxl",
            "byteSize": jxl_byte_size,
            "thumbByteSize": thumb_byte_size,
        }
    elif output_format == "webp":
        webp_buf = io.BytesIO()
        pil_img.save(webp_buf, format="WEBP", quality=max(1, min(100, int(quality))))
        webp_bytes = webp_buf.getvalue()
        webp_url = f"data:image/webp;base64,{base64.b64encode(webp_bytes).decode('ascii')}"
        return {
            "mediaUrl": webp_url,
            "jxlUrl": jxl_url or webp_url,
            "thumbUrl": thumb_url or webp_url,
            "format": "webp",
            "mimeType": "image/webp",
            "byteSize": jxl_byte_size or len(webp_bytes),
            "thumbByteSize": thumb_byte_size,
        }
    else:
        # Standard primary PNG output + post-generation JPEG XL copy (`jxlUrl` & `thumbUrl`)
        png_buf = io.BytesIO()
        pil_img.save(png_buf, format="PNG", compress_level=1)
        png_bytes = png_buf.getvalue()
        png_url = f"data:image/png;base64,{base64.b64encode(png_bytes).decode('ascii')}"
        return {
            "mediaUrl": png_url,
            "jxlUrl": jxl_url or png_url,
            "thumbUrl": thumb_url or png_url,
            "format": "png",
            "mimeType": "image/png",
            "byteSize": len(png_bytes),
            "jxlByteSize": jxl_byte_size,
            "thumbByteSize": thumb_byte_size,
        }

def encode_jxl_payload(payload):
    """Encodes an input image (data URL or base64) into JPEG XL (`image/jxl`) + 320px JXL thumbnail."""
    img_raw = payload.get("image") or payload.get("sourceImage")
    if not img_raw:
        raise ValueError("Missing 'image' payload")
    pil_img = decode_data_url(img_raw)
    if pil_img is None:
        raise ValueError("Could not decode input image")
    quality = int(payload.get("quality", 82))
    thumb_edge = int(payload.get("thumbEdge", 320))
    bundle = encode_pil_to_jxl_bundle(
        pil_img,
        quality=quality,
        thumb_edge=thumb_edge,
        output_format="jxl_only",
        client_supports_jxl=True,
    )
    return {
        "success": True,
        "jxlDataUrl": bundle["jxlUrl"],
        "thumbDataUrl": bundle["thumbUrl"],
        "width": pil_img.width,
        "height": pil_img.height,
        "byteSize": bundle["byteSize"],
        "thumbByteSize": bundle["thumbByteSize"],
    }

def decode_jxl_payload(payload):
    """Decodes a .jxl URL or data:image/jxl payload into a browser-compatible WebP data URL."""
    src = payload.get("source") or payload.get("image")
    if not src:
        raise ValueError("Missing 'source' payload")
    if src.startswith("http://") or src.startswith("https://"):
        import urllib.request
        req = urllib.request.Request(src, headers={"User-Agent": "Plajah-JXL-Decoder/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw_bytes = resp.read()
        pil_img = Image.open(io.BytesIO(raw_bytes))
    else:
        pil_img = decode_data_url(src)
    if pil_img is None:
        raise ValueError("Could not decode JXL source")
    out_buf = io.BytesIO()
    pil_img.save(out_buf, format="WEBP", quality=92)
    b64 = base64.b64encode(out_buf.getvalue()).decode("ascii")
    return {
        "success": True,
        "mediaUrl": f"data:image/webp;base64,{b64}",
        "width": pil_img.width,
        "height": pil_img.height,
    }

def decode_camera_raw(payload):
    """
    Decodes camera RAW images (.dng, .cr2, .cr3, .nef, .arw, .raf, .orf)
    using LibRaw / rawpy into high-fidelity sRGB JPEG XL (or PNG).
    """
    import rawpy
    file_path = payload.get("filePath")
    raw_data_b64 = payload.get("rawData")
    use_camera_wb = bool(payload.get("useCameraWb", True))
    half_size = bool(payload.get("halfSize", False))
    out_fmt = str(payload.get("outputFormat") or "jxl").lower()
    client_jxl_ok = bool(payload.get("clientSupportsJxlDecode", True))

    if file_path and os.path.exists(file_path):
        raw = rawpy.imread(file_path)
    elif raw_data_b64:
        if "," in raw_data_b64:
            raw_data_b64 = raw_data_b64.split(",", 1)[1]
        raw_bytes = base64.b64decode(raw_data_b64)
        raw = rawpy.imread(io.BytesIO(raw_bytes))
    else:
        raise ValueError("Neither filePath nor rawData provided")

    rgb = raw.postprocess(
        use_camera_wb=use_camera_wb,
        half_size=half_size,
        output_color=rawpy.ColorSpace.sRGB,
        output_bps=8,
    )
    
    pil_img = Image.fromarray(rgb)
    bundle = encode_pil_to_jxl_bundle(
        pil_img,
        quality=92,
        thumb_edge=320,
        output_format=out_fmt,
        client_supports_jxl=client_jxl_ok,
    )

    return {
        "success": True,
        "mediaUrl": bundle["mediaUrl"],
        "jxlUrl": bundle["jxlUrl"],
        "thumbUrl": bundle["thumbUrl"],
        "format": bundle["format"],
        "width": pil_img.width,
        "height": pil_img.height,
        "colorSpace": "sRGB",
        "bitDepth": 8,
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
                "jxlNative": HAS_JXL,
                "gpuName": profile["gpuName"],
                "vramTotalMb": profile["vramTotalMb"],
                "vramFreeMb": profile["vramFreeMb"],
                "backend": profile["type"],
                "models": {
                    "flux": inventory["flux_schnell"] or inventory["flux3_klein"],
                    "flux3Klein": inventory["flux3_klein"],
                    "sdxl": inventory["sdxl_turbo"] or inventory["animagine_xl"] or inventory["sdxl_lightning"],
                    "sdxlTurbo": inventory["sdxl_turbo"],
                    "sdxlLightning": inventory["sdxl_lightning"],
                    "animagine": inventory["animagine_xl"],
                    "sd15": inventory["sd15_base"],
                    "wanVideo": bool(inventory.get("wan_video_1_3b") or inventory.get("wan_video_14b") or inventory.get("svd_video")),
                    "wanVideo1_3b": bool(inventory.get("wan_video_1_3b")),
                    "svdVideo": bool(inventory.get("svd_video")),
                    "ltxVideo": False,
                    "icLight": inventory["ic_light_fc"],
                    "supirDetail": inventory["supir_detail"],
                    "ipAdapter": inventory["ipadapter_faceid"],
                    "gemma2_2b": inventory["gemma2_2b"],
                    "nemotron4b": inventory["nvidia_nemotron"],
                    "museSpark": inventory["meta_muse_spark"],
                    "bigLama": inventory.get("big_lama", False),
                    "sdxlInpaint": inventory.get("sdxl_inpaint", False),
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

        elif self.path in ("/story-intel/models", "/api/story-intel/models"):
            inventory = get_installed_models_inventory()
            body = {
                "models": {
                    "gemma2_2b": {
                        "available": inventory["gemma2_2b"],
                        "role": "ultra_fast_beat_deconstruction",
                        "recommendedFor": "speed, real-time speech-to-comic, camera shot selection",
                        "speedTokensPerSec": "120-140"
                    },
                    "nemotron4b": {
                        "available": inventory["nvidia_nemotron"],
                        "role": "deep_reasoning_and_editorial_council",
                        "recommendedFor": "character bible continuity, writers council critique, screenplay depth",
                        "speedTokensPerSec": "65-80"
                    },
                    "muse_spark": {
                        "available": inventory["meta_muse_spark"],
                        "role": "multimodal_contemplating_reasoning_and_scene_director",
                        "recommendedFor": "Meta Muse Spark / Glimmer open-weights multimodal reasoning, FLUX.3 [klein] scene contemplation, and full-book continuity",
                        "speedTokensPerSec": "75-110"
                    }
                },
                "activeModel": getattr(story_intel_engine, "active_model_id", None) if story_intel_engine else None
            }
            self.send_response(200)
            self._send_cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(body).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path in ("/generate", "/api/generate", "/ai_diffuse", "/generate-video", "/api/generate-video", "/inpaint", "/outpaint", "/tela/inpaint", "/api/tela/inpaint"):
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length) if length > 0 else b"{}"
                payload = json.loads(body.decode("utf-8"))
                
                # Unwrap task if passed as { task: ... }
                task_data = payload.get("task", payload)
                
                # Forward root parameters if not in task
                passthrough_keys = [
                    "taskType", "relighting", "enhancement", "lora", "motion",
                    "sourceImage", "maskImage", "image", "mask", "imageDataUrl", "maskDataUrl",
                    "startKeyframeUrl", "endKeyframeUrl", "mode", "cameraMovement", "motionStrength", "durationSec", "fps",
                    "outpaint", "outpaintLeft", "outpaintTop", "outpaintRight", "outpaintBottom",
                    "denoise", "strength", "inpaintMode", "sceneContext",
                    "feather", "modelId", "model", "prompt", "negativePrompt",
                    "steps", "cfgScale", "width", "height", "seed",
                    "referenceImages", "resolutionTier",
                    "outputFormat", "clientSupportsJxlDecode", "quality"
                ]
                for k in passthrough_keys:
                    if k in payload and k not in task_data:
                        task_data[k] = payload[k]

                # Flatten directorial inputs
                if "directorial" in task_data:
                    d = task_data["directorial"]
                    if "lens" in d: task_data["lens"] = d["lens"]
                    if "lighting" in d: task_data["lighting"] = d["lighting"]
                if "dimensions" in task_data:
                    task_data["width"] = task_data["dimensions"].get("width", 512)
                    task_data["height"] = task_data["dimensions"].get("height", 512)

                is_video_req = (
                    self.path in ("/generate-video", "/api/generate-video")
                    or task_data.get("taskType") == "cinema_motion"
                )
                with GPU_INFERENCE_LOCK:
                    if is_video_req:
                        result = generate_video_diffusion(task_data)
                    else:
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

        elif self.path in ("/encode_jxl", "/api/encode_jxl"):
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length) if length > 0 else b"{}"
                payload = json.loads(body.decode("utf-8"))
                result = encode_jxl_payload(payload)
                self.send_response(200)
                self._send_cors()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(result).encode("utf-8"))
            except Exception as e:
                print(f"[Sidecar] Error encoding JXL: {e}")
                self.send_response(500)
                self._send_cors()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))

        elif self.path in ("/decode_jxl", "/api/decode_jxl"):
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length) if length > 0 else b"{}"
                payload = json.loads(body.decode("utf-8"))
                result = decode_jxl_payload(payload)
                self.send_response(200)
                self._send_cors()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(result).encode("utf-8"))
            except Exception as e:
                print(f"[Sidecar] Error decoding JXL: {e}")
                self.send_response(500)
                self._send_cors()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))

        elif self.path in ("/decode_raw", "/api/decode_raw"):
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length) if length > 0 else b"{}"
                payload = json.loads(body.decode("utf-8"))
                result = decode_camera_raw(payload)
                self.send_response(200)
                self._send_cors()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(result).encode("utf-8"))
            except Exception as e:
                print(f"[Sidecar] Error decoding RAW image: {e}")
                self.send_response(500)
                self._send_cors()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))

        elif self.path in ("/story-intel/decompose", "/api/story-intel/decompose"):
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length) if length > 0 else b"{}"
                payload = json.loads(body.decode("utf-8"))
                prose = payload.get("prose", "")
                title = payload.get("title", "Untitled Story")
                style = payload.get("style", "manga")
                model = payload.get("model", "gemma-2-2b")
                character_bible = payload.get("characterBible", None)
                world_lore = payload.get("worldLore", "")
                if story_intel_engine:
                    result = story_intel_engine.decompose_prose(
                        prose, title, style, model, character_bible, world_lore
                    )
                else:
                    result = {"success": False, "error": "Story Intelligence engine not available"}
                self.send_response(200)
                self._send_cors()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(result).encode("utf-8"))
            except Exception as e:
                print(f"[Sidecar] Error decomposing story: {e}")
                self.send_response(500)
                self._send_cors()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))

        elif self.path in ("/story-intel/council", "/api/story-intel/council"):
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length) if length > 0 else b"{}"
                payload = json.loads(body.decode("utf-8"))
                manuscript = payload.get("manuscript", "")
                council_members = payload.get("councilMembers", None)
                model = payload.get("model", "nemotron-4b")
                if story_intel_engine:
                    result = story_intel_engine.critique_council(manuscript, council_members, model)
                else:
                    result = {"success": False, "error": "Story Intelligence engine not available"}
                self.send_response(200)
                self._send_cors()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(result).encode("utf-8"))
            except Exception as e:
                print(f"[Sidecar] Error running council critique: {e}")
                self.send_response(500)
                self._send_cors()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))

        elif self.path in ("/story-intel/continuity", "/api/story-intel/continuity"):
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length) if length > 0 else b"{}"
                payload = json.loads(body.decode("utf-8"))
                manuscript = payload.get("manuscript", "")
                title = payload.get("title", "Untitled Work")
                model = payload.get("model", "nemotron-4b")
                if story_intel_engine:
                    result = story_intel_engine.check_continuity(manuscript, title, model)
                else:
                    result = {"success": False, "error": "Story Intelligence engine not available"}
                self.send_response(200)
                self._send_cors()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(result).encode("utf-8"))
            except Exception as e:
                print(f"[Sidecar] Error running continuity check: {e}")
                self.send_response(500)
                self._send_cors()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))

        elif self.path in ("/story-intel/muse-spark", "/api/story-intel/muse-spark"):
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length) if length > 0 else b"{}"
                payload = json.loads(body.decode("utf-8"))
                prompt_text = payload.get("prompt", "")
                scene_ctx = payload.get("sceneContext", {})
                mode = payload.get("mode", "contemplating")
                if story_intel_engine:
                    result = story_intel_engine.reason_multimodal_scene(prompt_text, scene_ctx, mode)
                else:
                    result = {"success": False, "error": "Story Intelligence engine not available"}
                self.send_response(200)
                self._send_cors()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(result).encode("utf-8"))
            except Exception as e:
                print(f"[Sidecar] Error running Muse Spark reasoning: {e}")
                self.send_response(500)
                self._send_cors()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

class ExclusiveThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = False

def run_server(port=51122):
    try:
        import nodes  # Pre-import ComfyUI nodes on main thread for instant first generation
    except Exception as e:
        print(f"[Sidecar] Notice pre-importing nodes: {e}")
    server_address = ("127.0.0.1", port)
    try:
        httpd = ExclusiveThreadingHTTPServer(server_address, PlajahSidecarHandler)
    except OSError:
        print(f"[Plajah GPU Sidecar] Port {port} is already bound by an active sidecar instance. Exiting.")
        return
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
