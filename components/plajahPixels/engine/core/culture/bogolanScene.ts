import type { SceneInst } from '../flux';
import type { FluxDriven, FluxSpec } from '../../../../../services/fabula/fluxNode';

/**
 * Bògòlan Mud-Cloth — rebuilt from the "Culture visualizers" clips
 * (African_geometric_patterns_shifting_…, Geometric_patterns_shifting_with…, African_art_patterns_and_motifs).
 *
 * Everything is real geometry: hand-painted mud-cloth on boards with thickness, layered at different
 * depths under a warm raking key with shadow maps, so overlapping panels cast onto the cloth behind.
 * One procedural cloth shader paints every surface (rust / ochre / cream / black-brown): zigzag
 * chevron bands, X-and-dash bands, dot rows, interlocking triangle rows, sawtooth, diamond lattices,
 * concentric squares, hourglass crosses, comb bars — with noise-wobbled hand-drawn edges, uneven dye,
 * a woven-thread micro normal and slow fabric wrinkles. Rings use a polar mapping of the same bands.
 *
 * Behind everything: a patchwork wall of square cloth tiles (each its own motif) that juts out per
 * column with the spectrum and flips over (new motif on the back) on snares and at moment changes.
 *
 * Moments, in the clips' order (sections every 16 beats):
 *  - WEAVE    (clip A 0–1.7s / B 6–7s): tall vertical strips — big zigzag chevrons + dark X strips —
 *             slide in from top/bottom and scroll in opposite directions; columns left→right are keyed
 *             lows→highs (scroll speed + push toward camera); kicks jump the low columns a half-motif,
 *             snares jump the high ones; the voice ripples the cloth. 2nd pass: tilted panels (clip B 1.7s).
 *  - ROSETTE  (A 1.7–2.6s): triangular petals spiral in and assemble a rosette round a rust disc over a
 *             diamond-lattice wall (tiles flip to the lattice). Inner petals = bass (pop on kicks), middle
 *             ring = mids (steps one petal per kick), outer teeth = highs (flip over on snares); the
 *             voice opens the flower (petals tilt toward camera).
 *  - BANDS    (A 3.9–5.2s, 6.9–9s): horizontal bands (triangles, X-dash bands, dot rows, sawtooth)
 *             scroll in opposite directions; centre rows = lows; snares shift every band one motif,
 *             kicks send a shock ripple through the cloth. 2nd pass: the cream triangle-row cloth.
 *  - MANDALA  (A 5.6–6.5s / B 0–1.3s): 11 concentric patterned rings counter-rotate, stepped in depth
 *             like a ziggurat that rises with the bass; inner rings = lows, outer = highs; snares tick
 *             alternate rings one motif, kicks send a bump outward; a cream star spins at the centre.
 *  - DIAMOND  (B 2.6–4.3s): nested diamond frames pulse out of the patchwork as an EQ (centre = lows),
 *             chevron arrows stream outward step-by-step on kicks, frames twist on snares.
 *  - SHATTER  (B 4.75–5.6s, A 7.3s): a triangle mosaic assembles, kicks blast rings of it toward the
 *             camera (tumbling solid + outline triangles), snares blow out a sector; it re-assembles.
 *  - BURST    (A 9.5s, A 3.5s): radial sunburst of patterned rays leaning toward camera (a radial EQ —
 *             each ray's length is a frequency band), mosaic triangles stream outward. Drops jump here.
 *
 * Builds fan the woven layers apart in depth and spread the wall EQ; drops (beats > 8) cut to BURST
 * with a light flash. Idle motion (slow scroll, breathing rings, cloth undulation) keeps silence alive.
 * spec.decoSeed >= 0 holds a moment: 0 weave · 1 rosette · 2 bands · 3 mandala · 4 diamond · 5 shatter · 6 burst.
 */

// ── palette (sRGB → linear) ──
const PAL_HEX = ['#e8cfa0', '#b97c3a', '#b0602a', '#7a4220', '#3b2212', '#1c110a', '#8e3a1f', '#9a683a'];
const CR = 0, OC = 1, RU = 2, BR = 3, DK = 4, BK = 5, RD = 6, TN = 7;
const toLin = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.pow(v / 255, 2.2).toFixed(4)); };
const PAL_GLSL = PAL_HEX.map((h, i) => `const vec3 C${i} = vec3(${toLin(h).join(', ')});`).join('\n');
const tint = (a: number, b: number, v = 0) => a + 8 * b + 64 * v;

// pattern ids
const P = { PLAIN: 0, ZIG: 1, DARKX: 2, BANDX: 3, DOTS: 4, TRI: 5, SAW: 7, CHEV: 8, DIAM: 10, CONC: 11, HOUR: 12, DOTG: 13, COMB: 14, CHST: 15, CROSS: 16, SPOKE: 20, DISC: 21, SOLID: 30, TFILL: 40, THOLL: 41, RAY: 42, PETAL: 43, STAR: 44 };
// full repeat (in band widths) of the band patterns, so rings wrap seamlessly
const PERIOD: Record<number, number> = { [P.ZIG]: 2, [P.DARKX]: 3, [P.BANDX]: 3.2, [P.DOTS]: 0.55, [P.TRI]: 1.1, [P.SAW]: 1.0, [P.CHEV]: 2 / 3, [P.SPOKE]: 0.625 };

