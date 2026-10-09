# Anti-Bot Playbook

**Principle: invisible to humans, walls for bots.** A real person should never see a CAPTCHA,
a "prove you're human" step, or a limit during normal use. Every layer below is either silent
(attestation, server-side counters), generous (limits a human never reaches), or gentle and
dismissible (the verify-your-email card). Bots, which act fast, at volume, from fresh accounts,
with throwaway inboxes and no social graph, hit every layer at once.

When in doubt, **fail open for people** (infra error → allow) and **fail closed for volume**
(over a limit → 429 with a friendly message).

Last updated 2026-10-08. Companion docs: [APPCHECK.md](APPCHECK.md) (reCAPTCHA keys runbook),
[rules-patches/anti-abuse.rules.snippet](rules-patches/anti-abuse.rules.snippet) (rules changes).

---

## 1. Layers

| # | Layer | Where | State |
|---|-------|-------|-------|
| 1 | **Edge / volumetric** | Firebase Hosting CDN → Cloud Run `plajah-api` | Hosting only. Cloud Armor **not** in path (see §4). |
| 2 | **App Check attestation** | client `services/appCheckFetch.ts` (header on same-origin `/api/*`), server `services/appCheckServer.ts` mounted on `/api` | **Monitor-only** (records `valid/invalid/missing`). |
| 3 | **Signup gate** | `POST /api/auth/signup-check` (`routes/antiAbuse.ts`, `services/signupGuard.ts`, `data/disposableEmailDomains.ts`) called from `registerWithEmail` | **On** (UX speed bump). Real gate = blocking function (§3), **not deployed**. |
| 4 | **Email verification** | `services/signupClient.ts` sends `sendEmailVerification` on signup; `services/emailVerifyNudge.ts` dismissible card | **On**. Never blocks; raises trust tier sooner. |
| 5 | **No account enumeration** | `routes/authMethods.ts` returns one shape for missing/password/error; reset says "If an account exists…" | **On**. |
| 6 | **Rate limits** | per-instance `express-rate-limit` (AI routes now per-uid, auth runs first); cross-instance `services/sharedRateLimit.ts` (Firestore counter) on signup-check, auth-methods, link-preview, social-import (+ per-uid follow-batch) | **On**. Shared limiter fails open. |
| 7 | **Trust tiers** | `services/trust/trustCore.ts` (pure, tested) → client rate limits, composer link/mention caps, cold-DM meter, group size (`trustClient.ts`); server spam gate on scheduled posts + outbound social publish (`serverSpamGate.ts`) | **On** (client = courtesy layer; server paths enforce). |
| 8 | **Firestore rules** | follower/like counters bound to edges, chat membership + creator-in-room + group cap, notification senderId | **In repo only — NOT deployed** (snippet for live). |
| 9 | **Headers** | `firebase.json`: `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN` on everything except `/embed*`, `/oembed`, `/social-video`; `Content-Security-Policy-Report-Only` baseline → `/api/security/csp-report` | **On at next hosting deploy** (CSP is report-only). |
| 10 | **Supply chain / CI** | `.github/dependabot.yml`, `.github/workflows/codeql.yml`, `.github/workflows/secret-scan.yml` (gitleaks) | **On when pushed**. |
| 11 | **Telemetry** | `services/securityEvents.ts` → `security_events` (1 rollup doc/min/instance + capped urgent docs) | **On**. Read by the Security Council agent. |

### Trust tiers at a glance (`services/trust/trustCore.ts`)

| Tier | How you get there | Links/post | Mentions | Cold DMs/day | Max group | Follows/h |
|------|-------------------|-----------:|---------:|-------------:|----------:|----------:|
| NEW | default | 1 | 3 | 5 | 10 | 20 |
| BASIC | ≥2 d + verified email/OAuth, or ≥7 d | 3 | 8 | 20 | 50 | 60 |
| TRUSTED | ≥30 d + verified + organic follower graph (mutuals) + clean record | 5 | 15 | 60 | 256 | 120 |
| VERIFIED_CREATOR | server-set custom claim `verifiedCreator: true` | 10 | 30 | 200 | 1000 | 200 |
| *restricted* | active sanction or ≥3 upheld reports | 1 | 3 | 2 | no groups | 10 |

"Cold DM" = a new 1:1 conversation with someone who doesn't follow you. Replying, DMing your
followers, and existing threads are never metered. Copy is non-accusatory and says the limit grows.

