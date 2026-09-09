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
                darkTheme = isSystemInDarkTheme(),
                dynamicTint = dynamicTint,
            ) {
                PlajahApp(
                    onExitToClassic = { returnToClassic() },
                    dynamicTint = dynamicTint,
                    onDynamicTintChange = { on ->
                        dynamicTint = on
                        ShellPrefs.setDynamicTint(this, on)
                    },
                )
            }
        }
    }

    private fun returnToClassic() {
        ShellPrefs.setNativeEnabled(this, false)
        startActivity(
            Intent(this, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
        )
        finish()
    }
}
