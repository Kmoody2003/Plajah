// Wiring check: the Tela designers for Orbit Party (story-space) and Little Fox, Big Trees (story-forest) draw the REAL story data,
// word for word, in the book's page plan. No spread may be dropped, reordered, truncated or left showing old sample copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { showcaseByTemplate } from '../data/showcase';
import { TELA_PUBLICATION_TEMPLATES, instantiatePublicationPage } from '../services/telaPublicationTemplates';
import { lintPage } from '../services/tela/templateLint';

const squash = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9]/g, '');
const wordsOf = (s: string) => s.replace(/[‘’]/g, "'").split(/\s+/).map(w => w.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean);
const OLD_COPY = ['COUNT & FIND', 'Plajah Tela', 'FIND THE LIGHTS', 'HEE HEE', 'Give the sun a face', 'Find the lost kazoo', 'Pop! A balloon', 'How many planets', 'Hi!', 'The End', 'THE END', 'Two small friends.', 'One big, bright forest', 'Little Fox looked up', 'Each trunk was a tall,\n', 'Ages 3', 'Ages 4–8'];

for (const id of ['story-space', 'story-forest']) {
  const book = showcaseByTemplate(id);
  const template = TELA_PUBLICATION_TEMPLATES.find(t => t.id === id);

  test(`${id}: template page count equals the book's spread count`, () => {
    assert.ok(book, `no showcase book for ${id}`); assert.ok(template, `no template ${id}`);
    assert.equal(template!.pages.length, book!.spreads.length);
    assert.equal(template!.pages[0], 'COVER'); assert.equal(template!.pages[template!.pages.length - 1], 'BACK COVER');
    assert.ok(new Set(template!.pages).size >= 5);
  });

  book?.spreads.forEach((spread, i) => {
    test(`${id}: page ${spread.n} (${spread.beat}) builds and carries every word of the spread in order`, () => {
      const objs = instantiatePublicationPage(template!, template!.pages[i], i);
      assert.ok(objs.length >= 10, `only ${objs.length} objects`);
      const issues = lintPage(objs, template!.width, template!.height, { minObjects: 10 }).filter(x => x.severity === 'error');
      assert.deepEqual(issues, [], `lint errors: ${JSON.stringify(issues)}`);
      // reading-order stream of all text, minus the drop-shadow copies of lettered titles
      const texts = objs.filter(o => o.kind === 'TEXT' && !/ shadow$/.test(o.objectLabel || ''));
      const stream = squash(texts.map(o => o.text || '').join(' '));
      let cursor = 0;
      for (const w of wordsOf(spread.text)) {
        const at = stream.indexOf(w, cursor);
        assert.ok(at >= 0, `word "${w}" of spread ${spread.n} is missing or out of order (page text: ${texts.map(o => o.text).join(' | ').slice(0, 200)})`);
        cursor = at + w.length;
      }
      // the story text is never set smaller than 22px, and every text box stays on the page
      for (const o of texts.filter(t => t.objectLabel === 'Story text')) assert.ok((o.fontSize || 0) >= 22, `story text ${o.fontSize}px is too small: ${o.text?.slice(0, 40)}`);
      for (const o of texts) assert.ok(o.x >= -1 && o.y >= -1 && o.x + o.w <= template!.width + 1 && o.y + o.h <= template!.height + 1, `text box off the page: ${o.text?.slice(0, 30)}`);
      // none of the old sample copy is left over, unless the real spread uses the same words
      const all = texts.map(o => o.text || '').join('\n');
      for (const old of OLD_COPY) if (all.includes(old) && !spread.text.includes(old)) assert.fail(`old sample copy "${old}" is still on page ${spread.n}`);
    });
  });
}
