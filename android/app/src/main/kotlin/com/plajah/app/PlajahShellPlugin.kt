package com.plajah.app

import android.content.Intent
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.plajah.app.ui.ShellPrefs

/**
 * Bridge that lets the WEB (Capacitor) shell hand off to the NATIVE Compose shell.
 *
 * The reverse direction (native → web) is pure native (NativeActivity calls back
 * into MainActivity), so this plugin only needs the web → native path plus a
 * getter for the current mode.
 *
 * Web wiring (mirrors hooks/useShellNext.ts — one small addition in the app's
 * settings/appearance surface):
 *
 *   import { registerPlugin } from '@capacitor/core';
 *   const PlajahShell = registerPlugin('PlajahShell');
 *   // in a "Switch to Native (beta)" toggle, native platform only:
 *   await PlajahShell.switchToNative();
 *
 * `isNativeEnabled()` lets the web settings row show the current state.
 */
@CapacitorPlugin(name = "PlajahShell")
class PlajahShellPlugin : Plugin() {

    @PluginMethod
    fun switchToNative(call: PluginCall) {
        val ctx = context ?: run { call.reject("no context"); return }
        val act = activity ?: run { call.reject("No active Android activity"); return }
        act.runOnUiThread {
            try {
                ShellPrefs.setNativeEnabled(ctx, true)
                act.startActivity(Intent(act, NativeActivity::class.java))
                call.resolve()
                act.finish()
            } catch (e: Exception) {
                ShellPrefs.setNativeEnabled(ctx, false)
                call.reject("Could not open native shell", e)
            }
        }
    }

    @PluginMethod
    fun isNativeEnabled(call: PluginCall) {
        val ctx = context
        val enabled = ctx != null && ShellPrefs.isNativeEnabled(ctx)
        call.resolve(JSObject().put("enabled", enabled))
    }
}
