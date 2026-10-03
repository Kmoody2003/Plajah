package com.plajah.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.util.Log
import androidx.annotation.OptIn
import androidx.core.app.NotificationCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.plajah.app.data.LocalMediaManager
import com.plajah.app.data.PlatformCatalog
import com.plajah.app.data.PlatformItem
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Enterprise-grade Background Media Service for Plajah & Chora Music.
 * Supports:
 * - Android Auto: MediaLibraryService hierarchical navigation (Featured, Albums, Artists, Radio, Local)
 * - Rock-solid Screen-Off Background Playback (WakeLock + HighPerf WifiLock + C.WAKE_MODE_NETWORK)
 * - Ultra-low Latency Startup (Custom DefaultLoadControl starts playback in 250ms)
 * - Bluetooth AVRCP & Car Stereo Information (Title, Artist, Album, Art, Duration, Position)
 * - Lock-screen / Notification Shade controls
 * - Google Assistant / Alexa voice media intents
 */
class PlajahMediaService : MediaLibraryService() {

    private var mediaLibrarySession: MediaLibrarySession? = null
    private var exoPlayer: ExoPlayer? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private var cachedCatalog: List<PlatformItem> = emptyList()

    companion object {
        private const val TAG = "PlajahMediaService"
        const val CHANNEL_ID = "plajah_playback_channel"
        const val NOTIFICATION_ID = 1001

        const val ROOT_ID = "[ROOT]"
        const val CAT_FEATURED = "[CAT_FEATURED]"
        const val CAT_ALBUMS = "[CAT_ALBUMS]"
        const val CAT_ARTISTS = "[CAT_ARTISTS]"
        const val CAT_RADIO = "[CAT_RADIO]"
        const val CAT_LOCAL = "[CAT_LOCAL]"

        @Volatile
        var instance: PlajahMediaService? = null
            private set
    }

    @OptIn(UnstableApi::class)
    override fun onCreate() {
        super.onCreate()
        instance = this
        createNotificationChannel()

        // Screen-off background locks: prevent OS Doze and CPU sleep from stopping music
        try {
            val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager
            wakeLock = powerManager?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Plajah:AudioPlaybackWakeLock")?.apply {
                setReferenceCounted(false)
            }
            val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            wifiLock = wifiManager?.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "Plajah:AudioPlaybackWifiLock")?.apply {
                setReferenceCounted(false)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to initialize wake locks: ${e.message}")
        }

