// The generated-work gallery: Content HQ is the single source of truth, every surface is a view.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GalleryStore, generatedFolder, isGeneratedFolder, matchesGalleryFilter, galleryFacets, itemFromHqAsset,
  shareSeed, ensurePublicCopy, type GalleryBackend, type GenerationMeta, type GalleryItem,
} from '../services/generatedGallery';

/** An in-memory stand-in for Content HQ. */
function memoryHq(opts: { failAdd?: string; slow?: boolean } = {}) {
  const assets: any[] = []; const blobs = new Map<string, Blob>();
  let release: () => void = () => {}; const gate = opts.slow ? new Promise<void>((r) => { release = r; }) : Promise.resolve();
  const backend: GalleryBackend = {
    list: async () => assets.map((a) => ({ ...a })),
    add: async (file, folder, generation) => {
      await gate;
      if (opts.failAdd) throw new Error(opts.failAdd);
      const asset = { id: `hq${assets.length + 1}`, scopeKind: 'user', scopeId: 'u1', uploadedByUid: 'u1', name: file.name, kind: 'image', mimeType: file.type, url: `/api/hq/assets/hq${assets.length + 1}/download`, storagePath: 'x', sizeBytes: file.size, folder, uploadedAt: 1, generation };
      assets.push(asset); blobs.set(asset.id, file);
      return asset as any;
    },
    update: async (id, generation) => { const a = assets.find((x) => x.id === id); if (a) a.generation = generation; },
    remove: async (asset) => { assets.splice(assets.findIndex((x) => x.id === asset.id), 1); },
    blob: async (asset) => blobs.get(asset.id)!,
  };
  return { backend, assets, release };
}
const meta = (over: Partial<GenerationMeta> = {}): Omit<GenerationMeta, 'createdAt'> => ({ provider: 'local_creative', providerName: 'Local GPU', kind: 'image', productionId: 'p1', productionTitle: 'Low Tide', shotId: 's4', slug: '1D', ...over });
const png = () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });
const settle = () => new Promise((r) => setTimeout(r, 5));

test('generated work is filed under one folder tree in Content HQ', () => {
  assert.equal(generatedFolder('Low Tide'), 'Generated / Low Tide');
  assert.equal(generatedFolder('  A/B\\C  '), 'Generated / A B C', 'a title can never create a path');
  assert.equal(generatedFolder(''), 'Generated');
  assert.ok(isGeneratedFolder('Generated / Low Tide') && isGeneratedFolder('Generated'));
  assert.ok(!isGeneratedFolder('Generated Reports') && !isGeneratedFolder(undefined));
});

test('a take shows at once, is saved to Content HQ in the background, and keeps its id', async () => {
  const hq = memoryHq({ slow: true });
  const store = new GalleryStore(hq.backend);
  const seen: GalleryItem[][] = [];
  store.subscribe((items) => seen.push(items));
  const item = store.add({ blob: png(), name: '1D.png', generation: meta(), previewUrl: 'blob:x' });
  assert.equal(store.getItems()[0].saved, 'saving');
  assert.equal(store.getItems()[0].folder, 'Generated / Low Tide');
  hq.release(); await settle();
  const saved = store.find(item.id)!;
  assert.equal(saved.saved, 'hq');
  assert.equal(saved.hqAssetId, 'hq1');
  assert.equal(hq.assets[0].generation.shotId, 's4', 'the provenance is on the Content HQ record itself');
  assert.equal(store.find('hq1'), saved, 'either id finds it');
  assert.ok(seen.length >= 3, 'listeners heard the take arrive and the save land');
});

test('a review that lands while the upload is in flight still reaches Content HQ', async () => {
  const hq = memoryHq({ slow: true });
  const store = new GalleryStore(hq.backend);
  const item = store.add({ blob: png(), name: '1D.png', generation: meta() });
  await store.updateGeneration(item.id, { review: { verdict: 'retry', score: 60 } });
  hq.release(); await settle();
  assert.equal(hq.assets[0].generation.review.verdict, 'retry');
  await store.updateGeneration(item.id, { review: { verdict: 'pass', score: 100 } });
  assert.equal(hq.assets[0].generation.review.verdict, 'pass');
});

test('a failed save says so and keeps the take; signed out, takes are marked not saved', async () => {
  const store = new GalleryStore(memoryHq({ failAdd: 'Content HQ storage is full.' }).backend);
  const item = store.add({ blob: png(), name: 'a.png', generation: meta() });
  await settle();
  assert.deepEqual([store.find(item.id)!.saved, store.find(item.id)!.saveNote], ['failed', 'Content HQ storage is full.']);
  const offline = new GalleryStore(null);
  const local = offline.add({ blob: png(), name: 'b.png', generation: meta() });
  assert.equal(offline.connected, false);
  assert.deepEqual([local.saved, local.saveNote], ['local', 'Sign in to keep generated work in Content HQ.']);
});

