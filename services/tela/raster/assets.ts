// raster/assets — bridge between the raster model's asset ids and real pixels.
//
// Layer bitmaps live as PNG blobs in the Tela asset store (OPFS → localStorage → memory,
// services/tela/telaAssetStore.ts), referenced from the document by asset id, so the doc
// JSON stays small. At runtime RasterAssetCache holds decoded Bitmap8/Mask8 and implements
// the synchronous AssetSource the compositors read. New/edited pixels get a `mem:` key
// until persist() writes them (content-addressed) and swaps in the stored id.
// Legacy layers with a URL `src` and legacy alpha masks (`legacy:<url>`) decode on load.

import type { RasterDocument, RasterLayer } from './model';
import { collectAssetIds, walkLayers } from './model';
import type { Bitmap8, Mask8 } from './buffer';
import type { AssetSource } from './cpuBackend';
import { encodePng } from './codecs';
import { registerCubeText } from './adjust';

let memSeq = 0;
export async function decodeImageBlob(blob: Blob): Promise<Bitmap8> {
  const ib = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' } as ImageBitmapOptions);
  const c = new OffscreenCanvas(ib.width, ib.height), g = c.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
  g.drawImage(ib, 0, 0); const id = g.getImageData(0, 0, ib.width, ib.height); ib.close?.();
  return { width: id.width, height: id.height, data: id.data };
}
export async function decodeImageUrl(url: string): Promise<Bitmap8> { const r = await fetch(url, { mode: 'cors' }); if (!r.ok) throw new Error(`image ${r.status}`); return decodeImageBlob(await r.blob()); }
export function bitmapToMask(bm: Bitmap8, channel: 'alpha' | 'luma' | 'red' = 'red'): Mask8 {
  const m: Mask8 = { width: bm.width, height: bm.height, data: new Uint8Array(bm.width * bm.height) };
  for (let i = 0; i < m.data.length; i++) { const k = i * 4; m.data[i] = channel === 'alpha' ? bm.data[k + 3] : channel === 'luma' ? Math.round((0.299 * bm.data[k] + 0.587 * bm.data[k + 1] + 0.114 * bm.data[k + 2]) * bm.data[k + 3] / 255) : bm.data[k]; }
  return m;
}
export function maskToBitmap(m: Mask8): Bitmap8 { const d = new Uint8ClampedArray(m.width * m.height * 4); for (let i = 0; i < m.data.length; i++) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = m.data[i]; d[i * 4 + 3] = 255; } return { width: m.width, height: m.height, data: d }; }

export class RasterAssetCache implements AssetSource {
  readonly bitmaps = new Map<string, Bitmap8>();
  readonly masks = new Map<string, Mask8>();
  readonly dirty = new Set<string>();
  readonly failed = new Map<string, string>();
  bitmap(k: string) { return this.bitmaps.get(k) || null; }
  mask(k: string) { return this.masks.get(k) || null; }
  /** Register runtime pixels (new layer, paint result). Returns a `mem:` key until persisted. */
  putBitmap(bm: Bitmap8, key = `mem:b${Date.now().toString(36)}${memSeq++}`): string { this.bitmaps.set(key, bm); this.dirty.add(key); return key; }
  putMask(m: Mask8, key = `mem:m${Date.now().toString(36)}${memSeq++}`): string { this.masks.set(key, m); this.dirty.add(key); return key; }
  markDirty(key: string) { this.dirty.add(key); }
  /** Decode everything a document references (asset store ids, URLs, legacy masks, LUT text). */
  async load(doc: RasterDocument): Promise<void> {
    const ids = collectAssetIds(doc);
    const store = await import('../telaAssetStore');
    const jobs: Promise<void>[] = [];
    for (const id of ids.bitmaps) if (!this.bitmaps.has(id) && !id.startsWith('mem:')) jobs.push((async () => { const b = await store.getTelaAssetBlob(id); if (!b) throw new Error('missing'); this.bitmaps.set(id, await decodeImageBlob(b)); })().catch(e => { this.failed.set(id, String(e)); }));
    for (const url of ids.urls) if (!this.bitmaps.has(url)) jobs.push(decodeImageUrl(url).then(b => { this.bitmaps.set(url, b); }).catch(e => { this.failed.set(url, String(e)); }));
    for (const id of ids.masks) if (!this.masks.has(id) && !id.startsWith('mem:')) jobs.push((async () => {
      if (id.startsWith('legacy:')) { this.masks.set(id, bitmapToMask(await decodeImageUrl(id.slice(7)), 'alpha')); return; }
      const b = await store.getTelaAssetBlob(id); if (!b) throw new Error('missing'); this.masks.set(id, bitmapToMask(await decodeImageBlob(b), 'red'));
    })().catch(e => { this.failed.set(id, String(e)); }));
    for (const id of ids.text) jobs.push((async () => { const b = await store.getTelaAssetBlob(id); if (b) registerCubeText(id, await b.text()); })().catch(() => {}));
    await Promise.all(jobs);
    // learn bitmap sizes for layers that did not know them (legacy migration)
    walkLayers(doc.layers, l => { if (l.kind === 'pixel' && (!l.width || !l.height)) { const b = this.bitmaps.get(l.asset.assetId || l.asset.src || ''); if (b) { l.width = b.width; l.height = b.height; } } });
  }
  /** Write dirty `mem:` pixels to the asset store; returns old → new id map. */
  async persist(): Promise<Map<string, string>> {
    const store = await import('../telaAssetStore'), map = new Map<string, string>();
    for (const key of [...this.dirty]) {
      const bm = this.bitmaps.get(key), mk = this.masks.get(key);
      const png = await encodePng(bm || maskToBitmap(mk!));
      const { assetId } = await store.putTelaAsset(new Blob([png as BlobPart], { type: 'image/png' }), 'png');
      if (bm) { this.bitmaps.set(assetId, bm); if (assetId !== key && key.startsWith('mem:')) this.bitmaps.delete(key); }
      if (mk) { this.masks.set(assetId, mk); if (assetId !== key && key.startsWith('mem:')) this.masks.delete(key); }
      this.dirty.delete(key); map.set(key, assetId);
    }
    return map;
  }
}
/** Rewrite asset references after persist(). */
export function remapAssets(doc: RasterDocument, map: Map<string, string>): RasterDocument {
  if (!map.size) return doc;
  const fix = (layers: RasterLayer[]): RasterLayer[] => layers.map(l => {
    let n: RasterLayer = l;
    if (l.kind === 'pixel' && l.asset.assetId && map.has(l.asset.assetId)) n = { ...l, asset: { assetId: map.get(l.asset.assetId) } };
    if (n.mask?.kind === 'bitmap' && map.has(n.mask.assetId)) n = { ...n, mask: { ...n.mask, assetId: map.get(n.mask.assetId)! } };
    if (n.kind === 'fill' && n.fill.type === 'pattern' && map.has(n.fill.assetId)) n = { ...n, fill: { ...n.fill, assetId: map.get(n.fill.assetId)! } };
    if (n.kind === 'group') n = { ...n, children: fix(n.children) };
    return n;
  });
  return { ...doc, layers: fix(doc.layers) };
}
