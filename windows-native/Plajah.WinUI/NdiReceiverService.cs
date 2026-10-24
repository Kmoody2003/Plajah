using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using Windows.Graphics.Imaging;
using Windows.Storage.Streams;

namespace Plajah.WinUI;

/// <summary>
/// Receives NDI video + audio for live-input previews and program use.
///
/// Discovery (NdiFinderService) only ever listed senders; nothing pulled their pictures, so Ambo
/// showed a name and a blank tile. Each receiver here keeps the NEWEST frame as a JPEG (scaled to
/// whatever width the page asked for recently — a ~320 px tile, or larger when the input is on
/// Program) for the page to fetch from https://localmedia.plajah/__live, measures audio levels for
/// the tile's meter, and — only when the operator has deliberately turned that input's audio on —
/// hands its sound to the page as PCM. Everything starts muted.
/// </summary>
internal sealed class NdiReceiverService : IDisposable
{
    // ── NDI C API (loaded from the same runtime the finder uses) ──────────────
    [StructLayout(LayoutKind.Sequential)]
    private struct NDIlib_source_t { public IntPtr p_ndi_name; public IntPtr p_url_address; }

    [StructLayout(LayoutKind.Sequential)]
    private struct NDIlib_recv_create_v3_t
    {
        public NDIlib_source_t source_to_connect_to;
        public int color_format;          // 0 = BGRX_BGRA
        public int bandwidth;             // 0 = lowest (preview), 100 = highest
        [MarshalAs(UnmanagedType.I1)] public bool allow_video_fields;
        public IntPtr p_ndi_recv_name;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NDIlib_video_frame_v2_t
    {
        public int xres, yres, FourCC, frame_rate_N, frame_rate_D;
        public float picture_aspect_ratio;
        public int frame_format_type;
        public long timecode;
        public IntPtr p_data;
        public int line_stride_in_bytes;
        public IntPtr p_metadata;
        public long timestamp;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NDIlib_audio_frame_v2_t
    {
        public int sample_rate, no_channels, no_samples;
        public long timecode;
        public IntPtr p_data;               // planar float
        public int channel_stride_in_bytes;
        public IntPtr p_metadata;
        public long timestamp;
    }

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] [return: MarshalAs(UnmanagedType.U1)] private delegate bool InitFn();
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate IntPtr RecvCreateFn(ref NDIlib_recv_create_v3_t c);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate void RecvDestroyFn(IntPtr r);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int CaptureFn(IntPtr r, ref NDIlib_video_frame_v2_t v, ref NDIlib_audio_frame_v2_t a, IntPtr meta, uint timeoutMs);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate void FreeVideoFn(IntPtr r, ref NDIlib_video_frame_v2_t v);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate void FreeAudioFn(IntPtr r, ref NDIlib_audio_frame_v2_t a);

    private const int FrameVideo = 1, FrameAudio = 2, FrameError = 4;

    private IntPtr _lib;
    private RecvCreateFn? _create; private RecvDestroyFn? _destroy; private CaptureFn? _capture; private FreeVideoFn? _freeVideo; private FreeAudioFn? _freeAudio;
    private readonly object _gate = new();
    private readonly ConcurrentDictionary<string, Receiver> _receivers = new();

    /// <summary>Sends a JSON string to the page (marshalled to the UI thread by the caller).</summary>
    public Action<string>? Post { get; set; }
    public string? LastError { get; private set; }

