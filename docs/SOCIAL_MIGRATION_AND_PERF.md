# Social network: performance pass + "move your conversation here"

2026-10-08. Uncommitted. Nothing deployed: indexes, rules and server routes all need a deploy (see the end of this file).

## A. Performance and correctness

| # | What was wrong | Change | Where |
|---|---|---|---|
| 1 | `listenToMessages` listened to a room's **entire** history, including public live chats (`PersistentChatDrawer`, `LiveTalkView`, `MobileLiveHub`) | Live window = newest 60 (`orderBy timestamp` + `limitToLast`). `fetchEarlierMessages(roomId, cursor)` pages older ones in. ChatWindow has a **Load earlier messages** button that keeps your scroll position. Messages that slide out of the window as new ones arrive stay on screen (`slideMessageWindow`) | `services/socialPerf.ts`, `services/backendService.ts` `listenToMessages`, `components/ChatWindow.tsx` |
| 2 | `listenToChatRooms` had no limit and was opened 3× at once (ChatSystem, ChatFlyout, GlobalPlayer) | `limit(100)`, and ONE shared, ref-counted upstream listener per uid (`sharedSubscription`). Each subscriber gets its own array copy (GlobalPlayer sorted in place) | `services/sharedSubscription.ts`, `backendService.listenToChatRooms` |
| 3 | `fetchNotifications`: `where userId` + `limit(50)` with **no orderBy** returned an arbitrary 50 | `orderBy('timestamp','desc')` (field is `timestamp`) + index; client sort too. NotificationCenter groups rows: "Ana and 9 others liked your post" (`groupNotifications`, LIKE/COMMENT on the same target, and FOLLOW, within 48h). Clicking a group marks all its items read | `backendService.fetchNotifications`, `services/socialPerfCore.ts`, `components/NotificationCenter.tsx` |
| 3b | `NotificationContext` returned its unsubscribe from inside `onAuthStateChanged` (which ignores it), so it leaked a listener per sign-in/account switch and kept delivering the old account's notifications | Tracks and tears down the listener | `contexts/NotificationContext.tsx` |
| 4 | `listenToClubPosts` / `listenToClubChat` had no orderBy, so busy clubs showed an arbitrary 100/200 | `orderBy('timestamp','desc')` + limit; chat is shown oldest→newest; pinned posts still float first client-side | `backendService` |
| 5 | Typing rewrote the **room doc** (`typingUsers`) on every typing start/stop, which re-fired every participant's room-list listener | `chat_rooms/{id}/meta/typing` = `{ users: { uid: lastTypedAtMs } }`, throttled to at most one write per 3s, with readers expiring entries after 6s. Cleared on send and on leaving the room (the old cleanup read a stale `isTyping` and never fired) | `socialPerf.setTypingStatus` / `listenToTyping`, `backendService.updateTypingStatus` (delegates), ChatWindow |
| 6 | Missing or duplicated indexes | Added: `chat_rooms` participants(array-contains)+updatedAt desc; `posts` genre+timestamp desc (serves `genre in`); `notifications` userId+timestamp desc; `clubPosts` clubId+timestamp desc; `clubChat` clubId+timestamp desc. Removed the duplicate `posts` hashtags+timestamp | `firestore.indexes.json` |
| 7 | PollCard opened one listener on the whole post doc per card | Listener is now opt-in (`realtime` prop). The card takes the parent's `poll.votes` prop and does one `getDoc` after voting. **Storage unchanged:** votes are still uid arrays inside the post doc, so the doc grows with each voter and anyone who can read the post can see who voted. A counter plus a per-voter subcollection would fix this later | `components/PollCard.tsx` |

**Fallbacks before deploy.** Each new ordered query goes through `snapshotWithIndexFallback`. If Firestore answers `failed-precondition` because the index isn't built yet, it switches to the old unordered query, so nothing goes blank before the deploy. For typing, a `permission-denied` on the subdoc (rule not deployed) switches to the legacy room-doc field for the rest of the session, still throttled.

