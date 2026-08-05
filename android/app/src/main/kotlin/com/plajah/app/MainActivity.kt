package com.plajah.app

import android.app.UiModeManager
import android.content.Context
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Bundle
import android.util.Log
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {

    /**
     * Tell the web layer, authoritatively, that this is a television.
     *
     * The WebView user-agent on Android TV and Fire TV is an ordinary Android UA — it contains
     * "Android" and no dependable TV token — so JS-side sniffing was guessing, and guessing
     * wrong: the app booted into the phone layout on a TV. Android itself knows the answer; it
     * simply had no way to reach JavaScript.
     *
     * Two independent OS signals, either sufficient:
     *   - UiModeManager UI_MODE_TYPE_TELEVISION — the running UI mode.
     *   - FEATURE_LEANBACK / type.television — the device declares D-pad-only TV hardware.
     *
     * The verdict rides on the user-agent because that is readable synchronously on the first
     * paint; a JS global injected after page load arrives after the layout has been chosen.
     */
    private fun isTelevision(): Boolean {
        var uiMode = false
        var leanback = false
        var tvFeature = false
        try {
            val ui = getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
            uiMode = ui?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION
        } catch (_: Exception) { /* leave false */ }
        try {
            packageManager?.let {
                leanback = it.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
                tvFeature = it.hasSystemFeature("android.hardware.type.television")
            }
        } catch (_: Exception) { /* leave false */ }

        val isTv = uiMode || leanback || tvFeature
        // Logged because this verdict has been wrong on real hardware and there is no other way
        // to see it on a TV: `adb logcat -s PlajahTV` gives ground truth in one line.
        Log.i(TAG, "TV detection: uiModeTelevision=$uiMode leanback=$leanback televisionFeature=$tvFeature -> isTV=$isTv")
        return isTv
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        // Capacitor requires custom plugins to be registered BEFORE super.onCreate builds the
        // bridge — after that the registry is sealed and the JS `WatchNext` proxy resolves to
        // nothing. It writes the TV home-screen "continue watching" row (Reello + Taleo); on a
        // phone the plugin loads but every method reports unsupported, so this is harmless there.
        registerPlugin(WatchNextPlugin::class.java)

        installSplashScreen()
        super.onCreate(savedInstanceState)
        // Render edge-to-edge — Compose and the WebView both respect system bar insets
        WindowCompat.setDecorFitsSystemWindows(window, false)

        if (!isTelevision()) return

        // Keep D-pad keys inside the WebView.
        //
        // Observed on the TCL: pressing Left at the leftmost element walked focus OUT of the app
        // and into the system UI. The web layer already consumes arrow keys (preventDefault +
        // stopImmediatePropagation in TVNavigationLayer), but that only runs if the WebView holds
        // Android focus. When it doesn't, the framework routes the key to the Activity and then
        // out of the app, and a viewer browsing Chora can fall out of Plajah entirely by pressing
        // left one time too many.
        try {
            bridge?.webView?.apply {
                isFocusable = true
                isFocusableInTouchMode = true
                // The WebView is the only focusable thing here; taking focus explicitly stops the
                // framework looking for a "next" view outside it.
                requestFocus()
            }
        } catch (e: Exception) {
            Log.w(TAG, "WebView focus setup failed: ${e.message}")
        }

        try {
            val settings = bridge?.webView?.settings ?: run {
                Log.w(TAG, "TV detected but WebView unavailable — web layer falls back to heuristics")
                return
            }
            // Honour the page's viewport meta.
            //
            // Android WebView IGNORES `width=` in <meta name="viewport"> unless wide-viewport
            // mode is on. Without this the WebView reports a 960px CSS viewport (1920 physical
            // at density 320) no matter what the page asks for — which is why setting
            // width=1280 and then 1600 changed nothing on the device, and why the UI kept
            // rendering at roughly 2x. Verified over CDP: window.innerWidth was still 960.
            settings.useWideViewPort = true
            settings.loadWithOverviewMode = true

            val ua = settings.userAgentString
            // Idempotent: onCreate runs again after a configuration change.
            if (ua != null && !ua.contains(TV_TOKEN)) {
                settings.userAgentString = "$ua $TV_TOKEN"
                Log.i(TAG, "UA tagged: ${settings.userAgentString}")
            }
        } catch (e: Exception) {
            // Worst case the UA is untouched and the web layer falls back to its own heuristics.
            Log.w(TAG, "UA tagging failed: ${e.message}")
        }
    }

    companion object {
        private const val TAG = "PlajahTV"
        private const val TV_TOKEN = "PlajahTV/1"
    }
}
