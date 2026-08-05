# Plajah Security & Reliability Audit

**Date:** June 10, 2026 · **Scope:** server.ts, firestore.rules, storage.rules, client XSS surface, auth flow, bot/abuse posture, reliability.
**Companion work shipped in the same pass:** content safety system (`services/contentSafetyService.ts` + safety gates), Community Notes (`services/communityNotesService.ts`), community guidelines surfacing.

---

## What's already strong

- **Helmet + CORS allowlist** — production origins pinned to plajah.com; credentialed CORS rejects unknown origins.
- **Per-category rate limiting** — separate limiters for auth-sensitive routes (10/15min), API (100/min), proxies (60/min).
- **Firestore rules discipline** — no public writes anywhere; field allowlists (`hasOnly`), type/size validation on albums and chat; admin gate backed by an `admins` collection; sports archive collections are world-read / admin-write by design.
- **Chat security spec** (`security_spec.md`) with a "dirty dozen" abuse payload checklist.
- **Server-side Stripe** — money paths run server-side behind `authMiddleware`; payouts via Stripe Connect Express.
- **Proxy guardrails** — protocol check + private-host string check existed; per-route rate limit.
- **`.env.local` is git-ignored** (matches `*.local`) and not tracked.

---

## Fixed in this pass

| # | Severity | Issue | Fix |
|---|---|---|---|
| 1 | **HIGH — XSS** | `renderDiscussionMarkdown` escaped `<>&` but not quotes; `[text](https://x"onclick="…)` broke out of the `href` attribute and injected event handlers into discussion posts/comments. | Quotes (`"` `'`) now escaped before any markdown transform ([discussionMarkdown.ts](src/lib/discussionMarkdown.ts)). |
| 2 | **HIGH — SSRF** | `/api/proxy`, `/api/browse`, `/api/fetch-rss` validated only the *initial* URL string, then `redirect: 'follow'` — an attacker URL could 302 to `http://169.254.169.254/` (cloud metadata) or internal services. Also DNS-based bypass: a public hostname can resolve to a private IP. | New `safeOutboundFetch`: resolves DNS and rejects private IPv4/IPv6 ranges (incl. CGNAT, link-local, v4-mapped v6), follows redirects **manually** with re-validation per hop, max 4 hops. All three endpoints now use it (server.ts). |
| 3 | **HIGH — Reliability (silent data loss)** | Server-side `firestoreWrite`/`firestoreCreate` called the Firestore REST API **unauthenticated** → security rules evaluate `request.auth == null` → every server-side write (Stripe Connect IDs, events, tickets) was silently rejected. | Service-account OAuth: set `GOOGLE_SERVICE_ACCOUNT_JSON` (full key JSON) in env; the server now mints cached RS256 JWT → access tokens for all Firestore REST calls. Failures are now **logged loudly** instead of swallowed. |
| 4 | LOW — Observability | No liveness endpoint. | `GET /healthz` added. |

> **Action required:** create a service account with `roles/datastore.user` in the Firebase project, download its JSON key, and set `GOOGLE_SERVICE_ACCOUNT_JSON` in `.env.local` / production env. Until then server-side writes keep failing (now visibly in logs).

---

## Open findings & recommendations (priority order)

### 1. Bot defense: enable Firebase App Check (HIGH)
Nothing stops a scripted client from using the public Firebase config to hit Auth/Firestore/Storage directly — registration bots, scrape bots, spam writes within rule limits.
**Do:** enable **App Check with reCAPTCHA Enterprise** for web (plus Play Integrity / App Attest for Capacitor builds) and set Firestore, Storage, and Auth to *enforce*. This is console + a small client init change; biggest single anti-bot win available.

### 2. Storage rules: no ownership on shared media paths (HIGH)
`albums/{albumId}/**` and `videos/{videoId}/**` allow **any authenticated user** to write — user B can overwrite user A's album art or video files if IDs are guessable. The cross-service `isAdmin()` lookup is dead code with a named Firestore DB (noted in the file).
**Do:** prefix media paths with the owner uid (`albums/{uid}/{albumId}/…`) and require `request.auth.uid == uid`, or move uploads behind a server endpoint that checks Firestore ownership. Also tighten the fallback `allow read: if true` to specific public prefixes.

