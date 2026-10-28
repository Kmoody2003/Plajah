using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using NAudio.Wave;

namespace Plajah.WinUI;

// Multitrack capture from an ASIO driver (StudioLive / Quantum / any interface) for Chora.
//
// The driver's buffer callback only deinterleaves into one lock-free ring per requested input and
// tracks peaks — no allocation, no I/O. A writer thread drains the rings to one 32-bit float WAV per
// input, so every track of a take is sample-aligned (same driver buffers). Health is reported as
// observed: dropped frames = ring overflow (the disk fell behind). ASIO resets/xruns aren't exposed
// by the driver API, so they are not claimed. Input latency is the driver's own report
// (ASIOGetLatencies) — 0 when the driver gives none, and then nothing is claimed.
//
// One instance per process: ASIO allows a single open driver. Create it on a thread that pumps
// messages (the WinUI UI thread) — some drivers post to the creating thread.
public sealed class AsioMultitrackRecorder : IDisposable
{
    public sealed record DriverProbe(string Driver, bool Ok, string? Error, int Inputs, int Outputs,
        string[] InputNames, int[] SampleRates);

    public sealed record TakeFile(int Input, string Path, long Frames);

    /// FirstBufferUnixMs/BufferFrames place sample 0 on the wall clock: ≈ first callback − one buffer,
    /// or − InputLatencyFrames when the driver reports it (ASIO's input latency includes the buffer).
    public sealed record TakeResult(string TakeId, int SampleRate, double DurationSec, TakeFile[] Files,
        long DroppedFrames, int[] ClippedInputs, string? Error, long FirstBufferUnixMs = 0, int BufferFrames = 0,
        int InputLatencyFrames = 0);

    private static readonly int[] CandidateRates = { 44100, 48000, 88200, 96000, 176400, 192000 };

    public static string[] DriverNames()
    {
        try { return AsioOut.GetDriverNames(); } catch { return Array.Empty<string>(); }
    }

    /// Opens the driver briefly to read its real channel counts, names and rates.
    public static DriverProbe Probe(string driver)
    {
        try
        {
            using var asio = new AsioOut(driver);
            int ins = asio.DriverInputChannelCount, outs = asio.DriverOutputChannelCount;
            var names = Enumerable.Range(0, ins).Select(i => SafeName(asio, i)).ToArray();
            var rates = CandidateRates.Where(r => { try { return asio.IsSampleRateSupported(r); } catch { return false; } }).ToArray();
            return new DriverProbe(driver, true, null, ins, outs, names, rates);
        }
        catch (Exception ex)
        {
            return new DriverProbe(driver, false, ex.Message, 0, 0, Array.Empty<string>(), Array.Empty<int>());
        }
    }

    // AsioOut keeps its driver private; the latencies are only valid once buffers exist (after Init).
    private static int InputLatency(AsioOut asio)
    {
        try
        {
            var f = typeof(AsioOut).GetFields(System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)
                .FirstOrDefault(x => x.FieldType == typeof(NAudio.Wave.Asio.AsioDriverExt));
            if (f?.GetValue(asio) is not NAudio.Wave.Asio.AsioDriverExt ext) return 0;
            ext.Driver.GetLatencies(out int input, out _);
            return input > 0 ? input : 0;
        }
        catch { return 0; }
    }

    private static string SafeName(AsioOut asio, int i)
    {
        try { var n = asio.AsioInputChannelName(i); return string.IsNullOrWhiteSpace(n) ? $"In {i + 1}" : n.Trim(); }
        catch { return $"In {i + 1}"; }
    }

    // ── one running session ──────────────────────────────────────────────
    private AsioOut? _asio;
    private string _takeId = "";
    private int[] _inputs = Array.Empty<int>();   // driver input indices, as requested
    private int _offset, _span;                   // contiguous driver range we open
    private Ring[] _rings = Array.Empty<Ring>();
    private float[] _interleaved = Array.Empty<float>();
    private WaveFileWriter?[] _writers = Array.Empty<WaveFileWriter?>();
    private string[] _paths = Array.Empty<string>();
    private Thread? _writerThread;
    private volatile bool _running;
    private bool _write;
    private int _sampleRate;
    private readonly float[] _peakHold = new float[256];
    private readonly bool[] _clipped = new bool[256];
    private long _dropped;

    public bool IsRunning => _running;
    public string TakeId => _takeId;
    public DateTime StartedAtUtc { get; private set; }
    public long FirstBufferTicks { get; private set; }
    private int _bufferFrames;
    public int InputLatencyFrames { get; private set; }

