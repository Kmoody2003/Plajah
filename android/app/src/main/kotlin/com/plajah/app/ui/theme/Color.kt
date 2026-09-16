package com.plajah.app.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * PLAJAH BRAND PALETTE — ported 1:1 from styles/plajah-ds.css `:root`.
 *
 * These are theme-INVARIANT: "Plajah is these colours in every theme. Surfaces
 * re-theme; the brand does not." (plajah-ds.css). Keep this file the single
 * source of truth on the native side, exactly as the CSS is on the web side —
 * if you are typing a hex literal into a Composable, a token is missing here.
 *
 * The web design system is documented in docs/PLAJAH_DESIGN_SYSTEM.md.
 */
object PlajahBrand {
    // ── The triad + spatial/soft partners ──────────────────────────────────
    val Purple  = Color(0xFF6B0099) // primary brand — the deep Plajah purple
    val Magenta = Color(0xFFD40055) // brand accent — high-contrast partner
    val Orange  = Color(0xFFFF8C00) // signal / action — the platform's live wire
    val Cyan    = Color(0xFF00DAF3) // spatial, live, realtime
    val Lilac   = Color(0xFFD0BCFF) // ethereal / soft states

    // ── Semantic (status only — never decoration) ──────────────────────────
    val Success = Color(0xFF06D6A0)
    val Warning = Color(0xFFF59E0B)
    val Danger  = Color(0xFFEF4444)
    val Info    = Color(0xFF3B82F6)

    // ── Soft washes (use instead of eyeballing an opacity) ──────────────────
    val PurpleSoft  = Color(0x296B0099) // 0.16 alpha
    val MagentaSoft = Color(0x29D40055)
    val OrangeSoft  = Color(0x24FF8C00) // 0.14 alpha
    val CyanSoft    = Color(0x2400DAF3)
    val SuccessSoft = Color(0x2406D6A0)
    val DangerSoft  = Color(0x24EF4444)
}

/**
 * SURFACE / INK tokens for the dark ground (Plajah's default). The web app is
 * "a dark, translucent platform: elevation reads as shadow depth plus glass
 * opacity, not as a lighter grey." We mirror that here with layered white
 * overlays (glass-1..5) over a near-black ground.
 */
object PlajahDark {
    val Ground      = Color(0xFF04030A) // == @color/plajah_splash_bg, index.html #pj-boot
    val Surface     = Color(0xFF0B0A14) // one step up from ground for sheets/cards
    val SurfaceHigh = Color(0xFF141220)

    val TextPrimary   = Color(0xFFF4F2FA)
    val TextSecondary = Color(0xB3FFFFFF) // ~0.70 white — matches --on-surface-variant
    val TextTertiary  = Color(0x73FFFFFF) // ~0.45 white — placeholders

    // Glass overlays (white on dark), the workhorse fills for controls/surfaces
    val Glass1 = Color(0x0DFFFFFF) // 0.05
    val Glass2 = Color(0x14FFFFFF) // 0.08
    val Glass3 = Color(0x1FFFFFFF) // 0.12
    val Glass4 = Color(0x29FFFFFF) // 0.16
    val Glass5 = Color(0x33FFFFFF) // 0.20

    val Border       = Color(0x1FFFFFFF) // --m3-border
    val BorderStrong = Color(0x40FFFFFF) // --m3-border-strong
}

/**
 * SURFACE / INK tokens for the light ground (theme-light / theme-pastel).
 * On light grounds the DS flips the overlays to DARK washes, or glass controls
 * "disappear against paper backgrounds" (plajah-ds.css).
 */
object PlajahLight {
    val Ground      = Color(0xFFF8FAFC)
    val Surface     = Color(0xFFFFFFFF)
    val SurfaceHigh = Color(0xFFFFFFFF)

    val TextPrimary   = Color(0xFF12101A)
    val TextSecondary = Color(0x99000000) // ~0.60 black
    val TextTertiary  = Color(0x66000000)

    val Glass1 = Color(0x08000000) // 0.03
    val Glass2 = Color(0x0D000000) // 0.05
    val Glass3 = Color(0x14000000) // 0.08
    val Glass4 = Color(0x1C000000) // 0.11
    val Glass5 = Color(0x24000000) // 0.14

    val Border       = Color(0x1F000000) // 0.12
    val BorderStrong = Color(0x3D000000) // 0.24
}
