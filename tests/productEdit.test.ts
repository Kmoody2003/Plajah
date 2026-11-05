// Product edits that stick + gallery media — Test Suite. Run with: npm run test:product-edit
// Pins: an editor only writes what it changed (so a stale editor can't undo a newer edit), clearing a field
// still clears it, live-page edits never touch stock, and the gallery (photos / videos / Tela docs) stays in
// step with `images`.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  onlyEdited, changedSince, liveEditPatch, validateLiveEdit, mediaOf, imagesFromMedia, reconcileMedia,
  replaceMedia, moveMedia, isVideoUrl, mediaKindOfFile,
} from '../services/productMediaCore';
import { mergeProductData } from '../services/inventoryCore';
import { productTelaDoc, telaDocIdForMedia } from '../services/productTelaBridge';
import type { StoreProduct, StoreProductMedia } from '../types';

const base = (over: Partial<StoreProduct> = {}): StoreProduct => ({
  id: 'p1', sellerId: 's1', sellerName: 'Shop', title: 'Mug', description: 'A mug', category: 'OTHER', price: 12,
  images: ['https://x/a.jpg', 'https://x/b.jpg'], stock: 5, isDigital: false, isActive: true, createdAt: 1, updatedAt: 1, ...over,
} as StoreProduct);

describe('onlyEdited — the backend editor writes what it changed', () => {
  test('unchanged fields are left out, changed ones kept', () => {
    const opened = base();
    const fields = { title: 'Big mug', description: 'A mug', price: 12, images: opened.images };
    assert.deepEqual(onlyEdited(opened, fields), { title: 'Big mug' });
  });

  test('a stale editor does not undo a photo added after it opened', () => {
    const opened = base();                                                   // editor opened with 2 photos
    const live = base({ images: [...opened.images, 'https://x/hq.jpg'] });   // Content HQ added a 3rd since
    const fields = { title: 'Big mug', images: opened.images };              // editor saves its (stale) photo list
    const merged = mergeProductData(live, onlyEdited(opened, fields), { id: 'p1', updatedAt: 2 });
    assert.equal(merged.title, 'Big mug');
    assert.deepEqual(merged.images, live.images);
  });

  test('clearing a field still clears it (undefined and null)', () => {
    const opened = base({ compareAtPrice: 20, sizeChart: { unit: 'in', columns: ['Chest'], rows: [{ size: 'S', values: ['36'] }] } });
    const diff = onlyEdited(opened, { compareAtPrice: undefined, sizeChart: null });
    assert.ok('compareAtPrice' in diff && 'sizeChart' in diff);
    const merged = mergeProductData(opened, diff, { id: 'p1' });
    assert.equal('compareAtPrice' in merged, false);
    assert.equal(merged.sizeChart, null);
  });

  test('without an opened snapshot (a new product) everything is written', () => {
    assert.deepEqual(onlyEdited(undefined, { title: 'x', price: 1 }), { title: 'x', price: 1 });
  });

  test('changedSince names the fields someone else changed', () => {
    const opened = base(), live = base({ price: 15, title: 'Mug' });
    assert.deepEqual(changedSince(opened, live, ['title', 'price', 'images']), ['price']);
  });
});

describe('liveEditPatch — editing on the product page', () => {
  test('only edited keys, and only keys the page may edit', () => {
    const opened = base();
    const patch = liveEditPatch(opened, { title: 'New', price: 12, stock: 999, sellerId: 'evil' } as any, opened);
    assert.deepEqual(patch, { title: 'New' });
  });

  test('an untouched draft writes nothing (key order, empty lists, the built gallery)', () => {
    const opened = base({ specs: [{ value: '16 oz', label: 'Size' }] as any });   // Firestore's key order
    const edited = {
      title: 'Mug', price: 12, compareAtPrice: undefined, description: 'A mug', features: [], variants: [],
      specs: [{ label: 'Size', value: '16 oz' }], media: mediaOf(opened),
    };
    assert.deepEqual(liveEditPatch(opened, edited, opened), {});
  });

  test('reordering the gallery writes media and images', () => {
    const opened = base();
    const media = mediaOf(opened).reverse();
    const patch = liveEditPatch(opened, { media }, opened);
    assert.deepEqual(patch.images, ['https://x/b.jpg', 'https://x/a.jpg']);
  });

  test('a cleared "was" price becomes a delete marker (null)', () => {
    const opened = base({ compareAtPrice: 20 });
    assert.deepEqual(liveEditPatch(opened, { compareAtPrice: undefined }, opened), { compareAtPrice: null });
  });

  test('option names change, option stock stays live', () => {
    const v = [{ id: 'v1', name: 'Red', stock: 4 }, { id: 'v2', name: 'Blue', stock: 2 }];
    const opened = base({ variants: v as any });
    const live = base({ variants: [{ id: 'v1', name: 'Red', stock: 1 }, { id: 'v2', name: 'Blue', stock: 2 }] as any }); // a sale landed
    const patch = liveEditPatch(opened, { variants: [{ id: 'v1', name: 'Crimson', stock: 4 }, { id: 'v2', name: 'Blue', stock: 2 }, { id: 'v3', name: 'New', stock: 9 }] as any }, live);
    assert.deepEqual(patch.variants, [{ id: 'v1', name: 'Crimson', stock: 1 }, { id: 'v2', name: 'Blue', stock: 2 }]);
  });

  test('editing media rewrites images from it (videos left out)', () => {
    const opened = base();
    const media: StoreProductMedia[] = [
      { id: 'a', kind: 'video', url: 'https://x/v.mp4' },
      { id: 'b', kind: 'image', url: 'https://x/b.jpg' },
      { id: 'c', kind: 'tela', url: 'https://x/t.jpg', telaDocId: 'tela_1' },
    ];
    const patch = liveEditPatch(opened, { media }, opened);
    assert.deepEqual(patch.images, ['https://x/b.jpg', 'https://x/t.jpg']);
    assert.deepEqual(patch.media, media);
  });

  test('validation', () => {
    assert.deepEqual(validateLiveEdit({ title: '  ' }, false), ['Give it a name.']);
    assert.equal(validateLiveEdit({ price: 0 }, true).length, 0);           // a draft may stay at $0
    assert.equal(validateLiveEdit({ price: 0.2 }, false).length, 1);
    assert.equal(validateLiveEdit({ price: 10, compareAtPrice: 8 }, false).length, 1);
    assert.equal(validateLiveEdit({ price: 10, compareAtPrice: 14 }, false).length, 0);
  });
});

