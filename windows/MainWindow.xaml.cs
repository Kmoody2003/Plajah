using Microsoft.UI;
using Microsoft.UI.Composition.SystemBackdrops;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.Web.WebView2.Core;
using Plajah.Windows.Services;
using System;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using Windows.Graphics;
using Windows.Storage.Streams;
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
            if (presenter.State == OverlappedPresenterState.Minimized)
            {
                presenter.Restore();
            }
        }

        // Notify web UI of window state changes (fullscreen / maximized)
        appWin.Changed += (sender, args) =>
        {
            if (args.DidPresenterChange || args.DidSizeChange)
            {
                var isFs = sender.Presenter.Kind == AppWindowPresenterKind.FullScreen;
                var isMax = (sender.Presenter is OverlappedPresenter op) && op.State == OverlappedPresenterState.Maximized;
                PostMessageToWeb(System.Text.Json.JsonSerializer.Serialize(new
                {
                    type = "WINDOW_STATE_CHANGED",
                    isFullscreen = isFs,
                    isMaximized = isMax
                }));
            }
        };

        appWin.Show(true);
        this.Title = "Plajah";
    }

    // ── Mica material ─────────────────────────────────────────────────────────
    private void ConfigureBackdrop()
    {
        if (MicaController.IsSupported())
        {
            SystemBackdrop = new Microsoft.UI.Xaml.Media.MicaBackdrop { Kind = Microsoft.UI.Composition.SystemBackdrops.MicaKind.BaseAlt };
        }
        else if (DesktopAcrylicController.IsSupported())
        {
            SystemBackdrop = new Microsoft.UI.Xaml.Media.DesktopAcrylicBackdrop();
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
            theme == ElementTheme.Dark ? global::Windows.UI.Color.FromArgb(0x20, 0xFF, 0xFF, 0xFF)
                                       : global::Windows.UI.Color.FromArgb(0x20, 0x00, 0x00, 0x00);
    }

    // ── WebView2 initialisation ───────────────────────────────────────────────
    private async System.Threading.Tasks.Task InitWebView2Async()
    {
        // User data folder: %LOCALAPPDATA%\Plajah\WebView2
        var userDataFolder = System.IO.Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Plajah", "WebView2");

        var isArm64 = System.Runtime.InteropServices.RuntimeInformation.OSArchitecture == System.Runtime.InteropServices.Architecture.Arm64;
        var additionalArgs = isArm64
            ? "--enable-features=msWebView2EnableDraggableRegions,WebCodecs,WebGPU,CanvasOopRasterization,UseDirectCompositionVideoOverlays,AudioWorkletRealtimeThread --disable-features=CalculateNativeWinOcclusion --autoplay-policy=no-user-gesture-required --use-angle=d3d11 --enable-gpu-rasterization --enable-zero-copy --enable-accelerated-video-decode --enable-accelerated-video-encode --enable-accelerated-2d-canvas --gpu-rasterization-msaa-sample-count=0"
            : "--enable-features=msWebView2EnableDraggableRegions,WebCodecs,WebGPU,CanvasOopRasterization,AudioWorkletRealtimeThread --disable-features=CalculateNativeWinOcclusion --autoplay-policy=no-user-gesture-required --force_high_performance_gpu --enable-gpu-rasterization --enable-zero-copy --enable-accelerated-2d-canvas --enable-accelerated-video-decode --enable-accelerated-video-encode";

        var env = await CoreWebView2Environment.CreateWithOptionsAsync(
            browserExecutableFolder: null,
            userDataFolder: userDataFolder,
            options: new CoreWebView2EnvironmentOptions
            {
                AdditionalBrowserArguments = additionalArgs,
            });

        await WebView.EnsureCoreWebView2Async(env);

        var wv2 = WebView.CoreWebView2;

        // Settings
        wv2.Settings.IsWebMessageEnabled              = true;
        wv2.Settings.AreDefaultContextMenusEnabled    = true;
        wv2.Settings.IsStatusBarEnabled               = false;
        wv2.Settings.IsZoomControlEnabled             = false;
        wv2.Settings.AreDevToolsEnabled               = true;

        // Failsafe local media streaming handler with CORS support
        try
        {
            wv2.AddWebResourceRequestedFilter("https://localmedia.plajah/*", CoreWebView2WebResourceContext.All);
            wv2.WebResourceRequested += (sender, args) =>
            {
                try
                {
                    var reqUri = new Uri(args.Request.Uri);
                    if (reqUri.Host.Equals("localmedia.plajah", StringComparison.OrdinalIgnoreCase))
                    {
                        var folder = _pendingFolderMapping;
                        if (!string.IsNullOrEmpty(folder))
                        {
                            var relPath = Uri.UnescapeDataString(reqUri.AbsolutePath.TrimStart('/'));
                            var fullPath = System.IO.Path.Combine(folder, relPath.Replace('/', System.IO.Path.DirectorySeparatorChar));
                            if (!System.IO.File.Exists(fullPath) && System.IO.File.Exists(relPath))
                            {
                                fullPath = relPath;
                            }

                            if (System.IO.File.Exists(fullPath))
                            {
                                var ext = System.IO.Path.GetExtension(fullPath).ToLowerInvariant();
                                var mime = ext switch
                                {
                                    ".jpg" or ".jpeg" => "image/jpeg",
                                    ".png" => "image/png",
                                    ".gif" => "image/gif",
                                    ".webp" => "image/webp",
                                    ".svg" => "image/svg+xml",
                                    ".bmp" => "image/bmp",
                                    ".avif" => "image/avif",
                                    ".mp4" => "video/mp4",
                                    ".webm" => "video/webm",
                                    ".mov" => "video/quicktime",
                                    ".mp3" => "audio/mpeg",
                                    ".wav" => "audio/wav",
                                    ".flac" => "audio/flac",
                                    ".aac" => "audio/aac",
                                    ".ogg" => "audio/ogg",
                                    _ => "application/octet-stream"
                                };
                                var stream = new System.IO.FileStream(fullPath, System.IO.FileMode.Open, System.IO.FileAccess.Read, System.IO.FileShare.ReadWrite | System.IO.FileShare.Delete);
                                var response = wv2.Environment.CreateWebResourceResponse(
                                    stream.AsRandomAccessStream(),
                                    200,
                                    "OK",
                                    $"Content-Type: {mime}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nCache-Control: public, max-age=86400"
                                );
                                args.Response = response;
                            }
                        }
                    }
                }
                catch { }
            };
        }
        catch { }

        if (!string.IsNullOrEmpty(_pendingFolderMapping))
        {
            try
            {
                wv2.ClearVirtualHostNameToFolderMapping("localmedia.plajah");
            }
            catch { }
            try
            {
                wv2.SetVirtualHostNameToFolderMapping(
                    "localmedia.plajah",
                    _pendingFolderMapping,
                    CoreWebView2HostResourceAccessKind.Allow);
            }
            catch { }
        }

        // Inject WebView2 detection flag before any page scripts run
        await wv2.AddScriptToExecuteOnDocumentCreatedAsync(
            "window.__PLAJAH_WINUI__ = true; window.__PLAJAH_PLATFORM__ = 'windows';");

        // Register native bridge object
        _bridge = new WebBridgeService(wv2, _smtc!, _toast!, HandleBridgeCommand);
        wv2.AddHostObjectToScript("plajahNative", _bridge.HostObject);

        // Check for active local Vite/Express dev server (port 3000 from npm run dev or 5173 from vite)
        string? localDevUrl = null;
        if (string.IsNullOrEmpty(_pendingActivationJson))
        {
            try
            {
                using var cts = new System.Threading.CancellationTokenSource(60);
                var ports = new[] { 3000, 5173 };
                var tasks = ports.Select(async port =>
                {
                    try
                    {
                        using var http = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromMilliseconds(60) };
                        var devResp = await http.GetAsync($"http://localhost:{port}", cts.Token);
                        if (devResp.IsSuccessStatusCode) return $"http://localhost:{port}";
                    }
                    catch { }
                    return null;
                }).ToArray();
                var results = await System.Threading.Tasks.Task.WhenAll(tasks);
                localDevUrl = results.FirstOrDefault(r => r != null);
            }
            catch { }
        }

        if (localDevUrl != null)
        {
            wv2.Navigate(localDevUrl);
        }
        else
        {
            var searchDir = new System.IO.DirectoryInfo(AppContext.BaseDirectory);
            string? chosenDir = null;
            for (int depth = 0; depth < 5 && searchDir != null; depth++)
            {
                var candidateDist = System.IO.Path.Combine(searchDir.FullName, "dist");
                if (System.IO.Directory.Exists(candidateDist) && System.IO.File.Exists(System.IO.Path.Combine(candidateDist, "index.html")))
                {
                    chosenDir = candidateDist;
                    break;
                }
                searchDir = searchDir.Parent;
            }

            if (!string.IsNullOrEmpty(chosenDir))
            {
                wv2.SetVirtualHostNameToFolderMapping("app.plajah.com", chosenDir, CoreWebView2HostResourceAccessKind.Allow);
                wv2.Navigate("https://app.plajah.com/index.html");
            }
            else
            {
                wv2.Navigate(ProductionUrl);
            }
        }
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
            if (!string.IsNullOrEmpty(_pendingFolderMapping))
            {
                try
                {
                    WebView.CoreWebView2?.ClearVirtualHostNameToFolderMapping("localmedia.plajah");
                }
                catch { }
                try
                {
                    WebView.CoreWebView2?.SetVirtualHostNameToFolderMapping(
                        "localmedia.plajah",
                        _pendingFolderMapping,
                        CoreWebView2HostResourceAccessKind.Allow);
                }
                catch { }
            }

            // Seed jump list entries after successful load
            await _jumpList!.UpdateJumpListAsync();
            if (!string.IsNullOrEmpty(_pendingActivationJson))
            {
                PostMessageToWeb(_pendingActivationJson);
                _pendingActivationJson = null;
            }
        }
    }

    private async void WebView_MessageReceived(WebView2 sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        var json = args.TryGetWebMessageAsString();
        if (string.IsNullOrEmpty(json)) return;
        if (json.Contains("\"SPEECH_")) { _ = HandleSpeechMessageAsync(json); return; }   // Voca read-aloud
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            var root = doc.RootElement;
            var type = root.TryGetProperty("type", out var t) ? t.GetString() : null;
            if (type == "WINDOW_MINIMIZE")
            {
                DispatcherQueue.TryEnqueue(() =>
                {
                    var hwnd = WindowNative.GetWindowHandle(this);
                    var wndId = Win32Interop.GetWindowIdFromWindow(hwnd);
                    var appWin = AppWindow.GetFromWindowId(wndId);
                    if (appWin.Presenter is OverlappedPresenter presenter)
                    {
                        presenter.Minimize();
                    }
                });
                return;
            }
            else if (type == "WINDOW_MAXIMIZE")
            {
                DispatcherQueue.TryEnqueue(() =>
                {
                    var hwnd = WindowNative.GetWindowHandle(this);
                    var wndId = Win32Interop.GetWindowIdFromWindow(hwnd);
                    var appWin = AppWindow.GetFromWindowId(wndId);
                    if (appWin.Presenter is OverlappedPresenter presenter)
                    {
                        if (presenter.State == OverlappedPresenterState.Maximized)
                            presenter.Restore();
                        else
                            presenter.Maximize();
                    }
                });
                return;
            }
            else if (type == "WINDOW_RESTORE")
            {
                DispatcherQueue.TryEnqueue(() =>
                {
                    var hwnd = WindowNative.GetWindowHandle(this);
                    var wndId = Win32Interop.GetWindowIdFromWindow(hwnd);
                    var appWin = AppWindow.GetFromWindowId(wndId);
                    if (appWin.Presenter is OverlappedPresenter presenter)
                    {
                        presenter.Restore();
                    }
                });
                return;
            }
            else if (type == "WINDOW_CLOSE")
            {
                DispatcherQueue.TryEnqueue(() => this.Close());
                return;
            }
            else if (type == "WINDOW_FULLSCREEN_TOGGLE")
            {
                DispatcherQueue.TryEnqueue(() =>
                {
                    var hwnd = WindowNative.GetWindowHandle(this);
                    var wndId = Win32Interop.GetWindowIdFromWindow(hwnd);
                    var appWin = AppWindow.GetFromWindowId(wndId);
                    if (appWin.Presenter.Kind == AppWindowPresenterKind.FullScreen)
                    {
                        appWin.SetPresenter(AppWindowPresenterKind.Default);
                        PostMessageToWeb(System.Text.Json.JsonSerializer.Serialize(new
                        {
                            type = "WINDOW_STATE_CHANGED",
                            isFullscreen = false,
                            isMaximized = appWin.Presenter is OverlappedPresenter op && op.State == OverlappedPresenterState.Maximized
                        }));
                    }
                    else
                    {
                        appWin.SetPresenter(AppWindowPresenterKind.FullScreen);
                        PostMessageToWeb(System.Text.Json.JsonSerializer.Serialize(new
                        {
                            type = "WINDOW_STATE_CHANGED",
                            isFullscreen = true,
                            isMaximized = false
                        }));
                    }
                });
                return;
            }
            else if (type == "WINDOW_FULLSCREEN_SET")
            {
                var reqFs = root.TryGetProperty("fullscreen", out var fsVal) && fsVal.GetBoolean();
                DispatcherQueue.TryEnqueue(() =>
                {
                    var hwnd = WindowNative.GetWindowHandle(this);
                    var wndId = Win32Interop.GetWindowIdFromWindow(hwnd);
                    var appWin = AppWindow.GetFromWindowId(wndId);
                    if (reqFs)
                    {
                        appWin.SetPresenter(AppWindowPresenterKind.FullScreen);
                        PostMessageToWeb(System.Text.Json.JsonSerializer.Serialize(new
                        {
                            type = "WINDOW_STATE_CHANGED",
                            isFullscreen = true,
                            isMaximized = false
                        }));
                    }
                    else
                    {
                        appWin.SetPresenter(AppWindowPresenterKind.Default);
                        PostMessageToWeb(System.Text.Json.JsonSerializer.Serialize(new
                        {
                            type = "WINDOW_STATE_CHANGED",
                            isFullscreen = false,
                            isMaximized = appWin.Presenter is OverlappedPresenter op && op.State == OverlappedPresenterState.Maximized
                        }));
                    }
                });
                return;
            }
            else if (type == "GET_WINDOW_STATE")
            {
                DispatcherQueue.TryEnqueue(() =>
                {
                    var hwnd = WindowNative.GetWindowHandle(this);
                    var wndId = Win32Interop.GetWindowIdFromWindow(hwnd);
                    var appWin = AppWindow.GetFromWindowId(wndId);
                    var isFs = appWin.Presenter.Kind == AppWindowPresenterKind.FullScreen;
                    var isMax = (appWin.Presenter is OverlappedPresenter op) && op.State == OverlappedPresenterState.Maximized;
                    PostMessageToWeb(System.Text.Json.JsonSerializer.Serialize(new
                    {
                        type = "WINDOW_STATE_CHANGED",
                        isFullscreen = isFs,
                        isMaximized = isMax
                    }));
                });
                return;
            }
            else if (type == "WINDOW_DRAG")
            {
                DispatcherQueue.TryEnqueue(() =>
                {
                    var hwnd = WindowNative.GetWindowHandle(this);
                    ReleaseCapture();
                    SendMessage(hwnd, WM_NCLBUTTONDOWN, (IntPtr)HT_CAPTION, IntPtr.Zero);
                });
                return;
            }
            else if (type == "PICK_FOLDER")
            {
                var folderPicker = new global::Windows.Storage.Pickers.FolderPicker();
                var hwnd = WindowNative.GetWindowHandle(this);
                InitializeWithWindow.Initialize(folderPicker, hwnd);
                folderPicker.FileTypeFilter.Add("*");
                var folder = await folderPicker.PickSingleFolderAsync();
                if (folder is null)
                {
                    PostMessageToWeb("""{"type":"PICK_FOLDER_RESULT","cancelled":true}""");
                    return;
                }
                try
                {
                    WebView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                        "localmedia.plajah",
                        folder.Path,
                        CoreWebView2HostResourceAccessKind.Allow);
                }
                catch { }

                var mediaExtensions = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase)
                {
                    ".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".mpg", ".mpeg",
                    ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".aiff", ".aif",
                    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".heic", ".tif", ".tiff", ".svg"
                };

                var fileList = new System.Collections.Generic.List<object>();
                try
                {
                    var dirInfo = new System.IO.DirectoryInfo(folder.Path);
                    foreach (var fi in dirInfo.EnumerateFiles("*", System.IO.SearchOption.AllDirectories))
                    {
                        if (mediaExtensions.Contains(fi.Extension))
                        {
                            var relPath = System.IO.Path.GetRelativePath(folder.Path, fi.FullName).Replace('\\', '/');
                            fileList.Add(new
                            {
                                name = fi.Name,
                                relativePath = relPath,
                                fullPath = fi.FullName,
                                size = fi.Length,
                                lastModified = new DateTimeOffset(fi.LastWriteTimeUtc).ToUnixTimeMilliseconds(),
                                url = $"https://localmedia.plajah/{Uri.EscapeDataString(relPath).Replace("%2F", "/")}"
                            });
                        }
                    }
                }
                catch { }

                PostMessageToWeb(System.Text.Json.JsonSerializer.Serialize(new
                {
                    type = "PICK_FOLDER_RESULT",
                    cancelled = false,
                    folderPath = folder.Path,
                    folderName = folder.Name,
                    files = fileList
                }));
                return;
            }
            else if (type == "PICK_FILE")
            {
                var filePicker = new global::Windows.Storage.Pickers.FileOpenPicker();
                var hwnd = WindowNative.GetWindowHandle(this);
                InitializeWithWindow.Initialize(filePicker, hwnd);
                filePicker.FileTypeFilter.Add("*");
                var file = await filePicker.PickSingleFileAsync();
                if (file is null)
                {
                    PostMessageToWeb("""{"type":"PICK_FILE_RESULT","cancelled":true}""");
                    return;
                }

                var dirPath = System.IO.Path.GetDirectoryName(file.Path);
                if (!string.IsNullOrEmpty(dirPath))
                {
                    try
                    {
                        WebView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                            "localmedia.plajah",
                            dirPath,
                            CoreWebView2HostResourceAccessKind.Allow);
                    }
                    catch { }
                }

                var fi = new System.IO.FileInfo(file.Path);
                PostMessageToWeb(System.Text.Json.JsonSerializer.Serialize(new
                {
                    type = "PICK_FILE_RESULT",
                    cancelled = false,
                    name = file.Name,
                    fullPath = file.Path,
                    folderPath = dirPath ?? string.Empty,
                    size = fi.Exists ? fi.Length : 0,
                    lastModified = fi.Exists ? new DateTimeOffset(fi.LastWriteTimeUtc).ToUnixTimeMilliseconds() : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    url = $"https://localmedia.plajah/{Uri.EscapeDataString(file.Name)}"
                }));
                return;
            }
            else if (type == "READ_FILE_BYTES")
            {
                var path = root.TryGetProperty("path", out var pVal) ? pVal.GetString() : null;
                if (!string.IsNullOrEmpty(path) && System.IO.File.Exists(path))
                {
                    var bytes = await System.IO.File.ReadAllBytesAsync(path);
                    var base64 = Convert.ToBase64String(bytes);
                    PostMessageToWeb(System.Text.Json.JsonSerializer.Serialize(new { type = "READ_FILE_BYTES_RESULT", success = true, path, base64 }));
                }
                else
                {
                    PostMessageToWeb(System.Text.Json.JsonSerializer.Serialize(new { type = "READ_FILE_BYTES_RESULT", success = false, path, error = "File not found" }));
                }
                return;
            }
            else if (type == "SCAN_WINDOWS_LIBRARY")
            {
                var libType = root.TryGetProperty("libraryType", out var lt) ? lt.GetString()?.ToLowerInvariant() : "pictures";
                string targetDir = libType switch
                {
                    "videos" => Environment.GetFolderPath(Environment.SpecialFolder.MyVideos),
                    "music" => Environment.GetFolderPath(Environment.SpecialFolder.MyMusic),
                    _ => Environment.GetFolderPath(Environment.SpecialFolder.MyPictures)
                };

                if (string.IsNullOrEmpty(targetDir) || !System.IO.Directory.Exists(targetDir))
                {
                    targetDir = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                        libType switch { "videos" => "Videos", "music" => "Music", _ => "Pictures" });
                }

                if (System.IO.Directory.Exists(targetDir))
                {
                    try
                    {
                        WebView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                            "localmedia.plajah",
                            targetDir,
                            CoreWebView2HostResourceAccessKind.Allow);
                    }
                    catch { }

                    var mediaExts = libType switch
                    {
                        "videos" => new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase) { ".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".mpg", ".mpeg", ".wmv" },
                        "music" => new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase) { ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".aiff", ".aif", ".wma" },
                        _ => new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase) { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp", ".tiff", ".tif", ".ico", ".svg", ".heic", ".dng", ".raw" }
                    };

                    var files = new System.Collections.Generic.List<object>();
                    var dir = new System.IO.DirectoryInfo(targetDir);
                    foreach (var fi in dir.EnumerateFiles("*", System.IO.SearchOption.AllDirectories))
                    {
                        if (mediaExts.Contains(fi.Extension))
                        {
                            var relPath = System.IO.Path.GetRelativePath(targetDir, fi.FullName).Replace('\\', '/');
                            files.Add(new
                            {
                                name = fi.Name,
                                relativePath = relPath,
                                fullPath = fi.FullName,
                                folderPath = fi.DirectoryName ?? targetDir,
                                size = fi.Length,
                                lastModified = new DateTimeOffset(fi.LastWriteTimeUtc).ToUnixTimeMilliseconds(),
                                url = $"https://localmedia.plajah/{Uri.EscapeDataString(relPath).Replace("%2F", "/")}"
                            });
                        }
                    }

                    var subdirs = new System.Collections.Generic.List<string>();
                    try
                    {
                        foreach (var sd in dir.EnumerateDirectories()) subdirs.Add(sd.Name);
                    }
                    catch { }

                    PostMessageToWeb(System.Text.Json.JsonSerializer.Serialize(new
                    {
                        type = "SCAN_WINDOWS_LIBRARY_RESULT",
                        success = true,
                        libraryType = libType,
                        folderPath = targetDir,
                        folderName = dir.Name,
                        files,
                        subfolders = subdirs
                    }));
                }
                else
                {
                    PostMessageToWeb(System.Text.Json.JsonSerializer.Serialize(new
                    {
                        type = "SCAN_WINDOWS_LIBRARY_RESULT",
                        success = false,
                        libraryType = libType,
                        error = "Directory does not exist",
                        files = new System.Collections.Generic.List<object>()
                    }));
                }
                return;
            }
            else if (type == "SHOW_IN_EXPLORER")
            {
                var path = root.TryGetProperty("filePath", out var fp) ? fp.GetString() : null;
                if (!string.IsNullOrEmpty(path))
                {
                    if (System.IO.File.Exists(path))
                    {
                        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                        {
                            FileName = "explorer.exe",
                            Arguments = $"/select,\"{path}\"",
                            UseShellExecute = true
                        });
                        PostMessageToWeb(System.Text.Json.JsonSerializer.Serialize(new { type = "SHOW_IN_EXPLORER_RESULT", success = true, filePath = path }));
                    }
                    else if (System.IO.Directory.Exists(path))
                    {
                        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                        {
                            FileName = "explorer.exe",
                            Arguments = $"\"{path}\"",
                            UseShellExecute = true
                        });
                        PostMessageToWeb(System.Text.Json.JsonSerializer.Serialize(new { type = "SHOW_IN_EXPLORER_RESULT", success = true, filePath = path }));
                    }
                    else
                    {
                        PostMessageToWeb(System.Text.Json.JsonSerializer.Serialize(new { type = "SHOW_IN_EXPLORER_RESULT", success = false, filePath = path, error = "Item not found" }));
                    }
                }
                return;
            }
            else if (type == "SET_AS_WALLPAPER")
            {
                var path = root.TryGetProperty("filePath", out var wp) ? wp.GetString() : null;
                if (!string.IsNullOrEmpty(path) && System.IO.File.Exists(path))
                {
                    int res = SystemParametersInfo(SPI_SETDESKWALLPAPER, 0, path, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);
                    PostMessageToWeb(System.Text.Json.JsonSerializer.Serialize(new { type = "SET_AS_WALLPAPER_RESULT", success = res != 0, filePath = path }));
                }
                else
                {
                    PostMessageToWeb(System.Text.Json.JsonSerializer.Serialize(new { type = "SET_AS_WALLPAPER_RESULT", success = false, filePath = path, error = "File not found" }));
                }
                return;
            }
            else if (type == "DELETE_FILE")
            {
                var path = root.TryGetProperty("filePath", out var df) ? df.GetString() : null;
                if (!string.IsNullOrEmpty(path) && System.IO.File.Exists(path))
                {
                    System.IO.File.Delete(path);
                    PostMessageToWeb(System.Text.Json.JsonSerializer.Serialize(new { type = "DELETE_FILE_RESULT", success = true, filePath = path }));
                }
                else
                {
                    PostMessageToWeb(System.Text.Json.JsonSerializer.Serialize(new { type = "DELETE_FILE_RESULT", success = false, filePath = path, error = "File not found" }));
                }
                return;
            }
            else if (type == "SAVE_IMAGE_FILE")
            {
                var path = root.TryGetProperty("filePath", out var sf) ? sf.GetString() : null;
                var base64 = root.TryGetProperty("base64Data", out var b64) ? b64.GetString() : null;
                var overwrite = root.TryGetProperty("overwrite", out var ow) && ow.GetBoolean();

                if (!string.IsNullOrEmpty(path) && !string.IsNullOrEmpty(base64))
                {
                    var targetPath = path;
                    if (!overwrite && System.IO.File.Exists(path))
                    {
                        var dir = System.IO.Path.GetDirectoryName(path) ?? "";
                        var name = System.IO.Path.GetFileNameWithoutExtension(path);
                        var ext = System.IO.Path.GetExtension(path);
                        int counter = 1;
                        do
                        {
                            targetPath = System.IO.Path.Combine(dir, $"{name}_{counter}{ext}");
                            counter++;
                        } while (System.IO.File.Exists(targetPath));
                    }

                    var cleanBase64 = base64;
                    var commaIdx = cleanBase64.IndexOf(',');
                    if (commaIdx >= 0) cleanBase64 = cleanBase64.Substring(commaIdx + 1);

                    var bytes = Convert.FromBase64String(cleanBase64);
                    await System.IO.File.WriteAllBytesAsync(targetPath, bytes);

                    var fi = new System.IO.FileInfo(targetPath);
                    var folder = fi.DirectoryName ?? "";
                    var relPath = System.IO.Path.GetRelativePath(folder, targetPath).Replace('\\', '/');

                    PostMessageToWeb(System.Text.Json.JsonSerializer.Serialize(new
                    {
                        type = "SAVE_IMAGE_FILE_RESULT",
                        success = true,
                        originalPath = path,
                        savedPath = targetPath,
                        fileName = fi.Name,
                        size = fi.Length,
                        lastModified = new DateTimeOffset(fi.LastWriteTimeUtc).ToUnixTimeMilliseconds(),
                        url = $"https://localmedia.plajah/{Uri.EscapeDataString(relPath).Replace("%2F", "/")}"
                    }));
                }
                else
                {
                    PostMessageToWeb(System.Text.Json.JsonSerializer.Serialize(new { type = "SAVE_IMAGE_FILE_RESULT", success = false, error = "Invalid arguments" }));
                }
                return;
            }
        }
        catch { }
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
    // ── Voca read-aloud: native Windows speech (WebView2 has no Web Speech recogniser) ──────────
    private SpeechBridgeService? _speech;
    private async System.Threading.Tasks.Task HandleSpeechMessageAsync(string json)
    {
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            var root = doc.RootElement;
            var type = root.TryGetProperty("type", out var t) ? t.GetString() : null;
            _speech ??= new SpeechBridgeService(PostMessageToWeb);
            switch (type)
            {
                case "SPEECH_START":
                    var lang = root.TryGetProperty("lang", out var lv) ? lv.GetString() : "en-US";
                    var words = new System.Collections.Generic.List<string>();
                    if (root.TryGetProperty("words", out var wv) && wv.ValueKind == System.Text.Json.JsonValueKind.Array)
                        foreach (var w in wv.EnumerateArray()) { var sw = w.GetString(); if (!string.IsNullOrEmpty(sw)) words.Add(sw); }
                    await _speech.StartAsync(lang, words); break;
                case "SPEECH_STOP": await _speech.StopAsync(); break;
                case "SPEECH_SUSPEND": await _speech.SuspendAsync(); break;
                case "SPEECH_RESUME": await _speech.ResumeAsync(); break;
            }
        }
        catch (Exception ex) { System.Diagnostics.Debug.WriteLine($"[Speech] {ex.Message}"); }
    }

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

    private string? _pendingActivationJson = null;
    private string? _pendingFolderMapping = null;

    public void HandleActivationArgs(Microsoft.Windows.AppLifecycle.AppActivationArguments? args)
    {
        try
        {
            string? targetFilePath = null;
            if (args != null && args.Kind == Microsoft.Windows.AppLifecycle.ExtendedActivationKind.File)
            {
                if (args.Data is global::Windows.ApplicationModel.Activation.IFileActivatedEventArgs fileArgs && fileArgs.Files?.Count > 0)
                {
                    targetFilePath = fileArgs.Files[0].Path;
                }
            }

            if (string.IsNullOrEmpty(targetFilePath))
            {
                var cmdArgs = Environment.GetCommandLineArgs();
                if (cmdArgs.Length > 1 && System.IO.File.Exists(cmdArgs[1]))
                {
                    targetFilePath = cmdArgs[1];
                }
            }

            if (!string.IsNullOrEmpty(targetFilePath) && System.IO.File.Exists(targetFilePath))
            {
                ActivateMediaFile(targetFilePath);
            }
        }
        catch { }
    }

    public void ActivateMediaFile(string filePath)
    {
        try
        {
            var folder = System.IO.Path.GetDirectoryName(filePath);
            if (string.IsNullOrEmpty(folder)) return;
            _pendingFolderMapping = folder;

            if (WebView.CoreWebView2 != null)
            {
                try
                {
                    WebView.CoreWebView2.ClearVirtualHostNameToFolderMapping("localmedia.plajah");
                }
                catch { }
                try
                {
                    WebView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                        "localmedia.plajah",
                        folder,
                        CoreWebView2HostResourceAccessKind.Allow);
                }
                catch { }
            }

            var mediaExtensions = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp", ".tiff", ".tif", ".ico", ".svg", ".heic", ".dng", ".raw",
                ".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".mpg", ".mpeg", ".wmv",
                ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".aiff", ".aif", ".wma"
            };

            var activeFi = new System.IO.FileInfo(filePath);
            var activeRelPath = System.IO.Path.GetRelativePath(folder, filePath).Replace('\\', '/');
            var activeFileObj = new
            {
                name = activeFi.Name,
                fullPath = activeFi.FullName,
                folderPath = folder,
                relativePath = activeRelPath,
                size = activeFi.Length,
                lastModified = new DateTimeOffset(activeFi.LastWriteTimeUtc).ToUnixTimeMilliseconds(),
                url = $"https://localmedia.plajah/{Uri.EscapeDataString(activeRelPath).Replace("%2F", "/")}"
            };

            var siblingFiles = new System.Collections.Generic.List<object>();
            var dirInfo = new System.IO.DirectoryInfo(folder);
            foreach (var fi in dirInfo.EnumerateFiles("*", System.IO.SearchOption.TopDirectoryOnly))
            {
                if (mediaExtensions.Contains(fi.Extension))
                {
                    var relPath = System.IO.Path.GetRelativePath(folder, fi.FullName).Replace('\\', '/');
                    siblingFiles.Add(new
                    {
                        name = fi.Name,
                        fullPath = fi.FullName,
                        folderPath = folder,
                        relativePath = relPath,
                        size = fi.Length,
                        lastModified = new DateTimeOffset(fi.LastWriteTimeUtc).ToUnixTimeMilliseconds(),
                        url = $"https://localmedia.plajah/{Uri.EscapeDataString(relPath).Replace("%2F", "/")}"
                    });
                }
            }

            var payload = System.Text.Json.JsonSerializer.Serialize(new
            {
                type = "OPEN_MEDIA_FILE",
                activeFile = activeFileObj,
                folderFiles = siblingFiles
            });

            if (WebView.CoreWebView2 != null)
            {
                PostMessageToWeb(payload);
            }
            else
            {
                _pendingActivationJson = payload;
            }
        }
        catch { }
    }

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ReleaseCapture();

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int Msg, IntPtr wParam, IntPtr lParam);

    private const int WM_NCLBUTTONDOWN = 0xA1;
    private const int HT_CAPTION = 0x2;

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni);

    private const int SPI_SETDESKWALLPAPER = 20;
    private const int SPIF_UPDATEINIFILE = 0x01;
    private const int SPIF_SENDCHANGE = 0x02;
}
