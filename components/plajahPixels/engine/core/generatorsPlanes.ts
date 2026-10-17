// generatorsPlanes — ten "interleaving folding planes" generators for GEN_GLSL.
//
// Every scene is a stack of sheets — paper, satin, glass, foil, card — that fold and pass over and
// under one another. The stack is rendered per pixel as real layered geometry: each sheet reports
// its depth, its coverage band and the gradient of its surface, the sheets are depth-sorted, the
// nearest covering sheet is lit from its slope (so a crease is a lit facet meeting a shaded one),
// the sheets just in front cast soft shadows onto it, and translucent sheets tint what lies behind.
// Materials are physically shaded: wrapped diffuse for paper, GGX specular, an anisotropic sheen
// for satin, a studio environment for foil.
//
// Calm to mid tempo: the audio uniforms arrive envelope-smoothed (CALM_AUDIO_MODES). Bass opens the
// fold, mids move the sheen, treble glitters the creases, level opens the exposure, and a sung
// syllable travels along a ribbon as a crease (iVocal history). Nothing jumps.
//
// Composed as HEADER + CEL_COMMON (generatorsCosmos) + PLANES_LIB + body + PLANES_MAIN.
//   iParam0 Pace / shape · iParam1 Detail · iParam2 Music response · iParam3 Variation

export const ABSTRACT_AUDIO = `
uniform vec3 iVocal[48];   // 1.6 s of three vocal ranges, newest first (GeneratorRenderer)
float vocalHist(float age, int b){ float f = clamp(age * 30.0, 0.0, 46.999); int i = int(f); vec3 v = mix(iVocal[i], iVocal[i + 1], f - float(i)); return b == 0 ? v.x : b == 1 ? v.y : v.z; }
float voice(){ vec3 v = iVocal[0]; return clamp(v.x * 0.6 + v.y + v.z * 0.5, 0.0, 1.5) * iParam2 * 2.0; }
float aB(){ return smoothstep(0.03, 0.85, iBass) * iParam2 * 2.0; }
float aM(){ return smoothstep(0.03, 0.75, iMid) * iParam2 * 2.0; }
float aT(){ return smoothstep(0.02, 0.60, iTreble) * iParam2 * 2.0; }
float aL(){ return smoothstep(0.03, 0.80, iLevel) * iParam2 * 2.0; }
`;

const PLANES_LIB = ABSTRACT_AUDIO + `
// A sung syllable travels along a ribbon as a crease: the crease at distance x left the voice |x| / speed s ago.
float voiceCrease(float x, float speed){ float age = abs(x) / speed; if (age > 1.5) return 0.0; return (vocalHist(age, 0) * 0.7 + vocalHist(age, 1)) * smoothstep(1.5, 1.0, age) * iParam2 * 2.0; }
float tri(float x){ return 1.0 - 4.0 * abs(fract(x) - 0.5); }
float dtri(float x){ return fract(x) < 0.5 ? 4.0 : -4.0; }
vec3 pal6(int i){ int k = i - 6 * (i / 6); return k == 0 ? iC0 : k == 1 ? mix(iC0, iC1, 0.5) : k == 2 ? iC1 : k == 3 ? mix(iC1, iC2, 0.5) : k == 4 ? iC2 : mix(iC2, iC0, 0.5); }
// While gLite is set the renderer only needs geometry (depth, coverage): textures return flat.
bool gLite = false;
// Cotton paper: fine tooth plus long fibres.
float paper(vec2 q, float sc){ if (gLite) return 1.0; return 0.9 + 0.1 * vnoise(q * sc) + 0.06 * (vnoise(q * sc * 3.7 + 7.0) - 0.5) + 0.05 * (fbm(vec2(q.x * sc * 0.6, q.y * sc * 5.0), 2) - 0.5); }
float grain(vec2 q, float amp){ if (gLite) return 1.0; return 1.0 - amp * 0.5 + amp * vnoise(q); }
float mottle(vec2 q, int oct){ if (gLite) return 0.5; return fbm(q, oct); }
struct Sheet {
  float z;      // depth, larger = nearer the viewer
  vec2 c;       // coverage coordinate (the sheet exists where lo <= c <= hi on both axes)
  vec2 lo, hi;
  vec2 g;       // surface gradient dz/dq in screen space: the fold's lighting
  vec3 col;     // albedo
  float rough, metal, sheen, alpha;
  float lead;   // width of an opaque dark edge line (stained glass came)
  float tang;   // 0 = satin threads run along x, 1 = along y
};
Sheet blank(){ Sheet s; s.z = -9.0; s.c = vec2(0.0); s.lo = vec2(-9.0); s.hi = vec2(9.0); s.g = vec2(0.0); s.col = vec3(0.5); s.rough = 0.8; s.metal = 0.0; s.sheen = 0.0; s.alpha = 1.0; s.lead = 0.0; s.tang = 0.0; return s; }
`;

