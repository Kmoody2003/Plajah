// Themed Shows — renderer contract + the shared overlay (full page, title cards, fades).

import * as THREE from 'three';
import type { ShowPlan, ShowSpec } from '../types';
import { shownCaption } from '../fileNames';
import { loadBugTexture } from '../brandBug';
import { FlatQuad, PhotoQuad, TextureCache, canvasTexture, captionCanvas, chapterCanvas, ease, fullPhotoTexture, isFullFrame, kenBurns, titleCardCanvas } from '../common';

export interface ShowRenderer {
  readonly spec: ShowSpec;
  readonly plan: ShowPlan;
  load(onProgress?: (k: number, label: string) => void): Promise<void>;
  /** Make sure every texture needed at show time t is resident (await before an offline frame). */
  ensure(t: number): Promise<void>;
  /** Deterministic frame at show time t (render / Fabula). */
  draw(t: number): void;
  // Live (interactive) mode
  liveStart(): void;
  liveTick(dt: number): void;
  liveDraw(): void;
  liveTap(ndcX: number, ndcY: number): void;
  liveKey(k: 'next' | 'prev' | 'back' | 'pause'): void;
  liveHover(ndcX: number, ndcY: number): boolean;
  /** Seconds of show time live mode has played (for music + progress). */
  liveClock(): number;
  liveStatus(): { photoIndex: number | null; fullPage: boolean; viewed: number; total: number; paused: boolean };
  resize(w: number, h: number): void;
  dispose(): void;
}

export interface FullPageState { index: number; amount: number; k: number; zoomFrom?: number }

