// engine/webgl/glRenderer.ts — WebGL2 fragment-shader scenes.
// Same audio uniform contract as the canvas presets. Compiled + verified.
// Extend by adding a fragment shader string + entry to GL_PRESETS.

import { hexV, AudioBands, VizParams } from '../params';

const VERT = `#version 300 es
in vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;

const FRAG_HEAD = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes;uniform float uT,uBass,uMid,uTreble,uLevel,uBeat,uSpeed,uGlow;
uniform vec3 uC0,uC1,uC2,uC3;
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1,1));return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<6;i++){v+=a*noise(p);p*=2.;a*=.5;}return v;}
`;

const FRAG_PLASMA = FRAG_HEAD + `
void main(){
  vec2 uv=(gl_FragCoord.xy*2.-uRes)/uRes.y;
  float t=uT*.12*uSpeed;
  vec2 q=vec2(fbm(uv*1.5+t),fbm(uv*1.5-t+5.2));
  vec2 r=vec2(fbm(uv*2.+q*(1.5+uBass*2.)+t*.7),fbm(uv*2.+q*1.5-t*.6+2.8));
  float f=fbm(uv*1.2+r*(1.+uMid*1.5)+t*.3);
  float bands=f+.15*sin(length(uv)*8.-uT*2.*uSpeed+uBass*6.);
  vec3 col=mix(uC3,uC0,smoothstep(.1,.6,f));
  col=mix(col,uC1,smoothstep(.4,.9,r.x));
  col=mix(col,uC2,smoothstep(.5,1.,q.y)*(.5+uTreble));
  col+=uC1*uBeat*.5*exp(-length(uv)*1.5);
  col*=(.7+.6*bands)*(.6+uGlow*.7);
  col+=.04/(.02+abs(.5-fract(f*3.+t)));
  col*=1.-.25*length(uv*.6);
  o=vec4(col,1.);
}`;

const FRAG_RAYMARCH = FRAG_HEAD + `
float sphField(vec3 p){p.z+=uT*.6*uSpeed;vec3 q=fract(p)-.5;return length(q)-(.18+uBass*.18);}
float map(vec3 p){p.xy*=rot(uT*.1*uSpeed+uMid*.5);return sphField(p);}
vec3 norm(vec3 p){vec2 e=vec2(.001,0);return normalize(vec3(map(p+e.xyy)-map(p-e.xyy),map(p+e.yxy)-map(p-e.yxy),map(p+e.yyx)-map(p-e.yyx)));}
void main(){
  vec2 uv=(gl_FragCoord.xy*2.-uRes)/uRes.y;
  vec3 ro=vec3(0,0,-3.),rd=normalize(vec3(uv,1.5));rd.xy*=rot(sin(uT*.1)*.2);
  float t=0.;float glow=0.;
  for(int i=0;i<60;i++){vec3 p=ro+rd*t;float d=map(p);glow+=.012/(.01+abs(d));if(d<.001||t>12.)break;t+=d*.7;}
  vec3 p=ro+rd*t;vec3 n=norm(p);
  float dif=max(dot(n,normalize(vec3(1,1,-1))),0.);
  float fres=pow(1.-max(dot(n,-rd),0.),3.);
  vec3 col=mix(uC0,uC2,dif)*dif+uC1*fres*(1.+uTreble);
  col+=mix(uC3,uC1,sin(uT*.5)*.5+.5)*glow*.06*(.5+uGlow);
  col+=uC0*uBeat*.4;col=col/(1.+col);col=pow(col,vec3(.85));
  o=vec4(col,1.);
}`;

export interface GLPreset { id: string; name: string; cat: string; gl: string; }
export const GL_PRESETS: GLPreset[] = [
  { id: 'plasma', name: 'Plasma Fluid', cat: 'Fluid · GLSL', gl: 'plasma' },
  { id: 'raymarch', name: 'Raymarch Field', cat: '3D · GLSL', gl: 'raymarch' },
];

export class GLRenderer {
  gl: WebGL2RenderingContext | null = null;
  programs: Record<string, WebGLProgram | null> = {};
  ok = false;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) { console.warn('WebGL2 unavailable'); return; }
    this.gl = gl;
    const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.programs.plasma = this.program(FRAG_PLASMA);
    this.programs.raymarch = this.program(FRAG_RAYMARCH);
    this.ok = !!(this.programs.plasma && this.programs.raymarch);
  }
  private compile(type: number, src: string) {
    const gl = this.gl!; const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error('shader:', gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  private program(frag: string) {
    const gl = this.gl!; const v = this.compile(gl.VERTEX_SHADER, VERT), f = this.compile(gl.FRAGMENT_SHADER, frag);
    if (!v || !f) return null;
    const p = gl.createProgram()!; gl.attachShader(p, v); gl.attachShader(p, f); gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error('link:', gl.getProgramInfoLog(p)); return null; }
    return p;
  }
  resize() { if (this.gl) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height); }
  draw(key: string, tMs: number, A: AudioBands, P: VizParams, pal: string[]) {
    if (!this.ok) return; const gl = this.gl!, prog = this.programs[key]; if (!prog) return;
    gl.useProgram(prog);
    const u = (n: string) => gl.getUniformLocation(prog, n);
    gl.uniform2f(u('uRes'), this.canvas.width, this.canvas.height);
    gl.uniform1f(u('uT'), tMs * 0.001);
    gl.uniform1f(u('uBass'), A.bass); gl.uniform1f(u('uMid'), A.mid); gl.uniform1f(u('uTreble'), A.treble);
    gl.uniform1f(u('uLevel'), A.level); gl.uniform1f(u('uBeat'), A.beat);
    gl.uniform1f(u('uSpeed'), P.speed); gl.uniform1f(u('uGlow'), P.glow);
    const c = pal.map(hexV);
    gl.uniform3fv(u('uC0'), c[0]); gl.uniform3fv(u('uC1'), c[1]); gl.uniform3fv(u('uC2'), c[2]); gl.uniform3fv(u('uC3'), c[3]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