const PLANES_MAIN = `
float cover1(float c, float lo, float hi, float e){ return smoothstep(lo - e, lo + e, c) * smoothstep(hi + e, hi - e, c); }
float coverage(Sheet s, float e){ return cover1(s.c.x, s.lo.x, s.hi.x, e) * cover1(s.c.y, s.lo.y, s.hi.y, e); }
float edgeDist(Sheet s){ return min(min(s.c.x - s.lo.x, s.hi.x - s.c.x), min(s.c.y - s.lo.y, s.hi.y - s.c.y)); }
const vec3 KEY = vec3(-0.4525, 0.6234, 0.6375);   // key light, upper left, toward the viewer
vec3 shade(Sheet s, vec3 n, float shadow){
  vec3 V = vec3(0.0, 0.0, 1.0); vec3 H = normalize(KEY + V);
  float ndl = dot(n, KEY);
  float wrap = clamp((ndl + 0.35) / 1.35, 0.0, 1.0);
  float diff = mix(wrap * wrap * (3.0 - 2.0 * wrap), max(ndl, 0.0), s.metal);
  float a = max(s.rough * s.rough, 0.002);
  float ndh = max(dot(n, H), 0.0);
  float dd = ndh * ndh * (a * a - 1.0) + 1.0;
  float D = a * a / (PI * dd * dd);
  float fr = pow(1.0 - max(dot(H, V), 0.0), 5.0);
  vec3 F0 = mix(vec3(0.04), s.col, s.metal);
  vec3 spec = mix(F0, vec3(1.0), fr) * D * 0.2 * (0.35 + 0.65 * max(ndl, 0.0));
  vec3 Tn = s.tang > 0.5 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  Tn = normalize(Tn - n * dot(Tn, n));
  float th = dot(H, Tn);
  float an = pow(sqrt(max(1.0 - th * th, 0.0)), 28.0) * s.sheen;          // satin: the highlight stretches along the thread
  vec3 R = reflect(-V, n);                                                   // soft studio for metals
  vec3 env = mix(vec3(0.18, 0.19, 0.22), vec3(0.5, 0.52, 0.56), smoothstep(-0.7, 0.9, R.y)) + vec3(0.7) * exp(-pow(length(R.xy - vec2(-0.35, 0.55)) * 2.6, 2.0));
  vec3 amb = s.col * (0.16 + 0.08 * n.y) * vec3(0.92, 0.96, 1.06);
  vec3 lit = (s.col * diff * (1.0 - s.metal * 0.75) + spec + vec3(1.0, 0.97, 0.9) * an) * (1.0 - shadow * 0.82);
  return amb * (1.0 - shadow * 0.3) + lit * 1.15 + env * F0 * s.metal * (1.0 - shadow * 0.5);
}
// Shadow cast by an earlier (nearer) sheet onto the one at depth z: its coverage where the key light's ray crosses it.
float castShadow(int who, float zc, float z, vec2 p, float e){
  float dz = zc - z; if (who < 0 || dz <= 0.0) return 0.0;
  Sheet f = sheetAt(who, p + KEY.xy / KEY.z * dz * 0.5);
  return coverage(f, e + dz * 0.1) * f.alpha * 0.9;
}
void main(){
  BANDS
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv();
  float px = 1.0 / iResolution.y;
  float e = 1.3 * px;
  // Depth of every sheet at this pixel (geometry only), then walk them nearest-first without sorting.
  float zs[NS];
  gLite = true;
  for (int i = 0; i < NS; i++) zs[i] = sheetAt(i, p).z;
  vec3 col = vec3(0.0); vec3 Tr = vec3(1.0);
  float prevZ = 1e9; int prevI = -1;
  int c1 = -1, c2 = -1, c3 = -1; float z1 = 0.0, z2 = 0.0, z3 = 0.0;   // the three sheets just in front: shadow casters
  for (int pass = 0; pass < NS; pass++){
    int best = -1; float bz = -1e8;
    for (int i = 0; i < NS; i++){ float z = zs[i]; bool after = z < prevZ || (z == prevZ && i > prevI); if (after && z > bz){ bz = z; best = i; } }
    if (best < 0) break;
    prevZ = bz; prevI = best;
    gLite = true;
    Sheet s = sheetAt(best, p);
    float cov = coverage(s, e);
    if (cov >= 0.002){
      gLite = false;
      s = sheetAt(best, p);
      float ed = edgeDist(s);
      float lead = s.lead > 0.0 ? 1.0 - smoothstep(0.0, s.lead, ed) : 0.0;
      float a = cov * max(s.alpha, lead);
      gLite = true;
      float shadow = max(castShadow(c1, z1, s.z, p, e), max(castShadow(c2, z2, s.z, p, e), castShadow(c3, z3, s.z, p, e)));
      gLite = false;
      vec3 n = normalize(vec3(-s.g, 1.0));
      vec3 c = shade(s, n, shadow) * (1.0 - lead * 0.92);
      col += Tr * a * c;
      Tr *= (1.0 - a) * mix(vec3(1.0), s.col, (1.0 - s.alpha) * cov);
    }
    c3 = c2; z3 = z2; c2 = c1; z2 = z1; c1 = best; z1 = s.z;
    if (max(Tr.r, max(Tr.g, Tr.b)) < 0.01) break;
  }
  gLite = false;
  col += Tr * background(p);
  col *= vignette(p, 0.22);
  fragColor = vec4(finish(col, fc, 1.05 + L * 0.3, 1.15), 1.0);
}`;

