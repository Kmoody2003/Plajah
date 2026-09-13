// nodeGraph.ts — the Fusion/AE-hybrid node compositor (#9), on the Pixels GL
// pipeline. A NodeGraph is a DAG of: SOURCE nodes (generator / shader / color),
// EFFECT nodes (an OFX-shaped FxEffect over one input), and MERGE nodes (two inputs
// blended), terminating at an OUTPUT node. NodeGraphRenderer.evaluate() topologically
// resolves it to a single texture — deterministic (time + audio injected), so a graph
// renders the same live and in the offline export. The visual editor is a separate
// layer over this engine.

import { GL, RenderTarget, createProgram, createFullscreenQuad, makeTarget } from './glUtil';
import { AudioTexture } from './audioTexture';
import { GeneratorRenderer, hasGenerator } from './generators';
import { ShaderRenderer } from './shaderRenderer';
import { FxRenderer } from '../fx/fxRenderer';

export interface GraphNode {
  id: string;
  type: 'source' | 'effect' | 'merge' | 'output';
  // source
  srcKind?: 'generator' | 'shader' | 'color';
  sceneMode?: string;
  shaderSrc?: string;
  fillColor?: string;
  srcParams?: number[];
  // effect
  fxId?: string;
  fxParams?: number[];
  input?: string;       // upstream node id (effect / output)
  inputAux?: string;    // optional second source for multi-input effects
  // merge
  inputA?: string;      // bottom
  inputB?: string;      // top
  blendMode?: string;
}
export interface NodeGraph { nodes: GraphNode[]; output: string; }

export interface GraphContext { time: number; audio: AudioTexture; colors: number[][]; }

const VS = `#version 300 es
layout(location=0) in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

const MERGE_FS = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uA, uB; uniform int uMode;
vec3 blend(int m, vec3 d, vec3 s){
  if(m==1) return d+s-d*s;
  if(m==2) return min(d+s,vec3(1.0));
  if(m==3) return d*s;
  if(m==4) return mix(2.*d*s,1.-2.*(1.-d)*(1.-s),step(0.5,d));
  if(m==5) return max(d,s);
  if(m==6) return min(d,s);
  if(m==7) return abs(d-s);
  return s;
}
void main(){ vec4 a=texture(uA,vUv); vec4 b=texture(uB,vUv); vec3 bl=blend(uMode,a.rgb,b.rgb); o=vec4(mix(a.rgb,bl,b.a), max(a.a,b.a)); }`;
const MERGE_INDEX: Record<string, number> = { normal: 0, screen: 1, add: 2, multiply: 3, overlay: 4, lighten: 5, darken: 6, difference: 7 };

function hex3(hex: string): [number, number, number] {
  const h = (hex || '#000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h.padEnd(6, '0').slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export class NodeGraphRenderer {
  private gen: GeneratorRenderer;
  private shader: ShaderRenderer;
  private fx: FxRenderer;
  private quad: WebGLVertexArrayObject;
  private mergeProg: WebGLProgram;
  private uA: WebGLUniformLocation | null; private uB: WebGLUniformLocation | null; private uMode: WebGLUniformLocation | null;
  private pool = new Map<string, RenderTarget>(); // source-color + merge outputs

  constructor(private gl: GL) {
    this.gen = new GeneratorRenderer(gl);
    this.shader = new ShaderRenderer(gl);
    this.fx = new FxRenderer(gl);
    this.quad = createFullscreenQuad(gl);
    this.mergeProg = createProgram(gl, VS, MERGE_FS);
    this.uA = gl.getUniformLocation(this.mergeProg, 'uA');
    this.uB = gl.getUniformLocation(this.mergeProg, 'uB');
    this.uMode = gl.getUniformLocation(this.mergeProg, 'uMode');
  }

  /** Resolve a graph to one texture, or null if it can't render. */
  evaluate(graph: NodeGraph, w: number, h: number, ctx: GraphContext): WebGLTexture | null {
    if (!graph?.nodes?.length || !graph.output) return null;
    const byId = new Map(graph.nodes.map(n => [n.id, n]));
    const cache = new Map<string, WebGLTexture | null>();
    const visiting = new Set<string>();

    const evalNode = (id: string): WebGLTexture | null => {
      if (cache.has(id)) return cache.get(id)!;
      if (visiting.has(id)) return null; // cycle guard
      visiting.add(id);
      const n = byId.get(id);
      let tex: WebGLTexture | null = null;
      if (n) {
        if (n.type === 'source') tex = this.source(n, w, h, ctx);
        else if (n.type === 'effect' && n.fxId) { const i = n.input ? evalNode(n.input) : null; const aux = n.inputAux ? evalNode(n.inputAux) : null; tex = i ? this.fx.render(n.id, n.fxId, n.fxParams || [], i, w, h, ctx, aux || undefined) : null; }
        else if (n.type === 'merge') { const a = n.inputA ? evalNode(n.inputA) : null; const b = n.inputB ? evalNode(n.inputB) : null; tex = this.merge(n.id, a, b, n.blendMode || 'normal', w, h); }
        else if (n.type === 'output') tex = n.input ? evalNode(n.input) : null;
      }
      visiting.delete(id);
      cache.set(id, tex);
      return tex;
    };
    return evalNode(graph.output);
  }

  private source(n: GraphNode, w: number, h: number, ctx: GraphContext): WebGLTexture | null {
    if (n.srcKind === 'generator' && n.sceneMode && hasGenerator(n.sceneMode))
      return this.gen.render(n.id, n.sceneMode, w, h, { time: ctx.time, audio: ctx.audio, colors: ctx.colors, params: n.srcParams || [] });
    if (n.srcKind === 'shader' && n.shaderSrc)
      return this.shader.render(n.id, n.shaderSrc, w, h, { time: ctx.time, audio: ctx.audio, params: n.srcParams || [] });
    if (n.srcKind === 'color') {
      const t = makeTarget(this.gl, w, h, this.pool.get(n.id)); this.pool.set(n.id, t);
      const [r, g, b] = hex3(n.fillColor || '#000');
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, t.fbo); this.gl.viewport(0, 0, w, h);
      this.gl.clearColor(r, g, b, 1); this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      return t.tex;
    }
    return null;
  }

  private merge(nodeId: string, a: WebGLTexture | null, b: WebGLTexture | null, mode: string, w: number, h: number): WebGLTexture | null {
    if (!a) return b; if (!b) return a;
    const gl = this.gl;
    const t = makeTarget(gl, w, h, this.pool.get(nodeId)); this.pool.set(nodeId, t);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.useProgram(this.mergeProg); gl.bindVertexArray(this.quad);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a); gl.uniform1i(this.uA, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, b); gl.uniform1i(this.uB, 1);
    gl.uniform1i(this.uMode, MERGE_INDEX[mode?.toLowerCase()] ?? 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    return t.tex;
  }

  dispose() {
    const gl = this.gl;
    this.gen.dispose(); this.shader.dispose(); this.fx.dispose();
    gl.deleteProgram(this.mergeProg);
    this.pool.forEach(t => { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); });
    this.pool.clear();
  }
}
