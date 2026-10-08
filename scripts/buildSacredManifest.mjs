import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const resources = [
  ...['oshb', 'greek'].flatMap(corpus => [
    { file: `${corpus}/metadata.json`, title: `${corpus} original-language corpus provenance`, edition: corpus === 'oshb' ? 'WLC 4.20 / OSHB pinned snapshot' : 'Derived UGNT 0.34 pinned snapshot', source: corpus === 'oshb' ? 'https://github.com/openscriptures/morphhb' : 'https://git.door43.org/unfoldingWord/el-x-koine_ugnt', rights: corpus === 'oshb' ? 'WLC text public domain; lemma/morphology CC BY 4.0. Original OSHB attribution retained in metadata.' : 'Derived corpus CC BY-SA 4.0. Original unfoldingWord attribution, license and unmodified USFM retained in source directory.' },
    { file: `${corpus}/search-index.json`, title: `${corpus} complete original lemma and morphology index`, edition: 'Main-text token index; source numbering preserved', source: corpus === 'oshb' ? 'https://github.com/openscriptures/morphhb' : 'https://git.door43.org/unfoldingWord/el-x-koine_ugnt', rights: corpus === 'oshb' ? 'CC BY 4.0; see corpus metadata.' : 'CC BY-SA 4.0; see corpus metadata.' },
  ]),
  { file: 'greek/source/parsingscheme_updated.pdf', title: 'Publisher Greek parsing chart', edition: 'UGG / CNTR nine-slot scheme', source: 'https://git.door43.org/unfoldingWord/en_ugg', rights: 'Retained publisher grammar reference; original work available at https://unfoldingword.org/ugg/. CC BY-SA 4.0.' },
  { file: 'greek/source/grammar-license.md', title: 'Greek grammar source license', edition: 'Publisher attribution and share-alike license', source: 'https://git.door43.org/unfoldingWord/en_ugg', rights: 'Original work available at https://unfoldingword.org/ugg/. CC BY-SA 4.0.' },
  { file: 'greek/verse-map.json', title: 'KJV / UGNT verse-division exceptions', edition: 'Plajah source-checked editorial mappings · 2026-10-06', source: 'https://git.door43.org/unfoldingWord/el-x-koine_ugnt', rights: 'CC BY-SA 4.0. Editorial verse division, not word-level alignment or a claim of identical readings.' },
  { file: 'alignment/metadata.json', title: 'KJV word alignment provenance and book checksums', edition: 'CrossWire KJV 3.1', source: 'https://gitlab.com/crosswire-bible-society/kjv', rights: 'CrossWire attribution and GPL distribution notice retained in metadata and original OSIS source.' },
  { file: 'alignment/kjv-strong-index.json', title: 'Complete KJV Strong tagged-group index', edition: 'Derived from retained CrossWire KJV 3.1 OSIS', source: 'https://gitlab.com/crosswire-bible-society/kjv', rights: 'CrossWire Bible Society; source distribution marked GPL and grants use for any purpose. See alignment metadata and retained OSIS source.' },
  { file: 'bible-douayrheims.json', title: 'Douay-Rheims Bible', edition: 'Challoner revision, GetBible 2.0', coverage: '73 books; 1,334 chapters; 35,808 verses', source: 'https://api.getbible.net/v2/douayrheims.json', rights: 'Public Domain, verified against retained provider metadata. Vulgate numbering.' },
  { file: 'bible-kjv.json', title: 'King James Bible', edition: 'GetBible v2 · CrossWire SWORD KJV snapshot', coverage: '66 books; 1,189 chapters; 31,102 verses', source: 'https://api.getbible.net/v2/kjv.json', rights: 'KJV base text is public domain in the United States. CrossWire digital edition is marked GPL and grants use for any purpose in its retained distribution_about notice; full attribution and source metadata remain in this file.', sourceRepository: 'https://gitlab.com/crosswire-bible-society/kjv' },
  { file: 'quran-pickthall.json', title: 'Qur’an · Pickthall English translation', edition: '1930', coverage: '114 surahs; 6,236 ayahs', source: 'https://api.alquran.cloud/v1/quran/en.pickthall', rights: 'Public domain in the United States; translation provided by Al Quran Cloud.' },
  { file: 'bhagavad-gita-arnold.txt', title: 'Bhagavad Gita · The Song Celestial', edition: 'Edwin Arnold, 1885; digitized 1900 edition', coverage: '18 chapters; poetic paragraphs are not Sanskrit verse alignment', source: 'https://www.gutenberg.org/ebooks/2388', rights: 'Public domain in the United States; complete Project Gutenberg license retained in source file.' },
  { file: 'dhammapada-muller.txt', title: 'Dhammapada', edition: 'F. Max Müller, 1881', coverage: '26 chapters; 423 verses; paired verses remain grouped as in this edition', source: 'https://www.gutenberg.org/ebooks/2017', rights: 'Public domain in the United States; complete Project Gutenberg license retained in source file.' },
  ...['strongsgreek','strongshebrew'].flatMap(id => [
    { file: `lexicons/${id}.json`, title: id, edition: 'GetBible conversion of CrossWire SWORD · Strong’s 1890 dictionary', source: `https://dictionaries.getbible.net/v1/${id}.json`, rights: 'Public Domain, verified against provider metadata.' },
    { file: `lexicons/${id}-metadata.json`, title: `${id} provenance`, edition: 'GetBible metadata snapshot', source: `https://dictionaries.getbible.net/v1/${id}/metadata.json`, rights: 'Provider attribution and source-module metadata.' },
  ]),
];
const assets = [];
for (const resource of resources) {
  const bytes = await fs.readFile(`public/sacred/${resource.file}`);
  assets.push({ ...resource, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await fs.writeFile('public/sacred/manifest.json', JSON.stringify({ schema: 'plajah-sacred-assets-v1', checked: '2026-10-06', assets }, null, 2) + '\n');
console.log(`Recorded source attribution, size, and SHA-256 for ${assets.length} sacred assets.`);
