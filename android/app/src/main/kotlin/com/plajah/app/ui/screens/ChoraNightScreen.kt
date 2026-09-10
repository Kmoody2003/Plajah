package com.plajah.app.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.plajah.app.data.PlatformCatalog
import com.plajah.app.data.PlatformItem
import com.plajah.app.ui.theme.BrandDisplay
import kotlinx.coroutines.CancellationException
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/** Chora is the only native destination under reconstruction. Other products retain
 * their existing platform entry rather than showing unrelated native demo screens. */
@Composable fun ChoraNightScreen(onOpenPlatform:(String)->Unit,onExit:()->Unit) {
    var albums by remember { mutableStateOf<List<PlatformItem>>(emptyList()) }
    var selected by remember { mutableStateOf<PlatformItem?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    var attempt by remember { mutableIntStateOf(0) }
    var search by remember { mutableStateOf("") }
    var tab by remember { mutableStateOf("NEW") }
    LaunchedEffect(attempt) { loading=true;error=null;try { albums=PlatformCatalog.load("chora") }catch(e:CancellationException){throw e}catch(e:Exception){error=e.message}finally{loading=false} }
    BackHandler(selected!=null) { selected=null }
    if(selected!=null){ChoraAlbumScreen(selected!!,{selected=null},onOpenPlatform);return}
    Column(Modifier.fillMaxSize().background(Color(0xFF04030A)).safeDrawingPadding()) {
        Row(Modifier.fillMaxWidth().height(52.dp).padding(horizontal=16.dp),verticalAlignment=Alignment.CenterVertically) {
            ChoraBackMark(Modifier.clickable(onClick=onExit))
            Text("PLAJAH",Modifier.weight(1f).padding(start=10.dp),fontFamily=BrandDisplay,fontWeight=FontWeight.Black,fontSize=18.sp,letterSpacing=2.sp)
            TextButton(onClick=onExit){Text("SWITCH BACK",fontSize=9.sp,color=Color.White.copy(.65f))}
        }
        LazyVerticalGrid(columns=GridCells.Fixed(2),contentPadding=PaddingValues(16.dp),horizontalArrangement=Arrangement.spacedBy(16.dp),verticalArrangement=Arrangement.spacedBy(20.dp),modifier=Modifier.weight(1f)) {
            item(span={GridItemSpan(2)}) { Column {
                Row { Text("PLAJAH ",fontFamily=BrandDisplay,fontSize=35.sp,fontStyle=FontStyle.Italic,fontWeight=FontWeight.Black,letterSpacing=(-.7).sp);Text("CHORA",style=TextStyle(brush=Spatial,fontFamily=BrandDisplay,fontSize=35.sp,fontStyle=FontStyle.Italic,fontWeight=FontWeight.Black,letterSpacing=(-.7).sp)) }
                val issue=ChronoUnit.DAYS.between(LocalDate.of(2026,1,1),LocalDate.now())+1
                Text("THE SKY TONIGHT  ·  ISSUE Nº $issue",Modifier.padding(top=8.dp),fontSize=10.sp,fontWeight=FontWeight.ExtraBold,letterSpacing=2.6.sp,color=Color.White.copy(.38f))
                Text("${albums.size} WORKS IN THE CATALOG",Modifier.padding(top=4.dp),fontSize=10.sp,fontWeight=FontWeight.ExtraBold,letterSpacing=2.6.sp,color=ChoraCyan)
                NightSky(albums){selected=it}
            } }
            item(span={GridItemSpan(2)}) { Column(verticalArrangement=Arrangement.spacedBy(12.dp)) {
                Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(6.dp)) {
                    listOf("NEW","ARTISTS","ALBUMS","GENRES").forEach { label->Box(Modifier.height(34.dp).background(if(label==tab)Spatial else Brush.linearGradient(listOf(Color.White.copy(.05f),Color.White.copy(.05f))),CircleShape).clickable { tab=label }.padding(horizontal=14.dp),contentAlignment=Alignment.Center){Text(label,fontSize=9.sp,fontWeight=FontWeight.Black,letterSpacing=1.sp)} }
                }
                OutlinedTextField(search,{search=it},Modifier.fillMaxWidth(),placeholder={Text("Search Chora",fontSize=12.sp)},leadingIcon={Icon(Icons.Rounded.Search,null,Modifier.size(18.dp))},singleLine=true,shape=CircleShape)
                if(loading)LinearProgressIndicator(Modifier.fillMaxWidth(),color=ChoraCyan)
                error?.let{Text(it,color=ChoraOrange);TextButton(onClick={attempt++}){Text("Retry")}}
            } }
            val filtered=albums.filter{it.title.contains(search,true)||it.creator.contains(search,true)||it.genre.contains(search,true)}
            if(tab=="ARTISTS"||tab=="GENRES") {
                val groups=filtered.groupBy{if(tab=="ARTISTS")it.creator else it.genre.ifBlank{"Uncategorized"}}
                groups.forEach { (name,releases)->item(span={GridItemSpan(2)},key=name){Column {
                    Text(name.uppercase(),fontSize=16.sp,fontWeight=FontWeight.Black)
                    Row(Modifier.horizontalScroll(rememberScrollState()).padding(top=12.dp),horizontalArrangement=Arrangement.spacedBy(12.dp)){releases.forEach { album->NightRelease(album,{selected=album},Modifier.width(142.dp)) }}
                }} }
            } else items(filtered,key={it.id}) { album->NightRelease(album,{selected=album},Modifier.fillMaxWidth()) }
        }
    }
}

