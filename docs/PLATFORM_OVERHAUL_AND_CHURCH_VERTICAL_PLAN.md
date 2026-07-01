# Plajah — Account Backend Overhaul, Real Brand Accounts & the Church Vertical

*A codebase-grounded plan. Three parts, sequenced so each unlocks the next.*

---

## The through-line

All three asks share ONE root: **Plajah has no first-class "account/organization" model.** Everything is bolted onto a single 200+‑field `UserProfile`, and "kinds" of accounts are half-expressed as an enum *and* redundant booleans. Fixing that spine (Part 1) gives us a reusable **Organization primitive** (Part 2 = Brand), and the Church vertical (Part 3) is that primitive specialized. So we build the foundation once and specialize twice.

---

# PART 1 — User backend cleanup & reorganization

### What's wrong today (evidence)
- **`UserProfile` is a ~200-field monolith** (`types.ts` 1010–1214) mixing identity, creator, monetization, education, athlete, safety, UI, integrations — no domain separation.
- **Account type is stored twice:** `accountType` enum *and* 8 booleans (`isArtist`, `isBrandAdmin`, `isStudent`, …) that must be hand-synced (`UserDashboard.tsx` 1151–1174 sets both; `backendService.ts:2902` sets `isArtist` alone; `:7043` queries `where('isArtist','==',true)`). They drift.
- **Duplicated fields:** `backgroundSlideshow` exists top-level *and* in `uiSettings`; `liveStreamConfig` vs `radioSettings.scheduledEvents`; social links modeled 3 different ways (`xHandle…` vs `socialLinks.twitter` on Brand/Album); interests split across `publicInterests`/`favoriteX`/`interestAlgorithmProfile`/`creatorSignals`; monetization split across `revenue` summary vs `CreatorEarning`/`PayoutSummary`/`SplitConfig`.
- **Settings sprawl:** `UserDashboard` has 24+ flat tabs; `UserProfileView` has 13; no grouping by outcome, no capability gating (a FAN can open `ArtistRadioBuilder`).
- **No service layer:** profile, child, merch, club, film all intermingled in a 339 KB `backendService.ts`; `types.ts` is 3,980 lines flat.

### Target model (grounded in workflow outcomes)
Keep `UserProfile` as a **lean identity core**; move the rest into **outcome-grouped namespaces** (as sub-objects now, migratable to Firestore subdocuments later):

| Namespace | Owns | Replaces / consolidates |
|---|---|---|
| `identity` | uid, displayName, handles, photo, bio, cover | scattered identity fields |
| `personalization` | theme, backgrounds, sidebar, spatial, default tab | `uiSettings` + top-level theme/bg dupes (pick ONE `backgroundSlideshow`) |
| `privacy` | visibility, blocking, 2FA, presence | new home for safety toggles |
| `family` | guardian/child links, parentalControls, childState | unify with `accountSafeguards` state machine |
| `creator` | artist mode, radio, live config, distribution | merge `liveStreamConfig`+`radioSettings` into one `broadcast` |
| `monetization` | Stripe Connect, tips, split config | `revenue` becomes a **derived** summary of the `CreatorEarning` ledger (single source of truth) |
| `education` | teacher verification, enrollments | teaching/student fields |
| `athlete` | sport/position/jersey/school | athlete block |
| `integrations` | fediverse, Audius, podcast RSS | ONE canonical `socialLinks` shape reused everywhere |
| `capabilities` | derived feature access | replaces the 8 booleans |

### The account-type fix (single source of truth)
- **`accountType` (enum) stays authoritative.** The 8 booleans become **derived getters** (`isArtist = capabilities.has('CREATE_MUSIC')`), written once by a single `setAccountType()` that also backfills the legacy booleans for query compatibility, then a migration deprecates direct boolean writes.
- Introduce **capabilities** (a computed set from `accountType` + entitlements) and **gate every studio/settings surface** on capabilities, not on ad-hoc checks.
- Add a proper **onboarding router**: choose account type → see exactly the capabilities/surfaces for it.

### Settings information architecture (7 groups, replacing 24 flat tabs)
`Profile & Personalization` · `Privacy & Security` · `Content & Publishing` · `Audience & Community` · `Monetization & Payments` · `Family & Education` · `Integrations`. Each group shows only capability-relevant panels.

