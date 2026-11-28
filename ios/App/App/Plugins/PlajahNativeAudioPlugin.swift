import Foundation
import UIKit
import AVFoundation
import MediaPlayer
import Capacitor

/// PlajahNativeAudio — lock-screen / Control Center / AirPods controls for web-driven playback.
///
/// Same rule as the Android plugin: METADATA MIRROR ONLY. The WebView <audio> element stays the one
/// and only audio source; this never starts a second player. It publishes Now Playing info and
/// forwards remote commands (play, pause, next, previous, seek) back to the page as events:
///
///   const A = registerPlugin('PlajahNativeAudio');
///   A.addListener('remoteCommand', ({ command, positionMs }) => …)
///
/// setPlaybackActive({active}) keeps the AVAudioSession in .playback while music plays, which is
/// what lets audio continue with the screen locked (Info.plist UIBackgroundModes = audio).
@objc(PlajahNativeAudioPlugin)
public class PlajahNativeAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PlajahNativeAudioPlugin"
    public let jsName = "PlajahNativeAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "syncTrackInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPlaybackActive", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "seekTo", returnType: CAPPluginReturnPromise),
    ]

    private var info: [String: Any] = [:]
    private var artworkTask: URLSessionDataTask?
    private var artworkUrl: String?

    override public func load() {
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.addTarget { [weak self] _ in self?.emit("play"); return .success }
        center.pauseCommand.addTarget { [weak self] _ in self?.emit("pause"); return .success }
        center.togglePlayPauseCommand.addTarget { [weak self] _ in self?.emit("toggle"); return .success }
        center.nextTrackCommand.addTarget { [weak self] _ in self?.emit("next"); return .success }
        center.previousTrackCommand.addTarget { [weak self] _ in self?.emit("previous"); return .success }
        center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let e = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            self?.emit("seek", positionMs: e.positionTime * 1000)
            return .success
        }
    }

    private func emit(_ command: String, positionMs: Double? = nil) {
        var data: [String: Any] = ["command": command]
        if let p = positionMs { data["positionMs"] = p }
        notifyListeners("remoteCommand", data: data)
    }

    @objc func syncTrackInfo(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? "Unknown Title"
        let artist = call.getString("artist") ?? "Unknown Artist"
        let album = call.getString("album") ?? "Plajah Chora"
        let durationMs = call.getDouble("durationMs") ?? 0
        let positionMs = call.getDouble("positionMs") ?? 0
        let isPlaying = call.getBool("isPlaying") ?? false
        let artwork = call.getString("artworkUrl")

        DispatchQueue.main.async {
            var next = self.info
            next[MPMediaItemPropertyTitle] = title
            next[MPMediaItemPropertyArtist] = artist
            next[MPMediaItemPropertyAlbumTitle] = album
            next[MPMediaItemPropertyPlaybackDuration] = durationMs / 1000
            next[MPNowPlayingInfoPropertyElapsedPlaybackTime] = positionMs / 1000
            next[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0
            if artwork != self.artworkUrl { next.removeValue(forKey: MPMediaItemPropertyArtwork) }
            self.info = next
            MPNowPlayingInfoCenter.default().nowPlayingInfo = next
            if #available(iOS 13.0, *) {
                MPNowPlayingInfoCenter.default().playbackState = isPlaying ? .playing : .paused
            }
            if let artwork = artwork, artwork != self.artworkUrl { self.loadArtwork(artwork) }
            call.resolve()
        }
    }

    private func loadArtwork(_ urlString: String) {
        artworkUrl = urlString
        artworkTask?.cancel()
        guard let url = URL(string: urlString) else { return }
        artworkTask = URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let self = self, let data = data, let image = UIImage(data: data) else { return }
            DispatchQueue.main.async {
                guard self.artworkUrl == urlString else { return }
                self.info[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
                MPNowPlayingInfoCenter.default().nowPlayingInfo = self.info
            }
        }
        artworkTask?.resume()
    }

    @objc func setPlaybackActive(_ call: CAPPluginCall) {
        let active = call.getBool("active") ?? false
        let session = AVAudioSession.sharedInstance()
        do {
            if active {
                try session.setCategory(.playback, mode: .default)
                try session.setActive(true)
            }
            // Leaving the session active when idle is harmless and avoids cutting a fade-out short.
            call.resolve()
        } catch {
            call.reject("setPlaybackActive failed: \(error.localizedDescription)")
        }
    }

    // The page owns the player; these forward to it (Android drove its MediaController here).
    @objc func play(_ call: CAPPluginCall) { emit("play"); call.resolve() }
    @objc func pause(_ call: CAPPluginCall) { emit("pause"); call.resolve() }
    @objc func seekTo(_ call: CAPPluginCall) {
        emit("seek", positionMs: call.getDouble("positionMs") ?? 0)
        call.resolve()
    }
}