    private bool EnsureLoaded(string dllPath)
    {
        lock (_gate)
        {
            if (_create != null) return true;
            if (string.IsNullOrEmpty(dllPath) || !System.IO.File.Exists(dllPath)) { LastError = "The NDI Runtime isn't installed on this PC — install NDI Tools (or the NDI Runtime) to see NDI video."; return false; }
            if (!NativeLibrary.TryLoad(dllPath, out _lib)) { LastError = $"Could not load {dllPath}."; return false; }
            T Fn<T>(string n) where T : Delegate => Marshal.GetDelegateForFunctionPointer<T>(NativeLibrary.GetExport(_lib, n));
            if (!Fn<InitFn>("NDIlib_initialize")()) { LastError = "NDIlib_initialize failed."; return false; }
            _create = Fn<RecvCreateFn>("NDIlib_recv_create_v3");
            _destroy = Fn<RecvDestroyFn>("NDIlib_recv_destroy");
            _capture = Fn<CaptureFn>("NDIlib_recv_capture_v2");
            _freeVideo = Fn<FreeVideoFn>("NDIlib_recv_free_video_v2");
            _freeAudio = Fn<FreeAudioFn>("NDIlib_recv_free_audio_v2");
            return true;
        }
    }

    /// <summary>Start receiving `id` (idempotent). Returns null on success, or why it can't.</summary>
    public string? Connect(string id, string ndiName, string? url, string dllPath)
    {
        if (_receivers.TryGetValue(id, out var existing)) { existing.Touch(); return null; }
        if (!EnsureLoaded(dllPath)) return LastError;
        var r = new Receiver(this, id, ndiName, url);
        if (!_receivers.TryAdd(id, r)) { r.Dispose(); return null; }
        r.Start();
        return null;
    }

    /// <summary>
    /// Start receiving an Open Media Transport source (idempotent). `address` is the source's full
    /// name or an omt://host:port URL. Uses the official libomtnet library (MIT).
    /// </summary>
    public string? ConnectOmt(string id, string address)
    {
        if (_receivers.TryGetValue(id, out var existing)) { existing.Touch(); return null; }
        var r = new Receiver(this, id, address, null, omt: true);
        if (!_receivers.TryAdd(id, r)) { r.Dispose(); return null; }
        r.Start();
        return null;
    }

    /// <summary>
    /// Start an SRT input (listener or caller) through an ffmpeg+libsrt child. Unlike NDI/OMT tiles this
    /// receiver is PINNED: it keeps listening / reconnecting while nothing shows it, because an SRT
    /// encoder can only be noticed by having the port open. It ends with DisconnectSrt.
    /// </summary>
    public string? ConnectSrt(string id, string name, SrtEndpoint ep)
    {
        if (!FfmpegLocator.SrtAvailable) return FfmpegLocator.SrtReason;
        if (_receivers.TryRemove(id, out var old)) old.Dispose();   // settings may have changed: reopen
        var r = new Receiver(this, id, name, null, srt: ep);
        if (!_receivers.TryAdd(id, r)) { r.Dispose(); return null; }
        r.Start();
        return null;
    }

    public sealed record SrtSession(string StreamId, string Name, string Mode, string Host, int Port, int LatencyMs, bool Encrypted,
        string Status, bool Connected, int Width, int Height, double Fps, double BitrateMbps, int Reconnects, string? Error);

    public IReadOnlyList<SrtSession> SrtSessions()
    {
        var list = new List<SrtSession>();
        foreach (var (id, r) in _receivers) if (r.Srt is { } ep) list.Add(r.SrtSnapshot(id, ep));
        return list;
    }

    public SrtSession? SrtStats(string id) =>
        _receivers.TryGetValue(id, out var r) && r.Srt is { } ep ? r.SrtSnapshot(id, ep) : null;

    public void Disconnect(string id)
    {
        // A tile letting go of an SRT input must not close the port; only DisconnectSrt does.
        if (_receivers.TryGetValue(id, out var r) && r.Srt != null) return;
        if (_receivers.TryRemove(id, out r)) r.Dispose();
    }

    public bool DisconnectSrt(string id)
    {
        if (!_receivers.TryRemove(id, out var r)) return false;
        r.Dispose();
        return true;
    }

    public void SetAudio(string id, bool enabled)
    {
        if (_receivers.TryGetValue(id, out var r)) r.AudioOut = enabled;
    }

    /// <summary>Newest frame as JPEG (scaled to `width`), or null before the first frame.</summary>
    public byte[]? LatestJpeg(string id, int width)
    {
        if (!_receivers.TryGetValue(id, out var r)) return null;
        r.Touch();
        r.RequestWidth(width);
        return Volatile.Read(ref r.Jpeg);
    }

