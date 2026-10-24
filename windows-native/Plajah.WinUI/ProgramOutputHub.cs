using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using Microsoft.Web.WebView2.Core;

namespace Plajah.WinUI;

/// <summary>
/// Stage's Program as network outputs: NDI, OMT and SRT (caller or listener).
///
/// The page owns the Master Program Bus (a canvas + its captureStream). It asks for a shared buffer
/// (program_out_buffer), and on every program frame copies BGRA pixels into one of three slots and posts
/// PROGRAM_OUT_FRAME {gen, slot, width, height, format}. This hub copies the slot out at once (the page
/// reuses it two frames later) into a pooled frame and offers it to every running sink. Each sink runs
/// on its own thread and only ever holds the NEWEST frame, so a slow SRT encoder never stalls NDI.
/// Program audio arrives as PROGRAM_OUT_AUDIO (48 kHz stereo s16, base64) and fans out the same way.
///
/// Sinks open, fail and reopen on their own with backoff; their state is what the page shows:
///   starting → waiting (announced / listening, no receiver yet) → live (a receiver is connected)
///   retrying (lost, reopening after a backoff) · error (cannot work as configured) · stopped
/// </summary>
internal sealed class ProgramOutputHub : IDisposable
{
    public const int Slots = 3;

    private readonly Func<string> _ndiDllPath;
    private readonly ConcurrentDictionary<string, ProgramSink> _sinks = new();
    private readonly FramePool _pool = new();
    private CoreWebView2SharedBuffer? _buffer;
    private Windows.Foundation.IMemoryBufferReference? _bufferRef;
    private unsafe byte* _bufferPtr;
    private int _gen, _bufW, _bufH;
    private long _slotBytes;
    private long _framesIn, _lastFrameAt;
    private double _fpsIn;
    private long _fpsWindowStart, _fpsWindowFrames;

    public ProgramOutputHub(Func<string> ndiDllPath) { _ndiDllPath = ndiDllPath; }

    public bool HasSinks => !_sinks.IsEmpty;

    // ── Commands ─────────────────────────────────────────────────────────────
    public object Start(JsonElement a)
    {
        string S(string k, string d) => a.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? d : d;
        int I(string k, int d) => a.TryGetProperty(k, out var v) && v.TryGetInt32(out var x) ? x : d;
        double D(string k, double d) => a.TryGetProperty(k, out var v) && v.TryGetDouble(out var x) ? x : d;

        var id = S("id", "");
        var kind = S("kind", "").ToLowerInvariant();
        var name = S("name", "Plajah Stage Program");
        if (id.Length == 0) return new { success = false, error = "Missing output id." };
        var cfg = new SinkConfig(id, kind, name, D("fps", 30), Math.Clamp(I("bitrateKbps", 6000), 500, 50000));

        ProgramSink sink;
        switch (kind)
        {
            case "ndi": sink = new NdiSink(cfg, _ndiDllPath()); break;
            case "omt": sink = new OmtSink(cfg); break;
            case "srt":
                {
                    var srt = a.TryGetProperty("srt", out var so) && so.ValueKind == JsonValueKind.Object ? so : a;
                    string SS(string k, string d) => srt.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? d : d;
                    int SI(string k, int d) => srt.TryGetProperty(k, out var v) && v.TryGetInt32(out var x) ? x : d;
                    var mode = SS("mode", "caller") == "listener" ? "listener" : "caller";
                    var host = SS("host", "");
                    var port = SI("port", 9000);
                    if (mode == "caller" && host.Length == 0) return new { success = false, error = "An SRT caller needs the receiver's host or IP." };
                    if (port < 1 || port > 65535) return new { success = false, error = "SRT port must be 1–65535." };
                    var pass = SS("passphrase", "");
                    if (pass.Length > 0 && (pass.Length < 10 || pass.Length > 79)) return new { success = false, error = "An SRT passphrase must be 10–79 characters." };
                    if (!FfmpegLocator.SrtAvailable) return new { success = false, transportAvailable = false, error = FfmpegLocator.SrtReason };
                    sink = new SrtSink(cfg, new SrtEndpoint(mode, host, port, Math.Clamp(SI("latencyMs", 120), 20, 8000), pass, SS("streamId", "")));
                    break;
                }
            default: return new { success = false, error = $"Unknown output kind '{kind}'." };
        }
        if (_sinks.TryRemove(id, out var old)) old.Dispose();
        _sinks[id] = sink;
        sink.Start();
        return new { success = true, status = sink.Snapshot() };
    }

    public bool Stop(string id)
    {
        if (!_sinks.TryRemove(id, out var s)) return false;
        s.Dispose();
        return true;
    }

    public object Status() => new
    {
        outputs = _sinks.Values.Select(s => s.Snapshot()).ToList(),
        feed = new
        {
            width = _bufW, height = _bufH, frames = Interlocked.Read(ref _framesIn), fps = Math.Round(_fpsIn, 1),
            lastFrameAgeMs = _lastFrameAt == 0 ? -1 : Environment.TickCount64 - Interlocked.Read(ref _lastFrameAt),
            bufferGen = _gen,
        },
        srt = new { transportAvailable = FfmpegLocator.SrtAvailable, reason = FfmpegLocator.SrtAvailable ? null : FfmpegLocator.SrtReason },
    };

