// generatorsOptics — ten "properties of light" generators for GEN_GLSL.
//
// Abstract studies of light itself, each built on the physics of the phenomenon rather than a
// painted lookalike: a 22° ice halo with its spectral minimum-deviation edge and parhelia; a beam
// dispersed through a glass prism by Cauchy's equation, ray by ray; a lens flare whose aperture
// ghosts sit on the optical axis; film light leaks as per-layer emulsion exposure; anamorphic bokeh
// with defocus; refractive caustics from a rippled surface; thin-film interference integrated over
// the visible spectrum; fluted glass as cylindrical lenses; volumetric dust shafts; and a ray-traced
// crystal sphere with dispersion, Fresnel and a caustic.
//
// Calm and peaceful with enough motion to feel alive: sources drift on slow paths, bass breathes the
// light, mids move it, treble glitters, level opens the exposure, the voice pulses the source.
// Composed as HEADER + CEL_COMMON (generatorsCosmos) + OPTICS_LIB + body.
//   iParam0 Pace / shape · iParam1 Detail · iParam2 Music response · iParam3 Variation

import { ABSTRACT_AUDIO } from './generatorsPlanes';

const OPTICS_LIB = ABSTRACT_AUDIO + `
// Smooth visible-spectrum response, λ in nm → linear RGB (CIE-ish bumps, violet leaks a little red).
vec3 spec(float l){
  return vec3(exp(-pow((l - 610.0) / 48.0, 2.0)) + 0.28 * exp(-pow((l - 440.0) / 28.0, 2.0)),
              exp(-pow((l - 550.0) / 42.0, 2.0)),
              exp(-pow((l - 462.0) / 36.0, 2.0)));
}
float lambda(int k, int n){ return mix(400.0, 700.0, (float(k) + 0.5) / float(n)); }
float schlick(float c, float F0){ return F0 + (1.0 - F0) * pow(1.0 - clamp(c, 0.0, 1.0), 5.0); }
float polySdf(vec2 p, float r, float n, float rot){ float a = atan(p.y, p.x) + rot; float b = TAU / n; return cos(floor(0.5 + a / b) * b - a) * length(p) - r; }
float segGlow(vec2 p, vec2 a, vec2 b, float w){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); float d = length(pa - ba * h); return exp(-d * d / (w * w)) + 0.06 * w / (w + d); }
// Ray (o, d) against segment a-b: t along the ray, or -1.
float raySeg(vec2 o, vec2 d, vec2 a, vec2 b){ vec2 e = b - a; float den = d.x * e.y - d.y * e.x; if (abs(den) < 1e-6) return -1.0; vec2 ao = a - o; float t = (ao.x * e.y - ao.y * e.x) / den; float u = (ao.x * d.y - ao.y * d.x) / den; return (t > 1e-4 && u >= 0.0 && u <= 1.0) ? t : -1.0; }
// Vocal ripples on a surface (height, d/dx, d/dy): each range rings out from its own point.
vec3 vocalRipples(vec2 p, float gain){
  vec3 acc = vec3(0.0);
  for (int b = 0; b < 3; b++){
    vec2 src = b == 0 ? vec2(0.02 * sin(iTime * 0.03), -0.04) : b == 1 ? vec2(-0.30 + 0.08 * sin(iTime * 0.05), 0.12) : vec2(0.33, -0.10 + 0.07 * sin(iTime * 0.07));
    float speed = b == 0 ? 0.24 : b == 1 ? 0.32 : 0.42;
    float k = b == 0 ? 26.0 : b == 1 ? 58.0 : 125.0;
    float amp = b == 0 ? 0.011 : b == 1 ? 0.0065 : 0.0028;
    vec2 d = p - src; float r = length(d) + 1e-4; float age = r / speed;
    if (age > 1.55) continue;
    float A = amp * vocalHist(age, b) * gain * exp(-r * 2.2) * smoothstep(1.55, 1.15, age) * smoothstep(0.0, 0.02, r);
    float ph = k * (r - iTime * speed);
    acc.x += A * sin(ph); acc.yz += A * k * cos(ph) * d / r;
  }
  return acc;
}
`;

