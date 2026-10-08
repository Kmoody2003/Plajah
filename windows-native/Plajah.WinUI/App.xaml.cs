using Microsoft.UI.Xaml;
using Microsoft.Windows.AppLifecycle;
using System;
using System.IO;
using System.Threading.Tasks;

namespace Plajah.WinUI;

public partial class App : Application
{
    private static App? _instance;
    /// <summary>Set once the main window is closing: this process is on its way out and must not claim new launches.</summary>
    internal static volatile bool IsShuttingDown;
    private MainWindow? _window;

    public App()
    {
        _instance = this;
        InitializeComponent();
        InstallCrashGuards();
        // Single-instance redirection happens in Program.Main, before XAML starts.
    }

    /// <summary>
    /// Nothing thrown from a UI handler should take the whole app down. Without these, any exception
    /// escaping an event handler or async-void continuation became a fail-fast in CoreMessagingXP.dll
    /// (0xc000027b, a "stowed exception") — the repeated Plajah.WinUI.exe crashes in the event log.
    /// Each is logged to %LOCALAPPDATA%\Plajah\logs\crash.log so it can be found and fixed.
    /// </summary>
    private void InstallCrashGuards()
    {
        UnhandledException += (_, e) =>
        {
            CrashLog.Write("UI", e.Exception);
            e.Handled = true;
        };
        TaskScheduler.UnobservedTaskException += (_, e) =>
        {
            CrashLog.Write("Task", e.Exception);
            e.SetObserved();
        };
        AppDomain.CurrentDomain.UnhandledException += (_, e) =>
            CrashLog.Write("AppDomain", e.ExceptionObject as Exception);
    }

    internal static bool IsMediaFileActivation(AppActivationArguments? activation)
    {
        if (activation?.Kind == ExtendedActivationKind.File) return true;
        var cmdArgs = Environment.GetCommandLineArgs();
        if (cmdArgs.Length > 1 && !string.IsNullOrWhiteSpace(cmdArgs[1]) && !cmdArgs[1].StartsWith("-") && !cmdArgs[1].StartsWith("/"))
        {
            try { return File.Exists(cmdArgs[1]); } catch { }
        }
        return false;
    }

    /// <summary>Another launch was redirected to this (primary) instance. Raised on a background thread.</summary>
    internal static void OnRedirectedActivation(AppActivationArguments args)
    {
        if (IsShuttingDown)
        {
            // A launch landed on an instance that is closing. Release the key so the relaunch becomes
            // the primary instead of redirecting back here, then start it and let this process end.
            try { AppInstance.GetCurrent().UnregisterKey(); } catch { }
            try
            {
                var exe = Environment.ProcessPath;
                if (!string.IsNullOrEmpty(exe)) System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(exe) { UseShellExecute = true });
            }
            catch (Exception ex) { CrashLog.Write("Relaunch", ex); }
            return;
        }
        var window = _instance?._window;
        window?.DispatcherQueue.TryEnqueue(() =>
        {
            try
            {
                window.BringToFront();
                window.HandleActivationArgs(args);
            }
            catch (Exception ex) { CrashLog.Write("Redirect", ex); }
        });
    }

    protected override void OnLaunched(Microsoft.UI.Xaml.LaunchActivatedEventArgs args)
    {
        _window = new MainWindow();
        _window.Activate();
        _window.HandleActivationArgs(AppInstance.GetCurrent().GetActivatedEventArgs());
    }
}

internal static class CrashLog
{
    private static readonly object Gate = new();

    public static void Write(string source, Exception? ex)
    {
        try
        {
            System.Diagnostics.Debug.WriteLine($"[Plajah {source}] {ex}");
            var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Plajah", "logs");
            Directory.CreateDirectory(dir);
            var file = Path.Combine(dir, "crash.log");
            lock (Gate)
            {
                // Keep it bounded: roll over at 1 MB.
                var fi = new FileInfo(file);
                if (fi.Exists && fi.Length > 1_000_000) File.Move(file, file + ".old", overwrite: true);
                File.AppendAllText(file, $"{DateTimeOffset.Now:O} [{source}] {ex}{Environment.NewLine}{Environment.NewLine}");
            }
        }
        catch { /* logging must never throw */ }
    }
}