### 3. Content Security Policy disabled (MEDIUM)
`helmet({ contentSecurityPolicy: false })`. One XSS anywhere (see finding #1 — it happens) becomes full account compromise without CSP as a backstop.
**Do:** ship a **Report-Only** CSP first (`default-src 'self'` + the known CDN/media/Firebase/Stripe/Mux origins), watch violations for a week, then enforce.

### 4. Auth token verification latency + quota (MEDIUM, reliability)
`authMiddleware` calls `identitytoolkit accounts:lookup` on **every** authed request — adds ~100–300 ms per call and burns quota; an outage of that endpoint takes down all authed routes.
**Do:** verify ID tokens locally (JWT signature against Google's cached JWKS — `firebase-admin`'s `verifyIdToken`, or jose + the securetoken JWKS URL). Falls back to zero network calls per request.

### 5. `/api/browse` is an unauthenticated open proxy that strips frame protections (MEDIUM)
By design it removes `X-Frame-Options`/CSP so partner sites render in-app — but it accepts **any** URL, so it can be abused to serve arbitrary third-party HTML from your origin (phishing wrappers, SEO spam, copyright abuse) and as free bandwidth.
**Do:** allowlist partner domains (like the lights proxy already does), require auth, and rate-limit it.

### 6. Per-user write throttling (MEDIUM, anti-spam)
Rate limits are per-IP on the API server only; direct Firestore writes (posts, comments, chat) have no per-uid frequency cap, so a single account can flood feeds.
**Do:** add rules-level throttles (e.g. compare `request.time` to a `lastPostAt` field that must be updated in the same write) on `global_posts`, comments, and chat messages; pair with App Check (#1). The new content-safety reporting + Community Notes system (shipped this pass) covers the human-review side.

### 7. Multi-instance reliability (LOW today)
`express-rate-limit` counters, sports caches, and the OAuth token cache are in-memory — fine on a single instance; on horizontal scale, limits become per-replica.
**Do (when scaling):** move limiter stores to Redis/Memorystore; everything else degrades gracefully.

### 8. Misc (LOW)
- `Connection: keep-alive` header passed to `fetch` is ignored — harmless, remove for clarity.
- Consider `Cross-Origin-Opener-Policy` and `Permissions-Policy` headers.
- Add dependency audit to CI: `npm audit --omit=dev` gate + Dependabot/Renovate (`.github/` exists already).
- Backups: enable Firestore scheduled backups (PITR) in the console — currently the archive collections are the only copy of ingested sports history.

---

## User-data security posture (summary)

| Area | Status |
|---|---|
| Passwords | Handled entirely by Firebase Auth (never touch the server) — good |
| Payment data | Card data never touches Plajah (Stripe Checkout/Connect) — good |
| PII in Firestore | Scoped by uid-based rules; spot-checked collections look owner-gated; recommend a full rules test suite expansion beyond chat (the `security_spec.md` pattern is good — extend it to posts, profiles, orders) |
| Secrets | `.env.local` ignored; client bundle contains only the public Firebase config (normal). Stripe/Mux/agent secrets are server-side only |
| Data deletion | Not audited — verify a user-deletion flow exists (GDPR/CCPA): Auth delete + Firestore PII purge + Storage purge |

## Abuse & illegal content (addressed this pass — see companion files)

Platform policy now enforced and surfaced in-product: no non-consensual likeness, no doxxing, no pornography, no real-world gore; artistic mature content allowed **only when self-labeled**, gated behind blur + consent with per-user settings, plus profanity auto-blur, user mute-words, AI-assisted screening hooks, user reporting, and Community Notes for misleading content. See `services/contentSafetyService.ts`, `services/communityNotesService.ts`, `components/safety/`.
