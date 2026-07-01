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
 * The ledger — newest first. `APP_BUILD` is bumped whenever a release should
 * re-trigger the "what's new" notification for users.
 */
export const APP_BUILD = '2026.07.01-07';

export const CHANGELOG: ChangelogEntry[] = [
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

/** Entries the user hasn't seen yet (since a stored build id). */
export const entriesSince = (lastSeenBuild: string | null): ChangelogEntry[] => {
  if (!lastSeenBuild || lastSeenBuild !== APP_BUILD) {
    // Surface the current release window: entries from the newest date.
    const newestDate = CHANGELOG[0]?.date;
    return CHANGELOG.filter(e => e.date === newestDate);
  }
  return [];
};
