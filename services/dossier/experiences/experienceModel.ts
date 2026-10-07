/**
 * Experiences: the platform-admin-only asset area that holds the Dossier films once they are on Mux.
 *
 * This module is PURE (no firebase, no react, no node:fs) so the admin UI, the hall, the upload script and the
 * unit tests all share exactly one definition of:
 *   - the catalog of MP4s under docs/dossier and which exhibit each one belongs to,
 *   - the upload plan (idempotent by sha256) and the local manifest,
 *   - the two Firestore shapes: `experiences/{id}` (admin only, everything) and `experienceFilms/{exhibitId}`
 *     (public read, admin write, ONLY what a visitor needs to press play),
 *   - how a visitor's player picks Mux versus the live canvas film,
 *   - how an Experience becomes a normal Reello `videos/{id}` document.
 *
 * Security model in one paragraph: `experiences` holds the whole asset record (Mux asset id, source file,
 * sha, uploader) and is readable/writable by platform admins only. A visitor never reads it. When an admin presses
 * "Use in the hall", the minimal playback fields are copied to `experienceFilms/{exhibitId}`, which anyone may read
 * (the playback id of a public Mux asset is not a secret: it is in every browser's network tab the moment the film
 * plays) and only a platform admin may write. Unpublishing deletes that one document and the hall falls back to the
 * live canvas film on the next open.
 */

export type ExperienceStatus = 'planned' | 'uploading' | 'processing' | 'ready' | 'errored';
/** The app has no signed-playback support (every player builds https://stream.mux.com/{id}.m3u8 with no token), so
 *  'public' is what the platform can actually play. 'signed' records are stored but never served by the hall or
 *  Reello until a token-minting endpoint exists (see selectFilmSource / canPublishToReello). */
export type PlaybackPolicy = 'public' | 'signed';
export type ExperienceVariant = 'council' | 'legacy' | 'demo';