// ── 1. Ice Halo — the 22° halo, parhelia and upper tangent arc from the refractive index of ice ──
const OPTIC_HALO = `
float nIce(float l){ return 1.3064 + 0.0056 * (pow(500.0 / l, 2.0) - 1.0); }
float dmin(float n, float apex){ return 2.0 * asin(n * sin(apex * 0.5)) - apex; }
// Minimum-deviation profile: nothing inside, a sharp bright inner edge, a long tail outward.
float haloProfile(float x, float tail){ float d = x * 57.2958; return d > 0.0 ? 1.4 * exp(-d / tail) / sqrt(d + 0.5) : 0.6 * exp(d * 3.0); }
void main(){
  BANDS
  vec2 fc = vUv * iResolution; vec2 p = aspectUv();
  float t = iTime * (0.3 + iParam0 * 0.5);
  float fovK = 1.0 / tan(radians(mix(36.0, 27.0, iParam0)));
  vec2 pan = vec2(sin(t * 0.05), cos(t * 0.04)) * 0.02;
  vec3 d0 = normalize(vec3(p + pan, fovK));
  float el = radians(22.0 + (iParam3 - 0.5) * 14.0);
  float pitch = el - radians(6.0);
  vec3 dir = vec3(d0.x, d0.y * cos(pitch) + d0.z * sin(pitch), -d0.y * sin(pitch) + d0.z * cos(pitch));
  vec3 sun = vec3(0.0, sin(el), cos(el));
  float theta = acos(clamp(dot(dir, sun), -1.0, 1.0));
  float az = atan(dir.x, dir.z), elv = asin(clamp(dir.y, -1.0, 1.0));
  float dEl = elv - el;
  float sinE = sin(el), cosE = cos(el);
  // cirrus veil: where the crystals are
  float veil = 0.45 + 0.55 * fbm(vec2(az * 2.6 + t * 0.02, elv * 4.5 - t * 0.008) + 3.0, detailOct(3.0, 5.0));
  veil *= 0.75 + B * 0.45;
  vec3 halo = vec3(0.0), dogs = vec3(0.0), arc = vec3(0.0);
  float ca = cos(az);
  for (int k = 0; k < 9; k++){
    float l = lambda(k, 9); vec3 sp = spec(l); float n = nIce(l);
    float d22 = dmin(n, radians(60.0)), d46 = dmin(n, radians(90.0));
    halo += sp * (haloProfile(theta - d22, 4.5) * 0.5 + haloProfile(theta - d46, 3.0) * 0.07);
    // parhelia sit on the parhelic circle, just outside the 22° halo at this elevation
    float cp = clamp((cos(d22) - sinE * sinE) / (cosE * cosE), -1.0, 1.0);
    float php = acos(cp);
    float u = (abs(az) - php) * 57.2958;
    float hp = u > 0.0 ? exp(-u / 2.2) / sqrt(u + 0.15) : 0.3 * exp(u * 3.5);
    dogs += sp * hp * exp(-dEl * dEl * 57.2958 * 57.2958 / 1.6);
    // upper tangent arc: a flattened curve resting on the top of the halo, red toward the sun
    float v = dEl - (d22 + 0.42 * az * az * (1.2 - sinE));
    arc += sp * haloProfile(v, 1.6) * exp(-az * az * 3.2);
  }
  halo /= 9.0; dogs /= 9.0; arc /= 9.0;
  vec3 haloTint = mix(vec3(1.0), iC2, 0.3);
  vec3 col = mix(iC0 * 0.22, iC0 * 0.5, smoothstep(0.5, -0.3, dir.y)) * (1.0 + 0.4 * veil) + vec3(0.42, 0.47, 0.55) * 0.12 * veil * veil;  // sky, lighter toward the horizon, cirrus
  col += (halo * 1.6 + dogs * (5.0 + M * 2.0) + arc * 1.4) * haloTint * veil;
  // the sun and its aureole
  float thd = theta * 57.2958;
  vec3 sunCol = mix(vec3(1.0), iC1, 0.35);
  col += sunCol * (3.0 / (1.0 + pow(thd / 0.5, 2.2)) + 0.22 / (1.0 + pow(thd / 2.4, 1.6)) * (1.0 + voice() * 0.4) + 0.08 * exp(-thd / 7.0));
  // diamond dust glittering in the veil
  col += stars(p * 2.0 + pan * 3.0, 34.0, 2.0, 0.9) * (0.25 + T * 0.9) * veil * smoothstep(0.0, 0.25, thd / 30.0);
  col *= vignette(p, 0.16);
  fragColor = vec4(finish(col, fc, 1.0 + L * 0.3, 1.1), 1.0);
}`;

// ── 2. Prism Dispersion — one white beam through a glass prism, every wavelength traced ──
const OPTIC_PRISM = `
float nGlass(float l){ return 1.50 + 0.0135 * (pow(550.0 / l, 2.0) - 1.0) * 3.4; }   // dense flint, dispersion exaggerated for the stage
vec2 outward(vec2 a, vec2 b, vec2 c){ vec2 e = b - a; vec2 n = normalize(vec2(e.y, -e.x)); return dot(n, (a + b) * 0.5 - c) < 0.0 ? -n : n; }
void main(){
  BANDS
  vec2 fc = vUv * iResolution; vec2 p = aspectUv();
  float t = iTime * (0.25 + iParam0 * 0.5);
  float R = 0.4; float rot = (iParam3 - 0.5) * 0.4 + sin(t * 0.15) * 0.03;
  vec2 pc = vec2(-0.12, -0.04);
  vec2 v0 = pc + R * vec2(cos(rot + PI * 0.5), sin(rot + PI * 0.5));
  vec2 v1 = pc + R * vec2(cos(rot + PI * 0.5 + TAU / 3.0), sin(rot + PI * 0.5 + TAU / 3.0));
  vec2 v2 = pc + R * vec2(cos(rot + PI * 0.5 + 2.0 * TAU / 3.0), sin(rot + PI * 0.5 + 2.0 * TAU / 3.0));
  float ba = 0.36 + sin(t * 0.2) * 0.05 + (L - 0.5) * 0.08;
  vec2 bd = vec2(cos(ba), sin(ba));
  vec2 bo = vec2(-1.3, -0.40 + sin(t * 0.13) * 0.04);
  // entry on the left face
  float tE = raySeg(bo, bd, v0, v1);
  vec2 E = bo + bd * max(tE, 0.0);
  vec2 N1 = outward(v0, v1, pc);
  float bw = 0.006 + B * 0.004;
  vec3 col = iC0 * 0.025 + vec3(0.004, 0.005, 0.008);
  float dust = 0.6 + 0.4 * fbm(p * 3.0 + t * 0.1, 3);     // the air the beams scatter in
  float beamI = (1.0 + voice() * 0.35) * (0.8 + B * 0.3);
  if (tE > 0.0){
    col += vec3(1.0, 0.98, 0.95) * segGlow(p, bo, E, bw) * 0.9 * beamI * dust;
    // Fresnel reflection off the entry face
    vec2 rd = reflect(bd, N1);
    col += vec3(1.0) * segGlow(p, E, E + rd * 2.0, bw * 0.8) * 0.12 * beamI * dust;
    float cosI = clamp(-dot(bd, N1), 0.0, 1.0);
    for (int k = 0; k < 10; k++){
      float l = lambda(k, 10); float n = nGlass(l); vec3 sp = spec(l) * 1.1;
      vec2 d1 = refract(bd, N1, 1.0 / n);
      float t12 = raySeg(E, d1, v1, v2), t20 = raySeg(E, d1, v2, v0);
      bool on12 = t12 > 0.0 && (t20 < 0.0 || t12 < t20);
      float tX = on12 ? t12 : t20;
      vec2 X = E + d1 * max(tX, 0.0);
      vec2 N2 = on12 ? outward(v1, v2, pc) : outward(v2, v0, pc);
      col += sp * segGlow(p, E, X, bw * 0.9) * 0.6 * beamI * dust / 10.0;
      vec2 d2 = refract(d1, -N2, n);
      vec2 rr = reflect(d1, N2);
      float F = schlick(clamp(dot(d1, N2), 0.0, 1.0), 0.04);
      if (dot(d2, d2) > 0.0){
        col += sp * segGlow(p, X, X + d2 * 3.0, bw * 1.4) * (2.2 + M * 0.8) * beamI * dust / 10.0;
      } else F = 1.0;
      // the internally reflected part leaves by the third face as a dim ghost fan
      float t3 = on12 ? raySeg(X, rr, v2, v0) : raySeg(X, rr, v1, v2);
      vec2 X3 = X + rr * max(t3, 0.0);
      vec2 N3 = on12 ? outward(v2, v0, pc) : outward(v1, v2, pc);
      vec2 d3 = refract(rr, -N3, n);
      col += sp * segGlow(p, X, X3, bw * 0.8) * 0.1 * F * beamI * dust / 10.0;
      if (dot(d3, d3) > 0.0) col += sp * segGlow(p, X3, X3 + d3 * 3.0, bw) * 0.35 * F * beamI * dust / 10.0;
    }
    col *= 1.0 + 0.1 * cosI;
  }
  // the glass itself: a faint body, bright Fresnel edges
  float s0 = raySeg(p, vec2(1.0, 0.0), v0, v1) > 0.0 ? 1.0 : 0.0;
  float s1 = raySeg(p, vec2(1.0, 0.0), v1, v2) > 0.0 ? 1.0 : 0.0;
  float s2 = raySeg(p, vec2(1.0, 0.0), v2, v0) > 0.0 ? 1.0 : 0.0;
  float inside = mod(s0 + s1 + s2, 2.0);
  vec2 e0 = v1 - v0, e1 = v2 - v1, e2 = v0 - v2;
  float dE = min(min(length(p - v0 - e0 * clamp(dot(p - v0, e0) / dot(e0, e0), 0.0, 1.0)), length(p - v1 - e1 * clamp(dot(p - v1, e1) / dot(e1, e1), 0.0, 1.0))), length(p - v2 - e2 * clamp(dot(p - v2, e2) / dot(e2, e2), 0.0, 1.0)));
  col += inside * (vec3(0.03, 0.04, 0.05) + iC2 * 0.02 * (1.0 + 0.5 * sin(p.y * 30.0 + t)));
  col += vec3(0.8, 0.9, 1.0) * exp(-dE / 0.004) * 0.6 + vec3(0.5, 0.6, 0.7) * exp(-dE / 0.03) * 0.08;
  // dust caught in the exit fan
  col += stars(p * 1.5 + vec2(t * 0.02, -t * 0.01), 30.0, 5.0, 1.0) * (0.15 + T * 0.5) * smoothstep(0.0, 0.3, p.x - pc.x) * dust;
  col *= vignette(p, 0.25);
  fragColor = vec4(finish(col, fc, 1.05 + L * 0.25, 1.2), 1.0);
}`;

