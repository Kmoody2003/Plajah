// fxPreview.ts — a single shared GL engine that renders live, animated thumbnail
// previews of the real FX library, so the FX page shows what an effect DOES
// instead of a generic gradient chip.
//
// One WebGL2 context runs the same FxRenderer the timeline uses, over an animated
// reference scene (fxReference.referenceSource), and presents each effect into a
// per-tile 2D canvas via drawImage — the same "one context → many canvases"
// pattern the shader gallery uses, so hundreds of tiles never hit the browser's
// ~16 live-context cap. Only on-screen tiles (IntersectionObserver) render, at a
// ~30fps budget, and the loop sleeps when the tab is hidden or nothing is visible.
import { FxRenderer } from './fxRenderer';
import { AudioTexture } from '../core/audioTexture';
import { createGL, createProgram, createFullscreenQuad, makeSourceTexture, uploadElement, type GL } from '../core/glUtil';
import { referenceSource } from './fxReference';

const PW = 320, PH = 180; // internal render size; tiles downscale from this

const VS = `#version 300 es
layout(location=0) in vec2 aPos; out vec2 vUv; void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;
const BLIT_FS = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uTex; void main(){ o = texture(uTex, vUv); }`;

export interface FxPreviewTileRef { canvas: HTMLCanvasElement; effectId: string; params: number[]; visible: boolean }

class FxPreviewEngine {
  private gl: GL | null = null;
  private glCanvas!: HTMLCanvasElement;
  private renderer!: FxRenderer;
  private audio!: AudioTexture;
  private srcTex!: WebGLTexture;
  private srcCanvas!: HTMLCanvasElement;
  private blit!: WebGLProgram; private quad!: WebGLVertexArrayObject; private uTex!: WebGLUniformLocation | null;
  private tiles = new Set<FxPreviewTileRef>();
  private raf = 0; private t0 = 0; private lastFrame = 0;
  private freq = new Uint8Array(256); private wave = new Uint8Array(256);
  private failed = false;

  private init(): boolean {
    if (this.gl) return true;
    if (this.failed || typeof document === 'undefined') return false;
    try {
      this.glCanvas = document.createElement('canvas'); this.glCanvas.width = PW; this.glCanvas.height = PH;
      const gl = createGL(this.glCanvas); if (!gl) { this.failed = true; return false; }
      this.gl = gl;
      this.renderer = new FxRenderer(gl);
      this.audio = new AudioTexture(gl);
      this.srcTex = makeSourceTexture(gl);
      this.srcCanvas = document.createElement('canvas');
      this.blit = createProgram(gl, VS, BLIT_FS); this.quad = createFullscreenQuad(gl);
      this.uTex = gl.getUniformLocation(this.blit, 'uTex');
      return true;
    } catch { this.failed = true; return false; }
  }

  available(): boolean { return !this.failed && (!!this.gl || this.init()); }

  register(tile: FxPreviewTileRef) { this.tiles.add(tile); this.ensureLoop(); }
  unregister(tile: FxPreviewTileRef) { this.tiles.delete(tile); if (!this.tiles.size) this.stop(); }
  setVisible(tile: FxPreviewTileRef, v: boolean) { tile.visible = v; if (v) this.ensureLoop(); }

  private ensureLoop() { if (!this.raf && this.init()) { if (!this.t0) this.t0 = performance.now(); this.raf = requestAnimationFrame(this.tick); } }
  private stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    if (typeof document !== 'undefined' && document.hidden) return;
    if (now - this.lastFrame < 33) return; // ~30fps
    this.lastFrame = now;
    const gl = this.gl; if (!gl) return;
    const time = (now - this.t0) / 1000;

    const visible = [...this.tiles].filter(t => t.visible && t.canvas.isConnected);
    if (!visible.length) return; // nothing on screen — idle (RAF still armed, but no GPU work)

    // One animated source frame + synthetic audio, shared by every tile this frame.
    // referenceSource returns a NEW canvas unless the one passed already matches PW×PH,
    // so capture the return — otherwise the first frame uploads a blank canvas forever.
    this.srcCanvas = referenceSource(PW, PH, Math.floor(time * 24), this.srcCanvas);
    uploadElement(gl, this.srcTex, this.srcCanvas);
    for (let i = 0; i < 256; i++) {
      this.freq[i] = Math.max(0, Math.min(255, 150 * Math.exp(-i / 42) * (0.6 + 0.4 * Math.sin(time * 2.2 - i * 0.05)) + 26));
      this.wave[i] = Math.max(0, Math.min(255, 128 + 62 * Math.sin(time * 6 + i * 0.19)));
    }
    try { this.audio.updateFromArrays(this.freq, this.wave, 48000); } catch { /* audio optional */ }

    for (const tile of visible) {
      try {
        const out = this.renderer.render('fxprev:' + tile.effectId, tile.effectId, tile.params, this.srcTex, PW, PH, { time, audio: this.audio });
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, PW, PH); gl.disable(gl.BLEND);
        gl.useProgram(this.blit); gl.bindVertexArray(this.quad);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, out); gl.uniform1i(this.uTex, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
        const ctx = tile.canvas.getContext('2d');
        if (ctx) { ctx.clearRect(0, 0, tile.canvas.width, tile.canvas.height); ctx.drawImage(this.glCanvas, 0, 0, tile.canvas.width, tile.canvas.height); }
      } catch { /* one bad effect must not kill the loop */ }
    }
  };
}

export const fxPreview = new FxPreviewEngine();
