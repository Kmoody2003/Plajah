// generatorsFluid — ten "liquids in a container" generators for GEN_GLSL.
//
// GEN_GLSL generators are single-pass and stateless, so there is no simulation
// buffer to step. Instead each pixel traces its fluid parcel BACKWARD through a
// time-varying, divergence-free velocity field (curl noise, Lamb–Oseen vortices,
// convection stream functions, stirrers) for a fixed window of past steps, and
// reads the dye where it came from. That is exact semi-Lagrangian advection of a
// known initial state — the colours stretch, fold and roll up the way real dyes
// do, and because the field evolves smoothly the picture flows continuously.
//
// Composed as HEADER + CEL_COMMON (generatorsCosmos) + FLUID_LIB + body.
//   iParam0 flow strength / shape · iParam1 Detail (trace steps = cost)
//   iParam2 Music response · iParam3 Variation

const FLUID_LIB = `
// Value noise with analytic derivatives (value, d/dx, d/dy).
vec3 noised(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
  float a = h21(i), b = h21(i + vec2(1.0, 0.0)), c = h21(i + vec2(0.0, 1.0)), d = h21(i + vec2(1.0, 1.0));
  float k = a - b - c + d;
  return vec3(a + (b - a) * u.x + (c - a) * u.y + k * u.x * u.y, du * (vec2(b - a, c - a) + k * u.yx));
}
// Divergence-free flow: the curl of two drifting noise octaves.
vec2 curlFlow(vec2 p, float t){
  vec3 n1 = noised(p + vec2(t * 0.11, -t * 0.07));
  vec3 n2 = noised(p * 2.13 + vec2(-t * 0.13, t * 0.09) + 5.7);
  vec2 g = n1.yz + n2.yz * 1.065;
  return vec2(g.y, -g.x);
}
// Lamb–Oseen vortex: solid-body core of radius² a2, 1/r outside.
vec2 lambOseen(vec2 d, float G, float a2){
  float q = dot(d, d) + 1e-5;
  return G / (TAU * q) * (1.0 - exp(-q / a2)) * vec2(-d.y, d.x);
}
vec2 gaussVortex(vec2 d, float s, float r2){ return s * vec2(-d.y, d.x) * exp(-dot(d, d) / r2); }
// Normal from a screen-space height (derivatives), k = bump strength.
vec3 screenNormal(float h, float k){
  return normalize(vec3(-dFdx(h) * iResolution.y * k, -dFdy(h) * iResolution.y * k, 1.0));
}
int traceSteps(float lo, float hi){ return int(floor(mix(lo, hi, iParam1) + 0.5)); }

// ── Vocal ripples ──
// iVocal: 1.6 s of three vocal ranges (newest first, 1/30 s apart), filled by GeneratorRenderer.
//   x = chest voice 150–500 Hz · y = vowel formants 0.5–2 kHz · z = presence / sibilance 2–6 kHz
// Each range rings out from its own point. A crest at radius r left the source r / speed seconds
// ago, so its height is the voice level *then*: a sung phrase leaves a train of rings behind it.
// Chest voice makes long slow swells, formants mid ripples, sibilance a fine fast shimmer.
uniform vec3 iVocal[48];
float vocalAt(float age, int band){
  float f = clamp(age * 30.0, 0.0, 46.999);
  int i = int(f);
  vec3 v = mix(iVocal[i], iVocal[i + 1], f - float(i));
  return band == 0 ? v.x : band == 1 ? v.y : v.z;
}
// Returns (height, d/dx, d/dy) of the summed ripple field at p (aspect space).
vec3 vocalRipples(vec2 p, float gain){
  vec3 acc = vec3(0.0);
  for (int b = 0; b < 3; b++){
    vec2 src = b == 0 ? vec2(0.02 * sin(iTime * 0.03), -0.04)
             : b == 1 ? vec2(-0.30 + 0.08 * sin(iTime * 0.05), 0.12)
             :          vec2(0.33, -0.10 + 0.07 * sin(iTime * 0.07));
    float speed = b == 0 ? 0.24 : b == 1 ? 0.32 : 0.42;
    float k     = b == 0 ? 26.0 : b == 1 ? 58.0 : 125.0;
    float amp   = b == 0 ? 0.011 : b == 1 ? 0.0065 : 0.0028;
    vec2 d = p - src;
    float r = length(d) + 1e-4;
    float age = r / speed;
    if (age > 1.55) continue;
    float e = vocalAt(age, b);
    float A = amp * e * gain * exp(-r * 2.2) * smoothstep(1.55, 1.15, age) * smoothstep(0.0, 0.02, r);
    float ph = k * (r - iTime * speed);
    acc.x += A * sin(ph);
    acc.yz += A * k * cos(ph) * d / r;
  }
  return acc;
}
// Light on the ripple slopes: a soft shade and a sharp glint from an overhead key.
float rippleShade(vec3 vr){ return clamp(dot(vr.yz, vec2(-0.55, 0.85)) * 6.0, -0.6, 0.6); }
float rippleGlint(vec3 vr){ return pow(clamp(dot(vr.yz, vec2(-0.55, 0.85)) * 6.0, 0.0, 1.0), 3.0); }
vec3 applyRipples(vec3 col, vec3 vr){ return col * (1.0 + rippleShade(vr) * 0.5) + vec3(1.0) * rippleGlint(vr) * 0.35; }
#define VOCAL vec3 VR = vocalRipples(p, iParam2 * 2.0);
`;