// ── 3. Lens Reticulation — a flare train of aperture ghosts, iris rings and reticulated glass ──
const OPTIC_FLARE = `
const float GK[12] = float[12](0.28, 0.5, 0.74, 1.0, 1.28, 1.55, 1.9, -0.35, 0.62, 1.15, 2.2, 0.38);
const float GR[12] = float[12](0.05, 0.11, 0.07, 0.16, 0.05, 0.2, 0.09, 0.08, 0.03, 0.26, 0.12, 0.14);
const float GS[12] = float[12](6.0, 8.0, 6.0, 8.0, 6.0, 8.0, 6.0, 8.0, 6.0, 8.0, 6.0, 8.0);
const float GF[12] = float[12](0.18, 0.1, 0.16, 0.08, 0.2, 0.06, 0.12, 0.12, 0.22, 0.04, 0.09, 0.07);
// (fill, ring) of one aperture ghost at q.
vec2 ghost(vec2 q, float rr, float n, float rot){ float d = polySdf(q, rr, n, rot); return vec2(smoothstep(0.004, -0.004, d) * (0.55 + 0.45 * smoothstep(-rr * 0.5, 0.0, d)), exp(-d * d / (0.00002 + rr * rr * 0.001)) * 0.8); }
float retic(vec2 p){ float l = max(max(abs(fract(p.x) - 0.5), abs(fract(dot(p, vec2(0.5, 0.866))) - 0.5)), abs(fract(dot(p, vec2(-0.5, 0.866))) - 0.5)); return smoothstep(0.44, 0.5, l); }
void main(){
  BANDS
  vec2 fc = vUv * iResolution; vec2 p = aspectUv();
  float t = iTime * (0.25 + iParam0 * 0.5);
  vec2 S = vec2(-0.5 + 0.12 * sin(t * 0.31), 0.28 + 0.08 * cos(t * 0.23)) * (0.8 + iParam3 * 0.4);
  vec2 C = vec2(0.0);
  vec2 ax = C - S;
  vec3 col = iC0 * 0.03 + vec3(0.005, 0.006, 0.01);
  col += stars(p * 1.2, 26.0, 7.0, 0.3) * 0.08;                                         // dust on the element
  vec2 ds = p - S; float r = length(ds);
  // source: core, aureole, iris diffraction rings, starburst from the blades
  col += vec3(1.0, 0.97, 0.9) * (2.5 * exp(-r * r * 900.0) + 0.5 / (1.0 + r * r * 60.0) * (1.0 + voice() * 0.4));
  col += iC2 * 0.35 * exp(-r * 3.5) * (0.8 + B * 0.4);
  for (int k = 1; k <= 4; k++){ float rr = (0.09 + float(k) * 0.045) * (1.0 + B * 0.06); col += (mod(float(k), 2.0) > 0.5 ? iC1 : iC2) * (0.13 - float(k) * 0.02) * exp(-pow((r - rr) / 0.006, 2.0)); }
  float ang = atan(ds.y, ds.x);
  float burst = 0.0;
  for (int k = 0; k < 8; k++){ float a = float(k) * PI / 8.0 + t * 0.02; vec2 u = vec2(cos(a), sin(a)); float along = abs(dot(ds, u)), across = abs(dot(ds, vec2(-u.y, u.x))); burst += exp(-across * 180.0) * exp(-along * 3.0); }
  col += mix(vec3(1.0), iC2, 0.4) * burst * 0.3 * (1.0 + voice() * 0.5);
  // anamorphic streak
  col += iC1 * 0.45 * exp(-abs(ds.y) * 260.0) * exp(-abs(ds.x) * 1.3) * (0.7 + M * 0.5);
  // the ghost train: polygonal apertures along the axis, each a coating colour, with chromatic spread
  for (int k = 0; k < 12; k++){
    vec2 G = S + ax * GK[k];
    float rr = GR[k] * (1.0 + B * 0.08);
    float rot = t * 0.03 + GK[k] * 2.0;
    vec3 tint = spec(mix(420.0, 680.0, fract(GK[k] * 0.618 + 0.3))) * 0.6 + mix(iC1, iC2, fract(GK[k] * 0.37)) * 0.6;
    float a = (GF[k] + M * 0.06) * clamp(1.25 - abs(GK[k] - 1.0) * 0.45, 0.2, 1.0);
    float ca = 0.025 * (1.0 + T);
    vec2 g0 = ghost((p - G) * (1.0 - ca), rr, GS[k], rot), g1 = ghost(p - G, rr, GS[k], rot), g2 = ghost((p - G) * (1.0 + ca), rr, GS[k], rot);
    vec3 g = (vec3(g0.x, g1.x, g2.x) + vec3(g0.y, g1.y, g2.y) * 1.4) * tint;
    float inner = smoothstep(0.0, -0.01, polySdf(p - G, rr * 0.92, GS[k], rot));
    float ret = rr > 0.1 ? retic((p - G) * 70.0 + vec2(t * 0.6, 0.0)) * inner * (0.35 + T * 0.6) : 0.0;
    col += (g + tint * ret * 0.5) * a;
  }
  col *= vignette(p, 0.3);
  fragColor = vec4(finish(col, fc, 1.0 + L * 0.3, 1.25), 1.0);
}`;

