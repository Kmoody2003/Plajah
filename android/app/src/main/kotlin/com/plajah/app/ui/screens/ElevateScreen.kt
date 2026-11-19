package com.plajah.app.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.plajah.app.data.ElevateChannel
import com.plajah.app.data.ElevateOrg
import com.plajah.app.data.PlatformCatalog
import com.plajah.app.ui.components.NativeVideoSurface
import com.plajah.app.ui.foldable.rememberFoldableInfo
import com.plajah.app.ui.theme.PlajahBrand
import kotlinx.coroutines.CancellationException

private val ElevateGold = Color(0xFFF59E0B)
private val ElevateRose = Color(0xFFE11D48)
private val ElevateInk = Color(0xFF0A0812)

private val ElevateCategories = listOf(
    "ALL" to "All Hubs",
    "CHURCH" to "Spiritual",
    "CULTURAL" to "Cultural",
    "NONPROFIT" to "Nonprofit",
    "RELIGIOUS" to "Interfaith",
)

private val ScriptureSamples = listOf(
    Triple("Psalm 23:1–4", "The Lord is my shepherd; I shall not want. He maketh me to lie down in green pastures: he leadeth me beside the still waters. He restoreth my soul.", "Shepherd's Song"),
    Triple("Isaiah 40:31", "But they that wait upon the Lord shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary.", "Renewal"),
    Triple("Micah 6:8", "What doth the Lord require of thee, but to do justly, and to love mercy, and to walk humbly with thy God?", "Justice & Mercy"),
)

/**
 * 1-for-1 Jetpack Compose rebuild of Plajah Elevate (mirrors PlajahElevate.tsx +
 * RelloChurchViewer.tsx + LeafPlayer.tsx + OrgOnAirPlayer.tsx).
 *
 * Key mobile fixes baked in natively:
 * - Multi-channel inline ExoPlayer NEVER auto-fullscreens (strictly user-triggered Expand button)
 * - Horizontal swipe left/right AND Prev/Next buttons AND visible horizontal Channel Chip Rail below video
 * - Always-reachable Play/Pause/Mute/Channel controls
 * - Foldable Z Fold / Pixel Fold dual-pane directory + live sanctuary hub
 */
@Composable
fun ElevateScreen(
    onOpenPlatform: (String) -> Unit,
) {
    val foldable = rememberFoldableInfo()
    var orgs by remember { mutableStateOf<List<ElevateOrg>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableIntStateOf(0) }

    var activeCategory by rememberSaveable { mutableStateOf("ALL") }
    var search by rememberSaveable { mutableStateOf("") }
    var selectedOrgId by rememberSaveable { mutableStateOf<String?>(null) }
    var fullscreenVideo by remember { mutableStateOf(false) }

    LaunchedEffect(attempt) {
        loading = true
        error = null
        try {
            orgs = PlatformCatalog.loadOrganizations()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = e.message ?: "Elevate hubs could not be loaded."
        }
        loading = false
    }

    val filtered = remember(orgs, activeCategory, search) {
        val q = search.trim().lowercase()
        orgs.filter { org ->
            val catOk = activeCategory == "ALL" || org.orgType.equals(activeCategory, ignoreCase = true)
            val searchOk = q.isEmpty() ||
                org.name.lowercase().contains(q) ||
                org.tagline.lowercase().contains(q) ||
                org.city.lowercase().contains(q) ||
                org.denomination.lowercase().contains(q)
            catOk && searchOk
        }
    }

    val liveOrgs = remember(orgs) {
        orgs.filter { org -> org.channels.any { it.isLive } || org.channels.isNotEmpty() }
    }

    val selectedOrg = remember(orgs, selectedOrgId) {
        orgs.firstOrNull { it.id == selectedOrgId }
    }

    BackHandler(enabled = fullscreenVideo || selectedOrg != null) {
        if (fullscreenVideo) fullscreenVideo = false
        else selectedOrgId = null
    }

    if (fullscreenVideo && selectedOrg != null) {
        ElevateFullscreenStage(
            org = selectedOrg,
            onExitFullscreen = { fullscreenVideo = false },
        )
        return
    }

    // Foldable / Tablet Dual-Pane: Directory on Left, Live Hub Player on Right
    if (foldable.supportsDualPane && selectedOrg != null) {
        Row(Modifier.fillMaxSize().background(ElevateInk)) {
            Box(Modifier.weight(0.46f).fillMaxHeight()) {
                ElevateDirectoryPane(
                    orgs = filtered,
                    liveOrgs = liveOrgs,
                    loading = loading,
                    error = error,
                    activeCategory = activeCategory,
                    onCategory = { activeCategory = it },
                    search = search,
                    onSearch = { search = it },
                    selectedId = selectedOrg.id,
                    onSelectOrg = { selectedOrgId = it.id },
                    onRetry = { attempt++ },
                    cols = 1,
                    horizontalPadding = foldable.horizontalPadding,
                )
            }
            Box(Modifier.width(1.dp).fillMaxHeight().background(Color.White.copy(0.08f)))
            Box(Modifier.weight(0.54f).fillMaxHeight()) {
                ElevateHubDetailPane(
                    org = selectedOrg,
                    showBackButton = true,
                    onBack = { selectedOrgId = null },
                    onOpenClassic = { onOpenPlatform(selectedOrg.platformUrl) },
                    onEnterFullscreen = { fullscreenVideo = true },
                )
            }
        }
        return
    }

    // Compact Phone: full-screen Hub Detail when an org is opened
    if (selectedOrg != null) {
        ElevateHubDetailPane(
            org = selectedOrg,
            showBackButton = true,
            onBack = { selectedOrgId = null },
            onOpenClassic = { onOpenPlatform(selectedOrg.platformUrl) },
            onEnterFullscreen = { fullscreenVideo = true },
        )
        return
    }

    ElevateDirectoryPane(
        orgs = filtered,
        liveOrgs = liveOrgs,
        loading = loading,
        error = error,
        activeCategory = activeCategory,
        onCategory = { activeCategory = it },
        search = search,
        onSearch = { search = it },
        selectedId = null,
        onSelectOrg = { selectedOrgId = it.id },
        onRetry = { attempt++ },
        cols = foldable.wideGridColumns,
        horizontalPadding = foldable.horizontalPadding,
    )
}