### Execution (additive-first, migration-safe)
1. **Extract services** (no behavior change): `accountService`, `profileService`, `monetizationService` out of `backendService.ts`; split `types.ts` into `types/` by domain (re-export barrel so imports don't break).
2. **Introduce `capabilities` + `setAccountType()`**; make booleans derived; keep writing legacy booleans for back-compat.
3. **Consolidate duplicates** behind accessors (pick canonical field, mirror-write during transition, then remove).
4. **Rebuild Settings IA** into the 7 groups over the existing panels (mostly re-parenting, not rewriting).
5. **Backfill migration** + drop deprecated fields.

*Risk control: every step is additive with mirror-writes; no destructive change until a backfill has run and reads are switched.*

---

# PART 2 — Brand accounts, made real (the Organization primitive)

### Today
Brand is a stub: `BrandAccount` (admin/managers/roster, `types.ts` 1757) + `BrandPublicPageData` (public page, 3512) + an `accountType:'BRAND'` user. There's **no brand profile, no followers, no posts, no dashboard-of-record.** Meanwhile `Club` (5 roles, channels, membership tiers, events, `types.ts` 1636) and `BusinessPage` (hours, location, discounts, orders, 3059) already hold the pieces a brand needs.

### Design — one `Organization` entity (merge of Business Page + Club)
A **parallel account** (like a Facebook Page): a user *operates as* an org. `Organization` composes what already exists:

- **Profile & identity** — from `BrandPublicPageData` (name, tagline, about, logo/cover, accent, roster, featured releases, canonical `socialLinks`).
- **Community** — from `Club` (channels, membership tiers monthly/yearly, events LIVE_TALK/LIVE_STREAM/WATCH_PARTY, questionnaire join, rules).
- **Staff/roles** — from `ClubRole` (OWNER/ADMIN/MODERATOR/WRITER/MEMBER → org staff).
- **Business** — from `BusinessPage` (location, hours, discounts, verification, ordering, CRM/rewards flags).
- **Money** — Stripe Connect (already on profile), org-level payouts, split config.
- **Its own** feed, followers, notifications, analytics, and **dashboard**.

`orgType: 'BRAND' | 'BUSINESS' | 'CHURCH' | 'NONPROFIT' | …` — so **Church is the same primitive specialized**, not a parallel rewrite.

### Execution
1. Define `Organization` + `OrgMembership` (reuse Club roles) + `OrgRole`; migrate `BrandAccount`/`BrandPublicPageData` into it (adapter for existing data).
2. Org profile page (extends `UserProfileView` layout) + Org dashboard (extends the Part 1 Settings IA, capability-gated to `orgType`).
3. "Operate as" switcher (like the account hot-switch, but for orgs a user manages).
4. Wire posts/feed/followers/notifications to the org id.

---

# PART 3 — The Church / Ministry vertical

**Church = `Organization` with `orgType:'CHURCH'`** + a ministry hierarchy + church-specific modules. Substrate readiness from the map:

| Need | Substrate | State |
|---|---|---|
| Org + sub-ministries + staff roles | `Club`/`Organization` (Part 2) | **REAL** (nesting via child orgs/channels) |
| Donations via Stripe + QR | `stripeService`, `Donation`, Connect | **REAL** rails; QR + funds + recurring = **build** |
| Streaming / live talks | Reello + `rtcCore` + `liveStreamService` + `ClubEvent` | **REAL** |
| Sacred library | `bibleService` (5 translations), Lorea, archives | **REAL** |
| Christian self-publishing | `BookCreatorWizard`, book model, lulu/printful POD | **REAL** |
| Aria: sermon → article → **book** | `audioTranscription` (real), article-assist (flagged), book-gen | transcription **REAL**; book compile = **build** |
| Email lists to constituents | — | **STUB — build** (SendGrid/Mailgun + segments + campaigns) |
| Christian education | EdTech dual-track, Learning Ledger, CASE import | **REAL** (define curriculum + a scripture standards framework) |
| Servant Keeper import/export | `interopService` patterns (CSV/CASE) | **build** a CSV bridge (giving history + rosters) |
| Multi-site master control | TV Studio switcher + `rtcCore` broadcast | switcher **REAL**; cross-site "program feed as source" registry = **build** |

### Church data model (on top of Organization)
- `Ministry` = child org/channel under the church (Youth, Worship, Women's, Kids, Prayer) with its own leaders (OrgMembership roles), events, and giving fund.
- `GivingFund` (General, Missions, Building, …) with goal tracking; `Donation` extended with `fundId`, `recurring`, `tributeFor`, `qrToken`.
- `Sermon` = a `ClubEvent`(LIVE_STREAM) → auto-archived `Video` tagged SERMON → optional Aria pipeline output (article/book).
- `Congregant` = `OrgMembership` + optional household grouping (for Servant Keeper parity).

### Phased build

**Phase 0 — Foundation (prereq):** Part 1 account-type SSOT + Part 2 `Organization` primitive.

**Phase 1 — Church account + demo skeleton:** `orgType:'CHURCH'`, church profile, **ministry hierarchy + staff roles**, congregant membership. Stand up the **demo church** shell. *(Almost entirely Org reuse.)*

**Phase 2 — Give + Gather:** GivingFunds + **QR donations** + recurring giving (Stripe); Sunday service **LIVE_STREAM** via Reello with auto **sermon archive**; small-group **LIVE_TALK** channels. Plug the **sacred library** (Bible/devotionals) into the church.

**Phase 3 — Word & Publishing:** **Aria sermon → editable article → book** pipeline (transcription is ready; build article-assist call + EPUB/PDF compile via existing book/POD stack, staff-editable). Christian **self-publishing** workflow for the org's authors.

**Phase 4 — Reach & Learn:** **Email-list service** (build) so ministries push to constituents by segment; **Christian education** on the EdTech stack (curriculum + a scripture standards framework in place of CCSS); **Servant Keeper import/export** (CSV bridge for giving history + rosters).

**Phase 5 — Multi-site:** cross-location **program-feed registry** so a master location's TV Studio switcher can **take another campus's on-platform program output as a source**; master control routes the combined program back out to all sites.

**Demo church** grows every phase; by Phase 5 it demonstrates the full breadth (multi-site service, giving, sermons→books, education, email, Servant Keeper round-trip).

### New services to build (net-new, not reuse)
`emailListService` (SendGrid/Mailgun) · `givingService` (funds, QR tokens, recurring) · Aria `sermonToBook` compile · `programFeedRegistry` (multi-site sources) · `servantKeeperInterop` (CSV in/out).

---

## Recommended first slice
**Phase 0 → Phase 1:** land the account-type single-source-of-truth + the `Organization` primitive, then specialize it into a **Church account type with a working demo church** (profile, ministries, staff roles, congregant membership). That single arc de-convolutes the backend, ships real brand/org accounts, and stands up the church shell — everything else plugs into it.

*Sequencing rule: build the Organization primitive ONCE; Brand and Church are configurations of it, never forks.*
