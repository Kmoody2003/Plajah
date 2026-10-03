package com.plajah.app.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.ui.graphics.asImageBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import com.plajah.app.data.LocalAudioTrack
import com.plajah.app.data.LocalMediaManager
import com.plajah.app.data.LocalPhoto
import com.plajah.app.data.LocalVideo

private fun formatClock(ms: Long): String {
    val sec = (ms / 1000).coerceAtLeast(0)
    return "%d:%02d".format(sec / 60, sec % 60)
}

@Composable
fun LocalUriImage(
    uri: Uri?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop
) {
    val context = LocalContext.current
    val bitmap by produceState<android.graphics.Bitmap?>(null, uri) {
        if (uri == null) {
            value = null
            return@produceState
        }
        value = withContext(Dispatchers.IO) {
            try {
                context.contentResolver.openInputStream(uri)?.use { stream ->
                    val bytes = stream.readBytes()
                    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                    val opts = BitmapFactory.Options().apply {
                        inSampleSize = maxOf(1, maxOf(bounds.outWidth, bounds.outHeight) / 512)
                    }
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
                }
            } catch (_: Exception) {
                null
            }
        }
    }

    Box(modifier = modifier, contentAlignment = Alignment.Center) {
        if (bitmap != null) {
            Image(
                bitmap = bitmap!!.asImageBitmap(),
                contentDescription = contentDescription,
                modifier = Modifier.fillMaxSize(),
                contentScale = contentScale
            )
        } else {
            Box(Modifier.fillMaxSize().background(Color.White.copy(0.06f)))
        }
    }
}

