// generatorsFluidSim — the look of each FLUID_* generator, rendered from the live simulation
// (fluidSim.ts). Composed as HEADER + CEL_COMMON + LOOK_LIB + body.
//
//   iChannel1  dye: ink concentrations / film thickness / temperature / material coordinates
//   iChannel2  velocity (aspect-space units per second)
//   iChannel3  wave height (r) — real ripples from the damped wave equation
//
// The waves are part of the liquid: their slope refracts the dye seen through them, tilts the
// surface normal for highlights, and their curvature focuses light into caustics (the Jacobian
// of the refraction map, det(I + d·∇∇h), going to zero is where the bright lines form).

const LOOK_LIB = `
uniform sampler2D iChannel1, iChannel2, iChannel3;
uniform vec2 iSimTexel;
float aspectR(){ return iResolution.x / max(iResolution.y, 1.0); }
float waveH(vec2 uv){ return texture(iChannel3, uv).r; }
// (height, ∂h/∂x, ∂h/∂y) in aspect-space units
vec3 waveField(vec2 uv){
  vec2 e = iSimTexel;
  float hL = waveH(uv - vec2(e.x, 0.0)), hR = waveH(uv + vec2(e.x, 0.0));
  float hB = waveH(uv - vec2(0.0, e.y)), hT = waveH(uv + vec2(0.0, e.y));
  return vec3(waveH(uv), (hR - hL) / (2.0 * e.x * aspectR()), (hT - hB) / (2.0 * e.y));
}
// Light focused by the wave surface onto a floor at depth d.
float waveCaustic(vec2 uv, float d){
  vec2 e = iSimTexel; float ex = e.x * aspectR(), ey = e.y;
  float h = waveH(uv);
  float hxx = (waveH(uv + vec2(e.x, 0.0)) + waveH(uv - vec2(e.x, 0.0)) - 2.0 * h) / (ex * ex);
  float hyy = (waveH(uv + vec2(0.0, e.y)) + waveH(uv - vec2(0.0, e.y)) - 2.0 * h) / (ey * ey);
  float hxy = (waveH(uv + e) - waveH(uv + vec2(e.x, -e.y)) - waveH(uv + vec2(-e.x, e.y)) + waveH(uv - e)) / (4.0 * ex * ey);
  float det = (1.0 + d * hxx) * (1.0 + d * hyy) - d * d * hxy * hxy;
  return clamp(1.0 / max(abs(det), 0.06), 0.0, 6.0);
}
vec3 waveNormal(vec3 wf, float k){ return normalize(vec3(-wf.yz * k, 1.0)); }
float waveGlint(vec3 N){ vec3 R = reflect(vec3(0.0, 0.0, -1.0), N); return pow(max(dot(R, normalize(vec3(-0.35, 0.5, 1.0))), 0.0), 140.0); }
float waveShade(vec3 N){ return dot(N.xy, vec2(-0.45, 0.6)); }
// What you see through a sloped surface is shifted along the slope.
vec2 refractUv(vec2 uv, vec3 wf, float k){ return uv - wf.yz * k * vec2(1.0 / aspectR(), 1.0); }
vec4 dyeAt(vec2 uv){ return texture(iChannel1, uv); }
vec2 velAt(vec2 uv){ return texture(iChannel2, uv).xy; }
vec2 uvOf(vec2 p){ return vec2(p.x / aspectR() + 0.5, p.y + 0.5); }
vec3 screenNormal(float h, float k){ return normalize(vec3(-dFdx(h) * iResolution.y * k, -dFdy(h) * iResolution.y * k, 1.0)); }
// Surface wave lighting shared by every look.
vec3 surfaceLight(vec3 col, vec3 N, float shade, float glint){ return col * (1.0 + waveShade(N) * shade) + vec3(1.0) * waveGlint(N) * glint; }
`;

