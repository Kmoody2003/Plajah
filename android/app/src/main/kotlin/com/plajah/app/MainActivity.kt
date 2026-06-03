package com.plajah.app

import android.os.Bundle
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        // Render edge-to-edge — Compose and the WebView both respect system bar insets
        WindowCompat.setDecorFitsSystemWindows(window, false)
    }
}
