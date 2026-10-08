// kaijuCanvasFigure — the SVG puppets (Lorik / Lumi, KaijuFigure.tsx) rendered on a <canvas>.
//
// Why: the SVG version re-rasterises dozens of gradient/pattern-filled paths on every animated frame and
// pays DOM style/layout costs for ~40 transform writes per puppet per frame. Here every static part of
// the figure (body, head, frill, arms, legs, tail, props) is baked ONCE from the very same SVG markup into
// a bitmap sprite — so the art is pixel-for-pixel the same drawing — and each frame only draws those
// bitmaps under the pose's transforms (a GPU-friendly drawImage). The expressive bits (eyes, pupils,
// mouth, blush, shades, camera strap + flash, aura, shadow) stay vector and are drawn each frame, so the
// face remains razor sharp at any camera zoom.
//
//   const sprites = await bakeKaijuSprites('lorik', false, pxPerUnit);
//   const fig = new KaijuCanvasFigure('lorik', sprites);
//   fig.draw(ctx, pose, { flash })        // ctx is in character space: feet at (0,0), ~252 units tall

import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  ARM_LEN, BROW_L, BROW_R, EYE_L, EYE_R, EYE_Y, HEAD_CY, HEAD_SCALE, HIP, KAIJU_PALETTES, KaijuFigureSvg, NECK_Y, SHOULDER, type KaijuKind,
} from '../KaijuFigure';
import { type Pose, clamp } from '../kaijuPose';

export interface Sprite { img: CanvasImageSource; x: number; y: number; w: number; h: number }
export interface KaijuSprites {
  kind: KaijuKind; flipTail: boolean; pxPerUnit: number;
  parts: Partial<Record<'body' | 'tail' | 'legL' | 'legR' | 'mane' | 'head' | 'headTop' | 'headBrows' | 'armL' | 'armR' | 'mic' | 'book' | 'cam', Sprite>>;
}

const PARTS = ['body', 'tail', 'legL', 'legR', 'mane', 'head', 'headTop', 'armL', 'armR', 'mic', 'book', 'cam'] as const;
const PAD = 2.5;

/** Keep only `target` (and the transform groups + defs on the path to it); drop nested parts and dynamic bits. */
function prune(svg: SVGSVGElement, partName: string): SVGElement | null {
  if (partName === 'body') {
    svg.querySelectorAll('[data-kj-part],[data-kj-dyn]').forEach(n => n.remove());
    return svg;
  }
  const target = svg.querySelector(`[data-kj-part="${partName}"]`) as SVGElement | null;
  if (!target) return null;
  // siblings along the path to the root go (but defs stay: gradients + the grain pattern live there)
  let node: Element = target;
  while (node.parentElement && node !== svg) {
    const par = node.parentElement;
    for (const sib of Array.from(par.children)) if (sib !== node && sib.tagName.toLowerCase() !== 'defs') sib.remove();
    node = par;
  }
  target.querySelectorAll('[data-kj-part],[data-kj-dyn]').forEach(n => n.remove());
  target.removeAttribute('opacity');
  return target;
}

