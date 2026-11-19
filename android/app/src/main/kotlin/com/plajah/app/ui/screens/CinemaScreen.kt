package com.plajah.app.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.*
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

/**
 * 1-for-1 Native Jetpack Compose rebuild of Plajah Cinema / Taleo (MoviesTVView.tsx).
 * - Sticky Taleo tab chip rail: Home, Halloween Vault, Movies, TV, Curator, Museum, Universe, Library
 * - Full-bleed Cinema Hero Banner with rating pill, Watch Now & Watchlist toggle
 * - 2:3 Poster grid + native Media3 playback detail sheet + foldable dual-pane support
 */
@Composable
fun CinemaScreen(
    onOpenPlatform: (String) -> Unit,
) {
    val foldable = rememberFoldableInfo()
    val pad = foldable.horizontalPadding

    var titles by remember { mutableStateOf<List<PlatformItem>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableIntStateOf(0) }
    var activeTab by rememberSaveable { mutableStateOf("HOME") }
    var search by remember { mutableStateOf("") }
    var selectedId by rememberSaveable { mutableStateOf<String?>(null) }
    var watchlist by remember { mutableStateOf(setOf<String>()) }
    var playingFullscreen by remember { mutableStateOf(false) }

    LaunchedEffect(attempt) {
        loading = true
        error = null
        try {
            titles = PlatformCatalog.load("cinema")
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = e.message
        } finally {
            loading = false
        }
    }

    val tabs = remember {
        listOf(
            "HOME" to "Home",
            "HALLOWEEN" to "Halloween Vault",
            "MOVIES" to "Movies",
            "TV" to "TV Series",
            "CURATOR" to "Curator",
            "MUSEUM" to "Film Museum",
            "UNIVERSE" to "Universe",
            "LIBRARY" to "Watchlist",
        )
    }

    val filtered = remember(titles, activeTab, search, watchlist) {
        val base = when (activeTab) {
            "HALLOWEEN" -> titles.filter {
                it.genre.contains("horror", true) || it.title.contains("halloween", true) || it.title.contains("raven", true)
            }.ifEmpty { titles }
            "MOVIES" -> titles.filter { it.kind == "movie" || it.genre.contains("movie", true) || it.genre.contains("film", true) }.ifEmpty { titles }
            "TV" -> titles.filter { it.genre.contains("tv", true) || it.genre.contains("series", true) }.ifEmpty { titles }
            "LIBRARY" -> titles.filter { watchlist.contains(it.id) }
            else -> titles
        }
        if (search.isBlank()) base
        else base.filter {
            it.title.contains(search, true) || it.creator.contains(search, true) || it.genre.contains(search, true)
        }
    }

    val selected = titles.firstOrNull { it.id == selectedId }

    BackHandler(playingFullscreen || selectedId != null) {
        if (playingFullscreen) playingFullscreen = false
        else selectedId = null
    }

    if (playingFullscreen && selected != null) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            NativeVideoSurface(
                streamUrl = selected.playableVideoUrl,
                posterUrl = selected.resolvedThumb,
                title = selected.title,
                isFullscreen = true,
                onToggleFullscreen = { playingFullscreen = false },
                modifier = Modifier.fillMaxSize(),
            )
        }
        return
    }

    if (selected != null && !foldable.supportsDualPane) {
        CinemaDetailPane(
            item = selected,
            inWatchlist = watchlist.contains(selected.id),
            onToggleWatchlist = {
                watchlist = if (watchlist.contains(selected.id)) watchlist - selected.id else watchlist + selected.id
            },
            onBack = { selectedId = null },
            onFullscreen = { playingFullscreen = true },
            onOpenClassic = { onOpenPlatform(selected.platformUrl) },
        )
        return
    }

    val catalogPane: @Composable () -> Unit = {
        Column(
            Modifier
                .fillMaxSize()
                .background(Color(0xFF07060C)),
        ) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = pad, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        "PLAJAH CINEMA",
                        fontFamily = BrandDisplay,
                        fontSize = if (foldable.isUltraCompact) 17.sp else 20.sp,
                        fontWeight = FontWeight.Black,
                        letterSpacing = 1.sp,
                        color = Color.White,
                    )
                    Text(
                        "TALEO · FILMS, SERIES & ARCHIVE VAULT",
                        fontSize = 8.5.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.4.sp,
                        color = PlajahBrand.Lilac.copy(0.75f),
                        maxLines = 1,
                    )
                }
                Surface(
                    shape = CircleShape,
                    color = Color.White.copy(0.07f),
                    modifier = Modifier.clickable { onOpenPlatform("https://plajah.com/?view=taleo") },
                ) {
                    Text("FULL VAULT ↗", fontSize = 8.5.sp, fontWeight = FontWeight.Black, color = PlajahBrand.Orange, modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp))
                }
            }

            // Taleo Chip Rail
            Row(
                Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = pad, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                tabs.forEach { (id, label) ->
                    val active = activeTab == id
                    Box(
                        Modifier
                            .height(32.dp)
                            .clip(CircleShape)
                            .background(
                                if (active) Brush.linearGradient(listOf(PlajahBrand.Purple, PlajahBrand.Magenta))
                                else Brush.linearGradient(listOf(Color.White.copy(0.06f), Color.White.copy(0.06f)))
                            )
                            .clickable { activeTab = id }
                            .padding(horizontal = 12.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(label.uppercase(), fontSize = 9.sp, fontWeight = FontWeight.Black, color = Color.White.copy(if (active) 1f else 0.65f), maxLines = 1, softWrap = false)
                    }
                }
            }

            OutlinedTextField(
                value = search,
                onValueChange = { search = it },
                placeholder = { Text("Search movies, directors, series…", fontSize = 12.sp, color = Color.White.copy(0.4f), maxLines = 1) },
                leadingIcon = { Icon(Icons.Rounded.Search, null, Modifier.size(16.dp)) },
                singleLine = true,
                shape = CircleShape,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = pad, vertical = 4.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = PlajahBrand.Lilac,
                    unfocusedBorderColor = Color.White.copy(0.12f),
                ),
            )

            if (loading) LinearProgressIndicator(Modifier.fillMaxWidth(), color = PlajahBrand.Lilac)
            error?.let {
                Row(Modifier.padding(horizontal = pad), verticalAlignment = Alignment.CenterVertically) {
                    Text(it, color = PlajahBrand.Orange, fontSize = 11.sp, modifier = Modifier.weight(1f))
                    TextButton(onClick = { attempt++ }) { Text("Retry") }
                }
            }

            val cols = if (foldable.supportsDualPane) 2 else foldable.posterGridColumns
            LazyVerticalGrid(
                columns = GridCells.Fixed(cols),
                contentPadding = PaddingValues(pad),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.weight(1f),
            ) {
                val hero = filtered.firstOrNull()
                if (hero != null && search.isBlank()) {
                    item(span = { GridItemSpan(cols) }) {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .height(if (foldable.isUltraCompact) 210.dp else 245.dp)
                                .clip(RoundedCornerShape(20.dp))
                                .background(Color(0xFF120C1F))
                                .border(1.dp, Color.White.copy(0.12f), RoundedCornerShape(20.dp))
                                .clickable { selectedId = hero.id },
                        ) {
                            PlatformArt(hero.resolvedThumb, hero.title, Modifier.fillMaxSize(), square = false)
                            Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(0.88f)))))
                            Column(Modifier.align(Alignment.BottomStart).padding(14.dp)) {
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Text("FEATURED PREMIERE", fontSize = 8.5.sp, fontWeight = FontWeight.Black, letterSpacing = 1.6.sp, color = PlajahBrand.Orange)
                                    if (hero.contentRating.isNotBlank()) {
                                        Surface(shape = RoundedCornerShape(4.dp), color = Color.Black.copy(0.7f), border = BorderStroke(1.dp, Color.White.copy(0.25f))) {
                                            Text(hero.contentRating.uppercase(), fontSize = 8.sp, fontWeight = FontWeight.Black, color = Color.White, modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp))
                                        }
                                    }
                                }
                                Text(hero.title.uppercase(), fontFamily = BrandDisplay, fontSize = 20.sp, fontWeight = FontWeight.Black, color = Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                if (hero.creator.isNotBlank()) {
                                    Text(hero.creator, fontSize = 11.sp, color = Color.White.copy(0.7f), maxLines = 1)
                                }
                                Spacer(Modifier.height(8.dp))
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Button(
                                        onClick = { selectedId = hero.id },
                                        shape = CircleShape,
                                        colors = ButtonDefaults.buttonColors(containerColor = PlajahBrand.Orange, contentColor = Color.Black),
                                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 0.dp),
                                        modifier = Modifier.height(34.dp),
                                    ) {
                                        Icon(Icons.Rounded.PlayArrow, null, Modifier.size(16.dp))
                                        Spacer(Modifier.width(4.dp))
                                        Text("WATCH", fontSize = 11.sp, fontWeight = FontWeight.Black)
                                    }
                                    val saved = watchlist.contains(hero.id)
                                    OutlinedButton(
                                        onClick = {
                                            watchlist = if (saved) watchlist - hero.id else watchlist + hero.id
                                        },
                                        shape = CircleShape,
                                        border = BorderStroke(1.dp, Color.White.copy(0.3f)),
                                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 0.dp),
                                        modifier = Modifier.height(34.dp),
                                    ) {
                                        Icon(if (saved) Icons.Rounded.Check else Icons.Rounded.Add, null, Modifier.size(15.dp), tint = Color.White)
                                        Spacer(Modifier.width(4.dp))
                                        Text(if (saved) "IN LIST" else "WATCHLIST", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color.White)
                                    }
                                }
                            }
                        }
                    }
                }

                if (activeTab == "LIBRARY" && filtered.isEmpty()) {
                    item(span = { GridItemSpan(cols) }) {
                        Text("Tap + Watchlist on any film to save it here.", color = Color.White.copy(0.55f), fontSize = 12.sp, modifier = Modifier.padding(vertical = 24.dp))
                    }
                }

                items(filtered, key = { it.id }) { film ->
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .clickable { selectedId = film.id },
                    ) {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .aspectRatio(2f / 3f)
                                .clip(RoundedCornerShape(14.dp))
                                .background(Color(0xFF151024))
                                .border(
                                    1.dp,
                                    if (film.id == selectedId) PlajahBrand.Orange else Color.White.copy(0.08f),
                                    RoundedCornerShape(14.dp),
                                ),
                        ) {
                            PlatformArt(film.resolvedThumb, film.title, Modifier.fillMaxSize(), square = false)
                            if (film.contentRating.isNotBlank()) {
                                Surface(
                                    shape = RoundedCornerShape(4.dp),
                                    color = Color.Black.copy(0.72f),
                                    modifier = Modifier.align(Alignment.TopEnd).padding(6.dp),
                                ) {
                                    Text(film.contentRating, fontSize = 8.sp, fontWeight = FontWeight.Black, color = Color.White, modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp))
                                }
                            }
                        }
                        Text(film.title, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 6.dp))
                        Text(film.genre.ifBlank { film.creator.ifBlank { "Cinema" } }, fontSize = 10.sp, color = Color.White.copy(0.55f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }

    if (foldable.supportsDualPane) {
        Row(Modifier.fillMaxSize()) {
            Box(Modifier.weight(0.54f).fillMaxHeight()) { catalogPane() }
            Box(Modifier.width(foldable.hingeWidthDp.coerceAtLeast(1.dp)).fillMaxHeight().background(Color.White.copy(0.12f)))
            Box(Modifier.weight(0.46f).fillMaxHeight().background(Color(0xFF0A0814))) {
                val preview = selected ?: filtered.firstOrNull()
                if (preview != null) {
                    CinemaDetailPane(
                        item = preview,
                        inWatchlist = watchlist.contains(preview.id),
                        onToggleWatchlist = {
                            watchlist = if (watchlist.contains(preview.id)) watchlist - preview.id else watchlist + preview.id
                        },
                        onBack = { selectedId = null },
                        onFullscreen = { selectedId = preview.id; playingFullscreen = true },
                        onOpenClassic = { onOpenPlatform(preview.platformUrl) },
                    )
                }
            }
        }
    } else {
        catalogPane()
    }
}

