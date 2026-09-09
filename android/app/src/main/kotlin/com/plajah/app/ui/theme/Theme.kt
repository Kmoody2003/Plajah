package com.plajah.app.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

/**
 * PLAJAH THEME — the native mirror of the web design system.
 *
 * Material You policy (chosen: "brand-locked, opt-in wallpaper tint"): the
 * Plajah brand — purple / magenta / orange — is the identity in every theme,
 * exactly as on the web ("Surfaces re-theme; the brand does not"). When the user
 * opts into dynamic color, the wallpaper palette tints ONLY the neutral surface
 * and background slots; the brand-carrying slots are forced back to Plajah, so
 * CTAs and live states never lose brand recognition per-device.
 */

// ── Dark scheme (Plajah's default ground) ─────────────────────────────────────
private val PlajahDarkColors = darkColorScheme(
    primary            = PlajahBrand.Lilac,     // M3 dark primary == the DS --pj-lilac
    onPrimary          = Color(0xFF3A0057),
    primaryContainer   = PlajahBrand.Purple,
    onPrimaryContainer = Color(0xFFEDDCFF),
    secondary            = Color(0xFFFFB1C7),
    onSecondary          = Color(0xFF5A0022),
    secondaryContainer   = PlajahBrand.Magenta,
    onSecondaryContainer = Color(0xFFFFD9E2),
    tertiary            = PlajahBrand.Orange,   // the "live wire" signal accent
    onTertiary          = Color(0xFF241100),
    tertiaryContainer   = Color(0xFF7A4200),
    onTertiaryContainer = Color(0xFFFFDDB3),
    background         = PlajahDark.Ground,
    onBackground       = PlajahDark.TextPrimary,
    surface            = PlajahDark.Ground,
    onSurface          = PlajahDark.TextPrimary,
    surfaceVariant     = Color(0xFF1C1A26),
    onSurfaceVariant   = Color(0xFFC9C3D4),
    surfaceContainerLowest  = Color(0xFF040309),
    surfaceContainerLow     = Color(0xFF0B0A14),
    surfaceContainer        = Color(0xFF12101C),
    surfaceContainerHigh    = Color(0xFF1A1726),
    surfaceContainerHighest = Color(0xFF221E31),
    outline            = Color(0xFF5B566A),
    outlineVariant     = Color(0xFF2C2939),
    error              = PlajahBrand.Danger,
    onError            = Color(0xFFFFFFFF),
    errorContainer     = Color(0xFF7A1A1A),
    onErrorContainer   = Color(0xFFFFDAD6),
    inverseSurface     = Color(0xFFE7E1EF),
    inverseOnSurface   = Color(0xFF1A1726),
    inversePrimary     = PlajahBrand.Purple,
    scrim              = Color(0xFF000000),
)

// ── Light scheme (theme-light / theme-pastel grounds) ─────────────────────────
private val PlajahLightColors = lightColorScheme(
    primary            = PlajahBrand.Purple,
    onPrimary          = Color(0xFFFFFFFF),
    primaryContainer   = Color(0xFFECDCFF),
    onPrimaryContainer = Color(0xFF24005A),
    secondary            = PlajahBrand.Magenta,
    onSecondary          = Color(0xFFFFFFFF),
    secondaryContainer   = Color(0xFFFFD9E2),
    onSecondaryContainer = Color(0xFF3E0018),
    tertiary            = Color(0xFF974B00),    // orange darkened for contrast on paper
    onTertiary          = Color(0xFFFFFFFF),
    tertiaryContainer   = Color(0xFFFFDDB3),
    onTertiaryContainer = Color(0xFF2E1500),
    background         = PlajahLight.Ground,
    onBackground       = PlajahLight.TextPrimary,
    surface            = PlajahLight.Surface,
    onSurface          = PlajahLight.TextPrimary,
    surfaceVariant     = Color(0xFFE9E1EE),
    onSurfaceVariant   = Color(0xFF4A454E),
    surfaceContainerLowest  = Color(0xFFFFFFFF),
    surfaceContainerLow     = Color(0xFFF6F1FA),
    surfaceContainer        = Color(0xFFF0EAF6),
    surfaceContainerHigh    = Color(0xFFEAE3F1),
    surfaceContainerHighest = Color(0xFFE4DCEC),
    outline            = Color(0xFF7C7589),
    outlineVariant     = Color(0xFFCEC5DA),
    error              = PlajahBrand.Danger,
    onError            = Color(0xFFFFFFFF),
    errorContainer     = Color(0xFFFFDAD6),
    onErrorContainer   = Color(0xFF410002),
    inverseSurface     = Color(0xFF1A1726),
    inverseOnSurface   = Color(0xFFF3EDF7),
    inversePrimary     = PlajahBrand.Lilac,
    scrim              = Color(0xFF000000),
)

