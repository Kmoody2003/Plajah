import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// ── App Check (reCAPTCHA v3) ───────────────────────────────────────────────
// Attests that Firestore/Storage/Auth traffic comes from the real Plajah app,
// not scrapers or stolen API keys. Must initialize before any other Firebase
// service is used. Enable enforcement in the Firebase console only AFTER this
// build is live and the App Check metrics show verified tokens — enforcing
// earlier locks out every client.
//
// This module is also imported by the Node server (server.ts) where there is
// no DOM, no `self`, and no Vite-injected `import.meta.env`. Guard everything
// so App Check is a browser-only concern and never crashes the server.
const viteEnv = (import.meta as any).env || {};
const isBrowser = typeof window !== 'undefined' && typeof self !== 'undefined';
const appCheckSiteKey = viteEnv.VITE_APPCHECK_RECAPTCHA_SITE_KEY;
if (isBrowser && appCheckSiteKey) {
  // In dev, register the debug token printed to the console under
  // Firebase console → App Check → Apps → Manage debug tokens, so localhost
  // (which the reCAPTCHA site key doesn't cover) still gets valid tokens.
  if (viteEnv.DEV) {
    (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e) {
    // Never let an App Check init hiccup block app boot.
    console.warn('[AppCheck] initialization skipped:', (e as Error)?.message);
  }
} else if (isBrowser && viteEnv.PROD) {
  console.warn('[AppCheck] VITE_APPCHECK_RECAPTCHA_SITE_KEY not set — App Check disabled.');
}

export { app };
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const storage = getStorage(app);
export const auth = getAuth(app);
