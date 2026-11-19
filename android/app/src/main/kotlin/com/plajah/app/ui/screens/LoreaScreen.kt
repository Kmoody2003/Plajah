package com.plajah.app.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.plajah.app.data.ClassicBook
import com.plajah.app.data.PlatformCatalog
import com.plajah.app.data.PlatformItem
import com.plajah.app.ui.foldable.rememberFoldableInfo
import com.plajah.app.ui.theme.BrandDisplay
import com.plajah.app.ui.theme.PlajahBrand
import kotlinx.coroutines.CancellationException

private data class ReaderSkin(val id: String, val label: String, val bg: Color, val ink: Color, val muted: Color)

private val LOREA_SKINS = listOf(
    ReaderSkin("vellum", "Vellum", Color(0xFFF4EEE2), Color(0xFF221C14), Color(0xFF6B5D4A)),
    ReaderSkin("sepia", "Sepia", Color(0xFFEADCC2), Color(0xFF2B2115), Color(0xFF6D5840)),
    ReaderSkin("night", "Night", Color(0xFF100E16), Color(0xFFEDE8F5), Color(0xFF9F96B0)),
    ReaderSkin("ink", "OLED Ink", Color(0xFF030206), Color(0xFFF3EFE8), Color(0xFF8C8598)),
)

/**
 * 1-for-1 Native Jetpack Compose rebuild of Plajah Lorea (BookTab.tsx + BookReader.tsx).
 * - Tabs: Classics (live Gutendex public-domain shelf), Marketplace (Firestore Plajah Books), Writer's Desk
 * - Genre filter rail (All Classics, Philosophy, Drama, Poetry, Fiction, Mystery, Sci-Fi, Fantasy, History)
 * - Built-in Native Book Reader with Vellum/Sepia/Night/OLED skins & font-size controls
 * - Foldable Z Fold / Pixel Fold Book-Mode dual-pane reading support!
 */