// ── 1. Ink Bloom — three inks injected into still water, billowing down ──
const FLUID_INK = `
void main(){
  BANDS
  float t = iTime;
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  VOCAL
  float seed = iParam3 * 10.0;
  int oct = detailOct(4.0, 6.0);
  vec2 x = (p + VR.yz * 0.06) * 1.5;
  int steps = traceSteps(12.0, 26.0);
  float dt = 2.6 / float(steps);
  float stir = (0.55 + iParam0 * 0.8) * (1.0 + M * 0.2);
  for (int i = 0; i < 26; i++){
    if (i >= steps) break;
    float tk = t * 0.5 - float(i) * dt * 0.8;
    vec2 v = curlFlow(x * 1.4 + seed, tk) * stir + vec2(0.0, -0.32 - B * 0.06);
    v += 0.045 * stir * vec2(cos(x.y * 7.0 + tk * 0.9) * sin(x.x * 6.0 - tk * 0.7), -sin(x.y * 7.0 + tk * 0.9) * cos(x.x * 6.0 - tk * 0.7) * 0.86);
    x -= v * dt;
  }
  // The ink clouds sink: their source pattern slides upward in parcel space.
  vec2 src = x + vec2(0.0, t * 0.05);
  vec3 dye;
  for (int k = 0; k < 3; k++){
    float fk = float(k);
    float n = fbm(src * vec2(1.2, 0.8) + vec2(fk * 13.7, fk * 5.1) + seed, oct);
    float tex = 0.55 + 0.45 * vnoise(src * 8.0 + fk * 3.0);
    dye[k] = smoothstep(0.53, 0.80, n) * tex;
  }
  float total = dye.r + dye.g + dye.b;
  vec3 hue = (dye.r * iC0 + dye.g * iC1 + dye.b * iC2) / max(total, 1e-4);
  float dens = 1.0 - exp(-total * 1.8);
  float edge = clamp(length(vec2(dFdx(dens), dFdy(dens))) * iResolution.y * 0.015, 0.0, 1.0);
  vec3 col = vec3(0.006, 0.008, 0.016) + vec3(0.02, 0.025, 0.04) * exp(-dot(p, p) * 2.5);
  vec3 ink = hue * (0.45 + 0.85 * dens) * (1.0 + B * 0.35);
  col = mix(col, ink, dens);
  col += mix(hue, vec3(1.0), 0.35) * edge * (0.3 + M * 0.3);
  col += hue * pow(dens, 4.0) * 0.2 * (1.0 + T);
  col = applyRipples(col, VR);
  col *= vignette(p, 0.3);
  fragColor = vec4(finish(col, fc, 1.15 + L * 0.3, 1.25), 1.0);
}`;

// ── 2. Marbled Pour — acrylic pour with silicone cells, under resin ──
const FLUID_MARBLE = `
vec2 vor(vec2 x){
  vec2 n = floor(x), f = fract(x); float f1 = 8.0, f2 = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    vec2 g = vec2(float(i), float(j)); vec2 r = g + h22(n + g) - f; float d = dot(r, r);
    if (d < f1){ f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return sqrt(vec2(f1, f2));
}
vec3 pourCol(float i){
  if (i < 0.5) return iC0;
  if (i < 1.5) return vec3(0.95, 0.92, 0.86);
  if (i < 2.5) return iC1;
  if (i < 3.5) return vec3(0.015, 0.02, 0.04);
  return iC2;
}
vec3 pourColour(float s){
  s = fract(s) * 5.0;
  float i = floor(s);
  float f = smoothstep(0.80, 1.0, fract(s));
  return mix(pourCol(i), pourCol(mod(i + 1.0, 5.0)), f);
}
void main(){
  BANDS
  float t = iTime;
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  VOCAL
  vec2 x = (p + VR.yz * 0.06) * 1.25;
  int steps = traceSteps(12.0, 28.0);
  float dt = 2.4 / float(steps);
  float flow = (0.25 + iParam0 * 0.55) * (1.0 + M * 0.15);
  for (int i = 0; i < 28; i++){
    if (i >= steps) break;
    float tk = t * 0.35 - float(i) * dt * 0.6;
    x -= (curlFlow(x * 0.9, tk) * flow + vec2(0.05, 0.0)) * dt;
  }
  float s = x.y * 1.1 + x.x * 0.35 + fbm(x * 1.3, 4) * 0.8;
  vec3 base = pourColour(s);
  vec3 under = pourColour(s + 0.41);
  vec2 cv = vor(x * 7.0 + 3.0);
  float zone = smoothstep(0.50, 0.68, fbm(x * 1.6 + 9.0, 3)) * (0.2 + iParam3 * 1.1);
  zone = clamp(zone, 0.0, 1.0);
  float cellR = 0.30;
  float inCell = smoothstep(cellR + 0.02, cellR - 0.03, cv.x) * zone;
  float lace = exp(-pow((cv.x - cellR) / 0.025, 2.0)) * zone;
  vec3 col = mix(base, under, inCell);
  col = mix(col, vec3(0.97, 0.95, 0.90), lace * 0.85);
  float h = dot(col, LUMA) * 0.012 + inCell * 0.006 + lace * 0.004;
  vec3 N = screenNormal(h, 1.0);
  vec3 R = reflect(vec3(0.0, 0.0, -1.0), N);
  float spec = pow(max(dot(R, normalize(vec3(-0.35, 0.45, 1.0))), 0.0), 90.0);
  float sheen = smoothstep(0.2, 0.9, R.y * 0.5 + 0.5 + p.x * 0.15) * 0.08;
  col *= 0.82 + 0.18 * N.z;
  col *= 1.0 + B * 0.18;
  col += vec3(1.0) * (spec * (0.55 + T * 0.5) + sheen);
  col = applyRipples(col, VR);
  col *= vignette(p, 0.25);
  fragColor = vec4(finish(col, fc, 1.05 + L * 0.25, 1.2), 1.0);
}`;

