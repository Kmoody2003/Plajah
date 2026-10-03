// changelog.ts — the platform's historical ledger.
//
// ONE source of truth for every shipped change. Each entry carries BOTH a
// technical description (for the engineering ledger / CHANGELOG.md) and a
// plain-English "what it enables" line (for the public What's-New page and the
// in-app update notification). `level` splits major vs minor so the update
// notification can column them.
//
// Convention: append a new entry (newest first) every time the codebase is
// updated. Keep `plain` jargon-free — it is what users read.

export type ChangeLevel = 'major' | 'minor';

export interface ChangelogEntry {
  /** Short commit hash — links the plain-English change back to the code. */
  id: string;
  /** 'YYYY-MM-DD' */
  date: string;
  /** 'HH:MM' 24h local */
  time: string;
  level: ChangeLevel;
  /** Product area, e.g. 'Sharing', 'Elevate', 'Church'. */
  area: string;
  /** Short plain-English headline (shown in lists). */
  title: string;
  /** Engineering-facing description of the change. */
  technical: string;
  /** Plain-English: what this enables for a person using Plajah. */
  plain: string;
}

/**
 * The ledger — newest first. `APP_BUILD` is a human-readable release tag kept for
 * the What's-New page header; it is NO LONGER what drives the update notification.
 * The notification now keys off the newest ENTRY id below (see LATEST_ENTRY_ID /
 * entriesSince), so it can only ever fire when a genuinely new entry is prepended —
 * never on a redeploy that shipped no user-facing changelog line.
 */
