// Era Clash 3D: CC0 Poly Haven ground surfaces for Chapter I (meadow, dirt road, gravel, beach, cliff), into the
// shared Poly Haven texture pool the engine's materials read (public/games/ravencrest/assets/polyhaven), then run
// scripts/ravencrest/pack_textures.py to pack AO/rough/disp and write the 1k tier.
//   node scripts/eraclash3d/fetchGround.mjs && python scripts/ravencrest/pack_textures.py
import fs from 'node:fs/promises';
import path from 'node:path';

const RES = '2k';
const OUT = path.resolve('public/games/ravencrest/assets/polyhaven');
const UA = { 'User-Agent': 'plajah-eraclash3d-fetch' };
const IDS = ['forrest_ground_01', 'brown_mud_02', 'rocks_ground_05', 'coast_sand_01', 'coast_sand_rocks_02',
  // the town (reference pack): flagstone street, castle-base stonework (ishigaki), kawara roof tiles
  'cobblestone_large_01', 'japanese_stone_wall', 'grey_roof_tiles'];
const TEX_MAPS = { Diffuse: 'diff', nor_gl: 'nor_gl', Rough: 'rough', AO: 'ao', Displacement: 'disp' };

const getJson = async (u) => { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); };
const index = JSON.parse(await fs.readFile(path.join(OUT, 'index.json'), 'utf8'));
let bytes = 0;
for (const id of IDS) {
  const files = await getJson(`https://api.polyhaven.com/files/${id}`);
  const out = {};
  for (const [key, short] of Object.entries(TEX_MAPS)) {
    const f = files[key]?.[RES]?.jpg ?? files[key]?.[RES]?.png;
    if (!f) continue;
    const dest = path.join(OUT, 'textures', id, `${short}${path.extname(new URL(f.url).pathname)}`);
    try { await fs.access(dest); } catch {
      const r = await fetch(f.url, { headers: UA }); if (!r.ok) throw new Error(`${r.status} ${f.url}`);
      const b = Buffer.from(await r.arrayBuffer()); await fs.mkdir(path.dirname(dest), { recursive: true }); await fs.writeFile(dest, b); bytes += b.length;
    }
    out[short] = path.relative(OUT, dest).replaceAll('\\', '/');
  }
  index.textures[id] = out;
  console.log('tex', id, Object.keys(out).join(','));
}
await fs.writeFile(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2));
console.log(`done, ${(bytes / 1e6).toFixed(1)} MB`);
