// Duplicate course files in Content HQ (services/orgAssets.findDuplicateImportCopies):
//   • re-imports of the same link left extra Original/Tela/Answer Key copies; all but one per link and kind are duplicates;
//   • the copy the current lesson points at is the one kept, even when it isn't the newest;
//   • files people uploaded themselves, other links, and files already in Trash are never counted.
//   npx tsx --test tests/courseImportDuplicates.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
  clear: () => store.clear(),
};

const { findDuplicateImportCopies } = await import('../services/orgAssets');

const A = 'https://drive.google.com/file/d/A/view';
const B = 'https://docs.google.com/forms/d/e/B/viewform';
const asset = (id: string, sourceUrl: string | undefined, variant: string, uploadedAt: number, extra: object = {}) =>
  ({ id, sourceUrl, assetVariant: variant, uploadedAt, name: id, ...extra }) as any;

test('keeps one copy per link and kind, preferring the one the lesson uses', () => {
  const assets = [
    asset('hq_orig_tela_1', A, 'ORIGINAL_SOURCE', 1), asset('hq_tela_tela_1', A, 'TELA_DOCUMENT', 1),
    asset('hq_orig_tela_2', A, 'ORIGINAL_SOURCE', 2), asset('hq_tela_tela_2', A, 'TELA_DOCUMENT', 2),
    asset('hq_orig_tela_3', A, 'ORIGINAL_SOURCE', 3), asset('hq_tela_tela_3', A, 'TELA_DOCUMENT', 3),
    asset('hq_orig_tela_9', B, 'ORIGINAL_SOURCE', 9),
  ];
  const keep = new Set(['hq_orig_tela_2', 'hq_tela_tela_2']);
  const dupes = findDuplicateImportCopies(assets, new Set([A, B]), keep).map(a => a.id).sort();
  assert.deepEqual(dupes, ['hq_orig_tela_1', 'hq_orig_tela_3', 'hq_tela_tela_1', 'hq_tela_tela_3']);
});

test('without a lesson pointing at one, the newest copy stays', () => {
  const assets = [asset('hq_orig_x1', A, 'ORIGINAL_SOURCE', 5), asset('hq_orig_x2', A, 'ORIGINAL_SOURCE', 8)];
  assert.deepEqual(findDuplicateImportCopies(assets, new Set([A]), new Set()).map(a => a.id), ['hq_orig_x1']);
});

test('uploads, other links and trashed files are left alone', () => {
  const assets = [
    asset('upload_1', A, 'ORIGINAL_SOURCE', 1), asset('upload_2', A, 'ORIGINAL_SOURCE', 2),
    asset('hq_orig_o1', 'https://other', 'ORIGINAL_SOURCE', 1), asset('hq_orig_o2', 'https://other', 'ORIGINAL_SOURCE', 2),
    asset('hq_orig_t1', A, 'ORIGINAL_SOURCE', 1, { deletedAt: 10 }), asset('hq_orig_t2', A, 'ORIGINAL_SOURCE', 2),
    asset('hq_orig_n1', undefined, 'ORIGINAL_SOURCE', 1),
  ];
  assert.deepEqual(findDuplicateImportCopies(assets, new Set([A]), new Set()), []);
});
