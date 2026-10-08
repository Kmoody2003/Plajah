# Blackmagic integration (cameras, ATEM, phones) for the Live Switcher

Built 2026-10-08. Code: `packages/blackmagic-bridge/` (LAN agent), `services/mediaEngine/blackmagic/` (app side),
`components/mediaEngine/BlackmagicPanel.tsx` (UI, inside the Add-source dialog of `VideoRouterConsole`).

## What is verified and what is not

| Piece | Status |
|---|---|
| Bridge pairing/auth/origin checks, device registry, ATEM command routing | Tested with fake links over a real WebSocket (19 tests, including the relay) |
| Camera REST/WS client | Tested against a fake camera that speaks the documented message shapes; **never run on a physical camera** |
| ATEM link (`atem-connection`) | Compiles and starts; **never connected to a physical ATEM** |
| mDNS discovery (`_blackmagic._tcp`, `_http._tcp` filtered by name) | Classifier tested; **which models announce what is unconfirmed** |
| Ingest watcher (MediaMTX API -> WHEP sources) | Pure matching tested; MediaMTX not run here |
| ATEM-as-control-surface sync | Loop-suppression logic tested with fakes (8 tests); not tried with a real panel |
| UI | Paired with a live bridge in the browser preview; ATEM add path shows "Connecting" for an absent unit |

## The SDKs

* **ATEM Switchers SDK** (10.4.1) is behind a Blackmagic developer registration, so it was not downloaded. It is not needed:
  the bridge uses `atem-connection` (MIT, Sofie/NRK), an open implementation of the same UDP protocol (port 9910).
  Its firmware support is tiered; very new firmware can lag. The SDK manual is a public PDF if wanted for reference.
* **"Blackmagic OS SDK"** does not exist under that name. Cameras running Blackmagic OS expose the public
  **REST API for Blackmagic Cameras** (`/control/api/v1/...` plus a WebSocket at `/control/api/v1/event/websocket`), which is what is used.
  Enable "Web Media Manager" in Blackmagic Camera Setup (network access) on each camera.
* **DeckLink / Desktop Video SDK and BRAW SDK** are also registration-gated and belong to the native Rust engine
  (`NATIVE_MEDIA_ENGINE.md`); nothing here depends on them.
* HyperDeck and Videohub have public text protocols (TCP 9993 / 9990). They are listed if discovered but not yet controlled.

## How it works

```
 ATEM / cameras / phones  <--LAN-->  Plajah Bridge (Node, on the switcher PC)  <--ws://127.0.0.1:8787-->  Plajah app
                                       mDNS discovery, ATEM UDP, camera REST/WS, MediaMTX watcher
```

A browser tab cannot open UDP or arbitrary LAN HTTP, hence the bridge.

1. **Run it:** `cd packages/blackmagic-bridge && npm install && npm start`. It prints a pairing token (stored in `~/.plajah-bridge-token`).
   Paste address + token in the Add-source dialog -> "Blackmagic cameras & ATEM" -> Pair.
2. **Auto-find:** mDNS browse for Blackmagic devices. Anything silent can be added by address (ATEM).
3. **Cameras/phones into the switcher:** they PUSH RTMP/SRT. Run MediaMTX on the same machine; the bridge watches its API,
   matches each publisher to a discovered device by IP, and the app subscribes over WHEP and puts it on the next free switcher input.
   Cameras with an RTMP/SRT stream setting, and the Blackmagic Camera phone app, are pointed at the URLs the panel shows.
4. **ATEM as control surface:** "Use as control surface" mirrors PGM/PVW/transition style/T-bar from the ATEM into the switcher and a
   Plajah take back onto the ATEM (a Plajah AUTO becomes an ATEM AUTO). Modes: both ways / ATEM leads / Plajah leads.
   ATEM input N <-> switcher SW N. Physical ATEM panels talk to the ATEM unit, never to a PC, so following the unit is the only possible route.

## Security

Anyone who can reach the bridge could cut a show or start camera recording. Required: pairing token on every socket, browser `Origin` allow-list
(plajah.com/.app, localhost, Capacitor), camera paths validated, 5 s auth window. The bridge listens on all interfaces so other LAN
machines can pair; bind it to `127.0.0.1` via `PLAJAH_BRIDGE_HOST` if you want it local-only.

## Mobile (phones and remote browsers)

* **Phone as a camera source:** works through the same ingest (the Blackmagic Camera phone app streams RTMP/SRT).
* **Phone as controller: relay built, not yet tried from a real phone.** The Android app is a thin shell over `https://plajah.com`
  with `allowMixedContent:false`, so a page cannot open `ws://192.168.x.x`. Instead both sides dial out to `wss://<host>/api/bm-relay`
  (`services/bmRelayServer.ts`, attached in `server.ts`). Start the bridge with `PLAJAH_RELAY=wss://plajah.com/api/bm-relay`, then in the
  panel press "Use Plajah relay" and enter the same token. The room id is `sha256(token)`; pairing is a nonce + HMAC-SHA256 proof
  the bridge checks itself, so the token never leaves your devices and knowing a room id grants nothing. The relay forwards in memory and
  stores nothing, but it can see commands (inside TLS). Limits: 64 KB frames, 4 phones per room, 1000 rooms, 40 msg/s, origin allow-list,
  `BM_RELAY_DISABLED=1` switches it off. Weakness: an attacker can fill the 1000-room cap with junk rooms; add per-IP limits if that matters.
* **Still missing for phones:** mDNS discovery of `_plajah-bridge._tcp` (needs a Capacitor NSD plugin). The relay does not need it.
  The relay endpoint is untested on Cloud Run itself (WebSocket upgrade behind the Google front end); tested over plain http in-process.

## Next

HyperDeck + Videohub control, ATEM tally/macro UI, camera control surface (iris/ISO/WB) in the switcher, NSD discovery on Android,
MediaMTX bundled and launched by the bridge, and real-hardware passes.
