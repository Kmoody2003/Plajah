package com.plajah.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/**
 * PLAJAH TYPE SYSTEM — ported from index.css `--font-*` tokens + the `.type-*`
 * scale (index.css:17-21, 649-682).
 *
 * Web tokens:
 *   --font-display: "Outfit","Space Grotesk"    (display 900 / lh 1.05)
 *   --font-body:    "Inter","Manrope"           (body 400 / lh 1.55)
 *   --font-label:   "Outfit","Manrope"          (label 700-800 UPPERCASE, tracked)
 *
 * FONTS — one-step swap to the real faces (tracked in the rebuild strategy doc):
 * the app ships today on the system sans-serif so it builds and runs with zero
 * font setup. To pull the SAME Outfit / Inter the web @imports, either
 *   (a) Downloadable Fonts: add `androidx.compose.ui:ui-text-google-fonts`, drop
 *       in Google's standard `font_certs.xml`, and build the families with
 *       GoogleFont.Provider (Outfit + Inter) — Compose falls back to system if the
 *       provider is unavailable, so it is safe; or
 *   (b) bundle Outfit-*.ttf / Inter-*.ttf under res/font and reference R.font.*.
 * Everything below is already routed through [BrandDisplay] / [ReadingBody] so the
 * swap is a two-line change here and nothing at the call sites moves.
 */

// Brand voice — displays, headlines, titles, tracked labels (Outfit on the web).
val BrandDisplay: FontFamily = FontFamily.SansSerif

// Reading face — body copy (Inter on the web).
val ReadingBody: FontFamily = FontFamily.SansSerif

/** UPPERCASE tracked labels — the platform's most recognisable gesture (.pj-eyebrow). */
private fun label(size: androidx.compose.ui.unit.TextUnit, weight: FontWeight, tracking: Double) = TextStyle(
    fontFamily = BrandDisplay, fontWeight = weight, fontSize = size, letterSpacing = tracking.em,
)

/**
 * Material 3 Typography wired to the Plajah scale. Sizes are the un-clamped
 * mobile base of each web `.type-*` role; on large screens (Android laptops /
 * desktop windows) the window-size-class layer scales displays up toward the
 * fluid clamp() ceilings.
 */
val PlajahTypography = Typography(
    displayLarge  = TextStyle(fontFamily = BrandDisplay, fontWeight = FontWeight.Black,     fontSize = 36.sp, lineHeight = 40.sp, letterSpacing = (-0.02).em),
    displayMedium = TextStyle(fontFamily = BrandDisplay, fontWeight = FontWeight.Black,     fontSize = 32.sp, lineHeight = 36.sp, letterSpacing = (-0.02).em),
    displaySmall  = TextStyle(fontFamily = BrandDisplay, fontWeight = FontWeight.ExtraBold, fontSize = 28.sp, lineHeight = 34.sp, letterSpacing = (-0.01).em),

    headlineLarge = TextStyle(fontFamily = BrandDisplay, fontWeight = FontWeight.ExtraBold, fontSize = 26.sp, lineHeight = 32.sp),
    headlineMedium= TextStyle(fontFamily = BrandDisplay, fontWeight = FontWeight.Bold,      fontSize = 23.sp, lineHeight = 29.sp),
    headlineSmall = TextStyle(fontFamily = BrandDisplay, fontWeight = FontWeight.Bold,      fontSize = 20.sp, lineHeight = 26.sp),

    titleLarge    = TextStyle(fontFamily = BrandDisplay, fontWeight = FontWeight.Bold,      fontSize = 22.sp, lineHeight = 28.sp),
    titleMedium   = TextStyle(fontFamily = BrandDisplay, fontWeight = FontWeight.SemiBold,  fontSize = 16.sp, lineHeight = 22.sp),
    titleSmall    = TextStyle(fontFamily = BrandDisplay, fontWeight = FontWeight.SemiBold,  fontSize = 14.sp, lineHeight = 20.sp),

    bodyLarge     = TextStyle(fontFamily = ReadingBody,  fontWeight = FontWeight.Normal,    fontSize = 16.sp, lineHeight = 25.sp),
    bodyMedium    = TextStyle(fontFamily = ReadingBody,  fontWeight = FontWeight.Normal,    fontSize = 14.sp, lineHeight = 22.sp),
    bodySmall     = TextStyle(fontFamily = ReadingBody,  fontWeight = FontWeight.Normal,    fontSize = 13.sp, lineHeight = 19.sp),

    labelLarge    = label(14.sp, FontWeight.Bold,      0.02),
    labelMedium   = label(12.sp, FontWeight.ExtraBold, 0.04),
    labelSmall    = label(11.sp, FontWeight.ExtraBold, 0.08),
)

/** The hyper-tracked eyebrow (.pj-eyebrow) — 0.28em, uppercased at the call site. */
val EyebrowStyle = TextStyle(
    fontFamily = BrandDisplay,
    fontWeight = FontWeight.ExtraBold,
    fontSize = 11.sp,
    letterSpacing = 0.28.em,
)
