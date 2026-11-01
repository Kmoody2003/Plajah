using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace Plajah.WinUI;

/// <summary>
/// Crossover's local engine: ffmpeg and ffprobe run on the user's PC against the user's files, with
/// nothing uploaded. Progress comes from ffmpeg's -progress stream. While a video encodes, a second
/// ffmpeg output keeps one small JPEG up to date, which the page shows as the live preview through
/// the existing https://localmedia.plajah route.
/// </summary>
internal sealed class CrossoverNativeService
{
    private readonly Action<string, object> _post;
    private readonly ConcurrentDictionary<string, Job> _jobs = new();
    private static readonly string WorkDir = Path.Combine(Path.GetTempPath(), "PlajahCrossover");

    private sealed class Job
    {
        public Process? Process;
        public bool Canceled;
        public string? PreviewPath;
        public System.Threading.CancellationTokenSource? DecodeCancel;
        public string? DecodeError;
    }

    /// <summary>A .braw clip, opened and measured, ready to feed ffmpeg. See BrawDecoder.cs.</summary>
    private sealed record BrawInput(BrawClip Clip, string Path, string FrameRate, bool HasAudio, string? Timecode);

    public CrossoverNativeService(Action<string, object> post)
    {
        _post = post;
        // Review copies, previews and files fetched for conversion aren't kept past a day.
        _ = Task.Run(() =>
        {
            try
            {
                foreach (var f in new DirectoryInfo(WorkDir).EnumerateFiles())
                    if (DateTime.UtcNow - f.LastWriteTimeUtc > TimeSpan.FromDays(1)) { try { f.Delete(); } catch { } }
            }
            catch { /* no work folder yet */ }
        });
    }

    public object Status()
    {
        var p = FfmpegLocator.Any;
        return new
        {
            available = p.Path != null,
            path = p.Path,
            ffprobe = p.Path != null && File.Exists(FfprobeFor(p.Path)),
            version = p.Version,
            encoders = p.Encoders,
            downloads = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads", "Crossover"),
            raw = new { braw = BrawRuntime.Available },
            reason = p.Path == null
                ? "Crossover's engine (ffmpeg) isn't installed. Put ffmpeg.exe and ffprobe.exe in %LOCALAPPDATA%\\Plajah\\ffmpeg, or set PLAJAH_FFMPEG."
                : null,
        };
    }

