package com.plajah.app.ui.screens

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.plajah.app.data.PlatformItem
import kotlin.math.*

internal val NightGround = Color(0xFF060210)
internal val ChoraOrange = Color(0xFFFF8C00)
internal val ChoraCyan = Color(0xFF00DAF3)
internal val Spatial = Brush.linearGradient(listOf(Color(0xFF6B0099), ChoraCyan))

/** The same path, stops and stroke geometry as components/Logo.tsx. */
@Composable internal fun ChoraBackMark(modifier:Modifier=Modifier) {
    Canvas(modifier.size(22.dp)) {
        val p=Path().apply { moveTo(size.width*.7f,size.height*.2f);lineTo(size.width*.3f,size.height*.5f);lineTo(size.width*.7f,size.height*.8f) }
        drawPath(p,Brush.linearGradient(listOf(Color(0xFF6B0099),Color(0xFFD40055),ChoraOrange)),style=Stroke(size.width*.18f,cap=StrokeCap.Round,join=StrokeJoin.Round))
    }
}

/** Port of OrreryStage.tsx: identical twelve-track window, radii and orbital periods.
 * Frame time is independent of the playback position so progress updates cannot restart orbits. */
@Composable internal fun ChoraOrrery(album:PlatformItem,selected:Int,onTrack:(Int)->Unit,modifier:Modifier=Modifier) {
    var elapsed by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(album.id) {
        val start=withFrameNanos { it }
        while(true)withFrameNanos { elapsed=(it-start)/1_000_000_000f }
    }
    val start=max(0,min(max(0,album.tracks.size-12),selected-6))
    val visible=album.tracks.drop(start).take(12)
    Box(modifier.size(340.dp),contentAlignment=Alignment.Center) {
        visible.forEachIndexed { slot,track ->
            val index=start+slot
            val active=index==selected
            val target=if(active)76f else min(146f,94f+max(0,abs(index-selected)-1)*6f)
            val radius by animateFloatAsState(target,spring(dampingRatio=.8f,stiffness=48f),label="Track orbit radius")
            val period=if(active)18f else 25f+(target/76f).pow(1.5f)*9f
            val angle=(360f/visible.size*slot-90f+elapsed*360f/period)*PI.toFloat()/180f
            Canvas(Modifier.fillMaxSize()) {
                drawCircle(if(active)ChoraOrange.copy(.2f) else ChoraCyan.copy(.075f),radius.dp.toPx(),style=Stroke(1.dp.toPx()))
            }
            Box(Modifier.offset { IntOffset((cos(angle)*radius.dp.toPx()).roundToInt(),(sin(angle)*radius.dp.toPx()).roundToInt()) }
                .size(34.dp).clip(CircleShape)
                .background(if(active)Brush.linearGradient(listOf(Color(0xFFD40055),ChoraOrange,Color(0xFF6B0099),ChoraCyan)) else Brush.linearGradient(listOf(Color.White.copy(.12f),Color.White.copy(.12f))))
                .border(1.dp,if(active)Color.Transparent else Color.White.copy(.25f),CircleShape)
                .semantics { contentDescription="Play ${track.title}" }.clickable { onTrack(index) },contentAlignment=Alignment.Center) {
                Text((index+1).toString().padStart(2,'0'),fontSize=10.sp,fontFamily=FontFamily.Monospace,fontWeight=FontWeight.Bold,color=Color.White)
            }
        }
        Canvas(Modifier.size(180.dp)) {
            drawCircle(Brush.radialGradient(listOf(Color(0xFFD40055).copy(.38f),Color.Transparent)),radius=size.minDimension/2)
        }
        PlatformArt(album.image,album.title,Modifier.size(112.dp).clip(CircleShape).border(1.dp,Color.White.copy(.25f),CircleShape),square=false)
        if(album.tracks.size>12)Text("+${album.tracks.size-12} MORE IN THE REGISTRY",Modifier.align(Alignment.BottomCenter),fontSize=9.sp,letterSpacing=1.2.sp,fontFamily=FontFamily.Monospace,color=Color.White.copy(.35f))
    }
}
