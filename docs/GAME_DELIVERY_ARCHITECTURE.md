# Game delivery: web tier + native high-end tier (architecture, 2026-11-18)

Kenne's goal: every Plajah game ships in two tiers.

1. **Browser.** Plays instantly at plajah.com and pushes in-browser games as close to current-gen console quality as the web allows.
2. **Native high-end.** For PC (the WinUI app) and Android, it uses the hardware natively and targets Forza Horizon-level visuals.

Native game packages are **not** bundled with the apps. Each game is an optional package, installed in the background like the AI models. The web version stays playable while the package downloads. When the download finishes, the player launches the app version and continues exactly where they were (same save, same place, same event).

This doc builds on what exists: the WinUI WebView2 shell (it already serves the web app from a local folder), the model downloader (`NativeLlmService`, `localModelInstaller.ts`), first-party cloud saves (`gameSaves`, `services/gameSaveCore.ts`, `packages/first-party-games/cloudSave`), the WebGPU plan for Apex (`docs/apex-elohim/webgpu-migration.md`), the engine direction (`docs/PLAJAH_ENGINE_ARCHITECTURE.md`, `plajah-core` in Rust/wgpu), the Windows roadmap and the games-store egress study (`docs/PLAJAH_PLAY_GAMES_FEASIBILITY.md`).

---

## 1. What exists today (findings)

| Area | Today | What it means for games |
|---|---|---|
| WinUI shell | WinUI 3 + WebView2, high-performance GPU requested, maps `https://plajah.com` to a local `wwwroot` folder (`SetVirtualHostNameToFolderMapping`) | A game can already run from local files under the real origin, with WebGPU on the discrete GPU |
| Model downloads (PC) | `NativeLlmService.DownloadAsync`: catalog, resumable `.part` files with HTTP Range, progress messages over WebView2 (`LOCAL_LLM_DOWNLOAD_PROGRESS`), app folder `%LOCALAPPDATA%\Plajah\Models` or the studio drive `D:\Plajah Models` | The download pattern to generalise. Missing: per-file hash check, chunk manifests, parallel chunks, pause, a shared queue |
| Model installer UI (web) | `services/localAi/localModelInstaller.ts`: catalog with size, VRAM, status (`downloading/verifying/installed/error`), speed | The UI shape to reuse for a shared "Library" of models and games |
| Android | Capacitor WebView app (Classic) with a Compose native shell in progress (`docs/ANDROID_NATIVE_REBUILD.md`); foreground services for media; **no background downloader** | Needs a WorkManager download service (new) |
| Cloud saves | `gameSaves/{uid}_{gameId}` in plajah-ops: one JSON string ≤ 200 KB, `rev` must go up by one (no stale overwrite), game-defined merge; Apex garage merges by progress score; store at most every 2 s, 180/hour | Progress already syncs across devices. Missing: the live *session* (position, current event), which changes too often for this collection |
| Apex renderer | three.js WebGL2; WebGPU spike holds 60 fps on the Arc once draws are batched; Ravencrest already runs on `three/webgpu` + TSL | The renderer move to WebGPU/TSL is already planned and is the base for both tiers |
| Engine direction | `plajah-core` (Rust) compiled to wasm (wgpu→WebGPU) and native (wgpu→D3D12/Vulkan) | The long-term native renderer option (section 4, option B) |
| Distribution cost | Egress is the whole cost of big downloads; zero/low-egress storage (B2 + Cloudflare/Bunny, R2) vs ~$0.12/GB on GCS | Game packages must not be served from Firebase Storage |

---

## 2. Tiers and quality targets

One game, three presentations. The **simulation, data and saves are identical**; only the renderer settings and asset packs differ.

