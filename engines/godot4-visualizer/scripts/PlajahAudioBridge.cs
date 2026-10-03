using Godot;
using System;
using System.IO.Pipes;
using System.Threading;
using System.Threading.Tasks;

namespace Plajah.Visualizer.Godot4;

/// <summary>
/// Audio analysis bridge for Godot 4.
/// Samples real-time audio from Godot's AudioServer Spectrum Analyzer,
/// or connects via Named Pipe to Plajah Desktop (WinUI 3) for live multi-stem streaming.
/// </summary>
public partial class PlajahAudioBridge : Node
{
    [Export] public string BusName = "Master";
    [Export] public bool EnableNamedPipeIpc = false;
    [Export] public string PipeName = "PlajahAudioPipe";

    public float Kick { get; private set; }
    public float Snare { get; private set; }
    public float Voice { get; private set; }
    public float Air { get; private set; }
    public float SubBass { get; private set; }
    public float Level { get; private set; }

    private AudioEffectSpectrumAnalyzerInstance _spectrumInstance;
    private CancellationTokenSource _cts;

    public override void _Ready()
    {
        // 1. Initialize local Godot audio bus spectrum analyzer
        int busIndex = AudioServer.GetBusIndex(BusName);
        if (busIndex >= 0)
        {
            _spectrumInstance = (AudioEffectSpectrumAnalyzerInstance)AudioServer.GetBusEffectInstance(busIndex, 0);
            GD.Print($"[PlajahAudioBridge] Connected to Audio Bus: '{BusName}'");
        }

        // 2. Start IPC Background Thread if enabled
        if (EnableNamedPipeIpc)
        {
            _cts = new CancellationTokenSource();
            Task.Run(() => ListenToNamedPipeAsync(_cts.Token));
        }
    }

    public override void _Process(double delta)
    {
        if (_spectrumInstance == null) return;

        // Sample frequency ranges (magnitude in linear amplitude)
        Vector2 sub = _spectrumInstance.GetMagnitudeForFrequencyRange(20, 60);
        Vector2 kick = _spectrumInstance.GetMagnitudeForFrequencyRange(40, 110);
        Vector2 voice = _spectrumInstance.GetMagnitudeForFrequencyRange(1000, 3200);
        Vector2 snare = _spectrumInstance.GetMagnitudeForFrequencyRange(1800, 5000);
        Vector2 air = _spectrumInstance.GetMagnitudeForFrequencyRange(9000, 16000);

        // Smooth with decay
        float dt = (float)delta;
        SubBass = Mathf.Lerp(SubBass, sub.Length() * 14.0f, dt * 18.0f);
        Kick = Mathf.Lerp(Kick, kick.Length() * 16.0f, dt * 20.0f);
        Voice = Mathf.Lerp(Voice, voice.Length() * 12.0f, dt * 12.0f);
        Snare = Mathf.Lerp(Snare, snare.Length() * 18.0f, dt * 22.0f);
        Air = Mathf.Lerp(Air, air.Length() * 20.0f, dt * 15.0f);

        Level = (Kick + Voice + Snare + Air) * 0.25f;
    }

    private async Task ListenToNamedPipeAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            try
            {
                using var pipe = new NamedPipeClientStream(".", PipeName, PipeDirection.In);
                GD.Print($"[PlajahAudioBridge] Connecting to Desktop IPC pipe '{PipeName}'...");
                await pipe.ConnectAsync(token);
                GD.Print($"[PlajahAudioBridge] Connected to Plajah Desktop!");

                byte[] buffer = new byte[24]; // 6 floats: Kick, Snare, Voice, Air, Sub, Level
                while (!token.IsCancellationRequested && pipe.IsConnected)
                {
                    int bytesRead = await pipe.ReadAsync(buffer.AsMemory(0, 24), token);
                    if (bytesRead == 24)
                    {
                        Kick = BitConverter.ToSingle(buffer, 0);
                        Snare = BitConverter.ToSingle(buffer, 4);
                        Voice = BitConverter.ToSingle(buffer, 8);
                        Air = BitConverter.ToSingle(buffer, 12);
                        SubBass = BitConverter.ToSingle(buffer, 16);
                        Level = BitConverter.ToSingle(buffer, 20);
                    }
                }
            }
            catch (Exception ex)
            {
                if (!token.IsCancellationRequested)
                {
                    await Task.Delay(1000, token);
                }
            }
        }
    }

    public override void _ExitTree()
    {
        _cts?.Cancel();
    }
}
