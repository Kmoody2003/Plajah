import AppKit
import Security
import UniformTypeIdentifiers
import ImageIO

/// Files, pickers, secrets and sync state — the Mac side of MainWindow.Files.cs +
/// WindowsFileExplorerService + WindowsStorageConnectorService secrets + WindowsSyncEngine storage.
/// Reply shapes copy the Windows ones field for field.
@MainActor
final class FilesBridge {
    private unowned let bridge: NativeBridge
    init(bridge: NativeBridge) { self.bridge = bridge }

    // MARK: Unified FILES_ / CONNECTOR_ / SYNC_ (request/response with requestId)

    func handleUnified(type: String, root: [String: Any]) async {
        let reqId = root["requestId"] as? String
        let reply = type + "_RESULT"
        func send(_ payload: [String: Any]) { bridge.post(type: reply, payload: payload, requestId: reqId) }
        func str(_ k: String, _ d: String = "") -> String { root[k] as? String ?? d }
        func strs(_ k: String) -> [String] { root[k] as? [String] ?? [] }

        switch type {
        case "FILES_GET_ROOTS":
            send(["success": true, "roots": FileOps.storageRoots()])
        case "FILES_LIST_DIR":
            let limit = min(max(root["limit"] as? Int ?? 2000, 1), 20000)
            let path = str("path"), query = str("query")
            let hidden = root["includeHidden"] as? Bool ?? false
            let recursive = root["recursive"] as? Bool ?? false
            send(await Task.detached { FileOps.list(path: path, includeHidden: hidden, recursive: recursive, query: query, limit: limit) }.value)
        case "FILES_GET_RECENT":
            send(FileOps.recent(limit: min(max(root["limit"] as? Int ?? 150, 1), 500)))
        case "FILES_CREATE_FOLDER":
            send(FileOps.createFolder(parent: str("parentPath"), name: str("name")))
        case "FILES_RENAME":
            send(FileOps.rename(path: str("path"), newName: str("newName")))
        case "FILES_COPY":
            let paths = strs("paths"), target = str("targetDir")
            send(await Task.detached { FileOps.copy(paths, to: target, move: false) }.value)
        case "FILES_MOVE":
            let paths = strs("paths"), target = str("targetDir")
            send(await Task.detached { FileOps.copy(paths, to: target, move: true) }.value)
        case "FILES_DELETE_BATCH":
            send(await FileOps.delete(strs("paths"), toTrash: root["recycle"] as? Bool ?? true))
        case "FILES_ZIP":
            send(await FileOps.zip(strs("paths"), to: str("targetZipPath")))
        case "FILES_UNZIP":
            send(await FileOps.unzip(str("zipPath"), to: str("targetDir")))
        case "FILES_LIST_ZIP":
            send(await FileOps.listZip(str("path")))
        case "FILES_OPEN_EXTERNAL":
            let ok = NSWorkspace.shared.open(URL(fileURLWithPath: str("path")))
            send(ok ? ["success": true] : ["success": false, "error": "No app can open this file"])
        case "FILES_READ_TEXT":
            send(FileOps.readText(path: str("path"), maxBytes: min(max(root["maxBytes"] as? Int ?? 262_144, 1024), 4 * 1024 * 1024)))
        case "FILES_DOWNLOAD_TO_LOCAL":
            send(await FileOps.download(url: str("url"), to: str("targetPath"), headers: root["headers"] as? [String: String]))
        case "FILES_UPLOAD_SIGNED":
            send(await FileOps.uploadSigned(localPath: str("localPath"), url: str("url"), headers: root["headers"] as? [String: String]))
        case "FILES_READ_FILEZILLA_DEFAULT":
            let fz = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".config/filezilla/sitemanager.xml")
            if let xml = try? String(contentsOf: fz, encoding: .utf8) { send(["success": true, "xml": xml, "path": fz.path]) }
            else { send(["success": false, "error": "FileZilla site manager not found"]) }

        case "CONNECTOR_SAVE_SECRET":
            Keychain.save(id: str("id"), user: str("user"), secret: str("secret"))
            send(["success": true])
        case "CONNECTOR_GET_SECRET":
            send(["success": true, "secret": Keychain.get(id: str("id")).map { $0 as Any } ?? NSNull()])
        case "CONNECTOR_DELETE_SECRET":
            Keychain.delete(id: str("id"))
            send(["success": true])
        case "CONNECTOR_OP":
            // FTP/SFTP/WebDAV/S3 transfers run in the Windows connector service; not ported yet.
            send(["success": false, "error": "Remote connectors are not on Mac yet"])

        case "SYNC_GET_STATE":
            send(["success": true, "pairs": SyncStore.pairs(), "recentChanges": [Any]()])
        case "SYNC_SAVE_PAIR":
            guard let pair = root["pair"] as? [String: Any] else { send(["success": false, "error": "Missing pair"]); return }
            send(["success": true, "pairs": SyncStore.save(pair: pair)])
        case "SYNC_REMOVE_PAIR":
            send(["success": true, "pairs": SyncStore.remove(pairId: str("pairId"))])
        case "SYNC_SCAN_LOCAL":
            let path = str("localPath")
            send(await Task.detached { FileOps.scanForSync(path) }.value)
        case "SYNC_GET_BASELINE":
            send(["success": true, "baseline": SyncStore.baseline(pairId: str("pairId"))])
        case "SYNC_SAVE_BASELINE":
            SyncStore.saveBaseline(pairId: str("pairId"), baseline: root["baseline"] as? [String: Any] ?? [:],
                                   status: root["status"] as? String, lastSyncAt: root["lastSyncAt"] as? Double,
                                   lastError: root["lastError"] as? String)
            send(["success": true])
        default:
            send(["success": false, "error": "Unknown file operation \(type)"])
        }
    }

    // MARK: Single-shot messages

    func pickFile() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.begin { [weak self] resp in
            guard let self = self else { return }
            guard resp == .OK, let url = panel.url else { self.bridge.post(type: "PICK_FILE_RESULT", payload: ["cancelled": true]); return }
            let attrs = FileOps.attrs(url)
            self.bridge.post(type: "PICK_FILE_RESULT", payload: [
                "cancelled": false, "name": url.lastPathComponent, "fullPath": url.path,
                "folderPath": url.deletingLastPathComponent().path,
                "size": attrs.size, "lastModified": attrs.modifiedMs,
                "url": FileOps.localMediaURL(name: url.lastPathComponent, path: url.path),
            ])
        }
    }

    func pickFolder() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.begin { [weak self] resp in
            guard let self = self else { return }
            guard resp == .OK, let url = panel.url else { self.bridge.post(type: "PICK_FOLDER_RESULT", payload: ["cancelled": true]); return }
            Task.detached {
                let files = FileOps.scanMedia(folder: url)
                await MainActor.run {
                    self.bridge.post(type: "PICK_FOLDER_RESULT", payload: [
                        "cancelled": false, "folderPath": url.path, "folderName": url.lastPathComponent, "files": files,
                    ])
                }
            }
        }
    }

    func readFileBytes(path: String?) {
        Task.detached { [bridge] in
            var result: [String: Any]
            if let path = path, FileManager.default.fileExists(atPath: path) {
                let size = FileOps.attrs(URL(fileURLWithPath: path)).size
                if size > 64 * 1024 * 1024 {
                    result = ["success": false, "path": path, "error": "File too large to read into memory (>64 MB); stream it via its localmedia URL"]
                } else if let data = FileManager.default.contents(atPath: path) {
                    result = ["success": true, "path": path, "base64": data.base64EncodedString()]
                } else {
                    result = ["success": false, "path": path, "error": "Could not read file"]
                }
            } else {
                result = ["success": false, "path": path ?? "", "error": "File not found"]
            }
            await MainActor.run { bridge.post(type: "READ_FILE_BYTES_RESULT", payload: result) }
        }
    }

    func saveImageFile(_ root: [String: Any]) {
        guard let path = root["filePath"] as? String, var b64 = root["base64Data"] as? String, !path.isEmpty else {
            bridge.post(type: "SAVE_IMAGE_FILE_RESULT", payload: ["success": false, "error": "Invalid arguments"]); return
        }
        if let comma = b64.firstIndex(of: ",") { b64 = String(b64[b64.index(after: comma)...]) }
        let overwrite = root["overwrite"] as? Bool ?? false
        var target = URL(fileURLWithPath: path)
        if !overwrite { target = FileOps.uniqueURL(target, style: .underscore) }
        do {
            guard let data = Data(base64Encoded: b64) else { throw CocoaError(.fileReadCorruptFile) }
            try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: target)
            let a = FileOps.attrs(target)
            bridge.post(type: "SAVE_IMAGE_FILE_RESULT", payload: [
                "success": true, "originalPath": path, "savedPath": target.path, "fileName": target.lastPathComponent,
                "size": a.size, "lastModified": a.modifiedMs,
                "url": FileOps.localMediaURL(name: target.lastPathComponent, path: target.path),
            ])
        } catch {
            bridge.post(type: "SAVE_IMAGE_FILE_RESULT", payload: ["success": false, "filePath": path, "error": error.localizedDescription])
        }
    }

    func deleteFile(path: String?) {
        guard let path = path, FileManager.default.fileExists(atPath: path) else {
            bridge.post(type: "DELETE_FILE_RESULT", payload: ["success": false, "filePath": path ?? "", "error": "File not found"]); return
        }
        // Windows hard-deletes here; the Mac moves to the Trash so it can be undone from Finder.
        Task {
            let r = await FileOps.delete([path], toTrash: true)
            bridge.post(type: "DELETE_FILE_RESULT", payload: (r["success"] as? Bool == true)
                ? ["success": true, "filePath": path]
                : ["success": false, "filePath": path, "error": r["error"] ?? "Could not delete"])
        }
    }

    func revealInFinder(path: String?) {
        guard let path = path, !path.isEmpty else { return }
        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: path, isDirectory: &isDir) else {
            bridge.post(type: "SHOW_IN_EXPLORER_RESULT", payload: ["success": false, "filePath": path, "error": "Item not found"]); return
        }
        if isDir.boolValue { NSWorkspace.shared.open(URL(fileURLWithPath: path)) }
        else { NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)]) }
        bridge.post(type: "SHOW_IN_EXPLORER_RESULT", payload: ["success": true, "filePath": path])
    }

    func setWallpaper(path: String?) {
        guard let path = path, FileManager.default.fileExists(atPath: path) else {
            bridge.post(type: "SET_AS_WALLPAPER_RESULT", payload: ["success": false, "filePath": path ?? "", "error": "File not found"]); return
        }
        do {
            for screen in NSScreen.screens {
                try NSWorkspace.shared.setDesktopImageURL(URL(fileURLWithPath: path), for: screen, options: [:])
            }
            bridge.post(type: "SET_AS_WALLPAPER_RESULT", payload: ["success": true, "filePath": path])
        } catch {
            bridge.post(type: "SET_AS_WALLPAPER_RESULT", payload: ["success": false, "filePath": path, "error": error.localizedDescription])
        }
    }
}

