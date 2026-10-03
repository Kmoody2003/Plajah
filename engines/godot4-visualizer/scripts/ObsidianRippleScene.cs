using Godot;
using System;

namespace Plajah.Visualizer.Godot4;

/// <summary>
/// Scene Controller for Image 1: Concentric Obsidian Fluid Ripples & Coronet Impact.
/// Drives the custom PBR spatial shader, coronet crown mesh, and GPUParticles3D droplets.
/// </summary>
public partial class ObsidianRippleScene : Node3D
{
    [Export] public PlajahAudioBridge AudioBridge;
    [Export] public MeshInstance3D LakeMesh;
    [Export] public MeshInstance3D CoronetMesh;
    [Export] public GpuParticles3D DropletParticles;
    [Export] public SpotLight3D CrimsonSpotLight;
    [Export] public OmniLight3D AmberPointLight;
    [Export] public Camera3D MainCamera;

    private ShaderMaterial _lakeMaterial;
    private float _timeAccum = 0.0f;
    private float _lastKickImpact = 0.0f;
    private Vector3 _camInitialPos;

    public override void _Ready()
    {
        if (LakeMesh?.MaterialOverride is ShaderMaterial mat)
        {
            _lakeMaterial = mat;
        }

        if (MainCamera != null)
        {
            _camInitialPos = MainCamera.Position;
        }
    }

    public override void _Process(double delta)
    {
        float dt = (float)delta;
        _timeAccum += dt;

        float kick = AudioBridge?.Kick ?? 0.2f;
        float voice = AudioBridge?.Voice ?? 0.25f;
        float snare = AudioBridge?.Snare ?? 0.1f;

        // 1. Update Lake Spatial Shader Uniforms
        if (_lakeMaterial != null)
        {
            _lakeMaterial.SetShaderParameter("kick_punch", kick);
            _lakeMaterial.SetShaderParameter("voice_energy", voice);
            _lakeMaterial.SetShaderParameter("ripple_speed", 2.5f + voice * 2.0f);
        }

        // 2. Coronet Splash Crown Animation on Kick
        if (CoronetMesh != null)
        {
            if (kick > 0.45f && _timeAccum - _lastKickImpact > 0.18f)
            {
                _lastKickImpact = _timeAccum;
                // Explosive scale expansion
                CoronetMesh.Scale = new Vector3(1.3f, 1.8f + kick * 1.5f, 1.3f);

                // Fire GPU droplet particles with physical collision
                if (DropletParticles != null)
                {
                    DropletParticles.Restart();
                    DropletParticles.Emitting = true;
                }
            }

            // Smooth spring damping back to rest scale
            Vector3 targetScale = new Vector3(1.0f, 0.7f, 1.0f);
            CoronetMesh.Scale = CoronetMesh.Scale.Lerp(targetScale, dt * 8.0f);
            CoronetMesh.RotateY(dt * 0.5f);
        }

        // 3. Dynamic Raking Lights
        if (CrimsonSpotLight != null)
        {
            CrimsonSpotLight.LightEnergy = Mathf.Lerp(CrimsonSpotLight.LightEnergy, 4.0f + kick * 12.0f, dt * 15.0f);
        }
        if (AmberPointLight != null)
        {
            AmberPointLight.LightEnergy = 2.0f + voice * 3.5f;
            AmberPointLight.Position = new Vector3(0, 1.2f + Mathf.Sin(_timeAccum * 2.0f) * 0.2f, 0);
        }

        // 4. Subtle camera vertigo on kick transients
        if (MainCamera != null)
        {
            float shake = (kick > 0.5f) ? (kick * 0.08f) : 0.0f;
            Vector3 offset = new Vector3(
                (float)GD.RandRange(-shake, shake),
                (float)GD.RandRange(-shake, shake),
                0
            );
            MainCamera.Position = _camInitialPos + offset;
        }
    }
}
