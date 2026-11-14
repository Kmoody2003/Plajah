package com.plajah.app.ui.screens

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed as gridItemsIndexed
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.plajah.app.data.LocalAudioTrack
import com.plajah.app.data.LocalMediaManager
import com.plajah.app.data.LocalPhoto
import com.plajah.app.data.LocalVideo
import com.plajah.app.data.NativeFileEntry
import com.plajah.app.data.PlajahFileSystemManager
import com.plajah.app.ui.theme.PlajahBrand
import com.plajah.app.ui.theme.PlajahTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.Locale

enum class StageMediaType { PHOTO, VIDEO, AUDIO, DOC, OTHER }

data class UnifiedStageItem(
    val id: String,
    val name: String,
    val pathOrUri: String,
    val uri: Uri,
    val type: StageMediaType,
    val mimeType: String,
    val subtitle: String = "",
    val artworkUri: Uri? = null,
    val durationMs: Long = 0L,
    val sizeBytes: Long = 0L,
    val audioTrack: LocalAudioTrack? = null,
)

fun LocalPhoto.toStageItem(): UnifiedStageItem = UnifiedStageItem(
    id = "photo:$id",
    name = title,
    pathOrUri = contentUri.toString(),
    uri = contentUri,
    type = StageMediaType.PHOTO,
    mimeType = "image/*",
)

fun LocalVideo.toStageItem(): UnifiedStageItem = UnifiedStageItem(
    id = "video:$id",
    name = title,
    pathOrUri = contentUri.toString(),
    uri = contentUri,
    type = StageMediaType.VIDEO,
    mimeType = "video/*",
    durationMs = duration,
    sizeBytes = size,
)

fun LocalAudioTrack.toStageItem(): UnifiedStageItem = UnifiedStageItem(
    id = "audio:$id",
    name = title,
    pathOrUri = contentUri.toString(),
    uri = contentUri,
    type = StageMediaType.AUDIO,
    mimeType = "audio/*",
    subtitle = "$artist · $album",
    artworkUri = artworkUri,
    durationMs = duration,
    audioTrack = this,
)

fun NativeFileEntry.toStageItem(): UnifiedStageItem {
    val ext = name.substringAfterLast('.', "").lowercase()
    val effectiveMime = mimeType.ifBlank { PlajahFileSystemManager.guessMimeType(name) }
    val kind = when {
        effectiveMime.startsWith("image/") -> StageMediaType.PHOTO
        effectiveMime.startsWith("video/") -> StageMediaType.VIDEO
        effectiveMime.startsWith("audio/") -> StageMediaType.AUDIO
        effectiveMime == "application/pdf" ||
            effectiveMime.startsWith("text/") ||
            effectiveMime == "application/json" ||
            ext in setOf("ts", "tsx", "js", "jsx", "kt", "cs", "py", "md", "txt", "csv", "xml", "yml", "yaml", "log") ->
            StageMediaType.DOC
        else -> StageMediaType.OTHER
    }
    val uri = if (path.startsWith("content://")) Uri.parse(path) else Uri.fromFile(File(path))
    return UnifiedStageItem(
        id = "file:$path",
        name = name,
        pathOrUri = path,
        uri = uri,
        type = kind,
        mimeType = effectiveMime,
        subtitle = formatByteSize(size),
        sizeBytes = size,
    )
}

internal fun formatByteSize(bytes: Long): String {
    if (bytes <= 0L) return "0 B"
    val kb = 1024.0
    val mb = kb * 1024
    val gb = mb * 1024
    return when {
        bytes < kb -> "$bytes B"
        bytes < mb -> String.format(Locale.US, "%.1f KB", bytes / kb)
        bytes < gb -> String.format(Locale.US, "%.1f MB", bytes / mb)
        else -> String.format(Locale.US, "%.2f GB", bytes / gb)
    }
}

private fun formatDurationMs(ms: Long): String {
    if (ms <= 0L) return "0:00"
    val totalSec = ms / 1000L
    val mins = totalSec / 60L
    val secs = totalSec % 60L
    val hrs = mins / 60L
    return if (hrs > 0) String.format(Locale.US, "%d:%02d:%02d", hrs, mins % 60L, secs)
    else String.format(Locale.US, "%d:%02d", mins, secs)
}

