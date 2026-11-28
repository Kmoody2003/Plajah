import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = PlajahBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)

        // Cold start from "Open in Plajah" / a share: hand the file to PlajahLaunch before the page asks.
        for ctx in connectionOptions.urlContexts { route(ctx.url) }
    }

    /// plajah://view/<slug> opens an experience; a file URL opens the light media viewer.
    private func route(_ url: URL) {
        if url.isFileURL {
            PlajahLaunchPlugin.handleIncomingFile(url)
        } else if url.scheme == "plajah", url.host == "view", let slug = url.pathComponents.dropFirst().first {
            PlajahLaunchPlugin.handleExperience(slug)
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for ctx in URLContexts { route(ctx.url) }
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
