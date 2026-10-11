// raster/gl/glBackend — WebGL2 implementation of the compositor primitives + the public
// GPU compositor (GlCompositor) the Image device UI renders through.
//
// Design:
//  • Surfaces are RGBA16F FBO textures (EXT_color_buffer_float) — RGBA8 fallback — of the
//    current view size, pooled. Every op is one full-screen pass; in-place ops render to a
//    scratch surface and SWAP texture handles (no copies).
//  • Layer bitmaps upload as premultiplied RGBA8 textures in ≤4096² tiles with a 1-px gutter
//    (seamless bilinear across tiles) and full mip chains (trilinear minification = the
//    zoom preview). Edge anti-aliasing reproduces the CPU path's "transparent outside".
//  • Ops without a shader (median, surface blur, Kuwahara, NLM, halftone, posterize edges,
//    dust & scratches, layer-style stroke) round-trip through the CPU reference — correct,
//    just slower; listed in RASTER_ENGINE.md.
//  • Complex colour adjustments are baked to a 64³ 3D LUT from the CPU function, so GPU and
//    CPU share one definition (error < 4/255 worst case, < 0.25/255 mean; tested).

import type { Backend, CompositeView, CompositeOp } from '../compositeCore';
import { compositeDocument, stackApron } from '../compositeCore';
import type { Adjustment, Affine, BlendMode, FillContent, Filter, RasterDocument, RGB } from '../model';
import { affineMul } from '../model';
import { BLEND_MODE_INDEX } from '../blend';
import { compileAdjustment, bakeLut3d, cubeFor } from '../adjust';
import { applyFilter } from '../filters';
import { gradientLut, fillGradientEndpoints } from '../gradient';
import { srgbToLinear, type Bitmap8, type Mask8, type RasterF, type Rect } from '../buffer';
import type { AssetSource } from '../cpuBackend';
import { CpuBackend } from '../cpuBackend';
import { VS_FULL, VS_QUAD, FS_COMPOSITE, FS_BITMAP, FS_COPY, FS_LERP, FS_ADJUST, FS_BLUR, FS_FILTER, FS_FILL, FS_PRESENT } from './shaders';

export interface GlSurface { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number }
type Prog = { p: WebGLProgram; u: Map<string, WebGLUniformLocation | null> };

const TILE = 4096;
interface TexTile { tex: WebGLTexture; rect: Rect /* coverage incl. gutter */; inner: Rect }
interface TiledTex { w: number; h: number; tiles: TexTile[]; mask: boolean; source: Bitmap8 | Mask8; bytes: number }

export class GlContext {
  gl: WebGL2RenderingContext; float: boolean; maxTex: number;
  private progs = new Map<string, Prog>(); private vbo: WebGLBuffer; private qbo: WebGLBuffer;
  constructor(public canvas: HTMLCanvasElement | OffscreenCanvas) {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: true }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('WebGL2 is unavailable');
    this.gl = gl; this.float = !!gl.getExtension('EXT_color_buffer_float'); gl.getExtension('OES_texture_float_linear');
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.vbo = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.qbo = gl.createBuffer()!;
  }
  prog(name: string, vs: string, fs: string): Prog {
    let p = this.progs.get(name); if (p) return p;
    const gl = this.gl, sh = (t: number, src: string) => { const s = gl.createShader(t)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`${name}: ${gl.getShaderInfoLog(s)}`); return s; };
    const pr = gl.createProgram()!; gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(pr, 0, 'aPos'); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(`${name}: ${gl.getProgramInfoLog(pr)}`);
    p = { p: pr, u: new Map() }; this.progs.set(name, p); return p;
  }
  use(p: Prog) { this.gl.useProgram(p.p); }
  u(p: Prog, n: string) { if (!p.u.has(n)) p.u.set(n, this.gl.getUniformLocation(p.p, n)); return p.u.get(n)!; }
  fullscreen() { const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLES, 0, 3); }
  quad(x0: number, y0: number, x1: number, y1: number) {
    const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, this.qbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([x0, y0, x1, y0, x0, y1, x0, y1, x1, y0, x1, y1]), gl.STREAM_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  bindTex(unit: number, tex: WebGLTexture | null, target: number = this.gl.TEXTURE_2D) { const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(target, tex); }
}