@Composable private fun NightRelease(album:PlatformItem,onClick:()->Unit,modifier:Modifier) {
    Column(modifier.clickable(onClick=onClick)) {
        PlatformArt(album.image,album.title,Modifier.clip(RoundedCornerShape(16.dp)))
        Text(album.title.uppercase(),Modifier.padding(top=10.dp),fontSize=12.sp,fontWeight=FontWeight.Black,letterSpacing=.6.sp,maxLines=2,overflow=TextOverflow.Ellipsis)
        Text(album.creator.uppercase(),Modifier.padding(top=4.dp),fontSize=9.sp,fontWeight=FontWeight.Bold,letterSpacing=1.sp,color=Color.White.copy(.45f),maxLines=1)
    }
}

@Composable private fun NightSky(albums:List<PlatformItem>,onSelect:(PlatformItem)->Unit) {
    var seconds by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(Unit){val start=withFrameNanos{it};while(true)withFrameNanos{seconds=(it-start)/1_000_000_000f}}
    val sizes=listOf(76,60,54,46,40,36)
    val lanes=listOf(.35f,.18f,.58f,.27f,.67f,.48f)
    BoxWithConstraints(Modifier.padding(top=14.dp).fillMaxWidth().height(220.dp).clip(RoundedCornerShape(16.dp)).background(Brush.verticalGradient(listOf(Color(0xFF14091E),Color(0xFF021E24)))).border(1.dp,Color.White.copy(.12f),RoundedCornerShape(16.dp))) {
        Canvas(Modifier.fillMaxSize()) { listOf(.12f to .24f,.34f to .68f,.55f to .18f,.71f to .52f,.88f to .3f,.22f to .84f,.64f to .86f).forEach{(x,y)->drawCircle(Color.White.copy(.4f),1.dp.toPx(),Offset(size.width*x,size.height*y))} }
        Text("TONIGHT'S SKY",Modifier.padding(12.dp),fontSize=9.sp,fontWeight=FontWeight.ExtraBold,letterSpacing=2.sp,color=Color(0xFFD0BCFF))
        albums.filter{it.image.isNotBlank()}.take(6).forEachIndexed { index,album->
            val period=34f+(index%3)*4
            val x=((seconds+index*5.7f+2f)%period)/period*(maxWidth.value+240)-110
            Box(Modifier.offset(x.dp,(220*lanes[index]).dp).size(sizes[index].dp).clip(CircleShape).border(1.dp,ChoraCyan.copy(.4f),CircleShape).clickable{onSelect(album)}) { PlatformArt(album.image,album.title,Modifier.fillMaxSize(),square=false) }
        }
    }
}
