import SwiftUI
import AVKit
import MediaPlayer
import CoreImage.CIFilterBuiltins

/// Plajah for Apple TV. tvOS has no web view, so unlike the phone/tablet/desktop apps this is a
/// native SwiftUI app over the same public catalogue the Android TV / Fire TV screens show:
/// Chora albums and Reello / Taleo videos, plus code sign-in approved on a phone.
@main
struct PlajahTVApp: App {
    @StateObject private var account = Account.shared
    @StateObject private var player = AudioPlayer.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(account)
                .environmentObject(player)
                .preferredColorScheme(.dark)
        }
    }
}

struct RootView: View {
    var body: some View {
        TabView {
            HomeView().tabItem { Label("Home", systemImage: "house") }
            ChoraView().tabItem { Label("Chora", systemImage: "music.note") }
            WatchView().tabItem { Label("Watch", systemImage: "play.rectangle") }
            AccountView().tabItem { Label("Account", systemImage: "person.crop.circle") }
        }
    }
}

// MARK: - Loading helper

@MainActor
final class Loader<T>: ObservableObject {
    @Published var value: T?
    @Published var error: String?
    private let load: () async throws -> T
    init(_ load: @escaping () async throws -> T) { self.load = load }
    func run() async {
        do { value = try await load(); error = nil }
        catch { self.error = "Couldn't reach Plajah. Check the connection and try again." }
    }
}

struct LoadingState<T, Content: View>: View {
    @ObservedObject var loader: Loader<T>
    @ViewBuilder var content: (T) -> Content
    var body: some View {
        Group {
            if let v = loader.value { content(v) }
            else if let e = loader.error {
                VStack(spacing: 24) {
                    Text(e).foregroundStyle(.secondary)
                    Button("Try again") { Task { await loader.run() } }
                }
            } else { ProgressView() }
        }
        .task { if loader.value == nil { await loader.run() } }
    }
}

// MARK: - Home

struct HomeView: View {
    @StateObject private var albums = Loader { try await Catalog.shared.albums() }
    @StateObject private var videos = Loader { try await Catalog.shared.videos() }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 48) {
                    Text("Plajah").font(.system(size: 64, weight: .heavy))
                    LoadingState(loader: videos) { list in
                        Shelf(title: "New on Reello", items: Array(list.prefix(20))) { v in
                            VideoCard(video: v)
                        }
                    }
                    LoadingState(loader: albums) { list in
                        Shelf(title: "New music on Chora", items: Array(list.filter { $0.type != "BOOK" }.prefix(20))) { a in
                            NavigationLink(value: a) { AlbumCard(album: a) }.buttonStyle(.card)
                        }
                    }
                }
                .padding(.horizontal, 80)
            }
            .navigationDestination(for: Album.self) { AlbumView(album: $0) }
        }
    }
}

struct Shelf<Item: Identifiable, Card: View>: View {
    let title: String
    let items: [Item]
    @ViewBuilder var card: (Item) -> Card
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text(title).font(.title2).bold()
            ScrollView(.horizontal) {
                LazyHStack(spacing: 40) { ForEach(items) { card($0) } }
                    .padding(.vertical, 30)
            }
            .scrollClipDisabled()
        }
    }
}

struct Artwork: View {
    let url: URL?
    var body: some View {
        AsyncImage(url: url) { phase in
            if let image = phase.image { image.resizable().scaledToFill() }
            else { Rectangle().fill(.gray.opacity(0.25)).overlay(Image(systemName: "photo").font(.largeTitle).foregroundStyle(.secondary)) }
        }
    }
}

// MARK: - Chora

struct ChoraView: View {
    @StateObject private var albums = Loader { try await Catalog.shared.albums() }
    @EnvironmentObject private var player: AudioPlayer
    private let columns = [GridItem(.adaptive(minimum: 300), spacing: 48)]

    var body: some View {
        NavigationStack {
            ScrollView {
                if player.current != nil { NowPlayingBar().padding(.bottom, 30) }
                LoadingState(loader: albums) { list in
                    LazyVGrid(columns: columns, spacing: 60) {
                        ForEach(list.filter { !$0.tracks.isEmpty && $0.type != "BOOK" }) { a in
                            NavigationLink(value: a) { AlbumCard(album: a) }.buttonStyle(.card)
                        }
                    }
                }
            }
            .padding(.horizontal, 80)
            .navigationDestination(for: Album.self) { AlbumView(album: $0) }
        }
    }
}

struct AlbumCard: View {
    let album: Album
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Artwork(url: album.cover).frame(width: 300, height: 300).clipped()
            VStack(alignment: .leading) {
                Text(album.title).font(.headline).lineLimit(1)
                Text(album.artist).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
            }
            .padding([.horizontal, .bottom], 12)
        }
        .frame(width: 300)
    }
}