// ── 3. Lumen Lamp — two waxes rising and falling in a glass vessel ──
const FLUID_LAMP = `
void main(){
  BANDS
  float t = iTime;
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  VOCAL
  float wall = 0.40;
  float ax = abs(p.x);
  vec3 col = vec3(0.008, 0.006, 0.012) + iC2 * 0.06 * exp(-ax * 3.0) * (1.0 + B * 0.5);
  col += mix(iC0, iC1, 0.5) * 0.03 * exp(-ax * 2.0);
  if (ax < wall + 0.03){
    float xn = clamp(p.x / wall, -1.0, 1.0);
    vec2 q = vec2(asin(xn) / (PI * 0.5) * wall * 0.92, p.y);    // cylinder refraction
    q += VR.yz * 0.05;
    int n = int(floor(mix(5.0, 10.0, iParam1) + 0.5));
    float size = mix(0.06, 0.11, iParam0);
    float F = 0.0, wA = 0.0, wB = 0.0;
    vec2 grad = vec2(0.0);
    for (int i = 0; i < 10; i++){
      if (i >= n) break;
      float fi = float(i);
      float hs = h21(vec2(fi, 3.0 + iParam3 * 7.0));
      float hs2 = h21(vec2(fi, 9.1 + iParam3 * 3.0));
      float period = 40.0 + hs * 34.0;
      float ph = fract(t / period + hs2);
      float y = -0.62 + 1.24 * (0.5 - 0.5 * cos(ph * TAU));
      float bx = (hs - 0.5) * 0.48 + 0.06 * sin(t * 0.09 + fi * 1.7);
      float rad = size * (0.6 + 0.8 * h21(vec2(fi, 5.5))) * (1.0 + 0.05 * sin(t * 0.4 + fi) * (1.0 + M));
      vec2 d = q - vec2(bx, y);
      d.y /= 1.0 + 0.35 * abs(sin(ph * TAU));
      float dd = dot(d, d) + 1e-4;
      float c = rad * rad / dd;
      F += c; grad += -2.0 * c * d / dd;
      if (mod(fi, 2.0) < 0.5) wA += c; else wB += c;
    }
    float poolY = -0.44 + 0.025 * sin(q.x * 11.0 + t * 0.15) + 0.015 * sin(q.x * 23.0 - t * 0.11);
    float pool = smoothstep(0.03, -0.05, q.y - poolY) * 1.6;
    F += pool; wA += pool * 0.5; wB += pool * 0.5;
    grad.y -= pool * 8.0;
    float blob = smoothstep(0.92, 1.08, F);
    vec3 wax = mix(iC0, iC1, wB / (wA + wB + 1e-4));
    vec3 N = normalize(vec3(-grad * 0.028, 1.0));
    float heat = 0.55 + 0.45 * smoothstep(0.5, -0.5, q.y);
    float diff = clamp(dot(N, normalize(vec3(0.0, -0.55, 0.8))), 0.0, 1.0);
    float sss = pow(clamp(F - 1.0, 0.0, 3.0) / 3.0, 0.6);
    vec3 waxCol = wax * (0.35 + 0.9 * diff + 0.5 * sss) * heat * (1.0 + B * 0.35);
    waxCol += mix(wax, vec3(1.0), 0.5) * pow(1.0 - N.z, 2.0) * 0.5;
    waxCol += vec3(1.0) * pow(clamp(dot(reflect(vec3(0.0, 0.0, -1.0), N), normalize(vec3(-0.4, 0.5, 1.0))), 0.0, 1.0), 40.0) * 0.5;
    vec3 liquid = iC2 * (0.10 + 0.28 * heat * heat) * (1.0 + B * 0.4) + wax * 0.08 * smoothstep(0.35, 1.0, F);
    vec3 inside = mix(liquid, waxCol, blob);
    // Tiny bubbles riding the treble.
    vec2 bc = vec2(q.x * 26.0, q.y * 26.0 - t * 1.1);
    vec2 bid = floor(bc), bf = fract(bc) - 0.5;
    float bub = smoothstep(0.08, 0.04, length(bf - (h22(bid) - 0.5) * 0.6)) * step(0.93, h21(bid + 3.0));
    inside += vec3(1.0) * bub * (0.08 + T * 0.4) * (1.0 - blob);
    inside = applyRipples(inside, VR);
    float edge = ax / wall;
    inside *= 1.0 - 0.5 * pow(edge, 6.0);
    inside += vec3(1.0) * 0.5 * exp(-pow((p.x + wall * 0.72) / 0.010, 2.0)) * (0.7 + 0.3 * sin(p.y * 3.0 + 1.0));
    inside += vec3(1.0) * 0.16 * exp(-pow((p.x - wall * 0.80) / 0.025, 2.0));
    vec3 glassEdge = iC2 * 0.12 + vec3(0.55) * exp(-pow((ax - wall - 0.012) / 0.006, 2.0));
    float wallMask = smoothstep(wall + 0.03, wall + 0.024, ax);
    col = mix(col, ax < wall ? inside : glassEdge, wallMask);
  }
  fragColor = vec4(finish(col, fc, 1.1 + L * 0.3, 1.2), 1.0);
}`;

