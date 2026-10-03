import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { SceneInst } from '../flux';
import type { FluxDriven, FluxSpec } from '../../../../../services/fabula/fluxNode';
import { FluidSim } from './fluidSim';
import { InkCalligraphy } from './inkCalligraphy';

/**
 * Japanese Ink — rebuilt from the "Japanese_ink_patterns_shifting_r…" clip (+ the Edo-pattern still).
 *
 * A sheet of washi (procedural pulp clouds, long white + tan kozo fibres as albedo AND relief) lies
 * under a low raking light with a slight curl, cockling where it is wet. All liquid ink is a real
 * GPU stable-fluids simulation (FluidSim, RGBA dye: R = indigo, G = wetness, B = sumi black) that is
 * "absorbed" into a persistent memo layer every frame (R = asanoha reveal, G = indigo held in the
 * fibres, B = sumi bleed, A = pale dried stain), so ink pools, dries in place, and leaves tide-lines
 * (edge darkening = density minus its local blur). Ink is Beer–Lambert absorbed into the paper colour,
 * granulated and fibre-modulated; wet ink is raised + glossy. Seigaiha / asanoha / uzumaki and the
 * dry-brush sumi strokes are analytic SDFs drawn ON the paper, revealed by brush tip, ink or beat.
 *
 * The clip's moments in order (one per 16 beats):
 *  0 brush  — a loaded sumi brush (3D brush on the paper) WRITES: real kanji in stroke order and sumi-e
 *             (ensō, bamboo, mountain washes), finished with a vermilion hanko seal (inkCalligraphy.ts).
 *  1 bleed  — indigo floods down from the top edge in scalloped blooms, revealing the asanoha lattice
 *             cell by cell inside the ink; then it recedes to pale stains while seigaiha rows rise.
 *  2 drop   — a 3D ink drop falls onto clean paper: crown droplets, radial spray lines, a glossy pool;
 *             every kick adds a concentric ink ring with bleeding blobs; a new drop every few bars.
 *  3 waves  — seigaiha fields in black/indigo rise row by row; uzumaki spirals pop on kicks;
 *             asanoha with dried indigo blots up top.
 *  4 water  — ink-in-water: indigo plumes stream through water (volumetric planes over refracting
 *             paper with asanoha), then settle back into the opening composition.
 *
 * Music: kicks = ink drops landing (ripple rings in the wet ink/water surface, blooms, rings, rows);
 * snares = sharp sumi brush flicks; voice = brush pressure + flow (stroke width, wet halo, plume
 * rate); bass = fluid swirl strength + paper breathing; builds = more ink; drop = the ink-drop moment.
 * spec.decoSeed >= 0 holds a moment: 0 brush · 1 bleed · 2 drop · 3 waves · 4 water.
 */

const ASP = 16 / 9;
const FH = 9.6, FW = FH * ASP;          // world size of the base frame (cam radius 12.5, fov 42)
const PS = 1.4;                          // paper = PS × frame, so director moves never see its edge
const PW = FW * PS, PH = FH * PS;
const MEMO_W = 1024, MEMO_H = 576;

const NOISE = `
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
`;

const PAPER_VERT = `
uniform sampler2D uDye; uniform float uTime, uBreath, uCockle;
varying vec2 vUv; varying vec3 vWorld; varying vec3 vN;
float wetAt(vec2 uv){ vec2 F = (uv - 0.5) * ${PS.toFixed(3)} + 0.5; vec2 D = (F + 0.1) / 1.2;
  if (D.x < 0.0 || D.x > 1.0 || D.y < 0.0 || D.y > 1.0) return 0.0; return clamp(texture2D(uDye, D).g, 0.0, 1.4); }
float disp(vec2 uv){
  float z = 0.16 * sin(uv.x * 2.7 + 0.5) * sin(uv.y * 2.2 + 1.1);
  z += 0.9 * pow(max(0.0, uv.x + uv.y - 1.55) / 0.45, 2.0);
  z += 0.6 * pow(max(0.0, 0.4 - uv.x - uv.y) / 0.4, 2.0);
  z += uBreath * sin(uv.x * 5.0 - uTime * 1.3) * sin(uv.y * 3.0 + uTime * 0.7);
  z += uCockle * wetAt(uv);
  return z;
}
void main(){
  vUv = uv; vec3 p = position; p.z += disp(uv);
  float e = 0.004;
  float dx = (disp(uv + vec2(e, 0.0)) - disp(uv - vec2(e, 0.0))) / (2.0 * e * ${PW.toFixed(3)});
  float dy = (disp(uv + vec2(0.0, e)) - disp(uv - vec2(0.0, e))) / (2.0 * e * ${PH.toFixed(3)});
  vN = normalize(vec3(-dx, -dy, 1.0));
  vec4 w = modelMatrix * vec4(p, 1.0); vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const PAPER_FRAG = `
uniform sampler2D uAlb, uHgt, uDye, uMemo, uVel, uPress, uCal;
uniform float uTime, uKey, uAmb, uRefr, uWater, uIndW, uSumiW, uWetGloss, uRelief;
uniform vec3 uL;
uniform vec4 uSA, uSA2, uSB, uSB2; uniform vec2 uSAl;
uniform vec4 uFl[6]; uniform vec4 uFl2[6];
uniform vec4 uBand, uBandC, uField, uAsa;
uniform vec4 uDrop[2]; uniform float uRingR[16]; uniform float uRingA[16];
uniform vec4 uSp[6]; uniform vec4 uSp2[6];
uniform vec4 uRip[5];
uniform vec4 uShadow;
varying vec2 vUv; varying vec3 vWorld; varying vec3 vN;
${NOISE}
const float PI = 3.14159265;
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }

// Dry-brush sumi stroke along y = y0 + amp*sin(freq*x + ph), x in [xs, xe]; tip = drawn fraction.
float strokeInk(vec2 P, vec4 a, vec4 b, float row){
  float len = b.y - b.x;
  float s = (P.x - b.x) / len;
  if (b.w <= 0.0 || s < -0.12 || s > b.w + 0.02) return 0.0;
  float hx = b.x + b.z * 0.85;
  vec2 h0 = vec2(hx, a.x + a.y * sin(a.z * hx + a.w));
  float dh = length((P - h0) * vec2(0.85, 1.0)) / (b.z * 1.12);
  float head = 1.0 - smoothstep(0.82, 1.0, dh + 0.14 * vn(P * 55.0) + 0.06 * vn(P * 160.0));
  if (s < 0.0) return head * 1.25;
  float fy = a.x + a.y * sin(a.z * P.x + a.w);
  float sl = a.y * a.z * cos(a.z * P.x + a.w);
  float v = (P.y - fy) / sqrt(1.0 + sl * sl);
  float sc = clamp(s, 0.0, 1.0);
  float pr = texture2D(uPress, vec2(sc, row)).r;
  float w = b.z * (0.5 + 0.65 * pr) * (1.0 - 0.3 * sc);
  float vnrm = v / w;
  float edge = 1.0 - 0.2 * vn(vec2(s * 32.0, sign(v) * 7.0)) - 0.12 * vn(vec2(s * 130.0, sign(v) * 3.0));
  float body = 1.0 - smoothstep(edge - 0.07, edge, abs(vnrm));
  float dry = 0.02 + smoothstep(0.12, 1.0, sc) * 0.72 + (1.0 - pr) * 0.16;
  float br = vn(vec2(vnrm * 9.0, s * 0.9 + vnrm * 0.4)) * 0.55 + vn(vec2(vnrm * 31.0 + 4.0, s * 2.2)) * 0.45;
  float bristle = smoothstep(dry - 0.16, dry + 0.06, br + 0.24 * (1.0 - vnrm * vnrm));
  float front = smoothstep(b.w + 0.004, b.w - 0.012, s);
  float tail = 1.0 - smoothstep(0.9, 1.0, s) * (1.0 - step(0.72, br));
  float ink = body * bristle * front * tail * (1.15 - 0.35 * sc);
  return max(ink, head);
}

