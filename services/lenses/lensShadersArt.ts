// GLSL for the "art" lenses that see the scene in layers: The Matrix, Comic Book, South Park (backdrop
// pass), Pixel Art and ASCII. They share three inputs beyond the frame:
//   uMask  — the subject: MediaPipe selfie matte, or Segment Anything when there's no person (video uv)
//   uDepth — Depth Anything V2, near = white (video uv); uHasDepth = 0 until the model has a map
//   uMapA/uMapB — canvas uv → video uv, so both line up with however the video was fitted
// No dynamic indexing of local arrays/vector components anywhere (this laptop's D3D path) — the
// palette lives in a texture and every loop offset is computed.
import { NOISE } from './lensShaders';

const HEAD = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform sampler2D uMask; uniform sampler2D uDepth;
uniform vec2 uRes; uniform float uT; uniform float uHasMask; uniform float uHasDepth;
uniform vec2 uMapA; uniform vec2 uMapB;
${NOISE}
const vec3 LW = vec3(.299, .587, .114);
float mkAt(vec2 uv){ return texture(uMask, uv * uMapA + uMapB).r; }
float mk(vec2 off){ return mkAt(vUv + off); }
float dpAt(vec2 uv){ return texture(uDepth, uv * uMapA + uMapB).r; }
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
`;

// ── THE MATRIX — "Neo sees the code" (the corridor at the end of the film): the world isn't tinted
//    green, it IS the code. Every surface is built from columns of mirrored katakana falling down it,
//    and the code is sized by DEPTH — the far wall carries tiny, slow, dim glyphs, near surfaces big
//    fast bright ones — so the glyph grids change exactly where objects begin and end, which is what
//    makes the code read as wrapped onto things. Edges (luma + depth + silhouette) carry denser, hotter
//    streams; you are your own code layer; and a glyph-shaped glow sits under every character. ──
export const MATRIX_FRAG = HEAD + `
uniform sampler2D uGlyph; uniform float uCell;

// one grid of falling code: x = glyph, y = trail brightness, z = head, w = glow (blurred glyph)
vec4 layer(vec2 px, float cellH, float spd, float seed, float density, float bias, out vec2 cellId){
  vec2 cs = vec2(cellH * .62, cellH);
  vec2 cell = floor(px / cs), loc = fract(px / cs);
  cellId = cell;
  float rows = ceil(uRes.y / cs.y);
  float rnd = h11(cell.x * 1.37 + seed);
  float on = step(1. - density, h11(cell.x * 3.7 + seed * 1.3));
  float trail = 7. + 24. * h11(cell.x * 2.11 + seed + 9.7);
  float period = rows + trail + 6.;
  float head = mod(uT * spd * 12. * (.3 + .7 * rnd) + h11(cell.x * 5.3 + seed) * period, period);
  float d = head - cell.y;
  float b = step(0., d) * step(d, trail) * pow(clamp(1. - d / trail, 0., 1.), 1.5) * on;
  float isHead = step(0., d) * step(d, 1.) * on;
  float tick = floor(uT * (1.5 + 5. * rnd) + h21(cell + seed) * 10.);      // glyphs mutate in place
  float gid = floor(h21(cell + seed + tick * .37) * 64.);
  vec2 gl = vec2(1. - loc.x, loc.y);                                      // the film's glyphs are mirrored
  vec2 guv = (vec2(mod(gid, 8.), floor(gid / 8.)) + gl * .9 + .05) / 8.;
  float g = texture(uGlyph, guv, bias).r;
  // glow: a softer read of the same glyph, faded out before the cell edge so neighbouring atlas cells never bleed in
  float win = smoothstep(0., .18, loc.x) * smoothstep(1., .82, loc.x) * smoothstep(0., .12, loc.y) * smoothstep(1., .88, loc.y);
  float glow = texture(uGlyph, guv, bias + 1.2).r * win;
  return vec4(g * smoothstep(0., .06, min(loc.y, 1. - loc.y)), b, isHead, glow);
}