// ── 1. Origami Pleats — accordion-pleated cotton ribbons drifting over and under ──
const PLANES_PLEATS = `
#define NS 7
Sheet sheetAt(int i, vec2 q){
  Sheet s = blank(); float fi = float(i);
  float t = iTime * (0.3 + iParam0 * 0.6);
  float amp = 0.028 + aB() * 0.03 + iParam0 * 0.015;
  float k = mix(4.6, 3.4, aB()) + (iParam3 - 0.5) * 1.5;
  float ph = fi * 0.37 + t * 0.12 * (mod(fi, 2.0) * 2.0 - 1.0);
  float f = tri(q.x * k + ph), df = dtri(q.x * k + ph) * k;
  float vc = voiceCrease(q.x, 0.55) * 0.05;
  float dvc = (voiceCrease(q.x + 0.004, 0.55) - voiceCrease(q.x - 0.004, 0.55)) / 0.008 * 0.05;
  float yb = -0.47 + fi * 0.15 + 0.02 * sin(t * 0.4 + fi * 1.3) + f * amp * 0.25;
  s.c = q; s.lo = vec2(-9.0, yb); s.hi = vec2(9.0, yb + 0.12 + 0.012 * sin(fi * 2.1));
  float wph = q.x * 3.0 + fi * 1.1 + t * 0.25;
  s.z = 0.16 * sin(wph) + f * amp + vc;
  s.g = vec2(0.48 * cos(wph) + df * amp + dvc, 0.0);
  s.col = pal6(i) * paper(q + fi, 26.0) * (0.85 + 0.15 * step(0.5, fract(fi * 0.5)));
  s.rough = 0.9; s.sheen = 0.08;
  return s;
}
vec3 background(vec2 p){ return mix(iC0 * 0.08, iC2 * 0.05, p.y + 0.5) + iC1 * 0.04 * exp(-dot(p, p) * 2.0); }
`;

