/**
 * Mirrors every REMOTE archive image used by the Dossier exhibits into the app, so no exhibit depends on
 * Wikimedia (or any other third-party host) at runtime.
 *
 *   npx tsx scripts/dossier/mirrorAssets.ts                    # all five exhibits (+ douglassFilmAssets.json), then rewrite refs
 *   npx tsx scripts/dossier/mirrorAssets.ts --slug=founding    # one exhibit
 *   npx tsx scripts/dossier/mirrorAssets.ts --limit=10         # at most 10 network downloads this run (chunking)
 *   npx tsx scripts/dossier/mirrorAssets.ts --dry-run          # print the plan, touch nothing
 *   npx tsx scripts/dossier/mirrorAssets.ts --refs-only        # only rewrite *.tela.json / *Fabula.json / registry.ts refs
 *
 * What it does, per asset whose `url` is http(s) and whose rights are publishable:
 *   1. reuses public/dossier/<slug>/archival/<assetId>.<ext> when the film pipeline (fetchFilmAssets.ts) already stored it
 *      (status "reused-local"); otherwise downloads the URL ONCE, exactly as served (no re-encoding, no resizing), to
 *      public/dossier/<slug>/archival/<assetId>.<ext> (ext from content-type). Originals above ~12 megapixels are fetched as
 *      the standard 1920px Wikimedia thumbnail instead (the hall never shows more than 1920 across);
 *   2. verifies the bytes are a real image of the type the host claimed (magic bytes, then sharp metadata);
 *   3. dedupes by sha256: identical bytes already mirrored anywhere are not stored twice;
 *   4. rewrites the asset's `url` to '/dossier/<slug>/archival/<file>' and records the old one as `originalUrl`
 *      (rights, recordUrl, credit, rightsNote and every other field are untouched; the JSON text is edited in place, so
 *      line endings and non-UTF-8 bytes in fordAssets.json survive byte-for-byte).
 *
 * Polite and resumable: sequential queue, 1.5 s spacing, User-Agent with contact, Retry-After + exponential backoff on
 * 429/503, a smaller standard thumbnail as a fallback, and data/dossier/mirror-manifest.json as the source of truth
 * (files already present and non-empty are skipped, so re-running is idempotent).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const DATA = path.join(ROOT, 'data', 'dossier');
const PUBLIC = path.join(ROOT, 'public');
const MANIFEST = path.join(DATA, 'mirror-manifest.json');
const UA = 'PlajahDossier/1.0 (kmoody2003@gmail.com)';
const SPACING_MS = 1500;
const MAX_MEGAPIXELS = 12;

const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const flag = (k: string) => process.argv.includes(`--${k}`);
const ONLY_SLUG = arg('slug');
const LIMIT = arg('limit') ? Number(arg('limit')) : Infinity;
const DRY = flag('dry-run');
const REFS_ONLY = flag('refs-only');
const MAX_WAIT_S = Number(arg('max-wait') ?? 900);

const TARGETS: Array<{ slug: string; file: string }> = [
  { slug: 'partition', file: 'partitionAssets.json' },
  { slug: 'founding', file: 'foundingAssets.json' },
  { slug: 'persia', file: 'persiaAssets.json' },
  { slug: 'douglass', file: 'douglassAssets.json' },
  { slug: 'douglass', file: 'douglassFilmAssets.json' },
  { slug: 'ford', file: 'fordAssets.json' },
];
/**
 * Lobby cards show an image at ~400 px wide: a full-resolution original (ref-1847-miller is 8 MB) would make the lobby the
 * heaviest page in the app. These are the standard Commons thumbnails the lobby used before, stored once as their own files.
 */
