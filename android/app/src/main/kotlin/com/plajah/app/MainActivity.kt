package com.plajah.app

import android.app.UiModeManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.provider.OpenableColumns
import com.plajah.app.ui.ShellPrefs
import android.util.Log
import android.util.TypedValue
import android.view.KeyEvent
import android.view.View
import android.webkit.WebView
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import androidx.lifecycle.lifecycleScope
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import com.getcapacitor.BridgeActivity
import com.getcapacitor.CapConfig
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

class MainActivity : BridgeActivity() {
    private var televisionMode = false
    /** The intent this activity was created with — BridgeActivity.load() replays it through
     *  onNewIntent, and it has already been handled via the start path. */
    private var launchIntent: Intent? = null

    private fun experienceFor(intent: Intent?): String? {
        // Default Phone / SMS app intents (dial, sms:, our call notification) → the "phone" experience.
        com.plajah.app.telecom.PhoneIntents.capture(this, intent)?.let { return it }
        val component = intent?.component ?: return null
        return try {
            packageManager.getActivityInfo(component, PackageManager.GET_META_DATA)
                .metaData?.getString(EXPERIENCE_META)
                ?.takeIf { SLUG_RE.matches(it) }
        } catch (_: Exception) { null }
    }

    /** OPEN_MEDIA_FILE payload (same shape the Windows shell posts) for a VIEW intent, else null. */
    private fun mediaPayloadFor(intent: Intent?): String? {
        if (intent?.action != Intent.ACTION_VIEW) return null
        val uri = intent.data ?: return null
        if (uri.scheme != "content" && uri.scheme != "file") return null
        val mime = intent.type ?: (try { contentResolver.getType(uri) } catch (_: Exception) { null }) ?: ""
        val kind = when {
            mime.startsWith("image/") -> "IMAGE"
            mime.startsWith("video/") -> "VIDEO"
            mime.startsWith("audio/") -> "AUDIO"
            mime == "application/zip" || mime == "application/x-zip-compressed" -> "ARCHIVE"
            mime == "application/pdf" || mime.startsWith("text/") || mime == "application/json" -> "DOC"
            else -> return null
        }
        var name = uri.lastPathSegment?.substringAfterLast('/') ?: "file"
        var size = 0L
        if (uri.scheme == "content") {
            try {
                contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
                    if (c.moveToFirst()) {
                        val ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        if (ni >= 0) c.getString(ni)?.let { name = it }
                        val si = c.getColumnIndex(OpenableColumns.SIZE)
                        if (si >= 0 && !c.isNull(si)) size = c.getLong(si)
                    }
                }
            } catch (_: Exception) { /* name/size are cosmetic */ }
        } else {
            uri.path?.let { size = File(it).length() }
        }
        val url = if (uri.scheme == "content") "/_capacitor_content_" + uri.toString().removePrefix("content:/")
                  else "/_capacitor_file_" + (uri.path ?: "")
        val file = JSONObject()
            .put("name", name)
            .put("fullPath", uri.toString())
            .put("size", size)
            .put("url", url)
            .put("mediaKind", kind)
        return JSONObject()
            .put("type", "OPEN_MEDIA_FILE")
            .put("mediaKind", kind)
            .put("activeFile", file)
            .put("folderFiles", JSONArray().put(file))
            .toString()
    }

    /** The bundled capacitor.config.json with server.appStartPath overridden, so the WebView's
     *  FIRST load is the launch target — no second navigation after boot. */
    private fun launchConfig(startPath: String): CapConfig? = try {
        val json = JSONObject(assets.open("capacitor.config.json").bufferedReader().use { it.readText() })
        val server = json.optJSONObject("server") ?: JSONObject().also { json.put("server", it) }
        server.put("appStartPath", startPath)
        val dir = File(filesDir, "launch-config").apply { mkdirs() }
        File(dir, "capacitor.config.json").writeText(json.toString())
        CapConfig.loadFromFile(this, dir.absolutePath)
    } catch (e: Exception) {
        Log.w(TAG, "Launch start path unavailable, booting default: ${e.message}")
        null
    }

    private fun isTelevision(): Boolean {
        var uiMode = false
        var leanback = false
        var tvFeature = false
        try {
            val ui = getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
            uiMode = ui?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION
        } catch (_: Exception) { /* leave false */ }
        try {
            packageManager?.let {
                leanback = it.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
                tvFeature = it.hasSystemFeature("android.hardware.type.television")
            }
        } catch (_: Exception) { /* leave false */ }

        val isTv = uiMode || leanback || tvFeature
        Log.i(TAG, "TV detection: uiModeTelevision=$uiMode leanback=$leanback televisionFeature=$tvFeature -> isTV=$isTv")
        return isTv
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        val launchExperience = experienceFor(intent)
        val launchMedia = mediaPayloadFor(intent)
        if (launchExperience == null && launchMedia == null && !isTelevision() && ShellPrefs.isNativeEnabled(this)) {
            super.onCreate(savedInstanceState)
            startActivity(Intent(this, NativeActivity::class.java)
                .putExtra("platformContentUrl", intent.getStringExtra("platformContentUrl")))
            finish()
            return
        }

        registerPlugin(WatchNextPlugin::class.java)
        registerPlugin(PlajahCameraPlugin::class.java)
        registerPlugin(PlajahShellPlugin::class.java)
        registerPlugin(PlajahNativeAudioPlugin::class.java)
        registerPlugin(PlajahSpeechPlugin::class.java)
        registerPlugin(PlajahLaunchPlugin::class.java)
        registerPlugin(PlajahFilesPlugin::class.java)
        registerPlugin(PlajahSpeakersPlugin::class.java)
        registerPlugin(PlajahMatterPlugin::class.java)
        registerPlugin(PlajahDevicePlugin::class.java)
        registerPlugin(PlajahHubPlugin::class.java)
        registerPlugin(com.plajah.app.telecom.PlajahTelecomPlugin::class.java)

        PlajahLaunchPlugin.pendingMediaJson = launchMedia
        val startPath = when {
            launchMedia != null -> "/?open=media"
            launchExperience != null -> "/?view=$launchExperience"
            else -> null
        }
        startPath?.let { launchConfig(it) }?.let { config = it }
        launchIntent = intent

        val splash = installSplashScreen()
        val splashStart = System.currentTimeMillis()
        val splashHold = if (launchMedia != null) MEDIA_SPLASH_HOLD_MS else SPLASH_HOLD_MS
        splash.setKeepOnScreenCondition {
            (System.currentTimeMillis() - splashStart) < splashHold
        }
        super.onCreate(savedInstanceState)

        intent.getStringExtra("platformContentUrl")?.let { requested ->
            val target = android.net.Uri.parse(requested)
            if (target.scheme == "https" && target.host == "plajah.com") {
                bridge?.webView?.loadUrl(requested)
            }
        }
        WindowCompat.setDecorFitsSystemWindows(window, false)

        try {
            bridge?.webView?.setBackgroundColor(android.graphics.Color.parseColor("#04030A"))
        } catch (_: Throwable) { /* pre-bridge or unavailable */ }

        televisionMode = isTelevision()

        // Performance & scalability tuning across phones, foldables, tablets, and TVs
        try {
            bridge?.webView?.apply {
                setLayerType(View.LAYER_TYPE_HARDWARE, null)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)
                }
                settings.useWideViewPort = true
                settings.loadWithOverviewMode = true
                settings.textZoom = 100
                settings.setSupportZoom(false)
                settings.builtInZoomControls = false
                settings.displayZoomControls = false
            }
        } catch (e: Exception) {
            Log.w(TAG, "WebView tuning failed: ${e.message}")
        }

        // Foldable posture observer (Samsung Z Fold, Pixel Fold, Z Flip):
        // Streams hinge bounds + posture mode into the WebView via CSS vars + data-fold-mode.
        if (!televisionMode) {
            observeFoldablePosture()
        }

        if (!televisionMode && launchMedia != null) return
        if (!televisionMode) {
            // Compact, sleek Native UI pill so it NEVER collides with top header buttons or video controls.
            val density = resources.displayMetrics.density
            val pillBg = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = 999f * density
                setColor(android.graphics.Color.parseColor("#CC140A24"))
                setStroke((1 * density).toInt().coerceAtLeast(1), android.graphics.Color.parseColor("#88FF8C00"))
            }
            val switch = android.widget.TextView(this).apply {
                text = "✦ NATIVE UI"
                setTextColor(android.graphics.Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
                typeface = android.graphics.Typeface.DEFAULT_BOLD
                letterSpacing = 0.08f
                background = pillBg
                setPadding((10 * density).toInt(), (5 * density).toInt(), (10 * density).toInt(), (5 * density).toInt())
                elevation = 8f * density
                isClickable = true
                isFocusable = true
                contentDescription = "Switch to the native Jetpack Compose interface"
                setOnClickListener {
                    ShellPrefs.setNativeEnabled(this@MainActivity, true)
                    startActivity(Intent(this@MainActivity, NativeActivity::class.java))
                    finish()
                }
            }
            val params = android.widget.FrameLayout.LayoutParams(
                android.view.ViewGroup.LayoutParams.WRAP_CONTENT,
                android.view.ViewGroup.LayoutParams.WRAP_CONTENT,
                android.view.Gravity.TOP or android.view.Gravity.END,
            ).apply {
                topMargin = (34 * density).toInt()
                rightMargin = (8 * density).toInt()
            }
            addContentView(switch, params)
            return
        }

        // Keep D-pad keys inside the WebView on Android TV / Fire TV.
        try {
            bridge?.webView?.apply {
                isFocusable = true
                isFocusableInTouchMode = true
                requestFocus()
            }
        } catch (e: Exception) {
            Log.w(TAG, "WebView focus setup failed: ${e.message}")
        }

        try {
            val settings = bridge?.webView?.settings ?: run {
                Log.w(TAG, "TV detected but WebView unavailable — web layer falls back to heuristics")
                return
            }
            settings.useWideViewPort = true
            settings.loadWithOverviewMode = true
            settings.mediaPlaybackRequiresUserGesture = false

            val ua = settings.userAgentString
            if (ua != null && !ua.contains(TV_TOKEN)) {
                settings.userAgentString = "$ua $TV_TOKEN"
                Log.i(TAG, "UA tagged: ${settings.userAgentString}")
            }
        } catch (e: Exception) {
            Log.w(TAG, "UA tagging failed: ${e.message}")
        }
    }

    /** Last hinge reading. Posture is re-sent from this on rotation and after every page load:
     *  WindowInfoTracker's first emission lands before the plajah.com page exists, and an
     *  attribute set on that blank document is gone once the real page loads. */
    private var lastFoldFeature: FoldingFeature? = null

    private fun observeFoldablePosture() {
        try {
            bridge?.addWebViewListener(object : com.getcapacitor.WebViewListener() {
                override fun onPageLoaded(webView: WebView?) { pushFoldableStateToWeb(lastFoldFeature) }
            })
        } catch (e: Exception) {
            Log.w(TAG, "Foldable page-load hook unavailable: ${e.message}")
        }
        lifecycleScope.launch {
            try {
                WindowInfoTracker.getOrCreate(this@MainActivity)
                    .windowLayoutInfo(this@MainActivity)
                    .collectLatest { layoutInfo ->
                        val feature = layoutInfo.displayFeatures
                            .filterIsInstance<FoldingFeature>()
                            .firstOrNull()
                        lastFoldFeature = feature
                        pushFoldableStateToWeb(feature)
                    }
            } catch (e: Exception) {
                Log.w(TAG, "Foldable posture observer unavailable: ${e.message}")
            }
        }
    }

    private fun pushFoldableStateToWeb(feature: FoldingFeature?) {
        val wv = bridge?.webView ?: return
        val density = resources.displayMetrics.density.coerceAtLeast(1f)
        val widthDp = resources.configuration.screenWidthDp
        val heightDp = resources.configuration.screenHeightDp.coerceAtLeast(1)
        val aspect = widthDp.toFloat() / heightDp.toFloat()
        val isSeparating = feature?.isSeparating == true || feature?.state == FoldingFeature.State.HALF_OPENED
        val mode = when {
            isSeparating && feature?.orientation == FoldingFeature.Orientation.HORIZONTAL -> "tabletop"
            isSeparating && feature?.orientation == FoldingFeature.Orientation.VERTICAL -> "book"
            widthDp < 440 && aspect < 0.56f -> "cover"
            widthDp in 580..1050 && aspect in 0.68f..1.48f -> "inner"
            else -> "standard"
        }
        val b = feature?.bounds
        val hx = ((b?.left ?: 0) / density).toInt()
        val hy = ((b?.top ?: 0) / density).toInt()
        val hw = ((b?.width() ?: 0) / density).toInt()
        val hh = ((b?.height() ?: 0) / density).toInt()
        val js = "(function(){var r=document.documentElement;if(!r)return;" +
            "r.setAttribute('data-fold-mode','$mode');" +
            "r.setAttribute('data-fold-hinge','${if (isSeparating) "separating" else if (feature != null) "flat" else "none"}');" +
            "r.style.setProperty('--fold-hinge-x','${hx}px');" +
            "r.style.setProperty('--fold-hinge-y','${hy}px');" +
            "r.style.setProperty('--fold-hinge-w','${hw}px');" +
            "r.style.setProperty('--fold-hinge-h','${hh}px');" +
            "window.dispatchEvent(new CustomEvent('plajah:foldable-change',{detail:{mode:'$mode',hinge:{x:$hx,y:$hy,w:$hw,h:$hh}}}));" +
            "})();"
        wv.post { wv.evaluateJavascript(js, null) }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        if (!televisionMode) pushFoldableStateToWeb(lastFoldFeature)
    }

    /** Warm re-entry (singleTask): a file opened, or an experience icon tapped, while running. */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent === launchIntent) return
        val plugin = bridge?.getPlugin("PlajahLaunch")?.instance as? PlajahLaunchPlugin ?: return
        mediaPayloadFor(intent)?.let { plugin.emitMedia(it); return }
        experienceFor(intent)?.let { plugin.emitExperience(it) }
    }

    /**
     * Ultra-low-latency TV remote & Bluetooth gamepad key dispatch.
     * Uses a cached window.__pjKey dispatcher to avoid re-parsing a large IIFE on every key press.
     */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (televisionMode && event.action == KeyEvent.ACTION_DOWN) {
            val mapped: Pair<String, Int>? = when (event.keyCode) {
                KeyEvent.KEYCODE_DPAD_UP -> "ArrowUp" to 38
                KeyEvent.KEYCODE_DPAD_DOWN -> "ArrowDown" to 40
                KeyEvent.KEYCODE_DPAD_LEFT -> "ArrowLeft" to 37
                KeyEvent.KEYCODE_DPAD_RIGHT -> "ArrowRight" to 39
                KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_BUTTON_A -> "Enter" to 13
                KeyEvent.KEYCODE_BUTTON_B -> "GoBack" to 4
                KeyEvent.KEYCODE_CHANNEL_UP -> "ChannelUp" to 427
                KeyEvent.KEYCODE_CHANNEL_DOWN -> "ChannelDown" to 428
                KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> "MediaPlayPause" to 85
                KeyEvent.KEYCODE_MEDIA_PLAY -> "MediaPlay" to 126
                KeyEvent.KEYCODE_MEDIA_PAUSE -> "MediaPause" to 127
                KeyEvent.KEYCODE_MEDIA_NEXT -> "MediaTrackNext" to 87
                KeyEvent.KEYCODE_MEDIA_PREVIOUS -> "MediaTrackPrevious" to 88
                KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> "MediaFastForward" to 90
                KeyEvent.KEYCODE_MEDIA_REWIND -> "MediaRewind" to 89
                else -> null
            }
            if (mapped != null) {
                val (key, code) = mapped
                val rep = if (event.repeatCount > 0) "1" else "0"
                bridge?.webView?.evaluateJavascript(
                    "(window.__pjKey||(window.__pjKey=function(k,c,r){var e=new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true,repeat:!!r});try{Object.defineProperty(e,'keyCode',{value:c});Object.defineProperty(e,'which',{value:c});}catch(_){}window.dispatchEvent(e);}))('$key',$code,$rep);",
                    null
                )
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }

    companion object {
        private const val TAG = "PlajahTV"
        private const val TV_TOKEN = "PlajahTV/1"
        private const val SPLASH_HOLD_MS = 900L
        private const val MEDIA_SPLASH_HOLD_MS = 250L
        private const val EXPERIENCE_META = "com.plajah.app.EXPERIENCE"
        private val SLUG_RE = Regex("^[a-z_-]{1,32}$")
    }
}
