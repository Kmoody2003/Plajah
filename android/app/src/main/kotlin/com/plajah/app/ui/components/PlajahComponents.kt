package com.plajah.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.plajah.app.ui.theme.PlajahRadius
import com.plajah.app.ui.theme.PlajahTheme

/** The hyper-tracked eyebrow — .pj-eyebrow. */
@Composable
fun Eyebrow(text: String, modifier: Modifier = Modifier, color: Color = PlajahTheme.colors.textSecondary) {
    Text(
        text = text.uppercase(),
        style = com.plajah.app.ui.theme.EyebrowStyle,
        color = color,
        modifier = modifier,
    )
}

/** Glass card — .pj-surface. Layered white/black overlay + hairline border, radius-lg. */
@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    tier: Int = 1,
    shape: androidx.compose.ui.graphics.Shape = RoundedCornerShape(PlajahRadius.Lg),
    content: @Composable () -> Unit,
) {
    val c = PlajahTheme.colors
    val fill = when (tier) { 1 -> c.glass1; 2 -> c.glass2; 3 -> c.glass3; 4 -> c.glass4; else -> c.glass5 }
    Box(
        modifier
            .clip(shape)
            .background(fill)
            .border(BorderStroke(1.dp, c.border), shape),
    ) { content() }
}

/** Primary brand CTA — .pj-btn--primary (brand gradient pill, ctl-lg height). */
@Composable
fun BrandButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    leadingIcon: androidx.compose.ui.graphics.vector.ImageVector? = null,
) {
    Row(
        modifier
            .height(50.dp)
            .clip(CircleShape)
            .background(PlajahTheme.colors.brandGradient)
            .clickable(onClick = onClick)
            .padding(horizontal = 24.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
    ) {
        if (leadingIcon != null) Icon(leadingIcon, null, tint = Color.White, modifier = Modifier.size(20.dp))
        Text(text, style = MaterialTheme.typography.titleMedium, color = Color.White, fontWeight = FontWeight.Bold)
    }
}

/** The orange signal CTA — .pj-btn--accent (play / go live / record). */
@Composable
fun AccentButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier
            .height(50.dp)
            .clip(CircleShape)
            .background(PlajahTheme.colors.live)
            .clickable(onClick = onClick)
            .padding(horizontal = 22.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
    ) {
        Icon(Icons.Rounded.PlayArrow, null, tint = Color(0xFF12080A), modifier = Modifier.size(22.dp))
        Text(text, style = MaterialTheme.typography.titleMedium, color = Color(0xFF12080A), fontWeight = FontWeight.Bold)
    }
}

/** LIVE / ON AIR badge — orange pill with a pulsing-ready dot. */
@Composable
fun LiveBadge(label: String = "LIVE", modifier: Modifier = Modifier) {
    Row(
        modifier
            .clip(CircleShape)
            .background(PlajahTheme.colors.live)
            .padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(Modifier.size(7.dp).clip(CircleShape).background(Color(0xFF12080A)))
        Text(label, style = MaterialTheme.typography.labelSmall, color = Color(0xFF12080A))
    }
}

/** Section header — eyebrow + title, optional trailing action. */
@Composable
fun SectionHeader(eyebrow: String, title: String, action: String? = null, onAction: (() -> Unit)? = null) {
    Row(
        Modifier.fillMaxWidth().padding(bottom = 4.dp),
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column {
            Eyebrow(eyebrow)
            Text(title, style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.onBackground)
        }
        if (action != null) {
            Text(
                action,
                style = MaterialTheme.typography.labelLarge,
                color = PlajahTheme.colors.live,
                modifier = Modifier.clickable { onAction?.invoke() }.padding(8.dp),
            )
        }
    }
}

/**
 * Media tile with a generated gradient "artwork" placeholder (no network images
 * in this scaffold). Vertical clips would letterbox over a blurred fill via the
 * web MediaThumb primitive; here the aspect ratio is caller-chosen.
 */
@Composable
fun MediaTile(
    title: String,
    subtitle: String,
    artwork: Brush,
    modifier: Modifier = Modifier,
    aspect: Float = 1f,
    live: Boolean = false,
) {
    Column(modifier.width(160.dp)) {
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(aspect)
                .clip(RoundedCornerShape(PlajahRadius.Md))
                .background(artwork),
        ) {
            if (live) LiveBadge(modifier = Modifier.align(Alignment.TopStart).padding(8.dp))
        }
        Text(
            title,
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.onBackground,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 8.dp),
        )
        Text(
            subtitle,
            style = MaterialTheme.typography.bodySmall,
            color = PlajahTheme.colors.textSecondary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** A small palette of on-brand gradient "artworks" so tiles read as a set. */
object TileArt {
    val brand = Brush.linearGradient(listOf(Color(0xFF6B0099), Color(0xFFD40055)))
    val ember = Brush.linearGradient(listOf(Color(0xFFD40055), Color(0xFFFF8C00)))
    val spatial = Brush.linearGradient(listOf(Color(0xFF6B0099), Color(0xFF00DAF3)))
    val ethereal = Brush.linearGradient(listOf(Color(0xFFD0BCFF), Color(0xFF00DAF3)))
    val dusk = Brush.linearGradient(listOf(Color(0xFF1A0026), Color(0xFF6B0099)))
    val citrus = Brush.linearGradient(listOf(Color(0xFFFF5500), Color(0xFFFF8C00)))
    val all = listOf(brand, ember, spatial, ethereal, dusk, citrus)
    fun at(i: Int): Brush = all[i % all.size]
}
