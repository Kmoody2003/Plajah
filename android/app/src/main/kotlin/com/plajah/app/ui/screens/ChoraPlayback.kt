package com.plajah.app.ui.screens

import android.content.ComponentName
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.plajah.app.PlajahMediaService

/** The screen owns a controller, not the player. Leaving an album keeps the real
 * MediaSession queue alive for Android background and lock-screen controls. */
@Composable internal fun rememberChoraPlayer():Player? {
    val context=LocalContext.current.applicationContext
    var controller by remember { mutableStateOf<MediaController?>(null) }
    DisposableEffect(context) {
        val future=MediaController.Builder(context,SessionToken(context,ComponentName(context,PlajahMediaService::class.java))).buildAsync()
        var disposed=false
        future.addListener({if(!disposed)controller=runCatching { future.get() }.getOrNull()},ContextCompat.getMainExecutor(context))
        onDispose { disposed=true;MediaController.releaseFuture(future) }
    }
    return controller
}
