using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace Plajah.WinUI;

/// <summary>
/// Full native Windows File Explorer engine for Plajah's unified Files & Content HQ workspace.
/// Supports local drives, KnownFolders, recycle-bin delete, cross-volume move, Zip/Unzip,
/// text/doc previews, MIME mapping for localmedia.plajah, and streaming Cloud transfers.
/// </summary>
internal sealed class WindowsFileExplorerService
{
    private static readonly HttpClient SharedHttp = new() { Timeout = TimeSpan.FromMinutes(15) };

    public static string GetMimeType(string ext)
    {
        return (ext ?? string.Empty).ToLowerInvariant() switch
        {
            ".mp4" => "video/mp4",
            ".m4v" => "video/mp4",
            ".mov" => "video/quicktime",
            ".webm" => "video/webm",
            ".mkv" => "video/x-matroska",
            ".avi" => "video/x-msvideo",
            ".wmv" => "video/x-ms-wmv",
            ".mpg" or ".mpeg" => "video/mpeg",
            ".mp3" => "audio/mpeg",
            ".wav" => "audio/wav",
            ".m4a" => "audio/mp4",
            ".aac" => "audio/aac",
            ".flac" => "audio/flac",
            ".ogg" => "audio/ogg",
            ".opus" => "audio/opus",
            ".wma" => "audio/x-ms-wma",
            ".aiff" or ".aif" => "audio/aiff",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".gif" => "image/gif",
            ".webp" => "image/webp",
            ".svg" => "image/svg+xml",
            ".bmp" => "image/bmp",
            ".avif" => "image/avif",
            ".heic" or ".heif" => "image/heic",
            ".ico" => "image/x-icon",
            ".tif" or ".tiff" => "image/tiff",
            ".pdf" => "application/pdf",
            ".txt" or ".log" or ".md" or ".markdown" or ".ini" or ".env" or ".yaml" or ".yml" => "text/plain; charset=utf-8",
            ".json" => "application/json; charset=utf-8",
            ".csv" or ".tsv" => "text/csv; charset=utf-8",
            ".xml" => "application/xml; charset=utf-8",
            ".html" or ".htm" => "text/html; charset=utf-8",
            ".css" or ".scss" => "text/css; charset=utf-8",
            ".js" or ".mjs" or ".cjs" or ".ts" or ".tsx" or ".jsx" => "text/javascript; charset=utf-8",
            ".tela" or ".tdoc" or ".plajah" => "application/vnd.plajah.tela+json; charset=utf-8",
            ".cbz" => "application/vnd.comicbook+zip",
            ".cbr" => "application/vnd.comicbook-rar",
            ".comic" or ".pjc" or ".manga" => "application/vnd.plajah.comic+zip",
            ".lottie" => "application/vnd.lottie+json",
            ".zip" => "application/zip",
            _ => "application/octet-stream",
        };
    }

