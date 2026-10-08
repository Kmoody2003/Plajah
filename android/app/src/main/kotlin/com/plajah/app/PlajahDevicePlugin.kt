package com.plajah.app

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Device-level switches for signage / receiver installs (JS: services/tv/tvAutostartBridge.ts).
 *
 *  - setAutostartOnBoot({enabled}) / getAutostartOnBoot(): the flag BootReceiver reads.
 *  - canAutostart(): {granted} — whether Android will actually let the boot launch through
 *    (Android 10+ needs "Display over other apps" / SYSTEM_ALERT_WINDOW for background starts).
 *  - requestAutostartPermission(): opens that settings screen; {opened:false} where the firmware
 *    has none (common on Android TV) — then an installer runs
 *    `adb shell appops set com.plajah.app SYSTEM_ALERT_WINDOW allow`.
 */
@CapacitorPlugin(name = "PlajahDevice")
class PlajahDevicePlugin : Plugin() {

    @PluginMethod
    fun setAutostartOnBoot(call: PluginCall) {
        val enabled = call.getBoolean("enabled", false) == true
        BootReceiver.setAutostartEnabled(context, enabled)
        call.resolve(JSObject().put("enabled", enabled))
    }

    @PluginMethod
    fun getAutostartOnBoot(call: PluginCall) {
        call.resolve(JSObject().put("enabled", BootReceiver.isAutostartEnabled(context)))
    }

    @PluginMethod
    fun canAutostart(call: PluginCall) {
        call.resolve(JSObject().put("granted", overlayGranted()))
    }

    @PluginMethod
    fun requestAutostartPermission(call: PluginCall) {
        if (overlayGranted()) { call.resolve(JSObject().put("opened", false).put("granted", true)); return }
        val pkg = Uri.parse("package:${context.packageName}")
        val attempts = listOf(
            Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, pkg),
            Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION),
        )
        for (i in attempts) {
            try {
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                val act = activity
                if (act != null) act.startActivity(i) else context.startActivity(i)
                call.resolve(JSObject().put("opened", true).put("granted", false))
                return
            } catch (_: ActivityNotFoundException) {
            } catch (t: Throwable) {
                Log.w(TAG, "overlay settings launch failed: ${t.message}")
            }
        }
        call.resolve(JSObject().put("opened", false).put("granted", false)
            .put("adb", "adb shell appops set ${context.packageName} SYSTEM_ALERT_WINDOW allow"))
    }

    private fun overlayGranted(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)

    companion object { private const val TAG = "PlajahDevice" }
}