// ── 2. Silk Loom — a plain weave of satin strips, every crossing a real over/under ──
const PLANES_WEAVE = `
#define NS 12
Sheet sheetAt(int i, vec2 q){
  Sheet s = blank(); float t = iTime * (0.3 + iParam0 * 0.5);
  float pitch = 0.2 + (iParam3 - 0.5) * 0.06;
  float A = 0.05 * (1.0 + aB() * 0.25);
  float w = pitch * 0.58 * (1.0 + aB() * 0.08);
  if (i < 5){
    float fi = float(i); float yc = (fi - 2.0) * pitch + 0.008 * sin(t * 0.5 + fi);
    float ph = PI * q.x / pitch + PI * 0.5 + PI * fi + 0.15 * sin(t * 0.3 + fi);
    s.c = q; s.lo = vec2(-9.0, yc - w * 0.5); s.hi = vec2(9.0, yc + w * 0.5);
    s.z = A * sin(ph); s.g = vec2(A * PI / pitch * cos(ph), 0.0);
    float u = (q.y - yc) / (w * 0.5); s.g.y += 0.45 * u; s.z -= 0.012 * u * u;   // round thread profile
    s.col = (fract(fi * 0.5) < 0.25 ? iC0 : mix(iC0, vec3(0.96, 0.92, 0.84), 0.75)) * grain(vec2(q.x * 160.0, q.y * 40.0), 0.1);
    s.tang = 0.0;
  } else {
    float fj = float(i - 5); float xc = (fj - 3.0) * pitch + 0.008 * sin(t * 0.45 + fj * 1.7);
    float ph = PI * q.y / pitch + PI * 0.5 + PI * fj - 0.15 * sin(t * 0.3 + fj);
    s.c = q; s.lo = vec2(xc - w * 0.5, -9.0); s.hi = vec2(xc + w * 0.5, 9.0);
    s.z = -A * sin(ph); s.g = vec2(0.0, -A * PI / pitch * cos(ph));
    float u = (q.x - xc) / (w * 0.5); s.g.x += 0.45 * u; s.z -= 0.012 * u * u;
    float m = fract(fj / 3.0);
    s.col = (m < 0.34 ? iC1 : m < 0.67 ? iC2 : mix(iC1, iC2, 0.5)) * grain(vec2(q.x * 40.0, q.y * 160.0), 0.1);
    s.tang = 1.0;
  }
  s.rough = 0.42;
  s.sheen = 0.55 * (0.45 + 0.55 * (0.5 + 0.5 * sin((q.x + q.y) * 3.0 - iTime * 0.5))) * (0.6 + aM() * 0.5);
  return s;
}
vec3 background(vec2 p){ return iC0 * 0.05 + vec3(0.008, 0.009, 0.012); }
`;

// ── 3. Stained Sashes — translucent jewel glass ribbons folding across a backlight ──
const PLANES_STAINED = `
#define NS 6
vec3 jewel(int i){ return i == 0 ? iC0 : i == 1 ? iC1 : i == 2 ? iC2 : i == 3 ? mix(iC0, iC2, 0.5) : i == 4 ? mix(iC1, iC0, 0.5) : mix(iC2, iC1, 0.5); }
Sheet sheetAt(int i, vec2 q){
  Sheet s = blank(); float fi = float(i); float t = iTime * (0.25 + iParam0 * 0.5);
  float ang = -0.52 + (iParam3 - 0.5) * 0.6;
  vec2 r = rot2(ang) * q;
  float yc = -0.62 + fi * 0.25 + 0.02 * sin(t * 0.35 + fi);
  float amp = 0.02 + aB() * 0.015;
  float k = 2.4; float ph = fi * 0.6 - t * 0.15;
  float f = tri(r.x * k + ph), df = dtri(r.x * k + ph) * k;
  s.c = r; s.lo = vec2(-9.0, yc); s.hi = vec2(9.0, yc + 0.17 + aB() * 0.02);
  float wph = r.x * 2.2 + fi * 1.7 - t * 0.25;
  s.z = 0.14 * sin(wph) + f * amp;
  s.g = rot2(-ang) * vec2(0.14 * 2.2 * cos(wph) + df * amp, 0.0);
  s.col = jewel(i) * (0.85 + 0.2 * mottle(r * 9.0 + fi, 3));
  s.rough = 0.08; s.alpha = 0.3; s.lead = 0.011;
  return s;
}
vec3 background(vec2 p){ vec3 warm = mix(iC1, vec3(1.0), 0.45); vec2 q = p * vec2(0.8, 1.0); return warm * 1.6 * exp(-dot(q, q) * 1.1) * (0.8 + aM() * 0.4 + voice() * 0.15) + warm * 0.25; }
`;

