using System;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace Plajah.WinUI;

public static class WindowsAccelerationService
{
    public static WindowsAccelerationProfile Probe()
    {
        var system = Environment.SystemDirectory;
        var path = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
        var searchPaths = path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries)
            .Append(system)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        bool Has(params string[] names) => names.Any(name => searchPaths.Any(folder =>
            File.Exists(Path.Combine(folder, name))));

        var isArm64 = RuntimeInformation.OSArchitecture == Architecture.Arm64;

        string processorName = string.Empty;
        string systemModel = string.Empty;
        try
        {
            using var cpuKey = Registry.LocalMachine.OpenSubKey(@"HARDWARE\DESCRIPTION\System\CentralProcessor\0");
            processorName = cpuKey?.GetValue("ProcessorNameString") as string ?? string.Empty;
            using var biosKey = Registry.LocalMachine.OpenSubKey(@"HARDWARE\DESCRIPTION\System\BIOS");
            systemModel = biosKey?.GetValue("SystemProductName") as string ?? string.Empty;
        }
        catch { }

        bool isSurfaceProX = isArm64 && (
            systemModel.Contains("Surface Pro X", StringComparison.OrdinalIgnoreCase) ||
            processorName.Contains("SQ1", StringComparison.OrdinalIgnoreCase) ||
            processorName.Contains("SQ2", StringComparison.OrdinalIgnoreCase));

        bool isQualcomm = isArm64 && (
            isSurfaceProX ||
            processorName.Contains("Qualcomm", StringComparison.OrdinalIgnoreCase) ||
            processorName.Contains("Snapdragon", StringComparison.OrdinalIgnoreCase) ||
            Has("QnnHtp.dll", "QnnGpu.dll", "qcvcd.dll", "qcvce.dll"));

        var nvidiaDriver = Has("nvcuda.dll");
        var nvenc = Has("nvEncodeAPI64.dll", "nvEncodeAPI.dll");
        var nvdec = nvidiaDriver;
        var tensorRt = Has("nvinfer.dll", "nvinfer_10.dll", "nvinfer_9.dll");
        var directMl = Has("DirectML.dll") || isArm64; // DirectML is native system component on Windows on ARM
        var oneVpl = Has("vpl.dll", "libvpl.dll", "vpl-intel-gpu.dll");
        var qsv = oneVpl || Has("libmfx-2.dll", "libmfxhw64.dll");
        var qualcommMft = isArm64 && (isQualcomm || Has("qcvcd.dll", "qcvce.dll", "mfperfhelper.dll"));
        var npuRuntime = isArm64 ? (isQualcomm || Has("QnnHtp.dll", "QnnGpu.dll")) : Has("QnnHtp.dll", "QnnGpu.dll");

        var detectedProviders = new System.Collections.Generic.List<string>();
        if (directMl) detectedProviders.Add("directml");
        if (isArm64)
        {
            detectedProviders.Add("arm64-neon");
            if (isQualcomm) detectedProviders.Add("qualcomm-hexagon-npu");
            if (isSurfaceProX) detectedProviders.Add("surface-pro-x-adreno");
        }
        if (nvidiaDriver) detectedProviders.Add("cuda");
        if (tensorRt) detectedProviders.Add("tensorrt");

        return new WindowsAccelerationProfile(
            RuntimeInformation.OSArchitecture.ToString(),
            new VideoAccelerationProfile(nvenc, nvdec, qsv, oneVpl, qualcommMft, isArm64),
            new AiAccelerationProfile(directMl, nvidiaDriver, tensorRt, detectedProviders.ToArray()),
            new HardwarePresenceProfile(nvidiaDriver, oneVpl, npuRuntime, isArm64, isQualcomm, isSurfaceProX, processorName, systemModel),
            isSurfaceProX ? "surface-pro-x-full-acceleration" : (isArm64 ? "arm64-full-acceleration" : "ready"));
    }
}

public sealed record WindowsAccelerationProfile(
    string Architecture,
    VideoAccelerationProfile Video,
    AiAccelerationProfile Ai,
    HardwarePresenceProfile Hardware,
    string Status);

public sealed record VideoAccelerationProfile(
    bool Nvenc,
    bool Nvdec,
    bool QuickSync,
    bool OneVpl,
    bool QualcommMft = false,
    bool Arm64MediaFoundation = false);

public sealed record AiAccelerationProfile(
    bool DirectMl,
    bool CudaRuntime,
    bool TensorRt,
    string[] DetectedProviders);

public sealed record HardwarePresenceProfile(
    bool NvidiaDriver,
    bool IntelMediaRuntime,
    bool NpuRuntime,
    bool IsArm64 = false,
    bool IsQualcomm = false,
    bool IsSurfaceProX = false,
    string ProcessorName = "",
    string SystemModel = "");
