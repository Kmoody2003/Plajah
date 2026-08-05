// fxRenderer.ts — renders one OFX-shaped effect: input texture + param values →
// output texture, on the shared GL context. Per-effect program cache + per-node FBO
// pool, so a graph re-uses targets each frame with no allocation.

import { GL, RenderTarget, createProgram, createFullscreenQuad, makeTarget } from '../core/glUtil';
import { AudioTexture } from '../core/audioTexture';
import { FxEffect, FX_HEADER, FX_MAIN, getEffect } from './effects';

const VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

const P_NAMES = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'];

export interface FxContext { time: number; audio: AudioTexture; }

export class FxRenderer {
  private quad: WebGLVertexArrayObject;
  private progs = new Map<string, { p: WebGLProgram | null; u: Record<string, WebGLUniformLocation | null> }>();
  private pool = new Map<string, RenderTarget>();

  constructor(private gl: GL) {
    this.quad = createFullscreenQuad(gl);
  }

  private program(effect: FxEffect) {
    let entry = this.progs.get(effect.id);
    if (!entry) {
      let p: WebGLProgram | null = null;
      try { p = createProgram(this.gl, VS, FX_HEADER + '\n' + effect.glsl + FX_MAIN); }
      catch (e) { console.warn(`[FxRenderer] "${effect.id}" compile failed:`, (e as Error)?.message || e); p = null; }
      const u: Record<string, WebGLUniformLocation | null> = {};
      if (p) for (const n of ['uInput', 'uResolution', 'uTime', 'iBass', 'iMid', 'iTreble', 'iLevel', ...P_NAMES]) u[n] = this.gl.getUniformLocation(p, n);
      entry = { p, u };
      this.progs.set(effect.id, entry);
    }
    return entry;
  }

  /** Apply effect `fxId` (with param values) to `input`, into the pooled target for `nodeId`. */
  render(nodeId: string, fxId: string, params: number[], input: WebGLTexture, w: number, h: number, ctx: FxContext): WebGLTexture {
    const gl = this.gl;
    const effect = getEffect(fxId);
    const target = makeTarget(gl, w, h, this.pool.get(nodeId));
    this.pool.set(nodeId, target);
    if (!effect) return input; // unknown effect → passthrough
    const { p, u } = this.program(effect);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, w, h);
    if (!p) { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); return target.tex; }

    gl.disable(gl.BLEND);
    gl.useProgram(p);
    gl.bindVertexArray(this.quad);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(u.uInput, 0);
    gl.uniform2f(u.uResolution, w, h);
    gl.uniform1f(u.uTime, ctx.time);
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
    this.progs.clear(); this.pool.clear();
  }
}
