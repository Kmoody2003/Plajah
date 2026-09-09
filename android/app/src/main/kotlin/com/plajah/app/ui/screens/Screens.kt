package com.plajah.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoStories
import androidx.compose.material.icons.rounded.Bookmark
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.plajah.app.ui.components.AccentButton
import com.plajah.app.ui.components.BrandButton
import com.plajah.app.ui.components.Eyebrow
import com.plajah.app.ui.components.GlassCard
import com.plajah.app.ui.components.LiveBadge
import com.plajah.app.ui.components.MediaTile
import com.plajah.app.ui.components.SectionHeader
import com.plajah.app.ui.components.TileArt
import com.plajah.app.ui.nav.Destination
import com.plajah.app.ui.theme.PlajahRadius
import com.plajah.app.ui.theme.PlajahTheme

// ── Sample content (a scaffold shows what it does, not an empty shell) ─────────
private data class Item(val title: String, val subtitle: String, val art: Int, val live: Boolean = false)

private val continueItems = listOf(
    Item("Midnight Sessions", "Chora • 3 tracks left", 0),
    Item("The Long Way Home", "Taleo • 22 min left", 1),
    Item("Ink & Ash — Ch. 7", "Lorea • 68%", 4),
    Item("Detroit After Dark", "Reello • Episode 4", 2),
)
private val liveItems = listOf(
    Item("Aurora — Live Set", "1.2k watching", 2, live = true),
    Item("Sunday Service", "Elevate • live", 3, live = true),
    Item("Pixels VJ Room", "Spatial • live", 5, live = true),
)
private val picks = listOf(
    Item("Neon Bloom", "New album", 0),
    Item("Signal Fires", "EP", 1),
    Item("Glasshouse", "Single", 3),
    Item("Undertow", "Mixtape", 5),
    Item("Paper Moons", "Album", 4),
)

/**
 * FRONT ROW (web view DASHBOARD) — the home surface. LazyColumn of a hero plus
 * horizontally-scrolling rails on phones; on Android-laptop windows the hero
 * grows and the rails breathe wider (driven by [wide]).
 */
@Composable
fun HomeScreen(wide: Boolean, onOpenClassic: () -> Unit) {
    val pad = if (wide) 32.dp else 20.dp
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = pad, end = pad, top = 8.dp, bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(28.dp),
    ) {
        item { HomeHero(wide) }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                SectionHeader("Pick up where you left off", "Continue", action = "See all")
                Rail(continueItems, aspect = 16f / 10f, wide = wide)
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                SectionHeader("On air across Plajah", "Live now", action = "Explore")
                Rail(liveItems, aspect = 16f / 10f, wide = wide)
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                SectionHeader("From Chora", "New for you", action = "Open Chora")
                Rail(picks, aspect = 1f, wide = wide)
            }
        }
    }
}

@Composable
private fun HomeHero(wide: Boolean) {
    Box(
        Modifier
            .fillMaxWidth()
            .height(if (wide) 300.dp else 240.dp)
            .clip(RoundedCornerShape(PlajahRadius.TwoXl))
            .background(PlajahTheme.colors.brandGradient),
    ) {
        Column(
            Modifier.align(Alignment.BottomStart).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            LiveBadge("PREMIERE")
            Text(
                "Aurora — Live from\nthe Spatial Room",
                style = if (wide) MaterialTheme.typography.displayMedium else MaterialTheme.typography.displaySmall,
                color = Color.White,
                fontWeight = FontWeight.Black,
            )
            Text(
                "A one-night spatial-audio set. Front row seats for everyone.",
                style = MaterialTheme.typography.bodyLarge,
                color = Color.White.copy(alpha = 0.85f),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AccentButton("Watch live", onClick = {})
                BrandButton("Add to Front Row", onClick = {})
            }
        }
    }
}

@Composable
private fun Rail(items: List<Item>, aspect: Float, wide: Boolean) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(if (wide) 20.dp else 14.dp)) {
        items(items) { it ->
            MediaTile(
                title = it.title,
                subtitle = it.subtitle,
                artwork = TileArt.at(it.art),
                aspect = aspect,
                live = it.live,
                modifier = Modifier.width(if (wide) 200.dp else 160.dp),
            )
        }
    }
}

