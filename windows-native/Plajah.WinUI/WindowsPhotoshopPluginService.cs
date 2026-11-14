using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using Windows.Storage;

namespace Plajah.WinUI;

/// <summary>
/// Runs Photoshop filter plug-ins (.8bf) in the plajah-8bf-host sidecar, one process per
/// run, so a plug-in crash ends that process and nothing else. Only plug-ins found by a
/// scan of the configured folders can run: the web layer names a plug-in by id, never by
/// path, and folders are added through the native picker.
/// </summary>
public static class WindowsPhotoshopPluginService
{
    private const string SettingsKey = "photoshopPluginDirectories";
    private const string HostExe = "plajah-8bf-host.exe";
    private const int HeadlessTimeoutMs = 5 * 60 * 1000;
    private const int ScanTimeoutMs = 60 * 1000;

    private static readonly ConcurrentDictionary<string, WindowsPhotoshopPlugin> Known = new();
    private static readonly ConcurrentDictionary<string, RunFiles> Runs = new();
    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    private sealed class RunFiles
    {
        public required string Folder { get; init; }
        public string Input => Path.Combine(Folder, "input.rgba");
        public string Output => Path.Combine(Folder, "output.rgba");
        public Process? Process { get; set; }
    }

    // ── Folders ──────────────────────────────────────────────────────────────

    public static IReadOnlyList<string> GetDirectories() =>
        DefaultDirectories().Concat(GetCustomDirectories())
            .Where(Directory.Exists)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

    public static IReadOnlyList<string> AddDirectory(string path)
    {
        var fullPath = Path.GetFullPath(path);
        if (!Directory.Exists(fullPath)) throw new DirectoryNotFoundException(fullPath);
        SaveCustomDirectories(GetCustomDirectories().Append(fullPath).Distinct(StringComparer.OrdinalIgnoreCase));
        return GetDirectories();
    }

    public static IReadOnlyList<string> RemoveDirectory(string path)
    {
        var fullPath = Path.GetFullPath(path);
        SaveCustomDirectories(GetCustomDirectories()
            .Where(item => !string.Equals(item, fullPath, StringComparison.OrdinalIgnoreCase)));
        return GetDirectories();
    }

