package com.plajah.app.ui.screens

import android.Manifest
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.plajah.app.data.AndroidRichFileKind
import com.plajah.app.data.ComicRichPages
import com.plajah.app.data.NativeFileEntry
import com.plajah.app.data.NativeStorageRoot
import com.plajah.app.data.PlajahFileSystemManager
import com.plajah.app.data.TelaRichSummary
import com.plajah.app.ui.theme.PlajahBrand
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import kotlin.math.abs
import kotlin.math.sin

private enum class FileSortMode { NAME, NEWEST, SIZE }

private enum class WorkspaceSection { LOCAL, DRIVE, HQ, SYNC, LOCATIONS }

private data class ClipboardBatch(
    val paths: List<String>,
    val move: Boolean,
)

private object PlajahWorkspaceColors {
    val CanvasBg = Color(0xFF07080D)
    val HeaderBg = Color(0xFF0B0D14)
    val SidebarBg = Color(0xFF0A0B11)
    val ToolbarBg = Color(0xFF0D1018)
    val CardBg = Color(0xFF10121C)
    val SplitBg = Color(0xFF090A10)
    val StageCanvas = Color(0xFF05060B)
    val Border = Color(0x1AFFFFFF)
    val BorderStrong = Color(0x2EFFFFFF)
    val Muted = Color(0x88FFFFFF)
    val TextSoft = Color(0xCCFFFFFF)

    val Amber = Color(0xFFF59E0B)
    val AmberSoft = Color(0x30F59E0B)
    val AmberBorder = Color(0x66F59E0B)
    val AmberText = Color(0xFFFDE68A)

    val Purple = Color(0xFFA855F7)
    val PurpleSoft = Color(0x33A855F7)
    val PurpleBorder = Color(0x80C084FC)
    val PurpleText = Color(0xFFE9D5FF)

    val Sky = Color(0xFF0EA5E9)
    val SkySoft = Color(0x330EA5E9)
    val SkyBorder = Color(0x8038BDF8)
    val SkyText = Color(0xFFBAE6FD)

    val Emerald = Color(0xFF10B981)
    val EmeraldSoft = Color(0x3310B981)
    val EmeraldText = Color(0xFF6EE7B7)

    val TealSoft = Color(0x3314B8A6)
    val TealText = Color(0xFF5EEAD4)

    val RedSoft = Color(0x2EEF4444)
    val RedText = Color(0xFFFCA5A5)
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun FilesScreen(
    onOpenWebFiles: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var activeSection by remember { mutableStateOf(WorkspaceSection.LOCAL) }
    var mobileSourcesOpen by remember { mutableStateOf(false) }
    var splitDriveOpen by remember { mutableStateOf(false) }
    var showPreviewPane by remember { mutableStateOf(true) }

    var hasAccess by remember { mutableStateOf(PlajahFileSystemManager.hasStorageAccess(context)) }
    var roots by remember { mutableStateOf<List<NativeStorageRoot>>(emptyList()) }
    var activeRoot by remember { mutableStateOf<NativeStorageRoot?>(null) }
    var currentPath by remember { mutableStateOf("") }
    var history by remember { mutableStateOf<List<String>>(emptyList()) }

    var entries by remember { mutableStateOf<List<NativeFileEntry>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var statusBanner by remember { mutableStateOf<String?>(null) }

    var searchQuery by remember { mutableStateOf("") }
    var sortMode by remember { mutableStateOf(FileSortMode.NAME) }
    var gridMode by remember { mutableStateOf(false) }

    var selectedPaths by remember { mutableStateOf<Set<String>>(emptySet()) }
    var clipboard by remember { mutableStateOf<ClipboardBatch?>(null) }

    var showNewFolderDialog by remember { mutableStateOf(false) }
    var newFolderName by remember { mutableStateOf("") }
    var renameTarget by remember { mutableStateOf<NativeFileEntry?>(null) }
    var renameInput by remember { mutableStateOf("") }
    var confirmDeleteBatch by remember { mutableStateOf<List<String>>(emptyList()) }

    // Docked + Fullscreen Unified Stage state
    var previewEntry by remember { mutableStateOf<NativeFileEntry?>(null) }
    var mobileRichPeekExpanded by remember { mutableStateOf(false) }
    var stageItems by remember { mutableStateOf<List<UnifiedStageItem>>(emptyList()) }
    var stageIndex by remember { mutableStateOf<Int?>(null) }

    // Sync state
    var syncPairsJson by remember { mutableStateOf(PlajahFileSystemManager.getSyncPairsJson(context)) }
    var syncCounts by remember { mutableStateOf<Map<String, Int>>(emptyMap()) }
    var syncingId by remember { mutableStateOf<String?>(null) }

    val parsedSyncPairs = remember(syncPairsJson) {
        val out = mutableListOf<JSONObject>()
        try {
            val arr = JSONArray(syncPairsJson)
            for (i in 0 until arr.length()) arr.optJSONObject(i)?.let { out += it }
        } catch (_: Exception) {
        }
        out
    }

    suspend fun reloadRoots() {
        val loaded = withContext(Dispatchers.IO) { PlajahFileSystemManager.getStorageRoots(context) }
        roots = loaded
        if (currentPath.isBlank() && loaded.isNotEmpty()) {
            activeRoot = loaded.first()
            currentPath = loaded.first().path
            history = emptyList()
        }
    }

    suspend fun reloadDir(targetPath: String = currentPath, query: String = searchQuery) {
        if (targetPath.isBlank()) return
        loading = true
        val listed = withContext(Dispatchers.IO) {
            PlajahFileSystemManager.listDirectory(
                context = context,
                path = targetPath,
                recursive = query.isNotBlank(),
                query = query,
                limit = 1500,
            )
        }
        entries = listed
        selectedPaths = emptySet()
        if (previewEntry != null && listed.none { it.path == previewEntry!!.path }) {
            previewEntry = listed.firstOrNull { !it.isDirectory }
        } else if (previewEntry == null) {
            previewEntry = listed.firstOrNull { !it.isDirectory }
        }
        loading = false
    }

    val permLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        hasAccess = PlajahFileSystemManager.hasStorageAccess(context)
        scope.launch {
            reloadRoots()
            reloadDir()
        }
    }

    val safLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri: Uri? ->
        if (uri != null) {
            scope.launch {
                val root = withContext(Dispatchers.IO) { PlajahFileSystemManager.registerSafTree(context, uri) }
                reloadRoots()
                activeRoot = root
                currentPath = root.path
                history = emptyList()
                activeSection = WorkspaceSection.LOCAL
                mobileSourcesOpen = false
                reloadDir(root.path)
            }
        }
    }

    LaunchedEffect(Unit) {
        reloadRoots()
        reloadDir()
    }

    LaunchedEffect(currentPath, searchQuery) {
        if (currentPath.isNotBlank()) reloadDir(currentPath, searchQuery)
    }

    val sortedEntries = remember(entries, sortMode) {
        val comparator = when (sortMode) {
            FileSortMode.NAME -> compareBy<NativeFileEntry>({ !it.isDirectory }, { it.name.lowercase() })
            FileSortMode.NEWEST -> compareBy<NativeFileEntry>({ !it.isDirectory }, { -it.lastModified })
            FileSortMode.SIZE -> compareBy<NativeFileEntry>({ !it.isDirectory }, { -it.size })
        }
        entries.sortedWith(comparator)
    }

    val fileStagePool = remember(sortedEntries) {
        sortedEntries.filterNot { it.isDirectory }.map { it.toStageItem() }
    }

    fun openFullscreenStage(entry: NativeFileEntry) {
        val idx = fileStagePool.indexOfFirst { it.pathOrUri == entry.path }
        if (idx >= 0) {
            stageItems = fileStagePool
            stageIndex = idx
        }
    }

    fun selectRoot(root: NativeStorageRoot) {
        activeSection = WorkspaceSection.LOCAL
        activeRoot = root
        currentPath = root.path
        history = emptyList()
        searchQuery = ""
        mobileSourcesOpen = false
    }

