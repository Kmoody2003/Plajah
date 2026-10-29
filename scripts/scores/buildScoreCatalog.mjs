// buildScoreCatalog — gathers every free score we can stand behind into one catalogue
// the app loads at runtime:  node scripts/scores/buildScoreCatalog.mjs
//   -> public/scores/catalog.json
//
// Sources, and why each one is in or out (checked 2026-10-29):
//   IN  OpenScore Lieder          1,462 songs, CC0, zipped MusicXML on GitHub (CORS-open,
//                                 renders in-app with Verovio). Composer dates parsed from
//                                 each composer's README "(1851–1934)".
//   IN  OpenScore String Quartets CC0, MusicXML; composers.tsv carries born/died.
//   IN  Mutopia Project           ~2,100 LilyPond engravings, each with its own licence in
//                                 the .ly header (Public Domain / CC BY / CC BY-SA). PDFs
//                                 and MIDI hosted on mutopiaproject.org, embeddable.
//   OUT Essen Folksong Collection the tunes are traditional, but the encoding is
//                                 "Copyright 1995, estate of Helmut Schaffrath" under a
//                                 personal-use-only CCARH licence. Cannot be hosted.
//   OUT CPDL                      Cloudflare-blocked API; link out only.
//   OUT IMSLP                     no CORS; per-file PD status varies by country. Link out.
//
// The script records FACTS (composer dates, edition licence, file URLs). Whether a piece
// is free, and where, is decided at runtime by services/publicDomainRights so the answer
// moves forward each 1 January without a rebuild.
//
// After a rebuild, run scripts/scores/mirrorScores.mts again: a fresh catalogue has no
// `mirrored` marks, so every file would serve from its source until the mirror re-marks them
// (files already in the bucket are skipped, so that rerun is quick).
//
// Network-polite: small concurrency, retries, and an on-disk cache so a rerun only
// fetches what changed. GITHUB_TOKEN is used for the API if set (the tree calls are 3).

import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('public/scores/catalog.json');
const CACHE_DIR = path.resolve('node_modules/.cache/score-catalog');
fs.mkdirSync(CACHE_DIR, { recursive: true });
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const UA = { 'User-Agent': 'plajah-score-catalog (+https://plajah.com)' };
const GH = { ...UA, ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchText(url, { headers = UA, cache = true } = {}) {
  const key = path.join(CACHE_DIR, Buffer.from(url).toString('base64url').slice(0, 200));
  if (cache && fs.existsSync(key)) return fs.readFileSync(key, 'utf8');
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers });
      if (r.status === 404) return null;
      if (r.ok) {
        const t = await r.text();
        if (cache) fs.writeFileSync(key, t);
        return t;
      }
    } catch { /* retry */ }
    await sleep(600 * (i + 1));
  }
  return null;
}
const fetchJson = async (url, opts) => { const t = await fetchText(url, opts); return t ? JSON.parse(t) : null; };

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
      if (++done % 200 === 0) console.log(`  ${done}/${items.length}`);
    }
  }));
  return out;
}

const encodePath = p => p.split('/').map(encodeURIComponent).join('/');
const yearsIn = s => {
  const m = /\b(1[0-9]{3}|20[0-2][0-9])\s*[-–—]\s*(1[0-9]{3}|20[0-2][0-9])\b/.exec(s || '');
  return m ? { born: +m[1], died: +m[2] } : {};
};
const deslug = s => s.replace(/_/g, ' ').trim();
/** "Abbott,_Jane_Bingham" → "Jane Bingham Abbott". */
const nameFromPath = p => { const [last, first] = deslug(p).split(/,\s*/); return first ? `${first} ${last}` : last; };
const TRAD = /^(traditional|trad\.?|anonymous|anon\.?|folk ?song|unknown)$/i;

// ── OpenScore ───────────────────────────────────────────────────────────────

