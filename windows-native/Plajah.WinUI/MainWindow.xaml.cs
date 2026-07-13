using System;
using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Media;
using Windows.Storage;

namespace Plajah.WinUI;

/// <summary>
/// The Plajah shell: a Mica-backed WinUI 3 window hosting the platform in WebView2.
/// Thin by design — native modules (file bridge, hardware render service) attach here later.
/// </summary>
public sealed partial class MainWindow : Window
{
    private const string AppUrl = "https://plajah.app"; // production PWA — one codebase, native shell
    private AppWindow? _appWindow;

    public MainWindow()
    {
        InitializeComponent();
        Title = "Plajah";

        // Win11-native chrome: Mica backdrop + content extended into the title bar.
        SystemBackdrop = new MicaBackdrop();
        ExtendsContentIntoTitleBar = true;
        SetTitleBar(TitleBarDragRegion);

        _appWindow = AppWindow;
        RestoreWindowBounds();
        _appWindow.Closing += (_, _) => SaveWindowBounds();

        _ = InitWebViewAsync();
    }

    private async System.Threading.Tasks.Task InitWebViewAsync()
    {
        await Web.EnsureCoreWebView2Async();
        var core = Web.CoreWebView2;

        core.Settings.IsStatusBarEnabled = false;
        core.Settings.AreDefaultContextMenusEnabled = true;
        core.Settings.IsGeneralAutofillEnabled = true;

        // Camera + microphone: Live, VTuber tracking and Perform capture need them without nagging.
        core.PermissionRequested += (_, e) =>
        {
            if (e.PermissionKind is Microsoft.Web.WebView2.Core.CoreWebView2PermissionKind.Camera
                or Microsoft.Web.WebView2.Core.CoreWebView2PermissionKind.Microphone)
                e.State = Microsoft.Web.WebView2.Core.CoreWebView2PermissionState.Allow;
        };

        // Keep Plajah navigation in-app; anything external goes to the default browser.
        core.NewWindowRequested += (_, e) =>
        {
            e.Handled = true;
            _ = Windows.System.Launcher.LaunchUriAsync(new Uri(e.Uri));
        };
        core.NavigationStarting += (_, e) =>
        {
            if (Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri)
                && uri.Host != new Uri(AppUrl).Host && !uri.Host.EndsWith("plajah.com")
                && !uri.Host.Contains("firebaseapp") && !uri.Host.Contains("googleapis")
                && !uri.Host.Contains("google.com") && !uri.Host.Contains("gstatic"))
            {
                e.Cancel = true;
                _ = Windows.System.Launcher.LaunchUriAsync(uri);
            }
        };

        // Fullscreen video (Reello/Taleo players) toggles the native window.
        core.ContainsFullScreenElementChanged += (_, _) =>
        {
            _appWindow?.SetPresenter(core.ContainsFullScreenElement
                ? AppWindowPresenterKind.FullScreen
                : AppWindowPresenterKind.Default);
        };

        core.Navigate(AppUrl);
    }

    private void SaveWindowBounds()
    {
        if (_appWindow is null) return;
        var s = ApplicationData.Current.LocalSettings.Values;
        s["winX"] = _appWindow.Position.X; s["winY"] = _appWindow.Position.Y;
        s["winW"] = _appWindow.Size.Width; s["winH"] = _appWindow.Size.Height;
    }

    private void RestoreWindowBounds()
    {
        var s = ApplicationData.Current.LocalSettings.Values;
        if (s.TryGetValue("winW", out var w) && s.TryGetValue("winH", out var h)
            && s.TryGetValue("winX", out var x) && s.TryGetValue("winY", out var y))
            _appWindow?.MoveAndResize(new Windows.Graphics.RectInt32((int)x!, (int)y!, (int)w!, (int)h!));
        else
            _appWindow?.Resize(new Windows.Graphics.SizeInt32(1440, 900));
    }
}
