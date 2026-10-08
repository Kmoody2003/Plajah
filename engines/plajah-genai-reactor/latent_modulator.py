"""
Plajah Latent Modulator:
Controls real-time trajectories across diffusion latent space and text conditioning
based on audio stem inputs.
"""

import math
import numpy as np
import torch
from audio_bridge import AudioStems


def slerp(val: float, low: torch.Tensor, high: torch.Tensor) -> torch.Tensor:
    """Spherical linear interpolation between two latent vectors."""
    low_norm = low / torch.norm(low, dim=-1, keepdim=True)
    high_norm = high / torch.norm(high, dim=-1, keepdim=True)
    dot = torch.sum(low_norm * high_norm, dim=-1, keepdim=True)
    dot = torch.clamp(dot, -1.0, 1.0)
    omega = torch.acos(dot)
    so = torch.sin(omega)

    # Fallback to linear if vectors are collinear
    close_mask = (so < 1e-4).squeeze()
    res = (torch.sin((1.0 - val) * omega) / (so + 1e-6)) * low + (torch.sin(val * omega) / (so + 1e-6)) * high
    if close_mask.any():
        linear = (1.0 - val) * low + val * high
        res = torch.where(close_mask.unsqueeze(-1), linear, res)
    return res


class LatentModulator:
    def __init__(self, latent_shape=(1, 4, 64, 64), device="cuda", dtype=torch.float16):
        self.device = device
        self.dtype = dtype
        self.latent_shape = latent_shape

        # Waypoints for continuous latent drifting
        self.latent_a = torch.randn(latent_shape, device=device, dtype=dtype)
        self.latent_b = torch.randn(latent_shape, device=device, dtype=dtype)
        self.drift_progress = 0.0
        self.base_drift_speed = 0.008

        # Impulse shockwave on kick
        self.shockwave_vector = torch.randn(latent_shape, device=device, dtype=dtype)
        self.shockwave_amplitude = 0.0
        self.shockwave_decay = 0.82

        # Text prompt conditioning weights
        self.prompt_blend = 0.0  # 0.0 = Prompt A, 1.0 = Prompt B

    def step(self, stems: AudioStems, dt: float) -> torch.Tensor:
        """
        Calculates the audio-reactive latent vector for the current frame.
        - Sub-bass speeds up continuous latent drifting.
        - Kick transients inject physical shockwave displacement.
        """
        # 1. Advance drift trajectory (SubBass accelerates time/motion)
        speed = self.base_drift_speed * (1.0 + stems.sub_bass * 3.5)
        self.drift_progress += speed
        if self.drift_progress >= 1.0:
            self.drift_progress -= 1.0
            self.latent_a = self.latent_b
            self.latent_b = torch.randn(self.latent_shape, device=self.device, dtype=self.dtype)

        current_latent = slerp(self.drift_progress, self.latent_a, self.latent_b)

        # 2. Kick transient impulse shockwave
        if stems.kick > 0.45:
            # Generate a new random perturbation direction on hard hits
            self.shockwave_vector = torch.randn(self.latent_shape, device=self.device, dtype=self.dtype)
            self.shockwave_amplitude = min(1.2, stems.kick * 0.9)
        else:
            self.shockwave_amplitude *= self.shockwave_decay

        if self.shockwave_amplitude > 0.01:
            current_latent = current_latent + self.shockwave_vector * self.shockwave_amplitude

        # Normalize to maintain standard gaussian variance
        current_latent = current_latent / (torch.std(current_latent) + 1e-6)

        # 3. Compute prompt blend (Voice formants and Snare morph aesthetics)
        target_blend = np.clip(stems.voice * 0.7 + stems.snare * 0.5, 0.0, 1.0)
        self.prompt_blend = float(np.interp(0.2, [0, 1], [self.prompt_blend, target_blend]))

        return current_latent

    def get_warp_transform(self, stems: AudioStems):
        """
        Computes affine 2D warp parameters for image feedback loops:
        - Zoom in/out synchronized with sub-bass pulses.
        - Subtle rotation linked to stereo / air shimmer.
        """
        zoom = 1.0 + (stems.sub_bass * 0.035) - (stems.kick * 0.015)
        rotation_deg = (stems.air - 0.5) * 1.8
        return zoom, rotation_deg
