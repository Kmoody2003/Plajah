// ShaderRenderer — renders a user Shadertoy-style fragment shader into a layer
// texture, exactly like GeneratorRenderer does for built-in generators, so shaders
// composite in the single-surface pipeline (live preview AND the deterministic
// offline render). Same audio convention: iChannel0 (the shared 512×2 AudioTexture)
// at TEXTURE2, iBass/iMid/iTreble/iLevel, iParam0..3, plus iTime injected by the
// caller — which is what makes it frame-deterministic and exportable (unlike
// butterchurn/milkdrop). A "generator clip" can thus carry a built-in mode OR a
// shader; both render everywhere.

import { GL, RenderTarget, createProgram, createFullscreenQuad, makeTarget } from './glUtil';
import { AudioTexture } from './audioTexture';

const VS = `#version 300 es
layout(location=0) in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

// Matches ShaderLayer's surface so existing user shaders compile unchanged.
const HEADER = `#version 300 es
precision highp float;
out vec4 _frag;
uniform vec3 iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform vec4 iMouse;
uniform sampler2D iChannel0;
uniform float iBass, iMid, iTreble, iLevel;
uniform float iParam0, iParam1, iParam2, iParam3;
`;
const MAIN = `
void main(){ vec4 c = vec4(0.0,0.0,0.0,1.0); mainImage(c, gl_FragCoord.xy); _frag = c; }
`;

const U_NAMES = ['iResolution', 'iTime', 'iTimeDelta', 'iFrame', 'iMouse', 'iChannel0', 'iBass', 'iMid', 'iTreble', 'iLevel', 'iParam0', 'iParam1', 'iParam2', 'iParam3'];

export interface ShaderContext {
  time: number;
  audio: AudioTexture;
  params: number[];
}

export class ShaderRenderer {
  private quad: WebGLVertexArrayObject;
  // Program cache keyed by EXACT source (compiling is a stall; switching back to a
  // seen shader is then instant). null program = a source that failed to compile.
  private progs = new Map<string, { p: WebGLProgram | null; u: Record<string, WebGLUniformLocation | null> }>();
  private pool = new Map<string, RenderTarget>();

  constructor(private gl: GL) {
    this.quad = createFullscreenQuad(gl);
  }

  private program(src: string) {
    let entry = this.progs.get(src);
    if (!entry) {
      let p: WebGLProgram | null = null;
      try { p = createProgram(this.gl, VS, HEADER + '\n' + src + '\n' + MAIN); }
      catch (e) { console.warn('[ShaderRenderer] compile failed:', (e as Error)?.message || e); p = null; }
      const u: Record<string, WebGLUniformLocation | null> = {};
      if (p) for (const n of U_NAMES) u[n] = this.gl.getUniformLocation(p, n);
      entry = { p, u };
      this.progs.set(src, entry);
    }
    return entry;
  }

  /** Render `src` into a pooled texture (keyed by layer id) and return it. */
  render(id: string, src: string, w: number, h: number, ctx: ShaderContext): WebGLTexture {
    const gl = this.gl;
    const target = makeTarget(gl, w, h, this.pool.get(id));
    this.pool.set(id, target);
    const { p, u } = this.program(src);

    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, w, h);
    if (!p) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); return target.tex; } // bad shader → transparent

    gl.disable(gl.BLEND);
    gl.useProgram(p);
    gl.bindVertexArray(this.quad);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, ctx.audio.tex);
    gl.uniform1i(u.iChannel0, 2);
    gl.uniform3f(u.iResolution, w, h, 1);
    gl.uniform1f(u.iTime, ctx.time);
    gl.uniform1f(u.iTimeDelta, 1 / 60);
    gl.uniform1i(u.iFrame, Math.max(0, Math.floor(ctx.time * 60)));
    gl.uniform4f(u.iMouse, 0, 0, 0, 0);
    gl.uniform1f(u.iBass, ctx.audio.bass);
    gl.uniform1f(u.iMid, ctx.audio.mid);
    gl.uniform1f(u.iTreble, ctx.audio.treble);
    gl.uniform1f(u.iLevel, ctx.audio.level);
    gl.uniform1f(u.iParam0, ctx.params[0] ?? 0.5);
    gl.uniform1f(u.iParam1, ctx.params[1] ?? 0.5);
    gl.uniform1f(u.iParam2, ctx.params[2] ?? 0.5);
    gl.uniform1f(u.iParam3, ctx.params[3] ?? 0.5);

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