export interface ExperienceRecord {
  id: string;
  title: string;
  description?: string;
  exhibitId: string;
  kind: 'film';
  variant: ExperienceVariant;
  status: ExperienceStatus;
  muxUploadId?: string;
  muxAssetId?: string;
  muxPlaybackId?: string;
  playbackPolicy: PlaybackPolicy;
  durationSec?: number;
  width?: number;
  height?: number;
  /** WebVTT the player loads (a Firebase Storage URL once attached in the admin UI). */
  captionsUrl?: string;
  /** SRT kept alongside for download / other tools. */
  captionsSrtUrl?: string;
  /** Repo-relative sidecar files the upload script found next to the MP4. */
  captionsSourcePaths?: { vtt?: string; srt?: string };
  sourceFile: string;
  sourceSha256?: string;
  sizeBytes?: number;
  /** When the MP4 was rendered (file mtime), epoch ms. */
  renderedAt?: number;
  /** True while `experienceFilms/{exhibitId}` points at this record. */
  inHall?: boolean;
  /** The Reello `videos/{id}` created from this asset, once the admin chose to publish it. */
  publishedReelloId?: string;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

/** What a visitor may read. Nothing here identifies the uploader, the asset id, the source path or the hash. */
export interface ExperienceFilmPublic {
  exhibitId: string;
  experienceId: string;
  title: string;
  muxPlaybackId: string;
  playbackPolicy: 'public';
  durationSec: number;
  width: number;
  height: number;
  captionsUrl?: string;
  updatedAt: number;
}

export const EXPERIENCE_FILM_PUBLIC_KEYS: readonly (keyof ExperienceFilmPublic)[] = [
  'exhibitId', 'experienceId', 'title', 'muxPlaybackId', 'playbackPolicy', 'durationSec', 'width', 'height', 'captionsUrl', 'updatedAt',
];

// ── Catalog ──────────────────────────────────────────────────────────────────

export interface CatalogEntry {
  id: string;
  title: string;
  description: string;
  exhibitId: string;
  variant: ExperienceVariant;
  /** Repo-relative MP4 under docs/dossier. */
  file: string;
  /** Sidecars next to the MP4 (repo-relative), if the render produced them. */
  vtt?: string;
  srt?: string;
  /** Older pre-council explainers are skipped unless the owner passes --include-legacy. */
  legacy?: boolean;
}

const D = 'docs/dossier';
export const EXPERIENCE_CATALOG: readonly CatalogEntry[] = [
  { id: 'douglass-council', exhibitId: 'frederick-douglass', variant: 'council', title: 'Frederick Douglass: the film', description: 'A Plajah Dossier film on the life of Frederick Douglass, made from cleared archive images, sourced narration and reconstructions labelled as such.', file: `${D}/douglass-explainer-council.mp4`, vtt: `${D}/douglass-explainer-council.vtt`, srt: `${D}/douglass-explainer-council.srt` },
  { id: 'ford-council', exhibitId: 'henry-ford', variant: 'council', title: 'Henry Ford: the film', description: 'A Plajah Dossier film on Henry Ford and the assembly line, made from cleared archive images, sourced narration and reconstructions labelled as such.', file: `${D}/ford-explainer-council.mp4`, vtt: `${D}/ford-explainer-council.vtt`, srt: `${D}/ford-explainer-council.srt` },
  { id: 'persia-council', exhibitId: 'christianity-in-persia', variant: 'council', title: 'Christianity in Persia: the film', description: 'A Plajah Dossier film on two thousand years of Christianity on the roads of Persia, made from cleared archive images and sourced narration.', file: `${D}/persia-explainer-council.mp4`, vtt: `${D}/persia-explainer-council.vtt`, srt: `${D}/persia-explainer-council.srt` },
  { id: 'partition-council', exhibitId: 'partition-1947', variant: 'council', title: 'The Partition of India, 1947: the film', description: 'A Plajah Dossier film on the five weeks in which a line was drawn through Punjab and Bengal, made from cleared archive images and sourced narration.', file: `${D}/partition-explainer-council.mp4`, vtt: `${D}/partition-explainer-council.vtt`, srt: `${D}/partition-explainer-council.srt` },
  { id: 'founding-battle-demo', exhibitId: 'founding-era', variant: 'demo', title: 'The Founding Era: animated-painting demo', description: 'A short demonstration of the Dossier animated-painting technique on a founding-era battle scene. Silent; a technique demo, not a finished exhibit film.', file: `${D}/founding-battle-demo.mp4`, vtt: `${D}/founding-battle-demo.vtt`, srt: `${D}/founding-battle-demo.srt` },
  { id: 'douglass-legacy', exhibitId: 'frederick-douglass', variant: 'legacy', legacy: true, title: 'Frederick Douglass: first explainer', description: 'The original (pre-council) Douglass explainer, kept for the record.', file: `${D}/douglass-explainer.mp4`, srt: `${D}/douglass-explainer.srt` },
  { id: 'ford-legacy', exhibitId: 'henry-ford', variant: 'legacy', legacy: true, title: 'Henry Ford: first explainer', description: 'The original (pre-council) Ford explainer, kept for the record.', file: `${D}/ford-explainer.mp4`, srt: `${D}/ford-explainer.srt` },
  { id: 'persia-legacy', exhibitId: 'christianity-in-persia', variant: 'legacy', legacy: true, title: 'Christianity in Persia: first explainer', description: 'The original (pre-council) Persia explainer, kept for the record.', file: `${D}/persia-explainer.mp4`, srt: `${D}/persia-explainer.srt` },
];

export const catalogFor = (id: string) => EXPERIENCE_CATALOG.find(c => c.id === id);

// ── URLs (same shapes the rest of the platform uses) ─────────────────────────

export const streamUrl = (playbackId: string) => `https://stream.mux.com/${playbackId}.m3u8`;
/** Progressive MP4 (no MSE) the platform already uses as its Android-TV fallback. Needs mp4_support on the asset. */
export const mp4FallbackUrl = (playbackId: string) => `https://stream.mux.com/${playbackId}/high.mp4`;
export const posterUrl = (playbackId: string, timeSec = 5, width = 1280) =>
  `https://image.mux.com/${playbackId}/thumbnail.jpg?width=${width}&fit_mode=smartcrop&time=${timeSec}`;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Firestore throws on `undefined` anywhere in a write. Drops undefined (deeply, through plain objects and arrays). */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.filter(v => v !== undefined).map(v => stripUndefined(v)) as unknown as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (v !== undefined) out[k] = stripUndefined(v);
    return out as T;
  }
  return value;
}

