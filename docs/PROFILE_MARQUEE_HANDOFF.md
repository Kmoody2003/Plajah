# Profile Marquee — handoff note

**Read this before touching the profile header.** Written for whoever picks this up next —
Claude, ChatGPT, Gemini, or a human. It records what the rework did, where the pieces live,
and the traps that cost time to find. Everything below was verified against a running dev
server on 2026-08-23, not assumed.

---

## 1. What the rework did

The profile header card ("the rectangle") used to be an identity block plus ~10 pill buttons.
It is now a **marquee**: identity, then the two things that are live right now, then the one
project the creator is putting forward, then the money/goods rail.

**Removed from the card** (each was dead, duplicated, or better placed elsewhere):

| Removed | Why / where it went |
| --- | --- |
| `Claim Pioneer Reward` | One-time action; belongs in creator tools, not on every page view |
| `Pay It Forward` | Still available platform-wide via `PayItForwardButton` on other surfaces |
| `X Feed` | The FEED tab already has X / Mastodon / Bluesky / Threads sources |
| `Watch Live` | **It did nothing** — it toggled `isLivePlayerExpanded`, which no JSX in `UserProfileView` reads. Verify before "restoring" it |
| `Artist Radio` button | Became the Artist Radio preview tile |
| `Watch Channel` button | Became the Watch Channel preview tile |
| `Manage Channel` button | Moved onto the channel tile (gear, owner-only) |
| `Admin Panel` pill | Moved into the avatar column, **under Stat Card** |
| `Activate a Brand` (strip) | Replaced by **Creator Hub** → `onNavigate('CREATOR_HUB')` |

**Kept**: display name, avatar, the avatar-column buttons (Avatar Studio / Share My Profile /
Stat Card), the @handle chip, stats, Pioneer badge, social links, bio, relationship line, RSS
viewer, and the whole visitor pill set (Follow / Mailing List / Gifts / Plajah+ / Message).

**Added**, in card order:

1. **Live rail** — `ON AIR` marker + Artist Radio tile + Watch Channel tile.
2. **Featured Project** — the creator's pick, falling back to the most recent release.
3. **Support rail** — Sanctuary activity · Merch & releases · funding-goal widget.

---

## 2. Where the code lives

```
components/GlassDockProfileHeader.tsx   the card itself (2026 "New shell", useShellNext → default ON)
components/profile/ProfileLiveTiles.tsx      ON AIR + the two preview tiles (hover previews live here)
components/profile/ProfileFeaturedProject.tsx  featured slot + the owner's picker modal
components/profile/ProfileSupportRail.tsx      Sanctuary / merch / goal cells
hooks/useProfileMarquee.ts               ALL marquee data + the featured-project resolver
components/UserProfileView.tsx           owns the data, passes it down; also the top action strip
types.ts                                 UserProfile.featuredProject + FeaturedProjectRef
services/sanctuaryService.ts             fetchRecentMembers() added (index-free)
```

