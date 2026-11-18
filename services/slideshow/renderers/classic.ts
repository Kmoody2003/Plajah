// Classic renderer — the plain, beautiful slideshow: full-screen photos with Ken Burns
// moves, a 2.5D depth parallax (subject and foreground float a little ahead of the
// background), and graceful transitions (crossfade, dip to black, dreamy drift,
// parallax push, soft wipe). Photos whose shape fights the screen sit on a soft blurred
// copy of themselves instead of being cropped.

import * as THREE from 'three';
import type { ClassicTransition, ShowPlan, ShowSegment, ShowSpec } from '../types';
import { PhotoQuad, clamp01, ease, envelope, isFullFrame, kenBurns, strHash } from '../common';
import { Overlay, type ShowRenderer } from './base';
import { segmentAt } from '../planner';
import { TransitionPass, transitionById } from '../transitions';
import { FinishPass, lookFor } from '../finish';

interface Layer { seg: ShowSegment; lt: number; role: 'in' | 'out' | 'solo'; p: number; tr: ClassicTransition | string }

export class ClassicRenderer implements ShowRenderer {
  readonly plan: ShowPlan;
  private overlay: Overlay;
  private extra: PhotoQuad[] = [new PhotoQuad(), new PhotoQuad(), new PhotoQuad(), new PhotoQuad()];
  private w = 1280; private h = 720;
  private xf: number;
  private tx: TransitionPass;
  private finish: FinishPass;

  constructor(readonly spec: ShowSpec, plan: ShowPlan, private renderer: THREE.WebGLRenderer) {
    this.plan = plan;
    this.overlay = new Overlay(spec);
    for (const q of this.extra) this.overlay.scene.add(q.mesh);
    this.xf = Math.max(0.4, Math.min(4, spec.transition?.seconds ?? 1.6)) * Math.max(0.6, Math.min(1.8, spec.pace || 1));
    this.tx = new TransitionPass(renderer, this.w, this.h);
    this.finish = new FinishPass(renderer);
  }

  async load(onProgress?: (k: number, label: string) => void) {
    // Warm the first few full photos; the rest stream in ahead of the playhead.
    const n = Math.min(3, this.spec.photos.length);
    for (let i = 0; i < n; i++) { await this.overlay.loadFull(i).catch(() => null); onProgress?.((i + 1) / Math.max(1, n), 'Preparing photos'); }
    if (!n) onProgress?.(1, 'Ready');
  }

  async ensure(t: number) {
    const seg = segmentAt(this.plan, t);
    const idx = this.plan.segments.indexOf(seg);
    const want = new Set<number>();
    for (const s of [this.plan.segments[idx - 1], seg, this.plan.segments[idx + 1]]) if (s?.photoIndex != null) want.add(s.photoIndex);
    if (seg.kind === 'intro' && this.spec.photos.length) want.add(0);
    await Promise.all([...want].map((i) => this.overlay.loadFull(i).catch(() => null)));
    await this.finish.prepare(this.lookAt(t));
  }
  private lookAt(t: number) { const L = this.layers(t); const s = L[L.length - 1].seg; return lookFor(this.spec, s.photoIndex != null ? this.spec.photos[s.photoIndex] : null); }

  /** Which segments are visible at t, and how far through the transition we are. */
  private layers(t: number): Layer[] {
    const seg = segmentAt(this.plan, t);
    const idx = this.plan.segments.indexOf(seg);
    const prev = this.plan.segments[idx - 1];
    const lt = t - seg.start;
    if (prev && t < prev.start + prev.duration) {
      const p = clamp01(lt / this.xf);
      const tr = prev.transition || 'crossfade';
      return [
        { seg: prev, lt: t - prev.start, role: 'out', p, tr },
        { seg, lt, role: 'in', p, tr },
      ];
    }
    return [{ seg, lt, role: 'solo', p: 1, tr: 'crossfade' }];
  }