    /// <summary>Levels + status of every receiver, for the page's meters (called ~10x/s).</summary>
    public object? LevelsSnapshot()
    {
        if (_receivers.IsEmpty) return null;
        var levels = new Dictionary<string, object>();
        foreach (var (id, r) in _receivers)
        {
            levels[id] = new { peak = new[] { r.PeakL, r.PeakR }, rms = new[] { r.RmsL, r.RmsR }, hasAudio = r.HasAudio, status = r.Status, error = r.Error, width = r.SrcW, height = r.SrcH };
            r.PeakL *= 0.6f; r.PeakR *= 0.6f; // meter fall-off between snapshots
        }
        return levels;
    }

    /// <summary>Drop receivers nobody has looked at for a while (the page went away).</summary>
    public void Sweep()
    {
        foreach (var (id, r) in _receivers)
            if (r.Srt == null && r.IdleMs > 30000) Disconnect(id);
    }

    public void Dispose()
    {
        foreach (var id in _receivers.Keys) if (_receivers.TryRemove(id, out var r)) r.Dispose();
    }

    private sealed class Receiver : IDisposable
    {
        private readonly NdiReceiverService _svc;
        private readonly string _id, _name; private readonly string? _url;
        private readonly bool _omt;
        public readonly SrtEndpoint? Srt;
        private System.Diagnostics.Process? _ff;
        private volatile bool _srtConnected;
        private int _srtReconnects;
        private double _srtFps;
        private long _srtBytes, _srtBytesAt;
        private double _srtMbps;
        private Thread? _thread;
        private volatile bool _stop;
        private long _touched = Environment.TickCount64;
        private int _wantWidth = 320;
        private long _wantWidthAt = Environment.TickCount64;
        private long _lastEncode;
        private int _encoding;

        public byte[]? Jpeg;
        public volatile string Status = "connecting";
        public volatile string? Error;
        public volatile bool AudioOut;
        public volatile bool HasAudio;
        public float PeakL, PeakR, RmsL, RmsR;
        public int SrcW, SrcH;
        private readonly List<short> _pcm = new();
        private int _pcmRate = 48000;
        private long _lastPcmPost;

        public Receiver(NdiReceiverService svc, string id, string name, string? url, bool omt = false, SrtEndpoint? srt = null) { _svc = svc; _id = id; _name = name; _url = url; _omt = omt; Srt = srt; }
        public void Touch() => Interlocked.Exchange(ref _touched, Environment.TickCount64);
        public long IdleMs => Environment.TickCount64 - Interlocked.Read(ref _touched);
        public void RequestWidth(int w)
        {
            w = Math.Clamp(w <= 0 ? 320 : w, 160, 1920);
            var now = Environment.TickCount64;
            // The largest width asked for in the last 2 s wins (a Program request outranks tiles).
            if (w >= _wantWidth || now - _wantWidthAt > 2000) { _wantWidth = w; _wantWidthAt = now; }
        }

        public void Start()
        {
            _thread = new Thread(Srt != null ? RunSrt : _omt ? RunOmt : Run) { IsBackground = true, Name = (Srt != null ? "SRT recv " : _omt ? "OMT recv " : "NDI recv ") + _name };
            _thread.Start();
        }