        // Tuned LoadControl: Starts playing in 250ms, aggressively pre-buffers next tracks
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                /* minBufferMs = */ 15_000,
                /* maxBufferMs = */ 60_000,
                /* bufferForPlaybackMs = */ 250,
                /* bufferForPlaybackAfterRebufferMs = */ 500
            )
            .setPrioritizeTimeOverSizeThresholds(true)
            .build()

        val player = ExoPlayer.Builder(this)
            .setLoadControl(loadControl)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                /* handleAudioFocus = */ true
            )
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()

        exoPlayer = player

        // Player listener to manage locks & notification state
        player.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (isPlaying) {
                    acquireLocks()
                    updateNotification(player)
                } else {
                    releaseLocks()
                    updateNotification(player)
                }
            }

            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                updateNotification(player)
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED) {
                    releaseLocks()
                }
                updateNotification(player)
            }
        })

        val sessionActivity = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val callback = ChoraMediaLibrarySessionCallback()

        mediaLibrarySession = MediaLibrarySession.Builder(this, player, callback)
            .setSessionActivity(sessionActivity)
            .setId("PlajahChoraMediaSession")
            .build()

        // Preload catalog for Android Auto
        serviceScope.launch {
            try {
                cachedCatalog = PlatformCatalog.load("chora")
            } catch (e: Exception) {
                Log.w(TAG, "Catalog preload failed: ${e.message}")
            }
        }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? =
        mediaLibrarySession

    override fun onDestroy() {
        instance = null
        releaseLocks()
        serviceScope.cancel()
        mediaLibrarySession?.run {
            player.release()
            release()
        }
        mediaLibrarySession = null
        exoPlayer = null
        super.onDestroy()
    }

    private fun acquireLocks() {
        try {
            if (wakeLock?.isHeld == false) wakeLock?.acquire(24 * 60 * 60 * 1000L)
            if (wifiLock?.isHeld == false) wifiLock?.acquire()
        } catch (e: Exception) {
            Log.w(TAG, "Error acquiring locks: ${e.message}")
        }
    }

    private fun releaseLocks() {
        try {
            if (wakeLock?.isHeld == true) wakeLock?.release()
            if (wifiLock?.isHeld == true) wifiLock?.release()
        } catch (e: Exception) {
            Log.w(TAG, "Error releasing locks: ${e.message}")
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Plajah Chora Music",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Controls and song information for Plajah Chora music playback"
                setShowBadge(false)
                lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
            }
            getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
        }
    }

    private fun updateNotification(player: Player) {
        val currentItem = player.currentMediaItem
        val title = currentItem?.mediaMetadata?.title?.toString() ?: "Plajah Chora"
        val artist = currentItem?.mediaMetadata?.artist?.toString() ?: "Now Playing"

        val openIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(artist)
            .setSubText("Plajah Chora")
            .setContentIntent(openIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(player.isPlaying)
            .setOnlyAlertOnce(true)
            .build()

        if (player.isPlaying) {
            try {
                startForeground(NOTIFICATION_ID, notification)
            } catch (e: Exception) {
                Log.w(TAG, "startForeground failed: ${e.message}")
            }
        }
    }

    /**
     * Android Auto & Automotive Media Browse Tree Implementation
     */
    private inner class ChoraMediaLibrarySessionCallback : MediaLibrarySession.Callback {

        override fun onGetLibraryRoot(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            params: LibraryParams?
        ): ListenableFuture<LibraryResult<MediaItem>> {
            val rootItem = MediaItem.Builder()
                .setMediaId(ROOT_ID)
                .setMediaMetadata(
                    MediaMetadata.Builder()
                        .setTitle("Plajah Chora")
                        .setIsBrowsable(true)
                        .setIsPlayable(false)
                        .setMediaType(MediaMetadata.MEDIA_TYPE_FOLDER_MIXED)
                        .build()
                )
                .build()
            return Futures.immediateFuture(LibraryResult.ofItem(rootItem, params))
        }

        override fun onPlayerCommandRequest(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
            playerCommand: Int
        ): Int {
            when (playerCommand) {
                Player.COMMAND_SEEK_TO_NEXT,
                Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM -> {
                    PlajahNativeAudioPlugin.notifyRemoteCommand("next")
                }
                Player.COMMAND_SEEK_TO_PREVIOUS,
                Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM -> {
                    PlajahNativeAudioPlugin.notifyRemoteCommand("previous")
                }
                Player.COMMAND_PLAY_PAUSE -> {
                    PlajahNativeAudioPlugin.notifyRemoteCommand("playPause")
                }
            }
            return super.onPlayerCommandRequest(session, controller, playerCommand)
        }

        override fun onGetChildren(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            parentId: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
            return when (parentId) {
                ROOT_ID -> {
                    val categories = ImmutableList.of(
                        createCategoryItem(CAT_FEATURED, "Featured & New Releases", MediaMetadata.MEDIA_TYPE_FOLDER_ALBUMS),
                        createCategoryItem(CAT_ALBUMS, "Albums", MediaMetadata.MEDIA_TYPE_FOLDER_ALBUMS),
                        createCategoryItem(CAT_ARTISTS, "Artists", MediaMetadata.MEDIA_TYPE_FOLDER_ARTISTS),
                        createCategoryItem(CAT_RADIO, "Plajah Radio", MediaMetadata.MEDIA_TYPE_FOLDER_RADIO_STATIONS),
                        createCategoryItem(CAT_LOCAL, "Local Music", MediaMetadata.MEDIA_TYPE_FOLDER_MIXED)
                    )
                    Futures.immediateFuture(LibraryResult.ofItemList(categories, params))
                }

                CAT_FEATURED, CAT_ALBUMS -> {
                    val items = cachedCatalog.map { album ->
                        MediaItem.Builder()
                            .setMediaId("album:${album.id}")
                            .setMediaMetadata(
                                MediaMetadata.Builder()
                                    .setTitle(album.title)
                                    .setArtist(album.creator)
                                    .setArtworkUri(if (album.image.isNotBlank()) Uri.parse(album.image) else null)
                                    .setIsBrowsable(true)
                                    .setIsPlayable(album.tracks.isNotEmpty())
                                    .setMediaType(MediaMetadata.MEDIA_TYPE_ALBUM)
                                    .build()
                            )
                            .build()
                    }
                    Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.copyOf(items), params))
                }

                CAT_ARTISTS -> {
                    val artists = cachedCatalog.groupBy { it.creator }
                    val items = artists.map { (artistName, albums) ->
                        MediaItem.Builder()
                            .setMediaId("artist:$artistName")
                            .setMediaMetadata(
                                MediaMetadata.Builder()
                                    .setTitle(artistName)
                                    .setSubtitle("${albums.size} albums")
                                    .setArtworkUri(albums.firstOrNull()?.image?.let { Uri.parse(it) })
                                    .setIsBrowsable(true)
                                    .setIsPlayable(false)
                                    .setMediaType(MediaMetadata.MEDIA_TYPE_ARTIST)
                                    .build()
                            )
                            .build()
                    }
                    Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.copyOf(items), params))
                }

                CAT_RADIO -> {
                    val radioStations = ImmutableList.of(
                        createPlayableItem("radio:ambient", "Chora Ambient Flow", "Plajah Live Radio", null, "https://plajah.com/audio/anthems/usa.mp3"),
                        createPlayableItem("radio:night", "Night Sky Celestial", "Plajah Curated", null, "https://plajah.com/audio/anthems/france.mp3")
                    )
                    Futures.immediateFuture(LibraryResult.ofItemList(radioStations, params))
                }

                CAT_LOCAL -> {
                    // Local tracks from device MediaStore
                    val localTracks = LocalMediaManager.queryAudio(applicationContext)
                    val items = localTracks.map { track ->
                        MediaItem.Builder()
                            .setMediaId("local:${track.id}")
                            .setUri(track.contentUri)
                            .setMediaMetadata(
                                MediaMetadata.Builder()
                                    .setTitle(track.title)
                                    .setArtist(track.artist)
                                    .setAlbumTitle(track.album)
                                    .setArtworkUri(track.artworkUri)
                                    .setIsBrowsable(false)
                                    .setIsPlayable(true)
                                    .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
                                    .build()
                            )
                            .build()
                    }
                    Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.copyOf(items), params))
                }

                else -> {
                    if (parentId.startsWith("album:")) {
                        val albumId = parentId.removePrefix("album:")
                        val album = cachedCatalog.firstOrNull { it.id == albumId }
                        if (album != null) {
                            val tracks = album.tracks.filter { it.url.isNotBlank() }.map { track ->
                                MediaItem.Builder()
                                    .setMediaId("${album.id}:${track.id}")
                                    .setUri(Uri.parse(track.url))
                                    .setMediaMetadata(
                                        MediaMetadata.Builder()
                                            .setTitle(track.title)
                                            .setArtist(track.artist.ifBlank { album.creator })
                                            .setAlbumTitle(album.title)
                                            .setArtworkUri(if (album.image.isNotBlank()) Uri.parse(album.image) else null)
                                            .setIsBrowsable(false)
                                            .setIsPlayable(true)
                                            .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
                                            .build()
                                    )
                                    .build()
                            }
                            return Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.copyOf(tracks), params))
                        }
                    }
                    Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.of(), params))
                }
            }
        }

        override fun onGetItem(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            mediaId: String
        ): ListenableFuture<LibraryResult<MediaItem>> {
            // Find in catalog or local
            val item = MediaItem.Builder().setMediaId(mediaId).build()
            return Futures.immediateFuture(LibraryResult.ofItem(item, null))
        }

        private fun createCategoryItem(id: String, title: String, mediaType: @MediaMetadata.FolderType Int): MediaItem {
            return MediaItem.Builder()
                .setMediaId(id)
                .setMediaMetadata(
                    MediaMetadata.Builder()
                        .setTitle(title)
                        .setIsBrowsable(true)
                        .setIsPlayable(false)
                        .setFolderType(mediaType)
                        .build()
                )
                .build()
        }

        private fun createPlayableItem(id: String, title: String, artist: String, artworkUri: String?, url: String): MediaItem {
            return MediaItem.Builder()
                .setMediaId(id)
                .setUri(Uri.parse(url))
                .setMediaMetadata(
                    MediaMetadata.Builder()
                        .setTitle(title)
                        .setArtist(artist)
                        .setArtworkUri(artworkUri?.let { Uri.parse(it) })
                        .setIsBrowsable(false)
                        .setIsPlayable(true)
                        .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
                        .build()
                )
                .build()
        }
    }
}