/** The overlay pass both themes draw on top: full-page photo, captions, cards, fades. */
export class Overlay {
  /** The picture: full-page photo, dim, backdrops (graded and lensed). */
  scene = new THREE.Scene();
  /** The words and fades: captions, title cards, chapter lines, fade to black (never graded). */
  textScene = new THREE.Scene();
  cam = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, -10, 10);
  dim = new FlatQuad(0x05040a);
  backdrop = new PhotoQuad();
  photo = new PhotoQuad();
  caption = new FlatQuad();
  card = new FlatQuad();
  black = new FlatQuad(0x000000);
  chapter = new FlatQuad();
  /** plajah.com bug (Free / Spark renders and shares). */
  bug = new FlatQuad();
  private bugTex: THREE.Texture | null = null;
  private chapters = new Map<string, THREE.Texture>();
  aspect = 16 / 9;
  full: TextureCache = new TextureCache(6);
  private captions = new Map<number, THREE.Texture>();
  private blurred = new Map<THREE.Texture, THREE.Texture>();
  private cards: Record<'intro' | 'outro', THREE.Texture | null> = { intro: null, outro: null };

  constructor(private spec: ShowSpec) {
    for (const q of [this.dim, this.backdrop, this.photo]) this.scene.add(q.mesh);
    for (const q of [this.caption, this.card, this.chapter, this.black, this.bug]) this.textScene.add(q.mesh);
    if (spec.brandBug) void loadBugTexture().then((t) => { this.bugTex = t; });
  }

  setAspect(a: number) {
    this.aspect = a;
    this.cam.left = -a / 2; this.cam.right = a / 2; this.cam.top = 0.5; this.cam.bottom = -0.5;
    this.cam.updateProjectionMatrix();
  }

  cardTex(kind: 'intro' | 'outro') {
    if (!this.cards[kind]) this.cards[kind] = canvasTexture(titleCardCanvas(kind, this.spec.dedication));
    return this.cards[kind]!;
  }

  fullKey(i: number) { return `full:${this.spec.photos[i].id}`; }
  loadFull(i: number) {
    const p = this.spec.photos[i];
    if (!p) return Promise.resolve(null);
    return this.full.load(this.fullKey(i), () => fullPhotoTexture(p));
  }
  fullTex(i: number) { return this.full.ready.get(this.fullKey(i)) || null; }

  /** A small pre-blurred copy for backdrops — baked once instead of a per-pixel blur every frame. */
  blurTex(src: THREE.Texture): THREE.Texture {
    let t = this.blurred.get(src);
    if (!t) {
      const img = src.image as CanvasImageSource & { width: number; height: number };
      const w = 320, h = Math.max(2, Math.round((320 * img.height) / img.width));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d')!;
      g.filter = 'blur(9px)';
      g.drawImage(img, -12, -12, w + 24, h + 24);
      t = canvasTexture(c);
      this.blurred.set(src, t);
      if (this.blurred.size > 12) { const [k, v] = this.blurred.entries().next().value!; v.dispose(); this.blurred.delete(k); }
    }
    return t;
  }

  captionTex(i: number) {
    const p = this.spec.photos[i];
    const text = p ? shownCaption(p) : '';
    if (!text) return null;
    let t = this.captions.get(i);
    if (!t) { t = canvasTexture(captionCanvas(text)); this.captions.set(i, t); }
    return t;
  }

  /** Reset everything to hidden (call at the start of each frame). */
  clear() {
    for (const q of [this.dim, this.caption, this.card, this.black, this.chapter]) q.mesh.visible = false;
    this.backdrop.mesh.visible = false;
    this.photo.mesh.visible = false;
  }

  /** Lantern-style full page: dim + soft blurred backdrop + the whole photo, framed. */
  drawFullPage(f: FullPageState, opts: { backdrop?: boolean; dim?: number } = {}) {
    const tex = this.fullTex(f.index);
    const p = this.spec.photos[f.index];
    if (!tex || !p || f.amount <= 0.001) return;
    const a = this.aspect;
    this.dim.set(null, (opts.dim ?? 0.86) * f.amount, { x: 0, y: 0, w: 1, h: 1 }, a, 10);
    if (opts.backdrop !== false) this.backdrop.apply({
      tex: this.blurTex(tex), opacity: 0.45 * f.amount, zoom: 1.08, pan: { x: 0, y: 0 }, focus: p.focus, par: { x: 0, y: 0 }, depth: 0,
      rect: { x: 0, y: 0, w: 1, h: 1 }, fit: 'cover', vignette: 0.9, blur: 0, z: 11,
    }, a);
    const kb = kenBurns(p, f.k);
    const grow = 0.9 + 0.1 * ease(f.amount); // lifts off the polaroid into the frame
    const margin = isFullFrame(p) ? 0.035 : 0.06;
    const capH = this.captionTex(f.index) ? 0.07 : 0;
    const fs = Math.max(0.5, Math.min(1, p.fullScale ?? 1)); // the owner's full-page size
    const bw = (1 - (2 * margin) / a) * fs, bh = (1 - 2 * margin - capH) * fs;
    const box = { x: (1 - bw) / 2, y: margin + (1 - 2 * margin - capH - bh) / 2, w: bw, h: bh };
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const rect = { x: cx - (box.w * grow) / 2, y: cy - (box.h * grow) / 2, w: box.w * grow, h: box.h * grow };
    this.photo.apply({
      tex, opacity: f.amount, zoom: kb.zoom * 1.0, pan: kb.pan, focus: p.focus, par: { x: 0, y: 0 }, depth: 0,
      rect, fit: 'contain', vignette: 0.12, blur: 0, z: 12,
    }, a);
    const ct = this.captionTex(f.index);
    if (ct) this.caption.set(ct, f.amount * ease((f.amount - 0.5) * 2), { x: 0.1, y: 1 - margin - capH + 0.01, w: 0.8, h: capH }, a, 13);
  }

  drawCard(kind: 'intro' | 'outro', opacity: number) {
    this.card.set(this.cardTex(kind), opacity, { x: 0, y: 0, w: 1, h: 1 }, this.aspect, 20);
  }

  drawChapter(text: string, opacity: number) {
    let t = this.chapters.get(text);
    if (!t) { t = canvasTexture(chapterCanvas(text)); this.chapters.set(text, t); }
    const w = 0.42, h = w * (140 / 1400) * this.aspect;
    this.chapter.set(t, opacity, { x: 0.05, y: 0.86 - h, w, h }, this.aspect, 18);
  }

  /** Draw the text layer over whatever is on the canvas (after the finishing pass). */
  /** The bug must be ready before an exact (render) frame. */
  async prepareBug() { if (this.spec.brandBug) this.bugTex = await loadBugTexture(); }

  renderText(r: THREE.WebGLRenderer) {
    // the bug sits above everything, small, lower-right (3:1 artwork, ~12% of the frame width)
    if (this.spec.brandBug && this.bugTex) {
      const w = 0.12, h = (w * this.aspect) / 3; // fractions of frame width / height
      this.bug.set(this.bugTex, 0.9, { x: 1 - w - 0.022, y: 1 - h - 0.035, w, h }, this.aspect, 40);
    } else this.bug.mesh.visible = false;
    const auto = r.autoClear;
    r.autoClear = false;
    r.clearDepth();
    r.render(this.textScene, this.cam);
    r.autoClear = auto;
  }

  drawBlack(opacity: number) { this.black.set(null, opacity, { x: 0, y: 0, w: 1, h: 1 }, this.aspect, 30); }

  dispose() {
    this.full.dispose();
    for (const t of this.captions.values()) t.dispose();
    for (const t of this.chapters.values()) t.dispose();
    for (const t of this.blurred.values()) t.dispose();
    this.cards.intro?.dispose(); this.cards.outro?.dispose();
    for (const q of [this.dim, this.backdrop, this.photo, this.caption, this.card, this.black, this.chapter, this.bug]) q.dispose();
  }
}
