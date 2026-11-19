package com.plajah.app.ui.screens

import android.widget.Toast
import androidx.activity.compose.BackHandler
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
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
import com.plajah.app.data.PlatformCatalog
import com.plajah.app.data.PlatformItem
import com.plajah.app.ui.components.ChoraAtmosphericBackground
import com.plajah.app.ui.components.ChoraFxStageView
import com.plajah.app.ui.components.ChoraSlideshowView
import com.plajah.app.ui.components.ChoraStageMode
import com.plajah.app.ui.components.ChoraStagePillBar
import com.plajah.app.ui.components.ChoraVinylArtView
import com.plajah.app.ui.foldable.FoldableInfo
import com.plajah.app.ui.foldable.rememberFoldableInfo
import com.plajah.app.ui.theme.BrandDisplay
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import java.time.LocalDate
import java.time.LocalTime
import java.time.temporal.ChronoUnit

private fun formatClock(ms: Long): String {
    val seconds = (ms / 1000).coerceAtLeast(0)
    return "%d:%02d".format(seconds / 60, seconds % 60)
}

/**
 * 100% Website-Parity Native Jetpack Compose Chora (mirrors MusicView.tsx + ChoraMarquee.tsx +
 * ChoraSkyBand.tsx + ChoraNextMasthead.tsx + PlayerView.tsx).
 *
 * Includes:
 * - Day ("The Listening Room") / Night ("The Sky Tonight" Observatory) / Auto mode switcher
 * - L1 Marquee Proscenium Hero combining Chora releases + live Audius trending picks
 * - Tonight's Sky flying comet chart (orange Chora comets + purple Audius comets) / Today's Selections panes
 * - Full 13+ tab website navigation (New, For You, Radio, Artists, Albums, Mixes, Genres, Vault, Podcasts, Audiobooks, My Library, Playlists, Local Media)
 * - Dual-catalog source filter (All / Chora / Audius) + World Cup 2026 Anthems + Live Radio
 * - Adaptive scaling across narrow Z Fold cover screens, standard phones, Pixel Fold / Z Fold unfolded dual-pane, and Flex Tabletop mode
 */