// Short tapered flick (snare).
float flickInk(vec2 P, vec4 f, vec4 g){
  vec2 q = P - f.xy; float c = cos(f.z), s = sin(f.z);
  q = vec2(c * q.x + s * q.y, -s * q.x + c * q.y);
  float u = q.x / f.w;
  if (u < -0.06 || u > g.z) return 0.0;
  float yc = g.x * f.w * (u * u - u);
  float w = g.y * pow(max(1.0 - u, 0.0), 0.75) * smoothstep(-0.06, 0.06, u);
  float vv = (q.y - yc) / max(w, 1e-4);
  float body = 1.0 - smoothstep(0.7, 1.0, abs(vv) + 0.25 * vn(vec2(u * 28.0, sign(vv) * 3.0)));
  float br = vn(vec2(vv * 8.0, u * 2.5)) * 0.7 + vn(vec2(vv * 30.0, u * 6.0)) * 0.3;
  float bristle = smoothstep(u * 0.75 - 0.12, u * 0.75 + 0.04, br + 0.18);
  float front = smoothstep(g.z, g.z - 0.04, u);
  return body * bristle * front * g.w;
}

// Seigaiha: overlapping scales, lower rows in front. mode 0 = band riding stroke A, 1 = field.
// returns (sumi, indigo)
vec2 seig(vec2 P, float R, float mode){
  float sx = R * 1.82, dy = R * 0.52;
  float j0 = floor(P.y / dy);
  float found = 0.0; vec2 bc = vec2(0.0); float bid = 0.0, bprog = 0.0;
  for (int k = 2; k >= -2; k--) {
    float j = j0 + float(k);
    float off = mod(j, 2.0) * sx * 0.5;
    float i = floor((P.x - off) / sx + 0.5);
    vec2 c = vec2(i * sx + off, j * dy);
    vec2 q = P - c; float d = length(q);
    if (d > R) continue;
    float id = h21(vec2(i, j) + mode * 31.0);
    float prog;
    if (mode < 0.5) {
      float fy = uSA.x + uSA.y * sin(uSA.z * c.x + uSA.w);
      if (c.y > fy - R * 0.05 || c.y < fy - R * 0.62 || c.x < uBandC.x || c.x > uBandC.y) continue;
      prog = clamp((uBand.y - c.x - R * 0.2) / (R * 1.3), 0.0, 1.0);
    } else {
      float hz = uField.z + 0.06 * sin(c.x * 2.3 + 1.0) + 0.04 * sin(c.x * 5.1 + 2.0);
      if (c.y > hz) continue;
      prog = clamp(uField.y - (j + 3.0) * 0.4 - id * 0.6, 0.0, 1.0);
    }
    if (prog <= 0.0) continue;
    float th = atan(q.y, q.x);
    float sw = th >= 0.0 ? (PI - th) / PI : (th < -1.5708 ? 0.0 : 1.0);
    if (mode < 0.5 && q.y < -R * 0.02) continue;
    if (sw > prog * 1.04) { if (prog < 0.5) continue; }
    found = sw <= prog * 1.04 ? 1.0 : 0.0; bc = c; bid = id; bprog = prog;
  }
  if (found < 0.5) return vec2(0.0);
  vec2 q = P - bc; float th = atan(q.y, q.x);
  float rd = length(q) / R + 0.03 * (vn(P * 28.0) - 0.5) + 0.015 * (vn(P * 90.0) - 0.5);
  float f = rd * 4.0; float fr = fract(f); float idx = floor(f);
  float line = smoothstep(0.26, 0.33, fr) * (1.0 - smoothstep(0.6, 0.67, fr));
  line *= step(0.1, rd) * step(rd, 0.99);
  line *= smoothstep(0.12, 0.42, vn(vec2(th * 7.0 + idx * 3.0, idx + bid * 9.0)) + 0.3);
  if (mode < 0.5) return vec2(line * 1.05, 0.0);
  // field tones: sumi, navy, mid-blue, faded
  if (bid < 0.3) return vec2(line * 1.05, 0.0);
  if (bid < 0.62) return vec2(0.0, line * 1.15);
  if (bid < 0.85) return vec2(0.0, line * 0.55);
  return vec2(line * 0.12, line * 0.3);
}

float asanoha(vec2 P, float side, float lw, out vec2 cen){
  vec2 A = vec2(side, 0.0), B = vec2(side * 0.5, side * 0.8660254);
  float v = P.y / B.y; float u = (P.x - v * B.x) / side;
  vec2 cell = floor(vec2(u, v)); vec2 f = vec2(u, v) - cell;
  vec2 o = cell.x * A + cell.y * B;
  vec2 p0, p1, p2;
  if (f.x + f.y < 1.0) { p0 = o; p1 = o + A; p2 = o + B; } else { p0 = o + A + B; p1 = o + B; p2 = o + A; }
  cen = (p0 + p1 + p2) / 3.0;
  float d = min(min(sdSeg(P, p0, p1), sdSeg(P, p1, p2)), sdSeg(P, p2, p0));
  d = min(d, min(min(sdSeg(P, cen, p0), sdSeg(P, cen, p1)), sdSeg(P, cen, p2)));
  d += 0.0012 * (vn(P * 140.0) - 0.5);
  float aa = max(fwidth(d), 1e-4);
  return 1.0 - smoothstep(lw - aa, lw + aa, d);
}

float spiralInk(vec2 P, vec4 a, vec4 b){
  vec2 q = P - a.xy; float r = length(q);
  if (r > a.z * 1.04) return 0.0;
  float th = atan(q.y, q.x) + b.w; float rn = r / a.z;
  float f = b.y < 0.5 ? rn * b.x - th / 6.2831853 : rn * b.x;
  float fr = abs(fract(f) - 0.5);
  float line = 1.0 - smoothstep(0.17, 0.25, fr + 0.04 * vn(q * 180.0));
  line = max(line, 1.0 - smoothstep(0.03, 0.05, abs(rn - 0.97)));
  line *= smoothstep(a.w, a.w - 0.08, rn) * step(0.05, rn);
  return line * b.z;
}

float dropInk(vec2 P, vec4 d, int k){
  vec2 q = P - d.xy; float r = length(q); float th = atan(q.y, q.x);
  float ink = 0.0;
  if (d.z > 0.0) {
    float N = 84.0; float bi = floor((th + PI) / (2.0 * PI) * N);
    float hb = h21(vec2(bi, float(k) * 17.0 + 3.0)), hl = h21(vec2(bi * 1.7, 5.0 + float(k)));
    float thc = (bi + 0.5 + (hb - 0.5) * 0.6) / N * 2.0 * PI - PI;
    float L = (0.08 + 0.3 * hl * hl) * clamp(d.z / 0.22, 0.0, 1.0);
    float across = r * abs(sin(th - thc));
    float w = 0.003 * (1.3 - r / max(L, 1e-3));
    float dash = hb > 0.62 ? step(0.38, fract(r * 28.0 + hb * 7.0)) : 1.0;
    ink = step(0.28, hb) * step(0.06, r) * step(r, L) * (1.0 - smoothstep(w * 0.55, w, across)) * dash;
  }
  for (int i = 0; i < 8; i++) {
    float ra = uRingR[k * 8 + i], aa = uRingA[k * 8 + i];
    if (aa < 0.002) continue;
    float fi = float(i);
    float rr = ra * (1.0 + 0.035 * (vn(vec2(th * 3.0 + fi, fi * 5.0)) - 0.5));
    float w = (0.0042 + 0.0045 * h21(vec2(fi, float(k)))) * (0.55 + 0.8 * vn(vec2(th * 11.0, fi * 3.1)));
    float ln = 1.0 - smoothstep(w * 0.55, w, abs(r - rr));
    ln *= smoothstep(0.1, 0.32, vn(vec2(th * 26.0 + fi * 11.0, float(k) + fi)) + 0.22);
    ink += ln * aa;
  }
  return ink * d.w;
}

