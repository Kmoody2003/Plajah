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
 * Samsung Galaxy Z Fold 7, Z Fold 8, and Z Fold 8 Ultra foldable device postures.
 */
enum class FoldDeviceMode {
    COVER_SCREEN,       // Outer screen: tall narrow 21.5:9 to 23:9 aspect ratio, width ~360-420dp
    INNER_UNFOLDED,     // Inner main screen: near square ~1:1 to 4:3 aspect ratio, width ~680-920dp
    FLEX_TABLETOP,      // Half-folded horizontally (top screen upright, bottom screen console)
    FLEX_BOOK,          // Half-folded vertically (side by side dual pane)
    STANDARD_PHONE,     // Non-folding phone
    LARGE_TABLET        // Standard large tablet
}

data class FoldableInfo(
    val mode: FoldDeviceMode,
    val isCoverScreen: Boolean,
    val isInnerScreen: Boolean,
    val isFlexMode: Boolean,
    val hingeBounds: Rect? = null,
    val hingeOrientation: FoldingFeature.Orientation? = null,
    val screenWidthDp: Dp = 0.dp,
    val screenHeightDp: Dp = 0.dp
) {
    val isFoldable: Boolean get() = isCoverScreen || isInnerScreen || isFlexMode
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
        // Half-opened flex postures (Z Fold sitting on table)
        isSeparating && feature?.orientation == FoldingFeature.Orientation.HORIZONTAL -> FoldDeviceMode.FLEX_TABLETOP
        isSeparating && feature?.orientation == FoldingFeature.Orientation.VERTICAL -> FoldDeviceMode.FLEX_BOOK

        // Z Fold Cover Screen (outer): width < 440dp and tall aspect ratio
        configuration.screenWidthDp < 440 && aspect < 0.58f -> FoldDeviceMode.COVER_SCREEN

        // Z Fold Inner Screen (unfolded): width >= 580dp and near square aspect
        configuration.screenWidthDp in 580..1050 && aspect in 0.70f..1.45f -> FoldDeviceMode.INNER_UNFOLDED

        configuration.screenWidthDp >= 840 -> FoldDeviceMode.LARGE_TABLET
        else -> FoldDeviceMode.STANDARD_PHONE
    }

    return FoldableInfo(
        mode = mode,
        isCoverScreen = mode == FoldDeviceMode.COVER_SCREEN,
        isInnerScreen = mode == FoldDeviceMode.INNER_UNFOLDED || mode == FoldDeviceMode.LARGE_TABLET,
        isFlexMode = mode == FoldDeviceMode.FLEX_TABLETOP || mode == FoldDeviceMode.FLEX_BOOK,
        hingeBounds = feature?.bounds,
        hingeOrientation = feature?.orientation,
        screenWidthDp = screenWidthDp,
        screenHeightDp = screenHeightDp
    )
}
