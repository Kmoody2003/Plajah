// Downloads the CC0 Poly Haven assets used by the Ravencrest engine slice.
// Usage: node scripts/ravencrest/fetchPolyhaven.mjs [--res 2k]
// Output: public/games/ravencrest/assets/polyhaven/{textures,models,hdri}/<id>/...
import fs from 'node:fs/promises';
import path from 'node:path';

const RES = process.argv.includes('--res') ? process.argv[process.argv.indexOf('--res') + 1] : '2k';
const OUT = path.resolve('public/games/ravencrest/assets/polyhaven');
const UA = { 'User-Agent': 'plajah-ravencrest-fetch' };

export const MANIFEST = {
  // Arrival road / moat / gate (concept refs 3752929161, 3752929201, 3752931214)
  textures: [
    'asphalt_02', 'road_damaged', 'castle_brick_07', 'castle_wall_slates', 'medieval_wall_02',
    'roof_slates_02', 'cliff_side', 'rock_face', 'forest_ground_04', 'mossy_rock',
    'rusty_metal_02', 'weathered_planks', 'cobblestone_floor_04',
    // Interior: polished hall floor, ashlar walls, timber.
    'marble_01', 'large_floor_tiles_02', 'medieval_blocks_02', 'dark_wooden_planks', 'stone_tiles_02',
  ],
  models: [
    'dead_tree_trunk', 'dead_tree_trunk_02', 'rock_face_01',
    'rock_face_02', 'boulder_01', 'large_iron_gate', 'large_castle_door', 'street_lamp_02',
    'shrub_01', 'tree_stump_01',
  ],
  // Courtyard + Grand Hall props (refs 3752887346, 3752887369, 3752891648). Fetched at 1k.
  propModels: [
    'wine_barrel_01', 'wooden_crate_01', 'wooden_barrels_01', 'wooden_lantern_01', 'lantern_chandelier_01',
    'wooden_candlestick', 'brass_candleholders', 'gothic_coffee_table', 'kite_shield', 'wooden_bookshelf_worn',
    'treasure_chest', 'gothic_statue', 'vintage_cabinet_01', 'painted_wooden_bench', 'stone_fire_pit',
  ],
  hdri: ['narrow_moonlit_road', 'rogland_moonlit_night'],
};

const TEX_MAPS = { Diffuse: 'diff', nor_gl: 'nor_gl', Rough: 'rough', AO: 'ao', Displacement: 'disp' };

async function getJson(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function download(url, dest) {
  try { await fs.access(dest); return 'cached'; } catch { /* fetch below */ }
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, Buffer.from(await r.arrayBuffer()));
  return 'ok';
}

async function fetchTexture(id) {
  const files = await getJson(`https://api.polyhaven.com/files/${id}`);
  const out = {};
  for (const [key, short] of Object.entries(TEX_MAPS)) {
    const f = files[key]?.[RES]?.jpg ?? files[key]?.[RES]?.png;
    if (!f) continue;
    const ext = path.extname(new URL(f.url).pathname);
    const dest = path.join(OUT, 'textures', id, `${short}${ext}`);
    await download(f.url, dest);
    out[short] = path.relative(OUT, dest).replaceAll('\\', '/');
  }
  return out;
}

async function fetchModel(id, res = RES) {
  const files = await getJson(`https://api.polyhaven.com/files/${id}`);
  const g = files.gltf?.[res]?.gltf ?? files.gltf?.['1k']?.gltf;
  if (!g) throw new Error(`no gltf for ${id}`);
  const dir = path.join(OUT, 'models', id);
  await download(g.url, path.join(dir, path.basename(new URL(g.url).pathname)));
  for (const [rel, inc] of Object.entries(g.include ?? {})) await download(inc.url, path.join(dir, rel));
  return path.relative(OUT, path.join(dir, path.basename(new URL(g.url).pathname))).replaceAll('\\', '/');
}

async function fetchHdri(id) {
  const files = await getJson(`https://api.polyhaven.com/files/${id}`);
  const h = files.hdri?.[RES]?.hdr;
  const dest = path.join(OUT, 'hdri', `${id}_${RES}.hdr`);
  await download(h.url, dest);
  return path.relative(OUT, dest).replaceAll('\\', '/');
}

const index = { res: RES, license: 'CC0 (polyhaven.com)', textures: {}, models: {}, hdri: {} };
for (const id of MANIFEST.textures) { index.textures[id] = await fetchTexture(id); console.log('tex', id); }
for (const id of MANIFEST.models) { index.models[id] = await fetchModel(id); console.log('model', id); }
for (const id of MANIFEST.propModels) { index.models[id] = await fetchModel(id, '1k'); console.log('prop', id); }
for (const id of MANIFEST.hdri) { index.hdri[id] = await fetchHdri(id); console.log('hdri', id); }
await fs.writeFile(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2));
console.log('done →', OUT);
