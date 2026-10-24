using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace Plajah.WinUI;

// The network output sinks behind ProgramOutputHub (kept apart from the WebView2-bound hub so the
// transport loopback harness in windows-native/tools can compile and drive them headless).

internal sealed record SinkConfig(string Id, string Kind, string Name, double Fps, int BitrateKbps);
internal sealed record SrtEndpoint(string Mode, string Host, int Port, int LatencyMs, string Passphrase, string StreamId);

internal sealed class ProgramFrame
{
    public readonly byte[] Data;
    public int Width, Height, Stride;
    private int _refs;
    private readonly FramePool _pool;
    public ProgramFrame(FramePool pool, int bytes) { _pool = pool; Data = GC.AllocateUninitializedArray<byte>(bytes, pinned: true); }
    public void Reset() => _refs = 1;
    public void AddRef() => Interlocked.Increment(ref _refs);
    public void Release() { if (Interlocked.Decrement(ref _refs) == 0) _pool.Return(this); }
}

/// <summary>Pinned, reused frame buffers (8 MB each at 1080p — never per-frame allocations).</summary>
internal sealed class FramePool
{
    private readonly ConcurrentBag<ProgramFrame> _free = new();
    public ProgramFrame Rent(int bytes)
    {
        while (_free.TryTake(out var f)) if (f.Data.Length == bytes) { f.Reset(); return f; }
        var n = new ProgramFrame(this, bytes); n.Reset(); return n;
    }
    public void Return(ProgramFrame f) { if (_free.Count < 12) _free.Add(f); }
}

/// <summary>One network output: its own thread, newest-frame slot, audio queue, reopen-with-backoff.</summary>
internal abstract class ProgramSink : IDisposable
{
    private static readonly int[] Backoff = { 1000, 2000, 4000, 8000, 15000 };

    protected readonly SinkConfig Cfg;
    private ProgramFrame? _pending;
    private readonly AutoResetEvent _signal = new(false);
    private readonly ConcurrentQueue<short[]> _audio = new();
    private Thread? _thread;
    private volatile bool _stop;

    public volatile string State = "starting";
    public volatile string? Error;
    public volatile string? Url;
    public int Attempt;
    public int Connections;
    public double BitrateKbps;
    public long FramesSent, FramesDropped;
    public string? Detail;

    protected ProgramSink(SinkConfig cfg) { Cfg = cfg; }
    protected bool Stopping => _stop;

    public void Start()
    {
        _thread = new Thread(Run) { IsBackground = true, Name = $"{Cfg.Kind.ToUpperInvariant()} out {Cfg.Name}" };
        _thread.Start();
    }

    public void Offer(ProgramFrame f)
    {
        f.AddRef();
        var old = Interlocked.Exchange(ref _pending, f);
        if (old != null) { old.Release(); Interlocked.Increment(ref FramesDropped); }
        _signal.Set();
    }

    public void OfferAudio(short[] pcm, int rate)
    {
        if (rate != 48000) return; // the page always resamples program audio to 48 kHz
        while (_audio.Count > 50) _audio.TryDequeue(out _); // > ~1 s backlog: the sink stalled, drop the oldest
        _audio.Enqueue(pcm);
    }

    private void Run()
    {
        bool open = false;
        while (!_stop)
        {
            if (!open)
            {
                try { State = "starting"; Open(); open = true; Attempt = 0; Error = null; }
                catch (Exception ex)
                {
                    try { Close(); } catch { }
                    if (_stop) break;
                    Attempt++;
                    State = Fatal(ex) ? "error" : "retrying";
                    Error = Explain(ex);
                    Sleep(Backoff[Math.Min(Attempt - 1, Backoff.Length - 1)]);
                    continue;
                }
            }
            _signal.WaitOne(200);
            if (_stop) break;
            var f = Interlocked.Exchange(ref _pending, null);
            try
            {
                if (f != null) { SendVideo(f); Interlocked.Increment(ref FramesSent); }
                // Only what was queued now: a sink whose audio send paces itself must not starve video.
                for (int k = _audio.Count; k > 0 && _audio.TryDequeue(out var pcm); k--) SendAudio(pcm);
                Tick();
            }
            catch (Exception ex)
            {
                if (_stop) break;
                try { Close(); } catch { }
                open = false;
                Attempt++;
                State = "retrying";
                Error = Explain(ex);
                Sleep(Backoff[Math.Min(Attempt - 1, Backoff.Length - 1)]);
            }
            finally { f?.Release(); }
        }
        try { Close(); } catch { }
        State = "stopped";
    }

