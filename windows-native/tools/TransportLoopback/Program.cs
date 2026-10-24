using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Plajah.WinUI;
using Windows.Graphics.Imaging;
using Windows.Storage.Streams;

// Sends a synthetic 1280x720 Program (solid test colour + moving bar + 1 kHz tone) out through each
// transport's real sink and receives it back through the app's real receiver, then checks the picture
// colour, the frame dimensions, the audio level and the sink's own connection state.

internal static class Program
{
    private static int _failures;

    private static async Task<int> Main(string[] args)
    {
        string ndiDll = Path.Combine(AppContext.BaseDirectory, "Processing.NDI.Lib.x64.dll");
        var only = args.FirstOrDefault()?.ToLowerInvariant();
        Console.WriteLine($"ffmpeg: {FfmpegLocator.Current.Path ?? "(none)"} srt={FfmpegLocator.SrtAvailable} encoders=[{string.Join(",", FfmpegLocator.Current.H264Encoders)}]");

        // Two-process checks: `send <ndi|omt> <seconds>` in one window, `recv <ndi|omt> <url-or-name>` in another.
        if (only == "send")
        {
            var kind = args[1]; var secs = int.Parse(args[2]);
            ProgramSink s = kind == "ndi" ? new NdiSink(new SinkConfig("x", "ndi", "Plajah Loopback Sender", 30, 6000), ndiDll) : new OmtSink(new SinkConfig("x", "omt", "Plajah Loopback Sender", 30, 6000));
            using var c = new CancellationTokenSource(); s.Start(); var pmp = Pump(s, c.Token);
            for (int i = 0; i < secs; i++) { await Task.Delay(1000); Console.WriteLine($"send {kind}: {s.State} conns={s.Connections} sent={s.FramesSent} dropped={s.FramesDropped} url={s.Url} err={s.Error}"); }
            c.Cancel(); await pmp; s.Dispose(); return 0;
        }
        if (only == "recv")
        {
            using var r = new NdiReceiverService();
            var id = args[1] + ":x";
            Console.WriteLine("connect: " + (args[1] == "omt" ? r.ConnectOmt(id, args[2]) : r.Connect(id, args[2], null, ndiDll)));
            await WaitPicture(r, id, "recv " + args[1]);
            await WaitAudio(r, id, "recv " + args[1]);
            return _failures;
        }
        if (only is null or "ndi") await RunNdi(ndiDll);
        if (only is null or "omt") await RunOmt();
        if (only is null or "srt")
        {
            if (!FfmpegLocator.SrtAvailable) Console.WriteLine($"SKIP srt: {FfmpegLocator.SrtReason}");
            else
            {
                await RunSrt("listener", passphrase: "plajah-loopback-pass");   // Stage listens, receiver calls in
                await RunSrt("caller", passphrase: "");                         // Stage calls a listening receiver
            }
        }
        Console.WriteLine(_failures == 0 ? "ALL PASSED" : $"{_failures} FAILED");
        return _failures == 0 ? 0 : 1;
    }

    // ── test signal ──────────────────────────────────────────────────────────
    private const int W = 1280, H = 720;
    private static readonly (byte r, byte g, byte b) TestColour = (230, 30, 160);

    private static ProgramFrame MakeFrame(FramePool pool, int n)
    {
        var f = pool.Rent(W * H * 4);
        f.Width = W; f.Height = H; f.Stride = W * 4;
        var d = f.Data;
        int bar = (n * 8) % W;
        for (int y = 0; y < H; y++)
            for (int x = 0; x < W; x++)
            {
                int i = (y * W + x) * 4;
                bool inBar = y < 80 && x >= bar && x < bar + 60;
                d[i] = inBar ? (byte)255 : TestColour.b; d[i + 1] = inBar ? (byte)255 : TestColour.g; d[i + 2] = inBar ? (byte)255 : TestColour.r; d[i + 3] = 255;
            }
        return f;
    }

    private static short[] Tone(ref double phase, int samples)
    {
        var pcm = new short[samples * 2];
        for (int i = 0; i < samples; i++)
        {
            short v = (short)(Math.Sin(phase) * 0.5 * 32767); phase += 2 * Math.PI * 1000 / 48000;
            pcm[i * 2] = v; pcm[i * 2 + 1] = v;
        }
        return pcm;
    }

    /// <summary>Feeds the sink at 30 fps (video + 33 ms of audio per frame) until `stop` is cancelled.</summary>
    private static Task Pump(ProgramSink sink, CancellationToken stop) => Task.Run(() =>
    {
        var pool = new FramePool(); double phase = 0; int n = 0;
        var frames = Enumerable.Range(0, 4).Select(i => MakeFrame(pool, i * 40)).ToArray(); // pre-rendered: the harness must not be the bottleneck
        var sw = System.Diagnostics.Stopwatch.StartNew();
        while (!stop.IsCancellationRequested)
        {
            var f = frames[n % frames.Length];
            f.AddRef(); sink.Offer(f); f.Release();
            sink.OfferAudio(Tone(ref phase, 1600), 48000);
            n++;
            var wait = (int)(n * 1000 / 30 - sw.ElapsedMilliseconds);
            if (wait > 0) Thread.Sleep(wait);
        }
    });

