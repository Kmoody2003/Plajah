using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Threading.Tasks;

namespace Plajah.WinUI;

/// <summary>
/// Argilla's NPU lane — picture cut-out and depth on the PC's NPU, with the GPU left to the viewport.
///
/// The engine script ships with the app. Its Python env and models are set up on first use with the person's
/// say-so (ARGILLA_NPU_INSTALL), under D:\Plajah Runtime when this PC already keeps them there and in local
/// app data everywhere else. The web app then posts raw pixels straight to http://127.0.0.1:51125.
/// </summary>
public static class ArgillaNpuService
{
    public const int Port = 51125;
    /// <summary>What setting up adds to the disk, shown before the person agrees.</summary>
    public const int InstallMegabytes = 1500;
    private const string OpenVino = "openvino==2026.4.1";
    private const string Numpy = "numpy==2.4.6";

    private static readonly (string Folder, string File, string Url, string Sha256, long Size)[] Models =
    {
        ("u2net", "u2net.onnx", "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx",
            "8D10D2F3BB75AE3B6D527C77944FC5E7DCD94B29809D47A739A7A728A912B491", 175997641),
        ("depth-anything-v2-small", "model.onnx", "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx",
            "AFB6A5C28F3B6BF1618C6E43F02073EF9DFDC70E937502D51603E57B0A1DF10C", 99060839),
        (@"clip-vit-base-patch32\onnx", "vision_model.onnx", "https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/onnx/vision_model.onnx",
            "FD6E1402A588279D1723C7534D4BCBA5BC0B14B47DFAB0E46F8C47B8270D7D40", 351685709),
    };

    private static string LocalRoot(string leaf) =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Plajah", leaf);

    private static readonly string RuntimeRoot = Environment.GetEnvironmentVariable("TELA_RUNTIME_ROOT")
        ?? (Directory.Exists(@"D:\Plajah Runtime\npu-py") ? @"D:\Plajah Runtime" : LocalRoot("Runtime"));
    private static readonly string ModelsRoot = Environment.GetEnvironmentVariable("PLAJAH_MODELS_ROOT")
        ?? (File.Exists(@"D:\Plajah Models\u2net\u2net.onnx") ? @"D:\Plajah Models" : LocalRoot("Models"));

    private static string PythonExe => Path.Combine(RuntimeRoot, "npu-py", "Scripts", "python.exe");

    private static string ScriptPath
    {
        get
        {
            var packaged = Path.Combine(AppContext.BaseDirectory, "engines", "argilla-npu", "argilla_npu.py");
            return File.Exists(packaged) ? packaged : Path.Combine(RuntimeRoot, "engines", "argilla-npu", "argilla_npu.py");
        }
    }