export const APP_VERSION = '1.0.40';
export const APP_BUILD = '2026.09.27-01';

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: 'ambo-master-broadcast', date: '2026-09-27', time: '10:00', level: 'major', area: 'Ambo',
    title: 'Master live broadcast engine with LED Wall and auto-save',
    technical: 'Resolved ReferenceError initialization ordering for nextSlide in master broadcast; implemented background auto-save loop, persistent workspace storage, File and Output menus, dedicated LED Wall modal entry point, and multi-display presentation rasterizer with NDI video routing support.',
    plain: 'Ambo now features a bulletproof live presentation and broadcast command center: your presentations auto-save in the background, multi-screen LED walls can be targeted directly from the Output menu, and broadcast slides advance seamlessly without presentation freezes.',
  },
  {
    id: 'academia-museion-overhaul', date: '2026-09-25', time: '14:30', level: 'major', area: 'Academia',
    title: 'Rebranded Plajah Museion with school portals and interactive worksheets',
    technical: 'Overhauled school landing pages with role-specific views (Teacher, Parent, Student) and true back navigation; rebranded scientific research and curriculum layer to Plajah Museion; integrated rich lesson worksheet digitization pipeline (digitize, assign, fill, and AI-tutor), CLASSROOM rooms with strict DM policies, and multi-language cartridges.',
    plain: 'Plajah Academia and Museion are now fully integrated: schools get custom portal landing pages for students, parents, and teachers, alongside smart interactive worksheets that can be filled out and tutored right in the browser.',
  },
  {
    id: 'vault-soundscape-radio', date: '2026-09-22', time: '16:15', level: 'minor', area: 'Archive Vault',
    title: 'Vocal soundscape visualizer engine and radio presets',
    technical: 'Repaired soundscape visualizer rendering crash, added quick-tune radio presets, automated stream recovery for FAST channels, and connected public domain archival films directly to streaming media pipelines.',
    plain: 'The Archive Vault now sports an ambient vocal soundscape visualizer and fast one-tap radio presets, keeping archival video and music playback uninterrupted.',
  },
  {
    id: 'sports-firstlight-3d', date: '2026-09-20', time: '12:00', level: 'major', area: 'Sports',
    title: 'Project Firstlight 3D Passing Lab and personalized game days',
    technical: 'Integrated full 3D football passing simulation engine with real-time animated aurora shaders and Stitch design menu; added Project Firstlight memory archive, admin app launcher card, personalized game day schedules, and Pew Pew phone motion-sensor aiming engine.',
    plain: 'Sports in Plajah enters 3D with Project Firstlight: an interactive passing lab with realistic physics and stadium shaders, paired with personalized game day dashboards and motion-controlled mobile games.',
  },
  {
    id: 'lighting-designer-lan', date: '2026-09-18', time: '18:45', level: 'major', area: 'Lighting',
    title: 'Zero-friction smart lighting: Govee, Nanoleaf & Razer Chroma',
    technical: 'Introduced Lighting Designer (LD) top-level experience; implemented zero-friction LAN auto-discovery via local UDP broadcast and HTTP APIs for Govee and Nanoleaf fixtures; integrated ldBridge creative mode and synchronized Razer Chroma hardware + on-screen visualizer pulses with LD lighting DMX output.',
    plain: 'Lighting Designer turns your room into an intelligent stage: it automatically discovers your Govee and Nanoleaf smart lights over Wi-Fi with zero setup, and syncs your smart bulbs, light strips, and Razer Chroma gear to the music and visualizers playing on screen.',
  },
  {
    id: 'chora-artist-glass', date: '2026-09-16', time: '15:20', level: 'major', area: 'Chora',
    title: 'Personal Artist Pages with glass canvas and FLUX particle visualizers',
    technical: 'Redesigned ArtistModeLanding into an A1 Glass Canvas zero-scroll layout; deployed PersonalArtistPage for music locker artists with vibrant cyan color treatments, complete discography, events, and videos; rebuilt Gatefold album view with point-cloud particle visualizers (Porcelain Tile, Velvet Bloom, Prism Archive) powered by the 60fps FLUX visual engine.',
    plain: 'Every creator in Chora now gets a dedicated Personal Artist Page with a frosted glass layout, complete music locker catalog, and a 3D Gatefold album view featuring luminous particle cloud visualizers that react to every note.',
  },
  {
    id: 'melos-music-lab-onda-kera', date: '2026-09-14', time: '09:00', level: 'major', area: 'Melos',
    title: 'Melos DAW: ONDA synth, KERA multisampler, Spectra EQ & VST3 hosting',
    technical: 'Shipped full private generative music production workspace: ONDA wavetable synthesizer (Rust/WASM), KERA multisampler with deep zone map and SF2/SFZ soundfont parsers, Spectra mix-bus EQ and dynamics, Motion modulators with 7 shapes, hardware MIDI learn for Maschine/Kontrol, Windows VST3 plugin bridge, sample rights licensing model, and one-tap "→ Fabula" groove transfer.',
    plain: 'Melos is Plajah\'s full-featured music production studio in your browser or desktop app: play expressive wavetable synths, load realistic instrument sample libraries, sculpt audio with mastering-grade EQs, plug in your MIDI keyboard, and send your completed beats straight to video projects in Fabula.',
  },
  {
    id: 'ora-wellbeing-suite', date: '2026-09-12', time: '11:10', level: 'major', area: 'Wellbeing',
    title: 'Ora Wellbeing Suite: Rest, daily rhythms, and mindful journals',
    technical: 'Integrated the complete Ora wellbeing platform: persistent daily rhythms, guided breathwork, voice-driven journal nudges, expanded interactive orb interface, mindful notes, and ambient soundscapes seamlessly accessible from the primary sidebar.',
    plain: 'Ora brings intentional wellness and focus directly into Plajah: track daily rhythms, log private voice journals with gentle AI nudges, practice breathwork with the glowing Ora orb, and tune in to calming soundscapes while you work.',
  },
  {
    id: 'fabula-forge-fx-sam', date: '2026-09-10', time: '17:30', level: 'major', area: 'Fabula',
    title: 'Forge FX Suite: 175 GPU effects, Beat Reactor, SAM mattes & Runway AI',
    technical: 'Architected the Forge FX real-time GPU suite with 175 effects and 49 transitions; built Beat Reactor audio-reactive visual parameters, VectorTrack planar tracker, PowerMesh warp, Depth Anything V2 depth mattes, client-side SAM (Segment Anything Model) object segmentation, OpenFX plugin generator, and direct Runway Gen AI plugin panel integration.',
    plain: 'Fabula now rivals Hollywood editing suites: apply over 175 real-time effects, track objects across moving video shots, isolate subjects with AI rotoscoping without uploading to servers, pulse visuals in sync with your soundtrack, and generate AI footage via Runway right from your timeline.',
  },
  {
    id: 'terra-civic-place-layer', date: '2026-08-30', time: '14:00', level: 'major', area: 'Terra',
    title: 'Terra: Detroit real-estate, civic places, and automated listing films',
    technical: 'Launched Terra civic and real estate platform: parcel studio, zoning envelope generator, property passports, Open Listing Record (OLR) integration, compliance checks, and automated AI Listing Film generation from speech-transcribed property walkthroughs with room detection.',
    plain: 'Terra connects physical places and real estate to Plajah: explore Detroit parcel zoning in 3D, inspect verified property passports, and turn a smartphone video walkthrough into an edited, room-by-room listing film automatically.',
  },
  {
    id: 'business-pos-in-store-live', date: '2026-08-25', time: '13:00', level: 'major', area: 'Business',
    title: 'Plajah Business: POS Register, staff time-clock & In-Store Live broadcast',
    technical: 'Built full in-person retail suite: POS Register with cash and card sales on the direct Stripe Connect order spine, receipt printer hardware support (QZ Tray / ESC-POS), cash drawer kicks, customer loyalty auto-recognition via QR/phone, Staff/HR module with PIN time-clocks and payroll export, and In-Store Live broadcasting the store\'s current music pulse and tip/buy actions.',
    plain: 'Plajah for Business powers physical shops and venues: run a fast touchscreen POS register with receipt printing, manage employee shifts with PIN punch-in, and broadcast what\'s currently playing in-store so shoppers can tip creators, discover tracks, and order from their phones.',
  },
  {
    id: 'fast-wallclock-epg', date: '2026-08-20', time: '16:00', level: 'major', area: 'Live TV',
    title: 'Live TV+ Wall-Clock Playout, rolling channel dial & EPG guide',
    technical: 'Re-engineered FAST playout engine to be strictly wall-clock epoch-anchored: eliminated ad-break looping, added rolling channel dial surface (Samsung TV Plus style), per-program time-block EPG guide, terrestrial join-in-progress, and automatic branded bumper/ident insertion.',
    plain: 'Live TV+ now behaves like true broadcast cable television: channels stay on real-time wall-clock time, flipping channels feels instant with a rolling channel dial, and a live TV guide shows what\'s airing now and up next 24 hours a day.',
  },
  {
    id: 'audius-native-parity', date: '2026-08-15', time: '10:30', level: 'minor', area: 'Music',
    title: 'Audius library import, native album view & algorithmic up-next radio',
    technical: 'Completed Audius Phases 2 through 4: single tracks open the native Plajah album view unlocking Pixels visualizers and DJ mode, full OML attribution, Audius OAuth login with one-click library import, and native-first algorithmic up-next radio queue.',
    plain: 'Log in with your Audius account to import your favorite music into Plajah, experience Audius tracks in full 3D Gatefold album view with audio visualizers, and let smart up-next radio keep the music playing automatically.',
  },
  {
    id: 'windows-native-pro-stack', date: '2026-08-12', time: '11:00', level: 'major', area: 'Windows',
    title: 'Windows Native Pro Studio: WinUI 3 shell, Hello biometrics & NDI video',
    technical: 'Engineered native Windows acceleration layer: WinUI 3 desktop shell (Plajah.WinUI), Windows Hello biometric authentication service, Windows Ink pen support, native VST3 audio plugin hosting, and pro-grade NDI video input/output routing for live multi-camera switchers.',
    plain: 'Plajah on Windows is now an ultra-fast native desktop application: unlock instantly with Windows Hello facial recognition or fingerprint, draw with stylus ink, load native VST3 instrument plugins, and broadcast multi-camera video feeds using broadcast-standard NDI.',
  },
  {
    id: 'fabula-local-first', date: '2026-09-07', time: '06:00', level: 'major', area: 'Fabula',
    title: 'Fabula plays your media straight off your drive',
    technical: 'Reworked Fabula media playback to be disk-first like a native NLE. resolveMediaSource reads original files through persisted File System Access handles (watch folders + a new showOpenFilePicker single-file import that stores per-asset handles), ahead of any cache/cloud; a first-play/scrub gesture re-grants folder permission automatically (ensureDiskAccess). Background conforming (byte-prefetch + proxy encodes) now suspends during playback/scrub so it never competes; the whole timeline conforms to local when idle. Added lightweight AAC audio + WebP picture proxies alongside the 540p video proxy (preview uses them, export always uses originals). "Switch to Local" master toggle blocks cloud entirely; "Sync to Local" is an explicit opt-in download. Proxies-off now falls back to a local proxy instead of streaming. Real JKL shuttle. Blue local-glow on clips reading from disk.',
    plain: 'Fabula now edits your videos, music and photos straight from the files on your computer — like Premiere or DaVinci Resolve — instead of streaming them from the cloud. That means far smoother playback and scrubbing, no more clips going black or buffering on a bad connection, and nothing gets downloaded by default. Clips playing from your drive glow blue, J/K/L shuttle works, and there\'s a one-tap "Local only" mode.',
  },
  {
    id: 'chora-music-locker', date: '2026-09-07', time: '05:30', level: 'minor', area: 'Chora',
    title: 'Your Music Locker, all in one place',
    technical: 'Restructured Chora My Library into a single-scroll "Music Locker": dropped the tab bar and the public "Saved Music" section; private uploaded music, playlists and Local Sync now stack in one page. Renamed the view; Local Sync loads on mount.',
    plain: 'Your private Music Locker in Chora is now one clean scrolling page — your uploaded music, your playlists and your offline downloads together, without hunting through tabs.',
  },
  {
    id: 'melos-midi-track', date: '2026-09-07', time: '05:45', level: 'minor', area: 'Melos',
    title: 'Add instruments as MEKA pads or their own MIDI tracks',
    technical: 'Melos timeline "Add instrument" now opens a destination menu: a MEKA pad (existing) or an independent clip-driven MIDI track with its own mixer strip. Independent tracks get a right-click "Send to MEKA + Glass" that links them to a pad without making them pad-owned, so they\'re both clip-drawable and step-sequenceable.',
    plain: 'When you add an instrument in Melos you can now choose to put it on a MEKA pad or give it its own MIDI track that works just like an audio track. You can also send a MIDI track to MEKA and the Glass step sequencer whenever you want.',
  },
  {
    id: 'tv-quiet-updates', date: '2026-08-26', time: '18:10', level: 'minor', area: 'Platform',
    title: 'Updates never interrupt you anymore',
    technical: 'Removed both auto-reload paths from the service-worker update flow (index.tsx onNeedRefresh): the unconditional TV/native reload and the "silently reload within 10s of load" desktop path. Desktop now always shows a non-intrusive prompt with Reload / Later (snooze); TV & native apply the waiting update on the next visibilitychange→hidden (off-screen), so it lands without interrupting playback. The update prompt now sources its notes from this single changelog ledger instead of a separate, stale list.',
    plain: 'Platform updates no longer refresh the page on their own or pull you out of what you\'re watching. On desktop you\'ll see a small "new version ready" note with Reload and Later — update whenever you\'re ready. On TV it quietly applies the next time you leave the app, so it\'s just there when you come back.',
  },
  {
    id: 'tv-remote-fluidity', date: '2026-08-26', time: '18:00', level: 'minor', area: 'TV',
    title: 'A faster, calmer TV experience',
    technical: 'TV focus unified on one GPU-composited orange ring (index.css) — [data-tv-focusable] was out-specified to the legacy blue, so focus changed colour by element type; only transform animates now and the 50px focus blur is cut to 20px. Removed the redundant BIG_SCREEN linear key-walker on TV (a third navigator running a full-document querySelectorAll every arrow press). Fullscreen exit made reliable on Taleo (Fullscreen-API button dropped on TV; capture-phase Back/Esc/hardware-back → exit) and Reello (own Back handler + data-tv-no-trap). SmartGuide tips no longer mount on TV.',
    plain: 'Moving around on the TV with the remote is quicker and smoother, and the focus highlight is one consistent colour. Going fullscreen on films, videos and Live TV+ now reliably closes with the Back button, and the on-screen tips no longer pop up over the content where a remote can\'t dismiss them.',
  },
  {
    id: '4e48dc5', date: '2026-07-27', time: '03:15', level: 'major', area: 'Live',
    title: 'Bring guests on stage in your live stream',
    technical: 'rtcCore per-peer identity: useRtcSession exposes remotePeers (streams joined with each peer\'s role/name) so the viewer renders the host as main video and guests as tiles instead of guessing "first stream". Reello live moved to \'stage\' topology; viewers "Ask to join" → streams/{id}.guestRequests → host approves (guests[]) → the viewer re-keys as a publisher with on-stage mic/cam + leave.',
    plain: 'Going live on Reello now works like a real talk show — viewers can ask to join, and with one tap you bring them on screen with their own camera and mic. Everyone sees you as the main video with your guests alongside; you can remove a guest anytime.',
  },
  {
    id: '5fb4820', date: '2026-07-27', time: '02:30', level: 'major', area: 'Social',
    title: 'Watch, read & listen together — in perfect sync',
    technical: 'New synchronized-party primitive (services/partyService + hooks/useParty): the host broadcasts playback STATE (play/pause/seek/track/page) via a parties/{id} Firestore doc; every guest\'s OWN local player follows it with drift-compensated seeking — content streams locally per viewer, not relayed from the host, so one host scales to an unlimited audience. Wired into VideoPlayer (watch party), BookReader (read-along, chapter+page sync) and the Chora PlayerView (listening party, track+position). Shareable ?party= deep-link auto-joins and follows. Live viewer count via presence.',
    plain: 'You can now host a watch party, a read-along, or a listening party and everyone follows you in real time — when you play, pause, skip, scrub, or turn the page, everyone\'s screen does the same, instantly. Each person streams the movie, book, or song on their own device in full quality; they\'re just kept in sync with you. Share one link and friends drop straight into the session.',
  },
  {
    id: '68b2edb', date: '2026-07-26', time: '19:45', level: 'major', area: 'Live TV',
    title: 'Turn on your channel in one tap',
    technical: 'One-tap FAST activation (activateFastChannel): flipping the toggle enables the channel, creates its published identity, auto-opts-in up to 100 of your recent playable videos when none are selected, and auto-generates the looping schedule — no manual setup. Idempotent; the manager also auto-builds a schedule on open when videos are opted in but none exists. Manual arrange/prune/ads remain in Manage Channel.',
    plain: 'Starting your own channel is now a single switch — Plajah instantly builds a 24/7 channel from your videos, ready to watch. You can rearrange the line-up, drop videos, or add ad breaks whenever you like, but you never have to set it up first.',
  },
  {
    id: '257e9fc', date: '2026-07-26', time: '19:10', level: 'minor', area: 'Live TV',
    title: 'Smoother, lighter channel playback',
    technical: 'FAST + live playback unified on one adaptive hls.js path (shared hlsTuning + capLevelsToPanel) instead of MuxPlayer — startLevel -1 ABR that never decodes more pixels than the panel. Also completes the carriage feed set: /api/fast/lineup.m3u8 + a linear /api/fast/:ownerId/stream.m3u8 HLS origin (see docs/FAST_CHANNEL_CARRIAGE.md).',
    plain: 'Channels and live feeds now adapt their quality to your screen and connection — smoother on a TV and lighter on data — instead of always pulling the biggest version.',
  },
  {
    id: '090947f', date: '2026-07-26', time: '18:20', level: 'minor', area: 'Live TV',
    title: 'FAST channels play their real schedule',
    technical: 'Player + EPG unified on services/fastChannelTimeline (deterministic epoch-anchored linearPosition + slotDurationSec). FastChannelPlayer now walks the slot schedule (bumpers, ad breaks, commercial-free, public-domain, and scheduled live all air) via MuxPlayer / hls.js with a safety advance timer; the program guide is built from the same slots so "on now" matches the screen. Blank REELLO_LIVE sources resolve from the owner\'s live config; new /api/fast/:ownerId/now.json.',
    plain: 'Channels now play exactly the line-up their owner arranged — station IDs, ad breaks (or commercial-free), and scheduled live segments all air in order — and the on-screen "now playing" always matches the program guide.',
  },
  {
    id: 'fe31117', date: '2026-07-26', time: '16:40', level: 'minor', area: 'Platform',
    title: 'What\'s New alerts only when there\'s real news',
    technical: 'UpdateNotification now keys off the newest changelog ENTRY id (LATEST_ENTRY_ID), not the hand-bumped APP_BUILD string; entriesSince returns only entries prepended since the id the user acknowledged; "seen" is recorded on SHOW (markSeen), not only on dismiss; storage key bumped plajah_last_seen_build_v1 → plajah_last_seen_entry_v2 for a clean migration.',
    plain: 'The "What\'s New" popup now appears only when we\'ve actually shipped something new — no more seeing it again after a reload or when nothing has changed.',
  },
  {
    id: 'fb1b25e', date: '2026-07-26', time: '16:10', level: 'major', area: 'Chora',
    title: 'Sync Lyrics works for every song',
    technical: '/api/ai/captions no longer rejects large masters (dropped the 22MB gate for a 250MB memory ceiling). The windowed path re-encodes each slice from disk; the single-shot path transcodes the whole file to a compact mono-16kHz mp3 before Gemini — so any track transcribes regardless of whether the Chora transcode pipeline ran. Client prefers the small rendition and surfaces the real failure reason.',
    plain: 'The "Sync Lyrics" button now turns any song into time-coded captions — including older tracks that used to silently do nothing — and tells you clearly if something goes wrong.',
  },
  {
    id: 'e1c2216', date: '2026-07-26', time: '15:30', level: 'major', area: 'Live TV',
    title: 'Run your own always-on TV channel',
    technical: 'Per-creator FAST channels: first-class channel entity (fast_channels collection — name/logo/category/number) + FastChannelManager; auto-built schedules with real per-asset durations and an optional commercial-free mode; deterministic linear-to-clock FastChannelPlayer (epoch-anchored "on now" so everyone sees the same programme); Live Channels rails in Taleo (MoviesTvView) and Reello (ReelloTvView) on TV. Industry EPG feeds emitted server-side (XMLTV / MRSS / lineup.json).',
    plain: 'You can now run your own 24/7 channel of your content on Plajah. It builds a schedule from your videos automatically, plays the same thing for everyone like real TV, and shows up in the Live sections of Taleo and Reello on the big screen.',
  },
  {
    id: 'd810792', date: '2026-07-26', time: '15:00', level: 'major', area: 'Live TV',
    title: 'Go live — with multiple simultaneous feeds',
    technical: 'Up to 3 concurrent sources per account (FAST loop / external 24/7 live / Reello live show), each independently active. TvLiveSourcePlayer prioritises HLS → YouTube/Twitch embed → Mux. A saved Feed Library (name + URL, on-platform streams listed first, unlimited saves, pick from a dropdown). BRAND/ORGANIZATION/PARTNER accounts run multiple concurrent feeds (main + ASL + languages, up to 8). "Live Now" rail added to Taleo + Reello.',
    plain: 'Creators can now broadcast live — from a link (HLS, YouTube or Twitch) or a Plajah live show — and save their favourite feeds to pick from a dropdown. Businesses, brands and organisations can send several feeds of one event at once, so it can carry a main feed plus sign-language and other-language versions side by side.',
  },
  {
    id: '54aa0a0', date: '2026-07-26', time: '14:30', level: 'minor', area: 'Live TV',
    title: 'Members get special channel programming',
    technical: 'FastChannelPlayer runs checkMembership(creatorId) at load — Sanctuary members see members-only special programming (per-video isExclusive) in the loop plus members-only live interrupts; non-members get the regular schedule. Linear semantics (filter, not paywall); the deterministic join runs on the gated list.',
    plain: 'If you hold a Sanctuary membership with a creator, their channel now shows you special members-only programming; everyone else sees the regular schedule.',
  },
  {
    id: '464c9dd', date: '2026-07-26', time: '14:00', level: 'minor', area: 'Taleo',
    title: 'Smoother film & video streaming',
    technical: 'One-click "Optimize for Streaming (HLS)" per video plus a bulk optimizer that transcodes an entire catalogue to Mux HLS, fixing progressive-playback choppiness (e.g. the "astrocats" title) by moving it onto adaptive HLS.',
    plain: 'Films and videos stream more smoothly now — creators can optimise a single title or their whole catalogue in one click, so playback stops stuttering.',
  },
  {
    id: '717e369', date: '2026-07-26', time: '13:30', level: 'major', area: 'TV Apps',
    title: 'A big-screen experience built for the living room',
    technical: 'TV overhaul: persistent Plajah branding (logo + gradient chevron + Early Access badge), centered Taleo/Chora/Reello tabs, an always-present playback transport + now-playing bar, a full-bleed album art slideshow, an FX Stage visualiser (reduced-res upscaled, channel-up/down presets), reusable hero carousels, declarative D-pad navigation (useTvGrid) with reliable hardware-Back handling, and "More From This World" / character rows across Chora, Taleo and Reello.',
    plain: 'The Plajah TV app got a big living-room upgrade — clearer branding and navigation, a full-screen album slideshow and an FX visual stage, controls you never lose while a song plays, and rows that suggest more from the same world and characters.',
  },
  {
    id: '322af42', date: '2026-07-21', time: '11:58', level: 'major', area: 'Academia',
    title: 'The Living Combat Atlas — a museum of world martial arts',
    technical: 'New bespoke Labs discipline (`combat`) alongside World History/Architecture/Archaeology. 50 accessions across five wings (Africa 17, Asia 12, Europe 9, Americas 8, Oceania 4) in data/combatAtlasData.ts; CombatAtlasView with 8 tabs. Plate Room (labs/PlateViewer) serves the real Beni Hasan plates extracted from our own JP2 holdings — wrestling registers render as native-res scrollable filmstrips. Motion Lab streams real capture data through a hand-written forward-kinematics BVH parser (labs/motionParsers) — four CMU Graphics Lab clips; the CC BY-NC-SA UMONS-TAICHI clip is filtered from public builds via SHOW_NC_PREVIEW. Holdings pipeline in acquisitions/: 302MB of PD/CC0 source in Storage, 94 rights records in the archiveAssets Firestore collection.',
    plain: 'A new museum in Academia: fifty martial arts from every continent — how each is fought, what it means, who carried it, and where the evidence lives. Read the actual four-thousand-year-old wrestling wall from an Egyptian tomb, register by register, and watch real motion-capture of technique instead of looking at still photographs. Every image carries its licence and photographer credit, and the two "martial arts" we found circulating online that turned out to be invented are documented as such rather than quietly dropped.',
  },
  {
    id: '195cffe', date: '2026-07-01', time: '15:22', level: 'minor', area: 'Sharing',
    title: 'Films get shareable previews too',
    technical: 'Film (Taleo/archive.org) deep-linking: new "archive" share type → /share?type=archive&id=<identifier>; fetchArchiveVideoById rebuilds the item on boot; server injects OG from the archive.org metadata API; wired the movie Share button.',
    plain: 'Sharing a film now opens that exact film and shows a real preview card (poster + "Experience “Title” now on Plajah") — same as songs, videos and books.',
  },
  {
    id: '8e1f99f', date: '2026-07-01', time: '15:13', level: 'minor', area: 'Sharing',
    title: 'X (Twitter) previews & embeds fixed',
    technical: 'X inline player card ("can\'t be reached") → reliable summary_large_image; /embed made cross-origin framable (removed X-Frame-Options, CSP frame-ancestors) + resolves Mux to HLS (hls.js); publicHost() uses X-Forwarded-Host so meta URLs are plajah.com, not the run.app host.',
    plain: 'Links shared on X now show a proper preview instead of "this media could not be played", and the embeddable player works on other sites too.',
  },
  {
    id: 'e6e5ee4', date: '2026-07-01', time: '14:48', level: 'major', area: 'Studio',
    title: 'Plajah Studio: video router & switcher',
    technical: 'Media Engine foundation — VideoSource abstraction, capability gating (browser=webrtc/uvc), WHEP + webcam sources, router crosspoint engine (locks/salvos/tally), PGM/PVW switcher, soft-sync TBC. VideoRouterConsole + MEDIA_ROUTER view. Native DeckLink/NDI/BRAW = desktop app.',
    plain: 'The start of professional live production inside Plajah — a video router and switcher to run multi-camera streams. Great for churches, schools and cultural institutions producing services, assemblies and events. Webcams and remote guests work in the browser today; capture cards and NDI come with the desktop app.',
  },
  {
    id: '34e448a', date: '2026-07-01', time: '14:38', level: 'major', area: 'Sharing',
    title: 'Shared links show a real preview',
    technical: 'Content share URLs route through /share so the server injects asset-specific Open Graph/Twitter meta (title, "Experience … now on Plajah", cover/thumbnail) and strips the static generic tags; humans bounce to the app. Covers video/song/album/book/article/game/post.',
    plain: 'When you share something from Plajah, the link now shows a proper preview — the actual cover or thumbnail and "Experience “Title” now on Plajah" (posts read "<Name> is sharing this post from Plajah"). No more generic Plajah link.',
  },
  {
    id: '9e2d00e', date: '2026-07-01', time: '14:19', level: 'major', area: 'Health',
    title: 'Plajah looks after your experience',
    technical: 'healthMonitor.ts: client perf telemetry (load/TTFB/LCP/long-tasks/failed-requests/errors/connection/memory) → 0-100 health score; self-heals stale-build/chunk failures via SW update + controlled reload; escalates major degradation to errorReports; per-user snapshot to userHealth/{uid}. AdminUserHealth panel + tab.',
    plain: 'Plajah now quietly watches how well the app is running for you — how fast it loads and whether anything is breaking. It fixes small problems on its own (like refreshing to the newest version) and alerts our team to bigger ones, so your experience stays smooth.',
  },
  {
    id: '3cf15d8', date: '2026-07-01', time: '14:11', level: 'minor', area: 'Admin',
    title: 'Analytics dashboard permissions fixed',
    technical: 'The liveFeed collection had no Firestore rule (default-deny), failing the admin analytics Promise.all. Added the rule + wrapped each read in a safe guard so one failure degrades gracefully.',
    plain: 'The admin analytics dashboard that showed a permissions error now loads correctly.',
  },
  {
    id: 'c7eb6eb', date: '2026-07-01', time: '13:41', level: 'major', area: 'Support',
    title: 'Report a bug from anywhere',
    technical: 'sessionTrace.ts ring buffer (last 5 min: views/clicks/failed-net/console/connectivity, privacy-safe) + reportBug() → errorReports; BugReportButton mounted globally; ErrorReportsPanel shows the session trail.',
    plain: 'A "Report a bug" button is now on every page. When you report something, it automatically attaches a private log of your last 5 minutes so our team can see exactly what happened and fix it faster — never your passwords or what you typed.',
  },
  {
    id: 'b65c632', date: '2026-07-01', time: '13:31', level: 'major', area: 'Platform',
    title: 'What\'s New — see how Plajah evolves',
    technical: 'CHANGELOG.md + data/changelog.ts (technical + plain-English, major/minor); PlatformChangelog page (Help → What\'s New); UpdateNotification (per-build, major/minor columns); Elevate admin "seed demo church".',
    plain: 'You can now see everything new on Plajah in plain English — a "What\'s New" page in Help and a summary each time we ship an update, split into big new features and smaller improvements.',
  },
  {
    id: 'c2876cc', date: '2026-07-01', time: '12:40', level: 'minor', area: 'Sharing',
    title: 'Shared videos open the actual video',
    technical: 'Boot handler routes non-Reello videos to the PLAYER view (single-video VideoPlayer) instead of the VIDEOS browse grid, which ignores selectedVideo.',
    plain: 'When someone shares a video with you, the link now opens that exact video full-screen — not the general videos page.',
  },
  {
    id: '97fb17e', date: '2026-07-01', time: '12:23', level: 'major', area: 'Elevate',
    title: 'Introducing Plajah Elevate',
    technical: 'New PLAJAH_ELEVATE view: a directory over public Organizations grouped by orgType — CHURCH (Spiritual), CULTURAL, NONPROFIT. New CULTURAL org type; ?elevate=1 deep link; single-equality org query to avoid composite-index needs.',
    plain: 'A brand-new home for churches, religious organizations, cultural institutions and nonprofits. Find a community near you, follow their work, and give — all in one place.',
  },
  {
    id: '737c2a9', date: '2026-07-01', time: '12:07', level: 'minor', area: 'Sharing',
    title: 'Any shared video is found, however old',
    technical: 'Added fetchVideoById (direct getDoc on videos/{id}); boot + RelloView fetch the exact video by id instead of scanning the recent-50 feed.',
    plain: 'Shared links now work for every video ever posted, not just the most recent ones.',
  },
  {
    id: 'dc28f8e', date: '2026-07-01', time: '11:58', level: 'minor', area: 'Sharing',
    title: 'Shared links work when signed out',
    technical: 'Guarded the signed-out auth branch with hasDeepLink so the listener no longer clobbers deep-link views back to LANDING.',
    plain: 'You no longer get bounced to the home page when you open a shared link without being logged in — it takes you straight to the content.',
  },
  {
    id: 'c2756a6', date: '2026-07-01', time: '11:26', level: 'major', area: 'Sharing',
    title: 'Every share link opens its own page',
    technical: 'Platform-wide deep-link boot: books, articles, games, events, debates, clubs, videos each open directly via typed ?type/&id and path routes through the canonical buildShareUrl.',
    plain: 'Share any piece of content and the link takes people directly to it — the right book, article, game, event or video opens on its own page.',
  },
  {
    id: 'f89eccf', date: '2026-07-01', time: '11:09', level: 'minor', area: 'Teleprompter',
    title: 'Teleprompter in TV Studio & Podcast Studio',
    technical: 'TV Studio adds a Prompter source (TeleprompterCanvasSource → captureStream → switcher); Podcast Studio adds a slim ad-read prompter.',
    plain: 'The video switcher can now put the teleprompter on a screen for talent, and podcasters get a compact prompter for reading ads cleanly.',
  },
  {
    id: '2e68f58', date: '2026-07-01', time: '10:55', level: 'major', area: 'Teleprompter',
    title: 'Teleprompter is now a Plajah app',
    technical: 'Teleprompter engine added under components/teleprompter with an in-app shell, operator/talent BroadcastChannel sync, and an Apps-section card.',
    plain: 'A full teleprompter is now built into Plajah — write your script, run it on a second screen, and control the scroll live. It powers teleprompting everywhere on the platform.',
  },
  {
    id: 'c5e94c8', date: '2026-07-01', time: '10:04', level: 'minor', area: 'Church',
    title: 'Church vertical finishing touches',
    technical: 'The four Part-3 finalizers wrapping the church vertical (polish across giving, streaming, ministries).',
    plain: 'Final polish across the church tools — giving, streaming, and ministry pages all tightened up.',
  },
  {
    id: 'f9f5864', date: '2026-07-01', time: '04:59', level: 'major', area: 'Church',
    title: 'Multi-site church control',
    technical: 'Part 3 Phase 5 — campus program feeds and a master control for multi-site churches.',
    plain: 'Churches with more than one location can now run all their campuses from one control room, sending the right program to each site.',
  },
  {
    id: '79c866c', date: '2026-07-01', time: '04:50', level: 'major', area: 'Church',
    title: 'Sermons become articles and books',
    technical: 'Part 3 Phase 3 — Aria pipeline turning a sermon into an article and then a book.',
    plain: 'A recorded sermon can automatically become a written article and even a full book — turning one message into lasting content.',
  },
  {
    id: '39a5a3d', date: '2026-07-01', time: '04:20', level: 'major', area: 'Church',
    title: 'Native church giving',
    technical: 'Part 3 Phase 2 — native Stripe giving with funds, QR codes, and recurring gifts.',
    plain: 'Churches can now receive donations right inside Plajah — one-time or recurring, to specific funds, with a QR code for in-person giving.',
  },
  {
    id: 'f98fa76', date: '2026-07-01', time: '03:49', level: 'major', area: 'Church',
    title: 'Church accounts arrive',
    technical: 'Part 3 Phase 1 — church account type with ministries, service times, and a demo church.',
    plain: 'Churches get their own account type with sub-ministries, service times, and a full public home on Plajah.',
  },
  {
    id: '7c9cd5b', date: '2026-07-01', time: '02:36', level: 'major', area: 'Organizations',
    title: 'Real organization accounts',
    technical: 'Part 2 slice 1 — the Organization primitive underpinning brands, labels, businesses, churches and nonprofits.',
    plain: 'Brands, labels, businesses and nonprofits can now have real organization pages on Plajah, with staff, rosters and community built in.',
  },
];

