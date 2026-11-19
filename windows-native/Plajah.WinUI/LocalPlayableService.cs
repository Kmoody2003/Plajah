using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Plajah.WinUI;

/// <summary>
/// Wide-format playback for Plajah Files and the media stage. WebView2 decodes H.264/VP9/AV1 video and
/// AAC/MP3/Opus/FLAC/WAV audio; everything else (MKV with AC-3/DTS, AVI, WMV, HEVC, MPEG-2 .ts/.vob, WMA,
/// AIFF, APE…) is turned into a cached MP4 or M4A by the local ffmpeg, then played through the normal ranged
/// localmedia route. A stream whose codec the browser already plays is copied, not re-encoded, so most
/// MKV/MOV/AVI files are ready in seconds. Nothing leaves the PC.
///
/// GET https://localmedia.plajah/__playable?path=C:\...  → JSON { state, progress, url?, error? }
/// The first call starts the job; the page polls the same URL until state is "ready" or "failed".
/// </summary>
internal static class LocalPlayableService
{
    private sealed class Job
    {
        public volatile string State = "working";
        public double Progress;
        public string? Error;
        public string OutPath = "";
        public string Mode = "remux";
    }

    private static readonly ConcurrentDictionary<string, Job> Jobs = new();
    // Two at once: a transcode keeps the GPU/CPU busy, more would only slow each one down.
    private static readonly SemaphoreSlim Gate = new(2, 2);
    private static int _swept;

    private static readonly string[] BrowserVideo = { "h264", "vp8", "vp9", "av1" };

    private static string CacheDir => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Plajah", "playable-cache");

    public static string StatusJson(string? path)
    {
        try
        {
            if (string.IsNullOrEmpty(path) || !File.Exists(path))
                return Json(new { state = "failed", progress = 0, error = "File not found" });

            var ffmpeg = FfmpegLocator.Any.Path;
            if (ffmpeg == null)
                return Json(new { state = "failed", progress = 0, error = "ffmpeg isn't installed, so this format can't be converted for playback.", needsFfmpeg = true });

            var fi = new FileInfo(path);
            var key = Hash($"{fi.FullName.ToLowerInvariant()}|{fi.Length}|{fi.LastWriteTimeUtc.Ticks}");
            Directory.CreateDirectory(CacheDir);
            SweepOnce();

            foreach (var ext in new[] { ".mp4", ".m4a" })
            {
                var cached = Path.Combine(CacheDir, key + ext);
                if (File.Exists(cached) && !Jobs.ContainsKey(key)) return Ready(cached);
            }

            var job = Jobs.GetOrAdd(key, static (k, a) =>
            {
                var j = new Job();
                Task.Run(() => RunAsync(a.ffmpeg, a.src, k, j));
                return j;
            }, (ffmpeg, src: fi.FullName));

            if (job.State == "ready") return Ready(job.OutPath);
            if (job.State == "failed")
            {
                Jobs.TryRemove(key, out _); // let a later open retry
                return Json(new { state = "failed", progress = 0, error = job.Error ?? "Conversion failed" });
            }
            return Json(new { state = "working", progress = Math.Round(job.Progress, 3), mode = job.Mode });
        }
        catch (Exception ex)
        {
            return Json(new { state = "failed", progress = 0, error = ex.Message });
        }
    }

    private static string Ready(string outPath)
    {
        try { File.SetLastAccessTimeUtc(outPath, DateTime.UtcNow); } catch { }
        var url = $"https://localmedia.plajah/{Uri.EscapeDataString(Path.GetFileName(outPath))}?path={Uri.EscapeDataString(outPath)}";
        return Json(new { state = "ready", progress = 1, url });
    }

    private static async Task RunAsync(string ffmpeg, string src, string key, Job job)
    {
        await Gate.WaitAsync().ConfigureAwait(false);
        try
        {
            var (vCodec, aCodec, duration) = ProbeStreams(ffmpeg, src);
            var audioOnly = vCodec == null;
            var outPath = Path.Combine(CacheDir, key + (audioOnly ? ".m4a" : ".mp4"));
            var tmp = outPath + ".part";

            var copyVideo = vCodec != null && BrowserVideo.Contains(vCodec);
            // Codecs Chromium plays from inside an MP4 are copied; AC-3, DTS, PCM, WMA, Vorbis… become AAC.
            var copyAudio = aCodec is "aac" or "mp3" or "opus" or "flac";
            job.Mode = audioOnly || copyVideo ? "remux" : "transcode";

            var audioArgs = aCodec == null ? "-an" : copyAudio ? "-c:a copy" : "-c:a aac -b:a 256k -ac 2";
            string[] encoders;
            if (audioOnly) encoders = new[] { "" };
            else if (copyVideo) encoders = new[] { "copy" };
            else
            {
                // Hardware first; any of them can be listed yet missing its GPU, so fall back down the list.
                var have = FfmpegLocator.Any.Encoders;
                encoders = new[] { "h264_nvenc", "h264_qsv", "h264_amf", "h264_mf", "libx264" }.Where(have.Contains).ToArray();
                if (encoders.Length == 0) encoders = new[] { "libx264" };
            }

            string? lastErr = null;
            foreach (var enc in encoders)
            {
                string videoArgs = audioOnly ? "-vn"
                    : enc == "copy" ? "-map 0:v:0 -c:v copy"
                    : enc == "libx264" ? "-map 0:v:0 -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p"
                    : enc == "h264_mf" ? $"-map 0:v:0 -c:v {enc} -b:v 12M -pix_fmt nv12"
                    : $"-map 0:v:0 -c:v {enc} -b:v 12M -pix_fmt yuv420p";
                var audioMap = aCodec == null ? "" : "-map 0:a:0? ";
                var args = $"-hide_banner -nostdin -y -i \"{src}\" {videoArgs} {audioMap}{audioArgs} -sn -dn " +
                           $"-movflags +faststart -f mp4 -progress pipe:1 -nostats \"{tmp}\"";
                var (ok, err) = await RunFfmpegAsync(ffmpeg, args, duration, job).ConfigureAwait(false);
                if (ok && File.Exists(tmp) && new FileInfo(tmp).Length > 0)
                {
                    File.Move(tmp, outPath, overwrite: true);
                    job.OutPath = outPath;
                    job.Progress = 1;
                    job.State = "ready";
                    return;
                }
                lastErr = err;
                try { File.Delete(tmp); } catch { }
            }
            job.Error = string.IsNullOrWhiteSpace(lastErr) ? "ffmpeg could not convert this file" : lastErr;
            job.State = "failed";
        }
        catch (Exception ex)
        {
            job.Error = ex.Message;
            job.State = "failed";
            CrashLog.Write("Playable", ex);
        }
        finally
        {
            Gate.Release();
        }
    }

