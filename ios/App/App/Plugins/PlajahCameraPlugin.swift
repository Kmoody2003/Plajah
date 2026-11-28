import Foundation
import AVFoundation
import Photos
import Capacitor

/// PlajahCamera — the real physical lenses + a max-quality local recording, same contract as the
/// Android scaffold (docs/REELLO_NATIVE_CAMERA_PLAN.md):
///
///   listLenses()                 → { lenses: [{ id, facing, role, label }] }
///   startRecording({ lensId?, maxQuality? }) → { started: true }
///   stopRecording()              → { path, stopped: true, savedToPhotos }
///
/// Same known limit as Android: this records LOCALLY and can't run at the same time as the
/// WebView's getUserMedia live capture (one client per camera). Use it as "record in max quality".
@objc(PlajahCameraPlugin)
public class PlajahCameraPlugin: CAPPlugin, CAPBridgedPlugin, AVCaptureFileOutputRecordingDelegate {
    public let identifier = "PlajahCameraPlugin"
    public let jsName = "PlajahCamera"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listLenses", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopRecording", returnType: CAPPluginReturnPromise),
    ]

    private let queue = DispatchQueue(label: "plajah.camera")
    private var session: AVCaptureSession?
    private var output: AVCaptureMovieFileOutput?
    private var stopCall: CAPPluginCall?

    private static let lensTypes: [AVCaptureDevice.DeviceType] = [
        .builtInWideAngleCamera, .builtInUltraWideCamera, .builtInTelephotoCamera,
    ]

    private func devices() -> [AVCaptureDevice] {
        AVCaptureDevice.DiscoverySession(deviceTypes: Self.lensTypes, mediaType: .video, position: .unspecified).devices
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": !devices().isEmpty])
    }

    @objc func listLenses(_ call: CAPPluginCall) {
        let lenses: [[String: Any]] = devices().map { d in
            let facing = d.position == .front ? "front" : "back"
            let role: String
            switch d.deviceType {
            case .builtInUltraWideCamera: role = "ultrawide"
            case .builtInTelephotoCamera: role = "telephoto"
            default: role = "wide"
            }
            return ["id": d.uniqueID, "facing": facing, "role": role, "label": "\(facing) \(role)"]
        }
        call.resolve(["lenses": lenses])
    }

    @objc func startRecording(_ call: CAPPluginCall) {
        AVCaptureDevice.requestAccess(for: .video) { ok in
            guard ok else { call.reject("Camera permission not granted"); return }
            AVCaptureDevice.requestAccess(for: .audio) { _ in
                self.queue.async { self.beginRecording(call) }
            }
        }
    }

    private func beginRecording(_ call: CAPPluginCall) {
        if output?.isRecording == true { call.reject("Already recording"); return }
        let lensId = call.getString("lensId")
        let maxQuality = call.getBool("maxQuality") ?? true
        guard let device = devices().first(where: { $0.uniqueID == lensId })
                ?? AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
            call.reject("No camera"); return
        }
        let s = AVCaptureSession()
        s.beginConfiguration()
        if maxQuality && s.canSetSessionPreset(.hd4K3840x2160) { s.sessionPreset = .hd4K3840x2160 }
        else if s.canSetSessionPreset(.hd1920x1080) { s.sessionPreset = .hd1920x1080 }
        do {
            let vin = try AVCaptureDeviceInput(device: device)
            if s.canAddInput(vin) { s.addInput(vin) }
            if let mic = AVCaptureDevice.default(for: .audio), let ain = try? AVCaptureDeviceInput(device: mic), s.canAddInput(ain) {
                s.addInput(ain)
            }
        } catch {
            call.reject("startRecording failed: \(error.localizedDescription)"); return
        }
        let out = AVCaptureMovieFileOutput()
        guard s.canAddOutput(out) else { call.reject("startRecording failed: no movie output"); return }
        s.addOutput(out)
        if let conn = out.connection(with: .video), out.availableVideoCodecTypes.contains(.hevc) {
            out.setOutputSettings([AVVideoCodecKey: AVVideoCodecType.hevc], for: conn)
        }
        s.commitConfiguration()
        s.startRunning()
        session = s
        output = out
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("Plajah_\(Int(Date().timeIntervalSince1970)).mov")
        out.startRecording(to: url, recordingDelegate: self)
        call.resolve(["started": true])
    }

    @objc func stopRecording(_ call: CAPPluginCall) {
        queue.async {
            guard let out = self.output, out.isRecording else { call.reject("Not recording"); return }
            self.stopCall = call
            out.stopRecording()
        }
    }

    public func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo url: URL,
                           from connections: [AVCaptureConnection], error: Error?) {
        let call = stopCall
        stopCall = nil
        queue.async { self.session?.stopRunning(); self.session = nil; self.output = nil }
        if let error = error, (error as NSError).userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? Bool != true {
            call?.reject("stopRecording failed: \(error.localizedDescription)"); return
        }
        // Android writes to MediaStore; the iOS equivalent is the Photos library.
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                call?.resolve(["path": url.path, "stopped": true, "savedToPhotos": false]); return
            }
            PHPhotoLibrary.shared().performChanges({
                PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url)
            }) { ok, _ in
                call?.resolve(["path": url.path, "stopped": true, "savedToPhotos": ok])
            }
        }
    }
}
