# Plajah Podcast Studio — Architecture

**Goal:** a live-radio-style production console — record/produce an episode (or go live), take **callers** (Comrex-style, incl. guests), fire **soundboard** cues, roll in **audio ads** (from the user's radio station + brand deals, with ad-read copy), then **distribute** to every RSS feed + podcast directory. Audio → podcast; video → Reello.

---

## 1. Entry points
1. **Content upload → Podcast → Produce.** When the user picks **Podcast** in the content-upload UI, they choose **Upload a file** *or* **Produce** → Produce opens the Studio.
2. **Save-to-podcast** after a live session ends — a prompt offered when:
   - a **Live Talk** finishes,
   - a **live stream** from the **video switcher** finishes,
   - a **DJ-mode** broadcast finishes.
   Audio sessions → "Save to podcast"; video → "Save to **Reello**".

## 2. Two environments, one console
- **Studio (recording):** record a **mixed master** locally — host mic + callers + soundboard + ads + music bed → one Web Audio mix → `MediaRecorder` → episode blob.
- **Live (broadcast):** the *same* mix is published live via `rtcCore` **broadcast** topology; listeners subscribe. Recording runs in parallel, so the live show **becomes** the episode.

## 3. The mix engine (core)
`services/podcastStudio/mixEngine.ts` — a Web Audio **master bus** summing named channels, each with gain + mute + meter:
`host mic` · `callers` (one gain per caller) · `soundboard` · `ads` · `music bed`.
- Master → (a) a `MediaStreamAudioDestinationNode` feeding both the **recorder** and the **live publish track**, (b) a **monitor** out (headphones).
- **Auto-ducking:** host + callers duck under the ads/soundboard bus while a cue plays (sidechain-style gain ramp).
- Per-channel meters for the console VU display.

## 4. Callers — Comrex-style line
`services/podcastStudio/callLine.ts` over `rtcCore` (mesh audio to the host):
- Caller states: **ringing → screening** (host hears in **cue**, not on air) **→ on-air** (mixed into master) **→ dropped**. The host runs a screener queue: take, screen, put on air, drop.
- **Signed-in callers** join with their identity.
- **Guests:** a shareable **call-in link** opens a minimal join page; the guest enters a **name** and joins via a **temporary, expiring session** (Firebase **anonymous auth**), no account. The session expires when the call/episode ends.
- Caller audio runs through the **AM/ham radio FX** chain (reuse `services/walkieTalkie/radioFX`) so call-ins sound like call-ins.

## 5. Soundboard
`services/podcastStudio/soundboard.ts` + `SoundPad[]` per user — a pad grid, each bound to a cue (stinger / jingle / drop / bed / SFX). One-shot or looping (beds). Fires into the soundboard channel. User-uploadable + a default set.

## 6. Ad-roll
`services/podcastStudio/adRoll.ts` — an **ads bus** + a "roll ad" action. The pool draws from:
1. the user's **platform radio station** (their ad rotation / inventory), and
2. their **brand deals / sponsorships** — each deal carries an **ad creative** (audio) and/or **ad-read copy** (the script) + sponsor + flight dates.
Rolling an ad: pick from the pool → **audio creative** plays into the ads bus (ducking host/callers); a **live read** shows the **copy on a teleprompter** card for the host + logs the read. Every play writes an **ad marker** onto the episode (reuse `Track.adMarkers`) for reporting + dynamic insertion.

## 7. Distribution
On finish: recorded master → an **episode** (Track) on the user's podcast **Album** (`subType: 'PODCAST'`) → `podcastRSSService` regenerates the **RSS feed** → `PodcastDistributionHub` links/submits to directories (Apple / Spotify / Amazon / …). Ad markers, chapters, and show notes travel with the episode.

## 8. Data model
- `PodcastEpisodeDraft` — `{ id, title, albumId, recordingUrl, durationMs, adReads[], callers[], chapters[], showNotes }`.
- `SoundPad` / `Soundboard` — per user (`{ id, label, url, loop, color }`).
- `AdCreative` — `{ id, source: 'radio-station' | 'brand-deal', sponsor, label, audioUrl?, copy?, flight? }`.
- `StudioCaller` — `{ id, showId, uid?, name, isGuest, state: 'ringing'|'screening'|'onair'|'dropped', joinedAt }`.
- `GuestSession` — temporary `{ uid (anon), name, showId, expiresAt }`.

## 9. Module shape
```
services/podcastStudio/
  mixEngine.ts     master bus + channels + record/publish + ducking + meters
  soundboard.ts    pads + cue playback
  adRoll.ts        ad pool (radio station + brand deals) + roll + ad-marker log
  callLine.ts      Comrex caller line over rtcCore (screen/air/drop) + guest sessions
  studioService.ts draft → recorded master → Album episode → distribute
components/
  PodcastStudio.tsx  the console (mic + meters + soundboard + ad-roll + callers + record/live)
  PodcastCallIn.tsx  the guest call-in join page (name → temp session → on the line)
```
**Integration:** content-upload **Produce** → PodcastStudio; **save-to-podcast** hooks from Live Talk / switcher / DJ end; distribution via the existing RSS service + hub.

## 10. Phases
1. **Console + mix + record** — studio shell, mix engine, host-mic record, soundboard.
2. **Ad-roll** — brand-deals + radio-station pool, audio creative + copy teleprompter, ad markers.
3. **Callers** — rtcCore screen/air/drop + **guest call-in** (anon session + name).
4. **Live** — rtcCore broadcast of the mix + **save-to-podcast** hooks from live endings.
5. **Distribute** — RSS regen + directory submit + chapters/show notes.

## 11. Open decisions
1. Guest session: Firebase **anonymous auth** (recommended — simplest, auto-expiring) vs. custom short-lived token.
2. Live-read vs. recorded ad: **support both** (teleprompter copy + audio creative).
3. Record location: **local MediaRecorder of the mix** (recommended) vs. server-side mix.
