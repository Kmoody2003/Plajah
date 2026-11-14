// scorePack — download a whole shelf of free sheet music (or the whole catalogue) to the
// person's own device, so it works offline after install.
//
// Where it lands:
//   • Windows app + desktop Chrome/Edge → a folder they pick (File System Access API):
//       <picked>/Plajah Sheet Music/<pack>/<Composer>/<Title>.pdf|.mxl|.mid
//     Files already there (non-empty) are skipped, so a pack resumes after an
//     interruption and a later "everything" pack only adds what is new.
//   • Anywhere else → one .zip download built in the browser (fflate, stored not
//     re-compressed — PDFs and .mxl are already compressed).
//
// Files come from Plajah's copy in Firebase Storage first (CORS-open), then the original source. Mutopia's own
// site sends no CORS headers, so its files can only be packed once they are mirrored.
//
// Every pack carries CREDITS.txt: CC BY / BY-SA editions require crediting the engraver,
// and the credit must travel with the copies.

import { zipSync } from 'fflate';
import {
  scoreFileUrl, scoreSourceFileUrl, scoreRights, SOURCE_LABEL,
  type ScoreCatalog, type ScoreEntry, type ScoreFileKind,
} from './scoreCatalog';

export interface PackProgress { done: number; total: number; bytes: number; current?: string }
export interface PackResult { saved: number; skipped: number; failed: string[]; target: 'folder' | 'zip'; bytes: number }

const KINDS: { kind: ScoreFileKind; ext: string }[] = [
  { kind: 'pdf', ext: '.pdf' },
  { kind: 'pdfZip', ext: ' (parts).zip' },
  { kind: 'mxl', ext: '.mxl' },
  { kind: 'midi', ext: '.mid' },
];

export const canPickPackFolder = () => typeof (window as any).showDirectoryPicker === 'function';

const clean = (s: string) =>
  (s || 'Unknown').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 90) || 'Unknown';

/** Rough download size, from the averages measured on 2026-10-29 (PDF 133 KB, .mxl 20 KB, MIDI 9 KB). */
export function estimatePackBytes(entries: ScoreEntry[]): number {
  let b = 0;
  for (const e of entries) {
    if (e.pdfUrl) b += 133_000;
    if (e.pdfZipUrl) b += 400_000;
    if (e.mxlUrl) b += 20_000;
    if (e.midiUrl) b += 9_000;
  }
  return b;
}

interface PlannedFile { entry: ScoreEntry; kind: ScoreFileKind; dir: string; name: string }

function plan(entries: ScoreEntry[]): PlannedFile[] {
  const used = new Set<string>();
  const out: PlannedFile[] = [];
  for (const entry of entries) {
    const dir = clean(entry.composer);
    let base = clean(entry.set ? `${entry.set} - ${entry.title}` : entry.title);
    if (used.has(`${dir}/${base}`)) base = `${base} (${entry.id})`;
    used.add(`${dir}/${base}`);
    for (const { kind, ext } of KINDS) {
      if (scoreSourceFileUrl(entry, kind)) out.push({ entry, kind, dir, name: base + ext });
    }
  }
  return out;
}

export function creditsText(packName: string, entries: ScoreEntry[], catalog: ScoreCatalog | null): string {
  const lines = [
    `${packName} — free sheet music from Plajah`,
    `Downloaded ${new Date().toISOString().slice(0, 10)}. ${entries.length} scores.`,
    '',
    'Sources: OpenScore (https://openscore.cc, CC0) and the Mutopia Project (https://www.mutopiaproject.org).',
    'Each edition below carries its own licence. CC BY and CC BY-SA editions must be credited as shown',
    'whenever you share copies; arrangements of a CC BY-SA file must be shared under CC BY-SA too.',
    'Whether the MUSIC itself is public domain depends on the country — see each score in Plajah.',
    catalog?.builtAt ? `Catalogue built ${catalog.builtAt.slice(0, 10)}.` : '',
    '',
  ];
  for (const e of entries) {
    const r = scoreRights(e);
    lines.push(
      `${e.composer}${e.born || e.died ? ` (${e.born ?? '?'}–${e.died ?? '?'})` : ''} — ${e.set ? `${e.set}: ` : ''}${e.title}`,
      `    Edition: ${e.edition.label}${e.engraver ? `, engraved by ${e.engraver}` : ''} · ${SOURCE_LABEL[e.source]} · ${e.sourceUrl}`,
      `    Music: ${r.compositionSummary}`,
    );
  }
  return lines.join('\n') + '\n';
}

