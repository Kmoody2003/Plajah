package com.plajah.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.material.icons.rounded.Apps
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteType
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.plajah.app.ui.components.Eyebrow
import com.plajah.app.ui.nav.Destination
import com.plajah.app.ui.nav.Destinations
import com.plajah.app.ui.screens.ChoraScreen
import com.plajah.app.ui.screens.HomeScreen
import com.plajah.app.ui.screens.LoreaScreen
import com.plajah.app.ui.screens.PlaceholderScreen
import com.plajah.app.ui.screens.ReelloScreen
import com.plajah.app.ui.theme.PlajahTheme

/**
 * The native shell. One adaptive [NavigationSuiteScaffold] carries the app from a
 * phone (bottom bar, primary destinations) → tablet (navigation rail, all
 * destinations) → Android-laptop / desktop window (navigation drawer + wider,
 * multi-pane content). Navigation is view-state, mirroring the web App.tsx router.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlajahApp(
    onExitToClassic: () -> Unit,
    dynamicTint: Boolean,
    onDynamicTintChange: (Boolean) -> Unit,
) {
    var currentId by rememberSaveable { mutableStateOf(Destinations.Home.id) }
    val current = Destinations.all.firstOrNull { it.id == currentId } ?: Destinations.Home
    var settingsOpen by rememberSaveable { mutableStateOf(false) }
    var destinationsOpen by remember { mutableStateOf(false) }

    BackHandler(enabled = current.id != Destinations.Home.id && !settingsOpen && !destinationsOpen) {
        currentId = Destinations.Home.id
    }

    // Width buckets pick the nav affordance AND the content density. screenWidthDp
    // is enough here and needs no extra adaptive dependency.
    val widthDp = LocalConfiguration.current.screenWidthDp
    val navType = when {
        widthDp < 600 -> NavigationSuiteType.NavigationBar
        widthDp < 840 -> NavigationSuiteType.NavigationRail
        else -> NavigationSuiteType.NavigationDrawer
    }
    val wide = widthDp >= 840
    // The phone bottom bar shows the five primary destinations; rail/drawer show all.
    val items = if (navType == NavigationSuiteType.NavigationBar) Destinations.primary else Destinations.all

    NavigationSuiteScaffold(
        layoutType = navType,
        navigationSuiteItems = {
            items.forEach { dest ->
                item(
                    selected = dest.id == current.id,
                    onClick = { currentId = dest.id },
                    icon = { Icon(dest.icon, contentDescription = dest.label) },
                    label = { Text(dest.label) },
                )
            }
        },
    ) {
        Scaffold(
            topBar = {
                CenterAlignedTopAppBar(
                    title = {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                current.label,
                                style = androidx.compose.material3.MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    },
                    actions = {
                        Box {
                            IconButton(onClick = { destinationsOpen = true }) {
                                Icon(Icons.Rounded.Apps, contentDescription = "All destinations")
                            }
                            DropdownMenu(
                                expanded = destinationsOpen,
                                onDismissRequest = { destinationsOpen = false },
                            ) {
                                Destinations.all.forEach { dest ->
                                    DropdownMenuItem(
                                        text = { Text(dest.label) },
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
                            Icon(Icons.Rounded.Tune, contentDescription = "Settings")
                        }
                    },
                    colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
                        containerColor = Color.Transparent,
                    ),
                )
            },
        ) { inner ->
            Box(Modifier.padding(inner)) {
                when (current.id) {
                    Destinations.Home.id -> HomeScreen(wide = wide, onOpenClassic = onExitToClassic)
                    Destinations.Chora.id -> ChoraScreen(wide = wide)
                    Destinations.Reello.id -> ReelloScreen(wide = wide)
                    Destinations.Lorea.id -> LoreaScreen(wide = wide)
                    else -> PlaceholderScreen(current, onExitToClassic)
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
                Text("Material You tint", style = androidx.compose.material3.MaterialTheme.typography.titleMedium, color = androidx.compose.material3.MaterialTheme.colorScheme.onSurface)
                Text(
                    "Tint neutral surfaces from your wallpaper. Plajah's brand colours stay.",
                    style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
                    color = PlajahTheme.colors.textSecondary,
                )
            }
            Switch(checked = dynamicTint, onCheckedChange = onDynamicTintChange)
        }

        Spacer(Modifier.height(4.dp))
        Eyebrow("Experience")
        Text(
            "You're on the native Android app (beta). Classic is the full web experience — " +
                "every feature, always up to date.",
            style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
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
