import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.plajah.app',
  appName: 'Plajah',
  webDir: 'dist',

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
    // The native app is a thin shell that loads the LIVE deployed site, so every
    // deploy to master reaches the app immediately with no APK rebuild (only
    // native changes — plugins, config, icon — need a new APK). The Capacitor
    // native bridge is still injected into this remote origin, so isNativePlatform()
    // is true and the native plugins (Google sign-in, etc.) work. Requires network
    // to launch (no offline shell). To go back to a self-contained bundled build,
    // remove `url` and it loads from dist/ (webDir).
    url: 'https://plajah.com',
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
