// transitionRenderer.ts — native two-input Forge transitions.
// The outgoing accumulator and incoming clip are sampled directly; this contract is
// intentionally separate from one-input effects so it can map cleanly to OFX later.

import { GL, RenderTarget, createFullscreenQuad, createProgram, makeTarget } from '../core/glUtil';

const VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv=aPos*.5+.5; gl_Position=vec4(aPos,0.,1.); }`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D uOutgoing, uIncoming;
uniform vec2 uResolution;
uniform float uProgress, uTime, P0, P1;
uniform int uKind;
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y); }
vec3 gammaMix(vec3 a,vec3 b,float t){ return pow(mix(pow(max(a,vec3(0.)),vec3(2.2)),pow(max(b,vec3(0.)),vec3(2.2)),t),vec3(1./2.2)); }
void main(){
  float p=clamp(uProgress,0.,1.); vec2 uv=vUv;
  vec4 a=texture(uOutgoing,uv), b=texture(uIncoming,uv); vec3 c;
  if(uKind==1){ // luma dissolve
    float l=dot(b.rgb,vec3(.2126,.7152,.0722)); float dir=sign(P1); float key=dir>0.?l:1.-l;
    float m=smoothstep(p-max(.001,P0),p+max(.001,P0),key); c=mix(b.rgb,a.rgb,m);
  } else if(uKind==2){ // organic light leak
    float ang=radians(P1); vec2 d=vec2(cos(ang),sin(ang)); float sweep=dot(uv-.5,d)+.5;
    float band=exp(-pow((sweep-p)*7.,2.))*P0; c=gammaMix(a.rgb,b.rgb,smoothstep(.05,.95,p)); c+=band*vec3(1.35,.42,.1);
  } else if(uKind==3){ // whip pan
    vec2 d=vec2(cos(radians(P0)),sin(radians(P0))); float travel=sin(p*3.14159265);
    vec2 ua=uv+d*p*.32, ub=uv-d*(1.-p)*.32; vec3 sa=vec3(0),sb=vec3(0); float taps=7.;
    for(float i=0.;i<7.;i++){ float q=(i/6.-.5)*travel*P1/900.; sa+=texture(uOutgoing,ua+d*q).rgb/taps; sb+=texture(uIncoming,ub+d*q).rgb/taps; }
    c=gammaMix(sa,sb,smoothstep(.15,.85,p));
  } else if(uKind==4){ // prism warp
    float k=sin(p*3.14159265)*P0*.12; vec2 q=(uv-.5)*(1.+k)+.5; float f=k*P1;
    vec3 pa=vec3(texture(uOutgoing,q+vec2(f,0)).r,texture(uOutgoing,q).g,texture(uOutgoing,q-vec2(f,0)).b);
    vec3 pb=vec3(texture(uIncoming,q-vec2(f,0)).r,texture(uIncoming,q).g,texture(uIncoming,q+vec2(f,0)).b); c=gammaMix(pa,pb,p);
  } else if(uKind==5){ // ink reveal
    float n=noise(uv*max(1.,P0))+noise(uv*max(2.,P0*2.1))*.45; float m=smoothstep(p-P1,p+P1,n/1.45); c=mix(b.rgb,a.rgb,m);
  } else if(uKind==6){ // glow dissolve
    c=gammaMix(a.rgb,b.rgb,p); float hi=smoothstep(P1,1.,max(max(c.r,c.g),c.b)); c+=hi*sin(p*3.14159265)*P0;
  } else if(uKind==7 || uKind==8){ // blur / bokeh dissolve
    float r=sin(p*3.14159265)*P0; vec3 aa=vec3(0),bb=vec3(0); float wa=0.,wb=0.;
    for(float i=0.;i<7.;i++){float an=i*0.8976;vec2 o=vec2(cos(an),sin(an))*r/uResolution;vec3 xa=texture(uOutgoing,uv+o).rgb,xb=texture(uIncoming,uv+o).rgb;float ka=uKind==8?1.+smoothstep(.65,1.,max(max(xa.r,xa.g),xa.b))*P1:1.;float kb=uKind==8?1.+smoothstep(.65,1.,max(max(xb.r,xb.g),xb.b))*P1:1.;aa+=xa*ka;bb+=xb*kb;wa+=ka;wb+=kb;}c=gammaMix(aa/wa,bb/wb,p);
  } else if(uKind==9){ // zoom pull
    float e=sin(p*3.14159265);vec2 qa=(uv-.5)*(1.+p*P0)+.5,qb=(uv-.5)*(1.-(1.-p)*P0)+.5;c=gammaMix(texture(uOutgoing,qa).rgb,texture(uIncoming,qb).rgb,smoothstep(.2,.8,p));c=mix(c,gammaMix(a.rgb,b.rgb,p),1.-P1*e);
  } else if(uKind==10){ // film roll
    vec2 d=vec2(0.,sign(P0));vec2 qa=fract(uv-d*p),qb=fract(uv+d*(1.-p));float seam=smoothstep(P1,0.,abs(fract(uv.y-p)-.5));c=gammaMix(texture(uOutgoing,qa).rgb,texture(uIncoming,qb).rgb,smoothstep(.45-P1,.55+P1,p));c*=1.-seam*.08;
  } else if(uKind==11){ // glitch cut
    vec2 cell=floor(uv*vec2(max(2.,P1),9.));float n=hash(cell+floor(p*18.));float off=(n-.5)*P0*sin(p*3.14159265);vec2 q=uv+vec2(off,0);c=gammaMix(texture(uOutgoing,q).rgb,texture(uIncoming,q).rgb,step(n,p));
  } else if(uKind==12){ // rgb split
    vec2 d=vec2(cos(radians(P1)),sin(radians(P1)))*P0*sin(p*3.14159265);vec3 aa=vec3(texture(uOutgoing,uv+d).r,a.g,texture(uOutgoing,uv-d).b);vec3 bb=vec3(texture(uIncoming,uv-d).r,b.g,texture(uIncoming,uv+d).b);c=gammaMix(aa,bb,p);
  } else if(uKind==13){ // burn / flash
    float sweep=uv.x*cos(radians(P1))+uv.y*sin(radians(P1));float band=exp(-pow((sweep-p)*8.,2.))*P0;c=gammaMix(a.rgb,b.rgb,smoothstep(.1,.9,p));c+=band*mix(vec3(1.5,.25,.02),vec3(1.),clamp(P0-1.,0.,1.));
  } else if(uKind==14){ // push slide
    vec2 d=vec2(cos(radians(P0)),sin(radians(P0)));vec2 qa=uv-d*p,qb=uv+d*(1.-p);vec3 ca=texture(uOutgoing,qa).rgb,cb=texture(uIncoming,qb).rgb;float inA=step(0.,qb.x)*step(qb.x,1.)*step(0.,qb.y)*step(qb.y,1.);c=mix(ca,cb,inA);
  } else if(uKind==15){ // shape wipe
    vec2 q=abs(uv-.5);float metric=mix(length(q),q.x+q.y,step(.5,P0));float edge=mix(.72,0.,p);float m=smoothstep(edge-P1,edge+P1,metric);c=mix(b.rgb,a.rgb,m);
  } else if(uKind==16){ // camera shake cut
    float e=sin(p*3.14159265);vec2 j=vec2(sin(p*P1*6.283),cos(p*P1*4.731))*P0*e;vec3 ca=texture(uOutgoing,uv+j).rgb,cb=texture(uIncoming,uv-j).rgb;c=gammaMix(ca,cb,smoothstep(.32,.68,p));
  } else { // gamma-aware film dissolve + exposure bloom
    float e=sin(p*3.14159265)*P1; c=gammaMix(a.rgb,b.rgb,smoothstep(0.,1.,p)); c+=e*max(c-vec3(.55),vec3(0.));
  }
  fragColor=vec4(c,mix(a.a,b.a,p));
}`;