**Known trade-off.** The room *list* typing dots (`ChatSystem`, `ChatSpaces`) read `room.typingUsers`. They only light up on the legacy fallback now. Showing them from the subdoc would need one listener per listed room, which is the cost we are removing. The open conversation (ChatWindow) shows typing from both sources.

**Mixed timestamp types in `notifications`.** Client writes use `serverTimestamp()`. Several server.ts writers use `Date.now()` (numbers). Firestore sorts numbers before timestamps, so with `orderBy desc`, number-typed notifications rank below all Timestamp ones. A user with 50 or more Timestamp notifications won't see the server-written ones in the top 50. New server writes in `socialMigrationServer.ts` use real timestamps. **Follow-up:** switch the other server writers (e.g. the X-reminder cron) to `timestampValue`.

## B. Migration mechanics

### Find your people (Bluesky + Mastodon follow graph)
- `POST /api/social/find-people` (server, credentials stay encrypted server-side). For each linked Bluesky account it calls `app.bsky.graph.getFollows` (new `bskyGetFollows` in `services/fediverse/bluesky.ts`). For each Mastodon account it pages `accounts/:id/following` via the Link header, staying on the same host. Caps: 2000 follows per account, 6 searches per 10 minutes.
- Matching uses the server-maintained lookup **`fediverse_handles/{key}` → `{ uid, network, handle, updatedAt }`**. Keys: `bluesky_<did>` (DID, not handle, because handles change) and `mastodon_<user@host>` (the full address, so the same person seen from two instances maps to one key). Written whenever `/api/fediverse/accounts` loads (the context calls it after connect) and on each search. Removed on disconnect if it still points at that user. **Server-only**, with no client read rule: that's stricter than "public-read minimal", because a public mapping would let anyone de-anonymise a fediverse account.
- Results drop blocked pairs and show follow state (following / requested / none). Each row has a one-tap **Follow**, which uses the client `followUser()`, so private accounts get a request. **Follow all** uses `POST /api/social/follow-batch`.
- **Invite the rest**: avatars plus count of the unmatched people, **Post invite on Bluesky** (`bsky.app/intent/compose`), **Post invite on Mastodon** (`<your instance>/share?text=`), and **Share my invite link**.
- UI: `components/discovery/FindYourPeople.tsx`, mounted in `FediverseHub` (when Bluesky or Mastodon is linked) and in the onboarding follow step (`OnboardingFollowStep`, people stage). With no linked account it shows a short "link your account" note.

### Server follow writes (`serverFollowBatch`)
- The old `/api/social-import/follow-batch` called the client SDK from the server, which had no auth, so every write was denied. It now writes through Firestore REST with the service account, using the same semantics as `followUser()`: blocked pairs are skipped; private targets get `follow_requests/{a}_{b}` with status pending (at most 20 per batch, to limit spam); public targets get `follows/{a}_{b}` via create-once (idempotent), plus follower/following counters and a FOLLOW notification. The lead's validation and 200 cap are kept. `POST /api/social/follow-batch` is the same thing behind its own rate limit.
- **X import is disabled.** The hardcoded PKCE challenge (`code_challenge=challenge`, method=plain) is gone. `/api/social-import/twitter/*` now return 410 with a pointer to Find your people. `components/SocialGraphImport.tsx` stays unmounted.

### Rich share cards (paste into X / iMessage / Discord)
- Path-style links: `/c/:clubId`, `/room/:id` (rooms), `/talk/:id` (liveTalks), `/party/:id` (parties), `/live/:id` (live_feeds), `/join/:code`. The server injects OG/Twitter meta: title, host, a LIVE marker, member/listener/viewer counts, and an image (club cover, host avatar, Mux poster or party thumbnail, falling back to `/og-default.png`). Private clubs get a generic card. Cache is 120s when the card resolved and no-store when it didn't.
- Humans: an inline script at the top of `index.html` maps the path to the params the app already handles (`?club=`, `?room=`, `?talk=`, `?party=`, `?livestream=`, `?join=`). It runs before the app module whether the shell came from the server or a cache. No App.tsx edits. `?talk=` is new and is handled in `FeedView`, which opens that talk once. In dev the route only serves crawlers; Vite serves humans.
- `buildShareUrl` now emits these paths for `club`, `room`, `livestream`, and the new `talk` and `party` types. `partyShareUrl` emits `/party/:id`.

