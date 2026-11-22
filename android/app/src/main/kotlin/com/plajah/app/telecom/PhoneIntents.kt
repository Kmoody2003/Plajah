package com.plajah.app.telecom

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import org.json.JSONObject

/**
 * Turns the OS intents Plajah receives as the default Phone / SMS app into a "phone" launch:
 *
 *  - ACTION_DIAL / ACTION_VIEW tel:   → open the keypad with the number filled in
 *  - ACTION_SENDTO / SEND sms|smsto|mms|mmsto → open the texting thread for that address (+ body)
 *  - EXTRA_OPEN_CALL (our own incoming / ongoing call notification) → open the in-call screen,
 *    on top of the lock screen
 *
 * MainActivity treats a non-null result as the "phone" experience (start path /?view=phone or a
 * warm launchExperience event); the details wait in [pending] until the web PhoneHub pulls them
 * with PlajahTelecom.getPendingLaunch().
 */
object PhoneIntents {
    const val EXTRA_OPEN_CALL = "com.plajah.app.telecom.OPEN_CALL"
    const val EXPERIENCE = "phone"

    @Volatile var pending: JSONObject? = null

    /** Parse [intent]; when it is a phone/SMS intent store it, apply lock-screen flags, return "phone". */
    fun capture(activity: Activity, intent: Intent?): String? {
        val launch = parse(intent) ?: return null
        pending = launch
        PlajahTelecomPlugin.instance?.emitLaunch(launch)
        if (launch.optString("kind") == "call") showOverLockScreen(activity)
        return EXPERIENCE
    }

    fun parse(intent: Intent?): JSONObject? {
        intent ?: return null
        if (intent.getBooleanExtra(EXTRA_OPEN_CALL, false)) {
            return JSONObject().put("kind", "call").put("callId", intent.getStringExtra("callId") ?: "")
        }
        val data: Uri? = intent.data
        val scheme = data?.scheme?.lowercase()
        return when (intent.action) {
            Intent.ACTION_DIAL, Intent.ACTION_VIEW, "android.intent.action.CALL_BUTTON" -> when {
                scheme == "tel" -> JSONObject().put("kind", "dial").put("number", data!!.schemeSpecificPart ?: "")
                intent.action == Intent.ACTION_DIAL || intent.action == "android.intent.action.CALL_BUTTON" ->
                    JSONObject().put("kind", "dial").put("number", "")
                scheme in SMS_SCHEMES -> smsLaunch(data!!, intent)
                else -> null
            }
            Intent.ACTION_SENDTO, Intent.ACTION_SEND -> if (scheme in SMS_SCHEMES) smsLaunch(data!!, intent) else null
            else -> null
        }
    }

    private fun smsLaunch(data: Uri, intent: Intent): JSONObject {
        // sms:+15551234567,+15557654321?body=hi  — schemeSpecificPart keeps the query on opaque URIs
        val ssp = data.schemeSpecificPart ?: ""
        val addresses = ssp.substringBefore('?').split(',', ';').map { it.trim() }.filter { it.isNotEmpty() }
        val queryBody = ssp.substringAfter('?', "").split('&')
            .firstOrNull { it.startsWith("body=") }?.removePrefix("body=")?.let { Uri.decode(it) }
        val body = intent.getStringExtra("sms_body") ?: intent.getStringExtra(Intent.EXTRA_TEXT) ?: queryBody ?: ""
        return JSONObject()
            .put("kind", "sms")
            .put("addresses", org.json.JSONArray(addresses))
            .put("body", body)
    }

    @Suppress("DEPRECATION")
    private fun showOverLockScreen(activity: Activity) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                activity.setShowWhenLocked(true)
                activity.setTurnScreenOn(true)
                // No requestDismissKeyguard: answering a call must not demand the PIN first.
            } else {
                activity.window.addFlags(
                    android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                        android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                )
            }
        } catch (_: Exception) { /* cosmetic */ }
    }

    private val SMS_SCHEMES = setOf("sms", "smsto", "mms", "mmsto")
}
