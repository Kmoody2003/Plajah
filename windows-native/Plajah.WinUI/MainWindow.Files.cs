using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Tasks;

namespace Plajah.WinUI;

public sealed partial class MainWindow
{
    private void PostBridgeResult(string responseType, string? requestId, object payload)
    {
        var node = JsonSerializer.SerializeToNode(payload) as JsonObject ?? new JsonObject();
        if (!string.IsNullOrEmpty(requestId))
        {
            node["requestId"] = requestId;
        }
        if (DispatcherQueue.HasThreadAccess)
        {
            PostNativeMessage(responseType, node);
        }
        else
        {
            DispatcherQueue.TryEnqueue(() => PostNativeMessage(responseType, node));
        }
    }

    private static string GetStr(JsonElement el, string prop, string fallback = "") =>
        el.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? fallback : fallback;

    private static bool GetBool(JsonElement el, string prop, bool fallback = false) =>
        el.TryGetProperty(prop, out var v) && (v.ValueKind == JsonValueKind.True || v.ValueKind == JsonValueKind.False)
            ? v.GetBoolean()
            : fallback;

    private static int GetInt(JsonElement el, string prop, int fallback = 0) =>
        el.TryGetProperty(prop, out var v) && v.TryGetInt32(out var n) ? n : fallback;

    private static string[] GetStrArray(JsonElement el, string prop)
    {
        if (!el.TryGetProperty(prop, out var arr) || arr.ValueKind != JsonValueKind.Array) return Array.Empty<string>();
        var list = new List<string>();
        foreach (var item in arr.EnumerateArray())
        {
            var s = item.GetString();
            if (!string.IsNullOrEmpty(s)) list.Add(s);
        }
        return list.ToArray();
    }

