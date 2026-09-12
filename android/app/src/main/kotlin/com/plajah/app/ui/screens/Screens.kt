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
