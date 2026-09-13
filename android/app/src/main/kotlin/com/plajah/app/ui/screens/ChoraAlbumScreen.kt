package com.plajah.app.ui.screens

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.plajah.app.data.PlatformItem
import com.plajah.app.ui.components.Eyebrow
import com.plajah.app.ui.theme.PlajahBrand
import com.plajah.app.ui.theme.PlajahTheme
import kotlinx.coroutines.delay
import kotlin.random.Random

private fun clock(ms:Long):String { val seconds=(ms/1000).coerceAtLeast(0);return "%d:%02d".format(seconds/60,seconds%60) }

/** Native Night Registry album surface. Remaining feature gaps are tracked separately. */
@Composable
fun ChoraAlbumScreen(album:PlatformItem,onBack:()->Unit,onOpenClassic:(String)->Unit) {
    val context=LocalContext.current
    val player=rememberChoraPlayer()
    if(player==null){Box(Modifier.fillMaxSize().background(NightGround),contentAlignment=Alignment.Center){CircularProgressIndicator(color=ChoraCyan)};return}
    var selected by remember(album.id){mutableIntStateOf(0)}
    var playing by remember{mutableStateOf(false)}
    var shuffle by remember{mutableStateOf(false)}
    var repeat by remember{mutableStateOf(false)}
    var position by remember{mutableLongStateOf(0)}
    var duration by remember{mutableLongStateOf(0)}
    var tab by remember{mutableStateOf("TRACKS")}
    var playbackError by remember { mutableStateOf<String?>(null) }
    fun ownsQueue()=player.currentMediaItem?.mediaId?.startsWith(album.id+":")==true
    DisposableEffect(player,album.id){
        val listener=object:Player.Listener{
            override fun onIsPlayingChanged(value:Boolean){playing=value&&ownsQueue()}
            override fun onPlayerError(error:androidx.media3.common.PlaybackException){playbackError="This track could not play. ${error.errorCodeName}"}
            override fun onMediaItemTransition(item:MediaItem?,reason:Int){item?.mediaId?.let{id->album.tracks.indexOfFirst{album.id+":"+it.id==id}.takeIf{it>=0}?.let{selected=it}}}
        }
        playing=player.isPlaying&&ownsQueue();shuffle=player.shuffleModeEnabled;repeat=player.repeatMode==Player.REPEAT_MODE_ONE
        player.currentMediaItem?.mediaId?.let{id->album.tracks.indexOfFirst{album.id+":"+it.id==id}.takeIf{it>=0}?.let{selected=it}}
        player.addListener(listener);onDispose{player.removeListener(listener)}
    }
    LaunchedEffect(player,album.id){while(true){position=if(ownsQueue())player.currentPosition else 0;duration=if(ownsQueue())player.duration.coerceAtLeast(0) else 0;delay(250)}}
    fun play(index:Int){
        val track=album.tracks.getOrNull(index)?:return;selected=index;playbackError=null
        if(track.url.isBlank()){onOpenClassic(album.platformUrl+"&track="+track.id);return}
        val playable=album.tracks.filter{it.url.isNotBlank()}
        val ids=playable.map{album.id+":"+it.id}
        if((0 until player.mediaItemCount).map{player.getMediaItemAt(it).mediaId}!=ids)player.setMediaItems(playable.map{item->MediaItem.Builder().setUri(item.url).setMediaId(album.id+":"+item.id).setMediaMetadata(MediaMetadata.Builder().setTitle(item.title).setArtist(item.artist.ifBlank{album.creator}).setAlbumTitle(album.title).setArtworkUri(android.net.Uri.parse(album.image)).build()).build()})
        player.seekTo(playable.indexOfFirst{it.id==track.id}.coerceAtLeast(0),0);player.prepare();player.play()
    }
    fun skip(step:Int){if(player.mediaItemCount==0){play(selected);return};if(step>0)player.seekToNextMediaItem()else player.seekToPrevious();player.play()}
    val track=album.tracks.getOrNull(selected)
    val timedLine=track?.timedLyrics?.lastOrNull{it.first*1000<=position}?.second
    Column(Modifier.fillMaxSize().background(NightGround).safeDrawingPadding()){
        Row(Modifier.fillMaxWidth().padding(horizontal=14.dp,vertical=8.dp),verticalAlignment=Alignment.CenterVertically){
            Row(Modifier.clickable(onClick=onBack).padding(end=16.dp),verticalAlignment=Alignment.CenterVertically){ChoraBackMark();Text("BACK",fontSize=11.sp,fontWeight=FontWeight.Black,letterSpacing=1.1.sp)}
            Column(Modifier.weight(1f),horizontalAlignment=Alignment.CenterHorizontally){Text(album.title.uppercase(),fontSize=12.sp,fontWeight=FontWeight.Black,letterSpacing=1.2.sp,maxLines=1,overflow=TextOverflow.Ellipsis);Text(album.creator.uppercase(),fontSize=8.sp,fontWeight=FontWeight.Bold,letterSpacing=2.4.sp,color=ChoraOrange,maxLines=1)}
            IconButton(onClick={context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply{type="text/plain";putExtra(Intent.EXTRA_TEXT,album.platformUrl)},"Share on"))}){Icon(Icons.Rounded.Share,"Share")}
        }
        Box(Modifier.fillMaxWidth().weight(1f).background(Brush.verticalGradient(listOf(Color(0xFF220433),NightGround,Color.Black)))) {
            ChoraOrrery(album,selected,{play(it)},Modifier.align(Alignment.Center))
            Column(Modifier.align(Alignment.BottomStart).fillMaxWidth().background(Brush.verticalGradient(listOf(Color.Transparent,Color.Black))).padding(24.dp)) {
                Text(track?.title?:album.title,fontSize=24.sp,fontWeight=FontWeight.Black,fontStyle=FontStyle.Italic,lineHeight=24.sp,maxLines=2)
                Text(album.creator.uppercase(),fontSize=11.sp,letterSpacing=2.sp,color=ChoraOrange,fontWeight=FontWeight.Black)
                Spacer(Modifier.height(12.dp))
                Box(Modifier.fillMaxWidth().height(3.dp).background(Color.White.copy(.16f))){Box(Modifier.fillMaxWidth(if(duration>0)(position.toFloat()/duration).coerceIn(0f,1f)else 0f).fillMaxHeight().background(Spatial))}
            }
        }
        Box(Modifier.weight(1f).fillMaxWidth().background(Color.Black.copy(.7f))) {
            when(tab) {
                "TRACKS" -> LazyColumn(contentPadding=PaddingValues(top=24.dp)) { itemsIndexed(album.tracks,key={_,t->t.id}) { index,item ->
                    Row(Modifier.fillMaxWidth().background(if(index==selected)Brush.horizontalGradient(listOf(ChoraOrange.copy(.35f),Color(0xFFD40055).copy(.4f),Color(0xFF6B0099).copy(.5f)))else Brush.horizontalGradient(listOf(Color.Transparent,Color.Transparent))).clickable{play(index)}.padding(horizontal=16.dp,vertical=14.dp),verticalAlignment=Alignment.CenterVertically) {
                        Text("${index+1}",Modifier.width(28.dp),fontSize=10.sp,fontWeight=FontWeight.Black,color=ChoraOrange)
                        Column(Modifier.weight(1f)) {Text(item.title.uppercase(),fontSize=12.sp,fontWeight=FontWeight.Bold,letterSpacing=1.2.sp,maxLines=1,overflow=TextOverflow.Ellipsis);Text(if(index==selected&&playing)timedLine.orEmpty() else item.artist.ifBlank{album.creator}.uppercase(),fontSize=8.sp,fontWeight=FontWeight.Bold,letterSpacing=.8.sp,color=Color.White.copy(.3f),maxLines=1)}
                        IconButton(onClick={play(index)},modifier=Modifier.size(34.dp)){Icon(if(index==selected&&playing)Icons.Rounded.GraphicEq else Icons.Rounded.PlayArrow,"Play ${item.title}",Modifier.size(16.dp),tint=Color.White.copy(.4f))}
                        IconButton(onClick={context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply{type="text/plain";putExtra(Intent.EXTRA_TEXT,album.platformUrl+"&track="+item.id)},"Share track"))},modifier=Modifier.size(34.dp)){Icon(Icons.Rounded.Share,"Share ${item.title}",Modifier.size(16.dp),tint=Color.White.copy(.4f))}
                    }
                    HorizontalDivider(color=Color.White.copy(.06f))
                } }
                "LYRICS" -> LazyColumn(contentPadding=PaddingValues(24.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
                    if(!track?.timedLyrics.isNullOrEmpty())itemsIndexed(track!!.timedLyrics){_,line->Text(line.second,Modifier.fillMaxWidth().clickable{player.seekTo((line.first*1000).toLong())},fontSize=18.sp,fontWeight=FontWeight.Bold,color=if(line.second==timedLine)ChoraOrange else Color.White.copy(.55f))}
                    else item{Text(track?.lyrics?.takeIf{it.isNotBlank()}?:"Lyrics are not available for this track.",color=Color.White.copy(.7f))}
                }
                "INFO" -> Column(Modifier.verticalScroll(rememberScrollState()).padding(24.dp),verticalArrangement=Arrangement.spacedBy(16.dp)){Text(album.creator.uppercase(),fontSize=18.sp,fontWeight=FontWeight.Black);Text(album.description,fontSize=14.sp,fontStyle=FontStyle.Italic,color=Color.White.copy(.65f))}
                "COMMENTS" -> ChoraFeed(album.id,track?.id,track?.title.orEmpty())
                "MEDIA" -> LazyColumn(contentPadding=PaddingValues(24.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
                    val images=track?.images.orEmpty()
                    if(images.isEmpty())item{Text("No additional track artwork.",fontSize=12.sp,color=Color.White.copy(.5f))}
                    itemsIndexed(images){_,url->PlatformArt(url,track?.title.orEmpty())}
                }
            }
        }
        playbackError?.let{Text(it,Modifier.padding(horizontal=16.dp),fontSize=11.sp,color=ChoraOrange)}
        Row(Modifier.fillMaxWidth().height(52.dp),horizontalArrangement=Arrangement.SpaceEvenly,verticalAlignment=Alignment.CenterVertically){
            IconButton(onClick={shuffle=!shuffle;player.shuffleModeEnabled=shuffle}){Icon(Icons.Rounded.Shuffle,"Shuffle",tint=if(shuffle)ChoraOrange else Color.White.copy(.5f))}
            IconButton(onClick={skip(-1)}){Icon(Icons.Rounded.SkipPrevious,"Previous")}
            IconButton(onClick={if(!ownsQueue())play(selected)else if(player.isPlaying)player.pause()else player.play()}){Icon(if(playing)Icons.Rounded.Pause else Icons.Rounded.PlayArrow,"Play or pause",tint=ChoraOrange)}
            IconButton(onClick={skip(1)}){Icon(Icons.Rounded.SkipNext,"Next")}
            IconButton(onClick={repeat=!repeat;player.repeatMode=if(repeat)Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF}){Icon(Icons.Rounded.RepeatOne,"Repeat one",tint=if(repeat)ChoraCyan else Color.White.copy(.5f))}
        }
        Row(Modifier.fillMaxWidth().background(Color(0xFF0A0610)).horizontalScroll(rememberScrollState()).padding(horizontal=8.dp,vertical=6.dp),horizontalArrangement=Arrangement.spacedBy(3.dp)) {
            listOf("TRACKS" to "Tracks","LYRICS" to "Lyrics","MEDIA" to "Videos","COMMENTS" to "Feed","INFO" to "Notes").forEach{(id,label)->Box(Modifier.height(30.dp).background(if(tab==id)Spatial else Brush.linearGradient(listOf(Color.Transparent,Color.Transparent)),CircleShape).clickable{tab=id}.padding(horizontal=12.dp),contentAlignment=Alignment.Center){Text(label.uppercase(),fontSize=9.sp,fontWeight=FontWeight.Black,letterSpacing=.9.sp,color=Color.White.copy(if(tab==id)1f else .5f))}}
            Text("NIGHT ☾",Modifier.padding(8.dp),fontSize=9.sp,color=Color.White.copy(.7f))
        }
    }
}
