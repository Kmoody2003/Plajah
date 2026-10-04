// GLSL for the shader lenses (Matrix, Cardboard). Both read the composited frame as `uTex`
// (canvas uploaded un-flipped, so uv (0,0) is the TOP-left — VERT flips y to match).

export const LENS_VERT = `#version 300 es
in vec2 p; out vec2 vUv;
void main(){ vUv = vec2(p.x*0.5+0.5, 1.0-(p.y*0.5+0.5)); gl_Position = vec4(p,0.0,1.0); }`;

const NOISE = `
float h11(float p){ p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }
float h21(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
`;

// ── MATRIX — "Neo sees the code", as a 3D scene. The picture is BUILT from glyphs (each cell takes the
//    mip-averaged brightness of the image under it + local contrast + edges), and the code runs through
//    it in DEPTH LAYERS, using the person matte to know what is in front of what:
//      far  — small, dim, soft rain, hidden BEHIND you
//      mid  — the picture's own glyph grid and its rain
//      near — big, bright, out-of-focus streaks passing IN FRONT of you (mip-bias = depth of field)
//    plus distance fog on the background, you lifted forward, and a rim light on your silhouette. ──
export const MATRIX_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform sampler2D uGlyph; uniform sampler2D uMask;
uniform vec2 uRes; uniform float uT; uniform float uCell; uniform float uHasMask;
uniform vec2 uMapA; uniform vec2 uMapB;
${NOISE}
const vec3 LW = vec3(.299, .587, .114);

float mk(vec2 off){ return texture(uMask, (vUv + off) * uMapA + uMapB).r; }
float dil(float r){
  float m = 0.; vec2 s = r / uRes;
  for(int i=0;i<8;i++){ float a = float(i) * .785398; m = max(m, mk(vec2(cos(a), sin(a)) * s)); }
  return m;
}

// one depth layer of falling code on its own grid: x = glyph coverage, y = trail brightness, z = head
vec3 layer(vec2 px, float cellH, float spd, float seed, float density, float bias, out vec2 cellId, out float rnd){
  vec2 cs = vec2(cellH * .6, cellH);
  vec2 cell = floor(px / cs), loc = fract(px / cs);
  cellId = cell;
  float rows = ceil(uRes.y / cs.y);
  rnd = h11(cell.x * 1.37 + seed);
  float on = step(1. - density, h11(cell.x * 3.7 + seed * 1.3));
  float speed = (.25 + .75 * rnd) * 13. * spd;                   // rows / second
  float trail = 8. + 22. * h11(cell.x * 2.11 + seed + 9.7);
  float period = rows + trail + 4.;
  float head = mod(uT * spd * 13. * (.25 + .75 * rnd) + h11(cell.x * 5.3 + seed) * period, period);
  float d = head - cell.y;
  float inTrail = step(0., d) * step(d, trail);
  float b = inTrail * pow(clamp(1. - d / trail, 0., 1.), 1.6) * on;   // clamp: pow(negative) is NaN
  float isHead = step(0., d) * step(d, 1.) * on;
  float tick = floor(uT * (2. + 4. * rnd) + h21(cell + seed) * 10.);
  float gid = floor(h21(cell + seed + tick * .37) * 64.);
  vec2 gl = vec2(1. - loc.x, loc.y);                             // the film's glyphs are mirrored
  float g = texture(uGlyph, (vec2(mod(gid, 8.), floor(gid / 8.)) + gl) / 8., bias).r;
  return vec3(g, b, isHead);
}