// ── 4. Film Light Leaks — stray light fogging the emulsion, layer by layer ──
const OPTIC_LEAKS = `
void main(){
  BANDS
  vec2 fc = vUv * iResolution; vec2 p = aspectUv();
  float t = iTime * (0.25 + iParam0 * 0.5);
  float E = 0.0, Eh = 0.0;
  for (int k = 0; k < 4; k++){
    float fk = float(k);
    vec2 anchor = k == 0 ? vec2(-0.95, 0.3) : k == 1 ? vec2(0.95, -0.25) : k == 2 ? vec2(-0.2, -0.62) : vec2(0.55, 0.62);
    vec2 a = anchor + vec2(sin(t * 0.09 + fk * 2.1), cos(t * 0.07 + fk * 1.3)) * 0.07 * (0.6 + L);
    float breathe = 0.75 + 0.25 * sin(t * 0.12 + fk * 2.4) + B * 0.3;
    vec2 d = (p - a) * vec2(1.0, 1.35);
    float r = length(d);
    float lump = fbm(d * 2.2 + fk * 7.0 + t * 0.03, detailOct(3.0, 5.0));
    float shape = exp(-r * (7.0 - lump * 3.0) / breathe);
    E += shape * (0.9 + 0.4 * iParam3);
    Eh += exp(-r * 2.8 / breathe) * 0.22;                                                 // halation: the same light, scattered wide in the base
  }
  // The red-sensitive layer sits deepest and fogs first; green then blue follow as the leak grows.
  vec3 fog = 1.0 - exp(-vec3(E * (1.2 + B * 0.5), E * 0.55 * (1.0 + M * 0.3), E * 0.2 * (1.0 + M * 0.5)) * 1.0);
  vec3 hal = 1.0 - exp(-vec3(Eh * 1.1, Eh * 0.3, Eh * 0.06) * 1.0);
  vec3 leak = mix(iC2, vec3(1.0, 0.95, 0.8), 0.3) * fog + mix(iC1, vec3(1.0, 0.35, 0.1), 0.4) * hal;
  // emulsion base and grain
  vec3 base = iC0 * 0.08 + vec3(0.012, 0.009, 0.007);
  float g = h21(floor(fc * 0.5) + floor(iTime * 12.0) * 7.0) - 0.5;
  vec3 col = base + leak;
  col *= 1.0 + g * (0.05 + 0.05 * (1.0 - fog.r)) * (0.5 + iParam1);
  // gate edges and the frame's own vignette
  float gate = smoothstep(0.0, 0.08, 0.5 - abs(vUv.y - 0.5)) * 0.65 + 0.35;
  col *= gate * vignette(p, 0.35);
  fragColor = vec4(finish(col, fc, 1.05 + L * 0.2, 1.2), 1.0);
}`;

