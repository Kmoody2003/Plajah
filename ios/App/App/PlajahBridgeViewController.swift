import UIKit
import WebKit
import Capacitor

/// The Capacitor bridge for Plajah on iPhone and iPad.
///
/// Same shape as android/MainActivity: a thin shell over https://plajah.com (capacitor.config.ts
/// `server.url`), plus the native plugins the web layer reaches through `registerPlugin(...)`.
/// Plugin JS names match the Android ones exactly, so the web code needs no iOS branches:
///
///   PlajahShell · PlajahLaunch · PlajahNativeAudio · PlajahSpeech · PlajahDevice
///   PlajahCamera · WatchNext
///
/// Android-only plugins (PlajahFiles SAF, PlajahHub, PlajahMatter, PlajahSpeakers, PlajahTelecom)
/// are deliberately not registered: their JS calls reject with UNIMPLEMENTED, which every web
/// caller already treats as "not on this device".
class PlajahBridgeViewController: CAPBridgeViewController {

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(PlajahShellPlugin())
        bridge?.registerPluginInstance(PlajahLaunchPlugin())
        bridge?.registerPluginInstance(PlajahNativeAudioPlugin())
        bridge?.registerPluginInstance(PlajahSpeechPlugin())
        bridge?.registerPluginInstance(PlajahDevicePlugin())
        bridge?.registerPluginInstance(PlajahCameraPlugin())
        bridge?.registerPluginInstance(WatchNextPlugin())
    }

    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let config = super.webViewConfiguration(for: instanceConfiguration)
        // Chora / Reello / Live play inline and start from code (autoplay after a tap elsewhere).
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.allowsPictureInPictureMediaPlayback = true
        // Same flag the Windows shell sets, so the web layer can tell which native host it's in.
        let marker = WKUserScript(
            source: "window.__PLAJAH_PLATFORM__ = 'ios'; window.__PLAJAH_IOS__ = true;",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true)
        config.userContentController.addUserScript(marker)
        return config
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        // Edge-to-edge like the Android shell: the web layer pads with env(safe-area-inset-*).
        webView?.scrollView.contentInsetAdjustmentBehavior = .never
        if #available(iOS 16.4, *) {
            webView?.isInspectable = true   // Safari ▸ Develop, same role as logcat console capture on Android
        }
        view.backgroundColor = .black
    }
}
