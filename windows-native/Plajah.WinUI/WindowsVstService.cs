using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Windows.Storage;

namespace Plajah.WinUI;

public static class WindowsVstService
{
    private const string SettingsKey = "vst3Directories";

    public static IReadOnlyList<string> GetDirectories()
    {
        var configured = ApplicationData.Current.LocalSettings.Values[SettingsKey] as string;
        var custom = string.IsNullOrWhiteSpace(configured)
            ? Array.Empty<string>()
            : configured.Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        return DefaultDirectories()
            .Concat(custom)
            .Where(Directory.Exists)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    public static IReadOnlyList<string> AddDirectory(string path)
    {
        var fullPath = Path.GetFullPath(path);
        if (!Directory.Exists(fullPath))
            throw new DirectoryNotFoundException(fullPath);

        var custom = GetCustomDirectories().Append(fullPath)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        SaveCustomDirectories(custom);
        return GetDirectories();
    }

    public static IReadOnlyList<string> RemoveDirectory(string path)
    {
        var fullPath = Path.GetFullPath(path);
        var custom = GetCustomDirectories()
            .Where(item => !string.Equals(item, fullPath, StringComparison.OrdinalIgnoreCase))
            .ToArray();
        SaveCustomDirectories(custom);
        return GetDirectories();
    }

    public static IReadOnlyList<WindowsVstPlugin> Scan()
    {
        var plugins = new List<WindowsVstPlugin>();
        foreach (var directory in GetDirectories())
        {
            IEnumerable<string> bundles;
            try
            {
                bundles = Directory.EnumerateDirectories(directory, "*.vst3", SearchOption.AllDirectories);
            }
            catch (IOException) { continue; }
            catch (UnauthorizedAccessException) { continue; }

            foreach (var bundle in bundles)
            {
                var name = Path.GetFileNameWithoutExtension(bundle);
                plugins.Add(new WindowsVstPlugin(name, bundle, "vst3"));
            }
        }
        return plugins
            .GroupBy(plugin => plugin.Path, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .OrderBy(plugin => plugin.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static IEnumerable<string> DefaultDirectories()
    {
        var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        var programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        return new[]
        {
            Path.Combine(programFiles, "Common Files", "VST3"),
            Path.Combine(programFilesX86, "Common Files", "VST3"),
        };
    }

    private static IEnumerable<string> GetCustomDirectories()
    {
        var configured = ApplicationData.Current.LocalSettings.Values[SettingsKey] as string;
        return string.IsNullOrWhiteSpace(configured)
            ? Array.Empty<string>()
            : configured.Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }

    private static void SaveCustomDirectories(IEnumerable<string> directories)
    {
        ApplicationData.Current.LocalSettings.Values[SettingsKey] = string.Join('|', directories);
    }
}

public sealed record WindowsVstPlugin(string Name, string Path, string Format);