struct AlbumView: View {
    let album: Album
    @EnvironmentObject private var player: AudioPlayer

    var body: some View {
        HStack(alignment: .top, spacing: 80) {
            VStack(alignment: .leading, spacing: 24) {
                Artwork(url: album.cover).frame(width: 500, height: 500).clipShape(RoundedRectangle(cornerRadius: 16))
                Text(album.title).font(.title).bold()
                Text(album.artist).font(.title3).foregroundStyle(.secondary)
                if !album.tracks.isEmpty {
                    Button { player.play(album: album, startAt: 0) } label: { Label("Play", systemImage: "play.fill") }
                }
            }
            .frame(width: 500)
            List {
                ForEach(Array(album.tracks.enumerated()), id: \.element.id) { i, t in
                    Button { player.play(album: album, startAt: i) } label: {
                        HStack {
                            Text("\(i + 1)").foregroundStyle(.secondary).frame(width: 50, alignment: .leading)
                            VStack(alignment: .leading) {
                                Text(t.title)
                                if !t.artist.isEmpty && t.artist != album.artist { Text(t.artist).font(.caption).foregroundStyle(.secondary) }
                            }
                            Spacer()
                            if player.current?.id == t.id { Image(systemName: player.isPlaying ? "speaker.wave.2.fill" : "pause.fill") }
                        }
                    }
                }
            }
        }
        .padding(80)
    }
}

struct NowPlayingBar: View {
    @EnvironmentObject private var player: AudioPlayer
    var body: some View {
        if let t = player.current {
            HStack(spacing: 30) {
                Artwork(url: player.album?.cover).frame(width: 120, height: 120).clipShape(RoundedRectangle(cornerRadius: 10))
                VStack(alignment: .leading) {
                    Text(t.title).font(.headline)
                    Text(t.artist.isEmpty ? (player.album?.artist ?? "") : t.artist).foregroundStyle(.secondary)
                }
                Spacer()
                Button { player.previous() } label: { Image(systemName: "backward.fill") }
                Button { player.toggle() } label: { Image(systemName: player.isPlaying ? "pause.fill" : "play.fill") }
                Button { player.next() } label: { Image(systemName: "forward.fill") }
            }
            .padding(30)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24))
        }
    }
}

/// Chora playback: AVQueuePlayer + Now Playing / Siri Remote play-pause, keeps playing while
/// browsing other tabs.
@MainActor
final class AudioPlayer: ObservableObject {
    static let shared = AudioPlayer()
    @Published private(set) var album: Album?
    @Published private(set) var current: Track?
    @Published private(set) var isPlaying = false
    private let player = AVPlayer()
    private var index = 0
    private var endObserver: Any?

    init() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.next() }
        }
        let c = MPRemoteCommandCenter.shared()
        c.playCommand.addTarget { [weak self] _ in Task { @MainActor in self?.resume() }; return .success }
        c.pauseCommand.addTarget { [weak self] _ in Task { @MainActor in self?.pause() }; return .success }
        c.togglePlayPauseCommand.addTarget { [weak self] _ in Task { @MainActor in self?.toggle() }; return .success }
        c.nextTrackCommand.addTarget { [weak self] _ in Task { @MainActor in self?.next() }; return .success }
        c.previousTrackCommand.addTarget { [weak self] _ in Task { @MainActor in self?.previous() }; return .success }
    }

    func play(album: Album, startAt: Int) {
        self.album = album
        index = startAt
        startCurrent()
    }

    private func startCurrent() {
        guard let album = album, album.tracks.indices.contains(index), let url = album.tracks[index].url else { return }
        try? AVAudioSession.sharedInstance().setActive(true)
        current = album.tracks[index]
        player.replaceCurrentItem(with: AVPlayerItem(url: url))
        player.play()
        isPlaying = true
        publishNowPlaying()
    }

    func toggle() { isPlaying ? pause() : resume() }
    func pause() { player.pause(); isPlaying = false; publishNowPlaying() }
    func resume() { player.play(); isPlaying = true; publishNowPlaying() }
    func next() {
        guard let album = album else { return }
        if index + 1 < album.tracks.count { index += 1; startCurrent() } else { pause() }
    }
    func previous() {
        if player.currentTime().seconds > 3 { player.seek(to: .zero); return }
        if index > 0 { index -= 1; startCurrent() }
    }

    private func publishNowPlaying() {
        guard let t = current else { return }
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: t.title,
            MPMediaItemPropertyArtist: t.artist.isEmpty ? (album?.artist ?? "") : t.artist,
            MPMediaItemPropertyAlbumTitle: album?.title ?? "Plajah Chora",
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: player.currentTime().seconds.isFinite ? player.currentTime().seconds : 0,
        ]
        if let d = t.duration { info[MPMediaItemPropertyPlaybackDuration] = d }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
}

// MARK: - Watch (Reello / Taleo)