**Wiring still to do** (needs the enforcement/safety agents' data): feed `upheldReports`,
`priorSanctions`, `activeSanction` from `services/enforcement/*` into the client via a custom
claim (`sanctioned: true` is already read by `trustClient.ts`) and into `serverSpamCheck`.

---

## 2. What is live vs monitor-only vs needs console steps

**Live as soon as the server + hosting are deployed (code only):**
- `/api/auth/signup-check` + disposable-domain rejection in the registration UI
- verification email on email signup + the nudge card
- auth-methods enumeration fix + "If an account exists…" reset copy
- per-uid AI limiter; no raw `X-Forwarded-For`; shared limits on the abusable routes
- trust tiers on the client; server spam gate on scheduled posts and `/api/social/publish`
- `frame-ancestors` / `X-Frame-Options`, CSP report-only + `/api/security/csp-report`
- `security_events` telemetry

**Monitor-only (deliberately, until metrics say otherwise):**
- App Check on `/api` — `req.appCheck` recorded, nothing blocked
- CSP — report-only

**Needs console / deploy steps (not done):**
- Firestore rules (§5 below) — repo has them; live ruleset needs the snippet
- Identity Platform upgrade + blocking function (§3)
- reCAPTCHA Enterprise key, native Play Integrity provider, App Check enforcement (§4)
- TTL policies on `security_events.expireAt` and `rate_limits.expireAt`
- Cloud Run `max-instances`, Cloud Armor (§4)

---

## 3. Real signup enforcement: Identity Platform blocking function

`/api/auth/signup-check` is a speed bump — a bot can call Firebase Auth's REST API directly and
skip it. Real enforcement must run **inside** Auth, as a `beforeUserCreated` blocking function.
That requires upgrading the project to **Firebase Authentication with Identity Platform**
(console → Authentication → Settings → Upgrade; free tier covers 50k MAU, then billed per MAU).

Ready-to-deploy function (Functions v2). Create `functions/` (`firebase init functions`,
TypeScript), copy `services/signupGuard.ts` and `data/disposableEmailDomains.ts` into
`functions/src/` (adjust the import path), then:

```ts
// functions/src/index.ts
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { beforeUserCreated, HttpsError } from 'firebase-functions/v2/identity';
import { createHash } from 'node:crypto';
import { checkSignupEmail } from './signupGuard';

initializeApp();
const db = getFirestore('plajah-prod');

const SIGNUPS_PER_IP_PER_HOUR = 10;   // schools/NAT: raise if you see false positives in security_events

export const beforecreate = beforeUserCreated(
  { region: 'us-west1', maxInstances: 10, timeoutSeconds: 7 },
  async (event) => {
    const user = event.data;
    const isPassword = !user?.providerData?.length || user.providerData.some(p => p.providerId === 'password');

    // 1) Disposable / malformed inboxes (email+password signups only; OAuth emails are verified by the IdP).
    if (isPassword && user?.email) {
      const v = checkSignupEmail(user.email);
      if (!v.ok) throw new HttpsError('invalid-argument', v.message);
    }

    // 2) Signup velocity per IP (one Firestore doc per IP per hour; TTL on expireAt).
    const ip = event.ipAddress || 'unknown';
    const hour = Math.floor(Date.now() / 3_600_000);
    const id = `signup_${hour}_${createHash('sha256').update(ip).digest('hex').slice(0, 24)}`;
    const ref = db.collection('rate_limits').doc(id);
    const count = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const n = (snap.exists ? (snap.get('count') as number) : 0) + 1;
      tx.set(ref, { name: 'signup_ip', count: n, expireAt: Timestamp.fromMillis((hour + 2) * 3_600_000) }, { merge: true });
      return n;
    });
    if (count > SIGNUPS_PER_IP_PER_HOUR) {
      await db.collection('security_events').add({
        kind: 'urgent', type: 'signup_velocity_blocked', at: Date.now(), detail: `count=${count}`,
        expireAt: Timestamp.fromMillis(Date.now() + 30 * 86_400_000),
      }).catch(() => {});
      throw new HttpsError('resource-exhausted', 'Too many accounts were created from this network recently. Please try again later.');
    }
    return; // allow
  },
);
```

Deploy: `firebase deploy --only functions:beforecreate`, then console → Authentication →
Settings → **Blocking functions** → "Before account creation" → `beforecreate`. Keep it fast
(<7 s) — a slow blocking function blocks every signup. Test with a `mailinator.com` address and
with 11 signups from one IP in the emulator first.

Optional later: `beforeUserSignedIn` to add a `sanctioned` custom claim (feeds trust tiers) — do
**not** require email verification at sign-in (that would be a wall for humans).

---

## 4. Rollout steps (in order)

1. **Deploy this build** (server + hosting). Watch `security_events` rollups for a day:
   `counts.appcheck_valid / (valid + missing + invalid)` per route, `csp_report` details,
   `shared_rate_limited`, `signup_check_disposable`.
2. **Client IP — done 2026-10-09.** Cloud Run logs showed every `/api` request arriving from
   Google front-end addresses (Firebase Hosting), so `trust proxy = 1` made `req.ip` a Hosting
   edge shared by many users. `server.ts` now uses `services/trustProxy.ts` (`plajahTrustProxy`):
   trust Cloud Run's hop plus Google front-end hops only, so `req.ip` is the real client and a
   forged `X-Forwarded-For` (or a direct `*.run.app` call) can't spoof it (tests/trustProxy.test.ts).
   After deploy, confirm `security_events` `samples[].ipHash` now varies per user. All IP
   limiters (`clientIpKey`) depend on this; **never** read `X-Forwarded-For` directly.
3. **TTL policies:** Firestore → TTL → `security_events` / `expireAt`, `rate_limits` / `expireAt`.
4. **reCAPTCHA Enterprise** (better scores, no v3 quota): Google Cloud console → reCAPTCHA →
   create a *score-based website key* for `plajah.com` (+ `www`, the `web.app` domain) → Firebase
   console → App Check → web app → **reCAPTCHA Enterprise** → paste key. Set
   `VITE_APPCHECK_RECAPTCHA_ENTERPRISE_KEY` in the build env (the client prefers it over
   `VITE_APPCHECK_RECAPTCHA_SITE_KEY` automatically; `services/firebase.ts`).
5. **Native apps:** Android / Fire TV (Capacitor) currently send **no** App Check token (their
   `/api` calls are cross-origin, and no native provider is registered). Register **Play
   Integrity** for the Android app id in App Check, add `@capacitor-firebase/app-check` (or the
   native SDK) with the Play Integrity provider, and attach the header on native `/api` calls.
   Fire TV devices without Play services: use the **debug provider** only for internal builds, and
   keep those routes out of enforcement (they will show as `missing`). Tizen: no provider exists —
   keep TV endpoints in `APPCHECK_EXEMPT_PREFIXES`.
6. **Strict routes:** when `invalid` is rare for real users, set `APPCHECK_STRICT_ROUTES=true` on
   Cloud Run. Blocks only *invalid* tokens (forged/foreign-project) on the high-abuse list
   (`APPCHECK_STRICT_PREFIXES`) — missing tokens still pass, so native clients are unaffected.
7. **Enforce:** when `valid` ≥ ~98% of web traffic on `/api` and native apps attest, set
   `APPCHECK_ENFORCE=true`. Rollback = unset the env var (no redeploy of code). Separately, flip
   Firestore/Storage/Auth enforcement in the App Check console per [APPCHECK.md](APPCHECK.md).
8. **Firestore rules:** apply [the snippet](rules-patches/anti-abuse.rules.snippet) to the live
   ruleset, emulator-test the checklist at its top, deploy. The batched `likeVideo/unlikeVideo`
   client must be live first.
9. **Blocking function:** §3.
10. **Cloud Run sizing:** set `--max-instances` (e.g. 20–40) on `plajah-api` so a flood can't
    scale cost unboundedly; `--concurrency 80`; keep `min-instances 1` for latency. A capped
    service returns 429/503 under a flood instead of a surprise bill.
11. **Cloud Armor (recommended next):** Firebase Hosting rewrites reach Cloud Run directly, so
    Cloud Armor can't sit in that path. Options: (a) serve the API from `api.plajah.com` through
    an external HTTPS Load Balancer + serverless NEG with a Cloud Armor policy (preconfigured WAF
    rules `sqli/xss/lfi/rce`, per-IP `rate_based_ban` on `/api/auth/*`, `/api/auth-methods/*`,
    `/api/ai/*`, reCAPTCHA Enterprise action-tokens/bot management), then set Cloud Run ingress to
    *internal-and-cloud-load-balancing*; or (b) keep Hosting and rely on layers 2–7. Option (a)
    is the only real answer to volumetric L7 floods.
12. **CSP:** after a few weeks of `csp_report` data, tighten the report-only policy (drop
    `'unsafe-eval'`, enumerate script hosts), then switch the header name to
    `Content-Security-Policy`.

---

## 5. Environment variables

| Var | Where | Default | Effect |
|-----|-------|---------|--------|
| `FIREBASE_PROJECT_NUMBER` | Cloud Run | `538331111809` | App Check `iss`/`aud` binding |
| `APPCHECK_ENFORCE` | Cloud Run | unset | `true` → reject missing/invalid App Check on non-exempt `/api` |
| `APPCHECK_STRICT_ROUTES` | Cloud Run | unset | `true` → reject *invalid* tokens on the high-abuse list |
| `DISPOSABLE_EMAIL_EXTRA` | Cloud Run | unset | comma-separated extra disposable domains |
| `SECURITY_EVENTS_IP_SALT` | Cloud Run | built-in | salt for `ipHash` in `security_events` |
| `VITE_APPCHECK_RECAPTCHA_ENTERPRISE_KEY` | build | unset | preferred App Check provider |
| `VITE_APPCHECK_RECAPTCHA_SITE_KEY` | build | (existing) | classic v3 fallback |

## 6. Tests

`npm run test:antibot` — trust tiers, tier-aware rate limits, server spam gate, signup guard,
disposable list hygiene, App Check claim binding, shared limiter fail-open + IPv6 keys.
Typecheck: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.antibot.json`.
