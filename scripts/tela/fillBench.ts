// fillBench — measures Tela's content-aware fill (services/tela/raster/patchmatch.ts) against the hidden original.
//
// For each case a hole is cut out of an intact photo, filled, and scored against the pixels that were there:
//   PSNR      over the hole (higher is better; 25+ dB is a convincing texture fill, 30+ is near-invisible)
//   seam      mean |fill − original| on the 2-px ring just inside the hole edge (what the eye reads as a cut line)
//   gradSeam  mean |∇fill − ∇original| across the boundary — brightness/colour steps the eye reads as a patch
//   ms        wall time at this size
// A contact sheet (original | hole | fill | |diff|) is written per case so the numbers can be checked by eye.
//
// Run:  npx tsx scripts/tela/fillBench.ts [--size 768] [--out <dir>] [--window] [--case <name>] [--label <tag>]
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { contentAwareFill, type ContentAwareOptions } from '../../services/tela/raster/patchmatch';
import type { Bitmap8, Mask8 } from '../../services/tela/raster/buffer';
import { synthesizeGenerativeFill, sidecarInpaintBody, createDistanceFeatheredMaskBitmap, type GenerativeFillIO } from '../../services/tela/telaInpaintService';

// ── --engine flux: the production generative-fill core (PatchMatch pre-fill → context crop → on-device sidecar → stitch →
//    harmonise → feathered layer mask), driven from Node with sharp for PNG and fetch to the sidecar on 127.0.0.1:51122.
const SIDECAR = process.env.PLAJAH_SIDECAR || 'http://127.0.0.1:51123'; // Tela Diffusion Runtime (51122 = legacy sidecar)
/** A prompt per case for the guided mode (what a user would type); autonomous mode sends none. */
const GUIDED_PROMPTS: Record<string, string> = {
  'forest-foliage': 'a mossy boulder among the ferns',
  'forest-trunks': 'a tall straight pine trunk with grey bark',
  'dawn-sky-gradient': 'a small flock of birds in the distance',
  'dawn-horizon': 'a small wooden rowing boat floating on the still water',
  'ginseng-still-life': 'a small red-capped mushroom on the straw',
};
async function pngDataUrl(bm: Bitmap8): Promise<string> {
  const buf = await sharp(Buffer.from(bm.data.buffer, bm.data.byteOffset, bm.data.length), { raw: { width: bm.width, height: bm.height, channels: 4 } }).png().toBuffer();
  return `data:image/png;base64,${buf.toString('base64')}`;
}
async function bitmapFromDataUrl(url: string, w: number, h: number): Promise<Bitmap8> {
  const b64 = url.slice(url.indexOf(',') + 1);
  const { data, info } = await sharp(Buffer.from(b64, 'base64')).resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}
