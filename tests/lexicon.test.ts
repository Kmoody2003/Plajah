// Lorea Lexicon — parser, meaning engine, Grose, handler. Offline fixtures only.
// Run: npx tsx --test tests/lexicon.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTpl, renderInline, segText, parsePage, parseEtymology, parseTranslations } from '../services/lexicon/wikitext';
import { kinshipFor, meaningPrism, compareWords, overlap, FORM_OF } from '../services/lexicon/compare';
import { parseGrose } from '../services/lexicon/engine';
import { handleLexicon, memoryStores, wiktionarySlang, todayWord } from '../services/lexicon/handler';
import type { WordEntry } from '../services/lexicon/types';

const PAGE = `==English==
{{wikipedia}}

===Etymology===
{{root|en|ine-pro|*gʰebʰ-}}
From {{inh|en|enm|yifte}}, partly from {{inh|en|ang|ġift}} and {{der|en|non|gipt|t=gift, present}}; both from {{inh|en|gem-pro|*giftiz|t=gift}}. Cognate with {{cog|de|Gift|t=poison}}, {{cog|is|gift|t=gift}}, {{cog|da,sv|gift|t=poison}}.

===Pronunciation===
* {{IPA|en|/ɡɪft/}}
* {{audio|en|en-us-gift.ogg|a=US}}
* {{rhymes|en|ɪft|s=1}}

===Noun===
{{en-noun}}

# Something [[give|given]] to another voluntarily, without [[charge]].
#: {{ux|en|She gave him a '''gift'''.}}
#: {{syn|en|present|donation}}
# A [[talent]] or natural [[ability]].
# {{lb|en|slang|US}} Something very easy; a [[cinch]].
# {{lb|en|obsolete}} A bribe.<ref>Some ref</ref>

====Synonyms====
* {{l|en|present}}, {{l|en|offering}}

====Translations====
{{trans-top|something given voluntarily}}
* German: {{t+|de|Geschenk|n}}, {{t+|de|Gabe|f}}
* Spanish: {{t+|es|regalo|m}}
* French: {{t+|fr|cadeau|m}}
{{trans-bottom}}
{{trans-top|talent or natural ability}}
* German: {{t+|de|Begabung|f}}
* Spanish: {{t+|es|don|m}}
* French: {{t+|fr|don|m}}
{{trans-bottom}}
{{checktrans-top}}
* Klingon: {{t|tlh|xyz}}
{{trans-bottom}}

==German==

===Etymology===
From {{inh|de|gmh|gift}}, from {{inh|de|goh|gift}}, from {{inh|de|gem-pro|*giftiz}}.

===Noun===
{{de-noun|n|Giftes|Gifte}}

# [[poison]], [[venom]], [[toxin]]
# {{lb|de|obsolete}} [[gift]]; something given

==Spanish==

===Noun===
# {{inflection of|es|gifto||p}}
`;

const entryOf = (wikitext: string, title = 'gift'): WordEntry => ({ word: title, title, langs: parsePage(wikitext).langs, source: { wiktionaryUrl: '', fetchedAt: 0 } });

test('template parsing keeps named and positional args', () => {
  const t = parseTpl('{{inh|en|gem-pro|*giftiz|t=gift}}');
  assert.equal(t.name, 'inh');
  assert.deepEqual(t.pos, ['en', 'gem-pro', '*giftiz']);
  assert.equal(t.named.t, 'gift');
  const nested = parseTpl('{{l|en|[[a|b]]|t={{m|en|x}}}}');
  assert.equal(nested.pos[1], '[[a|b]]');
});

test('inline rendering turns templates into readable, linkable text', () => {
  const segs = renderInline('From {{inh|en|enm|yifte}}, cognate with {{cog|de|Gift|t=poison}}. See [[give|given]].', 'en');
  assert.equal(segText(segs), 'From Middle English yifte, cognate with German Gift (“poison”). See given.');
  assert.ok(segs.some(s => s.w === 'Gift' && s.lang === 'de'));
  assert.ok(segs.some(s => s.w === 'give' && !s.lang));
  // {{c|…}} topic categories vanish but {{cog|…}} survives (prefix-matching regression).
  assert.equal(segText(renderInline('{{c|en|Gifts}}{{cog|nl|eens}}')), 'Dutch eens');
  // Unknown templates keep a word argument even when it is three letters ("{{U|man}}" in cove).
  assert.equal(segText(renderInline('{{U|man}}; [[fellow#Noun|fellow]].')), 'man; fellow.');
});

