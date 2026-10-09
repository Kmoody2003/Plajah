# Reello Live emotes

Status: built 2026-10-07. Not yet verified on a real device or a real multi-viewer stream (see "Not verified").

## What it is

An emote system for live streams that covers everything Twitch, Kick, TikTok Live and YouTube viewers expect, plus three things they don't have:

1. **Chorus.** When many *different* people send the same emote within 5 seconds, it grows. Tier 1 is a bigger burst. Tier 2 sends a marching wall across the stream with a banner. Tier 3 (a "full chorus") evolves into a storm, a firework, a shockwave or, for Lorik & Lumi emotes, a **summon**: the full-size kaiju walks on in a follow-spot and performs. One person holding the button can't trigger a chorus. Thresholds scale with the audience: 3/8/18 senders on a small stream, and 2/6/15% of the audience on a big one.
2. **Crowd Light.** Every emote has a *gel*, the colour of light it throws. The audience's gels mix into one light that rims the stream and lifts a footlight glow. It breathes rather than flickers: it can only move at a fixed attack/release rate, so it can't strobe. Optionally, **your chat lights your room**: the same colour drives the creator's Hue, Nanoleaf, Govee or Razer lights. Those update at most every 1.5 s, with brightness held between 35% and 85%, so the room never flashes and the creator's face never goes dark.
3. **One light plot for the whole library.** The lighting designer's rule is one rig for every emote. The key light is warm and comes from the top-left. Each emote also has a coloured rim light from the lower-right, a bounce light from below and a soft contact shadow. Six art directions and two characters still read as one family on a busy stream.

## The standard features

- A global library of 161 emotes, with search, a tab per pack, favourites (long-press), and recents.
- Inline chat emotes: type `:fire:`, get autocomplete from `:fi`. A message made only of emotes renders jumbo. Old unicode-emoji messages map onto library emotes.
- A quick tray under the stream. Tap sends one emote. **Hold** keeps sending in TikTok style, with a live ×count and a haptic tick. Holding is batched into one write per ~650 ms per emote, and writes are rate-limited by a token bucket.
- **Channel emotes.** Creators upload PNG, GIF or WebP files up to 512 KB and set the code, who can use them (everyone, followers, members), the motion and the light colour. They're stored at `users/{uid}/channelEmotes/{code}` and in Storage under `users/{uid}/channelEmotes/`.
- **Emote-only chat mode**, toggled by the creator.
- Per-stream switches for chorus, Crowd Light, kaiju summons, emote-only chat, and "bake into stream".
- **Design a set with the Council.** In the Emote studio, a creator describes their channel and the real Council of Art Directors (`services/council`, QUICK depth) deliberates a channel emote-set concept through Aria.

## Packs

| Pack | Lens | What |
|---|---|---|
| Classics (`core`) | the house rig | 63: faces on a lit amber sphere built from an eyes × mouth × extras grammar, glossy icons, and chat-speak (GG, W, L, HYPE, CLIP IT…) |
| Lorik & Lumi (`kaiju`) | the mascots | 24: Animated loops baked from the real canvas puppet, so there is one likeness everywhere. Summon on a full chorus |
| Neon Signal (`neon`) | The Futurist | 12: Light as the material |
| Riso Riot (`riso`) | The Rebellious Hand | 12: Misregistered two-ink stickers |
| Gilded (`gilded`) | The Classical Mind | 12: Gold leaf, laurels, proportion |
| Spotlight (`spotlight`) | The Baroque Dramatist | 11: Chiaroscuro and the stage |
| One Line (`oneline`) | The Radical Minimalist | 11: One weight, one line |
| Atlas (`atlas`) | The World-Eclectic Traveler | 16: Celebrations from many places, each credited |

The council collections were designed by applying each director's lens from `services/council/councilDirectors.ts`. The live council service could not be called here because the local keys are dead. The in-app "Ask the council" button does call the live service.

## Architecture

**Overlay-first.** Each viewer draws the audience's emotes on their own device (`EmoteOverlay` → `EmoteStage`) from `streams/{id}/events`. This has three benefits:

- Emotes are crisp at any resolution.
- They arrive as fast as Firestore does, usually ahead of the video.
- They cost the streamer's phone nothing, because the WebGL composer stays off unless the creator wants effects. Before this, audience emotes only showed up on the stream if the composer happened to be running.

The **host is the single chorus authority**. It counts distinct senders and writes `streams/{id}.emoteChorus`, which every viewer renders at the same moment. **Bake into stream** (`streams/{id}.emotes.bake`) draws a second stage into the published frame through `LiveComposer.setOverlayDrawer`, so recordings and restreams keep the emotes. Viewers then draw only their own taps.

```
services/emotes/
  emoteTypes.ts        EmoteDef, packs, motions, evolutions, events, settings
  emoteRig.ts          the light plot: Svg builder, litSphere / litPath / litText, colour maths
  packs/corePack.ts    Classics
  packs/kaijuPack.ts   Lorik & Lumi (pose clips)
  packs/councilPacks.ts  the six council collections
  kaijuEmoteBaker.ts   KaijuArt → looping frame strip via KaijuCanvasFigure
  emoteLibrary.ts      registry, lookup by id / code / unicode, search, channel registration
  emoteAssets.ts       SVG → data URL, bitmaps, kaiju bake cache, frameAt
  emoteEngine.ts       pure: parse, autocomplete, TapBatcher, TokenBucket, ChorusDetector, CrowdLight, access
  emoteStage.ts        canvas renderer: motions, chorus evolutions, summon, banner, Crowd Light rim
  emoteLive.ts         Firestore: send, feed, chorus authority, room lights, channel emotes
  emoteShelf.ts        recents + favourites (localStorage)
components/emotes/
  EmoteGlyph, EmoteOverlay, LiveEmoteLayer, EmoteTray, EmotePicker, EmoteChatText (+EmoteSuggest), EmoteStudioSheet
```

The integration is in `components/MobileLiveStreamer.tsx`, which covers both `LiveStudio` (host) and `LiveViewer`, so every surface that mounts them gets emotes: Reello, VideoTab, LiveHub, Clubs, Feed and GoLiveWizard.

### Data

- `streams/{id}/events/{auto}`: `{ type:'emote', emoteId, emoji?, n, uid, name, ts }`. These are append-only, self-attributed and schema-checked in `firestore.rules`. `emoji` is kept for old clients.
- `streams/{id}.emoteChorus`: `{ emoteId, tier, count, ts }`, written by the host.
- `streams/{id}.emotes`: `StreamEmoteSettings`, written by the host.
- `users/{uid}/channelEmotes/{code}`: `{ code, name, url, access, gel, motion, animated, createdAt }`.

## Preview and tests

```bash
npx vite --config emotes.vite.config.mjs
```

- `http://127.0.0.1:3111/emotes.html` is the gallery. It takes `?pack=`, `&bg=dark|light|stream` and `&size=`.
- `?view=live` is the live simulator: a bot audience, chorus waves by tier, and a reduced-motion toggle.
- `npx tsx --test tests/emoteEngine.test.ts` runs the engine tests (parsing, batching, rate limit, chorus distinct-sender rule and audience scaling, Crowd Light no-strobe and decay, access).

## Animation (big sizes only)

Vector collections come alive when shown big: on-stream bursts, picker hover, jumbo chat, and chorus finales. At 28 px in normal chat they stay still. `services/emotes/emoteAnimators.ts` bakes a seamless loop from the emote's raster. The loops are seeded by emote id, so every viewer sees the same performance.

- **neon** (Neon Signal): a mains hum in the glow and a cold-start double blink. One band of the sign (a "letter") stutters on its own, like a failing tube.
- **sheen** (Gilded, plus the classic crown, trophy, gem and star): a light band sweeps across the gold, clipped to the shape, then star glints pop on the brightest highlights.
- **boil** (Riso Riot): a stop-motion redraw at 8 fps, inks slipping out of register and back, and a sticker-slap squash.
- **spot** (Spotlight): a carbon-arc beam that breathes, dust motes drifting down the beam, and a hot spot that wanders slightly.

## Scale: the relay