/**
 * Extended tokens the M3 tri-tuple can't carry: the five DS gradients, glass
 * tiers, semantic status colours, and the brand glows. Screens read these via
 * [LocalPlajahColors] — the native equivalent of the `--pj-*` custom properties.
 */
data class PlajahColors(
    val brandGradient: Brush,
    val emberGradient: Brush,
    val spatialGradient: Brush,
    val glass1: Color, val glass2: Color, val glass3: Color, val glass4: Color, val glass5: Color,
    val border: Color, val borderStrong: Color,
    val success: Color, val warning: Color, val info: Color,
    val live: Color,        // the orange "on air" / realtime signal
    val spatial: Color,     // cyan
    val textSecondary: Color,
    val isDark: Boolean,
)

private val brandBrush = Brush.linearGradient(listOf(PlajahBrand.Purple, PlajahBrand.Magenta))
private val emberBrush = Brush.linearGradient(listOf(PlajahBrand.Magenta, PlajahBrand.Orange))
private val spatialBrush = Brush.linearGradient(listOf(PlajahBrand.Purple, PlajahBrand.Cyan))

private fun plajahExtended(dark: Boolean) = PlajahColors(
    brandGradient = brandBrush,
    emberGradient = emberBrush,
    spatialGradient = spatialBrush,
    glass1 = if (dark) PlajahDark.Glass1 else PlajahLight.Glass1,
    glass2 = if (dark) PlajahDark.Glass2 else PlajahLight.Glass2,
    glass3 = if (dark) PlajahDark.Glass3 else PlajahLight.Glass3,
    glass4 = if (dark) PlajahDark.Glass4 else PlajahLight.Glass4,
    glass5 = if (dark) PlajahDark.Glass5 else PlajahLight.Glass5,
    border = if (dark) PlajahDark.Border else PlajahLight.Border,
    borderStrong = if (dark) PlajahDark.BorderStrong else PlajahLight.BorderStrong,
    success = PlajahBrand.Success,
    warning = PlajahBrand.Warning,
    info = PlajahBrand.Info,
    live = PlajahBrand.Orange,
    spatial = PlajahBrand.Cyan,
    textSecondary = if (dark) PlajahDark.TextSecondary else PlajahLight.TextSecondary,
    isDark = dark,
)

val LocalPlajahColors = staticCompositionLocalOf { plajahExtended(dark = true) }

/** Convenience accessor: `PlajahTheme.colors.brandGradient`, `PlajahTheme.colors.live`, … */
object PlajahTheme {
    val colors: PlajahColors
        @Composable get() = LocalPlajahColors.current
}

/**
 * Fold the wallpaper palette into the neutrals only, keeping every brand slot.
 * This is the whole of the "brand-locked, opt-in tint" policy.
 */
private fun ColorScheme.withBrandLocked(brand: ColorScheme): ColorScheme = copy(
    primary = brand.primary, onPrimary = brand.onPrimary,
    primaryContainer = brand.primaryContainer, onPrimaryContainer = brand.onPrimaryContainer,
    secondary = brand.secondary, onSecondary = brand.onSecondary,
    secondaryContainer = brand.secondaryContainer, onSecondaryContainer = brand.onSecondaryContainer,
    tertiary = brand.tertiary, onTertiary = brand.onTertiary,
    tertiaryContainer = brand.tertiaryContainer, onTertiaryContainer = brand.onTertiaryContainer,
    inversePrimary = brand.inversePrimary,
)

@Composable
fun PlajahTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    /** Off by default — brand identity leads; the user turns wallpaper tint on in Settings. */
    dynamicTint: Boolean = false,
    content: @Composable () -> Unit,
) {
    val brand = if (darkTheme) PlajahDarkColors else PlajahLightColors
    val colorScheme = when {
        dynamicTint && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val ctx = LocalContext.current
            val dynamic = if (darkTheme) dynamicDarkColorScheme(ctx) else dynamicLightColorScheme(ctx)
            dynamic.withBrandLocked(brand)
        }
        else -> brand
    }

    CompositionLocalProvider(LocalPlajahColors provides plajahExtended(darkTheme)) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = PlajahTypography,
            shapes = PlajahShapes,
            content = content,
        )
    }
}
