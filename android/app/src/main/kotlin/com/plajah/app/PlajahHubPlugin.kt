package com.plajah.app

import android.content.Intent
import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject
import java.io.File
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL

/**
 * JS: `Capacitor.Plugins.PlajahHub` (wrapper: services/home/plajahHubNative.ts).
 *
 *  - start({port?=8786, foreground?=false}) -> {starting, port}. foreground=true runs the hub as a
 *    foreground service (persistent low-priority notification) so it survives the app being
 *    backgrounded — for signage / always-on hubs. Otherwise it lives while the app does.
 *  - stop() -> {stopped}
 *  - status() -> {running, port, state, pid, error, exitCode, startedAt, health}
 *    state: never-started | starting | running | stopped | exited | failed (hub.js failed to load:
 *    error = files/plajah-hub/fatal.txt, health = the bootstrap's 503 body).
 *    `running` is true only when GET http://127.0.0.1:<port>/health answers.
 *  - getLog({maxBytes?=16384}) -> {log} tail of files/plajah-hub/hub.log (Node stdout/stderr).
 *
 * The hub itself is reached over http://127.0.0.1:<port> (use CapacitorHttp from the WebView —
 * the page origin is https://localhost, so plain fetch() would be mixed content).
 */
@CapacitorPlugin(name = "PlajahHub")
class PlajahHubPlugin : Plugin() {

    @PluginMethod
    fun start(call: PluginCall) {
        val port = call.getInt("port", PlajahHubService.DEFAULT_PORT) ?: PlajahHubService.DEFAULT_PORT
        val fg = call.getBoolean("foreground", false) == true
        val i = Intent(context, PlajahHubService::class.java)
            .setAction(PlajahHubService.ACTION_START)
            .putExtra(PlajahHubService.EXTRA_PORT, port)
            .putExtra(PlajahHubService.EXTRA_FOREGROUND, fg)
        try {
            // Always a plain start: the app is in the foreground, so this is allowed, and the service
            // promotes ITSELF to foreground once running. startForegroundService() imposes a 10s
            // deadline that the :hub process's cold start on a loaded TV can overrun -> ANR + kill.
            // Fallback for a background caller (not allowed to startService): the foreground path.
            try { context.startService(i) } catch (e: IllegalStateException) {
                if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(i) else throw e
            }
            call.resolve(JSObject().put("starting", true).put("port", port).put("foreground", fg))
        } catch (e: Exception) {
            call.reject("hub start failed: ${e.message}", e)
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        val port = PlajahHubService.readStatus(context)?.optInt("port", PlajahHubService.DEFAULT_PORT)
            ?: PlajahHubService.DEFAULT_PORT
        Thread {
            // Graceful JS shutdown first, then stopService: a no-op when the hub isn't running (never
            // spawns a :hub process), otherwise onDestroy ends the hub process.
            PlajahHubService.requestJsShutdown(port)
            try {
                context.stopService(Intent(context, PlajahHubService::class.java))
                call.resolve(JSObject().put("stopped", true))
            } catch (e: Exception) {
                call.reject("hub stop failed: ${e.message}", e)
            }
        }.start()
    }

    @PluginMethod
    fun status(call: PluginCall) {
        Thread {
            val st = PlajahHubService.readStatus(context) ?: JSONObject().put("state", "never-started")
            val port = st.optInt("port", PlajahHubService.DEFAULT_PORT)
            var health: Any = JSONObject.NULL
            var running = false
            try {
                val c = URL("http://127.0.0.1:$port/health").openConnection() as HttpURLConnection
                c.connectTimeout = 600; c.readTimeout = 1500
                val code = c.responseCode
                val body = (if (code < 400) c.inputStream else c.errorStream)?.bufferedReader()?.readText() ?: ""
                running = code == 200
                health = try { JSONObject(body) } catch (_: Exception) { body }
                c.disconnect()
            } catch (_: Exception) {}
            var state = if (running) "running" else st.optString("state")
            var error: Any = st.opt("error") ?: JSONObject.NULL
            val fatal = File(PlajahHubService.hubRoot(context), "fatal.txt")
            if (!running && fatal.exists()) { state = "failed"; error = fatal.readText().take(4000) }
            // nodejs-mobile's process.exit()/fatal errors end the :hub process without the service
            // writing a final status — reconcile against the live process list.
            if (!running && (state == "running" || state == "starting") && !hubProcessAlive()) {
                state = "exited"
                if (error == JSONObject.NULL) error = "hub process died (see logcat tag nodejs / PlajahHub)"
            }
            val out = JSObject()
            out.put("running", running)
            out.put("port", port)
            out.put("state", state)
            out.put("pid", st.opt("pid") ?: JSONObject.NULL)
            out.put("error", error)
            out.put("exitCode", st.opt("exitCode") ?: JSONObject.NULL)
            out.put("startedAt", st.opt("startedAt") ?: JSONObject.NULL)
            out.put("health", health)
            call.resolve(out)
        }.start()
    }

    private fun hubProcessAlive(): Boolean = try {
        val am = context.getSystemService(android.app.ActivityManager::class.java)
        am.runningAppProcesses?.any { it.processName == "${context.packageName}:hub" } == true
    } catch (_: Exception) { true }

    @PluginMethod
    fun getLog(call: PluginCall) {
        val max = (call.getInt("maxBytes", 16384) ?: 16384).coerceIn(256, 1_000_000)
        val f = File(PlajahHubService.hubRoot(context), "hub.log")
        if (!f.exists()) { call.resolve(JSObject().put("log", "")); return }
        RandomAccessFile(f, "r").use { r ->
            val start = (r.length() - max).coerceAtLeast(0)
            r.seek(start)
            val buf = ByteArray((r.length() - start).toInt())
            r.readFully(buf)
            call.resolve(JSObject().put("log", String(buf, Charsets.UTF_8)))
        }
    }
}
