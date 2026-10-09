/**
 * csamCase — SERVER-ONLY handling once the policy says `csam_block_and_report`.
 *
 *   1. Make the media non-public IMMEDIATELY:
 *        Storage object → server-side copy to safety_quarantine/{caseId}/… (storage.rules fallback denies
 *        all client reads there), strip the download token + set a temporary hold on the copy (cannot be
 *        deleted/overwritten until released), then delete the public original. If the copy fails, the
 *        original is locked in place instead (token stripped + hold) — client-SDK reads that go through
 *        storage.rules may still work for that path; the case records 'locked_in_place' so a human follows up.
 *        Mux video → playback ids are deleted via the Mux API (asset itself is preserved).
 *   2. Write csam_cases/{caseId} (no client rule → default deny; server/service account only) with hashes,
 *      uploader uid, IP if known, timestamps, storage path, preserveUntil = +365 days (REPORT Act).
 *   3. Apply the account hook onCsamConfirmed(uid) → user_sanctions/{uid}.criminalReview.
 *   4. Draft the NCMEC CyberTipline report. Submit ONLY when NCMEC_SUBMIT_ENABLED=true and
 *      NCMEC_CYBERTIP_USER/PASS are set (NCMEC_ENV=test → exttest.cybertip.org, prod → report.cybertip.org).
 *      Default: status 'report_drafted' + manual-submit instructions (docs/CONTENT_SAFETY_PIPELINE.md).
 *
 * Nobody — admins included — is ever served the media from here. Admin APIs use caseMetadataView().
 */
import nodeCrypto from 'node:crypto';
import {
  preserveUntilMs, csamCaseId, buildCyberTipXml, buildFileInfoXml, parseCyberTipResponse,
  type CsamCase,
} from './csamCaseCore';
import { fsCreateOnce, fsGet, fsMerge, gcsCopy, gcsLock, gcsDelete, gcsDownload } from './safetyServerIo';
import type { MediaScanResult, MediaRef } from './mediaSafetyServer';

const sha = (s: string) => nodeCrypto.createHash('sha256').update(s).digest('hex');

/**
 * Account hook — call when a CSAM case is opened against `uid`. Enforcement (services/enforcement/*,
 * built separately) reads user_sanctions/{uid}.criminalReview; this only records it.
 */
export async function onCsamConfirmed(uid: string, caseId: string, now = Date.now()): Promise<boolean> {
  if (!uid) return false;
  return fsMerge(`user_sanctions/${uid}`, { criminalReview: { active: true, since: now, caseId } });
}

async function muxRemovePlayback(playbackId: string): Promise<{ ok: boolean; note: string }> {
  const id = process.env.MUX_TOKEN_ID, secret = process.env.MUX_TOKEN_SECRET;
  if (!id || !secret) return { ok: false, note: 'MUX_TOKEN_ID/SECRET not set — remove the playback id manually in the Mux dashboard' };
  const auth = `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
  try {
    const r = await fetch(`https://api.mux.com/video/v1/playback-ids/${encodeURIComponent(playbackId)}`, { headers: { Authorization: auth } });
    if (!r.ok) return { ok: false, note: `mux lookup HTTP ${r.status}` };
    const j = await r.json() as any;
    const assetId = j?.data?.object?.type === 'asset' ? j.data.object.id : null;
    if (!assetId) return { ok: false, note: 'mux playback id is not an asset' };
    const d = await fetch(`https://api.mux.com/video/v1/assets/${assetId}/playback-ids/${encodeURIComponent(playbackId)}`, { method: 'DELETE', headers: { Authorization: auth } });
    return d.ok || d.status === 404 ? { ok: true, note: `mux asset ${assetId} playback removed; asset preserved` } : { ok: false, note: `mux delete HTTP ${d.status}` };
  } catch { return { ok: false, note: 'mux network error' }; }
}

async function quarantine(caseId: string, scan: MediaScanResult, ref: MediaRef): Promise<CsamCase['quarantine']> {
  if (scan.storagePath) {
    const name = scan.storagePath.split('/').pop() || 'file';
    const dst = `safety_quarantine/${caseId}/${name}`;
    if (await gcsCopy(scan.storagePath, dst)) {
      await gcsLock(dst, { plajahCaseId: caseId });
      const deleted = await gcsDelete(scan.storagePath);
      if (deleted) return { storagePath: dst, state: 'moved', note: 'copied to quarantine (hold + token removed); public original deleted' };
      const lockedOriginal = await gcsLock(scan.storagePath);
      return { storagePath: dst, state: lockedOriginal ? 'locked_in_place' : 'failed',
        note: `copied to quarantine; original delete FAILED${lockedOriginal ? ' — original token removed + hold set' : ' and lock failed — act manually NOW'}` };
    }
    const locked = await gcsLock(scan.storagePath, { plajahCaseId: caseId });
    return locked
      ? { storagePath: scan.storagePath, state: 'locked_in_place', note: 'copy failed; original token removed + hold set. storage.rules may still allow SDK reads on this path — move manually.' }
      : { storagePath: scan.storagePath, state: 'failed', note: 'could not copy or lock the object — act manually NOW' };
  }
  if (ref.muxPlaybackId) {
    const m = await muxRemovePlayback(ref.muxPlaybackId);
    return { storagePath: null, state: m.ok ? 'mux_playback_removed' : 'failed', note: m.note };
  }
  return { storagePath: null, state: 'external_not_controlled', note: 'media is hosted outside Plajah storage; only the referencing doc was blocked' };
}

export interface OpenCaseInput {
  scan: MediaScanResult;
  ref: MediaRef;
  surface: string;
  target: { collection: string; id: string } | null;
  uploaderUid: string | null;
  uploaderIp: string | null;
  now?: number;
}

