import Foundation
import AVFoundation
import Speech
import Capacitor

/// PlajahSpeech — native speech recognition for Voca (read-aloud), same contract as Android:
///
///   const S = registerPlugin('PlajahSpeech'); await S.start({ lang: 'en-US' });
///   S.addListener('partial'|'final'|'level'|'state'|'error', cb); await S.stop();
///
///  • Prefers ON-DEVICE recognition (requiresOnDeviceRecognition when the locale supports it) so a
///    child's voice can stay on the device.
///  • Continuous: Apple ends a task after ~1 min or a long pause, so we restart until stop().
///  • 'final' carries up to 3 alternatives; 'level' is mic RMS 0…1 so the web never opens a
///    competing getUserMedia stream on the same mic.
@objc(PlajahSpeechPlugin)
public class PlajahSpeechPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PlajahSpeechPlugin"
    public let jsName = "PlajahSpeech"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "suspend", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resume", returnType: CAPPluginReturnPromise),
    ]

    private let engine = AVAudioEngine()
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var wanted = false      // stop() not called yet → keep restarting
    private var suspended = false
    private var onDevice = false
    private var lang = "en-US"

    @objc func isAvailable(_ call: CAPPluginCall) {
        let r = SFSpeechRecognizer(locale: Locale(identifier: call.getString("lang") ?? "en-US"))
        call.resolve([
            "available": r?.isAvailable ?? false,
            "onDevice": r?.supportsOnDeviceRecognition ?? false,
        ])
    }

    @objc func start(_ call: CAPPluginCall) {
        lang = call.getString("lang") ?? "en-US"
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else {
                self.emitError("not-allowed", "Speech recognition permission was not granted")
                call.reject("Speech permission not granted"); return
            }
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                guard granted else {
                    self.emitError("not-allowed", "Microphone permission was not granted")
                    call.reject("Microphone permission not granted"); return
                }
                DispatchQueue.main.async {
                    self.wanted = true
                    self.suspended = false
                    do { try self.begin(); call.resolve() }
                    catch {
                        self.emitError("start-failed", error.localizedDescription)
                        call.reject("Could not start speech: \(error.localizedDescription)")
                    }
                }
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.wanted = false
            self.end()
            self.emitState("idle")
            call.resolve()
        }
    }

    @objc func suspend(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.suspended = true; self.end(); self.emitState("suspended"); call.resolve() }
    }

    @objc func resume(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.suspended = false
            if self.wanted { try? self.begin() }
            call.resolve()
        }
    }

    private func begin() throws {
        end()
        guard let rec = SFSpeechRecognizer(locale: Locale(identifier: lang)), rec.isAvailable else {
            throw NSError(domain: "PlajahSpeech", code: 1, userInfo: [NSLocalizedDescriptionKey: "No recogniser for \(lang)"])
        }
        recognizer = rec
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .measurement, options: [.duckOthers, .defaultToSpeaker, .allowBluetooth])
        try session.setActive(true, options: .notifyOthersOnDeactivation)

        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        onDevice = rec.supportsOnDeviceRecognition
        if onDevice { req.requiresOnDeviceRecognition = true }
        if #available(iOS 16.0, *) { req.addsPunctuation = false }
        request = req

        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.request?.append(buffer)
            self?.emitLevel(buffer)
        }
        engine.prepare()
        try engine.start()

        task = rec.recognitionTask(with: req) { [weak self] result, error in
            guard let self = self else { return }
            if let result = result {
                let text = result.bestTranscription.formattedString
                if result.isFinal {
                    let alts = result.transcriptions.prefix(3).map { $0.formattedString }
                    self.notifyListeners("final", data: ["text": text, "alts": alts])
                } else {
                    self.notifyListeners("partial", data: ["text": text])
                }
            }
            if error != nil || (result?.isFinal ?? false) {
                // Session ended (pause, 1-minute cap, or a transient error) — keep reading going.
                DispatchQueue.main.async {
                    if self.wanted && !self.suspended { try? self.begin() } else { self.end() }
                }
            }
        }
        emitState("listening")
    }

    private func end() {
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        task = nil
        request = nil
    }

    private var lastLevelAt = Date.distantPast
    private func emitLevel(_ buffer: AVAudioPCMBuffer) {
        let now = Date()
        guard now.timeIntervalSince(lastLevelAt) > 0.08, let ch = buffer.floatChannelData?[0] else { return }
        lastLevelAt = now
        let n = Int(buffer.frameLength)
        guard n > 0 else { return }
        var sum: Float = 0
        for i in 0..<n { sum += ch[i] * ch[i] }
        let rms = sqrt(sum / Float(n))
        notifyListeners("level", data: ["level": Double(min(1, rms * 8))])
    }

    private func emitState(_ s: String) { notifyListeners("state", data: ["state": s, "onDevice": onDevice]) }
    private func emitError(_ code: String, _ message: String) {
        notifyListeners("error", data: ["code": code, "message": message])
    }
}
