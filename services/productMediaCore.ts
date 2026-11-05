// productMediaCore — pure helpers for editing a store product safely and for its gallery media.
//
// Two jobs, both unit-tested (tests/productEdit.test.ts):
//   • Edits that stick. An editor works from the product as it was when it opened. Writing every field back
//     would quietly undo anything that changed since (a photo added from Content HQ, an edit on the live
//     page, a sale). `onlyEdited` keeps just the fields this editor actually changed; everything else stays
//     whatever is live now.
//   • Gallery media. A product's gallery can hold photos, videos and Tela documents (StoreProduct.media).
//     `images` stays the picture list (photos + each Tela doc's rendered image) because cards, the cart,
//     checkout and order emails all read images[0].

import type { StoreProduct, StoreProductMedia } from '../types';

// Compare values the way a person would: key order doesn't matter (Firestore returns keys in its own order),
// and an empty list / empty text is the same as not set.
const canon = (v: unknown): unknown => {
  if (v === undefined || v === null || v === '') return null;
  if (Array.isArray(v)) return v.length ? v.map(canon) : null;
  if (typeof v === 'object') {
    const keys = Object.keys(v as object).filter(k => canon((v as any)[k]) !== null).sort();
    return keys.length ? Object.fromEntries(keys.map(k => [k, canon((v as any)[k])])) : null;
  }
  return v;
};
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

/**
 * The subset of `fields` that differs from what the editor opened with. A field set to `undefined` or
 * `null` that had a value counts as an edit (it clears the field).
 */
export function onlyEdited<T extends Record<string, any>>(opened: Partial<T> | undefined, fields: Partial<T>): Partial<T> {
  if (!opened) return { ...fields };
  const out: Partial<T> = {};
  for (const k of Object.keys(fields) as (keyof T)[]) {
    if (!same(fields[k], opened[k])) out[k] = fields[k];
  }
  return out;
}

/** Fields someone else changed after this editor opened (shown as a warning; their value is kept unless this editor also changed it). */
export function changedSince<T extends Record<string, any>>(opened: Partial<T>, live: Partial<T>, keys: (keyof T)[]): (keyof T)[] {
  return keys.filter(k => !same(opened[k], live[k]));
}

/** Fields the live-page editor may change. Stock, sales, ratings and ownership are never in here. */
export const LIVE_EDIT_KEYS = ['title', 'price', 'compareAtPrice', 'description', 'features', 'specs', 'tags', 'images', 'media', 'variants'] as const;
export type LiveEditKey = typeof LIVE_EDIT_KEYS[number];

/**
 * The Firestore patch for a live-page edit: only edited keys, `undefined` → null marker for deletion
 * (the caller turns `null` into deleteField()), variants keep their LIVE stock (the page never edits stock).
 */
export function liveEditPatch(opened: StoreProduct, edited: Partial<StoreProduct>, live: StoreProduct): Record<string, any> {
  const picked: Partial<StoreProduct> = {};
  for (const k of LIVE_EDIT_KEYS) if (k in edited) (picked as any)[k] = (edited as any)[k];
  // The gallery is compared with what the page showed (older listings have no `media` field yet).
  const diff = onlyEdited<StoreProduct>({ ...opened, media: mediaOf(opened) }, picked);
  if (diff.variants) {
    // Names / prices / photos of options can change here; their counts are whatever is live right now.
    const liveById = new Map((live.variants || []).map(v => [v.id, v]));
    diff.variants = diff.variants
      .filter(v => liveById.has(v.id))                       // adding/removing options goes through the full editor (stock ledger)
      .map(v => ({ ...v, stock: liveById.get(v.id)!.stock }));
  }
  if (diff.media) Object.assign(diff, { images: imagesFromMedia(diff.media) });
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(diff)) out[k] = v === undefined ? null : v;
  return out;
}

