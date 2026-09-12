package com.plajah.app.ui.screens

import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import com.plajah.app.data.PlatformCatalog
import com.plajah.app.data.PlatformItem
import com.plajah.app.ui.components.Eyebrow
import com.plajah.app.ui.theme.PlajahBrand
import com.plajah.app.ui.theme.PlajahTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.CancellationException
import java.net.HttpURLConnection
import java.net.URL

private val artCache=object:LruCache<String,android.graphics.Bitmap>(12*1024*1024){override fun sizeOf(key:String,value:android.graphics.Bitmap)=value.byteCount}
@Composable
fun PlatformArt(url:String,title:String,modifier:Modifier=Modifier,square:Boolean=true) {
    val bitmap by produceState<android.graphics.Bitmap?>(null,url) {
        value=artCache.get(url)
        if(value==null&&url.startsWith("https://"))value=withContext(Dispatchers.IO){
            try {
                val c=URL(url).openConnection() as HttpURLConnection
                try {
                    c.connectTimeout=10000;c.readTimeout=10000
                    // Use the API-26-compatible stream API; readNBytes needs newer Android.
                    val bytes=c.inputStream.use { input ->
                        val output=java.io.ByteArrayOutputStream();val chunk=ByteArray(8192)
                        while(output.size()<6*1024*1024){val count=input.read(chunk);if(count<0)break;output.write(chunk,0,count)}
                        output.toByteArray()
                    }
                    val bounds=BitmapFactory.Options().apply { inJustDecodeBounds=true };BitmapFactory.decodeByteArray(bytes,0,bytes.size,bounds)
                    val options=BitmapFactory.Options().apply { inSampleSize=maxOf(1,maxOf(bounds.outWidth,bounds.outHeight)/512) }
                    BitmapFactory.decodeByteArray(bytes,0,bytes.size,options)?.also { artCache.put(url,it) }
                }finally{c.disconnect()}
            }catch(e:CancellationException){throw e}catch(_:Exception){null}
        }
    }
    Box((if(square)modifier.fillMaxWidth().aspectRatio(1f) else modifier).background(MaterialTheme.colorScheme.surfaceVariant),contentAlignment=Alignment.Center){
        if(bitmap!=null)Image(bitmap!!.asImageBitmap(),title,Modifier.fillMaxSize(),contentScale=ContentScale.Crop)
        else Text(title.take(1),style=MaterialTheme.typography.displayMedium,color=MaterialTheme.colorScheme.primary)
    }
}

/** Native cards backed by the live catalog. Content actions use the platform player/reader,
 * preserving its authentication, purchases, licensing, captions and progress handling. */
@Composable
fun PlatformScreen(section:String,onOpenContent:(PlatformItem)->Unit) {
    var items by remember(section){mutableStateOf<List<PlatformItem>>(emptyList())}
    var loading by remember(section){mutableStateOf(true)}
    var error by remember(section){mutableStateOf<String?>(null)}
    var refresh by remember(section){mutableIntStateOf(0)}
    var search by remember(section){mutableStateOf("")}
    LaunchedEffect(section,refresh){
        loading=true;error=null
        try{items=PlatformCatalog.load(section)}catch(e:CancellationException){throw e}catch(e:Exception){error=e.message?:"Unable to reach Plajah."}finally{loading=false}
    }
    LazyVerticalGrid(columns=GridCells.Adaptive(160.dp),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(18.dp),horizontalArrangement=Arrangement.spacedBy(16.dp),modifier=Modifier.fillMaxSize()){
        item(span={GridItemSpan(maxLineSpan)}){
            Column(verticalArrangement=Arrangement.spacedBy(12.dp)){
                Eyebrow(if(section=="chora")"Entertainment · Chora" else "Discover · Plajah",color=PlajahBrand.Orange)
                Text(if(section=="chora")"Your sound, on stage." else "From Plajah",style=MaterialTheme.typography.displaySmall,fontWeight=androidx.compose.ui.text.font.FontWeight.Black)
                Text("Published by the Plajah community. Open a title for its native player or reader.",style=MaterialTheme.typography.bodyMedium,color=PlajahTheme.colors.textSecondary)
                OutlinedTextField(value=search,onValueChange={search=it},label={Text("Search these titles")},singleLine=true,modifier=Modifier.fillMaxWidth())
                Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(16.dp)){
                    OutlinedButton(onClick={refresh++},enabled=!loading){Text("Refresh")}
                    if(loading)CircularProgressIndicator(Modifier.size(24.dp)) else Text(items.size.toString()+" titles")
                }
                error?.let { Text(it,color=MaterialTheme.colorScheme.error) }
                if(!loading&&error==null&&items.isEmpty())Text("No published titles are available here yet.")
            }
        }
        items(items.filter{it.title.contains(search,true)||it.creator.contains(search,true)},key={it.kind+":"+it.id}){item->
            Card(onClick={onOpenContent(item)},shape=RoundedCornerShape(24.dp),border=BorderStroke(1.dp,PlajahTheme.colors.border),colors=CardDefaults.cardColors(containerColor=PlajahTheme.colors.glass1)){
                PlatformArt(item.image,item.title)
                Column(Modifier.padding(14.dp),verticalArrangement=Arrangement.spacedBy(6.dp)){
                    Text(item.title,style=MaterialTheme.typography.titleMedium,maxLines=2)
                    if(item.creator.isNotBlank())Text(item.creator,style=MaterialTheme.typography.bodySmall,maxLines=1)
                    Text(if(item.kind=="book")"OPEN READER →" else "OPEN PLAYER →",style=MaterialTheme.typography.labelMedium,color=PlajahBrand.Orange)
                }
            }
        }
    }
}