/** Tag stamped on the Mux asset so an upload in the Mux dashboard can be traced back to its record. Mux caps it at 255. */
export function buildPassthrough(id: string, sha256?: string): string {
  return `dossier-exp=${id}${sha256 ? `;sha=${sha256.slice(0, 16)}` : ''}`.slice(0, 255);
}

/** WebVTT from SRT: header, comma to dot in timestamps, indices kept (harmless). Idempotent on input that is already VTT. */
export function srtToVtt(srt: string): string {
  const text = srt.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
  if (/^WEBVTT/.test(text)) return text + '\n';
  const body = text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return `WEBVTT\n\n${body}\n`;
}

// ── Upload plan + manifest (idempotent by sha256) ────────────────────────────

export interface ManifestEntry {
  id: string;
  exhibitId: string;
  variant: ExperienceVariant;
  title: string;
  sourceFile: string;
  sha256: string;
  sizeBytes: number;
  durationSec?: number;
  width?: number;
  height?: number;
  renderedAt?: number;
  playbackPolicy: PlaybackPolicy;
  muxUploadId?: string;
  muxAssetId?: string;
  muxPlaybackId?: string;
  status: ExperienceStatus;
  uploadedAt?: number;
  captionsSourcePaths?: { vtt?: string; srt?: string };
  error?: string;
}
export interface ExperiencesManifest { version: 1; generatedAt: number; entries: Record<string, ManifestEntry> }

export const emptyManifest = (): ExperiencesManifest => ({ version: 1, generatedAt: 0, entries: {} });

export type PlanAction = 'upload' | 'skip-uploaded' | 'skip-legacy' | 'missing-file' | 'changed-reupload' | 'resume-poll';
export interface PlanItem {
  entry: CatalogEntry;
  action: PlanAction;
  sha256?: string;
  sizeBytes?: number;
  reason: string;
}
export interface FileFact { exists: boolean; sha256?: string; sizeBytes?: number }

/**
 * Decides, per catalog entry, what an upload run would do.
 *  - already in the manifest with the SAME sha and a Mux asset id  -> skip (idempotent);
 *  - in the manifest with the same sha but no asset id (a run died after the upload URL was minted) -> upload again,
 *    never silently treated as done;
 *  - same id but a different sha (the film was re-rendered) -> 'changed-reupload', which creates a NEW Mux asset and
 *    leaves the old one for the owner to delete in Mux (the script never deletes anything);
 *  - legacy entries are skipped unless includeLegacy.
 */