    private void Sleep(int ms) { var until = Environment.TickCount64 + ms; while (!_stop && Environment.TickCount64 < until) Thread.Sleep(50); }

    protected abstract void Open();
    protected abstract void SendVideo(ProgramFrame f);
    protected abstract void SendAudio(short[] pcm);
    protected virtual void Tick() { }
    protected abstract void Close();
    /// <summary>A failure that retrying will not fix (missing runtime) shows as error, not retrying.</summary>
    protected virtual bool Fatal(Exception ex) => ex is DllNotFoundException or EntryPointNotFoundException or BadImageFormatException;
    protected virtual string Explain(Exception ex) => ex.Message;

    public object Snapshot() => new
    {
        id = Cfg.Id, kind = Cfg.Kind, name = Cfg.Name, state = State, error = Error, url = Url, attempt = Attempt,
        connections = Connections, bitrateKbps = Math.Round(BitrateKbps), framesSent = Interlocked.Read(ref FramesSent),
        droppedFrames = Interlocked.Read(ref FramesDropped), detail = Detail,
    };

    public void Dispose()
    {
        _stop = true;
        _signal.Set();
        Abort();
        try { _thread?.Join(3000); } catch { }
        Interlocked.Exchange(ref _pending, null)?.Release();
    }

    /// <summary>Unblock a thread stuck in a blocking write (SRT listener waiting for a caller).</summary>
    protected virtual void Abort() { }
}

// ── NDI (NewTek/Vizrt NDI runtime, same DLL the finder/receiver load) ──────
internal sealed class NdiSink : ProgramSink
{
    [StructLayout(LayoutKind.Sequential)]
    private struct NDIlib_send_create_t
    {
        public IntPtr p_ndi_name;
        public IntPtr p_groups;
        [MarshalAs(UnmanagedType.I1)] public bool clock_video;
        [MarshalAs(UnmanagedType.I1)] public bool clock_audio;
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
    private struct NDIlib_audio_frame_interleaved_16s_t
    {
        public int sample_rate, no_channels, no_samples;
        public long timecode;
        public int reference_level;
        public IntPtr p_data;
    }
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] [return: MarshalAs(UnmanagedType.U1)] private delegate bool InitFn();
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate IntPtr CreateFn(ref NDIlib_send_create_t c);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate void DestroyFn(IntPtr s);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate void SendVideoFn(IntPtr s, ref NDIlib_video_frame_v2_t f);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate void SendAudioFn(IntPtr s, ref NDIlib_audio_frame_interleaved_16s_t f);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int ConnectionsFn(IntPtr s, uint timeoutMs);

    private const int FourCC_BGRX = 0x58524742; // 'B','G','R','X' — Program has no alpha, BGRX compresses better
    private const long TimecodeSynthesize = long.MaxValue;

    private readonly string _dll;
    private IntPtr _lib, _send, _namePtr;
    private CreateFn? _create; private DestroyFn? _destroy; private SendVideoFn? _video; private SendAudioFn? _audio; private ConnectionsFn? _conns;
    private long _lastPoll;

    public NdiSink(SinkConfig cfg, string dllPath) : base(cfg) { _dll = dllPath; }

    protected override void Open()
    {
        if (string.IsNullOrEmpty(_dll) || !File.Exists(_dll)) throw new DllNotFoundException("The NDI Runtime isn't installed on this PC — install NDI Tools (or the NDI Runtime) to send NDI.");
        if (_lib == IntPtr.Zero)
        {
            if (!NativeLibrary.TryLoad(_dll, out _lib)) throw new DllNotFoundException($"Could not load {_dll}.");
            T Fn<T>(string n) where T : Delegate => Marshal.GetDelegateForFunctionPointer<T>(NativeLibrary.GetExport(_lib, n));
            if (!Fn<InitFn>("NDIlib_initialize")()) throw new DllNotFoundException("NDIlib_initialize failed (this CPU is not supported by the NDI runtime).");
            _create = Fn<CreateFn>("NDIlib_send_create");
            _destroy = Fn<DestroyFn>("NDIlib_send_destroy");
            _video = Fn<SendVideoFn>("NDIlib_send_send_video_v2");
            _audio = Fn<SendAudioFn>("NDIlib_util_send_send_audio_interleaved_16s");
            _conns = Fn<ConnectionsFn>("NDIlib_send_get_no_connections");
        }
        _namePtr = Marshal.StringToCoTaskMemUTF8(Cfg.Name);
        var c = new NDIlib_send_create_t { p_ndi_name = _namePtr, p_groups = IntPtr.Zero, clock_video = false, clock_audio = false };
        _send = _create!(ref c);
        if (_send == IntPtr.Zero) throw new InvalidOperationException("NDIlib_send_create failed (is another sender already using this name?).");
        Url = $"ndi://{System.Net.Dns.GetHostName().ToUpperInvariant()} ({Cfg.Name})";
        State = "waiting";
        Detail = "Announced on the network; no receivers yet";
    }

