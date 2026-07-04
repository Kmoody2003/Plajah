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

### Phase 2 — the Sanctuary shell (next)
Distinct gold/obsidian Sanctuary page reusing club patterns: gated feed, member
chat (incl. à-la-carte paid chat), gallery, events, tiers rail, campaign banner,
members. `SanctuaryBadge` on every entry point. Redesigned discovery hub.

### Phase 3 — money (Stripe)
Real payment for tier subscriptions, à la carte unlocks and campaign pledges;
revenue split (~90% creator); receipts wired to `sanctuaryPurchases` /
`CreatorEarning` (`earningCategory: 'sanctuary'`).

### Phase 4 — gate everywhere
A "Put behind Sanctuary" control in every publisher (album, film, book, playlist,
podcast, live) that attaches a `SanctuaryGate`; players honor `hasSanctuaryAccess`
and show the gold lock + preview + unlock CTA. Org-owned sanctuaries.