const CLOTH_GLSL = `
${PAL_GLSL}
uniform float uTime, uDot;
float bh(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float bn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(bh(i), bh(i + vec2(1.0, 0.0)), f.x), mix(bh(i + vec2(0.0, 1.0)), bh(i + vec2(1.0, 1.0)), f.x), f.y); }
float bf(vec2 p){ return bn(p) * 0.55 + bn(p * 2.3 + 7.1) * 0.3 + bn(p * 5.1 + 3.7) * 0.15; }
float tri1(float x){ return abs(fract(x) - 0.5) * 2.0; }
vec3 pal(float i){ i = mod(floor(i + 0.5), 8.0);
  if (i < 0.5) return C0; if (i < 1.5) return C1; if (i < 2.5) return C2; if (i < 3.5) return C3;
  if (i < 4.5) return C4; if (i < 5.5) return C5; if (i < 6.5) return C6; return C7; }
float gPX;
float fillD(float d){ float a = gPX * 0.9 + 0.002; return 1.0 - smoothstep(-a, a, d); }
float lineD(float d, float w){ return fillD(abs(d) - w); }
float bandP(float s, float c, float hw, float k){ float d = abs(fract(s - c + 0.5) - 0.5); float a = gPX * k * 0.9 + 0.003; return 1.0 - smoothstep(hw - a, hw + a, d); }
float lum(vec3 c){ return dot(c, vec3(0.3, 0.59, 0.11)); }
float triE(vec2 q){
  float d1 = q.y + 0.433;
  float d2 = (q.x + 0.5) * 0.866 - (q.y + 0.433) * 0.5;
  float d3 = (0.5 - q.x) * 0.866 - (q.y + 0.433) * 0.5;
  return min(d1, min(d2, d3)); }
#define PAINT(c, m) { float mm_ = (m); col = mix(col, (c), mm_); ink = max(ink, mm_); }

vec4 cloth(float id, vec2 q, float tnt, vec2 cl){
  vec3 A = pal(mod(tnt, 8.0)), B = pal(mod(floor(tnt / 8.0), 8.0)); float V = floor(tnt / 64.0);
  q += (vec2(bn(cl * 2.3 + id), bn(cl * 2.3 + id + 9.1)) - 0.5) * 0.035;   // hand-painted wobble
  vec3 col = A; float ink = 0.0;
  vec3 LC = lum(A) < 0.12 ? C0 : C4;    // a line colour that reads on the ground
  if (id < 0.5) {
    col = A;
  }
#ifdef SET_BAND
  else if (id < 1.5) {            // ZIG — big zigzag chevron bands running along the strip
    float s = q.y * 3.0 + (tri1(q.x * 0.5) - 0.5) * 1.8;
    col = mod(floor(s), 2.0) < 1.0 ? A : B;
    PAINT(C0, bandP(s, 0.2, 0.19, 3.6));
    PAINT(C5, bandP(s, 0.43, 0.04, 3.6));
    PAINT(C5, bandP(s, 0.95, 0.05, 3.6));
  } else if (id < 2.5) {            // DARKX — dark strip: X, chevron stack, dot quincunx
    float c = floor(q.x); vec2 l = vec2(fract(q.x) - 0.5, q.y - 0.5);
    float m = mod(c, 3.0), box = max(abs(l.x), abs(l.y)) - 0.36;
    if (m < 0.5) PAINT(B, lineD(min(abs(l.x - l.y), abs(l.x + l.y)) * 0.7071, 0.035) * fillD(box))
    else if (m < 1.5) PAINT(B, bandP((abs(l.x) - l.y) * 3.0, 0.5, 0.11, 3.2) * fillD(box))
    else { PAINT(B, fillD(length(abs(l) - 0.2) - 0.065 * (0.8 + uDot * 0.6))); PAINT(B, fillD(length(l) - 0.07)); }
    PAINT(B, lineD(q.y - 0.06, 0.018)); PAINT(B, lineD(q.y - 0.94, 0.018));
  } else if (id < 3.5) {            // BANDX — triple bars · X · dashes · X with dots
    float cw = 0.8, c = floor(q.x / cw); vec2 l = vec2((fract(q.x / cw) - 0.5) * cw, q.y - 0.5);
    float m = mod(c, 4.0);
    if (m < 0.5) PAINT(B, lineD(min(min(abs(l.x + 0.13), abs(l.x)), abs(l.x - 0.13)), 0.028) * fillD(abs(l.y) - 0.28))
    else if (m < 1.5 || m > 2.5) {
      PAINT(B, lineD(min(abs(l.x - l.y), abs(l.x + l.y)) * 0.7071, 0.032) * fillD(max(abs(l.x), abs(l.y)) - 0.27));
      if (m > 2.5) PAINT(B, fillD(length(vec2(abs(l.x) - 0.33, l.y)) - 0.045 * (0.8 + uDot * 0.6)));
    } else PAINT(B, lineD(min(min(abs(l.y + 0.14), abs(l.y)), abs(l.y - 0.14)), 0.028) * fillD(abs(l.x) - 0.26))
  } else if (id < 4.5) {            // DOTS — dot row, every 7th dot black
    float cw = 0.55, c = floor(q.x / cw); vec2 l = vec2((fract(q.x / cw) - 0.5) * cw, q.y - 0.5);
    float r = 0.15 * (0.75 + uDot * 0.7) * (0.9 + 0.2 * bh(vec2(c, 3.0)));
    PAINT(mod(c, 7.0) < 0.5 ? C5 : B, fillD(length(l) - r));
  } else if (id < 6.5) {            // TRI — interlocking triangle row with nested triangles
    float Pp = 1.1, f = tri1(q.x / Pp), de = ((1.0 - f) - q.y) * 0.52;
    float h = bh(vec2(floor(q.x / Pp), 7.0 + V));
    vec3 upC = h < 0.3 ? B : (h < 0.55 ? C0 : (h < 0.8 ? C5 : C2));
    if (V > 0.5) upC = h < 0.5 ? C0 : B;
    col = de > 0.0 ? upC : A;
    vec3 inC = lum(upC) > 0.3 ? (V > 0.5 ? C2 : C5) : C0;
    PAINT(inC, fillD(-(de - 0.12)) * step(0.0, de));
    PAINT(upC, fillD(-(de - 0.19)));
    PAINT(lum(A) > 0.3 ? C3 : C0, lineD(-de - 0.12, 0.022) * step(0.0, -de));
    PAINT(V > 0.5 ? C3 : C5, lineD(de, V > 0.5 ? 0.045 : 0.03));
  } else if (id < 7.5) {            // SAW — sawtooth teeth top and bottom
    float f = tri1(q.x / 0.5), f2 = tri1(q.x / 0.5 + 0.5);
    float tId = floor(q.x / 0.5);
    PAINT(mod(tId, 2.0) < 1.0 ? B : C3, fillD(((0.62 + 0.38 * f) - q.y) * -0.6));
    PAINT(mod(tId, 2.0) < 1.0 ? C3 : B, fillD((q.y - (0.38 - 0.38 * f2)) * 0.6));
    PAINT(B, lineD(q.y - 0.5, 0.016) * step(0.3, fract(q.x * 0.25)));
  } else if (id < 8.5) {            // CHEV — chevron stripes
    float s = (q.x + abs(q.y - 0.5) * 1.4) * 1.5;
    PAINT(C0, bandP(s, 0.25, 0.15, 2.2)); PAINT(B, bandP(s, 0.7, 0.12, 2.2));
  }
#endif
#ifdef SET_TILE
  else if (id < 10.5) {           // DIAM — tile: diamond (nested frame or dots); tiles form a lattice
    vec2 p = q - 0.5; float m = abs(p.x) + abs(p.y);
    vec3 L2 = lum(B) < 0.12 ? C0 : C5;
    PAINT(B, fillD(m - 0.40)); PAINT(L2, lineD(m - 0.445, 0.02));
    if (V < 0.5) { PAINT(L2, lineD(m - 0.27, 0.028)); PAINT(lum(B) < 0.12 ? C7 : C4, fillD(m - 0.13)); }
    else { vec2 r = vec2(p.x + p.y, p.x - p.y) * 0.7071; vec2 gl = (fract(r / 0.13 + 0.5) - 0.5) * 0.13;
      PAINT(L2, fillD(length(gl) - 0.024 * (0.8 + uDot * 0.6)) * fillD(m - 0.33)); }
    PAINT(L2, fillD(length(vec2(abs(p.x) - 0.5, abs(p.y) - 0.5)) - 0.05));
  } else if (id < 11.5) {           // CONC — concentric squares
    vec2 p = q - 0.5; float s = max(abs(p.x), abs(p.y)) * 7.0, k = mod(floor(s), 3.0);
    col = k < 0.5 ? A : (k < 1.5 ? C0 : B); ink = step(0.5, k);
  } else if (id < 12.5) {           // HOUR — dark tile, cream X, filled hourglass, side dots
    vec2 p = q - 0.5;
    PAINT(B, fillD(max(abs(p.x) - abs(p.y) + 0.07, abs(p.y) - 0.4)));
    PAINT(C0, lineD(abs(abs(p.x) - abs(p.y)) * 0.7071, 0.022) * fillD(max(abs(p.x), abs(p.y)) - 0.42));
    PAINT(C0, fillD(length(vec2(abs(p.x) - 0.3, p.y)) - 0.045 * (0.8 + uDot * 0.6)));
  } else if (id < 13.5) {           // DOTG — dot grid with a border
    vec2 p = q - 0.5; vec2 gl = (fract(p * 4.0) - 0.5) / 4.0;
    PAINT(B, fillD(length(gl) - 0.032 * (0.8 + uDot * 0.6)) * fillD(max(abs(p.x), abs(p.y)) - 0.42));
    PAINT(B, lineD(max(abs(p.x), abs(p.y)) - 0.46, 0.014));
  } else if (id < 14.5) {           // COMB — rows of dashes
    vec2 p = q - 0.5; float d = abs(fract(p.y / 0.16 + 0.5) - 0.5) * 0.16;
    PAINT(B, lineD(d, 0.024) * fillD(abs(p.x) - 0.38) * fillD(abs(p.y) - 0.4) * step(0.16, fract(p.x * 2.6 + floor(p.y / 0.16 + 0.5) * 0.37)));
  } else if (id < 15.5) {           // CHST — stacked chevrons
    vec2 p = q - 0.5;
    PAINT(B, bandP((p.y + abs(p.x)) * 5.0, 0.5, 0.12, 6.5) * fillD(max(abs(p.x), abs(p.y)) - 0.4));
  } else if (id < 16.5) {           // CROSS — cross with quadrant dots
    vec2 p = q - 0.5;
    PAINT(B, fillD(min(abs(p.x), abs(p.y)) - 0.05) * fillD(max(abs(p.x), abs(p.y)) - 0.4));
    PAINT(B, fillD(length(abs(p) - 0.22) - 0.05 * (0.8 + uDot * 0.6)));
  }
#endif
#ifdef SET_POLX
  else if (id < 20.5) {           // SPOKE — ring of ticks
    PAINT(B, bandP(q.x * 1.6, 0.5, 0.09, 1.6) * fillD(abs(q.y - 0.5) - 0.3));
  } else if (id < 21.5) {           // DISC — rust centre disc with fine radial + concentric lines
    float an = atan(cl.y, cl.x) / 6.2831853 * 24.0;
    PAINT(C4, bandP(an, 0.5, 0.05, 1.0) * step(0.3, q.y) * step(q.y, 0.86));
    PAINT(C4, bandP(q.y * 4.0, 0.5, 0.05, 4.0));
    PAINT(C5, fillD(q.y - 0.12));
  }
#endif
#if defined(SET_POLX) || defined(SET_SHARD)
  else if (id < 30.5) {           // SOLID — brushed paint
    col = A * (0.88 + 0.2 * bn(vec2(cl.x * 1.3 + cl.y * 0.4, cl.y * 9.0)));
    ink = step(0.3, lum(A));
  }
#endif
#ifdef SET_SHARD
  else if (id < 40.5) {           // TFILL — solid triangle with a nested outline and a dot
    float e = triE(q);
    PAINT(B, lineD(e - 0.11, 0.025)); PAINT(B, fillD(length(q - vec2(0.0, -0.144)) - 0.04));
  } else if (id < 41.5) {           // THOLL — outline triangle (hollow)
    if (triE(q) > 0.085) discard;
  } else if (id < 42.5) {           // RAY — long ray with chevron hatching and dark edges
    float e = triE(q);
    PAINT(B, bandP(q.y * 9.0 + abs(q.x) * 4.0, 0.5, 0.1, 9.5));
    PAINT(C5, lineD(e, 0.012));
  } else if (id < 43.5) {           // PETAL — cream petal with a zigzag spine
    float e = triE(q);
    PAINT(B, lineD(q.x - (tri1(q.y * 4.0) - 0.5) * 0.12, 0.035) * step(0.05, e));
    PAINT(B, fillD(length(vec2(abs(q.x) - 0.17, fract(q.y * 3.0) - 0.5)) - 0.04) * step(0.07, e));
    PAINT(C3, lineD(e, 0.018));
  }
#endif
#ifdef SET_POLX
  else {                          // STAR — cream star with a rust heart
    float r = length(q);
    PAINT(C2, fillD(r - 0.36)); PAINT(B, lineD(r - 0.4, 0.035)); PAINT(B, fillD(r - 0.09));
  }
#endif
  float sp = step(0.994, bh(floor(cl * 70.0)));   // mud splatter specks
  col = mix(col, lum(col) < 0.12 ? C0 * 0.8 : col * 0.55, sp * 0.6);
  return vec4(col, ink);
}`;