@Composable
fun LoreaScreen(
    onOpenPlatform: (String) -> Unit,
) {
    val foldable = rememberFoldableInfo()
    val pad = foldable.horizontalPadding

    var activeTab by rememberSaveable { mutableStateOf("CLASSICS") } // CLASSICS | MARKETPLACE | DESK
    var genre by rememberSaveable { mutableStateOf("") }
    var search by remember { mutableStateOf("") }
    var classics by remember { mutableStateOf<List<ClassicBook>>(emptyList()) }
    var marketBooks by remember { mutableStateOf<List<PlatformItem>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    // Active reader state
    var openClassic by remember { mutableStateOf<ClassicBook?>(null) }
    var openMarket by remember { mutableStateOf<PlatformItem?>(null) }
    var readerText by remember { mutableStateOf("") }
    var readerLoading by remember { mutableStateOf(false) }
    var skinId by rememberSaveable { mutableStateOf("night") }
    var fontSizeSp by rememberSaveable { mutableIntStateOf(16) }

    val genres = remember {
        listOf(
            "" to "All Classics",
            "philosophy" to "Philosophy",
            "drama" to "Drama",
            "poetry" to "Poetry",
            "fiction" to "Fiction",
            "mystery" to "Mystery",
            "science fiction" to "Sci-Fi",
            "fantasy" to "Fantasy",
            "history" to "History",
        )
    }

    LaunchedEffect(activeTab, genre) {
        loading = true
        error = null
        try {
            if (activeTab == "CLASSICS") {
                classics = PlatformCatalog.loadClassicBooks(topic = genre, search = search)
            } else if (activeTab == "MARKETPLACE") {
                marketBooks = PlatformCatalog.load("lorea")
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = e.message
        } finally {
            loading = false
        }
    }

    LaunchedEffect(openClassic?.id) {
        val book = openClassic ?: return@LaunchedEffect
        readerLoading = true
        readerText = ""
        readerText = PlatformCatalog.fetchPlainTextExcerpt(book.textUrl)
            .ifBlank { "Full plain-text edition could not be streamed natively. Tap 'Open in Classic Reader' to read the EPUB/PDF edition." }
        readerLoading = false
    }

    BackHandler(openClassic != null || openMarket != null) {
        openClassic = null
        openMarket = null
    }

    val skin = LOREA_SKINS.firstOrNull { it.id == skinId } ?: LOREA_SKINS[2]

    // Native Reader view
    if ((openClassic != null || openMarket != null) && !foldable.supportsDualPane) {
        LoreaNativeReaderPane(
            title = openClassic?.title ?: openMarket?.title.orEmpty(),
            author = openClassic?.author ?: openMarket?.creator.orEmpty(),
            body = if (openClassic != null) readerText else openMarket?.description.orEmpty().ifBlank { "Open in Classic Lorea to read full formatted chapters and Living Book animations." },
            loading = readerLoading,
            skin = skin,
            fontSizeSp = fontSizeSp,
            onSkinChange = { skinId = it },
            onFontSizeDelta = { fontSizeSp = (fontSizeSp + it).coerceIn(13, 26) },
            onBack = { openClassic = null; openMarket = null },
            onOpenClassic = { onOpenPlatform(openMarket?.platformUrl ?: "https://plajah.com/?view=books") },
        )
        return
    }

    val libraryPane: @Composable () -> Unit = {
        Column(
            Modifier
                .fillMaxSize()
                .background(Color(0xFF07050B)),
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
                        "PLAJAH LOREA",
                        fontFamily = BrandDisplay,
                        fontSize = if (foldable.isUltraCompact) 17.sp else 20.sp,
                        fontWeight = FontWeight.Black,
                        letterSpacing = 1.sp,
                        color = Color.White,
                    )
                    Text(
                        "BOOKS, CLASSICS, COMICS & WRITER'S DESK",
                        fontSize = 8.5.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.2.sp,
                        color = Color(0xFFE2C27E),
                        maxLines = 1,
                    )
                }
                Row(
                    Modifier
                        .clip(CircleShape)
                        .background(Color.White.copy(0.07f))
                        .padding(3.dp),
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    listOf("CLASSICS" to "Classics", "MARKETPLACE" to "Plajah", "DESK" to "Desk").forEach { (id, label) ->
                        val active = activeTab == id
                        Box(
                            Modifier
                                .clip(CircleShape)
                                .background(
                                    if (active) Brush.linearGradient(listOf(PlajahBrand.Purple, PlajahBrand.Orange))
                                    else Brush.linearGradient(listOf(Color.Transparent, Color.Transparent))
                                )
                                .clickable { activeTab = id }
                                .padding(horizontal = 10.dp, vertical = 5.dp),
                        ) {
                            Text(label.uppercase(), fontSize = 8.5.sp, fontWeight = FontWeight.Black, color = Color.White.copy(if (active) 1f else 0.65f), maxLines = 1)
                        }
                    }
                }
            }

            if (activeTab == "DESK") {
                Column(
                    Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(pad),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Surface(
                        shape = RoundedCornerShape(18.dp),
                        color = Color(0xFF14101E),
                        border = BorderStroke(1.dp, Color(0x44E2C27E)),
                    ) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("WRITER'S DESK & LIVING BOOKS", fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 1.8.sp, color = Color(0xFFE2C27E))
                            Text("Write novels, screenplays, comics, and interactive Tela books.", fontFamily = BrandDisplay, fontSize = 18.sp, fontWeight = FontWeight.Black, color = Color.White)
                            Text("Authoring, comic panel layouts, and EPUB/print export run in the full Lorea Studio.", fontSize = 12.5.sp, color = Color.White.copy(0.7f))
                            Button(
                                onClick = { onOpenPlatform("https://plajah.com/?view=books") },
                                shape = CircleShape,
                                colors = ButtonDefaults.buttonColors(containerColor = PlajahBrand.Orange, contentColor = Color.Black),
                            ) {
                                Text("Open Writer's Desk in Classic ↗", fontWeight = FontWeight.Black, fontSize = 12.sp)
                            }
                        }
                    }
                }
            } else {
                if (activeTab == "CLASSICS") {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState())
                            .padding(horizontal = pad, vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        genres.forEach { (id, label) ->
                            val active = genre == id
                            Box(
                                Modifier
                                    .height(30.dp)
                                    .clip(CircleShape)
                                    .background(if (active) Color(0xFFE2C27E) else Color.White.copy(0.06f))
                                    .clickable { genre = id }
                                    .padding(horizontal = 12.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(label.uppercase(), fontSize = 9.sp, fontWeight = FontWeight.Black, color = if (active) Color.Black else Color.White.copy(0.7f), maxLines = 1, softWrap = false)
                            }
                        }
                    }
                }

                OutlinedTextField(
                    value = search,
                    onValueChange = { search = it },
                    placeholder = { Text("Search books, authors, subjects…", fontSize = 12.sp, color = Color.White.copy(0.4f), maxLines = 1) },
                    leadingIcon = { Icon(Icons.Rounded.Search, null, Modifier.size(16.dp)) },
                    singleLine = true,
                    shape = CircleShape,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = pad, vertical = 4.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Color(0xFFE2C27E),
                        unfocusedBorderColor = Color.White.copy(0.12f),
                    ),
                )

                if (loading) LinearProgressIndicator(Modifier.fillMaxWidth(), color = Color(0xFFE2C27E))
                error?.let { Text(it, color = PlajahBrand.Orange, fontSize = 11.sp, modifier = Modifier.padding(horizontal = pad)) }

                val cols = if (foldable.supportsDualPane) 2 else foldable.posterGridColumns
                LazyVerticalGrid(
                    columns = GridCells.Fixed(cols),
                    contentPadding = PaddingValues(pad),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                    modifier = Modifier.weight(1f),
                ) {
                    if (activeTab == "CLASSICS") {
                        val shown = classics.filter {
                            search.isBlank() || it.title.contains(search, true) || it.author.contains(search, true)
                        }
                        items(shown, key = { it.id }) { book ->
                            Column(
                                Modifier
                                    .fillMaxWidth()
                                    .clickable { openMarket = null; openClassic = book },
                            ) {
                                Box(
                                    Modifier
                                        .fillMaxWidth()
                                        .aspectRatio(2f / 3f)
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(Color(0xFF1A1424))
                                        .border(1.dp, if (openClassic?.id == book.id) Color(0xFFE2C27E) else Color.White.copy(0.08f), RoundedCornerShape(12.dp)),
                                ) {
                                    PlatformArt(book.coverUrl, book.title, Modifier.fillMaxSize(), square = false)
                                }
                                Text(book.title, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 6.dp))
                                Text(book.author, fontSize = 10.sp, color = Color(0xFFE2C27E).copy(0.8f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    } else {
                        val shown = marketBooks.filter {
                            search.isBlank() || it.title.contains(search, true) || it.creator.contains(search, true)
                        }
                        items(shown, key = { it.id }) { item ->
                            Column(
                                Modifier
                                    .fillMaxWidth()
                                    .clickable { openClassic = null; openMarket = item },
                            ) {
                                Box(
                                    Modifier
                                        .fillMaxWidth()
                                        .aspectRatio(2f / 3f)
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(Color(0xFF1A1424)),
                                ) {
                                    PlatformArt(item.image, item.title, Modifier.fillMaxSize(), square = false)
                                }
                                Text(item.title, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 6.dp))
                                Text(item.creator.ifBlank { "Plajah Author" }, fontSize = 10.sp, color = PlajahBrand.Orange, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                }
            }
        }
    }

    if (foldable.supportsDualPane) {
        Row(Modifier.fillMaxSize()) {
            Box(Modifier.weight(0.50f).fillMaxHeight()) { libraryPane() }
            Box(Modifier.width(foldable.hingeWidthDp.coerceAtLeast(1.dp)).fillMaxHeight().background(Color.White.copy(0.12f)))
            Box(Modifier.weight(0.50f).fillMaxHeight()) {
                val title = openClassic?.title ?: openMarket?.title ?: classics.firstOrNull()?.title ?: "Select a book"
                val author = openClassic?.author ?: openMarket?.creator ?: classics.firstOrNull()?.author.orEmpty()
                val body = when {
                    openClassic != null -> readerText
                    openMarket != null -> openMarket!!.description.ifBlank { "Open in Classic Lorea to read full chapters." }
                    else -> "Pick any title on the left to open the native Vellum Book Reader right beside the shelf."
                }
                LoreaNativeReaderPane(
                    title = title,
                    author = author,
                    body = body,
                    loading = readerLoading,
                    skin = skin,
                    fontSizeSp = fontSizeSp,
                    onSkinChange = { skinId = it },
                    onFontSizeDelta = { fontSizeSp = (fontSizeSp + it).coerceIn(13, 26) },
                    onBack = { openClassic = null; openMarket = null },
                    onOpenClassic = { onOpenPlatform(openMarket?.platformUrl ?: "https://plajah.com/?view=books") },
                )
            }
        }
    } else {
        libraryPane()
    }
}

@Composable
private fun LoreaNativeReaderPane(
    title: String,
    author: String,
    body: String,
    loading: Boolean,
    skin: ReaderSkin,
    fontSizeSp: Int,
    onSkinChange: (String) -> Unit,
    onFontSizeDelta: (Int) -> Unit,
    onBack: () -> Unit,
    onOpenClassic: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxSize()
            .background(skin.bg),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            IconButton(onClick = onBack, modifier = Modifier.size(36.dp)) {
                Icon(Icons.Rounded.ArrowBack, "Back", tint = skin.ink)
            }
            Column(Modifier.weight(1f)) {
                Text(title, fontSize = 13.sp, fontWeight = FontWeight.Black, color = skin.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (author.isNotBlank()) Text(author, fontSize = 10.sp, color = skin.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            IconButton(onClick = { onFontSizeDelta(-2) }, modifier = Modifier.size(32.dp)) {
                Text("A-", fontSize = 12.sp, fontWeight = FontWeight.Black, color = skin.ink)
            }
            IconButton(onClick = { onFontSizeDelta(2) }, modifier = Modifier.size(32.dp)) {
                Text("A+", fontSize = 13.sp, fontWeight = FontWeight.Black, color = skin.ink)
            }
            IconButton(onClick = onOpenClassic, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Rounded.OpenInNew, "Open Classic", tint = skin.muted, modifier = Modifier.size(17.dp))
            }
        }

        // Paper skin switcher strip
        Row(
            Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 12.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            LOREA_SKINS.forEach { s ->
                Surface(
                    shape = CircleShape,
                    color = s.bg,
                    border = BorderStroke(if (s.id == skin.id) 2.dp else 1.dp, if (s.id == skin.id) PlajahBrand.Orange else skin.muted.copy(0.4f)),
                    modifier = Modifier.clickable { onSkinChange(s.id) },
                ) {
                    Text(s.label, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = s.ink, modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp))
                }
            }
        }

        HorizontalDivider(color = skin.muted.copy(0.2f))

        if (loading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = PlajahBrand.Orange)
            }
        } else {
            Column(
                Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 18.dp),
            ) {
                Text(
                    body,
                    fontFamily = FontFamily.Serif,
                    fontSize = fontSizeSp.sp,
                    lineHeight = (fontSizeSp * 1.58f).sp,
                    color = skin.ink,
                )
            }
        }
    }
}
