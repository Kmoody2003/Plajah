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
            if (fg && Build.VERSION.SDK_INT >= 26) context.startForegroundService(i) else context.startService(i)
            call.resolve(JSObject().put("starting", true).put("port", port).put("foreground", fg))
        } catch (e: Exception) {
            call.reject("hub start failed: ${e.message}", e)
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        val port = PlajahHubService.readStatus(context)?.optInt("port", PlajahHubService.DEFAULT_PORT)
            ?: PlajahHubService.DEFAULT_PORT
        try {
            context.startService(Intent(context, PlajahHubService::class.java)
                .setAction(PlajahHubService.ACTION_STOP).putExtra(PlajahHubService.EXTRA_PORT, port))
            call.resolve(JSObject().put("stopped", true))
        } catch (e: Exception) {
            call.reject("hub stop failed: ${e.message}", e)
        }
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
                if (c.responseCode == 200) {
                    running = true
                    health = c.inputStream.bufferedReader().readText().let { t ->
                        try { JSONObject(t) } catch (_: Exception) { t }
                    }
                }
                c.disconnect()
            } catch (_: Exception) {}
            val out = JSObject()
            out.put("running", running)
            out.put("port", port)
            out.put("state", if (running) "running" else st.optString("state"))
            out.put("pid", st.opt("pid") ?: JSONObject.NULL)
            out.put("error", st.opt("error") ?: JSONObject.NULL)
            out.put("exitCode", st.opt("exitCode") ?: JSONObject.NULL)
            out.put("startedAt", st.opt("startedAt") ?: JSONObject.NULL)
            out.put("health", health)
            call.resolve(out)
        }.start()
    }

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