void main(){
  vec2 px = vUv * uRes;
  float m = uHasMask > .5 ? smoothstep(.42, .58, mk(vec2(0.))) : 0.;          // 1 = you (foreground)
  float rim = uHasMask > .5 ? clamp(smoothstep(.42, .58, dil(6.)) - m, 0., 1.) : 0.;

  // ── mid layer: the picture, measured per cell, drawn as glyphs ──
  vec2 cell; float rnd;
  vec3 mid = layer(px, uCell, 1., 3.1, 1., 0., cell, rnd);
  vec2 cs = vec2(uCell * .6, uCell);
  float lod = log2(max(cs.y, 1.));
  vec2 cuv = (cell + .5) * cs / uRes, st = cs / uRes;
  #define LUM(u) dot(textureLod(uTex, (u), lod).rgb, LW)
  float l0 = LUM(cuv);
  float gx = LUM(cuv + vec2(st.x, 0.)) - LUM(cuv - vec2(st.x, 0.));
  float gy = LUM(cuv + vec2(0., st.y)) - LUM(cuv - vec2(0., st.y));
  float lb = dot(textureLod(uTex, cuv, lod + 4.).rgb, LW);
  float tone = clamp(pow(l0, .5) * .85 + (l0 - lb) * 1.1 + length(vec2(gx, gy)) * 2.6, 0., 1.);

  vec3 green = vec3(.05, 1., .35);
  float depthLift = mix(.5, 1.15, m);                            // fog the background, lift the person
  vec3 col = green * tone * (.2 + .95 * mid.x) * depthLift;      // the picture, made of glyphs
  col += vec3(.45, .95, .6) * smoothstep(.78, 1., tone) * mid.x * .5 * depthLift;
  col += vec3(.2, 1., .5) * mid.x * mid.y * (.9 + .6 * tone);    // mid rain
  col += vec3(.65, 1., .72) * mid.x * mid.z * 1.1;

  // ── far layer: small, dim, soft — only visible BEHIND you ──
  vec2 c2; float r2;
  vec3 far = layer(px, uCell * .55, .55, 7.7, .8, 1., c2, r2);
  col += vec3(.05, .6, .22) * far.x * (far.y * .9 + far.z * .5) * (1. - m);

  // ── rim light: separates your silhouette from the code behind you ──
  col += vec3(.5, 1., .7) * rim * .6;

  // ── near layer: big, bright, out of focus, in FRONT of everything ──
  vec2 c3; float r3;
  vec3 near = layer(px, uCell * 2.3, 1.7, 13.3, .5, 2.0, c3, r3);
  col += vec3(.35, 1., .6) * near.x * near.y * 1.25;
  col += vec3(.75, 1., .85) * near.x * near.z * 1.5;

  frag = vec4(col, 1.);
}`;

// ── COMIC BOOK — (the first "cardboard" take; kept as its own lens) flat construction-paper cut-outs: posterised colour, hard black outlines,
//    paper grain, stop-motion "boil", and (when a person matte exists) a paper-cut figure with a
//    cream border and drop shadow against a flat sky/snow backdrop. ──────────────────────────
export const COMIC_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform sampler2D uMask;
uniform vec2 uRes; uniform float uBoil; uniform float uHasMask;
uniform vec2 uMapA; uniform vec2 uMapB;       // canvas uv → video uv (mask lookup)
${NOISE}
const vec3 LW = vec3(.299, .587, .114);

float mk(vec2 off){ return texture(uMask, (vUv + off) * uMapA + uMapB).r; }
// widest of 8 taps at radius r (canvas px): a cheap dilation of the matte
float dil(float r){
  float m = 0.; vec2 s = r / uRes;
  for(int i=0;i<8;i++){ float a = float(i) * .785398; m = max(m, mk(vec2(cos(a), sin(a)) * s)); }
  return m;
}
float ero(float r){
  float m = 1.; vec2 s = r / uRes;
  for(int i=0;i<8;i++){ float a = float(i) * .785398; m = min(m, mk(vec2(cos(a), sin(a)) * s)); }
  return m;
}
vec3 flatten(vec3 c){
  c = pow(clamp(c, 0., 1.), vec3(.68));        // lift shadows: dark clothes must not collapse to ink
  float l = dot(c, LW);
  c = mix(vec3(l), c, 1.5);                    // construction paper is punchy
  c = (c - .5) * 1.12 + .52;
  return floor(clamp(c, 0., 1.) * 3. + .5) / 3.;     // 4 flat levels per channel
}
void main(){
  vec2 px = vUv * uRes;
  // stop-motion boil: edges crawl a little, re-rolled ~12x a second
  vec2 wob = (vec2(vn(px / 38. + uBoil * 3.1), vn(px / 38. + uBoil * 3.1 + 17.)) - .5) * 4. / uRes;
  vec2 uv = vUv + wob;

  vec3 scene = flatten(texture(uTex, uv).rgb);

  // Sobel on luma → black ink outlines
  vec2 e = vec2(3.6) / uRes;                  // wide taps: only big shapes get ink, not skin texture
  #define L(o) dot(texture(uTex, uv + (o)).rgb, LW)
  float gx = -L(vec2(-e.x,-e.y)) - 2.*L(vec2(-e.x,0.)) - L(vec2(-e.x,e.y)) + L(vec2(e.x,-e.y)) + 2.*L(vec2(e.x,0.)) + L(vec2(e.x,e.y));
  float gy = -L(vec2(-e.x,-e.y)) - 2.*L(vec2(0.,-e.y)) - L(vec2(e.x,-e.y)) + L(vec2(-e.x,e.y)) + 2.*L(vec2(0.,e.y)) + L(vec2(e.x,e.y));
  float ink = smoothstep(.36, .75, length(vec2(gx, gy)));
  vec3 person = mix(scene, vec3(.05, .04, .04), ink);

  // paper: soft fibres + tooth
  float grain = vn(px / 2.3) * .5 + vn(px / 7.) * .3 + vn(vec2(px.x / 1.4, px.y / 11.)) * .2;
  float paper = .90 + .20 * grain;

  vec3 col = person * paper;

  if (uHasMask > .5) {
    float cov = smoothstep(.42, .58, mk(wob));
    float d12 = smoothstep(.42, .58, dil(13.));
    float d16 = smoothstep(.42, .58, dil(17.));
    float inner = cov - smoothstep(.42, .58, ero(3.5));        // thin ink line along the silhouette

    // flat backdrop: sky over a snowy ridge, cut from paper
    float ridge = .64 + .035 * sin(vUv.x * 9.) + .02 * sin(vUv.x * 23. + 1.7);
    vec3 sky = vec3(.55, .74, .90), snow = vec3(.94, .96, .99);
    vec3 bg = mix(sky, snow, step(ridge, vUv.y)) * paper;
    float sh = smoothstep(.3, .7, mk(wob - vec2(9., 13.) / uRes));
    bg *= 1. - .34 * sh;                                        // drop shadow, down-right

    vec3 cream = vec3(.97, .94, .85) * paper;
    vec3 outCol = bg;
    outCol = mix(outCol, vec3(.05, .04, .04), clamp(d16 - d12, 0., 1.));  // outer ink line
    outCol = mix(outCol, cream, d12);                                      // cream paper rim
    vec3 fig = mix(person * paper, vec3(.05, .04, .04), clamp(inner, 0., 1.));
    col = mix(outCol, fig, cov);
  }
  frag = vec4(clamp(col, 0., 1.), 1.);
}`;