  draw(t: number) {
    const L = this.layers(t);
    const r = this.renderer;
    if (L.length === 2 && transitionById(String(L[0].tr).split(':')[0])) {
      // Fabula library transition: each side rendered whole, then blended by its shader
      r.setRenderTarget(this.tx.outgoing);
      this.paint([{ ...L[0], role: 'solo' }]);
      r.setRenderTarget(this.tx.incoming);
      this.paint([{ ...L[1], role: 'solo' }]);
      r.setRenderTarget(null);
      this.tx.blend(String(L[0].tr), ease(L[0].p));
    } else {
      r.setRenderTarget(null);
      this.paint(L);
    }
    // the grade + lens of the shot coming in, then the words on top
    this.finish.apply(this.lookAt(t), performance.now());
    this.overlay.renderText(r);
  }

  private paint(layers: Layer[]) {
    const O = this.overlay;
    O.clear();
    for (const q of this.extra) q.mesh.visible = false;
    let slot = 0;
    let black = 0;
    let z = 1;
    for (const L of layers) {
      const { opacity, dx, zoomBoost, blur, wipe, dip } = this.transitionLook(L);
      black = Math.max(black, dip);
      const s = L.seg;
      if (s.kind === 'visit' && s.photoIndex != null) {
        const tex = O.fullTex(s.photoIndex);
        const p = this.spec.photos[s.photoIndex];
        if (!tex || !p || slot + 1 >= this.extra.length) continue;
        const ia = p.width / p.height, sa = this.w / this.h;
        const graphic = isFullFrame(p);
        const fs = Math.max(0.5, Math.min(1, p.fullScale ?? 1));
        const fits = !graphic && fs >= 0.999 && ia / sa > 0.78 && ia / sa < 1.3;
        const k = L.lt / s.duration;
        const kb = kenBurns(p, k);
        const par = graphic ? 0 : this.spec.parallax ?? 0.6;
        const seed = strHash(p.id);
        // slow orbit of the "camera" for depth parallax, plus the push direction in transitions
        const orbit = { x: Math.sin(L.lt * 0.35 + seed * 6) * 0.012 * par + dx * 0.06 * par, y: Math.cos(L.lt * 0.27 + seed * 4) * 0.008 * par };
        const depthZoom = 1 + par * 0.05; // margin so parallax never reveals an edge
        if (!fits) {
          this.extra[slot++].apply({
            tex: O.blurTex(tex), opacity: opacity * 0.9, zoom: 1.12, pan: { x: 0, y: 0 }, focus: p.focus, par: { x: 0, y: 0 }, depth: 0,
            rect: { x: dx * 0.5, y: 0, w: 1, h: 1 }, fit: 'cover', vignette: 1.2, blur: 0, z: z++, wipe,
          }, sa);
        }
        this.extra[slot++].apply({
          tex, opacity, zoom: kb.zoom * depthZoom * zoomBoost, pan: kb.pan, focus: p.focus, par: orbit, depth: par,
          rect: fits ? { x: dx, y: 0, w: 1, h: 1 } : { x: (1 - 0.94 * fs) / 2 + dx, y: (1 - 0.92 * fs) / 2, w: 0.94 * fs, h: 0.92 * fs }, fit: fits ? 'cover' : 'contain',
          vignette: fits ? 0.35 : 0.1, blur, z: z++, wipe,
        }, sa);
        const ct = O.captionTex(s.photoIndex);
        if (ct) O.caption.set(ct, opacity * envelope(L.lt, s.duration, 1.6, 1.6 + this.xf), { x: 0.1, y: 0.86, w: 0.8, h: 0.07 }, sa, 40);
      } else if (s.kind === 'intro' || s.kind === 'outro') {
        // a whisper of the first / last photo behind the card
        const pi = s.kind === 'intro' ? 0 : this.spec.photos.length - 1;
        const tex = pi >= 0 ? O.fullTex(pi) : null;
        const p = this.spec.photos[pi];
        if (tex && p && slot < this.extra.length) {
          this.extra[slot++].apply({
            tex: O.blurTex(tex), opacity: opacity * 0.35, zoom: 1.1 + L.lt * 0.004, pan: { x: 0, y: 0 }, focus: p.focus, par: { x: 0, y: 0 }, depth: 0,
            rect: { x: 0, y: 0, w: 1, h: 1 }, fit: 'cover', vignette: 1.4, blur: 0, z: z++,
          }, this.w / this.h);
        }
        const env = s.kind === 'intro'
          ? envelope(L.lt, s.duration - this.xf * 0.5, 1.8, 1.4)
          : ease((L.lt - 0.8) / 2) * (1 - ease((L.lt - s.duration + 1.4) / 1.4));
        O.drawCard(s.kind, env * opacity);
        if (s.kind === 'intro') black = Math.max(black, 1 - ease(L.lt / 1.6));
        if (s.kind === 'outro') black = Math.max(black, ease((L.lt - s.duration + 1.6) / 1.6));
      }
    }
    if (black > 0) O.drawBlack(black);
    const r = this.renderer;
    r.setClearColor(0x050407, 1);
    r.clear();
    r.render(O.scene, O.cam);
  }

