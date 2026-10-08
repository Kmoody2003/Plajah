package com.plajah.app

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.IBinder
import android.os.Parcel
import android.util.Log
import java.util.concurrent.Executors

/**
 * Matter casting "Content App" contract — the app side of the Android TV Matter platform.
 *
 * On a TV whose OS ships a Matter casting agent (the "platform app" in connectedhomeip's
 * examples/tv-app/android; Amazon ships one on Fire TV), the agent discovers installed apps by the
 * application-level meta-data in AndroidManifest.xml (vendor_id / product_id / vendor_name /
 * clusters), gives each a Matter endpoint, and delivers Matter commands and attribute reads to the
 * app as `com.matter.tv.app.api.action.MATTER_COMMAND` broadcasts (MatterCommandReceiver.kt). The
 * app answers through the PendingIntent the agent attaches, with a JSON object keyed by Matter
 * field id ("0", "1", ...), mirroring the TLV↔JSON conversion in connectedhomeip's TlvJson.cpp.
 *
 * This file holds the constants (copied from com.matter.tv.app.api.MatterIntentConstants and
 * Clusters — the upstream common-api module is not published as an artifact), the playback state
 * JS reports for attribute reads, and a minimal client for the agent's IMatterAppAgent binder.
 *
 * NOTHING here does anything on a TV without that agent (stock Google TV / Android TV today): no
 * broadcast ever arrives and the agent service never resolves.
 */
object MatterContract {
    // ── com.matter.tv.app.api.MatterIntentConstants ──────────────────────────────────────────
    const val ACTION_MATTER_COMMAND = "com.matter.tv.app.api.action.MATTER_COMMAND"
    const val ACTION_MATTER_AGENT = "com.matter.tv.app.api.action.MatterAppAgent"
    const val PERMISSION_MATTER_AGENT_BIND = "com.matter.tv.app.api.permission.BIND_SERVICE_PERMISSION"
    const val PERMISSION_MATTER_AGENT = "com.matter.tv.app.api.permission.SEND_DATA"
    const val EXTRA_COMMAND_PAYLOAD = "EXTRA_COMMAND_PAYLOAD"
    const val EXTRA_RESPONSE_PAYLOAD = "EXTRA_RESPONSE_PAYLOAD"
    const val EXTRA_ATTRIBUTE_ACTION = "EXTRA_ATTRIBUTE_ACTION"
    const val ATTRIBUTE_ACTION_READ = "ATTRIBUTE_ACTION_READ"
    const val EXTRA_DIRECTIVE_RESPONSE_PENDING_INTENT = "EXTRA_DIRECTIVE_RESPONSE_PENDING_INTENT"
    const val EXTRA_COMMAND_ID = "EXTRA_COMMAND_ID"
    const val EXTRA_CLUSTER_ID = "EXTRA_CLUSTER_ID"
    const val EXTRA_ATTRIBUTE_ID = "EXTRA_ATTRIBUTE_ID"

    // ── Cluster ids (Matter Application Cluster spec) ─────────────────────────────────────────
    const val TARGET_NAVIGATOR = 0x0505L
    const val MEDIA_PLAYBACK = 0x0506L
    const val KEYPAD_INPUT = 0x0509L
    const val CONTENT_LAUNCHER = 0x050AL
    const val APPLICATION_BASIC = 0x050DL
    const val ACCOUNT_LOGIN = 0x050EL

    // ── Interaction Model status codes used in {"PlatformError":{"Status":n}} replies ─────────
    const val IM_FAILURE = 0x01
    const val IM_UNSUPPORTED_COMMAND = 0x81
    const val IM_UNSUPPORTED_ATTRIBUTE = 0x86
    const val IM_UNSUPPORTED_CLUSTER = 0xC3