    protected override unsafe void SendVideo(ProgramFrame f)
    {
        fixed (byte* p = f.Data)
        {
            var v = new NDIlib_video_frame_v2_t
            {
                xres = f.Width, yres = f.Height, FourCC = FourCC_BGRX,
                frame_rate_N = (int)Math.Round(Cfg.Fps * 1000), frame_rate_D = 1000,
                picture_aspect_ratio = 0f,              // 0 = square pixels (xres/yres)
                frame_format_type = 1,                  // progressive
                timecode = TimecodeSynthesize, p_data = (IntPtr)p, line_stride_in_bytes = f.Stride,
            };
            _video!(_send, ref v);                      // synchronous: the buffer is free when this returns
        }
    }

    protected override unsafe void SendAudio(short[] pcm)
    {
        fixed (short* p = pcm)
        {
            var a = new NDIlib_audio_frame_interleaved_16s_t { sample_rate = 48000, no_channels = 2, no_samples = pcm.Length / 2, timecode = TimecodeSynthesize, reference_level = 0, p_data = (IntPtr)p };
            _audio!(_send, ref a);
        }
    }

    protected override void Tick()
    {
        var now = Environment.TickCount64;
        if (now - _lastPoll < 500) return;
        _lastPoll = now;
        Connections = _conns!(_send, 0);
        State = Connections > 0 ? "live" : "waiting";
        Detail = Connections > 0 ? $"{Connections} receiver{(Connections == 1 ? "" : "s")} connected" : "Announced on the network; no receivers yet";
    }

    protected override void Close()
    {
        if (_send != IntPtr.Zero) { try { _destroy?.Invoke(_send); } catch { } _send = IntPtr.Zero; }
        if (_namePtr != IntPtr.Zero) { Marshal.FreeCoTaskMem(_namePtr); _namePtr = IntPtr.Zero; }
        Connections = 0;
    }
}

// ── OMT (Open Media Transport, official libomtnet) ─────────────────────────
internal sealed class OmtSink : ProgramSink
{
    private libomtnet.OMTSend? _send;
    private long _lastPoll;
    private float[] _planar = Array.Empty<float>();
    // Our own timestamps (100 ns units, one clock for both): with -1 OMT throttles each Send to real
    // time, which serialised video behind audio on this one thread.
    private readonly Stopwatch _clock = Stopwatch.StartNew();
    private long _audioStart = -1, _audioSamples;
    private long Now100ns => _clock.ElapsedTicks * 10_000_000 / Stopwatch.Frequency;

    public OmtSink(SinkConfig cfg) : base(cfg) { }

    protected override void Open()
    {
        _send = new libomtnet.OMTSend(Cfg.Name, libomtnet.OMTQuality.Default);
        try { _send.SetSenderInformation(new libomtnet.OMTSenderInfo("Plajah Stage", "Plajah", typeof(OmtSink).Assembly.GetName().Version?.ToString() ?? "1.0")); } catch { }
        Url = _send.URL;
        State = "waiting";
        Detail = $"Announced at {_send.Address}; no receivers yet";
    }

    protected override void SendVideo(ProgramFrame f)
    {
        var h = GCHandle.Alloc(f.Data, GCHandleType.Pinned);
        try
        {
            var m = new libomtnet.OMTMediaFrame
            {
                Type = libomtnet.OMTFrameType.Video, Codec = (int)libomtnet.OMTCodec.BGRA,
                Width = f.Width, Height = f.Height, Stride = f.Stride,
                FrameRateN = (int)Math.Round(Cfg.Fps * 1000), FrameRateD = 1000,
                AspectRatio = (float)f.Width / f.Height, ColorSpace = libomtnet.OMTColorSpace.BT709,
                Flags = libomtnet.OMTVideoFlags.None, Timestamp = Now100ns,
                Data = h.AddrOfPinnedObject(), DataLength = f.Stride * f.Height,
            };
            _send!.Send(m);
        }
        finally { h.Free(); }
    }

