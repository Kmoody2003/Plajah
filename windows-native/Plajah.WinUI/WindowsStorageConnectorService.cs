using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Xml.Linq;
using Windows.Security.Credentials;

namespace Plajah.WinUI;

/// <summary>
/// Connected Storage Bridge: FileZilla profile auto-import, Windows Credential Manager (PasswordVault),
/// SMB/UNC LAN shares, WebDAV (HTTP/HTTPS), FTP/FTPS/FTPES, and Windows OpenSSH SFTP batch ops.
/// Credentials stay native in PasswordVault and are never written to browser localStorage.
/// </summary>
internal sealed class WindowsStorageConnectorService
{
    private const string VaultResourcePrefix = "PlajahConnector:";
    private static readonly HttpClient DavClient = new() { Timeout = TimeSpan.FromSeconds(45) };

    public object ReadDefaultFileZillaXml()
    {
        try
        {
            var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            var fzDir = Path.Combine(appData, "FileZilla");
            var siteMgr = Path.Combine(fzDir, "sitemanager.xml");
            var recent = Path.Combine(fzDir, "recentservers.xml");
            var siteXml = File.Exists(siteMgr) ? File.ReadAllText(siteMgr, Encoding.UTF8) : null;
            var recentXml = File.Exists(recent) ? File.ReadAllText(recent, Encoding.UTF8) : null;
            var paths = new List<string>();
            if (siteXml != null) paths.Add(siteMgr);
            if (recentXml != null) paths.Add(recent);
            return new
            {
                found = siteXml != null || recentXml != null,
                siteManagerXml = siteXml,
                recentServersXml = recentXml,
                paths,
            };
        }
        catch
        {
            return new { found = false };
        }
    }

    public void SaveSecret(string id, string user, string secret)
    {
        if (string.IsNullOrWhiteSpace(id) || string.IsNullOrEmpty(secret)) return;
        DeleteSecret(id);
        var vault = new PasswordVault();
        vault.Add(new PasswordCredential($"{VaultResourcePrefix}{id}", string.IsNullOrWhiteSpace(user) ? "anonymous" : user, secret));
    }

    public string? GetSecret(string id)
    {
        if (string.IsNullOrWhiteSpace(id)) return null;
        try
        {
            var vault = new PasswordVault();
            var list = vault.FindAllByResource($"{VaultResourcePrefix}{id}");
            var first = list.FirstOrDefault();
            if (first == null) return null;
            first.RetrievePassword();
            return first.Password;
        }
        catch
        {
            return null;
        }
    }

    public void DeleteSecret(string id)
    {
        if (string.IsNullOrWhiteSpace(id)) return;
        try
        {
            var vault = new PasswordVault();
            foreach (var c in vault.FindAllByResource($"{VaultResourcePrefix}{id}").ToList())
            {
                vault.Remove(c);
            }
        }
        catch { /* none found */ }
    }

    public async Task<object> InvokeOpAsync(
        JsonElement location,
        string op,
        string remotePath,
        string? newName,
        string? localPath,
        string? secretOverride)
    {
        var id = location.TryGetProperty("id", out var idEl) ? idEl.GetString() ?? "" : "";
        var proto = (location.TryGetProperty("protocol", out var pEl) ? pEl.GetString() : "ftp")?.ToLowerInvariant() ?? "ftp";
        var host = location.TryGetProperty("host", out var hEl) ? hEl.GetString() ?? "" : "";
        var port = location.TryGetProperty("port", out var ptEl) && ptEl.TryGetInt32(out var pv) ? pv : 21;
        var user = location.TryGetProperty("user", out var uEl) ? uEl.GetString() ?? "" : "";
        var secret = !string.IsNullOrEmpty(secretOverride) ? secretOverride : GetSecret(id);

        if (string.IsNullOrWhiteSpace(host)) return new { success = false, error = "Host is required" };

        try
        {
            return proto switch
            {
                "smb" => await HandleSmbAsync(host, remotePath, op, newName, localPath),
                "webdav" or "webdavs" => await HandleWebDavAsync(proto == "webdavs", host, port, user, secret, remotePath, op, newName, localPath),
                "ftp" or "ftps" or "ftpes" => await HandleFtpAsync(proto != "ftp", host, port, user, secret, remotePath, op, newName, localPath),
                "sftp" => await HandleSftpAsync(host, port, user, remotePath, op),
                _ => new { success = false, error = $"Protocol '{proto}' is not supported natively yet." },
            };
        }
        catch (Exception ex)
        {
            return new { success = false, error = ex.Message };
        }
    }

