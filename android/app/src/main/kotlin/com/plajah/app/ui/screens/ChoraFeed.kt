package com.plajah.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.plajah.app.data.PlatformCatalog
import com.plajah.app.data.PlatformComment
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

@Composable internal fun ChoraFeed(albumId:String,trackId:String?,trackTitle:String) {
    var comments by remember(albumId){mutableStateOf<List<PlatformComment>>(emptyList())}
    var trackOnly by remember{mutableStateOf(false)}
    var loading by remember{mutableStateOf(true)}
    var error by remember{mutableStateOf<String?>(null)}
    var attempt by remember{mutableIntStateOf(0)}
    LaunchedEffect(albumId,trackId,trackOnly,attempt) {
        loading=true
        while(true) {
            try{comments=PlatformCatalog.comments(albumId,if(trackOnly)trackId?:"album" else "album");error=null}
            catch(e:CancellationException){throw e}catch(e:Exception){error=e.message}
            finally{loading=false}
            delay(15000)
        }
    }
    LazyColumn(contentPadding=PaddingValues(24.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
        item { Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){FilterChip(!trackOnly,{trackOnly=false},label={Text("Album",fontSize=10.sp)});FilterChip(trackOnly,{trackOnly=true},label={Text("Track",fontSize=10.sp)})} }
        if(trackOnly)item{Text(trackTitle,fontWeight=FontWeight.Bold,fontSize=12.sp)}
        if(loading)item{LinearProgressIndicator(Modifier.fillMaxWidth(),color=ChoraCyan)}
        error?.let{item{Text(it,color=ChoraOrange);TextButton(onClick={attempt++}){Text("Retry")}}}
        if(!loading&&error==null&&comments.isEmpty())item{Text("No comments yet.",fontSize=12.sp,color=Color.White.copy(.45f))}
        items(comments,key={it.id}){comment->Column(verticalArrangement=Arrangement.spacedBy(8.dp)){
            Text(comment.author.uppercase(),fontSize=10.sp,fontWeight=FontWeight.Black,letterSpacing=1.sp)
            Text(comment.text,fontSize=13.sp,color=Color.White.copy(.75f))
            if(comment.image.startsWith("https://"))PlatformArt(comment.image,"Comment attachment")
            HorizontalDivider(color=Color.White.copy(.08f))
        }}
    }
}