// ── 1. Ink Bloom ──
const INK = `
void main(){
  BANDS
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  vec3 wf = waveField(vUv);
  vec3 N = waveNormal(wf, 0.02);
  vec4 d = dyeAt(refractUv(vUv, wf, 0.0003));
  float total = d.r + d.g + d.b;
  vec3 hue = (d.r * iC0 + d.g * iC1 + d.b * iC2) / max(total, 1e-4);
  float dens = 1.0 - exp(-total * 1.5);
  float edge = clamp(length(vec2(dFdx(dens), dFdy(dens))) * iResolution.y * 0.012, 0.0, 1.0);
  vec3 col = vec3(0.006, 0.008, 0.016) + vec3(0.02, 0.025, 0.04) * exp(-dot(p, p) * 2.5);
  col = mix(col, hue * (0.45 + 0.85 * dens) * (1.0 + B * 0.25), dens);
  col += mix(hue, vec3(1.0), 0.35) * edge * (0.3 + M * 0.3);
  col += hue * pow(dens, 4.0) * 0.2 * (1.0 + T);
  col = surfaceLight(col, N, 0.6, 0.5);
  col *= vignette(p, 0.3);
  fragColor = vec4(finish(col, fc, 1.15 + L * 0.3, 1.25), 1.0);
}`;

// ── 2. Marbled Pour ── (material coordinates → a five-colour pour with silicone cells)
const MARBLE = `
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
vec3 pourColour(float s){ s = fract(s) * 5.0; float i = floor(s); return mix(pourCol(i), pourCol(mod(i + 1.0, 5.0)), smoothstep(0.80, 1.0, fract(s))); }
void main(){
  BANDS
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  vec3 wf = waveField(vUv);
  vec2 c = dyeAt(refractUv(vUv, wf, 0.0003)).rg * 1.25 + iParam3 * 3.0;
  float s = c.y * 1.1 + c.x * 0.35 + fbm(c * 1.3, 4) * 0.8;
  vec3 base = pourColour(s), under = pourColour(s + 0.41);
  vec2 cv = vor(c * 7.0 + 3.0);
  float zone = clamp(smoothstep(0.50, 0.68, fbm(c * 1.6 + 9.0, 3)) * (0.2 + iParam3 * 1.1), 0.0, 1.0);
  float inCell = smoothstep(0.32, 0.27, cv.x) * zone;
  float lace = exp(-pow((cv.x - 0.30) / 0.025, 2.0)) * zone;
  vec3 col = mix(base, under, inCell);
  col = mix(col, vec3(0.97, 0.95, 0.90), lace * 0.85);
  float h = dot(col, LUMA) * 0.012 + inCell * 0.006 + lace * 0.004;
  vec3 N = normalize(screenNormal(h, 1.0) + vec3(-wf.yz * 0.02, 0.0));
  vec3 R = reflect(vec3(0.0, 0.0, -1.0), N);
  float spec = pow(max(dot(R, normalize(vec3(-0.35, 0.45, 1.0))), 0.0), 90.0);
  col *= (0.82 + 0.18 * N.z) * (1.0 + B * 0.12);
  col += vec3(1.0) * spec * (0.55 + T * 0.5);
  col *= vignette(p, 0.25);
  fragColor = vec4(finish(col, fc, 1.05 + L * 0.25, 1.2), 1.0);
}`;