    private static Task<object> HandleSmbAsync(string host, string remotePath, string op, string? newName, string? localPath)
    {
        return Task.Run<object>(() =>
        {
            var rel = (remotePath ?? string.Empty).Replace('/', '\\').TrimStart('\\');
            var unc = string.IsNullOrEmpty(rel) ? $@"\\{host}" : $@"\\{host}\{rel}";
            if (op == "list")
            {
                if (!Directory.Exists(unc)) return new { success = false, error = $"SMB path unreachable: {unc}" };
                var di = new DirectoryInfo(unc);
                var entries = di.EnumerateFileSystemInfos("*", new EnumerationOptions { IgnoreInaccessible = true })
                    .Take(1500)
                    .Select(fsi => new
                    {
                        name = fsi.Name,
                        fullPath = "/" + Path.GetRelativePath($@"\\{host}", fsi.FullName).Replace('\\', '/'),
                        isDirectory = fsi is DirectoryInfo,
                        size = fsi is FileInfo fi ? fi.Length : 0L,
                        lastModified = new DateTimeOffset(fsi.LastWriteTimeUtc).ToUnixTimeMilliseconds(),
                        extension = fsi is DirectoryInfo ? "" : fsi.Extension,
                    })
                    .ToList();
                return new { success = true, entries };
            }
            if (op == "mkdir")
            {
                Directory.CreateDirectory(unc);
                return new { success = true };
            }
            if (op == "rename" && !string.IsNullOrWhiteSpace(newName))
            {
                var dest = Path.Combine(Path.GetDirectoryName(unc) ?? unc, Path.GetFileName(newName));
                if (Directory.Exists(unc)) Directory.Move(unc, dest);
                else if (File.Exists(unc)) File.Move(unc, dest);
                return new { success = true };
            }
            if (op == "delete")
            {
                if (Directory.Exists(unc)) Directory.Delete(unc, true);
                else if (File.Exists(unc)) File.Delete(unc);
                return new { success = true };
            }
            if (op == "download_to_local" && !string.IsNullOrWhiteSpace(localPath))
            {
                var dir = Path.GetDirectoryName(localPath);
                if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
                File.Copy(unc, localPath, overwrite: true);
                return new { success = true, localPath };
            }
            if (op == "upload_from_local" && !string.IsNullOrWhiteSpace(localPath) && File.Exists(localPath))
            {
                var dir = Path.GetDirectoryName(unc);
                if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
                File.Copy(localPath, unc, overwrite: true);
                return new { success = true };
            }
            return new { success = false, error = $"Unsupported SMB op: {op}" };
        });
    }

