using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

namespace Plajah.WinUI;

/// <summary>
/// Finds Blackmagic's own decoder on this PC. We never ship or fetch it ourselves: it arrives with the
/// free Blackmagic RAW installer, DaVinci Resolve, or a folder named in PLAJAH_BRAW_RUNTIME. See
/// docs/crossover-camera-raw-licensing.md for why, and for what bundling it would involve.
/// </summary>
internal static class BrawRuntime
{
    private const string Dll = "BlackmagicRawAPI.dll";
    private static string? _path;
    private static long _checkedAt;
    private static readonly object Gate = new();

    /// <summary>The DLL's full path, or null. A missing one is re-checked every 30 s, so installing needs no restart.</summary>
    public static string? Path
    {
        get
        {
            lock (Gate)
            {
                if (_path != null && File.Exists(_path)) return _path;
                if (_checkedAt != 0 && Environment.TickCount64 - _checkedAt < 30000) return null;
                _checkedAt = Environment.TickCount64;
                _path = null;
                foreach (var dir in Candidates())
                {
                    var p = System.IO.Path.Combine(dir, Dll);
                    if (File.Exists(p) && BrawClip.RuntimeIsSupported(p)) { _path = p; break; }
                }
                return _path;
            }
        }
    }

    public static bool Available => Path != null;

    /// <summary>For the capability flags set while the window starts: only looks for the file, so no vendor code loads at launch.</summary>
    public static bool LooksInstalled
    {
        get
        {
            foreach (var dir in Candidates()) if (File.Exists(System.IO.Path.Combine(dir, Dll))) return true;
            return false;
        }
    }

    private static IEnumerable<string> Candidates()
    {
        var env = Environment.GetEnvironmentVariable("PLAJAH_BRAW_RUNTIME");
        if (!string.IsNullOrWhiteSpace(env)) yield return env;
        var x86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        var x64 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        foreach (var root in new[] { x86, x64 })
        {
            var braw = System.IO.Path.Combine(root, "Blackmagic Design", "Blackmagic RAW");
            yield return System.IO.Path.Combine(braw, "Blackmagic RAW Player", "BlackmagicRawAPI");
            yield return System.IO.Path.Combine(braw, "Blackmagic RAW Speed Test", "BlackmagicRawAPI");
            yield return System.IO.Path.Combine(braw, "Blackmagic RAW SDK", "Win", "Libraries");
        }
        yield return System.IO.Path.Combine(x64, "Blackmagic Design", "DaVinci Resolve");
    }

    public static bool IsBraw(string path) => path.EndsWith(".braw", StringComparison.OrdinalIgnoreCase);
}

/// <summary>
/// One open .braw clip, read through Blackmagic's API. The method slots below are SDK 6.0's, which moved
/// them, so an older runtime is refused by its interface id rather than called at the wrong slots.
/// Pictures come out as packed 16-bit RGB using the settings saved with the clip (and any sidecar).
/// </summary>
internal sealed unsafe class BrawClip : IDisposable
{
    public const string FfmpegPixelFormat = "rgb48le";

    // IUnknown takes slots 0-2 of every interface.
    private const int Release = 2;
    private const int FactoryCreateCodec = 3;
    private const int CodecOpenClip = 3, CodecSetCallback = 7, CodecFlushJobs = 10;
    private const int ClipGetWidth = 3, ClipGetHeight = 4, ClipGetFrameRate = 5, ClipGetFrameCount = 6, ClipCreateJobReadFrame = 18;
    private const int FrameSetResourceFormat = 11, FrameCreateJobDecodeAndProcess = 14;
    private const int ImageGetResource = 5, ImageGetResourceSizeBytes = 8;
    private const int JobSubmit = 3, JobSetUserData = 5, JobGetUserData = 6;

    private const uint FormatRgbU16 = ('1' << 24) | ('6' << 16) | ('i' << 8) | 'l';
    private const int MaxInFlight = 4;

    private static readonly Guid IidUnknown = new("00000000-0000-0000-C000-000000000046");
    private static readonly Guid IidCodec60 = new("C25C15E2-D1D0-4743-9EA8-F21F69751AF3");
    private static readonly Guid IidCallback = new("E9F98FAC-33DB-4A65-BB94-8A82B027AED0");

    private nint _factory, _codec, _clip, _callback;
    private GCHandle _self;

    // The running decode. Callbacks arrive on the SDK's threads.
    private readonly object _gate = new();
    private readonly Dictionary<ulong, nint> _ready = new();
    private string? _failure;

