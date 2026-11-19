package com.plajah.app.ui.foldable

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Rect
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

/**
 * Adaptive device posture & resolution classification covering:
 * - Samsung Galaxy Z Fold 5/6/7/8 (narrow tall outer cover, near-square inner unfolded, Flex Tabletop/Book)
 * - Google Pixel Fold / Pixel 9 Pro Fold (wider cover, landscape-default unfolded inner, Tabletop/Book)
 * - Clamshell foldables (Z Flip / Razr Flex Tabletop)
 * - Standard & compact phones across 16:9, 19.5:9, 20:9, 21:9, and 23:9 aspect ratios
 * - Tablets & desktop/ChromeOS/Android-laptop resizable windows
 */
enum class FoldDeviceMode {
    COVER_SCREEN,       // Outer foldable screen: narrow width (< 430dp) & tall aspect (< 0.56)
    INNER_UNFOLDED,     // Unfolded main screen: width 580..1050dp, near-square aspect (0.68..1.48)
    FLEX_TABLETOP,      // Half-folded horizontally (top viewport upright, bottom deck controls)
    FLEX_BOOK,          // Half-folded vertically (left & right panes separated by hinge)
    STANDARD_PHONE,     // Standard non-folding phone (portrait or landscape)
    LARGE_TABLET        // Wide tablet / desktop window (>= 840dp wide)
}

enum class WindowSizeBucket {
    COMPACT,            // < 600dp
    MEDIUM,             // 600dp .. 839dp
    EXPANDED            // >= 840dp
}

data class FoldableInfo(
    val mode: FoldDeviceMode,
    val isCoverScreen: Boolean,
    val isInnerScreen: Boolean,
    val isFlexMode: Boolean,
    val hingeBounds: Rect? = null,
    val hingeOrientation: FoldingFeature.Orientation? = null,
    val screenWidthDp: Dp = 0.dp,
    val screenHeightDp: Dp = 0.dp,
    val hingeWidthDp: Dp = 0.dp,
    val hingeHeightDp: Dp = 0.dp,
) {
    val isFoldable: Boolean get() = isCoverScreen || isInnerScreen || isFlexMode
    val isUltraCompact: Boolean get() = screenWidthDp < 370.dp || isCoverScreen
    val isLandscape: Boolean get() = screenWidthDp > screenHeightDp
    val aspectRatio: Float get() = screenWidthDp.value / screenHeightDp.value.coerceAtLeast(1f)
    val sizeBucket: WindowSizeBucket
        get() = when {
            screenWidthDp < 600.dp -> WindowSizeBucket.COMPACT
            screenWidthDp < 840.dp -> WindowSizeBucket.MEDIUM
            else -> WindowSizeBucket.EXPANDED
        }

    /** Unified scalable horizontal padding that prevents edge crowding or clipping. */
    val horizontalPadding: Dp
        get() = when {
            isUltraCompact -> 10.dp
            sizeBucket == WindowSizeBucket.COMPACT -> 14.dp
            sizeBucket == WindowSizeBucket.MEDIUM -> 18.dp
            else -> 24.dp
        }

    /** Adaptive card columns for square media grids (Chora albums, playlists, etc.). */
    val squareGridColumns: Int
        get() = when {
            screenWidthDp < 350.dp -> 1
            screenWidthDp < 580.dp -> 2
            screenWidthDp < 880.dp -> 3
            else -> 4
        }

    /** Adaptive card columns for 16:9 video / landscape cards (Reello, Elevate, Games). */
    val wideGridColumns: Int
        get() = when {
            screenWidthDp < 560.dp -> 1
            screenWidthDp < 900.dp -> 2
            else -> 3
        }

    /** Adaptive poster columns (Cinema 2:3 posters, Lorea book covers). */
    val posterGridColumns: Int
        get() = when {
            screenWidthDp < 350.dp -> 2
            screenWidthDp < 600.dp -> 2
            screenWidthDp < 880.dp -> 3
            else -> 4
        }

    /** Whether a dual-pane master/detail layout fits comfortably side by side. */
    val supportsDualPane: Boolean
        get() = isInnerScreen || mode == FoldDeviceMode.FLEX_BOOK || screenWidthDp >= 640.dp
}

private fun Context.findActivity(): Activity? {
    var ctx = this
    while (ctx is ContextWrapper) {
        if (ctx is Activity) return ctx
        ctx = ctx.baseContext
    }
    return null
}

@Composable
fun rememberFoldableInfo(): FoldableInfo {
    val context = LocalContext.current
    val configuration = LocalConfiguration.current
    val density = LocalDensity.current
    val activity = remember(context) { context.findActivity() }

    val screenWidthDp = configuration.screenWidthDp.dp
    val screenHeightDp = configuration.screenHeightDp.dp
    val aspect = configuration.screenWidthDp.toFloat() / (configuration.screenHeightDp.toFloat().coerceAtLeast(1f))

    var foldingFeature by remember { mutableStateOf<FoldingFeature?>(null) }

    DisposableEffect(activity) {
        if (activity == null) return@DisposableEffect onDispose {}

        var job: Job? = null
        try {
            val tracker = WindowInfoTracker.getOrCreate(activity)
            job = CoroutineScope(Dispatchers.Main.immediate).launch {
                tracker.windowLayoutInfo(activity).collectLatest { info ->
                    foldingFeature = info.displayFeatures.filterIsInstance<FoldingFeature>().firstOrNull()
                }
            }
        } catch (_: Exception) {}

        onDispose {
            job?.cancel()
        }
    }

    val feature = foldingFeature
    val isSeparating = feature?.isSeparating == true || feature?.state == FoldingFeature.State.HALF_OPENED

    val mode = when {
        // Half-opened flex postures (Z Fold / Pixel Fold / Z Flip sitting on table or open like a book)
        isSeparating && feature?.orientation == FoldingFeature.Orientation.HORIZONTAL -> FoldDeviceMode.FLEX_TABLETOP
        isSeparating && feature?.orientation == FoldingFeature.Orientation.VERTICAL -> FoldDeviceMode.FLEX_BOOK

        // Outer Cover Screen (Z Fold narrow tall 21.5:9–23:9; Pixel Fold cover ~20:9 narrow)
        configuration.screenWidthDp < 440 && aspect < 0.56f -> FoldDeviceMode.COVER_SCREEN

        // Unfolded Inner Screen (Z Fold & Pixel Fold near-square aspect 0.68..1.48)
        configuration.screenWidthDp in 580..1080 && aspect in 0.68f..1.48f -> FoldDeviceMode.INNER_UNFOLDED

        configuration.screenWidthDp >= 840 -> FoldDeviceMode.LARGE_TABLET
        else -> FoldDeviceMode.STANDARD_PHONE
    }

    val hingeWidthDp = with(density) { (feature?.bounds?.width() ?: 0).toDp() }
    val hingeHeightDp = with(density) { (feature?.bounds?.height() ?: 0).toDp() }

    return FoldableInfo(
        mode = mode,
        isCoverScreen = mode == FoldDeviceMode.COVER_SCREEN,
        isInnerScreen = mode == FoldDeviceMode.INNER_UNFOLDED || mode == FoldDeviceMode.LARGE_TABLET,
        isFlexMode = mode == FoldDeviceMode.FLEX_TABLETOP || mode == FoldDeviceMode.FLEX_BOOK,
        hingeBounds = feature?.bounds,
        hingeOrientation = feature?.orientation,
        screenWidthDp = screenWidthDp,
        screenHeightDp = screenHeightDp,
        hingeWidthDp = hingeWidthDp,
        hingeHeightDp = hingeHeightDp,
    )
}
