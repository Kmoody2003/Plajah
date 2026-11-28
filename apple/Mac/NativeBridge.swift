import AppKit
import WebKit

/// Web → native message router: the macOS counterpart of MainWindow.Web_WebMessageReceived in
/// windows-native/Plajah.WinUI. Message names, fields and reply shapes match the Windows host, so
/// the web layer can't tell the difference except through __PLAJAH_PLATFORM__ / capabilities.
///
/// Implemented on Mac (native equivalents):
///   WINDOW_* · GET_WINDOW_STATE · WINDOW_FULLSCREEN_*         (NSWindow)
///   FILES_* · PICK_FILE · PICK_FOLDER · READ_FILE_BYTES · SAVE_IMAGE_FILE · DELETE_FILE
///   SHOW_IN_EXPLORER (Finder) · SET_AS_WALLPAPER · GET_LAUNCH_MEDIA
///   CONNECTOR_*_SECRET (Keychain) · SYNC_* (pairs/baselines on disk)
///   SPEECH_* (SFSpeechRecognizer) · HELLO_* (Touch ID) · ACCELERATION_CHECK (Metal)
///   AUDIO_DEVICE_LIST (Core Audio) · STUDIO_DISPLAYS_QUERY · STUDIO_TASKBAR_PROGRESS (Dock tile)
///   OPEN/CLOSE_OUTPUT_WINDOW · CLOSE_ALL_OUTPUTS · LIST_OUTPUT_WINDOWS · STUDIO_CLEAN_FEED_*
///
/// Windows-only hardware (ASIO, NDI, VST3, DirectML/NPU, DeckLink, Photoshop plug-ins, DWG,
/// fab machines) answers with its normal reply type and an empty/unsupported result, so no web
/// caller waits forever. Those are the Mac backlog (see apple/README.md).
@MainActor
final class NativeBridge: NSObject, WKScriptMessageHandler {
    private(set) weak var webView: WKWebView?
    private(set) weak var window: NSWindow?

    lazy var files = FilesBridge(bridge: self)
    lazy var system = SystemBridge(bridge: self)
    lazy var speech = SpeechBridge(bridge: self)
    lazy var outputs = OutputWindows(bridge: self)

    /// OPEN_MEDIA_FILE JSON for the file the app was launched with (pulled by GET_LAUNCH_MEDIA).
    private var launchMediaJson: String?

    func attach(webView: WKWebView, window: NSWindow) {
        self.webView = webView
        self.window = window
        system.installDragMonitor()
    }

    // MARK: Native → web

    /// Same as Windows PostNativeMessage: payload + "type", delivered as a JSON string.
    func post(type: String, payload: [String: Any] = [:], requestId: String? = nil) {
        var node = payload
        node["type"] = type
        if let r = requestId, !r.isEmpty { node["requestId"] = r }
        postRaw(JSON.string(node))
    }

    /// Main-actor only; background work hops back with `await MainActor.run` before posting.
    func postRaw(_ json: String) {
        guard let web = webView else { return }
        // Pass the JSON as a JS string literal (the event's data is a string, as with WebView2).
        let literal = JSON.string([json]).dropFirst().dropLast()
        web.evaluateJavaScript("window.__plajahHostDispatch && window.__plajahHostDispatch(\(literal));")
    }

    func postWindowState(changed: Bool) {
        guard let w = window else { return }
        post(type: changed ? "WINDOW_STATE_CHANGED" : "WINDOW_STATE", payload: [
            "isMaximized": w.isZoomed,
            "isMinimized": w.isMiniaturized,
            "isFullscreen": w.styleMask.contains(.fullScreen),
        ])
    }