// ── 4. Paper Tide — creased card waves receding to a sunset horizon ──
const PLANES_TIDE = `
#define NS 9
Sheet sheetAt(int i, vec2 q){
  Sheet s = blank(); float fi = float(i); float k = fi / 8.0;
  float t = iTime * (0.3 + iParam0 * 0.5);
  float yc = 0.12 - 0.72 * pow(k, 1.4) - aB() * 0.02;
  float thick = 0.06 + 0.1 * k;
  float amp = (0.006 + 0.026 * k) * (1.0 + aB() * 0.6 * k) * (0.7 + iParam3 * 0.6);
  float fr = 1.6 + k * 2.4; float ph = t * 0.35 * (1.0 + k * 0.5) + fi * 0.8;
  float ws = sin(q.x * fr * PI - ph), wc = cos(q.x * fr * PI - ph) * fr * PI;
  float tf = tri(q.x * fr + ph * 0.1), dtf = dtri(q.x * fr + ph * 0.1) * fr;
  float crest = ws * amp + tf * amp * 0.45;
  s.c = vec2(q.x, q.y - crest); s.lo = vec2(-9.0, yc); s.hi = vec2(9.0, yc + thick);
  s.z = fi * 0.12 + 0.06 * sin(q.x * 4.0 + fi * 2.0 + t * 0.2);
  float u = clamp((q.y - crest - yc) / thick, 0.0, 1.0);
  s.g = vec2((wc * amp + dtf * amp * 0.45) * 1.6, -0.5 + u * 1.2);
  s.col = mix(iC0, mix(iC1, iC2, 0.35), pow(k, 0.8)) * paper(q * vec2(1.0, 3.0) + fi, 20.0);
  s.rough = 0.8;
  s.sheen = 0.05 + 0.5 * aT() * smoothstep(0.03, 0.0, yc + thick - (q.y - crest));   // foam glint along the crest
  return s;
}
vec3 background(vec2 p){ float h = smoothstep(-0.1, 0.4, p.y); vec3 sky = mix(mix(iC2, vec3(1.0, 0.85, 0.6), 0.4) * 0.9, iC0 * 0.25, h); return sky * (0.7 + aM() * 0.3); }
`;

// ── 5. Fan Vault — eleven creased blades opening from a pivot below the frame ──
const PLANES_FAN = `
#define NS 15
Sheet sheetAt(int i, vec2 q){
  Sheet s = blank(); float fi = float(i); float t = iTime * (0.25 + iParam0 * 0.5);
  vec2 piv = vec2(0.0, -1.1); vec2 d = q - piv; float r = length(d) + 1e-4;
  float ang = atan(d.x, d.y);
  float spread = mix(0.10, 0.14, aB()) + (iParam3 - 0.5) * 0.04;
  float tilt = sin(t * 0.3) * 0.05 * (0.5 + aM());
  float a0 = (fi - 7.0) * spread + tilt + sin(t * 0.6 + fi * 1.1) * 0.01;
  float hw = spread * 0.62;
  float len = 1.95 + 0.1 * sin(fi * 1.3 + t * 0.4);
  s.c = vec2(ang, r); s.lo = vec2(a0 - hw, 0.0); s.hi = vec2(a0 + hw, len);
  float u = (ang - a0) / hw;
  s.z = 0.25 * sin(fi * 1.9 + t * 0.15) - 0.14 * abs(u);                 // crease along the spine
  float dzda = -0.14 * sign(u) / hw;
  s.g = dzda * vec2(d.y, -d.x) / (r * r) * 0.8;
  float m = fract(fi / 3.0);
  s.col = (fract(fi * 0.5) < 0.25 ? iC0 : m < 0.34 ? iC1 : iC2) * paper(vec2(ang * 3.0, r) + fi, 18.0);
  s.rough = 0.85; s.sheen = 0.1;
  return s;
}
vec3 background(vec2 p){ return iC1 * 0.05 * exp(-dot(p - vec2(0.0, 0.8), p - vec2(0.0, 0.8)) * 1.5) * (1.0 + voice() * 0.3) + iC0 * 0.04; }
`;

