// Launch targets for the per-experience launcher icons and the local-media fast path.
//
// Native shells put a hint in the start URL so it is readable synchronously before React mounts:
//   ?view=<slug>   — an experience icon (Chora, Reello, …) was tapped. App.tsx maps it to an AppView.
//   ?open=media    — the OS opened a local file in Plajah ("Open with", double-click in Explorer).
//                    index.tsx boots the lightweight LocalMediaLaunch shell instead of the full app.
//
// Keep the slugs in sync with: scripts/generate-experience-icons.mjs, AndroidManifest.xml
// (activity-alias meta-data), and windows-native/Plajah.WinUI/Package.appxmanifest (uap10:Parameters).
import type { AppView } from '../../types';

export const EXPERIENCE_VIEWS: Record<string, AppView> = {
  chora: 'MUSIC',
  reello: 'VIDEOS',
  taleo: 'MOVIES_TV',
  fabula: 'FABULA',
  pixels: 'PLAJAH_PIXELS',
  chora_studio: 'MELOS',
  'chora-studio': 'MELOS',
  academia: 'ACADEMIA_HOME',
  // Not launcher icons — hand-off targets from the local-media shell.
  photos: 'GLOBAL_PHOTOS',
  crossover: 'CROSSOVER',
};

export function experienceView(slug: string | null | undefined): AppView | null {
  if (!slug) return null;
  return EXPERIENCE_VIEWS[slug.toLowerCase()] ?? null;
}

export function isMediaLaunch(search: string = window.location.search): boolean {
  return new URLSearchParams(search).get('open') === 'media';
}

/**
 * Leave the media shell for the full app without a page reload: rewrite the URL to the
 * destination (so App's synchronous ?view= read picks it up) and let index.tsx swap trees.
 */
export function handOffToFullApp(viewSlug?: string): void {
  const url = viewSlug ? `/?view=${encodeURIComponent(viewSlug)}` : '/';
  try { window.history.replaceState(null, '', url); } catch { /* */ }
  window.dispatchEvent(new CustomEvent('plajah:mount-full-app'));
}

// ── Shared-link launches ─────────────────────────────────────────────────────────────────────
// Captured at module load, i.e. BEFORE App's first navigation rewrites the URL (setView pushes the
// bare pathname, dropping ?id=…&type=…). A person opening a shared link wants the shared thing —
// not the globe launch page, a what's-new panel, the Smart Guide or the first-run letter.
function detectShareLaunch(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const sp = new URLSearchParams(window.location.search);
    const keys = ['id', 'type', 'reello', 'video', 'v', 'org', 'elevate', 'debate', 'club', 'livestream', 'stream',
      'room', 'callin', 'listen', 'invite', 'g', 'party', 'follow', 'recap', 'play', 'atlas'];
    if (keys.some(k => sp.get(k))) return true;
    if (/^#g\//.test(window.location.hash)) return true;
    return /^\/(profile|release|event|clubs|athlete|book|artist|reello|video|share)\//.test(window.location.pathname);
  } catch { return false; }
}
export const LAUNCHED_VIA_SHARE: boolean = detectShareLaunch();

// ── Reload resumes the current experience ───────────────────────────────────────────────────
// In-app navigation never writes the screen into the URL, so a browser reload used to boot at the
// bare origin (→ home). We remember the last stateless top-level screen per tab and restore it
// only when the page load is a genuine reload.
const RESUME_KEY = 'plajah_resume_view_v1';
const RESUMABLE_VIEWS = new Set<string>([
  ...Object.values(EXPERIENCE_VIEWS),
  'DASHBOARD', 'PLAJAH_HOME', 'FEED', 'LIVE_HUB', 'GAMES', 'BOOKS', 'PLAJAH_SPORTS', 'PLAJAH_LABS',
  'MOVIES_TV', 'VIDEOS', 'MUSIC', 'PLAJAH_BUSINESS', 'PLAJAH_ELEVATE', 'ORA', 'TERRA', 'APPS', 'TELA',
  'PLAJAH_FSE', 'ART_GALLERY', 'GLOBAL_PHOTOS', 'STUDENT_HOME', 'ACADEMIA_HOME',
]);

export function rememberResumeView(view: string, signedIn: boolean): void {
  try {
    if (signedIn && RESUMABLE_VIEWS.has(view)) sessionStorage.setItem(RESUME_KEY, view);
    else if (!signedIn) sessionStorage.removeItem(RESUME_KEY);
  } catch { /* private mode */ }
}

export function readResumeView(): AppView | null {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type !== 'reload') return null;
    const v = sessionStorage.getItem(RESUME_KEY);
    return v && RESUMABLE_VIEWS.has(v) ? (v as AppView) : null;
  } catch { return null; }
}
