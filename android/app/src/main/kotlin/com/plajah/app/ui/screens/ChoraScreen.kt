package com.plajah.app.ui.screens

import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import com.plajah.app.data.LocalAudioTrack
import com.plajah.app.data.PlatformCatalog
import com.plajah.app.data.PlatformItem
import com.plajah.app.ui.components.ChoraAtmosphericBackground
import com.plajah.app.ui.components.ChoraFxStageView
import com.plajah.app.ui.components.ChoraSlideshowView
import com.plajah.app.ui.components.ChoraStageMode
import com.plajah.app.ui.components.ChoraStagePillBar
import com.plajah.app.ui.components.ChoraVinylArtView
import com.plajah.app.ui.foldable.FoldDeviceMode
import com.plajah.app.ui.foldable.FoldableInfo
import com.plajah.app.ui.foldable.rememberFoldableInfo
import com.plajah.app.ui.theme.BrandDisplay
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import java.time.LocalDate
import java.time.temporal.ChronoUnit

private fun formatClock(ms: Long): String {
    val seconds = (ms / 1000).coerceAtLeast(0)
    return "%d:%02d".format(seconds / 60, seconds % 60)
}

/**
 * 1-for-1 Native Jetpack Compose implementation of the Plajah Chora music experience.
 * Enhanced for Samsung Galaxy Z Fold 7, Z Fold 8, and Z Fold 8 Ultra:
 * - Cover Screen (Outer): High-density 1-column layout, thumb-friendly reachability, compact rails.
 * - Inner Screen (Unfolded): Dual-Pane layout with catalog on the left and Now Playing / Vinyl / Album console on the right.
 * - Flex Mode (Tabletop): Split top stage (Orrery & vinyl) and bottom deck (DJ transport & mixing).
 */
