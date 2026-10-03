package com.plajah.app.ui.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.plajah.app.data.PlatformItem
import com.plajah.app.ui.screens.PlatformArt
import kotlin.math.PI
import kotlin.math.sin
import kotlinx.coroutines.delay

enum class ChoraStageMode {
    ART,
    SLIDESHOW,
    FX_STAGE,
    ORRERY
}

enum class FxVisualizerPreset {
    SPECTRUM,
    NEBULA,
    WAVEFORM
}

/**
 * 1-for-1 Color Gradient Atmospheric Background from Chora Web:
 * radial-gradient(90% 120% at 50% -20%, rgba(107,0,153,0.45), transparent 65%),
 * radial-gradient(60% 80% at 85% 10%, rgba(0,218,243,0.12), transparent 60%), #060210
 */
@Composable
fun ChoraAtmosphericBackground(
    modifier: Modifier = Modifier,
    isPlaying: Boolean = false,
    themeColor: Color = Color(0xFF6B0099),
    content: @Composable BoxScope.() -> Unit
) {
    val infiniteTransition = rememberInfiniteTransition(label = "ambient")
    val pulse by infiniteTransition.animateFloat(
        initialValue = 0.94f,
        targetValue = 1.06f,
        animationSpec = infiniteRepeatable(
            animation = tween(4200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "ambientPulse"
    )

    Box(
        modifier = modifier
            .fillMaxSize()
            .drawBehind {
                // 1. Cosmic void base
                drawRect(Color(0xFF040209))

                // 2. Top-center radial aurora (purple/theme color)
                val topCenter = Offset(size.width * 0.5f, -size.height * 0.15f)
                val topRadius = size.height * 0.85f * (if (isPlaying) pulse else 1f)
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            themeColor.copy(alpha = 0.45f),
                            Color(0xFF6B0099).copy(alpha = 0.28f),
                            Color(0xFFD40055).copy(alpha = 0.12f),
                            Color.Transparent
                        ),
                        center = topCenter,
                        radius = topRadius
                    ),
                    center = topCenter,
                    radius = topRadius
                )

                // 3. Top-right cyan aura (Spatial accent)
                val trCenter = Offset(size.width * 0.88f, size.height * 0.10f)
                val trRadius = size.width * 0.72f
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            Color(0xFF00DAF3).copy(alpha = 0.14f),
                            Color(0xFF00F0FF).copy(alpha = 0.05f),
                            Color.Transparent
                        ),
                        center = trCenter,
                        radius = trRadius
                    ),
                    center = trCenter,
                    radius = trRadius
                )

                // 4. Subtle bottom-left warm ember glow
                val blCenter = Offset(size.width * 0.10f, size.height * 0.80f)
                val blRadius = size.width * 0.65f
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            Color(0xFFFF8C00).copy(alpha = 0.08f),
                            Color.Transparent
                        ),
                        center = blCenter,
                        radius = blRadius
                    ),
                    center = blCenter,
                    radius = blRadius
                )
            },
        content = content
    )
}

/**
 * Stage Mode Selector Pill Bar matching Chora Web:
 * [ART] [SLIDESHOW] [FX STAGE] [ORRERY]
 */
@Composable
fun ChoraStagePillBar(
    activeMode: ChoraStageMode,
    onSelectMode: (ChoraStageMode) -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        shape = CircleShape,
        color = Color.Black.copy(0.45f),
        border = BorderStroke(1.dp, Color.White.copy(0.12f))
    ) {
        Row(
            modifier = Modifier.padding(3.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            ChoraStageMode.values().forEach { mode ->
                val active = activeMode == mode
                Box(
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(
                            if (active) Brush.linearGradient(listOf(Color(0xFF6B0099), Color(0xFFD40055), Color(0xFFFF8C00)))
                            else Brush.linearGradient(listOf(Color.Transparent, Color.Transparent))
                        )
                        .clickable { onSelectMode(mode) }
                        .padding(horizontal = 10.dp, vertical = 5.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        val icon = when (mode) {
                            ChoraStageMode.ART -> Icons.Rounded.Album
                            ChoraStageMode.SLIDESHOW -> Icons.Rounded.PhotoLibrary
                            ChoraStageMode.FX_STAGE -> Icons.Rounded.GraphicEq
                            ChoraStageMode.ORRERY -> Icons.Rounded.AutoAwesome
                        }
                        Icon(
                            icon,
                            contentDescription = null,
                            tint = if (active) Color.White else Color.White.copy(0.55f),
                            modifier = Modifier.size(12.dp)
                        )
                        Text(
                            when (mode) {
                                ChoraStageMode.ART -> "ART"
                                ChoraStageMode.SLIDESHOW -> "SLIDESHOW"
                                ChoraStageMode.FX_STAGE -> "FX STAGE"
                                ChoraStageMode.ORRERY -> "ORRERY"
                            },
                            fontSize = 8.5.sp,
                            fontWeight = FontWeight.Black,
                            letterSpacing = 0.8.sp,
                            color = if (active) Color.White else Color.White.copy(0.6f)
                        )
                    }
                }
            }
        }
    }
}