    protected override void SendAudio(short[] pcm)
    {
        int n = pcm.Length / 2;
        // Audio time runs on sample count from the first chunk; re-anchor if it drifts > 200 ms from the clock.
        long ts = _audioStart < 0 ? -1 : _audioStart + _audioSamples * 10_000_000 / 48000;
        if (ts < 0 || Math.Abs(ts - Now100ns) > 2_000_000) { _audioStart = Now100ns; _audioSamples = 0; ts = _audioStart; }
        _audioSamples += n;
        if (_planar.Length < n * 2) _planar = new float[n * 2];
        for (int i = 0; i < n; i++) { _planar[i] = pcm[i * 2] / 32768f; _planar[n + i] = pcm[i * 2 + 1] / 32768f; }
        var h = GCHandle.Alloc(_planar, GCHandleType.Pinned);
        try
        {
            var m = new libomtnet.OMTMediaFrame
            {
                Type = libomtnet.OMTFrameType.Audio, Codec = (int)libomtnet.OMTCodec.FPA1,
                SampleRate = 48000, Channels = 2, SamplesPerChannel = n, Timestamp = ts,
                Data = h.AddrOfPinnedObject(), DataLength = n * 2 * 4,
            };
            _send!.Send(m);
        }
        finally { h.Free(); }
    }

    protected override void Tick()
    {
        var now = Environment.TickCount64;
        if (now - _lastPoll < 500 || _send == null) return;
        _lastPoll = now;
        Connections = _send.Connections;
        State = Connections > 0 ? "live" : "waiting";
        Detail = Connections > 0 ? $"{Connections} receiver{(Connections == 1 ? "" : "s")} connected" : $"Announced at {_send.Address}; no receivers yet";
        // No GetVideoStatistics() here: in libomtnet 1.0.0.19 it blocks the calling thread indefinitely.
    }

    protected override void Close() { try { _send?.Dispose(); } catch { } _send = null; Connections = 0; }

    protected override bool Fatal(Exception ex) => base.Fatal(ex) || ex is TypeLoadException or FileNotFoundException;
    protected override string Explain(Exception ex) => ex is DllNotFoundException ? "The OMT codec (libvmx.dll) is missing from this install." : ex.Message;
}

// ── SRT (ffmpeg + libsrt child: H.264 + AAC in MPEG-TS) ────────────────────
internal sealed class SrtSink : ProgramSink
{
    private readonly SrtEndpoint _ep;
    private Process? _ff;
    private Stream? _stdin;
    private NamedPipeServerStream? _audioPipe;
    private Thread? _audioThread, _progressThread;
    private readonly ConcurrentQueue<short[]> _pcm = new();
    private readonly StringBuilder _log = new();
    private int _encoder;
    private volatile bool _connected;
    private int _w, _h;

    public SrtSink(SinkConfig cfg, SrtEndpoint ep) : base(cfg) { _ep = ep; }

    public static string BuildUrl(SrtEndpoint ep, bool forInput)
    {
        var host = ep.Mode == "listener" ? "0.0.0.0" : ep.Host;
        var q = new List<string> { $"mode={ep.Mode}", $"latency={ep.LatencyMs * 1000}", "pkt_size=1316" };
        if (ep.Mode == "caller") q.Add("connect_timeout=4000");
        if (ep.Passphrase.Length > 0) { q.Add("passphrase=" + Uri.EscapeDataString(ep.Passphrase)); q.Add("pbkeylen=16"); }
        if (ep.StreamId.Length > 0) q.Add("streamid=" + Uri.EscapeDataString(ep.StreamId));
        if (forInput) q.Add("transtype=live");
        var h = host.Contains(':') && !host.StartsWith('[') ? $"[{host}]" : host;
        return $"srt://{h}:{ep.Port}?{string.Join("&", q)}";
    }

    /// <summary>Public URL to show the operator (passphrase never shown).</summary>
    private string DisplayUrl() => _ep.Mode == "listener"
        ? $"srt://{System.Net.Dns.GetHostName()}:{_ep.Port}?mode=caller (Stage is listening)"
        : $"srt://{_ep.Host}:{_ep.Port}?mode=listener (Stage calls in)";

