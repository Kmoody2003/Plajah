// Back Yard renderer — Kenne's photographic plates with the user's photos composited into
// every placeholder window.
//
// A 2D camera moves over each plate (overview drift → lean into a window → back out).
// Each window is a mesh in plate space whose shader maps the photo through a projective
// homography (perspective-correct), keeps the plate's own pixels wherever they aren't the
// flat placeholder grey (clothespins, twine and overlapping prints stay on top), and
// relights the photo from the grey's shading and colour cast so it sits in the light.
// Video loops carry a tracked quad per frame; the frame on screen picks the quad.

import * as THREE from 'three';
import type { ShowPhoto, ShowPlan, ShowSegment, ShowSpec } from '../types';
import { segmentAt } from '../planner';
import { canvasTexture, clamp01, ease, envelope, isFullFrame, TextureCache } from '../common';
import { renderFixed } from '../photoPrep';
import { Overlay, type ShowRenderer } from './base';
import { BACKYARD, byId, loadTracks, pointInQuad, quadCentre, quadToUnit, trackedQuad, type LoopTracks, type PackAsset } from '../themes/backyardPack';
import { VideoFrameSource } from '../videoSource';
import { TransitionPass } from '../transitions';
import { FinishPass, lookFor } from '../finish';

interface Cam { cx: number; cy: number; z: number }
interface LayerState { asset: PackAsset; assign: number[]; cam: Cam; time: number }
interface Frame {
  A: LayerState | null;
  B: LayerState | null;
  mixA: number;
  full: { index: number; amount: number; k: number; bokeh?: string; bokehTime: number; soft?: boolean } | null;
  card: { kind: 'intro' | 'outro'; opacity: number } | null;
  black: number;
  chapter?: { text: string; opacity: number };
  /** Fabula transition used while B (outgoing) hands over to A (incoming); progress = mixA. */
  tx?: string;
  /** The photo this shot is about (for its look). */
  photo?: number;
}

