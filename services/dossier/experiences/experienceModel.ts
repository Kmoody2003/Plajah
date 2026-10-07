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
 * Two kinds of content live here (ExperienceKind):
 *   'film'        : a SHORT EXHIBIT FILM (the council films). The REELLO video is the source of truth: the canonical publish
 *                   flow is "Publish as Reello video", and "Use in the hall" is only possible once that Reello video is
 *                   published PUBLIC. The public hall doc then carries `reelloVideoId` and a `muxPlaybackId` copied from
 *                   that Reello video. If the Reello video goes private or is deleted, the hall doc is removed and the hall
 *                   falls back to the live canvas film.
 *   'interactive' : additional interactive content inside an exhibit (today: the animated Bunker Hill painting). It may
 *                   be uploaded to Mux and listed here, admin-only, but it is NOT an exhibit film: no Reello publish, no
 *                   hall actions, never the exhibit's film.
 *
 * Security model in one paragraph: `experiences` holds the whole asset record (Mux asset id, source file,
 * sha, uploader) and is readable/writable by platform admins only. A visitor never reads it. When an admin presses
 * "Use in the hall", the minimal playback fields are copied to `experienceFilms/{exhibitId}`, which anyone may read
 * (the playback id of a public Mux asset is not a secret: it is in every browser's network tab the moment the film
 * plays) and only a platform admin may write. Unpublishing deletes that one document and the hall falls back to the
 * live canvas film on the next open. Playback is PUBLIC only: signed playback is not supported anywhere.
 */

export type ExperienceStatus = 'planned' | 'uploading' | 'processing' | 'ready' | 'errored';
/** The app has no signed-playback support (every player builds https://stream.mux.com/{id}.m3u8 with no token), so
 *  'public' is the only policy the platform plays and the only one the upload script and admin UI offer. 'signed' exists
 *  in the type ONLY so a record whose Mux asset turns out to be signed is shown honestly ("signed, unsupported") and kept
 *  out of the hall and Reello. */
export type PlaybackPolicy = 'public' | 'signed';
export type ExperienceVariant = 'council' | 'legacy' | 'demo';
/** 'film' = a short exhibit film (Reello is its source of truth); 'interactive' = extra interactive content in an exhibit. */
export type ExperienceKind = 'film' | 'interactive';