        private void Run()
        {
            IntPtr namePtr = Marshal.StringToHGlobalAnsi(_name);
            IntPtr urlPtr = _url != null ? Marshal.StringToHGlobalAnsi(_url) : IntPtr.Zero;
            IntPtr recvName = Marshal.StringToHGlobalAnsi("Plajah Ambo");
            IntPtr recv = IntPtr.Zero;
            try
            {
                var settings = new NDIlib_recv_create_v3_t
                {
                    source_to_connect_to = new NDIlib_source_t { p_ndi_name = namePtr, p_url_address = urlPtr },
                    color_format = 0,           // BGRX/BGRA
                    bandwidth = 100,            // full quality: the same receiver feeds Program
                    allow_video_fields = false,
                    p_ndi_recv_name = recvName,
                };
                recv = _svc._create!(ref settings);
                if (recv == IntPtr.Zero) { Status = "error"; Error = "Could not open this NDI source."; return; }

                while (!_stop)
                {
                    var v = new NDIlib_video_frame_v2_t();
                    var a = new NDIlib_audio_frame_v2_t();
                    int t = _svc._capture!(recv, ref v, ref a, IntPtr.Zero, 500);
                    if (t == FrameVideo)
                    {
                        try { OnVideo(v); } finally { _svc._freeVideo!(recv, ref v); }
                    }
                    else if (t == FrameAudio)
                    {
                        try { OnAudio(a); } finally { _svc._freeAudio!(recv, ref a); }
                    }
                    else if (t == FrameError)
                    {
                        Status = "error"; Error = "The NDI source disconnected.";
                        Thread.Sleep(500);
                    }
                }
            }
            catch (Exception ex) { Status = "error"; Error = ex.Message; }
            finally
            {
                if (recv != IntPtr.Zero) try { _svc._destroy!(recv); } catch { }
                Marshal.FreeHGlobal(namePtr);
                if (urlPtr != IntPtr.Zero) Marshal.FreeHGlobal(urlPtr);
                Marshal.FreeHGlobal(recvName);
            }
        }

        /// <summary>Open Media Transport: same loop shape as NDI, frames from libomtnet.</summary>
        private void RunOmt()
        {
            libomtnet.OMTReceive? recv = null;
            try
            {
                recv = new libomtnet.OMTReceive(_name, libomtnet.OMTFrameType.Video | libomtnet.OMTFrameType.Audio,
                    libomtnet.OMTPreferredVideoFormat.BGRA, libomtnet.OMTReceiveFlags.None);
                var frame = new libomtnet.OMTMediaFrame();
                while (!_stop)
                {
                    if (!recv.Receive(libomtnet.OMTFrameType.Video | libomtnet.OMTFrameType.Audio, 500, ref frame))
                    {
                        if (!recv.IsConnected() && Status == "live") { Status = "connecting"; }
                        continue;
                    }
                    if (frame.Type == libomtnet.OMTFrameType.Video)
                    {
                        if (frame.Codec == (int)libomtnet.OMTCodec.BGRA)
                            OnBgra(frame.Data, frame.Width, frame.Height, frame.Stride);
                        else { Status = "error"; Error = "This OMT source sends a video format Plajah can't show yet."; }
                    }
                    else if (frame.Type == libomtnet.OMTFrameType.Audio && frame.Codec == (int)libomtnet.OMTCodec.FPA1)
                    {
                        OnPlanarAudio(frame.Data, frame.Channels, frame.SamplesPerChannel, frame.SamplesPerChannel, frame.SampleRate);
                    }
                }
            }
            catch (Exception ex) { Status = "error"; Error = ex is DllNotFoundException ? "The OMT codec (libvmx.dll) is missing from this install." : ex.Message; }
            finally { try { recv?.Dispose(); } catch { } }
        }

