// sceneSegment — what each part of the frame IS, for the Colorize lens: SegFormer-B0 trained on ADE20K
// (150 scene classes: sky, tree, grass, person, wall, sofa, car, water, lamp…) via transformers.js on
// WebGPU (fp32: this laptop's Intel iGPU returns garbage in fp16), wasm q8 as the fallback. ~3 fps, the
// last map held between refreshes — the colorizer's temporal memory and edge-aware upsampling carry it.
//
// The 150 classes collapse onto a few MATERIALS the colorizer has colours for (MATERIALS below, matched
// by the model's own label names so the mapping survives a different checkpoint). Output, in video space:
// R = material id, G = confidence (softmax probability of the winning class, so blurry or ambiguous
// regions fall back to the colorizer's own heuristics).

type Loaded = { model: any; processor: any; tf: any } | null;
/** live = B0 (15 MB, every frame of a webcam or stream); remaster = B2 (110 MB, a fixed film analysed ahead). */
export type SegTier = 'live' | 'remaster';
const MODELS: Record<SegTier, string> = {
  live: 'Xenova/segformer-b0-finetuned-ade-512-512',
  remaster: 'Xenova/segformer-b2-finetuned-ade-512-512',
};
const loads: Partial<Record<SegTier, Promise<Loaded>>> = {};
const states: Record<SegTier, 'idle' | 'loading' | 'ready' | 'failed'> = { live: 'idle', remaster: 'idle' };
export function sceneSegmentStatus(tier: SegTier = 'live') { return states[tier]; }

/** Material ids — the colorizer's palette rows (lensShadersColor.ts / colorPalette.ts). 0 = no opinion. */
export const MAT = {
  none: 0, sky: 1, foliage: 2, grass: 3, earth: 4, rock: 5, water: 6, building: 7, plaster: 8, floor: 9,
  wood: 10, fabric: 11, metal: 12, person: 13, road: 14, flower: 15, light: 16, fire: 17, paper: 18,
  animal: 19, food: 20, glass: 21, apparel: 22,
} as const;
export type MaterialId = typeof MAT[keyof typeof MAT];

/** ADE20K label name (as in the model's id2label) → material. Unlisted classes = no opinion. */
const CLASS_TO_MAT: Record<string, MaterialId> = {
  sky: MAT.sky,
  tree: MAT.foliage, plant: MAT.foliage, palm: MAT.foliage,
  grass: MAT.grass, field: MAT.grass,
  earth: MAT.earth, sand: MAT.earth, path: MAT.earth, land: MAT.earth, 'dirt track': MAT.earth,
  mountain: MAT.rock, rock: MAT.rock, hill: MAT.rock, stone: MAT.rock,
  water: MAT.water, sea: MAT.water, river: MAT.water, lake: MAT.water, 'swimming pool': MAT.water, waterfall: MAT.water, fountain: MAT.water,
  building: MAT.building, house: MAT.building, skyscraper: MAT.building, tower: MAT.building, bridge: MAT.building, hovel: MAT.building, column: MAT.building,
  wall: MAT.plaster, ceiling: MAT.plaster,
  floor: MAT.floor, rug: MAT.floor, stairs: MAT.floor, stairway: MAT.floor, step: MAT.floor,
  table: MAT.wood, cabinet: MAT.wood, chair: MAT.wood, desk: MAT.wood, shelf: MAT.wood, bookcase: MAT.wood, door: MAT.wood,
  'chest of drawers': MAT.wood, wardrobe: MAT.wood, bench: MAT.wood, 'coffee table': MAT.wood, counter: MAT.wood, buffet: MAT.wood,
  barrel: MAT.wood, fence: MAT.wood, bannister: MAT.wood, railing: MAT.wood, 'swivel chair': MAT.wood, stool: MAT.wood, box: MAT.wood,
  sofa: MAT.fabric, armchair: MAT.fabric, cushion: MAT.fabric, pillow: MAT.fabric, curtain: MAT.fabric, blanket: MAT.fabric,
  bed: MAT.fabric, towel: MAT.fabric, blind: MAT.fabric, seat: MAT.fabric, ottoman: MAT.fabric, awning: MAT.fabric, tent: MAT.fabric, canopy: MAT.fabric,
  car: MAT.metal, bus: MAT.metal, truck: MAT.metal, van: MAT.metal, airplane: MAT.metal, ship: MAT.metal, boat: MAT.metal,
  bicycle: MAT.metal, minibike: MAT.metal, streetlight: MAT.metal, pole: MAT.metal, radiator: MAT.metal, stove: MAT.metal, refrigerator: MAT.metal,
  person: MAT.person,
  // a grey human figure is a SCULPTURE to a model trained on colour photos, and a skirt its BASE — in b&w
  // footage a figure is far likelier a person than a statue
  sculpture: MAT.person, statue: MAT.person, base: MAT.apparel,
  road: MAT.road, sidewalk: MAT.road, runway: MAT.road,
  flower: MAT.flower,
  lamp: MAT.light, light: MAT.light, chandelier: MAT.light, sconce: MAT.light,
  fireplace: MAT.fire,
  painting: MAT.paper, poster: MAT.paper, book: MAT.paper, signboard: MAT.paper, 'bulletin board': MAT.paper, flag: MAT.paper,
  animal: MAT.animal,
  food: MAT.food,
  windowpane: MAT.glass, mirror: MAT.glass, glass: MAT.glass, bottle: MAT.glass, vase: MAT.glass,
  apparel: MAT.apparel, bag: MAT.apparel,
};