@Composable
fun ChoraScreen(
    initialAlbumId: String? = null,
    onOpenPlatform: (String) -> Unit,
    onExit: () -> Unit,
    showTopShellExit: Boolean = true,
) {
    val context = LocalContext.current
    val player = rememberChoraPlayer()
    val foldable = rememberFoldableInfo()

    var albums by remember { mutableStateOf<List<PlatformItem>>(emptyList()) }
    var audiusTracks by remember { mutableStateOf<List<PlatformItem>>(emptyList()) }
    var selectedId by rememberSaveable { mutableStateOf(initialAlbumId) }
    val allCatalog = remember(albums, audiusTracks) { albums + audiusTracks }
    val selected = allCatalog.firstOrNull { it.id == selectedId }

    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    var attempt by remember { mutableIntStateOf(0) }
    var search by remember { mutableStateOf("") }
    var activeTab by rememberSaveable { mutableStateOf("NEW") }
    var sourceFilter by rememberSaveable { mutableStateOf("ALL") } // ALL | CHORA | AUDIUS
    var skinMode by rememberSaveable { mutableStateOf("AUTO") }    // AUTO | DAY | NIGHT
    var isCasting by remember { mutableStateOf(false) }

    val isNight = remember(skinMode) {
        when (skinMode) {
            "NIGHT" -> true
            "DAY" -> false
            else -> {
                val h = LocalTime.now().hour
                h < 6 || h >= 18
            }
        }
    }

    var currentTrackTitle by remember { mutableStateOf("") }
    var currentArtist by remember { mutableStateOf("") }
    var isPlaying by remember { mutableStateOf(false) }
    var position by remember { mutableLongStateOf(0L) }
    var duration by remember { mutableLongStateOf(0L) }

    LaunchedEffect(attempt) {
        loading = true
        error = null
        try {
            coroutineScope {
                val choraDeferred = async { PlatformCatalog.load("chora") }
                val audiusDeferred = async { PlatformCatalog.loadAudiusTrending(16) }
                albums = choraDeferred.await()
                audiusTracks = audiusDeferred.await()
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = e.message
        } finally {
            loading = false
        }
    }

    // Live Audius search enrichment when user types a query
    var audiusSearchHits by remember { mutableStateOf<List<PlatformItem>>(emptyList()) }
    LaunchedEffect(search) {
        if (search.trim().length >= 3) {
            delay(350)
            audiusSearchHits = PlatformCatalog.searchAudius(search)
        } else {
            audiusSearchHits = emptyList()
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
                position = player.currentPosition.coerceAtLeast(0L)
                duration = player.duration.coerceAtLeast(0L)
            }
            delay(500)
        }
    }

    BackHandler(selectedId != null) { selectedId = null }

    val tabs = remember {
        listOf(
            "NEW" to "New",
            "FOR_YOU" to "For You",
            "RADIO" to "Radio",
            "ARTISTS" to "Artists",
            "ALBUMS" to "Albums",
            "MIXES" to "Mixes",
            "GENRES" to "Genres",
            "VAULT" to "The Vault",
            "PODCASTS" to "Podcasts",
            "AUDIO_BOOKS" to "Audiobooks",
            "MY_LIBRARY" to "My Library",
            "PLAYLISTS" to "Playlists",
            "LOCAL" to "Local Media",
        )
    }

    val combinedSearchPool = remember(albums, audiusTracks, audiusSearchHits, sourceFilter) {
        val base = when (sourceFilter) {
            "CHORA" -> albums
            "AUDIUS" -> (audiusSearchHits + audiusTracks).distinctBy { it.id }
            else -> (albums + audiusSearchHits + audiusTracks).distinctBy { it.id }
        }
        base
    }

    val filtered = remember(combinedSearchPool, search) {
        if (search.isBlank()) combinedSearchPool
        else combinedSearchPool.filter {
            it.title.contains(search, ignoreCase = true) ||
                it.creator.contains(search, ignoreCase = true) ||
                it.genre.contains(search, ignoreCase = true)
        }
    }

    fun playAlbumImmediately(item: PlatformItem) {
        val firstTrack = item.tracks.firstOrNull { it.url.isNotBlank() }
        if (player != null && firstTrack != null) {
            val playable = item.tracks.filter { it.url.isNotBlank() }
            player.setMediaItems(
                playable.map { t ->
                    MediaItem.Builder()
                        .setUri(t.url)
                        .setMediaId("${item.id}:${t.id}")
                        .setMediaMetadata(
                            MediaMetadata.Builder()
                                .setTitle(t.title)
                                .setArtist(t.artist.ifBlank { item.creator })
                                .setAlbumTitle(item.title)
                                .setArtworkUri(if (item.image.isNotBlank()) android.net.Uri.parse(item.image) else null)
                                .build()
                        )
                        .build()
                }
            )
            player.prepare()
            player.play()
        }
        selectedId = item.id
    }

    val onToggleCast = {
        isCasting = !isCasting
        Toast.makeText(
            context,
            if (isCasting) "Cast ready — choose speakers in device Cast menu" else "Casting disconnected",
            Toast.LENGTH_SHORT,
        ).show()
    }

    ChoraAtmosphericBackground(isPlaying = isPlaying) {
        if (foldable.isFlexMode) {
            ChoraFlexScreen(
                albums = albums,
                audiusTracks = audiusTracks,
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
                onToggleCast = onToggleCast,
            )
        } else if (foldable.supportsDualPane) {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Transparent),
            ) {
                Box(Modifier.weight(0.56f).fillMaxHeight()) {
                    ChoraCatalogPane(
                        albums = albums,
                        audiusTracks = audiusTracks,
                        filtered = filtered,
                        tabs = tabs,
                        activeTab = activeTab,
                        onSelectTab = { activeTab = it },
                        sourceFilter = sourceFilter,
                        onSourceFilter = { sourceFilter = it },
                        skinMode = skinMode,
                        isNight = isNight,
                        onCycleSkinMode = {
                            skinMode = when (skinMode) {
                                "AUTO" -> "DAY"
                                "DAY" -> "NIGHT"
                                else -> "AUTO"
                            }
                        },
                        search = search,
                        onSearchChange = { search = it },
                        loading = loading,
                        error = error,
                        onRetry = { attempt++ },
                        onSelectAlbum = { selectedId = it.id },
                        onPlayAlbum = ::playAlbumImmediately,
                        onOpenPlatform = onOpenPlatform,
                        player = player,
                        onExit = onExit,
                        showTopShellExit = showTopShellExit,
                        foldable = foldable,
                        isCasting = isCasting,
                        onToggleCast = onToggleCast,
                    )
                }

                Box(
                    modifier = Modifier
                        .width(foldable.hingeWidthDp.coerceAtLeast(1.dp))
                        .fillMaxHeight()
                        .background(Color.White.copy(0.12f)),
                )

                Box(
                    modifier = Modifier
                        .weight(0.44f)
                        .fillMaxHeight()
                        .background(Color.Black.copy(0.35f)),
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
                            onToggleCast = onToggleCast,
                        )
                    }
                }
            }
        } else if (selected != null) {
            ChoraAlbumScreen(selected, { selectedId = null }, onOpenPlatform)
        } else {
            Column(Modifier.fillMaxSize()) {
                Box(Modifier.weight(1f)) {
                    ChoraCatalogPane(
                        albums = albums,
                        audiusTracks = audiusTracks,
                        filtered = filtered,
                        tabs = tabs,
                        activeTab = activeTab,
                        onSelectTab = { activeTab = it },
                        sourceFilter = sourceFilter,
                        onSourceFilter = { sourceFilter = it },
                        skinMode = skinMode,
                        isNight = isNight,
                        onCycleSkinMode = {
                            skinMode = when (skinMode) {
                                "AUTO" -> "DAY"
                                "DAY" -> "NIGHT"
                                else -> "AUTO"
                            }
                        },
                        search = search,
                        onSearchChange = { search = it },
                        loading = loading,
                        error = error,
                        onRetry = { attempt++ },
                        onSelectAlbum = { selectedId = it.id },
                        onPlayAlbum = ::playAlbumImmediately,
                        onOpenPlatform = onOpenPlatform,
                        player = player,
                        onExit = onExit,
                        showTopShellExit = showTopShellExit,
                        foldable = foldable,
                        isCasting = isCasting,
                        onToggleCast = onToggleCast,
                    )
                }

                if (player != null && (currentTrackTitle.isNotBlank() || isPlaying)) {
                    ChoraDockedMiniPlayer(
                        title = currentTrackTitle,
                        artist = currentArtist,
                        isPlaying = isPlaying,
                        position = position,
                        duration = duration,
                        compact = foldable.isUltraCompact,
                        onTogglePlay = { if (player.isPlaying) player.pause() else player.play() },
                        onNext = { player.seekToNextMediaItem() },
                        onOpenCurrent = {
                            val active = allCatalog.firstOrNull { a ->
                                a.tracks.any { it.title.equals(currentTrackTitle, ignoreCase = true) } ||
                                    a.title.equals(currentTrackTitle, ignoreCase = true)
                            }
                            if (active != null) selectedId = active.id
                        },
                    )
                }
            }
        }
    }
}

@Composable
fun ChoraDockedMiniPlayer(
    title: String,
    artist: String,
    isPlaying: Boolean,
    position: Long,
    duration: Long,
    compact: Boolean,
    onTogglePlay: () -> Unit,
    onNext: () -> Unit,
    onOpenCurrent: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xEE100B1A))
            .border(BorderStroke(1.dp, Color.White.copy(0.08f)))
            .clickable(onClick = onOpenCurrent),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(2.5.dp)
                .background(Color.White.copy(0.12f)),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(if (duration > 0L) (position.toFloat() / duration.toFloat()).coerceIn(0f, 1f) else 0f)
                    .fillMaxHeight()
                    .background(Spatial),
            )
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = if (compact) 10.dp else 14.dp, vertical = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Spatial),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Rounded.GraphicEq, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(
                    title.ifBlank { "Plajah Chora" },
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    maxLines = 1,
                    softWrap = false,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    artist.ifBlank { "Now Playing" },
                    fontSize = 10.sp,
                    color = Color.White.copy(0.55f),
                    maxLines = 1,
                    softWrap = false,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            IconButton(onClick = onTogglePlay, modifier = Modifier.size(36.dp)) {
                Icon(
                    if (isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                    contentDescription = "Play or Pause",
                    tint = ChoraOrange,
                )
            }
            IconButton(onClick = onNext, modifier = Modifier.size(36.dp)) {
                Icon(Icons.Rounded.SkipNext, contentDescription = "Next", tint = Color.White.copy(0.75f))
            }
        }
    }
}

