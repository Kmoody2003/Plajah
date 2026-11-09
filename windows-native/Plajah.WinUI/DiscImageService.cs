// Disc imaging + burning through Windows' own IMAPI2 (no third-party burner):
//   disc_recorders   → optical drives that can write BD-R / BD-R XL, with loaded media
//   disc_make_iso    → UDF 2.50 image of a BDMV folder tree (the file system Blu-ray players read)
//   disc_burn        → write a folder (or an .iso) to the disc in a drive, then optional verify
//   disc_status      → progress of the running image/burn job
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Threading;
using System.Threading.Tasks;

namespace Plajah.WinUI;

public static class DiscImageService
{
    // IMAPI_MEDIA_PHYSICAL_TYPE
    private const int MEDIA_BDROM = 0x12, MEDIA_BDR = 0x13, MEDIA_BDRE = 0x14;
    private const int FS_UDF = 4;
    private const int UDF_250 = 0x250;
    private const int SECTOR = 2048;

    private static readonly object Gate = new();
    private static string _phase = "idle";
    private static double _progress;
    private static string? _error;
    private static string? _result;
    private static CancellationTokenSource? _cts;

    public static object Status() { lock (Gate) return new { phase = _phase, progress = _progress, error = _error, result = _result }; }
    private static void Set(string phase, double progress, string? error = null, string? result = null) { lock (Gate) { _phase = phase; _progress = progress; _error = error; _result = result; } }
    public static object Cancel() { _cts?.Cancel(); return new { success = true }; }

    public static object Recorders()
    {
        var list = new List<object>();
        try
        {
            dynamic master = Activator.CreateInstance(Type.GetTypeFromProgID("IMAPI2.MsftDiscMaster2")!)!;
            if (!(bool)master.IsSupportedEnvironment) return new { success = false, error = "This PC has no optical drive Windows can write with.", recorders = list };
            foreach (string id in master)
            {
                dynamic rec = Activator.CreateInstance(Type.GetTypeFromProgID("IMAPI2.MsftDiscRecorder2")!)!;
                rec.InitializeDiscRecorder(id);
                string name = $"{((string)rec.VendorId).Trim()} {((string)rec.ProductId).Trim()}".Trim();
                var paths = new List<string>(); foreach (string p in rec.VolumePathNames) paths.Add(p);
                bool canBd = false; foreach (int prof in rec.SupportedProfiles) if (prof == 0x41 || prof == 0x42 || prof == 0x43) canBd = true; // BD-R SRM/RRM, BD-RE
                string media = "none"; long freeBytes = 0; bool blank = false;
                try
                {
                    dynamic fmt = Activator.CreateInstance(Type.GetTypeFromProgID("IMAPI2.MsftDiscFormat2Data")!)!;
                    fmt.Recorder = rec;
                    int mt = (int)fmt.CurrentPhysicalMediaType;
                    media = mt == MEDIA_BDR ? "BD-R" : mt == MEDIA_BDRE ? "BD-RE" : mt == MEDIA_BDROM ? "BD-ROM" : mt == 0 ? "none" : $"type {mt}";
                    freeBytes = (long)(int)fmt.FreeSectorsOnMedia * SECTOR;
                    blank = (bool)fmt.MediaHeuristicallyBlank;
                }
                catch { /* no media loaded */ }
                list.Add(new { id, name, drive = paths.Count > 0 ? paths[0] : "", canWriteBd = canBd, media, freeBytes, blank });
            }
            return new { success = true, recorders = list };
        }
        catch (Exception ex) { return new { success = false, error = ex.Message, recorders = list }; }
    }

    /// Build a UDF 2.50 file system from <paramref name="folder"/> (which holds BDMV/ and CERTIFICATE/).
    private static IStream BuildImage(string folder, string volumeName, long capacityBytes)
    {
        dynamic fsi = Activator.CreateInstance(Type.GetTypeFromProgID("IMAPI2FS.MsftFileSystemImage")!)!;
        fsi.FileSystemsToCreate = FS_UDF;
        fsi.UDFRevision = UDF_250;
        fsi.VolumeName = volumeName.Length > 32 ? volumeName[..32] : volumeName;
        fsi.FreeMediaBlocks = (int)Math.Min(int.MaxValue, capacityBytes / SECTOR);
        dynamic root = fsi.Root;
        foreach (var dir in Directory.GetDirectories(folder)) root.AddTree(dir, true);
        foreach (var file in Directory.GetFiles(folder)) { var s = OpenStream(file); root.AddFile(Path.GetFileName(file), s); }
        dynamic result = fsi.CreateResultImage();
        return (IStream)result.ImageStream;
    }

