using Microsoft.UI;
using Microsoft.UI.Composition.SystemBackdrops;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
using Plajah.Windows.Services;
using System;
using System.Runtime.InteropServices;
using Windows.Graphics;
using WinRT.Interop;

namespace Plajah.Windows;

public sealed partial class MainWindow : Window
{
    // ── Production URL — change to your deployed Plajah URL ─────────────────
    private const string ProductionUrl = "https://app.plajah.com";
    // Local dev server (Vite default): uncomment during development
    // private const string ProductionUrl = "http://localhost:5173";

    private SmtcService? _smtc;
    private WebBridgeService? _bridge;
    private JumpListService? _jumpList;
    private ToastService? _toast;

    public MainWindow()
    {
        InitializeComponent();

        ConfigureWindow();
        ConfigureBackdrop();
        ConfigureTitleBar();

        // Services
        _smtc   = new SmtcService(PostMessageToWeb);
        _toast  = new ToastService();
        _jumpList = new JumpListService();

        // Async init — fire and forget; NavigationCompleted will initialize bridge
        _ = InitWebView2Async();
    }

    // ── Window setup ──────────────────────────────────────────────────────────
    private void ConfigureWindow()
    {
        var hwnd   = WindowNative.GetWindowHandle(this);
        var wndId  = Win32Interop.GetWindowIdFromWindow(hwnd);
        var appWin = AppWindow.GetFromWindowId(wndId);

        // Minimum size: 960×600
        appWin.Resize(new SizeInt32(1280, 800));

        if (appWin.Presenter is OverlappedPresenter presenter)
        {
            presenter.IsResizable = true;
            presenter.IsMaximizable = true;
        }

        this.Title = "Plajah";
    }

    // ── Mica material ─────────────────────────────────────────────────────────
    private void ConfigureBackdrop()
    {
        if (MicaController.IsSupported())
        {
            SystemBackdrop = new MicaBackdrop { Kind = MicaKind.BaseAlt };
        }
        else if (DesktopAcrylicController.IsSupported())
        {
            SystemBackdrop = new DesktopAcrylicBackdrop();
        }
        // Fallback: solid dark background handled by RootGrid
    }

    // ── Custom title bar ──────────────────────────────────────────────────────
    private void ConfigureTitleBar()
    {
        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);

