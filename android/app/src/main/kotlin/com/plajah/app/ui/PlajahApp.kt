package com.plajah.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteType
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.media3.common.Player
import com.plajah.app.data.PlatformItem
import com.plajah.app.ui.components.Eyebrow
import com.plajah.app.ui.foldable.rememberFoldableInfo
import com.plajah.app.ui.nav.Destination
import com.plajah.app.ui.nav.Destinations
import com.plajah.app.ui.screens.*
import com.plajah.app.ui.theme.PlajahBrand
import com.plajah.app.ui.theme.PlajahTheme

/**
 * The Plajah Native Jetpack Compose shell (behind the Native UI toggle).
 *
 * Houses the 6 full 1-for-1 native rebuilds:
 *   Chora (100% website parity), Reello, Cinema, Lorea, Elevate, Academia
 * plus Files and secondary Classic-bridged destinations.
 *
 * Adapts automatically across:
 *   - Narrow foldable outer cover screens (Samsung Z Fold cover, < 380dp): 5-item compact bottom bar + top Academia shortcut
 *   - Standard phones (380..599dp): 6-item sleek bottom bar with non-wrapping compact labels
 *   - Unfolded foldables & medium tablets (600..839dp): NavigationRail + dual-pane screen layouts
 *   - Large tablets & desktop windows (>= 840dp): NavigationDrawer + expanded multi-column layouts
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlajahApp(
    initialDestinationId: String = Destinations.Chora.id,
    initialAlbumId: String? = null,
    onOpenContent: (String) -> Unit,
    onExitToClassic: () -> Unit,
    dynamicTint: Boolean,
    onDynamicTintChange: (Boolean) -> Unit,
) {
    var currentId by rememberSaveable { mutableStateOf(initialDestinationId) }
    val current = Destinations.all.firstOrNull { it.id == currentId } ?: Destinations.Chora
    var settingsOpen by rememberSaveable { mutableStateOf(false) }
    var destinationsOpen by remember { mutableStateOf(false) }
    var selectedAlbum by remember { mutableStateOf<PlatformItem?>(null) }

    val foldable = rememberFoldableInfo()
    val widthDp = LocalConfiguration.current.screenWidthDp
    val ultraCompactBar = widthDp < 380 || foldable.isUltraCompact

    val navType = when {
        widthDp < 600 -> NavigationSuiteType.NavigationBar
        widthDp < 840 -> NavigationSuiteType.NavigationRail
        else -> NavigationSuiteType.NavigationDrawer
    }

    val navItems = when {
        navType != NavigationSuiteType.NavigationBar -> Destinations.all
        ultraCompactBar -> Destinations.primaryCompact
        else -> Destinations.primary
    }

    BackHandler(enabled = selectedAlbum != null || (current.id != Destinations.Chora.id && !settingsOpen && !destinationsOpen)) {
        if (selectedAlbum != null) selectedAlbum = null
        else currentId = Destinations.Chora.id
    }

    if (selectedAlbum != null) {
        ChoraAlbumScreen(
            album = selectedAlbum!!,
            onBack = { selectedAlbum = null },
            onOpenClassic = onOpenContent,
        )
        return
    }

    // Shared Media3 controller for persistent global Chora mini-player when away from Chora
    val sharedPlayer = rememberChoraPlayer()
    var globalPlaying by remember { mutableStateOf(false) }
    var globalTitle by remember { mutableStateOf("") }
    var globalArtist by remember { mutableStateOf("") }

    DisposableEffect(sharedPlayer) {
        if (sharedPlayer == null) return@DisposableEffect onDispose {}
        fun sync() {
            globalPlaying = sharedPlayer.isPlaying
            val meta = sharedPlayer.currentMediaItem?.mediaMetadata
            globalTitle = meta?.title?.toString().orEmpty()
            globalArtist = meta?.artist?.toString().orEmpty()
        }
        sync()
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) = sync()
            override fun onMediaItemTransition(mediaItem: androidx.media3.common.MediaItem?, reason: Int) = sync()
            override fun onMediaMetadataChanged(mediaMetadata: androidx.media3.common.MediaMetadata) = sync()
        }
        sharedPlayer.addListener(listener)
        onDispose { sharedPlayer.removeListener(listener) }
    }

    NavigationSuiteScaffold(
        layoutType = navType,
        navigationSuiteItems = {
            navItems.forEach { dest ->
                item(
                    selected = dest.id == current.id,
                    onClick = { currentId = dest.id },
                    icon = { Icon(dest.icon, contentDescription = dest.label, modifier = Modifier.size(20.dp)) },
                    label = {
                        Text(
                            dest.label,
                            fontSize = if (navType == NavigationSuiteType.NavigationBar) 9.sp else 12.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            softWrap = false,
                            overflow = TextOverflow.Ellipsis,
                        )
                    },
                )
            }
        },
    ) {
        Scaffold(
            containerColor = Color(0xFF04030A),
            topBar = {
                TopAppBar(
                    title = {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text(
                                "PLAJAH",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Black,
                                letterSpacing = 1.4.sp,
                                color = PlajahBrand.Orange,
                                maxLines = 1,
                            )
                            Text("·", color = Color.White.copy(0.35f), fontWeight = FontWeight.Bold)
                            Text(
                                current.label.uppercase(),
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Black,
                                color = Color.White,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            if (foldable.isFoldable && widthDp >= 420) {
                                Surface(
                                    shape = CircleShape,
                                    color = PlajahBrand.Cyan.copy(0.14f),
                                    border = BorderStroke(1.dp, PlajahBrand.Cyan.copy(0.4f)),
                                ) {
                                    Text(
                                        when {
                                            foldable.isFlexMode -> "FLEX"
                                            foldable.isInnerScreen -> "FOLD"
                                            else -> "COVER"
                                        },
                                        fontSize = 8.sp,
                                        fontWeight = FontWeight.Black,
                                        color = PlajahBrand.Cyan,
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                    )
                                }
                            }
                        }
                    },
                    actions = {
                        // On ultra-compact cover screens where Academia moves off the 5-item bottom bar,
                        // keep Academia 1 tap away right in the top bar.
                        if (navType == NavigationSuiteType.NavigationBar && ultraCompactBar) {
                            IconButton(onClick = { currentId = Destinations.Academia.id }) {
                                Icon(
                                    Destinations.Academia.icon,
                                    contentDescription = "Academia",
                                    tint = if (current.id == Destinations.Academia.id) PlajahBrand.Cyan else Color.White.copy(0.85f),
                                )
                            }
                        }
                        Box {
                            IconButton(onClick = { destinationsOpen = true }) {
                                Icon(Icons.Rounded.Apps, contentDescription = "All destinations", tint = Color.White)
                            }
                            DropdownMenu(
                                expanded = destinationsOpen,
                                onDismissRequest = { destinationsOpen = false },
                            ) {
                                Destinations.all.forEach { dest ->
                                    DropdownMenuItem(
                                        text = { Text(dest.label, fontWeight = if (dest.primary) FontWeight.Bold else FontWeight.Normal) },
                                        leadingIcon = { Icon(dest.icon, contentDescription = null) },
                                        onClick = {
                                            currentId = dest.id
                                            destinationsOpen = false
                                        },
                                    )
                                }
                            }
                        }
                        IconButton(onClick = { settingsOpen = true }) {
                            Icon(Icons.Rounded.Tune, contentDescription = "Native Settings", tint = Color.White)
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color(0xE605040C),
                        titleContentColor = Color.White,
                    ),
                )
            },
        ) { inner ->
            Box(Modifier.fillMaxSize().padding(inner)) {
                when (current.id) {
                    Destinations.Chora.id -> ChoraScreen(
                        initialAlbumId = initialAlbumId,
                        onOpenPlatform = onOpenContent,
                        onExit = onExitToClassic,
                        showTopShellExit = false,
                    )
                    Destinations.Reello.id -> ReelloScreen(onOpenPlatform = onOpenContent)
                    Destinations.Cinema.id -> CinemaScreen(onOpenPlatform = onOpenContent)
                    Destinations.Lorea.id -> LoreaScreen(onOpenPlatform = onOpenContent)
                    Destinations.Elevate.id -> ElevateScreen(onOpenPlatform = onOpenContent)
                    Destinations.Academia.id -> AcademiaScreen(onOpenPlatform = onOpenContent)
                    Destinations.Files.id -> FilesScreen(
                        onOpenWebFiles = { onOpenContent("https://plajah.com/?view=files") },
                    )
                    Destinations.Home.id -> NativeFrontRowHome(
                        onSelectDestination = { currentId = it.id },
                        onOpenPlatform = onOpenContent,
                    )
                    else -> PlaceholderScreen(current, onExitToClassic)
                }

                // Persistent docked Chora Mini-Player while exploring Reello, Cinema, Lorea, Elevate, or Academia
                if (current.id != Destinations.Chora.id && globalTitle.isNotBlank() && sharedPlayer != null) {
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = Color(0xF0120E22),
                        border = BorderStroke(1.dp, PlajahBrand.Orange.copy(0.45f)),
                        shadowElevation = 10.dp,
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .fillMaxWidth()
                            .padding(horizontal = 12.dp, vertical = 10.dp)
                            .clickable { currentId = Destinations.Chora.id },
                    ) {
                        Row(
                            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            Box(
                                Modifier.size(34.dp).clip(CircleShape).background(PlajahBrand.Orange.copy(0.2f)),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(Icons.Rounded.LibraryMusic, null, tint = PlajahBrand.Orange, modifier = Modifier.size(18.dp))
                            }
                            Column(Modifier.weight(1f)) {
                                Text(globalTitle, fontSize = 12.sp, fontWeight = FontWeight.Black, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(
                                    globalArtist.ifBlank { "Playing on Chora" },
                                    fontSize = 10.sp,
                                    color = Color.White.copy(0.65f),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            IconButton(
                                onClick = { if (sharedPlayer.isPlaying) sharedPlayer.pause() else sharedPlayer.play() },
                                modifier = Modifier.size(34.dp),
                            ) {
                                Icon(
                                    if (globalPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                                    contentDescription = "Play/Pause",
                                    tint = Color.White,
                                )
                            }
                            IconButton(
                                onClick = { sharedPlayer.seekToNextMediaItem() },
                                modifier = Modifier.size(34.dp),
                            ) {
                                Icon(Icons.Rounded.SkipNext, contentDescription = "Next", tint = Color.White)
                            }
                        }
                    }
                }
            }
        }
    }

    if (settingsOpen) {
        ModalBottomSheet(onDismissRequest = { settingsOpen = false }) {
            SettingsSheet(
                dynamicTint = dynamicTint,
                onDynamicTintChange = onDynamicTintChange,
                onSwitchToClassic = { settingsOpen = false; onExitToClassic() },
            )
        }
    }
}

@Composable
private fun NativeFrontRowHome(
    onSelectDestination: (Destination) -> Unit,
    onOpenPlatform: (String) -> Unit,
) {
    val foldable = rememberFoldableInfo()
    val accents = mapOf(
        Destinations.Chora.id to Pair(Color(0xFFFF6D00), "100% parity music, Audius & live radio"),
        Destinations.Reello.id to Pair(Color(0xFF00DAF3), "Discover videos & vertical Shorts"),
        Destinations.Cinema.id to Pair(Color(0xFFE11D48), "Taleo films, series & watchlist"),
        Destinations.Lorea.id to Pair(Color(0xFFF59E0B), "Classics, Plajah books & Vellum reader"),
        Destinations.Elevate.id to Pair(Color(0xFFA78BFA), "Multi-channel sanctuaries & Vellum notes"),
        Destinations.Academia.id to Pair(Color(0xFF06D6A0), "10 flagship schools & 12 live labs"),
    )

    LazyVerticalGrid(
        columns = GridCells.Fixed(foldable.squareGridColumns.coerceAtLeast(2)),
        modifier = Modifier.fillMaxSize().background(Color(0xFF05040C)),
        contentPadding = PaddingValues(start = foldable.horizontalPadding, end = foldable.horizontalPadding, top = 12.dp, bottom = 104.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("NATIVE JETPACK COMPOSE", fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 1.6.sp, color = PlajahBrand.Orange)
                Text("Plajah Front Row", fontSize = 22.sp, fontWeight = FontWeight.Black, color = Color.White)
                Text("All 6 core surfaces rebuilt natively with foldable & Media3 support.", fontSize = 12.sp, color = Color.White.copy(0.68f))
            }
        }
        items(Destinations.primary, key = { it.id }) { dest ->
            val (accent, desc) = accents[dest.id] ?: Pair(PlajahBrand.Cyan, "")
            Surface(
                shape = RoundedCornerShape(18.dp),
                color = Color(0xFF121022),
                border = BorderStroke(1.dp, accent.copy(0.35f)),
                modifier = Modifier.fillMaxWidth().clickable { onSelectDestination(dest) },
            ) {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .background(Brush.linearGradient(listOf(accent.copy(0.18f), Color.Transparent)))
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Box(
                        Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(accent.copy(0.22f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(dest.icon, null, tint = accent, modifier = Modifier.size(22.dp))
                    }
                    Text(dest.label, fontSize = 16.sp, fontWeight = FontWeight.Black, color = Color.White, maxLines = 1)
                    Text(desc, fontSize = 11.sp, lineHeight = 15.sp, color = Color.White.copy(0.72f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        item(span = { GridItemSpan(maxLineSpan) }) {
            OutlinedButton(
                onClick = { onOpenPlatform("https://plajah.com/?view=games") },
                border = BorderStroke(1.dp, Color.White.copy(0.18f)),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Rounded.SportsEsports, null, tint = PlajahBrand.Cyan)
                Spacer(Modifier.width(8.dp))
                Text("Open Plajah Games Hub (Web / TV) ↗", color = Color.White, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun SettingsSheet(
    dynamicTint: Boolean,
    onDynamicTintChange: (Boolean) -> Unit,
    onSwitchToClassic: () -> Unit,
) {
    Column(
        Modifier.fillMaxWidth().padding(24.dp).navigationBarsPadding(),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        Eyebrow("Appearance")

        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(Modifier.weight(1f)) {
                Text("Material You tint", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
                Text(
                    "Tint neutral surfaces from your wallpaper. Plajah's brand colours stay.",
                    style = MaterialTheme.typography.bodySmall,
                    color = PlajahTheme.colors.textSecondary,
                )
            }
            Switch(checked = dynamicTint, onCheckedChange = onDynamicTintChange)
        }

        Spacer(Modifier.height(4.dp))
        Eyebrow("Experience")
        Text(
            "You're running the Native Jetpack Compose shell (Chora, Reello, Cinema, Lorea, Elevate, Academia). " +
                "Switch back to Classic Web anytime.",
            style = MaterialTheme.typography.bodySmall,
            color = PlajahTheme.colors.textSecondary,
        )
        OutlinedButton(onClick = onSwitchToClassic, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Rounded.SwapHoriz, contentDescription = null)
            Spacer(Modifier.width(8.dp))
            Text("Switch to Classic (Web)")
        }
        Spacer(Modifier.height(8.dp))
    }
}
