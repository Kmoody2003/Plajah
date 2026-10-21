/**
 * services/anima/render.ts — draws one frame of an Anima project to a 2D canvas.
 *
 * Deterministic for everything keyed (layer motion, drawings, characters, plates): the same
 * frame always draws the same picture, so scrubbing and export agree. Atmosphere effects are
 * live simulations held in the runtime; they advance only while playing.
 *
 * Layer order: layers[0] is the front (top of the Layers panel), so layers draw back to front.
 */

import type { AnimaLayer, AnimaProject, AnimaRigId } from './types';
import { evaluateProjectAtFrame, frameToTime, type EvaluatedLayerState } from './evaluator';
import { ParticleSystem, HairSystem, DEFAULT_FORCES, type ParticleEmitterConfig } from './physics';
import { FluidSimulator } from './fluids';
import { MotionFXBrushEngine } from './worldClassEngine';
import { PLAJAH_MASCOTS } from './plajahMascots';
import { CLASSIC_CHARACTERS } from './classicCharacters';

type EffectSim =
  | { kind: 'particles'; ps: ParticleSystem; emitter: ParticleEmitterConfig; streak: boolean; glow: boolean; spawn?: { x0: number; x1: number; y0: number; y1: number }; lastId: number }
  | { kind: 'hair'; hs: HairSystem }
  | { kind: 'smoke'; fluid: FluidSimulator; small: HTMLCanvasElement };

const RIG_TIME_SCALE: Partial<Record<AnimaRigId, number>> = { rello: 0.75, chora: 0.85 };

/** Per-stage state that isn't part of the document: loaded media, live sims, the FX brush. */
export class AnimaRenderRuntime {
  private images = new Map<string, HTMLImageElement>();
  private videos = new Map<string, HTMLVideoElement>();
  private sims = new Map<string, { sig: string; sim: EffectSim }>();
  readonly brush = new MotionFXBrushEngine();
  /** Bumped when an image finishes loading, so a paused stage knows to redraw. */
  version = 0;

  image(url: string): HTMLImageElement | null {
    let img = this.images.get(url);
    if (!img) {
      img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => this.version++;
      img.src = url;
      this.images.set(url, img);
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }

  video(url: string): HTMLVideoElement {
    let v = this.videos.get(url);
    if (!v) {
      v = document.createElement('video');
      v.crossOrigin = 'anonymous';
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.onloadeddata = () => this.version++;
      v.src = url;
      this.videos.set(url, v);
    }
    return v;
  }

  /** Keeps a video plate on the project clock (loose while playing, exact when paused). */
  syncVideo(v: HTMLVideoElement, t: number, playing: boolean) {
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
    const target = dur ? t % dur : t;
    if (playing) {
      if (v.paused) void v.play().catch(() => {});
      if (Math.abs(v.currentTime - target) > 0.3) v.currentTime = target;
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - target) > 0.04) v.currentTime = target;
    }
  }

  effect(layer: AnimaLayer, W: number, H: number): EffectSim | null {
    const fx = layer.effect;
    if (!fx || fx.kind === 'speed_lines' || fx.kind === 'balloon') return null;
    const sig = `${fx.kind}|${fx.color}|${fx.intensity}`;
    const cur = this.sims.get(layer.id);
    if (cur && cur.sig === sig) return cur.sim;
    const sim = makeSim(fx.kind, fx.color || '#ffffff', fx.intensity ?? 1, W, H, layer.origin ?? { x: W / 2, y: H / 2 });
    if (sim) {
      // Warm up so atmosphere is already on screen before the first play.
      for (let i = 0; i < 45; i++) stepSim(sim, 1 / 30, i / 30, W, H, layer.origin ?? { x: W / 2, y: H / 2 }, fx.color);
      this.sims.set(layer.id, { sig, sim });
    }
    return sim;
  }

  /** Drop sims and media no layer uses any more. */
  prune(project: AnimaProject) {
    const ids = new Set(project.layers.map((l) => l.id));
    for (const id of this.sims.keys()) if (!ids.has(id)) this.sims.delete(id);
    const urls = new Set(project.layers.map((l) => l.plate?.url).filter(Boolean) as string[]);
    for (const [url, v] of this.videos) {
      if (!urls.has(url)) {
        v.pause();
        v.removeAttribute('src');
        v.load();
        this.videos.delete(url);
      }
    }
  }

  dispose() {
    for (const v of this.videos.values()) {
      v.pause();
      v.removeAttribute('src');
      v.load();
    }
    this.videos.clear();
    this.sims.clear();
    this.brush.clear();
  }
}

