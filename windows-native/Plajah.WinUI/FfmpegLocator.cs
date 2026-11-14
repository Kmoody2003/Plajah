using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;

namespace Plajah.WinUI;

/// <summary>
/// Finds an ffmpeg.exe that can carry SRT, for the SRT input/output paths.
///
/// SRT is a transport (libsrt) that also needs an encoder, an MPEG-TS muxer and a decoder for whatever
/// the remote encoder sends. ffmpeg built with libsrt gives all of that in one process, so SRT runs as a
/// supervised ffmpeg child instead of hand-rolled TS/H.264 code. Search order:
///   1. PLAJAH_FFMPEG (full path to ffmpeg.exe)
///   2. &lt;app&gt;\ffmpeg\ffmpeg.exe, &lt;app&gt;\ffmpeg.exe           (shipped with the package)
///   3. windows-native\third_party\ffmpeg\win-x64\ffmpeg.exe       (dev builds run from bin\)
///   4. %LOCALAPPDATA%\Plajah\ffmpeg\ffmpeg.exe                     (installed later by the user)
///   5. PATH
/// A candidate only counts if `ffmpeg -protocols` lists srt (many builds, e.g. CapCut's, don't).
/// </summary>
internal static class FfmpegLocator
{
    public sealed record Probe(string? Path, bool Srt, string? Version, IReadOnlyList<string> H264Encoders, string? Reason);

    private static Probe? _cached;
    private static long _cachedAt;
    private static readonly object Gate = new();

    public static Probe Current
    {
        get
        {
            lock (Gate)
            {
                // A missing ffmpeg is re-checked every 30 s, so dropping one in works without a restart.
                if (_cached != null && (_cached.Srt || Environment.TickCount64 - _cachedAt < 30000)) return _cached;
                _cached = Run();
                _cachedAt = Environment.TickCount64;
                return _cached;
            }
        }
    }

    /// <summary>Any working ffmpeg, SRT or not. Crossover's file conversion doesn't need libsrt.</summary>
    public sealed record AnyProbe(string? Path, string? Version, IReadOnlyList<string> Encoders);
    private static AnyProbe? _any;
    private static long _anyAt;

    public static AnyProbe Any
    {
        get
        {
            lock (Gate)
            {
                if (_any != null && (_any.Path != null || Environment.TickCount64 - _anyAt < 30000)) return _any;
                _any = FindAny();
                _anyAt = Environment.TickCount64;
                return _any;
            }
        }
    }

    /// <summary>Look again after an install, rather than waiting for the 30 second retry.</summary>
    public static void Forget() { lock (Gate) { _any = null; _cached = null; } }

