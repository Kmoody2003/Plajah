// Generates .glb car models for the full Apex Elohim vehicle roster
// (12 cars in ironport-complete/concept-art + 11 additional cars in Nov 15 - 14_22)
// via the local Tela 3D HTTP runtime (http://127.0.0.1:51124/tela3d/image-to-mesh).
//
// Usage:
//   1. Start Tela 3D runtime: powershell -File engines/tela-3d/restart.ps1
//   2. Generate all cars with UV textures (SF3D):
//        node scripts/generateHeroCarsTela3d.mjs --backend=sf3d
//   3. Generate only specific cars:
//        node scripts/generateHeroCarsTela3d.mjs --backend=sf3d --only=kestrel,aurelia,corsair,kuronuma
//   4. Generate high-poly untextured geometry (60k faces):
//        node scripts/generateHeroCarsTela3d.mjs --backend=hunyuan_mini --faceLimit=60000

import fs from 'node:fs';
import path from 'node:path';

const TELA3D_URL = process.env.TELA3D_URL || 'http://127.0.0.1:51124';
const CONCEPT_DIR = 'D:\\plajah game assets deign from promtps\\racer\\ironport-complete\\concept-art';
const REFS_DIR = 'D:\\plajah game assets deign from promtps\\racer\\Nov 15 - 14_22';
const OUT_DIR = path.resolve('games/apex/assets-src/cars');
fs.mkdirSync(OUT_DIR, { recursive: true });

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  })
);

const backend = args.backend || 'sf3d';
const quality = backend === 'hunyuan_mini' ? 'detail' : 'fast';
const faceLimit = Number(args.faceLimit || 60000);
const onlySet = args.only ? new Set(args.only.split(',').map((s) => s.trim())) : null;

const ROSTER = [
  // Core 12 from ironport-complete/concept-art
  { id: 'kestrel', dir: CONCEPT_DIR, prefix: 'media-generation-kestrel-sovereign-gtr-' },
  { id: 'aurelia', dir: CONCEPT_DIR, prefix: 'media-generation-aurelia-zephyr-apex-' },
  { id: 'ironhide', dir: CONCEPT_DIR, prefix: 'media-generation-meridian-ironhide-440-' },
  { id: 'kodiak', dir: CONCEPT_DIR, prefix: 'media-generation-meridian-kodiak-1500-' },
  { id: 'continental', dir: CONCEPT_DIR, prefix: 'media-generation-meridian-continental-67-' },
  { id: 'voltstrike', dir: CONCEPT_DIR, prefix: 'media-generation-halcyon-voltstrike-s-' },
  { id: 'solstice', dir: CONCEPT_DIR, prefix: 'media-generation-halcyon-solstice-gt-' },
  { id: 'helios', dir: CONCEPT_DIR, prefix: 'media-generation-halcyon-helios-x1-' },
  { id: 'badlands', dir: CONCEPT_DIR, prefix: 'media-generation-kestrel-badlands-xt-' },
  { id: 'sidewinder', dir: CONCEPT_DIR, prefix: 'media-generation-kestrel-sidewinder-' },
  { id: 'terracorsa', dir: CONCEPT_DIR, prefix: 'media-generation-aurelia-terra-corsa-' },
  { id: 'veloce', dir: CONCEPT_DIR, prefix: 'media-generation-aurelia-veloce-spyder-' },
  // Additional 11 vehicles from Nov 15 - 14_22
  { id: 'corsair', dir: REFS_DIR, prefix: 'Ironport_Corsair_RS_muscle_car_' },
  { id: 'kuronuma', dir: REFS_DIR, prefix: 'Kuronuma_GT-6_coupe_design_sheet_' },
  { id: 'vanguard', dir: REFS_DIR, prefix: 'Vanguard_Apex_GT_rear_view_' },
  { id: 'apex_tcr', dir: REFS_DIR, prefix: 'Apex_TCR_Spec-2_touring_car_' },
  { id: 'stratos_wrc', dir: REFS_DIR, prefix: 'Veloce_Stratos_WRC_rally_car_' },
  { id: 'titan_fx4', dir: REFS_DIR, prefix: 'Titan_Ridge_FX4_trophy_truck_' },
  { id: 'dunerunner', dir: REFS_DIR, prefix: 'DuneRunner_V8_Buggy_design_turna' },
  { id: 'zephyr_emotion', dir: REFS_DIR, prefix: 'Zephyr_E-Motion_design_turnaroun' },
  { id: 'solstice_r', dir: REFS_DIR, prefix: 'Solstice_Aero_R_rear_view_' },
  { id: 'legacy_gtr', dir: REFS_DIR, prefix: 'Vintage_racecar_design_sheet_' },
  { id: 'overland_suv', dir: REFS_DIR, prefix: 'Dakar_SUV_design_sheet_' },
];

function findSheet(dir, prefix) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  const match = files.find((f) => f.startsWith(prefix) && /\.(webp|png|jpg|jpeg)$/i.test(f));
  return match ? path.join(dir, match) : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const health = await fetch(`${TELA3D_URL}/health`);
  if (!health.ok) throw new Error(`Tela 3D health check failed: ${health.status}`);
  console.log('Tela 3D runtime ready:', await health.json());
  console.log(`Backend: ${backend} | Quality: ${quality} | FaceLimit: ${faceLimit}`);

  const jobs = ROSTER.filter((r) => !onlySet || onlySet.has(r.id));
  for (const job of jobs) {
    const src = findSheet(job.dir, job.prefix);
    if (!src) {
      console.warn(`Skipping ${job.id}: no sheet found matching ${job.prefix}* in ${job.dir}`);
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
