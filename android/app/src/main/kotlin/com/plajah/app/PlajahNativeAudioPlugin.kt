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

        fun notifyRemoteCommand(command: String) {
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

                    val builder = MediaItem.Builder()
                        .setMediaMetadata(metadata)
                        .setMediaId("web_sync:${title.hashCode()}")

                    if (!streamUrl.isNullOrBlank()) {
                        builder.setUri(Uri.parse(streamUrl))
                    }

                    val mediaItem = builder.build()
                    val currentId = mediaController.currentMediaItem?.mediaId

                    if (currentId != mediaItem.mediaId) {
                        mediaController.setMediaItem(mediaItem)
                        if (!streamUrl.isNullOrBlank()) {
                            mediaController.prepare()
                        }
                    }

                    if (isPlaying) {
                        if (!mediaController.isPlaying) mediaController.play()
                    } else {
                        if (mediaController.isPlaying) mediaController.pause()
                    }
                }
                call.resolve()
            } catch (e: Exception) {
                call.reject("Failed to sync track: ${e.message}", e)
            }
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