        // Listen for theme changes to update title bar button colors
        ((FrameworkElement)Content).ActualThemeChanged += (_, _) => UpdateTitleBarColors();
        UpdateTitleBarColors();
    }

    private void UpdateTitleBarColors()
    {
        var hwnd   = WindowNative.GetWindowHandle(this);
        var wndId  = Win32Interop.GetWindowIdFromWindow(hwnd);
        var appWin = AppWindow.GetFromWindowId(wndId);
        var titleBar = appWin.TitleBar;

        titleBar.ExtendsContentIntoTitleBar = true;
        titleBar.ButtonBackgroundColor         = Colors.Transparent;
        titleBar.ButtonInactiveBackgroundColor = Colors.Transparent;

        var theme = ((FrameworkElement)Content).ActualTheme;
        titleBar.ButtonForegroundColor =
            theme == ElementTheme.Dark ? Colors.White : Colors.Black;
        titleBar.ButtonHoverBackgroundColor =
            theme == ElementTheme.Dark ? Color.FromArgb(0x20, 0xFF, 0xFF, 0xFF)
                                       : Color.FromArgb(0x20, 0x00, 0x00, 0x00);
    }

    // ── WebView2 initialisation ───────────────────────────────────────────────
    private async System.Threading.Tasks.Task InitWebView2Async()
    {
        // User data folder: %LOCALAPPDATA%\Plajah\WebView2
        var userDataFolder = System.IO.Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Plajah", "WebView2");

        var env = await CoreWebView2Environment.CreateWithOptionsAsync(
            browserExecutableFolder: null,
            userDataFolder: userDataFolder,
            options: new CoreWebView2EnvironmentOptions
            {
                AdditionalBrowserArguments = "--enable-features=msWebView2EnableDraggableRegions",
            });

        await WebView.EnsureCoreWebView2Async(env);

        var wv2 = WebView.CoreWebView2;

        // Settings
        wv2.Settings.IsWebMessageEnabled              = true;
        wv2.Settings.AreDefaultContextMenusEnabled    = false;  // clean UX
        wv2.Settings.IsStatusBarEnabled               = false;
        wv2.Settings.IsZoomControlEnabled             = false;
        wv2.Settings.AreDevToolsEnabled               = System.Diagnostics.Debugger.IsAttached;

        // Inject WebView2 detection flag before any page scripts run
        await wv2.AddScriptToExecuteOnDocumentCreatedAsync(
            "window.__PLAJAH_WINUI__ = true; window.__PLAJAH_PLATFORM__ = 'windows';");

        // Register native bridge object
        _bridge = new WebBridgeService(wv2, _smtc!, _toast!, HandleBridgeCommand);
        await wv2.AddHostObjectToScriptAsync("plajahNative", _bridge.HostObject);

        // Navigate
        wv2.Navigate(ProductionUrl);
    }

    private async void WebView_NavigationCompleted(WebView2 sender, CoreWebView2NavigationCompletedEventArgs args)
    {
        DispatcherQueue.TryEnqueue(() =>
        {
            LoadingOverlay.Visibility = Visibility.Collapsed;
            OfflineBanner.Visibility  = args.IsSuccess ? Visibility.Collapsed : Visibility.Visible;
        });

        if (args.IsSuccess)
        {
            // Seed jump list entries after successful load
            await _jumpList!.UpdateJumpListAsync();
        }
    }

    private void WebView_MessageReceived(WebView2 sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        var json = args.TryGetWebMessageAsString();
        if (string.IsNullOrEmpty(json)) return;
        _bridge?.HandleIncomingMessage(json);
    }

    // ── Bridge command handler (dispatches to UI thread) ─────────────────────
    private void HandleBridgeCommand(BridgeCommand cmd)
    {
        DispatcherQueue.TryEnqueue(() =>
        {
            switch (cmd.Type)
            {
                case "TRACK_CHANGED":
                    UpdateMiniPlayer(cmd.TrackTitle, cmd.ArtistName, cmd.IsPlaying);
                    _smtc?.UpdateNowPlaying(cmd.TrackTitle ?? "", cmd.ArtistName ?? "", cmd.AlbumTitle ?? "", cmd.ArtworkUrl);
                    break;

                case "PLAYBACK_STATE":
                    UpdatePlaybackState(cmd.IsPlaying);
                    break;

                case "SHOW_NOTIFICATION":
                    _toast?.Show(cmd.Title ?? "Plajah", cmd.Body ?? "", cmd.DeepLink);
                    break;

                case "PAGE_TITLE":
                    TitleText.Text = string.IsNullOrEmpty(cmd.Title) ? "Plajah" : $"Plajah — {cmd.Title}";
                    this.Title = TitleText.Text;
                    break;
            }
        });
    }

    // ── Mini player in title bar ──────────────────────────────────────────────
    private void UpdateMiniPlayer(string? title, string? artist, bool isPlaying)
    {
        if (string.IsNullOrEmpty(title))
        {
            MiniPlayerPanel.Visibility = Visibility.Collapsed;
            return;
        }

        MiniTrackText.Text = $"{title} — {artist}";
        UpdatePlaybackState(isPlaying);
        MiniPlayerPanel.Visibility = Visibility.Visible;
        UpdateTitleBarDragRegions();
    }

    private void UpdatePlaybackState(bool isPlaying)
    {
        PlayPauseIcon.Glyph = isPlaying ? "" : ""; // Pause : Play
    }

    private void UpdateTitleBarDragRegions()
    {
        // Recalculate drag rectangles so mini player buttons remain clickable
        var hwnd   = WindowNative.GetWindowHandle(this);
        var wndId  = Win32Interop.GetWindowIdFromWindow(hwnd);
        var appWin = AppWindow.GetFromWindowId(wndId);
        var scale  = (float)appWin.Size.Width / (float)RootGrid.ActualWidth;

        appWin.TitleBar.SetDragRectangles(new[]
        {
            // Left drag region: icon + title
            new RectInt32(0, 0, (int)(200 * scale), (int)(48 * scale)),
        });
    }

    // ── Title bar button handlers ─────────────────────────────────────────────
    private void MiniPrev_Click(object sender, RoutedEventArgs e)
        => PostMessageToWeb("""{"type":"MEDIA_PREV"}""");

    private void MiniPlayPause_Click(object sender, RoutedEventArgs e)
        => PostMessageToWeb("""{"type":"MEDIA_PLAY_PAUSE"}""");

    private void MiniNext_Click(object sender, RoutedEventArgs e)
        => PostMessageToWeb("""{"type":"MEDIA_NEXT"}""");

    // ── Utilities ─────────────────────────────────────────────────────────────
    public void PostMessageToWeb(string json)
    {
        DispatcherQueue.TryEnqueue(() =>
            WebView.CoreWebView2?.PostWebMessageAsString(json));
    }

    public void NavigateToDeepLink(string path)
    {
        var url = ProductionUrl.TrimEnd('/') + "/" + path.TrimStart('/');
        WebView.CoreWebView2?.Navigate(url);
    }

    public void BringToFront()
    {
        var hwnd   = WindowNative.GetWindowHandle(this);
        var wndId  = Win32Interop.GetWindowIdFromWindow(hwnd);
        AppWindow.GetFromWindowId(wndId).Show(true);
        SetForegroundWindow(hwnd);
    }

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);
}