@Composable
fun ChoraScreen(
    initialAlbumId: String? = null,
    onOpenPlatform: (String) -> Unit,
    onExit: () -> Unit
) {
    val context = LocalContext.current
    val player = rememberChoraPlayer()
    val foldable = rememberFoldableInfo()

    var albums by remember { mutableStateOf<List<PlatformItem>>(emptyList()) }
    var selectedId by rememberSaveable { mutableStateOf(initialAlbumId) }
    val selected = albums.firstOrNull { it.id == selectedId }

    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    var attempt by remember { mutableIntStateOf(0) }
    var search by remember { mutableStateOf("") }
    var activeTab by rememberSaveable { mutableStateOf("NEW") }
    var showNightSky by rememberSaveable { mutableStateOf(true) }
    var isCasting by remember { mutableStateOf(false) }

    // Mini-player & transport state
    var currentTrackTitle by remember { mutableStateOf("") }
    var currentArtist by remember { mutableStateOf("") }
    var isPlaying by remember { mutableStateOf(false) }
    var position by remember { mutableLongStateOf(0) }
    var duration by remember { mutableLongStateOf(0) }

    LaunchedEffect(attempt) {
        loading = true
        error = null
        try {
            albums = PlatformCatalog.load("chora")
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = e.message
        } finally {
            loading = false
        }
    }

    DisposableEffect(player) {
        if (player == null) return@DisposableEffect onDispose {}
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(playing: Boolean) {
                isPlaying = playing
            }
            override fun onMediaItemTransition(item: MediaItem?, reason: Int) {
                currentTrackTitle = item?.mediaMetadata?.title?.toString().orEmpty()
                currentArtist = item?.mediaMetadata?.artist?.toString().orEmpty()
            }
        }
        isPlaying = player.isPlaying
        currentTrackTitle = player.currentMediaItem?.mediaMetadata?.title?.toString().orEmpty()
        currentArtist = player.currentMediaItem?.mediaMetadata?.artist?.toString().orEmpty()
        player.addListener(listener)
        onDispose { player.removeListener(listener) }
    }

    LaunchedEffect(player) {
        while (true) {
            if (player != null && player.isPlaying) {
                position = player.currentPosition
                duration = player.duration.coerceAtLeast(0)
            }
            delay(500)
        }
    }

    BackHandler(selectedId != null) { selectedId = null }

    val tabs = listOf(
        "NEW" to "New",
        "FOR_YOU" to "For You",
        "RADIO" to "Radio",
        "MY_LIBRARY" to "My Library",
        "LOCAL" to "Local Media",
        "ARTISTS" to "Artists",
        "ALBUMS" to "Albums",
        "MIXES" to "Mixes",
        "GENRES" to "Genres",
        "VAULT" to "Vault",
        "PODCASTS" to "Podcasts",
        "AUDIO_BOOKS" to "Audiobooks",
        "PLAYLISTS" to "Playlists"
    )

    val filtered = albums.filter {
        it.title.contains(search, ignoreCase = true) ||
        it.creator.contains(search, ignoreCase = true) ||
        it.genre.contains(search, ignoreCase = true)
    }

    ChoraAtmosphericBackground(isPlaying = isPlaying) {
        // ──────────────────────────────────────────────────────────────────────────
        // POSTURE 1: FLEX MODE (Tabletop / Device half-folded horizontally)
        // ──────────────────────────────────────────────────────────────────────────
        if (foldable.isFlexMode) {
            ChoraFlexScreen(
                albums = albums,
                currentTrackTitle = currentTrackTitle,
                currentArtist = currentArtist,
                isPlaying = isPlaying,
                duration = duration,
                position = position,
                player = player,
                tabs = tabs,
                activeTab = activeTab,
                onSelectTab = { activeTab = it },
                onSelectAlbum = { selectedId = it.id },
                isCasting = isCasting,
                onToggleCast = {
                    isCasting = !isCasting
                    android.widget.Toast.makeText(
                        context,
                        if (isCasting) "Casting to Wireless Speakers" else "Casting disconnected",
                        android.widget.Toast.LENGTH_SHORT
                    ).show()
                }
            )
        } else if (foldable.isInnerScreen) {
            // ──────────────────────────────────────────────────────────────────────────
            // POSTURE 2: INNER SCREEN (Samsung Galaxy Z Fold 7/8/Ultra Unfolded Main Screen)
            // DUAL-PANE: Left Pane = Catalog/Browse; Right Pane = Album or Now Playing Console
            // ──────────────────────────────────────────────────────────────────────────
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Transparent)
                    .safeDrawingPadding()
            ) {
                // Left Pane (56% width) - Interactive Browse, Orrery, Category Chips, Grid
                Box(
                    modifier = Modifier
                        .weight(0.56f)
                        .fillMaxHeight()
                ) {
                    ChoraCatalogPane(
                        albums = albums,
                        filtered = filtered,
                        tabs = tabs,
                        activeTab = activeTab,
                        onSelectTab = { activeTab = it },
                        search = search,
                        onSearchChange = { search = it },
                        showNightSky = showNightSky,
                        loading = loading,
                        error = error,
                        onRetry = { attempt++ },
                        selectedId = selectedId,
                        onSelectAlbum = { selectedId = it.id },
                        player = player,
                        onExit = onExit,
                        foldable = foldable,
                        isCasting = isCasting,
                        onToggleCast = {
                            isCasting = !isCasting
                            android.widget.Toast.makeText(
                                context,
                                if (isCasting) "Casting to Wireless Speakers" else "Casting disconnected",
                                android.widget.Toast.LENGTH_SHORT
                            ).show()
                        }
                    )
                }

                // Central physical hinge / visual split accent
                Box(
                    modifier = Modifier
                        .width(1.dp)
                        .fillMaxHeight()
                        .background(Color.White.copy(0.12f))
                )

                // Right Pane (44% width) - Now Playing Console or Selected Album Details
                Box(
                    modifier = Modifier
                        .weight(0.44f)
                        .fillMaxHeight()
                        .background(Color.Black.copy(0.35f))
                ) {
                    if (selected != null) {
                        ChoraAlbumScreen(selected, { selectedId = null }, onOpenPlatform)
                    } else {
                        ChoraFoldableCompanionPane(
                            albums = albums,
                            currentTrackTitle = currentTrackTitle,
                            currentArtist = currentArtist,
                            isPlaying = isPlaying,
                            duration = duration,
                            position = position,
                            player = player,
                            onSelectAlbum = { selectedId = it.id },
                            isCasting = isCasting,
                            onToggleCast = {
                                isCasting = !isCasting
                                android.widget.Toast.makeText(
                                    context,
                                    if (isCasting) "Casting to Wireless Speakers" else "Casting disconnected",
                                    android.widget.Toast.LENGTH_SHORT
                                ).show()
                            }
                        )
                    }
                }
            }
        } else if (selected != null) {
            // Selected Album Detail on Standard Screen / Cover Screen
            ChoraAlbumScreen(selected, { selectedId = null }, onOpenPlatform)
        } else {
            // ──────────────────────────────────────────────────────────────────────────
            // POSTURE 3: COVER SCREEN (Outer Narrow Screen) & STANDARD PHONE
            // ──────────────────────────────────────────────────────────────────────────
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Transparent)
                    .safeDrawingPadding()
            ) {
                Box(modifier = Modifier.weight(1f)) {
                    ChoraCatalogPane(
                        albums = albums,
                        filtered = filtered,
                        tabs = tabs,
                        activeTab = activeTab,
                        onSelectTab = { activeTab = it },
                        search = search,
                        onSearchChange = { search = it },
                        showNightSky = showNightSky,
                        loading = loading,
                        error = error,
                        onRetry = { attempt++ },
                        selectedId = selectedId,
                        onSelectAlbum = { selectedId = it.id },
                        player = player,
                        onExit = onExit,
                        foldable = foldable,
                        isCasting = isCasting,
                        onToggleCast = {
                            isCasting = !isCasting
                            android.widget.Toast.makeText(
                                context,
                                if (isCasting) "Casting to Wireless Speakers" else "Casting disconnected",
                                android.widget.Toast.LENGTH_SHORT
                            ).show()
                        }
                    )
                }

                // Persistent Docked Mini-Player (Outer Cover Screen & Standard Mobile)
                if (player != null && (currentTrackTitle.isNotBlank() || isPlaying)) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color(0xE0100B1A))
                            .border(BorderStroke(1.dp, Color.White.copy(0.08f)))
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(2.dp)
                                .background(Color.White.copy(0.12f))
                        ) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth(if (duration > 0) (position.toFloat() / duration).coerceIn(0f, 1f) else 0f)
                                    .fillMaxHeight()
                                    .background(Spatial)
                            )
                        }

                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = if (foldable.isCoverScreen) 10.dp else 16.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(38.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(Spatial),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(Icons.Rounded.GraphicEq, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
                            }

                            Column(Modifier.weight(1f)) {
                                Text(
                                    currentTrackTitle.ifBlank { "Plajah Chora" },
                                    fontSize = if (foldable.isCoverScreen) 11.sp else 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    currentArtist.ifBlank { "Now Playing" },
                                    fontSize = 9.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = Color.White.copy(0.55f),
                                    maxLines = 1
                                )
                            }

                            IconButton(
                                onClick = {
                                    if (player.isPlaying) player.pause() else player.play()
                                },
                                modifier = Modifier.size(36.dp)
                            ) {
                                Icon(
                                    if (isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                                    contentDescription = "Play or Pause",
                                    tint = ChoraOrange
                                )
                            }

                            IconButton(
                                onClick = { player.seekToNextMediaItem() },
                                modifier = Modifier.size(36.dp)
                            ) {
                                Icon(Icons.Rounded.SkipNext, contentDescription = "Next", tint = Color.White.copy(0.7f))
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * Reusable catalog content pane (Header, Category tabs, Search, Tab grid/lists).
 */
@Composable
private fun ChoraCatalogPane(
    albums: List<PlatformItem>,
    filtered: List<PlatformItem>,
    tabs: List<Pair<String, String>>,
    activeTab: String,
    onSelectTab: (String) -> Unit,
    search: String,
    onSearchChange: (String) -> Unit,
    showNightSky: Boolean,
    loading: Boolean,
    error: String?,
    onRetry: () -> Unit,
    selectedId: String?,
    onSelectAlbum: (PlatformItem) -> Unit,
    player: Player?,
    onExit: () -> Unit,
    foldable: FoldableInfo,
    isCasting: Boolean,
    onToggleCast: () -> Unit
) {
    val isCover = foldable.isCoverScreen
    val gridCols = if (isCover) 1 else 2
    val gridPadding = if (isCover) 10.dp else 16.dp

    Column(modifier = Modifier.fillMaxSize()) {
        // Top Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(54.dp)
                .padding(horizontal = gridPadding),
            verticalAlignment = Alignment.CenterVertically
        ) {
            ChoraBackMark(Modifier.clickable(onClick = onExit))
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "PLAJAH ",
                        fontFamily = BrandDisplay,
                        fontSize = if (isCover) 15.sp else 17.sp,
                        fontWeight = FontWeight.Black,
                        letterSpacing = 1.sp,
                        color = Color.White
                    )
                    Text(
                        "CHORA",
                        style = TextStyle(brush = Spatial, fontFamily = BrandDisplay, fontSize = if (isCover) 15.sp else 17.sp, fontWeight = FontWeight.Black, letterSpacing = 1.sp)
                    )
                    if (foldable.isFoldable) {
                        Spacer(Modifier.width(6.dp))
                        Text(
                            if (isCover) "COVER" else "INNER",
                            fontSize = 7.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = ChoraOrange,
                            modifier = Modifier
                                .clip(RoundedCornerShape(4.dp))
                                .background(ChoraOrange.copy(0.15f))
                                .padding(horizontal = 4.dp, vertical = 2.dp)
                        )
                    }
                }
                val issue = ChronoUnit.DAYS.between(LocalDate.of(2026, 1, 1), LocalDate.now()) + 1
                Text(
                    "ISSUE Nº $issue · ${albums.size} WORKS",
                    fontSize = 8.sp,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = 1.6.sp,
                    color = Color.White.copy(0.45f)
                )
            }

            IconButton(onClick = onToggleCast) {
                Icon(
                    if (isCasting) Icons.Rounded.CastConnected else Icons.Rounded.Cast,
                    contentDescription = "Cast",
                    tint = if (isCasting) ChoraCyan else Color.White.copy(0.7f)
                )
            }

            TextButton(onClick = onExit) {
                Text("SWITCH", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Color.White.copy(0.6f))
            }
        }

        // Horizontal Category Chip Rail
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = gridPadding, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            tabs.forEach { (id, label) ->
                val active = activeTab == id
                Box(
                    modifier = Modifier
                        .height(if (isCover) 30.dp else 34.dp)
                        .clip(CircleShape)
                        .background(
                            if (active) Spatial
                            else Brush.linearGradient(listOf(Color.White.copy(0.06f), Color.White.copy(0.06f)))
                        )
                        .clickable { onSelectTab(id) }
                        .padding(horizontal = if (isCover) 10.dp else 14.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        label.uppercase(),
                        fontSize = if (isCover) 8.sp else 9.sp,
                        fontWeight = FontWeight.Black,
                        letterSpacing = 0.8.sp,
                        color = Color.White.copy(if (active) 1f else 0.65f)
                    )
                }
            }
        }

        // Search Bar (if not in local tab)
        if (activeTab != "LOCAL") {
            OutlinedTextField(
                value = search,
                onValueChange = onSearchChange,
                placeholder = { Text("Search tracks, artists, genres…", fontSize = 12.sp, color = Color.White.copy(0.4f)) },
                leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null, Modifier.size(18.dp)) },
                trailingIcon = {
                    if (search.isNotEmpty()) {
                        IconButton(onClick = { onSearchChange("") }) {
                            Icon(Icons.Rounded.Close, contentDescription = "Clear", Modifier.size(16.dp))
                        }
                    }
                },
                singleLine = true,
                shape = CircleShape,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = gridPadding, vertical = 4.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = ChoraOrange,
                    unfocusedBorderColor = Color.White.copy(0.12f)
                )
            )
        }

        if (loading) LinearProgressIndicator(Modifier.fillMaxWidth(), color = ChoraCyan)
        error?.let {
            Text(it, color = ChoraOrange, modifier = Modifier.padding(16.dp))
            TextButton(onClick = onRetry, modifier = Modifier.padding(horizontal = 16.dp)) { Text("Retry") }
        }

        // Tab Content
        Box(modifier = Modifier.weight(1f)) {
            when (activeTab) {
                "LOCAL" -> {
                    LocalMediaScreen(
                        onPlayTrack = { localTrack ->
                            if (player != null) {
                                val item = MediaItem.Builder()
                                    .setUri(localTrack.contentUri)
                                    .setMediaId("local:${localTrack.id}")
                                    .setMediaMetadata(
                                        MediaMetadata.Builder()
                                            .setTitle(localTrack.title)
                                            .setArtist(localTrack.artist)
                                            .setAlbumTitle(localTrack.album)
                                            .setArtworkUri(localTrack.artworkUri)
                                            .build()
                                    )
                                    .build()
                                player.setMediaItem(item)
                                player.prepare()
                                player.play()
                            }
                        }
                    )
                }

                "NEW" -> {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(gridCols),
                        contentPadding = PaddingValues(gridPadding),
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        val heroAlbum = filtered.firstOrNull()
                        if (heroAlbum != null) {
                            item(span = { GridItemSpan(gridCols) }) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(18.dp))
                                        .background(Brush.verticalGradient(listOf(Color(0xFF220833), Color(0xFF0D0316))))
                                        .border(1.dp, Color.White.copy(0.12f), RoundedCornerShape(18.dp))
                                        .clickable { onSelectAlbum(heroAlbum) }
                                        .padding(if (isCover) 12.dp else 16.dp)
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        PlatformArt(
                                            heroAlbum.image,
                                            heroAlbum.title,
                                            modifier = Modifier
                                                .size(if (isCover) 80.dp else 100.dp)
                                                .clip(RoundedCornerShape(12.dp))
                                        )
                                        Column(Modifier.weight(1f)) {
                                            Text(
                                                "FEATURED RELEASE",
                                                fontSize = 8.sp,
                                                fontWeight = FontWeight.ExtraBold,
                                                letterSpacing = 1.8.sp,
                                                color = ChoraOrange
                                            )
                                            Text(
                                                heroAlbum.title.uppercase(),
                                                fontSize = if (isCover) 14.sp else 16.sp,
                                                fontWeight = FontWeight.Black,
                                                color = Color.White,
                                                maxLines = 2,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                            Text(
                                                heroAlbum.creator.uppercase(),
                                                fontSize = 11.sp,
                                                color = Color.White.copy(0.7f),
                                                fontWeight = FontWeight.Bold,
                                                maxLines = 1
                                            )
                                            Spacer(Modifier.height(8.dp))
                                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                Button(
                                                    onClick = { onSelectAlbum(heroAlbum) },
                                                    shape = CircleShape,
                                                    colors = ButtonDefaults.buttonColors(containerColor = ChoraOrange),
                                                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp),
                                                    modifier = Modifier.height(30.dp)
                                                ) {
                                                    Icon(Icons.Rounded.PlayArrow, contentDescription = null, tint = Color.Black, modifier = Modifier.size(14.dp))
                                                    Spacer(Modifier.width(4.dp))
                                                    Text("PLAY", fontSize = 10.sp, fontWeight = FontWeight.Black, color = Color.Black)
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // Celestial Orrery (hide on cover screen to maximize vertical feed space)
                        if (showNightSky && !isCover) {
                            item(span = { GridItemSpan(gridCols) }) {
                                NightSky(albums = albums, onSelect = onSelectAlbum)
                            }
                        }

                        item(span = { GridItemSpan(gridCols) }) {
                            Text(
                                "NEW RELEASES (${filtered.size})",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Black,
                                letterSpacing = 2.sp,
                                color = Color.White.copy(0.6f),
                                modifier = Modifier.padding(top = 8.dp)
                            )
                        }

                        items(filtered.drop(1), key = { it.id }) { album ->
                            if (isCover) {
                                // 1-column high-impact row on narrow cover screen
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(14.dp))
                                        .background(Color.White.copy(0.04f))
                                        .border(BorderStroke(1.dp, Color.White.copy(0.06f)), RoundedCornerShape(14.dp))
                                        .clickable { onSelectAlbum(album) }
                                        .padding(10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    PlatformArt(album.image, album.title, Modifier.size(64.dp).clip(RoundedCornerShape(10.dp)))
                                    Column(Modifier.weight(1f)) {
                                        Text(
                                            album.title.uppercase(),
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Black,
                                            color = Color.White,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                        Text(
                                            album.creator.uppercase(),
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Color.White.copy(0.6f),
                                            maxLines = 1
                                        )
                                        Text(
                                            "${album.tracks.size} tracks · ${album.genre}",
                                            fontSize = 8.sp,
                                            color = ChoraCyan,
                                            fontWeight = FontWeight.ExtraBold
                                        )
                                    }
                                    Icon(Icons.Rounded.ChevronRight, contentDescription = null, tint = Color.White.copy(0.4f))
                                }
                            } else {
                                Column(Modifier.clickable { onSelectAlbum(album) }) {
                                    PlatformArt(album.image, album.title, Modifier.clip(RoundedCornerShape(14.dp)))
                                    Text(
                                        album.title.uppercase(),
                                        Modifier.padding(top = 8.dp),
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Black,
                                        letterSpacing = 0.5.sp,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                        album.creator.uppercase(),
                                        Modifier.padding(top = 2.dp),
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Medium,
                                        color = Color.White.copy(0.55f),
                                        maxLines = 1
                                    )
                                }
                            }
                        }
                    }
                }

                "RADIO" -> {
                    val stations = listOf(
                        Triple("Chora Ambient Flow", "Deep meditative electronic & ethereal soundscapes", "https://plajah.com/audio/anthems/usa.mp3"),
                        Triple("Night Sky Celestial", "Curated celestial orchestrations & nocturnal downtempo", "https://plajah.com/audio/anthems/france.mp3"),
                        Triple("Plajah Afrobeat Club", "High energy afro rhythms & global syncopations", "https://plajah.com/audio/anthems/ghana.mp3"),
                        Triple("Tokyo Synthwave 2088", "Futuristic cyberpunk synth & dark electro drive", "https://plajah.com/audio/anthems/japan.mp3")
                    )
                    LazyColumn(
                        contentPadding = PaddingValues(gridPadding),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        item {
                            Text(
                                "LIVE RADIO STATIONS",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Black,
                                letterSpacing = 2.sp,
                                color = ChoraCyan
                            )
                        }
                        items(stations) { (title, subtitle, streamUrl) ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(Color.White.copy(0.04f))
                                    .border(1.dp, Color.White.copy(0.08f), RoundedCornerShape(14.dp))
                                    .clickable {
                                        if (player != null) {
                                            val item = MediaItem.Builder()
                                                .setUri(streamUrl)
                                                .setMediaId("radio:$title")
                                                .setMediaMetadata(
                                                    MediaMetadata.Builder()
                                                        .setTitle(title)
                                                        .setArtist("Plajah Live Radio")
                                                        .build()
                                                )
                                                .build()
                                            player.setMediaItem(item)
                                            player.prepare()
                                            player.play()
                                        }
                                    }
                                    .padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(14.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(44.dp)
                                        .clip(CircleShape)
                                        .background(Spatial),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(Icons.Rounded.Radio, contentDescription = null, tint = Color.White)
                                }
                                Column(Modifier.weight(1f)) {
                                    Text(title, fontSize = 13.sp, fontWeight = FontWeight.Black, color = Color.White)
                                    Text(subtitle, fontSize = 10.sp, color = Color.White.copy(0.55f))
                                }
                                Icon(Icons.Rounded.PlayArrow, contentDescription = "Play", tint = ChoraOrange)
                            }
                        }
                    }
                }

                "ARTISTS", "GENRES" -> {
                    val groups = filtered.groupBy { if (activeTab == "ARTISTS") it.creator else it.genre.ifBlank { "Uncategorized" } }
                    LazyColumn(
                        contentPadding = PaddingValues(gridPadding),
                        verticalArrangement = Arrangement.spacedBy(18.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        groups.forEach { (name, releases) ->
                            item(key = name) {
                                Column {
                                    Text(name.uppercase(), fontSize = 14.sp, fontWeight = FontWeight.Black, color = Color.White)
                                    Row(
                                        Modifier
                                            .horizontalScroll(rememberScrollState())
                                            .padding(top = 8.dp),
                                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                                    ) {
                                        releases.forEach { album ->
                                            Column(
                                                Modifier
                                                    .width(130.dp)
                                                    .clickable { onSelectAlbum(album) }
                                            ) {
                                                PlatformArt(album.image, album.title, Modifier.clip(RoundedCornerShape(12.dp)))
                                                Text(
                                                    album.title.uppercase(),
                                                    Modifier.padding(top = 6.dp),
                                                    fontSize = 10.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                else -> {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(gridCols),
                        contentPadding = PaddingValues(gridPadding),
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        items(filtered, key = { it.id }) { album ->
                            Column(Modifier.clickable { onSelectAlbum(album) }) {
                                PlatformArt(album.image, album.title, Modifier.clip(RoundedCornerShape(14.dp)))
                                Text(
                                    album.title.uppercase(),
                                    Modifier.padding(top = 8.dp),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Black,
                                    letterSpacing = 0.5.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    album.creator.uppercase(),
                                    Modifier.padding(top = 2.dp),
                                    fontSize = 9.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = Color.White.copy(0.55f),
                                    maxLines = 1
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * Z Fold Unfolded Main Screen Companion Pane:
 * Displays Now Spinning Vinyl disc, Hi-Res 24/48 specs, animated waveform, slider, transports, and Up Next queue.
 */
@Composable
fun ChoraFoldableCompanionPane(
    albums: List<PlatformItem>,
    currentTrackTitle: String,
    currentArtist: String,
    isPlaying: Boolean,
    duration: Long,
    position: Long,
    player: Player?,
    onSelectAlbum: (PlatformItem) -> Unit,
    isCasting: Boolean,
    onToggleCast: () -> Unit
) {
    val activeAlbum = albums.firstOrNull { it.title.equals(currentTrackTitle, ignoreCase = true) } ?: albums.firstOrNull()
    var stageMode by remember { mutableStateOf(ChoraStageMode.ART) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(18.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Top Header of Companion Pane
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    "NOW SPINNING",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = 2.sp,
                    color = ChoraOrange
                )
                Text(
                    "Z-FOLD REGISTRY CONSOLE",
                    fontSize = 8.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.2.sp,
                    color = Color.White.copy(0.4f)
                )
            }

            Surface(
                shape = CircleShape,
                color = Color.White.copy(0.08f),
                border = BorderStroke(1.dp, ChoraCyan.copy(0.3f))
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Box(modifier = Modifier.size(5.dp).clip(CircleShape).background(ChoraCyan))
                    Text(
                        "HI-RES 24/48",
                        fontSize = 8.sp,
                        fontWeight = FontWeight.Black,
                        color = ChoraCyan,
                        letterSpacing = 0.8.sp
                    )
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        val slideImages = remember(activeAlbum) {
            if (activeAlbum == null) emptyList()
            else {
                val list = mutableListOf<String>()
                if (activeAlbum.image.isNotBlank()) list.add(activeAlbum.image)
                if (activeAlbum.galleryUrl.isNotBlank()) list.add(activeAlbum.galleryUrl)
                activeAlbum.tracks.forEach { tr -> list.addAll(tr.images.filter { it.isNotBlank() }) }
                list.distinct().ifEmpty { listOf(activeAlbum.image) }
            }
        }

        // Visual Stage Selector Pill Bar
        ChoraStagePillBar(
            activeMode = stageMode,
            onSelectMode = { stageMode = it }
        )

        Spacer(Modifier.height(12.dp))

        // Stage View Container
        Box(
            modifier = Modifier
                .size(190.dp)
                .clip(RoundedCornerShape(16.dp)),
            contentAlignment = Alignment.Center
        ) {
            when (stageMode) {
                ChoraStageMode.ART -> {
                    ChoraVinylArtView(
                        album = activeAlbum,
                        isPlaying = isPlaying,
                        modifier = Modifier.size(190.dp)
                    )
                }
                ChoraStageMode.SLIDESHOW -> {
                    ChoraSlideshowView(
                        images = slideImages,
                        albumTitle = activeAlbum?.title ?: "Plajah Chora",
                        artistName = activeAlbum?.creator ?: "Celestial Registry",
                        isPlaying = isPlaying,
                        modifier = Modifier.fillMaxSize()
                    )
                }
                ChoraStageMode.FX_STAGE -> {
                    ChoraFxStageView(
                        isPlaying = isPlaying,
                        modifier = Modifier.fillMaxSize()
                    )
                }
                ChoraStageMode.ORRERY -> {
                    NightSky(albums = albums, onSelect = onSelectAlbum)
                }
            }
        }

        Spacer(Modifier.height(14.dp))

        // Track Title & Artist
        Text(
            currentTrackTitle.ifBlank { activeAlbum?.title ?: "Plajah Chora" },
            fontFamily = BrandDisplay,
            fontSize = 17.sp,
            fontWeight = FontWeight.Black,
            color = Color.White,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        Text(
            currentArtist.ifBlank { activeAlbum?.creator ?: "Celestial Registry" },
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White.copy(0.55f),
            maxLines = 1
        )

        Spacer(Modifier.height(12.dp))

        // Progress Slider
        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp)) {
            val progress = if (duration > 0) (position.toFloat() / duration).coerceIn(0f, 1f) else 0f
            Slider(
                value = progress,
                onValueChange = { frac ->
                    if (player != null && duration > 0) {
                        player.seekTo((frac * duration).toLong())
                    }
                },
                colors = SliderDefaults.colors(
                    thumbColor = ChoraOrange,
                    activeTrackColor = ChoraOrange,
                    inactiveTrackColor = Color.White.copy(0.12f)
                ),
                modifier = Modifier.fillMaxWidth().height(18.dp)
            )
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(formatClock(position), fontSize = 10.sp, color = Color.White.copy(0.4f), fontWeight = FontWeight.Bold)
                Text(formatClock(duration), fontSize = 10.sp, color = Color.White.copy(0.4f), fontWeight = FontWeight.Bold)
            }
        }

        Spacer(Modifier.height(10.dp))

        // Transport Controls Row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onToggleCast) {
                Icon(
                    if (isCasting) Icons.Rounded.CastConnected else Icons.Rounded.Cast,
                    contentDescription = "Cast",
                    tint = if (isCasting) ChoraCyan else Color.White.copy(0.5f)
                )
            }

            IconButton(onClick = { player?.seekToPreviousMediaItem() }) {
                Icon(Icons.Rounded.SkipPrevious, contentDescription = "Prev", tint = Color.White, modifier = Modifier.size(28.dp))
            }

            Box(
                modifier = Modifier
                    .size(52.dp)
                    .clip(CircleShape)
                    .background(Spatial)
                    .clickable {
                        if (player != null) {
                            if (player.isPlaying) player.pause() else player.play()
                        }
                    },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    if (isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                    contentDescription = "Play/Pause",
                    tint = Color.White,
                    modifier = Modifier.size(28.dp)
                )
            }

            IconButton(onClick = { player?.seekToNextMediaItem() }) {
                Icon(Icons.Rounded.SkipNext, contentDescription = "Next", tint = Color.White, modifier = Modifier.size(28.dp))
            }

            IconButton(onClick = { /* repeat */ }) {
                Icon(Icons.Rounded.Repeat, contentDescription = "Repeat", tint = Color.White.copy(0.5f))
            }
        }

        Spacer(Modifier.height(14.dp))

        // Up Next in Registry
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                "UP NEXT IN REGISTRY",
                fontSize = 9.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = 1.5.sp,
                color = Color.White.copy(0.5f)
            )
        }

        Spacer(Modifier.height(6.dp))

        LazyColumn(
            modifier = Modifier.fillMaxWidth().weight(1f),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            items(albums.take(12), key = { it.id }) { item ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color.White.copy(0.03f))
                        .clickable { onSelectAlbum(item) }
                        .padding(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    PlatformArt(item.image, item.title, modifier = Modifier.size(34.dp).clip(RoundedCornerShape(6.dp)))
                    Column(Modifier.weight(1f)) {
                        Text(item.title, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(item.creator, fontSize = 9.sp, color = Color.White.copy(0.5f), maxLines = 1)
                    }
                    Text(
                        "${item.tracks.size} tracks",
                        fontSize = 9.sp,
                        color = ChoraOrange,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}

/**
 * Samsung Galaxy Z Fold Flex Mode Tabletop Screen:
 * Top Half (Upright): Stage with Orrery and visualizer.
 * Bottom Half (Flat Base): DJ Mixing console, tactile transport deck, volume fader, and category rail.
 */
@Composable
fun ChoraFlexScreen(
    albums: List<PlatformItem>,
    currentTrackTitle: String,
    currentArtist: String,
    isPlaying: Boolean,
    duration: Long,
    position: Long,
    player: Player?,
    tabs: List<Pair<String, String>>,
    activeTab: String,
    onSelectTab: (String) -> Unit,
    onSelectAlbum: (PlatformItem) -> Unit,
    isCasting: Boolean,
    onToggleCast: () -> Unit
) {
    val activeAlbum = albums.firstOrNull { it.title.equals(currentTrackTitle, ignoreCase = true) } ?: albums.firstOrNull()
    var flexStageMode by remember { mutableStateOf(ChoraStageMode.ORRERY) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Transparent)
    ) {
        // TOP HALF: Upright Viewport (Stage / Orrery / Vinyl / Slideshow / FX)
        Box(
            modifier = Modifier
                .weight(1.15f)
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color(0x990F0619), Color(0x6604030A)))),
            contentAlignment = Alignment.Center
        ) {
            when (flexStageMode) {
                ChoraStageMode.ORRERY -> {
                    NightSky(albums = albums, onSelect = onSelectAlbum)
                }
                ChoraStageMode.ART -> {
                    ChoraVinylArtView(
                        album = activeAlbum,
                        isPlaying = isPlaying,
                        modifier = Modifier.size(210.dp)
                    )
                }
                ChoraStageMode.SLIDESHOW -> {
                    val flexSlides = remember(activeAlbum) {
                        if (activeAlbum == null) emptyList()
                        else {
                            val list = mutableListOf<String>()
                            if (activeAlbum.image.isNotBlank()) list.add(activeAlbum.image)
                            if (activeAlbum.galleryUrl.isNotBlank()) list.add(activeAlbum.galleryUrl)
                            activeAlbum.tracks.forEach { tr -> list.addAll(tr.images.filter { it.isNotBlank() }) }
                            list.distinct().ifEmpty { listOf(activeAlbum.image) }
                        }
                    }
                    ChoraSlideshowView(
                        images = flexSlides,
                        albumTitle = activeAlbum?.title ?: "Plajah Chora",
                        artistName = activeAlbum?.creator ?: "Live Session",
                        isPlaying = isPlaying,
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp)
                            .clip(RoundedCornerShape(16.dp))
                    )
                }
                ChoraStageMode.FX_STAGE -> {
                    ChoraFxStageView(
                        isPlaying = isPlaying,
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(16.dp)
                            .clip(RoundedCornerShape(16.dp))
                    )
                }
            }

            // Top Floating Stage Mode Pill Bar
            Box(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 10.dp)
            ) {
                ChoraStagePillBar(
                    activeMode = flexStageMode,
                    onSelectMode = { flexStageMode = it }
                )
            }
        }

        // PHYSICAL HINGE ACCENT BAR
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(3.dp)
                .background(
                    Brush.horizontalGradient(
                        listOf(Color.Transparent, ChoraOrange, ChoraCyan, Color.Transparent)
                    )
                )
        )

        // BOTTOM HALF: Flat Console Base (DJ Deck, Transports, Slider, Tabs)
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .background(Color(0xEE080614))
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    "FLEX CONSOLE ACTIVE",
                    fontSize = 8.sp,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = 1.8.sp,
                    color = ChoraOrange
                )
                Text(
                    currentTrackTitle.ifBlank { "Plajah Chora Celestial Radio" },
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Black,
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    currentArtist.ifBlank { "Live Audio Session" },
                    fontSize = 11.sp,
                    color = Color.White.copy(0.6f)
                )
            }

            // Progress Slider
            Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
                val progress = if (duration > 0) (position.toFloat() / duration).coerceIn(0f, 1f) else 0f
                Slider(
                    value = progress,
                    onValueChange = { frac ->
                        if (player != null && duration > 0) {
                            player.seekTo((frac * duration).toLong())
                        }
                    },
                    colors = SliderDefaults.colors(
                        thumbColor = ChoraOrange,
                        activeTrackColor = ChoraOrange,
                        inactiveTrackColor = Color.White.copy(0.12f)
                    ),
                    modifier = Modifier.fillMaxWidth().height(20.dp)
                )
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(formatClock(position), fontSize = 10.sp, color = Color.White.copy(0.4f))
                    Text(formatClock(duration), fontSize = 10.sp, color = Color.White.copy(0.4f))
                }
            }

            // Big Tactile Transport Deck
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onToggleCast) {
                    Icon(
                        if (isCasting) Icons.Rounded.CastConnected else Icons.Rounded.Cast,
                        contentDescription = "Cast",
                        tint = if (isCasting) ChoraCyan else Color.White.copy(0.6f)
                    )
                }

                IconButton(onClick = { player?.seekToPreviousMediaItem() }, modifier = Modifier.size(46.dp)) {
                    Icon(Icons.Rounded.SkipPrevious, contentDescription = "Prev", tint = Color.White, modifier = Modifier.size(30.dp))
                }

                Box(
                    modifier = Modifier
                        .size(60.dp)
                        .clip(CircleShape)
                        .background(Spatial)
                        .clickable {
                            if (player != null) {
                                if (player.isPlaying) player.pause() else player.play()
                            }
                        },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        if (isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                        contentDescription = "Play/Pause",
                        tint = Color.White,
                        modifier = Modifier.size(34.dp)
                    )
                }

                IconButton(onClick = { player?.seekToNextMediaItem() }, modifier = Modifier.size(46.dp)) {
                    Icon(Icons.Rounded.SkipNext, contentDescription = "Next", tint = Color.White, modifier = Modifier.size(30.dp))
                }

                IconButton(onClick = { /* DJ FX */ }) {
                    Icon(Icons.Rounded.GraphicEq, contentDescription = "FX", tint = ChoraOrange)
                }
            }

            // Quick Category Chip Rail on Tabletop
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                tabs.take(8).forEach { (id, label) ->
                    val active = activeTab == id
                    Box(
                        modifier = Modifier
                            .height(28.dp)
                            .clip(CircleShape)
                            .then(
                                if (active) Modifier.background(Spatial)
                                else Modifier.background(Color.White.copy(0.08f))
                            )
                            .clickable { onSelectTab(id) }
                            .padding(horizontal = 12.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(label.uppercase(), fontSize = 8.sp, fontWeight = FontWeight.Black, color = Color.White)
                    }
                }
            }
        }
    }
}

@Composable
private fun NightSky(albums: List<PlatformItem>, onSelect: (PlatformItem) -> Unit) {
    var seconds by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(Unit) {
        val start = withFrameNanos { it }
        while (true) withFrameNanos { seconds = (it - start) / 1_000_000_000f }
    }
    val sizes = listOf(76, 60, 54, 46, 40, 36)
    val lanes = listOf(0.35f, 0.18f, 0.58f, 0.27f, 0.67f, 0.48f)
    BoxWithConstraints(
        Modifier
            .padding(top = 10.dp)
            .fillMaxWidth()
            .height(200.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(Brush.verticalGradient(listOf(Color(0xFF14091E), Color(0xFF021E24))))
            .border(1.dp, Color.White.copy(0.12f), RoundedCornerShape(16.dp))
    ) {
        Canvas(Modifier.fillMaxSize()) {
            listOf(0.12f to 0.24f, 0.34f to 0.68f, 0.55f to 0.18f, 0.71f to 0.52f, 0.88f to 0.3f, 0.22f to 0.84f, 0.64f to 0.86f).forEach { (x, y) ->
                drawCircle(Color.White.copy(0.4f), 1.dp.toPx(), Offset(size.width * x, size.height * y))
            }
        }
        Text(
            "CELESTIAL ORRERY",
            Modifier.padding(12.dp),
            fontSize = 9.sp,
            fontWeight = FontWeight.ExtraBold,
            letterSpacing = 2.sp,
            color = Color(0xFFD0BCFF)
        )
        albums.filter { it.image.isNotBlank() }.take(6).forEachIndexed { index, album ->
            val period = 34f + (index % 3) * 4
            val x = ((seconds + index * 5.7f + 2f) % period) / period * (maxWidth.value + 240) - 110
            Box(
                Modifier
                    .offset(x.dp, (200 * lanes[index]).dp)
                    .size(sizes[index].dp)
                    .clip(CircleShape)
                    .border(1.dp, ChoraCyan.copy(0.4f), CircleShape)
                    .clickable { onSelect(album) }
            ) {
                PlatformArt(album.image, album.title, Modifier.fillMaxSize(), square = false)
            }
        }
    }
}
