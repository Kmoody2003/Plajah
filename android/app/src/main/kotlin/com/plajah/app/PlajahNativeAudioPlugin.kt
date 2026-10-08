package com.plajah.app

import android.content.ComponentName
import android.net.Uri
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Capacitor bridge plugin connecting Web/HTML5 playback to native PlajahMediaService (Media3).
 * Solves:
 * 1. Screen-off audio playback throttling (acquires high-perf Wi-Fi lock and partial wake lock).
 * 2. Bluetooth AVRCP & Car Stereo information (sends Title, Artist, Album, Artwork, Duration to head units).
 * 3. Media controls from car stereos, steering wheel buttons, smartwatches, and headphones.
 */
@CapacitorPlugin(name = "PlajahNativeAudio")
class PlajahNativeAudioPlugin : Plugin() {

    private var controller: MediaController? = null

    companion object {
        private const val TAG = "PlajahNativeAudio"
        var activePlugin: PlajahNativeAudioPlugin? = null

        // The same physical button press can reach us twice (Media3 reports both the *_TO_NEXT and
        // *_TO_NEXT_MEDIA_ITEM command for one tap, and the OS can also replay it via the legacy
        // session). The web player skips a track per command, so de-duplicate here as well as in JS.
        private const val DUPLICATE_WINDOW_MS = 600L
        private val lastCommandAt = HashMap<String, Long>()

        @Synchronized
        fun notifyRemoteCommand(command: String) {
            val now = android.os.SystemClock.elapsedRealtime()
            val last = lastCommandAt[command]
            if (last != null && now - last < DUPLICATE_WINDOW_MS) return
            lastCommandAt[command] = now
            activePlugin?.let { plugin ->
                val ret = JSObject().put("command", command)
                plugin.notifyListeners("onRemoteCommand", ret)
            }
        }
    }

    override fun load() {
        super.load()
        activePlugin = this
        initController()
    }

    private fun initController() {
        val ctx = context ?: return
        val sessionToken = SessionToken(ctx, ComponentName(ctx, PlajahMediaService::class.java))
        val controllerFuture = MediaController.Builder(ctx, sessionToken).buildAsync()
        controllerFuture.addListener({
            try {
                controller = controllerFuture.get()
                controller?.addListener(object : Player.Listener {
                    override fun onIsPlayingChanged(isPlaying: Boolean) {
                        val ret = JSObject().put("isPlaying", isPlaying)
                        notifyListeners("onPlaybackStateChanged", ret)
                    }

                    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                        val ret = JSObject()
                            .put("title", mediaItem?.mediaMetadata?.title?.toString().orEmpty())
                            .put("artist", mediaItem?.mediaMetadata?.artist?.toString().orEmpty())
                        notifyListeners("onTrackTransition", ret)
                    }
                })
                Log.i(TAG, "MediaController connected to PlajahMediaService")
            } catch (e: Exception) {
                Log.w(TAG, "Failed to connect MediaController: ${e.message}")
            }
        }, ContextCompat.getMainExecutor(ctx))
    }

    @PluginMethod
    fun syncTrackInfo(call: PluginCall) {
        val title = call.getString("title") ?: "Unknown Title"
        val artist = call.getString("artist") ?: "Unknown Artist"
        val album = call.getString("album") ?: "Plajah Chora"
        val artworkUrl = call.getString("artworkUrl")
        val durationMs = call.getDouble("durationMs")?.toLong() ?: 0L
        val isPlaying = call.getBoolean("isPlaying") ?: false
        val streamUrl = call.getString("streamUrl")

        activity?.runOnUiThread {
            try {
                val mediaController = controller
                if (mediaController != null) {
                    val metadata = MediaMetadata.Builder()
                        .setTitle(title)
                        .setArtist(artist)
                        .setAlbumTitle(album)
                        .setArtworkUri(if (!artworkUrl.isNullOrBlank()) Uri.parse(artworkUrl) else null)
                        .setIsPlayable(true)
                        .build()

                    // METADATA MIRROR ONLY. The WebView <audio> element is the sole audio source for
                    // web-driven Chora. This used to also hand the track's URL to ExoPlayer and call
                    // play()/pause(), so TWO players decoded the same song: ExoPlayer grabbed audio
                    // focus (handleAudioFocus=true) and the WebView element was paused/ducked, then
                    // the web recovery loop fought it -> pause after a song, silent next tracks, audio
                    // returning a few tracks later. No URI + no prepare()/play() means no second
                    // player and no focus contention.
                    val mediaItem = MediaItem.Builder()
                        .setMediaMetadata(metadata)
                        .setMediaId("web_sync:${title.hashCode()}")
                        .build()
                    val currentId = mediaController.currentMediaItem?.mediaId
                    // Never clobber a real native queue (Compose app / Android Auto) with web metadata.
                    if (currentId == null || currentId.startsWith("web_sync:")) {
                        if (currentId != mediaItem.mediaId) mediaController.setMediaItem(mediaItem)
                    }
                }
                call.resolve()
            } catch (e: Exception) {
                call.reject("Failed to sync track: ${e.message}", e)
            }
        }
    }

    /**
     * The web player started/stopped playing. Promotes PlajahMediaService to a foreground service
     * (with wake + Wi-Fi locks) while audio is playing so the screen-off WebView keeps its network.
     */
    @PluginMethod
    fun setPlaybackActive(call: PluginCall) {
        val active = call.getBoolean("active") ?: false
        val title = call.getString("title") ?: "Plajah Chora"
        val artist = call.getString("artist") ?: "Now Playing"
        try {
            PlajahMediaService.setWebPlayback(context.applicationContext, active, title, artist)
            call.resolve()
        } catch (e: Exception) {
            call.reject("setPlaybackActive failed: ${e.message}", e)
        }
    }

    @PluginMethod
    fun play(call: PluginCall) {
        activity?.runOnUiThread {
            controller?.play()
            call.resolve()
        }
    }

    @PluginMethod
    fun pause(call: PluginCall) {
        activity?.runOnUiThread {
            controller?.pause()
            call.resolve()
        }
    }

    @PluginMethod
    fun seekTo(call: PluginCall) {
        val positionMs = call.getDouble("positionMs")?.toLong() ?: 0L
        activity?.runOnUiThread {
            controller?.seekTo(positionMs)
            call.resolve()
        }
    }

    override fun handleOnDestroy() {
        activePlugin = null
        controller?.release()
        controller = null
        super.handleOnDestroy()
    }
}