test('page parse: senses, labels, examples, pronunciation, synonyms', () => {
  const e = entryOf(PAGE);
  assert.deepEqual(e.langs.map(l => l.lang), ['en', 'de', 'es']); // inflection-only sections are kept (kinship skips them)
  const en = e.langs[0];
  const senses = en.etymologies[0].pos[0].senses;
  assert.equal(senses.length, 4);
  assert.equal(segText(senses[0].text), 'Something given to another voluntarily, without charge.');
  assert.deepEqual(senses[0].examples, ['She gave him a gift.']);
  assert.deepEqual(senses[0].synonyms, ['present', 'donation']);
  assert.deepEqual(senses[2].labels, ['slang', 'US']);
  assert.equal(segText(senses[3].text), 'A bribe.'); // <ref> removed
  assert.deepEqual(en.pronunciation?.ipa, ['/ɡɪft/']);
  assert.match(en.pronunciation!.audio[0].url, /Special:FilePath\/en-us-gift\.ogg$/);
  assert.equal(en.pronunciation?.rhymes, '-ɪft');
  assert.deepEqual(en.synonyms, ['present', 'offering']);
});

test('etymology: ancestor chain, roots, cognates', () => {
  const ety = parsePage(PAGE).langs[0].etymologies[0].etymology!;
  assert.deepEqual(ety.chain.map(c => `${c.lang}:${c.word}`), ['enm:yifte', 'ang:ġift', 'non:gipt', 'gem-pro:*giftiz']);
  assert.deepEqual(ety.roots.map(r => r.word), ['*gʰebʰ-']);
  assert.deepEqual(ety.cognates.map(c => `${c.lang}:${c.word}=${c.gloss}`), ['de:Gift=poison', 'is:gift=gift', 'da:gift=poison', 'sv:gift=poison']);
  assert.ok(!segText(ety.prose).includes('root'));
});

test('translations: grouped by sense, unchecked tables skipped', () => {
  const en = parsePage(PAGE).langs[0];
  assert.equal(en.translations.length, 2);
  assert.equal(en.translations[0].gloss, 'something given voluntarily');
  assert.deepEqual(en.translations[0].items.filter(i => i.lang === 'de').map(i => `${i.word}/${i.gender}`), ['Geschenk/n', 'Gabe/f']);
  assert.ok(!en.translations.flatMap(t => t.items).some(i => i.lang === 'tlh'));
  assert.ok(parseTranslations('{{see translation subpage|Noun}}').subpage);
  // Link markup inside a translation is flattened (Japanese phrases are often built from links).
  const ja = parseTranslations('{{trans-top|to pour water}}\n* Japanese: {{t|ja|[[水]][[を]][[やる]]|tr=mizu o yaru}}\n{{trans-bottom}}');
  assert.equal(ja.senses[0].items[0].word, '水をやる');
});

test('kinship: German Gift drifted, Icelandic gift same, false friends without shared origin', () => {
  const k = kinshipFor(entryOf(PAGE));
  const de = k.find(v => v.lang === 'de')!;
  assert.equal(de.kinship, 'drifted');
  assert.equal(de.sharedOrigin, true);
  assert.equal(k.find(v => v.lang === 'is')!.kinship, 'same');
  // Same spelling, different history → false friend.
  const once = entryOf(`==English==\n===Etymology===\nFrom {{inh|en|enm|ones}}.\n===Adverb===\n# One and only one [[time]].\n==Spanish==\n===Etymology===\nFrom {{inh|es|la|ūndecim}}.\n===Numeral===\n# [[eleven]]\n`, 'once');
  const es = kinshipFor(once).find(v => v.lang === 'es')!;
  assert.equal(es.kinship, 'false-friend');
  assert.equal(es.sharedOrigin, false);
});

test('meaning prism: splits vs mirrors', () => {
  const en = parsePage(PAGE).langs[0];
  const p = meaningPrism(en, ['de', 'es', 'fr', 'ja']);
  assert.equal(p.senses.length, 2);
  assert.deepEqual(p.rows.map(r => r.lang), ['de', 'es', 'fr']); // no Japanese data → no row
  assert.equal(p.rows.find(r => r.lang === 'es')!.shape, 'splits'); // regalo vs don
  const mirror = parsePage(PAGE.replace('{{t+|fr|cadeau|m}}', '{{t+|fr|don|m}}')).langs[0];
  assert.equal(meaningPrism(mirror, ['fr']).rows[0].shape, 'mirrors');
});

test('compare two words aligns senses', () => {
  const a = entryOf(PAGE);
  const b = entryOf(`==English==\n===Noun===\n# Something given to another, a [[gift]].\n# A [[present]] moment in time.\n`, 'present');
  const r = compareWords(a, 'en', b, 'en');
  assert.ok(['same', 'shifted'].includes(r.verdict), `verdict ${r.verdict} ${r.score}`);
  assert.match(r.pairs[0].a, /^Something given/);
  assert.match(r.pairs[0].b, /^Something given/);
  assert.ok(r.pairs[0].overlap >= 0.5, `top ${r.pairs[0].overlap}`);
  assert.ok(r.pairs[0].overlap >= r.pairs[r.pairs.length - 1].overlap);
});

