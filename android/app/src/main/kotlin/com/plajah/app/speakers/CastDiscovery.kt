package com.plajah.app.speakers

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.provider.Settings
import android.util.Log
import java.io.ByteArrayOutputStream
import java.net.DatagramPacket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.MulticastSocket
import java.net.NetworkInterface
import java.net.SocketTimeoutException
import java.util.ArrayDeque
import java.util.concurrent.ExecutorService
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/** A Cast receiver found on the LAN. Multi-room groups are their own receivers (port 32xxx). */
data class CastDeviceInfo(
    val id: String,
    val instanceName: String,
    val name: String,
    val model: String,
    val host: String,
    val port: Int,
    val capabilities: Int,
) {
    val isGroup: Boolean get() = model.equals("Google Cast Group", true) || (capabilities and CA_MULTIZONE_GROUP) != 0
    val deviceType: String get() = when {
        isGroup -> "group"
        (capabilities and CA_VIDEO_OUT) != 0 -> "tv"
        (capabilities and CA_AUDIO_OUT) != 0 -> "speaker"
        else -> "unknown"
    }

    companion object {
        // CastDevice capability bits as advertised in the `ca` TXT record.
        const val CA_VIDEO_OUT = 1
        const val CA_AUDIO_OUT = 4
        const val CA_MULTIZONE_GROUP = 32
    }
}

/**
 * Finds `_googlecast._tcp` receivers without Google Play Services.
 *
 * Primary: platform NsdManager. Before Android 14, NsdManager can only resolve one service at a
 * time (a second resolveService fails with FAILURE_ALREADY_ACTIVE), so resolves are queued.
 * Fallback: if NSD has produced nothing after [FALLBACK_DELAY_MS], a raw mDNS PTR query is sent
 * from an ephemeral port (an RFC 6762 "legacy unicast" query — receivers answer straight back to
 * that port with PTR+SRV+TXT+A in one packet, which was verified against the real house speakers).
 *
 * This device itself (a Google TV is a Cast receiver too) is excluded by local IP and by name.
 * All state is touched on [state] (single thread); blocking socket work runs on [net].
 */
