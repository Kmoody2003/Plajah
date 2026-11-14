package com.plajah.app.data

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.webkit.MimeTypeMap
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class NativeStorageRoot(
    val id: String,
    val label: String,
    val kind: String,
    val path: String,
    val totalBytes: Long,
    val freeBytes: Long,
    val writable: Boolean,
    val badge: String?,
    val protocol: String? = null,
)

data class NativeFileEntry(
    val name: String,
    val path: String,
    val isDirectory: Boolean,
    val size: Long,
    val lastModified: Long,
    val mimeType: String,
    val streamUrl: String?,
    val thumbUrl: String?,
    val isReadOnly: Boolean,
)

data class NativeSnapshotEntry(
    val relPath: String,
    val isDirectory: Boolean,
    val size: Long,
    val mtimeMs: Long,
)

object PlajahFileSystemManager {
    private const val PREFS_FILES = "plajah_files_prefs"
    private const val PREFS_SECRETS = "plajah_connector_secrets"
    private const val KEY_SAF_TREES = "saf_trees"
    private const val KEY_SYNC_PAIRS = "sync_pairs"
    private const val KEYSTORE_ALIAS = "plajah_connector_secrets_aes"
    private const val MAX_LIST_LIMIT = 4000
    private const val MAX_SCAN_ENTRIES = 20_000

