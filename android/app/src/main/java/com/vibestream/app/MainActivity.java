package com.vibestream.app;

import android.app.UiModeManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "PlajahTV";

    /**
     * Tell the web layer, authoritatively, that this is a television.
     *
     * The WebView user-agent on Android TV and Fire TV is an ordinary Android UA — it contains
     * "Android" and carries no dependable TV token — so JS-side sniffing was guessing, and
     * guessing wrong: the app booted into the phone layout on TVs. Android itself knows the
     * answer; it simply had no way to reach JavaScript.
     *
     * Two independent OS signals, either sufficient:
     *   - UiModeManager UI_MODE_TYPE_TELEVISION — the running UI mode.
     *   - FEATURE_LEANBACK — the device declares D-pad-only "leanback" hardware.
     *
     * The verdict rides on the user-agent rather than a JS global because the UA is readable
     * synchronously on the very first paint. A global injected after page load would arrive
     * after the app had already picked a layout — the same race that made this unreliable.
     */
    private boolean isTelevision() {
        boolean uiMode = false, leanback = false, tvFeature = false;
        try {
            UiModeManager ui = (UiModeManager) getSystemService(Context.UI_MODE_SERVICE);
            uiMode = ui != null && ui.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION;
        } catch (Exception ignored) { /* leave false */ }
        try {
            PackageManager pm = getPackageManager();
            if (pm != null) {
                leanback  = pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK);
                tvFeature = pm.hasSystemFeature("android.hardware.type.television");
            }
        } catch (Exception ignored) { /* leave false */ }

        // Logged because this verdict has been wrong on real hardware and there is no other way
        // to see it on a TV: `adb logcat -s PlajahTV` gives the ground truth in one line.
        Log.i(TAG, "TV detection: uiModeTelevision=" + uiMode
                + " leanback=" + leanback + " televisionFeature=" + tvFeature
                + " -> isTV=" + (uiMode || leanback || tvFeature));

        return uiMode || leanback || tvFeature;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (!isTelevision() || getBridge() == null || getBridge().getWebView() == null) return;
        try {
            WebSettings settings = getBridge().getWebView().getSettings();
            String ua = settings.getUserAgentString();
            // Idempotent: onCreate runs again after a configuration change.
            if (ua != null && !ua.contains("PlajahTV/1")) {
                settings.setUserAgentString(ua + " PlajahTV/1");
                Log.i(TAG, "UA tagged: " + settings.getUserAgentString());
            }
        } catch (Exception ignored) {
            // Worst case the UA is untouched and the web layer falls back to its heuristics.
        }
    }
}