// ── 4. Iridescent Oil — thin-film interference on a swirling dark liquid ──
const FLUID_OILFILM = `
void main(){
  BANDS
  float t = iTime;
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  VOCAL
  int oct = detailOct(3.0, 6.0);
  vec2 x = (p + VR.yz * 0.06) * 1.3;
  int steps = traceSteps(10.0, 26.0);
  float dt = 2.2 / float(steps);
  float stir = (0.3 + iParam0 * 0.6) * (1.0 + B * 0.12);
  for (int i = 0; i < 26; i++){
    if (i >= steps) break;
    float tk = t * 0.5 - float(i) * dt * 0.7;
    x -= curlFlow(x * 1.1, tk) * stir * dt;
  }
  float thick = fbm(x * 1.4, oct) * 0.75 + fbm(x * 4.5 + 3.0, 3) * 0.25;
  float dnm = mix(60.0, 820.0, thick) * (0.65 + iParam3 * 0.7) + M * 60.0;
  // Integrate the film's reflectance over eight wavelengths: soft, physical Newton colours.
  vec3 film = vec3(0.0), wsum = vec3(0.0);
  for (int i = 0; i < 8; i++){
    float lam = 400.0 + float(i) * 42.0;
    float refl = 0.5 - 0.5 * cos(4.0 * PI * 1.40 * dnm / lam);
    vec3 cmf = vec3(exp(-pow((lam - 600.0) / 55.0, 2.0)) + 0.35 * exp(-pow((lam - 430.0) / 30.0, 2.0)),
                    exp(-pow((lam - 545.0) / 50.0, 2.0)),
                    exp(-pow((lam - 450.0) / 38.0, 2.0)));
    film += refl * cmf; wsum += cmf;
  }
  film /= wsum;
  film = saturate3(film, 1.6);
  vec3 pal = mix(iC1, iC2, smoothstep(0.3, 0.7, thick));
  film = mix(film, film * pal * 2.0, 0.2);
  float slick = smoothstep(0.38, 0.58, fbm(x * 0.7 + 21.0, 4));
  vec3 N = screenNormal(thick * 0.03, 1.0);
  vec3 R = reflect(vec3(0.0, 0.0, -1.0), N);
  float box = smoothstep(-0.2, 0.6, R.y + p.y * 0.4) * 0.6 + 0.4;
  float spec = pow(max(dot(R, normalize(vec3(0.3, 0.5, 1.0))), 0.0), 120.0);
  vec3 water = iC0 * 0.10 + vec3(0.02, 0.025, 0.035) * box;
  vec3 col = mix(water, iC0 * 0.08 + film * box * (1.05 + B * 0.3), slick);
  col += vec3(1.0) * spec * (0.45 + T * 0.8);
  col = applyRipples(col, VR);
  col *= vignette(p, 0.3);
  fragColor = vec4(finish(col, fc, 1.0 + L * 0.3, 1.25), 1.0);
}`;