export interface ForgeTransitionInput { id: string; progress: number; params?: Record<string, number>; time?: number; }

const KIND: Record<string, number> = { 'film-dissolve':0,'luma-dissolve':1,'light-leak':2,whip:3,'prism-warp':4,'ink-reveal':5,'glow-dissolve':6,'blur-dissolve':7,'bokeh-dissolve':8,'zoom-pull':9,'film-roll':10,'glitch-cut':11,'rgb-split':12,'burn-flash':13,'push-slide':14,'shape-wipe':15,'camera-shake':16 };
const DEFAULTS: Record<string, [number, number]> = {
  'film-dissolve': [.5, .08], 'luma-dissolve': [.12, 1], 'light-leak': [.8, 0],
  whip: [0, 80], 'prism-warp': [.6, .35], 'ink-reveal': [3, .16],
  'glow-dissolve':[.8,.55],'blur-dissolve':[34,.5],'bokeh-dissolve':[42,.8],
  'zoom-pull':[.28,.35],'film-roll':[1,.03],'glitch-cut':[.55,18],
  'rgb-split':[.04,0],'burn-flash':[1,0],'push-slide':[0,.02],
  'shape-wipe':[0,.06],'camera-shake':[.035,18],
};
const PARAM_KEYS: Record<string, [string, string]> = {
  'film-dissolve': ['softness','bloom'], 'luma-dissolve': ['softness','direction'],
  'light-leak': ['intensity','angle'], whip: ['angle','blur'],
  'prism-warp': ['amount','fringe'], 'ink-reveal': ['scale','edge'],
  'glow-dissolve':['glow','threshold'],'blur-dissolve':['radius','softness'],'bokeh-dissolve':['radius','highlights'],
  'zoom-pull':['amount','blur'],'film-roll':['direction','softness'],'glitch-cut':['amount','blocks'],
  'rgb-split':['amount','angle'],'burn-flash':['intensity','angle'],'push-slide':['angle','softness'],
  'shape-wipe':['shape','softness'],'camera-shake':['amount','frequency'],
};