test('compare: translation equivalents meet, same-spelling false friends do not', () => {
  const gift = entryOf(PAGE.replace('# A [[talent]]', '# To give as a [[gift]].\n# A [[talent]]'));
  const regalo = entryOf(`==Spanish==\n===Etymology===\nFrom {{bor|es|fro|regale}}.\n===Noun===\n# [[present]], [[gift]]\n`, 'regalo');
  assert.equal(compareWords(gift, 'en', regalo, 'es').verdict, 'same');
  const r = compareWords(gift, 'en', gift, 'de');
  assert.equal(r.b.lang, 'de');
  assert.equal(r.verdict, 'drifted'); // shares *giftiz, means poison
  assert.match(r.summary, /old sense still remembers/); // …but the obsolete sense "gift; something given" survives
});

test('overlap and form-of helpers', () => {
  assert.ok(overlap('poison, venom', 'Something given to another voluntarily') < 0.1);
  assert.ok(overlap('a talent', 'A talent or natural ability.') > 0.5);
  assert.ok(FORM_OF.test('Plural of oncia'));
  assert.ok(FORM_OF.test('Inflection of gifto'));
  assert.ok(!FORM_OF.test('A small present given at parting'));
});

test('Grose 1811 parser reads headwords and alternates', () => {
  const txt = `Preface blah\n\nABBESS, or LADY ABBESS, A bawd, the mistress of a\n  brothel.\n\nABRAM. Naked. CANT.\n\nBUBBLE AND SQUEAK. Beef and cabbage fried together.\n\n*** END OF THE PROJECT GUTENBERG EBOOK\n\nZZZ. junk`;
  const m = parseGrose(txt);
  assert.equal(m.get('abbess')?.[0].meaning, 'A bawd, the mistress of a brothel.');
  assert.ok(m.has('lady abbess'));
  assert.equal(m.get('bubble and squeak')?.[0].meaning, 'Beef and cabbage fried together.');
  assert.ok(!m.has('zzz'));
});

test('wiktionary slang senses are surfaced and flagged', () => {
  const rows = wiktionarySlang(entryOf(PAGE));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].region, 'US');
  assert.equal(rows[0].explicit, false);
});

test('handler: validation, auth wall, community slang, journal', async () => {
  const stores = memoryStores();
  const ctx = { ...stores, auth: async (h?: string) => (h === 'Bearer ok' ? { uid: 'u1', name: 'Ada' } : null) };
  assert.equal((await handleLexicon({ method: 'GET', path: '/entry', query: { w: '<script>' } }, ctx)).status, 400);
  assert.equal((await handleLexicon({ method: 'POST', path: '/slang', query: {}, body: { word: 'bussin', meaning: 'really good' } }, ctx)).status, 401);
  const add = await handleLexicon({ method: 'POST', path: '/slang', query: {}, body: { word: 'Bussin', meaning: 'Really good, esp. food', region: 'US' }, authorization: 'Bearer ok' }, ctx);
  assert.equal(add.status, 200);
  const id = (add.body as any).id;
  assert.equal((await handleLexicon({ method: 'POST', path: '/slang/vote', query: {}, body: { id, dir: 1 }, authorization: 'Bearer ok' }, ctx)).status, 200);
  assert.equal((await handleLexicon({ method: 'POST', path: '/slang/vote', query: {}, body: { id, dir: 1 }, authorization: 'Bearer ok' }, ctx)).status, 409);
  const listed = await stores.slang.list('bussin');
  assert.equal(listed[0].votes, 1);
  assert.equal(listed[0].byName, 'Ada');
  await handleLexicon({ method: 'POST', path: '/journal', query: {}, body: { word: 'gift' }, authorization: 'Bearer ok' }, ctx);
  const j = await handleLexicon({ method: 'GET', path: '/journal', query: {}, authorization: 'Bearer ok' }, ctx);
  assert.deepEqual((j.body as any[]).map(r => r.word), ['gift']);
});

test('word of the day is stable for a date', () => {
  assert.equal(todayWord(new Date('2026-11-10T03:00:00Z')), todayWord(new Date('2026-11-10T22:00:00Z')));
});

test('etymology attestation note is extracted', () => {
  const e = parseEtymology('From {{bor|en|fr|quarantaine}}. First attested in 1617.', 'en');
  assert.equal(e.attested, 'First attested in 1617');
  assert.equal(e.chain[0].relation, 'borrowed');
});

test('engine: a throttled Wiktionary is an error, never a cached "not found"', async () => {
  const { getEntry } = await import('../services/lexicon/engine');
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response(JSON.stringify({ error: { code: 'ratelimited' } }), { status: 200 }); }) as typeof fetch;
  try {
    await assert.rejects(() => getEntry('throttledword'));
    globalThis.fetch = (async () => new Response(JSON.stringify({ parse: { title: 'throttledword', revid: 1, wikitext: '==English==\n===Noun===\n# A [[test]].\n' } }), { status: 200 })) as typeof fetch;
    const e = await getEntry('throttledword');
    assert.equal(e?.title, 'throttledword'); // the earlier failure was not remembered
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { code: 'missingtitle' } }), { status: 200 })) as typeof fetch;
    assert.equal(await getEntry('qqzzxxnoword'), null);
  } finally { globalThis.fetch = real; }
  assert.ok(calls >= 2, 'retried once before failing');
});