/**
 * CHORA (web view MUSIC) — music home with a persistent now-playing bar and a
 * playlist wall. Media3 already ships in this module (PlajahMediaService), so the
 * native player can drive background playback + Google Home/Cast when wired.
 */
@Composable
fun ChoraScreen(wide: Boolean) {
    Column(Modifier.fillMaxSize()) {
        LazyColumn(
            Modifier.weight(1f),
            contentPadding = PaddingValues(20.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            item { SectionHeader("Your soundtrack", "Daily Mix") }
            item { Rail(picks, aspect = 1f, wide = wide) }
            item { SectionHeader("Fresh cuts", "New releases") }
            item { Rail(continueItems, aspect = 1f, wide = wide) }
            item { SectionHeader("DJ sets", "Mixes") }
            item { Rail(liveItems, aspect = 1f, wide = wide) }
        }
        NowPlayingBar()
    }
}

@Composable
private fun NowPlayingBar() {
    GlassCard(
        tier = 3,
        shape = RoundedCornerShape(topStart = PlajahRadius.Lg, topEnd = PlajahRadius.Lg),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.size(48.dp).clip(RoundedCornerShape(PlajahRadius.Sm)).background(TileArt.ember))
            Column(Modifier.weight(1f)) {
                Text("Neon Bloom", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
                Text("Aurora", style = MaterialTheme.typography.bodySmall, color = PlajahTheme.colors.textSecondary)
            }
            Box(
                Modifier.size(44.dp).clip(androidx.compose.foundation.shape.CircleShape).background(PlajahTheme.colors.live),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Rounded.PlayArrow, "Play", tint = Color(0xFF12080A)) }
        }
    }
}

// Reello sample sets — a mix of short vertical clips and long-form episodes.
private val shorts = listOf(
    Item("Studio B-roll", "@aurora · 12s", 2),
    Item("One-take verse", "@mara · 34s", 0),
    Item("Detroit rooftop", "@kite · 21s", 4),
    Item("Neon test", "@pixels · 8s", 5),
    Item("Backstage", "@elevate · 40s", 3),
)
private val episodes = listOf(
    Item("Detroit After Dark", "Reello · Ep 4 · 24 min", 2),
    Item("The Makers", "Reello · Ep 2 · 18 min", 1),
    Item("Front Row: Aurora", "Reello · 41 min", 0),
    Item("City of Signals", "Reello · Ep 7 · 29 min", 3),
)

/**
 * REELLO (web view VIDEOS) — video home. A featured hero, a vertical "Shorts"
 * rail (9:16 clips), and long-form episode rails. On Android-laptop windows the
 * hero grows and rails widen; the native player will drive Media3 + Cast when wired.
 */
@Composable
fun ReelloScreen(wide: Boolean) {
    val pad = if (wide) 32.dp else 20.dp
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = pad, end = pad, top = 8.dp, bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(28.dp),
    ) {
        item { ReelloHero(wide) }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                SectionHeader("Quick hits", "Shorts", action = "See all")
                // 9:16 vertical clips — the short-form rail.
                LazyRow(horizontalArrangement = Arrangement.spacedBy(if (wide) 16.dp else 11.dp)) {
                    items(shorts) { s ->
                        MediaTile(
                            title = s.title,
                            subtitle = s.subtitle,
                            artwork = TileArt.at(s.art),
                            aspect = 9f / 16f,
                            modifier = Modifier.width(if (wide) 130.dp else 112.dp),
                        )
                    }
                }
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                SectionHeader("Pick up where you left off", "Continue watching", action = "History")
                Rail(continueItems, aspect = 16f / 9f, wide = wide)
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                SectionHeader("Fresh from your channels", "New episodes", action = "Subscriptions")
                Rail(episodes, aspect = 16f / 9f, wide = wide)
            }
        }
    }
}

