// typoScriptureBackground — Chora's TYPO engine (instanced 3D kinetic type)
// rendered headless as BACKGROUND ART for a scripture layout, spelling the
// verse on screen. The verse itself is always drawn on top, on a legibility
// plate, by the layout — this is atmosphere, never the thing being read.
//
// Mirrors ChoraTypoVisualizer's frame loop (makeVol → def.text → tick →
// def.update → director → commit → render) without React, at a capped size
// so a 4K output doesn't pay for a 4K WebGL background.

import * as THREE from 'three';
import { loadAtlas, makeVol, disposeVol, lineStreams, clamp, TypoDirector, type Vol, type LyricState } from '../../components/chora/typo/typoEngine';
import { TYPO_VOLUMES } from '../../components/chora/typo/typoVolumes';
import { TypoAudioAnalyzer } from '../../components/chora/typo/typoAudio';

export class TypoScriptureBackground {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private atlas: THREE.CanvasTexture | null = null;
  private vol: Vol | null = null;
  private audio = new TypoAudioAnalyzer();
  private director = new TypoDirector();
  private ly: LyricState = { idx: 0, word: -1, words: [] };
  private T = 0;
  private lastT = 0;
  private dead = false;
  ok = false;

  constructor(w: number, h: number, private volumeKey: string, private text: string) {
    const scale = Math.min(1, 1280 / Math.max(w, h));
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.max(2, Math.round(w * scale));
    this.canvas.height = Math.max(2, Math.round(h * scale));
    void this.init();
  }

  private async init() {
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(this.canvas.width, this.canvas.height, false);
      this.atlas = await loadAtlas();
      if (this.dead) return;
      const def = TYPO_VOLUMES.find(d => d.key === this.volumeKey) || TYPO_VOLUMES[0];
      this.vol = makeVol(def, this.atlas);
      this.setText(this.text, true);
      this.ok = true;
    } catch (e) {
      console.warn('[scripture] TYPO background unavailable', e);
      this.ok = false;
    }
  }

  setText(text: string, first = false) {
    this.text = text;
    if (!this.vol) return;
    const st = lineStreams(text);
    this.ly.words = st.words;
    this.vol.def.text(this.vol, st, first);
  }

  /** Render one frame; returns the canvas (or null until the atlas is ready). */
  frame(now = performance.now()): HTMLCanvasElement | null {
    const v = this.vol, r = this.renderer;
    if (!v || !r || !this.ok) return null;
    const dt = this.lastT ? Math.min(0.05, (now - this.lastT) / 1000) : 1 / 60;
    this.lastT = now; this.T += dt;
    // Walk the highlight through the verse slowly so the type breathes even
    // in silence; the music (Ambo master) drives the motion when present.
    const n = Math.max(1, this.ly.words.length);
    this.ly.word = Math.floor(this.T / 0.85) % n;
    const an = (typeof window !== 'undefined' ? (window as any).getAmboMasterAnalyser?.() : null) ?? null;
    const A = this.audio.sample(an, true, this.T, dt);
    v.layers.forEach(L => L.tick(dt, this.ly.word));
    v.def.update(v, this.T, dt, A, this.ly);
    this.director.apply(v, A, dt, this.T);
    v.layers.forEach(L => L.commit());
    const aspect = this.canvas.width / this.canvas.height;
    v.cam.aspect = aspect;
    v.cam.fov = this.director.fov * Math.pow(clamp(1.33 / aspect, 1, 1.8), 0.75);
    v.cam.updateProjectionMatrix();
    r.setClearColor(v.bg, 1);
    r.render(v.scene, v.cam);
    return this.canvas;
  }

  dispose() {
    this.dead = true;
    if (this.vol) disposeVol(this.vol, this.atlas);
    this.vol = null;
    try { this.renderer?.dispose(); this.renderer?.forceContextLoss(); } catch { /* */ }
    this.renderer = null;
  }
}

/** Volumes that read well as a calm backdrop behind a verse. */
export const SCRIPTURE_TYPO_VOLUMES = ['SPHERE', 'DNA_HELIX', 'SUNBURST', 'OCEAN_WAVES', 'TOPOGRAPHY', 'CUBIC_GLASS'];
