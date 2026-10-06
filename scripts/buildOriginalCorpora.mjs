import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DOMParser } from '@xmldom/xmldom';
const names = 'Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov Eccl Song Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal'.split(' ');
const kjv = JSON.parse(await fs.readFile('public/sacred/bible-kjv.json', 'utf8'));
const parser = new DOMParser({ errorHandler: { warning: m => { throw Error(m); }, error: m => { throw Error(m); }, fatalError: m => { throw Error(m); } } });
const parse = xml => parser.parseFromString(xml, 'text/xml');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function write(root, file, value) { const bytes = JSON.stringify(value); await fs.writeFile(`${root}/${file}`, bytes); return { file, bytes: Buffer.byteLength(bytes), sha256: sha(bytes) }; }
const mapXml = await fs.readFile('public/sacred/oshb/source/VerseMap.xml', 'utf8');
const mappings = Array.from(parse(mapXml).getElementsByTagName('verse')).map(v => ({ source: v.getAttribute('wlc'), target: v.getAttribute('kjv'), type: v.getAttribute('type') }));
let hebrewWords = 0, hebrewVerses = 0, variantWords = 0;
const hebrewFiles = [];
for (const [i, osis] of names.entries()) {
  const root = 'public/sacred/oshb', xml = await fs.readFile(`${root}/source/${osis}.xml`, 'utf8'), doc = parse(xml);
  const verses = {}, links = {};
  const word = w => ({ text: w.textContent, id: w.getAttribute('id'), lemma: w.getAttribute('lemma') || '', morph: w.getAttribute('morph') || '', reading: w.getAttribute('type') || '', strong: [...new Set((w.getAttribute('lemma') || '').split('/').flatMap(p => { const m = p.match(/^(\d+)(?:\s+[a-z])?$/); return m && Number(m[1]) ? [`H${Number(m[1])}`] : []; }))] });
  for (const verse of Array.from(doc.getElementsByTagName('verse'))) {
    const ref = verse.getAttribute('osisID'); if (!ref) continue;
    if (!ref.startsWith(`${osis}.`)) throw Error(`Unexpected Hebrew ref ${ref}`);
    const locator = ref.split('.').slice(1).join(':'), tokens = [], variants = [];
    if (verses[locator]) throw Error(`Duplicate Hebrew ref ${ref}`);
    for (let child = verse.firstChild; child; child = child.nextSibling) {
      if (child.nodeName === 'w') { tokens.push(word(child)); hebrewWords++; }
      if (child.nodeName === 'seg') tokens.push({ text: child.textContent, punctuation: true });
      if (child.nodeName === 'note' && child.getAttribute('type') === 'variant') {
        for (const reading of Array.from(child.getElementsByTagName('rdg'))) {
          const words = Array.from(reading.getElementsByTagName('w')).map(word); variantWords += words.length;
          variants.push({ type: reading.getAttribute('type'), words });
        }
      }
    }
    verses[locator] = { sourceRef: ref, tokens, variants }; hebrewVerses++;
  }
  const localMap = mappings.filter(m => m.source.startsWith(`${osis}.`));
  for (const chapter of kjv.books[i].chapters) for (const verse of chapter.verses) {
    const target = `${osis}.${chapter.chapter}.${verse.verse}`, key = `${chapter.chapter}:${verse.verse}`;
    const explicit = localMap.filter(m => m.target.split('!')[0] === target);
    if (explicit.length) links[key] = explicit.map(m => ({ locator: m.source.split('!')[0].split('.').slice(1).join(':'), type: m.type, sourcePart: m.source.split('!')[1] || '', targetPart: m.target.split('!')[1] || '', basis: 'OSHB VerseMap.xml' }));
    else if (verses[key] && !localMap.some(m => m.source === target && m.type === 'full')) links[key] = [{ locator: key, type: localMap.some(m => m.source.split('!')[0] === target) ? 'partial' : 'same-number', basis: 'Same numbering except declared source-map differences' }];
    if (links[key]?.some(link => !verses[link.locator])) throw Error(`Invalid mapped source ${target}`);
  }
  hebrewFiles.push({ ...(await write(root, `book-${i + 1}.json`, { schema: 'plajah-original-book-v1', corpus: 'oshb', book: i + 1, verses, links })), verses: Object.keys(verses).length, sourceFile: `${osis}.xml`, sourceSha256: sha(xml) });
}
const hebrewSnapshot = JSON.parse(await fs.readFile('public/sacred/oshb/source/snapshot.json', 'utf8'));
await write('public/sacred/oshb', 'metadata.json', { schema: 'plajah-original-metadata-v1', corpus: 'oshb', title: 'Open Scriptures Hebrew Bible · WLC 4.20', attribution: 'Original work of the Open Scriptures Hebrew Bible available at https://github.com/openscriptures/morphhb', rights: 'WLC text public domain; lemma and morphology CC BY 4.0. Derived JSON retains original Unicode, word ids, source lemmas, grammar and variant readings.', license: 'https://creativecommons.org/licenses/by/4.0/', snapshot: hebrewSnapshot.commit, verses: hebrewVerses, words: hebrewWords, variantWords, mappingSha256: sha(mapXml), files: hebrewFiles });
const greekRoot = 'public/sacred/greek', greekSnapshot = JSON.parse(await fs.readFile(`${greekRoot}/source/snapshot.json`, 'utf8'));
const greekMapBytes = await fs.readFile(`${greekRoot}/verse-map.json`), greekMap = JSON.parse(greekMapBytes.toString());
const greekFiles = []; let greekVerses = 0, greekWords = 0;
for (const file of greekSnapshot.files.filter(f => f.endsWith('.usfm')).sort()) {
  const usfm = await fs.readFile(`${greekRoot}/source/${file}`, 'utf8'), book = Number(file.slice(0, 2)) - 1;
  const verses = {}, links = {}; let chapter = 0;
  const sourceBook = usfm.match(/\\id\s+([A-Z0-9]+)/)?.[1];
  if (!sourceBook) throw Error('Greek source book identifier missing.');
  // Parse structural markers first, then words and source footnotes per verse.
  for (const section of usfm.matchAll(/\\([cv])\s+(\d+)([\s\S]*?)(?=\\[cv]\s+\d+|$)/g)) {
    if (section[1] === 'c') { chapter = Number(section[2]); continue; }
    if (!chapter) throw Error('Greek verse without chapter.');
    const verse = Number(section[2]), locator = `${chapter}:${verse}`;
    if (verses[locator]) throw Error(`Duplicate Greek ref ${book}/${locator}`);
    const notes = [...section[3].matchAll(/\\f\s+[\s\S]*?\\ft\s+([\s\S]*?)\\f\*/g)].map(m => m[1].replace(/\\\w+\*?/g, '').trim());
    const body = section[3].replace(/\\f\s+[\s\S]*?\\f\*/g, ''), tokens = [];
    for (const w of body.matchAll(/\\w\s+([^|]+)\|([^]*?)\\w\*([^\\\p{L}\p{N}]*)(?=\\|$)/gu)) {
      const attr = Object.fromEntries([...w[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
      const before = tokens.length === 0 ? body.slice(0, w.index).replace(/\\[\w]+\*?/g, '').replace(/\s/g, '') : '';
      tokens.push({ text: w[1].trim(), lemma: attr.lemma || '', morph: attr['x-morph'] || '', sourceStrong: attr.strong || '', punctuationBefore: before, punctuationAfter: w[3].replace(/\s/g, '') }); greekWords++;
    }
    const count = [...body.matchAll(/\\w\s+/g)].length;
    if (count !== tokens.length || !count) throw Error(`Greek tokens lost: ${book}/${locator}: ${tokens.length}/${count}`);
    verses[locator] = { sourceRef: `${sourceBook}.${chapter}.${verse}`, tokens, notes, bracketed: body.includes('[') || body.includes(']') };
    if (kjv.books[book - 1].chapters.find(c => c.chapter === chapter)?.verses.some(v => v.verse === verse)) links[locator] = [{ locator, type: 'same-number', basis: 'UGNT ufw source reference; shared locator, not a claim of textual equivalence' }]; greekVerses++;
  }
  for (const mapping of greekMap.mappings.filter(m => m.book === book)) {
    if (mapping.sources.some(s => !verses[s.locator])) throw Error('Greek editorial mapping points to missing source text.');
    links[mapping.target] = mapping.sources.map(s => ({ ...s, basis: 'Plajah source-checked editorial verse map', note: mapping.note }));
  }
  greekFiles.push({ ...(await write(greekRoot, `book-${book}.json`, { schema: 'plajah-original-book-v1', corpus: 'greek', book, verses, links })), verses: Object.keys(verses).length, sourceFile: file, sourceSha256: sha(usfm) });
}
if (hebrewFiles.length !== 39 || greekFiles.length !== 27) throw Error('Incomplete original corpus book coverage.');
await write(greekRoot, 'metadata.json', { schema: 'plajah-original-metadata-v1', corpus: 'greek', title: 'Greek New Testament · derived UGNT 0.34', attribution: 'The original work by unfoldingWord is available from https://www.unfoldingword.org/ugnt', rights: 'CC BY-SA 4.0. Derived JSON changes format, retaining word forms, lemmas, source Strong extensions, raw grammar, punctuation and source footnotes. Original USFM, trademark, license and edition README retained in source directory. Derived edition does not use publisher trademark.', license: 'https://creativecommons.org/licenses/by-sa/4.0/', snapshot: greekSnapshot.commit, verses: greekVerses, words: greekWords, mappingSha256: sha(greekMapBytes), files: greekFiles });
console.log(`Hebrew/Aramaic: ${hebrewVerses} verses, ${hebrewWords} main words, ${variantWords} variant words. Greek: ${greekVerses} verses, ${greekWords} words.`);
for (const corpus of ['oshb', 'greek']) {
  const root = `public/sacred/${corpus}`, metadata = JSON.parse(await fs.readFile(`${root}/metadata.json`, 'utf8'));
  const lemmas = {}, morphology = {};
  for (const file of metadata.files) {
    const book = JSON.parse(await fs.readFile(`${root}/${file.file}`, 'utf8'));
    for (const [locator, verse] of Object.entries(book.verses)) for (const [position, token] of verse.tokens.entries()) {
      if (token.punctuation) continue;
      const ref = [book.book, ...locator.split(':').map(Number), position];
      const keys = corpus === 'oshb' ? token.lemma.split('/').filter(p => /^\d+(?:\s+[a-z])?$/.test(p)) : [token.lemma];
      for (const lemma of new Set(keys.filter(Boolean))) (lemmas[lemma] ??= []).push(ref);
      if (token.morph) (morphology[token.morph] ??= []).push(ref);
    }
  }
  const indexFile = await write(root, 'search-index.json', { schema: 'plajah-original-index-v1', corpus, lemmas, morphology });
  metadata.indexFile = indexFile; await write(root, 'metadata.json', metadata);
}
