package com.plajah.app

import android.Manifest
import android.content.pm.PackageManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.MediaStoreOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.core.content.ContextCompat
import android.content.ContentValues
import android.provider.MediaStore
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * PlajahCamera — Phase N1 (SCAFFOLD, needs on-device testing before it ships in an APK).
 *
 * Gives the web layer two things the System WebView's getUserMedia cannot:
 *   1. listLenses()      — the real physical cameras (wide / ultrawide / telephoto) via Camera2
 *                          CameraCharacteristics, which the WebView collapses into one "back" camera.
 *   2. startRecording()  — a maximum-quality local MP4 via CameraX VideoCapture at the sensor's
 *                          best QualitySelector profile (UHD → FHD fallback), written to MediaStore.
 *
 * SCOPE / KNOWN LIMIT (see docs/REELLO_NATIVE_CAMERA_PLAN.md): this records LOCALLY at max quality.
 * It does NOT feed the live WebRTC stream — Android grants a physical camera to one client at a
 * time, so this cannot run simultaneously with the WebView's getUserMedia live capture. Feeding a
 * native camera into the live stream is Phase N2 (native libwebrtc). Use this as a "record in max
 * quality (native)" mode, not concurrently with a WebRTC live.
 *
 * BUILD PREREQ (android/app/build.gradle) — add before this compiles:
 *   def camerax = "1.3.4"
 *   implementation "androidx.camera:camera-core:$camerax"
 *   implementation "androidx.camera:camera-camera2:$camerax"
 *   implementation "androidx.camera:camera-lifecycle:$camerax"
 *   implementation "androidx.camera:camera-video:$camerax"
 * Register in MainActivity.onCreate BEFORE super.onCreate: registerPlugin(PlajahCameraPlugin::class.java)
 *
 * Everything is wrapped so a camera failure reports an error to JS rather than crashing the app.
 */
@CapacitorPlugin(
    name = "PlajahCamera",
    permissions = [] // CAMERA / RECORD_AUDIO are already declared in AndroidManifest.xml
)
class PlajahCameraPlugin : Plugin() {

    private var recording: Recording? = null
    private var videoCapture: VideoCapture<Recorder>? = null

    private companion object { const val TAG = "PlajahCamera" }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val hasCamera = context.packageManager?.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY) == true
        call.resolve(JSObject().put("available", hasCamera))
    }

    /**
     * Enumerate the real physical lenses via Camera2. Focal length → lens role so the UI can label
     * "Ultra-wide / Wide / Telephoto". This is the enumeration the WebView cannot do.
     */
    @PluginMethod
    fun listLenses(call: PluginCall) {
        val lenses = JSArray()
        try {
            val cm = context.getSystemService(android.content.Context.CAMERA_SERVICE) as CameraManager
            for (id in cm.cameraIdList) {
                val ch = cm.getCameraCharacteristics(id)
                val facingConst = ch.get(CameraCharacteristics.LENS_FACING)
                val facing = if (facingConst == CameraCharacteristics.LENS_FACING_FRONT) "front" else "back"
                val focals = ch.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS)
                val minFocal = focals?.minOrNull() ?: 0f
                val role = when {
                    minFocal in 0.1f..2.5f -> "ultrawide"
                    minFocal in 2.5f..4.5f -> "wide"
                    minFocal > 4.5f -> "telephoto"
                    else -> "standard"
                }
                lenses.put(
                    JSObject()
                        .put("id", id)
                        .put("facing", facing)
                        .put("role", role)
                        .put("label", "$facing $role")
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "listLenses failed", e)
        }
        call.resolve(JSObject().put("lenses", lenses))
    }

    /** Start a maximum-quality local recording. Runs the CameraX setup on the main thread. */
    @PluginMethod
    fun startRecording(call: PluginCall) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Camera permission not granted"); return
        }
        val maxQuality = call.getBoolean("maxQuality", true) ?: true
        activity.runOnUiThread {
            try {
                val providerFuture = ProcessCameraProvider.getInstance(context)
                providerFuture.addListener({
                    try {
                        val provider = providerFuture.get()
                        val quality = if (maxQuality)
                            QualitySelector.fromOrderedList(listOf(Quality.UHD, Quality.FHD, Quality.HD))
                        else QualitySelector.from(Quality.FHD)
                        val recorder = Recorder.Builder().setQualitySelector(quality).build()
                        val capture = VideoCapture.withOutput(recorder)
                        videoCapture = capture
                        // Note: lensId-specific selection needs a CameraSelector filter on the
                        // physical id (Camera2 interop) — wired in device testing. Default: back.
                        val selector = CameraSelector.DEFAULT_BACK_CAMERA
                        provider.unbindAll()
                        provider.bindToLifecycle(activity as androidx.lifecycle.LifecycleOwner, selector, capture)

                        val name = "plajah-live-${System.currentTimeMillis()}.mp4"
                        val values = ContentValues().apply {
                            put(MediaStore.Video.Media.DISPLAY_NAME, name)
                            put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
                        }
                        val output = MediaStoreOutputOptions
                            .Builder(context.contentResolver, MediaStore.Video.Media.EXTERNAL_CONTENT_URI)
                            .setContentValues(values).build()

                        val hasAudio = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
                        var pending = capture.output.prepareRecording(context, output)
                        if (hasAudio) pending = pending.withAudioEnabled()
                        recording = pending.start(ContextCompat.getMainExecutor(context)) { event ->
                            if (event is VideoRecordEvent.Finalize) {
                                Log.i(TAG, "recording finalized: ${event.outputResults.outputUri}")
                            }
                        }
                        call.resolve(JSObject().put("started", true))
                    } catch (e: Exception) {
                        Log.e(TAG, "startRecording bind failed", e)
                        call.reject("startRecording failed: ${e.message}")
                    }
                }, ContextCompat.getMainExecutor(context))
            } catch (e: Exception) {
                Log.e(TAG, "startRecording failed", e)
                call.reject("startRecording failed: ${e.message}")
            }
        }
    }

    /** Stop and return the recorded file URI. */
    @PluginMethod
    fun stopRecording(call: PluginCall) {
        try {
            val rec = recording
            if (rec == null) { call.reject("Not recording"); return }
            rec.stop()
            recording = null
            // The Finalize event carries the final URI; a production version resolves this call
            // from that callback. Scaffold returns the pending-stop acknowledgement.
            call.resolve(JSObject().put("path", "").put("stopped", true))
        } catch (e: Exception) {
            call.reject("stopRecording failed: ${e.message}")
        }
    }
}
