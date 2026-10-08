package com.plajah.app.speakers

import android.content.Context
import android.util.Log
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PluginCall
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * "Play on" without Google Play Services' Cast sender module.
 *
 * Google TV / Android TV ships the Cast RECEIVER, not the sender framework, so CastContext throws
 * ModuleUnavailableException ("com.google.android.gms.cast.framework.dynamite") there. This engine
 * speaks CASTV2 directly: [CastDiscovery] finds receivers (multi-room groups included — each group
 * is its own receiver on the leader's 32xxx port), and a [CastChannel] per session drives the
 * Default Media Receiver (CC1AD845) exactly as the Cast SDK would:
 *
 *   connect → CONNECT receiver-0 → GET_STATUS → LAUNCH CC1AD845 (or join it if already running)
 *   → RECEIVER_STATUS gives transportId → CONNECT transportId → media LOAD / PLAY / PAUSE / SEEK
 *
 * It produces the same JSON as the CastContext path in PlajahSpeakersPlugin, so the JS contract
 * (services/speakerGroupsBridge.ts, services/speakerGroupsSync.ts) is identical.
 *
 * All state lives on one scheduled thread ([state]); blocking sockets run on [net].
 */
class DirectCastEngine(context: Context, private val sink: Sink) {

    interface Sink {
        fun routesChanged(payload: JSObject)
        fun sessionChanged(payload: JSObject)
        fun mediaStatus(payload: JSObject)
    }

    private val state = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "PlajahCastState").apply { isDaemon = true } }
    private val net = Executors.newCachedThreadPool { r -> Thread(r, "PlajahCastNet").apply { isDaemon = true } }
    private val discovery = CastDiscovery(context.applicationContext, state, net) { emitRoutes() }
    private val requestIds = AtomicInteger(1)
    private var warmed = false

    // ── session state (state thread only) ────────────────────────────────────────────────────
    private var generation = 0
    private var device: CastDeviceInfo? = null
    private var channel: CastChannel? = null
    /** "idle" | "starting" | "started" | "suspended" | "resuming" */
    private var phase = "idle"
    private var launchRequested = false
    private var appSessionId: String? = null
    private var transportId: String? = null
    private var receiverVolume = 1.0
    private var receiverMuted = false
    private var reconnectAttempts = 0
    private var heartbeat: ScheduledFuture<*>? = null
    private var ticker: ScheduledFuture<*>? = null
    private var launchTimeout: ScheduledFuture<*>? = null
    private var reconnectTask: ScheduledFuture<*>? = null
    private var pendingLoad: PluginCall? = null
    private val pendingRequests = HashMap<Int, PluginCall>()

    // media snapshot
    private var mediaSessionId: Int? = null
    private var playerState = "idle"
    private var idleReason = "none"
    private var currentTimeSec = 0.0
    private var playbackRate = 1.0
    private var statusAt = 0L
    private var durationSec = 0.0
    private var contentId = ""
    private var streamVolume = 1.0
    private var streamMuted = false
    private var haveMedia = false

    // ── public API (any thread) ──────────────────────────────────────────────────────────────

    /** Short background scan so listRoutes() has something before the picker ever opens. */
    fun warmUp() = state.execute {
        if (warmed) return@execute
        warmed = true
        discovery.start(WARMUP_SCAN_MS)
    }

    fun startDiscovery(call: PluginCall) {
        warmed = true
        discovery.start()
        state.execute { call.resolve(JSObject().put("routes", routesJson())) }
    }

    fun stopDiscovery(call: PluginCall) { discovery.stop(); call.resolve() }

    fun listRoutes(call: PluginCall) = state.execute { call.resolve(JSObject().put("routes", routesJson())) }

    fun getState(call: PluginCall) = state.execute {
        val o = sessionJson("current")
        if (haveMedia && phase == "started") o.put("media", mediaJson())
        call.resolve(o)
    }

    fun selectRoute(call: PluginCall, id: String) = state.execute {
        val dev = discovery.find(id)
        if (dev == null) { call.reject("route not found"); return@execute }
        if (device?.id == dev.id && phase != "idle") {
            call.resolve(JSObject().put("id", dev.id).put("name", dev.name)); return@execute
        }
        // Switching speaker → speaker: end the old session (and stop the old room) first.
        if (device != null) endSession(stopReceiver = true)
        generation++
        device = dev
        phase = "starting"
        launchRequested = false
        reconnectAttempts = 0
        resetMedia()
        emitSession("starting")
        val gen = generation
        launchTimeout = state.schedule(Runnable {
            if (gen == generation && phase == "starting") { Log.w(TAG, "launch timed out on ${dev.name}"); failSession() }
        }, LAUNCH_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        openChannel(gen, dev)
        call.resolve(JSObject().put("id", dev.id).put("name", dev.name))
    }

    fun deselect(call: PluginCall) = state.execute {
        if (device != null) {
            emitSession("ending")
            endSession(stopReceiver = true)
        }
        call.resolve()
    }

    fun loadMedia(call: PluginCall) = state.execute {
        when (phase) {
            "started" -> sendLoad(call)
            "starting", "resuming", "suspended" -> {
                pendingLoad?.reject("superseded by a newer load")
                pendingLoad = call
            }
            else -> call.reject("no active cast session")
        }
    }

    fun play(call: PluginCall) = mediaCommand(call, "PLAY")
    fun pause(call: PluginCall) = mediaCommand(call, "PAUSE")
    fun stop(call: PluginCall) = mediaCommand(call, "STOP")

    fun seek(call: PluginCall, positionMs: Long) = mediaCommand(call, "SEEK") { it.put("currentTime", positionMs / 1000.0) }

    fun setVolume(call: PluginCall, level: Double, id: String?) = state.execute {
        val selectedId = device?.id
        if (id != null && !(id == selectedId && phase == "started")) {
            val dev = discovery.find(id)
            if (dev == null) { call.reject("route not found"); return@execute }
            // A speaker that isn't the active session: a short-lived control connection.
            net.execute {
                try {
                    val ch = CastChannel(dev.host, dev.port, NOOP_LISTENER)
                    ch.open()
                    ch.send(CastChannel.NS_CONNECTION, CastChannel.RECEIVER_ID, connectPayload())
                    ch.send(CastChannel.NS_RECEIVER, CastChannel.RECEIVER_ID, JSONObject()
                        .put("type", "SET_VOLUME").put("requestId", requestIds.getAndIncrement())
                        .put("volume", JSONObject().put("level", level)))
                    Thread.sleep(250)
                    ch.send(CastChannel.NS_CONNECTION, CastChannel.RECEIVER_ID, JSONObject().put("type", "CLOSE"))
                    ch.close()
                    call.resolve(JSObject().put("level", level))
                } catch (t: Throwable) {
                    call.reject("volume failed: ${t.message ?: t.javaClass.simpleName}")
                }
            }
            return@execute
        }
        val ch = channel
        if (phase != "started" || ch == null) { call.reject("no active cast session"); return@execute }
        ch.send(CastChannel.NS_RECEIVER, CastChannel.RECEIVER_ID, JSONObject()
            .put("type", "SET_VOLUME").put("requestId", requestIds.getAndIncrement())
            .put("volume", JSONObject().put("level", level)))
        receiverVolume = level
        call.resolve(JSObject().put("level", level))
    }

    /** Activity going away: drop sockets but leave the receiver playing (as a Cast sender would). */
    fun destroy() {
        try {
            state.execute {
                discovery.stop()
                endSession(stopReceiver = false, emit = false)
            }
            state.schedule(Runnable { state.shutdown(); net.shutdownNow() }, 500, TimeUnit.MILLISECONDS)
        } catch (_: Throwable) { }
    }

    // ── internals ────────────────────────────────────────────────────────────────────────────

    private fun connectPayload() = JSONObject().put("type", "CONNECT").put("origin", JSONObject())
        .put("userAgent", "Plajah Android")

    private fun openChannel(gen: Int, dev: CastDeviceInfo) {
        net.execute {
            val ch = CastChannel(dev.host, dev.port, channelListener(gen))
            try {
                ch.open()
            } catch (t: Throwable) {
                Log.w(TAG, "connect ${dev.name} (${dev.host}:${dev.port}) failed: ${t.message}")
                state.execute {
                    if (gen != generation) return@execute
                    if (phase == "resuming") scheduleReconnect() else failSession()
                }
                return@execute
            }
            state.execute {
                if (gen != generation) { ch.close(); return@execute }
                channel = ch
                ch.send(CastChannel.NS_CONNECTION, CastChannel.RECEIVER_ID, connectPayload())
                ch.send(CastChannel.NS_RECEIVER, CastChannel.RECEIVER_ID,
                    JSONObject().put("type", "GET_STATUS").put("requestId", requestIds.getAndIncrement()))
                startHeartbeat(gen)
            }
        }
    }

    private fun channelListener(gen: Int) = object : CastChannel.Listener {
        override fun onMessage(channel: CastChannel, namespace: String, sourceId: String, payload: JSONObject) {
            state.execute { if (gen == generation && channel === this@DirectCastEngine.channel) handleMessage(channel, namespace, sourceId, payload) }
        }
        override fun onClosed(channel: CastChannel, error: String?) {
            state.execute { if (gen == generation && channel === this@DirectCastEngine.channel) onChannelLost(error) }
        }
    }

    private fun handleMessage(ch: CastChannel, ns: String, source: String, msg: JSONObject) {
        val type = msg.optString("type")
        when (ns) {
            CastChannel.NS_HEARTBEAT -> if (type == "PING") ch.send(CastChannel.NS_HEARTBEAT, source, JSONObject().put("type", "PONG"))
            CastChannel.NS_CONNECTION -> if (type == "CLOSE") {
                // The receiver app (transportId) or the device itself hung up on us.
                if (source == transportId || source == CastChannel.RECEIVER_ID) {
                    Log.i(TAG, "receiver closed virtual connection from $source")
                    if (source == transportId) endSession(stopReceiver = false) else onChannelLost("receiver closed")
                }
            }
            CastChannel.NS_RECEIVER -> when (type) {
                "RECEIVER_STATUS" -> handleReceiverStatus(ch, msg.optJSONObject("status") ?: JSONObject())
                "LAUNCH_ERROR", "INVALID_REQUEST" -> if (phase == "starting") {
                    Log.w(TAG, "launch failed: $msg"); failSession()
                }
            }
            CastChannel.NS_MEDIA -> when (type) {
                "MEDIA_STATUS" -> handleMediaStatus(msg)
                "LOAD_FAILED", "LOAD_CANCELLED", "INVALID_REQUEST", "INVALID_PLAYER_STATE", "ERROR" -> {
                    val rid = msg.optInt("requestId", 0)
                    pendingRequests.remove(rid)?.reject("load failed: $type ${msg.optString("reason")}".trim())
                }
            }
        }
    }

    private fun handleReceiverStatus(ch: CastChannel, status: JSONObject) {
        status.optJSONObject("volume")?.let { v ->
            val lvl = v.optDouble("level", receiverVolume)
            val mute = v.optBoolean("muted", receiverMuted)
            val changed = lvl != receiverVolume || mute != receiverMuted
            receiverVolume = lvl; receiverMuted = mute
            if (changed && phase == "started") emitSession("current")
        }
        val apps = status.optJSONArray("applications") ?: JSONArray()
        var app: JSONObject? = null
        for (i in 0 until apps.length()) {
            val a = apps.optJSONObject(i) ?: continue
            if (a.optString("appId") == RECEIVER_APP_ID) { app = a; break }
        }
        when (phase) {
            "starting" -> when {
                app != null && app.optString("transportId").isNotEmpty() ->
                    attachTransport(ch, app.optString("transportId"), app.optString("sessionId"))
                !launchRequested -> {
                    launchRequested = true
                    ch.send(CastChannel.NS_RECEIVER, CastChannel.RECEIVER_ID, JSONObject()
                        .put("type", "LAUNCH").put("appId", RECEIVER_APP_ID).put("requestId", requestIds.getAndIncrement()))
                }
            }
            "resuming" -> {
                if (app != null && app.optString("sessionId") == appSessionId) {
                    attachTransport(ch, app.optString("transportId"), app.optString("sessionId"))
                } else endSession(stopReceiver = false)  // someone else took the speaker meanwhile
            }
            "started" -> {
                if (app == null || app.optString("sessionId") != appSessionId) {
                    Log.i(TAG, "our receiver app is gone (another sender took over or it was stopped)")
                    endSession(stopReceiver = false)
                }
            }
        }
    }

    private fun attachTransport(ch: CastChannel, tid: String, sid: String) {
        transportId = tid
        appSessionId = sid
        ch.send(CastChannel.NS_CONNECTION, tid, connectPayload())
        ch.send(CastChannel.NS_MEDIA, tid, JSONObject().put("type", "GET_STATUS").put("requestId", requestIds.getAndIncrement()))
        launchTimeout?.cancel(false); launchTimeout = null
        reconnectAttempts = 0
        phase = "started"
        emitSession("started")
        startTicker()
        pendingLoad?.let { pendingLoad = null; sendLoad(it) }
    }

    private fun sendLoad(call: PluginCall) {
        val ch = channel
        val tid = transportId
        if (ch == null || tid == null) { call.reject("no active cast session"); return }
        val url = call.getString("url") ?: run { call.reject("url required"); return }
        val isLive = call.getBoolean("isLive", false) == true
        val meta = JSONObject().put("metadataType", 3).put("type", 3)
        call.getString("title")?.let { meta.put("title", it) }
        call.getString("artist")?.let { meta.put("artist", it) }
        call.getString("album")?.let { meta.put("albumName", it) }
        call.getString("artworkUrl")?.takeIf { it.startsWith("http") }?.let {
            meta.put("images", JSONArray().put(JSONObject().put("url", it)))
        }
        val media = JSONObject()
            .put("contentId", url)
            .put("contentUrl", url)
            .put("contentType", call.getString("contentType") ?: "audio/mpeg")
            .put("streamType", if (isLive) "LIVE" else "BUFFERED")
            .put("metadata", meta)
        val startSec = ((call.getDouble("startTimeMs") ?: 0.0).coerceAtLeast(0.0)) / 1000.0
        val rid = requestIds.getAndIncrement()
        val load = JSONObject()
            .put("type", "LOAD")
            .put("requestId", rid)
            .put("sessionId", appSessionId)
            .put("media", media)
            .put("autoplay", call.getBoolean("autoplay", true) != false)
            .put("currentTime", if (isLive) 0.0 else startSec)
        contentId = url
        durationSec = 0.0
        pendingRequests[rid] = call
        state.schedule(Runnable { pendingRequests.remove(rid)?.reject("load timed out") }, LOAD_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        if (!ch.send(CastChannel.NS_MEDIA, tid, load)) pendingRequests.remove(rid)?.reject("send failed")
    }

    private fun mediaCommand(call: PluginCall, type: String, extra: (JSONObject) -> Unit = {}) = state.execute {
        val ch = channel
        val tid = transportId
        if (phase != "started" || ch == null || tid == null) { call.reject("no active cast session"); return@execute }
        val msid = mediaSessionId
        if (msid == null) { call.resolve(); return@execute } // nothing loaded — a no-op, like RemoteMediaClient
        val msg = JSONObject().put("type", type).put("mediaSessionId", msid).put("requestId", requestIds.getAndIncrement())
        extra(msg)
        ch.send(CastChannel.NS_MEDIA, tid, msg)
        call.resolve()
    }

    private fun handleMediaStatus(msg: JSONObject) {
        val rid = msg.optInt("requestId", 0)
        val arr = msg.optJSONArray("status") ?: JSONArray()
        val s = if (arr.length() > 0) arr.optJSONObject(0) else null
        if (s == null) {
            // No media session on the receiver (nothing loaded, or it was torn down after ending).
            if (haveMedia && playerState != "idle") {
                playerState = "idle"; idleReason = "none"; statusAt = System.currentTimeMillis()
                emitMedia()
            }
            mediaSessionId = null
        } else {
            val msid = s.optInt("mediaSessionId", -1)
            if (msid >= 0) {
                if (mediaSessionId != null && mediaSessionId != msid) durationSec = 0.0
                mediaSessionId = msid
            }
            playerState = when (s.optString("playerState")) {
                "PLAYING" -> "playing"
                "PAUSED" -> "paused"
                "BUFFERING", "LOADING" -> "buffering"
                "IDLE" -> "idle"
                else -> "unknown"
            }
            idleReason = if (playerState == "idle") when (s.optString("idleReason")) {
                "FINISHED" -> "finished"
                "CANCELLED" -> "canceled"
                "INTERRUPTED" -> "interrupted"
                "ERROR" -> "error"
                else -> "none"
            } else "none"
            if (s.has("currentTime")) currentTimeSec = s.optDouble("currentTime", currentTimeSec)
            playbackRate = s.optDouble("playbackRate", 1.0)
            statusAt = System.currentTimeMillis()
            s.optJSONObject("volume")?.let { v ->
                streamVolume = v.optDouble("level", streamVolume); streamMuted = v.optBoolean("muted", streamMuted)
            }
            s.optJSONObject("media")?.let { m ->
                m.optString("contentId").takeIf { it.isNotEmpty() }?.let { contentId = it }
                val d = m.optDouble("duration", Double.NaN)
                if (!d.isNaN() && d > 0) durationSec = d
            }
            haveMedia = true
            emitMedia()
        }
        if (rid > 0) pendingRequests.remove(rid)?.resolve()
    }

    private fun startHeartbeat(gen: Int) {
        heartbeat?.cancel(false)
        heartbeat = state.scheduleWithFixedDelay(Runnable {
            if (gen != generation) return@Runnable
            val ch = channel ?: return@Runnable
            if (System.currentTimeMillis() - ch.lastInboundAt > DEAD_AFTER_MS) {
                Log.w(TAG, "heartbeat lost — closing channel")
                ch.close() // onClosed → onChannelLost
                return@Runnable
            }
            ch.send(CastChannel.NS_HEARTBEAT, CastChannel.RECEIVER_ID, JSONObject().put("type", "PING"))
        }, HEARTBEAT_MS, HEARTBEAT_MS, TimeUnit.MILLISECONDS)
    }

    /** 1 s progress updates while playing — the CastContext path's ProgressListener equivalent. */
    private fun startTicker() {
        ticker?.cancel(false)
        ticker = state.scheduleWithFixedDelay(Runnable {
            if (phase == "started" && haveMedia && playerState == "playing") emitMedia()
        }, 1000, 1000, TimeUnit.MILLISECONDS)
    }

    private fun onChannelLost(error: String?) {
        Log.w(TAG, "channel lost (${error ?: "closed"}) in phase $phase")
        channel = null
        transportId = null
        heartbeat?.cancel(false); heartbeat = null
        when (phase) {
            "started" -> { phase = "suspended"; emitSession("suspended"); scheduleReconnect() }
            "resuming", "suspended" -> scheduleReconnect()
            "starting" -> failSession()
        }
    }

    private fun scheduleReconnect() {
        val dev = device ?: return
        if (reconnectAttempts >= MAX_RECONNECTS) { endSession(stopReceiver = false); return }
        val delay = 2000L shl reconnectAttempts
        reconnectAttempts++
        val gen = generation
        reconnectTask?.cancel(false)
        reconnectTask = state.schedule(Runnable {
            if (gen != generation || device == null) return@Runnable
            // The group leader can move to another speaker (new host/port): prefer fresh discovery.
            val target = discovery.find(dev.id) ?: dev
            device = target
            phase = "resuming"
            emitSession("resuming")
            openChannel(gen, target)
        }, delay, TimeUnit.MILLISECONDS)
        if (!discovery.active) discovery.start(WARMUP_SCAN_MS)
    }

    private fun failSession() {
        endSession(stopReceiver = false, finalState = "failed")
    }

    /** Tear down the current session. Sends STOP to the receiver app when [stopReceiver]. */
    private fun endSession(stopReceiver: Boolean, finalState: String = "ended", emit: Boolean = true) {
        generation++
        heartbeat?.cancel(false); heartbeat = null
        ticker?.cancel(false); ticker = null
        launchTimeout?.cancel(false); launchTimeout = null
        reconnectTask?.cancel(false); reconnectTask = null
        pendingLoad?.reject("session ended"); pendingLoad = null
        pendingRequests.values.forEach { try { it.reject("session ended") } catch (_: Throwable) { } }
        pendingRequests.clear()
        val ch = channel
        channel = null
        if (ch != null) {
            val sid = appSessionId
            val tid = transportId
            net.execute {
                try {
                    if (stopReceiver && sid != null) ch.send(CastChannel.NS_RECEIVER, CastChannel.RECEIVER_ID, JSONObject()
                        .put("type", "STOP").put("sessionId", sid).put("requestId", requestIds.getAndIncrement()))
                    if (tid != null) ch.send(CastChannel.NS_CONNECTION, tid, JSONObject().put("type", "CLOSE"))
                    ch.send(CastChannel.NS_CONNECTION, CastChannel.RECEIVER_ID, JSONObject().put("type", "CLOSE"))
                } finally { ch.close() }
            }
        }
        device = null
        phase = "idle"
        launchRequested = false
        appSessionId = null
        transportId = null
        resetMedia()
        if (emit) emitSession(finalState)
    }

    private fun resetMedia() {
        mediaSessionId = null; playerState = "idle"; idleReason = "none"; currentTimeSec = 0.0
        durationSec = 0.0; contentId = ""; haveMedia = false; statusAt = 0L
    }

    // ── JSON (same shapes as the CastContext path) ───────────────────────────────────────────

    private fun selectedId(): String? = device?.id?.takeIf { phase != "idle" }

    private fun routesJson(): JSArray {
        val arr = JSArray()
        val sel = selectedId()
        discovery.list()
            .sortedWith(compareByDescending<CastDeviceInfo> { it.isGroup }.thenBy { it.name.lowercase() })
            .forEach { d ->
                val selected = d.id == sel
                arr.put(JSObject()
                    .put("id", d.id)
                    .put("name", d.name)
                    .put("description", d.model)
                    .put("isGroup", d.isGroup)
                    .put("isSelected", selected)
                    .put("volume", if (selected && phase == "started") receiverVolume else JSObject.NULL)
                    .put("volumeFixed", false)
                    .put("deviceType", d.deviceType))
            }
        return arr
    }

    private fun sessionJson(st: String): JSObject {
        val o = JSObject().put("state", st).put("connected", phase == "started" && channel?.isOpen == true)
        val d = device
        if (d != null && phase != "idle") {
            o.put("deviceName", d.name)
            o.put("volume", receiverVolume)
            o.put("routeId", d.id)
            o.put("isGroup", d.isGroup)
        }
        return o
    }

    private fun mediaJson(): JSObject {
        var posSec = currentTimeSec
        if (playerState == "playing" && statusAt > 0) posSec += (System.currentTimeMillis() - statusAt) / 1000.0 * playbackRate
        if (durationSec > 0) posSec = posSec.coerceAtMost(durationSec)
        return JSObject()
            .put("playerState", playerState)
            .put("idleReason", idleReason)
            .put("positionMs", (posSec * 1000).toLong())
            .put("durationMs", (durationSec * 1000).toLong())
            .put("contentId", contentId)
            .put("volume", streamVolume)
            .put("muted", streamMuted)
    }

    private fun emitRoutes() = sink.routesChanged(JSObject().put("routes", routesJson()))
    private fun emitSession(st: String) { sink.sessionChanged(sessionJson(st)); emitRoutes() }
    private fun emitMedia() = sink.mediaStatus(mediaJson())

    companion object {
        private const val TAG = "PlajahDirectCast"
        const val RECEIVER_APP_ID = "CC1AD845"
        private const val WARMUP_SCAN_MS = 15_000L
        private const val LAUNCH_TIMEOUT_MS = 15_000L
        private const val LOAD_TIMEOUT_MS = 20_000L
        private const val HEARTBEAT_MS = 5_000L
        private const val DEAD_AFTER_MS = 20_000L
        private const val MAX_RECONNECTS = 3

        private val NOOP_LISTENER = object : CastChannel.Listener {
            override fun onMessage(channel: CastChannel, namespace: String, sourceId: String, payload: JSONObject) {
                if (namespace == CastChannel.NS_HEARTBEAT && payload.optString("type") == "PING")
                    channel.send(CastChannel.NS_HEARTBEAT, sourceId, JSONObject().put("type", "PONG"))
            }
            override fun onClosed(channel: CastChannel, error: String?) { }
        }
    }
}
