import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider, ReCaptchaEnterpriseProvider, getToken as getAppCheckToken, type AppCheck } from 'firebase/app-check';
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
// Preferred (docs/ANTI_BOT_PLAYBOOK.md): reCAPTCHA Enterprise. Falls back to classic v3.
const appCheckEnterpriseKey = viteEnv.VITE_APPCHECK_RECAPTCHA_ENTERPRISE_KEY;
let appCheckInstance: AppCheck | null = null;
if (isBrowser && (appCheckEnterpriseKey || appCheckSiteKey)) {
  // In dev, register the debug token printed to the console under
  // Firebase console → App Check → Apps → Manage debug tokens, so localhost
  // (which the reCAPTCHA site key doesn't cover) still gets valid tokens.
  if (viteEnv.DEV) {
    (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  try {
    appCheckInstance = initializeAppCheck(app, {
      provider: appCheckEnterpriseKey
        ? new ReCaptchaEnterpriseProvider(appCheckEnterpriseKey)
        : new ReCaptchaV3Provider(appCheckSiteKey),
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

// Anti-bot layer (docs/ANTI_BOT_PLAYBOOK.md), browser only:
//  • attach X-Firebase-AppCheck to same-origin /api calls (server verifies; monitor mode by default)
//  • gentle verify-your-email nudge for unverified email/password accounts
if (isBrowser) {
  const ac = appCheckInstance;
  if (ac) {
    void import('./appCheckFetch').then(m => m.installAppCheckFetch(async () => {
      try { return (await getAppCheckToken(ac, false)).token || null; } catch { return null; }
    })).catch(() => {});
  }
  void import('./emailVerifyNudge').then(m => m.startEmailVerifyNudge(auth)).catch(() => {});
  // Trust tiers (services/trust/trustCore.ts) feed the client rate limits + composer + DM start.
  void import('./trust/trustClient').then(m => m.installTrustSignals()).catch(() => {});
}