    public List<object> GetStorageRoots()
    {
        var roots = new List<object>();
        var userHome = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var downloads = Path.Combine(userHome, "Downloads");

        void AddKnown(string id, string label, string path)
        {
            if (string.IsNullOrWhiteSpace(path) || !Directory.Exists(path)) return;
            roots.Add(new
            {
                id,
                label,
                kind = "local",
                path,
                writable = true,
                badge = "Folder",
            });
        }

        AddKnown("win:downloads", "Downloads", downloads);
        AddKnown("win:desktop", "Desktop", Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory));
        AddKnown("win:documents", "Documents", Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments));
        AddKnown("win:pictures", "Pictures", Environment.GetFolderPath(Environment.SpecialFolder.MyPictures));
        AddKnown("win:music", "Music", Environment.GetFolderPath(Environment.SpecialFolder.MyMusic));
        AddKnown("win:videos", "Videos", Environment.GetFolderPath(Environment.SpecialFolder.MyVideos));
        AddKnown("win:home", "User Home", userHome);

        foreach (var d in DriveInfo.GetDrives())
        {
            try
            {
                if (!d.IsReady) continue;
                var vol = string.IsNullOrWhiteSpace(d.VolumeLabel) ? d.DriveType.ToString() : d.VolumeLabel;
                var letter = d.Name.TrimEnd('\\');
                roots.Add(new
                {
                    id = $"drive:{d.Name}",
                    label = $"{vol} ({letter})",
                    kind = "local",
                    path = d.Name,
                    totalBytes = d.TotalSize,
                    freeBytes = d.TotalFreeSpace,
                    writable = true,
                    badge = d.DriveType.ToString(),
                });
            }
            catch { /* drive not accessible */ }
        }
        return roots;
    }

    public async Task<object> ListDirectoryAsync(string path, bool includeHidden, bool recursive, string query, int limit)
    {
        return await Task.Run<object>(() =>
        {
            using var eco = PowerQos.EcoThread();
            try
            {
                var target = string.IsNullOrWhiteSpace(path)
                    ? Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)
                    : path;
                if (!Directory.Exists(target))
                {
                    return new { success = false, path = target, error = $"Directory does not exist: {target}" };
                }

                var dirInfo = new DirectoryInfo(target);
                var opts = new EnumerationOptions
                {
                    IgnoreInaccessible = true,
                    RecurseSubdirectories = recursive,
                    AttributesToSkip = includeHidden
                        ? FileAttributes.ReparsePoint
                        : FileAttributes.ReparsePoint | FileAttributes.Hidden | FileAttributes.System,
                };

                var entries = new List<object>();
                var hasQuery = !string.IsNullOrWhiteSpace(query);

                foreach (var fsi in dirInfo.EnumerateFileSystemInfos("*", opts))
                {
                    if (entries.Count >= limit) break;
                    if (hasQuery && fsi.Name.IndexOf(query, StringComparison.OrdinalIgnoreCase) < 0) continue;

                    var isDir = fsi is DirectoryInfo;
                    long size = 0;
                    bool readOnly = false;
                    if (fsi is FileInfo fi)
                    {
                        try { size = fi.Length; readOnly = fi.IsReadOnly; } catch { }
                    }
                    var ext = isDir ? string.Empty : fsi.Extension;
                    var encodedName = Uri.EscapeDataString(fsi.Name);
                    var encodedPath = Uri.EscapeDataString(fsi.FullName);

                    entries.Add(new
                    {
                        name = fsi.Name,
                        fullPath = fsi.FullName,
                        isDirectory = isDir,
                        size,
                        lastModified = new DateTimeOffset(fsi.LastWriteTimeUtc).ToUnixTimeMilliseconds(),
                        createdAt = new DateTimeOffset(fsi.CreationTimeUtc).ToUnixTimeMilliseconds(),
                        extension = ext,
                        isHidden = (fsi.Attributes & FileAttributes.Hidden) != 0,
                        isReadOnly = readOnly,
                        url = isDir ? null : $"https://localmedia.plajah/{encodedName}?path={encodedPath}",
                        thumbUrl = isDir ? null : $"https://localmedia.plajah/__thumb?path={encodedPath}&size=320",
                    });
                }

                return new { success = true, path = dirInfo.FullName, entries };
            }
            catch (Exception ex)
            {
                return new { success = false, path, error = ex.Message };
            }
        });
    }

    public object CreateFolder(string parentPath, string name)
    {
        try
        {
            var safe = Path.GetFileName(name?.Trim() ?? string.Empty);
            if (string.IsNullOrWhiteSpace(safe)) return new { success = false, error = "Invalid folder name" };
            var full = Path.Combine(parentPath, safe);
            Directory.CreateDirectory(full);
            return new { success = true, path = full };
        }
        catch (Exception ex) { return new { success = false, error = ex.Message }; }
    }

    public object Rename(string path, string newName)
    {
        try
        {
            var safe = Path.GetFileName(newName?.Trim() ?? string.Empty);
            if (string.IsNullOrWhiteSpace(safe)) return new { success = false, error = "Invalid name" };
            var parent = Path.GetDirectoryName(path) ?? string.Empty;
            var dest = Path.Combine(parent, safe);
            if (Directory.Exists(path)) Directory.Move(path, dest);
            else if (File.Exists(path)) File.Move(path, dest);
            else return new { success = false, error = "Item not found" };
            return new { success = true, newPath = dest };
        }
        catch (Exception ex) { return new { success = false, error = ex.Message }; }
    }

    public async Task<object> CopyEntriesAsync(string[] paths, string targetDir)
    {
        return await Task.Run<object>(() =>
        {
            try
            {
                Directory.CreateDirectory(targetDir);
                int count = 0;
                foreach (var src in paths)
                {
                    if (File.Exists(src))
                    {
                        var dest = UniqueDestPath(Path.Combine(targetDir, Path.GetFileName(src)));
                        File.Copy(src, dest, false);
                        count++;
                    }
                    else if (Directory.Exists(src))
                    {
                        var destDir = UniqueDestPath(Path.Combine(targetDir, new DirectoryInfo(src).Name));
                        CopyDirRecursive(src, destDir);
                        count++;
                    }
                }
                return new { success = true, copied = count };
            }
            catch (Exception ex) { return new { success = false, error = ex.Message }; }
        });
    }

    public async Task<object> MoveEntriesAsync(string[] paths, string targetDir)
    {
        return await Task.Run<object>(() =>
        {
            try
            {
                Directory.CreateDirectory(targetDir);
                int count = 0;
                foreach (var src in paths)
                {
                    var name = Path.GetFileName(src.TrimEnd('\\', '/'));
                    var dest = UniqueDestPath(Path.Combine(targetDir, name));
                    if (File.Exists(src))
                    {
                        try { File.Move(src, dest); }
                        catch (IOException)
                        {
                            File.Copy(src, dest, false);
                            File.Delete(src);
                        }
                        count++;
                    }
                    else if (Directory.Exists(src))
                    {
                        try { Directory.Move(src, dest); }
                        catch (IOException)
                        {
                            CopyDirRecursive(src, dest);
                            Directory.Delete(src, true);
                        }
                        count++;
                    }
                }
                return new { success = true, moved = count };
            }
            catch (Exception ex) { return new { success = false, error = ex.Message }; }
        });
    }

    public async Task<object> DeleteEntriesAsync(string[] paths, bool recycle)
    {
        return await Task.Run<object>(() =>
        {
            try
            {
                int count = 0;
                var rec = recycle
                    ? Microsoft.VisualBasic.FileIO.RecycleOption.SendToRecycleBin
                    : Microsoft.VisualBasic.FileIO.RecycleOption.DeletePermanently;

                foreach (var p in paths)
                {
                    if (File.Exists(p))
                    {
                        Microsoft.VisualBasic.FileIO.FileSystem.DeleteFile(p, Microsoft.VisualBasic.FileIO.UIOption.OnlyErrorDialogs, rec);
                        count++;
                    }
                    else if (Directory.Exists(p))
                    {
                        Microsoft.VisualBasic.FileIO.FileSystem.DeleteDirectory(p, Microsoft.VisualBasic.FileIO.UIOption.OnlyErrorDialogs, rec);
                        count++;
                    }
                }
                return new { success = true, deleted = count };
            }
            catch (Exception ex) { return new { success = false, error = ex.Message }; }
        });
    }

    public async Task<object> ZipEntriesAsync(string[] paths, string targetZipPath)
    {
        return await Task.Run<object>(() =>
        {
            try
            {
                var parent = Path.GetDirectoryName(targetZipPath);
                if (!string.IsNullOrEmpty(parent)) Directory.CreateDirectory(parent);
                if (File.Exists(targetZipPath)) File.Delete(targetZipPath);

                using var fs = new FileStream(targetZipPath, FileMode.Create);
                using var zip = new ZipArchive(fs, ZipArchiveMode.Create);
                foreach (var src in paths)
                {
                    if (File.Exists(src))
                    {
                        zip.CreateEntryFromFile(src, Path.GetFileName(src), CompressionLevel.Optimal);
                    }
                    else if (Directory.Exists(src))
                    {
                        var rootName = new DirectoryInfo(src).Name;
                        foreach (var f in Directory.EnumerateFiles(src, "*", SearchOption.AllDirectories))
                        {
                            var rel = Path.GetRelativePath(src, f).Replace('\\', '/');
                            zip.CreateEntryFromFile(f, $"{rootName}/{rel}", CompressionLevel.Optimal);
                        }
                    }
                }
                return new { success = true, zipPath = targetZipPath };
            }
            catch (Exception ex) { return new { success = false, error = ex.Message }; }
        });
    }

    public async Task<object> UnzipArchiveAsync(string zipPath, string targetDir)
    {
        return await Task.Run<object>(() =>
        {
            try
            {
                Directory.CreateDirectory(targetDir);
                var count = 0;
                using var zip = ZipFile.OpenRead(zipPath);
                var fullRoot = Path.GetFullPath(targetDir).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                foreach (var entry in zip.Entries)
                {
                    var destPath = Path.GetFullPath(Path.Combine(targetDir, entry.FullName));
                    // Guard against zip-slip traversal
                    if (!destPath.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase)) continue;
                    if (string.IsNullOrEmpty(entry.Name))
                    {
                        Directory.CreateDirectory(destPath);
                    }
                    else
                    {
                        var dir = Path.GetDirectoryName(destPath);
                        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
                        entry.ExtractToFile(destPath, overwrite: true);
                        count++;
                    }
                }
                return new { success = true, targetDir, count };
            }
            catch (Exception ex) { return new { success = false, error = ex.Message }; }
        });
    }

    public async Task<object> ListZipContentsAsync(string zipPath)
    {
        return await Task.Run<object>(() =>
        {
            try
            {
                using var zip = ZipFile.OpenRead(zipPath);
                var list = zip.Entries.Take(300).Select(e => new
                {
                    fullName = e.FullName,
                    size = e.Length,
                    compressedSize = e.CompressedLength,
                    lastModified = e.LastWriteTime.ToUnixTimeMilliseconds(),
                    isDirectory = string.IsNullOrEmpty(e.Name),
                }).ToList();
                return new { success = true, entries = list };
            }
            catch (Exception ex) { return new { success = false, error = ex.Message }; }
        });
    }

    public object OpenExternal(string path)
    {
        try
        {
            Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
            return new { success = true };
        }
        catch (Exception ex) { return new { success = false, error = ex.Message }; }
    }

    public async Task<object> ReadTextPreviewAsync(string path, int maxBytes)
    {
        return await Task.Run<object>(() =>
        {
            try
            {
                var fi = new FileInfo(path);
                if (!fi.Exists) return new { success = false, error = "File not found" };
                var toRead = (int)Math.Min(Math.Max(1024, maxBytes), fi.Length);
                var buf = new byte[toRead];
                using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                {
                    int read = 0;
                    while (read < toRead)
                    {
                        int n = fs.Read(buf, read, toRead - read);
                        if (n <= 0) break;
                        read += n;
                    }
                    toRead = read;
                }
                var text = Encoding.UTF8.GetString(buf, 0, toRead);
                return new { success = true, text, truncated = fi.Length > maxBytes, size = fi.Length };
            }
            catch (Exception ex) { return new { success = false, error = ex.Message }; }
        });
    }

    public async Task<object> DownloadUrlToLocalAsync(string url, string targetPath, Dictionary<string, string>? headers)
    {
        try
        {
            var dir = Path.GetDirectoryName(targetPath);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            using var req = new HttpRequestMessage(HttpMethod.Get, url);
            if (headers != null)
            {
                foreach (var kv in headers) req.Headers.TryAddWithoutValidation(kv.Key, kv.Value);
            }
            using var res = await SharedHttp.SendAsync(req, HttpCompletionOption.ResponseHeadersRead);
            res.EnsureSuccessStatusCode();
            await using var remoteStream = await res.Content.ReadAsStreamAsync();
            await using var fs = new FileStream(targetPath, FileMode.Create, FileAccess.Write, FileShare.None);
            await remoteStream.CopyToAsync(fs);
            var fi = new FileInfo(targetPath);
            return new { success = true, path = targetPath, size = fi.Exists ? fi.Length : 0L };
        }
        catch (Exception ex) { return new { success = false, error = ex.Message }; }
    }

    public async Task<object> UploadSignedAsync(string localPath, string url, Dictionary<string, string>? headers)
    {
        try
        {
            if (!File.Exists(localPath)) return new { success = false, error = "Local file not found" };
            var fi = new FileInfo(localPath);
            await using var fs = new FileStream(localPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            using var content = new StreamContent(fs);
            if (headers != null)
            {
                foreach (var kv in headers)
                {
                    if (kv.Key.Equals("Content-Type", StringComparison.OrdinalIgnoreCase))
                        content.Headers.ContentType = System.Net.Http.Headers.MediaTypeHeaderValue.Parse(kv.Value);
                    else if (!kv.Key.Equals("Content-Length", StringComparison.OrdinalIgnoreCase))
                        content.Headers.TryAddWithoutValidation(kv.Key, kv.Value);
                }
            }
            using var res = await SharedHttp.PutAsync(url, content);
            var etag = res.Headers.ETag?.Tag;
            return new { success = res.IsSuccessStatusCode, status = (int)res.StatusCode, etag, size = fi.Length };
        }
        catch (Exception ex) { return new { success = false, error = ex.Message }; }
    }

    private static string UniqueDestPath(string dest)
    {
        if (!File.Exists(dest) && !Directory.Exists(dest)) return dest;
        var dir = Path.GetDirectoryName(dest) ?? string.Empty;
        var name = Path.GetFileNameWithoutExtension(dest);
        var ext = Path.GetExtension(dest);
        for (int i = 1; i < 9999; i++)
        {
            var candidate = Path.Combine(dir, $"{name} ({i}){ext}");
            if (!File.Exists(candidate) && !Directory.Exists(candidate)) return candidate;
        }
        return Path.Combine(dir, $"{name}_{Guid.NewGuid():N}{ext}");
    }

    private static void CopyDirRecursive(string srcDir, string destDir)
    {
        Directory.CreateDirectory(destDir);
        foreach (var file in Directory.GetFiles(srcDir))
        {
            File.Copy(file, Path.Combine(destDir, Path.GetFileName(file)), true);
        }
        foreach (var sub in Directory.GetDirectories(srcDir))
        {
            CopyDirRecursive(sub, Path.Combine(destDir, Path.GetFileName(sub)));
        }
    }
}
