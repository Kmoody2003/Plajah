// productTelaBridge — send a product gallery item to Tela and bring the result back as the listing image.
//
//   prepareProductTelaDoc(product, item)  → a Tela doc id to open (reuses the item's own Tela doc when this
//                                            account can load it, else starts one from the current picture)
//   renderTelaDocImage(doc)                → the doc's first frame flattened to a JPEG File
//   productPhotoFromTela(doc)              → that File uploaded as a public product photo (same storage as
//                                            the product editor's photos); returns its URL
//
// Tela itself is unchanged: ProductTelaOverlay opens TelaView over the product page / editor with the doc,
// and on "Back to product" calls these. The picture Tela starts from is the listing's public copy, so a
// Content HQ original is never opened for writing and stays exactly as it was.

import type { StoreProduct, StoreProductMedia, TelaDoc, TelaFrame, TelaImageDevice, TelaImageLayer, TelaVectorDevice } from '../types';

const MAX_EDGE = 2048;

export const telaDocIdForMedia = (productId: string, mediaId: string) =>
  `tela_product_${productId}_${mediaId}`.replace(/[^a-z0-9_-]/gi, '_');

async function naturalSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve({ w: img.naturalWidth || 1024, h: img.naturalHeight || 1024 });
    img.onerror = () => resolve({ w: 1024, h: 1024 });
    img.src = url;
  });
}

/** A one-frame board holding the picture as its bottom layer, at the picture's own size (≤ 2048 px). */
export function productTelaDoc(args: { id: string; ownerId: string; title: string; src?: string; w: number; h: number; now?: number }): TelaDoc {
  const { id, ownerId, title, src } = args;
  const s = Math.min(1, MAX_EDGE / Math.max(args.w, args.h));
  const w = Math.max(1, Math.round(args.w * s)), h = Math.max(1, Math.round(args.h * s));
  const now = args.now ?? Date.now();
  const imageId = `${id}_photo`;
  const layers: TelaImageLayer[] = src ? [{
    id: `${imageId}_layer`, name: 'Product photo', src, sessionOnly: src.startsWith('blob:') || src.startsWith('data:'),
    intrinsicWidth: args.w, intrinsicHeight: args.h,
    x: 0, y: 0, scale: s, opacity: 1, blend: 'normal', visible: true,
    adjust: { brightness: 1, contrast: 1, saturate: 1, exposure: 0, blur: 0 },
  }] : [];
  const image: TelaImageDevice = { id: imageId, type: 'IMAGE', name: 'Product shot', width: w, height: h, layers };
  const frame: TelaFrame = { id: `${id}_shot`, kind: 'BOARD', preset: 'FREE', x: 80, y: 80, w, h, deviceIds: [imageId], label: 'Product shot' };
  return { id, ownerId, title, frames: [frame], devices: { [imageId]: image }, bindings: [], createdAt: now, updatedAt: now } as TelaDoc;
}

/** The Tela doc to open for this gallery item (created and saved if needed). */
export async function prepareProductTelaDoc(product: StoreProduct, item: StoreProductMedia | null): Promise<string> {
  const { auth } = await import('./firebase');
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to edit in Tela.');
  const { loadTelaDocFreshest, saveTelaDoc } = await import('./telaStore');
  if (item?.telaDocId) {
    // The newest copy wherever it was last saved (this device or the cloud), so a shot edited on the phone
    // opens with those edits on the laptop.
    const prior = await loadTelaDocFreshest(item.telaDocId).catch(() => null);
    if (prior) return prior.id;       // reopen with its layers
  }
  // A new doc per open from a plain photo; a design made by someone else's account starts fresh from its picture.
  const id = telaDocIdForMedia(product.id, `${item?.id || 'new'}_${Date.now().toString(36)}`);
  const src = item && item.kind !== 'video' ? item.url : undefined;
  const size = src ? await naturalSize(src) : { w: 2048, h: 2048 };
  const doc = productTelaDoc({ id, ownerId: uid, title: `${product.title} — product shot`, src, w: size.w, h: size.h });
  const { ok } = await saveTelaDoc(doc);   // local copy + cloud sync (signed in)
  if (!ok) throw new Error('Tela could not save on this device (storage is full or blocked).');
  return id;
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('A layer image could not be read.'));
    img.src = src;
  });
}