// ── 6. Chevron Cascade — chevron-creased foil columns flowing downward ──
const PLANES_CHEVRON = `
#define NS 8
Sheet sheetAt(int i, vec2 q){
  Sheet s = blank(); float fi = float(i); float t = iTime * (0.3 + iParam0 * 0.6);
  float xc = -0.78 + fi * 0.223 + 0.006 * sin(t * 0.3 + fi);
  float w = 0.25 + 0.01 * sin(fi * 1.7);
  float amp = 0.022 + aB() * 0.02;
  float k = mix(5.0, 3.6, aM()) + (iParam3 - 0.5) * 2.0;
  float ph = fi * 0.31 - t * 0.25;
  float f = tri(q.y * k + ph), df = dtri(q.y * k + ph) * k;
  s.c = q; s.lo = vec2(xc - w * 0.5, -9.0); s.hi = vec2(xc + w * 0.5, 9.0);
  float wph = q.y * 1.6 + fi * 1.4 + t * 0.2;
  s.z = 0.15 * sin(wph) + f * amp;
  s.g = vec2(0.0, 0.15 * 1.6 * cos(wph) + df * amp + 0.55 * sin(fract(q.y * k + ph) * TAU));   // each facet bellies a little
  float brush = grain(vec2(q.x * 900.0, q.y * 14.0), 0.16);     // brushed grain across the foil
  float m = fract(fi / 4.0);
  vec3 tint = fract(fi * 0.5) < 0.25 ? iC0 : m < 0.3 ? iC1 : iC2;
  s.col = mix(tint, vec3(0.85), 0.15) * brush;
  s.metal = 1.0; s.rough = 0.28 + 0.1 * (1.0 - aT()); s.tang = 1.0;
  return s;
}
vec3 background(vec2 p){ return iC0 * 0.03 + vec3(0.01, 0.012, 0.016); }
`;

// ── 7. Kinetic Lattice — linen tiles turning on a slow travelling wave ──
const PLANES_LATTICE = `
#define NS 2
Sheet sheetAt(int i, vec2 q){
  Sheet s = blank(); float fi = float(i); float t = iTime * (0.35 + iParam0 * 0.6);
  vec2 cell = vec2(0.19 + (iParam3 - 0.5) * 0.06);
  vec2 off = vec2(fi * 0.5);
  vec2 gq = q / cell + off;
  float row = floor(gq.y); float shift = 0.5 * mod(row, 2.0);
  float colI = floor(gq.x - shift);
  vec2 cen = (vec2(colI + shift + 0.5, row + 0.5) - off) * cell;
  float dir = t * 0.1 + aM() * 0.8;
  float phase = dot(cen, vec2(cos(dir), sin(dir))) * 5.5 - t * 1.0 + fi * 1.3;
  float th = sin(phase) * (1.95 + voice() * 0.4) + (fbm(cen * 4.0 + t * 0.05, 2) - 0.5) * 0.25;
  float ct = cos(th), st = sin(th);
  float hw = max(abs(ct), 0.03) * cell.x * 0.43; float hh = cell.y * 0.43;
  s.c = q; s.lo = vec2(cen.x - hw, cen.y - hh); s.hi = vec2(cen.x + hw, cen.y + hh);
  float u = (q.x - cen.x) / max(hw, 1e-3);
  s.z = (0.3 - fi * 0.5) + u * st * cell.x * 0.43;
  s.g = vec2(clamp(st / max(abs(ct), 0.15), -4.0, 4.0), 0.0);
  s.col = (ct >= 0.0 ? iC0 : iC2) * (fi > 0.5 ? 0.35 : 1.0) * paper(q * 3.0 + vec2(colI, row), 40.0);
  s.rough = 0.75; s.sheen = 0.05;
  return s;
}
vec3 background(vec2 p){ return iC1 * 0.06 + vec3(0.01); }
`;

