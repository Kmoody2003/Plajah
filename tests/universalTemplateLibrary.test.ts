import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createTemplateLibrary, TEMPLATE_LIBRARY_STORAGE_KEY, decodeCustomLibrary } from '../services/tela/universalTemplateLibrary';
import { TELA_TEMPLATE_GALLERY } from '../services/tela/telaTemplateRegistry';
import { PROMO_SUITES } from '../services/chora/promoTypes';

describe('universal template library', () => {
  const library = createTemplateLibrary();
  it('preserves every original and protects nested manifests', () => {
    assert.equal(library.originals.length, TELA_TEMPLATE_GALLERY.length + PROMO_SUITES.length);
    assert.ok(Object.isFrozen(library.originals));
    assert.ok(Object.isFrozen(library.originals[0].origin));
    assert.throws(() => library.deleteCustom(library.originals[0].id), /cannot be deleted/);
  });
  it('creates independent editable documents', () => {
    const id = library.originals[0].id;
    const a = library.createDocument(id, 'owner', 'a');
    a.frames[0].label = 'changed';
    const b = library.createDocument(id, 'owner', 'b');
    assert.notEqual(b.frames[0].label, 'changed');
    assert.equal(b.id, 'b');
    assert.notEqual(a.devices, b.devices);
  });
  it('persists custom copies and deletion through reload without touching originals', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } };
    const first = createTemplateLibrary({ storage });
    first.saveCustom({ id: 'custom:test', name: 'My design', origin: { kind: 'custom', sourceId: first.originals[0].id, sourceRevision: 1 }, document: first.createDocument(first.originals[0].id, 'owner', 'doc'), updatedAt: 1 });
    const second = createTemplateLibrary({ storage });
    assert.equal(second.listCustoms()[0].name, 'My design');
    const exposed = second.listCustoms(); exposed[0].name = 'mutation';
    assert.equal(second.listCustoms()[0].name, 'My design');
    second.deleteCustom('custom:test');
    assert.equal(createTemplateLibrary({ storage }).listCustoms().length, 0);
    assert.equal(second.originals.length, first.originals.length);
  });
  it('ignores injected builtins and rejects unknown versions without overwriting data', () => {
    assert.deepEqual(decodeCustomLibrary(JSON.stringify({ schemaVersion: 1, customs: [{ origin: { kind: 'builtin' }, id: 'builtin:evil' }] })), []);
    const raw = JSON.stringify({ schemaVersion: 900, customs: [] });
    let saved = raw;
    const broken = createTemplateLibrary({ storage: { getItem: () => saved, setItem: (_k, v) => { saved = v; } } });
    assert.match(broken.loadError!, /preserved/);
    assert.throws(() => broken.deleteCustom('custom:x'));
    assert.equal(saved, raw);
    assert.ok(TEMPLATE_LIBRARY_STORAGE_KEY.includes('v1'));
  });
  it('keeps review entries visible but prevents preset activation', () => {
    const draft = { ...TELA_TEMPLATE_GALLERY[0], id: 'review-example' };
    const review = createTemplateLibrary({ reviewTemplates: [draft], reviewPromos: [{ id: 'review-promo', name: 'Review promo' }] });
    assert.equal(review.originals.filter(e => e.stage === 'review').length, 2);
    assert.throws(() => review.createDocument('builtin:tela:review-example', 'owner', 'doc'), /awaiting review/);
  });
});