// MARK: - File operations (pure, thread-safe)

enum FileOps {
    static let mediaExtensions: Set<String> = [
        "mp4", "mov", "m4v", "webm", "mkv", "avi", "mpg", "mpeg",
        "mp3", "wav", "m4a", "aac", "flac", "ogg", "aiff", "aif",
        "jpg", "jpeg", "png", "gif", "webp", "avif", "heic", "tif", "tiff", "svg",
    ]

    /// https://localmedia.plajah/<name>?path=<abs> — identical to Windows; the bridge script maps it.
    static func localMediaURL(name: String, path: String) -> String {
        "https://localmedia.plajah/\(enc(name))?path=\(enc(path))"
    }

    static func thumbURL(path: String, size: Int = 320) -> String {
        "https://localmedia.plajah/__thumb?path=\(enc(path))&size=\(size)"
    }

    static func enc(_ s: String) -> String {
        s.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-._~"))) ?? s
    }

    struct Attrs { var size: Int64; var modifiedMs: Int64; var createdMs: Int64; var isDir: Bool; var isHidden: Bool; var readOnly: Bool }

    static func attrs(_ url: URL) -> Attrs {
        let v = try? url.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey, .creationDateKey,
                                                  .isDirectoryKey, .isHiddenKey, .isWritableKey])
        return Attrs(size: Int64(v?.fileSize ?? 0),
                     modifiedMs: Int64((v?.contentModificationDate ?? Date()).timeIntervalSince1970 * 1000),
                     createdMs: Int64((v?.creationDate ?? Date()).timeIntervalSince1970 * 1000),
                     isDir: v?.isDirectory ?? false, isHidden: v?.isHidden ?? false,
                     readOnly: !(v?.isWritable ?? true))
    }

    static func mediaKind(for url: URL) -> String {
        guard let t = UTType(filenameExtension: url.pathExtension) else { return "DOC" }
        if t.conforms(to: .image) { return "IMAGE" }
        if t.conforms(to: .movie) || t.conforms(to: .video) { return "VIDEO" }
        if t.conforms(to: .audio) { return "AUDIO" }
        if t.conforms(to: .archive) || t.conforms(to: .zip) { return "ARCHIVE" }
        return "DOC"
    }

    static func mediaEntry(for url: URL) -> [String: Any] {
        let a = attrs(url)
        return ["name": url.lastPathComponent, "fullPath": url.path, "size": a.size, "lastModified": a.modifiedMs,
                "url": localMediaURL(name: url.lastPathComponent, path: url.path), "mediaKind": mediaKind(for: url)]
    }

    enum UniqueStyle { case finder, underscore }

    /// "name 2.ext" (Finder style) or "name_1.ext" (Windows SAVE_IMAGE_FILE style).
    static func uniqueURL(_ url: URL, style: UniqueStyle = .finder) -> URL {
        let fm = FileManager.default
        guard fm.fileExists(atPath: url.path) else { return url }
        let dir = url.deletingLastPathComponent()
        let base = url.deletingPathExtension().lastPathComponent
        let ext = url.pathExtension
        var n = style == .finder ? 2 : 1
        while true {
            let name = style == .finder ? "\(base) \(n)" : "\(base)_\(n)"
            let candidate = dir.appendingPathComponent(ext.isEmpty ? name : "\(name).\(ext)")
            if !fm.fileExists(atPath: candidate.path) { return candidate }
            n += 1
        }
    }

    static func storageRoots() -> [[String: Any]] {
        let fm = FileManager.default
        var roots: [[String: Any]] = []
        func known(_ id: String, _ label: String, _ dir: FileManager.SearchPathDirectory) {
            guard let url = fm.urls(for: dir, in: .userDomainMask).first, fm.fileExists(atPath: url.path) else { return }
            roots.append(["id": id, "label": label, "kind": "local", "path": url.path, "writable": true, "badge": "Folder"])
        }
        known("mac:downloads", "Downloads", .downloadsDirectory)
        known("mac:desktop", "Desktop", .desktopDirectory)
        known("mac:documents", "Documents", .documentDirectory)
        known("mac:pictures", "Pictures", .picturesDirectory)
        known("mac:music", "Music", .musicDirectory)
        known("mac:movies", "Movies", .moviesDirectory)
        roots.append(["id": "mac:home", "label": "Home", "kind": "local", "path": fm.homeDirectoryForCurrentUser.path, "writable": true, "badge": "Folder"])
        let keys: [URLResourceKey] = [.volumeNameKey, .volumeTotalCapacityKey, .volumeAvailableCapacityKey, .volumeIsRemovableKey, .volumeIsInternalKey]
        for vol in fm.mountedVolumeURLs(includingResourceValuesForKeys: keys, options: [.skipHiddenVolumes]) ?? [] {
            guard let v = try? vol.resourceValues(forKeys: Set(keys)) else { continue }
            roots.append([
                "id": "volume:\(vol.path)", "label": v.volumeName ?? vol.lastPathComponent, "kind": "local",
                "path": vol.path, "totalBytes": v.volumeTotalCapacity ?? 0, "freeBytes": v.volumeAvailableCapacity ?? 0,
                "writable": true, "badge": (v.volumeIsRemovable ?? false) ? "Removable" : ((v.volumeIsInternal ?? true) ? "Fixed" : "Network"),
            ])
        }
        return roots
    }

    static func list(path: String, includeHidden: Bool, recursive: Bool, query: String, limit: Int) -> [String: Any] {
        let fm = FileManager.default
        let dir = path.isEmpty ? fm.homeDirectoryForCurrentUser : URL(fileURLWithPath: path)
        var isDir: ObjCBool = false
        guard fm.fileExists(atPath: dir.path, isDirectory: &isDir), isDir.boolValue else {
            return ["success": false, "path": dir.path, "error": "Directory does not exist: \(dir.path)"]
        }
        let keys: [URLResourceKey] = [.fileSizeKey, .contentModificationDateKey, .creationDateKey, .isDirectoryKey, .isHiddenKey, .isWritableKey]
        var opts: FileManager.DirectoryEnumerationOptions = []
        if !includeHidden { opts.insert(.skipsHiddenFiles) }
        if !recursive { opts.insert(.skipsSubdirectoryDescendants) }
        var entries: [[String: Any]] = []
        let e = fm.enumerator(at: dir, includingPropertiesForKeys: keys, options: opts, errorHandler: { _, _ in true })
        while let url = e?.nextObject() as? URL {
            if entries.count >= limit { break }
            let name = url.lastPathComponent
            if !query.isEmpty && name.range(of: query, options: .caseInsensitive) == nil { continue }
            let a = attrs(url)
            entries.append([
                "name": name, "fullPath": url.path, "isDirectory": a.isDir, "size": a.size,
                "lastModified": a.modifiedMs, "createdAt": a.createdMs,
                "extension": a.isDir ? "" : (url.pathExtension.isEmpty ? "" : "." + url.pathExtension),
                "isHidden": a.isHidden, "isReadOnly": a.readOnly,
                "url": a.isDir ? NSNull() : localMediaURL(name: name, path: url.path),
                "thumbUrl": a.isDir ? NSNull() : thumbURL(path: url.path),
            ])
        }
        return ["success": true, "path": dir.path, "entries": entries]
    }

    /// Recent documents (Windows: Recent Items). Uses the system's recent-document list.
    @MainActor
    static func recent(limit: Int) -> [String: Any] {
        let urls = NSDocumentController.shared.recentDocumentURLs.prefix(limit)
        let items: [[String: Any]] = urls.compactMap { url in
            guard FileManager.default.fileExists(atPath: url.path) else { return nil }
            let a = attrs(url)
            return ["name": url.lastPathComponent, "fullPath": url.path, "isDirectory": a.isDir, "size": a.size,
                    "lastModified": a.modifiedMs, "url": localMediaURL(name: url.lastPathComponent, path: url.path)]
        }
        return ["success": true, "items": items, "entries": items]
    }

    /// JPEG via ImageIO (thread-safe; no AppKit image classes off the main thread).
    static func jpeg(_ image: CGImage, quality: Double) -> Data? {
        let data = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(dest, image, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
        return CGImageDestinationFinalize(dest) ? data as Data : nil
    }

    static func createFolder(parent: String, name: String) -> [String: Any] {
        let safe = (name.trimmingCharacters(in: .whitespaces) as NSString).lastPathComponent
        guard !safe.isEmpty else { return ["success": false, "error": "Invalid folder name"] }
        let full = URL(fileURLWithPath: parent).appendingPathComponent(safe)
        do { try FileManager.default.createDirectory(at: full, withIntermediateDirectories: true); return ["success": true, "path": full.path] }
        catch { return ["success": false, "error": error.localizedDescription] }
    }

    static func rename(path: String, newName: String) -> [String: Any] {
        let safe = (newName.trimmingCharacters(in: .whitespaces) as NSString).lastPathComponent
        guard !safe.isEmpty else { return ["success": false, "error": "Invalid name" ] }
        let src = URL(fileURLWithPath: path)
        guard FileManager.default.fileExists(atPath: path) else { return ["success": false, "error": "Item not found"] }
        let dest = src.deletingLastPathComponent().appendingPathComponent(safe)
        do { try FileManager.default.moveItem(at: src, to: dest); return ["success": true, "newPath": dest.path] }
        catch { return ["success": false, "error": error.localizedDescription] }
    }

    static func copy(_ paths: [String], to targetDir: String, move: Bool) -> [String: Any] {
        let fm = FileManager.default
        var count = 0
        do {
            for p in paths {
                let src = URL(fileURLWithPath: p)
                let dest = uniqueURL(URL(fileURLWithPath: targetDir).appendingPathComponent(src.lastPathComponent))
                if move { try fm.moveItem(at: src, to: dest) } else { try fm.copyItem(at: src, to: dest) }
                count += 1
            }
            return move ? ["success": true, "moved": count] : ["success": true, "copied": count]
        } catch { return ["success": false, "error": error.localizedDescription] }
    }

    @MainActor
    static func delete(_ paths: [String], toTrash: Bool) async -> [String: Any] {
        let urls = paths.map { URL(fileURLWithPath: $0) }
        if toTrash {
            return await withCheckedContinuation { cont in
                NSWorkspace.shared.recycle(urls) { done, error in
                    cont.resume(returning: error == nil ? ["success": true, "deleted": done.count]
                                                        : ["success": false, "error": error!.localizedDescription])
                }
            }
        }
        do { for u in urls { try FileManager.default.removeItem(at: u) }; return ["success": true, "deleted": urls.count] }
        catch { return ["success": false, "error": error.localizedDescription] }
    }

    /// zip/unzip via /usr/bin/ditto (ships with macOS, keeps resource forks and metadata).
    static func zip(_ paths: [String], to target: String) async -> [String: Any] {
        guard !paths.isEmpty else { return ["success": false, "error": "Nothing to zip"] }
        if paths.count == 1 {
            let r = await run("/usr/bin/ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", paths[0], target])
            return r == 0 ? ["success": true, "zipPath": target] : ["success": false, "error": "ditto exited \(r)"]
        }
        // Several items: stage them in a temp folder so the archive has one level.
        let stage = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: stage) }
        do {
            try FileManager.default.createDirectory(at: stage, withIntermediateDirectories: true)
            for p in paths { try FileManager.default.copyItem(at: URL(fileURLWithPath: p), to: stage.appendingPathComponent((p as NSString).lastPathComponent)) }
        } catch { return ["success": false, "error": error.localizedDescription] }
        let r = await run("/usr/bin/ditto", ["-c", "-k", "--sequesterRsrc", stage.path, target])
        return r == 0 ? ["success": true, "zipPath": target] : ["success": false, "error": "ditto exited \(r)"]
    }

    static func unzip(_ zip: String, to target: String) async -> [String: Any] {
        let r = await run("/usr/bin/ditto", ["-x", "-k", zip, target])
        let count = (try? FileManager.default.contentsOfDirectory(atPath: target).count) ?? 0
        return r == 0 ? ["success": true, "targetDir": target, "count": count] : ["success": false, "error": "ditto exited \(r)"]
    }

    static func listZip(_ path: String) async -> [String: Any] {
        let (code, out) = await runCapture("/usr/bin/zipinfo", ["-1", path])
        guard code == 0 else { return ["success": false, "error": "Could not read archive"] }
        let list: [[String: Any]] = out.split(separator: "\n").map { line in
            let name = String(line)
            return ["name": (name as NSString).lastPathComponent, "fullName": name, "isDirectory": name.hasSuffix("/")]
        }
        return ["success": true, "entries": list]
    }

    static func readText(path: String, maxBytes: Int) -> [String: Any] {
        guard let h = FileHandle(forReadingAtPath: path) else { return ["success": false, "error": "File not found"] }
        defer { try? h.close() }
        let size = attrs(URL(fileURLWithPath: path)).size
        let data = h.readData(ofLength: maxBytes)
        let text = String(decoding: data, as: UTF8.self)
        return ["success": true, "text": text, "truncated": size > maxBytes, "size": size]
    }

    static func download(url: String, to target: String, headers: [String: String]?) async -> [String: Any] {
        guard let u = URL(string: url) else { return ["success": false, "error": "Bad URL"] }
        var req = URLRequest(url: u)
        headers?.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        do {
            let (tmp, resp) = try await URLSession.shared.download(for: req)
            if let http = resp as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                return ["success": false, "error": "HTTP \(http.statusCode)"]
            }
            let dest = URL(fileURLWithPath: target)
            try FileManager.default.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
            try? FileManager.default.removeItem(at: dest)
            try FileManager.default.moveItem(at: tmp, to: dest)
            return ["success": true, "path": dest.path, "size": attrs(dest).size]
        } catch { return ["success": false, "error": error.localizedDescription] }
    }

    static func uploadSigned(localPath: String, url: String, headers: [String: String]?) async -> [String: Any] {
        guard FileManager.default.fileExists(atPath: localPath) else { return ["success": false, "error": "Local file not found"] }
        guard let u = URL(string: url) else { return ["success": false, "error": "Bad URL"] }
        var req = URLRequest(url: u)
        req.httpMethod = "PUT"
        headers?.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        do {
            let (_, resp) = try await URLSession.shared.upload(for: req, fromFile: URL(fileURLWithPath: localPath))
            let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
            return (200..<300).contains(status) ? ["success": true, "status": status] : ["success": false, "status": status, "error": "HTTP \(status)"]
        } catch { return ["success": false, "error": error.localizedDescription] }
    }

    static func scanMedia(folder: URL, max: Int = 20000) -> [[String: Any]] {
        var out: [[String: Any]] = []
        let e = FileManager.default.enumerator(at: folder, includingPropertiesForKeys: [.fileSizeKey, .contentModificationDateKey],
                                               options: [.skipsHiddenFiles], errorHandler: { _, _ in true })
        while let url = e?.nextObject() as? URL, out.count < max {
            guard mediaExtensions.contains(url.pathExtension.lowercased()) else { continue }
            let rel = String(url.path.dropFirst(folder.path.count)).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            let a = attrs(url)
            out.append(["name": url.lastPathComponent, "relativePath": rel, "fullPath": url.path, "size": a.size,
                        "lastModified": a.modifiedMs,
                        "url": "https://localmedia.plajah/\(rel.split(separator: "/").map { enc(String($0)) }.joined(separator: "/"))?path=\(enc(url.path))"])
        }
        return out
    }

    /// SYNC_SCAN_LOCAL: relative path → { size, lastModified } for every file under the folder.
    static func scanForSync(_ path: String) -> [String: Any] {
        let root = URL(fileURLWithPath: path)
        guard FileManager.default.fileExists(atPath: path) else { return ["success": false, "error": "Folder not found"] }
        var files: [String: Any] = [:]
        let e = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.fileSizeKey, .contentModificationDateKey, .isDirectoryKey],
                                               options: [.skipsHiddenFiles], errorHandler: { _, _ in true })
        while let url = e?.nextObject() as? URL {
            let a = attrs(url)
            if a.isDir { continue }
            let rel = String(url.path.dropFirst(root.path.count)).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            files[rel] = ["size": a.size, "lastModified": a.modifiedMs]
        }
        return ["success": true, "localPath": path, "files": files]
    }

    static func run(_ tool: String, _ args: [String]) async -> Int32 {
        await runCapture(tool, args).0
    }

    static func runCapture(_ tool: String, _ args: [String]) async -> (Int32, String) {
        await withCheckedContinuation { cont in
            let p = Process()
            p.executableURL = URL(fileURLWithPath: tool)
            p.arguments = args
            let pipe = Pipe()
            p.standardOutput = pipe
            p.standardError = Pipe()
            p.terminationHandler = { proc in
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                cont.resume(returning: (proc.terminationStatus, String(decoding: data, as: UTF8.self)))
            }
            do { try p.run() } catch { cont.resume(returning: (-1, "")) }
        }
    }
}