export function planUploads(
  catalog: readonly CatalogEntry[],
  manifest: ExperiencesManifest,
  files: Record<string, FileFact>,
  opts: { includeLegacy?: boolean; only?: string[]; force?: boolean } = {},
): PlanItem[] {
  const only = opts.only?.length ? new Set(opts.only) : null;
  return catalog.filter(c => !only || only.has(c.id)).map((entry): PlanItem => {
    if (entry.legacy && !opts.includeLegacy && !(only && only.has(entry.id))) {
      return { entry, action: 'skip-legacy', reason: 'older explainer; pass --include-legacy (or --only=' + entry.id + ') to upload' };
    }
    const f = files[entry.id];
    if (!f?.exists || !f.sha256) return { entry, action: 'missing-file', reason: `${entry.file} not found` };
    const prev = manifest.entries[entry.id];
    const base = { entry, sha256: f.sha256, sizeBytes: f.sizeBytes };
    if (prev && prev.sha256 === f.sha256 && prev.muxAssetId && !opts.force) {
      return { ...base, action: 'skip-uploaded', reason: `already on Mux as asset ${prev.muxAssetId} (same sha256)` };
    }
    if (prev && prev.sha256 !== f.sha256 && prev.muxAssetId) {
      return { ...base, action: 'changed-reupload', reason: 'file changed since the last upload; will create a NEW Mux asset (the old one is left for you to delete)' };
    }
    return { ...base, action: 'upload', reason: prev ? 'previous attempt never produced an asset; retrying' : 'not on Mux yet' };
  });
}

export function manifestEntryFrom(entry: CatalogEntry, f: { sha256: string; sizeBytes: number; durationSec?: number; width?: number; height?: number; renderedAt?: number }, policy: PlaybackPolicy): ManifestEntry {
  return stripUndefined({
    id: entry.id, exhibitId: entry.exhibitId, variant: entry.variant, title: entry.title,
    sourceFile: entry.file, sha256: f.sha256, sizeBytes: f.sizeBytes,
    durationSec: f.durationSec, width: f.width, height: f.height, renderedAt: f.renderedAt,
    playbackPolicy: policy, status: 'planned' as ExperienceStatus,
    captionsSourcePaths: entry.vtt || entry.srt ? { vtt: entry.vtt, srt: entry.srt } : undefined,
  });
}

/** Manifest entry -> the admin-only Firestore record (used by the admin UI's "Import manifest"). */
export function manifestEntryToRecord(m: ManifestEntry, now = Date.now(), prev?: ExperienceRecord): ExperienceRecord {
  const cat = catalogFor(m.id);
  const keepStatus = prev && prev.status === 'ready' && prev.muxAssetId === m.muxAssetId;
  return stripUndefined({
    ...(prev || {}),
    id: m.id,
    title: prev?.title || m.title,
    description: prev?.description || cat?.description,
    exhibitId: m.exhibitId,
    kind: 'film' as const,
    variant: m.variant,
    status: keepStatus ? prev!.status : m.status,
    muxUploadId: m.muxUploadId, muxAssetId: m.muxAssetId, muxPlaybackId: m.muxPlaybackId,
    playbackPolicy: m.playbackPolicy,
    durationSec: m.durationSec ?? prev?.durationSec, width: m.width ?? prev?.width, height: m.height ?? prev?.height,
    captionsSourcePaths: m.captionsSourcePaths,
    sourceFile: m.sourceFile, sourceSha256: m.sha256, sizeBytes: m.sizeBytes, renderedAt: m.renderedAt,
    createdAt: prev?.createdAt ?? now, updatedAt: now,
    error: m.error,
  }) as ExperienceRecord;
}

/** Asset fields from Mux's `GET /video/v1/assets/{id}` (the shape /api/mux/playback hands back as `asset`). */
export interface MuxAssetLike {
  status?: string;
  duration?: number;
  aspect_ratio?: string;
  max_stored_resolution?: string;
  max_stored_frame_rate?: number;
  playback_ids?: { id: string; policy?: string }[];
  tracks?: { type?: string; max_width?: number; max_height?: number }[];
  errors?: { messages?: string[] };
}

