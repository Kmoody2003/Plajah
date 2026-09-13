// phase3StylizeVariantsEffects.ts — STYLIZE variants from the Sapphire/Continuum catalog that the
// Forge packs did not cover: kaleidoscope family, halftone rings/colour, fly's-eye, tile scramble,
// emboss glass, pseudo-colour, zebra, roman tile, strip slide, infinite zoom, parallax strips,
// warp repeat. Single-pass kernels with curated presets.
import type { FxEffect } from './effects';

const K = `
float sh21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float sluma(vec3 c){ return dot(c, vec3(.2126,.7152,.0722)); }
vec2 srot(vec2 p, float a){ float c=cos(a), s=sin(a); return vec2(c*p.x-s*p.y, s*p.x+c*p.y); }
`;
const s = (e: Omit<FxEffect, 'category'>): FxEffect => ({ ...e, category: 'stylize' });
const w = (e: Omit<FxEffect, 'category'>): FxEffect => ({ ...e, category: 'distort' });

export const PHASE3_STYLIZE_VARIANT_EFFECTS: FxEffect[] = [
  s({
    id: 'kaleidoscope', name: 'Kaleidoscope', version: 1,
    summary: 'Mirrored radial segments (triangles, squares, diamonds, polar) around a centre — the Sapphire Kaleido family in one tool.',
    params: [
      { key: 'segments', label: 'Segments', min: 2, max: 24, default: 6, step: 1 },
      { key: 'rotation', label: 'Rotation', min: -180, max: 180, default: 0, step: 1, unit: 'deg' },
      { key: 'zoom', label: 'Zoom', min: .2, max: 3, default: 1, step: .01 },
      { key: 'cx', label: 'Centre X', min: 0, max: 1, default: .5, step: .005 },
      { key: 'cy', label: 'Centre Y', min: 0, max: 1, default: .5, step: .005 },
      { key: 'mode', label: 'Mode (0 radial · 1 squares · 2 diamonds · 3 polar)', min: 0, max: 3, default: 0, step: 1 },
      { key: 'spin', label: 'Spin', min: -2, max: 2, default: 0, step: .01 },
    ],
    presets: [
      { id: 'hex', name: 'Hex Mirror', description: 'Six-segment classic kaleidoscope.', params: { segments: 6, rotation: 0, zoom: 1, cx: .5, cy: .5, mode: 0, spin: 0 } },
      { id: 'mandala', name: 'Mandala', description: 'Twelve segments slowly spinning.', params: { segments: 12, rotation: 0, zoom: 1.4, cx: .5, cy: .5, mode: 0, spin: .15 } },
      { id: 'tile-squares', name: 'Square Tiles', description: 'Mirrored square tiling.', params: { segments: 4, rotation: 0, zoom: 2, cx: .5, cy: .5, mode: 1, spin: 0 } },
      { id: 'polar-swirl', name: 'Polar Swirl', description: 'Polar-unwrapped mirror.', params: { segments: 8, rotation: 0, zoom: 1, cx: .5, cy: .5, mode: 3, spin: .3 } },
    ],
    glsl: K + `vec4 fx(vec2 uv){ float asp=uResolution.x/uResolution.y; vec2 c=vec2(P3,P4); vec2 p=(uv-c)*vec2(asp,1.0)/P2; float rot=radians(P1)+uTime*P6; vec2 q; if(P5<.5){ float a=atan(p.y,p.x)-rot, r=length(p); float seg=6.28318/max(2.0,floor(P0+.5)); a=mod(a,seg); a=abs(a-seg*0.5); q=vec2(cos(a),sin(a))*r; } else if(P5<1.5){ vec2 t=srot(p,rot)*max(2.0,P0*0.5); q=abs(fract(t*0.5)*2.0-1.0)*0.5; } else if(P5<2.5){ vec2 t=srot(p,rot+0.785398)*max(2.0,P0*0.5); q=abs(fract(t*0.5)*2.0-1.0)*0.5; q=srot(q,-0.785398); } else { float a=atan(p.y,p.x)-rot, r=length(p); float seg=6.28318/max(2.0,floor(P0+.5)); a=mod(a,seg)/seg; q=vec2(a-0.5, r-0.5)*vec2(1.0,1.0); } vec2 suv=q/vec2(asp,1.0)+c; suv=abs(fract(suv*0.5)*2.0-1.0); return inp(suv); }`,
  }),
  s({
    id: 'halftonepro', name: 'Halftone Pro', version: 1,
    summary: 'Halftone dots, lines or rings, in mono or CMYK-style per-channel screens with angle offsets.',
    params: [
      { key: 'pitch', label: 'Pitch', min: 3, max: 40, default: 9, step: .5, unit: 'px' },
      { key: 'angle', label: 'Screen Angle', min: 0, max: 90, default: 15, step: 1, unit: 'deg' },
      { key: 'pattern', label: 'Pattern (0 dots · 1 lines · 2 rings · 3 crosshatch)', min: 0, max: 3, default: 0, step: 1 },
      { key: 'color', label: 'Colour (0 mono · 1 CMYK · 2 RGB)', min: 0, max: 2, default: 0, step: 1 },
      { key: 'contrast', label: 'Contrast', min: .5, max: 2, default: 1.1, step: .01 },
      { key: 'paper', label: 'Paper Tint', min: 0, max: 1, default: .1, step: .01 },
      { key: 'soft', label: 'Softness', min: 0, max: 1, default: .3, step: .01 },
    ],
    presets: [
      { id: 'newsprint', name: 'Newsprint', description: 'Coarse mono dots on warm paper.', params: { pitch: 10, angle: 45, pattern: 0, color: 0, contrast: 1.2, paper: .25, soft: .25 } },
      { id: 'cmyk-comic', name: 'CMYK Comic', description: 'Four-colour rosette screens.', params: { pitch: 8, angle: 15, pattern: 0, color: 1, contrast: 1.15, paper: .08, soft: .3 } },
      { id: 'engraving', name: 'Engraving', description: 'Fine lines that thicken in the shadows.', params: { pitch: 5, angle: 30, pattern: 1, color: 0, contrast: 1.3, paper: .15, soft: .2 } },
      { id: 'rings', name: 'Rings', description: 'Concentric ring screen.', params: { pitch: 12, angle: 0, pattern: 2, color: 0, contrast: 1, paper: .1, soft: .35 } },
    ],
    glsl: K + `float screenv(vec2 uv, float ang, float pitch, float pat){ vec2 p=uv*uResolution; vec2 r=srot(p,radians(ang)); if(pat<.5){ vec2 g=fract(r/pitch)-0.5; return length(g)*1.414; } if(pat<1.5){ return abs(fract(r.y/pitch)-0.5)*2.0; } if(pat<2.5){ float d=length(p-uResolution*0.5); return abs(fract(d/pitch)-0.5)*2.0; } vec2 g=abs(fract(r/pitch)-0.5)*2.0; return min(g.x,g.y); } float dotv(float v, float sv, float soft){ return smoothstep(sv-0.15-soft*0.5, sv+0.15+soft*0.5, 1.0-v); } vec4 fx(vec2 uv){ vec4 b=inp(uv); vec3 c=clamp((b.rgb-0.5)*P4+0.5,0.0,1.0); vec3 paper=vec3(1.0,0.97,0.9)*(1.0-P5*0.15)+P5*vec3(0.02,0.01,0.0); vec3 o; if(P3<.5){ float l=sluma(c); float ink=dotv(l,screenv(uv,P1,P0,P2),P6); o=mix(paper,vec3(0.05),ink); } else if(P3<1.5){ float cy=1.0-c.r, mg=1.0-c.g, ye=1.0-c.b; float kk=min(cy,min(mg,ye)); float dc=dotv(1.0-cy,screenv(uv,P1+15.0,P0,P2),P6), dm=dotv(1.0-mg,screenv(uv,P1+75.0,P0,P2),P6), dy=dotv(1.0-ye,screenv(uv,P1,P0,P2),P6), dk=dotv(1.0-kk,screenv(uv,P1+45.0,P0,P2),P6); o=paper; o*=mix(vec3(1.0),vec3(0.0,0.62,0.89),dc); o*=mix(vec3(1.0),vec3(0.93,0.0,0.55),dm); o*=mix(vec3(1.0),vec3(1.0,0.93,0.0),dy); o*=mix(vec3(1.0),vec3(0.08),dk*0.9); } else { float dr=dotv(c.r,screenv(uv,P1,P0,P2),P6), dg=dotv(c.g,screenv(uv,P1+30.0,P0,P2),P6), db=dotv(c.b,screenv(uv,P1+60.0,P0,P2),P6); o=vec3(dr,dg,db); } return vec4(o,b.a); }`,
  }),
  s({
    id: 'flyseye', name: "Fly's Eye", version: 1,
    summary: 'Insect-eye lens array: the image repeated through a grid of circular, hexagonal or square lenslets.',
    params: [
      { key: 'cells', label: 'Cells Across', min: 2, max: 40, default: 8, step: 1 },
      { key: 'zoom', label: 'Lens Zoom', min: .2, max: 2, default: .6, step: .01 },
      { key: 'shape', label: 'Shape (0 circle · 1 hex · 2 square)', min: 0, max: 2, default: 0, step: 1 },
      { key: 'edge', label: 'Edge Darkening', min: 0, max: 1, default: .4, step: .01 },
      { key: 'bulge', label: 'Bulge', min: 0, max: 1, default: .5, step: .01 },
    ],
    presets: [
      { id: 'insect', name: 'Insect', description: 'Hex lenslets with strong bulge.', params: { cells: 10, zoom: .55, shape: 1, edge: .5, bulge: .8 } },
      { id: 'lens-grid', name: 'Lens Grid', description: 'Clean circular array.', params: { cells: 6, zoom: .7, shape: 0, edge: .3, bulge: .4 } },
      { id: 'contact-sheet', name: 'Contact Sheet', description: 'Square repeats with no bulge.', params: { cells: 5, zoom: 1, shape: 2, edge: .1, bulge: 0 } },
    ],
    glsl: K + `vec4 fx(vec2 uv){ float asp=uResolution.x/uResolution.y; float n=max(2.0,floor(P0+.5)); vec2 g=vec2(uv.x*asp,uv.y)*n/asp*1.0; vec2 cell=floor(g*vec2(asp,1.0)/vec2(asp,1.0)); vec2 gg=vec2(uv.x*n, uv.y*n/asp); vec2 id=floor(gg); vec2 f=fract(gg)-0.5; float r=length(f)*2.0; float m; if(P2<.5) m=1.0-smoothstep(0.92,1.0,r); else if(P2<1.5){ vec2 q=abs(f)*2.0; m=1.0-smoothstep(0.9,1.0,max(q.x*0.866+q.y*0.5,q.y)); } else m=1.0; vec2 dir=f*(1.0+P4*r*r); vec2 suv=(id+0.5)/vec2(n,n/asp)+dir*P1/vec2(n,n/asp)*1.6; suv=clamp(suv,0.0,1.0); vec4 c=inp(suv); c.rgb*=1.0-P3*smoothstep(0.5,1.0,r); return vec4(c.rgb*mix(1.0,m,step(0.5,P2<1.5?1.0:0.0)),c.a); }`,
  }),
  s({
    id: 'tilescramble', name: 'Tile Scramble', version: 1,
    summary: 'Cuts the frame into tiles and shuffles, flips and offsets them — animated or frozen.',
    params: [
      { key: 'tilesX', label: 'Tiles Across', min: 2, max: 32, default: 8, step: 1 },
      { key: 'tilesY', label: 'Tiles Down', min: 2, max: 32, default: 5, step: 1 },
      { key: 'amount', label: 'Scramble', min: 0, max: 1, default: .5, step: .01 },
      { key: 'flip', label: 'Flip Chance', min: 0, max: 1, default: .3, step: .01 },
      { key: 'speed', label: 'Reshuffle Rate', min: 0, max: 10, default: 0, step: .1, unit: 'Hz' },
      { key: 'gap', label: 'Gap', min: 0, max: .2, default: .01, step: .005 },
    ],
    presets: [
      { id: 'puzzle', name: 'Puzzle', description: 'Half the tiles swapped, frozen.', params: { tilesX: 8, tilesY: 5, amount: .5, flip: .2, speed: 0, gap: .01 } },
      { id: 'glitch-tiles', name: 'Glitch Tiles', description: 'Rapid reshuffle of small tiles.', params: { tilesX: 16, tilesY: 9, amount: .35, flip: .4, speed: 6, gap: 0 } },
      { id: 'mosaic-wall', name: 'Mosaic Wall', description: 'Large tiles with visible grout.', params: { tilesX: 6, tilesY: 4, amount: .8, flip: .5, speed: 0, gap: .04 } },
    ],
    glsl: K + `vec4 fx(vec2 uv){ vec2 n=vec2(max(2.0,floor(P0+.5)),max(2.0,floor(P1+.5))); vec2 id=floor(uv*n); vec2 f=fract(uv*n); float seedT=floor(uTime*P4); float h=sh21(id+seedT*3.7); vec2 target=id; if(h<P2){ target=floor(vec2(sh21(id*1.3+seedT),sh21(id*2.1+seedT+5.0))*n); } float fl=sh21(id*4.4+seedT); if(fl<P3) f.x=1.0-f.x; if(fl>1.0-P3*0.5) f.y=1.0-f.y; vec2 g=abs(f-0.5)*2.0; float gap=step(1.0-P5*2.0,max(g.x,g.y)); vec2 suv=(target+f)/n; vec4 c=inp(suv); return vec4(mix(c.rgb,vec3(0.02),gap),c.a); }`,
  }),
  s({
    id: 'embossglass', name: 'Emboss Glass', version: 1,
    summary: 'Relief lighting from image edges combined with a glassy refraction — shiny, distorted or glass emboss.',
    params: [
      { key: 'depth', label: 'Depth', min: 0, max: 4, default: 1.5, step: .05 },
      { key: 'angle', label: 'Light Angle', min: 0, max: 360, default: 135, step: 1, unit: 'deg' },
      { key: 'refract', label: 'Refraction', min: 0, max: 30, default: 8, step: .5, unit: 'px' },
      { key: 'shine', label: 'Shine', min: 0, max: 1, default: .5, step: .01 },
      { key: 'mode', label: 'Mode (0 shiny · 1 glass · 2 distort · 3 grey)', min: 0, max: 3, default: 1, step: 1 },
    ],
    presets: [
      { id: 'shiny', name: 'Shiny Emboss', description: 'Coloured relief with specular shine.', params: { depth: 1.8, angle: 135, refract: 0, shine: .7, mode: 0 } },
      { id: 'glass', name: 'Glass Emboss', description: 'Refracts the picture through its own relief.', params: { depth: 1.5, angle: 120, refract: 10, shine: .4, mode: 1 } },
      { id: 'grey-relief', name: 'Grey Relief', description: 'Classic grey emboss.', params: { depth: 2, angle: 135, refract: 0, shine: 0, mode: 3 } },
    ],
    glsl: K + `vec4 fx(vec2 uv){ vec2 px=1.0/uResolution; float l0=sluma(inp(uv).rgb); vec2 grad=vec2(sluma(inp(uv+vec2(px.x,0.)).rgb)-sluma(inp(uv-vec2(px.x,0.)).rgb), sluma(inp(uv+vec2(0.,px.y)).rgb)-sluma(inp(uv-vec2(0.,px.y)).rgb))*P0*3.0; float a=radians(P1); vec2 L=vec2(cos(a),sin(a)); float rel=dot(grad,L); float spec=pow(max(0.0,rel*2.0),3.0)*P3; vec4 b=inp(uv-grad*P2*px*4.0); vec3 o; if(P4<.5) o=b.rgb*(0.85+rel*0.8)+spec; else if(P4<1.5) o=b.rgb+rel*0.6+spec; else if(P4<2.5) o=b.rgb; else o=vec3(0.5+rel*0.9)+spec; return vec4(clamp(o,0.0,1.0),b.a); }`,
  }),
  s({
    id: 'pseudocolor', name: 'Pseudo Colour', version: 1,
    summary: 'Maps luminance to a colour ramp — thermal, rainbow, hot metal, viridis-style science palettes.',
    params: [
      { key: 'palette', label: 'Palette (0 thermal · 1 rainbow · 2 hot metal · 3 ocean · 4 ice · 5 custom hue)', min: 0, max: 5, default: 0, step: 1 },
      { key: 'bands', label: 'Bands (0 smooth)', min: 0, max: 24, default: 0, step: 1 },
      { key: 'offset', label: 'Offset', min: -1, max: 1, default: 0, step: .01 },
      { key: 'mix', label: 'Mix', min: 0, max: 1, default: 1, step: .01 },
      { key: 'hue', label: 'Custom Hue', min: 0, max: 1, default: .6, step: .005 },
    ],
    presets: [
      { id: 'thermal', name: 'Thermal', description: 'Black → purple → red → yellow → white.', params: { palette: 0, bands: 0, offset: 0, mix: 1, hue: .6 } },
      { id: 'rainbow-bands', name: 'Rainbow Bands', description: 'Twelve-step rainbow contour map.', params: { palette: 1, bands: 12, offset: 0, mix: 1, hue: .6 } },
      { id: 'hot-metal', name: 'Hot Metal', description: 'Black-body glow.', params: { palette: 2, bands: 0, offset: 0, mix: 1, hue: .6 } },
      { id: 'ocean', name: 'Ocean', description: 'Deep blue to aqua to sand.', params: { palette: 3, bands: 0, offset: 0, mix: 1, hue: .6 } },
    ],
    glsl: K + `vec3 pal(float t, float p, float hue){ t=clamp(t,0.0,1.0); if(p<.5) return t<.33?mix(vec3(0.0),vec3(.5,0.0,.6),t*3.0):(t<.66?mix(vec3(.5,0.0,.6),vec3(1.0,.2,0.0),(t-.33)*3.0):mix(vec3(1.0,.2,0.0),vec3(1.0),(t-.66)*3.0)); if(p<1.5) return hsv2rgb(vec3(0.7-t*0.7,1.0,1.0)); if(p<2.5) return vec3(smoothstep(0.0,.5,t),smoothstep(.3,.8,t),smoothstep(.7,1.0,t)); if(p<3.5) return mix(mix(vec3(.02,.05,.25),vec3(.1,.6,.8),t*1.6),vec3(.95,.85,.6),max(0.0,t-.6)*2.5); if(p<4.5) return mix(vec3(.05,.1,.3),vec3(.85,.95,1.0),t); return hsv2rgb(vec3(hue,1.0-t*0.8,0.15+t*0.85)); } vec4 fx(vec2 uv){ vec4 b=inp(uv); float l=clamp(sluma(b.rgb)+P2,0.0,1.0); if(P1>0.5) l=floor(l*P1+0.5)/P1; vec3 o=mix(b.rgb,pal(l,P0,P4),P3); return vec4(o,b.a); }`,
  }),
  s({
    id: 'zebra', name: 'Zebra', version: 1,
    summary: 'Exposure zebra stripes over clipped highlights (or crushed shadows), coloured or classic — plus an artistic full-frame stripe mode.',
    params: [
      { key: 'threshold', label: 'Threshold', min: 0, max: 1, default: .9, step: .005 },
      { key: 'width', label: 'Stripe Width', min: 2, max: 30, default: 6, step: .5, unit: 'px' },
      { key: 'angle', label: 'Angle', min: -90, max: 90, default: 45, step: 1, unit: 'deg' },
      { key: 'mode', label: 'Mode (0 highlights · 1 shadows · 2 luma bands)', min: 0, max: 2, default: 0, step: 1 },
      { key: 'hue', label: 'Colour (<0 black/white)', min: -1, max: 1, default: -1, step: .01 },
      { key: 'speed', label: 'Scroll', min: 0, max: 5, default: 1, step: .1 },
    ],
    presets: [
      { id: 'clip-warning', name: 'Clip Warning', description: 'Classic 95% zebra.', params: { threshold: .95, width: 6, angle: 45, mode: 0, hue: -1, speed: 1 } },
      { id: 'skin-70', name: 'Skin 70%', description: 'Zebra at skin exposure level.', params: { threshold: .7, width: 8, angle: 45, mode: 2, hue: -1, speed: 0 } },
      { id: 'art-stripes', name: 'Art Stripes', description: 'Coloured luma bands as a graphic look.', params: { threshold: .5, width: 14, angle: -30, mode: 2, hue: .15, speed: .5 } },
    ],
    glsl: K + `vec4 fx(vec2 uv){ vec4 b=inp(uv); float l=sluma(b.rgb); float m; if(P3<.5) m=step(P0,l); else if(P3<1.5) m=step(l,1.0-P0); else m=step(abs(l-P0),0.08); vec2 p=srot(uv*uResolution,radians(P2)); float st=step(0.5,fract((p.x+uTime*P5*30.0)/P1)); vec3 sc=P4<0.0?vec3(st):mix(vec3(0.0),hsv2rgb(vec3(P4,1.0,1.0)),st); vec3 o=mix(b.rgb,sc,m*0.9); return vec4(o,b.a); }`,
  }),
  s({
    id: 'romantile', name: 'Roman Tile', version: 1,
    summary: 'Mosaic of irregular tesserae with grout and per-tile colour averaging — the Roman mosaic look.',
    params: [
      { key: 'size', label: 'Tile Size', min: 4, max: 60, default: 14, step: 1, unit: 'px' },
      { key: 'irregular', label: 'Irregularity', min: 0, max: 1, default: .5, step: .01 },
      { key: 'grout', label: 'Grout', min: 0, max: .4, default: .12, step: .01 },
      { key: 'bevel', label: 'Bevel', min: 0, max: 1, default: .35, step: .01 },
      { key: 'variance', label: 'Colour Variance', min: 0, max: 1, default: .2, step: .01 },
    ],
    presets: [
      { id: 'classic', name: 'Classic Mosaic', description: 'Medium tesserae, light grout.', params: { size: 14, irregular: .5, grout: .12, bevel: .35, variance: .2 } },
      { id: 'fine', name: 'Fine Tesserae', description: 'Small tiles, subtle relief.', params: { size: 7, irregular: .4, grout: .08, bevel: .2, variance: .15 } },
      { id: 'bold', name: 'Bold Tiles', description: 'Large irregular tiles with deep grout.', params: { size: 30, irregular: .8, grout: .2, bevel: .6, variance: .35 } },
    ],
    glsl: K + `vec4 fx(vec2 uv){ vec2 p=uv*uResolution/P0; vec2 id=floor(p); float best=9.0, second=9.0; vec2 bid=id; for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){ vec2 c=id+vec2(float(i),float(j)); vec2 jit=vec2(sh21(c),sh21(c+3.3))*P1; vec2 centre=c+0.5+(jit-0.5*P1); float d=length(p-centre); if(d<best){ second=best; best=d; bid=c; } else if(d<second) second=d; } float edge=second-best; vec2 cjit=vec2(sh21(bid),sh21(bid+3.3))*P1; vec2 centre=(bid+0.5+(cjit-0.5*P1))*P0/uResolution; vec4 c=inp(centre); c.rgb*=1.0+(sh21(bid*7.1)-0.5)*P4; float g=smoothstep(P2*0.5,P2*0.5+0.08,edge); vec2 dir=normalize(p-(bid+0.5)+1e-4); float bev=dot(dir,vec2(-0.7,-0.7))*P3*0.25*(1.0-smoothstep(0.2,0.6,edge)); vec3 o=mix(vec3(0.08,0.07,0.06),c.rgb*(1.0+bev),g); return vec4(clamp(o,0.0,1.0),c.a); }`,
  }),
  s({
    id: 'stripslide', name: 'Strip Slide', version: 1,
    summary: 'The frame cut into strips that slide against each other — offsets grow with a parameter for a sliced, shifted look.',
    params: [
      { key: 'strips', label: 'Strips', min: 2, max: 60, default: 12, step: 1 },
      { key: 'amount', label: 'Slide', min: -1, max: 1, default: .2, step: .01 },
      { key: 'angle', label: 'Strip Angle', min: -90, max: 90, default: 0, step: 1, unit: 'deg' },
      { key: 'random', label: 'Randomness', min: 0, max: 1, default: .5, step: .01 },
      { key: 'speed', label: 'Animate', min: 0, max: 5, default: 0, step: .1 },
    ],
    presets: [
      { id: 'shifted', name: 'Shifted', description: 'Alternating strips slide opposite ways.', params: { strips: 12, amount: .2, angle: 0, random: 0, speed: 0 } },
      { id: 'jitter', name: 'Random Jitter', description: 'Random per-strip offsets.', params: { strips: 24, amount: .15, angle: 0, random: 1, speed: 0 } },
      { id: 'flow', name: 'Flowing Strips', description: 'Animated vertical strips.', params: { strips: 16, amount: .3, angle: 90, random: .5, speed: 1 } },
    ],
    glsl: K + `vec4 fx(vec2 uv){ float a=radians(P2); vec2 dir=vec2(cos(a),sin(a)), perp=vec2(-dir.y,dir.x); float t=dot(uv-0.5,perp)+0.5; float n=max(2.0,floor(P0+.5)); float id=floor(t*n); float alt=mod(id,2.0)*2.0-1.0; float rnd=(sh21(vec2(id,1.7))-0.5)*2.0; float off=P1*mix(alt,rnd,P3)*0.5+sin(uTime*P4+id)*P1*0.3*step(0.01,P4); vec2 suv=uv+dir*off; return inp(suv); }`,
  }),
  w({
    id: 'infinitezoom', name: 'Infinite Zoom', version: 1,
    summary: 'Droste-style endless zoom: the image nested inside itself, spinning and diving forever.',
    params: [
      { key: 'speed', label: 'Speed', min: -2, max: 2, default: .4, step: .01 },
      { key: 'levels', label: 'Levels', min: 1, max: 5, default: 3, step: 1 },
      { key: 'scale', label: 'Scale Step', min: 1.5, max: 6, default: 2.5, step: .1 },
      { key: 'spin', label: 'Spin', min: -2, max: 2, default: 0, step: .01 },
      { key: 'cx', label: 'Centre X', min: 0, max: 1, default: .5, step: .005 },
      { key: 'cy', label: 'Centre Y', min: 0, max: 1, default: .5, step: .005 },
    ],
    presets: [
      { id: 'dive', name: 'Dive', description: 'Steady zoom inward.', params: { speed: .4, levels: 3, scale: 2.5, spin: 0, cx: .5, cy: .5 } },
      { id: 'spiral', name: 'Spiral', description: 'Zoom with rotation.', params: { speed: .3, levels: 4, scale: 2.2, spin: .4, cx: .5, cy: .5 } },
      { id: 'pull-out', name: 'Pull Out', description: 'Endless zoom outward.', params: { speed: -.35, levels: 3, scale: 3, spin: 0, cx: .5, cy: .5 } },
    ],
    glsl: K + `vec4 fx(vec2 uv){ float asp=uResolution.x/uResolution.y; vec2 c=vec2(P4,P5); vec2 p=(uv-c)*vec2(asp,1.0); float lg=log(P2); float phase=fract(uTime*P0); vec4 acc=vec4(0.0); float wsum=0.0; int n=int(clamp(P1,1.0,5.0)+0.5); for(int i=0;i<5;i++){ if(i>=n) break; float k=float(i)-phase; float s=exp(lg*k); vec2 q=srot(p*s,uTime*P3+k*0.3); vec2 suv=q/vec2(asp,1.0)+c; float inb=step(0.0,suv.x)*step(suv.x,1.0)*step(0.0,suv.y)*step(suv.y,1.0); float r=length(q); float w=inb*smoothstep(0.0,0.15,r)*(1.0-smoothstep(0.35,0.75,r)); if(i==n-1) w=inb*smoothstep(0.0,0.15,r); acc+=inp(suv)*w; wsum+=w; } vec4 o=wsum>1e-4?acc/wsum:inp(uv); return o; }`,
  }),
  w({
    id: 'parallaxstrips', name: 'Parallax Strips', version: 1,
    summary: 'Vertical or horizontal strips moving at different speeds, as if seen through a slatted window.',
    params: [
      { key: 'strips', label: 'Strips', min: 2, max: 40, default: 10, step: 1 },
      { key: 'parallax', label: 'Parallax', min: 0, max: 1, default: .3, step: .01 },
      { key: 'speed', label: 'Speed', min: -2, max: 2, default: .3, step: .01 },
      { key: 'angle', label: 'Orientation', min: 0, max: 90, default: 0, step: 1, unit: 'deg' },
      { key: 'gap', label: 'Gap', min: 0, max: .3, default: .02, step: .005 },
    ],
    presets: [
      { id: 'slats', name: 'Window Slats', description: 'Vertical slats with mild parallax.', params: { strips: 10, parallax: .3, speed: .3, angle: 0, gap: .02 } },
      { id: 'blinds', name: 'Blinds', description: 'Horizontal blinds sliding.', params: { strips: 14, parallax: .2, speed: .2, angle: 90, gap: .05 } },
      { id: 'deep', name: 'Deep Parallax', description: 'Strong depth separation.', params: { strips: 8, parallax: .8, speed: .5, angle: 0, gap: 0 } },
    ],
    glsl: K + `vec4 fx(vec2 uv){ float a=radians(P3); vec2 dir=vec2(cos(a),sin(a)); vec2 perp=vec2(-dir.y,dir.x); float t=dot(uv-0.5,dir)+0.5; float n=max(2.0,floor(P0+.5)); float id=floor(t*n); float depth=sh21(vec2(id,3.3)); float off=uTime*P2*(0.2+depth*P1); float f=fract(t*n); float gap=step(1.0-P4*2.0,abs(f-0.5)*2.0); vec2 suv=uv+perp*off; suv=fract(suv); vec4 c=inp(suv); return vec4(mix(c.rgb,vec3(0.0),gap),c.a); }`,
  }),
  w({
    id: 'warprepeat', name: 'Warp Repeat', version: 1,
    summary: 'Repeats the image across the frame with a per-copy scale, rotation and offset — the Sapphire WarpRepeat.',
    params: [
      { key: 'copies', label: 'Copies', min: 1, max: 12, default: 4, step: 1 },
      { key: 'scale', label: 'Scale Step', min: .5, max: 1.5, default: .85, step: .01 },
      { key: 'rotate', label: 'Rotate Step', min: -45, max: 45, default: 6, step: .5, unit: 'deg' },
      { key: 'offsetX', label: 'Offset X', min: -.5, max: .5, default: .04, step: .005 },
      { key: 'offsetY', label: 'Offset Y', min: -.5, max: .5, default: .02, step: .005 },
      { key: 'fade', label: 'Fade', min: 0, max: 1, default: .5, step: .01 },
    ],
    presets: [
      { id: 'echo-spiral', name: 'Echo Spiral', description: 'Copies shrink and rotate inward.', params: { copies: 6, scale: .82, rotate: 8, offsetX: .03, offsetY: .02, fade: .55 } },
      { id: 'stack', name: 'Offset Stack', description: 'Offset copies without rotation.', params: { copies: 4, scale: 1, rotate: 0, offsetX: .06, offsetY: .04, fade: .4 } },
      { id: 'zoom-trail', name: 'Zoom Trail', description: 'Grows outward with strong fade.', params: { copies: 8, scale: 1.08, rotate: 0, offsetX: 0, offsetY: 0, fade: .8 } },
    ],
    glsl: K + `vec4 fx(vec2 uv){ float asp=uResolution.x/uResolution.y; vec4 acc=inp(uv); float w=1.0; int n=int(clamp(P0,1.0,12.0)+0.5); vec2 p=(uv-0.5)*vec2(asp,1.0); for(int i=1;i<=12;i++){ if(i>n) break; float k=float(i); vec2 q=srot(p,radians(P2)*k)/pow(P1,k)-vec2(P3,P4)*k*vec2(asp,1.0); vec2 suv=q/vec2(asp,1.0)+0.5; float inb=step(0.0,suv.x)*step(suv.x,1.0)*step(0.0,suv.y)*step(suv.y,1.0); float wk=pow(1.0-P5,k)*inb; vec4 c=inp(suv); acc=mix(acc,c,wk*c.a); w+=wk; } return acc; }`,
  }),
];
