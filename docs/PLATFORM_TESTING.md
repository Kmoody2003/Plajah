# Plajah — Platform testing checklist

Features that need thorough hands-on testing, ordered by risk. Each item lists **how to test**,
**expected result**, and **confidence** (🔴 unverified / built-blind, 🟠 partially verified,
🟢 verified in prod). "Multi-client" = needs two or more signed-in accounts / devices at once.

Last updated: 2026-07-27.

---

## P0 — Real-time & multi-client (built, logic-tested, NOT yet exercised live)

These are the newest systems and **cannot be validated with one browser** — they need 2+ signed-in
clients (ideally on different networks/devices). The pure logic is unit-tested and the app boots
clean, but true sync/behavior is unproven until run with real clients.

### Watch party (synchronized movies/video) 🔴
- **Setup:** Account A opens a video → **Watch Party** → share the link. Account B opens the link.
- **Test:** A plays/pauses/scrubs; B is muted to A's controls (locked "Following host").
- **Expected:** B follows within ~1–2s: play/pause mirror instantly; a scrub on A snaps B to the new
  position; a late joiner lands at the live position; viewer count reflects both.
- **Edge cases:** B refreshes mid-party (should rejoin + resync); A ends the party; poor network on B
  (should re-seek on drift, not stutter-loop); 3+ viewers.

### Read-along (synchronized books) 🔴
- **Setup:** A opens a book → Read Along (Book Club) → share. B opens the link.
- **Test:** A turns pages / changes chapter.
- **Expected:** B navigates to A's chapter+page; reader count is real; leave/end works.
- **Known limit:** EPUB (cfi) books sync the parsed chapter/page path only — verify on an authored
  (non-EPUB) book first; note behavior on EPUB.

### Listening party (synchronized Chora album/track) 🔴
- **Setup:** A opens an album → **Listening Party** → share. B opens the link.
- **Test:** A plays/pauses/seeks/skips tracks.
- **Expected:** B's Chora player switches to A's track, seeks to A's position, mirrors play/pause;
  audio streams locally on B (full quality), just kept in sync.
- **Edge cases:** track change while B is mid-track; B was playing something else before joining.

### Live Talk (audio rooms / Spaces) 🔴 multi-client
- **Test:** A starts a talk; B opens the app and **clicks the room in discovery** (or the global
  strip) → should join and hear A. B raises hand → A approves → B becomes a speaker and can talk.
- **Expected:** real audio both ways; promoted speaker shows B's real name/photo; when B leaves, B's
  speaker tile disappears (the arrayRemove fix); chat + shared "now playing" asset work.
- **Also verify:** TURN relay works across strict NAT (two different networks, not same wifi).

### Reello live — guests on stage 🔴 multi-client
- **Setup:** A goes live (Reello, QUICK/STUDIO WebRTC mode). B watches.
- **Test:** B taps **Ask to join** → A sees the request badge/panel → **Bring on** → B publishes cam/mic.
- **Expected:** everyone sees A as the **main video** and B as a **guest tile** (not B's stream as the
  main video); B has on-stage mic/cam toggles + Leave; A can Remove B; B's tile clears on leave.
- **Edge cases:** two guests at once; guest leaves vs host removes; guest denies camera permission.

---

## P1 — Feature-complete but needs a real data setup or single-account live check

### FAST channels — end to end 🟠 (feeds valid but empty; needs a published channel)
- **Setup:** enable a FAST channel (one tap in Video Manager → it auto-builds from your videos),
  confirm it publishes.
- **Test on TV/web:** the channel appears in Taleo & Reello **Live** rails; opening it plays the
  **slot schedule** (station IDs, ad breaks / commercial-free, scheduled live) — not just raw videos.
- **Guide match:** the in-app "Guide" panel and the on-screen "now" agree.
- **Carriage feeds:** hit `plajah.com/api/fast/lineup.json`, `/epg.xml`, `/lineup.m3u8`,
  `/api/fast/<ownerId>/now.json`, `/stream.m3u8` — should return real data for the published channel;
  play `stream.m3u8` in an HLS player (VLC / a TV IPTV app) and confirm it plays + rolls to the next
  programme. **Unverified against a real Mux playlist.**
- **Members-only:** a Sanctuary member vs non-member should see different (exclusive) programming.

### Chora "Sync Lyrics" on older tracks 🟠
- **Test:** open an OLD track (uploaded before the transcode pipeline) → Re-Sync Lyrics.
- **Expected:** captions generate (no silent failure); a genuinely-too-large/failed case shows a clear
  message near the button, not a dead spinner.

### Update notification 🟢 (fixed) — quick confirm
- **Test:** load the app; the "What's New" panel shows once for the latest changelog entry, then never
  again on reload. Add no entry + redeploy → stays quiet.

### Adaptive playback / cost 🟠
- **Test:** play a Mux video/FAST channel on a small window and on a TV; confirm it doesn't pull the
  top rendition into a small view (capLevelsToPanel) and stays smooth on the TV.

---

## P2 — Cross-platform surfaces (device-specific; easy to regress)

### TV apps (Android TV / Fire TV / Samsung Tizen / LG / Roku) 🟠
- D-pad navigation across Taleo/Chora/Reello/Academia; hardware **Back** never dumps to the login
  page; the FAST Live rails open and play; the album slideshow + FX Stage; persistent transport bar.
- Rebuild the APK / Tizen `.wgt` and smoke-test on real hardware (see native-builds notes).

### Native mobile (Capacitor Android/iOS) 🟠
- Push notifications (native + web FCM), deep links (`?party=`, `?video=`, share links) opening the
  right screen, uploads with a hot-switched account (token refresh), audio playback in background.

### Sharing / deep links 🟠
- Every share type opens its asset with a real preview card: video, album, book, movie, livestream,
  **party** (`?party=`), room, event, club. Test signed-out (public view) too.

---

## P3 — Core flows (regression pass before any release)

- **Auth:** email + each social provider (login-issue capture for failures); sign-out/in; account switch.
- **Upload:** video (→ Mux transcode completes + picks up muxPlaybackId), audio, book, image.
- **Playback:** Chora audio (no drops / advances to next track), Reello video, Taleo film (HLS),
  offline downloads.
- **Commerce:** merch checkout (Stripe), Sanctuary membership gate, giving (Elevate/church).
- **Health/observability:** trigger a client error → confirms it reports with the session trace + the
  failing request list.

---

## Notes on confidence

- 🔴 P0 items were built this session and are **logic-tested + boot-clean only**. The follow math
  (`computeFollowTarget`) and HLS/EPG builders have passing unit tests, but real-time behavior between
  clients has not been run. Treat P0 as "ready for QA," not "shipped-verified."
- The safest first pass: two phones/browsers on **different networks**, one hosting and one joining,
  for each P0 feature. WebRTC (Live Talk, Reello guests) specifically needs a cross-NAT test to
  exercise the TURN relay.
