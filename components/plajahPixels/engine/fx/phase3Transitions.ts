// phase3Transitions.ts — the registry-driven transition catalog (Sapphire/Universe parity).
//
// The original 17 Forge transitions live in one mega-shader keyed by `uKind` with two params
// each. That does not scale, so new transitions are DATA: each declares up to four named
// params and its own GLSL body defining `vec4 tx(vec2 uv, float p)` where p is 0..1 progress,
// `outg(uv)` is the outgoing frame and `inc(uv)` the incoming one. ForgeTransitionRenderer
// compiles one program per id (cached) and falls back to the legacy shader for the old ids —
// so nothing that shipped changes, and the parameter list is the OFX ABI for later.
import type { FxParam, FxPreset } from './effects';

export interface TransitionDef {
  id: string; name: string;
  family: 'dissolve' | 'light' | 'motion' | 'graphic' | 'distort';
  description: string;
  params: FxParam[];          // ≤ 4; declaration order is the P0..P3 ABI
  presets: FxPreset[];
  glsl: string;               // defines vec4 tx(vec2 uv, float p)
}

/** Shared header for registry transitions (mirrors FX_HEADER's role for effects). */
export const TX_HEADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uOutgoing, uIncoming;
uniform vec2 uResolution;
uniform float uProgress, uTime, P0, P1, P2, P3;
vec4 outg(vec2 uv){ return texture(uOutgoing, clamp(uv, 0.0, 1.0)); }
vec4 inc(vec2 uv){ return texture(uIncoming, clamp(uv, 0.0, 1.0)); }
float inbox(vec2 uv){ return step(0.0,uv.x)*step(uv.x,1.0)*step(0.0,uv.y)*step(uv.y,1.0); }
float txh(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float txn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(txh(i),txh(i+vec2(1,0)),f.x),mix(txh(i+vec2(0,1)),txh(i+vec2(1,1)),f.x),f.y); }
float txfbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){ v+=a*txn(p); p=p*2.03+11.7; a*=0.5; } return v; }
vec3 gmix(vec3 a, vec3 b, float t){ return pow(mix(pow(max(a,vec3(0.)),vec3(2.2)),pow(max(b,vec3(0.)),vec3(2.2)),t),vec3(1.0/2.2)); }
vec2 rot2(vec2 p, float a){ float c=cos(a), s=sin(a); return vec2(c*p.x-s*p.y, s*p.x+c*p.y); }
float txluma(vec3 c){ return dot(c, vec3(.2126,.7152,.0722)); }
vec3 hsv2rgb(vec3 c){ vec4 K=vec4(1.,2./3.,1./3.,3.); vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www); return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y); }
float bayer(vec2 p){ int x=int(mod(p.x,4.0)), y=int(mod(p.y,4.0)); int idx=y*4+x; int m[16]; m[0]=0;m[1]=8;m[2]=2;m[3]=10;m[4]=12;m[5]=4;m[6]=14;m[7]=6;m[8]=3;m[9]=11;m[10]=1;m[11]=9;m[12]=15;m[13]=7;m[14]=13;m[15]=5; float v=0.0; for(int i=0;i<16;i++){ if(i==idx) v=float(m[i]); } return (v+0.5)/16.0; }
`;
export const TX_MAIN = `\nvoid main(){ fragColor = tx(vUv, clamp(uProgress, 0.0, 1.0)); }\n`;

const P = (key: string, label: string, min: number, max: number, def: number, step = .01, unit?: string): FxParam => ({ key, label, min, max, default: def, step, ...(unit ? { unit } : {}) });

export const PHASE3_TRANSITIONS: TransitionDef[] = [
  // ── wipes ────────────────────────────────────────────────────────────────────────────────
  {
    id: 'wipe-circle', name: 'Circle Wipe', family: 'graphic', description: 'Iris opens or closes from a point you can place anywhere in frame.',
    params: [P('softness', 'Softness', .001, .5, .06), P('cx', 'Centre X', 0, 1, .5, .005), P('cy', 'Centre Y', 0, 1, .5, .005), P('invert', 'Close instead of open', 0, 1, 0, 1)],
    presets: [
      { id: 'iris-open', name: 'Iris Open', description: 'Classic circular reveal from the centre.', params: { softness: .06, cx: .5, cy: .5, invert: 0 } },
      { id: 'iris-close', name: 'Iris Close', description: 'The outgoing shot collapses to a point.', params: { softness: .04, cx: .5, cy: .5, invert: 1 } },
      { id: 'corner-iris', name: 'Corner Iris', description: 'Opens from the lower left.', params: { softness: .12, cx: .2, cy: .8, invert: 0 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ float asp=uResolution.x/uResolution.y; float d=length((uv-vec2(P1,P2))*vec2(asp,1.0)); float maxr=length(vec2(asp,1.0)); float e=(P3>0.5?1.0-p:p)*maxr*1.05; float m=smoothstep(e-P0*maxr,e+P0*maxr,d); vec3 c=P3>0.5?mix(inc(uv).rgb,outg(uv).rgb,1.0-m):mix(inc(uv).rgb,outg(uv).rgb,m); return vec4(c,1.0); }`,
  },
  {
    id: 'wipe-clock', name: 'Clock Wipe', family: 'graphic', description: 'Radial sweep around the centre, clockwise or counter-clockwise.',
    params: [P('start', 'Start Angle', -180, 180, -90, 1, 'deg'), P('softness', 'Softness', .001, .3, .02), P('ccw', 'Counter-clockwise', 0, 1, 0, 1), P('cx', 'Centre X', 0, 1, .5, .005)],
    presets: [
      { id: 'top', name: 'From Top', description: 'Sweeps clockwise from twelve o\'clock.', params: { start: -90, softness: .02, ccw: 0, cx: .5 } },
      { id: 'ccw', name: 'Counter-clockwise', description: 'Sweeps the other way.', params: { start: -90, softness: .02, ccw: 1, cx: .5 } },
      { id: 'soft', name: 'Soft Sweep', description: 'Wide feathered edge.', params: { start: 0, softness: .18, ccw: 0, cx: .5 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ vec2 d=uv-vec2(P3,0.5); float a=atan(d.y,d.x)-radians(P0); if(P2>0.5) a=-a; float t=fract(a/6.28318+1.0); float m=smoothstep(p-P1,p+P1,t); return vec4(mix(inc(uv).rgb,outg(uv).rgb,m),1.0); }`,
  },
  {
    id: 'wipe-star', name: 'Star Wipe', family: 'graphic', description: 'A star or polygon grows to reveal the incoming shot.',
    params: [P('points', 'Points', 3, 12, 5, 1), P('softness', 'Softness', .001, .3, .03), P('rotate', 'Rotation', -180, 180, 0, 1, 'deg'), P('sharp', 'Sharpness', 0, 1, .6)],
    presets: [
      { id: 'five-star', name: 'Five-point Star', description: 'The Saturday-morning star wipe.', params: { points: 5, softness: .03, rotate: 0, sharp: .7 } },
      { id: 'hexagon', name: 'Hexagon', description: 'A soft six-sided polygon.', params: { points: 6, softness: .08, rotate: 0, sharp: 0 } },
      { id: 'spin-star', name: 'Spinning Star', description: 'Rotated eight-point burst.', params: { points: 8, softness: .04, rotate: 22, sharp: .85 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ float asp=uResolution.x/uResolution.y; vec2 q=(uv-0.5)*vec2(asp,1.0); float a=atan(q.y,q.x)+radians(P2); float n=max(3.0,floor(P0+0.5)); float star=mix(1.0,0.55+0.45*cos(a*n),P3); float r=length(q)/max(star,1e-3); float e=p*length(vec2(asp,1.0))*1.15; float m=smoothstep(e-P1,e+P1,r); return vec4(mix(inc(uv).rgb,outg(uv).rgb,m),1.0); }`,
  },
  {
    id: 'wipe-checker', name: 'Checker Wipe', family: 'graphic', description: 'A checkerboard of tiles flips to the incoming shot in a staggered order.',
    params: [P('columns', 'Columns', 2, 32, 8, 1), P('rows', 'Rows', 2, 32, 5, 1), P('stagger', 'Stagger', 0, 1, .6), P('softness', 'Softness', 0, .5, .05)],
    presets: [
      { id: 'classic', name: 'Classic Checker', description: 'Alternating tiles arrive first.', params: { columns: 8, rows: 5, stagger: .6, softness: .05 } },
      { id: 'fine-grid', name: 'Fine Grid', description: 'Many small tiles, near-simultaneous.', params: { columns: 24, rows: 14, stagger: .25, softness: .1 } },
      { id: 'big-blocks', name: 'Big Blocks', description: 'Few large tiles with a long stagger.', params: { columns: 4, rows: 3, stagger: 1, softness: 0 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ vec2 n=vec2(max(2.0,floor(P0+0.5)),max(2.0,floor(P1+0.5))); vec2 id=floor(uv*n); float order=mod(id.x+id.y,2.0)*0.5+txh(id)*0.5; float local=clamp((p*(1.0+P2)-order*P2),0.0,1.0); float m=smoothstep(local-P3*0.5-0.001,local+P3*0.5+0.001,0.5); return vec4(mix(inc(uv).rgb,outg(uv).rgb,m),1.0); }`,
  },
  {
    id: 'wipe-stripes', name: 'Stripes Wipe', family: 'graphic', description: 'Parallel stripes sweep in, optionally from alternating sides.',
    params: [P('count', 'Stripes', 2, 40, 10, 1), P('angle', 'Angle', -90, 90, 0, 1, 'deg'), P('alternate', 'Alternate Direction', 0, 1, 1, 1), P('softness', 'Softness', 0, .5, .04)],
    presets: [
      { id: 'venetian', name: 'Venetian', description: 'Horizontal blinds closing.', params: { count: 12, angle: 90, alternate: 0, softness: .04 } },
      { id: 'weave', name: 'Weave', description: 'Vertical stripes from alternating sides.', params: { count: 14, angle: 0, alternate: 1, softness: .03 } },
      { id: 'broad', name: 'Broad Bands', description: 'Four wide soft bands.', params: { count: 4, angle: 25, alternate: 1, softness: .3 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ vec2 d=vec2(cos(radians(P1)),sin(radians(P1))); vec2 perp=vec2(-d.y,d.x); float band=dot(uv-0.5,perp)+0.5; float n=max(2.0,floor(P0+0.5)); float id=floor(band*n); float along=dot(uv-0.5,d)+0.5; float dir=(P2>0.5&&mod(id,2.0)>0.5)?1.0-along:along; float m=smoothstep(p-P3*0.5-0.001,p+P3*0.5+0.001,dir); return vec4(mix(inc(uv).rgb,outg(uv).rgb,m),1.0); }`,
  },
  {
    id: 'wipe-dots', name: 'Dots Wipe', family: 'graphic', description: 'A grid of dots grows until it fills the frame with the incoming shot.',
    params: [P('density', 'Density', 4, 60, 18, 1), P('softness', 'Softness', 0, 1, .3), P('stagger', 'Stagger', 0, 1, .5), P('square', 'Square Dots', 0, 1, 0, 1)],
    presets: [
      { id: 'halftone', name: 'Halftone', description: 'Dense dots, gentle stagger.', params: { density: 28, softness: .25, stagger: .4, square: 0 } },
      { id: 'chunky', name: 'Chunky', description: 'Large staggered dots.', params: { density: 9, softness: .4, stagger: .8, square: 0 } },
      { id: 'pixels', name: 'Pixel Grid', description: 'Square cells filling in.', params: { density: 22, softness: 0, stagger: .6, square: 1 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ float asp=uResolution.x/uResolution.y; vec2 g=vec2(uv.x*asp,uv.y)*P0; vec2 id=floor(g); vec2 f=fract(g)-0.5; float order=txh(id)*P2; float local=clamp(p*(1.0+P2)-order,0.0,1.0); float r=P3>0.5?max(abs(f.x),abs(f.y)):length(f); float e=local*0.72; float m=smoothstep(e-P1*0.35-0.001,e+P1*0.35+0.001,r); return vec4(mix(inc(uv).rgb,outg(uv).rgb,m),1.0); }`,
  },
  {
    id: 'wipe-cells', name: 'Cells Wipe', family: 'graphic', description: 'Organic Voronoi cells pop in one after another.',
    params: [P('scale', 'Cell Scale', 2, 40, 10, 1), P('softness', 'Softness', 0, .5, .05), P('stagger', 'Stagger', 0, 1, .8), P('jitter', 'Irregularity', 0, 1, .8)],
    presets: [
      { id: 'shatter', name: 'Shatter', description: 'Irregular cells appearing in a random order.', params: { scale: 10, softness: .04, stagger: .9, jitter: .9 } },
      { id: 'honeycomb', name: 'Honeycomb', description: 'Regular cells, short stagger.', params: { scale: 16, softness: .08, stagger: .35, jitter: .15 } },
      { id: 'slow-melt', name: 'Slow Melt', description: 'Few big soft cells.', params: { scale: 5, softness: .2, stagger: 1, jitter: 1 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ float asp=uResolution.x/uResolution.y; vec2 g=vec2(uv.x*asp,uv.y)*P0; vec2 id=floor(g); float best=9.0; vec2 bid=id; for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){ vec2 c=id+vec2(float(i),float(j)); vec2 o=vec2(txh(c),txh(c+7.3))*P3; float d=length(g-(c+0.5+(o-0.5*P3))); if(d<best){ best=d; bid=c; } } float order=txh(bid*1.7)*P2; float local=clamp(p*(1.0+P2)-order,0.0,1.0); float m=smoothstep(local-P1-0.001,local+P1+0.001,0.5); return vec4(mix(inc(uv).rgb,outg(uv).rgb,m),1.0); }`,
  },
  {
    id: 'wipe-pixelate', name: 'Pixelate Wipe', family: 'graphic', description: 'Both shots dissolve into blocks at the midpoint and resolve again.',
    params: [P('blocks', 'Max Block Size', 4, 160, 48, 1, 'px'), P('sharpness', 'Snap', 0, 1, .5), P('dither', 'Dither', 0, 1, 0), P('mono', 'Desaturate', 0, 1, 0)],
    presets: [
      { id: 'digital', name: 'Digital', description: 'Chunky blocks at the cut.', params: { blocks: 48, sharpness: .5, dither: 0, mono: 0 } },
      { id: 'lo-fi', name: 'Lo-Fi', description: 'Huge blocks with dithering.', params: { blocks: 120, sharpness: .7, dither: .8, mono: .4 } },
      { id: 'subtle', name: 'Subtle', description: 'Small blocks, quick resolve.', params: { blocks: 14, sharpness: .3, dither: 0, mono: 0 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ float e=sin(p*3.14159265); float sz=max(1.0,P0*pow(e,mix(1.0,2.5,P1))); vec2 cell=sz/uResolution; vec2 q=(floor(uv/cell)+0.5)*cell; vec3 a=outg(q).rgb, b=inc(q).rgb; float t=smoothstep(0.35,0.65,p); if(P2>0.0) t=clamp(t+(bayer(floor(uv*uResolution/max(1.0,sz)))-0.5)*P2,0.0,1.0); vec3 c=gmix(a,b,t); c=mix(c,vec3(txluma(c)),P3*e); return vec4(c,1.0); }`,
  },
  {
    id: 'wipe-wedge', name: 'Wedge Wipe', family: 'graphic', description: 'Two wedges open from the centre like a book.',
    params: [P('wedges', 'Wedges', 1, 8, 2, 1), P('softness', 'Softness', .001, .3, .02), P('rotate', 'Rotation', -180, 180, 0, 1, 'deg'), P('invert', 'Close instead of open', 0, 1, 0, 1)],
    presets: [
      { id: 'double', name: 'Double Wedge', description: 'Opens left and right from centre.', params: { wedges: 2, softness: .02, rotate: 0, invert: 0 } },
      { id: 'four-way', name: 'Four Wedges', description: 'Opens in four directions.', params: { wedges: 4, softness: .03, rotate: 45, invert: 0 } },
      { id: 'closing', name: 'Closing Wedge', description: 'The outgoing shot is squeezed out.', params: { wedges: 2, softness: .02, rotate: 90, invert: 1 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ vec2 d=uv-0.5; float a=atan(d.y,d.x)-radians(P2); float n=max(1.0,floor(P0+0.5)); float seg=6.28318/n; float t=abs(mod(a,seg)/seg-0.5)*2.0; if(P3>0.5) t=1.0-t; float m=smoothstep(p-P1,p+P1,t); return vec4(mix(inc(uv).rgb,outg(uv).rgb,m),1.0); }`,
  },
  // ── dissolves ────────────────────────────────────────────────────────────────────────────
  {
    id: 'dissolve-static', name: 'Static Dissolve', family: 'dissolve', description: 'Analogue snow swallows the outgoing shot and clears to the incoming one.',
    params: [P('amount', 'Static', 0, 2, 1), P('mono', 'Monochrome', 0, 1, .7), P('scale', 'Grain Size', .5, 8, 1.5, .1, 'px'), P('roll', 'Roll', 0, 1, .3)],
    presets: [
      { id: 'tv-snow', name: 'TV Snow', description: 'Full analogue static at the cut.', params: { amount: 1.2, mono: .9, scale: 1.5, roll: .3 } },
      { id: 'colour-noise', name: 'Colour Noise', description: 'RGB sparkle instead of grey snow.', params: { amount: 1, mono: 0, scale: 2, roll: 0 } },
      { id: 'whisper', name: 'Whisper', description: 'Just a hint of noise through the dissolve.', params: { amount: .35, mono: .8, scale: 1, roll: .1 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ float e=sin(p*3.14159265); vec2 g=floor(uv*uResolution/max(.5,P2))+floor(uTime*60.0); float nr=txh(g), ng=txh(g+13.7), nb=txh(g+29.1); vec3 n=mix(vec3(nr,ng,nb),vec3(nr),P1); vec2 q=uv+vec2(0.0,(txh(vec2(floor(uTime*24.0),1.0))-0.5)*P3*0.06*e); vec3 c=gmix(outg(q).rgb,inc(q).rgb,smoothstep(0.2,0.8,p)); return vec4(mix(c,n,clamp(e*P0,0.0,1.0)),1.0); }`,
  },
  {
    id: 'dissolve-tiles', name: 'Tile Dissolve', family: 'dissolve', description: 'The frame breaks into tiles that fade and drift out of order.',
    params: [P('columns', 'Columns', 2, 40, 12, 1), P('rows', 'Rows', 2, 40, 7, 1), P('drift', 'Drift', 0, 1, .4), P('stagger', 'Stagger', 0, 1, .7)],
    presets: [
      { id: 'grid-fade', name: 'Grid Fade', description: 'Tiles fade in a scattered order.', params: { columns: 12, rows: 7, drift: 0, stagger: .8 } },
      { id: 'scatter', name: 'Scatter', description: 'Tiles drift apart as they change.', params: { columns: 10, rows: 6, drift: .7, stagger: .6 } },
      { id: 'mosaic-swap', name: 'Mosaic Swap', description: 'Many small tiles, quick handover.', params: { columns: 28, rows: 16, drift: .2, stagger: .35 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ vec2 n=vec2(max(2.0,floor(P0+0.5)),max(2.0,floor(P1+0.5))); vec2 id=floor(uv*n); float order=txh(id)*P3; float local=clamp(p*(1.0+P3)-order,0.0,1.0); vec2 dir=(vec2(txh(id+3.1),txh(id+9.7))-0.5)*P2*0.25; vec3 a=outg(uv+dir*local).rgb, b=inc(uv-dir*(1.0-local)).rgb; return vec4(gmix(a,b,smoothstep(0.0,1.0,local)),1.0); }`,
  },
  {
    id: 'dissolve-vortex', name: 'Vortex Dissolve', family: 'distort', description: 'Both shots spiral through the cut and unwind into place.',
    params: [P('twist', 'Twist', 0, 12, 4, .1), P('zoom', 'Zoom', 0, 1, .3), P('blur', 'Smear', 0, 40, 12, 1, 'px'), P('cx', 'Centre X', 0, 1, .5, .005)],
    presets: [
      { id: 'whirl', name: 'Whirl', description: 'A firm spiral both ways.', params: { twist: 4, zoom: .3, blur: 12, cx: .5 } },
      { id: 'drain', name: 'Drain', description: 'Deep twist with heavy smear.', params: { twist: 9, zoom: .55, blur: 32, cx: .5 } },
      { id: 'gentle-turn', name: 'Gentle Turn', description: 'Barely a quarter turn.', params: { twist: 1.2, zoom: .12, blur: 4, cx: .5 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ float asp=uResolution.x/uResolution.y; float e=sin(p*3.14159265); vec2 ctr=vec2(P3,0.5); vec2 q=(uv-ctr)*vec2(asp,1.0); float r=length(q); float tw=P0*e*(1.0-smoothstep(0.0,0.9,r)); vec2 qa=rot2(q,tw)*(1.0+P1*e), qb=rot2(q,-tw)*(1.0-P1*e*0.6); vec3 sa=vec3(0.0), sb=vec3(0.0); for(int i=0;i<5;i++){ float k=(float(i)/4.0-0.5)*P2/uResolution.y*e; sa+=outg(rot2(qa,k*6.0)/vec2(asp,1.0)+ctr).rgb/5.0; sb+=inc(rot2(qb,k*6.0)/vec2(asp,1.0)+ctr).rgb/5.0; } return vec4(gmix(sa,sb,smoothstep(0.25,0.75,p)),1.0); }`,
  },
  {
    id: 'dissolve-waves', name: 'Wave Dissolve', family: 'distort', description: 'A travelling ripple carries the incoming shot across the frame.',
    params: [P('amplitude', 'Amplitude', 0, 60, 18, 1, 'px'), P('frequency', 'Frequency', 1, 30, 8, .5), P('angle', 'Direction', -180, 180, 0, 1, 'deg'), P('softness', 'Edge Softness', .01, .6, .18)],
    presets: [
      { id: 'ocean', name: 'Ocean', description: 'Long slow swells.', params: { amplitude: 26, frequency: 4, angle: 0, softness: .28 } },
      { id: 'ripple', name: 'Ripple', description: 'Tight fast ripples.', params: { amplitude: 12, frequency: 18, angle: 90, softness: .12 } },
      { id: 'heat', name: 'Heat Shimmer', description: 'Fine vertical shimmer.', params: { amplitude: 8, frequency: 24, angle: 90, softness: .4 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ float e=sin(p*3.14159265); vec2 d=vec2(cos(radians(P2)),sin(radians(P2))); vec2 perp=vec2(-d.y,d.x); float along=dot(uv-0.5,d)+0.5; float w=sin((dot(uv-0.5,perp)+0.5)*P1*6.28318+p*6.28318)*P0/uResolution.y*e; vec2 q=uv+perp*w; float m=smoothstep(p-P3,p+P3,along+w*2.0); return vec4(mix(inc(q).rgb,outg(q).rgb,m),1.0); }`,
  },
  {
    id: 'dissolve-puddle', name: 'Puddle Dissolve', family: 'distort', description: 'Concentric ripples spread from a point and leave the incoming shot behind.',
    params: [P('rings', 'Rings', 1, 20, 7, .5), P('amplitude', 'Amplitude', 0, 60, 20, 1, 'px'), P('cx', 'Centre X', 0, 1, .5, .005), P('cy', 'Centre Y', 0, 1, .5, .005)],
    presets: [
      { id: 'drop', name: 'Raindrop', description: 'A single drop spreading from the centre.', params: { rings: 7, amplitude: 20, cx: .5, cy: .5 } },
      { id: 'pond', name: 'Pond', description: 'Many soft rings from low left.', params: { rings: 14, amplitude: 12, cx: .25, cy: .75 } },
      { id: 'shockwave', name: 'Shockwave', description: 'Few rings, big displacement.', params: { rings: 3, amplitude: 52, cx: .5, cy: .5 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ float asp=uResolution.x/uResolution.y; vec2 ctr=vec2(P2,P3); vec2 q=(uv-ctr)*vec2(asp,1.0); float r=length(q); float front=p*1.5; float ring=sin((r-front)*P0*6.28318)*exp(-abs(r-front)*4.0)*sin(p*3.14159265); vec2 disp=normalize(q+1e-5)*ring*P1/uResolution.y; float m=smoothstep(front-0.12,front+0.12,r); vec3 c=mix(inc(uv+disp).rgb,outg(uv+disp).rgb,m); return vec4(c,1.0); }`,
  },
  {
    id: 'dissolve-flash', name: 'Flashbulb Dissolve', family: 'light', description: 'Press photographers: bulbs pop across the cut and the new shot is there.',
    params: [P('pops', 'Flashes', 1, 12, 4, 1), P('intensity', 'Intensity', 0, 3, 1.4), P('size', 'Bloom Size', .05, 1, .35), P('warm', 'Warmth', -1, 1, .1)],
    presets: [
      { id: 'press', name: 'Press Call', description: 'Four bright pops.', params: { pops: 4, intensity: 1.4, size: .35, warm: .1 } },
      { id: 'storm', name: 'Flash Storm', description: 'A dozen rapid bulbs.', params: { pops: 11, intensity: 1.1, size: .22, warm: 0 } },
      { id: 'single', name: 'Single Bulb', description: 'One big flash at the midpoint.', params: { pops: 1, intensity: 2.2, size: .7, warm: .25 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ float asp=uResolution.x/uResolution.y; vec3 c=gmix(outg(uv).rgb,inc(uv).rgb,smoothstep(0.25,0.75,p)); float n=max(1.0,floor(P0+0.5)); float acc=0.0; for(int i=0;i<12;i++){ if(float(i)>=n) break; float fi=float(i); float t0=(fi+0.5)/n; float w=exp(-pow((p-t0)*14.0,2.0)); vec2 pos=vec2(txh(vec2(fi,1.7)),txh(vec2(fi,4.3))); float d=length((uv-pos)*vec2(asp,1.0))/P2; acc+=w*exp(-d*d*2.5); } vec3 tint=mix(vec3(0.85,0.92,1.0),vec3(1.0,0.9,0.72),clamp(P3*0.5+0.5,0.0,1.0)); return vec4(c+tint*acc*P1,1.0); }`,
  },
  {
    id: 'dissolve-diffuse', name: 'Diffuse Dissolve', family: 'dissolve', description: 'Pixels scatter randomly across the cut, like sand blowing away.',
    params: [P('scatter', 'Scatter', 0, 80, 26, 1, 'px'), P('grain', 'Grain', .5, 12, 2, .1, 'px'), P('order', 'Randomness', 0, 1, .7), P('softness', 'Softness', 0, .5, .12)],
    presets: [
      { id: 'sand', name: 'Sand', description: 'Fine grains blowing across.', params: { scatter: 26, grain: 2, order: .7, softness: .12 } },
      { id: 'ash', name: 'Ash', description: 'Coarse flakes with a long tail.', params: { scatter: 60, grain: 5, order: 1, softness: .25 } },
      { id: 'fizz', name: 'Fizz', description: 'Tight scatter, quick handover.', params: { scatter: 10, grain: 1, order: .35, softness: .06 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ float e=sin(p*3.14159265); vec2 g=floor(uv*uResolution/max(.5,P1)); vec2 dir=(vec2(txh(g),txh(g+5.1))-0.5)*2.0; vec2 q=uv+dir*P0/uResolution*e; float order=txh(g+2.3)*P2; float local=clamp(p*(1.0+P2)-order,0.0,1.0); float m=smoothstep(0.5-P3,0.5+P3,local); return vec4(mix(outg(q).rgb,inc(q).rgb,m),1.0); }`,
  },
  {
    id: 'dissolve-dither', name: 'Dither Dissolve', family: 'graphic', description: 'An ordered Bayer pattern hands the frame over, pixel by pixel.',
    params: [P('pixel', 'Pixel Size', 1, 16, 3, 1, 'px'), P('softness', 'Softness', 0, .5, .05), P('posterize', 'Posterize', 0, 1, 0), P('mono', 'Monochrome', 0, 1, 0)],
    presets: [
      { id: 'retro', name: 'Retro', description: 'Chunky ordered dither.', params: { pixel: 4, softness: .05, posterize: .6, mono: 0 } },
      { id: 'fine', name: 'Fine Dither', description: 'Almost a clean dissolve up close.', params: { pixel: 1, softness: .02, posterize: 0, mono: 0 } },
      { id: 'gameboy', name: 'Handheld', description: 'Monochrome posterised handover.', params: { pixel: 5, softness: 0, posterize: 1, mono: 1 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ vec2 g=floor(uv*uResolution/max(1.0,P0)); float th=bayer(g); float m=smoothstep(th-P1-0.001,th+P1+0.001,p); vec3 a=outg(uv).rgb, b=inc(uv).rgb; vec3 c=mix(a,b,m); if(P2>0.0){ float lv=mix(64.0,4.0,P2); c=floor(c*lv+0.5)/lv; } c=mix(c,vec3(txluma(c)),P3); return vec4(c,1.0); }`,
  },
  // ── motion / 3D ──────────────────────────────────────────────────────────────────────────
  {
    id: 'cube-turn', name: 'Cube Turn', family: 'motion', description: 'The frame is a cube face that rotates away to show the next shot.',
    params: [P('axis', 'Axis (0 vertical · 1 horizontal)', 0, 1, 0, 1), P('perspective', 'Perspective', 0, 1, .55), P('shade', 'Edge Shading', 0, 1, .55), P('reverse', 'Reverse', 0, 1, 0, 1)],
    presets: [
      { id: 'left', name: 'Turn Left', description: 'Rotates around the vertical axis.', params: { axis: 0, perspective: .55, shade: .55, reverse: 0 } },
      { id: 'up', name: 'Tumble Up', description: 'Rotates around the horizontal axis.', params: { axis: 1, perspective: .6, shade: .6, reverse: 0 } },
      { id: 'flat', name: 'Flat Turn', description: 'Little perspective, gentle shading.', params: { axis: 0, perspective: .15, shade: .25, reverse: 1 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ float dir=P3>0.5?-1.0:1.0; vec2 q=P0>0.5?uv.yx:uv; float ang=p*1.5707963*dir; float ca=cos(ang), sa=sin(ang); float persp=1.0+P1; bool second=p>0.5; float a2=second?(p-1.0)*1.5707963*dir:ang; float c2=cos(a2), s2=sin(a2); float x=(q.x-0.5); float denom=persp - x*s2*P1*2.0; if(abs(denom)<1e-4) return vec4(0.0); float sx=x*persp/denom+0.5; float sy=(q.y-0.5)*persp/denom+0.5; vec2 suv=P0>0.5?vec2(sy,sx):vec2(sx,sy); if(inbox(suv)<0.5) return vec4(gmix(outg(uv).rgb,inc(uv).rgb,p),1.0); vec3 c=second?inc(suv).rgb:outg(suv).rgb; float facing=abs(cos(a2)); c*=mix(1.0,0.35+0.65*facing,P2); return vec4(c,1.0); }`,
  },
  {
    id: 'fold-turn', name: 'Fold', family: 'motion', description: 'The outgoing shot folds away like paper and the incoming one unfolds behind it.',
    params: [P('panels', 'Panels', 2, 12, 4, 1), P('axis', 'Axis (0 vertical · 1 horizontal)', 0, 1, 0, 1), P('shade', 'Crease Shading', 0, 1, .6), P('gap', 'Gap', 0, .2, .01, .005)],
    presets: [
      { id: 'concertina', name: 'Concertina', description: 'Four vertical panels folding.', params: { panels: 4, axis: 0, shade: .6, gap: .01 } },
      { id: 'blinds', name: 'Blinds', description: 'Eight horizontal panels.', params: { panels: 8, axis: 1, shade: .7, gap: .004 } },
      { id: 'book', name: 'Book', description: 'Two big panels, deep crease.', params: { panels: 2, axis: 0, shade: .85, gap: .02 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ vec2 q=P1>0.5?uv.yx:uv; float n=max(2.0,floor(P0+0.5)); float id=floor(q.x*n); float f=fract(q.x*n); float squeeze=max(0.001,1.0-p); float fa=clamp((f-0.5)/squeeze+0.5,0.0,1.0); float fb=clamp((f-0.5)/max(0.001,p)+0.5,0.0,1.0); vec2 ua=P1>0.5?vec2(q.y,(id+fa)/n):vec2((id+fa)/n,q.y); vec2 ub=P1>0.5?vec2(q.y,(id+fb)/n):vec2((id+fb)/n,q.y); float e=sin(p*3.14159265); float crease=abs(f-0.5)*2.0; float shade=mix(1.0,1.0-crease*0.55*e,P2); float gap=step(1.0-P3*4.0,crease)*e; vec3 c=p<0.5?outg(ua).rgb*shade:inc(ub).rgb*shade; c=mix(c,vec3(0.02),gap*P2); return vec4(c,1.0); }`,
  },
  {
    id: 'stretch-cut', name: 'Stretch', family: 'motion', description: 'The frame smears sideways, snaps, and lands on the next shot.',
    params: [P('stretch', 'Stretch', 0, 1, .6), P('angle', 'Direction', -180, 180, 0, 1, 'deg'), P('blur', 'Smear', 0, 120, 45, 1, 'px'), P('exposure', 'Exposure Kick', 0, 2, .5)],
    presets: [
      { id: 'snap', name: 'Snap', description: 'Fast horizontal stretch.', params: { stretch: .6, angle: 0, blur: 45, exposure: .5 } },
      { id: 'vertical-pull', name: 'Vertical Pull', description: 'Stretches up through the cut.', params: { stretch: .8, angle: 90, blur: 70, exposure: .3 } },
      { id: 'whip', name: 'Whip', description: 'Extreme smear and a bright kick.', params: { stretch: 1, angle: -12, blur: 110, exposure: 1.2 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ float e=sin(p*3.14159265); vec2 d=vec2(cos(radians(P1)),sin(radians(P1))); vec2 q=uv-0.5; float s=1.0+P0*e*2.0; vec2 qa=q/vec2(mix(1.0,s,abs(d.x)),mix(1.0,s,abs(d.y)))+0.5; vec3 sa=vec3(0.0), sb=vec3(0.0); for(int i=0;i<7;i++){ float k=(float(i)/6.0-0.5)*P2*e/uResolution.x; sa+=outg(qa+d*k).rgb/7.0; sb+=inc(qa-d*k).rgb/7.0; } vec3 c=gmix(sa,sb,smoothstep(0.35,0.65,p)); return vec4(c+e*P3*max(c-0.6,vec3(0.0)),1.0); }`,
  },
  {
    id: 'dolly-fade', name: 'Dolly Fade', family: 'motion', description: 'A gentle push through the cut: the outgoing shot recedes, the incoming one settles.',
    params: [P('amount', 'Push', 0, 1, .3), P('direction', 'Direction (0 in · 1 out)', 0, 1, 0, 1), P('blur', 'Defocus', 0, 40, 8, 1, 'px'), P('ease', 'Ease', 0, 1, .6)],
    presets: [
      { id: 'push-in', name: 'Push In', description: 'Moves toward the subject.', params: { amount: .3, direction: 0, blur: 8, ease: .6 } },
      { id: 'pull-out', name: 'Pull Out', description: 'Falls back into the next shot.', params: { amount: .35, direction: 1, blur: 10, ease: .6 } },
      { id: 'hard-push', name: 'Hard Push', description: 'Strong dolly with defocus.', params: { amount: .7, direction: 0, blur: 26, ease: .35 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ float t=mix(p,smoothstep(0.0,1.0,p),P3); float e=sin(p*3.14159265); float dir=P1>0.5?-1.0:1.0; vec2 qa=(uv-0.5)*(1.0+P0*t*dir)+0.5; vec2 qb=(uv-0.5)*(1.0-P0*(1.0-t)*dir)+0.5; vec3 sa=vec3(0.0), sb=vec3(0.0); for(int i=0;i<5;i++){ float an=float(i)*1.2566; vec2 o=vec2(cos(an),sin(an))*P2*e/uResolution; sa+=outg(qa+o).rgb/5.0; sb+=inc(qb+o).rgb/5.0; } return vec4(gmix(sa,sb,t),1.0); }`,
  },
  {
    id: 'channel-surf', name: 'Channel Surf', family: 'graphic', description: 'A CRT channel change: the picture rolls, tears into static, and locks onto the next shot.',
    params: [P('noise', 'Static', 0, 2, 1), P('roll', 'Roll', 0, 2, .8), P('skew', 'Tearing', 0, 1, .5), P('scanlines', 'Scanlines', 0, 1, .4)],
    presets: [
      { id: 'vhs-flip', name: 'VHS Flip', description: 'Roll, tear and snow.', params: { noise: 1, roll: .8, skew: .5, scanlines: .4 } },
      { id: 'quick-zap', name: 'Quick Zap', description: 'Short, sharp channel change.', params: { noise: .7, roll: 1.6, skew: .3, scanlines: .2 } },
      { id: 'dead-air', name: 'Dead Air', description: 'Heavy snow, slow lock.', params: { noise: 2, roll: .4, skew: 1, scanlines: .7 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ float e=sin(p*3.14159265); float roll=fract(uv.y+e*P1*2.0); vec2 q=vec2(uv.x+(txh(vec2(floor(roll*80.0),floor(uTime*30.0)))-0.5)*P2*0.12*e, roll); vec3 c=gmix(outg(q).rgb,inc(q).rgb,smoothstep(0.35,0.65,p)); vec2 g=floor(uv*uResolution/1.5)+floor(uTime*60.0); float n=txh(g); c=mix(c,vec3(n),clamp(e*P0,0.0,1.0)); float sl=0.5+0.5*sin(uv.y*uResolution.y*3.14159); c*=mix(1.0,0.75+0.25*sl,P3*e); return vec4(c,1.0); }`,
  },
  {
    id: 'exposure-blur', name: 'Exposure Blur', family: 'light', description: 'The cut blooms: exposure lifts and the picture defocuses, then resolves on the new shot.',
    params: [P('exposure', 'Exposure', 0, 3, 1.1), P('blur', 'Blur', 0, 120, 40, 1, 'px'), P('zoom', 'Zoom Blur', 0, 1, .35), P('tint', 'Warmth', -1, 1, .15)],
    presets: [
      { id: 'bloom', name: 'Bloom', description: 'Warm exposure bloom through the cut.', params: { exposure: 1.1, blur: 40, zoom: .35, tint: .15 } },
      { id: 'white-out', name: 'White Out', description: 'Blows almost to white at the midpoint.', params: { exposure: 2.6, blur: 70, zoom: .5, tint: 0 } },
      { id: 'cool-haze', name: 'Cool Haze', description: 'Soft cool defocus.', params: { exposure: .5, blur: 60, zoom: .2, tint: -.5 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ float e=sin(p*3.14159265); vec3 sa=vec3(0.0), sb=vec3(0.0); for(int i=0;i<9;i++){ float an=float(i)*0.698; vec2 o=vec2(cos(an),sin(an))*P1*e/uResolution; float z=1.0+P2*e*(float(i)/8.0)*0.12; vec2 qa=(uv-0.5)*z+0.5+o, qb=(uv-0.5)/z+0.5+o; sa+=outg(qa).rgb/9.0; sb+=inc(qb).rgb/9.0; } vec3 c=gmix(sa,sb,smoothstep(0.3,0.7,p)); vec3 tint=mix(vec3(0.8,0.9,1.1),vec3(1.1,0.95,0.8),clamp(P3*0.5+0.5,0.0,1.0)); return vec4(c*(1.0+P0*e)*mix(vec3(1.0),tint,abs(P3)),1.0); }`,
  },
  {
    id: 'film-burn', name: 'Film Burn', family: 'light', description: 'The frame catches, a burning hole spreads with a glowing rim, and the next shot is underneath.',
    params: [P('scale', 'Burn Scale', 1, 12, 4, .1), P('rim', 'Rim Width', .01, .3, .07), P('heat', 'Heat', 0, 2, 1.2), P('smoke', 'Char', 0, 1, .5)],
    presets: [
      { id: 'projector', name: 'Projector Burn', description: 'A single hole eating outward.', params: { scale: 3, rim: .08, heat: 1.2, smoke: .5 } },
      { id: 'scatter-burn', name: 'Scattered Burn', description: 'Several holes opening at once.', params: { scale: 9, rim: .05, heat: 1.5, smoke: .35 } },
      { id: 'slow-char', name: 'Slow Char', description: 'Heavy charring, low flame.', params: { scale: 2, rim: .16, heat: .6, smoke: 1 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ float n=txfbm(uv*P0)+txfbm(uv*P0*2.3)*0.4; n/=1.4; float edge=p*1.25; float burn=smoothstep(edge-P1,edge,n); float rim=smoothstep(edge-P1,edge-P1*0.35,n)*(1.0-smoothstep(edge-P1*0.2,edge,n)); vec3 a=outg(uv).rgb, b=inc(uv).rgb; vec3 c=mix(b,a,burn); vec3 fire=mix(vec3(1.4,0.45,0.05),vec3(1.5,1.1,0.4),rim); c=mix(c,c*(1.0-P3*0.8)+vec3(0.05,0.02,0.0),rim*P3); c+=fire*rim*P2; return vec4(c,1.0); }`,
  },
  {
    id: 'turbulence-dissolve', name: 'Turbulence Dissolve', family: 'distort', description: 'A fractal cloud pushes the outgoing shot aside and the incoming one settles out of the churn.',
    params: [P('scale', 'Scale', .5, 12, 3, .1), P('displace', 'Displacement', 0, 120, 40, 1, 'px'), P('softness', 'Edge Softness', .01, .6, .2), P('evolve', 'Evolution', 0, 4, 1, .05)],
    presets: [
      { id: 'clouds', name: 'Clouds', description: 'Soft billowing handover.', params: { scale: 2, displace: 30, softness: .3, evolve: .6 } },
      { id: 'smoke', name: 'Smoke', description: 'Fine churn with strong displacement.', params: { scale: 6, displace: 80, softness: .15, evolve: 1.8 } },
      { id: 'liquid', name: 'Liquid', description: 'Big slow folds.', params: { scale: 1.2, displace: 60, softness: .45, evolve: .3 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ float e=sin(p*3.14159265); float n1=txfbm(uv*P0+vec2(uTime*P3*0.2,0.0)); float n2=txfbm(uv*P0*1.7+vec2(0.0,uTime*P3*0.17)+5.3); vec2 disp=(vec2(n1,n2)-0.5)*P1/uResolution*e*2.0; float key=(n1+n2)*0.5; float m=smoothstep(p-P2,p+P2,key); return vec4(mix(inc(uv+disp).rgb,outg(uv+disp).rgb,m),1.0); }`,
  },
  {
    id: 'colour-mosaic', name: 'Colour Mosaic', family: 'graphic', description: 'The cut passes through a field of animated colour tiles.',
    params: [P('cells', 'Cells', 4, 60, 18, 1), P('saturation', 'Colour', 0, 2, 1), P('hold', 'Hold', 0, 1, .4), P('glow', 'Glow', 0, 1, .3)],
    presets: [
      { id: 'confetti', name: 'Confetti', description: 'Bright tiles flashing between the shots.', params: { cells: 18, saturation: 1.2, hold: .4, glow: .3 } },
      { id: 'pastel', name: 'Pastel', description: 'Soft muted tiles.', params: { cells: 10, saturation: .5, hold: .25, glow: .15 } },
      { id: 'rave', name: 'Rave', description: 'Dense saturated tiles that linger.', params: { cells: 40, saturation: 1.8, hold: .8, glow: .7 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ float asp=uResolution.x/uResolution.y; float e=sin(p*3.14159265); vec2 g=floor(vec2(uv.x*asp,uv.y)*P0); float h=txh(g+floor(uTime*8.0)*0.13); vec3 tile=hsv2rgb(vec3(h,clamp(P1*0.7,0.0,1.0),1.0)); float k=e*mix(0.55,1.0,P2)*step(txh(g+1.7),0.55+0.45*e); vec3 c=gmix(outg(uv).rgb,inc(uv).rgb,smoothstep(0.3,0.7,p)); c=mix(c,tile,clamp(k,0.0,1.0)); return vec4(c+tile*k*P3*0.4,1.0); }`,
  },
  {
    id: 'swish-3d', name: 'Swish 3D', family: 'motion', description: 'A perspective whip: the frame swings away on an axis while the next shot swings in.',
    params: [P('angle', 'Direction', -180, 180, 0, 1, 'deg'), P('perspective', 'Perspective', 0, 1, .6), P('blur', 'Motion Blur', 0, 120, 55, 1, 'px'), P('shade', 'Shading', 0, 1, .4)],
    presets: [
      { id: 'left-swing', name: 'Swing Left', description: 'Whips to the left with blur.', params: { angle: 180, perspective: .6, blur: 55, shade: .4 } },
      { id: 'right-swing', name: 'Swing Right', description: 'Whips to the right.', params: { angle: 0, perspective: .6, blur: 55, shade: .4 } },
      { id: 'up-swing', name: 'Swing Up', description: 'Vertical perspective whip.', params: { angle: 90, perspective: .75, blur: 80, shade: .55 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ float e=sin(p*3.14159265); vec2 d=vec2(cos(radians(P0)),sin(radians(P0))); vec2 q=uv-0.5; float persp=1.0+P1*e*dot(q,d)*2.0; vec2 qa=q/max(0.2,persp)+0.5+d*p*0.6; vec2 qb=q/max(0.2,persp)+0.5-d*(1.0-p)*0.6; vec3 sa=vec3(0.0), sb=vec3(0.0); for(int i=0;i<7;i++){ float k=(float(i)/6.0-0.5)*P2*e/uResolution.x; sa+=outg(qa+d*k).rgb/7.0; sb+=inc(qb+d*k).rgb/7.0; } vec3 c=gmix(sa,sb,smoothstep(0.25,0.75,p)); return vec4(c*mix(1.0,1.0-e*0.45,P3),1.0); }`,
  },
  {
    id: 'glint-dissolve', name: 'Glint Dissolve', family: 'light', description: 'Star glints bloom on the highlights of both shots as they cross over.',
    params: [P('threshold', 'Threshold', 0, 1, .6), P('length', 'Streak Length', 0, 120, 45, 1, 'px'), P('arms', 'Arms', 2, 8, 4, 1), P('intensity', 'Intensity', 0, 3, 1.1)],
    presets: [
      { id: 'four-point', name: 'Four Point', description: 'Classic cross glints.', params: { threshold: .6, length: 45, arms: 4, intensity: 1.1 } },
      { id: 'starburst', name: 'Starburst', description: 'Eight long arms.', params: { threshold: .5, length: 90, arms: 8, intensity: 1.5 } },
      { id: 'subtle-sparkle', name: 'Subtle Sparkle', description: 'Only the brightest specular pops.', params: { threshold: .85, length: 25, arms: 4, intensity: .7 } },
    ],
    glsl: `vec4 tx(vec2 uv, float p){ float e=sin(p*3.14159265); vec3 c=gmix(outg(uv).rgb,inc(uv).rgb,smoothstep(0.15,0.85,p)); float n=max(2.0,floor(P2+0.5)); vec3 glint=vec3(0.0); for(int a=0;a<8;a++){ if(float(a)>=n) break; float ang=3.14159265*float(a)/n; vec2 d=vec2(cos(ang),sin(ang))*P1/uResolution; for(int i=1;i<=6;i++){ float k=float(i)/6.0; float w=(1.0-k)*e; vec3 sa=outg(uv+d*k).rgb, sb=inc(uv+d*k).rgb; vec3 s=mix(sa,sb,smoothstep(0.15,0.85,p)); glint+=max(s-P0,0.0)*w; vec3 s2=mix(outg(uv-d*k).rgb,inc(uv-d*k).rgb,smoothstep(0.15,0.85,p)); glint+=max(s2-P0,0.0)*w; } } return vec4(c+glint*P3*0.12,1.0); }`,
  },
  // ── Plajah material transitions ───────────────────────────────────────────
  {
    id: 'plasma-iris', name: 'Plasma Iris', family: 'light', description: 'A hot volumetric aperture blooms from the frame and refracts both shots around its living rim.',
    params: [P('turbulence', 'Turbulence', 0, 2, .75), P('rim', 'Plasma Rim', .01, .35, .09), P('refraction', 'Refraction', 0, 100, 32, 1, 'px'), P('hue', 'Spectral Hue', 0, 1, .58)],
    presets: [
      { id: 'aurora-eye', name: 'Aurora Eye', description: 'Cool cyan-violet plasma with a broad optical rim.', params: { turbulence: .65, rim: .12, refraction: 28, hue: .58 } },
      { id: 'solar-gate', name: 'Solar Gate', description: 'Hot orange aperture with harder refraction.', params: { turbulence: 1.2, rim: .055, refraction: 54, hue: .06 } },
      { id: 'soft-portal', name: 'Soft Portal', description: 'Slow atmospheric opening with a feathered boundary.', params: { turbulence: .32, rim: .22, refraction: 16, hue: .76 } },
    ],
    glsl: `vec4 tx(vec2 uv,float p){ float asp=uResolution.x/uResolution.y; vec2 q=(uv-.5)*vec2(asp,1.); float a=atan(q.y,q.x), r=length(q); float n=txfbm(q*vec2(3.,5.)+vec2(uTime*.13,-uTime*.09))+sin(a*7.+uTime)*.08*P0; float edge=p*length(vec2(asp,1.))*1.05; float sd=r+n*.18*P0-edge; vec2 nr=normalize(q+1e-5); vec2 bend=nr*P2/uResolution*exp(-abs(sd)*18.); vec3 A=outg(uv+bend).rgb,B=inc(uv-bend).rgb; float m=smoothstep(P1,-P1,sd); vec3 c=gmix(A,B,m); float rim=exp(-abs(sd)/max(.004,P1)); vec3 plasma=hsv2rgb(vec3(fract(P3+.16*sin(a*3.)),.82,1.)); c+=plasma*rim*(1.1+.4*sin(a*11.-uTime*2.)); return vec4(c,1.); }`,
  },
  {
    id: 'fluid-shatter', name: 'Fluid Shatter', family: 'distort', description: 'The outgoing image fractures into liquid cells, curls under surface tension, then reconstructs as the incoming frame.',
    params: [P('cells', 'Cell Scale', 3, 28, 11, 1), P('curl', 'Fluid Curl', 0, 2, .8), P('depth', 'Shatter Depth', 0, 160, 68, 1, 'px'), P('edge', 'Edge Light', 0, 2, .8)],
    presets: [
      { id: 'water-crystal', name: 'Water Crystal', description: 'Broad transparent cells with soft curling edges.', params: { cells: 8, curl: .55, depth: 52, edge: .65 } },
      { id: 'bass-impact', name: 'Bass Impact', description: 'Dense hard cells thrown deep through the cut.', params: { cells: 18, curl: 1.25, depth: 120, edge: 1.3 } },
      { id: 'mercury-fold', name: 'Mercury Fold', description: 'Large liquid-metal shards that pull back together.', params: { cells: 5, curl: 1.7, depth: 84, edge: 1.05 } },
    ],
    glsl: `vec4 tx(vec2 uv,float p){ float asp=uResolution.x/uResolution.y; vec2 g=vec2(uv.x*asp,uv.y)*P0,id=floor(g),f=fract(g)-.5; float h=txh(id),ang=6.28318*txh(id+9.7); vec2 dir=vec2(cos(ang),sin(ang)); float e=sin(p*3.14159265); vec2 curl=vec2(-f.y,f.x)*P1*.18*e; vec2 travel=dir*(h-.5)*P2/uResolution*e; float local=clamp((p*(1.45)-h*.45),0.,1.); vec2 qa=uv+travel+curl/uResolution*min(uResolution.x,uResolution.y); vec2 qb=uv-travel*.55-curl/uResolution*min(uResolution.x,uResolution.y)*.45; vec3 c=gmix(outg(qa).rgb,inc(qb).rgb,smoothstep(.08,.92,local)); float edge=exp(-abs(max(abs(f.x),abs(f.y))-.48)*50.)*e; c+=hsv2rgb(vec3(fract(h+.52),.35,1.))*edge*P3; return vec4(c,1.); }`,
  },
  {
    id: 'tidal-fold', name: 'Tidal Fold', family: 'motion', description: 'A physically smooth water sheet rolls across the frame with refracted imagery and a moving caustic crest.',
    params: [P('height', 'Wave Height', 0, 180, 72, 1, 'px'), P('length', 'Wavelength', 1, 12, 4.5, .1), P('refraction', 'Water Refraction', 0, 120, 46, 1, 'px'), P('caustic', 'Crest Light', 0, 2, .75)],
    presets: [
      { id: 'moon-tide', name: 'Moon Tide', description: 'One broad calm fold with a silver crest.', params: { height: 58, length: 2.4, refraction: 38, caustic: .55 } },
      { id: 'storm-surge', name: 'Storm Surge', description: 'Tight high water under strong optical pressure.', params: { height: 142, length: 8.5, refraction: 92, caustic: 1.3 } },
      { id: 'silk-water', name: 'Silk Water', description: 'Long graceful refraction with very little crest light.', params: { height: 36, length: 1.4, refraction: 64, caustic: .25 } },
    ],
    glsl: `vec4 tx(vec2 uv,float p){ float e=sin(p*3.14159265); float wave=sin((uv.y*P1-p*P1)*6.28318+sin(uv.y*7.+uTime*.4)*.35); float front=p+(wave*P0/uResolution.y)*e; float sd=uv.x-front; float slope=cos((uv.y*P1-p*P1)*6.28318)*P0*P1/uResolution.y; vec2 refr=vec2(P2/uResolution.x*(1.-abs(sd)*5.),-slope*P2/uResolution.y)*exp(-abs(sd)*9.); vec3 A=outg(uv+refr).rgb,B=inc(uv-refr*.65).rgb; float m=smoothstep(.035,-.035,sd); vec3 c=gmix(A,B,m); float crest=exp(-abs(sd)*90.)*P3*e; c+=vec3(.48,.78,1.)*crest*(.6+.4*pow(abs(slope),.35)); return vec4(c,1.); }`,
  },
  {
    id: 'note-tunnel', name: 'Note Tunnel', family: 'graphic', description: 'Twelve harmonic lanes bend the cut into a chromatic glass tunnel ready to land on a beat or chord change.',
    params: [P('segments', 'Harmonic Lanes', 3, 24, 12, 1), P('twist', 'Tunnel Twist', 0, 8, 2.4, .1), P('depth', 'Depth', 0, 2, .8), P('spectrum', 'Spectrum', 0, 1, .75)],
    presets: [
      { id: 'chroma-twelve', name: 'Chroma Twelve', description: 'Twelve vivid pitch-class lanes through a deep turn.', params: { segments: 12, twist: 2.4, depth: .9, spectrum: .9 } },
      { id: 'minor-six', name: 'Minor Six', description: 'Six restrained violet-blue lanes.', params: { segments: 6, twist: 1.2, depth: .65, spectrum: .45 } },
      { id: 'hyper-harmony', name: 'Hyper Harmony', description: 'Twenty-four fast spectral facets.', params: { segments: 24, twist: 5.8, depth: 1.45, spectrum: 1 } },
    ],
    glsl: `vec4 tx(vec2 uv,float p){ float asp=uResolution.x/uResolution.y,e=sin(p*3.14159265); vec2 q=(uv-.5)*vec2(asp,1.); float r=length(q),a=atan(q.y,q.x)+P1*e*(1.-smoothstep(0.,1.1,r)); float n=max(3.,floor(P0+.5)),lane=floor(fract(a/6.28318+1.)*n); float phase=txh(vec2(lane,3.7)); float z=1.+P2*e*(.45+.55*phase); vec2 qa=rot2(q,P1*e*(1.-r))/z/vec2(asp,1.)+.5; vec2 qb=rot2(q,-P1*e*(1.-r))*z/vec2(asp,1.)+.5; float gate=smoothstep(.22,.78,p+(.5-phase)*.28*e); vec3 c=gmix(outg(qa).rgb,inc(qb).rgb,gate); float seam=pow(1.-abs(fract(a/6.28318*n)-.5)*2.,18.)*e; vec3 spectral=hsv2rgb(vec3(fract(lane/n+.58),.85,1.)); c+=spectral*seam*P3; return vec4(c,1.); }`,
  },
];

export const TRANSITION_BY_ID = new Map(PHASE3_TRANSITIONS.map(t => [t.id, t]));
export function getTransitionDef(id: string): TransitionDef | undefined { return TRANSITION_BY_ID.get(id); }
