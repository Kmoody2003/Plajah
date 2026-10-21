import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOWCASE_COMICS, pumpkinPatchV4 } from '../data/showcase/comics';
import {
  comicProjectToShowcaseBook,
  showcaseBookToComicProject,
} from '../services/comicProject/showcaseImport';
import { layoutFlexRows, packFlexRows } from '../services/comicProject/layout';

const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

for (const book of SHOWCASE_COMICS) {
  test(`${book.id}: opening as a project and exporting is lossless`, () => {
    const project = showcaseBookToComicProject(book, 0);
    const exported = comicProjectToShowcaseBook(plain(project));
    assert.deepEqual(plain(exported), plain({ ...book, pageCount: book.pages.length }));
  });
}

test('Pumpkin Patch v4 opens with every panel, balloon, caption, SFX, loop and SAM layer', () => {
  const project = showcaseBookToComicProject(pumpkinPatchV4, 0);
  const panels = project.pages.flatMap((p) => p.panels);
  const lettering = panels.flatMap((p) => p.nestedDocument.balloons);
  assert.equal(project.pages.length, 26);
  assert.equal(panels.length, 294);
  assert.equal(lettering.filter((b) => b.style !== 'NARRATION_CAPTION').length, 276);
  assert.equal(lettering.filter((b) => b.style === 'NARRATION_CAPTION').length, 40);
  assert.equal(panels.flatMap((p) => p.nestedDocument.sfxItems).length, 75);
  assert.equal(panels.filter((p) => p.video?.loop?.enabled).length, 10);
  assert.equal(panels.filter((p) => p.subject?.enabled).length, 14);
  assert.ok(panels.every((p) => p.renderedImageUrl?.startsWith('/generated/comics/pumpkin_patch_v4/')));
});

test('edits survive export: moved balloon, new text, scrubbed frame', () => {
  const project = showcaseBookToComicProject(pumpkinPatchV4, 0);
  const pageIdx = project.pages.findIndex((p) => p.panels.some((x) => x.nestedDocument.balloons.some((b) => b.style === 'SPEECH')));
  const panelIdx = project.pages[pageIdx].panels.findIndex((x) => x.nestedDocument.balloons.some((b) => b.style === 'SPEECH'));
  const panel = project.pages[pageIdx].panels[panelIdx];
  const b = panel.nestedDocument.balloons.find((x) => x.style === 'SPEECH')!;
  b.text = 'Edited line';
  b.xPct = 30;
  b.yPct = 60;
  panel.renderedImageUrl = 'https://image.mux.com/x/thumbnail.jpg?time=12';
  const out = comicProjectToShowcaseBook(project).pages[pageIdx].panels[panelIdx];
  const ob = out.balloons.find((x) => x.text === 'Edited line')!;
  assert.deepEqual(ob.position, { top: '60%', left: '30%', maxWidth: `${b.widthPct}%` });
  assert.equal(out.imageUrl, 'https://image.mux.com/x/thumbnail.jpg?time=12');
});

test('flex layout packs 12-column rows and fills the page', () => {
  const rows = packFlexRows([{ flex: 12 }, { flex: 7 }, { flex: 5 }, { flex: 3 }, { flex: 4 }, { flex: 3 }]);
  assert.deepEqual(rows, [[0], [1, 2], [3, 4, 5]]);
  for (const page of pumpkinPatchV4.pages) {
    const { boxes, aspect } = layoutFlexRows(page.panels);
    assert.ok(aspect > 0.3, `page ${page.pageNumber} aspect`);
    const bottom = Math.max(...boxes.map((b) => b.yPct + b.heightPct));
    assert.ok(Math.abs(bottom - 100) < 0.05, `page ${page.pageNumber} fills to ${bottom}`);
    for (const b of boxes) {
      assert.ok(b.xPct >= -0.01 && b.xPct + b.widthPct <= 100.01, `page ${page.pageNumber} box in bounds`);
    }
  }
});
