package com.plajah.app

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * PlajahSpeech — native speech recognition for Voca (read-aloud) inside the Android app.
 *
 * Android WebView has no Web Speech API, so the web layer talks to Android's SpeechRecognizer here.
 *  • Prefers ON-DEVICE recognition (createOnDeviceSpeechRecognizer on API 31+, EXTRA_PREFER_OFFLINE
 *    below that) so a child's voice can stay on the phone.
 *  • Continuous reading: the platform ends a session after each pause, so we restart until stop().
 *  • Streams partial results ("partial") and finals with up to 3 alternatives ("final").
 *  • Emits mic level from onRmsChanged ("level") so the web layer never opens a competing
 *    getUserMedia stream on the same microphone.
 *
 * JS:  const S = registerPlugin('PlajahSpeech'); await S.start({ lang: 'en-US' });
 *      S.addListener('partial'|'final'|'level'|'state'|'error', cb); await S.stop();
 */
@CapacitorPlugin(
    name = "PlajahSpeech",
    permissions = [Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microphone")]
)
class PlajahSpeechPlugin : Plugin() {

    companion object { private const val TAG = "PlajahSpeech" }

    private val main = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var active = false
    private var lang = "en-US"
    private var onDevice = false
    private var restarts = ArrayDeque<Long>()

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val ctx = context
        val any = SpeechRecognizer.isRecognitionAvailable(ctx)
        val device = Build.VERSION.SDK_INT >= 33 && SpeechRecognizer.isOnDeviceRecognitionAvailable(ctx)
        call.resolve(JSObject().put("available", any || device).put("onDevice", device))
    }

    @PluginMethod
    fun start(call: PluginCall) {
        lang = call.getString("lang") ?: "en-US"
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "onMicPermission")
            return
        }
        begin(call)
    }

    @PermissionCallback
    private fun onMicPermission(call: PluginCall) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) begin(call)
        else {
            emitError("not-allowed", "Microphone permission is off. Turn it on for Plajah in Android Settings, then try again.")
            call.reject("not-allowed")
        }
    }

    private fun begin(call: PluginCall) {
        main.post {
            active = true
            restarts.clear()
            spawn()
            call.resolve(JSObject().put("onDevice", onDevice))
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        main.post { active = false; destroy(); emitState("idle"); call.resolve() }
    }

    /** Pause listening (e.g. while the coach speaks) without ending the session. */
    @PluginMethod
    fun suspend(call: PluginCall) {
        main.post { destroy(); emitState("suspended"); call.resolve() }
    }

    @PluginMethod
    fun resume(call: PluginCall) {
        main.post { if (active) spawn(); call.resolve() }
    }

    private fun destroy() {
        try { recognizer?.cancel() } catch (_: Exception) {}
        try { recognizer?.destroy() } catch (_: Exception) {}
        recognizer = null
    }

    private fun spawn() {
        if (!active) return
        destroy()
        val ctx = context
        val r: SpeechRecognizer = try {
            if (Build.VERSION.SDK_INT >= 33 && SpeechRecognizer.isOnDeviceRecognitionAvailable(ctx)) {
                onDevice = true; SpeechRecognizer.createOnDeviceSpeechRecognizer(ctx)
            } else {
                onDevice = false; SpeechRecognizer.createSpeechRecognizer(ctx)
            }
        } catch (e: Exception) {
            emitError("unsupported", "Speech recognition is not available on this device."); return
        }
        r.setRecognitionListener(listener)
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
            // children read slowly and pause between words: give them room before the session ends
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2000L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 10000L)
        }
        recognizer = r
        emitState("starting")
        try { r.startListening(intent) } catch (e: Exception) { scheduleRestart() }
    }

    private fun scheduleRestart() {
        if (!active) return
        val now = System.currentTimeMillis()
        while (restarts.isNotEmpty() && now - restarts.first() > 6000) restarts.removeFirst()
        restarts.addLast(now)
        val delay = if (restarts.size > 6) 1500L else 80L     // back off a restart storm
        main.postDelayed({ spawn() }, delay)
    }

    private val listener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) { emitState("listening") }
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {
            // rmsdB ≈ -2..10; map to 0..1 for the web meter
            val level = ((rmsdB + 2f) / 12f).coerceIn(0f, 1f)
            notifyListeners("level", JSObject().put("level", level.toDouble()))
        }
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onPartialResults(partialResults: Bundle?) {
            val list = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) ?: return
            val text = list.firstOrNull() ?: return
            notifyListeners("partial", JSObject().put("text", text))
        }
        override fun onResults(results: Bundle?) {
            val list = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            if (!list.isNullOrEmpty()) {
                val alts = JSArray(); list.drop(1).forEach { alts.put(it) }
                notifyListeners("final", JSObject().put("text", list[0]).put("alts", alts))
            }
            scheduleRestart()
        }
        override fun onError(error: Int) {
            when (error) {
                SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT,
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY, SpeechRecognizer.ERROR_CLIENT -> scheduleRestart()
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> {
                    active = false
                    emitError("not-allowed", "Microphone permission is off. Turn it on for Plajah in Android Settings, then try again.")
                }
                SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT, SpeechRecognizer.ERROR_SERVER -> {
                    Log.w(TAG, "network error $error (onDevice=$onDevice)")
                    if (restarts.size > 4) { active = false; emitError("network", "Listening needs the speech service. Check the internet connection, or download offline speech for English in Android settings.") }
                    else scheduleRestart()
                }
                SpeechRecognizer.ERROR_AUDIO -> {
                    active = false
                    emitError("no-mic", "The microphone could not start. Close other apps using it and try again.")
                }
                else -> scheduleRestart()
            }
        }
        override fun onEvent(eventType: Int, params: Bundle?) {}
    }

    private fun emitState(s: String) = notifyListeners("state", JSObject().put("state", s).put("onDevice", onDevice))
    private fun emitError(code: String, message: String) {
        notifyListeners("error", JSObject().put("code", code).put("message", message))
        emitState("error")
    }

    override fun handleOnDestroy() { active = false; destroy(); super.handleOnDestroy() }
}
