// services/drive/transfersService.ts — Temporary "Send" file transfers on B2 (7 / 30 / 90 / 365 day buckets).
// Uses transfers.ts limits + S3 signed PUT/GET/multipart links + scrypt password hashes. Server-only.

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { DrivePlan } from './plans';
import { checkTransfer, planUpload, transferKey, MAX_PARTS, RETENTION_FOLDERS } from './transfers';

type RetentionFolder = (typeof RETENTION_FOLDERS)[number];
import {
  abortMultipart,
  completeMultipart,
  createMultipart,
  deleteObjectServer,
  getUrl,
  headSize,
  partUrl,
  putUrl,
  type S3Config,
} from '../objectStore/s3ops';

type Doc = Record<string, any>;
type Fetch = typeof fetch;

export interface TransferStore {
  get(path: string): Promise<Doc | null>;
  set(path: string, data: Doc): Promise<boolean>;
  query(collection: string, field: string, value: any, limit: number): Promise<Array<{ id: string; data: Doc }>>;
  remove(path: string): Promise<boolean>;
}

export interface TransferDeps {
  store: TransferStore;
  s3: () => S3Config | null;
  fetch?: Fetch;
  planOf: (uid: string) => Promise<DrivePlan>;
  now: () => number;
  newId: () => string;
  tokenSecret?: string;
}

export class TransferError extends Error {
  constructor(public code: string, msg: string, public status = 400) {
    super(msg);
  }
}

export interface TransferFileInput {
  name: string;
  size: number;
  mime?: string;
}

export interface CreateTransferInput {
  title?: string;
  message?: string;
  days?: number;
  password?: string;
  maxDownloads?: number;
  files: TransferFileInput[];
}

export interface TransferFilePlan {
  fileId: string;
  name: string;
  mime: string;
  size: number;
  key: string;
  mode: 'single' | 'multipart';
  url?: string;
  headers?: Record<string, string>;
  expiresAt?: number;
  uploadId?: string;
  partSize?: number;
  parts?: number;
}

const MIME_RE = /^[\w.+-]{1,40}\/[\w.+-]{1,80}$/;
// eslint-disable-next-line no-control-regex
const BAD_NAME = /[\u0000-\u001f\u007f/\\]/;
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const DAY_MS = 86_400_000;
const PART_BATCH = 100;
const MAX_FILES_PER_TRANSFER = 100;

function cleanName(raw: string): string {
  const n = String(raw || '').trim();
  if (!n || n.length > 240 || n === '.' || n === '..' || BAD_NAME.test(n)) {
    throw new TransferError('bad_name', `Invalid file name "${raw}"`);
  }
  return n;
}

function cleanMime(raw?: string): string {
  const m = String(raw || 'application/octet-stream').trim().toLowerCase();
  if (!MIME_RE.test(m)) return 'application/octet-stream';
  return m;
}

function hashPassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 32).toString('hex');
  return { salt, hash };
}