// ── 3. Lumen Lamp ── (wax blobs carried by the convecting liquid; ripples through the glass)
const LAMP = `
void main(){
  BANDS
  float t = iTime;
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  float wall = 0.40, ax = abs(p.x);
  vec3 col = vec3(0.008, 0.006, 0.012) + iC2 * 0.06 * exp(-ax * 3.0) * (1.0 + B * 0.5);
  col += mix(iC0, iC1, 0.5) * 0.03 * exp(-ax * 2.0);
  if (ax < wall + 0.03){
    vec3 wf = waveField(vUv);
    float xn = clamp(p.x / wall, -1.0, 1.0);
    vec2 q = vec2(asin(xn) / (PI * 0.5) * wall * 0.92, p.y) - wf.yz * 0.0004;
    int n = int(floor(mix(5.0, 10.0, iParam1) + 0.5));
    float size = mix(0.06, 0.11, iParam0);
    float F = 0.0, wA = 0.0, wB = 0.0;
    vec2 grad = vec2(0.0);
    for (int i = 0; i < 10; i++){
      if (i >= n) break;
      float fi = float(i);
      float hs = h21(vec2(fi, 3.0 + iParam3 * 7.0)), hs2 = h21(vec2(fi, 9.1 + iParam3 * 3.0));
      float period = 40.0 + hs * 34.0;
      float ph = fract(t / period + hs2);
      vec2 bc = vec2((hs - 0.5) * 0.48 + 0.06 * sin(t * 0.09 + fi * 1.7), -0.62 + 1.24 * (0.5 - 0.5 * cos(ph * TAU)));
      bc += velAt(uvOf(bc)) * 0.35;                             // the liquid nudges the wax
      float rad = size * (0.6 + 0.8 * h21(vec2(fi, 5.5)));
      vec2 d = q - bc;
      d.y /= 1.0 + 0.35 * abs(sin(ph * TAU));
      float dd = dot(d, d) + 1e-4, c = rad * rad / dd;
      F += c; grad += -2.0 * c * d / dd;
      if (mod(fi, 2.0) < 0.5) wA += c; else wB += c;
    }
    float poolY = -0.44 + 0.025 * sin(q.x * 11.0 + t * 0.15) + 0.015 * sin(q.x * 23.0 - t * 0.11);
    float pool = smoothstep(0.03, -0.05, q.y - poolY) * 1.6;
    F += pool; wA += pool * 0.5; wB += pool * 0.5; grad.y -= pool * 8.0;
    float blob = smoothstep(0.92, 1.08, F);
    vec3 wax = mix(iC0, iC1, wB / (wA + wB + 1e-4));
    vec3 Nb = normalize(vec3(-grad * 0.028, 1.0));
    float heatY = 0.55 + 0.45 * smoothstep(0.5, -0.5, q.y);
    float diff = clamp(dot(Nb, normalize(vec3(0.0, -0.55, 0.8))), 0.0, 1.0);
    float sss = pow(clamp(F - 1.0, 0.0, 3.0) / 3.0, 0.6);
    vec3 waxCol = wax * (0.35 + 0.9 * diff + 0.5 * sss) * heatY * (1.0 + B * 0.35);
    waxCol += mix(wax, vec3(1.0), 0.5) * pow(1.0 - Nb.z, 2.0) * 0.5;
    float heat = dyeAt(uvOf(q)).a;
    vec3 liquid = iC2 * (0.10 + 0.28 * heatY * heatY + heat * 0.25) * (1.0 + B * 0.4) + wax * 0.08 * smoothstep(0.35, 1.0, F);
    vec3 inside = mix(liquid, waxCol, blob);
    inside = surfaceLight(inside, waveNormal(wf, 0.02), 0.5, 0.4);
    float edge = ax / wall;
    inside *= 1.0 - 0.5 * pow(edge, 6.0);
    inside += vec3(1.0) * 0.4 * exp(-pow((p.x + wall * 0.72) / 0.010, 2.0)) * (0.7 + 0.3 * sin(p.y * 3.0 + 1.0));
    inside += vec3(1.0) * 0.14 * exp(-pow((p.x - wall * 0.80) / 0.025, 2.0));
    vec3 glassEdge = iC2 * 0.12 + vec3(0.55) * exp(-pow((ax - wall - 0.012) / 0.006, 2.0));
    col = mix(col, ax < wall ? inside : glassEdge, smoothstep(wall + 0.03, wall + 0.024, ax));
  }
  fragColor = vec4(finish(col, fc, 1.1 + L * 0.3, 1.2), 1.0);
}`;

