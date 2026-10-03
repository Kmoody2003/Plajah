using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;

namespace Plajah.WinUI;

/// <summary>
/// One long-lived NDI finder.
///
/// NDI discovery is not a request/response call: the runtime listens for senders announcing
/// themselves and builds up a list over the first second or so. Creating a finder, waiting
/// 1.5 s, reading and destroying it (and the whole library) on every scan — what this app did —
/// throws that list away each time, so a scan returned a random 0–2 of the ~20 senders on the
/// network. The standard pattern, used here: create the finder once, keep it running on its own
/// thread, and let a scan simply wait for the list to settle and read it.
///
/// All NDI calls happen on the finder thread (the runtime's find API is not re-entrant), so
/// nothing here blocks the UI thread.
/// </summary>
internal sealed class NdiFinderService : IDisposable
{
    public sealed record Source(string Name, string Url);
    public sealed record Snapshot(IReadOnlyList<Source> Sources, long Version);

    [StructLayout(LayoutKind.Sequential)]
    private struct NDIlib_source_t { public IntPtr p_ndi_name; public IntPtr p_url_address; }

    [StructLayout(LayoutKind.Sequential)]
    private struct NDIlib_find_create_t
    {
        [MarshalAs(UnmanagedType.I1)] public bool show_local_sources;
        public IntPtr p_groups;
        public IntPtr p_extra_ips;
    }

    // The NDI C API returns a 1-byte C++ bool — marshal it as one (the default is a 4-byte BOOL).
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] [return: MarshalAs(UnmanagedType.U1)] private delegate bool InitFn();
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate void VoidFn();
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate IntPtr CreateFn(ref NDIlib_find_create_t c);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate void DestroyFn(IntPtr p);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] [return: MarshalAs(UnmanagedType.U1)] private delegate bool WaitFn(IntPtr p, uint ms);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate IntPtr GetFn(IntPtr p, out uint n);

    private readonly object _gate = new();
    private IntPtr _lib, _finder;
    private InitFn? _init; private VoidFn? _destroyLib; private CreateFn? _create; private DestroyFn? _destroy; private WaitFn? _wait; private GetFn? _get;
    private Thread? _thread;
    private volatile bool _stop;
    private Snapshot _snap = new(Array.Empty<Source>(), 0);
    private long _startedAtTicks;

    public string DllPath { get; private set; } = "";
    public string? LastError { get; private set; }
    public bool Running => _thread is { IsAlive: true } && _finder != IntPtr.Zero;
    /// <summary>Milliseconds since the finder started (small = the list is still filling in).</summary>
    public long AgeMs => _startedAtTicks == 0 ? 0 : (Stopwatch.GetTimestamp() - _startedAtTicks) * 1000 / Stopwatch.Frequency;
    public Snapshot Current => Volatile.Read(ref _snap);

    /// <summary>Loads the runtime and starts the finder (idempotent). Returns false and sets LastError on failure.</summary>
    public bool Start(string dllPath)
    {
        lock (_gate)
        {
            if (Running) return true;
            try
            {
                if (string.IsNullOrWhiteSpace(dllPath) || !File.Exists(dllPath)) { LastError = "NDI runtime (Processing.NDI.Lib.x64.dll) not found."; return false; }
                if (_lib == IntPtr.Zero)
                {
                    if (!NativeLibrary.TryLoad(dllPath, out _lib)) { LastError = $"Could not load {dllPath}."; return false; }
                    T Fn<T>(string name) where T : Delegate =>
                        Marshal.GetDelegateForFunctionPointer<T>(NativeLibrary.GetExport(_lib, name));
                    _init = Fn<InitFn>("NDIlib_initialize");
                    _destroyLib = Fn<VoidFn>("NDIlib_destroy");
                    _create = Fn<CreateFn>("NDIlib_find_create_v2");
                    _destroy = Fn<DestroyFn>("NDIlib_find_destroy");
                    _wait = Fn<WaitFn>("NDIlib_find_wait_for_sources");
                    _get = Fn<GetFn>("NDIlib_find_get_current_sources");
                    if (!_init()) { LastError = "NDIlib_initialize failed (this CPU is not supported by the NDI runtime)."; return false; }
                }
                var settings = new NDIlib_find_create_t { show_local_sources = true, p_groups = IntPtr.Zero, p_extra_ips = IntPtr.Zero };
                _finder = _create!(ref settings);
                if (_finder == IntPtr.Zero) { LastError = "NDIlib_find_create_v2 returned no finder."; return false; }

                DllPath = dllPath; LastError = null; _stop = false;
                _startedAtTicks = Stopwatch.GetTimestamp();
                _thread = new Thread(Pump) { IsBackground = true, Name = "NDI finder" };
                _thread.Start();
                return true;
            }
            catch (Exception ex) { LastError = ex.Message; return false; }
        }
    }

    private void Pump()
    {
        string last = "";
        while (!_stop)
        {
            try
            {
                _wait!(_finder, 1000);                       // returns when the list changes, or after 1 s
                if (_stop) break;
                var list = ReadSources();
                var key = string.Join("\n", list.Select(s => s.Name + "|" + s.Url));
                if (key != last)
                {
                    last = key;
                    var prev = Current;
                    Volatile.Write(ref _snap, new Snapshot(list, prev.Version + 1));
                }
            }
            catch (Exception ex) { LastError = ex.Message; Thread.Sleep(1000); }
        }
    }

    private List<Source> ReadSources()
    {
        var res = new List<Source>();
        var p = _get!(_finder, out var n);
        if (p == IntPtr.Zero) return res;
        int size = Marshal.SizeOf<NDIlib_source_t>();
        for (uint i = 0; i < n; i++)
        {
            var s = Marshal.PtrToStructure<NDIlib_source_t>(IntPtr.Add(p, (int)(i * size)));
            var name = Marshal.PtrToStringUTF8(s.p_ndi_name) ?? "";
            if (name.Length == 0) continue;
            res.Add(new Source(name, Marshal.PtrToStringUTF8(s.p_url_address) ?? ""));
        }
        return res.OrderBy(r => r.Name, StringComparer.OrdinalIgnoreCase).ToList();
    }

    /// <summary>
    /// Waits for the list to settle and returns it. With senders present it returns once the list has
    /// been unchanged for <paramref name="settleMs"/>; with none it gives up after <paramref name="maxMs"/>.
    /// A finder that has been running a while answers almost immediately.
    /// </summary>
    public async Task<Snapshot> ScanAsync(int settleMs = 500, int maxMs = 3000, CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        long ver = Current.Version; long lastChange = 0;
        while (true)
        {
            try { await Task.Delay(100, ct); } catch (OperationCanceledException) { break; }
            var s = Current;
            if (s.Version != ver) { ver = s.Version; lastChange = sw.ElapsedMilliseconds; }
            long e = sw.ElapsedMilliseconds;
            // Settled: has sources, quiet for settleMs (measured from the later of the last change and the start).
            if (s.Sources.Count > 0 && e - lastChange >= settleMs) break;
            if (e >= maxMs) break;
            if (!Running) break;
        }
        return Current;
    }

    public void Dispose()
    {
        lock (_gate)
        {
            _stop = true;
            try { _thread?.Join(2500); } catch { }
            _thread = null;
            try { if (_finder != IntPtr.Zero) _destroy?.Invoke(_finder); } catch { }
            _finder = IntPtr.Zero;
            try { if (_lib != IntPtr.Zero) { _destroyLib?.Invoke(); NativeLibrary.Free(_lib); } } catch { }
            _lib = IntPtr.Zero;
        }
    }
}