function makeSim(kind: string, color: string, k: number, W: number, H: number, o: { x: number; y: number }): EffectSim | null {
  const base: ParticleEmitterConfig = {
    id: kind,
    name: kind,
    enabled: true,
    type: 'box',
    position: { x: W / 2, y: -20, z: 0 },
    ratePerSecond: 60,
    lifespan: 2,
    speed: 100,
    spreadAngle: 20,
    directionAngle: 90,
    startSize: 3,
    endSize: 1,
    color,
    colorFade: color,
    bounceElasticity: 0,
  };
  switch (kind) {
    // The particle system spawns at one point; `spawn` spreads new particles over an area.
    case 'rain':
      return { kind: 'particles', ps: new ParticleSystem(), emitter: { ...base, ratePerSecond: 220 * k, lifespan: 1.1, speed: 900, directionAngle: 100, spreadAngle: 4, startSize: 2, endSize: 1.5 }, streak: true, glow: false, spawn: { x0: -W * 0.15, x1: W, y0: -40, y1: -10 }, lastId: 0 };
    case 'snow':
      return { kind: 'particles', ps: new ParticleSystem(), emitter: { ...base, ratePerSecond: 70 * k, lifespan: 9, speed: 55, spreadAngle: 40, startSize: 4, endSize: 2.5 }, streak: false, glow: false, spawn: { x0: -W * 0.1, x1: W * 1.1, y0: -30, y1: -10 }, lastId: 0 };
    case 'fireflies':
      return { kind: 'particles', ps: new ParticleSystem(), emitter: { ...base, ratePerSecond: 14 * k, lifespan: 4, speed: 22, spreadAngle: 360, startSize: 4, endSize: 1 }, streak: false, glow: true, spawn: { x0: W * 0.05, x1: W * 0.95, y0: H * 0.35, y1: H * 0.95 }, lastId: 0 };
    case 'sparkles':
      return { kind: 'particles', ps: new ParticleSystem(), emitter: { ...base, type: 'point', position: { x: o.x, y: o.y, z: 0 }, ratePerSecond: 40 * k, lifespan: 1.4, speed: 140, spreadAngle: 360, startSize: 5, endSize: 0.5 }, streak: false, glow: true, lastId: 0 };
    case 'hair': {
      const hs = new HairSystem();
      hs.createStrand({ x: o.x - 15, y: o.y, z: 0 }, 140, 7, color, 0.88);
      hs.createStrand({ x: o.x + 15, y: o.y, z: 0 }, 160, 8, color, 0.9);
      return { kind: 'hair', hs };
    }
    case 'smoke':
      return { kind: 'smoke', fluid: new FluidSimulator({ gridResolution: 64 }), small: document.createElement('canvas') };
    default:
      return null;
  }
}

function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [0.7, 0.4, 1];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function stepSim(sim: EffectSim, dt: number, time: number, W: number, H: number, o: { x: number; y: number }, color = '#b26bff') {
  if (sim.kind === 'particles') {
    sim.ps.step(dt, sim.emitter, DEFAULT_FORCES, time, { w: W, h: H });
    if (sim.spawn) {
      const a = sim.spawn;
      for (const p of sim.ps.particles) {
        if (p.id <= sim.lastId) continue;
        p.position.x = a.x0 + Math.random() * (a.x1 - a.x0);
        p.position.y = a.y0 + Math.random() * (a.y1 - a.y0);
      }
    }
    for (const p of sim.ps.particles) if (p.id > sim.lastId) sim.lastId = p.id;
  }
  else if (sim.kind === 'hair') sim.hs.step(dt, DEFAULT_FORCES, time);
  else {
    const nx = o.x / W;
    const ny = o.y / H;
    sim.fluid.addVelocity(nx, ny, Math.sin(time * 2.3) * 6, -6);
    const [r, g, b] = hexToRgb01(color);
    sim.fluid.addDye(nx, ny, r, g, b, 3);
    sim.fluid.step(dt);
  }
}

