/**
 * Bakes the layer assets for an 'animatedPainting' shot from a painting plus its hand-authored layer data.
 *
 *   npx tsx scripts/dossier/buildPaintingLayers.ts            # Trumbull, Bunker's Hill (data/dossier/foundingBattleLayers.ts)
 *   npx tsx scripts/dossier/buildPaintingLayers.ts --redepth  # rerun the depth model even if the raw map is cached
 *
 * Inputs : public/dossier/founding/film/<painting>.jpg, data/dossier/foundingBattleLayers.ts
 * Depth  : Depth Anything V2 (small) through transformers.js, the same model scripts/dossier/fetchFilmAssets.ts uses for
 *          Douglass. Cached at .film-work/founding/depth-raw.png (near = white). If the model cannot be fetched the script
 *          falls back to a procedural depth estimate (luminance + vertical position), which is much worse; it says so.
 * Outputs (public/dossier/founding/film/, all opaque 8-bit PNG so no alpha premultiplication can corrupt a channel):
 *   bunker-depth.png  gray: depth, dilated 3 px and blurred, so smoke is hidden a hair INSIDE a figure's edge, never beside it
 *   bunker-masks.png  R = far plane (sky, smoke, burning town; eroded + feathered so a parallax shift never reaches a figure)
 *                     G = flag regions (hand polygons)      B = fire (colour key in the fire region)
 *   bunker-fx.png     R = fire glow (wide blur)   G = smoke envelope (the painter's own smoke banks)   B = face protection
 * Also .film-work/founding/layers-overlay.jpg for review (masks tinted over the painting).
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { FACES, FIRE_REGION, FLAGS, PAINTING_FILE, PAINTING_SIZE, SMOKE_BLOBS } from '../../data/dossier/foundingBattleLayers';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const DIR = path.join(ROOT, 'public', 'dossier', 'founding', 'film');
const WORK = path.join(ROOT, '.film-work', 'founding');
fs.mkdirSync(WORK, { recursive: true });
const { w: W, h: H } = PAINTING_SIZE;
const N = W * H;

const gray = (b: Uint8Array | Buffer) => sharp(Buffer.from(b), { raw: { width: W, height: H, channels: 1 } });
/** Gaussian blur that keeps full-scale at full-scale (sharp's 8-bit blur loses about 2% of a flat 255, which would cap a mask below 1). */
const blurGain = new Map<number, number>();
async function blur(b: Uint8Array, sigma: number): Promise<Uint8Array> {
  if (!blurGain.has(sigma)) {
    const flat = await sharp(Buffer.alloc(300 * 300, 255), { raw: { width: 300, height: 300, channels: 1 } }).blur(sigma).extractChannel(0).raw().toBuffer();
    blurGain.set(sigma, 255 / flat[150 * 300 + 150]);
  }
  const g = blurGain.get(sigma)!, out = new Uint8Array(await gray(b).blur(sigma).extractChannel(0).raw().toBuffer());
  for (let i = 0; i < out.length; i++) out[i] = Math.min(255, Math.round(out[i] * g));
  return out;
}
const smooth = (x: number, a: number, b: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Separable running max (dilate) or min (erode) with a square window of radius r. */
function morph(src: Uint8Array, r: number, op: 'max' | 'min'): Uint8Array {
  const tmp = new Uint8Array(N), out = new Uint8Array(N);
  const pick = op === 'max' ? Math.max : Math.min;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = op === 'max' ? 0 : 255;
    for (let k = Math.max(0, x - r); k <= Math.min(W - 1, x + r); k++) v = pick(v, src[y * W + k]);
    tmp[y * W + x] = v;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = op === 'max' ? 0 : 255;
    for (let k = Math.max(0, y - r); k <= Math.min(H - 1, y + r); k++) v = pick(v, tmp[k * W + x]);
    out[y * W + x] = v;
  }
  return out;
}

