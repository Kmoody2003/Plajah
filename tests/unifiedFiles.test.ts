// tests/unifiedFiles.test.ts — Pure unit tests for unified VFS classification, path normalization,
// and two-way / selective folder sync planning. Run: npx tsx --test tests/unifiedFiles.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyMediaKind,
  joinUnifiedPath,
  normalizeUnifiedPath,
  parentUnifiedPath,
  sortUnifiedEntries,
  splitBreadcrumbs,
  type UnifiedEntry,
  classifyPlajahRichKind,
} from '../services/files/unifiedVfs';
import {
  buildConflictCopyName,
  isPathIncludedSelective,
  isSyncPathIgnored,
  planSyncRun,
  type SyncBaselineEntry,
} from '../services/files/syncPlanner';

test('unifiedVfs: classifies media, documents, and archives cleanly', () => {
  assert.equal(classifyMediaKind('photo.HEIC'), 'IMAGE');
  assert.equal(classifyMediaKind('clip.mkv'), 'VIDEO');
  assert.equal(classifyMediaKind('master.flac'), 'AUDIO');
  assert.equal(classifyMediaKind('brief.pdf'), 'DOC');
  assert.equal(classifyMediaKind('main.ts'), 'DOC');
  assert.equal(classifyMediaKind('backup.zip'), 'ARCHIVE');
  assert.equal(classifyMediaKind('firmware.bin'), 'OTHER');
});

test('unifiedVfs: normalizes Windows, UNC, POSIX, and Android SAF paths & breadcrumbs', () => {
  assert.equal(normalizeUnifiedPath('C:/Users/Kenne/Docs/'), 'C:\\Users\\Kenne\\Docs');
  assert.equal(normalizeUnifiedPath('D:'), 'D:\\');
  assert.equal(normalizeUnifiedPath('\\\\nas\\media\\'), '\\\\nas\\media');
  assert.equal(normalizeUnifiedPath('/storage/emulated/0/Download/'), '/storage/emulated/0/Download');

  assert.equal(parentUnifiedPath('C:\\Users\\Kenne\\Docs'), 'C:\\Users\\Kenne');
  assert.equal(parentUnifiedPath('C:\\Users'), 'C:\\');
  assert.equal(joinUnifiedPath('C:\\Users', 'Music'), 'C:\\Users\\Music');

  const crumbs = splitBreadcrumbs('Local Disk (C:)', 'C:\\', 'C:\\Projects\\Plajah\\Tracks');
  assert.deepEqual(crumbs, [
    { label: 'Local Disk (C:)', path: 'C:\\' },
    { label: 'Projects', path: 'C:\\Projects' },
    { label: 'Plajah', path: 'C:\\Projects\\Plajah' },
    { label: 'Tracks', path: 'C:\\Projects\\Plajah\\Tracks' },
  ]);
});

test('unifiedVfs: sorting keeps folders before files with numeric natural order', () => {
  const mk = (name: string, isDirectory: boolean, size = 0): UnifiedEntry => ({
    id: name,
    name,
    path: `/${name}`,
    parentPath: '/',
    kind: 'local',
    isDirectory,
    size,
    lastModified: 1000,
    mediaKind: isDirectory ? 'OTHER' : classifyMediaKind(name),
  });
  const sorted = sortUnifiedEntries([mk('track10.wav', false), mk('track2.wav', false), mk('Stems', true)], 'name', true);
  assert.deepEqual(sorted.map(x => x.name), ['Stems', 'track2.wav', 'track10.wav']);
});

test('syncPlanner: ignores transient OS files and filters selective folders', () => {
  assert.equal(isSyncPathIgnored('sub/Thumbs.db'), true);
  assert.equal(isSyncPathIgnored('~$draft.docx'), true);
  assert.equal(isSyncPathIgnored('.git/objects/abc'), true);
  assert.equal(isSyncPathIgnored('mixes/song.wav'), false);
  assert.equal(isSyncPathIgnored('raw/take1.wav', ['*.wav']), true);

  assert.equal(isPathIncludedSelective('Photos/2026/a.jpg', ['Photos', 'Audio']), true);
  assert.equal(isPathIncludedSelective('Private/secret.txt', ['Photos', 'Audio']), false);
});