**Data flow.** `UserProfileView` already loads albums (`content`), `profile.videos`, `articles`
and `merch` — the marquee is passed those and **never refetches them**. The only new network
reads are: FAST channel sources + schedule + meta (once per profile, channel tile only),
and `sanctuaries/{uid}` (+ the owner's own membership roster).

**The classic (pre-2026) header branch in `UserProfileView` is deliberately untouched.** If a
user has switched back to Classic (`localStorage.plajah_shell_next === '0'`) they still see the
old pill row. Port it only if you also port the whole marquee; do not half-migrate it.

---

## 3. Rules for this surface

1. **Never write `undefined` to Firestore.** `featuredProject` is cleared with `null`
   (`handleSetFeaturedProject` in `UserProfileView`). An undefined field value throws.
2. **Keep the tiles read-only.** `hooks/useProfileMarquee.ts` performs no writes. The only
   marquee write is the featured-project pick.
3. **Every cell hides itself when empty.** No Sanctuary → no Sanctuary cell. No products → no
   merch cell. No active campaign → no goal widget. No content at all → no Featured Project.
   An account with none of these gets a card the same height as before.
4. **Controls sit on the design system's control rows** (`styles/plajah-ds.css`). The dock's
   action pills are on `--pj-ctl-h-md` = **42px** with 18px padding, which is what
   `PlajahPlusButton` renders. Do not reintroduce `px-5 py-2` pills in that row — they come out
   ~32px and visibly break the line.
5. **Hover previews are pointer-only** — `useHoverPreviewAllowed()` gates on
   `(hover: hover) and (pointer: fine)`, and `isMobile` gates again. Never arm them on touch or TV.
6. **The radio preview must never fight the global player.** It refuses to start while
   `useGlobalPlayerState().isPlaying` is true.
7. **`hls.js` is imported dynamically, on hover only** (`import('hls.js')`). Do not hoist that
   import to the top of the file — it drags a large dependency into the profile bundle.

---

## 4. Traps found while building this (all still true)

- **`radio_schedules/{uid}` has NO rule in `firestore.rules`.** Every read is denied, for
  authenticated users too — so the radio Program Schedule feature is effectively inert and
  `RadioView` silently falls back to the shuffle. The marquee therefore does **not** read it;
  it positions the station from the artist's own catalogue with
  `radioEngine.getSatellitePosition`. If you add a read rule, restore the schedule path in
  `useRadioNowPlaying` (there is a comment marking the exact spot).
- **`NAVIGATE` CustomEvents must nest params.** `App.tsx` does
  `handleGlobalNavigate(e.detail.target, e.detail.params)` — so `detail: { target, artistId }`
  loses `artistId` entirely. Several existing call sites have this bug (the old Artist Radio
  button opened the *global* station, not the artist's). The marquee dispatches
  `detail: { target, artistId, params: { artistId } }`.
- **`handleGlobalNavigate` has no fallback `else`.** An unrecognized target is a silent no-op —
  it does **not** `setView(target)`. Check the chain before inventing a target string.
- **The project compiles without `strictNullChecks`**, so TypeScript cannot narrow
  `playoutPosition`'s `offAir: true | false` discriminant. `services/fastChannelTimeline.ts` and
  `components/tv/PlajahEpgGuide.tsx` both carry live errors from this. The marquee widens the
  result once and reads optional members instead.
- **`sanctuaryMemberships` is readable only by the member or the creator**, so visitors can
  never see a roster — the Sanctuary cell has an owner face (recent joins) and a public face
  (member count + join CTA). Also, `fetchCreatorMembers` pairs two `where`s with an `orderBy`
  and needs a composite index that is **not** in `firestore.indexes.json`; a missing index fails
  silently. Use the new `fetchRecentMembers` (one equality filter, client-side sort) for compact
  surfaces.
- **Baseline `tsc` noise:** a clean checkout reports ~77 pre-existing errors, and a bare
  `tsc --noEmit` can OOM. Run
  `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` and diff against the
  baseline rather than expecting zero. Vite does not typecheck at build time.

---

## 5. Verified behaviour (dev server, real account data)

- Radio tile shows the current track, artwork, elapsed/total and rotation depth, and re-derives
  every second (the tick pauses while the tab is hidden).
- Channel tile resolves the **first** channel — first active `ChannelSource`, else the first one
  at all, else the FAST schedule — and shows the current programme with elapsed time. Ad breaks
  render as "Commercial break" and are not previewable.
- Channel hover mounts a muted `<video>`, attaches the Mux/HLS stream and **seeks to the live
  offset** (measured: `currentTime = 680s` against an 11:20 elapsed programme). Mouse-out tears
  the video and the hls instance down and restores the poster.
- Featured Project falls back to the newest release when no pick is set.
- Tracks imported without artist metadata carry the literal `"Unknown Artist"`; the tile
  substitutes the account name.

## 6. Not done / open follow-ups

- The **owner** view (Admin Panel under Stat Card, the featured-project picker, the Sanctuary
  activity list) is code-verified and typechecked but was **not** exercised in a browser — the
  dev session was signed out (guest). Sign in as the profile owner and click through once.
- Merch reads the legacy `merch` array (`MerchItem`) the profile already loads, not the canonical
  `StoreProduct`. When the store consolidation finishes, switch the cell to
  `fetchUnifiedSellerProducts`.
- No EPG "next up" in the channel tile yet; `services/fastChannelEpg.nowAndNext` is right there
  if that is wanted.
- Consider a read rule for `radio_schedules` (see §4) — it would make both the station and the
  tile play the authored line-up.