function load(tier: SegTier): Promise<Loaded> {
  const have = loads[tier]; if (have) return have;
  const MODEL = MODELS[tier];
  states[tier] = 'loading';
  const job = (async (): Promise<Loaded> => {
    try {
      const tf: any = await import('@huggingface/transformers');
      const hasGpu = typeof navigator !== 'undefined' && !!(navigator as any).gpu;
      const processor = await tf.AutoProcessor.from_pretrained(MODEL);
      let model: any = null;
      for (const device of hasGpu ? ['webgpu', 'wasm'] : ['wasm']) {
        try { model = await tf.AutoModel.from_pretrained(MODEL, { device, dtype: device === 'webgpu' ? 'fp32' : 'q8' }); break; }
        catch (e) { console.warn('[sceneSegment] device', device, 'failed:', (e as Error)?.message || e); }
      }
      states[tier] = model ? 'ready' : 'failed';
      return model ? { model, processor, tf } : null;
    } catch (e) { console.warn('[sceneSegment] load failed:', (e as Error)?.message || e); states[tier] = 'failed'; return null; }
  })();
  loads[tier] = job;
  return job;
}

export interface SegMap {
  data: Uint8Array; w: number; h: number; stamp: number;
  /** the part of the frame that was segmented (letterbox / pillarbox bars cropped off), normalised x0,y0,x1,y1 */
  rect: [number, number, number, number];
}

/** Logits [1, C, h, w] → RG8 (material, confidence). Labels are resolved by name once per model. */
let matOfClass: Uint8Array | null = null;
function decode(logits: any, id2label: Record<string, string>): SegMap {
  const [, C, h, w] = logits.dims as number[];
  const L = logits.data as Float32Array;
  if (!matOfClass || matOfClass.length !== C) {
    matOfClass = new Uint8Array(C);
    for (let c = 0; c < C; c++) {
      const name = String(id2label?.[c] ?? '').toLowerCase();
      matOfClass[c] = CLASS_TO_MAT[name] ?? CLASS_TO_MAT[name.split(/[,;]/)[0].trim()] ?? MAT.none;
    }
  }
  const out = new Uint8Array(w * h * 2), plane = w * h;
  // class-major scan (cache-friendly), keeping the top two logits per pixel
  const b1 = new Float32Array(plane).fill(-1e9), b2 = new Float32Array(plane).fill(-1e9), bc = new Uint8Array(plane);
  for (let c = 0; c < C; c++) {
    const o = c * plane;
    for (let p = 0; p < plane; p++) {
      const v = L[o + p];
      if (v > b1[p]) { b2[p] = b1[p]; b1[p] = v; bc[p] = c; } else if (v > b2[p]) b2[p] = v;
    }
  }
  for (let p = 0; p < plane; p++) {
    out[p * 2] = matOfClass[bc[p]];
    out[p * 2 + 1] = Math.round(255 * (1 - Math.exp(b2[p] - b1[p])));   // confidence from the winner's margin over the runner-up
  }
  return { data: out, w, h, stamp: 0, rect: [0, 0, 1, 1] };
}

async function segment(frame: HTMLCanvasElement, tier: SegTier): Promise<SegMap | null> {
  const m = await load(tier); if (!m) return null;
  try {
    const image = await m.tf.RawImage.fromCanvas(frame);
    const inputs = await m.processor(image);
    const { logits } = await m.model(inputs);
    const cpu = logits.location && logits.location !== 'cpu' && logits.getData ? await logits.getData(true) : null;
    return decode(cpu ? { dims: logits.dims, data: cpu } : logits, m.model.config?.id2label ?? {});
  } catch (e) { console.warn('[sceneSegment] segment failed:', (e as Error)?.message || e); return null; }
}

