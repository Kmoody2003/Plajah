/**
 * Self-Hosted Films Registry
 * 
 * Maps public domain and preserved film identifiers to local disk streaming routes
 * or cloud CDN URLs (Cloudflare R2, AWS S3, Mux). When a film is downloaded into
 * the Admin Film Ingest Vault, its stream is instantly unlocked here.
 */

import { MUX_FILM_REGISTRY } from '../data/muxFilmRegistry';

export interface SelfHostedFilmEntry {
  identifier: string;
  videoUrl: string;
  muxPlaybackId?: string;
  muxAssetId?: string;
  subtitles?: Array<{ srclang: string; label: string; url: string }>;
  thumbnailUrl?: string;
  sourceType: 'LOCAL_VAULT' | 'R2' | 'S3' | 'MUX';
  isAvailable: boolean;
  sizeBytes?: number;
}

// In-memory or locally overridden self-hosted films map, seeded with the committed
// Mux registry so every curated film resolves to HLS on first click (and on servers
// with no film vault on disk).
export const SELF_HOSTED_FILMS: Record<string, SelfHostedFilmEntry> = Object.fromEntries(
  Object.entries(MUX_FILM_REGISTRY).map(([identifier, mux]) => [identifier, {
    identifier,
    videoUrl: `https://stream.mux.com/${mux.muxPlaybackId}.m3u8`,
    muxPlaybackId: mux.muxPlaybackId,
    muxAssetId: mux.muxAssetId,
    sourceType: 'MUX' as const,
    isAvailable: true,
  }]),
);

/**
 * Register a downloaded or Mux-ingested film into the self-hosted registry
 */
export function registerSelfHostedFilm(entry: SelfHostedFilmEntry) {
  const cleanId = entry.identifier.replace(/^public_domain_/, '');
  SELF_HOSTED_FILMS[entry.identifier] = entry;
  SELF_HOSTED_FILMS[cleanId] = { ...entry, identifier: cleanId };
}

/**
 * Check if a film identifier is available in the self-hosted / local vault / Mux registry
 */
export function getSelfHostedFilm(identifier: string): SelfHostedFilmEntry | undefined {
  if (!identifier) return undefined;
  return SELF_HOSTED_FILMS[identifier] || SELF_HOSTED_FILMS[identifier.replace(/^public_domain_/, '')];
}

/**
 * Get local streaming URL for an identifier if downloaded
 */
export function getLocalVaultStreamUrl(identifier: string): string {
  const cleanId = identifier.replace(/^public_domain_/, '');
  return `/api/admin/film-ingest/stream/${encodeURIComponent(cleanId)}`;
}

/**
 * Get resilient same-origin proxy streaming URL that serves from local vault if downloaded,
 * or proxies and caches the verified archive stream with automatic metadata fallback.
 */
export function getProxyStreamUrl(identifier: string): string {
  const cleanId = identifier.replace(/^public_domain_/, '');
  return `/api/admin/film-ingest/proxy-stream/${encodeURIComponent(cleanId)}`;
}

let hydratePromise: Promise<void> | null = null;
let lastHydratedAt = 0;

/**
 * Hydrate the client-side SELF_HOSTED_FILMS map from the server's live vault & Mux registry.
 */
export function hydrateSelfHostedFilmsFromServer(force = false): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const now = Date.now();
  if (!force && hydratePromise && now - lastHydratedAt < 30_000) {
    return hydratePromise;
  }
  lastHydratedAt = now;
  hydratePromise = fetch('/api/admin/film-ingest/catalog-playback')
    .then(async (res) => {
      if (!res.ok) return;
      const data = await res.json();
      const entries = Array.isArray(data?.films)
        ? data.films
        : Array.isArray(data?.entries)
          ? data.entries
          : [];
      for (const entry of entries) {
        if (entry && entry.identifier) {
          registerSelfHostedFilm(entry);
        }
      }
    })
    .catch(() => {});
  return hydratePromise;
}

/**
 * Ensure a public-domain film or series is natively registered on platform
 * (Firestore `albums` & `videos` + Mux HLS ingest + Local Vault download).
 */
export async function ensureFilmNativelyOnPlatform(item: {
  identifier: string;
  title?: string;
  description?: string;
  director?: string;
  year?: string | number;
  runtime?: string;
  genre?: string;
  thumbnailUrl?: string;
  source?: string;
  videoUrl?: string;
  sourceUrl?: string;
}): Promise<{ streamUrl?: string; proxyStreamUrl?: string; muxPlaybackId?: string | null } | null> {
  if (typeof window === 'undefined' || !item?.identifier) return null;
  try {
    const res = await fetch('/api/admin/film-ingest/ensure-on-platform', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.identifier && (data?.muxPlaybackId || data?.status === 'COMPLETED')) {
      registerSelfHostedFilm({
        identifier: data.identifier,
        videoUrl: data.streamUrl,
        muxPlaybackId: data.muxPlaybackId || undefined,
        muxAssetId: data.muxAssetId || undefined,
        thumbnailUrl: item.thumbnailUrl,
        sourceType: data.muxPlaybackId ? 'MUX' : 'LOCAL_VAULT',
        isAvailable: true,
      });
    }
    return data;
  } catch {
    return null;
  }
}