// ── SOUTH PARK — flat paper cut-out characters. No texture survives: the picture is blurred (mip LOD)
//    then quantised to a few flat colours, the person is a thick-black-outlined cut-out on a flat
//    mountain-town backdrop, and each tracked head becomes ONE flat skin colour (the engine then draws
//    the oval eyes and flapping mouth on top). Heads arrive as uHead[i] = (cx, cy, rx, ry) in canvas px. ──
export const SOUTHPARK_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform sampler2D uMask;
uniform vec2 uRes; uniform float uBoil; uniform float uHasMask;
uniform vec2 uMapA; uniform vec2 uMapB;
uniform vec4 uHead[2]; uniform vec2 uSkin[2]; uniform float uHeadOn[2];
${NOISE}
const vec3 LW = vec3(.299, .587, .114);
const vec3 INK = vec3(.03, .03, .03);

float mk(vec2 off){ return texture(uMask, (vUv + off) * uMapA + uMapB).r; }
float dil(float r){
  float m = 0.; vec2 s = r / uRes;
  for(int i=0;i<8;i++){ float a = float(i) * .785398; m = max(m, mk(vec2(cos(a), sin(a)) * s)); }
  return m;
}
// flat construction-paper colour: brightness snaps to a few tones (from the lightly blurred picture),
// hue comes from a much heavier blur — so a region is ONE colour, never a speckle of per-channel steps
vec3 paper(vec3 detail, vec3 broad){
  float l = dot(clamp(detail, 0., 1.), LW);
  float lq = floor(pow(l, .8) * 3. + .5) / 3.;
  lq = max(lq, .1);
  vec3 ch = broad / max(dot(broad, LW), .05);
  ch = clamp(mix(vec3(1.), ch, 1.05), vec3(.25), vec3(2.2));
  return clamp(ch * lq, 0., 1.);
}
float tri(float x){ return abs(fract(x) - .5) * 2.; }

