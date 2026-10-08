import fs from 'node:fs/promises';
const root = 'public/sacred/oshb/source';
await fs.mkdir(root, { recursive: true });
async function response(url) { const r = await fetch(url, { signal: AbortSignal.timeout(60000), headers: { 'User-Agent': 'Plajah-corpus-builder' } }); if (!r.ok) throw Error(`${r.status}: ${url}`); return r; }
const commit = await (await response('https://api.github.com/repos/openscriptures/morphhb/commits/master')).json();
const files = await (await response(`https://api.github.com/repos/openscriptures/morphhb/contents/wlc?ref=${commit.sha}`)).json();
const targets = files.filter(f => f.name.endsWith('.xml')).map(f => [`wlc/${f.name}`, f.name]);
targets.push(['LICENSE.md', 'LICENSE.md'], ['README.md', 'README.md'], ['parsing/HebrewMorphologyCodes.html', 'HebrewMorphologyCodes.html']);
let cursor = 0;
await Promise.all(Array.from({ length: 6 }, async () => { while (cursor < targets.length) { const [remote, local] = targets[cursor++]; const bytes = Buffer.from(await (await response(`https://raw.githubusercontent.com/openscriptures/morphhb/${commit.sha}/${remote}`)).arrayBuffer()); await fs.writeFile(`${root}/${local}`, bytes); } }));
await fs.writeFile(`${root}/snapshot.json`, JSON.stringify({ commit: commit.sha, fetched: '2026-10-06', source: 'https://github.com/openscriptures/morphhb', files: targets.map(([, name]) => name) }, null, 2));
console.log(`Retained ${targets.length} source files at ${commit.sha}.`);