    fun clusterName(id: Long): String = when (id) {
        TARGET_NAVIGATOR -> "TargetNavigator"
        MEDIA_PLAYBACK -> "MediaPlayback"
        KEYPAD_INPUT -> "KeypadInput"
        CONTENT_LAUNCHER -> "ContentLauncher"
        APPLICATION_BASIC -> "ApplicationBasic"
        ACCOUNT_LOGIN -> "AccountLogin"
        else -> "0x" + java.lang.Long.toHexString(id)
    }

    /**
     * TargetNavigator.TargetList. Identifier 0 is the app's main view. Keep in sync with
     * TARGETS in services/tv/matterCastingBridge.ts.
     */
    val TARGETS: List<Pair<Int, String>> = listOf(
        0 to "Home",
        1 to "Live TV",
        2 to "Movies & TV",
        3 to "Reello",
        4 to "Search",
    )

    /**
     * KeypadInput CecKeyCodeEnum values the web layer can act on (features NV | LK | NK).
     * Keep in sync with KEY_MAP in services/tv/matterCastingBridge.ts.
     */
    val SUPPORTED_KEYS: Set<Int> = buildSet {
        addAll(listOf(0x00, 0x01, 0x02, 0x03, 0x04))      // Select, Up, Down, Left, Right
        addAll(listOf(0x09, 0x0A, 0x0D, 0x11))            // RootMenu(Home), SetupMenu(Settings), Exit(Back), ContextMenu
        addAll(0x20..0x29)                                 // Numbers 0-9
        add(0x2B)                                          // Enter
        addAll(listOf(0x30, 0x31))                         // ChannelUp, ChannelDown
        addAll(listOf(0x44, 0x45, 0x46, 0x48, 0x49, 0x4B, 0x4C, 0x61)) // Play, Stop, Pause, Rewind, FastForward, Forward, Backward, PausePlay
    }
}

/**
 * What the web player last reported (PlajahMatter.reportPlaybackState). MediaPlayback attribute
 * reads are answered from here synchronously: the agent waits only ~2 s for an attribute reply,
 * far too short to round-trip into the WebView.
 */
object MatterPlaybackState {
    /** MediaPlayback.PlaybackStateEnum: 0 Playing, 1 Paused, 2 NotPlaying, 3 Buffering. */
    @Volatile var state: Int = 2
    @Volatile var positionMs: Long = 0
    /** null = unknown / live. */
    @Volatile var durationMs: Long? = null
    @Volatile var speed: Float = 0f
    /** System.currentTimeMillis() when positionMs was sampled. */
    @Volatile var sampledAtMs: Long = 0
    /** Has any player reported since launch? Commands needing active media answer NotActive otherwise. */
    @Volatile var hasReported: Boolean = false
    @Volatile var currentTarget: Int = 0

    /** Position now, extrapolated from the last sample while playing. */
    fun estimatedPositionMs(now: Long = System.currentTimeMillis()): Long {
        val base = positionMs
        if (state != 0 || sampledAtMs == 0L) return base
        val adv = ((now - sampledAtMs) * (if (speed > 0f) speed else 1f)).toLong()
        val p = base + adv.coerceAtLeast(0)
        val d = durationMs
        return if (d != null && d > 0) p.coerceAtMost(d) else p
    }

    /** Matter epoch-us (microseconds since 2000-01-01T00:00:00Z) for SampledPosition.UpdatedAt. */
    fun matterEpochUs(unixMs: Long): Long = (unixMs - MATTER_EPOCH_OFFSET_MS).coerceAtLeast(0) * 1000L

    private const val MATTER_EPOCH_OFFSET_MS = 946_684_800_000L
}

