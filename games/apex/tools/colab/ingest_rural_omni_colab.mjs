#!/usr/bin/env node
/**
 * ingest_rural_omni_colab.mjs — Ingest `rural_omni_v4_outputs.zip` downloaded from Colab Pro+ GPU
 * into `public/games/apex/ironport/textures-v4/rural/` (plus optional 360° painted `.glb` into `models-v4/rural/`),
 * optionally compresses to GPU KTX2 (BC7/UASTC), and updates `public/games/apex/ironport/v4-manifest.json`
 * (`ruralTextures: [...]`) so `region.html` auto-upgrades every rural hero building on next reload!
 *
 * Usage:
 *   node games/apex/tools/colab/ingest_rural_omni_colab.mjs path/to/rural_omni_v4_outputs.zip
 *   node games/apex/tools/colab/ingest_rural_omni_colab.mjs path/to/rural_omni_v4_outputs.zip --no-ktx
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const PUB_IRONPORT = path.join(REPO_ROOT, 'public/games/apex/ironport');
const QA_OUT = path.join(REPO_ROOT, 'tmp/apex-colab/qa');

const args = process.argv.slice(2);
const skipKtx = args.includes('--no-ktx');
const zipArg = args.find((a) => !a.startsWith('--'));
if (!zipArg) {
  console.error('Usage: node games/apex/tools/colab/ingest_rural_omni_colab.mjs <rural_omni_v4_outputs.zip> [--no-ktx]');
  process.exit(1);
}
const zipPath = path.resolve(process.cwd(), zipArg);
if (!fs.existsSync(zipPath)) {
  console.error('Zip not found:', zipPath);
  process.exit(1);
}

function readZipEntries(filePath) {
  const buf = fs.readFileSync(filePath);
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

const entries = readZipEntries(zipPath);
let texCount = 0;
let glbCount = 0;
let qaCount = 0;

for (const e of entries) {
  const rel = e.name.replace(/^\/+/, '');
  if (rel.startsWith('textures-v4/rural/')) {
    const dst = path.join(PUB_IRONPORT, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, e.data);
    texCount++;
  } else if (rel.startsWith('models-v4/rural/')) {
    const dst = path.join(PUB_IRONPORT, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, e.data);
    glbCount++;
  } else if (rel.endsWith('.png')) {
    const dst = path.join(QA_OUT, path.basename(rel));
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, e.data);
    qaCount++;
  }
}

const ruralTexDir = path.join(PUB_IRONPORT, 'textures-v4/rural');
const ruralStems = [];
const jpgPaths = [];
if (fs.existsSync(ruralTexDir)) {
  for (const fn of fs.readdirSync(ruralTexDir).filter((f) => f.endsWith('_base.jpg')).sort()) {
    const stem = fn.replace(/_base\.jpg$/, '');
    if (fs.existsSync(path.join(ruralTexDir, `${stem}_nrm.jpg`))) {
      ruralStems.push(stem);
      for (const suf of ['base', 'nrm', 'rgh', 'orm', 'hgt']) {
        const fp = path.join(ruralTexDir, `${stem}_${suf}.jpg`);
        if (fs.existsSync(fp)) jpgPaths.push(fp);
      }
    }
  }
}

// Optional KTX2 compression if KTX-Software is installed locally
const ktxBin = process.env.KTX_BIN || 'D:\\Plajah Runtime\\ktx\\bin\\ktx.exe';
if (!skipKtx && jpgPaths.length > 0 && fs.existsSync(ktxBin)) {
  let ok = 0;
  for (const fp of jpgPaths) {
    const outKtx = fp.replace(/\.jpg$/i, '.ktx2');
    const stem = path.basename(fp, '.jpg');
    const isLinear = /_(nrm|rgh|orm|hgt)$/.test(stem);
    const r = spawnSync(ktxBin, [
      'create',
      '--format', isLinear ? 'R8G8B8_UNORM' : 'R8G8B8_SRGB',
      '--assign-tf', isLinear ? 'linear' : 'srgb',
      '--generate-mipmap',
      '--encode', 'uastc', '--uastc-quality', '1', '--uastc-rdo', '--uastc-rdo-l', '2', '--zstd', '9',
      fp, outKtx,
    ], { encoding: 'utf8' });
    if (r.status === 0) ok++;
  }
  console.log(`KTX2 compressed ${ok}/${jpgPaths.length} rural PBR maps.`);
}

// Merge `ruralTextures` into public/games/apex/ironport/v4-manifest.json
const manPath = path.join(PUB_IRONPORT, 'v4-manifest.json');
const manifest = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, 'utf8')) : { version: 4, status: 'active' };
manifest.ruralTextures = ruralStems;
manifest.ruralUpdatedAt = new Date().toISOString();
fs.writeFileSync(manPath, JSON.stringify(manifest, null, 2), 'utf8');

console.log(`Ingested ${texCount} rural 2K PBR textures (${ruralStems.length} archetypes), ${glbCount} 360° GLBs, ${qaCount} QA previews.`);
console.log(`Updated ${manPath} with ruralTextures:`, ruralStems);
console.log('Reload http://127.0.0.1:4332/region.html — rural Main Street storefronts, depots, barns, farmhouses & churches will auto-upgrade!');