// ── 5. Stirred Dye — three drops swirled in a round glass dish (top view) ──
const FLUID_VORTEX = `
void main(){
  BANDS
  float t = iTime;
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  VOCAL
  float R = 0.46;
  float r = length(p);
  vec3 col = vec3(0.010, 0.010, 0.014) * (1.0 - 0.5 * dot(p, p));
  col += mix(iC0, iC1, 0.5) * 0.04 * exp(-max(r - R, 0.0) * 12.0) * step(R, r);
  if (r < R + 0.02){
    vec2 x = p + VR.yz * 0.05;
    int steps = traceSteps(16.0, 40.0);
    float dt = 4.5 / float(steps);
    float stir = (1.4 + iParam0 * 2.0) * (1.0 + M * 0.2);
    for (int i = 0; i < 40; i++){
      if (i >= steps) break;
      float tk = t * 0.5 - float(i) * dt;
      vec2 c1 = 0.18 * vec2(cos(tk * 0.21), sin(tk * 0.17));
      float s1 = stir * (0.6 + 0.4 * sin(tk * 0.13));
      vec2 v = gaussVortex(x, stir * (0.9 + 0.4 * sin(tk * 0.09 + 1.0)), 0.07) + gaussVortex(x - c1, -s1 * 1.3, 0.015);
      v += curlFlow(x * 3.0, tk) * 0.07;
      v *= smoothstep(R, R - 0.07, length(x));
      x -= v * dt;
    }
    float seed = iParam3 * TAU;
    vec3 conc = vec3(0.0);
    for (int k = 0; k < 3; k++){
      float a = seed + float(k) * TAU / 3.0;
      vec2 c = 0.19 * vec2(cos(a), sin(a));
      float d2 = dot(x - c, x - c);
      conc[k] = exp(-d2 / 0.008) + 0.7 * exp(-pow((sqrt(d2) - 0.09) / 0.012, 2.0)) + 0.15 * exp(-d2 / 0.04);
    }
    conc += 0.12 * vec3(fbm(x * 6.0, 3), fbm(x * 6.0 + 4.0, 3), fbm(x * 6.0 + 8.0, 3)) * smoothstep(0.1, 0.4, conc.x + conc.y + conc.z);
    float total = conc.x + conc.y + conc.z;
    vec3 hue = (conc.x * iC0 + conc.y * iC1 + conc.z * iC2) / max(total, 1e-4);
    float dens = 1.0 - exp(-total * 2.6);
    vec3 liquid = vec3(0.012, 0.014, 0.022);
    vec3 inside = mix(liquid, hue * (0.6 + 0.7 * dens) * (1.0 + B * 0.3), dens);
    float edgeLine = clamp(length(vec2(dFdx(dens), dFdy(dens))) * iResolution.y * 0.01, 0.0, 1.0);
    inside += hue * edgeLine * 0.3;
    inside = applyRipples(inside, VR);
    float lamp = exp(-dot(p - vec2(-0.15, 0.17), p - vec2(-0.15, 0.17)) / 0.004) * 0.10;
    inside += vec3(1.0) * lamp * (0.8 + T * 0.6);
    inside += vec3(0.8, 0.85, 1.0) * exp(-(R - r) * 70.0) * 0.18;           // meniscus
    inside *= 1.0 - 0.35 * smoothstep(R - 0.12, R, r);
    vec3 rim = vec3(0.6) * exp(-pow((r - R - 0.006) / 0.004, 2.0)) + mix(iC0, iC1, 0.5) * 0.06;
    col = mix(col, r < R ? inside : rim, smoothstep(R + 0.02, R + 0.014, r));
  }
  fragColor = vec4(finish(col, fc, 1.1 + L * 0.3, 1.22), 1.0);
}`;

// ── 6. Density Column — stacked liquids in a glass tank, internal waves ──
const FLUID_DENSITY = `
vec3 layerCol(float i){
  if (i < 0.5) return iC0;
  if (i < 1.5) return mix(iC0, iC1, 0.5);
  if (i < 2.5) return iC1;
  if (i < 3.5) return mix(iC1, iC2, 0.5);
  if (i < 4.5) return iC2;
  if (i < 5.5) return mix(iC2, iC0, 0.45);
  return mix(iC0, vec3(1.0), 0.25);
}
void main(){
  BANDS
  float t = iTime;
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  VOCAL
  float wall = 0.64, top = 0.36, bottom = -0.42;
  int oct = detailOct(3.0, 5.0);
  float seed = iParam3 * 6.0;
  vec3 col = vec3(0.008, 0.009, 0.014) + vec3(0.03, 0.035, 0.05) * exp(-dot(p, p) * 3.0);
  float ax = abs(p.x);
  if (ax < wall && p.y > bottom - 0.03){
    float xn = p.x / wall;
    float xr = p.x * (1.0 - 0.06 * xn * xn);
    float slosh = (0.5 + iParam0) * (1.0 + B * 0.9);
    float wisp = (fbm(vec2(xr * 3.0 - t * 0.04 + seed, p.y * 9.0), oct) - 0.5) * 0.03;
    float ye = p.y + wisp + VR.x * 2.5;              // the voice sets the interfaces trembling
    float level = 0.0;
    float lines = 0.0;
    for (int k = 0; k < 6; k++){
      float fk = float(k);
      float yk = mix(bottom, top, (fk + 1.0) / 7.0);
      float eta = slosh * 0.02 * (sin(xr * 4.0 - t * 0.35 + fk * 1.3 + seed) + 0.6 * sin(xr * 7.3 + t * 0.27 + fk * 2.1)
                + 0.5 * sin(xr * 2.1 - t * 0.21 + fk * 0.7) * exp(-pow(fract(xr * 0.3 - t * 0.02 + fk * 0.37) - 0.5, 2.0) * 20.0)) * (1.0 - fk * 0.08);
      float dy = ye - yk - eta;
      float soft = 0.006 + 0.004 * fk / 6.0;
      level += smoothstep(-soft, soft, dy);
      lines += exp(-dy * dy / 0.000012);
    }
    float li = floor(level), lf = fract(level);
    vec3 liq = mix(layerCol(li), layerCol(min(li + 1.0, 6.0)), smoothstep(0.0, 1.0, lf));
    float back = 0.55 + 0.45 * exp(-xr * xr * 2.2);
    vec3 inside = liq * back * (0.62 + 0.38 * smoothstep(0.0, 1.0, lf)) * (0.95 + B * 0.25 + 0.15 * fbm(vec2(xr * 3.0, p.y * 3.0 + t * 0.02), 3));
    inside += vec3(1.0) * lines * 0.06 * (1.0 + M * 0.6);
    for (int j = 0; j < 12; j++){
      float fj = float(j);
      float hb = h21(vec2(fj, 1.7 + seed)), hb2 = h21(vec2(fj, 8.3));
      float sp = 0.012 + 0.018 * hb2;
      vec2 b = vec2((hb - 0.5) * 1.1 + 0.01 * sin(t * 0.8 + fj), bottom + fract(t * sp + hb2) * (top - bottom));
      float rb = 0.005 + 0.007 * hb;
      float d = length(p - b);
      float ring = smoothstep(rb, rb - 0.002, d) * (0.25 + 0.75 * smoothstep(rb * 0.5, rb, d));
      float hl = exp(-dot(p - b - vec2(-0.3, 0.3) * rb, p - b - vec2(-0.3, 0.3) * rb) / (rb * rb * 0.05));
      inside += vec3(1.0) * (ring * 0.25 + hl * 0.6) * (0.6 + T * 0.8);
    }
    inside = applyRipples(inside, VR);
    float topEta = slosh * 0.006 * sin(xr * 3.0 - t * 0.3 + seed);
    float above = smoothstep(top + topEta - 0.002, top + topEta + 0.002, p.y);
    inside = mix(inside, vec3(0.012, 0.014, 0.02), above);
    inside += vec3(0.9, 0.95, 1.0) * exp(-pow((p.y - top - topEta) / 0.003, 2.0)) * 0.5;
    inside *= 0.55 + 0.45 * sqrt(max(1.0 - xn * xn, 0.0));
    inside += vec3(1.0) * 0.14 * exp(-pow((xn + 0.55) / 0.06, 2.0));
    inside += vec3(1.0) * 0.18 * exp(-pow((p.x + wall * 0.88) / 0.006, 2.0));
    inside += vec3(1.0) * 0.08 * exp(-pow((p.x - wall * 0.9) / 0.02, 2.0));
    col = inside;
    col = mix(col, vec3(0.05, 0.06, 0.08) + liq * 0.1, smoothstep(bottom, bottom - 0.004, p.y));
  }
  col += vec3(0.6) * exp(-pow((ax - wall) / 0.004, 2.0)) * step(bottom - 0.03, p.y);
  fragColor = vec4(finish(col, fc, 1.1 + L * 0.3, 1.2), 1.0);
}`;