  private transitionLook(L: Layer) {
    const e = ease(L.p);
    let opacity = 1, dx = 0, zoomBoost = 1, blur = 0, dip = 0;
    let wipe: number | undefined;
    if (L.role === 'solo') return { opacity, dx, zoomBoost, blur, wipe, dip };
    const inc = L.role === 'in';
    switch (L.tr) {
      case 'crossfade':
        opacity = inc ? e : 1;
        break;
      case 'dip':
        // out fades to black over the first half, in rises from black over the second
        opacity = inc ? ease((L.p - 0.5) * 2) : 1 - ease(L.p * 2);
        dip = 0;
        break;
      case 'drift':
        opacity = inc ? e : 1;
        zoomBoost = inc ? 1.06 - 0.06 * e : 1 + 0.03 * e;
        blur = inc ? (1 - e) * 2.5 : e * 1.5;
        break;
      case 'parallax-push':
        opacity = inc ? e : 1 - e * 0.4;
        dx = inc ? (1 - e) * 0.18 : -e * 0.12;
        break;
      case 'soft-wipe':
        opacity = 1;
        if (inc) wipe = e;
        break;
    }
    return { opacity, dx, zoomBoost, blur, wipe, dip };
  }

  // --- live: auto-advance; tap right = next, left = back; hold space to pause ---------

  private live = { t: 0, paused: false, viewed: new Set<number>() };

  liveStart() { this.live = { t: 0, paused: false, viewed: new Set() }; }

  liveTick(dt: number) {
    const L = this.live;
    if (L.paused) return;
    L.t += dt;
    if (L.t >= this.plan.duration) L.t = 0; // loop forever in live mode
    const seg = segmentAt(this.plan, L.t);
    if (seg.photoIndex != null) L.viewed.add(seg.photoIndex);
    const idx = this.plan.segments.indexOf(seg);
    for (const s of [seg, this.plan.segments[idx + 1], this.plan.segments[idx + 2]]) if (s?.photoIndex != null) void this.overlay.loadFull(s.photoIndex);
  }

  liveDraw() { this.draw(this.live.t); }

  liveTap(ndcX: number) { this.liveKey(ndcX < -0.35 ? 'prev' : 'next'); }

  liveHover() { return false; }

  liveKey(k: 'next' | 'prev' | 'back' | 'pause') {
    const L = this.live;
    if (k === 'pause') { L.paused = !L.paused; return; }
    const seg = segmentAt(this.plan, L.t);
    const idx = this.plan.segments.indexOf(seg);
    // Jumping to a segment's start plays the transition into it from the previous one.
    const target = k === 'next' ? this.plan.segments[idx + 1] : k === 'prev' ? this.plan.segments[Math.max(0, idx - 1)] : null;
    if (target) { L.t = target.start + 0.0001; L.paused = false; }
  }

  liveClock() { return this.live.t; }

  liveStatus() {
    const seg = segmentAt(this.plan, this.live.t);
    return { photoIndex: seg.photoIndex ?? null, fullPage: seg.kind === 'visit', viewed: this.live.viewed.size, total: this.spec.photos.length, paused: this.live.paused };
  }

  resize(w: number, h: number) {
    this.w = w; this.h = h; this.overlay.setAspect(w / h);
    const v = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.tx.setSize(Math.max(2, v.x), Math.max(2, v.y));
  }

  dispose() { this.tx.dispose(); this.finish.dispose(); for (const q of this.extra) q.dispose(); this.overlay.dispose(); }
}