    fun hasStorageAccess(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && Environment.isExternalStorageManager()) {
            return true
        }
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(context, Manifest.permission.READ_MEDIA_IMAGES) == PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(context, Manifest.permission.READ_MEDIA_VIDEO) == PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(context, Manifest.permission.READ_MEDIA_AUDIO) == PackageManager.PERMISSION_GRANTED
        } else {
            ContextCompat.checkSelfPermission(context, Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
        }
    }

    fun getStorageRoots(context: Context): List<NativeStorageRoot> {
        val roots = mutableListOf<NativeStorageRoot>()
        val seenPaths = mutableSetOf<String>()

        fun addFileRoot(id: String, label: String, file: File?, badge: String) {
            if (file == null) return
            val path = file.absolutePath
            if (!seenPaths.add(path)) return
            val (total, free) = statBytes(file)
            roots += NativeStorageRoot(
                id = id,
                label = label,
                kind = "local",
                path = path,
                totalBytes = total,
                freeBytes = free,
                writable = file.canWrite() || (file.parentFile?.canWrite() == true),
                badge = badge,
            )
        }

        val downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        val documents = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS)
        val pictures = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES)
        val dcim = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM)
        val movies = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES)
        val music = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC)
        val internalRoot = Environment.getExternalStorageDirectory()

        addFileRoot("and-downloads", "Downloads", downloads, "Device")
        addFileRoot("and-documents", "Documents", documents, "Device")
        addFileRoot("and-pictures", "Pictures", pictures, "Media")
        addFileRoot("and-dcim", "Camera (DCIM)", dcim, "Media")
        addFileRoot("and-movies", "Movies", movies, "Media")
        addFileRoot("and-music", "Music", music, "Media")
        if (internalRoot != null && internalRoot.exists()) {
            addFileRoot("and-internal", "Internal Storage", internalRoot, "Phone")
        }
        addFileRoot("and-app", "Plajah Vault (App)", context.filesDir, "Private")

        // External / SD storage volumes exposed to the app
        context.getExternalFilesDirs(null).forEachIndexed { idx, extDir ->
            if (idx > 0 && extDir != null && extDir.exists()) {
                addFileRoot("and-sd-$idx", "SD Card / Volume $idx", extDir, "SD")
            }
        }

        // Persisted SAF folder trees
        for (saf in getSafTrees(context)) {
            val treeUri = Uri.parse(saf.treeUri)
            val docId = DocumentsContract.getTreeDocumentId(treeUri)
            val docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId).toString()
            roots += NativeStorageRoot(
                id = "saf:${saf.treeUri}",
                label = saf.label,
                kind = "local",
                path = docUri,
                totalBytes = 0L,
                freeBytes = 0L,
                writable = true,
                badge = "Folder",
                protocol = "saf",
            )
        }

        return roots
    }

    data class SafTreeRecord(val treeUri: String, val label: String)

    fun getSafTrees(context: Context): List<SafTreeRecord> {
        val raw = context.getSharedPreferences(PREFS_FILES, Context.MODE_PRIVATE)
            .getString(KEY_SAF_TREES, "[]") ?: "[]"
        val out = mutableListOf<SafTreeRecord>()
        try {
            val arr = JSONArray(raw)
            for (i in 0 until arr.length()) {
                val obj = arr.optJSONObject(i) ?: continue
                val uri = obj.optString("treeUri")
                if (uri.isNotBlank()) {
                    out += SafTreeRecord(uri, obj.optString("label", "Folder"))
                }
            }
        } catch (_: Exception) { }
        return out
    }

    fun registerSafTree(context: Context, treeUri: Uri): NativeStorageRoot {
        try {
            val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            context.contentResolver.takePersistableUriPermission(treeUri, flags)
        } catch (_: Exception) {
            try {
                context.contentResolver.takePersistableUriPermission(treeUri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            } catch (_: Exception) { }
        }
        val docId = DocumentsContract.getTreeDocumentId(treeUri)
        val docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId)
        val displayLabel = queryDocumentDisplayName(context, docUri)
            ?: docId.substringAfterLast(':').substringAfterLast('/').ifBlank { "Granted Folder" }

        val existing = getSafTrees(context).filterNot { it.treeUri == treeUri.toString() }.toMutableList()
        existing += SafTreeRecord(treeUri.toString(), displayLabel)
        val arr = JSONArray()
        existing.forEach { rec ->
            arr.put(JSONObject().put("treeUri", rec.treeUri).put("label", rec.label))
        }
        context.getSharedPreferences(PREFS_FILES, Context.MODE_PRIVATE)
            .edit().putString(KEY_SAF_TREES, arr.toString()).apply()

        return NativeStorageRoot(
            id = "saf:$treeUri",
            label = displayLabel,
            kind = "local",
            path = docUri.toString(),
            totalBytes = 0L,
            freeBytes = 0L,
            writable = true,
            badge = "Folder",
            protocol = "saf",
        )
    }

    fun removeSafTree(context: Context, uriOrDocPath: String) {
        val remaining = getSafTrees(context).filterNot {
            it.treeUri == uriOrDocPath || uriOrDocPath.startsWith(it.treeUri) || uriOrDocPath.contains(Uri.encode(DocumentsContract.getTreeDocumentId(Uri.parse(it.treeUri))))
        }
        val arr = JSONArray()
        remaining.forEach { rec ->
            arr.put(JSONObject().put("treeUri", rec.treeUri).put("label", rec.label))
        }
        context.getSharedPreferences(PREFS_FILES, Context.MODE_PRIVATE)
            .edit().putString(KEY_SAF_TREES, arr.toString()).apply()
    }

    fun listDirectory(
        context: Context,
        path: String,
        recursive: Boolean = false,
        query: String = "",
        limit: Int = 1500,
    ): List<NativeFileEntry> {
        val capped = limit.coerceIn(1, MAX_LIST_LIMIT)
        val needle = query.trim().lowercase()
        val out = mutableListOf<NativeFileEntry>()

        if (isSafUri(path)) {
            listSafDirectory(context, Uri.parse(path), recursive, needle, capped, out)
            return out
        }

        val dir = File(path)
        if (dir.exists() && dir.isDirectory) {
            if (!recursive) {
                val children = dir.listFiles()
                if (children != null) {
                    for (child in children) {
                        if (out.size >= capped) break
                        if (child.name.startsWith(".")) continue
                        if (needle.isNotEmpty() && !child.name.lowercase().contains(needle)) continue
                        out += fileToEntry(child)
                    }
                }
            } else {
                collectFileRecursive(dir, needle, capped, out)
            }
        }

        // Scoped storage fallback: on Android 11+ without All Files access, File.listFiles() on public media
        // dirs can omit other apps' media even when READ_MEDIA_* is granted. Supplement via MediaStore.
        if (out.isEmpty() && !recursive) {
            supplementFromMediaStore(context, dir, needle, capped, out)
        }
        return out
    }

    private fun collectFileRecursive(dir: File, needle: String, limit: Int, out: MutableList<NativeFileEntry>) {
        val children = dir.listFiles() ?: return
        for (child in children) {
            if (out.size >= limit) return
            if (child.name.startsWith(".")) continue
            if (needle.isEmpty() || child.name.lowercase().contains(needle)) {
                out += fileToEntry(child)
            }
            if (child.isDirectory && !child.isSymlinkCompat()) {
                collectFileRecursive(child, needle, limit, out)
            }
        }
    }

    private fun File.isSymlinkCompat(): Boolean {
        return try {
            val canon = parentFile?.let { File(it.canonicalFile, name) } ?: this
            canon.canonicalFile != canon.absoluteFile
        } catch (_: Exception) {
            false
        }
    }

    private fun supplementFromMediaStore(
        context: Context,
        dir: File,
        needle: String,
        limit: Int,
        out: MutableList<NativeFileEntry>,
    ) {
        val dirPrefix = dir.absolutePath.trimEnd('/') + "/"
        val seen = out.map { it.path }.toMutableSet()
        val collection = MediaStore.Files.getContentUri("external")
        val projection = arrayOf(
            MediaStore.Files.FileColumns._ID,
            MediaStore.Files.FileColumns.DISPLAY_NAME,
            MediaStore.Files.FileColumns.DATA,
            MediaStore.Files.FileColumns.SIZE,
            MediaStore.Files.FileColumns.DATE_MODIFIED,
            MediaStore.Files.FileColumns.MIME_TYPE,
        )
        val sel = "${MediaStore.Files.FileColumns.DATA} LIKE ?"
        val args = arrayOf("$dirPrefix%")
        try {
            context.contentResolver.query(collection, projection, sel, args, "${MediaStore.Files.FileColumns.DATE_MODIFIED} DESC")?.use { c ->
                val idIdx = c.getColumnIndex(MediaStore.Files.FileColumns._ID)
                val nameIdx = c.getColumnIndex(MediaStore.Files.FileColumns.DISPLAY_NAME)
                val dataIdx = c.getColumnIndex(MediaStore.Files.FileColumns.DATA)
                val sizeIdx = c.getColumnIndex(MediaStore.Files.FileColumns.SIZE)
                val modIdx = c.getColumnIndex(MediaStore.Files.FileColumns.DATE_MODIFIED)
                val mimeIdx = c.getColumnIndex(MediaStore.Files.FileColumns.MIME_TYPE)

                while (c.moveToNext() && out.size < limit) {
                    val data = if (dataIdx >= 0) c.getString(dataIdx) else null
                    if (data.isNullOrBlank()) continue
                    val rel = data.removePrefix(dirPrefix)
                    if (rel.contains('/')) continue // direct children only
                    val name = (if (nameIdx >= 0) c.getString(nameIdx) else null) ?: File(data).name
                    if (needle.isNotEmpty() && !name.lowercase().contains(needle)) continue
                    val id = if (idIdx >= 0) c.getLong(idIdx) else 0L
                    val contentUri = ContentUris.withAppendedId(collection, id).toString()
                    val canonicalPath = if (File(data).canRead()) data else contentUri
                    if (!seen.add(canonicalPath)) continue
                    val mime = (if (mimeIdx >= 0) c.getString(mimeIdx) else null) ?: guessMimeType(name)
                    val streamUrl = if (canonicalPath.startsWith("content://")) "/_capacitor_content_$canonicalPath" else "/_capacitor_file_$canonicalPath"
                    out += NativeFileEntry(
                        name = name,
                        path = canonicalPath,
                        isDirectory = false,
                        size = if (sizeIdx >= 0) c.getLong(sizeIdx) else 0L,
                        lastModified = (if (modIdx >= 0) c.getLong(modIdx) else 0L) * 1000L,
                        mimeType = mime,
                        streamUrl = streamUrl,
                        thumbUrl = if (mime.startsWith("image/")) streamUrl else null,
                        isReadOnly = !File(data).canWrite(),
                    )
                }
            }
        } catch (_: Exception) { }
    }

    private fun listSafDirectory(
        context: Context,
        dirUri: Uri,
        recursive: Boolean,
        needle: String,
        limit: Int,
        out: MutableList<NativeFileEntry>,
    ) {
        val docId = try {
            DocumentsContract.getDocumentId(dirUri)
        } catch (_: Exception) {
            DocumentsContract.getTreeDocumentId(dirUri)
        }
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(dirUri, docId)
        val proj = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_SIZE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED,
            DocumentsContract.Document.COLUMN_FLAGS,
        )
        val subDirs = mutableListOf<Uri>()
        context.contentResolver.query(childrenUri, proj, null, null, null)?.use { c ->
            val idIdx = c.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
            val nameIdx = c.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
            val mimeIdx = c.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE)
            val sizeIdx = c.getColumnIndex(DocumentsContract.Document.COLUMN_SIZE)
            val modIdx = c.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED)
            val flagIdx = c.getColumnIndex(DocumentsContract.Document.COLUMN_FLAGS)

            while (c.moveToNext() && out.size < limit) {
                val childId = c.getString(idIdx) ?: continue
                val name = c.getString(nameIdx) ?: childId
                val mime = c.getString(mimeIdx) ?: guessMimeType(name)
                val isDir = mime == DocumentsContract.Document.MIME_TYPE_DIR
                val childUri = DocumentsContract.buildDocumentUriUsingTree(dirUri, childId)
                if (isDir && recursive) subDirs += childUri
                if (needle.isNotEmpty() && !name.lowercase().contains(needle)) continue
                val flags = if (flagIdx >= 0) c.getInt(flagIdx) else 0
                val writable = (flags and DocumentsContract.Document.FLAG_SUPPORTS_WRITE) != 0 ||
                    (flags and DocumentsContract.Document.FLAG_DIR_SUPPORTS_CREATE) != 0
                val streamUrl = if (isDir) null else "/_capacitor_content_${childUri}"
                out += NativeFileEntry(
                    name = name,
                    path = childUri.toString(),
                    isDirectory = isDir,
                    size = if (isDir || sizeIdx < 0) 0L else c.getLong(sizeIdx),
                    lastModified = if (modIdx < 0) 0L else c.getLong(modIdx),
                    mimeType = mime,
                    streamUrl = streamUrl,
                    thumbUrl = if (!isDir && mime.startsWith("image/")) streamUrl else null,
                    isReadOnly = !writable,
                )
            }
        }
        if (recursive) {
            for (sub in subDirs) {
                if (out.size >= limit) break
                listSafDirectory(context, sub, true, needle, limit, out)
            }
        }
    }

    fun createFolder(context: Context, parentPath: String, name: String): String {
        val clean = sanitizeFileName(name)
        require(clean.isNotEmpty()) { "Invalid folder name" }
        if (isSafUri(parentPath)) {
            val created = DocumentsContract.createDocument(
                context.contentResolver,
                Uri.parse(parentPath),
                DocumentsContract.Document.MIME_TYPE_DIR,
                clean,
            ) ?: error("Could not create folder inside SAF tree")
            return created.toString()
        }
        val target = File(parentPath, clean)
        if (!target.exists() && !target.mkdirs()) error("Could not create folder: ${target.absolutePath}")
        return target.absolutePath
    }

    fun renameEntry(context: Context, path: String, newName: String): String {
        val clean = sanitizeFileName(newName)
        require(clean.isNotEmpty()) { "Invalid name" }
        if (isSafUri(path)) {
            val renamed = DocumentsContract.renameDocument(context.contentResolver, Uri.parse(path), clean)
                ?: error("Rename failed")
            return renamed.toString()
        }
        val src = File(path)
        require(src.exists()) { "Source not found" }
        val dst = File(src.parentFile, clean)
        require(!dst.exists()) { "Destination already exists" }
        if (!src.renameTo(dst)) error("Rename failed")
        return dst.absolutePath
    }

    fun copyEntries(context: Context, paths: List<String>, targetDir: String): Int {
        var count = 0
        for (p in paths) {
            copySingle(context, p, targetDir)
            count++
        }
        return count
    }

    fun moveEntries(context: Context, paths: List<String>, targetDir: String): Int {
        var count = 0
        for (p in paths) {
            if (!isSafUri(p) && !isSafUri(targetDir)) {
                val src = File(p)
                val dst = uniqueDestFile(File(targetDir, src.name))
                if (src.renameTo(dst)) {
                    count++
                    continue
                }
            }
            copySingle(context, p, targetDir)
            deleteSingle(context, p)
            count++
        }
        return count
    }

    fun deleteEntries(context: Context, paths: List<String>): Int {
        var count = 0
        for (p in paths) {
            if (deleteSingle(context, p)) count++
        }
        return count
    }

    private fun copySingle(context: Context, srcPath: String, targetDir: String) {
        val name = getEntryName(context, srcPath)
        val isDir = isEntryDirectory(context, srcPath)
        if (isDir) {
            val childDir = createFolder(context, targetDir, name)
            val children = listDirectory(context, srcPath, recursive = false, query = "", limit = MAX_LIST_LIMIT)
            for (c in children) copySingle(context, c.path, childDir)
            return
        }

        val mime = guessMimeType(name)
        openInputStream(context, srcPath).use { input ->
            openOutputStreamForNewChild(context, targetDir, name, mime).use { output ->
                input.copyTo(output, 65_536)
            }
        }
    }

    private fun deleteSingle(context: Context, path: String): Boolean {
        if (isSafUri(path)) {
            return DocumentsContract.deleteDocument(context.contentResolver, Uri.parse(path))
        }
        val f = File(path)
        return if (f.exists()) f.deleteRecursively() else false
    }

    fun zipEntries(context: Context, paths: List<String>, targetZipPath: String): String {
        val outFile = File(targetZipPath)
        outFile.parentFile?.mkdirs()
        ZipOutputStream(BufferedOutputStream(FileOutputStream(outFile))).use { zos ->
            for (p in paths) {
                addPathToZip(context, p, getEntryName(context, p), zos)
            }
        }
        return outFile.absolutePath
    }

    private fun addPathToZip(context: Context, path: String, zipRelName: String, zos: ZipOutputStream) {
        if (isEntryDirectory(context, path)) {
            val dirEntry = ZipEntry(zipRelName.trimEnd('/') + "/")
            zos.putNextEntry(dirEntry)
            zos.closeEntry()
            val children = listDirectory(context, path, recursive = false, query = "", limit = MAX_LIST_LIMIT)
            for (c in children) {
                addPathToZip(context, c.path, "$zipRelName/${c.name}", zos)
            }
            return
        }
        zos.putNextEntry(ZipEntry(zipRelName))
        openInputStream(context, path).use { it.copyTo(zos, 65_536) }
        zos.closeEntry()
    }

    fun unzipArchive(context: Context, zipPath: String, targetDir: String): Int {
        val destRoot = File(targetDir).apply { mkdirs() }
        val canonicalRoot = destRoot.canonicalPath + File.separator
        var count = 0
        openInputStream(context, zipPath).use { raw ->
            ZipInputStream(BufferedInputStream(raw)).use { zis ->
                var entry: ZipEntry? = zis.nextEntry
                while (entry != null) {
                    val outFile = File(destRoot, entry.name)
                    if (!outFile.canonicalPath.startsWith(canonicalRoot) && outFile.canonicalPath != destRoot.canonicalPath) {
                        throw SecurityException("Blocked zip-slip entry: ${entry.name}")
                    }
                    if (entry.isDirectory) {
                        outFile.mkdirs()
                    } else {
                        outFile.parentFile?.mkdirs()
                        FileOutputStream(outFile).use { zis.copyTo(it, 65_536) }
                        count++
                    }
                    zis.closeEntry()
                    entry = zis.nextEntry
                }
            }
        }
        return count
    }

    fun readTextPreview(context: Context, path: String, maxBytes: Int): Triple<String, Boolean, Long> {
        val cap = maxBytes.coerceIn(1024, 4 * 1024 * 1024)
        val totalSize = getEntrySize(context, path)
        val buf = ByteArray(cap)
        var read = 0
        openInputStream(context, path).use { input ->
            while (read < cap) {
                val n = input.read(buf, read, cap - read)
                if (n <= 0) break
                read += n
            }
        }
        val text = String(buf, 0, read, Charsets.UTF_8)
        val truncated = if (totalSize > 0L) totalSize > read else read == cap
        return Triple(text, truncated, if (totalSize > 0L) totalSize else read.toLong())
    }

    fun readFileBase64Chunk(context: Context, path: String, offset: Long, length: Int): Triple<String, Boolean, Long> {
        val chunkLen = length.coerceIn(1024, 2 * 1024 * 1024)
        if (!isSafUri(path)) {
            val f = File(path)
            require(f.exists() && f.isFile) { "File not found" }
            val total = f.length()
            if (offset >= total) return Triple("", true, total)
            val toRead = minOf(chunkLen.toLong(), total - offset).toInt()
            val buf = ByteArray(toRead)
            RandomAccessFile(f, "r").use { raf ->
                raf.seek(offset)
                raf.readFully(buf)
            }
            return Triple(Base64.encodeToString(buf, Base64.NO_WRAP), offset + toRead >= total, total)
        }

        val total = getEntrySize(context, path)
        val buf = ByteArray(chunkLen)
        var read = 0
        openInputStream(context, path).use { input ->
            var skipped = 0L
            while (skipped < offset) {
                val s = input.skip(offset - skipped)
                if (s <= 0) {
                    if (input.read() < 0) return Triple("", true, total)
                    skipped++
                } else {
                    skipped += s
                }
            }
            while (read < chunkLen) {
                val n = input.read(buf, read, chunkLen - read)
                if (n <= 0) break
                read += n
            }
        }
        val b64 = if (read > 0) Base64.encodeToString(buf, 0, read, Base64.NO_WRAP) else ""
        val eof = read < chunkLen || (total > 0L && offset + read >= total)
        return Triple(b64, eof, total)
    }

    fun downloadUrlToLocal(
        context: Context,
        url: String,
        targetDir: String,
        fileName: String,
        headers: Map<String, String> = emptyMap(),
    ): Pair<String, Long> {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 20_000
            readTimeout = 120_000
            headers.forEach { (k, v) -> setRequestProperty(k, v) }
        }
        try {
            val code = conn.responseCode
            if (code !in 200..299) error("Download HTTP $code")
            val cleanName = sanitizeFileName(fileName).ifBlank { "download.bin" }
            val mime = guessMimeType(cleanName)
            var written = 0L
            if (isSafUri(targetDir)) {
                val created = DocumentsContract.createDocument(context.contentResolver, Uri.parse(targetDir), mime, cleanName)
                    ?: error("Could not create document")
                conn.inputStream.use { input ->
                    (context.contentResolver.openOutputStream(created) ?: error("Cannot write document")).use { out ->
                        written = input.copyTo(out, 65_536)
                    }
                }
                return Pair(created.toString(), written)
            }
            val dir = File(targetDir).apply { mkdirs() }
            val dest = uniqueDestFile(File(dir, cleanName))
            conn.inputStream.use { input ->
                FileOutputStream(dest).use { out ->
                    written = input.copyTo(out, 65_536)
                }
            }
            return Pair(dest.absolutePath, written)
        } finally {
            conn.disconnect()
        }
    }

    fun toSharableUri(context: Context, path: String): Uri {
        if (path.startsWith("content://")) return Uri.parse(path)
        val file = File(path)
        return try {
            FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        } catch (_: IllegalArgumentException) {
            // Fallback for paths outside FileProvider XML roots: stage in app cache/share-tmp
            val tmpDir = File(context.cacheDir, "share-tmp").apply { mkdirs() }
            val staged = File(tmpDir, file.name)
            file.inputStream().use { input -> FileOutputStream(staged).use { output -> input.copyTo(output, 65_536) } }
            FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", staged)
        }
    }

    fun openExternal(context: Context, path: String, explicitMime: String? = null) {
        val uri = toSharableUri(context, path)
        val mime = explicitMime?.takeIf { it.isNotBlank() } ?: guessMimeType(getEntryName(context, path))
        val viewIntent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, mime)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val chooser = Intent.createChooser(viewIntent, getEntryName(context, path)).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(chooser)
    }

    fun shareEntries(context: Context, paths: List<String>, title: String? = null) {
        require(paths.isNotEmpty()) { "Nothing selected to share" }
        val uris = ArrayList<Uri>(paths.map { toSharableUri(context, it) })
        val intent = if (uris.size == 1) {
            Intent(Intent.ACTION_SEND).apply {
                type = guessMimeType(getEntryName(context, paths.first()))
                putExtra(Intent.EXTRA_STREAM, uris.first())
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        } else {
            Intent(Intent.ACTION_SEND_MULTIPLE).apply {
                type = "*/*"
                putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        }
        val chooser = Intent.createChooser(intent, title ?: "Share").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(chooser)
    }

    fun getSyncPairsJson(context: Context): String =
        context.getSharedPreferences(PREFS_FILES, Context.MODE_PRIVATE).getString(KEY_SYNC_PAIRS, "[]") ?: "[]"

    fun saveSyncPairsJson(context: Context, pairsJson: String) {
        context.getSharedPreferences(PREFS_FILES, Context.MODE_PRIVATE)
            .edit().putString(KEY_SYNC_PAIRS, pairsJson).apply()
    }

    fun getSyncBaselineJson(context: Context, pairId: String): String =
        context.getSharedPreferences(PREFS_FILES, Context.MODE_PRIVATE)
            .getString("baseline_${sanitizeId(pairId)}", "{}") ?: "{}"

    fun saveSyncBaselineJson(context: Context, pairId: String, baselineJson: String) {
        context.getSharedPreferences(PREFS_FILES, Context.MODE_PRIVATE)
            .edit().putString("baseline_${sanitizeId(pairId)}", baselineJson).apply()
    }

    fun scanLocalFolder(context: Context, rootPath: String): List<NativeSnapshotEntry> {
        val entries = mutableListOf<NativeSnapshotEntry>()
        if (isSafUri(rootPath)) {
            scanSafTree(context, Uri.parse(rootPath), "", entries)
            return entries
        }
        val root = File(rootPath)
        if (!root.exists() || !root.isDirectory) return entries
        scanFileTree(root, "", entries)
        return entries
    }

    private fun scanFileTree(dir: File, relPrefix: String, out: MutableList<NativeSnapshotEntry>) {
        val children = dir.listFiles() ?: return
        for (child in children) {
            if (out.size >= MAX_SCAN_ENTRIES) return
            if (child.name.startsWith(".")) continue
            val rel = if (relPrefix.isEmpty()) child.name else "$relPrefix/${child.name}"
            if (child.isDirectory && !child.isSymlinkCompat()) {
                out += NativeSnapshotEntry(rel, true, 0L, child.lastModified())
                scanFileTree(child, rel, out)
            } else if (child.isFile) {
                out += NativeSnapshotEntry(rel, false, child.length(), child.lastModified())
            }
        }
    }

    private fun scanSafTree(context: Context, dirUri: Uri, relPrefix: String, out: MutableList<NativeSnapshotEntry>) {
        val children = listDirectory(context, dirUri.toString(), recursive = false, query = "", limit = MAX_LIST_LIMIT)
        for (c in children) {
            if (out.size >= MAX_SCAN_ENTRIES) return
            val rel = if (relPrefix.isEmpty()) c.name else "$relPrefix/${c.name}"
            out += NativeSnapshotEntry(rel, c.isDirectory, c.size, c.lastModified)
            if (c.isDirectory) {
                scanSafTree(context, Uri.parse(c.path), rel, out)
            }
        }
    }

    // ── Keystore-backed AES-GCM vault for FTP/WebDAV/SMB passwords ──────────────────────────────

    fun saveConnectorSecret(context: Context, id: String, secret: String) {
        val key = getOrCreateKeystoreKey()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key)
        val encrypted = cipher.doFinal(secret.toByteArray(Charsets.UTF_8))
        val encoded = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" +
            Base64.encodeToString(encrypted, Base64.NO_WRAP)
        context.getSharedPreferences(PREFS_SECRETS, Context.MODE_PRIVATE)
            .edit().putString(sanitizeId(id), encoded).apply()
    }

    fun getConnectorSecret(context: Context, id: String): String? {
        val raw = context.getSharedPreferences(PREFS_SECRETS, Context.MODE_PRIVATE)
            .getString(sanitizeId(id), null) ?: return null
        val parts = raw.split(':', limit = 2)
        if (parts.size != 2) return null
        return try {
            val iv = Base64.decode(parts[0], Base64.NO_WRAP)
            val data = Base64.decode(parts[1], Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKeystoreKey(), GCMParameterSpec(128, iv))
            String(cipher.doFinal(data), Charsets.UTF_8)
        } catch (_: Exception) {
            null
        }
    }

    fun deleteConnectorSecret(context: Context, id: String) {
        context.getSharedPreferences(PREFS_SECRETS, Context.MODE_PRIVATE)
            .edit().remove(sanitizeId(id)).apply()
    }

    private fun getOrCreateKeystoreKey(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = ks.getKey(KEYSTORE_ALIAS, null) as? SecretKey
        if (existing != null) return existing
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(
                KEYSTORE_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return gen.generateKey()
    }

    // ── Helpers ───────────────────────────────────────────────────────────────────────────────────

    private fun isSafUri(path: String): Boolean = path.startsWith("content://")

    private fun statBytes(file: File): Pair<Long, Long> {
        return try {
            if (!file.exists()) return Pair(0L, 0L)
            val stat = StatFs(file.absolutePath)
            Pair(stat.totalBytes, stat.availableBytes)
        } catch (_: Exception) {
            Pair(0L, 0L)
        }
    }

    private fun fileToEntry(file: File): NativeFileEntry {
        val isDir = file.isDirectory
        val mime = if (isDir) "inode/directory" else guessMimeType(file.name)
        val streamUrl = if (isDir) null else "/_capacitor_file_${file.absolutePath}"
        return NativeFileEntry(
            name = file.name,
            path = file.absolutePath,
            isDirectory = isDir,
            size = if (isDir) 0L else file.length(),
            lastModified = file.lastModified(),
            mimeType = mime,
            streamUrl = streamUrl,
            thumbUrl = if (!isDir && mime.startsWith("image/")) streamUrl else null,
            isReadOnly = !file.canWrite(),
        )
    }

    private fun openInputStream(context: Context, path: String): InputStream {
        if (isSafUri(path)) {
            return context.contentResolver.openInputStream(Uri.parse(path))
                ?: error("Cannot read URI: $path")
        }
        return FileInputStream(File(path))
    }

    private fun openOutputStreamForNewChild(context: Context, targetDir: String, name: String, mime: String): OutputStream {
        if (isSafUri(targetDir)) {
            val created = DocumentsContract.createDocument(context.contentResolver, Uri.parse(targetDir), mime, name)
                ?: error("Could not create SAF target file")
            return context.contentResolver.openOutputStream(created) ?: error("Cannot open output stream")
        }
        val dest = uniqueDestFile(File(targetDir, name))
        dest.parentFile?.mkdirs()
        return FileOutputStream(dest)
    }

    private fun queryDocumentDisplayName(context: Context, uri: Uri): String? {
        return try {
            context.contentResolver.query(uri, arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst()) c.getString(0) else null
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun getEntryName(context: Context, path: String): String {
        if (isSafUri(path)) return queryDocumentDisplayName(context, Uri.parse(path)) ?: "item"
        return File(path).name.ifBlank { path }
    }

    private fun getEntrySize(context: Context, path: String): Long {
        if (!isSafUri(path)) return File(path).length()
        return try {
            context.contentResolver.query(Uri.parse(path), arrayOf(DocumentsContract.Document.COLUMN_SIZE), null, null, null)?.use { c ->
                if (c.moveToFirst()) c.getLong(0) else 0L
            } ?: 0L
        } catch (_: Exception) {
            0L
        }
    }

    private fun isEntryDirectory(context: Context, path: String): Boolean {
        if (!isSafUri(path)) return File(path).isDirectory
        return try {
            context.contentResolver.query(Uri.parse(path), arrayOf(DocumentsContract.Document.COLUMN_MIME_TYPE), null, null, null)?.use { c ->
                c.moveToFirst() && c.getString(0) == DocumentsContract.Document.MIME_TYPE_DIR
            } ?: false
        } catch (_: Exception) {
            false
        }
    }

    private fun sanitizeFileName(raw: String): String =
        raw.trim().replace('/', '_').replace('\\', '_').replace("..", "")

    private fun sanitizeId(raw: String): String =
        raw.map { if (it.isLetterOrDigit() || it == '_' || it == '-') it else '_' }.joinToString("")

    private fun uniqueDestFile(dest: File): File {
        if (!dest.exists()) return dest
        val parent = dest.parentFile ?: return dest
        val base = dest.nameWithoutExtension
        val ext = dest.extension.let { if (it.isNotEmpty()) ".$it" else "" }
        for (i in 1..9999) {
            val cand = File(parent, "$base ($i)$ext")
            if (!cand.exists()) return cand
        }
        return dest
    }

    fun guessMimeType(name: String): String {
        val lower = name.lowercase()
        if (lower.endsWith(".tela.json") || lower.endsWith(".tela") || lower.endsWith(".tdoc")) {
            return "application/vnd.plajah.tela+json"
        }
        if (lower.endsWith(".tela-page.json")) return "application/vnd.plajah.tela-page+json"
        val ext = name.substringAfterLast('.', "").lowercase()
        return when (ext) {
            "cbz", "comic", "pjc", "manga" -> "application/vnd.comicbook+zip"
            "cbr" -> "application/vnd.comicbook-rar"
            "lottie" -> "application/lottie+json"
            "plajah" -> "application/vnd.plajah.bundle+json"
            "ts", "tsx" -> "text/typescript"
            "mts", "m2ts" -> "video/mp2t"
            "mkv" -> "video/x-matroska"
            "webp" -> "image/webp"
            "avif" -> "image/avif"
            "heic", "heif" -> "image/heic"
            "flac" -> "audio/flac"
            "json" -> "application/json"
            "md", "markdown" -> "text/markdown"
            "pdf" -> "application/pdf"
            "zip" -> "application/zip"
            else -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "application/octet-stream"
        }
    }

    // ── Bounded-Memory Thumbnail LRU & Rich Format Extractors (Tela / Comic / Motion) ──────────

    private val thumbCacheKb: Int = ((Runtime.getRuntime().maxMemory() / 1024L).toInt() / 14).coerceIn(8 * 1024, 24 * 1024)
    private val thumbLru = object : android.util.LruCache<String, android.graphics.Bitmap>(thumbCacheKb) {
        override fun sizeOf(key: String, value: android.graphics.Bitmap): Int =
            (value.allocationByteCount / 1024).coerceAtLeast(1)
    }
    private val comicPreviewLru = android.util.LruCache<String, ComicRichPages>(12)

    fun getCachedThumb(key: String): android.graphics.Bitmap? = thumbLru.get(key)

    fun putCachedThumb(key: String, bmp: android.graphics.Bitmap) {
        if (!bmp.isRecycled) thumbLru.put(key, bmp)
    }

    fun classifyRichKind(name: String, mimeType: String = ""): AndroidRichFileKind {
        val lower = name.lowercase()
        val mime = mimeType.lowercase()
        return when {
            lower.endsWith(".tela") || lower.endsWith(".tdoc") || lower.endsWith(".tela.json") ||
                lower.endsWith(".tela-page.json") || mime.startsWith("application/vnd.plajah.tela") ->
                AndroidRichFileKind.TELA
            lower.endsWith(".cbz") || lower.endsWith(".cbr") || lower.endsWith(".comic") ||
                lower.endsWith(".pjc") || lower.endsWith(".manga") || mime.contains("comicbook") ->
                AndroidRichFileKind.COMIC
            mime.startsWith("image/") || lower.endsWith(".png") || lower.endsWith(".jpg") ||
                lower.endsWith(".jpeg") || lower.endsWith(".webp") || lower.endsWith(".gif") ||
                lower.endsWith(".avif") || lower.endsWith(".heic") ->
                AndroidRichFileKind.PHOTO
            mime.startsWith("video/") || lower.endsWith(".mp4") || lower.endsWith(".mov") ||
                lower.endsWith(".webm") || lower.endsWith(".mkv") ->
                AndroidRichFileKind.VIDEO
            mime.startsWith("audio/") || lower.endsWith(".mp3") || lower.endsWith(".wav") ||
                lower.endsWith(".flac") || lower.endsWith(".aac") || lower.endsWith(".m4a") ||
                lower.endsWith(".ogg") ->
                AndroidRichFileKind.AUDIO
            mime == "application/zip" || lower.endsWith(".zip") || lower.endsWith(".rar") || lower.endsWith(".7z") ->
                AndroidRichFileKind.ARCHIVE
            else -> AndroidRichFileKind.DOC
        }
    }

    fun extractTelaSummary(context: Context, pathOrUri: String): TelaRichSummary? {
        return try {
            val (text, _, _) = readTextPreview(context, pathOrUri, maxBytes = 1024 * 1024)
            if (text.isBlank()) return null
            val root = JSONObject(text)
            val doc = when (root.optString("format")) {
                "plajah-tela" -> root.optJSONObject("document") ?: root
                "plajah-tela-page" -> JSONObject().apply {
                    put("title", root.optString("title", "Tela Page"))
                    put("frames", JSONArray().apply { root.optJSONObject("frame")?.let { put(it) } })
                    put("devices", root.optJSONObject("devices") ?: JSONObject())
                }
                "plajah-tela-review" -> root.optJSONArray("templates")?.optJSONObject(0)?.optJSONObject("document") ?: root
                else -> root
            }
            val title = doc.optString("title").ifBlank { "Tela Document" }
            val frames = doc.optJSONArray("frames")
            val frameCount = frames?.length() ?: 0
            val motionLabels = mutableListOf<String>()

            val presetTracks = doc.optJSONObject("templatePreset")
                ?.optJSONObject("motion")
                ?.optJSONArray("tracks")
                ?.length() ?: 0
            if (presetTracks > 0) motionLabels += "Template Motion ($presetTracks)"

            var motionTemplateCount = 0
            var lottieCount = 0
            var visualizerCount = 0
            var liveFxCount = 0
            var headline: String? = null

            val devices = doc.optJSONObject("devices")
            if (devices != null) {
                val keys = devices.keys()
                while (keys.hasNext()) {
                    val dev = devices.optJSONObject(keys.next()) ?: continue
                    val kind = dev.optString("type").ifBlank { dev.optString("kind") }
                    if (kind == "VECTOR") {
                        val objs = dev.optJSONArray("objects") ?: continue
                        for (i in 0 until objs.length()) {
                            val obj = objs.optJSONObject(i) ?: continue
                            if (obj.optBoolean("hidden", false)) continue
                            when (obj.optString("kind")) {
                                "MOTION_TEMPLATE" -> motionTemplateCount++
                                "LOTTIE" -> lottieCount++
                                "VISUALIZER" -> visualizerCount++
                                "TEXT" -> if (headline == null) {
                                    headline = obj.optString("text").trim().takeIf { it.isNotEmpty() }?.take(120)
                                }
                            }
                            if (obj.optJSONObject("pixelsFx")?.optBoolean("live") == true) {
                                liveFxCount++
                            }
                        }
                    } else if (kind == "WRITER" && headline == null) {
                        val blocks = dev.optJSONArray("blocks")
                        if (blocks != null && blocks.length() > 0) {
                            headline = blocks.optJSONObject(0)?.optString("text")?.trim()?.takeIf { it.isNotEmpty() }?.take(120)
                        }
                    } else if (kind == "IMAGE" && dev.optJSONObject("pixelsFx")?.optBoolean("live") == true) {
                        liveFxCount++
                    }
                }
            }

            if (motionTemplateCount > 0) motionLabels += "Motion Graphic x$motionTemplateCount"
            if (lottieCount > 0) motionLabels += "Lottie x$lottieCount"
            if (visualizerCount > 0) motionLabels += "Visualizer x$visualizerCount"
            if (liveFxCount > 0) motionLabels += "Live FX x$liveFxCount"
            if (doc.has("living")) motionLabels += "Living Audio"

            TelaRichSummary(
                title = title,
                frameCount = frameCount.coerceAtLeast(1),
                hasAnimation = motionLabels.isNotEmpty(),
                motionLabels = motionLabels,
                headline = headline,
            )
        } catch (_: Exception) {
            null
        }
    }

    private fun isComicImageName(name: String): Boolean {
        val lower = name.lowercase()
        return !lower.startsWith("__macosx") &&
            (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") ||
                lower.endsWith(".webp") || lower.endsWith(".gif") || lower.endsWith(".avif"))
    }

    private fun decodeSampledBytes(bytes: ByteArray, maxDim: Int): android.graphics.Bitmap? {
        val bounds = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
        android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        var inSample = 1
        while (bounds.outWidth / inSample > maxDim || bounds.outHeight / inSample > maxDim) {
            inSample *= 2
        }
        val opts = android.graphics.BitmapFactory.Options().apply { inSampleSize = inSample }
        return android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
    }

    private fun compareNatural(a: String, b: String): Int {
        val regex = Regex("(\\d+|\\D+)")
        val pa = regex.findAll(a).map { it.value }.toList()
        val pb = regex.findAll(b).map { it.value }.toList()
        for (i in 0 until minOf(pa.size, pb.size)) {
            val na = pa[i].toLongOrNull()
            val nb = pb[i].toLongOrNull()
            if (na != null && nb != null) {
                if (na != nb) return na.compareTo(nb)
            } else {
                val c = pa[i].lowercase().compareTo(pb[i].lowercase())
                if (c != 0) return c
            }
        }
        return pa.size.compareTo(pb.size)
    }

    fun extractComicPreviewPages(
        context: Context,
        pathOrUri: String,
        maxPages: Int = 4,
        maxDim: Int = 460,
    ): ComicRichPages? {
        val cacheKey = "$pathOrUri|$maxPages|$maxDim"
        comicPreviewLru.get(cacheKey)?.let { return it }

        return try {
            val pages = mutableListOf<android.graphics.Bitmap>()
            val sfxLabels = mutableListOf<String>()
            var totalPages = 0
            var hasMotion = false

            if (!isSafUri(pathOrUri)) {
                val file = File(pathOrUri)
                if (!file.exists()) return null
                java.util.zip.ZipFile(file).use { zip ->
                    val allEntries = zip.entries().asSequence().toList()
                    val imageEntries = allEntries
                        .filter { !it.isDirectory && isComicImageName(it.name) && it.size in 1L..(14L * 1024L * 1024L) }
                        .sortedWith { a, b -> compareNatural(a.name, b.name) }
                    totalPages = imageEntries.size

                    for (entry in imageEntries.take(maxPages)) {
                        zip.getInputStream(entry).use { ins ->
                            val bytes = ins.readBytes()
                            decodeSampledBytes(bytes, maxDim)?.let { pages += it }
                        }
                    }

                    val metaEntry = allEntries.firstOrNull {
                        !it.isDirectory && it.size in 1L..262144L &&
                            (it.name.endsWith("manifest.json", ignoreCase = true) ||
                                it.name.endsWith("motion.json", ignoreCase = true) ||
                                it.name.endsWith("comic.json", ignoreCase = true))
                    }
                    if (metaEntry != null) {
                        val txt = zip.getInputStream(metaEntry).bufferedReader().use { it.readText() }
                        val obj = JSONObject(txt)
                        val panels = obj.optJSONArray("panels")
                        if (panels != null) {
                            for (i in 0 until panels.length()) {
                                val p = panels.optJSONObject(i) ?: continue
                                if (p.has("entrance") || p.optBoolean("isVideoLoop") || p.optBoolean("cinemagraphMode")) {
                                    hasMotion = true
                                }
                                val sfx = p.optString("sfxText").trim()
                                if (sfx.isNotEmpty() && sfxLabels.size < 4) sfxLabels += sfx
                            }
                        }
                    }
                }
            } else {
                val candidates = mutableListOf<Pair<String, ByteArray>>()
                context.contentResolver.openInputStream(Uri.parse(pathOrUri))?.use { raw ->
                    java.util.zip.ZipInputStream(raw).use { zis ->
                        var entry = zis.nextEntry
                        while (entry != null) {
                            if (!entry.isDirectory && isComicImageName(entry.name)) {
                                totalPages++
                                if (candidates.size < maxPages) {
                                    val bytes = zis.readBytes()
                                    if (bytes.size <= 14 * 1024 * 1024) candidates += entry.name to bytes
                                }
                            }
                            entry = zis.nextEntry
                        }
                    }
                }
                candidates.sortedWith { a, b -> compareNatural(a.first, b.first) }
                    .forEach { (_, bytes) -> decodeSampledBytes(bytes, maxDim)?.let { pages += it } }
            }

            if (pages.isEmpty()) return null
            val result = ComicRichPages(
                bitmaps = pages,
                totalPages = totalPages.coerceAtLeast(pages.size),
                sfxLabels = sfxLabels,
                hasMotion = hasMotion || pages.size > 1,
            )
            comicPreviewLru.put(cacheKey, result)
            result
        } catch (_: Exception) {
            null
        }
    }
}

enum class AndroidRichFileKind { PHOTO, VIDEO, AUDIO, COMIC, TELA, ARCHIVE, DOC }

data class TelaRichSummary(
    val title: String,
    val frameCount: Int,
    val hasAnimation: Boolean,
    val motionLabels: List<String>,
    val headline: String?,
)

data class ComicRichPages(
    val bitmaps: List<android.graphics.Bitmap>,
    val totalPages: Int,
    val sfxLabels: List<String>,
    val hasMotion: Boolean,
)