const nodeIO: GenerativeFillIO = {
  contentAwareFill: async (image, hole, opts) => contentAwareFill(image, hole, opts),
  gpuFill: async (crop, mask, args) => {
    const maskRgba = new Uint8ClampedArray(crop.width * crop.height * 4);
    for (let i = 0; i < mask.data.length; i++) { const v = mask.data[i], p = i * 4; maskRgba[p] = v; maskRgba[p + 1] = v; maskRgba[p + 2] = v; maskRgba[p + 3] = 255; }
    const body = sidecarInpaintBody(await pngDataUrl(crop), await pngDataUrl({ width: crop.width, height: crop.height, data: maskRgba }), { ...args, width: crop.width, height: crop.height });
    const t0 = Date.now();
    const r = await fetch(`${SIDECAR}/tela/inpaint`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15 * 60e3) });
    const data: any = await r.json().catch(() => ({}));
    if (!r.ok || !data?.mediaUrl) {
      const err = `sidecar ${r.status}: ${String(data?.error || data?.message || '').slice(0, 300)}`;
      console.warn(`   ${err}`); // the fill core swallows this and keeps the PatchMatch result
      throw new Error(err);
    }
    console.log(`   sidecar: ${crop.width}×${crop.height} crop, ${args.inpaintMode}, ${data.modelUsed || '?'}, ${Math.round((Date.now() - t0) / 1000)} s${data.synthesizedPrompt ? ` · prompt: ${String(data.synthesizedPrompt).slice(0, 110)}` : ''}`);
    return { bitmap: await bitmapFromDataUrl(data.mediaUrl, crop.width, crop.height), modelUsed: typeof data.modelUsed === 'string' ? data.modelUsed : undefined };
  },
};
/** The production fill composited the way the Tela layer shows it: synthesis under a distance-feathered alpha mask. */
async function fluxFill(orig: Bitmap8, hole: Mask8, prompt: string | undefined, seed: number) {
  const modelId = opt('model') as any; // auto | lama | sdxl_inpaint | flux3_klein … (sidecar routing)
  const core = await synthesizeGenerativeFill(orig, hole, { prompt, seed, modelId }, nodeIO);
  const alpha = createDistanceFeatheredMaskBitmap(core.binary, 12);
  const out: Bitmap8 = { width: orig.width, height: orig.height, data: new Uint8ClampedArray(orig.data) };
  for (let i = 0; i < orig.width * orig.height; i++) {
    const a = alpha.data[i * 4 + 3] / 255; if (!a) continue;
    for (let k = 0; k < 3; k++) out.data[i * 4 + k] = Math.round(orig.data[i * 4 + k] * (1 - a) + core.bitmap.data[i * 4 + k] * a);
  }
  return { out, core };
}

type Hole = { kind: 'rect' | 'ellipse'; x: number; y: number; w: number; h: number }; // fractions of the image
type Case = { name: string; file: string; hole: Hole; note: string };

/** Holes are placed over intact texture, structure, or gradient so the original is a fair ground truth. */
const CASES: Case[] = [
  { name: 'forest-foliage', file: 'public/backdrops/forest-01.jpg', hole: { kind: 'ellipse', x: 0.40, y: 0.42, w: 0.18, h: 0.16 }, note: 'stochastic foliage texture' },
  { name: 'forest-trunks', file: 'public/backdrops/forest-02.jpg', hole: { kind: 'rect', x: 0.30, y: 0.25, w: 0.14, h: 0.30 }, note: 'vertical structure crossing the hole' },
  { name: 'dawn-sky-gradient', file: 'public/sanctuary-plates/calm-galilee-dawn.jpg', hole: { kind: 'rect', x: 0.42, y: 0.08, w: 0.22, h: 0.22 }, note: 'smooth sky gradient (colour adaptation)' },
  { name: 'dawn-horizon', file: 'public/sanctuary-plates/calm-galilee-dawn.jpg', hole: { kind: 'ellipse', x: 0.55, y: 0.50, w: 0.16, h: 0.14 }, note: 'horizon line / water edge continuity' },
  { name: 'ginseng-still-life', file: 'public/holistic/ginseng.jpg', hole: { kind: 'ellipse', x: 0.52, y: 0.56, w: 0.16, h: 0.16 }, note: 'object removal in a lit still life' },
];

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? (args[i + 1] ?? '') : d; };
const SIZE = Number(opt('size', '768'));
const OUT = opt('out', path.join(process.env.TEMP || '.', 'fill-bench'))!;
const ONLY = opt('case');
const LABEL = opt('label', 'baseline')!;
const WINDOW = args.includes('--window');
const ENGINE = opt('engine', 'patchmatch')!; // patchmatch | flux
const GUIDED = args.includes('--guided');
mkdirSync(OUT, { recursive: true });

async function loadBitmap(file: string, size: number): Promise<Bitmap8> {
  const { data, info } = await sharp(file).resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}