        /// <summary>
        /// SRT: ffmpeg opens the srt:// URL (listening, or calling with retries), decodes whatever the encoder
        /// sends (H.264/HEVC/MPEG-2 in TS), and writes MJPEG frames to stdout — exactly what /__live serves,
        /// so there is no second encode — plus 48 kHz stereo float PCM to a named pipe. When the stream ends
        /// (encoder stopped, network lost) ffmpeg exits and we reopen with backoff.
        /// </summary>
        private void RunSrt()
        {
            var ep = Srt!;
            int[] backoff = { 500, 1000, 2000, 4000, 8000 };
            int attempt = 0;
            bool withAudio = true;
            while (!_stop)
            {
                var log = new System.Text.StringBuilder();
                bool sawFrame = false;
                System.IO.Pipes.NamedPipeServerStream? apipe = null;
                try
                {
                    Status = ep.Mode == "listener" ? "listening" : "connecting";
                    var pipeName = $"plajah-srt-in-{Environment.ProcessId}-{Guid.NewGuid():N}";
                    if (withAudio) apipe = new System.IO.Pipes.NamedPipeServerStream(pipeName, System.IO.Pipes.PipeDirection.In, 1, System.IO.Pipes.PipeTransmissionMode.Byte, System.IO.Pipes.PipeOptions.Asynchronous, 1 << 16, 0);
                    var url = SrtSink.BuildUrl(ep, forInput: true);
                    var args = "-hide_banner -loglevel info -nostats -fflags nobuffer -flags low_delay " +
                        $"-i {FfmpegLocator.Q(url)} " +
                        "-map 0:v:0 -vf \"scale='min(1280,iw)':-2\" -c:v mjpeg -q:v 4 -f image2pipe pipe:1" +
                        (withAudio ? $" -map 0:a:0 -ac 2 -ar 48000 -f f32le {FfmpegLocator.Q(@"\\.\pipe\" + pipeName)}" : "");
                    _ff = FfmpegLocator.Start(args, stdin: false, stdout: true);
                    _ff.ErrorDataReceived += (_, e) =>
                    {
                        if (e.Data == null) return;
                        lock (log) { log.AppendLine(e.Data); if (log.Length > 8000) log.Remove(0, log.Length - 8000); }
                        // "Stream #0:0[0x100]: Video: h264 (High) ..., 1920x1080 ..., 29.97 fps"
                        var m = System.Text.RegularExpressions.Regex.Match(e.Data, @"Stream #0:\d+.*Video:.*?(\d{2,5})x(\d{2,5}).*?([\d.]+) fps");
                        if (m.Success) { SrcW = int.Parse(m.Groups[1].Value); SrcH = int.Parse(m.Groups[2].Value); double.TryParse(m.Groups[3].Value, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out _srtFps); }
                    };
                    _ff.BeginErrorReadLine();
                    if (apipe != null) { var ap = apipe; new Thread(() => PumpSrtAudio(ap)) { IsBackground = true, Name = "SRT recv audio" }.Start(); }

                    var stdout = _ff.StandardOutput.BaseStream;
                    var buf = new byte[1 << 20];
                    var frame = new System.IO.MemoryStream(1 << 18);
                    int n; byte prev = 0; bool inFrame = false;
                    _srtBytesAt = Environment.TickCount64; _srtBytes = 0;
                    while (!_stop && (n = stdout.Read(buf, 0, buf.Length)) > 0)
                    {
                        for (int i = 0; i < n; i++)
                        {
                            byte b = buf[i];
                            if (!inFrame) { if (prev == 0xFF && b == 0xD8) { inFrame = true; frame.SetLength(0); frame.WriteByte(0xFF); frame.WriteByte(0xD8); } }
                            else
                            {
                                frame.WriteByte(b);
                                // Entropy-coded data stuffs 0xFF with 0x00, so FFD9 only ever means end-of-image.
                                if (prev == 0xFF && b == 0xD9)
                                {
                                    inFrame = false;
                                    Volatile.Write(ref Jpeg, frame.ToArray());
                                    if (!sawFrame) { sawFrame = true; attempt = 0; }
                                    _srtConnected = true; Status = "live"; Error = null;
                                    b = 0;
                                }
                            }
                            prev = b;
                        }
                        _srtBytes += n;
                        var now = Environment.TickCount64;
                        if (now - _srtBytesAt >= 1000) { _srtMbps = _srtBytes * 8 / 1000.0 / (now - _srtBytesAt) / 1000.0; _srtBytes = 0; _srtBytesAt = now; }
                    }
                    try { _ff.WaitForExit(2000); } catch { }
                }
                catch (Exception ex) { Error = ex.Message; }
                finally
                {
                    try { if (_ff is { HasExited: false }) _ff.Kill(true); } catch { }
                    try { _ff?.Dispose(); } catch { }
                    _ff = null;
                    try { apipe?.Dispose(); } catch { }
                }
                if (_stop) break;

                string text; lock (log) text = log.ToString().ToLowerInvariant();
                if (withAudio && (text.Contains("does not contain any stream") || text.Contains("matches no streams")))
                {
                    // Video-only encoder: reopen without the audio output (a calling encoder reconnects on its own).
                    withAudio = false; attempt = 0; continue;
                }
                bool was = _srtConnected;
                _srtConnected = false; _srtMbps = 0;
                if (was || sawFrame) _srtReconnects++;
                Error = text.Contains("passphrase") || text.Contains("rejected") || text.Contains("bad secret") ? "The SRT sender was rejected — check the passphrase."
                    : text.Contains("bind") || text.Contains("address already in use") ? $"Port {ep.Port} is already in use on this PC."
                    : text.Contains("connection setup failure") || text.Contains("timed out") || text.Contains("refused") ? (ep.Mode == "caller" ? $"No SRT sender answered at {ep.Host}:{ep.Port}." : null)
                    : was ? "The SRT stream ended; waiting for it again." : Error;
                Status = "retrying";
                // A listener that just lost its encoder reopens the port at once; failures back off.
                int wait = sawFrame && ep.Mode == "listener" ? 200 : backoff[Math.Min(attempt++, backoff.Length - 1)];
                var until = Environment.TickCount64 + wait;
                while (!_stop && Environment.TickCount64 < until) Thread.Sleep(50);
                if (sawFrame) withAudio = true;
            }
            Status = "stopped";
        }

