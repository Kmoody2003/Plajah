package com.plajah.app

import android.app.UiModeManager
import android.content.Context
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.mediarouter.media.MediaRouteSelector
import androidx.mediarouter.media.MediaRouter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.gms.cast.CastDevice
import com.google.android.gms.cast.CastMediaControlIntent
import com.google.android.gms.cast.MediaInfo
import com.google.android.gms.cast.MediaLoadRequestData
import com.google.android.gms.cast.MediaMetadata
import com.google.android.gms.cast.MediaSeekOptions
import com.google.android.gms.cast.MediaStatus
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.cast.framework.CastSession
import com.google.android.gms.cast.framework.SessionManagerListener
import com.google.android.gms.cast.framework.media.RemoteMediaClient
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.common.images.WebImage
import com.plajah.app.speakers.DirectCastEngine

/**
 * "Play on" — real Google Cast speaker / speaker-group output for the Android TV and phone shell.
 *
 * The Web Cast sender SDK does not run inside an Android WebView, so the web layer cannot find the
 * house's Nest/Chromecast-built-in speakers on its own. This plugin does it natively: androidx
 * MediaRouter discovers Cast routes for the Default Media Receiver (the same app id as
 * PlajahCastOptionsProvider), multi-room groups included, and CastContext's SessionManager turns a
 * route selection into a CastSession whose RemoteMediaClient plays the stream URL JS hands over.
 *
 * Threading: MediaRouter and CastContext are main-thread-only, while Capacitor dispatches plugin
 * methods on its own handler thread — every touch of either is posted to the main looper.
 *
 * Two engines behind one JS contract:
 *  - CAST: CastContext + MediaRouter (phones/tablets with Play Services' Cast sender module).
 *  - DIRECT: [DirectCastEngine] — NsdManager/mDNS discovery + a hand-rolled CASTV2 socket. Used on
 *    TVs (UI_MODE_TYPE_TELEVISION / leanback) and anywhere CastContext can't initialise. Google TV
 *    ships the Cast receiver but not the sender module, so CastContext throws
 *    ModuleUnavailableException ("cast.framework.dynamite") there; Fire TV has no GMS at all.
 * The engine is chosen once, on first use, on the main thread.
 */
@CapacitorPlugin(name = "PlajahSpeakers")
class PlajahSpeakersPlugin : Plugin() {

    private val main = Handler(Looper.getMainLooper())
    private var router: MediaRouter? = null
    private var castContext: CastContext? = null
    private var initError: String? = null
    private var discovering = false
    private var attachedClient: RemoteMediaClient? = null
    /** null = not decided yet; main thread only. */
    private var useDirect: Boolean? = null
    private var direct: DirectCastEngine? = null

    private val directSink = object : DirectCastEngine.Sink {
        override fun routesChanged(payload: JSObject) = notifyListeners("routesChanged", payload)
        override fun sessionChanged(payload: JSObject) = notifyListeners("sessionChanged", payload)
        override fun mediaStatus(payload: JSObject) = notifyListeners("mediaStatus", payload)
    }

    private val selector: MediaRouteSelector by lazy {
        MediaRouteSelector.Builder()
            .addControlCategory(CastMediaControlIntent.categoryForCast(RECEIVER_APP_ID))
            .build()
    }

    // ── lifecycle ─────────────────────────────────────────────────────────────────────────────

    override fun load() {
        super.load()
        main.post { directEngine() ?: ensureInit() }
    }

    private fun isTelevision(): Boolean = try {
        val ui = context.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
        ui?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION ||
            context.packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
    } catch (_: Throwable) { false }

    /** Main thread only. The direct engine when this device should use it, else null. */
    private fun directEngine(): DirectCastEngine? {
        if (useDirect == null) {
            val tv = isTelevision()
            val d = tv || !ensureInit()
            useDirect = d
            if (d) {
                Log.i(TAG, "Using direct CASTV2 engine (tv=$tv, castContext=${initError ?: "skipped"})")
                direct = DirectCastEngine(context, directSink)
            }
        }
        return if (useDirect == true) direct else null
    }

    override fun handleOnDestroy() {
        main.post {
            direct?.destroy()
            try { router?.removeCallback(routerCallback) } catch (_: Throwable) { }
            try { castContext?.sessionManager?.removeSessionManagerListener(sessionListener, CastSession::class.java) } catch (_: Throwable) { }
            detachClient()
        }
        super.handleOnDestroy()
    }

