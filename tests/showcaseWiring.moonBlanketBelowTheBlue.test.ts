// Wiring check for two showcase books: the Tela designers for story-bedtime (Moon Blanket) and story-ocean (Below the Blue) must draw the REAL story
// from data/showcase on every page: the page builds, is rich enough, carries every word of its spread in order, stays on the page, and the page count
// follows the book. (Decorative duplicate glyph layers - embroidery shadows/outlines, title bleeds - are skipped when reading the text back.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { showcaseByTemplate } from '../data/showcase';
import { instantiatePublicationPage, TELA_PUBLICATION_TEMPLATES } from '../services/telaPublicationTemplates';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const DECORATIVE = /shadow|outline|highlight|bleed/i;

for (const id of ['story-bedtime', 'story-ocean']) {
  const template = TELA_PUBLICATION_TEMPLATES.find(t => t.id === id)!;
  const book = showcaseByTemplate(id)!;

  test(`${id}: template is registered and its page count equals the book's spread count`, () => {
    assert.ok(template, `${id} template missing`);
    assert.ok(book, `${id} has no showcase book`);
    assert.equal(template.pages.length, book.spreads.length, `${id}: ${template.pages.length} template pages vs ${book.spreads.length} spreads`);
    assert.equal(template.pages[0], 'COVER');
    assert.equal(template.pages[template.pages.length - 1], 'BACK COVER');
    assert.match(template.audience, new RegExp(`${book.ageMin}.${book.ageMax}`), 'audience ages follow the book');
  });

  book.spreads.forEach((spread, i) => {
    test(`${id} page ${spread.n} (${spread.beat}): builds, is rich, and shows every word of its spread in order`, () => {
      const objs = instantiatePublicationPage(template, template.pages[i], i);
      assert.ok(objs.length >= 10, `only ${objs.length} objects`);
      const texts = objs.filter(o => o.kind === 'TEXT' && !DECORATIVE.test(o.objectLabel || ''));
      const stream = norm(texts.map(o => o.text || '').join(' '));
      const want = norm(spread.text);
      assert.ok(want.length > 0);
      assert.ok(stream.includes(want), `page ${spread.n}: the page text does not contain the spread text in order.\n  want: ${want.slice(0, 120)}\n  got:  ${stream.slice(0, 160)}`);
      // never clipped: every text box sits on the page; story text is never smaller than 20px
      for (const o of texts) {
        assert.ok(o.x >= -1 && o.y >= -1 && o.x + o.w <= template.width + 1 && o.y + o.h <= template.height + 1, `text off the page: "${(o.text || '').slice(0, 30)}" at ${Math.round(o.x)},${Math.round(o.y)} ${Math.round(o.w)}x${Math.round(o.h)}`);
        assert.ok((o.fontSize || 0) >= 20, `type too small (${o.fontSize}px): "${(o.text || '').slice(0, 30)}"`);
      }
    });
  });

  test(`${id}: no leftover copy from the old drafts`, () => {
    const old = [/little bear/i, /little moth/i, /where is the\s+little/i, /find 5 lanterns/i, /a little painted sea story/i, /ages\s*2[-–]5/i, /ages\s*3[-–]7/i, /squares of blanket/i, /shh\.\.\./i, /one sheep/i, /peek!/i, /jellyfish!/i, /splash!/i];
    template.pages.forEach((pt, i) => {
      const txt = instantiatePublicationPage(template, pt, i).filter(o => o.kind === 'TEXT').map(o => o.text || '').join('\n');
      for (const re of old) assert.ok(!re.test(txt), `page ${i + 1} still carries old copy matching ${re}`);
    });
  });
}

test('Coral and Lumi follow the character bible (no antenna lure, a row of belly dots, three golden stripes)', () => {
  const t = TELA_PUBLICATION_TEMPLATES.find(x => x.id === 'story-ocean')!;
  const labels = new Set<string>();
  t.pages.forEach((pt, i) => instantiatePublicationPage(t, pt, i).forEach(o => labels.add(o.objectLabel || '')));
  assert.ok(!labels.has('Lantern bulb') && !labels.has('Lantern glow'), 'Lumi must not have an antenna lure');
  assert.ok(labels.has('Glowing dots') && labels.has('Teal halos'), 'Lumi needs her row of glowing belly dots with halos');
  assert.ok(labels.has('Golden stripe'), 'Coral needs her golden stripes');
});
