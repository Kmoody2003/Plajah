# Audius ↔ Plajah — Community Outreach & Integration Plan

*Last updated 2026-08-05. Companion to the Phase-1 integration (native album view, Pixels/DJ/Breakdown
on Audius, OML attribution) and the Phase-2 native-first "up next" radio.*

## 1. Positioning — why this is welcome, not tolerated

Audius is explicit that it is built for third-party apps: *"the majority of listening on Audius is now
via third-party apps, including third-party music players."* Plajah is exactly that — a licensed **Music
Player** under the Open Music License (OML). So the outreach frame is not "please let us use your music,"
it's **"your Audius catalog now has a second, richer home — and it's built for you."**

What Plajah uniquely adds on top of an Audius track that audius.co does not:
- The **native album experience** (same as a Plajah release): full player, artist page, comments.
- **The Breakdown** — key / tempo / chords / auto sheet-music for any track.
- **Pixels** — a real-time VJ / visualizer to perform or stream the track.
- **DJ mode** — load the track onto a deck, beatmatch, mix.
- **Native-first discovery** — Chora's "up next" radio surfaces Audius artists alongside Plajah artists.
- A **creator platform** around the music: social feed, live streaming (Reello), Sanctuary memberships,
  merch/commerce, and cross-promotion — monetization surfaces beyond streaming.

## 2. Compliance checklist (do these BEFORE amplifying outreach)

The OML grant is broad (worldwide, royalty-free right for Music Players to stream + provide access), but
it has obligations. Treat this as the gate.

- [x] **Attribution** — every Audius item shows "Streaming via Audius" + a deep link back to audius.co
      (shipped in Phase 1). Required for commercial use under the OML.
- [x] **Stream-only** — do NOT re-host Audius audio as a Plajah asset (Phase 1 removed the clone). We
      stream as a Music Player; we are not a distributor of their files.
- [ ] **Honor the API opt-out** — a user can disable third-party API access in their Audius settings.
      Content that 404s / disappears from the API must disappear from Plajah too; never cache around it.
- [ ] **Follow brand.audius.co** — use the Audius name/marks per their brand guidelines in any UI badge,
      landing page, or outreach material. Don't imply endorsement/partnership we don't have.
- [x] **Honor the API opt-out** — the library importer treats a 404/403 on a user's endpoints as
      "opted out", returns empty, and never caches around it (5-minute TTL, `invalidateAudiusLibrary`).
- [x] **Developer app + rate limits** — the app IS registered (`Plajah Intergration`, owner `J5Rvo4Z`).
      The key moved to `VITE_AUDIUS_API_KEY`, and the app's **bearer token was removed from the client
      entirely** — it used to ship in the bundle on every read, which handed anyone who opened devtools
      the ability to act for every user who ever authorized us. Reads need only `app_name`/`X-API-KEY`.
      **Action required: rotate that bearer token** — it is in git history.
- [x] **"Log in with Audius"** — real OAuth 2.0 + PKCE (`services/audiusAuth.ts`), `read` scope, consented
      per user. The importer only ever reads the library of the account that just authorized; never scrapes.

### Developer app setup (one-time, on the Audius dashboard)

audius.co → Settings → Developer Apps → *Plajah Intergration*:

1. **Register the redirect URIs**: `https://plajah.com/audius/callback` (prod) and
   `http://localhost:3000/audius/callback` (dev). The app currently has an EMPTY `redirect_uris`
   list; the consent screen renders fine without them, but Audius may reject the token exchange.
   If login fails with a redirect error, this is why — `audiusAuth` says so in the error message.
2. **Fix the app name typo** — it reads "Plajah Intergration" on the live consent screen users see.
3. `write` scope (publish Chora → Audius) additionally requires the API key, which is already wired.

## 3. Channels (where the Audius community actually is)

- **Audius Discord (~31K members)** — https://discord.com/invite/audius. The primary hub; strong
  cross-promo culture among artists. Best for authentic, non-spammy presence: build in public, share the
  Breakdown/Pixels/DJ demos on Audius tracks, answer "how do I get more reach" with Plajah as an option.
- **Artist support content** — Audius publishes "How to Trend on Audius" guidance; Plajah's pitch slots
  in as *"and here's another surface your Audius catalog reaches, for free."*
- **X / social** — clip the killer demo: an Audius song opening in Plajah's native player → one tap into
  Pixels or the Breakdown. That visual is the whole pitch.
- **Direct artist outreach** — start with artists whose tracks already trend in our VAULT/curation; they
  already have a Plajah presence (their `audius:<id>` page), so the ask is "claim it," not "join."

## 4. The message

One line: **"Your Audius music is already on Plajah — come claim your page and use the tools built for you."**