// ── 8. Paper Lightbox — concentric cut-paper layers stepping toward a lit core, a ribbon threading between them ──
const PLANES_LAYERS = `
#define NS 9
Sheet sheetAt(int i, vec2 q){
  Sheet s = blank(); float fi = float(i); float t = iTime * (0.25 + iParam0 * 0.5);
  if (i < 8){
    vec2 d = (q - vec2(0.0, 0.02)) * vec2(0.8, 1.22);
    float ang = atan(d.y, d.x); float r = length(d);
    float breathe = 1.0 + 0.02 * sin(t * 0.5) + aB() * 0.05;
    float fold = (0.012 + aB() * 0.01) * (sin(ang * 6.0 + fi * 1.3 + t * 0.4) + 1.5 * sin(ang * 2.0 + fi));
    float R = (0.16 + 0.68 * pow(1.0 - fi / 8.0, 1.25 + (iParam3 - 0.5) * 0.5)) * breathe + fold;
    s.c = vec2(r, 0.0); s.lo = vec2(R, -9.0); s.hi = vec2(9.0, 9.0);
    s.z = -fi * 0.1;
    float back = fi / 7.0;
    s.col = mix(iC0 * 0.35, mix(iC1, iC2, back), back) * (0.6 + 0.5 * back) * paper(q + fi, 24.0);
    s.rough = 0.9;
  } else {
    float yc = 0.11 * sin(q.x * TAU * 0.9 + t * 0.4);
    float dyc = 0.11 * TAU * 0.9 * cos(q.x * TAU * 0.9 + t * 0.4);
    float w = 0.035 + voiceCrease(q.x, 0.6) * 0.01;
    s.c = vec2(0.0, q.y - yc); s.lo = vec2(-9.0, -w); s.hi = vec2(9.0, w);
    float layer = floor(mod(q.x * 2.4 + t * 0.12, 8.0));
    s.z = -layer * 0.1 + 0.05;
    s.g = vec2(dyc * 0.5, 0.0);
    s.col = iC2 * grain(q * 60.0, 0.2);
    s.rough = 0.4; s.sheen = 0.6;
  }
  return s;
}
vec3 background(vec2 p){ return mix(iC2, vec3(1.0, 0.95, 0.9), 0.5) * (1.0 + voice() * 0.25 + aM() * 0.15); }
`;

// ── 9. Satin Braid — a true five-strand braid of satin ribbons ──
const PLANES_BRAID = `
#define NS 5
Sheet sheetAt(int i, vec2 q){
  Sheet s = blank(); float fi = float(i); float t = iTime * (0.3 + iParam0 * 0.5);
  float k = (mix(1.1, 1.5, aM()) + (iParam3 - 0.5) * 0.5) * TAU;
  float ph = fi * TAU / 5.0 + t * 0.3;
  float A = 0.17; float w = 0.075 + aB() * 0.015 + voiceCrease(q.x, 0.6) * 0.02;
  float yc = A * sin(q.x * k + ph) - aB() * 0.02;
  s.c = vec2(0.0, q.y - yc); s.lo = vec2(-9.0, -w * 0.5); s.hi = vec2(9.0, w * 0.5);
  s.z = 0.3 * cos(q.x * k + ph);
  float u = s.c.y / (w * 0.5);
  s.g = vec2(-0.3 * k * sin(q.x * k + ph) * 0.5, 0.35 * u);
  s.col = pal6(i) * grain(vec2(q.x * 180.0, q.y * 40.0), 0.1);
  s.rough = 0.32; s.sheen = 0.95 * (0.6 + aM() * 0.5);
  return s;
}
vec3 background(vec2 p){ return iC0 * 0.05 + iC1 * 0.03 * exp(-dot(p, p) * 2.0) + vec3(0.006); }
`;

