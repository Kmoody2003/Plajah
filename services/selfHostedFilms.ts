/**
 * Self-Hosted Films Registry
 * 
 * Maps public domain and preserved film identifiers to local disk streaming routes
 * or cloud CDN URLs (Cloudflare R2, AWS S3, Mux). When a film is downloaded into
 * the Admin Film Ingest Vault, its stream is instantly unlocked here.
 */

export interface SelfHostedFilmEntry {
  identifier: string;
  videoUrl: string;
  subtitles?: Array<{ srclang: string; label: string; url: string }>;
  thumbnailUrl?: string;
  sourceType: 'LOCAL_VAULT' | 'R2' | 'S3' | 'MUX';
  isAvailable: boolean;
  sizeBytes?: number;
}

// In-memory or locally overridden self-hosted films map
export const SELF_HOSTED_FILMS: Record<string, SelfHostedFilmEntry> = {};

/**
 * Register a downloaded film into the self-hosted registry
 */
export function registerSelfHostedFilm(entry: SelfHostedFilmEntry) {
  SELF_HOSTED_FILMS[entry.identifier] = entry;
}

/**
 * Check if a film identifier is available in the self-hosted / local vault
 */
export function getSelfHostedFilm(identifier: string): SelfHostedFilmEntry | undefined {
  return SELF_HOSTED_FILMS[identifier];
}

/**
 * Get local streaming URL for an identifier if downloaded
 */
export function getLocalVaultStreamUrl(identifier: string): string {
  return `/api/admin/film-ingest/stream/${encodeURIComponent(identifier)}`;
}