    private static async Task<object> HandleWebDavAsync(
        bool https, string host, int port, string user, string? secret, string remotePath, string op, string? newName, string? localPath)
    {
        var scheme = https ? "https" : "http";
        var defaultPort = https ? 443 : 80;
        var baseUrl = port == defaultPort ? $"{scheme}://{host}" : $"{scheme}://{host}:{port}";
        var cleanPath = "/" + (remotePath ?? "/").TrimStart('/');
        var fullUrl = $"{baseUrl}{cleanPath}";

        if (op == "download_to_local" && !string.IsNullOrWhiteSpace(localPath))
        {
            using var dlReq = new HttpRequestMessage(HttpMethod.Get, fullUrl);
            if (!string.IsNullOrEmpty(user) || !string.IsNullOrEmpty(secret))
                dlReq.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes($"{user}:{secret ?? ""}")));
            using var dlRes = await DavClient.SendAsync(dlReq, HttpCompletionOption.ResponseHeadersRead);
            if (!dlRes.IsSuccessStatusCode) return new { success = false, error = $"WebDAV HTTP {(int)dlRes.StatusCode}" };
            var dir = Path.GetDirectoryName(localPath);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            await using var rs = await dlRes.Content.ReadAsStreamAsync();
            await using var fs = new FileStream(localPath, FileMode.Create, FileAccess.Write, FileShare.None);
            await rs.CopyToAsync(fs);
            return new { success = true, localPath };
        }
        if (op == "upload_from_local" && !string.IsNullOrWhiteSpace(localPath) && File.Exists(localPath))
        {
            await using var fs = new FileStream(localPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            using var upReq = new HttpRequestMessage(HttpMethod.Put, fullUrl) { Content = new StreamContent(fs) };
            if (!string.IsNullOrEmpty(user) || !string.IsNullOrEmpty(secret))
                upReq.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes($"{user}:{secret ?? ""}")));
            using var upRes = await DavClient.SendAsync(upReq);
            return upRes.IsSuccessStatusCode ? new { success = true } : new { success = false, error = $"WebDAV HTTP {(int)upRes.StatusCode}" };
        }

        using var req = new HttpRequestMessage(new HttpMethod(op switch
        {
            "list" => "PROPFIND",
            "mkdir" => "MKCOL",
            "delete" => "DELETE",
            "rename" => "MOVE",
            _ => "GET",
        }), fullUrl);

        if (!string.IsNullOrEmpty(user) || !string.IsNullOrEmpty(secret))
        {
            var token = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{user}:{secret ?? ""}"));
            req.Headers.Authorization = new AuthenticationHeaderValue("Basic", token);
        }

        if (op == "list")
        {
            req.Headers.Add("Depth", "1");
            req.Content = new StringContent("<?xml version=\"1.0\" encoding=\"utf-8\"?><D:propfind xmlns:D=\"DAV:\"><D:allprop/></D:propfind>", Encoding.UTF8, "application/xml");
            using var res = await DavClient.SendAsync(req);
            if (!res.IsSuccessStatusCode) return new { success = false, error = $"WebDAV HTTP {(int)res.StatusCode}" };
            var xml = await res.Content.ReadAsStringAsync();
            var doc = XDocument.Parse(xml);
            var entries = new List<object>();
            var reqNorm = cleanPath.TrimEnd('/') is { Length: > 0 } p ? p : "/";

            foreach (var r in doc.Descendants().Where(x => x.Name.LocalName == "response"))
            {
                var href = r.Elements().FirstOrDefault(x => x.Name.LocalName == "href")?.Value?.Trim();
                if (string.IsNullOrEmpty(href)) continue;
                var hrefPath = Uri.TryCreate(href, UriKind.Absolute, out var u) ? u.AbsolutePath : href;
                hrefPath = Uri.UnescapeDataString(hrefPath).TrimEnd('/');
                if (string.IsNullOrEmpty(hrefPath)) hrefPath = "/";
                if (hrefPath.Equals(reqNorm, StringComparison.OrdinalIgnoreCase)) continue;

                var isDir = r.Descendants().Any(x => x.Name.LocalName == "collection");
                var name = hrefPath.Split('/', StringSplitOptions.RemoveEmptyEntries).LastOrDefault() ?? hrefPath;
                var sizeStr = r.Descendants().FirstOrDefault(x => x.Name.LocalName == "getcontentlength")?.Value;
                var modStr = r.Descendants().FirstOrDefault(x => x.Name.LocalName == "getlastmodified")?.Value;
                long.TryParse(sizeStr, out var size);
                long modMs = DateTimeOffset.TryParse(modStr, out var dt) ? dt.ToUnixTimeMilliseconds() : 0L;

                entries.Add(new
                {
                    name,
                    fullPath = hrefPath,
                    isDirectory = isDir,
                    size,
                    lastModified = modMs,
                    extension = isDir ? "" : Path.GetExtension(name),
                    url = isDir ? null : $"{baseUrl}{hrefPath}",
                });
            }
            return new { success = true, entries };
        }

        if (op == "rename" && !string.IsNullOrWhiteSpace(newName))
        {
            var parent = cleanPath.Contains('/') ? cleanPath[..cleanPath.LastIndexOf('/')] : "";
            req.Headers.Add("Destination", $"{baseUrl}{parent}/{Uri.EscapeDataString(newName)}");
        }

        using var opRes = await DavClient.SendAsync(req);
        return opRes.IsSuccessStatusCode
            ? new { success = true }
            : new { success = false, error = $"WebDAV HTTP {(int)opRes.StatusCode}" };
    }