    private static async Task<(bool ok, string? err)> RunFfmpegAsync(string ffmpeg, string args, double duration, Job job)
    {
        var psi = new ProcessStartInfo(ffmpeg, args)
        {
            RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true,
        };
        using var p = Process.Start(psi);
        if (p == null) return (false, "ffmpeg did not start");
        try { p.PriorityClass = ProcessPriorityClass.BelowNormal; } catch { }
        var errTail = new StringBuilder();
        var errTask = Task.Run(async () =>
        {
            string? line;
            while ((line = await p.StandardError.ReadLineAsync().ConfigureAwait(false)) != null)
            {
                errTail.AppendLine(line);
                if (errTail.Length > 4000) errTail.Remove(0, errTail.Length - 2000);
            }
        });
        string? l;
        while ((l = await p.StandardOutput.ReadLineAsync().ConfigureAwait(false)) != null)
        {
            if (duration > 0 && l.StartsWith("out_time_us=") &&
                long.TryParse(l.AsSpan("out_time_us=".Length), NumberStyles.Integer, CultureInfo.InvariantCulture, out var us))
                job.Progress = Math.Clamp(us / 1_000_000.0 / duration, 0, 0.99);
        }
        await p.WaitForExitAsync().ConfigureAwait(false);
        await errTask.ConfigureAwait(false);
        if (p.ExitCode == 0) return (true, null);
        var lastLine = errTail.ToString().Split('\n', StringSplitOptions.RemoveEmptyEntries).LastOrDefault()?.Trim();
        return (false, lastLine);
    }

    private static (string? video, string? audio, double duration) ProbeStreams(string ffmpeg, string src)
    {
        var probe = Path.Combine(Path.GetDirectoryName(ffmpeg) ?? "", "ffprobe.exe");
        if (!File.Exists(probe)) return ("unknown", "unknown", 0);
        var psi = new ProcessStartInfo(probe,
            $"-v error -show_entries stream=codec_type,codec_name,disposition:format=duration -of json \"{src}\"")
        { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
        using var p = Process.Start(psi)!;
        var json = p.StandardOutput.ReadToEnd();
        p.WaitForExit(15000);
        using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(json) ? "{}" : json);
        string? v = null, a = null;
        if (doc.RootElement.TryGetProperty("streams", out var streams))
        {
            foreach (var s in streams.EnumerateArray())
            {
                var type = s.TryGetProperty("codec_type", out var t) ? t.GetString() : null;
                var name = s.TryGetProperty("codec_name", out var n) ? n.GetString() : null;
                // Cover art in audio files shows up as a one-frame mjpeg/png "video" stream.
                var attached = s.TryGetProperty("disposition", out var d) && d.TryGetProperty("attached_pic", out var ap) && ap.GetInt32() == 1;
                if (type == "video" && v == null && !attached) v = name ?? "unknown";
                else if (type == "audio" && a == null) a = name ?? "unknown";
            }
        }
        double dur = 0;
        if (doc.RootElement.TryGetProperty("format", out var fmt) && fmt.TryGetProperty("duration", out var du))
            double.TryParse(du.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out dur);
        return (v, a, dur);
    }

    /// <summary>Once per run: drop cached conversions unused for 14 days and keep the folder under 20 GB.</summary>
    private static void SweepOnce()
    {
        if (Interlocked.Exchange(ref _swept, 1) == 1) return;
        _ = Task.Run(() =>
        {
            try
            {
                var files = new DirectoryInfo(CacheDir).GetFiles().OrderByDescending(f => f.LastAccessTimeUtc).ToList();
                long total = 0;
                foreach (var f in files)
                {
                    total += f.Length;
                    var stale = f.LastAccessTimeUtc < DateTime.UtcNow.AddDays(-14) || f.Name.EndsWith(".part");
                    if (stale || total > 20L * 1024 * 1024 * 1024) { try { f.Delete(); } catch { } }
                }
            }
            catch { }
        });
    }

    private static string Hash(string s) => Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(s)))[..20].ToLowerInvariant();

    private static string Json(object o) => JsonSerializer.Serialize(o);
}