async function rasterPolys(polys: Array<Array<[number, number]>>, circles: Array<[number, number, number]> = []): Promise<Uint8Array> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#000"/>`
    + polys.map(p => `<polygon fill="#fff" points="${p.map(q => q.join(',')).join(' ')}"/>`).join('')
    + circles.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/>`).join('') + '</svg>';
  return new Uint8Array(await sharp(Buffer.from(svg)).flatten({ background: "#000" }).extractChannel(0).raw().toBuffer());
}

async function rawDepth(): Promise<{ buf: Uint8Array; model: boolean }> {
  const cache = path.join(WORK, 'depth-raw.png');
  if (!process.argv.includes('--redepth') && fs.existsSync(cache)) return { buf: new Uint8Array(await sharp(cache).removeAlpha().extractChannel(0).raw().toBuffer()), model: true };
  const src = path.join(DIR, PAINTING_FILE);
  try {
    const { pipeline, RawImage } = await import('@huggingface/transformers');
    const estimator: any = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', { dtype: 'fp32' } as any);
    const img = await RawImage.read(src);
    const out: any = await estimator(img);
    const d = Array.isArray(out) ? out[0].depth : out.depth;
    await (await d.resize(img.width, img.height)).save(cache);
    console.log('depth: Depth Anything V2 small');
    return { buf: new Uint8Array(await sharp(cache).removeAlpha().extractChannel(0).resize(W, H).raw().toBuffer()), model: true };
  } catch (e) {
    console.warn('depth: MODEL UNAVAILABLE, using a procedural estimate (sky = bright + high up = far):', (e as Error).message);
    const px = new Uint8Array(await sharp(src).greyscale().resize(W, H).raw().toBuffer());
    const out = new Uint8Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = px[y * W + x] / 255, up = 1 - y / H;
      out[y * W + x] = Math.round(255 * Math.min(1, Math.max(0, (1 - up) * .85 + (1 - v) * .15 * (up > .5 ? 1.6 : .4))));
    }
    return { buf: out, model: false };
  }
}

async function main() {
  const { buf: raw, model } = await rawDepth();
  const painting = new Uint8Array(await sharp(path.join(DIR, PAINTING_FILE)).removeAlpha().raw().toBuffer());

  // 1. Softened depth: figures a hair fatter than they are, so occlusion hides smoke just inside every silhouette.
  const depthSoft = await blur(morph(raw, 3, 'max'), 1.5);

  // 2. Far plane: the sky, its smoke and the burning town. Everything with a figure's depth is out; then eroded and
  // feathered so the ramp to zero is wider than the largest parallax shift (about 15 source px) and sky never drags a figure.
  const far0 = new Uint8Array(N);
  for (let i = 0; i < N; i++) far0[i] = Math.round(255 * (1 - smooth(raw[i], 16, 44)));
  const far = await blur(morph(far0, 18, 'min'), 11);

  // 3. Flags: hand polygons, feathered 3 px.
  const flags = await blur(await rasterPolys(FLAGS.map(f => f.poly)), 3);

  // 4. Fire: orange/red flame pixels inside the fire region, outside anything figure-like.
  const fire0 = new Uint8Array(N);
  for (let y = FIRE_REGION.y0; y < FIRE_REGION.y1; y++) for (let x = FIRE_REGION.x0; x < FIRE_REGION.x1; x++) {
    const i = y * W + x, r = painting[i * 3], g = painting[i * 3 + 1], b = painting[i * 3 + 2];
    const k = smooth(r - g, 22, 62) * smooth(r - b, 40, 90) * smooth(r, 70, 120) * (far[i] / 255);
    fire0[i] = Math.round(255 * k);
  }
  const fire = await blur(morph(fire0, 2, 'max'), 2.5);
  const glow = await blur(fire, 38);

  // 5. Smoke envelope and face protection.
  const blobSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>${SMOKE_BLOBS.map((b, i) =>
    `<radialGradient id="g${i}"><stop offset="0" stop-color="#fff" stop-opacity="${b[4]}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`).join('')}</defs>`
    + `<rect width="${W}" height="${H}" fill="#000"/>${SMOKE_BLOBS.map((b, i) => `<ellipse cx="${b[0]}" cy="${b[1]}" rx="${b[2]}" ry="${b[3]}" fill="url(#g${i})"/>`).join('')}</svg>`;
  const env = new Uint8Array(await sharp(Buffer.from(blobSvg)).flatten({ background: "#000" }).extractChannel(0).raw().toBuffer());
  const faces = await blur(await rasterPolys([], FACES.map(([x, y, r]) => [x, y, r * 1.25] as [number, number, number])), 14);

  // 6. Pack.
  const pack = (r: Uint8Array, g: Uint8Array, b: Uint8Array) => {
    const o = Buffer.alloc(N * 3);
    for (let i = 0; i < N; i++) { o[i * 3] = r[i]; o[i * 3 + 1] = g[i]; o[i * 3 + 2] = b[i]; }
    return sharp(o, { raw: { width: W, height: H, channels: 3 } }).png({ compressionLevel: 9 });
  };
  await gray(depthSoft).png({ compressionLevel: 9 }).toFile(path.join(DIR, 'bunker-depth.png'));
  await pack(far, flags, fire).toFile(path.join(DIR, 'bunker-masks.png'));
  await pack(glow, env, faces).toFile(path.join(DIR, 'bunker-fx.png'));

  // 7. Review overlay: far = blue, flags = magenta, fire = yellow, faces = green outline tint, figures untouched.
  const ov = Buffer.from(painting);
  for (let i = 0; i < N; i++) {
    const a = (c: number, v: number, k: number) => Math.min(255, ov[i * 3 + c] + v * k);
    ov[i * 3 + 2] = a(2, far[i], .35); ov[i * 3] = a(0, flags[i], .7) ; ov[i * 3 + 2] = a(2, flags[i], .5);
    ov[i * 3] = a(0, fire[i], .8); ov[i * 3 + 1] = a(1, fire[i], .8); ov[i * 3 + 1] = a(1, faces[i], .5);
  }
  await sharp(ov, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 85 }).toFile(path.join(WORK, 'layers-overlay.jpg'));
  console.log(`layers baked (${model ? 'Depth Anything V2' : 'PROCEDURAL depth'}): bunker-depth.png, bunker-masks.png, bunker-fx.png`);
}
main().catch(e => { console.error(e); process.exit(1); });