async function fetchFile(catalog: ScoreCatalog | null, f: PlannedFile, signal?: AbortSignal): Promise<Uint8Array> {
  const urls = [scoreFileUrl(catalog, f.entry, f.kind), scoreSourceFileUrl(f.entry, f.kind)]
    .filter((u, i, a): u is string => !!u && a.indexOf(u) === i);
  let last: unknown;
  for (const u of urls) {
    try {
      const r = await fetch(u, { signal });
      if (r.ok) return new Uint8Array(await r.arrayBuffer());
      last = new Error(`${r.status}`);
    } catch (e) { last = e; }
  }
  throw last ?? new Error('unavailable');
}

async function existingSize(dir: any, name: string): Promise<number | null> {
  try { return (await (await dir.getFileHandle(name)).getFile()).size; } catch { return null; }
}

async function writeFile(dir: any, name: string, data: Uint8Array | string) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

/**
 * Must be called from a click (the folder picker needs a user gesture).
 * Returns null if the person cancelled the folder picker.
 */
export async function downloadScorePack(opts: {
  catalog: ScoreCatalog | null;
  entries: ScoreEntry[];
  packName: string;
  onProgress?: (p: PackProgress) => void;
  signal?: AbortSignal;
}): Promise<PackResult | null> {
  const { catalog, entries, packName, onProgress, signal } = opts;
  const files = plan(entries);
  const failed: string[] = [];
  let done = 0, saved = 0, skipped = 0, bytes = 0;
  const tick = (current?: string) => onProgress?.({ done, total: files.length, bytes, current });

  if (canPickPackFolder()) {
    let root: any;
    try {
      root = await (window as any).showDirectoryPicker({ id: 'plajah-scores', mode: 'readwrite', startIn: 'documents' });
    } catch {
      return null;
    }
    const packDir = await (await root.getDirectoryHandle('Plajah Sheet Music', { create: true }))
      .getDirectoryHandle(clean(packName), { create: true });
    await writeFile(packDir, 'CREDITS.txt', creditsText(packName, entries, catalog));
    const dirs = new Map<string, any>();
    let next = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (next < files.length && !signal?.aborted) {
        const f = files[next++];
        try {
          let dir = dirs.get(f.dir);
          if (!dir) { dir = await packDir.getDirectoryHandle(f.dir, { create: true }); dirs.set(f.dir, dir); }
          if (((await existingSize(dir, f.name)) ?? 0) > 0) { skipped++; }
          else {
            const data = await fetchFile(catalog, f, signal);
            await writeFile(dir, f.name, data);
            saved++; bytes += data.length;
          }
        } catch {
          failed.push(`${f.dir}/${f.name}`);
        }
        done++; tick(f.name);
      }
    }));
    return { saved, skipped, failed, target: 'folder', bytes };
  }

  // No folder access: build one zip in memory.
  const tree: Record<string, Record<string, Uint8Array> | Uint8Array> = {
    'CREDITS.txt': new TextEncoder().encode(creditsText(packName, entries, catalog)),
  };
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < files.length && !signal?.aborted) {
      const f = files[next++];
      try {
        const data = await fetchFile(catalog, f, signal);
        const folder = (tree[f.dir] ??= {}) as Record<string, Uint8Array>;
        folder[f.name] = data;
        saved++; bytes += data.length;
      } catch {
        failed.push(`${f.dir}/${f.name}`);
      }
      done++; tick(f.name);
    }
  }));
  if (signal?.aborted) return { saved: 0, skipped: 0, failed, target: 'zip', bytes: 0 };
  const zip = zipSync({ [clean(packName)]: tree } as any, { level: 0 });
  const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url; a.download = `${clean(packName)}.zip`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { saved, skipped, failed, target: 'zip', bytes };
}
