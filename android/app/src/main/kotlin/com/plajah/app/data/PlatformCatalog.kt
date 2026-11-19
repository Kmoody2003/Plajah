package com.plajah.app.data

import com.plajah.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/** Public discovery uses the same named Firestore database and publication filters as the web app.
 * No admin credentials, fabricated fallback, or access to private collections. */
data class PlatformTrack(
    val id: String,
    val title: String,
    val artist: String,
    val url: String,
    val duration: Long,
    val lyrics: String,
    val timedLyrics: List<Pair<Double, String>>,
    val images: List<String> = emptyList(),
)

data class PlatformComment(
    val id: String,
    val author: String,
    val text: String,
    val timestamp: Long,
    val trackId: String,
    val image: String,
)

data class PlatformItem(
    val id: String,
    val title: String,
    val creator: String,
    val image: String,
    val kind: String, // "album" | "video" | "book" | "movie" | "audius"
    val created: Long,
    val description: String = "",
    val genre: String = "",
    val galleryUrl: String = "",
    val tracks: List<PlatformTrack> = emptyList(),
    val videoUrl: String = "",
    val muxPlaybackId: String = "",
    val durationSec: Long = 0L,
    val playCount: Long = 0L,
    val likeCount: Long = 0L,
    val contentRating: String = "",
    val isShort: Boolean = false,
    val source: String = "PLAJAH", // "PLAJAH" | "AUDIUS" | "GUTENDEX"
    val linerNotes: String = "",
    val subType: String = "",
    val releaseDate: Long = 0L,
) {
    val platformUrl: String
        get() = when (source) {
            "AUDIUS" -> "https://plajah.com/?view=music"
            "GUTENDEX" -> "https://plajah.com/?view=books"
            else -> "https://plajah.com/?type=" + kind + "&id=" + URLEncoder.encode(id, "UTF-8")
        }

    val playableVideoUrl: String
        get() = when {
            muxPlaybackId.isNotBlank() -> "https://stream.mux.com/$muxPlaybackId.m3u8"
            videoUrl.startsWith("https://") -> videoUrl
            else -> tracks.firstOrNull { it.url.startsWith("https://") }?.url.orEmpty()
        }

    val resolvedThumb: String
        get() = when {
            image.startsWith("https://") -> image
            muxPlaybackId.isNotBlank() -> "https://image.mux.com/$muxPlaybackId/thumbnail.png?width=640&time=4"
            else -> ""
        }
}

data class ElevateOrg(
    val id: String,
    val name: String,
    val orgType: String, // CHURCH | CULTURAL | NONPROFIT | RELIGIOUS
    val denomination: String,
    val tagline: String,
    val city: String,
    val logoUrl: String,
    val coverUrl: String,
    val isVerified: Boolean,
    val followerCount: Long,
    val ministries: List<String>,
    val ownerId: String,
    val channels: List<ElevateChannel> = emptyList(),
) {
    val platformUrl: String get() = "https://plajah.com/?view=elevate&org=${URLEncoder.encode(id, "UTF-8")}"
}

data class ElevateChannel(
    val id: String,
    val title: String,
    val subtitle: String,
    val streamUrl: String,
    val isLive: Boolean,
    val posterUrl: String = "",
)

data class ClassicBook(
    val id: String,
    val title: String,
    val author: String,
    val coverUrl: String,
    val textUrl: String,
    val subjects: List<String>,
    val downloadCount: Int,
)

object PlatformCatalog {
    private const val AUDIUS_HOST = "https://discoveryprovider.audius.co"

