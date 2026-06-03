package com.plajah.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

/**
 * Background media service using Google's Media3 stack.
 * Provides: lock-screen controls, notification shade controls, Android Auto,
 * Google Assistant voice commands ("Hey Google, pause Plajah"),
 * and Alexa Media Player integration via Android's MediaSession protocol.
 *
 * FireTV users get D-pad play/pause/skip via the same MediaSession API.
 */
class PlajahMediaService : MediaSessionService() {

    private var mediaSession: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()

        val player = ExoPlayer.Builder(this).build()

        val sessionActivity = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        mediaSession = MediaSession.Builder(this, player)
            .setSessionActivity(sessionActivity)
            .build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? =
        mediaSession

    override fun onDestroy() {
        mediaSession?.run {
            player.release()
            release()
        }
        mediaSession = null
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Plajah Playback",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Music and video playback controls"
            }
            getSystemService(NotificationManager::class.java)
                .createNotificationChannel(channel)
        }
    }

    companion object {
        const val CHANNEL_ID = "plajah_playback"
    }
}
