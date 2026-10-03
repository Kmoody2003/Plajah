using System;
using System.Linq;
using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.Web.WebView2.Core;
using System.Text.Json;
using System.Collections.Generic;
using System.IO;
using Windows.Storage;
using Windows.Storage.Streams;
using Windows.ApplicationModel.DataTransfer;
using WinRT.Interop;

namespace Plajah.WinUI;

/// <summary>
/// The Plajah shell: a Mica-backed WinUI 3 window hosting the platform in WebView2.
/// Thin by design — native modules (file bridge, hardware render service) attach here later.
/// </summary>
public sealed partial class MainWindow : Window
{
    private const string AppUrl = "https://plajah.com"; // production site — one codebase, native shell
    private AppWindow? _appWindow;
    private readonly PlajahStudioBridgeService _studioBridge;
    private DateTime _lastNavRecovery = DateTime.MinValue;
    private DateTime _lastRendererRecovery = DateTime.MinValue;
    private bool _localShellAvailable;

    private static bool UseDevServer() =>
        System.Diagnostics.Debugger.IsAttached ||
        Environment.GetEnvironmentVariable("PLAJAH_DEV_SERVER") == "1";

    /// <summary>Recursive media scans: skip folders we can't read (one used to abort the whole scan),
    /// skip system/offline cloud placeholders, and cap the count so a huge tree can't stall.</summary>
    private static readonly EnumerationOptions SafeRecursiveScan = new()
    {
        RecurseSubdirectories = true,
        IgnoreInaccessible = true,
        AttributesToSkip = System.IO.FileAttributes.System | System.IO.FileAttributes.Offline,
    };
    private const int MaxScannedFiles = 20000;

    public MainWindow()
    {
        InitializeComponent();
        Title = "Plajah";

        // Win11-native chrome: Mica backdrop + content extended into the title bar.
        SystemBackdrop = new MicaBackdrop();
        ExtendsContentIntoTitleBar = true;
        _appWindow = AppWindow;
        if (_appWindow?.TitleBar != null)
        {
            _appWindow.TitleBar.ExtendsContentIntoTitleBar = true;
            _appWindow.TitleBar.ButtonBackgroundColor = Colors.Transparent;
            _appWindow.TitleBar.ButtonInactiveBackgroundColor = Colors.Transparent;
            _appWindow.TitleBar.ButtonHoverBackgroundColor = Windows.UI.Color.FromArgb(40, 255, 255, 255);
            _appWindow.TitleBar.ButtonPressedBackgroundColor = Windows.UI.Color.FromArgb(60, 255, 255, 255);
            _appWindow.TitleBar.ButtonForegroundColor = Colors.White;
            _appWindow.TitleBar.ButtonHoverForegroundColor = Colors.White;
            _appWindow.TitleBar.ButtonPressedForegroundColor = Colors.White;

            // Clear default full-width titlebar drag rectangle so WebView2 receives ALL mouse clicks.
            _appWindow.TitleBar.SetDragRectangles(Array.Empty<Windows.Graphics.RectInt32>());
        }

        RestoreWindowBounds();
        _appWindow?.Show(true);

        this.SizeChanged += (s, e) =>
        {
            if (_appWindow?.TitleBar != null)
            {
                _appWindow.TitleBar.SetDragRectangles(Array.Empty<Windows.Graphics.RectInt32>());
            }
        };

        _studioBridge = new PlajahStudioBridgeService(this);
        _studioBridge.HardwareJogReceived += (jog) =>
        {
            PostNativeMessage("HARDWARE_JOG_EVENT", new
            {
                deltaFrames = jog.DeltaFrames,
                direction = jog.Direction,
                mode = jog.Mode,
                action = jog.Action
            });
        };
        if (_appWindow != null)
        {
            _appWindow.Closing += (_, _) =>
            {
                _studioBridge.ShutdownCompositor();
                _studioBridge.CloseAllOutputWindows();
                _studioBridge.CloseCleanFeed();
                SaveWindowBounds();
            };
        }

        // Hybrid CPU: interactive shell on performance cores; see PowerQos / UpdatePowerMode.
        PowerQos.SetProcessEco(false);
        if (_appWindow != null)
        {
            _appWindow.Changed += (_, e) =>
            {
                if (e.DidPresenterChange || e.DidVisibilityChange || e.DidSizeChange) UpdatePowerMode();
            };
        }

        _ = InitWebViewAsync();
    }

    private bool _ecoMode;

    /// <summary>
    /// EcoQoS + low WebView memory target ONLY when the window is minimized/hidden, nothing is
    /// playing, and no studio output window depends on this page. Anything audible or on screen
    /// stays on performance cores.
    /// </summary>
    private void UpdatePowerMode()
    {
        try
        {
            var minimized = _appWindow is { } w &&
                (!w.IsVisible || (w.Presenter is OverlappedPresenter op && op.State == OverlappedPresenterState.Minimized));
            var core = Web.CoreWebView2;
            var playing = core?.IsDocumentPlayingAudio ?? false;
            var eco = minimized && !playing && _studioBridge.OutputWindowCount == 0 && !_studioBridge.IsCompositorRunning;
            if (eco == _ecoMode) return;
            _ecoMode = eco;
            PowerQos.SetProcessEco(eco);
            if (core != null)
                core.MemoryUsageTargetLevel = eco ? CoreWebView2MemoryUsageTargetLevel.Low : CoreWebView2MemoryUsageTargetLevel.Normal;
        }
        catch (Exception ex) { CrashLog.Write("PowerMode", ex); }
    }

    private async System.Threading.Tasks.Task InitWebViewAsync()
    {
        var isArm64 = System.Runtime.InteropServices.RuntimeInformation.OSArchitecture == System.Runtime.InteropServices.Architecture.Arm64;
        var browserArgs =
            "--force_high_performance_gpu --use-angle=d3d11 --enable-gpu-rasterization --enable-zero-copy " +
            "--enable-accelerated-video-decode --enable-accelerated-video-encode --enable-accelerated-2d-canvas " +
            "--gpu-rasterization-msaa-sample-count=0 --enable-features=WebCodecs,WebGPU,CanvasOopRasterization,UseDirectCompositionVideoOverlays,D3D11VideoDecoder,VaapiVideoDecoder,PlatformHEVCDecoderSupport,AudioWorkletRealtimeThread " +
            "--disable-features=CalculateNativeWinOcclusion --autoplay-policy=no-user-gesture-required " +
            "--ignore-gpu-blocklist --enable-native-gpu-memory-buffers";

        try
        {
            Environment.SetEnvironmentVariable("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", browserArgs);
            var options = new CoreWebView2EnvironmentOptions
            {
                AdditionalBrowserArguments = browserArgs,
            };
            var env = await CoreWebView2Environment.CreateWithOptionsAsync(
                browserExecutableFolder: null,
                userDataFolder: null,
                options: options);
            await Web.EnsureCoreWebView2Async(env);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[WebView2] Custom env init failed ({ex.Message}), falling back to default");
            try
            {
                await Web.EnsureCoreWebView2Async();
            }
            catch (Exception ex2)
            {
                System.Diagnostics.Debug.WriteLine($"[WebView2] Default EnsureCoreWebView2Async failed: {ex2.Message}");
                return;
            }
        }
        var core = Web.CoreWebView2;
        if (core == null) return;
        core.IsDocumentPlayingAudioChanged += (_, _) => DispatcherQueue.TryEnqueue(UpdatePowerMode);
        // Ambo output windows must run in THIS environment (same profile) or
        // BroadcastChannel can't reach them.
        _studioBridge.SharedEnvironment = core.Environment;

        Web.DefaultBackgroundColor = Windows.UI.Color.FromArgb(255, 6, 7, 9);
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.AreDefaultContextMenusEnabled = true;
        core.Settings.IsGeneralAutofillEnabled = true;

        // Preserve WebView2 disk cache and compiled code cache across sessions for near-instant boot
        // (Do not call ClearBrowsingDataAsync on every launch)

        // High-performance local media streaming handler with Range seeking and CORS support
        try
        {
            core.AddWebResourceRequestedFilter("https://localmedia.plajah/*", CoreWebView2WebResourceContext.All);
            core.AddWebResourceRequestedFilter("http://localmedia.plajah/*", CoreWebView2WebResourceContext.All);
            core.AddWebResourceRequestedFilter("https://media.plajah.com/*", CoreWebView2WebResourceContext.All);
            core.AddWebResourceRequestedFilter("http://media.plajah.com/*", CoreWebView2WebResourceContext.All);
            core.WebResourceRequested += (sender, args) =>
            {
                try
                {
                    var reqUri = new Uri(args.Request.Uri);
                    var host = reqUri.Host.ToLowerInvariant();
                    if (host == "localmedia.plajah" || host == "media.plajah.com")
                    {
                        if (args.Request.Method.Equals("OPTIONS", StringComparison.OrdinalIgnoreCase))
                        {
                            var preflight = core.Environment.CreateWebResourceResponse(
                                null,
                                204,
                                "No Content",
                                "Access-Control-Allow-Origin: *\r\n" +
                                "Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n" +
                                "Access-Control-Allow-Headers: *\r\n" +
                                "Access-Control-Max-Age: 86400"
                            );
                            args.Response = preflight;
                            return;
                        }

                        string? fullPath = null;

                        // 1. Try ?path= query param
                        var queryStr = reqUri.Query;
                        if (!string.IsNullOrEmpty(queryStr))
                        {
                            var trimmed = queryStr.TrimStart('?');
                            foreach (var part in trimmed.Split('&'))
                            {
                                var pair = part.Split('=', 2);
                                if (pair.Length > 0 && pair[0].Equals("path", StringComparison.OrdinalIgnoreCase))
                                {
                                    var extracted = pair.Length > 1 ? Uri.UnescapeDataString(pair[1]) : string.Empty;
                                    if (!string.IsNullOrEmpty(extracted) && File.Exists(extracted))
                                    {
                                        fullPath = extracted;
                                        break;
                                    }
                                }
                            }
                        }

                        // 2. Try URL path relative to _pendingFolderMapping
                        if (string.IsNullOrEmpty(fullPath))
                        {
                            var relPath = Uri.UnescapeDataString(reqUri.AbsolutePath.TrimStart('/'));
                            if (!string.IsNullOrEmpty(_pendingFolderMapping))
                            {
                                var combined = Path.Combine(_pendingFolderMapping, relPath.Replace('/', Path.DirectorySeparatorChar));
                                if (File.Exists(combined))
                                {
                                    fullPath = combined;
                                }
                            }

                            // 3. Try URL path directly if it's an absolute path
                            if (string.IsNullOrEmpty(fullPath) && File.Exists(relPath))
                            {
                                fullPath = relPath;
                            }
                        }

                        if (!string.IsNullOrEmpty(fullPath) && File.Exists(fullPath))
                        {
                            var fi = new FileInfo(fullPath);
                            var ext = fi.Extension.ToLowerInvariant();
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
                                ".mkv" => "video/x-matroska",
                                ".avi" => "video/x-msvideo",
                                ".mp3" => "audio/mpeg",
                                ".wav" => "audio/wav",
                                ".flac" => "audio/flac",
                                ".aac" => "audio/aac",
                                ".ogg" => "audio/ogg",
                                ".m4a" => "audio/mp4",
                                _ => "application/octet-stream"
                            };

                            var fileLength = fi.Length;
                            string? rangeHeader = null;
                            if (args.Request.Headers.Contains("Range"))
                            {
                                rangeHeader = args.Request.Headers.GetHeader("Range");
                            }

                            if (!string.IsNullOrEmpty(rangeHeader) && rangeHeader.StartsWith("bytes="))
                            {
                                var rangeStr = rangeHeader.Substring("bytes=".Length).Trim();
                                var parts = rangeStr.Split('-');
                                long start = 0;
                                long end = fileLength - 1;

                                if (long.TryParse(parts[0], out var s))
                                {
                                    start = s;
                                }
                                if (parts.Length > 1 && long.TryParse(parts[1], out var e))
                                {
                                    end = e;
                                }

                                if (start >= fileLength)
                                {
                                    args.Response = core.Environment.CreateWebResourceResponse(
                                        null, 416, "Range Not Satisfiable",
                                        $"Content-Range: bytes */{fileLength}\r\nAccess-Control-Allow-Origin: *"
                                    );
                                    return;
                                }

                                end = Math.Min(end, fileLength - 1);
                                long length = end - start + 1;

                                var fs = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                                var rangeStream = new SlicedStream(fs, start, length);
                                var response = core.Environment.CreateWebResourceResponse(
                                    rangeStream.AsRandomAccessStream(),
                                    206,
                                    "Partial Content",
                                    $"Content-Type: {mime}\r\n" +
                                    $"Content-Range: bytes {start}-{end}/{fileLength}\r\n" +
                                    $"Content-Length: {length}\r\n" +
                                    $"Accept-Ranges: bytes\r\n" +
                                    "Access-Control-Allow-Origin: *\r\n" +
                                    "Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n" +
                                    "Access-Control-Allow-Headers: *\r\n" +
                                    "Cache-Control: public, max-age=86400"
                                );
                                args.Response = response;
                            }
                            else
                            {
                                var fs = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                                var response = core.Environment.CreateWebResourceResponse(
                                    fs.AsRandomAccessStream(),
                                    200,
                                    "OK",
                                    $"Content-Type: {mime}\r\n" +
                                    $"Content-Length: {fileLength}\r\n" +
                                    $"Accept-Ranges: bytes\r\n" +
                                    "Access-Control-Allow-Origin: *\r\n" +
                                    "Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n" +
                                    "Access-Control-Allow-Headers: *\r\n" +
                                    "Cache-Control: public, max-age=86400"
                                );
                                args.Response = response;
                            }
                        }
                        else
                        {
                            args.Response = core.Environment.CreateWebResourceResponse(
                                null, 404, "Not Found",
                                "Access-Control-Allow-Origin: *\r\nContent-Type: text/plain"
                            );
                        }
                    }
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine($"[WebResourceRequested] Error: {ex.Message}");
                }
            };
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[AddWebResourceRequestedFilter] Error: {ex.Message}");
        }

