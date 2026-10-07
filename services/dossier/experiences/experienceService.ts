/**
 * Admin-side service for the Experiences area. Every function here is for a signed-in PLATFORM ADMIN: the Firestore
 * rules are the real gate (`experiences` read/write = isAdmin(); `experienceFilms` write = isAdmin()), this module
 * only avoids pretending otherwise. It reuses the platform's existing Mux plumbing rather than adding another stack:
 *   - uploads go through uploadVideoFileMux()  -> POST /api/mux/upload (direct upload, UpChunk, resumable, ledgered)
 *   - readiness goes through pollMuxUploadUntilReady() -> GET /api/mux/asset + GET /api/mux/playback
 *   - a Reello video is the same `videos/{id}` document uploadVideo() writes for a Mux-only upload.
 */
import { collection, deleteDoc, doc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { auth, db, pollMuxUploadUntilReady, uploadFile, uploadVideoFileMux } from '../../backendService';
import { buildProvenance } from '../../creatorPassport';
import { forgetHallFilm } from './experienceFilmClient';
import {
  applyMuxAsset, catalogFor, experienceToReelloVideo, hallBlockers, manifestEntryToRecord, reelloBlockers, srtToVtt, stripUndefined, toPublicFilm,
  type ExperienceRecord, type ExperiencesManifest, type MuxAssetLike,
} from './experienceModel';

const COL = 'experiences';
const HALL = 'experienceFilms';

const token = async () => {
  const t = await auth.currentUser?.getIdToken();
  if (!t) throw new Error('Sign in required.');
  return t;
};

export async function listExperiences(): Promise<ExperienceRecord[]> {
  const snap = await getDocs(collection(db, COL));
  return snap.docs.map(d => ({ ...(d.data() as ExperienceRecord), id: d.id })).sort((a, b) => a.exhibitId.localeCompare(b.exhibitId) || a.variant.localeCompare(b.variant));
}

export const saveExperience = (rec: ExperienceRecord) => setDoc(doc(db, COL, rec.id), stripUndefined(rec));
const patchExperience = (id: string, patch: Partial<ExperienceRecord>) => updateDoc(doc(db, COL, id), stripUndefined({ ...patch, updatedAt: Date.now() }));

// ── Mux (through the platform's existing endpoints) ──────────────────────────

async function fetchMuxAsset(assetId: string): Promise<MuxAssetLike & { id?: string }> {
  const res = await fetch(`/api/mux/playback?assetId=${encodeURIComponent(assetId)}`, { headers: { Authorization: `Bearer ${await token()}` } });
  if (!res.ok) throw new Error(`Mux asset lookup failed (HTTP ${res.status}).`);
  return (await res.json()).asset;
}
async function assetIdForUpload(uploadId: string): Promise<string | null> {
  const res = await fetch(`/api/mux/asset?uploadId=${encodeURIComponent(uploadId)}`, { headers: { Authorization: `Bearer ${await token()}` } });
  if (!res.ok) return null;
  const j = await res.json();
  return j.status === 'asset_created' && j.assetId ? j.assetId : null;
}

/** Re-reads the asset from Mux and folds status / playback id / duration / size into the record. */
export async function refreshExperience(rec: ExperienceRecord): Promise<ExperienceRecord> {
  let assetId = rec.muxAssetId;
  if (!assetId && rec.muxUploadId) assetId = (await assetIdForUpload(rec.muxUploadId)) || undefined;
  if (!assetId) return rec;
  const asset = await fetchMuxAsset(assetId);
  const next = applyMuxAsset({ ...rec, muxAssetId: assetId }, asset);
  await saveExperience(next);
  if (next.inHall) await syncHall(next);
  return next;
}

const sha256Hex = async (file: Blob) => {
  const buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Admin "Upload": the file goes browser -> Mux (direct upload), the record is written FIRST so a closed tab leaves a
 * visible 'uploading' row, and a background poll fills in the playback id once Mux has transcoded.
 */
export async function uploadExperience(args: { slotId: string; file: File; onProgress?: (p: number) => void; existing?: ExperienceRecord }): Promise<ExperienceRecord> {
  const cat = catalogFor(args.slotId);
  if (!cat) throw new Error(`Unknown experience slot: ${args.slotId}`);
  const now = Date.now();
  const sha = await sha256Hex(args.file).catch(() => undefined);
  const base: ExperienceRecord = {
    ...(args.existing || {}),
    id: cat.id, title: args.existing?.title || cat.title, description: args.existing?.description || cat.description,
    exhibitId: cat.exhibitId, kind: 'film', variant: cat.variant, status: 'uploading', playbackPolicy: 'public',
    sourceFile: cat.file, sourceSha256: sha, sizeBytes: args.file.size, renderedAt: args.file.lastModified || undefined,
    captionsSourcePaths: { vtt: cat.vtt, srt: cat.srt },
    createdAt: args.existing?.createdAt ?? now, updatedAt: now,
    // A different file means a different Mux asset: drop the old ids (the old asset stays in Mux for the owner to delete).
    muxAssetId: undefined, muxPlaybackId: undefined, muxUploadId: undefined, error: undefined,
  };
  await saveExperience(base);
  let uploadId: string;
  try {
    uploadId = await uploadVideoFileMux(args.file, args.onProgress, undefined, { surface: 'OTHER', role: 'DOSSIER_FILM', targetId: `exp_${cat.id}`, targetTitle: cat.title });
  } catch (e: any) {
    await patchExperience(cat.id, { status: 'errored', error: String(e?.message || e).slice(0, 300) });
    throw e;
  }
  const processing: ExperienceRecord = { ...base, status: 'processing', muxUploadId: uploadId };
  await saveExperience(processing);
  pollMuxUploadUntilReady(uploadId, async (_pid, assetId) => {
    try { await refreshExperience({ ...processing, muxAssetId: assetId }); } catch { /* the admin can press Refresh */ }
  }, 450, 4000);
  return processing;
}

/** "Import manifest": creates/updates admin records from data/dossier/experiences-manifest.json (written by the upload script). */
export async function importManifest(manifest: ExperiencesManifest, existing: ExperienceRecord[]): Promise<number> {
  if (manifest?.version !== 1 || typeof manifest.entries !== 'object') throw new Error('That file is not an experiences manifest (version 1).');
  let n = 0;
  for (const m of Object.values(manifest.entries)) {
    if (!catalogFor(m.id)) continue;
    await saveExperience(manifestEntryToRecord(m, Date.now(), existing.find(r => r.id === m.id)));
    n++;
  }
  return n;
}

// ── Captions ─────────────────────────────────────────────────────────────────

/** Accepts a .vtt (used as is) or .srt (converted to WebVTT; the SRT is kept too). Stored under the admin's own users/ path. */
export async function attachCaptions(rec: ExperienceRecord, file: File): Promise<ExperienceRecord> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in required.');
  const text = await file.text();
  const isSrt = /\.srt$/i.test(file.name) || (!/^\s*WEBVTT/.test(text) && /\d\d:\d\d:\d\d,\d{3}\s*-->/.test(text));
  const vtt = new File([srtToVtt(text)], `${rec.id}.en.vtt`, { type: 'text/vtt' });
  const captionsUrl = await uploadFile(`users/${uid}/experiences/${rec.id}/${rec.id}.en.vtt`, vtt);
  const captionsSrtUrl = isSrt ? await uploadFile(`users/${uid}/experiences/${rec.id}/${rec.id}.en.srt`, new File([text], `${rec.id}.en.srt`, { type: 'text/plain' })) : rec.captionsSrtUrl;
  const next = { ...rec, captionsUrl, captionsSrtUrl, updatedAt: Date.now() };
  await saveExperience(next);
  if (next.inHall) await syncHall(next);
  return next;
}

// ── Hall (public playback doc) ───────────────────────────────────────────────

async function syncHall(rec: ExperienceRecord) {
  const pub = toPublicFilm(rec);
  if (pub) await setDoc(doc(db, HALL, rec.exhibitId), stripUndefined(pub));
  forgetHallFilm(rec.exhibitId);
}

/** Puts a ready, public, timed record in front of every visitor of its exhibit (replacing any previous film for that exhibit). */
export async function putInHall(rec: ExperienceRecord): Promise<ExperienceRecord> {
  const blockers = hallBlockers(rec);
  if (blockers.length) throw new Error(blockers.join(' '));
  const others = await getDocs(query(collection(db, COL), where('exhibitId', '==', rec.exhibitId), where('inHall', '==', true)));
  for (const d of others.docs) if (d.id !== rec.id) await patchExperience(d.id, { inHall: false });
  const next = { ...rec, inHall: true, updatedAt: Date.now() };
  await syncHall(next);
  await saveExperience(next);
  return next;
}

/** Takes the exhibit's Mux film down: the hall goes back to the live canvas film. Only deletes the doc if it is THIS record's. */
export async function removeFromHall(rec: ExperienceRecord): Promise<ExperienceRecord> {
  if (!rec.inHall) return rec;
  await deleteDoc(doc(db, HALL, rec.exhibitId));
  forgetHallFilm(rec.exhibitId);
  const next = { ...rec, inHall: false, updatedAt: Date.now() };
  await saveExperience(next);
  return next;
}

// ── Reello ───────────────────────────────────────────────────────────────────

/**
 * "Publish as Reello video": creates a normal `videos/{id}` document owned by the acting admin, attributed to
 * Plajah Dossier. PRIVATE unless the admin explicitly picks public (and the UI makes them confirm). It never notifies
 * followers and never touches any feed beyond the document itself.
 */
export async function publishAsReello(rec: ExperienceRecord, visibility: 'private' | 'public'): Promise<ExperienceRecord> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in required.');
  const blockers = reelloBlockers(rec);
  if (blockers.length) throw new Error(blockers.join(' '));
  const { DOSSIERS } = await import('../../../data/dossier/registry');
  const exhibitTitle = DOSSIERS.find(d => d.id === rec.exhibitId)?.title;
  const video = experienceToReelloVideo(rec, { ownerId: uid, visibility, exhibitTitle });
  const withProvenance = { ...video, provenance: buildProvenance({ videoId: String(video.id), ownerId: uid }) };
  await setDoc(doc(db, 'videos', String(video.id)), stripUndefined(withProvenance));
  const next = { ...rec, publishedReelloId: String(video.id), updatedAt: Date.now() };
  await saveExperience(next);
  return next;
}

/** Flips the published Reello video between private and public. */
export async function setReelloVisibility(rec: ExperienceRecord, visibility: 'private' | 'public'): Promise<void> {
  if (!rec.publishedReelloId) throw new Error('Not published to Reello.');
  await updateDoc(doc(db, 'videos', rec.publishedReelloId), { isPrivate: visibility !== 'public' });
}