// ── 7. Liquid Silk — a glossy liquid satin of flowing colour ──
const FLUID_SILK = `
void main(){
  BANDS
  float t = iTime;
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  VOCAL
  float seed = iParam3 * 7.0;
  vec2 x = (p + VR.yz * 0.06) * 1.3;
  int steps = traceSteps(8.0, 20.0);
  float dt = 2.0 / float(steps);
  float flow = (0.45 + iParam0 * 0.7) * (1.0 + B * 0.12);
  for (int i = 0; i < 20; i++){
    if (i >= steps) break;
    float tk = t * 0.35 - float(i) * dt * 0.6;
    x -= curlFlow(x * 0.8 + seed, tk) * flow * dt;
  }
  float ph = x.y * 0.9 + fbm(x * 1.1 + seed, 4) * 1.4 + M * 0.04;
  float band = fract(ph * 1.2);
  vec3 a3 = band < 0.333 ? iC0 : band < 0.666 ? iC1 : iC2;
  vec3 b3 = band < 0.333 ? iC1 : band < 0.666 ? iC2 : iC0;
  vec3 base = mix(a3, b3, smoothstep(0.24, 0.333, mod(band, 0.333)));
  // Surface: thick paint swells where the bands meet; a glossy clear coat on top.
  float h = sin(ph * TAU * 1.2) * 0.5 + fbm(x * 3.0 + 5.0, 3) * 0.6;
  vec3 N = screenNormal(h * 0.012, 1.0);
  vec3 L1 = normalize(vec3(-0.5, 0.6, 0.75));
  vec3 Hh = normalize(L1 + vec3(0.0, 0.0, 1.0));
  float diff = 0.35 + 0.65 * max(dot(N, L1), 0.0);
  float spec = pow(max(dot(N, Hh), 0.0), 120.0);
  vec3 R = reflect(vec3(0.0, 0.0, -1.0), N);
  float softbox = smoothstep(0.55, 0.75, R.y * 0.5 + 0.5) * smoothstep(0.9, 0.6, abs(R.x * 1.4 - 0.2)) * 0.18;
  vec3 col = base * diff;
  col += vec3(1.0) * (spec * (0.9 + T * 0.6) + softbox);
  col *= 0.92 + B * 0.15;
  col = applyRipples(col, VR);
  col *= vignette(p, 0.3);
  fragColor = vec4(finish(col, fc, 1.0 + L * 0.25, 1.2), 1.0);
}`;