// ── 10. Crossed Tapestry — two families of thin pleated sheets crossing at a shallow angle ──
const PLANES_TAPESTRY = `
#define NS 10
Sheet sheetAt(int i, vec2 q){
  Sheet s = blank(); float t = iTime * (0.25 + iParam0 * 0.5);
  bool fam = i >= 5; float fi = float(fam ? i - 5 : i);
  float ang = (fam ? 0.17 : -0.17) * (0.8 + aB() * 0.4) + (iParam3 - 0.5) * 0.3;
  vec2 r = rot2(ang) * q;
  float pitch = 0.24; float yc = (fi - 2.0) * pitch + 0.015 * sin(t * 0.4 + fi);
  float thick = pitch * 0.78;
  float amp = 0.02 + aB() * 0.012;
  float k = 3.2; float ph = fi * 0.5 + t * 0.2 * (fam ? -1.0 : 1.0);
  float f = tri(r.x * k + ph), df = dtri(r.x * k + ph) * k;
  s.c = r; s.lo = vec2(-9.0, yc); s.hi = vec2(9.0, yc + thick);
  float wph = r.x * 1.3 * PI + fi * 1.5 + t * 0.15;
  s.z = (fam ? 0.05 : -0.05) + 0.12 * sin(wph) + f * amp;
  s.g = rot2(-ang) * vec2(0.12 * 1.3 * PI * cos(wph) + df * amp, 0.0);
  float m = fract(fi / 3.0);
  vec3 colA = mix(iC0 * 0.5, iC0, fract(fi * 0.37));
  vec3 colB = m < 0.34 ? iC1 : m < 0.67 ? iC2 : mix(iC1, iC2, 0.5);
  s.col = (fam ? colB : colA) * (0.85 + 0.2 * mottle(r * 12.0 + fi, 2));
  s.alpha = fam ? 0.55 : 1.0; s.rough = fam ? 0.3 : 0.8; s.sheen = fam ? 0.5 : 0.1;
  float crease = smoothstep(0.85, 1.0, abs(f));                                           // glitter on the creases
  if (!gLite) s.col += vec3(1.0, 0.9, 0.7) * crease * (0.3 + aT() * 0.8) * pow(vnoise(r * 120.0 + t), 6.0) * 4.0;
  return s;
}
vec3 background(vec2 p){ return iC0 * 0.06 + vec3(0.006, 0.006, 0.012); }
`;

export const PLANES_GLSL: Record<string, string> = {
  PLANES_PLEATS: PLANES_LIB + PLANES_PLEATS + PLANES_MAIN,
  PLANES_WEAVE: PLANES_LIB + PLANES_WEAVE + PLANES_MAIN,
  PLANES_STAINED: PLANES_LIB + PLANES_STAINED + PLANES_MAIN,
  PLANES_TIDE: PLANES_LIB + PLANES_TIDE + PLANES_MAIN,
  PLANES_FAN: PLANES_LIB + PLANES_FAN + PLANES_MAIN,
  PLANES_CHEVRON: PLANES_LIB + PLANES_CHEVRON + PLANES_MAIN,
  PLANES_LATTICE: PLANES_LIB + PLANES_LATTICE + PLANES_MAIN,
  PLANES_LAYERS: PLANES_LIB + PLANES_LAYERS + PLANES_MAIN,
  PLANES_BRAID: PLANES_LIB + PLANES_BRAID + PLANES_MAIN,
  PLANES_TAPESTRY: PLANES_LIB + PLANES_TAPESTRY + PLANES_MAIN,
};

/** The deeper stacks (translucent glass, nine tide rows, fifteen blades) render a little smaller; the content is soft. */
export const PLANES_RENDER_SCALE: Record<string, number> = {
  PLANES_WEAVE: 0.85,
  PLANES_STAINED: 0.8,
  PLANES_TIDE: 0.85,
  PLANES_FAN: 0.85,
};
