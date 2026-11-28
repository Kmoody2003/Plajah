import UIKit
import AVFoundation
import Capacitor
#if canImport(FirebaseCore)
import FirebaseCore
#endif

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        configureFirebase()
        // Chora keeps playing with the screen locked (UIBackgroundModes = audio in Info.plist).
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        return true
    }

    /// The native sign-in plugin calls FirebaseApp.configure() on load, which CRASHES the app when
    /// GoogleService-Info.plist is missing. Configure first: from the plist once it has been added
    /// (Firebase console > add iOS app com.plajah.app; needed for native Google sign-in), otherwise
    /// from the same public web config the site already ships, so the app always launches.
    private func configureFirebase() {
        #if canImport(FirebaseCore)
        guard FirebaseApp.app() == nil else { return }
        if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
            FirebaseApp.configure()
        } else {
            let options = FirebaseOptions(googleAppID: "1:538331111809:web:ff72e1715d2dc18a0a4880",
                                          gcmSenderID: "538331111809")
            options.projectID = "gen-lang-client-0665118474"
            options.apiKey = Bundle.main.object(forInfoDictionaryKey: "PlajahFirebaseWebApiKey") as? String
            options.storageBucket = "gen-lang-client-0665118474.firebasestorage.app"
            FirebaseApp.configure(options: options)
        }
        #endif
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // Push (FCM via @capacitor/push-notifications) needs the APNs token forwarded to the plugin.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
