import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = 'public/models/halloween/materials/polyhaven';
const assets = [
  { id: 'castle_brick_01', author: 'Rob Tuytel', widthMeters: 1.5, use: 'Damp basement masonry candidate; not the exterior ashlar authority' },
  { id: 'roof_slates_03', author: 'Rob Tuytel', widthMeters: 3, use: 'Slate roof material candidate for the authored castle roof kit' },
];
const manifest = [];
for (const asset of assets) {
  const response = await fetch(`https://api.polyhaven.com/files/${asset.id}`);
  if (!response.ok) throw new Error(`Metadata failed: ${asset.id} ${response.status}`);
  const maps = await response.json();
  const files = [];
  await mkdir(`${root}/${asset.id}`, { recursive: true });
  for (const [key, filename] of [['Diffuse', 'albedo.jpg'], ['nor_gl', 'normal_gl.jpg'], ['Rough', 'roughness.jpg']]) {
    const source = maps[key]?.['1k']?.jpg;
    if (!source?.url || source.size > 8_000_000) throw new Error(`Missing or unexpectedly large map: ${asset.id}/${key}`);
    const download = await fetch(source.url);
    if (!download.ok) throw new Error(`Download failed: ${download.status}`);
    const buffer = Buffer.from(await download.arrayBuffer());
    const md5 = createHash('md5').update(buffer).digest('hex');
    if (buffer.length !== source.size || md5 !== source.md5) throw new Error(`Integrity mismatch: ${asset.id}/${key}`);
    const path = `${root}/${asset.id}/${filename}`;
    await writeFile(path, buffer);
    files.push({ map: key, path, source: source.url, bytes: buffer.length, md5 });
  }
  manifest.push({ ...asset, license: 'CC0-1.0', licenseUrl: 'https://polyhaven.com/license', originalUrl: `https://polyhaven.com/a/${asset.id}`, resolution: '1k', status: 'candidate-awaiting-material-review', files });
  console.log(`Downloaded and verified ${asset.id}: ${files.reduce((sum, file) => sum + file.bytes, 0)} bytes`);
}
await writeFile(`${root}/provenance.json`, JSON.stringify(manifest, null, 2));
