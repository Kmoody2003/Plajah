// Lantern Garden renderer — camera flight through the yard, lean into each polaroid, go
// full page, pull back out, and every few photos a wide breath of the whole garden.
//
// Plan playback (render / Fabula) and live mode share one segment evaluator; the only
// difference is where a segment's start pose comes from (precomputed vs. the camera's
// current pose), which is what lets a tap anywhere glide gracefully to any photo.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { ShowPlan, ShowSegment, ShowSpec, VisitTiming } from '../types';
import { buildLanternGarden, type Pose, type ThemeBuild } from '../themes/lanternGarden';
import { canvasTexture, clamp01, ease, envelope, polaroidCanvas } from '../common';
import { Overlay, type ShowRenderer } from './base';
import { segmentAt } from '../planner';

interface Frame {
  pose: Pose;
  full: { index: number; amount: number; k: number } | null;
  focus: { index: number; damp: number };
  card: { kind: 'intro' | 'outro'; opacity: number } | null;
  outro: number;
  black: number;
}

interface RunSeg {
  kind: ShowSegment['kind'];
  photoIndex?: number;
  visit?: VisitTiming;
  duration: number;
  from: Pose;
  wideK?: number;
  /** Live: user asked for this photo — hold full page until they tap again. */
  held?: boolean;
}

const clonePose = (p: Pose): Pose => ({ pos: p.pos.clone(), target: p.target.clone(), fov: p.fov });

