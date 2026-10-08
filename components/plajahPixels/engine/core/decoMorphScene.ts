import type { SceneInst } from './flux';
import type { FluxDriven, FluxSpec } from '../../../../services/fabula/fluxNode';

/**
 * Deco Geometry Morph — an Art Deco relief architecture you travel through, rebuilt from the
 * "Art Deco Visuals" clip set (Downloads/Roaring 20's party: Looping_art_deco_pattern_*,
 * Gale's_Great_Gatsby_*).
 *
 * SPACE. Three relief screens stacked in depth, repeating forever along -z. Each screen is an
 * extruded relief of one motif: gold ornament stands tallest with a rounded bevel, gold leaf and
 * raspberry panels sit lower, black lacquer is cut OUT on the front and middle screens so you
 * look through to the screens behind (the back screen is solid). The shader ray-marches each
 * slab, so extruded walls, raking light and cast shadows are real, and the camera can push
 * straight through the openings.
 *
 * LAYOUTS. Each clip family is a layout: which motif sits on each screen and at what scale
 * (Fan Court = 195229, Rainbow Arcade = 195253, Fan Rosette = 195305, Diamond Hall = 195318,
 * Gear Works = 195330, Scale Tunnel = 195346, Radiant Fans = 195356, Medallion Wall = 195416,
 * Machine Mandala = 180443, Gatsby Cartouche = the Gale's Great Gatsby title cards).
 *
 * CAMERA. A director cuts on the beat between wide push-ins, tight angled close-ups on ornament,
 * grazing crane pans across the relief, orbits, snap zooms and fly-through dollies. Shot length is
 * 2–16 beats, shorter when the music is intense. Layouts change on a cut, every 4 bars. Kicks punch
 * the zoom.
 *
 * MOTION. Mechanical, never liquid: every piece ratchets on the beat (`tick`: snap with overshoot,
 * then hold) — hinged fans swing and fold, rings turn as gears, rays step like clock hands, frames
 * step outward, pistons slide.
 *
 * Flux compiles as GLSL ES 1.0 (no ternaries on structs). Deterministic from clip time for
 * sequential rendering; spec.decoSeed >= 0 holds one layout; spec.hue rotates the raspberry.
 */

type Layout = { name: string; clip: string; L: [number, number, number]; S: [number, number, number]; fold: number };
// Motif ids: 0 fans, 1 diamonds, 2 arches, 3 medallions, 4 starburst, 5 chevrons, 6 mandala,
//            7 fan rosette, 8 gear grid, 9 cartouche.
const LAYOUTS: Layout[] = [
  { name: 'Fan Court', clip: '195229', L: [0, 1, 5], S: [1.0, 1.5, 2.3], fold: 0 },
  { name: 'Rainbow Arcade', clip: '195253', L: [2, 7, 1], S: [1.0, 1.4, 2.3], fold: 0 },
  { name: 'Fan Rosette', clip: '195305', L: [7, 3, 4], S: [1.1, 1.3, 2.2], fold: 0 },
  { name: 'Diamond Hall', clip: '195318', L: [1, 0, 6], S: [1.0, 1.3, 2.4], fold: 0 },
  { name: 'Gear Works', clip: '195330', L: [8, 1, 4], S: [1.0, 1.5, 2.3], fold: 0 },
  { name: 'Scale Tunnel', clip: '195346', L: [0, 9, 2], S: [1.0, 1.25, 2.1], fold: 0 },
  { name: 'Radiant Fans', clip: '195356', L: [4, 7, 3], S: [1.0, 1.3, 2.1], fold: 12 },
  { name: 'Medallion Wall', clip: '195416', L: [3, 5, 1], S: [1.0, 1.5, 2.3], fold: 0 },
  { name: 'Machine Mandala', clip: '180443', L: [6, 5, 8], S: [1.0, 1.5, 2.3], fold: 8 },
  { name: 'Gatsby Cartouche', clip: "Gale's_Great_Gatsby", L: [9, 0, 4], S: [1.0, 1.3, 2.3], fold: 0 },
];
const D = 1.5;   // spacing between screens (world units)
const H = 0.13;  // relief slab height

