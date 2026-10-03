# Plajah — Master Changelog & Historical Ledger

A dated, timestamped, per-commit record of how the platform is built.

Every entry has **two** descriptions:
- **Technical** — what changed in the code (this file).
- **Plain-English** — what it enables for people, which feeds the public
  What's-New page (Help → What's New) and the in-app update notification.

The plain-English copy and major/minor classification live in
[`data/changelog.ts`](data/changelog.ts) — keep the two in sync. Add a new
entry (newest first) every time the codebase is updated.

Legend: **[MAJOR]** = new capability or big change · **[minor]** = fix/refinement.

---

## 2026-09-27

- **10:00** · `ambo-master-broadcast` · **[MAJOR]** · Ambo — *feat(ambo): master live broadcast engine, LED wall & auto-save*
  - Technical: Resolved ReferenceError initialization ordering for nextSlide in master broadcast; implemented auto-save loop, persistent workspace storage, File and Output menus, LED Wall modal entry point, and multi-display presentation rasterizer with NDI video routing support.
  - Plain: Ambo now features a bulletproof live presentation and broadcast command center with auto-save, LED wall output routing, and smooth slide transitions.

## 2026-09-25

- **14:30** · `academia-museion-overhaul` · **[MAJOR]** · Academia — *feat(academia): Plajah Museion rebrand & interactive worksheet engine*
  - Technical: Overhauled school landing pages with role-specific views (Teacher, Parent, Student) and true back navigation; rebranded scientific research and curriculum layer to Plajah Museion; integrated rich lesson worksheet digitization pipeline, CLASSROOM rooms with strict DM policies, and multi-language cartridges.
  - Plain: Plajah Academia and Museion are now fully integrated: schools get custom portal landing pages for students, parents, and teachers, alongside smart interactive worksheets that can be filled out and tutored right in the browser.

## 2026-09-22

- **16:15** · `vault-soundscape-radio` · **[minor]** · Archive Vault — *fix(vault): soundscape visualizer engine & radio presets*
  - Technical: Repaired soundscape visualizer rendering crash, added quick-tune radio presets, automated stream recovery for FAST channels, and connected public domain archival films directly to streaming media pipelines.
  - Plain: The Archive Vault now sports an ambient vocal soundscape visualizer and fast one-tap radio presets.

## 2026-09-20

- **12:00** · `sports-firstlight-3d` · **[MAJOR]** · Sports — *feat(sports): Project Firstlight 3D Passing Lab & personalized game day*
  - Technical: Integrated full 3D football passing simulation engine with real-time animated aurora shaders and Stitch design menu; added Project Firstlight memory archive, admin app launcher card, personalized game day schedules, and Pew Pew phone motion-sensor aiming engine.
  - Plain: Sports in Plajah enters 3D with Project Firstlight: an interactive passing lab with realistic physics and stadium shaders, paired with personalized game day dashboards.

## 2026-09-18

- **18:45** · `lighting-designer-lan` · **[MAJOR]** · Lighting — *feat(ld): zero-friction smart lighting: Govee, Nanoleaf & Razer Chroma*
  - Technical: Introduced Lighting Designer (LD) top-level experience; implemented zero-friction LAN auto-discovery via local UDP broadcast and HTTP APIs for Govee and Nanoleaf fixtures; integrated ldBridge creative mode and synchronized Razer Chroma hardware + on-screen visualizer pulses with LD lighting DMX output.
  - Plain: Lighting Designer turns your room into an intelligent stage: it automatically discovers your Govee and Nanoleaf smart lights over Wi-Fi with zero setup, and syncs your smart bulbs, light strips, and Razer Chroma gear to the music and visualizers playing on screen.

## 2026-09-16

- **15:20** · `chora-artist-glass` · **[MAJOR]** · Chora — *feat(chora): Personal Artist Pages with glass canvas & FLUX particle visualizers*
  - Technical: Redesigned ArtistModeLanding into an A1 Glass Canvas zero-scroll layout; deployed PersonalArtistPage for music locker artists with vibrant cyan color treatments, complete discography, events, and videos; rebuilt Gatefold album view with point-cloud particle visualizers (Porcelain Tile, Velvet Bloom, Prism Archive) powered by the 60fps FLUX visual engine.
  - Plain: Every creator in Chora now gets a dedicated Personal Artist Page with a frosted glass layout, complete music locker catalog, and a 3D Gatefold album view featuring luminous particle cloud visualizers.

## 2026-09-14

