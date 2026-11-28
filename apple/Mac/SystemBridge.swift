import AppKit
import Metal
import CoreAudio
import LocalAuthentication
import QuickLookThumbnailing
import UserNotifications
import WebKit

/// Window drag, biometrics, hardware profile, displays, Dock progress — the Mac equivalents of the
/// Windows host's Win32 / Windows Hello / WindowsAccelerationService / taskbar pieces.
@MainActor
final class SystemBridge {
    private unowned let bridge: NativeBridge
    private var lastMouseDown: NSEvent?
    private var monitor: Any?

    init(bridge: NativeBridge) { self.bridge = bridge }

    // MARK: Window drag (Windows: ReleaseCapture + WM_NCLBUTTONDOWN/HTCAPTION)

    /// WINDOW_DRAG arrives a moment after the web pointerdown, so remember the native mouse-down
    /// and start the system drag from it while the button is still held.
    func installDragMonitor() {
        monitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown]) { [weak self] event in
            self?.lastMouseDown = event
            return event
        }
    }

    func beginDrag() {
        guard let window = bridge.window, let down = lastMouseDown,
              NSEvent.pressedMouseButtons & 1 == 1 else { return }
        if down.clickCount == 2 { window.zoom(nil); return }   // double-click title bar = zoom, like Windows maximise
        window.performDrag(with: down)
    }

    // MARK: Touch ID (Windows Hello)

    func helloCheck() {
        let ctx = LAContext()
        var err: NSError?
        let ok = ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err)
        bridge.post(type: "WINDOWS_HELLO_STATUS", payload: [
            "supported": true, "available": ok,
            "reason": ok ? (ctx.biometryType == .touchID ? "Touch ID" : "Mac password") : (err?.localizedDescription ?? "Unavailable"),
        ])
    }

    func helloVerify(message: String) async {
        let ctx = LAContext()
        do {
            let ok = try await ctx.evaluatePolicy(.deviceOwnerAuthentication,
                                                  localizedReason: message.isEmpty ? "confirm it's you" : message)
            bridge.post(type: "WINDOWS_HELLO_RESULT", payload: ["verified": ok, "reason": ok ? "Verified" : "Not verified"])
        } catch {
            bridge.post(type: "WINDOWS_HELLO_RESULT", payload: ["verified": false, "reason": error.localizedDescription])
        }
    }

    // MARK: Hardware profile (Windows: WindowsAccelerationService.Probe / PlajahAiNativeService)

    func accelerationProfile() -> [String: Any] {
        let gpus = MTLCopyAllDevices().map { d -> [String: Any] in
            ["name": d.name, "lowPower": d.isLowPower, "unifiedMemory": d.hasUnifiedMemory,
             "recommendedMaxWorkingSetBytes": d.recommendedMaxWorkingSetSize,
             "appleSilicon": d.supportsFamily(.apple7)]
        }
        let appleSilicon = MTLCreateSystemDefaultDevice()?.supportsFamily(.apple7) ?? false
        return [
            "platform": "macos", "host": "mac",
            "os": ProcessInfo.processInfo.operatingSystemVersionString,
            "cpuCores": ProcessInfo.processInfo.activeProcessorCount,
            "memoryBytes": ProcessInfo.processInfo.physicalMemory,
            "gpus": gpus,
            "appleSilicon": appleSilicon,
            "videoToolbox": true, "metal": true, "webgpu": true,
            "hardwareDecode": ["h264": true, "hevc": true, "prores": appleSilicon, "av1": false],
            "hardwareEncode": ["h264": true, "hevc": true, "prores": appleSilicon],
            "nvenc": false, "directml": false, "npu": appleSilicon ? "Apple Neural Engine" : NSNull(),
        ]
    }

    func aiProfile() -> [String: Any] {
        var p = accelerationProfile()
        p["localInference"] = false   // Core ML / MLX backends are on the Mac backlog
        return p
    }

    // MARK: Displays (Windows: StudioBridge.GetConnectedDisplays)

    func displays() -> [[String: Any]] {
        NSScreen.screens.enumerated().map { i, s in
            let scale = s.backingScaleFactor
            return [
                "index": i, "name": s.localizedName, "isPrimary": s == NSScreen.screens.first,
                "x": s.frame.origin.x, "y": s.frame.origin.y,
                "width": Int(s.frame.width * scale), "height": Int(s.frame.height * scale),
                "scale": scale, "refreshRate": s.maximumFramesPerSecond,
            ]
        }
    }

    // MARK: Dock progress (Windows: taskbar progress for Fabula exports)

    private var progressView: NSProgressIndicator?

    func setDockProgress(_ progress: Double, state: String) {
        let tile = NSApp.dockTile
        if state == "none" || state == "complete" || progress >= 1 {
            tile.contentView = nil
            tile.badgeLabel = state == "error" ? "!" : nil
            tile.display()
            progressView = nil
            if state == "complete" || progress >= 1 { Notifier.show(title: "Export finished", body: "Your render is ready.") }
            return
        }
        if progressView == nil {
            let image = NSImageView(image: NSApp.applicationIconImage)
            let container = NSView(frame: NSRect(x: 0, y: 0, width: 128, height: 128))
            image.frame = container.bounds
            let bar = NSProgressIndicator(frame: NSRect(x: 12, y: 8, width: 104, height: 16))
            bar.style = .bar
            bar.isIndeterminate = false
            bar.minValue = 0
            bar.maxValue = 1
            container.addSubview(image)
            container.addSubview(bar)
            tile.contentView = container
            progressView = bar
        }
        progressView?.doubleValue = progress
        tile.badgeLabel = state == "error" ? "!" : (state == "paused" ? "❚❚" : nil)
        tile.display()
    }
}