@Composable
private fun ElevateDirectoryPane(
    orgs: List<ElevateOrg>,
    liveOrgs: List<ElevateOrg>,
    loading: Boolean,
    error: String?,
    activeCategory: String,
    onCategory: (String) -> Unit,
    search: String,
    onSearch: (String) -> Unit,
    selectedId: String?,
    onSelectOrg: (ElevateOrg) -> Unit,
    onRetry: () -> Unit,
    cols: Int,
    horizontalPadding: androidx.compose.ui.unit.Dp,
) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(cols.coerceAtLeast(1)),
        modifier = Modifier.fillMaxSize().background(ElevateInk),
        contentPadding = PaddingValues(start = horizontalPadding, end = horizontalPadding, top = 10.dp, bottom = 104.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                // Header banner
                Surface(
                    shape = RoundedCornerShape(18.dp),
                    color = Color(0xFF141022),
                    border = BorderStroke(1.dp, ElevateGold.copy(0.28f)),
                ) {
                    Row(
                        Modifier.fillMaxWidth().padding(14.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text("PLAJAH ELEVATE", fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 1.6.sp, color = ElevateGold)
                            Text("Churches, Cultural & Community Hubs", fontSize = 16.sp, fontWeight = FontWeight.Black, color = Color.White, maxLines = 2)
                            Text(
                                "Multi-channel live sanctuaries, Vellum scripture reader, and swipeable streams.",
                                fontSize = 11.sp,
                                color = Color.White.copy(0.68f),
                                maxLines = 2,
                            )
                        }
                        if (liveOrgs.isNotEmpty()) {
                            Surface(
                                shape = CircleShape,
                                color = ElevateRose.copy(0.2f),
                                border = BorderStroke(1.dp, ElevateRose.copy(0.6f)),
                            ) {
                                Row(
                                    Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                                ) {
                                    Box(Modifier.size(6.dp).clip(CircleShape).background(ElevateRose))
                                    Text("${liveOrgs.size} ON AIR", fontSize = 9.sp, fontWeight = FontWeight.Black, color = Color.White)
                                }
                            }
                        }
                    }
                }

                // Search bar
                OutlinedTextField(
                    value = search,
                    onValueChange = onSearch,
                    placeholder = { Text("Search hubs, cities, denominations...", fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    leadingIcon = { Icon(Icons.Rounded.Search, null, tint = ElevateGold, modifier = Modifier.size(18.dp)) },
                    trailingIcon = {
                        if (search.isNotEmpty()) {
                            IconButton(onClick = { onSearch("") }) {
                                Icon(Icons.Rounded.Close, "Clear", tint = Color.White.copy(0.7f), modifier = Modifier.size(16.dp))
                            }
                        }
                    },
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = ElevateGold,
                        unfocusedBorderColor = Color.White.copy(0.14f),
                        focusedContainerColor = Color(0xFF12101D),
                        unfocusedContainerColor = Color(0xFF12101D),
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )

                // Category filter rail
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    ElevateCategories.forEach { (id, label) ->
                        val active = activeCategory == id
                        Surface(
                            shape = CircleShape,
                            color = if (active) ElevateGold else Color.White.copy(0.07f),
                            border = BorderStroke(1.dp, if (active) ElevateGold else Color.White.copy(0.12f)),
                            modifier = Modifier.clickable { onCategory(id) },
                        ) {
                            Text(
                                label,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = if (active) Color.Black else Color.White,
                                maxLines = 1,
                                modifier = Modifier.padding(horizontal = 13.dp, vertical = 7.dp),
                            )
                        }
                    }
                }
            }
        }

        // On-Air quick carousel
        if (liveOrgs.isNotEmpty() && search.isBlank() && activeCategory == "ALL") {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("ON AIR & MULTI-CHANNEL", fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 1.4.sp, color = ElevateGold)
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        liveOrgs.take(8).forEach { org ->
                            Surface(
                                shape = RoundedCornerShape(14.dp),
                                color = Color(0xFF171327),
                                border = BorderStroke(1.dp, ElevateRose.copy(0.35f)),
                                modifier = Modifier.width(210.dp).clickable { onSelectOrg(org) },
                            ) {
                                Row(
                                    Modifier.padding(10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                                ) {
                                    PlatformArt(
                                        url = org.logoUrl.ifBlank { org.coverUrl },
                                        title = org.name,
                                        modifier = Modifier.size(44.dp).clip(RoundedCornerShape(10.dp)),
                                    )
                                    Column(Modifier.weight(1f)) {
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                            Box(Modifier.size(6.dp).clip(CircleShape).background(ElevateRose))
                                            Text(
                                                "${org.channels.size.coerceAtLeast(1)} CH",
                                                fontSize = 9.sp,
                                                fontWeight = FontWeight.Black,
                                                color = ElevateRose,
                                            )
                                        }
                                        Text(org.name, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        Text(org.city.ifBlank { org.denomination }, fontSize = 10.sp, color = Color.White.copy(0.6f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if (loading) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = ElevateGold)
                }
            }
        } else if (error != null) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = Color(0xFF1A1220),
                    border = BorderStroke(1.dp, ElevateRose.copy(0.4f)),
                ) {
                    Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(error, color = Color.White, fontSize = 13.sp)
                        Button(onClick = onRetry, colors = ButtonDefaults.buttonColors(containerColor = ElevateGold, contentColor = Color.Black)) {
                            Text("Retry", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        } else if (orgs.isEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    Text("No Elevate hubs matched your filter.", color = Color.White.copy(0.65f), fontSize = 13.sp)
                }
            }
        } else {
            items(orgs, key = { it.id }) { org ->
                val isSelected = org.id == selectedId
                Surface(
                    shape = RoundedCornerShape(18.dp),
                    color = if (isSelected) Color(0xFF211A36) else Color(0xFF13101F),
                    border = BorderStroke(1.dp, if (isSelected) ElevateGold else Color.White.copy(0.09f)),
                    modifier = Modifier.fillMaxWidth().clickable { onSelectOrg(org) },
                ) {
                    Column {
                        Box(Modifier.fillMaxWidth().height(126.dp)) {
                            PlatformArt(
                                url = org.coverUrl.ifBlank { org.logoUrl },
                                title = org.name,
                                modifier = Modifier.fillMaxSize(),
                            )
                            Box(
                                Modifier.fillMaxSize().background(
                                    Brush.verticalGradient(listOf(Color.Transparent, Color(0xCC0A0812))),
                                ),
                            )
                            Row(
                                Modifier.align(Alignment.TopEnd).padding(8.dp),
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                if (org.channels.isNotEmpty()) {
                                    Surface(shape = CircleShape, color = Color(0xCC000000)) {
                                        Text(
                                            "${org.channels.size} Channels",
                                            fontSize = 9.sp,
                                            fontWeight = FontWeight.Black,
                                            color = ElevateGold,
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                        )
                                    }
                                }
                                if (org.isVerified) {
                                    Surface(shape = CircleShape, color = Color(0xCC000000)) {
                                        Icon(Icons.Rounded.Verified, "Verified", tint = PlajahBrand.Cyan, modifier = Modifier.padding(4.dp).size(14.dp))
                                    }
                                }
                            }
                            Row(
                                Modifier.align(Alignment.BottomStart).padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                PlatformArt(
                                    url = org.logoUrl.ifBlank { org.coverUrl },
                                    title = org.name,
                                    modifier = Modifier.size(40.dp).clip(CircleShape),
                                )
                                Column(Modifier.weight(1f)) {
                                    Text(org.name, fontSize = 14.sp, fontWeight = FontWeight.Black, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(
                                        listOf(org.denomination, org.city).filter { it.isNotBlank() }.joinToString(" · ").ifBlank { org.orgType },
                                        fontSize = 11.sp,
                                        color = Color.White.copy(0.75f),
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                        }
                        if (org.tagline.isNotBlank()) {
                            Text(
                                org.tagline,
                                fontSize = 12.sp,
                                color = Color.White.copy(0.72f),
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ElevateHubDetailPane(
    org: ElevateOrg,
    showBackButton: Boolean,
    onBack: () -> Unit,
    onOpenClassic: () -> Unit,
    onEnterFullscreen: () -> Unit,
) {
    val channels = remember(org) {
        if (org.channels.isNotEmpty()) org.channels
        else listOf(
            ElevateChannel(
                id = "${org.id}-main",
                title = "${org.name} Main Stream",
                subtitle = org.tagline.ifBlank { "Live Sanctuary Feed" },
                streamUrl = "",
                isLive = false,
                posterUrl = org.coverUrl,
            ),
        )
    }
    var channelIdx by rememberSaveable(org.id) { mutableIntStateOf(0) }
    val safeIdx = channelIdx.coerceIn(0, channels.lastIndex)
    val activeChannel = channels[safeIdx]

    var readerSkin by rememberSaveable { mutableStateOf("VELLUM") } // VELLUM | SEPIA | NIGHT
    var scriptureIdx by rememberSaveable { mutableIntStateOf(0) }
    var reflectionNote by rememberSaveable(org.id) { mutableStateOf("") }

    val stepChannel: (Int) -> Unit = { delta ->
        if (channels.size > 1) {
            channelIdx = (safeIdx + delta + channels.size) % channels.size
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(ElevateInk),
        contentPadding = PaddingValues(bottom = 110.dp),
    ) {
        // Top Hub Header
        item {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (showBackButton) {
                    IconButton(onClick = onBack, modifier = Modifier.size(36.dp)) {
                        Icon(Icons.Rounded.ArrowBack, "Back", tint = Color.White)
                    }
                }
                PlatformArt(
                    url = org.logoUrl.ifBlank { org.coverUrl },
                    title = org.name,
                    modifier = Modifier.size(36.dp).clip(CircleShape),
                )
                Column(Modifier.weight(1f)) {
                    Text(org.name, fontSize = 15.sp, fontWeight = FontWeight.Black, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        listOf(org.denomination, org.city).filter { it.isNotBlank() }.joinToString(" · ").ifBlank { org.orgType },
                        fontSize = 11.sp,
                        color = Color.White.copy(0.65f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                OutlinedButton(
                    onClick = onOpenClassic,
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                    border = BorderStroke(1.dp, ElevateGold.copy(0.55f)),
                    modifier = Modifier.height(32.dp),
                ) {
                    Text("Full Hub ↗", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = ElevateGold, maxLines = 1)
                }
            }
        }

        // Inline Multi-Channel Video Stage (NEVER auto-fullscreens!)
        item {
            Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .aspectRatio(16f / 9f)
                        .clip(RoundedCornerShape(16.dp))
                        .background(Color.Black),
                ) {
                    if (activeChannel.streamUrl.startsWith("https://") || activeChannel.streamUrl.startsWith("http://")) {
                        NativeVideoSurface(
                            streamUrl = activeChannel.streamUrl,
                            posterUrl = activeChannel.posterUrl.ifBlank { org.coverUrl },
                            title = activeChannel.title,
                            modifier = Modifier.fillMaxSize(),
                            isLive = activeChannel.isLive,
                            channelLabel = if (channels.size > 1) "Ch ${safeIdx + 1}/${channels.size}" else null,
                            onPrevChannel = if (channels.size > 1) { { stepChannel(-1) } } else null,
                            onNextChannel = if (channels.size > 1) { { stepChannel(1) } } else null,
                            onToggleFullscreen = onEnterFullscreen,
                            isFullscreen = false,
                        )
                    } else {
                        Box(Modifier.fillMaxSize()) {
                            PlatformArt(
                                url = activeChannel.posterUrl.ifBlank { org.coverUrl.ifBlank { org.logoUrl } },
                                title = org.name,
                                modifier = Modifier.fillMaxSize(),
                            )
                            Box(Modifier.fillMaxSize().background(Color(0x99080612)))
                            Column(
                                Modifier.align(Alignment.Center).padding(16.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Icon(Icons.Rounded.LiveTv, null, tint = ElevateGold, modifier = Modifier.size(32.dp))
                                Text(activeChannel.title, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text("Channel standby — tap Full Hub or switch channel below", fontSize = 11.sp, color = Color.White.copy(0.75f))
                            }
                        }
                    }
                }

                // Explicit Channel Switcher Bar + Swipe hint (always visible whenever >= 1 channel)
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0xFF151224),
                    border = BorderStroke(1.dp, Color.White.copy(0.09f)),
                ) {
                    Column(Modifier.fillMaxWidth().padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(
                            Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    if (channels.size > 1) "CHANNEL ${safeIdx + 1} OF ${channels.size} · SWIPE VIDEO OR TAP BELOW"
                                    else "LIVE BROADCAST FEED",
                                    fontSize = 9.sp,
                                    fontWeight = FontWeight.Black,
                                    letterSpacing = 1.sp,
                                    color = ElevateGold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(activeChannel.title, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                            if (channels.size > 1) {
                                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    FilledTonalIconButton(
                                        onClick = { stepChannel(-1) },
                                        modifier = Modifier.size(32.dp),
                                        colors = IconButtonDefaults.filledTonalIconButtonColors(containerColor = Color.White.copy(0.1f)),
                                    ) {
                                        Icon(Icons.Rounded.ChevronLeft, "Previous Channel", tint = Color.White, modifier = Modifier.size(18.dp))
                                    }
                                    FilledTonalIconButton(
                                        onClick = { stepChannel(1) },
                                        modifier = Modifier.size(32.dp),
                                        colors = IconButtonDefaults.filledTonalIconButtonColors(containerColor = Color.White.copy(0.1f)),
                                    ) {
                                        Icon(Icons.Rounded.ChevronRight, "Next Channel", tint = Color.White, modifier = Modifier.size(18.dp))
                                    }
                                }
                            }
                        }

                        if (channels.size > 1) {
                            Row(
                                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                channels.forEachIndexed { idx, ch ->
                                    val selected = idx == safeIdx
                                    Surface(
                                        shape = CircleShape,
                                        color = if (selected) ElevateGold else Color.White.copy(0.08f),
                                        border = BorderStroke(1.dp, if (selected) ElevateGold else Color.White.copy(0.14f)),
                                        modifier = Modifier.clickable { channelIdx = idx },
                                    ) {
                                        Row(
                                            Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                                        ) {
                                            if (ch.isLive) {
                                                Box(Modifier.size(6.dp).clip(CircleShape).background(if (selected) Color.Black else ElevateRose))
                                            }
                                            Text(
                                                "Ch ${idx + 1}: ${ch.title}",
                                                fontSize = 11.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = if (selected) Color.Black else Color.White,
                                                maxLines = 1,
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Vellum Scripture & Study Follow-Along (for faith & community hubs)
        item {
            val (bg, fg, accent) = when (readerSkin) {
                "SEPIA" -> Triple(Color(0xFFF3E6CE), Color(0xFF2B2115), Color(0xFF9A5B13))
                "NIGHT" -> Triple(Color(0xFF11101B), Color(0xFFEDE9E0), ElevateGold)
                else -> Triple(Color(0xFFFBF8F1), Color(0xFF1D1A15), Color(0xFF9E5A14))
            }
            val (ref, verse, theme) = ScriptureSamples[scriptureIdx % ScriptureSamples.size]

            Surface(
                shape = RoundedCornerShape(18.dp),
                color = bg,
                border = BorderStroke(1.dp, accent.copy(0.3f)),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 12.dp),
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("VELLUM FOLLOW-ALONG", fontSize = 9.sp, fontWeight = FontWeight.Black, letterSpacing = 1.4.sp, color = accent)
                            Text("$ref · $theme", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = fg, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            listOf("VELLUM" to "Paper", "SEPIA" to "Sepia", "NIGHT" to "Night").forEach { (id, lbl) ->
                                val active = readerSkin == id
                                Surface(
                                    shape = CircleShape,
                                    color = if (active) accent else fg.copy(0.08f),
                                    modifier = Modifier.clickable { readerSkin = id },
                                ) {
                                    Text(
                                        lbl,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = if (active) Color.White else fg.copy(0.8f),
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                    )
                                }
                            }
                        }
                    }

                    Text(
                        verse,
                        fontSize = 15.sp,
                        lineHeight = 23.sp,
                        fontFamily = FontFamily.Serif,
                        color = fg,
                    )

                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        TextButton(onClick = { scriptureIdx = (scriptureIdx + 1) % ScriptureSamples.size }) {
                            Text("Next Reading →", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = accent)
                        }
                    }

                    OutlinedTextField(
                        value = reflectionNote,
                        onValueChange = { reflectionNote = it },
                        placeholder = { Text("Jot sermon or gathering notes...", fontSize = 12.sp, color = fg.copy(0.5f)) },
                        minLines = 2,
                        maxLines = 4,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = fg,
                            unfocusedTextColor = fg,
                            focusedBorderColor = accent,
                            unfocusedBorderColor = fg.copy(0.2f),
                        ),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }

        // Ministries & Community Quick Actions
        item {
            Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (org.ministries.isNotEmpty()) {
                    Text("MINISTRIES & PROGRAMS", fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 1.4.sp, color = ElevateGold)
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        org.ministries.forEach { m ->
                            Surface(
                                shape = CircleShape,
                                color = Color.White.copy(0.07f),
                                border = BorderStroke(1.dp, Color.White.copy(0.12f)),
                            ) {
                                Text(m, fontSize = 11.sp, color = Color.White, modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp))
                            }
                        }
                    }
                }

                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = Color(0xFF161326),
                        border = BorderStroke(1.dp, Color.White.copy(0.1f)),
                        modifier = Modifier.weight(1f).clickable { onOpenClassic() },
                    ) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Icon(Icons.Rounded.Favorite, null, tint = ElevateRose, modifier = Modifier.size(20.dp))
                            Text("Prayer & Care", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.White, maxLines = 1)
                            Text("Share requests with the hub", fontSize = 10.sp, color = Color.White.copy(0.65f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = Color(0xFF161326),
                        border = BorderStroke(1.dp, Color.White.copy(0.1f)),
                        modifier = Modifier.weight(1f).clickable { onOpenClassic() },
                    ) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Icon(Icons.Rounded.VolunteerActivism, null, tint = ElevateGold, modifier = Modifier.size(20.dp))
                            Text("Give & Support", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color.White, maxLines = 1)
                            Text("Direct community stewardship", fontSize = 10.sp, color = Color.White.copy(0.65f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ElevateFullscreenStage(
    org: ElevateOrg,
    onExitFullscreen: () -> Unit,
) {
    val channels = remember(org) { org.channels.filter { it.streamUrl.startsWith("http") } }
    var idx by rememberSaveable(org.id) { mutableIntStateOf(0) }
    val safeIdx = idx.coerceIn(0, (channels.size - 1).coerceAtLeast(0))
    val ch = channels.getOrNull(safeIdx)

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        if (ch != null) {
            NativeVideoSurface(
                streamUrl = ch.streamUrl,
                posterUrl = ch.posterUrl.ifBlank { org.coverUrl },
                title = "${org.name} · ${ch.title}",
                modifier = Modifier.fillMaxSize(),
                isLive = ch.isLive,
                channelLabel = if (channels.size > 1) "Ch ${safeIdx + 1}/${channels.size}" else null,
                onPrevChannel = if (channels.size > 1) { { idx = (safeIdx - 1 + channels.size) % channels.size } } else null,
                onNextChannel = if (channels.size > 1) { { idx = (safeIdx + 1) % channels.size } } else null,
                onToggleFullscreen = onExitFullscreen,
                isFullscreen = true,
            )
        } else {
            Column(
                Modifier.align(Alignment.Center),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("No active stream URL on this channel.", color = Color.White)
                Button(onClick = onExitFullscreen) { Text("Exit Fullscreen") }
            }
        }
    }
}
