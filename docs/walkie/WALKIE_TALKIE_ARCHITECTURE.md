# Plajah Walkie — Nextel-style Two-Way (Direct Connect) Architecture

**Goal:** a digital replica of the early-2000s **Nextel Direct Connect** push-to-talk, woven into Plajah messaging. Hold to talk → the other side hears you like a walkie-talkie — complete with the **chirp** and an intentional **AM/ham-radio sound**. Live when both are present (especially "hot" contacts); degrades to a short-lived voice transmission when they're not. Modern under the hood, **analogue/retro** on the surface.

---

## 1. Modes
- **Live PTT** — when the recipient is present (and always for *hot* contacts): you release the button, they hear it right away (auto-play, open channel). True low-latency streaming is the WebRTC upgrade (§7); the universal path is record-on-release → instant send → auto-play.
- **Async drop** — recipient away: the transmission becomes a stored voice clip in a **rolling 5-deep buffer** per sender→receiver.
- **Call substitute** — instead of ringing a user, open a two-way channel to them.

## 2. The rolling 5 + expiry
Per **(sender → receiver)** pair, keep only the **last 5** transmissions. Sending a 6th **expires/deletes the oldest** (a 5-deep ring buffer). So a clip's lifetime = until five newer ones from that sender arrive (plus a hard max-TTL backstop). This is the "keeps the last 5 … expires after the 5th message is sent" rule.

## 3. Relationships (who you hear)
- **Hot users — max 3:** always received **live + auto-played** like a real walkie-talkie (open channel). The marquee feature.
- **Pinned (receive-from):** always delivered (bypass do-not-disturb), but not necessarily auto-played live.
- **Blocked (don't-receive-from):** their transmissions are dropped on arrival.

Resolution order on an incoming transmission: blocked → drop; hot → chirp + auto-play; pinned/normal → store in the rolling buffer + notify.

## 4. Audio pipeline
- **Capture:** PTT held → `getUserMedia({audio})` → `MediaRecorder` (opus/webm) → blob on release. A short min/max clamp (e.g. 0.3s–30s).
- **AM / ham-radio FX (intentional, on playback):** a Web Audio chain that makes every transmission sound like comms radio —
  1. **Band-pass 300–3000 Hz** (the AM/telephone comms band — kills lows + highs),
  2. **Waveshaper soft-clip** (tube/transmitter overdrive),
  3. **Static bed** — filtered noise, gated to the speech envelope (hiss between words),
  4. **Bitcrush/sample-rate grit** + a **compressor** to flatten dynamics like AGC.
  Applied at playback so stored audio stays re-processable; an optional "monitor" applies it to your own mic preview.
- **Chirp:** the Nextel chirp, **synthesized** in Web Audio (no audio asset) — a quick dual-tone burst. Variants: **PTT-start** (your go-ahead), **incoming** (their alert), **end-of-transmission** (the classic "bdeep"). Pure oscillator + envelope.

## 5. Data model
- `WalkieTransmission` — `{ id, fromUid, toUid, pairId, audioUrl, durationMs, createdAt, expiresAt, seq, heardAt? }`.
- **Storage:** audio blob → Firebase Storage (`walkie/{pairId}/{id}.webm`) via the app's `uploadFile`; metadata → Firestore `walkieChannels/{pairId}/tx/{id}`, capped at 5 (delete oldest + its blob on send).
- `WalkiePrefs` (per user) — `{ hotUids: string[] (≤3), pinnedFromUids: string[], blockedFromUids: string[] }` on the user settings doc.
- `pairId` = the two uids sorted + joined (stable, order-independent) so both directions share a channel, but transmissions are keyed by direction (`fromUid`).
- **Realtime:** `onSnapshot` on `walkieChannels/{pairId}/tx` → receiver applies the relationship rules (auto-play for hot, store for others).

## 6. UI — analogue feel
A retro handset surface: brushed-metal / orange-plastic chassis, an **LCD channel readout**, a big **PTT bar** (hold-to-talk, momentary), a live **VU meter**, status **LEDs** (online / receiving / DND), the **5-slot transmission reel** (the rolling buffer, each playable until it expires), **3 hot-contact slots**, and chirp/monitor toggles. Modern layout + skeuomorphic textures, monospace LCD type. It replaces/augments the DM thread UI and can open as a "call substitute."

## 7. Live streaming (upgrade)
For hot contacts, a **WebRTC audio track** (reuse the app's `rtcCore`/call signaling) gives true sub-second live PTT — push opens the mic track, release closes it. The record-and-send path remains the universal fallback and the only path for the async/stored 5-buffer.

## 8. Module shape
```
services/walkieTalkie/
  radioFX.ts        AM/ham DSP graph + Nextel chirp synthesis (no assets)
  walkieService.ts  model, rolling-5 ring buffer, hot/pin/block prefs, send/receive/subscribe
components/
  WalkieTalkie.tsx  the retro PTT handset UI (capture + reel + hot slots + chirp)
```
Integration: a **"Two-Way"** action in the DM header / call-button area; identifies users by `auth.currentUser.uid` + the DM peer uid.

## 9. Phases
1. **The sound** — `radioFX.ts`: AM/ham chain + chirp (start/incoming/end). The identity of the feature.
2. **The service** — record → send → Storage + Firestore rolling-5, prefs (hot/pin/block), realtime receive, auto-play for hot.
3. **The handset** — `WalkieTalkie.tsx` retro UI + a DM/call entry point.
4. **Live WebRTC** PTT for hot contacts (true open channel).

## 10. Open decisions
1. **Live transport for hot users:** record-and-send (ship now) vs. WebRTC streaming (phase 4). Recommend ship record-and-send, add WebRTC for hot contacts.
2. **FX baked vs. on-playback:** on-playback (re-processable, recommended) vs. baked into the stored blob (cheaper playback). Recommend on-playback.
3. **Storage vs. ephemeral:** Firebase Storage blobs (persist until ring-buffer eviction) vs. fully ephemeral in-memory for live-only. Recommend Storage with TTL + eviction.
4. **DND / presence source:** reuse existing presence (online/away) to decide live vs. async.