// MARK: - Core Audio device list (Windows: WASAPI endpoints)

enum AudioDevices {
    static func list() -> [[String: Any]] {
        var addr = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyDevices,
                                              mScope: kAudioObjectPropertyScopeGlobal,
                                              mElement: kAudioObjectPropertyElementMain)
        var size: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size) == noErr else { return [] }
        var ids = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
        guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size, &ids) == noErr else { return [] }
        let defaultIn = defaultDevice(kAudioHardwarePropertyDefaultInputDevice)
        let defaultOut = defaultDevice(kAudioHardwarePropertyDefaultOutputDevice)
        return ids.flatMap { id -> [[String: Any]] in
            let name = string(id, kAudioObjectPropertyName) ?? "Audio device"
            let uid = string(id, kAudioDevicePropertyDeviceUID) ?? "\(id)"
            var out: [[String: Any]] = []
            let inCh = channels(id, kAudioDevicePropertyScopeInput)
            let outCh = channels(id, kAudioDevicePropertyScopeOutput)
            if inCh > 0 { out.append(["id": uid, "name": name, "kind": "input", "channels": inCh, "isDefault": id == defaultIn, "driverType": "COREAUDIO"]) }
            if outCh > 0 { out.append(["id": uid, "name": name, "kind": "output", "channels": outCh, "isDefault": id == defaultOut, "driverType": "COREAUDIO"]) }
            return out
        }
    }

    private static func defaultDevice(_ selector: AudioObjectPropertySelector) -> AudioDeviceID {
        var addr = AudioObjectPropertyAddress(mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
        var id = AudioDeviceID(0)
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size, &id)
        return id
    }

    private static func string(_ id: AudioDeviceID, _ selector: AudioObjectPropertySelector) -> String? {
        var addr = AudioObjectPropertyAddress(mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
        var value: Unmanaged<CFString>?
        var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        guard AudioObjectGetPropertyData(id, &addr, 0, nil, &size, &value) == noErr, let v = value else { return nil }
        return v.takeRetainedValue() as String
    }

    private static func channels(_ id: AudioDeviceID, _ scope: AudioObjectPropertyScope) -> Int {
        var addr = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyStreamConfiguration, mScope: scope, mElement: kAudioObjectPropertyElementMain)
        var size: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(id, &addr, 0, nil, &size) == noErr, size > 0 else { return 0 }
        let raw = UnsafeMutableRawPointer.allocate(byteCount: Int(size), alignment: MemoryLayout<AudioBufferList>.alignment)
        defer { raw.deallocate() }
        guard AudioObjectGetPropertyData(id, &addr, 0, nil, &size, raw) == noErr else { return 0 }
        let list = UnsafeMutableAudioBufferListPointer(raw.assumingMemoryBound(to: AudioBufferList.self))
        return list.reduce(0) { $0 + Int($1.mNumberChannels) }
    }
}

// MARK: - Batch thumbnails (Windows: StudioBridge.ExtractBatchThumbnailsAsync)

