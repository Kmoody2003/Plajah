using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;

namespace Plajah.WinUI;

/// <summary>
/// Reads File Explorer's Recent items (%APPDATA%\Microsoft\Windows\Recent\*.lnk) so the Plajah Files
/// "Recent" view shows the same files and folders Windows does. Each shortcut is resolved to its
/// target without touching the network (SLR_NO_UI | SLR_NOSEARCH | SLR_NOTRACK | SLR_NOLINKINFO);
/// shortcuts whose target is gone are skipped.
/// </summary>
internal static class WindowsRecentItems
{
    public static object List(int limit)
    {
        try
        {
            var dir = Environment.GetFolderPath(Environment.SpecialFolder.Recent);
            if (string.IsNullOrEmpty(dir) || !Directory.Exists(dir))
                return new { success = false, error = "Windows Recent folder not found", entries = Array.Empty<object>() };

            var links = new DirectoryInfo(dir)
                .EnumerateFiles("*.lnk", new EnumerationOptions { IgnoreInaccessible = true })
                .OrderByDescending(f => f.LastWriteTimeUtc)
                .Take(Math.Clamp(limit, 1, 500) * 2);

            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var entries = new List<object>();
            foreach (var lnk in links)
            {
                if (entries.Count >= limit) break;
                var target = ResolveTarget(lnk.FullName);
                if (string.IsNullOrWhiteSpace(target) || !seen.Add(target)) continue;
                try
                {
                    // Skip UNC targets: probing an offline share can block for many seconds.
                    if (target.StartsWith(@"\\", StringComparison.Ordinal)) continue;
                    FileSystemInfo fsi = Directory.Exists(target) ? new DirectoryInfo(target) : new FileInfo(target);
                    if (!fsi.Exists) continue;
                    var isDir = fsi is DirectoryInfo;
                    entries.Add(new
                    {
                        name = fsi.Name.Length > 0 ? fsi.Name : target,
                        fullPath = fsi.FullName,
                        isDirectory = isDir,
                        size = fsi is FileInfo fi ? fi.Length : 0L,
                        lastModified = new DateTimeOffset(fsi.LastWriteTimeUtc).ToUnixTimeMilliseconds(),
                        // When the item was last opened, from the shortcut's own timestamp.
                        lastOpened = new DateTimeOffset(lnk.LastWriteTimeUtc).ToUnixTimeMilliseconds(),
                        extension = isDir ? "" : fsi.Extension,
                        isHidden = (fsi.Attributes & FileAttributes.Hidden) != 0,
                        isReadOnly = (fsi.Attributes & FileAttributes.ReadOnly) != 0,
                    });
                }
                catch { /* inaccessible target */ }
            }
            return new { success = true, path = dir, entries };
        }
        catch (Exception ex)
        {
            return new { success = false, error = ex.Message, entries = Array.Empty<object>() };
        }
    }

    private static string? ResolveTarget(string lnkPath)
    {
        object? obj = null;
        try
        {
            obj = new ShellLink();
            ((IPersistFile)obj).Load(lnkPath, 0 /* STGM_READ */);
            var link = (IShellLinkW)obj;
            // SLR_NO_UI(1) | SLR_NOUPDATE(8) | SLR_NOSEARCH(0x10) | SLR_NOTRACK(0x20) | SLR_NOLINKINFO(0x40), 100 ms cap.
            const uint flags = 0x1 | 0x8 | 0x10 | 0x20 | 0x40 | (100u << 16);
            try { link.Resolve(IntPtr.Zero, flags); } catch { /* use the stored path */ }
            var sb = new StringBuilder(1024);
            link.GetPath(sb, sb.Capacity, IntPtr.Zero, 0);
            var path = sb.ToString();
            return string.IsNullOrWhiteSpace(path) ? null : path;
        }
        catch
        {
            return null;
        }
        finally
        {
            if (obj != null) { try { Marshal.FinalReleaseComObject(obj); } catch { } }
        }
    }

    [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
    private class ShellLink { }

    [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("000214F9-0000-0000-C000-000000000046")]
    private interface IShellLinkW
    {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszFile, int cch, IntPtr pfd, uint fFlags);
        void GetIDList(out IntPtr ppidl);
        void SetIDList(IntPtr pidl);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszName, int cch);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszDir, int cch);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszArgs, int cch);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
        void GetHotkey(out short pwHotkey);
        void SetHotkey(short wHotkey);
        void GetShowCmd(out int piShowCmd);
        void SetShowCmd(int iShowCmd);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszIconPath, int cch, out int piIcon);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, uint dwReserved);
        void Resolve(IntPtr hwnd, uint fFlags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
    }

    [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("0000010b-0000-0000-C000-000000000046")]
    private interface IPersistFile
    {
        void GetClassID(out Guid pClassID);
        [PreserveSig] int IsDirty();
        void Load([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, uint dwMode);
        void Save([MarshalAs(UnmanagedType.LPWStr)] string? pszFileName, [MarshalAs(UnmanagedType.Bool)] bool fRemember);
        void SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string pszFileName);
        void GetCurFile([MarshalAs(UnmanagedType.LPWStr)] out string ppszFileName);
    }
}
