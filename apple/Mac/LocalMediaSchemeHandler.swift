import Foundation
import WebKit
import QuickLookThumbnailing
import ImageIO

/// plajah-media://localmedia/<name>?path=<abs> — the Mac version of the Windows shell's
/// https://localmedia.plajah virtual host (WebResourceRequested handler). BridgeScript rewrites the
/// Windows URLs to this scheme, so every caller keeps using the Windows URL format.
///
///   /<name>?path=…            the file, with HTTP Range support so <video> can seek
///   /__thumb?path=…&size=N    a JPEG thumbnail (QuickLook: images, video, PDF, documents)
///   /__playable?path=…        { state: 'ready', url } — AVFoundation plays what macOS can decode
final class LocalMediaSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "plajah-media"
    private let server = LocalMediaServer()

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) { server.start(task) }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) { server.stop(task) }
}

/// The serving work, kept off the WebKit-isolated handler so it can run on background queues.
/// Every call into the WKURLSchemeTask happens on the main queue, in order.
final class LocalMediaServer: @unchecked Sendable {
    private var stopped = Set<ObjectIdentifier>()
    private let lock = NSLock()

    func start(_ task: WKURLSchemeTask) {
        guard let url = task.request.url,
              let comps = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            fail(task, 400); return
        }
        let query = Dictionary(uniqueKeysWithValues: (comps.queryItems ?? []).map { ($0.name, $0.value ?? "") })
        let path = query["path"] ?? ""
        switch comps.path {
        case "/__thumb":
            thumbnail(task, path: path, size: Int(query["size"] ?? "") ?? 320)
        case "/__playable":
            let ok = FileManager.default.fileExists(atPath: path)
            let body: [String: Any] = ok
                ? ["state": "ready", "url": FileOps.localMediaURL(name: (path as NSString).lastPathComponent, path: path), "mode": "native"]
                : ["state": "failed", "error": "File not found"]
            respond(task, status: 200, headers: ["Content-Type": "application/json"], body: Data(JSON.string(body).utf8))
        case "/__live":
            fail(task, 404)   // NDI/DeckLink live previews are Windows-only for now
        default:
            serveFile(task, path: path)
        }
    }

    func stop(_ task: WKURLSchemeTask) {
        lock.lock(); stopped.insert(ObjectIdentifier(task)); lock.unlock()
    }

    /// FIFO on the main queue (chunks must arrive in order), asserted as main-actor work.
    private func onMain(_ work: @escaping @MainActor () -> Void) {
        DispatchQueue.main.async { MainActor.assumeIsolated { work() } }
    }

    private func isStopped(_ task: WKURLSchemeTask) -> Bool {
        lock.lock(); defer { lock.unlock() }
        return stopped.contains(ObjectIdentifier(task))
    }

    private func serveFile(_ task: WKURLSchemeTask, path: String) {
        DispatchQueue.global(qos: .userInitiated).async {
            guard !path.isEmpty, let handle = FileHandle(forReadingAtPath: path) else { self.fail(task, 404); return }
            defer { try? handle.close() }
            let size = Int64(FileOps.attrs(URL(fileURLWithPath: path)).size)
            let mime = Self.mime(for: path)
            var start: Int64 = 0
            var end: Int64 = max(0, size - 1)
            var status = 200
            if let range = task.request.value(forHTTPHeaderField: "Range"), range.hasPrefix("bytes=") {
                let parts = range.dropFirst(6).split(separator: "-", omittingEmptySubsequences: false)
                if parts.count == 2 {
                    if let s = Int64(parts[0]) { start = s; if let e = Int64(parts[1]) { end = min(e, size - 1) } }
                    else if let suffix = Int64(parts[1]) { start = max(0, size - suffix) }
                    status = 206
                }
            }
            guard start <= end || size == 0 else { self.fail(task, 416); return }
            let length = size == 0 ? 0 : end - start + 1
            var headers = ["Content-Type": mime, "Content-Length": String(length), "Accept-Ranges": "bytes",
                           "Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*"]
            if status == 206 { headers["Content-Range"] = "bytes \(start)-\(end)/\(size)" }
            guard let response = HTTPURLResponse(url: task.request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers) else { return }
            self.onMain {
                guard !self.isStopped(task) else { return }
                task.didReceive(response)
            }
            // Stream in 1 MB chunks so a multi-GB video never sits in memory.
            do { try handle.seek(toOffset: UInt64(start)) } catch { self.fail(task, 500); return }
            var remaining = length
            while remaining > 0 {
                if self.isStopped(task) { return }
                let chunk = handle.readData(ofLength: Int(min(remaining, 1 << 20)))
                if chunk.isEmpty { break }
                remaining -= Int64(chunk.count)
                self.onMain { if !self.isStopped(task) { task.didReceive(chunk) } }
            }
            self.onMain { if !self.isStopped(task) { task.didFinish() } }
        }
    }

    private func thumbnail(_ task: WKURLSchemeTask, path: String, size: Int) {
        guard FileManager.default.fileExists(atPath: path) else { fail(task, 404); return }
        let req = QLThumbnailGenerator.Request(fileAt: URL(fileURLWithPath: path),
                                               size: CGSize(width: size, height: size), scale: 1,
                                               representationTypes: .thumbnail)
        QLThumbnailGenerator.shared.generateBestRepresentation(for: req) { rep, _ in
            guard let cg = rep?.cgImage else { self.fail(task, 404); return }
            guard let jpeg = FileOps.jpeg(cg, quality: 0.8) else { self.fail(task, 500); return }
            self.respond(task, status: 200, headers: ["Content-Type": "image/jpeg", "Cache-Control": "max-age=300"], body: jpeg)
        }
    }

    private func respond(_ task: WKURLSchemeTask, status: Int, headers: [String: String], body: Data) {
        var h = headers
        h["Content-Length"] = String(body.count)
        h["Access-Control-Allow-Origin"] = "*"
        let resp = HTTPURLResponse(url: task.request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: h)!
        onMain {
            guard !self.isStopped(task) else { return }
            task.didReceive(resp)
            task.didReceive(body)
            task.didFinish()
        }
    }

    private func fail(_ task: WKURLSchemeTask, _ status: Int) {
        respond(task, status: status, headers: ["Content-Type": "text/plain"], body: Data())
    }

    static func mime(for path: String) -> String {
        switch (path as NSString).pathExtension.lowercased() {
        case "mp4", "m4v": return "video/mp4"
        case "mov": return "video/quicktime"
        case "webm": return "video/webm"
        case "mkv": return "video/x-matroska"
        case "mpg", "mpeg": return "video/mpeg"
        case "mp3": return "audio/mpeg"
        case "wav": return "audio/wav"
        case "m4a": return "audio/mp4"
        case "aac": return "audio/aac"
        case "flac": return "audio/flac"
        case "ogg": return "audio/ogg"
        case "opus": return "audio/opus"
        case "aif", "aiff": return "audio/aiff"
        case "jpg", "jpeg": return "image/jpeg"
        case "png": return "image/png"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        case "svg": return "image/svg+xml"
        case "avif": return "image/avif"
        case "heic", "heif": return "image/heic"
        case "tif", "tiff": return "image/tiff"
        case "pdf": return "application/pdf"
        case "json": return "application/json; charset=utf-8"
        case "txt", "md", "log": return "text/plain; charset=utf-8"
        case "html", "htm": return "text/html; charset=utf-8"
        case "zip": return "application/zip"
        default: return "application/octet-stream"
        }
    }
}