const HEROES: Array<{ slug: string; id: string; of: string; url: string }> = [
  { slug: 'douglass', id: 'ref-1847-miller-hero', of: 'ref-1847-miller', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Samuel_J._Miller_-_Frederick_Douglass_-_Google_Art_Project.jpg/960px-Samuel_J._Miller_-_Frederick_Douglass_-_Google_Art_Project.jpg' },
];
const PUBLISHABLE = new Set(['public-domain', 'cc0', 'cc-by', 'cc-by-sa', 'generated']);
const EXT_BY_TYPE: Record<string, string> = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

export type MirrorStatus = 'mirrored' | 'reused-local' | 'deduped' | 'already-local' | 'skipped-rights' | 'skipped-unrenderable' | 'failed';
export interface ManifestEntry {
  id: string; slug: string; originalUrl: string; fetchedFrom?: string; localPath: string; bytes: number; sha256: string;
  fetchedAt: string; status: MirrorStatus; width?: number; height?: number; note?: string;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const sha256 = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');
const isRemote = (u: string) => /^https?:\/\//i.test(u);
const localToDisk = (p: string) => path.join(PUBLIC, p.replace(/^\//, ''));

function loadManifest(): Record<string, ManifestEntry> {
  if (!fs.existsSync(MANIFEST)) return {};
  const list: ManifestEntry[] = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  return Object.fromEntries(list.map(e => [`${e.slug}/${e.id}`, e]));
}
function saveManifest(m: Record<string, ManifestEntry>) {
  const list = Object.values(m).sort((a, b) => (a.slug + a.id).localeCompare(b.slug + b.id));
  fs.writeFileSync(MANIFEST + '.tmp', JSON.stringify(list, null, 2) + '\n');
  fs.renameSync(MANIFEST + '.tmp', MANIFEST);
}

/** Magic-byte type of a buffer, or null when it is not an image/pdf we recognise. */
export function sniff(b: Buffer): 'jpg' | 'png' | 'gif' | 'webp' | 'pdf' | 'tiff' | 'svg' | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (b.toString('latin1', 0, 4) === 'GIF8') return 'gif';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (b.toString('latin1', 0, 4) === '%PDF') return 'pdf';
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2a)) return 'tiff';
  if (/^\s*(<\?xml|<svg)/.test(b.toString('utf8', 0, 64))) return 'svg';
  return null;
}

async function inspect(b: Buffer): Promise<{ width?: number; height?: number }> {
  try {
    const sharp = (await import('sharp')).default;
    const m = await sharp(b).metadata();
    return { width: m.width, height: m.height };
  } catch { return {}; }
}

/** Candidate URLs to try, best first: the asset's own URL (large originals are swapped for a 1920px thumb), then smaller standard widths. */
function candidates(url: string, w?: number, h?: number): string[] {
  const out: string[] = [];
  const orig = url.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/([0-9a-f]\/[0-9a-f]{2})\/([^/]+)$/);
  const thumb = url.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/thumb\/([0-9a-f]\/[0-9a-f]{2})\/([^/]+)\/(?:page\d+-)?(\d+)px-[^/]+$/);
  const mk = (px: number) => orig ? `${orig[1]}/thumb/${orig[2]}/${orig[3]}/${px}px-${orig[3]}` : thumb ? url.replace(/(\d+)px-/, `${px}px-`) : null;
  const big = orig && w && h && (w * h) / 1e6 > MAX_MEGAPIXELS;
  if (big) out.push(mk(1920)!);
  out.push(url);
  const cur = thumb ? Number(thumb[4]) : Infinity;
  for (const px of [1280, 960]) { const u = mk(px); if (u && px < cur && !out.includes(u)) out.push(u); }
  return out;
}

type Fetched = { buf: Buffer; type: string; url: string } | { error: string; rateLimited?: boolean };

async function fetchOne(url: string): Promise<Fetched> {
  let waited = 0;
  for (let attempt = 0; attempt < 5; attempt++) {
    let res: Response;
    try { res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'image/*,*/*;q=0.5' } }); }
    catch (e) { await sleep(2000 * 2 ** attempt); if (attempt === 4) return { error: `network: ${(e as Error).message}` }; continue; }
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      const len = Number(res.headers.get('content-length') ?? 0);
      if (len && buf.length !== len) return { error: `truncated (${buf.length} of ${len} bytes)` };
      return { buf, type: (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase(), url };
    }
    if (res.status === 429 || res.status === 503 || res.status >= 500) {
      const ra = Number(res.headers.get('retry-after'));
      const wait = Math.min(MAX_WAIT_S, Number.isFinite(ra) && ra > 0 ? ra : 20 * 2 ** attempt);
      console.log(`    ${res.status} on ${url.slice(-60)}; waiting ${wait}s (attempt ${attempt + 1}/5)`);
      if (attempt === 4 || waited + wait > MAX_WAIT_S * 2) return { error: `HTTP ${res.status}`, rateLimited: res.status === 429 || res.status === 503 };
      await sleep(wait * 1000); waited += wait; continue;
    }
    return { error: `HTTP ${res.status}` };
  }
  return { error: 'gave up' };
}

