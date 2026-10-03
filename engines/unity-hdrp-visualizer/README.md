# Plajah Audio Visualizer Engine (Unity 6 / 2023 LTS HDRP)

This directory contains the project architecture and C# source assets for the **Unity High Definition Render Pipeline (HDRP)** visualizer.

## Why Unity HDRP for Plajah?
1. **Screen Space Reflections (SSR) & Ray-Tracing**: Genuine real-time reflections on the obsidian water lake (Image 1) and wet black lacquer floor (Image 3).
2. **Diffusion Profile Subsurface Scattering (SSS)**: Deep translucent crimson liquid scattering in wave crests and droplet splashes.
3. **VFX Graph (GPU Particle Simulation)**: Over 2,500 physical airborne liquid droplets running entirely on the GPU with depth collision and air drag.
4. **Physical Camera Optics**: Anamorphic bloom streaks, optical chromatic aberration, physical exposure (EV), and volumetric froxel lighting.
5. **Direct WinUI 3 Desktop Embedding**: Uses Win32 `SetParent` to embed Unity directly inside Plajah's Windows desktop app (`windows/MainWindow.xaml`).

## Directory Contents
- `Assets/Scripts/PlajahAudioReactor.cs`: 512-point FFT audio spectrum processor that isolates Kick, Snare, Vocal formants, Air, and drives Shader Graph + VFX Graph + HDRP Camera overrides.
- `Assets/Scripts/WinUIEmbeddingBridge.cs`: Handles Win32 window re-parenting into Plajah WinUI 3 desktop application and Named Pipe audio streaming.
- `Assets/Shaders/ObsidianFluidPBR_ShaderGraph.hlsl`: HLSL custom node for Unity Shader Graph calculating trochoidal ripples and finite-difference normals.
- `Assets/VFX/FluidSplashVFX_Specification.md`: Complete blueprint specification for the GPU particle simulation.

## How to Set Up in Unity
1. Install **Unity 6 (or Unity 2023 LTS)** via Unity Hub.
2. Create a new project selecting the **HDRP (High Definition Render Pipeline)** template.
3. Copy the contents of this `Assets/` directory into your new project's `Assets/` folder.
4. In the Project Settings > Graphics, ensure **HDRP Asset** is active with **Screen Space Reflection** and **Volumetric Fog** enabled.
5. Attach `PlajahAudioReactor.cs` and `WinUIEmbeddingBridge.cs` to a GameObject in your scene.
6. Press **Play** in the Unity Editor to test with your microphone or audio tracks.
