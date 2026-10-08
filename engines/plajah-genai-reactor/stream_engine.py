"""
Plajah Stream Diffusion Engine:
High-speed real-time diffusion pipeline utilizing SD-Turbo or LCM LoRA models in FP16/TensorRT.
Operates at 512x512 or 768x432 for maximum frame rates (30-60+ FPS on RTX 4070),
feeding the output directly to the DirectSR / DLSS upscaling stage.
"""

import time
import numpy as np
import torch
import cv2
from PIL import Image

try:
    from diffusers import AutoPipelineForImage2Image, AutoPipelineForText2Image
    from diffusers import LCMScheduler, EulerAncestralDiscreteScheduler
    DIFFUSERS_AVAILABLE = True
except ImportError:
    DIFFUSERS_AVAILABLE = False


class PlajahGenAiEngine:
    def __init__(
        self,
        model_id: str = "stabilityai/sd-turbo",
        device: str = "cuda",
        width: int = 512,
        height: int = 512,
        num_inference_steps: int = 1,
        denoise_strength: float = 0.42
    ):
        self.model_id = model_id
        self.device = device if torch.cuda.is_available() else "cpu"
        self.width = width
        self.height = height
        self.num_inference_steps = num_inference_steps
        self.denoise_strength = denoise_strength
        self.dtype = torch.float16 if self.device == "cuda" else torch.float32

        self.pipe = None
        self.tokenizer = None
        self.text_encoder = None
        self.cached_embeds_a = None
        self.cached_embeds_b = None
        self.previous_frame = None

        self._init_pipeline()

    def _init_pipeline(self):
        if not DIFFUSERS_AVAILABLE:
            print("[GenAiEngine] Warning: 'diffusers' not found. Running in mock simulation mode.")
            return

        print(f"[GenAiEngine] Loading model '{self.model_id}' onto {self.device} (FP16)...")
        t0 = time.time()

        try:
            # We use Image2Image for continuous feedback & hybrid 3D guidance
            self.pipe = AutoPipelineForImage2Image.from_pretrained(
                self.model_id,
                torch_dtype=self.dtype,
                variant="fp16" if self.device == "cuda" else None
            ).to(self.device)

            # Performance optimizations for RTX Ada Lovelace
            if hasattr(self.pipe, "enable_vae_tiling"):
                self.pipe.disable_vae_tiling()
            if hasattr(self.pipe, "enable_xformers_memory_efficient_attention"):
                try:
                    self.pipe.enable_xformers_memory_efficient_attention()
                except Exception:
                    pass

            self.tokenizer = self.pipe.tokenizer
            self.text_encoder = self.pipe.text_encoder
            print(f"[GenAiEngine] Model loaded successfully in {time.time() - t0:.2f}s!")
        except Exception as e:
            print(f"[GenAiEngine] Error loading model: {e}. Falling back to simulation mode.")
            self.pipe = None

    def bake_prompts(self, prompt_a: str, prompt_b: str):
        """Pre-encodes prompt text into persistent tensor embeddings for zero-latency blending."""
        if self.pipe is None or self.text_encoder is None:
            return

        with torch.no_grad():
            inputs_a = self.tokenizer(
                prompt_a, padding="max_length", max_length=self.tokenizer.model_max_length,
                truncation=True, return_tensors="pt"
            ).to(self.device)
            self.cached_embeds_a = self.text_encoder(inputs_a.input_ids)[0]

            inputs_b = self.tokenizer(
                prompt_b, padding="max_length", max_length=self.tokenizer.model_max_length,
                truncation=True, return_tensors="pt"
            ).to(self.device)
            self.cached_embeds_b = self.text_encoder(inputs_b.input_ids)[0]

    def render_frame(self, prompt_blend: float, latent_vector: torch.Tensor, warp_params, input_image_override=None):
        """
        Renders a single audio-reactive frame:
        - If input_image_override is passed (from Unity HDRP 3D render), uses that as base image.
        - Otherwise, warps the previous frame (infinite feedback loop).
        """
        zoom, rot_deg = warp_params

        # 1. Prepare base image
        if input_image_override is not None:
            base_image = input_image_override
        elif self.previous_frame is not None:
            base_image = self._apply_warp(self.previous_frame, zoom, rot_deg)
        else:
            # Seed initial canvas
            base_image = Image.new("RGB", (self.width, self.height), (12, 14, 18))

        if self.pipe is None:
            # Mock rendering for environments without CUDA/PyTorch installed
            return self._mock_render(base_image, prompt_blend, warp_params)

        # 2. Compute blended prompt embeddings
        with torch.no_grad():
            if self.cached_embeds_a is not None and self.cached_embeds_b is not None:
                blended_embeds = (1.0 - prompt_blend) * self.cached_embeds_a + prompt_blend * self.cached_embeds_b
            else:
                blended_embeds = None

            # 3. Fast Denoise Execution (1 step SD-Turbo)
            output = self.pipe(
                image=base_image,
                prompt_embeds=blended_embeds,
                strength=self.denoise_strength,
                num_inference_steps=self.num_inference_steps,
                guidance_scale=0.0,  # 0.0 for SD-Turbo
                latents=latent_vector,
                output_type="pil"
            ).images[0]

            self.previous_frame = output
            return output

    def _apply_warp(self, pil_img: Image.Image, zoom: float, rot_deg: float) -> Image.Image:
        """Applies camera transform / acoustic pulse warp to previous frame."""
        cv_img = np.array(pil_img)
        h, w = cv_img.shape[:2]
        center = (w / 2.0, h / 2.0)

        # 2D affine matrix with zoom & rotation
        m = cv2.getRotationMatrix2D(center, rot_deg, zoom)
        warped = cv2.warpAffine(cv_img, m, (w, h), borderMode=cv2.BORDER_REFLECT)
        return Image.fromarray(warped)

    def _mock_render(self, base_image: Image.Image, blend: float, warp_params):
        """Simulation mode to test the audio pipeline and UI when running on CPU without weights."""
        img = np.array(base_image)
        h, w, c = img.shape
        zoom, rot = warp_params

        # Draw procedural audio pulses
        center = (int(w / 2), int(h / 2))
        radius = int(50 + blend * 120)
        color = (
            int(15 + blend * 220),
            int(40 + (1.0 - blend) * 180),
            int(180 + blend * 75)
        )
        cv2.circle(img, center, radius, color, 4)
        time.sleep(0.016)  # Simulate ~60 FPS
        res = Image.fromarray(img)
        self.previous_frame = res
        return res
