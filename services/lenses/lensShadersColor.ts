// GLSL for the Colorize lens — believable real-time colour for black-and-white film, done the way a
// colourist (and the colorization literature) does it rather than by tinting:
//
//   1. The grey is a MEASUREMENT. A b&w negative recorded one number per point: the scene's spectrum
//      weighted by the stock's sensitivity (panchromatic ≈ the eye's luminance Y; pre-1927 orthochromatic
//      stock was blind to red). Everything happens in LINEAR light, and the colour we invent must
//      photograph back to exactly the grey on screen through that same sensitivity: rgb is solved so
//      dot(rgb, uStock) == Y. That is also why ortho footage colourizes correctly — skin and lips that
//      went dark on ortho come back as the brighter reds they really were.
//   2. Only chroma is invented; luminance (and with it every bit of grain, focus and detail) is the
//      original. Colour is chosen at low resolution from region semantics — a colourist paints shapes,
//      not pixels — in Oklab, where hue and chroma behave perceptually.
//   3. Semantics: sky (bright, even, high, far — Rayleigh blue deepening toward the zenith, paling at
//      the horizon, white where cloud), foliage (mid-dark, leafy texture — blue-green in shade, yellow-
//      green where sun shines through), earth/stone at the bottom, warm plaster and wood indoors. People
//      come from the person matte and the face tracker: skin (one melanin/haemoglobin hue for every
//      complexion, warmer and more saturated in shadow, as subsurface scattering does), lips, hair (dark
//      eumelanin brown → golden pheomelanin as it lightens), and a period wardrobe banded by value.
//      Depth Anything, when present, adds atmospheric perspective: distance desaturates and turns blue.
//   4. Light has colour: shadows lean cool (they are lit by the sky), highlights warm (sun / tungsten key).
//   5. Colour is propagated, not stamped. The low-res chroma is upsampled with a joint bilateral filter
//      guided by the full-res grey (Levin et al.'s "neighbours of similar intensity share colour", as
//      Kopf et al.'s joint bilateral upsampling), so it snaps to the real edges.
//   6. It is stable. The chroma buffer is a temporal accumulator: a region keeps its colour from frame to
//      frame and only re-decides where the grey actually changed, or on a cut.
//
// Same contract as lensShaders.ts: `uTex` is the composited frame (uv (0,0) = top-left), mipmapped.
// The analysis pass renders into an FBO; through LENS_VERT its texture rows run bottom-up, so anything
// reading it samples at (u, 1 - v). Rule from this laptop's D3D path: no dynamic indexing of local
// arrays or vector components.

const COMMON = `
const vec3 Y709 = vec3(.2126, .7152, .0722);
vec3 toLin(vec3 c){ return mix(c / 12.92, pow((c + .055) / 1.055, vec3(2.4)), step(.04045, c)); }
vec3 toSrgb(vec3 c){ c = max(c, 0.); return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
// Oklab (Ottosson 2020)
vec3 linToOklab(vec3 c){
  vec3 lms = vec3(dot(c, vec3(.4122214708, .5363325363, .0514459929)),
                  dot(c, vec3(.2119034982, .6806995451, .1073969566)),
                  dot(c, vec3(.0883024619, .2817188376, .6299787005)));
  lms = pow(max(lms, 0.), vec3(1. / 3.));
  return vec3(dot(lms, vec3(.2104542553, .7936177850, -.0040720468)),
              dot(lms, vec3(1.9779984951, -2.4285922050, .4505937099)),
              dot(lms, vec3(.0259040371, .7827717662, -.8086757660)));
}
vec3 oklabToLin(vec3 o){
  vec3 lms = vec3(o.x + .3963377774 * o.y + .2158037573 * o.z,
                  o.x - .1055613458 * o.y - .0638541728 * o.z,
                  o.x - .0894841775 * o.y - 1.2914855480 * o.z);
  lms = lms * lms * lms;
  return vec3(dot(lms, vec3(4.0767416621, -3.3077115913, .2309699292)),
              dot(lms, vec3(-1.2684380046, 2.6097574011, -.3413193965)),
              dot(lms, vec3(-.0041960863, -.7034186147, 1.7076147010)));
}
/** Oklab chroma vector from hue (degrees) + chroma. */
vec2 hc(float hDeg, float c){ float h = radians(hDeg); return vec2(cos(h), sin(h)) * c; }
`;

