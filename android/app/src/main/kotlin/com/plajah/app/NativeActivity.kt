package com.plajah.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.plajah.app.ui.PlajahApp
import com.plajah.app.ui.ShellPrefs
import com.plajah.app.ui.theme.PlajahTheme

/**
 * Host for the NATIVE Jetpack Compose shell. The Capacitor WebView (MainActivity)
 * is left completely untouched; this is a parallel front-end the user toggles into.
 *
 * Reverse toggle (native → Classic) is pure native: flip the flag and relaunch
 * MainActivity. The forward toggle (web → native) is driven by PlajahShellPlugin.
 */
class NativeActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            var dynamicTint by remember { mutableStateOf(ShellPrefs.isDynamicTint(this)) }

            PlajahTheme(
                darkTheme = true,
                dynamicTint = false,
            ) {
                androidx.compose.material3.Surface(
                    color=androidx.compose.ui.graphics.Color(0xFF04030A),
                    contentColor=androidx.compose.ui.graphics.Color.White,
                ) {
                    com.plajah.app.ui.screens.ChoraNightScreen(
                        initialAlbumId = intent.getStringExtra("platformContentUrl")?.let { url ->
                            val uri=android.net.Uri.parse(url)
                            if(uri.scheme=="https"&&uri.host=="plajah.com"&&uri.getQueryParameter("type")=="album")uri.getQueryParameter("id")else null
                        },
                        onOpenPlatform = { url -> returnToClassic(url) },
                        onExit = { returnToClassic() },
                    )
                }
            }
        }
    }

    private fun returnToClassic(url: String? = null) {
        stopService(Intent(this,PlajahMediaService::class.java))
        ShellPrefs.setNativeEnabled(this, false)
        startActivity(
            Intent(this, MainActivity::class.java)
                .putExtra("platformContentUrl", url)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
        )
        finish()
    }
}