/** Idempotent per media object. Returns the case id and whether this call opened it. */
export async function openCsamCase(i: OpenCaseInput): Promise<{ caseId: string; created: boolean }> {
  const now = i.now ?? Date.now();
  const key = i.scan.storagePath || (i.ref.muxPlaybackId ? `mux:${i.ref.muxPlaybackId}` : i.ref.url || `${i.target?.collection}/${i.target?.id}`);
  const caseId = csamCaseId(key, sha);

  const existing = await fsGet(`csam_cases/${caseId}`);
  if (existing) return { caseId, created: false };

  const q = await quarantine(caseId, i.scan, i.ref);
  const hashSrc = Array.isArray(i.scan.signals.hashMatch) ? i.scan.signals.hashMatch.find(h => h.matched)?.source : undefined;
  const c: CsamCase = {
    id: caseId,
    status: 'pending_report',
    detectedAt: now,
    preserveUntil: preserveUntilMs(now),
    detection: { source: hashSrc ? `hash:${hashSrc}` : 'classifier_agreement', reason: i.scan.decision.reason },
    uploaderUid: i.uploaderUid,
    uploaderIp: i.uploaderIp,
    surface: i.surface,
    target: i.target,
    original: { storagePath: i.scan.storagePath, url: i.ref.url ? i.ref.url.split('?')[0] : null, contentType: i.scan.contentType, size: i.scan.size },
    quarantine: q,
    hashes: { md5: i.scan.md5, sha256: i.scan.sha256, photodnaTrackingId: i.scan.photodnaTrackingId },
    ncmec: { env: 'manual', reportId: null, submittedAt: null, lastError: null },
  };
  const draftXml = buildCyberTipXml(c, {
    email: process.env.NCMEC_REPORTER_EMAIL || 'safety@plajah.com',
    firstName: process.env.NCMEC_REPORTER_FIRST_NAME, lastName: process.env.NCMEC_REPORTER_LAST_NAME,
  });
  const created = await fsCreateOnce('csam_cases', caseId, { ...c, status: 'report_drafted', ncmecDraftXml: draftXml });
  if (created === 'exists') return { caseId, created: false };
  if (created === 'error') console.error(`[CSAM] case ${caseId} could not be written — quarantine state ${q.state}. INVESTIGATE.`);

  console.error(`[CSAM] case ${caseId} opened (surface=${i.surface}, quarantine=${q.state}). Report to NCMEC within the statutory window.`);
  if (i.uploaderUid) await onCsamConfirmed(i.uploaderUid, caseId, now);

  if (process.env.NCMEC_SUBMIT_ENABLED === 'true' && process.env.NCMEC_CYBERTIP_USER && process.env.NCMEC_CYBERTIP_PASS) {
    submitCyberTip(c, draftXml).catch(err => console.error('[CSAM] submit crashed', caseId, err?.message || err));
  }
  return { caseId, created: true };
}

/** CyberTipline ESP web service: submit → upload → fileinfo → finish. Any failure → report_failed. */
export async function submitCyberTip(c: CsamCase, xml: string): Promise<void> {
  const env = process.env.NCMEC_ENV === 'prod' ? 'prod' : 'test';
  const base = env === 'prod' ? 'https://report.cybertip.org/ispws' : 'https://exttest.cybertip.org/ispws';
  const auth = `Basic ${Buffer.from(`${process.env.NCMEC_CYBERTIP_USER}:${process.env.NCMEC_CYBERTIP_PASS}`).toString('base64')}`;
  const fail = (msg: string) => fsMerge(`csam_cases/${c.id}`, { status: 'report_failed', ncmec: { ...c.ncmec, env, lastError: msg.slice(0, 500) } });
  try {
    const sub = await fetch(`${base}/submit`, { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'text/xml; charset=utf-8' }, body: xml });
    const subR = parseCyberTipResponse(await sub.text());
    if (!sub.ok || subR.responseCode !== 0 || !subR.reportId) { await fail(`submit HTTP ${sub.status} code ${subR.responseCode} ${subR.description || ''}`); return; }
    const reportId = subR.reportId;
    await fsMerge(`csam_cases/${c.id}`, { ncmec: { ...c.ncmec, env, reportId, submittedAt: null, lastError: null } });

    if (c.quarantine.storagePath) {
      const file = await gcsDownload(c.quarantine.storagePath, 300 * 1024 * 1024);
      if (file) {
        const form = new FormData();
        form.append('id', reportId);
        const name = c.quarantine.storagePath.split('/').pop() || 'file';
        form.append('file', new Blob([new Uint8Array(file.bytes)], { type: file.contentType || 'application/octet-stream' }), name);
        const up = await fetch(`${base}/upload`, { method: 'POST', headers: { Authorization: auth }, body: form });
        const upR = parseCyberTipResponse(await up.text());
        if (up.ok && upR.responseCode === 0 && upR.fileId) {
          await fetch(`${base}/fileinfo`, { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'text/xml; charset=utf-8' }, body: buildFileInfoXml(reportId, upR.fileId, c, name) });
        } else { await fail(`upload HTTP ${up.status} code ${upR.responseCode}`); return; }
      }
    }
    const fin = new FormData(); fin.append('id', reportId);
    const done = await fetch(`${base}/finish`, { method: 'POST', headers: { Authorization: auth }, body: fin });
    const doneR = parseCyberTipResponse(await done.text());
    if (!done.ok || doneR.responseCode !== 0) { await fail(`finish HTTP ${done.status} code ${doneR.responseCode}`); return; }
    await fsMerge(`csam_cases/${c.id}`, { status: 'reported', ncmec: { env, reportId, submittedAt: Date.now(), lastError: null } });
  } catch (e: any) {
    await fail(`network: ${e?.message || e}`);
  }
}