describe('gallery media', () => {
  test('older listings: images (+ videoUrl) become the gallery', () => {
    const m = mediaOf(base({ images: ['https://x/a.jpg', 'https://x/clip.mp4'], videoUrl: 'https://x/promo.webm' }));
    assert.deepEqual(m.map(x => x.kind), ['image', 'video', 'video']);
    assert.equal(m[2].poster, 'https://x/a.jpg');
    assert.equal(new Set(m.map(x => x.id)).size, 3);
  });

  test('media wins when set', () => {
    const media: StoreProductMedia[] = [{ id: 'z', kind: 'tela', url: 'https://x/t.jpg', telaDocId: 'd' }];
    assert.deepEqual(mediaOf(base({ media })), media);
  });

  test('backend reorder/remove/add on images keeps videos and Tela links', () => {
    const media: StoreProductMedia[] = [
      { id: 'a', kind: 'image', url: 'A' }, { id: 'v', kind: 'video', url: 'V' }, { id: 't', kind: 'tela', url: 'T', telaDocId: 'd1' }, { id: 'b', kind: 'image', url: 'B' },
    ];
    const out = reconcileMedia(media, ['T', 'A', 'N'])!;                  // T to cover, B removed, N added
    assert.deepEqual(out.map(m => m.url), ['T', 'A', 'V', 'N']);
    assert.equal(out[0].telaDocId, 'd1');
    assert.equal(out[3].kind, 'image');
    assert.equal(reconcileMedia(undefined, ['A']), undefined);           // no media yet → leave it unset
  });

  test('a video whose anchor photo was removed is kept at the end', () => {
    const media: StoreProductMedia[] = [{ id: 'a', kind: 'image', url: 'A' }, { id: 'v', kind: 'video', url: 'V' }, { id: 'b', kind: 'image', url: 'B' }];
    assert.deepEqual(reconcileMedia(media, ['B'])!.map(m => m.url), ['B', 'V']);
  });

  test('a Tela result replaces the item in place', () => {
    const media: StoreProductMedia[] = [{ id: 'a', kind: 'image', url: 'A', hqAssetId: 'hq1' }, { id: 'b', kind: 'image', url: 'B' }];
    const out = replaceMedia(media, 'a', { url: 'A2', telaDocId: 'tela_x', id: 'hijack' });
    assert.deepEqual(out[0], { id: 'a', kind: 'image', url: 'A2', hqAssetId: 'hq1', telaDocId: 'tela_x' });
    assert.equal(out[1], media[1]);
    assert.deepEqual(imagesFromMedia(out), ['A2', 'B']);
  });

  test('move and kind detection', () => {
    const m: StoreProductMedia[] = [{ id: '1', kind: 'image', url: '1' }, { id: '2', kind: 'image', url: '2' }, { id: '3', kind: 'image', url: '3' }];
    assert.deepEqual(moveMedia(m, 2, 0).map(x => x.id), ['3', '1', '2']);
    assert.equal(moveMedia(m, 0, 9), m);
    assert.ok(isVideoUrl('https://firebasestorage.googleapis.com/v0/b/x/o/users%2Fu%2Fstore%2Fvideo_1_a.mp4?alt=media'));
    assert.ok(!isVideoUrl('https://x/a.jpg'));
    assert.equal(mediaKindOfFile({ type: 'video/mp4' }), 'video');
    assert.equal(mediaKindOfFile({ type: 'image/png' }), 'image');
    assert.equal(mediaKindOfFile({ type: 'application/pdf' }), null);
  });
});

describe('Tela doc for a product shot', () => {
  test('one board frame holding the photo, capped at 2048 px, scaled to fit', () => {
    const d = productTelaDoc({ id: 'tela_product_p1_a', ownerId: 'u', title: 'Mug', src: 'https://x/a.jpg', w: 4096, h: 2048, now: 5 });
    assert.equal(d.frames.length, 1);
    const f = d.frames[0];
    assert.equal(f.w, 2048); assert.equal(f.h, 1024);
    const dev: any = d.devices[f.deviceIds[0]];
    assert.equal(dev.type, 'IMAGE'); assert.equal(dev.width, 2048);
    assert.equal(dev.layers[0].scale, 0.5);
    assert.equal(dev.layers[0].src, 'https://x/a.jpg');
    assert.equal(d.updatedAt, 5);
  });

  test('blank design board when there is no picture', () => {
    const d = productTelaDoc({ id: 'x', ownerId: 'u', title: 'New', w: 2048, h: 2048 });
    assert.equal((d.devices[d.frames[0].deviceIds[0]] as any).layers.length, 0);
  });

  test('doc ids are storage-safe', () => {
    assert.equal(telaDocIdForMedia('wtjm_sea moss', 'm1/2'), 'tela_product_wtjm_sea_moss_m1_2');
  });
});