    private string EncoderArgs()
    {
        var list = FfmpegLocator.Current.H264Encoders;
        var enc = list.Count == 0 ? "libx264" : list[Math.Min(_encoder, list.Count - 1)];
        int k = Cfg.BitrateKbps, gop = (int)Math.Round(Cfg.Fps * 2);
        return enc switch
        {
            "h264_nvenc" => $"-c:v h264_nvenc -preset p4 -tune ll -rc cbr -b:v {k}k -maxrate {k}k -bufsize {k}k -g {gop} -bf 0 -pix_fmt yuv420p",
            "h264_qsv" => $"-c:v h264_qsv -preset veryfast -b:v {k}k -maxrate {k}k -bufsize {k}k -g {gop} -bf 0 -pix_fmt nv12",
            "h264_amf" => $"-c:v h264_amf -usage lowlatency -rc cbr -b:v {k}k -maxrate {k}k -bufsize {k}k -g {gop} -bf 0 -pix_fmt nv12",
            "h264_mf" => $"-c:v h264_mf -rate_control cbr -scenario live_streaming -b:v {k}k -g {gop} -pix_fmt nv12",
            _ => $"-c:v libx264 -preset veryfast -tune zerolatency -b:v {k}k -maxrate {k}k -bufsize {k}k -g {gop} -bf 0 -pix_fmt yuv420p",
        };
    }

    private void Launch(int w, int h)
    {
        _w = w; _h = h;
        var pipeName = $"plajah-srt-out-{Environment.ProcessId}-{Guid.NewGuid():N}";
        _audioPipe = new NamedPipeServerStream(pipeName, PipeDirection.Out, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous, 0, 1 << 16);
        string fps = Cfg.Fps.ToString(System.Globalization.CultureInfo.InvariantCulture);
        var args =
            "-hide_banner -loglevel warning -stats_period 1 -progress pipe:1 " +
            $"-use_wallclock_as_timestamps 1 -f rawvideo -pix_fmt bgra -s {w}x{h} -framerate {fps} -thread_queue_size 64 -i pipe:0 " +
            $"-use_wallclock_as_timestamps 1 -f s16le -ar 48000 -ac 2 -thread_queue_size 256 -i {FfmpegLocator.Q(@"\\.\pipe\" + pipeName)} " +
            $"-map 0:v -map 1:a -fps_mode cfr -r {fps} {EncoderArgs()} -af aresample=async=1000 -c:a aac -b:a 160k -ar 48000 -ac 2 " +
            $"-f mpegts -mpegts_flags +resend_headers -flush_packets 1 {FfmpegLocator.Q(BuildUrl(_ep, false))}";
        _ff = FfmpegLocator.Start(args, stdin: true, stdout: true);
        _stdin = _ff.StandardInput.BaseStream;
        _connected = false;
        lock (_log) _log.Clear();
        var ff = _ff;
        _ff.ErrorDataReceived += (_, e) => { if (e.Data != null) lock (_log) { _log.AppendLine(e.Data); if (_log.Length > 8000) _log.Remove(0, _log.Length - 8000); } };
        _ff.BeginErrorReadLine();
        _progressThread = new Thread(() => ReadProgress(ff)) { IsBackground = true, Name = "SRT out progress" };
        _progressThread.Start();
        var pipe = _audioPipe;
        _audioThread = new Thread(() => PumpAudio(pipe)) { IsBackground = true, Name = "SRT out audio" };
        _audioThread.Start();
        Url = DisplayUrl();
        State = _ep.Mode == "listener" ? "waiting" : "starting";
        Detail = _ep.Mode == "listener" ? $"Listening on port {_ep.Port}; waiting for a receiver to call in" : $"Calling {_ep.Host}:{_ep.Port}…";
    }

    protected override void Open() { /* ffmpeg starts on the first frame, when the size is known */ }

    protected override void SendVideo(ProgramFrame f)
    {
        if (_ff != null && (f.Width != _w || f.Height != _h)) Close();  // Program size changed: restart the encoder
        if (_ff == null) Launch(f.Width, f.Height);
        if (_ff!.HasExited) throw new IOException(ExitReason());
        try { _stdin!.Write(f.Data, 0, f.Stride * f.Height); }   // blocks while a listener waits: frames drop upstream
        catch (Exception) when (!Stopping) { throw new IOException(ExitReason()); }
    }

    protected override void SendAudio(short[] pcm) { while (_pcm.Count > 50) _pcm.TryDequeue(out _); _pcm.Enqueue(pcm); }