const PLATE_VS = `varying vec2 vPos; void main(){ vPos = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const PLATE_FS = `uniform sampler2D uMap; uniform float uOpacity; varying vec2 vPos;
void main(){ vec4 c = texture2D(uMap, vec2(vPos.x, 1.0 - vPos.y)); gl_FragColor = vec4(c.rgb, uOpacity);
#include <colorspace_fragment>
}`;
const WIN_FS = `uniform sampler2D uPlate; uniform sampler2D uPhoto; uniform mat3 uH; uniform float uLum; uniform float uOpacity; uniform vec4 uCrop;
varying vec2 vPos;
vec3 toSrgb(vec3 c){ return pow(max(c, vec3(0.0)), vec3(1.0/2.2)); }
void main(){
  vec3 plate = texture2D(uPlate, vec2(vPos.x, 1.0 - vPos.y)).rgb;
  vec3 ps = toSrgb(plate);
  float mx = max(ps.r, max(ps.g, ps.b)), mn = min(ps.r, min(ps.g, ps.b));
  float sat = mx > 0.001 ? (mx - mn) / mx : 0.0;
  float lum = dot(ps, vec3(0.299, 0.587, 0.114));
  // only the flat placeholder grey takes the photo — anything on top of it stays
  float m = (1.0 - smoothstep(0.11, 0.21, sat)) * (1.0 - smoothstep(0.17, 0.32, abs(lum - uLum)));
  vec3 h = uH * vec3(vPos, 1.0);
  vec2 uv = clamp(h.xy / h.z, 0.002, 0.998);
  vec2 puv = uCrop.xy + uv * uCrop.zw;
  vec3 photo = texture2D(uPhoto, vec2(puv.x, 1.0 - puv.y)).rgb;
  float shade = clamp(lum / max(uLum, 0.05), 0.55, 1.35);
  vec3 tint = mix(vec3(1.0), ps / max(lum, 0.05), 0.55);
  vec3 col = photo * mix(1.0, shade, 0.85) * tint;
  col = mix(col, vec3(dot(col, vec3(0.3333))), 0.06);
  gl_FragColor = vec4(col, m * uOpacity);
  #include <colorspace_fragment>
}`;

class WindowMesh {
  geo = new THREE.BufferGeometry();
  pos = new Float32Array(12);
  mat: THREE.ShaderMaterial;
  mesh: THREE.Mesh;
  h = new THREE.Matrix3();
  constructor() {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uPlate: { value: null }, uPhoto: { value: null }, uH: { value: this.h }, uLum: { value: 0.55 }, uOpacity: { value: 1 }, uCrop: { value: new THREE.Vector4(0, 0, 1, 1) } },
      vertexShader: PLATE_VS, fragmentShader: WIN_FS,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
  }
  set(quad: number[], plate: THREE.Texture, photo: THREE.Texture, crop: { x: number; y: number; w: number; h: number }, lum: number, opacity: number, order: number) {
    // mesh 10% larger than the detected quad (bent or tilted prints spill past it) — the grey mask decides the true edge
    const c = quadCentre(quad);
    for (let i = 0; i < 4; i++) {
      this.pos[i * 3] = c.x + (quad[i * 2] - c.x) * 1.1;
      this.pos[i * 3 + 1] = c.y + (quad[i * 2 + 1] - c.y) * 1.1;
      this.pos[i * 3 + 2] = 0;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.h.fromArray(quadToUnit(quad));
    const u = this.mat.uniforms;
    u.uPlate.value = plate; u.uPhoto.value = photo; u.uLum.value = lum; u.uOpacity.value = opacity;
    u.uCrop.value.set(crop.x, crop.y, crop.w, crop.h);
    this.mesh.visible = true;
    this.mesh.renderOrder = order;
  }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

class PlateLayer {
  group = new THREE.Group();
  plate: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  wins: WindowMesh[] = [];
  constructor(private order: number) {
    this.mat = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, uniforms: { uMap: { value: null }, uOpacity: { value: 1 } }, vertexShader: PLATE_VS, fragmentShader: PLATE_FS });
    const g = new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0);
    this.plate = new THREE.Mesh(g, this.mat);
    this.plate.frustumCulled = false;
    this.group.add(this.plate);
  }
  hide() { this.group.visible = false; }
  win(i: number) {
    while (this.wins.length <= i) { const w = new WindowMesh(); this.wins.push(w); this.group.add(w.mesh); }
    return this.wins[i];
  }
  place(cam: Cam, plateAspect: number, aspect: number) {
    const base = aspect >= plateAspect ? { w: 1, h: plateAspect / aspect } : { w: aspect / plateAspect, h: 1 };
    const vw = base.w / cam.z, vh = base.h / cam.z;
    const cx = Math.min(1 - vw / 2, Math.max(vw / 2, cam.cx));
    const cy = Math.min(1 - vh / 2, Math.max(vh / 2, cam.cy));
    this.group.scale.set(aspect / vw, -1 / vh, 1);
    this.group.position.set((-cx * aspect) / vw, cy / vh, 0);
    return { cx, cy, vw, vh };
  }
  dispose() { this.plate.geometry.dispose(); this.mat.dispose(); for (const w of this.wins) w.dispose(); }
}

export class BackyardRenderer implements ShowRenderer {
  readonly plan: ShowPlan;
  private overlay: Overlay;
  private stage = new THREE.Scene();
  private layers = [new PlateLayer(0), new PlateLayer(100)];
  private bokehQuad: THREE.Mesh;
  private bokehMat: THREE.ShaderMaterial;
  private images = new TextureCache(10);
  private photoTex = new Map<number, THREE.Texture>();
  private videos = new Map<string, VideoFrameSource>();
  private tracks = new Map<string, LoopTracks>();
  private w = 1280; private h = 720;
  private q8 = new Array(8).fill(0);
  private tx: TransitionPass;
  private finish: FinishPass;
  /** Transition length, seconds. */
  private xf: number;

  constructor(readonly spec: ShowSpec, plan: ShowPlan, private renderer: THREE.WebGLRenderer) {
    this.plan = plan;
    this.overlay = new Overlay(spec);
    for (const l of this.layers) this.stage.add(l.group);
    this.bokehMat = new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, uniforms: { uMap: { value: null }, uOpacity: { value: 0 } }, vertexShader: PLATE_VS, fragmentShader: PLATE_FS });
    this.bokehQuad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0), this.bokehMat);
    this.bokehQuad.renderOrder = 500;
    this.bokehQuad.frustumCulled = false;
    this.stage.add(this.bokehQuad);
    this.tx = new TransitionPass(renderer, this.w, this.h);
    this.finish = new FinishPass(renderer);
    this.xf = Math.max(0.4, Math.min(4, spec.transition?.seconds ?? 1.4));
  }

  // --- loading --------------------------------------------------------------------------

  async load(onProgress?: (k: number, label: string) => void) {
    const n = this.spec.photos.length;
    let done = 0;
    const queue = this.spec.photos.map((_, i) => i);
    const worker = async () => {
      while (queue.length) {
        const i = queue.shift()!;
        try { this.photoTex.set(i, canvasTexture(await renderFixed(this.spec.photos[i], 512, this.spec.photos[i].polaroidCrop))); }
        catch (e) { console.warn('[backyard] photo failed', e); }
        onProgress?.(++done / Math.max(1, n) * 0.85, 'Placing your photos in the yard');
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    // tracks for every loop the plan uses
    const loops = new Set(this.plan.segments.map((s) => s.plate?.asset).filter((a): a is string => !!a && byId(a)?.role === 'plateLoop'));
    await Promise.all([...loops].map(async (id) => { this.tracks.set(id, await loadTracks(byId(id))); }));
    await this.ensure(0);
    onProgress?.(1, 'Ready');
  }

  private imageTex(a: PackAsset) { return this.images.ready.get(a.id) || null; }
  private loadImage(a: PackAsset) {
    return this.images.load(a.id, async () => {
      const img = new Image();
      img.decoding = 'async';
      img.src = a.src;
      await img.decode();
      const t = new THREE.Texture(img);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      t.needsUpdate = true;
      return t;
    });
  }
  private video(a: PackAsset) {
    let v = this.videos.get(a.id);
    if (!v) {
      v = new VideoFrameSource(a.src, a.width, a.height);
      this.videos.set(a.id, v);
      if (this.videos.size > 4) { const [k, old] = this.videos.entries().next().value!; old.dispose(); this.videos.delete(k); }
    }
    return v;
  }

  /** Texture for a layer, plus the clip time actually shown (videos). */
  private layerTex(L: LayerState): { tex: THREE.Texture | null; shown: number } {
    if (L.asset.kind === 'video') {
      const v = this.videos.get(L.asset.id);
      return { tex: v && v.shown >= 0 ? v.texture : null, shown: v ? v.shown : 0 };
    }
    return { tex: this.imageTex(L.asset), shown: 0 };
  }

  private async prepLayer(L: LayerState | null, exact: boolean) {
    if (!L) return;
    if (L.asset.kind === 'video') {
      const v = this.video(L.asset);
      const time = v.duration ? v.clipTime(L.time) : L.time;
      if (exact) await v.seek(time); else v.request(time);
    } else await this.loadImage(L.asset);
  }

  async ensure(t: number) {
    const f = this.frameAt(t);
    await Promise.all([this.prepFrame(f, true), this.finish.prepare(this.lookOf(f))]);
  }
  private lookOf(f: Frame) { return lookFor(this.spec, f.photo != null ? this.spec.photos[f.photo] : null); }

  private async prepFrame(f: Frame, exact: boolean) {
    const jobs: Promise<unknown>[] = [this.prepLayer(f.A, exact), this.prepLayer(f.B, exact)];
    if (f.full) {
      jobs.push(this.overlay.loadFull(f.full.index));
      if (f.full.bokeh) jobs.push(this.prepLayer({ asset: byId(f.full.bokeh), assign: [], cam: { cx: 0.5, cy: 0.5, z: 1 }, time: f.full.bokehTime }, exact));
    }
    await Promise.all(jobs);
  }

  // --- the frame evaluator --------------------------------------------------------------

  private overview(a: PackAsset, lt: number): Cam {
    return { cx: 0.5 + 0.012 * Math.sin(lt * 0.21), cy: 0.5 + 0.008 * Math.sin(lt * 0.17 + 1), z: 1.035 + 0.006 * Math.sin(lt * 0.13) };
  }
  private windowCam(a: PackAsset, w: number): Cam {
    const win = a.windows![w];
    const c = quadCentre(win.quad);
    const plateAspect = a.width / a.height, aspect = this.w / this.h;
    const baseH = aspect >= plateAspect ? plateAspect / aspect : 1;
    const z = Math.max(1.05, Math.min(3.4, (baseH * 0.62) / Math.max(0.02, win.height)));
    return { cx: c.x, cy: c.y, z };
  }
  private lerpCam(a: Cam, b: Cam, k: number): Cam {
    const lz = Math.log(a.z) + (Math.log(b.z) - Math.log(a.z)) * k;
    const z = Math.exp(lz);
    // keep the window under the same screen point while zooming (centre follows zoom progress)
    const kc = (1 / a.z - 1 / z) / Math.max(1e-6, 1 / a.z - 1 / b.z);
    const kk = Math.abs(b.z - a.z) < 1e-4 ? k : clamp01(kc);
    return { cx: a.cx + (b.cx - a.cx) * kk, cy: a.cy + (b.cy - a.cy) * kk, z };
  }

  private segState(seg: ShowSegment, lt: number): LayerState | null {
    const P = seg.plate;
    if (!P) return null;
    const a = byId(P.asset);
    if (!a) return null;
    let cam: Cam;
    if (seg.kind === 'intro') { const k = ease(lt / seg.duration); cam = { cx: 0.5, cy: 0.44 + 0.1 * k, z: 1.0 + 0.14 * k }; }
    else if (seg.kind === 'outro') { const k = ease(lt / seg.duration); cam = { cx: 0.5, cy: 0.62 - 0.22 * k, z: 1.12 - 0.08 * k }; }
    else if (seg.kind === 'wide') { const k = lt / seg.duration; cam = { cx: 0.5 + 0.02 * Math.sin(k * 2), cy: 0.5, z: 1.0 + 0.1 * ease(k) }; }
    else {
      const v = seg.visit!;
      if (P.full || !a.windows?.length) {
        // graphic shot: the soft plate drifts behind the whole graphic
        return { asset: a, assign: [], cam: { cx: 0.5 + 0.015 * Math.sin(lt * 0.15), cy: 0.5, z: 1.04 + 0.05 * ease(lt / seg.duration) }, time: lt };
      }
      const w = P.window ?? 0;
      const over = this.overview(a, lt + seg.start);
      const win = this.windowCam(a, w);
      const t1 = v.travel, t2 = t1 + v.approach, t3 = t2 + v.dwell;
      if (lt < t1) cam = over;
      else if (lt < t2) cam = this.lerpCam(over, win, ease((lt - t1) / v.approach));
      else if (lt < t3) cam = { ...win, z: win.z * (1 + 0.025 * ease((lt - t2) / v.dwell)) };
      else cam = this.lerpCam({ ...win, z: win.z * 1.025 }, over, ease((lt - t3) / v.retreat));
    }
    return { asset: a, assign: P.assign, cam, time: (P.offset || 0) + lt };
  }

  private frameAt(t: number): Frame {
    const seg = segmentAt(this.plan, t);
    const idx = this.plan.segments.indexOf(seg);
    const lt = Math.max(0, t - seg.start);
    const f: Frame = { A: this.segState(seg, lt), B: null, mixA: 1, full: null, card: null, black: 0, photo: seg.photoIndex };
    // dissolve in from the previous segment's last frame
    const prev = this.plan.segments[idx - 1];
    const dissolve = seg.kind === 'visit' ? (seg.plate?.same ? 0 : Math.min(this.xf, seg.visit!.travel)) : seg.kind === 'intro' ? 0 : this.xf;
    if (prev && dissolve > 0 && lt < dissolve) {
      f.B = this.segState(prev, prev.duration);
      f.mixA = ease(lt / dissolve);
      f.tx = seg.transitionIn || 'dolly-fade';
    }
    if (seg.kind === 'intro') {
      f.card = { kind: 'intro', opacity: envelope(lt, seg.duration, 2.2, 2.4) };
      f.black = 1 - ease(lt / 2.2);
    } else if (seg.kind === 'outro') {
      f.card = { kind: 'outro', opacity: ease((lt - 2.2) / 2.5) * (1 - ease((lt - seg.duration + 1.6) / 1.4)) };
      f.black = ease((lt - seg.duration + 1.8) / 1.8);
    } else if (seg.kind === 'visit') {
      const v = seg.visit!;
      if (seg.chapter) f.chapter = { text: seg.chapter, opacity: envelope(lt, v.travel + v.approach * 0.6, 1.0, 1.0) };
      const t2 = v.travel + v.approach;
      const dl = lt - t2;
      if (dl > 0 && dl < v.dwell) {
        const fin = Math.min(1.4, v.dwell * 0.25);
        f.full = { index: seg.photoIndex!, amount: envelope(dl, v.dwell, fin, fin), k: dl / v.dwell, bokeh: seg.plate?.bokeh, bokehTime: (seg.plate?.offset || 0) + dl, soft: !!seg.plate?.full };
      }
    }
    return f;
  }

  // --- drawing ----------------------------------------------------------------------

  private drawLayer(layer: PlateLayer, L: LayerState | null, opacity: number) {
    if (!L || opacity <= 0.001) { layer.hide(); return; }
    const { tex, shown } = this.layerTex(L);
    if (!tex) { layer.hide(); return; }
    layer.group.visible = true;
    layer.mat.uniforms.uMap.value = tex;
    layer.mat.uniforms.uOpacity.value = opacity;
    layer.place(L.cam, L.asset.width / L.asset.height, this.w / this.h);
    const ws = this.windowsOf(L, shown);
    let k = 0;
    for (const w of ws) {
      let pi = L.assign[w.id];
      // windows the plan didn't assign (new tracks, rescued prints) or whose photo failed get another photo
      if (pi == null || pi < 0 || !this.photoTex.get(pi)) pi = this.anyPhoto(w.id + 7 * ws.length);
      const photo = pi >= 0 ? this.photoTex.get(pi) : null;
      if (!photo) continue;
      const p = this.spec.photos[pi];
      layer.win(k++).set(w.quad, tex, photo, squareInside(p), w.lum, opacity, 1 + k);
    }
    for (; k < layer.wins.length; k++) layer.wins[k].mesh.visible = false;
  }

  /** A loaded print photo to stand in for window `salt` (never a graphic when prints exist). */
  private anyPhoto(salt: number): number {
    const ids = [...this.photoTex.keys()];
    if (!ids.length) return -1;
    const prints = ids.filter((i) => !isFullFrame(this.spec.photos[i]));
    const pool = prints.length ? prints : ids;
    return pool[Math.abs(salt) % pool.length];
  }

  private windowsOf(L: LayerState, shown: number): { id: number; quad: number[]; lum: number }[] {
    if (L.asset.role === 'plateLoop') {
      const tr = this.tracks.get(L.asset.id);
      if (!tr) return [];
      return tr.windows.map((w) => ({ id: w.id, quad: trackedQuad(tr, w, shown, new Array(8)), lum: w.lum }));
    }
    return (L.asset.windows || []).map((w) => ({ id: w.id, quad: w.quad, lum: w.lum }));
  }

  private paint(f: Frame) {
    const r = this.renderer;
    if (f.B && f.tx && f.mixA < 1) {
      // a real cut: render each side whole, then the Fabula transition hands one to the other
      // pictures only into the targets; the grade and the words go on after the blend
      r.setRenderTarget(this.tx.outgoing);
      this.paintScene({ A: f.B, B: null, mixA: 1, full: null, card: null, black: 0 }, false);
      r.setRenderTarget(this.tx.incoming);
      this.paintScene({ ...f, B: null, mixA: 1 }, false);
      r.setRenderTarget(null);
      this.tx.blend(f.tx, f.mixA);
      this.finish.apply(this.lookOf(f), performance.now());
      this.overlay.renderText(r);
      return;
    }
    r.setRenderTarget(null);
    this.paintScene(f, true);
  }

  private paintScene(f: Frame, final: boolean) {
    const aspect = this.w / this.h;
    // B under A for dissolves
    this.drawLayer(this.layers[0], f.B, f.B ? 1 : 0);
    this.drawLayer(this.layers[1], f.A, f.B ? f.mixA : 1);
    // bokeh backdrop behind the full-page photo
    this.bokehQuad.visible = false;
    if (f.full && f.full.bokeh) {
      const v = this.videos.get(f.full.bokeh);
      if (v && v.shown >= 0) {
        this.bokehQuad.visible = true;
        this.bokehMat.uniforms.uMap.value = v.texture;
        this.bokehMat.uniforms.uOpacity.value = f.full.amount;
        const a = byId(f.full.bokeh);
        const pa = a.width / a.height;
        const base = aspect >= pa ? { w: 1, h: pa / aspect } : { w: aspect / pa, h: 1 };
        this.bokehQuad.scale.set(aspect / base.w, -1 / base.h, 1);
        this.bokehQuad.position.set((-0.5 * aspect) / base.w, 0.5 / base.h, 0);
      }
    }
    const O = this.overlay;
    O.clear();
    if (f.full) O.drawFullPage({ index: f.full.index, amount: f.full.amount, k: f.full.k }, f.full.soft ? { backdrop: false, dim: 0.5 } : { backdrop: !f.full.bokeh, dim: f.full.bokeh ? 0.35 : undefined });
    if (f.card && f.card.opacity > 0) O.drawCard(f.card.kind, f.card.opacity);
    if (f.chapter && f.chapter.opacity > 0) O.drawChapter(f.chapter.text, f.chapter.opacity);
    if (f.black > 0) O.drawBlack(f.black);
    const r = this.renderer;
    r.setClearColor(0x040306, 1);
    r.clear();
    r.render(this.stage, O.cam);
    const auto = r.autoClear;
    r.autoClear = false;
    r.render(O.scene, O.cam);
    r.autoClear = auto;
    if (final) {
      this.finish.apply(this.lookOf(f), performance.now());
      O.renderText(r);
    }
  }

  draw(t: number) { this.paint(this.frameAt(t)); }

  // --- live ---------------------------------------------------------------------------
  //
  // The planned show plays on a loop. A tap on ANY window — featured or not — leans into
  // that print, lifts it to full page and holds it until the next tap; then the show
  // resumes where it was. Every photo is counted the first time it reaches full page.

  private live = {
    t: 0, paused: false, viewed: new Set<number>(),
    user: null as null | { base: LayerState; win: number[]; photo: number; lt: number; held: boolean },
    lastFrame: null as Frame | null,
  };

  liveStart() { this.live = { t: 0, paused: false, viewed: new Set(), user: null, lastFrame: null }; }

  liveTick(dt: number) {
    const L = this.live;
    if (L.user) {
      const U = L.user;
      const holdAt = 2.2 + 0.7;
      if (U.held && U.lt + dt > holdAt) U.lt = holdAt; else U.lt += dt;
      if (U.lt > 2.2) L.viewed.add(U.photo);
      if (U.lt >= 2.2 + 1.4 + 2.0 + 0.2 && !U.held) L.user = null;
      return;
    }
    if (L.paused) return;
    L.t += dt;
    const intro = this.plan.segments[0]?.duration || 0;
    if (L.t >= this.plan.duration) L.t = intro; // loop, skipping the opening card
    const seg = segmentAt(this.plan, L.t);
    if (seg.kind === 'visit' && seg.visit && L.t - seg.start > seg.visit.travel + seg.visit.approach + 1) L.viewed.add(seg.photoIndex!);
    // warm what's next
    void this.prepFrame(this.frameAt(Math.min(this.plan.duration - 0.01, L.t + 2.5)), false);
  }

  liveDraw() {
    const L = this.live;
    let f: Frame;
    if (L.user) {
      const U = L.user;
      const winCam = this.camForQuad(U.base.asset, U.win);
      const tIn = 2.2, tFull = 1.4, tOut = 2.0;
      let cam: Cam;
      let amount = 0;
      if (U.lt < tIn) cam = this.lerpCam(U.base.cam, winCam, ease(U.lt / tIn));
      else if (U.lt < tIn + tFull + 0.2) { cam = winCam; amount = ease((U.lt - tIn) / 1.2); }
      else { const k = (U.lt - tIn - tFull - 0.2); amount = 1 - ease(k / 1.2); cam = this.lerpCam(winCam, U.base.cam, ease(k / tOut)); }
      f = { photo: U.photo, A: { ...U.base, cam }, B: null, mixA: 1, full: amount > 0 ? { index: U.photo, amount, k: 0.5, bokeh: this.plan.segments.find((s) => s.plate?.bokeh)?.plate?.bokeh, bokehTime: U.lt } : null, card: null, black: 0 };
    } else {
      f = this.frameAt(L.t);
    }
    void this.prepFrame(f, false);
    L.lastFrame = f;
    this.paint(f);
  }

  private camForQuad(a: PackAsset, quad: number[]): Cam {
    const c = quadCentre(quad);
    const hgt = Math.max(Math.abs(quad[7] - quad[1]), Math.abs(quad[5] - quad[3]));
    const plateAspect = a.width / a.height, aspect = this.w / this.h;
    const baseH = aspect >= plateAspect ? plateAspect / aspect : 1;
    return { cx: c.x, cy: c.y, z: Math.max(1.05, Math.min(3.4, (baseH * 0.62) / Math.max(0.02, hgt))) };
  }

  /** Which window (and photo) is under a screen point. */
  private pick(ndcX: number, ndcY: number): { photo: number; quad: number[]; base: LayerState } | null {
    const f = this.live.lastFrame;
    const L = f?.A;
    if (!L || !L.assign.length) return null;
    const aspect = this.w / this.h;
    const v = this.layers[1].place(L.cam, L.asset.width / L.asset.height, aspect);
    const u = v.cx + (ndcX * aspect / 2) * v.vw / aspect;
    const y = v.cy - (ndcY * 0.5) * v.vh;
    const { shown } = this.layerTex(L);
    for (const w of this.windowsOf(L, shown)) {
      if (pointInQuad(u, y, w.quad)) {
        const photo = L.assign[w.id];
        if (photo != null && photo >= 0) return { photo, quad: w.quad.slice(), base: { ...L, time: L.asset.kind === 'video' ? shown : L.time } };
      }
    }
    return null;
  }

  liveHover(ndcX: number, ndcY: number) { return !this.live.user && !this.live.lastFrame?.full && !!this.pick(ndcX, ndcY); }

  liveTap(ndcX: number, ndcY: number) {
    const L = this.live;
    if (L.user) { L.user.held = false; if (L.user.lt < 2.2 + 1.4 + 0.2) L.user.lt = 2.2 + 1.4 + 0.2; return; }
    if (L.paused) { L.paused = false; return; }
    const hit = this.pick(ndcX, ndcY);
    if (!hit) return;
    void this.overlay.loadFull(hit.photo);
    L.user = { base: hit.base, win: hit.quad, photo: hit.photo, lt: 0, held: true };
  }

  liveKey(k: 'next' | 'prev' | 'back' | 'pause') {
    const L = this.live;
    if (k === 'pause') { L.paused = !L.paused; return; }
    if (k === 'back') { if (L.user) this.liveTap(0, 0); return; }
    if (L.user) L.user = null;
    const segs = this.plan.segments;
    const idx = segs.indexOf(segmentAt(this.plan, L.t));
    const step = k === 'next' ? 1 : -1;
    for (let j = idx + step; j >= 0 && j < segs.length; j += step) {
      if (segs[j].kind === 'visit') { L.t = segs[j].start + 0.001; return; }
    }
  }

  liveClock() { return this.live.t; }

  liveStatus() {
    const L = this.live;
    const seg = segmentAt(this.plan, L.t);
    return {
      photoIndex: L.user ? L.user.photo : seg.photoIndex ?? null,
      fullPage: !!L.lastFrame?.full && L.lastFrame.full.amount > 0.5,
      viewed: L.viewed.size, total: this.spec.photos.length, paused: L.paused,
    };
  }

  resize(w: number, h: number) {
    this.w = w; this.h = h; this.overlay.setAspect(w / h);
    const v = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.tx.setSize(Math.max(2, v.x), Math.max(2, v.y));
  }

  dispose() {
    this.tx.dispose();
    this.finish.dispose();
    for (const l of this.layers) l.dispose();
    this.bokehQuad.geometry.dispose(); this.bokehMat.dispose();
    this.images.dispose();
    for (const t of this.photoTex.values()) t.dispose();
    for (const v of this.videos.values()) v.dispose();
    this.overlay.dispose();
  }
}

/** The photo texture is already the face-aware square crop. */
function squareInside(_p: ShowPhoto) { return { x: 0, y: 0, w: 1, h: 1 }; }

export const BACKYARD_ASSET_COUNT = BACKYARD.assets.length;
