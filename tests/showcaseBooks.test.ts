// The six showcase books: structure, character consistency, reading level per age band, no cross-book leaks, licence + disclosure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOWCASE_BOOKS } from '../data/showcase';
import { measure, BAND_LIMITS, ownedNames, sentences } from '../services/showcase/storyMetrics';
import { TELA_PUBLICATION_TEMPLATES } from '../services/telaPublicationTemplates';

test('six books, each a different age range, ordered youngest to oldest, each with its own template', () => {
  assert.equal(SHOWCASE_BOOKS.length, 6);
  const mins = SHOWCASE_BOOKS.map(b => b.ageMin);
  assert.deepEqual([...mins].sort((a, b) => a - b), mins, 'books must run youngest to oldest');
  assert.equal(new Set(SHOWCASE_BOOKS.map(b => `${b.ageMin}-${b.ageMax}`)).size, 6, 'every book needs a different age range');
  assert.equal(new Set(SHOWCASE_BOOKS.map(b => b.templateId)).size, 6);
  assert.equal(new Set(SHOWCASE_BOOKS.map(b => b.band)).size, 6, 'six distinct reading bands');
  const ids = new Set(TELA_PUBLICATION_TEMPLATES.map(t => t.id));
  for (const b of SHOWCASE_BOOKS) assert.ok(ids.has(b.templateId), `${b.id}: template ${b.templateId} is not registered`);
});

for (const b of SHOWCASE_BOOKS) {
  const lim = BAND_LIMITS[b.band];
  const m = measure(b);

  test(`${b.id}: structure (cover first, back last, numbered in order, real art notes)`, () => {
    assert.equal(b.spreads[0].beat, 'cover');
    assert.equal(b.spreads[b.spreads.length - 1].beat, 'back');
    b.spreads.forEach((s, i) => { assert.equal(s.n, i + 1); assert.ok(s.art.length > 20, `${b.id} spread ${s.n} needs an art note`); });
    const beats = new Set(b.spreads.map(s => s.beat));
    assert.ok(beats.size >= 5, `${b.id} needs at least 5 different layout beats, has ${beats.size}`);
    for (let i = 1; i < b.spreads.length - 1; i++) assert.ok(b.spreads[i].beat !== b.spreads[i - 1].beat || b.spreads[i].beat === 'hero', `${b.id}: spreads ${i} and ${i + 1} repeat the same beat`);
    assert.ok(b.spreads.some(s => s.beat === 'quiet'), `${b.id} needs a quiet page`);
    assert.ok(b.spreads.some(s => s.beat === 'reveal'), `${b.id} needs a scale-shock reveal`);
  });

  test(`${b.id}: characters are consistent (locked looks, referenced ids exist, hero is named in the text)`, () => {
    const ids = new Set(b.characters.map(c => c.id));
    for (const s of b.spreads) for (const c of s.characters) assert.ok(ids.has(c), `${b.id} spread ${s.n} uses unknown character ${c}`);
    for (const c of b.characters) {
      assert.ok(c.look.length > 60, `${c.name} needs a locked visual descriptor`);
      assert.ok(c.palette.length >= 2 && c.palette.every(h => /^#[0-9A-Fa-f]{6}$/.test(h)), `${c.name} palette must be hex`);
      assert.ok(c.arc && c.signature && c.voice, `${c.name} needs voice, signature and arc`);
    }
    const text = b.spreads.map(s => s.text).join('\n');
    const hero = b.characters.find(c => c.role === 'hero')!;
    const first = hero.name.replace(/^The\s+/, '');
    assert.ok((text.match(new RegExp(first, 'g')) ?? []).length >= 2, `${b.id}: the hero ${hero.name} should be named in the story at least twice`);
    for (const c of b.characters.filter(c => c.role === 'hero' || c.role === 'companion')) {
      const n = b.spreads.filter(s => s.characters.includes(c.id)).length;
      assert.ok(n >= 3, `${b.id}: ${c.name} appears on only ${n} pages`);
    }
  });

  test(`${b.id}: reading level fits ages ${b.ageMin}-${b.ageMax} (${b.band})`, () => {
    assert.ok(m.storyWords >= lim.minWords && m.storyWords <= lim.maxWords, `${b.id}: ${m.storyWords} story words, band allows ${lim.minWords}-${lim.maxWords}`);
    assert.ok(m.avgSentenceWords <= lim.maxAvgSentence, `${b.id}: average sentence ${m.avgSentenceWords} words, max ${lim.maxAvgSentence}`);
    assert.ok(m.longestSentenceWords <= lim.maxLongest, `${b.id}: longest sentence ${m.longestSentenceWords} words, max ${lim.maxLongest}`);
    assert.ok(m.fkGrade <= lim.maxFk, `${b.id}: Flesch-Kincaid grade ${m.fkGrade}, max ${lim.maxFk}`);
    assert.ok(m.maxWordsOnASpread <= lim.maxPerSpread, `${b.id}: a spread has ${m.maxWordsOnASpread} words, max ${lim.maxPerSpread}`);
  });

  test(`${b.id}: refrain recurs and the book is licensed + disclosed`, () => {
    if (b.refrain) assert.ok(m.refrainCount >= 2, `${b.id}: refrain "${b.refrain}" appears ${m.refrainCount} time(s)`);
    assert.equal(b.license, 'CC_BY');
    assert.match(b.aiDisclosure, /AI/);
    assert.ok(b.remixIdeas.length >= 3 && b.discussion.length >= 3);
  });

  test(`${b.id}: no other book's character names leak in`, () => {
    const mine = b.spreads.map(s => s.text).join('\n');
    const ownNames = new Set(ownedNames(b).map(x => x.toLowerCase()));
    for (const other of SHOWCASE_BOOKS.filter(o => o.id !== b.id)) {
      for (const n of ownedNames(other)) {
        if (ownNames.has(n.toLowerCase())) continue;
        assert.doesNotMatch(mine, new RegExp(`\\b${n}\\b`), `${b.id} mentions "${n}", a character from ${other.id}`);
      }
    }
  });
}

test('sentence splitter keeps verse-like lines together and splits on terminal punctuation', () => {
  assert.equal(sentences('Hush.\nThen the sun began to go. Everything went still.').length, 3);
  assert.equal(sentences('A moth!\nA tiny, shivery moth.').length, 2);
});