| | Web (browser tab or app WebView, no package) | Native PC (WinUI + installed package) | Native Android (app + installed package) |
|---|---|---|---|
| Visual target | Close to Series S: clean 1080p, full lighting and post, dense world at medium LOD | Forza Horizon 5 PC High/Ultra: 1440p–4K output, high LOD everywhere, full shadows/AO/reflections | Series S-like on flagships, solid mid-range |
| Frame target | 60 fps on Intel Arc / RTX 3050 class at 1080p (dynamic resolution 0.7–1.0); 30 fps on TV and low-end | 60 fps at 1440p on Arc A750 / RTX 3060; 4K output with temporal upscaling; 120 fps option on high-end | 60 fps at ~1080p (dynamic) on Snapdragon 8 Gen 2+; 30 fps at 720–900p on mid-range (Snapdragon 7-series, Adreno 7xx) |
| API | WebGPU (WebGL2 fallback) | WebGPU on D3D12 via WebView2/Dawn with experimental features enabled (section 4) | WebGPU on Vulkan where the WebView supports it, WebGL2 otherwise |
| Textures | KTX2/Basis (UASTC/ETC1S), 1K–2K, streamed | BC7 2K–4K (hero assets 4K), full mip chains | ASTC 1K–2K |
| Meshes | LOD1–LOD3, impostors beyond ~400 m | LOD0 near, LOD1–2 mid, long view distance | LOD1–LOD3, shorter view distance |
| Shadows | 2 cascades dynamic + far static, 2048 | 4 cascades, 4096 near, contact shadows | 2 cascades, 1024–2048 |
| AO / GI | half-res SSAO, baked probes | full-res GTAO, baked GI + screen-space GI, more probes | half-res SSAO, baked probes |
| Reflections | probes + screen-space on wet roads | SSR full-res + per-car realtime probe + planar water near camera | probes + cheap SSR on wet roads |
| Atmosphere | height fog, sky model | volumetric fog and clouds, light shafts | height fog |
| Ray tracing | no | not via WebGPU today (no ray tracing in the standard); only with a native renderer (option B or C) | no |
| Download before play | none (streams what it needs) | core pack ~2–4 GB first, region packs while you drive | core pack ~1–2 GB first |
| Disk (Apex, estimate) | browser cache only | 20–40 GB full HQ | 6–12 GB |

Forza Horizon 5's look is achieved mostly with rasterisation, baked lighting and excellent assets (its ray tracing is limited to the garage on PC). So the native tier can get close without hardware ray tracing. The gap is closed by asset density, texture resolution, shadow and AO quality, volumetrics and long view distance, all of which the native package carries and the browser cannot download quickly.

---

## 3. The shared game core vs per-tier parts

```
                 ┌──────────────────────── one codebase per game ────────────────────────┐
                 │  game core: simulation, physics, AI, rules, data, save format (TS)   │
                 │  renderer: three/webgpu + TSL material factory, tier presets         │
                 └──────────────┬─────────────────────────┬───────────────────────────┬─┘
                                │                         │                           │
                     web asset set (streamed)    PC HQ package (installed)   Android package (installed)
                     KTX2 1K–2K, LOD1–3          BC7 2K–4K, LOD0–2           ASTC 1K–2K, LOD1–3
```