    private static Dictionary<string, string>? GetHeadersMap(JsonElement el, string prop)
    {
        if (!el.TryGetProperty(prop, out var obj) || obj.ValueKind != JsonValueKind.Object) return null;
        var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var p in obj.EnumerateObject())
        {
            if (p.Value.ValueKind == JsonValueKind.String)
            {
                dict[p.Name] = p.Value.GetString() ?? string.Empty;
            }
        }
        return dict.Count > 0 ? dict : null;
    }

    private async Task<bool> HandleUnifiedFileBridgeAsync(string type, JsonElement root)
    {
        var reqId = GetStr(root, "requestId");
        var responseType = $"{type}_RESULT";

        try
        {
            switch (type)
            {
                case "FILES_GET_ROOTS":
                    _ = SyncEngine; // Warm up FileSystemWatcher listeners for configured sync pairs on Explorer open
                    PostBridgeResult(responseType, reqId, new { success = true, roots = _fileExplorer.GetStorageRoots() });
                    return true;

                case "FILES_LIST_DIR":
                {
                    var path = GetStr(root, "path");
                    var includeHidden = GetBool(root, "includeHidden");
                    var recursive = GetBool(root, "recursive");
                    var query = GetStr(root, "query");
                    var limit = Math.Clamp(GetInt(root, "limit", 2000), 1, 20000);
                    var res = await _fileExplorer.ListDirectoryAsync(path, includeHidden, recursive, query, limit);
                    PostBridgeResult(responseType, reqId, res);
                    return true;
                }

                case "FILES_CREATE_FOLDER":
                {
                    var parentPath = GetStr(root, "parentPath");
                    var name = GetStr(root, "name");
                    PostBridgeResult(responseType, reqId, _fileExplorer.CreateFolder(parentPath, name));
                    return true;
                }

                case "FILES_RENAME":
                {
                    var path = GetStr(root, "path");
                    var newName = GetStr(root, "newName");
                    PostBridgeResult(responseType, reqId, _fileExplorer.Rename(path, newName));
                    return true;
                }

                case "FILES_COPY":
                {
                    var paths = GetStrArray(root, "paths");
                    var targetDir = GetStr(root, "targetDir");
                    var res = await _fileExplorer.CopyEntriesAsync(paths, targetDir);
                    PostBridgeResult(responseType, reqId, res);
                    return true;
                }

                case "FILES_MOVE":
                {
                    var paths = GetStrArray(root, "paths");
                    var targetDir = GetStr(root, "targetDir");
                    var res = await _fileExplorer.MoveEntriesAsync(paths, targetDir);
                    PostBridgeResult(responseType, reqId, res);
                    return true;
                }

                case "FILES_DELETE_BATCH":
                {
                    var paths = GetStrArray(root, "paths");
                    var recycle = GetBool(root, "recycle", true);
                    var res = await _fileExplorer.DeleteEntriesAsync(paths, recycle);
                    PostBridgeResult(responseType, reqId, res);
                    return true;
                }

                case "FILES_ZIP":
                {
                    var paths = GetStrArray(root, "paths");
                    var targetZipPath = GetStr(root, "targetZipPath");
                    var res = await _fileExplorer.ZipEntriesAsync(paths, targetZipPath);
                    PostBridgeResult(responseType, reqId, res);
                    return true;
                }

                case "FILES_UNZIP":
                {
                    var zipPath = GetStr(root, "zipPath");
                    var targetDir = GetStr(root, "targetDir");
                    var res = await _fileExplorer.UnzipArchiveAsync(zipPath, targetDir);
                    PostBridgeResult(responseType, reqId, res);
                    return true;
                }

                case "FILES_LIST_ZIP":
                {
                    var path = GetStr(root, "path");
                    var res = await _fileExplorer.ListZipContentsAsync(path);
                    PostBridgeResult(responseType, reqId, res);
                    return true;
                }

                case "FILES_OPEN_EXTERNAL":
                {
                    var path = GetStr(root, "path");
                    PostBridgeResult(responseType, reqId, _fileExplorer.OpenExternal(path));
                    return true;
                }

                case "FILES_READ_TEXT":
                {
                    var path = GetStr(root, "path");
                    var maxBytes = Math.Clamp(GetInt(root, "maxBytes", 262_144), 1024, 4 * 1024 * 1024);
                    var res = await _fileExplorer.ReadTextPreviewAsync(path, maxBytes);
                    PostBridgeResult(responseType, reqId, res);
                    return true;
                }

                case "FILES_DOWNLOAD_TO_LOCAL":
                {
                    var url = GetStr(root, "url");
                    var targetPath = GetStr(root, "targetPath");
                    var headers = GetHeadersMap(root, "headers");
                    var res = await _fileExplorer.DownloadUrlToLocalAsync(url, targetPath, headers);
                    PostBridgeResult(responseType, reqId, res);
                    return true;
                }

                case "FILES_UPLOAD_SIGNED":
                {
                    var localPath = GetStr(root, "localPath");
                    var url = GetStr(root, "url");
                    var headers = GetHeadersMap(root, "headers");
                    var res = await _fileExplorer.UploadSignedAsync(localPath, url, headers);
                    PostBridgeResult(responseType, reqId, res);
                    return true;
                }

                case "FILES_READ_FILEZILLA_DEFAULT":
                    PostBridgeResult(responseType, reqId, _connectors.ReadDefaultFileZillaXml());
                    return true;

                case "CONNECTOR_SAVE_SECRET":
                {
                    var id = GetStr(root, "id");
                    var user = GetStr(root, "user");
                    var secret = GetStr(root, "secret");
                    _connectors.SaveSecret(id, user, secret);
                    PostBridgeResult(responseType, reqId, new { success = true });
                    return true;
                }

                case "CONNECTOR_GET_SECRET":
                {
                    var id = GetStr(root, "id");
                    PostBridgeResult(responseType, reqId, new { success = true, secret = _connectors.GetSecret(id) });
                    return true;
                }

                case "CONNECTOR_DELETE_SECRET":
                {
                    var id = GetStr(root, "id");
                    _connectors.DeleteSecret(id);
                    PostBridgeResult(responseType, reqId, new { success = true });
                    return true;
                }

                case "CONNECTOR_OP":
                {
                    if (!root.TryGetProperty("location", out var locationEl))
                    {
                        PostBridgeResult(responseType, reqId, new { success = false, error = "Missing location" });
                        return true;
                    }
                    var locationCopy = locationEl.Clone();
                    var op = GetStr(root, "op", "list");
                    var remotePath = GetStr(root, "remotePath", "/");
                    var newName = root.TryGetProperty("newName", out var nn) ? nn.GetString() : null;
                    var localPath = root.TryGetProperty("localPath", out var lp) ? lp.GetString() : null;
                    var secretOverride = root.TryGetProperty("secret", out var sec) ? sec.GetString() : null;
                    var res = await _connectors.InvokeOpAsync(locationCopy, op, remotePath, newName, localPath, secretOverride);
                    PostBridgeResult(responseType, reqId, res);
                    return true;
                }

                case "SYNC_GET_STATE":
                    PostBridgeResult(responseType, reqId, new { success = true, pairs = SyncEngine.LoadPairs(), recentChanges = Array.Empty<object>() });
                    return true;

                case "SYNC_SAVE_PAIR":
                {
                    if (!root.TryGetProperty("pair", out var pairEl))
                    {
                        PostBridgeResult(responseType, reqId, new { success = false, error = "Missing pair" });
                        return true;
                    }
                    var pairs = SyncEngine.SavePair(pairEl.Clone());
                    PostBridgeResult(responseType, reqId, new { success = true, pairs });
                    return true;
                }

                case "SYNC_REMOVE_PAIR":
                {
                    var pairId = GetStr(root, "pairId");
                    var pairs = SyncEngine.RemovePair(pairId);
                    PostBridgeResult(responseType, reqId, new { success = true, pairs });
                    return true;
                }

                case "SYNC_SCAN_LOCAL":
                {
                    var localPath = GetStr(root, "localPath");
                    var res = await SyncEngine.ScanLocalFolderAsync(localPath);
                    PostBridgeResult(responseType, reqId, res);
                    return true;
                }

                case "SYNC_GET_BASELINE":
                {
                    var pairId = GetStr(root, "pairId");
                    var baseline = SyncEngine.LoadBaseline(pairId);
                    PostBridgeResult(responseType, reqId, new { success = true, baseline });
                    return true;
                }

                case "SYNC_SAVE_BASELINE":
                {
                    var pairId = GetStr(root, "pairId");
                    var baseline = root.TryGetProperty("baseline", out var blEl)
                        ? blEl.Clone()
                        : JsonDocument.Parse("{}").RootElement.Clone();
                    var status = root.TryGetProperty("status", out var st) ? st.GetString() : null;
                    long? lastSyncAt = root.TryGetProperty("lastSyncAt", out var ls) && ls.TryGetInt64(out var lsv) ? lsv : null;
                    var lastError = root.TryGetProperty("lastError", out var le) ? le.GetString() : null;
                    SyncEngine.SaveBaseline(pairId, baseline, status, lastSyncAt, lastError);
                    PostBridgeResult(responseType, reqId, new { success = true });
                    return true;
                }
            }
        }
        catch (Exception ex)
        {
            PostBridgeResult(responseType, reqId, new { success = false, error = ex.Message });
            return true;
        }

        return false;
    }
}
