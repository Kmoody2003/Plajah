import AppKit
import WebKit

/// The main Plajah window — mirrors windows-native MainWindow:
///  • content runs edge to edge under a hidden title bar (Windows: Mica + ExtendsContentIntoTitleBar),
///    and the web layer's own title bar (DesktopGlobalToolbar) draws the controls and drag area,
///    exactly as it does on Windows;
///  • window size/position persist between launches;
///  • Plajah links stay in-app, sign-in popups open as child windows, other links go to the browser;
///  • camera + microphone are granted to plajah.com without nagging (Live, VTuber, Perform);
///  • element fullscreen for video.
final class ShellWindowController: NSWindowController, NSWindowDelegate {

    let webView: WKWebView
    let bridge: NativeBridge
    private let navigation = ShellNavigation()

    init() {
        let config = WKWebViewConfiguration()
        let bridge = NativeBridge()
        self.bridge = bridge
        config.userContentController.add(bridge, name: "plajahHost")
        config.userContentController.addUserScript(WKUserScript(
            // Main frame only: third-party iframes (embeds, ads) never see the native bridge.
            source: BridgeScript.source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.setURLSchemeHandler(LocalMediaSchemeHandler(), forURLScheme: LocalMediaSchemeHandler.scheme)
        config.preferences.isElementFullscreenEnabled = true
        config.preferences.javaScriptCanOpenWindowsAutomatically = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.applicationNameForUserAgent = "Plajah/2.0 macOS"
        config.websiteDataStore = .default()   // keep sign-in and IndexedDB between launches

        webView = WKWebView(frame: .zero, configuration: config)
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsMagnification = true
        if #available(macOS 13.3, *) { webView.isInspectable = true }   // Safari ▸ Develop (WebView2 DevTools)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered, defer: false)
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.title = "Plajah"
        window.minSize = NSSize(width: 480, height: 360)
        window.backgroundColor = .black
        window.isMovableByWindowBackground = false
        // The web title bar draws minimise / maximise / close (as on Windows), so hide the traffic
        // lights to avoid two sets of controls. ⌘W / ⌘M / ⌃⌘F still work from the menus.
        for button in [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton] {
            window.standardWindowButton(button)?.isHidden = true
        }
        window.contentView = webView
        window.center()
        window.setFrameAutosaveName("PlajahMainWindow")   // Windows: SaveWindowBounds / RestoreWindowBounds

        super.init(window: window)
        window.delegate = self
        bridge.attach(webView: webView, window: window)
        navigation.bridge = bridge
        webView.navigationDelegate = navigation
        webView.uiDelegate = navigation
        webView.load(URLRequest(url: PlajahConfig.appURL))
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    func navigate(path: String) {
        guard let url = URL(string: path, relativeTo: PlajahConfig.appURL) else { return }
        webView.load(URLRequest(url: url))
    }

    /// plajah://view/<slug> → /?view=<slug> (Windows: protocol activation → LAUNCH_EXPERIENCE).
    func openDeepLink(_ url: URL) {
        guard url.scheme == "plajah" else { return }
        if url.host == "view", let slug = url.pathComponents.dropFirst().first {
            bridge.post(type: "LAUNCH_EXPERIENCE", payload: ["experience": slug])
        }
    }

    /// Finder "Open With Plajah" → the same OPEN_MEDIA_FILE payload the Windows shell posts.
    func openFiles(_ urls: [URL]) {
        bridge.openLaunchFiles(urls)
    }

    // MARK: Menu actions

    @objc func reloadPage(_ sender: Any?) { webView.reload() }
    @objc func zoomIn(_ sender: Any?) { webView.pageZoom = min(3, webView.pageZoom + 0.1) }
    @objc func zoomOut(_ sender: Any?) { webView.pageZoom = max(0.5, webView.pageZoom - 0.1) }
    @objc func zoomReset(_ sender: Any?) { webView.pageZoom = 1 }

    // MARK: Window state → web (Windows: WINDOW_STATE_CHANGED)

    func windowDidResize(_ notification: Notification) { bridge.postWindowState(changed: true) }
    func windowDidMiniaturize(_ notification: Notification) { bridge.postWindowState(changed: true) }
    func windowDidDeminiaturize(_ notification: Notification) { bridge.postWindowState(changed: true) }
    func windowDidEnterFullScreen(_ notification: Notification) { bridge.postWindowState(changed: true) }
    func windowDidExitFullScreen(_ notification: Notification) { bridge.postWindowState(changed: true) }
    func windowDidChangeScreen(_ notification: Notification) {
        bridge.post(type: "DISPLAY_CHANGE", payload: ["event": "changed", "count": NSScreen.screens.count])
    }
}

/// Navigation + popups + permissions (Windows: NavigationStarting, NewWindowRequested, PermissionRequested).
@MainActor
final class ShellNavigation: NSObject, WKNavigationDelegate, WKUIDelegate {
    weak var bridge: NativeBridge?
    private var popups: [NSWindow] = []

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.allow); return }
        if action.shouldPerformDownload { decisionHandler(.download); return }
        switch url.scheme?.lowercased() {
        case "http", "https", "about", "blob", "data", LocalMediaSchemeHandler.scheme:
            break
        default:
            // mailto:, tel:, zoommtg:, spotify: … → the system handler.
            NSWorkspace.shared.open(url); decisionHandler(.cancel); return
        }
        let host = url.host
        let isMainFrame = action.targetFrame?.isMainFrame ?? true
        if isMainFrame && action.navigationType == .linkActivated
            && !PlajahConfig.isPlajahHost(host) && !PlajahConfig.isAuthHost(host) {
            NSWorkspace.shared.open(url); decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(response.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = DownloadSaver.shared
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = DownloadSaver.shared
    }

    /// window.open: sign-in providers and Plajah pop-outs get a real child window that keeps
    /// window.opener (Firebase popup auth needs it); anything else opens in the browser.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        let host = action.request.url?.host
        if let url = action.request.url, !PlajahConfig.isPlajahHost(host), !PlajahConfig.isAuthHost(host),
           url.scheme?.hasPrefix("http") == true {
            NSWorkspace.shared.open(url)
            return nil
        }
        let popup = WKWebView(frame: .zero, configuration: configuration)
        popup.uiDelegate = self
        popup.navigationDelegate = self
        let w = NSWindow(contentRect: NSRect(x: 0, y: 0,
                                             width: CGFloat(windowFeatures.width?.doubleValue ?? 520),
                                             height: CGFloat(windowFeatures.height?.doubleValue ?? 680)),
                         styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        w.contentView = popup
        w.title = "Sign in"
        w.isReleasedWhenClosed = false
        w.center()
        w.makeKeyAndOrderFront(nil)
        popups.append(w)
        return popup
    }

    func webViewDidClose(_ webView: WKWebView) {
        if let i = popups.firstIndex(where: { $0.contentView === webView }) {
            popups[i].close()
            popups.remove(at: i)
        }
    }

    /// Camera + mic for Plajah pages without a second prompt (macOS still shows its own TCC prompt once).
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(PlajahConfig.isPlajahHost(origin.host) ? .grant : .prompt)
    }

    /// <input type=file> → the native open panel.
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.canChooseFiles = true
        panel.begin { completionHandler($0 == .OK ? panel.urls : nil) }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.runModal()
        completionHandler()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        let alert = NSAlert()
        alert.messageText = prompt
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 300, height: 24))
        field.stringValue = defaultText ?? ""
        alert.accessoryView = field
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        completionHandler(alert.runModal() == .alertFirstButtonReturn ? field.stringValue : nil)
    }

    /// Offline / DNS failure → the same local retry page the Android shell uses (cap-shell/offline.html).
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let code = (error as NSError).code
        guard code != NSURLErrorCancelled else { return }
        if let offline = Bundle.main.url(forResource: "offline", withExtension: "html") {
            webView.loadFileURL(offline, allowingReadAccessTo: offline.deletingLastPathComponent())
        }
    }
}

/// Downloads land in ~/Downloads with a unique name, then reveal in Finder.
final class DownloadSaver: NSObject, WKDownloadDelegate {
    static let shared = DownloadSaver()

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                  suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let downloads = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
        completionHandler(FileOps.uniqueURL(downloads.appendingPathComponent(suggestedFilename)))
    }

    func downloadDidFinish(_ download: WKDownload) {
        Notifier.show(title: "Download complete", body: download.originalRequest?.url?.lastPathComponent ?? "")
    }
}