    public uint Width { get; private set; }
    public uint Height { get; private set; }
    public float FrameRate { get; private set; }
    public ulong FrameCount { get; private set; }
    public long FrameBytes => (long)Width * Height * 6;

    private static nint Slot(nint obj, int index) => (*(nint**)obj)[index];

    private static void Check(int hr, string what)
    {
        if (hr < 0) throw new InvalidOperationException($"Blackmagic RAW: {what} failed (0x{hr:X8}).");
    }

    private static void ReleaseCom(ref nint obj)
    {
        if (obj == 0) return;
        ((delegate* unmanaged[Stdcall]<nint, uint>)Slot(obj, Release))(obj);
        obj = 0;
    }

    /// <summary>True if this DLL loads and speaks SDK 6.0, the layout the slots above describe.</summary>
    public static bool RuntimeIsSupported(string dll)
    {
        nint factory = 0, codec = 0, asked = 0;
        try
        {
            factory = MakeFactory(dll);
            if (factory == 0) return false;
            if (((delegate* unmanaged[Stdcall]<nint, nint*, int>)Slot(factory, FactoryCreateCodec))(factory, &codec) < 0) return false;
            var iid = IidCodec60;
            return ((delegate* unmanaged[Stdcall]<nint, Guid*, nint*, int>)Slot(codec, 0))(codec, &iid, &asked) >= 0 && asked != 0;
        }
        catch (Exception ex) when (ex is DllNotFoundException or BadImageFormatException or EntryPointNotFoundException) { return false; }
        finally { ReleaseCom(ref asked); ReleaseCom(ref codec); ReleaseCom(ref factory); }
    }

    private static nint MakeFactory(string dll)
    {
        var make = (delegate* unmanaged[Stdcall]<nint>)NativeLibrary.GetExport(NativeLibrary.Load(dll), "CreateBlackmagicRawFactoryInstance");
        return make();
    }

    public BrawClip(string path)
    {
        var dll = BrawRuntime.Path ?? throw new InvalidOperationException("Blackmagic RAW isn't installed on this PC.");
        _factory = MakeFactory(dll);
        if (_factory == 0) throw new InvalidOperationException("Blackmagic RAW: the decoder didn't start.");

        nint codec = 0;
        Check(((delegate* unmanaged[Stdcall]<nint, nint*, int>)Slot(_factory, FactoryCreateCodec))(_factory, &codec), "CreateCodec");
        _codec = codec;

        _self = GCHandle.Alloc(this);
        _callback = MakeCallback(_self);
        Check(((delegate* unmanaged[Stdcall]<nint, nint, int>)Slot(_codec, CodecSetCallback))(_codec, _callback), "SetCallback");

        var name = Marshal.StringToBSTR(path);
        try
        {
            nint clip = 0;
            Check(((delegate* unmanaged[Stdcall]<nint, nint, nint*, int>)Slot(_codec, CodecOpenClip))(_codec, name, &clip), "OpenClip");
            _clip = clip;
        }
        finally { Marshal.FreeBSTR(name); }

        uint w = 0, h = 0;
        float fps = 0;
        ulong frames = 0;
        Check(((delegate* unmanaged[Stdcall]<nint, uint*, int>)Slot(_clip, ClipGetWidth))(_clip, &w), "GetWidth");
        Check(((delegate* unmanaged[Stdcall]<nint, uint*, int>)Slot(_clip, ClipGetHeight))(_clip, &h), "GetHeight");
        Check(((delegate* unmanaged[Stdcall]<nint, float*, int>)Slot(_clip, ClipGetFrameRate))(_clip, &fps), "GetFrameRate");
        Check(((delegate* unmanaged[Stdcall]<nint, ulong*, int>)Slot(_clip, ClipGetFrameCount))(_clip, &frames), "GetFrameCount");
        Width = w; Height = h; FrameRate = fps; FrameCount = frames;
    }

    /// <summary>Decode every frame in order and write it to <paramref name="output"/>. Blocks until done.</summary>
    public void DecodeTo(Stream output, CancellationToken cancel)
    {
        ulong next = 0, submitted = 0;
        while (next < FrameCount)
        {
            while (submitted < FrameCount && submitted - next < MaxInFlight)
            {
                cancel.ThrowIfCancellationRequested();
                SubmitRead(submitted++);
            }

            nint image;
            lock (_gate)
            {
                while (!_ready.ContainsKey(next) && _failure == null)
                {
                    cancel.ThrowIfCancellationRequested();
                    Monitor.Wait(_gate, 100);
                }
                if (_failure != null) throw new InvalidOperationException(_failure);
                image = _ready[next];
                _ready.Remove(next);
            }
            try { WriteImage(image, output); }
            finally { ReleaseCom(ref image); }
            next++;
        }
    }