export interface ExperienceRecord {
  id: string;
  title: string;
  description?: string;
  exhibitId: string;
  kind: ExperienceKind;
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
  /** The Reello `videos/{id}` created from this asset, once the admin chose to publish it. Films only; the source of truth for the hall. */
  publishedReelloId?: string;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

/** What a visitor may read. Nothing here identifies the uploader, the asset id, the source path or the hash. */
export interface ExperienceFilmPublic {
  exhibitId: string;
  experienceId: string;
  /** The PUBLIC Reello `videos/{id}` this hall film is sourced from. */
  reelloVideoId: string;
  title: string;
  /** Copied from that Reello video's Mux playback id, so visitors never need to read `videos/`. */
  muxPlaybackId: string;
  playbackPolicy: 'public';
  durationSec: number;
  width: number;
  height: number;
  captionsUrl?: string;
  updatedAt: number;
}

export const EXPERIENCE_FILM_PUBLIC_KEYS: readonly (keyof ExperienceFilmPublic)[] = [
  'exhibitId', 'experienceId', 'reelloVideoId', 'title', 'muxPlaybackId', 'playbackPolicy', 'durationSec', 'width', 'height', 'captionsUrl', 'updatedAt',
];
/** Keys firestore.rules requires on every experienceFilms doc (the rest are optional). A test pins the rules to these lists. */
export const EXPERIENCE_FILM_REQUIRED_KEYS: readonly (keyof ExperienceFilmPublic)[] = [
  'exhibitId', 'experienceId', 'reelloVideoId', 'title', 'muxPlaybackId', 'playbackPolicy', 'durationSec', 'updatedAt',
];

// ── Catalog ──────────────────────────────────────────────────────────────────

export interface CatalogEntry {
  id: string;
  title: string;
  description: string;
  exhibitId: string;
  /** 'film' entries are exhibit films (Reello + hall); 'interactive' entries are Mux assets only (no Reello, no hall). */
  kind: ExperienceKind;
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
  { id: 'douglass-council', kind: 'film', exhibitId: 'frederick-douglass', variant: 'council', title: 'Frederick Douglass: the film', description: 'A Plajah Dossier film on the life of Frederick Douglass, made from cleared archive images, sourced narration and reconstructions labelled as such.', file: `${D}/douglass-explainer-council.mp4`, vtt: `${D}/douglass-explainer-council.vtt`, srt: `${D}/douglass-explainer-council.srt` },
  { id: 'ford-council', kind: 'film', exhibitId: 'henry-ford', variant: 'council', title: 'Henry Ford: the film', description: 'A Plajah Dossier film on Henry Ford and the assembly line, made from cleared archive images, sourced narration and reconstructions labelled as such.', file: `${D}/ford-explainer-council.mp4`, vtt: `${D}/ford-explainer-council.vtt`, srt: `${D}/ford-explainer-council.srt` },
  { id: 'persia-council', kind: 'film', exhibitId: 'christianity-in-persia', variant: 'council', title: 'Christianity in Persia: the film', description: 'A Plajah Dossier film on two thousand years of Christianity on the roads of Persia, made from cleared archive images and sourced narration.', file: `${D}/persia-explainer-council.mp4`, vtt: `${D}/persia-explainer-council.vtt`, srt: `${D}/persia-explainer-council.srt` },
  { id: 'partition-council', kind: 'film', exhibitId: 'partition-1947', variant: 'council', title: 'The Partition of India, 1947: the film', description: 'A Plajah Dossier film on the five weeks in which a line was drawn through Punjab and Bengal, made from cleared archive images and sourced narration.', file: `${D}/partition-explainer-council.mp4`, vtt: `${D}/partition-explainer-council.vtt`, srt: `${D}/partition-explainer-council.srt` },
  { id: 'founding-battle-demo', kind: 'interactive', exhibitId: 'founding-era', variant: 'demo', title: 'The Founding Era: animated Bunker Hill painting', description: 'Interactive content inside the Founding Era exhibit: John Trumbull’s painting of Bunker Hill, given motion in code (labelled ANIMATED PAINTING). Silent. NOT an exhibit film: it has no Reello or hall actions and is never the Founding Era’s film.', file: `${D}/founding-battle-demo.mp4`, vtt: `${D}/founding-battle-demo.vtt`, srt: `${D}/founding-battle-demo.srt` },
  { id: 'douglass-legacy', kind: 'film', exhibitId: 'frederick-douglass', variant: 'legacy', legacy: true, title: 'Frederick Douglass: first explainer', description: 'The original (pre-council) Douglass explainer, kept for the record.', file: `${D}/douglass-explainer.mp4`, srt: `${D}/douglass-explainer.srt` },
  { id: 'ford-legacy', kind: 'film', exhibitId: 'henry-ford', variant: 'legacy', legacy: true, title: 'Henry Ford: first explainer', description: 'The original (pre-council) Ford explainer, kept for the record.', file: `${D}/ford-explainer.mp4`, srt: `${D}/ford-explainer.srt` },
  { id: 'persia-legacy', kind: 'film', exhibitId: 'christianity-in-persia', variant: 'legacy', legacy: true, title: 'Christianity in Persia: first explainer', description: 'The original (pre-council) Persia explainer, kept for the record.', file: `${D}/persia-explainer.mp4`, srt: `${D}/persia-explainer.srt` },
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
  /** Absent in manifests written before the kind split: the catalog decides. */
  kind?: ExperienceKind;
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
    id: entry.id, exhibitId: entry.exhibitId, kind: entry.kind, variant: entry.variant, title: entry.title,
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
    kind: (cat?.kind ?? m.kind ?? 'film') as ExperienceKind,
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

/** What the admin tools know about the Reello `videos/{id}` a record was published as (read live from Firestore). */
export interface ReelloVideoState {
  /** False when the document read succeeded and there is no such video (deleted). Never set from a failed read. */
  exists: boolean;
  /** True while the video is private (isPrivate !== false). Meaningless when !exists. */
  isPrivate?: boolean;
  /** The Mux playback id the Reello video itself plays: the hall copies THIS one. */
  muxPlaybackId?: string;
}

/** The Reello video is public, exists and plays Mux: the only state in which the hall may use the film. */
export const reelloIsPublic = (s?: ReelloVideoState | null): boolean => !!s && s.exists && s.isPrivate === false && !!s.muxPlaybackId;

/** Is this record an exhibit film (Reello + hall), as opposed to additional interactive content? */
export const isExhibitFilm = (rec: Pick<ExperienceRecord, 'kind'>): boolean => rec.kind === 'film';

/** The reason interactive content gets no Reello or hall actions. Shown in the admin UI and used by the service guards. */
export const INTERACTIVE_NO_ACTIONS = 'Interactive content inside an exhibit, not an exhibit film: it is uploaded to Mux for the exhibit to use, with no Reello or hall actions.';

/**
 * Why a record cannot be put in the hall (empty when it can). The REELLO video is the source of truth: a film is only
 * eligible once it has been published as a Reello video AND that video is public. `reello` is the live state of
 * `videos/{publishedReelloId}`; `undefined` means "not read yet" and blocks (it is never assumed public).
 */
export function hallBlockers(rec: ExperienceRecord, reello?: ReelloVideoState | null): string[] {
  const out: string[] = [];
  if (!isExhibitFilm(rec)) return [INTERACTIVE_NO_ACTIONS];
  if (rec.variant === 'legacy') out.push('Legacy explainers are not used in the hall (publish a council film instead).');
  if (rec.status !== 'ready') out.push('The asset is not ready on Mux yet.');
  if (!rec.muxPlaybackId) out.push('No playback id.');
  if (rec.playbackPolicy !== 'public') out.push('Signed playback is not supported (public playback only); the hall cannot play it.');
  if (!(rec.durationSec && rec.durationSec > 0)) out.push('Duration unknown: refresh the asset from Mux first.');
  if (!rec.publishedReelloId) out.push('Publish this film as a Reello video first, and make it public: the Reello video is the source of truth for the hall.');
  else if (reello === undefined) out.push('Checking the Reello video…');
  else if (!reello || !reello.exists) out.push('The Reello video no longer exists. Unlink it and publish the film again.');
  else if (reello.isPrivate !== false) out.push('The Reello video is private. Make it public on Reello first: the hall only uses a public Reello video.');
  else if (!reello.muxPlaybackId) out.push('The Reello video has no Mux playback id.');
  return out;
}

/**
 * The hall's film no longer matches its source: it is in the hall but the Reello video is private or gone. The admin tools
 * remove such a doc (reconcile); this is the single predicate both the service and the UI use.
 */
export function hallIsStale(rec: ExperienceRecord, reello?: ReelloVideoState | null): boolean {
  return !!rec.inHall && reello !== undefined && !reelloIsPublic(reello);
}

/** A non-blocking note when the Reello video plays a different Mux asset than this record (for example the file was replaced after publishing). */
export function reelloDrift(rec: ExperienceRecord, reello?: ReelloVideoState | null): string | null {
  if (!reello?.exists || !reello.muxPlaybackId || !rec.muxPlaybackId || reello.muxPlaybackId === rec.muxPlaybackId) return null;
  return 'The Reello video plays an older Mux asset than this record (the file was replaced after publishing). The hall follows the Reello video.';
}

/** The minimal public document for a record, or null when it must not be served to visitors. */
export function toPublicFilm(rec: ExperienceRecord, reello: ReelloVideoState | null | undefined, now = Date.now()): ExperienceFilmPublic | null {
  if (hallBlockers(rec, reello).length) return null;
  return stripUndefined({
    exhibitId: rec.exhibitId,
    experienceId: rec.id,
    reelloVideoId: rec.publishedReelloId!,
    title: rec.title.slice(0, 200),
    muxPlaybackId: reello!.muxPlaybackId!,
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
  // The Reello video is the source of truth: a hall doc that does not name one is not a valid hall film.
  if (typeof d.reelloVideoId !== 'string' || !d.reelloVideoId) return null;
  const dur = Number(d.durationSec);
  if (!(dur > 0)) return null;
  return {
    exhibitId: d.exhibitId,
    experienceId: typeof d.experienceId === 'string' ? d.experienceId : '',
    reelloVideoId: d.reelloVideoId,
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

/** Why a record cannot be published as a Reello video (empty when it can). Only exhibit films can: never interactive content. */
export function reelloBlockers(rec: ExperienceRecord): string[] {
  const out: string[] = [];
  if (!isExhibitFilm(rec)) return [INTERACTIVE_NO_ACTIONS];
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
 * exactly the shape uploadVideo() writes, so every existing Reello surface plays it. This is the canonical way to publish an
 * exhibit film: the Reello video is the source of truth the hall then follows. Private unless the admin says otherwise
 * (public needs the explicit choice plus a confirm in the UI); nothing here ever auto-publishes or notifies followers.
 */
export function experienceToReelloVideo(rec: ExperienceRecord, ctx: ReelloContext): Record<string, unknown> {
  if (!isExhibitFilm(rec)) throw new Error(INTERACTIVE_NO_ACTIONS);
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