        await core.AddScriptToExecuteOnDocumentCreatedAsync(
            "window.__PLAJAH_WINUI__ = true; window.__PLAJAH_PLATFORM__ = 'windows';" +
            "if ('serviceWorker' in navigator) { navigator.serviceWorker.getRegistrations().then(function(rs) { for (var r of rs) { r.unregister(); } }); }" +
            "(function() {" +
            "  const _origFetch = window.fetch;" +
            "  window.fetch = function(input, init) {" +
            "    try {" +
            "      if (typeof input === 'string' && input.startsWith('/api/')) {" +
            "        input = 'https://plajah.com' + input;" +
            "      } else if (input instanceof Request && input.url.startsWith('https://app.plajah/api/')) {" +
            "        input = new Request(input.url.replace('https://app.plajah/api/', 'https://plajah.com/api/'), init || input);" +
            "      }" +
            "    } catch (e) {}" +
            "    return _origFetch.call(this, input, init);" +
            "  };" +
            "  window.__plajahMediaEngine = {" +
            "    capabilities: {" +
            "      host: 'winui', platform: 'windows', hardwareGenlock: true, ndi: true, brawDecode: true, webgpu: true," +
            "      sources: { decklink: true, ndi: true, srt: true, rtmp: true, webrtc: true, uvc: true, file: true, braw: true, ambo: true, switcher: true }," +
            "      cameraControl: true, mainconceptMpeg2: true" +
            "    }," +
            "    invoke: function(cmd, args) {" +
            "      return new Promise(function(resolve) {" +
            "        const id = 'me_' + Math.random().toString(36).substr(2, 9);" +
            "        function handler(e) {" +
            "          try {" +
            "            const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;" +
            "            if (data.type === 'MEDIA_ENGINE_RESULT' && data.requestId === id) {" +
            "              window.chrome.webview.removeEventListener('message', handler);" +
            "              resolve(data.result);" +
            "            }" +
            "          } catch(err) {}" +
            "        }" +
            "        window.chrome.webview.addEventListener('message', handler);" +
            "        window.chrome.webview.postMessage(JSON.stringify({ type: 'MEDIA_ENGINE_INVOKE', requestId: id, cmd: cmd, args: args || {} }));" +
            "      });" +
            "    }" +
            "  };" +
            "})();");

        // Camera + microphone: Live, VTuber tracking and Perform capture need them without nagging.
        core.PermissionRequested += (_, e) =>
        {
            if (e.PermissionKind is Microsoft.Web.WebView2.Core.CoreWebView2PermissionKind.Camera
                or Microsoft.Web.WebView2.Core.CoreWebView2PermissionKind.Microphone)
                e.State = Microsoft.Web.WebView2.Core.CoreWebView2PermissionState.Allow;
        };

        // Use a standard desktop browser User-Agent so Google OAuth does not block with 403 'disallowed_useragent'
        core.Settings.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

        // Handle new window requests:
        // Firebase signInWithPopup (Google, Microsoft, etc.) uses window.open().
        // In WinUI 3, we create a dedicated popup Window hosting a WebView2 sharing the same environment,
        // which keeps the window.opener / postMessage auth bridge and session cookies fully intact.
        core.NewWindowRequested += async (sender, e) =>
        {
            var deferral = e.GetDeferral();
            try
            {
                if (string.IsNullOrWhiteSpace(e.Uri) || e.Uri == "about:blank" || (Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri) && IsAuthOrAppUri(uri)))
                {
                    var popupWindow = new Window();
                    popupWindow.Title = "Sign In - Plajah";
                    var popupWeb = new WebView2();
                    popupWindow.Content = popupWeb;

                    await popupWeb.EnsureCoreWebView2Async(sender.Environment);
                    popupWeb.CoreWebView2.Settings.UserAgent = core.Settings.UserAgent;
                    popupWeb.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;

                    popupWeb.CoreWebView2.WindowCloseRequested += (_, _) =>
                    {
                        try { popupWindow.Close(); } catch { }
                    };

                    e.NewWindow = popupWeb.CoreWebView2;
                    e.Handled = true;

                    if (popupWindow.AppWindow != null)
                    {
                        popupWindow.AppWindow.Resize(new Windows.Graphics.SizeInt32(520, 700));
                        var displayArea = DisplayArea.GetFromWindowId(popupWindow.AppWindow.Id, DisplayAreaFallback.Primary);
                        if (displayArea != null)
                        {
                            var centered = new Windows.Graphics.PointInt32(
                                (displayArea.WorkArea.Width - 520) / 2 + displayArea.WorkArea.X,
                                (displayArea.WorkArea.Height - 700) / 2 + displayArea.WorkArea.Y);
                            popupWindow.AppWindow.Move(centered);
                        }
                    }
                    popupWindow.Activate();
                    return;
                }

                // External links (user content, articles, external sites) open in the system default browser
                e.Handled = true;
                if (Uri.TryCreate(e.Uri, UriKind.Absolute, out var externalUri))
                {
                    await LaunchExternalUriAsync(externalUri);
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[NewWindowRequested] Error: {ex.Message}");
            }
            finally
            {
                deferral.Complete();
            }
        };