    private void SubmitRead(ulong frame)
    {
        nint job = 0;
        Check(((delegate* unmanaged[Stdcall]<nint, ulong, nint*, int>)Slot(_clip, ClipCreateJobReadFrame))(_clip, frame, &job), "CreateJobReadFrame");
        ((delegate* unmanaged[Stdcall]<nint, nint, int>)Slot(job, JobSetUserData))(job, (nint)frame);
        var hr = ((delegate* unmanaged[Stdcall]<nint, int>)Slot(job, JobSubmit))(job);
        if (hr < 0) { ReleaseCom(ref job); Check(hr, "Submit"); }
    }

    private void WriteImage(nint image, Stream output)
    {
        uint size = 0;
        void* data = null;
        Check(((delegate* unmanaged[Stdcall]<nint, uint*, int>)Slot(image, ImageGetResourceSizeBytes))(image, &size), "GetResourceSizeBytes");
        Check(((delegate* unmanaged[Stdcall]<nint, void**, int>)Slot(image, ImageGetResource))(image, &data), "GetResource");
        // ffmpeg's rawvideo input assumes tightly packed rows, so a different size would shear the picture.
        if (size != FrameBytes) throw new InvalidOperationException($"Blackmagic RAW: expected {FrameBytes} bytes a frame, got {size}.");
        output.Write(new ReadOnlySpan<byte>(data, (int)size));
    }

    private void Fail(string message)
    {
        lock (_gate)
        {
            _failure ??= message;
            Monitor.PulseAll(_gate);
        }
    }

    private void OnRead(nint job, int result, nint frame)
    {
        nint user = 0;
        ((delegate* unmanaged[Stdcall]<nint, nint*, int>)Slot(job, JobGetUserData))(job, &user);
        if (result < 0 || frame == 0) { Fail($"Blackmagic RAW couldn't read frame {user} (0x{result:X8})."); return; }
        var hr = ((delegate* unmanaged[Stdcall]<nint, uint, int>)Slot(frame, FrameSetResourceFormat))(frame, FormatRgbU16);
        nint decode = 0;
        if (hr >= 0) hr = ((delegate* unmanaged[Stdcall]<nint, nint, nint, nint*, int>)Slot(frame, FrameCreateJobDecodeAndProcess))(frame, 0, 0, &decode);
        if (hr >= 0)
        {
            ((delegate* unmanaged[Stdcall]<nint, nint, int>)Slot(decode, JobSetUserData))(decode, user);
            hr = ((delegate* unmanaged[Stdcall]<nint, int>)Slot(decode, JobSubmit))(decode);
            if (hr < 0) ReleaseCom(ref decode);
        }
        if (hr < 0) Fail($"Blackmagic RAW couldn't start decoding frame {user} (0x{hr:X8}).");
    }

    private void OnProcessed(nint job, int result, nint image)
    {
        nint user = 0;
        ((delegate* unmanaged[Stdcall]<nint, nint*, int>)Slot(job, JobGetUserData))(job, &user);
        if (result < 0 || image == 0) { Fail($"Blackmagic RAW couldn't decode frame {user} (0x{result:X8})."); return; }
        // Keep the SDK's buffer alive until the writer has sent it, rather than copying 16-bit frames twice.
        ((delegate* unmanaged[Stdcall]<nint, uint>)Slot(image, 1))(image);
        lock (_gate)
        {
            _ready[(ulong)user] = image;
            Monitor.PulseAll(_gate);
        }
    }

    public void Dispose()
    {
        if (_codec != 0)
        {
            // Drains in-flight jobs, so no SDK thread can call back into a freed object after this.
            ((delegate* unmanaged[Stdcall]<nint, int>)Slot(_codec, CodecFlushJobs))(_codec);
            ((delegate* unmanaged[Stdcall]<nint, nint, int>)Slot(_codec, CodecSetCallback))(_codec, 0);
        }
        lock (_gate)
        {
            foreach (var kv in _ready) { var image = kv.Value; ReleaseCom(ref image); }
            _ready.Clear();
        }
        ReleaseCom(ref _clip);
        ReleaseCom(ref _codec);
        ReleaseCom(ref _factory);
        if (_callback != 0) { Marshal.FreeHGlobal(*(nint*)_callback); Marshal.FreeHGlobal(_callback); _callback = 0; }
        if (_self.IsAllocated) _self.Free();
    }

    // ---- The callback object the SDK calls: [vtable pointer][GCHandle to this clip] ----

