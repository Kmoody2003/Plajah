using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using LLama;
using LLama.Common;
using LLama.Sampling;

namespace Plajah.WinUI;

/// <summary>
/// The desktop app's on-device language models — real llama.cpp inference (LLamaSharp) on the PC's
/// GPU, for every AI feature in the web app that asks for one (Aria, the composer council, …).
///
/// Desktop first: in the app, AI work runs here on the dedicated GPU (Vulkan reaches NVIDIA RTX,
/// AMD and Intel) with nothing like the browser's 4 GB WebAssembly heap; the web app only falls back
/// to in-browser models when it isn't running inside the app.
///
/// Models are GGUF files found in the app's model folder (%LOCALAPPDATA%\Plajah\Models\llm), the
/// studio's shared folder (D:\Plajah Models\llm) or PLAJAH_LLM_DIR, and can be downloaded into the
/// app's folder. One model is resident at a time (8 GB laptop GPUs can't hold two); it is unloaded
/// after a few idle minutes so games, renders and the DAW get the VRAM back.
/// </summary>
public static class NativeLlmService
{
    public sealed record ModelSpec(string Key, string Label, string[] Files, string? Url, long MinBytes, uint Context, int Rank);

    // Best first. Gemma 4 is used when its GGUF is on disk (any gemma-4 / gemma4 file); the others
    // can be downloaded (same sources as scripts/localAi/download_council_models.py).
    private static readonly ModelSpec[] Catalog =
    {
        new("gemma-4", "Gemma 4", new[] { "gemma-4*.gguf", "gemma4*.gguf" }, null, 1_000_000_000, 8192, 0),
        new("qwen-7b", "Qwen 2.5 7B", new[] { "Qwen2.5-7B-Instruct-Q4_K_M.gguf", "qwen2.5-7b-instruct-q4_k_m.gguf" },
            "https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf", 4_500_000_000, 8192, 1),
        new("nemotron-4b", "Nemotron Mini 4B", new[] { "Nemotron-Mini-4B-Instruct-Q4_K_M.gguf" },
            "https://huggingface.co/bartowski/Nemotron-Mini-4B-Instruct-GGUF/resolve/main/Nemotron-Mini-4B-Instruct-Q4_K_M.gguf", 2_500_000_000, 4096, 2),
        new("gemma-2-2b", "Gemma 2 2B", new[] { "gemma-2-2b-it-Q4_K_M.gguf" },
            "https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf", 1_400_000_000, 7168, 3),
    };

    public static string AppModelDir =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Plajah", "Models", "llm");

    private static IEnumerable<string> SearchDirs()
    {
        var env = Environment.GetEnvironmentVariable("PLAJAH_LLM_DIR");
        if (!string.IsNullOrWhiteSpace(env)) yield return env;
        yield return AppModelDir;
        yield return @"D:\Plajah Models\llm";
        yield return @"D:\Plajah AI Models\llm";
    }

    public static string? FindModel(ModelSpec spec)
    {
        foreach (var dir in SearchDirs())
        {
            if (!Directory.Exists(dir)) continue;
            foreach (var pattern in spec.Files)
            {
                foreach (var path in Directory.EnumerateFiles(dir, pattern))
                {
                    if (!path.EndsWith(".gguf", StringComparison.OrdinalIgnoreCase)) continue;
                    try { if (new FileInfo(path).Length >= spec.MinBytes) return path; } catch { /* unreadable */ }
                }
            }
        }
        return null;
    }

    public sealed record ModelStatus(string key, string label, bool present, string? path, bool downloadable, bool loaded);

    public static object Status()
    {
        var models = Catalog.OrderBy(m => m.Rank).Select(m =>
        {
            var path = FindModel(m);
            return new ModelStatus(m.Key, m.Label, path != null, path, m.Url != null, _loadedKey == m.Key);
        }).ToList();
        return new { models, backend = _backend, gpu = GpuName(), modelDir = AppModelDir, ready = models.Any(m => m.present) };
    }

    // ── the resident model ────────────────────────────────────────────────────

    /// <summary>Generations in flight by the web caller's requestId (LOCAL_LLM_CANCEL stops one).</summary>
    public static readonly System.Collections.Concurrent.ConcurrentDictionary<string, CancellationTokenSource> Inflight = new();

    private static readonly SemaphoreSlim Gate = new(1, 1);
    private static LLamaWeights? _weights;
    private static ModelParams? _params;
    // One context lives as long as the model: building one per request (StatelessExecutor) cost
    // ~6 s on every call (KV cache allocation + GPU pipeline setup). It is cleared between requests.
    private static LLamaContext? _context;
    private static string? _loadedKey;
    private static string _backend = "not loaded";
    private static Timer? _idleTimer;
    private static readonly TimeSpan IdleUnload = TimeSpan.FromMinutes(4);
    private static bool _configured;

