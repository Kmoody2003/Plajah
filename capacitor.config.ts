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
    // Capacitor HTTP — bypass CORS on native for API calls
    CapacitorHttp: {
      enabled: true,
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