    // ── checks ───────────────────────────────────────────────────────────────
    private static async Task<bool> WaitPicture(NdiReceiverService recv, string id, string label, int timeoutMs = 15000)
    {
        var until = Environment.TickCount64 + timeoutMs;
        while (Environment.TickCount64 < until)
        {
            var jpeg = recv.LatestJpeg(id, 640);
            if (jpeg != null)
            {
                var (w, h, r, g, b) = await Decode(jpeg);
                bool colourOk = Math.Abs(r - TestColour.r) < 30 && Math.Abs(g - TestColour.g) < 30 && Math.Abs(b - TestColour.b) < 30;
                Check(colourOk, $"{label}: picture colour at centre rgb({r},{g},{b}) ≈ rgb({TestColour.r},{TestColour.g},{TestColour.b}) [{w}x{h} jpeg]");
                return colourOk;
            }
            await Task.Delay(100);
        }
        Check(false, $"{label}: no picture received in {timeoutMs / 1000}s (status {Level(recv, id, "status")}, error {Level(recv, id, "error")})");
        return false;
    }

    private static string Level(NdiReceiverService recv, string id, string key)
    {
        var snap = recv.LevelsSnapshot();
        if (snap == null) return "-";
        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(snap));
        return doc.RootElement.TryGetProperty(id, out var e) && e.TryGetProperty(key, out var v) ? v.ToString() : "-";
    }

    private static async Task WaitAudio(NdiReceiverService recv, string id, string label)
    {
        double peak = 0;
        for (int i = 0; i < 40 && peak < 0.2; i++)
        {
            await Task.Delay(100);
            var snap = recv.LevelsSnapshot();
            if (snap == null) continue;
            using var doc = JsonDocument.Parse(JsonSerializer.Serialize(snap));
            if (doc.RootElement.TryGetProperty(id, out var e)) peak = Math.Max(peak, e.GetProperty("peak")[0].GetDouble());
        }
        Check(peak >= 0.2, $"{label}: audio tone reached the receiver (peak {peak:0.00}, sent 0.50)");
    }

    private static async Task WaitSinkLive(ProgramSink sink, string label, int timeoutMs = 8000)
    {
        var until = Environment.TickCount64 + timeoutMs;
        while (Environment.TickCount64 < until && sink.State != "live") await Task.Delay(100);
        Check(sink.State == "live", $"{label}: sink state '{sink.State}' (connections {sink.Connections}, sent {sink.FramesSent}, dropped {sink.FramesDropped}, url {sink.Url}){(sink.Error != null ? " error: " + sink.Error : "")}");
    }

    private static async Task<(int w, int h, int r, int g, int b)> Decode(byte[] jpeg)
    {
        using var ms = new InMemoryRandomAccessStream();
        using (var wr = new DataWriter(ms.GetOutputStreamAt(0))) { wr.WriteBytes(jpeg); await wr.StoreAsync(); wr.DetachStream(); }
        ms.Seek(0);
        var dec = await BitmapDecoder.CreateAsync(ms);
        var px = (await dec.GetPixelDataAsync(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Ignore, new BitmapTransform(), ExifOrientationMode.IgnoreExifOrientation, ColorManagementMode.DoNotColorManage)).DetachPixelData();
        int w = (int)dec.PixelWidth, h = (int)dec.PixelHeight, i = ((h * 2 / 3) * w + w / 2) * 4;
        return (w, h, px[i + 2], px[i + 1], px[i]);
    }

    private static void Check(bool ok, string what)
    {
        Console.WriteLine($"{(ok ? "PASS" : "FAIL")} {what}");
        if (!ok) _failures++;
    }

    // ── transports ───────────────────────────────────────────────────────────
    private static async Task RunNdi(string dll)
    {
        Console.WriteLine("── NDI ──");
        var name = $"Plajah Loopback NDI {Environment.ProcessId}";
        using var sink = new NdiSink(new SinkConfig("t_ndi", "ndi", name, 30, 6000), dll);
        using var cts = new CancellationTokenSource();
        sink.Start();
        var pump = Pump(sink, cts.Token);
        using var finder = new NdiFinderService();
        Check(finder.Start(dll), $"NDI finder started ({finder.LastError ?? "ok"})");
        NdiFinderService.Source? src = null;
        for (int i = 0; i < 30 && src == null; i++) { await Task.Delay(300); src = finder.Current.Sources.FirstOrDefault(s => s.Name.EndsWith($"({name})")); }
        Check(src != null, $"NDI: Stage's sender was discovered on the network as '{src?.Name}'");
        if (src != null)
        {
            using var recv = new NdiReceiverService();
            var err = recv.Connect("ndi:test", src.Name, src.Url, dll);
            Check(err == null, $"NDI: receiver connect ({err ?? "ok"})");
            recv.SetAudio("ndi:test", false);
            await WaitPicture(recv, "ndi:test", "NDI");
            await WaitAudio(recv, "ndi:test", "NDI");
            await WaitSinkLive(sink, "NDI");
            recv.Disconnect("ndi:test");
            await Task.Delay(1500);
            Check(sink.State == "waiting" && sink.Connections == 0, $"NDI: after the receiver left the sink reports '{sink.State}' with {sink.Connections} connections");
        }
        cts.Cancel(); await pump;
    }

    private static async Task RunOmt()
    {
        Console.WriteLine("── OMT ──");
        var name = $"Plajah Loopback OMT {Environment.ProcessId}";
        using var sink = new OmtSink(new SinkConfig("t_omt", "omt", name, 30, 6000));
        using var cts = new CancellationTokenSource();
        sink.Start();
        var pump = Pump(sink, cts.Token);
        for (int i = 0; i < 50 && sink.Url == null; i++) await Task.Delay(100);
        Check(sink.Url != null, $"OMT: sender open at {sink.Url} ({sink.Error ?? "ok"})");
        if (sink.Url != null)
        {
            using var recv = new NdiReceiverService();
            var err = recv.ConnectOmt("omt:test", sink.Url);
            Check(err == null, $"OMT: receiver connect ({err ?? "ok"})");
            await WaitPicture(recv, "omt:test", "OMT");
            await WaitAudio(recv, "omt:test", "OMT");
            await WaitSinkLive(sink, "OMT");
        }
        cts.Cancel(); await pump;
    }

    private static async Task RunSrt(string stageMode, string passphrase)
    {
        Console.WriteLine($"── SRT (Stage output = {stageMode}{(passphrase.Length > 0 ? ", encrypted" : "")}) ──");
        int port = stageMode == "listener" ? 9711 : 9712;
        var outEp = new SrtEndpoint(stageMode, "127.0.0.1", port, 120, passphrase, "");
        var inEp = new SrtEndpoint(stageMode == "listener" ? "caller" : "listener", "127.0.0.1", port, 120, passphrase, "");
        using var recv = new NdiReceiverService();
        var id = stageMode == "listener" ? $"srt:call:127.0.0.1:{port}" : $"srt:listen:{port}";
        if (inEp.Mode == "listener") Check(recv.ConnectSrt(id, "loopback in", inEp) == null, "SRT: input listener opened");
        using var sink = new SrtSink(new SinkConfig("t_srt", "srt", "loopback out", 30, 4000), outEp);
        using var cts = new CancellationTokenSource();
        sink.Start();
        var pump = Pump(sink, cts.Token);
        await Task.Delay(1500);
        if (inEp.Mode == "caller") Check(recv.ConnectSrt(id, "loopback in", inEp) == null, "SRT: input caller started");
        await WaitPicture(recv, id, $"SRT {stageMode}", 25000);
        await WaitAudio(recv, id, $"SRT {stageMode}");
        await WaitSinkLive(sink, $"SRT {stageMode}", 10000);
        var st = recv.SrtStats(id);
        Check(st is { Connected: true, Width: 1280, Height: 720 }, $"SRT {stageMode}: srt_stats connected={st?.Connected} {st?.Width}x{st?.Height} {st?.Fps}fps {st?.BitrateMbps}Mbps");

        // Reconnect: kill the sender's ffmpeg mid-stream; the receiver must recover by itself.
        Console.WriteLine($"   restarting the output to test reconnect…");
        cts.Cancel(); await pump; sink.Dispose();
        await Task.Delay(1000);
        Check(recv.SrtStats(id) is { Connected: false }, $"SRT {stageMode}: input reports disconnected after the sender stopped ({recv.SrtStats(id)?.Status})");
        using var sink2 = new SrtSink(new SinkConfig("t_srt2", "srt", "loopback out 2", 30, 4000), outEp);
        using var cts2 = new CancellationTokenSource();
        sink2.Start();
        var pump2 = Pump(sink2, cts2.Token);
        var until = Environment.TickCount64 + 30000;
        while (Environment.TickCount64 < until && recv.SrtStats(id) is not { Connected: true }) await Task.Delay(200);
        Check(recv.SrtStats(id) is { Connected: true }, $"SRT {stageMode}: input reconnected on its own (reconnects={recv.SrtStats(id)?.Reconnects})");
        cts2.Cancel(); await pump2;
        recv.DisconnectSrt(id);
    }
}