void main(){
  vec2 px = vUv * uRes;
  vec2 wob = (vec2(vn(px / 60. + uBoil * 2.3), vn(px / 60. + uBoil * 2.3 + 11.)) - .5) * 3. / uRes;
  vec2 uv = vUv + wob;

  vec3 fig = paper(textureLod(uTex, uv, 3.4).rgb, textureLod(uTex, uv, 5.2).rgb);

  // each head: one flat skin tone (sampled big-blur at the face's centre) inside a rounded oval
  float head = 0., ring = 0.;
  for(int i=0;i<2;i++){
    if(uHeadOn[i] < .5) continue;
    vec2 d = (px - uHead[i].xy) / uHead[i].zw;
    float len = length(d);
    float inside = 1. - smoothstep(.9, 1., len);
    vec3 sk = textureLod(uTex, uSkin[i], 6.).rgb;
    vec3 skin = paper(sk, sk);
    fig = mix(fig, skin, inside);
    head = max(head, inside);
    ring = max(ring, smoothstep(.93, .98, len) * (1. - smoothstep(1.02, 1.08, len)));
  }
  fig = mix(fig, INK, ring * .9);

  vec3 col = fig;
  if (uHasMask > .5) {
    float cov = smoothstep(.42, .58, mk(wob));
    float out4 = smoothstep(.42, .58, dil(5.));        // thick black outline just outside the body
    // flat mountain-town backdrop: sky, two paper mountain ranges, snow
    vec3 sky = vec3(.47, .70, .93);
    float far = .52 - .11 * tri(vUv.x * 1.6 + .15), near = .60 - .09 * tri(vUv.x * 2.3 + .55);
    vec3 bg = sky;
    bg = mix(bg, vec3(.74, .80, .92), step(far, vUv.y));
    bg = mix(bg, vec3(.60, .68, .84), step(near, vUv.y));
    bg = mix(bg, vec3(.96, .97, 1.), step(.70, vUv.y));
    float sh = smoothstep(.3, .7, mk(wob - vec2(7., 10.) / uRes));
    bg *= 1. - .22 * sh;                                // small cardboard drop shadow
    vec3 outCol = mix(bg, INK, clamp(out4 - cov, 0., 1.));
    col = mix(outCol, fig, cov);
  } else {
    // no cut-out available: flatten the whole frame, ink only the biggest shapes
    vec2 e = vec2(7.) / uRes;
    float a = dot(textureLod(uTex, uv + vec2(e.x, 0.), 3.4).rgb, LW), b = dot(textureLod(uTex, uv - vec2(e.x, 0.), 3.4).rgb, LW);
    float c = dot(textureLod(uTex, uv + vec2(0., e.y), 3.4).rgb, LW), d = dot(textureLod(uTex, uv - vec2(0., e.y), 3.4).rgb, LW);
    col = mix(fig, INK, smoothstep(.10, .22, length(vec2(a - b, c - d))));
  }
  float g = vn(px / 3.) * .6 + vn(px / 9.) * .4;
  col *= .96 + .06 * g;                                 // barely-there paper tooth
  frag = vec4(clamp(col, 0., 1.), 1.);
}`;

// ── BIG FACE — "big eyes, big mouth": a local magnifying bulge over each tracked eye and mouth, and
//    nothing else. The engine passes up to 9 bulges (3 faces × eyes + mouth) as (cx, cy, radius, strength)
//    in canvas px; each pulls the sample point toward its centre, magnifying 1/(1-strength) at the middle
//    and blending to no change at the rim, so the rest of the picture is untouched. ──
export const BIGFACE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform vec2 uRes;
uniform vec4 uBulge[9]; uniform int uN;
void main(){
  vec2 p = vUv * uRes;
  for(int i = 0; i < 9; i++){
    if(i >= uN) break;
    vec2 d = p - uBulge[i].xy;
    float r = length(d) / uBulge[i].z;
    if(r < 1.){
      float k = 1. - r * r;
      p = uBulge[i].xy + d * (1. - uBulge[i].w * k * k);
    }
  }
  frag = vec4(texture(uTex, p / uRes).rgb, 1.);
}`;

