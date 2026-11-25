#!/usr/bin/env node
/**
 * prep_ironport_colab.mjs — Package Plajah Motorsport: Apex Ironport buildings & materials
 * for Google Colab Pro+ GPU (A100/L4) neural PBR + Plajah Native Architectural Modeler upgrade.
 *
 * Runs 100% locally on CPU via Node.js (zero local GPU/AI load).
 * Bundles into a single Linux-safe forward-slash ZIP (`tmp/apex-colab/ironport_v4_inputs.zip`):
 *   - All 60 material sets (24 shared + 36 hero-facades) from ironport/textures-v3/ (preferring 2K tex/bld if higher res)
 *   - All 186 Ironport v3 building glTF + .bin models (36 hero + 150 generic)
 *   - Plajah's native architectural modeler (`plajah_arch_modeler.py`, zero Blender!)
 *   - Rich `manifest.json` with per-material physical PBR priors, tileability flags, glass/metal rules,
 *     and city placement counts from `region/city.json`
 *
 * Usage:
 *   node games/forth-horizon/tools/colab/prep_ironport_colab.mjs
 *   node games/forth-horizon/tools/colab/prep_ironport_colab.mjs --subset hero   # Fast test batch (36 heroes + all 60 textures)
 *   node games/forth-horizon/tools/colab/prep_ironport_colab.mjs --out tmp/apex-colab/custom.zip
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const PUB_IRONPORT = path.join(REPO_ROOT, 'public/games/forth-horizon/ironport');
const PUB_TEX_BLD = path.join(REPO_ROOT, 'public/games/forth-horizon/tex/bld');
const CITY_JSON = path.join(REPO_ROOT, 'public/games/forth-horizon/region/city.json');

// Parse CLI flags
const args = process.argv.slice(2);
let subset = 'all'; // 'all' | 'hero'
let outPath = path.join(REPO_ROOT, 'tmp/apex-colab/ironport_v4_inputs.zip');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--subset' && args[i + 1]) subset = args[++i];
  else if (args[i] === '--out' && args[i + 1]) outPath = path.resolve(REPO_ROOT, args[++i]);
}

// Physically-calibrated material priors for Colab Stage 1 Neural PBR calibration.
// Ensures Marigold IID + Depth Anything V2 outputs stay physically anchored across all 24 shared
// architectural materials (roughness range [min, max], metalness range [min, max], relief scale, seamless).
const SHARED_MATERIAL_PROFILES = {
  'tex-shared-01-red-brick':            { class: 'brick',     rgh: [0.74, 0.94], mtl: [0.00, 0.04], relief: 1.0, seamless: true },
  'tex-shared-02-weathered-brick':      { class: 'brick',     rgh: [0.78, 0.96], mtl: [0.00, 0.04], relief: 1.1, seamless: true },
  'tex-shared-03-orange-brick':         { class: 'brick',     rgh: [0.74, 0.93], mtl: [0.00, 0.04], relief: 1.0, seamless: true },
  'tex-shared-04-limestone':            { class: 'stone',     rgh: [0.64, 0.88], mtl: [0.00, 0.04], relief: 0.9, seamless: true },
  'tex-shared-05-white-marble':         { class: 'marble',    rgh: [0.22, 0.56], mtl: [0.00, 0.05], relief: 0.5, seamless: true },
  'tex-shared-06-granite':              { class: 'stone',     rgh: [0.36, 0.72], mtl: [0.00, 0.06], relief: 0.85, seamless: true },
  'tex-shared-07-glass-curtain-blue':   { class: 'glass',     rgh: [0.03, 0.34], mtl: [0.08, 0.82], relief: 0.75, seamless: true },
  'tex-shared-08-glass-curtain-cerulean': { class: 'glass',   rgh: [0.03, 0.34], mtl: [0.08, 0.82], relief: 0.75, seamless: true },
  'tex-shared-09-glass-curtain-bronze': { class: 'glass',     rgh: [0.03, 0.34], mtl: [0.08, 0.82], relief: 0.75, seamless: true },
  'tex-shared-10-terracotta':           { class: 'ceramic',   rgh: [0.30, 0.72], mtl: [0.00, 0.06], relief: 0.95, seamless: true },
  'tex-shared-11-glazed-tile':          { class: 'ceramic',   rgh: [0.14, 0.52], mtl: [0.00, 0.08], relief: 0.85, seamless: true },
  'tex-shared-12-bronze-metal':         { class: 'metal',     rgh: [0.22, 0.55], mtl: [0.62, 0.92], relief: 0.7, seamless: true },
  'tex-shared-13-copper-roof':          { class: 'metal',     rgh: [0.26, 0.68], mtl: [0.45, 0.88], relief: 0.85, seamless: true },
  'tex-shared-14-steel-panel':          { class: 'metal',     rgh: [0.24, 0.58], mtl: [0.58, 0.90], relief: 0.75, seamless: true },
  'tex-shared-15-concrete-boardformed': { class: 'concrete',  rgh: [0.70, 0.92], mtl: [0.00, 0.04], relief: 0.9, seamless: true },
  'tex-shared-16-concrete-weathered':   { class: 'concrete',  rgh: [0.74, 0.95], mtl: [0.00, 0.04], relief: 0.95, seamless: true },
  'tex-shared-17-white-stucco':         { class: 'stucco',    rgh: [0.76, 0.94], mtl: [0.00, 0.03], relief: 0.65, seamless: true },
  'tex-shared-18-timber-siding':        { class: 'wood',      rgh: [0.64, 0.90], mtl: [0.00, 0.03], relief: 1.0, seamless: true },
  'tex-shared-19-red-timber':           { class: 'wood',      rgh: [0.66, 0.92], mtl: [0.00, 0.03], relief: 1.0, seamless: true },
  'tex-shared-20-white-clapboard':      { class: 'wood',      rgh: [0.54, 0.84], mtl: [0.00, 0.03], relief: 0.95, seamless: true },
  'tex-shared-21-corrugated-steel':     { class: 'metal',     rgh: [0.30, 0.68], mtl: [0.52, 0.88], relief: 1.15, seamless: true },
  'tex-shared-22-asphalt-shingle':      { class: 'roof',      rgh: [0.76, 0.95], mtl: [0.00, 0.04], relief: 1.1, seamless: true },
  'tex-shared-23-slate-roof':           { class: 'roof',      rgh: [0.46, 0.78], mtl: [0.00, 0.06], relief: 1.15, seamless: true },
  'tex-shared-24-stone-rubble':         { class: 'stone',     rgh: [0.74, 0.95], mtl: [0.00, 0.04], relief: 1.25, seamless: true },
};

// Minimal zero-dependency ZIP writer (always uses forward slashes for Colab Linux unzip)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

class ZipWriter {
  constructor() {
    this.entries = [];
    this.chunks = [];
    this.offset = 0;
  }
  addBuffer(name, data, compress = true) {
    const cleanName = name.replace(/\\/g, '/').replace(/^\/+/, '');
    const nameBuf = Buffer.from(cleanName, 'utf8');
    const crc = crc32(data);
    let body = data;
    let method = 0;
    if (compress && data.length > 64) {
      const def = zlib.deflateRawSync(data, { level: 6 });
      if (def.length < data.length) {
        body = def;
        method = 8;
      }
    }
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    this.entries.push({ nameBuf, crc, compSize: body.length, rawSize: data.length, method, offset: this.offset });
    this.chunks.push(lh, nameBuf, body);
    this.offset += lh.length + nameBuf.length + body.length;
  }
  addFile(zipName, diskPath, compress = true) {
    const isJpg = /\.(jpe?g|png|webp|ktx2)$/i.test(diskPath);
    this.addBuffer(zipName, fs.readFileSync(diskPath), compress && !isJpg);
  }
  writeTo(filePath) {
    const cdChunks = [];
    let cdSize = 0;
    for (const e of this.entries) {
      const cd = Buffer.alloc(46);
      cd.writeUInt32LE(0x02014b50, 0);
      cd.writeUInt16LE(20, 4);
      cd.writeUInt16LE(20, 6);
      cd.writeUInt16LE(0, 8);
      cd.writeUInt16LE(e.method, 10);
      cd.writeUInt16LE(0, 12);
      cd.writeUInt16LE(0, 14);
      cd.writeUInt32LE(e.crc, 16);
      cd.writeUInt32LE(e.compSize, 20);
      cd.writeUInt32LE(e.rawSize, 24);
      cd.writeUInt16LE(e.nameBuf.length, 28);
      cd.writeUInt16LE(0, 30);
      cd.writeUInt16LE(0, 32);
      cd.writeUInt16LE(0, 34);
      cd.writeUInt16LE(0, 36);
      cd.writeUInt32LE(0, 38);
      cd.writeUInt32LE(e.offset, 42);
      cdChunks.push(cd, e.nameBuf);
      cdSize += cd.length + e.nameBuf.length;
    }
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(this.entries.length, 8);
    eocd.writeUInt16LE(this.entries.length, 10);
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(this.offset, 16);
    eocd.writeUInt16LE(0, 20);

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const out = fs.createWriteStream(filePath);
    for (const c of this.chunks) out.write(c);
    for (const c of cdChunks) out.write(c);
    out.write(eocd);
    return new Promise((res, rej) => {
      out.end();
      out.on('finish', res);
      out.on('error', rej);
    });
  }
}

function jpgDims(buf) {
  for (let i = 2; i < buf.length - 8;) {
    if (buf[i] !== 0xff) break;
    const m = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (m === 0xc0 || m === 0xc1 || m === 0xc2) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return [0, 0];
}

// Count city.json placements per slug so Colab can log priority buildings
const placements = {};
if (fs.existsSync(CITY_JSON)) {
  const city = JSON.parse(fs.readFileSync(CITY_JSON, 'utf8'));
  for (const it of city.items || []) {
    const k = `${it.kind}/${it.slug}`;
    placements[k] = (placements[k] || 0) + 1;
  }
}

const zip = new ZipWriter();

// 1. Embed Plajah's native architectural modeler right inside the batch archive (zero Blender!)
const modelerPath = path.join(__dirname, 'plajah_arch_modeler.py');
if (!fs.existsSync(modelerPath)) {
  console.error('Missing plajah_arch_modeler.py at', modelerPath);
  process.exit(1);
}
zip.addFile('plajah_arch_modeler.py', modelerPath, true);

// 2. Pack all 60 material sets (24 shared + 36 hero-facades)
const manifestTextures = [];
for (const sub of ['shared', 'hero-facades']) {
  const dir = path.join(PUB_IRONPORT, 'textures-v3', sub);
  if (!fs.existsSync(dir)) continue;
  const bases = fs.readdirSync(dir).filter((f) => f.endsWith('_base.jpg')).sort();
  for (const fn of bases) {
    const stem = fn.replace(/_base\.jpg$/, '');
    const v3Base = path.join(dir, fn);
    const bldBase = path.join(PUB_TEX_BLD, fn);
    // Prefer higher resolution source if tex/bld has a 2048px original (for shared/hero)
    let chosen = v3Base;
    const dV3 = jpgDims(fs.readFileSync(v3Base));
    if (fs.existsSync(bldBase)) {
      const dBld = jpgDims(fs.readFileSync(bldBase));
      if (dBld[0] > dV3[0]) chosen = bldBase;
    }
    const chosenDims = jpgDims(fs.readFileSync(chosen));
    const relPath = `textures-v3/${sub}/${stem}_base.jpg`;
    zip.addFile(relPath, chosen, false);
    const profile = sub === 'shared'
      ? (SHARED_MATERIAL_PROFILES[stem] || { class: 'masonry', rgh: [0.65, 0.92], mtl: [0.0, 0.05], relief: 0.9, seamless: true })
      : { class: 'hero-facade', rgh: [0.03, 0.92], mtl: [0.0, 0.85], relief: 1.05, seamless: false };
    manifestTextures.push({
      stem,
      group: sub,
      src: relPath,
      srcSize: chosenDims,
      targetBaseRes: 2048,
      targetPbrRes: sub === 'shared' ? 1024 : 2048,
      ...profile,
    });
  }
}

// 3. Pack Ironport v3 building models (36 heroes + 150 generics, or heroes only for --subset hero)
const manifestModels = [];
const kinds = subset === 'hero' ? ['hero'] : ['hero', 'generic'];
for (const kind of kinds) {
  const dir = path.join(PUB_IRONPORT, 'models-v3', kind);
  if (!fs.existsSync(dir)) continue;
  const gltfs = fs.readdirSync(dir).filter((f) => f.endsWith('_lod0.gltf')).sort();
  for (const fn of gltfs) {
    const slug = fn.replace(/_lod0\.gltf$/, '');
    const gPath = path.join(dir, fn);
    const bName = fn.replace(/\.gltf$/, '.bin');
    const bPath = path.join(dir, bName);
    if (!fs.existsSync(bPath)) continue;
    zip.addFile(`models-v3/${kind}/${fn}`, gPath, true);
    zip.addFile(`models-v3/${kind}/${bName}`, bPath, true);
    manifestModels.push({
      id: `${kind}/${slug}`,
      kind,
      slug,
      gltf: `models-v3/${kind}/${fn}`,
      bin: `models-v3/${kind}/${bName}`,
      placements: placements[`${kind}/${slug}`] || 0,
    });
  }
}

const manifest = {
  project: 'Plajah Motorsport: Apex',
  version: 4,
  subset,
  modeler: 'Plajah Native Architectural Modeler v4 (Zero Blender)',
  createdAt: new Date().toISOString(),
  counts: {
    textures: manifestTextures.length,
    sharedTextures: manifestTextures.filter((t) => t.group === 'shared').length,
    heroTextures: manifestTextures.filter((t) => t.group === 'hero-facades').length,
    models: manifestModels.length,
    heroModels: manifestModels.filter((m) => m.kind === 'hero').length,
    genericModels: manifestModels.filter((m) => m.kind === 'generic').length,
  },
  textures: manifestTextures,
  models: manifestModels,
};

zip.addBuffer('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'), true);

await zip.writeTo(outPath);
const mb = (fs.statSync(outPath).size / 1e6).toFixed(2);
console.log(`PACKED: ${outPath} (${mb} MB)`);
console.log('Counts:', JSON.stringify(manifest.counts));