@Composable
fun LocalBitmapThumbnail(
    context: Context,
    uri: Uri,
    isVideo: Boolean = false,
    maxDim: Int = 360,
    modifier: Modifier = Modifier,
) {
    val cacheKey = "${uri}|${maxDim}|$isVideo"
    val memCached = remember(cacheKey) { com.plajah.app.data.PlajahFileSystemManager.getCachedThumb(cacheKey) }
    val bitmap by produceState<Bitmap?>(memCached, cacheKey) {
        if (memCached != null) {
            value = memCached
            return@produceState
        }
        value = withContext(Dispatchers.IO) {
            decodeSampledBitmap(context, uri, isVideo, maxDim)?.also { bmp ->
                com.plajah.app.data.PlajahFileSystemManager.putCachedThumb(cacheKey, bmp)
            }
        }
    }

    Box(modifier = modifier, contentAlignment = Alignment.Center) {
        if (bitmap != null) {
            Image(
                bitmap = bitmap!!.asImageBitmap(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Icon(
                imageVector = if (isVideo) Icons.Rounded.Movie else Icons.Rounded.Image,
                contentDescription = null,
                tint = Color(0xFF475569),
                modifier = Modifier.size(30.dp),
            )
        }
    }
}

private fun decodeSampledBitmap(context: Context, uri: Uri, isVideo: Boolean, maxDim: Int): Bitmap? {
    return try {
        if (isVideo && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return try {
                context.contentResolver.loadThumbnail(uri, android.util.Size(maxDim, maxDim), null)
            } catch (_: Exception) {
                null
            }
        }
        if (uri.scheme == "file" && uri.path != null) {
            val file = File(uri.path!!)
            if (!file.exists()) return null
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(file.absolutePath, bounds)
            var inSample = 1
            while (bounds.outWidth / inSample > maxDim || bounds.outHeight / inSample > maxDim) {
                inSample *= 2
            }
            val opts = BitmapFactory.Options().apply { inSampleSize = inSample }
            return BitmapFactory.decodeFile(file.absolutePath, opts)
        }
        context.contentResolver.openInputStream(uri)?.use { raw ->
            val baos = ByteArrayOutputStream()
            raw.copyTo(baos)
            val bytes = baos.toByteArray()
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
            var inSample = 1
            while (bounds.outWidth / inSample > maxDim || bounds.outHeight / inSample > maxDim) {
                inSample *= 2
            }
            val opts = BitmapFactory.Options().apply { inSampleSize = inSample }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
        }
    } catch (_: Exception) {
        null
    }
}

private fun hasLocalMediaPermissions(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        ContextCompat.checkSelfPermission(context, Manifest.permission.READ_MEDIA_AUDIO) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.READ_MEDIA_VIDEO) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.READ_MEDIA_IMAGES) == PackageManager.PERMISSION_GRANTED
    } else {
        ContextCompat.checkSelfPermission(context, Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
    }
}

/**
 * Unified Android local library surface (Audio, Videos, Photos) launching into ONE shared
 * quick-view stage for Photos + Videos + Audio + Documents/Files.
 * Keeps `(LocalAudioTrack) -> Unit` signature intact for ChoraScreen callers.
 */