async function openScoreLieder() {
  const tree = await fetchJson('https://api.github.com/repos/OpenScore/Lieder/git/trees/main?recursive=1', { headers: GH });
  const files = tree.tree.map(x => x.path);
  const raw = p => `https://raw.githubusercontent.com/OpenScore/Lieder/main/${encodePath(p)}`;
  const composerDirs = [...new Set(files.filter(p => p.startsWith('scores/') && p.split('/').length > 2).map(p => p.split('/')[1]))];
  console.log(`OpenScore Lieder: ${composerDirs.length} composers`);
  const composers = {};
  await pool(composerDirs, 6, async dir => {
    const md = await fetchText(raw(`scores/${dir}/README.md`));
    const name = (md && /^#\s+(.+)$/m.exec(md)?.[1]?.trim()) || nameFromPath(dir);
    const desc = md && /__(.+?)__/.exec(md)?.[1];
    composers[dir] = { name, desc, ...yearsIn(desc) };
  });
  return files.filter(p => p.endsWith('.mxl')).map(p => {
    const parts = p.split('/'); // scores/<composer>/<set or _>/<song>/<id>.mxl  (sets may nest one level)
    const c = composers[parts[1]] || { name: nameFromPath(parts[1]) };
    const set = parts[2] !== '_' ? deslug(parts[2]) : undefined;
    const title = deslug(parts[parts.length - 2]).replace(/^\d+[a-z]?\s+/, '');
    return {
      id: `osl-${parts[parts.length - 1].replace(/\.mxl$/, '')}`,
      source: 'OPENSCORE_LIEDER',
      title, set, composer: c.name, born: c.born, died: c.died,
      forces: 'Voice and piano', style: 'Art song',
      edition: { label: 'CC0 1.0', kind: 'CC0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
      mxlUrl: raw(p),
      sourceUrl: `https://github.com/OpenScore/Lieder/tree/main/${encodePath(parts.slice(0, -1).join('/'))}`,
    };
  });
}

async function openScoreQuartets() {
  const base = 'https://raw.githubusercontent.com/OpenScore/StringQuartets/main/';
  const tsv = t => { const [h, ...rows] = t.trim().split('\n').map(l => l.split('\t')); return rows.map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
  const composers = Object.fromEntries(tsv(await fetchText(base + 'data/composers.tsv')).map(c => [c.path, c]));
  const tree = await fetchJson('https://api.github.com/repos/OpenScore/StringQuartets/git/trees/main?recursive=1', { headers: GH });
  const mxl = tree.tree.map(x => x.path).filter(p => p.startsWith('scores/') && p.endsWith('.mxl'));
  console.log(`OpenScore String Quartets: ${mxl.length} files`);
  return mxl.map(p => {
    const parts = p.split('/');
    const c = composers[parts[1]] || {};
    const work = deslug(parts[2]);
    const mvt = parts.length > 4 ? deslug(parts[parts.length - 2]) : undefined;
    return {
      id: `osq-${parts[parts.length - 1].replace(/\.mxl$/, '')}`,
      source: 'OPENSCORE_QUARTETS',
      title: mvt ? `${work} — ${mvt}` : work,
      composer: c.name || nameFromPath(parts[1]),
      born: c.born ? +c.born : undefined, died: c.died ? +c.died : undefined,
      forces: 'String quartet', style: 'Chamber',
      edition: { label: 'CC0 1.0', kind: 'CC0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
      mxlUrl: base + encodePath(p),
      sourceUrl: `https://github.com/OpenScore/StringQuartets/tree/main/${encodePath(parts.slice(0, 3).join('/'))}`,
    };
  });
}

// ── Mutopia ─────────────────────────────────────────────────────────────────

function lyHeader(src) {
  const block = /\\header\s*\{([\s\S]*?)\n\s*\}/.exec(src)?.[1];
  if (!block) return null;
  const h = {};
  for (const m of block.matchAll(/^\s*([A-Za-z]+)\s*=\s*"((?:[^"\\]|\\.)*)"/gm)) h[m[1]] = m[2];
  return h.mutopiatitle || h.title ? h : null;
}

function mutopiaLicence(copyright = '') {
  const c = copyright.toLowerCase();
  if (/public domain/.test(c)) return { label: 'Public Domain', kind: 'PD', url: 'https://www.mutopiaproject.org/legal.html' };
  const ver = /(\d\.\d)/.exec(c)?.[1] || '4.0';
  if (/sharealike|share-alike|by-sa/.test(c)) return { label: `CC BY-SA ${ver}`, kind: 'CC-BY-SA', url: `https://creativecommons.org/licenses/by-sa/${ver}/` };
  if (/attribution|cc by|by \d/.test(c)) return { label: `CC BY ${ver}`, kind: 'CC-BY', url: `https://creativecommons.org/licenses/by/${ver}/` };
  return null; // unknown licence — not shipped
}

async function mutopia() {
  const tree = await fetchJson('https://api.github.com/repos/MutopiaProject/MutopiaProject/git/trees/master?recursive=1', { headers: GH });
  const ly = tree.tree.map(x => x.path).filter(p => p.startsWith('ftp/') && p.endsWith('.ly'));
  // A piece is the shallowest directory holding .ly files; parts sit beside or below the main file.
  const byDir = new Map();
  for (const p of ly) { const d = p.split('/').slice(0, -1).join('/'); if (!byDir.has(d)) byDir.set(d, []); byDir.get(d).push(p); }
  const dirs = [...byDir.keys()].filter(d => ![...byDir.keys()].some(o => o !== d && d.startsWith(o + '/')));
  console.log(`Mutopia: ${ly.length} .ly files in ${dirs.length} piece folders`);
  const raw = p => `https://raw.githubusercontent.com/MutopiaProject/MutopiaProject/master/${encodePath(p)}`;

  // Mutopia's own composer index ("BachJS" → "J. S. Bach (1685–1750)") is far cleaner than the
  // free-text composer line in each .ly header, which spells Bach six different ways.
  const browse = (await fetchText('https://www.mutopiaproject.org/browse.html')) || '';
  const index = {};
  for (const m of browse.matchAll(/Composer=([^'"&]+)['"]>([^<]+)<\/a>/g)) {
    const label = m[2].trim();
    index[m[1]] = { name: label.replace(/\s*\(.*\)\s*$/, '').trim(), ...yearsIn(label) };
  }
  console.log(`Mutopia composer index: ${Object.keys(index).length} composers`);

  const pieces = await pool(dirs, 6, async dir => {
    const own = [...byDir.entries()].filter(([d]) => d === dir || d.startsWith(dir + '/')).flatMap(([, f]) => f);
    const leaf = dir.split('/').pop();
    own.sort((a, b) => (b.endsWith(`/${leaf}.ly`) ? 1 : 0) - (a.endsWith(`/${leaf}.ly`) ? 1 : 0));
    let header = null, file = null;
    for (const f of own.slice(0, 6)) { const src = await fetchText(raw(f)); header = src && lyHeader(src); if (header) { file = f; break; } }
    if (!header) return null;
    const edition = mutopiaLicence(header.copyright || header.license);
    if (!edition) return null;
    // The published folder lists the real PDF/MIDI names (single file, or a -pdfs.zip for multi-part pieces).
    const site = `https://www.mutopiaproject.org/${encodePath(dir)}/`;
    const listing = (await fetchText(site)) || '';
    const links = [...listing.matchAll(/href="([^"?]+\.(pdf|mid|zip))"/gi)].map(m => m[1]);
    const pick = re => { const l = links.find(x => re.test(x)); return l && (l.startsWith('http') ? l : site + l); };
    const pdfUrl = pick(/-a4\.pdf$/i) || pick(/\.pdf$/i);
    const pdfZip = pick(/-a4-pdfs?\.zip$/i);
    const midiUrl = pick(/\.mid$/i);
    if (!pdfUrl && !pdfZip) return null;
    const composerId = dir.split('/')[1];
    const known = index[composerId];
    const composerRaw = header.composer || header.mutopiacomposer || '';
    const dates = known?.died ? known : yearsIn(composerRaw);
    const composer = known?.name || composerRaw.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\\[a-z]+/g, '').trim() || composerId;
    const style = header.style || undefined;
    return {
      id: `mu-${dir.slice(4).replace(/[^A-Za-z0-9]+/g, '-')}`,
      source: 'MUTOPIA',
      title: (header.mutopiatitle || header.title).replace(/\\[a-z]+/g, '').trim(),
      composer, born: dates.born, died: dates.died,
      traditional: TRAD.test(composer) || TRAD.test(composerId) || undefined,
      forces: header.mutopiainstrument || header.instrument || undefined,
      style, dateText: header.date || undefined,
      edition,
      // CC BY / BY-SA require crediting the engraver, so the maintainer travels with the file.
      engraver: header.maintainer?.trim() || undefined,
      pdfUrl, pdfZipUrl: pdfUrl ? undefined : pdfZip, midiUrl,
      lyUrl: raw(file),
      sourceUrl: site,
    };
  });
  return pieces.filter(Boolean);
}

// ── Composer death years the sources left blank (Wikidata) ─────────────────

async function fillDeathYears(entries) {
  const missing = [...new Set(entries.filter(e => !e.traditional && e.died === undefined && e.composer).map(e => e.composer))];
  console.log(`Wikidata: looking up ${missing.length} composers with no dates`);
  const found = {};
  await pool(missing, 3, async name => {
    const q = `SELECT ?b ?d WHERE { ?p rdfs:label "${name.replace(/"/g, '\\"')}"@en; wdt:P106/wdt:P279* wd:Q36834. OPTIONAL{?p wdt:P569 ?b} OPTIONAL{?p wdt:P570 ?d} } LIMIT 2`;
    const r = await fetchJson(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { headers: { ...UA, Accept: 'application/sparql-results+json' } });
    const rows = r?.results?.bindings || [];
    // Only trust an unambiguous single match.
    if (rows.length === 1 && rows[0].d) found[name] = { born: rows[0].b ? +rows[0].b.value.slice(0, 4) : undefined, died: +rows[0].d.value.slice(0, 4) };
    await sleep(150);
  });
  for (const e of entries) if (e.died === undefined && found[e.composer]) Object.assign(e, found[e.composer], { datesFrom: 'wikidata' });
}

// ── main ────────────────────────────────────────────────────────────────────

const [lieder, quartets, mu] = [await openScoreLieder(), await openScoreQuartets(), await mutopia()];
const entries = [...lieder, ...quartets, ...mu];
await fillDeathYears(entries);
for (const e of entries) for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];

const stats = {
  total: entries.length,
  bySource: Object.fromEntries(['OPENSCORE_LIEDER', 'OPENSCORE_QUARTETS', 'MUTOPIA'].map(s => [s, entries.filter(e => e.source === s).length])),
  traditional: entries.filter(e => e.traditional).length,
  noDeathYear: entries.filter(e => !e.traditional && e.died === undefined).length,
};
fs.writeFileSync(OUT, JSON.stringify({ builtAt: new Date().toISOString(), stats, entries }));
console.log(JSON.stringify(stats, null, 2), `\n→ ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1e6).toFixed(2)} MB)`);