const VERT = `varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform float uTime, uAspect, uBeat, uKick, uBass, uMid, uTre, uSnare, uVoice, uEnergy, uHue, uSwing, uPix;
uniform vec3 uCamPos, uCamR, uCamU, uCamF;
uniform float uTanFov;
uniform vec3 uS;
uniform float uFold;
uniform float uKMin;
uniform float uExpand, uHMul, uFanVoice, uFanOpen, uFly, uFlyAmt, uFlyRot, uFlyZ, uFlash, uNeonBoost, uDark;
varying vec2 vUv;
#define PI 3.14159265
#define TAU 6.2831853
#define DGAP ${D.toFixed(3)}
#define HS (${H.toFixed(3)} * uHMul)

struct M { float c; float w; float fill; float shade; float neon; };
// c: distance to the nearest gold stroke's centre line, w: its half-width,
// fill: 0 black lacquer (cut-out), 1 raspberry, 2 deep raspberry, 3 bronze, 4 gold leaf.

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
M blank(){ M m; m.c = 1e3; m.w = 0.0; m.fill = 0.0; m.shade = 0.5; m.neon = 1e3; return m; }
void line(inout M m, float dist, float w){ if (dist - w < m.c - m.w) { m.c = dist; m.w = w; } }
float tick(float x){ float i = floor(x), f = clamp(fract(x) * 3.0, 0.0, 1.0) - 1.0; return i + 1.0 + 2.2 * f * f * f + 1.2 * f * f; }
float lever(float x){ float t = tick(x); float i = floor(t + 0.001); float f = t - i; return mod(i, 2.0) < 1.0 ? f : 1.0 - f; }

// A folding fan hinged at the origin, opening toward +y.
// Voice takes over the fans: when a vocal is present its level sets how far every fan opens.
float fanOpen(float mech){ return mix(mech, 0.18 + 0.82 * uFanOpen, uFanVoice); }
bool fanAt(inout M m, vec2 q, float R, float open, bool leaf){
  open = fanOpen(open);
  float span = PI * open, a0 = (PI - span) * 0.5;
  float r = length(q), a = atan(q.y, q.x);
  if (q.y < -0.02 || r > R + 0.02 || a < a0 - 0.03 || a > a0 + span + 0.03) return false;
  float st = span / 9.0, hub = R * 0.26, aa = a - a0, ai = floor(aa / st);
  m.fill = r < hub ? 3.0 : (leaf ? (mod(ai, 2.0) < 1.0 ? 4.0 : 3.0) : (mod(ai, 2.0) < 1.0 ? 1.0 : 2.0));
  m.shade = r / R;
  line(m, abs(r - R), 0.018);
  line(m, abs(r - hub), 0.008);
  line(m, r * abs(sin(aa)), 0.01);
  line(m, r * abs(sin(aa - span)), 0.01);
  if (r > hub) line(m, r * abs(sin(aa - floor(aa / st + 0.5) * st)), 0.005);
  m.neon = abs(r - R - 0.035);
  return true;
}

// 0 — fish-scale fan rows: conveyor rows, cascading fold, counter-swinging neighbours.
M fans(vec2 p){
  M m = blank();
  float w = 0.84, h = 0.27;
  float k0 = floor(p.y / h);
  for (int s = 1; s >= 0; s--) {
    float k = k0 - float(s);
    float dirRow = mod(k, 2.0) < 1.0 ? 1.0 : -1.0;
    float off = mod(k, 2.0) * w * 0.5 + tick(uBeat * 0.5 + k * 0.13) * w * 0.5 * dirRow;
    float ci = floor((p.x - off) / w + 0.5);
    vec2 c = vec2(ci * w + off, k * h);
    float par = mod(ci + k, 2.0) < 1.0 ? 1.0 : -1.0;
    vec2 q = rot((lever(uBeat + k * 0.25) - 0.5) * 0.55 * uSwing * par) * (p - c);
    float open = 0.45 + 0.55 * lever(uBeat * 0.5 + ci * 0.12 + k * 0.2);
    if (fanAt(m, q, 0.42 * (1.0 + uKick * 0.06), open, mod(k, 3.0) < 1.0)) return m;
  }
  return m;
}

// 1 — nested diamond gear-rings: each turns 45° per step (diamond ↔ square), alternating.
M diamonds(vec2 p){
  M m = blank();
  float sp = 0.15, raw = abs(p.x) + abs(p.y), ring = floor(raw / sp);
  vec2 pr = rot(tick(uBeat * 0.5 - ring * 0.08) * PI * 0.25 * (mod(ring, 2.0) < 1.0 ? 1.0 : -1.0)) * p;
  float d = abs(pr.x) + abs(pr.y);
  if (d < 1.35) {
    float fi = floor(d / sp), fr = fract(d / sp);
    m.fill = d < 0.2 ? 3.0 : (mod(fi, 4.0) < 1.0 ? 4.0 : mod(fi, 2.0) < 1.0 ? 1.0 : 0.0);
    m.shade = 1.0 - d / 1.35;
    line(m, min(fr, 1.0 - fr) * sp * 0.7071, mod(fi, 3.0) < 1.0 ? 0.013 : 0.006);
  } else {
    vec2 u = vec2(p.x + p.y, p.x - p.y) * 0.7071 / 0.42;
    u.x += tick(uBeat * 0.25) * (mod(floor(u.y), 2.0) < 1.0 ? 1.0 : -1.0);
    vec2 f = fract(u) - 0.5, id = floor(u);
    m.fill = mod(id.x + id.y, 2.0) < 1.0 ? 2.0 : 0.0;
    line(m, (0.5 - max(abs(f.x), abs(f.y))) * 0.42, 0.008);
  }
  line(m, abs(raw - 1.35) * 0.7071, 0.024);
  m.neon = abs(raw - 1.42) * 0.7071;
  return m;
}

// 2 — rainbow arches: conveyor rows, each arch rocks on its base.
M arches(vec2 p){
  M m = blank();
  float w = 1.0, h = 0.36, R = 0.5;
  float k0 = floor(p.y / h);
  for (int s = 1; s >= 0; s--) {
    float k = k0 - float(s);
    float off = mod(k, 2.0) * w * 0.5 + tick(uBeat * 0.25 + k * 0.1) * w * 0.5 * (mod(k, 2.0) < 1.0 ? 1.0 : -1.0);
    float ci = floor((p.x - off) / w + 0.5);
    vec2 c = vec2(ci * w + off, k * h);
    vec2 q = rot((lever(uBeat + ci * 0.15) - 0.5) * 0.4 * uSwing * (mod(ci + k, 2.0) < 1.0 ? 1.0 : -1.0)) * (p - c);
    float r = length(q), Ra = R * (1.0 + uKick * 0.05);
    if (q.y >= -0.01 && r < Ra + 0.015) {
      float bands = 5.0, b = r / Ra * bands, bi = floor(b), bf = fract(b);
      m.fill = bi < 1.0 ? 0.0 : (mod(bi, 3.0) < 1.0 ? 4.0 : mod(bi, 2.0) < 1.0 ? 1.0 : 2.0);
      m.shade = 0.55 + 0.45 * step(abs(bi - mod(floor(uBeat), bands)), 0.5);
      line(m, min(bf, 1.0 - bf) * Ra / bands, 0.008);
      line(m, abs(r - Ra), 0.018);
      line(m, abs(q.y), 0.01);
      return m;
    }
  }
  return m;
}

// 3 — sunburst medallions: clock-stepping rays, counter-turning segmented rims, flipping diamonds.
M medallions(vec2 p){
  M m = blank();
  float cell = 1.15;
  vec2 id = floor(p / cell + 0.5), q = p - id * cell;
  float dir = mod(id.x + id.y, 2.0) < 1.0 ? 1.0 : -1.0;
  float R = 0.5 * (1.0 + uKick * 0.05), r = length(q), a = atan(q.y, q.x), st = TAU / 24.0;
  if (r < R - 0.06) {
    float ar = a + tick(uBeat) * st * dir, ai = floor(ar / st);
    m.fill = r < 0.1 ? 3.0 : (mod(ai, 4.0) < 1.0 ? 4.0 : mod(ai, 2.0) < 1.0 ? 1.0 : 0.0);
    if (r < 0.2 && m.fill < 0.5) m.fill = 2.0;
    m.shade = r / R;
    if (r > 0.1) line(m, r * abs(sin(ar - floor(ar / st + 0.5) * st)), 0.004);
    line(m, abs(r - 0.1), 0.01);
  } else if (r < R + 0.06) {
    float seg = fract((a - tick(uBeat * 0.5) * TAU / 8.0 * dir) / TAU * 8.0);
    m.fill = seg < 0.7 ? 1.0 : 3.0;
    line(m, abs(seg - 0.7) * TAU / 8.0 * r, 0.006);
    line(m, seg * TAU / 8.0 * r, 0.006);
  } else {
    vec2 k = rot(tick(uBeat * 0.25) * PI * 0.5) * (abs(q) - cell * 0.5); float dd = abs(k.x) + abs(k.y);
    if (dd < 0.11) m.fill = 1.0;
    line(m, abs(dd - 0.11) * 0.7071, 0.008);
  }
  line(m, abs(r - R + 0.06), 0.012);
  line(m, abs(r - R - 0.06), 0.012);
  m.neon = abs(r - R - 0.1);
  return m;
}

// 4 — radial starburst: two counter-sweeping ray levers, a centre medallion turning 45° per bar.
M starburst(vec2 p){
  M m = blank();
  float r = length(p), a0 = atan(p.y, p.x), N = 16.0, st = TAU / N, wide = 0.32 + uKick * 0.18;
  float uA = (a0 - tick(uBeat) * st) / st, uB = (a0 + tick(uBeat) * st + st * 0.5) / st;
  float fA = fract(uA), fB = fract(uB);
  bool evA = mod(floor(uA), 2.0) < 1.0, evB = mod(floor(uB), 2.0) < 1.0;
  bool inA = abs(fA - 0.5) < wide * 0.5 && evA, inB = abs(fB - 0.5) < wide * 0.35 && evB;
  m.fill = inA ? 1.0 : (inB ? 4.0 : 0.0);
  m.shade = clamp(1.0 - r / 2.2, 0.0, 1.0);
  if (evA) line(m, abs(abs(fA - 0.5) - wide * 0.5) * st * r, 0.006);
  if (evB) line(m, abs(abs(fB - 0.5) - wide * 0.35) * st * r, 0.005);
  vec2 pc = rot(tick(uBeat * 0.25) * PI * 0.25) * p;
  float d = abs(pc.x) + abs(pc.y);
  if (d < 0.62) {
    float fi = floor(d / 0.12);
    m.fill = d < 0.14 ? 3.0 : (mod(fi, 2.0) < 1.0 ? 1.0 : 4.0);
    m.shade = 1.0 - d;
    line(m, min(fract(d / 0.12), 1.0 - fract(d / 0.12)) * 0.12 * 0.7071, 0.007);
  }
  line(m, abs(d - 0.62) * 0.7071, 0.02);
  line(m, abs(r - 1.05), 0.012);
  line(m, abs(r - 1.12), 0.005);
  if (r > 1.05 && r < 1.12) m.fill = 3.0;
  m.neon = abs(r - 1.2);
  return m;
}

// 5 — chevron frames: conveyor chevrons, a centre frame turning 45° per bar, piston pillars.
M chevrons(vec2 p){
  M m = blank();
  vec2 pc = rot(tick(uBeat * 0.25) * PI * 0.25) * p;
  float q = max(abs(pc.x), abs(pc.y));
  if (q < 0.6) {
    float sp = 0.1, fi = floor(q / sp), fr = fract(q / sp);
    m.fill = q < 0.12 ? 3.0 : (mod(fi, 3.0) < 1.0 ? 4.0 : mod(fi, 2.0) < 1.0 ? 1.0 : 0.0);
    m.shade = 1.0 - q;
    line(m, min(fr, 1.0 - fr) * sp, 0.007);
  } else {
    float y = p.y - abs(p.x) * 0.75 + tick(uBeat) * 0.2;
    float sp = 0.2, fi = floor(y / sp), fr = fract(y / sp);
    m.fill = mod(fi, 2.0) < 1.0 ? 1.0 : 0.0;
    m.shade = 0.45 + 0.35 * step(mod(fi, 4.0), 0.5);
    line(m, min(fr, 1.0 - fr) * sp * 0.8, mod(fi, 4.0) < 1.0 ? 0.014 : 0.006);
    if (mod(fi, 4.0) < 1.0) m.neon = min(fr, 1.0 - fr) * sp * 0.8 + 0.012;
  }
  line(m, abs(q - 0.6), 0.022);
  float px = abs(abs(p.x) - (1.45 - lever(uBeat * 0.5) * 0.25 * uSwing));
  line(m, px, 0.012); line(m, abs(px - 0.05), 0.005);
  return m;
}

// 6 — gear mandala: petal ring and toothed rings meshed 8:22:40, ratcheting per beat.
M mandala(vec2 p){
  M m = blank();
  float r = length(p), a = atan(p.y, p.x), g = tick(uBeat);
  float ap = a + g * TAU / 8.0, pr = 0.78 * (1.0 + uKick * 0.06);
  float petal = pr * abs(cos(4.0 * ap)), sector = floor((ap + PI / 8.0) / (PI / 4.0));
  if (r < 0.2) { m.fill = 3.0; m.shade = 1.0; }
  else if (r < petal) { m.fill = mod(sector, 2.0) < 1.0 ? 1.0 : 4.0; m.shade = r / pr; }
  line(m, abs(r - petal) * 0.6, 0.009);
  line(m, abs(r - 0.2), 0.012);
  float gR = 1.02 + 0.07 * step(0.0, cos(22.0 * (a - g * TAU / 22.0)));
  if (r > 0.95 && r < gR) { m.fill = 3.0; m.shade = 0.6; }
  line(m, abs(r - gR), 0.012);
  line(m, abs(r - 0.95), 0.012);
  float gR2 = 1.55 + 0.05 * step(0.0, cos(40.0 * (a + g * TAU / 40.0)));
  if (r > 1.42 && r < gR2) m.fill = 2.0;
  line(m, abs(r - gR2), 0.01);
  line(m, abs(r - 1.42), 0.008);
  line(m, abs(r - 0.45), 0.005);
  m.neon = min(abs(r - 1.28), abs(r - 0.6));
  return m;
}

// 7 — fan rosette: eight hinged fans around a medallion, the ring ratcheting, fans counter-swinging.
M rosette(vec2 p){
  M m = blank();
  float r = length(p);
  vec2 pr = rot(tick(uBeat * 0.5) * TAU / 16.0) * p;
  float a = atan(pr.y, pr.x), seg = TAU / 8.0, s = floor(a / seg + 0.5);
  vec2 q = rot(-s * seg) * pr;
  float par = mod(s, 2.0) < 1.0 ? 1.0 : -1.0;
  vec2 fq = rot((lever(uBeat + s * 0.1) - 0.5) * 0.45 * uSwing * par) * vec2(q.y, q.x - 0.3);
  if (r < 0.3) {
    m.fill = r < 0.1 ? 4.0 : (r < 0.18 ? 1.0 : 3.0); m.shade = 1.0;
    line(m, abs(r - 0.3), 0.018); line(m, abs(r - 0.18), 0.008); line(m, abs(r - 0.1), 0.006);
    return m;
  }
  if (fanAt(m, fq, 0.62 * (1.0 + uKick * 0.06), 0.55 + 0.4 * lever(uBeat * 0.5 + s * 0.07), par > 0.0)) { line(m, abs(r - 0.3), 0.018); return m; }
  if (r > 1.05 && r < 1.13) m.fill = 1.0;
  line(m, abs(r - 1.05), 0.014); line(m, abs(r - 1.13), 0.008);
  m.neon = abs(r - 1.22);
  return m;
}

// 8 — gear grid: meshing spoked gears (alternate directions, offset half a tooth), one tooth per beat.
M gearGrid(vec2 p){
  M m = blank();
  float cell = 0.86;
  vec2 id = floor(p / cell + 0.5), q = p - id * cell;
  float dir = mod(id.x + id.y, 2.0) < 1.0 ? 1.0 : -1.0;
  float a = atan(q.y, q.x) + tick(uBeat) * TAU / 12.0 * dir + (dir < 0.0 ? TAU / 24.0 : 0.0);
  float r = length(q), Ro = 0.36 + 0.05 * step(0.0, cos(12.0 * a));
  if (r < Ro) {
    m.fill = r < 0.07 ? 0.0 : (r < 0.14 ? 4.0 : (r > 0.28 ? 3.0 : 4.0));
    float sa = mod(a, TAU / 4.0) - TAU / 8.0;
    if (r > 0.14 && r < 0.27 && abs(sa) < 0.55) m.fill = 0.0;
    m.shade = r / Ro;
    line(m, abs(r - Ro), 0.01);
    line(m, abs(r - 0.28), 0.007); line(m, abs(r - 0.14), 0.007);
  } else {
    vec2 k = abs(q) - cell * 0.5; float dd = abs(k.x) + abs(k.y);
    if (dd < 0.1) m.fill = 1.0;
    line(m, abs(dd - 0.1) * 0.7071, 0.007);
  }
  m.neon = abs(r - 0.46);
  return m;
}

// 9 — Gatsby cartouche: a stepped title plaque whose frames step outward, sun rays behind,
//     hinged fans at the four corners.
M cartouche(vec2 p){
  M m = blank();
  vec2 q = abs(p);
  float d = max(max(q.x * 0.6, q.y), (q.x * 0.6 + q.y) * 0.74);
  if (d < 0.36) {
    m.fill = 0.0;
    line(m, abs(d - 0.3) * 0.8, 0.008);
    line(m, abs(p.y) , 0.004 + 0.0 * step(0.2, q.x));
  } else if (d < 1.0) {
    float ph = d / 0.09 - tick(uBeat * 0.5), fi = floor(ph), fr = fract(ph);
    m.fill = mod(fi, 3.0) < 1.0 ? 4.0 : (mod(fi, 2.0) < 1.0 ? 1.0 : 0.0);
    m.shade = 1.0 - d;
    line(m, min(fr, 1.0 - fr) * 0.09 * 0.8, mod(fi, 3.0) < 1.0 ? 0.012 : 0.006);
  } else {
    vec2 c = vec2(1.45, 0.95), u = normalize(c);
    vec2 fl = rot((lever(uBeat) - 0.5) * 0.35 * uSwing) * vec2(dot(q - c, vec2(u.y, -u.x)), dot(q - c, u) + 0.15);
    if (fanAt(m, fl, 0.55, 0.5 + 0.45 * lever(uBeat * 0.5), true)) { line(m, abs(d - 1.0) * 0.8, 0.024); return m; }
    float a = atan(p.y, p.x), st = TAU / 48.0, ar = a + tick(uBeat) * st;
    float f = fract(ar / st);
    m.fill = f < 0.45 ? 1.0 : 0.0; m.shade = clamp(1.4 - d * 0.5, 0.0, 1.0);
    line(m, min(f, abs(f - 0.45)) * st * length(p), 0.004);
  }
  line(m, abs(d - 1.0) * 0.8, 0.024);
  line(m, abs(d - 0.36) * 0.8, 0.016);
  m.neon = abs(d - 1.08) * 0.8;
  return m;
}

// Per-layout variant: only this layout's three motifs are compiled in (see materialFor()).
M layerMotif(float slot, vec2 p){
  if (slot < 0.5) return __M0__(p);
  if (slot < 1.5) return __M1__(p);
  return __M2__(p);
}

// Relief height of a motif sample: raised rounded gold, stepped panels, black = cut-out (0).
float heightOf(M m){
  if (m.c < m.w) { float t = m.c / m.w; return HS * (0.72 + 0.28 * sqrt(max(0.0, 1.0 - t * t))); }
  if (m.fill > 3.5) return HS * 0.5;
  if (m.fill > 2.5) return HS * 0.44;
  if (m.fill > 1.5) return HS * 0.3;
  if (m.fill > 0.5) return HS * 0.36;
  return 0.0;
}

float fillHeight(M m){
  if (m.fill > 3.5) return HS * 0.5;
  if (m.fill > 2.5) return HS * 0.44;
  if (m.fill > 1.5) return HS * 0.3;
  if (m.fill > 0.5) return HS * 0.36;
  return 0.0;
}

// World xy on screen k → that screen's motif coordinates (scale, per-screen ratchet turn, fold).
vec2 layerUV(vec2 xy, float slot, float k){
  float sc = slot < 0.5 ? uS.x : (slot < 1.5 ? uS.y : uS.z);
  float turn = tick(uBeat * 0.25 + slot * 0.3) * PI * 0.125 * (mod(k, 2.0) < 1.0 ? 1.0 : -1.0);
  vec2 p = rot(turn) * xy / (sc * (1.0 + uExpand * (slot < 0.5 ? 1.0 : 0.55)));
  if (uFold > 1.5 && slot < 0.5) {
    float seg = TAU / uFold, rr = length(p);
    float aa = abs(mod(atan(p.y, p.x) + tick(uBeat * 0.5) * seg * 0.5, seg) - seg * 0.5);
    p = rr * vec2(cos(aa), sin(aa));
  }
  return p;
}
float hAt(vec2 xy, float slot, float k){ return heightOf(layerMotif(slot, layerUV(xy, slot, k))); }


#ifdef ULTRA
// ── Ultra tier: physically based gold, clear-coated lacquer, soft shadows, AO, micro-detail ──
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
// A photographic studio: two soft boxes, a strip light and a dark cyc — what polished gold reflects.
vec3 studioEnv(vec3 R){
  float k1 = smoothstep(0.7, 0.97, dot(R, normalize(vec3(-0.45, 0.6, 0.66))));
  float k2 = smoothstep(0.82, 0.985, dot(R, normalize(vec3(0.75, 0.25, 0.6))));
  float strip = smoothstep(0.035, 0.0, abs(R.y - 0.15)) * smoothstep(-0.2, 0.6, R.z);
  float grad = 0.006 + 0.03 * clamp(R.y * 0.5 + 0.5, 0.0, 1.0);
  return vec3(grad) + vec3(1.0, 0.95, 0.88) * (k1 * 2.2 + k2 * 1.2 + strip * 0.8);
}
vec3 ultraShade(bool isGold, vec2 lp, vec3 pos, vec3 n, vec3 rd, vec3 Lk, float h0, float slot, float k, vec3 cBase){
  // hammered gold / orange-peel lacquer micro-normal
  vec2 q = lp * (isGold ? 70.0 : 140.0);
  float a0 = vn(q), ax = vn(q + vec2(0.35, 0.0)), ay = vn(q + vec2(0.0, 0.35));
  vec3 nm = normalize(n + vec3(ax - a0, ay - a0, 0.0) * (isGold ? 0.35 : 0.12));
  // soft shadow traced through the relief toward the light
  vec2 dir = normalize(Lk.xy); float slope = Lk.z / max(length(Lk.xy), 0.05);
  float sh = 1.0;
  for (int i = 1; i <= 7; i++) {
    float s = HS * 1.4 * float(i) / 7.0;
    sh = min(sh, clamp((h0 + s * slope - hAt(pos.xy + dir * s, slot, k)) / (0.06 * s + 0.004) + 0.5, 0.0, 1.0));
  }
  sh = mix(0.25, 1.0, sh);
  // ambient occlusion from the surrounding relief (two rings)
  float ao = 0.0;
  for (int i = 0; i < 6; i++) {
    float an = float(i) * 1.0472 + 0.4; vec2 o = vec2(cos(an), sin(an));
    ao += clamp((hAt(pos.xy + o * HS * 0.35, slot, k) - h0) / HS, 0.0, 1.0) + 0.5 * clamp((hAt(pos.xy + o * HS * 0.9, slot, k) - h0) / HS, 0.0, 1.0);
  }
  ao = 1.0 - clamp(ao / 6.0, 0.0, 0.75);
  vec3 V = -rd, R = reflect(rd, nm), H = normalize(Lk + V);
  float NL = max(dot(nm, Lk), 0.0), NH = max(dot(nm, H), 0.0), NV = max(dot(nm, V), 1e-3);
  if (isGold) {
    vec3 F0 = vec3(1.0, 0.6, 0.18); float rough = 0.16 + 0.12 * vn(lp * 18.0);
    float a2 = rough * rough * rough * rough, dd = NH * NH * (a2 - 1.0) + 1.0, D = a2 / (PI * dd * dd);
    float kk = (rough + 1.0) * (rough + 1.0) / 8.0, G = NV / (NV * (1.0 - kk) + kk) * NL / (NL * (1.0 - kk) + kk);
    vec3 F = F0 + (1.0 - F0) * pow(1.0 - NV, 5.0);
    vec3 spec = D * G * F / max(4.0 * NV, 1e-3);
    return (spec * 2.0 * sh + studioEnv(R) * F * 0.75 + F0 * F0 * NL * sh * 0.12) * ao * (1.0 + uKick * 0.8) * 0.6;
  }
  float Fc = 0.04 + 0.96 * pow(1.0 - NV, 5.0);
  return cBase * mix(0.55, 1.0, sh) * ao + (studioEnv(R) * 0.6 + pow(NH, 220.0) * 3.0 * sh) * Fc;
}
#endif

vec3 hueRot(vec3 c, float a){ const vec3 k = vec3(0.57735); float ca = cos(a); return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca); }

vec3 renderPx(vec2 suv){
  vec2 uv = (suv - 0.5) * vec2(uAspect, 1.0) * 2.0;
  vec3 ro = uCamPos;
  vec3 rd = normalize(uCamF + (uv.x * uCamR + uv.y * uCamU) * uTanFov);

  vec3 black = vec3(0.004, 0.003, 0.004);
  vec3 rasp = hueRot(vec3(0.58, 0.016, 0.11), uHue);
  vec3 deep = hueRot(vec3(0.24, 0.006, 0.05), uHue);
  vec3 bronze = vec3(0.2, 0.09, 0.016);
  vec3 neonC = hueRot(vec3(1.0, 0.05, 0.6), uHue);
  vec3 goldDark = vec3(0.16, 0.075, 0.012), goldMid = vec3(0.66, 0.39, 0.09), goldHi = vec3(1.0, 0.84, 0.46);

  // 1) Find the first relief surface along the ray (screens repeat every DGAP along -z).
  float hitT = -1.0, hitSlot = 0.0, hitK = 0.0, hitI = 0.0;
  float kStart = max(floor((HS - ro.z) / DGAP) + 1.0, uKMin);
  for (int i = 0; i < 3; i++) {
    if (hitT > 0.0 || rd.z > -1e-4) break;
    float k = kStart + float(i);
    float zb = -k * DGAP, zt = zb + HS;
    float t0 = max((zt - ro.z) / rd.z, 0.0), t1 = (zb - ro.z) / rd.z;
    if (t1 < 0.0) continue;
    float slot = mod(k, 3.0);
    // Distance-guided march: the motif SDF says how far to the next gold stroke, and the panel under
    // the ray has a known flat height, so each step jumps straight to the next event. Exact for
    // flat panels, can't skip thin strokes, and needs few iterations (small shader, fast compile).
    float th = -1.0, t = t0, lxy = max(length(rd.xy), 1e-4);
    for (int j = 0; j < 14; j++) {
      vec3 pp = ro + rd * t;
      M mm = layerMotif(slot, layerUV(pp.xy, slot, k));
      float above = pp.z - zb;
      if (above <= heightOf(mm) + 1e-4) { th = t; break; }
      float dv = (above - fillHeight(mm)) / -rd.z;
      float sc = slot < 0.5 ? uS.x : (slot < 1.5 ? uS.y : uS.z);
      float dxy = max((mm.c - mm.w) * sc, 0.002) / lxy;
      if (dv <= dxy) { t += dv; th = t; if (fillHeight(mm) <= 0.0) th = -1.0; if (th > 0.0) break; t += 0.002; }
      else t += dxy;
      if (t >= t1) break;
    }
    if (th > t1) th = -1.0;
    if (th < 0.0 && slot > 1.5) th = t1;   // the back screen is solid
    if (th > 0.0) { hitT = th; hitSlot = slot; hitK = k; hitI = float(i); }
  }

  vec3 col = vec3(0.0);
  if (hitT > 0.0) {
    // 2) Shade the hit once.
    vec3 black = vec3(0.004, 0.003, 0.004);
    vec3 rasp = hueRot(vec3(0.58, 0.016, 0.11), uHue);
    vec3 deep = hueRot(vec3(0.24, 0.006, 0.05), uHue);
    vec3 bronze = vec3(0.2, 0.09, 0.016);
    vec3 neonC = hueRot(vec3(1.0, 0.05, 0.6), uHue);
    vec3 goldDark = vec3(0.09, 0.04, 0.006), goldMid = vec3(0.5, 0.27, 0.05), goldHi = vec3(0.95, 0.68, 0.28);

    vec3 pos = ro + rd * hitT;
    vec2 lp = layerUV(pos.xy, hitSlot, hitK);
    M m = layerMotif(hitSlot, lp);
    float h0 = heightOf(m);
    float e = 0.004 + hitT * 0.0015;
    float hx = hAt(pos.xy + vec2(e, 0.0), hitSlot, hitK), hy = hAt(pos.xy + vec2(0.0, e), hitSlot, hitK);
    vec3 n = normalize(vec3(-(hx - h0) / e, -(hy - h0) / e, 1.0));

    // Raking key light swinging slowly across the relief.
    vec3 Lk = normalize(vec3(rot(sin(uTime * 0.23) * 0.7) * vec2(-0.55, 0.65), 0.52));
    float diff = max(dot(n, Lk), 0.0);
    float spec = pow(max(dot(reflect(-Lk, n), -rd), 0.0), 42.0);
    vec2 toL = Lk.xy / max(Lk.z, 0.2);
    float shadow = hAt(pos.xy + toL * (HS * 0.55), hitSlot, hitK) > h0 + HS * 0.15 ? 0.45 : 1.0;
    if (hitI > 0.5) { float fs = mod(hitK - 1.0, 3.0); if (hAt(pos.xy + toL * DGAP * 0.6, fs, hitK - 1.0) > 0.0) shadow *= 0.5; }

    bool isGold = m.c < m.w || m.fill > 3.5;
    vec3 c;
    if (isGold) {
      float env = 0.5 + 0.5 * sin((n.x * 2.3 + n.y * 3.1) * 2.4 + uTime * 0.25);
      c = mix(goldDark, goldMid, diff * shadow);
      c = mix(c, goldHi, env * 0.18 * shadow);
      c += goldHi * spec * shadow * (1.1 + uKick * 2.6);
      float sweep = exp(-pow((lp.x + lp.y * 0.4) - (fract(uBeat * 0.125) * 6.0 - 3.0), 2.0) * 6.0);
      c += goldHi * sweep * 0.3 * (0.4 + uEnergy);
      if (m.c >= m.w) c *= 0.8;
    } else {
      vec3 f = m.fill < 0.5 ? black : m.fill < 1.5 ? rasp : m.fill < 2.5 ? deep : bronze;
      f *= mix(0.5, 1.05, m.shade);
      if (m.fill < 0.5) f += vec3(0.012, 0.009, 0.008) * smoothstep(0.985, 1.0, sin(lp.x * 3.1 + sin(lp.y * 4.7 + lp.x * 1.3) * 2.0) * 0.5 + 0.5);
      c = f * (0.35 + 0.8 * diff) * shadow + vec3(1.0) * spec * 0.12 * shadow;
      c *= 1.0 - 0.35 * smoothstep(m.w + 0.03, m.w, m.c);
    }
#ifdef ULTRA
    c = ultraShade(isGold, lp, pos, n, rd, Lk, h0, hitSlot, hitK, c);
#endif
    c *= 1.0 + uVoice * 0.4 * exp(-length(pos.xy) * 1.2);
    c += neonC * exp(-max(m.neon, 0.0) * 90.0) * (0.08 + uTre * 1.0 + uSnare * 0.9) * 1.3 * (1.0 + uNeonBoost * 2.0);
    vec2 sg = lp * 9.0, sid = floor(sg), sf = fract(sg) - 0.5;
    float hh = hash(sid + hitK * 7.0);
    vec2 sq = sf - (vec2(hash(sid + 7.1), hash(sid + 3.3)) - 0.5) * 0.6;
    float tw = pow(max(0.0, sin(uTime * (2.0 + hh * 3.0) + hh * TAU)), 24.0) * step(0.74, hh) * (0.25 + uTre * 1.8 + uSnare);
    c += goldHi * (exp(-length(sq) * 40.0) + (exp(-abs(sq.x) * 140.0) + exp(-abs(sq.y) * 140.0)) * exp(-length(sq) * 12.0) * 0.5) * tw * 2.2;
    c *= exp(-hitT * 0.07) * (1.0 - 0.18 * hitI);
    col = c;
  }
  // 3) Flying ornament: on a snare/kick hit a gold copy of the front screen's ornament tears off the
  //    wall and flies at the camera, turning and fading as it comes.
  if (uFlyAmt > 0.001 && rd.z < -1e-4) {
    float zf = uFlyZ + uFly * 3.2, tf = (zf - ro.z) / rd.z;
    if (tf > 0.05 && (hitT < 0.0 || tf < hitT)) {
      vec2 fp = (ro + rd * tf).xy;
      vec2 flp = rot(uFlyRot * uFly) * fp / (uS.x * (1.0 + uFly * 0.35));
      M mf = layerMotif(0.0, flp);
      if (mf.c < mf.w * 1.6) {
        vec3 goldMidF = vec3(0.5, 0.27, 0.05), goldHiF = vec3(0.95, 0.68, 0.28);
        float edge = clamp(mf.c / (mf.w * 1.6), 0.0, 1.0);
        vec3 gcol = mix(goldHiF * 1.4, goldMidF, edge) + goldHiF * (1.0 - uFly) * 0.6;
        col = mix(col, gcol, (1.0 - smoothstep(0.6, 1.0, uFly)) * uFlyAmt * (1.0 - edge * edge));
      }
    }
  }
  col += vec3(0.95, 0.68, 0.28) * uFlash * 0.16;
  col *= 1.0 - uDark * 0.45;
  return col;
}
void main(){
#ifdef ULTRA
  // Two rays per pixel on a rotated grid: clean gold edges without a TAA history.
  vec2 d = vec2(dFdx(vUv.x), dFdy(vUv.y));
  vec3 col = vec3(0.0);
  for (int s = 0; s < 2; s++) { float sg = float(s) * 2.0 - 1.0; col += renderPx(vUv + d * vec2(0.25, -0.25) * sg + d * vec2(0.125, 0.125) * -sg); }
  gl_FragColor = vec4(col * 0.5, 1.0);
#else
  gl_FragColor = vec4(renderPx(vUv), 1.0);
#endif
}`;

