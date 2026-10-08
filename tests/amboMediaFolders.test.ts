import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  scanDirectory, uniqueName, sanitizeFileName, writeFileToDirectory, createSubfolderIn,
  moveBefore, movedIndex, insertionIndexFor, FolderPermissionError, type DirEntryLike,
} from '../services/ambo/mediaFolders';
import { classifyFile, kindForFile, MEDIA_EXTENSIONS } from '../services/ambo/mediaLibrary';
import { applyMediaToSlide, slideFromMedia } from '../services/ambo/mediaDrop';
import { newId, type Slide } from '../services/ambo/showModel';

// ── Fake File System Access directory ──
type Node = { file: File } | { dir: Record<string, Node> };
function fakeDir(name: string, tree: Record<string, Node>, perm: PermissionState = 'granted'): DirEntryLike {
  const dir: any = {
    kind: 'directory', name,
    async *values() {
      for (const [n, node] of Object.entries(tree)) {
        if ('file' in node) yield { kind: 'file', name: n, getFile: async () => node.file };
        else yield fakeDir(n, node.dir, perm);
      }
    },
    async queryPermission() { return perm; },
    async getDirectoryHandle(n: string, o?: { create?: boolean }) {
      let node = tree[n];
      if (!node) { if (!o?.create) throw new Error('NotFound'); node = tree[n] = { dir: {} }; }
      if (!('dir' in node)) throw new Error('TypeMismatch');
      return fakeDir(n, node.dir, perm);
    },
    async getFileHandle(n: string, o?: { create?: boolean }) {
      if (!tree[n]) { if (!o?.create) throw new Error('NotFound'); tree[n] = { file: new File([], n) }; }
      const slot = tree[n] as { file: File };
      return {
        async createWritable() {
          const chunks: BlobPart[] = [];
          return { async write(b: Blob) { chunks.push(b); }, async close() { tree[n] = { file: new File(chunks, n) }; } };
        },
        async getFile() { return slot && (tree[n] as { file: File }).file; },
      };
    },
  };
  return dir;
}
const f = (n: string, size = 3) => ({ file: new File([new Uint8Array(size)], n) });

describe('shared kind table', () => {
  it('classifies by extension, case-insensitively, ignoring query strings', () => {
    assert.equal(classifyFile('A.PNG'), 'IMAGE');
    assert.equal(classifyFile('x.mkv'), 'VIDEO');
    assert.equal(classifyFile('x.flac'), 'AUDIO');
    assert.equal(classifyFile('x.lottie'), 'LOTTIE');
    assert.equal(classifyFile('deck.pptx'), 'DOC');
    assert.equal(classifyFile('https://h/a.webm?t=1'), 'VIDEO');
    assert.equal(classifyFile('readme.txt'), null);
  });
  it('falls back to MIME and gates .json', () => {
    assert.equal(classifyFile('blob', 'video/mp4'), 'VIDEO');
    assert.equal(classifyFile('config.json', '', false), null);
    assert.equal(classifyFile('anim.json'), 'LOTTIE');
  });
  it('kindForFile keeps its old contract and excludes docs', () => {
    assert.equal(kindForFile('sting.wav'), 'AUDIO');
    assert.equal(kindForFile('deck.pdf'), null);
    assert.ok(MEDIA_EXTENSIONS.IMAGE.includes('svg'));
  });
});

describe('recursive scan', () => {
  const tree = () => ({
    'a.png': f('a.png'),
    'notes.txt': f('notes.txt'),
    '.hidden.png': f('.hidden.png'),
    config: { dir: { 'cfg.json': f('cfg.json') } },
    loops: { dir: { 'one.mp4': f('one.mp4'), deep: { dir: { 'two.webm': f('two.webm'), 'amen.mp3': f('amen.mp3') } } } },
  } as Record<string, Node>);

  it('walks subfolders, keeps relative paths, skips hidden/unknown/json', async () => {
    const r = await scanDirectory('F1', fakeDir('root', tree()));
    assert.deepEqual(r.items.map(i => i.relPath).sort(), ['a.png', 'loops/deep/amen.mp3', 'loops/deep/two.webm', 'loops/one.mp4']);
    assert.equal(r.items.find(i => i.name === 'one.mp4')!.kind, 'VIDEO');
    assert.equal(r.items[0].id.startsWith('F1:'), true);
    assert.equal(r.truncated, false);
  });
  it('honours the item cap and depth cap', async () => {
    const capped = await scanDirectory('F', fakeDir('r', tree()), { maxItems: 2 });
    assert.equal(capped.items.length, 2);
    assert.equal(capped.truncated, true);
    const shallow = await scanDirectory('F', fakeDir('r', tree()), { maxDepth: 1 });
    assert.deepEqual(shallow.items.map(i => i.relPath).sort(), ['a.png', 'loops/one.mp4']);
    assert.equal(shallow.truncated, true);
  });
  it('attaches URLs via makeUrl and records unreadable files without aborting', async () => {
    const t = tree();
    (t['a.png'] as any).file = undefined;
    const r = await scanDirectory('F', fakeDir('r', t), { makeUrl: (_f, rel) => `blob:${rel}` });
    assert.equal(r.errors.length, 1);
    assert.equal(r.items.find(i => i.relPath === 'loops/one.mp4')!.url, 'blob:loops/one.mp4');
  });
});