    private static AnyProbe FindAny()
    {
        foreach (var c in Candidates())
        {
            try
            {
                if (!File.Exists(c)) continue;
                var version = Capture(c, "-hide_banner -version").Split('\n').FirstOrDefault()?.Trim();
                var enc = Capture(c, "-hide_banner -encoders");
                // Lines read " V....D h264_nvenc  NVIDIA NVENC ...": the second column is the name.
                var names = enc.Split('\n').Select(l => l.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries))
                    .Where(p => p.Length > 1 && p[0].Length == 6).Select(p => p[1]).ToList();
                return new AnyProbe(c, version, names);
            }
            catch { /* try the next one */ }
        }
        return new AnyProbe(null, null, Array.Empty<string>());
    }

    public static bool SrtAvailable => Current.Srt;
    public static string SrtReason => Current.Reason ?? "";

    private static IEnumerable<string> Candidates()
    {
        var env = Environment.GetEnvironmentVariable("PLAJAH_FFMPEG");
        if (!string.IsNullOrWhiteSpace(env)) yield return env.Trim('"');
        var app = AppContext.BaseDirectory;
        yield return Path.Combine(app, "ffmpeg", "ffmpeg.exe");
        yield return Path.Combine(app, "ffmpeg.exe");
        // bin\x64\Debug\net8.0-windows...\win-x64\ → walk up to windows-native\third_party
        var dir = new DirectoryInfo(app);
        for (int i = 0; i < 8 && dir != null; i++, dir = dir.Parent)
        {
            var p = Path.Combine(dir.FullName, "third_party", "ffmpeg", "win-x64", "ffmpeg.exe");
            if (File.Exists(p)) { yield return p; break; }
        }
        yield return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Plajah", "ffmpeg", "ffmpeg.exe");
        foreach (var d in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';', StringSplitOptions.RemoveEmptyEntries))
            yield return Path.Combine(d.Trim(), "ffmpeg.exe");
    }

    private static Probe Run()
    {
        string? firstFound = null;
        foreach (var c in Candidates())
        {
            try
            {
                if (!File.Exists(c)) continue;
                firstFound ??= c;
                var protocols = Capture(c, "-hide_banner -protocols");
                // "Input:" / "Output:" sections list one protocol per line.
                bool srt = protocols.Split('\n').Any(l => l.Trim() == "srt");
                if (!srt) continue;
                var version = Capture(c, "-hide_banner -version").Split('\n').FirstOrDefault()?.Trim();
                var enc = Capture(c, "-hide_banner -encoders");
                var h264 = new[] { "h264_nvenc", "h264_qsv", "h264_amf", "libx264", "h264_mf" }
                    .Where(e => enc.Contains(" " + e + " ")).ToList();
                if (h264.Count == 0) return new Probe(c, false, version, h264, $"{c} has SRT but no H.264 encoder.");
                return new Probe(c, true, version, h264, null);
            }
            catch { /* try the next one */ }
        }
        return new Probe(firstFound, false, null, Array.Empty<string>(), firstFound == null
            ? "SRT needs ffmpeg with libsrt: put ffmpeg.exe in windows-native\\third_party\\ffmpeg\\win-x64 (or %LOCALAPPDATA%\\Plajah\\ffmpeg), or set PLAJAH_FFMPEG."
            : $"The ffmpeg found ({firstFound}) was built without SRT. Use a build with libsrt (e.g. the BtbN or gyan.dev Windows builds).");
    }

    private static string Capture(string exe, string args)
    {
        var psi = new ProcessStartInfo(exe, args) { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
        using var p = Process.Start(psi)!;
        var stdout = p.StandardOutput.ReadToEndAsync();
        var stderr = p.StandardError.ReadToEndAsync();
        if (!p.WaitForExit(8000)) { try { p.Kill(true); } catch { } }
        return stdout.Result + stderr.Result;
    }

    /// <summary>Start ffmpeg as a child that dies with this app (Job object), with redirected pipes.</summary>
    public static Process Start(string args, bool stdin, bool stdout)
    {
        var exe = Current.Path ?? throw new InvalidOperationException(SrtReason);
        var psi = new ProcessStartInfo(exe, args)
        {
            UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardInput = stdin, RedirectStandardOutput = stdout, RedirectStandardError = true,
        };
        var p = Process.Start(psi) ?? throw new InvalidOperationException("ffmpeg did not start.");
        ChildJob.Add(p);
        return p;
    }

    /// <summary>Quote one argument for the Windows command line (URLs with &amp; and spaces).</summary>
    public static string Q(string s) => "\"" + s.Replace("\"", "\\\"") + "\"";
}

/// <summary>A kill-on-close job: ffmpeg children never outlive the app, even on a crash.</summary>
internal static class ChildJob
{
    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct IO_COUNTERS { public ulong a, b, c, d, e, f; }
    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr CreateJobObject(IntPtr a, string? name);
    [DllImport("kernel32.dll")] private static extern bool SetInformationJobObject(IntPtr job, int cls, ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION info, uint len);
    [DllImport("kernel32.dll")] private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    private static readonly Lazy<IntPtr> Job = new(() =>
    {
        var h = CreateJobObject(IntPtr.Zero, null);
        var info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
        info.BasicLimitInformation.LimitFlags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        SetInformationJobObject(h, 9, ref info, (uint)Marshal.SizeOf<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>());
        return h;
    });

    public static void Add(Process p) { try { AssignProcessToJobObject(Job.Value, p.Handle); } catch { } }
}