function verifyPassword(password: string, salt: string, expectedHex: string): boolean {
  try {
    const actual = scryptSync(password, salt, 32);
    const expected = Buffer.from(expectedHex, 'hex');
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function signUnlockToken(secret: string, transferId: string, expiresAt: number): string {
  const payload = `${transferId}.${expiresAt}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${expiresAt}.${sig}`;
}

function verifyUnlockToken(secret: string, transferId: string, token: string | undefined, now: number): boolean {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  const sig = token.slice(dot + 1);
  if (!Number.isFinite(exp) || exp < now) return false;
  const expected = createHmac('sha256', secret).update(`${transferId}.${exp}`).digest('base64url');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function getSecret(deps: TransferDeps): string {
  return deps.tokenSecret || process.env.TRANSFER_TOKEN_SECRET || process.env.ADMIN_SEED_KEY || 'plajah-transfer-dev-secret';
}

export async function beginTransfer(
  uid: string,
  input: CreateTransferInput,
  deps: TransferDeps,
): Promise<{
  transferId: string;
  folder: RetentionFolder;
  expiresAt: number;
  passwordProtected: boolean;
  files: TransferFilePlan[];
}> {
  if (!Array.isArray(input.files) || input.files.length === 0 || input.files.length > MAX_FILES_PER_TRANSFER) {
    throw new TransferError('bad_files', `Transfers must contain 1 to ${MAX_FILES_PER_TRANSFER} files.`);
  }
  const files = input.files.map((f, idx) => {
    const size = Number(f.size);
    if (!Number.isSafeInteger(size) || size <= 0) {
      throw new TransferError('bad_size', `File #${idx + 1} must be larger than 0 bytes.`);
    }
    return {
      fileId: `f_${deps.newId()}`,
      name: cleanName(f.name),
      size,
      mime: cleanMime(f.mime),
    };
  });

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const days = Math.max(1, Math.min(365, Math.round(Number(input.days || 7))));
  const password = typeof input.password === 'string' && input.password.length > 0 ? input.password : undefined;
  if (password && password.length > 128) {
    throw new TransferError('bad_password', 'Transfer password must be at most 128 characters.');
  }

  const plan = await deps.planOf(uid);
  const chk = checkTransfer(plan, { totalBytes, days, password: Boolean(password) });
  if (!chk.ok) {
    throw new TransferError('plan_limit', (chk as any).reason || 'Transfer exceeds plan limits.', 403);
  }
  const folder = chk.folder;
  const cfg = deps.s3();
  if (!cfg) {
    throw new TransferError('not_configured', 'Transfer storage is not configured on this server.', 503);
  }

  const transferId = `tr_${deps.newId()}`;
  const now = deps.now();
  const expiresAt = now + days * DAY_MS;
  const maxDownloads = input.maxDownloads && Number.isInteger(input.maxDownloads) && input.maxDownloads > 0
    ? Math.min(10_000, input.maxDownloads)
    : null;
  const pw = password ? hashPassword(password) : null;

  const plans: TransferFilePlan[] = [];
  const docFiles: Doc[] = [];
  for (const f of files) {
    const key = transferKey(folder, transferId, f.fileId);
    const up = planUpload(f.size);
    if (up.mode === 'single') {
      const url = putUrl(cfg, key, f.size, f.mime, 900, new Date(now));
      plans.push({
        fileId: f.fileId,
        name: f.name,
        mime: f.mime,
        size: f.size,
        key,
        mode: 'single',
        url,
        headers: { 'Content-Type': f.mime, 'Content-Length': String(f.size) },
        expiresAt: now + 900_000,
      });
      docFiles.push({ fileId: f.fileId, name: f.name, mime: f.mime, size: f.size, key, mode: 'single' });
    } else {
      const uploadId = await createMultipart(cfg, key, f.mime, deps.fetch);
      plans.push({
        fileId: f.fileId,
        name: f.name,
        mime: f.mime,
        size: f.size,
        key,
        mode: 'multipart',
        uploadId,
        partSize: up.partSize,
        parts: up.parts,
      });
      docFiles.push({
        fileId: f.fileId,
        name: f.name,
        mime: f.mime,
        size: f.size,
        key,
        mode: 'multipart',
        uploadId,
        partSize: up.partSize,
        parts: up.parts,
      });
    }
  }

  await deps.store.set(`driveTransfers/${transferId}`, {
    id: transferId,
    ownerUid: uid,
    title: typeof input.title === 'string' ? input.title.trim().slice(0, 120) : '',
    message: typeof input.message === 'string' ? input.message.trim().slice(0, 600) : '',
    folder,
    days,
    totalBytes,
    status: 'uploading',
    createdAt: now,
    expiresAt,
    maxDownloads,
    downloadCount: 0,
    passwordProtected: Boolean(pw),
    passwordSalt: pw?.salt ?? null,
    passwordHash: pw?.hash ?? null,
    files: docFiles,
  });

  return {
    transferId,
    folder,
    expiresAt,
    passwordProtected: Boolean(pw),
    files: plans,
  };
}

export async function signTransferParts(
  uid: string,
  transferId: string,
  fileId: string,
  partNumbers: number[],
  deps: TransferDeps,
): Promise<{ urls: Array<{ partNumber: number; url: string }>; expiresAt: number }> {
  if (!ID_RE.test(transferId) || !ID_RE.test(fileId)) throw new TransferError('bad_id', 'Invalid transfer id');
  if (!Array.isArray(partNumbers) || partNumbers.length === 0 || partNumbers.length > PART_BATCH) {
    throw new TransferError('bad_parts', `Request 1..${PART_BATCH} parts at a time`);
  }
  const doc = await deps.store.get(`driveTransfers/${transferId}`);
  if (!doc || doc.ownerUid !== uid) throw new TransferError('forbidden', 'Transfer not found', 404);
  if (doc.status !== 'uploading') throw new TransferError('bad_state', 'Transfer already finalized', 409);
  const file = (doc.files || []).find((f: Doc) => f.fileId === fileId);
  if (!file || file.mode !== 'multipart' || !file.uploadId) {
    throw new TransferError('bad_file', 'Multipart file not found on transfer', 404);
  }
  const cfg = deps.s3();
  if (!cfg) throw new TransferError('not_configured', 'Storage unavailable', 503);
  const now = deps.now();
  const urls = partNumbers.map(n => {
    if (!Number.isInteger(n) || n < 1 || n > Math.min(MAX_PARTS, file.parts || MAX_PARTS)) {
      throw new TransferError('bad_part', `Part ${n} out of range`);
    }
    return { partNumber: n, url: partUrl(cfg, file.key, file.uploadId, n, 3600, new Date(now)) };
  });
  return { urls, expiresAt: now + 3600_000 };
}

export async function completeTransfer(
  uid: string,
  transferId: string,
  completedMultiparts: Record<string, Array<{ partNumber: number; etag: string }>>,
  deps: TransferDeps,
): Promise<{
  transferId: string;
  status: 'ready';
  expiresAt: number;
  totalBytes: number;
  files: Array<{ fileId: string; name: string; size: number; mime: string }>;
}> {
  if (!ID_RE.test(transferId)) throw new TransferError('bad_id', 'Invalid transfer id');
  const doc = await deps.store.get(`driveTransfers/${transferId}`);
  if (!doc || doc.ownerUid !== uid) throw new TransferError('forbidden', 'Transfer not found', 404);
  if (doc.status === 'ready') {
    return {
      transferId,
      status: 'ready',
      expiresAt: doc.expiresAt,
      totalBytes: doc.totalBytes,
      files: (doc.files || []).map((f: Doc) => ({ fileId: f.fileId, name: f.name, size: f.size, mime: f.mime })),
    };
  }
  if (doc.status === 'revoked') throw new TransferError('revoked', 'Transfer was revoked', 410);
  const cfg = deps.s3();
  if (!cfg) throw new TransferError('not_configured', 'Storage unavailable', 503);

  let verifiedTotal = 0;
  const updatedFiles: Doc[] = [];
  for (const f of doc.files || []) {
    if (f.mode === 'multipart' && f.uploadId) {
      const parts = completedMultiparts?.[f.fileId];
      if (!Array.isArray(parts) || parts.length !== f.parts) {
        throw new TransferError('missing_parts', `File "${f.name}" is missing uploaded parts`);
      }
      await completeMultipart(cfg, f.key, f.uploadId, parts, deps.fetch);
    }
    const actual = await headSize(cfg, f.key, deps.fetch);
    if (actual === null || actual <= 0) {
      throw new TransferError('missing_object', `File "${f.name}" has not finished uploading`, 400);
    }
    verifiedTotal += actual;
    updatedFiles.push({ fileId: f.fileId, name: f.name, mime: f.mime, size: actual, key: f.key });
  }

  await deps.store.set(`driveTransfers/${transferId}`, {
    ...doc,
    status: 'ready',
    totalBytes: verifiedTotal,
    completedAt: deps.now(),
    files: updatedFiles,
  });

  return {
    transferId,
    status: 'ready',
    expiresAt: doc.expiresAt,
    totalBytes: verifiedTotal,
    files: updatedFiles.map(f => ({ fileId: f.fileId, name: f.name, size: f.size, mime: f.mime })),
  };
}

export async function listMyTransfers(uid: string, deps: TransferDeps) {
  const rows = await deps.store.query('driveTransfers', 'ownerUid', uid, 100);
  return rows
    .filter(r => r.data.status !== 'revoked')
    .sort((a, b) => Number(b.data.createdAt || 0) - Number(a.data.createdAt || 0))
    .map(r => ({
      id: r.id,
      title: r.data.title || '',
      message: r.data.message || '',
      days: r.data.days,
      totalBytes: Number(r.data.totalBytes || 0),
      status: r.data.status,
      createdAt: Number(r.data.createdAt || 0),
      expiresAt: Number(r.data.expiresAt || 0),
      maxDownloads: r.data.maxDownloads ?? null,
      downloadCount: Number(r.data.downloadCount || 0),
      passwordProtected: Boolean(r.data.passwordProtected),
      files: (r.data.files || []).map((f: Doc) => ({
        fileId: f.fileId,
        name: f.name,
        size: Number(f.size || 0),
        mime: f.mime,
      })),
    }));
}

export async function revokeTransfer(uid: string, transferId: string, deps: TransferDeps): Promise<{ revoked: true }> {
  if (!ID_RE.test(transferId)) throw new TransferError('bad_id', 'Invalid transfer id');
  const doc = await deps.store.get(`driveTransfers/${transferId}`);
  if (!doc || doc.ownerUid !== uid) throw new TransferError('forbidden', 'Transfer not found', 404);
  const cfg = deps.s3();
  if (cfg) {
    for (const f of doc.files || []) {
      if (f.mode === 'multipart' && f.uploadId && doc.status === 'uploading') {
        await abortMultipart(cfg, f.key, f.uploadId, deps.fetch);
      }
      await deleteObjectServer(cfg, f.key, deps.fetch);
    }
  }
  await deps.store.remove(`driveTransfers/${transferId}`);
  return { revoked: true };
}

function buildSignedDownloads(cfg: S3Config, files: Doc[], now: number, inline = false) {
  return files.map(f => ({
    fileId: f.fileId,
    name: f.name,
    size: Number(f.size || 0),
    mime: f.mime,
    downloadUrl: getUrl(
      cfg,
      f.key,
      600,
      { 'response-content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${String(f.name || 'file').replace(/"/g, '_')}"` },
      new Date(now),
    ),
  }));
}

export async function inspectTransferPublic(
  transferId: string,
  opts: { unlockToken?: string; countDownload?: boolean; inline?: boolean },
  deps: TransferDeps,
) {
  if (!ID_RE.test(transferId)) throw new TransferError('bad_id', 'Invalid transfer link', 400);
  const doc = await deps.store.get(`driveTransfers/${transferId}`);
  if (!doc || doc.status === 'revoked') throw new TransferError('not_found', 'Transfer not found', 404);
  if (doc.status !== 'ready') throw new TransferError('not_ready', 'This transfer is still uploading.', 409);

  const now = deps.now();
  if (now >= Number(doc.expiresAt || 0)) {
    throw new TransferError('expired', 'This transfer link has expired.', 410);
  }
  const downloadCount = Number(doc.downloadCount || 0);
  if (doc.maxDownloads && downloadCount >= Number(doc.maxDownloads)) {
    throw new TransferError('limit_reached', 'Download limit reached for this transfer.', 410);
  }

  const unlocked = !doc.passwordProtected || verifyUnlockToken(getSecret(deps), transferId, opts.unlockToken, now);
  if (!unlocked) {
    return {
      id: transferId,
      title: doc.title || '',
      message: doc.message || '',
      passwordRequired: true,
      locked: true,
      expiresAt: Number(doc.expiresAt),
      totalBytes: Number(doc.totalBytes || 0),
      downloadCount,
      maxDownloads: doc.maxDownloads ?? null,
      files: (doc.files || []).map((f: Doc) => ({ fileId: f.fileId, name: f.name, size: Number(f.size || 0), mime: f.mime })),
    };
  }

  const cfg = deps.s3();
  if (!cfg) throw new TransferError('not_configured', 'Storage unavailable', 503);

  let nextCount = downloadCount;
  if (opts.countDownload) {
    nextCount = downloadCount + 1;
    await deps.store.set(`driveTransfers/${transferId}`, { ...doc, downloadCount: nextCount, lastDownloadAt: now });
  }

  return {
    id: transferId,
    title: doc.title || '',
    message: doc.message || '',
    passwordRequired: Boolean(doc.passwordProtected),
    locked: false,
    expiresAt: Number(doc.expiresAt),
    totalBytes: Number(doc.totalBytes || 0),
    downloadCount: nextCount,
    maxDownloads: doc.maxDownloads ?? null,
    files: buildSignedDownloads(cfg, doc.files || [], now, Boolean(opts.inline)),
  };
}

export async function unlockTransferWithPassword(
  transferId: string,
  password: string,
  deps: TransferDeps,
) {
  if (!ID_RE.test(transferId)) throw new TransferError('bad_id', 'Invalid transfer link', 400);
  const doc = await deps.store.get(`driveTransfers/${transferId}`);
  if (!doc || doc.status !== 'ready') throw new TransferError('not_found', 'Transfer not found', 404);
  const now = deps.now();
  if (now >= Number(doc.expiresAt || 0)) throw new TransferError('expired', 'This transfer link has expired.', 410);
  if (doc.maxDownloads && Number(doc.downloadCount || 0) >= Number(doc.maxDownloads)) {
    throw new TransferError('limit_reached', 'Download limit reached for this transfer.', 410);
  }
  if (doc.passwordProtected) {
    if (!verifyPassword(String(password || ''), String(doc.passwordSalt || ''), String(doc.passwordHash || ''))) {
      throw new TransferError('bad_password', 'Incorrect transfer password.', 403);
    }
  }
  const token = signUnlockToken(getSecret(deps), transferId, Math.min(Number(doc.expiresAt), now + 3600_000));
  const data = await inspectTransferPublic(transferId, { unlockToken: token, countDownload: false }, deps);
  return { ...data, unlockToken: token };
}