type Shot = { kind: number; len: number; seed: number };
const SHOT_KINDS = ['wide', 'tight', 'crane', 'orbit', 'dolly', 'snap'] as const;

export function buildDecoMorph(THREE: any, renderer: any): SceneInst {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
  const geo = new THREE.PlaneGeometry(2, 2);
  const U: any = {
    uTime: { value: 0 }, uAspect: { value: 16 / 9 }, uBeat: { value: 0 },
    uKick: { value: 0 }, uBass: { value: 0 }, uMid: { value: 0 }, uTre: { value: 0 }, uSnare: { value: 0 }, uVoice: { value: 0 },
    uEnergy: { value: 0 }, uHue: { value: 0 }, uSwing: { value: 1 }, uPix: { value: 0.002 },
    uCamPos: { value: new THREE.Vector3(0, 0, 5) }, uCamR: { value: new THREE.Vector3(1, 0, 0) }, uCamU: { value: new THREE.Vector3(0, 1, 0) }, uCamF: { value: new THREE.Vector3(0, 0, -1) },
    uTanFov: { value: 0.4 }, uS: { value: new THREE.Vector3(1, 1.5, 2.3) }, uFold: { value: 0 }, uKMin: { value: 0 },
    uExpand: { value: 0 }, uHMul: { value: 1 }, uFanVoice: { value: 0 }, uFanOpen: { value: 0.5 }, uFly: { value: 0 }, uFlyAmt: { value: 0 },
    uFlyRot: { value: 0 }, uFlyZ: { value: 0 }, uFlash: { value: 0 }, uNeonBoost: { value: 0 }, uDark: { value: 0 },
  };
  // One compiled variant per layout (only its three motifs), built on first use and shared uniforms.
  const MOTIF_FN = ['fans', 'diamonds', 'arches', 'medallions', 'starburst', 'chevrons', 'mandala', 'rosette', 'gearGrid', 'cartouche'];
  const mats = new Map<number, any>();
  const materialFor = (li: number, ultra = false) => {
    let mm = mats.get(li + (ultra ? 1000 : 0));
    if (!mm) {
      const L = LAYOUTS[li].L;
      const frag = (ultra ? '#define ULTRA\n' : '') + FRAG.replace('__M0__', MOTIF_FN[L[0]]).replace('__M1__', MOTIF_FN[L[1]]).replace('__M2__', MOTIF_FN[L[2]]);
      mm = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: frag, depthTest: false, depthWrite: false });
      mats.set(li + (ultra ? 1000 : 0), mm);
    }
    return mm;
  };
  const mat = materialFor(0);
  // Compile every other layout in the background (parallel shader compile) so a layout never
  // freezes playback the first time it appears — some variants take seconds on ANGLE/D3D.
  // The director only picks layouts whose program is ready.
  const ready = new Set<number>([0]);
  const readyU = new Set<number>(), compilingU = new Set<number>();
  // Background compile queue: starts once playback is running, one layout at a time, so it never
  // competes with the first frame.
  let frames = 0, compiling = false, nextToCompile = 1;
  const pumpCompile = () => {
    if (compiling || nextToCompile >= LAYOUTS.length || frames < 20) return;
    const li = nextToCompile++;
    const sc2 = new THREE.Scene(), q2 = new THREE.Mesh(geo, materialFor(li));
    q2.frustumCulled = false; sc2.add(q2);
    try {
      const pr = renderer?.compileAsync?.(sc2, camera);
      if (pr && typeof pr.then === 'function') { compiling = true; pr.then(() => { ready.add(li); compiling = false; }).catch(() => { compiling = false; }); }
      else ready.add(li);
    } catch { /* leave it out of rotation */ }
  };
  const quad = new THREE.Mesh(geo, mat);
  quad.frustumCulled = false;
  scene.add(quad);

  const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const pos = V(), tgt = V(), fwd = V(), right = V(), up = V(), WUP = V(0, 1, 0);
  let last = -1, phraseClock = 0, layoutI = 0, layoutPhrase = -1;
  let shotStart = 0, shotN = 0, shot: Shot = { kind: 0, len: 8, seed: 0 };
  let travel = 0, shotTravel0 = 0;
  // Song-shape tracking (builds, drops, breakdowns) and hit envelopes.
  let eFast = 0, eMid = 0, eSlow = 0, build = 0, dropBoost = 0, flash = 0, dark = 0, lastDropBeat = -99;
  let vPeak = 0.15, fanVoice = 0, fanOpenS = 0.5, fly = 1, flyAmt = 0, flyRot = 0, prevSnare = 0, prevKick = 0, jolt = 0, spin = 0;
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

  const pickShot = (n: number, energy: number): Shot => {
    const lens = energy > 0.6 ? [2, 2, 4, 4, 8] : energy > 0.3 ? [2, 4, 4, 8, 8, 16] : [4, 8, 8, 16];
    return { kind: Math.floor(hash(n * 2.31 + 0.7) * SHOT_KINDS.length), len: lens[Math.floor(hash(n * 5.17 + 0.2) * lens.length)], seed: hash(n * 9.13 + 0.4) };
  };

  return {
    scene, camera,
    cam: { target: [0, 0, 0], radius: 10, pitch: 0, yaw: 0, fov: 45, lock: true },
    exposure: 0.95, brightThreshold: 0.85, grain: 0.012,
    update(t: number, a: FluxDriven, spec: FluxSpec) {
      if (last < 0 || t < last || t - last > 2) { phraseClock = 0; layoutPhrase = -1; shotStart = 0; shotN = 0; travel = 0; shotTravel0 = 0; eFast = eMid = eSlow = build = dropBoost = flash = dark = 0; lastDropBeat = -99; fly = 1; flyAmt = 0; jolt = 0; spin = 0; }
      const dt = last < 0 ? 1 / 60 : Math.min(0.2, Math.max(0, t - last));
      last = t;
      frames++; pumpCompile();
      const kick = a.kick ?? 0, snare = a.snare ?? 0, bass = a.bass, mid = a.mid, tre = a.tre;
      const energy = Math.min(1, a.intensity ?? a.energy ?? 0);

      phraseClock += dt * (0.8 + energy * 0.6);
      const bp = a.beatPosition, tempoOk = (a.tempoConfidence ?? 0) > 0.3 && Number.isFinite(bp);
      const beats = tempoOk ? (bp as number) : phraseClock * 2;
      const k1 = (tau: number) => 1 - Math.exp(-dt / tau);

      // Song shape: a build is mid-term energy climbing over the long-term level; a drop is a sudden
      // jump after a build or a quiet stretch; a breakdown is a long quiet stretch.
      eFast += (energy - eFast) * k1(0.35); eMid += (energy - eMid) * k1(2.5); eSlow += (energy - eSlow) * k1(8);
      build += (clamp01((eMid - eSlow) * 5 - 0.1) - build) * k1(1.5);
      const dropNow = eFast - eSlow > 0.28 && beats - lastDropBeat > 16 && (build > 0.25 || eSlow < 0.35);
      if (dropNow) { lastDropBeat = beats; dropBoost = 1; flash = 1; }
      dropBoost *= Math.exp(-dt / 0.9); flash *= Math.exp(-dt / 0.35);
      dark += (clamp01((0.22 - eSlow) * 4) - dark) * k1(2);

      // Hits: snares (and big kicks) tear an ornament off the wall toward camera and jolt the roll.
      const snareHit = snare > 0.5 && prevSnare <= 0.5, kickHit = kick > 0.6 && prevKick <= 0.6;
      prevSnare = snare; prevKick = kick;
      if ((snareHit || (kickHit && energy > 0.55)) && fly >= 1) { fly = 0; flyAmt = 1; flyRot = (hash(t * 3.1) - 0.5) * 2.2; }
      if (fly < 1) { fly = Math.min(1, fly + dt / 0.7); if (fly >= 1) flyAmt = 0; }
      if (snareHit) jolt += (hash(t * 5.3) - 0.5) * 0.35;
      jolt *= Math.exp(-dt / 0.25);
      spin += dt * (0.04 + mid * 0.2 + build * 0.6);

      // Voice drives the fans: its level (auto-gained) sets how open they are while a vocal is present.
      const voice = a.voice ?? 0;
      vPeak = Math.max(voice, vPeak - dt * 0.05, 0.15);
      fanOpenS += (clamp01(voice / vPeak) - fanOpenS) * k1(0.08);
      fanVoice += (clamp01((voice - 0.08) * 4) - fanVoice) * k1(0.4);

      // Layout every 4 bars (or held), always landing on a camera cut.
      const held = typeof spec.decoSeed === 'number' && spec.decoSeed >= 0 ? Math.floor(spec.decoSeed) % LAYOUTS.length : -1;
      const phraseNow = Math.floor(beats / 16);
      let forceCut = false;
      if (held >= 0) layoutI = held;
      else if (phraseNow !== layoutPhrase || dropNow) {
        if (layoutPhrase >= 0) forceCut = true;
        layoutPhrase = phraseNow;
        if (phraseNow > 0) {
          let cand = (layoutI + 1 + Math.floor(hash(phraseNow * 1.7) * (LAYOUTS.length - 1))) % LAYOUTS.length;
          for (let tries = 0; tries < LAYOUTS.length && !ready.has(cand); tries++) cand = (cand + 1) % LAYOUTS.length;
          if (ready.has(cand)) layoutI = cand;
        }
      }
      const lay = LAYOUTS[layoutI];

      // Director: cut on the beat when the shot has run its length.
      if (forceCut || beats - shotStart >= shot.len || beats < shotStart) {
        shotStart = Math.floor(beats); shotN++;
        shot = pickShot(shotN, Math.min(1, energy + build * 0.4));
        if (dropNow) shot = { kind: SHOT_KINDS.indexOf(hash(t) > 0.5 ? 'dolly' : 'snap'), len: 8, seed: hash(t * 1.3) };
        shotTravel0 = travel;
      }
      const u = Math.min(1, Math.max(0, (beats - shotStart) / shot.len));
      const kind = SHOT_KINDS[shot.kind], sd = shot.seed;
      // World travel: always a slow creep; dolly shots fly through a screen per bar.
      travel += dt * (0.05 + energy * 0.12) * (kind === 'dolly' ? 0 : 1);
      if (kind === 'dolly') travel = shotTravel0 + u * shot.len / 4 * D;
      const zFront = -Math.ceil(travel / D) * D + H; // top of the next screen ahead of the anchor
      let fov = 46, roll = 0;
      const ang = sd * Math.PI * 2;
      if (kind === 'wide') {
        pos.set(Math.sin(spin * 0.7) * 1.2 * energy, Math.cos(spin * 0.5) * 0.6 * energy, zFront + 5.2 - u * 1.2); tgt.set(0, 0, zFront - 2);
      } else if (kind === 'tight') {
        const th = 0.7 + sd * 0.35, dist = 1.2 + hash(sd * 3) * 0.6;
        tgt.set(Math.cos(ang) * 1.1 + u * 0.5 * Math.cos(ang * 2), Math.sin(ang) * 0.8 + u * 0.5 * Math.sin(ang * 2), zFront);
        pos.set(tgt.x + Math.cos(ang + 1) * Math.sin(th) * dist, tgt.y + Math.sin(ang + 1) * Math.sin(th) * dist, tgt.z + Math.cos(th) * dist);
        fov = 34; roll = (hash(sd * 7) - 0.5) * 0.35;
      } else if (kind === 'crane') {
        const dirx = Math.cos(ang), diry = Math.sin(ang), sweep = (u - 0.5) * 3.2;
        tgt.set(dirx * sweep, diry * sweep, zFront);
        pos.set(tgt.x - diry * 2.0, tgt.y + dirx * 2.0, zFront + 1.3);
        fov = 42;
      } else if (kind === 'orbit') {
        const phi = ang + u * 1.4 * (sd > 0.5 ? 1 : -1), th = 0.6;
        tgt.set(0, 0, zFront - 0.4);
        pos.set(Math.cos(phi) * Math.sin(th) * 3.4, Math.sin(phi) * Math.sin(th) * 3.4, tgt.z + Math.cos(th) * 3.4);
        fov = 44;
      } else if (kind === 'dolly') {
        const zc = -travel + 3.2;
        pos.set(Math.sin(ang) * 0.3, Math.cos(ang) * 0.2, zc); tgt.set(Math.sin(ang + u) * 0.15, 0, zc - 4);
        fov = 62; roll = Math.sin(u * Math.PI) * 0.12 * (sd > 0.5 ? 1 : -1);
      } else { // snap zoom, in or out
        const zin = sd > 0.5, e2 = 1 - Math.pow(1 - Math.min(1, u * 4), 3);
        pos.set(Math.cos(ang) * 0.6, Math.sin(ang) * 0.4, zFront + 4.2); tgt.set(Math.cos(ang) * 0.3, Math.sin(ang) * 0.2, zFront);
        fov = zin ? 50 - 30 * e2 : 20 + 30 * e2; roll = (sd - 0.5) * 0.2;
      }
      // Camera rotation: a slow roll that winds up through builds, plus snare jolts. Kick punch-in.
      roll += Math.sin(spin) * (0.1 + build * 0.3) + jolt;
      fov *= 1 - kick * 0.07 - dropBoost * 0.12;
      pos.x += (hash(t * 13.1) - 0.5) * kick * 0.03; pos.y += (hash(t * 7.7) - 0.5) * kick * 0.03;
      fwd.copy(tgt).sub(pos).normalize();
      right.crossVectors(fwd, WUP).normalize(); up.crossVectors(right, fwd).normalize();
      if (roll) { const c = Math.cos(roll), s = Math.sin(roll); const rx = right.clone(); right.multiplyScalar(c).addScaledVector(up, s); up.multiplyScalar(c).addScaledVector(rx, -s); }

      U.uTime.value = t; U.uAspect.value = camera.aspect || 16 / 9; U.uBeat.value = beats;
      U.uKick.value = kick; U.uBass.value = bass; U.uMid.value = mid; U.uTre.value = tre; U.uSnare.value = snare;
      U.uVoice.value = a.voice ?? 0; U.uEnergy.value = energy;
      U.uHue.value = (typeof spec.hue === 'number' ? spec.hue - 0.5 : 0) * Math.PI * 2;
      U.uSwing.value = 0.6 + bass * 0.8 + energy * 0.4;
      U.uCamPos.value.copy(pos); U.uCamR.value.copy(right); U.uCamU.value.copy(up); U.uCamF.value.copy(fwd);
      U.uTanFov.value = Math.tan(fov * Math.PI / 360);
      // Screens behind the anchor are gone; a dolly keeps the ones from where it started so it flies through them.
      U.uKMin.value = Math.ceil((kind === 'dolly' ? shotTravel0 : travel) / D - 1e-6);
      // Ultra variants compile in the background on first request; standard renders until ready.
      const wantUltra = (spec as any).quality === 'ultra';
      if (wantUltra && !readyU.has(layoutI) && !compilingU.has(layoutI)) {
        compilingU.add(layoutI); const li = layoutI;
        const sc2 = new THREE.Scene(), q2 = new THREE.Mesh(geo, materialFor(li, true)); q2.frustumCulled = false; sc2.add(q2);
        try { const pr = renderer?.compileAsync?.(sc2, camera); if (pr && pr.then) pr.then(() => readyU.add(li)).catch(() => { /* stays standard */ }); else readyU.add(li); } catch { /* */ }
      }
      quad.material = materialFor(layoutI, wantUltra && readyU.has(layoutI)); U.uS.value.set(lay.S[0], lay.S[1], lay.S[2]);
      const forced = (spec as any).kaleidoscope;
      U.uFold.value = typeof forced === 'number' && forced > 0 ? [0, 6, 8, 12][Math.min(3, forced)] : (lay.fold || (build > 0.6 ? 8 : 0));
      // Bass and kicks expand the architecture outward and swell the relief toward camera; drops blow it open.
      U.uExpand.value = kick * 0.14 + bass * 0.07 + dropBoost * 0.35;
      U.uHMul.value = 1 + kick * 0.7 + bass * 0.35 + dropBoost * 0.8;
      U.uFanVoice.value = fanVoice; U.uFanOpen.value = fanOpenS;
      U.uFly.value = fly; U.uFlyAmt.value = flyAmt; U.uFlyRot.value = flyRot; U.uFlyZ.value = zFront;
      U.uFlash.value = flash; U.uNeonBoost.value = build; U.uDark.value = dark * (1 - build);
    },
    bloom: (a: FluxDriven) => 0.35 + Math.min(1, a.intensity ?? 0) * 0.3 + (a.kick ?? 0) * 0.3,
    dispose() { geo.dispose(); mats.forEach(mm => mm.dispose()); },
  };
}

export const DECO_LAYOUT_NAMES = LAYOUTS.map(l => l.name);
