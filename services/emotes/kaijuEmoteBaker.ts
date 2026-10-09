// kaijuEmoteBaker — bakes a KaijuArt clip into a looping strip of square frames.
//
// The characters are ALWAYS drawn by the real canvas puppet (KaijuCanvasFigure over sprites baked from the
// very SVG the stage uses), so an emote Lorik is the stage Lorik — one likeness everywhere. What this file
// adds is the emote house look from emoteRig: a gel-coloured glow behind the character, a coloured rim on
// the lower-right edge, a whisper of key light from the top-left, a soft contact shadow, and (bust only)
// a soft fade where the crop cuts through the body, so the tile reads as a lit object rather than a crop.
//
//   frames = round(duration × 15), capped at 24, spread evenly over ONE loop (fps = frames / duration, so the
//   strip closes exactly — pose functions are periodic in `duration`).

import type { KaijuArt, KaijuActor, KaijuWho } from './emoteTypes';
import type { EmoteAsset } from './emoteAssets';
import { bakeKaijuSprites, KaijuCanvasFigure, type KaijuSprites } from '../../components/kaiju/stage2d/kaijuCanvasFigure';
import { pose as fullPose, clamp } from '../../components/kaiju/kaijuPose';
import { KAIJU_FRAMES } from './packs/kaijuPack';   // the framing boxes live with the clips so overlays line up


const FPS = 15, MAX_FRAMES = 24;
const GEL: Record<KaijuWho, { glow: string; rim: string }> = {
  lorik: { glow: '176,75,255', rim: '255,79,216' },    // purple aura, magenta rim (his crest / belly)
  lumi: { glow: '255,138,42', rim: '255,170,80' },     // orange aura, warm rim (her eyes / belly)
};

// One sprite bake per character per resolution: it mounts the SVG puppet and rasterises a dozen parts, so a
// whole pack shares it. ppu is bucketed so 96 px bust + 96 px full tiles don't each bake their own set.
const spriteCache = new Map<string, Promise<KaijuSprites>>();
function sprites(who: KaijuWho, ppu: number): Promise<KaijuSprites> {
  const k = `${who}@${ppu}`;
  let p = spriteCache.get(k);
  if (!p) { p = bakeKaijuSprites(who, false, ppu); p.catch(() => spriteCache.delete(k)); spriteCache.set(k, p); }
  return p;
}
const bucketPpu = (v: number) => Math.min(3, Math.max(0.25, Math.ceil(v * 8) / 8));

const canvas = (n: number) => { const c = document.createElement('canvas'); c.width = c.height = n; return c; };

export async function bakeKaijuEmote(art: KaijuArt, size: number): Promise<EmoteAsset | null> {
  if (typeof document === 'undefined' || !art.actors.length) return null;
  const box = KAIJU_FRAMES[art.frame] ?? KAIJU_FRAMES.bust;
  const unit = size / box.side;                                   // px per character unit at scale 1
  // headScale / roar lunges push a little past scale 1 — bake a notch sharper than the bare fit
  const ppu = bucketPpu(unit * Math.max(...art.actors.map(a => a.scale ?? 1)) * 1.2);
  const figs = await Promise.all(art.actors.map(async a => new KaijuCanvasFigure(a.who, await sprites(a.who, ppu))));

  const n = Math.max(2, Math.min(MAX_FRAMES, Math.round(art.duration * FPS)));
  const fps = n / art.duration;
  const layer = canvas(size), rim = canvas(size);
  const lg = layer.getContext('2d')!, rg = rim.getContext('2d')!;
  const frames: HTMLCanvasElement[] = [];

  // The puppet animates its tear / sweat / love-heart pulse off performance.now(). Baking all frames in one
  // synchronous burst would sample that clock at random-ish instants (a jittering tear), so pin it to one
  // calm instant while we draw. Nothing else runs during the loop (no awaits below), so the swap is contained.
  const perf = performance as { now: () => number };
  const realNow = perf.now;
  perf.now = () => 350;   // tear ≈ a quarter down the cheek, sweat drop near the top, hearts at rest size
  try {
    for (let i = 0; i < n; i++) {
      const t = (i / n) * art.duration;
      const out = canvas(size), g = out.getContext('2d')!;
      g.imageSmoothingQuality = 'high';
      const poses = art.actors.map(a => fullPose(a.pose(t)));
      // 1) gel glow behind each actor (the light the emote throws) + contact shadow on the floor
      art.actors.forEach((a, k) => backdrop(g, a, poses[k], art.frame, box, unit));
      // 2) each actor on its own layer → rim + key light → composite
      art.actors.forEach((a, k) => {
        lg.setTransform(1, 0, 0, 1, 0, 0); lg.clearRect(0, 0, size, size);
        lg.save(); place(lg, a, box, unit, size);
        figs[k].draw(lg, poses[k], { shadow: 'rgba(0,0,0,0)', flash: 0 });
        lg.restore();
        light(lg, rg, a.who, size);
        g.drawImage(layer, 0, 0);
      });
      // 3) bust: fade the crop line so the cut through the chest reads as a soft vignette, not a hard edge
      if (art.frame === 'bust') {
        g.save(); g.globalCompositeOperation = 'destination-out';
        const fd = g.createLinearGradient(0, size * 0.84, 0, size);
        fd.addColorStop(0, 'rgba(0,0,0,0)'); fd.addColorStop(1, 'rgba(0,0,0,0.92)');
        g.fillStyle = fd; g.fillRect(0, size * 0.84, size, size * 0.16); g.restore();
      }
      // 4) glyphs (hearts, zzz, notes…) in 0..128 emote space
      if (art.overlay) { g.save(); g.scale(size / 128, size / 128); try { art.overlay(g, t); } finally { g.restore(); } }
      frames.push(out);
    }
  } finally { perf.now = realNow; }
  return { frames, fps, size };
}