#pragma warning disable SYSLIB0014 // FtpWebRequest remains built-in with zero NuGet deps for lightweight LAN/FTP bridges
    private static async Task<object> HandleFtpAsync(
        bool useSsl, string host, int port, string user, string? secret, string remotePath, string op, string? newName, string? localPath)
    {
        return await Task.Run<object>(() =>
        {
            var clean = "/" + (remotePath ?? "/").TrimStart('/');
            var uri = $"ftp://{host}:{port}{clean}";
            var req = (FtpWebRequest)WebRequest.Create(uri);
            req.EnableSsl = useSsl;
            req.UsePassive = true;
            if (!string.IsNullOrEmpty(user))
            {
                req.Credentials = new NetworkCredential(user, secret ?? string.Empty);
            }

            if (op == "download_to_local" && !string.IsNullOrWhiteSpace(localPath))
            {
                req.Method = WebRequestMethods.Ftp.DownloadFile;
                using var dlRes = (FtpWebResponse)req.GetResponse();
                var dir = Path.GetDirectoryName(localPath);
                if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
                using var rs = dlRes.GetResponseStream() ?? Stream.Null;
                using var fs = new FileStream(localPath, FileMode.Create, FileAccess.Write, FileShare.None);
                rs.CopyTo(fs);
                return new { success = true, localPath };
            }
            if (op == "upload_from_local" && !string.IsNullOrWhiteSpace(localPath) && File.Exists(localPath))
            {
                req.Method = WebRequestMethods.Ftp.UploadFile;
                using var fs = new FileStream(localPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                using var reqStream = req.GetRequestStream();
                fs.CopyTo(reqStream);
                reqStream.Close();
                using var _ = (FtpWebResponse)req.GetResponse();
                return new { success = true };
            }

            if (op == "list")
            {
                req.Method = WebRequestMethods.Ftp.ListDirectoryDetails;
                using var res = (FtpWebResponse)req.GetResponse();
                using var reader = new StreamReader(res.GetResponseStream() ?? Stream.Null);
                var entries = new List<object>();
                while (reader.ReadLine() is { } line)
                {
                    var parsed = ParseFtpListLine(line, clean);
                    if (parsed != null) entries.Add(parsed);
                }
                return new { success = true, entries };
            }
            if (op == "mkdir")
            {
                req.Method = WebRequestMethods.Ftp.MakeDirectory;
                using var _ = (FtpWebResponse)req.GetResponse();
                return new { success = true };
            }
            if (op == "rename" && !string.IsNullOrWhiteSpace(newName))
            {
                req.Method = WebRequestMethods.Ftp.Rename;
                req.RenameTo = newName;
                using var _ = (FtpWebResponse)req.GetResponse();
                return new { success = true };
            }
            if (op == "delete")
            {
                req.Method = WebRequestMethods.Ftp.DeleteFile;
                try { using var _ = (FtpWebResponse)req.GetResponse(); }
                catch
                {
                    var reqDir = (FtpWebRequest)WebRequest.Create(uri);
                    reqDir.EnableSsl = useSsl;
                    reqDir.UsePassive = true;
                    if (!string.IsNullOrEmpty(user)) reqDir.Credentials = new NetworkCredential(user, secret ?? string.Empty);
                    reqDir.Method = WebRequestMethods.Ftp.RemoveDirectory;
                    using var _2 = (FtpWebResponse)reqDir.GetResponse();
                }
                return new { success = true };
            }
            return new { success = false, error = $"Unsupported FTP op: {op}" };
        });
    }
#pragma warning restore SYSLIB0014

    private static object? ParseFtpListLine(string line, string parent)
    {
        if (string.IsNullOrWhiteSpace(line)) return null;
        var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length < 4) return null;

        bool isDir = line[0] == 'd' || line.Contains("<DIR>", StringComparison.OrdinalIgnoreCase);
        long size = 0;
        string name;

        if (parts[0].Length >= 10 && (parts[0][0] == 'd' || parts[0][0] == '-' || parts[0][0] == 'l') && parts.Length >= 9)
        {
            long.TryParse(parts[4], NumberStyles.Integer, CultureInfo.InvariantCulture, out size);
            name = string.Join(' ', parts.Skip(8));
        }
        else
        {
            if (!isDir) long.TryParse(parts[2], NumberStyles.Integer, CultureInfo.InvariantCulture, out size);
            name = string.Join(' ', parts.Skip(3));
        }
        if (name == "." || name == "..") return null;

        var prefix = parent.EndsWith('/') ? parent : parent + "/";
        return new
        {
            name,
            fullPath = $"{prefix}{name}",
            isDirectory = isDir,
            size,
            lastModified = 0L,
            extension = isDir ? "" : Path.GetExtension(name),
        };
    }

    private static async Task<object> HandleSftpAsync(string host, int port, string user, string remotePath, string op)
    {
        return await Task.Run<object>(() =>
        {
            var sftpExe = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "OpenSSH", "sftp.exe");
            if (!File.Exists(sftpExe))
            {
                return new { success = false, error = "Windows OpenSSH sftp.exe not installed on this PC." };
            }
            if (op != "list") return new { success = false, error = "Only SFTP directory browse is enabled over key-based OpenSSH batch." };

            var target = string.IsNullOrWhiteSpace(user) ? host : $"{user}@{host}";
            var psi = new ProcessStartInfo(sftpExe, $"-o BatchMode=yes -o ConnectTimeout=8 -P {port} {target}")
            {
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            using var proc = Process.Start(psi);
            if (proc == null) return new { success = false, error = "Could not launch sftp.exe" };
            var clean = string.IsNullOrWhiteSpace(remotePath) ? "." : remotePath;
            proc.StandardInput.WriteLine($"ls -l \"{clean}\"");
            proc.StandardInput.WriteLine("bye");
            proc.StandardInput.Close();

            var stdout = proc.StandardOutput.ReadToEnd();
            var stderr = proc.StandardError.ReadToEnd();
            proc.WaitForExit(15_000);
            if (proc.ExitCode != 0 && string.IsNullOrWhiteSpace(stdout))
            {
                return new
                {
                    success = false,
                    error = string.IsNullOrWhiteSpace(stderr)
                        ? "SFTP batch requires configured SSH keys/agent (Password promptless auth unavailable)."
                        : stderr.Trim(),
                };
            }

            var entries = new List<object>();
            foreach (var raw in stdout.Split('\n'))
            {
                var line = raw.Trim();
                if (line.StartsWith("sftp>") || string.IsNullOrWhiteSpace(line)) continue;
                var parsed = ParseFtpListLine(line, clean == "." ? "/" : clean);
                if (parsed != null) entries.Add(parsed);
            }
            return new { success = true, entries };
        });
    }
}
