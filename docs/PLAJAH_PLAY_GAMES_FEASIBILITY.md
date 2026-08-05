# Plajah Play — Indie Game Distribution: Feasibility & Model

> **Status: planned front — pursue later in 2026.** A lightweight, itch-flavored store for
> small & bedroom devs — buy, download, and play, with Plajah's flat **10% cut**. The whole
> model lives or dies on **one line item: egress.** This doc is the economics + architecture
> case. *Cost figures are current list-price estimates — verify against live pricing before commitment.*

## Verdict — viable, on the right storage

The 10% cut **comfortably covers hosting — but only if game downloads run on zero-egress
storage (Cloudflare R2).** On Google Cloud / Firebase Storage, bandwidth alone eats most of
the margin and makes **free demos a straight loss.** Switch the distribution layer to R2 and
the same catalog costs pennies to serve — including free and demo games, which is exactly
what bedroom devs need to build an audience.

| Metric | Value |
|---|---|
| Egress on **R2** | **$0** / GB downloaded |
| Egress on **GCS** | ~$0.12 / GB — the trap |
| Storage | ~$0.015 / GB·mo (R2 list) |
| Plajah cut | **10%** flat, all tiers |

## 1. Where the games section stands today

"Games" is a **web-embed directory**, not a store. A `games` Firestore doc holds a title,
thumbnail, tags, play-count, and a single `url`, played inside an `<iframe>` (`GamePlayerView`).
**No file hosting, no purchase, no payout, no 10% cut applied.** But **Stripe Connect and the
10%-cut plumbing already exist** elsewhere (commerce, Sanctuary), so monetization is a *wiring
job, not a from-scratch build.* Browser-playable games are the cheapest, most frictionless
thing to sell — **and they work on mobile, which Steam can't.**

## 2. The one number that decides everything: egress

For a game store, **storage is trivially cheap and bandwidth is the whole cost.** A build sits
in storage at ~1.5¢/GB·mo (a rounding error). But every **download** ships that build over the
wire, and cloud providers bill egress at **$0.08–0.12/GB**. A 2 GB game downloaded 1,000× is
**2 TB** of egress — **~$240 on GCS, $0 on Cloudflare R2.** R2 (and Backblaze B2 via the
Cloudflare Bandwidth Alliance) charge **nothing for egress.** That single choice is the
difference between a sustainable 10% and a store that loses money on its most popular titles.

## 3. Storage & distribution — cost comparison

| Provider | Storage /GB·mo | Egress /GB | Fit for game downloads |
|---|---|---|---|
| **Cloudflare R2** | $0.015 | **$0.00** | **Best** — zero egress, S3-compatible |
| Backblaze B2 + Cloudflare | $0.006 | $0.00* | Cheapest storage; free egress via CDN alliance |
| Bunny CDN + Storage | $0.01–0.02 | ~$0.005–0.01 | Cheap, great edge; small per-GB egress |
| AWS S3 + CloudFront | $0.023 | ~$0.085 | Expensive egress; over-built |
| Firebase / GCS (current) | $0.020 | ~$0.12 | Fine for covers/metadata — **wrong for builds** |

*B2 egress is free when served through Cloudflare (Bandwidth Alliance). **Keep Firebase for
metadata, covers, screenshots and web-game assets; move only the heavy downloadable builds to R2.**

## 4. Unit economics — a $10 game, 2 GB build, 1,000 sales

Same game, same sales. Only variable: where the build is served from. "Plajah net" = what's
left of the 10% after Stripe and hosting — the money that runs the store.

| Line | On Cloudflare R2 | On Firebase / GCS |
|---|---|---|
| Gross sales · 1,000 × $10 | $10,000 | $10,000 |
| Dev payout (90%) | –$9,000 | –$9,000 |
| Plajah cut (10%) | $1,000 | $1,000 |
| Stripe · 2.9% + 30¢ ×1,000 | –$590 | –$590 |
| Egress · 2 TB downloaded | **–$0** | **–$240** |
| Storage · 2 GB·mo | –$0.03 | –$0.04 |
| **Plajah net** | **≈ $410** | **≈ $170** |

On GCS, egress alone erases **58% of what's left after Stripe** — and that's *paid* games.

**Free games & demos — the make-or-break case.** A demo has zero revenue but full download
cost. 5,000 demo downloads of a 1.5 GB build = **7.5 TB**. On R2: **$0**. On GCS: **~$900 of
pure loss.** Bedroom devs live on free demos and game-jam builds to find an audience — so
hosting free content cheaply isn't a nice-to-have, it's **the entire on-ramp.** R2 makes a
free tier genuinely free to Plajah.

## 5. Recommended architecture

**Two game classes**
- **Web-playable** — HTML5 / WASM / Unity & Godot WebGL. Play in-browser, mobile included. Cheapest, most frictionless — **start here.**
- **Downloadable PC** — Windows / Mac / Linux zip or installer. Purchase → time-limited signed URL → download.

**Storage & delivery** — Cloudflare R2 for builds (zero egress, S3-compatible SDK); Firebase
stays for metadata/covers/screenshots/trailers; **resumable multipart upload** for large builds
(reuse the film-upload pipeline pattern).

**Money** — Stripe Connect (already integrated); dev sets price; Plajah takes 10%.
Free · pay-what-you-want · paid (itch-style). Refund window (e.g. 2 hrs / <X% downloaded) for trust.

**Entitlement & safety** — ownership record on purchase; downloads require a valid entitlement
→ signed URL (curbs casual link-sharing); versioning + update notifications (ride the
notification system already shipped); malware scan on upload (ClamAV / VirusTotal) + dev verification.

## 6. Phased build — bedroom devs first

1. **MVP · monetize what already works (web-playable store).** Turn the iframe directory into
   real store pages (screenshots, trailer, tags, dev profile, price). Free + paid via Stripe
   Connect, 10% cut; host HTML5 build zips on R2. Ships fast, earns immediately.
2. **The real "PC game host" (downloadable builds).** Resumable upload of Win/Mac/Linux builds
   to R2 (per-platform + versioned); purchase → entitlement → signed, expiring download URL;
   malware-scan gate; buyer library / re-download; "update available" notifications.
3. **Make it sticky (polish & community).** Reviews, wishlists, bundles, sales/discounts, dev
   analytics; pay-what-you-want + "support the dev" tips (Sanctuary reuse); optional lightweight
   launcher/auto-updater once volume justifies it.

## 7. Risks & how to blunt them

| Risk | Mitigation |
|---|---|
| Piracy / link sharing | Short-lived signed URLs tied to an entitlement; watermark builds; "good enough" beats DRM friction for indies |
| Malware & trust | Scan on upload; verify devs; human review for first release; clear report/removal flow |
| Whale storage creep | Per-dev storage caps by tier; prune old versions; $0.015/GB keeps it small anyway |
| Refund abuse | Refund window keyed to playtime/% downloaded; near-zero egress on R2 keeps exposure tiny |
| Stripe flat fee on cheap games | Encourage bundles / a small minimum; PWYW nudges above the 30¢ floor |
| Platform distribution (.exe) | Downloads are web-only; keep web-playable games as the in-app experience |

## Next step (when we pick it up)

A concrete **Phase-1 scope**: schema, store page, Stripe/10% wiring, R2 bucket — to ship the
web-playable paid store. Everything above the download layer already has precedent on the
platform (Stripe Connect, resumable uploads, notifications, entitlements via commerce).

*Prepared as a feasibility investigation for the Plajah Games ("Plajah Play") expansion.
Referenced from `PLAJAH_GTM_PLAN.md` §27.*
