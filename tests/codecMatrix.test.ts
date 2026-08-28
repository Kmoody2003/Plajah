import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL, VIDEO, AUDIO, codecsForExt, canImport, kindOf, importAccept,
  importableExtensions, freeExportCodecs, paidCodecs, greyCodecs, codecById,
  licenseSummary, importTierFor,
} from '../services/fabula/codecMatrix.ts';

// ── the deliverable the user asked for: MPEG-2 fully, both directions, free ──
test('MPEG-2 imports AND exports, and is patent-expired (free)', () => {
  const m = codecById('mpeg2');
  assert.ok(m, 'mpeg2 entry exists');
  assert.equal(m.license, 'expired');
  assert.ok(m.importTiers.length > 0, 'mpeg2 imports');
  assert.ok(m.exportTiers.length > 0, 'mpeg2 exports');
  // recognised on every MPEG-2 container extension
  for (const ext of ['clip.mpg', 'clip.m2v', 'clip.ts', 'clip.vob', 'clip.m2ts']) {
    assert.ok(canImport(ext), `${ext} importable`);
    assert.equal(kindOf(ext), 'video', `${ext} is video`);
  }
  // in-browser: mpeg2 lists the wasm tier for both directions
  assert.ok(m.importTiers.includes('wasm'));
  assert.ok(m.exportTiers.includes('wasm'));
});

// ── the licence contract: paid codecs never expose an encoder ──
test('no paid codec has an export tier (decode-only wall holds)', () => {
  for (const c of paidCodecs()) {
    assert.equal(c.exportTiers.length, 0, `${c.id} must be decode-only`);
  }
  // and the paid set is exactly the ones we expect to owe royalties on
  const ids = paidCodecs().map((c) => c.id).sort();
  assert.deepEqual(ids, ['ac3', 'dts', 'eac3']);
});

test('free-export list never contains a paid codec', () => {
  for (const c of freeExportCodecs()) assert.notEqual(c.license, 'paid');
});

test('vendor-licensed video (H.264/HEVC/AAC) only ever encodes via browser or crossover, never our own wasm', () => {
  for (const id of ['h264', 'hevc', 'aac']) {
    const c = codecById(id);
    assert.ok(c);
    assert.ok(!c.exportTiers.includes('wasm'),
      `${id} must not claim a wasm encoder — we'd owe the patent then`);
  }
});

test('grey codecs (ProRes/RAW) import but are honest about export', () => {
  const grey = greyCodecs().map((c) => c.id);
  assert.ok(grey.includes('prores'));
  const pr = codecById('prores');
  assert.ok(pr.importTiers.length > 0, 'ProRes imports freely');
  // camera RAW is decode-only
  for (const id of ['braw', 'r3d', 'arriraw']) {
    assert.equal(codecById(id).exportTiers.length, 0, `${id} raw is decode-only`);
  }
});

// ── structural integrity ──
test('every entry has at least one tier in some direction', () => {
  for (const c of ALL) {
    assert.ok(c.importTiers.length + c.exportTiers.length > 0, `${c.id} is inert`);
    assert.ok(c.ext.length > 0, `${c.id} has no extension`);
    assert.ok(['free', 'expired', 'vendor', 'grey', 'paid'].includes(c.license));
  }
});

test('codec ids are unique', () => {
  const ids = ALL.map((c) => c.id);
  assert.equal(ids.length, new Set(ids).size);
});

test('importAccept is comprehensive and well-formed', () => {
  const a = importAccept();
  assert.ok(a.includes('.mpg'));
  assert.ok(a.includes('.mxf'));
  assert.ok(a.includes('.dpx'));
  assert.ok(a.includes('video/*'));
  assert.ok(!a.includes('..'), 'no doubled dots');
  // importableExtensions all start with a dot and are lowercase
  for (const e of importableExtensions()) {
    assert.match(e, /^\.[a-z0-9]+$/, `${e} malformed`);
  }
});

test('ambiguous containers resolve video-first', () => {
  // .mxf and .mov and .ts carry both video and audio codecs → video wins
  assert.equal(kindOf('master.mxf'), 'video');
  assert.equal(kindOf('take.mov'), 'video');
  assert.equal(importTierFor('archive.mpg'), 'wasm');
});

test('DNxHR is the free mastering path (export, not grey)', () => {
  const d = codecById('dnxhr');
  assert.equal(d.license, 'free');
  assert.ok(d.exportTiers.length > 0);
});

test('license summary counts add up to the catalog size', () => {
  const s = licenseSummary();
  const total = s.free + s.expired + s.vendor + s.grey + s.paid;
  assert.equal(total, ALL.length);
  assert.ok(VIDEO.length > 10 && AUDIO.length > 5, 'catalog is comprehensive');
});
