#!/usr/bin/env node
/**
 * fetchFloraModel — pull a CC0 model from Poly Haven and pack it for the wing.
 *
 *   node scripts/fetchFloraModel.mjs <asset_id> [resolution]
 *   node scripts/fetchFloraModel.mjs quiver_tree_01 1k
 *
 * Poly Haven ships photogrammetry as .gltf + loose textures + a raw .bin, and
 * the raw meshes are FILM grade — pine_tree_01's mesh alone is 905 MB. Always
 * check the reported mesh size before committing to a download; anything over
 * ~20 MB needs decimation before it belongs in a browser.
 *
 * Output: public/models/flora/<asset_id>.glb (draco-compressed, single file)
 * plus a printed credit line for the specimen record.
 *
 * Everything on Poly Haven is CC0. Record the credit anyway — the museum label
 * renders it, and attribution should never drift from the asset.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const API = 'https://api.polyhaven.com';
const OUT_DIR = path.resolve('public/models/flora');
const TMP_ROOT = path.resolve('.flora-tmp');

const asset = process.argv[2];
const res = process.argv[3] || '1k';
if (!asset) {
  console.error('usage: node scripts/fetchFloraModel.mjs <asset_id> [1k|2k|4k]');
  process.exit(1);
}

const mb = (n) => (n / 1048576).toFixed(2) + ' MB';

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

async function download(url, dest) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, Buffer.from(await r.arrayBuffer()));
}

const info = await getJSON(`${API}/info/${asset}`);
const files = await getJSON(`${API}/files/${asset}`);
const entry = files?.gltf?.[res]?.gltf;
if (!entry) {
  console.error(`No ${res} glTF for "${asset}". Available: ${Object.keys(files.gltf || {}).join(', ') || 'none'}`);
  process.exit(1);
}

const includes = Object.entries(entry.include || {});
const binEntry = includes.find(([k]) => k.endsWith('.bin'));
const meshBytes = binEntry ? binEntry[1].size : 0;
const total = includes.reduce((n, [, v]) => n + v.size, entry.size);

console.log(`\n${info.name}  (${asset} @ ${res})`);
console.log(`  authors : ${Object.keys(info.authors || {}).join(', ')}`);
console.log(`  licence : CC0  ·  https://polyhaven.com/a/${asset}`);
console.log(`  mesh    : ${mb(meshBytes)}`);
console.log(`  download: ${mb(total)}  (${includes.length + 1} files)`);

if (meshBytes > 40 * 1048576) {
  console.log(`\n  ⚠  This mesh is film-grade (${mb(meshBytes)}). It needs decimation before`);
  console.log(`     it belongs in a browser. Fetching anyway — expect a slow download.`);
}

const tmp = path.join(TMP_ROOT, asset);
await fs.mkdir(tmp, { recursive: true });

const mainName = entry.url.split('/').pop();
process.stdout.write('\n  fetching');
await download(entry.url, path.join(tmp, mainName));
// The include KEY is the path the .gltf references — preserve it exactly, or
// the packer can't resolve "textures/foo.jpg".
for (const [rel, v] of includes) {
  await download(v.url, path.join(tmp, rel));
  process.stdout.write('.');
}
console.log(' done');

await fs.mkdir(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, `${asset}.glb`);
console.log('  packing (draco)…');
execFileSync('npx', ['--yes', '@gltf-transform/cli@latest', 'optimize',
  path.join(tmp, mainName), out, '--compress', 'draco', '--no-texture-compress'],
  { stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' });

const outSize = (await fs.stat(out)).size;
console.log(`\n  ✓ ${path.relative(process.cwd(), out)}  ${mb(outSize)}`);
if (outSize > 6 * 1048576) console.log('  ⚠  over budget for a Fire TV — consider a lower resolution.');

console.log(`\n  Paste into the specimen record:\n`);
console.log(`    model: {`);
console.log(`      kind: 'glb',`);
console.log(`      url: '/models/flora/${asset}.glb',`);
console.log(`      credit: '${Object.keys(info.authors || {}).join(', ')} — Poly Haven',`);
console.log(`      license: 'CC0',`);
console.log(`      scale: /* real height in metres */,`);
console.log(`    },\n`);

await fs.rm(TMP_ROOT, { recursive: true, force: true });