    fun navigateUp() {
        if (history.isNotEmpty()) {
            val prev = history.last()
            history = history.dropLast(1)
            currentPath = prev
        } else if (!currentPath.startsWith("content://")) {
            File(currentPath).parentFile?.let { currentPath = it.absolutePath }
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(PlajahWorkspaceColors.CanvasBg),
    ) {
        // ── Zone 1: Shared Top Shell Header Bar (matches WinUI 3 PlajahFilesWorkspace) ──
        BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
            val isWide = maxWidth >= 720.dp

            Column(modifier = Modifier.fillMaxSize()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(PlajahWorkspaceColors.HeaderBg)
                        .border(width = 1.dp, color = PlajahWorkspaceColors.Border)
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Row(
                        modifier = Modifier.weight(1f),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        if (!isWide) {
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(9.dp))
                                    .background(if (mobileSourcesOpen) PlajahWorkspaceColors.AmberSoft else Color(0x14FFFFFF))
                                    .border(
                                        1.dp,
                                        if (mobileSourcesOpen) PlajahWorkspaceColors.AmberBorder else PlajahWorkspaceColors.Border,
                                        RoundedCornerShape(9.dp),
                                    )
                                    .clickable { mobileSourcesOpen = !mobileSourcesOpen }
                                    .padding(7.dp),
                            ) {
                                Icon(
                                    if (mobileSourcesOpen) Icons.Rounded.Close else Icons.Rounded.Menu,
                                    contentDescription = "Sources",
                                    tint = if (mobileSourcesOpen) PlajahWorkspaceColors.AmberText else Color.White,
                                    modifier = Modifier.size(16.dp),
                                )
                            }
                        }

                        Box(
                            modifier = Modifier
                                .size(28.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(
                                    Brush.linearGradient(
                                        listOf(PlajahWorkspaceColors.Amber, Color(0xFF9333EA)),
                                    ),
                                ),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(Icons.Rounded.Storage, null, tint = Color.White, modifier = Modifier.size(15.dp))
                        }

                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Plajah Files & Content HQ",
                                color = Color.White,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                text = "Explorer • Cloud Drive • Sync • Locations",
                                color = PlajahWorkspaceColors.Muted,
                                fontSize = 10.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                        // Send Link CTA (Amber solid pill matching WinUI 3)
                        Row(
                            modifier = Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .background(PlajahWorkspaceColors.Amber)
                                .clickable {
                                    if (selectedPaths.isNotEmpty()) {
                                        try {
                                            PlajahFileSystemManager.shareEntries(context, selectedPaths.toList())
                                        } catch (e: Exception) {
                                            statusBanner = e.message
                                        }
                                    } else {
                                        onOpenWebFiles()
                                    }
                                }
                                .padding(horizontal = 10.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(5.dp),
                        ) {
                            Icon(Icons.Rounded.Send, null, tint = Color.Black, modifier = Modifier.size(13.dp))
                            if (isWide) {
                                Text("Send Link", color = Color.Black, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            } else {
                                Text("Send", color = Color.Black, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }

                        // Split Drive toggle (Purple pill matching WinUI 3)
                        Row(
                            modifier = Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .background(if (splitDriveOpen) PlajahWorkspaceColors.PurpleSoft else Color(0x14FFFFFF))
                                .border(
                                    1.dp,
                                    if (splitDriveOpen) PlajahWorkspaceColors.PurpleBorder else PlajahWorkspaceColors.Border,
                                    RoundedCornerShape(10.dp),
                                )
                                .clickable { splitDriveOpen = !splitDriveOpen }
                                .padding(horizontal = 9.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Icon(
                                Icons.Rounded.ViewColumn,
                                null,
                                tint = if (splitDriveOpen) PlajahWorkspaceColors.PurpleText else PlajahWorkspaceColors.TextSoft,
                                modifier = Modifier.size(14.dp),
                            )
                            if (isWide) {
                                Text(
                                    "Split Drive",
                                    color = if (splitDriveOpen) PlajahWorkspaceColors.PurpleText else PlajahWorkspaceColors.TextSoft,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                        }

                        // Preview Stage toggle (Sky pill matching WinUI 3)
                        Row(
                            modifier = Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .background(if (showPreviewPane) PlajahWorkspaceColors.SkySoft else Color(0x14FFFFFF))
                                .border(
                                    1.dp,
                                    if (showPreviewPane) PlajahWorkspaceColors.SkyBorder else PlajahWorkspaceColors.Border,
                                    RoundedCornerShape(10.dp),
                                )
                                .clickable { showPreviewPane = !showPreviewPane }
                                .padding(horizontal = 9.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Icon(
                                if (showPreviewPane) Icons.Rounded.Visibility else Icons.Rounded.VisibilityOff,
                                null,
                                tint = if (showPreviewPane) PlajahWorkspaceColors.SkyText else PlajahWorkspaceColors.TextSoft,
                                modifier = Modifier.size(14.dp),
                            )
                            if (isWide) {
                                Text(
                                    "Preview",
                                    color = if (showPreviewPane) PlajahWorkspaceColors.SkyText else PlajahWorkspaceColors.TextSoft,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                        }
                    }
                }

                if (statusBanner != null) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(PlajahWorkspaceColors.AmberSoft)
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(statusBanner!!, color = PlajahWorkspaceColors.AmberText, fontSize = 11.sp, modifier = Modifier.weight(1f))
                        Text(
                            "Dismiss",
                            color = Color.White,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.clickable { statusBanner = null },
                        )
                    }
                }

                // ── Main Studio Body (Adaptive 3-to-4 Columns on >= 720dp, Stacked/Overlay on Phone) ──
                Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                    Row(modifier = Modifier.fillMaxSize()) {
                        // Left Unified Location Sidebar (permanently docked on wide tablet/landscape)
                        if (isWide) {
                            UnifiedLocationSidebar(
                                roots = roots,
                                activeRoot = activeRoot,
                                activeSection = activeSection,
                                syncCount = parsedSyncPairs.size,
                                onSelectRoot = { selectRoot(it) },
                                onMountSaf = { safLauncher.launch(null) },
                                onSelectSection = {
                                    activeSection = it
                                    mobileSourcesOpen = false
                                },
                                onOpenWebFiles = onOpenWebFiles,
                                modifier = Modifier
                                    .width(232.dp)
                                    .fillMaxHeight()
                                    .background(PlajahWorkspaceColors.SidebarBg)
                                    .border(1.dp, PlajahWorkspaceColors.Border),
                            )
                        }

                        // Center Workspace + Compact Quick-Root Strip
                        Column(modifier = Modifier.weight(1f).fillMaxHeight()) {
                            // On phones (< 720dp), render compact unified horizontal root rail mirroring the Sidebar items
                            if (!isWide) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .background(PlajahWorkspaceColors.SidebarBg)
                                        .horizontalScroll(rememberScrollState())
                                        .padding(horizontal = 10.dp, vertical = 7.dp),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    roots.forEach { root ->
                                        val isAct = activeSection == WorkspaceSection.LOCAL && (activeRoot?.id == root.id || currentPath.startsWith(root.path))
                                        val usedFraction = if (root.totalBytes > 0L) {
                                            ((root.totalBytes - root.freeBytes).toFloat() / root.totalBytes.toFloat()).coerceIn(0f, 1f)
                                        } else null
                                        Column(
                                            modifier = Modifier
                                                .widthIn(min = 96.dp, max = 148.dp)
                                                .clip(RoundedCornerShape(10.dp))
                                                .background(if (isAct) PlajahWorkspaceColors.AmberSoft else Color(0x0DFFFFFF))
                                                .border(
                                                    1.dp,
                                                    if (isAct) PlajahWorkspaceColors.AmberBorder else PlajahWorkspaceColors.Border,
                                                    RoundedCornerShape(10.dp),
                                                )
                                                .clickable { selectRoot(root) }
                                                .padding(horizontal = 9.dp, vertical = 6.dp),
                                        ) {
                                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                                Icon(
                                                    Icons.Rounded.Storage,
                                                    null,
                                                    tint = if (isAct) PlajahWorkspaceColors.AmberText else PlajahWorkspaceColors.Muted,
                                                    modifier = Modifier.size(12.dp),
                                                )
                                                Text(
                                                    root.label,
                                                    color = if (isAct) PlajahWorkspaceColors.AmberText else Color.White,
                                                    fontSize = 11.sp,
                                                    fontWeight = FontWeight.SemiBold,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis,
                                                )
                                            }
                                            if (usedFraction != null) {
                                                Spacer(modifier = Modifier.height(4.dp))
                                                Box(
                                                    modifier = Modifier
                                                        .fillMaxWidth()
                                                        .height(3.dp)
                                                        .clip(RoundedCornerShape(99.dp))
                                                        .background(Color(0x1AFFFFFF)),
                                                ) {
                                                    Box(
                                                        modifier = Modifier
                                                            .fillMaxWidth(usedFraction)
                                                            .fillMaxHeight()
                                                            .background(PlajahWorkspaceColors.Amber),
                                                    )
                                                }
                                            }
                                        }
                                    }

                                    // Quick Cloud / Sync / Locations pills
                                    CompactSourcePill(
                                        label = "+ Mount",
                                        active = false,
                                        accent = PlajahWorkspaceColors.AmberText,
                                        onClick = { safLauncher.launch(null) },
                                    )
                                    CompactSourcePill(
                                        label = "Plajah Drive",
                                        active = activeSection == WorkspaceSection.DRIVE,
                                        accent = PlajahWorkspaceColors.SkyText,
                                        onClick = { activeSection = WorkspaceSection.DRIVE },
                                    )
                                    CompactSourcePill(
                                        label = "Sync (${parsedSyncPairs.size})",
                                        active = activeSection == WorkspaceSection.SYNC,
                                        accent = PlajahWorkspaceColors.EmeraldText,
                                        onClick = { activeSection = WorkspaceSection.SYNC },
                                    )
                                    CompactSourcePill(
                                        label = "Locations",
                                        active = activeSection == WorkspaceSection.LOCATIONS,
                                        accent = PlajahWorkspaceColors.SkyText,
                                        onClick = { activeSection = WorkspaceSection.LOCATIONS },
                                    )
                                }
                            }

                            when (activeSection) {
                                WorkspaceSection.LOCAL -> {
                                    // Storage Permission Banner when needed
                                    if (!hasAccess) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(horizontal = 10.dp, vertical = 6.dp)
                                                .clip(RoundedCornerShape(12.dp))
                                                .background(PlajahWorkspaceColors.AmberSoft)
                                                .border(1.dp, PlajahWorkspaceColors.AmberBorder, RoundedCornerShape(12.dp))
                                                .padding(10.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                        ) {
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text("Grant Device Storage Access", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                                Text("Browse device media or mount a folder.", color = PlajahWorkspaceColors.TextSoft, fontSize = 11.sp)
                                            }
                                            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                                TextButton(onClick = {
                                                    val perms = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                                        arrayOf(
                                                            Manifest.permission.READ_MEDIA_IMAGES,
                                                            Manifest.permission.READ_MEDIA_VIDEO,
                                                            Manifest.permission.READ_MEDIA_AUDIO,
                                                        )
                                                    } else {
                                                        arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
                                                    }
                                                    permLauncher.launch(perms)
                                                }) { Text("Media", color = PlajahWorkspaceColors.SkyText, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                                                TextButton(onClick = { safLauncher.launch(null) }) {
                                                    Text("Mount", color = PlajahWorkspaceColors.AmberText, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                                }
                                            }
                                        }
                                    }

                                    // Explorer Address & Toolbar Bar (#0D1018, matches WinUI 3)
                                    Column(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .background(PlajahWorkspaceColors.ToolbarBg)
                                            .border(1.dp, PlajahWorkspaceColors.Border)
                                            .padding(horizontal = 10.dp, vertical = 8.dp),
                                        verticalArrangement = Arrangement.spacedBy(6.dp),
                                    ) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                                        ) {
                                            val canUp = history.isNotEmpty() || (!currentPath.startsWith("content://") && activeRoot != null && currentPath != activeRoot!!.path)
                                            ToolbarSquareIconButton(
                                                icon = Icons.Rounded.ArrowUpward,
                                                desc = "Up",
                                                enabled = canUp,
                                                onClick = { navigateUp() },
                                            )
                                            ToolbarSquareIconButton(
                                                icon = Icons.Rounded.Refresh,
                                                desc = "Refresh",
                                                enabled = true,
                                                onClick = { scope.launch { reloadDir() } },
                                            )

                                            // Clickable Breadcrumb Pill
                                            val crumbs = remember(activeRoot, currentPath) {
                                                buildBreadcrumbs(activeRoot, currentPath)
                                            }
                                            Row(
                                                modifier = Modifier
                                                    .weight(1f)
                                                    .clip(RoundedCornerShape(10.dp))
                                                    .background(Color(0x80000000))
                                                    .border(1.dp, PlajahWorkspaceColors.Border, RoundedCornerShape(10.dp))
                                                    .horizontalScroll(rememberScrollState())
                                                    .padding(horizontal = 10.dp, vertical = 7.dp),
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                            ) {
                                                crumbs.forEachIndexed { idx, crumb ->
                                                    if (idx > 0) {
                                                        Icon(
                                                            Icons.Rounded.ChevronRight,
                                                            null,
                                                            tint = PlajahWorkspaceColors.Muted,
                                                            modifier = Modifier.size(13.dp),
                                                        )
                                                    }
                                                    Text(
                                                        text = crumb.first,
                                                        color = if (idx == 0) PlajahWorkspaceColors.AmberText else PlajahWorkspaceColors.TextSoft,
                                                        fontSize = 11.sp,
                                                        fontWeight = if (idx == 0) FontWeight.Bold else FontWeight.Medium,
                                                        modifier = Modifier.clickable {
                                                            currentPath = crumb.second
                                                            searchQuery = ""
                                                        },
                                                    )
                                                }
                                            }

                                            ToolbarSquareIconButton(
                                                icon = Icons.Rounded.Sort,
                                                desc = "Sort: ${sortMode.name}",
                                                enabled = true,
                                                tint = PlajahWorkspaceColors.AmberText,
                                                onClick = {
                                                    sortMode = FileSortMode.entries[(sortMode.ordinal + 1) % FileSortMode.entries.size]
                                                },
                                            )
                                            ToolbarSquareIconButton(
                                                icon = if (gridMode) Icons.Rounded.ViewList else Icons.Rounded.GridView,
                                                desc = "Switch List / Grid",
                                                enabled = true,
                                                onClick = { gridMode = !gridMode },
                                            )
                                        }

                                        // Search + Action Strip Row (matches WinUI 3)
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .horizontalScroll(rememberScrollState()),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                                        ) {
                                            OutlinedTextField(
                                                value = searchQuery,
                                                onValueChange = { searchQuery = it },
                                                singleLine = true,
                                                placeholder = { Text("Filter folder...", color = PlajahWorkspaceColors.Muted, fontSize = 11.sp) },
                                                leadingIcon = {
                                                    Icon(Icons.Rounded.Search, null, tint = PlajahWorkspaceColors.Muted, modifier = Modifier.size(14.dp))
                                                },
                                                modifier = Modifier.width(if (isWide) 190.dp else 138.dp),
                                                textStyle = LocalTextStyle.current.copy(color = Color.White, fontSize = 11.sp),
                                            )

                                            ActionChipButton(
                                                label = "+ New Folder",
                                                icon = Icons.Rounded.CreateNewFolder,
                                                bg = Color(0x14FFFFFF),
                                                fg = Color.White,
                                                onClick = {
                                                    newFolderName = ""
                                                    showNewFolderDialog = true
                                                },
                                            )

                                            if (selectedPaths.isNotEmpty()) {
                                                ActionChipButton(
                                                    label = "Copy (${selectedPaths.size})",
                                                    icon = Icons.Rounded.ContentCopy,
                                                    bg = Color(0x14FFFFFF),
                                                    fg = Color.White,
                                                    onClick = {
                                                        clipboard = ClipboardBatch(selectedPaths.toList(), move = false)
                                                        selectedPaths = emptySet()
                                                    },
                                                )
                                                ActionChipButton(
                                                    label = "Move",
                                                    icon = Icons.Rounded.ContentCut,
                                                    bg = Color(0x14FFFFFF),
                                                    fg = Color.White,
                                                    onClick = {
                                                        clipboard = ClipboardBatch(selectedPaths.toList(), move = true)
                                                        selectedPaths = emptySet()
                                                    },
                                                )
                                                ActionChipButton(
                                                    label = "Zip",
                                                    icon = Icons.Rounded.FolderZip,
                                                    bg = Color(0x14FFFFFF),
                                                    fg = Color.White,
                                                    onClick = {
                                                        val list = selectedPaths.toList()
                                                        scope.launch {
                                                            val destZip = if (currentPath.startsWith("content://")) {
                                                                File(context.cacheDir, "archive_${System.currentTimeMillis()}.zip").absolutePath
                                                            } else {
                                                                File(currentPath, "archive_${System.currentTimeMillis()}.zip").absolutePath
                                                            }
                                                            withContext(Dispatchers.IO) {
                                                                PlajahFileSystemManager.zipEntries(context, list, destZip)
                                                            }
                                                            statusBanner = "Created ZIP archive"
                                                            reloadDir()
                                                        }
                                                    },
                                                )
                                                ActionChipButton(
                                                    label = "Share",
                                                    icon = Icons.Rounded.Share,
                                                    bg = PlajahWorkspaceColors.SkySoft,
                                                    fg = PlajahWorkspaceColors.SkyText,
                                                    onClick = {
                                                        try {
                                                            PlajahFileSystemManager.shareEntries(context, selectedPaths.toList())
                                                        } catch (e: Exception) {
                                                            statusBanner = e.message
                                                        }
                                                    },
                                                )
                                                ActionChipButton(
                                                    label = "Delete",
                                                    icon = Icons.Rounded.Delete,
                                                    bg = PlajahWorkspaceColors.RedSoft,
                                                    fg = PlajahWorkspaceColors.RedText,
                                                    onClick = { confirmDeleteBatch = selectedPaths.toList() },
                                                )
                                            }

                                            if (clipboard != null && !currentPath.startsWith("content://")) {
                                                val clip = clipboard!!
                                                ActionChipButton(
                                                    label = "Paste ${clip.paths.size}",
                                                    icon = Icons.Rounded.ContentPaste,
                                                    bg = PlajahWorkspaceColors.EmeraldSoft,
                                                    fg = PlajahWorkspaceColors.EmeraldText,
                                                    onClick = {
                                                        scope.launch {
                                                            withContext(Dispatchers.IO) {
                                                                if (clip.move) PlajahFileSystemManager.moveEntries(context, clip.paths, currentPath)
                                                                else PlajahFileSystemManager.copyEntries(context, clip.paths, currentPath)
                                                            }
                                                            clipboard = null
                                                            reloadDir()
                                                        }
                                                    },
                                                )
                                            }
                                        }
                                    }

                                    // Directory Table / Grid Content
                                    Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                                        if (loading) {
                                            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                                CircularProgressIndicator(color = PlajahWorkspaceColors.Amber)
                                            }
                                        } else if (sortedEntries.isEmpty()) {
                                            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                                    Icon(Icons.Rounded.FolderOpen, null, tint = Color(0xFF475569), modifier = Modifier.size(44.dp))
                                                    Spacer(modifier = Modifier.height(8.dp))
                                                    Text("Folder is empty", color = PlajahWorkspaceColors.Muted, fontSize = 12.sp)
                                                }
                                            }
                                        } else {
                                            fun onRowTap(entry: NativeFileEntry) {
                                                if (entry.isDirectory) {
                                                    history = history + currentPath
                                                    currentPath = entry.path
                                                    searchQuery = ""
                                                } else if (selectedPaths.size > 1) {
                                                    selectedPaths = if (selectedPaths.contains(entry.path)) {
                                                        selectedPaths - entry.path
                                                    } else {
                                                        selectedPaths + entry.path
                                                    }
                                                } else {
                                                    selectedPaths = setOf(entry.path)
                                                    previewEntry = entry
                                                    if (!showPreviewPane) {
                                                        openFullscreenStage(entry)
                                                    }
                                                }
                                            }

                                            if (gridMode) {
                                                LazyVerticalGrid(
                                                    columns = GridCells.Fixed(if (isWide) 4 else 2),
                                                    contentPadding = PaddingValues(10.dp),
                                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                                    verticalArrangement = Arrangement.spacedBy(8.dp),
                                                ) {
                                                    items(sortedEntries, key = { it.path }) { entry ->
                                                        val isSel = selectedPaths.contains(entry.path) || previewEntry?.path == entry.path
                                                        Column(
                                                            modifier = Modifier
                                                                .clip(RoundedCornerShape(14.dp))
                                                                .background(if (isSel) PlajahWorkspaceColors.AmberSoft else PlajahWorkspaceColors.CardBg)
                                                                .border(
                                                                    1.dp,
                                                                    if (isSel) PlajahWorkspaceColors.AmberBorder else PlajahWorkspaceColors.Border,
                                                                    RoundedCornerShape(14.dp),
                                                                )
                                                                .combinedClickable(
                                                                    onClick = { onRowTap(entry) },
                                                                    onDoubleClick = { if (!entry.isDirectory) openFullscreenStage(entry) },
                                                                    onLongClick = {
                                                                        selectedPaths = if (selectedPaths.contains(entry.path)) {
                                                                            selectedPaths - entry.path
                                                                        } else {
                                                                            selectedPaths + entry.path
                                                                        }
                                                                    },
                                                                )
                                                                .padding(9.dp),
                                                        ) {
                                                            EntryIconOrThumb(
                                                                context = context,
                                                                entry = entry,
                                                                modifier = Modifier
                                                                    .fillMaxWidth()
                                                                    .aspectRatio(4f / 3f),
                                                            )
                                                            Spacer(modifier = Modifier.height(7.dp))
                                                            Text(
                                                                entry.name,
                                                                color = Color.White,
                                                                fontSize = 11.sp,
                                                                fontWeight = FontWeight.SemiBold,
                                                                maxLines = 1,
                                                                overflow = TextOverflow.Ellipsis,
                                                            )
                                                            Spacer(modifier = Modifier.height(4.dp))
                                                            Row(
                                                                modifier = Modifier.fillMaxWidth(),
                                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                                verticalAlignment = Alignment.CenterVertically,
                                                            ) {
                                                                KindPillBadge(entry)
                                                                Text(
                                                                    if (entry.isDirectory) "—" else formatByteSize(entry.size),
                                                                    color = PlajahWorkspaceColors.Muted,
                                                                    fontFamily = FontFamily.Monospace,
                                                                    fontSize = 10.sp,
                                                                )
                                                            }
                                                        }
                                                    }
                                                }
                                            } else {
                                                Column(modifier = Modifier.fillMaxSize()) {
                                                    // Table Header matching WinUI 3 Details Table
                                                    Row(
                                                        modifier = Modifier
                                                            .fillMaxWidth()
                                                            .background(PlajahWorkspaceColors.ToolbarBg)
                                                            .border(1.dp, PlajahWorkspaceColors.Border)
                                                            .padding(horizontal = 10.dp, vertical = 7.dp),
                                                        verticalAlignment = Alignment.CenterVertically,
                                                    ) {
                                                        Icon(
                                                            if (selectedPaths.isNotEmpty() && selectedPaths.size == sortedEntries.size) {
                                                                Icons.Rounded.CheckBox
                                                            } else {
                                                                Icons.Rounded.CheckBoxOutlineBlank
                                                            },
                                                            contentDescription = "Select All",
                                                            tint = if (selectedPaths.isNotEmpty()) PlajahWorkspaceColors.Amber else PlajahWorkspaceColors.Muted,
                                                            modifier = Modifier
                                                                .size(17.dp)
                                                                .clickable {
                                                                    selectedPaths = if (selectedPaths.size == sortedEntries.size) {
                                                                        emptySet()
                                                                    } else {
                                                                        sortedEntries.map { it.path }.toSet()
                                                                    }
                                                                },
                                                        )
                                                        Spacer(modifier = Modifier.width(10.dp))
                                                        Text("NAME", color = PlajahWorkspaceColors.Muted, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                                                        Text("KIND", color = PlajahWorkspaceColors.Muted, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(52.dp))
                                                        Text("SIZE", color = PlajahWorkspaceColors.Muted, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                                    }

                                                    LazyColumn(modifier = Modifier.fillMaxSize()) {
                                                        items(sortedEntries, key = { it.path }) { entry ->
                                                            val isSel = selectedPaths.contains(entry.path)
                                                            val isPrev = previewEntry?.path == entry.path
                                                            Row(
                                                                modifier = Modifier
                                                                    .fillMaxWidth()
                                                                    .background(
                                                                        when {
                                                                            isSel || isPrev -> Color(0x22F59E0B)
                                                                            else -> Color.Transparent
                                                                        },
                                                                    )
                                                                    .border(width = 0.5.dp, color = Color(0x0DFFFFFF))
                                                                    .combinedClickable(
                                                                        onClick = { onRowTap(entry) },
                                                                        onDoubleClick = { if (!entry.isDirectory) openFullscreenStage(entry) },
                                                                        onLongClick = {
                                                                            selectedPaths = if (isSel) selectedPaths - entry.path else selectedPaths + entry.path
                                                                        },
                                                                    )
                                                                    .padding(horizontal = 10.dp, vertical = 8.dp),
                                                                verticalAlignment = Alignment.CenterVertically,
                                                            ) {
                                                                Icon(
                                                                    if (isSel) Icons.Rounded.CheckBox else Icons.Rounded.CheckBoxOutlineBlank,
                                                                    contentDescription = "Select",
                                                                    tint = if (isSel) PlajahWorkspaceColors.Amber else Color(0x4DFFFFFF),
                                                                    modifier = Modifier
                                                                        .size(17.dp)
                                                                        .clickable {
                                                                            selectedPaths = if (isSel) selectedPaths - entry.path else selectedPaths + entry.path
                                                                        },
                                                                )
                                                                Spacer(modifier = Modifier.width(10.dp))
                                                                EntryIconOrThumb(context, entry, Modifier.size(28.dp))
                                                                Spacer(modifier = Modifier.width(8.dp))
                                                                Text(
                                                                    entry.name,
                                                                    color = Color.White,
                                                                    fontSize = 12.sp,
                                                                    fontWeight = FontWeight.Medium,
                                                                    maxLines = 1,
                                                                    overflow = TextOverflow.Ellipsis,
                                                                    modifier = Modifier.weight(1f).padding(end = 6.dp),
                                                                )
                                                                Box(modifier = Modifier.width(52.dp)) {
                                                                    KindPillBadge(entry)
                                                                }
                                                                Text(
                                                                    text = if (entry.isDirectory) "—" else formatByteSize(entry.size),
                                                                    color = PlajahWorkspaceColors.Muted,
                                                                    fontFamily = FontFamily.Monospace,
                                                                    fontSize = 11.sp,
                                                                )
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    // Compact Portrait Phone Bottom Docked Quick-View Bar + Expandable Rich Peek Card
                                    if (!isWide && showPreviewPane && previewEntry != null) {
                                        val pe = previewEntry!!
                                        val idx = fileStagePool.indexOfFirst { it.pathOrUri == pe.path }
                                        if (mobileRichPeekExpanded) {
                                            Box(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .height(276.dp)
                                                    .background(PlajahWorkspaceColors.SidebarBg)
                                                    .border(1.dp, PlajahWorkspaceColors.BorderStrong)
                                                    .padding(10.dp),
                                            ) {
                                                AndroidRichMediaPreviewSurface(
                                                    context = context,
                                                    entry = pe,
                                                    autoplayAudio = true,
                                                    onExpand = { openFullscreenStage(pe) },
                                                    modifier = Modifier.fillMaxSize(),
                                                )
                                            }
                                        }
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .background(PlajahWorkspaceColors.HeaderBg)
                                                .border(1.dp, PlajahWorkspaceColors.Border)
                                                .padding(horizontal = 10.dp, vertical = 8.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                                        ) {
                                            EntryIconOrThumb(
                                                context = context,
                                                entry = pe,
                                                modifier = Modifier
                                                    .size(38.dp)
                                                    .clickable { mobileRichPeekExpanded = !mobileRichPeekExpanded },
                                            )
                                            Column(
                                                modifier = Modifier
                                                    .weight(1f)
                                                    .clickable { mobileRichPeekExpanded = !mobileRichPeekExpanded },
                                            ) {
                                                Text(pe.name, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                                    KindPillBadge(pe)
                                                    Text(formatByteSize(pe.size), color = PlajahWorkspaceColors.Muted, fontSize = 10.sp, fontFamily = FontFamily.Monospace)
                                                }
                                            }
                                            Box(
                                                modifier = Modifier
                                                    .clip(RoundedCornerShape(8.dp))
                                                    .background(if (mobileRichPeekExpanded) PlajahWorkspaceColors.SkySoft else Color(0x14FFFFFF))
                                                    .border(1.dp, if (mobileRichPeekExpanded) PlajahWorkspaceColors.SkyBorder else PlajahWorkspaceColors.Border, RoundedCornerShape(8.dp))
                                                    .clickable { mobileRichPeekExpanded = !mobileRichPeekExpanded }
                                                    .padding(horizontal = 8.dp, vertical = 6.dp),
                                            ) {
                                                Text(
                                                    if (mobileRichPeekExpanded) "Hide" else "Peek",
                                                    color = if (mobileRichPeekExpanded) PlajahWorkspaceColors.SkyText else Color.White,
                                                    fontSize = 11.sp,
                                                    fontWeight = FontWeight.SemiBold,
                                                )
                                            }
                                            IconButton(
                                                enabled = idx > 0,
                                                onClick = { if (idx > 0) previewEntry = sortedEntries.firstOrNull { it.path == fileStagePool[idx - 1].pathOrUri } },
                                                modifier = Modifier.size(28.dp),
                                            ) {
                                                Icon(Icons.Rounded.ChevronLeft, "Previous", tint = if (idx > 0) Color.White else Color(0x44FFFFFF), modifier = Modifier.size(18.dp))
                                            }
                                            Box(
                                                modifier = Modifier
                                                    .clip(RoundedCornerShape(8.dp))
                                                    .background(PlajahWorkspaceColors.Amber)
                                                    .clickable { openFullscreenStage(pe) }
                                                    .padding(horizontal = 10.dp, vertical = 6.dp),
                                            ) {
                                                Text("Stage", color = Color.Black, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                            }
                                            IconButton(
                                                enabled = idx >= 0 && idx < fileStagePool.lastIndex,
                                                onClick = {
                                                    if (idx >= 0 && idx < fileStagePool.lastIndex) {
                                                        previewEntry = sortedEntries.firstOrNull { it.path == fileStagePool[idx + 1].pathOrUri }
                                                    }
                                                },
                                                modifier = Modifier.size(28.dp),
                                            ) {
                                                Icon(
                                                    Icons.Rounded.ChevronRight,
                                                    "Next",
                                                    tint = if (idx >= 0 && idx < fileStagePool.lastIndex) Color.White else Color(0x44FFFFFF),
                                                    modifier = Modifier.size(18.dp),
                                                )
                                            }
                                        }
                                    }

                                    // Compact Portrait Phone Split Drive Drawer
                                    if (!isWide && splitDriveOpen) {
                                        SplitDriveHubCard(
                                            syncCount = parsedSyncPairs.size,
                                            onOpenWebFiles = onOpenWebFiles,
                                            onClose = { splitDriveOpen = false },
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .background(PlajahWorkspaceColors.SplitBg)
                                                .border(1.dp, PlajahWorkspaceColors.PurpleBorder),
                                        )
                                    }
                                }

                                WorkspaceSection.SYNC -> {
                                    Column(
                                        modifier = Modifier
                                            .fillMaxSize()
                                            .padding(14.dp),
                                        verticalArrangement = Arrangement.spacedBy(10.dp),
                                    ) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically,
                                        ) {
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text("Two-Way & Selective Folder Sync", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                                Text("Local Watch & deterministic sync pairs with Plajah Drive", color = PlajahWorkspaceColors.Muted, fontSize = 11.sp)
                                            }
                                            Box(
                                                modifier = Modifier
                                                    .clip(RoundedCornerShape(10.dp))
                                                    .background(PlajahWorkspaceColors.Amber)
                                                    .clickable(enabled = currentPath.isNotBlank()) {
                                                        val nextArr = JSONArray(syncPairsJson)
                                                        val id = "sync_${System.currentTimeMillis()}"
                                                        val label = currentPath.substringAfterLast('/').ifBlank { "Android Sync" }
                                                        nextArr.put(
                                                            JSONObject()
                                                                .put("id", id)
                                                                .put("localPath", currentPath)
                                                                .put("remoteName", label)
                                                                .put("direction", "twoWay")
                                                                .put("enabled", true),
                                                        )
                                                        val updated = nextArr.toString()
                                                        PlajahFileSystemManager.saveSyncPairsJson(context, updated)
                                                        syncPairsJson = updated
                                                        statusBanner = "Paired $label for Two-Way Sync"
                                                    }
                                                    .padding(horizontal = 12.dp, vertical = 7.dp),
                                            ) {
                                                Text("+ Pair Current Folder", color = Color.Black, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                            }
                                        }

                                        if (parsedSyncPairs.isEmpty()) {
                                            Box(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .clip(RoundedCornerShape(14.dp))
                                                    .background(PlajahWorkspaceColors.CardBg)
                                                    .border(1.dp, PlajahWorkspaceColors.Border, RoundedCornerShape(14.dp))
                                                    .padding(16.dp),
                                            ) {
                                                Text(
                                                    "Open any local folder in This Device and click '+ Pair Current Folder' to keep it synced two-way with Plajah Drive.",
                                                    color = PlajahWorkspaceColors.Muted,
                                                    fontSize = 12.sp,
                                                )
                                            }
                                        } else {
                                            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.weight(1f)) {
                                                items(parsedSyncPairs, key = { it.optString("id") }) { obj ->
                                                    val id = obj.optString("id")
                                                    val path = obj.optString("localPath")
                                                    val count = syncCounts[id]
                                                    Row(
                                                        modifier = Modifier
                                                            .fillMaxWidth()
                                                            .clip(RoundedCornerShape(14.dp))
                                                            .background(PlajahWorkspaceColors.CardBg)
                                                            .border(1.dp, PlajahWorkspaceColors.Border, RoundedCornerShape(14.dp))
                                                            .padding(12.dp),
                                                        verticalAlignment = Alignment.CenterVertically,
                                                    ) {
                                                        Column(modifier = Modifier.weight(1f)) {
                                                            Text(obj.optString("remoteName", "Sync Folder"), color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                                                            Text(path, color = PlajahWorkspaceColors.Muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                                            if (count != null) {
                                                                Text("Indexed $count local items", color = PlajahWorkspaceColors.EmeraldText, fontSize = 11.sp)
                                                            }
                                                        }
                                                        TextButton(
                                                            enabled = syncingId != id,
                                                            onClick = {
                                                                scope.launch {
                                                                    syncingId = id
                                                                    val snap = withContext(Dispatchers.IO) { PlajahFileSystemManager.scanLocalFolder(context, path) }
                                                                    syncCounts = syncCounts + (id to snap.size)
                                                                    syncingId = null
                                                                }
                                                            },
                                                        ) {
                                                            Text(if (syncingId == id) "Scanning..." else "Scan", color = PlajahWorkspaceColors.SkyText, fontSize = 11.sp)
                                                        }
                                                        IconButton(onClick = {
                                                            val nextArr = JSONArray()
                                                            parsedSyncPairs.filterNot { it.optString("id") == id }.forEach { nextArr.put(it) }
                                                            val updated = nextArr.toString()
                                                            PlajahFileSystemManager.saveSyncPairsJson(context, updated)
                                                            syncPairsJson = updated
                                                        }) {
                                                            Icon(Icons.Rounded.DeleteOutline, "Remove", tint = PlajahWorkspaceColors.RedText)
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }

                                WorkspaceSection.DRIVE, WorkspaceSection.HQ, WorkspaceSection.LOCATIONS -> {
                                    Column(
                                        modifier = Modifier
                                            .fillMaxSize()
                                            .padding(16.dp),
                                        verticalArrangement = Arrangement.spacedBy(12.dp),
                                    ) {
                                        val title = when (activeSection) {
                                            WorkspaceSection.DRIVE -> "Plajah Drive • Encrypted Cloud B2"
                                            WorkspaceSection.HQ -> "My Content HQ • Production Vault"
                                            else -> "Connected Locations & Device Mesh (LAN)"
                                        }
                                        val desc = when (activeSection) {
                                            WorkspaceSection.DRIVE -> "Direct signed uploads, folder quotas, expiring password-locked Send transfers (/transfer/...), and Split Drive dual-pane."
                                            WorkspaceSection.HQ -> "Personal and Ministry / Studio Content HQ vaults, shared team approvals, and release stems."
                                            else -> "Connect FileZilla sites, SFTP/FTPS, WebDAV, SMB shares, and discover other Plajah devices over LAN."
                                        }
                                        Column(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clip(RoundedCornerShape(16.dp))
                                                .background(PlajahWorkspaceColors.CardBg)
                                                .border(1.dp, PlajahWorkspaceColors.Border, RoundedCornerShape(16.dp))
                                                .padding(18.dp),
                                        ) {
                                            Text(title, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                                            Spacer(modifier = Modifier.height(6.dp))
                                            Text(desc, color = PlajahWorkspaceColors.Muted, fontSize = 12.sp)
                                            Spacer(modifier = Modifier.height(14.dp))
                                            Box(
                                                modifier = Modifier
                                                    .clip(RoundedCornerShape(10.dp))
                                                    .background(PlajahWorkspaceColors.Amber)
                                                    .clickable { onOpenWebFiles() }
                                                    .padding(horizontal = 14.dp, vertical = 9.dp),
                                            ) {
                                                Text("Open Live Cloud & Connector Workspace", color = Color.Black, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // Optional Split Drive Pane on Wide Screen (mirrors WinUI 3)
                        if (isWide && splitDriveOpen) {
                            SplitDriveHubCard(
                                syncCount = parsedSyncPairs.size,
                                onOpenWebFiles = onOpenWebFiles,
                                onClose = { splitDriveOpen = false },
                                modifier = Modifier
                                    .width(268.dp)
                                    .fillMaxHeight()
                                    .background(PlajahWorkspaceColors.SplitBg)
                                    .border(1.dp, PlajahWorkspaceColors.Border),
                            )
                        }

                        // Docked Right Quick-View Stage Pane on Wide Screen (mirrors WinUI 3 PlajahMediaStage embedded)
                        if (isWide && showPreviewPane && previewEntry != null && activeSection == WorkspaceSection.LOCAL) {
                            val pe = previewEntry!!
                            val idx = fileStagePool.indexOfFirst { it.pathOrUri == pe.path }
                            DockedQuickViewStagePane(
                                context = context,
                                entry = pe,
                                playlist = fileStagePool,
                                currentIndex = idx,
                                onSelectPlaylistItem = { item ->
                                    previewEntry = sortedEntries.firstOrNull { it.path == item.pathOrUri }
                                },
                                onExpand = { openFullscreenStage(pe) },
                                onShare = {
                                    try {
                                        PlajahFileSystemManager.shareEntries(context, listOf(pe.path), pe.name)
                                    } catch (e: Exception) {
                                        statusBanner = e.message
                                    }
                                },
                                onRename = {
                                    renameTarget = pe
                                    renameInput = pe.name
                                },
                                onClose = { previewEntry = null },
                                modifier = Modifier
                                    .width(292.dp)
                                    .fillMaxHeight()
                                    .background(PlajahWorkspaceColors.SidebarBg)
                                    .border(1.dp, PlajahWorkspaceColors.Border),
                            )
                        }
                    }

                    // Compact Screen Slide-Over Unified Location Sidebar Drawer
                    if (!isWide && mobileSourcesOpen) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .background(Color(0x99000000))
                                .clickable { mobileSourcesOpen = false },
                        ) {
                            UnifiedLocationSidebar(
                                roots = roots,
                                activeRoot = activeRoot,
                                activeSection = activeSection,
                                syncCount = parsedSyncPairs.size,
                                onSelectRoot = { selectRoot(it) },
                                onMountSaf = { safLauncher.launch(null) },
                                onSelectSection = {
                                    activeSection = it
                                    mobileSourcesOpen = false
                                },
                                onOpenWebFiles = onOpenWebFiles,
                                modifier = Modifier
                                    .width(260.dp)
                                    .fillMaxHeight()
                                    .background(PlajahWorkspaceColors.SidebarBg)
                                    .border(1.dp, PlajahWorkspaceColors.Border)
                                    .clickable(enabled = false) { },
                            )
                        }
                    }
                }
            }
        }
    }

    // ── Dialogs ──────────────────────────────────────────────────────────────────────────────────
    if (showNewFolderDialog) {
        AlertDialog(
            onDismissRequest = { showNewFolderDialog = false },
            title = { Text("Create Folder") },
            text = {
                OutlinedTextField(
                    value = newFolderName,
                    onValueChange = { newFolderName = it },
                    singleLine = true,
                    placeholder = { Text("Folder name") },
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    val name = newFolderName.trim()
                    showNewFolderDialog = false
                    if (name.isNotEmpty()) {
                        scope.launch {
                            try {
                                withContext(Dispatchers.IO) { PlajahFileSystemManager.createFolder(context, currentPath, name) }
                                reloadDir()
                            } catch (e: Exception) {
                                statusBanner = e.message
                            }
                        }
                    }
                }) { Text("Create") }
            },
            dismissButton = { TextButton(onClick = { showNewFolderDialog = false }) { Text("Cancel") } },
        )
    }

    val rn = renameTarget
    if (rn != null) {
        AlertDialog(
            onDismissRequest = { renameTarget = null },
            title = { Text("Rename") },
            text = {
                OutlinedTextField(
                    value = renameInput,
                    onValueChange = { renameInput = it },
                    singleLine = true,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    val newName = renameInput.trim()
                    renameTarget = null
                    if (newName.isNotEmpty() && newName != rn.name) {
                        scope.launch {
                            try {
                                withContext(Dispatchers.IO) { PlajahFileSystemManager.renameEntry(context, rn.path, newName) }
                                reloadDir()
                            } catch (e: Exception) {
                                statusBanner = e.message
                            }
                        }
                    }
                }) { Text("Rename") }
            },
            dismissButton = { TextButton(onClick = { renameTarget = null }) { Text("Cancel") } },
        )
    }

    if (confirmDeleteBatch.isNotEmpty()) {
        AlertDialog(
            onDismissRequest = { confirmDeleteBatch = emptyList() },
            title = { Text("Delete ${confirmDeleteBatch.size} item(s)?") },
            text = { Text("Deleted files cannot be restored once removed from device storage.") },
            confirmButton = {
                TextButton(onClick = {
                    val targets = confirmDeleteBatch
                    confirmDeleteBatch = emptyList()
                    scope.launch {
                        withContext(Dispatchers.IO) { PlajahFileSystemManager.deleteEntries(context, targets) }
                        reloadDir()
                    }
                }) { Text("Delete", color = PlajahBrand.Danger) }
            },
            dismissButton = { TextButton(onClick = { confirmDeleteBatch = emptyList() }) { Text("Cancel") } },
        )
    }

    val openIdx = stageIndex
    if (openIdx != null && stageItems.isNotEmpty()) {
        UnifiedLocalMediaStage(
            items = stageItems,
            initialIndex = openIdx,
            onDismiss = { stageIndex = null },
        )
    }
}

private fun buildBreadcrumbs(root: NativeStorageRoot?, currentPath: String): List<Pair<String, String>> {
    if (root == null) return listOf("Device" to currentPath)
    if (currentPath == root.path || !currentPath.startsWith(root.path)) {
        return listOf(root.label to root.path)
    }
    val out = mutableListOf(root.label to root.path)
    val rel = currentPath.removePrefix(root.path).trimStart('/', '\\')
    if (rel.isEmpty()) return out
    var acc = root.path.trimEnd('/', '\\')
    for (seg in rel.split('/', '\\').filter { it.isNotEmpty() }) {
        acc = "$acc/$seg"
        out += seg to acc
    }
    return out
}

@Composable
private fun UnifiedLocationSidebar(
    roots: List<NativeStorageRoot>,
    activeRoot: NativeStorageRoot?,
    activeSection: WorkspaceSection,
    syncCount: Int,
    onSelectRoot: (NativeStorageRoot) -> Unit,
    onMountSaf: () -> Unit,
    onSelectSection: (WorkspaceSection) -> Unit,
    onOpenWebFiles: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .verticalScroll(rememberScrollState())
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        // THIS DEVICE
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 6.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("THIS DEVICE", color = PlajahWorkspaceColors.Muted, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                Text(
                    "+ Mount",
                    color = PlajahWorkspaceColors.Amber,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.clickable { onMountSaf() },
                )
            }
            roots.forEach { root ->
                val isAct = activeSection == WorkspaceSection.LOCAL && activeRoot?.id == root.id
                val usedFraction = if (root.totalBytes > 0L) {
                    ((root.totalBytes - root.freeBytes).toFloat() / root.totalBytes.toFloat()).coerceIn(0f, 1f)
                } else null
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (isAct) PlajahWorkspaceColors.AmberSoft else Color.Transparent)
                        .border(
                            1.dp,
                            if (isAct) PlajahWorkspaceColors.AmberBorder else Color.Transparent,
                            RoundedCornerShape(10.dp),
                        )
                        .clickable { onSelectRoot(root) }
                        .padding(horizontal = 9.dp, vertical = 7.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.weight(1f)) {
                            Icon(
                                Icons.Rounded.Storage,
                                null,
                                tint = if (isAct) PlajahWorkspaceColors.AmberText else PlajahWorkspaceColors.Muted,
                                modifier = Modifier.size(13.dp),
                            )
                            Text(
                                root.label,
                                color = if (isAct) PlajahWorkspaceColors.AmberText else PlajahWorkspaceColors.TextSoft,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Medium,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        if (root.freeBytes > 0L) {
                            Text(formatByteSize(root.freeBytes), color = PlajahWorkspaceColors.Muted, fontSize = 9.sp, fontFamily = FontFamily.Monospace)
                        }
                    }
                    if (usedFraction != null) {
                        Spacer(modifier = Modifier.height(5.dp))
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(3.dp)
                                .clip(RoundedCornerShape(99.dp))
                                .background(Color(0x1AFFFFFF)),
                        ) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth(usedFraction)
                                    .fillMaxHeight()
                                    .background(PlajahWorkspaceColors.Amber),
                            )
                        }
                    }
                }
            }
        }

        // CLOUD & CONTENT HQ
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text("CLOUD & CONTENT HQ", color = PlajahWorkspaceColors.Muted, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 6.dp))
            SidebarNavItem(
                label = "Plajah Drive",
                icon = Icons.Rounded.Cloud,
                iconTint = PlajahWorkspaceColors.SkyText,
                selected = activeSection == WorkspaceSection.DRIVE,
                onClick = { onSelectSection(WorkspaceSection.DRIVE) },
            )
            SidebarNavItem(
                label = "My Content HQ",
                icon = Icons.Rounded.Shield,
                iconTint = PlajahWorkspaceColors.PurpleText,
                selected = activeSection == WorkspaceSection.HQ,
                onClick = { onSelectSection(WorkspaceSection.HQ) },
            )
        }

        // SYNC & TRANSFERS
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text("SYNC & TRANSFERS", color = PlajahWorkspaceColors.Muted, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 6.dp))
            SidebarNavItem(
                label = "Synced Folders",
                icon = Icons.Rounded.Sync,
                iconTint = PlajahWorkspaceColors.AmberText,
                badge = if (syncCount > 0) "$syncCount live" else null,
                selected = activeSection == WorkspaceSection.SYNC,
                onClick = { onSelectSection(WorkspaceSection.SYNC) },
            )
            SidebarNavItem(
                label = "Send & Shared Links",
                icon = Icons.Rounded.Send,
                iconTint = Color(0xFFF9A8D4),
                selected = false,
                onClick = onOpenWebFiles,
            )
        }

        // LOCATIONS
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 6.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("LOCATIONS", color = PlajahWorkspaceColors.Muted, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                Text(
                    "+ Add",
                    color = PlajahWorkspaceColors.SkyText,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.clickable { onOpenWebFiles() },
                )
            }
            SidebarNavItem(
                label = "SFTP / WebDAV / SMB",
                icon = Icons.Rounded.Dns,
                iconTint = PlajahWorkspaceColors.SkyText,
                selected = activeSection == WorkspaceSection.LOCATIONS,
                onClick = { onSelectSection(WorkspaceSection.LOCATIONS) },
            )
            SidebarNavItem(
                label = "Device Mesh (LAN)",
                icon = Icons.Rounded.Devices,
                iconTint = PlajahWorkspaceColors.EmeraldText,
                selected = false,
                onClick = onOpenWebFiles,
            )
        }
    }
}

@Composable
private fun SidebarNavItem(
    label: String,
    icon: ImageVector,
    iconTint: Color,
    selected: Boolean,
    badge: String? = null,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(if (selected) PlajahWorkspaceColors.AmberSoft else Color.Transparent)
            .border(1.dp, if (selected) PlajahWorkspaceColors.AmberBorder else Color.Transparent, RoundedCornerShape(10.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 9.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Icon(icon, null, tint = iconTint, modifier = Modifier.size(14.dp))
        Text(
            label,
            color = if (selected) PlajahWorkspaceColors.AmberText else PlajahWorkspaceColors.TextSoft,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (badge != null) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(99.dp))
                    .background(PlajahWorkspaceColors.EmeraldSoft)
                    .padding(horizontal = 6.dp, vertical = 1.dp),
            ) {
                Text(badge, color = PlajahWorkspaceColors.EmeraldText, fontSize = 9.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun CompactSourcePill(
    label: String,
    active: Boolean,
    accent: Color,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(if (active) PlajahWorkspaceColors.AmberSoft else Color(0x0DFFFFFF))
            .border(1.dp, if (active) PlajahWorkspaceColors.AmberBorder else PlajahWorkspaceColors.Border, RoundedCornerShape(10.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 7.dp),
    ) {
        Text(label, color = if (active) PlajahWorkspaceColors.AmberText else accent, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun ToolbarSquareIconButton(
    icon: ImageVector,
    desc: String,
    enabled: Boolean,
    tint: Color = Color.White,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(9.dp))
            .background(Color(0x14FFFFFF))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(7.dp),
    ) {
        Icon(icon, desc, tint = if (enabled) tint else Color(0x44FFFFFF), modifier = Modifier.size(15.dp))
    }
}

@Composable
private fun ActionChipButton(
    label: String,
    icon: ImageVector,
    bg: Color,
    fg: Color,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(9.dp))
            .background(bg)
            .border(1.dp, PlajahWorkspaceColors.Border, RoundedCornerShape(9.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 9.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Icon(icon, null, tint = fg, modifier = Modifier.size(13.dp))
        Text(label, color = fg, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun KindPillBadge(entry: NativeFileEntry) {
    val richKind = PlajahFileSystemManager.classifyRichKind(entry.name, entry.mimeType)
    val (label, bg, fg) = when {
        entry.isDirectory -> Triple("DIR", PlajahWorkspaceColors.AmberSoft, Color(0xFFFCD34D))
        richKind == AndroidRichFileKind.TELA -> Triple("TELA", Color(0x336366F1), Color(0xFFA5B4FC))
        richKind == AndroidRichFileKind.COMIC -> Triple("COMIC", Color(0x33F43F5E), Color(0xFFFDA4AF))
        entry.mimeType.startsWith("image/") -> Triple("IMG", PlajahWorkspaceColors.EmeraldSoft, PlajahWorkspaceColors.EmeraldText)
        entry.mimeType.startsWith("video/") -> Triple("VID", PlajahWorkspaceColors.PurpleSoft, PlajahWorkspaceColors.PurpleText)
        entry.mimeType.startsWith("audio/") -> Triple("AUD", PlajahWorkspaceColors.AmberSoft, PlajahWorkspaceColors.AmberText)
        entry.mimeType == "application/zip" || entry.name.endsWith(".zip", ignoreCase = true) ->
            Triple("ZIP", PlajahWorkspaceColors.TealSoft, PlajahWorkspaceColors.TealText)
        else -> Triple("DOC", PlajahWorkspaceColors.SkySoft, PlajahWorkspaceColors.SkyText)
    }
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(bg)
            .padding(horizontal = 6.dp, vertical = 2.dp),
    ) {
        Text(label, color = fg, fontSize = 10.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun SplitDriveHubCard(
    syncCount: Int,
    onOpenWebFiles: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, PlajahWorkspaceColors.Border)
                .padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("SPLIT PANE • PLAJAH DRIVE", color = PlajahWorkspaceColors.PurpleText, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            Text("Close", color = PlajahWorkspaceColors.Muted, fontSize = 11.sp, modifier = Modifier.clickable { onClose() })
        }
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(PlajahWorkspaceColors.CardBg)
                    .border(1.dp, PlajahWorkspaceColors.Border, RoundedCornerShape(12.dp))
                    .padding(12.dp),
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Cloud B2 & Expiring Send", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    Text("$syncCount paired sync folder(s) ready for cross-device reconciliation.", color = PlajahWorkspaceColors.Muted, fontSize = 11.sp)
                }
            }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(PlajahWorkspaceColors.PurpleSoft)
                    .border(1.dp, PlajahWorkspaceColors.PurpleBorder, RoundedCornerShape(10.dp))
                    .clickable { onOpenWebFiles() }
                    .padding(vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text("Open Full Cloud Drive Split", color = PlajahWorkspaceColors.PurpleText, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun DockedQuickViewStagePane(
    context: android.content.Context,
    entry: NativeFileEntry,
    playlist: List<UnifiedStageItem>,
    currentIndex: Int,
    onSelectPlaylistItem: (UnifiedStageItem) -> Unit,
    onExpand: () -> Unit,
    onShare: () -> Unit,
    onRename: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        // Stage Header matching WinUI 3 Quick-View Stage
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(entry.name, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${entry.toStageItem().type.name} · ${formatByteSize(entry.size)} · Unified Stage", color = PlajahWorkspaceColors.Muted, fontSize = 10.sp)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color(0x14FFFFFF))
                        .border(1.dp, PlajahWorkspaceColors.Border, RoundedCornerShape(8.dp))
                        .clickable { onExpand() }
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                ) {
                    Text("Expand", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                }
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color(0x14FFFFFF))
                        .clickable { onClose() }
                        .padding(horizontal = 7.dp, vertical = 4.dp),
                ) {
                    Text("Close", color = PlajahWorkspaceColors.Muted, fontSize = 10.sp)
                }
            }
        }

        // Stage Preview Box (Unified Plajah Rich Motion / Chora / Tela / Photo / Video)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .clip(RoundedCornerShape(14.dp))
                .background(PlajahWorkspaceColors.StageCanvas)
                .border(1.dp, PlajahWorkspaceColors.Border, RoundedCornerShape(14.dp)),
            contentAlignment = Alignment.Center,
        ) {
            AndroidRichMediaPreviewSurface(
                context = context,
                entry = entry,
                autoplayAudio = true,
                onExpand = onExpand,
                modifier = Modifier.fillMaxSize().padding(8.dp),
            )
        }

        // Primary Actions matching WinUI 3
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(10.dp))
                    .background(PlajahWorkspaceColors.Amber)
                    .clickable { onExpand() }
                    .padding(vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text("Open Stage", color = Color.Black, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(10.dp))
                    .background(Color(0x14FFFFFF))
                    .border(1.dp, PlajahWorkspaceColors.Border, RoundedCornerShape(10.dp))
                    .clickable { onShare() }
                    .padding(vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text("Share", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
            }
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .background(Color(0x14FFFFFF))
                    .border(1.dp, PlajahWorkspaceColors.Border, RoundedCornerShape(10.dp))
                    .clickable { onRename() }
                    .padding(horizontal = 10.dp, vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text("Rename", color = Color.White, fontSize = 11.sp)
            }
        }

        // Bottom Prev / Filmstrip / Next strip matching WinUI 3
        if (playlist.isNotEmpty()) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    "Prev",
                    color = if (currentIndex > 0) Color.White else PlajahWorkspaceColors.Muted,
                    fontSize = 10.sp,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color(0x14FFFFFF))
                        .clickable(enabled = currentIndex > 0) {
                            if (currentIndex > 0) onSelectPlaylistItem(playlist[currentIndex - 1])
                        }
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                )
                LazyRow(modifier = Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    items(playlist, key = { it.id }) { item ->
                        val sel = item.pathOrUri == entry.path
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(if (sel) PlajahWorkspaceColors.AmberSoft else Color(0x0DFFFFFF))
                                .border(1.dp, if (sel) PlajahWorkspaceColors.AmberBorder else PlajahWorkspaceColors.Border, RoundedCornerShape(8.dp))
                                .clickable { onSelectPlaylistItem(item) }
                                .padding(horizontal = 8.dp, vertical = 6.dp),
                        ) {
                            Text(
                                item.name,
                                color = if (sel) PlajahWorkspaceColors.AmberText else PlajahWorkspaceColors.TextSoft,
                                fontSize = 10.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
                Text(
                    "Next",
                    color = if (currentIndex >= 0 && currentIndex < playlist.lastIndex) Color.White else PlajahWorkspaceColors.Muted,
                    fontSize = 10.sp,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color(0x14FFFFFF))
                        .clickable(enabled = currentIndex >= 0 && currentIndex < playlist.lastIndex) {
                            if (currentIndex >= 0 && currentIndex < playlist.lastIndex) onSelectPlaylistItem(playlist[currentIndex + 1])
                        }
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                )
            }
        }
    }
}

@Composable
private fun EntryIconOrThumb(
    context: android.content.Context,
    entry: NativeFileEntry,
    modifier: Modifier = Modifier,
) {
    val boxMod = modifier
        .clip(RoundedCornerShape(10.dp))
        .background(Color(0xFF141724))

    if (entry.isDirectory) {
        Box(modifier = boxMod, contentAlignment = Alignment.Center) {
            Icon(Icons.Rounded.Folder, null, tint = PlajahWorkspaceColors.Amber)
        }
        return
    }

    val richKind = PlajahFileSystemManager.classifyRichKind(entry.name, entry.mimeType)
    if (richKind == AndroidRichFileKind.PHOTO || richKind == AndroidRichFileKind.VIDEO) {
        val uri = if (entry.path.startsWith("content://")) Uri.parse(entry.path) else Uri.fromFile(File(entry.path))
        LocalBitmapThumbnail(
            context = context,
            uri = uri,
            isVideo = richKind == AndroidRichFileKind.VIDEO,
            maxDim = 240,
            modifier = boxMod,
        )
        return
    }

    if (richKind == AndroidRichFileKind.COMIC) {
        val coverBmp by produceState<Bitmap?>(null, entry.path) {
            value = withContext(Dispatchers.IO) {
                PlajahFileSystemManager.extractComicPreviewPages(context, entry.path, maxPages = 1, maxDim = 240)
                    ?.bitmaps
                    ?.firstOrNull()
            }
        }
        Box(modifier = boxMod, contentAlignment = Alignment.Center) {
            if (coverBmp != null) {
                Image(
                    bitmap = coverBmp!!.asImageBitmap(),
                    contentDescription = entry.name,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                Icon(Icons.Rounded.MenuBook, null, tint = Color(0xFFFDA4AF))
            }
        }
        return
    }

    if (richKind == AndroidRichFileKind.TELA) {
        Box(
            modifier = boxMod.background(
                Brush.linearGradient(listOf(Color(0x336366F1), Color(0x28A855F7), Color(0x1FF59E0B))),
            ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Rounded.AutoAwesome, null, tint = Color(0xFFA5B4FC))
        }
        return
    }

    val (icon, tint) = when {
        richKind == AndroidRichFileKind.AUDIO -> Icons.Rounded.MusicNote to Color(0xFFFB923C)
        entry.mimeType == "application/pdf" -> Icons.Rounded.PictureAsPdf to PlajahWorkspaceColors.SkyText
        richKind == AndroidRichFileKind.ARCHIVE -> Icons.Rounded.FolderZip to PlajahWorkspaceColors.TealText
        entry.mimeType.startsWith("text/") || entry.mimeType == "application/json" ->
            Icons.Rounded.Description to PlajahWorkspaceColors.SkyText
        else -> Icons.Rounded.InsertDriveFile to PlajahWorkspaceColors.PurpleText
    }
    Box(modifier = boxMod, contentAlignment = Alignment.Center) {
        Icon(icon, null, tint = tint)
    }
}

@Composable
private fun AndroidRichMediaPreviewSurface(
    context: android.content.Context,
    entry: NativeFileEntry,
    autoplayAudio: Boolean,
    onExpand: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val richKind = remember(entry.path, entry.mimeType) {
        PlajahFileSystemManager.classifyRichKind(entry.name, entry.mimeType)
    }
    val uri = remember(entry.path) {
        if (entry.path.startsWith("content://")) Uri.parse(entry.path) else Uri.fromFile(File(entry.path))
    }

    when (richKind) {
        AndroidRichFileKind.PHOTO -> {
            Box(
                modifier = modifier
                    .clip(RoundedCornerShape(10.dp))
                    .clickable { onExpand() },
                contentAlignment = Alignment.Center,
            ) {
                LocalBitmapThumbnail(
                    context = context,
                    uri = uri,
                    isVideo = false,
                    maxDim = 720,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }

        AndroidRichFileKind.COMIC -> {
            val comicData by produceState<ComicRichPages?>(null, entry.path) {
                value = withContext(Dispatchers.IO) {
                    PlajahFileSystemManager.extractComicPreviewPages(context, entry.path, maxPages = 4, maxDim = 460)
                }
            }
            var pageIdx by remember(entry.path) { mutableStateOf(0) }
            var motionPlaying by remember(entry.path) { mutableStateOf(true) }
            val inf = rememberInfiniteTransition(label = "comicKenBurns")
            val zoom by inf.animateFloat(
                initialValue = 1.0f,
                targetValue = 1.09f,
                animationSpec = infiniteRepeatable(tween(2600, easing = LinearEasing), RepeatMode.Reverse),
                label = "comicScale",
            )
            val driftX by inf.animateFloat(
                initialValue = -6f,
                targetValue = 6f,
                animationSpec = infiniteRepeatable(tween(3100, easing = LinearEasing), RepeatMode.Reverse),
                label = "comicDrift",
            )

            LaunchedEffect(comicData, motionPlaying) {
                val pages = comicData?.bitmaps ?: emptyList()
                while (motionPlaying && pages.size > 1) {
                    delay(1350L)
                    pageIdx = (pageIdx + 1) % pages.size
                }
            }

            Box(
                modifier = modifier
                    .clip(RoundedCornerShape(10.dp))
                    .background(Color.Black),
                contentAlignment = Alignment.Center,
            ) {
                val pages = comicData?.bitmaps ?: emptyList()
                if (pages.isNotEmpty()) {
                    val safeIdx = pageIdx.coerceIn(0, pages.lastIndex)
                    Image(
                        bitmap = pages[safeIdx].asImageBitmap(),
                        contentDescription = entry.name,
                        contentScale = ContentScale.Fit,
                        modifier = Modifier
                            .fillMaxSize()
                            .clickable { onExpand() }
                            .graphicsLayer {
                                if (motionPlaying) {
                                    scaleX = zoom
                                    scaleY = zoom
                                    translationX = driftX
                                }
                            },
                    )
                    Row(
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(8.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(Color(0xB3000000))
                                .padding(horizontal = 6.dp, vertical = 3.dp),
                        ) {
                            Text(
                                "${comicData?.totalPages ?: pages.size} PAGES · MOTION",
                                color = Color(0xFFFDA4AF),
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                        comicData?.sfxLabels?.take(2)?.forEach { sfx ->
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(PlajahWorkspaceColors.Amber)
                                    .padding(horizontal = 6.dp, vertical = 3.dp),
                            ) {
                                Text(sfx, color = Color.Black, fontSize = 9.sp, fontWeight = FontWeight.Black)
                            }
                        }
                    }
                    if (pages.size > 1) {
                        Row(
                            modifier = Modifier
                                .align(Alignment.BottomCenter)
                                .fillMaxWidth()
                                .background(Color(0xAA000000))
                                .padding(horizontal = 10.dp, vertical = 6.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text("${safeIdx + 1} / ${pages.size}", color = Color.White, fontSize = 10.sp, fontFamily = FontFamily.Monospace)
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(Color(0x26FFFFFF))
                                    .clickable { motionPlaying = !motionPlaying }
                                    .padding(horizontal = 8.dp, vertical = 3.dp),
                            ) {
                                Text(
                                    if (motionPlaying) "Pause Motion" else "Play Motion",
                                    color = Color.White,
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.SemiBold,
                                )
                            }
                        }
                    }
                } else {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Rounded.MenuBook, null, tint = Color(0xFFFDA4AF), modifier = Modifier.size(34.dp))
                        Spacer(modifier = Modifier.height(6.dp))
                        Text("Comic Archive Ready", color = PlajahWorkspaceColors.Muted, fontSize = 11.sp)
                    }
                }
            }
        }

        AndroidRichFileKind.TELA -> {
            val telaSummary by produceState<TelaRichSummary?>(null, entry.path) {
                value = withContext(Dispatchers.IO) {
                    PlajahFileSystemManager.extractTelaSummary(context, entry.path)
                }
            }
            val inf = rememberInfiniteTransition(label = "telaReveal")
            val floatY by inf.animateFloat(
                initialValue = -3f,
                targetValue = 3f,
                animationSpec = infiniteRepeatable(tween(1900, easing = LinearEasing), RepeatMode.Reverse),
                label = "telaFloat",
            )
            Column(
                modifier = modifier
                    .clip(RoundedCornerShape(10.dp))
                    .background(Brush.linearGradient(listOf(Color(0x266366F1), Color(0x1EA855F7), Color(0xFF0A0D16))))
                    .border(1.dp, Color(0x55818CF8), RoundedCornerShape(10.dp))
                    .clickable { onExpand() }
                    .padding(12.dp)
                    .graphicsLayer {
                        if (telaSummary?.hasAnimation == true) {
                            translationY = floatY
                        }
                    },
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.weight(1f)) {
                        Icon(Icons.Rounded.AutoAwesome, null, tint = Color(0xFFA5B4FC), modifier = Modifier.size(16.dp))
                        Text(
                            telaSummary?.title ?: entry.name,
                            color = Color.White,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(Color(0x336366F1))
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                    ) {
                        Text(
                            "${telaSummary?.frameCount ?: 1} FRAME(S)",
                            color = Color(0xFFC7D2FE),
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
                val labels = telaSummary?.motionLabels ?: emptyList()
                if (labels.isNotEmpty()) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
                        labels.forEach { lbl ->
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(PlajahWorkspaceColors.AmberSoft)
                                    .border(1.dp, PlajahWorkspaceColors.AmberBorder, RoundedCornerShape(6.dp))
                                    .padding(horizontal = 7.dp, vertical = 3.dp),
                            ) {
                                Text(lbl, color = PlajahWorkspaceColors.AmberText, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
                if (!telaSummary?.headline.isNullOrBlank()) {
                    Text(
                        telaSummary!!.headline!!,
                        color = PlajahWorkspaceColors.TextSoft,
                        fontSize = 11.sp,
                        maxLines = 4,
                        overflow = TextOverflow.Ellipsis,
                    )
                } else {
                    Text(
                        if (telaSummary?.hasAnimation == true) "Animated Tela canvas ready for Stage inspect." else "Plajah Tela document preview ready.",
                        color = PlajahWorkspaceColors.Muted,
                        fontSize = 11.sp,
                    )
                }
            }
        }

        AndroidRichFileKind.VIDEO -> {
            val exo = remember { ExoPlayer.Builder(context).build().apply { repeatMode = Player.REPEAT_MODE_ONE; volume = 0f } }
            var playing by remember { mutableStateOf(true) }
            DisposableEffect(exo) {
                onDispose { exo.release() }
            }
            LaunchedEffect(exo, uri) {
                exo.setMediaItem(MediaItem.fromUri(uri))
                exo.prepare()
                exo.playWhenReady = true
                playing = true
            }
            Box(
                modifier = modifier
                    .clip(RoundedCornerShape(10.dp))
                    .background(Color.Black),
            ) {
                AndroidView(
                    factory = { ctx ->
                        PlayerView(ctx).apply {
                            player = exo
                            useController = false
                        }
                    },
                    modifier = Modifier.fillMaxSize().clickable {
                        if (playing) exo.pause() else exo.play()
                        playing = !playing
                    },
                )
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(8.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(Color(0xAA000000))
                        .clickable { onExpand() }
                        .padding(horizontal = 7.dp, vertical = 3.dp),
                ) {
                    Text("LIVE LOOP · STAGE", color = PlajahWorkspaceColors.PurpleText, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        AndroidRichFileKind.AUDIO -> {
            val exo = remember { ExoPlayer.Builder(context).build() }
            var playing by remember { mutableStateOf(autoplayAudio) }
            var muted by remember { mutableStateOf(false) }
            var posMs by remember { mutableStateOf(0L) }
            var durMs by remember { mutableStateOf(1L) }

            DisposableEffect(exo) {
                val listener = object : Player.Listener {
                    override fun onIsPlayingChanged(isPlaying: Boolean) { playing = isPlaying }
                }
                exo.addListener(listener)
                onDispose {
                    exo.removeListener(listener)
                    exo.release()
                }
            }

            LaunchedEffect(exo, uri, autoplayAudio) {
                exo.setMediaItem(MediaItem.fromUri(uri))
                exo.prepare()
                exo.playWhenReady = autoplayAudio
            }

            LaunchedEffect(exo, playing) {
                while (true) {
                    posMs = exo.currentPosition.coerceAtLeast(0L)
                    durMs = exo.duration.coerceAtLeast(1L)
                    delay(200L)
                }
            }

            val inf = rememberInfiniteTransition(label = "choraWave")
            val wavePhase by inf.animateFloat(
                initialValue = 0f,
                targetValue = 6.283185f,
                animationSpec = infiniteRepeatable(tween(1500, easing = LinearEasing)),
                label = "phase",
            )

            Column(
                modifier = modifier
                    .clip(RoundedCornerShape(10.dp))
                    .background(Brush.verticalGradient(listOf(Color(0xFF1A0D18), Color(0xFF0A0912))))
                    .border(1.dp, Color(0x44FF8C00), RoundedCornerShape(10.dp))
                    .padding(10.dp),
                verticalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("PLAJAH CHORA MINI DECK", color = Color(0xFFFB923C), fontSize = 9.sp, fontWeight = FontWeight.Bold)
                        Text(entry.name.substringBeforeLast('.'), color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Text(
                        "${posMs / 1000}s / ${durMs / 1000}s",
                        color = PlajahWorkspaceColors.Muted,
                        fontSize = 10.sp,
                        fontFamily = FontFamily.Monospace,
                    )
                }

                // Chora Waveform & Visualizer Canvas
                val seedHash = remember(entry.name) { entry.name.hashCode() }
                Canvas(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(54.dp),
                ) {
                    val bars = 36
                    val barW = size.width / (bars * 1.5f)
                    val gap = (size.width - bars * barW) / (bars - 1).coerceAtLeast(1)
                    val progress = (posMs.toFloat() / durMs.toFloat()).coerceIn(0f, 1f)
                    for (i in 0 until bars) {
                        val base = 0.25f + 0.45f * abs(sin(((seedHash + i) * 0.7f).toDouble())).toFloat()
                        val mod = if (playing) 0.15f + 0.35f * abs(sin((wavePhase + i * 0.42f).toDouble())).toFloat() else 0f
                        val hFrac = (base + mod).coerceIn(0.14f, 0.96f)
                        val barH = size.height * hFrac
                        val x = i * (barW + gap)
                        val played = (i.toFloat() / bars.toFloat()) <= progress
                        val barColor = if (played) Color(0xFFFF8C00) else Color(0x4DFF4D6D)
                        drawRoundRect(
                            color = barColor,
                            topLeft = Offset(x, (size.height - barH) / 2f),
                            size = Size(barW, barH),
                            cornerRadius = CornerRadius(4f, 4f),
                        )
                    }
                }

                Slider(
                    value = (posMs.toFloat() / durMs.toFloat()).coerceIn(0f, 1f),
                    onValueChange = { ratio -> exo.seekTo((ratio * durMs).toLong()) },
                    colors = SliderDefaults.colors(
                        thumbColor = Color(0xFFFF8C00),
                        activeTrackColor = Color(0xFFFF8C00),
                    ),
                    modifier = Modifier.height(22.dp),
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = { exo.seekTo((exo.currentPosition - 10_000L).coerceAtLeast(0L)) }, modifier = Modifier.size(30.dp)) {
                        Icon(Icons.Rounded.Replay10, "-10s", tint = Color.White, modifier = Modifier.size(18.dp))
                    }
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(99.dp))
                            .background(Brush.horizontalGradient(listOf(Color(0xFFFF8C00), Color(0xFFFF4D6D))))
                            .clickable { if (playing) exo.pause() else exo.play() }
                            .padding(horizontal = 14.dp, vertical = 6.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Icon(if (playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, null, tint = Color.Black, modifier = Modifier.size(16.dp))
                            Text(if (playing) "Pause" else "Play", color = Color.Black, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                    IconButton(onClick = { exo.seekTo(exo.currentPosition + 10_000L) }, modifier = Modifier.size(30.dp)) {
                        Icon(Icons.Rounded.Forward10, "+10s", tint = Color.White, modifier = Modifier.size(18.dp))
                    }
                    IconButton(
                        onClick = {
                            muted = !muted
                            exo.volume = if (muted) 0f else 1f
                        },
                        modifier = Modifier.size(30.dp),
                    ) {
                        Icon(if (muted) Icons.Rounded.VolumeOff else Icons.Rounded.VolumeUp, "Mute", tint = PlajahWorkspaceColors.TextSoft, modifier = Modifier.size(16.dp))
                    }
                }
            }
        }

        else -> {
            Box(modifier = modifier.clickable { onExpand() }, contentAlignment = Alignment.Center) {
                EntryIconOrThumb(context = context, entry = entry, modifier = Modifier.size(72.dp))
            }
        }
    }
}
