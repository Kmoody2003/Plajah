// Era Clash 3D: period references for Otsu-no-ura through Plajah's own museum service (services/museum: the Met, the
// Art Institute of Chicago, Cleveland, the Smithsonian, Europeana, Commons, the Library of Congress, Harvard, the
// Rijksmuseum, Japan Search, the National Palace Museum, …). One query per subject the city builds; the results
// (title, date, culture, museum, link, image) are written for the accuracy audit (docs/era-clash-3d-era-accuracy.md).
//   npx tsx scripts/eraclash3d/eraReference.ts
import fs from 'node:fs';
import path from 'node:path';
import { searchMuseums, SOURCE_LABEL } from '../../services/museum';

const SUBJECTS: Record<string, string[]> = {
  townscape: ['Scenes in and around Kyoto screen', 'rakuchu rakugai', 'Japanese folding screen city 16th century'],
  townhouse: ['machiya Kyoto townhouse', 'Japanese merchant house Momoyama'],
  castle: ['Japanese castle screen Momoyama', 'Azuchi castle', 'Osaka castle screen'],
  port: ['Nanban screen port', 'Japanese port town screen', 'Sakai port'],
  ships: ['Japanese ship 16th century', 'atakebune', 'Japanese merchant ship screen'],
  wako: ['wokou pirates scroll', 'Japanese pirates Ming'],
  armour: ['Japanese armor Momoyama', 'tosei gusoku', 'domaru armor 16th century', 'haramaki armor'],
  arms: ['Japanese sword Muromachi', 'yari spear Japan', 'teppo matchlock Japan'],
  townsfolk: ['Japanese kosode 16th century', 'Momoyama genre painting townspeople'],
  objects: ['Japanese stone lantern', 'chochin lantern Japan', 'noren shop curtain', 'Japanese bucket wooden'],
  bridges: ['Japanese arched bridge screen', 'taikobashi'],
  norse: ['Viking axe', 'Viking shield', 'Viking helmet'],
};

const out: Record<string, unknown[]> = {};
const file = path.resolve('games/era-clash-3d/review/era-references.json');
for (const [k, qs] of Object.entries(SUBJECTS)) {
  const seen = new Set<string>();
  out[k] = [];
  for (const q of qs) {
    try {
      const rs = await searchMuseums(q, { limit: 8, signal: AbortSignal.timeout(15000) });
      for (const r of rs as Record<string, unknown>[]) {
        const key = String(r.url ?? r.id ?? r.title);
        if (seen.has(key)) continue; seen.add(key);
        out[k].push({ q, title: r.title, date: r.date ?? r.dated ?? r.year, culture: r.culture, source: SOURCE_LABEL[r.source as keyof typeof SOURCE_LABEL] ?? r.source, url: r.url, image: r.image ?? r.thumbnail });
      }
      console.log(`${k} · ${q}: ${rs.length}`);
      fs.writeFileSync(file, JSON.stringify(out, null, 1));
    } catch (e) { console.log(`${k} · ${q}: failed ${(e as Error).message}`); }
  }
}
fs.writeFileSync(file, JSON.stringify(out, null, 1));
console.log('wrote', file, Object.values(out).reduce((a, b) => a + b.length, 0), 'objects');