const FRAG_COMMON = `
varying vec2 vPat; varying vec2 vCl; varying float vPatId; varying float vTintId; varying float vFront; varying vec3 vRing;`;

function clothMat(THREE: any, U: any, set: 'band' | 'tile' | 'shard' | 'polar') {
  const polar = set === 'polar';
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  m.defines = polar ? { BOGO_POLAR: '', SET_BAND: '', SET_POLX: '' } : set === 'band' ? { SET_BAND: '' } : set === 'tile' ? { SET_TILE: '' } : { SET_SHARD: '' };
  // All cloth programs share one onBeforeCompile source — key them apart or three reuses the first.
  m.customProgramCacheKey = () => 'bogolan-cloth-' + set;
  m.onBeforeCompile = (sh: any) => {
    Object.assign(sh.uniforms, U);
    const vHead = polar ? `
      attribute vec4 aRing; attribute float aTint;` : `
      attribute float iPat; attribute float iTint; attribute vec4 iUV; attribute float iSize; attribute float iFlex;
      uniform float uTime, uRip, uShockR, uShockA; uniform vec2 uShockC;
      vec3 clothDisp(vec2 p){
        vec2 k = vec2(0.55, 0.35); float ph = dot(k, p) - uTime * 1.3;
        float d = uRip * sin(ph); vec2 g = uRip * cos(ph) * k;
        vec2 k2 = vec2(-0.3, 0.8); float ph2 = dot(k2, p) - uTime * 0.9;
        d += uRip * 0.6 * sin(ph2); g += uRip * 0.6 * cos(ph2) * k2;
        vec2 dv = p - uShockC; float r = length(dv) + 1e-4; float x = r - uShockR;
        float e = exp(-x * x * 1.5) * uShockA;
        d += e; g += e * (-3.0 * x) * dv / r;
        return vec3(d, g);
      }`;
    const vBody = polar ? `
      vPat = position.xy; vCl = position.xy; vPatId = aRing.w; vTintId = aTint; vFront = step(0.5, normal.z); vRing = aRing.xyz;
      vec3 G = vec3(0.0);` : `
      vPat = uv * iUV.xy + iUV.zw; vCl = vPat * iSize; vPatId = iPat; vTintId = iTint; vFront = step(0.5, normal.z); vRing = vec3(0.0);
      vec3 G = vec3(0.0);
      if (iFlex > 0.5) { vec4 ip = instanceMatrix * vec4(position, 1.0); G = clothDisp(ip.xy); }`;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>${FRAG_COMMON}${vHead}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>${vBody}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.z += G.x;`)
      .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
        if (G.x != 0.0 && vFront > 0.5) transformedNormal = normalize(normalMatrix * vec3(-G.y, -G.z, 1.0));`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>${FRAG_COMMON}\n${CLOTH_GLSL}`)
      .replace('#include <map_fragment>', `
        vec2 Q = vPat;
        #ifdef BOGO_POLAR
          if (vRing.z > 0.0) { float rr = length(vPat); Q = vec2(atan(vPat.y, vPat.x) / 6.2831853 * vRing.z, (rr - vRing.x) / max(1e-3, vRing.y - vRing.x)); }
        #endif
        gPX = max(fwidth(Q.y), 1e-4);
        vec4 CLR = cloth(vPatId, Q, vTintId, vCl);
        vec3 baseC = CLR.rgb; float inkAmt = CLR.a;
        baseC *= (0.84 + 0.3 * bf(vCl * 0.9)) * (1.0 - 0.16 * smoothstep(0.55, 0.85, bn(vCl * 2.3 + 5.0)));
        if (vFront < 0.5) baseC *= 0.42;
        diffuseColor.rgb = baseC;`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = mix(0.94, 0.74, inkAmt);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 wc = vCl * 165.0;
          float wa = smoothstep(2.4, 0.7, length(fwidth(wc)));
          float hgt = (sin(wc.x) * sin(wc.y) * 0.6 + bn(wc * vec2(0.08, 0.5)) * 0.4) * wa * 0.0028 + bn(vCl * 1.6) * 0.05 + inkAmt * 0.0035;
          vec3 pos = -vViewPosition; vec3 dpx = dFdx(pos), dpy = dFdy(pos);
          float dhx = dFdx(hgt), dhy = dFdy(hgt);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          normal = normalize(abs(det) * normal - sign(det) * (dhx * r1 + dhy * r2));
        }`);
  };
  return m;
}

function instAttrs(THREE: any, geo: any, n: number) {
  const pat = new Float32Array(n), tnt = new Float32Array(n), uvA = new Float32Array(n * 4), size = new Float32Array(n).fill(1), flex = new Float32Array(n);
  for (let i = 0; i < n; i++) { uvA[i * 4] = 1; uvA[i * 4 + 1] = 1; }
  const A = {
    pat: new THREE.InstancedBufferAttribute(pat, 1), tnt: new THREE.InstancedBufferAttribute(tnt, 1), uv: new THREE.InstancedBufferAttribute(uvA, 4),
    size: new THREE.InstancedBufferAttribute(size, 1), flex: new THREE.InstancedBufferAttribute(flex, 1),
  };
  Object.values(A).forEach((x: any) => x.setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('iPat', A.pat); geo.setAttribute('iTint', A.tnt); geo.setAttribute('iUV', A.uv); geo.setAttribute('iSize', A.size); geo.setAttribute('iFlex', A.flex);
  const dirty = () => { A.pat.needsUpdate = true; A.tnt.needsUpdate = true; A.uv.needsUpdate = true; A.size.needsUpdate = true; A.flex.needsUpdate = true; };
  return { pat, tnt, uvA, size, flex, A, dirty };
}

function ringShape(THREE: any, r0: number, r1: number, seg: number, phase = 0) {
  const pts = (r: number) => Array.from({ length: seg }, (_, i) => { const a = phase + i / seg * Math.PI * 2; return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r); });
  const s = new THREE.Shape(pts(r1));
  if (r0 > 0) s.holes.push(new THREE.Path(pts(r0)));
  return s;
}

function polarGeo(THREE: any, shape: any, depth: number, ring: number[], tnt: number) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -depth / 2);
  const n = g.attributes.position.count, r = new Float32Array(n * 4), t = new Float32Array(n).fill(tnt);
  for (let i = 0; i < n; i++) r.set(ring, i * 4);
  g.setAttribute('aRing', new THREE.BufferAttribute(r, 4)); g.setAttribute('aTint', new THREE.BufferAttribute(t, 1));
  return g;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const easeOut = (x: number) => { x = clamp01(x); return 1 - Math.pow(1 - x, 3); };
const hash = (x: number) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

