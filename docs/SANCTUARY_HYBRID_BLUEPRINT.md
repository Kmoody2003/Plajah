# Sanctuary — the Patreon / Kickstarter / GoFundMe hybrid

*Started 2026-07-03. Living document.*

## Thesis

A **Sanctuary** is every creator's own membership + crowdfunding home on Plajah — a
place to gate the work they choose, on the terms they choose. It is available to
**every account** (a user *or* an organization) as a standard feature, one per
account. It is deliberately a **distinct, more premium sibling of a Club**: a Club
is a community you join; a Sanctuary is a creator's vault you support.

Where a Club is violet/indigo and communal, a Sanctuary is **obsidian + antique
gold + garnet** — a vault/temple. The visual language alone should tell a user
instantly which one they're in.

## What a creator can do

- **Gate any content type**, not just video/audio: secret playlists, remixes,
  books, articles, entire films, deleted scenes, BTS, games, white papers,
  research papers, private conversations, collaborations, and live streams.
- Run the Sanctuary as **free, paid, or mixed**.
- Sell access **à la carte** — a single film, a single research paper, or a single
  private chat — *without* requiring a membership.
- Offer **membership tiers** (recurring, monthly/annual) with tier-gated content.
- Run a **crowdfunding campaign** (Kickstarter all-or-nothing, or GoFundMe
  keep-what-you-raise) with a goal, deadline and backer count.
- Make it **public** (discoverable) or **private** (invite/member only).

## Architecture

One Sanctuary per account; the `sanctuaries` doc id **is the owner id** (a uid, or
an org id for org-owned). The monetization primitives stay keyed by that owner.

| Concern | Collection | Notes |
|---|---|---|
| Identity | `sanctuaries/{ownerId}` | name, handle, visibility, accessModel, campaign, counts |
| Tiers | `sanctuaryTiers` | keyed by `creatorId` (== ownerId) — *existing* |
| Memberships | `sanctuaryMemberships` | a fan's active tier — *existing* |
| Exclusive content | `sanctuaryContent` | now `accessType` FREE/TIER/ONE_TIME + `oneTimePrice` + expanded kinds |
| Gated feed | `sanctuaryPosts` | FREE teaser vs TIER vs ONE_TIME per post |
| À la carte receipts | `sanctuaryPurchases` | one-time unlock of a content/post/chat |

**Portable gate.** Any platform asset (a track, a film, a book, a chat) can carry a
`SanctuaryGate { sanctuaryId, accessType, requiredTierIds?, oneTimePrice?, previewUrl? }`.
`hasSanctuaryAccess(gate, itemId, ctx)` (in `sanctuaryService`) is the single,
pure access check — owners always pass; FREE passes; ONE_TIME needs a recorded
purchase; TIER needs an active membership in a required tier.

**Reuse, don't rebuild.** `Club.type` already includes `'SANCTUARY'`, and Clubs
already have feed/chat/gallery/events/members/roles/channels. The Sanctuary shell
(Phase 2) reuses those *patterns* under the gold skin, adding the gating layer on
top.

**Business/Org feeds.** Businesses and organizations post via `createPost` with
`authorOrgId` (the existing "operate as org" path). An org/business feed is
`posts where authorOrgId == orgId` — surfaced by `listenToOrgPosts(orgId)`.

## Status

### Phase 1 — foundation + composer destinations ✅ (2026-07-03)
- Types: expanded `SanctuaryContentKind`; `SanctuaryAccessType`; `Sanctuary`,
  `SanctuaryPost`, `SanctuaryPurchase`, `SanctuaryGate`, `SanctuaryCampaign`.
- `sanctuaryService`: identity CRUD (`createOrUpdateSanctuary`, `fetchSanctuary`,
  `fetchUserSanctuaries`, `fetchPublicSanctuaries`, `listenToSanctuary`); gated
  feed (`createSanctuaryPost`, `listenToSanctuaryPosts`, like/delete); à la carte
  (`unlockContent`, `fetchMyPurchases`); campaign (`contributeToCampaign`); access
  helpers (`hasAccess`, `hasSanctuaryAccess`).
- `backendService`: `listenToOrgPosts`, `createOrgPost` (business/org feeds).
- **ShareToPlajahComposer** now targets **Sanctuary + Business/Org** alongside
  disciplines and clubs (the original ask), with the gold Sanctuary treatment in
  the dropdown and chips.
- Visual identity primitive: `components/sanctuary/SanctuaryIdentity.tsx`
  (`SANCTUARY_THEME`, `SanctuaryBadge`, `SanctuaryLockChip`, `SanctuaryPriceTag`).
- Firestore rules for all sanctuary collections (previously unruled → denied in prod).