// ── 5. Anamorphic Bokeh — far point lights through a 2× anamorphic lens, breathing in and out of focus ──
const OPTIC_STREAKS = `
void main(){
  BANDS
  vec2 fc = vUv * iResolution; vec2 p = aspectUv();
  float t = iTime * (0.25 + iParam0 * 0.5);
  float focus = 0.5 + 0.35 * sin(t * 0.17) + (L - 0.5) * 0.3;
  vec3 col = iC0 * 0.12 * (1.0 - p.y * 0.6) + vec3(0.004, 0.005, 0.01);
  float n = 14.0 + floor(iParam1 * 12.0);
  for (int i = 0; i < 26; i++){
    float fi = float(i);
    float on = step(fi, n - 1.0);
    float depth = h21(vec2(fi, 3.3));
    vec2 base = (h22(vec2(fi * 1.7, 9.1 + iParam3 * 5.0)) - 0.5) * vec2(1.95, 1.05);
    vec2 pos = base + vec2(sin(t * 0.08 + fi * 1.7), cos(t * 0.06 + fi * 2.3)) * 0.02 * (0.5 + depth);
    float tw = 0.75 + 0.25 * sin(t * (0.9 + h21(vec2(fi, 1.0)) * 0.6) + fi * 2.9);
    float defocus = abs(depth - focus);
    float Rr = 0.014 + defocus * 0.12;                                                   // circle of confusion
    vec2 d = (p - pos) * vec2(1.0, 0.5);                                                 // anamorphic: tall ovals
    float r = length(d);
    float bright = on * tw * (0.6 + depth * 0.5) * (0.85 + B * 0.3) * 0.0022 / (Rr * Rr);     // the same light spread over the disc
    vec3 warm = mix(vec3(1.0, 0.86, 0.6), iC2, 0.5);
    float disc = smoothstep(Rr, Rr - 0.004, r);
    float rim = smoothstep(Rr - 0.018, Rr - 0.004, r) * (0.5 + T * 0.4);                 // bright cat's-eye rim
    vec3 bok = warm * disc * (0.8 + rim * 0.6) * bright * 1.4;
    bok.r += smoothstep(Rr + 0.004, Rr, r) * smoothstep(Rr - 0.004, Rr, r) * bright * 0.25;   // red fringe outside
    bok.b += smoothstep(Rr - 0.008, Rr - 0.004, r) * smoothstep(Rr, Rr - 0.004, r) * bright * 0.15;
    col += bok;
    col += vec3(1.0) * exp(-dot(d, d) / (Rr * Rr * 0.08)) * bright * 0.4;             // hot core
    float len = (0.08 + depth * 0.16) * (0.8 + M * 0.7);
    vec2 ds = p - pos;
    col += iC1 * exp(-abs(ds.y) * 320.0) * exp(-abs(ds.x) / len) * tw * on * 1.4 * (0.5 + depth);   // the blue streak
    col += vec3(1.0) * exp(-abs(ds.x) * 900.0) * exp(-abs(ds.y) * 40.0) * tw * on * 0.12;           // a vertical glint
  }
  col *= vignette(p, 0.25);
  fragColor = vec4(finish(col, fc, 1.0 + L * 0.3, 1.15), 1.0);
}`;

// ── 6. Water-Glass Caustic — sun through a rippled water surface onto linen, with chromatic fringes ──
const OPTIC_CAUSTIC = `
float surf(vec2 q, float t){
  float h = 0.0;
  h += 0.018 * sin(dot(q, vec2(7.0, 3.0)) + t * 0.9);
  h += 0.014 * sin(dot(q, vec2(-4.0, 8.0)) - t * 0.7 + 1.0);
  h += 0.010 * sin(dot(q, vec2(11.0, -6.0)) + t * 1.1 + 2.0);
  h += 0.008 * sin(dot(q, vec2(-13.0, -9.0)) - t * 0.5);
  h += 0.02 * (fbm(q * 3.0 + t * 0.15, 3) - 0.5);
  return h;
}
void main(){
  BANDS
  vec2 fc = vUv * iResolution; vec2 p = aspectUv();
  float t = iTime * (0.25 + iParam0 * 0.5) * (0.7 + M * 0.6);
  vec2 cen = vec2(0.0, -0.05) + vec2(sin(iTime * 0.04), 0.0) * 0.03;
  vec2 q = (p - cen) * vec2(0.7, 1.0) * (1.0 + (iParam3 - 0.5) * 0.3);  // the glass is seen obliquely: an ellipse
  float rim = length(q);
  // refraction through the surface: a parallel beam lands displaced by D·(n−1)·∇h
  float ee = 0.004;
  vec3 vr = vocalRipples(q, iParam2 * 2.0);
  float h0 = surf(q, t) + vr.x;
  vec2 grad = vec2(surf(q + vec2(ee, 0.0), t) - h0, surf(q + vec2(0.0, ee), t) - h0) / ee + vr.yz;
  float D = 0.09;
  // The beam lands at m = p + k·∇h; its concentration is 1 / |det ∂m/∂p|, with k per wavelength (dispersion).
  vec2 gx = dFdx(grad) / max(dFdx(p.x), 1e-6), gy = dFdy(grad) / max(dFdy(p.y), 1e-6);
  vec3 kk = vec3(0.327, 0.333, 0.339) * D * 1.8;
  vec3 det = (1.0 + kk * gx.x) * (1.0 + kk * gy.y) - (kk * gx.y) * (kk * gy.x);
  vec3 I = clamp(1.0 / max(abs(det), vec3(0.06)), 0.0, 6.0);
  float inGlass = smoothstep(0.62, 0.56, rim);
  // the sunlit heart where the glass focuses the beam, and the brightness falling off outward
  float heart = exp(-dot(q, q) * 5.0) * (0.9 + B * 0.5) + 0.25 * exp(-dot(q, q) * 1.5);
  vec3 caus = I * (0.35 + 0.5 * heart) * inGlass;
  // the table: warm linen under afternoon sun
  float linen = 0.9 + 0.1 * (fbm(vec2(p.x * 90.0, p.y * 14.0), 2) + fbm(vec2(p.x * 14.0, p.y * 90.0), 2));
  vec3 cloth = mix(iC0, vec3(0.9, 0.82, 0.7), 0.35) * linen * (0.14 + 0.1 * exp(-dot(p, p) * 1.2));
  vec3 sun = mix(iC2, vec3(1.0, 0.9, 0.75), 0.5);
  vec3 col = cloth + cloth * sun * caus * 1.7 + sun * inGlass * heart * 0.35;
  // the rim of the glass catches the light; its shadow lies just outside
  col += sun * exp(-pow((rim - 0.6) / 0.01, 2.0)) * 0.6 * (0.5 + 0.5 * sin(atan(q.y, q.x) * 2.0 + t));
  col *= 1.0 - 0.35 * smoothstep(0.58, 0.64, rim) * smoothstep(0.78, 0.66, rim);
  col *= vignette(p, 0.3);
  fragColor = vec4(finish(col, fc, 0.9 + L * 0.3, 1.15), 1.0);
}`;