/**
 * Animated Slideshow View matching Web AnimatedSlideshow.tsx:
 * Automatically advances photos / artwork with Ken Burns scale and smooth crossfades.
 */
@Composable
fun ChoraSlideshowView(
    images: List<String>,
    albumTitle: String,
    artistName: String,
    isPlaying: Boolean,
    modifier: Modifier = Modifier
) {
    if (images.isEmpty()) {
        Box(modifier = modifier, contentAlignment = Alignment.Center) {
            Text("No Slides Available", color = Color.White.copy(0.4f), fontSize = 12.sp)
        }
        return
    }

    var currentIndex by remember { mutableIntStateOf(0) }

    LaunchedEffect(images, isPlaying) {
        while (isPlaying && images.size > 1) {
            delay(4500)
            currentIndex = (currentIndex + 1) % images.size
        }
    }

    val currentUrl = images.getOrElse(currentIndex) { images[0] }

    val infiniteTransition = rememberInfiniteTransition(label = "kenBurns")
    val scale by infiniteTransition.animateFloat(
        initialValue = 1.0f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable(
            animation = tween(4500, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "kenBurnsScale"
    )

    Box(
        modifier = modifier
            .fillMaxSize()
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0xFF090614)),
        contentAlignment = Alignment.Center
    ) {
        Crossfade(targetState = currentUrl, animationSpec = tween(1000), label = "slideCrossfade") { url ->
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                PlatformArt(
                    url = url,
                    title = albumTitle,
                    modifier = Modifier
                        .fillMaxSize()
                        .scale(scale)
                )
            }
        }

        // Ambient dark vignette overlay
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        listOf(
                            Color.Black.copy(0.2f),
                            Color.Transparent,
                            Color.Black.copy(0.75f)
                        )
                    )
                )
        )

        // Bottom Slide Badge & Info Overlay
        Row(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .padding(14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    albumTitle.uppercase(),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Black,
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    artistName.uppercase(),
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFFFF8C00),
                    maxLines = 1
                )
            }

            Surface(
                shape = CircleShape,
                color = Color.Black.copy(0.6f),
                border = BorderStroke(1.dp, Color.White.copy(0.2f))
            ) {
                Text(
                    "${currentIndex + 1} / ${images.size}",
                    fontSize = 9.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color.White,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                )
            }
        }
    }
}

/**
 * Audio-Reactive FX Stage View:
 * Features Spectrum EQ bars, Nebula orbital ripples, and sinusoidal Waveforms in Canvas.
 */