- **09:00** · `melos-music-lab-onda-kera` · **[MAJOR]** · Melos — *feat(melos): ONDA wavetable synth, KERA multisampler & Spectra mix-bus EQ*
  - Technical: Shipped full private generative music production workspace: ONDA wavetable synthesizer (Rust/WASM), KERA multisampler with deep zone map and SF2/SFZ soundfont parsers, Spectra mix-bus EQ and dynamics, Motion modulators with 7 shapes, hardware MIDI learn for Maschine/Kontrol, Windows VST3 plugin bridge, sample rights licensing model, and one-tap "→ Fabula" groove transfer.
  - Plain: Melos is Plajah's full-featured music production studio in your browser or desktop app: play expressive wavetable synths, load realistic instrument sample libraries, sculpt audio with mastering-grade EQs, and send your completed beats straight to video projects in Fabula.

## 2026-09-12

- **11:10** · `ora-wellbeing-suite` · **[MAJOR]** · Wellbeing — *feat(ora): Ora Wellbeing Suite: Rest, daily rhythms & mindful journals*
  - Technical: Integrated the complete Ora wellbeing platform: persistent daily rhythms, guided breathwork, voice-driven journal nudges, expanded interactive orb interface, mindful notes, and ambient soundscapes seamlessly accessible from the primary sidebar.
  - Plain: Ora brings intentional wellness and focus directly into Plajah: track daily rhythms, log private voice journals with gentle AI nudges, and practice breathwork with the glowing Ora orb.

## 2026-09-10

- **17:30** · `fabula-forge-fx-sam` · **[MAJOR]** · Fabula — *feat(fabula): Forge FX Suite: 175 GPU effects, Beat Reactor, SAM mattes & Runway AI*
  - Technical: Architected the Forge FX real-time GPU suite with 175 effects and 49 transitions; built Beat Reactor audio-reactive visual parameters, VectorTrack planar tracker, PowerMesh warp, Depth Anything V2 depth mattes, client-side SAM (Segment Anything Model) object segmentation, OpenFX plugin generator, and direct Runway Gen AI plugin panel integration.
  - Plain: Fabula now rivals Hollywood editing suites: apply over 175 real-time effects, track objects across moving video shots, isolate subjects with AI rotoscoping without uploading to servers, pulse visuals in sync with your soundtrack, and generate AI footage via Runway right from your timeline.

## 2026-09-07

- **06:00** · `fabula-local-first` · **[MAJOR]** · Fabula — *feat(fabula): disk-first media playback & conform engine*
  - Technical: File System Access handles, watch folders, JKL shuttle, background conforming, lightweight proxies, and "Switch to Local" master toggle.
  - Plain: Fabula now edits your videos, music, and photos straight from the files on your computer instead of streaming from the cloud.

## 2026-08-30

- **14:00** · `terra-civic-place-layer` · **[MAJOR]** · Terra — *feat(terra): Detroit civic places, zoning envelopes & automated listing films*
  - Technical: Launched Terra civic and real estate platform: parcel studio, zoning envelope generator, property passports, Open Listing Record (OLR) integration, compliance checks, and automated AI Listing Film generation from speech-transcribed property walkthroughs with room detection.
  - Plain: Terra connects physical places and real estate to Plajah: explore Detroit parcel zoning in 3D, inspect verified property passports, and turn a smartphone video walkthrough into an edited, room-by-room listing film automatically.

## 2026-08-25

- **13:00** · `business-pos-in-store-live` · **[MAJOR]** · Business — *feat(business): POS Register, staff time-clock & In-Store Live broadcast*
  - Technical: Built full in-person retail suite: POS Register with cash and card sales on the direct Stripe Connect order spine, receipt printer hardware support (QZ Tray / ESC-POS), cash drawer kicks, customer loyalty auto-recognition via QR/phone, Staff/HR module with PIN time-clocks and payroll export, and In-Store Live broadcasting the store's current music pulse and tip/buy actions.
  - Plain: Plajah for Business powers physical shops and venues: run a fast touchscreen POS register with receipt printing, manage employee shifts with PIN punch-in, and broadcast what's currently playing in-store.

## 2026-08-20

- **16:00** · `fast-wallclock-epg` · **[MAJOR]** · Live TV — *feat(fast): Wall-Clock Playout, rolling channel dial & EPG guide*
  - Technical: Re-engineered FAST playout engine to be strictly wall-clock epoch-anchored: eliminated ad-break looping, added rolling channel dial surface, per-program time-block EPG guide, terrestrial join-in-progress, and automatic branded bumper/ident insertion.
  - Plain: Live TV+ now behaves like true broadcast cable television with real-time 24/7 schedules and a rolling channel dial.

## 2026-08-15

- **10:30** · `audius-native-parity` · **[minor]** · Music — *feat(audius): library import, native album view & algorithmic up-next radio*
  - Technical: Single tracks open the native Plajah album view unlocking Pixels visualizers and DJ mode, full OML attribution, Audius OAuth login with one-click library import, and native-first algorithmic up-next radio queue.
  - Plain: Log in with your Audius account to import your favorite music into Plajah and experience Audius tracks in full 3D Gatefold album view with audio visualizers.