// ── 7. Soap Film — thin-film interference integrated over the visible spectrum ──
const OPTIC_FILM = `
void main(){
  BANDS
  vec2 fc = vUv * iResolution; vec2 p = aspectUv();
  float t = iTime * (0.2 + iParam0 * 0.5);
  float Rf = 0.66;
  vec2 c = vec2(0.0, 0.0);
  float r = length(p - c);
  // the film drains: thin at the top (black film), thick at the bottom, stirred by slow Marangoni swirls
  vec2 w = p + 0.18 * vec2(fbm(p * 2.2 + vec2(t * 0.1, -t * 0.06), 4) - 0.5, fbm(p * 2.2 + vec2(-t * 0.07, t * 0.09) + 5.0, 4) - 0.5) * (1.0 + B * 0.6);
  float swirl = fbm(w * 3.0 + vec2(0.0, -t * 0.12), detailOct(3.0, 6.0));
  float drain = smoothstep(0.7, -0.6, w.y + (iParam3 - 0.5) * 0.4);
  float d = (60.0 + 1100.0 * drain) * (0.55 + 0.9 * swirl) * (1.0 + M * 0.25);        // thickness in nm
  float n = 1.33; float cosT = 0.92;
  float rr = 0.14 * 0.14;
  vec3 R = vec3(0.0); vec3 norm = vec3(0.0);
  for (int k = 0; k < 12; k++){
    float l = lambda(k, 12); vec3 sp = spec(l);
    float delta = 4.0 * PI * n * d * cosT / l;
    float s2 = sin(delta * 0.5); s2 *= s2;
    float refl = 4.0 * rr * s2 / ((1.0 - rr) * (1.0 - rr) + 4.0 * rr * s2);
    R += sp * refl; norm += sp;
  }
  R /= norm;
  // what the film reflects: a soft sky and a tall window, the source of all the colour
  vec2 wp = (p - vec2(-0.32, 0.2)) * vec2(1.0, 0.6);
  float window = smoothstep(0.3, 0.18, abs(wp.x)) * smoothstep(0.4, 0.26, abs(wp.y)) * (0.9 + voice() * 0.2);
  window = max(window, 0.45 * exp(-dot(wp, wp) * 6.0));
  vec3 env = iC1 * 0.25 + vec3(0.9, 0.95, 1.0) * window * 0.9 + iC2 * 0.2 * smoothstep(-0.7, 0.7, p.y);
  float inFilm = smoothstep(Rf, Rf - 0.004, r);
  vec3 film = env * R * 7.0;
  // a second, smaller film in the corner catches the same window
  vec2 p2 = p - vec2(0.72, -0.34); float r2 = length(p2);
  float d2 = (200.0 + 700.0 * smoothstep(0.3, -0.3, p2.y)) * (0.6 + 0.8 * fbm(p2 * 5.0 + t * 0.2, 3));
  vec3 R2 = vec3(0.0);
  for (int k = 0; k < 6; k++){ float l = lambda(k, 6); float delta = 4.0 * PI * n * d2 * cosT / l; float s2 = sin(delta * 0.5); s2 *= s2; R2 += spec(l) * 4.0 * rr * s2 / ((1.0 - rr) * (1.0 - rr) + 4.0 * rr * s2); }
  R2 /= 6.0 * 0.5;
  vec3 col = iC0 * 0.04 + vec3(0.005, 0.005, 0.01);
  col = mix(col, film + iC0 * 0.02, inFilm);
  col = mix(col, env * R2 * 7.0, smoothstep(0.26, 0.255, r2));
  // the wire frames
  col += vec3(0.8, 0.75, 0.65) * exp(-pow((r - Rf) / 0.004, 2.0)) * (0.5 + 0.5 * smoothstep(-0.3, 0.8, p.y - p.x * 0.5));
  col += vec3(0.8, 0.75, 0.65) * exp(-pow((r2 - 0.26) / 0.003, 2.0)) * 0.6;
  col *= vignette(p, 0.3);
  fragColor = vec4(finish(col, fc, 1.1 + L * 0.3, 1.2), 1.0);
}`;

// ── 8. Fluted Glass — reeded glass as a row of cylindrical lenses over a drifting colour field ──
const OPTIC_FLUTED = `
float blob(vec2 q, float t, float fi){ vec2 cen = vec2(sin(t * (0.11 + fi * 0.021) + fi * 1.9), cos(t * (0.09 + fi * 0.017) + fi * 1.3)) * vec2(0.8, 0.45); return exp(-dot(q - cen, q - cen) * (6.0 - fi * 0.5)) * 0.5; }
vec3 scene(vec2 q, float t){
  return iC0 * 0.1 + iC1 * blob(q, t, 0.0) * 1.2 + iC2 * blob(q, t, 1.0) * 1.1 + mix(iC1, iC2, 0.5) * blob(q, t, 2.0) + vec3(1.0, 0.8, 0.5) * blob(q, t, 3.0) * 0.7 + iC1 * blob(q, t, 4.0) * 0.8;
}
// One wavelength's path: into the reed, through the flat back, on to the colour field behind.
vec3 through(vec3 I, vec3 N, float n, vec2 p, float thick, float D, float t){
  vec3 T1 = refract(I, N, 1.0 / n);
  float tir = dot(T1, T1) < 0.5 ? 1.0 : 0.0;
  float x1 = p.x + T1.x / max(-T1.z, 0.05) * thick;
  vec3 T2 = refract(normalize(T1 + vec3(0.0, 0.0, -1e-4)), vec3(0.0, 0.0, 1.0), n);
  float x2 = x1 + (dot(T2, T2) > 0.5 ? T2.x / max(-T2.z, 0.05) : 0.0) * D;
  return scene(vec2(x2, p.y), t) * (1.0 - tir * 0.85);
}
void main(){
  BANDS
  vec2 fc = vUv * iResolution; vec2 p = aspectUv();
  float t = iTime * (0.25 + iParam0 * 0.5) + B * 0.5;
  float pitch = 0.084 * (0.8 + iParam3 * 0.5);
  float fl = floor(p.x / pitch);
  float u = (p.x - (fl + 0.5) * pitch) / (pitch * 0.5);                                   // -1..1 across the reed
  float thick = 0.06, D = 0.5;
  vec3 N = vec3(u, 0.0, sqrt(max(1.0 - u * u, 0.0)));
  vec3 I = vec3(0.0, 0.0, -1.0);
  vec3 c0 = through(I, N, 1.532, p, thick, D, t), c1 = through(I, N, 1.52, p, thick, D, t), c2 = through(I, N, 1.508, p, thick, D, t);
  vec3 col = vec3(c0.r, c1.g, c2.b);
  col *= (1.0 + M * 0.35);
  // Fresnel reflection of the room: a tall soft window highlight and a dim sky
  float cosI = N.z;
  float F = schlick(cosI, 0.04);
  vec2 rp = vec2(u * 0.5 + sin(iTime * 0.05) * 0.4, p.y);
  float window = exp(-pow((rp.x - 0.15) * 4.0, 2.0)) * smoothstep(-0.8, 0.4, p.y);
  col += (vec3(0.9, 0.95, 1.0) * window * 0.5 + vec3(0.05, 0.06, 0.08)) * F * 1.1;
  // the reed's own edge: a bright line where the surface turns away, darkness between reeds
  col += vec3(1.0) * exp(-pow((abs(u) - 0.86) / 0.05, 2.0)) * 0.08 * (1.0 + voice() * 0.3);
  col *= 1.0 - 0.6 * smoothstep(0.93, 1.0, abs(u));
  col *= vignette(p, 0.25);
  fragColor = vec4(finish(col, fc, 0.85 + L * 0.3, 1.25), 1.0);
}`;

