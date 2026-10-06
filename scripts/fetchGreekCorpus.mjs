import fs from 'node:fs/promises';
const root = 'public/sacred/greek/source', api = 'https://git.door43.org/api/v1/repos/unfoldingWord/el-x-koine_ugnt';
await fs.mkdir(root, { recursive: true });
async function response(url) { const r = await fetch(url, { signal: AbortSignal.timeout(60000) }); if (!r.ok) throw Error(`${r.status}: ${url}`); return r; }
const branch = await (await response(`${api}/branches/master`)).json();
const commit = branch.commit.id;
if (!/^[a-f0-9]{40}$/.test(commit)) throw Error('No fixed Greek source revision.');
const list = await (await response(`${api}/contents?ref=${commit}`)).json();
const files = list.filter(f => f.name.endsWith('.usfm') || ['LICENSE.md', 'README.md', 'manifest.yaml'].includes(f.name));
let cursor = 0;
await Promise.all(Array.from({ length: 5 }, async () => { while (cursor < files.length) { const file = files[cursor++]; const bytes = Buffer.from(await (await response(`https://git.door43.org/unfoldingWord/el-x-koine_ugnt/raw/commit/${commit}/${file.name}`)).arrayBuffer()); await fs.writeFile(`${root}/${file.name}`, bytes); } }));
await fs.writeFile(`${root}/snapshot.json`, JSON.stringify({ commit, fetched: '2026-10-06', source: 'https://git.door43.org/unfoldingWord/el-x-koine_ugnt', files: files.map(f => f.name) }, null, 2));
console.log(`Retained ${files.length} Greek source files at ${commit}.`);
const grammarApi = 'https://git.door43.org/api/v1/repos/unfoldingWord/en_ugg';
const grammarBranch = await (await response(`${grammarApi}/branches/master`)).json();
const grammarCommit = grammarBranch.commit.id;
for (const [remote, local] of [['parsingscheme_updated.pdf', 'parsingscheme_updated.pdf'], ['LICENSE.md', 'grammar-license.md']]) {
  const bytes = Buffer.from(await (await response(`https://git.door43.org/unfoldingWord/en_ugg/raw/commit/${grammarCommit}/${remote}`)).arrayBuffer());
  await fs.writeFile(`${root}/${local}`, bytes);
}
await fs.writeFile(`${root}/grammar-snapshot.json`, JSON.stringify({ commit: grammarCommit, source: 'https://git.door43.org/unfoldingWord/en_ugg', files: ['parsingscheme_updated.pdf', 'grammar-license.md'] }, null, 2));
