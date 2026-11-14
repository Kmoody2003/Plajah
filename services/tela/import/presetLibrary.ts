// import/presetLibrary — imported brushes, shapes, swatches and patterns on this device.
// IndexedDB, because tips and pattern tiles are binary and libraries reach thousands of swatches.
import type { ImportedBrush, ImportedPattern, ImportedShape, ImportedSwatch, PresetBundle } from './presets';

const DB = 'tela-preset-library', STORES = ['brushes', 'shapes', 'swatches', 'patterns'] as const;
type StoreName = typeof STORES[number];
let dbp: Promise<IDBDatabase> | null = null;
const listeners = new Set<() => void>();
const openDb = () => dbp ||= new Promise<IDBDatabase>((resolve, reject) => {
  const q = indexedDB.open(DB, 1);
  q.onupgradeneeded = () => { for (const s of STORES) if (!q.result.objectStoreNames.contains(s)) q.result.createObjectStore(s, { keyPath: 'id' }); };
  q.onsuccess = () => resolve(q.result); q.onerror = () => { dbp = null; reject(q.error); };
});
const all = async <T,>(s: StoreName): Promise<T[]> => { const db = await openDb(); return new Promise((res, rej) => { const q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = () => res(q.result as T[]); q.onerror = () => rej(q.error); }); };
const write = async (s: StoreName, rows: unknown[]) => { if (!rows.length) return; const db = await openDb(); await new Promise<void>((res, rej) => { const t = db.transaction(s, 'readwrite'); for (const r of rows) t.objectStore(s).put(r); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); };

export interface PresetLibrary { brushes: ImportedBrush[]; shapes: ImportedShape[]; swatches: ImportedSwatch[]; patterns: ImportedPattern[] }
export const loadPresetLibrary = async (): Promise<PresetLibrary> => ({ brushes: await all('brushes'), shapes: await all('shapes'), swatches: await all('swatches'), patterns: await all('patterns') });
export async function addPresetBundle(b: PresetBundle) {
  await write('brushes', b.brushes); await write('shapes', b.shapes); await write('swatches', b.swatches); await write('patterns', b.patterns);
  listeners.forEach(f => f());
}
export async function removePreset(store: StoreName, ids: string[]) {
  const db = await openDb(); await new Promise<void>((res, rej) => { const t = db.transaction(store, 'readwrite'); for (const id of ids) t.objectStore(store).delete(id); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
  listeners.forEach(f => f());
}
export const onPresetLibraryChange = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

/** Read preset files and add them to the library; returns the count summary and warnings. */
export async function importPresetFiles(files: File[]): Promise<{ added: string; warnings: string[] }> {
  const { parsePresetFile } = await import('./presets');
  const totals = { brushes: 0, shapes: 0, swatches: 0, patterns: 0 }; const warnings: string[] = [];
  for (const f of files) {
    const b = parsePresetFile(f.name, new Uint8Array(await f.arrayBuffer()));
    await addPresetBundle(b); warnings.push(...b.warnings);
    totals.brushes += b.brushes.length; totals.shapes += b.shapes.length; totals.swatches += b.swatches.length; totals.patterns += b.patterns.length;
    const skipped = new Set(b.brushes.flatMap(x => x.unsupported || []));
    if (skipped.size) warnings.push(`Some ${f.name} brushes use settings Tela's stamp engine skips: ${[...skipped].join(', ')}.`);
  }
  const added = (Object.entries(totals) as [string, number][]).filter(([, n]) => n).map(([k, n]) => `${n.toLocaleString()} ${n === 1 ? k.slice(0, -1).replace('swatche', 'swatch').replace('brushe', 'brush') : k}`).join(', ');
  return { added: added || 'nothing', warnings };
}

// The brush the paint canvas should start on (set by picking one in the Library).
let activeBrush: ImportedBrush | null = null;
export const setActiveImportedBrush = (b: ImportedBrush | null) => { activeBrush = b; };
export const getActiveImportedBrush = () => activeBrush;

// ── Pixels ─────────────────────────────────────────────────────────────────────────────
/** A brush tip as a canvas: the tip's coverage painted in `color`. Computed tips are drawn here. */
export function brushTipCanvas(b: ImportedBrush, color: string, pixelSize = 0): HTMLCanvasElement {
  const c = document.createElement('canvas');
  if (b.tip) {
    c.width = Math.max(1, b.tip.width); c.height = Math.max(1, b.tip.height);
    const g = c.getContext('2d')!; const id = g.createImageData(c.width, c.height); const m = /^#(..)(..)(..)/.exec(color);
    const r = m ? parseInt(m[1], 16) : 0, gr = m ? parseInt(m[2], 16) : 0, bl = m ? parseInt(m[3], 16) : 0;
    for (let i = 0; i < c.width * c.height; i++) { const o = i * 4; id.data[o] = r; id.data[o + 1] = gr; id.data[o + 2] = bl; id.data[o + 3] = b.tip.data[i]; }
    g.putImageData(id, 0, 0);
    return c;
  }
  const size = Math.max(2, Math.round(pixelSize || b.size)); c.width = c.height = size;
  const g = c.getContext('2d')!; const rg = g.createRadialGradient(size / 2, size / 2, size / 2 * Math.min(.98, b.hardness), size / 2, size / 2, size / 2);
  rg.addColorStop(0, color); rg.addColorStop(1, `${color}00`); g.fillStyle = rg; g.fillRect(0, 0, size, size);
  return c;
}

export function patternDataUrl(p: ImportedPattern): string {
  const c = document.createElement('canvas'); c.width = p.image.width; c.height = p.image.height;
  const data = new Uint8ClampedArray(p.image.data);
  c.getContext('2d')!.putImageData(new ImageData(data, c.width, c.height), 0, 0);
  return c.toDataURL('image/png');
}