/** Character space → canvas: box centre to tile centre, actor offset/scale/mirror on top. */
function place(ctx: CanvasRenderingContext2D, a: KaijuActor, box: { cx: number; cy: number; side: number }, unit: number, size: number) {
  const s = a.scale ?? 1;
  ctx.translate(size / 2, size / 2); ctx.scale(unit, unit); ctx.translate(-box.cx, -box.cy);
  ctx.translate(a.x ?? 0, a.y ?? 0); ctx.scale(a.flip ? -s : s, s);
}

function backdrop(g: CanvasRenderingContext2D, a: KaijuActor, p: ReturnType<typeof fullPose>, frame: 'bust' | 'full', box: { cx: number; cy: number; side: number }, unit: number) {
  const size = g.canvas.width, s = a.scale ?? 1, sx = a.flip ? -1 : 1;
  const X = (x: number) => size / 2 + (((a.x ?? 0) + x * s * sx) - box.cx) * unit;
  const Y = (y: number) => size / 2 + (((a.y ?? 0) + y * s) - box.cy) * unit;
  const col = GEL[a.who].glow;
  // glow sits behind the head in a bust, behind the torso in full — follows hops so the light travels with them
  const gx = X(p.x + (frame === 'bust' ? p.headX : 0)), gy = Y(p.y + (frame === 'bust' ? -172 + p.headY : -140));
  const gr = (frame === 'bust' ? 108 : 125) * s * unit;
  const rad = g.createRadialGradient(gx, gy, 0, gx, gy, gr);
  rad.addColorStop(0, `rgba(${col},0.34)`); rad.addColorStop(0.55, `rgba(${col},0.14)`); rad.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = rad; g.fillRect(0, 0, size, size);
  if (frame !== 'full') return;
  // contact shadow: stays on the floor while the figure leaps, shrinking + fading with height (as the stage does)
  const air = clamp(-p.y / 140);
  g.save();
  g.filter = `blur(${Math.max(0.6, 2.4 * unit * s).toFixed(2)}px)`;
  g.globalAlpha = 0.42 * (1 - air * 0.55);
  g.fillStyle = '#14061e';
  g.beginPath(); g.ellipse(X(p.x), Y(4), 50 * s * unit * (1 - air * 0.45), 8 * s * unit * (1 - air * 0.4), 0, 0, Math.PI * 2); g.fill();
  g.restore();
}

/** Rim light on the lower-right silhouette edge + a faint key light from the top-left, on the actor layer. */
function light(lg: CanvasRenderingContext2D, rg: CanvasRenderingContext2D, who: KaijuWho, size: number) {
  const d = Math.max(1, size / 64);   // rim width ≈ 2 px at 128
  rg.setTransform(1, 0, 0, 1, 0, 0);
  rg.globalCompositeOperation = 'source-over'; rg.clearRect(0, 0, size, size);
  rg.drawImage(lg.canvas, 0, 0);
  rg.globalCompositeOperation = 'source-in'; rg.fillStyle = `rgb(${GEL[who].rim})`; rg.fillRect(0, 0, size, size);
  rg.globalCompositeOperation = 'destination-out'; rg.drawImage(lg.canvas, -d, -d);   // keep only the lower-right band
  rg.globalCompositeOperation = 'source-over';
  lg.save();
  lg.setTransform(1, 0, 0, 1, 0, 0);
  lg.globalCompositeOperation = 'source-atop';
  lg.globalAlpha = 0.85; lg.drawImage(rg.canvas, 0, 0);
  lg.globalAlpha = 1;
  const key = lg.createRadialGradient(size * 0.22, size * 0.12, 0, size * 0.22, size * 0.12, size * 0.75);
  key.addColorStop(0, 'rgba(255,244,224,0.16)'); key.addColorStop(1, 'rgba(255,244,224,0)');
  lg.fillStyle = key; lg.fillRect(0, 0, size, size);
  lg.restore();
}