function holeMask(W: number, H: number, h: Hole): Mask8 {
  const m: Mask8 = { width: W, height: H, data: new Uint8Array(W * H) };
  const x0 = h.x * W, y0 = h.y * H, w = h.w * W, hh = h.h * H, cx = x0 + w / 2, cy = y0 + hh / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const inside = h.kind === 'rect' ? x >= x0 && x < x0 + w && y >= y0 && y < y0 + hh : ((x + 0.5 - cx) / (w / 2)) ** 2 + ((y + 0.5 - cy) / (hh / 2)) ** 2 <= 1;
    if (inside) m.data[y * W + x] = 255;
  }
  return m;
}
function score(orig: Bitmap8, fill: Bitmap8, hole: Mask8) {
  const { width: W, height: H } = orig;
  let se = 0, n = 0, seam = 0, ns = 0, gseam = 0, ng = 0;
  const inHole = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && hole.data[y * W + x] > 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!hole.data[i]) continue;
    let d2 = 0; for (let k = 0; k < 3; k++) { const d = fill.data[i * 4 + k] - orig.data[i * 4 + k]; d2 += d * d; }
    se += d2; n++;
    // ring: hole pixels within 2 px of a non-hole pixel
    let edge = false; for (let j = -2; j <= 2 && !edge; j++) for (let ii = -2; ii <= 2; ii++) if (!inHole(x + ii, y + j) && x + ii >= 0 && y + j >= 0 && x + ii < W && y + j < H) { edge = true; break; }
    if (edge) {
      for (let k = 0; k < 3; k++) seam += Math.abs(fill.data[i * 4 + k] - orig.data[i * 4 + k]); ns += 3;
      // gradient across the boundary: compare the step from this pixel to each outside neighbour
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H || inHole(xx, yy)) continue;
        const q = yy * W + xx;
        for (let k = 0; k < 3; k++) { const gf = fill.data[i * 4 + k] - fill.data[q * 4 + k], go = orig.data[i * 4 + k] - orig.data[q * 4 + k]; gseam += Math.abs(gf - go); ng++; }
      }
    }
  }
  const mse = se / Math.max(1, n * 3);
  // crispness: high-pass energy (|pixel − 3×3 mean| of luma) inside the hole, fill vs original; 1.0 = same detail,
  // < 0.8 reads as blur / haze, > 1.3 as noise
  const luma = (b: Bitmap8, i: number) => 0.299 * b.data[i * 4] + 0.587 * b.data[i * 4 + 1] + 0.114 * b.data[i * 4 + 2];
  // ring = known pixels within 24 px of the hole (the surround the fill has to match)
  const ring = new Uint8Array(W * H);
  { let fr: number[] = []; const dist = new Int32Array(W * H).fill(-1);
    for (let i = 0; i < W * H; i++) if (hole.data[i]) { dist[i] = 0; fr.push(i); }
    for (let d = 1; fr.length && d <= 24; d++) { const nx: number[] = []; for (const i of fr) { const x = i % W, y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const q = yy * W + xx; if (dist[q] >= 0) continue; dist[q] = d; ring[q] = 1; nx.push(q); } } fr = nx; } }
  const hp = (b: Bitmap8, where: Uint8Array) => { let s = 0, c = 0; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; if (!where[i]) continue; let m = 0; for (let j = -1; j <= 1; j++) for (let ii = -1; ii <= 1; ii++) m += luma(b, i + j * W + ii); s += Math.abs(luma(b, i) - m / 9); c++; } return s / Math.max(1, c); };
  const crisp = hp(fill, hole.data) / Math.max(1e-3, hp(orig, hole.data));
  const crispCtx = hp(fill, hole.data) / Math.max(1e-3, hp(orig, ring));
  return { psnr: mse > 0 ? 10 * Math.log10(255 * 255 / mse) : 99, seam: seam / Math.max(1, ns), gradSeam: gseam / Math.max(1, ng), crisp, crispCtx, holePx: n };
}
async function sheet(file: string, orig: Bitmap8, hole: Mask8, fill: Bitmap8) {
  const { width: W, height: H } = orig;
  const holed = new Uint8ClampedArray(orig.data), diff = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    if (hole.data[i]) { holed[i * 4] = 212; holed[i * 4 + 1] = 0; holed[i * 4 + 2] = 85; }
    let d = 0; for (let k = 0; k < 3; k++) d += Math.abs(fill.data[i * 4 + k] - orig.data[i * 4 + k]);
    const v = Math.min(255, d); diff[i * 4] = v; diff[i * 4 + 1] = v; diff[i * 4 + 2] = v; diff[i * 4 + 3] = 255;
  }
  const panel = (d: Uint8ClampedArray) => ({ input: Buffer.from(d.buffer, d.byteOffset, d.length), raw: { width: W, height: H, channels: 4 as const } });
  const panels = [orig.data, holed, fill.data, diff].map(panel);
  await sharp({ create: { width: W * 4 + 24, height: H, channels: 4, background: { r: 16, g: 11, b: 23, alpha: 1 } } })
    .composite(panels.map((p, i) => ({ input: p.input, raw: p.raw, left: i * (W + 8), top: 0 })))
    .png().toFile(file);
}