export class ForgeTransitionRenderer {
  private quad: WebGLVertexArrayObject; private prog: WebGLProgram; private target?: RenderTarget;
  private u: Record<string, WebGLUniformLocation | null> = {};
  constructor(private gl: GL) {
    this.quad=createFullscreenQuad(gl); this.prog=createProgram(gl,VS,FS);
    for(const n of ['uOutgoing','uIncoming','uResolution','uProgress','uTime','uKind','P0','P1']) this.u[n]=gl.getUniformLocation(this.prog,n);
  }
  render(outgoing: WebGLTexture,incoming: WebGLTexture,w:number,h:number,t:ForgeTransitionInput){
    const gl=this.gl; this.target=makeTarget(gl,w,h,this.target); const d=DEFAULTS[t.id]||DEFAULTS['film-dissolve'];
    const keys=PARAM_KEYS[t.id]||PARAM_KEYS['film-dissolve'];
    const p0=t.params?.[keys[0]]??d[0],p1=t.params?.[keys[1]]??d[1];
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.target.fbo); gl.viewport(0,0,w,h); gl.disable(gl.BLEND); gl.useProgram(this.prog); gl.bindVertexArray(this.quad);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,outgoing); gl.uniform1i(this.u.uOutgoing,0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,incoming); gl.uniform1i(this.u.uIncoming,1);
    gl.uniform2f(this.u.uResolution,w,h); gl.uniform1f(this.u.uProgress,Math.max(0,Math.min(1,t.progress)));
    gl.uniform1f(this.u.uTime,t.time||0); gl.uniform1i(this.u.uKind,KIND[t.id]??0); gl.uniform1f(this.u.P0,p0); gl.uniform1f(this.u.P1,p1);
    gl.drawArrays(gl.TRIANGLES,0,3); gl.bindVertexArray(null); return this.target.tex;
  }
  dispose(){ this.gl.deleteProgram(this.prog); if(this.target){this.gl.deleteTexture(this.target.tex);this.gl.deleteFramebuffer(this.target.fbo);} }
}
