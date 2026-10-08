# Plajah Audio Visualizer Engine (Godot 4 .NET / Vulkan)

This directory contains the complete Godot 4.3+ visualizer project utilizing **Vulkan Forward+**, **SDFGI (Signed Distance Field Global Illumination)**, **Screen Space Reflections (SSR)**, and **Volumetric Fog**.

## Why Godot 4 for Plajah?
1. **SDFGI Bounce Light**: Neon rods embedded in dark metal slats (Image 2) bounce real colored light into the crevices in real time.
2. **Native Screen-Space Reflections (SSR)**: Obsidian lakes and mirror-wet lacquer floors (Images 1 & 3) reflect foreground objects with genuine raymarching fidelity.
3. **Ultra-Lightweight**: Only ~70 MB standalone runtime binary, starts in 150 milliseconds, zero royalties, 100% open source under the MIT license.
4. **C# .NET Synergy**: Plajah's desktop app (`windows/PlajahApp.csproj`) and Godot 4 both speak C# .NET 8.

## Project Structure
- `project.godot`: Project settings configured for Forward+ Vulkan, TAA, 4096 shadow maps, and SDFGI.
- `default_env.tres`: WorldEnvironment resource with SSR, SDFGI, SSAO, SSIL, and Volumetric Fog.
- `default_bus_layout.tres`: Audio bus layout with `AudioEffectSpectrumAnalyzer` enabled on Master bus.
- `shaders/obsidian_ripple.gdshader`: Spatial PBR shader with vertex ripple displacement and normal recalculation.
- `scripts/PlajahAudioBridge.cs`: Real-time audio spectrum extractor with Named Pipe IPC support for Plajah Desktop.
- `scripts/ObsidianRippleScene.cs`: Controller for Image 1 (Obsidian ripples, coronet splash, ballistic droplets).
- `scripts/NeonBattensScene.cs`: Controller for Image 2 (42 motorized louvers with SDFGI neon glow).
- `scenes/MainStage.tscn`: Root runnable 3D scene.

## How to Test
1. Download **Godot Engine - .NET version (4.3 or newer)** from [godotengine.org](https://godotengine.org/).
2. Open Godot, click **Import**, select `engines/godot4-visualizer/project.godot`.
3. Press **F5** to build and run the scene.
4. Play any audio file through your system speakers or connect via Plajah Desktop's IPC bridge.