test('syncPlanner: two-way sync handles uploads, downloads, deletions, and simultaneous edit conflicts safely', () => {
  const NOW = Date.UTC(2026, 10, 13, 12, 0, 0);
  const baseline: Record<string, SyncBaselineEntry> = {
    'unchanged.txt': {
      relPath: 'unchanged.txt',
      localSize: 100,
      localMtimeMs: 1000,
      remoteId: 'r_1',
      remoteVersion: 1,
      remoteSize: 100,
      remoteUpdatedAt: 1000,
      syncedAt: 2000,
    },
    'edited-local.txt': {
      relPath: 'edited-local.txt',
      localSize: 100,
      localMtimeMs: 1000,
      remoteId: 'r_2',
      remoteVersion: 1,
      remoteSize: 100,
      remoteUpdatedAt: 1000,
      syncedAt: 2000,
    },
    'edited-both.wav': {
      relPath: 'edited-both.wav',
      localSize: 1000,
      localMtimeMs: 1000,
      remoteId: 'r_3',
      remoteVersion: 1,
      remoteSize: 1000,
      remoteUpdatedAt: 1000,
      syncedAt: 2000,
    },
    'deleted-remote.pdf': {
      relPath: 'deleted-remote.pdf',
      localSize: 500,
      localMtimeMs: 1000,
      remoteId: 'r_4',
      remoteVersion: 1,
      remoteSize: 500,
      remoteUpdatedAt: 1000,
      syncedAt: 2000,
    },
  };

  const plan = planSyncRun({
    direction: 'twoWay',
    now: NOW,
    deviceTag: 'win-desktop',
    baseline,
    localEntries: [
      { relPath: 'unchanged.txt', isDirectory: false, size: 100, mtimeMs: 1200 },
      { relPath: 'edited-local.txt', isDirectory: false, size: 220, mtimeMs: 9000 },
      { relPath: 'edited-both.wav', isDirectory: false, size: 1500, mtimeMs: 9500 },
      { relPath: 'deleted-remote.pdf', isDirectory: false, size: 500, mtimeMs: 1000 },
      { relPath: 'brand-new-local.png', isDirectory: false, size: 4200, mtimeMs: 9900 },
      { relPath: 'desktop.ini', isDirectory: false, size: 50, mtimeMs: 9900 },
    ],
    remoteEntries: [
      { relPath: 'unchanged.txt', id: 'r_1', isDirectory: false, size: 100, updatedAt: 1000, version: 1 },
      { relPath: 'edited-local.txt', id: 'r_2', isDirectory: false, size: 100, updatedAt: 1000, version: 1 },
      { relPath: 'edited-both.wav', id: 'r_3', isDirectory: false, size: 1800, updatedAt: 9600, version: 2 },
      { relPath: 'brand-new-remote.mp4', id: 'r_5', isDirectory: false, size: 90000, updatedAt: 9800, version: 1 },
    ],
  });

  const byPath = new Map(plan.actions.map(a => [a.relPath, a]));
  assert.equal(byPath.has('unchanged.txt'), false);
  assert.equal(byPath.has('desktop.ini'), false);
  assert.equal(byPath.get('edited-local.txt')?.kind, 'upload_modified');
  assert.equal(byPath.get('brand-new-local.png')?.kind, 'upload_new');
  assert.equal(byPath.get('brand-new-remote.mp4')?.kind, 'download_new');
  assert.equal(byPath.get('deleted-remote.pdf')?.kind, 'delete_local');
  assert.equal(byPath.get('edited-both.wav')?.kind, 'conflict');
  assert.equal(
    byPath.get('edited-both.wav')?.conflictCopyRelPath,
    buildConflictCopyName('edited-both.wav', NOW, 'win-desktop'),
  );
  assert.equal(plan.stats.conflicts, 1);
  assert.equal(plan.stats.uploads, 2);
  assert.equal(plan.stats.downloads, 1);
  assert.equal(plan.stats.deletions, 1);
});

test('syncPlanner: uploadOnly never deletes local files even if missing on remote', () => {
  const plan = planSyncRun({
    direction: 'uploadOnly',
    baseline: {
      'keep-me.jpg': {
        relPath: 'keep-me.jpg',
        localSize: 100,
        localMtimeMs: 1000,
        remoteId: 'r_9',
        remoteSize: 100,
        remoteUpdatedAt: 1000,
        syncedAt: 2000,
      },
    },
    localEntries: [{ relPath: 'keep-me.jpg', isDirectory: false, size: 100, mtimeMs: 1000 }],
    remoteEntries: [],
  });
  assert.equal(plan.actions.length, 1);
  assert.equal(plan.actions[0].kind, 'upload_new');
});

import {
  BoundedLruCache,
  buildDeterministicChoraPeaks,
  extractComicPreviewFromArrayBuffer,
  parseTelaPreviewDocument,
} from '../services/files/richPreviewCache';