/// <summary>Is Windows Firewall letting this program receive network traffic on the current network?</summary>
internal static class FirewallProbe
{
    public sealed record Result(bool? InboundAllowed, string Profile, string Detail);

    public static Result CheckInbound(string? exePath = null)
    {
        try
        {
            exePath ??= Environment.ProcessPath ?? "";
            var t = Type.GetTypeFromProgID("HNetCfg.FwPolicy2");
            if (t == null || exePath.Length == 0) return new Result(null, "", "");
            dynamic pol = Activator.CreateInstance(t)!;
            int cur = (int)pol.CurrentProfileTypes;                        // 1 Domain, 2 Private, 4 Public
            string profile = (cur & 4) != 0 ? "Public" : (cur & 2) != 0 ? "Private" : (cur & 1) != 0 ? "Domain" : "unknown";
            if (!(bool)pol.FirewallEnabled[cur]) return new Result(true, profile, "Firewall is off for this network.");

            bool allow = false, block = false;
            foreach (dynamic r in pol.Rules)
            {
                try
                {
                    if (!(bool)r.Enabled || (int)r.Direction != 1) continue;           // inbound only
                    if (((int)r.Profiles & cur) == 0) continue;                       // rule must cover the current network type
                    string app = r.ApplicationName ?? "";
                    if (app.Length == 0 || !string.Equals(Path.GetFullPath(app), exePath, StringComparison.OrdinalIgnoreCase)) continue;
                    if ((int)r.Action == 1) allow = true; else block = true;
                }
                catch { /* a rule we can't read */ }
            }
            if (block) return new Result(false, profile, $"A Windows Firewall rule blocks Plajah on {profile} networks.");
            if (allow) return new Result(true, profile, "");
            return new Result(false, profile, $"No Windows Firewall rule allows Plajah on {profile} networks.");
        }
        catch { return new Result(null, "", ""); }
    }
}