function existingLocal(dir: string, id: string): string | null {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'gif']) {
    const p = path.join(dir, `${id}.${ext}`);
    if (fs.existsSync(p) && fs.statSync(p).size > 0) return p;
  }
  return null;
}

async function main() {
  const manifest = loadManifest();
  const bySha = new Map<string, string>();      // sha256 -> local public path (first claimant)
  for (const e of Object.values(manifest)) if (e.sha256 && e.localPath && fs.existsSync(localToDisk(e.localPath))) bySha.set(e.sha256, e.localPath);
  let downloads = 0, lastNet = 0;
  const counts: Record<string, Record<string, number>> = {};
  const bump = (slug: string, s: string) => { (counts[slug] ??= {})[s] = (counts[slug][s] ?? 0) + 1; };

  if (!REFS_ONLY) for (const t of TARGETS) {
    if (ONLY_SLUG && t.slug !== ONLY_SLUG) continue;
    const file = path.join(DATA, t.file);
    let text = fs.readFileSync(file, 'latin1');        // latin1 is byte-transparent: the file is written back unchanged except for the URLs
    const assets: Array<{ id: string; url: string; originalUrl?: string; width?: number; height?: number; rights: { status: string } }> = JSON.parse(text);
    const dir = path.join(PUBLIC, 'dossier', t.slug, 'archival');
    fs.mkdirSync(dir, { recursive: true });
    console.log(`\n== ${t.file} (${assets.length} assets)`);
    let dirty = false;

    for (const a of assets) {
      const key = `${t.slug}/${a.id}`;
      const prev = manifest[key];
      const done = (e: ManifestEntry) => { manifest[key] = e; bump(t.slug, e.status); if (!DRY) saveManifest(manifest); };

      if (!isRemote(a.url)) {                           // already points at a local path
        if (!fs.existsSync(localToDisk(a.url))) console.warn(`  ${a.id}: local path ${a.url} is MISSING on disk`);
        bump(t.slug, prev && prev.status !== 'already-local' ? prev.status : 'already-local');
        continue;
      }
      if (!PUBLISHABLE.has(a.rights.status)) {
        console.log(`  ${a.id}: skipped, rights ${a.rights.status} not publishable`);
        done({ id: a.id, slug: t.slug, originalUrl: a.url, localPath: '', bytes: 0, sha256: '', fetchedAt: new Date().toISOString(), status: 'skipped-rights' });
        continue;
      }
      if (/\.(pdf|tiff?)$/i.test(a.url.split('?')[0])) {
        console.log(`  ${a.id}: skipped, ${a.url.slice(-20)} cannot be shown by the hall`);
        done({ id: a.id, slug: t.slug, originalUrl: a.url, localPath: '', bytes: 0, sha256: '', fetchedAt: new Date().toISOString(), status: 'skipped-unrenderable' });
        continue;
      }

      // 1. already on disk (this script earlier, or the film pipeline)?
      const have = existingLocal(dir, a.id);
      if (have) {
        const buf = fs.readFileSync(have);
        const type = sniff(buf);
        if (type && type !== 'pdf' && type !== 'tiff' && type !== 'svg') {
          const rel = '/' + path.relative(PUBLIC, have).split(path.sep).join('/');
          const sum = sha256(buf);
          const fresh = prev?.status === 'mirrored' || prev?.status === 'deduped';
          const dims = await inspect(buf);
          done({ id: a.id, slug: t.slug, originalUrl: prev?.originalUrl ?? a.url, fetchedFrom: prev?.fetchedFrom, localPath: rel, bytes: buf.length, sha256: sum, fetchedAt: prev?.fetchedAt ?? new Date().toISOString(), status: fresh ? prev!.status : 'reused-local', ...dims, note: prev?.note ?? (fresh ? undefined : 'stored earlier by the film pipeline (fetchFilmAssets.ts)') });
          if (!bySha.has(sum)) bySha.set(sum, rel);
          console.log(`  ${a.id}: ${fresh ? prev!.status : 'reused-local'} ${rel}`);
          dirty = true;
          continue;
        }
        console.warn(`  ${a.id}: existing ${have} is not a valid image (${type}); refetching`);
      }

      // 2. download once
      if (downloads >= LIMIT) { console.log(`  ${a.id}: queued (limit reached)`); continue; }
      if (DRY) { console.log(`  ${a.id}: would download ${a.url.slice(0, 120)}`); continue; }
      let ok: { buf: Buffer; type: string; url: string } | null = null;
      let lastErr = '';
      for (const u of candidates(a.url, a.width, a.height)) {
        const wait = lastNet + SPACING_MS - Date.now(); if (wait > 0) await sleep(wait);
        const r = await fetchOne(u); lastNet = Date.now(); downloads++;
        if ('error' in r) { lastErr = `${r.error} (${u.slice(-70)})`; continue; }
        ok = r; break;
      }
      if (!ok) {
        console.warn(`  ${a.id}: FAILED ${lastErr}`);
        done({ id: a.id, slug: t.slug, originalUrl: a.url, localPath: '', bytes: 0, sha256: '', fetchedAt: new Date().toISOString(), status: 'failed', note: lastErr });
        continue;
      }
      const sniffed = sniff(ok.buf);
      const claimed = EXT_BY_TYPE[ok.type];
      if (!sniffed || sniffed === 'pdf' || sniffed === 'tiff' || sniffed === 'svg' || (claimed && claimed !== sniffed)) {
        const note = `not a displayable image: content-type ${ok.type}, bytes look like ${sniffed ?? 'unknown'}`;
        console.warn(`  ${a.id}: FAILED ${note}`);
        done({ id: a.id, slug: t.slug, originalUrl: a.url, fetchedFrom: ok.url, localPath: '', bytes: ok.buf.length, sha256: '', fetchedAt: new Date().toISOString(), status: 'failed', note });
        continue;
      }
      const dims = await inspect(ok.buf);
      if (!dims.width) {
        console.warn(`  ${a.id}: FAILED image does not decode`);
        done({ id: a.id, slug: t.slug, originalUrl: a.url, fetchedFrom: ok.url, localPath: '', bytes: ok.buf.length, sha256: '', fetchedAt: new Date().toISOString(), status: 'failed', note: 'does not decode' });
        continue;
      }
      const sum = sha256(ok.buf);
      const dup = bySha.get(sum);
      let rel: string, status: MirrorStatus = 'mirrored', note: string | undefined;
      if (dup) { rel = dup; status = 'deduped'; note = `identical bytes to ${dup}`; }
      else {
        rel = `/dossier/${t.slug}/archival/${a.id}.${sniffed}`;
        const dest = localToDisk(rel);
        fs.writeFileSync(dest + '.part', ok.buf); fs.renameSync(dest + '.part', dest);
        bySha.set(sum, rel);
      }
      if (ok.url !== a.url) note = `${note ? note + '; ' : ''}fetched ${ok.url.match(/(\d+)px-/)?.[1] ?? '?'}px thumbnail instead of the original`;
      done({ id: a.id, slug: t.slug, originalUrl: a.url, fetchedFrom: ok.url !== a.url ? ok.url : undefined, localPath: rel, bytes: ok.buf.length, sha256: sum, fetchedAt: new Date().toISOString(), status, ...dims, note });
      console.log(`  ${a.id}: ${status} ${rel} (${(ok.buf.length / 1024).toFixed(0)} KB, ${dims.width}x${dims.height})`);
      dirty = true;
    }

    // 3. rewrite url -> local path (+ originalUrl), in place in the raw text
    if (!DRY && dirty) {
      let changed = 0;
      for (const a of assets) {
        const e = manifest[`${t.slug}/${a.id}`];
        if (!e || !e.localPath || !isRemote(a.url) || !['mirrored', 'reused-local', 'deduped'].includes(e.status)) continue;
        const re = new RegExp(`^([ \\t]*)"url": "${a.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"(,?)(\\r?\\n)`, 'm');
        const next = text.replace(re, (_m, ind: string, comma: string, eol: string) =>
          `${ind}"url": "${e.localPath}",${eol}${ind}"originalUrl": "${a.url}"${comma}${eol}`);
        if (next !== text) { text = next; changed++; }
        else console.warn(`  ${a.id}: could not find the url line to rewrite`);
      }
      if (changed) {
        JSON.parse(text);                                // never write a broken file
        fs.writeFileSync(file, text, 'latin1');
        console.log(`  rewrote ${changed} url(s) in ${t.file}`);
      }
    }
  }

  // 3b. lobby hero thumbnails (separate small files, same Commons images)
  if (!REFS_ONLY && !DRY) for (const h of HEROES) {
    if (ONLY_SLUG && h.slug !== ONLY_SLUG) continue;
    const key = `${h.slug}/${h.id}`;
    const rel = `/dossier/${h.slug}/archival/${h.id}.jpg`;
    if (manifest[key] && fs.existsSync(localToDisk(rel))) continue;
    const r = await fetchOne(h.url); lastNet = Date.now();
    if ('error' in r || sniff(r.buf) !== 'jpg') { console.warn(`  ${h.id}: FAILED ${'error' in r ? r.error : 'not a jpeg'}`); continue; }
    fs.writeFileSync(localToDisk(rel), r.buf);
    manifest[key] = { id: h.id, slug: h.slug, originalUrl: h.url, localPath: rel, bytes: r.buf.length, sha256: sha256(r.buf), fetchedAt: new Date().toISOString(), status: 'mirrored', ...(await inspect(r.buf)), note: `lobby hero thumbnail of ${h.of}` };
    saveManifest(manifest);
    console.log(`  ${h.id}: mirrored ${rel} (${(r.buf.length / 1024).toFixed(0)} KB)`);
  }

  // 4. other places that carry the same remote images: the Tela timelines, the Fabula films, the registry heroes
  if (!DRY) rewriteRefs(manifest);

  console.log('\n== summary');
  for (const [slug, c] of Object.entries(counts)) console.log(`  ${slug}: ${JSON.stringify(c)}`);
  const all = Object.values(manifest);
  const mb = all.filter(e => e.status === 'mirrored').reduce((n, e) => n + e.bytes, 0) / 1048576;
  console.log(`  network requests this run: ${downloads}; newly downloaded bytes in manifest: ${mb.toFixed(1)} MB; failures: ${all.filter(e => e.status === 'failed').length}`);
}