// ── ANALYSIS (low-res, ~1/8): what is this region, so what colour was it — blended into the previous
//    frame's answer. Out: rg = Oklab a,b (×2 + .5), b = the grey it was decided on, a = 1. ──
export const COLORIZE_ANALYZE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform sampler2D uPrev; uniform sampler2D uMask; uniform sampler2D uDepth;
uniform vec2 uRes; uniform float uCut; uniform vec3 uStock;
uniform float uHasMask; uniform vec2 uMapA; uniform vec2 uMapB; uniform float uHasDepth;
uniform vec4 uFace[3]; uniform vec4 uLip[3]; uniform int uNF;
uniform sampler2D uSeg; uniform sampler2D uMatPal; uniform float uHasSeg; uniform vec4 uSegRect;
uniform vec2 uSegOff; uniform float uSegTrust;   // cached labels: camera drift since their keyframe, and how much the picture still agrees   // scene materials (sceneSegment.ts) + their ramps
uniform vec4 uLook[3];   // per tracked face: the actor's complexion (hue°, chroma) + hair (hue°, chroma); chroma 0 = not known
uniform vec4 uWard[3];   // per tracked face: wardrobe top (hue°, chroma) + bottom (hue°, chroma); chroma 0 = not known
${COMMON}
/** Perceptual grey (Oklab L of a neutral with the stock's measured luminance). */
float greyL(vec2 uv, float lod){ return pow(max(dot(toLin(textureLod(uTex, uv, lod).rgb), uStock), 0.), 1. / 3.); }
void main(){
  vec2 uv = vUv;
  float L = greyL(uv, 3.);                                   // the block's grey (this pass is ~1/8 res)
  // texture energy: spread of the 2px detail inside the block (leaves, grass, gravel vs sky, skin, plaster)
  float s1 = 0., s2 = 0.;
  for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) {
    float v = greyL(uv + (vec2(float(i), float(j)) - 1.5) * 2. / uRes, 1.);
    s1 += v; s2 += v * v;
  }
  s1 /= 16.;
  float tex = sqrt(max(s2 / 16. - s1 * s1, 0.));
  float around = greyL(uv, 5.5);                             // the neighbourhood's grey
  float y = uv.y;                                            // 0 = top of frame

  // scene prior: is there open sky along the top? (bright, even top band)
  // (the brightest of five patches: trees and buildings often frame the sky at the corners)
  float top = max(max(greyL(vec2(.1, .07), 4.), greyL(vec2(.3, .07), 4.)), max(greyL(vec2(.5, .07), 4.), max(greyL(vec2(.7, .07), 4.), greyL(vec2(.9, .07), 4.))));
  float exterior = smoothstep(.7, .85, top);

  float far = .5;
  if (uHasDepth > .5) far = 1. - texture(uDepth, uv * uMapA + uMapB).r;   // Depth Anything: near = white
  float person = uHasMask > .5 ? smoothstep(.4, .6, texture(uMask, uv * uMapA + uMapB).r) : 0.;

  // ── what the segmenter says this is: a material, and that material's grey → colour ramp ──
  vec2 segAb = vec2(0.); float segTrust = 0.;
  if (uHasSeg > .5) {
    vec2 su = (uv - uSegOff - uSegRect.xy) / (uSegRect.zw - uSegRect.xy);   // labels cover the picture inside any black bars
    vec2 sv = texture(uSeg, su).rg;
    sv.g *= step(0., su.x) * step(su.x, 1.) * step(0., su.y) * step(su.y, 1.) * uSegTrust;
    int mat = int(sv.r * 255. + .5);
    vec4 p0 = texelFetch(uMatPal, ivec2(mat, 0), 0), p1 = texelFetch(uMatPal, ivec2(mat, 1), 0);
    segAb = mix((p0.rg - .5) * .5, (p1.rg - .5) * .5, smoothstep(p0.b, p1.b, L));
    float conf = smoothstep(.3, .8, sv.g);
    segTrust = p0.a * conf;
    // a tree is leaves AND trunk: where the block is smooth it is bark (red-brown), where it is busy, leaves
    if (abs(p1.a - .25) < .1) segAb = mix(segAb, hc(45., .035), (1. - smoothstep(.015, .05, tex)) * smoothstep(.4, .55, L));
    person = max(person, step(.4, p1.a) * conf);             // people and their clothes — the segmenter finds what the selfie matte misses
  }
  float hasPeople = max(uHasMask, uHasSeg);

  // ── faces: skin oval, lips, eyes, hair cap (tracker landmarks, canvas uv) ──
  float skin = 0., lip = 0., eye = 0., hair = 0.;
  vec2 wardAb = vec2(0.); float wardW = 0.;
  vec4 look = vec4(0.); float lookW = 0.;
  for (int k = 0; k < 3; k++) {
    if (k >= uNF) break;
    vec4 f = uFace[k];
    vec2 q = (uv - f.xy) / f.zw;
    float d = length(q);
    float oval = smoothstep(1.05, .78, d);
    float near = smoothstep(1.8, 1., d);
    if (near > lookW) { lookW = near; look = uLook[k]; }
    skin = max(skin, oval);
    vec4 m = uLip[k];
    vec2 lq = (uv - m.xy) / vec2(m.z * .6, m.z * .3 * uRes.x / uRes.y);
    lip = max(lip, smoothstep(1., .55, length(lq)) * m.w * smoothstep(.0, -.04, L - around));
    eye = max(eye, smoothstep(.16, .05, abs(q.y + .2)) * smoothstep(.15, .3, abs(q.x)) * smoothstep(.7, .5, abs(q.x)) * smoothstep(.1, -.06, L - around));
    // hair: a cap over the crown and down the sides, outside the skin oval
    float cap = smoothstep(1.55, 1.1, length(q * vec2(.9, 1.))) * smoothstep(.1, -.45, q.y);
    hair = max(hair, cap * (1. - oval));
    // this character's clothes: the body below their face — torso ~4 head-heights, then the skirt/trousers
    vec4 wd = uWard[k];
    float below = smoothstep(.6, 1.1, q.y) * smoothstep(3.2, 2.2, abs(q.x));
    float isTop = smoothstep(6.5, 5.5, q.y);
    vec2 want = mix(hc(wd.z, wd.w), hc(wd.x, wd.y), isTop);
    float known = mix(step(.001, wd.w), step(.001, wd.y), isTop);
    float w = below * known;
    if (w > wardW) { wardW = w; wardAb = want; }
  }
  hair *= 1. - skin * .8;
  hair *= hasPeople > .5 ? person : smoothstep(.6, .3, L);   // no matte: only the darker greys round the head

  // ── weights for each kind of surface ──
  float even = 1. - smoothstep(.015, .05, tex);
  float leafy = smoothstep(.03, .08, tex);
  float bg = 1. - person;
  float wSky = exterior * smoothstep(.55, .72, L) * even * smoothstep(.75, .2, y) * mix(1., smoothstep(.45, .8, far), uHasDepth) * bg;
  float wLeaf = leafy * smoothstep(.12, .25, L) * smoothstep(.72, .5, L) * smoothstep(.95, .55, y) * bg * (1. - wSky) * mix(.15, 1., exterior);   // indoors, texture is fabric and carving, not leaves
  float wEarth = smoothstep(.55, .9, y) * bg * (1. - wLeaf * .6);
  float wWall = even * smoothstep(.35, .55, L) * bg * (1. - wSky);
  float wWood = smoothstep(.45, .2, L) * (1. - leafy * .7) * bg;
  // with no tracker/matte, even mid-high greys in the middle of frame are most often a face or hands
  float wSkinGuess = hasPeople > .5 ? person * even * smoothstep(.04, .12, L) * (uNF > 0 ? .25 : .45) : 0.;
  float wSkin = max(skin, wSkinGuess) * (1. - eye * .7);
  float wHair = hair;
  float wCloth = person * (1. - clamp(wSkin + wHair, 0., 1.));
  float wNeutral = .15;

  // ── what each one looks like (Oklab a,b), at this grey ──
  vec2 sky = hc(252., mix(.035, .1, smoothstep(.65, .05, y)) * (1. - smoothstep(.86, .97, L)));   // zenith deepens; clouds go white
  sky += hc(70., .012) * smoothstep(.75, .95, L);                                                // sunlit cloud tops
  vec2 leaf = mix(hc(160., .055), hc(122., .075), smoothstep(.2, .5, L));                         // shade blue-green → lit yellow-green
  vec2 earth = hc(68., .035 * smoothstep(.08, .3, L));
  vec2 wall = hc(80., .028);                                                                   // warm plaster / paper
  vec2 wood = hc(58., .05 * smoothstep(.05, .25, L));
  vec2 skinC = hc(mix(42., 58., smoothstep(.35, .8, L)), mix(.085, .06, smoothstep(.35, .8, L)));   // shadow side redder (subsurface)
  vec2 lipC = hc(22., .1);
  vec2 hairC = mix(hc(55., .03), hc(80., .075), smoothstep(.3, .7, L));                          // eumelanin → pheomelanin
  // the actual actor, when the colour script knows them: their complexion and hair, shaded by the film's grey
  if (look.y > 0.) skinC = hc(look.x + mix(-8., 6., smoothstep(.35, .8, L)), look.y * mix(1.15, .85, smoothstep(.35, .8, L)));
  if (look.w > 0.) hairC = hc(look.z, look.w * smoothstep(.05, .35, L));
  vec2 cloth = L < .3 ? mix(hc(60., .018), hc(255., .035), smoothstep(.16, .3, L))             // black (hair or suit) → navy / charcoal
             : L < .65 ? mix(hc(70., .04), hc(95., .035), smoothstep(.3, .65, L))              // brown → olive / khaki
             : hc(85., .015);                                                                  // white & cream linen
  vec2 neutral = hc(75., .01);
  // a known costume colour (colour script) replaces the period guess; the grey still sets how much chroma fits
  cloth = mix(cloth, wardAb * smoothstep(.04, .3, L), wardW);

  float wsum = wSky + wLeaf + wEarth + wWall + wWood + wSkin + wHair + wCloth + wNeutral + lip;
  vec2 ab = (sky * wSky + leaf * wLeaf + earth * wEarth + wall * wWall + wood * wWood + skinC * wSkin
           + hairC * wHair + cloth * wCloth + neutral * wNeutral + lipC * lip * 2.) / (wsum + lip);

  // the segmenter's material, where it is sure, outranks the texture/position guesses (people keep their own logic)
  ab = mix(ab, segAb, segTrust * (1. - person));

  // light has colour: cool sky fill in the shadows, warm key in the highlights
  ab += hc(250., .018) * smoothstep(.45, .1, L) * (1. - max(wSkin, person * .8)) + hc(72., .016) * smoothstep(.55, .9, L) * (1. - wSky);
  // atmospheric perspective: distance scatters toward the sky's blue and loses saturation
  if (uHasDepth > .5) { float a = smoothstep(.55, .95, far) * (1. - wSky) * .55; ab = mix(ab, hc(245., .03), a); }

  // ── temporal memory: keep last frame's colour unless the grey here changed (motion / new content) or the shot cut ──
  vec4 prev = texture(uPrev, vec2(uv.x, 1. - uv.y));
  float changed = smoothstep(.03, .14, abs(L - prev.b));
  float k = max(uCut, max(mix(.1, 1., changed), 1. - prev.a));
  vec2 outAb = mix((prev.rg - .5) * .5, ab, k);
  frag = vec4(outAb * 2. + .5, L, 1.);
}`;

// ── TECHNICOLOR No. IV (3-strip, 1932–55), simulated physically rather than as a "saturated" preset:
//    the beam-splitter camera exposes three b&w separation negatives through red / green / blue filters
//    (with the filters' real spectral overlap); each becomes a gelatin matrix that soaks up dye in
//    proportion to how LITTLE light it saw (an S-shaped characteristic curve: toe, straight line, shoulder),
//    and transfers it to the print: red record → cyan, green → magenta, blue → yellow, over a faint silver
//    key that deepens the blacks. The dyes aren't ideal — magenta also swallows blue, cyan some green —
//    and those unwanted absorptions are the look: dense primaries, luminous reds, deep cyan skies.
//    Optical density adds; transmission = 10^-D. The print is balanced so an 18% grey projects as 18% grey. ──
const TECHNICOLOR = `
vec3 tcPrint(vec3 rgb){
  vec3 E = vec3(dot(rgb, vec3(.88, .11, .01)), dot(rgb, vec3(.07, .86, .07)), dot(rgb, vec3(.01, .12, .87)));   // separations
  vec3 x = log2(max(E, 1e-5)) + 2.47;                         // stops from mid grey
  vec3 dye = 1.6 / (1. + exp(1.55 * x));                       // C, M, Y dye laid down (steep matrices: saturated separations)
  float key = .14 / (1. + exp(1.2 * (log2(max(dot(rgb, vec3(.2126, .7152, .0722)), 1e-5)) + 2.47)));
  // optical density at the R, G, B of the projector lamp: columns = cyan, magenta, yellow absorption spectra
  mat3 ABS = mat3(vec3(1., .28, .08), vec3(.12, 1., .38), vec3(.03, .12, 1.));
  vec3 D = ABS * dye + key;
  return pow(vec3(10.), -D);
}
vec3 technicolor(vec3 rgb){
  vec3 grey = tcPrint(vec3(.18));
  vec3 tc = tcPrint(rgb) / grey * .18;
  // the steep records over-crush the tones; give back most of the scene's luminance, keep the dye's colour
  float yi = dot(rgb, vec3(.2126, .7152, .0722)), yt = max(dot(tc, vec3(.2126, .7152, .0722)), 1e-4);
  return clamp(tc * pow(max(yi, 1e-4) / yt, .7), 0., 1.);
}
`;

// ── RECONSTRUCTION (full res): original grey + joint-bilateral-upsampled chroma, solved so the colour
//    photographs back to the very same grey on the stock. ──
export const COLORIZE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform sampler2D uChroma; uniform vec2 uCRes; uniform vec3 uStock; uniform float uAmt; uniform float uGrade;
${COMMON}
${TECHNICOLOR}
void main(){
  vec3 lin = toLin(texture(uTex, vUv).rgb);
  float Y = max(dot(lin, uStock), 0.);                        // what the film measured here
  float L = pow(Y, 1. / 3.);
  // joint bilateral upsampling: 3×3 chroma taps, weighted by space and by how alike their grey is to ours
  vec2 c = vec2(vUv.x, 1. - vUv.y) * uCRes - .5;
  vec2 base = floor(c), fr = c - base;
  vec2 ab = vec2(0.); float ws = 0.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o = vec2(float(i), float(j));
    vec4 t = texture(uChroma, (base + o + .5) / uCRes);
    vec2 dd = o - fr;
    float w = exp(-dot(dd, dd) * .9) * exp(-pow((t.b - L) / .07, 2.)) + 1e-5;
    ab += (t.rg - .5) * .5 * w; ws += w;
  }
  ab /= ws;
  ab *= smoothstep(.0, .3, L) * (1. - smoothstep(.9, 1., L)) * uAmt;   // near black / white there is no room for colour

  vec3 rgb = max(oklabToLin(vec3(L, ab)), 0.);
  rgb *= Y / max(dot(rgb, uStock), 1e-5);                     // photographs back to exactly the measured grey
  // pull out-of-gamut colour toward the neutral of the same luminance (keeps Y, keeps hue)
  vec3 g = vec3(Y), d = rgb - g;
  vec3 hi = mix(vec3(1e3), (1. - g) / max(d, 1e-5), step(1e-5, d));
  vec3 lo = mix(vec3(1e3), g / max(-d, 1e-5), step(1e-5, -d));
  float t = clamp(min(min(min(hi.x, hi.y), hi.z), min(min(lo.x, lo.y), lo.z)), 0., 1.);
  rgb = g + d * t;
  if (uGrade > 0.) rgb = mix(rgb, technicolor(rgb), uGrade);
  frag = vec4(toSrgb(rgb), 1.);
}`;