async function main() {
  const rows: string[] = [];
  const opts: ContentAwareOptions = { seed: 7, window: WINDOW || undefined };
  if (opt('locality') !== undefined) opts.locality = Number(opt('locality'));
  if (opt('texture') !== undefined) opts.textureMatch = Number(opt('texture'));
  if (args.includes('--no-adapt')) opts.colorAdapt = false;
  if (args.includes('--no-seam')) opts.seamBlend = false;
  for (const c of CASES) {
    if (ONLY && c.name !== ONLY) continue;
    const orig = await loadBitmap(c.file, SIZE);
    const hole = holeMask(orig.width, orig.height, c.hole);
    const t0 = performance.now();
    let fill: Bitmap8, note = '';
    if (ENGINE === 'flux') {
      const { out, core } = await fluxFill(orig, hole, GUIDED ? GUIDED_PROMPTS[c.name] : undefined, 7);
      fill = out; note = ` · ${core.engine}${core.modelUsed ? ` (${core.modelUsed})` : ''} · ${core.intent}${core.crop ? ` · crop ${core.crop.w}×${core.crop.h}` : ''}`;
    } else fill = contentAwareFill(orig, hole, opts);
    const ms = Math.round(performance.now() - t0);
    const s = score(orig, fill, hole);
    if (note) console.log(`   ${note.slice(3)}`);
    const out = path.join(OUT, `${c.name}.${LABEL}.png`);
    await sheet(out, orig, hole, fill);
    rows.push(`| ${c.name} | ${orig.width}×${orig.height} | ${s.holePx} | ${s.psnr.toFixed(2)} | ${s.seam.toFixed(2)} | ${s.gradSeam.toFixed(2)} | ${s.crisp.toFixed(2)} | ${s.crispCtx.toFixed(2)} | ${ms} |`);
    console.log(`${c.name.padEnd(20)} psnr ${s.psnr.toFixed(2).padStart(6)} dB  seam ${s.seam.toFixed(2).padStart(6)}  gradSeam ${s.gradSeam.toFixed(2).padStart(6)}  crisp ${s.crisp.toFixed(2)} ctx ${s.crispCtx.toFixed(2)}  ${String(ms).padStart(6)} ms  → ${out}`);
  }
  const md = `## fillBench ${LABEL} · size ${SIZE} · engine ${ENGINE}${GUIDED ? ' (guided)' : ''}${WINDOW ? ' · window' : ''}\n\n| case | size | hole px | PSNR dB | seam | gradSeam | crisp | crispCtx | ms |\n|---|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`;
  writeFileSync(path.join(OUT, `results.${LABEL}.md`), md);
  console.log(md);
}
main().catch(e => { console.error(e); process.exit(1); });
