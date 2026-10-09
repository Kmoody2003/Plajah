// The Tela designers for Beep Block Street (story-city) and The Golden Thread (story-folktale) must draw the REAL story data:
// every page builds, is a real page, and its text objects carry every word of the spread in order.
import test from 'node:test';
import assert from 'node:assert/strict';
import { showcaseByTemplate } from '../data/showcase';
import { TELA_PUBLICATION_TEMPLATES, instantiatePublicationPage } from '../services/telaPublicationTemplates';
import { lintPage } from '../services/tela/templateLint';

const words = (s: string) => s.toLowerCase().replace(/[‘’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);

for (const id of ['story-city', 'story-folktale']) {
  const book = showcaseByTemplate(id)!;
  const tpl = TELA_PUBLICATION_TEMPLATES.find(t => t.id === id)!;

  test(`${id}: template page count equals the book's spread count (${book.spreads.length})`, () => {
    assert.equal(tpl.pages.length, book.spreads.length);
    assert.equal(tpl.audience.replace(/\D/g, ''), `${book.ageMin}${book.ageMax}`);
  });

  book.spreads.forEach((sp, i) => {
    test(`${id}: page ${sp.n} (${sp.beat}) builds and carries every word of the spread`, () => {
      const objs = instantiatePublicationPage(tpl, tpl.pages[i], i);
      assert.ok(objs.length >= 10, `only ${objs.length} objects`);
      assert.ok(lintPage(objs, tpl.width, tpl.height).filter(x => x.severity === 'error').length === 0);
      // title letters are drawn twice (outline + face) and ghost copies print off-register: skip the duplicates
      const stream = objs.filter(o => o.kind === 'TEXT' && !/outline$|Off-register/.test(o.objectLabel || '')).map(o => (o.text || '').replace(/\n/g, ' ')).join(' ');
      // letters may be separate objects ("B","E","E","P"), so match on the compact character stream, word by word, in order
      const compact = words(stream).join('');
      let at = 0;
      for (const w of words(sp.text)) {
        const found = compact.indexOf(w, at);
        assert.ok(found >= 0, `word "${w}" of spread ${sp.n} is missing or out of order`);
        at = found + w.length;
      }
      // the words must not have been cut: total story characters present
      assert.ok(compact.length >= words(sp.text).join('').length);
    });
  });
}
