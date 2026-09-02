// fxRenderer.ts — renders one OFX-shaped effect: input texture + param values →
// output texture, on the shared GL context. Per-effect program cache + per-node FBO
// pool, so a graph re-uses targets each frame with no allocation.
//
// TEMPORAL ACCESS (W2a): an effect declared `temporal: true` gets its own history per
// node id — its previous OUTPUT (`prev()`, feedback) and the previous INPUT (`prevSrc()`),
// plus `uDeltaT` / `uFrame`. History is advanced only when time moves forward by less
// than half a second; any scrub, seek backwards or jump resets it to "first frame", so
// the offline renderer (which steps frames in order) and a playing monitor agree, and a
// scrubbed monitor never shows stale trails.
//
// MIX / MASK STAGE: after the passes, `out = mix(input, effect, mask * mix)` when a mix
// under 1 or a mask texture is supplied (PixelChooser-style masking for every effect).

import { GL, RenderTarget, createProgram, createFullscreenQuad, makeTarget } from '../core/glUtil';
import { AudioTexture } from '../core/audioTexture';
import { FxEffect, FX_HEADER, FX_MAIN, getEffect } from './effects';

const VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

const COPY_FS = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uTex;
void main(){ o = texture(uTex, vUv); }`;

// out = mix(input, effect, m) where m = mask (R channel, optionally inverted) * mix.
const MIX_FS = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uIn, uFx, uMask; uniform float uMix; uniform int uMaskOn, uMaskInvert;
void main(){ float m = uMix; if (uMaskOn == 1) { float k = texture(uMask, vUv).r; if (uMaskInvert == 1) k = 1.0 - k; m *= k; } o = mix(texture(uIn, vUv), texture(uFx, vUv), clamp(m, 0.0, 1.0)); }`;

const P_NAMES = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'];

export interface FxContext { time: number; audio: AudioTexture; }
export interface FxRenderOptions {
  /** 0..1 blend of the effect over its input (1 = full effect). */
  mix?: number;
  /** R-channel mask texture (1 = effect applies). */
  mask?: WebGLTexture | null;
  maskInvert?: boolean;
}

interface History { out: [RenderTarget | undefined, RenderTarget | undefined]; idx: number; src?: RenderTarget; lastTime: number; frame: number; }

const MAX_STEP = 0.5; // seconds; a larger forward jump (or any backward step) resets history

export class FxRenderer {
  private quad: WebGLVertexArrayObject;
  private progs = new Map<string, { p: WebGLProgram | null; u: Record<string, WebGLUniformLocation | null> }>();
  private pool = new Map<string, RenderTarget>();
  private history = new Map<string, History>();
  private copyProg: WebGLProgram; private copyU: WebGLUniformLocation | null;
  private mixProg: WebGLProgram; private mixU: Record<string, WebGLUniformLocation | null> = {};

  constructor(private gl: GL) {
    this.quad = createFullscreenQuad(gl);
    this.copyProg = createProgram(gl, VS, COPY_FS);
    this.copyU = gl.getUniformLocation(this.copyProg, 'uTex');
    this.mixProg = createProgram(gl, VS, MIX_FS);
    for (const n of ['uIn', 'uFx', 'uMask', 'uMix', 'uMaskOn', 'uMaskInvert']) this.mixU[n] = gl.getUniformLocation(this.mixProg, n);
  }

  private program(effect: FxEffect, passId = 'main', glsl = effect.glsl) {
    const programId = `${effect.id}:${passId}`;
    let entry = this.progs.get(programId);
    if (!entry) {
      let p: WebGLProgram | null = null;
      try { p = createProgram(this.gl, VS, FX_HEADER + '\n' + glsl + FX_MAIN); }
      catch (e) { console.warn(`[FxRenderer] "${programId}" compile failed:`, (e as Error)?.message || e); p = null; }
      const u: Record<string, WebGLUniformLocation | null> = {};
      if (p) for (const n of ['uInput', 'uSource', 'uAux', 'uPrev', 'uPrevSrc', 'uResolution', 'uTime', 'uDeltaT', 'uFrame', 'iBass', 'iMid', 'iTreble', 'iLevel', ...P_NAMES]) u[n] = this.gl.getUniformLocation(p, n);
      entry = { p, u };
      this.progs.set(programId, entry);
    }
    return entry;
  }

