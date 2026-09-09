package com.plajah.app.ui

import android.content.Context

/**
 * Which front-end the app shows: the Capacitor WebView ("Classic") or the native
 * Jetpack Compose shell ("Native"). This is the native mirror of the web's
 * per-device toggle precedent (hooks/useShellNext.ts — key `plajah_shell_next`).
 *
 * Default is Classic: the web app is the shipped experience and stays fully alive;
 * Native is opt-in, exactly as "Try New Nav" is opt-in on the web. Both shells read
 * and write this one flag, so a switch in either direction survives a restart.
 */
object ShellPrefs {
    private const val PREFS = "plajah_shell"
    private const val KEY_NATIVE = "plajah_native_shell"

    private fun prefs(ctx: Context) =
        ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun isNativeEnabled(ctx: Context): Boolean =
        prefs(ctx).getBoolean(KEY_NATIVE, false)

    fun setNativeEnabled(ctx: Context, enabled: Boolean) {
        prefs(ctx).edit().putBoolean(KEY_NATIVE, enabled).apply()
    }

    // ── Native-shell user preferences (persisted the same way) ──────────────
    private const val KEY_DYNAMIC = "plajah_dynamic_tint"

    /** Material You wallpaper tint on neutral surfaces. Off by default — brand leads. */
    fun isDynamicTint(ctx: Context): Boolean =
        prefs(ctx).getBoolean(KEY_DYNAMIC, false)

    fun setDynamicTint(ctx: Context, enabled: Boolean) {
        prefs(ctx).edit().putBoolean(KEY_DYNAMIC, enabled).apply()
    }
}