async function rasterise(svgMarkup: string, w: number, h: number): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgMarkup);
  await img.decode();
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/** Bake every part of a figure into bitmaps at `pxPerUnit` pixels per character unit. */
export async function bakeKaijuSprites(kind: KaijuKind, flipTail: boolean, pxPerUnit: number): Promise<KaijuSprites> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:600px;height:700px;pointer-events:none;visibility:hidden';
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(React.createElement(KaijuFigureSvg, { kind, flipTail }));
  let live = host.querySelector('svg') as SVGSVGElement | null;
  // rAF OR a 32 ms timer: rAF never fires in a hidden tab, and a bake started there must still finish
  for (let i = 0; !live && i < 60; i++) { await new Promise(r => { const t = setTimeout(() => r(null), 32); requestAnimationFrame(() => { clearTimeout(t); r(null); }); }); live = host.querySelector('svg') as SVGSVGElement | null; }
  if (!live) { root.unmount(); host.remove(); throw new Error('kaiju sprite bake: figure did not render'); }
  const out: KaijuSprites = { kind, flipTail, pxPerUnit, parts: {} };
  try {
    for (const name of PARTS) {
      if (name === 'cam' && kind === 'lorik') continue;
      if (name === 'book' && kind === 'lumi') continue;
      // 1) prune a copy and mount it so the browser can measure the surviving geometry
      const copy = live.cloneNode(true) as SVGSVGElement;
      copy.setAttribute('width', '600'); copy.setAttribute('height', '700');
      const target = prune(copy, name);
      if (!target) continue;
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;left:-10000px;top:0;width:600px;height:700px;visibility:hidden';
      probe.appendChild(copy); document.body.appendChild(probe);
      let bb: { x: number; y: number; w: number; h: number };
      try {
        const g = (name === 'body' ? (copy.querySelector('g') as SVGGraphicsElement) : (target as unknown as SVGGraphicsElement));
        const b = g.getBBox();
        const m = copy.getScreenCTM()!.inverse().multiply(g.getScreenCTM()!);
        const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
        const x0 = Math.min(...pts.map(p => p.x)) - PAD, x1 = Math.max(...pts.map(p => p.x)) + PAD;
        const y0 = Math.min(...pts.map(p => p.y)) - PAD, y1 = Math.max(...pts.map(p => p.y)) + PAD;
        bb = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      } finally { probe.remove(); }
      if (!(bb.w > 1 && bb.h > 1)) continue;
      // 2) serialise with a viewBox that is exactly the part's box
      copy.setAttribute('viewBox', `${bb.x} ${bb.y} ${bb.w} ${bb.h}`);
      copy.setAttribute('width', String(bb.w * pxPerUnit)); copy.setAttribute('height', String(bb.h * pxPerUnit));
      copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); copy.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      copy.style.overflow = 'hidden';
      const markup = new XMLSerializer().serializeToString(copy);
      const canvas = await rasterise(markup, bb.w * pxPerUnit, bb.h * pxPerUnit);
      out.parts[name] = { img: canvas, x: bb.x, y: bb.y, w: bb.w, h: bb.h };
    }
  } finally { setTimeout(() => { root.unmount(); host.remove(); }, 0); }
  return out;
}

// ------------------------------------------------------------------------------------------------ drawing
const f = (s: Sprite | undefined, ctx: CanvasRenderingContext2D) => { if (s) ctx.drawImage(s.img, s.x, s.y, s.w, s.h); };
const rad = (d: number) => (d * Math.PI) / 180;

export interface FigureFx { flash?: number; shadow?: string; aura?: boolean }

export class KaijuCanvasFigure {
  private readonly P: ReturnType<() => (typeof KAIJU_PALETTES)[KaijuKind]>;
  private readonly eyeL = new Path2D(EYE_L); private readonly eyeR = new Path2D(EYE_R);
  private readonly browL = new Path2D(BROW_L); private readonly browR = new Path2D(BROW_R);
  private readonly heart = new Path2D('M 0 7 C -14 -4 -9 -14 0 -7 C 9 -14 14 -4 0 7 Z');
  private readonly drop = new Path2D('M 0 -7 C 5 0 6 3 6 5 C 6 9 3 11 0 11 C -3 11 -6 9 -6 5 C -6 3 -5 0 0 -7 Z');
  private readonly mic: 'L' | 'R';
  private gradCtx: CanvasRenderingContext2D | null = null;
  private gEye!: CanvasGradient; private gFlash!: CanvasGradient; private gAura!: CanvasGradient;
  sprites: KaijuSprites;

  constructor(readonly kind: KaijuKind, sprites: KaijuSprites) {
    this.sprites = sprites; this.P = KAIJU_PALETTES[kind]; this.mic = kind === 'lorik' ? 'L' : 'R';
  }
  setSprites(s: KaijuSprites) { this.sprites = s; }

  private gradients(ctx: CanvasRenderingContext2D) {
    if (this.gradCtx === ctx) return;
    this.gradCtx = ctx;
    this.gEye = ctx.createLinearGradient(0, -184, 0, -147); this.gEye.addColorStop(0, this.P.eyeTop); this.gEye.addColorStop(1, this.P.eyeBot);
    this.gFlash = ctx.createRadialGradient(0, 0, 0, 0, 0, 60);
    this.gFlash.addColorStop(0, 'rgba(255,255,255,1)'); this.gFlash.addColorStop(0.35, 'rgba(255,246,216,0.85)'); this.gFlash.addColorStop(1, 'rgba(255,255,255,0)');
    this.gAura = ctx.createRadialGradient(0, -150, 0, 0, -150, 140);
    const a = this.P.aura; this.gAura.addColorStop(0, a + '8C'); this.gAura.addColorStop(1, a + '00');
  }

