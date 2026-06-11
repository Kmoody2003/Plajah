# App Check Runbook (Firebase + reCAPTCHA v3)

App Check attests that traffic to Firestore, Storage, and Auth comes from the
real Plajah web app — not scrapers, stolen API keys, or direct API calls.

- **Project:** `gen-lang-client-0665118474`
- **Provider:** reCAPTCHA v3 (classic — has a public *site* key + a private *secret* key)
- **Client init:** [`services/firebase.ts`](../services/firebase.ts) — `initializeAppCheck` with `ReCaptchaV3Provider`, browser-guarded, gated on `VITE_APPCHECK_RECAPTCHA_SITE_KEY`.
- **Vite:** `dedupe` + `optimizeDeps.include` for firebase modules so App Check
  registers into the same `@firebase/app` instance as `initializeApp` (see
  [`vite.config.ts`](../vite.config.ts)).

## Keys — where each one lives

| Key | Public? | Where it goes | Never put it… |
|-----|---------|---------------|---------------|
| reCAPTCHA v3 **site** key (`6L…`) | Yes (ships in client JS) | `.env.local` → `VITE_APPCHECK_RECAPTCHA_SITE_KEY`, **and** the Firebase console provider form | — |
| reCAPTCHA v3 **secret** key | No | Firebase console App Check provider form **only** | in the repo, in `.env*`, in chat |

`.env.local` is gitignored — the site key is not committed. `.env.example`
documents the variable name only.

## Rollout sequence — order matters

Enforcing before the attested client is live locks out **every** user. Do these
in order:

1. **Register the provider.** Firebase console → App Check → Apps → select the
   web app → **reCAPTCHA v3** → paste the **site key + secret key**.
2. **Register the dev debug token.** The dev build prints
   `App Check debug token: <uuid>` to the browser console. Add it under
   App Check → (web app) → ⋮ → **Manage debug tokens** so localhost gets valid
   tokens (the reCAPTCHA site key doesn't cover localhost). The token is tied to
   that browser's storage and can regenerate — register whatever the console
   currently prints.
3. **Deploy** the build that contains App Check.
4. **Monitor.** App Check → APIs stays in **monitoring mode** (default — nothing
   blocked). Watch the *verified* vs *unverified* request ratio over ~a day of
   real traffic until verified traffic dominates.
5. **Enforce.** Only now flip **Enforce** on Firestore, Storage, and Auth.
   Requests without a valid App Check token are rejected from this point.

## What enforcement does and doesn't break

- **Browser client:** must send a valid App Check token. It does, once the build
  above is live. ✓
- **Server-side admin code** (the classics seeder, any backend Firestore/Storage
  writes via the service account in `GOOGLE_SERVICE_ACCOUNT_JSON`): uses admin
  credentials, **bypasses App Check** — enforcement does not affect it. ✓
- **Other origins / native apps:** if Plajah is ever shipped as a separate
  native or TV app, each needs its own App Check provider (Play Integrity,
  DeviceCheck, etc.) registered before enforcement, or it will be blocked.

## Rollback

If enforcement causes unexpected client rejections, set the affected API
(Firestore/Storage/Auth) back to **Unenforced** in the console. It takes effect
within minutes; no code change or redeploy needed.

## Dev notes

- Local debug token last seen: prints fresh on each dev boot — read it from the
  browser console (`App Check debug token: …`) and register it.
- App Check is browser-only: `services/firebase.ts` is also imported by the Node
  server, so the init is guarded with `typeof window`/`typeof self` and a safe
  `import.meta.env` read. Don't remove those guards or the dev server crashes.