// ── 9. Dust Shafts — volumetric light from a high window through drifting dust, landing on a stone floor ──
const OPTIC_RAYS = `
const vec3 LDIR = vec3(0.62, -0.5, 0.3);   // sunlight direction (where it travels), through the window on the left wall
float windowOpen(vec3 P){
  // P is a point on the window plane x = -2.4
  vec2 w = P.yz - vec2(1.3, 3.4);
  float inside = step(abs(w.x), 1.0) * step(abs(w.y), 1.2);
  float mull = step(0.07, abs(w.x)) * step(0.06, abs(w.y - 0.6)) * step(0.06, abs(w.y + 0.6));
  return inside * mull;
}
float lit(vec3 P, vec3 L){
  float s = (P.x + 2.4) / L.x;
  if (s < 0.0) return 0.0;
  return windowOpen(P - L * s);
}
void main(){
  BANDS
  vec2 fc = vUv * iResolution; vec2 p = aspectUv();
  float t = iTime * (0.25 + iParam0 * 0.5);
  vec3 LV = normalize(LDIR + vec3(0.0, sin(t * 0.08) * 0.06 * (0.5 + M), 0.0));
  vec3 ro = vec3(0.3, 0.1, 0.0);
  float yaw = (iParam3 - 0.5) * 0.4 + sin(t * 0.05) * 0.03;
  vec3 rd = normalize(vec3(p.x * cos(yaw) + 1.3 * sin(yaw), p.y - 0.12, -p.x * sin(yaw) + 1.3 * cos(yaw)));
  // floor
  float floorY = -1.5;
  float tf = (floorY - ro.y) / min(rd.y, -1e-4);
  float tmax = tf > 0.0 ? min(tf, 9.0) : 9.0;
  int steps = 16 + int(iParam1 * 16.0);
  float dt = tmax / float(steps);
  float cosV = dot(rd, LV); float g = 0.45;
  float phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosV, 1.5) * 0.08;       // Henyey–Greenstein forward scatter
  vec3 sunCol = mix(vec3(1.0, 0.9, 0.72), iC1, 0.35);
  vec3 skyCol = mix(vec3(0.7, 0.8, 1.0), iC2, 0.4);
  vec3 col = vec3(0.0); float trans = 1.0;
  float jitter = h21(fc + fract(iTime) * 31.0);
  for (int i = 0; i < 40; i++){
    if (i >= steps) break;
    float s = (float(i) + jitter) * dt;
    vec3 P = ro + rd * s;
    float dens = (0.35 + 0.65 * fbm(P * 0.9 + vec3(t * 0.06, t * 0.02, -t * 0.04), 2)) * (0.7 + B * 0.5);
    float v = lit(P, LV);
    float sigma = 0.14 * dens;
    vec3 inscat = (sunCol * v * (phase + 0.08) * 6.0 + skyCol * 0.01) * sigma;
    col += inscat * trans * dt;
    trans *= exp(-sigma * dt * 0.6);
  }
  // the floor: warm stone, the window's parallelogram of light, dust motes shining in the beams
  if (tf > 0.0 && tf < 9.0){
    vec3 P = ro + rd * tf;
    float stone = 0.85 + 0.15 * fbm(P.xz * 1.6, 3) + 0.05 * vnoise(P.xz * 12.0);
    float v = lit(P, LV);
    vec3 fl = mix(iC0, vec3(0.5, 0.42, 0.35), 0.5) * stone * (0.08 + v * (1.1 + B * 0.3) * max(-LV.y, 0.0) * 1.3);
    col += fl * trans * exp(-tf * 0.04);
  } else col += iC0 * 0.02 * trans;
  float motes = 0.0;
  for (int k = 0; k < 3; k++){
    float fk = float(k);
    vec2 mp = p * (1.6 + fk * 0.6) + vec2(t * (0.01 + fk * 0.004), -t * 0.008 + fk * 2.0);
    vec3 P = ro + rd * (1.8 + fk * 1.4);
    motes += stars(mp, 24.0 + fk * 6.0, 11.0 + fk, 1.2).r * lit(P, LV) * (0.45 - fk * 0.1);
  }
  col += sunCol * motes * (0.25 + M * 0.5 + voice() * 0.3);
  col *= vignette(p, 0.3);
  fragColor = vec4(finish(col, fc, 1.1 + L * 0.3, 1.15), 1.0);
}`;

