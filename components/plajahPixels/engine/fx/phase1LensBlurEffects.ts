// Phase 1 lens/light/blur pack. Kept separate from the core registry so each
// production pack can grow without turning effects.ts into an unreviewable blob.

const gaussianPasses = (radiusParam = 'P1') => [
  { id: 'blur-x', glsl: `vec4 fx(vec2 uv){ vec2 d=vec2(${radiusParam}/uResolution.x,0); vec4 c=inp(uv)*.227027; c+=(inp(uv+d*.45)+inp(uv-d*.45))*.194594; c+=(inp(uv+d*1.25)+inp(uv-d*1.25))*.121622; c+=(inp(uv+d*2.25)+inp(uv-d*2.25))*.070270; return c; }` },
  { id: 'blur-y', glsl: `vec4 fx(vec2 uv){ vec2 d=vec2(0,${radiusParam}/uResolution.y); vec4 c=inp(uv)*.227027; c+=(inp(uv+d*.45)+inp(uv-d*.45))*.194594; c+=(inp(uv+d*1.25)+inp(uv-d*1.25))*.121622; c+=(inp(uv+d*2.25)+inp(uv-d*2.25))*.070270; return c; }` },
];

export const PHASE1_LENS_BLUR_EFFECTS: any[] = [
  {
    id: 'opticalglow', name: 'Optical Glow', category: 'light', version: 1,
    summary: 'Physically tasteful highlight bloom with threshold, knee, tint and source-preserving screen response.',
    params: [{ key: 'amount', label: 'Amount', min: 0, max: 2.5, default: .65, step: .01 }, { key: 'radius', label: 'Radius', min: 1, max: 90, default: 28, step: .5, unit: 'px' }, { key: 'threshold', label: 'Threshold', min: 0, max: 2, default: .72, step: .01 }, { key: 'knee', label: 'Knee', min: .01, max: 1, default: .38, step: .01 }, { key: 'sat', label: 'Glow Color', min: 0, max: 1.5, default: .9, step: .01 }],
    presets: [{ id: 'premium', name: 'Premium Polish', description: 'Invisible high-end bloom for finishing.', params: { amount: .38, radius: 22, threshold: .86, knee: .42, sat: .78 } }, { id: 'concert', name: 'Concert Bloom', description: 'Dense saturated bloom around stage lighting.', params: { amount: 1.25, radius: 38, threshold: .42, knee: .34, sat: 1.22 } }, { id: 'romance', name: 'Romance', description: 'Broad soft glow for warm emotional imagery.', params: { amount: .82, radius: 52, threshold: .62, knee: .58, sat: .68 } }],
    glsl: `vec4 fx(vec2 uv){return inp(uv);}`, passes: [
      { id: 'extract', glsl: `vec4 fx(vec2 uv){vec4 c=inp(uv);float l=max(max(c.r,c.g),c.b);float s=clamp((l-P2+P3)/(2.0*P3),0.0,1.0);s=s*s*(3.0-2.0*s);float m=max(l-P2,0.0)+s*P3;vec3 x=c.rgb*(m/max(l,1e-5));float y=dot(x,vec3(.2126,.7152,.0722));return vec4(mix(vec3(y),x,P4),c.a);}` }, ...gaussianPasses(),
      { id: 'finish', glsl: `vec4 fx(vec2 uv){vec4 b=src(uv);vec3 g=inp(uv).rgb*P0;return vec4(1.0-(1.0-b.rgb)*exp(-g),b.a);}` },
    ],
  },
  {
    id: 'ultraglow', name: 'Ultra Glow', category: 'light', version: 1,
    summary: 'Layered core and atmosphere glow for neon, titles, energy and science-fiction imagery.',
    params: [{ key: 'amount', label: 'Amount', min: 0, max: 3, default: 1, step: .01 }, { key: 'radius', label: 'Core Radius', min: 1, max: 50, default: 12, step: .5 }, { key: 'threshold', label: 'Threshold', min: 0, max: 1.5, default: .52, step: .01 }, { key: 'atmosphere', label: 'Atmosphere', min: 0, max: 2, default: .6, step: .01 }, { key: 'hue', label: 'Hue Shift', min: -1, max: 1, default: 0, step: .01 }],
    presets: [{ id: 'neon', name: 'Neon Core', description: 'Sharp luminous center with broad colored atmosphere.', params: { amount: 1.4, radius: 10, threshold: .34, atmosphere: 1.1, hue: .08 } }, { id: 'energy', name: 'Energy Field', description: 'Intense science-fiction energy bloom.', params: { amount: 2.1, radius: 18, threshold: .22, atmosphere: 1.45, hue: -.22 } }, { id: 'title', name: 'Title Aura', description: 'Controlled aura around bright motion graphics.', params: { amount: .85, radius: 8, threshold: .58, atmosphere: .52, hue: 0 } }],
    glsl: `vec4 fx(vec2 uv){return inp(uv);}`, passes: [
      { id: 'extract', glsl: `vec4 fx(vec2 uv){vec4 c=inp(uv);float l=max(max(c.r,c.g),c.b);float m=smoothstep(P2,P2+.22,l);return vec4(c.rgb*m,m);}` }, ...gaussianPasses(),
      { id: 'finish', glsl: `vec4 fx(vec2 uv){vec4 b=src(uv);vec3 g=inp(uv).rgb;vec3 h=rgb2hsv(g);h.x=fract(h.x+P4);g=hsv2rgb(h);vec3 wide=(inp(uv+vec2(P1*2.0/uResolution.x,0)).rgb+inp(uv-vec2(P1*2.0/uResolution.x,0)).rgb)*.5;g=g*P0+wide*P3;return vec4(1.0-(1.0-b.rgb)*exp(-g),b.a);}` },
    ],
  },
  {
    id: 'lightleak', name: 'Light Leak', category: 'light', version: 1,
    summary: 'Organic animated edge exposure with filmic color and controllable sweep.',
    params: [{ key: 'amount', label: 'Amount', min: 0, max: 2, default: .7, step: .01 }, { key: 'position', label: 'Position', min: 0, max: 1, default: .22, step: .005 }, { key: 'width', label: 'Width', min: .02, max: .8, default: .28, step: .01 }, { key: 'hue', label: 'Hue', min: 0, max: 1, default: .06, step: .005 }, { key: 'animate', label: 'Motion', min: -1, max: 1, default: .15, step: .01 }, { key: 'texture', label: 'Organic Texture', min: 0, max: 1, default: .45, step: .01 }],
    presets: [{ id: 'amber-edge', name: 'Amber Edge', description: 'Warm 35mm-style edge exposure.', params: { amount: .72, position: .08, width: .24, hue: .055, animate: .1, texture: .52 } }, { id: 'rose-sweep', name: 'Rose Sweep', description: 'Moving magenta-orange flare wash.', params: { amount: 1.15, position: .35, width: .42, hue: .96, animate: .32, texture: .68 } }, { id: 'sun-flare', name: 'Sun Flare', description: 'Natural golden wash from the frame edge.', params: { amount: .9, position: .78, width: .34, hue: .11, animate: .04, texture: .28 } }],
    glsl: `float n(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5);} vec4 fx(vec2 uv){vec4 b=inp(uv);float pos=fract(P1+uTime*P4*.08);float shape=exp(-pow(abs(uv.x-pos)/P2,2.0));float tex=mix(1.0,.55+.45*n(floor(uv*vec2(24,9)+uTime)),P5);vec3 col=hsv2rgb(vec3(P3,.78,1.0));vec3 leak=col*shape*tex*P0;return vec4(1.0-(1.0-b.rgb)*exp(-leak),b.a);}`,
  },
  {
    id: 'glimmer', name: 'Glimmer', category: 'light', version: 1,
    summary: 'Tiny highlight sparkles with deterministic animation and refined optical falloff.',
    params: [{ key: 'amount', label: 'Amount', min: 0, max: 2, default: .65, step: .01 }, { key: 'threshold', label: 'Threshold', min: 0, max: 1.5, default: .78, step: .01 }, { key: 'density', label: 'Density', min: .05, max: 1, default: .32, step: .01 }, { key: 'size', label: 'Size', min: 1, max: 16, default: 5, step: .5 }, { key: 'twinkle', label: 'Twinkle', min: 0, max: 3, default: 1, step: .05 }],
    presets: [{ id: 'jewelry', name: 'Jewelry', description: 'Fine luxury sparkles on specular highlights.', params: { amount: .55, threshold: .88, density: .2, size: 4, twinkle: 1.3 } }, { id: 'magic', name: 'Magic Dust', description: 'More abundant animated glints for fantasy imagery.', params: { amount: 1.1, threshold: .56, density: .62, size: 7, twinkle: 1.8 } }, { id: 'snowlight', name: 'Snow Light', description: 'Soft white points on bright winter detail.', params: { amount: .72, threshold: .7, density: .45, size: 3, twinkle: .7 } }],
    glsl: `float h(vec2 p){return fract(sin(dot(p,vec2(91.7,271.9)))*43758.5);} vec4 fx(vec2 uv){vec4 b=inp(uv);vec2 cell=floor(uv*uResolution/max(P3,1.0));float rnd=h(cell);vec2 f=fract(uv*uResolution/max(P3,1.0))-.5;float star=pow(max(0.0,1.0-min(abs(f.x),abs(f.y))*8.0),8.0);float bright=smoothstep(P1,P1+.18,max(max(b.r,b.g),b.b));float on=step(1.0-P2,rnd);float tw=.35+.65*pow(.5+.5*sin(uTime*P4*4.0+rnd*18.0),4.0);vec3 g=vec3(star*bright*on*tw*P0);return vec4(1.0-(1.0-b.rgb)*exp(-g),b.a);}`,
  },
  {
    id: 'flashbulb', name: 'Flashbulb', category: 'light', version: 1,
    summary: 'Keyframe-ready photographic flash with bloom, warm/cool balance and exposure recovery.',
    params: [{ key: 'flash', label: 'Flash', min: 0, max: 2, default: 0, step: .01 }, { key: 'bloom', label: 'Bloom', min: 0, max: 1, default: .35, step: .01 }, { key: 'temperature', label: 'Temperature', min: -1, max: 1, default: 0, step: .01 }, { key: 'protect', label: 'Highlight Protect', min: 0, max: 1, default: .45, step: .01 }],
    presets: [{ id: 'camera', name: 'Camera Flash', description: 'Neutral photographic flash peak.', params: { flash: 1.1, bloom: .32, temperature: 0, protect: .48 } }, { id: 'paparazzi', name: 'Paparazzi', description: 'Hard bright press-camera flash.', params: { flash: 1.65, bloom: .18, temperature: .08, protect: .2 } }, { id: 'warm-memory', name: 'Warm Memory', description: 'Soft warm flash for nostalgic edits.', params: { flash: .82, bloom: .58, temperature: .48, protect: .62 } }],
    glsl: `vec4 fx(vec2 uv){vec4 b=inp(uv);vec3 tint=mix(vec3(.82,.92,1.12),vec3(1.14,.98,.78),P2*.5+.5);float peak=max(max(b.r,b.g),b.b);float guard=mix(1.0,1.0-smoothstep(.8,1.4,peak),P3);vec3 x=b.rgb+tint*P0*guard;float l=dot(b.rgb,vec3(.2126,.7152,.0722));x+=tint*smoothstep(.55,1.0,l)*P1*.3;return vec4(1.0-exp(-x),b.a);}`,
  },
  {
    id: 'problur', name: 'Pro Blur', category: 'blur', version: 1,
    summary: 'Production Gaussian/box hybrid with anisotropy and source mix.',
    params: [{ key: 'radius', label: 'Radius', min: 0, max: 120, default: 18, step: .5 }, { key: 'shape', label: 'Shape', min: 0, max: 1, default: .75, step: .01 }, { key: 'horizontal', label: 'Horizontal', min: .1, max: 2, default: 1, step: .01 }, { key: 'vertical', label: 'Vertical', min: .1, max: 2, default: 1, step: .01 }, { key: 'mix', label: 'Mix', min: 0, max: 1, default: 1, step: .01 }],
    presets: [{ id: 'gaussian', name: 'Gaussian', description: 'Smooth general-purpose production blur.', params: { radius: 18, shape: .9, horizontal: 1, vertical: 1, mix: 1 } }, { id: 'boxy', name: 'Box Softness', description: 'Flatter graphic blur response.', params: { radius: 14, shape: .15, horizontal: 1, vertical: 1, mix: 1 } }, { id: 'anamorphic', name: 'Anamorphic Defocus', description: 'Wide horizontal optical softness.', params: { radius: 26, shape: .85, horizontal: 1.8, vertical: .42, mix: 1 } }],
    glsl: `vec4 fx(vec2 uv){return inp(uv);}`, passes: [
      { id: 'x', glsl: `vec4 fx(vec2 uv){vec2 d=vec2(P0*P2/uResolution.x,0);vec4 g=inp(uv)*.24+(inp(uv+d*.55)+inp(uv-d*.55))*.2+(inp(uv+d*1.5)+inp(uv-d*1.5))*.08;vec4 bx=(inp(uv-d)+inp(uv)+inp(uv+d))/3.0;return mix(bx,g,P1);}` },
      { id: 'y', glsl: `vec4 fx(vec2 uv){vec2 d=vec2(0,P0*P3/uResolution.y);vec4 g=inp(uv)*.24+(inp(uv+d*.55)+inp(uv-d*.55))*.2+(inp(uv+d*1.5)+inp(uv-d*1.5))*.08;vec4 bx=(inp(uv-d)+inp(uv)+inp(uv+d))/3.0;return mix(bx,g,P1);}` },
      { id: 'mix', glsl: `vec4 fx(vec2 uv){return mix(src(uv),inp(uv),P4);}` },
    ],
  },
  {
    id: 'channelblur', name: 'Channel Blur', category: 'blur', version: 1,
    summary: 'Independent red, green, blue and alpha softness for cleanup and creative color work.',
    params: [{ key: 'red', label: 'Red', min: 0, max: 50, default: 0, step: .5 }, { key: 'green', label: 'Green', min: 0, max: 50, default: 0, step: .5 }, { key: 'blue', label: 'Blue', min: 0, max: 50, default: 0, step: .5 }, { key: 'alpha', label: 'Alpha', min: 0, max: 50, default: 0, step: .5 }],
    presets: [{ id: 'chroma-soft', name: 'Chroma Soft', description: 'Softens color channels while retaining luminance detail.', params: { red: 7, green: 4, blue: 9, alpha: 0 } }, { id: 'blue-bloom', name: 'Blue Bloom', description: 'Dreamy blue-channel spread.', params: { red: 1, green: 3, blue: 18, alpha: 0 } }, { id: 'alpha-soft', name: 'Alpha Soft', description: 'Softens compositing edges only.', params: { red: 0, green: 0, blue: 0, alpha: 8 } }],
    glsl: `vec4 fx(vec2 uv){vec2 px=1.0/uResolution;vec4 b=inp(uv);float r=(inp(uv+vec2(P0*px.x,0)).r+inp(uv-vec2(P0*px.x,0)).r+b.r)/3.0;float g=(inp(uv+vec2(0,P1*px.y)).g+inp(uv-vec2(0,P1*px.y)).g+b.g)/3.0;float bl=(inp(uv+vec2(P2*px.x,0)).b+inp(uv-vec2(P2*px.x,0)).b+b.b)/3.0;float a=(inp(uv+vec2(0,P3*px.y)).a+inp(uv-vec2(0,P3*px.y)).a+b.a)/3.0;return vec4(r,g,bl,a);}`,
  },
  {
    id: 'bokehfocus', name: 'Bokeh Focus', category: 'blur', version: 1,
    summary: 'Lens-inspired defocus with shaped highlights, center focus and cat-eye character.',
    params: [{ key: 'radius', label: 'Radius', min: 0, max: 80, default: 24, step: .5 }, { key: 'focus', label: 'Focus Radius', min: 0, max: 1, default: .18, step: .01 }, { key: 'feather', label: 'Focus Feather', min: .01, max: 1, default: .28, step: .01 }, { key: 'highlights', label: 'Bokeh Highlights', min: 0, max: 2, default: .45, step: .01 }, { key: 'catEye', label: 'Cat Eye', min: 0, max: 1, default: .18, step: .01 }],
    presets: [{ id: 'portrait', name: 'Portrait Focus', description: 'Centered subject focus with creamy background.', params: { radius: 34, focus: .22, feather: .28, highlights: .38, catEye: .16 } }, { id: 'night-bokeh', name: 'Night Bokeh', description: 'Large luminous practical-light bokeh.', params: { radius: 48, focus: .12, feather: .22, highlights: 1.15, catEye: .48 } }, { id: 'miniature', name: 'Miniature World', description: 'Narrow tilt-like focus region.', params: { radius: 28, focus: .08, feather: .12, highlights: .28, catEye: .08 } }],
    glsl: `vec4 fx(vec2 uv){vec2 p=1.0/uResolution*P0;vec4 sum=vec4(0);float w=0.0;for(int i=0;i<12;i++){float a=float(i)*.523599;vec2 d=vec2(cos(a),sin(a))*p*(.55+.45*float(i%3)/2.0);vec4 s=inp(uv+d);float hi=1.0+smoothstep(.65,1.0,max(max(s.r,s.g),s.b))*P3;sum+=s*hi;w+=hi;}vec4 z=sum/w;float dist=length((uv-.5)*vec2(1.0+P4,1.0));float m=smoothstep(P1,P1+P2,dist);return mix(inp(uv),z,m);}`,
  },
  {
    id: 'tiltshift', name: 'Tilt Shift', category: 'blur', version: 1,
    summary: 'Rotatable linear focus band for miniature, product and selective-focus looks.',
    params: [{ key: 'radius', label: 'Blur Radius', min: 0, max: 70, default: 28, step: .5 }, { key: 'position', label: 'Band Position', min: 0, max: 1, default: .5, step: .005 }, { key: 'width', label: 'Band Width', min: .01, max: .8, default: .16, step: .01 }, { key: 'feather', label: 'Feather', min: .01, max: .6, default: .18, step: .01 }, { key: 'angle', label: 'Angle', min: -180, max: 180, default: 0, step: 1 }],
    presets: [{ id: 'miniature', name: 'Miniature City', description: 'Classic narrow horizontal miniature focus.', params: { radius: 36, position: .52, width: .1, feather: .14, angle: 0 } }, { id: 'product', name: 'Product Sweep', description: 'Diagonal focus band for tabletop detail.', params: { radius: 24, position: .5, width: .2, feather: .2, angle: -18 } }, { id: 'soft-horizon', name: 'Soft Horizon', description: 'Natural landscape focus emphasis.', params: { radius: 18, position: .42, width: .26, feather: .3, angle: 0 } }],
    glsl: `vec4 fx(vec2 uv){float a=radians(P4);vec2 d=vec2(cos(a),sin(a));float q=abs(dot(uv-.5,d)-P1+.5);float m=smoothstep(P2,P2+P3,q);vec2 p=vec2(P0/uResolution.x,P0/uResolution.y);vec4 z=inp(uv)*.24+(inp(uv+vec2(p.x,0))+inp(uv-vec2(p.x,0))+inp(uv+vec2(0,p.y))+inp(uv-vec2(0,p.y)))*.19;return mix(inp(uv),z,m);}`,
  },
  {
    id: 'beautyblur', name: 'Beauty Blur', category: 'blur', version: 1,
    summary: 'Skin-friendly smoothing that preserves eyes, hair, lips and meaningful facial detail.',
    params: [{ key: 'amount', label: 'Smoothing', min: 0, max: 1, default: .38, step: .01 }, { key: 'radius', label: 'Radius', min: 1, max: 30, default: 8, step: .5 }, { key: 'detail', label: 'Detail', min: 0, max: 1, default: .68, step: .01 }, { key: 'range', label: 'Tone Range', min: .02, max: .5, default: .16, step: .01 }, { key: 'glow', label: 'Complexion Glow', min: 0, max: 1, default: .12, step: .01 }],
    presets: [{ id: 'natural', name: 'Natural Beauty', description: 'Invisible complexion refinement.', params: { amount: .32, radius: 7, detail: .78, range: .13, glow: .08 } }, { id: 'editorial', name: 'Editorial Beauty', description: 'Polished magazine finish with retained features.', params: { amount: .55, radius: 10, detail: .62, range: .18, glow: .16 } }, { id: 'soft-glam', name: 'Soft Glam', description: 'Stronger smoothing with luminous complexion.', params: { amount: .72, radius: 13, detail: .5, range: .22, glow: .28 } }],
    glsl: `vec4 fx(vec2 uv){vec2 p=P1/uResolution;vec4 b=inp(uv);float l=dot(b.rgb,vec3(.2126,.7152,.0722));vec3 sum=b.rgb;float w=1.0;for(int i=0;i<8;i++){float a=float(i)*.785398;vec3 s=inp(uv+vec2(cos(a),sin(a))*p).rgb;float sl=dot(s,vec3(.2126,.7152,.0722));float rw=exp(-abs(sl-l)/P3);sum+=s*rw;w+=rw;}vec3 soft=sum/w;vec3 detail=b.rgb-soft;vec3 c=mix(b.rgb,soft+detail*P2,P0);c+=soft*smoothstep(.45,.85,l)*P4*.12;return vec4(clamp(c,0.0,1.0),b.a);}`,
  },
  {
    id: 'detailsharpen', name: 'Detail Sharpen', category: 'blur', version: 1,
    summary: 'Halo-controlled multiscale sharpening with noise and highlight protection.',
    params: [{ key: 'amount', label: 'Amount', min: 0, max: 3, default: .7, step: .01 }, { key: 'radius', label: 'Radius', min: .5, max: 8, default: 1.4, step: .1 }, { key: 'threshold', label: 'Noise Threshold', min: 0, max: .2, default: .025, step: .005 }, { key: 'protect', label: 'Highlight Protect', min: 0, max: 1, default: .5, step: .01 }],
    presets: [{ id: 'clean-detail', name: 'Clean Detail', description: 'Crisp finishing sharpen without obvious halos.', params: { amount: .58, radius: 1.2, threshold: .028, protect: .62 } }, { id: 'web-crisp', name: 'Web Crisp', description: 'Stronger clarity for compressed online delivery.', params: { amount: 1.05, radius: .9, threshold: .018, protect: .48 } }, { id: 'soft-source', name: 'Rescue Soft Source', description: 'Broader controlled sharpening for slightly soft footage.', params: { amount: 1.25, radius: 2.8, threshold: .04, protect: .7 } }],
    glsl: `vec4 fx(vec2 uv){vec2 p=P1/uResolution;vec4 b=inp(uv);vec3 soft=(inp(uv+vec2(p.x,0)).rgb+inp(uv-vec2(p.x,0)).rgb+inp(uv+vec2(0,p.y)).rgb+inp(uv-vec2(0,p.y)).rgb+b.rgb*4.0)/8.0;vec3 d=b.rgb-soft;float mag=max(max(abs(d.r),abs(d.g)),abs(d.b));float gate=smoothstep(P2,P2+.04,mag);float hi=1.0-smoothstep(.72,1.05,max(max(b.r,b.g),b.b))*P3;return vec4(clamp(b.rgb+d*P0*gate*hi,0.0,1.0),b.a);}`,
  },
];