@Composable
fun LocalMediaScreen(onPlayTrack: (LocalAudioTrack) -> Unit) {
    val context = LocalContext.current
    var hasPermission by remember { mutableStateOf(hasLocalMediaPermissions(context)) }
    var activeTab by remember { mutableStateOf(0) } // 0 = All, 1 = Photos, 2 = Videos, 3 = Audio

    var audioTracks by remember { mutableStateOf<List<LocalAudioTrack>>(emptyList()) }
    var videos by remember { mutableStateOf<List<LocalVideo>>(emptyList()) }
    var photos by remember { mutableStateOf<List<LocalPhoto>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }

    var stageItems by remember { mutableStateOf<List<UnifiedStageItem>>(emptyList()) }
    var stageIndex by remember { mutableStateOf<Int?>(null) }

    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        hasPermission = hasLocalMediaPermissions(context)
    }

    LaunchedEffect(hasPermission) {
        if (!hasPermission) return@LaunchedEffect
        loading = true
        withContext(Dispatchers.IO) {
            audioTracks = LocalMediaManager.queryAudio(context)
            videos = LocalMediaManager.queryVideos(context)
            photos = LocalMediaManager.queryPhotos(context)
        }
        loading = false
    }

    val allMixed = remember(photos, videos, audioTracks) {
        photos.map { it.toStageItem() } + videos.map { it.toStageItem() } + audioTracks.map { it.toStageItem() }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF04030A))
            .padding(horizontal = 16.dp),
    ) {
        if (!hasPermission) {
            Column(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(
                    imageVector = Icons.Rounded.FolderOpen,
                    contentDescription = null,
                    tint = PlajahBrand.Purple,
                    modifier = Modifier.size(64.dp),
                )
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    "Access On-Device Media",
                    color = Color.White,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    "Browse photos, videos, and audio in one unified Plajah media stage.",
                    color = Color(0xFF94A3B8),
                    fontSize = 13.sp,
                )
                Spacer(modifier = Modifier.height(20.dp))
                Button(
                    onClick = {
                        val perms = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            arrayOf(
                                Manifest.permission.READ_MEDIA_AUDIO,
                                Manifest.permission.READ_MEDIA_VIDEO,
                                Manifest.permission.READ_MEDIA_IMAGES,
                            )
                        } else {
                            arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
                        }
                        launcher.launch(perms)
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = PlajahBrand.Purple),
                ) {
                    Text("Grant Media Access", color = Color.White, fontWeight = FontWeight.SemiBold)
                }
            }
            return@Column
        }

        // Filter Strip: All | Photos | Videos | Audio
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            val tabs = listOf(
                "All (${allMixed.size})",
                "Photos (${photos.size})",
                "Videos (${videos.size})",
                "Audio (${audioTracks.size})",
            )
            tabs.forEachIndexed { idx, label ->
                val active = activeTab == idx
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (active) PlajahTheme.colors.spatialGradient else SolidColor(PlajahTheme.colors.glass2))
                        .clickable { activeTab = idx }
                        .padding(horizontal = 12.dp, vertical = 7.dp),
                ) {
                    Text(
                        label,
                        color = Color.White,
                        fontSize = 12.sp,
                        fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                    )
                }
            }
        }

        if (loading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = PlajahBrand.Orange)
            }
        } else {
            val currentList = when (activeTab) {
                1 -> photos.map { it.toStageItem() }
                2 -> videos.map { it.toStageItem() }
                3 -> audioTracks.map { it.toStageItem() }
                else -> allMixed
            }

            if (activeTab == 3) {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    itemsIndexed(currentList) { index, item ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(Color(0xFF0E0D16))
                                .clickable {
                                    stageItems = currentList
                                    stageIndex = index
                                }
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(44.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(PlajahBrand.PurpleSoft),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(Icons.Rounded.MusicNote, null, tint = PlajahBrand.Lilac)
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(item.name, color = Color.White, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(
                                    "${item.subtitle} · ${formatDurationMs(item.durationMs)}",
                                    color = Color(0xFF94A3B8),
                                    fontSize = 11.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            if (item.audioTrack != null) {
                                TextButton(onClick = { onPlayTrack(item.audioTrack) }) {
                                    Text("Chora", color = PlajahBrand.Cyan, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }
            } else {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(3),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    gridItemsIndexed(currentList) { index, item ->
                        Box(
                            modifier = Modifier
                                .aspectRatio(1f)
                                .clip(RoundedCornerShape(10.dp))
                                .background(Color(0xFF100F1B))
                                .clickable {
                                    stageItems = currentList
                                    stageIndex = index
                                },
                        ) {
                            when (item.type) {
                                StageMediaType.PHOTO -> LocalBitmapThumbnail(
                                    context = context,
                                    uri = item.uri,
                                    isVideo = false,
                                    modifier = Modifier.fillMaxSize(),
                                )
                                StageMediaType.VIDEO -> {
                                    LocalBitmapThumbnail(
                                        context = context,
                                        uri = item.uri,
                                        isVideo = true,
                                        modifier = Modifier.fillMaxSize(),
                                    )
                                    Box(
                                        modifier = Modifier
                                            .align(Alignment.BottomEnd)
                                            .padding(6.dp)
                                            .clip(RoundedCornerShape(6.dp))
                                            .background(Color(0xB3000000))
                                            .padding(horizontal = 5.dp, vertical = 2.dp),
                                    ) {
                                        Text(
                                            formatDurationMs(item.durationMs),
                                            color = Color.White,
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                        )
                                    }
                                }
                                else -> Column(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .padding(8.dp),
                                    verticalArrangement = Arrangement.Center,
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                ) {
                                    Icon(Icons.Rounded.MusicNote, null, tint = PlajahBrand.Cyan, modifier = Modifier.size(28.dp))
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Text(
                                        item.name,
                                        color = Color.White,
                                        fontSize = 10.sp,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    val openIdx = stageIndex
    if (openIdx != null && stageItems.isNotEmpty()) {
        UnifiedLocalMediaStage(
            items = stageItems,
            initialIndex = openIdx,
            onDismiss = { stageIndex = null },
            onPlayInChora = onPlayTrack,
        )
    }
}

/**
 * Single unified Android quick-view & local media stage shared between `LocalMediaScreen` and `FilesScreen`:
 * combines zoomable Photos, Media3 Video, Media3 Audio + Chora Deck handoff, UTF-8 Document preview,
 * and System Share / Open With on one swipeable/navigable canvas.
 */
@Composable
fun UnifiedLocalMediaStage(
    items: List<UnifiedStageItem>,
    initialIndex: Int,
    onDismiss: () -> Unit,
    onPlayInChora: ((LocalAudioTrack) -> Unit)? = null,
) {
    if (items.isEmpty()) return
    val context = LocalContext.current
    var currentIndex by remember(items, initialIndex) {
        mutableStateOf(initialIndex.coerceIn(0, items.lastIndex))
    }
    val item = items[currentIndex]

    var zoom by remember(item.id) { mutableStateOf(1f) }
    var pan by remember(item.id) { mutableStateOf(Offset.Zero) }
    var rotationDeg by remember(item.id) { mutableStateOf(0f) }
    var speed by remember { mutableStateOf(1f) }
    var fillVideo by remember { mutableStateOf(false) }

    var docText by remember(item.id) { mutableStateOf<String?>(null) }
    var docError by remember(item.id) { mutableStateOf<String?>(null) }
    var isPdfOrBinaryDoc by remember(item.id) { mutableStateOf(false) }

    // Dedicated ExoPlayer reused cleanly across video & audio items on the unified stage
    val exoPlayer = remember {
        ExoPlayer.Builder(context).build()
    }
    var isPlaying by remember { mutableStateOf(false) }
    var posMs by remember { mutableStateOf(0L) }
    var durMs by remember { mutableStateOf(0L) }

    DisposableEffect(exoPlayer) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(playing: Boolean) {
                isPlaying = playing
            }
        }
        exoPlayer.addListener(listener)
        onDispose {
            exoPlayer.removeListener(listener)
            exoPlayer.release()
        }
    }

    LaunchedEffect(item.id, speed) {
        if (item.type == StageMediaType.VIDEO || item.type == StageMediaType.AUDIO) {
            exoPlayer.setMediaItem(
                MediaItem.Builder()
                    .setUri(item.uri)
                    .setMediaMetadata(MediaMetadata.Builder().setTitle(item.name).build())
                    .build(),
            )
            exoPlayer.prepare()
            exoPlayer.setPlaybackSpeed(speed)
            exoPlayer.playWhenReady = true
        } else {
            exoPlayer.pause()
            exoPlayer.clearMediaItems()
        }
    }

    LaunchedEffect(exoPlayer, item.id) {
        while (true) {
            if (item.type == StageMediaType.AUDIO || item.type == StageMediaType.VIDEO) {
                posMs = exoPlayer.currentPosition.coerceAtLeast(0L)
                durMs = exoPlayer.duration.coerceAtLeast(item.durationMs)
            }
            delay(400L)
        }
    }

    LaunchedEffect(item.id) {
        docText = null
        docError = null
        isPdfOrBinaryDoc = item.mimeType == "application/pdf" || item.name.lowercase().endsWith(".pdf")
        if (item.type == StageMediaType.DOC && !isPdfOrBinaryDoc) {
            withContext(Dispatchers.IO) {
                try {
                    val (text, _, _) = PlajahFileSystemManager.readTextPreview(context, item.pathOrUri, 262_144)
                    docText = text
                } catch (e: Exception) {
                    docError = e.message ?: "Unable to read document"
                }
            }
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF07080D)),
        ) {
            // ── Primary Stage Canvas ─────────────────────────────────────────────────────────────
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(top = 64.dp, bottom = 78.dp),
                contentAlignment = Alignment.Center,
            ) {
                when (item.type) {
                    StageMediaType.PHOTO -> {
                        val fullBmp by produceState<Bitmap?>(null, item.uri) {
                            value = withContext(Dispatchers.IO) {
                                decodeSampledBitmap(context, item.uri, isVideo = false, maxDim = 2048)
                            }
                        }
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .pointerInput(item.id) {
                                    detectTransformGestures { _, panDelta, zoomDelta, _ ->
                                        val nextZoom = (zoom * zoomDelta).coerceIn(1f, 5f)
                                        zoom = nextZoom
                                        pan = if (nextZoom > 1.05f) pan + panDelta else Offset.Zero
                                    }
                                }
                                .pointerInput(item.id) {
                                    detectTapGestures(
                                        onDoubleTap = {
                                            if (zoom > 1.1f) {
                                                zoom = 1f
                                                pan = Offset.Zero
                                            } else {
                                                zoom = 2.4f
                                            }
                                        },
                                    )
                                },
                            contentAlignment = Alignment.Center,
                        ) {
                            if (fullBmp != null) {
                                Image(
                                    bitmap = fullBmp!!.asImageBitmap(),
                                    contentDescription = item.name,
                                    contentScale = ContentScale.Fit,
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .graphicsLayer {
                                            scaleX = zoom
                                            scaleY = zoom
                                            translationX = pan.x
                                            translationY = pan.y
                                            rotationZ = rotationDeg
                                        },
                                )
                            } else {
                                CircularProgressIndicator(color = PlajahBrand.Cyan)
                            }
                        }
                    }

                    StageMediaType.VIDEO -> {
                        AndroidView(
                            factory = { ctx ->
                                PlayerView(ctx).apply {
                                    player = exoPlayer
                                    useController = true
                                    resizeMode = if (fillVideo) AspectRatioFrameLayout.RESIZE_MODE_ZOOM else AspectRatioFrameLayout.RESIZE_MODE_FIT
                                }
                            },
                            update = { pv ->
                                pv.resizeMode = if (fillVideo) AspectRatioFrameLayout.RESIZE_MODE_ZOOM else AspectRatioFrameLayout.RESIZE_MODE_FIT
                            },
                            modifier = Modifier.fillMaxSize(),
                        )
                    }

                    StageMediaType.AUDIO -> {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 24.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(210.dp)
                                    .clip(RoundedCornerShape(24.dp))
                                    .background(PlajahBrand.PurpleSoft)
                                    .border(1.dp, PlajahTheme.colors.borderStrong, RoundedCornerShape(24.dp)),
                                contentAlignment = Alignment.Center,
                            ) {
                                if (item.artworkUri != null) {
                                    LocalBitmapThumbnail(
                                        context = context,
                                        uri = item.artworkUri,
                                        modifier = Modifier.fillMaxSize(),
                                    )
                                } else {
                                    Icon(Icons.Rounded.GraphicEq, null, tint = PlajahBrand.Cyan, modifier = Modifier.size(72.dp))
                                }
                            }
                            Spacer(modifier = Modifier.height(20.dp))
                            Text(item.name, color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            if (item.subtitle.isNotBlank()) {
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(item.subtitle, color = Color(0xFF94A3B8), fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            Spacer(modifier = Modifier.height(18.dp))
                            val effectiveDur = durMs.coerceAtLeast(1L)
                            Slider(
                                value = (posMs.toFloat() / effectiveDur.toFloat()).coerceIn(0f, 1f),
                                onValueChange = { ratio -> exoPlayer.seekTo((ratio * effectiveDur).toLong()) },
                                colors = SliderDefaults.colors(thumbColor = PlajahBrand.Cyan, activeTrackColor = PlajahBrand.Purple),
                            )
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(formatDurationMs(posMs), color = Color(0xFF94A3B8), fontSize = 11.sp)
                                Text(formatDurationMs(durMs), color = Color(0xFF94A3B8), fontSize = 11.sp)
                            }
                            Spacer(modifier = Modifier.height(14.dp))
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(16.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                IconButton(onClick = { exoPlayer.seekTo((exoPlayer.currentPosition - 10_000L).coerceAtLeast(0L)) }) {
                                    Icon(Icons.Rounded.Replay10, "Back 10s", tint = Color.White)
                                }
                                Box(
                                    modifier = Modifier
                                        .size(58.dp)
                                        .clip(CircleShape)
                                        .background(PlajahTheme.colors.spatialGradient)
                                        .clickable { if (isPlaying) exoPlayer.pause() else exoPlayer.play() },
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Icon(
                                        if (isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                                        contentDescription = if (isPlaying) "Pause" else "Play",
                                        tint = Color.White,
                                        modifier = Modifier.size(32.dp),
                                    )
                                }
                                IconButton(onClick = { exoPlayer.seekTo(exoPlayer.currentPosition + 10_000L) }) {
                                    Icon(Icons.Rounded.Forward10, "Forward 10s", tint = Color.White)
                                }
                            }
                            if (item.audioTrack != null && onPlayInChora != null) {
                                Spacer(modifier = Modifier.height(14.dp))
                                OutlinedButton(onClick = {
                                    exoPlayer.pause()
                                    onDismiss()
                                    onPlayInChora(item.audioTrack)
                                }) {
                                    Icon(Icons.Rounded.QueueMusic, null, tint = PlajahBrand.Cyan, modifier = Modifier.size(18.dp))
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("Send to Chora Deck", color = Color.White, fontSize = 12.sp)
                                }
                            }
                        }
                    }

                    StageMediaType.DOC -> {
                        if (isPdfOrBinaryDoc) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(24.dp)) {
                                Icon(Icons.Rounded.PictureAsPdf, null, tint = PlajahBrand.Orange, modifier = Modifier.size(64.dp))
                                Spacer(modifier = Modifier.height(12.dp))
                                Text(item.name, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                                Text(item.subtitle, color = Color(0xFF94A3B8), fontSize = 12.sp)
                                Spacer(modifier = Modifier.height(16.dp))
                                Button(
                                    onClick = { PlajahFileSystemManager.openExternal(context, item.pathOrUri, item.mimeType) },
                                    colors = ButtonDefaults.buttonColors(containerColor = PlajahBrand.Purple),
                                ) {
                                    Icon(Icons.Rounded.OpenInNew, null, modifier = Modifier.size(18.dp))
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("Open PDF With Android Viewer", color = Color.White)
                                }
                            }
                        } else if (docText != null) {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .padding(horizontal = 14.dp)
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(Color(0xFF0E0D17))
                                    .border(1.dp, PlajahTheme.colors.border, RoundedCornerShape(14.dp))
                                    .verticalScroll(rememberScrollState())
                                    .padding(14.dp),
                            ) {
                                Text(
                                    text = docText!!,
                                    color = Color(0xFFE2E8F0),
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 12.sp,
                                    lineHeight = 18.sp,
                                )
                            }
                        } else if (docError != null) {
                            Text(docError!!, color = PlajahBrand.Danger, fontSize = 13.sp)
                        } else {
                            CircularProgressIndicator(color = PlajahBrand.Cyan)
                        }
                    }

                    StageMediaType.OTHER -> {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(24.dp)) {
                            Icon(Icons.Rounded.InsertDriveFile, null, tint = PlajahBrand.Lilac, modifier = Modifier.size(64.dp))
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(item.name, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                            Text("${item.mimeType} · ${formatByteSize(item.sizeBytes)}", color = Color(0xFF94A3B8), fontSize = 12.sp)
                            Spacer(modifier = Modifier.height(16.dp))
                            Button(
                                onClick = { PlajahFileSystemManager.openExternal(context, item.pathOrUri, item.mimeType) },
                                colors = ButtonDefaults.buttonColors(containerColor = PlajahBrand.Purple),
                            ) {
                                Icon(Icons.Rounded.OpenInNew, null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Open With System App", color = Color.White)
                            }
                        }
                    }
                }
            }

            // ── Top HUD Bar ──────────────────────────────────────────────────────────────────────
            Row(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .fillMaxWidth()
                    .background(Color(0xEE0B0D14))
                    .border(width = 1.dp, color = Color(0x1AFFFFFF))
                    .statusBarsPadding()
                    .padding(horizontal = 10.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Rounded.Close, "Close", tint = Color.White)
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(item.name, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("${currentIndex + 1} / ${items.size} · ${item.type.name}", color = Color(0xFF94A3B8), fontSize = 11.sp)
                }
                if (item.type == StageMediaType.PHOTO) {
                    IconButton(onClick = { rotationDeg = (rotationDeg + 90f) % 360f }) {
                        Icon(Icons.Rounded.RotateRight, "Rotate", tint = Color.White)
                    }
                }
                if (item.type == StageMediaType.VIDEO || item.type == StageMediaType.AUDIO) {
                    TextButton(onClick = {
                        val speeds = listOf(0.5f, 1f, 1.25f, 1.5f, 2f)
                        val nextIdx = (speeds.indexOf(speed) + 1) % speeds.size
                        speed = speeds[nextIdx]
                    }) {
                        Text("${speed}x", color = PlajahBrand.Cyan, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
                if (item.type == StageMediaType.VIDEO) {
                    IconButton(onClick = { fillVideo = !fillVideo }) {
                        Icon(if (fillVideo) Icons.Rounded.FullscreenExit else Icons.Rounded.AspectRatio, "Aspect", tint = Color.White)
                    }
                }
                IconButton(onClick = {
                    try { PlajahFileSystemManager.shareEntries(context, listOf(item.pathOrUri), item.name) } catch (_: Exception) { }
                }) {
                    Icon(Icons.Rounded.Share, "Share", tint = Color.White)
                }
                IconButton(onClick = {
                    try { PlajahFileSystemManager.openExternal(context, item.pathOrUri, item.mimeType) } catch (_: Exception) { }
                }) {
                    Icon(Icons.Rounded.OpenInNew, "Open With", tint = Color.White)
                }
            }

            // ── Bottom Mixed Prev / Next + Filmstrip Bar ─────────────────────────────────────────
            Row(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .background(Color(0xEE0B0D14))
                    .border(width = 1.dp, color = Color(0x1AFFFFFF))
                    .navigationBarsPadding()
                    .padding(horizontal = 8.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(
                    enabled = currentIndex > 0,
                    onClick = { if (currentIndex > 0) currentIndex-- },
                ) {
                    Icon(Icons.Rounded.ChevronLeft, "Previous", tint = if (currentIndex > 0) Color.White else Color(0xFF475569))
                }
                LazyRow(
                    modifier = Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    itemsIndexed(items) { idx, entry ->
                        val selected = idx == currentIndex
                        Box(
                            modifier = Modifier
                                .height(46.dp)
                                .widthIn(min = 56.dp, max = 128.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(if (selected) Color(0x33F59E0B) else Color(0xFF10121C))
                                .border(
                                    1.dp,
                                    if (selected) Color(0xFFF59E0B) else Color(0x1FFFFFFF),
                                    RoundedCornerShape(10.dp),
                                )
                                .clickable { currentIndex = idx }
                                .padding(horizontal = 9.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                                Icon(
                                    when (entry.type) {
                                        StageMediaType.PHOTO -> Icons.Rounded.Image
                                        StageMediaType.VIDEO -> Icons.Rounded.Movie
                                        StageMediaType.AUDIO -> Icons.Rounded.MusicNote
                                        StageMediaType.DOC -> Icons.Rounded.Description
                                        StageMediaType.OTHER -> Icons.Rounded.InsertDriveFile
                                    },
                                    contentDescription = null,
                                    tint = if (selected) Color(0xFFFCD34D) else Color(0xFF94A3B8),
                                    modifier = Modifier.size(14.dp),
                                )
                                Text(
                                    entry.name,
                                    color = if (selected) Color(0xFFFDE68A) else Color.White,
                                    fontSize = 10.sp,
                                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                }
                IconButton(
                    enabled = currentIndex < items.lastIndex,
                    onClick = { if (currentIndex < items.lastIndex) currentIndex++ },
                ) {
                    Icon(Icons.Rounded.ChevronRight, "Next", tint = if (currentIndex < items.lastIndex) Color.White else Color(0xFF475569))
                }
            }
        }
    }
}
