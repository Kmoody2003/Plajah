using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Plajah.WinUI;

/// <summary>
/// Native Desktop Sync Engine: persists local ↔ Cloud Drive sync pairs and baselines under
/// %LOCALAPPDATA%\Plajah\, monitors folders via debounced FileSystemWatcher, and scans subtrees
/// cleanly on efficiency cores for sync reconciliation.
/// </summary>
internal sealed class WindowsSyncEngine : IDisposable
{
    private readonly string _rootDir;
    private readonly string _pairsFile;
    private readonly string _baselinesDir;
    private readonly Action<string, object> _emitToWeb;
    private readonly ConcurrentDictionary<string, FileSystemWatcher> _watchers = new();
    private readonly ConcurrentDictionary<string, long> _lastDebounce = new();
    private readonly object _ioLock = new();

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
    };

    public WindowsSyncEngine(Action<string, object> emitToWeb)
    {
        _emitToWeb = emitToWeb;
        _rootDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Plajah");
        _pairsFile = Path.Combine(_rootDir, "sync-pairs.json");
        _baselinesDir = Path.Combine(_rootDir, "sync-baselines");
        Directory.CreateDirectory(_rootDir);
        Directory.CreateDirectory(_baselinesDir);
        RestartWatchers(LoadPairs());
    }

    public List<JsonElement> LoadPairs()
    {
        lock (_ioLock)
        {
            try
            {
                if (!File.Exists(_pairsFile)) return new List<JsonElement>();
                var json = File.ReadAllText(_pairsFile);
                return JsonSerializer.Deserialize<List<JsonElement>>(json) ?? new List<JsonElement>();
            }
            catch
            {
                return new List<JsonElement>();
            }
        }
    }

    public List<JsonElement> SavePair(JsonElement pair)
    {
        var id = pair.TryGetProperty("id", out var idEl) ? idEl.GetString() ?? "" : "";
        if (string.IsNullOrWhiteSpace(id)) return LoadPairs();

        lock (_ioLock)
        {
            var list = LoadPairs();
            var idx = list.FindIndex(p => p.TryGetProperty("id", out var x) && x.GetString() == id);
            if (idx >= 0) list[idx] = pair;
            else list.Add(pair);

            File.WriteAllText(_pairsFile, JsonSerializer.Serialize(list, JsonOpts));
            RestartWatchers(list);
            return list;
        }
    }

    public List<JsonElement> RemovePair(string pairId)
    {
        lock (_ioLock)
        {
            var list = LoadPairs()
                .Where(p => !(p.TryGetProperty("id", out var x) && x.GetString() == pairId))
                .ToList();
            File.WriteAllText(_pairsFile, JsonSerializer.Serialize(list, JsonOpts));
            var basePath = Path.Combine(_baselinesDir, $"{SanitizeId(pairId)}.json");
            if (File.Exists(basePath))
            {
                try { File.Delete(basePath); } catch { }
            }
            RestartWatchers(list);
            return list;
        }
    }

    public JsonElement? LoadBaseline(string pairId)
    {
        var path = Path.Combine(_baselinesDir, $"{SanitizeId(pairId)}.json");
        if (!File.Exists(path)) return null;
        try
        {
            return JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(path));
        }
        catch
        {
            return null;
        }
    }

    public void SaveBaseline(string pairId, JsonElement baseline, string? status, long? lastSyncAt, string? lastError)
    {
        var path = Path.Combine(_baselinesDir, $"{SanitizeId(pairId)}.json");
        lock (_ioLock)
        {
            File.WriteAllText(path, baseline.GetRawText());
            if (!string.IsNullOrEmpty(status) || lastSyncAt.HasValue)
            {
                var pairs = LoadPairs();
                var updated = new List<object>();
                foreach (var p in pairs)
                {
                    var dict = JsonSerializer.Deserialize<Dictionary<string, object?>>(p.GetRawText()) ?? new();
                    if (dict.TryGetValue("id", out var idObj) && string.Equals(idObj?.ToString(), pairId, StringComparison.Ordinal))
                    {
                        if (!string.IsNullOrEmpty(status)) dict["status"] = status;
                        if (lastSyncAt.HasValue) dict["lastSyncAt"] = lastSyncAt.Value;
                        dict["lastError"] = lastError;
                    }
                    updated.Add(dict);
                }
                File.WriteAllText(_pairsFile, JsonSerializer.Serialize(updated, JsonOpts));
            }
        }
    }

    public async Task<object> ScanLocalFolderAsync(string localPath)
    {
        return await Task.Run<object>(() =>
        {
            using var eco = PowerQos.EcoThread();
            try
            {
                if (!Directory.Exists(localPath))
                {
                    return new { success = false, error = $"Sync folder missing: {localPath}" };
                }
                var entries = new List<object>();
                var opts = new EnumerationOptions
                {
                    IgnoreInaccessible = true,
                    RecurseSubdirectories = true,
                    AttributesToSkip = FileAttributes.ReparsePoint | FileAttributes.Hidden | FileAttributes.System,
                };
                foreach (var fsi in new DirectoryInfo(localPath).EnumerateFileSystemInfos("*", opts))
                {
                    if (entries.Count >= 25_000) break;
                    var rel = Path.GetRelativePath(localPath, fsi.FullName).Replace('\\', '/');
                    entries.Add(new
                    {
                        relPath = rel,
                        isDirectory = fsi is DirectoryInfo,
                        size = fsi is FileInfo fi ? fi.Length : 0L,
                        mtimeMs = new DateTimeOffset(fsi.LastWriteTimeUtc).ToUnixTimeMilliseconds(),
                    });
                }
                return new { success = true, entries };
            }
            catch (Exception ex)
            {
                return new { success = false, error = ex.Message };
            }
        });
    }

    private void RestartWatchers(List<JsonElement> pairs)
    {
        foreach (var w in _watchers.Values)
        {
            try { w.EnableRaisingEvents = false; w.Dispose(); } catch { }
        }
        _watchers.Clear();

        foreach (var p in pairs)
        {
            var enabled = !p.TryGetProperty("enabled", out var en) || en.ValueKind != JsonValueKind.False;
            if (!enabled) continue;
            var id = p.TryGetProperty("id", out var idEl) ? idEl.GetString() ?? "" : "";
            var path = p.TryGetProperty("localPath", out var lpEl) ? lpEl.GetString() ?? "" : "";
            if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(path) || !Directory.Exists(path)) continue;

            try
            {
                var fsw = new FileSystemWatcher(path)
                {
                    IncludeSubdirectories = true,
                    NotifyFilter = NotifyFilters.FileName | NotifyFilters.DirectoryName | NotifyFilters.LastWrite | NotifyFilters.Size,
                };
                fsw.Changed += (_, e) => NotifyDebounced(id, e.FullPath, "changed");
                fsw.Created += (_, e) => NotifyDebounced(id, e.FullPath, "created");
                fsw.Deleted += (_, e) => NotifyDebounced(id, e.FullPath, "deleted");
                fsw.Renamed += (_, e) => NotifyDebounced(id, e.FullPath, "renamed");
                fsw.EnableRaisingEvents = true;
                _watchers[id] = fsw;
            }
            catch { /* folder watch unsupported on some virtual mounts */ }
        }
    }

    private void NotifyDebounced(string pairId, string fullPath, string changeKind)
    {
        var name = Path.GetFileName(fullPath);
        if (name.StartsWith("~$", StringComparison.Ordinal) || name.EndsWith(".tmp", StringComparison.OrdinalIgnoreCase) || name.EndsWith(".crdownload", StringComparison.OrdinalIgnoreCase))
            return;

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var key = $"{pairId}:{fullPath}";
        var prev = _lastDebounce.GetOrAdd(key, 0L);
        if (now - prev < 850) return;
        _lastDebounce[key] = now;

        _emitToWeb("SYNC_LOCAL_CHANGES", new
        {
            pairId,
            localPath = fullPath,
            changeKind,
            timestamp = now,
        });
    }

    private static string SanitizeId(string id)
    {
        return string.Concat(id.Select(c => char.IsLetterOrDigit(c) || c == '_' || c == '-' ? c : '_'));
    }

    public void Dispose()
    {
        foreach (var w in _watchers.Values)
        {
            try { w.Dispose(); } catch { }
        }
        _watchers.Clear();
    }
}
