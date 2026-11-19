package com.plajah.app.ui.components

import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.plajah.app.ui.screens.PlatformArt
import com.plajah.app.ui.theme.PlajahBrand
import kotlinx.coroutines.delay

private fun fmtSec(ms: Long): String {
    val s = (ms / 1000L).coerceAtLeast(0L)
    val h = s / 3600L
    val m = (s % 3600L) / 60L
    val sec = s % 60L
    return if (h > 0) "%d:%02d:%02d".format(h, m, sec) else "%d:%02d".format(m, sec)
}

/**
 * Reusable Media3 ExoPlayer video stage for Reello, Cinema, Elevate, and Chora videos.
 * - Always-reachable Compose overlay controls (never disappear permanently on touch devices)
 * - Never jumps into fullscreen automatically (fullscreen is strictly user-triggered)
 * - Optional horizontal swipe channel switching (Elevate multi-channel feeds)
 */
@OptIn(UnstableApi::class)
@Composable
fun NativeVideoSurface(
    streamUrl: String,
    posterUrl: String,
    title: String,
    modifier: Modifier = Modifier,
    isLive: Boolean = false,
    loop: Boolean = false,
    initialMuted: Boolean = false,
    fillCrop: Boolean = false,
    channelLabel: String? = null,
    onPrevChannel: (() -> Unit)? = null,
    onNextChannel: (() -> Unit)? = null,
    onToggleFullscreen: (() -> Unit)? = null,
    isFullscreen: Boolean = false,
) {
    val context = LocalContext.current
    var playing by remember { mutableStateOf(true) }
    var muted by remember { mutableStateOf(initialMuted) }
    var positionMs by remember { mutableLongStateOf(0L) }
    var durationMs by remember { mutableLongStateOf(0L) }
    var controlsExpanded by remember { mutableStateOf(true) }
    var buffering by remember { mutableStateOf(false) }

    val exoPlayer = remember(context) {
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(12_000, 45_000, 350, 750)
            .build()
        ExoPlayer.Builder(context)
            .setLoadControl(loadControl)
            .build()
    }

    LaunchedEffect(streamUrl, loop) {
        if (streamUrl.startsWith("https://") || streamUrl.startsWith("http://")) {
            exoPlayer.repeatMode = if (loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
            exoPlayer.setMediaItem(MediaItem.fromUri(streamUrl))
            exoPlayer.prepare()
            exoPlayer.playWhenReady = playing
        }
    }

    LaunchedEffect(muted) {
        exoPlayer.volume = if (muted) 0f else 1f
    }

    DisposableEffect(exoPlayer) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(isPlayingNow: Boolean) {
                playing = isPlayingNow
            }
            override fun onPlaybackStateChanged(state: Int) {
                buffering = state == Player.STATE_BUFFERING
            }
        }
        exoPlayer.addListener(listener)
        onDispose {
            exoPlayer.removeListener(listener)
            exoPlayer.release()
        }
    }

    LaunchedEffect(exoPlayer) {
        while (true) {
            positionMs = exoPlayer.currentPosition.coerceAtLeast(0L)
            durationMs = exoPlayer.duration.coerceAtLeast(0L)
            delay(400)
        }
    }

    var dragAccum by remember { mutableFloatStateOf(0f) }

    Box(
        modifier = modifier
            .background(Color.Black)
            .pointerInput(onPrevChannel, onNextChannel) {
                if (onPrevChannel != null || onNextChannel != null) {
                    detectHorizontalDragGestures(
                        onDragStart = { dragAccum = 0f },
                        onHorizontalDrag = { _, dragAmount -> dragAccum += dragAmount },
                        onDragEnd = {
                            if (dragAccum < -70f) onNextChannel?.invoke()
                            else if (dragAccum > 70f) onPrevChannel?.invoke()
                            dragAccum = 0f
                        },
                    )
                }
            }
            .clickable { controlsExpanded = !controlsExpanded }
    ) {
        if (streamUrl.startsWith("https://") || streamUrl.startsWith("http://")) {
            AndroidView(
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        useController = false
                        player = exoPlayer
                        resizeMode = if (fillCrop) AspectRatioFrameLayout.RESIZE_MODE_ZOOM else AspectRatioFrameLayout.RESIZE_MODE_FIT
                        setShutterBackgroundColor(android.graphics.Color.BLACK)
                    }
                },
                update = { view ->
                    view.resizeMode = if (fillCrop) AspectRatioFrameLayout.RESIZE_MODE_ZOOM else AspectRatioFrameLayout.RESIZE_MODE_FIT
                },
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            PlatformArt(posterUrl, title, Modifier.fillMaxSize(), square = false)
            Box(
                Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.45f)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "Stream preview unavailable in native player",
                    color = Color.White.copy(alpha = 0.7f),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }

        if (buffering) {
            CircularProgressIndicator(
                color = PlajahBrand.Orange,
                strokeWidth = 2.5.dp,
                modifier = Modifier
                    .size(32.dp)
                    .align(Alignment.Center),
            )
        }

        // Top badge row (always lightweight & never blocks the video)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.TopStart)
                .background(Brush.verticalGradient(listOf(Color.Black.copy(0.68f), Color.Transparent)))
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.weight(1f),
            ) {
                if (isLive) {
                    Box(
                        Modifier
                            .clip(CircleShape)
                            .background(Color(0xFFDC2626))
                            .padding(horizontal = 7.dp, vertical = 2.dp),
                    ) {
                        Text("LIVE", fontSize = 9.sp, fontWeight = FontWeight.Black, color = Color.White)
                    }
                }
                channelLabel?.let {
                    Box(
                        Modifier
                            .clip(CircleShape)
                            .background(Color.Black.copy(0.6f))
                            .padding(horizontal = 7.dp, vertical = 2.dp),
                    ) {
                        Text(it, fontSize = 9.sp, fontWeight = FontWeight.Bold, color = PlajahBrand.Orange, maxLines = 1)
                    }
                }
                Text(
                    title,
                    color = Color.White,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        // Bottom transport bar — always accessible (dims subtly when collapsed, taps bring full controls)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.BottomStart)
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(if (controlsExpanded) 0.85f else 0.55f))))
                .padding(horizontal = 8.dp, vertical = 6.dp),
        ) {
            if (controlsExpanded && !isLive && durationMs > 0L) {
                val frac = (positionMs.toFloat() / durationMs.toFloat()).coerceIn(0f, 1f)
                Slider(
                    value = frac,
                    onValueChange = { f ->
                        val target = (f * durationMs).toLong()
                        positionMs = target
                        exoPlayer.seekTo(target)
                    },
                    colors = SliderDefaults.colors(
                        thumbColor = PlajahBrand.Orange,
                        activeTrackColor = PlajahBrand.Orange,
                        inactiveTrackColor = Color.White.copy(0.25f),
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(18.dp),
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    IconButton(
                        onClick = {
                            if (exoPlayer.isPlaying) {
                                exoPlayer.pause()
                                playing = false
                            } else {
                                exoPlayer.play()
                                playing = true
                            }
                        },
                        modifier = Modifier
                            .size(34.dp)
                            .clip(CircleShape)
                            .background(Color.Black.copy(0.55f)),
                    ) {
                        Icon(
                            if (playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                            contentDescription = if (playing) "Pause" else "Play",
                            tint = Color.White,
                            modifier = Modifier.size(18.dp),
                        )
                    }

                    if (onPrevChannel != null) {
                        IconButton(
                            onClick = onPrevChannel,
                            modifier = Modifier
                                .size(34.dp)
                                .clip(CircleShape)
                                .background(Color.Black.copy(0.55f)),
                        ) {
                            Icon(Icons.Rounded.ChevronLeft, contentDescription = "Previous channel", tint = Color.White, modifier = Modifier.size(20.dp))
                        }
                    }

                    if (onNextChannel != null) {
                        IconButton(
                            onClick = onNextChannel,
                            modifier = Modifier
                                .size(34.dp)
                                .clip(CircleShape)
                                .background(Color.Black.copy(0.55f)),
                        ) {
                            Icon(Icons.Rounded.ChevronRight, contentDescription = "Next channel", tint = Color.White, modifier = Modifier.size(20.dp))
                        }
                    }

                    if (!isLive && durationMs > 0L) {
                        Text(
                            "${fmtSec(positionMs)} / ${fmtSec(durationMs)}",
                            fontSize = 10.sp,
                            color = Color.White.copy(0.8f),
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(start = 4.dp),
                        )
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    IconButton(
                        onClick = { muted = !muted },
                        modifier = Modifier
                            .size(34.dp)
                            .clip(CircleShape)
                            .background(Color.Black.copy(0.55f)),
                    ) {
                        Icon(
                            if (muted) Icons.Rounded.VolumeOff else Icons.Rounded.VolumeUp,
                            contentDescription = if (muted) "Unmute" else "Mute",
                            tint = if (muted) PlajahBrand.Orange else Color.White,
                            modifier = Modifier.size(18.dp),
                        )
                    }

                    if (onToggleFullscreen != null) {
                        IconButton(
                            onClick = onToggleFullscreen,
                            modifier = Modifier
                                .size(34.dp)
                                .clip(CircleShape)
                                .background(Color.Black.copy(0.55f)),
                        ) {
                            Icon(
                                if (isFullscreen) Icons.Rounded.FullscreenExit else Icons.Rounded.Fullscreen,
                                contentDescription = if (isFullscreen) "Exit fullscreen" else "Fullscreen",
                                tint = Color.White,
                                modifier = Modifier.size(18.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}