// ── 4. Iridescent Oil ── (film thickness carried by the water; voice drops more oil)
const OIL = `
void main(){
  BANDS
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  vec3 wf = waveField(vUv);
  vec4 d = dyeAt(refractUv(vUv, wf, 0.0003));
  float thick = d.r, slick = clamp(d.g, 0.0, 1.0);
  float dnm = mix(60.0, 820.0, clamp(thick, 0.0, 1.0)) * (0.65 + iParam3 * 0.7) + M * 60.0;
  vec3 film = vec3(0.0), wsum = vec3(0.0);
  for (int i = 0; i < 8; i++){
    float lam = 400.0 + float(i) * 42.0;
    float refl = 0.5 - 0.5 * cos(4.0 * PI * 1.40 * dnm / lam);
    vec3 cmf = vec3(exp(-pow((lam - 600.0) / 55.0, 2.0)) + 0.35 * exp(-pow((lam - 430.0) / 30.0, 2.0)),
                    exp(-pow((lam - 545.0) / 50.0, 2.0)), exp(-pow((lam - 450.0) / 38.0, 2.0)));
    film += refl * cmf; wsum += cmf;
  }
  film = saturate3(film / wsum, 1.6);
  film = mix(film, film * mix(iC1, iC2, smoothstep(0.3, 0.7, thick)) * 2.0, 0.2);
  vec3 N = normalize(screenNormal(thick * 0.03, 1.0) + vec3(-wf.yz * 0.02, 0.0));
  vec3 R = reflect(vec3(0.0, 0.0, -1.0), N);
  float box = smoothstep(-0.2, 0.6, R.y + p.y * 0.4) * 0.6 + 0.4;
  float spec = pow(max(dot(R, normalize(vec3(0.3, 0.5, 1.0))), 0.0), 120.0);
  vec3 water = iC0 * 0.10 + vec3(0.02, 0.025, 0.035) * box;
  vec3 col = mix(water, iC0 * 0.08 + film * box * (1.05 + B * 0.3), slick);
  col += vec3(1.0) * spec * (0.45 + T * 0.8);
  col *= vignette(p, 0.3);
  fragColor = vec4(finish(col, fc, 1.0 + L * 0.3, 1.25), 1.0);
}`;

// ── 5. Stirred Dye ── (round dish; ripples reflect off its wall)
const VORTEX = `
void main(){
  BANDS
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  float R = 0.46, r = length(p);
  vec3 col = vec3(0.010, 0.010, 0.014) * (1.0 - 0.5 * dot(p, p));
  col += mix(iC0, iC1, 0.5) * 0.04 * exp(-max(r - R, 0.0) * 12.0) * step(R, r);
  if (r < R + 0.02){
    vec3 wf = waveField(vUv);
    vec3 conc = dyeAt(refractUv(vUv, wf, 0.0003)).rgb;
    float total = conc.x + conc.y + conc.z;
    vec3 hue = (conc.x * iC0 + conc.y * iC1 + conc.z * iC2) / max(total, 1e-4);
    float dens = 1.0 - exp(-total * 2.2);
    vec3 inside = mix(vec3(0.012, 0.014, 0.022), hue * (0.6 + 0.7 * dens) * (1.0 + B * 0.3), dens);
    inside += hue * clamp(length(vec2(dFdx(dens), dFdy(dens))) * iResolution.y * 0.01, 0.0, 1.0) * 0.3;
    inside = surfaceLight(inside, waveNormal(wf, 0.02), 0.6, 0.6);
    inside += vec3(1.0) * exp(-dot(p - vec2(-0.15, 0.17), p - vec2(-0.15, 0.17)) / 0.004) * 0.10 * (0.8 + T * 0.6);
    inside += vec3(0.8, 0.85, 1.0) * exp(-(R - r) * 70.0) * 0.18;
    inside *= 1.0 - 0.35 * smoothstep(R - 0.12, R, r);
    vec3 rim = vec3(0.6) * exp(-pow((r - R - 0.006) / 0.004, 2.0)) + mix(iC0, iC1, 0.5) * 0.06;
    col = mix(col, r < R ? inside : rim, smoothstep(R + 0.02, R + 0.014, r));
  }
  fragColor = vec4(finish(col, fc, 1.1 + L * 0.3, 1.22), 1.0);
}`;