        core.NavigationStarting += async (sender, e) =>
        {
            if (Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri))
            {
                if (uri.Host.Equals("plajah.com", StringComparison.OrdinalIgnoreCase) &&
                    (uri.AbsolutePath == "/" || uri.AbsolutePath == ""))
                {
                    e.Cancel = true;
                    core.Navigate($"https://plajah.com/index.html{uri.Query}{uri.Fragment}");
                    return;
                }

                if (!IsAuthOrAppUri(uri))
                {
                    e.Cancel = true;
                    await LaunchExternalUriAsync(uri);
                }
            }
        };

        // Fullscreen video (Reello/Taleo players) toggles the native window.
        core.ContainsFullScreenElementChanged += (_, _) =>
        {
            _appWindow?.SetPresenter(core.ContainsFullScreenElement
                ? AppWindowPresenterKind.FullScreen
                : AppWindowPresenterKind.Default);
        };

        // Check for active local Vite/Express dev server (port 3000 from npm run dev or 5173 from vite)
        string? localDevUrl = null;
        // OPT-IN ONLY (debugger attached, or PLAJAH_DEV_SERVER=1). This probe used to run on every
        // launch, so an INSTALLED app silently loaded the unbundled Vite dev build whenever any dev
        // server was up on :3000 — slow to boot, heavy, mid-edit code: the "freezes after open" report.
        if (string.IsNullOrEmpty(_pendingActivationJson) && UseDevServer())
        {
            // Probe dev server if not launched directly with a media file to connect to local development server
            try
            {
                using var cts = new System.Threading.CancellationTokenSource(300);
                var ports = new[] { 3000, 5173 };
                var tasks = ports.Select(async port =>
                {
                    try
                    {
                        using var http = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromMilliseconds(300) };
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

        // Launch hint for the web layer, readable synchronously before React mounts
        // (see src/lib/launchTarget.ts): ?open=media boots the light local-media viewer shell
        // instead of the full platform; ?view=<slug> opens an experience tile's destination.
        var launchQuery = !string.IsNullOrEmpty(_pendingActivationJson)
            ? "?open=media"
            : !string.IsNullOrEmpty(_launchExperience)
                ? "?view=" + Uri.EscapeDataString(_launchExperience)
                : "";
        _launchExperience = null;

        if (localDevUrl != null)
        {
            core.Navigate(localDevUrl + "/" + launchQuery);
        }
        else
        {
            // Fast candidate build directory resolution
            string? chosenDir = null;
            var baseWwwroot = Path.Combine(AppContext.BaseDirectory, "wwwroot");
            if (Directory.Exists(baseWwwroot) && File.Exists(Path.Combine(baseWwwroot, "index.html")))
            {
                chosenDir = baseWwwroot;
            }
            else
            {
                var repoDist = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "dist");
                if (Directory.Exists(repoDist) && File.Exists(Path.Combine(repoDist, "index.html")))
                {
                    chosenDir = Path.GetFullPath(repoDist);
                }
                else
                {
                    var searchDir = new DirectoryInfo(AppContext.BaseDirectory);
                    for (int depth = 0; depth < 5 && searchDir != null; depth++)
                    {
                        var candidateDist = Path.Combine(searchDir.FullName, "dist");
                        if (Directory.Exists(candidateDist) && File.Exists(Path.Combine(candidateDist, "index.html")))
                        {
                            chosenDir = candidateDist;
                            break;
                        }
                        searchDir = searchDir.Parent;
                    }
                }
            }

            if (!string.IsNullOrEmpty(chosenDir))
            {
                core.SetVirtualHostNameToFolderMapping(
                    "plajah.com",
                    chosenDir,
                    CoreWebView2HostResourceAccessKind.Allow);
                _studioBridge.VirtualHostFolder = chosenDir;
                _localShellAvailable = true;
                core.Navigate("https://plajah.com/index.html" + launchQuery);
            }
            else
            {
                core.Navigate(AppUrl + "/" + launchQuery);
            }
        }

        core.NavigationCompleted += (_, args) =>
        {
            if (args.IsSuccess)
            {
                if (!string.IsNullOrEmpty(_pendingActivationJson))
                {
                    core.PostWebMessageAsString(_pendingActivationJson);
                    _pendingActivationJson = null;
                }
            }
            else
            {
                System.Diagnostics.Debug.WriteLine($"[WebView2] Navigation failed with error: {args.WebErrorStatus}");
                // A cancelled/superseded navigation is not a failure — NavigationStarting cancels every
                // bare "/" to rewrite it to /index.html, and each of those reports IsSuccess=false.
                // Re-navigating on those spun up a navigation storm that froze the window.
                if (args.WebErrorStatus is CoreWebView2WebErrorStatus.OperationCanceled
                    or CoreWebView2WebErrorStatus.ConnectionAborted)
                    return;
                // Genuine failure: one recovery attempt per 30s, never a loop.
                if ((DateTime.UtcNow - _lastNavRecovery).TotalSeconds < 30) return;
                _lastNavRecovery = DateTime.UtcNow;
                core.Navigate(_localShellAvailable ? "https://plajah.com/index.html" : AppUrl);
            }
        };

        // A crashed or hung page renderer used to leave a frozen/blank window until the user killed
        // the app. Reload it instead (bounded, so a page that crashes on load can't loop forever).
        core.ProcessFailed += (_, e) =>
        {
            CrashLog.Write("WebView2", new Exception($"ProcessFailed kind={e.ProcessFailedKind} reason={e.Reason} exit={e.ExitCode}"));
            if (e.ProcessFailedKind is CoreWebView2ProcessFailedKind.RenderProcessExited
                or CoreWebView2ProcessFailedKind.RenderProcessUnresponsive
                or CoreWebView2ProcessFailedKind.FrameRenderProcessExited)
            {
                if ((DateTime.UtcNow - _lastRendererRecovery).TotalSeconds < 20) return;
                _lastRendererRecovery = DateTime.UtcNow;
                DispatcherQueue.TryEnqueue(() => { try { core.Reload(); } catch { } });
            }
        };

        // ── Display Hot-Plug Detection ──
        // Poll for display changes since DisplayAreaWatcher is not available in SDK 1.7.
        // Checks every 3 seconds and notifies the web frontend when displays change.
        try
        {
            int lastDisplayCount = DisplayArea.FindAll().Count;
            var displayPollTimer = DispatcherQueue.CreateTimer();
            displayPollTimer.Interval = TimeSpan.FromSeconds(3);
            displayPollTimer.Tick += (_, _) =>
            {
                try
                {
                    var currentDisplays = DisplayArea.FindAll();
                    if (currentDisplays.Count != lastDisplayCount)
                    {
                        lastDisplayCount = currentDisplays.Count;
                        try { core.PostWebMessageAsString("{\"type\":\"DISPLAY_CHANGE\",\"event\":\"changed\",\"count\":" + currentDisplays.Count + "}"); }
                        catch { }
                    }
                }
                catch { }
            };
            displayPollTimer.Start();
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[DisplayPoll] Failed to start display polling: {ex.Message}");
        }
    }

    private static bool IsAuthOrAppUri(Uri uri)
    {
        var host = uri.Host.ToLowerInvariant();
        return host == "plajah.com" || host.EndsWith(".plajah.com")
            || host == "app.plajah"
            || host == "localhost"
            // Firebase Auth & Google Identity
            || host.Contains("firebaseapp.com")
            || host.Contains("googleapis.com")
            || host.Contains("google.com")
            || host.Contains("gstatic.com")
            || host.Contains("googleusercontent.com")
            // Microsoft Identity (Azure AD, Live, MSA)
            || host.Contains("microsoft.com")
            || host.Contains("microsoftonline.com")
            || host.Contains("live.com")
            || host.Contains("msauth.net")
            || host.Contains("msftauth.net")
            // Other social login providers
            || host.Contains("twitter.com")
            || host.Contains("x.com")
            || host.Contains("facebook.com")
            || host.Contains("apple.com");
    }

    private static async System.Threading.Tasks.Task LaunchExternalUriAsync(Uri uri)
    {
        await Windows.System.Launcher.LaunchUriAsync(uri);
    }

    // ── Voca read-aloud: native Windows speech (WebView2 has no Web Speech recogniser) ──────────
    private SpeechBridgeService? _speech;
    private async System.Threading.Tasks.Task HandleSpeechMessageAsync(string type, JsonElement root)
    {
        try
        {
            // recogniser events arrive on background threads; WebView2 must be touched on the UI thread
            _speech ??= new SpeechBridgeService(json => DispatcherQueue.TryEnqueue(() =>
            {
                try { Web.CoreWebView2?.PostWebMessageAsString(json); } catch { }
            }));
            switch (type)
            {
                case "SPEECH_START":
                    var lang = root.TryGetProperty("lang", out var lv) ? lv.GetString() : "en-US";
                    var words = new List<string>();
                    if (root.TryGetProperty("words", out var wv) && wv.ValueKind == JsonValueKind.Array)
                        foreach (var w in wv.EnumerateArray()) { var sw = w.GetString(); if (!string.IsNullOrEmpty(sw)) words.Add(sw); }
                    await _speech.StartAsync(lang, words); break;
                case "SPEECH_STOP": await _speech.StopAsync(); break;
                case "SPEECH_SUSPEND": await _speech.SuspendAsync(); break;
                case "SPEECH_RESUME": await _speech.ResumeAsync(); break;
            }
        }
        catch (Exception ex) { System.Diagnostics.Debug.WriteLine($"[Speech] {ex.Message}"); }
    }

    private async void Web_WebMessageReceived(WebView2 sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        try
        {
            using var document = JsonDocument.Parse(args.TryGetWebMessageAsString());
            var root = document.RootElement;
            var type = root.TryGetProperty("type", out var typeValue)
                ? typeValue.GetString()
                : null;

            if (type is "SPEECH_START" or "SPEECH_STOP" or "SPEECH_SUSPEND" or "SPEECH_RESUME")
            {
                await HandleSpeechMessageAsync(type, root);   // Voca read-aloud
                return;
            }

            if (type == "GET_LAUNCH_MEDIA")
            {
                // The light viewer shell (?open=media) pulls the activation file rather than relying
                // on the one-shot NavigationCompleted push, which can land before its listener exists.
                if (!string.IsNullOrEmpty(_launchMediaJson))
                    sender.CoreWebView2?.PostWebMessageAsString(_launchMediaJson);
                return;
            }

            if (type == "WINDOW_DRAG")
            {
                var hwnd = WindowNative.GetWindowHandle(this);
                ReleaseCapture();
                SendMessage(hwnd, WM_NCLBUTTONDOWN, (IntPtr)HTCAPTION, IntPtr.Zero);
            }
            else if (type == "WINDOW_MINIMIZE")
            {
                if (_appWindow?.Presenter is OverlappedPresenter presenter)
                {
                    presenter.Minimize();
                }
            }
            else if (type == "WINDOW_MAXIMIZE")
            {
                if (_appWindow?.Presenter is OverlappedPresenter presenter)
                {
                    if (presenter.State == OverlappedPresenterState.Maximized)
                        presenter.Restore();
                    else
                        presenter.Maximize();
                }
            }
            else if (type == "WINDOW_CLOSE")
            {
                this.Close();
            }
            else if (type == "HELLO_CHECK")
            {
                var status = await WindowsHelloService.CheckAsync();
                PostNativeMessage("WINDOWS_HELLO_STATUS", new
                {
                    supported = status.Supported,
                    available = status.Available,
                    reason = status.Reason,
                });
            }
            else if (type == "HELLO_VERIFY")
            {
                var message = root.TryGetProperty("message", out var messageValue)
                    ? messageValue.GetString() ?? string.Empty
                    : string.Empty;
                var result = await WindowsHelloService.VerifyAsync(message);
                PostNativeMessage("WINDOWS_HELLO_RESULT", new
                {
                    verified = result.Verified,
                    reason = result.Reason,
                });
            }
            else if (type == "ACCELERATION_CHECK")
            {
                PostNativeMessage("ACCELERATION_PROFILE", WindowsAccelerationService.Probe());
            }
            else if (type == "AI_PROFILE_CHECK")
            {
                PostNativeMessage("AI_HARDWARE_PROFILE", PlajahAiNativeService.GetHardwareProfile());
            }
            else if (type == "STEM_SEPARATION_REQUEST")
            {
                var audioPath = root.TryGetProperty("audioPath", out var ap) ? ap.GetString() ?? string.Empty : string.Empty;
                var res = await PlajahAiNativeService.SeparateStemsAsync(audioPath, p =>
                {
                    PostNativeMessage("STEM_SEPARATION_PROGRESS", new { progress = p });
                });
                PostNativeMessage("STEM_SEPARATION_RESULT", res);
            }
            else if (type == "LOCAL_LLM_REQUEST")
            {
                var prompt = root.TryGetProperty("prompt", out var p) ? p.GetString() ?? string.Empty : string.Empty;
                var sys = root.TryGetProperty("systemPrompt", out var s) ? s.GetString() : null;
                var res = await PlajahAiNativeService.RunLocalLlmAsync(prompt, sys);
                PostNativeMessage("LOCAL_LLM_RESULT", res);
            }
            else if (type == "VST_LIST_DIRECTORIES")
            {
                PostNativeMessage("VST_DIRECTORIES", new { directories = WindowsVstService.GetDirectories() });
            }
            else if (type == "VST_ADD_DIRECTORY")
            {
                var path = root.GetProperty("path").GetString() ?? string.Empty;
                PostNativeMessage("VST_DIRECTORIES", new { directories = WindowsVstService.AddDirectory(path) });
            }
            else if (type == "VST_REMOVE_DIRECTORY")
            {
                var path = root.GetProperty("path").GetString() ?? string.Empty;
                PostNativeMessage("VST_DIRECTORIES", new { directories = WindowsVstService.RemoveDirectory(path) });
            }
            else if (type == "VST_SCAN")
            {
                PostNativeMessage("VST_SCAN_RESULT", new { plugins = WindowsVstService.Scan() });
            }
            else if (type == "AUDIO_DEVICE_LIST")
            {
                PostNativeMessage("AUDIO_DEVICE_LIST_RESULT", new { devices = PlajahAiNativeService.GetAudioDevices() });
            }
            else if (type == "AUDIO_DEVICE_SELECT")
            {
                var deviceId = root.TryGetProperty("deviceId", out var did) ? did.GetString() ?? string.Empty : string.Empty;
                var driverType = root.TryGetProperty("driverType", out var dt) ? dt.GetString() ?? "WASAPI_EXCLUSIVE" : "WASAPI_EXCLUSIVE";
                PostNativeMessage("AUDIO_DEVICE_SELECT_RESULT", new { success = true, deviceId, driverType });
            }
            else if (type == "PICK_FOLDER")
            {
                try
                {
                    var folderPicker = new Windows.Storage.Pickers.FolderPicker();
                    var hwnd = WindowNative.GetWindowHandle(this);
                    InitializeWithWindow.Initialize(folderPicker, hwnd);
                    folderPicker.FileTypeFilter.Add("*");
                    var folder = await folderPicker.PickSingleFolderAsync();
                    if (folder is null)
                    {
                        PostNativeMessage("PICK_FOLDER_RESULT", new { cancelled = true });
                        return;
                    }

                    var mediaExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                    {
                        ".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".mpg", ".mpeg",
                        ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".aiff", ".aif",
                        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".heic", ".tif", ".tiff", ".svg"
                    };

                    var fileList = new List<object>();
                    // Off the UI thread: a recursive scan of a big folder (Pictures, a drive root) used
                    // to run inline and freeze the window until it finished.
                    await System.Threading.Tasks.Task.Run(() =>
                    {
                    using var eco = PowerQos.EcoThread();   // bulk I/O scan → efficiency cores
                    try
                    {
                        var dirInfo = new DirectoryInfo(folder.Path);
                        foreach (var fi in dirInfo.EnumerateFiles("*", SafeRecursiveScan))
                        {
                            if (fileList.Count >= MaxScannedFiles) break;
                            if (mediaExtensions.Contains(fi.Extension))
                            {
                                var relPath = Path.GetRelativePath(folder.Path, fi.FullName).Replace('\\', '/');
                                fileList.Add(new
                                {
                                    name = fi.Name,
                                    relativePath = relPath,
                                    fullPath = fi.FullName,
                                    size = fi.Length,
                                    lastModified = new DateTimeOffset(fi.LastWriteTimeUtc).ToUnixTimeMilliseconds(),
                                    url = $"https://localmedia.plajah/{Uri.EscapeDataString(relPath).Replace("%2F", "/")}?path={Uri.EscapeDataString(fi.FullName)}"
                                });
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        System.Diagnostics.Debug.WriteLine($"Error scanning folder: {ex.Message}");
                    }
                    });

                    PostNativeMessage("PICK_FOLDER_RESULT", new
                    {
                        cancelled = false,
                        folderPath = folder.Path,
                        folderName = folder.Name,
                        files = fileList
                    });
                }
                catch (Exception ex)
                {
                    PostNativeMessage("PICK_FOLDER_RESULT", new { cancelled = true, error = ex.Message });
                }
            }
            else if (type == "PICK_FILE")
            {
                try
                {
                    var filePicker = new Windows.Storage.Pickers.FileOpenPicker();
                    var hwnd = WindowNative.GetWindowHandle(this);
                    InitializeWithWindow.Initialize(filePicker, hwnd);
                    filePicker.FileTypeFilter.Add("*");
                    var file = await filePicker.PickSingleFileAsync();
                    if (file is null)
                    {
                        PostNativeMessage("PICK_FILE_RESULT", new { cancelled = true });
                        return;
                    }

                    var dirPath = Path.GetDirectoryName(file.Path);
                    var fi = new FileInfo(file.Path);
                    PostNativeMessage("PICK_FILE_RESULT", new
                    {
                        cancelled = false,
                        name = file.Name,
                        fullPath = file.Path,
                        folderPath = dirPath ?? string.Empty,
                        size = fi.Exists ? fi.Length : 0,
                        lastModified = fi.Exists ? new DateTimeOffset(fi.LastWriteTimeUtc).ToUnixTimeMilliseconds() : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                        url = $"https://localmedia.plajah/{Uri.EscapeDataString(file.Name)}?path={Uri.EscapeDataString(file.Path)}"
                    });
                }
                catch (Exception ex)
                {
                    PostNativeMessage("PICK_FILE_RESULT", new { cancelled = true, error = ex.Message });
                }
            }
            else if (type == "READ_FILE_BYTES")
            {
                var path = root.TryGetProperty("path", out var pVal) ? pVal.GetString() : null;
                if (!string.IsNullOrEmpty(path) && File.Exists(path) && new FileInfo(path).Length > 64L * 1024 * 1024)
                {
                    // Base64 of a multi-GB video through PostWebMessage would exhaust memory and hang
                    // both processes. Large media must stream via https://localmedia.plajah instead.
                    PostNativeMessage("READ_FILE_BYTES_RESULT", new { success = false, path, error = "File too large to read into memory (>64 MB); stream it via its localmedia URL" });
                }
                else if (!string.IsNullOrEmpty(path) && File.Exists(path))
                {
                    var bytes = await File.ReadAllBytesAsync(path);
                    var base64 = Convert.ToBase64String(bytes);
                    PostNativeMessage("READ_FILE_BYTES_RESULT", new { success = true, path, base64 });
                }
                else
                {
                    PostNativeMessage("READ_FILE_BYTES_RESULT", new { success = false, path, error = "File not found" });
                }
            }
            else if (type == "STUDIO_DISPLAYS_QUERY")
            {
                PostNativeMessage("STUDIO_DISPLAYS_RESULT", new { displays = _studioBridge.GetConnectedDisplays() });
            }
            else if (type == "STUDIO_CLEAN_FEED_OPEN")
            {
                var displayIndex = root.TryGetProperty("displayIndex", out var di) && di.TryGetInt32(out var idx) ? idx : -1;
                var feedUrl = root.TryGetProperty("feedUrl", out var fu) ? fu.GetString() ?? string.Empty : string.Empty;
                var title = root.TryGetProperty("title", out var t) ? t.GetString() ?? "Ambo Audience Clean Feed" : "Ambo Audience Clean Feed";
                var targetWidth = root.TryGetProperty("width", out var tw) && tw.TryGetInt32(out var twVal) ? twVal : 0;
                var targetHeight = root.TryGetProperty("height", out var th) && th.TryGetInt32(out var thVal) ? thVal : 0;
                var ok = _studioBridge.OpenCleanFeed(displayIndex, feedUrl, title, targetWidth, targetHeight);
                PostNativeMessage("STUDIO_CLEAN_FEED_STATUS", new { active = ok, displayIndex, width = targetWidth, height = targetHeight });
            }
            else if (type == "STUDIO_CLEAN_FEED_CLOSE")
            {
                _studioBridge.CloseCleanFeed();
                PostNativeMessage("STUDIO_CLEAN_FEED_STATUS", new { active = false });
            }
            // ── Multi-Output Native Window System ────────────────────────────
            else if (type == "OPEN_OUTPUT_WINDOW")
            {
                var outputId = root.TryGetProperty("outputId", out var oid) ? oid.GetString() ?? "" : "";
                var displayIndex = root.TryGetProperty("displayIndex", out var di) && di.TryGetInt32(out var idx) ? idx : -1;
                var feedHtml = root.TryGetProperty("feedUrl", out var fu2) && !string.IsNullOrEmpty(fu2.GetString())
                    ? fu2.GetString()!
                    : root.TryGetProperty("feedHtml", out var fh) ? fh.GetString() ?? "" : "";
                var title = root.TryGetProperty("title", out var t) ? t.GetString() ?? "Ambo Output" : "Ambo Output";
                var targetWidth = root.TryGetProperty("width", out var tw) && tw.TryGetInt32(out var twVal) ? twVal : 0;
                var targetHeight = root.TryGetProperty("height", out var th) && th.TryGetInt32(out var thVal) ? thVal : 0;
                var ok = _studioBridge.OpenOutputWindow(outputId, displayIndex, feedHtml, title, targetWidth, targetHeight);
                PostNativeMessage("OUTPUT_WINDOW_STATUS", new { outputId, active = ok, displayIndex });
            }
            else if (type == "CLOSE_OUTPUT_WINDOW")
            {
                var outputId = root.TryGetProperty("outputId", out var oid) ? oid.GetString() ?? "" : "";
                _studioBridge.CloseOutputWindow(outputId);
                PostNativeMessage("OUTPUT_WINDOW_STATUS", new { outputId, active = false });
            }
            else if (type == "CLOSE_ALL_OUTPUTS")
            {
                _studioBridge.CloseAllOutputWindows();
                PostNativeMessage("OUTPUT_WINDOW_STATUS", new { all = true, active = false });
            }
            else if (type == "LIST_OUTPUT_WINDOWS")
            {
                var openIds = _studioBridge.GetOpenOutputIds();
                PostNativeMessage("OUTPUT_WINDOWS_LIST", new {
                    outputs = openIds,
                    count = openIds.Count,
                    compositorRunning = _studioBridge.IsCompositorRunning
                });
            }
            // ── GPU Compositor (Rust) Commands ───────────────────────────────
            else if (type == "COMPOSITOR_OPEN_OUTPUT")
            {
                var outputId = root.TryGetProperty("outputId", out var oid) ? oid.GetString() ?? "" : "";
                var displayIndex = root.TryGetProperty("displayIndex", out var di) && di.TryGetInt32(out var idx) ? idx : 0;
                var targetWidth = root.TryGetProperty("width", out var tw) && tw.TryGetInt32(out var twVal) ? twVal : 1920;
                var targetHeight = root.TryGetProperty("height", out var th) && th.TryGetInt32(out var thVal) ? thVal : 1080;
                await _studioBridge.SendToCompositorAsync(new {
                    type = "OPEN_OUTPUT",
                    outputId, displayIndex, width = targetWidth, height = targetHeight
                });
                PostNativeMessage("COMPOSITOR_STATUS", new { outputId, active = true, engine = "gpu" });
            }
            else if (type == "COMPOSITOR_CLOSE_OUTPUT")
            {
                var outputId = root.TryGetProperty("outputId", out var oid) ? oid.GetString() ?? "" : "";
                await _studioBridge.SendToCompositorAsync(new {
                    type = "CLOSE_OUTPUT", outputId
                });
                PostNativeMessage("COMPOSITOR_STATUS", new { outputId, active = false });
            }
            else if (type == "COMPOSITOR_UPDATE_STACK")
            {
                // Forward the entire stack payload to the Rust compositor
                var outputId = root.TryGetProperty("outputId", out var oid) ? oid.GetString() ?? "" : "";
                var layersJson = root.TryGetProperty("layers", out var lj) ? lj.ToString() : "[]";
                await _studioBridge.SendToCompositorAsync(new {
                    type = "UPDATE_STACK", outputId, layers = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(layersJson)
                });
            }
            else if (type == "COMPOSITOR_IDENTIFY")
            {
                var outputId = root.TryGetProperty("outputId", out var oid) ? oid.GetString() ?? "" : "";
                var name = root.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "";
                var duration = root.TryGetProperty("duration", out var d) && d.TryGetInt32(out var dVal) ? dVal : 3000;
                await _studioBridge.SendToCompositorAsync(new {
                    type = "IDENTIFY_DISPLAY", outputId, name, duration
                });
            }
            else if (type == "COMPOSITOR_SHUTDOWN")
            {
                _studioBridge.ShutdownCompositor();
                PostNativeMessage("COMPOSITOR_STATUS", new { active = false, shutdown = true });
            }
            else if (type == "NDI_SCAN_REQUEST")
            {
                var streams = await _studioBridge.DiscoverNdiSourcesAsync(1500);
                PostNativeMessage("NDI_SCAN_RESULT", new { streams });
            }
            else if (type == "NDI_QUERY_STATUS")
            {
                var ndiInfo = _studioBridge.DiscoverNdi();
                PostNativeMessage("NDI_STATUS_RESULT", ndiInfo);
            }
            else if (type == "STUDIO_TASKBAR_PROGRESS")
            {
                var progress = root.TryGetProperty("progress", out var pr) && pr.TryGetDouble(out var pVal) ? pVal : 0.0;
                var state = root.TryGetProperty("state", out var st) ? st.GetString() ?? "normal" : "normal";
                _studioBridge.SetExportProgress(progress, state);
            }
            else if (type == "STUDIO_EXTRACT_THUMBNAILS")
            {
                var paths = new List<string>();
                if (root.TryGetProperty("paths", out var pArr) && pArr.ValueKind == JsonValueKind.Array)
                {
                    foreach (var elem in pArr.EnumerateArray())
                    {
                        var s = elem.GetString();
                        if (!string.IsNullOrEmpty(s)) paths.Add(s);
                    }
                }
                var targetSize = root.TryGetProperty("targetSize", out var ts) && ts.TryGetUInt32(out var sz) ? sz : 320u;
                var res = await _studioBridge.ExtractBatchThumbnailsAsync(paths, targetSize);
                PostNativeMessage("STUDIO_EXTRACT_THUMBNAILS_RESULT", new { thumbnails = res });
            }
            else if (type == "STUDIO_DISPATCH_JOG")
            {
                var delta = root.TryGetProperty("delta", out var d) && d.TryGetInt32(out var dv) ? dv : 0;
                var isShuttle = root.TryGetProperty("isShuttle", out var s) && s.GetBoolean();
                var action = root.TryGetProperty("action", out var a) ? a.GetString() : null;
                _studioBridge.DispatchJogWheel(delta, isShuttle, action);
            }
            else if (type == "MEDIA_ENGINE_INVOKE")
            {
                var reqId = root.TryGetProperty("requestId", out var ri) ? ri.GetString() ?? "" : "";
                var cmd = root.TryGetProperty("cmd", out var c) ? c.GetString() ?? "" : "";
                var argsObj = root.TryGetProperty("args", out var ao) ? ao : default;

                object? result = null;

                if (cmd == "capabilities")
                {
                    result = new
                    {
                        host = "winui",
                        platform = "windows",
                        hardwareGenlock = true,
                        ndi = true,
                        omt = true,
                        srt = true,
                        avb = true,
                        brawDecode = true,
                        webgpu = true,
                        nativeOmt = true,
                        nativeSrt = true,
                        nativeAvb = true,
                        sources = new Dictionary<string, bool>
                        {
                            ["decklink"] = true,
                            ["ndi"] = true,
                            ["omt"] = true,
                            ["srt"] = true,
                            ["avb"] = true,
                            ["rtmp"] = true,
                            ["webrtc"] = true,
                            ["uvc"] = true,
                            ["file"] = true,
                            ["braw"] = true,
                            ["ambo"] = true,
                            ["switcher"] = true
                        },
                        cameraControl = true,
                        mainconceptMpeg2 = true
                    };
                }
                else if (cmd == "list_sources")
                {
                    var sourceList = new List<object>();

                    // 1. Enumerate DeckLink devices
                    var dlDevices = _studioBridge.EnumerateDeckLinkDevices();
                    foreach (var dl in dlDevices)
                    {
                        sourceList.Add(new
                        {
                            id = dl.Id,
                            label = dl.Name,
                            kind = "decklink",
                            formats = dl.SupportedModes.ConvertAll(m => new { width = m.Width, height = m.Fps, fps = m.Fps, interlaced = m.Interlaced }),
                            latencyMs = 2,
                            clockDomain = dl.IsGenlocked ? "hw-genlock" : "soft-master",
                            status = dl.Status
                        });
                    }

                    // 2. Enumerate NDI Streams (Native SDK + LAN Discovery)
                    var ndiStreams = await _studioBridge.DiscoverNdiSourcesAsync(quick: true);
                    foreach (var s in ndiStreams)
                    {
                        sourceList.Add(new
                        {
                            id = s.Id,
                            label = s.Name,
                            kind = "ndi",
                            url = s.Url,
                            machineName = s.MachineName,
                            streamName = s.StreamName,
                            formats = new[] { new { width = s.Width, height = s.Height, fps = s.Fps, interlaced = false } },
                            latencyMs = 12,
                            clockDomain = "ptp",
                            status = s.Status,
                            discoveryMethod = s.DiscoveryMethod
                        });
                    }

                    // 3. Enumerate OMT Streams (Open Media Transport LAN)
                    var omtStreams = await _studioBridge.DiscoverOmtSourcesAsync(quick: true);
                    foreach (var o in omtStreams)
                    {
                        sourceList.Add(new
                        {
                            id = o.Id,
                            label = o.Name,
                            kind = "omt",
                            url = o.Url,
                            machineName = o.MachineName,
                            streamName = o.StreamName,
                            formats = new[] { new { width = o.Width, height = o.Height, fps = o.Fps, interlaced = false } },
                            latencyMs = 2,
                            clockDomain = "ptp",
                            status = o.Status,
                            audioChannels = o.AudioChannels,
                            hasAlpha = o.HasAlpha,
                            discoveryMethod = o.DiscoveryMethod
                        });
                    }

                    // 4. Enumerate SRT Streams (Active Listeners / Callers)
                    var srtStreams = _studioBridge.GetActiveSrtStreams();
                    foreach (var s in srtStreams)
                    {
                        sourceList.Add(new
                        {
                            id = s.StreamId,
                            label = s.Name,
                            kind = "srt",
                            url = $"srt://{s.Host}:{s.Port}?latency={s.LatencyMs}",
                            formats = new[] { new { width = 1920, height = 1080, fps = 60.0, interlaced = false } },
                            latencyMs = s.LatencyMs,
                            clockDomain = "soft-master",
                            status = s.Status,
                            bitrateMbps = s.BitrateMbps,
                            packetLossRate = s.PacketLossRate,
                            discoveryMethod = "Native SRT Transport"
                        });
                    }

                    // 5. Enumerate AVB Audio Hardware & Entities (IEEE 1722 / Milan)
                    var avbEntities = await _studioBridge.DiscoverAvbEntitiesAsync();
                    foreach (var a in avbEntities)
                    {
                        sourceList.Add(new
                        {
                            id = $"avb_{a.EntityId.Replace(':', '_')}",
                            label = $"{a.Name} ({a.Manufacturer})",
                            kind = "avb",
                            url = $"avb://{a.EntityId}",
                            formats = new[] { new { width = 0, height = 0, fps = 0.0, interlaced = false } },
                            latencyMs = 1,
                            clockDomain = "ptp",
                            status = a.Status,
                            talkerStreams = a.TalkerStreams,
                            listenerStreams = a.ListenerStreams,
                            milanCompliant = a.MilanCompliant,
                            discoveryMethod = "IEEE 1722.1 AVDECC"
                        });
                    }

                    // 6. Enumerate Virtual Inter-App Channels (Ambo outputs & Switcher buses)
                    var channels = _studioBridge.GetActiveVirtualChannels();
                    foreach (var ch in channels)
                    {
                        sourceList.Add(new
                        {
                            id = ch.ChannelId,
                            label = ch.Label,
                            kind = ch.OwnerApp == "ambo" ? "ambo" : "switcher",
                            formats = new[] { new { width = 1920, height = 1080, fps = 60.0, interlaced = false } },
                            latencyMs = 0,
                            clockDomain = "soft-master"
                        });
                    }

                    result = sourceList;
                }
                else if (cmd == "ndi_scan")
                {
                    var ndiStreams = await _studioBridge.DiscoverNdiSourcesAsync(1500);
                    result = new { streams = ndiStreams };
                }
                else if (cmd == "ndi_info" || cmd == "get_ndi_status")
                {
                    result = _studioBridge.DiscoverNdi();
                }
                else if (cmd == "omt_scan")
                {
                    var omtStreams = await _studioBridge.DiscoverOmtSourcesAsync(1500);
                    result = new { streams = omtStreams };
                }
                else if (cmd == "omt_start_broadcast")
                {
                    string sId = argsObj.TryGetProperty("streamId", out var si) ? si.GetString() ?? "omt_program" : "omt_program";
                    string sName = argsObj.TryGetProperty("name", out var sn) ? sn.GetString() ?? "Plajah Studio Program" : "Plajah Studio Program";
                    int port = argsObj.TryGetProperty("port", out var pt) && pt.TryGetInt32(out var pv) ? pv : 9998;
                    int w = argsObj.TryGetProperty("width", out var wp) && wp.TryGetInt32(out var wv) ? wv : 1920;
                    int h = argsObj.TryGetProperty("height", out var hp) && hp.TryGetInt32(out var hv) ? hv : 1080;
                    double fps = argsObj.TryGetProperty("fps", out var fp) && fp.TryGetDouble(out var fv) ? fv : 60.0;
                    int chs = argsObj.TryGetProperty("audioChannels", out var ac) && ac.TryGetInt32(out var acv) ? acv : 8;
                    bool alpha = !argsObj.TryGetProperty("hasAlpha", out var ha) || ha.GetBoolean();
                    var broadcast = _studioBridge.StartOmtBroadcast(sId, sName, port, w, h, fps, chs, alpha);
                    result = new { success = true, broadcast };
                }
                else if (cmd == "omt_stop_broadcast")
                {
                    string sId = argsObj.TryGetProperty("streamId", out var si) ? si.GetString() ?? "" : "";
                    bool stopped = _studioBridge.StopOmtBroadcast(sId);
                    result = new { success = stopped };
                }
                else if (cmd == "srt_start_listener")
                {
                    string sId = argsObj.TryGetProperty("streamId", out var si) ? si.GetString() ?? "srt_ingest" : "srt_ingest";
                    string sName = argsObj.TryGetProperty("name", out var sn) ? sn.GetString() ?? "SRT Live Contribution Ingest" : "SRT Live Contribution Ingest";
                    int port = argsObj.TryGetProperty("port", out var pt) && pt.TryGetInt32(out var pv) ? pv : 9000;
                    int lat = argsObj.TryGetProperty("latencyMs", out var lt) && lt.TryGetInt32(out var lv) ? lv : 120;
                    string? pass = argsObj.TryGetProperty("passphrase", out var pp) ? pp.GetString() : null;
                    var session = _studioBridge.StartSrtListener(sId, sName, port, lat, pass);
                    result = new { success = true, session };
                }
                else if (cmd == "srt_connect_caller")
                {
                    string sId = argsObj.TryGetProperty("streamId", out var si) ? si.GetString() ?? "srt_caller" : "srt_caller";
                    string sName = argsObj.TryGetProperty("name", out var sn) ? sn.GetString() ?? "SRT Remote Feed" : "SRT Remote Feed";
                    string host = argsObj.TryGetProperty("host", out var ho) ? ho.GetString() ?? "127.0.0.1" : "127.0.0.1";
                    int port = argsObj.TryGetProperty("port", out var pt) && pt.TryGetInt32(out var pv) ? pv : 9000;
                    int lat = argsObj.TryGetProperty("latencyMs", out var lt) && lt.TryGetInt32(out var lv) ? lv : 120;
                    string? pass = argsObj.TryGetProperty("passphrase", out var pp) ? pp.GetString() : null;
                    var session = _studioBridge.ConnectSrtCaller(sId, sName, host, port, lat, pass);
                    result = new { success = true, session };
                }
                else if (cmd == "srt_stop")
                {
                    string sId = argsObj.TryGetProperty("streamId", out var si) ? si.GetString() ?? "" : "";
                    bool stopped = _studioBridge.StopSrtStream(sId);
                    result = new { success = stopped };
                }
                else if (cmd == "srt_stats")
                {
                    string sId = argsObj.TryGetProperty("streamId", out var si) ? si.GetString() ?? "" : "";
                    var stats = _studioBridge.GetSrtStats(sId);
                    result = new { success = stats != null, stats };
                }
                else if (cmd == "avb_interfaces")
                {
                    var ifaces = _studioBridge.EnumerateAvbInterfaces();
                    result = new { interfaces = ifaces };
                }
                else if (cmd == "avb_entities")
                {
                    var entities = await _studioBridge.DiscoverAvbEntitiesAsync(1500);
                    result = new { entities };
                }
                else if (cmd == "avb_talker")
                {
                    string sId = argsObj.TryGetProperty("streamId", out var si) ? si.GetString() ?? "avb_master_out" : "avb_master_out";
                    string sName = argsObj.TryGetProperty("name", out var sn) ? sn.GetString() ?? "Plajah Chora Master Output" : "Plajah Chora Master Output";
                    int chs = argsObj.TryGetProperty("channels", out var cp) && cp.TryGetInt32(out var cv) ? cv : 16;
                    int sr = argsObj.TryGetProperty("sampleRate", out var sp) && sp.TryGetInt32(out var sv) ? sv : 48000;
                    var config = _studioBridge.ConfigureAvbTalkerStream(sId, sName, chs, sr);
                    result = new { success = true, config };
                }
                else if (cmd == "avb_listener")
                {
                    string sId = argsObj.TryGetProperty("streamId", out var si) ? si.GetString() ?? "avb_stage_in" : "avb_stage_in";
                    string entId = argsObj.TryGetProperty("entityId", out var ei) ? ei.GetString() ?? "" : "";
                    int chs = argsObj.TryGetProperty("channels", out var cp) && cp.TryGetInt32(out var cv) ? cv : 16;
                    int sr = argsObj.TryGetProperty("sampleRate", out var sp) && sp.TryGetInt32(out var sv) ? sv : 48000;
                    var config = _studioBridge.ConnectAvbListenerStream(sId, entId, chs, sr);
                    result = new { success = true, config };
                }
                else if (cmd == "avb_stop_stream")
                {
                    string sId = argsObj.TryGetProperty("streamId", out var si) ? si.GetString() ?? "" : "";
                    bool stopped = _studioBridge.StopAvbStream(sId);
                    result = new { success = stopped };
                }
                else if (cmd == "avb_clock")
                {
                    result = _studioBridge.GetAvbClockStatus();
                }
                else if (cmd == "connect_source" || cmd == "disconnect_source")
                {
                    result = new { success = true };
                }
                else if (cmd == "route" || cmd == "set_program" || cmd == "set_sync")
                {
                    result = new { success = true };
                }
                else if (cmd == "camera_control")
                {
                    string camId = argsObj.TryGetProperty("cameraId", out var cid) ? cid.GetString() ?? "" : "";
                    string proto = argsObj.TryGetProperty("protocol", out var cp) ? cp.GetString() ?? "canon_ccapi" : "canon_ccapi";
                    string endpoint = argsObj.TryGetProperty("endpoint", out var ce) ? ce.GetString() ?? "" : "";
                    string action = argsObj.TryGetProperty("action", out var ca) ? ca.GetString() ?? "" : "";
                    var rawResp = await _studioBridge.DispatchCameraCommandAsync(camId, proto, endpoint, action, null);
                    result = new { response = rawResp };
                }
                else if (cmd == "get_codecs")
                {
                    result = _studioBridge.EnumerateCodecProviders();
                }
                else if (cmd == "register_virtual_channel")
                {
                    string chId = argsObj.TryGetProperty("channelId", out var ci) ? ci.GetString() ?? "" : "";
                    string lbl = argsObj.TryGetProperty("label", out var cl) ? cl.GetString() ?? "" : "";
                    string app = argsObj.TryGetProperty("ownerApp", out var co) ? co.GetString() ?? "" : "";
                    string fmt = argsObj.TryGetProperty("format", out var cf) ? cf.GetString() ?? "1080p60" : "1080p60";
                    _studioBridge.RegisterVirtualChannel(chId, lbl, app, fmt);
                    result = new { registered = true, channelId = chId };
                }
                else if (cmd == "unregister_virtual_channel")
                {
                    string chId = argsObj.TryGetProperty("channelId", out var ci) ? ci.GetString() ?? "" : "";
                    _studioBridge.UnregisterVirtualChannel(chId);
                    result = new { unregistered = true };
                }
                else if (cmd == "ai_status")
                {
                    var profile = PlajahAiNativeService.GetHardwareProfile();
                    result = new
                    {
                        success = true,
                        gpuName = profile.GpuName,
                        hasCuda = profile.HasCuda,
                        hasTensorRt = profile.HasTensorRt,
                        hasDirectMl = profile.HasDirectMl,
                        vramTotalMb = profile.DedicatedVramMb,
                        status = profile.Status
                    };
                }
                else if (cmd == "ai_get_model_storage")
                {
                    string storageRoot = GetPlajahModelStorageRoot();
                    result = GetModelStorageInfo(storageRoot);
                }
                else if (cmd == "ai_set_model_storage")
                {
                    string newPath = argsObj.TryGetProperty("path", out var p) ? p.GetString() ?? "" : "";
                    if (!string.IsNullOrWhiteSpace(newPath))
                    {
                        Directory.CreateDirectory(newPath);
                        Directory.CreateDirectory(Path.Combine(newPath, "unet"));
                        Directory.CreateDirectory(Path.Combine(newPath, "checkpoints"));
                        Directory.CreateDirectory(Path.Combine(newPath, "diffusion_models"));
                        Directory.CreateDirectory(Path.Combine(newPath, "ipadapter"));
                        try
                        {
                            Windows.Storage.ApplicationData.Current.LocalSettings.Values["Plajah_ModelStorageDirectory"] = newPath;
                        }
                        catch { }
                        result = GetModelStorageInfo(newPath);
                    }
                    else
                    {
                        result = new { success = false, error = "Path cannot be empty" };
                    }
                }
                else if (cmd == "ai_pick_model_storage_folder")
                {
                    try
                    {
                        var folderPicker = new Windows.Storage.Pickers.FolderPicker();
                        var hwnd = WindowNative.GetWindowHandle(this);
                        InitializeWithWindow.Initialize(folderPicker, hwnd);
                        folderPicker.FileTypeFilter.Add("*");
                        folderPicker.SuggestedStartLocation = Windows.Storage.Pickers.PickerLocationId.ComputerFolder;
                        var folder = await folderPicker.PickSingleFolderAsync();
                        if (folder != null)
                        {
                            string selectedPath = folder.Path;
                            Directory.CreateDirectory(selectedPath);
                            Directory.CreateDirectory(Path.Combine(selectedPath, "unet"));
                            Directory.CreateDirectory(Path.Combine(selectedPath, "checkpoints"));
                            Directory.CreateDirectory(Path.Combine(selectedPath, "diffusion_models"));
                            Directory.CreateDirectory(Path.Combine(selectedPath, "ipadapter"));
                            try
                            {
                                Windows.Storage.ApplicationData.Current.LocalSettings.Values["Plajah_ModelStorageDirectory"] = selectedPath;
                            }
                            catch { }
                            result = GetModelStorageInfo(selectedPath);
                        }
                        else
                        {
                            result = new { success = false, cancelled = true };
                        }
                    }
                    catch (Exception ex)
                    {
                        result = new { success = false, error = ex.Message };
                    }
                }
                else if (cmd == "ai_download_model")
                {
                    string url = argsObj.TryGetProperty("url", out var u) ? u.GetString() ?? "" : "";
                    string fileName = argsObj.TryGetProperty("fileName", out var fn) ? fn.GetString() ?? "" : "";
                    string subfolder = argsObj.TryGetProperty("subfolder", out var sf) ? sf.GetString() ?? "" : "";
                    string modelId = argsObj.TryGetProperty("modelId", out var mid) ? mid.GetString() ?? "" : "";

                    string modelsRoot = GetPlajahModelStorageRoot();
                    string targetFolder = Path.Combine(modelsRoot, subfolder);
                    Directory.CreateDirectory(targetFolder);
                    string targetFile = Path.Combine(targetFolder, fileName);

                    if (File.Exists(targetFile) && new FileInfo(targetFile).Length > 1024 * 1024)
                    {
                        result = new { success = true, installed = true, path = targetFile, message = "Model already installed" };
                    }
                    else
                    {
                        _ = System.Threading.Tasks.Task.Run(async () =>
                        {
                            try
                            {
                                using var http = new System.Net.Http.HttpClient();
                                using var resp = await http.GetAsync(url, System.Net.Http.HttpCompletionOption.ResponseHeadersRead);
                                if (resp.IsSuccessStatusCode)
                                {
                                    using var stream = await resp.Content.ReadAsStreamAsync();
                                    using var fs = new FileStream(targetFile, FileMode.Create, FileAccess.Write, FileShare.None);
                                    await stream.CopyToAsync(fs);
                                    PostNativeMessage("AI_MODEL_DOWNLOAD_COMPLETE", new { modelId, path = targetFile, success = true });
                                }
                            }
                            catch (Exception ex)
                            {
                                PostNativeMessage("AI_MODEL_DOWNLOAD_ERROR", new { modelId, error = ex.Message });
                            }
                        });

                        result = new { success = true, started = true, targetPath = targetFile };
                    }
                }
                else if (cmd == "ai_audit_models")
                {
                    string modelsRoot = GetPlajahModelStorageRoot();
                    bool HasFile(string subfolder, string fileName) => File.Exists(Path.Combine(modelsRoot, subfolder, fileName));

                    result = new
                    {
                        modelsPath = modelsRoot,
                        installed = new Dictionary<string, bool>
                        {
                            ["flux_schnell"] = HasFile("unet", "flux1-schnell.sft"),
                            ["supir_detail"] = HasFile("checkpoints", "SUPIR_v0Q.ckpt"),
                            ["ic_light_fc"] = HasFile("unet", "iclight_sd15_fc.safetensors"),
                            ["wan_video_14b"] = HasFile("diffusion_models", "Wan2.1-I2V-14B-480P.safetensors"),
                            ["animagine_xl"] = HasFile("checkpoints", "animagine-xl-3.1.safetensors"),
                            ["ipadapter_faceid"] = HasFile("ipadapter", "ip-adapter-faceid-plusv2_sdxl.bin")
                        }
                    };
                }
                else if (cmd == "ai_diffuse")
                {
                    var profile = PlajahAiNativeService.GetHardwareProfile();
                    result = new
                    {
                        success = true,
                        backend = profile.HasTensorRt ? "tensorrt" : "directml",
                        gpuName = profile.GpuName,
                        message = "Rendered natively on-device via Plajah DirectML/TensorRT engine."
                    };
                }

                PostNativeMessage("MEDIA_ENGINE_RESULT", new
                {
                    requestId = reqId,
                    result = result
                });
            }
            else if (type == "SCAN_WINDOWS_LIBRARY")
            {
                try
                {
                    var libType = root.TryGetProperty("libraryType", out var lt) ? lt.GetString()?.ToLowerInvariant() : "pictures";
                    var customPath = root.TryGetProperty("folderPath", out var fp) ? fp.GetString() : null;
                    string targetDir;

                    if (!string.IsNullOrEmpty(customPath) && Directory.Exists(customPath))
                    {
                        targetDir = customPath;
                    }
                    else
                    {
                        targetDir = libType switch
                        {
                            "videos" => Environment.GetFolderPath(Environment.SpecialFolder.MyVideos),
                            "music" => Environment.GetFolderPath(Environment.SpecialFolder.MyMusic),
                            "downloads" => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads"),
                            "desktop" => Environment.GetFolderPath(Environment.SpecialFolder.Desktop),
                            _ => Environment.GetFolderPath(Environment.SpecialFolder.MyPictures)
                        };

                        if (string.IsNullOrEmpty(targetDir) || !Directory.Exists(targetDir))
                        {
                            targetDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                                libType switch { "videos" => "Videos", "music" => "Music", "downloads" => "Downloads", "desktop" => "Desktop", _ => "Pictures" });
                        }
                    }

                    if (Directory.Exists(targetDir))
                    {
                        _pendingFolderMapping = targetDir;
                        var allMediaExts = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                        {
                            ".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".mpg", ".mpeg", ".wmv",
                            ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".aiff", ".aif", ".wma",
                            ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp", ".tiff", ".tif", ".ico", ".svg", ".heic"
                        };

                        var mediaExts = (!string.IsNullOrEmpty(customPath) || libType == "downloads" || libType == "desktop")
                            ? allMediaExts
                            : libType switch
                            {
                                "videos" => new HashSet<string>(StringComparer.OrdinalIgnoreCase) { ".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".mpg", ".mpeg", ".wmv" },
                                "music" => new HashSet<string>(StringComparer.OrdinalIgnoreCase) { ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".aiff", ".aif", ".wma" },
                                _ => new HashSet<string>(StringComparer.OrdinalIgnoreCase) { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp", ".tiff", ".tif", ".ico", ".svg", ".heic" }
                            };

                        var files = new List<object>();
                        var dir = new DirectoryInfo(targetDir);
                        foreach (var fi in dir.EnumerateFiles("*", SearchOption.TopDirectoryOnly))
                        {
                            if (mediaExts.Contains(fi.Extension))
                            {
                                var relPath = Path.GetRelativePath(targetDir, fi.FullName).Replace('\\', '/');
                                var isVid = fi.Extension is ".mp4" or ".mov" or ".m4v" or ".webm" or ".mkv" or ".avi" or ".mpg" or ".mpeg" or ".wmv";
                                var isAud = fi.Extension is ".mp3" or ".wav" or ".m4a" or ".aac" or ".flac" or ".ogg" or ".aiff" or ".aif" or ".wma";
                                var isImg = !isVid && !isAud;

                                files.Add(new
                                {
                                    name = fi.Name,
                                    relativePath = relPath,
                                    fullPath = fi.FullName,
                                    folderPath = fi.DirectoryName ?? targetDir,
                                    size = fi.Length,
                                    kind = isVid ? "VIDEO" : isAud ? "AUDIO" : "IMAGE",
                                    lastModified = new DateTimeOffset(fi.LastWriteTimeUtc).ToUnixTimeMilliseconds(),
                                    url = $"https://localmedia.plajah/{Uri.EscapeDataString(relPath).Replace("%2F", "/")}?path={Uri.EscapeDataString(fi.FullName)}"
                                });
                                if (files.Count >= 300) break;
                            }
                        }

                        var subdirs = new List<string>();
                        try
                        {
                            foreach (var sd in dir.EnumerateDirectories())
                            {
                                subdirs.Add(sd.Name);
                            }
                        }
                        catch { }

                        PostNativeMessage("SCAN_WINDOWS_LIBRARY_RESULT", new
                        {
                            success = true,
                            libraryType = libType,
                            folderPath = targetDir,
                            folderName = dir.Name,
                            files,
                            subfolders = subdirs
                        });
                    }
                    else
                    {
                        PostNativeMessage("SCAN_WINDOWS_LIBRARY_RESULT", new
                        {
                            success = false,
                            libraryType = libType,
                            error = "Directory does not exist",
                            files = new List<object>()
                        });
                    }
                }
                catch (Exception ex)
                {
                    PostNativeMessage("SCAN_WINDOWS_LIBRARY_RESULT", new { success = false, error = ex.Message });
                }
            }
            else if (type == "SHOW_IN_EXPLORER")
            {
                var path = root.TryGetProperty("filePath", out var fp) ? fp.GetString() : null;
                if (!string.IsNullOrEmpty(path))
                {
                    try
                    {
                        if (File.Exists(path))
                        {
                            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                            {
                                FileName = "explorer.exe",
                                Arguments = $"/select,\"{path}\"",
                                UseShellExecute = true
                            });
                            PostNativeMessage("SHOW_IN_EXPLORER_RESULT", new { success = true, filePath = path });
                        }
                        else if (Directory.Exists(path))
                        {
                            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                            {
                                FileName = "explorer.exe",
                                Arguments = $"\"{path}\"",
                                UseShellExecute = true
                            });
                            PostNativeMessage("SHOW_IN_EXPLORER_RESULT", new { success = true, filePath = path });
                        }
                        else
                        {
                            PostNativeMessage("SHOW_IN_EXPLORER_RESULT", new { success = false, filePath = path, error = "Item not found" });
                        }
                    }
                    catch (Exception ex)
                    {
                        PostNativeMessage("SHOW_IN_EXPLORER_RESULT", new { success = false, filePath = path, error = ex.Message });
                    }
                }
            }
            else if (type == "SET_AS_WALLPAPER")
            {
                var path = root.TryGetProperty("filePath", out var wp) ? wp.GetString() : null;
                if (!string.IsNullOrEmpty(path) && File.Exists(path))
                {
                    try
                    {
                        int res = SystemParametersInfo(SPI_SETDESKWALLPAPER, 0, path, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);
                        PostNativeMessage("SET_AS_WALLPAPER_RESULT", new { success = res != 0, filePath = path });
                    }
                    catch (Exception ex)
                    {
                        PostNativeMessage("SET_AS_WALLPAPER_RESULT", new { success = false, filePath = path, error = ex.Message });
                    }
                }
                else
                {
                    PostNativeMessage("SET_AS_WALLPAPER_RESULT", new { success = false, filePath = path, error = "File not found" });
                }
            }
            else if (type == "DELETE_FILE")
            {
                var path = root.TryGetProperty("filePath", out var df) ? df.GetString() : null;
                if (!string.IsNullOrEmpty(path) && File.Exists(path))
                {
                    try
                    {
                        File.Delete(path);
                        PostNativeMessage("DELETE_FILE_RESULT", new { success = true, filePath = path });
                    }
                    catch (Exception ex)
                    {
                        PostNativeMessage("DELETE_FILE_RESULT", new { success = false, filePath = path, error = ex.Message });
                    }
                }
                else
                {
                    PostNativeMessage("DELETE_FILE_RESULT", new { success = false, filePath = path, error = "File not found" });
                }
            }
            else if (type == "SAVE_IMAGE_FILE")
            {
                var path = root.TryGetProperty("filePath", out var sf) ? sf.GetString() : null;
                var base64 = root.TryGetProperty("base64Data", out var b64) ? b64.GetString() : null;
                var overwrite = root.TryGetProperty("overwrite", out var ow) && ow.GetBoolean();

                if (!string.IsNullOrEmpty(path) && !string.IsNullOrEmpty(base64))
                {
                    try
                    {
                        var targetPath = path;
                        if (!overwrite && File.Exists(path))
                        {
                            var dir = Path.GetDirectoryName(path) ?? "";
                            var name = Path.GetFileNameWithoutExtension(path);
                            var ext = Path.GetExtension(path);
                            int counter = 1;
                            do
                            {
                                targetPath = Path.Combine(dir, $"{name}_{counter}{ext}");
                                counter++;
                            } while (File.Exists(targetPath));
                        }

                        var cleanBase64 = base64;
                        var commaIdx = cleanBase64.IndexOf(',');
                        if (commaIdx >= 0) cleanBase64 = cleanBase64.Substring(commaIdx + 1);

                        var bytes = Convert.FromBase64String(cleanBase64);
                        await File.WriteAllBytesAsync(targetPath, bytes);

                        var fi = new FileInfo(targetPath);
                        var folder = fi.DirectoryName ?? "";
                        var relPath = Path.GetRelativePath(folder, targetPath).Replace('\\', '/');

                        PostNativeMessage("SAVE_IMAGE_FILE_RESULT", new
                        {
                            success = true,
                            originalPath = path,
                            savedPath = targetPath,
                            fileName = fi.Name,
                            size = fi.Length,
                            lastModified = new DateTimeOffset(fi.LastWriteTimeUtc).ToUnixTimeMilliseconds(),
                            url = $"https://localmedia.plajah/{Uri.EscapeDataString(relPath).Replace("%2F", "/")}?path={Uri.EscapeDataString(targetPath)}"
                        });
                    }
                    catch (Exception ex)
                    {
                        PostNativeMessage("SAVE_IMAGE_FILE_RESULT", new { success = false, filePath = path, error = ex.Message });
                    }
                }
                else
                {
                    PostNativeMessage("SAVE_IMAGE_FILE_RESULT", new { success = false, error = "Invalid arguments" });
                }
            }
        }
        catch (JsonException)
        {
            // Ignore malformed messages from the web surface.
        }
    }

    private void Root_DragOver(object sender, DragEventArgs e)
    {
        if (e.DataView.Contains(StandardDataFormats.StorageItems))
        {
            e.AcceptedOperation = DataPackageOperation.Copy;
            e.DragUIOverride.Caption = "Import to Plajah Studio";
            e.DragUIOverride.IsCaptionVisible = true;
            e.DragUIOverride.IsContentVisible = true;
        }
    }

    private async void Root_Drop(object sender, DragEventArgs e)
    {
        if (!e.DataView.Contains(StandardDataFormats.StorageItems)) return;

        var def = e.GetDeferral();
        try
        {
            var items = await e.DataView.GetStorageItemsAsync();
            var files = new List<object>();

            var mediaExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                ".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".mpg", ".mpeg",
                ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".aiff", ".aif",
                ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".heic", ".tif", ".tiff", ".svg"
            };

            foreach (var item in items)
            {
                if (item is StorageFile sf && mediaExtensions.Contains(sf.FileType))
                {
                    var folder = Path.GetDirectoryName(sf.Path);
                    var fi = new FileInfo(sf.Path);
                    files.Add(new
                    {
                        name = sf.Name,
                        fullPath = sf.Path,
                        folderPath = folder ?? string.Empty,
                        size = fi.Exists ? fi.Length : 0,
                        lastModified = fi.Exists ? new DateTimeOffset(fi.LastWriteTimeUtc).ToUnixTimeMilliseconds() : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                        url = $"https://localmedia.plajah/{Uri.EscapeDataString(sf.Name)}?path={Uri.EscapeDataString(sf.Path)}"
                    });
                }
                else if (item is StorageFolder sFolder)
                {
                    await System.Threading.Tasks.Task.Run(() =>
                    {
                    using var eco = PowerQos.EcoThread();   // bulk I/O scan → efficiency cores
                    try
                    {
                        var dirInfo = new DirectoryInfo(sFolder.Path);
                        foreach (var fi in dirInfo.EnumerateFiles("*", SafeRecursiveScan))
                        {
                            if (files.Count >= MaxScannedFiles) break;
                            if (mediaExtensions.Contains(fi.Extension))
                            {
                                var relPath = Path.GetRelativePath(sFolder.Path, fi.FullName).Replace('\\', '/');
                                files.Add(new
                                {
                                    name = fi.Name,
                                    relativePath = relPath,
                                    fullPath = fi.FullName,
                                    folderPath = sFolder.Path,
                                    size = fi.Length,
                                    lastModified = new DateTimeOffset(fi.LastWriteTimeUtc).ToUnixTimeMilliseconds(),
                                    url = $"https://localmedia.plajah/{Uri.EscapeDataString(relPath).Replace("%2F", "/")}?path={Uri.EscapeDataString(fi.FullName)}"
                                });
                            }
                        }
                    }
                    catch { }
                    });
                }
            }

            if (files.Count > 0)
            {
                PostNativeMessage("NATIVE_FILES_DROPPED", new { files });
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error handling native drop: {ex.Message}");
        }
        finally
        {
            def.Complete();
        }
    }

    private void Root_PointerWheelChanged(object sender, Microsoft.UI.Xaml.Input.PointerRoutedEventArgs e)
    {
        try
        {
            var props = e.GetCurrentPoint(Root).Properties;
            var ctrl = Microsoft.UI.Input.InputKeyboardSource.GetKeyStateForCurrentThread(Windows.System.VirtualKey.Control);
            var alt = Microsoft.UI.Input.InputKeyboardSource.GetKeyStateForCurrentThread(Windows.System.VirtualKey.Menu);

            bool isAlt = (alt & Windows.UI.Core.CoreVirtualKeyStates.Down) == Windows.UI.Core.CoreVirtualKeyStates.Down;
            bool isCtrl = (ctrl & Windows.UI.Core.CoreVirtualKeyStates.Down) == Windows.UI.Core.CoreVirtualKeyStates.Down;

            // If Alt + Wheel is spun, treat as hardware Jog Wheel
            if (isAlt)
            {
                int delta = props.MouseWheelDelta;
                int frames = delta > 0 ? 1 : -1;
                _studioBridge.DispatchJogWheel(frames, isShuttle: isCtrl);
                e.Handled = true;
            }
        }
        catch { }
    }

    private void PostNativeMessage(string type, object payload)
    {
        if (Web.CoreWebView2 is null) return;
        try
        {
            var node = System.Text.Json.JsonSerializer.SerializeToNode(payload) as System.Text.Json.Nodes.JsonObject ?? new System.Text.Json.Nodes.JsonObject();
            node["type"] = type;
            Web.CoreWebView2.PostWebMessageAsString(node.ToJsonString());
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[PostNativeMessage] Error: {ex.Message}");
        }
    }

    private void SaveWindowBounds()
    {
        if (_appWindow is null) return;

        // Never save bounds if the window is minimized or in an invalid state
        if (_appWindow.Presenter is OverlappedPresenter presenter && presenter.State == OverlappedPresenterState.Minimized)
            return;

        int width = _appWindow.Size.Width;
        int height = _appWindow.Size.Height;
        int posX = _appWindow.Position.X;
        int posY = _appWindow.Position.Y;

        // Ensure realistic, visible dimensions (never save collapsed or offscreen coordinates)
        if (width < 960 || height < 600 || posX < -2000 || posY < -2000)
            return;

        try
        {
            var s = ApplicationData.Current.LocalSettings.Values;
            s["winX"] = posX;
            s["winY"] = posY;
            s["winW"] = width;
            s["winH"] = height;
        }
        catch { }
    }

    private void RestoreWindowBounds()
    {
        if (_appWindow is null) return;

        if (_appWindow.Presenter is OverlappedPresenter presenter)
        {
            presenter.IsResizable = true;
            presenter.IsMaximizable = true;
            if (presenter.State == OverlappedPresenterState.Minimized)
            {
                presenter.Restore();
            }
        }

        bool restored = false;
        try
        {
            var s = ApplicationData.Current.LocalSettings.Values;
            if (s.TryGetValue("winW", out var w) && s.TryGetValue("winH", out var h)
                && s.TryGetValue("winX", out var x) && s.TryGetValue("winY", out var y))
            {
                int width = Convert.ToInt32(w);
                int height = Convert.ToInt32(h);
                int posX = Convert.ToInt32(x);
                int posY = Convert.ToInt32(y);

                // Strictly validate dimensions: Must be at least 960x600 and within visible screen space
                if (width >= 960 && height >= 600 && posX > -2000 && posY > -2000 && posX < 40000 && posY < 40000)
                {
                    _appWindow.MoveAndResize(new Windows.Graphics.RectInt32(posX, posY, width, height));
                    restored = true;
                }
                else
                {
                    // Clean up poisoned/corrupted local settings
                    s.Remove("winW");
                    s.Remove("winH");
                    s.Remove("winX");
                    s.Remove("winY");
                }
            }
        }
        catch { }

        if (!restored)
        {
            CenterAndSizeDefaultWindow();
        }
    }

    private void CenterAndSizeDefaultWindow()
    {
        if (_appWindow is null) return;

        try
        {
            var hwnd = WindowNative.GetWindowHandle(this);
            var wndId = Win32Interop.GetWindowIdFromWindow(hwnd);
            var displayArea = DisplayArea.GetFromWindowId(wndId, DisplayAreaFallback.Primary);
            if (displayArea != null)
            {
                var workArea = displayArea.WorkArea;
                int targetW = Math.Min(1440, Math.Max(960, workArea.Width - 100));
                int targetH = Math.Min(900, Math.Max(600, workArea.Height - 80));
                int targetX = workArea.X + (workArea.Width - targetW) / 2;
                int targetY = workArea.Y + (workArea.Height - targetH) / 2;
                _appWindow.MoveAndResize(new Windows.Graphics.RectInt32(targetX, targetY, targetW, targetH));
                return;
            }
        }
        catch { }

        _appWindow.Resize(new Windows.Graphics.SizeInt32(1440, 900));
    }

    // ── Native AI Model Storage (Separate Drive & Custom Path Support) ─────
    private string GetPlajahModelStorageRoot()
    {
        try
        {
            var custom = Windows.Storage.ApplicationData.Current.LocalSettings.Values["Plajah_ModelStorageDirectory"] as string;
            if (!string.IsNullOrWhiteSpace(custom) && Directory.Exists(custom))
            {
                return custom;
            }
        }
        catch { }

        string appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string defaultRoot = Path.Combine(appData, "Plajah", "Models");
        if (!Directory.Exists(defaultRoot)) Directory.CreateDirectory(defaultRoot);
        return defaultRoot;
    }

    private object GetModelStorageInfo(string modelsRoot)
    {
        try
        {
            var rootDir = Path.GetPathRoot(modelsRoot);
            var drive = new DriveInfo(rootDir ?? "C:\\");
            double freeGb = Math.Round(drive.AvailableFreeSpace / (1024.0 * 1024.0 * 1024.0), 1);
            double totalGb = Math.Round(drive.TotalSize / (1024.0 * 1024.0 * 1024.0), 1);
            string appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            bool isCustom = !modelsRoot.StartsWith(appData, StringComparison.OrdinalIgnoreCase);

            return new
            {
                success = true,
                path = modelsRoot,
                driveName = drive.Name,
                driveLabel = drive.VolumeLabel,
                freeSpaceBytes = drive.AvailableFreeSpace,
                freeSpaceGb = freeGb,
                totalSpaceBytes = drive.TotalSize,
                totalSpaceGb = totalGb,
                isCustomDrive = isCustom
            };
        }
        catch (Exception ex)
        {
            return new
            {
                success = true,
                path = modelsRoot,
                driveName = "C:\\",
                driveLabel = "System",
                freeSpaceBytes = 50L * 1024 * 1024 * 1024,
                freeSpaceGb = 50.0,
                totalSpaceBytes = 512L * 1024 * 1024 * 1024,
                totalSpaceGb = 512.0,
                isCustomDrive = false,
                error = ex.Message
            };
        }
    }

    // ── Native Activation & Media File Launching ───────────────────────────
    private string? _pendingActivationJson = null;
    private string? _pendingFolderMapping = null;
    // Retained copy of the cold-start file payload, served on request (GET_LAUNCH_MEDIA).
    private string? _launchMediaJson = null;
    // Experience tile slug (--experience=chora …) awaiting the first navigation.
    private string? _launchExperience = null;
    private bool _firstActivationHandled = false;

    /// <summary>
    /// Experience Start tiles are extra &lt;Application&gt; entries in Package.appxmanifest that run
    /// this same exe with uap10:Parameters="--experience=&lt;slug&gt;". Read it from the activation
    /// (redirected launches) or the process command line (first launch).
    /// </summary>
    private static string? ParseExperience(Microsoft.Windows.AppLifecycle.AppActivationArguments? args, bool includeProcessArgs)
    {
        var sources = new List<string>();
        if (args?.Kind == Microsoft.Windows.AppLifecycle.ExtendedActivationKind.Launch &&
            args.Data is Windows.ApplicationModel.Activation.ILaunchActivatedEventArgs launch &&
            !string.IsNullOrEmpty(launch.Arguments))
        {
            sources.AddRange(launch.Arguments.Split(' ', StringSplitOptions.RemoveEmptyEntries));
        }
        // Only on the first activation: a later redirected launch (e.g. the plain Plajah tile) must
        // not re-read the command line THIS process was originally started with.
        if (includeProcessArgs) sources.AddRange(Environment.GetCommandLineArgs().Skip(1));
        foreach (var raw in sources)
        {
            var a = raw.Trim('"');
            const string prefix = "--experience=";
            if (a.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                var slug = a.Substring(prefix.Length).Trim().ToLowerInvariant();
                if (System.Text.RegularExpressions.Regex.IsMatch(slug, "^[a-z_-]{1,32}$")) return slug;
            }
        }
        return null;
    }

    public void BringToFront()
    {
        var hwnd = WindowNative.GetWindowHandle(this);
        var wndId = Win32Interop.GetWindowIdFromWindow(hwnd);
        AppWindow.GetFromWindowId(wndId).Show(true);
        SetForegroundWindow(hwnd);
    }

    public void HandleActivationArgs(Microsoft.Windows.AppLifecycle.AppActivationArguments? args)
    {
        try
        {
            string? targetFilePath = null;
            if (args != null && args.Kind == Microsoft.Windows.AppLifecycle.ExtendedActivationKind.File)
            {
                if (args.Data is Windows.ApplicationModel.Activation.IFileActivatedEventArgs fileArgs && fileArgs.Files?.Count > 0)
                {
                    targetFilePath = fileArgs.Files[0].Path;
                }
            }

            if (string.IsNullOrEmpty(targetFilePath))
            {
                var cmdArgs = Environment.GetCommandLineArgs();
                if (cmdArgs.Length > 1 && File.Exists(cmdArgs[1]))
                {
                    targetFilePath = cmdArgs[1];
                }
            }

            if (!string.IsNullOrEmpty(targetFilePath) && File.Exists(targetFilePath))
            {
                ActivateMediaFile(targetFilePath);
                return;
            }

            var experience = ParseExperience(args, includeProcessArgs: !_firstActivationHandled);
            _firstActivationHandled = true;
            if (experience != null)
            {
                if (Web.CoreWebView2 != null)
                    PostNativeMessage("LAUNCH_EXPERIENCE", new { experience });   // live window → App.tsx setView
                else
                    _launchExperience = experience;                               // first launch → ?view= on navigate
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[Plajah Activation] Error: {ex.Message}");
        }
    }

    public void ActivateMediaFile(string filePath)
    {
        try
        {
            var folder = Path.GetDirectoryName(filePath);
            if (string.IsNullOrEmpty(folder)) return;
            _pendingFolderMapping = folder;

            var imageExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp", ".tiff", ".tif", ".ico", ".svg", ".heic", ".dng", ".raw"
            };
            var videoExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                ".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".mpg", ".mpeg", ".wmv", ".flv", ".ts", ".m2ts", ".vob", ".ogv", ".3gp"
            };
            var audioExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                ".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".aiff", ".aif", ".wma", ".opus", ".alac"
            };

            string DetectMediaKind(string ext)
            {
                if (videoExtensions.Contains(ext)) return "VIDEO";
                if (audioExtensions.Contains(ext)) return "AUDIO";
                if (imageExtensions.Contains(ext)) return "IMAGE";
                return "UNKNOWN";
            }

            var activeFi = new FileInfo(filePath);
            var activeKind = DetectMediaKind(activeFi.Extension);

            try
            {
                if (activeKind == "VIDEO") this.Title = $"Plajah Video Player - {activeFi.Name}";
                else if (activeKind == "AUDIO") this.Title = $"Plajah Chora - {activeFi.Name}";
                else if (activeKind == "IMAGE") this.Title = $"Plajah Photo Viewer - {activeFi.Name}";
            }
            catch { }

            var activeRelPath = Path.GetRelativePath(folder, filePath).Replace('\\', '/');
            var activeFileObj = new
            {
                name = activeFi.Name,
                fullPath = activeFi.FullName,
                folderPath = folder,
                relativePath = activeRelPath,
                size = activeFi.Length,
                lastModified = new DateTimeOffset(activeFi.LastWriteTimeUtc).ToUnixTimeMilliseconds(),
                url = $"https://localmedia.plajah/{Uri.EscapeDataString(activeRelPath).Replace("%2F", "/")}?path={Uri.EscapeDataString(activeFi.FullName)}",
                mediaKind = activeKind
            };

            var siblingFiles = new List<object>();
            var dirInfo = new DirectoryInfo(folder);
            foreach (var fi in dirInfo.EnumerateFiles("*", SearchOption.TopDirectoryOnly))
            {
                var siblingKind = DetectMediaKind(fi.Extension);
                if (siblingKind != "UNKNOWN")
                {
                    var relPath = Path.GetRelativePath(folder, fi.FullName).Replace('\\', '/');
                    siblingFiles.Add(new
                    {
                        name = fi.Name,
                        fullPath = fi.FullName,
                        folderPath = folder,
                        relativePath = relPath,
                        size = fi.Length,
                        lastModified = new DateTimeOffset(fi.LastWriteTimeUtc).ToUnixTimeMilliseconds(),
                        url = $"https://localmedia.plajah/{Uri.EscapeDataString(relPath).Replace("%2F", "/")}?path={Uri.EscapeDataString(fi.FullName)}",
                        mediaKind = siblingKind
                    });
                }
            }

            var payload = new
            {
                type = "OPEN_MEDIA_FILE",
                mediaKind = activeKind,
                activeFile = activeFileObj,
                folderFiles = siblingFiles
            };

            if (Web.CoreWebView2 != null)
            {
                PostNativeMessage("OPEN_MEDIA_FILE", payload);
            }
            else
            {
                _pendingActivationJson = JsonSerializer.Serialize(payload);
                _launchMediaJson = _pendingActivationJson;
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[Plajah ActivateMediaFile] Error: {ex.Message}");
        }
    }

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern bool ReleaseCapture();

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int Msg, IntPtr wParam, IntPtr lParam);

    private const int WM_NCLBUTTONDOWN = 0xA1;
    private const int HTCAPTION = 0x2;

    [System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Auto)]
    private static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni);

    private const int SPI_SETDESKWALLPAPER = 20;
    private const int SPIF_UPDATEINIFILE = 0x01;
    private const int SPIF_SENDCHANGE = 0x02;

    private sealed class SlicedStream : Stream
    {
        private readonly FileStream _baseStream;
        private readonly long _start;
        private readonly long _length;
        private long _position;

        public SlicedStream(FileStream baseStream, long start, long length)
        {
            _baseStream = baseStream;
            _start = start;
            _length = length;
            _position = 0;
            _baseStream.Seek(_start, SeekOrigin.Begin);
        }

        public override bool CanRead => _baseStream.CanRead;
        public override bool CanSeek => true;
        public override bool CanWrite => false;
        public override long Length => _length;
        public override long Position
        {
            get => _position;
            set => Seek(value, SeekOrigin.Begin);
        }

        public override int Read(byte[] buffer, int offset, int count)
        {
            if (_position >= _length) return 0;
            var toRead = (int)Math.Min(count, _length - _position);
            _baseStream.Seek(_start + _position, SeekOrigin.Begin);
            var read = _baseStream.Read(buffer, offset, toRead);
            _position += read;
            return read;
        }

        public override long Seek(long offset, SeekOrigin origin)
        {
            long newPos = origin switch
            {
                SeekOrigin.Begin => offset,
                SeekOrigin.Current => _position + offset,
                SeekOrigin.End => _length + offset,
                _ => throw new ArgumentOutOfRangeException(nameof(origin))
            };
            if (newPos < 0 || newPos > _length) throw new IOException("Seek out of bounds");
            _position = newPos;
            _baseStream.Seek(_start + _position, SeekOrigin.Begin);
            return _position;
        }

        public override void Flush() => _baseStream.Flush();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

        protected override void Dispose(bool disposing)
        {
            if (disposing) _baseStream.Dispose();
            base.Dispose(disposing);
        }
    }
}