// ── NIGHT VISION — goggle phosphor: shadow-lifting gain, live grain, scanlines + a rolling bar, a round
//    goggle vignette, and highlight bloom. ──
export const NIGHT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform vec2 uRes; uniform float uT;
${NOISE}
const vec3 LW = vec3(.299, .587, .114);
void main(){
  vec3 c = mix(texture(uTex, vUv).rgb, textureLod(uTex, vUv, 1.6).rgb, .4);   // light denoise + bloom source
  float l = dot(c, LW);
  float g = pow(clamp(l, 0., 1.), .62) * 1.2;                                 // lift the shadows without flattening the highlights
  float n = h21(vUv * uRes + fract(uT) * 91.7);
  g += (n - .5) * .26 * (1. - g * .5);                                        // live sensor grain
  g *= .86 + .14 * sin(vUv.y * uRes.y * 3.14159);                             // scanlines
  g += .05 * smoothstep(0., .18, sin(vUv.y * 6. - uT * 2.2));                 // rolling bar
  vec2 q = (vUv - .5) * vec2(uRes.x / uRes.y, 1.) * 1.1;
  g *= smoothstep(.95, .42, length(q));                                       // goggle vignette
  g = clamp(g, 0., 1.4);
  vec3 col = vec3(.1, 1., .22) * g + vec3(.55, 1., .65) * pow(clamp(g, 0., 1.), 4.) * .55;
  frag = vec4(col, 1.);
}`;

// ── HEAT MAP — thermal camera: blocky low-res sensor look, brightness read as heat, YOU run hotter than
//    the room (person matte), a warm halo, shimmer, and a temperature legend bar. ──
export const HEAT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform sampler2D uMask;
uniform vec2 uRes; uniform float uT; uniform float uHasMask;
uniform vec2 uMapA; uniform vec2 uMapB;
${NOISE}
const vec3 LW = vec3(.299, .587, .114);
float mk(vec2 off){ return texture(uMask, (vUv + off) * uMapA + uMapB).r; }
float dil(float r){
  float m = 0.; vec2 s = r / uRes;
  for(int i=0;i<8;i++){ float a = float(i) * .785398; m = max(m, mk(vec2(cos(a), sin(a)) * s)); }
  return m;
}
vec3 pal(float t){                         // ironbow: black → indigo → magenta → orange → yellow → white
  t = clamp(t, 0., 1.) * 5.;
  vec3 c0 = vec3(0., 0., .04), c1 = vec3(.22, 0., .45), c2 = vec3(.72, .08, .38), c3 = vec3(1., .42, .04), c4 = vec3(1., .9, .25), c5 = vec3(1.);
  if(t < 1.) return mix(c0, c1, t);
  if(t < 2.) return mix(c1, c2, t - 1.);
  if(t < 3.) return mix(c2, c3, t - 2.);
  if(t < 4.) return mix(c3, c4, t - 3.);
  return mix(c4, c5, t - 4.);
}
void main(){
  vec2 px = vUv * uRes;
  vec2 buv = (floor(px / 4.) * 4. + 2.) / uRes;                   // chunky thermal-sensor pixels
  float l = dot(textureLod(uTex, buv, 2.).rgb, LW);
  float heat = pow(clamp(l, 0., 1.), .8);
  if (uHasMask > .5) {
    float m = smoothstep(.42, .58, mk(vec2(0.)));
    float halo = clamp(smoothstep(.42, .58, dil(16.)) - m, 0., 1.);
    heat = mix(heat * .5, .5 + heat * .55, m);                    // body hot, room cool
    heat += halo * .14;
  }
  heat += (vn(px / 34. + vec2(0., uT * .6)) - .5) * .05;          // heat shimmer
  vec3 col = pal(heat);
  if (vUv.x > .94 && vUv.x < .965 && vUv.y > .25 && vUv.y < .75) {   // legend bar
    col = pal(1. - (vUv.y - .25) / .5);
  }
  frag = vec4(col, 1.);
}`;

