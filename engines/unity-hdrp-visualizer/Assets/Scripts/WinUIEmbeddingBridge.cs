using System;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;

namespace Plajah.Visualizer.UnityHDRP
{
    /// <summary>
    /// Integrates the Unity standalone engine directly inside the Plajah Windows WinUI 3 desktop application.
    /// Handles Win32 SetParent window embedding and Named Pipe IPC for real-time audio sync.
    /// </summary>
    public class WinUIEmbeddingBridge : MonoBehaviour
    {
        [Header("IPC Settings")]
        public string pipeName = "PlajahAudioPipe";
        public bool autoEmbedOnStartup = true;

        [Header("Audio Reactor Target")]
        public PlajahAudioReactor audioReactor;

        #region Win32 API Interop
        [DllImport("user32.dll")]
        private static extern IntPtr GetActiveWindow();

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern int GetWindowLong(IntPtr hWnd, int nIndex);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

        private const int GWL_STYLE = -16;
        private const int WS_VISIBLE = 0x10000000;
        private const int WS_CHILD = 0x40000000;
        private const int WS_POPUP = unchecked((int)0x80000000);
        private const uint SWP_SHOWWINDOW = 0x0040;
        private const uint SWP_FRAMECHANGED = 0x0020;
        #endregion

        private CancellationTokenSource _cts;

        void Start()
        {
            // Parse Command Line Arguments passed from Plajah Desktop
            // Format: -parentHwnd 12345678
            string[] args = Environment.GetCommandLineArgs();
            IntPtr parentHwnd = IntPtr.Zero;

            for (int i = 0; i < args.Length - 1; i++)
            {
                if (args[i].Equals("-parentHwnd", StringComparison.OrdinalIgnoreCase))
                {
                    if (long.TryParse(args[i + 1], out long handleVal))
                    {
                        parentHwnd = new IntPtr(handleVal);
                    }
                }
            }

            if (autoEmbedOnStartup && parentHwnd != IntPtr.Zero)
            {
                EmbedInsideParent(parentHwnd);
            }

            // Start Named Pipe Audio Listener
            _cts = new CancellationTokenSource();
            Task.Run(() => ListenToDesktopAudioPipeAsync(_cts.Token));
        }

        public void EmbedInsideParent(IntPtr parentHwnd)
        {
            IntPtr unityHwnd = GetActiveWindow();
            if (unityHwnd == IntPtr.Zero || parentHwnd == IntPtr.Zero) return;

            // Strip window borders, titlebar, and turn into WS_CHILD
            int style = GetWindowLong(unityHwnd, GWL_STYLE);
            style &= ~WS_POPUP;
            style |= (WS_CHILD | WS_VISIBLE);
            SetWindowLong(unityHwnd, GWL_STYLE, style);

            // Re-parent into WinUI 3 desktop container
            SetParent(unityHwnd, parentHwnd);

            // Trigger frame update
            SetWindowPos(unityHwnd, IntPtr.Zero, 0, 0, Screen.width, Screen.height, SWP_SHOWWINDOW | SWP_FRAMECHANGED);
            Debug.Log($"[Plajah Unity] Successfully embedded Unity window ({unityHwnd}) into WinUI 3 ({parentHwnd})");
        }

        private async Task ListenToDesktopAudioPipeAsync(CancellationToken token)
        {
            while (!token.IsCancellationRequested)
            {
                try
                {
                    using var pipe = new NamedPipeClientStream(".", pipeName, PipeDirection.In);
                    await pipe.ConnectAsync(token);
                    Debug.Log($"[Plajah Unity] Connected to Desktop Audio Pipe '{pipeName}'");

                    byte[] buffer = new byte[24]; // 6 floats: Kick, Snare, Voice, Air, Sub, Level
                    while (!token.IsCancellationRequested && pipe.IsConnected)
                    {
                        int read = await pipe.ReadAsync(buffer, 0, 24, token);
                        if (read == 24 && audioReactor != null)
                        {
                            audioReactor.kick = BitConverter.ToSingle(buffer, 0);
                            audioReactor.snare = BitConverter.ToSingle(buffer, 4);
                            audioReactor.voice = BitConverter.ToSingle(buffer, 8);
                            audioReactor.air = BitConverter.ToSingle(buffer, 12);
                            audioReactor.subBass = BitConverter.ToSingle(buffer, 16);
                        }
                    }
                }
                catch
                {
                    if (!token.IsCancellationRequested)
                    {
                        await Task.Delay(1000, token);
                    }
                }
            }
        }

        void OnDestroy()
        {
            _cts?.Cancel();
        }
    }
}