/** GPU texture cache for document assets (bitmaps, masks, patterns, LUTs). */
export class GlAssetCache {
  private tex = new Map<string, TiledTex>(); bytes = 0;
  constructor(private ctx: GlContext, public source: AssetSource) {}
  get(key: string, mask: boolean): TiledTex | null {
    const src = mask ? this.source.mask(key) : this.source.bitmap(key); if (!src) return null;
    const hit = this.tex.get((mask ? 'm:' : 'b:') + key);
    if (hit && hit.source === src) return hit;
    if (hit) this.drop((mask ? 'm:' : 'b:') + key);
    const t = this.upload(src, mask); this.tex.set((mask ? 'm:' : 'b:') + key, t); return t;
  }
  /** Re-upload a dirty rect after painting (texSubImage + mip regen on touched tiles). */
  invalidate(key: string, dirty?: Rect, mask = false) {
    const k = (mask ? 'm:' : 'b:') + key, t = this.tex.get(k); if (!t) return;
    const src = mask ? this.source.mask(key) : this.source.bitmap(key); if (!src || src !== t.source || !dirty) { this.drop(k); return; }
    const gl = this.ctx.gl;
    for (const tile of t.tiles) {
      const r = intersect(tile.rect, dirty); if (!r) continue;
      gl.bindTexture(gl.TEXTURE_2D, tile.tex);
      const data = extract(src, r, mask);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, r.x - tile.rect.x, r.y - tile.rect.y, r.width, r.height, mask ? gl.RED : gl.RGBA, gl.UNSIGNED_BYTE, data);
      gl.generateMipmap(gl.TEXTURE_2D);
    }
  }
  drop(k: string) { const t = this.tex.get(k); if (!t) return; for (const x of t.tiles) this.ctx.gl.deleteTexture(x.tex); this.bytes -= t.bytes; this.tex.delete(k); }
  clear() { for (const k of [...this.tex.keys()]) this.drop(k); }
  private upload(src: Bitmap8 | Mask8, mask: boolean): TiledTex {
    const gl = this.ctx.gl, T = Math.min(TILE, this.ctx.maxTex) - 2, tiles: TexTile[] = []; let bytes = 0;
    for (let y = 0; y < src.height; y += T) for (let x = 0; x < src.width; x += T) {
      const inner = { x, y, width: Math.min(T, src.width - x), height: Math.min(T, src.height - y) };
      const rect = { x: Math.max(0, x - 1), y: Math.max(0, y - 1), width: 0, height: 0 };
      rect.width = Math.min(src.width, x + inner.width + 1) - rect.x; rect.height = Math.min(src.height, y + inner.height + 1) - rect.y;
      const tex = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, mask ? gl.R8 : gl.RGBA8, rect.width, rect.height, 0, mask ? gl.RED : gl.RGBA, gl.UNSIGNED_BYTE, extract(src, rect, mask));
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      bytes += rect.width * rect.height * (mask ? 1 : 4) * 4 / 3;
      tiles.push({ tex, rect, inner });
    }
    this.bytes += bytes;
    return { w: src.width, h: src.height, tiles, mask, source: src, bytes };
  }
}
function intersect(a: Rect, b: Rect): Rect | null { const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y), r = Math.min(a.x + a.width, b.x + b.width), t = Math.min(a.y + a.height, b.y + b.height); return r > x && t > y ? { x, y, width: r - x, height: t - y } : null; }
/** Copy a rect, premultiplying RGBA (texture filtering must see premultiplied data). */
function extract(src: Bitmap8 | Mask8, r: Rect, mask: boolean): Uint8Array {
  const ch = mask ? 1 : 4, out = new Uint8Array(r.width * r.height * ch), s = src.data;
  for (let y = 0; y < r.height; y++) {
    const so = ((r.y + y) * src.width + r.x) * ch, oo = y * r.width * ch;
    if (mask) { out.set((s as Uint8Array).subarray(so, so + r.width), oo); continue; }
    for (let x = 0; x < r.width * 4; x += 4) { const a = s[so + x + 3]; out[oo + x] = (s[so + x] * a + 127) / 255; out[oo + x + 1] = (s[so + x + 1] * a + 127) / 255; out[oo + x + 2] = (s[so + x + 2] * a + 127) / 255; out[oo + x + 3] = a; }
  }
  return out;
}

