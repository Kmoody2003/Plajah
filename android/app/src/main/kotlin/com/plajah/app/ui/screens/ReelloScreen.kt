package com.plajah.app.ui.screens

import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.plajah.app.data.PlatformCatalog
import com.plajah.app.data.PlatformItem
import com.plajah.app.ui.components.NativeVideoSurface
import com.plajah.app.ui.foldable.rememberFoldableInfo
import com.plajah.app.ui.theme.BrandDisplay
import com.plajah.app.ui.theme.PlajahBrand
import kotlinx.coroutines.CancellationException

private fun fmtDuration(sec: Long): String {
    if (sec <= 0L) return ""
    val m = sec / 60L
    val s = sec % 60L
    return "%d:%02d".format(m, s)
}

/**
 * 1-for-1 Native Jetpack Compose rebuild of Plajah Reello (VideoTab.tsx + RelloView.tsx + VideoPlayer.tsx).
 * - Discover mode: category chip rail, live search, adaptive 1/2/3-col Mux video grid
 * - Shorts mode: vertical snapping 9:16 Video Pager with Media3 ExoPlayer, like/share/mute rail
 * - Detail video player: always-reachable controls, never forces fullscreen automatically, Up Next queue
 * - Foldable Z Fold / Pixel Fold dual-pane support (browse left, watch right)
 */