    // MARK: Web → native

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        // Only the Plajah page itself may drive the native host.
        guard message.frameInfo.isMainFrame,
              PlajahConfig.isPlajahHost(message.frameInfo.securityOrigin.host) else { return }
        guard let text = message.body as? String,
              let root = JSON.object(text),
              let type = root["type"] as? String else { return }
        Task { @MainActor in
            await self.handle(type: type, root: root)
        }
    }

    @MainActor
    private func handle(type: String, root: [String: Any]) async {
        if type.hasPrefix("FILES_") || type.hasPrefix("CONNECTOR_") || type.hasPrefix("SYNC_") {
            await files.handleUnified(type: type, root: root)
            return
        }
        if type.hasPrefix("SPEECH_") { speech.handle(type: type, root: root); return }

        switch type {
        // Window
        case "WINDOW_DRAG": system.beginDrag()
        case "WINDOW_MINIMIZE": window?.miniaturize(nil)
        case "WINDOW_MAXIMIZE": window?.zoom(nil)
        case "WINDOW_RESTORE":
            if window?.isMiniaturized == true { window?.deminiaturize(nil) }
            else if window?.isZoomed == true { window?.zoom(nil) }
        case "WINDOW_CLOSE": window?.performClose(nil)
        case "WINDOW_FULLSCREEN_TOGGLE": window?.toggleFullScreen(nil)
        case "WINDOW_FULLSCREEN_SET":
            let want = root["fullscreen"] as? Bool ?? false
            if want != (window?.styleMask.contains(.fullScreen) ?? false) { window?.toggleFullScreen(nil) }
        case "GET_WINDOW_STATE": postWindowState(changed: false)

        // Launch
        case "GET_LAUNCH_MEDIA": if let json = launchMediaJson { postRaw(json) }

        // Files (single-shot Windows messages)
        case "PICK_FILE": files.pickFile()
        case "PICK_FOLDER": files.pickFolder()
        case "READ_FILE_BYTES": files.readFileBytes(path: root["path"] as? String)
        case "SAVE_IMAGE_FILE": files.saveImageFile(root)
        case "DELETE_FILE": files.deleteFile(path: root["filePath"] as? String)
        case "SHOW_IN_EXPLORER": files.revealInFinder(path: root["filePath"] as? String)
        case "SET_AS_WALLPAPER": files.setWallpaper(path: root["filePath"] as? String)

        // System
        case "HELLO_CHECK": system.helloCheck()
        case "HELLO_VERIFY": await system.helloVerify(message: root["message"] as? String ?? "")
        case "ACCELERATION_CHECK": post(type: "ACCELERATION_PROFILE", payload: system.accelerationProfile())
        case "AI_PROFILE_CHECK": post(type: "AI_HARDWARE_PROFILE", payload: system.aiProfile())
        case "AUDIO_DEVICE_LIST": post(type: "AUDIO_DEVICE_LIST_RESULT", payload: ["devices": AudioDevices.list()])
        case "AUDIO_DEVICE_SELECT":
            post(type: "AUDIO_DEVICE_SELECT_RESULT", payload: [
                "success": true, "deviceId": root["deviceId"] as? String ?? "", "driverType": "COREAUDIO"])
        case "NATIVE_AUDIO_OPEN":
            post(type: "NATIVE_AUDIO_OPEN_RESULT", payload: ["success": true, "driver": "CoreAudio"])
        case "STUDIO_DISPLAYS_QUERY": post(type: "STUDIO_DISPLAYS_RESULT", payload: ["displays": system.displays()])
        case "STUDIO_TASKBAR_PROGRESS":
            system.setDockProgress(root["progress"] as? Double ?? 0, state: root["state"] as? String ?? "normal")
        case "STUDIO_EXTRACT_THUMBNAILS":
            let paths = root["paths"] as? [String] ?? []
            let size = root["targetSize"] as? Int ?? 320
            post(type: "STUDIO_EXTRACT_THUMBNAILS_RESULT", payload: ["thumbnails": await Thumbnails.batch(paths, size: size)])

        // Output windows (Ambo / Stage clean feeds on other displays)
        case "OPEN_OUTPUT_WINDOW", "STUDIO_CLEAN_FEED_OPEN": outputs.open(type: type, root: root)
        case "CLOSE_OUTPUT_WINDOW": outputs.close(outputId: root["outputId"] as? String ?? "")
        case "STUDIO_CLEAN_FEED_CLOSE": outputs.closeCleanFeed()
        case "CLOSE_ALL_OUTPUTS": outputs.closeAll()
        case "LIST_OUTPUT_WINDOWS": outputs.list()

        // Media engine: nothing native yet on Mac; answer so promises settle.
        case "MEDIA_ENGINE_INVOKE":
            post(type: "MEDIA_ENGINE_RESULT", payload: [
                "requestId": root["requestId"] as? String ?? "",
                "result": ["ok": false, "success": false, "error": "Not available in Plajah for Mac yet",
                           "cmd": root["cmd"] as? String ?? ""],
            ])

        default:
            replyUnsupported(type: type, root: root)
        }
    }

    /// Windows-only features: send the reply the web side is waiting for, marked unsupported.
    private func replyUnsupported(type: String, root: [String: Any]) {
        let reqId = root["requestId"] as? String
        let unsupported: [String: Any] = ["success": false, "ok": false, "supported": false,
                                          "error": "Not available in Plajah for Mac yet"]
        let known: [String: (String, [String: Any])] = [
            "NDI_SCAN_REQUEST": ("NDI_SCAN_RESULT", ["streams": [Any]()]),
            "NDI_QUERY_STATUS": ("NDI_STATUS_RESULT", ["installed": false, "available": false]),
            "VST_LIST_DIRECTORIES": ("VST_DIRECTORIES", ["directories": [Any]()]),
            "VST_ADD_DIRECTORY": ("VST_DIRECTORIES", ["directories": [Any]()]),
            "VST_REMOVE_DIRECTORY": ("VST_DIRECTORIES", ["directories": [Any]()]),
            "VST_SCAN": ("VST_SCAN_RESULT", ["plugins": [Any]()]),
            "ASIO_DRIVERS": ("ASIO_DRIVERS_RESULT", ["drivers": [Any]()]),
            "ASIO_PROBE": ("ASIO_PROBE_RESULT", ["driver": root["driver"] ?? "", "ok": false, "error": "ASIO is Windows-only", "inputs": 0, "outputs": 0, "inputNames": [Any](), "sampleRates": [Any]()]),
            "ASIO_REC_START": ("ASIO_REC_START_RESULT", ["ok": false, "takeId": root["takeId"] ?? "", "error": "ASIO is Windows-only"]),
            "ASIO_REC_STOP": ("ASIO_REC_STOP_RESULT", ["ok": false, "takeId": root["takeId"] ?? "", "error": "Not running", "files": [Any]()]),
            "LOCAL_LLM_STATUS": ("LOCAL_LLM_STATUS_RESULT", ["available": false, "models": [Any](), "backend": "none"]),
            "LOCAL_LLM_REQUEST": ("LOCAL_LLM_RESULT", ["requestId": reqId ?? "", "success": false, "error": "On-device AI is not on Mac yet"]),
            "LOCAL_LLM_LOOK": ("LOCAL_LLM_LOOK_RESULT", ["requestId": reqId ?? "", "success": false, "error": "On-device AI is not on Mac yet"]),
            "LOCAL_LLM_DOWNLOAD": ("LOCAL_LLM_DOWNLOAD_RESULT", ["key": root["key"] ?? "", "success": false, "error": "On-device AI is not on Mac yet"]),
            "STEM_SEPARATION_REQUEST": ("STEM_SEPARATION_RESULT", unsupported),
            "TELA3D_ENSURE": ("TELA3D_ENSURE_RESULT", unsupported),
            "ARGILLA_NPU_ENSURE": ("ARGILLA_NPU_ENSURE_RESULT", unsupported),
            "ARGILLA_NPU_INSTALL": ("ARGILLA_NPU_INSTALL_RESULT", unsupported),
            "CAD_DWG_TO_DXF": ("CAD_DWG_TO_DXF_RESULT", ["id": root["id"] ?? "", "success": false, "error": "DWG conversion is Windows-only for now"]),
            "COMPOSITOR_OPEN_OUTPUT": ("COMPOSITOR_STATUS", ["outputId": root["outputId"] ?? "", "active": false, "engine": "none"]),
            "COMPOSITOR_CLOSE_OUTPUT": ("COMPOSITOR_STATUS", ["outputId": root["outputId"] ?? "", "active": false]),
            "COMPOSITOR_SHUTDOWN": ("COMPOSITOR_STATUS", ["active": false, "shutdown": true]),
            "SCAN_WINDOWS_LIBRARY": ("SCAN_WINDOWS_LIBRARY_RESULT", ["success": false, "files": [Any]()]),
        ]
        if let (reply, payload) = known[type] {
            post(type: reply, payload: payload)
        } else if type.hasPrefix("PS_PLUGIN_") {
            post(type: type + "_RESULT", payload: unsupported, requestId: reqId)
        } else if reqId != nil {
            // Generic request/response: echo <TYPE>_RESULT with the requestId, as Windows does.
            post(type: type + "_RESULT", payload: unsupported, requestId: reqId)
        }
        // Fire-and-forget messages (PROGRAM_OUT_FRAME, LD_UDP_SEND, FAB_MACHINE_*, jog...) are dropped.
    }

    // MARK: Launch files

    func openLaunchFiles(_ urls: [URL]) {
        guard let first = urls.first else { return }
        let entries = urls.map { FileOps.mediaEntry(for: $0) }
        let kind = FileOps.mediaKind(for: first)
        let payload: [String: Any] = [
            "type": "OPEN_MEDIA_FILE",
            "mediaKind": kind,
            "activeFile": FileOps.mediaEntry(for: first),
            "folderFiles": entries,
        ]
        let json = JSON.string(payload)
        launchMediaJson = json
        postRaw(json)
        window?.makeKeyAndOrderFront(nil)
    }
}

/// Tiny JSON helpers (Foundation types in and out).
enum JSON {
    static func string(_ value: Any) -> String {
        guard JSONSerialization.isValidJSONObject(value),
              let data = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]),
              let s = String(data: data, encoding: .utf8) else { return "{}" }
        return s
    }

    static func object(_ text: String) -> [String: Any]? {
        guard let data = text.data(using: .utf8) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }
}
