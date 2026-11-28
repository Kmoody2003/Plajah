import Foundation
import AVFoundation
import Speech

/// Voca read-aloud recogniser — same protocol as windows-native SpeechBridgeService:
///   web → host  { type: "SPEECH_START", lang, words?, strict? } / SPEECH_STOP / SPEECH_SUSPEND / SPEECH_RESUME
///   host → web  { type: "SPEECH_PARTIAL", text } · { type: "SPEECH_FINAL", text, alts }
///               { type: "SPEECH_STATE", state, mode } · { type: "SPEECH_ERROR", code, message }
///
/// `words` (the page's vocabulary) becomes contextualStrings, the Mac version of the Windows
/// grammar constraint. On-device recognition is used whenever the language supports it.
@MainActor
final class SpeechBridge {
    private unowned let bridge: NativeBridge
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var lang = "en-US"
    private var words: [String] = []
    private var wanted = false
    private var suspended = false
    private var mode = "apple-server"

    init(bridge: NativeBridge) { self.bridge = bridge }

    func handle(type: String, root: [String: Any]) {
        switch type {
        case "SPEECH_START":
            lang = root["lang"] as? String ?? "en-US"
            words = (root["words"] as? [String] ?? []).filter { !$0.isEmpty }
            wanted = true
            suspended = false
            authorizeThenStart()
        case "SPEECH_STOP":
            wanted = false
            end()
            state("idle")
        case "SPEECH_SUSPEND":
            suspended = true
            end()
            state("suspended")
        case "SPEECH_RESUME":
            suspended = false
            if wanted { begin() }
        default: break
        }
    }

    private func authorizeThenStart() {
        SFSpeechRecognizer.requestAuthorization { status in
            Task { @MainActor in
                guard status == .authorized else { self.error("not-allowed", "Speech recognition permission was not granted"); return }
                AVCaptureDevice.requestAccess(for: .audio) { granted in
                    Task { @MainActor in
                        guard granted else { self.error("not-allowed", "Microphone permission was not granted"); return }
                        self.begin()
                    }
                }
            }
        }
    }

    private func begin() {
        end()
        guard let rec = SFSpeechRecognizer(locale: Locale(identifier: lang)), rec.isAvailable else {
            error("language-not-supported", "No speech recogniser for \(lang)"); return
        }
        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        req.contextualStrings = Array(words.prefix(100))
        if rec.supportsOnDeviceRecognition { req.requiresOnDeviceRecognition = true; mode = "apple-local" } else { mode = "apple-server" }
        request = req

        let input = engine.inputNode
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { [weak req] buffer, _ in
            req?.append(buffer)
        }
        engine.prepare()
        do { try engine.start() } catch { self.error("audio-capture", error.localizedDescription); return }

        task = rec.recognitionTask(with: req) { [weak self] result, err in
            Task { @MainActor in
                guard let self = self else { return }
                if let r = result {
                    if r.isFinal {
                        self.bridge.post(type: "SPEECH_FINAL", payload: [
                            "text": r.bestTranscription.formattedString,
                            "alts": r.transcriptions.prefix(3).map { $0.formattedString },
                        ])
                    } else {
                        self.bridge.post(type: "SPEECH_PARTIAL", payload: ["text": r.bestTranscription.formattedString])
                    }
                }
                if err != nil || (result?.isFinal ?? false) {
                    // Apple ends a task at each long pause / ~1 minute; keep reading continuous.
                    if self.wanted && !self.suspended { self.begin() } else { self.end() }
                }
            }
        }
        state("listening")
    }

    private func end() {
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        task = nil
        request = nil
    }

    private func state(_ s: String) { bridge.post(type: "SPEECH_STATE", payload: ["state": s, "mode": mode]) }
    private func error(_ code: String, _ message: String) {
        bridge.post(type: "SPEECH_ERROR", payload: ["code": code, "message": message])
        state("error")
    }
}