test('every surface is a filter over the same records', async () => {
  const hq = memoryHq();
  const store = new GalleryStore(hq.backend);
  store.add({ blob: png(), name: '1D take1.png', generation: meta({ review: { verdict: 'retry', score: 60 }, createdAt: 1 } as any) });
  store.add({ blob: png(), name: '1D take2.png', generation: meta({ review: { verdict: 'pass', score: 100 }, attempt: 2, createdAt: 2 } as any) });
  store.add({ blob: png(), name: 'maya sheet.png', generation: meta({ shotId: undefined, slug: undefined, castId: 'c1', sheetView: 'turnaround', provider: 'magnific', providerName: 'Magnific', createdAt: 3 } as any) });
  store.add({ blob: new Blob([new Uint8Array(9)], { type: 'video/mp4' }), name: 'other.mp4', generation: meta({ kind: 'video', productionId: 'p2', productionTitle: 'Other', shotId: 'z', prompt: 'a gull over the harbour', createdAt: 4 } as any) });
  await settle();
  const all = store.getItems();
  const names = (f: any) => all.filter((i) => matchesGalleryFilter(i, f)).map((i) => i.name);
  assert.deepEqual(names({}), ['other.mp4', 'maya sheet.png', '1D take2.png', '1D take1.png'], 'newest first');
  assert.deepEqual(names({ productionId: 'p1', shotId: 's4' }), ['1D take2.png', '1D take1.png'], 'the shot in front of you');
  assert.deepEqual(names({ castId: 'c1' }), ['maya sheet.png'], 'a character');
  assert.deepEqual(names({ verdict: 'pass' }), ['1D take2.png']);
  assert.deepEqual(names({ verdict: 'unreviewed' }), ['other.mp4', 'maya sheet.png']);
  assert.deepEqual(names({ kind: 'video' }), ['other.mp4']);
  assert.deepEqual(names({ text: 'gull harbour' }), ['other.mp4'], 'the owner can search their own prompts');
  const facets = galleryFacets(all);
  assert.deepEqual(facets.providers.map((p) => [p[1], p[2]]), [['Local GPU', 3], ['Magnific', 1]]);
  assert.deepEqual(facets.verdicts, { unreviewed: 2, pass: 1, retry: 1 });
  // A second store over the same Content HQ — another tool, another tab — sees the same four.
  const elsewhere = new GalleryStore(hq.backend);
  await elsewhere.refresh();
  assert.deepEqual(elsewhere.getItems().map((i) => i.name), all.map((i) => i.name));
});

test('files that were not generated, or are in the trash, are not gallery items', () => {
  assert.equal(itemFromHqAsset({ id: 'a', name: 'syllabus.pdf', mimeType: 'application/pdf', uploadedAt: 1 } as any), null);
  assert.equal(itemFromHqAsset({ id: 'b', name: 'x.png', mimeType: 'image/png', uploadedAt: 1, deletedAt: 2, generation: { provider: 'x', kind: 'image', createdAt: 1 } } as any), null);
});

test('refreshing keeps a take that has not finished saving', async () => {
  const hq = memoryHq({ slow: true });
  const store = new GalleryStore(hq.backend);
  store.add({ blob: png(), name: 'pending.png', generation: meta() });
  await store.refresh();
  assert.deepEqual(store.getItems().map((i) => [i.name, i.saved]), [['pending.png', 'saving']]);
  hq.release(); await settle(); await store.refresh();
  assert.deepEqual(store.getItems().map((i) => [i.name, i.saved]), [['pending.png', 'hq']]);
});

test('sharing makes one unlisted copy and never carries the prompt', async () => {
  const hq = memoryHq();
  const store = new GalleryStore(hq.backend);
  const item = store.add({ blob: png(), name: 'low_tide-1D.png', generation: meta({ prompt: 'SECRET PLOT: Eli sold the boat' }) });
  await settle();
  const seed = shareSeed(store.find(item.id)!);
  assert.deepEqual(seed, { title: 'low tide 1D', text: '' });
  let uploads = 0;
  const publish = async (file: File, title: string) => { uploads++; assert.equal(file.size, 4); assert.equal(title, 'low tide 1D'); return { url: 'https://cdn.example/p1.png', photoId: 'photo_1' }; };
  assert.equal(await ensurePublicCopy(store, item.id, publish), 'https://cdn.example/p1.png');
  assert.equal(await ensurePublicCopy(store, item.id, publish), 'https://cdn.example/p1.png');
  assert.equal(uploads, 1, 'sharing twice does not upload twice');
  assert.equal(hq.assets[0].generation.public.photoId, 'photo_1', 'Content HQ records that a public copy exists');
  await assert.rejects(ensurePublicCopy(store, store.add({ blob: png(), name: 'x.png', generation: meta() }).id, async () => undefined), /Sign in to share/);
});

test('removing an item removes it from Content HQ', async () => {
  const hq = memoryHq();
  const store = new GalleryStore(hq.backend);
  const item = store.add({ blob: png(), name: 'gone.png', generation: meta() });
  await settle();
  await store.remove(item.id);
  assert.equal(hq.assets.length, 0);
  assert.equal(store.getItems().length, 0);
});