    private static IEnumerable<string> DefaultDirectories()
    {
        var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        yield return Path.Combine(programFiles, "Common Files", "Adobe", "Plug-Ins");

        var adobe = Path.Combine(programFiles, "Adobe");
        if (!Directory.Exists(adobe)) yield break;
        string[] installs;
        try { installs = Directory.GetDirectories(adobe, "Adobe Photoshop*"); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { yield break; }
        foreach (var install in installs)
        {
            yield return Path.Combine(install, "Plug-ins");
            yield return Path.Combine(install, "Required", "Plug-ins", "Filters");
        }
    }

    private static IEnumerable<string> GetCustomDirectories()
    {
        var configured = ApplicationData.Current.LocalSettings.Values[SettingsKey] as string;
        return string.IsNullOrWhiteSpace(configured)
            ? Array.Empty<string>()
            : configured.Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }

    private static void SaveCustomDirectories(IEnumerable<string> directories) =>
        ApplicationData.Current.LocalSettings.Values[SettingsKey] = string.Join('|', directories);

    // ── Sidecar ──────────────────────────────────────────────────────────────

    /// <summary>The sidecar beside the app, or PLAJAH_8BF_HOST for a development build.</summary>
    public static string? FindHost()
    {
        var beside = Path.Combine(AppContext.BaseDirectory, HostExe);
        if (File.Exists(beside)) return beside;
        var configured = Environment.GetEnvironmentVariable("PLAJAH_8BF_HOST");
        return !string.IsNullOrWhiteSpace(configured) && File.Exists(configured) ? configured : null;
    }

    private static Process StartHost(string host)
    {
        var process = new Process
        {
            StartInfo = new ProcessStartInfo(host)
            {
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = false,
                UseShellExecute = false,
                CreateNoWindow = true,
            },
        };
        process.Start();
        return process;
    }

    private static string Line(object request) => JsonSerializer.Serialize(request);

    /// <summary>Read JSON lines until one is not "ready" or "progress". Null means the sidecar ended.</summary>
    private static async Task<JsonDocument?> ReadReplyAsync(Process process, CancellationToken token)
    {
        while (true)
        {
            var line = await process.StandardOutput.ReadLineAsync(token);
            if (line is null) return null;
            if (string.IsNullOrWhiteSpace(line)) continue;
            JsonDocument document;
            try { document = JsonDocument.Parse(line); }
            catch (JsonException) { continue; }
            var type = document.RootElement.TryGetProperty("type", out var t) ? t.GetString() : null;
            if (type is "ready" or "progress") { document.Dispose(); continue; }
            return document;
        }
    }

    private static void Kill(Process process)
    {
        try { if (!process.HasExited) process.Kill(entireProcessTree: true); }
        catch (Exception ex) when (ex is InvalidOperationException or System.ComponentModel.Win32Exception) { }
    }

    // ── Scan ─────────────────────────────────────────────────────────────────

    public static async Task<WindowsPhotoshopPluginScan> ScanAsync()
    {
        var host = FindHost();
        if (host is null)
            return new(false, Array.Empty<WindowsPhotoshopPlugin>(), Array.Empty<WindowsPhotoshopPluginSkipped>(),
                "The Photoshop plug-in host is not installed with this build of Plajah.");

        using var process = StartHost(host);
        using var timeout = new CancellationTokenSource(ScanTimeoutMs);
        try
        {
            await process.StandardInput.WriteLineAsync(Line(new { type = "scan", directories = GetDirectories() }));
            await process.StandardInput.FlushAsync();
            using var reply = await ReadReplyAsync(process, timeout.Token);
            if (reply is null) return Failure("The plug-in scan ended unexpectedly.");
            var parsed = reply.RootElement.Deserialize<ScanReply>(Json);
            if (parsed?.Plugins is null) return Failure("The plug-in scan returned nothing usable.");

            var plugins = parsed.Plugins
                .Select(p => new WindowsPhotoshopPlugin(IdFor(p.Path, p.Entry), p.Name, p.Category, p.Entry, p.Path))
                .GroupBy(p => p.Id, StringComparer.OrdinalIgnoreCase).Select(g => g.First())
                .OrderBy(p => p.Category, StringComparer.OrdinalIgnoreCase)
                .ThenBy(p => p.Name, StringComparer.OrdinalIgnoreCase)
                .ToArray();
            Known.Clear();
            foreach (var plugin in plugins) Known[plugin.Id] = plugin;
            return new(true, plugins, parsed.Skipped ?? Array.Empty<WindowsPhotoshopPluginSkipped>(), null);
        }
        catch (OperationCanceledException) { return Failure("The plug-in scan timed out."); }
        catch (IOException ex) { return Failure($"The plug-in scan failed: {ex.Message}"); }
        finally { Kill(process); }
    }

    private static WindowsPhotoshopPluginScan Failure(string message) =>
        new(false, Array.Empty<WindowsPhotoshopPlugin>(), Array.Empty<WindowsPhotoshopPluginSkipped>(), message);

    private static string IdFor(string path, string entry) => $"{path}|{entry}";

    // ── Runs ─────────────────────────────────────────────────────────────────

    private static string BaseFolder(long needed)
    {
        var temp = Path.Combine(Path.GetTempPath(), "plajah-8bf");
        try
        {
            if (new DriveInfo(Path.GetPathRoot(temp)!).AvailableFreeSpace > needed) return temp;
            var other = DriveInfo.GetDrives()
                .Where(d => d.IsReady && d.DriveType == DriveType.Fixed)
                .OrderByDescending(d => d.AvailableFreeSpace)
                .FirstOrDefault();
            if (other is not null) return Path.Combine(other.RootDirectory.FullName, "plajah-8bf-temp");
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException) { }
        return temp;
    }

    private static RunFiles FilesFor(string runId, long needed)
    {
        if (runId.Length is 0 or > 64 || !runId.All(c => char.IsLetterOrDigit(c) || c == '-'))
            throw new ArgumentException("Bad run id");
        return Runs.GetOrAdd(runId, id =>
        {
            var folder = Path.Combine(BaseFolder(needed), id);
            Directory.CreateDirectory(folder);
            return new RunFiles { Folder = folder };
        });
    }

    public static async Task UploadAsync(string runId, long offset, byte[] data)
    {
        var files = FilesFor(runId, offset == 0 ? data.Length * 64L : data.Length);
        await using var stream = new FileStream(files.Input, FileMode.OpenOrCreate, FileAccess.Write);
        stream.Seek(offset, SeekOrigin.Begin);
        await stream.WriteAsync(data);
    }

    public static async Task<WindowsPhotoshopPluginRun> RunAsync(string runId, string pluginId, int width, int height, string? parameters, bool showUi)
    {
        if (!Known.ContainsKey(pluginId)) await ScanAsync();
        if (!Known.TryGetValue(pluginId, out var plugin))
            return WindowsPhotoshopPluginRun.Fail(runId, "That plug-in is no longer in a scanned folder.");
        var host = FindHost();
        if (host is null)
            return WindowsPhotoshopPluginRun.Fail(runId, "The Photoshop plug-in host is not installed with this build of Plajah.");
        if (!Runs.TryGetValue(runId, out var files) || !File.Exists(files.Input))
            return WindowsPhotoshopPluginRun.Fail(runId, "The image did not reach the plug-in host.");

        using var process = StartHost(host);
        files.Process = process;
        // A filter's dialog waits on the user. Without one, a stuck filter is ended by this timer.
        using var timeout = showUi ? new CancellationTokenSource() : new CancellationTokenSource(HeadlessTimeoutMs);
        try
        {
            await process.StandardInput.WriteLineAsync(Line(new
            {
                type = "run",
                path = plugin.Path,
                entry = plugin.Entry,
                input = files.Input,
                width,
                height,
                output = files.Output,
                parameters,
                show_ui = showUi,
            }));
            await process.StandardInput.FlushAsync();

            using var reply = await ReadReplyAsync(process, timeout.Token);
            if (reply is null)
            {
                // A crash the sidecar could not even report, or Abort killing it.
                return WindowsPhotoshopPluginRun.Crash(runId, $"{plugin.Name} stopped unexpectedly. Your image was not changed.", null);
            }
            var root = reply.RootElement;
            switch (root.GetProperty("type").GetString())
            {
                case "result":
                    return new WindowsPhotoshopPluginRun(runId, true, false, false, null, width, height,
                        new FileInfo(files.Output).Length,
                        root.TryGetProperty("parameters", out var p) ? p.GetString() : null, null);
                case "cancelled":
                    return new WindowsPhotoshopPluginRun(runId, false, true, false, null, 0, 0, 0, null, null);
                case "crash":
                    return WindowsPhotoshopPluginRun.Crash(runId, $"{plugin.Name} crashed. Your image was not changed.", root.GetRawText());
                default:
                    return WindowsPhotoshopPluginRun.Fail(runId,
                        root.TryGetProperty("message", out var m) ? m.GetString() ?? "The filter failed." : "The filter failed.",
                        root.TryGetProperty("diagnostics", out var d) ? d.GetRawText() : null);
            }
        }
        catch (OperationCanceledException)
        {
            return WindowsPhotoshopPluginRun.Fail(runId, $"{plugin.Name} did not finish within {HeadlessTimeoutMs / 60000} minutes and was stopped.");
        }
        catch (IOException ex)
        {
            return WindowsPhotoshopPluginRun.Crash(runId, $"{plugin.Name} stopped unexpectedly: {ex.Message}", null);
        }
        finally
        {
            files.Process = null;
            Kill(process);
        }
    }

    public static async Task<string> AbortAsync(string runId)
    {
        if (!Runs.TryGetValue(runId, out var files) || files.Process is not { } process) return "idle";
        try
        {
            await process.StandardInput.WriteLineAsync(Line(new { type = "abort" }));
            await process.StandardInput.FlushAsync();
        }
        catch (Exception ex) when (ex is IOException or InvalidOperationException or ObjectDisposedException) { }
        // Filters that ignore abort are ended after a short grace period.
        _ = Task.Delay(5000).ContinueWith(_ => { if (ReferenceEquals(files.Process, process)) Kill(process); }, TaskScheduler.Default);
        return "aborting";
    }

    public static async Task<byte[]> DownloadAsync(string runId, long offset, int length)
    {
        if (!Runs.TryGetValue(runId, out var files)) throw new InvalidOperationException("Unknown run");
        await using var stream = new FileStream(files.Output, FileMode.Open, FileAccess.Read, FileShare.Read);
        stream.Seek(offset, SeekOrigin.Begin);
        var buffer = new byte[Math.Clamp(length, 0, 16 * 1024 * 1024)];
        var read = await stream.ReadAtLeastAsync(buffer, buffer.Length, throwOnEndOfStream: false);
        return buffer[..read];
    }

    public static void Release(string runId)
    {
        if (!Runs.TryRemove(runId, out var files)) return;
        if (files.Process is { } process) Kill(process);
        try { Directory.Delete(files.Folder, recursive: true); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
    }

    // ── Web bridge ───────────────────────────────────────────────────────────

    /// <summary>One entry point for every PS_PLUGIN_* message. Each reply echoes runId/seq.</summary>
    public static async Task HandleMessageAsync(string type, JsonElement root, Action<string, object> post, Func<Task<string?>> pickFolder)
    {
        static string Text(JsonElement e, string name) =>
            e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? string.Empty : string.Empty;
        var runId = Text(root, "runId");
        try
        {
            switch (type)
            {
                case "PS_PLUGIN_STATUS":
                    post("PS_PLUGIN_STATUS_RESULT", new { available = FindHost() is not null });
                    break;
                case "PS_PLUGIN_SCAN":
                    post("PS_PLUGIN_SCAN_RESULT", await ScanAsync());
                    break;
                case "PS_PLUGIN_LIST_DIRECTORIES":
                    post("PS_PLUGIN_DIRECTORIES", new { directories = GetDirectories() });
                    break;
                case "PS_PLUGIN_ADD_DIRECTORY":
                    var picked = await pickFolder();
                    if (picked is not null) AddDirectory(picked);
                    post("PS_PLUGIN_DIRECTORIES", new { directories = GetDirectories(), cancelled = picked is null });
                    break;
                case "PS_PLUGIN_REMOVE_DIRECTORY":
                    post("PS_PLUGIN_DIRECTORIES", new { directories = RemoveDirectory(Text(root, "path")) });
                    break;
                case "PS_PLUGIN_UPLOAD":
                    await UploadAsync(runId, root.GetProperty("offset").GetInt64(), Convert.FromBase64String(Text(root, "data")));
                    post("PS_PLUGIN_UPLOAD_RESULT", new { runId, offset = root.GetProperty("offset").GetInt64(), success = true });
                    break;
                case "PS_PLUGIN_RUN":
                    var parameters = root.TryGetProperty("parameters", out var ps) && ps.ValueKind == JsonValueKind.String ? ps.GetString() : null;
                    var showUi = root.TryGetProperty("showUi", out var ui) && ui.ValueKind == JsonValueKind.True;
                    post("PS_PLUGIN_RUN_RESULT", await RunAsync(runId, Text(root, "pluginId"), root.GetProperty("width").GetInt32(), root.GetProperty("height").GetInt32(), parameters, showUi));
                    break;
                case "PS_PLUGIN_ABORT":
                    post("PS_PLUGIN_ABORT_RESULT", new { runId, state = await AbortAsync(runId) });
                    break;
                case "PS_PLUGIN_DOWNLOAD":
                    var offset = root.GetProperty("offset").GetInt64();
                    var bytes = await DownloadAsync(runId, offset, root.GetProperty("length").GetInt32());
                    post("PS_PLUGIN_DOWNLOAD_RESULT", new { runId, offset, success = true, data = Convert.ToBase64String(bytes) });
                    break;
                case "PS_PLUGIN_RELEASE":
                    Release(runId);
                    post("PS_PLUGIN_RELEASE_RESULT", new { runId, success = true });
                    break;
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or FormatException or ArgumentException or InvalidOperationException or KeyNotFoundException or JsonException or System.ComponentModel.Win32Exception)
        {
            // Folder requests all answer on one message type, and the web side waits on it.
            if (type.EndsWith("_DIRECTORY", StringComparison.Ordinal) || type.EndsWith("_DIRECTORIES", StringComparison.Ordinal))
            {
                post("PS_PLUGIN_DIRECTORIES", new { directories = Array.Empty<string>(), error = ex.Message });
                return;
            }
            post(type + "_RESULT", new
            {
                runId,
                offset = root.TryGetProperty("offset", out var o) && o.ValueKind == JsonValueKind.Number ? o.GetInt64() : 0,
                success = false,
                error = ex.Message,
            });
        }
    }

    private sealed class ScanReply
    {
        public List<ScanPlugin>? Plugins { get; set; }
        public WindowsPhotoshopPluginSkipped[]? Skipped { get; set; }
    }

    private sealed class ScanPlugin
    {
        public string Name { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;
        public string Entry { get; set; } = string.Empty;
        public string Path { get; set; } = string.Empty;
    }
}

public sealed record WindowsPhotoshopPlugin(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("category")] string Category,
    [property: JsonPropertyName("entry")] string Entry,
    [property: JsonPropertyName("path")] string Path);

public sealed record WindowsPhotoshopPluginSkipped(
    [property: JsonPropertyName("path")] string Path,
    [property: JsonPropertyName("reason")] string Reason);

public sealed record WindowsPhotoshopPluginScan(
    [property: JsonPropertyName("success")] bool Success,
    [property: JsonPropertyName("plugins")] IReadOnlyList<WindowsPhotoshopPlugin> Plugins,
    [property: JsonPropertyName("skipped")] IReadOnlyList<WindowsPhotoshopPluginSkipped> Skipped,
    [property: JsonPropertyName("error")] string? Error);

public sealed record WindowsPhotoshopPluginRun(
    [property: JsonPropertyName("runId")] string RunId,
    [property: JsonPropertyName("success")] bool Success,
    [property: JsonPropertyName("cancelled")] bool Cancelled,
    [property: JsonPropertyName("crashed")] bool Crashed,
    [property: JsonPropertyName("error")] string? Error,
    [property: JsonPropertyName("width")] int Width,
    [property: JsonPropertyName("height")] int Height,
    [property: JsonPropertyName("byteLength")] long ByteLength,
    [property: JsonPropertyName("parameters")] string? Parameters,
    [property: JsonPropertyName("detail")] string? Detail)
{
    public static WindowsPhotoshopPluginRun Fail(string runId, string error, string? detail = null) =>
        new(runId, false, false, false, error, 0, 0, 0, null, detail);
    public static WindowsPhotoshopPluginRun Crash(string runId, string error, string? detail) =>
        new(runId, false, false, true, error, 0, 0, 0, null, detail);
}
