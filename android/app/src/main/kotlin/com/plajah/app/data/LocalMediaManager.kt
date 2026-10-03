package com.plajah.app.data

import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Log

data class LocalAudioTrack(
    val id: Long,
    val title: String,
    val artist: String,
    val album: String,
    val duration: Long,
    val contentUri: Uri,
    val artworkUri: Uri?
)

data class LocalVideo(
    val id: Long,
    val title: String,
    val duration: Long,
    val size: Long,
    val contentUri: Uri
)

data class LocalPhoto(
    val id: Long,
    val title: String,
    val dateTaken: Long,
    val contentUri: Uri
)

/**
 * Enterprise Local Media scanner for Android (Audio, Video, Photos).
 * Integrates with Android MediaStore + SAF to bring desktop-class local playback to Android.
 */
object LocalMediaManager {
    private const val TAG = "LocalMediaManager"

    fun queryAudio(context: Context): List<LocalAudioTrack> {
        val tracks = mutableListOf<LocalAudioTrack>()
        val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
        } else {
            MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
        }

        val projection = arrayOf(
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.ALBUM_ID
        )

        val selection = "${MediaStore.Audio.Media.IS_MUSIC} != 0"
        val sortOrder = "${MediaStore.Audio.Media.TITLE} ASC"

        try {
            context.contentResolver.query(collection, projection, selection, null, sortOrder)?.use { cursor ->
                val idCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
                val titleCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE)
                val artistCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)
                val albumCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM)
                val durationCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
                val albumIdCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID)

                while (cursor.moveToNext()) {
                    val id = cursor.getLong(idCol)
                    val title = cursor.getString(titleCol) ?: "Unknown Track"
                    val artist = cursor.getString(artistCol) ?: "Unknown Artist"
                    val album = cursor.getString(albumCol) ?: "Unknown Album"
                    val duration = cursor.getLong(durationCol)
                    val albumId = cursor.getLong(albumIdCol)

                    val contentUri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id)
                    val artworkUri = ContentUris.withAppendedId(
                        Uri.parse("content://media/external/audio/albumart"),
                        albumId
                    )

                    tracks.add(
                        LocalAudioTrack(
                            id = id,
                            title = title,
                            artist = if (artist == "<unknown>") "Unknown Artist" else artist,
                            album = album,
                            duration = duration,
                            contentUri = contentUri,
                            artworkUri = artworkUri
                        )
                    )
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to query local audio: ${e.message}")
        }
        return tracks
    }

    fun queryVideos(context: Context): List<LocalVideo> {
        val videos = mutableListOf<LocalVideo>()
        val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
        } else {
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI
        }

        val projection = arrayOf(
            MediaStore.Video.Media._ID,
            MediaStore.Video.Media.TITLE,
            MediaStore.Video.Media.DURATION,
            MediaStore.Video.Media.SIZE
        )

        val sortOrder = "${MediaStore.Video.Media.DATE_ADDED} DESC"

        try {
            context.contentResolver.query(collection, projection, null, null, sortOrder)?.use { cursor ->
                val idCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media._ID)
                val titleCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.TITLE)
                val durationCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DURATION)
                val sizeCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.SIZE)

                while (cursor.moveToNext()) {
                    val id = cursor.getLong(idCol)
                    val title = cursor.getString(titleCol) ?: "Video $id"
                    val duration = cursor.getLong(durationCol)
                    val size = cursor.getLong(sizeCol)
                    val contentUri = ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id)

                    videos.add(
                        LocalVideo(
                            id = id,
                            title = title,
                            duration = duration,
                            size = size,
                            contentUri = contentUri
                        )
                    )
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to query local videos: ${e.message}")
        }
        return videos
    }

    fun queryPhotos(context: Context): List<LocalPhoto> {
        val photos = mutableListOf<LocalPhoto>()
        val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
        } else {
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI
        }

        val projection = arrayOf(
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.TITLE,
            MediaStore.Images.Media.DATE_TAKEN
        )

        val sortOrder = "${MediaStore.Images.Media.DATE_TAKEN} DESC"

        try {
            context.contentResolver.query(collection, projection, null, null, sortOrder)?.use { cursor ->
                val idCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
                val titleCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.TITLE)
                val dateCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_TAKEN)

                while (cursor.moveToNext()) {
                    val id = cursor.getLong(idCol)
                    val title = cursor.getString(titleCol) ?: "Photo $id"
                    val dateTaken = cursor.getLong(dateCol)
                    val contentUri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)

                    photos.add(
                        LocalPhoto(
                            id = id,
                            title = title,
                            dateTaken = dateTaken,
                            contentUri = contentUri
                        )
                    )
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to query local photos: ${e.message}")
        }
        return photos
    }
}