  /** Drop a node's temporal history (e.g. when the clip is re-cut). */
  resetHistory(nodeId?: string) {
    const gl = this.gl;
    const drop = (h: History) => { for (const t of h.out) if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); } if (h.src) { gl.deleteTexture(h.src.tex); gl.deleteFramebuffer(h.src.fbo); } };
    if (nodeId) { const h = this.history.get(nodeId); if (h) { drop(h); this.history.delete(nodeId); } }
    else { this.history.forEach(drop); this.history.clear(); }
  }

  /** Apply effect `fxId` (with param values) to `input`, into the pooled target for `nodeId`. */
  render(nodeId: string, fxId: string, params: number[], input: WebGLTexture, w: number, h: number, ctx: FxContext, aux?: WebGLTexture, opts?: FxRenderOptions): WebGLTexture {
    const effect = getEffect(fxId);
    if (!effect) return input; // unknown effect → passthrough
    const passes = effect.passes?.length ? effect.passes : [{ id: 'main', glsl: effect.glsl }];

    // Temporal history: decide whether the previous frame is usable for this node.
    let hist: History | undefined; let prevOut: WebGLTexture = input, prevSrc: WebGLTexture = input, deltaT = 0, frame = 0;
    if (effect.temporal) {
      hist = this.history.get(nodeId);
      if (!hist) { hist = { out: [undefined, undefined], idx: 0, lastTime: NaN, frame: 0 }; this.history.set(nodeId, hist); }
      const dt = ctx.time - hist.lastTime;
      const continuous = Number.isFinite(dt) && dt > 1e-6 && dt < MAX_STEP && !!hist.out[hist.idx] && !!hist.src;
      if (continuous) { prevOut = hist.out[hist.idx]!.tex; prevSrc = hist.src!.tex; deltaT = dt; frame = hist.frame; }
      else { hist.frame = 0; frame = 0; }
    }

    let current = input;
    for (const pass of passes) current = this.renderPass(`${nodeId}:${pass.id}`, effect, pass.id, pass.glsl, params, current, input, aux || input, prevOut, prevSrc, deltaT, frame, w, h, ctx);

    if (hist) {
      // Advance history: copy this frame's output and input into the node's own targets
      // (pool targets are rewritten next frame, so they cannot hold history).
      const slot = 1 - hist.idx;
      hist.out[slot] = makeTarget(this.gl, w, h, hist.out[slot]);
      this.blit(current, hist.out[slot]!, w, h);
      hist.src = makeTarget(this.gl, w, h, hist.src);
      this.blit(input, hist.src, w, h);
      hist.idx = slot; hist.lastTime = ctx.time; hist.frame = frame + 1;
    }

    const mix = opts?.mix ?? 1;
    if (opts?.mask || mix < 0.999) current = this.mixStage(`${nodeId}:mix`, input, current, mix, opts?.mask || null, !!opts?.maskInvert, w, h);
    return current;
  }

  private blit(tex: WebGLTexture, target: RenderTarget, w: number, h: number) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND); gl.useProgram(this.copyProg); gl.bindVertexArray(this.quad);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(this.copyU, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
  }

  private mixStage(targetId: string, input: WebGLTexture, fx: WebGLTexture, mix: number, mask: WebGLTexture | null, invert: boolean, w: number, h: number): WebGLTexture {
    const gl = this.gl;
    const target = makeTarget(gl, w, h, this.pool.get(targetId)); this.pool.set(targetId, target);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND); gl.useProgram(this.mixProg); gl.bindVertexArray(this.quad);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, input); gl.uniform1i(this.mixU.uIn, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, fx); gl.uniform1i(this.mixU.uFx, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, mask || fx); gl.uniform1i(this.mixU.uMask, 2);
    gl.uniform1f(this.mixU.uMix, mix); gl.uniform1i(this.mixU.uMaskOn, mask ? 1 : 0); gl.uniform1i(this.mixU.uMaskInvert, invert ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
    return target.tex;
  }

  private renderPass(targetId: string, effect: FxEffect, passId: string, glsl: string, params: number[], input: WebGLTexture, source: WebGLTexture, auxiliary: WebGLTexture, prevOut: WebGLTexture, prevSrc: WebGLTexture, deltaT: number, frame: number, w: number, h: number, ctx: FxContext): WebGLTexture {
    const gl = this.gl;
    const target = makeTarget(gl, w, h, this.pool.get(targetId));
    this.pool.set(targetId, target);
    const { p, u } = this.program(effect, passId, glsl);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, w, h);
    // Fail open to the source texture. A bad third-party/custom shader must never replace
    // a photograph or timeline frame with black; callers can keep editing with the last
    // healthy pipeline while the compile warning identifies the broken pass.
    if (!p) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); return input; }

    gl.disable(gl.BLEND);
    gl.useProgram(p);
    gl.bindVertexArray(this.quad);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, input); gl.uniform1i(u.uInput, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, source); gl.uniform1i(u.uSource, 1);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, auxiliary); gl.uniform1i(u.uAux, 4);
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, prevOut); gl.uniform1i(u.uPrev, 5);
    gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, prevSrc); gl.uniform1i(u.uPrevSrc, 6);
    gl.uniform2f(u.uResolution, w, h);
    gl.uniform1f(u.uTime, ctx.time);
    gl.uniform1f(u.uDeltaT, deltaT); gl.uniform1f(u.uFrame, frame);
    gl.uniform1f(u.iBass, ctx.audio.bass); gl.uniform1f(u.iMid, ctx.audio.mid);
    gl.uniform1f(u.iTreble, ctx.audio.treble); gl.uniform1f(u.iLevel, ctx.audio.level);
    // Param values in the effect's declared order, defaults where unset.
    for (let i = 0; i < P_NAMES.length; i++) {
      const def = effect.params[i]?.default ?? 0;
      gl.uniform1f(u[P_NAMES[i]], params[i] ?? def);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    return target.tex;
  }

  dispose() {
    const gl = this.gl;
    this.progs.forEach(e => { if (e.p) gl.deleteProgram(e.p); });
    this.pool.forEach(t => { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); });
    this.resetHistory();
    gl.deleteProgram(this.copyProg); gl.deleteProgram(this.mixProg);
    this.progs.clear(); this.pool.clear();
  }
}