/** Commons file name (decoded) or the whole URL for non-Commons hosts: the join key between an asset and any URL form of it. */
export function refKey(url: string): string {
  const m = url.match(/\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/);
  if (m) { try { return decodeURIComponent(m[1]).replace(/ /g, '_'); } catch { return m[1]; } }
  return url;
}

function rewriteRefs(manifest: Record<string, ManifestEntry>) {
  const byKey = new Map<string, string>();
  for (const e of Object.values(manifest)) if (e.localPath && !e.id.endsWith('-hero') && ['mirrored', 'reused-local', 'deduped'].includes(e.status)) {
    byKey.set(refKey(e.originalUrl), e.localPath);
    if (e.fetchedFrom) byKey.set(refKey(e.fetchedFrom), e.localPath);
  }
  const files = fs.readdirSync(DATA).filter(f => /\.tela\.json$|Fabula\.json$/.test(f)).concat(['registry.ts']);
  const re = /https:\/\/(?:upload\.wikimedia\.org\/wikipedia\/commons|tile\.loc\.gov)\/[^"'`\s)\\]+/g;
  for (const f of files) {
    const p = path.join(DATA, f);
    const text = fs.readFileSync(p, 'latin1');
    let n = 0; const missing: string[] = [];
    const next = text.replace(re, u => {
      const hit = byKey.get(refKey(u));
      if (hit) { n++; return hit; }
      missing.push(u); return u;
    });
    if (n) { if (f.endsWith('.json')) JSON.parse(next); fs.writeFileSync(p, next, 'latin1'); }
    if (n || missing.length) console.log(`  refs ${f}: rewrote ${n}${missing.length ? `, UNMAPPED ${missing.length}: ${missing.slice(0, 3).join(' ')}` : ''}`);
  }
}

// Only run when invoked as a script (tests import sniff/refKey from here).
if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) main().catch(e => { console.error(e); process.exit(1); });