    private static Process? _process;
    private static Task<object>? _install;
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(1.5) };
    private static readonly HttpClient Downloads = new() { Timeout = TimeSpan.FromMinutes(30) };

    private static async Task<bool> AnswersAsync()
    {
        try { return (await Http.GetAsync($"http://127.0.0.1:{Port}/health")).IsSuccessStatusCode; }
        catch { return false; }
    }

    private static bool Installed()
    {
        if (!File.Exists(PythonExe)) return false;
        foreach (var m in Models)
            if (!File.Exists(Path.Combine(ModelsRoot, m.Folder, m.File))) return false;
        return true;
    }

    public static async Task<object> EnsureAsync()
    {
        if (await AnswersAsync()) return new { success = true, port = Port, started = false };
        if (_process is { HasExited: false }) return new { success = true, port = Port, started = true, booting = true };

        if (!Installed() || !File.Exists(ScriptPath))
            return new { success = false, port = Port, needsInstall = true, installMegabytes = InstallMegabytes, error = "Picture reading isn't set up on this PC yet." };

        var psi = new ProcessStartInfo(PythonExe)
        {
            WorkingDirectory = Path.GetDirectoryName(ScriptPath)!,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        foreach (var a in new[] { "-u", "-W", "ignore", ScriptPath, "--port", Port.ToString() }) psi.ArgumentList.Add(a);
        psi.Environment["PYTHONIOENCODING"] = "utf-8";
        psi.Environment["TELA_RUNTIME_ROOT"] = RuntimeRoot;
        psi.Environment["PLAJAH_MODELS_ROOT"] = ModelsRoot;
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

    /// <summary>Sets up the env and models. Only one install runs at a time; a second call joins it.</summary>
    public static Task<object> InstallAsync(Action<string, double> progress)
    {
        lock (Models)
        {
            if (_install is { IsCompleted: false }) return _install;
            _install = Task.Run(() => RunInstallAsync(progress));
            return _install;
        }
    }

    private static async Task<object> RunInstallAsync(Action<string, double> progress)
    {
        try
        {
            Directory.CreateDirectory(RuntimeRoot);
            if (!File.Exists(PythonExe))
            {
                var uv = Path.Combine(AppContext.BaseDirectory, "uv.exe");
                if (!File.Exists(uv)) uv = Path.Combine(RuntimeRoot, "bin", "uv.exe");
                if (!File.Exists(uv)) throw new InvalidOperationException("This build of the app is missing its setup tool (uv.exe).");
                progress("Setting up Python", 0.02);
                await RunAsync(uv, "venv", "--python", "3.11", Path.Combine(RuntimeRoot, "npu-py"));
                progress("Installing the NPU runtime", 0.1);
                await RunAsync(uv, "pip", "install", "--python", PythonExe, OpenVino, Numpy);
            }
            for (var i = 0; i < Models.Length; i++)
            {
                var m = Models[i];
                var start = 0.3 + 0.7 * i / Models.Length;
                var span = 0.7 / Models.Length;
                var label = i switch { 0 => "Downloading the cut-out model", 1 => "Downloading the depth model", _ => "Downloading the recognition model" };
                progress(label, start);
                await DownloadAsync(m, (fraction) => progress(label, start + span * fraction));
            }
            progress("Ready", 1);
            return new { success = true, port = Port };
        }
        catch (Exception ex)
        {
            return new { success = false, port = Port, error = ex.Message };
        }
    }

    private static async Task RunAsync(string exe, params string[] args)
    {
        var psi = new ProcessStartInfo(exe)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardError = true,
            RedirectStandardOutput = true,
        };
        foreach (var a in args) psi.ArgumentList.Add(a);
        // Keeps uv's Python and package cache beside the env instead of filling the system drive.
        psi.Environment["UV_PYTHON_INSTALL_DIR"] = Path.Combine(RuntimeRoot, "python");
        psi.Environment["UV_CACHE_DIR"] = Path.Combine(RuntimeRoot, "cache", "uv");
        using var process = Process.Start(psi) ?? throw new InvalidOperationException($"Could not start {exe}");
        var stderr = process.StandardError.ReadToEndAsync();
        var stdout = process.StandardOutput.ReadToEndAsync();
        await process.WaitForExitAsync();
        await stdout;
        if (process.ExitCode != 0) throw new InvalidOperationException((await stderr).Trim());
    }

    private static async Task DownloadAsync((string Folder, string File, string Url, string Sha256, long Size) model, Action<double> progress)
    {
        var folder = Path.Combine(ModelsRoot, model.Folder);
        var final = Path.Combine(folder, model.File);
        if (File.Exists(final)) return;
        Directory.CreateDirectory(folder);
        var part = final + ".part";
        using (var response = await Downloads.GetAsync(model.Url, HttpCompletionOption.ResponseHeadersRead))
        {
            response.EnsureSuccessStatusCode();
            await using var source = await response.Content.ReadAsStreamAsync();
            await using var target = File.Create(part);
            var buffer = new byte[1 << 16];
            long done = 0;
            int read;
            while ((read = await source.ReadAsync(buffer)) > 0)
            {
                await target.WriteAsync(buffer.AsMemory(0, read));
                done += read;
                progress(Math.Min(1, (double)done / model.Size));
            }
        }
        // Weights are run as a model by a native runtime, so only the exact bytes that were reviewed are kept.
        string hash;
        await using (var check = File.OpenRead(part)) hash = Convert.ToHexString(await SHA256.HashDataAsync(check));
        if (!string.Equals(hash, model.Sha256, StringComparison.OrdinalIgnoreCase))
        {
            File.Delete(part);
            throw new InvalidOperationException($"{model.File} did not match its expected contents, so it was not kept.");
        }
        File.Move(part, final, true);
    }
}
