using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Security;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
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

    private static string SanitizeHost(string raw)
    {
        var h = (raw ?? string.Empty).Trim();
        string[] prefixes = { "ftpes://", "ftps://", "ftp://", "sftp://", "webdavs://", "webdav://", "https://", "http://" };
        foreach (var p in prefixes)
        {
            if (h.StartsWith(p, StringComparison.OrdinalIgnoreCase))
            {
                h = h[p.Length..];
                break;
            }
        }
        return h.TrimStart('\\').TrimEnd('/');
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
        if (proto == "ftp-insecure") proto = "ftp";
        var host = SanitizeHost(location.TryGetProperty("host", out var hEl) ? hEl.GetString() ?? "" : "");
        var port = location.TryGetProperty("port", out var ptEl) && ptEl.TryGetInt32(out var pv) ? pv : 21;
        var user = location.TryGetProperty("user", out var uEl) ? uEl.GetString() ?? "" : "";
        var account = location.TryGetProperty("account", out var aEl) ? aEl.GetString() ?? "" : "";
        var passive = !location.TryGetProperty("passive", out var pasvEl) || pasvEl.ValueKind != JsonValueKind.False;
        var secret = !string.IsNullOrEmpty(secretOverride) ? secretOverride : GetSecret(id);

        if (string.IsNullOrWhiteSpace(host)) return new { success = false, error = "Host is required" };

        // Opening/playing a remote file: with no target given, fetch it into a per-location cache
        // so Files can preview it through localmedia.plajah like any local file.
        if (op == "download_to_local" && string.IsNullOrWhiteSpace(localPath))
        {
            var fileName = Path.GetFileName((remotePath ?? "").Replace('\\', '/').TrimEnd('/'));
            if (string.IsNullOrWhiteSpace(fileName)) return new { success = false, error = "Pick a file to open" };
            foreach (var c in Path.GetInvalidFileNameChars()) fileName = fileName.Replace(c, '_');
            var safeId = new string((string.IsNullOrEmpty(id) ? host : id).Select(ch => char.IsLetterOrDigit(ch) || ch is '-' or '_' ? ch : '_').ToArray());
            var remoteDirHash = Convert.ToHexString(System.Security.Cryptography.SHA1.HashData(Encoding.UTF8.GetBytes(remotePath ?? "")))[..10];
            localPath = Path.Combine(Path.GetTempPath(), "PlajahRemoteCache", safeId, remoteDirHash, fileName);
        }

        // Implicit FTPS (TLS from the first byte, usually port 990) is not something FtpWebRequest can do.
        // Most servers that offer it also take explicit TLS on 21, so try that instead.
        var implicitFtps = proto == "ftps";
        if (implicitFtps)
        {
            proto = "ftpes";
            if (port == 990) port = 21;
        }

        try
        {
            return proto switch
            {
                "smb" => await HandleSmbAsync(host, remotePath, op, newName, localPath),
                "webdav" or "webdavs" => await HandleWebDavAsync(proto == "webdavs", host, port, user, secret, remotePath, op, newName, localPath),
                "ftp" or "ftpes" => await HandleFtpAsync(proto != "ftp", proto == "ftp", passive, host, port, user, account, secret, remotePath, op, newName, localPath),
                "sftp" => await HandleSftpAsync(host, port, user, remotePath, op),
                _ => new { success = false, error = $"Protocol '{proto}' is not supported natively yet." },
            };
        }
        catch (Exception ex) when (implicitFtps)
        {
            return new
            {
                success = false,
                error = $"This site is set to implicit FTPS (port 990), which Plajah connects to as explicit TLS on port {port}, and that failed ({ex.Message}). Ask the host whether FTPES on port 21 is enabled, or switch the location to SFTP.",
            };
        }
        catch (WebException wex) when (wex.Response is FtpWebResponse ftpResp && !string.IsNullOrWhiteSpace(ftpResp.StatusDescription))
        {
            return new { success = false, error = ftpResp.StatusDescription.Trim() };
        }
        catch (WebException wex) when (wex.Status == WebExceptionStatus.Timeout)
        {
            return new { success = false, error = $"{host} did not answer in time. Check the host and port, or try switching passive mode in the location settings." };
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
    private static string BuildFtpUri(string host, int port, string cleanPath)
    {
        var segments = cleanPath.Split('/', StringSplitOptions.RemoveEmptyEntries);
        var escapedPath = segments.Length == 0
            ? "/"
            : "/" + string.Join("/", segments.Select(Uri.EscapeDataString));
        return $"ftp://{host}:{port}{escapedPath}";
    }

    private static bool IsTlsRequiredError(WebException ex)
    {
        var msg = ex.Message ?? string.Empty;
        if (ex.Response is FtpWebResponse ftpResp && !string.IsNullOrWhiteSpace(ftpResp.StatusDescription))
        {
            msg = $"{msg} {ftpResp.StatusDescription}";
        }
        return msg.Contains("TLS", StringComparison.OrdinalIgnoreCase)
            || msg.Contains("SSL", StringComparison.OrdinalIgnoreCase)
            || msg.Contains("encrypt", StringComparison.OrdinalIgnoreCase)
            || msg.Contains("cleartext", StringComparison.OrdinalIgnoreCase)
            || msg.Contains("secure", StringComparison.OrdinalIgnoreCase);
    }

    private static async Task<object> HandleFtpAsync(
        bool useSsl, bool allowTlsUpgrade, bool usePassive, string host, int port, string user, string account, string? secret, string remotePath, string op, string? newName, string? localPath)
    {
        return await Task.Run<object>(() =>
        {
            if (!string.IsNullOrWhiteSpace(account))
            {
                return ExecuteFtpWithAccount(useSsl, allowTlsUpgrade, host, port, user, account, secret, remotePath, op, newName, localPath);
            }
            try
            {
                return ExecuteFtpOp(useSsl, usePassive, host, port, user, secret, remotePath, op, newName, localPath);
            }
            catch (WebException wex) when (!useSsl && allowTlsUpgrade && IsTlsRequiredError(wex))
            {
                return ExecuteFtpOp(true, usePassive, host, port, user, secret, remotePath, op, newName, localPath);
            }
        });
    }

    private static (int Code, string Message) ReadFtpReply(StreamReader reader)
    {
        var first = reader.ReadLine();
        if (first == null) return (0, "Connection closed by FTP server");
        if (first.Length < 3 || !int.TryParse(first[..3], out var code))
        {
            return (0, first);
        }
        var sb = new StringBuilder(first);
        // Multi-line RFC 959 reply: "NNN-..." continues until "NNN ..."
        if (first.Length >= 4 && first[3] == '-')
        {
            var endPrefix = $"{first[..3]} ";
            while (reader.ReadLine() is { } line)
            {
                sb.Append('\n').Append(line);
                if (line.StartsWith(endPrefix, StringComparison.Ordinal)) break;
            }
        }
        return (code, sb.ToString());
    }

    private static (int Code, string Message) SendFtpCmd(StreamWriter writer, StreamReader reader, string cmd)
    {
        writer.Write(cmd);
        writer.Write("\r\n");
        writer.Flush();
        return ReadFtpReply(reader);
    }

    private static bool IsPrivateOrZeroIpv4(string ip)
    {
        if (ip == "0.0.0.0" || ip.StartsWith("127.", StringComparison.Ordinal) || ip.StartsWith("10.", StringComparison.Ordinal) || ip.StartsWith("192.168.", StringComparison.Ordinal))
            return true;
        if (ip.StartsWith("172.", StringComparison.Ordinal))
        {
            var parts = ip.Split('.');
            if (parts.Length == 4 && int.TryParse(parts[1], out var second) && second >= 16 && second <= 31)
                return true;
        }
        return false;
    }

    private static TcpClient OpenPasvDataClient(StreamWriter writer, StreamReader reader, string controlHost)
    {
        var (code, msg) = SendFtpCmd(writer, reader, "PASV");
        if (code != 227) throw new InvalidOperationException($"FTP PASV failed: {msg}");
        var m = Regex.Match(msg, @"\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)");
        if (!m.Success) throw new InvalidOperationException($"Could not parse FTP PASV response: {msg}");
        var pasvIp = $"{m.Groups[1].Value}.{m.Groups[2].Value}.{m.Groups[3].Value}.{m.Groups[4].Value}";
        var pasvPort = int.Parse(m.Groups[5].Value, CultureInfo.InvariantCulture) * 256 + int.Parse(m.Groups[6].Value, CultureInfo.InvariantCulture);
        var targetHost = IsPrivateOrZeroIpv4(pasvIp) && !IsPrivateOrZeroIpv4(controlHost) ? controlHost : pasvIp;
        var dataClient = new TcpClient { ReceiveTimeout = 10 * 60_000, SendTimeout = 10 * 60_000 };
        if (!dataClient.ConnectAsync(targetHost, pasvPort).Wait(30_000))
        {
            dataClient.Dispose();
            throw new TimeoutException($"Timed out opening FTP data connection to {targetHost}:{pasvPort}");
        }
        return dataClient;
    }

    private static object ExecuteFtpWithAccount(
        bool useSsl, bool allowTlsUpgrade, string host, int port, string user, string account, string? secret, string remotePath, string op, string? newName, string? localPath)
    {
        try
        {
            return RunFtpAccountSession(useSsl, host, port, user, account, secret, remotePath, op, newName, localPath);
        }
        catch (InvalidOperationException ex) when (!useSsl && allowTlsUpgrade && (
            ex.Message.Contains("TLS", StringComparison.OrdinalIgnoreCase)
            || ex.Message.Contains("SSL", StringComparison.OrdinalIgnoreCase)
            || ex.Message.Contains("encrypt", StringComparison.OrdinalIgnoreCase)
            || ex.Message.Contains("cleartext", StringComparison.OrdinalIgnoreCase)
            || ex.Message.Contains("secure", StringComparison.OrdinalIgnoreCase)))
        {
            return RunFtpAccountSession(true, host, port, user, account, secret, remotePath, op, newName, localPath);
        }
    }

    private static object RunFtpAccountSession(
        bool useSsl, string host, int port, string user, string account, string? secret, string remotePath, string op, string? newName, string? localPath)
    {
        using var control = new TcpClient { ReceiveTimeout = 30_000, SendTimeout = 30_000 };
        if (!control.ConnectAsync(host, port).Wait(30_000))
        {
            return new { success = false, error = $"Timed out connecting to {host}:{port}" };
        }

        Stream ctrlStream = control.GetStream();
        var reader = new StreamReader(ctrlStream, Encoding.UTF8, false, 4096, leaveOpen: true);
        var writer = new StreamWriter(ctrlStream, new UTF8Encoding(false), 4096, leaveOpen: true) { NewLine = "\r\n" };

        try
        {
            var greeting = ReadFtpReply(reader);
            if (greeting.Code < 200 || greeting.Code >= 300)
            {
                return new { success = false, error = $"FTP greeting failed: {greeting.Message}" };
            }

            if (useSsl)
            {
                var auth = SendFtpCmd(writer, reader, "AUTH TLS");
                if (auth.Code != 234) return new { success = false, error = $"FTP AUTH TLS failed: {auth.Message}" };
                var ssl = new SslStream(ctrlStream, leaveInnerStreamOpen: false);
                ssl.AuthenticateAsClient(host);
                ctrlStream = ssl;
                reader = new StreamReader(ctrlStream, Encoding.UTF8, false, 4096, leaveOpen: true);
                writer = new StreamWriter(ctrlStream, new UTF8Encoding(false), 4096, leaveOpen: true) { NewLine = "\r\n" };
                SendFtpCmd(writer, reader, "PBSZ 0");
                SendFtpCmd(writer, reader, "PROT P");
            }

            var loginUser = string.IsNullOrEmpty(user) ? "anonymous" : user;
            var uReply = SendFtpCmd(writer, reader, $"USER {loginUser}");
            if (uReply.Code >= 400) throw new InvalidOperationException(uReply.Message);

            var needAcct = uReply.Code == 332;
            if (uReply.Code == 331)
            {
                var pReply = SendFtpCmd(writer, reader, $"PASS {secret ?? string.Empty}");
                if (pReply.Code >= 400) throw new InvalidOperationException(pReply.Message);
                needAcct = pReply.Code == 332;
            }

            if (needAcct)
            {
                var aReply = SendFtpCmd(writer, reader, $"ACCT {account}");
                if (aReply.Code >= 400) throw new InvalidOperationException(aReply.Message);
            }

            var clean = "/" + (remotePath ?? "/").TrimStart('/');

            if (op == "list")
            {
                SendFtpCmd(writer, reader, "TYPE A");
                if (clean != "/")
                {
                    var cwd = SendFtpCmd(writer, reader, $"CWD {clean}");
                    if (cwd.Code >= 400) return new { success = false, error = cwd.Message };
                }
                using var dataClient = OpenPasvDataClient(writer, reader, host);
                var listReply = SendFtpCmd(writer, reader, "LIST");
                if (listReply.Code is not (125 or 150)) return new { success = false, error = listReply.Message };

                var entries = new List<object>();
                Stream dataStream = dataClient.GetStream();
                if (useSsl)
                {
                    var dataSsl = new SslStream(dataStream, leaveInnerStreamOpen: false);
                    dataSsl.AuthenticateAsClient(host);
                    dataStream = dataSsl;
                }
                using (var dataReader = new StreamReader(dataStream, Encoding.UTF8))
                {
                    while (dataReader.ReadLine() is { } line)
                    {
                        var parsed = ParseFtpListLine(line, clean);
                        if (parsed != null) entries.Add(parsed);
                    }
                }
                ReadFtpReply(reader); // 226 Transfer complete
                return new { success = true, entries };
            }

            if (op == "download_to_local" && !string.IsNullOrWhiteSpace(localPath))
            {
                SendFtpCmd(writer, reader, "TYPE I");
                using var dataClient = OpenPasvDataClient(writer, reader, host);
                var retr = SendFtpCmd(writer, reader, $"RETR {clean}");
                if (retr.Code is not (125 or 150)) return new { success = false, error = retr.Message };
                var dir = Path.GetDirectoryName(localPath);
                if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
                Stream dataStream = dataClient.GetStream();
                if (useSsl)
                {
                    var dataSsl = new SslStream(dataStream, leaveInnerStreamOpen: false);
                    dataSsl.AuthenticateAsClient(host);
                    dataStream = dataSsl;
                }
                using (dataStream)
                using (var fs = new FileStream(localPath, FileMode.Create, FileAccess.Write, FileShare.None))
                {
                    dataStream.CopyTo(fs);
                }
                ReadFtpReply(reader);
                return new { success = true, localPath };
            }

            if (op == "upload_from_local" && !string.IsNullOrWhiteSpace(localPath) && File.Exists(localPath))
            {
                SendFtpCmd(writer, reader, "TYPE I");
                using var dataClient = OpenPasvDataClient(writer, reader, host);
                var stor = SendFtpCmd(writer, reader, $"STOR {clean}");
                if (stor.Code is not (125 or 150)) return new { success = false, error = stor.Message };
                Stream dataStream = dataClient.GetStream();
                if (useSsl)
                {
                    var dataSsl = new SslStream(dataStream, leaveInnerStreamOpen: false);
                    dataSsl.AuthenticateAsClient(host);
                    dataStream = dataSsl;
                }
                using (dataStream)
                using (var fs = new FileStream(localPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                {
                    fs.CopyTo(dataStream);
                }
                ReadFtpReply(reader);
                return new { success = true };
            }

            if (op == "mkdir")
            {
                var mkd = SendFtpCmd(writer, reader, $"MKD {clean}");
                return mkd.Code < 400 ? new { success = true } : new { success = false, error = mkd.Message };
            }

            if (op == "rename" && !string.IsNullOrWhiteSpace(newName))
            {
                var rnfr = SendFtpCmd(writer, reader, $"RNFR {clean}");
                if (rnfr.Code >= 400) return new { success = false, error = rnfr.Message };
                var parent = clean.Contains('/') ? clean[..clean.LastIndexOf('/')] : "";
                var target = newName.StartsWith('/') ? newName : $"{parent}/{newName}";
                var rnto = SendFtpCmd(writer, reader, $"RNTO {target}");
                return rnto.Code < 400 ? new { success = true } : new { success = false, error = rnto.Message };
            }

            if (op == "delete")
            {
                var dele = SendFtpCmd(writer, reader, $"DELE {clean}");
                if (dele.Code < 400) return new { success = true };
                var rmd = SendFtpCmd(writer, reader, $"RMD {clean}");
                return rmd.Code < 400 ? new { success = true } : new { success = false, error = rmd.Message };
            }

            return new { success = false, error = $"Unsupported FTP op: {op}" };
        }
        finally
        {
            try { writer.Write("QUIT\r\n"); writer.Flush(); } catch { /* ignore */ }
            try { ctrlStream.Dispose(); } catch { /* ignore */ }
        }
    }

    private static object ExecuteFtpOp(
        bool useSsl, bool usePassive, string host, int port, string user, string? secret, string remotePath, string op, string? newName, string? localPath)
    {
        var clean = "/" + (remotePath ?? "/").TrimStart('/');
        var uri = BuildFtpUri(host, port, clean);
        var req = (FtpWebRequest)WebRequest.Create(uri);
        req.EnableSsl = useSsl;
        req.UsePassive = usePassive;
        req.UseBinary = true;
        // Default is 100 s per call with no feedback; a dead host should fail fast. Transfers keep a
        // long read/write window so big files are not cut off.
        req.Timeout = 30_000;
        req.ReadWriteTimeout = 10 * 60_000;
        req.Credentials = new NetworkCredential(string.IsNullOrEmpty(user) ? "anonymous" : user, secret ?? string.Empty);

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
                reqDir.UsePassive = usePassive;
                reqDir.Timeout = 30_000;
                reqDir.Credentials = new NetworkCredential(string.IsNullOrEmpty(user) ? "anonymous" : user, secret ?? string.Empty);
                reqDir.Method = WebRequestMethods.Ftp.RemoveDirectory;
                using var _2 = (FtpWebResponse)reqDir.GetResponse();
            }
            return new { success = true };
        }
        return new { success = false, error = $"Unsupported FTP op: {op}" };
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

        long modified = 0;
        if (parts[0].Length >= 10 && (parts[0][0] == 'd' || parts[0][0] == '-' || parts[0][0] == 'l') && parts.Length >= 9)
        {
            long.TryParse(parts[4], NumberStyles.Integer, CultureInfo.InvariantCulture, out size);
            name = string.Join(' ', parts.Skip(8));
            // Symlinks list as "name -> target".
            if (parts[0][0] == 'l')
            {
                var arrow = name.IndexOf(" -> ", StringComparison.Ordinal);
                if (arrow > 0) name = name[..arrow];
            }
            // "Nov 24 21:05" (this year) or "Nov 24  2025".
            var stamp = $"{parts[5]} {parts[6]} {parts[7]}";
            if (DateTime.TryParseExact(stamp, new[] { "MMM d HH:mm", "MMM dd HH:mm", "MMM d yyyy", "MMM dd yyyy" },
                    CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AllowWhiteSpaces, out var dt))
            {
                if (!parts[7].Contains(':') || dt <= DateTime.UtcNow.AddDays(2)) modified = new DateTimeOffset(dt.ToUniversalTime()).ToUnixTimeMilliseconds();
                else modified = new DateTimeOffset(dt.AddYears(-1).ToUniversalTime()).ToUnixTimeMilliseconds();
            }
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
            lastModified = modified,
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
