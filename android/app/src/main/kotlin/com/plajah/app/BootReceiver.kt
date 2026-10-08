package com.plajah.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.util.Log

/**
 * Signage / receiver TVs: bring Plajah back after a power cut.
 *
 * Only acts when the web layer opted in (PlajahDevice.setAutostartOnBoot → [PREF_AUTOSTART]).
 * Android 10+ blocks activity starts from the background unless the app holds
 * SYSTEM_ALERT_WINDOW ("Display over other apps"); without it the start is attempted anyway (some
 * TV firmwares allow it) and the outcome is logged — `adb logcat -s PlajahBoot`. Installers can
 * grant it on TVs that have no settings screen for it:
 *     adb shell appops set com.plajah.app SYSTEM_ALERT_WINDOW allow
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action !in BOOT_ACTIONS) return
        if (!isAutostartEnabled(context)) return
        val canOverlay = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || Settings.canDrawOverlays(context)
        Log.i(TAG, "boot ($action): autostart on, overlay permission=$canOverlay — launching MainActivity")
        try {
            context.startActivity(Intent(context, MainActivity::class.java)
                .setAction(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED))
        } catch (t: Throwable) {
            Log.w(TAG, "autostart launch failed: ${t.message}")
        }
    }

    companion object {
        private const val TAG = "PlajahBoot"
        const val PREFS = "plajah_device"
        const val PREF_AUTOSTART = "autostart_on_boot"
        private val BOOT_ACTIONS = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON",
        )

        fun isAutostartEnabled(ctx: Context): Boolean =
            ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(PREF_AUTOSTART, false)

        fun setAutostartEnabled(ctx: Context, enabled: Boolean) {
            ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putBoolean(PREF_AUTOSTART, enabled).apply()
        }
    }
}