/** Problems that block saving a live-page edit (empty = OK). */
export function validateLiveEdit(p: Partial<StoreProduct>, draft: boolean): string[] {
  const errs: string[] = [];
  if ('title' in p && !String(p.title || '').trim()) errs.push('Give it a name.');
  if ('price' in p) {
    const n = Number(p.price);
    if (!Number.isFinite(n) || n < 0) errs.push('Price must be a number.');
    else if (!draft && n < 0.5) errs.push('A product on sale needs a price of at least $0.50.');
  }
  if (p.compareAtPrice != null && p.price != null && Number(p.compareAtPrice) > 0 && Number(p.compareAtPrice) <= Number(p.price)) errs.push('The "was" price has to be higher than the price.');
  return errs;
}

// ── Media ────────────────────────────────────────────────────────────────────

const VIDEO_RE = /\.(mp4|m4v|mov|webm|ogv)(\?|#|$)/i;
export const isVideoUrl = (url: string) => VIDEO_RE.test(url) || /\/video%2F|\/videos?\//i.test(url);
export const mediaKindOfFile = (f: { type?: string; name?: string }): StoreProductMedia['kind'] | null =>
  f.type?.startsWith('video/') || VIDEO_RE.test(f.name || '') ? 'video' : f.type?.startsWith('image/') ? 'image' : null;

const idFor = (url: string, n: number) => {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) | 0;
  return `m${n}_${(h >>> 0).toString(36)}`;
};
export const newMediaId = () => `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** The gallery for a product: its `media` list, or one built from `images` (+ `videoUrl`) for older listings. */
export function mediaOf(p: Pick<StoreProduct, 'images' | 'videoUrl' | 'media'>): StoreProductMedia[] {
  if (p.media?.length) return p.media.filter(m => m && m.url);
  const out: StoreProductMedia[] = (p.images || []).filter(Boolean).map((url, i) => ({ id: idFor(url, i), kind: isVideoUrl(url) ? 'video' : 'image', url }));
  if (p.videoUrl && !out.some(m => m.url === p.videoUrl)) out.push({ id: idFor(p.videoUrl, out.length), kind: 'video', url: p.videoUrl, poster: out.find(m => m.kind === 'image')?.url });
  return out;
}

/** The picture list kept in `images`: photos and Tela documents' rendered images, in gallery order. */
export const imagesFromMedia = (media: StoreProductMedia[]) => media.filter(m => m.kind !== 'video' && m.url).map(m => m.url);

/**
 * The backend editor only edits `images`. Keep `media` in step with it: the images' order wins, a removed
 * picture leaves the gallery, a new one joins as a photo, and videos stay where they were relative to the
 * pictures around them.
 */
export function reconcileMedia(media: StoreProductMedia[] | undefined, images: string[]): StoreProductMedia[] | undefined {
  if (!media?.length) return undefined;
  const byUrl = new Map(media.filter(m => m.kind !== 'video').map(m => [m.url, m]));
  const pictures = images.map((url, i) => byUrl.get(url) || { id: idFor(url, i), kind: 'image' as const, url });
  // Each video sits after the picture that came before it (or first).
  const out: StoreProductMedia[] = [];
  const videosAfter = new Map<string | null, StoreProductMedia[]>();
  let prev: string | null = null;
  for (const m of media) {
    if (m.kind === 'video') { const list = videosAfter.get(prev) || []; list.push(m); videosAfter.set(prev, list); }
    else prev = m.url;
  }
  const kept = new Set(images);
  out.push(...(videosAfter.get(null) || []));
  for (const p of pictures) { out.push(p); out.push(...(videosAfter.get(p.url) || [])); }
  // Videos whose anchor picture was removed go to the end, never lost.
  for (const [anchor, vids] of videosAfter) if (anchor !== null && !kept.has(anchor)) out.push(...vids);
  return out;
}

/** Swap one gallery item in place (a Tela roundtrip result). The item keeps its place and id. */
export function replaceMedia(media: StoreProductMedia[], id: string, next: Partial<StoreProductMedia>): StoreProductMedia[] {
  return media.map(m => (m.id === id ? { ...m, ...next, id: m.id } : m));
}

export function moveMedia(media: StoreProductMedia[], from: number, to: number): StoreProductMedia[] {
  if (from === to || from < 0 || to < 0 || from >= media.length || to >= media.length) return media;
  const out = media.slice();
  const [m] = out.splice(from, 1);
  out.splice(to, 0, m);
  return out;
}
