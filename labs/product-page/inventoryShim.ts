// Product page lab: in-memory stand-in for services/inventoryService used by the live-page editor, the Tela
// overlay and the backend ProductEditor. Saves go into `labEdits` (this tab only) and the lab page re-renders
// from it the way the real page re-renders from its storeProducts listener. Nothing is written anywhere.
import type { StoreProduct } from '../../types';
import { liveEditPatch, onlyEdited, reconcileMedia, imagesFromMedia } from '../../services/productMediaCore';
import { mergeProductData } from '../../services/inventoryCore';
import { auth, LAB_SELLER } from './shims';

const edits = new Map<string, Record<string, any>>();
const subs = new Set<() => void>();
export const labEdits = {
  apply: <T extends StoreProduct>(p: T): T => {
    const e = edits.get(p.id); if (!e) return p;
    const out: any = { ...p };
    for (const [k, v] of Object.entries(e)) { if (v === null) delete out[k]; else out[k] = v; }
    return out;
  },
  subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
  log: [] as { at: number; kind: string; productId: string; fields: Record<string, any> }[],
};
const put = (id: string, kind: string, fields: Record<string, any>) => {
  edits.set(id, { ...(edits.get(id) || {}), ...fields });
  labEdits.log.push({ at: Date.now(), kind, productId: id, fields });
  (window as any).__labEdits = labEdits.log;
  subs.forEach(f => f());
};
let liveOf: (id: string) => StoreProduct | undefined = () => undefined;
export const setLiveLookup = (f: typeof liveOf) => { liveOf = f; };

const params = new URLSearchParams(location.search);
export const canEditProduct = async (p: Pick<StoreProduct, 'sellerId'>) => params.get('as') === 'admin' || auth.currentUser?.uid === p.sellerId || (params.get('as') === 'seller' && p.sellerId === LAB_SELLER);

export async function saveLiveEdit(opened: StoreProduct, edited: Partial<StoreProduct>) {
  await new Promise(r => setTimeout(r, 250));
  const live = liveOf(opened.id) || opened;
  const patch = liveEditPatch(opened, edited, live);
  if (Object.keys(patch).length) put(opened.id, 'live-page', patch);
  return patch;
}

// Same rules as the real saveProduct for the fields part (stock is left alone here).
export async function saveProduct(a: { id?: string; original?: StoreProduct; fields: Partial<StoreProduct> }) {
  await new Promise(r => setTimeout(r, 250));
  if (!a.id) throw new Error('Lab: creating products is off.');
  const cur = liveOf(a.id);
  const fields: any = cur && a.original ? onlyEdited(a.original, a.fields) : a.fields;
  if (cur && 'images' in fields && !('media' in fields)) { const m = reconcileMedia(cur.media, fields.images || []); if (m) fields.media = m; }
  const merged = mergeProductData(cur, fields, {});
  const patch: Record<string, any> = {};
  for (const k of Object.keys(fields)) patch[k] = k in merged ? merged[k] : null;
  put(a.id, 'backend-editor', patch);
  return a.id;
}

export const uploadProductPhotos = async (files: File[]) => files.filter(f => f.type.startsWith('image/')).map(f => URL.createObjectURL(f));
export const uploadProductVideo = async (f: File) => URL.createObjectURL(f);
export const draftListingFromPhoto = async () => null;
export { imagesFromMedia };
export { isOnWaitlist, joinWaitlist, leaveWaitlist } from './shims';