// ── 6. Density Column ── (a stratified liquid: every parcel remembers its height and springs back,
//     so a push sets off real internal waves between the layers)
const DENSITY = `
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
  float wall = 0.64, top = 0.36, bottom = -0.42;
  float seed = iParam3 * 6.0;
  vec3 col = vec3(0.008, 0.009, 0.014) + vec3(0.03, 0.035, 0.05) * exp(-dot(p, p) * 3.0);
  float ax = abs(p.x);
  if (ax < wall && p.y > bottom - 0.03){
    vec3 wf = waveField(vUv);
    float xn = p.x / wall;
    float s = dyeAt(refractUv(vUv, wf, 0.0002)).g;          // the height this parcel started at
    float level = clamp((s - bottom) / (top - bottom) * 7.0, 0.0, 6.999);
    float li = floor(level), lf = fract(level);
    vec3 liq = mix(layerCol(li), layerCol(min(li + 1.0, 6.0)), smoothstep(0.82, 1.0, lf));
    float line = exp(-pow(min(lf, 1.0 - lf) / 0.02, 2.0));
    float back = 0.55 + 0.45 * exp(-p.x * p.x * 2.2);
    vec3 inside = liq * back * (0.62 + 0.38 * lf) * (0.95 + B * 0.25);
    inside += vec3(1.0) * line * 0.07 * (1.0 + M * 0.6);
    for (int j = 0; j < 12; j++){
      float fj = float(j);
      float hb = h21(vec2(fj, 1.7 + seed)), hb2 = h21(vec2(fj, 8.3));
      vec2 b = vec2((hb - 0.5) * 1.1 + 0.01 * sin(t * 0.8 + fj), bottom + fract(t * (0.012 + 0.018 * hb2) + hb2) * (top - bottom));
      b += velAt(uvOf(b)) * 0.4;
      float rb = 0.005 + 0.007 * hb, d = length(p - b);
      float ring = smoothstep(rb, rb - 0.002, d) * (0.25 + 0.75 * smoothstep(rb * 0.5, rb, d));
      vec2 hlp = p - b - vec2(-0.3, 0.3) * rb;
      inside += vec3(1.0) * (ring * 0.25 + exp(-dot(hlp, hlp) / (rb * rb * 0.05)) * 0.6) * (0.6 + T * 0.8);
    }
    inside = surfaceLight(inside, waveNormal(wf, 0.012), 0.4, 0.25);
    float topEta = wf.x * 0.03;
    float above = smoothstep(top + topEta - 0.002, top + topEta + 0.002, p.y);
    inside = mix(inside, vec3(0.012, 0.014, 0.02), above);
    inside += vec3(0.9, 0.95, 1.0) * exp(-pow((p.y - top - topEta) / 0.003, 2.0)) * 0.5;
    inside *= 0.55 + 0.45 * sqrt(max(1.0 - xn * xn, 0.0));
    inside += vec3(1.0) * 0.14 * exp(-pow((xn + 0.55) / 0.06, 2.0));
    inside += vec3(1.0) * 0.18 * exp(-pow((p.x + wall * 0.88) / 0.006, 2.0));
    inside += vec3(1.0) * 0.08 * exp(-pow((p.x - wall * 0.9) / 0.02, 2.0));
    col = mix(inside, vec3(0.05, 0.06, 0.08) + liq * 0.1, smoothstep(bottom, bottom - 0.004, p.y));
  }
  col += vec3(0.6) * exp(-pow((ax - wall) / 0.004, 2.0)) * step(bottom - 0.03, p.y);
  fragColor = vec4(finish(col, fc, 1.1 + L * 0.3, 1.2), 1.0);
}`;

// ── 7. Liquid Silk ── (glossy paint bands on the material coordinates)
const SILK = `
void main(){
  BANDS
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  vec3 wf = waveField(vUv);
  vec2 x = dyeAt(refractUv(vUv, wf, 0.0003)).rg * 1.3 + iParam3 * 7.0;
  float ph = x.y * 0.9 + fbm(x * 1.1, 4) * 1.4 + M * 0.04;
  float band = fract(ph * 1.2);
  vec3 a3 = band < 0.333 ? iC0 : band < 0.666 ? iC1 : iC2;
  vec3 b3 = band < 0.333 ? iC1 : band < 0.666 ? iC2 : iC0;
  vec3 base = mix(a3, b3, smoothstep(0.24, 0.333, mod(band, 0.333)));
  float h = sin(ph * TAU * 1.2) * 0.5 + fbm(x * 3.0 + 5.0, 3) * 0.6;
  vec3 N = normalize(screenNormal(h * 0.012, 1.0) + vec3(-wf.yz * 0.02, 0.0));
  vec3 L1 = normalize(vec3(-0.5, 0.6, 0.75));
  float diff = 0.35 + 0.65 * max(dot(N, L1), 0.0);
  float spec = pow(max(dot(N, normalize(L1 + vec3(0.0, 0.0, 1.0))), 0.0), 120.0);
  vec3 R = reflect(vec3(0.0, 0.0, -1.0), N);
  float softbox = smoothstep(0.55, 0.75, R.y * 0.5 + 0.5) * smoothstep(0.9, 0.6, abs(R.x * 1.4 - 0.2)) * 0.18;
  vec3 col = base * diff + vec3(1.0) * (spec * (0.9 + T * 0.6) + softbox);
  col *= (0.92 + B * 0.15) * vignette(p, 0.3);
  fragColor = vec4(finish(col, fc, 1.0 + L * 0.25, 1.2), 1.0);
}`;

