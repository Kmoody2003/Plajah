import Foundation

// Plajah's public catalogue for Apple TV, read the same way the TV web screens do
// (services/tv/tvCatalogCache.ts → backendService.fetchAllPublicAlbums / fetchAllVideos):
// Firestore `albums` and `videos` where isPrivate == false, drafts / unlisted / unreleased filtered
// out on the client. tvOS has no web view, so this talks to the Firestore REST API directly.

struct Track: Identifiable, Hashable {
    let id: String
    let title: String
    let artist: String
    let url: URL?
    let duration: Double?
}

struct Album: Identifiable, Hashable {
    let id: String
    let title: String
    let artist: String
    let cover: URL?
    let description: String
    let genre: String?
    let type: String?
    let createdAt: Double
    let tracks: [Track]
}

struct Video: Identifiable, Hashable {
    let id: String
    let title: String
    let description: String
    let thumbnail: URL?
    let playback: URL?
    let category: String?
    let timestamp: Double
}

enum CatalogError: Error { case http(Int), decode }

actor Catalog {
    static let shared = Catalog()

    private var cache: [String: (Date, Any)] = [:]
    private let ttl: TimeInterval = 300   // same 5-minute TTL as tvCatalogCache

    func albums() async throws -> [Album] {
        try await cached("albums") {
            let docs = try await Firestore.runQuery(collection: "albums", whereFalse: "isPrivate", limit: 300)
            let now = Date().timeIntervalSince1970 * 1000
            return docs.compactMap { id, f -> Album? in
                if f.bool("isPrivate") || f.bool("isDraft") || f.bool("unlisted") { return nil }
                if (f.string("visibility") ?? "PUBLIC") != "PUBLIC" { return nil }
                if f.bool("isScheduled"), let rd = f.double("releaseDate"), rd > now { return nil }
                let tracks = (f["tracks"] as? [[String: Any]] ?? []).compactMap { t -> Track? in
                    guard let tid = t.string("id"), let u = t.string("url") else { return nil }
                    if t.bool("isPaywalled") { return nil }   // paid tracks play in the full app
                    return Track(id: tid, title: t.string("title") ?? "Untitled", artist: t.string("artist") ?? "",
                                 url: URL(string: u), duration: t.double("duration"))
                }
                return Album(id: id, title: f.string("title") ?? "Untitled", artist: f.string("artist") ?? "",
                             cover: URL(string: f.string("coverThumb") ?? f.string("coverImage") ?? ""),
                             description: f.string("description") ?? "", genre: f.string("genre"),
                             type: f.string("type"), createdAt: f.double("createdAt") ?? 0, tracks: tracks)
            }
            .sorted { $0.createdAt > $1.createdAt }
        }
    }

    func videos() async throws -> [Video] {
        try await cached("videos") {
            let docs = try await Firestore.runQuery(collection: "videos", whereFalse: "isPrivate", limit: 100)
            let now = Date().timeIntervalSince1970 * 1000
            return docs.compactMap { id, f -> Video? in
                if f.bool("isPrivate") || f.bool("unlisted") || f.bool("isDraft") { return nil }
                if (f.string("visibility") ?? "PUBLIC") != "PUBLIC" { return nil }
                if let rd = f.double("releaseDate"), rd > now { return nil }
                var playback: URL?
                if let mux = f.string("muxPlaybackId"), !mux.isEmpty {
                    playback = URL(string: "https://stream.mux.com/\(mux).m3u8")
                } else if let hls = f.string("hlsUrl") ?? f.string("playbackUrl") {
                    playback = URL(string: hls)
                } else if let u = f.string("url"), !u.contains("youtube.com"), !u.contains("vimeo.com") {
                    playback = URL(string: u)
                }
                guard playback != nil else { return nil }
                return Video(id: id, title: f.string("title") ?? "Untitled", description: f.string("description") ?? "",
                             thumbnail: URL(string: f.string("thumbnailUrl") ?? f.string("coverImageUrl") ?? ""),
                             playback: playback, category: f.string("category"), timestamp: f.double("timestamp") ?? 0)
            }
            .sorted { $0.timestamp > $1.timestamp }
        }
    }

    private func cached<T>(_ key: String, _ load: () async throws -> T) async throws -> T {
        if let entry = cache[key], Date().timeIntervalSince(entry.0) < ttl, let v = entry.1 as? T { return v }
        let v = try await load()
        cache[key] = (Date(), v)
        return v
    }
}

/// Minimal Firestore REST client (structured query + typed-value decoding).
enum Firestore {
    static func runQuery(collection: String, whereFalse field: String, limit: Int) async throws -> [(String, [String: Any])] {
        let base = "https://firestore.googleapis.com/v1/projects/\(PlajahConfig.firebaseProjectId)/databases/\(PlajahConfig.firestoreDatabaseId)/documents:runQuery"
        var comps = URLComponents(string: base)!
        comps.queryItems = [URLQueryItem(name: "key", value: PlajahConfig.firebaseApiKey)]
        var req = URLRequest(url: comps.url!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = await Account.shared.idToken() { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let body: [String: Any] = ["structuredQuery": [
            "from": [["collectionId": collection]],
            "where": ["fieldFilter": ["field": ["fieldPath": field], "op": "EQUAL", "value": ["booleanValue": false]]],
            "limit": limit,
        ]]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, resp) = try await URLSession.shared.data(for: req)
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw CatalogError.http(status) }
        guard let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { throw CatalogError.decode }
        return rows.compactMap { row in
            guard let doc = row["document"] as? [String: Any],
                  let name = doc["name"] as? String,
                  let fields = doc["fields"] as? [String: Any] else { return nil }
            return (String(name.split(separator: "/").last ?? ""), decode(fields: fields))
        }
    }

    static func decode(fields: [String: Any]) -> [String: Any] {
        fields.mapValues { decode(value: $0) }
    }

    static func decode(value: Any) -> Any {
        guard let v = value as? [String: Any] else { return NSNull() }
        if let s = v["stringValue"] as? String { return s }
        if let b = v["booleanValue"] as? Bool { return b }
        if let i = v["integerValue"] as? String { return Double(i) ?? 0 }
        if let d = v["doubleValue"] as? Double { return d }
        if let t = v["timestampValue"] as? String {
            return (ISO8601DateFormatter().date(from: t)?.timeIntervalSince1970 ?? 0) * 1000
        }
        if let m = v["mapValue"] as? [String: Any] { return decode(fields: m["fields"] as? [String: Any] ?? [:]) }
        if let a = v["arrayValue"] as? [String: Any] { return (a["values"] as? [Any] ?? []).map { decode(value: $0) } }
        return NSNull()
    }
}

extension Dictionary where Key == String, Value == Any {
    func string(_ k: String) -> String? { (self[k] as? String).flatMap { $0.isEmpty ? nil : $0 } }
    func bool(_ k: String) -> Bool { self[k] as? Bool ?? false }
    func double(_ k: String) -> Double? { self[k] as? Double }
}