function buildStoredZip(files: Array<{ name: string; bytes: Uint8Array }>): ArrayBuffer {
  const enc = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const cdParts: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const local = new Uint8Array(30 + nameBytes.length + f.bytes.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(8, 0, true); // store
    dv.setUint32(18, f.bytes.length, true);
    dv.setUint32(22, f.bytes.length, true);
    dv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(f.bytes, 30 + nameBytes.length);
    localParts.push(local);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(cd.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(10, 0, true);
    cdv.setUint32(20, f.bytes.length, true);
    cdv.setUint32(24, f.bytes.length, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    cdParts.push(cd);

    offset += local.length;
  }

  const cdSize = cdParts.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(8, files.length, true);
  edv.setUint16(10, files.length, true);
  edv.setUint32(12, cdSize, true);
  edv.setUint32(16, offset, true);

  const total = new Uint8Array(offset + cdSize + 22);
  let pos = 0;
  for (const p of localParts) { total.set(p, pos); pos += p.length; }
  for (const p of cdParts) { total.set(p, pos); pos += p.length; }
  total.set(eocd, pos);
  return total.buffer;
}

test('unifiedVfs: classifies Plajah rich formats (Tela, Comic, Lottie, Audio, Video, Image)', () => {
  assert.equal(classifyPlajahRichKind('presentation.tela'), 'TELA_DOC');
  assert.equal(classifyPlajahRichKind('lesson.tela-page.json'), 'TELA_DOC');
  assert.equal(classifyPlajahRichKind('chapter_01.cbz'), 'COMIC');
  assert.equal(classifyPlajahRichKind('storyboard.comic'), 'COMIC');
  assert.equal(classifyPlajahRichKind('spinner.lottie'), 'LOTTIE');
  assert.equal(classifyPlajahRichKind('mixdown.wav'), 'AUDIO');
  assert.equal(classifyPlajahRichKind('cut.mp4'), 'VIDEO');
  assert.equal(classifyPlajahRichKind('still.png'), 'IMAGE');
});

test('BoundedLruCache: enforces maxEntries, maxBytes, promotes MRU, and runs eviction cleanup', () => {
  const evicted: string[] = [];
  const cache = new BoundedLruCache<string>(3, 250);
  cache.set('a', 'va', 100, (_, k) => evicted.push(k));
  cache.set('b', 'vb', 100, (_, k) => evicted.push(k));
  // Touch 'a' so 'b' becomes LRU
  assert.equal(cache.get('a'), 'va');
  // Adding 'c' (100B) pushes totalBytes to 300 > 250 -> 'b' should evict
  cache.set('c', 'vc', 100, (_, k) => evicted.push(k));
  assert.deepEqual(evicted, ['b']);
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), 'va');
  assert.equal(cache.get('c'), 'vc');
  assert.equal(cache.getStats().totalBytes, 200);
});

test('parseTelaPreviewDocument: normalizes plajah-tela & detects embedded animations', () => {
  const raw = JSON.stringify({
    format: 'plajah-tela',
    version: 1,
    document: {
      id: 'td_1',
      ownerId: 'u_1',
      title: 'Worship Lower Third',
      templatePreset: {
        schemaVersion: 1,
        templateId: 'tpl_1',
        status: 'available',
        motion: { duration: 4, tracks: [{ objectId: 'o1', property: 'opacity', from: 0, to: 1, delay: 0, duration: 1 }] },
      },
      frames: [{ id: 'f1', label: 'Page 1', kind: 'SCREEN', width: 1280, height: 720, deviceIds: ['d1'] }],
      devices: {
        d1: {
          id: 'd1',
          type: 'VECTOR',
          width: 1280,
          height: 720,
          objects: [
            { id: 'v1', kind: 'MOTION_TEMPLATE', x: 0, y: 0, w: 640, h: 360, motionTemplate: { kind: 'slide', timing: { loop: true } } },
            { id: 'v2', kind: 'VISUALIZER', x: 0, y: 0, w: 320, h: 120, visualizer: { value: 'FLUX_CANVAS_EMBER_BARK' } },
          ],
        },
      },
    },
  });
  const summary = parseTelaPreviewDocument(raw);
  assert.ok(summary);
  assert.equal(summary.doc.title, 'Worship Lower Third');
  assert.equal(summary.hasTemplateMotion, true);
  assert.equal(summary.motionTemplateSpecs.length, 1);
  assert.equal(summary.visualizerSpecs.length, 1);
  assert.equal(summary.hasAnyAnimation, true);
});

test('extractComicPreviewFromArrayBuffer: extracts bounded pages & motion metadata cleanly', async () => {
  const enc = new TextEncoder();
  const fakePng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
  const buf = buildStoredZip([
    { name: 'page10.png', bytes: fakePng },
    { name: 'cover.jpg', bytes: fakePng },
    { name: 'page2.png', bytes: fakePng },
    {
      name: 'manifest.json',
      bytes: enc.encode(JSON.stringify({ title: 'Neo Tokyo Ch. 4', panels: [{ entrance: 'zoom', sfxText: 'BAM!' }] })),
    },
  ]);

  const extracted = await extractComicPreviewFromArrayBuffer(buf, 4);
  if (typeof URL?.createObjectURL === 'function') {
    assert.ok(extracted);
    assert.equal(extracted.preview.title, 'Neo Tokyo Ch. 4');
    assert.equal(extracted.preview.totalPageCount, 3);
    assert.equal(extracted.preview.hasMotion, true);
    assert.deepEqual(extracted.preview.sfxLabels, ['BAM!']);
    for (const u of extracted.preview.pageUrls) {
      if (u.startsWith('blob:')) URL.revokeObjectURL(u);
    }
  }
  const peaks = buildDeterministicChoraPeaks('track.wav', 64);
  assert.equal(peaks.length, 64);
});