@Composable
private fun ReelloHero(wide: Boolean) {
    Box(
        Modifier
            .fillMaxWidth()
            .height(if (wide) 300.dp else 210.dp)
            .clip(RoundedCornerShape(PlajahRadius.TwoXl))
            .background(TileArt.spatial),
    ) {
        // Big centered play affordance — this is video, not a static hero.
        Box(
            Modifier.align(Alignment.Center).size(64.dp)
                .clip(androidx.compose.foundation.shape.CircleShape).background(Color.White.copy(alpha = 0.16f)),
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Rounded.PlayArrow, "Play", tint = Color.White, modifier = Modifier.size(34.dp)) }
        Column(
            Modifier.align(Alignment.BottomStart).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Eyebrow("Featured · Reello Original")
            Text(
                "Detroit After Dark",
                style = if (wide) MaterialTheme.typography.displayMedium else MaterialTheme.typography.displaySmall,
                color = Color.White,
                fontWeight = FontWeight.Black,
            )
            Text(
                "Episode 4 · 24 min · a night shift across the city.",
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White.copy(alpha = 0.85f),
            )
            AccentButton("Resume", onClick = {})
        }
    }
}

/**
 * LOREA (web view BOOKS) — the reader. This is the surface tuned for the new
 * Android laptops: on a wide desktop window it becomes a two-pane library +
 * reading view; on a phone it's a single-column shelf. Real book-reading UX
 * conventions (a continue-reading shelf, chapter progress) carry over from the web.
 */
@Composable
fun LoreaScreen(wide: Boolean) {
    if (wide) {
        Row(Modifier.fillMaxSize()) {
            // Library pane
            LazyColumn(
                Modifier.width(320.dp).fillMaxSize().padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item { Eyebrow("Your library") }
                item { Text("Lorea", style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.onBackground) }
                items(picks) { LibraryRow(it) }
            }
            // Reading pane
            ReadingPane(Modifier.weight(1f))
        }
    } else {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(20.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            item { SectionHeader("Pick up your read", "Continue reading") }
            item { Rail(continueItems, aspect = 2f / 3f, wide = false) }
            item { SectionHeader("Your library", "Recent") }
            items(picks) { LibraryRow(it) }
        }
    }
}

@Composable
private fun LibraryRow(item: Item) {
    Row(
        Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.width(44.dp).aspectRatio(2f / 3f).clip(RoundedCornerShape(PlajahRadius.Xs)).background(TileArt.at(item.art)))
        Column(Modifier.weight(1f)) {
            Text(item.title, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onBackground)
            Text(item.subtitle, style = MaterialTheme.typography.bodySmall, color = PlajahTheme.colors.textSecondary)
        }
        Icon(Icons.Rounded.Bookmark, null, tint = PlajahTheme.colors.textSecondary, modifier = Modifier.size(18.dp))
    }
}

@Composable
private fun ReadingPane(modifier: Modifier) {
    Column(modifier.fillMaxSize().padding(40.dp)) {
        Eyebrow("Ink & Ash · Chapter Seven")
        Spacer(Modifier.height(16.dp))
        Text(
            "The Long Way Home",
            style = MaterialTheme.typography.displaySmall,
            color = MaterialTheme.colorScheme.onBackground,
            fontWeight = FontWeight.Black,
        )
        Spacer(Modifier.height(24.dp))
        Text(
            "The city had a way of holding its breath before the rain. Mara walked the " +
                "length of Woodward with her collar up and the whole of the evening ahead of " +
                "her, and for the first time in a long while the quiet did not feel like " +
                "something waiting to be filled.\n\n" +
                "On an Android laptop the page sets itself in a comfortable measure — a single " +
                "column of type at a readable width, the library one glance to the left, the " +
                "keyboard turning pages. The same book, the same place in it, whether you left " +
                "off on your phone on the bus or here at the desk.",
            style = MaterialTheme.typography.bodyLarge.copy(lineHeight = 28.sp),
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.92f),
        )
    }
}

/** Everything not yet ported renders a branded, honest placeholder — never a blank screen. */
@Composable
fun PlaceholderScreen(dest: Destination, onOpenClassic: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(48.dp))
        Box(Modifier.size(88.dp).clip(RoundedCornerShape(PlajahRadius.Lg)).background(PlajahTheme.colors.brandGradient), contentAlignment = Alignment.Center) {
            Icon(dest.icon, null, tint = Color.White, modifier = Modifier.size(44.dp))
        }
        Eyebrow("Native rebuild")
        Text(dest.label, style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.onBackground)
        Text(
            "This surface is next in the native port. Switch to Classic to use the full app.",
            style = MaterialTheme.typography.bodyMedium,
            color = PlajahTheme.colors.textSecondary,
            modifier = Modifier.width(300.dp),
        )
        BrandButton("Switch to Classic", onClick = onOpenClassic)
    }
}
