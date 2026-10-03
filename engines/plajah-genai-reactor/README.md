# Plajah Generative AI Audio-Reactive Reactor Engine

This engine implements a **real-time, local generative diffusion visualizer** that reacts dynamically to music stems (Kick, Sub-bass, Snare, Vocal formants, Air) and is architected to feed directly into **Microsoft DirectSR / NVIDIA DLSS 3.5** for 1440p / 4K upscaling.

---

## 1. Architectural Highlights

1. **Local Generative Model (SD-Turbo / StreamDiffusion)**:
   - Denoises at **512x512** or **768x432** in FP16 / TensorRT.
   - On an **NVIDIA GeForce RTX 4070**, latency per frame is only **~12–25 ms** (yielding 40–60+ real-time FPS).
2. **Audio-Reactive Latent Trajectories**:
   - **Continuous Drift**: Smoothly navigates high-dimensional latent space using Spherical Linear Interpolation (`slerp`), with speed modulated by **Sub-bass**.
   - **Kick Drum Shockwave**: On bass transient spikes (`kick > 0.45`), generates an instantaneous orthogonal displacement vector, causing physical explosive shockwaves in the visuals.
   - **Prompt Embedding Morphing**: Dynamically blends the text conditioning tensor between *Prompt A* (e.g. dark obsidian fluid) and *Prompt B* (e.g. bioluminescent fractal explosion) driven by vocal formants and snare energy.
3. **Hybrid 3D + DirectSR / DLSS Integration (Option A + B)**:
   - Output frames from this engine can be consumed by Unity HDRP or the DirectSR DirectX 12 swapchain.
   - The 3D engine provides **Depth** and **Motion Vectors**, while this engine provides the **Diffused Color Buffer**, enabling DLSS/FSR to temporally upscale to **4K** without ghosting or flickering.

---

## 2. Audio Input Protocols

The reactor supports two simultaneous audio sources:

1. **Plajah Desktop Named Pipe (`\\.\pipe\PlajahAudioPipe`)**:
   - Receives 24-byte telemetry packets at 60 Hz from Plajah Desktop's WinUI 3 or audio bridge (`PlajahAudioBridge.cs`).
   - Format: 6 consecutive `float32` values:
     `[kick, snare, voice, air, sub_bass, level]`
2. **WASAPI System Loopback (Automatic Fallback)**:
   - If Plajah Desktop is not broadcasting, it automatically captures the Windows default audio playback device (Spotify, YouTube, DAW) via WASAPI loopback and runs real-time Blackman-Harris FFT stem separation locally.

---

## 3. Quickstart & Installation

### Step 1: Create a Python Virtual Environment
Open PowerShell:
```powershell
cd c:\Users\Kenne\plajah\engines\plajah-genai-reactor
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### Step 2: Install PyTorch with CUDA 12.4
```powershell
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124
```

### Step 3: Install Reactor Dependencies
```powershell
pip install -r requirements.txt
```

---

## 4. Running the Engine

### Option A: Run with Live Audio (Microphone / System Loopback)
```powershell
python run_reactor.py
```

### Option B: Test with the Simulated Plajah Audio Broadcaster
In Terminal 1 (Start the audio stream):
```powershell
python test_pipe_sender.py
```

In Terminal 2 (Start the visualizer):
```powershell
python run_reactor.py --pipe PlajahAudioPipe
```

### Keyboard Shortcuts
* **`ESC` / `Q`**: Quit the visualizer.
* **`D`**: Toggle DirectSR / DLSS upscaling view (1080p/1440p).
* **`R`**: Reset and randomize the latent trajectory waypoints.
