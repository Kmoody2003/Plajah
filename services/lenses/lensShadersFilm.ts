// GLSL for the film/tape lenses: Silent Film, Grindhouse, VHS Camcorder, Found Footage.
// Same contract as lensShaders.ts: the composited frame is `uTex` (uv (0,0) = top-left), mipmapped.
// `uSeed` is the FRAME number of the held frame — every per-frame artefact (grain, dust, flicker,
// weave) is keyed off it, so a held frame stays identical until the projector advances.
//
// Rule from this laptop's D3D path: no dynamic indexing of local arrays or vector components — loops
// below only ever compute their offsets arithmetically.
import { NOISE } from './lensShaders';

const HEAD = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform vec2 uRes; uniform float uT; uniform float uSeed;
${NOISE}
const vec3 LW = vec3(.299, .587, .114);
`;

/** Scratch: a thin line that lives for a run of frames, wanders sideways, and breaks up along its length. */
const SCRATCH = `
float scratch(vec2 uv, float f, float lane, float life, float aspect){
  float run = floor(f / life);                                   // a scratch survives ~life frames
  float alive = step(.42, h11(run * 3.31 + lane * 11.7));
  float x = h11(run * 7.73 + lane * 3.1) + (vn(vec2(f * .21, lane * 9.)) - .5) * .012;
  float w = (.45 + 1.6 * h11(run + lane * 2.3)) / uRes.x;
  float d = abs(uv.x - x);
  float line = 1. - smoothstep(w * .4, w * 1.4, d);
  line *= smoothstep(.2, .45, vn(vec2(uv.y * (3. + 5. * h11(run + lane)) + run * 4.1, lane * 5.)));   // broken along y
  return line * alive;
}
`;

// ── SILENT FILM — hand-cranked 1910s nitrate: 16fps judder (the engine holds frames), orthochromatic
//    stock (blind to red: lips and skin go dark, skies blow out), crushed blacks + bloomed whites,
//    exposure flicker, gate weave and the odd frame-line hop, clumpy silver grain, scratches, dust and
//    hairs, an uneven iris vignette, and a faint warm toning. ──
export const SILENT_FRAG = HEAD + SCRATCH + `
void main(){
  float f = uSeed;
  vec2 px = vUv * uRes;
  // gate weave: the whole frame drifts a couple of px; now and then it hops and shows the frame line
  vec2 uv = vUv + vec2(vn(vec2(f * .37, 1.)) - .5, vn(vec2(f * .29, 7.)) - .5) * vec2(3.2, 4.5) / uRes;
  float hop = step(.975, h11(f * 1.713)) * (.03 + .06 * h11(f * 3.1));
  uv.y = uv.y + hop;
  float bar = 0.;
  if (uv.y > 1.) { uv.y -= 1.03; bar = 1. - step(0., uv.y); }   // the black gap between frames
  uv.y = clamp(uv.y, 0., 1.);

  vec3 c = mix(texture(uTex, uv).rgb, textureLod(uTex, uv, 1.5).rgb, .35);   // period lens: soft
  vec3 ORTHO = vec3(.06, .50, .44);
  float l = dot(c, ORTHO);
  float halo = dot(textureLod(uTex, uv, 4.5).rgb, ORTHO);
  l += smoothstep(.5, 1., halo) * .28;                               // halation round highlights
  l = smoothstep(.05, .93, l);                                       // crushed blacks, hot whites
  l = pow(l, 1.12);
  l *= 1. + (h11(f * .913) - .5) * .22 + (vn(vec2(f * .13, 3.)) - .5) * .12;   // exposure flicker

  float g = (vn(px / 1.7 + f * 13.1) - .5) * .30 + (h21(px + f * 7.3) - .5) * .14;
  l += g * (.55 - abs(l - .5) * .6);                                 // grain lives in the mids

  float aspect = uRes.x / uRes.y;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float s = scratch(uv, f, fi, 7. + fi * 6., aspect);
    l = mix(l, h11(floor(f / (7. + fi * 6.)) + fi * 5.) > .35 ? 1.05 : .02, s * .75);
  }
  // dust: blobs that exist for exactly one frame
  float dn = vn(px / (5. + 4. * h11(f)) + f * 31.7);
  float dust = smoothstep(.925, .955, dn) * step(.35, h11(f * .77));
  l = mix(l, h11(f * 2.9) > .5 ? 0. : 1., dust);
  // a hair caught in the gate: a curled line near an edge, a few frames at a time
  float hr = floor(f / 9.);
  if (h11(hr * 5.7) > .55) {
    vec2 c0 = vec2(h11(hr) < .5 ? .08 : .9, .2 + .6 * h11(hr * 2.1));
    vec2 q = (vUv - c0) * vec2(aspect, 1.);
    float a = atan(q.y, q.x), r = length(q);
    float curl = abs(r - (.05 + .03 * sin(a * 2. + hr))) ;
    l = mix(l, .03, (1. - smoothstep(.0008, .0026, curl)) * step(r, .12) * step(-1.2, a) * step(a, 2.4));
  }
  // iris vignette: uneven and breathing
  vec2 q = (vUv - .5) * vec2(aspect, 1.);
  float vig = smoothstep(.98, .3, length(q * vec2(.82, 1.)) + (vn(vec2(f * .08, 2.)) - .5) * .06);
  l *= mix(.18, 1., vig);
  l *= 1. - bar;

  vec3 col = mix(vec3(.06, .05, .045), vec3(1., .96, .87), clamp(l, 0., 1.15));   // silver, faintly warm
  frag = vec4(clamp(col, 0., 1.), 1.);
}`;

// ── GRINDHOUSE — a 70s double-feature print that has been through every projector in the state:
//    faded magenta stock, milky blacks, emulsion + base scratches, dirt, chemical stains, light leaks
//    at the edges, splice marks — and EVENTS the engine schedules (uEvt.x):
//      1 burn      — the frame sticks in the gate and melts: white core, orange ring, charred lip
//      2 roll      — the frame loses registration and rolls, black frame-bar sliding through
//      3 splice    — a jump: flash frame, tape line, misframed picture
//      4 changeover— reel-change cue marks (the "cigarette burns", top-right)
//      5 desync    — the picture tears and doubles sideways, like a projector out of sync
//    uEvt.y = progress 0..1, uEvt.z = event seed. uReel = the CURRENT reel's grade
//    (x fade, y magenta, z contrast, w seed) — a changeover switches to a differently aged reel. ──
export const GRINDHOUSE_FRAG = HEAD + SCRATCH + `
uniform vec4 uEvt; uniform vec4 uReel;
vec3 grade(vec3 c){
  float l = dot(c, LW);
  c = mix(vec3(l), c, .72 - uReel.x * .25);                          // dye fade eats saturation
  c *= vec3(1.06 + uReel.y * .1, .9 - uReel.y * .08, .95 - uReel.x * .1);   // magenta/red shift of aged prints
  c = (c - .5) * (1.18 + uReel.z * .25) + .5;                        // print contrast
  c = mix(vec3(.075, .045, .05) + uReel.x * .05, vec3(1., .95, .86), clamp(c, 0., 1.));   // milky blacks, yellowed whites
  return c;
}
void main(){
  float f = uSeed, ev = uEvt.x, pr = uEvt.y, es = uEvt.z;
  vec2 px = vUv * uRes;
  float aspect = uRes.x / uRes.y;
  vec2 uv = vUv + (vec2(vn(vec2(f * .41, 1.)), vn(vec2(f * .33, 5.))) - .5) * vec2(4., 6.) / uRes;   // jittery gate

  float bar = 0.;
  if (ev == 2.) {                                                    // roll: one full frame slides past
    float off = pr * 1.06;
    uv.y += off;
    if (uv.y > 1.) { uv.y -= 1.06; bar = 1. - step(0., uv.y); }
  }
  if (ev == 3. && pr < .5) uv += vec2(.012, -.035) * (h11(es) - .2);  // misframed splice
  float tear = 0.;
  if (ev == 5.) {                                                    // desync: torn, doubled picture
    float band = step(.5, vn(vec2(vUv.y * 3. + es, f * .5)));
    float shift = (h11(f * 1.3 + es) - .5) * .09 * band * (1. - pr);
    uv.x += shift;
    tear = band;
  }
  uv = clamp(uv, 0., 1.);

  vec3 c = texture(uTex, uv).rgb;
  if (ev == 5.) c = mix(c, texture(uTex, clamp(uv + vec2(.035 * (1. - pr), 0.), 0., 1.)).rgb, .4 * tear);
  c = mix(c, textureLod(uTex, uv, 1.2).rgb, .3);                     // 4th-generation print softness
  c = grade(c);

  // chemical stains: big blotches that crawl over several seconds
  float st = vn(vUv * vec2(aspect, 1.) * 2.2 + uReel.w * 7. + uT * .05);
  c = mix(c, c * vec3(.95, .78, .65), smoothstep(.62, .78, st) * .55);
  c = mix(c, c * vec3(.7, 1., .9), smoothstep(.7, .83, vn(vUv * 3.1 - uReel.w * 3. + uT * .04)) * .3);

  // flicker + grain
  c *= 1. + (h11(f * .713) - .5) * .14;
  float g = (vn(px / 1.4 + f * 17.3) - .5) * .32 + (h21(px + f * 3.7) - .5) * .16;
  c += g * (.5 - abs(dot(c, LW) - .5) * .5) * vec3(1., .95, 1.05);

  // scratches: white base scratches and green-cyan emulsion scratches
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float s = scratch(uv, f, fi + 10., 3. + fi * 4., aspect);
    vec3 sc = mod(fi, 2.) < .5 ? vec3(.98, .97, .9) : vec3(.25, .85, .62);
    c = mix(c, sc, s * .8);
  }
  // heavy dirt: dark crumbs and bright holes, a new handful every frame
  float d1 = vn(px / (4. + 6. * h11(f * 1.7)) + f * 21.3);
  c = mix(c, vec3(.03), smoothstep(.9, .94, d1) * step(.25, h11(f * .37)));
  float d2 = vn(px / 3. + f * 47.1 + 9.);
  c = mix(c, vec3(1., .96, .85), smoothstep(.94, .97, d2) * step(.55, h11(f * .53)));

  // edges: uneven burn-in vignette + orange light leak
  vec2 q = (vUv - .5) * vec2(aspect, 1.);
  c *= mix(.3, 1., smoothstep(1.02, .35, length(q * vec2(.8, 1.))));
  float leak = smoothstep(.75, 1., vUv.x + (vn(vec2(vUv.y * 2., uT * .3)) - .5) * .25) * (.4 + .6 * vn(vec2(uT * .7, 3.)));
  c += vec3(1., .45, .1) * leak * .35;

  // splice: flash frame + tape seam
  if (ev == 3.) {
    c = mix(c, vec3(1., .97, .9), (1. - smoothstep(0., .3, pr)) * .85);
    float seam = abs(vUv.y - (.15 + .7 * h11(es)));
    c = mix(c, vec3(.1, .08, .06), (1. - smoothstep(.002, .006, seam)) * .9);
    c *= 1. - .15 * step(seam, .03);
  }
  // changeover cue mark: a ringed dot, top-right, flashing on alternate frame pairs
  if (ev == 4. && mod(floor(pr * 12.), 3.) < 2.) {
    vec2 cp = (vUv - vec2(.9, .1)) * vec2(aspect, 1.);
    float r = length(cp);
    float edge = vn(cp * 60. + es) * .006;
    c = mix(c, vec3(.02), 1. - smoothstep(.026 + edge, .03 + edge, r));
    c = mix(c, vec3(1., .96, .8), (1. - smoothstep(.016 + edge, .02 + edge, r)) * .9);
  }
  // the burn: grows from a seed point through the stuck frame
  if (ev == 1.) {
    vec2 bc = vec2(.3 + .4 * h11(es), .3 + .4 * h11(es * 1.7));
    vec2 bq = (vUv - bc) * vec2(aspect, 1.);
    float rr = length(bq) + (vn(bq * 9. + es) - .5) * .12 + (vn(bq * 31. - uT * 2.) - .5) * .03;
    float R = pr * pr * 1.4;
    float hole = 1. - smoothstep(R - .01, R, rr);
    float ring = (1. - smoothstep(R, R + .03, rr)) - hole;
    float chr = (1. - smoothstep(R + .02, R + .12, rr)) - ring - hole;
    float bub = smoothstep(.55, .75, vn(bq * 24. + uT * 3.)) * (1. - smoothstep(R, R + .15, rr)) * (1. - hole);
    c = mix(c, c * vec3(.55, .3, .12), clamp(chr, 0., 1.) * .9);
    c = mix(c, vec3(1., .5, .08), clamp(ring + bub * .6, 0., 1.));
    c = mix(c, mix(vec3(1., .92, .7), vec3(1.), smoothstep(R * .3, 0., rr)), hole);
  }
  c *= 1. - bar;
  frag = vec4(clamp(c, 0., 1.), 1.);
}`;

// ── VHS CAMCORDER — an 80s/90s home video on worn tape: ~330 lines of luma with peaking halos, chroma
//    smeared ~5x wider and running late (YIQ, bandwidth-limited), per-line time-base wobble, tape noise,
//    dropout streaks, head-switching noise at the bottom, and tracking errors (uEvt.x = tracking error
//    strength, uEvt.y = its band position). The engine burns the date stamp into the frame BEFORE this
//    pass, so the OSD gets the same tape treatment as the picture. ──
export const VHS_FRAG = HEAD + `
uniform vec4 uEvt;
vec3 yiq(vec3 c){ return vec3(dot(c, vec3(.299, .587, .114)), dot(c, vec3(.596, -.274, -.322)), dot(c, vec3(.211, -.523, .312))); }
vec3 rgb(vec3 y){ return vec3(y.x + .956 * y.y + .621 * y.z, y.x - .272 * y.y - .647 * y.z, y.x - 1.106 * y.y + 1.703 * y.z); }
void main(){
  float lines = 240.;
  float line = floor(vUv.y * lines);
  float t = uT;
  // time-base error: every scanline slides a little, more at the top (skew) and in tracking bands
  float tbc = (vn(vec2(line * .07, t * 4.)) - .5) * 1.6 + (vn(vec2(line * .9, t * 30.)) - .5) * .6;
  tbc += smoothstep(.12, 0., vUv.y) * sin(t * 2.3 + vUv.y * 40.) * 2.5;   // top-of-frame flag waving
  float trk = uEvt.x;
  float band = trk * (1. - smoothstep(0., .07, abs(vUv.y - uEvt.y)));
  tbc += band * (h11(line + floor(t * 30.)) - .5) * 60.;
  float head = smoothstep(.955, .985, vUv.y);                         // head-switching noise at the bottom
  tbc += head * (14. + 10. * h11(line + floor(t * 60.)));
  vec2 uv = vec2(vUv.x + tbc / uRes.x, (line + .5) / lines);
  uv.y += (h11(floor(t * 30.)) - .5) * .0015;                         // vertical jitter
  float lod = log2(max(1., uRes.y / lines)) - .2;

  // luma: soft horizontal bandwidth + peaking (the white/black halos VHS draws round every edge)
  float px1 = 1.6 / uRes.x;
  float y0 = yiq(textureLod(uTex, uv, lod).rgb).x;
  float ys = 0.;
  for (int i = -2; i <= 2; i++) ys += yiq(textureLod(uTex, uv + vec2(float(i) * px1 * 1.5, 0.), lod).rgb).x;
  ys /= 5.;
  float yb = 0.;
  for (int i = -3; i <= 3; i++) yb += yiq(textureLod(uTex, uv + vec2(float(i) * px1 * 3.5, 0.), lod + .5).rgb).x;
  yb /= 7.;
  float Y = ys + (ys - yb) * .85;

  // chroma: very low bandwidth, delayed to the right, slightly noisy
  vec2 IQ = vec2(0.);
  for (int i = 0; i < 8; i++) {
    float o = (float(i) - 2.) * 5.5 / uRes.x;
    IQ += yiq(textureLod(uTex, uv + vec2(o - 3.5 / uRes.x, 0.), lod + 1.5).rgb).yz;
  }
  IQ /= 8.;
  IQ *= 1.15;
  IQ += (vec2(vn(vec2(vUv.x * 90., line + t * 50.)), vn(vec2(vUv.x * 90. + 9., line - t * 50.))) - .5) * .07 * (1.2 - Y);

  // tape noise: horizontal streaky snow, dropouts
  float sn = (vn(vec2(vUv.x * uRes.x / 3., line * 1.7 + t * 300.)) - .5) * .09;
  Y += sn;
  float drop = step(.9965, h11(line * 1.3 + floor(t * 30.) * 7.1)) * smoothstep(.0, .05, fract(vUv.x * .7 + h11(line + t) * 3.)) * step(.6, vn(vec2(vUv.x * 6., line + t)));
  Y = mix(Y, 1.1, drop * .9);
  Y = mix(Y, h11(vUv.x * 900. + line * 7. + t * 99.), band * .5 + head * .55);

  // camcorder tone: lifted blacks, clipped soft whites, warm
  Y = .06 + .9 * smoothstep(-.02, 1.02, Y);
  vec3 c = rgb(vec3(Y, IQ));
  c *= vec3(1.04, 1., .93);
  c = mix(c, vec3(dot(c, LW)), .08);
  // interlace: alternate lines a touch darker, the field order flips every frame
  c *= .94 + .06 * mod(floor(vUv.y * uRes.y * .5) + floor(t * 60.), 2.);
  // overscan: a dark ragged left edge and a soft vignette
  c *= smoothstep(.004, .016, vUv.x + (h11(line) - .5) * .004);
  vec2 q = vUv - .5;
  c *= 1. - dot(q, q) * .55;
  frag = vec4(clamp(c, 0., 1.), 1.);
}`;

// ── FOUND FOOTAGE — a terrified operator with a consumer camcorder (Hi8 grit → handycam DV). The engine
//    runs the handheld rig (springs driven by your mouse, clicks, and the action on screen) and hands the
//    result in: uCam = (offset x, offset y, roll, zoom), uVel = image motion this frame (motion blur +
//    rolling-shutter skew), uFocus = autofocus hunting blur, uExpo = auto-exposure gain, uGlitch =
//    tape/digital breakup when the camera is slammed. ──
export const FOUND_FRAG = HEAD + `
uniform vec4 uCam; uniform vec2 uVel; uniform float uFocus; uniform float uExpo; uniform float uGlitch;
vec2 camUv(vec2 uv, float skew){
  float aspect = uRes.x / uRes.y;
  vec2 p = (uv - .5) * vec2(aspect, 1.);
  float r = uCam.z;
  p = mat2(cos(r), -sin(r), sin(r), cos(r)) * p;
  p /= uCam.w;
  p.x += skew * (uv.y - .5);                                        // CMOS rolling shutter
  return p / vec2(aspect, 1.) + .5 + uCam.xy;
}
void main(){
  vec2 px = vUv * uRes;
  float f = uSeed;
  // glitch: macroblock smear + horizontal tears when the camera is slammed
  vec2 base = vUv;
  if (uGlitch > .01) {
    float row = floor(vUv.y * 22.);
    float tearOn = step(1. - uGlitch * .6, h11(row + floor(uT * 20.)));
    base.x += tearOn * (h11(row * 3.1 + floor(uT * 20.)) - .5) * .12 * uGlitch;
  }
  vec2 uv = camUv(base, uVel.x * 1.6);
  // motion blur along the shake
  vec3 c = vec3(0.);
  for (int i = 0; i < 7; i++) {
    float k = float(i) / 6. - .5;
    c += textureLod(uTex, clamp(uv + uVel * k, 0., 1.), uFocus * 3.2).rgb;
  }
  c /= 7.;
  // compression: 8x8 blocks under motion
  float mv = length(uVel) * 60. + uGlitch;
  if (mv > .15) {
    vec2 blk = floor(px / 8.);
    float b = step(1. - min(.85, (mv - .15) * .8), h21(blk + floor(uT * 12.)));
    vec3 bc = textureLod(uTex, clamp(camUv((blk * 8. + 4.) / uRes, 0.), 0., 1.), 3.).rgb;
    c = mix(c, bc, b * .85);
  }
  if (uGlitch > .2) {                                               // chroma split
    float o = uGlitch * .012;
    c.r = textureLod(uTex, clamp(uv + vec2(o, 0.), 0., 1.), 1.).r;
    c.b = textureLod(uTex, clamp(uv - vec2(o, 0.), 0., 1.), 1.).b;
  }
  // camcorder edge enhancement
  vec3 bl = textureLod(uTex, clamp(uv, 0., 1.), 2.).rgb;
  c += (c - bl) * .5 * (1. - uFocus);

  // auto-exposure: gain lifts shadows into noise; highlights clip hard
  c *= uExpo;
  float l = dot(c, LW);
  c = mix(vec3(l), c, .55);                                          // tired, cheap colour
  c *= vec3(.98, 1.03, .9);                                          // Hi8 green-yellow cast
  c = smoothstep(.03, .92, c);
  float n = (h21(px + fract(uT) * 911.) - .5) * (.07 + .1 * max(0., uExpo - 1.)) + (vn(px / 2. + uT * 60.) - .5) * .06;
  c += n * vec3(1., .9, 1.15) * (1.1 - l);
  vec2 q = (vUv - .5) * vec2(uRes.x / uRes.y, 1.);
  c *= 1. - dot(q, q) * .42;
  if (uGlitch > .55 && h11(floor(uT * 30.)) > .6) c = mix(c, vec3(h11(floor(px.y / 3.) + uT)), .35);   // dropout lines
  frag = vec4(clamp(c, 0., 1.), 1.);
}`;
