package com.plajah.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.annotation.OptIn
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
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
import com.google.common.util.concurrent.SettableFuture
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
    private val mainHandler = Handler(Looper.getMainLooper())

    // The WebView <audio> element is the real player for web-driven Chora; ExoPlayer here only
    // mirrors metadata and never plays. Without this flag the service never became a foreground
    // service (ExoPlayer.isPlaying is always false), so the moment the screen went off Android was
    // free to freeze the WebView process and its network — the next HLS segment / next track simply
    // never arrived. While the web player is playing we hold a mediaPlayback foreground service plus
    // the partial wake lock and the Wi-Fi lock.
    @Volatile private var webPlaybackActive = false
    private val stopWebPlaybackRunnable = Runnable { stopWebPlayback() }

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

        const val ACTION_WEB_PLAYBACK = "com.plajah.app.action.WEB_PLAYBACK"
        const val EXTRA_TITLE = "title"
        const val EXTRA_ARTIST = "artist"

        /** Hand-off blips between tracks pause the element for a moment; don't tear the service down for those. */
        private const val WEB_STOP_GRACE_MS = 8_000L

        @Volatile
        var instance: PlajahMediaService? = null
            private set

        /**
         * Called by PlajahNativeAudioPlugin when the web player starts/stops. Starting is an explicit
         * startForegroundService so the process is promoted; stopping is delayed by a short grace
         * period so a track change doesn't flap the service.
         */
        fun setWebPlayback(context: Context, active: Boolean, title: String, artist: String) {
            if (active) {
                val intent = Intent(context, PlajahMediaService::class.java)
                    .setAction(ACTION_WEB_PLAYBACK)
                    .putExtra(EXTRA_TITLE, title)
                    .putExtra(EXTRA_ARTIST, artist)
                try {
                    ContextCompat.startForegroundService(context, intent)
                } catch (e: Exception) {
                    // Android 12+ refuses to start a foreground service from the background; playback
                    // that began in the foreground has already promoted the service, so this is rare.
                    Log.w(TAG, "startForegroundService refused: ${e.message}")
                }
            } else {
                instance?.scheduleWebPlaybackStop()
            }
        }
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
                    if (!webPlaybackActive) releaseLocks()
                    updateNotification(player)
                }
            }

            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                updateNotification(player)
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED && !webPlaybackActive) {
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

        // Preload catalog for Android Auto & notify connected car head units once ready
        serviceScope.launch {
            ensureCatalogLoaded()
        }
    }

    private suspend fun ensureCatalogLoaded(): List<PlatformItem> {
        if (cachedCatalog.isNotEmpty()) return cachedCatalog
        return try {
            val loaded = PlatformCatalog.load("chora")
            if (loaded.isNotEmpty()) {
                cachedCatalog = loaded
                mediaLibrarySession?.notifyChildrenChanged(ROOT_ID, 5, null)
                mediaLibrarySession?.notifyChildrenChanged(CAT_FEATURED, loaded.size, null)
                mediaLibrarySession?.notifyChildrenChanged(CAT_ALBUMS, loaded.size, null)
                mediaLibrarySession?.notifyChildrenChanged(CAT_ARTISTS, loaded.groupBy { it.creator }.size, null)
            }
            cachedCatalog
        } catch (e: Exception) {
            Log.w(TAG, "Catalog load failed: ${e.message}")
            cachedCatalog
        }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? =
        mediaLibrarySession

    @OptIn(UnstableApi::class)
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_WEB_PLAYBACK) {
            startWebPlayback(
                intent.getStringExtra(EXTRA_TITLE) ?: "Plajah Chora",
                intent.getStringExtra(EXTRA_ARTIST) ?: "Now Playing"
            )
            return START_NOT_STICKY
        }
        return super.onStartCommand(intent, flags, startId)
    }

    /** Promote to a mediaPlayback foreground service + take the locks. Must run promptly after startForegroundService. */
    private fun startWebPlayback(title: String, artist: String) {
        mainHandler.removeCallbacks(stopWebPlaybackRunnable)
        webPlaybackActive = true
        val openIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(artist)
            .setSubText("Plajah Chora")
            .setContentIntent(openIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build()
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            Log.w(TAG, "startForeground (web playback) failed: ${e.message}")
        }
        acquireLocks()
    }

    fun scheduleWebPlaybackStop() {
        mainHandler.removeCallbacks(stopWebPlaybackRunnable)
        mainHandler.postDelayed(stopWebPlaybackRunnable, WEB_STOP_GRACE_MS)
    }

    private fun stopWebPlayback() {
        if (!webPlaybackActive) return
        webPlaybackActive = false
        if (exoPlayer?.isPlaying != true) {
            releaseLocks()
            try {
                stopForeground(STOP_FOREGROUND_REMOVE)
            } catch (e: Exception) {
                Log.w(TAG, "stopForeground failed: ${e.message}")
            }
        }
    }

    override fun onDestroy() {
        mainHandler.removeCallbacks(stopWebPlaybackRunnable)
        webPlaybackActive = false
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
     * Full Android Auto & Automotive OS MediaLibraryService implementation.
     * Supports:
     * - Grid/list content-style hints for car displays
     * - Live async catalog hydration (Featured, Albums, Artists -> Artist Albums -> Tracks, Radio, Local)
     * - onAddMediaItems / onSetMediaItems URI & queue resolution (required by Media3 for car playback!)
     * - Voice search (onSearch + onGetSearchResult) for "Hey Google, play ... on Plajah"
     * - Playback resumption (onPlaybackResumption) when reconnecting to a vehicle head unit
     */
    @UnstableApi
    private inner class ChoraMediaLibrarySessionCallback : MediaLibrarySession.Callback {

        private val radioStations = listOf(
            Triple("radio:ambient", "Chora Ambient Flow", "https://plajah.com/audio/anthems/usa.mp3"),
            Triple("radio:night", "Night Sky Celestial", "https://plajah.com/audio/anthems/france.mp3"),
            Triple("radio:afro", "Plajah Afrobeat Club", "https://plajah.com/audio/anthems/ghana.mp3"),
            Triple("radio:synth", "Tokyo Synthwave 2088", "https://plajah.com/audio/anthems/japan.mp3"),
        )

        private fun autoStyleExtras(gridBrowsable: Boolean): Bundle = Bundle().apply {
            putBoolean("android.media.browse.CONTENT_STYLE_SUPPORTED", true)
            putInt("android.media.browse.CONTENT_STYLE_BROWSABLE_HINT", if (gridBrowsable) 2 else 1)
            putInt("android.media.browse.CONTENT_STYLE_PLAYABLE_HINT", 1)
        }

        private fun albumToMediaItem(album: PlatformItem): MediaItem =
            MediaItem.Builder()
                .setMediaId("album:${album.id}")
                .setMediaMetadata(
                    MediaMetadata.Builder()
                        .setTitle(album.title)
                        .setArtist(album.creator)
                        .setSubtitle(album.genre.ifBlank { "${album.tracks.size} tracks" })
                        .setArtworkUri(if (album.image.isNotBlank()) Uri.parse(album.image) else null)
                        .setIsBrowsable(true)
                        .setIsPlayable(album.tracks.any { it.url.isNotBlank() })
                        .setMediaType(MediaMetadata.MEDIA_TYPE_ALBUM)
                        .build()
                )
                .build()

        private fun trackToMediaItem(album: PlatformItem, track: com.plajah.app.data.PlatformTrack): MediaItem =
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

        private fun resolveMediaItem(mediaId: String): List<MediaItem> {
            // 1. Radio station
            radioStations.firstOrNull { it.first == mediaId }?.let { (id, title, url) ->
                return listOf(createPlayableItem(id, title, "Plajah Live Radio", null, url))
            }
            // 2. Local MediaStore track
            if (mediaId.startsWith("local:")) {
                val localId = mediaId.removePrefix("local:").toLongOrNull()
                val track = LocalMediaManager.queryAudio(applicationContext).firstOrNull { it.id == localId }
                if (track != null) {
                    return listOf(
                        MediaItem.Builder()
                            .setMediaId(mediaId)
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
                    )
                }
            }
            // 3. Whole album tapped for direct playback
            if (mediaId.startsWith("album:")) {
                val albumId = mediaId.removePrefix("album:")
                val album = cachedCatalog.firstOrNull { it.id == albumId }
                if (album != null) {
                    return album.tracks.filter { it.url.isNotBlank() }.map { trackToMediaItem(album, it) }
                }
            }
            // 4. Specific track "<albumId>:<trackId>"
            if (mediaId.contains(":")) {
                val albumId = mediaId.substringBefore(":")
                val trackId = mediaId.substringAfter(":")
                val album = cachedCatalog.firstOrNull { it.id == albumId }
                val track = album?.tracks?.firstOrNull { it.id == trackId && it.url.isNotBlank() }
                if (album != null && track != null) {
                    return listOf(trackToMediaItem(album, track))
                }
            }
            return emptyList()
        }

        override fun onGetLibraryRoot(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            params: LibraryParams?
        ): ListenableFuture<LibraryResult<MediaItem>> {
            val rootExtras = autoStyleExtras(gridBrowsable = true)
            val rootParams = LibraryParams.Builder()
                .setExtras(rootExtras)
                .setOffline(params?.isOffline == true)
                .setRecent(params?.isRecent == true)
                .setSuggested(params?.isSuggested == true)
                .build()
            val rootItem = MediaItem.Builder()
                .setMediaId(ROOT_ID)
                .setMediaMetadata(
                    MediaMetadata.Builder()
                        .setTitle("Plajah Chora")
                        .setIsBrowsable(true)
                        .setIsPlayable(false)
                        .setMediaType(MediaMetadata.MEDIA_TYPE_FOLDER_MIXED)
                        .setExtras(rootExtras)
                        .build()
                )
                .build()
            return Futures.immediateFuture(LibraryResult.ofItem(rootItem, rootParams))
        }

        override fun onPlayerCommandRequest(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
            playerCommand: Int
        ): Int {
            val webMirror = session.player.currentMediaItem?.mediaId?.startsWith("web_sync:") == true
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
            if (webMirror && (playerCommand == Player.COMMAND_PLAY_PAUSE ||
                    playerCommand == Player.COMMAND_SEEK_TO_NEXT ||
                    playerCommand == Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM ||
                    playerCommand == Player.COMMAND_SEEK_TO_PREVIOUS ||
                    playerCommand == Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)) {
                return SessionResult.RESULT_INFO_SKIPPED
            }
            return super.onPlayerCommandRequest(session, controller, playerCommand)
        }

        override fun onAddMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>
        ): ListenableFuture<MutableList<MediaItem>> {
            val future = SettableFuture.create<MutableList<MediaItem>>()
            serviceScope.launch {
                if (cachedCatalog.isEmpty()) ensureCatalogLoaded()
                val resolved = mutableListOf<MediaItem>()
                for (item in mediaItems) {
                    if (item.localConfiguration?.uri != null) {
                        resolved.add(item)
                    } else {
                        val found = resolveMediaItem(item.mediaId)
                        if (found.isNotEmpty()) resolved.addAll(found) else resolved.add(item)
                    }
                }
                future.set(resolved)
            }
            return future
        }

        override fun onSetMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>,
            startIndex: Int,
            startPositionMs: Long
        ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
            val future = SettableFuture.create<MediaSession.MediaItemsWithStartPosition>()
            serviceScope.launch {
                if (cachedCatalog.isEmpty()) ensureCatalogLoaded()
                // When Android Auto selects a single track "<albumId>:<trackId>", load the full album queue
                // starting at that track so Skip Next / Skip Previous work seamlessly from the steering wheel!
                if (mediaItems.size == 1 && mediaItems[0].localConfiguration?.uri == null) {
                    val id = mediaItems[0].mediaId
                    if (id.contains(":") && !id.startsWith("album:") && !id.startsWith("radio:") && !id.startsWith("local:") && !id.startsWith("web_sync:")) {
                        val albumId = id.substringBefore(":")
                        val trackId = id.substringAfter(":")
                        val album = cachedCatalog.firstOrNull { it.id == albumId }
                        if (album != null) {
                            val playable = album.tracks.filter { it.url.isNotBlank() }
                            val queue = playable.map { trackToMediaItem(album, it) }
                            val idx = playable.indexOfFirst { it.id == trackId }.coerceAtLeast(0)
                            if (queue.isNotEmpty()) {
                                future.set(MediaSession.MediaItemsWithStartPosition(queue, idx, startPositionMs))
                                return@launch
                            }
                        }
                    }
                }
                val resolved = mutableListOf<MediaItem>()
                for (item in mediaItems) {
                    if (item.localConfiguration?.uri != null) {
                        resolved.add(item)
                    } else {
                        val found = resolveMediaItem(item.mediaId)
                        if (found.isNotEmpty()) resolved.addAll(found) else resolved.add(item)
                    }
                }
                val safeIndex = startIndex.coerceIn(0, (resolved.size - 1).coerceAtLeast(0))
                future.set(MediaSession.MediaItemsWithStartPosition(resolved, safeIndex, startPositionMs))
            }
            return future
        }

        override fun onPlaybackResumption(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo
        ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
            val future = SettableFuture.create<MediaSession.MediaItemsWithStartPosition>()
            serviceScope.launch {
                val catalog = ensureCatalogLoaded()
                val firstPlayable = catalog.firstOrNull { album -> album.tracks.any { it.url.isNotBlank() } }
                val queue = if (firstPlayable != null) {
                    firstPlayable.tracks.filter { it.url.isNotBlank() }.map { trackToMediaItem(firstPlayable, it) }
                } else {
                    radioStations.map { (id, title, url) -> createPlayableItem(id, title, "Plajah Live Radio", null, url) }
                }
                future.set(MediaSession.MediaItemsWithStartPosition(queue, 0, C.TIME_UNSET))
            }
            return future
        }

        override fun onGetChildren(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            parentId: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
            if (parentId == ROOT_ID) {
                val categories = ImmutableList.of(
                    createCategoryItem(CAT_FEATURED, "Featured & New", MediaMetadata.MEDIA_TYPE_FOLDER_ALBUMS, grid = true),
                    createCategoryItem(CAT_ALBUMS, "Albums", MediaMetadata.MEDIA_TYPE_FOLDER_ALBUMS, grid = true),
                    createCategoryItem(CAT_ARTISTS, "Artists", MediaMetadata.MEDIA_TYPE_FOLDER_ARTISTS, grid = false),
                    createCategoryItem(CAT_RADIO, "Plajah Radio", MediaMetadata.MEDIA_TYPE_FOLDER_RADIO_STATIONS, grid = false),
                    createCategoryItem(CAT_LOCAL, "Local Music", MediaMetadata.MEDIA_TYPE_FOLDER_MIXED, grid = false)
                )
                return Futures.immediateFuture(LibraryResult.ofItemList(categories, params))
            }
            if (parentId == CAT_RADIO) {
                val items = radioStations.map { (id, title, url) ->
                    createPlayableItem(id, title, "Plajah Live Radio", null, url)
                }
                return Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.copyOf(items), params))
            }
            if (parentId == CAT_LOCAL) {
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
                return Futures.immediateFuture(LibraryResult.ofItemList(ImmutableList.copyOf(items), params))
            }

            val future = SettableFuture.create<LibraryResult<ImmutableList<MediaItem>>>()
            serviceScope.launch {
                val catalog = ensureCatalogLoaded()
                val items: List<MediaItem> = when {
                    parentId == CAT_FEATURED -> catalog.take(24).map { albumToMediaItem(it) }
                    parentId == CAT_ALBUMS -> catalog.map { albumToMediaItem(it) }
                    parentId == CAT_ARTISTS -> {
                        catalog.groupBy { it.creator.ifBlank { "Plajah Artist" } }.map { (artistName, albums) ->
                            MediaItem.Builder()
                                .setMediaId("artist:$artistName")
                                .setMediaMetadata(
                                    MediaMetadata.Builder()
                                        .setTitle(artistName)
                                        .setSubtitle("${albums.size} release${if (albums.size == 1) "" else "s"}")
                                        .setArtworkUri(albums.firstOrNull()?.image?.takeIf { it.isNotBlank() }?.let { Uri.parse(it) })
                                        .setIsBrowsable(true)
                                        .setIsPlayable(false)
                                        .setMediaType(MediaMetadata.MEDIA_TYPE_ARTIST)
                                        .build()
                                )
                                .build()
                        }
                    }
                    parentId.startsWith("artist:") -> {
                        val artistName = parentId.removePrefix("artist:")
                        catalog.filter { it.creator.equals(artistName, ignoreCase = true) }.map { albumToMediaItem(it) }
                    }
                    parentId.startsWith("album:") -> {
                        val albumId = parentId.removePrefix("album:")
                        val album = catalog.firstOrNull { it.id == albumId }
                        album?.tracks?.filter { it.url.isNotBlank() }?.map { trackToMediaItem(album, it) } ?: emptyList()
                    }
                    else -> emptyList()
                }
                future.set(LibraryResult.ofItemList(ImmutableList.copyOf(items), params))
            }
            return future
        }

        override fun onGetItem(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            mediaId: String
        ): ListenableFuture<LibraryResult<MediaItem>> {
            val future = SettableFuture.create<LibraryResult<MediaItem>>()
            serviceScope.launch {
                if (cachedCatalog.isEmpty()) ensureCatalogLoaded()
                val found = resolveMediaItem(mediaId).firstOrNull()
                if (found != null) {
                    future.set(LibraryResult.ofItem(found, null))
                } else {
                    future.set(LibraryResult.ofError(LibraryResult.RESULT_ERROR_BAD_VALUE))
                }
            }
            return future
        }

        private fun searchCatalog(query: String): List<MediaItem> {
            val q = query.trim()
            if (q.isEmpty()) return cachedCatalog.take(12).map { albumToMediaItem(it) }
            val results = mutableListOf<MediaItem>()
            // Match tracks first so voice commands like "Play <song>" immediately match playable tracks
            cachedCatalog.forEach { album ->
                album.tracks.filter { it.url.isNotBlank() }.forEach { track ->
                    if (track.title.contains(q, ignoreCase = true) ||
                        track.artist.contains(q, ignoreCase = true) ||
                        album.creator.contains(q, ignoreCase = true) ||
                        album.title.contains(q, ignoreCase = true)
                    ) {
                        results.add(trackToMediaItem(album, track))
                    }
                }
            }
            // Match radio stations
            radioStations.forEach { (id, title, url) ->
                if (title.contains(q, ignoreCase = true) || q.contains("radio", ignoreCase = true)) {
                    results.add(createPlayableItem(id, title, "Plajah Live Radio", null, url))
                }
            }
            return results.take(30)
        }

        override fun onSearch(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            query: String,
            params: LibraryParams?
        ): ListenableFuture<LibraryResult<Void>> {
            val future = SettableFuture.create<LibraryResult<Void>>()
            serviceScope.launch {
                ensureCatalogLoaded()
                val count = searchCatalog(query).size
                session.notifySearchResultChanged(browser, query, count, params)
                future.set(LibraryResult.ofVoid(params))
            }
            return future
        }

        override fun onGetSearchResult(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            query: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
            val future = SettableFuture.create<LibraryResult<ImmutableList<MediaItem>>>()
            serviceScope.launch {
                ensureCatalogLoaded()
                val all = searchCatalog(query)
                val from = (page * pageSize).coerceAtMost(all.size)
                val to = (from + pageSize).coerceAtMost(all.size)
                future.set(LibraryResult.ofItemList(ImmutableList.copyOf(all.subList(from, to)), params))
            }
            return future
        }

        private fun createCategoryItem(
            id: String,
            title: String,
            mediaType: @MediaMetadata.MediaType Int,
            grid: Boolean
        ): MediaItem {
            return MediaItem.Builder()
                .setMediaId(id)
                .setMediaMetadata(
                    MediaMetadata.Builder()
                        .setTitle(title)
                        .setIsBrowsable(true)
                        .setIsPlayable(false)
                        .setMediaType(mediaType)
                        .setExtras(autoStyleExtras(gridBrowsable = grid))
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