function drawSim(ctx: CanvasRenderingContext2D, sim: EffectSim, W: number, H: number) {
  if (sim.kind === 'particles') {
    ctx.save();
    if (sim.glow) {
      ctx.shadowColor = sim.emitter.color;
      ctx.shadowBlur = 12;
    }
    for (const p of sim.ps.particles) {
      const life = 1 - p.age / p.lifespan;
      ctx.globalAlpha = Math.max(0, Math.min(1, sim.glow ? life * (0.6 + 0.4 * Math.sin(p.age * 6 + p.id)) : life));
      if (sim.streak) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, p.size * 0.6);
        ctx.beginPath();
        ctx.moveTo(p.position.x, p.position.y);
        ctx.lineTo(p.position.x - p.velocity.x * 0.02, p.position.y - p.velocity.y * 0.02);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.position.x, p.position.y, Math.max(0.5, p.size), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  } else if (sim.kind === 'hair') {
    ctx.save();
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (const s of sim.hs.strands) {
      ctx.strokeStyle = s.color;
      ctx.beginPath();
      s.points.forEach((pt, i) => (i ? ctx.lineTo(pt.pos.x, pt.pos.y) : ctx.moveTo(pt.pos.x, pt.pos.y)));
      ctx.stroke();
    }
    ctx.restore();
  } else {
    sim.fluid.paintToSmallCanvas(sim.small);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sim.small, 0, 0, W, H);
    ctx.restore();
  }
}

/** Seeded 0..1 so speed lines are stable per frame instead of flickering every repaint. */
function rand(seed: number) {
  const s = Math.sin(seed * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

function drawSpeedLines(ctx: CanvasRenderingContext2D, o: { x: number; y: number }, frame: number, color: string, k: number, W: number) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha *= 0.55;
  ctx.lineWidth = 2;
  const seed = Math.floor(frame / 2);
  const step = 0.08 / Math.max(0.25, k);
  for (let a = 0, i = 0; a < Math.PI * 2; a += step, i++) {
    const r1 = 260 + rand(seed * 31 + i) * 60;
    ctx.beginPath();
    ctx.moveTo(o.x + Math.cos(a) * r1, o.y + Math.sin(a) * r1);
    ctx.lineTo(o.x + Math.cos(a) * W, o.y + Math.sin(a) * W);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBalloon(ctx: CanvasRenderingContext2D, text: string, fill: string) {
  ctx.save();
  ctx.font = '800 22px "Comic Neue", "Comic Sans MS", Impact, sans-serif';
  const w = Math.max(120, ctx.measureText(text).width + 48);
  const h = 64;
  ctx.fillStyle = fill;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 26);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-12, h / 2 - 2);
  ctx.lineTo(-30, h / 2 + 30);
  ctx.lineTo(14, h / 2 - 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 2);
  ctx.restore();
}

function drawCover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, W: number, H: number) {
  if (!sw || !sh) return;
  const s = Math.max(W / sw, H / sh);
  ctx.drawImage(src, (W - sw * s) / 2, (H - sh * s) / 2, sw * s, sh * s);
}

export interface RenderOptions {
  playing: boolean;
  /** Seconds since the last paint (sims advance by this while playing). */
  dt: number;
  /** Wall clock seconds, for sims. */
  now: number;
  /** Editor overlays: placeholders for empty plates, the selected layer's pivot. */
  editor?: { selectedLayerId: string | null };
}

