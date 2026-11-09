// services/drive/transfers.ts — WeTransfer-style sends, the B2 key layout, and big-file uploads. Pure.
//
// Keys never contain file names or user-typed text (names live in Firestore metadata, so renames
// are free and keys leak nothing):
//   drive/u/{uid}/{fileId}/v{n}            personal Drive file, version n
//   drive/o/{orgId}/{fileId}/v{n}          org pool file
//   transfers/{7|30|90|365}d/{transferId}/{fileId}
// B2 lifecycle rules can't overlap prefixes, so transfers are grouped by retention folder and each
// folder's rule deletes files one day after its window — the bucket itself enforces expiry.
// Transfers don't count toward Drive storage.

import { GiB, type DrivePlan } from './plans';

export interface TransferPolicy {
  maxBytes: number;          // per transfer (all files)
  maxDays: 7 | 30 | 90 | 365;
  password: boolean;
  downloadTracking: boolean;
  brandedPage: boolean;
  /** Downloads per transfer before the link stops (abuse/piracy brake). */
  maxDownloads: number;
}

const FREE: TransferPolicy = { maxBytes: 3 * GiB, maxDays: 7, password: false, downloadTracking: false, brandedPage: false, maxDownloads: 50 };
const PLUS: TransferPolicy = { maxBytes: 50 * GiB, maxDays: 30, password: true, downloadTracking: true, brandedPage: false, maxDownloads: 500 };
const PRO: TransferPolicy = { maxBytes: 250 * GiB, maxDays: 365, password: true, downloadTracking: true, brandedPage: true, maxDownloads: 5000 };

export const TRANSFER_POLICY: Record<DrivePlan, TransferPolicy> = {
  free: FREE, spark: PLUS, glow: PLUS, nova: PLUS,
  all_access: PRO, studio_max: PRO, studio_team: PRO, production_house: PRO,
};

export const RETENTION_FOLDERS = [7, 30, 90, 365] as const;
export type RetentionDays = typeof RETENTION_FOLDERS[number];

export type TransferDenial = 'too_large' | 'too_long' | 'password_not_included' | 'empty';

export interface TransferRequest { totalBytes: number; days: number; password?: boolean }

export function checkTransfer(plan: DrivePlan, req: TransferRequest): { ok: true; folder: RetentionDays } | { ok: false; reason: TransferDenial } {
  const p = TRANSFER_POLICY[plan];
  if (req.totalBytes <= 0) return { ok: false, reason: 'empty' };
  if (req.totalBytes > p.maxBytes) return { ok: false, reason: 'too_large' };
  if (req.days > p.maxDays) return { ok: false, reason: 'too_long' };
  if (req.password && !p.password) return { ok: false, reason: 'password_not_included' };
  const folder = RETENTION_FOLDERS.find(d => d >= req.days) ?? 365;
  return { ok: true, folder };
}

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const need = (v: string, what: string) => { if (!ID_RE.test(v)) throw new Error(`bad ${what}`); return v; };

export const driveKey = (owner: { kind: 'u' | 'o'; id: string }, fileId: string, version: number) => {
  if (!Number.isInteger(version) || version < 1) throw new Error('bad version');
  return `drive/${owner.kind}/${need(owner.id, 'owner')}/${need(fileId, 'file')}/v${version}`;
};

export const transferKey = (folder: RetentionDays, transferId: string, fileId: string) =>
  `transfers/${folder}d/${need(transferId, 'transfer')}/${need(fileId, 'file')}`;

export interface ParsedDriveKey { area: 'drive'; kind: 'u' | 'o'; ownerId: string; fileId: string; version: number }
export interface ParsedTransferKey { area: 'transfers'; folder: RetentionDays; transferId: string; fileId: string }

export function parseDriveOrTransferKey(key: string): ParsedDriveKey | ParsedTransferKey | null {
  let m = key.match(/^drive\/(u|o)\/([A-Za-z0-9_-]{8,64})\/([A-Za-z0-9_-]{8,64})\/v(\d{1,6})$/);
  if (m) return { area: 'drive', kind: m[1] as 'u' | 'o', ownerId: m[2], fileId: m[3], version: Number(m[4]) };
  m = key.match(/^transfers\/(7|30|90|365)d\/([A-Za-z0-9_-]{8,64})\/([A-Za-z0-9_-]{8,64})$/);
  if (m) return { area: 'transfers', folder: Number(m[1]) as RetentionDays, transferId: m[2], fileId: m[3] };
  return null;
}

/** B2 lifecycle rules for the bucket UI (one per transfer folder; Drive is never auto-deleted). */
export const transferLifecycleRules = () =>
  RETENTION_FOLDERS.map(d => ({ fileNamePrefix: `transfers/${d}d/`, daysFromUploadingToHiding: d + 1, daysFromHidingToDeleting: 1 }));

// ── Multipart (S3 API on B2): files over the single-PUT limit go up in resumable parts ──────────

export const SINGLE_PUT_MAX = 5 * GiB;      // B2 single upload ceiling
export const MIN_PART = 5 * 1024 ** 2;       // S3 minimum part (except the last)
export const MAX_PART = 5 * GiB;
export const MAX_PARTS = 10_000;
/** Below this we still prefer parts: resumable on flaky connections. */
export const MULTIPART_FROM = 100 * 1024 ** 2;

export function planUpload(size: number): { mode: 'single' } | { mode: 'multipart'; partSize: number; parts: number } {
  if (size <= 0) throw new Error('empty file');
  if (size < MULTIPART_FROM) return { mode: 'single' };
  // 64 MiB parts by default; grow so we never exceed 10,000 parts.
  let partSize = 64 * 1024 ** 2;
  while (Math.ceil(size / partSize) > MAX_PARTS) partSize *= 2;
  if (partSize > MAX_PART) throw new Error('file too large for multipart');
  return { mode: 'multipart', partSize, parts: Math.ceil(size / partSize) };
}
