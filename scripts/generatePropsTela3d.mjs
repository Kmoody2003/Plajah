// Generates .glb 3D prop, trackside, flora, and mechanical-part models
// from the asset sheets in D:\plajah game assets deign from promtps\racer\Nov 15 - 14_22
// via the local Tela 3D HTTP runtime (http://127.0.0.1:51124/tela3d/image-to-mesh).
//
// Usage:
//   1. Start Tela 3D runtime (if not already running): powershell -File engines/tela-3d/restart.ps1
//   2. Generate all props with UV textures (SF3D):
//        node scripts/generatePropsTela3d.mjs --backend=sf3d
//   3. Filter specific props:
//        node scripts/generatePropsTela3d.mjs --backend=sf3d --only=gantry,grandstand,tire_barrier

import fs from 'node:fs';
import path from 'node:path';

const TELA3D_URL = process.env.TELA3D_URL || 'http://127.0.0.1:51124';
const REFS_DIR = 'D:\\plajah game assets deign from promtps\\racer\\Nov 15 - 14_22';
const OUT_DIR = path.resolve('games/apex/assets-src/props');
fs.mkdirSync(OUT_DIR, { recursive: true });

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  })
);

const backend = args.backend || 'sf3d';
const quality = backend === 'hunyuan_mini' ? 'detail' : 'fast';
const faceLimit = Number(args.faceLimit || 45000);
const onlySet = args.only ? new Set(args.only.split(',').map((s) => s.trim())) : null;

const PROP_ROSTER = [
  // Trackside & Circuit Furniture
  { id: 'start_gantry', prefix: 'Grand_prix_start_finish_gantry_' },
  { id: 'light_gantry', prefix: 'Lighting_gantry_structure_prop_' },
  { id: 'grandstand_modular', prefix: 'Modular_steel_grandstand_prop_' },
  { id: 'grandstand_steel', prefix: 'Steel_spectator_grandstand_prop_' },
  { id: 'concrete_barrier', prefix: 'Concrete_crash_barriers_render_' },
  { id: 'catch_fence', prefix: 'Catch_fencing_prop_sheet_render_' },
  { id: 'tire_barrier', prefix: 'Trackside_tire_barriers_prop_render_' },
  { id: 'pit_equipment', prefix: 'Pit_lane_equipment_asset_sheet_' },
  { id: 'festival_props', prefix: 'Racing_festival_trackside_props_' },
  { id: 'food_booths', prefix: 'Festival_food_trucks_and_booths_' },
  // Urban & Rural Street Props
  { id: 'urban_furniture', prefix: 'Urban_street_furniture_set_render_' },
  { id: 'rural_props', prefix: 'Rural_road_props_asset_sheet_' },
  // Flora & Foliage
  { id: 'tree_hero', prefix: '3D_tree_asset_sheet_render_' },
  { id: 'forest_flora', prefix: '3D_forest_flora_asset_sheet_' },
  { id: 'wetland_foliage', prefix: '3D_wetland_foliage_asset_sheet_' },
  { id: 'crops', prefix: 'Agricultural_crops_3D_asset_sheet_' },
  { id: 'beach_grass', prefix: 'Beach_grass_asset_sheet_render_' },
  { id: 'dead_pines', prefix: 'Dead_pine_trees_asset_sheet_' },
  // Mechanical Parts
  { id: 'brake_assembly', prefix: 'Brake_rotor_and_caliper_reference_' },
  { id: 'brake_rotor', prefix: 'Brake_rotor_disc_reference_sheet_' },
];

function findSheet(prefix) {
  if (!fs.existsSync(REFS_DIR)) return null;
  const files = fs.readdirSync(REFS_DIR);
  const match = files.find((f) => f.startsWith(prefix) && /\.(webp|png|jpg|jpeg)$/i.test(f));
  return match ? path.join(REFS_DIR, match) : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const health = await fetch(`${TELA3D_URL}/health`);
  if (!health.ok) throw new Error(`Tela 3D health check failed: ${health.status}`);
  console.log('Tela 3D runtime ready:', await health.json());
  console.log(`Backend: ${backend} | Quality: ${quality} | FaceLimit: ${faceLimit}`);

  const jobs = PROP_ROSTER.filter((r) => !onlySet || onlySet.has(r.id));
  for (const job of jobs) {
    const src = findSheet(job.prefix);
    if (!src) {
      console.warn(`Skipping ${job.id}: no sheet found matching ${job.prefix}*`);
      continue;
    }

    console.log(`\nGenerating ${job.id}.glb from ${path.basename(src)}...`);
    const bytes = fs.readFileSync(src);
    const ext = path.extname(src).toLowerCase() === '.png' ? 'png' : path.extname(src).toLowerCase() === '.webp' ? 'webp' : 'jpeg';
    const imageDataUrl = `data:image/${ext};base64,${bytes.toString('base64')}`;

    const res = await fetch(`${TELA3D_URL}/tela3d/image-to-mesh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageDataUrl,
        backend,
        quality,
        options: { faceLimit },
      }),
    });

    const json = await res.json();
    if (!res.ok || !json.success || !json.glbBase64) {
      throw new Error(`Failed ${job.id}: ${JSON.stringify(json)}`);
    }

    const outPath = path.join(OUT_DIR, `${job.id}.glb`);
    fs.writeFileSync(outPath, Buffer.from(json.glbBase64, 'base64'));
    console.log(
      `Saved ${outPath} (${json.vertices} verts, ${json.faces} faces, ${json.executionTimeMs}ms, GPU ${json.gpuTempC ?? '?'}°C)`
    );
    await sleep(3000);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