    /// <summary>(Re)create the frame ring for width×height and hand it to the page.</summary>
    public object AttachBuffer(CoreWebView2 core, int w, int h)
    {
        w = Math.Clamp(w, 16, 3840); h = Math.Clamp(h, 16, 2160);
        long slot = (long)w * h * 4;
        var old = _buffer; var oldRef = _bufferRef;
        var buf = core.Environment.CreateSharedBuffer((ulong)(slot * Slots));
        // The projection hands out the memory as IMemoryBufferReference; hold the reference for the
        // buffer's lifetime so the raw pointer stays valid.
        var reference = buf.Buffer;
        unsafe
        {
            WinRT.CastExtensions.As<IMemoryBufferByteAccess>(reference).GetBuffer(out var ptr, out var cap);
            if (cap < (ulong)(slot * Slots)) throw new InvalidOperationException("Shared buffer is smaller than requested.");
            _bufferPtr = ptr;
        }
        _buffer = buf; _bufferRef = reference; _bufW = w; _bufH = h; _slotBytes = slot;
        var gen = Interlocked.Increment(ref _gen);
        var meta = JsonSerializer.Serialize(new { kind = "plajah-program-out", gen, slots = Slots, slotBytes = slot, width = w, height = h });
        core.PostSharedBufferToScript(buf, CoreWebView2SharedBufferAccess.ReadWrite, meta);
        try { oldRef?.Dispose(); } catch { }
        try { old?.Dispose(); } catch { }
        return new { success = true, gen, slots = Slots, slotBytes = slot, width = w, height = h };
    }

    /// <summary>PROGRAM_OUT_FRAME: copy the slot out now (UI thread, ~1 ms for 1080p) and fan it out.</summary>
    public unsafe void OnFrame(JsonElement m)
    {
        var buf = _buffer;
        if (buf == null || _sinks.IsEmpty) return;
        int gen = m.TryGetProperty("gen", out var g) ? g.GetInt32() : -1;
        int slot = m.TryGetProperty("slot", out var sl) ? sl.GetInt32() : -1;
        int w = m.TryGetProperty("width", out var wv) ? wv.GetInt32() : 0;
        int h = m.TryGetProperty("height", out var hv) ? hv.GetInt32() : 0;
        bool rgba = m.TryGetProperty("format", out var fv) && fv.GetString() == "RGBA";
        if (gen != _gen || slot < 0 || slot >= Slots || w != _bufW || h != _bufH) return;

        int bytes = w * h * 4;
        var frame = _pool.Rent(bytes);
        frame.Width = w; frame.Height = h; frame.Stride = w * 4;
        var src = _bufferPtr + slot * _slotBytes;
        fixed (byte* dst = frame.Data)
        {
            if (!rgba) Buffer.MemoryCopy(src, dst, bytes, bytes);
            else
            {
                // Canvas readback fallback delivers RGBA; every sink takes BGRA, so swap once here.
                uint* s = (uint*)src, d = (uint*)dst;
                for (int i = 0, n = w * h; i < n; i++) { uint p = s[i]; d[i] = (p & 0xFF00FF00u) | ((p & 0xFFu) << 16) | ((p >> 16) & 0xFFu); }
            }
        }

        var now = Environment.TickCount64;
        Interlocked.Increment(ref _framesIn);
        Interlocked.Exchange(ref _lastFrameAt, now);
        if (_fpsWindowStart == 0) _fpsWindowStart = now;
        if (++_fpsWindowFrames >= 30 || now - _fpsWindowStart > 2000)
        {
            _fpsIn = _fpsWindowFrames * 1000.0 / Math.Max(1, now - _fpsWindowStart);
            _fpsWindowStart = now; _fpsWindowFrames = 0;
        }
        foreach (var s in _sinks.Values) s.Offer(frame);
        frame.Release();
    }

    /// <summary>PROGRAM_OUT_AUDIO: 48 kHz stereo s16 PCM (base64).</summary>
    public void OnAudio(JsonElement m)
    {
        if (_sinks.IsEmpty) return;
        if (!m.TryGetProperty("pcm", out var p) || p.ValueKind != JsonValueKind.String) return;
        int rate = m.TryGetProperty("rate", out var r) && r.TryGetInt32(out var rv) ? rv : 48000;
        var bytes = Convert.FromBase64String(p.GetString()!);
        var pcm = new short[bytes.Length / 2];
        Buffer.BlockCopy(bytes, 0, pcm, 0, pcm.Length * 2);
        foreach (var s in _sinks.Values) s.OfferAudio(pcm, rate);
    }

    public void Dispose()
    {
        foreach (var id in _sinks.Keys.ToList()) Stop(id);
        try { _bufferRef?.Dispose(); } catch { }
        try { _buffer?.Dispose(); } catch { }
        _buffer = null; _bufferRef = null;
        unsafe { _bufferPtr = null; }
    }
}

[ComImport, Guid("5b0d3235-4dba-4d44-865e-8f1d0e4fd04d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal unsafe interface IMemoryBufferByteAccess { void GetBuffer(out byte* buffer, out uint capacity); }
