import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTelaOp, PRESETS, getPresetMeta } from '../components/tela/telaOps';
import { emptyHistory, recordOp, undo, redo } from '../components/tela/telaHistory';
import { FABULA_ASPECT_RATIOS, FABULA_RES_PRESETS } from '../services/fabula/filmFormats';
import { TELA_PAGE_SIZE_CATALOG, pxFromUnitValue, unitValueFromPx } from '../services/tela/pagePresets';
import { PRINT_PRODUCTS } from '../services/print/products';
import type { TelaDoc } from '../types';

const makeDoc = (): TelaDoc => ({
  id: 'doc_test',
  ownerId: 'u1',
  title: 'Test',
  frames: [
    { id: 'f1', kind: 'PAPER', preset: 'LETTER', x: 0, y: 0, w: 816, h: 1056, deviceIds: ['w1'], label: 'Page 1', orientation: 'PORTRAIT' },
    { id: 'f2', kind: 'PAPER', preset: 'A4', x: 0, y: 1110, w: 794, h: 1123, deviceIds: ['v2'], label: 'Page 2', orientation: 'PORTRAIT' },
    { id: 'f3', kind: 'PAPER', preset: 'BOOKLET', x: 0, y: 2290, w: 528, h: 816, deviceIds: ['v3'], label: 'Page 3', orientation: 'PORTRAIT' },
  ],
  devices: {
    w1: { id: 'w1', type: 'WRITER', blocks: [] },
    v2: { id: 'v2', type: 'VECTOR', name: 'Art 2', width: 794, height: 1123, objects: [] },
    v3: { id: 'v3', type: 'VECTOR', name: 'Art 3', width: 528, height: 816, objects: [] },
  },
  createdAt: 0,
  updatedAt: 0,
});

test('page presets import all Fabula film resolutions and aspect ratios', () => {
  for (const res of FABULA_RES_PRESETS) {
    if (res.w === 0 || res.h === 0) continue;
    const match = TELA_PAGE_SIZE_CATALOG.find(p => p.category === 'film' && p.w === res.w && p.h === res.h);
    assert.ok(match, `Missing Fabula resolution preset ${res.label} (${res.w}x${res.h})`);
  }
  for (const ratio of FABULA_ASPECT_RATIOS) {
    const match = TELA_PAGE_SIZE_CATALOG.find(p => p.category === 'film' && p.displayDims.includes(ratio));
    assert.ok(match, `Missing Fabula aspect preset ${ratio}`);
  }
});

test('page presets include comics, graphic novels, print cards/posters, and banners', () => {
  const categories = new Set(TELA_PAGE_SIZE_CATALOG.map(p => p.category));
  assert.ok(categories.has('film'));
  assert.ok(categories.has('comic'));
  assert.ok(categories.has('print'));
  assert.ok(categories.has('banner'));
  assert.ok(categories.has('paper'));

  assert.ok(PRESETS.COMIC_US && PRESETS.MANGA_TANKOBON_B6 && PRESETS.WEBTOON_SCROLL);
  assert.ok(PRESETS.CARD_BUSINESS_US && PRESETS.POSTCARD_4X6 && PRESETS.POSTER_24X36);
  assert.ok(PRESETS.BANNER_LEADERBOARD && PRESETS.BANNER_VINYL_3X6FT);
  for (const prod of PRINT_PRODUCTS) {
    if (prod.binding === 'wrap') continue;
    const wPx = Math.round(prod.trimIn[0] * 96);
    const hPx = Math.round(prod.trimIn[1] * 96);
    const hasMatch = TELA_PAGE_SIZE_CATALOG.some(
      p => p.productId === prod.id || (Math.abs(p.w - wPx) <= 2 && Math.abs(p.h - hPx) <= 2),
    );
    assert.ok(hasMatch, `Missing print product preset for ${prod.id}`);
  }
});

