import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { ORIGINAL_EDITIONS, linkedOriginalVerses, originalLemmaKeys, originalOccurrenceNavigation, originalText, searchOriginalIndex, type OriginalBook, type OriginalIndex } from '../services/lectioOriginals';
import { decodeHebrewMorphology, decodeGreekMorphology } from '../services/lectioMorphology';
const read = (corpus: string, file: string) => JSON.parse(fs.readFileSync(`public/sacred/${corpus}/${file}`, 'utf8'));
const ref = (book: number, chapter: number, verse: number) => ({ book, bookName: 'Test', chapter, verse });
test('Hebrew and Aramaic grammar decode their own stems and attached components', () => {
  const start = decodeHebrewMorphology('HR/Ncfsa');
  assert.deepEqual(start.components, [['preposition'], ['noun', 'common noun', 'feminine', 'singular', 'absolute state']]);
  assert.equal(start.complete, true);
  assert.deepEqual(decodeHebrewMorphology('HVqp3ms').components[0], ['verb', 'qal', 'perfect (qatal)', 'third person', 'masculine', 'singular']);
  assert.deepEqual(decodeHebrewMorphology('AVqv2ms').components[0], ['verb', 'peal', 'imperative', 'second person', 'masculine', 'singular']);
  assert.deepEqual(decodeHebrewMorphology('HVqrmsc').components[0], ['verb', 'qal', 'active participle', 'masculine', 'singular', 'construct state']);
  assert.equal(decodeHebrewMorphology('HVZa3ms').complete, false);
  assert.equal(decodeHebrewMorphology('robinson:N-NSM').complete, false);
});
test('Greek grammar preserves comma slots and exposes unsupported values', () => {
  assert.deepEqual(decodeGreekMorphology('Gr,V,IIA3,,S,').components[0], ['verb', 'indicative mood', 'imperfect', 'active voice', 'third person', 'singular']);
  assert.deepEqual(decodeGreekMorphology('Gr,N,,,,,DFS,').components[0], ['noun', 'dative case', 'feminine', 'singular']);
  assert.deepEqual(decodeGreekMorphology('Gr,EA,,,,NMS,').components[0], ['determiner', 'article', 'nominative case', 'masculine', 'singular']);
  assert.equal(decodeGreekMorphology('Gr,N,,,,,NFSI').complete, false);
  assert.equal(decodeGreekMorphology('HVqp3ms').complete, false);
});
test('source mappings handle shifts, Psalm superscriptions and partial verses', () => {
  const genesis = read('oshb', 'book-1.json') as OriginalBook;
  assert.equal(linkedOriginalVerses(genesis, ref(1, 32, 1))[0].verse.sourceRef, 'Gen.32.2');
  assert.equal(linkedOriginalVerses(genesis, ref(1, 31, 55))[0].verse.sourceRef, 'Gen.32.1');
  assert.deepEqual(originalOccurrenceNavigation(genesis, [1, 32, 2, 0]), { book: 1, bookName: 'Genesis', chapter: 32, verse: 1 });
  const psalms = read('oshb', 'book-19.json') as OriginalBook;
  assert.equal(linkedOriginalVerses(psalms, ref(19, 3, 1))[0].verse.sourceRef, 'Ps.3.2');
  const isaiah = read('oshb', 'book-23.json') as OriginalBook;
  const partial = linkedOriginalVerses(isaiah, ref(23, 64, 1))[0];
  assert.equal(partial.link.type, 'partial'); assert.equal(partial.verse.sourceRef, 'Isa.63.19');
  assert.equal(originalOccurrenceNavigation(isaiah, [23, 63, 19, 0]), null);
  assert.deepEqual(linkedOriginalVerses(genesis, ref(19, 3, 1)), []);
});
test('variants and Greek bracketed source notes are retained separately', () => {
  const samuel = read('oshb', 'book-9.json') as OriginalBook;
  const verse = Object.values(samuel.verses).find(v => v.variants?.length)!;
  assert.ok(verse.tokens.some(t => t.reading === 'x-ketiv'));
  assert.ok(verse.variants!.some(v => v.type === 'x-qere'));
  const john = read('greek', 'book-43.json') as OriginalBook;
  assert.equal(john.verses['5:4'].bracketed, true);
  assert.match(john.verses['5:4'].notes!.join(' '), /ancient manuscripts/);
  assert.match(originalText(john.verses['5:4']), /^\[/);
  assert.match(originalText(john.verses['5:4']), /\]/);
  assert.equal(john.verses['1:1'].tokens.filter(t => t.lemma === 'λόγος').length, 3);
  assert.equal(john.verses['1:1'].tokens[4].sourceStrong, 'G30560');
});
test('Greek verse-division exceptions avoid same-number mistakes and incomplete navigation', () => {
  const corinthians = read('greek', 'book-47.json') as OriginalBook;
  assert.equal(linkedOriginalVerses(corinthians, ref(47, 13, 13))[0].verse.sourceRef, '2CO.13.12');
  assert.equal(linkedOriginalVerses(corinthians, ref(47, 13, 14))[0].verse.sourceRef, '2CO.13.13');
  assert.equal(originalOccurrenceNavigation(corinthians, [47, 13, 12, 0]), null);
  assert.equal(originalOccurrenceNavigation(corinthians, [47, 13, 13, 0])?.verse, 14);
  const john = read('greek', 'book-64.json') as OriginalBook;
  assert.deepEqual(linkedOriginalVerses(john, ref(64, 1, 14)).map(item => item.link.locator), ['1:14', '1:15']);
  assert.equal(originalOccurrenceNavigation(john, [64, 1, 15, 0]), null);
  const revelation = read('greek', 'book-66.json') as OriginalBook;
  assert.deepEqual(linkedOriginalVerses(revelation, ref(66, 13, 1)).map(item => item.link.locator), ['12:18', '13:1']);
  assert.equal(originalOccurrenceNavigation(revelation, [66, 12, 18, 0]), null);
});
test('complete original indexes agree with every main-text word and pinned source checksums', () => {
  for (const corpus of ['oshb', 'greek'] as const) {
    const metadata = read(corpus, 'metadata.json'), index = read(corpus, 'search-index.json') as OriginalIndex;
    assert.equal(metadata.snapshot, ORIGINAL_EDITIONS[corpus].revision);
    assert.equal(metadata.files.length, corpus === 'oshb' ? 39 : 27);
    const expectedLemmas: Record<string, string[]> = {}, expectedMorph: Record<string, string[]> = {};
    let verseCount = 0, wordCount = 0;
    for (const file of metadata.files) {
      const bytes = fs.readFileSync(`public/sacred/${corpus}/${file.file}`);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
      assert.equal(createHash('sha256').update(fs.readFileSync(`public/sacred/${corpus}/source/${file.sourceFile}`)).digest('hex'), file.sourceSha256);
      const book = JSON.parse(bytes.toString()) as OriginalBook;
      const source = fs.readFileSync(`public/sacred/${corpus}/source/${file.sourceFile}`, 'utf8');
      const mainSource = corpus === 'oshb' ? source.replace(/<note\b[^>]*>[\s\S]*?<\/note>/g, '') : source.replace(/\\f\s+[\s\S]*?\\f\*/g, '');
      const sourceWords = [...mainSource.matchAll(corpus === 'oshb' ? /<w\s/g : /\\w\s/g)].length;
      const derivedWords = Object.values(book.verses).reduce((count, verse) => count + verse.tokens.filter(t => !t.punctuation).length, 0);
      assert.equal(derivedWords, sourceWords, `${corpus}/${file.sourceFile} main words`);
      verseCount += Object.keys(book.verses).length;
      for (const [locator, verse] of Object.entries(book.verses)) for (const [position, token] of verse.tokens.entries()) {
        if (token.punctuation) continue;
        wordCount++;
        const key = [book.book, ...locator.split(':').map(Number), position].join('/');
        for (const lemma of originalLemmaKeys(token, corpus)) (expectedLemmas[lemma] ??= []).push(key);
        if (token.morph) (expectedMorph[token.morph] ??= []).push(key);
      }
      for (const links of Object.values(book.links)) for (const link of links) assert.ok(book.verses[link.locator]);
    }
    assert.equal(verseCount, corpus === 'oshb' ? 23213 : 7958); assert.equal(wordCount, corpus === 'oshb' ? 305507 : 137990);
    assert.equal(verseCount, metadata.verses); assert.equal(wordCount, metadata.words);
    for (const [lemma, rows] of Object.entries(index.lemmas)) assert.deepEqual(rows.map(row => row.join('/')), expectedLemmas[lemma]);
    for (const [code, rows] of Object.entries(index.morphology)) assert.deepEqual(rows.map(row => row.join('/')), expectedMorph[code]);
    assert.equal(Object.keys(index.lemmas).length, Object.keys(expectedLemmas).length);
    assert.equal(Object.keys(index.morphology).length, Object.keys(expectedMorph).length);
    assert.equal(createHash('sha256').update(fs.readFileSync(`public/sacred/${corpus}/search-index.json`)).digest('hex'), metadata.indexFile.sha256);
  }
});
test('lemma and grammar intersect at the original token, with full uncapped results', () => {
  const index = read('greek', 'search-index.json') as OriginalIndex;
  const all = searchOriginalIndex(index, { lemma: 'λόγος' }); assert.ok(all.length > 100);
  const filtered = searchOriginalIndex(index, { lemma: 'λόγος', morph: 'Gr,N,,,,,NMS,', book: 43 });
  assert.equal(filtered.filter(row => row[1] === 1 && row[2] === 1).length, 3);
  assert.ok(filtered.every(row => row[0] === 43));
  assert.deepEqual(searchOriginalIndex(index, {}), []);
  assert.deepEqual(searchOriginalIndex(index, { lemma: '__proto__' }), []);
});