/** Picture area inside black bars (4:3 in a 16:9 transfer, scope in a TV frame), from a coarse luma scan. */
function pictureRect(src: CanvasImageSource, probe: HTMLCanvasElement): [number, number, number, number] {
  const W = 96, H = 54; probe.width = W; probe.height = H;
  const x = probe.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(src, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data;
  const col = (i: number) => { let s = 0; for (let y = 0; y < H; y++) s += d[(y * W + i) * 4 + 1]; return s / H; };
  const row = (j: number) => { let s = 0; for (let i = 0; i < W; i++) s += d[(j * W + i) * 4 + 1]; return s / W; };
  let x0 = 0, x1 = W - 1, y0 = 0, y1 = H - 1;
  while (x0 < W / 3 && col(x0) < 10) x0++;
  while (x1 > (W * 2) / 3 && col(x1) < 10) x1--;
  while (y0 < H / 3 && row(y0) < 10) y0++;
  while (y1 > (H * 2) / 3 && row(y1) < 10) y1--;
  return [x0 / W, y0 / H, (x1 + 1) / W, (y1 + 1) / H];
}

/** Stretch the 2nd–98th percentile grey to full range: soft, low-contrast film stock reads more like the photos the model learned on. */
function stretch(c: HTMLCanvasElement) {
  const x = c.getContext('2d', { willReadFrequently: true })!;
  const img = x.getImageData(0, 0, c.width, c.height), d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 16) hist[(d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8]++;
  let n = 0; for (const v of hist) n += v;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > n * 0.02) { lo = v; break; } }
  acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > n * 0.02) { hi = v; break; } }
  if (hi - lo < 24) return;
  const k = 255 / (hi - lo);
  for (let i = 0; i < d.length; i += 4) { d[i] = (d[i] - lo) * k; d[i + 1] = (d[i + 1] - lo) * k; d[i + 2] = (d[i + 2] - lo) * k; }
  x.putImageData(img, 0, 0);
}

/** Ensure a tier's model is loading; resolves true once it is ready. */
export async function loadSceneModel(tier: SegTier): Promise<boolean> { return !!(await load(tier)); }

/**
 * One frame → labels, the whole way: crop the black bars, stretch the contrast, segment. Synchronous until
 * the model call (so `src` may change right after). `frame` / `probe` are the caller's scratch canvases.
 */
export function segmentFrame(src: CanvasImageSource, sw: number, sh: number, tier: SegTier, frame: HTMLCanvasElement, probe: HTMLCanvasElement): Promise<SegMap | null> {
  const rect = pictureRect(src, probe);
  const cw = (rect[2] - rect[0]) * sw, ch = (rect[3] - rect[1]) * sh;
  frame.width = 512; frame.height = Math.max(2, Math.round((512 * ch) / cw));
  frame.getContext('2d')!.drawImage(src, rect[0] * sw, rect[1] * sh, cw, ch, 0, 0, frame.width, frame.height);
  stretch(frame);
  return segment(frame, tier).then(r => { if (r) r.rect = rect; return r; });
}

/** Scene labels for a frame source, refreshed ~3×/s (remaster tier: as fast as it finishes); the last map is held. */
export class SceneSegment {
  private map: SegMap | null = null;
  private busy = false;
  private last = 0;
  private frame = document.createElement('canvas');
  private probe = document.createElement('canvas');
  stamp = 0;
  constructor(private tier: SegTier = 'live') {}
  /** Switch models; the current one keeps serving until the new one has loaded. */
  setTier(t: SegTier) { if (t !== this.tier) { this.tier = t; if (states[t] === 'idle') void load(t); } }
  init() { void load(this.tier); }
  state() { return states[this.tier] === 'ready' || states.live !== 'ready' ? states[this.tier] : 'ready'; }
  update(src: HTMLVideoElement | HTMLCanvasElement, nowMs: number): SegMap | null {
    const tier: SegTier | null = states[this.tier] === 'ready' ? this.tier : states.live === 'ready' ? 'live' : null;
    if (!tier) return this.map;
    if (!this.busy && nowMs - this.last > (tier === 'live' ? 330 : 120)) {
      const sw = (src as HTMLVideoElement).videoWidth || (src as HTMLCanvasElement).width || 0;
      const sh = (src as HTMLVideoElement).videoHeight || (src as HTMLCanvasElement).height || 0;
      if (!sw || !sh) return this.map;
      this.busy = true; this.last = nowMs;
      try {
        segmentFrame(src, sw, sh, tier, this.frame, this.probe)
          .then(r => { if (r) { r.stamp = ++this.stamp; this.map = r; } }).finally(() => { this.busy = false; });
      } catch { this.busy = false; }
    }
    return this.map;
  }
}
