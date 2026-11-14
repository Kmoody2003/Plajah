package com.plajah.app

import android.app.Activity
import android.content.Intent
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSArray
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.PermissionCallback
import com.plajah.app.data.NativeFileEntry
import com.plajah.app.data.NativeStorageRoot
import com.plajah.app.data.PlajahFileSystemManager
import java.util.concurrent.Executors

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
@CapacitorPlugin(
    name = "PlajahFiles",
    permissions = [
        com.getcapacitor.annotation.Permission(
            strings = [
                android.Manifest.permission.READ_MEDIA_IMAGES,
                android.Manifest.permission.READ_MEDIA_VIDEO,
                android.Manifest.permission.READ_MEDIA_AUDIO,
            ],
            alias = "media33",
        ),
        com.getcapacitor.annotation.Permission(
            strings = [android.Manifest.permission.READ_EXTERNAL_STORAGE],
            alias = "storageLegacy",
        ),
    ],
)
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

    private val ioExecutor = Executors.newCachedThreadPool()

    private fun rootToJson(r: NativeStorageRoot): JSObject = JSObject().apply {
        put("id", r.id)
        put("label", r.label)
        put("kind", r.kind)
        put("path", r.path)
        put("totalBytes", r.totalBytes)
        put("freeBytes", r.freeBytes)
        put("writable", r.writable)
        if (r.badge != null) put("badge", r.badge)
        if (r.protocol != null) put("protocol", r.protocol)
    }

    private fun entryToJson(e: NativeFileEntry): JSObject = JSObject().apply {
        put("name", e.name)
        put("path", e.path)
        put("isDirectory", e.isDirectory)
        put("size", e.size)
        put("lastModified", e.lastModified)
        put("mimeType", e.mimeType)
        if (e.streamUrl != null) put("streamUrl", e.streamUrl)
        if (e.thumbUrl != null) put("thumbUrl", e.thumbUrl)
        put("isReadOnly", e.isReadOnly)
    }

    private fun JSArray?.toStringList(): List<String> {
        if (this == null) return emptyList()
        val out = ArrayList<String>(length())
        for (i in 0 until length()) {
            val s = optString(i, "")
            if (s.isNotBlank()) out += s
        }
        return out
    }

    @PluginMethod
    fun getStorageRoots(call: PluginCall) {
        ioExecutor.execute {
            try {
                val roots = PlajahFileSystemManager.getStorageRoots(context)
                val arr = JSArray()
                roots.forEach { arr.put(rootToJson(it)) }
                call.resolve(
                    JSObject()
                        .put("roots", arr)
                        .put("permissionsGranted", PlajahFileSystemManager.hasStorageAccess(context)),
                )
            } catch (e: Exception) {
                call.reject(e.message ?: "Failed to read storage roots")
            }
        }
    }

    @PluginMethod
    fun requestStoragePermission(call: PluginCall) {
        if (PlajahFileSystemManager.hasStorageAccess(context)) {
            call.resolve(JSObject().put("granted", true))
            return
        }
        val alias = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) "media33" else "storageLegacy"
        requestPermissionForAlias(alias, call, "onStoragePermissionResult")
    }

    @PermissionCallback
    private fun onStoragePermissionResult(call: PluginCall) {
        call.resolve(JSObject().put("granted", PlajahFileSystemManager.hasStorageAccess(context)))
    }

    @PluginMethod
    fun pickSafFolder(call: PluginCall) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
            addFlags(
                Intent.FLAG_GRANT_READ_URI_PERMISSION or
                    Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                    Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or
                    Intent.FLAG_GRANT_PREFIX_URI_PERMISSION,
            )
        }
        startActivityForResult(call, intent, "onSafFolderPicked")
    }

    @ActivityCallback
    private fun onSafFolderPicked(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            call.resolve(JSObject().put("cancelled", true))
            return
        }
        try {
            val root = PlajahFileSystemManager.registerSafTree(context, uri)
            call.resolve(JSObject().put("cancelled", false).put("root", rootToJson(root)))
        } catch (e: Exception) {
            call.reject(e.message ?: "Could not grant folder")
        }
    }

    @PluginMethod
    fun removeSafFolder(call: PluginCall) {
        val uri = call.getString("uri") ?: return call.reject("uri required")
        PlajahFileSystemManager.removeSafTree(context, uri)
        call.resolve(JSObject().put("success", true))
    }

    @PluginMethod
    fun listDirectory(call: PluginCall) {
        val path = call.getString("path") ?: ""
        if (path.isBlank()) return call.reject("path required")
        val recursive = call.getBoolean("recursive", false) ?: false
        val query = call.getString("query") ?: ""
        val limit = call.getInt("limit") ?: 1500
        ioExecutor.execute {
            try {
                val entries = PlajahFileSystemManager.listDirectory(context, path, recursive, query, limit)
                val arr = JSArray()
                entries.forEach { arr.put(entryToJson(it)) }
                call.resolve(JSObject().put("path", path).put("entries", arr))
            } catch (e: Exception) {
                call.reject(e.message ?: "Failed to list directory")
            }
        }
    }

    @PluginMethod
    fun createFolder(call: PluginCall) {
        val parentPath = call.getString("parentPath") ?: ""
        val name = call.getString("name") ?: ""
        ioExecutor.execute {
            try {
                val path = PlajahFileSystemManager.createFolder(context, parentPath, name)
                call.resolve(JSObject().put("success", true).put("path", path))
            } catch (e: Exception) {
                call.resolve(JSObject().put("success", false).put("error", e.message ?: "Create folder failed"))
            }
        }
    }

    @PluginMethod
    fun renameEntry(call: PluginCall) {
        val path = call.getString("path") ?: ""
        val newName = call.getString("newName") ?: ""
        ioExecutor.execute {
            try {
                val newPath = PlajahFileSystemManager.renameEntry(context, path, newName)
                call.resolve(JSObject().put("success", true).put("newPath", newPath))
            } catch (e: Exception) {
                call.resolve(JSObject().put("success", false).put("error", e.message ?: "Rename failed"))
            }
        }
    }

    @PluginMethod
    fun copyEntries(call: PluginCall) {
        val paths = call.getArray("paths").toStringList()
        val targetDir = call.getString("targetDir") ?: ""
        ioExecutor.execute {
            try {
                val copied = PlajahFileSystemManager.copyEntries(context, paths, targetDir)
                call.resolve(JSObject().put("success", true).put("copied", copied))
            } catch (e: Exception) {
                call.resolve(JSObject().put("success", false).put("error", e.message ?: "Copy failed"))
            }
        }
    }

    @PluginMethod
    fun moveEntries(call: PluginCall) {
        val paths = call.getArray("paths").toStringList()
        val targetDir = call.getString("targetDir") ?: ""
        ioExecutor.execute {
            try {
                val moved = PlajahFileSystemManager.moveEntries(context, paths, targetDir)
                call.resolve(JSObject().put("success", true).put("moved", moved))
            } catch (e: Exception) {
                call.resolve(JSObject().put("success", false).put("error", e.message ?: "Move failed"))
            }
        }
    }

    @PluginMethod
    fun deleteEntries(call: PluginCall) {
        val paths = call.getArray("paths").toStringList()
        ioExecutor.execute {
            try {
                val deleted = PlajahFileSystemManager.deleteEntries(context, paths)
                call.resolve(JSObject().put("success", true).put("deleted", deleted))
            } catch (e: Exception) {
                call.resolve(JSObject().put("success", false).put("error", e.message ?: "Delete failed"))
            }
        }
    }

    @PluginMethod
    fun zipEntries(call: PluginCall) {
        val paths = call.getArray("paths").toStringList()
        val targetZipPath = call.getString("targetZipPath") ?: ""
        ioExecutor.execute {
            try {
                val zipPath = PlajahFileSystemManager.zipEntries(context, paths, targetZipPath)
                call.resolve(JSObject().put("success", true).put("zipPath", zipPath))
            } catch (e: Exception) {
                call.resolve(JSObject().put("success", false).put("error", e.message ?: "Zip failed"))
            }
        }
    }

    @PluginMethod
    fun unzipArchive(call: PluginCall) {
        val zipPath = call.getString("zipPath") ?: ""
        val targetDir = call.getString("targetDir") ?: ""
        ioExecutor.execute {
            try {
                val count = PlajahFileSystemManager.unzipArchive(context, zipPath, targetDir)
                call.resolve(JSObject().put("success", true).put("count", count))
            } catch (e: Exception) {
                call.resolve(JSObject().put("success", false).put("error", e.message ?: "Unzip failed"))
            }
        }
    }

    @PluginMethod
    fun readTextPreview(call: PluginCall) {
        val path = call.getString("path") ?: ""
        val maxBytes = call.getInt("maxBytes") ?: 262_144
        ioExecutor.execute {
            try {
                val (text, truncated, size) = PlajahFileSystemManager.readTextPreview(context, path, maxBytes)
                call.resolve(JSObject().put("success", true).put("text", text).put("truncated", truncated).put("size", size))
            } catch (e: Exception) {
                call.resolve(JSObject().put("success", false).put("error", e.message ?: "Read failed"))
            }
        }
    }

    @PluginMethod
    fun readFileBase64Chunk(call: PluginCall) {
        val path = call.getString("path") ?: ""
        val offset = call.getLong("offset") ?: 0L
        val length = call.getInt("length") ?: (512 * 1024)
        ioExecutor.execute {
            try {
                val (data, eof, totalSize) = PlajahFileSystemManager.readFileBase64Chunk(context, path, offset, length)
                call.resolve(JSObject().put("data", data).put("eof", eof).put("totalSize", totalSize))
            } catch (e: Exception) {
                call.reject(e.message ?: "Chunk read failed")
            }
        }
    }

    @PluginMethod
    fun downloadUrlToLocal(call: PluginCall) {
        val url = call.getString("url") ?: ""
        val targetDir = call.getString("targetDir") ?: ""
        val fileName = call.getString("fileName") ?: "download.bin"
        val headersObj = call.getObject("headers")
        val headers = buildMap<String, String> {
            headersObj?.keys()?.forEach { k ->
                val v = headersObj.optString(k, "")
                if (v.isNotEmpty()) put(k, v)
            }
        }
        ioExecutor.execute {
            try {
                val (path, size) = PlajahFileSystemManager.downloadUrlToLocal(context, url, targetDir, fileName, headers)
                call.resolve(JSObject().put("success", true).put("path", path).put("size", size))
            } catch (e: Exception) {
                call.resolve(JSObject().put("success", false).put("error", e.message ?: "Download failed"))
            }
        }
    }

    @PluginMethod
    fun openExternal(call: PluginCall) {
        val path = call.getString("path") ?: ""
        val mimeType = call.getString("mimeType")
        try {
            PlajahFileSystemManager.openExternal(context, path, mimeType)
            call.resolve(JSObject().put("success", true))
        } catch (e: Exception) {
            call.resolve(JSObject().put("success", false).put("error", e.message ?: "No app available to open file"))
        }
    }

    @PluginMethod
    fun shareEntries(call: PluginCall) {
        val paths = call.getArray("paths").toStringList()
        val title = call.getString("title")
        try {
            PlajahFileSystemManager.shareEntries(context, paths, title)
            call.resolve(JSObject().put("success", true))
        } catch (e: Exception) {
            call.resolve(JSObject().put("success", false).put("error", e.message ?: "Share failed"))
        }
    }

    @PluginMethod
    fun saveSyncPairs(call: PluginCall) {
        PlajahFileSystemManager.saveSyncPairsJson(context, call.getString("pairsJson") ?: "[]")
        call.resolve(JSObject().put("success", true))
    }

    @PluginMethod
    fun getSyncPairs(call: PluginCall) {
        call.resolve(JSObject().put("pairsJson", PlajahFileSystemManager.getSyncPairsJson(context)))
    }

    @PluginMethod
    fun scanLocalFolder(call: PluginCall) {
        val path = call.getString("path") ?: ""
        ioExecutor.execute {
            try {
                val list = PlajahFileSystemManager.scanLocalFolder(context, path)
                val arr = JSArray()
                list.forEach { s ->
                    arr.put(
                        JSObject()
                            .put("relPath", s.relPath)
                            .put("isDirectory", s.isDirectory)
                            .put("size", s.size)
                            .put("mtimeMs", s.mtimeMs),
                    )
                }
                call.resolve(JSObject().put("entries", arr))
            } catch (e: Exception) {
                call.reject(e.message ?: "Folder scan failed")
            }
        }
    }

    @PluginMethod
    fun saveSyncBaseline(call: PluginCall) {
        val pairId = call.getString("pairId") ?: return call.reject("pairId required")
        PlajahFileSystemManager.saveSyncBaselineJson(context, pairId, call.getString("baselineJson") ?: "{}")
        call.resolve(JSObject().put("success", true))
    }

    @PluginMethod
    fun getSyncBaseline(call: PluginCall) {
        val pairId = call.getString("pairId") ?: return call.reject("pairId required")
        call.resolve(JSObject().put("baselineJson", PlajahFileSystemManager.getSyncBaselineJson(context, pairId)))
    }

    @PluginMethod
    fun saveConnectorSecret(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id required")
        val secret = call.getString("secret") ?: ""
        try {
            PlajahFileSystemManager.saveConnectorSecret(context, id, secret)
            call.resolve(JSObject().put("success", true))
        } catch (e: Exception) {
            call.reject(e.message ?: "Secret save failed")
        }
    }

    @PluginMethod
    fun getConnectorSecret(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id required")
        call.resolve(JSObject().put("secret", PlajahFileSystemManager.getConnectorSecret(context, id)))
    }

    @PluginMethod
    fun deleteConnectorSecret(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id required")
        PlajahFileSystemManager.deleteConnectorSecret(context, id)
        call.resolve(JSObject().put("success", true))
    }
}
