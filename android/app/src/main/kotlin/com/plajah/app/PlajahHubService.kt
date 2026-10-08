package com.plajah.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.ParcelFileDescriptor
import android.os.Process
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.sun.jna.Function
import com.sun.jna.Memory
import com.sun.jna.NativeLibrary
import com.sun.jna.Pointer
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Embedded Node.js smart-home hub (Matter controller + Hue bridge + /api/home, /api/matter).
 *
 * Runs in its own OS process (`:hub`, see AndroidManifest) because nodejs-mobile's node::Start
 * can only run ONCE per process: stopping or crashing the hub kills this process, and the next
 * start gets a fresh one. A Node crash therefore never takes the WebView down with it.
 *
 * Runtime: nodejs-mobile v18.20.4 libnode.so (jniLibs, armeabi-v7a + arm64-v8a) called through
 * JNA (`node::Start(int, char**)` by its mangled symbol) — no NDK/CMake build step needed.
 *
 * Layout under context.filesDir/plajah-hub/:
 *   app/      copy of assets/plajah-hub/ (refreshed when the APK is updated); main.js is the entry
 *   data/     persistent hub storage (Matter fabrics, Hue keys, ...)  -> env PLAJAH_HUB_DATA + PLAJAH_HOME_DIR
 *   tmp/      os.tmpdir()
 *   hub.log   Node stdout+stderr (truncated at start when > 1 MB)
 *   status.json  {state, pid, port, startedAt, exitCode, error} written by this service
 *
 * The web layer talks to the hub over http://127.0.0.1:<port> (PlajahHubPlugin.status probes
 * /health). Intents: ACTION_START (extras: port, foreground), ACTION_STOP.
 */
class PlajahHubService : Service() {