### Personal invites (`services/inviteService.ts`)
- `GET /api/invite/me` creates or returns one code per user: `invites/{code}` `{ inviterUid, createdAt, redeemedCount }` plus `invite_owners/{uid}`. The link is `https://plajah.com/join/<code>`, and its card reads "<name> invited you to Plajah".
- The visitor's code is stashed in localStorage by index.html, which survives sign-up and OAuth redirects. `index.tsx` lazy-loads the service only when a code is pending. After sign-in it calls `POST /api/invite/redeem`. The server only accepts an account created within 7 days (Identity Toolkit `createdAt`), never the inviter's own code, and once per account ever (`invite_redemptions/{uid}`, create-once). It waits until the new profile doc exists (`profile_pending` makes the client retry).
- On redeem: both sides follow each other (each direction respects that side's privacy), `invites/{code}.redeemedCount` and `users/{inviter}.invitedCount` go up by one (a counter only, no money), and a `plajah:invite-redeemed` window event fires. Nothing listens for that event yet, so it could drive a toast.

## Files
New: `services/socialPerfCore.ts` (pure, tested), `services/socialPerf.ts`, `services/sharedSubscription.ts`, `services/socialMigrationServer.ts`, `services/inviteService.ts`, `components/discovery/FindYourPeople.tsx`, `tests/socialPerf.test.ts`, `tsconfig.social-perf.json`, `docs/rules-patches/social-perf.rules.snippet`.
Edited: `services/backendService.ts` (listenToMessages, listenToChatRooms, fetchNotifications, updateTypingStatus, listenToClubPosts, listenToClubChat, plus 3 import lines), `server.ts` (X routes → 410, follow-batch, accounts-list and disconnect hooks, one `registerSocialMigrationRoutes` block before `/share`), `firestore.indexes.json`, `firestore.rules` (typing subdoc), `index.html`, `index.tsx` (tail), `components/ChatWindow.tsx`, `components/NotificationCenter.tsx`, `contexts/NotificationContext.tsx`, `components/PollCard.tsx`, `components/FediverseHub.tsx`, `components/discovery/OnboardingFollowStep.tsx`, `components/FeedView.tsx` (`?talk=`), `services/deepLinkService.ts`, `services/partyService.ts`, `services/fediverse/bluesky.ts` (`bskyGetFollows`).

## Tests
`npx tsx --test tests/socialPerf.test.ts`: 12 tests covering paging merge/slide, typing TTL and throttle, notification grouping, fediverse keys, invite rules, share-path parsing, card copy and the shared subscription.

## Deploy checklist
1. `firebase deploy --only firestore:indexes`. Until then, the ordered queries fall back automatically.
2. Live rules: paste `docs/rules-patches/social-perf.rules.snippet` (typing subdoc) into the live set, because the repo `firestore.rules` is undeployable. Until then typing uses the legacy field.
3. Cloud Run deploy of server.ts, for the new routes and the follow-batch fix. Needs `FIREBASE_API_KEY` for invite account-age checks (already used by auth) and `ENCRYPTION_KEY` (already used by fediverse).

## Remaining gaps
- No end-to-end run against live Bluesky or Mastodon accounts. `bskyGetFollows` with OAuth-linked Bluesky accounts goes through the injected OAuth agent and hasn't been exercised.
- Find-your-people only matches people who **also** linked their fediverse account on Plajah. Nothing backfills `fediverse_handles` for existing linked users until they open the Fediverse hub or run a search. A one-off backfill script over `users/*/fediverseAccounts` would close that gap.
- No opt-out of being findable by fediverse handle (it's implied by linking an account). Consider a `fediverseDiscoverable` toggle.
- Notification mixed timestamp types (see above). Server follow-batch notifications are not pushed (FCM), only written.
- Room-list typing dots, explained above. PollCard vote storage, also above.
- Invite UI: `shareMyInvite()` is reachable only from Find your people. There's no dedicated "Invite friends" button on the profile or settings yet, and no inviter toast yet.
