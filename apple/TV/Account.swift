import Foundation
import Security

/// Sign in on the TV with a code, approved on a phone — the existing flow the web TV app uses
/// (components/TvSignInView.tsx → server /api/tv/pair/start · /poll; the phone approves at
/// plajah.com/link). The approved custom token is exchanged with Firebase Auth's REST API; the
/// refresh token is kept in the Keychain so the TV stays signed in.
@MainActor
final class Account: ObservableObject {
    static let shared = Account()

    @Published private(set) var displayName: String?
    @Published private(set) var isSignedIn = false

    private var cachedIdToken: (String, Date)?

    init() {
        isSignedIn = TVKeychain.get("refreshToken") != nil
        displayName = UserDefaults.standard.string(forKey: "plajah.displayName")
    }

    struct Pairing { let code: String; let expiresIn: Int }

    func startPairing() async throws -> Pairing {
        var req = URLRequest(url: PlajahConfig.apiBase.appendingPathComponent("tv/pair/start"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = Data("{}".utf8)
        let (data, _) = try await URLSession.shared.data(for: req)
        guard let j = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              j["ok"] as? Bool == true, let code = j["code"] as? String else {
            throw CatalogError.decode
        }
        return Pairing(code: code, expiresIn: j["expiresInSec"] as? Int ?? 600)
    }

    enum PollResult { case pending, expired, approved }

    func poll(code: String) async -> PollResult {
        var comps = URLComponents(url: PlajahConfig.apiBase.appendingPathComponent("tv/pair/poll"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "code", value: code)]
        guard let (data, _) = try? await URLSession.shared.data(from: comps.url!),
              let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return .pending }
        switch j["status"] as? String {
        case "approved":
            guard let token = j["customToken"] as? String, (try? await exchange(customToken: token)) != nil else { return .expired }
            return .approved
        case "expired": return .expired
        default: return .pending
        }
    }

    private func exchange(customToken: String) async throws {
        let j = try await identityToolkit("accounts:signInWithCustomToken", ["token": customToken, "returnSecureToken": true])
        guard let id = j["idToken"] as? String, let refresh = j["refreshToken"] as? String else { throw CatalogError.decode }
        TVKeychain.set("refreshToken", refresh)
        cachedIdToken = (id, Date().addingTimeInterval(3000))
        isSignedIn = true
        if let lookup = try? await identityToolkit("accounts:lookup", ["idToken": id]),
           let user = (lookup["users"] as? [[String: Any]])?.first {
            displayName = (user["displayName"] as? String) ?? (user["email"] as? String)
            UserDefaults.standard.set(displayName, forKey: "plajah.displayName")
        }
    }

    /// A fresh Firebase ID token (refreshed via securetoken when the cached one is old), or nil.
    func idToken() async -> String? {
        if let cached = cachedIdToken, cached.1 > Date() { return cached.0 }
        guard let refresh = TVKeychain.get("refreshToken") else { return nil }
        var comps = URLComponents(string: "https://securetoken.googleapis.com/v1/token")!
        comps.queryItems = [URLQueryItem(name: "key", value: PlajahConfig.firebaseApiKey)]
        var req = URLRequest(url: comps.url!)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        req.httpBody = Data("grant_type=refresh_token&refresh_token=\(refresh)".utf8)
        guard let (data, resp) = try? await URLSession.shared.data(for: req),
              (resp as? HTTPURLResponse)?.statusCode == 200,
              let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let id = j["id_token"] as? String else { return nil }
        if let newRefresh = j["refresh_token"] as? String { TVKeychain.set("refreshToken", newRefresh) }
        cachedIdToken = (id, Date().addingTimeInterval(3000))
        return id
    }

    func signOut() {
        TVKeychain.delete("refreshToken")
        UserDefaults.standard.removeObject(forKey: "plajah.displayName")
        cachedIdToken = nil
        displayName = nil
        isSignedIn = false
    }

    private func identityToolkit(_ method: String, _ body: [String: Any]) async throws -> [String: Any] {
        var comps = URLComponents(string: "https://identitytoolkit.googleapis.com/v1/\(method)")!
        comps.queryItems = [URLQueryItem(name: "key", value: PlajahConfig.firebaseApiKey)]
        var req = URLRequest(url: comps.url!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard (resp as? HTTPURLResponse)?.statusCode == 200,
              let j = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw CatalogError.decode }
        return j
    }
}

enum TVKeychain {
    private static let service = "com.plajah.tv.auth"

    static func set(_ key: String, _ value: String) {
        delete(key)
        SecItemAdd([kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: key,
                    kSecValueData: Data(value.utf8)] as [CFString: Any] as CFDictionary, nil)
    }

    static func get(_ key: String) -> String? {
        var out: AnyObject?
        let q = [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: key,
                 kSecReturnData: true, kSecMatchLimit: kSecMatchLimitOne] as [CFString: Any]
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }

    static func delete(_ key: String) {
        SecItemDelete([kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: key] as [CFString: Any] as CFDictionary)
    }
}