void main(){
  vec2 F = (vUv - 0.5) * ${PS.toFixed(3)} + 0.5;
  vec2 P = F * vec2(${ASP.toFixed(5)}, 1.0);
  vec2 D = (F + 0.1) / 1.2;
  float inD = smoothstep(0.0, 0.02, D.x) * smoothstep(1.0, 0.98, D.x) * smoothstep(0.0, 0.02, D.y) * smoothstep(1.0, 0.98, D.y);
  vec2 vel = texture2D(uVel, D).xy;
  vec2 Dr = D + vel * uRefr;

  vec3 alb = texture2D(uAlb, vUv).rgb;
  vec2 te = vec2(1.0 / 2048.0, 1.0 / 1152.0);
  float ht = texture2D(uHgt, vUv).r;
  float hx = texture2D(uHgt, vUv + vec2(te.x, 0.0)).r - ht, hy = texture2D(uHgt, vUv + vec2(0.0, te.y)).r - ht;

  // Absorbed ink (memo) with fibre-feathered sampling + local blur for edge darkening.
  vec2 fe = (vec2(vn(P * 90.0), vn(P * 90.0 + 7.3)) - 0.5) * 0.0025;
  vec2 mt = vec2(2.5 / ${MEMO_W}.0, 2.5 / ${MEMO_H}.0);
  vec4 m0 = texture2D(uMemo, Dr + fe);
  vec4 mL = texture2D(uMemo, Dr - vec2(mt.x, 0.0)), mR = texture2D(uMemo, Dr + vec2(mt.x, 0.0));
  vec4 mB = texture2D(uMemo, Dr - vec2(0.0, mt.y)), mT = texture2D(uMemo, Dr + vec2(0.0, mt.y));
  vec4 blur = (mL + mR + mB + mT) * 0.25;
  vec4 dye = texture2D(uDye, Dr) * inD;
  float wet = clamp(dye.g, 0.0, 1.0);
  float gran = 0.78 + 0.44 * vn(P * 150.0) * (0.6 + 0.8 * ht);
  float Di = max(m0.g, m0.a) * inD, Bi = max(blur.g, blur.a) * inD;
  float ind = (1.0 - exp(-Di * 1.6)) * 0.95 * gran + max(0.0, Di - Bi) * 2.2 * smoothstep(0.02, 0.2, Di);
  float Ds = m0.b * inD;
  float sum = smoothstep(0.0, 1.0, Ds) * 0.9 * gran + max(0.0, Ds - blur.b * inD) * 1.8;
  float indigo = ind * uIndW, sumi = sum * uSumiW;

  // Brush strokes + flicks
  if (uSAl.x > 0.002) sumi += strokeInk(P, uSA, uSA2, 0.25) * uSAl.x * 1.2;
  if (uSAl.y > 0.002) sumi += strokeInk(P, uSB, uSB2, 0.75) * uSAl.y * 1.2;
  for (int i = 0; i < 6; i++) if (uFl2[i].w > 0.002) sumi += flickInk(P, uFl[i], uFl2[i]) * 1.2;
  // Brush-written calligraphy / sumi-e (black) and the hanko seal (red), feathered by the fibres.
  float inF = step(0.0, F.x) * step(F.x, 1.0) * step(0.0, F.y) * step(F.y, 1.0);
  vec4 cal = texture2D(uCal, F + fe * 0.5) * inF;
  float calB = texture2D(uCal, F + vec2(0.0015, 0.0)).a + texture2D(uCal, F - vec2(0.0015, 0.0)).a + texture2D(uCal, F + vec2(0.0, 0.0026)).a + texture2D(uCal, F - vec2(0.0, 0.0026)).a;
  float calInk = cal.a * (1.0 - cal.r);
  sumi += calInk * 1.3 + max(0.0, calInk - calB * 0.25) * 0.6;   // pooled edges dry darker
  float seal = cal.a * cal.r;

  // Seigaiha
  if (uBand.x > 0.002) { vec2 s = seig(P, uBand.z, 0.0); sumi += s.x * uBand.x; }
  if (uField.x > 0.002) { vec2 s = seig(P, uField.w, 1.0); sumi += s.x * uField.x; indigo += s.y * uField.x; }

  // Asanoha, revealed per triangle (sampled at the cell centroid) or everywhere
  if (uAsa.x > 0.002) {
    vec2 cen; float ln = asanoha(P, uAsa.z, uAsa.w, cen);
    vec2 Fc = cen / vec2(${ASP.toFixed(5)}, 1.0); vec2 Dc = (Fc + 0.1) / 1.2;
    float rv = smoothstep(0.25, 0.65, texture2D(uMemo, Dc).r);
    rv = max(rv, uAsa.y);
    indigo += ln * rv * uAsa.x * 1.15;
  }
  for (int i = 0; i < 6; i++) if (uSp2[i].z > 0.002) indigo += spiralInk(P, uSp[i], uSp2[i]) * 1.1;
  if (uDrop[0].w > 0.002) indigo += dropInk(P, uDrop[0], 0) * 1.15;
  if (uDrop[1].w > 0.002) indigo += dropInk(P, uDrop[1], 1) * 1.15;

  // fibres resist the ink a touch
  indigo *= 1.0 - 0.18 * smoothstep(0.55, 0.8, ht);
  sumi *= 1.0 - 0.1 * smoothstep(0.55, 0.8, ht);
  vec3 T = exp(-indigo * vec3(3.5, 3.15, 2.15)) * exp(-sumi * vec3(4.9, 4.8, 4.5));
  vec3 col = alb * T;
  col = mix(col, alb * vec3(0.8, 0.12, 0.06), seal * 0.92);
  float inkAmt = 1.0 - T.g;

  // Lighting: curled sheet + fibre relief + raised wet ink + surface ripples
  vec2 g = vec2(hx, hy) * uRelief;
  g += vec2(mR.g - mL.g + mR.b - mL.b, mT.g - mB.g + mT.b - mB.b) * 0.12 * (0.2 + wet) * inD;
  vec2 rg = vec2(0.0);
  for (int i = 0; i < 5; i++) {
    vec4 R = uRip[i]; if (R.w < 0.002) continue;
    vec2 q = P - R.xy; float r = length(q) + 1e-4; float x = r - R.z * 0.42;
    rg += q / r * cos(x * 95.0) * exp(-x * x * 140.0) * R.w * exp(-R.z * 1.1);
  }
  g += rg * (0.2 + 0.8 * max(wet, uWater)) * 0.6;
  vec3 N = normalize(vN + vec3(-g, 0.0));
  vec3 V = normalize(cameraPosition - vWorld);
  float dif = max(dot(N, uL), 0.0);
  vec3 H = normalize(uL + V);
  float spec = pow(max(dot(N, H), 0.0), 90.0) * (0.02 + uWetGloss * wet * inkAmt * 0.35 + uWater * 0.12);
  col = col * (uAmb + uKey * dif) + vec3(1.0, 0.97, 0.92) * spec * uKey;
  float sd = length(P - uShadow.xy);
  col *= 1.0 - uShadow.w * (1.0 - smoothstep(uShadow.z * 0.3, uShadow.z, sd));
  gl_FragColor = vec4(col, 1.0);
}`;

const WATER_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const WATER_FRAG = `
uniform sampler2D uDye; uniform float uA, uLayer, uTime;
varying vec2 vUv;
void main(){
  vec2 F = (vUv - 0.5) * ${PS.toFixed(3)} + 0.5; vec2 D = (F + 0.1) / 1.2;
  vec2 o = vec2(sin(uTime * 0.31 + uLayer * 2.1), cos(uTime * 0.23 + uLayer * 1.3)) * 0.01 * uLayer;
  vec2 Dl = (D - 0.5) * (1.0 + 0.045 * uLayer) + 0.5 + o;
  float inD = smoothstep(0.0, 0.05, Dl.x) * smoothstep(1.0, 0.95, Dl.x) * smoothstep(0.0, 0.05, Dl.y) * smoothstep(1.0, 0.95, Dl.y);
  float e = 0.004;
  float d = texture2D(uDye, Dl).r, dR = texture2D(uDye, Dl + vec2(e, 0.0)).r, dT = texture2D(uDye, Dl + vec2(0.0, e)).r;
  vec2 g = vec2(dR - d, dT - d);
  float a = smoothstep(0.04, 0.95, d) * uA * inD;
  float lit = clamp(0.5 + dot(g, vec2(-0.6, 0.6)) * 22.0, 0.0, 1.0);
  vec3 c = mix(vec3(0.006, 0.009, 0.035), vec3(0.22, 0.27, 0.46), lit * (1.0 - smoothstep(0.25, 1.1, d)));
  gl_FragColor = vec4(c, a);
}`;

const QUAD_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const MEMO_FRAG = `
uniform sampler2D uPrev, uDye; uniform vec4 uDec; uniform float uAsaGain, uStainGain, uClear; varying vec2 vUv;
void main(){
  vec4 m = texture2D(uPrev, vUv), d = texture2D(uDye, vUv);
  vec4 o;
  o.r = max(m.r * uDec.r, smoothstep(0.06, 0.3, d.r) * uAsaGain);
  o.g = max(m.g * uDec.g, d.r);
  o.b = max(m.b * uDec.b, d.b);
  o.a = max(m.a * uDec.a, smoothstep(0.08, 0.5, d.r) * 0.26 * uStainGain);
  gl_FragColor = o * uClear;
}`;

const DESK_FRAG = `
varying vec2 vUv; ${NOISE}
void main(){
  vec2 p = vUv * vec2(60.0, 40.0);
  float w = vn(vec2(p.x * 0.15, p.y * 3.0)) * 0.6 + vn(vec2(p.x * 0.6, p.y * 12.0)) * 0.4;
  float rings = 0.5 + 0.5 * sin(p.y * 6.0 + w * 9.0);
  vec3 c = mix(vec3(0.05, 0.025, 0.012), vec3(0.13, 0.07, 0.035), rings * 0.6 + w * 0.4);
  gl_FragColor = vec4(c, 1.0);
}`;

/** Paint the washi: pulp clouds + long kozo fibres (white and tan), as albedo + relief height. */
function paintWashi(THREE: any) {
  const W = 2048, H = 1152;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const ca = mk(), chh = mk();
  const a = ca.getContext('2d')!, h = chh.getContext('2d')!;
  let s = 90211; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  a.fillStyle = '#f1e9d8'; a.fillRect(0, 0, W, H);
  h.fillStyle = '#7a7a7a'; h.fillRect(0, 0, W, H);
  for (let i = 0; i < 700; i++) {
    const x = rnd() * W, y = rnd() * H, r = 30 + rnd() * 170, light = rnd() > 0.5;
    const ga = a.createRadialGradient(x, y, 0, x, y, r);
    ga.addColorStop(0, light ? 'rgba(252,249,240,0.06)' : 'rgba(226,214,192,0.05)'); ga.addColorStop(1, 'rgba(0,0,0,0)');
    a.fillStyle = ga; a.fillRect(x - r, y - r, r * 2, r * 2);
    const gh = h.createRadialGradient(x, y, 0, x, y, r);
    gh.addColorStop(0, light ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.025)'); gh.addColorStop(1, 'rgba(0,0,0,0)');
    h.fillStyle = gh; h.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const fibre = (len: number, wid: number, ac: string, hc: string) => {
    const x = rnd() * W, y = rnd() * H, ang = rnd() * Math.PI * 2;
    const pts: number[][] = [[x, y]]; let px = x, py = y, an = ang;
    const n = 5;
    for (let k = 0; k < n; k++) { an += (rnd() - 0.5) * 1.3; px += Math.cos(an) * len / n; py += Math.sin(an) * len / n; pts.push([px, py]); }
    for (const [ctx, col] of [[a, ac], [h, hc]] as [CanvasRenderingContext2D, string][]) {
      ctx.strokeStyle = col; ctx.lineWidth = wid; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length - 1; k++) { const mx = (pts[k][0] + pts[k + 1][0]) / 2, my = (pts[k][1] + pts[k + 1][1]) / 2; ctx.quadraticCurveTo(pts[k][0], pts[k][1], mx, my); }
      ctx.stroke();
    }
  };
  for (let i = 0; i < 1400; i++) fibre(20 + rnd() * 90, 0.6 + rnd() * 1.0, 'rgba(255,253,247,0.16)', 'rgba(255,255,255,0.3)');
  for (let i = 0; i < 520; i++) fibre(60 + rnd() * 200, 1.0 + rnd() * 1.6, 'rgba(255,253,248,0.24)', 'rgba(255,255,255,0.5)');
  for (let i = 0; i < 200; i++) fibre(60 + rnd() * 180, 1.2 + rnd() * 1.6, 'rgba(190,160,110,0.42)', 'rgba(225,225,225,0.4)');
  for (let i = 0; i < 400; i++) { a.fillStyle = `rgba(150,128,96,${0.15 + rnd() * 0.25})`; a.beginPath(); a.arc(rnd() * W, rnd() * H, 0.6 + rnd() * 1.4, 0, 7); a.fill(); }
  const alb = new THREE.CanvasTexture(ca); alb.colorSpace = THREE.SRGBColorSpace; alb.anisotropy = 8;
  const hgt = new THREE.CanvasTexture(chh); hgt.anisotropy = 4;
  return { alb, hgt };
}

type Mode = 'brush' | 'bleed' | 'drop' | 'waves' | 'water';
const MODES: Mode[] = ['brush', 'bleed', 'drop', 'waves', 'water'];
const HELD: Mode[] = ['brush', 'bleed', 'drop', 'waves', 'water'];

interface Stroke { y0: number; amp: number; freq: number; ph: number; xs: number; xe: number; w: number; tip: number; alpha: number; target: number; speed: number }

export function buildJapaneseInk(THREE: any, renderer: any): SceneInst {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#120b07');
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  const owned: any[] = []; const own = <T>(x: T) => { owned.push(x); return x; };

  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; owned.push(env); pmrem.dispose();
    scene.environment = env; (scene as any).environmentIntensity = 0.5;
  } catch { /* lights only */ }
  const LDIR = new THREE.Vector3(-0.55, 0.62, 0.56).normalize();
  scene.add(own(new THREE.HemisphereLight('#fff6e8', '#2a1d12', 0.6)));
  const key = own(new THREE.DirectionalLight('#fff1dc', 2.2)); key.position.copy(LDIR).multiplyScalar(20); scene.add(key);

  const sim = new FluidSim(THREE, renderer, { simRes: 128, dyeRes: 576, aspect: ASP, iters: 16, curl: 18, velDiss: 0.6, dyeDiss: 0.03 });
  owned.push(sim);
  const { alb, hgt } = paintWashi(THREE); owned.push(alb, hgt);

  // Memo (absorbed ink) ping-pong
  const mrt = () => new THREE.WebGLRenderTarget(MEMO_W, MEMO_H, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false });
  const memo = [own(mrt()), own(mrt())];
  const memoMat = own(new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: MEMO_FRAG, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    uniforms: { uPrev: { value: null }, uDye: { value: null }, uDec: { value: new THREE.Vector4(1, 1, 1, 1) }, uAsaGain: { value: 0 }, uStainGain: { value: 0 }, uClear: { value: 1 } } }));
  const qScene = new THREE.Scene(), qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const qGeo = own(new THREE.PlaneGeometry(2, 2)); const qMesh = new THREE.Mesh(qGeo, memoMat); qMesh.frustumCulled = false; qScene.add(qMesh);
  const runMemo = () => {
    const prev = renderer.getRenderTarget(), ac = renderer.autoClear;
    renderer.autoClear = false;
    try { memoMat.uniforms.uPrev.value = memo[0].texture; memoMat.uniforms.uDye.value = sim.dye; renderer.setRenderTarget(memo[1]); renderer.render(qScene, qCam); memo.reverse(); }
    finally { renderer.setRenderTarget(prev); renderer.autoClear = ac; }
  };
  const clearMemo = () => {
    const prev = renderer.getRenderTarget(); const cc = new THREE.Color(); renderer.getClearColor(cc); const ca = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0); memo.forEach(m => { renderer.setRenderTarget(m); renderer.clear(true, false, false); });
    renderer.setRenderTarget(prev); renderer.setClearColor(cc, ca);
  };

  // Pressure along the strokes (voice-driven), one row per stroke slot.
  const pressData = new Uint8Array(256 * 2 * 4).fill(150);
  const pressTex = own(new THREE.DataTexture(pressData, 256, 2, THREE.RGBAFormat));
  pressTex.minFilter = pressTex.magFilter = THREE.LinearFilter; pressTex.needsUpdate = true;

  const V4 = () => new THREE.Vector4();
  const U: Record<string, any> = {
    uAlb: { value: alb }, uHgt: { value: hgt }, uDye: { value: sim.dye }, uMemo: { value: memo[0].texture }, uVel: { value: sim.velocity }, uPress: { value: pressTex }, uCal: { value: null as any },
    uTime: { value: 0 }, uKey: { value: 0.72 }, uAmb: { value: 0.62 }, uRefr: { value: 0 }, uWater: { value: 0 }, uIndW: { value: 1 }, uSumiW: { value: 1 }, uWetGloss: { value: 1 }, uRelief: { value: 2.2 },
    uL: { value: LDIR.clone() }, uBreath: { value: 0 }, uCockle: { value: 0.1 },
    uSA: { value: V4() }, uSA2: { value: V4() }, uSB: { value: V4() }, uSB2: { value: V4() }, uSAl: { value: new THREE.Vector2() },
    uFl: { value: Array.from({ length: 6 }, V4) }, uFl2: { value: Array.from({ length: 6 }, V4) },
    uBand: { value: V4() }, uBandC: { value: V4() }, uField: { value: V4() }, uAsa: { value: V4() },
    uDrop: { value: [V4(), V4()] }, uRingR: { value: new Array(16).fill(0) }, uRingA: { value: new Array(16).fill(0) },
    uSp: { value: Array.from({ length: 6 }, V4) }, uSp2: { value: Array.from({ length: 6 }, V4) },
    uRip: { value: Array.from({ length: 5 }, V4) }, uShadow: { value: V4() },
  };
  const cal = new InkCalligraphy(THREE, ASP); owned.push(cal); U.uCal.value = cal.texture;
  let calFadeT = 0, calPending = false;
  const paperMat = own(new THREE.ShaderMaterial({ uniforms: U, vertexShader: PAPER_VERT, fragmentShader: PAPER_FRAG }));
  const paper = new THREE.Mesh(own(new THREE.PlaneGeometry(PW, PH, 192, 108)), paperMat); scene.add(paper);
  const desk = new THREE.Mesh(own(new THREE.PlaneGeometry(90, 60)), own(new THREE.ShaderMaterial({ vertexShader: WATER_VERT, fragmentShader: DESK_FRAG })));
  desk.position.z = -0.4; scene.add(desk);

  // Ink-in-water: stacked translucent planes sampling the dye with depth parallax.
  const waterU: any[] = [];
  [0.35, 0.85, 1.45].forEach((z, i) => {
    const u = { uDye: { value: sim.dye }, uA: { value: 0 }, uLayer: { value: i + 1 }, uTime: { value: 0 } }; waterU.push(u);
    const m = own(new THREE.ShaderMaterial({ uniforms: u, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false }));
    const mesh = new THREE.Mesh(own(new THREE.PlaneGeometry(PW, PH)), m); mesh.position.z = z; mesh.renderOrder = 2 + i; scene.add(mesh);
  });

  // 3D sumi brush (bamboo handle, ferrule, black bristles); tip at the group origin, axis +Y.
  const brush = new THREE.Group(); scene.add(brush);
  const bristle = new THREE.Mesh(own(new THREE.ConeGeometry(0.5, 1.6, 32, 1, false)), own(new THREE.MeshPhysicalMaterial({ color: '#0a0a0b', roughness: 0.32, clearcoat: 0.6 })));
  bristle.rotation.x = Math.PI; bristle.position.y = 0.8; brush.add(bristle);
  const ferrule = new THREE.Mesh(own(new THREE.CylinderGeometry(0.46, 0.5, 0.55, 32)), own(new THREE.MeshStandardMaterial({ color: '#3a2a1c', roughness: 0.4, metalness: 0.3 })));
  ferrule.position.y = 1.85; brush.add(ferrule);
  const handle = new THREE.Mesh(own(new THREE.CylinderGeometry(0.33, 0.36, 7, 32)), own(new THREE.MeshStandardMaterial({ color: '#9c8456', roughness: 0.6 })));
  handle.position.y = 5.6; brush.add(handle);
  [3.4, 6.4].forEach(y => { const n = new THREE.Mesh(own(new THREE.TorusGeometry(0.35, 0.05, 8, 32)), own(new THREE.MeshStandardMaterial({ color: '#8c6d3c', roughness: 0.6 }))); n.rotation.x = Math.PI / 2; n.position.y = y; brush.add(n); });
  brush.visible = false; brush.scale.setScalar(0.55);

  // Falling ink drop + crown droplets.
  const inkMat = own(new THREE.MeshPhysicalMaterial({ color: '#070a1a', roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.05 }));
  const dropMesh = new THREE.Mesh(own(new THREE.SphereGeometry(0.3, 32, 20)), inkMat); dropMesh.visible = false; scene.add(dropMesh);
  const NB = 48;
  const beads = own(new THREE.InstancedMesh(own(new THREE.SphereGeometry(1, 14, 10)), inkMat, NB)); beads.frustumCulled = false; scene.add(beads);
  const bead = Array.from({ length: NB }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), s: 0, on: false }));
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), sc3 = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0), tmpV = new THREE.Vector3();

  // ── state ──
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let last = -1, clock = 0, section = -1, mode: Mode = 'brush', modeT = 0, modeBeat0 = 0, eF = 0, eS = 0, lastDrop = -99;
  let prevKick = 0, prevSnare = 0, clearT = 0, kickCount = 0, swirlSign = 1, settled = false, seeded = false, prevLB = 0;
  const strokes: Stroke[] = [0, 1].map(() => ({ y0: 0.3, amp: 0.08, freq: 2, ph: 0, xs: 0, xe: 1.7, w: 0.07, tip: 0, alpha: 0, target: 0, speed: 0.2 }));
  const flicks = Array.from({ length: 6 }, () => ({ x: 0, y: 0, ang: 0, len: 0.2, curv: 0, w: 0.015, grow: 0, age: 99, on: false }));
  let flickI = 0;
  const spirals = Array.from({ length: 6 }, () => ({ x: 0, y: 0, R: 0.08, grow: 0, turns: 3, type: 0, age: 99, rot: 0, on: false }));
  let spiralI = 0;
  const ripples = Array.from({ length: 5 }, () => ({ x: 0, y: 0, age: 99, amp: 0 }));
  let rippleI = 0;
  const drops = [0, 1].map(() => ({ x: 0, y: 0, age: -1, alpha: 0, fade: false, rings: [] as { r: number; rest: number; a: number }[], extra: 0 }));
  let dropSlot = 0;
  const fall = { on: false, x: 0, y: 0, z: 0, vz: 0, slot: 0, big: 1, delay: 0 };
  const W = { band: 0, field: 0, asa: 0, asaAll: 0, rings: 0, water: 0 };
  let fieldLevel = 0, bandTip = 0;

  const toW = (px: number, py: number) => [(px - ASP / 2) * FH, (py - 0.5) * FH];
  const ink = (px: number, py: number, fx: number, fy: number, c: [number, number, number, number], rho: number, swirl = 0) =>
    sim.splat((px / ASP + 0.1) / 1.2, (py + 0.1) / 1.2, fx, fy, c, (rho / 1.2) ** 2, swirl);
  const ripple = (x: number, y: number, amp: number) => { const r = ripples[rippleI++ % ripples.length]; r.x = x; r.y = y; r.age = 0; r.amp = amp; };
  const curveY = (s: Stroke, x: number) => s.y0 + s.amp * Math.sin(s.freq * x + s.ph);

  const setStroke = (i: number, p: Partial<Stroke>) => {
    Object.assign(strokes[i], { tip: 0, alpha: 1, target: 1 }, p);
    for (let k = 0; k < 256; k++) pressData[(i * 256 + k) * 4] = 150;
    pressTex.needsUpdate = true;
  };
  const mainStroke = (instant = false) => setStroke(0, { y0: 0.27, amp: 0.085 + rnd() * 0.02, freq: 2.0 + rnd() * 0.25, ph: 0.15 + rnd() * 0.2, xs: 0.02, xe: 1.72, w: 0.068, speed: 0.5, tip: instant ? 1.0 : 0 });
  const clearAll = () => { clearT = 0.8; };

  const enter = (m: Mode, beats: number) => {
    mode = m; modeT = 0; modeBeat0 = beats; settled = false; seeded = false; kickCount = 0; swirlSign = -swirlSign;
    if (m === 'brush') {
      clearAll(); strokes.forEach(s => s.target = 0); bandTip = 0; fieldLevel = 0;
      calFadeT = 0.5; calPending = true;            // fade the last work, then write the next
    } else if (m === 'bleed') {
      strokes.forEach(s => s.target = 0);           // the indigo floods over whatever the brush wrote
    } else if (m === 'drop') {
      calFadeT = 0.8; calPending = false;
      clearAll(); strokes.forEach(s => s.target = 0); fieldLevel = 0;
      drops.forEach(d => { d.alpha = 0; d.rings = []; d.age = -1; d.fade = false; }); dropSlot = 0;
      launchDrop(0, ASP * (0.42 + rnd() * 0.16), 0.52 + rnd() * 0.1, 1.2);
    } else if (m === 'waves') {
      calFadeT = 0.8; calPending = false;
      clearAll(); strokes.forEach(s => s.target = 0); fieldLevel = 0;
    } else {
      calFadeT = 0.8; calPending = false;
      clearAll(); strokes.forEach(s => s.target = 0); fieldLevel = 0;
    }
  };
  function launchDrop(slot: number, x: number, y: number, big: number) {
    Object.assign(fall, { on: true, x, y, z: 9, vz: -6, slot, big, delay: Math.max(0, clearT) });
    const d = drops[slot]; d.x = x; d.y = y; d.age = -1; d.alpha = 1; d.fade = false; d.rings = []; d.extra = 0;
  }
  function impact(energy: number) {
    const d = drops[fall.slot]; d.age = 0; fall.on = false;
    const s = fall.big;
    ink(d.x, d.y, 0, 0, [3.5 * s, 1.4, 0, 0], 0.05 * s, 0);
    for (let i = 0; i < 11; i++) {
      const a = rnd() * Math.PI * 2, r = (0.03 + rnd() * 0.05) * s;
      ink(d.x + Math.cos(a) * r, d.y + Math.sin(a) * r, Math.cos(a) * 70, Math.sin(a) * 70, [1.2, 0.8, 0, 0], (0.008 + rnd() * 0.012) * s, 0);
    }
    const [wx, wy] = toW(d.x, d.y);
    let n = 0;
    for (const b of bead) {
      if (n > 26 + energy * 16) break; n++;
      const a = rnd() * Math.PI * 2, sp = 1.5 + rnd() * 5.5;
      b.p.set(wx, wy, 0.2); b.v.set(Math.cos(a) * sp, Math.sin(a) * sp, 2 + rnd() * 6); b.s = 0.05 + rnd() * 0.11; b.on = true;
    }
    ripple(d.x, d.y, 1.4);
    d.rings.push({ r: 0.02, rest: 0.075, a: 1 });
  }

  const hash = (x: number) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  return {
    scene, camera,
    cam: { target: [0, 0, 0], radius: 12.5, pitch: 0, yaw: 0, fov: 42 },
    exposure: 1.45, brightThreshold: 1.5, grain: 0.012,
    update(t: number, a: FluxDriven, spec: FluxSpec) {
      const fresh = last < 0 || t < last || t - last > 2;
      const dt = fresh ? 1 / 60 : Math.min(0.1, Math.max(0, t - last)); last = t;
      const kick = a.kick ?? 0, snare = a.snare ?? 0, bass = a.bass, voice = a.voice ?? 0, mid = a.mid, tre = a.tre;
      const energy = Math.min(1, a.intensity ?? a.energy ?? 0);
      const k1 = (tau: number) => 1 - Math.exp(-dt / tau);
      if (fresh) {
        clock = 0; section = -1; eF = eS = energy; lastDrop = -99; seed = 7; prevKick = prevSnare = 0;
        sim.fadeDye(0); clearMemo(); strokes.forEach(s => { s.alpha = 0; s.target = 0; s.tip = 0; }); cal.clear(); calFadeT = 0;
        flicks.forEach(f => f.on = false); spirals.forEach(s => s.on = false); ripples.forEach(r => r.amp = 0);
        drops.forEach(d => { d.alpha = 0; d.rings = []; }); fall.on = false; bead.forEach(b => b.on = false);
        Object.keys(W).forEach(k => (W as any)[k] = 0); fieldLevel = 0;
      }
      clock += dt * (0.8 + energy * 0.6);
      const beats = (a.tempoConfidence ?? 0) > 0.3 && Number.isFinite(a.beatPosition) ? (a.beatPosition as number) : clock * 2;
      eF += (energy - eF) * k1(0.35); eS += (energy - eS) * k1(8);
      const build = Math.min(1, Math.max(0, (eF - eS) * 4));
      const drop = eF - eS > 0.25 && beats - lastDrop > 16 && beats > 8;
      if (drop) lastDrop = beats;
      const inkMul = 1 + build * 0.8 + energy * 0.3;

      const held = typeof spec.decoSeed === 'number' && spec.decoSeed >= 0 ? HELD[Math.floor(spec.decoSeed) % HELD.length] : null;
      const sec = Math.floor(beats / 16);
      if (held) { if (held !== mode || fresh || beats - modeBeat0 >= 16) enter(held, beats); }
      else if (sec !== section || drop || fresh) { section = sec; enter(drop ? 'drop' : MODES[Math.max(0, sec) % MODES.length], beats); }
      modeT += dt;
      const lb = Math.max(0, beats - modeBeat0);
      const kickHit = kick > 0.55 && prevKick <= 0.55; prevKick = kick;
      const snareHit = snare > 0.45 && prevSnare <= 0.45; prevSnare = snare;
      if (kickHit) kickCount++;
      const clearing = clearT > 0;
      if (clearing) { clearT -= dt; sim.fadeDye(Math.pow(0.86, dt * 60)); }

      // ── layer weights ──
      const tw = {
        band: 0,
        field: mode === 'waves' || (mode === 'bleed' && lb >= 8) ? 1 : 0,
        asa: mode === 'bleed' || mode === 'waves' || mode === 'water' ? 1 : 0,
        asaAll: mode === 'water' && !settled ? 1 : 0,
        rings: mode === 'drop' ? 1 : 0,
        water: mode === 'water' && !settled ? 1 : 0,
      };
      (Object.keys(W) as (keyof typeof W)[]).forEach(k => { W[k] += (tw[k] - W[k]) * k1(clearing && tw[k] === 0 ? 0.2 : 0.6); });

      // ── strokes: tip advances with the voice; pressure is written as the tip passes ──
      const pressure = Math.min(1, 0.3 + voice * 0.8 + mid * 0.15 + kick * 0.15);
      let tipWorld: number[] | null = null, tipDir = 0;
      strokes.forEach((s, i) => {
        s.alpha += (s.target - s.alpha) * k1(s.target > s.alpha ? 0.15 : 0.7);
        if (s.tip < 1 && s.alpha > 0.5 && s.target > 0) {
          const s0 = s.tip;
          s.tip = Math.min(1, s.tip + dt * s.speed * (0.7 + voice * 0.9 + energy * 0.4) * (a.bpm ? a.bpm / 120 : 1));
          for (let k = Math.floor(s0 * 255); k <= Math.floor(s.tip * 255); k++) pressData[(i * 256 + k) * 4] = Math.round(pressure * 255);
          pressTex.needsUpdate = true;
          const x = s.xs + s.tip * (s.xe - s.xs), y = curveY(s, x);
          tipWorld = toW(x, y); tipDir = Math.atan(s.amp * s.freq * Math.cos(s.freq * x + s.ph));
          // wet halo + black bleed at the tip
          if (!clearing) { const q = Math.min(3, dt * 60); ink(x - 0.02, y + (rnd() - 0.5) * s.w, 6 * q, 0, [0, 0.35, 0.035 * pressure * q, 0], s.w * (0.35 + pressure * 0.3), 0); }
          if (i === 0) bandTip = x;
        }
      });
      U.uSA.value.set(strokes[0].y0, strokes[0].amp, strokes[0].freq, strokes[0].ph); U.uSA2.value.set(strokes[0].xs, strokes[0].xe, strokes[0].w, strokes[0].tip);
      U.uSB.value.set(strokes[1].y0, strokes[1].amp, strokes[1].freq, strokes[1].ph); U.uSB2.value.set(strokes[1].xs, strokes[1].xe, strokes[1].w, strokes[1].tip);
      U.uSAl.value.set(strokes[0].alpha, strokes[1].alpha);

      // ── the brush writes: kanji stroke by stroke / sumi-e, then the seal ──
      if (calFadeT > 0) { cal.fade(Math.pow(0.82, dt * 60)); calFadeT -= dt; if (calFadeT <= 0) { cal.clear(); if (calPending) { cal.start(); calPending = false; } } }
      const wet = cal.update(dt, (0.75 + voice * 0.9 + energy * 0.35 + bass * 0.2) * (a.bpm ? Math.min(1.4, Math.max(0.75, a.bpm / 120)) : 1), Math.min(1, pressure + bass * 0.25), kickHit);
      for (let i = 0; i < wet.length; i += 2) { const wp = wet[i]; if (!clearing) ink(wp.p[0], wp.p[1], 0, 0, [0, 0.22, 0.01 * wp.ink * (0.6 + pressure), 0], wp.w * 0.28, 0); }
      if (cal.tip && !cal.done) { tipWorld = toW(cal.tip[0], cal.tip[1]); tipDir = cal.dir; }
      // 3D brush rides the real tip (lifted between strokes)
      if (tipWorld) {
        const tw2 = tipWorld as number[];
        brush.visible = true;
        const zT = cal.down ? 0.08 - pressure * 0.08 : 0.7;
        brush.position.x += (tw2[0] - brush.position.x) * Math.min(1, dt * 30); brush.position.y += (tw2[1] - brush.position.y) * Math.min(1, dt * 30);
        brush.position.z += (zT - brush.position.z) * Math.min(1, dt * 18);
        tmpV.set(-Math.cos(tipDir) * 0.35 + 0.45, -Math.sin(tipDir) * 0.35 + 0.8, 0.42).normalize();
        brush.quaternion.slerp(qq.setFromUnitVectors(yAxis, tmpV), Math.min(1, dt * 12));
      } else if (brush.visible) {
        brush.position.z += dt * 18; brush.position.x += dt * 6; brush.position.y += dt * 4;
        if (brush.position.z > 14) brush.visible = false; brush.scale.setScalar(0.55);
      }

      // ── per-mode conducting ──
      let spin = 0, drift = 8 + bass * 20;
      const dec = [1, 0.999, 0.9995, 1]; let asaGain = 0, stainGain = 0;
      sim.velDiss = 0.6; sim.curl = 14 + bass * 18; sim.dyeDiss = 0.03;
      U.uIndW.value = 1;
      if (mode === 'brush') {
        if (kickHit && !clearing && cal.tip && cal.down) {
          const x = cal.tip[0] + (rnd() - 0.5) * 0.04, y = cal.tip[1] + (rnd() - 0.5) * 0.04;
          ink(x, y, 0, 0, [0, 0.8, 0.25 * inkMul, 0], 0.008 + rnd() * 0.006, (rnd() - 0.5) * 40); ripple(x, y, 0.5);
        }
        spin = 0; drift = 0;   // ink on paper doesn't flow: only the wet halo feathers out
      } else if (mode === 'bleed') {
        const flood = lb < 9;
        if (flood) {
          sim.curl = 22 + bass * 30; sim.velDiss = 0.35; sim.dyeDiss = 0.012;
          if (kickHit || modeT < dt * 1.5) {
            const n = 3 + Math.round(energy * 3);
            for (let i = 0; i < n; i++) ink(-0.05 + rnd() * (ASP + 0.1), 1.04, (rnd() - 0.5) * 60, -(120 + bass * 200) * inkMul, [0.75 * inkMul, 1, 0, 0], 0.05 + rnd() * 0.05, (rnd() - 0.5) * (120 + bass * 300));
            ripple(rnd() * ASP, 0.75, 0.6);
          }
          if (rnd() < dt * (2 + voice * 8)) ink(ASP * (0.5 + 0.45 * Math.sin(t * 0.7)), 1.03, 0, -110, [0.45, 0.8, 0, 0], 0.045, 0);
          dec[1] = 0.999; asaGain = 1; stainGain = 1;
        } else {
          sim.dyeDiss = 0.45; sim.velDiss = 0.5; dec[1] = 0.97; asaGain = 1; stainGain = 1;
          fieldLevel = Math.min(3.2, fieldLevel + dt * 0.4 + (kickHit ? 0.25 : 0));
        }
        spin = (0.1 + bass) * 110 * swirlSign;
      } else if (mode === 'drop') {
        sim.curl = 4; sim.velDiss = 3.5; sim.dyeDiss = 0.004; dec[1] = 0.9995;
        if (kickHit && !fall.on) {
          const d = drops[dropSlot];
          if (d.age >= 0 && d.rings.length < 8) {
            const n = d.rings.length;
            d.rings.forEach(r => r.rest += 0.006);
            d.rings.push({ r: Math.max(0.03, n * 0.03), rest: 0.075 + n * 0.043 + rnd() * 0.01, a: 1 });
            if (n >= 3) for (let i = 0; i < 3 + Math.round(energy * 3); i++) {
              const ang = rnd() * Math.PI * 2, rr = 0.075 + n * 0.043;
              ink(d.x + Math.cos(ang) * rr, d.y + Math.sin(ang) * rr, Math.cos(ang) * 120, Math.sin(ang) * 120, [0.7 * inkMul, 0.7, 0, 0], 0.014 + rnd() * 0.014, 0);
            }
            ripple(d.x, d.y, 1.0);
          } else if (d.age >= 0 && ++d.extra >= 4) {
            d.fade = true; dropSlot = 1 - dropSlot;
            launchDrop(dropSlot, ASP * (0.2 + rnd() * 0.6), 0.25 + rnd() * 0.5, 0.8 + energy * 0.5);
          }
        }
        spin = 0; drift = 0;
      } else if (mode === 'waves') {
        sim.curl = 16; sim.dyeDiss = 0.22; sim.velDiss = 0.8; dec[1] = 0.985; asaGain = 1; stainGain = 1;
        if (!clearing && !seeded) {
          seeded = true;
          for (let i = 0; i < 9; i++) ink(0.05 + rnd() * (ASP - 0.1), 0.6 + rnd() * 0.38, (rnd() - 0.5) * 60, (rnd() - 0.5) * 60, [1.0, 0.8, 0, 0], 0.09 + rnd() * 0.07, (rnd() - 0.5) * 120);
        }
        if (!clearing) fieldLevel = Math.min(9, fieldLevel + dt * (0.5 + bass * 0.6) + (kickHit ? 0.45 : 0));
        if (kickHit && !clearing) {
          const sp = spirals[spiralI++ % spirals.length];
          let x = 0, y = 0;
          for (let tries = 0; tries < 6; tries++) {
            x = 0.12 + rnd() * (ASP - 0.24); y = 0.55 + rnd() * 0.38;
            if (spirals.every(o => !o.on || o === sp || Math.hypot(o.x - x, o.y - y) > o.R + 0.12)) break;
          }
          Object.assign(sp, { x, y, R: 0.06 + rnd() * 0.08 + bass * 0.02, grow: 0, turns: 2.5 + Math.floor(rnd() * 3), type: rnd() < 0.65 ? 0 : 1, age: 0, rot: rnd() * 6.28, on: true });
          ink(x, y, 0, 0, [0.35 * inkMul, 0.8, 0, 0], sp.R * 0.6, 0); ripple(x, y, 0.7);
        }
        spin = (bass - 0.2) * 40 * swirlSign;
      } else if (mode === 'water') {
        if (!settled && lb >= 11) {
          settled = true; calFadeT = 0.3; calPending = true; bandTip = 0;
        }
        if (!settled) {
          sim.curl = 30 + bass * 40; sim.velDiss = 0.22; sim.dyeDiss = 0.14; dec[1] = 0.86;
          U.uIndW.value = 0.55;
          if (!clearing) {
            for (let s = 0; s < 2; s++) {
              const y = 0.35 + s * 0.35 + 0.1 * Math.sin(t * (0.5 + s * 0.3) + s * 2);
              const q = Math.min(3, dt * 60);
              ink(0.02, y, (40 + bass * 70) * (0.6 + voice * 0.8) * q, Math.sin(t * 1.7 + s * 3) * 20 * q, [0.3 * inkMul * q, 0.25, 0, 0], 0.04, (s ? 1 : -1) * 6 * q);
            }
            if (kickHit) {
              const fromR = rnd() < 0.5, y = 0.15 + rnd() * 0.7;
              ink(fromR ? ASP + 0.06 : rnd() * ASP, fromR ? y : 1.05, fromR ? -(380 + bass * 500) : (rnd() - 0.5) * 100, fromR ? (rnd() - 0.5) * 120 : -(380 + bass * 400), [0.9 * inkMul, 0.6, 0, 0], 0.05, (rnd() - 0.5) * 300);
              ripple(rnd() * ASP, 0.2 + rnd() * 0.6, 1.0);
            }
          }
        } else {
          sim.curl = 12; sim.dyeDiss = 0.9; sim.velDiss = 0.8; dec[1] = 0.95; asaGain = 1; stainGain = 0.6;
        }
        spin = (0.15 + bass) * 160 * swirlSign; drift = 30 + bass * 120;
      }

      // snares: sharp sumi flicks (water: a whip of current instead)
      if (snareHit && !clearing && !(mode === 'brush' || (mode === 'water' && settled) || (mode === 'bleed' && !cal.done))) {
        if (mode === 'water' && !settled) {
          const x = rnd() * ASP, y = rnd(), ang = rnd() * Math.PI * 2;
          ink(x, y, Math.cos(ang) * 600, Math.sin(ang) * 600, [0.4, 0.3, 0, 0], 0.02, (rnd() - 0.5) * 400);
        } else {
          const f = flicks[flickI++ % flicks.length];
          const up = mode === 'drop' ? rnd() < 0.5 : true;
          Object.assign(f, { x: 0.1 + rnd() * (ASP - 0.5), y: up ? 0.12 + rnd() * 0.8 : 0.1 + rnd() * 0.3, ang: (rnd() - 0.5) * 1.2 + (rnd() < 0.25 ? Math.PI : 0), len: 0.12 + rnd() * 0.2 + snare * 0.08, curv: (rnd() - 0.5) * 0.9, w: 0.011 + rnd() * 0.012, grow: 0, age: 0, on: true });
          ink(f.x, f.y, 0, 0, [0, 0.6, 0.12, 0], 0.008, 0);
        }
      }

      // ── fluid ──
      sim.step(dt, { spin, drift, time: t, center: [0.5, 0.5] });
      const md = memoMat.uniforms;
      const p = dt * 60;
      md.uDec.value.set(Math.pow(dec[0], p), Math.pow(dec[1], p), Math.pow(dec[2], p), Math.pow(dec[3], p));
      md.uAsaGain.value = clearing ? 0 : asaGain; md.uStainGain.value = clearing ? 0 : stainGain;
      md.uClear.value = clearing ? Math.pow(0.86, p) : 1;
      runMemo();

      // ── drop moment: falling drop, crown beads, rings ──
      if (fall.on && fall.delay > 0) { fall.delay -= dt; dropMesh.visible = false; }
      else if (fall.on) {
        fall.vz -= 30 * dt; fall.z += fall.vz * dt;
        const [wx, wy] = toW(fall.x, fall.y);
        dropMesh.visible = true; dropMesh.position.set(wx, wy, Math.max(0.2, fall.z));
        dropMesh.quaternion.setFromUnitVectors(yAxis, tmpV.set(0, 0, 1));
        dropMesh.scale.set(fall.big, fall.big * (1 + Math.min(1.2, -fall.vz * 0.05)), fall.big);
        U.uShadow.value.set(fall.x - fall.z * 0.012, fall.y - fall.z * 0.01, 0.03 + fall.z * 0.012, 0.45 * Math.exp(-fall.z * 0.22));
        if (fall.z <= 0.2) { dropMesh.visible = false; U.uShadow.value.w = 0; impact(energy); }
      } else { dropMesh.visible = false; U.uShadow.value.w = 0; }
      bead.forEach((b, i) => {
        if (b.on) {
          b.v.z -= 22 * dt; b.p.addScaledVector(b.v, dt);
          if (b.p.z <= 0.05) {
            b.on = false;
            ink(b.p.x / FH + ASP / 2, b.p.y / FH + 0.5, 0, 0, [0.5 + b.s * 4, 0.7, 0, 0], 0.004 + b.s * 0.05, 0);
          }
        }
        const s = b.on ? b.s : 0;
        m4.compose(b.p, qq.identity(), sc3.set(s, s, s * (1 + Math.min(1, Math.abs(b.v.z) * 0.06)))); beads.setMatrixAt(i, m4);
      });
      beads.instanceMatrix.needsUpdate = true;
      drops.forEach((d, k) => {
        if (d.age >= 0) d.age += dt;
        if (d.fade) d.alpha = Math.max(0, d.alpha - dt * 0.35);
        U.uDrop.value[k].set(d.x, d.y, d.age, d.alpha * W.rings);
        for (let i = 0; i < 8; i++) {
          const r = d.rings[i];
          if (r) { r.r += (r.rest - r.r) * k1(0.22); r.rest += dt * 0.002 * bass; }
          U.uRingR.value[k * 8 + i] = r ? r.r : 0; U.uRingA.value[k * 8 + i] = r ? r.a : 0;
        }
      });

      // flicks / spirals / ripples
      flicks.forEach((f, i) => {
        if (f.on) { f.age += dt; f.grow = Math.min(1.05, f.age / 0.12); if (f.age > 6 || W.rings + W.band + W.field + W.asa < 0.02 && clearing) f.on = false; }
        const al = f.on ? Math.min(1, 1 - (f.age - 3.5) / 2.5) * (clearing ? 0 : 1) : 0;
        if (clearing) f.on = false;
        U.uFl.value[i].set(f.x, f.y, f.ang, f.len); U.uFl2.value[i].set(f.curv, f.w, f.grow, Math.max(0, al));
      });
      spirals.forEach((s, i) => {
        if (s.on) { s.age += dt; s.grow = Math.min(1.1, s.grow + dt * (1.8 + kick * 2)); s.rot -= dt * (0.3 + bass * 1.5); if (s.age > 9 || mode !== 'waves') s.on = s.age < 9 && mode === 'waves'; }
        const al = s.on ? Math.min(1, (9 - s.age) / 2) : 0;
        U.uSp.value[i].set(s.x, s.y, s.R * (1 + kick * 0.06), s.grow); U.uSp2.value[i].set(s.turns, s.type, al * W.field, s.rot);
      });
      ripples.forEach((r, i) => { r.age += dt; const amp = r.age < 3 ? r.amp : 0; U.uRip.value[i].set(r.x, r.y, r.age, amp); });

      // ── uniforms ──
      U.uTime.value = t;
      U.uDye.value = sim.dye; U.uVel.value = sim.velocity; U.uMemo.value = memo[0].texture;
      U.uBand.value.set(W.band, bandTip, 0.15, 0); U.uBandC.value.set(0.32, 1.55, 0, 0);
      U.uField.value.set(W.field, fieldLevel, 0.44, 0.105);
      U.uAsa.value.set(W.asa, W.asaAll, 0.165, 0.0033);
      U.uWater.value = W.water; U.uRefr.value = W.water * 0.00006;
      U.uBreath.value = 0.02 + bass * 0.07; U.uCockle.value = 0.12;
      U.uWetGloss.value = 1.0 + tre * 0.4;
      const la = t * 0.05 + bass * 0.1;
      U.uL.value.set(-0.55 + Math.sin(la) * 0.1, 0.62, 0.56).normalize();
      waterU.forEach((u, i) => { u.uDye.value = sim.dye; u.uTime.value = t; u.uA.value = W.water * (0.5 - i * 0.1); });
      key.intensity = 2.0 + kick * 0.4;
      if (typeof window !== 'undefined') (window as any).__ink = { mode, lb, W, fieldLevel, beats, cal: cal.name, calDone: cal.done };
    },
    bloom: (a: FluxDriven) => 0.12 + Math.min(1, a.intensity ?? 0) * 0.08,
    dispose() { owned.forEach(o => o?.dispose?.()); },
  };
}
