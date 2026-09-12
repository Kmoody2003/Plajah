import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TELA_TEMPLATE_GALLERY, GALLERY_COLLECTIONS } from '../services/tela/telaTemplateRegistry';
import { lintPage, pageSignature } from '../services/tela/templateLint';
import { ERA_DESIGNS } from '../services/tela/designs/eras';
import { TELA_STYLE_ERAS } from '../services/telaStyleEraLibrary';
import { layoutTextLines, wrapLine } from '../services/tela/telaText';
import { text } from '../services/tela/templateKit';
import { FONTS, fontKeysInStacks, fontCss } from '../services/tela/telaFonts';

// Collections whose rebuild has landed must be lint-clean; the rest are tracked
// here so the bar rises as each family is redesigned.
const STRICT = new Set(['DESIGN_HISTORY', 'LOWER_THIRD']);

describe('Tela template gallery', () => {
  it('has every collection represented and unique ids', () => {
    const ids = new Set<string>();
    for (const t of TELA_TEMPLATE_GALLERY) { assert.ok(!ids.has(t.id), `duplicate ${t.id}`); ids.add(t.id); assert.ok(t.pages.length >= 1, t.id); assert.ok(t.lesson.interestTag, t.id); }
    for (const c of GALLERY_COLLECTIONS) assert.ok(TELA_TEMPLATE_GALLERY.some(t => t.collection === c.id), c.id);
  });

  it('every hand-designed era builds two lint-clean pages with a real lesson', () => {
    const designed = TELA_STYLE_ERAS.filter(e => ERA_DESIGNS[e.id]);
    assert.ok(designed.length >= 4, 'no era designs registered');
    for (const t of TELA_TEMPLATE_GALLERY.filter(t => t.collection === 'DESIGN_HISTORY' && ERA_DESIGNS[t.family || ''])) {
      assert.equal(t.pages.length, 2, `${t.name}: opener + interior`);
      t.pages.forEach((p, i) => {
        const objects = p.build();
        const errors = lintPage(objects, t.width, t.height, { requireHeadline: i === 0 }).filter(x => x.severity === 'error');
        assert.deepEqual(errors.map(e => e.message), [], `${t.name} / ${p.label}`);
      });
      assert.ok(t.lesson.history.length > 120 && t.lesson.principle.length > 40 && t.lesson.tryThis.length > 20, `${t.name}: lesson too thin`);
    }
  });

  it('strict collections never share geometry (no palette swaps)', () => {
    const seen = new Map<string, string>();
    for (const t of TELA_TEMPLATE_GALLERY.filter(t => STRICT.has(t.collection) && (t.collection !== 'DESIGN_HISTORY' || ERA_DESIGNS[t.family || '']))) {
      t.pages.forEach(p => { const sig = pageSignature(p.build()); const prev = seen.get(sig); assert.ok(!prev || prev.startsWith(t.id), `${t.name} duplicates ${prev}`); seen.set(sig, `${t.id}/${p.label}`); });
    }
  });

  it('templates only use fonts from the curated palette', () => {
    for (const t of TELA_TEMPLATE_GALLERY.filter(t => STRICT.has(t.collection) && (t.collection !== 'DESIGN_HISTORY' || ERA_DESIGNS[t.family || '']))) {
      const objects = t.pages[0].build();
      for (const o of objects) if (o.kind === 'TEXT') assert.ok(fontKeysInStacks([o.fontFamily]).length, `${t.name}: ${o.fontFamily}`);
    }
  });
});

describe('Text layout', () => {
  it('wraps to the box and honours explicit breaks', () => {
    const o = text(0, 0, 200, 'one two three four five six seven eight nine ten eleven twelve', { size: 16, font: 'inter' });
    const lines = layoutTextLines(o);
    assert.ok(lines.length >= 3);
    assert.ok(o.h > 16 * 2);
    assert.deepEqual(layoutTextLines({ ...o, wrap: false, text: 'a\nb' }), ['a', 'b']);
    assert.deepEqual(wrapLine('', 100, o), ['']);
  });
  it('applies case transforms and font keys resolve to a family + fallback', () => {
    assert.deepEqual(layoutTextLines(text(0, 0, 400, 'hello world', { size: 12, transform: 'uppercase', wrap: false })), ['HELLO WORLD']);
    for (const k of Object.keys(FONTS)) assert.match(fontCss(k), /^".+", .+/);
  });
});