// ── 8. Shear Billows — Kelvin–Helmholtz roll-ups between three layers ──
const FLUID_SHEAR = `
vec2 shearVel(vec2 x, float tk, float G){
  float U = 0.14 * (tanh((x.y - 0.22) / 0.06) - tanh((x.y + 0.22) / 0.06) + 1.0);
  vec2 v = vec2(U, 0.0);
  float lam = 0.55;
  float xa = mod(x.x - tk * 0.03, lam) - lam * 0.5;
  float xb = mod(x.x + tk * 0.025 + 0.2, lam) - lam * 0.5;
  for (int k = -1; k <= 1; k++){
    float fk = float(k) * lam;
    v += lambOseen(vec2(xa - fk, x.y - 0.22 - 0.015 * sin(tk * 0.2)), -G, 0.006);
    v += lambOseen(vec2(xb - fk, x.y + 0.22 + 0.015 * sin(tk * 0.17)), G, 0.006);
  }
  return v;
}
void main(){
  BANDS
  float t = iTime;
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  VOCAL
  vec2 x = p + VR.yz * 0.06;
  int steps = traceSteps(18.0, 40.0);
  float dt = 3.0 / float(steps);
  float G = 0.154 * (0.6 + iParam0 * 0.9) * (1.0 + M * 0.15);
  for (int i = 0; i < 40; i++){
    if (i >= steps) break;
    float tk = t * 0.5 - float(i) * dt;
    vec2 v = shearVel(x, tk, G);
    float sy = sin(x.y * 9.0 + tk * 0.7 + iParam3 * 5.0), cx = sin(x.x * 8.0 - tk * 0.6);
    v += 0.022 * vec2(cos(x.y * 9.0 + tk * 0.7 + iParam3 * 5.0) * cx, -sy * cos(x.x * 8.0 - tk * 0.6) * 0.89);
    x -= v * dt;
  }
  float y = x.y;
  vec3 col = mix(iC2, iC1, smoothstep(-0.235, -0.205, y));
  col = mix(col, iC0, smoothstep(0.205, 0.235, y));
  float stri = fbm(vec2(x.x * 2.0, y * 38.0), 4);
  col *= 0.62 + 0.55 * stri;
  float lineA = exp(-pow((y - 0.25) / 0.008, 2.0)) + exp(-pow((y - 0.19) / 0.006, 2.0)) * 0.6;
  float lineB = exp(-pow((y + 0.25) / 0.008, 2.0)) + exp(-pow((y + 0.19) / 0.006, 2.0)) * 0.6;
  col += mix(iC0, vec3(1.0), 0.55) * lineA * 0.7 + mix(iC2, vec3(1.0), 0.55) * lineB * 0.7;
  float lum = dot(col, LUMA);
  vec3 N = screenNormal(lum * 0.01, 1.0);
  col *= 0.8 + 0.25 * N.z + 0.15 * N.y;
  col *= 0.88 + B * 0.2;
  col += vec3(1.0) * pow(max(N.y * 0.5 + N.x * 0.3, 0.0), 6.0) * 0.4 * (0.5 + T);
  col = applyRipples(col, VR);
  col *= vignette(p, 0.35);
  fragColor = vec4(finish(col, fc, 1.0 + L * 0.25, 1.22), 1.0);
}`;

// ── 9. Convection Cells — heated dye layers rolling over in a shallow tank ──
const FLUID_CONVECTION = `
void main(){
  BANDS
  float t = iTime;
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  VOCAL
  vec2 x = p + VR.yz * 0.06;
  int steps = traceSteps(18.0, 40.0);
  float dt = 4.2 / float(steps);
  float A = 0.075 * (0.5 + iParam0) * (1.0 + B * 0.15);
  float lam = 0.36 + iParam3 * 0.14;
  float k = PI / lam;
  for (int i = 0; i < 40; i++){
    if (i >= steps) break;
    float tk = t * 0.45 - float(i) * dt;
    float s = k * (x.x - 0.12 * sin(0.33 * tk));
    float cy = PI * (x.y + 0.5);
    vec2 v = vec2(A * sin(s) * PI * cos(cy), -A * k * cos(s) * sin(cy));
    float s2 = 2.0 * k * (x.x + 0.07 * sin(0.21 * tk + 1.0)) + 1.3;
    v += 0.35 * vec2(A * sin(s2) * 2.0 * PI * cos(2.0 * cy), -A * 2.0 * k * cos(s2) * sin(2.0 * cy));
    v += 0.012 * vec2(cos(x.y * 11.0 + tk * 0.5) * sin(x.x * 10.0 - tk * 0.4), -sin(x.y * 11.0 + tk * 0.5) * cos(x.x * 10.0 - tk * 0.4) * 0.91);
    x -= v * dt;
  }
  float y = x.y;
  vec3 col = mix(iC0, iC1, smoothstep(-0.22, -0.16, y));
  col = mix(col, vec3(0.02, 0.02, 0.04), smoothstep(-0.03, 0.0, y) * smoothstep(0.06, 0.03, y));
  col = mix(col, iC2, smoothstep(0.03, 0.09, y));
  col = mix(col, mix(iC2, iC1, 0.35), smoothstep(0.30, 0.38, y));
  float stri = fbm(vec2(x.x * 3.0, y * 46.0), 4);
  col *= 0.6 + 0.6 * stri;
  float heat = exp(-(p.y + 0.5) * 9.0);
  col += iC0 * heat * (0.35 + B * 0.35);
  col += mix(iC1, vec3(1.0), 0.4) * pow(stri, 6.0) * (0.25 + T * 0.4);
  vec3 N = screenNormal(dot(col, LUMA) * 0.008, 1.0);
  col *= 0.82 + 0.25 * N.z;
  col *= 1.0 - 0.6 * exp(-(0.5 - p.y) * 30.0);
  col += vec3(0.7, 0.75, 0.85) * exp(-pow((p.y - 0.47) / 0.004, 2.0)) * 0.4;
  col = applyRipples(col, VR);
  col *= vignette(p, 0.3);
  fragColor = vec4(finish(col, fc, 1.05 + L * 0.25, 1.2), 1.0);
}`;