describe('collision-safe naming + writes', () => {
  it('sanitizes illegal and reserved names', () => {
    assert.equal(sanitizeFileName('a/b\\c?.png'), 'a_b_c_.png');
    assert.equal(sanitizeFileName('CON.png'), '_CON.png');
    assert.equal(sanitizeFileName('...'), 'file');
    assert.equal(sanitizeFileName('  x.png. '), 'x.png');
  });
  it('appends (n) case-insensitively and keeps the extension', () => {
    assert.equal(uniqueName('a.png', []), 'a.png');
    assert.equal(uniqueName('a.png', ['A.PNG']), 'a (1).png');
    assert.equal(uniqueName('a.png', ['a.png', 'a (1).png']), 'a (2).png');
    assert.equal(uniqueName('README', ['readme']), 'README (1)');
  });
  it('writeFileToDirectory never overwrites and supports subfolders', async () => {
    const tree: Record<string, Node> = { 'a.png': f('a.png', 1) };
    const root = fakeDir('root', tree);
    const w1 = await writeFileToDirectory(root, 'a.png', new Blob(['xyz']));
    assert.equal(w1.name, 'a (1).png');
    assert.equal(w1.size, 3);
    assert.equal((tree['a.png'] as any).file.size, 1); // original untouched
    const w2 = await writeFileToDirectory(root, 'b.mp3', new Blob(['q']), 'Sermons/2026');
    assert.equal(w2.relPath, 'Sermons/2026/b.mp3');
    assert.ok('dir' in tree['Sermons']);
  });
  it('refuses to write without readwrite permission', async () => {
    await assert.rejects(() => writeFileToDirectory(fakeDir('r', {}, 'prompt'), 'a.png', new Blob(['x'])), FolderPermissionError);
  });
  it('creates a sanitized subfolder', async () => {
    const tree: Record<string, Node> = {};
    assert.equal(await createSubfolderIn(fakeDir('r', tree), 'Easter: 2026'), 'Easter_ 2026');
    assert.ok('dir' in tree['Easter_ 2026']);
  });
});

describe('reorder math', () => {
  const L = ['a', 'b', 'c', 'd'];
  it('moves forward and backward', () => {
    assert.deepEqual(moveBefore(L, 0, 3), ['b', 'c', 'a', 'd']);
    assert.deepEqual(moveBefore(L, 3, 1), ['a', 'd', 'b', 'c']);
    assert.deepEqual(moveBefore(L, 1, 4), ['a', 'c', 'd', 'b']);
  });
  it('is a no-op on its own slot or the gap right after it', () => {
    assert.deepEqual(moveBefore(L, 2, 2), L);
    assert.deepEqual(moveBefore(L, 2, 3), L);
    assert.equal(movedIndex(4, 2, 3), 2);
  });
  it('reports where the moved slide lands', () => {
    assert.equal(movedIndex(4, 0, 3), 2);
    assert.equal(movedIndex(4, 3, 1), 1);
  });
  it('picks insertion side by pointer position', () => {
    assert.equal(insertionIndexFor(2, 10, 100), 2);
    assert.equal(insertionIndexFor(2, 80, 100), 3);
  });
});

describe('multi-file drop onto one slide', () => {
  const base = (): Slide => ({ id: newId('sl'), label: 'S', layers: [{ id: 't', slot: 'slide', content: { kind: 'TEXT', blocks: [{ text: 'hi' }] } }] });
  it('first visual = background, rest become new slides in order', () => {
    const r = applyMediaToSlide(base(), [
      { name: 'one.png', kind: 'IMAGE', url: 'u1' },
      { name: 'two.mp4', kind: 'VIDEO', url: 'u2' },
      { name: 'three.jpg', kind: 'IMAGE', url: 'u3' },
    ]);
    const bg = r.slide.layers.find(l => l.slot === 'background')!;
    assert.deepEqual(bg.content, { kind: 'IMAGE', src: 'u1' });
    assert.deepEqual(r.extra.map(s => s.label), ['two', 'three']);
  });
  it('audio and lottie are applied, not ignored', () => {
    const r = applyMediaToSlide(base(), [
      { name: 'amen.mp3', kind: 'AUDIO', url: 'a' },
      { name: 'spark.lottie', kind: 'LOTTIE', url: 'l' },
      { name: 'bg.png', kind: 'IMAGE', url: 'i' },
    ]);
    assert.equal(r.extra.length, 0);
    assert.ok(r.slide.layers.some(l => l.content.kind === 'AUDIO'));
    assert.ok(r.slide.layers.some(l => l.content.kind === 'LOTTIE'));
    assert.ok(r.slide.onEnter?.some(a => a.kind === 'AUDIO_PLAY'));
    assert.ok(r.slide.layers.some(l => l.slot === 'background'));
  });
  it('reports unsupported files instead of eating them', () => {
    const r = applyMediaToSlide(base(), [{ name: 'deck.pdf', kind: 'DOC', url: 'd' }, { name: 'x', kind: null, url: 'x' }]);
    assert.deepEqual(r.skipped, ['deck.pdf', 'x']);
    assert.equal(slideFromMedia({ name: 'deck.pdf', kind: 'DOC', url: 'd' }), null);
  });
});