    private static nint MakeCallback(GCHandle self)
    {
        var table = (nint*)Marshal.AllocHGlobal(sizeof(nint) * 12);
        table[0] = (nint)(delegate* unmanaged[Stdcall]<nint, Guid*, nint*, int>)&CbQueryInterface;
        table[1] = (nint)(delegate* unmanaged[Stdcall]<nint, uint>)&CbRefCount;
        table[2] = (nint)(delegate* unmanaged[Stdcall]<nint, uint>)&CbRefCount;
        table[3] = (nint)(delegate* unmanaged[Stdcall]<nint, nint, int, nint, void>)&CbReadComplete;
        table[4] = (nint)(delegate* unmanaged[Stdcall]<nint, nint, int, nint, void>)&CbReadAudioComplete;
        table[5] = (nint)(delegate* unmanaged[Stdcall]<nint, nint, int, void>)&CbDecodeComplete;
        table[6] = (nint)(delegate* unmanaged[Stdcall]<nint, nint, int, nint, void>)&CbProcessComplete;
        table[7] = (nint)(delegate* unmanaged[Stdcall]<nint, nint, float, void>)&CbTrimProgress;
        table[8] = (nint)(delegate* unmanaged[Stdcall]<nint, nint, int, void>)&CbDecodeComplete;
        table[9] = (nint)(delegate* unmanaged[Stdcall]<nint, nint, nint, uint, nint, void>)&CbSidecar;
        table[10] = (nint)(delegate* unmanaged[Stdcall]<nint, nint, nint, uint, nint, void>)&CbSidecar;
        table[11] = (nint)(delegate* unmanaged[Stdcall]<nint, nint, int, void>)&CbPrepared;
        var obj = (nint*)Marshal.AllocHGlobal(sizeof(nint) * 2);
        obj[0] = (nint)table;
        obj[1] = GCHandle.ToIntPtr(self);
        return (nint)obj;
    }

    private static BrawClip Owner(nint callback) => (BrawClip)GCHandle.FromIntPtr(((nint*)callback)[1]).Target!;

    // Single owner, held for the clip's whole life, so the SDK's reference counting has nothing to do.
    [UnmanagedCallersOnly(CallConvs = new[] { typeof(System.Runtime.CompilerServices.CallConvStdcall) })]
    private static int CbQueryInterface(nint self, Guid* iid, nint* result)
    {
        if (result == null) return unchecked((int)0x80004003);
        if (*iid == IidUnknown || *iid == IidCallback) { *result = self; return 0; }
        *result = 0;
        return unchecked((int)0x80004002);
    }

    [UnmanagedCallersOnly(CallConvs = new[] { typeof(System.Runtime.CompilerServices.CallConvStdcall) })]
    private static uint CbRefCount(nint self) => 1;

    [UnmanagedCallersOnly(CallConvs = new[] { typeof(System.Runtime.CompilerServices.CallConvStdcall) })]
    private static void CbReadComplete(nint self, nint job, int result, nint frame)
    {
        try { Owner(self).OnRead(job, result, frame); }
        catch (Exception ex) { Owner(self).Fail(ex.Message); }
        finally { ReleaseCom(ref job); }
    }

    [UnmanagedCallersOnly(CallConvs = new[] { typeof(System.Runtime.CompilerServices.CallConvStdcall) })]
    private static void CbProcessComplete(nint self, nint job, int result, nint image)
    {
        try { Owner(self).OnProcessed(job, result, image); }
        catch (Exception ex) { Owner(self).Fail(ex.Message); }
        finally { ReleaseCom(ref job); }
    }

    [UnmanagedCallersOnly(CallConvs = new[] { typeof(System.Runtime.CompilerServices.CallConvStdcall) })]
    private static void CbDecodeComplete(nint self, nint job, int result) { }

    [UnmanagedCallersOnly(CallConvs = new[] { typeof(System.Runtime.CompilerServices.CallConvStdcall) })]
    private static void CbReadAudioComplete(nint self, nint job, int result, nint audio) { }

    [UnmanagedCallersOnly(CallConvs = new[] { typeof(System.Runtime.CompilerServices.CallConvStdcall) })]
    private static void CbTrimProgress(nint self, nint job, float progress) { }

    [UnmanagedCallersOnly(CallConvs = new[] { typeof(System.Runtime.CompilerServices.CallConvStdcall) })]
    private static void CbSidecar(nint self, nint clip, nint fileName, uint line, nint info) { }

    [UnmanagedCallersOnly(CallConvs = new[] { typeof(System.Runtime.CompilerServices.CallConvStdcall) })]
    private static void CbPrepared(nint self, nint userData, int result) { }
}
