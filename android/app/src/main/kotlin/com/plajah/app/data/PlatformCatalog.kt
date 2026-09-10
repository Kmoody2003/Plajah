package com.plajah.app.data

import com.plajah.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Public discovery uses the same named database and publication filters as the web app.
 * No admin credentials, fabricated fallback, or access to private collections. */
data class PlatformTrack(val id:String,val title:String,val artist:String,val url:String,val duration:Long,val lyrics:String,val timedLyrics:List<Pair<Double,String>>,val images:List<String> = emptyList())
data class PlatformComment(val id:String,val author:String,val text:String,val timestamp:Long,val trackId:String,val image:String)
data class PlatformItem(val id:String,val title:String,val creator:String,val image:String,val kind:String,val created:Long,
    val description:String="",val genre:String="",val galleryUrl:String="",val tracks:List<PlatformTrack> = emptyList()) {
    val platformUrl:String get() = "https://plajah.com/?type="+kind+"&id="+java.net.URLEncoder.encode(id,"UTF-8")
}
object PlatformCatalog {
    suspend fun comments(albumId:String,trackId:String="album"):List<PlatformComment> = withContext(Dispatchers.IO) {
        val parent=java.net.URLEncoder.encode(albumId,"UTF-8")
        val body=JSONObject().put("structuredQuery",JSONObject().put("from",JSONArray().put(JSONObject().put("collectionId","comments"))).put("where",JSONObject().put("fieldFilter",JSONObject().put("field",JSONObject().put("fieldPath","trackId")).put("op","EQUAL").put("value",JSONObject().put("stringValue",trackId)))))
        val connection=URL("https://firestore.googleapis.com/v1/projects/"+BuildConfig.PLAJAH_PROJECT+"/databases/"+BuildConfig.PLAJAH_DATABASE+"/documents/albums/"+parent+":runQuery").openConnection() as HttpURLConnection
        try {
            connection.requestMethod="POST";connection.connectTimeout=15000;connection.readTimeout=20000;connection.doOutput=true
            connection.setRequestProperty("Content-Type","application/json")
            connection.outputStream.use{it.write(body.toString().toByteArray())}
            check(connection.responseCode in 200..299){"Feed could not be loaded (HTTP ${connection.responseCode})."}
            val rows=JSONArray(connection.inputStream.bufferedReader().use{it.readText()})
            (0 until rows.length()).mapNotNull { index->
                val doc=rows.optJSONObject(index)?.optJSONObject("document")?:return@mapNotNull null
                val fields=doc.optJSONObject("fields")?:return@mapNotNull null
                fun text(key:String)=fields.optJSONObject(key)?.optString("stringValue").orEmpty()
                PlatformComment(doc.getString("name").substringAfterLast('/'),text("author"),text("text"),fields.optJSONObject("timestamp")?.optString("integerValue")?.toLongOrNull()?:fields.optJSONObject("timestamp")?.optDouble("doubleValue",0.0)?.toLong()?:0L,text("trackId"),text("imageUrl").ifBlank{text("gifUrl")})
            }.sortedByDescending{it.timestamp}
        }finally{connection.disconnect()}
    }
    suspend fun load(section:String):List<PlatformItem> = withContext(Dispatchers.IO) {
        val albums = if(section=="reello") emptyList() else query("albums",if(section=="lorea") "BOOK" else null)
        val videos = if(section=="home"||section=="reello") query("videos",null) else emptyList()
        (albums.filter { section!="chora" || it.kind=="album" } + videos).sortedByDescending { it.created }
    }
    private fun query(collection:String,type:String?):List<PlatformItem> {
        fun filter(field:String,value:JSONObject)=JSONObject().put("fieldFilter",JSONObject().put("field",JSONObject().put("fieldPath",field)).put("op","EQUAL").put("value",value))
        val filters=JSONArray().put(filter("isPrivate",JSONObject().put("booleanValue",false)))
        if(type!=null)filters.put(filter("type",JSONObject().put("stringValue",type)))
        val where=if(filters.length()==1)filters.getJSONObject(0) else JSONObject().put("compositeFilter",JSONObject().put("op","AND").put("filters",filters))
        val body=JSONObject().put("structuredQuery",JSONObject().put("from",JSONArray().put(JSONObject().put("collectionId",collection))).put("where",where).put("limit",100))
        val connection=URL("https://firestore.googleapis.com/v1/projects/"+BuildConfig.PLAJAH_PROJECT+"/databases/"+BuildConfig.PLAJAH_DATABASE+"/documents:runQuery").openConnection() as HttpURLConnection
        try {
            connection.requestMethod="POST";connection.connectTimeout=15000;connection.readTimeout=20000;connection.doOutput=true
            connection.setRequestProperty("Content-Type","application/json")
            connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            check(connection.responseCode in 200..299) { "Plajah content could not be loaded (HTTP "+connection.responseCode+"). Please retry or open Classic." }
            val response=JSONArray(connection.inputStream.bufferedReader().use { it.readText() })
            return (0 until response.length()).mapNotNull { index ->
                val doc=response.getJSONObject(index).optJSONObject("document") ?: return@mapNotNull null
                decode(doc,collection)
            }
        } finally { connection.disconnect() }
    }
    internal fun decode(doc:JSONObject,collection:String):PlatformItem? {
        val f=doc.optJSONObject("fields")?:return null
        fun str(key:String)=f.optJSONObject(key)?.optString("stringValue").orEmpty()
        fun flag(key:String)=f.optJSONObject(key)?.optBoolean("booleanValue",false)==true
        fun number(key:String):Long {
            val value=f.optJSONObject(key)?:return 0
            value.optString("integerValue").toLongOrNull()?.let { return it }
            if(value.has("doubleValue"))return value.optDouble("doubleValue",0.0).toLong()
            return runCatching { java.time.Instant.parse(value.optString("timestampValue")).toEpochMilli() }.getOrDefault(0)
        }
        if(flag("isPrivate")||flag("isDraft")||(flag("isScheduled")&&number("releaseDate")>System.currentTimeMillis()))return null
        val title=str("title");if(title.isBlank())return null
        val type=str("type")
        if(collection=="albums"&&type !in listOf("","MUSIC","BOOK","VIDEO"))return null
        val kind=if(collection=="videos")"video" else when(type){"BOOK"->"book";"VIDEO"->"movie";else->"album"}
        val art=listOf("coverThumb","coverImage","thumbnailUrl","coverImageUrl").map(::str).firstOrNull { it.startsWith("https://") }.orEmpty()
        val tracks=f.optJSONObject("tracks")?.optJSONObject("arrayValue")?.optJSONArray("values")?.let { values ->
            (0 until values.length()).mapNotNull { index ->
                val tf=values.optJSONObject(index)?.optJSONObject("mapValue")?.optJSONObject("fields") ?: return@mapNotNull null
                fun ts(key:String)=tf.optJSONObject(key)?.optString("stringValue").orEmpty()
                fun tn(key:String):Long { val v=tf.optJSONObject(key)?:return 0;return v.optString("integerValue").toLongOrNull()?:v.optDouble("doubleValue",0.0).toLong() }
                val stream=listOf("browserCompatUrl","url","videoUrl").map(::ts).firstOrNull { it.startsWith("https://") }.orEmpty()
                val timed=tf.optJSONObject("timeCodedLyrics")?.optJSONObject("arrayValue")?.optJSONArray("values")?.let { lines ->
                    (0 until lines.length()).mapNotNull { line -> val lf=lines.optJSONObject(line)?.optJSONObject("mapValue")?.optJSONObject("fields")?:return@mapNotNull null
                        val text=lf.optJSONObject("text")?.optString("stringValue").orEmpty();val time=lf.optJSONObject("time")?.let { it.optString("integerValue").toDoubleOrNull()?:it.optDouble("doubleValue",0.0) }?:0.0
                        if(text.isBlank())null else time to text }
                }?:emptyList()
                val images=tf.optJSONObject("images")?.optJSONObject("arrayValue")?.optJSONArray("values")?.let { a->(0 until a.length()).map{a.optJSONObject(it)?.optString("stringValue").orEmpty()}.filter{it.startsWith("https://")} }?:emptyList()
                PlatformTrack(ts("id").ifBlank { "track-$index" },ts("title").ifBlank { "Untitled" },ts("artist"),stream,tn("duration"),ts("lyrics"),timed,images)
            }
        }?:emptyList()
        return PlatformItem(doc.getString("name").substringAfterLast('/'),title,listOf("artist","author","ownerName").map(::str).firstOrNull { it.isNotBlank() }.orEmpty(),art,kind,maxOf(number("createdAt"),number("timestamp")),str("description"),str("genre"),str("galleryUrl"),tracks)
    }
}