export class GlBackend implements Backend<GlSurface> {
  view!: CompositeView; doc!: RasterDocument; linear = false;
  private pool: GlSurface[] = []; private live = 0; peakSurfaces = 0;
  private lutTex = new Map<string, { tex: WebGLTexture; n: number; three: boolean }>();
  cpuFallbacks = 0;
  constructor(public ctx: GlContext, public assets: GlAssetCache, private bitDepth: 8 | 16 = 16) {}
  get gl() { return this.ctx.gl; }
  begin(view: CompositeView, doc: RasterDocument) {
    if (this.view && (this.view.width !== view.width || this.view.height !== view.height)) this.flushPool();
    this.view = view; this.doc = doc; this.linear = doc.blendSpace === 'linear'; this.bitDepth = doc.bitDepth;
  }
  end() {}
  flushPool() { for (const s of this.pool) { this.gl.deleteTexture(s.tex); this.gl.deleteFramebuffer(s.fbo); } this.pool = []; }
  private newSurface(): GlSurface {
    const gl = this.gl, w = this.view.width, h = this.view.height, tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const hi = this.ctx.float && this.bitDepth === 16;
    gl.texStorage2D(gl.TEXTURE_2D, 1, hi ? gl.RGBA16F : gl.RGBA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer()!; gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo, w, h };
  }
  alloc(): GlSurface { const s = this.pool.pop() || this.newSurface(); this.live++; this.peakSurfaces = Math.max(this.peakSurfaces, this.live); this.clear(s); return s; }
  release(s: GlSurface) { this.live--; if (s.w === this.view.width && s.h === this.view.height) this.pool.push(s); else { this.gl.deleteTexture(s.tex); this.gl.deleteFramebuffer(s.fbo); } }
  /** Bind the render target and unbind every sampler unit: a stale binding of the target's
   *  own texture on any declared sampler is a WebGL feedback loop and silently drops the draw. */
  private target(s: GlSurface) {
    const gl = this.gl; for (let u = 0; u < 4; u++) { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, null); gl.bindTexture(gl.TEXTURE_3D, null); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, s.fbo); gl.viewport(0, 0, s.w, s.h); gl.disable(gl.BLEND);
  }
  private swap(a: GlSurface, b: GlSurface) { const t = a.tex, f = a.fbo; a.tex = b.tex; a.fbo = b.fbo; b.tex = t; b.fbo = f; }
  clear(s: GlSurface, c?: [number, number, number, number]) { const gl = this.gl; this.target(s); if (c) gl.clearColor(c[0] * c[3], c[1] * c[3], c[2] * c[3], c[3]); else gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
  private copyPass(dst: GlSurface, src: GlSurface | null, mode: number, set?: (p: Prog) => void) {
    const p = this.ctx.prog('copy', VS_FULL, FS_COPY); this.target(dst); this.ctx.use(p);
    this.ctx.bindTex(0, src ? src.tex : null); this.gl.uniform1i(this.ctx.u(p, 'uSrc'), 0); this.gl.uniform1i(this.ctx.u(p, 'uMode'), mode);
    this.gl.uniform1i(this.ctx.u(p, 'uMask'), 1); set?.(p); this.ctx.fullscreen();
  }
  copy(dst: GlSurface, src: GlSurface) { this.copyPass(dst, src, 0); }

  drawBitmap(dst: GlSurface, key: string, m: Affine, kind: 'rgba' | 'mask', outside = 0): boolean {
    const t = this.assets.get(key, kind === 'mask'); if (!t) return false;
    const gl = this.gl, v = this.view;
    if (kind === 'mask') { this.target(dst); gl.clearColor(outside, outside, outside, outside); gl.clear(gl.COLOR_BUFFER_BIT); }
    const o2: Affine = affineMul([v.scale, 0, 0, v.scale, -v.x * v.scale, -v.y * v.scale], m);
    const p = this.ctx.prog('bitmap', VS_QUAD, FS_BITMAP); this.target(dst); this.ctx.use(p);
    gl.uniformMatrix3fv(this.ctx.u(p, 'uM'), false, [o2[0], o2[1], 0, o2[2], o2[3], 0, o2[4], o2[5], 1]);
    gl.uniform2f(this.ctx.u(p, 'uOut'), v.width, v.height);
    gl.uniform1i(this.ctx.u(p, 'uLinear'), this.linear && kind === 'rgba' ? 1 : 0); gl.uniform1i(this.ctx.u(p, 'uMaskKind'), kind === 'mask' ? 1 : 0);
    gl.uniform1i(this.ctx.u(p, 'uTex'), 0);
    const W = t.w, H = t.h;
    gl.uniform4f(this.ctx.u(p, 'uEdge'), kind === 'mask' ? -1e9 : 0, kind === 'mask' ? -1e9 : 0, kind === 'mask' ? 1e9 : W, kind === 'mask' ? 1e9 : H);
    for (const tile of t.tiles) {
      this.ctx.bindTex(0, tile.tex);
      gl.uniform4f(this.ctx.u(p, 'uRect'), tile.rect.x, tile.rect.y, tile.rect.x + tile.rect.width, tile.rect.y + tile.rect.height);
      const i = tile.inner, x0 = i.x === 0 ? -1 : i.x, y0 = i.y === 0 ? -1 : i.y, x1 = i.x + i.width >= W ? W + 1 : i.x + i.width, y1 = i.y + i.height >= H ? H + 1 : i.y + i.height;
      if (kind === 'mask') this.ctx.quad(i.x, i.y, i.x + i.width, i.y + i.height); else this.ctx.quad(x0, y0, x1, y1);
    }
    return true;
  }

  private lut1(key: string, data: Float32Array, n: number): WebGLTexture {
    let e = this.lutTex.get(key); if (e) return e.tex;
    const gl = this.gl, tex = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, n, 1, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    e = { tex, n, three: false }; this.lutTex.set(key, e); if (this.lutTex.size > 64) this.trimLuts(); return tex;
  }
  private lut3(key: string, data: Float32Array, n: number): WebGLTexture {
    let e = this.lutTex.get(key); if (e) return e.tex;
    const gl = this.gl, tex = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, n, n, n, 0, gl.RGBA, gl.FLOAT, data);
    for (const pn of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_3D, pn, gl.LINEAR);
    for (const pn of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, pn, gl.CLAMP_TO_EDGE);
    e = { tex, n, three: true }; this.lutTex.set(key, e); if (this.lutTex.size > 64) this.trimLuts(); return tex;
  }
  private trimLuts() { const [k, v] = this.lutTex.entries().next().value!; this.gl.deleteTexture(v.tex); this.lutTex.delete(k); }

  fill(dst: GlSurface, fill: FillContent) {
    const gl = this.gl, v = this.view;
    if (fill.type === 'solid') { const c = fill.color.map(x => this.linear ? srgbToLinear(x / 255) : x / 255); this.clear(dst, [c[0], c[1], c[2], 1]); return; }
    const p = this.ctx.prog('fill', VS_FULL, FS_FILL); this.target(dst); this.ctx.use(p);
    gl.uniform1i(this.ctx.u(p, 'uLinear'), this.linear ? 1 : 0); gl.uniform1i(this.ctx.u(p, 'uLut'), 0); gl.uniform1i(this.ctx.u(p, 'uPat'), 1);
    gl.uniform1f(this.ctx.u(p, 'uScale'), v.scale); gl.uniform2f(this.ctx.u(p, 'uView'), v.x, v.y); gl.uniform2f(this.ctx.u(p, 'uOrigin'), v.x * v.scale, v.y * v.scale);
    if (fill.type === 'gradient') {
      const ep = fillGradientEndpoints(this.doc.width, this.doc.height, fill.shape, fill.angle, fill.scale, fill.offsetX, fill.offsetY), s = v.scale;
      this.ctx.bindTex(0, this.lut1('grad:' + JSON.stringify([fill.gradient, fill.reverse]), gradientLut(fill.gradient, 4096, fill.reverse), 4096));
      gl.uniform1i(this.ctx.u(p, 'uPattern'), 0); gl.uniform1i(this.ctx.u(p, 'uShape'), ['linear', 'radial', 'angle', 'reflected', 'diamond'].indexOf(fill.shape));
      gl.uniform1i(this.ctx.u(p, 'uDither'), fill.dither ? 1 : 0); gl.uniform4f(this.ctx.u(p, 'uEnds'), ep.x0 * s, ep.y0 * s, ep.x1 * s, ep.y1 * s);
    } else {
      const t = this.assets.get(fill.assetId, false); if (!t) { this.clear(dst); return; }
      this.ctx.bindTex(1, t.tiles[0].tex); gl.uniform1i(this.ctx.u(p, 'uPattern'), 1); gl.uniform2f(this.ctx.u(p, 'uPatSize'), t.tiles[0].rect.width, t.tiles[0].rect.height);
      gl.uniform4f(this.ctx.u(p, 'uPatXf'), fill.scale || 1, (fill.angle || 0) * Math.PI / 180, fill.offsetX || 0, fill.offsetY || 0);
    }
    this.ctx.fullscreen();
  }
  uploadCoverage(dst: GlSurface, cov: Float32Array) {
    const gl = this.gl, tex = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, this.view.width, this.view.height, 0, gl.RED, gl.FLOAT, cov);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.copyPass(dst, { tex } as GlSurface, 7); gl.deleteTexture(tex);
  }
  multiply(dst: GlSurface, mask: GlSurface, density: number, invert: boolean) {
    const t = this.alloc();
    this.copyPass(t, dst, 6, p => { this.ctx.bindTex(1, mask.tex); this.gl.uniform1f(this.ctx.u(p, 'uDensity'), density); this.gl.uniform1i(this.ctx.u(p, 'uInvert'), invert ? 1 : 0); });
    this.swap(dst, t); this.release(t);
  }
  composite(dst: GlSurface, src: GlSurface, mode: BlendMode, opacity: number, mask: GlSurface | null, op: CompositeOp) {
    const gl = this.gl, t = this.alloc(), p = this.ctx.prog('composite', VS_FULL, FS_COMPOSITE); this.target(t); this.ctx.use(p);
    this.ctx.bindTex(0, dst.tex); this.ctx.bindTex(1, src.tex); this.ctx.bindTex(2, mask ? mask.tex : null);
    gl.uniform1i(this.ctx.u(p, 'uDst'), 0); gl.uniform1i(this.ctx.u(p, 'uSrc'), 1); gl.uniform1i(this.ctx.u(p, 'uMask'), 2);
    gl.uniform1i(this.ctx.u(p, 'uMode'), BLEND_MODE_INDEX[mode]); gl.uniform1i(this.ctx.u(p, 'uOp'), op === 'over' ? 0 : op === 'atop' ? 1 : 2);
    gl.uniform1i(this.ctx.u(p, 'uHasMask'), mask ? 1 : 0); gl.uniform1f(this.ctx.u(p, 'uOpacity'), opacity);
    gl.uniform2i(this.ctx.u(p, 'uOrigin'), Math.floor(this.view.x * this.view.scale), Math.floor(this.view.y * this.view.scale));
    this.ctx.fullscreen(); this.swap(dst, t); this.release(t);
  }
  lerp(dst: GlSurface, other: GlSurface, opacity: number, mask: GlSurface | null) {
    const gl = this.gl, t = this.alloc(), p = this.ctx.prog('lerp', VS_FULL, FS_LERP); this.target(t); this.ctx.use(p);
    this.ctx.bindTex(0, dst.tex); this.ctx.bindTex(1, other.tex); this.ctx.bindTex(2, mask ? mask.tex : null);
    gl.uniform1i(this.ctx.u(p, 'uDst'), 0); gl.uniform1i(this.ctx.u(p, 'uOther'), 1); gl.uniform1i(this.ctx.u(p, 'uMask'), 2);
    gl.uniform1i(this.ctx.u(p, 'uHasMask'), mask ? 1 : 0); gl.uniform1f(this.ctx.u(p, 'uOpacity'), opacity);
    this.ctx.fullscreen(); this.swap(dst, t); this.release(t);
  }
  adjust(dst: GlSurface, adj: Adjustment, opacity: number, mask: GlSurface | null) {
    const gl = this.gl, key = JSON.stringify(adj);
    let kind = 0, n = 4096, matrix: number[] | null = null, mc = [0, 0, 0], level = 0, strength = 1, tex1: WebGLTexture | null = null, tex3: WebGLTexture | null = null, n3 = 2;
    const separable = ['levels', 'curves', 'invert', 'posterize', 'exposure', 'brightnessContrast', 'cssColor', 'channelMixer'];
    if (separable.includes(adj.type)) {
      let perChannel: Adjustment = adj;
      if (adj.type === 'cssColor') { perChannel = { ...adj, saturate: 1 }; const s = adj.saturate; matrix = [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s]; }
      if (adj.type === 'channelMixer') { perChannel = { type: 'invert' }; const R = adj.red, G = adj.monochrome ? adj.red : adj.green, B = adj.monochrome ? adj.red : adj.blue; matrix = [...R.slice(0, 3), ...G.slice(0, 3), ...B.slice(0, 3)].map(v => v / 100); mc = [R[3], G[3], B[3]].map(v => v / 100); }
      const lut = new Float32Array(n * 4);
      if (adj.type === 'channelMixer') for (let i = 0; i < n; i++) lut.fill(i / (n - 1), i * 4, i * 4 + 3);
      else { const fn = compileAdjustment(perChannel), c = [0, 0, 0]; for (let i = 0; i < n; i++) { c[0] = c[1] = c[2] = i / (n - 1); fn(c); lut[i * 4] = c[0]; lut[i * 4 + 1] = c[1]; lut[i * 4 + 2] = c[2]; lut[i * 4 + 3] = 1; } }
      tex1 = this.lut1('a1:' + key, lut, n);
    } else if (adj.type === 'threshold') { kind = 1; level = adj.level; }
    else if (adj.type === 'gradientMap') { kind = 2; tex1 = this.lut1('gm:' + key, gradientLut(adj.gradient, n, adj.reverse), n); }
    else if (adj.type === 'lut3d') {
      const cube = cubeFor(adj); if (!cube) return; kind = 3; n3 = cube.size; strength = adj.strength ?? 1;
      const d = new Float32Array(n3 ** 3 * 4); for (let i = 0; i < n3 ** 3; i++) { d[i * 4] = cube.data[i * 3]; d[i * 4 + 1] = cube.data[i * 3 + 1]; d[i * 4 + 2] = cube.data[i * 3 + 2]; d[i * 4 + 3] = 1; }
      tex3 = this.lut3('c3:' + (adj.assetId || adj.cube?.length + ':' + adj.cube?.slice(0, 64)), d, n3);
    } else { kind = 3; n3 = 64; tex3 = this.lut3('b3:' + key, bakeLut3d(compileAdjustment(adj), n3), n3); }
    const t = this.alloc(), p = this.ctx.prog('adjust', VS_FULL, FS_ADJUST); this.target(t); this.ctx.use(p);
    this.ctx.bindTex(0, dst.tex); this.ctx.bindTex(1, mask ? mask.tex : null); this.ctx.bindTex(2, tex1); this.ctx.bindTex(3, tex3, gl.TEXTURE_3D);
    gl.uniform1i(this.ctx.u(p, 'uDst'), 0); gl.uniform1i(this.ctx.u(p, 'uMask'), 1); gl.uniform1i(this.ctx.u(p, 'uLut1'), 2); gl.uniform1i(this.ctx.u(p, 'uLut3'), 3);
    gl.uniform1i(this.ctx.u(p, 'uKind'), kind); gl.uniform1i(this.ctx.u(p, 'uHasMask'), mask ? 1 : 0); gl.uniform1i(this.ctx.u(p, 'uLinear'), this.linear ? 1 : 0);
    gl.uniform1i(this.ctx.u(p, 'uMatrix'), matrix ? 1 : 0); gl.uniform1i(this.ctx.u(p, 'uLutN'), n); gl.uniform1f(this.ctx.u(p, 'uOpacity'), opacity);
    gl.uniform1f(this.ctx.u(p, 'uLevel'), level); gl.uniform1f(this.ctx.u(p, 'uStrength'), strength); gl.uniform1f(this.ctx.u(p, 'uLut3N'), n3);
    if (matrix) { gl.uniformMatrix3fv(this.ctx.u(p, 'uM'), true, matrix); gl.uniform3f(this.ctx.u(p, 'uMc'), mc[0], mc[1], mc[2]); }
    this.ctx.fullscreen(); this.ctx.bindTex(3, null, gl.TEXTURE_3D); this.swap(dst, t); this.release(t);
  }
  private blurPass(dst: GlSurface, src: GlSurface, sigma: number, box = false) {
    const gl = this.gl, p = this.ctx.prog('blur', VS_FULL, FS_BLUR), mid = this.alloc();
    const r = box ? Math.max(0, Math.round(sigma)) : Math.max(1, Math.ceil(sigma * 3));
    for (const [out, inp, dir] of [[mid, src, [1, 0]], [dst, mid, [0, 1]]] as [GlSurface, GlSurface, number[]][]) {
      this.target(out); this.ctx.use(p); this.ctx.bindTex(0, inp.tex); gl.uniform1i(this.ctx.u(p, 'uSrc'), 0);
      gl.uniform2f(this.ctx.u(p, 'uDir'), dir[0], dir[1]); gl.uniform1i(this.ctx.u(p, 'uRadius'), r); gl.uniform1i(this.ctx.u(p, 'uBox'), box ? 1 : 0); gl.uniform1f(this.ctx.u(p, 'uSigma'), Math.max(1e-3, sigma));
      this.ctx.fullscreen();
    }
    this.release(mid);
  }
  private gaussian(dst: GlSurface, src: GlSurface, sigma: number) {
    if (sigma <= 0.05) { this.copy(dst, src); return; }
    if (sigma <= 24) { this.blurPass(dst, src, sigma); return; }
    const wIdeal = Math.sqrt((12 * sigma * sigma / 3) + 1); let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--;
    const m = Math.round((12 * sigma * sigma - 3 * wl * wl - 12 * wl - 9) / (-4 * wl - 4));
    const a = this.alloc(); this.copy(a, src);
    for (let i = 0; i < 3; i++) { const t = this.alloc(); this.blurPass(t, a, ((i < m ? wl : wl + 2) - 1) / 2, true); this.swap(a, t); this.release(t); }
    this.copy(dst, a); this.release(a);
  }
  private filterPass(dst: GlSurface, src: GlSurface, kind: number, u: Record<string, number | number[]>, blur?: GlSurface) {
    const gl = this.gl, p = this.ctx.prog('filter', VS_FULL, FS_FILTER); this.target(dst); this.ctx.use(p);
    this.ctx.bindTex(0, src.tex); this.ctx.bindTex(1, blur ? blur.tex : null); gl.uniform1i(this.ctx.u(p, 'uSrc'), 0); gl.uniform1i(this.ctx.u(p, 'uBlur'), 1);
    gl.uniform1i(this.ctx.u(p, 'uKind'), kind); gl.uniform2i(this.ctx.u(p, 'uOrigin'), Math.floor(this.view.x * this.view.scale), Math.floor(this.view.y * this.view.scale));
    for (const [k, v] of Object.entries(u)) Array.isArray(v) ? gl.uniform2f(this.ctx.u(p, k), v[0], v[1]) : gl.uniform1f(this.ctx.u(p, k), v);
    this.ctx.fullscreen();
  }
  filter(dst: GlSurface, src: GlSurface, f: Filter) {
    const s = this.view.scale;
    switch (f.type) {
      case 'gaussianBlur': this.gaussian(dst, src, f.radius * s); return;
      case 'boxBlur': this.blurPass(dst, src, f.radius * s, true); return;
      case 'unsharpMask': case 'highPass': {
        const b = this.alloc(); this.gaussian(b, src, f.radius * s);
        this.filterPass(dst, src, f.type === 'unsharpMask' ? 0 : 1, f.type === 'unsharpMask' ? { uA: f.amount / 100, uB: f.threshold / 255 } : {}, b); this.release(b); return;
      }
      case 'motionBlur': this.filterPass(dst, src, 2, { uA: f.angle * Math.PI / 180, uB: f.distance * s }); return;
      case 'radialBlur': this.filterPass(dst, src, f.mode === 'spin' ? 3 : 4, { uA: f.amount, uCenter: [f.cx * this.doc.width * s - this.view.x * s, f.cy * this.doc.height * s - this.view.y * s] }); return;
      case 'pixelate': this.filterPass(dst, src, 5, { uA: Math.min(64, f.cellSize * s) }); return;
      case 'emboss': this.filterPass(dst, src, 6, { uA: f.angle * Math.PI / 180, uB: f.height * s, uC: f.amount / 100 }); return;
      case 'findEdges': this.filterPass(dst, src, 7, {}); return;
      case 'addNoise': this.filterPass(dst, src, 8, { uA: f.amount / 100, uB: f.gaussian ? 1 : 0, uC: f.monochromatic ? 1 : 0, uD: f.seed ?? 1 }); return;
      case 'adjust': this.copy(dst, src); this.adjust(dst, f.adjustment, 1, null); return;
      default: { // CPU fallback
        this.cpuFallbacks++;
        const r = this.readback(src), v = this.view;
        const out = applyFilter(r, f, { originX: v.x * v.scale, originY: v.y * v.scale, docWidth: this.doc.width, docHeight: this.doc.height, scale: v.scale, linear: this.linear });
        this.upload(dst, out);
      }
    }
  }
  tint(dst: GlSurface, src: GlSurface, color: RGB, invertAlpha: boolean) {
    const c = color.map(x => this.linear ? srgbToLinear(x / 255) : x / 255);
    this.copyPass(dst, src, invertAlpha ? 3 : 2, p => this.gl.uniform4f(this.ctx.u(p, 'uColor'), c[0], c[1], c[2], 1));
  }
  translate(dst: GlSurface, src: GlSurface, dx: number, dy: number) { this.copyPass(dst, src, 4, p => this.gl.uniform2f(this.ctx.u(p, 'uShift'), dx, dy)); }
  alphaGain(dst: GlSurface, gain: number) { const t = this.alloc(); this.copyPass(t, dst, 5, p => this.gl.uniform1f(this.ctx.u(p, 'uGain'), gain)); this.swap(dst, t); this.release(t); }
  stroke(dst: GlSurface, src: GlSurface, size: number, position: 'outside' | 'inside' | 'center', color: RGB) {
    this.cpuFallbacks++;
    const cpu = new CpuBackend({ bitmap: () => null, mask: () => null }); cpu.begin(this.view, this.doc);
    const out = cpu.alloc(); cpu.stroke(out, this.readback(src), size, position, color); this.upload(dst, out);
  }
  upload(dst: GlSurface, r: RasterF) { const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, dst.tex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, r.width, r.height, gl.RGBA, gl.FLOAT, r.data); }
  readback(s: GlSurface): RasterF {
    const gl = this.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, s.fbo);
    const hi = this.ctx.float && this.bitDepth === 16;
    if (hi) { const d = new Float32Array(s.w * s.h * 4); gl.readPixels(0, 0, s.w, s.h, gl.RGBA, gl.FLOAT, d); return { width: s.w, height: s.h, data: d }; }
    const b = new Uint8Array(s.w * s.h * 4); gl.readPixels(0, 0, s.w, s.h, gl.RGBA, gl.UNSIGNED_BYTE, b);
    const d = new Float32Array(b.length); for (let i = 0; i < b.length; i++) d[i] = b[i] / 255; return { width: s.w, height: s.h, data: d };
  }
}