@Composable
fun ChoraFxStageView(
    isPlaying: Boolean,
    modifier: Modifier = Modifier
) {
    var preset by remember { mutableStateOf(FxVisualizerPreset.SPECTRUM) }

    val infiniteTransition = rememberInfiniteTransition(label = "fxPhase")
    val phase by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = (2 * PI).toFloat(),
        animationSpec = infiniteRepeatable(
            animation = tween(2400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "phaseAnimation"
    )

    Box(
        modifier = modifier
            .fillMaxSize()
            .clip(RoundedCornerShape(16.dp))
            .background(Brush.verticalGradient(listOf(Color(0xFF0F0619), Color(0xFF030107))))
            .border(1.dp, Color.White.copy(0.12f), RoundedCornerShape(16.dp))
    ) {
        // Visualizer Canvas
        Canvas(modifier = Modifier.fillMaxSize()) {
            val width = size.width
            val height = size.height
            val midY = height * 0.55f

            when (preset) {
                FxVisualizerPreset.SPECTRUM -> {
                    // 28 Frequency Equalizer Bars
                    val barCount = 28
                    val barWidth = (width / barCount) * 0.65f
                    val spacing = (width / barCount) * 0.35f

                    for (i in 0 until barCount) {
                        val factor = if (isPlaying) {
                            (sin(phase + i * 0.35f) * 0.5f + 0.5f) * 0.75f + 0.15f
                        } else {
                            0.12f
                        }
                        val barHeight = height * 0.65f * factor
                        val left = i * (barWidth + spacing) + spacing * 0.5f
                        val top = height - barHeight - 20.dp.toPx()

                        drawRoundRect(
                            brush = Brush.verticalGradient(
                                listOf(Color(0xFF00DAF3), Color(0xFFD40055), Color(0xFFFF8C00))
                            ),
                            topLeft = Offset(left, top),
                            size = androidx.compose.ui.geometry.Size(barWidth, barHeight),
                            cornerRadius = androidx.compose.ui.geometry.CornerRadius(4.dp.toPx())
                        )
                    }
                }

                FxVisualizerPreset.NEBULA -> {
                    // Concentric Orbital Pulsing Rings
                    val center = Offset(width * 0.5f, height * 0.5f)
                    val ringCount = 5
                    for (i in 1..ringCount) {
                        val baseRadius = (i * 24.dp.toPx())
                        val pulseOffset = if (isPlaying) sin(phase + i * 0.8f) * 8.dp.toPx() else 0f
                        val radius = (baseRadius + pulseOffset).coerceAtLeast(10f)

                        drawCircle(
                            brush = Brush.sweepGradient(
                                listOf(Color(0xFF6B0099), Color(0xFF00DAF3), Color(0xFFFF8C00), Color(0xFF6B0099))
                            ),
                            radius = radius,
                            center = center,
                            style = Stroke(width = (2.5f + i * 0.5f).dp.toPx())
                        )
                    }
                }

                FxVisualizerPreset.WAVEFORM -> {
                    // Sinusoidal Waveform Ribbon
                    val path = Path()
                    path.moveTo(0f, midY)
                    val step = 4.dp.toPx()
                    var x = 0f
                    while (x <= width) {
                        val amp = if (isPlaying) height * 0.22f else height * 0.05f
                        val y = midY + sin((x / width) * 4 * PI.toFloat() + phase) * amp
                        path.lineTo(x, y)
                        x += step
                    }

                    drawPath(
                        path = path,
                        brush = Brush.horizontalGradient(
                            listOf(Color(0xFFFF8C00), Color(0xFFD40055), Color(0xFF00DAF3))
                        ),
                        style = Stroke(width = 4.dp.toPx())
                    )
                }
            }
        }

        // Preset Switcher Pills
        Row(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(10.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            FxVisualizerPreset.values().forEach { p ->
                val selected = preset == p
                Surface(
                    shape = CircleShape,
                    color = if (selected) Color(0xFFFF8C00) else Color.Black.copy(0.5f),
                    border = BorderStroke(1.dp, if (selected) Color(0xFFFF8C00) else Color.White.copy(0.2f)),
                    modifier = Modifier.clickable { preset = p }
                ) {
                    Text(
                        p.name,
                        fontSize = 8.sp,
                        fontWeight = FontWeight.Black,
                        color = if (selected) Color.Black else Color.White.copy(0.7f),
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                    )
                }
            }
        }
    }
}

/**
 * Vinyl Album Art View with Groove Lines and Rotation Animation:
 */
@Composable
fun ChoraVinylArtView(
    album: PlatformItem?,
    isPlaying: Boolean,
    modifier: Modifier = Modifier
) {
    val infiniteTransition = rememberInfiniteTransition(label = "vinyl")
    val rotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(20000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "vinylRotate"
    )

    Box(
        modifier = modifier
            .clip(CircleShape)
            .background(Brush.radialGradient(listOf(Color(0xFF222230), Color(0xFF07070B))))
            .border(2.dp, Color.White.copy(0.12f), CircleShape)
            .rotate(if (isPlaying) rotation else 0f),
        contentAlignment = Alignment.Center
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val center = Offset(size.width / 2, size.height / 2)
            drawCircle(Color.White.copy(0.06f), radius = size.minDimension * 0.44f, center = center)
            drawCircle(Color.White.copy(0.04f), radius = size.minDimension * 0.36f, center = center)
            drawCircle(Color.White.copy(0.05f), radius = size.minDimension * 0.28f, center = center)
        }

        Box(
            modifier = Modifier
                .fillMaxSize(0.48f)
                .clip(CircleShape)
                .border(2.dp, Color(0xFFFF8C00), CircleShape)
        ) {
            if (album != null && album.image.isNotBlank()) {
                PlatformArt(album.image, album.title, modifier = Modifier.fillMaxSize(), square = false)
            } else {
                Box(Modifier.fillMaxSize().background(Color(0xFF6B0099)), contentAlignment = Alignment.Center) {
                    Icon(Icons.Rounded.Album, contentDescription = null, tint = Color.White)
                }
            }
        }
    }
}
