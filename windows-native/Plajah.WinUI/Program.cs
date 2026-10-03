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

        if (activation != null) RedirectTo(primary, activation);
        return true;
    }

    private static void RedirectTo(AppInstance primary, AppActivationArguments activation)
    {
        var done = CreateEvent(IntPtr.Zero, true, false, null);
        Task.Run(() =>
        {
            try { primary.RedirectActivationToAsync(activation).AsTask().Wait(TimeSpan.FromSeconds(5)); }
            catch { /* primary busy or gone — this launch just exits */ }
            SetEvent(done);
        });
        // Pumps COM/window messages while waiting; 6s ceiling so this process can never hang.
        _ = CoWaitForMultipleObjects(0 /* CWMO_DEFAULT */, 6000, 1, new[] { done }, out _);
        CloseHandle(done);
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
