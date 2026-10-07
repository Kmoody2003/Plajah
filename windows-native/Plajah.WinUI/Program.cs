using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.Windows.AppLifecycle;
using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;

namespace Plajah.WinUI;

/// <summary>
/// Custom entry point (DISABLE_XAML_GENERATED_MAIN) so single-instance redirection happens BEFORE
/// XAML starts — the Windows App SDK's documented pattern.
///
/// It used to run in the App constructor as RedirectActivationToAsync(...).AsTask().Wait(): a
/// blocking wait on the UI (STA) thread, which can deadlock because the redirect needs that thread
/// to pump COM messages. A second launch (Start tile, taskbar, an experience tile) could then hang
/// with "not responding". Here the wait is CoWaitForMultipleObjects (pumps while waiting) and is
/// bounded, so a launch can never hang on a busy primary instance.
/// </summary>
public static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        WinRT.ComWrappersSupport.InitializeComWrappers();
        if (DecideRedirection()) return 0;

        Application.Start(p =>
        {
            var context = new DispatcherQueueSynchronizationContext(DispatcherQueue.GetForCurrentThread());
            SynchronizationContext.SetSynchronizationContext(context);
            _ = new App();
        });
        return 0;
    }

    /// <returns>true when this activation was handed to the running instance and this process should exit.</returns>
    private static bool DecideRedirection()
    {
        AppActivationArguments? activation = null;
        try { activation = AppInstance.GetCurrent().GetActivatedEventArgs(); } catch { }

        // Opening a media file gets its own lightweight viewer process/window (never redirected).
        if (App.IsMediaFileActivation(activation))
        {
            AppInstance.FindOrRegisterForKey($"PlajahMediaViewer-{Guid.NewGuid():N}");
            return false;
        }

        var primary = AppInstance.FindOrRegisterForKey("PlajahApp-SingleInstance");
        if (primary.IsCurrent)
        {
            primary.Activated += (_, a) => App.OnRedirectedActivation(a);
            return false;
        }

        // The registered primary may be a leftover (window closed, process alive) or hung. Handing the
        // launch to it would silently do nothing, so a failed hand-off replaces it instead of exiting.
        if (activation != null && RedirectTo(primary, activation)) return true;

        if (!ReplaceStalePrimary()) return true;           // a healthy primary exists; this launch ends
        var again = AppInstance.FindOrRegisterForKey("PlajahApp-SingleInstance");
        if (again.IsCurrent)
        {
            again.Activated += (_, a) => App.OnRedirectedActivation(a);
            return false;
        }
        return true;
    }

    /// <returns>true when the hand-off was accepted by the running instance.</returns>
    private static bool RedirectTo(AppInstance primary, AppActivationArguments activation)
    {
        bool ok = false;
        var done = CreateEvent(IntPtr.Zero, true, false, null);
        Task.Run(() =>
        {
            try { ok = primary.RedirectActivationToAsync(activation).AsTask().Wait(TimeSpan.FromSeconds(5)); }
            catch { ok = false; /* primary busy or gone */ }
            SetEvent(done);
        });
        // Pumps COM/window messages while waiting; 6s ceiling so this process can never hang.
        var r = CoWaitForMultipleObjects(0 /* CWMO_DEFAULT */, 6000, 1, new[] { done }, out _);
        CloseHandle(done);
        return ok && r == 0;
    }

    /// <summary>
    /// Ends other Plajah instances that cannot serve a launch: not responding, or alive with no window.
    /// (A media-viewer process has a window and is left alone.)
    /// </summary>
    /// <returns>true when this launch may take over as primary.</returns>
    private static bool ReplaceStalePrimary()
    {
        bool killedAny = false;
        try
        {
            var me = System.Diagnostics.Process.GetCurrentProcess();
            foreach (var p in System.Diagnostics.Process.GetProcessesByName(me.ProcessName))
            {
                if (p.Id == me.Id) continue;
                bool stale = false;
                try { stale = !p.Responding || p.MainWindowHandle == IntPtr.Zero; } catch { stale = true; }
                if (!stale) continue;
                try { p.Kill(true); p.WaitForExit(3000); killedAny = true; } catch { }
            }
        }
        catch { }
        if (killedAny) Thread.Sleep(300);                   // let the key registration drop
        return killedAny;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr CreateEvent(IntPtr lpEventAttributes, bool bManualReset, bool bInitialState, string? lpName);

    [DllImport("kernel32.dll")]
    private static extern bool SetEvent(IntPtr hEvent);

    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr hObject);

    [DllImport("ole32.dll")]
    private static extern uint CoWaitForMultipleObjects(uint dwFlags, uint dwMilliseconds, uint nHandles, IntPtr[] pHandles, out uint dwIndex);
}
