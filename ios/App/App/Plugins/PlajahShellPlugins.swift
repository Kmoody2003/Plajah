import Foundation
import Capacitor

// Small plugins whose Android twins are mostly about Android-only surfaces. Each keeps the Android
// JS contract (names, arguments, result keys) so the web layer runs unchanged and simply sees
// "not available here" where iOS has no equivalent.

/// PlajahShell — Android can hand off to its native Compose shell. iOS has no second shell, so
/// isNativeEnabled() is always false and switchToNative() rejects, which hides the toggle.
@objc(PlajahShellPlugin)
public class PlajahShellPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PlajahShellPlugin"
    public let jsName = "PlajahShell"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "switchToNative", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isNativeEnabled", returnType: CAPPluginReturnPromise),
    ]

    @objc func switchToNative(_ call: CAPPluginCall) {
        call.unimplemented("The native shell is Android-only")
    }

    @objc func isNativeEnabled(_ call: CAPPluginCall) {
        call.resolve(["enabled": false])
    }
}

/// PlajahLaunch — why the app was opened (JS: services/launchService.ts).
/// iOS sources: a file handed to the app ("Open in Plajah" / share), or a plajah:// deep link.
/// Pull for the cold-start file (getLaunchMedia), push events for warm re-entry.
@objc(PlajahLaunchPlugin)
public class PlajahLaunchPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PlajahLaunchPlugin"
    public let jsName = "PlajahLaunch"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getLaunchMedia", returnType: CAPPluginReturnPromise),
    ]

    /// OPEN_MEDIA_FILE payload JSON, set by the scene delegate before/while the bridge loads.
    static var pendingMediaJson: String?
    private static weak var active: PlajahLaunchPlugin?

    override public func load() {
        PlajahLaunchPlugin.active = self
    }

    @objc func getLaunchMedia(_ call: CAPPluginCall) {
        var result: [String: Any] = [:]
        if let json = PlajahLaunchPlugin.pendingMediaJson { result["payload"] = json }
        call.resolve(result)
    }

    /// A file arrived (cold or warm). Builds the same payload shape the Android MainActivity sends.
    static func handleIncomingFile(_ url: URL) {
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        // Copy into the app's Inbox so the WebView can read it after the security scope ends.
        let inbox = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("LaunchInbox", isDirectory: true)
        try? FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
        let dest = inbox.appendingPathComponent(url.lastPathComponent)
        try? FileManager.default.removeItem(at: dest)
        do { try FileManager.default.copyItem(at: url, to: dest) } catch { return }
        let size = (try? dest.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        let mime = MimeTypes.forExtension(dest.pathExtension)
        let kind: String
        if mime.hasPrefix("image/") { kind = "IMAGE" }
        else if mime.hasPrefix("video/") { kind = "VIDEO" }
        else if mime.hasPrefix("audio/") { kind = "AUDIO" }
        else if mime == "application/zip" { kind = "ARCHIVE" }
        else if mime == "application/pdf" || mime.hasPrefix("text/") || mime == "application/json" { kind = "DOC" }
        else { return }
        // Android serves the file from its local server at a relative /_capacitor_file_ path. On iOS
        // the page is loaded from the network, so point at Capacitor's own scheme handler instead.
        let file: [String: Any] = [
            "name": dest.lastPathComponent,
            "fullPath": dest.path,
            "size": size,
            "url": "capacitor://localhost/_capacitor_file_" + dest.path,
            "mediaKind": kind,
        ]
        // Same shape as android/MainActivity.mediaPayloadFor and the Windows shell.
        let payload: [String: Any] = [
            "type": "OPEN_MEDIA_FILE",
            "mediaKind": kind,
            "activeFile": file,
            "folderFiles": [file],
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        pendingMediaJson = json
        active?.notifyListeners("launchMedia", data: ["payload": json], retainUntilConsumed: true)
    }

    static func handleExperience(_ slug: String) {
        active?.notifyListeners("launchExperience", data: ["experience": slug], retainUntilConsumed: true)
    }
}

/// PlajahDevice — boot autostart is an Android signage feature. iOS can't launch apps at boot;
/// the honest answer is "not granted, can't be requested" (Guided Access covers kiosk installs).
@objc(PlajahDevicePlugin)
public class PlajahDevicePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PlajahDevicePlugin"
    public let jsName = "PlajahDevice"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setAutostartOnBoot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAutostartOnBoot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "canAutostart", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAutostartPermission", returnType: CAPPluginReturnPromise),
    ]

    @objc func setAutostartOnBoot(_ call: CAPPluginCall) { call.resolve(["enabled": false]) }
    @objc func getAutostartOnBoot(_ call: CAPPluginCall) { call.resolve(["enabled": false]) }
    @objc func canAutostart(_ call: CAPPluginCall) { call.resolve(["granted": false]) }
    @objc func requestAutostartPermission(_ call: CAPPluginCall) {
        call.resolve(["opened": false, "granted": false])
    }
}

/// WatchNext — Android TV home-screen row. Not an iPhone/iPad surface; isSupported() = false makes
/// the web side skip the sync (same as it does on Fire TV).
@objc(WatchNextPlugin)
public class WatchNextPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WatchNextPlugin"
    public let jsName = "WatchNext"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "upsert", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
    ]

    @objc func isSupported(_ call: CAPPluginCall) { call.resolve(["supported": false]) }
    @objc func upsert(_ call: CAPPluginCall) { call.resolve() }
    @objc func remove(_ call: CAPPluginCall) { call.resolve() }
}

enum MimeTypes {
    static func forExtension(_ ext: String) -> String {
        switch ext.lowercased() {
        case "mp4", "m4v": return "video/mp4"
        case "mov": return "video/quicktime"
        case "webm": return "video/webm"
        case "mp3": return "audio/mpeg"
        case "wav": return "audio/wav"
        case "m4a": return "audio/mp4"
        case "aac": return "audio/aac"
        case "flac": return "audio/flac"
        case "ogg": return "audio/ogg"
        case "aif", "aiff": return "audio/aiff"
        case "jpg", "jpeg": return "image/jpeg"
        case "png": return "image/png"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        case "heic", "heif": return "image/heic"
        case "pdf": return "application/pdf"
        case "epub": return "application/epub+zip"
        case "json": return "application/json"
        case "txt", "md": return "text/plain"
        case "zip": return "application/zip"
        default: return "application/octet-stream"
        }
    }
}