export function renderAnimaFrame(ctx: CanvasRenderingContext2D, project: AnimaProject, frame: number, rt: AnimaRenderRuntime, opt: RenderOptions): EvaluatedLayerState[] {
  const W = project.width;
  const H = project.height;
  const t = frameToTime(frame, project.fps);
  ctx.save();
  ctx.setTransform(ctx.canvas.width / W, 0, 0, ctx.canvas.height / H, 0, 0);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#15121d');
  bg.addColorStop(1, '#0a090d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const evaluated = evaluateProjectAtFrame(project, frame);
  const byId = new Map(project.layers.map((l) => [l.id, l]));

  for (let i = evaluated.length - 1; i >= 0; i--) {
    const st = evaluated[i];
    const layer = byId.get(st.layerId);
    if (!layer || !st.visible || st.opacity <= 0) continue;
    const o = layer.origin ?? { x: 0, y: 0 };
    ctx.save();
    ctx.globalAlpha = st.opacity;
    ctx.translate(o.x + st.transform.x, o.y + st.transform.y);
    ctx.rotate((st.transform.rotationZ * Math.PI) / 180);
    ctx.scale(st.transform.scaleX, st.transform.scaleY);

    if (layer.type === 'character' && layer.rigId) {
      const rig = layer.rigId === 'rello' || layer.rigId === 'chora' ? PLAJAH_MASCOTS[layer.rigId] : CLASSIC_CHARACTERS[layer.rigId]?.rig;
      const scale = layer.rigId === 'rello' || layer.rigId === 'chora' ? 1.3 : 1.1;
      rig?.drawRoutine(ctx, t * (RIG_TIME_SCALE[layer.rigId] ?? 0.8), frame, scale);
    } else {
      // Frame-space content: undo the pivot so it draws where it was authored.
      ctx.translate(-o.x, -o.y);
      if (layer.type === 'plate') {
        const plate = layer.plate;
        if (plate?.kind === 'image') {
          const img = rt.image(plate.url);
          if (img) drawCover(ctx, img, img.naturalWidth, img.naturalHeight, W, H);
        } else if (plate?.kind === 'video') {
          const v = rt.video(plate.url);
          rt.syncVideo(v, t, opt.playing);
          if (v.readyState >= 2) drawCover(ctx, v, v.videoWidth, v.videoHeight, W, H);
        } else if (opt.editor) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.setLineDash([10, 8]);
          ctx.lineWidth = 2;
          ctx.strokeRect(24, 24, W - 48, H - 48);
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.font = '600 22px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('Empty plate · import a still or video in Properties', W / 2, H / 2);
          ctx.restore();
        }
      } else if (layer.type === 'cel' || layer.type === 'stop_motion') {
        const cel = st.activeDrawingId ? project.drawingBank[st.activeDrawingId] : null;
        if (cel) {
          const raster = cel.rasterUrl || cel.rasterDataUrl;
          if (raster) {
            const img = rt.image(raster);
            if (img) ctx.drawImage(img, 0, 0, W, H);
          }
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          for (const s of cel.strokes) {
            if (s.points.length < 1) continue;
            ctx.save();
            ctx.globalAlpha *= s.opacity ?? 1;
            ctx.strokeStyle = s.color;
            ctx.lineWidth = s.width;
            ctx.beginPath();
            ctx.moveTo(s.points[0].x, s.points[0].y);
            for (let k = 1; k < s.points.length - 1; k++) {
              const a = s.points[k];
              const b = s.points[k + 1];
              ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
            }
            const last = s.points[s.points.length - 1];
            ctx.lineTo(last.x, last.y);
            if (s.fill) {
              ctx.fillStyle = s.fill;
              ctx.fill();
            }
            ctx.stroke();
            ctx.restore();
          }
        }
      } else if (layer.type === 'effect' && layer.effect) {
        const fx = layer.effect;
        if (fx.kind === 'speed_lines') drawSpeedLines(ctx, o, frame, fx.color || '#fff', fx.intensity ?? 1, W);
        else if (fx.kind === 'balloon') {
          ctx.save();
          ctx.translate(o.x, o.y);
          drawBalloon(ctx, fx.text || '…', fx.color || '#fff');
          ctx.restore();
        } else {
          const sim = rt.effect(layer, W, H);
          if (sim) {
            if (opt.playing) stepSim(sim, opt.dt, opt.now, W, H, o, fx.color);
            drawSim(ctx, sim, W, H);
          }
        }
      }
    }
    ctx.restore();

    if (opt.editor?.selectedLayerId === layer.id && !layer.locked) {
      ctx.save();
      ctx.strokeStyle = '#00DAF3';
      ctx.lineWidth = 2;
      const cx = o.x + st.transform.x;
      const cy = o.y + st.transform.y;
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.moveTo(cx - 14, cy);
      ctx.lineTo(cx + 14, cy);
      ctx.moveTo(cx, cy - 14);
      ctx.lineTo(cx, cy + 14);
      ctx.stroke();
      ctx.restore();
    }
  }

  rt.brush.update(opt.dt);
  rt.brush.render(ctx);
  ctx.restore();
  return evaluated;
}