On small streams, every viewer reads the raw events, which is the lowest-latency path. Once the audience reaches 40, the host switches the stream to **relay** (`streams/{id}.emotes.relay`). It switches back below 25; the gap keeps it from flapping around one number.

In relay mode, the host already reads every event for the chorus. It folds them into one doc, `streams/{id}/live/emotes`, every 1.2 s. Each tick holds the top 24 emotes and their counts, as `{e, n}` maps because Firestore can't store nested arrays. Viewers listen to that one doc and spread each tick back out over 1.2 s. They subtract their own taps, which they already drew locally.

Reads per viewer go from every event to under one per second, whatever the audience does. Writes are unchanged: they are batched per tap-hold and rate-limited. `live/*` is owner-only in rules.

## Access tiers

- **In the UI:** `useViewerEmoteAccess(ownerUid)` checks follower status (`follows/{me}_{owner}`) and member status (the creator in the viewer's `activeMemberships`). Both update live, so following mid-stream unlocks follower emotes immediately. Locked emotes are hidden in the tray, show a lock in the picker, and are refused in chat.
- **In `firestore.rules`:** every event carrying a channel emote (`ch.<owner>.<code>`) is checked against the emote's `access`. Followers are checked against `follows/{me}_{owner}`; members against the server-written `sanctuaryMemberships/{owner}_{me}` with `status == 'ACTIVE'`.

### Memberships hardening (2026-10-08)

"Member" means an active **Sanctuary** membership. Sanctuary is the real paid system (Stripe, live since 2026-07-04); the old `memberships` collection had no rules and no writer. Fixed:

- `/api/stripe/sanctuary-tier` reads the tier's price, name and owner from Firestore. It used to trust the browser's price. It also copies metadata onto the Subscription.
- `/api/stripe/sanctuary-unlock` reads the item's price from `sanctuaryPosts`, `sanctuaryContent`, `sanctuaryGallery` or `posts/{id}.sanctuaryGate`, and checks the item belongs to that creator.
- `/api/sanctuary/join-free` handles free tiers only, with a server-checked price.
- `/api/sanctuary/cancel`: paid memberships switch to `cancel_at_period_end` in Stripe and keep access until the period ends; free memberships end immediately.
- The webhook now syncs `customer.subscription.updated` and `customer.subscription.deleted` to the membership: ACTIVE, PAUSED (past due) or CANCELLED, plus `renewsAt` and `memberCount`. Previously it only logged them, so cancelled members stayed ACTIVE forever.
- Rules for `sanctuaryMemberships`:
  - A client can't create a membership of a paid tier.
  - A client can't change tier, status or renewal, except to cancel.
  - The free-tier create and cancel are kept for older app builds still in production.
- Rules for `sanctuaryPurchases`: server-only. The old client `unlockContent` helper was removed.
- Removed the dead `joinMembership` and `joinMembershipTier` helpers.
- Library exclusives now check real Sanctuary memberships instead of the self-asserted `users.activeMemberships`.
- `ArtistMembersArea`'s Join button opens the creator's Sanctuary.



## Rules deploy: why it was stuck, and the fix

`firestore.rules` is about 296 KiB, over Firebase's 256 KiB ruleset limit. Every CI rules deploy since 2026-10-06 has failed with `HTTP 400 invalid argument`.

- `scripts/minifyRules.mjs` strips comments and leading/trailing whitespace, giving about 194 KiB. A line-by-line check confirmed that only comments were removed.
- `firebase.json` now deploys `firestore.rules.min`. It's generated by a predeploy hook and by CI, and gitignored.
- CI now byte-compares the live `plajah-prod` ruleset with the built file after each deploy.

## Not verified / open

- **Rules deploy.** Approved by Kenne 2026-10-08 (repo rules are the source of truth). Run `npx firebase-tools@13.35.1 deploy --only firestore:rules --project gen-lang-client-0665118474`; the predeploy hook builds `firestore.rules.min`. CI deploys the same file on the next `master` push.
- Not tested yet: real devices (phone and TV), a real multi-viewer stream, and the relay under load.
- Replays don't re-render emotes from the event log yet. The data is there, so a replay overlay is a natural next step, along with an emote heat map on the replay scrubber.
- No sound on emotes yet.
