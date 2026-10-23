using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;

namespace Plajah.WinUI;

/// <summary>
/// Tela 3D — image → GLB on the PC's own GPU (Stable Fast 3D, TripoSR, Hunyuan3D-2mini), so 3D generation
/// in the app costs nothing and never touches a cloud account.
///
/// The engine is engines/tela-3d/tela3d_runtime.py in its own Python env (D:\Plajah Runtime\tela3d-py) with
/// the model code under D:\Plajah Runtime\tela3d-src and weights under D:\Plajah Models\hf. This service only
/// starts it on demand and reports where it listens; the web app then posts images straight to
/// http://127.0.0.1:51124 (GLBs are megabytes — too big to route through WebView2 messages).
/// </summary>
public static class Tela3dRuntimeService
{
    public const int Port = 51124;
    private static readonly string RuntimeRoot = Environment.GetEnvironmentVariable("TELA_RUNTIME_ROOT") ?? @"D:\Plajah Runtime";
    private static Process? _process;
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(1.5) };

    private static string? FindScript()
    {
        var candidates = new List<string>();
        var env = Environment.GetEnvironmentVariable("PLAJAH_TELA3D_SCRIPT");
        if (!string.IsNullOrWhiteSpace(env)) candidates.Add(env);
        candidates.Add(Path.Combine(RuntimeRoot, "engines", "tela-3d", "tela3d_runtime.py"));
        foreach (var c in candidates) if (File.Exists(c)) return c;
        return null;
    }

    private static async Task<bool> AnswersAsync()
    {
        try { return (await Http.GetAsync($"http://127.0.0.1:{Port}/health")).IsSuccessStatusCode; }
        catch { return false; }
    }

    public static async Task<object> EnsureAsync()
    {
        if (await AnswersAsync()) return new { success = true, port = Port, started = false };
        if (_process is { HasExited: false }) return new { success = true, port = Port, started = true, booting = true };

        var python = Path.Combine(RuntimeRoot, "tela3d-py", "Scripts", "python.exe");
        var script = FindScript();
        if (!File.Exists(python) || script == null)
            return new { success = false, port = Port, error = $"Tela 3D isn't installed on this PC ({RuntimeRoot}\\tela3d-py)" };

        var psi = new ProcessStartInfo(python)
        {
            WorkingDirectory = Path.GetDirectoryName(script)!,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        foreach (var a in new[] { "-u", "-W", "ignore", script, "--port", Port.ToString() }) psi.ArgumentList.Add(a);
        psi.Environment["HF_HOME"] = Path.Combine(RuntimeRoot, "cache", "hf");
        psi.Environment["TMP"] = psi.Environment["TEMP"] = Path.Combine(RuntimeRoot, "tmp");
        psi.Environment["PYTHONIOENCODING"] = "utf-8";
        try
        {
            _process = Process.Start(psi);
            return new { success = _process != null, port = Port, started = true, booting = true };
        }
        catch (Exception ex)
        {
            return new { success = false, port = Port, error = ex.Message };
        }
    }
}