void main(){
  vec2 px = vUv * uRes;
  float m = uHasMask > .5 ? smoothstep(.42, .58, mk(vec2(0.))) : 0.;
  float rim = uHasMask > .5 ? clamp(smoothstep(.42, .58, dil(5.)) - m, 0., 1.) : 0.;
  float d = uHasDepth > .5 ? dpAt(vUv) : mix(.45, .8, m);

  // depth band → this pixel's code grid. The person is a band of their own.
  float band = d < .34 ? 0. : (d < .62 ? 1. : 2.);
  float scale = band < .5 ? .6 : (band < 1.5 ? .88 : 1.3);
  float spd = band < .5 ? .65 : (band < 1.5 ? 1. : 1.4);
  float seed = 3.1 + band * 17.3;
  if (m > .5) { scale = 1.02; spd = 1.15; seed = 71.9; }

  vec2 cell;
  vec4 L = layer(px, uCell * scale, spd, seed, 1., 0., cell);
  vec2 cs = vec2(uCell * scale * .62, uCell * scale);
  float lod = log2(max(cs.y, 1.));
  vec2 cuv = (cell + .5) * cs / uRes, st = cs / uRes;
  #define LUM(u) dot(textureLod(uTex, (u), lod).rgb, LW)
  float l0 = LUM(cuv);
  float gx = LUM(cuv + vec2(st.x, 0.)) - LUM(cuv - vec2(st.x, 0.));
  float gy = LUM(cuv + vec2(0., st.y)) - LUM(cuv - vec2(0., st.y));
  float lb = dot(textureLod(uTex, cuv, lod + 4.).rgb, LW);
  float edge = length(vec2(gx, gy)) * 2.4;
  if (uHasDepth > .5) {
    float dx = dpAt(cuv + vec2(st.x, 0.)) - dpAt(cuv - vec2(st.x, 0.));
    float dy = dpAt(cuv + vec2(0., st.y)) - dpAt(cuv - vec2(0., st.y));
    edge += length(vec2(dx, dy)) * 5.;                                    // object contours from depth
  }
  edge = clamp(edge + rim * 1.2, 0., 1.);
  float tone = clamp(pow(l0, .42) * .95 + (l0 - lb) * 1.2 + edge * .9, 0., 1.);

  float fog = uHasDepth > .5 ? mix(.38, 1.15, smoothstep(.1, .85, d)) : mix(.55, 1.12, m);
  vec3 dim = vec3(.0, .23, .07), mid = vec3(.0, .82, .25), hot = vec3(.55, 1., .62);
  float trail = L.y * (.55 + .7 * edge);
  vec3 col = mix(dim, mid, tone) * tone * (.18 + .9 * L.x) * fog;                       // the form, made of glyphs
  col += mix(mid, hot, trail * trail) * L.x * trail * (.75 + .5 * tone) * fog;          // the falling streams
  col += vec3(.82, 1., .86) * L.x * L.z * (1.1 + edge) * fog;                           // white-hot heads
  col += vec3(0., .55, .18) * L.w * (trail * .5 + L.z) * .55 * fog;                     // glyph glow
  float spark = step(.985, h21(cell + floor(uT * 9.) + seed));                          // random flare
  col += vec3(.5, 1., .6) * L.x * spark * tone * .7;

  // far code behind everything that isn't you
  vec2 c2;
  vec4 F = layer(px, uCell * .45, .5, 7.7, .7, 1., c2);
  col += vec3(0., .42, .14) * F.x * (F.y * .7 + F.z * .5) * (1. - m) * (1. - smoothstep(.4, .8, d)) * .8;
  col += vec3(.35, 1., .55) * rim * .45;

  // near streaks: out of focus, in front of everything
  vec2 c3;
  vec4 N = layer(px, uCell * 2.4, 1.8, 13.3, .35, 1.1, c3);
  col += vec3(.3, 1., .55) * N.x * N.y * .9 + vec3(.75, 1., .82) * N.x * N.z * 1.2;
  frag = vec4(col, 1.);
}`;

// ── COMIC BOOK — a printed page, not a filter: XDoG ink lines (the dark side of every real edge),
//    a heavier contour round the subject and along depth breaks, flat cel colour in three tones with
//    black spotting in the deepest shadows, hatching in shadow, Ben-Day dots in the mid-tones, colour
//    printed slightly off-register from the ink on cream newsprint. With a subject matte the
//    background drops to a two-tone halftone panel and action (uMotion = energy, centroid) throws
//    speed lines at the subject. ──
export const COMIC_FRAG = HEAD + `
uniform float uBoil; uniform vec3 uMotion;
float lumAt(vec2 uv){ return dot(texture(uTex, uv).rgb, LW); }
float gblur(vec2 uv, float s){
  float acc = lumAt(uv) * .2, w = .2;
  for(int i=0;i<8;i++){
    float a = float(i) * .785398 + .39;
    vec2 o = vec2(cos(a), sin(a)) * s / uRes;
    acc += lumAt(uv + o) * .12 + lumAt(uv + o * 2.) * .05; w += .17;
  }
  return acc / w;
}
void main(){
  vec2 px = vUv * uRes;
  float k = uRes.y / 720.;                                               // line weights scale with the frame
  vec2 wob = (vec2(vn(px / 50. + uBoil * 2.7), vn(px / 50. + uBoil * 2.7 + 13.)) - .5) * 2.2 / uRes;
  vec2 uv = vUv + wob;

  // ink: XDoG
  float g1 = gblur(uv, 1.1 * k), g2 = gblur(uv, 2.3 * k);
  float ink = smoothstep(.014, .04, g2 - g1);
  float m = 0., contour = 0.;
  if (uHasMask > .5) {
    m = smoothstep(.42, .58, mk(wob));
    contour = clamp(smoothstep(.42, .58, dil(3.5 * k)) - smoothstep(.42, .58, ero(1.5 * k)), 0., 1.);
  }
  if (uHasDepth > .5) {
    vec2 e = 3. * k / uRes;
    float dz = length(vec2(dpAt(uv + vec2(e.x, 0.)) - dpAt(uv - vec2(e.x, 0.)), dpAt(uv + vec2(0., e.y)) - dpAt(uv - vec2(0., e.y))));
    contour = max(contour, smoothstep(.06, .14, dz));
  }

  // colour: flat cel tones from a smooth copy of the frame, printed ~1px off the ink
  vec3 base = textureLod(uTex, uv + vec2(1.2, -.8) / uRes, 2.).rgb;
  float l = dot(base, LW);
  vec3 hue = base / max(l, .04);
  hue = clamp(mix(vec3(1.), hue, 1.35), 0., 2.6);
  float tone = l < .26 ? .34 : (l < .6 ? .66 : .95);
  vec3 col = clamp(hue * tone, 0., 1.);

  // Ben-Day dots in the mid band, hatching in shadow, black spotting at the bottom
  vec2 r45 = mat2(.7071, -.7071, .7071, .7071) * px;
  vec2 dc = fract(r45 / (6.5 * k)) - .5;
  float dots = 1. - smoothstep(.26, .32, length(dc));
  if (tone < .7 && tone > .5) col = mix(col, col * .72, dots * smoothstep(.45, .3, l - .26 + .15));
  float hatch = step(.62, fract((px.x + px.y) / (5. * k)));
  if (tone < .5) col = mix(col, vec3(.05), hatch * smoothstep(.2, .08, l) * .8);
  col = mix(col, vec3(.04), smoothstep(.11, .07, l));

  // newsprint
  float fib = vn(px / 2.2) * .5 + vn(px / 8.) * .3 + vn(vec2(px.x / 1.3, px.y / 12.)) * .2;
  vec3 paper = vec3(.97, .94, .86) * (.93 + .1 * fib);

  if (uHasMask > .5) {
    // background panel: one flat colour + a dot screen, lifted so the figure pops
    vec3 bgc = clamp(hue * .78, 0., 1.);
    vec2 dc2 = fract(r45 / (9. * k)) - .5;
    float dr = .12 + .3 * (1. - l);
    vec3 bg = mix(mix(vec3(.98, .93, .78), bgc, .45), bgc * .7, 1. - smoothstep(dr, dr + .06, length(dc2)));
    bg = mix(bg, vec3(.05), ink * .55);
    // speed lines: radial streaks converging on the action
    vec2 c = vec2(mix(.5, uMotion.y, .6), mix(.5, uMotion.z, .6));
    vec2 q = (vUv - c) * vec2(uRes.x / uRes.y, 1.);
    float a = atan(q.y, q.x), r = length(q);
    float streak = step(.72, h11(floor(a * 110.) + uBoil * .13)) * smoothstep(.18, .55, r);   // re-drawn every boil
    bg = mix(bg, vec3(.05), clamp(streak * smoothstep(.12, .45, uMotion.x), 0., 1.) * .85);
    col = mix(bg, col, m);
  }
  col *= paper;
  col = mix(col, vec3(.04, .035, .04), max(ink, contour));
  frag = vec4(clamp(col, 0., 1.), 1.);
}`;

// ── SOUTH PARK backdrop pass — the WORLD as construction paper, with the real person REMOVED: where
//    the matte says "person", the engine's clean plate (the background as last seen, premultiplied,
//    mipmapped) shows instead, push-pull filled from coarser levels where it has never been seen. The
//    engine then lays the jointed paper puppet over this. ──
export const SOUTHPARK_FRAG = HEAD + `
uniform sampler2D uPlate; uniform float uHasPlate; uniform float uBoil;
const vec3 INK = vec3(.03, .03, .03);
vec3 paperCol(vec3 detail, vec3 broad){
  float l = dot(clamp(detail, 0., 1.), LW);
  float lq = max(floor(pow(l, .8) * 3. + .5) / 3., .12);
  vec3 ch = broad / max(dot(broad, LW), .05);
  ch = clamp(mix(vec3(1.), ch, 1.15), vec3(.25), vec3(2.2));
  return clamp(ch * lq, 0., 1.);
}
vec3 plateAt(vec2 vuv, float lod0){
  vec4 s = vec4(0.);
  for (int i = 0; i < 8; i++) {                                           // push-pull: first level that knows
    s = textureLod(uPlate, vuv, lod0 + float(i));
    if (s.a > .3) break;
  }
  return s.rgb / max(s.a, .001);
}
void main(){
  vec2 px = vUv * uRes;
  vec2 wob = (vec2(vn(px / 60. + uBoil * 2.3), vn(px / 60. + uBoil * 2.3 + 11.)) - .5) * 2.5 / uRes;
  vec2 uv = vUv + wob;
  vec3 detail = textureLod(uTex, uv, 2.6).rgb, broad = textureLod(uTex, uv, 4.).rgb;
  if (uHasMask > .5 && uHasPlate > .5) {
    float m = smoothstep(.3, .5, dil(8.));
    vec2 vuv = uv * uMapA + uMapB;
    detail = mix(detail, plateAt(vuv, .6), m);
    broad = mix(broad, plateAt(vuv, 2.), m);
  }
  vec3 col = paperCol(detail, broad);
  // ink only on the big shapes of the flattened world
  vec2 e = vec2(2.5) * uRes.y / 720. / uRes;
  float a = dot(paperCol(textureLod(uTex, uv + vec2(e.x, 0.), 2.6).rgb, broad), LW), b = dot(paperCol(textureLod(uTex, uv - vec2(e.x, 0.), 2.6).rgb, broad), LW);
  float c = dot(paperCol(textureLod(uTex, uv + vec2(0., e.y), 2.6).rgb, broad), LW), d = dot(paperCol(textureLod(uTex, uv - vec2(0., e.y), 2.6).rgb, broad), LW);
  float edge = smoothstep(.15, .27, length(vec2(a - b, c - d)));
  if (uHasMask > .5 && uHasPlate > .5) edge *= 1. - smoothstep(.3, .5, dil(10.));   // no ghost outline of the removed person
  col = mix(col, INK, edge);
  float g = vn(px / 3.) * .6 + vn(px / 9.) * .4;
  col *= .955 + .07 * g;                                                  // paper tooth
  frag = vec4(clamp(col, 0., 1.), 1.);
}`;

// ── PIXEL ART — the frame redrawn as a sprite-era scene, not just big pixels: each cell is the box
//    average of the picture, contrast/saturation pushed like a hand-picked palette, Bayer-dithered and
//    snapped to a 32-colour palette (uPal, nearest in OKLab). DEPTH splits the world into parallax-style
//    planes that haze toward the sky colour the further back they sit (with heavier dither), and the
//    SUBJECT becomes a sprite: full palette, a 1-cell dark outline, a top-left rim highlight. ──
export const PIXEL_FRAG = HEAD + `
uniform sampler2D uPal; uniform float uPalN; uniform float uGrid;
vec3 oklab(vec3 c){
  c = pow(clamp(c, 0., 1.), vec3(2.2));
  float l = .4122214708 * c.r + .5363325363 * c.g + .0514459929 * c.b;
  float m = .2119034982 * c.r + .6806995451 * c.g + .1073969566 * c.b;
  float s = .0883024619 * c.r + .2817188376 * c.g + .6299787005 * c.b;
  l = pow(l, 1. / 3.); m = pow(m, 1. / 3.); s = pow(s, 1. / 3.);
  return vec3(.2104542553 * l + .7936177850 * m - .0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .8086757660 * s);
}
vec3 nearest(vec3 c){
  vec3 lc = oklab(c), best = vec3(0.); float bd = 1e9;
  for (int i = 0; i < 32; i++) {
    if (float(i) >= uPalN) break;
    vec3 p = texelFetch(uPal, ivec2(i, 0), 0).rgb;
    vec3 dl = oklab(p) - lc;
    float dd = dl.x * dl.x * 1.6 + dl.y * dl.y + dl.z * dl.z;
    if (dd < bd) { bd = dd; best = p; }
  }
  return best;
}
float bayer(vec2 cell){
  int x = int(mod(cell.x, 4.)), y = int(mod(cell.y, 4.));
  int a = x ^ y;
  int v = ((a & 1) << 3) | ((y & 1) << 2) | (((a >> 1) & 1) << 1) | ((y >> 1) & 1);
  return (float(v) + .5) / 16. - .5;
}
float subjAt(vec2 cell){ return uHasMask > .5 ? step(.5, mkAt((cell + .5) * uGrid / uRes)) : 0.; }
float depAt(vec2 cell){ return uHasDepth > .5 ? dpAt((cell + .5) * uGrid / uRes) : .5; }
void main(){
  vec2 px = vUv * uRes;
  vec2 cell = floor(px / uGrid);
  vec2 cuv = (cell + .5) * uGrid / uRes;
  vec3 c = textureLod(uTex, cuv, log2(uGrid) - .5).rgb;
  float s = subjAt(cell), d = depAt(cell);
  float l = dot(c, LW);
  c = mix(vec3(l), c, 1.3);
  c = (c - .5) * 1.12 + .5;
  float ditherAmt = .1;
  if (uHasDepth > .5 && s < .5) {
    float plane = floor(clamp(d, 0., .999) * 4.) / 3.;                   // 4 parallax planes
    vec3 sky = textureLod(uTex, vec2(.5, .15), 10.).rgb * vec3(.85, .95, 1.2) + vec3(.05, .08, .14);
    c = mix(c, clamp(sky, 0., 1.), (1. - plane) * .5);
    c = mix(vec3(dot(c, LW)), c, .7 + .3 * plane);
    ditherAmt = .1 + (1. - plane) * .08;
  }
  c += bayer(cell) * ditherAmt;
  vec3 col = nearest(c);
  if (uHasMask > .5) {
    float nU = subjAt(cell + vec2(0., -1.)), nD = subjAt(cell + vec2(0., 1.)), nL = subjAt(cell + vec2(-1., 0.)), nR = subjAt(cell + vec2(1., 0.));
    if (s < .5 && max(max(nU, nD), max(nL, nR)) > .5) col = texelFetch(uPal, ivec2(0, 0), 0).rgb;   // sprite outline
    else if (s > .5 && (nU < .5 || nL < .5)) col = nearest(col * 1.3 + .06);                         // rim light, top-left
  }
  if (uHasDepth > .5 && s < .5) {                                         // depth breaks: shade the far side
    float dn = max(max(depAt(cell + vec2(1., 0.)), depAt(cell + vec2(-1., 0.))), max(depAt(cell + vec2(0., 1.)), depAt(cell + vec2(0., -1.))));
    if (dn - d > .14) col = nearest(col * .55);
  }
  frag = vec4(col, 1.);
}`;

// ── ASCII — a live terminal rendering: monospace cells, each picking a character by brightness from a
//    density ramp, or — where there is structure — an EDGE character (| _ / \\) aligned to the contour.
//    Contours come from luma, depth breaks and the subject silhouette together, so objects get drawn
//    outlines instead of noise. Depth fogs the far plane; the subject keeps its true colour while the
//    background goes to a cool phosphor mono. ──
export const ASCII_FRAG = HEAD + `
uniform sampler2D uGlyph; uniform float uCell;
void main(){
  vec2 px = vUv * uRes;
  vec2 cs = vec2(uCell * .6, uCell);
  vec2 cell = floor(px / cs), loc = fract(px / cs);
  vec2 cuv = (cell + .5) * cs / uRes, st = cs / uRes;
  float lod = log2(max(cs.y, 1.)) - .3;
  vec3 c = textureLod(uTex, cuv, lod).rgb;
  #define LUM(u) dot(textureLod(uTex, (u), lod).rgb, LW)
  float l = dot(c, LW);
  float lb = dot(textureLod(uTex, cuv, lod + 3.).rgb, LW);
  l = clamp(pow(l, .6) + (l - lb) * .9, 0., 1.);
  vec2 g = vec2(LUM(cuv + vec2(st.x, 0.)) - LUM(cuv - vec2(st.x, 0.)), LUM(cuv + vec2(0., st.y)) - LUM(cuv - vec2(0., st.y)));
  float d = .6, s = 0.;
  if (uHasDepth > .5) {
    d = dpAt(cuv);
    g += vec2(dpAt(cuv + vec2(st.x, 0.)) - dpAt(cuv - vec2(st.x, 0.)), dpAt(cuv + vec2(0., st.y)) - dpAt(cuv - vec2(0., st.y))) * 2.2;
  }
  if (uHasMask > .5) {
    s = smoothstep(.4, .6, mkAt(cuv));
    g += vec2(mkAt(cuv + vec2(st.x, 0.)) - mkAt(cuv - vec2(st.x, 0.)), mkAt(cuv + vec2(0., st.y)) - mkAt(cuv - vec2(0., st.y))) * .8;
  }
  float gi;
  if (length(g) > .2) {
    float a = mod(atan(g.y, g.x) + 3.14159, 3.14159);                     // gradient direction, 0..pi
    // gradient → edge glyph (the edge runs perpendicular to it): 12 '|', 13 '_', 14 '/', 15 '\\'
    gi = a < .39 || a > 2.75 ? 12. : (a < 1.18 ? 15. : (a < 1.96 ? 13. : 14.));
  } else {
    gi = floor(clamp(l, 0., .999) * 12.);                                 // density ramp
  }
  float glyph = textureLod(uGlyph, (vec2(mod(gi, 4.), floor(gi / 4.)) + loc * .92 + .04) / 4., log2(max(1., 128. / cs.y))).r;   // explicit LOD: no mip bleed across cells
  float fog = uHasDepth > .5 ? mix(.3, 1.1, smoothstep(.1, .8, d)) : 1.;
  vec3 mono = vec3(.55, .95, 1.) * (.45 + .8 * l);
  vec3 tint = mix(vec3(dot(c, LW)), c, 1.5) * 1.25 + .08;
  vec3 ink = uHasMask > .5 ? mix(mono, tint, s) : mix(mono, tint, .75);
  vec3 col = vec3(.015, .02, .03) + ink * glyph * fog;
  frag = vec4(clamp(col, 0., 1.), 1.);
}`;
