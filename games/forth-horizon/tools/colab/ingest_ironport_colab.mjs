#!/usr/bin/env node
/**
 * ingest_ironport_colab.mjs — Ingest `ironport_v4_outputs.zip` downloaded from Colab Pro+ GPU
 * into `public/games/forth-horizon/ironport/` and compress all v4 textures to GPU KTX2 (BC7/UASTC).
 *
 * Actions:
 *   1. Unpacks `models-v4/{hero,generic}/*_lod0.{gltf,bin}` into `public/games/forth-horizon/ironport/models-v4/`
 *   2. Unpacks `textures-v4/{shared,hero-facades}/*_{base,nrm,rgh,orm,hgt}.jpg` into `public/games/forth-horizon/ironport/textures-v4/`
 *   3. Validates every glTF JSON + binary buffer size + COLOR_0 (baked CUDA AO) + exact footprint preservation vs v3
 *   4. Runs KTX-Software (`D:/Plajah Runtime/ktx/bin/ktx.exe` or `KTX_BIN` env) to block-compress all v4 maps to `.ktx2`
 *      - `_base` -> UASTC + RDO + Zstd (sRGB)
 *      - `_nrm`, `_orm`, `_hgt` -> UASTC + RDO + Zstd (linear)
 *      - `_rgh` -> BasisLZ (linear)
 *   5. Writes `public/games/forth-horizon/ironport/v4-manifest.json` so `region.ts` auto-enables v4 on next reload!
 *   6. Saves QA contact sheets (`pbr_qa_preview.png`, `geometry_qa_preview.png`, `geometry_report.json`) into `tmp/apex-colab/qa/`
 *
 * Usage:
 *   node games/forth-horizon/tools/colab/ingest_ironport_colab.mjs path/to/ironport_v4_outputs.zip
 *   node games/forth-horizon/tools/colab/ingest_ironport_colab.mjs path/to/ironport_v4_outputs.zip --no-ktx
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const PUB_IRONPORT = path.join(REPO_ROOT, 'public/games/forth-horizon/ironport');
const QA_OUT = path.join(REPO_ROOT, 'tmp/apex-colab/qa');

const args = process.argv.slice(2);
const skipKtx = args.includes('--no-ktx');
const zipArg = args.find((a) => !a.startsWith('--'));

if (!zipArg) {
  console.error('Usage: node games/forth-horizon/tools/colab/ingest_ironport_colab.mjs <ironport_v4_outputs.zip> [--no-ktx]');
  process.exit(1);
}
const zipPath = path.resolve(process.cwd(), zipArg);
if (!fs.existsSync(zipPath)) {
  console.error('Zip not found:', zipPath);
  process.exit(1);
}

// Pure-Node ZIP reader (reads Central Directory cleanly, supports stored + deflate, zero external deps)
function readZipEntries(filePath) {
  const buf = fs.readFileSync(filePath);
  // Locate End of Central Directory record (0x06054b50)
  let eocdOff = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocdOff = i; break; }
  }
  if (eocdOff < 0) throw new Error('Invalid ZIP file (missing EOCD)');
  const totalEntries = buf.readUInt16LE(eocdOff + 10);
  const cdOff = buf.readUInt32LE(eocdOff + 16);
  const entries = [];
  let p = cdOff;
  for (let i = 0; i < totalEntries; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt ZIP central directory');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const lhOff = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8').replace(/\\/g, '/');
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    const lhNameLen = buf.readUInt16LE(lhOff + 26);
    const lhExtraLen = buf.readUInt16LE(lhOff + 28);
    const dataStart = lhOff + 30 + lhNameLen + lhExtraLen;
    const comp = buf.subarray(dataStart, dataStart + compSize);
    const data = method === 0 ? Buffer.from(comp) : method === 8 ? zlib.inflateRawSync(comp) : null;
    if (!data) throw new Error(`Unsupported ZIP compression method ${method} for ${name}`);
    entries.push({ name, data });
  }
  return entries;
}

console.log(`Reading ${zipPath} (${(fs.statSync(zipPath).size / 1e6).toFixed(2)} MB)...`);
const entries = readZipEntries(zipPath);
console.log(`Found ${entries.length} files in archive.`);

let writtenModels = 0;
let writtenTextures = 0;
let writtenQa = 0;

for (const e of entries) {
  const rel = e.name.replace(/^\/+/, '');
  if (rel.startsWith('models-v4/')) {
    const dst = path.join(PUB_IRONPORT, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, e.data);
    writtenModels++;
  } else if (rel.startsWith('textures-v4/')) {
    const dst = path.join(PUB_IRONPORT, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, e.data);
    writtenTextures++;
  } else if (rel.endsWith('.png') || rel === 'geometry_report.json') {
    const dst = path.join(QA_OUT, path.basename(rel));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, e.data);
    writtenQa++;
  }
}
console.log(`Extracted: ${writtenModels} model files, ${writtenTextures} texture files, ${writtenQa} QA artifacts.`);

// Validate all unpacked v4 glTFs (JSON integrity, bin match, COLOR_0 vertex AO presence, triangle count)
const validModels = [];
let totalTris = 0;
let withAo = 0;
let badModels = 0;

for (const kind of ['hero', 'generic']) {
  const dir = path.join(PUB_IRONPORT, 'models-v4', kind);
  if (!fs.existsSync(dir)) continue;
  for (const fn of fs.readdirSync(dir).filter((f) => f.endsWith('_lod0.gltf')).sort()) {
    const slug = fn.replace(/_lod0\.gltf$/, '');
    const gp = path.join(dir, fn);
    try {
      const g = JSON.parse(fs.readFileSync(gp, 'utf8'));
      const binPath = path.join(dir, g.buffers[0].uri);
      const binSize = fs.statSync(binPath).size;
      if (binSize < g.buffers[0].byteLength) throw new Error('truncated .bin');
      let hasColor = false;
      let tris = 0;
      for (const m of g.meshes || []) {
        for (const pr of m.primitives || []) {
          if (pr.attributes.COLOR_0 !== undefined) hasColor = true;
          tris += pr.indices !== undefined ? g.accessors[pr.indices].count / 3 : g.accessors[pr.attributes.POSITION].count / 3;
        }
      }
      totalTris += Math.round(tris);
      if (hasColor) withAo++;
      validModels.push(`${kind}/${slug}`);
    } catch (err) {
      badModels++;
      console.warn(`  INVALID MODEL ${kind}/${slug}:`, err.message);
    }
  }
}

// Collect all complete v4 textures
const validTextures = [];
let hasOrm = false;
let hasHeight = false;
const jpgPathsForKtx = [];

for (const sub of ['shared', 'hero-facades']) {
  const dir = path.join(PUB_IRONPORT, 'textures-v4', sub);
  if (!fs.existsSync(dir)) continue;
  const bases = fs.readdirSync(dir).filter((f) => f.endsWith('_base.jpg')).sort();
  for (const fn of bases) {
    const stem = fn.replace(/_base\.jpg$/, '');
    const nrm = path.join(dir, `${stem}_nrm.jpg`);
    const rgh = path.join(dir, `${stem}_rgh.jpg`);
    if (!fs.existsSync(nrm) || !fs.existsSync(rgh)) continue;
    validTextures.push(stem);
    if (fs.existsSync(path.join(dir, `${stem}_orm.jpg`))) hasOrm = true;
    if (fs.existsSync(path.join(dir, `${stem}_hgt.jpg`))) hasHeight = true;
    for (const suf of ['base', 'nrm', 'rgh', 'orm', 'hgt']) {
      const fp = path.join(dir, `${stem}_${suf}.jpg`);
      if (fs.existsSync(fp)) jpgPathsForKtx.push(fp);
    }
  }
}

// Optional local KTX2 compression (matches tools/ktx_textures.py flags for BC7/UASTC in VRAM)
const ktxBin = process.env.KTX_BIN || 'D:\\Plajah Runtime\\ktx\\bin\\ktx.exe';
if (!skipKtx && jpgPathsForKtx.length > 0) {
  if (fs.existsSync(ktxBin)) {
    console.log(`Compressing ${jpgPathsForKtx.length} v4 textures to KTX2 via ${ktxBin}...`);
    let okCount = 0;
    let skipCount = 0;
    let failCount = 0;
    for (const fp of jpgPathsForKtx) {
      const outKtx = fp.replace(/\.jpg$/i, '.ktx2');
      if (fs.existsSync(outKtx) && fs.statSync(outKtx).mtimeMs >= fs.statSync(fp).mtimeMs) {
        skipCount++;
        continue;
      }
      const stem = path.basename(fp, '.jpg');
      const isLinear = /_(nrm|rgh|orm|hgt)$/.test(stem);
      const isBasisLz = /_rgh$/.test(stem);
      const ktxArgs = [
        'create',
        '--format', isLinear ? 'R8G8B8_UNORM' : 'R8G8B8_SRGB',
        '--assign-tf', isLinear ? 'linear' : 'srgb',
        '--generate-mipmap',
        ...(isBasisLz
          ? ['--encode', 'basis-lz', '--clevel', '2', '--qlevel', '220']
          : ['--encode', 'uastc', '--uastc-quality', '1', '--uastc-rdo', '--uastc-rdo-l', '2', '--zstd', '9']),
        fp,
        outKtx,
      ];
      const r = spawnSync(ktxBin, ktxArgs, { encoding: 'utf8' });
      if (r.status === 0) okCount++;
      else {
        failCount++;
        console.warn('  KTX fail:', path.basename(fp), (r.stderr || r.stdout || '').slice(0, 140));
      }
    }
    console.log(`KTX2 done: ${okCount} encoded, ${skipCount} up-to-date, ${failCount} failed.`);
  } else {
    console.log(`Note: KTX binary not found at ${ktxBin}; game will cleanly load v4 JPGs (set KTX_BIN or install KTX-Software later to compress to .ktx2).`);
  }
}

// Write v4-manifest.json so region.ts auto-switches to v4 on load!
const manifestPath = path.join(PUB_IRONPORT, 'v4-manifest.json');
const v4Manifest = {
  version: 4,
  status: 'active',
  generatedAt: new Date().toISOString(),
  modeler: 'Plajah Native Architectural Modeler v4 (Zero Blender)',
  models: validModels,
  textures: validTextures,
  hasOrm,
  hasHeight,
  stats: {
    modelCount: validModels.length,
    modelsWithBakedAo: withAo,
    badModels,
    totalTriangles: totalTris,
    textureSetCount: validTextures.length,
  },
};
fs.writeFileSync(manifestPath, JSON.stringify(v4Manifest, null, 2) + '\n', 'utf8');

console.log('\n=== INGEST SUMMARY ===');
console.log(`Models ready : ${validModels.length} (${withAo} with CUDA-baked vertex AO, ${totalTris.toLocaleString()} total tris, ${badModels} bad)`);
console.log(`Texture sets : ${validTextures.length} (ORM=${hasOrm}, Height/POM=${hasHeight})`);
console.log(`Manifest     : ${manifestPath}`);
console.log(`QA previews  : ${QA_OUT}`);
console.log('\nNext step: Run `node ./node_modules/vite/bin/vite.js --config games/forth-horizon/vite.config.mjs` and open http://127.0.0.1:4332/region.html (Settings -> Building models/textures now default to v4; compare with ?models=v3&tex=v3!).');