// ── Public GPU compositor ───────────────────────────────────────────────────
export interface GlCompositorStats { lastRenderMs: number; tiles: number; textureBytes: number; peakSurfaces: number; cpuFallbacks: number; float16: boolean }
export class GlCompositor {
  ctx: GlContext; assets: GlAssetCache; backend: GlBackend;
  stats: GlCompositorStats = { lastRenderMs: 0, tiles: 0, textureBytes: 0, peakSurfaces: 0, cpuFallbacks: 0, float16: false };
  private proof: { tex: WebGLTexture; n: number } | null = null;
  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, source: AssetSource) {
    this.ctx = new GlContext(canvas); this.assets = new GlAssetCache(this.ctx, source); this.backend = new GlBackend(this.ctx, this.assets);
    this.stats.float16 = this.ctx.float;
  }
  /** Re-upload part of an asset after a paint stroke (dirty rect in bitmap px). */
  invalidate(key: string, dirty?: Rect, mask = false) { this.assets.invalidate(key, dirty, mask); }
  /** Render a view into a surface (release with releaseSurface). */
  render(doc: RasterDocument, view: CompositeView, skip?: Set<string>): GlSurface {
    const t0 = performance.now(); const s = compositeDocument(doc, this.backend, view, { skip });
    this.ctx.gl.finish(); this.stats.lastRenderMs = performance.now() - t0; this.stats.textureBytes = this.assets.bytes; this.stats.peakSurfaces = this.backend.peakSurfaces; this.stats.cpuFallbacks = this.backend.cpuFallbacks;
    return s;
  }
  releaseSurface(s: GlSurface) { this.backend.release(s); }
  /** Render + present a viewport onto this compositor's canvas (sized to the view). */
  renderView(doc: RasterDocument, view: CompositeView, opts: { checker?: boolean } = {}) {
    const apron = stackApron(doc, view.scale);
    const big: CompositeView = { ...view, x: view.x - apron / view.scale, y: view.y - apron / view.scale, width: view.width + apron * 2, height: view.height + apron * 2 };
    const s = this.render(doc, big); this.present(s, doc, { ...opts, crop: apron, width: view.width, height: view.height }); this.releaseSurface(s);
  }
  present(s: GlSurface, doc: RasterDocument, opts: { checker?: boolean; crop?: number; width?: number; height?: number } = {}) {
    const gl = this.ctx.gl, c = this.ctx.canvas, w = opts.width ?? s.w, h = opts.height ?? s.h, crop = opts.crop || 0;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(-crop, -(s.h - h - crop), s.w, s.h);
    const p = this.ctx.prog('present', VS_FULL, FS_PRESENT); this.ctx.use(p);
    this.ctx.bindTex(0, s.tex); this.ctx.bindTex(1, this.proof?.tex || null, gl.TEXTURE_3D);
    gl.uniform1i(this.ctx.u(p, 'uSrc'), 0); gl.uniform1i(this.ctx.u(p, 'uProof'), 1);
    gl.uniform1i(this.ctx.u(p, 'uLinear'), doc.blendSpace === 'linear' ? 1 : 0); gl.uniform1i(this.ctx.u(p, 'uProofOn'), this.proof ? 1 : 0);
    gl.uniform1f(this.ctx.u(p, 'uProofN'), this.proof?.n || 2); gl.uniform1i(this.ctx.u(p, 'uChecker'), opts.checker ? 1 : 0);
    gl.uniform1i(this.ctx.u(p, 'uStraight'), 0); gl.uniform1i(this.ctx.u(p, 'uFlip'), 1); gl.uniform1i(this.ctx.u(p, 'uDither'), 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); this.ctx.fullscreen();
  }
  /** Soft-proof: a display transform LUT (e.g. from color.ts cmykProofLut) applied at present. */
  setProofLut(lut: Float32Array | null, n = 33) {
    const gl = this.ctx.gl; if (this.proof) { gl.deleteTexture(this.proof.tex); this.proof = null; }
    if (!lut) return;
    const tex = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_3D, tex); gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, n, n, n, 0, gl.RGBA, gl.FLOAT, lut);
    for (const pn of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_3D, pn, gl.LINEAR);
    for (const pn of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, pn, gl.CLAMP_TO_EDGE);
    this.proof = { tex, n };
  }
  /** GPU-side encode (unpremultiply, linear→sRGB, optional dither) + 8-bit readback: the fast export path. */
  readbackBitmap(s: GlSurface, doc: RasterDocument, dither = false): Bitmap8 {
    const gl = this.ctx.gl, tex = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, tex); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, s.w, s.h);
    const fbo = gl.createFramebuffer()!; gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, s.w, s.h); const p = this.ctx.prog('present', VS_FULL, FS_PRESENT); this.ctx.use(p);
    this.ctx.bindTex(1, null, gl.TEXTURE_3D); this.ctx.bindTex(0, s.tex);
    gl.uniform1i(this.ctx.u(p, 'uSrc'), 0); gl.uniform1i(this.ctx.u(p, 'uProof'), 1); gl.uniform1i(this.ctx.u(p, 'uLinear'), doc.blendSpace === 'linear' ? 1 : 0);
    gl.uniform1i(this.ctx.u(p, 'uProofOn'), 0); gl.uniform1i(this.ctx.u(p, 'uChecker'), 0); gl.uniform1i(this.ctx.u(p, 'uStraight'), 1); gl.uniform1i(this.ctx.u(p, 'uFlip'), 0); gl.uniform1i(this.ctx.u(p, 'uDither'), dither ? 1 : 0);
    this.ctx.fullscreen();
    const out = new Uint8ClampedArray(s.w * s.h * 4); gl.readPixels(0, 0, s.w, s.h, gl.RGBA, gl.UNSIGNED_BYTE, out);
    gl.deleteFramebuffer(fbo); gl.deleteTexture(tex); return { width: s.w, height: s.h, data: out };
  }
  renderToBitmap(doc: RasterDocument, view: CompositeView, dither = false): Bitmap8 { const s = this.render(doc, view); const b = this.readbackBitmap(s, doc, dither); this.releaseSurface(s); return b; }
  renderToRaster(doc: RasterDocument, view: CompositeView): RasterF { const s = this.render(doc, view); const r = this.backend.readback(s); this.releaseSurface(s); return r; }
  /** Flatten a document tile by tile (8k-safe). onTile receives straight sRGB 8-bit tiles. */
  flattenTiled(doc: RasterDocument, onTile: (tile: Bitmap8, x: number, y: number) => void, opts: { tile?: number; scale?: number; dither?: boolean } = {}) {
    const scale = opts.scale ?? 1, W = Math.round(doc.width * scale), H = Math.round(doc.height * scale), T = opts.tile ?? 2048, apron = stackApron(doc, scale);
    let n = 0;
    for (let ty = 0; ty < H; ty += T) for (let tx = 0; tx < W; tx += T) {
      const tw = Math.min(T, W - tx), th = Math.min(T, H - ty);
      const view: CompositeView = { x: (tx - apron) / scale, y: (ty - apron) / scale, scale, width: tw + 2 * apron, height: th + 2 * apron };
      const bm = this.renderToBitmap(doc, view, opts.dither);
      const tile: Bitmap8 = { width: tw, height: th, data: new Uint8ClampedArray(tw * th * 4) };
      for (let y = 0; y < th; y++) tile.data.set(bm.data.subarray(((y + apron) * view.width + apron) * 4, ((y + apron) * view.width + apron + tw) * 4), y * tw * 4);
      onTile(tile, tx, ty); n++;
    }
    this.stats.tiles = n;
  }
  flatten(doc: RasterDocument, opts: { tile?: number; scale?: number; dither?: boolean } = {}): Bitmap8 {
    const scale = opts.scale ?? 1, W = Math.round(doc.width * scale), H = Math.round(doc.height * scale), out: Bitmap8 = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) };
    this.flattenTiled(doc, (t, x, y) => { for (let j = 0; j < t.height; j++) out.data.set(t.data.subarray(j * t.width * 4, (j + 1) * t.width * 4), ((y + j) * W + x) * 4); }, opts);
    return out;
  }
  dispose() { this.assets.clear(); this.backend.flushPool(); (this.ctx.gl.getExtension('WEBGL_lose_context') as any)?.loseContext(); }
}