class CastDiscovery(
    private val context: Context,
    private val state: ScheduledExecutorService,
    private val net: ExecutorService,
    private val onChanged: () -> Unit,
) {
    private val devices = LinkedHashMap<String, CastDeviceInfo>()   // keyed by device id
    private val instanceToId = HashMap<String, String>()
    private val resolveQueue = ArrayDeque<NsdServiceInfo>()
    private var resolving = false
    private var nsd: NsdManager? = null
    private var nsdListener: NsdManager.DiscoveryListener? = null
    private var fallbackTask: ScheduledFuture<*>? = null
    private var stopTask: ScheduledFuture<*>? = null
    @Volatile var active = false
        private set

    /** Snapshot; call on [state]. */
    fun list(): List<CastDeviceInfo> = devices.values.toList()
    fun find(id: String): CastDeviceInfo? = devices[id]

    /** Start (or extend) discovery. [autoStopMs] > 0 stops by itself — used for the warm-up scan. */
    fun start(autoStopMs: Long = 0L) = state.execute {
        stopTask?.cancel(false); stopTask = null
        if (autoStopMs > 0) stopTask = state.schedule(Runnable { stopNow() }, autoStopMs, TimeUnit.MILLISECONDS)
        if (active) return@execute
        active = true
        startNsd()
        fallbackTask = state.schedule(Runnable {
            if (active && devices.isEmpty()) rawQuery()
        }, FALLBACK_DELAY_MS, TimeUnit.MILLISECONDS)
    }

    fun stop() = state.execute { stopNow() }

    private fun stopNow() {
        stopTask?.cancel(false); stopTask = null
        fallbackTask?.cancel(false); fallbackTask = null
        if (!active) return
        active = false
        val l = nsdListener
        nsdListener = null
        if (l != null) try { nsd?.stopServiceDiscovery(l) } catch (_: Throwable) { }
        resolveQueue.clear()
    }

    // ── NsdManager ───────────────────────────────────────────────────────────────────────────

    private fun startNsd() {
        val m = nsd ?: (context.getSystemService(Context.NSD_SERVICE) as? NsdManager)?.also { nsd = it } ?: return
        val l = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) { }
            override fun onDiscoveryStopped(serviceType: String) { }
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                Log.w(TAG, "NSD start failed $errorCode")
                state.execute { if (nsdListener === this) nsdListener = null; if (active && devices.isEmpty()) rawQuery() }
            }
            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) { }
            override fun onServiceFound(info: NsdServiceInfo) = state.execute {
                if (!active) return@execute
                if (resolveQueue.none { it.serviceName == info.serviceName }) resolveQueue.add(info)
                pumpResolve()
            }
            override fun onServiceLost(info: NsdServiceInfo) = state.execute {
                val id = instanceToId.remove(info.serviceName) ?: return@execute
                if (devices.remove(id) != null) onChanged()
            }
        }
        nsdListener = l
        try {
            m.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, l)
        } catch (t: Throwable) {
            Log.w(TAG, "NSD discoverServices threw: ${t.message}")
            nsdListener = null
        }
    }

    private fun pumpResolve() {
        if (resolving) return
        val next = resolveQueue.poll() ?: return
        val m = nsd ?: return
        resolving = true
        // Watchdog: some vendor NSD stacks never call back for a resolve.
        val watchdog = state.schedule(Runnable { if (resolving) { resolving = false; pumpResolve() } }, 6, TimeUnit.SECONDS)
        val rl = object : NsdManager.ResolveListener {
            override fun onResolveFailed(info: NsdServiceInfo, errorCode: Int) = state.execute {
                watchdog.cancel(false)
                resolving = false
                if (errorCode == NsdManager.FAILURE_ALREADY_ACTIVE && active) {
                    state.schedule(Runnable { resolveQueue.add(info); pumpResolve() }, 300, TimeUnit.MILLISECONDS)
                } else pumpResolve()
            }
            override fun onServiceResolved(info: NsdServiceInfo) = state.execute {
                watchdog.cancel(false)
                resolving = false
                @Suppress("DEPRECATION")
                val host = info.host?.hostAddress
                if (host != null) {
                    val txt = HashMap<String, String>()
                    try {
                        info.attributes.forEach { (k, v) -> txt[k.lowercase()] = v?.let { String(it, Charsets.UTF_8) } ?: "" }
                    } catch (_: Throwable) { }
                    addDevice(info.serviceName, host, info.port, txt)
                }
                pumpResolve()
            }
        }
        try {
            @Suppress("DEPRECATION")
            m.resolveService(next, rl)
        } catch (t: Throwable) {
            watchdog.cancel(false)
            resolving = false
            Log.w(TAG, "resolveService threw: ${t.message}")
            state.execute { pumpResolve() }
        }
    }

    // ── raw mDNS fallback ────────────────────────────────────────────────────────────────────

    /** Fire-and-collect a legacy-unicast PTR query; results are merged on [state]. */
    fun rawQuery() {
        net.execute {
            val found = try { rawQueryBlocking() } catch (t: Throwable) {
                Log.w(TAG, "raw mDNS failed: ${t.message}"); emptyList()
            }
            if (found.isNotEmpty()) state.execute { found.forEach { addDevice(it.instance, it.host, it.port, it.txt) } }
        }
    }

    private class RawService(val instance: String, val host: String, val port: Int, val txt: Map<String, String>)

    private fun rawQueryBlocking(): List<RawService> {
        val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        val lock = try { wifi?.createMulticastLock("plajah-cast-mdns")?.apply { setReferenceCounted(false); acquire() } } catch (_: Throwable) { null }
        val sock = MulticastSocket(0)
        try {
            sock.timeToLive = 255
            sock.soTimeout = 400
            val query = buildPtrQuery(SERVICE_TYPE_FQDN)
            val group = InetAddress.getByName("224.0.0.251")
            val ptrs = HashSet<String>()
            val srv = HashMap<String, Pair<String, Int>>()   // instance → (target, port)
            val txts = HashMap<String, Map<String, String>>()
            val addrs = HashMap<String, String>()            // hostname → ipv4
            val srcOf = HashMap<String, String>()            // instance → packet source ip
            val deadline = System.currentTimeMillis() + RAW_LISTEN_MS
            var sends = 0
            var nextSend = 0L
            val buf = ByteArray(9000)
            while (System.currentTimeMillis() < deadline) {
                if (sends < 3 && System.currentTimeMillis() >= nextSend) {
                    try { sock.send(DatagramPacket(query, query.size, group, 5353)) } catch (t: Throwable) { Log.w(TAG, "mDNS send: ${t.message}") }
                    sends++; nextSend = System.currentTimeMillis() + 1000
                }
                val p = DatagramPacket(buf, buf.size)
                try { sock.receive(p) } catch (_: SocketTimeoutException) { continue }
                try {
                    val src = p.address?.hostAddress ?: ""
                    parseResponse(buf, p.length) { rr, name ->
                        when (rr) {
                            is Rr.Ptr -> {
                                if (name.equals(SERVICE_TYPE_FQDN, true)) { ptrs.add(rr.target); srcOf[rr.target] = src }
                            }
                            is Rr.Srv -> { srv[name] = rr.target to rr.port; if (!srcOf.containsKey(name)) srcOf[name] = src }
                            is Rr.Txt -> { txts[name] = rr.map }
                            is Rr.A -> { addrs[name.lowercase()] = rr.ip }
                        }
                    }
                } catch (t: Throwable) { /* malformed packet — ignore */ }
            }
            val out = ArrayList<RawService>()
            for (inst in ptrs + srv.keys) {
                val (target, port) = srv[inst] ?: continue
                val ip = addrs[target.lowercase()] ?: srcOf[inst]?.takeIf { it.isNotEmpty() } ?: continue
                out.add(RawService(inst.substringBefore("._googlecast"), ip, port, txts[inst] ?: emptyMap()))
            }
            return out.distinctBy { it.instance }
        } finally {
            try { sock.close() } catch (_: Throwable) { }
            try { lock?.release() } catch (_: Throwable) { }
        }
    }

    private sealed class Rr {
        class Ptr(val target: String) : Rr()
        class Srv(val target: String, val port: Int) : Rr()
        class Txt(val map: Map<String, String>) : Rr()
        class A(val ip: String) : Rr()
    }

    private fun parseResponse(b: ByteArray, len: Int, sink: (Rr, String) -> Unit) {
        fun u16(o: Int) = ((b[o].toInt() and 0xff) shl 8) or (b[o + 1].toInt() and 0xff)
        fun readName(start: Int): Pair<String, Int> {
            val labels = ArrayList<String>()
            var o = start; var end = -1; var hops = 0
            while (true) {
                if (o >= len) throw IllegalStateException("name overrun")
                val l = b[o].toInt() and 0xff
                if (l == 0) { o++; break }
                if (l and 0xc0 == 0xc0) {
                    if (end < 0) end = o + 2
                    o = ((l and 0x3f) shl 8) or (b[o + 1].toInt() and 0xff)
                    if (++hops > 32) throw IllegalStateException("pointer loop")
                    continue
                }
                labels.add(String(b, o + 1, l, Charsets.UTF_8)); o += 1 + l
            }
            return labels.joinToString(".") to (if (end >= 0) end else o)
        }
        if (len < 12) return
        if (u16(2) and 0x8000 == 0) return // a query, not a response
        val qd = u16(4)
        val rrs = u16(6) + u16(8) + u16(10)
        var o = 12
        repeat(qd) { o = readName(o).second + 4 }
        repeat(rrs) {
            val (name, after) = readName(o)
            o = after
            val type = u16(o); val rdLen = u16(o + 8)
            val d = o + 10
            o = d + rdLen
            if (o > len) return
            when (type) {
                12 -> sink(Rr.Ptr(readName(d).first), name)
                33 -> sink(Rr.Srv(readName(d + 6).first, u16(d + 4)), name)
                16 -> {
                    val map = HashMap<String, String>()
                    var p = d
                    while (p < d + rdLen) {
                        val l = b[p].toInt() and 0xff
                        val s = String(b, p + 1, minOf(l, d + rdLen - p - 1), Charsets.UTF_8)
                        p += 1 + l
                        val eq = s.indexOf('=')
                        if (eq > 0) map[s.substring(0, eq).lowercase()] = s.substring(eq + 1)
                    }
                    sink(Rr.Txt(map), name)
                }
                1 -> if (rdLen == 4) sink(Rr.A((0 until 4).joinToString(".") { (b[d + it].toInt() and 0xff).toString() }), name)
            }
        }
    }

    private fun buildPtrQuery(name: String): ByteArray {
        val out = ByteArrayOutputStream()
        out.write(byteArrayOf(0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0))
        name.split('.').filter { it.isNotEmpty() }.forEach { l ->
            val d = l.toByteArray(Charsets.UTF_8); out.write(d.size); out.write(d)
        }
        out.write(0)
        out.write(byteArrayOf(0, 12, 0, 1)) // PTR, IN
        return out.toByteArray()
    }

    // ── merge ────────────────────────────────────────────────────────────────────────────────

    private fun addDevice(instance: String, host: String, port: Int, txt: Map<String, String>) {
        if (host.isBlank() || port <= 0) return
        if (host in localAddresses()) return
        val name = txt["fn"]?.takeIf { it.isNotBlank() } ?: instance
        if (selfName()?.equals(name, true) == true) return
        val id = txt["id"]?.takeIf { it.isNotBlank() } ?: instance
        val dev = CastDeviceInfo(
            id = id,
            instanceName = instance,
            name = name,
            model = txt["md"] ?: "",
            host = host,
            port = port,
            capabilities = txt["ca"]?.toIntOrNull() ?: 0,
        )
        instanceToId[instance] = id
        if (devices[id] != dev) { devices[id] = dev; onChanged() }
    }

    private var localCache: Set<String>? = null
    private var localCacheAt = 0L
    private fun localAddresses(): Set<String> {
        val now = System.currentTimeMillis()
        localCache?.let { if (now - localCacheAt < 30_000) return it }
        val s = HashSet<String>()
        try {
            NetworkInterface.getNetworkInterfaces()?.toList()?.forEach { ni ->
                ni.inetAddresses.toList().filterIsInstance<Inet4Address>().forEach { a -> a.hostAddress?.let { s.add(it) } }
            }
        } catch (_: Throwable) { }
        localCache = s; localCacheAt = now
        return s
    }

    private fun selfName(): String? = try {
        Settings.Global.getString(context.contentResolver, "device_name")?.takeIf { it.isNotBlank() }
    } catch (_: Throwable) { null }

    companion object {
        private const val TAG = "PlajahCastDiscovery"
        const val SERVICE_TYPE = "_googlecast._tcp"
        private const val SERVICE_TYPE_FQDN = "_googlecast._tcp.local"
        private const val FALLBACK_DELAY_MS = 4000L
        private const val RAW_LISTEN_MS = 3500L
    }
}
