package com.plajah.app

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * How the web layer learns WHY the app was launched (JS side: services/launchService.ts).
 *
 *  - Cold "Open with": MainActivity starts the WebView at /?open=media, index.tsx boots the light
 *    LocalMediaLaunch viewer, and it PULLS the file with getLaunchMedia(). Pull, not push, so the
 *    payload can't be lost to a listener that isn't registered yet.
 *  - Warm re-entry (singleTask onNewIntent): MainActivity pushes `launchMedia` / `launchExperience`
 *    events, retained until a listener consumes them.
 *
 * Cold experience-icon launches need nothing here: the slug rides in the start path (?view=<slug>).
 */
@CapacitorPlugin(name = "PlajahLaunch")
class PlajahLaunchPlugin : Plugin() {

    @PluginMethod
    fun getLaunchMedia(call: PluginCall) {
        val result = JSObject()
        pendingMediaJson?.let { result.put("payload", it) }
        call.resolve(result)
    }

    fun emitMedia(json: String) = notifyListeners("launchMedia", JSObject().put("payload", json), true)

    fun emitExperience(slug: String) = notifyListeners("launchExperience", JSObject().put("experience", slug), true)

    companion object {
        /** OPEN_MEDIA_FILE payload for the cold-start file, set by MainActivity before the bridge loads. */
        @Volatile var pendingMediaJson: String? = null
    }
}