### Phase 2 — the Sanctuary shell ✅ (2026-07-04)
Reskinned `SanctuaryView` into the distinct obsidian + gold vault (no more club
violet), with `SanctuaryBadge` in the hero and on hub cards. New tabs:
- **Feed** — `SanctuaryFeed`: gated `sanctuaryPosts` with an owner composer that
  sets per-post access (Everyone / Members / Paid + price), like, delete, and an
  inline **à la carte unlock** button that records a purchase.
- **Exclusives** — content grid now gated by `hasAccess` (tier *or* purchase).
- **Manage / Join** — owner sees `CreatorSetupPanel`; fans see tiers.
- **Lounge** — `SanctuaryChat`: real member chat (new `sanctuaryChat` collection),
  locked for non-members with a clear reason.
- **Campaign banner** — `SanctuaryCampaignBanner`: owner launches a Kickstarter/
  GoFundMe campaign (goal, story, all-or-nothing); members back it ($5/$25/$100);
  live progress via `listenToSanctuary` + `contributeToCampaign`.
- Sanctuary identity doc auto-provisions for the owner on first open.
- Discovery hub (`SanctuaryHubView`) reskinned gold with `SanctuaryBadge`.

### Phase 2.1 — depth ✅ (2026-07-04)
- **Vault** tab (`SanctuaryGallery`): gated media wall (photo/video/audio) with
  owner upload via `uploadFile`, per-item gating + à la carte unlock.
- **Events** tab (`SanctuaryEvents`): scheduled sessions (livestream/AMA/watch
  party/listening/call), owner create form, member RSVP, gating.
- **Tier-scoped chat channels**: `SanctuaryChat` now takes `channels` — a general
  Lounge plus one gated channel per tier that has `hasPrivateChat`; locked
  channels show a lock and disable the composer.

### Phase 3 — money (Stripe) ✅ (2026-07-04)
Real Checkout, mirroring the existing club-membership / seedraiser patterns:
- Server: `POST /api/stripe/sanctuary-tier` (recurring), `/sanctuary-unlock`
  (one-time à la carte), `/sanctuary-pledge` (one-time campaign backing).
- Webhook `checkout.session.completed` records `sanctuaryMemberships` (deterministic
  id), `sanctuaryPurchases`, and `sanctuaryPledges`; `sanctuary_unlock` and
  `sanctuary_pledge` added to `CREATOR_PAYMENT_TYPES → 'sanctuary'` so the existing
  earnings flow books a `creatorEarnings` row (10% platform / ~90% creator, with
  `creatorSplits` honored automatically).
- Client: `stripeService.startSanctuaryTierCheckout` / `purchaseSanctuaryUnlock` /
  `backSanctuaryCampaign` (fetch token internally, redirect to Checkout).
- Wiring: paid tier join, à la carte unlock (feed + vault), and campaign backing
  now go through Stripe; free tiers stay instant. Campaign totals are summed from
  `sanctuaryPledges` (webhook can't safely mutate the nested campaign map).

**Deploy config still required (not code):** set `STRIPE_WEBHOOK_SECRET` and add
the Checkout webhook in the Stripe dashboard; the live secret key is present but
the webhook secret is a placeholder, so payments create sessions but the recording
webhook won't fire until configured. Untested end-to-end here (needs live Stripe).

### Phase 3 — money (Stripe)
Real payment for tier subscriptions, à la carte unlocks and campaign pledges;
revenue split (~90% creator); receipts wired to `sanctuaryPurchases` /
`CreatorEarning` (`earningCategory: 'sanctuary'`).

### Phase 4 — gate everywhere ✅ (2026-07-04)
The portable gate mechanism, wired end-to-end through the platform's most central
content surface, plus reusable primitives publishers drop in:
- **Primitives** (`components/sanctuary/SanctuaryGate.tsx`): `useGateAccess` hook,
  `SanctuaryGateLock` (gold lock + preview + unlock/enter CTA), `SanctuaryGatePicker`
  (attach FREE/Members/Paid + price/tier). `resolveGateAccess` in the service.
- **Posts**: `Post.sanctuaryGate`; `PostCard` shows the lock over media when gated
  and the viewer lacks access (strictly additive — existing posts have no gate);
  `UniversalPostComposer` offers the gate control (opt-in via `userSanctuaryId`,
  zero impact on its other 11 callers); the main FeedView composer wires it through.
- **Org-owned sanctuaries**: `saveSanctuaryTier` now honors an explicit `creatorId`.
- **Richer feed**: `SanctuaryFeed` composer attaches image/video (via `uploadFile`)
  and posts render attachments.

Follow-on rollout (uses these exact primitives): drop `SanctuaryGatePicker` into the
album / film / book / playlist / podcast / live publishers and `SanctuaryGateLock`
into their players. Wire the remaining composers' `onPost` to forward `sanctuaryGate`.
