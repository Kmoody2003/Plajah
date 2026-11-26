#!/usr/bin/env node
/**
 * prep_rural_omni_colab.mjs — Pure-Node CPU packager for Plajah Motorsport: Apex Rural Architecture
 * Colab Pro+ Omni/FLUX/ControlNet-Canny & Hunyuan3D-Paint 360° pipeline.
 *
 * Zero local GPU or AI model execution! Runs in ~1s on CPU and creates:
 *   tmp/apex-colab/rural_omni_inputs.zip
 * containing for all 6 Michigan rural hero archetypes:
 *   - `<id>/mesh.glb`        : Clean UV-unwrapped glTF 2.0 binary building mesh (exact in-game proportions)
 *   - `<id>/blueprint.png`   : 1024x1024 color-coded architectural elevation UV guide
 *   - `<id>/canny.png`       : 1024x1024 pixel-locked architectural lineart for ControlNet-Canny UV painting
 *   - `manifest.json`        : Photoreal prompts, negative prompts, dimensions, and physical PBR priors
 *
 * Usage:
 *   node games/apex/tools/colab/prep_rural_omni_colab.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const OUT_DIR = path.join(REPO_ROOT, 'tmp/apex-colab');
const STAGE_DIR = path.join(OUT_DIR, 'rural_omni_stage');
const OUT_ZIP = path.join(OUT_DIR, 'rural_omni_inputs.zip');

// ── CRC32 (shared by PNG & ZIP encoders) ──────────────────────────────────────
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── Pure-Node RGB PNG encoder ─────────────────────────────────────────────────
function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePngRgb(width, height, rgb) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter None
    rgb.copy(raw, y * stride + 1, y * width * 3, (y + 1) * width * 3);
  }
  const idat = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

// ── Minimal 2D rasterizer for pixel-locked architectural UV blueprints & Canny guides ─
class CanvasRgb {
  constructor(w, h, bg = [18, 18, 20]) {
    this.w = w;
    this.h = h;
    this.buf = Buffer.alloc(w * h * 3);
    this.fillRect(0, 0, w, h, bg);
  }
  setPx(x, y, col) {
    const ix = x | 0, iy = y | 0;
    if (ix < 0 || ix >= this.w || iy < 0 || iy >= this.h) return;
    const o = (iy * this.w + ix) * 3;
    this.buf[o] = col[0];
    this.buf[o + 1] = col[1];
    this.buf[o + 2] = col[2];
  }
  fillRect(x, y, w, h, col) {
    const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.w, Math.round(x + w)), y1 = Math.min(this.h, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) {
      let o = (yy * this.w + x0) * 3;
      for (let xx = x0; xx < x1; xx++) {
        this.buf[o++] = col[0];
        this.buf[o++] = col[1];
        this.buf[o++] = col[2];
      }
    }
  }
  strokeRect(x, y, w, h, col, lw = 2) {
    this.fillRect(x, y, w, lw, col);
    this.fillRect(x, y + h - lw, w, lw, col);
    this.fillRect(x, y, lw, h, col);
    this.fillRect(x + w - lw, y, lw, h, col);
  }
  line(x0, y0, x1, y1, col, lw = 2) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    const r = Math.floor(lw * 0.5);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = Math.round(x0 + (x1 - x0) * t);
      const py = Math.round(y0 + (y1 - y0) * t);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) this.setPx(px + dx, py + dy, col);
      }
    }
  }
  toPng() {
    return encodePngRgb(this.w, this.h, this.buf);
  }
}

// ── Pure-Node glTF 2.0 binary (.glb) builder with clean 2-material UV layout ──
function pushBox(target, cx, cy, cz, sx, sy, sz, faceFilter = null) {
  const hx = sx * 0.5, hy = sy * 0.5, hz = sz * 0.5;
  const faces = [
    { name: '+z', n: [0, 0, 1], v: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
    { name: '-z', n: [0, 0, -1], v: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
    { name: '+x', n: [1, 0, 0], v: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
    { name: '-x', n: [-1, 0, 0], v: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
    { name: '+y', n: [0, 1, 0], v: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]] },
    { name: '-y', n: [0, -1, 0], v: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] },
  ];
  const uvs = [[0, 1], [1, 1], [1, 0], [0, 0]];
  for (const f of faces) {
    if (faceFilter && !faceFilter(f.name)) continue;
    const base = target.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      target.pos.push(cx + f.v[i][0], cy + f.v[i][1], cz + f.v[i][2]);
      target.nrm.push(f.n[0], f.n[1], f.n[2]);
      target.uv.push(uvs[i][0], uvs[i][1]);
    }
    target.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function pushGablePrism(target, cx, yBase, cz, w, peakH, d) {
  const hx = w * 0.5, hz = d * 0.5;
  // Front & back triangles + two roof slopes
  const tris = [
    // front +z
    { p: [[-hx, yBase, hz], [hx, yBase, hz], [0, yBase + peakH, hz]], n: [0, 0, 1], u: [[0, 1], [1, 1], [0.5, 0]] },
    // back -z
    { p: [[hx, yBase, -hz], [-hx, yBase, -hz], [0, yBase + peakH, -hz]], n: [0, 0, -1], u: [[0, 1], [1, 1], [0.5, 0]] },
  ];
  for (const t of tris) {
    const base = target.pos.length / 3;
    for (let i = 0; i < 3; i++) {
      target.pos.push(cx + t.p[i][0], t.p[i][1], cz + t.p[i][2]);
      target.nrm.push(t.n[0], t.n[1], t.n[2]);
      target.uv.push(t.u[i][0], t.u[i][1]);
    }
    target.idx.push(base, base + 1, base + 2);
  }
  // Roof slopes
  const sl = Math.hypot(hx, peakH);
  const nx = peakH / sl, ny = hx / sl;
  const quads = [
    { p: [[hx, yBase, hz], [hx, yBase, -hz], [0, yBase + peakH, -hz], [0, yBase + peakH, hz]], n: [nx, ny, 0] },
    { p: [[-hx, yBase, -hz], [-hx, yBase, hz], [0, yBase + peakH, hz], [0, yBase + peakH, -hz]], n: [-nx, ny, 0] },
  ];
  const quv = [[0, 1], [1, 1], [1, 0], [0, 0]];
  for (const q of quads) {
    const base = target.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      target.pos.push(cx + q.p[i][0], q.p[i][1], cz + q.p[i][2]);
      target.nrm.push(q.n[0], q.n[1], q.n[2]);
      target.uv.push(quv[i][0], quv[i][1]);
    }
    target.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function buildGlb(arch) {
  const front = { pos: [], nrm: [], uv: [], idx: [] };
  const shell = { pos: [], nrm: [], uv: [], idx: [] };
  const { w, h, d, gableH = 0, cornice = false } = arch.dims;
  // Hero front facade (+Z) cleanly mapped to [0..1, 0..1] on material 0
  pushBox(front, 0, h * 0.5, 0, w, h, d, (f) => f === '+z');
  // Side/back/roof architectural shell on material 1
  pushBox(shell, 0, h * 0.5, 0, w, h, d, (f) => f !== '+z');
  // Stepped stone foundation plinth
  pushBox(shell, 0, -0.35, 0, w + 0.5, 0.7, d + 0.5);
  if (cornice) {
    pushBox(shell, 0, h + 0.26, 0, w + 0.65, 0.52, d + 0.65);
    pushBox(shell, 0, h + 0.76, d * 0.5 - 0.26, w + 0.16, 0.68, 0.52);
  }
  if (gableH > 0) {
    pushGablePrism(shell, 0, h, 0, w, gableH, d);
  }

  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  let byteOff = 0;

  function addArr(typedArr, target, componentType, type, trackMinMax = false) {
    const raw = Buffer.from(typedArr.buffer, typedArr.byteOffset, typedArr.byteLength);
    const pad = (4 - (raw.length % 4)) % 4;
    const buf = pad ? Buffer.concat([raw, Buffer.alloc(pad)]) : raw;
    chunks.push(buf);
    const bvIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset: byteOff, byteLength: raw.length, ...(target ? { target } : {}) });
    byteOff += buf.length;

    const comps = type === 'SCALAR' ? 1 : type === 'VEC2' ? 2 : 3;
    const count = typedArr.length / comps;
    const acc = { bufferView: bvIdx, componentType, count, type };
    if (trackMinMax && comps === 3) {
      const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < typedArr.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          if (typedArr[i + k] < mn[k]) mn[k] = typedArr[i + k];
          if (typedArr[i + k] > mx[k]) mx[k] = typedArr[i + k];
        }
      }
      acc.min = mn;
      acc.max = mx;
    }
    const accIdx = accessors.length;
    accessors.push(acc);
    return accIdx;
  }

  const prims = [];
  for (const [matIdx, part] of [[0, front], [1, shell]]) {
    if (!part.idx.length) continue;
    const pAcc = addArr(new Float32Array(part.pos), 34962, 5126, 'VEC3', true);
    const nAcc = addArr(new Float32Array(part.nrm), 34962, 5126, 'VEC3', false);
    const uAcc = addArr(new Float32Array(part.uv), 34962, 5126, 'VEC2', false);
    const iAcc = addArr(new Uint16Array(part.idx), 34963, 5123, 'SCALAR', false);
    prims.push({ attributes: { POSITION: pAcc, NORMAL: nAcc, TEXCOORD_0: uAcc }, indices: iAcc, material: matIdx });
  }

  const binBuf = Buffer.concat(chunks);
  const gltf = {
    asset: { version: '2.0', generator: 'Plajah Apex Rural Architectural UV Packager v1' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: arch.id }],
    materials: [
      { name: `${arch.id}_hero_facade`, pbrMetallicRoughness: { baseColorFactor: [0.82, 0.78, 0.74, 1], roughnessFactor: 0.84, metallicFactor: 0.04 } },
      { name: `${arch.id}_shell`, pbrMetallicRoughness: { baseColorFactor: [0.68, 0.65, 0.62, 1], roughnessFactor: 0.86, metallicFactor: 0.05 } },
    ],
    meshes: [{ name: arch.id, primitives: prims }],
    buffers: [{ byteLength: binBuf.length }],
    bufferViews,
    accessors,
  };

  let jsonBuf = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jPad = (4 - (jsonBuf.length % 4)) % 4;
  if (jPad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jPad, 0x20)]);

  const totalLen = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLen, 8);

  const jHdr = Buffer.alloc(8);
  jHdr.writeUInt32LE(jsonBuf.length, 0);
  jHdr.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

  const bHdr = Buffer.alloc(8);
  bHdr.writeUInt32LE(binBuf.length, 0);
  bHdr.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

  return Buffer.concat([header, jHdr, jsonBuf, bHdr, binBuf]);
}

// ── 6 Michigan Rural Architectural Archetypes (pixel-locked to ruralTownsAndRoads.ts & ruralDetail.ts!) ──
const ARCHETYPES = [
  {
    id: 'rural_storefront_brick',
    label: 'Kettle Crossing Red-Brick General Store & Hardware',
    dims: { w: 15.0, h: 10.0, d: 12.5, gableH: 0, cornice: true },
    roughnessBase: 0.84,
    metalnessBase: 0.04,
    prompt:
      'Orthographic straight-on architectural elevation photograph of a historic 1890s Michigan small-town two-story red-brick Main Street general store and hardware storefront, crisp weathered red-clay running-bond brickwork with lime mortar joints, corbeled brick roof cornice, dressed limestone belt course between floors, painted dark-navy wooden fascia signboard reading KETTLE CROSSING HARDWARE in cream serif lettering, three upper-story tall double-hung 6-over-6 sash windows with carved limestone lintels and sills, ground floor recessed dark timber double entry door with glass transom flanked by two large wood-framed shopfront display windows showing warm dimly lit hardware shelving inside, limestone foundation plinth, soft overcast diffused daylight, zero perspective distortion, flat architectural front elevation, ultra-detailed 8k photogrammetry texture',
    negativePrompt:
      'perspective distortion, angled view, side view, sky, street, cars, trees, people, shadows, strong sunlight, blurry, cartoon, painterly, watermark, CGI plastic',
    drawGuide(bp, cn) {
      const W = bp.w, H = bp.h;
      const white = [255, 255, 255], soft = [170, 170, 170];
      bp.fillRect(0, 0, W, H, [154, 76, 56]); // red brick
      // Brick courses hint on Canny (subtle mortar rhythm)
      for (let y = 78; y < H - 72; y += 28) bp.fillRect(24, y, W - 48, 2, [132, 62, 46]);
      // Top brick cornice & stone cap (y: 0..84)
      bp.fillRect(0, 0, W, 76, [196, 186, 168]);
      cn.fillRect(0, 26, W, 3, white);
      cn.fillRect(0, 56, W, 3, white);
      cn.fillRect(0, 76, W, 4, white);
      // Corner pilasters
      for (const px of [0, W - 42]) {
        bp.fillRect(px, 76, 42, H - 140, [188, 178, 160]);
        cn.strokeRect(px, 76, 42, H - 140, white, 3);
      }
      // 3 upper-story tall sash windows (matching pushFramedWindow at y=7.15/10 -> top ~140..420)
      for (const cx of [0.22 * W, 0.50 * W, 0.78 * W]) {
        const ww = 126, wh = 232, x0 = cx - ww * 0.5, y0 = 152;
        bp.fillRect(x0 - 16, y0 - 24, ww + 32, 24, [205, 196, 178]); // stone lintel
        bp.fillRect(x0 - 12, y0 + wh, ww + 24, 18, [205, 196, 178]); // stone sill
        bp.fillRect(x0, y0, ww, wh, [44, 62, 82]); // dark reflective glass
        cn.strokeRect(x0 - 16, y0 - 24, ww + 32, 24, white, 3);
        cn.strokeRect(x0 - 12, y0 + wh, ww + 24, 18, white, 3);
        cn.strokeRect(x0, y0, ww, wh, white, 4);
        cn.fillRect(cx - 2, y0, 4, wh, white);
        cn.fillRect(x0, y0 + wh * 0.48, ww, 5, white);
        cn.fillRect(x0, y0 + wh * 0.24, ww, 2, soft);
        cn.fillRect(x0, y0 + wh * 0.74, ww, 2, soft);
      }
      // Signboard fascia + limestone belt course (y: 468..598)
      bp.fillRect(150, 476, W - 300, 88, [28, 42, 62]);
      cn.strokeRect(150, 476, W - 300, 88, white, 4);
      cn.strokeRect(164, 490, W - 328, 60, soft, 2);
      bp.fillRect(0, 574, W, 32, [204, 195, 178]);
      cn.fillRect(0, 574, W, 4, white);
      cn.fillRect(0, 604, W, 4, white);
      // Ground floor: central recessed timber door + transom + 2 broad shopfront display bays
      const dw = 136, dh = 278, dx = W * 0.5 - dw * 0.5, dy = H - 64 - dh;
      bp.fillRect(dx, dy - 44, dw, 40, [48, 68, 88]); // transom
      bp.fillRect(dx, dy, dw, dh, [96, 58, 36]); // wood door
      cn.strokeRect(dx, dy - 44, dw, 40, white, 3);
      cn.strokeRect(dx, dy, dw, dh, white, 4);
      cn.fillRect(W * 0.5 - 2, dy, 4, dh, white);
      cn.strokeRect(dx + 16, dy + 22, 42, 118, soft, 2);
      cn.strokeRect(dx + dw - 58, dy + 22, 42, 118, soft, 2);
      for (const sx of [0.22 * W, 0.78 * W]) {
        const bw = 278, bh = 250, bx = sx - bw * 0.5, by = 648;
        bp.fillRect(bx, by, bw, bh, [42, 64, 84]);
        bp.fillRect(bx, by + bh, bw, 62, [138, 68, 52]); // brick kickplate
        cn.strokeRect(bx, by, bw, bh, white, 4);
        cn.fillRect(sx - 2, by, 4, bh, white);
        cn.fillRect(bx, by + 56, bw, 3, white);
        cn.strokeRect(bx, by + bh, bw, 62, white, 3);
      }
      // Stone plinth base
      bp.fillRect(0, H - 64, W, 64, [182, 176, 166]);
      cn.fillRect(0, H - 64, W, 4, white);
    },
  },
  {
    id: 'rural_storefront_diner',
    label: 'Midwest Country Diner & Corner Bakery',
    dims: { w: 14.5, h: 9.8, d: 12.0, gableH: 0, cornice: true },
    roughnessBase: 0.80,
    metalnessBase: 0.06,
    prompt:
      'Orthographic straight-on architectural elevation photograph of a classic Midwest Michigan small-town brick and warm tan glazed-brick corner diner and bakery storefront, stepped parapet roof with terracotta coping, upper-story four double-hung wood windows with cream frames and brick arches, weathered vintage painted fascia sign reading ROADSIDE DINER & BAKERY, crimson-and-cream striped shopfront transom trim above large plate-glass café windows showing warm brass pendant lamps and wooden booths inside, recessed glazed wood entry door at center, stone kickplate plinth, even overcast diffuse light, zero perspective distortion, flat orthographic facade elevation, 8k photoreal architectural PBR albedo',
    negativePrompt:
      'perspective, angled camera, street, sky, cars, people, trees, harsh sunlight, cast shadows, blurry, cartoon, 3d render plastic',
    drawGuide(bp, cn) {
      const W = bp.w, H = bp.h;
      const white = [255, 255, 255], soft = [175, 175, 175];
      bp.fillRect(0, 0, W, H, [188, 126, 78]); // warm amber/orange brick
      bp.fillRect(0, 0, W, 70, [164, 84, 62]); // terracotta parapet coping
      cn.fillRect(0, 32, W, 3, white);
      cn.fillRect(0, 70, W, 4, white);
      for (const px of [0, W - 38]) {
        bp.fillRect(px, 70, 38, H - 134, [202, 192, 174]);
        cn.strokeRect(px, 70, 38, H - 134, white, 3);
      }
      // 4 upper sash windows
      for (const frac of [0.18, 0.39, 0.61, 0.82]) {
        const cx = frac * W, ww = 108, wh = 216, x0 = cx - ww * 0.5, y0 = 160;
        bp.fillRect(x0 - 12, y0 - 20, ww + 24, 20, [214, 206, 190]);
        bp.fillRect(x0, y0, ww, wh, [44, 60, 78]);
        cn.strokeRect(x0 - 12, y0 - 20, ww + 24, 20, white, 3);
        cn.strokeRect(x0, y0, ww, wh, white, 4);
        cn.fillRect(cx - 2, y0, 4, wh, white);
        cn.fillRect(x0, y0 + wh * 0.5, ww, 4, white);
      }
      // Vintage diner fascia signboard + awning stripe valance
      bp.fillRect(110, 458, W - 220, 96, [156, 44, 38]);
      cn.strokeRect(110, 458, W - 220, 96, white, 4);
      bp.fillRect(0, 568, W, 44, [176, 52, 42]);
      cn.fillRect(0, 568, W, 4, white);
      cn.fillRect(0, 612, W, 4, white);
      for (let x = 48; x < W - 48; x += 64) cn.fillRect(x, 568, 2, 44, soft);
      // Ground floor cafe bays + center door
      const dw = 132, dh = 276, dx = W * 0.5 - dw * 0.5, dy = H - 64 - dh;
      bp.fillRect(dx, dy, dw, dh, [104, 62, 38]);
      cn.strokeRect(dx, dy, dw, dh, white, 4);
      cn.strokeRect(dx + 18, dy + 20, dw - 36, 140, white, 3);
      for (const sx of [0.23 * W, 0.77 * W]) {
        const bw = 290, bh = 256, bx = sx - bw * 0.5, by = 640;
        bp.fillRect(bx, by, bw, bh, [52, 74, 92]);
        cn.strokeRect(bx, by, bw, bh, white, 4);
        cn.fillRect(bx + bw / 3, by, 3, bh, white);
        cn.fillRect(bx + (2 * bw) / 3, by, 3, bh, white);
        cn.fillRect(bx, by + 54, bw, 3, soft);
      }
      bp.fillRect(0, H - 64, W, 64, [180, 174, 164]);
      cn.fillRect(0, H - 64, W, 4, white);
    },
  },
  {
    id: 'rural_depot_hall',
    label: 'Michigan Rail Depot & Township Hall',
    dims: { w: 14.0, h: 8.5, d: 14.0, gableH: 3.0, cornice: false },
    roughnessBase: 0.85,
    metalnessBase: 0.04,
    prompt:
      'Orthographic straight-on architectural elevation photograph of a historic Michigan rural brick-and-limestone train depot and township hall facade, weathered buff limestone rusticated stone plinth base, deep red architectural masonry walls, decorative timber roof eave brackets under slate trim frieze, dark painted station board reading KETTLE HILLS DEPOT, tall arched multi-pane ticket office windows with limestone keystones and sills, heavy oak freight & passenger double entry doors with brass hardware and arched fanlight, flat even overcast daylight, zero perspective distortion, straight architectural elevation, 8k photoreal texture',
    negativePrompt:
      'perspective, angled view, sky, clouds, trees, train, tracks, people, harsh shadows, cartoon, blurry',
    drawGuide(bp, cn) {
      const W = bp.w, H = bp.h;
      const white = [255, 255, 255], soft = [170, 170, 170];
      bp.fillRect(0, 0, W, H, [148, 74, 58]);
      bp.fillRect(0, 0, W, 88, [72, 78, 86]); // slate frieze & brackets
      cn.fillRect(0, 88, W, 4, white);
      for (let x = 64; x < W; x += 96) cn.strokeRect(x - 10, 16, 20, 72, soft, 2);
      // Station signboard
      bp.fillRect(212, 128, W - 424, 92, [28, 36, 48]);
      cn.strokeRect(212, 128, W - 424, 92, white, 4);
      // Tall civic windows left & right + central arched double entry doors
      for (const sx of [0.20 * W, 0.80 * W]) {
        const ww = 180, wh = 390, x0 = sx - ww * 0.5, y0 = 286;
        bp.fillRect(x0 - 18, y0 - 26, ww + 36, 26, [206, 198, 182]);
        bp.fillRect(x0, y0, ww, wh, [42, 60, 78]);
        cn.strokeRect(x0 - 18, y0 - 26, ww + 36, 26, white, 3);
        cn.strokeRect(x0, y0, ww, wh, white, 4);
        cn.fillRect(sx - 2, y0, 4, wh, white);
        cn.fillRect(x0, y0 + wh * 0.35, ww, 4, white);
        cn.fillRect(x0, y0 + wh * 0.68, ww, 4, white);
      }
      const dw = 216, dh = 410, dx = W * 0.5 - dw * 0.5, dy = H - 150 - dh;
      bp.fillRect(dx, dy - 72, dw, 68, [46, 66, 86]);
      bp.fillRect(dx, dy, dw, dh, [92, 56, 34]);
      cn.strokeRect(dx, dy - 72, dw, 68, white, 3);
      cn.strokeRect(dx, dy, dw, dh, white, 4);
      cn.fillRect(W * 0.5 - 3, dy, 6, dh, white);
      // Rusticated limestone plinth
      bp.fillRect(0, H - 150, W, 150, [186, 178, 162]);
      cn.fillRect(0, H - 150, W, 4, white);
      for (let y = H - 100; y < H; y += 50) cn.fillRect(0, y, W, 2, soft);
    },
  },
  {
    id: 'rural_barn_red',
    label: 'Classic Michigan Red Vertical-Board Dairy Barn',
    dims: { w: 14.0, h: 7.5, d: 20.0, gableH: 3.7, cornice: false },
    roughnessBase: 0.88,
    metalnessBase: 0.03,
    prompt:
      'Orthographic straight-on architectural elevation photograph of a classic historic Michigan weathered red vertical-board-and-batten timber dairy barn front wall, authentic sun-faded iron-oxide barn red wood planks with visible grain and knots, crisp weathered white wooden corner trim boards, heavy double sliding barn doors centered at bottom with classic crisp white X-bracing timber frames and forged black iron sliding track and strap hinges, upper centered white-trimmed square wooden hayloft loading door, paired small 6-pane white-framed stable windows flanking the sliding doors, dry-laid gray Michigan fieldstone foundation along bottom edge, soft overcast diffuse daylight, zero perspective distortion, flat architectural elevation, 8k photoreal PBR texture',
    negativePrompt:
      'perspective, angled view, roof, sky, grass, tractor, animals, harsh sunlight, cast shadows, blurry, cartoon, CGI plastic',
    drawGuide(bp, cn) {
      const W = bp.w, H = bp.h;
      const white = [255, 255, 255], soft = [150, 150, 150];
      bp.fillRect(0, 0, W, H, [142, 36, 32]); // iron-oxide barn red
      // Vertical timber planks hint
      for (let x = 44; x < W - 44; x += 40) cn.fillRect(x, 0, 1, H - 86, [64, 64, 64]);
      // White vertical corner trim
      for (const px of [0, W - 36]) {
        bp.fillRect(px, 0, 36, H - 86, [236, 232, 224]);
        cn.strokeRect(px, 0, 36, H - 86, white, 3);
      }
      // Upper centered hayloft door (matching y=7.45 -> upper band y: 68..290)
      const hw = 188, hh = 214, hx = W * 0.5 - hw * 0.5, hy = 74;
      bp.fillRect(hx - 16, hy - 16, hw + 32, hh + 32, [236, 232, 224]);
      bp.fillRect(hx, hy, hw, hh, [132, 32, 28]);
      cn.strokeRect(hx - 16, hy - 16, hw + 32, hh + 32, white, 4);
      cn.strokeRect(hx, hy, hw, hh, white, 3);
      cn.line(hx, hy, hx + hw, hy + hh, soft, 3);
      cn.line(hx + hw, hy, hx, hy + hh, soft, 3);
      // Heavy X-braced double sliding barn doors (matching width 4.9/14 = 35% of W, height 4.5/7.5 = 60% of H)
      const dw = 368, dh = 540, dx = W * 0.5 - dw * 0.5, dy = H - 86 - dh;
      bp.fillRect(dx - 24, dy - 20, dw + 48, 22, [44, 46, 50]); // iron track bar
      cn.strokeRect(dx - 24, dy - 20, dw + 48, 22, white, 3);
      bp.fillRect(dx, dy, dw, dh, [136, 34, 30]);
      cn.strokeRect(dx, dy, dw, dh, white, 5);
      cn.fillRect(W * 0.5 - 4, dy, 8, dh, white);
      // Left & right door leaf white X-braces
      const halfW = dw * 0.5;
      for (const ox of [dx, dx + halfW]) {
        cn.strokeRect(ox + 10, dy + 10, halfW - 20, dh - 20, white, 4);
        cn.line(ox + 14, dy + 14, ox + halfW - 14, dy + dh - 14, white, 5);
        cn.line(ox + halfW - 14, dy + 14, ox + 14, dy + dh - 14, white, 5);
      }
      // Flanking 6-pane stable windows
      for (const sx of [0.16 * W, 0.84 * W]) {
        const ww = 124, wh = 144, wx = sx - ww * 0.5, wy = 460;
        bp.fillRect(wx - 10, wy - 10, ww + 20, wh + 20, [236, 232, 224]);
        bp.fillRect(wx, wy, ww, wh, [38, 48, 58]);
        cn.strokeRect(wx - 10, wy - 10, ww + 20, wh + 20, white, 3);
        cn.strokeRect(wx, wy, ww, wh, white, 3);
        cn.fillRect(sx - 2, wy, 4, wh, white);
        cn.fillRect(wx, wy + wh / 3, ww, 3, white);
        cn.fillRect(wx, wy + (2 * wh) / 3, ww, 3, white);
      }
      // Michigan fieldstone foundation
      bp.fillRect(0, H - 86, W, 86, [132, 130, 126]);
      cn.fillRect(0, H - 86, W, 4, white);
    },
  },
  {
    id: 'rural_farmhouse_clapboard',
    label: 'Michigan White Clapboard Farmhouse',
    dims: { w: 10.8, h: 5.6, d: 8.8, gableH: 2.28, cornice: false },
    roughnessBase: 0.82,
    metalnessBase: 0.02,
    prompt:
      'Orthographic straight-on architectural elevation photograph of a historic Michigan white-painted horizontal cedar clapboard farmhouse front facade, crisp overlapping horizontal clapboard siding with subtle weathered paint texture, classic white corner trim boards and fascia under eaves, symmetrical pair of traditional 6-over-6 white wood double-hung sash windows with forest-green louvered wooden shutters flanking a centered paneled warm oak front entry door with brass kickplate and glass sidelight transom, neat mortared fieldstone foundation along bottom, even overcast diffused daylight, zero perspective distortion, flat architectural front elevation, 8k photoreal PBR texture',
    negativePrompt:
      'perspective, angled view, roof, porch posts obstructing wall, sky, lawn, bushes, harsh shadows, cartoon, blurry',
    drawGuide(bp, cn) {
      const W = bp.w, H = bp.h;
      const white = [255, 255, 255], soft = [155, 155, 155];
      bp.fillRect(0, 0, W, H, [232, 228, 218]); // painted white clapboard
      for (let y = 52; y < H - 84; y += 26) cn.fillRect(36, y, W - 72, 1, [82, 82, 82]);
      bp.fillRect(0, 0, W, 48, [218, 214, 206]); // roof fascia frieze
      cn.fillRect(0, 48, W, 4, white);
      for (const px of [0, W - 38]) {
        bp.fillRect(px, 48, 38, H - 132, [242, 238, 230]);
        cn.strokeRect(px, 48, 38, H - 132, white, 3);
      }
      // Centered oak entry door + transom
      const dw = 152, dh = 410, dx = W * 0.5 - dw * 0.5, dy = H - 84 - dh;
      bp.fillRect(dx - 14, dy - 72, dw + 28, 66, [52, 70, 88]);
      bp.fillRect(dx, dy, dw, dh, [108, 66, 38]);
      cn.strokeRect(dx - 14, dy - 72, dw + 28, 66, white, 3);
      cn.strokeRect(dx, dy, dw, dh, white, 4);
      cn.strokeRect(dx + 22, dy + 28, dw - 44, 150, soft, 3);
      cn.strokeRect(dx + 22, dy + 210, dw - 44, 160, soft, 3);
      // Paired shuttered 6-over-6 windows (matching ruralDetail.ts & ruralTownsAndRoads.ts!)
      for (const sx of [0.21 * W, 0.79 * W]) {
        const ww = 148, wh = 310, wx = sx - ww * 0.5, wy = 232;
        const sw = 58;
        bp.fillRect(wx - sw - 12, wy, sw, wh, [36, 62, 48]); // forest-green shutter L
        bp.fillRect(wx + ww + 12, wy, sw, wh, [36, 62, 48]); // forest-green shutter R
        bp.fillRect(wx, wy, ww, wh, [44, 62, 82]);
        cn.strokeRect(wx - sw - 12, wy, sw, wh, white, 3);
        cn.strokeRect(wx + ww + 12, wy, sw, wh, white, 3);
        cn.strokeRect(wx, wy, ww, wh, white, 4);
        cn.fillRect(sx - 2, wy, 4, wh, white);
        cn.fillRect(wx, wy + wh * 0.5, ww, 4, white);
        cn.fillRect(wx, wy + wh * 0.25, ww, 2, soft);
        cn.fillRect(wx, wy + wh * 0.75, ww, 2, soft);
      }
      bp.fillRect(0, H - 84, W, 84, [154, 150, 144]);
      cn.fillRect(0, H - 84, W, 4, white);
    },
  },
  {
    id: 'rural_church_civic',
    label: 'Michigan White Clapboard Country Church & Meeting House',
    dims: { w: 13.5, h: 8.4, d: 20.0, gableH: 3.9, cornice: false },
    roughnessBase: 0.80,
    metalnessBase: 0.03,
    prompt:
      'Orthographic straight-on architectural elevation photograph of a historic New England and Michigan white-painted clapboard country church and civic meeting house front facade, crisp white wood horizontal clapboard siding with four fluted white Greek Revival pilasters, wide classical wood entablature frieze across the top, centered double paneled dark walnut entry doors crowned by a graceful arched multi-pane fanlight transom, flanked by two tall arched multi-pane church sanctuary windows with crisp white wooden muntins, dressed limestone block foundation plinth along bottom, soft overcast diffuse daylight, zero perspective distortion, flat architectural front elevation, 8k photoreal PBR texture',
    negativePrompt:
      'perspective, angled view, steeple, sky, trees, grass, people, harsh shadows, cartoon, blurry',
    drawGuide(bp, cn) {
      const W = bp.w, H = bp.h;
      const white = [255, 255, 255], soft = [160, 160, 160];
      bp.fillRect(0, 0, W, H, [238, 235, 228]); // white clapboard
      for (let y = 96; y < H - 84; y += 24) cn.fillRect(0, y, W, 1, [78, 78, 78]);
      // Classical entablature frieze
      bp.fillRect(0, 0, W, 94, [246, 244, 238]);
      cn.fillRect(0, 32, W, 3, white);
      cn.fillRect(0, 94, W, 4, white);
      // 4 Greek Revival pilasters
      for (const frac of [0.04, 0.34, 0.66, 0.96]) {
        const px = frac * W - 24;
        bp.fillRect(px, 94, 48, H - 178, [248, 246, 240]);
        cn.strokeRect(px, 94, 48, H - 178, white, 3);
        cn.fillRect(px + 16, 112, 2, H - 214, soft);
        cn.fillRect(px + 30, 112, 2, H - 214, soft);
      }
      // Double walnut entry doors + arched fanlight
      const dw = 204, dh = 416, dx = W * 0.5 - dw * 0.5, dy = H - 84 - dh;
      bp.fillRect(dx - 16, dy - 102, dw + 32, 96, [48, 66, 86]);
      bp.fillRect(dx, dy, dw, dh, [78, 48, 30]);
      cn.strokeRect(dx - 16, dy - 102, dw + 32, 96, white, 4);
      cn.strokeRect(dx, dy, dw, dh, white, 4);
      cn.fillRect(W * 0.5 - 3, dy, 6, dh, white);
      // Tall flanking sanctuary windows
      for (const sx of [0.19 * W, 0.81 * W]) {
        const ww = 152, wh = 468, wx = sx - ww * 0.5, wy = 236;
        bp.fillRect(wx, wy, ww, wh, [44, 64, 86]);
        cn.strokeRect(wx, wy, ww, wh, white, 4);
        cn.fillRect(sx - 2, wy, 4, wh, white);
        for (let f = 0.2; f < 0.95; f += 0.2) cn.fillRect(wx, wy + wh * f, ww, 3, soft);
      }
      bp.fillRect(0, H - 84, W, 84, [188, 182, 170]);
      cn.fillRect(0, H - 84, W, 4, white);
    },
  },
];

// ── Pure-Node ZIP writer (deflate + Central Directory, zero external deps) ───
function writeZip(fileMap, outPath) {
  const localParts = [];
  const cdParts = [];
  let offset = 0;
  for (const [name, data] of fileMap) {
    const nameBuf = Buffer.from(name.replace(/\\/g, '/'), 'utf8');
    const comp = zlib.deflateRawSync(data, { level: 6 });
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(8, 8); // deflate
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    localParts.push(lh, nameBuf, comp);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    cdParts.push(cd, nameBuf);

    offset += lh.length + nameBuf.length + comp.length;
  }
  const cdBuf = Buffer.concat(cdParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(fileMap.length, 8);
  eocd.writeUInt16LE(fileMap.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.concat([...localParts, cdBuf, eocd]));
}

// ── Main ──────────────────────────────────────────────────────────────────────
fs.mkdirSync(STAGE_DIR, { recursive: true });
const zipFiles = [];
const manifestItems = [];

for (const arch of ARCHETYPES) {
  const dir = path.join(STAGE_DIR, arch.id);
  fs.mkdirSync(dir, { recursive: true });

  const bp = new CanvasRgb(1024, 1024, [24, 24, 28]);
  const cn = new CanvasRgb(1024, 1024, [0, 0, 0]);
  arch.drawGuide(bp, cn);

  const bpPng = bp.toPng();
  const cnPng = cn.toPng();
  const glbBuf = buildGlb(arch);

  fs.writeFileSync(path.join(dir, 'blueprint.png'), bpPng);
  fs.writeFileSync(path.join(dir, 'canny.png'), cnPng);
  fs.writeFileSync(path.join(dir, 'mesh.glb'), glbBuf);

  zipFiles.push([`${arch.id}/blueprint.png`, bpPng]);
  zipFiles.push([`${arch.id}/canny.png`, cnPng]);
  zipFiles.push([`${arch.id}/mesh.glb`, glbBuf]);

  manifestItems.push({
    id: arch.id,
    label: arch.label,
    dims: arch.dims,
    roughnessBase: arch.roughnessBase,
    metalnessBase: arch.metalnessBase,
    mesh: `${arch.id}/mesh.glb`,
    blueprint: `${arch.id}/blueprint.png`,
    canny: `${arch.id}/canny.png`,
    prompt: arch.prompt,
    negativePrompt: arch.negativePrompt,
  });
  console.log(`  [${arch.id}] UV mesh (${glbBuf.length} B) + 1024px blueprint & Canny guide ready`);
}

const manifest = {
  version: 1,
  project: 'Plajah Motorsport: Apex — Rural Architecture Omni/FLUX UV Painter',
  generatedAt: new Date().toISOString(),
  items: manifestItems,
};
const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
fs.writeFileSync(path.join(STAGE_DIR, 'manifest.json'), manifestBuf);
zipFiles.push(['manifest.json', manifestBuf]);

writeZip(zipFiles, OUT_ZIP);
console.log(`\nDONE! Packaged ${ARCHETYPES.length} rural hero archetypes -> ${OUT_ZIP} (${(fs.statSync(OUT_ZIP).size / 1e3).toFixed(1)} KB)`);
console.log('Next step: Upload games/apex/tools/colab/apex_rural_omni_colab.ipynb + tmp/apex-colab/rural_omni_inputs.zip to Colab Pro+ (A100/L4) and run all cells.');