Supporting points, in order of strength:
1. Zero effort — your catalog already streams natively here (via the open API you already opted into).
2. Tools artists can't get on a plain player: Breakdown, Pixels, DJ mode, live.
3. Discovery that favors artists over algorithms — Chora's up-next puts real artists first.
4. Monetization beyond streams — memberships, merch, live, cross-promo — on a platform whose stated
   purpose is doing right by creators.
5. You keep Audius. This is additive; we link back to your Audius page on every track.

## 5. In-app funnel (features that support outreach)

- **[Ships with this plan] Claim-your-page CTA** on the Audius artist page: "This is an Audius artist —
  Plajah is built for you too" + Learn more / Claim. Turns passive discovery into an onboarding entry.
- **[SHIPPED — Phase 3] "Log in with Audius" → your library in Chora.** `services/audiusAuth.ts`
  (OAuth 2.0 Authorization Code + PKCE, no client secret, popup with a full-page-redirect fallback),
  `services/audiusLibrary.ts` (favorites / reposts / playlists / albums / following via the discovery
  `library` endpoints), and `components/AudiusLibraryPanel.tsx` ("Your Audius" in Chora's discover
  feed). Every item opens in the NATIVE surfaces — PlayerView album, artist page, Breakdown, Pixels,
  DJ. Artists you follow on Audius now count as follows in the up-next radio (`musicRecommender`),
  and their tracks lead the Audius tail. Still open: **write-back** (favorite / add-to-playlist on
  Audius from Chora) — needs `write` scope, and the REST publish path is unverified (Audius uploads
  normally go through the SDK, which signs and pushes to content nodes).
- **[Later] Verified claim** — match an Audius handle (via OAuth) to a Plajah creator account so a claimed
  page merges into a native profile (resolves the current split where Audius albums are native but Audius
  artists render on a separate page).

## 6. Metrics to watch

- Audius tracks played natively / week; % that reach Pixels, Breakdown, or DJ (the differentiators).
- Claim-CTA impressions → sign-ups from Audius artist pages.
- Retained Audius artists who publish something native (a Sanctuary, a live, merch) — the real conversion.

## 7. How Plajah rates against other Audius players

Audius encourages third-party apps, and most of the ecosystem is **lightweight**: read-API clients,
radio-station generators (e.g. DeFi Land built genre radios), games (a "music racing" app), utilities,
and alternative players. The **official Audius app** is the one full-featured client — it owns the
Audius-native surface (uploads, tipping, artist coins, fanclubs). Plajah is not trying to be "a better
Audius player" — it's a **creator platform** that treats Audius as one catalog among many. Judged as a
place to *listen to and work with* Audius music, here's the honest scorecard:

| Capability | Official Audius app | Typical 3rd-party Audius player | **Plajah** |
|---|---|---|---|
| Stream Audius catalog | ✅ | ✅ (read API) | ✅ |
| Native album UX for Audius tracks | ✅ | ⚠️ basic list/player | ✅ identical to first-party |
| Track analysis (key/tempo/chords/**sheet music**) | ❌ | ❌ | ✅ **the Breakdown** |
| Real-time VJ / visualizer | ❌ | ❌ | ✅ **Pixels** |
| DJ decks / beatmatch / mix | ❌ | rare | ✅ **DJ mode** |
| Cross-catalog discovery favoring artists | ⚠️ algorithmic | ❌ | ✅ **native-first up-next** |
| Social feed / live / memberships / merch around the music | partial | ❌ | ✅ Reello, Sanctuary, commerce |
| Film/TV + books alongside music | ❌ | ❌ | ✅ Taleo, Lorea |
| Attribution + link back to Audius (OML) | n/a | varies | ✅ |
| **Upload to Audius** | ✅ | some | ❌ (publish OAuth stubbed) |
| Artist coins / fanclubs / tipping | ✅ | ❌ | ❌ |
| Import your Audius library (favorites/follows) | ✅ | some | ⏳ Phase 3 |

**Verdict.** For *listening to and creating with* Audius music, Plajah is arguably best-in-class among
third-party surfaces — no other player pairs a native album experience with Breakdown + Pixels + DJ and a
full creator platform. Where the **official app leads** is Audius-native artist tooling: upload, tipping,
coins, fanclubs. Our honest gaps to close: library import (Phase 3), the half-migrated Audius artist page
(still a separate view vs a native profile), and — deliberately, per the OML — we don't re-host or mint on
Audius's behalf. The pitch to artists is therefore *additive*, never *replace Audius*: "keep Audius, and
get tools + a platform Audius can't give you."

## 8. Sequencing

1. Finish the compliance checklist (§2 open items) — especially the API opt-out honor + developer app.
2. Ship the claim-your-page CTA (this plan) + record the demo clips.
3. Build Phase 3 (Log in with Audius + library import) — the strongest "built for you" proof.
4. Then amplify in the Discord / socials with the demo, not before — the product has to back the pitch.