/** Folds a Mux asset into a record: status, playback id and policy, duration, size. Pure; the caller writes it. */
export function applyMuxAsset(rec: ExperienceRecord, asset: MuxAssetLike, now = Date.now()): ExperienceRecord {
  const pb = asset.playback_ids?.[0];
  const video = asset.tracks?.find(t => t.type === 'video');
  const status: ExperienceStatus = asset.status === 'ready' ? 'ready' : asset.status === 'errored' ? 'errored' : 'processing';
  return stripUndefined({
    ...rec,
    status,
    muxPlaybackId: pb?.id ?? rec.muxPlaybackId,
    playbackPolicy: (pb?.policy === 'signed' ? 'signed' : pb?.policy === 'public' ? 'public' : rec.playbackPolicy) as PlaybackPolicy,
    durationSec: typeof asset.duration === 'number' && asset.duration > 0 ? Math.round(asset.duration * 100) / 100 : rec.durationSec,
    width: video?.max_width ?? rec.width,
    height: video?.max_height ?? rec.height,
    error: status === 'errored' ? (asset.errors?.messages?.join('; ') || 'Mux reported an error') : undefined,
    updatedAt: now,
  });
}

// ── Hall: the public doc and the player's choice ─────────────────────────────

/** Why a record cannot be put in the hall (empty when it can). */
export function hallBlockers(rec: ExperienceRecord): string[] {
  const out: string[] = [];
  if (rec.status !== 'ready') out.push('The asset is not ready on Mux yet.');
  if (!rec.muxPlaybackId) out.push('No playback id.');
  if (rec.playbackPolicy !== 'public') out.push('Signed playback is not supported by the platform players yet; the hall cannot play it.');
  if (!(rec.durationSec && rec.durationSec > 0)) out.push('Duration unknown: refresh the asset from Mux first.');
  if (rec.variant === 'legacy') out.push('Legacy explainers are not used in the hall (publish a council film instead).');
  return out;
}

/** The minimal public document for a record, or null when it must not be served to visitors. */
export function toPublicFilm(rec: ExperienceRecord, now = Date.now()): ExperienceFilmPublic | null {
  if (hallBlockers(rec).length) return null;
  return stripUndefined({
    exhibitId: rec.exhibitId,
    experienceId: rec.id,
    title: rec.title.slice(0, 200),
    muxPlaybackId: rec.muxPlaybackId!,
    playbackPolicy: 'public' as const,
    durationSec: rec.durationSec!,
    width: rec.width || 1920,
    height: rec.height || 1080,
    captionsUrl: rec.captionsUrl,
    updatedAt: now,
  });
}

/** Validates a document read from `experienceFilms` before trusting it (a malformed doc must fall back to canvas, not break). */
export function parsePublicFilm(raw: unknown): ExperienceFilmPublic | null {
  const d = raw as Partial<ExperienceFilmPublic> | null | undefined;
  if (!d || typeof d !== 'object') return null;
  if (typeof d.muxPlaybackId !== 'string' || !/^[A-Za-z0-9]{8,200}$/.test(d.muxPlaybackId)) return null;
  if (d.playbackPolicy !== 'public') return null;
  if (typeof d.exhibitId !== 'string' || !d.exhibitId) return null;
  const dur = Number(d.durationSec);
  if (!(dur > 0)) return null;
  return {
    exhibitId: d.exhibitId,
    experienceId: typeof d.experienceId === 'string' ? d.experienceId : '',
    title: typeof d.title === 'string' ? d.title : '',
    muxPlaybackId: d.muxPlaybackId,
    playbackPolicy: 'public',
    durationSec: dur,
    width: Number(d.width) > 0 ? Number(d.width) : 1920,
    height: Number(d.height) > 0 ? Number(d.height) : 1080,
    captionsUrl: typeof d.captionsUrl === 'string' && /^https?:\/\/|^\//.test(d.captionsUrl) ? d.captionsUrl : undefined,
    updatedAt: Number(d.updatedAt) || 0,
  };
}

export type FilmSource =
  | { kind: 'mux'; film: ExperienceFilmPublic; src: string; poster: string; mp4: string }
  | { kind: 'canvas' }
  | { kind: 'none' };

/**
 * Which film the "Watch the film" button opens.
 *  mux    : a valid public film doc exists and Mux has not failed in this session;
 *  canvas : otherwise, when the exhibit has its live canvas film (the code-rendered original, always the fallback);
 *  none   : no canvas film and no usable Mux film, so no button.
 * `muxFailed` is set by the player when HLS and the MP4 fallback both error, which re-resolves to canvas.
 */
