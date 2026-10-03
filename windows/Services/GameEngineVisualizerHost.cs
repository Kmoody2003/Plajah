using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Threading;
using System.Threading.Tasks;

namespace PlajahApp.Services
{
    public enum GameEngineType
    {
        Godot4,
        UnityHDRP
    }

    /// <summary>
    /// Service in Plajah Windows Desktop (WinUI 3) that manages the lifecycle of
    /// a dedicated standalone visualizer engine process (Godot 4 or Unity HDRP)
    /// and streams real-time audio stem metrics via a Named Pipe.
    /// </summary>
    public class GameEngineVisualizerHost : IDisposable
    {
        private const string PipeName = "PlajahAudioPipe";
        private Process _engineProcess;
        private NamedPipeServerStream _pipeServer;
        private CancellationTokenSource _cts;
        private bool _isRunning = false;

        public bool IsRunning => _isRunning;

        /// <summary>
        /// Launches the chosen game engine executable and embeds it inside the specified parent HWND.
        /// </summary>
        public async Task StartEngineAsync(GameEngineType engineType, IntPtr parentWindowHandle, string customExecutablePath = null)
        {
            StopEngine();

            _cts = new CancellationTokenSource();

            // 1. Determine executable path
            string exePath = customExecutablePath;
            if (string.IsNullOrEmpty(exePath))
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                exePath = engineType switch
                {
                    GameEngineType.Godot4 => Path.Combine(baseDir, "Engines", "Godot4", "PlajahVisualizerGodot4.exe"),
                    GameEngineType.UnityHDRP => Path.Combine(baseDir, "Engines", "Unity", "PlajahVisualizerUnity.exe"),
                    _ => throw new ArgumentOutOfRangeException(nameof(engineType))
                };
            }

            // 2. Start Named Pipe Server
            _pipeServer = new NamedPipeServerStream(
                PipeName,
                PipeDirection.Out,
                1,
                PipeTransmissionMode.Byte,
                PipeOptions.Asynchronous
            );

            // 3. Launch Process with window embedding arguments
            string arguments = engineType switch
            {
                GameEngineType.Godot4 => $"--parent-window {parentWindowHandle.ToInt64()}",
                GameEngineType.UnityHDRP => $"-parentHwnd {parentWindowHandle.ToInt64()} -popupwindow",
                _ => ""
            };

            var startInfo = new ProcessStartInfo
            {
                FileName = exePath,
                Arguments = arguments,
                UseShellExecute = false,
                CreateNoWindow = false
            };

            try
            {
                if (File.Exists(exePath))
                {
                    _engineProcess = Process.Start(startInfo);
                }
                else
                {
                    Debug.WriteLine($"[GameEngineVisualizerHost] Executable not found at '{exePath}'. Running in mock IPC test mode.");
                }

                _isRunning = true;

                // Wait for the engine to connect to the pipe
                await _pipeServer.WaitForConnectionAsync(_cts.Token);
                Debug.WriteLine("[GameEngineVisualizerHost] Game Engine connected to Named Pipe successfully.");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[GameEngineVisualizerHost] Engine start failed: {ex.Message}");
            }
        }

        /// <summary>
        /// Sends a 24-byte multi-stem audio frame to the running engine.
        /// </summary>
        public async Task SendAudioStemFrameAsync(float kick, float snare, float voice, float air, float subBass, float level)
        {
            if (_pipeServer == null || !_pipeServer.IsConnected) return;

            byte[] buffer = new byte[24];
            Buffer.BlockCopy(BitConverter.GetBytes(kick), 0, buffer, 0, 4);
            Buffer.BlockCopy(BitConverter.GetBytes(snare), 0, buffer, 4, 4);
            Buffer.BlockCopy(BitConverter.GetBytes(voice), 0, buffer, 8, 4);
            Buffer.BlockCopy(BitConverter.GetBytes(air), 0, buffer, 12, 4);
            Buffer.BlockCopy(BitConverter.GetBytes(subBass), 0, buffer, 16, 4);
            Buffer.BlockCopy(BitConverter.GetBytes(level), 0, buffer, 20, 4);

            try
            {
                await _pipeServer.WriteAsync(buffer, 0, 24);
                await _pipeServer.FlushAsync();
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[GameEngineVisualizerHost] Audio pipe write error: {ex.Message}");
            }
        }

        public void StopEngine()
        {
            _cts?.Cancel();

            try
            {
                _pipeServer?.Dispose();
                _pipeServer = null;

                if (_engineProcess != null && !_engineProcess.HasExited)
                {
                    _engineProcess.Kill();
                    _engineProcess.Dispose();
                    _engineProcess = null;
                }
            }
            catch { }

            _isRunning = false;
        }

        public void Dispose()
        {
            StopEngine();
        }
    }
}