// ── 10. Caustic Bowl — dyes swirling under a rippling surface, seen from above ──
const FLUID_CAUSTIC = `
void waves(vec2 x, float t, float amp, float hi, out vec2 g, out vec3 hs){
  g = vec2(0.0); hs = vec3(0.0);
  for (int i = 0; i < 7; i++){
    float fi = float(i);
    float ang = fi * 2.39996 + iParam3 * 3.0;
    float kk = 9.0 + fi * 4.5;
    vec2 k = kk * vec2(cos(ang), sin(ang));
    float a = amp * 0.010 / (1.0 + fi * 0.6) * (i >= 4 ? hi : 1.0);
    float w = sqrt(9.8 * kk) * 0.12;
    float ph = dot(k, x) - w * t + fi * 1.7;
    float c = cos(ph), s = sin(ph);
    g += a * c * k;
    hs += -a * s * vec3(k.x * k.x, k.x * k.y, k.y * k.y);
  }
}
void main(){
  BANDS
  float t = iTime;
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  VOCAL
  float R = 0.47;
  float r = length(p);
  vec3 col = vec3(0.010, 0.011, 0.015) * (1.0 - 0.4 * dot(p, p));
  if (r < R + 0.02){
    int oct = detailOct(3.0, 6.0);
    float amp = (0.6 + iParam0 * 0.9) * (1.0 + B * 0.5);
    vec2 g; vec3 hs;
    waves(p, t, amp, 1.0 + T * 0.8, g, hs);
    g += VR.yz * 1.2;                              // the voice ripples the surface: caustics bend with it
    float depth = 0.55;
    vec2 xf = p + g * depth;
    float j11 = 1.0 + depth * hs.x, j12 = depth * hs.y, j22 = 1.0 + depth * hs.z;
    float det = j11 * j22 - j12 * j12;
    float caust = clamp(1.0 / max(abs(det), 0.04), 0.0, 8.0);
    vec2 x = xf;
    int steps = traceSteps(8.0, 18.0);
    float dt = 2.0 / float(steps);
    for (int i = 0; i < 18; i++){
      if (i >= steps) break;
      float tk = t * 0.3 - float(i) * dt;
      vec2 v = curlFlow(x * 2.2 + 3.0, tk) * 0.18 * (1.0 + M * 0.2) + gaussVortex(x, 0.35 * sin(tk * 0.07), 0.08);
      x -= v * dt * smoothstep(R, R - 0.06, length(x));
    }
    float n = fbm(x * 2.6, oct);
    float n2 = fbm(x * 3.4 + 7.0, oct);
    vec3 dye = ramp(smoothstep(0.25, 0.80, n));
    dye = mix(dye, iC2, smoothstep(0.55, 0.85, n2) * 0.8);
    float clouds = smoothstep(0.30, 0.60, n);
    vec3 floorCol = mix(vec3(0.05, 0.06, 0.08), dye, 0.35 + 0.65 * clouds);
    vec3 inside = floorCol * (0.12 + 0.5 * caust) * (1.0 + B * 0.25);
    vec3 nrm = normalize(vec3(-g * 1.5, 1.0));
    vec3 Rv = reflect(vec3(0.0, 0.0, -1.0), nrm);
    float glint = pow(max(dot(Rv, normalize(vec3(-0.25, 0.35, 1.0))), 0.0), 260.0);
    inside += vec3(1.0) * glint * (0.8 + T * 1.2);
    inside = applyRipples(inside, VR);
    inside *= 1.0 - 0.45 * smoothstep(R - 0.14, R, r);
    inside += vec3(0.8, 0.9, 1.0) * exp(-(R - r) * 80.0) * 0.15;
    vec3 rim = vec3(0.65) * exp(-pow((r - R - 0.006) / 0.004, 2.0)) + iC0 * 0.05;
    col = mix(col, r < R ? inside : rim, smoothstep(R + 0.02, R + 0.014, r));
  }
  col += iC0 * 0.03 * exp(-max(r - R, 0.0) * 10.0) * step(R, r);
  fragColor = vec4(finish(col, fc, 1.1 + L * 0.3, 1.2), 1.0);
}`;

export const FLUID_GLSL: Record<string, string> = {
  FLUID_INK: FLUID_LIB + FLUID_INK,
  FLUID_MARBLE: FLUID_LIB + FLUID_MARBLE,
  FLUID_LAMP: FLUID_LIB + FLUID_LAMP,
  FLUID_OILFILM: FLUID_LIB + FLUID_OILFILM,
  FLUID_VORTEX: FLUID_LIB + FLUID_VORTEX,
  FLUID_DENSITY: FLUID_LIB + FLUID_DENSITY,
  FLUID_SILK: FLUID_LIB + FLUID_SILK,
  FLUID_SHEAR: FLUID_LIB + FLUID_SHEAR,
  FLUID_CONVECTION: FLUID_LIB + FLUID_CONVECTION,
  FLUID_CAUSTIC: FLUID_LIB + FLUID_CAUSTIC,
};

/** Long advection traces render at 3/4 size: the dye fields are smooth, the upscale is invisible. */
export const FLUID_RENDER_SCALE: Record<string, number> = {
  FLUID_INK: 0.75,
  FLUID_MARBLE: 0.75,
  FLUID_OILFILM: 0.75,
  FLUID_VORTEX: 0.75,
  FLUID_SHEAR: 0.75,
  FLUID_CONVECTION: 0.75,
  FLUID_SILK: 0.75,
};
