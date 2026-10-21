// Book vault — keeps a paid Lorea book's readable content off the public album doc.
// Mounted in server.ts:  app.use('/api/books', createBookVaultRouter({ ... }))
//
// Why: albums/{id} is public-read and its Storage files carry download tokens, so a paid book's
// chapter text and EPUB/PDF used to be readable by anyone who loaded the album. Sealing moves
// every chapter's content into bookVault/{albumId} (server-only in firestore.rules) and copies its
// files to book-vault/{albumId}/… (default-deny in storage.rules). Readers get the content back
// from /access, which checks ownership/licence and hands out short-lived signed file URLs.
//
// Endpoints
//   POST /api/books/:id/seal          owner/admin: seal (or re-seal after an edit) a paid book
//   GET  /api/books/:id/access        optional auth: chapters the caller may read (+ signed file URLs)
//   GET  /api/books/:id/file          signed: stream one vault file (Range-aware)
//   POST /api/books/admin/seal-all    admin: backfill every published paid book
import { Router } from 'express';
import express from 'express';
import * as crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { fsGet, fsSet, fsPatch, fsQuery, getAccessToken, verifyIdToken } from '../services/firebaseAdminRest';
import { chooseVersion, licenceActive, readRegistry, stampVersion, type BookVersionStamp, type EditionLicense, type PublishUpdate } from '../services/bookEditions/policy';
import { canonical } from '../services/ledger/licenseLedger';
import { appendLedger } from './ledger';

export interface BookVaultDeps {
  authMiddleware: any;
  /** Verified platform-admin check (never the editable profile role). */
  isAdmin: (req: any) => Promise<boolean>;
}

const BUCKET = process.env.STORAGE_BUCKET || 'gen-lang-client-0665118474.firebasestorage.app';
const FILE_TTL_MS = 6 * 3600_000;
/** Chapter fields that make up the readable book. Everything else (title, price, format…) stays public. */
const SEALED_FIELDS = ['url', 'fallbackUrl', 'content', 'audioUrl', 'pages'] as const;
const VAULT_REF = 'vault:';

const fileSecret = () => {
  const s = process.env.BOOK_FILE_SECRET;
  if (s) return s;
  // Stable across instances without a new env var; never sent to a client.
  return crypto.createHash('sha256').update(`book-vault:${process.env.STRIPE_SECRET_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_JSON || ''}`).digest('hex');
};
const sign = (albumId: string, path: string, exp: number) => crypto.createHmac('sha256', fileSecret()).update(`${albumId}|${path}|${exp}`).digest('hex');
function verifySig(albumId: string, path: string, exp: number, sig: string): boolean {
  if (!(exp > Date.now())) return false;
  const a = Buffer.from(String(sig || '')), b = Buffer.from(sign(albumId, path, exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const signedUrl = (albumId: string, path: string) => {
  const exp = Date.now() + FILE_TTL_MS;
  return `/api/books/${encodeURIComponent(albumId)}/file?p=${encodeURIComponent(path)}&exp=${exp}&sig=${sign(albumId, path, exp)}`;
};

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 32);
const albumOwner = (a: any) => String(a?.ownerId || a?.ownerUid || a?.creatorUid || '');
const isPaid = (a: any) => (Number(a?.price) || 0) > 0;
const safeSeg = (s: string) => String(s || '').replace(/[^\w.\-]/g, '_').slice(0, 120) || 'file';

/** Object path inside our bucket for a Firebase/GCS URL, or null for anything external. */
export function storagePathFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'firebasestorage.googleapis.com') {
      const m = u.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
      return m && m[1] === BUCKET ? decodeURIComponent(m[2]) : null;
    }
    if (u.hostname === 'storage.googleapis.com') {
      const m = u.pathname.match(/^\/([^/]+)\/(.+)$/);
      return m && m[1] === BUCKET ? decodeURIComponent(m[2]) : null;
    }
  } catch { /* not a URL */ }
  return null;
}