        private void PumpSrtAudio(System.IO.Pipes.NamedPipeServerStream pipe)
        {
            try
            {
                pipe.WaitForConnection();
                var buf = new byte[960 * 8]; // 20 ms of stereo f32
                int have = 0;
                while (!_stop)
                {
                    int n = pipe.Read(buf, have, buf.Length - have);
                    if (n <= 0) break;
                    have += n;
                    int frames = have / 8;
                    if (frames < 240 && have < buf.Length) continue;
                    var l = new float[frames]; var r = new float[frames];
                    for (int i = 0; i < frames; i++) { l[i] = BitConverter.ToSingle(buf, i * 8); r[i] = BitConverter.ToSingle(buf, i * 8 + 4); }
                    int used = frames * 8;
                    System.Buffer.BlockCopy(buf, used, buf, 0, have - used); have -= used;
                    OnStereo(l, r, frames, 48000);
                }
            }
            catch { }
        }

        public SrtSession SrtSnapshot(string id, SrtEndpoint ep) => new(
            id, _name, ep.Mode, ep.Mode == "listener" ? "0.0.0.0" : ep.Host, ep.Port, ep.LatencyMs, ep.Passphrase.Length > 0,
            _srtConnected ? "Connected - receiving" : ep.Mode == "listener" ? (Status == "retrying" ? "Listening again" : "Listening - waiting for an encoder") : (Status == "retrying" ? "Retrying" : "Calling"),
            _srtConnected, SrcW, SrcH, _srtFps, Math.Round(_srtMbps, 2), _srtReconnects, Error);

        private void OnVideo(NDIlib_video_frame_v2_t v) => OnBgra(v.p_data, v.xres, v.yres, v.line_stride_in_bytes);