@Composable
private fun CinemaDetailPane(
    item: PlatformItem,
    inWatchlist: Boolean,
    onToggleWatchlist: () -> Unit,
    onBack: () -> Unit,
    onFullscreen: () -> Unit,
    onOpenClassic: () -> Unit,
) {
    LazyColumn(
        Modifier
            .fillMaxSize()
            .background(Color(0xFF07060C)),
    ) {
        item {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                IconButton(onClick = onBack, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.Rounded.ArrowBack, "Back", tint = Color.White)
                }
                Text(item.title, fontSize = 13.sp, fontWeight = FontWeight.Black, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                IconButton(onClick = onOpenClassic, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.Rounded.OpenInNew, "Open Cinema UX", tint = Color.White.copy(0.75f), modifier = Modifier.size(18.dp))
                }
            }
        }
        item {
            NativeVideoSurface(
                streamUrl = item.playableVideoUrl,
                posterUrl = item.resolvedThumb,
                title = item.title,
                onToggleFullscreen = onFullscreen,
                modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f),
            )
        }
        item {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(item.title.uppercase(), fontFamily = BrandDisplay, fontSize = 20.sp, fontWeight = FontWeight.Black, color = Color.White)
                Text(
                    listOf(item.creator, item.genre, item.contentRating).filter { it.isNotBlank() }.joinToString(" · "),
                    fontSize = 12.sp,
                    color = PlajahBrand.Lilac,
                    fontWeight = FontWeight.Bold,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = onFullscreen,
                        shape = CircleShape,
                        colors = ButtonDefaults.buttonColors(containerColor = PlajahBrand.Orange, contentColor = Color.Black),
                    ) {
                        Icon(Icons.Rounded.Fullscreen, null, Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Full Screen", fontWeight = FontWeight.Black, fontSize = 12.sp)
                    }
                    OutlinedButton(
                        onClick = onToggleWatchlist,
                        shape = CircleShape,
                        border = BorderStroke(1.dp, Color.White.copy(0.25f)),
                    ) {
                        Icon(if (inWatchlist) Icons.Rounded.Check else Icons.Rounded.Add, null, Modifier.size(16.dp), tint = Color.White)
                        Spacer(Modifier.width(4.dp))
                        Text(if (inWatchlist) "Saved" else "Watchlist", fontSize = 11.sp, color = Color.White)
                    }
                }
                if (item.description.isNotBlank()) {
                    Text(item.description, fontSize = 13.sp, lineHeight = 20.sp, color = Color.White.copy(0.75f))
                }
                OutlinedButton(
                    onClick = onOpenClassic,
                    shape = CircleShape,
                    border = BorderStroke(1.dp, PlajahBrand.Lilac.copy(0.35f)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Open Full Taleo Cinema Dossier & Watch Party ↗", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = PlajahBrand.Lilac)
                }
            }
        }
    }
}
