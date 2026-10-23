// Run Chora Music Intelligence for one or more albums from this machine, through the SAME pipeline
// the API runs (routes/musicIntel.ts → services/musicIntel/worker.ts), against the production database.
//
//   npx tsx scripts/runMusicIntel.ts <albumId> [<albumId> …] [--force]
//
// Data: the signed-in gcloud user (`gcloud auth print-access-token`, same as
// scripts/publishAlbumForUser.ts), passed to the pipeline as its store. Gemini key from .env.local.
// Lyrics go through production's own /api/lyrics/ensure (public albums), so the lyric worker stays
// the only writer of timeCodedLyrics. ffmpeg: FFMPEG_PATH, else `ffmpeg` on PATH.
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import type { IntelStore } from '../routes/musicIntel';

for (const line of (existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const FS = 'https://firestore.googleapis.com/v1/projects/gen-lang-client-0665118474/databases/plajah-prod/documents';
const BUCKET = 'gen-lang-client-0665118474.firebasestorage.app';
const PROD = process.env.MUSIC_INTEL_API_ORIGIN || 'https://plajah.com';

let token = '', tokenAt = 0;
function bearer(): Record<string, string> {
  if (!token || Date.now() - tokenAt > 40 * 60_000) {
    token = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
    tokenAt = Date.now();
  }
  return { Authorization: `Bearer ${token}` };
}

// ── Firestore REST value codec ───────────────────────────────────────────────
function toValue(v: any): any {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: toFields(v) } };
}
function toFields(o: Record<string, any>): Record<string, any> {
  const f: Record<string, any> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) f[k] = toValue(v);
  return f;
}
function fromValue(v: any): any {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  return null;
}
function fromFields(f: Record<string, any>): Record<string, any> {
  const o: Record<string, any> = {};
  for (const [k, v] of Object.entries(f)) o[k] = fromValue(v);
  return o;
}
// The route already percent-encodes track ids in doc paths; leave those segments alone.
const enc = (p: string) => p.split('/').map(s => (/%[0-9A-F]{2}/i.test(s) ? s : encodeURIComponent(s))).join('/');

const store: IntelStore = {
  async get(path) {
    const r = await fetch(`${FS}/${enc(path)}`, { headers: bearer() });
    if (!r.ok) return null;
    const d: any = await r.json();
    return d.fields ? fromFields(d.fields) : {};
  },
  async patch(path, data) {
    const mask = Object.keys(data).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    const r = await fetch(`${FS}/${enc(path)}?${mask}`, { method: 'PATCH', headers: { ...bearer(), 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: toFields(data) }) });
    if (!r.ok) console.warn(`  [store] patch ${path} → ${r.status} ${(await r.text()).slice(0, 160)}`);
    return r.ok;
  },
  async set(path, data) {
    const r = await fetch(`${FS}/${enc(path)}`, { method: 'PATCH', headers: { ...bearer(), 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: toFields(data) }) });
    if (!r.ok) console.warn(`  [store] set ${path} → ${r.status} ${(await r.text()).slice(0, 160)}`);
    return r.ok;
  },
  async list(collectionPath) {
    const out: Array<{ id: string; data: Record<string, any> }> = [];
    let page = '';
    do {
      const r = await fetch(`${FS}/${enc(collectionPath)}?pageSize=100${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`, { headers: bearer() });
      if (!r.ok) break;
      const d: any = await r.json();
      for (const doc of d.documents || []) out.push({ id: String(doc.name).split('/').pop()!, data: fromFields(doc.fields || {}) });
      page = d.nextPageToken || '';
    } while (page && out.length < 200);
    return out;
  },
  async query(collection, filters, limit) {
    const ff = (f: { field: string; value: any }) => ({ fieldFilter: { field: { fieldPath: f.field }, op: 'EQUAL', value: toValue(f.value) } });
    const where = filters.length === 1 ? ff(filters[0]) : { compositeFilter: { op: 'AND', filters: filters.map(ff) } };
    const r = await fetch(`${FS}:runQuery`, { method: 'POST', headers: { ...bearer(), 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], where, limit } }) });
    if (!r.ok) return [];
    const rows: any[] = await r.json();
    return rows.filter(x => x.document).map(x => ({ id: String(x.document.name).split('/').pop()!, data: fromFields(x.document.fields || {}) }));
  },
  async storageJson(objectPath) {
    const r = await fetch(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media`, { headers: bearer() });
    return r.ok ? r.json() : null;
  },
};

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const ids = args.filter(a => !a.startsWith('--'));
  if (!ids.length) { console.error('usage: npx tsx scripts/runMusicIntel.ts <albumId> [...] [--force]'); process.exit(1); }
  const { runWith } = await import('../routes/musicIntel');

  for (const albumId of ids) {
    const album = await store.get(`albums/${albumId}`);
    if (!album) { console.error(`✗ ${albumId}: not found`); continue; }
    console.log(`\n▶ ${album.title} — ${album.artist} (${(album.tracks || []).length} tracks)`);
    const extra = {
      store,
      ensureLyrics: async (id: string, track: { id: string }) => {
        try {
          const r = await fetch(`${PROD}/api/lyrics/ensure`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ albumId: id, trackId: track.id }), signal: AbortSignal.timeout(280_000),
          });
          const j: any = await r.json().catch(() => ({}));
          return Array.isArray(j?.captions) ? j.captions : [];
        } catch { return []; }
      },
    };
    let first = true;
    for (let slice = 0; slice < 60; slice++) {
      const t0 = Date.now();
      const out = await runWith(extra, albumId, { force: force && first, ownerId: album.ownerId, budgetMs: 20 * 60_000 });
      first = false;
      console.log(`  slice ${slice + 1}: ${out.status} · heard ${out.heard} · remaining ${out.remaining} · ${Math.round((Date.now() - t0) / 1000)}s`);
      for (const e of out.errors) console.log(`    ! ${e}`);
      if (out.status === 'BUSY') { await new Promise(r => setTimeout(r, 30_000)); continue; }
      if (!(out.remaining > 0)) break;
    }
    const job = await store.get(`musicIntel/${albumId}`);
    console.log(`  → ${job?.status} · film: ${job?.film?.status || 'n/a'}${job?.film?.filmTitle ? ` (${job.film.filmTitle})` : ''}`);
    if (job?.album?.overview) console.log(`  overview: ${String(job.album.overview).slice(0, 400)}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