        private void OnBgra(IntPtr data, int srcW, int srcH, int srcStride)
        {
            Status = "live"; Error = null;
            SrcW = srcW; SrcH = srcH;
            if (data == IntPtr.Zero || srcW <= 0 || srcH <= 0) return;
            var now = Environment.TickCount64;
            // Tiles refresh ~10 fps; a large (Program) request runs at up to 30 fps.
            int interval = _wantWidth > 480 ? 33 : 100;
            if (now - _lastEncode < interval || Interlocked.CompareExchange(ref _encoding, 1, 0) != 0) return;
            _lastEncode = now;

            int w = srcW, h = srcH, stride = srcStride > 0 ? srcStride : w * 4;
            var pixels = new byte[w * h * 4];
            for (int y = 0; y < h; y++) Marshal.Copy(IntPtr.Add(data, y * stride), pixels, y * w * 4, w * 4);
            int outW = Math.Min(_wantWidth, w);
            int outH = Math.Max(1, (int)Math.Round((double)h * outW / w));
            _ = Task.Run(async () =>
            {
                try
                {
                    using var ms = new InMemoryRandomAccessStream();
                    var enc = await BitmapEncoder.CreateAsync(BitmapEncoder.JpegEncoderId, ms);
                    enc.SetPixelData(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Ignore, (uint)w, (uint)h, 96, 96, pixels);
                    enc.BitmapTransform.ScaledWidth = (uint)outW;
                    enc.BitmapTransform.ScaledHeight = (uint)outH;
                    enc.BitmapTransform.InterpolationMode = BitmapInterpolationMode.Linear;
                    await enc.FlushAsync();
                    var bytes = new byte[ms.Size];
                    using (var reader = new DataReader(ms.GetInputStreamAt(0)))
                    {
                        await reader.LoadAsync((uint)ms.Size);
                        reader.ReadBytes(bytes);
                    }
                    Volatile.Write(ref Jpeg, bytes);
                }
                catch { /* skip this frame */ }
                finally { Interlocked.Exchange(ref _encoding, 0); }
            });
        }

        private void OnAudio(NDIlib_audio_frame_v2_t a) =>
            OnPlanarAudio(a.p_data, a.no_channels, a.no_samples, a.channel_stride_in_bytes > 0 ? a.channel_stride_in_bytes / 4 : a.no_samples, a.sample_rate);

        /// <summary>Planar float audio (NDI and OMT FPA1 both decode to this): meter, and PCM out only when switched on.</summary>
        private void OnPlanarAudio(IntPtr data, int chs, int n, int strideFloats, int sampleRate)
        {
            if (data == IntPtr.Zero || n <= 0 || chs <= 0) return;
            var left = new float[n];
            var right = new float[n];
            Marshal.Copy(data, left, 0, n);
            if (chs > 1) Marshal.Copy(IntPtr.Add(data, strideFloats * 4), right, 0, n); else Array.Copy(left, right, n);
            OnStereo(left, right, n, sampleRate);
        }

        private void OnStereo(float[] left, float[] right, int n, int sampleRate)
        {
            HasAudio = true;

            float pl = 0, pr = 0; double sl = 0, sr = 0;
            for (int i = 0; i < n; i++)
            {
                float l = Math.Abs(left[i]), r = Math.Abs(right[i]);
                if (l > pl) pl = l; if (r > pr) pr = r;
                sl += left[i] * left[i]; sr += right[i] * right[i];
            }
            PeakL = Math.Max(PeakL, pl); PeakR = Math.Max(PeakR, pr);
            RmsL = (float)Math.Sqrt(sl / n); RmsR = (float)Math.Sqrt(sr / n);

            if (!AudioOut) { lock (_pcm) _pcm.Clear(); return; }
            // Sound only leaves this receiver when the operator turned it on for this input.
            lock (_pcm)
            {
                _pcmRate = sampleRate > 0 ? sampleRate : 48000;
                for (int i = 0; i < n; i++)
                {
                    _pcm.Add((short)Math.Clamp(left[i] * 32767f, -32768f, 32767f));
                    _pcm.Add((short)Math.Clamp(right[i] * 32767f, -32768f, 32767f));
                }
                var now = Environment.TickCount64;
                if (now - _lastPcmPost < 40 && _pcm.Count < _pcmRate) return;
                _lastPcmPost = now;
                var bytes = new byte[_pcm.Count * 2];
                System.Buffer.BlockCopy(_pcm.ToArray(), 0, bytes, 0, bytes.Length);
                _pcm.Clear();
                var json = System.Text.Json.JsonSerializer.Serialize(new { type = "LIVE_INPUT_AUDIO", id = _id, sampleRate = _pcmRate, channels = 2, pcm = Convert.ToBase64String(bytes) });
                _svc.Post?.Invoke(json);
            }
        }

        public void Dispose()
        {
            _stop = true;
            try { if (_ff is { HasExited: false }) _ff.Kill(true); } catch { }
            try { _thread?.Join(1500); } catch { }
        }
    }
}
