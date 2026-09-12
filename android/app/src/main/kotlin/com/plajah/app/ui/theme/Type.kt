package com.plajah.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.googlefonts.Font
import androidx.compose.ui.text.googlefonts.GoogleFont
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

val GoogleFontProvider = GoogleFont.Provider(
    providerAuthority = "com.google.android.gms.fonts",
    providerPackage = "com.google.android.gms",
    certificates = com.plajah.app.R.array.com_google_android_gms_fonts_certs
)

private val OutfitGoogleFont = GoogleFont("Outfit")
private val InterGoogleFont = GoogleFont("Inter")

// Brand voice — displays, headlines, titles, tracked labels (Outfit on the web).
val BrandDisplay: FontFamily = FontFamily(
    Font(googleFont = OutfitGoogleFont, fontProvider = GoogleFontProvider, weight = FontWeight.Normal),
    Font(googleFont = OutfitGoogleFont, fontProvider = GoogleFontProvider, weight = FontWeight.Medium),
    Font(googleFont = OutfitGoogleFont, fontProvider = GoogleFontProvider, weight = FontWeight.SemiBold),
    Font(googleFont = OutfitGoogleFont, fontProvider = GoogleFontProvider, weight = FontWeight.Bold),
    Font(googleFont = OutfitGoogleFont, fontProvider = GoogleFontProvider, weight = FontWeight.ExtraBold),
    Font(googleFont = OutfitGoogleFont, fontProvider = GoogleFontProvider, weight = FontWeight.Black),
)

// Reading face — body copy (Inter on the web).
val ReadingBody: FontFamily = FontFamily(
    Font(googleFont = InterGoogleFont, fontProvider = GoogleFontProvider, weight = FontWeight.Normal),
    Font(googleFont = InterGoogleFont, fontProvider = GoogleFontProvider, weight = FontWeight.Medium),
    Font(googleFont = InterGoogleFont, fontProvider = GoogleFontProvider, weight = FontWeight.SemiBold),
    Font(googleFont = InterGoogleFont, fontProvider = GoogleFontProvider, weight = FontWeight.Bold),
)

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
