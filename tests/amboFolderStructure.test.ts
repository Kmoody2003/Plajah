import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dirOf, folderView, withDropPath, dropRelPath, writeFileToDirectory, importFilesIntoTarget, type DirEntryLike } from '../services/ambo/mediaFolders';
import { slideFromMedia, nativeDropDir, folderGroupLabel } from '../services/ambo/mediaDrop';

describe('folder structure', () => {
  it('dirOf takes the folder part of a relative path', () => {
    assert.equal(dirOf('a/b/c.jpg'), 'a/b');
    assert.equal(dirOf('c.jpg'), '');
    assert.equal(dirOf('a\\b\\c.jpg'), 'a/b');
  });

  it('folderView lists one level: direct files plus subfolders with counts beneath', () => {
    const items = ['x.jpg', 'Easter/a.jpg', 'Easter/Photos/b.jpg', 'Easter/Photos/c.jpg', 'Christmas/d.mp4', 'Easter/Video/e.mp4'].map(p => ({ p, dir: dirOf(p) }));
    const top = folderView(items, i => i.dir, '');
    assert.deepEqual(top.files.map(f => f.p), ['x.jpg']);
    assert.deepEqual(top.subfolders, [{ name: 'Christmas', path: 'Christmas', count: 1 }, { name: 'Easter', path: 'Easter', count: 4 }]);
    const easter = folderView(items, i => i.dir, 'Easter');
    assert.deepEqual(easter.files.map(f => f.p), ['Easter/a.jpg']);
    assert.deepEqual(easter.subfolders.map(s => [s.path, s.count]), [['Easter/Photos', 2], ['Easter/Video', 1]]);
    assert.deepEqual(folderView(items, i => i.dir, 'Easter/Photos').subfolders, []);
  });

  it('slides from a dropped folder are grouped by their subfolder', () => {
    const s = slideFromMedia({ name: 'a.jpg', kind: 'IMAGE', url: 'blob:a', dir: 'Easter/Photos' });
    assert.equal(s?.group, 'Easter / Photos');
    assert.equal(slideFromMedia({ name: 'a.jpg', kind: 'IMAGE', url: 'blob:a' })?.group, 'Photos');
    assert.equal(folderGroupLabel('A/B/C'), 'A / B / C');
  });

  it('Windows shell drops keep the dropped folder name in the path', () => {
    assert.equal(nativeDropDir({ folderPath: 'C:\\Media\\Easter', relativePath: 'Photos\\b.jpg' }), 'Easter/Photos');
    assert.equal(nativeDropDir({ folderPath: 'C:\\Media\\Easter', relativePath: 'b.jpg' }), 'Easter');
    assert.equal(nativeDropDir({ folderPath: 'C:\\Media' }), undefined);
  });

  it('import into a folder recreates the dropped folder structure', async () => {
    const root: any = fakeDir();
    (globalThis as any).URL.createObjectURL ??= () => 'blob:x';
    const f = withDropPath(new File(['x'], 'b.jpg', { type: 'image/jpeg' }), 'Easter/Photos/b.jpg');
    assert.equal(dropRelPath(f), 'Easter/Photos/b.jpg');
    const w = await writeFileToDirectory(root, f.name, f, 'Sunday/' + dirOf(dropRelPath(f)!));
    assert.equal(w.relPath, 'Sunday/Easter/Photos/b.jpg');
    assert.ok(root.children.Sunday.children.Easter.children.Photos.children['b.jpg']);
    void importFilesIntoTarget; // exercised in the browser (needs IndexedDB handles)
  });
});

function fakeDir(): DirEntryLike & { children: Record<string, any> } {
  const children: Record<string, any> = {};
  const dir: any = {
    kind: 'directory', name: 'root', children,
    async *values() { for (const v of Object.values(children)) yield v; },
    async getDirectoryHandle(name: string, o?: { create?: boolean }) {
      if (!children[name]) { if (!o?.create) throw new Error('missing'); children[name] = fakeDirNamed(name); }
      return children[name];
    },
    async getFileHandle(name: string) {
      let data: Blob = new Blob();
      const fh: any = { kind: 'file', name, async createWritable() { return { async write(d: Blob) { data = d; }, async close() {} }; }, async getFile() { return new File([data], name); } };
      children[name] = fh;
      return fh;
    },
  };
  return dir;
}
function fakeDirNamed(name: string) { const d: any = fakeDir(); d.name = name; return d; }