    /// <summary>
    /// Load llama.cpp's native libraries ourselves, best backend first: the Vulkan build (any GPU
    /// with a Vulkan driver — NVIDIA RTX, AMD, Intel), then the CPU builds (AVX2 → AVX → none).
    /// LLamaSharp's own selection API isn't in the build .NET 8 gets, and once llama.dll is loaded
    /// into the process its P/Invokes bind to that copy.
    /// </summary>
    private static void ConfigureBackend()
    {
        if (_configured) return;
        _configured = true;
        var arch = RuntimeInformation.ProcessArchitecture == Architecture.Arm64 ? "win-arm64" : "win-x64";
        var root = Path.Combine(AppContext.BaseDirectory, "runtimes", arch, "native");
        var candidates = new (string dir, string name)[]
        {
            (Path.Combine(root, "vulkan"), "vulkan"),
            (Path.Combine(root, "avx2"), "cpu-avx2"),
            (Path.Combine(root, "avx"), "cpu-avx"),
            (Path.Combine(root, "noavx"), "cpu"),
            (root, "cpu"),
        };
        foreach (var (dir, name) in candidates)
        {
            if (!File.Exists(Path.Combine(dir, "llama.dll"))) continue;
            if (name == "cpu-avx2" && !System.Runtime.Intrinsics.X86.Avx2.IsSupported) continue;
            if (name == "cpu-avx" && !System.Runtime.Intrinsics.X86.Avx.IsSupported) continue;
            try
            {
                foreach (var dll in new[] { "ggml-base.dll", "ggml-cpu.dll", "ggml-vulkan.dll", "ggml.dll", "llama.dll" })
                {
                    var path = Path.Combine(dir, dll);
                    // The Vulkan build ships without ggml-cpu.dll (llama.cpp always keeps a CPU backend
                    // for host work); borrow it from the best CPU build this processor runs.
                    if (!File.Exists(path) && dll == "ggml-cpu.dll") path = BestCpuDir(root) is { } cpu ? Path.Combine(cpu, dll) : path;
                    if (File.Exists(path)) NativeLibrary.Load(path);
                }
                _backend = name;
                return;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[NativeLlm] {name} backend unavailable: {ex.Message}");
            }
        }
    }

    private static string? BestCpuDir(string root)
    {
        if (System.Runtime.Intrinsics.X86.Avx2.IsSupported && File.Exists(Path.Combine(root, "avx2", "ggml-cpu.dll"))) return Path.Combine(root, "avx2");
        if (System.Runtime.Intrinsics.X86.Avx.IsSupported && File.Exists(Path.Combine(root, "avx", "ggml-cpu.dll"))) return Path.Combine(root, "avx");
        if (File.Exists(Path.Combine(root, "noavx", "ggml-cpu.dll"))) return Path.Combine(root, "noavx");
        return File.Exists(Path.Combine(root, "ggml-cpu.dll")) ? root : null;
    }

    /// <summary>Set by the app to report the GPU in status (kept injectable so this file stands alone).</summary>
    public static Func<string> GpuNameProvider { get; set; } = () => "";

    private static string GpuName()
    {
        try { return GpuNameProvider(); } catch { return ""; }
    }

    private static ModelSpec? Pick(string? requested)
    {
        if (!string.IsNullOrWhiteSpace(requested))
        {
            var exact = Catalog.FirstOrDefault(m => m.Key.Equals(requested, StringComparison.OrdinalIgnoreCase));
            if (exact != null && FindModel(exact) != null) return exact;
        }
        return Catalog.OrderBy(m => m.Rank).FirstOrDefault(m => FindModel(m) != null);
    }

    private static void EnsureLoaded(ModelSpec spec)
    {
        if (_loadedKey == spec.Key && _weights != null) return;
        Unload();
        ConfigureBackend();
        var path = FindModel(spec) ?? throw new FileNotFoundException($"{spec.Label} is not on this PC");
        _params = new ModelParams(path)
        {
            ContextSize = spec.Context,
            GpuLayerCount = 999,          // everything on the GPU; llama.cpp keeps what doesn't fit on the CPU
        };
        _weights = LLamaWeights.LoadFromFile(_params);
        _context = _weights.CreateContext(_params);
        _loadedKey = spec.Key;
    }

    private static void Unload()
    {
        _context?.Dispose();
        _context = null;
        _weights?.Dispose();
        _weights = null;
        _params = null;
        _loadedKey = null;
    }

    private static void TouchIdle()
    {
        _idleTimer?.Dispose();
        _idleTimer = new Timer(async _ =>
        {
            if (!await Gate.WaitAsync(0)) return;     // busy: try again on the next touch
            try { Unload(); } finally { Gate.Release(); }
        }, null, IdleUnload, Timeout.InfiniteTimeSpan);
    }

    /// <summary>Seconds the last request spent loading the model (0 when it was already resident).</summary>
    public static double LastLoadSeconds { get; private set; }

    public sealed record ChatMessage(string role, string content);

    public sealed record GenerateResult(bool success, string text, string model, string backend, int tokens, double seconds, string? error);