    [DllImport("shlwapi.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    private static extern void SHCreateStreamOnFileEx(string file, uint mode, uint attrs, bool create, IStream? template, out IStream stream);
    private static IStream OpenStream(string path) { SHCreateStreamOnFileEx(path, 0x0 /*STGM_READ*/ | 0x20 /*SHARE_DENY_WRITE*/, 0, false, null, out var s); return s; }

    public static Task<object> MakeIsoAsync(string folder, string isoPath, string volumeName, long capacityBytes) => Task.Run<object>(() =>
    {
        _cts = new CancellationTokenSource();
        try
        {
            Set("imaging", 0);
            var stream = BuildImage(folder, volumeName, capacityBytes);
            stream.Stat(out var st, 1);
            long total = st.cbSize, done = 0;
            Directory.CreateDirectory(Path.GetDirectoryName(isoPath)!);
            using var fs = new FileStream(isoPath, FileMode.Create, FileAccess.Write, FileShare.None, 1 << 20);
            var buf = new byte[4 << 20];
            var readPtr = Marshal.AllocHGlobal(sizeof(int));
            try
            {
                while (true)
                {
                    _cts.Token.ThrowIfCancellationRequested();
                    stream.Read(buf, buf.Length, readPtr);
                    int n = Marshal.ReadInt32(readPtr);
                    if (n <= 0) break;
                    fs.Write(buf, 0, n); done += n;
                    Set("imaging", total > 0 ? (double)done / total : 0);
                }
            }
            finally { Marshal.FreeHGlobal(readPtr); }
            Set("done", 1, null, isoPath);
            return new { success = true, path = isoPath, bytes = done };
        }
        catch (OperationCanceledException) { Set("cancelled", 0); return new { success = false, error = "Cancelled." }; }
        catch (Exception ex) { Set("error", 0, ex.Message); return new { success = false, error = ex.Message }; }
    });

    public static Task<object> BurnAsync(string recorderId, string source, string volumeName, bool verify) => Task.Run<object>(() =>
    {
        try
        {
            Set("preparing", 0);
            dynamic rec = Activator.CreateInstance(Type.GetTypeFromProgID("IMAPI2.MsftDiscRecorder2")!)!;
            rec.InitializeDiscRecorder(recorderId);
            dynamic fmt = Activator.CreateInstance(Type.GetTypeFromProgID("IMAPI2.MsftDiscFormat2Data")!)!;
            fmt.Recorder = rec;
            fmt.ClientName = "Plajah Fabula";
            if (!(bool)fmt.MediaHeuristicallyBlank) return Fail("The disc in the drive isn't blank.");
            long capacity = (long)(int)fmt.TotalSectorsOnMedia * SECTOR;
            IStream image = File.Exists(source) ? OpenStream(source) : BuildImage(source, volumeName, capacity);
            image.Stat(out var st, 1);
            if (st.cbSize > capacity) return Fail($"Image is {st.cbSize / 1e9:0.0} GB; the disc holds {capacity / 1e9:0.0} GB.");
            fmt.ForceMediaToBeClosed = true;
            Set("burning", -1); // IMAPI's Write blocks; progress is indeterminate without a COM event sink
            fmt.Write(image);
            if (verify && Directory.Exists(source))
            {
                Set("verifying", 0);
                rec.EjectMedia(); rec.CloseTray(); // re-mount so Windows reads the new file system
                string? drive = null;
                for (int i = 0; i < 30 && drive == null; i++)
                {
                    Thread.Sleep(2000);
                    foreach (string p in rec.VolumePathNames) if (Directory.Exists(Path.Combine(p, "BDMV"))) drive = p;
                }
                if (drive == null) return Fail("Burned, but the disc didn't mount for verification — check it in a player.");
                var files = Directory.GetFiles(source, "*", SearchOption.AllDirectories);
                for (int i = 0; i < files.Length; i++)
                {
                    var rel = Path.GetRelativePath(source, files[i]);
                    var onDisc = Path.Combine(drive, rel);
                    if (!File.Exists(onDisc) || new FileInfo(onDisc).Length != new FileInfo(files[i]).Length) return Fail($"Verify failed: {rel} is missing or a different size on the disc.");
                    if (new FileInfo(files[i]).Length < 4 << 20 && !SameBytes(files[i], onDisc)) return Fail($"Verify failed: {rel} differs on the disc.");
                    Set("verifying", (double)(i + 1) / files.Length);
                }
            }
            Set("done", 1, null, "burned");
            return new { success = true, verified = verify };
        }
        catch (COMException ex) { return Fail($"Burn failed (0x{ex.HResult:X8}): {ex.Message}"); }
        catch (Exception ex) { return Fail(ex.Message); }

        static object Fail(string msg) { Set("error", 0, msg); return new { success = false, error = msg }; }
    });

    private static bool SameBytes(string a, string b) => File.ReadAllBytes(a).AsSpan().SequenceEqual(File.ReadAllBytes(b));
}
