// Serial ports for Plajah Build's machine bridge, straight on Win32 (no System.IO.Ports package).
// The port is opened overlapped so a pending read never blocks a write (GRBL real-time bytes and
// streamed lines go out while the reader waits for "ok"). Enumeration reads the registry the way
// Device Manager does: SERIALCOMM for the COM names, the Enum tree for friendly names (CH340, FTDI...).

using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32;
using Microsoft.Win32.SafeHandles;

namespace Plajah.WinUI;

internal static class FabSerialPort
{
    public sealed record PortInfo(string port, string name, string driver);

    [StructLayout(LayoutKind.Sequential)]
    private struct DCB
    {
        public uint DCBlength; public uint BaudRate; public uint Flags; public ushort wReserved; public ushort XonLim; public ushort XoffLim;
        public byte ByteSize; public byte Parity; public byte StopBits; public sbyte XonChar; public sbyte XoffChar; public sbyte ErrorChar; public sbyte EofChar; public sbyte EvtChar; public ushort wReserved1;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct COMMTIMEOUTS { public uint ReadIntervalTimeout, ReadTotalTimeoutMultiplier, ReadTotalTimeoutConstant, WriteTotalTimeoutMultiplier, WriteTotalTimeoutConstant; }

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GetCommState(SafeFileHandle h, ref DCB dcb);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool SetCommState(SafeFileHandle h, ref DCB dcb);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool SetCommTimeouts(SafeFileHandle h, ref COMMTIMEOUTS t);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool PurgeComm(SafeFileHandle h, uint flags);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool SetupComm(SafeFileHandle h, uint inQueue, uint outQueue);

    private const uint GENERIC_READ = 0x80000000, GENERIC_WRITE = 0x40000000, OPEN_EXISTING = 3, FILE_FLAG_OVERLAPPED = 0x40000000;
    private const uint PURGE_ALL = 0x0001 | 0x0002 | 0x0004 | 0x0008;

    /// <summary>Open COMn at the baud rate, 8N1, DTR and RTS on (most USB boards reset on DTR, which is expected).</summary>
    public static Stream Open(string port, int baud)
    {
        if (string.IsNullOrWhiteSpace(port) || !port.StartsWith("COM", StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("Pick a COM port.");
        var h = CreateFileW(@"\\.\" + port, GENERIC_READ | GENERIC_WRITE, 0, IntPtr.Zero, OPEN_EXISTING, FILE_FLAG_OVERLAPPED, IntPtr.Zero);
        if (h.IsInvalid)
        {
            var err = Marshal.GetLastWin32Error();
            throw new IOException(err switch
            {
                5 => $"{port} is in use by another program (a slicer, Arduino IDE, LightBurn...). Close it and try again.",
                2 => $"{port} is not there any more. Is the machine plugged in?",
                _ => $"Could not open {port} (Windows error {err}).",
            });
        }
        try
        {
            SetupComm(h, 8192, 8192);
            var dcb = new DCB { DCBlength = (uint)Marshal.SizeOf<DCB>() };
            if (!GetCommState(h, ref dcb)) throw new IOException($"Could not read {port} settings.");
            dcb.BaudRate = (uint)baud; dcb.ByteSize = 8; dcb.Parity = 0; dcb.StopBits = 0;
            // fBinary (bit 0), fDtrControl = ENABLE (bits 4-5 = 1), fRtsControl = ENABLE (bits 12-13 = 1); no flow control.
            dcb.Flags = 1u | (1u << 4) | (1u << 12);
            if (!SetCommState(h, ref dcb)) throw new IOException($"{port} refused {baud} baud.");
            // Reads return as soon as at least one byte is there, or after 500 ms with none.
            var t = new COMMTIMEOUTS { ReadIntervalTimeout = uint.MaxValue, ReadTotalTimeoutMultiplier = uint.MaxValue, ReadTotalTimeoutConstant = 500, WriteTotalTimeoutConstant = 5000 };
            if (!SetCommTimeouts(h, ref t)) throw new IOException($"Could not set {port} timeouts.");
            PurgeComm(h, PURGE_ALL);
            return new FileStream(h, FileAccess.ReadWrite, 1, isAsync: true);
        }
        catch { h.Dispose(); throw; }
    }

    /// <summary>COM ports present now, with the driver's friendly name where Windows has one.</summary>
    public static List<PortInfo> List()
    {
        var names = FriendlyNames(); var list = new List<PortInfo>();
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(@"HARDWARE\DEVICEMAP\SERIALCOMM");
            if (key is null) return list;
            foreach (var dev in key.GetValueNames())
            {
                if (key.GetValue(dev) is not string com) continue;
                var driver = dev.Replace(@"\Device\", "");
                list.Add(new PortInfo(com, names.TryGetValue(com, out var n) ? n : Guess(driver, com), driver));
            }
        }
        catch { /* no registry access: return what we have */ }
        list.Sort((a, b) => PortNumber(a.port).CompareTo(PortNumber(b.port)));
        return list;
    }

    private static int PortNumber(string com) => int.TryParse(com.AsSpan(3), out var n) ? n : 999;

    private static string Guess(string driver, string com)
    {
        var d = driver.ToLowerInvariant();
        if (d.Contains("ch34")) return $"USB-SERIAL CH340 ({com})";
        if (d.Contains("silab")) return $"CP210x USB to UART ({com})";
        if (d.Contains("vcp") || d.Contains("ftdi")) return $"FTDI USB serial ({com})";
        if (d.Contains("usbser")) return $"USB serial device ({com})";
        return com;
    }

    private static Dictionary<string, string> FriendlyNames()
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var root in new[] { "USB", "FTDIBUS", "ACPI" })
        {
            try
            {
                using var bus = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Enum\" + root);
                if (bus is null) continue;
                foreach (var hw in bus.GetSubKeyNames())
                {
                    using var hwKey = bus.OpenSubKey(hw); if (hwKey is null) continue;
                    foreach (var inst in hwKey.GetSubKeyNames())
                    {
                        using var instKey = hwKey.OpenSubKey(inst); if (instKey is null) continue;
                        using var p = instKey.OpenSubKey("Device Parameters");
                        if (p?.GetValue("PortName") is string com && instKey.GetValue("FriendlyName") is string fn) map[com] = fn;
                    }
                }
            }
            catch { /* key not readable */ }
        }
        return map;
    }
}