- **Game core** (TypeScript, the same file for every tier): simulation, physics, AI, events, the save format and merge rules, and the **session snapshot** (section 7). Nothing here knows which tier it runs in.
- **Renderer**: one renderer (the WebGPU/TSL migration Apex is already planned for) with a **tier preset** (`web-low`, `web`, `native-mobile`, `native-pc`, `native-pc-ultra`) that sets resolution, LODs, cascades, effects and view distance. Presets are data. The dynamic-resolution governor still runs on top.
- **Assets**: built by the asset pipeline into three sets from the same sources, each with the same logical names. The game asks for `city/tower_07` and the loader picks the best available variant: installed package first, then the web set. A half-installed package mixes the two. This is what makes play-while-downloading work.
- **Build output per game**: `web/` (JS bundle + web asset set, deployed to the site as today) and `packages/<platform>/` (the same JS bundle + that platform's asset set, chunked and signed, section 5).

---

## 4. The native runtime: options and recommendation

| | A. WebView native runtime (recommended now) | B. Native renderer on `plajah-core` (wgpu) | C. Third-party engine (Unreal 5 / Godot 4) |
|---|---|---|---|
| What | The same game JS runs in WebView2 (PC) / Android WebView, loaded from the installed package under a local virtual host, on WebGPU (Dawn → D3D12 / Vulkan), with HQ assets on local disk and native services beside it | Game core compiled or bridged to Rust; rendering through wgpu natively (D3D12/Vulkan), WGSL shaders shared with the web | Each game rebuilt in the engine; web tier stays three.js |
| Codebase | one (web = native) | one shader language, but the scene/renderer layer is rewritten in Rust; game logic stays TS (bridged) or moves to Rust | two per game |
| Visual ceiling | WebGPU's feature set: compute, indirect draws, timestamp queries, f16, subgroups (as Chromium exposes them); no hardware ray tracing or mesh shaders | native wgpu features: bindless (binding arrays), ray queries and mesh shaders as wgpu ships them, multi-queue | highest (Unreal: Lumen GI, Nanite, hardware ray tracing) |
| CPU cost | JS on V8 (with WASM SIMD + workers for physics/sim) | native | native |
| Time to first result | weeks (shell + packages + presets) | many months | many months per game |
| Handoff | trivial (same code, same save format, same snapshot) | needs a shared snapshot format (doable) | hardest (two implementations must agree) |
| Risks | Android WebView WebGPU coverage varies by device and WebView version; JS GC pauses | big engineering effort; small team | licence terms (Unreal 5 % royalty past $1M), multi-GB engine, art pipeline per engine, the web tier diverges |

**Recommendation:**
- **Ship option A first** for every game. It gives the package system, the handoff and a big visual jump, because the jump comes mostly from assets, resolution and effect budgets. Those are exactly what the browser can't download or afford, and the installed package removes those limits.
- **Native services beside the WebView:** audio through the existing native audio bridge, controller and force feedback, file streaming straight from disk through the virtual host, and power/thermal QoS (`PowerQos.cs`).
- **Grow toward option B:** keep shaders in TSL/WGSL and the core free of DOM. Then the native PC renderer can later move to `plajah-core` (wgpu) piece by piece, once a game hits WebGPU's ceiling (ray-traced reflections, mesh-shader terrain, bindless city).
- **Option C (Unreal) only for a specific flagship** if B proves too slow and the royalty is acceptable. Never for the platform in general.

---

## 5. The package system

### 5.1 Manifest
Each release of a game, per platform, has a signed manifest:

```json
{
  "gameId": "apex-elohim", "platform": "win-x64" , "tier": "native-pc", "version": "1.4.0", "build": 214,
  "minApp": "1.0.110.0", "requires": { "webgpu": true, "vramGb": 6, "diskGb": 38 },
  "groups": [
    { "id": "core",       "required": true,  "chunks": ["sha256:…", "…"], "bytes": 3221225472 },
    { "id": "region:ironport", "bounds": [2500, -4600, 8256, 4608], "chunks": ["…"] },
    { "id": "region:superior-range", "bounds": [-8256, -9000, -3300, -500], "chunks": ["…"] },
    { "id": "cars-hq", "chunks": ["…"] }
  ],
  "files": { "js/region.js": "sha256:…@0+812345", "tex/city/tower_07.bc7.ktx2": "sha256:…@812345+4194304" },
  "signature": "ed25519:…"
}
```

- **Chunks** are 32–64 MB, content-addressed (the name is the SHA-256), and each holds many files. `files` maps a logical path to `chunk@offset+length`.
- **Groups:** `core` is the minimum to play. Region and car groups download in priority order, with the region the player is in or driving toward first. That's why the manifest carries bounds.
- **Delta updates:** a new version reuses every chunk whose hash didn't change, so only new chunks download. The pipeline keeps chunking stable (assets sorted by path and grouped by folder), so a small art change touches few chunks.
- **Versioning:** `version` for humans, `build` monotonic. The app keeps the previous version until the new one is complete and verified, then swaps atomically (a `current` pointer), so a failed update never breaks the install.

### 5.2 Downloader (one for models and games)
Generalise `NativeLlmService.FetchAsync` into a shared **`PackageDownloader`** service in the WinUI app. Models move onto it too:
- A queue of jobs (model files, game groups) with priorities, pause/resume and cancel. 2–4 parallel chunk downloads with HTTP Range resume (the `.part` pattern that already works).
- SHA-256 verified per chunk before it is accepted, and Ed25519 signature check on the manifest.
- Bandwidth limit (default: no limit while not playing, capped while a game is running so play isn't hurt), and pause on metered connections.
- Progress events over the existing WebView2 message bridge (`PKG_PROGRESS`, `PKG_STATE`), the same style as `LOCAL_LLM_DOWNLOAD_PROGRESS`.
- Storage at `%LOCALAPPDATA%\Plajah\Games\<gameId>\<build>\`, or a drive the user picks (like `D:\Plajah Models`). A disk-space check comes before starting.

**Android:** a new `PackageDownloadWorker` on WorkManager (a foreground service with a notification for big jobs; Wi-Fi only by default) writing into app-specific external storage (`getExternalFilesDir("games")`). A Capacitor plugin (`PlajahPackages`) exposes the same messages to the web layer, and the Compose shell calls the same worker.

**Browser:** no package. It can optionally keep a cache of web assets in OPFS ("faster loading next time"), never the HQ set.

### 5.3 Hosting
- Packages are served from zero- or low-egress storage behind a CDN: Backblaze B2 + Bunny/Cloudflare (the Plajah Drive B2 + Bunny engine already exists) or Cloudflare R2. Never Firebase Storage: a 30 GB package downloaded 10,000 times is 300 TB.
- Manifests are small and can live on Firebase Hosting or the CDN.
- First-party free games can use public chunk URLs (they are signed and hash-checked anyway). Paid games get short-lived signed URLs after an entitlement check, as in the Plajah Play plan.

---

## 6. Play while downloading

1. The player opens the game in the app: the **web version starts at once** (from the site, or from the app's local `wwwroot` copy of the web bundle).
2. If the device qualifies (GPU and WebGPU check from `WindowsAccelerationService` diagnostics, VRAM, free disk), the game page offers **"Install HQ version (38 GB)"**. Nothing downloads by default.
3. While it downloads, the web game keeps running. The download runs at background priority and throttles itself while a game is running. The `core` group comes first, then the region the player is in.
4. As groups finish, the running web game can already pick up HQ assets for those areas without a restart: the asset loader checks the package index first. This needs the game running inside the app, since the browser can't read the package.
5. When `core` and the current region are verified, the app shows **"HQ version ready: switch now"**. Switching is the handoff below. Remaining regions keep downloading in the native tier.

---

## 7. The handoff: the app continues exactly where the browser was

Two kinds of state:

| State | Changes | Where it lives | Today |
|---|---|---|---|
| **Progress** (garage, cars, credits, XP, festival progress, unlocks) | on events | `gameSaves` (rev-checked, merge by game rules) | built |
| **Session** (where you are and what you're doing: position, heading, speed, car, mode, current event and its checkpoint, time of day, weather, radio station) | continuously | **new**: a session snapshot | to build |

**Same device (browser tab or web tier in the app → native tier on the same PC or phone):**
1. The web game writes a session snapshot (≤ 8 KB JSON, produced by the game core) when asked or when the tab is hidden.
2. The app asks the running game for a snapshot (`plajah.session.snapshot` over the existing postMessage bridge). It starts the native tier with the snapshot passed in, and closes the web tier only when the native one reports `ready`. No network round-trip; the switch takes as long as the native tier's loading screen.
3. If the browser tab is a separate window (a real browser, not the app), the app uses the cross-device path below.

**Across devices (laptop browser → PC app, phone browser → Android app, and back):**
1. While playing, the game core writes the snapshot to a new collection, `gameSessions/{uid}_{gameId}`: `{ sessionId, device, tier, rev, snapshot, updatedAt }`. Writes happen every 10 s while moving, on pause, on tab hide and on quit. The rules mirror `gameSaves` (owner only, size cap, rev up by one) with their own rate limit. Progress stays in `gameSaves`.
2. Opening the game anywhere reads the latest session. If it is under 15 minutes old, the game offers **"Continue where you left off (Ironport, Kettle Pass hill climb, checkpoint 3)"** and spawns there with the same car, weather and time.
3. **One active session at a time:** the snapshot carries a lease (`sessionId` + `leaseUntil`, renewed with each write). A new device taking over sets its own `sessionId`. The old one sees the change on its next write and pauses with "Continued on another device", so two copies never race the same save.
4. A short-lived **handoff token** (60 s, issued by the server, single use) lets the app open straight into the session from a "Continue in the app" button in the browser. It's a deep link: `plajah://game/apex-elohim?handoff=…`. The app reads the session the token points to, without a sign-in prompt, as long as the app is signed in to the same account.

Because both tiers run the same game core (option A), the snapshot is just the core's state. No translation layer, and nothing to drift out of sync.

---

## 8. Store and install UX in the apps

- **Game page:** "Play" (always; the web version) and, on capable devices, "Install HQ". The Install HQ card shows size, free disk, the GPU it found and the expected quality ("1440p, 60 fps, Ultra"). Devices that don't qualify see why ("needs 6 GB of graphics memory").
- **Library** (one place for AI models and games, built on the `localModelInstaller` UI): installed items, size on disk, version, update available, location (move to another drive), pause/resume, uninstall, auto-update on/off, Wi-Fi only (Android).
- **In-game:** a small download chip ("HQ 62 %") on the pause menu; the "switch now" prompt when ready; a settings toggle to force the web tier (for comparisons and testing).
- **Notifications:** download complete; update available. These use the existing notification system.
- **Defaults:** never download without the user asking. Pause while on battery below 20 % (PC) or not on Wi-Fi (Android), unless the user says otherwise.

---

## 9. Security

- **Signed manifests** (Ed25519, with Plajah's release key held by CI, not on developer machines). The app has the public key built in and refuses unsigned or mis-signed manifests.
- **Per-chunk SHA-256**, checked on download and again cheaply at launch (size + a sample of chunk hashes; full check after updates or on demand).
- **Packages are data plus the game's JS bundle, never native executables** (option A). The JS runs in the same WebView sandbox as the site, under the package's own virtual host (`games.plajah.local/<gameId>/`), so a package can't reach the file system or the native bridge beyond what the bridge already allows the site. Native bridge calls stay on the existing allow-list.
- **Atomic install and rollback:** verify fully before switching `current`; keep one previous version.
- **Paid content:** entitlement-checked signed URLs, short expiry. First-party free games need no entitlement.
- **Saves:** unchanged rules (owner only, rev-checked). The session collection gets the same, plus a rate limit and size cap.

---

## 10. Build order

1. **Renderer tiers, Era Clash first, then Apex:** tier presets (`web`, `native-pc`, `native-mobile`) and the asset-variant loader (package index first, web set second). For Apex this rides on the WebGPU/TSL migration.
2. **Asset pipeline outputs three sets** (KTX2 web, BC7 PC, ASTC Android) with LODs, plus the chunker and signed manifest writer (CI).
3. **`PackageDownloader` in the WinUI app** (moving the model downloads onto it), the Library UI and the Install HQ card. Local virtual host for installed games.
4. **Session snapshots:** game-core snapshot API, same-device handoff, then `gameSessions` + lease + "Continue where you left off".
5. **Android:** WorkManager downloader + Capacitor plugin; check WebView WebGPU coverage on target devices, with WebGL2 + ASTC as the fallback.
6. **Native-only effects for the PC tier** (volumetrics, full-res GTAO, 4-cascade shadows, SSR) and the measurement harness: frame time per preset on Arc, an RTX card and two Android phones.
7. **Later, if needed:** the `plajah-core` (wgpu) native renderer for PC (option B).

### Status (2026-11-21)
Built for Era Clash 3D (step 1 and the chunker/manifest part of step 2), uncommitted:
- `services/gamePackages/tiers.ts`: `pickTier()` picks `web` / `native-pc` / `native-mobile` plus quality, texture set and frame target. A package only applies on its own platform. Without a package the browser keeps exactly its old choices.
- `services/gamePackages/assetResolver.ts`: finds the installed package (`window.__plajahPackages[gameId].base` set by the shell, or `?pkg=` limited to `packages.plajah.local`, the Android asset host or the page's own origin). It then routes every request for a path the package holds to the package folder, through three's loading-manager URL modifier and `fetch`. Paths the package doesn't hold load from the web as before, so a half-installed package still plays.
- `services/gamePackages/manifest.ts`: manifest types, canonical JSON, Ed25519 sign/verify (WebCrypto), safety validation (no `..` paths, refs inside their chunks), `planInstall()` (core first, then the region the player is in, shared chunks fetched once, delta against chunks already on disk) and `installedIndex()`.
- `scripts/games/buildGamePackage.ts` plus `games/era-clash-3d/package.config.json`: stable chunking, manifest, optional signing (`PLAJAH_PKG_KEY`, `--genkey`), `--prev` update report, and `--install <dir>`, which unpacks exactly what the app's downloader must write. Era Clash v0.1.0 = the 2k Poly Haven surfaces it uses: 51 files, 11 chunks, 132 MB.
- Wired into `games/era-clash-3d/src/main.ts`. Headless Chrome check: the web run is unchanged (tier `web`, 0 package hits). With `?pkg=/pkg-dev/era-clash/` (a dev install in `public/pkg-dev/`, git-ignored), 45 surface textures load from the package.
- Tests: `npm run test:game-packages` (10 passing).

Next: the WinUI `PackageDownloader` and a virtual host `packages.plajah.local` mapped to the install root with `CoreWebView2HostResourceAccessKind.Allow` (the game page is on `plajah.com`, so cross-origin texture loads need it). The shell sets `window.__plajahPackages` in the game frame. Then the Install HQ card on the Era Clash game page, and more HQ content: hi-res cast GLBs and 4k hero surfaces in BC7.

---

## 11. Keeping packages small

The budgets above are acceptable (Kenne, 2026-11-21) but packages should be as small as we can make them:
- **Supercompressed GPU textures:** KTX2 with Zstandard on top of BC7/ASTC (often 30-50 % smaller than raw BC7); ETC1S/Basis for anything that survives it (ground detail, vegetation, props); 4K only for hero assets close to the camera.
- **Shared libraries, not copies:** textures, materials, vegetation and props shared between regions (and between games, through the Plajah asset library) are stored once per install; the manifest points several files at one chunk.
- **Procedural and generated on the device:** terrain detail, grass, rock scatter, road markings and decals generated at load from small data (height grid, masks, road lines) instead of shipped as meshes or baked textures.
- **Meshes:** meshopt or Draco compression; LOD chains generated at install time from LOD0 where quality allows.
- **Audio:** Opus, streamed music from Chora instead of bundled tracks.
- **Regions on demand:** only the core plus the region the player is in are required; other regions download as they drive toward them, and rarely visited regions can be evicted when disk is short.
- **HQ Lite:** a second package per platform (2K textures, no 4K heroes) for smaller disks, picked automatically when free space is low.

## 12. Decisions (Kenne, 2026-11-21)

1. **Native runtime: option A** (the same game code in the app's WebView with installed HQ packages and native services), growing toward the `plajah-core` wgpu renderer later.
2. **Hosting: Backblaze B2 + Bunny CDN** for game packages (designated by Kenne; the existing Plajah Drive B2 + Bunny engine).
3. **Disk budgets accepted** (~20-40 GB PC, ~6-12 GB Android for Apex), but make them smaller wherever possible (section 11).
4. **Android floor:** still open (suggested Android 12+, Snapdragon 7-series / Adreno 7xx or better).
5. **Cross-device continue: yes.** Add `gameSessions` (position and current event, ~10 s while playing) beside `gameSaves`, and "Continue in the app" deep-links from a desktop browser into the app.
6. **Install HQ is offered on the game page only.** No prompts.
7. **Order: Era Clash first, then Apex.** Era Clash (`public/games/era-clash`, 350 MB today) is the first game to get the tier presets, the package build, the Library install card and the handoff; Apex follows with the region packs.