## 2026-08-12

- **11:00** · `windows-native-pro-stack` · **[MAJOR]** · Windows — *feat(windows): WinUI 3 shell, Hello biometrics & NDI video switcher*
  - Technical: Engineered native Windows acceleration layer: WinUI 3 desktop shell (Plajah.WinUI), Windows Hello biometric authentication service, Windows Ink pen support, native VST3 audio plugin hosting, and pro-grade NDI video input/output routing for live multi-camera switchers.
  - Plain: Plajah on Windows is now an ultra-fast native desktop application with biometric sign-in, stylus support, VST3 audio plugins, and NDI broadcast routing.

## 2026-07-01

- **15:29** · `7a0545e` · **[minor]** · Studio — *feat(media-engine): native bridge + build blueprint*
  - Technical: `mediaEngine/bridge.ts` (Tauri/native invoke contract — capabilities/list_sources/connect/route/program/sync, no-op in browser), `NativeSource` + `refreshNativeSources` mirrors, `NATIVE_MEDIA_ENGINE.md` build plan.
  - Plain: Groundwork so the Router/Switcher can drive real capture cards & NDI once the desktop app exists.

- **15:22** · `195cffe` · **[minor]** · Sharing — *feat(share): film (Taleo) deep-linking + rich previews*
  - Technical: `archive` share type + `fetchArchiveVideoById` + `?type=archive` boot + server OG from archive.org metadata; wired the movie Share button.
  - Plain: Films now deep-link and preview like everything else.

- **15:13** · `8e1f99f` · **[minor]** · Sharing — *fix(share): X preview "can't be reached" + iframes*
  - Technical: X → `summary_large_image` (dropped the flaky player card); `/embed` framable (no X-Frame-Options, CSP frame-ancestors) + Mux→HLS; `publicHost()` uses X-Forwarded-Host (plajah.com not run.app).
  - Plain: X link previews and cross-site embeds work now.

- **14:49** · `dbdec1e` · **[minor]** · Sharing — *fix(share): strip static generic OG tags before injecting asset-specific ones*
  - Technical: index.html ships default og tags that appear first; crawlers pick the first duplicate. Strip existing og:*/twitter:* before injecting.
  - Plain: Fixes previews still showing the generic Plajah card even after the asset tags were added.

- **14:48** · `e6e5ee4` · **[MAJOR]** · Studio — *feat(media-engine): Plajah Studio router + switcher foundation*
  - Technical: VideoSource abstraction + capability gating + WHEP/webcam sources + router (locks/salvos/tally) + PGM/PVW switcher + soft-sync TBC; `VideoRouterConsole` + `MEDIA_ROUTER` view. Native I/O = Tauri/GStreamer next.
  - Plain: The start of pro live production in Plajah — a video router & switcher for multi-camera streams (big for churches, schools, cultural institutions).

- **14:38** · `34e448a` · **[MAJOR]** · Sharing — *feat(share): rich link previews — artwork + "Experience \"Title\" now on Plajah"*
  - Technical: content share URLs route through `/share`; server injects asset OG/Twitter meta (title/desc/cover), humans bounce to the app. Covers video/song/album/book/article/game/post.
  - Plain: Shared links now show the real cover/thumbnail and a proper description instead of a generic Plajah card.

- **14:19** · `9e2d00e` · **[MAJOR]** · Health — *feat(health): per-user experience health + predictive self-healing*
  - Technical: `healthMonitor.ts` client perf telemetry → 0-100 score; self-heals stale-build/chunk failures (SW update + controlled reload); escalates major degradation to `errorReports`; per-user snapshot to `userHealth/{uid}`. `AdminUserHealth` panel + tab.
  - Plain: Plajah watches how well the app runs for each person, fixes small problems itself, and alerts the team to big ones.

- **14:11** · `3cf15d8` · **[minor]** · Admin — *fix(analytics): missing liveFeed rule made the Analytics page error*
  - Technical: `liveFeed` had no Firestore rule (default-deny) → failed the admin analytics `Promise.all`. Added the rule + `safe()` per-read guard.
  - Plain: The admin analytics dashboard that showed a permissions error now loads.

- **13:41** · `c7eb6eb` · **[MAJOR]** · Support — *feat(support): platform-wide bug reporting with auto-attached 5-min session trace*
  - Technical: `sessionTrace.ts` 5-min ring buffer (privacy-safe) + `reportBug()` → `errorReports`; global `BugReportButton`; `ErrorReportsPanel` renders the session trail.
  - Plain: A "Report a bug" button on every page auto-attaches a private log of the last 5 minutes so the team can reproduce it.