    /// <summary>Generate a chat reply. One request at a time (one GPU).</summary>
    public static async Task<GenerateResult> GenerateAsync(
        IReadOnlyList<ChatMessage> messages, string? model, int maxTokens, float temperature, CancellationToken ct)
    {
        await Gate.WaitAsync(ct);
        var started = DateTime.UtcNow;
        try
        {
            var spec = Pick(model);
            if (spec == null) return new GenerateResult(false, "", "", _backend, 0, 0, "No language model is installed on this PC yet");
            await Task.Run(() => EnsureLoaded(spec), ct);
            var genStarted = DateTime.UtcNow;

            // The model's own chat template (stored in the GGUF) — no per-model prompt formats here.
            // System instructions are folded into the first user turn: some templates (Gemma) have
            // no system role and silently drop it, which lost every formatting instruction.
            var system = string.Join("\n\n", messages.Where(m => m.role == "system").Select(m => m.content));
            var turns = messages.Where(m => m.role != "system").ToList();
            var template = new LLamaTemplate(_weights!) { AddAssistant = true };
            var first = true;
            foreach (var m in turns)
            {
                var role = m.role == "assistant" ? "assistant" : "user";
                var content = first && role == "user" && system.Length > 0 ? $"{system}\n\n{m.content}" : m.content;
                template.Add(role, content);
                if (role == "user") first = false;
            }
            if (turns.Count == 0 && system.Length > 0) template.Add("user", system);
            var prompt = Encoding.UTF8.GetString(template.Apply());

            _context!.NativeHandle.MemoryClear(true);   // a fresh conversation in the resident context
            var executor = new InteractiveExecutor(_context);
            var inference = new InferenceParams
            {
                MaxTokens = Math.Clamp(maxTokens, 1, 4096),
                SamplingPipeline = new DefaultSamplingPipeline { Temperature = Math.Clamp(temperature, 0f, 2f) },
            };
            var sb = new StringBuilder();
            var tokens = 0;
            await foreach (var piece in executor.InferAsync(prompt, inference, ct))
            {
                sb.Append(piece);
                tokens++;
            }
            LastLoadSeconds = (genStarted - started).TotalSeconds;
            return new GenerateResult(true, sb.ToString().Trim(), spec.Label, _backend, tokens, (DateTime.UtcNow - genStarted).TotalSeconds, null);
        }
        catch (OperationCanceledException)
        {
            return new GenerateResult(false, "", _loadedKey ?? "", _backend, 0, (DateTime.UtcNow - started).TotalSeconds, "cancelled");
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[NativeLlm] {ex}");
            Unload();
            return new GenerateResult(false, "", _loadedKey ?? "", _backend, 0, (DateTime.UtcNow - started).TotalSeconds, ex.Message);
        }
        finally
        {
            TouchIdle();
            Gate.Release();
        }
    }

    // ── downloads ─────────────────────────────────────────────────────────────

    private static readonly HttpClient Http = new() { Timeout = Timeout.InfiniteTimeSpan };

    /// <summary>Download a catalog model into the app's model folder (resumable via a .part file).</summary>
    public static async Task<(bool ok, string? path, string? error)> DownloadAsync(string key, Action<long, long> progress, CancellationToken ct)
    {
        var spec = Catalog.FirstOrDefault(m => m.Key == key);
        if (spec?.Url == null) return (false, null, "This model can't be downloaded from here");
        var existing = FindModel(spec);
        if (existing != null) return (true, existing, null);
        Directory.CreateDirectory(AppModelDir);
        var final = Path.Combine(AppModelDir, spec.Files[0]);
        var part = final + ".part";
        try
        {
            long have = File.Exists(part) ? new FileInfo(part).Length : 0;
            using var req = new HttpRequestMessage(HttpMethod.Get, spec.Url);
            if (have > 0) req.Headers.Range = new System.Net.Http.Headers.RangeHeaderValue(have, null);
            using var res = await Http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
            res.EnsureSuccessStatusCode();
            if (res.StatusCode != System.Net.HttpStatusCode.PartialContent) have = 0;   // server ignored the range
            long total = have + (res.Content.Headers.ContentLength ?? 0);
            await using (var src = await res.Content.ReadAsStreamAsync(ct))
            await using (var dst = new FileStream(part, have > 0 ? FileMode.Append : FileMode.Create, FileAccess.Write, FileShare.None, 1 << 20, true))
            {
                var buf = new byte[1 << 20];
                long done = have, lastReport = 0;
                int n;
                while ((n = await src.ReadAsync(buf, ct)) > 0)
                {
                    await dst.WriteAsync(buf.AsMemory(0, n), ct);
                    done += n;
                    if (done - lastReport > 16 << 20) { lastReport = done; progress(done, total); }
                }
                progress(done, total);
            }
            if (new FileInfo(part).Length < spec.MinBytes) return (false, null, "The download was incomplete — try again to resume it");
            File.Move(part, final, true);
            return (true, final, null);
        }
        catch (OperationCanceledException) { return (false, null, "cancelled"); }
        catch (Exception ex) { return (false, null, ex.Message); }
    }
}