    suspend fun comments(albumId: String, trackId: String = "album"): List<PlatformComment> = withContext(Dispatchers.IO) {
        val parent = URLEncoder.encode(albumId, "UTF-8")
        val body = JSONObject().put(
            "structuredQuery",
            JSONObject()
                .put("from", JSONArray().put(JSONObject().put("collectionId", "comments")))
                .put(
                    "where",
                    JSONObject().put(
                        "fieldFilter",
                        JSONObject()
                            .put("field", JSONObject().put("fieldPath", "trackId"))
                            .put("op", "EQUAL")
                            .put("value", JSONObject().put("stringValue", trackId))
                    )
                )
        )
        val connection = URL(
            "https://firestore.googleapis.com/v1/projects/" +
                BuildConfig.PLAJAH_PROJECT + "/databases/" + BuildConfig.PLAJAH_DATABASE +
                "/documents/albums/" + parent + ":runQuery"
        ).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 15000
            connection.readTimeout = 20000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use { it.write(body.toString().toByteArray()) }
            check(connection.responseCode in 200..299) { "Feed could not be loaded (HTTP ${connection.responseCode})." }
            val rows = JSONArray(connection.inputStream.bufferedReader().use { it.readText() })
            (0 until rows.length()).mapNotNull { index ->
                val doc = rows.optJSONObject(index)?.optJSONObject("document") ?: return@mapNotNull null
                val fields = doc.optJSONObject("fields") ?: return@mapNotNull null
                fun text(key: String) = fields.optJSONObject(key)?.optString("stringValue").orEmpty()
                PlatformComment(
                    doc.getString("name").substringAfterLast('/'),
                    text("author"),
                    text("text"),
                    fields.optJSONObject("timestamp")?.optString("integerValue")?.toLongOrNull()
                        ?: fields.optJSONObject("timestamp")?.optDouble("doubleValue", 0.0)?.toLong()
                        ?: 0L,
                    text("trackId"),
                    text("imageUrl").ifBlank { text("gifUrl") },
                )
            }.sortedByDescending { it.timestamp }
        } finally {
            connection.disconnect()
        }
    }

    suspend fun load(section: String): List<PlatformItem> = withContext(Dispatchers.IO) {
        when (section) {
            "reello" -> query("videos", null).sortedByDescending { it.created }
            "cinema" -> {
                val movies = query("albums", "VIDEO")
                val videos = query("videos", null).filter {
                    val g = it.genre.lowercase()
                    g.contains("movie") || g.contains("film") || g.contains("tv") || g.contains("documentary") || it.durationSec >= 300
                }
                (movies + videos).distinctBy { it.id }.sortedByDescending { it.created }
            }
            "lorea" -> query("albums", "BOOK").sortedByDescending { it.created }
            "chora" -> query("albums", null).filter { it.kind == "album" }.sortedByDescending { it.created }
            else -> {
                val albums = query("albums", null)
                val videos = query("videos", null)
                (albums + videos).sortedByDescending { it.created }
            }
        }
    }

    /** Public Audius discovery tracks matching web Chora's Marquee & Tonight's Sky comets. */
    suspend fun loadAudiusTrending(limit: Int = 18): List<PlatformItem> = withContext(Dispatchers.IO) {
        try {
            val conn = URL("$AUDIUS_HOST/v1/tracks/trending?app_name=Plajah&limit=$limit").openConnection() as HttpURLConnection
            try {
                conn.connectTimeout = 10000
                conn.readTimeout = 12000
                if (conn.responseCode !in 200..299) return@withContext emptyList()
                val root = JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
                val data = root.optJSONArray("data") ?: return@withContext emptyList()
                decodeAudiusTracks(data)
            } finally {
                conn.disconnect()
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    suspend fun searchAudius(queryText: String): List<PlatformItem> = withContext(Dispatchers.IO) {
        val q = queryText.trim()
        if (q.isEmpty()) return@withContext emptyList()
        try {
            val encoded = URLEncoder.encode(q, "UTF-8")
            val conn = URL("$AUDIUS_HOST/v1/tracks/search?app_name=Plajah&query=$encoded&limit=20").openConnection() as HttpURLConnection
            try {
                conn.connectTimeout = 10000
                conn.readTimeout = 12000
                if (conn.responseCode !in 200..299) return@withContext emptyList()
                val root = JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
                val data = root.optJSONArray("data") ?: return@withContext emptyList()
                decodeAudiusTracks(data)
            } finally {
                conn.disconnect()
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun decodeAudiusTracks(data: JSONArray): List<PlatformItem> {
        val list = mutableListOf<PlatformItem>()
        for (i in 0 until data.length()) {
            val obj = data.optJSONObject(i) ?: continue
            val id = obj.optString("id").takeIf { it.isNotBlank() } ?: continue
            val title = obj.optString("title").takeIf { it.isNotBlank() } ?: continue
            val user = obj.optJSONObject("user")
            val artist = user?.optString("name").orEmpty().ifBlank { user?.optString("handle").orEmpty() }
            val artObj = obj.optJSONObject("artwork")
            val art = artObj?.optString("480x480").orEmpty()
                .ifBlank { artObj?.optString("1000x1000").orEmpty() }
                .ifBlank { artObj?.optString("150x150").orEmpty() }
            val duration = obj.optLong("duration", 0L)
            val playCount = obj.optLong("play_count", 0L)
            val genre = obj.optString("genre").orEmpty()
            val streamUrl = "$AUDIUS_HOST/v1/tracks/$id/stream?app_name=Plajah"
            val track = PlatformTrack(
                id = "audius_$id",
                title = title,
                artist = artist,
                url = streamUrl,
                duration = duration,
                lyrics = "",
                timedLyrics = emptyList(),
            )
            list.add(
                PlatformItem(
                    id = "audius_$id",
                    title = title,
                    creator = artist.ifBlank { "Audius Artist" },
                    image = art,
                    kind = "album",
                    created = System.currentTimeMillis() - i * 1000L,
                    description = obj.optString("description").orEmpty(),
                    genre = genre,
                    tracks = listOf(track),
                    durationSec = duration,
                    playCount = playCount,
                    source = "AUDIUS",
                )
            )
        }
        return list
    }

    /** Public Elevate organizations + live channels from Firestore. */
    suspend fun loadOrganizations(): List<ElevateOrg> = withContext(Dispatchers.IO) {
        val orgs = mutableListOf<ElevateOrg>()
        val liveFeeds = loadPublicLiveChannels()
        val body = JSONObject().put(
            "structuredQuery",
            JSONObject()
                .put("from", JSONArray().put(JSONObject().put("collectionId", "organizations")))
                .put("limit", 60)
        )
        val conn = URL(
            "https://firestore.googleapis.com/v1/projects/" +
                BuildConfig.PLAJAH_PROJECT + "/databases/" + BuildConfig.PLAJAH_DATABASE +
                "/documents:runQuery"
        ).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 15000
            conn.readTimeout = 20000
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            if (conn.responseCode in 200..299) {
                val rows = JSONArray(conn.inputStream.bufferedReader().use { it.readText() })
                for (i in 0 until rows.length()) {
                    val doc = rows.optJSONObject(i)?.optJSONObject("document") ?: continue
                    val f = doc.optJSONObject("fields") ?: continue
                    fun str(k: String) = f.optJSONObject(k)?.optString("stringValue").orEmpty()
                    fun bool(k: String) = f.optJSONObject(k)?.optBoolean("booleanValue", false) == true
                    fun num(k: String) = f.optJSONObject(k)?.optString("integerValue")?.toLongOrNull()
                        ?: f.optJSONObject(k)?.optDouble("doubleValue", 0.0)?.toLong() ?: 0L
                    if (bool("isPrivate") || bool("isDeleted")) continue
                    val name = str("name")
                    if (name.isBlank()) continue
                    val id = doc.getString("name").substringAfterLast('/')
                    val ownerId = str("ownerId")
                    val locCity = f.optJSONObject("location")?.optJSONObject("mapValue")?.optJSONObject("fields")
                        ?.optJSONObject("city")?.optString("stringValue").orEmpty()
                    val ministries = f.optJSONObject("ministries")?.optJSONObject("arrayValue")?.optJSONArray("values")?.let { arr ->
                        (0 until arr.length()).mapNotNull { idx ->
                            val mf = arr.optJSONObject(idx)?.optJSONObject("mapValue")?.optJSONObject("fields")
                            mf?.optJSONObject("name")?.optString("stringValue")?.takeIf { it.isNotBlank() }
                        }
                    } ?: emptyList()

                    val orgChannels = liveFeeds.filter { (feedOwner, _) ->
                        feedOwner == ownerId || feedOwner == id
                    }.map { it.second }
                    // Attach public LiveHub channels as secondary channels so switching channels works smoothly
                    val allChannels = (orgChannels + liveFeeds.map { it.second }).distinctBy { it.id }.take(8)

                    orgs.add(
                        ElevateOrg(
                            id = id,
                            name = name,
                            orgType = str("orgType").ifBlank { "CHURCH" },
                            denomination = str("denomination").ifBlank { str("orgKindLabel") },
                            tagline = str("tagline").ifBlank { str("description") },
                            city = locCity,
                            logoUrl = str("logoUrl"),
                            coverUrl = str("coverUrl"),
                            isVerified = bool("isVerified"),
                            followerCount = num("followerCount"),
                            ministries = ministries,
                            ownerId = ownerId,
                            channels = allChannels,
                        )
                    )
                }
            }
        } finally {
            conn.disconnect()
        }
        orgs
    }

    private fun loadPublicLiveChannels(): List<Pair<String, ElevateChannel>> {
        val result = mutableListOf<Pair<String, ElevateChannel>>()
        for (col in listOf("liveFeeds", "tvChannels")) {
            val body = JSONObject().put(
                "structuredQuery",
                JSONObject()
                    .put("from", JSONArray().put(JSONObject().put("collectionId", col)))
                    .put("limit", 25)
            )
            val conn = URL(
                "https://firestore.googleapis.com/v1/projects/" +
                    BuildConfig.PLAJAH_PROJECT + "/databases/" + BuildConfig.PLAJAH_DATABASE +
                    "/documents:runQuery"
            ).openConnection() as HttpURLConnection
            try {
                conn.requestMethod = "POST"
                conn.connectTimeout = 10000
                conn.readTimeout = 12000
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                if (conn.responseCode in 200..299) {
                    val rows = JSONArray(conn.inputStream.bufferedReader().use { it.readText() })
                    for (i in 0 until rows.length()) {
                        val doc = rows.optJSONObject(i)?.optJSONObject("document") ?: continue
                        val f = doc.optJSONObject("fields") ?: continue
                        fun str(k: String) = f.optJSONObject(k)?.optString("stringValue").orEmpty()
                        val title = str("title").ifBlank { str("name") }
                        val muxId = str("muxPlaybackId")
                        val url = when {
                            muxId.isNotBlank() -> "https://stream.mux.com/$muxId.m3u8"
                            str("hlsUrl").startsWith("https://") -> str("hlsUrl")
                            str("liveStreamUrl").startsWith("https://") -> str("liveStreamUrl")
                            str("url").startsWith("https://") -> str("url")
                            else -> ""
                        }
                        if (title.isBlank() || url.isBlank()) continue
                        val id = doc.getString("name").substringAfterLast('/')
                        val ownerId = str("ownerId")
                        result.add(
                            ownerId to ElevateChannel(
                                id = "$col:$id",
                                title = title,
                                subtitle = str("ownerName").ifBlank { str("genre").ifBlank { "LiveHub TV+" } },
                                streamUrl = url,
                                isLive = f.optJSONObject("isLive")?.optBoolean("booleanValue", false) == true || col == "tvChannels",
                                posterUrl = str("thumbnailUrl").ifBlank { str("posterUrl") },
                            )
                        )
                    }
                }
            } catch (_: Exception) {
            } finally {
                conn.disconnect()
            }
        }
        return result
    }

    /** Public-domain classics from Gutendex (matching web Lorea Classics). */
    suspend fun loadClassicBooks(topic: String = "", search: String = ""): List<ClassicBook> = withContext(Dispatchers.IO) {
        try {
            val params = mutableListOf<String>()
            if (topic.isNotBlank()) params.add("topic=${URLEncoder.encode(topic, "UTF-8")}")
            if (search.isNotBlank()) params.add("search=${URLEncoder.encode(search, "UTF-8")}")
            val qs = if (params.isEmpty()) "" else "?" + params.joinToString("&")
            val conn = URL("https://gutendex.com/books$qs").openConnection() as HttpURLConnection
            try {
                conn.connectTimeout = 12000
                conn.readTimeout = 15000
                if (conn.responseCode !in 200..299) return@withContext emptyList()
                val root = JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
                val arr = root.optJSONArray("results") ?: return@withContext emptyList()
                val books = mutableListOf<ClassicBook>()
                for (i in 0 until arr.length()) {
                    val obj = arr.optJSONObject(i) ?: continue
                    val id = obj.optInt("id", i).toString()
                    val title = obj.optString("title").takeIf { it.isNotBlank() } ?: continue
                    val authors = obj.optJSONArray("authors")
                    val author = authors?.optJSONObject(0)?.optString("name").orEmpty().ifBlank { "Classic Author" }
                    val formats = obj.optJSONObject("formats")
                    val cover = formats?.optString("image/jpeg").orEmpty()
                    val textUrl = formats?.optString("text/plain; charset=utf-8").orEmpty()
                        .ifBlank { formats?.optString("text/plain; charset=us-ascii").orEmpty() }
                        .ifBlank { formats?.optString("text/plain").orEmpty() }
                    val subjectsArr = obj.optJSONArray("subjects")
                    val subjects = if (subjectsArr != null) {
                        (0 until subjectsArr.length()).mapNotNull { subjectsArr.optString(it).takeIf { s -> s.isNotBlank() } }.take(3)
                    } else emptyList()
                    books.add(ClassicBook(id, title, author, cover, textUrl, subjects, obj.optInt("download_count", 0)))
                }
                books
            } finally {
                conn.disconnect()
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    suspend fun fetchPlainTextExcerpt(url: String, maxChars: Int = 36_000): String = withContext(Dispatchers.IO) {
        if (!url.startsWith("https://") && !url.startsWith("http://")) return@withContext ""
        val conn = URL(url.replace("http://", "https://")).openConnection() as HttpURLConnection
        try {
            conn.instanceFollowRedirects = true
            conn.connectTimeout = 12000
            conn.readTimeout = 15000
            if (conn.responseCode !in 200..299) return@withContext ""
            conn.inputStream.bufferedReader().use { reader ->
                val sb = StringBuilder()
                val buf = CharArray(4096)
                while (sb.length < maxChars) {
                    val n = reader.read(buf)
                    if (n <= 0) break
                    sb.append(buf, 0, n)
                }
                sb.toString()
            }
        } catch (_: Exception) {
            ""
        } finally {
            conn.disconnect()
        }
    }

    private fun query(collection: String, type: String?): List<PlatformItem> {
        fun filter(field: String, value: JSONObject) =
            JSONObject().put("fieldFilter", JSONObject().put("field", JSONObject().put("fieldPath", field)).put("op", "EQUAL").put("value", value))
        val filters = JSONArray().put(filter("isPrivate", JSONObject().put("booleanValue", false)))
        if (type != null) filters.put(filter("type", JSONObject().put("stringValue", type)))
        val where = if (filters.length() == 1) filters.getJSONObject(0) else JSONObject().put("compositeFilter", JSONObject().put("op", "AND").put("filters", filters))
        val body = JSONObject().put("structuredQuery", JSONObject().put("from", JSONArray().put(JSONObject().put("collectionId", collection))).put("where", where).put("limit", 100))
        val connection = URL(
            "https://firestore.googleapis.com/v1/projects/" +
                BuildConfig.PLAJAH_PROJECT + "/databases/" + BuildConfig.PLAJAH_DATABASE + "/documents:runQuery"
        ).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 15000
            connection.readTimeout = 20000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            check(connection.responseCode in 200..299) { "Plajah content could not be loaded (HTTP " + connection.responseCode + "). Please retry or open Classic." }
            val response = JSONArray(connection.inputStream.bufferedReader().use { it.readText() })
            return (0 until response.length()).mapNotNull { index ->
                val doc = response.getJSONObject(index).optJSONObject("document") ?: return@mapNotNull null
                decode(doc, collection)
            }
        } finally {
            connection.disconnect()
        }
    }

    internal fun decode(doc: JSONObject, collection: String): PlatformItem? {
        val f = doc.optJSONObject("fields") ?: return null
        fun str(key: String) = f.optJSONObject(key)?.optString("stringValue").orEmpty()
        fun flag(key: String) = f.optJSONObject(key)?.optBoolean("booleanValue", false) == true
        fun number(key: String): Long {
            val value = f.optJSONObject(key) ?: return 0
            value.optString("integerValue").toLongOrNull()?.let { return it }
            if (value.has("doubleValue")) return value.optDouble("doubleValue", 0.0).toLong()
            return runCatching { java.time.Instant.parse(value.optString("timestampValue")).toEpochMilli() }.getOrDefault(0)
        }
        if (flag("isPrivate") || flag("isDraft") || (flag("isScheduled") && number("releaseDate") > System.currentTimeMillis())) return null
        val title = str("title")
        if (title.isBlank()) return null
        val type = str("type")
        if (collection == "albums" && type !in listOf("", "MUSIC", "BOOK", "VIDEO")) return null
        val kind = if (collection == "videos") "video" else when (type) {
            "BOOK" -> "book"
            "VIDEO" -> "movie"
            else -> "album"
        }
        val art = listOf("coverThumb", "coverImage", "thumbnailUrl", "coverImageUrl").map(::str).firstOrNull { it.startsWith("https://") }.orEmpty()
        val tracks = f.optJSONObject("tracks")?.optJSONObject("arrayValue")?.optJSONArray("values")?.let { values ->
            (0 until values.length()).mapNotNull { index ->
                val tf = values.optJSONObject(index)?.optJSONObject("mapValue")?.optJSONObject("fields") ?: return@mapNotNull null
                fun ts(key: String) = tf.optJSONObject(key)?.optString("stringValue").orEmpty()
                fun tn(key: String): Long {
                    val v = tf.optJSONObject(key) ?: return 0
                    return v.optString("integerValue").toLongOrNull() ?: v.optDouble("doubleValue", 0.0).toLong()
                }
                val stream = listOf("browserCompatUrl", "url", "videoUrl").map(::ts).firstOrNull { it.startsWith("https://") }.orEmpty()
                val timed = tf.optJSONObject("timeCodedLyrics")?.optJSONObject("arrayValue")?.optJSONArray("values")?.let { lines ->
                    (0 until lines.length()).mapNotNull { line ->
                        val lf = lines.optJSONObject(line)?.optJSONObject("mapValue")?.optJSONObject("fields") ?: return@mapNotNull null
                        val text = lf.optJSONObject("text")?.optString("stringValue").orEmpty()
                        val time = lf.optJSONObject("time")?.let { it.optString("integerValue").toDoubleOrNull() ?: it.optDouble("doubleValue", 0.0) } ?: 0.0
                        if (text.isBlank()) null else time to text
                    }
                } ?: emptyList()
                val images = tf.optJSONObject("images")?.optJSONObject("arrayValue")?.optJSONArray("values")?.let { a ->
                    (0 until a.length()).map { a.optJSONObject(it)?.optString("stringValue").orEmpty() }.filter { it.startsWith("https://") }
                } ?: emptyList()
                PlatformTrack(
                    ts("id").ifBlank { "track-$index" },
                    ts("title").ifBlank { "Untitled" },
                    ts("artist"),
                    stream,
                    tn("duration"),
                    ts("lyrics"),
                    timed,
                    images,
                )
            }
        } ?: emptyList()

        val muxId = str("muxPlaybackId")
        val directVideo = listOf("verticalVideoUrl", "url", "videoUrl").map(::str).firstOrNull { it.startsWith("https://") }.orEmpty()
        val duration = number("duration")
        val isShort = flag("isShort") || flag("isRello") && (duration in 1..180)
        return PlatformItem(
            id = doc.getString("name").substringAfterLast('/'),
            title = title,
            creator = listOf("artist", "author", "ownerName").map(::str).firstOrNull { it.isNotBlank() }.orEmpty(),
            image = art,
            kind = kind,
            created = maxOf(number("createdAt"), number("timestamp")),
            description = str("description"),
            genre = str("genre"),
            galleryUrl = str("galleryUrl"),
            tracks = tracks,
            videoUrl = directVideo,
            muxPlaybackId = muxId,
            durationSec = duration,
            playCount = maxOf(number("playCount"), number("views")),
            likeCount = number("likes"),
            contentRating = str("contentRating"),
            isShort = isShort,
            source = "PLAJAH",
            linerNotes = str("linerNotes"),
            subType = str("subType"),
            releaseDate = number("releaseDate"),
        )
    }
}