// ── 10. Crystal Sphere — a ray-traced glass ball: dispersion, Fresnel, a caustic beneath ──
const OPTIC_SPHERE = `
vec3 env(vec3 o, vec3 d, float t){
  // behind the sphere: a wall at z = 5 with drifting colour clouds; below: a dark floor
  vec3 c = vec3(0.0);
  float tz = (5.0 - o.z) / max(d.z, 1e-4);
  float ty = (-0.85 - o.y) / min(d.y, -1e-4);
  if (d.y < 0.0 && ty < tz){
    vec3 P = o + d * ty;
    float stone = 0.85 + 0.15 * fbm(P.xz * 1.3, 3);
    c = iC0 * 0.12 * stone * exp(-length(P.xz) * 0.25);
  } else {
    vec3 P = o + d * tz;
    vec2 q = P.xy * 0.45;
    c = iC0 * 0.12;
    for (int i = 0; i < 5; i++){
      float fi = float(i);
      vec2 cen = vec2(sin(t * (0.1 + fi * 0.02) + fi * 1.9), cos(t * (0.08 + fi * 0.015) + fi * 1.3)) * vec2(0.8, 0.5);
      vec3 tint = i == 0 ? iC0 : i == 1 ? iC1 : i == 2 ? iC2 : i == 3 ? mix(iC1, vec3(1.0), 0.4) : mix(iC2, iC0, 0.5);
      c += tint * exp(-dot(q - cen, q - cen) * 2.8) * 0.95;
    }
  }
  return c;
}
// One wavelength's path through the ball: in, across, out (or a total internal reflection), then the world behind.
vec3 throughSphere(vec3 rd, vec3 P, vec3 N, vec3 C, float n, float t){
  vec3 d1 = refract(rd, N, 1.0 / n);
  float t2 = -2.0 * dot(d1, P - C);
  vec3 P2 = P + d1 * t2;
  vec3 N2 = normalize(P2 - C);
  vec3 d2 = refract(d1, -N2, n);
  vec3 e = dot(d2, d2) > 0.5 ? env(P2, d2, t) : env(P2, reflect(d1, N2), t) * 0.6;
  return e * exp(-t2 * 0.12);
}
void main(){
  BANDS
  vec2 fc = vUv * iResolution; vec2 p = aspectUv();
  float t = iTime * (0.25 + iParam0 * 0.5) + B * 0.4;
  vec3 ro = vec3(0.0, 0.0, 0.0);
  vec3 rd = normalize(vec3(p, 1.25));
  vec3 C = vec3(0.04 * sin(iTime * 0.07), 0.14 + 0.03 * cos(iTime * 0.05), 2.5);
  float Rs = 0.72 * (0.85 + iParam3 * 0.3);
  vec3 oc = ro - C;
  float b = dot(oc, rd), cq = dot(oc, oc) - Rs * Rs, disc = b * b - cq;
  vec3 col = env(ro, rd, t);
  vec3 KEY = normalize(vec3(-0.6, 0.8, -0.5));
  // the floor beneath: the sphere's soft shadow and the caustic it focuses
  float ty = (-0.85 - ro.y) / min(rd.y, -1e-4);
  if (rd.y < 0.0 && ty < 12.0){
    vec3 P = ro + rd * ty;
    vec2 foot = P.xz - (C.xz + vec2(0.35, 0.2));
    float shadow = exp(-dot(foot, foot) * 2.2) * 0.6;
    vec2 cf = foot - vec2(0.12, 0.05);
    float caus = exp(-dot(cf, cf) * 28.0) * 2.0 + exp(-dot(cf, cf) * 9.0) * 0.5;
    col = col * (1.0 - shadow) + mix(iC2, vec3(1.0, 0.95, 0.85), 0.5) * caus * (0.5 + B * 0.4 + voice() * 0.3) * 0.5;
  }
  if (disc > 0.0){
    float t1 = -b - sqrt(disc);
    vec3 P = ro + rd * t1;
    vec3 N = normalize(P - C);
    float cosI = clamp(-dot(rd, N), 0.0, 1.0);
    float F = schlick(cosI, 0.04);
    vec3 refl = env(P, reflect(rd, N), t);
    float disp = 0.012 + M * 0.01;
    vec3 r0 = throughSphere(rd, P, N, C, 1.5 + disp, t), r1 = throughSphere(rd, P, N, C, 1.5, t), r2 = throughSphere(rd, P, N, C, 1.5 - disp, t);
    vec3 refr = vec3(r0.r, r1.g, r2.b);
    float inner = 0.6 + 0.4 * cosI;
    vec3 glass = mix(refr * inner, refl, F);
    // specular key light and a soft rim
    vec3 H = normalize(KEY - rd);
    float spc = pow(max(dot(N, H), 0.0), 420.0) * 2.0 + pow(max(dot(N, H), 0.0), 40.0) * 0.08;
    glass += vec3(1.0, 0.97, 0.92) * spc * (0.8 + B * 0.3);
    glass += mix(vec3(1.0), iC2, 0.4) * pow(1.0 - cosI, 3.0) * 0.12;
    col = glass;
  }
  col *= vignette(p, 0.25);
  fragColor = vec4(finish(col, fc, 1.05 + L * 0.3, 1.15), 1.0);
}`;

export const OPTICS_GLSL: Record<string, string> = {
  OPTIC_HALO: OPTICS_LIB + OPTIC_HALO,
  OPTIC_PRISM: OPTICS_LIB + OPTIC_PRISM,
  OPTIC_FLARE: OPTICS_LIB + OPTIC_FLARE,
  OPTIC_LEAKS: OPTICS_LIB + OPTIC_LEAKS,
  OPTIC_STREAKS: OPTICS_LIB + OPTIC_STREAKS,
  OPTIC_CAUSTIC: OPTICS_LIB + OPTIC_CAUSTIC,
  OPTIC_FILM: OPTICS_LIB + OPTIC_FILM,
  OPTIC_FLUTED: OPTICS_LIB + OPTIC_FLUTED,
  OPTIC_RAYS: OPTICS_LIB + OPTIC_RAYS,
  OPTIC_SPHERE: OPTICS_LIB + OPTIC_SPHERE,
};

/** The volumetric march and the spectral integrals render a little smaller; everything else is per-pixel cheap. */
export const OPTICS_RENDER_SCALE: Record<string, number> = {
  OPTIC_RAYS: 0.6,
  OPTIC_FILM: 0.8,
  OPTIC_HALO: 0.8,
  OPTIC_STREAKS: 0.8,
};
