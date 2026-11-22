// Asset variants at runtime: package first, web set second (docs/GAME_DELIVERY_ARCHITECTURE.md §3, §6).
//
// The game keeps asking for the web paths it always used. When the app has this game's HQ package installed, every request
// for a path the package contains is sent to the package's local folder instead; everything else loads from the web as
// before. So a half-installed package still plays (installed groups come from disk, the rest from the web), and the browser,
// with no package, behaves exactly as it did.
//
// Where the package is found, first match wins:
//   1. window.__plajahPackages[gameId] = { base }   set by the WinUI/Android shell (own window, parent or top)
//   2. ?pkg=<base>                                    passed by the shell's game frame; only local package hosts are accepted
// The base URL serves <base>index.json (InstalledIndex, written by the downloader after verifying the chunks) and the files
// under their web paths: <base>games/ravencrest/assets/polyhaven/textures/x/diff.jpg.

import { normPath, type InstalledIndex, type PackageTier } from './manifest';

export interface ActivePackage { base: string; index: InstalledIndex }

/** Hosts a ?pkg= base may point at: the apps' local package hosts, and this page's own origin (dev builds). */
const TRUSTED = /^https:\/\/(packages\.plajah\.local|appassets\.androidplatform\.net)\//;

type Shell = { __plajahPackages?: Record<string, { base?: string }> };

function shellBase(gameId: string): string | null {
  for (const w of [window, window.parent, window.top]) {
    try { const b = (w as unknown as Shell)?.__plajahPackages?.[gameId]?.base; if (b) return b; } catch { /* cross-origin parent */ }
  }
  return null;
}

export function packageBase(gameId: string, search = location.search): string | null {
  const fromShell = shellBase(gameId);
  if (fromShell) return fromShell.endsWith('/') ? fromShell : `${fromShell}/`;
  const p = new URLSearchParams(search).get('pkg');
  if (!p) return null;
  const abs = new URL(p.endsWith('/') ? p : `${p}/`, location.href).href;
  return TRUSTED.test(abs) || abs.startsWith(`${location.origin}/`) ? abs : null;
}

/** Finds and reads this game's installed package. Resolves null quickly in the browser (no shell, no ?pkg). */
export async function findPackage(gameId: string, timeoutMs = 2500): Promise<ActivePackage | null> {
  const base = packageBase(gameId);
  if (!base) return null;
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
    const r = await fetch(`${base}index.json`, { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (!r.ok) return null;
    const index = await r.json() as InstalledIndex;
    if (index?.gameId !== gameId || !Array.isArray(index.paths)) return null;
    return { base, index };
  } catch (e) {
    console.warn(`[packages] ${gameId}: package at ${base} unreadable, playing the web tier`, e);
    return null;
  }
}

export interface Resolver {
  /** the package URL for a web path, or the input unchanged */
  resolve(url: string): string;
  tier: PackageTier;
  hits: () => number;
}

export function makeResolver(pkg: ActivePackage, origin = location.origin): Resolver {
  const set = new Set(pkg.index.paths.map(normPath));
  let hits = 0;
  return {
    tier: pkg.index.tier,
    hits: () => hits,
    resolve(url: string) {
      if (url.startsWith(pkg.base) || url.startsWith('data:') || url.startsWith('blob:')) return url;
      // only this page's own paths are candidates (absolute same-origin or root-relative)
      if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith(`${origin}/`)) return url;
      const p = normPath(url.startsWith('/') || url.startsWith(origin) ? url : new URL(url, location.href).href);
      if (!set.has(p)) return url;
      hits++;
      return pkg.base + p.split('/').map(encodeURIComponent).join('/');
    },
  };
}

/**
 * Routes the page's asset loads through the resolver: three.js loaders (via the loading manager's URL modifier, which
 * covers image textures) and fetch (which three's FileLoader, and the game's own GLB/audio/JSON fetches, use).
 * `manager` is THREE.DefaultLoadingManager; passed in so this module does not import three.
 */
export function installResolver(r: Resolver, manager?: { setURLModifier(fn?: (url: string) => string): unknown }) {
  manager?.setURLModifier((u) => r.resolve(u));
  const orig = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string') return orig(r.resolve(input), init);
    if (input instanceof URL) return orig(r.resolve(input.href), init);
    return orig(input, init);
  }) as typeof fetch;
}