    /// <summary>Wall-clock paced 20 ms chunks: program audio when there is some, silence when not,
    /// so the TS always carries a continuous audio track and ffmpeg never waits on an empty pipe.</summary>
    private void PumpAudio(NamedPipeServerStream pipe)
    {
        try
        {
            pipe.WaitForConnection();
            const int chunk = 960; // 20 ms @ 48 kHz
            var buf = new byte[chunk * 4];
            short[]? cur = null; int curPos = 0;
            var sw = Stopwatch.StartNew(); long sent = 0;
            while (!Stopping && pipe.IsConnected)
            {
                int filled = 0;
                Array.Clear(buf);
                while (filled < chunk)
                {
                    if (cur == null || curPos >= cur.Length) { if (!_pcm.TryDequeue(out cur)) break; curPos = 0; }
                    int take = Math.Min((cur.Length - curPos) / 2, chunk - filled);
                    Buffer.BlockCopy(cur, curPos * 2, buf, filled * 4, take * 4);
                    curPos += take * 2; filled += take;
                }
                pipe.Write(buf, 0, buf.Length);
                sent += chunk;
                long aheadMs = sent * 1000 / 48000 - sw.ElapsedMilliseconds;
                if (aheadMs > 10) Thread.Sleep((int)aheadMs - 5);
                else if (aheadMs < -500) { sent = sw.ElapsedMilliseconds * 48; } // blocked a while (listener idle): don't burst to catch up
            }
        }
        catch { /* ffmpeg went away; the video side reports it */ }
    }

    private void ReadProgress(Process ff)
    {
        try
        {
            string? line;
            long lastFrame = -1;
            while ((line = ff.StandardOutput.ReadLine()) != null)
            {
                var i = line.IndexOf('=');
                if (i <= 0) continue;
                var k = line[..i]; var v = line[(i + 1)..].Trim();
                if (k == "frame" && long.TryParse(v, out var fr))
                {
                    if (fr > lastFrame && fr > 0 && !_connected)
                    {
                        _connected = true; State = "live"; Attempt = 0; Error = null;
                        Detail = _ep.Mode == "listener" ? "A receiver called in; sending" : $"Connected to {_ep.Host}:{_ep.Port}; sending";
                    }
                    lastFrame = fr;
                }
                else if (k == "bitrate" && v.EndsWith("kbits/s") && double.TryParse(v[..^7], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var br)) BitrateKbps = br;
            }
        }
        catch { }
    }

    private string ExitReason()
    {
        string log; lock (_log) log = _log.ToString();
        var low = log.ToLowerInvariant();
        if (EncoderFailed(low)) { _encoder++; return "The H.264 encoder could not start; trying the next one."; }
        if (low.Contains("connection setup failure") || low.Contains("connection timed out") || low.Contains("connection refused"))
            return $"No SRT listener answered at {_ep.Host}:{_ep.Port}.";
        if (low.Contains("rejected") || low.Contains("passphrase") || low.Contains("bad secret"))
            return "The receiver rejected the connection — check the passphrase (and stream ID).";
        if (low.Contains("bind") || low.Contains("address already in use"))
            return $"Port {_ep.Port} is already in use on this PC.";
        if (_connected) return "The SRT receiver disconnected.";
        var last = log.Split('\n', StringSplitOptions.RemoveEmptyEntries).LastOrDefault()?.Trim();
        return string.IsNullOrEmpty(last) ? "ffmpeg stopped." : last;
    }

    private static bool EncoderFailed(string low) =>
        low.Contains("error while opening encoder") || low.Contains("cannot load nvcuda") || low.Contains("no nvenc capable")
        || low.Contains("openencodesessionex failed") || low.Contains("no device available") || low.Contains("error initializing an mfx session")
        || low.Contains("failed to initialise amf") || low.Contains("could not find encoder");

    protected override void Tick()
    {
        if (_ff != null && _ff.HasExited) throw new IOException(ExitReason());
    }

    protected override void Abort() { try { if (_ff is { HasExited: false }) _ff.Kill(true); } catch { } }

    protected override void Close()
    {
        try { _stdin?.Dispose(); } catch { }
        try { if (_ff is { HasExited: false }) { if (!_ff.WaitForExit(300)) _ff.Kill(true); } } catch { }
        try { _audioPipe?.Dispose(); } catch { }
        try { _ff?.Dispose(); } catch { }
        _ff = null; _stdin = null; _audioPipe = null;
        _connected = false; BitrateKbps = 0;
    }
}
