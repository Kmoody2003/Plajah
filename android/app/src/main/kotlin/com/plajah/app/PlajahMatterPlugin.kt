package com.plajah.app

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject

/**
 * PlajahMatter — the WebView end of Matter casting (JS side: services/tv/matterCastingBridge.ts).
 *
 *  - Emits `matterCommand` {cluster, command, payload} for every Matter command the TV's Matter
 *    agent delivers to MatterCommandReceiver. Retained (notifyListeners retain=true), so a command
 *    that arrives before startMatterCasting() subscribes is replayed to the first listener.
 *  - reportPlaybackState({state, positionMs, durationMs, speed}) — JS tells native what is playing
 *    so MediaPlayback attribute reads (CurrentState, SampledPosition, Duration, PlaybackSpeed,
 *    SeekRange*) and command statuses are accurate, and the agent is told when CurrentState
 *    changes so Matter subscribers get a report.
 *  - getStatus() — whether this device has a Matter agent at all, and which vendor id the app
 *    declares (test VID 0xFFF1 until a CSA-assigned one replaces it).
 */
@CapacitorPlugin(name = "PlajahMatter")
class PlajahMatterPlugin : Plugin() {

    override fun load() {
        super.load()
        instance = this
        MatterAgentClient.ensureBound(context)
        // Commands that arrived while the WebView was down (they launched MainActivity).
        val queued = synchronized(pending) { pending.toList().also { pending.clear() } }
        queued.forEach { emit(it) }
    }

    override fun handleOnDestroy() {
        if (instance === this) instance = null
        super.handleOnDestroy()
    }

    internal fun emit(event: JSObject) {
        main.post { notifyListeners(EVENT, event, true) }
    }

    @PluginMethod
    fun reportPlaybackState(call: PluginCall) {
        val s = MatterPlaybackState
        val prevState = s.state
        val prevDuration = s.durationMs
        val prevSpeed = s.speed
        s.state = when (call.getString("state")) {
            "playing" -> 0
            "paused" -> 1
            "buffering" -> 3
            else -> 2
        }
        s.positionMs = (call.getDouble("positionMs") ?: 0.0).toLong().coerceAtLeast(0)
        val d = call.getDouble("durationMs")
        s.durationMs = if (d != null && d > 0 && d.isFinite()) d.toLong() else null
        s.speed = (call.getDouble("speed") ?: if (s.state == 0) 1.0 else 0.0).toFloat()
        s.sampledAtMs = System.currentTimeMillis()
        s.hasReported = true

        // Spec: CurrentState/Duration/PlaybackSpeed changes are reportable; SampledPosition is
        // reported alongside them (not continuously).
        val ctx = context
        if (prevState != s.state) MatterAgentClient.reportAttributeChange(ctx, MatterContract.MEDIA_PLAYBACK, 0x00)
        if (prevDuration != s.durationMs) MatterAgentClient.reportAttributeChange(ctx, MatterContract.MEDIA_PLAYBACK, 0x02)
        if (prevSpeed != s.speed) MatterAgentClient.reportAttributeChange(ctx, MatterContract.MEDIA_PLAYBACK, 0x04)
        if (prevState != s.state || call.getBoolean("seeked", false) == true) {
            MatterAgentClient.reportAttributeChange(ctx, MatterContract.MEDIA_PLAYBACK, 0x03)
        }
        call.resolve()
    }

    /** TargetNavigator.CurrentTarget, when the web layer knows which top-level view is showing. */
    @PluginMethod
    fun reportCurrentTarget(call: PluginCall) {
        val t = call.getInt("target") ?: return call.reject("target required")
        if (MatterContract.TARGETS.none { it.first == t }) return call.reject("unknown target $t")
        if (MatterPlaybackState.currentTarget != t) {
            MatterPlaybackState.currentTarget = t
            MatterAgentClient.reportAttributeChange(context, MatterContract.TARGET_NAVIGATOR, 0x01)
        }
        call.resolve()
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val meta = try {
            context.packageManager.getApplicationInfo(context.packageName, android.content.pm.PackageManager.GET_META_DATA).metaData
        } catch (_: Throwable) { null }
        val vid = meta?.getInt(META_VENDOR_ID, -1) ?: -1
        val pid = meta?.getInt(META_PRODUCT_ID, -1) ?: -1
        call.resolve(JSObject()
            .put("agentPresent", MatterAgentClient.isAgentPresent(context))
            .put("vendorId", vid)
            .put("productId", pid)
            // 0xFFF1-0xFFF4 are the CSA test vendor ids: fine for development, not certifiable.
            .put("testVendorId", vid in 0xFFF1..0xFFF4))
    }

    companion object {
        private const val TAG = "PlajahMatter"
        const val EVENT = "matterCommand"
        private const val META_VENDOR_ID = "com.matter.tv.app.api.vendor_id"
        private const val META_PRODUCT_ID = "com.matter.tv.app.api.product_id"
        private const val MAX_PENDING = 16

        private val main = Handler(Looper.getMainLooper())
        @Volatile internal var instance: PlajahMatterPlugin? = null
        private val pending = ArrayList<JSObject>()

        /** Is a WebView with this plugin loaded right now? */
        fun isLive(): Boolean = instance?.bridge?.webView != null

        /**
         * Hand a command to the web layer.
         *
         * WebView live: emit now, and bring Plajah to the front (a cast to a backgrounded app should
         * surface it). WebView down: queue it for load() and launch MainActivity. When the command is
         * a page to open ([deepLinkUrl], an https://plajah.com URL), it rides MainActivity's existing
         * `platformContentUrl` extra so the WebView's first load IS that page, and is not queued.
         *
         * Android 10+ restricts activity starts from the background; the Matter agent normally
         * launches the app itself (ApplicationLauncher) before sending ContentLauncher commands,
         * but if the start is blocked here the command still waits in the queue for the next launch.
         */
        fun dispatch(context: Context, cluster: String, command: String, payload: JSONObject, deepLinkUrl: String? = null) {
            val event = JSObject().put("cluster", cluster).put("command", command).put("payload", payload)
            val live = instance
            if (live != null && isLive()) {
                live.emit(event)
                bringToFront(context, null)
                return
            }
            if (deepLinkUrl == null) {
                synchronized(pending) {
                    if (pending.size >= MAX_PENDING) pending.removeAt(0)
                    pending.add(event)
                }
            }
            bringToFront(context, deepLinkUrl)
        }

        private fun bringToFront(context: Context, deepLinkUrl: String?) {
            try {
                val i = Intent(context, MainActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                if (deepLinkUrl != null) i.putExtra("platformContentUrl", deepLinkUrl)
                context.startActivity(i)
            } catch (t: Throwable) {
                Log.w(TAG, "Could not bring Plajah to front for Matter command: ${t.message}")
            }
        }
    }
}
