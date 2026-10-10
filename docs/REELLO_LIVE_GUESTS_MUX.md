# Reello Live — guests on stage, shared sound, audience on Mux

Owner direction (2026-10-10): TikTok / Instagram / Twitch-style guest lives **on Plajah** (not simulcast
out), audience delivered through **Mux**, participants can share their device's sound and screen
(with the cut-out).

## Shape

```
 guests ⇄ host            real-time WebRTC 'stage' (rtcCore) — talk to each other with no delay
   │
 host's SessionRecorder   composes host + guests (portrait: 2 = stacked, 3–4 = 2×2, 5–6 = 2×3)
   │                      + mixes everyone's audio  → the PROGRAM
   ├─► archival recording (8 Mbps, cloud segments + on-device copy — unchanged)
   └─► liveMuxRelay       2nd MediaRecorder (~2.5 Mbps) → WebSocket → Cloud Run
                            → ffmpeg (H.264/AAC, 2 s GOP) → RTMPS → Mux live stream (low latency)
 audience                 streams/{id}.muxLive.state == 'live' → plays Mux HLS in the same <video>
                          (lenses / emotes still work); any HLS failure → back to P2P for that viewer
```

* Private / club streams never use Mux (a public playback id would be watchable by link) — P2P only.
* Viewers count via presence `presence/live_{streamId}/here/*` (existing rule) since Mux viewers aren't RTC peers.
* The Mux stream key never reaches the client. One Mux live stream per Plajah stream, reused across
  reconnects (Cloud Run cuts a request at `--timeout`, now 3600 s); deleted on host end or after 3 min abandoned.
* No `new_asset_settings`: the replay already comes from the host's own recorder (no duplicate Mux asset).

## Shared sound (`services/liveAudioMixer.ts`, UI `components/live/LiveSoundSheet.tsx`)

Mic + device audio (getDisplayMedia, desktop) + screen-share audio + **Play into stream** (a file
played by our own player) → one published track. Ducking under the voice; "Hear it" monitor
(headphones). Engaged lazily, so the default mic path is unchanged. Mute gates the raw mic only.
Chain on the host: raw mic → voice FX → mixer → `rtc.publishExternalAudio`.

**Phones:** mobile browsers have no getDisplayMedia, so another app's sound can't be captured from the
web. Play into stream works on every phone today. True "anything my phone plays" needs native
capture — Android MediaProjection + AudioPlaybackCapture (Android 10+; DRM apps like Spotify/Netflix
opt out at the OS level), iOS a ReplayKit broadcast extension. Not built.

## Guest screen share

Guests (desktop browsers) get Camera / Screen + camera / Screen + cut-out me. Runs a LiveComposer on
the guest (fed a CLONE of the camera so teardown never kills the real one); its screen audio joins the
guest's mixer. The host's program picks the guest's canvas up like any guest stream.

## Files

`services/liveMuxRelayServer.ts` (attached in server.ts next to the bm relay), `services/liveMuxRelay.ts`,
`services/liveHlsPlayback.ts`, `services/liveAudioMixer.ts`, `components/live/LiveSoundSheet.tsx`,
`services/sessionRecorder.ts` (track-keyed audio + `programStream()` + portrait guest grid),
`services/liveComposer.ts` (screen audio), `hooks/useRtcSession.ts` (`programStream`),
`components/MobileLiveStreamer.tsx`. Tests: `npx tsx --test tests/liveMuxRelay.test.ts`.
Lab: `npx vite --config live-sound.vite.config.mjs` → `http://127.0.0.1:3112/live-sound.html`.

## Not verified yet

Real ffmpeg → Mux on Cloud Run (ffmpeg isn't installed locally), a full live with 2+ devices, phone
thermals with the extra encoder, HLS delay vs chat (expect a few seconds), Cloud Run WebSocket at the
60-min cap. Capacity: ~1 vCPU per relayed live; `RELAY_MAX_PER_INSTANCE` (default 4) then lives stay P2P.
