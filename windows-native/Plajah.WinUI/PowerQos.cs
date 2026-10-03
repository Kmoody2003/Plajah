using System;
using System.Runtime.InteropServices;

namespace Plajah.WinUI;

/// <summary>
/// Hybrid-CPU (P-core / E-core) scheduling hints for Windows 11.
///
/// Windows can't be told "run on core 3", but it schedules by Quality of Service: HighQoS threads
/// get performance cores, EcoQoS threads are steered to efficiency cores at lower clocks (Intel
/// Thread Director / AMD equivalents use the same signal). So:
///   - the interactive shell is pinned HighQoS while it's on screen (never throttled), and drops to
///     EcoQoS only when minimized AND silent AND not driving a studio output — so playback, live
///     output and anything the user is watching are never put on slow cores;
///   - bulk background work (recursive media scans) runs EcoQoS so it never competes with the UI,
///     audio or the WebView's GPU/render processes for P-cores.
/// The WebView2 child processes are managed by Chromium itself (it already puts hidden renderers in
/// efficiency mode). All calls are best-effort: on Windows 10 or older hardware they're no-ops.
/// </summary>
internal static class PowerQos
{
    private const int ProcessPowerThrottling = 4;   // PROCESS_INFORMATION_CLASS
    private const int ThreadPowerThrottling = 3;    // THREAD_INFORMATION_CLASS
    private const uint CurrentVersion = 1;
    private const uint ExecutionSpeed = 0x1;        // *_POWER_THROTTLING_EXECUTION_SPEED

    [StructLayout(LayoutKind.Sequential)]
    private struct PowerThrottlingState
    {
        public uint Version;
        public uint ControlMask;
        public uint StateMask;
    }

    /// <summary>eco=false → HighQoS (explicitly never throttled); eco=true → EcoQoS.</summary>
    public static void SetProcessEco(bool eco)
    {
        try
        {
            var state = new PowerThrottlingState
            {
                Version = CurrentVersion,
                ControlMask = ExecutionSpeed,
                StateMask = eco ? ExecutionSpeed : 0,
            };
            SetProcessInformation(GetCurrentProcess(), ProcessPowerThrottling, ref state, (uint)Marshal.SizeOf<PowerThrottlingState>());
        }
        catch { /* unsupported OS — ignore */ }
    }

    /// <summary>Marks the current (thread-pool) thread EcoQoS until disposed, then hands control back to the OS.</summary>
    public static IDisposable EcoThread() => new EcoScope();

    private sealed class EcoScope : IDisposable
    {
        public EcoScope() => SetThread(ExecutionSpeed, ExecutionSpeed);
        public void Dispose() => SetThread(0, 0);   // ControlMask 0 = "system decides" (the default)
    }

    private static void SetThread(uint control, uint stateMask)
    {
        try
        {
            var state = new PowerThrottlingState { Version = CurrentVersion, ControlMask = control, StateMask = stateMask };
            SetThreadInformation(GetCurrentThread(), ThreadPowerThrottling, ref state, (uint)Marshal.SizeOf<PowerThrottlingState>());
        }
        catch { }
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetProcessInformation(IntPtr hProcess, int infoClass, ref PowerThrottlingState info, uint size);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetThreadInformation(IntPtr hThread, int infoClass, ref PowerThrottlingState info, uint size);

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetCurrentProcess();

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetCurrentThread();
}
