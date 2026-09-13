import test from 'node:test';
import assert from 'node:assert/strict';
import { ARIA_ART_COUNCIL_METHOD, ARIA_ART_DIRECTOR_COUNCIL, ARIA_CREATIVE_ROLES, resolveAriaCreativeRole } from '../services/aria/ariaCreativeRoles';
import { TELA_CREATIVE_TEMPLATES, instantiateTelaTemplate } from '../services/telaCreativeEngine';

test('Aria selects the right expert lens without splitting her identity', () => {
  assert.equal(resolveAriaCreativeRole('tela-writer', 'writing').id, 'ART_DIRECTOR');
  assert.equal(resolveAriaCreativeRole('script-studio', 'writing').id, 'WRITING_DIRECTOR');
  assert.equal(resolveAriaCreativeRole('melos-beats', 'music').id, 'MUSIC_DIRECTOR');
  assert.match(ARIA_CREATIVE_ROLES.ART_DIRECTOR.promise, /final say/i);
});

test('Aria art direction uses six conflicting lenses and preserves human source',()=>{
  assert.equal(ARIA_ART_DIRECTOR_COUNCIL.length,6);
  assert.equal(new Set(ARIA_ART_DIRECTOR_COUNCIL.map(l=>l.medium)).size,6);
  assert.match(ARIA_ART_COUNCIL_METHOD,/human source trace/i);
  assert.match(ARIA_ART_COUNCIL_METHOD,/without averaging/i);
});

test('Tela includes a substantial editable document-template collection', () => {
  const documents = TELA_CREATIVE_TEMPLATES.filter(template => template.category === 'DOCUMENT');
  assert.ok(TELA_CREATIVE_TEMPLATES.length >= 50);
  assert.ok(documents.length >= 12);
  for (const template of documents) {
    const objects = instantiateTelaTemplate(template);
    assert.ok(objects.length >= 4);
    assert.equal(objects[0].w, template.width);
    assert.equal(objects[0].h, template.height);
  }
});