// ── 8. Shear Billows ── (real Kelvin–Helmholtz instability: the sim relaxes toward a
//     three-layer shear flow, the interfaces go unstable and roll up)
const SHEAR = `
void main(){
  BANDS
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  vec3 wf = waveField(vUv);
  vec2 x = dyeAt(refractUv(vUv, wf, 0.0002)).rg;
  float y = x.y;
  vec3 col = mix(iC2, iC1, smoothstep(-0.235, -0.205, y));
  col = mix(col, iC0, smoothstep(0.205, 0.235, y));
  float stri = fbm(vec2(x.x * 2.0, y * 38.0) + iParam3 * 5.0, 4);
  col *= 0.62 + 0.55 * stri;
  float lineA = exp(-pow((y - 0.25) / 0.008, 2.0)) + exp(-pow((y - 0.19) / 0.006, 2.0)) * 0.6;
  float lineB = exp(-pow((y + 0.25) / 0.008, 2.0)) + exp(-pow((y + 0.19) / 0.006, 2.0)) * 0.6;
  col += mix(iC0, vec3(1.0), 0.55) * lineA * 0.7 + mix(iC2, vec3(1.0), 0.55) * lineB * 0.7;
  vec3 N = normalize(screenNormal(dot(col, LUMA) * 0.01, 1.0) + vec3(-wf.yz * 0.015, 0.0));
  col *= 0.8 + 0.25 * N.z + 0.15 * N.y;
  col *= 0.88 + B * 0.2;
  col += vec3(1.0) * pow(max(N.y * 0.5 + N.x * 0.3, 0.0), 6.0) * 0.4 * (0.5 + T);
  col = surfaceLight(col, waveNormal(wf, 0.015), 0.3, 0.3);
  col *= vignette(p, 0.35);
  fragColor = vec4(finish(col, fc, 1.0 + L * 0.25, 1.22), 1.0);
}`;

// ── 9. Convection Cells ── (Rayleigh–Bénard: heated below, cooled above; buoyant plumes
//     carry the dye layers up and over)
const CONVECTION = `
void main(){
  BANDS
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  vec3 wf = waveField(vUv);
  vec4 d = dyeAt(refractUv(vUv, wf, 0.0002));
  vec2 x = d.rg;
  float temp = d.a, y = x.y;
  vec3 col = mix(iC0, iC1, smoothstep(-0.22, -0.16, y));
  col = mix(col, vec3(0.02, 0.02, 0.04), smoothstep(-0.03, 0.0, y) * smoothstep(0.06, 0.03, y));
  col = mix(col, iC2, smoothstep(0.03, 0.09, y));
  col = mix(col, mix(iC2, iC1, 0.35), smoothstep(0.30, 0.38, y));
  float stri = fbm(vec2(x.x * 3.0, y * 46.0) + iParam3 * 4.0, 4);
  col *= 0.6 + 0.6 * stri;
  col *= 0.75 + 0.5 * clamp(temp, 0.0, 1.0);                       // hot plumes glow
  col += iC0 * smoothstep(0.65, 1.0, temp) * (0.25 + B * 0.3);
  col += mix(iC1, vec3(1.0), 0.4) * pow(stri, 6.0) * (0.25 + T * 0.4);
  vec3 N = normalize(screenNormal(dot(col, LUMA) * 0.008, 1.0) + vec3(-wf.yz * 0.015, 0.0));
  col *= 0.82 + 0.25 * N.z;
  col = surfaceLight(col, waveNormal(wf, 0.015), 0.3, 0.3);
  col *= 1.0 - 0.6 * exp(-(0.5 - p.y) * 30.0);
  col += vec3(0.7, 0.75, 0.85) * exp(-pow((p.y - 0.47) / 0.004, 2.0)) * 0.4;
  col *= vignette(p, 0.3);
  fragColor = vec4(finish(col, fc, 1.05 + L * 0.25, 1.2), 1.0);
}`;

