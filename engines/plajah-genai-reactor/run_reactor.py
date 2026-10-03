"""
Plajah Generative AI Audio-Reactive Reactor:
Main runtime executable. Hooks into Plajah's Audio Named Pipe,
drives continuous real-time diffusion through latent space,
and prepares the low-res frames for DirectX 12 DirectSR / DLSS upscaling.
"""

import argparse
import sys
import time
import cv2
import numpy as np

from audio_bridge import AudioBridge
from latent_modulator import LatentModulator
from stream_engine import PlajahGenAiEngine


DEFAULT_PROMPT_A = (
    "cinematic dark obsidian monolith rising from liquid mirror lake, "
    "translucent crimson reflections, deep volumetric shadows, 8k octane render, photorealistic"
)

DEFAULT_PROMPT_B = (
    "bioluminescent crystalline fluid explosion, iridescent neon laser filaments, "
    "fractal sacred geometry, vibrant chromatic dispersion, hyper-detailed cosmic energy"
)


def draw_hud(cv_frame: np.ndarray, stems, fps: float, prompt_blend: float, upscaled: bool):
    """Renders a minimalist telemetry overlay."""
    h, w = cv_frame.shape[:2]
    overlay = cv_frame.copy()

    # Semi-transparent dark banner at top
    cv2.rectangle(overlay, (0, 0), (w, 65), (10, 12, 16), -1)
    cv2.addWeighted(overlay, 0.75, cv_frame, 0.25, 0, cv_frame)

    # Title & FPS
    cv2.putText(cv_frame, "PLAJAH GENAI REACTOR", (16, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 230, 255), 1, cv2.LINE_AA)
    upscale_label = "DirectSR / DLSS 4K" if upscaled else "Native 512x512"
    cv2.putText(cv_frame, f"FPS: {fps:4.1f} | Output: {upscale_label}", (16, 48), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (180, 180, 180), 1, cv2.LINE_AA)

    # Audio Stem Meters
    meter_start_x = w - 240
    stems_data = [
        ("KICK", stems.kick, (0, 70, 255)),       # Red/Orange
        ("SUB",  stems.sub_bass, (0, 150, 255)),   # Amber
        ("VOX",  stems.voice, (255, 120, 0)),      # Blue
        ("AIR",  stems.air, (255, 230, 0)),        # Cyan
    ]

    for i, (label, val, col) in enumerate(stems_data):
        x = meter_start_x + i * 55
        cv2.putText(cv_frame, label, (x, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (160, 160, 160), 1, cv2.LINE_AA)
        # Meter bar
        bar_len = int(np.clip(val, 0.0, 1.5) * 24)
        cv2.rectangle(cv_frame, (x, 30), (x + 40, 48), (30, 30, 35), -1)
        cv2.rectangle(cv_frame, (x, 48 - bar_len), (x + 40, 48), col, -1)


def main():
    parser = argparse.ArgumentParser(description="Plajah Generative AI Audio-Reactive Reactor")
    parser.add_argument("--model", type=str, default="stabilityai/sd-turbo", help="HuggingFace model ID")
    parser.add_argument("--pipe", type=str, default="PlajahAudioPipe", help="Named pipe name")
    parser.add_argument("--prompt-a", type=str, default=DEFAULT_PROMPT_A, help="Base ambient aesthetic prompt")
    parser.add_argument("--prompt-b", type=str, default=DEFAULT_PROMPT_B, help="Climax high-energy prompt")
    parser.add_argument("--width", type=int, default=512, help="Diffusion render width")
    parser.add_argument("--height", type=int, default=512, help="Diffusion render height")
    parser.add_argument("--steps", type=int, default=1, help="Diffusion inference steps")
    parser.add_argument("--strength", type=float, default=0.40, help="Img2img denoise strength")
    parser.add_argument("--upscale", action="store_true", help="Simulate DirectSR upscaling to 1440p")
    args = parser.parse_args()

    print("=" * 70)
    print("  PLAJAH REAL-TIME GENERATIVE AUDIO REACTOR")
    print("  Engine: StreamDiffusion / SD-Turbo + DirectSR DLSS Ready")
    print("=" * 70)

    # 1. Start Audio Bridge
    audio_bridge = AudioBridge(pipe_name=args.pipe, fallback_loopback=True)
    audio_bridge.start()
    print(f"[Main] Audio Bridge running. Source: {audio_bridge.source_mode}")

    # 2. Initialize Latent Space Modulator
    latent_mod = LatentModulator(latent_shape=(1, 4, args.height // 8, args.width // 8))

    # 3. Initialize Real-Time Diffusion Engine
    engine = PlajahGenAiEngine(
        model_id=args.model,
        width=args.width,
        height=args.height,
        num_inference_steps=args.steps,
        denoise_strength=args.strength
    )
    engine.bake_prompts(args.prompt_a, args.prompt_b)

    # Window creation
    window_name = "Plajah GenAI Audio Reactor (Press ESC to exit, D for DirectSR toggle)"
    cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(window_name, 1024, 1024)

    fps = 60.0
    last_time = time.time()
    upscale_mode = args.upscale

    try:
        while True:
            t0 = time.time()
            dt = t0 - last_time
            last_time = t0

            # 1. Fetch latest audio stems
            stems = audio_bridge.get_stems()

            # 2. Compute audio-steered latent vector & feedback warp
            latent_vec = latent_mod.step(stems, dt)
            warp = latent_mod.get_warp_transform(stems)

            # 3. Denoise frame
            pil_output = engine.render_frame(
                prompt_blend=latent_mod.prompt_blend,
                latent_vector=latent_vec,
                warp_params=warp
            )

            # 4. Convert to OpenCV format (BGR)
            frame_rgb = np.array(pil_output)
            frame_bgr = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)

            # 5. Optional DirectSR / Upscaling stage
            if upscale_mode:
                # DirectSR / DLSS target resolution
                target_w, target_h = 1920, 1080
                display_frame = cv2.resize(frame_bgr, (target_w, target_h), interpolation=cv2.INTER_LANCZOS4)
            else:
                display_frame = frame_bgr

            # 6. Render HUD telemetry
            draw_hud(display_frame, stems, fps, latent_mod.prompt_blend, upscale_mode)

            # 7. Present frame
            cv2.imshow(window_name, display_frame)

            # Calculate FPS
            render_duration = time.time() - t0
            fps = 0.9 * fps + 0.1 * (1.0 / max(render_duration, 1e-4))

            # Handle user keys
            key = cv2.waitKey(1) & 0xFF
            if key in (27, ord('q')):  # ESC or Q
                break
            elif key == ord('d'):
                upscale_mode = not upscale_mode
                print(f"[Main] DirectSR Upscaling toggled: {upscale_mode}")
            elif key == ord('r'):
                latent_mod.latent_a = np.random.randn(*latent_mod.latent_shape)
                print("[Main] Latent trajectory reset.")

    except KeyboardInterrupt:
        pass
    finally:
        print("\n[Main] Shutting down Audio Reactor...")
        audio_bridge.stop()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