@Composable
fun LocalMediaScreen(
    onPlayTrack: (LocalAudioTrack) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    var selectedTab by remember { mutableStateOf("MUSIC") }
    var searchQuery by remember { mutableStateOf("") }

    var audioTracks by remember { mutableStateOf<List<LocalAudioTrack>>(emptyList()) }
    var videos by remember { mutableStateOf<List<LocalVideo>>(emptyList()) }
    var photos by remember { mutableStateOf<List<LocalPhoto>>(emptyList()) }

    var activeVideo by remember { mutableStateOf<LocalVideo?>(null) }
    var activePhoto by remember { mutableStateOf<LocalPhoto?>(null) }

    val neededPermissions = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        listOf(
            Manifest.permission.READ_MEDIA_AUDIO,
            Manifest.permission.READ_MEDIA_VIDEO,
            Manifest.permission.READ_MEDIA_IMAGES
        )
    } else {
        listOf(Manifest.permission.READ_EXTERNAL_STORAGE)
    }

    var hasPermission by remember {
        mutableStateOf(neededPermissions.all {
            ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
        })
    }

    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        hasPermission = results.values.all { it }
        if (hasPermission) {
            audioTracks = LocalMediaManager.queryAudio(context)
            videos = LocalMediaManager.queryVideos(context)
            photos = LocalMediaManager.queryPhotos(context)
        }
    }

    LaunchedEffect(hasPermission) {
        if (hasPermission) {
            audioTracks = LocalMediaManager.queryAudio(context)
            videos = LocalMediaManager.queryVideos(context)
            photos = LocalMediaManager.queryPhotos(context)
        }
    }

    if (!hasPermission) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .padding(32.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Icon(
                    Icons.Rounded.PermMedia,
                    contentDescription = null,
                    tint = ChoraOrange,
                    modifier = Modifier.size(56.dp)
                )
                Text(
                    "LOCAL MEDIA ACCESS",
                    fontWeight = FontWeight.Black,
                    fontSize = 18.sp,
                    color = Color.White
                )
                Text(
                    "Enable storage permission to play your local music files, videos, and photos natively inside Plajah.",
                    fontSize = 13.sp,
                    color = Color.White.copy(0.6f),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
                Button(
                    onClick = { launcher.launch(neededPermissions.toTypedArray()) },
                    colors = ButtonDefaults.buttonColors(containerColor = ChoraOrange),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text("Grant Permission", fontWeight = FontWeight.Black, color = Color.Black)
                }
            }
        }
        return
    }

    Column(modifier = modifier.fillMaxSize()) {
        // Tab selector
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            listOf("MUSIC" to "Music", "VIDEOS" to "Videos", "PHOTOS" to "Photos").forEach { (id, label) ->
                val active = selectedTab == id
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(38.dp)
                        .background(
                            if (active) Spatial else androidx.compose.ui.graphics.Brush.linearGradient(
                                listOf(Color.White.copy(0.06f), Color.White.copy(0.06f))
                            ),
                            CircleShape
                        )
                        .clickable { selectedTab = id },
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        label.uppercase(),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Black,
                        letterSpacing = 1.sp,
                        color = Color.White.copy(if (active) 1f else 0.6f)
                    )
                }
            }
        }

        // Search Bar
        OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            placeholder = { Text("Search local files…", fontSize = 12.sp, color = Color.White.copy(0.4f)) },
            leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null, Modifier.size(18.dp)) },
            trailingIcon = {
                if (searchQuery.isNotEmpty()) {
                    IconButton(onClick = { searchQuery = "" }) {
                        Icon(Icons.Rounded.Close, contentDescription = "Clear", Modifier.size(16.dp))
                    }
                }
            },
            singleLine = true,
            shape = CircleShape,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = ChoraOrange,
                unfocusedBorderColor = Color.White.copy(0.12f)
            )
        )

        // Content
        when (selectedTab) {
            "MUSIC" -> {
                val filtered = audioTracks.filter {
                    it.title.contains(searchQuery, ignoreCase = true) ||
                    it.artist.contains(searchQuery, ignoreCase = true) ||
                    it.album.contains(searchQuery, ignoreCase = true)
                }
                if (filtered.isEmpty()) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("No local music found", color = Color.White.copy(0.4f), fontSize = 13.sp)
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(filtered, key = { it.id }) { track ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(Color.White.copy(0.04f))
                                    .clickable { onPlayTrack(track) }
                                    .padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(46.dp)
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(Color(0xFF1E1428)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    if (track.artworkUri != null) {
                                        LocalUriImage(
                                            uri = track.artworkUri,
                                            contentDescription = null,
                                            modifier = Modifier.fillMaxSize(),
                                            contentScale = ContentScale.Crop
                                        )
                                    } else {
                                        Icon(Icons.Rounded.MusicNote, contentDescription = null, tint = ChoraOrange)
                                    }
                                }

                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        track.title,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                        color = Color.White
                                    )
                                    Text(
                                        "${track.artist} · ${track.album}",
                                        fontSize = 10.sp,
                                        color = Color.White.copy(0.5f),
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }

                                Text(
                                    formatClock(track.duration),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = Color.White.copy(0.4f)
                                )

                                IconButton(onClick = { onPlayTrack(track) }) {
                                    Icon(Icons.Rounded.PlayArrow, contentDescription = "Play", tint = ChoraOrange)
                                }
                            }
                        }
                    }
                }
            }

            "VIDEOS" -> {
                val filtered = videos.filter { it.title.contains(searchQuery, ignoreCase = true) }
                if (filtered.isEmpty()) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("No local videos found", color = Color.White.copy(0.4f), fontSize = 13.sp)
                    }
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        contentPadding = PaddingValues(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        items(filtered, key = { it.id }) { video ->
                            Column(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(Color.White.copy(0.04f))
                                    .clickable { activeVideo = video }
                            ) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(100.dp)
                                        .background(Color.Black.copy(0.6f)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(Icons.Rounded.Movie, contentDescription = null, tint = ChoraCyan, modifier = Modifier.size(32.dp))
                                    Box(
                                        modifier = Modifier
                                            .align(Alignment.BottomEnd)
                                            .padding(6.dp)
                                            .background(Color.Black.copy(0.7f), RoundedCornerShape(4.dp))
                                            .padding(horizontal = 6.dp, vertical = 2.dp)
                                    ) {
                                        Text(formatClock(video.duration), fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Color.White)
                                    }
                                }
                                Text(
                                    video.title,
                                    modifier = Modifier.padding(8.dp),
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 11.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    color = Color.White
                                )
                            }
                        }
                    }
                }
            }

            "PHOTOS" -> {
                val filtered = photos.filter { it.title.contains(searchQuery, ignoreCase = true) }
                if (filtered.isEmpty()) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("No local photos found", color = Color.White.copy(0.4f), fontSize = 13.sp)
                    }
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(3),
                        contentPadding = PaddingValues(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        items(filtered, key = { it.id }) { photo ->
                            LocalUriImage(
                                uri = photo.contentUri,
                                contentDescription = photo.title,
                                modifier = Modifier
                                    .aspectRatio(1f)
                                    .clip(RoundedCornerShape(8.dp))
                                    .clickable { activePhoto = photo },
                                contentScale = ContentScale.Crop
                            )
                        }
                    }
                }
            }
        }
    }

    // Video Player Modal
    activeVideo?.let { video ->
        LocalVideoPlayerModal(video = video, onDismiss = { activeVideo = null })
    }

    // Photo Viewer Modal
    activePhoto?.let { photo ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(0.95f))
                .clickable { activePhoto = null },
            contentAlignment = Alignment.Center
        ) {
            LocalUriImage(
                uri = photo.contentUri,
                contentDescription = photo.title,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Fit
            )
            IconButton(
                onClick = { activePhoto = null },
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(16.dp)
            ) {
                Icon(Icons.Rounded.Close, contentDescription = "Close", tint = Color.White)
            }
        }
    }
}

@Composable
fun LocalVideoPlayerModal(video: LocalVideo, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val exoPlayer = remember {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(video.contentUri))
            prepare()
            playWhenReady = true
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            exoPlayer.release()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
    ) {
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    player = exoPlayer
                    useController = true
                }
            },
            modifier = Modifier.fillMaxSize()
        )

        IconButton(
            onClick = onDismiss,
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(16.dp)
        ) {
            Icon(Icons.Rounded.ArrowBack, contentDescription = "Back", tint = Color.White)
        }
    }
}
