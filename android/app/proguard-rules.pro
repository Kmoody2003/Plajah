# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ── Plajah release (R8) keep rules ────────────────────────────────────────────────────────────
# Capacitor discovers plugins by class name from capacitor.plugins.json and calls @PluginMethod
# methods reflectively, and the WebView bridge is a @JavascriptInterface — none of that can be
# renamed or stripped.
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod, SourceFile, LineNumberTable
-keep class com.getcapacitor.** { *; }
-keep class org.apache.cordova.** { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
    @com.getcapacitor.PluginMethod public <methods>;
}
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
# Third-party Capacitor plugins loaded the same way (firebase-authentication, push, browser, app).
-keep class io.capawesome.** { *; }
# Our own plugins + Media3 service entry points named in AndroidManifest.xml.
-keep class com.plajah.app.** { *; }
-dontwarn org.apache.cordova.**
# Media3, Compose, Cast and Firebase ship their own consumer rules; keep the media session service
# classes the OS binds to by name.
-keep class androidx.media3.session.MediaLibraryService { *; }
-keep class androidx.media3.session.MediaSessionService { *; }

# Facebook login is an optional dependency of the firebase-authentication plugin (intentionally not shipped).
-dontwarn com.facebook.**
