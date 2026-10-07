/**
 * The upload loop behind scripts/dossier/uploadExperiences.ts, with the Mux client and the clock injected so it can be
 * unit-tested with a fake. Nothing in here touches the network, the disk, or a Mux credential on its own.
 *
 * Crash safety: the manifest is saved after EVERY state change (upload url minted, bytes sent, asset created, asset
 * ready), so a run that dies halfway leaves a manifest that says exactly how far each file got, and the next run's
 * planUploads() retries only what never produced an asset.
 */
import {
  applyMuxAsset, buildPassthrough, manifestEntryFrom, stripUndefined,
  type ExperiencesManifest, type ManifestEntry, type MuxAssetLike, type PlanItem, type PlaybackPolicy,
} from './experienceModel';

export interface MuxUploadClient {
  /** Mints a direct-upload URL; the asset created from it carries `passthrough` and the playback policy. */
  createDirectUpload(opts: { passthrough: string; policy: PlaybackPolicy }): Promise<{ id: string; url: string }>;
  /** PUTs the file bytes to the direct-upload URL. */
  putFile(url: string, file: string, sizeBytes: number, onProgress?: (fraction: number) => void): Promise<void>;
  /** Resolves with the asset id once Mux has created it from the upload. */
  waitForAsset(uploadId: string): Promise<string>;
  /** Resolves with the asset once it is ready (or errored). */
  waitForReady(assetId: string): Promise<MuxAssetLike>;
}

export interface FileProbe { durationSec?: number; width?: number; height?: number; renderedAt?: number }

export interface UploadDeps {
  client: MuxUploadClient;
  manifest: ExperiencesManifest;
  /** Persist the manifest (called after each state change). */
  save: (m: ExperiencesManifest) => void;
  probe: (file: string) => FileProbe;
  policy: PlaybackPolicy;
  now?: () => number;
  log?: (line: string) => void;
}

export interface UploadOutcome { id: string; result: 'uploaded' | 'errored' | 'skipped'; assetId?: string; playbackId?: string; error?: string }

/** Cost/consumption summary for a plan: what a real run would send to Mux. Pure. */
export function summarizePlan(plan: PlanItem[], probe: (file: string) => FileProbe) {
  const doing = plan.filter(p => p.action === 'upload' || p.action === 'changed-reupload');
  let bytes = 0, seconds = 0, unknown = 0;
  for (const p of doing) {
    bytes += p.sizeBytes || 0;
    const d = probe(p.entry.file).durationSec;
    if (d) seconds += d; else unknown++;
  }
  return { files: doing.length, bytes, seconds, minutes: Math.round(seconds / 6) / 10, unknownDurations: unknown };
}

export async function runUploads(plan: PlanItem[], deps: UploadDeps): Promise<UploadOutcome[]> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? (() => {});
  const out: UploadOutcome[] = [];
  const m = deps.manifest;
  const commit = () => { m.generatedAt = now(); deps.save(m); };

  for (const item of plan) {
    if (item.action !== 'upload' && item.action !== 'changed-reupload') {
      out.push({ id: item.entry.id, result: 'skipped', error: item.reason });
      continue;
    }
    const { entry, sha256, sizeBytes } = item;
    if (!sha256 || sizeBytes == null) { out.push({ id: entry.id, result: 'errored', error: 'no hash for file' }); continue; }
    const base: ManifestEntry = manifestEntryFrom(entry, { sha256, sizeBytes, ...deps.probe(entry.file) }, deps.policy);
    m.entries[entry.id] = { ...base, status: 'uploading' };
    try {
      log(`[${entry.id}] minting direct upload`);
      const up = await deps.client.createDirectUpload({ passthrough: buildPassthrough(entry.id, sha256), policy: deps.policy });
      m.entries[entry.id] = { ...m.entries[entry.id], muxUploadId: up.id };
      commit();                                   // the upload id is recorded BEFORE any bytes move
      await deps.client.putFile(up.url, entry.file, sizeBytes, f => log(`[${entry.id}] ${Math.round(f * 100)}%`));
      m.entries[entry.id] = { ...m.entries[entry.id], status: 'processing', uploadedAt: now() };
      commit();
      const assetId = await deps.client.waitForAsset(up.id);
      m.entries[entry.id] = { ...m.entries[entry.id], muxAssetId: assetId };
      commit();                                   // asset id recorded: from here a re-run SKIPS this file
      const asset = await deps.client.waitForReady(assetId);
      const folded = applyMuxAsset({ ...recordShell(m.entries[entry.id]) }, asset, now());
      m.entries[entry.id] = stripUndefined({
        ...m.entries[entry.id],
        status: folded.status,
        muxPlaybackId: folded.muxPlaybackId,
        playbackPolicy: folded.playbackPolicy,
        durationSec: folded.durationSec ?? m.entries[entry.id].durationSec,
        width: folded.width ?? m.entries[entry.id].width,
        height: folded.height ?? m.entries[entry.id].height,
        error: folded.error,
      });
      commit();
      out.push({ id: entry.id, result: folded.status === 'errored' ? 'errored' : 'uploaded', assetId, playbackId: folded.muxPlaybackId, error: folded.error });
    } catch (e: any) {
      m.entries[entry.id] = { ...m.entries[entry.id], status: 'errored', error: String(e?.message || e).slice(0, 300) };
      commit();
      out.push({ id: entry.id, result: 'errored', error: m.entries[entry.id].error });
    }
  }
  return out;
}

/** The slice of a ManifestEntry applyMuxAsset needs, shaped as a record. */
function recordShell(e: ManifestEntry) {
  return {
    id: e.id, title: e.title, exhibitId: e.exhibitId, kind: 'film' as const, variant: e.variant, status: e.status,
    playbackPolicy: e.playbackPolicy, muxAssetId: e.muxAssetId, muxPlaybackId: e.muxPlaybackId,
    durationSec: e.durationSec, width: e.width, height: e.height,
    sourceFile: e.sourceFile, createdAt: 0, updatedAt: 0,
  };
}