- **13:31** · `b65c632` · **[MAJOR]** · Platform — *feat(changelog): master ledger + public What's New + update notification; seed demo church*
  - Technical: `CHANGELOG.md` + `data/changelog.ts` (technical + plain-English, major/minor); `PlatformChangelog` page; `UpdateNotification` (major/minor columns); Elevate admin seed-demo-church.
  - Plain: A plain-English "What's New" page in Help + a per-release summary of new features and improvements.

- **12:40** · `c2876cc` · **[minor]** · Sharing — *fix(share): shared non-Reello videos open the full-screen PLAYER, not the browse grid*
  - Technical: Boot handler routes non-Reello videos to the `PLAYER` view (`VideoPlayer`) instead of the `VIDEOS` browse grid, which ignores `selectedVideo`.
  - Plain: Shared video links open that exact video full-screen, not the general videos page.

- **12:23** · `97fb17e` · **[MAJOR]** · Elevate — *feat(elevate): Plajah Elevate — directory for faith, cultural & nonprofit institutions*
  - Technical: New `PLAJAH_ELEVATE` view; directory over public Organizations grouped by `orgType` (CHURCH/CULTURAL/NONPROFIT); new `CULTURAL` type; `?elevate=1` deep link; single-equality org query.
  - Plain: A new home for churches, religious organizations, cultural institutions and nonprofits — discover, follow, and give.

- **12:07** · `737c2a9` · **[minor]** · Sharing — *fix(share): video deep links fetch the EXACT video by id (not the recent-50 feed)*
  - Technical: Added `fetchVideoById`; boot + RelloView fetch the exact video by id.
  - Plain: Shared links work for every video ever posted, not just recent ones.

- **11:58** · `dc28f8e` · **[minor]** · Sharing — *fix(share): stop signed-out visitors being bounced off deep links*
  - Technical: `hasDeepLink` guard on the signed-out auth branch so the listener no longer clobbers deep-link views to `LANDING`.
  - Plain: Opening a shared link while logged out no longer bounces you to the home page.

- **11:35** · `db0cb12` · **[minor]** · Sharing — *fix(share): route the last share buttons through the canonical builder + boot*
  - Technical: Remaining share buttons repointed to `buildShareUrl`; boot handlers for the last asset types.
  - Plain: Every share button now produces a correct direct link.

- **11:26** · `c2756a6` · **[MAJOR]** · Sharing — *feat(share): platform-wide direct deep-links*
  - Technical: Boot opens books/articles/games/events/debates/clubs/videos directly via typed `?type/&id` and path routes.
  - Plain: Share any content and the link takes people straight to it.

- **11:09** · `f89eccf` · **[minor]** · Teleprompter — *feat(teleprompter): TV Studio switcher source + Podcast Studio ad-read prompter*
  - Technical: TV Studio Prompter source (`TeleprompterCanvasSource` → `captureStream`); Podcast Studio slim ad-read prompter.
  - Plain: The switcher can show the teleprompter to talent; podcasters get a compact ad-read prompter.

- **10:55** · `2e68f58` · **[MAJOR]** · Teleprompter — *feat(teleprompter): add Teleprompter as a platform app*
  - Technical: Teleprompter engine under `components/teleprompter` + in-app shell + operator/talent BroadcastChannel sync + Apps card.
  - Plain: A full teleprompter is built into Plajah and powers teleprompting across the platform.

- **10:04** · `c5e94c8` · **[minor]** · Church — *feat(church): the four Part-3 finalizers*
- **05:06** · `b753a58` · **[minor]** · Church — *Part 3 Phase 4 — reach & learn (broadcast, Servant Keeper, classes)*
- **04:59** · `f9f5864` · **[MAJOR]** · Church — *Part 3 Phase 5 — multi-site master control (campus program feeds)*
- **04:50** · `79c866c` · **[MAJOR]** · Church — *Part 3 Phase 3 — Aria sermon → article → book pipeline*
- **04:41** · `c738dfe` · **[minor]** · Church — *fix(church): make Phase 2 giving airtight — fund routing + live totals*
- **04:20** · `39a5a3d` · **[MAJOR]** · Church — *Part 3 Phase 2 — native Stripe giving (funds + QR + recurring)*
- **03:49** · `f98fa76` · **[MAJOR]** · Church — *Part 3 Phase 1 — church account, ministries, service times, demo church*
- **03:05** · `42b9577` · **[minor]** · Organizations — *Part 2 slices 3-5 — org management, "operate as", legacy migration*
- **02:45** · `26779ec` · **[minor]** · Organizations — *Part 2 slice 2 — org create flow + profile page*
- **02:36** · `7c9cd5b` · **[MAJOR]** · Organizations — *Part 2 slice 1 — the Organization primitive*
- **02:30** · `9117037` · **[minor]** · Accounts — *Part 1 slice 3 — consolidate duplicated profile fields*
