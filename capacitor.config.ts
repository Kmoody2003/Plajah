import type { CapacitorConfig } from '@capacitor/cli';

// LIVE-SITE SHELL (default) vs BUNDLED BUILD.
//
// The APK is a thin shell over https://plajah.com: every deploy reaches the app with no APK rebuild,
// and — critically — the page's origin is plajah.com, so the ~60 places that call a relative `/api/...`
// (Aria, Chora transcode manifests + HLS media, Stripe, uploads...) reach the real backend, whose CORS
// allow-list only knows plajah.com. On 2026-10-03 `server.url` was dropped in a bulk checkpoint, which
// made the APK serve its own bundled copy of dist/ from https://plajah.app: there `/api/*` hit the
// app's local asset server (404) and the HLS playlists for every transcoded Chora track were dead, so
// tracks stalled ~10s before falling back to the raw WAV. Restored below.
//
// Live-site mode does not need dist/ inside the APK, so webDir is a tiny placeholder (cap-shell/) — that
// alone took ~410MB out of the APK. For a self-contained OFFLINE build run `CAP_BUNDLED=1 npx cap sync
// android` (webDir=dist, no server.url); note the backend must then allow the plajah.app origin.
const bundled = process.env.CAP_BUNDLED === '1';

const config: CapacitorConfig = {
  appId: 'com.plajah.app',
  appName: 'Plajah',
  webDir: bundled ? 'dist' : 'cap-shell',

  // Android-specific settings
  android: {
    // Edge-to-edge (transparent status + nav bars) — pairs with WindowCompat in MainActivity.kt
    appendUserAgent: 'Plajah/2.0 Android',
    allowMixedContent: false,
    // Capture console.log from WebView in logcat for debugging
    loggingBehavior: 'debug',
    // Minimum API 26 — Compose 3 + Media3 requirement
    minWebViewVersion: 80,
  },

  plugins: {
    // Push Notifications — wired to Firebase Cloud Messaging
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    // Browser plugin — used for Mastodon OAuth popup
    Browser: {
      presentationStyle: 'popover',
    },
    // Capacitor HTTP — MUST stay disabled: when enabled it patches native
    // fetch/XHR and breaks the Firebase Firestore transport (XHR/WebChannel
    // streaming), so real-time data never loads and the app shows no content.
    // Nothing in the app relies on it; Firestore/Storage/Auth do their own
    // networking, and the backend already serves the web origin cross-origin.
    CapacitorHttp: {
      enabled: false,
    },
    // Native Google/OAuth sign-in (WebViews block web-OAuth popups). skipNativeAuth
    // keeps the Firebase JS SDK as the single source of auth truth — the plugin only
    // returns a credential, which loginWithGoogle() feeds to signInWithCredential().
    FirebaseAuthentication: {
      skipNativeAuth: true,
      // NOTE: 'facebook.com' is intentionally omitted — the native Facebook SDK
      // throws at app startup if no Facebook App ID / Client Token meta-data is
      // present, crashing the whole app. Re-add it together with the FB app-id +
      // client-token in AndroidManifest/strings once those credentials are set.
      // Google needs the web client id (from google-services.json); Twitter and
      // Microsoft use Firebase's OAuth (Custom Tab) and need no native SDK.
      providers: ['google.com', 'twitter.com', 'microsoft.com'],
    },
  },

  server: {
    // Live site (see the note at the top). The native bridge is still injected into this remote
    // origin, so isNativePlatform() is true and the native plugins (Google sign-in, NativeAudio, ...)
    // work. Needs network to launch; errorPath shows a local retry page instead of Chrome's error.
    ...(bundled ? {} : { url: 'https://plajah.com', errorPath: 'offline.html' }),
    cleartext: false,
    androidScheme: 'https',
    hostname: 'plajah.app',
    allowNavigation: [
      'plajah.com',
      '*.firebaseapp.com',
      '*.firebase.googleapis.com',
      '*.googleapis.com',
      '*.mux.com',
      '*.stripe.com',
    ],
  },
};

export default config;