export function selectFilmSource(args: { published: unknown; hasCanvasFilm: boolean; muxFailed?: boolean }): FilmSource {
  const film = args.muxFailed ? null : parsePublicFilm(args.published);
  if (film) return { kind: 'mux', film, src: streamUrl(film.muxPlaybackId), poster: posterUrl(film.muxPlaybackId), mp4: mp4FallbackUrl(film.muxPlaybackId) };
  return args.hasCanvasFilm ? { kind: 'canvas' } : { kind: 'none' };
}

// ── Reello ───────────────────────────────────────────────────────────────────

export const REELLO_ATTRIBUTION = 'Plajah Dossier';

export function reelloBlockers(rec: ExperienceRecord): string[] {
  const out: string[] = [];
  if (rec.status !== 'ready' || !rec.muxPlaybackId) out.push('The asset is not ready on Mux yet.');
  // Every Reello player builds an unsigned stream.mux.com URL, so a signed asset would be a black player.
  if (rec.playbackPolicy !== 'public') out.push('Reello players cannot play signed Mux assets.');
  if (rec.publishedReelloId) out.push('Already published as a Reello video.');
  return out;
}

export interface ReelloContext {
  ownerId: string;
  /** Visibility is explicit. 'private' is the default and 'public' needs the caller to have confirmed. */
  visibility: 'private' | 'public';
  exhibitTitle?: string;
  now?: number;
}

/**
 * The normal Reello `videos/{id}` document for an Experience. It is a Mux-only video (empty `url`, a muxPlaybackId),
 * exactly the shape uploadVideo() writes, so every existing Reello surface plays it. Private unless the admin says
 * otherwise: nothing here ever auto-publishes.
 */
export function experienceToReelloVideo(rec: ExperienceRecord, ctx: ReelloContext): Record<string, unknown> {
  const now = ctx.now ?? Date.now();
  const credits = [
    `A ${REELLO_ATTRIBUTION} film${ctx.exhibitTitle ? ` from the ${ctx.exhibitTitle} exhibit` : ''}.`,
    'Archive images are credited to their sources in the exhibit; reconstructions are labelled as such.',
  ].join(' ');
  const description = [rec.description?.trim(), credits, `Credits: ${REELLO_ATTRIBUTION}.`].filter(Boolean).join('\n\n').slice(0, 1990);
  const tags = ['Plajah Dossier', 'Documentary', ...(ctx.exhibitTitle ? [ctx.exhibitTitle] : [])].filter((t, i, a) => a.indexOf(t) === i);
  return stripUndefined({
    id: `vid_${now}`,
    ownerId: ctx.ownerId,
    title: rec.title.slice(0, 190),
    url: '',
    muxPlaybackId: rec.muxPlaybackId,
    muxAssetId: rec.muxAssetId,
    thumbnailUrl: rec.muxPlaybackId ? posterUrl(rec.muxPlaybackId) : undefined,
    coverImageUrl: rec.muxPlaybackId ? posterUrl(rec.muxPlaybackId) : undefined,
    description,
    price: 0,
    isPaywalled: false,
    genre: 'Documentary',
    category: 'DOCUMENTARY',
    artist: REELLO_ATTRIBUTION,
    isPrivate: ctx.visibility !== 'public',
    isRello: true,
    timestamp: now,
    likesCount: 0,
    commentsCount: 0,
    tags,
    duration: rec.durationSec ? Math.round(rec.durationSec) : undefined,
    subtitles: rec.captionsUrl ? [{ label: 'English', srclang: 'en', url: rec.captionsUrl, default: true }] : undefined,
    allowInFastChannel: false,
    isAdSupported: false,
    sourceExperienceId: rec.id,
    sourceExhibitId: rec.exhibitId,
  });
}