export class LanternRenderer implements ShowRenderer {
  readonly plan: ShowPlan;
  private theme!: ThemeBuild;
  private camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.05, 300);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private overlay: Overlay;
  private starts: Pose[] = [];
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private w = 1280; private h = 720;

  constructor(readonly spec: ShowSpec, plan: ShowPlan, private renderer: THREE.WebGLRenderer) {
    this.plan = plan;
    this.overlay = new Overlay(spec);
    this.composer = new EffectComposer(renderer);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(640, 360), 0.4, 0.55, 0.88);
  }

  async load(onProgress?: (k: number, label: string) => void) {
    this.theme = buildLanternGarden(this.spec.photos);
    this.composer.addPass(new RenderPass(this.theme.scene, this.camera));
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    const n = this.spec.photos.length;
    let done = 0;
    // Polaroids for every photo (small), a few at a time.
    const queue = this.spec.photos.map((_, i) => i);
    const worker = async () => {
      while (queue.length) {
        const i = queue.shift()!;
        try {
          const c = await polaroidCanvas(this.spec.photos[i]);
          const tex = canvasTexture(c);
          tex.generateMipmaps = true;
          this.theme.setPolaroidTexture(i, tex);
        } catch (e) { console.warn('[show] polaroid failed', this.spec.photos[i]?.id, e); }
        done++;
        onProgress?.(done / Math.max(1, n), 'Hanging the polaroids');
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    this.precomputeStarts();
    this.renderer.compile(this.theme.scene, this.camera);
  }

  private precomputeStarts() {
    const T = this.theme;
    let cur = clonePose(T.introFrom);
    let wideK = 0;
    this.starts = this.plan.segments.map((s) => {
      const from = clonePose(cur);
      if (s.kind === 'intro') cur = T.establish;
      else if (s.kind === 'visit') cur = T.visitPoses(s.photoIndex!).pull;
      else if (s.kind === 'wide') cur = T.widePose(wideK++, s.duration);
      else cur = T.outroTo;
      return from;
    });
  }

  private wideIndex(seg: ShowSegment) {
    let k = 0;
    for (const s of this.plan.segments) { if (s === seg) return k; if (s.kind === 'wide') k++; }
    return k;
  }

  // --- the segment evaluator ----------------------------------------------------------

  private evalSeg(seg: RunSeg, lt: number, t: number): Frame {
    const T = this.theme;
    const out: Frame = { pose: clonePose(seg.from), full: null, focus: { index: -1, damp: 0 }, card: null, outro: 0, black: 0 };
    if (seg.kind === 'intro') {
      const k = ease(lt / seg.duration);
      this.flight(seg.from, T.establish, k, 0.0, out.pose);
      out.card = { kind: 'intro', opacity: envelope(lt, seg.duration, 2.2, 2.4) * 0.98 };
      out.black = 1 - ease(lt / 2.2);
      return out;
    }
    if (seg.kind === 'wide') {
      const to = T.widePose(seg.wideK ?? 0, lt);
      const k = ease(lt / Math.min(seg.duration, 4.5));
      this.flight(seg.from, to, k, 0.9, out.pose);
      return out;
    }
    if (seg.kind === 'outro') {
      const k = ease(lt / seg.duration);
      this.flight(seg.from, T.outroTo, k, 1.2, out.pose);
      out.outro = clamp01(lt / (seg.duration * 0.9));
      out.card = { kind: 'outro', opacity: ease((lt - seg.duration * 0.35) / 2.5) * (1 - ease((lt - seg.duration + 1.6) / 1.4)) };
      out.black = ease((lt - seg.duration + 1.8) / 1.8);
      return out;
    }
    // visit
    const i = seg.photoIndex!;
    const v = seg.visit!;
    const P = T.visitPoses(i);
    const t1 = v.travel, t2 = t1 + v.approach, t3 = t2 + v.dwell;
    let damp = 0;
    if (lt < t1) {
      const lift = this.liftFor(seg.from, P.approach);
      this.flight(seg.from, P.approach, ease(lt / t1), lift, out.pose);
      damp = 0.35 * ease(lt / t1);
    } else if (lt < t2) {
      this.lerpPose(P.approach, P.focus, ease((lt - t1) / v.approach), out.pose);
      damp = 0.35 + 0.65 * ease((lt - t1) / v.approach);
    } else if (lt < t3) {
      this.lerpPose(P.focus, P.focus, 0, out.pose);
      const b = Math.sin((lt - t2) * 0.4) * 0.01; // the faintest breath
      out.pose.pos.y += b;
      damp = 1;
      const dl = lt - t2;
      const fin = Math.min(1.4, v.dwell * 0.25), fo = Math.min(1.4, v.dwell * 0.25);
      out.full = { index: i, amount: seg.held ? Math.min(1, ease(dl / fin)) : envelope(dl, v.dwell, fin, fo), k: dl / v.dwell };
    } else {
      this.lerpPose(P.focus, P.pull, ease((lt - t3) / v.retreat), out.pose);
      damp = 1 - ease((lt - t3) / v.retreat);
    }
    // follow the polaroid's (damped) swing so it never drifts out of frame
    T.photoCentre(i, t, damp, this.tmpA).sub(T.slots[i].rest);
    const follow = Math.min(1, damp * 1.2);
    out.pose.pos.addScaledVector(this.tmpA, follow);
    out.pose.target.addScaledVector(this.tmpA, follow);
    out.focus = { index: i, damp };
    return out;
  }

  /** Crane over the lines when moving between rows; a gentle arc otherwise. */
  private liftFor(a: Pose, b: Pose) {
    const dz = Math.abs(a.pos.z - b.pos.z);
    return dz > 1.5 ? 1.9 : Math.min(0.5, a.pos.distanceTo(b.pos) * 0.12);
  }

  private flight(a: Pose, b: Pose, k: number, lift: number, out: Pose) {
    // cubic bezier with both handles lifted
    const p0 = a.pos, p3 = b.pos;
    const p1 = this.tmpA.copy(p0).lerp(p3, 0.3); p1.y += lift;
    const p2 = this.tmpB.copy(p0).lerp(p3, 0.7); p2.y += lift;
    const u = 1 - k;
    out.pos.set(0, 0, 0)
      .addScaledVector(p0, u * u * u)
      .addScaledVector(p1, 3 * u * u * k)
      .addScaledVector(p2, 3 * u * k * k)
      .addScaledVector(p3, k * k * k);
    out.target.copy(a.target).lerp(b.target, ease(Math.min(1, k * 1.15)));
    out.fov = a.fov + (b.fov - a.fov) * k;
  }

  private lerpPose(a: Pose, b: Pose, k: number, out: Pose) {
    out.pos.copy(a.pos).lerp(b.pos, k);
    out.target.copy(a.target).lerp(b.target, k);
    out.fov = a.fov + (b.fov - a.fov) * k;
  }

  // --- drawing ----------------------------------------------------------------------

  private render(f: Frame, t: number) {
    const cam = this.camera;
    cam.position.copy(f.pose.pos);
    cam.fov = f.pose.fov;
    cam.updateProjectionMatrix();
    cam.lookAt(f.pose.target);
    this.theme.update(t, f.focus, cam.position, f.outro);
    this.composer.render();
    const O = this.overlay;
    O.clear();
    if (f.full) O.drawFullPage(f.full);
    if (f.card && f.card.opacity > 0) O.drawCard(f.card.kind, f.card.opacity);
    if (f.black > 0) O.drawBlack(f.black);
    const r = this.renderer;
    const auto = r.autoClear;
    r.autoClear = false;
    r.clearDepth();
    r.render(O.scene, O.cam);
    r.autoClear = auto;
  }

  private planRun(seg: ShowSegment, idx: number): RunSeg {
    return { kind: seg.kind, photoIndex: seg.photoIndex, visit: seg.visit, duration: seg.duration, from: this.starts[idx], wideK: seg.kind === 'wide' ? this.wideIndex(seg) : undefined };
  }

  async ensure(t: number) {
    const seg = segmentAt(this.plan, t);
    const idx = this.plan.segments.indexOf(seg);
    const want: number[] = [];
    for (const s of [seg, this.plan.segments[idx + 1]]) if (s?.kind === 'visit') want.push(s.photoIndex!);
    await Promise.all(want.map((i) => this.overlay.loadFull(i)));
  }

  draw(t: number) {
    const seg = segmentAt(this.plan, t);
    const idx = this.plan.segments.indexOf(seg);
    this.render(this.evalSeg(this.planRun(seg, idx), Math.max(0, t - seg.start), t), t);
  }

  // --- live mode ----------------------------------------------------------------------
  //
  // An endless gentle tour. The next photo is always one that has been full page the
  // fewest times (ties → plan order), so everyone gets their turn. A tap on any polaroid
  // glides there from wherever the camera is and holds it full page until the next tap.

  private live = {
    clock: 0, segT: 0, seg: null as RunSeg | null, viewed: [] as number[], cursor: -1,
    sinceWide: 0, wideK: 0, last: null as Frame | null, paused: false, introDone: false,
  };

  liveStart() {
    const L = this.live;
    L.clock = 0; L.segT = 0; L.viewed = this.spec.photos.map(() => 0); L.cursor = -1; L.sinceWide = 0; L.wideK = 0; L.paused = false;
    L.seg = { kind: 'intro', duration: this.plan.segments[0].duration, from: clonePose(this.theme.introFrom) };
  }

  private visitTiming(i: number, quick = false): VisitTiming {
    const base = this.plan.segments.find((s) => s.kind === 'visit' && s.photoIndex === i)?.visit;
    const v = base || { travel: 3.8, approach: 2, dwell: 6, retreat: 2.6 };
    return quick ? { travel: Math.min(2.6, v.travel), approach: v.approach * 0.85, dwell: Math.max(v.dwell, 6.5), retreat: v.retreat } : v;
  }

  private nextTourPhoto(): number {
    const L = this.live;
    const n = this.spec.photos.length;
    const min = Math.min(...L.viewed);
    for (let s = 1; s <= n; s++) {
      const i = (L.cursor + s + n) % n;
      if (L.viewed[i] === min) return i;
    }
    return 0;
  }

  private currentPose(): Pose {
    return this.live.last ? clonePose(this.live.last.pose) : clonePose(this.theme.establish);
  }

  private advanceLive() {
    const L = this.live;
    const n = this.spec.photos.length;
    const from = this.currentPose();
    if (!n) { L.seg = { kind: 'wide', duration: 1e9, from, wideK: 0 }; return; }
    const wideEvery = Math.max(3, this.spec.wideEvery || 6);
    if (L.sinceWide >= wideEvery) {
      L.sinceWide = 0;
      L.seg = { kind: 'wide', duration: this.plan.segments.find((s) => s.kind === 'wide')?.duration ?? 7, from, wideK: L.wideK++ };
    } else {
      const i = this.nextTourPhoto();
      L.cursor = i;
      L.sinceWide++;
      const v = this.visitTiming(i);
      L.seg = { kind: 'visit', photoIndex: i, visit: v, duration: v.travel + v.approach + v.dwell + v.retreat, from };
      void this.overlay.loadFull(i);
    }
    L.segT = 0;
    // preload the likely next one
    void this.overlay.loadFull(this.nextTourPhoto());
  }

  liveTick(dt: number) {
    const L = this.live;
    if (!L.seg) this.liveStart();
    L.clock += dt; // scene time always flows (lanterns, fireflies) even when paused
    if (L.paused) return;
    const seg = L.seg!;
    // a held user visit waits on the full page
    if (seg.held && seg.visit) {
      const holdAt = seg.visit.travel + seg.visit.approach + seg.visit.dwell * 0.5;
      if (L.segT + dt > holdAt) { L.segT = holdAt; return; }
    }
    // full page counts once the photo is mostly up
    if (seg.kind === 'visit' && seg.visit) {
      const mid = seg.visit.travel + seg.visit.approach + Math.min(1.5, seg.visit.dwell * 0.3);
      if (L.segT < mid && L.segT + dt >= mid) L.viewed[seg.photoIndex!]++;
    }
    L.segT += dt;
    if (L.segT >= seg.duration) {
      if (seg.kind === 'intro') L.introDone = true;
      this.advanceLive();
    }
  }

  liveDraw() {
    const L = this.live;
    if (!L.seg) this.liveStart();
    const f = this.evalSeg(L.seg!, L.segT, L.clock);
    if (L.seg!.kind === 'intro' && L.seg!.held === undefined) { /* intro as planned */ }
    L.last = f;
    this.render(f, L.clock);
  }

  private pickAt(ndcX: number, ndcY: number): number | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hit = this.raycaster.intersectObjects(this.theme.pickables, false)[0];
    return hit ? (hit.object.userData.photoIndex as number) : null;
  }

  liveHover(ndcX: number, ndcY: number) { return this.pickAt(ndcX, ndcY) != null && !this.isFull(); }

  private isFull() { return !!this.live.last?.full && this.live.last.full.amount > 0.5; }

  /** Jump the current visit to its retreat (gracefully leaving the full page). */
  private release() {
    const L = this.live;
    const seg = L.seg;
    if (!seg?.visit) return;
    const t3 = seg.visit.travel + seg.visit.approach + seg.visit.dwell;
    const fadeOut = Math.min(1.4, seg.visit.dwell * 0.25);
    seg.held = false;
    if (L.segT < t3 - fadeOut) L.segT = t3 - fadeOut;
  }

  liveTap(ndcX: number, ndcY: number) {
    const L = this.live;
    if (!L.seg) return;
    if (L.paused) L.paused = false;
    if (this.isFull()) { this.release(); return; }
    const i = this.pickAt(ndcX, ndcY);
    if (i == null) return;
    this.goTo(i, true);
  }

  private goTo(i: number, held: boolean) {
    const L = this.live;
    const v = this.visitTiming(i, true);
    L.seg = { kind: 'visit', photoIndex: i, visit: v, duration: v.travel + v.approach + v.dwell + v.retreat, from: this.currentPose(), held };
    L.segT = 0;
    L.cursor = i;
    void this.overlay.loadFull(i);
  }

  liveKey(k: 'next' | 'prev' | 'back' | 'pause') {
    const L = this.live;
    if (k === 'pause') { L.paused = !L.paused; return; }
    if (k === 'back') { if (this.isFull()) this.release(); return; }
    const n = this.spec.photos.length;
    if (!n) return;
    const i = k === 'next' ? (L.cursor + 1) % n : (L.cursor - 1 + n) % n;
    this.goTo(i, false);
  }

  liveClock() { return this.live.clock; }

  liveStatus() {
    const L = this.live;
    const seg = L.seg;
    return {
      photoIndex: seg?.kind === 'visit' ? seg.photoIndex! : null,
      fullPage: this.isFull(),
      viewed: L.viewed.filter((v) => v > 0).length,
      total: this.spec.photos.length,
      paused: L.paused,
    };
  }

  resize(w: number, h: number) {
    this.w = w; this.h = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer.setSize(w, h);
    this.bloom.resolution.set(Math.round(w / 2), Math.round(h / 2));
    this.overlay.setAspect(w / h);
  }

  dispose() {
    this.theme?.dispose();
    this.overlay.dispose();
    this.composer.dispose();
    this.bloom.dispose();
  }
}