/** Public-facing entries (everything, plain-English). Newest first. */
export const getPublicChangelog = (): ChangelogEntry[] => CHANGELOG;

export const majorEntries = (entries: ChangelogEntry[] = CHANGELOG) => entries.filter(e => e.level === 'major');
export const minorEntries = (entries: ChangelogEntry[] = CHANGELOG) => entries.filter(e => e.level === 'minor');

/** The id of the newest shipped entry — the marker the update notification records as "seen". */
export const LATEST_ENTRY_ID = CHANGELOG[0]?.id || '';

/**
 * Entries the user genuinely hasn't seen yet, given the last entry id they acknowledged.
 *
 * Returns ONLY the entries prepended since that id — so the notification fires exactly once per
 * real new entry and never on a redeploy that added no changelog line. Returns [] (show nothing)
 * when the user is already current, when the stored marker is unrecognized (a legacy build string
 * or a pruned entry), or on a first-ever visit — in every one of those cases the caller silently
 * records LATEST_ENTRY_ID, so the NEXT genuinely-new entry is what triggers the panel.
 */
export const entriesSince = (lastSeenId: string | null): ChangelogEntry[] => {
  if (!lastSeenId) return [];                              // first run / cleared storage → nothing is "new"
  const seenIdx = CHANGELOG.findIndex(e => e.id === lastSeenId);
  if (seenIdx <= 0) return [];                             // already current (0) or unknown marker (-1)
  return CHANGELOG.slice(0, seenIdx);                      // the entries added since they last acknowledged
};
