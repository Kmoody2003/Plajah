import Foundation

/// Public endpoints shared by the Mac and Apple TV apps. Same values the web build and the Windows
/// shell use (firebase-applet-config.json, windows-native MainWindow.AppUrl). The Firebase web API
/// key is a public client identifier, read from Info.plist so it lives next to the other app config.
enum PlajahConfig {
    static let appURL = URL(string: "https://plajah.com")!
    static let apiBase = URL(string: "https://plajah.com/api")!

    static let firebaseProjectId = "gen-lang-client-0665118474"
    static let firestoreDatabaseId = "plajah-prod"
    static var firebaseApiKey: String {
        Bundle.main.object(forInfoDictionaryKey: "PlajahFirebaseWebApiKey") as? String ?? ""
    }

    /// Hosts that stay inside the app window; everything else opens in the default browser.
    static func isPlajahHost(_ host: String?) -> Bool {
        guard let h = host?.lowercased() else { return false }
        return h == "plajah.com" || h.hasSuffix(".plajah.com") || h == "plajah.app"
            || h.hasSuffix(".firebaseapp.com") || h.hasSuffix(".googleapis.com")
            || h.hasSuffix(".mux.com") || h.hasSuffix(".stripe.com")
    }

    /// Sign-in providers that must open as an in-app popup (the page waits on window.opener).
    static func isAuthHost(_ host: String?) -> Bool {
        guard let h = host?.lowercased() else { return false }
        let needles = ["accounts.google.com", "google.com", "microsoft.com", "microsoftonline.com",
                       "live.com", "msauth.net", "msftauth.net", "twitter.com", "x.com",
                       "facebook.com", "apple.com", "appleid.apple.com"]
        return needles.contains { h == $0 || h.hasSuffix("." + $0) }
    }
}