    /// Starts capture of `inputs` (0-based driver inputs). `write` = false meters only.
    public void Start(string driver, int[] inputs, int sampleRate, string takeId, string outDir, bool write)
    {
        if (_running) throw new InvalidOperationException("A capture is already running");
        if (inputs.Length == 0) throw new ArgumentException("No inputs selected");
        if (inputs.Length > _peakHold.Length) throw new ArgumentException("Too many inputs");
        _inputs = inputs.Distinct().OrderBy(i => i).ToArray();
        _offset = _inputs[0];
        _span = _inputs[^1] - _offset + 1;
        _takeId = takeId;
        _write = write;
        _sampleRate = sampleRate;
        _dropped = 0;
        Array.Clear(_peakHold); Array.Clear(_clipped);
        FirstBufferTicks = 0;

        var asio = new AsioOut(driver);
        try
        {
            if (_inputs[^1] >= asio.DriverInputChannelCount)
                throw new ArgumentException($"{driver} has {asio.DriverInputChannelCount} inputs");
            if (!asio.IsSampleRateSupported(sampleRate))
                throw new ArgumentException($"{driver} can't run at {sampleRate} Hz");
            asio.InputChannelOffset = _offset;
            asio.InitRecordAndPlayback(null, _span, sampleRate);
            InputLatencyFrames = InputLatency(asio);
        }
        catch { asio.Dispose(); throw; }

        _rings = _inputs.Select(_ => new Ring(sampleRate * 8)).ToArray();   // 8 s of slack for the disk
        _paths = new string[_inputs.Length];
        _writers = new WaveFileWriter?[_inputs.Length];
        if (write)
        {
            Directory.CreateDirectory(outDir);
            var fmt = WaveFormat.CreateIeeeFloatWaveFormat(sampleRate, 1);
            for (int k = 0; k < _inputs.Length; k++)
            {
                _paths[k] = Path.Combine(outDir, $"{_inputs[k] + 1:D2}.wav");
                _writers[k] = new WaveFileWriter(_paths[k], fmt);
            }
        }

        _asio = asio;
        asio.AudioAvailable += OnAudio;
        _running = true;
        _writerThread = new Thread(WriterLoop) { IsBackground = true, Name = "Chora ASIO writer", Priority = ThreadPriority.AboveNormal };
        _writerThread.Start();
        StartedAtUtc = DateTime.UtcNow;
        asio.Play();
    }

    private void OnAudio(object? sender, AsioAudioAvailableEventArgs e)
    {
        int frames = e.SamplesPerBuffer;
        if (FirstBufferTicks == 0) { FirstBufferTicks = DateTime.UtcNow.Ticks; _bufferFrames = frames; }
        int need = frames * _span;
        if (_interleaved.Length < need) _interleaved = new float[need];   // first buffer only
        e.GetAsInterleavedSamples(_interleaved);
        for (int k = 0; k < _inputs.Length; k++)
        {
            int ch = _inputs[k] - _offset;
            float peak = _peakHold[k];
            var ring = _rings[k];
            for (int f = 0; f < frames; f++)
            {
                float s = _interleaved[f * _span + ch];
                float a = s < 0 ? -s : s;
                if (a > peak) peak = a;
                if (_write && !ring.TryPush(s)) Interlocked.Increment(ref _dropped);
            }
            _peakHold[k] = peak;
            if (peak >= 0.999f) _clipped[k] = true;
        }
    }

    private void WriterLoop()
    {
        var chunk = new float[8192];
        while (_running) { Drain(chunk); Thread.Sleep(20); }
        Drain(chunk);
    }

    private void Drain(float[] chunk)
    {
        if (!_write) { foreach (var r in _rings) r.Clear(); return; }
        for (int k = 0; k < _rings.Length; k++)
        {
            int n;
            while ((n = _rings[k].Pop(chunk)) > 0) _writers[k]!.WriteSamples(chunk, 0, n);
        }
    }

    /// Peaks since the last call (0..1) per requested input, in request order; resets the hold.
    public float[] TakePeaks()
    {
        var o = new float[_inputs.Length];
        for (int k = 0; k < o.Length; k++) { o[k] = _peakHold[k]; _peakHold[k] = 0; }
        return o;
    }

    public int[] Inputs => _inputs;

    public TakeResult Stop()
    {
        if (!_running || _asio is null) return new TakeResult(_takeId, _sampleRate, 0, Array.Empty<TakeFile>(), 0, Array.Empty<int>(), "Not running");
        string? error = null;
        try { _asio.Stop(); } catch (Exception ex) { error = ex.Message; }
        _asio.AudioAvailable -= OnAudio;
        _running = false;
        _writerThread?.Join(5000);
        try { _asio.Dispose(); } catch { }
        _asio = null;

        var files = new List<TakeFile>();
        long frames = 0;
        for (int k = 0; k < _writers.Length; k++)
        {
            var w = _writers[k];
            if (w is null) continue;
            long f = w.Length / 4;
            frames = Math.Max(frames, f);
            w.Dispose();
            files.Add(new TakeFile(_inputs[k], _paths[k], f));
        }
        var clipped = _inputs.Where((_, k) => _clipped[k]).ToArray();
        long firstMs = FirstBufferTicks == 0 ? 0 : new DateTimeOffset(FirstBufferTicks, TimeSpan.Zero).ToUnixTimeMilliseconds();
        return new TakeResult(_takeId, _sampleRate, frames / (double)_sampleRate, files.ToArray(),
            Interlocked.Read(ref _dropped), clipped, error, firstMs, _bufferFrames, InputLatencyFrames);
    }

    public void Dispose()
    {
        if (_running) Stop();
    }

    // Single-producer (driver thread) / single-consumer (writer thread) float ring.
    private sealed class Ring
    {
        private readonly float[] _buf;
        private long _head, _tail;   // head = next write, tail = next read; both monotonic
        public Ring(int capacity) { _buf = new float[capacity]; }

        public bool TryPush(float v)
        {
            long h = _head;
            if (h - Volatile.Read(ref _tail) >= _buf.Length) return false;
            _buf[h % _buf.Length] = v;
            Volatile.Write(ref _head, h + 1);
            return true;
        }

        public int Pop(float[] dst)
        {
            long t = _tail, h = Volatile.Read(ref _head);
            int n = (int)Math.Min(h - t, dst.Length);
            for (int i = 0; i < n; i++) dst[i] = _buf[(t + i) % _buf.Length];
            Volatile.Write(ref _tail, t + n);
            return n;
        }

        public void Clear() => Volatile.Write(ref _tail, Volatile.Read(ref _head));
    }
}