    private var multicastLock: WifiManager.MulticastLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val port = intent?.getIntExtra(EXTRA_PORT, DEFAULT_PORT) ?: DEFAULT_PORT
        val foreground = intent?.getBooleanExtra(EXTRA_FOREGROUND, false) == true
        when (intent?.action) {
            ACTION_STOP -> { stopHub(port); return START_NOT_STICKY }
            else -> {
                if (foreground) goForeground()
                startNode(port)
            }
        }
        // Foreground (always-on / signage) mode asks Android to recreate us if killed.
        return if (foreground) START_REDELIVER_INTENT else START_NOT_STICKY
    }

    private fun goForeground() {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL, "Smart home hub", NotificationManager.IMPORTANCE_MIN)
                    .apply { setShowBadge(false) },
            )
        }
        val n: Notification = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Plajah home hub")
            .setContentText("Matter + smart-home hub is running")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build()
        val type = if (Build.VERSION.SDK_INT >= 29) ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE else 0
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, n, type)
        } catch (e: Exception) {
            Log.w(TAG, "startForeground failed; hub continues as a plain service", e)
        }
    }

    private fun startNode(port: Int) {
        synchronized(lock) {
            if (nodeStarted) return
            nodeStarted = true
        }
        val root = hubRoot(this)
        writeStatus(this, JSONObject().put("state", "starting").put("pid", Process.myPid()).put("port", port))
        // mDNS (Matter operational discovery, Hue) needs multicast RX on Wi-Fi; harmless on Ethernet.
        try {
            val wm = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            multicastLock = wm.createMulticastLock("plajah-hub").apply { setReferenceCounted(false); acquire() }
        } catch (e: Exception) { Log.w(TAG, "multicast lock unavailable", e) }

        // Node wants a deep native stack; 8 MB matches what nodejs-mobile's samples use (or more).
        Thread(null, {
            var exit = -1
            var error: String? = null
            try {
                val entry = syncAssets(root)
                val data = File(root, "data").apply { mkdirs() }
                val tmp = File(root, "tmp").apply { mkdirs() }
                val log = File(root, "hub.log")
                if (log.length() > 1_000_000) log.delete()
                exit = runNode(
                    entry = entry,
                    log = log,
                    env = mapOf(
                        "PLAJAH_HUB_PORT" to port.toString(),
                        "PLAJAH_HUB_HOST" to "127.0.0.1",
                        "PLAJAH_HUB_DATA" to data.absolutePath,
                        // services/home/hubStorage.ts root (matter fabric, hue.json, hub.json, ...)
                        "PLAJAH_HOME_DIR" to data.absolutePath,
                        "PLAJAH_HUB_PLATFORM" to "android",
                        "HOME" to data.absolutePath,
                        "TMPDIR" to tmp.absolutePath,
                    ),
                    onStarted = {
                        writeStatus(this, JSONObject().put("state", "running").put("pid", Process.myPid())
                            .put("port", port).put("startedAt", System.currentTimeMillis()))
                    },
                )
            } catch (t: Throwable) {
                error = t.toString()
                Log.e(TAG, "hub failed", t)
            }
            writeStatus(this, JSONObject().put("state", "exited").put("port", port)
                .put("exitCode", exit).put("error", error ?: if (exit != 0) "node exited with code $exit" else JSONObject.NULL)
                .put("exitedAt", System.currentTimeMillis()))
            // node::Start cannot be called again in this process — end it so the next start is clean.
            Process.killProcess(Process.myPid())
        }, "plajah-hub-node", 16L * 1024 * 1024).start()
    }

    private fun stopHub(port: Int) {
        // Give the hub a chance to close fabrics/sockets/storage cleanly, then end the process.
        try {
            val c = URL("http://127.0.0.1:$port/__shutdown").openConnection() as HttpURLConnection
            c.requestMethod = "POST"; c.connectTimeout = 800; c.readTimeout = 2500
            c.responseCode; c.disconnect()
            Thread.sleep(400)
        } catch (_: Exception) { /* not running or no route — kill anyway */ }
        writeStatus(this, JSONObject().put("state", "stopped").put("port", port).put("exitedAt", System.currentTimeMillis()))
        try { multicastLock?.release() } catch (_: Exception) {}
        stopSelf()
        Process.killProcess(Process.myPid())
    }

    /** Copies assets/plajah-hub/ into files/plajah-hub/app when the APK changed. Returns main.js. */
    private fun syncAssets(root: File): File {
        val app = File(root, "app")
        val stamp = File(root, "app.stamp")
        val pi = packageManager.getPackageInfo(packageName, 0)
        val want = "${pi.lastUpdateTime}"
        if (!stamp.exists() || stamp.readText() != want || !File(app, "main.js").exists()) {
            app.deleteRecursively()
            copyAssetDir("plajah-hub", app)
            stamp.writeText(want)
        }
        return File(app, "main.js").also {
            if (!it.exists()) throw IllegalStateException("assets/plajah-hub/main.js missing — run scripts/buildHubBundle.mjs")
        }
    }

    private fun copyAssetDir(path: String, dest: File) {
        val list = assets.list(path) ?: emptyArray()
        if (list.isEmpty()) {
            dest.parentFile?.mkdirs()
            assets.open(path).use { i -> dest.outputStream().use { o -> i.copyTo(o) } }
            return
        }
        dest.mkdirs()
        for (name in list) copyAssetDir("$path/$name", File(dest, name))
    }

    private fun runNode(entry: File, log: File, env: Map<String, String>, onStarted: () -> Unit): Int {
        val libDir = applicationInfo.nativeLibraryDir
        // Loads libc++_shared.so (DT_NEEDED) from the app's lib dir via the app linker namespace.
        System.loadLibrary("node")
        val libc = NativeLibrary.getInstance("c")
        val setenv = libc.getFunction("setenv")
        for ((k, v) in env) setenv.invokeInt(arrayOf<Any>(k, v, 1))

        // stdout/stderr -> hub.log (Android discards a native process's stdio otherwise).
        val pfd = ParcelFileDescriptor.open(log,
            ParcelFileDescriptor.MODE_WRITE_ONLY or ParcelFileDescriptor.MODE_CREATE or ParcelFileDescriptor.MODE_APPEND)
        val fd = pfd.detachFd()
        val dup2 = libc.getFunction("dup2")
        dup2.invokeInt(arrayOf<Any>(fd, 1)); dup2.invokeInt(arrayOf<Any>(fd, 2))

        val node = NativeLibrary.getInstance("$libDir/libnode.so")
        val start: Function = node.getFunction("_ZN4node5StartEiPPc")
        // libuv requires argv strings to be contiguous in memory (it reuses the block for process.title).
        val args = listOf("node", entry.absolutePath)
        val bytes = args.map { it.toByteArray(Charsets.UTF_8) }
        val block = Memory(bytes.sumOf { it.size + 1 }.toLong())
        val argv = Memory(((args.size + 1) * Native_POINTER_SIZE).toLong())
        var off = 0L
        bytes.forEachIndexed { i, b ->
            block.write(off, b, 0, b.size); block.setByte(off + b.size, 0)
            argv.setPointer((i * Native_POINTER_SIZE).toLong(), block.share(off))
            off += b.size + 1
        }
        argv.setPointer((args.size * Native_POINTER_SIZE).toLong(), Pointer.NULL)
        Log.i(TAG, "node::Start ${entry.absolutePath} (pid ${Process.myPid()})")
        onStarted()
        // Blocks for the lifetime of the hub's event loop. Keep block/argv reachable until it returns.
        val code = start.invokeInt(arrayOf<Any>(args.size, argv))
        Log.i(TAG, "node exited $code"); block.size(); argv.size()
        return code
    }

    companion object {
        const val TAG = "PlajahHub"
        const val ACTION_START = "com.plajah.app.hub.START"
        const val ACTION_STOP = "com.plajah.app.hub.STOP"
        const val EXTRA_PORT = "port"
        const val EXTRA_FOREGROUND = "foreground"
        const val DEFAULT_PORT = 8786
        private const val CHANNEL = "plajah_hub"
        private const val NOTIFICATION_ID = 4786
        private val Native_POINTER_SIZE = com.sun.jna.Native.POINTER_SIZE
        private val lock = Any()
        @Volatile private var nodeStarted = false

        fun hubRoot(ctx: Context): File = File(ctx.filesDir, "plajah-hub").apply { mkdirs() }

        fun writeStatus(ctx: Context, o: JSONObject) {
            try {
                val f = File(hubRoot(ctx), "status.json")
                val tmp = File(f.path + ".tmp")
                tmp.writeText(o.toString()); tmp.renameTo(f)
            } catch (e: Exception) { Log.w(TAG, "status write failed", e) }
        }

        fun readStatus(ctx: Context): JSONObject? = try {
            File(hubRoot(ctx), "status.json").takeIf { it.exists() }?.let { JSONObject(it.readText()) }
        } catch (_: Exception) { null }
    }
}