@Composable
private fun ChoraCatalogPane(
    albums: List<PlatformItem>,
    audiusTracks: List<PlatformItem>,
    filtered: List<PlatformItem>,
    tabs: List<Pair<String, String>>,
    activeTab: String,
    onSelectTab: (String) -> Unit,
    sourceFilter: String,
    onSourceFilter: (String) -> Unit,
    skinMode: String,
    isNight: Boolean,
    onCycleSkinMode: () -> Unit,
    search: String,
    onSearchChange: (String) -> Unit,
    loading: Boolean,
    error: String?,
    onRetry: () -> Unit,
    onSelectAlbum: (PlatformItem) -> Unit,
    onPlayAlbum: (PlatformItem) -> Unit,
    onOpenPlatform: (String) -> Unit,
    player: Player?,
    onExit: () -> Unit,
    showTopShellExit: Boolean,
    foldable: FoldableInfo,
    isCasting: Boolean,
    onToggleCast: () -> Unit,
) {
    val isCompact = foldable.isUltraCompact
    val gridCols = foldable.squareGridColumns
    val pad = foldable.horizontalPadding

    Column(Modifier.fillMaxSize()) {
        // ── Chora Next Masthead (mirrors ChoraNextMasthead.tsx) ──
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = pad, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "PLAJAH ",
                        fontFamily = BrandDisplay,
                        fontSize = if (isCompact) 16.sp else 19.sp,
                        fontWeight = FontWeight.Black,
                        letterSpacing = 0.8.sp,
                        color = Color.White,
                        maxLines = 1,
                    )
                    Text(
                        "CHORA",
                        style = TextStyle(
                            brush = if (isNight) Spatial else Brush.linearGradient(listOf(Color(0xFFD40055), ChoraOrange)),
                            fontFamily = BrandDisplay,
                            fontSize = if (isCompact) 16.sp else 19.sp,
                            fontWeight = FontWeight.Black,
                            letterSpacing = 0.8.sp,
                        ),
                        maxLines = 1,
                    )
                }
                val issue = ChronoUnit.DAYS.between(LocalDate.of(2026, 1, 1), LocalDate.now()) + 1
                Text(
                    "${if (isNight) "THE SKY TONIGHT" else "THE LISTENING ROOM"} · ISSUE Nº $issue · ${albums.size} WORKS",
                    fontSize = 8.5.sp,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = 1.2.sp,
                    color = Color.White.copy(0.45f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            // Day / Night / Auto toggle pill (matching website masthead)
            Surface(
                shape = CircleShape,
                color = Color.White.copy(0.08f),
                border = BorderStroke(1.dp, Color.White.copy(0.14f)),
                modifier = Modifier.clickable(onClick = onCycleSkinMode),
            ) {
                Text(
                    when (skinMode) {
                        "DAY" -> "☀ DAY"
                        "NIGHT" -> "☾ NIGHT"
                        else -> if (isNight) "☾ AUTO" else "☀ AUTO"
                    },
                    fontSize = 8.5.sp,
                    fontWeight = FontWeight.Black,
                    color = if (isNight) ChoraCyan else ChoraOrange,
                    maxLines = 1,
                    modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
                )
            }

            IconButton(onClick = onToggleCast, modifier = Modifier.size(34.dp)) {
                Icon(
                    if (isCasting) Icons.Rounded.CastConnected else Icons.Rounded.Cast,
                    contentDescription = "Cast",
                    tint = if (isCasting) ChoraCyan else Color.White.copy(0.7f),
                    modifier = Modifier.size(18.dp),
                )
            }

            if (showTopShellExit) {
                Surface(
                    shape = CircleShape,
                    color = Color.White.copy(0.06f),
                    modifier = Modifier.clickable(onClick = onExit),
                ) {
                    Text(
                        "CLASSIC",
                        fontSize = 8.5.sp,
                        fontWeight = FontWeight.Black,
                        color = Color.White.copy(0.75f),
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
                    )
                }
            }
        }

        // ── Category Chip Rail (all 13 Chora web tabs) ──
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = pad, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            tabs.forEach { (id, label) ->
                val active = activeTab == id
                Box(
                    modifier = Modifier
                        .height(32.dp)
                        .clip(CircleShape)
                        .background(
                            if (active) {
                                if (isNight) Spatial else Brush.linearGradient(listOf(Color(0xFF6B0099), Color(0xFFD40055)))
                            } else {
                                Brush.linearGradient(listOf(Color.White.copy(0.06f), Color.White.copy(0.06f)))
                            }
                        )
                        .clickable { onSelectTab(id) }
                        .padding(horizontal = 12.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        label.uppercase(),
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Black,
                        letterSpacing = 0.7.sp,
                        maxLines = 1,
                        softWrap = false,
                        color = Color.White.copy(if (active) 1f else 0.65f),
                    )
                }
            }
        }

        // ── Search + Source Filter (All / Chora / Audius) ──
        if (activeTab != "LOCAL") {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = pad, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                OutlinedTextField(
                    value = search,
                    onValueChange = onSearchChange,
                    placeholder = { Text("Search Chora + Audius…", fontSize = 12.sp, color = Color.White.copy(0.4f), maxLines = 1) },
                    leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null, Modifier.size(16.dp)) },
                    trailingIcon = {
                        if (search.isNotEmpty()) {
                            IconButton(onClick = { onSearchChange("") }, modifier = Modifier.size(28.dp)) {
                                Icon(Icons.Rounded.Close, contentDescription = "Clear", Modifier.size(14.dp))
                            }
                        }
                    },
                    singleLine = true,
                    shape = CircleShape,
                    modifier = Modifier.weight(1f),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = ChoraOrange,
                        unfocusedBorderColor = Color.White.copy(0.12f),
                    ),
                )
            }

            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = pad, vertical = 2.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                listOf("ALL" to "All Catalog", "CHORA" to "Chora", "AUDIUS" to "Audius").forEach { (key, label) ->
                    val active = sourceFilter == key
                    Surface(
                        shape = CircleShape,
                        color = if (active) {
                            if (key == "AUDIUS") Color(0xFF7E1BCC) else ChoraOrange
                        } else Color.White.copy(0.06f),
                        modifier = Modifier.clickable { onSourceFilter(key) },
                    ) {
                        Text(
                            label.uppercase(),
                            fontSize = 8.5.sp,
                            fontWeight = FontWeight.Black,
                            color = if (active && key != "AUDIUS") Color.Black else Color.White.copy(if (active) 1f else 0.65f),
                            maxLines = 1,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        )
                    }
                }
                Spacer(Modifier.weight(1f))
                Surface(
                    shape = CircleShape,
                    color = Color.White.copy(0.05f),
                    modifier = Modifier.clickable { onOpenPlatform("https://plajah.com/?view=chora_studio") },
                ) {
                    Text(
                        "STUDIO ↗",
                        fontSize = 8.5.sp,
                        fontWeight = FontWeight.Black,
                        color = ChoraCyan,
                        maxLines = 1,
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
                    )
                }
            }
        }

        if (loading) LinearProgressIndicator(Modifier.fillMaxWidth(), color = ChoraCyan)
        error?.let {
            Row(Modifier.padding(horizontal = pad, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(it, color = ChoraOrange, fontSize = 11.sp, modifier = Modifier.weight(1f))
                TextButton(onClick = onRetry) { Text("Retry") }
            }
        }

        // ── Active Tab Body ──
        Box(Modifier.weight(1f)) {
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
                        },
                    )
                }

                "NEW", "FOR_YOU" -> {
                    val marqueeItems = remember(albums, audiusTracks) {
                        buildList {
                            albums.filter { it.image.isNotBlank() }.take(4).forEach { add(it) }
                            audiusTracks.filter { it.image.isNotBlank() }.take(3).forEach { add(it) }
                        }.distinctBy { it.id }
                    }
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(gridCols),
                        contentPadding = PaddingValues(pad),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        // L1 Marquee Proscenium Hero (1:1 with ChoraMarquee.tsx)
                        if (marqueeItems.isNotEmpty() && search.isBlank()) {
                            item(span = { GridItemSpan(gridCols) }) {
                                ChoraMarqueeHero(
                                    items = marqueeItems,
                                    compact = isCompact,
                                    onPlay = onPlayAlbum,
                                    onOpen = onSelectAlbum,
                                )
                            }
                        }

                        // Tonight's Sky (Night) OR Today's Selections Panes (Day) — 1:1 with ChoraSkyBand.tsx
                        if (search.isBlank()) {
                            item(span = { GridItemSpan(gridCols) }) {
                                if (isNight) {
                                    ChoraTonightSkyBand(
                                        albums = albums,
                                        audiusTracks = audiusTracks,
                                        onSelect = onSelectAlbum,
                                    )
                                } else {
                                    ChoraDaySelectionsStrip(
                                        albums = albums.take(4),
                                        onSelect = onSelectAlbum,
                                    )
                                }
                            }
                        }

                        // World Cup 2026 Anthems Card (mirrors WcAnthemPlaylist in MusicView.tsx)
                        if (activeTab == "NEW" && search.isBlank()) {
                            item(span = { GridItemSpan(gridCols) }) {
                                ChoraWorldCupAnthemsCard(player = player)
                            }
                        }

                        item(span = { GridItemSpan(gridCols) }) {
                            Text(
                                if (activeTab == "FOR_YOU") "FOR YOU · CHORA & AUDIUS (${filtered.size})"
                                else "RELEASES & DISCOVERY (${filtered.size})",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Black,
                                letterSpacing = 1.8.sp,
                                color = Color.White.copy(0.6f),
                                modifier = Modifier.padding(top = 4.dp),
                            )
                        }

                        items(filtered, key = { it.id }) { album ->
                            ChoraReleaseCard(
                                album = album,
                                rowLayout = gridCols == 1,
                                onClick = { onSelectAlbum(album) },
                            )
                        }
                    }
                }

                "RADIO" -> {
                    val stations = remember {
                        listOf(
                            Triple("Chora Ambient Flow", "Deep meditative electronic & ethereal soundscapes", "https://plajah.com/audio/anthems/usa.mp3"),
                            Triple("Night Sky Celestial", "Curated celestial orchestrations & nocturnal downtempo", "https://plajah.com/audio/anthems/france.mp3"),
                            Triple("Plajah Afrobeat Club", "High energy afro rhythms & global syncopations", "https://plajah.com/audio/anthems/ghana.mp3"),
                            Triple("Tokyo Synthwave 2088", "Futuristic cyberpunk synth & dark electro drive", "https://plajah.com/audio/anthems/japan.mp3"),
                        )
                    }
                    LazyColumn(
                        contentPadding = PaddingValues(pad),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        item {
                            Text(
                                "PLAJAH LIVE RADIO STATIONS",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Black,
                                letterSpacing = 1.8.sp,
                                color = ChoraCyan,
                            )
                        }
                        items(stations) { (title, subtitle, streamUrl) ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(14.dp))
                                    .background(Color.White.copy(0.05f))
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
                                    .padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(42.dp)
                                        .clip(CircleShape)
                                        .background(Spatial),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Icon(Icons.Rounded.Radio, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
                                }
                                Column(Modifier.weight(1f)) {
                                    Text(title, fontSize = 13.sp, fontWeight = FontWeight.Black, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(subtitle, fontSize = 11.sp, color = Color.White.copy(0.55f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                                }
                                Icon(Icons.Rounded.PlayArrow, contentDescription = "Play", tint = ChoraOrange)
                            }
                        }
                    }
                }

                "ARTISTS", "GENRES" -> {
                    val groups = filtered.groupBy {
                        if (activeTab == "ARTISTS") it.creator.ifBlank { "Plajah Artist" }
                        else it.genre.ifBlank { "Uncategorized" }
                    }
                    LazyColumn(
                        contentPadding = PaddingValues(pad),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        groups.forEach { (name, releases) ->
                            item(key = name) {
                                Column {
                                    Text(name.uppercase(), fontSize = 13.sp, fontWeight = FontWeight.Black, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Row(
                                        Modifier
                                            .horizontalScroll(rememberScrollState())
                                            .padding(top = 8.dp),
                                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                                    ) {
                                        releases.forEach { album ->
                                            Column(
                                                Modifier
                                                    .width(126.dp)
                                                    .clickable { onSelectAlbum(album) },
                                            ) {
                                                PlatformArt(album.image, album.title, Modifier.clip(RoundedCornerShape(12.dp)))
                                                Text(
                                                    album.title.uppercase(),
                                                    Modifier.padding(top = 6.dp),
                                                    fontSize = 10.sp,
                                                    fontWeight = FontWeight.Bold,
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
                }

                else -> {
                    val tabItems = remember(filtered, activeTab) {
                        when (activeTab) {
                            "PODCASTS" -> filtered.filter { it.subType.equals("PODCAST", true) || it.genre.contains("podcast", true) }.ifEmpty { filtered }
                            "AUDIO_BOOKS" -> filtered.filter { it.kind == "book" || it.genre.contains("book", true) }.ifEmpty { filtered }
                            "MIXES" -> filtered.sortedByDescending { it.playCount }
                            else -> filtered
                        }
                    }
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(gridCols),
                        contentPadding = PaddingValues(pad),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        if (activeTab == "VAULT" || activeTab == "MY_LIBRARY" || activeTab == "PLAYLISTS") {
                            item(span = { GridItemSpan(gridCols) }) {
                                Surface(
                                    shape = RoundedCornerShape(14.dp),
                                    color = Color.White.copy(0.05f),
                                    border = BorderStroke(1.dp, Color.White.copy(0.1f)),
                                ) {
                                    Row(
                                        Modifier
                                            .fillMaxWidth()
                                            .padding(12.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                    ) {
                                        Column(Modifier.weight(1f)) {
                                            Text(
                                                when (activeTab) {
                                                    "VAULT" -> "THE CHORA VAULT"
                                                    "MY_LIBRARY" -> "PERSONAL LOCKER & LIKES"
                                                    else -> "PLAYLISTS & CURATIONS"
                                                },
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.Black,
                                                color = ChoraOrange,
                                            )
                                            Text(
                                                "Browse public catalog natively or open Classic for account-synced libraries.",
                                                fontSize = 11.sp,
                                                color = Color.White.copy(0.65f),
                                            )
                                        }
                                        TextButton(onClick = { onOpenPlatform("https://plajah.com/?view=music") }) {
                                            Text("Classic ↗", fontSize = 10.sp, color = ChoraCyan, fontWeight = FontWeight.Black)
                                        }
                                    }
                                }
                            }
                        }
                        items(tabItems, key = { it.id }) { album ->
                            ChoraReleaseCard(
                                album = album,
                                rowLayout = gridCols == 1,
                                onClick = { onSelectAlbum(album) },
                            )
                        }
                    }
                }
            }
        }
    }
}

/** L1 Proscenium Marquee Hero — 1:1 port of components/chora/ChoraMarquee.tsx. */
@Composable
private fun ChoraMarqueeHero(
    items: List<PlatformItem>,
    compact: Boolean,
    onPlay: (PlatformItem) -> Unit,
    onOpen: (PlatformItem) -> Unit,
) {
    var index by remember { mutableIntStateOf(0) }
    LaunchedEffect(items.size) {
        if (items.size < 2) return@LaunchedEffect
        while (true) {
            delay(20_000)
            index = (index + 1) % items.size
        }
    }
    val cur = items[index.coerceIn(0, items.lastIndex)]
    val nextThree = remember(items, index) {
        (1..3).mapNotNull { k -> items.getOrNull((index + k) % items.size) }
            .filter { it.id != cur.id }
            .distinctBy { it.id }
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(if (compact) 210.dp else 245.dp)
                .clip(RoundedCornerShape(20.dp))
                .background(Color(0xFF100A18))
                .border(1.dp, Color.White.copy(0.14f), RoundedCornerShape(20.dp))
                .clickable { onOpen(cur) },
        ) {
            if (cur.image.isNotBlank()) {
                PlatformArt(cur.image, cur.title, Modifier.fillMaxSize(), square = false)
            }
            // Proscenium dark scrim + warm stage light gradient
            Box(
                Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            listOf(Color(0x33FFB86B), Color(0x8806040A), Color(0xEE06040A)),
                        )
                    ),
            )

            // Marquee indicator dots (top right)
            if (items.size > 1) {
                Row(
                    Modifier
                        .align(Alignment.TopEnd)
                        .padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    items.forEachIndexed { i, _ ->
                        Box(
                            Modifier
                                .height(4.dp)
                                .width(if (i == index) 20.dp else 6.dp)
                                .clip(CircleShape)
                                .background(if (i == index) ChoraOrange else Color.White.copy(0.4f))
                                .clickable { index = i },
                        )
                    }
                }
            }

            Column(
                Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .padding(14.dp),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        if (cur.source == "AUDIUS") "Trending on Audius" else if (index == 0) "New pressing" else "Tonight on Chora",
                        fontSize = 11.sp,
                        fontStyle = FontStyle.Italic,
                        color = Color(0xFFFFB86B),
                        maxLines = 1,
                    )
                    Surface(
                        shape = CircleShape,
                        color = if (cur.source == "AUDIUS") Color(0xFF7E1BCC) else ChoraOrange,
                    ) {
                        Text(
                            if (cur.source == "AUDIUS") "Audius" else "Chora",
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Black,
                            color = if (cur.source == "AUDIUS") Color.White else Color(0xFF06040A),
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                        )
                    }
                }
                Text(
                    cur.title.uppercase(),
                    fontFamily = BrandDisplay,
                    fontSize = if (compact) 20.sp else 24.sp,
                    fontWeight = FontWeight.Black,
                    lineHeight = if (compact) 22.sp else 26.sp,
                    color = Color.White,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 4.dp),
                )
                Text(
                    buildString {
                        append(cur.creator)
                        if (cur.genre.isNotBlank()) append(" · ${cur.genre}")
                        if (cur.tracks.isNotEmpty()) append(" · ${cur.tracks.size} tracks")
                    },
                    fontSize = 11.sp,
                    color = Color.White.copy(0.75f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 2.dp),
                )
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = { onPlay(cur) },
                        shape = CircleShape,
                        colors = ButtonDefaults.buttonColors(containerColor = ChoraOrange, contentColor = Color(0xFF06040A)),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 0.dp),
                        modifier = Modifier.height(36.dp),
                    ) {
                        Icon(Icons.Rounded.PlayArrow, null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Play", fontSize = 12.sp, fontWeight = FontWeight.Black, maxLines = 1)
                    }
                    OutlinedButton(
                        onClick = { onOpen(cur) },
                        shape = CircleShape,
                        border = BorderStroke(1.dp, Color.White.copy(0.32f)),
                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 0.dp),
                        modifier = Modifier.height(36.dp),
                    ) {
                        Text(
                            if (cur.source == "AUDIUS") "Open track" else "Open album",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                            maxLines = 1,
                        )
                    }
                }
            }
        }

        // "Also in the marquee" compact switcher strip
        if (nextThree.isNotEmpty()) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                nextThree.forEach { item ->
                    Row(
                        Modifier
                            .width(175.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(Color.White.copy(0.05f))
                            .border(1.dp, Color.White.copy(0.09f), RoundedCornerShape(12.dp))
                            .clickable {
                                val target = items.indexOfFirst { it.id == item.id }
                                if (target >= 0) index = target
                            }
                            .padding(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        PlatformArt(item.image, item.title, Modifier.size(34.dp).clip(RoundedCornerShape(8.dp)), square = false)
                        Column(Modifier.weight(1f)) {
                            Text(item.title, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(item.creator, fontSize = 9.sp, color = Color.White.copy(0.55f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        }
    }
}

/** Tonight's Sky comet chart combining Chora (orange comets) + Audius (purple comets). */
@Composable
private fun ChoraTonightSkyBand(
    albums: List<PlatformItem>,
    audiusTracks: List<PlatformItem>,
    onSelect: (PlatformItem) -> Unit,
) {
    val comets = remember(albums, audiusTracks) {
        val chora = albums.filter { it.image.isNotBlank() }.take(4)
        val aud = audiusTracks.filter { it.image.isNotBlank() }.take(3)
        buildList {
            for (i in 0 until 4) {
                chora.getOrNull(i)?.let { add(it) }
                aud.getOrNull(i)?.let { add(it) }
            }
        }.take(6)
    }

    var seconds by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(Unit) {
        val start = withFrameNanos { it }
        while (true) withFrameNanos { seconds = (it - start) / 1_000_000_000f }
    }
    val sizes = listOf(64, 54, 48, 44, 38, 36)
    val lanes = listOf(0.32f, 0.16f, 0.56f, 0.28f, 0.66f, 0.46f)

    BoxWithConstraints(
        Modifier
            .fillMaxWidth()
            .height(175.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(Brush.verticalGradient(listOf(Color(0xFF14091E), Color(0xFF021E24))))
            .border(1.dp, Color.White.copy(0.12f), RoundedCornerShape(16.dp)),
    ) {
        Canvas(Modifier.fillMaxSize()) {
            listOf(0.12f to 0.24f, 0.34f to 0.68f, 0.55f to 0.18f, 0.71f to 0.52f, 0.88f to 0.3f, 0.22f to 0.84f, 0.64f to 0.86f).forEach { (x, y) ->
                drawCircle(Color.White.copy(0.42f), 1.dp.toPx(), Offset(size.width * x, size.height * y))
            }
        }
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("TONIGHT'S SKY", fontSize = 9.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 2.sp, color = Color(0xFFD0BCFF))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Box(Modifier.size(6.dp).clip(CircleShape).background(ChoraOrange))
                    Text("Chora", fontSize = 8.sp, color = Color.White.copy(0.7f))
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Box(Modifier.size(6.dp).clip(CircleShape).background(Color(0xFFA855F7)))
                    Text("Audius", fontSize = 8.sp, color = Color.White.copy(0.7f))
                }
            }
        }
        comets.forEachIndexed { index, item ->
            val period = 32f + (index % 3) * 4
            val x = ((seconds + index * 5.7f + 2f) % period) / period * (maxWidth.value + 200) - 90
            val ringColor = if (item.source == "AUDIUS") Color(0xFFA855F7) else ChoraOrange
            Box(
                Modifier
                    .offset(x.dp, (175 * lanes[index]).dp)
                    .size(sizes[index].dp)
                    .clip(CircleShape)
                    .border(1.5.dp, ringColor.copy(0.75f), CircleShape)
                    .clickable { onSelect(item) },
            ) {
                PlatformArt(item.image, item.title, Modifier.fillMaxSize(), square = false)
            }
        }
    }
}

/** Day Mode ("The Listening Room") horizontal panes — mirrors ChoraSkyBand Day mode. */
@Composable
private fun ChoraDaySelectionsStrip(albums: List<PlatformItem>, onSelect: (PlatformItem) -> Unit) {
    if (albums.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("TODAY'S SELECTIONS", fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 1.8.sp, color = Color(0xFFFFB86B))
        Row(
            Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            albums.forEachIndexed { i, album ->
                Box(
                    Modifier
                        .width(150.dp)
                        .height(145.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .border(1.dp, Color.White.copy(0.12f), RoundedCornerShape(14.dp))
                        .clickable { onSelect(album) },
                ) {
                    PlatformArt(album.image, album.title, Modifier.fillMaxSize(), square = false)
                    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(0.84f)))))
                    Surface(
                        shape = CircleShape,
                        color = Color.Black.copy(0.55f),
                        modifier = Modifier.align(Alignment.TopStart).padding(8.dp),
                    ) {
                        Text(
                            if (i == 0) "NEW PRESSING" else "RECENT RELEASE",
                            fontSize = 7.sp,
                            fontWeight = FontWeight.Black,
                            color = Color.White,
                            modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                        )
                    }
                    Column(Modifier.align(Alignment.BottomStart).padding(10.dp)) {
                        Text(album.title.uppercase(), fontSize = 11.sp, fontWeight = FontWeight.Black, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(album.creator.uppercase(), fontSize = 9.sp, color = Color.White.copy(0.68f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}

/** World Cup 2026 Anthems expandable playlist card (mirrors WcAnthemPlaylist in MusicView.tsx). */
@Composable
private fun ChoraWorldCupAnthemsCard(player: Player?) {
    var expanded by remember { mutableStateOf(false) }
    val anthems = remember {
        listOf(
            Triple("🇺🇸", "United States", "https://plajah.com/audio/anthems/usa.mp3"),
            Triple("🇫🇷", "France", "https://plajah.com/audio/anthems/france.mp3"),
            Triple("🇧🇷", "Brazil", "https://plajah.com/audio/anthems/brazil.mp3"),
            Triple("🇯🇵", "Japan", "https://plajah.com/audio/anthems/japan.mp3"),
            Triple("🇬🇭", "Ghana", "https://plajah.com/audio/anthems/ghana.mp3"),
            Triple("🇲🇽", "Mexico", "https://plajah.com/audio/anthems/mexico.mp3"),
        )
    }

    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(Brush.linearGradient(listOf(Color(0xFF001A35), Color(0xFF000D1A))))
            .border(1.dp, ChoraOrange.copy(0.28f), RoundedCornerShape(18.dp)),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .clickable { expanded = !expanded }
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text("🌍", fontSize = 24.sp)
            Column(Modifier.weight(1f)) {
                Text("PLAJAH OFFICIAL · WORLD CUP 2026", fontSize = 8.sp, fontWeight = FontWeight.Black, letterSpacing = 1.4.sp, color = ChoraOrange)
                Text("National Anthems of the World Cup", fontSize = 13.sp, fontWeight = FontWeight.Black, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Icon(
                if (expanded) Icons.Rounded.ExpandLess else Icons.Rounded.ExpandMore,
                contentDescription = null,
                tint = Color.White.copy(0.65f),
            )
        }
        if (expanded) {
            HorizontalDivider(color = Color.White.copy(0.08f))
            anthems.forEach { (flag, country, url) ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clickable {
                            if (player != null) {
                                player.setMediaItem(
                                    MediaItem.Builder()
                                        .setUri(url)
                                        .setMediaId("anthem:$country")
                                        .setMediaMetadata(MediaMetadata.Builder().setTitle("$country Anthem").setArtist("World Cup 2026").build())
                                        .build()
                                )
                                player.prepare()
                                player.play()
                            }
                        }
                        .padding(horizontal = 14.dp, vertical = 9.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text(flag, fontSize = 16.sp)
                    Text(country, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White, modifier = Modifier.weight(1f))
                    Icon(Icons.Rounded.PlayArrow, null, tint = ChoraOrange, modifier = Modifier.size(18.dp))
                }
            }
        }
    }
}

@Composable
private fun ChoraReleaseCard(
    album: PlatformItem,
    rowLayout: Boolean,
    onClick: () -> Unit,
) {
    if (rowLayout) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(Color.White.copy(0.04f))
                .border(1.dp, Color.White.copy(0.07f), RoundedCornerShape(14.dp))
                .clickable(onClick = onClick)
                .padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            PlatformArt(album.image, album.title, Modifier.size(60.dp).clip(RoundedCornerShape(10.dp)), square = false)
            Column(Modifier.weight(1f)) {
                Text(album.title.uppercase(), fontSize = 12.sp, fontWeight = FontWeight.Black, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(album.creator.uppercase(), fontSize = 10.sp, fontWeight = FontWeight.Medium, color = Color.White.copy(0.6f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    "${if (album.source == "AUDIUS") "AUDIUS" else "${album.tracks.size} TRACKS"}${if (album.genre.isNotBlank()) " · ${album.genre}" else ""}",
                    fontSize = 8.5.sp,
                    color = if (album.source == "AUDIUS") Color(0xFFC56BFF) else ChoraCyan,
                    fontWeight = FontWeight.ExtraBold,
                    maxLines = 1,
                )
            }
            Icon(Icons.Rounded.ChevronRight, null, tint = Color.White.copy(0.4f))
        }
    } else {
        Column(Modifier.clickable(onClick = onClick)) {
            Box {
                PlatformArt(album.image, album.title, Modifier.clip(RoundedCornerShape(14.dp)))
                if (album.source == "AUDIUS") {
                    Surface(
                        shape = CircleShape,
                        color = Color(0xDD7E1BCC),
                        modifier = Modifier.align(Alignment.TopEnd).padding(6.dp),
                    ) {
                        Text("AUDIUS", fontSize = 7.sp, fontWeight = FontWeight.Black, color = Color.White, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp))
                    }
                }
            }
            Text(
                album.title.uppercase(),
                Modifier.padding(top = 7.dp),
                fontSize = 11.5.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 0.4.sp,
                color = Color.White,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                album.creator.uppercase(),
                Modifier.padding(top = 2.dp),
                fontSize = 9.5.sp,
                fontWeight = FontWeight.Medium,
                color = Color.White.copy(0.55f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** Z Fold / Pixel Fold Unfolded Companion Console */
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
    onToggleCast: () -> Unit,
) {
    val activeAlbum = albums.firstOrNull { it.title.equals(currentTrackTitle, ignoreCase = true) } ?: albums.firstOrNull()
    var stageMode by remember { mutableStateOf(ChoraStageMode.ART) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text("NOW SPINNING", fontSize = 10.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.8.sp, color = ChoraOrange)
                Text("FOLDABLE CONSOLE", fontSize = 8.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp, color = Color.White.copy(0.45f))
            }
            Surface(shape = CircleShape, color = Color.White.copy(0.08f), border = BorderStroke(1.dp, ChoraCyan.copy(0.3f))) {
                Text("HI-RES 24/48", fontSize = 8.sp, fontWeight = FontWeight.Black, color = ChoraCyan, modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp))
            }
        }
        Spacer(Modifier.height(10.dp))
        ChoraStagePillBar(activeMode = stageMode, onSelectMode = { stageMode = it })
        Spacer(Modifier.height(10.dp))
        Box(
            modifier = Modifier.size(180.dp).clip(RoundedCornerShape(16.dp)),
            contentAlignment = Alignment.Center,
        ) {
            when (stageMode) {
                ChoraStageMode.ART -> ChoraVinylArtView(album = activeAlbum, isPlaying = isPlaying, modifier = Modifier.size(180.dp))
                ChoraStageMode.SLIDESHOW -> ChoraSlideshowView(
                    images = listOfNotNull(activeAlbum?.image?.takeIf { it.isNotBlank() }),
                    albumTitle = activeAlbum?.title ?: "Plajah Chora",
                    artistName = activeAlbum?.creator ?: "Chora",
                    isPlaying = isPlaying,
                    modifier = Modifier.fillMaxSize(),
                )
                ChoraStageMode.FX_STAGE -> ChoraFxStageView(isPlaying = isPlaying, modifier = Modifier.fillMaxSize())
                ChoraStageMode.ORRERY -> if (activeAlbum != null) ChoraOrrery(activeAlbum, 0, {}, Modifier.fillMaxSize())
            }
        }
        Spacer(Modifier.height(12.dp))
        Text(
            currentTrackTitle.ifBlank { activeAlbum?.title ?: "Plajah Chora" },
            fontFamily = BrandDisplay,
            fontSize = 16.sp,
            fontWeight = FontWeight.Black,
            color = Color.White,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            currentArtist.ifBlank { activeAlbum?.creator ?: "Celestial Registry" },
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White.copy(0.55f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(10.dp))
        val progress = if (duration > 0L) (position.toFloat() / duration.toFloat()).coerceIn(0f, 1f) else 0f
        Slider(
            value = progress,
            onValueChange = { frac -> if (player != null && duration > 0L) player.seekTo((frac * duration).toLong()) },
            colors = SliderDefaults.colors(thumbColor = ChoraOrange, activeTrackColor = ChoraOrange, inactiveTrackColor = Color.White.copy(0.12f)),
            modifier = Modifier.fillMaxWidth().height(18.dp),
        )
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(formatClock(position), fontSize = 10.sp, color = Color.White.copy(0.45f))
            Text(formatClock(duration), fontSize = 10.sp, color = Color.White.copy(0.45f))
        }
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onToggleCast) {
                Icon(if (isCasting) Icons.Rounded.CastConnected else Icons.Rounded.Cast, "Cast", tint = if (isCasting) ChoraCyan else Color.White.copy(0.55f))
            }
            IconButton(onClick = { player?.seekToPreviousMediaItem() }) {
                Icon(Icons.Rounded.SkipPrevious, "Prev", tint = Color.White, modifier = Modifier.size(28.dp))
            }
            Box(
                Modifier.size(48.dp).clip(CircleShape).background(Spatial).clickable {
                    if (player != null) { if (player.isPlaying) player.pause() else player.play() }
                },
                contentAlignment = Alignment.Center,
            ) {
                Icon(if (isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, "Play/Pause", tint = Color.White, modifier = Modifier.size(26.dp))
            }
            IconButton(onClick = { player?.seekToNextMediaItem() }) {
                Icon(Icons.Rounded.SkipNext, "Next", tint = Color.White, modifier = Modifier.size(28.dp))
            }
        }
        Spacer(Modifier.height(10.dp))
        Text("UP NEXT IN REGISTRY", fontSize = 9.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.4.sp, color = Color.White.copy(0.5f), modifier = Modifier.align(Alignment.Start))
        Spacer(Modifier.height(6.dp))
        LazyColumn(Modifier.fillMaxWidth().weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(albums.take(10), key = { it.id }) { item ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color.White.copy(0.04f))
                        .clickable { onSelectAlbum(item) }
                        .padding(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    PlatformArt(item.image, item.title, Modifier.size(34.dp).clip(RoundedCornerShape(6.dp)), square = false)
                    Column(Modifier.weight(1f)) {
                        Text(item.title, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(item.creator, fontSize = 9.sp, color = Color.White.copy(0.55f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Text("${item.tracks.size} trk", fontSize = 9.sp, color = ChoraOrange, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

/** Flex Tabletop mode for Z Fold / Pixel Fold / Z Flip half-folded postures */
@Composable
fun ChoraFlexScreen(
    albums: List<PlatformItem>,
    audiusTracks: List<PlatformItem>,
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
    onToggleCast: () -> Unit,
) {
    val activeAlbum = albums.firstOrNull { it.title.equals(currentTrackTitle, ignoreCase = true) } ?: albums.firstOrNull()
    var flexStageMode by remember { mutableStateOf(ChoraStageMode.ORRERY) }

    Column(Modifier.fillMaxSize()) {
        Box(
            Modifier
                .weight(1.1f)
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color(0x990F0619), Color(0x6604030A)))),
            contentAlignment = Alignment.Center,
        ) {
            when (flexStageMode) {
                ChoraStageMode.ORRERY -> ChoraTonightSkyBand(albums, audiusTracks, onSelectAlbum)
                ChoraStageMode.ART -> ChoraVinylArtView(album = activeAlbum, isPlaying = isPlaying, modifier = Modifier.size(190.dp))
                ChoraStageMode.SLIDESHOW -> ChoraSlideshowView(
                    images = listOfNotNull(activeAlbum?.image?.takeIf { it.isNotBlank() }),
                    albumTitle = activeAlbum?.title ?: "Plajah Chora",
                    artistName = activeAlbum?.creator ?: "Live Session",
                    isPlaying = isPlaying,
                    modifier = Modifier.fillMaxSize().padding(14.dp),
                )
                ChoraStageMode.FX_STAGE -> ChoraFxStageView(isPlaying = isPlaying, modifier = Modifier.fillMaxSize().padding(14.dp))
            }
            Box(Modifier.align(Alignment.TopCenter).padding(top = 8.dp)) {
                ChoraStagePillBar(activeMode = flexStageMode, onSelectMode = { flexStageMode = it })
            }
        }

        Box(
            Modifier
                .fillMaxWidth()
                .height(3.dp)
                .background(Brush.horizontalGradient(listOf(Color.Transparent, ChoraOrange, ChoraCyan, Color.Transparent))),
        )

        Column(
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .background(Color(0xEE080614))
                .padding(14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("FLEX TABLETOP CONSOLE", fontSize = 8.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.6.sp, color = ChoraOrange)
                Text(currentTrackTitle.ifBlank { "Plajah Chora" }, fontSize = 15.sp, fontWeight = FontWeight.Black, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(currentArtist.ifBlank { "Live Audio Session" }, fontSize = 11.sp, color = Color.White.copy(0.6f), maxLines = 1)
            }

            Slider(
                value = if (duration > 0L) (position.toFloat() / duration.toFloat()).coerceIn(0f, 1f) else 0f,
                onValueChange = { frac -> if (player != null && duration > 0L) player.seekTo((frac * duration).toLong()) },
                colors = SliderDefaults.colors(thumbColor = ChoraOrange, activeTrackColor = ChoraOrange, inactiveTrackColor = Color.White.copy(0.14f)),
                modifier = Modifier.fillMaxWidth().height(18.dp),
            )

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onToggleCast) {
                    Icon(if (isCasting) Icons.Rounded.CastConnected else Icons.Rounded.Cast, "Cast", tint = if (isCasting) ChoraCyan else Color.White.copy(0.6f))
                }
                IconButton(onClick = { player?.seekToPreviousMediaItem() }) {
                    Icon(Icons.Rounded.SkipPrevious, "Prev", tint = Color.White, modifier = Modifier.size(28.dp))
                }
                Box(
                    Modifier.size(54.dp).clip(CircleShape).background(Spatial).clickable {
                        if (player != null) { if (player.isPlaying) player.pause() else player.play() }
                    },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(if (isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, "Play/Pause", tint = Color.White, modifier = Modifier.size(30.dp))
                }
                IconButton(onClick = { player?.seekToNextMediaItem() }) {
                    Icon(Icons.Rounded.SkipNext, "Next", tint = Color.White, modifier = Modifier.size(28.dp))
                }
            }

            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                tabs.take(8).forEach { (id, label) ->
                    val active = activeTab == id
                    Box(
                        Modifier
                            .height(28.dp)
                            .clip(CircleShape)
                            .background(if (active) Spatial else Brush.linearGradient(listOf(Color.White.copy(0.08f), Color.White.copy(0.08f))))
                            .clickable { onSelectTab(id) }
                            .padding(horizontal = 10.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(label.uppercase(), fontSize = 8.sp, fontWeight = FontWeight.Black, color = Color.White, maxLines = 1)
                    }
                }
            }
        }
    }
}
