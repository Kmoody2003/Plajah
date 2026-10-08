package com.plajah.app

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.core.content.IntentCompat
import org.json.JSONArray
import org.json.JSONObject

/**
 * Receives Matter commands and attribute reads from the TV's Matter casting agent.
 *
 * Contract (connectedhomeip examples/tv-app/android, platform-app ContentAppAgentService):
 *   action  com.matter.tv.app.api.action.MATTER_COMMAND, sent only by holders of
 *           com.matter.tv.app.api.permission.SEND_DATA (enforced by android:permission on the
 *           <receiver>), addressed to this package.
 *   command EXTRA_CLUSTER_ID (long), EXTRA_COMMAND_ID (long), EXTRA_COMMAND_PAYLOAD (UTF-8 JSON
 *           bytes; the command's TLV fields keyed by field id: {"0": ..., "1": ...}).
 *   read    EXTRA_CLUSTER_ID, EXTRA_ATTRIBUTE_ID, EXTRA_ATTRIBUTE_ACTION = ATTRIBUTE_ACTION_READ.
 *   reply   EXTRA_RESPONSE_PAYLOAD (UTF-8 JSON bytes) sent through the
 *           EXTRA_DIRECTIVE_RESPONSE_PENDING_INTENT. Commands: the response command's fields by id
 *           (e.g. LauncherResponse {"0": status, "1": data}); AccountLogin Login/Logout:
 *           {"Status": n}; a cluster-level failure: {"PlatformError": {"Status": <IM status>}}.
 *           Reads: {"<attributeId>": value}.
 *   The agent waits ~8 s for a command reply and ~2 s for a read, so both are answered here,
 *   synchronously, from validated input and the playback state JS last reported — never by
 *   waiting on the WebView.
 */
class MatterCommandReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != MatterContract.ACTION_MATTER_COMMAND) return
        val clusterId = intent.getLongExtra(MatterContract.EXTRA_CLUSTER_ID, -1)
        val commandId = intent.getLongExtra(MatterContract.EXTRA_COMMAND_ID, -1)
        val response: String = try {
            if (commandId != -1L) {
                val raw = intent.getByteArrayExtra(MatterContract.EXTRA_COMMAND_PAYLOAD)?.toString(Charsets.UTF_8).orEmpty()
                val payload = try { if (raw.isBlank()) JSONObject() else JSONObject(raw) } catch (_: Exception) { JSONObject() }
                Log.i(TAG, "Matter command ${MatterContract.clusterName(clusterId)}/$commandId payload=$raw")
                handleCommand(context, clusterId, commandId, payload)
            } else if (intent.getStringExtra(MatterContract.EXTRA_ATTRIBUTE_ACTION) == MatterContract.ATTRIBUTE_ACTION_READ) {
                val attributeId = intent.getLongExtra(MatterContract.EXTRA_ATTRIBUTE_ID, -1)
                readAttribute(clusterId, attributeId)
            } else {
                Log.w(TAG, "Matter intent with neither command nor attribute read")
                return
            }
        } catch (t: Throwable) {
            Log.e(TAG, "Matter command handling failed", t)
            platformError(MatterContract.IM_FAILURE)
        }
        sendResponse(context, intent, response)
    }

    // ── commands ────────────────────────────────────────────────────────────────────────────

    private fun handleCommand(context: Context, cluster: Long, command: Long, p: JSONObject): String = when (cluster) {
        MatterContract.CONTENT_LAUNCHER -> contentLauncher(context, command, p)
        MatterContract.MEDIA_PLAYBACK -> mediaPlayback(context, command, p)
        MatterContract.KEYPAD_INPUT -> keypadInput(context, command, p)
        MatterContract.TARGET_NAVIGATOR -> targetNavigator(context, command, p)
        MatterContract.ACCOUNT_LOGIN -> accountLogin(command)
        else -> platformError(MatterContract.IM_UNSUPPORTED_CLUSTER)
    }

    /** LauncherResponse status: 0 Success, 1 URLNotAvailable, 2 AuthFailed, 3 TextTrackNotAvailable, 4 AudioTrackNotAvailable. */
    private fun contentLauncher(context: Context, command: Long, p: JSONObject): String = when (command) {
        0x01L -> { // LaunchURL {0 ContentURL, 1 DisplayString?, 2 BrandingInformation?}
            val url = normalizePlajahUrl(p.optString("0"))
            if (url == null) {
                response(1, "Plajah opens plajah.com links only")
            } else {
                val out = JSONObject().put("url", url)
                p.optString("1").takeIf { it.isNotEmpty() }?.let { out.put("displayString", it) }
                PlajahMatterPlugin.dispatch(context, "ContentLauncher", "LaunchURL", out, deepLinkUrl = url)
                response(0)
            }
        }
        0x00L -> { // LaunchContent {0 Search, 1 AutoPlay, 2 Data?, 3 PlaybackPreferences? (1.3), 4 UseCurrentContext? (1.3)}
            val params = JSONArray()
            val words = ArrayList<String>()
            p.optJSONObject("0")?.optJSONArray("0")?.let { list ->
                for (i in 0 until list.length()) {
                    val param = list.optJSONObject(i) ?: continue
                    val value = param.optString("1").trim()
                    if (value.isEmpty()) continue
                    words += value
                    params.put(JSONObject().put("type", paramType(param.optInt("0", -1))).put("value", value))
                }
            }
            val out = JSONObject()
                .put("query", words.joinToString(" "))
                .put("parameters", params)
                .put("autoPlay", p.optBoolean("1", false))
            p.optString("2").takeIf { it.isNotEmpty() }?.let { out.put("data", it) }
            if (p.has("4")) out.put("useCurrentContext", p.optBoolean("4", false))
            // PlaybackPreferences {0 PlaybackPosition, 1 TextTrack, 2 AudioTracks}. Only the position
            // is honoured; the app does not declare the TT/AT features.
            p.optJSONObject("3")?.let { prefs ->
                if (prefs.has("0") && !prefs.isNull("0")) out.put("startPositionMs", prefs.optLong("0"))
            }
            PlajahMatterPlugin.dispatch(context, "ContentLauncher", "LaunchContent", out)
            response(0)
        }
        else -> platformError(MatterContract.IM_UNSUPPORTED_COMMAND)
    }

    /** PlaybackResponse status: 0 Success, 1 InvalidStateForCommand, 2 NotAllowed, 3 NotActive, 4 SpeedOutOfRange, 5 SeekOutOfRange. */
    private fun mediaPlayback(context: Context, command: Long, p: JSONObject): String {
        val s = MatterPlaybackState
        val active = s.hasReported && s.state != 2
        fun send(name: String, payload: JSONObject = JSONObject()): String {
            PlajahMatterPlugin.dispatch(context, "MediaPlayback", name, payload)
            return response(0)
        }
        return when (command) {
            0x00L -> send("Play")
            0x01L -> if (!active) response(3) else send("Pause")
            0x02L -> if (!active) response(3) else send("Stop")
            0x03L -> if (!active) response(3) else send("StartOver")
            0x04L -> send("Previous")
            0x05L -> send("Next")
            0x08L, 0x09L -> { // SkipForward / SkipBackward {0 DeltaPositionMilliseconds}
                if (!active) return response(3)
                val delta = p.optLong("0", 0).coerceAtLeast(0)
                val forward = command == 0x08L
                val target = s.estimatedPositionMs() + if (forward) delta else -delta
                val d = s.durationMs
                val clamped = target.coerceAtLeast(0).let { if (d != null && d > 0) it.coerceAtMost(d) else it }
                send(if (forward) "SkipForward" else "SkipBackward",
                    JSONObject().put("deltaMs", delta).put("positionMs", clamped))
            }
            0x0BL -> { // Seek {0 Position}
                if (!active) return response(3)
                val pos = p.optLong("0", -1)
                val d = s.durationMs
                if (pos < 0 || (d != null && d > 0 && pos > d)) response(5)
                else send("Seek", JSONObject().put("positionMs", pos))
            }
            // Rewind/FastForward need the VariableSpeed feature; Activate/Deactivate*Track (1.3)
            // need TextTracks/AudioTracks. None are declared, so the commands are unsupported.
            else -> platformError(MatterContract.IM_UNSUPPORTED_COMMAND)
        }
    }

    /** SendKeyResponse status: 0 Success, 1 UnsupportedKey, 2 InvalidKeyInCurrentState. */
    private fun keypadInput(context: Context, command: Long, p: JSONObject): String {
        if (command != 0x00L) return platformError(MatterContract.IM_UNSUPPORTED_COMMAND)
        val key = p.optInt("0", -1)
        if (key !in MatterContract.SUPPORTED_KEYS) return response(1)
        // Keys only mean something to a running UI; a cold key press just opens the app.
        PlajahMatterPlugin.dispatch(context, "KeypadInput", "SendKey", JSONObject().put("keyCode", key))
        return response(0)
    }

    /** NavigateTargetResponse status: 0 Success, 1 TargetNotFound, 2 NotAllowed. */
    private fun targetNavigator(context: Context, command: Long, p: JSONObject): String {
        if (command != 0x00L) return platformError(MatterContract.IM_UNSUPPORTED_COMMAND)
        val target = p.optInt("0", -1)
        if (MatterContract.TARGETS.none { it.first == target }) return response(1, "Unknown target")
        MatterPlaybackState.currentTarget = target
        val out = JSONObject().put("target", target)
        p.optString("1").takeIf { it.isNotEmpty() }?.let { out.put("data", it) }
        PlajahMatterPlugin.dispatch(context, "TargetNavigator", "NavigateTarget", out)
        return response(0)
    }

    /**
     * AccountLogin lets a casting client commission without the user typing the TV's passcode, by
     * having the content app vouch with a setup PIN tied to the signed-in account. Plajah has no
     * service that issues such PINs, so: GetSetupPIN answers an empty PIN (the agent falls back to
     * on-screen passcode entry), Login fails (no PIN was ever issued to verify), and Logout is
     * refused rather than letting any LAN Matter client sign the viewer out. The cluster is NOT
     * declared in res/raw/static_matter_clusters.json; these replies are defensive only.
     */
    private fun accountLogin(command: Long): String = when (command) {
        0x00L -> JSONObject().put("0", "").toString()
        0x02L, 0x03L -> JSONObject().put("Status", 1).toString()
        else -> platformError(MatterContract.IM_UNSUPPORTED_COMMAND)
    }

    // ── attribute reads ─────────────────────────────────────────────────────────────────────

    private fun readAttribute(cluster: Long, attribute: Long): String {
        val s = MatterPlaybackState
        val value: Any? = when (cluster) {
            MatterContract.MEDIA_PLAYBACK -> when (attribute) {
                0x00L -> s.state
                0x01L -> if (s.hasReported) 0L else JSONObject.NULL                // StartTime: VOD starts at 0
                0x02L -> s.durationMs ?: JSONObject.NULL                            // Duration (ms), null = unknown/live
                0x03L -> if (!s.hasReported) JSONObject.NULL else {                 // SampledPosition
                    val now = System.currentTimeMillis()
                    JSONObject().put("0", MatterPlaybackState.matterEpochUs(now)).put("1", s.estimatedPositionMs(now))
                }
                0x04L -> s.speed.toDouble()                                         // PlaybackSpeed
                0x05L -> s.durationMs ?: JSONObject.NULL                            // SeekRangeEnd
                0x06L -> if (s.durationMs != null) 0L else JSONObject.NULL          // SeekRangeStart
                else -> return platformError(MatterContract.IM_UNSUPPORTED_ATTRIBUTE)
            }
            MatterContract.CONTENT_LAUNCHER -> when (attribute) {
                // LaunchURL accepts plajah.com pages, not raw media; no DASH/HLS URL playback.
                0x00L -> JSONArray()
                0x01L -> 0
                else -> return platformError(MatterContract.IM_UNSUPPORTED_ATTRIBUTE)
            }
            MatterContract.TARGET_NAVIGATOR -> when (attribute) {
                0x00L -> JSONArray().apply {
                    MatterContract.TARGETS.forEach { (id, name) -> put(JSONObject().put("0", id).put("1", name)) }
                }
                0x01L -> s.currentTarget
                else -> return platformError(MatterContract.IM_UNSUPPORTED_ATTRIBUTE)
            }
            else -> return platformError(MatterContract.IM_UNSUPPORTED_CLUSTER)
        }
        return JSONObject().put(attribute.toString(), value).toString()
    }

    // ── helpers ─────────────────────────────────────────────────────────────────────────────

    private fun response(status: Int, data: String? = null): String =
        JSONObject().put("0", status).apply { if (data != null) put("1", data) }.toString()

    private fun platformError(imStatus: Int): String =
        JSONObject().put("PlatformError", JSONObject().put("Status", imStatus)).toString()

    private fun paramType(code: Int): String = when (code) {
        0x00 -> "actor"; 0x01 -> "channel"; 0x02 -> "character"; 0x03 -> "director"; 0x04 -> "event"
        0x05 -> "franchise"; 0x06 -> "genre"; 0x07 -> "league"; 0x08 -> "popularity"; 0x09 -> "provider"
        0x0A -> "sport"; 0x0B -> "sportsTeam"; 0x0C -> "type"; 0x0D -> "video"
        0x0E -> "season"; 0x0F -> "episode"; 0x10 -> "any"   // added in Matter 1.3
        else -> "unknown"
    }

    private fun sendResponse(context: Context, intent: Intent, response: String) {
        val pi = IntentCompat.getParcelableExtra(intent, MatterContract.EXTRA_DIRECTIVE_RESPONSE_PENDING_INTENT, PendingIntent::class.java)
        if (pi == null) {
            Log.w(TAG, "Matter intent carried no response PendingIntent")
            return
        }
        try {
            pi.send(context, 0, Intent().putExtra(MatterContract.EXTRA_RESPONSE_PAYLOAD, response.toByteArray(Charsets.UTF_8)))
        } catch (e: PendingIntent.CanceledException) {
            Log.e(TAG, "Matter agent response PendingIntent cancelled", e)
        }
    }

    companion object {
        private const val TAG = "PlajahMatter"
        private val PLAJAH_HOSTS = setOf("plajah.com", "www.plajah.com")

        /**
         * https://plajah.com/... (or www.) is kept; com.plajah.app://<path>?<query> (the app's
         * custom scheme) is rewritten onto https://plajah.com. Anything else is refused: the
         * WebView must never be pointed at an arbitrary URL by a LAN Matter client.
         */
        fun normalizePlajahUrl(raw: String?): String? {
            if (raw.isNullOrBlank()) return null
            val uri = try { Uri.parse(raw.trim()) } catch (_: Exception) { return null }
            return when (uri.scheme?.lowercase()) {
                "https" -> if (uri.host?.lowercase() in PLAJAH_HOSTS) uri.buildUpon().authority("plajah.com").build().toString() else null
                "com.plajah.app" -> {
                    // com.plajah.app://reello/abc → host "reello"; com.plajah.app:///reello/abc → path only.
                    val path = listOfNotNull(uri.host?.takeIf { it.isNotEmpty() }, uri.path?.trim('/')?.takeIf { it.isNotEmpty() })
                        .joinToString("/")
                    Uri.Builder().scheme("https").authority("plajah.com").path("/$path")
                        .encodedQuery(uri.encodedQuery).build().toString()
                }
                else -> null
            }
        }
    }
}
