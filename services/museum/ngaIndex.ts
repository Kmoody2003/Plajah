/**
 * National Gallery of Art (Washington) — open-access dataset index. SERVER ONLY (Node).
 *
 * NGA publishes no search API; it publishes CSVs (github.com/NationalGalleryOfArt/opendata).
 * We download objects.csv + published_images.csv once, cache them on disk for a week, keep a compact
 * in-memory index of works that have an open-access primary image, and search that. Images come from
 * NGA's IIIF service. Never throws; returns [] if the dataset can't be loaded.
 */
import type { Artifact } from '../artifactsService';

const BASE = 'https://raw.githubusercontent.com/NationalGalleryOfArt/opendata/main/data';
const WEEK = 7 * 24 * 3600 * 1000;

interface NgaRow { id: string; title: string; artist: string; date: string; medium: string; cls: string; acc: string; uuid: string; alt: string; hay: string }
let index: NgaRow[] | null = null;
let loading: Promise<NgaRow[]> | null = null;

/** Minimal RFC-4180 parser that yields rows lazily (fields may contain quoted newlines). */
function* csvRows(text: string): Generator<string[]> {
  let row: string[] = []; let field = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field.replace(/\r$/, '')); yield row; row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); yield row; }
}

async function cached(name: string): Promise<string> {
  const fs = await import('node:fs/promises'); const os = await import('node:os'); const path = await import('node:path');
  const file = path.join(os.tmpdir(), `plajah-nga-${name}`);
  try { const st = await fs.stat(file); if (Date.now() - st.mtimeMs < WEEK && st.size > 1000) return await fs.readFile(file, 'utf8'); } catch { /* download */ }
  const res = await fetch(`${BASE}/${name}`, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`NGA ${name} HTTP ${res.status}`);
  const text = await res.text();
  await fs.writeFile(file, text).catch(() => {});
  return text;
}

async function build(): Promise<NgaRow[]> {
  const [imgText, objText] = await Promise.all([cached('published_images.csv'), cached('objects.csv')]);
  // object id → open-access primary (else first open-access) image
  const imgs = new Map<string, { uuid: string; alt: string; primary: boolean }>();
  let h: Record<string, number> | null = null;
  for (const r of csvRows(imgText)) {
    if (!h) { h = Object.fromEntries(r.map((n, i) => [n, i])); continue; }
    if (r[h.openaccess] !== '1' || !r[h.depictstmsobjectid]) continue;
    const id = r[h.depictstmsobjectid]; const primary = r[h.viewtype] === 'primary';
    const prev = imgs.get(id);
    if (!prev || (primary && !prev.primary)) imgs.set(id, { uuid: r[h.uuid], alt: r[h.assistivetext] || '', primary });
  }
  const out: NgaRow[] = []; h = null;
  for (const r of csvRows(objText)) {
    if (!h) { h = Object.fromEntries(r.map((n, i) => [n, i])); continue; }
    const im = imgs.get(r[h.objectid]); if (!im) continue;
    const row: NgaRow = { id: r[h.objectid], title: r[h.title], artist: r[h.attribution], date: r[h.displaydate], medium: r[h.medium], cls: r[h.classification], acc: r[h.accessionnum], uuid: im.uuid, alt: im.alt, hay: '' };
    row.hay = `${row.title} ${row.artist} ${row.medium} ${row.cls} ${row.date} ${im.alt}`.toLowerCase();
    out.push(row);
  }
  return out;
}

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'with']);

export async function searchNga(query: string, limit: number): Promise<Artifact[]> {
  try {
    index ??= await (loading ??= build().finally(() => { loading = null; }));
    const terms = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(t => t && !STOP.has(t));
    if (!terms.length) return [];
    const scored: Array<[number, NgaRow]> = [];
    for (const r of index) {
      let s = 0;
      for (const t of terms) {
        if (!r.hay.includes(t)) { s = 0; break; }
        s += r.title.toLowerCase().includes(t) ? 3 : r.artist.toLowerCase().includes(t) ? 2 : 1;
      }
      if (s) scored.push([s, r]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    return scored.slice(0, limit).map(([, r]): Artifact => ({
      id: `nga-${r.id}`, title: r.title || 'Untitled', culture: r.artist || 'National Gallery of Art', date: r.date, medium: r.medium || r.cls,
      imageUrl: `https://api.nga.gov/iiif/${r.uuid}/full/!1600,1600/0/default.jpg`, thumbUrl: `https://api.nga.gov/iiif/${r.uuid}/full/!600,600/0/default.jpg`,
      source: 'nga', sourceUrl: `https://www.nga.gov/artworks/${r.id}`, provenance: r.alt ? r.alt.slice(0, 280) : undefined,
    }));
  } catch { return []; }
}