struct WatchView: View {
    @StateObject private var videos = Loader { try await Catalog.shared.videos() }
    private let columns = [GridItem(.adaptive(minimum: 480), spacing: 48)]

    var body: some View {
        NavigationStack {
            ScrollView {
                LoadingState(loader: videos) { list in
                    LazyVGrid(columns: columns, spacing: 60) {
                        ForEach(list) { VideoCard(video: $0) }
                    }
                }
            }
            .padding(.horizontal, 80)
        }
    }
}

struct VideoCard: View {
    let video: Video
    @State private var playing = false
    var body: some View {
        Button { playing = true } label: {
            VStack(alignment: .leading, spacing: 10) {
                Artwork(url: video.thumbnail).frame(width: 480, height: 270).clipped()
                Text(video.title).font(.headline).lineLimit(1).padding([.horizontal, .bottom], 12)
            }
            .frame(width: 480)
        }
        .buttonStyle(.card)
        .fullScreenCover(isPresented: $playing) {
            if let url = video.playback { PlayerView(url: url, title: video.title) }
        }
    }
}

/// AVPlayerViewController: the system tvOS player (scrubbing, Siri Remote, subtitles, AirPlay).
struct PlayerView: UIViewControllerRepresentable {
    let url: URL
    let title: String

    func makeUIViewController(context: Context) -> AVPlayerViewController {
        AudioPlayer.shared.pause()
        let vc = AVPlayerViewController()
        let item = AVPlayerItem(url: url)
        let meta = AVMutableMetadataItem()
        meta.identifier = .commonIdentifierTitle
        meta.value = title as NSString
        item.externalMetadata = [meta]
        vc.player = AVPlayer(playerItem: item)
        vc.player?.play()
        return vc
    }

    func updateUIViewController(_ vc: AVPlayerViewController, context: Context) {}

    static func dismantleUIViewController(_ vc: AVPlayerViewController, coordinator: ()) {
        vc.player?.pause()
    }
}

// MARK: - Account (code sign-in)

struct AccountView: View {
    @EnvironmentObject private var account: Account
    @State private var pairing: Account.Pairing?
    @State private var status = ""
    @State private var pollTask: Task<Void, Never>?

    var body: some View {
        VStack(spacing: 40) {
            if account.isSignedIn {
                Image(systemName: "person.crop.circle.fill").font(.system(size: 120))
                Text(account.displayName.map { "Signed in as \($0)" } ?? "Signed in").font(.title2)
                Button("Sign out", role: .destructive) { account.signOut() }
            } else if let p = pairing {
                Text("Sign in to Plajah").font(.largeTitle).bold()
                HStack(spacing: 80) {
                    if let qr = QRCode.image(for: "https://plajah.com/link?c=\(p.code)") {
                        Image(uiImage: qr).interpolation(.none).resizable().frame(width: 360, height: 360)
                    }
                    VStack(alignment: .leading, spacing: 20) {
                        Text("Scan the code with your phone, or go to").foregroundStyle(.secondary)
                        Text("plajah.com/link").font(.title2).bold()
                        Text("and enter").foregroundStyle(.secondary)
                        Text(p.code).font(.system(size: 80, weight: .heavy, design: .monospaced))
                        Text(status).foregroundStyle(.secondary)
                    }
                }
                Button("Get a new code") { start() }
            } else {
                Text("Sign in to Plajah").font(.largeTitle).bold()
                Text("Use your phone to approve this TV — no typing with the remote.").foregroundStyle(.secondary)
                Button("Sign in") { start() }
                if !status.isEmpty { Text(status).foregroundStyle(.secondary) }
            }
        }
        .padding(80)
        .onDisappear { pollTask?.cancel() }
    }

    private func start() {
        pollTask?.cancel()
        status = ""
        pollTask = Task {
            do {
                let p = try await account.startPairing()
                pairing = p
                status = "Waiting for approval…"
                let deadline = Date().addingTimeInterval(TimeInterval(p.expiresIn))
                while !Task.isCancelled && Date() < deadline {
                    try? await Task.sleep(nanoseconds: 3_000_000_000)
                    switch await account.poll(code: p.code) {
                    case .approved: pairing = nil; return
                    case .expired: status = "That code expired."; pairing = nil; return
                    case .pending: continue
                    }
                }
                if !Task.isCancelled { status = "That code expired."; pairing = nil }
            } catch {
                status = "Couldn't start sign-in. Try again shortly."
                pairing = nil
            }
        }
    }
}

enum QRCode {
    static func image(for text: String) -> UIImage? {
        let f = CIFilter.qrCodeGenerator()
        f.message = Data(text.utf8)
        f.correctionLevel = "M"
        guard let out = f.outputImage?.transformed(by: CGAffineTransform(scaleX: 12, y: 12)),
              let cg = CIContext().createCGImage(out, from: out.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}