  /** Draw the figure (feet at the origin). `ctx` must already carry the stage → screen transform. */
  draw(ctx: CanvasRenderingContext2D, p: Pose, fx: FigureFx = {}) {
    this.gradients(ctx);
    const S = this.sprites.parts, P = this.P;
    const air = clamp(-p.y / 140);
    // ground shadow (stays on the floor while the figure leaps)
    ctx.save();
    ctx.translate(p.x, 3); ctx.scale(1 - air * 0.45, 1 - air * 0.4);
    ctx.globalAlpha = (1 - air * 0.5); ctx.fillStyle = fx.shadow ?? 'rgba(60,30,90,0.16)';
    ctx.beginPath(); ctx.ellipse(0, 0, 52, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    const spin = Math.abs(p.spin) < 0.08 ? Math.sign(p.spin || 1) * 0.08 : p.spin;
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(rad(p.rot)); ctx.scale(p.sx * spin, p.sy);

    if (p.glow > 0.02 && fx.aura !== false) {
      ctx.save(); ctx.globalAlpha = p.glow * 0.65; ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = this.gAura; ctx.beginPath(); ctx.arc(0, -150, 140, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }

    // tail (behind everything). A flipped tail pivots about the mirrored point, in the opposite direction.
    if (S.tail) {
      ctx.save();
      const flip = this.sprites.flipTail;
      ctx.translate(flip ? 26 : -26, -40); ctx.rotate(rad(flip ? -p.tail : p.tail)); ctx.translate(flip ? -26 : 26, 40);
      f(S.tail, ctx); ctx.restore();
    }
    f(S.body, ctx);
    // legs
    ctx.save(); ctx.translate(-HIP.x, HIP.y + p.liftL); ctx.rotate(rad(p.legL)); f(S.legL, ctx); ctx.restore();
    ctx.save(); ctx.translate(HIP.x, HIP.y + p.liftR); ctx.rotate(rad(-p.legR)); f(S.legR, ctx); ctx.restore();

    // head: frill → head art → blush → eyes → brows/nose → mouth → shades
    ctx.save();
    ctx.translate(p.headX, p.headY + NECK_Y); ctx.rotate(rad(p.headRot)); ctx.scale(p.headScale, p.headScale); ctx.translate(0, -NECK_Y);
    ctx.save();
    ctx.translate(0, NECK_Y); ctx.scale(HEAD_SCALE, HEAD_SCALE); ctx.translate(0, -NECK_Y);
    if (S.mane) { ctx.save(); const m = 1 + 0.16 * p.mane; ctx.translate(0, HEAD_CY); ctx.scale(m, m); ctx.translate(0, -HEAD_CY); f(S.mane, ctx); ctx.restore(); }
    f(S.head, ctx);
    this.face(ctx, p, S.headTop);
    ctx.restore();
    ctx.restore();

    // Lumi's camera (raised to her face for a snap)
    if (S.cam) {
      const u = clamp(p.camUp);
      ctx.save(); ctx.translate(0, -74 - 93 * u); ctx.scale(1 + 0.12 * u, 1 + 0.12 * u);
      if (u < 0.99) {
        ctx.globalAlpha = 1 - u; ctx.strokeStyle = '#15151B'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-19, -10); ctx.lineTo(-30, -40); ctx.moveTo(19, -10); ctx.lineTo(30, -40); ctx.stroke(); ctx.globalAlpha = 1;
      }
      f(S.cam, ctx);
      const fl = fx.flash ?? 0;
      if (fl > 0.01) { ctx.globalAlpha = clamp(fl); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = this.gFlash; ctx.beginPath(); ctx.arc(0, 0, 60, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }

    // arms (+ the props they hold)
    const micArmRot = this.mic === 'L' ? p.armL : -p.armR;
    const bookArmRot = this.mic === 'L' ? -p.armR : p.armL;
    const arm = (side: 'L' | 'R') => {
      ctx.save();
      if (side === 'L') { ctx.translate(-SHOULDER.x, SHOULDER.y); ctx.rotate(rad(p.armL)); } else { ctx.translate(SHOULDER.x, SHOULDER.y); ctx.rotate(rad(-p.armR)); }
      f(side === 'L' ? S.armL : S.armR, ctx);
      if (this.mic === side && S.mic && p.mic > 0.5) { ctx.save(); ctx.translate(0, ARM_LEN - 4); ctx.rotate(rad(-micArmRot + (this.mic === 'L' ? -22 : 22))); f(S.mic, ctx); ctx.restore(); }
      if (this.mic !== side && S.book && p.book > 0.15) {
        ctx.save(); ctx.translate(0, ARM_LEN - 2); ctx.rotate(rad(-bookArmRot)); ctx.translate(0, 10);
        const k = 0.4 + 0.6 * clamp(p.book); ctx.scale(k, k); f(S.book, ctx); ctx.restore();
      }
      ctx.restore();
    };
    arm('L'); arm('R');
    ctx.restore();
  }

  /** Dynamic face layers, in head-art space (after the HEAD_SCALE transform). */
  private face(ctx: CanvasRenderingContext2D, p: Pose, headTop: Sprite | undefined) {
    const P = this.P, lorik = this.kind === 'lorik';
    // blush
    ctx.fillStyle = P.blush; ctx.globalAlpha = clamp(0.35 + 0.55 * p.blush);
    ctx.beginPath(); ctx.ellipse(-43, -145, 7.5, 3.6, 0, 0, Math.PI * 2); ctx.ellipse(43, -145, 7.5, 3.6, 0, 0, Math.PI * 2); ctx.fill();
    // open eyes — drawn one at a time so each can blink / wink on its own (the VTuber face rig needs that)
    const openA = (1 - p.happy) * (1 - p.closed) * (1 - p.squint) * (1 - p.hearts);
    if (openA > 0.01) {
      const gx = clamp(p.lookX, -1, 1) * 3.6, gy = clamp(p.lookY, -1, 1) * 2.2, cy = EYE_Y - 6;
      for (const side of [-1, 1] as const) {
        const open = Math.max(0.06, p.eyeOpen * (side < 0 ? p.eyeL : p.eyeR));
        ctx.save(); ctx.globalAlpha = clamp(openA);
        ctx.translate(0, cy); ctx.scale(p.eyeScale, open * p.eyeScale); ctx.translate(0, -cy);
        ctx.fillStyle = this.gEye; ctx.fill(side < 0 ? this.eyeL : this.eyeR);
        ctx.translate(gx, gy);
        if (lorik) {
          ctx.fillStyle = P.pupil; ctx.beginPath(); ctx.ellipse(side * 21, -159, 5.6, 7.6, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(side < 0 ? -19.3 : 22.7, -162, 1.7, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(255,178,90,0.55)'; ctx.beginPath(); ctx.ellipse(side * 26, -156, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = P.pupil; ctx.beginPath(); ctx.ellipse(side * 19, -161, 3.4, 5, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(side < 0 ? -18 : 20, -163, 1.1, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
    }
    // happy ^^ and closed eyes
    const hA = p.happy * (1 - p.closed), cA = p.closed;
    if (hA > 0.01 || cA > 0.01) {
      ctx.strokeStyle = P.pupil; ctx.lineCap = 'round';
      if (hA > 0.01) { ctx.globalAlpha = clamp(hA); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-38, -154); ctx.quadraticCurveTo(-26, -166, -14, -154); ctx.moveTo(38, -154); ctx.quadraticCurveTo(26, -166, 14, -154); ctx.stroke(); }
      if (cA > 0.01) { ctx.globalAlpha = clamp(cA); ctx.lineWidth = 3.6; ctx.beginPath(); ctx.moveTo(-40, -160); ctx.quadraticCurveTo(-26, -151, -12, -160); ctx.moveTo(40, -160); ctx.quadraticCurveTo(26, -151, 12, -160); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
    // laughing squint  > <
    if (p.squint > 0.02) {
      ctx.globalAlpha = clamp(p.squint) * (1 - p.closed); ctx.strokeStyle = P.pupil; ctx.lineWidth = 4.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-40, -168); ctx.lineTo(-22, -158); ctx.lineTo(-40, -148); ctx.moveTo(40, -168); ctx.lineTo(22, -158); ctx.lineTo(40, -148); ctx.stroke(); ctx.globalAlpha = 1;
    }
    // love eyes
    if (p.hearts > 0.02) {
      ctx.globalAlpha = clamp(p.hearts); ctx.fillStyle = '#FF4F8B';
      const pulse = 1 + 0.12 * Math.sin(performance.now() / 120);
      for (const x of [-25, 25]) { ctx.save(); ctx.translate(x, -160); ctx.scale(1.25 * pulse, 1.25 * pulse); ctx.fill(this.heart); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(-3, -3, 1.6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#FF4F8B'; ctx.restore(); }
      ctx.globalAlpha = 1;
    }
    // tear + sweat drop
    if (p.tear > 0.02) { const k = clamp(p.tear), t = (performance.now() / 1400) % 1; ctx.save(); ctx.globalAlpha = k * (1 - t * 0.5); ctx.fillStyle = '#9FD8FF'; ctx.translate(-30, -146 + t * 16); ctx.scale(0.8, 0.8); ctx.fill(this.drop); ctx.restore(); ctx.globalAlpha = 1; }
    if (p.sweat > 0.02) { ctx.save(); ctx.globalAlpha = clamp(p.sweat); ctx.fillStyle = '#B9E6FF'; ctx.translate(55, -190 + 4 * Math.sin(performance.now() / 300)); ctx.scale(0.9, 0.9); ctx.fill(this.drop); ctx.restore(); ctx.globalAlpha = 1; }
    // brows (tilt = angry … worried, lift = raised) then the nose, over the eyes
    {
      const tilt = clamp(p.brow, -1.3, 1.3) * 17, lift = clamp(p.browY, -1.2, 1.2) * 9;
      ctx.fillStyle = '#0E0B14';
      const asym = clamp(p.browAsym, -1, 1) * 6;
      ctx.save(); ctx.translate(0, lift + asym); ctx.translate(-2, -169); ctx.rotate(rad(tilt)); ctx.translate(2, 169); ctx.fill(this.browL); ctx.restore();
      ctx.save(); ctx.translate(0, lift - asym); ctx.translate(2, -169); ctx.rotate(rad(-tilt)); ctx.translate(-2, 169); ctx.fill(this.browR); ctx.restore();
    }
    f(headTop, ctx);
    // mouth
    const open = clamp(p.mouth), hw = 6 + 3.5 * p.mouthW;
    if (open <= 0.06) {
      ctx.strokeStyle = '#0E0B14'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-hw, -137); ctx.quadraticCurveTo(0, -137 + 8 * p.smile, hw, -137); ctx.stroke();
    } else {
      const rx = 4 + 6 * p.mouthW * (0.65 + 0.35 * open), ry = 1.8 + 8 * open;
      ctx.fillStyle = '#4A0F24'; ctx.beginPath(); ctx.ellipse(0, -137 + ry * 0.4, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FF6F91'; ctx.beginPath(); ctx.ellipse(0, -137 + ry * 0.85, rx * 0.6, ry * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      const top = -137 + ry * 0.4 - ry;
      ctx.save(); ctx.translate(rx * 0.35 - 3.5, top + 137.5); ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(1.5, -137.5); ctx.lineTo(5.5, -137.5); ctx.lineTo(3.5, -132.5); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    if (p.tongue > 0.05) {
      const k = clamp(p.tongue), my = open > 0.06 ? -137 + (1.8 + 8 * open) * 1.25 : -136;
      ctx.fillStyle = '#FF6F91'; ctx.beginPath(); ctx.ellipse(1.5, my + 3 * k, 5.2, 2 + 6 * k, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(160,30,70,0.55)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(1.5, my + 1); ctx.lineTo(1.5, my + 3 + 5 * k); ctx.stroke();
    }
    // sunglasses (Lumi's "cool" beat)
    if (p.shades > 0.02) {
      ctx.save(); ctx.globalAlpha = clamp(p.shades); ctx.translate(0, -28 * (1 - p.shades));
      ctx.fillStyle = '#121218';
      ctx.beginPath(); ctx.moveTo(-56, -188); ctx.lineTo(-4, -170); ctx.lineTo(-6, -156); ctx.bezierCurveTo(-10, -148, -20, -145, -30, -146); ctx.bezierCurveTo(-46, -148, -56, -160, -56, -188); ctx.fill();
      ctx.beginPath(); ctx.moveTo(56, -188); ctx.lineTo(4, -170); ctx.lineTo(6, -156); ctx.bezierCurveTo(10, -148, 20, -145, 30, -146); ctx.bezierCurveTo(46, -148, 56, -160, 56, -188); ctx.fill();
      ctx.strokeStyle = '#121218'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-8, -168); ctx.quadraticCurveTo(0, -172, 8, -168); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-46, -178); ctx.lineTo(-34, -174); ctx.moveTo(22, -174); ctx.lineTo(34, -178); ctx.stroke();
      ctx.restore();
    }
  }
}