const BLEND: Record<string, GlobalCompositeOperation> = { normal: 'source-over' };

async function drawImageDevice(ctx: CanvasRenderingContext2D, d: TelaImageDevice) {
  if (d.raster) {
    // Through import.meta.glob so a typecheck of the store doesn't pull in the whole raster engine.
    const mods = import.meta.glob<{ getImageDeviceBitmap: (d: TelaImageDevice, maxSide?: number) => Promise<ImageBitmap | null> }>('../components/tela/image/previewCache.ts');
    const { getImageDeviceBitmap } = await mods['../components/tela/image/previewCache.ts']();
    const bmp = await getImageDeviceBitmap(d, MAX_EDGE * 2).catch(() => null);
    if (bmp) { ctx.drawImage(bmp, 0, 0, d.width, d.height); bmp.close?.(); return; }
  }
  if (d.rasterPreview?.src) { ctx.drawImage(await loadImg(d.rasterPreview.src), 0, 0, d.width, d.height); return; }
  // Legacy layer stack — drawn the way TelaImage draws it (translate → rotate → scale, natural size).
  for (const l of d.layers || []) {
    if (!l.visible || l.mediaKind === 'VIDEO' || l.mediaKind === 'LOTTIE' || !l.src) continue;
    const img = await loadImg(l.src);
    ctx.save();
    ctx.globalAlpha = l.opacity ?? 1;
    ctx.globalCompositeOperation = BLEND[l.blend] || (l.blend as GlobalCompositeOperation);
    const a = l.adjust;
    if (a) {
      const parts = [`brightness(${(a.brightness ?? 1) * Math.pow(2, a.exposure || 0)})`, `contrast(${a.contrast ?? 1})`, `saturate(${a.saturate ?? 1})`];
      if (a.blur) parts.push(`blur(${a.blur}px)`);
      ctx.filter = parts.join(' ');
    }
    ctx.translate(l.x, l.y);
    ctx.rotate(((l.rotation || 0) * Math.PI) / 180);
    ctx.scale(l.scale, l.scale);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }
}

async function drawVectorDevice(ctx: CanvasRenderingContext2D, d: TelaVectorDevice) {
  const { deviceToSvg } = await import('./tela/geometry/serialize');
  const url = URL.createObjectURL(new Blob([deviceToSvg(d)], { type: 'image/svg+xml' }));
  try { ctx.drawImage(await loadImg(url), 0, 0, d.width, d.height); } finally { URL.revokeObjectURL(url); }
}

/** The doc's first frame, every image and vector device stacked in order, as a JPEG. */
export async function renderTelaDocImage(doc: TelaDoc, frameId?: string): Promise<File> {
  const frame = (frameId && doc.frames.find(f => f.id === frameId)) || doc.frames[0];
  if (!frame) throw new Error('This Tela document has no page to use.');
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(frame.w)); c.height = Math.max(1, Math.round(frame.h));
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the image.');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
  let drew = 0;
  for (const id of frame.deviceIds) {
    const d: any = doc.devices[id];
    if (!d) continue;
    ctx.save();
    if (d.width && d.height) ctx.scale(c.width / d.width, c.height / d.height);
    try {
      if (d.type === 'IMAGE') { await drawImageDevice(ctx, d); drew++; }
      else if (d.type === 'VECTOR') { await drawVectorDevice(ctx, d); drew++; }
    } finally { ctx.restore(); }
  }
  if (!drew) throw new Error('Nothing on this Tela page can become a product photo yet (add an image or a drawing).');
  const blob: Blob | null = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
  if (!blob) throw new Error('The image could not be encoded.');
  return new File([blob], `${(doc.title || 'product').replace(/[^\w.-]+/g, '_').slice(0, 40)}.jpg`, { type: 'image/jpeg' });
}

/** Flatten the doc and upload it as a product photo. */
export async function productPhotoFromTela(doc: TelaDoc): Promise<string> {
  const file = await renderTelaDocImage(doc);
  const { uploadProductPhotos } = await import('./inventoryService');
  const [url] = await uploadProductPhotos([file]);
  if (!url) throw new Error('The photo did not upload.');
  return url;
}
