package com.plajah.app.telecom

import android.telecom.Call
import android.telecom.CallAudioState
import android.telecom.InCallService

/**
 * Bound by Telecom while Plajah holds ROLE_DIALER. Every carrier call (incoming and outgoing)
 * arrives here; the UI is the web PhoneHub in-call screen (MainActivity, /?view=phone) with a
 * CallStyle notification as the always-available fallback (lock screen, heads-up, Bluetooth-less
 * answer/decline). Ringing is left to Telecom (no IN_CALL_SERVICE_RINGING meta-data), so the
 * user's own ringtone + vibration settings apply.
 */
class PlajahInCallService : InCallService() {

    private val callback = object : Call.Callback() {
        override fun onStateChanged(call: Call, state: Int) {
            val id = CallRegistry.idOf(call) ?: return
            if (state == Call.STATE_ACTIVE) CallRegistry.markConnected(id)
            CallRegistry.changed()
        }
        override fun onDetailsChanged(call: Call, details: Call.Details) = CallRegistry.changed()
        override fun onConferenceableCallsChanged(call: Call, calls: MutableList<Call>) = CallRegistry.changed()
    }

    override fun onCreate() {
        super.onCreate()
        CallRegistry.service = this
    }

    override fun onDestroy() {
        if (CallRegistry.service === this) CallRegistry.service = null
        super.onDestroy()
    }

    override fun onCallAdded(call: Call) {
        super.onCallAdded(call)
        val id = CallRegistry.add(call)
        call.registerCallback(callback)
        if (CallRegistry.callState(call) == Call.STATE_ACTIVE) CallRegistry.markConnected(id)
        CallRegistry.changed()
        // Outgoing calls open the in-call screen straight away; incoming ones go through the
        // full-screen notification so a locked phone rings properly instead of popping UI.
        if (CallRegistry.callState(call) != Call.STATE_RINGING) CallNotifications.openInCallUi(this, id)
    }

    override fun onCallRemoved(call: Call) {
        super.onCallRemoved(call)
        call.unregisterCallback(callback)
        val summary = CallRegistry.toJsonSafe(call)
        val id = CallRegistry.remove(call)
        PlajahTelecomPlugin.instance?.emitEnded(id ?: "", summary)
        CallRegistry.changed()
    }

    @Deprecated("Deprecated in API 34; still the only audio-state hook below it")
    override fun onCallAudioStateChanged(audioState: CallAudioState) {
        CallRegistry.audioState = audioState
        CallRegistry.changed()
    }
}

/** toJson for a call that has already left the registry (end-of-call summary). */
fun CallRegistry.toJsonSafe(call: Call) = try { toJson(idOf(call) ?: "", call) } catch (_: Exception) { null }
