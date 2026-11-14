package com.plajah.app

import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.io.OutputStream
import java.util.concurrent.ConcurrentHashMap

/**
 * Saves a file made in the WebView into the phone's Downloads folder, where other apps can reach it.
 * A WebView can't follow a blob: download on its own. Large files arrive in base64 chunks so a
 * converted video never has to fit in one bridge message. JS side: services/crossover/save.ts.
 */
@CapacitorPlugin(name = "PlajahFiles")
class PlajahFilesPlugin : Plugin() {
    private class Open(val stream: OutputStream, val uri: Uri?, val path: String)
    private val open = ConcurrentHashMap<String, Open>()

    @PluginMethod
    fun begin(call: PluginCall) {
        val name = (call.getString("name") ?: "file").replace(Regex("[\\\\/:*?\"<>|]"), "_")
        val mime = call.getString("mime") ?: "application/octet-stream"
        try {
            val entry = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, name)
                    put(MediaStore.Downloads.MIME_TYPE, mime)
                    put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Crossover")
                    put(MediaStore.Downloads.IS_PENDING, 1)
                }
                val resolver = context.contentResolver
                val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    ?: throw IllegalStateException("Downloads refused the file.")
                Open(resolver.openOutputStream(uri) ?: throw IllegalStateException("Couldn't open the file."), uri, "Downloads/Crossover/$name")
            } else {
                // Before Android 10 only the app's own folder is writable without a storage permission.
                val dir = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "Crossover").apply { mkdirs() }
                val file = File(dir, name)
                Open(file.outputStream(), null, file.absolutePath)
            }
            val id = java.util.UUID.randomUUID().toString()
            open[id] = entry
            call.resolve(JSObject().put("id", id))
        } catch (e: Exception) {
            call.reject(e.message ?: "Couldn't create the file.")
        }
    }

    @PluginMethod
    fun chunk(call: PluginCall) {
        val entry = open[call.getString("id") ?: ""] ?: return call.reject("Unknown file.")
        try {
            entry.stream.write(Base64.decode(call.getString("data") ?: "", Base64.DEFAULT))
            call.resolve()
        } catch (e: Exception) {
            call.reject(e.message ?: "Write failed.")
        }
    }

    @PluginMethod
    fun end(call: PluginCall) {
        val entry = open.remove(call.getString("id") ?: "") ?: return call.reject("Unknown file.")
        try {
            entry.stream.close()
            if (entry.uri != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }
                context.contentResolver.update(entry.uri, values, null, null)
            }
            call.resolve(JSObject().put("path", entry.path))
        } catch (e: Exception) {
            call.reject(e.message ?: "Couldn't finish the file.")
        }
    }
}
