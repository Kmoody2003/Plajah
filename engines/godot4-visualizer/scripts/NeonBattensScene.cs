using Godot;
using System;
using System.Collections.Generic;

namespace Plajah.Visualizer.Godot4;

/// <summary>
/// Scene Controller for Image 2: Vertical Architectural Slats with Embedded Neon Phosphors.
/// Demonstrates Godot 4's Vulkan Forward+ SDFGI (Signed Distance Field Global Illumination),
/// casting real-time bounce light from neon phosphors into brushed metallic slat crevices.
/// </summary>
public partial class NeonBattensScene : Node3D
{
    [Export] public PlajahAudioBridge AudioBridge;
    [Export] public int SlatCount = 42;
    [Export] public float Spacing = 0.33f;
    [Export] public SpotLight3D SnareStrobe;

    private readonly List<MeshInstance3D> _battens = new();
    private readonly List<MeshInstance3D> _neonRods = new();
    private readonly List<StandardMaterial3D> _neonMaterials = new();

    private readonly Color[] _palette = new Color[]
    {
        new Color(0.0f, 0.855f, 0.953f), // Cyan
        new Color(0.420f, 0.0f, 0.600f), // Violet
        new Color(0.831f, 0.0f, 0.333f), // Magenta
        new Color(1.0f, 0.549f, 0.0f)   // Amber
    };

    public override void _Ready()
    {
        float totalWidth = SlatCount * Spacing;

        // Shared PBR Material for Brushed Obsidian Metal
        var metalMat = new StandardMaterial3D
        {
            AlbedoColor = new Color(0.06f, 0.055f, 0.08f),
            Metallic = 0.88f,
            Roughness = 0.32f
        };

        // Shared Box Geometry for Battens
        var boxMesh = new BoxMesh
        {
            Size = new Vector3(0.24f, 9.5f, 1.0f)
        };

        // Cylinder Mesh for Embedded Neon Rods
        var rodMesh = new CylinderMesh
        {
            TopRadius = 0.024f,
            BottomRadius = 0.024f,
            Height = 9.0f,
            RadialSegments = 8
        };

        for (int i = 0; i < SlatCount; i++)
        {
            float x = -totalWidth / 2.0f + i * Spacing;
            // Subtle curved architectural amphitheater arc
            float zArc = -Mathf.Pow((i - SlatCount / 2.0f) / (SlatCount / 2.0f), 2.0f) * 0.7f;

            // Batten
            var batten = new MeshInstance3D
            {
                Mesh = boxMesh,
                MaterialOverride = metalMat,
                Position = new Vector3(x, 0, zArc)
            };
            AddChild(batten);
            _battens.Add(batten);

            // Embedded Neon Rod between battens
            if (i < SlatCount - 1)
            {
                Color baseCol = _palette[i % _palette.Length];
                var neonMat = new StandardMaterial3D
                {
                    AlbedoColor = baseCol,
                    EmissionEnabled = true,
                    Emission = baseCol,
                    EmissionEnergyMultiplier = 2.0f // Injects into SDFGI!
                };

                var rod = new MeshInstance3D
                {
                    Mesh = rodMesh,
                    MaterialOverride = neonMat,
                    Position = new Vector3(x + Spacing / 2.0f, 0, zArc + 0.18f)
                };
                AddChild(rod);
                _neonRods.Add(rod);
                _neonMaterials.Add(neonMat);
            }
        }
    }

    public override void _Process(double delta)
    {
        float dt = (float)delta;
        float kick = AudioBridge?.Kick ?? 0.2f;
        float snare = AudioBridge?.Snare ?? 0.1f;
        float voice = AudioBridge?.Voice ?? 0.25f;

        // 1. Equalizer Z-depth extrusion per batten
        for (int i = 0; i < _battens.Count; i++)
        {
            var batten = _battens[i];
            float wave = Mathf.Sin(i * 0.25f - (float)Time.GetTicksMsec() * 0.003f) * 0.5f + 0.5f;
            float targetZ = wave * (kick * 2.2f + 0.2f);

            var pos = batten.Position;
            pos.Z = Mathf.Lerp(pos.Z, targetZ, dt * 12.0f);
            batten.Position = pos;

            // Snare angular rotation flip
            var rot = batten.Rotation;
            float targetRotY = (i % 2 == 0 ? 1.0f : -1.0f) * (snare * 0.35f);
            rot.Y = Mathf.Lerp(rot.Y, targetRotY, dt * 15.0f);
            batten.Rotation = rot;
        }

        // 2. Neon Rod Emission Pulse (drives SDFGI real-time color bounce)
        for (int i = 0; i < _neonMaterials.Count; i++)
        {
            float chase = Mathf.Sin(i * 0.4f - (float)Time.GetTicksMsec() * 0.005f) * 0.5f + 0.5f;
            float energy = 1.5f + chase * 2.0f + kick * 4.0f + voice * 2.5f;
            _neonMaterials[i].EmissionEnergyMultiplier = energy;
        }

        // 3. Snare Strobe
        if (SnareStrobe != null)
        {
            SnareStrobe.LightEnergy = (snare > 0.35f) ? (snare * 14.0f) : 0.0f;
        }
    }
}