/**
 * Minimal client for the agent's IMatterAppAgent binder (examples/tv-app/android/App/common-api
 * aidl). Used only to tell the agent an attribute changed so Matter subscriptions (e.g. a phone
 * subscribed to MediaPlayback.CurrentState) get a report.
 *
 * Hand-rolled Parcel transactions instead of an AIDL stub so app/build.gradle needs no
 * `buildFeatures { aidl true }`. The wire format is what the AIDL compiler generates for
 *   interface IMatterAppAgent {
 *     boolean setSupportedClusters(in SetSupportedClustersRequest request); // FIRST_CALL_TRANSACTION + 0
 *     boolean reportAttributeChange(in int clusterId, in int attributeId);  // FIRST_CALL_TRANSACTION + 1
 *   }
 * Static clusters come from the manifest, so setSupportedClusters is never called.
 */
object MatterAgentClient {
    private const val TAG = "PlajahMatter"
    private const val DESCRIPTOR = "com.matter.tv.app.api.IMatterAppAgent"
    private const val TX_REPORT_ATTRIBUTE_CHANGE = IBinder.FIRST_CALL_TRANSACTION + 1

    private val io = Executors.newSingleThreadExecutor { r -> Thread(r, "matter-agent").apply { isDaemon = true } }
    @Volatile private var binder: IBinder? = null
    @Volatile private var binding = false
    @Volatile private var appContext: Context? = null

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            binder = service; binding = false
            Log.i(TAG, "Matter agent connected: $name")
        }
        override fun onServiceDisconnected(name: ComponentName?) {
            binder = null; binding = false
            Log.w(TAG, "Matter agent disconnected: $name")
        }
        override fun onBindingDied(name: ComponentName?) {
            binder = null; binding = false
            try { appContext?.unbindService(this) } catch (_: Throwable) { }
        }
    }

    /**
     * The agent service, when this device has one: it must enforce the bind permission and its
     * package must hold SEND_DATA (same checks as upstream MatterAgentClient.resolveBindIntent).
     */
    fun resolveAgent(context: Context): ComponentName? = try {
        val pm = context.packageManager
        pm.queryIntentServices(Intent(MatterContract.ACTION_MATTER_AGENT), 0)
            .firstOrNull { ri ->
                ri.serviceInfo?.permission == MatterContract.PERMISSION_MATTER_AGENT_BIND &&
                    pm.checkPermission(MatterContract.PERMISSION_MATTER_AGENT, ri.serviceInfo.packageName) ==
                    PackageManager.PERMISSION_GRANTED
            }
            ?.let { ComponentName(it.serviceInfo.packageName, it.serviceInfo.name) }
    } catch (t: Throwable) {
        Log.w(TAG, "Matter agent lookup failed: ${t.message}")
        null
    }

    fun isAgentPresent(context: Context): Boolean = resolveAgent(context) != null

    /** Idempotent; a no-op on devices without the agent. */
    fun ensureBound(context: Context) {
        if (binder != null || binding) return
        val app = context.applicationContext
        appContext = app
        val component = resolveAgent(app) ?: return
        binding = try {
            app.bindService(Intent(MatterContract.ACTION_MATTER_AGENT).setComponent(component), connection, Context.BIND_AUTO_CREATE)
        } catch (t: Throwable) {
            Log.w(TAG, "Matter agent bind failed: ${t.message}")
            false
        }
    }

    /** Fire-and-forget off the main thread. */
    fun reportAttributeChange(context: Context, clusterId: Long, attributeId: Int) {
        ensureBound(context)
        val b = binder ?: return
        io.execute {
            val data = Parcel.obtain()
            val reply = Parcel.obtain()
            try {
                data.writeInterfaceToken(DESCRIPTOR)
                data.writeInt(clusterId.toInt())
                data.writeInt(attributeId)
                b.transact(TX_REPORT_ATTRIBUTE_CHANGE, data, reply, 0)
                reply.readException()
                val ok = reply.readInt() != 0
                if (!ok) Log.w(TAG, "Agent rejected attribute change $clusterId/$attributeId")
            } catch (t: Throwable) {
                Log.w(TAG, "reportAttributeChange failed: ${t.message}")
            } finally {
                data.recycle(); reply.recycle()
            }
        }
    }
}
