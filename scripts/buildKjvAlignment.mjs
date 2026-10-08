import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DOMParser } from '@xmldom/xmldom';
const root = 'public/sacred/alignment';
const xml = await fs.readFile(`${root}/kjv.osis.xml`, 'utf8');
const names = 'Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov Eccl Song Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal Matt Mark Luke John Acts Rom 1Cor 2Cor Gal Eph Phil Col 1Thess 2Thess 1Tim 2Tim Titus Phlm Heb Jas 1Pet 2Pet 1John 2John 3John Jude Rev'.split(' ');
const books = names.map((osis, i) => ({ schema: 'plajah-kjv-alignment-v1', book: i + 1, osis, verses: {} }));
const index = {}, seen = new Set();
const parser = new DOMParser({ errorHandler: { warning: message => { throw Error(message); }, error: message => { throw Error(message); }, fatalError: message => { throw Error(message); } } });
const strong = raw => [...new Set([...raw.matchAll(/strong:([GH])0*(\d+)/g)].filter(m => Number(m[2]) > 0).map(m => `${m[1]}${Number(m[2])}`))];
for (const match of xml.matchAll(/<verse\s+osisID="([^"]+)"[^>]*\/>([\s\S]*?)<verse\s+eID="\1"\s*\/>/g)) {
  const [osis, chapter, verse] = match[1].split('.');
  const book = names.indexOf(osis) + 1;
  if (!book || seen.has(match[1])) throw Error(`Invalid source reference: ${match[1]}`);
  seen.add(match[1]);
  // Poetry/quotation structures can cross verse milestones. Preserve only
  // self-contained word tags, dropping annotations before parsing the fragment.
  const fragment = match[2].replace(/<(note|title|figure)\b[^>]*>[\s\S]*?<\/\1>/g, '').replace(/<\/?([\w:]+)\b[^>]*>/g, (tag, name) => name === 'w' ? tag : '');
  const doc = parser.parseFromString(`<root>${fragment}</root>`, 'text/xml');
  const segments = [];
  function walk(node) {
    if (node.nodeType === 3) { if (node.data) segments.push({ text: node.data }); return; }
    if (['note', 'title', 'figure'].includes(node.nodeName)) return;
    if (node.nodeName === 'w') {
      const lemma = node.getAttribute('lemma') || '', morph = node.getAttribute('morph') || '';
      segments.push({ text: node.textContent, strong: strong(lemma), lemma, morph, sourcePositions: node.getAttribute('src') || '' });
      return;
    }
    for (let child = node.firstChild; child; child = child.nextSibling) walk(child);
  }
  walk(doc.documentElement);
  books[book - 1].verses[`${chapter}:${verse}`] = segments;
  const counts = {};
  for (const segment of segments) for (const id of segment.strong || []) counts[id] = (counts[id] || 0) + 1;
  for (const [id, count] of Object.entries(counts)) (index[id] ??= []).push([book, Number(chapter), Number(verse), count]);
}
if (seen.size !== 31102 || books.some(b => !Object.keys(b.verses).length)) throw Error(`Incomplete alignment: ${seen.size} verses`);
const files = [];
for (const book of books) {
  const file = `kjv-${book.book}.json`, body = JSON.stringify(book);
  await fs.writeFile(`${root}/${file}`, body);
  files.push({ file, verses: Object.keys(book.verses).length, bytes: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex') });
}
await fs.writeFile(`${root}/kjv-strong-index.json`, JSON.stringify({ schema: 'plajah-kjv-strong-index-v1', index }));
await fs.writeFile(`${root}/metadata.json`, JSON.stringify({ schema: 'plajah-kjv-alignment-metadata-v1', title: 'CrossWire KJV 3.1 OSIS word tags', source: 'https://gitlab.com/crosswire-bible-society/kjv', sourceFile: 'kjv.osis.xml', sourceSha256: createHash('sha256').update(xml).digest('hex'), checked: '2026-10-06', rights: 'CrossWire Bible Society © 2003–2023. Distribution marked GPL; source notice grants use of this text for any purpose. Complete original OSIS source and attribution retained alongside derived files.', verses: seen.size, strongIds: Object.keys(index).length, counting: 'Counts are tagged English segments containing a Strong identifier, not original-language token frequency. Multi-word and multi-lemma groups remain intact.', files }, null, 2));
console.log(`Built ${seen.size} aligned verses and ${Object.keys(index).length} Strong identifiers across 66 books.`);