    /** Main thread only. Returns true when Cast is usable on this device. */
    private fun ensureInit(): Boolean {
        if (castContext != null && router != null) return true
        if (initError != null) return false
        return try {
            val gms = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context)
            if (gms != ConnectionResult.SUCCESS) {
                initError = "Google Play Services unavailable ($gms)"
                return false
            }
            @Suppress("DEPRECATION")
            val cc = CastContext.getSharedInstance(context)
            castContext = cc
            router = MediaRouter.getInstance(context)
            // Passive callback (no discovery flag) so selection/route changes are still reported
            // after the picker closes; startDiscovery() upgrades it to an active scan.
            router?.addCallback(selector, routerCallback, 0)
            cc.sessionManager.addSessionManagerListener(sessionListener, CastSession::class.java)
            cc.sessionManager.currentCastSession?.let { attachClient(it) }
            true
        } catch (t: Throwable) {
            initError = t.message ?: t.javaClass.simpleName
            Log.w(TAG, "Cast unavailable: $initError")
            castContext = null
            router = null
            false
        }
    }

    /** Run [block] on the main thread with Cast initialised; reject the call if unsupported. */
    private fun onMain(call: PluginCall, directBlock: ((DirectCastEngine) -> Unit)? = null, block: () -> Unit) {
        main.post {
            val d = directEngine()
            if (d != null) {
                if (directBlock == null) { call.reject("unsupported on this device"); return@post }
                try { directBlock(d) } catch (t: Throwable) {
                    Log.w(TAG, "${call.methodName} (direct) failed", t)
                    call.reject(t.message ?: "failed")
                }
                return@post
            }
            if (!ensureInit()) { call.reject("unsupported: ${initError ?: "cast unavailable"}"); return@post }
            try { block() } catch (t: Throwable) {
                Log.w(TAG, "${call.methodName} failed", t)
                call.reject(t.message ?: "failed")
            }
        }
    }

    private fun session(): CastSession? = castContext?.sessionManager?.currentCastSession
    private fun client(): RemoteMediaClient? = session()?.remoteMediaClient

    // ── methods ───────────────────────────────────────────────────────────────────────────────

    @PluginMethod
    fun isSupported(call: PluginCall) {
        main.post {
            val d = directEngine()
            if (d != null) {
                d.warmUp()
                call.resolve(JSObject().put("supported", true).put("engine", "direct"))
                return@post
            }
            val ok = ensureInit()
            call.resolve(JSObject().put("supported", ok).put("engine", "cast").apply { if (!ok) put("reason", initError) })
        }
    }

    @PluginMethod
    fun startDiscovery(call: PluginCall) {
        onMain(call, { it.startDiscovery(call) }) {
            val r = router!!
            r.removeCallback(routerCallback)
            // REQUEST_DISCOVERY keeps mDNS browsing on while the picker is open; PERFORM_ACTIVE_SCAN
            // makes freshly powered speakers and groups show up within a second or two.
            r.addCallback(selector, routerCallback,
                MediaRouter.CALLBACK_FLAG_REQUEST_DISCOVERY or MediaRouter.CALLBACK_FLAG_PERFORM_ACTIVE_SCAN)
            discovering = true
            emitRoutes()
            call.resolve(JSObject().put("routes", routesJson()))
        }
    }

    @PluginMethod
    fun stopDiscovery(call: PluginCall) {
        onMain(call, { it.stopDiscovery(call) }) {
            val r = router!!
            r.removeCallback(routerCallback)
            r.addCallback(selector, routerCallback, 0)
            discovering = false
            call.resolve()
        }
    }

    @PluginMethod
    fun listRoutes(call: PluginCall) {
        onMain(call, { it.warmUp(); it.listRoutes(call) }) { call.resolve(JSObject().put("routes", routesJson())) }
    }

    @PluginMethod
    fun getState(call: PluginCall) {
        onMain(call, { it.getState(call) }) {
            val o = sessionJson("current")
            client()?.mediaStatus?.let { o.put("media", mediaStatusJson(it)) }
            call.resolve(o)
        }
    }

    /** Select a Cast route — the SessionManager starts a CastSession on it automatically. */
    @PluginMethod
    fun selectRoute(call: PluginCall) {
        val id = call.getString("id")
        if (id.isNullOrBlank()) { call.reject("id required"); return }
        onMain(call, { it.selectRoute(call, id) }) {
            val r = router!!
            val route = r.routes.firstOrNull { it.id == id }
            if (route == null) { call.reject("route not found"); return@onMain }
            if (!route.isSelected) {
                // Switching speaker → speaker: end the old session first so the old room stops.
                if (session() != null) castContext?.sessionManager?.endCurrentSession(true)
                r.selectRoute(route)
            }
            call.resolve(JSObject().put("id", route.id).put("name", route.name))
        }
    }

    /** Back to "This TV" / "This phone": stop the receiver and select the default route. */
    @PluginMethod
    fun deselect(call: PluginCall) {
        onMain(call, { it.deselect(call) }) {
            castContext?.sessionManager?.endCurrentSession(true)
            val r = router!!
            try { r.selectRoute(r.defaultRoute) } catch (_: Throwable) { }
            call.resolve()
        }
    }

    @PluginMethod
    fun loadMedia(call: PluginCall) {
        val url = call.getString("url")
        if (url.isNullOrBlank()) { call.reject("url required"); return }
        onMain(call, { it.loadMedia(call) }) {
            val rmc = client()
            if (rmc == null) { call.reject("no active cast session"); return@onMain }
            val isLive = call.getBoolean("isLive", false) == true
            val meta = MediaMetadata(MediaMetadata.MEDIA_TYPE_MUSIC_TRACK).apply {
                call.getString("title")?.let { putString(MediaMetadata.KEY_TITLE, it) }
                call.getString("artist")?.let { putString(MediaMetadata.KEY_ARTIST, it) }
                call.getString("album")?.let { putString(MediaMetadata.KEY_ALBUM_TITLE, it) }
                call.getString("artworkUrl")?.takeIf { it.startsWith("http") }?.let { addImage(WebImage(Uri.parse(it))) }
            }
            val info = MediaInfo.Builder(url)
                .setContentUrl(url)
                .setContentType(call.getString("contentType") ?: "audio/mpeg")
                .setStreamType(if (isLive) MediaInfo.STREAM_TYPE_LIVE else MediaInfo.STREAM_TYPE_BUFFERED)
                .setMetadata(meta)
                .build()
            val start = (call.getDouble("startTimeMs") ?: 0.0).toLong().coerceAtLeast(0L)
            val req = MediaLoadRequestData.Builder()
                .setMediaInfo(info)
                .setAutoplay(call.getBoolean("autoplay", true) != false)
                .setCurrentTime(if (isLive) 0L else start)
                .build()
            rmc.load(req).setResultCallback { res ->
                if (res.status.isSuccess) call.resolve()
                else call.reject("load failed: ${res.status.statusCode} ${res.status.statusMessage ?: ""}".trim())
            }
        }
    }

    @PluginMethod fun play(call: PluginCall) = withClient(call, { it.play(call) }) { it.play() }
    @PluginMethod fun pause(call: PluginCall) = withClient(call, { it.pause(call) }) { it.pause() }
    @PluginMethod fun stop(call: PluginCall) = withClient(call, { it.stop(call) }) { it.stop() }

    @PluginMethod
    fun seek(call: PluginCall) {
        val ms = (call.getDouble("positionMs") ?: 0.0).toLong().coerceAtLeast(0L)
        withClient(call, { it.seek(call, ms) }) { it.seek(MediaSeekOptions.Builder().setPosition(ms).build()) }
    }

    /**
     * Volume 0..1. Without an id (or with the session's own route) it sets the cast session's
     * volume — for a group that is the group master volume. With another route's id it nudges
     * that route's volume through MediaRouter, so the picker can adjust a speaker before picking it.
     */
    @PluginMethod
    fun setVolume(call: PluginCall) {
        val level = (call.getDouble("level") ?: 0.5).coerceIn(0.0, 1.0)
        val id = call.getString("id")
        onMain(call, { it.setVolume(call, level, id) }) {
            val r = router!!
            val target = id?.let { rid -> r.routes.firstOrNull { it.id == rid } }
            val s = session()
            if (target != null && !(target.isSelected && s != null)) {
                if (target.volumeHandling == MediaRouter.RouteInfo.PLAYBACK_VOLUME_VARIABLE && target.volumeMax > 0) {
                    target.requestSetVolume(Math.round(level * target.volumeMax).toInt())
                    call.resolve(JSObject().put("level", level))
                } else call.reject("volume fixed on this route")
                return@onMain
            }
            if (s == null) { call.reject("no active cast session"); return@onMain }
            s.volume = level
            call.resolve(JSObject().put("level", level))
        }
    }

    private fun withClient(call: PluginCall, directBlock: (DirectCastEngine) -> Unit, block: (RemoteMediaClient) -> Unit) {
        onMain(call, directBlock) {
            val rmc = client()
            if (rmc == null) { call.reject("no active cast session"); return@onMain }
            block(rmc)
            call.resolve()
        }
    }

    // ── JSON ──────────────────────────────────────────────────────────────────────────────────

    private fun isGroupRoute(route: MediaRouter.RouteInfo): Boolean {
        if (route.deviceType == MediaRouter.RouteInfo.DEVICE_TYPE_GROUP || route.isGroup) return true
        val dev = try { CastDevice.getFromBundle(route.extras) } catch (_: Throwable) { null }
        return dev?.hasCapability(CastDevice.CAPABILITY_MULTIZONE_GROUP) == true
    }

    private fun deviceTypeName(route: MediaRouter.RouteInfo): String = when {
        isGroupRoute(route) -> "group"
        route.deviceType == MediaRouter.RouteInfo.DEVICE_TYPE_TV -> "tv"
        route.deviceType == MediaRouter.RouteInfo.DEVICE_TYPE_SPEAKER -> "speaker"
        route.deviceType == MediaRouter.RouteInfo.DEVICE_TYPE_AUDIO_VIDEO_RECEIVER -> "receiver"
        else -> {
            val dev = try { CastDevice.getFromBundle(route.extras) } catch (_: Throwable) { null }
            when {
                dev?.hasCapability(CastDevice.CAPABILITY_VIDEO_OUT) == true -> "tv"
                dev?.hasCapability(CastDevice.CAPABILITY_AUDIO_OUT) == true -> "speaker"
                else -> "unknown"
            }
        }
    }

    private fun routeJson(route: MediaRouter.RouteInfo): JSObject {
        val max = route.volumeMax
        return JSObject()
            .put("id", route.id)
            .put("name", route.name)
            .put("description", route.description ?: "")
            .put("isGroup", isGroupRoute(route))
            .put("isSelected", route.isSelected)
            .put("volume", if (max > 0) route.volume.toDouble() / max else JSObject.NULL)
            .put("volumeFixed", route.volumeHandling != MediaRouter.RouteInfo.PLAYBACK_VOLUME_VARIABLE)
            .put("deviceType", deviceTypeName(route))
    }

    private fun routesJson(): JSArray {
        val arr = JSArray()
        val r = router ?: return arr
        r.routes
            .filter { !it.isDefaultOrBluetooth && it.isEnabled && it.matchesSelector(selector) }
            .sortedWith(compareByDescending<MediaRouter.RouteInfo> { isGroupRoute(it) }.thenBy { it.name.lowercase() })
            .forEach { arr.put(routeJson(it)) }
        return arr
    }

    private fun sessionJson(state: String): JSObject {
        val s = session()
        val o = JSObject().put("state", state).put("connected", s?.isConnected == true)
        val selected = router?.selectedRoute?.takeIf { !it.isDefaultOrBluetooth && it.matchesSelector(selector) }
        if (s != null) {
            o.put("deviceName", s.castDevice?.friendlyName ?: selected?.name ?: "")
            o.put("volume", try { s.volume } catch (_: Throwable) { 0.0 })
        }
        if (selected != null) {
            o.put("routeId", selected.id)
            o.put("isGroup", isGroupRoute(selected))
        }
        return o
    }

    private fun mediaStatusJson(ms: MediaStatus): JSObject {
        val playerState = when (ms.playerState) {
            MediaStatus.PLAYER_STATE_PLAYING -> "playing"
            MediaStatus.PLAYER_STATE_PAUSED -> "paused"
            MediaStatus.PLAYER_STATE_BUFFERING, MediaStatus.PLAYER_STATE_LOADING -> "buffering"
            MediaStatus.PLAYER_STATE_IDLE -> "idle"
            else -> "unknown"
        }
        val idleReason = when (ms.idleReason) {
            MediaStatus.IDLE_REASON_FINISHED -> "finished"
            MediaStatus.IDLE_REASON_CANCELED -> "canceled"
            MediaStatus.IDLE_REASON_INTERRUPTED -> "interrupted"
            MediaStatus.IDLE_REASON_ERROR -> "error"
            else -> "none"
        }
        val rmc = client()
        return JSObject()
            .put("playerState", playerState)
            .put("idleReason", idleReason)
            .put("positionMs", rmc?.approximateStreamPosition ?: ms.streamPosition)
            .put("durationMs", ms.mediaInfo?.streamDuration ?: 0L)
            .put("contentId", ms.mediaInfo?.contentId ?: "")
            .put("volume", ms.streamVolume)
            .put("muted", ms.isMute)
    }

    private fun emitRoutes() {
        notifyListeners("routesChanged", JSObject().put("routes", routesJson()))
    }

    private fun emitSession(state: String) {
        notifyListeners("sessionChanged", sessionJson(state))
        emitRoutes() // isSelected flips with the session
    }

    // ── callbacks (all delivered on the main thread) ──────────────────────────────────────────

    private val routerCallback = object : MediaRouter.Callback() {
        override fun onRouteAdded(router: MediaRouter, route: MediaRouter.RouteInfo) = emitRoutes()
        override fun onRouteRemoved(router: MediaRouter, route: MediaRouter.RouteInfo) = emitRoutes()
        override fun onRouteChanged(router: MediaRouter, route: MediaRouter.RouteInfo) = emitRoutes()
        override fun onRouteVolumeChanged(router: MediaRouter, route: MediaRouter.RouteInfo) = emitRoutes()
        override fun onRouteSelected(router: MediaRouter, route: MediaRouter.RouteInfo, reason: Int) = emitRoutes()
        override fun onRouteUnselected(router: MediaRouter, route: MediaRouter.RouteInfo, reason: Int) = emitRoutes()
    }

    private val mediaCallback = object : RemoteMediaClient.Callback() {
        override fun onStatusUpdated() {
            client()?.mediaStatus?.let { notifyListeners("mediaStatus", mediaStatusJson(it)) }
        }
    }

    private val progressListener = RemoteMediaClient.ProgressListener { _, _ ->
        client()?.mediaStatus?.let { notifyListeners("mediaStatus", mediaStatusJson(it)) }
    }

    private fun attachClient(s: CastSession) {
        val rmc = s.remoteMediaClient ?: return
        if (rmc === attachedClient) return
        detachClient()
        rmc.registerCallback(mediaCallback)
        rmc.addProgressListener(progressListener, 1000L)
        attachedClient = rmc
    }

    private fun detachClient() {
        attachedClient?.let {
            try { it.unregisterCallback(mediaCallback) } catch (_: Throwable) { }
            try { it.removeProgressListener(progressListener) } catch (_: Throwable) { }
        }
        attachedClient = null
    }

    private val sessionListener = object : SessionManagerListener<CastSession> {
        override fun onSessionStarting(session: CastSession) = emitSession("starting")
        override fun onSessionStarted(session: CastSession, sessionId: String) { attachClient(session); emitSession("started") }
        override fun onSessionStartFailed(session: CastSession, error: Int) = emitSession("failed")
        override fun onSessionEnding(session: CastSession) = emitSession("ending")
        override fun onSessionEnded(session: CastSession, error: Int) { detachClient(); emitSession("ended") }
        override fun onSessionResuming(session: CastSession, sessionId: String) = emitSession("resuming")
        override fun onSessionResumed(session: CastSession, wasSuspended: Boolean) { attachClient(session); emitSession("started") }
        override fun onSessionResumeFailed(session: CastSession, error: Int) = emitSession("failed")
        override fun onSessionSuspended(session: CastSession, reason: Int) = emitSession("suspended")
    }

    companion object {
        private const val TAG = "PlajahSpeakers"
        /** Must match PlajahCastOptionsProvider — Default Media Receiver. */
        private const val RECEIVER_APP_ID = "CC1AD845"
    }
}