test('RESIZE_FRAME, SET_FRAME_PRESET, and SET_FRAME_ORIENTATION update frame and sync vector devices undoably', () => {
  const doc0 = makeDoc();
  let hist = emptyHistory();

  const resizeOp = { type: 'RESIZE_FRAME' as const, frameId: 'f2', w: 1200, h: 630 };
  hist = recordOp(hist, doc0, resizeOp, 1000);
  const doc1 = applyTelaOp(doc0, resizeOp);
  assert.equal(doc1.frames[1].w, 1200);
  assert.equal(doc1.frames[1].h, 630);
  assert.equal((doc1.devices.v2 as any).width, 1200);
  assert.equal((doc1.devices.v2 as any).height, 630);

  const presetOp = { type: 'SET_FRAME_PRESET' as const, frameId: 'f2', preset: 'FILM_HD1080' };
  hist = recordOp(hist, doc1, presetOp, 3000);
  const doc2 = applyTelaOp(doc1, presetOp);
  assert.equal(doc2.frames[1].w, 1920);
  assert.equal(doc2.frames[1].h, 1080);

  const flipOp = { type: 'SET_FRAME_ORIENTATION' as const, frameId: 'f2', orientation: 'PORTRAIT' as const };
  hist = recordOp(hist, doc2, flipOp, 5000);
  const doc3 = applyTelaOp(doc2, flipOp);
  assert.equal(doc3.frames[1].w, 1080);
  assert.equal(doc3.frames[1].h, 1920);

  const u1 = undo(hist, doc3)!;
  assert.equal(u1.doc.frames[1].w, 1920);
  const u2 = undo(u1.history, u1.doc)!;
  assert.equal(u2.doc.frames[1].w, 1200);
  assert.equal(getPresetMeta('UNKNOWN_CUSTOM', { w: 500, h: 400 }).label, '500×400');
});

test('REORDER_FRAME moves pages visually and integrates with Undo/Redo', () => {
  const doc0 = makeDoc();
  let hist = emptyHistory();
  const op = { type: 'REORDER_FRAME' as const, frameId: 'f3', toIndex: 0 };
  hist = recordOp(hist, doc0, op, 100);
  const doc1 = applyTelaOp(doc0, op);
  assert.deepEqual(doc1.frames.map(f => f.id), ['f3', 'f1', 'f2']);

  const u = undo(hist, doc1)!;
  assert.deepEqual(u.doc.frames.map(f => f.id), ['f1', 'f2', 'f3']);
  const r = redo(u.history, u.doc)!;
  assert.deepEqual(r.doc.frames.map(f => f.id), ['f3', 'f1', 'f2']);
});

test('SET_FRAME_COMIC_DATA and ADD_FRAME allow adding and undoing comic book pages cleanly', () => {
  const doc0 = makeDoc();
  let hist = emptyHistory();
  const addComic = {
    type: 'ADD_FRAME' as const,
    frame: {
      id: 'f_comic',
      kind: 'PAPER' as const,
      preset: 'COMIC_US',
      x: 0,
      y: 3200,
      w: 636,
      h: 984,
      deviceIds: [],
      label: 'Comic Page 1',
      isComicPage: true,
      comicPageSnapshot: { id: 'cp1', title: 'Comic Page 1', panels: [] },
    },
    devices: [],
  };
  hist = recordOp(hist, doc0, addComic, 100);
  const doc1 = applyTelaOp(doc0, addComic);
  assert.equal(doc1.frames.length, 4);
  assert.equal(doc1.frames[3].isComicPage, true);

  const editComic = {
    type: 'SET_FRAME_COMIC_DATA' as const,
    frameId: 'f_comic',
    comicPageSnapshot: { id: 'cp1', title: 'Edited Comic', panels: [{ id: 'p1' }] },
    label: 'Split panel',
  };
  hist = recordOp(hist, doc1, editComic, 500);
  const doc2 = applyTelaOp(doc1, editComic);
  assert.equal((doc2.frames[3].comicPageSnapshot as any).title, 'Edited Comic');

  const uEdit = undo(hist, doc2)!;
  assert.equal((uEdit.doc.frames[3].comicPageSnapshot as any).title, 'Comic Page 1');
  const uAdd = undo(uEdit.history, uEdit.doc)!;
  assert.equal(uAdd.doc.frames.length, 3);
  assert.equal(uAdd.doc.frames.some(f => f.id === 'f_comic'), false);
});

test('custom unit conversion round-trips cleanly', () => {
  assert.equal(pxFromUnitValue(8.5, 'in'), 816);
  assert.equal(unitValueFromPx(816, 'in'), 8.5);
  assert.equal(pxFromUnitValue(210, 'mm'), 794);
});
