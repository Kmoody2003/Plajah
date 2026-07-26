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
export const APP_BUILD = '2026.07.26-01';

export const CHANGELOG: ChangelogEntry[] = [
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
