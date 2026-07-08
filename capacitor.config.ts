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
      providers: ['google.com', 'facebook.com', 'twitter.com', 'microsoft.com'],
    },
  },

  server: {
    // In development: point native shell at local Vite dev server
    // In production: remove url so it loads from dist/ (webDir)
    // url: 'http://10.0.2.2:5173', // uncomment for Android emulator dev
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