enum Thumbnails {
    static func batch(_ paths: [String], size: Int) async -> [[String: Any]] {
        var out: [[String: Any]] = []
        for p in paths {
            let req = QLThumbnailGenerator.Request(fileAt: URL(fileURLWithPath: p), size: CGSize(width: size, height: size),
                                                   scale: 1, representationTypes: .thumbnail)
            if let rep = try? await QLThumbnailGenerator.shared.generateBestRepresentation(for: req),
               let jpeg = FileOps.jpeg(rep.cgImage, quality: 0.75) {
                out.append(["path": p, "success": true, "dataUrl": "data:image/jpeg;base64," + jpeg.base64EncodedString()])
            } else {
                out.append(["path": p, "success": false])
            }
        }
        return out
    }
}

// MARK: - Output windows (Ambo / Stage program + clean feed on another display)

@MainActor
final class OutputWindows {
    private unowned let bridge: NativeBridge
    private var windows: [String: NSWindow] = [:]
    private static let cleanFeedId = "__clean_feed__"

    init(bridge: NativeBridge) { self.bridge = bridge }

    func open(type: String, root: [String: Any]) {
        let isClean = type == "STUDIO_CLEAN_FEED_OPEN"
        let outputId = isClean ? Self.cleanFeedId : (root["outputId"] as? String ?? UUID().uuidString)
        let displayIndex = root["displayIndex"] as? Int ?? -1
        let feed = (root["feedUrl"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? (root["feedHtml"] as? String ?? "")
        let title = root["title"] as? String ?? (isClean ? "Ambo Audience Clean Feed" : "Ambo Output")

        close(outputId: outputId, notify: false)
        let screens = NSScreen.screens
        let screen = (displayIndex >= 0 && displayIndex < screens.count) ? screens[displayIndex] : (screens.last ?? NSScreen.main!)

        let config = WKWebViewConfiguration()
        config.mediaTypesRequiringUserActionForPlayback = []
        config.websiteDataStore = .default()   // share sign-in with the main window
        let web = WKWebView(frame: screen.frame, configuration: config)
        let w = NSWindow(contentRect: screen.frame, styleMask: [.borderless], backing: .buffered, defer: false, screen: screen)
        w.title = title
        w.level = screens.count > 1 ? .normal : .floating
        w.backgroundColor = .black
        w.isReleasedWhenClosed = false
        w.contentView = web
        w.setFrame(screen.frame, display: true)
        w.collectionBehavior = [.fullScreenPrimary, .canJoinAllSpaces]
        if feed.hasPrefix("http") || feed.hasPrefix("/") {
            if let url = URL(string: feed, relativeTo: PlajahConfig.appURL) { web.load(URLRequest(url: url)) }
        } else {
            web.loadHTMLString(feed, baseURL: PlajahConfig.appURL)
        }
        w.orderFrontRegardless()
        windows[outputId] = w
        if isClean {
            bridge.post(type: "STUDIO_CLEAN_FEED_STATUS", payload: ["active": true, "displayIndex": displayIndex,
                                                                   "width": root["width"] as? Int ?? 0, "height": root["height"] as? Int ?? 0])
        } else {
            bridge.post(type: "OUTPUT_WINDOW_STATUS", payload: ["outputId": outputId, "active": true, "displayIndex": displayIndex])
        }
    }

    func close(outputId: String, notify: Bool = true) {
        guard let w = windows.removeValue(forKey: outputId) else { return }
        w.close()
        if notify { bridge.post(type: "OUTPUT_WINDOW_STATUS", payload: ["outputId": outputId, "active": false]) }
    }

    func closeCleanFeed() {
        close(outputId: Self.cleanFeedId, notify: false)
        bridge.post(type: "STUDIO_CLEAN_FEED_STATUS", payload: ["active": false])
    }

    func closeAll() {
        windows.values.forEach { $0.close() }
        windows.removeAll()
        bridge.post(type: "OUTPUT_WINDOW_STATUS", payload: ["all": true, "active": false])
    }

    func list() {
        let ids = Array(windows.keys.filter { $0 != Self.cleanFeedId })
        bridge.post(type: "OUTPUT_WINDOWS_LIST", payload: ["outputs": ids, "count": ids.count, "compositorRunning": false])
    }
}

// MARK: - Notifications (Windows: ToastService)

enum Notifier {
    static func show(title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
    }
}