// MARK: - Keychain (Windows: Credential Locker / DPAPI in WindowsStorageConnectorService)

enum Keychain {
    private static let service = "com.plajah.mac.connectors"

    static func save(id: String, user: String, secret: String) {
        delete(id: id)
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                                kSecAttrAccount as String: id, kSecAttrLabel as String: user,
                                kSecValueData as String: Data(secret.utf8)]
        SecItemAdd(q as CFDictionary, nil)
    }

    static func get(id: String) -> String? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                                kSecAttrAccount as String: id, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(id: String) {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: id]
        SecItemDelete(q as CFDictionary)
    }
}

// MARK: - Sync pairs + baselines (Windows: WindowsSyncEngine JSON under LocalAppData)

enum SyncStore {
    private static var dir: URL {
        let d = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Plajah/Sync", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }
    private static var pairsFile: URL { dir.appendingPathComponent("pairs.json") }

    static func pairs() -> [[String: Any]] {
        guard let data = try? Data(contentsOf: pairsFile),
              let arr = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] else { return [] }
        return arr
    }

    private static func write(_ pairs: [[String: Any]]) {
        if let data = try? JSONSerialization.data(withJSONObject: pairs) { try? data.write(to: pairsFile, options: .atomic) }
    }

    static func save(pair: [String: Any]) -> [[String: Any]] {
        var all = pairs()
        let id = pair["id"] as? String ?? UUID().uuidString
        var p = pair; p["id"] = id
        if let i = all.firstIndex(where: { $0["id"] as? String == id }) { all[i] = p } else { all.append(p) }
        write(all)
        return all
    }

    static func remove(pairId: String) -> [[String: Any]] {
        let all = pairs().filter { $0["id"] as? String != pairId }
        write(all)
        try? FileManager.default.removeItem(at: dir.appendingPathComponent("baseline-\(FileOps.enc(pairId)).json"))
        return all
    }

    static func baseline(pairId: String) -> [String: Any] {
        let f = dir.appendingPathComponent("baseline-\(FileOps.enc(pairId)).json")
        guard let data = try? Data(contentsOf: f),
              let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return [:] }
        return obj
    }

    static func saveBaseline(pairId: String, baseline: [String: Any], status: String?, lastSyncAt: Double?, lastError: String?) {
        let f = dir.appendingPathComponent("baseline-\(FileOps.enc(pairId)).json")
        if let data = try? JSONSerialization.data(withJSONObject: baseline) { try? data.write(to: f, options: .atomic) }
        var all = pairs()
        if let i = all.firstIndex(where: { $0["id"] as? String == pairId }) {
            if let s = status { all[i]["status"] = s }
            if let t = lastSyncAt { all[i]["lastSyncAt"] = t }
            all[i]["lastError"] = lastError ?? NSNull()
            write(all)
        }
    }
}
