package com.plajah.app

import android.content.Context
import com.google.android.gms.cast.framework.CastOptions
import com.google.android.gms.cast.framework.OptionsProvider
import com.google.android.gms.cast.framework.SessionProvider
import com.google.android.gms.cast.framework.media.CastMediaOptions
import com.google.android.gms.cast.framework.media.NotificationOptions

/**
 * Google Cast configuration — registered in AndroidManifest via meta-data.
 * Enables casting to Chromecast, Google Home speakers, Android TV, and
 * any device running the Google Home app.
 */
class PlajahCastOptionsProvider : OptionsProvider {

    override fun getCastOptions(context: Context): CastOptions {
        val notificationOptions = NotificationOptions.Builder()
            .setTargetActivityClassName(MainActivity::class.java.name)
            .build()

        val mediaOptions = CastMediaOptions.Builder()
            .setNotificationOptions(notificationOptions)
            .setExpandedControllerActivityClassName(MainActivity::class.java.name)
            .build()

        return CastOptions.Builder()
            // CC1AD845 = Default Media Receiver. Replace with a custom receiver app ID
            // when a branded Cast experience is built.
            .setReceiverApplicationId("CC1AD845")
            .setCastMediaOptions(mediaOptions)
            .build()
    }

    override fun getAdditionalSessionProviders(context: Context): List<SessionProvider>? = null
}
