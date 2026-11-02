// Downloads the CC0 Poly Haven furniture and greenery the digital venues place.
//   node scripts/lighting/fetchVenueModels.mjs
// Output: public/models/venues/<id>/ (glTF + 1k textures). A venue still builds if these are absent.
import fs from 'node:fs/promises';
import path from 'node:path';

const IDS = ['sofa_02', 'modern_arm_chair_01', 'coffee_table_round_01', 'potted_plant_01', 'television_02', 'bar_chair_round_01'];
const OUT = path.resolve('public/models/venues');
const UA = { 'User-Agent': 'plajah-venue-fetch' };
const save = async (url, dest) => {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  try { await fs.access(dest); return; } catch { /* fetch below */ }
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  await fs.writeFile(dest, Buffer.from(await r.arrayBuffer()));
};
for (const id of IDS) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`, { headers: UA })).json();
  const g = files.gltf['1k'].gltf;
  await save(g.url, path.join(OUT, id, `${id}.gltf`));
  for (const [rel, f] of Object.entries(g.include)) await save(f.url, path.join(OUT, id, rel));
  console.log(id);
}