@Composable
fun ReelloScreen(
    onOpenPlatform: (String) -> Unit,
) {
    val context = LocalContext.current
    val foldable = rememberFoldableInfo()
    val pad = foldable.horizontalPadding

    var videos by remember { mutableStateOf<List<PlatformItem>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableIntStateOf(0) }
    var mode by rememberSaveable { mutableStateOf("DISCOVER") } // DISCOVER | SHORTS
    var category by rememberSaveable { mutableStateOf("All") }
    var search by remember { mutableStateOf("") }
    var selectedVideoId by rememberSaveable { mutableStateOf<String?>(null) }
    var likedIds by remember { mutableStateOf(setOf<String>()) }
    var fullscreenPlayer by remember { mutableStateOf(false) }

    LaunchedEffect(attempt) {
        loading = true
        error = null
        try {
            videos = PlatformCatalog.load("reello")
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = e.message
        } finally {
            loading = false
        }
    }

    val categories = remember {
        listOf("All", "Music Video", "Short Film", "Movie", "TV Series", "Gaming", "Education", "Vlog", "Live", "Podcasts")
    }

    val filtered = remember(videos, category, search) {
        videos.filter { v ->
            val catOk = category == "All" || v.genre.contains(category, ignoreCase = true)
            val qOk = search.isBlank() ||
                v.title.contains(search, ignoreCase = true) ||
                v.creator.contains(search, ignoreCase = true) ||
                v.genre.contains(search, ignoreCase = true)
            catOk && qOk
        }
    }

    val shorts = remember(videos) {
        val explicit = videos.filter { it.isShort || (it.durationSec in 1..180) }
        if (explicit.isNotEmpty()) explicit else videos
    }

    val activeVideo = videos.firstOrNull { it.id == selectedVideoId }

    BackHandler(fullscreenPlayer || selectedVideoId != null) {
        if (fullscreenPlayer) fullscreenPlayer = false
        else selectedVideoId = null
    }

    // Explicit user-triggered fullscreen player
    if (fullscreenPlayer && activeVideo != null) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            NativeVideoSurface(
                streamUrl = activeVideo.playableVideoUrl,
                posterUrl = activeVideo.resolvedThumb,
                title = activeVideo.title,
                isFullscreen = true,
                onToggleFullscreen = { fullscreenPlayer = false },
                modifier = Modifier.fillMaxSize(),
            )
        }
        return
    }

    // Phone single-pane Video Player Detail
    if (activeVideo != null && !foldable.supportsDualPane) {
        ReelloVideoDetailPane(
            video = activeVideo,
            upNext = filtered.filter { it.id != activeVideo.id }.take(12),
            liked = likedIds.contains(activeVideo.id),
            onToggleLike = {
                likedIds = if (likedIds.contains(activeVideo.id)) likedIds - activeVideo.id else likedIds + activeVideo.id
            },
            onBack = { selectedVideoId = null },
            onSelectNext = { selectedVideoId = it.id },
            onOpenFullscreen = { fullscreenPlayer = true },
            onOpenClassic = { onOpenPlatform(activeVideo.platformUrl) },
        )
        return
    }

    val mainContent: @Composable () -> Unit = {
        Column(
            Modifier
                .fillMaxSize()
                .background(Color(0xFF05040B)),
        ) {
            // Masthead + Discover / Shorts Switcher
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = pad, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(
                            "REELLO",
                            fontFamily = BrandDisplay,
                            fontSize = if (foldable.isUltraCompact) 18.sp else 21.sp,
                            fontWeight = FontWeight.Black,
                            letterSpacing = 1.sp,
                            color = Color.White,
                        )
                        Surface(shape = CircleShape, color = PlajahBrand.Magenta.copy(0.22f)) {
                            Text(
                                "${videos.size} VIDEOS",
                                fontSize = 8.sp,
                                fontWeight = FontWeight.Black,
                                color = Color(0xFFFFB1C7),
                                modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                            )
                        }
                    }
                    Text(
                        "VIDEO, SHORTS & CREATOR CHANNELS",
                        fontSize = 8.5.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.3.sp,
                        color = Color.White.copy(0.45f),
                        maxLines = 1,
                    )
                }

                // Discover / Shorts segmented switch
                Row(
                    Modifier
                        .clip(CircleShape)
                        .background(Color.White.copy(0.08f))
                        .padding(3.dp),
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    listOf("DISCOVER" to "Discover", "SHORTS" to "Shorts").forEach { (id, label) ->
                        val active = mode == id
                        Box(
                            Modifier
                                .clip(CircleShape)
                                .background(
                                    if (active) Brush.linearGradient(listOf(PlajahBrand.Purple, PlajahBrand.Magenta))
                                    else Brush.linearGradient(listOf(Color.Transparent, Color.Transparent))
                                )
                                .clickable { mode = id }
                                .padding(horizontal = 11.dp, vertical = 5.dp),
                        ) {
                            Text(
                                label.uppercase(),
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Black,
                                color = Color.White.copy(if (active) 1f else 0.65f),
                                maxLines = 1,
                            )
                        }
                    }
                }
            }

            if (mode == "SHORTS") {
                if (shorts.isEmpty()) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        if (loading) CircularProgressIndicator(color = PlajahBrand.Orange)
                        else Text("No shorts available yet.", color = Color.White.copy(0.6f))
                    }
                } else {
                    val pagerState = rememberPagerState(pageCount = { shorts.size })
                    VerticalPager(
                        state = pagerState,
                        modifier = Modifier.fillMaxSize(),
                    ) { page ->
                        val item = shorts[page]
                        val isCurrentPage = pagerState.currentPage == page
                        val isLiked = likedIds.contains(item.id)
                        Box(Modifier.fillMaxSize().background(Color.Black)) {
                            if (isCurrentPage) {
                                NativeVideoSurface(
                                    streamUrl = item.playableVideoUrl,
                                    posterUrl = item.resolvedThumb,
                                    title = item.title,
                                    loop = true,
                                    fillCrop = true,
                                    modifier = Modifier.fillMaxSize(),
                                )
                            } else {
                                PlatformArt(item.resolvedThumb, item.title, Modifier.fillMaxSize(), square = false)
                            }

                            // Right-side vertical interaction rail (1:1 with RelloView.tsx)
                            Column(
                                Modifier
                                    .align(Alignment.BottomEnd)
                                    .padding(end = 12.dp, bottom = 74.dp),
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    IconButton(
                                        onClick = {
                                            likedIds = if (isLiked) likedIds - item.id else likedIds + item.id
                                        },
                                        modifier = Modifier.size(44.dp).clip(CircleShape).background(Color.Black.copy(0.55f)),
                                    ) {
                                        Icon(
                                            if (isLiked) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                                            "Like",
                                            tint = if (isLiked) PlajahBrand.Magenta else Color.White,
                                        )
                                    }
                                    Text("${item.likeCount + if (isLiked) 1 else 0}", fontSize = 10.sp, color = Color.White, fontWeight = FontWeight.Bold)
                                }
                                IconButton(
                                    onClick = {
                                        context.startActivity(
                                            Intent.createChooser(
                                                Intent(Intent.ACTION_SEND).apply {
                                                    type = "text/plain"
                                                    putExtra(Intent.EXTRA_TEXT, item.platformUrl)
                                                },
                                                "Share Reello",
                                            )
                                        )
                                    },
                                    modifier = Modifier.size(44.dp).clip(CircleShape).background(Color.Black.copy(0.55f)),
                                ) {
                                    Icon(Icons.Rounded.Share, "Share", tint = Color.White)
                                }
                                IconButton(
                                    onClick = { onOpenPlatform(item.platformUrl) },
                                    modifier = Modifier.size(44.dp).clip(CircleShape).background(Color.Black.copy(0.55f)),
                                ) {
                                    Icon(Icons.Rounded.OpenInNew, "Open Classic", tint = Color.White)
                                }
                            }

                            // Bottom-left creator & caption info
                            Column(
                                Modifier
                                    .align(Alignment.BottomStart)
                                    .fillMaxWidth(0.76f)
                                    .padding(start = 14.dp, bottom = 68.dp),
                            ) {
                                Text(
                                    "@${item.creator.ifBlank { "plajah" }}",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Black,
                                    color = PlajahBrand.Orange,
                                    maxLines = 1,
                                )
                                Text(
                                    item.title,
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                if (item.description.isNotBlank()) {
                                    Text(
                                        item.description,
                                        fontSize = 11.sp,
                                        color = Color.White.copy(0.72f),
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                        }
                    }
                }
            } else {
                // Category Chip Rail
                Row(
                    Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = pad, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    categories.forEach { cat ->
                        val active = category == cat
                        Box(
                            Modifier
                                .height(32.dp)
                                .clip(CircleShape)
                                .background(
                                    if (active) Brush.linearGradient(listOf(PlajahBrand.Magenta, PlajahBrand.Orange))
                                    else Brush.linearGradient(listOf(Color.White.copy(0.06f), Color.White.copy(0.06f)))
                                )
                                .clickable { category = cat }
                                .padding(horizontal = 12.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                cat.uppercase(),
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Black,
                                color = Color.White.copy(if (active) 1f else 0.65f),
                                maxLines = 1,
                                softWrap = false,
                            )
                        }
                    }
                }

                // Search bar
                OutlinedTextField(
                    value = search,
                    onValueChange = { search = it },
                    placeholder = { Text("Search videos, creators, genres…", fontSize = 12.sp, color = Color.White.copy(0.4f), maxLines = 1) },
                    leadingIcon = { Icon(Icons.Rounded.Search, null, Modifier.size(16.dp)) },
                    trailingIcon = {
                        if (search.isNotEmpty()) {
                            IconButton(onClick = { search = "" }, modifier = Modifier.size(28.dp)) {
                                Icon(Icons.Rounded.Close, "Clear", Modifier.size(14.dp))
                            }
                        }
                    },
                    singleLine = true,
                    shape = CircleShape,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = pad, vertical = 4.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = PlajahBrand.Orange,
                        unfocusedBorderColor = Color.White.copy(0.12f),
                    ),
                )

                if (loading) LinearProgressIndicator(Modifier.fillMaxWidth(), color = PlajahBrand.Orange)
                error?.let {
                    Row(Modifier.padding(horizontal = pad), verticalAlignment = Alignment.CenterVertically) {
                        Text(it, color = PlajahBrand.Orange, fontSize = 11.sp, modifier = Modifier.weight(1f))
                        TextButton(onClick = { attempt++ }) { Text("Retry") }
                    }
                }

                val cols = if (foldable.supportsDualPane) 2 else foldable.wideGridColumns
                LazyVerticalGrid(
                    columns = GridCells.Fixed(cols),
                    contentPadding = PaddingValues(pad),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                    modifier = Modifier.weight(1f),
                ) {
                    items(filtered, key = { it.id }) { video ->
                        Column(
                            Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(16.dp))
                                .background(Color.White.copy(0.04f))
                                .border(
                                    1.dp,
                                    if (video.id == selectedVideoId) PlajahBrand.Orange else Color.White.copy(0.08f),
                                    RoundedCornerShape(16.dp),
                                )
                                .clickable { selectedVideoId = video.id },
                        ) {
                            Box(
                                Modifier
                                    .fillMaxWidth()
                                    .aspectRatio(16f / 9f)
                                    .background(Color(0xFF100C1A)),
                            ) {
                                PlatformArt(video.resolvedThumb, video.title, Modifier.fillMaxSize(), square = false)
                                if (video.durationSec > 0L) {
                                    Box(
                                        Modifier
                                            .align(Alignment.BottomEnd)
                                            .padding(8.dp)
                                            .clip(RoundedCornerShape(6.dp))
                                            .background(Color.Black.copy(0.78f))
                                            .padding(horizontal = 6.dp, vertical = 2.dp),
                                    ) {
                                        Text(fmtDuration(video.durationSec), fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color.White)
                                    }
                                }
                                if (video.genre.isNotBlank()) {
                                    Box(
                                        Modifier
                                            .align(Alignment.TopStart)
                                            .padding(8.dp)
                                            .clip(CircleShape)
                                            .background(Color.Black.copy(0.68f))
                                            .padding(horizontal = 8.dp, vertical = 3.dp),
                                    ) {
                                        Text(video.genre.uppercase(), fontSize = 8.sp, fontWeight = FontWeight.Black, color = PlajahBrand.Orange, maxLines = 1)
                                    }
                                }
                            }
                            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                Text(
                                    video.title,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    video.creator.ifBlank { "Plajah Creator" },
                                    fontSize = 11.sp,
                                    color = Color.White.copy(0.55f),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    if (foldable.supportsDualPane && mode == "DISCOVER") {
        Row(Modifier.fillMaxSize()) {
            Box(Modifier.weight(0.54f).fillMaxHeight()) { mainContent() }
            Box(Modifier.width(foldable.hingeWidthDp.coerceAtLeast(1.dp)).fillMaxHeight().background(Color.White.copy(0.12f)))
            Box(Modifier.weight(0.46f).fillMaxHeight().background(Color(0xFF080612))) {
                val preview = activeVideo ?: filtered.firstOrNull()
                if (preview != null) {
                    ReelloVideoDetailPane(
                        video = preview,
                        upNext = filtered.filter { it.id != preview.id }.take(10),
                        liked = likedIds.contains(preview.id),
                        onToggleLike = {
                            likedIds = if (likedIds.contains(preview.id)) likedIds - preview.id else likedIds + preview.id
                        },
                        onBack = { selectedVideoId = null },
                        onSelectNext = { selectedVideoId = it.id },
                        onOpenFullscreen = { selectedVideoId = preview.id; fullscreenPlayer = true },
                        onOpenClassic = { onOpenPlatform(preview.platformUrl) },
                    )
                }
            }
        }
    } else {
        mainContent()
    }
}

@Composable
private fun ReelloVideoDetailPane(
    video: PlatformItem,
    upNext: List<PlatformItem>,
    liked: Boolean,
    onToggleLike: () -> Unit,
    onBack: () -> Unit,
    onSelectNext: (PlatformItem) -> Unit,
    onOpenFullscreen: () -> Unit,
    onOpenClassic: () -> Unit,
) {
    val context = LocalContext.current
    LazyColumn(
        Modifier
            .fillMaxSize()
            .background(Color(0xFF05040B)),
    ) {
        item {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                IconButton(onClick = onBack, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.Rounded.ArrowBack, "Back", tint = Color.White)
                }
                Text(
                    video.title,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Black,
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = onOpenClassic, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.Rounded.OpenInNew, "Classic", tint = Color.White.copy(0.75f), modifier = Modifier.size(18.dp))
                }
            }
        }
        item {
            NativeVideoSurface(
                streamUrl = video.playableVideoUrl,
                posterUrl = video.resolvedThumb,
                title = video.title,
                onToggleFullscreen = onOpenFullscreen,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(16f / 9f),
            )
        }
        item {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(video.title, fontFamily = BrandDisplay, fontSize = 17.sp, fontWeight = FontWeight.Black, color = Color.White)
                Text(
                    "${video.creator.ifBlank { "Plajah Creator" }}${if (video.genre.isNotBlank()) " · ${video.genre}" else ""}",
                    fontSize = 12.sp,
                    color = PlajahBrand.Orange,
                    fontWeight = FontWeight.Bold,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = liked,
                        onClick = onToggleLike,
                        label = { Text(if (liked) "Liked" else "Like", fontSize = 11.sp, fontWeight = FontWeight.Bold) },
                        leadingIcon = { Icon(if (liked) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder, null, Modifier.size(16.dp)) },
                    )
                    AssistChip(
                        onClick = {
                            context.startActivity(
                                Intent.createChooser(
                                    Intent(Intent.ACTION_SEND).apply {
                                        type = "text/plain"
                                        putExtra(Intent.EXTRA_TEXT, video.platformUrl)
                                    },
                                    "Share video",
                                )
                            )
                        },
                        label = { Text("Share", fontSize = 11.sp, fontWeight = FontWeight.Bold) },
                        leadingIcon = { Icon(Icons.Rounded.Share, null, Modifier.size(16.dp)) },
                    )
                    AssistChip(
                        onClick = onOpenClassic,
                        label = { Text("Comments ↗", fontSize = 11.sp, fontWeight = FontWeight.Bold) },
                    )
                }
                if (video.description.isNotBlank()) {
                    Text(video.description, fontSize = 12.5.sp, lineHeight = 18.sp, color = Color.White.copy(0.72f))
                }
                HorizontalDivider(color = Color.White.copy(0.08f), modifier = Modifier.padding(top = 6.dp))
                Text("UP NEXT", fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 1.6.sp, color = Color.White.copy(0.55f))
            }
        }
        items(upNext, key = { it.id }) { next ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable { onSelectNext(next) }
                    .padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                PlatformArt(
                    next.resolvedThumb,
                    next.title,
                    Modifier.width(116.dp).aspectRatio(16f / 9f).clip(RoundedCornerShape(10.dp)),
                    square = false,
                )
                Column(Modifier.weight(1f)) {
                    Text(next.title, fontSize = 12.5.sp, fontWeight = FontWeight.Bold, color = Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(next.creator.ifBlank { "Plajah" }, fontSize = 10.5.sp, color = Color.White.copy(0.55f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}