    /// <summary>
    /// Fetch ffmpeg into the folder FfmpegLocator already searches, for installs that came without it.
    /// The pinned checksum is verified before anything is unpacked.
    /// </summary>
    public async Task<object> InstallEngineAsync()
    {
        // Pinned to match the hosted source archive; see scripts/fetchFfmpeg.mjs.
        const string asset = "ffmpeg-n8.1.3-29-gad3b795b72-win64-gpl-8.1";
        const string baseUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-11-01-12-49";
        const string want = "0bf508ade2d757f3e9116418768deefb4046a3a1d5a9ed32299ea4fb929dd231";
        var work = Path.Combine(WorkDir, "engine-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(work);
            using var http = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromMinutes(30) };
            var zip = Path.Combine(work, asset + ".zip");
            using (var res = await http.GetAsync($"{baseUrl}/{asset}.zip", System.Net.Http.HttpCompletionOption.ResponseHeadersRead))
            {
                res.EnsureSuccessStatusCode();
                var total = res.Content.Headers.ContentLength ?? 0;
                await using var from = await res.Content.ReadAsStreamAsync();
                await using var to = File.Create(zip);
                var buf = new byte[1 << 16];
                long got = 0, lastPost = 0;
                int n;
                while ((n = await from.ReadAsync(buf)) > 0)
                {
                    await to.WriteAsync(buf.AsMemory(0, n));
                    got += n;
                    if (Environment.TickCount64 - lastPost > 500)
                    {
                        lastPost = Environment.TickCount64;
                        _post("CROSSOVER_ENGINE", new { message = total > 0 ? $"Downloading the engine: {got * 100 / total}%" : "Downloading the engine" });
                    }
                }
            }
            _post("CROSSOVER_ENGINE", new { message = "Checking the download" });
            string got256;
            await using (var read = File.OpenRead(zip))
                got256 = System.Convert.ToHexString(await System.Security.Cryptography.SHA256.HashDataAsync(read));
            if (!got256.Equals(want, StringComparison.OrdinalIgnoreCase)) return new { success = false, error = "The download didn't match its checksum, so it wasn't installed." };

            _post("CROSSOVER_ENGINE", new { message = "Installing the engine" });
            var dest = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Plajah", "ffmpeg");
            Directory.CreateDirectory(dest);
            using (var archive = System.IO.Compression.ZipFile.OpenRead(zip))
            {
                foreach (var entry in archive.Entries)
                {
                    var target = entry.Name switch { "ffmpeg.exe" => "ffmpeg.exe", "ffprobe.exe" => "ffprobe.exe", "LICENSE.txt" => "FFMPEG-LICENSE.txt", _ => null };
                    if (target != null) entry.ExtractToFile(Path.Combine(dest, target), true);
                }
            }
            FfmpegLocator.Forget();
            return new { success = true, path = dest };
        }
        catch (Exception ex) { return new { success = false, error = ex.Message }; }
        finally { try { Directory.Delete(work, true); } catch { } }
    }

    private static string FfprobeFor(string ffmpeg) => Path.Combine(Path.GetDirectoryName(ffmpeg) ?? "", "ffprobe.exe");

    public async Task<object> ProbeAsync(string path)
    {
        var exe = FfmpegLocator.Any.Path;
        if (exe == null) return new { success = false, error = "ffmpeg isn't installed." };
        if (!File.Exists(path)) return new { success = false, error = "File not found." };
        var probe = FfprobeFor(exe);
        if (!File.Exists(probe)) return new { success = false, error = "ffprobe.exe isn't next to ffmpeg.exe." };

        var psi = new ProcessStartInfo(probe)
        {
            UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardOutput = true, RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
        };
        foreach (var a in new[] { "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path }) psi.ArgumentList.Add(a);
        using var proc = Process.Start(psi)!;
        ChildJob.Add(proc);
        var outTask = proc.StandardOutput.ReadToEndAsync();
        var errTask = proc.StandardError.ReadToEndAsync();
        await proc.WaitForExitAsync();
        var json = await outTask;
        var errors = await errTask;
        if (BrawRuntime.IsBraw(path) && BrawRuntime.Available)
        {
            try
            {
                var clip = await Task.Run(() => new BrawClip(path));
                using (clip) json = DescribeBraw(json, clip);
                return new { success = true, json, errors = "" };
            }
            catch (Exception ex) { errors = ex.Message; }
        }
        return new { success = proc.ExitCode == 0, json, errors };
    }

    /// <summary>ffprobe sees the .braw's QuickTime wrapper and audio; the picture's facts come from the decoder.</summary>
    private static string DescribeBraw(string ffprobeJson, BrawClip clip)
    {
        var root = System.Text.Json.Nodes.JsonNode.Parse(string.IsNullOrWhiteSpace(ffprobeJson) ? "{}" : ffprobeJson)!.AsObject();
        var streams = root["streams"]?.AsArray();
        if (streams == null) root["streams"] = streams = new System.Text.Json.Nodes.JsonArray();
        var video = streams.FirstOrDefault(s => (string?)s?["codec_type"] == "video")?.AsObject();
        if (video == null)
        {
            video = new System.Text.Json.Nodes.JsonObject { ["index"] = 0, ["codec_type"] = "video", ["r_frame_rate"] = BrawRate(null, clip) };
            streams.Add(video);
        }
        video["codec_name"] = "braw";
        video["codec_long_name"] = "Blackmagic RAW";
        video["width"] = clip.Width;
        video["height"] = clip.Height;
        video["nb_frames"] = clip.FrameCount.ToString();
        return root.ToJsonString();
    }

    private static string BrawRate(string? fromContainer, BrawClip clip) =>
        !string.IsNullOrEmpty(fromContainer) && !fromContainer.StartsWith("0") ? fromContainer : clip.FrameRate.ToString(System.Globalization.CultureInfo.InvariantCulture);

    /// <summary>
    /// The ffmpeg arguments for a job fed decoded .braw pictures on stdin: the pipe becomes input 0 so
    /// recipes' 0:v maps still hold, and the file becomes input 1 for its audio. Returns null when the job
    /// reads only audio, which ffmpeg can take from the file without the decoder.
    /// </summary>
    internal static List<string>? BrawArgs(IReadOnlyList<string> args, uint width, uint height, string frameRate, bool hasAudio, string? timecode)
    {
        var input = -1;
        for (var i = 0; i + 1 < args.Count; i++) if (args[i] == "-i" && BrawRuntime.IsBraw(args[i + 1])) { input = i; break; }
        if (input < 0) return null;
        var maps = args.Where((a, i) => i > 0 && args[i - 1] == "-map").ToList();
        if (args.Contains("-vn") || (maps.Count > 0 && !maps.Any(m => m.StartsWith("0:v")))) return null;

        var result = new List<string>(args.Take(input));
        result.AddRange(new[] { "-f", "rawvideo", "-pix_fmt", BrawClip.FfmpegPixelFormat, "-video_size", $"{width}x{height}", "-framerate", frameRate, "-i", "pipe:0" });
        if (hasAudio) { result.Add("-i"); result.Add(args[input + 1]); }
        if (timecode != null && System.Text.RegularExpressions.Regex.IsMatch(timecode, @"^\d\d:\d\d:\d\d[:;]\d\d$")) { result.Add("-timecode"); result.Add(timecode); }

        // ffmpeg's automatic RGB-to-YUV step assumes BT.601, which would shift every colour in an HD or
        // larger master. Convert here instead, keeping full chroma for the recipe's own chain to work from.
        const string toYuv = "scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv444p16le";
        var rest = args.Skip(input + 2).ToList();
        var filtered = false;
        for (var i = 0; i < rest.Count; i++)
        {
            if (i > 0 && rest[i - 1] == "-map" && hasAudio && rest[i].StartsWith("0:a")) rest[i] = "1" + rest[i][1..];
            if (i > 0 && rest[i - 1] == "-vf") { rest[i] = toYuv + "," + rest[i]; filtered = true; }
        }
        if (!filtered) result.AddRange(new[] { "-vf", toYuv });
        result.AddRange(new[] { "-colorspace", "bt709", "-color_range", "tv" });
        result.AddRange(rest);
        return result;
    }

    /// <summary>Convert, first opening the clip when the source is a .braw.</summary>
    public async Task<object> ConvertAsync(string jobId, IReadOnlyList<string> args, string outputPath, double durationSec, bool preview)
    {
        string? braw = null;
        for (var i = 0; i + 1 < args.Count; i++) if (args[i] == "-i" && BrawRuntime.IsBraw(args[i + 1])) braw = args[i + 1];
        if (braw == null) return Convert(jobId, args, outputPath, durationSec, preview, null);
        if (!BrawRuntime.Available && !args.Contains("-vn"))
            return new { success = false, error = "Blackmagic RAW isn't installed on this PC. Install it from Blackmagic Design, then try again." };
        if (!BrawRuntime.Available) return Convert(jobId, args, outputPath, durationSec, preview, null);

        BrawClip? clip = null;
        try
        {
            clip = await Task.Run(() => new BrawClip(braw));
            var probe = await ProbeContainerAsync(braw);
            var input = new BrawInput(clip, braw, BrawRate(probe.frameRate, clip), probe.hasAudio, probe.timecode);
            return Convert(jobId, args, outputPath, durationSec, preview, input);
        }
        catch (Exception ex)
        {
            clip?.Dispose();
            return new { success = false, error = ex.Message };
        }
    }

    private static async Task<(string? frameRate, bool hasAudio, string? timecode)> ProbeContainerAsync(string path)
    {
        var exe = FfmpegLocator.Any.Path;
        if (exe == null) return (null, false, null);
        var psi = new ProcessStartInfo(FfprobeFor(exe))
        {
            UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardOutput = true, RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
        };
        foreach (var a in new[] { "-v", "quiet", "-print_format", "json", "-show_streams", path }) psi.ArgumentList.Add(a);
        using var proc = Process.Start(psi)!;
        ChildJob.Add(proc);
        var errTask = proc.StandardError.ReadToEndAsync();
        var text = await proc.StandardOutput.ReadToEndAsync();
        await proc.WaitForExitAsync();
        await errTask;
        using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(text) ? "{}" : text);
        if (!doc.RootElement.TryGetProperty("streams", out var streams)) return (null, false, null);
        string? rate = null, timecode = null;
        var audio = false;
        foreach (var s in streams.EnumerateArray())
        {
            var type = s.TryGetProperty("codec_type", out var t) ? t.GetString() : null;
            if (type == "audio") audio = true;
            if (type != "video") continue;
            if (s.TryGetProperty("r_frame_rate", out var r)) rate = r.GetString();
            if (s.TryGetProperty("tags", out var tags) && tags.TryGetProperty("timecode", out var tc)) timecode = tc.GetString();
        }
        return (rate, audio, timecode);
    }

    /// <summary>Start an ffmpeg job. Returns at once; CROSSOVER_JOB messages report what happens.</summary>
    private object Convert(string jobId, IReadOnlyList<string> args, string outputPath, double durationSec, bool preview, BrawInput? braw)
    {
        var exe = FfmpegLocator.Any.Path;
        if (exe == null) { braw?.Clip.Dispose(); return new { success = false, error = "ffmpeg isn't installed." }; }
        if (string.IsNullOrEmpty(jobId) || args.Count == 0) { braw?.Clip.Dispose(); return new { success = false, error = "Bad job." }; }
        Directory.CreateDirectory(WorkDir);
        var outDir = Path.GetDirectoryName(outputPath);
        if (!string.IsNullOrEmpty(outDir)) Directory.CreateDirectory(outDir);

        var job = new Job();
        if (!_jobs.TryAdd(jobId, job)) { braw?.Clip.Dispose(); return new { success = false, error = "That job is already running." }; }

        var brawArgs = braw == null ? null : BrawArgs(args, braw.Clip.Width, braw.Clip.Height, braw.FrameRate, braw.HasAudio, braw.Timecode);
        if (braw != null && brawArgs == null) { braw.Clip.Dispose(); braw = null; }
        var fullArgs = brawArgs ?? new List<string>(args);
        if (preview)
        {
            // A second output: one small frame a second, overwriting one file.
            job.PreviewPath = Path.Combine(WorkDir, jobId + "_preview.jpg");
            fullArgs.AddRange(new[] { "-map", "0:v:0", "-an", "-sn", "-vf", "fps=1:eof_action=pass,scale=480:-2", "-q:v", "6", "-update", "1", "-y", job.PreviewPath });
        }

        var psi = new ProcessStartInfo(exe)
        {
            UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardOutput = true, RedirectStandardError = true, RedirectStandardInput = braw != null,
            StandardOutputEncoding = Encoding.UTF8,
        };
        psi.ArgumentList.Add("-hide_banner");
        psi.ArgumentList.Add("-nostats");
        psi.ArgumentList.Add("-progress");
        psi.ArgumentList.Add("pipe:1");
        foreach (var a in fullArgs) psi.ArgumentList.Add(a);

        Process proc;
        try { proc = Process.Start(psi) ?? throw new InvalidOperationException("ffmpeg did not start."); }
        catch (Exception ex)
        {
            braw?.Clip.Dispose();
            _jobs.TryRemove(jobId, out _);
            return new { success = false, error = ex.Message };
        }
        ChildJob.Add(proc);
        job.Process = proc;

        var decoding = Task.CompletedTask;
        if (braw != null)
        {
            job.DecodeCancel = new System.Threading.CancellationTokenSource();
            decoding = Task.Run(() =>
            {
                try
                {
                    using (braw.Clip) braw.Clip.DecodeTo(proc.StandardInput.BaseStream, job.DecodeCancel.Token);
                    proc.StandardInput.Close();
                }
                catch (OperationCanceledException) { }
                catch (IOException) { /* ffmpeg stopped reading; its own log says why */ }
                catch (Exception ex)
                {
                    job.DecodeError = ex.Message;
                    try { proc.Kill(true); } catch { }
                }
            });
        }

        var tail = new Queue<string>();
        var errors = Task.Run(async () =>
        {
            string? line;
            while ((line = await proc.StandardError.ReadLineAsync()) != null)
            {
                lock (tail) { tail.Enqueue(line); if (tail.Count > 24) tail.Dequeue(); }
            }
        });

        _ = Task.Run(async () =>
        {
            double outSec = 0;
            string speed = "";
            double fps = 0;
            var lastPost = 0L;
            string? line;
            while ((line = await proc.StandardOutput.ReadLineAsync()) != null)
            {
                var eq = line.IndexOf('=');
                if (eq <= 0) continue;
                var key = line[..eq];
                var val = line[(eq + 1)..].Trim();
                if (key == "out_time_us" && long.TryParse(val, out var us) && us >= 0) outSec = us / 1_000_000.0;
                else if (key == "speed") speed = val;
                else if (key == "fps") double.TryParse(val, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out fps);
                else if (key == "progress" && Environment.TickCount64 - lastPost > 250)
                {
                    lastPost = Environment.TickCount64;
                    _post("CROSSOVER_JOB", new
                    {
                        jobId, state = "running",
                        progress = durationSec > 0 ? Math.Min(0.999, outSec / durationSec) : (double?)null,
                        outSec, speed, fps,
                        preview = job.PreviewPath != null && File.Exists(job.PreviewPath) ? job.PreviewPath : null,
                    });
                }
            }
            await proc.WaitForExitAsync();
            await errors;
            job.DecodeCancel?.Cancel();
            await decoding;
            job.DecodeCancel?.Dispose();
            _jobs.TryRemove(jobId, out _);
            string log;
            lock (tail) log = job.DecodeError ?? string.Join("\n", tail);
            var ok = proc.ExitCode == 0 && File.Exists(outputPath);
            long size = 0;
            if (ok) { try { size = new FileInfo(outputPath).Length; } catch { } }
            if (job.Canceled) { try { if (File.Exists(outputPath)) File.Delete(outputPath); } catch { } }
            if (job.PreviewPath != null) { try { File.Delete(job.PreviewPath); } catch { } }
            _post("CROSSOVER_JOB", new
            {
                jobId,
                state = job.Canceled ? "canceled" : ok ? "done" : "error",
                progress = ok ? 1.0 : (double?)null,
                outputPath = ok ? outputPath : null,
                sizeBytes = size,
                error = ok || job.Canceled ? null : log,
            });
        });

        return new { success = true };
    }

    public object Cancel(string jobId)
    {
        if (!_jobs.TryGetValue(jobId, out var job) || job.Process == null) return new { success = false };
        job.Canceled = true;
        try { job.Process.Kill(true); } catch { }
        return new { success = true };
    }

    /// <summary>The next free name, so a conversion never overwrites something the user already has.</summary>
    public static string UniquePath(string path)
    {
        if (!File.Exists(path)) return path;
        var dir = Path.GetDirectoryName(path) ?? "";
        var stem = Path.GetFileNameWithoutExtension(path);
        var ext = Path.GetExtension(path);
        for (var i = 2; i < 10000; i++)
        {
            var candidate = Path.Combine(dir, $"{stem} ({i}){ext}");
            if (!File.Exists(candidate)) return candidate;
        }
        return Path.Combine(dir, $"{stem} {Guid.NewGuid():N}{ext}");
    }

    public static string TempPath(string name)
    {
        Directory.CreateDirectory(WorkDir);
        return Path.Combine(WorkDir, Guid.NewGuid().ToString("N") + "_" + Path.GetFileName(name));
    }

    public static object WriteText(string path, string text)
    {
        try
        {
            var dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            var target = UniquePath(path);
            File.WriteAllText(target, text, new UTF8Encoding(false));
            return new { success = true, path = target };
        }
        catch (Exception ex) { return new { success = false, error = ex.Message }; }
    }

    public static IReadOnlyList<string> ArgsFrom(JsonElement el) =>
        el.ValueKind == JsonValueKind.Array ? el.EnumerateArray().Select(x => x.GetString() ?? "").ToList() : new List<string>();
}
