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
