package com.plajah.app.telecom

import android.os.Build
import android.telecom.Call
import android.telecom.CallAudioState
import android.telecom.VideoProfile
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import java.util.concurrent.ConcurrentHashMap

/**
 * Live carrier calls handed to Plajah by Telecom while it is the default dialer.
 * [PlajahInCallService] fills it; [PlajahTelecomPlugin] reads it and drives the calls; both
 * the plugin (JS events) and [CallNotifications] are told on every change.
 */
object CallRegistry {
    private val calls = ConcurrentHashMap<String, Call>()
    private val ids = ConcurrentHashMap<Call, String>()
    private val connectedAt = ConcurrentHashMap<String, Long>()
    private var seq = 0

    @Volatile var service: PlajahInCallService? = null
    @Volatile var audioState: CallAudioState? = null

    @Synchronized
    fun add(call: Call): String {
        ids[call]?.let { return it }
        val id = "c${System.currentTimeMillis()}_${seq++}"
        calls[id] = call
        ids[call] = id
        return id
    }

    fun remove(call: Call): String? {
        val id = ids.remove(call) ?: return null
        calls.remove(id)
        connectedAt.remove(id)
        return id
    }

    fun get(id: String?): Call? = id?.let { calls[it] } ?: calls.values.firstOrNull()
    fun idOf(call: Call): String? = ids[call]
    fun all(): List<Pair<String, Call>> = calls.entries.map { it.key to it.value }

    fun markConnected(id: String) { connectedAt.putIfAbsent(id, System.currentTimeMillis()) }

    fun stateName(state: Int): String = when (state) {
        Call.STATE_NEW -> "new"
        Call.STATE_DIALING -> "dialing"
        Call.STATE_CONNECTING -> "connecting"
        Call.STATE_RINGING -> "ringing"
        Call.STATE_ACTIVE -> "active"
        Call.STATE_HOLDING -> "holding"
        Call.STATE_DISCONNECTING -> "disconnecting"
        Call.STATE_DISCONNECTED -> "disconnected"
        Call.STATE_SELECT_PHONE_ACCOUNT -> "selectAccount"
        Call.STATE_PULLING_CALL -> "pulling"
        else -> "unknown"
    }

    @Suppress("DEPRECATION")
    fun callState(call: Call): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) call.details.state else call.state

    fun toJson(id: String, call: Call): JSObject {
        val d = call.details
        val number = d.handle?.schemeSpecificPart ?: ""
        val o = JSObject()
        o.put("id", id)
        o.put("number", number)
        o.put("name", d.callerDisplayName ?: d.contactDisplayName ?: "")
        o.put("state", stateName(callState(call)))
        o.put("incoming", d.callDirection == Call.Details.DIRECTION_INCOMING)
        o.put("conference", d.hasProperty(Call.Details.PROPERTY_CONFERENCE))
        o.put("canHold", d.can(Call.Details.CAPABILITY_HOLD))
        o.put("canMerge", d.can(Call.Details.CAPABILITY_MERGE_CONFERENCE))
        o.put("video", VideoProfile.isVideo(d.videoState))
        connectedAt[id]?.let { o.put("connectedAt", it) }
        d.disconnectCause?.let { cause ->
            if (callState(call) == Call.STATE_DISCONNECTED) o.put("disconnectReason", cause.reason ?: cause.label?.toString() ?: "")
        }
        return o
    }

    fun snapshot(): JSObject {
        val list = JSArray()
        all().forEach { (id, c) -> list.put(toJson(id, c)) }
        val o = JSObject()
        o.put("calls", list)
        audioState?.let { a ->
            o.put("muted", a.isMuted)
            o.put("route", routeName(a.route))
            val routes = JSArray()
            listOf(CallAudioState.ROUTE_EARPIECE, CallAudioState.ROUTE_SPEAKER, CallAudioState.ROUTE_BLUETOOTH, CallAudioState.ROUTE_WIRED_HEADSET)
                .filter { a.supportedRouteMask and it != 0 }.forEach { routes.put(routeName(it)) }
            o.put("routes", routes)
        }
        return o
    }

    fun routeName(route: Int): String = when (route) {
        CallAudioState.ROUTE_EARPIECE -> "earpiece"
        CallAudioState.ROUTE_SPEAKER -> "speaker"
        CallAudioState.ROUTE_BLUETOOTH -> "bluetooth"
        CallAudioState.ROUTE_WIRED_HEADSET -> "wired"
        else -> "earpiece"
    }

    fun routeValue(name: String): Int = when (name) {
        "speaker" -> CallAudioState.ROUTE_SPEAKER
        "bluetooth" -> CallAudioState.ROUTE_BLUETOOTH
        "wired" -> CallAudioState.ROUTE_WIRED_HEADSET
        else -> CallAudioState.ROUTE_WIRED_OR_EARPIECE
    }

    /** Push the current call list to JS and refresh the notification. */
    fun changed() {
        PlajahTelecomPlugin.instance?.emitCalls(snapshot())
        service?.let { CallNotifications.refresh(it) }
    }
}