async function gcs(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error('No storage credentials');
  return fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${path}`, {
    ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers as any || {}) },
  });
}
const gcsExists = async (p: string) => (await gcs(encodeURIComponent(p))).ok;
async function gcsCopy(src: string, dst: string): Promise<boolean> {
  // rewriteTo handles any size; large objects come back in several calls carrying a rewriteToken.
  let rewriteToken = '';
  for (let i = 0; i < 50; i++) {
    const qs = rewriteToken ? `?rewriteToken=${encodeURIComponent(rewriteToken)}` : '';
    const r = await gcs(`${encodeURIComponent(src)}/rewriteTo/b/${BUCKET}/o/${encodeURIComponent(dst)}${qs}`, { method: 'POST' });
    if (!r.ok) return false;
    const j = await r.json() as any;
    if (j.done) return true;
    rewriteToken = j.rewriteToken;
  }
  return false;
}
const gcsDelete = async (p: string) => { const r = await gcs(encodeURIComponent(p), { method: 'DELETE' }); return r.ok || r.status === 404; };

/** Originals we may delete after copying: files uploaded for this book by its author. Anything else
 *  (another album's folder, shared public-domain classics) is left alone. */
function deletableOrigin(path: string, albumId: string, ownerId: string): boolean {
  return path.startsWith(`albums/${albumId}/`) || path.startsWith('uploads/books/')
    || path.startsWith(`books/${ownerId}/`) || path.startsWith(`users/${ownerId}/`);
}

interface MoveCtx { albumId: string; ownerId: string; chapterId: string; moved: Map<string, string>; toDelete: Set<string> }

/** Move one URL into the vault. Returns the vault ref (or the URL unchanged when it isn't ours). */
async function vaultUrl(url: string, ctx: MoveCtx): Promise<string> {
  if (typeof url !== 'string' || !url || url.startsWith(VAULT_REF)) return url;
  // The author's editor loads signed /file links; on republish map them back to the vault path
  // instead of storing a link that expires in a few hours.
  const signed = url.match(/\/api\/books\/([^/?#]+)\/file\?(.*)$/);
  if (signed) {
    const p = new URLSearchParams(signed[2]).get('p') || '';
    if (p.startsWith(`book-vault/${ctx.albumId}/`) && !p.includes('..')) return VAULT_REF + p;
  }
  const src = storagePathFromUrl(url);
  if (!src || src.startsWith('books/classics/')) return url;   // external or public-domain: nothing to protect
  if (src.startsWith(`book-vault/${ctx.albumId}/`)) return VAULT_REF + src;
  const done = ctx.moved.get(src);
  if (done) return VAULT_REF + done;
  const dst = `book-vault/${ctx.albumId}/${safeSeg(ctx.chapterId)}/${sha(src).slice(0, 8)}_${safeSeg(src.split('/').pop() || '')}`;
  let ok = await gcsExists(dst);
  if (!ok) {
    if (await gcsExists(src)) ok = await gcsCopy(src, dst);
    else {
      // The original may already have been moved by another book that shared the upload.
      const idx = await fsGet(`bookVaultIndex/${sha(src)}`);
      if (idx?.vaultPath && await gcsExists(idx.vaultPath)) ok = await gcsCopy(idx.vaultPath, dst);
    }
  }
  if (!ok) throw new Error(`Could not move ${src} into the vault`);
  await fsSet(`bookVaultIndex/${sha(src)}`, { originPath: src, vaultPath: dst, albumId: ctx.albumId, at: Date.now() });
  ctx.moved.set(src, dst);
  if (deletableOrigin(src, ctx.albumId, ctx.ownerId)) ctx.toDelete.add(src);
  return VAULT_REF + dst;
}

async function vaultField(value: any, ctx: MoveCtx): Promise<any> {
  if (typeof value === 'string') return /^https?:\/\//.test(value) ? vaultUrl(value, ctx) : value;
  if (Array.isArray(value)) {
    const out = [];
    for (const v of value) out.push(await vaultField(v, ctx));
    return out;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = /url$/i.test(k) && typeof v === 'string' ? await vaultUrl(v, ctx) : await vaultField(v, ctx);
    return out;
  }
  return value;
}

export interface SealResult { sealed: boolean; chapters: number; files: number; reason?: string; version?: BookVersionStamp; unchanged?: boolean }

const parseUpdate = (raw: any): PublishUpdate | null => {
  if (!raw || typeof raw !== 'object') return null;
  const kind = raw.kind === 'CORRECTION' || raw.kind === 'MINOR' || raw.kind === 'NEW_EDITION' ? raw.kind : null;
  if (!kind) return null;
  return {
    kind,
    notes: typeof raw.notes === 'string' ? raw.notes.slice(0, 600) : undefined,
    editionLabel: typeof raw.editionLabel === 'string' ? raw.editionLabel.slice(0, 80) : undefined,
    upgrade: raw.upgrade === 'PAID' ? 'PAID' : 'FREE',
    upgradePrice: Number(raw.upgradePrice) > 0 ? Math.min(200, Number(raw.upgradePrice)) : undefined,
  };
};

/** Record a published version on the work's ledger (and the new edition, when there is one). */
async function ledgerPublish(albumId: string, actorUid: string, stamp: BookVersionStamp) {
  await appendLedger({ event: stamp.kind === 'NEW_EDITION' ? 'EDITION_PUBLISHED' : 'VERSION_PUBLISHED', workKind: 'book', workId: albumId, at: stamp.createdAt, actorUid, edition: stamp.edition, versionId: stamp.versionId, note: stamp.notes });
}

/**
 * Register a Tela edition version the author just published (albums/{id}/telaVersions/{versionId}).
 * The server owns the edition registry, so the edition number on the version doc, the album's stamp
 * list and the ledger entry can't be set by a client.
 */
export async function registerTelaVersion(albumId: string, actorUid: string, versionId: string, rawUpdate: unknown): Promise<BookVersionStamp> {
  const album = await fsGet(`albums/${encodeURIComponent(albumId)}`);
  if (!album) throw new Error('Book not found');
  const ver = await fsGet(`albums/${encodeURIComponent(albumId)}/telaVersions/${encodeURIComponent(versionId)}`);
  if (!ver) throw new Error('That Tela version was not published');
  const bt = album.bookTela && typeof album.bookTela === 'object' ? album.bookTela : {};
  const existing: BookVersionStamp[] = Array.isArray(bt.versions) ? bt.versions : [];
  const already = existing.find(v => v.versionId === versionId && v.edition);
  if (already) return already;
  const { stamp, registry } = stampVersion(readRegistry(album.bookEditions), existing.filter(v => v.versionId !== versionId), versionId, Number(ver.createdAt) || Date.now(), parseUpdate(rawUpdate));
  const versions = [...existing.filter(v => v.versionId !== versionId), stamp];
  if (!(await fsPatch(`albums/${encodeURIComponent(albumId)}/telaVersions/${encodeURIComponent(versionId)}`, { edition: stamp.edition!, kind: stamp.kind!, ...(stamp.notes ? { notes: stamp.notes } : {}) }))) throw new Error('Could not stamp the version');
  if (!(await fsPatch(`albums/${encodeURIComponent(albumId)}`, { bookTela: { ...bt, versions }, bookEditions: registry }))) throw new Error('Could not update the album');
  await ledgerPublish(albumId, actorUid, stamp);
  return stamp;
}

/** Seal (or re-seal) one paid book. Each content change becomes an immutable version; `update` says what kind. */
export async function sealBook(albumId: string, rawUpdate?: unknown, actorUid?: string, opts: { draft?: boolean } = {}): Promise<SealResult> {
  const album = await fsGet(`albums/${encodeURIComponent(albumId)}`);
  if (!album || album.type !== 'BOOK') return { sealed: false, chapters: 0, files: 0, reason: 'not a book' };
  if (!isPaid(album)) return { sealed: !!album.sealed, chapters: 0, files: 0, reason: 'free book' };
  const ownerId = albumOwner(album);
  const vault = (await fsGet(`bookVault/${encodeURIComponent(albumId)}`)) || {};
  const vaultChapters: Record<string, any> = vault.chapters && typeof vault.chapters === 'object' ? vault.chapters : {};
  const moved = new Map<string, string>(), toDelete = new Set<string>();
  const originUrls = new Set<string>();

  const chapters: any[] = Array.isArray(album.bookChapters) ? album.bookChapters : [];
  const publicChapters = [];
  for (const ch of chapters) {
    const id = String(ch?.id || '');
    if (!id) { publicChapters.push(ch); continue; }
    const ctx: MoveCtx = { albumId, ownerId, chapterId: id, moved, toDelete };
    const entry = { ...(vaultChapters[id] || {}) };
    const pub: Record<string, any> = { ...ch };
    for (const f of SEALED_FIELDS) {
      const v = ch[f];
      const present = typeof v === 'string' ? v.trim() !== '' : Array.isArray(v) ? v.length > 0 : v != null;
      if (present) {
        if (typeof v === 'string' && /^https?:\/\//.test(v)) originUrls.add(v);
        entry[f] = await vaultField(v, ctx);
      }
      delete pub[f];
    }
    if (Array.isArray(entry.pages)) pub.pageCount = entry.pages.length;
    pub.sealed = true;
    vaultChapters[id] = entry;
    publicChapters.push(pub);
  }

  // The full readable book as of this publish (public chapter fields + vault content), frozen as a version.
  const fullChapters = publicChapters.map((c: any) => {
    const { sealed: _s, pageCount: _p, ...rest } = c;
    return { ...rest, ...(vaultChapters[String(c?.id)] || {}) };
  });
  const contentHash = crypto.createHash('sha256').update(canonical(fullChapters)).digest('hex');
  const update = parseUpdate(rawUpdate);
  const existing: BookVersionStamp[] = Array.isArray(album.bookVersions) ? album.bookVersions : [];
  const now = Date.now();
  let version: BookVersionStamp | undefined;
  let registry = readRegistry(album.bookEditions);
  // A draft/autosave secures the content but releases nothing: readers stay on the last published version.
  const changed = !opts.draft && (contentHash !== vault.lastVersionHash || !existing.length || update?.kind === 'NEW_EDITION');
  if (changed) {
    const stamped = stampVersion(registry, existing, `v${now.toString(36)}${crypto.randomBytes(2).toString('hex')}`, now, update);
    version = stamped.stamp; registry = stamped.registry;
    const snap = await fsSet(`bookVault/${encodeURIComponent(albumId)}/versions/${version.versionId}`, { ...version, albumId, contentHash, chapters: fullChapters });
    if (!snap) throw new Error('Could not store the book version');
  }

  const ok = await fsSet(`bookVault/${encodeURIComponent(albumId)}`, { albumId, ownerId, chapters: vaultChapters, sealedAt: now, lastHash: contentHash, lastVersionHash: version ? contentHash : (vault.lastVersionHash || ''), lastVersionId: version ? version.versionId : (vault.lastVersionId || '') });
  if (!ok) throw new Error('Could not write the book vault');
  // A book's file can also sit on a track (older uploads); strip any URL we just sealed.
  const tracks = Array.isArray(album.tracks) ? album.tracks.map((t: any) => (t?.url && originUrls.has(t.url) ? { ...t, url: '' } : t)) : undefined;
  const patched = await fsPatch(`albums/${encodeURIComponent(albumId)}`, {
    bookChapters: publicChapters, sealed: true, sealedAt: now, ...(tracks ? { tracks } : {}),
    ...(version ? { bookVersions: [...existing, version], bookEditions: registry } : {}),
  });
  if (!patched) throw new Error('Could not update the album');
  if (version) await ledgerPublish(albumId, actorUid || ownerId, version);
  // Only now, with the vault and album both written, remove the public originals.
  for (const p of toDelete) { if (!(await gcsDelete(p))) console.warn('[bookVault] could not delete original', p); }
  return { sealed: true, chapters: publicChapters.length, files: moved.size, ...(version ? { version } : { unchanged: true }) };
}

/** Album with its vault content merged back (server-side use, e.g. print interiors). Vault refs stay as refs. */
export async function withVaultContent(albumId: string, album: any): Promise<any> {
  if (!album?.sealed) return album;
  const vault = await fsGet(`bookVault/${encodeURIComponent(albumId)}`);
  const vc = vault?.chapters || {};
  return { ...album, bookChapters: (album.bookChapters || []).map((c: any) => ({ ...c, ...(vc[c?.id] || {}) })) };
}

function resolveRefs(value: any, albumId: string): any {
  if (typeof value === 'string') return value.startsWith(VAULT_REF) ? signedUrl(albumId, value.slice(VAULT_REF.length)) : value;
  if (Array.isArray(value)) return value.map(v => resolveRefs(v, albumId));
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveRefs(v, albumId);
    return out;
  }
  return value;
}

async function optionalUid(req: any): Promise<string | null> {
  const h = String(req.headers.authorization || '');
  if (!h.startsWith('Bearer ')) return null;
  return verifyIdToken(h.slice(7)).catch(() => null);
}

const readLicense = async (uid: string, albumId: string) =>
  (await fsGet(`users/${uid}/contentLicenses/book_${albumId}`)) as EditionLicense | null;

export function createBookVaultRouter(deps: BookVaultDeps): Router {
  const r = Router();

  r.post('/admin/seal-all', deps.authMiddleware, express.json({ limit: '4kb' }), async (req: any, res) => {
    if (!(await deps.isAdmin(req))) return res.status(403).json({ error: 'Platform admin access required' });
    const books = await fsQuery('albums', [{ field: 'type', value: 'BOOK' }], 1000);
    const results: Array<{ id: string } & Partial<SealResult> & { error?: string }> = [];
    for (const b of books) {
      if (!isPaid(b.data) || (b.data.sealed && !req.body?.force)) continue;
      try { results.push({ id: b.id, ...(await sealBook(b.id)) }); }
      catch (e: any) { results.push({ id: b.id, error: String(e?.message || e) }); }
    }
    res.json({ ok: true, scanned: books.length, sealed: results.filter(x => x.sealed).length, results });
  });

  r.post('/:id/seal', deps.authMiddleware, express.json({ limit: '4kb' }), async (req: any, res) => {
    const id = String(req.params.id || '');
    const album = id ? await fsGet(`albums/${encodeURIComponent(id)}`) : null;
    if (!album) return res.status(404).json({ error: 'Book not found' });
    if (albumOwner(album) !== req.uid && !(await deps.isAdmin(req))) return res.status(403).json({ error: 'Only the author can seal this book' });
    try { res.json({ ok: true, ...(await sealBook(id, req.body?.update, req.uid, { draft: req.body?.draft === true })) }); }
    catch (e: any) { console.error('[bookVault] seal failed', id, e?.message || e); res.status(500).json({ error: String(e?.message || e) }); }
  });

  // Tela edition publish → server stamps the edition + ledger (see registerTelaVersion).
  r.post('/:id/tela-versions/:versionId/register', deps.authMiddleware, express.json({ limit: '8kb' }), async (req: any, res) => {
    const id = String(req.params.id || '');
    const album = id ? await fsGet(`albums/${encodeURIComponent(id)}`) : null;
    if (!album) return res.status(404).json({ error: 'Book not found' });
    if (albumOwner(album) !== req.uid) return res.status(403).json({ error: 'Only the author can publish this book' });
    try { res.json({ ok: true, version: await registerTelaVersion(id, req.uid, String(req.params.versionId), req.body?.update) }); }
    catch (e: any) { console.error('[bookVault] tela register failed', id, e?.message || e); res.status(500).json({ error: String(e?.message || e) }); }
  });

  r.get('/:id/access', async (req: any, res) => {
    const id = String(req.params.id || '');
    const album = id ? await fsGet(`albums/${encodeURIComponent(id)}`) : null;
    if (!album) return res.status(404).json({ error: 'Book not found' });
    res.setHeader('Cache-Control', 'private, no-store');
    if (!album.sealed) return res.json({ sealed: false });
    const uid = await optionalUid(req);
    const owner = !!uid && albumOwner(album) === uid;
    const admin = !!uid && !owner && !!(await fsGet(`admins/${uid}`));
    const license = uid && !owner ? await readLicense(uid, id) : null;
    const registry = readRegistry(album.bookEditions);
    const versions: BookVersionStamp[] = Array.isArray(album.bookVersions) ? album.bookVersions : [];
    const choice = chooseVersion({
      versions, registry, isOwner: owner || admin, isPaid: isPaid(album), license,
      preferredVersionId: typeof req.query.version === 'string' ? req.query.version : null,
    });
    // Books sealed before versions existed have no stamps: the vault's current content is edition 1.
    const legacy = !versions.length && (owner || admin || !isPaid(album) || licenceActive(license));
    const entitled = !!choice.version || legacy;
    const vault = await fsGet(`bookVault/${encodeURIComponent(id)}`);
    let chapters: any[];
    if (choice.version) {
      const snap = await fsGet(`bookVault/${encodeURIComponent(id)}/versions/${encodeURIComponent(choice.version.versionId)}`);
      if (!snap || !Array.isArray(snap.chapters)) return res.status(500).json({ error: 'This version of the book is missing — try again shortly' });
      chapters = snap.chapters.map((c: any) => resolveRefs(c, id));
    } else {
      // Not entitled (or legacy): current public chapters, opened where allowed (author-marked free preview chapters).
      const preview = album.bookPreviewConfig?.type === 'CHAPTERS' && Array.isArray(album.bookPreviewConfig.allowedChapterIds)
        ? new Set<string>(album.bookPreviewConfig.allowedChapterIds.map(String)) : new Set<string>();
      const vc = vault?.chapters || {};
      chapters = (album.bookChapters || []).map((c: any) => {
        const open = legacy || preview.has(String(c?.id));
        return open ? { ...c, ...resolveRefs(vc[c?.id] || {}, id), sealed: undefined } : c;
      });
    }
    res.json({
      sealed: true, entitled, owner, chapters, registry,
      version: choice.version, followLatest: choice.followLatest, readable: choice.readable,
      purchased: choice.purchased, upgradeOffer: choice.upgradeOffer,
    });
  });

  r.options('/:id/file', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.status(204).end();
  });
  r.get('/:id/file', async (req: any, res) => {
    const id = String(req.params.id || '');
    const path = String(req.query.p || '');
    const exp = Number(req.query.exp) || 0;
    if (!path.startsWith(`book-vault/${id}/`) || path.includes('..') || !verifySig(id, path, exp, String(req.query.sig || ''))) {
      return res.status(403).json({ error: 'This reading link has expired — reopen the book' });
    }
    try {
      const headers: Record<string, string> = {};
      if (req.headers.range) headers.Range = String(req.headers.range);
      const g = await gcs(`${encodeURIComponent(path)}?alt=media`, { headers });
      if (!g.ok && g.status !== 206) return res.status(g.status === 404 ? 404 : 502).end();
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', g.headers.get('content-type') || 'application/octet-stream');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      for (const h of ['content-range', 'content-length']) { const v = g.headers.get(h); if (v) res.setHeader(h, v); }
      res.status(g.status === 206 ? 206 : 200);
      if (!g.body) return res.end();
      const upstream = Readable.fromWeb(g.body as any);
      upstream.on('error', () => res.destroy());
      req.on('close', () => upstream.destroy());
      upstream.pipe(res);
    } catch (e: any) {
      console.error('[bookVault] file stream failed', id, e?.message || e);
      if (!res.headersSent) res.status(502).end();
    }
  });

  return r;
}
