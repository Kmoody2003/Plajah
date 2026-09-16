package com.plajah.app.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/**
 * PLAJAH RADIUS SCALE — ported from plajah-ds.css `--pj-radius-*`, which itself
 * aliases the M3 shape scale so "the two systems can never drift". We map those
 * seven radii onto Material 3's five shape slots plus a couple of extras the
 * DS uses for sheets and heroes.
 *
 *   control  → Full (pills) or Md (square controls)
 *   card     → Lg
 *   sheet    → Xl
 *   hero     → TwoXl
 *   inline   → Xs / Sm  (chips, tags, inputs, code)
 */
object PlajahRadius {
    val Xs    = 8.dp
    val Sm    = 12.dp
    val Md    = 16.dp
    val Lg    = 24.dp
    val Xl    = 28.dp
    val TwoXl = 36.dp
    // "full" pills are expressed with RoundedCornerShape(percent = 50) at call sites.
}

/**
 * Material 3 Shapes wired to the Plajah radius scale. Material components
 * (Cards, Buttons, Sheets, Chips) pick these up automatically through the theme.
 *
 * M3 slot → Plajah role:
 *   extraSmall → inline chips/tags/code
 *   small      → inputs
 *   medium     → square controls / list rows
 *   large      → cards
 *   extraLarge → sheets & bottom sheets
 */
val PlajahShapes = Shapes(
    extraSmall = RoundedCornerShape(PlajahRadius.Xs),
    small      = RoundedCornerShape(PlajahRadius.Sm),
    medium     = RoundedCornerShape(PlajahRadius.Md),
    large      = RoundedCornerShape(PlajahRadius.Lg),
    extraLarge = RoundedCornerShape(PlajahRadius.Xl),
)
