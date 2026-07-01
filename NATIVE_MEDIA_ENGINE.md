# Plajah Native Media Engine — build blueprint

Turns the shipped browser foundation (`services/mediaEngine/*`, `VideoRouterConsole`) into a
real desktop/mobile production engine with capture cards, NDI, SRT/RTMP, BRAW and hardware
sync — the native half of [`plajah-media-engine-HANDOFF.md`](./plajah-media-engine-HANDOFF.md).

> **Status:** the shared UI + engine store + WebRTC/webcam sources are LIVE. The UI is
> native-ready via `services/mediaEngine/bridge.ts` — it already looks for a native host and
> mirrors routing/switcher/sync to it. This doc is the plan to implement that host. It is a
> multi-week native effort (Rust + GStreamer + vendor SDKs), not a web-repo change.

---

## 1. The seam that already exists

The web app talks to the native engine through **`bridge.ts`**, which resolves ONE of:

- **Tauri:** `window.__TAURI__.core.invoke('plugin:media-engine|<cmd>', args)`
- **Generic:** `window.__plajahMediaEngine = { capabilities, invoke(cmd, args) }`

Commands the native host must implement (all already called by the UI, no-ops in browser):

| Command | Args | Returns | Purpose |
|---|---|---|---|
| `capabilities` | — | `Capabilities` | Real per-host source flags (overrides `detectCapabilities`) |
| `list_sources` | — | `NativeSourceInfo[]` | Enumerate DeckLink / NDI / SRT inputs |
| `connect_source` | `{id}` | `{textureId}` | Start a source; return a GPU/shmem frame handle |
| `disconnect_source` | `{id}` | — | Stop a source |
| `route` | `{destId, srcId}` | — | Crosspoint route in the native graph |
| `set_program` | `{program, preview}` | — | Switcher PGM/PVW + tally out |
| `set_sync` | `{masterClock, syncTargetMs}` | — | Configure the TBC |

Implement these and the existing console drives real hardware unchanged.

---

## 2. Shell: Tauri 2 (desktop) + Capacitor (Android)

- **Desktop (Win/macOS/Linux): Tauri 2.** Scaffold alongside this Vite app:
  `npm create tauri-app@latest` → point `build.frontendDist` at this project's `dist`,
  `build.devUrl` at the Vite dev server. Register a `media-engine` Tauri plugin (Rust) that
  exposes the commands above via `#[tauri::command]`.
- **Android: Capacitor** shell + a Kotlin/JNI plugin bridging to the same Rust core via NDK
  (NDI + camera + WebRTC + SRT; no DeckLink/BRAW).
- The React app is untouched — `capabilities.ts` already detects Tauri/Capacitor and reads the
  injected capability report.

---

## 3. Core: `plajah-media-engine` Rust crate (gstreamer-rs)

One GStreamer pipeline is the source registry + router + switcher + TBC.

```
crates/plajah-media-engine/
  src/
    lib.rs          // engine handle, command dispatch (maps bridge cmds → graph ops)
    sources/
      decklink.rs   // decklinkvideosrc/decklinkaudiosrc (BMD Desktop Video SDK)
      ndi.rs        // ndisrc/ndisink (NDI SDK) + mDNS discovery
      srt.rs        // srtsrc/srtsink (libsrt, MPL-2.0)
      webrtc.rs     // webrtcbin (WHIP/WHEP egress to the browser subset)
      braw.rs       // appsrc fed by BMD RAW SDK (GPU decode) — Fabula + playback
    router.rs       // input-selector / tee crosspoints; salvos; audio-follow/breakaway
    switcher.rs     // glvideomixer/compositor: PGM/PVW, keyers (chroma/luma/DVE), DSK
    sync.rs         // master clock (PTP via `statime`, or pipeline monotonic) + per-source
                    // jitter buffers sized to syncTargetMs; videorate/scan retime to house fmt
    tally.rs        // GPIO / NDI-metadata / network tally out
```

- **Frames to the UI:** register the GStreamer GL context; hand the UI a texture handle
  (`FrameRef.textureId`) for the multiview/preview, or fall back to a WHEP self-loop so the
  browser `<video>` can preview a native source.
- **Sync honesty:** soft-sync aligns IP sources inside the buffer window; genlock the DeckLink
  SDI inputs in hardware and soft-sync IP to that reference. True frame-accuracy = HW ref/PTP.

---

## 4. Phased native rollout (continues the handoff §15)

1. **Tauri shell + Rust crate skeleton** implementing `capabilities` + `list_sources` +
   `connect_source` over a single GStreamer pipeline; prove one **DeckLink** input renders in
   the existing console.
2. **NDI** send/receive + discovery; **SRT** ingest (drop the browser WHEP relay for native).
3. **Switcher compositor** on GL/Metal (glvideomixer) — keyers, DSK, transitions, multiview,
   tally out. Mirror `set_program`.
4. **Virtual TBC** — PTP/soft master clock + jitter buffers + house-format retime (`set_sync`).
5. **BRAW** decode (BMD RAW SDK, GPU) → `appsrc` for Fabula timeline + playback; proxy path
   for Android/browser.
6. **Android** Capacitor plugin (NDI + camera + WebRTC + SRT).
7. **AVB (experimental)** or ST 2110/Dante evaluation.

---

## 5. Licensing gates (do NOT ship commercially before clearing — see handoff §14)

- **GStreamer plugin hygiene:** keep GPL-only plugins out of the closed build or isolate them
  in a separate process. Audit every plugin.
- **NDI:** royalty-free w/ attribution — show the `ndi.video` link wherever NDI is selected;
  don't redistribute NDI Tools; Advanced SDK is a separate commercial license.
- **H.264/H.265/AAC:** patent-pool royalties at volume — budget + counsel.
- **DeckLink / BMD RAW SDKs:** free EULAs, dynamic-link the user's installed Desktop Video;
  register as a BMD developer; verify RAW decode-lib redistribution.
- **libsrt** MPL-2.0, **MediaMTX** MIT, **Tauri** MIT/Apache — OK.

---

## 6. Open decisions to confirm with K-Moody (handoff §16)

Desktop shell (Tauri ✓) · WebRTC egress (self-host vs LiveKit/Cloudflare) · PTP available? ·
house format (1080p59.94?) · AVB vs ST 2110 vs Dante · codec royalty budget · theme tokens for
the console reskin.