export function buildBogolan(THREE: any, renderer: any): SceneInst {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#140b06');
  scene.fog = new THREE.Fog('#140b06', 24, 48);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 120);
  const owned: any[] = []; const own = <T>(x: T) => { owned.push(x); return x; };
  try { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; } catch { /* */ }

  const U = {
    uTime: { value: 0 }, uDot: { value: 0 }, uRip: { value: 0.04 },
    uShockC: { value: new THREE.Vector2() }, uShockR: { value: 99 }, uShockA: { value: 0 },
  };
  const bandMat = own(clothMat(THREE, U, 'band')), tileMat = own(clothMat(THREE, U, 'tile')), shardMat = own(clothMat(THREE, U, 'shard')), polarMat = own(clothMat(THREE, U, 'polar'));

  // ── light: warm raking key with shadows, warm fill ──
  const key = own(new THREE.DirectionalLight('#ffd6a0', 3.4));
  key.position.set(-7, 9, 12); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -15, right: 15, top: 10, bottom: -10, near: 1, far: 45 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  scene.add(key); scene.add(key.target);
  const hemi = own(new THREE.HemisphereLight('#ffe4bf', '#3a2412', 1.3)); scene.add(hemi);

  // ── back cloth (gaps between tiles read as deep joints) ──
  const back = new THREE.Mesh(own(new THREE.PlaneGeometry(70, 40)), own(new THREE.MeshStandardMaterial({ color: '#24140a', roughness: 1 })));
  back.position.z = -0.25; back.receiveShadow = true; back.renderOrder = 3; scene.add(back);

  // ── patchwork wall of cloth tiles ──
  const TC = 19, TR = 11, TS = 1.3, NT = TC * TR;
  const tileGeo = own(new THREE.BoxGeometry(TS - 0.05, TS - 0.05, 0.3));
  const tA = instAttrs(THREE, tileGeo, NT);
  const tiles = own(new THREE.InstancedMesh(tileGeo, tileMat, NT));
  tiles.castShadow = true; tiles.receiveShadow = true; tiles.frustumCulled = false; tiles.renderOrder = 2; scene.add(tiles);
  const tHomeX = new Float32Array(NT), tHomeY = new Float32Array(NT);
  for (let i = 0; i < NT; i++) { const c = i % TC, r = Math.floor(i / TC); tHomeX[i] = (c - (TC - 1) / 2) * TS; tHomeY[i] = (r - (TR - 1) / 2) * TS; tA.size[i] = TS; }
  const PATCH_L = [[P.DIAM, tint(TN, DK, 1)], [P.DOTG, tint(TN, DK)], [P.CHST, tint(TN, CR)], [P.CONC, tint(TN, DK)], [P.DIAM, tint(OC, DK, 0)]];
  const PATCH_D = [[P.HOUR, tint(DK, OC)], [P.COMB, tint(DK, CR)], [P.CROSS, tint(DK, CR)], [P.DIAM, tint(DK, TN, 1)], [P.CHST, tint(BR, CR)]];
  const tilePattern = (i: number, set: string, salt: number, out: number[]) => {
    const c = i % TC, r = Math.floor(i / TC);
    if (set === 'lattice') { out[0] = P.DIAM; out[1] = salt % 2 < 1 ? tint(CR, DK, (c + r) % 2) : tint(DK, TN, (c + r) % 2); return; }
    const list = (c + r) % 2 ? PATCH_D : PATCH_L; const k = list[Math.floor(hash(c * 7.31 + r * 3.17 + salt * 1.7) * list.length)];
    out[0] = k[0]; out[1] = k[1];
  };
  const tmpPat = [0, 0];
  for (let i = 0; i < NT; i++) { tilePattern(i, 'patch', 0, tmpPat); tA.pat[i] = tmpPat[0]; tA.tnt[i] = tmpPat[1]; }
  tA.dirty();
  const tPush = new Float32Array(NT), tPop = new Float32Array(NT), tFlip = new Float32Array(NT).fill(1), tFlipAx = new Float32Array(NT), tNextP = new Float32Array(NT), tNextT = new Float32Array(NT);
  const colLvl = new Float32Array(TC);
  let tileSet = 'patch', tileSalt = 0;

  // ── woven strips: weave (vertical) + bands (horizontal) — one instanced mesh, two ranges ──
  const NW = 12, NB = 10, NS = NW + NB, SL = 40;
  const stripGeo = own(new THREE.BoxGeometry(1, 1, 0.12, 64, 1, 1));
  const sA = instAttrs(THREE, stripGeo, NS);
  const strips = own(new THREE.InstancedMesh(stripGeo, bandMat, NS));
  strips.castShadow = true; strips.receiveShadow = true; strips.frustumCulled = false; scene.add(strips);
  const wW = [2.5, 1.7, 3.1, 2.2, 1.5, 2.8, 2.1, 3.2, 1.7, 2.7, 2.0, 2.8], wX: number[] = [];
  { let x = -14.2; for (let i = 0; i < NW; i++) { wX.push(x + wW[i] / 2); x += wW[i] - 0.12; } }
  const bH0 = [1.3, 0.9, 0.6, 1.0, 1.4, 0.6, 1.0, 1.1, 0.9, 1.3].map(h => h * 1.4), bY: number[] = [];
  { const tot = bH0.reduce((s, h) => s + h - 0.1, 0); let y = tot / 2; for (let i = 0; i < NB; i++) { bY.push(y - bH0[i] / 2); y -= bH0[i] - 0.1; } }
  const WEAVE_SETS = [
    [[P.ZIG, tint(OC, BR)], [P.DARKX, tint(BK, CR)], [P.ZIG, tint(RU, TN)], [P.ZIG, tint(BR, OC)], [P.DARKX, tint(BK, CR)], [P.ZIG, tint(OC, RU)],
      [P.CHEV, tint(BR, BK)], [P.ZIG, tint(TN, BR)], [P.DARKX, tint(DK, CR)], [P.ZIG, tint(OC, BR)], [P.ZIG, tint(RU, OC)], [P.DARKX, tint(BK, CR)]],
    [[P.TRI, tint(OC, DK)], [P.DARKX, tint(BK, CR)], [P.ZIG, tint(BR, OC)], [P.BANDX, tint(DK, CR)], [P.TRI, tint(BR, CR)], [P.ZIG, tint(OC, RU)],
      [P.DOTS, tint(DK, CR)], [P.CHEV, tint(OC, BK)], [P.DARKX, tint(BR, CR)], [P.TRI, tint(RU, CR)], [P.ZIG, tint(TN, BR)], [P.BANDX, tint(BK, CR)]],
  ];
  const BAND_SETS = [
    [[P.TRI, tint(OC, RU)], [P.BANDX, tint(BK, CR)], [P.DOTS, tint(RU, CR)], [P.BANDX, tint(BK, CR)], [P.TRI, tint(RU, CR)],
      [P.DOTS, tint(RU, CR)], [P.BANDX, tint(BK, CR)], [P.CHEV, tint(RU, BK)], [P.TRI, tint(OC, DK)], [P.SAW, tint(CR, DK)]],
    [[P.TRI, tint(CR, BR, 1)], [P.SAW, tint(CR, DK)], [P.TRI, tint(CR, RU, 1)], [P.BANDX, tint(BR, CR)], [P.TRI, tint(CR, OC, 1)],
      [P.SAW, tint(CR, BK)], [P.TRI, tint(CR, RD, 1)], [P.DOTS, tint(BR, CR)], [P.TRI, tint(CR, BR, 1)], [P.SAW, tint(CR, DK)]],
  ];
  for (let i = 0; i < NS; i++) { sA.flex[i] = 1; }
  const applyWeave = (v: number) => { const S = WEAVE_SETS[v % 2]; for (let i = 0; i < NW; i++) { sA.pat[i] = S[i][0]; sA.tnt[i] = S[i][1]; sA.size[i] = wW[i]; sA.uvA[i * 4] = SL / wW[i]; } sA.dirty(); };
  const applyBands = (v: number) => { const S = BAND_SETS[v % 2]; for (let j = 0; j < NB; j++) { const i = NW + j; sA.pat[i] = S[j][0]; sA.tnt[i] = S[j][1]; sA.size[i] = bH0[j]; sA.uvA[i * 4] = SL / bH0[j]; } sA.dirty(); };
  applyWeave(0); applyBands(0);
  const sLvl = new Float32Array(NS), sScroll = new Float32Array(NS), sStep = new Float32Array(NS), sStepT = new Float32Array(NS);

  // ── shards: rosette petals, burst rays, triangle mosaic — one instanced triangle mesh ──
  const triShape = new THREE.Shape([new THREE.Vector2(-0.5, -0.433), new THREE.Vector2(0.5, -0.433), new THREE.Vector2(0, 0.433)]);
  const triGeo = own(new THREE.ExtrudeGeometry(triShape, { depth: 0.06, bevelEnabled: false })); triGeo.translate(0, 0, -0.03);
  // interlocking wedges (alternate apex out / apex in) so each ring reads as a solid disc band, like the clip
  const ROS = [{ n: 16, rb: 0.6, len: 1.15, w: 0.95, z: 0.8 }, { n: 24, rb: 1.75, len: 1.3, w: 1.3, z: 0.66 }, { n: 32, rb: 3.05, len: 0.55, w: 1.25, z: 0.52 }];
  const NR = ROS.reduce((s, r) => s + r.n, 0), NRAY = 40;
  // mosaic: a triangular tessellation clipped to a disc
  const mos: { x: number; y: number; up: boolean; r: number; a: number; dx: number; dy: number; dz: number; ax: number; ay: number; az: number; sp: number; ph: number }[] = [];
  { const s = 1.0, h = s * 0.866;
    for (let j = -8; j <= 8; j++) for (let i = -10; i <= 10; i++) for (const up of [true, false]) {
      const px = i * s + j * s / 2, py = j * h;
      const cx = up ? px + s / 2 : px + s, cy = up ? py + h / 3 : py + 2 * h / 3;
      const r = Math.hypot(cx, cy); if (r > 4.3) continue;
      const k = mos.length;
      const a = Math.atan2(cy, cx) + (hash(k * 3.3) - 0.5) * 0.8, ax = hash(k * 1.1) - 0.5, ay = hash(k * 2.2) - 0.5, az = hash(k * 4.4) - 0.5, al = Math.hypot(ax, ay, az) || 1;
      mos.push({ x: cx, y: cy, up, r, a: Math.atan2(cy, cx), dx: Math.cos(a), dy: Math.sin(a), dz: 0.5 + hash(k * 5.5), ax: ax / al, ay: ay / al, az: az / al, sp: 3 + hash(k * 6.6) * 7, ph: hash(k * 7.7) });
    } }
  const NM = mos.length, NSH = NR + NRAY + NM;
  const hA = instAttrs(THREE, triGeo, NSH);
  const shards = own(new THREE.InstancedMesh(triGeo, shardMat, NSH));
  shards.castShadow = true; shards.receiveShadow = true; shards.frustumCulled = false; scene.add(shards);
  { let k = 0;
    ROS.forEach((R, ri) => { for (let i = 0; i < R.n; i++, k++) {
      if (ri === 0) { hA.pat[k] = i % 2 ? P.TFILL : P.PETAL; hA.tnt[k] = i % 2 ? tint(BR, CR) : tint(CR, DK); }
      else if (ri === 1) { hA.pat[k] = i % 2 ? P.PETAL : P.TFILL; hA.tnt[k] = i % 2 ? tint(CR, BK) : tint(i % 4 ? DK : RU, CR); }
      else { hA.pat[k] = i % 2 ? P.THOLL : P.TFILL; hA.tnt[k] = i % 2 ? tint(CR, CR) : tint(OC, DK); }
      hA.size[k] = R.len; } });
    const RT = [tint(CR, DK), tint(OC, DK), tint(DK, OC), tint(RU, CR)];
    for (let i = 0; i < NRAY; i++, k++) { hA.pat[k] = P.RAY; hA.tnt[k] = RT[i % 4]; hA.size[k] = 4; }
    const MT = [tint(OC, CR), tint(CR, DK), tint(DK, CR), tint(RU, CR), tint(BR, OC), tint(TN, DK)];
    for (let i = 0; i < NM; i++, k++) { const hh = hash(i * 9.7); if (hh < 0.22) { hA.pat[k] = P.THOLL; hA.tnt[k] = hash(i * 3.9) < 0.5 ? tint(CR, CR) : tint(OC, OC); } else { hA.pat[k] = P.TFILL; hA.tnt[k] = MT[Math.floor(hash(i * 5.3) * MT.length)]; } hA.size[k] = 1.0; }
    hA.dirty(); }
  const mEx = new Float32Array(NM), mImp = new Float32Array(NM);
  const rosRot = [0, 0, 0], rosFlip = new Float32Array(32).fill(1); let rosStep = 0, rosStepT = 0, rosPop = 0, rosParity = 0;
  let rayRot = 0, rayStep = 0, rayStepT = 0, rayPunch = 0;

  // ── mandala: concentric patterned rings (polar mapping), stepped in depth ──
  const RINGS: [number, number, number, number][] = [
    [0, 0.55, P.DISC, tint(RU, DK)], [0.55, 0.9, P.SAW, tint(CR, DK)], [0.9, 1.35, P.TRI, tint(RU, CR)], [1.35, 1.55, P.DOTS, tint(DK, CR)],
    [1.55, 2.1, P.BANDX, tint(CR, DK)], [2.1, 2.35, P.SPOKE, tint(DK, CR)], [2.35, 3.0, P.TRI, tint(RD, CR)], [3.0, 3.25, P.DOTS, tint(BK, CR)],
    [3.25, 3.95, P.CHEV, tint(OC, DK)], [3.95, 4.25, P.SPOKE, tint(CR, DK)], [4.25, 5.0, P.SAW, tint(CR, BR)],
  ];
  const rings = RINGS.map(([r0, r1, pat, tn], i) => {
    const w = r1 - r0, per = PERIOD[pat] ?? 1, rm = (r0 + r1) / 2;
    const N = pat === P.DISC ? 1 : Math.max(per, Math.round(2 * Math.PI * rm / w / per) * per);
    const m = new THREE.Mesh(own(polarGeo(THREE, ringShape(THREE, r0, r1, i < 3 ? 96 : 180), 0.12, [r0, r1, N, pat], tn)), polarMat);
    m.castShadow = true; m.receiveShadow = true; m.visible = false; scene.add(m);
    return { m, r: rm, N, rot: 0, step: 0, stepT: 0, z: 0, lvl: 0 };
  });
  // centre star
  const starPts = Array.from({ length: 24 }, (_, i) => { const a = i / 24 * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.58 : 1; return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r); });
  const star = new THREE.Mesh(own(polarGeo(THREE, new THREE.Shape(starPts), 0.1, [0, 1, -1, P.STAR], tint(CR, DK))), polarMat);
  star.castShadow = true; star.receiveShadow = true; star.visible = false; scene.add(star);
  let starRot = 0, starRotT = 0, starS = 0;

  // ── diamond: nested diamond frames + chevron arrows ──
  const DFR: [number, number, number][] = [[0, 0.5, RU], [0.5, 0.95, CR], [0.95, 1.45, DK], [1.45, 1.9, CR], [1.9, 2.4, DK], [2.4, 2.9, RU], [2.9, 3.35, DK], [3.35, 3.85, CR], [3.85, 4.45, DK]];
  const frames = DFR.map(([r0, r1, c]) => {
    const m = new THREE.Mesh(own(polarGeo(THREE, ringShape(THREE, r0, r1, 4), 0.14, [r0, r1, 1, P.SOLID], tint(c, c))), polarMat);
    m.castShadow = true; m.receiveShadow = true; m.visible = false; scene.add(m);
    return { m, r: (r0 + r1) / 2, z: 0, lvl: 0, tw: 0 };
  });
  const chevShape = new THREE.Shape([[0, 1], [1, 0], [0, -1], [0, -0.86], [0.86, 0], [0, 0.86]].map(([x, y]) => new THREE.Vector2(x, y)));
  const chevGeo = own(new THREE.ExtrudeGeometry(chevShape, { depth: 0.14, bevelEnabled: false })); chevGeo.translate(0, 0, -0.07);
  const NCH = 10;
  const cA = instAttrs(THREE, chevGeo, NCH);
  const chevs = own(new THREE.InstancedMesh(chevGeo, shardMat, NCH));
  chevs.castShadow = true; chevs.receiveShadow = true; chevs.frustumCulled = false; scene.add(chevs);
  { const CC = [CR, RU, DK, CR, OC]; for (let i = 0; i < NCH; i++) { cA.pat[i] = P.SOLID; const c = CC[Math.floor(i / 2) % CC.length]; cA.tnt[i] = tint(c, c); cA.size[i] = 3.3; } cA.dirty(); }
  let chevPh = 0, chevPhT = 0;

  // ── state ──
  const m4 = new THREE.Matrix4(), v3 = new THREE.Vector3(), sc3 = new THREE.Vector3(), q = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), ax3 = new THREE.Vector3();
  const zAx = new THREE.Vector3(0, 0, 1), xAx = new THREE.Vector3(1, 0, 0), yAx = new THREE.Vector3(0, 1, 0);
  const src = new Float32Array(6);
  const bandAt = (u: number) => { const x = clamp01(u) * 5, j = Math.min(4, Math.floor(x)), f = x - j; return src[j] * (1 - f) + src[j + 1] * f; };
  const MODES = ['weave', 'rosette', 'bands', 'mandala', 'weave', 'diamond', 'shatter', 'bands', 'mandala', 'burst'];
  const VARIANT = [0, 0, 0, 0, 1, 0, 0, 1, 1, 0];
  const HELD = ['weave', 'rosette', 'bands', 'mandala', 'diamond', 'shatter', 'burst'];
  const asm: Record<string, number> = { weave: 0, rosette: 0, bands: 0, mandala: 0, diamond: 0, shatter: 0, burst: 0 };
  let last = -1, clock = 0, section = -1, mode = '', modeVar = -1, modeT = 0, prevKick = 0, prevSnare = 0, eF = 0, eS = 0, lastDrop = -99, dropSec = -99;
  let weaveTilt = 0, mRot = 0;
  let flash = 0, waveX = 0, waveY = 0, waveR = 99, ringWave = 99, ringWaveA = 0, shockA = 0, wStream = 0, beatN = 0;

  const enterMode = (m: string, v: number) => {
    const same = m === mode;
    mode = m; modeVar = v; modeT = 0;
    if (m === 'weave') { applyWeave(v); if (same) asm.weave = 0; }
    if (m === 'bands') { applyBands(v); if (same) asm.bands = 0; }
    const want = m === 'rosette' ? 'lattice' : (m === 'weave' || m === 'bands') ? tileSet : 'patch';
    if (want !== tileSet || (same && m !== 'weave' && m !== 'bands')) {
      tileSet = want; tileSalt++;
      for (let i = 0; i < NT; i++) {
        tilePattern(i, tileSet, tileSalt, tmpPat); tNextP[i] = tmpPat[0]; tNextT[i] = tmpPat[1];
        tFlip[i] = -Math.hypot(tHomeX[i], tHomeY[i] * 1.4) * 0.05 - hash(i * 3.7) * 0.15; tFlipAx[i] = (i + tileSalt) % 2;
      }
    }
  };

  return {
    scene, camera,
    cam: { target: [0, 0, 0.6], radius: 11, pitch: 3, yaw: 0, fov: 40 },
    exposure: 1.2, brightThreshold: 1.3, grain: 0.02,
    update(t: number, a: FluxDriven, spec: FluxSpec) {
      const fresh = last < 0 || t < last || t - last > 2;
      const dt = fresh ? 1 / 60 : Math.min(0.2, Math.max(0, t - last)); last = t;
      const kick = a.kick ?? 0, snare = a.snare ?? 0, bass = a.bass ?? 0, mid = a.mid ?? 0, tre = a.tre ?? 0, voice = a.voice ?? 0;
      const energy = Math.min(1, a.intensity ?? a.energy ?? 0);
      if (fresh) {
        clock = 0; section = -1; eF = eS = energy; lastDrop = -99; dropSec = -99; flash = 0; mode = ''; modeVar = -1; wStream = 0; beatN = 0;
        for (const k in asm) asm[k] = 0;
        mEx.fill(0); mImp.fill(0); tFlip.fill(1);
      }
      clock += dt * (0.8 + energy * 0.6);
      const beats = (a.tempoConfidence ?? 0) > 0.3 && Number.isFinite(a.beatPosition) ? (a.beatPosition as number) : clock * 2;
      const k1 = (tau: number) => 1 - Math.exp(-dt / tau);
      eF += (energy - eF) * k1(0.35); eS += (energy - eS) * k1(8);
      const build = Math.min(1, Math.max(0, (eF - eS) * 4));
      const drop = eF - eS > 0.25 && beats - lastDrop > 16 && beats > 8;
      const kickHit = kick > 0.55 && prevKick <= 0.55; prevKick = kick;
      const snareHit = snare > 0.45 && prevSnare <= 0.45; prevSnare = snare;
      if (kickHit) beatN++;

      // ── moment selection ──
      const sec = Math.floor(beats / 16);
      const held = typeof spec.decoSeed === 'number' && spec.decoSeed >= 0 ? HELD[Math.floor(spec.decoSeed) % HELD.length] : null;
      if (drop) { lastDrop = beats; flash = 1; if (!held) dropSec = sec; }
      let want: string, v: number;
      if (held) { want = held; v = Math.max(0, sec) % 2; }
      else { const idx = Math.max(0, sec) % MODES.length; want = dropSec === sec ? 'burst' : MODES[idx]; v = VARIANT[idx]; }
      if (want !== mode || v !== modeVar) enterMode(want, v);
      section = sec; modeT += dt;
      for (const k in asm) { const tg = mode === k ? 1 : 0; asm[k] = tg > asm[k] ? Math.min(1, asm[k] + dt / 1.5) : Math.max(0, asm[k] - dt / 0.9); }
      const stag = (A: number, d: number, S = 0.8) => clamp01(A * (1 + S) - d * S);

      // ── spectrum ──
      src[0] = Math.min(1.3, bass * 1.1 + kick * 0.8); src[1] = bass; src[2] = (mid + voice) * 0.75; src[3] = mid; src[4] = Math.min(1.3, tre * 1.2 + snare * 0.9); src[5] = tre * 1.1;
      flash *= Math.exp(-dt / 0.6);
      U.uTime.value = t; U.uDot.value += (tre - U.uDot.value) * k1(0.05);
      U.uRip.value += ((0.035 + voice * 0.16 + build * 0.1) - U.uRip.value) * k1(0.3);
      if (kickHit) { U.uShockC.value.set((hash(t) - 0.5) * 6, (hash(t * 1.9) - 0.5) * 3); U.uShockR.value = 0; shockA = 0.25 + kick * 0.35; }
      U.uShockR.value += dt * 9; shockA *= Math.exp(-dt / 0.5); U.uShockA.value = shockA;

      // ── tile wall: spectrum EQ per column (centre = lows), kick wave, flips ──
      if (kickHit) { waveX = (hash(t * 2.3) - 0.5) * 14; waveY = (hash(t * 3.1) - 0.5) * 6; waveR = 0; for (let k = 0; k < 5; k++) tPop[Math.floor(hash(t * (k + 2.3)) * NT)] = 1; }
      waveR += dt * 10;
      const startFlip = (i: number) => { if (tFlip[i] < 1) return; tilePattern(i, tileSet, tileSalt + 1 + Math.floor(hash(i + t) * 7), tmpPat); tNextP[i] = tmpPat[0]; tNextT[i] = tileSet === 'lattice' ? tA.tnt[i] : tmpPat[1]; tFlip[i] = 0; tFlipAx[i] = hash(i * 1.3 + t) < 0.5 ? 0 : 1; };
      if (snareHit) { const row = Math.floor(hash(t * 9.3) * TR); for (let c = 0; c < TC; c += 1 + Math.floor(hash(t + c) * 3)) startFlip(row * TC + c); }
      if (hash(t * 13.7) < dt * (0.5 + voice * 4)) startFlip(Math.floor(hash(t * 17.3) * NT));
      for (let c = 0; c < TC; c++) {
        const u = Math.abs(c - (TC - 1) / 2) / ((TC - 1) / 2);
        const val = bandAt(u) * (0.85 + 0.3 * hash(c * 3.7 + Math.floor(beats)));
        colLvl[c] += (val - colLvl[c]) * k1(val > colLvl[c] ? 0.03 : 0.18);
      }
      let tAttr = false;
      const fg = Math.max(asm.rosette, asm.mandala, asm.diamond, asm.shatter);
      for (let i = 0; i < NT; i++) {
        const c = i % TC, r = Math.floor(i / TC), hx = tHomeX[i], hy = tHomeY[i];
        const L = colLvl[c] * (0.7 + build * 0.6), reach = L * (TR / 2 + 0.5), rd = Math.abs(r - (TR - 1) / 2);
        const eq = rd < reach ? 0.42 * L * (1 - rd / (reach + 1) * 0.5) : 0.05 * L;
        const d = Math.hypot(hx - waveX, hy - waveY), wave = Math.exp(-Math.pow((d - waveR) * 1.3, 2)) * (0.3 + kick * 0.5);
        tPop[i] *= Math.exp(-dt / 0.5);
        const tgt = eq + wave * 0.45 + tPop[i] * 0.5 + Math.sin(t * 0.7 + hx * 0.4 + hy * 0.3) * 0.03;
        tPush[i] += (tgt - tPush[i]) * k1(tgt > tPush[i] ? 0.04 : 0.14);
        const calm = 1 - 0.85 * fg * clamp01((6 - Math.hypot(hx, hy * 1.2)) / 2);
        let z = tPush[i] * calm;
        if (tFlip[i] < 1) {
          const pv = tFlip[i]; tFlip[i] = Math.min(1, tFlip[i] + dt / 0.55);
          if (pv < 0.5 && tFlip[i] >= 0.5) { tA.pat[i] = tNextP[i]; tA.tnt[i] = tNextT[i]; tAttr = true; }
          const f = clamp01(tFlip[i]), e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
          q.setFromAxisAngle(tFlipAx[i] ? yAx : xAx, e * Math.PI * 2); z += Math.sin(Math.PI * f) * 0.6 * calm;
        } else q.identity();
        m4.compose(v3.set(hx, hy, z), q, sc3.set(1, 1, 1)); tiles.setMatrixAt(i, m4);
      }
      tiles.visible = !(asm.weave >= 1 || asm.bands >= 1);   // fully covered by the woven strips
      tiles.instanceMatrix.needsUpdate = true; if (tAttr) { tA.A.pat.needsUpdate = true; tA.A.tnt.needsUpdate = true; }

      // ── strips ──
      if (mode === 'weave') weaveTilt = modeVar === 1 ? 0.62 : 0;
      const tilt = weaveTilt;
      const sinT = Math.sin(tilt), cosT = Math.cos(tilt);
      for (let i = 0; i < NS; i++) {
        const isW = i < NW, j = isW ? i : i - NW;
        const u = isW ? j / (NW - 1) : Math.abs(bY[j]) / 7.5;
        const val = bandAt(u);
        sLvl[i] += (val - sLvl[i]) * k1(val > sLvl[i] ? 0.04 : 0.2);
        const dir = j % 2 ? 1 : -1;
        // discrete steps: kicks jump the low strips, snares the high ones (weave); snares shift all bands
        if (isW && kickHit && u < 0.55) sStepT[i] += dir * 0.5;
        if (isW && snareHit && u >= 0.45) sStepT[i] += dir * 0.5;
        if (!isW && snareHit) sStepT[i] += dir * (sA.pat[i] === P.BANDX ? 0.8 : 0.55);
        if (!isW && kickHit && u < 0.3) sStepT[i] += dir * 0.55;
        const ps = sStep[i]; sStep[i] += (sStepT[i] - sStep[i]) * k1(0.07);
        sScroll[i] += dir * dt * (0.12 + sLvl[i] * 0.9 + energy * 0.15) + (sStep[i] - ps);
        sA.uvA[i * 4 + 2] = sScroll[i];
        const A = isW ? asm.weave : asm.bands, p = easeOut(stag(A, isW ? (j % 2 ? j / NW : (NW - j) / NW) : j / NB, 1.2));
        if (p <= 0.001) { m4.makeScale(0, 0, 0); strips.setMatrixAt(i, m4); continue; }
        const slide = (1 - p) * 42 * (j % 2 ? 1 : -1);
        const zb = 0.45 + (j % 3) * 0.14 + sLvl[i] * 0.7 + build * (j % 3) * 0.35;
        if (isW) {
          const x = wX[j], y = slide;
          v3.set(x * cosT - y * sinT, x * sinT + y * cosT, zb);
          q.setFromAxisAngle(zAx, Math.PI / 2 + tilt);
          m4.compose(v3, q, sc3.set(SL, wW[j], 1));
        } else {
          v3.set(slide, bY[j], 0.45 + (j % 2) * 0.12 + sLvl[i] * 0.5 + build * (j % 2) * 0.3);
          m4.compose(v3, q.identity(), sc3.set(SL, bH0[j], 1));
        }
        strips.setMatrixAt(i, m4);
      }
      strips.instanceMatrix.needsUpdate = true; sA.A.uv.needsUpdate = true;

      // ── shards ──
      let k = 0;
      // rosette
      const aR = asm.rosette;
      rosRot[0] += dt * (0.08 + src[0] * 0.7) * 1; rosRot[1] -= dt * (0.05 + src[2] * 0.45); rosRot[2] += dt * (0.04 + src[4] * 0.3);
      if (kickHit && mode === 'rosette') { rosPop = 1; rosParity ^= 1; rosStepT += Math.PI * 2 / 24; }
      if (snareHit && mode === 'rosette') for (let i = 0; i < 32; i += 2) rosFlip[(i + (beatN % 2)) % 32] = 0;
      rosPop *= Math.exp(-dt / 0.25); rosStep += (rosStepT - rosStep) * k1(0.08);
      const open = 0.03 + voice * 0.3 + build * 0.15;
      for (let ri = 0; ri < 3; ri++) {
        const R = ROS[ri];
        for (let i = 0; i < R.n; i++, k++) {
          const p = ease(stag(aR, ri * 0.3 + i / R.n * 0.25, 1.4));
          if (p <= 0.001) { m4.makeScale(0, 0, 0); shards.setMatrixAt(k, m4); continue; }
          const th = i / R.n * Math.PI * 2 + rosRot[ri] + (ri === 1 ? rosStep : 0) + (1 - p) * 2.6;
          const L = R.len * (ri === 0 ? 1 + rosPop * 0.25 * (i % 2 === rosParity ? 1 : 0) : 1), W = R.w;
          const inward = i % 2 === 1;
          const rp = R.rb + 0.5 * L + (inward ? -0.0 : 0) + (1 - p) * 10;
          let z = R.z + (1 - p) * 3 + (ri === 0 && i % 2 === rosParity ? rosPop * 0.5 : 0);
          let flipA = (1 - p) * Math.PI * 2;
          if (ri === 2) { if (rosFlip[i] < 1) rosFlip[i] = Math.min(1, rosFlip[i] + dt / 0.35); flipA += ease(rosFlip[i]) * Math.PI; }
          const dx = Math.cos(th), dy = Math.sin(th);
          qa.setFromAxisAngle(zAx, th - Math.PI / 2 + (inward ? Math.PI : 0));
          qb.setFromAxisAngle(ax3.set(dx, dy, 0), flipA); qa.premultiply(qb);
          const op = open * (ri === 0 ? 1 : ri === 1 ? 0.7 : 0.4);
          qb.setFromAxisAngle(ax3.set(-dy, dx, 0), -op); qa.premultiply(qb);
          const lift = Math.sin(op) * 0.433 * L;
          m4.compose(v3.set(dx * rp, dy * rp, z + lift), qa, sc3.set(W * (0.4 + 0.6 * p), L * (0.4 + 0.6 * p), 1));
          shards.setMatrixAt(k, m4);
        }
      }
      // burst rays: a radial EQ leaning toward camera
      const aB = asm.burst;
      if (mode === 'burst') { if (kickHit) rayPunch = 1; if (snareHit) rayStepT += Math.PI * 2 / NRAY; }
      rayPunch *= Math.exp(-dt / 0.3); rayStep += (rayStepT - rayStep) * k1(0.07);
      rayRot += dt * (0.06 + bass * 0.5 + flash * 1.5);
      for (let i = 0; i < NRAY; i++, k++) {
        const p = easeOut(stag(aB, i / NRAY, 1.0));
        if (p <= 0.001) { m4.makeScale(0, 0, 0); shards.setMatrixAt(k, m4); continue; }
        const th = i / NRAY * Math.PI * 2 + rayRot + rayStep;
        const u = Math.abs(((i % 20) / 19) * 2 - 1);
        const L = (5.5 + bandAt(u) * 5 + rayPunch * (u < 0.4 ? 2 : 0.5)) * p;
        const W = 2 * L * Math.tan(Math.PI / NRAY) * 1.15;
        const tl = 0.18 + rayPunch * 0.22 + build * 0.15 + flash * 0.3;
        const dx = Math.cos(th), dy = Math.sin(th);
        qa.setFromAxisAngle(zAx, th + Math.PI / 2);
        qb.setFromAxisAngle(ax3.set(-dy, dx, 0), -tl); qa.premultiply(qb);
        const o = 0.433 * L, cz = Math.cos(tl), sz = Math.sin(tl);
        m4.compose(v3.set(dx * o * cz, dy * o * cz, 0.42 + i % 2 * 0.04 + o * sz), qa, sc3.set(W, L, 1));
        shards.setMatrixAt(k, m4);
      }
      // triangle mosaic: assembles, shatters on kicks/snares, streams outward in the burst
      const aS = asm.shatter;
      wStream += ((mode === 'burst' ? 1 : 0) - wStream) * k1(0.5);
      if (mode === 'shatter' || mode === 'burst') {
        if (kickHit && (beatN % 2 === 0 || mode === 'burst')) { const R0 = hash(t * 5.1) * 3.0, all = (beatN % 8 === 0) || flash > 0.5; for (let i = 0; i < NM; i++) if (all || (mos[i].r > R0 && mos[i].r < R0 + 1.6)) mImp[i] = 1; }
        if (snareHit) { const a0 = hash(t * 7.7) * Math.PI * 2; for (let i = 0; i < NM; i++) { const da = Math.abs(((mos[i].a - a0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (da < 0.6) mImp[i] = 1; } }
      }
      mRot += dt * (0.05 + voice * 0.4);
      const cr = Math.cos(mRot), sr = Math.sin(mRot);
      const relax = 0.2 + (1 - voice) * 0.15;
      for (let i = 0; i < NM; i++, k++) {
        const M = mos[i];
        const pres = ease(stag(aS, M.r / 4.3, 1.0));
        const vis = Math.max(pres, wStream);
        if (vis <= 0.001) { m4.makeScale(0, 0, 0); shards.setMatrixAt(k, m4); mEx[i] = 0; continue; }
        mImp[i] *= Math.exp(-dt / 0.18);
        mEx[i] += (mImp[i] - mEx[i]) * k1(mImp[i] > mEx[i] ? 0.05 : relax);
        const ex = Math.max(mEx[i], 1 - pres), e = ease(ex);
        const hx = M.x * cr - M.y * sr, hy = M.x * sr + M.y * cr, rot0 = mRot + (M.up ? 0 : Math.PI);
        const fl = e * (2 + M.sp * 0.5);
        let px = hx + M.dx * fl, py = hy + M.dy * fl, pz = 0.55 + e * M.dz * 6, ang = e * M.sp;
        if (wStream > 0.001) {
          const ph = (M.ph + t * (0.18 + energy * 0.3 + bass * 0.3)) % 1, rr = 0.5 + ph * 13;
          const sx = M.dx * rr, sy = M.dy * rr, sz = 0.6 + ph * ph * 7;
          px += (sx - px) * wStream; py += (sy - py) * wStream; pz += (sz - pz) * wStream; ang += (t * M.sp * 0.3 - ang) * wStream;
        }
        qa.setFromAxisAngle(zAx, rot0); qb.setFromAxisAngle(ax3.set(M.ax, M.ay, M.az), ang); qa.premultiply(qb);
        const s = 1.0 * (0.97 - 0.08 * e) * vis;
        const oy = 0.144 * s;   // bbox centre sits above the centroid in the triangle's own frame
        m4.compose(v3.set(px - Math.sin(rot0) * oy, py + Math.cos(rot0) * oy, pz), qa, sc3.set(s, s, 1));
        shards.setMatrixAt(k, m4);
      }
      shards.instanceMatrix.needsUpdate = true;

      // ── mandala rings + rosette disc ──
      const aM = asm.mandala;
      if (kickHit && (mode === 'mandala' || mode === 'rosette')) { ringWave = 0; ringWaveA = 0.3 + kick * 0.4; }
      ringWave += dt * 8; ringWaveA *= Math.exp(-dt / 0.6);
      if (snareHit && mode === 'mandala') rings.forEach((R, i) => { if (i % 2 === beatN % 2 && i > 0) R.stepT += (i % 4 < 2 ? 1 : -1) * Math.PI * 2 / R.N * (R.N > 6 ? 1 : 0); });
      const zig = 0.03 + bass * 0.1 + build * 0.06;
      rings.forEach((R, i) => {
        const pm = ease(stag(aM, i / rings.length, 1.0));
        const pr = i === 0 ? ease(asm.rosette) : 0;
        const p = Math.max(pm, pr);
        R.m.visible = p > 0.001; if (!R.m.visible) return;
        const val = bandAt(i / (rings.length - 1));
        R.lvl += (val - R.lvl) * k1(0.08);
        const dir = i % 2 ? -1 : 1;
        R.rot += dir * dt * (0.04 + R.lvl * 0.7 + voice * 0.12);
        R.step += (R.stepT - R.step) * k1(0.09);
        const bump = Math.exp(-Math.pow((R.r - ringWave) * 1.6, 2)) * ringWaveA;
        const zt = 0.3 + (rings.length - i) * zig + bump + R.lvl * 0.12;
        R.z += (zt - R.z) * k1(0.05);
        R.m.position.set(0, 0, pm >= pr ? R.z - (1 - pm) * 1.5 : 0.62);
        R.m.rotation.z = R.rot + R.step + (1 - pm) * dir * 1.5;
        R.m.scale.setScalar(pm >= pr ? 0.5 + 0.5 * pm : 1.15 * pr);
      });
      // star: mandala heart, small in the diamond, big spinning before the shatter
      if (kickHit && (mode === 'mandala' || mode === 'diamond' || mode === 'shatter')) starRotT += (beatN % 2 ? 1 : -1) * Math.PI / 6;
      starRot += (starRotT - starRot) * k1(0.08);
      let avgEx = 0; for (let i = 0; i < NM; i += 7) avgEx += mEx[i]; avgEx /= Math.ceil(NM / 7);
      const sT = mode === 'mandala' ? 0.5 + kick * 0.12 : mode === 'diamond' ? 0.34 + kick * 0.08 : mode === 'shatter' ? (0.95 + kick * 0.15) * clamp01(1 - avgEx * 2.5) : 0;
      starS += (sT - starS) * k1(0.12);
      star.visible = starS > 0.01;
      star.scale.set(starS * (1 + voice * 0.15), starS * (1 + voice * 0.15), 1);
      star.rotation.z = starRot + t * (0.1 + voice * 0.5) * (mode === 'shatter' ? 4 : 1);
      star.position.set(0, 0, mode === 'mandala' ? rings[0].z + 0.14 : mode === 'diamond' ? (frames[0].z + 0.15) : 1.4);

      // ── diamond frames (EQ, centre = lows) + streaming chevrons ──
      const aD = asm.diamond;
      if (kickHit && mode === 'diamond') { ringWave = 0; ringWaveA = 0.35 + kick * 0.4; chevPhT += 1; }
      if (snareHit && mode === 'diamond') frames.forEach((F, i) => { F.tw += (i % 2 ? 1 : -1) * 0.1; });
      frames.forEach((F, i) => {
        const p = ease(stag(aD, i / frames.length, 1.0));
        F.m.visible = p > 0.001; if (!F.m.visible) return;
        const val = bandAt(i / (frames.length - 1));
        F.lvl += (val - F.lvl) * k1(val > F.lvl ? 0.04 : 0.15);
        const bump = Math.exp(-Math.pow((F.r - ringWave) * 1.6, 2)) * ringWaveA;
        const zt = 0.3 + (frames.length - i) * 0.03 + F.lvl * 0.32 + bump * 0.7;
        F.z += (zt - F.z) * k1(0.04);
        F.tw *= Math.exp(-dt / 0.35);
        F.m.position.set(0, 0, F.z - (1 - p) * 2);
        F.m.rotation.z = Math.sin(t * 0.3) * 0.04 + F.tw + (1 - p) * (i % 2 ? 1 : -1) * 0.8;
        F.m.scale.setScalar(0.3 + 0.7 * p);
      });
      chevPh += (chevPhT - chevPh) * k1(0.12); chevPh += dt * (0.05 + mid * 0.3);
      for (let i = 0; i < NCH; i++) {
        const side = i % 2 ? 1 : -1, slot = Math.floor(i / 2);
        const f = ((slot + chevPh) % 5 + 5) % 5;
        const p = ease(stag(aD, 0.4 + slot * 0.1, 1.0));
        if (p <= 0.001) { m4.makeScale(0, 0, 0); chevs.setMatrixAt(i, m4); continue; }
        const x = side * (4.0 + f * 0.95 + (1 - p) * 8), s = 2.3 * Math.min(1, f * 1.5 + 0.2) * (1 + bandAt(0.2 + slot * 0.15) * 0.08);
        q.setFromAxisAngle(zAx, side > 0 ? 0 : Math.PI);
        m4.compose(v3.set(x, 0, 0.45 + (slot % 2) * 0.12 + bandAt(slot / 5) * 0.4), q, sc3.set(s, s, 1));
        chevs.setMatrixAt(i, m4);
      }
      chevs.instanceMatrix.needsUpdate = true;

      // ── light ──
      key.position.set(-7 + Math.sin(t * 0.09) * 2.5, 9 + Math.cos(t * 0.07) * 1.5, 12);
      key.intensity = 3.2 + bass * 0.6 + flash * 2.2 + kick * 0.2;
      hemi.intensity = 1.25 + voice * 0.15 + flash * 0.5;
    },
    bloom: (a: FluxDriven) => 0.1 + Math.min(1, a.intensity ?? 0) * 0.08 + (a.kick ?? 0) * 0.08,
    dispose() { owned.forEach(o => o?.dispose?.()); },
  };
}
