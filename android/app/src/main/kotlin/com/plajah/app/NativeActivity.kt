package com.plajah.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import com.plajah.app.ui.PlajahApp
import com.plajah.app.ui.ShellPrefs
import com.plajah.app.ui.nav.Destinations
import com.plajah.app.ui.theme.PlajahTheme

/**
 * Host for the NATIVE Jetpack Compose shell (toggled on via Native UI pill or PlajahShellPlugin).
 * Hosts the full 6-surface native rebuild: Chora (100% parity), Reello, Cinema, Lorea, Elevate, Academia.
 *
 * The Capacitor WebView (MainActivity) remains completely intact as Classic mode.
 */
class NativeActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val deepUrl = intent.getStringExtra("platformContentUrl")
        val (initialDestId, initialAlbumId) = parseDeepTarget(deepUrl)

        setContent {
            var dynamicTint by remember { mutableStateOf(ShellPrefs.isDynamicTint(this)) }

            PlajahTheme(
                darkTheme = true,
                dynamicTint = dynamicTint,
            ) {
                Surface(
                    color = Color(0xFF04030A),
                    contentColor = Color.White,
                ) {
                    PlajahApp(
                        initialDestinationId = initialDestId,
                        initialAlbumId = initialAlbumId,
                        onOpenContent = { url -> returnToClassic(url) },
                        onExitToClassic = { returnToClassic() },
                        dynamicTint = dynamicTint,
                        onDynamicTintChange = { enabled ->
                            dynamicTint = enabled
                            ShellPrefs.setDynamicTint(this@NativeActivity, enabled)
                        },
                    )
                }
            }
        }
    }

    private fun parseDeepTarget(url: String?): Pair<String, String?> {
        if (url.isNullOrBlank()) return Destinations.Chora.id to null
        val uri = runCatching { Uri.parse(url) }.getOrNull() ?: return Destinations.Chora.id to null
        val type = uri.getQueryParameter("type")?.lowercase()
        val id = uri.getQueryParameter("id")
        if (type == "album" && !id.isNullOrBlank()) {
            return Destinations.Chora.id to id
        }
        val view = uri.getQueryParameter("view")?.uppercase().orEmpty()
        val destId = when (view) {
            "MUSIC", "CHORA" -> Destinations.Chora.id
            "VIDEOS", "REELLO", "SHORTS" -> Destinations.Reello.id
            "MOVIES_TV", "CINEMA", "TALEO" -> Destinations.Cinema.id
            "BOOKS", "LOREA" -> Destinations.Lorea.id
            "PLAJAH_ELEVATE", "ELEVATE" -> Destinations.Elevate.id
            "CLASSROOMS", "ACADEMIA", "ACADEMIA_HOME" -> Destinations.Academia.id
            "FILES", "PLAJAH_DRIVE" -> Destinations.Files.id
            "DASHBOARD", "HOME" -> Destinations.Home.id
            else -> Destinations.Chora.id
        }
        return destId to null
    }

    private fun returnToClassic(url: String? = null) {
        stopService(Intent(this, PlajahMediaService::class.java))
        ShellPrefs.setNativeEnabled(this, false)
        startActivity(
            Intent(this, MainActivity::class.java)
                .putExtra("platformContentUrl", url)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
        )
        finish()
    }
}