// ── AURA — a living halo around the person (needs the matte), coloured by the estimated emotion
//    (uAuraA inner → uAuraB outer; uAuraAmt = how strongly they are feeling it), drifting upward like
//    flame, with sparkle motes and a wrap-light on the silhouette. ──
export const AURA_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform sampler2D uMask;
uniform vec2 uRes; uniform float uT; uniform float uHasMask;
uniform vec2 uMapA; uniform vec2 uMapB;
uniform vec3 uAuraA; uniform vec3 uAuraB; uniform float uAuraAmt;
${NOISE}
float mk(vec2 off){ return texture(uMask, (vUv + off) * uMapA + uMapB).r; }
float dil(float r){
  float m = 0.; vec2 s = r / uRes;
  for(int i=0;i<8;i++){ float a = float(i) * .785398; m = max(m, mk(vec2(cos(a), sin(a)) * s)); }
  return m;
}
float ero(float r){
  float m = 1.; vec2 s = r / uRes;
  for(int i=0;i<8;i++){ float a = float(i) * .785398; m = min(m, mk(vec2(cos(a), sin(a)) * s)); }
  return m;
}
void main(){
  vec2 px = vUv * uRes;
  vec3 scene = texture(uTex, vUv).rgb;
  float m = 0., halo = 0., inner = 0.;
  if (uHasMask > .5) {
    m = smoothstep(.42, .58, mk(vec2(0.)));
    float h1 = smoothstep(.4, .6, dil(9.)), h2 = smoothstep(.4, .6, dil(26.)), h3 = smoothstep(.4, .6, dil(58.));
    halo = clamp(.55 * h1 + .38 * h2 + .3 * h3 - m, 0., 1.);
    inner = clamp(m - smoothstep(.4, .6, ero(6.)), 0., 1.);
  } else {                                                        // no cut-out yet: glow from the frame edges
    float e = min(min(vUv.x, 1. - vUv.x), min(vUv.y, 1. - vUv.y));
    halo = smoothstep(.2, .0, e) * .8;
  }
  float n = vn(px / 48. + vec2(0., -uT * 1.5)) * .6 + vn(px / 20. + vec2(uT * .6, -uT * 2.3)) * .4;
  float flame = smoothstep(.12, .85, halo * (.55 + .9 * n));
  float outward = clamp(smoothstep(.95, .15, halo) + (n - .5) * .35, 0., 1.);
  vec3 aura = mix(uAuraA, uAuraB, outward);
  float pulse = .86 + .14 * sin(uT * 2.4 + n * 3.);
  float amt = .55 + .75 * uAuraAmt;
  vec3 col = scene * (1. - flame * .3);
  col += aura * flame * 1.7 * amt * pulse;                        // the glow
  col += aura * inner * .55 * amt;                                // wrap-light on you
  float mote = step(.993, h21(floor(px / 3.) + floor(uT * 7.))) * halo;
  col += vec3(1., .95, .85) * mote * .9;                          // drifting sparks
  frag = vec4(clamp(col, 0., 1.), 1.);
}`;