// ── 10. Caustic Bowl ── (rain of voice drops on a bowl of dyed water; caustics on the floor)
const CAUSTIC = `
void waves(vec2 x, float t, float amp, float hi, out vec2 g, out vec3 hs){
  g = vec2(0.0); hs = vec3(0.0);
  for (int i = 0; i < 7; i++){
    float fi = float(i);
    float ang = fi * 2.39996 + iParam3 * 3.0;
    float kk = 9.0 + fi * 4.5;
    vec2 k = kk * vec2(cos(ang), sin(ang));
    float a = amp * 0.010 / (1.0 + fi * 0.6) * (i >= 4 ? hi : 1.0);
    float ph = dot(k, x) - sqrt(9.8 * kk) * 0.12 * t + fi * 1.7;
    g += a * cos(ph) * k;
    hs += -a * sin(ph) * vec3(k.x * k.x, k.x * k.y, k.y * k.y);
  }
}
void main(){
  BANDS
  float t = iTime;
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  float R = 0.47, r = length(p);
  vec3 col = vec3(0.010, 0.011, 0.015) * (1.0 - 0.4 * dot(p, p));
  if (r < R + 0.02){
    vec3 wf = waveField(vUv);
    float amp = (0.4 + iParam0 * 0.6);
    vec2 g; vec3 hs;
    waves(p, t, amp, 1.0, g, hs);                                 // the bowl's own idle swell
    float depth = 0.55;
    vec2 xf = p + g * depth + wf.yz * 0.0010;
    float det = (1.0 + depth * hs.x) * (1.0 + depth * hs.z) - depth * depth * hs.y * hs.y;
    float caust = clamp(1.0 / max(abs(det), 0.04), 0.0, 8.0) * waveCaustic(vUv, 0.0016);
    vec3 dye = dyeAt(uvOf(xf)).rgb;
    vec3 floorCol = vec3(0.05, 0.06, 0.08);
    floorCol = mix(floorCol, iC0, dye.r * 0.8);
    floorCol = mix(floorCol, iC1, dye.g * 0.7);
    floorCol = mix(floorCol, iC2, dye.b * 0.7);
    vec3 inside = floorCol * (0.12 + 0.5 * caust) * (1.0 + B * 0.25);
    vec3 nrm = normalize(vec3(-g * 1.5 - wf.yz * 0.02, 1.0));
    inside += vec3(1.0) * waveGlint(nrm) * (0.8 + T * 1.2);
    inside *= 1.0 - 0.45 * smoothstep(R - 0.14, R, r);
    inside += vec3(0.8, 0.9, 1.0) * exp(-(R - r) * 80.0) * 0.15;
    vec3 rim = vec3(0.65) * exp(-pow((r - R - 0.006) / 0.004, 2.0)) + iC0 * 0.05;
    col = mix(col, r < R ? inside : rim, smoothstep(R + 0.02, R + 0.014, r));
  }
  col += iC0 * 0.03 * exp(-max(r - R, 0.0) * 10.0) * step(R, r);
  fragColor = vec4(finish(col, fc, 1.1 + L * 0.3, 1.2), 1.0);
}`;

export const FLUID_SIM_GLSL: Record<string, string> = {
  FLUID_INK: LOOK_LIB + INK,
  FLUID_MARBLE: LOOK_LIB + MARBLE,
  FLUID_LAMP: LOOK_LIB + LAMP,
  FLUID_OILFILM: LOOK_LIB + OIL,
  FLUID_VORTEX: LOOK_LIB + VORTEX,
  FLUID_DENSITY: LOOK_LIB + DENSITY,
  FLUID_SILK: LOOK_LIB + SILK,
  FLUID_SHEAR: LOOK_LIB + SHEAR,
  FLUID_CONVECTION: LOOK_LIB + CONVECTION,
  FLUID_CAUSTIC: LOOK_LIB + CAUSTIC,
};
