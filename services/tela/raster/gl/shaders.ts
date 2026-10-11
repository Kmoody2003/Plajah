// raster/gl/shaders — GLSL ES 3.00 twins of the CPU reference (blend.ts, adjust.ts,
// filters.ts). Keep these line-for-line with the CPU code; the GPU proof page diffs them.
//
// Conventions: all surfaces are premultiplied; output pixel (0,0) is texture row 0 (no
// y-flips anywhere until the final present pass); `uOrigin` = document-pixel position of
// output pixel (0,0) at the current scale (dissolve / noise / pixelate stay tile-stable).

export const VS_FULL = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

/** Quad in output-pixel space (for bitmap draws). aPos = bitmap px, uM maps bitmap px → output px. */
export const VS_QUAD = `#version 300 es
in vec2 aPos; uniform mat3 uM; uniform vec2 uOut; out vec2 vBm;
void main(){ vec3 p = uM * vec3(aPos, 1.0); vBm = aPos; gl_Position = vec4(p.xy / uOut * 2.0 - 1.0, 0.0, 1.0); }`;

const COMMON = `
precision highp float; precision highp int; precision highp sampler2D; precision highp sampler3D;
uint hash2u(int x, int y, int seed){
  uint h = (uint(x) * 0x8da6b343u) ^ (uint(y) * 0xd8163841u) ^ (uint(seed) * 0xcb1ab31fu);
  h = (h ^ (h >> 16u)) * 0x7feb352du; h = (h ^ (h >> 15u)) * 0x846ca68bu; return h ^ (h >> 16u);
}
float hash01(int x, int y, int seed){ return float(hash2u(x, y, seed)) / 4294967296.0; }
float s2l(float c){ return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); }
float l2s(float c){ return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1.0 / 2.4) - 0.055; }
vec3 s2l3(vec3 c){ return vec3(s2l(c.r), s2l(c.g), s2l(c.b)); }
vec3 l2s3(vec3 c){ return vec3(l2s(c.r), l2s(c.g), l2s(c.b)); }
vec4 fetch0(sampler2D t, ivec2 q){ ivec2 sz = textureSize(t, 0); return (q.x < 0 || q.y < 0 || q.x >= sz.x || q.y >= sz.y) ? vec4(0.0) : texelFetch(t, q, 0); }
vec4 bilin(sampler2D t, vec2 q){ vec2 f = q - 0.5; vec2 i0 = floor(f); vec2 w = f - i0; ivec2 a = ivec2(i0);
  return mix(mix(fetch0(t, a), fetch0(t, a + ivec2(1, 0)), w.x), mix(fetch0(t, a + ivec2(0, 1)), fetch0(t, a + ivec2(1, 1)), w.x), w.y); }
`;

export const BLEND_GLSL = `
float burnF(float b, float s){ return b >= 1.0 ? 1.0 : (s <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - b) / s)); }
float dodgeF(float b, float s){ return b <= 0.0 ? 0.0 : (s >= 1.0 ? 1.0 : min(1.0, b / (1.0 - s))); }
float screenF(float b, float s){ return b + s - b * s; }
float hardF(float b, float s){ return s <= 0.5 ? b * 2.0 * s : screenF(b, 2.0 * s - 1.0); }
float blendCh(int m, float b, float s){
  switch(m){
    case 2: return min(b, s);
    case 3: return b * s;
    case 4: return burnF(b, s);
    case 5: return max(0.0, b + s - 1.0);
    case 7: return max(b, s);
    case 8: return screenF(b, s);
    case 9: return dodgeF(b, s);
    case 10: return min(1.0, b + s);
    case 12: return hardF(s, b);
    case 13: return s <= 0.5 ? 2.0 * b * s + b * b * (1.0 - 2.0 * s) : 2.0 * b * (1.0 - s) + sqrt(b) * (2.0 * s - 1.0);
    case 14: return hardF(b, s);
    case 15: return s <= 0.5 ? burnF(b, 2.0 * s) : dodgeF(b, 2.0 * s - 1.0);
    case 16: return clamp(b + 2.0 * s - 1.0, 0.0, 1.0);
    case 17: return s <= 0.5 ? min(b, 2.0 * s) : max(b, 2.0 * s - 1.0);
    case 18: return b + s >= 1.0 - 1e-6 ? 1.0 : 0.0;
    case 19: return abs(b - s);
    case 20: return b + s - 2.0 * b * s;
    case 21: return max(0.0, b - s);
    case 22: return s <= 0.0 ? (b > 0.0 ? 1.0 : 0.0) : min(1.0, b / s);
    default: return s;
  }
}
float lumW(vec3 c){ return dot(c, vec3(0.3, 0.59, 0.11)); }
vec3 clipColor(vec3 c){
  float l = lumW(c), n = min(min(c.r, c.g), c.b), x = max(max(c.r, c.g), c.b);
  if (n < 0.0) { float d = l - n; c = d > 1e-12 ? l + (c - l) * l / d : vec3(l); }
  if (x > 1.0) { float d = x - l; c = d > 1e-12 ? l + (c - l) * (1.0 - l) / d : vec3(l); }
  return c;
}
vec3 setLum(vec3 c, float l){ return clipColor(c + (l - lumW(c))); }
float satW(vec3 c){ return max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b); }
vec3 setSat(vec3 c, float s){
  int iMax = 0, iMin = 0; float v[3] = float[3](c.r, c.g, c.b);
  for (int i = 1; i < 3; i++) { if (v[i] > v[iMax]) iMax = i; if (v[i] < v[iMin]) iMin = i; }
  if (iMax == iMin) return vec3(0.0);
  int iMid = 3 - iMax - iMin; float range = v[iMax] - v[iMin];
  float o[3]; o[iMid] = (v[iMid] - v[iMin]) * s / range; o[iMax] = s; o[iMin] = 0.0;
  return vec3(o[0], o[1], o[2]);
}
vec3 blendRGB(int m, vec3 b, vec3 s){
  if (m == 23) return setLum(setSat(s, satW(b)), lumW(b));
  if (m == 24) return setLum(setSat(b, satW(s)), lumW(b));
  if (m == 25) return setLum(s, lumW(b));
  if (m == 26) return setLum(b, lumW(s));
  if (m == 6) return lumW(s) < lumW(b) ? s : b;
  if (m == 11) return lumW(s) > lumW(b) ? s : b;
  return vec3(blendCh(m, b.r, s.r), blendCh(m, b.g, s.g), blendCh(m, b.b, s.b));
}`;

export const FS_COMPOSITE = `#version 300 es
${COMMON}${BLEND_GLSL}
uniform sampler2D uDst, uSrc, uMask; uniform int uMode, uOp, uHasMask; uniform float uOpacity; uniform ivec2 uOrigin;
in vec2 vUv; out vec4 o;
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 d = texelFetch(uDst, p, 0), s = texelFetch(uSrc, p, 0);
  float k = uOpacity * (uHasMask == 1 ? texelFetch(uMask, p, 0).a : 1.0);
  if (uOp == 2) { // keep: alpha locked, straight lerp toward B(Cb,Cs)
    if (d.a <= 0.0 || s.a <= 0.0 || k <= 0.0) { o = d; return; }
    k *= min(1.0, s.a / d.a);
    vec3 cb = min(vec3(1.0), d.rgb / d.a), cs = min(vec3(1.0), s.rgb / s.a);
    o = vec4((cb + (blendRGB(uMode, cb, cs) - cb) * k) * d.a, d.a); return;
  }
  float as = s.a * k; if (as <= 0.0) { o = d; return; }
  float kk = k;
  if (uMode == 1) { if (!(hash01(p.x + uOrigin.x, p.y + uOrigin.y, 0x5eed) < as)) { o = d; return; } kk = k / as; as = 1.0; }
  vec3 sc = s.rgb * kk; float ab = d.a;
  if (ab <= 0.0) { o = uOp == 1 ? d : vec4(sc, as); return; }
  vec3 Cs = min(vec3(1.0), sc / as), Cb = min(vec3(1.0), d.rgb / ab);
  vec3 B = blendRGB(uMode, Cb, Cs); float both = as * ab;
  if (uOp == 1) o = vec4(d.rgb * (1.0 - as) + both * B, ab);
  else o = vec4(sc * (1.0 - ab) + d.rgb * (1.0 - as) + both * B, as + ab - both);
}`;

export const FS_BITMAP = `#version 300 es
${COMMON}
uniform sampler2D uTex; uniform vec4 uRect; uniform vec4 uEdge; uniform int uLinear, uMaskKind;
in vec2 vBm; out vec4 o;
// uRect = texture's coverage in bitmap px (x0,y0,x1,y1) incl. gutters; uEdge = true image edges (x0,y0,x1,y1)
void main(){
  vec2 uv = (vBm - uRect.xy) / (uRect.zw - uRect.xy);
  vec4 c = texture(uTex, uv);
  vec2 cov2 = clamp(vBm - uEdge.xy + 0.5, 0.0, 1.0) * clamp(uEdge.zw - vBm + 0.5, 0.0, 1.0);
  float cov = cov2.x * cov2.y;
  if (uMaskKind == 1) { o = vec4(c.r); return; } // masks: outside handled by a pre-clear to the default colour
  if (uLinear == 1 && c.a > 0.0) c.rgb = s2l3(c.rgb / c.a) * c.a;
  o = c * cov;
}`;

export const FS_COPY = `#version 300 es
${COMMON}
uniform sampler2D uSrc; uniform int uMode; uniform vec4 uColor; uniform vec2 uShift; uniform float uGain, uDensity; uniform int uInvert; uniform sampler2D uMask;
in vec2 vUv; out vec4 o;
// uMode 0 copy · 1 clear-to-colour · 2 tint · 3 tint-inverse · 4 translate (bilinear) · 5 alpha gain · 6 multiply by mask · 7 R → all channels · 8 lerp(dst=uSrc, other=uMask, uGain·mask.a?) handled in FS_LERP
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy);
  if (uMode == 0) { o = texelFetch(uSrc, p, 0); return; }
  if (uMode == 1) { o = vec4(uColor.rgb * uColor.a, uColor.a); return; }
  if (uMode == 2 || uMode == 3) { float a = texelFetch(uSrc, p, 0).a; if (uMode == 3) a = 1.0 - a; o = vec4(uColor.rgb * a, a); return; }
  if (uMode == 4) { o = bilin(uSrc, gl_FragCoord.xy - uShift); return; }
  if (uMode == 5) { vec4 c = texelFetch(uSrc, p, 0); if (c.a <= 0.0) { o = c; return; } float na = min(1.0, c.a * uGain); o = vec4(c.rgb * (na / c.a), na); return; }
  if (uMode == 6) { vec4 c = texelFetch(uSrc, p, 0); float v = texelFetch(uMask, p, 0).a; if (uInvert == 1) v = 1.0 - v; v = 1.0 - uDensity * (1.0 - v); o = c * v; return; }
  if (uMode == 7) { float v = texelFetch(uSrc, p, 0).r; o = vec4(v); return; }
  o = texelFetch(uSrc, p, 0);
}`;

export const FS_LERP = `#version 300 es
${COMMON}
uniform sampler2D uDst, uOther, uMask; uniform int uHasMask; uniform float uOpacity;
out vec4 o;
void main(){ ivec2 p = ivec2(gl_FragCoord.xy); vec4 d = texelFetch(uDst, p, 0), b = texelFetch(uOther, p, 0);
  float k = uOpacity * (uHasMask == 1 ? texelFetch(uMask, p, 0).a : 1.0); o = d + (b - d) * k; }`;

/** Adjustments: kind 0 = per-channel 1D LUT (+ optional 3×4 matrix), 1 = threshold, 2 = gradient map, 3 = 3D LUT. */
export const FS_ADJUST = `#version 300 es
${COMMON}
uniform sampler2D uDst, uMask, uLut1; uniform highp sampler3D uLut3; uniform int uKind, uHasMask, uLinear, uMatrix, uLutN; uniform float uOpacity, uLevel, uStrength, uLut3N;
uniform mat3 uM; uniform vec3 uMc;
out vec4 o;
float lut1(float v, int ch){ int n = uLutN; float f = clamp(v, 0.0, 1.0) * float(n - 1); int i = int(floor(f)); float t = f - float(i); int j = min(i + 1, n - 1);
  return mix(texelFetch(uLut1, ivec2(i, 0), 0)[ch], texelFetch(uLut1, ivec2(j, 0), 0)[ch], t); }
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy); vec4 d = texelFetch(uDst, p, 0);
  float k = uOpacity * (uHasMask == 1 ? texelFetch(uMask, p, 0).a : 1.0);
  if (d.a <= 0.0 || k <= 0.0) { o = d; return; }
  vec3 c = clamp(d.rgb / d.a, 0.0, 1.0); if (uLinear == 1) c = l2s3(c);
  vec3 r = c;
  if (uKind == 0) { r = vec3(lut1(c.r, 0), lut1(c.g, 1), lut1(c.b, 2)); if (uMatrix == 1) r = clamp(uM * r + uMc, 0.0, 1.0); }
  else if (uKind == 1) { float v = dot(c, vec3(0.299, 0.587, 0.114)) >= uLevel ? 1.0 : 0.0; r = vec3(v); }
  else if (uKind == 2) { float l = clamp(dot(c, vec3(0.3, 0.59, 0.11)), 0.0, 1.0); int i = int(floor(l * float(uLutN - 1) + 0.5)); r = texelFetch(uLut1, ivec2(i, 0), 0).rgb; }
  else if (uKind == 3) { vec3 q = c * ((uLut3N - 1.0) / uLut3N) + 0.5 / uLut3N; r = mix(c, texture(uLut3, q).rgb, uStrength); }
  vec3 m = c + (r - c) * k; if (uLinear == 1) m = s2l3(m);
  o = vec4(m * d.a, d.a);
}`;

/** Separable gaussian / box. uDir = (1,0) or (0,1). Zero outside the buffer. */
export const FS_BLUR = `#version 300 es
${COMMON}
uniform sampler2D uSrc; uniform vec2 uDir; uniform int uRadius, uBox; uniform float uSigma;
out vec4 o;
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy); ivec2 sz = textureSize(uSrc, 0); vec4 acc = vec4(0.0); float wsum = 0.0;
  for (int i = -uRadius; i <= uRadius; i++) {
    float w = uBox == 1 ? 1.0 : exp(-float(i * i) / (2.0 * uSigma * uSigma)); wsum += w;
    ivec2 q = p + ivec2(uDir) * i; if (q.x < 0 || q.y < 0 || q.x >= sz.x || q.y >= sz.y) continue;
    acc += texelFetch(uSrc, q, 0) * w;
  }
  o = acc / wsum;
}`;

/** Point filters that need the original + a blurred copy, or a small neighbourhood. */
export const FS_FILTER = `#version 300 es
${COMMON}
uniform sampler2D uSrc, uBlur; uniform int uKind; uniform float uA, uB, uC, uD; uniform ivec2 uOrigin; uniform vec2 uCenter;
out vec4 o;
vec4 at(ivec2 q){ return fetch0(uSrc, q); }
vec3 st(vec4 c){ return c.a > 0.0 ? c.rgb / c.a : vec3(0.0); }
vec3 stc(ivec2 q){ ivec2 sz = textureSize(uSrc, 0); return st(texelFetch(uSrc, clamp(q, ivec2(0), sz - 1), 0)); }
vec4 bil(vec2 q){ return bilin(uSrc, q); }
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy); vec4 s = texelFetch(uSrc, p, 0);
  if (uKind == 0) { // unsharp: uA amount, uB threshold
    vec4 b = texelFetch(uBlur, p, 0); if (s.a <= 0.0) { o = s; return; }
    vec3 v = s.rgb / s.a, bv = b.rgb / max(1e-6, b.a), df = v - bv;
    vec3 r = vec3(abs(df.r) >= uB ? v.r + df.r * uA : v.r, abs(df.g) >= uB ? v.g + df.g * uA : v.g, abs(df.b) >= uB ? v.b + df.b * uA : v.b);
    o = vec4(clamp(r, 0.0, 1.0) * s.a, s.a); return; }
  if (uKind == 1) { vec4 b = texelFetch(uBlur, p, 0); if (s.a <= 0.0) { o = s; return; } o = vec4(clamp(s.rgb / s.a - b.rgb / max(1e-6, b.a) + 0.5, 0.0, 1.0) * s.a, s.a); return; } // high pass
  if (uKind == 2) { // motion blur: uA angle rad, uB distance
    vec2 d = vec2(cos(uA), -sin(uA)); int n = max(1, int(floor(uB + 0.5))); vec4 acc = vec4(0.0);
    for (int i = 0; i <= n; i++) { float t = (float(i) / float(n) - 0.5) * uB; acc += bil(gl_FragCoord.xy + d * t); }
    o = acc / float(n + 1); return; }
  if (uKind == 3 || uKind == 4) { // spin / zoom about uCenter (output px), uA amount
    vec2 off = gl_FragCoord.xy - uCenter; vec4 acc = vec4(0.0);
    for (int i = 0; i < 24; i++) { float t = float(i) / 23.0 - 0.5; vec2 q;
      if (uKind == 3) { float a = t * uA * 0.017453292519943295; q = uCenter + vec2(off.x * cos(a) - off.y * sin(a), off.x * sin(a) + off.y * cos(a)); }
      else q = uCenter + off * (1.0 + t * uA / 100.0);
      acc += bil(q); }
    o = acc / 24.0; return; }
  if (uKind == 5) { // pixelate, cell uA aligned to doc grid
    int c = max(1, int(floor(uA + 0.5))); ivec2 g = p + uOrigin; ivec2 cellO = ivec2(floor(vec2(g) / float(c))) * c - uOrigin;
    ivec2 sz = textureSize(uSrc, 0); vec4 acc = vec4(0.0); float n = 0.0;
    for (int j = 0; j < 64; j++) { if (j >= c) break; for (int i = 0; i < 64; i++) { if (i >= c) break; ivec2 q = cellO + ivec2(i, j); if (q.x < 0 || q.y < 0 || q.x >= sz.x || q.y >= sz.y) continue; acc += texelFetch(uSrc, q, 0); n += 1.0; } }
    o = acc / max(1.0, n); return; }
  if (uKind == 6) { // emboss: uA angle rad, uB height, uC amount
    if (s.a <= 0.0) { o = s; return; } vec2 d = vec2(cos(uA), -sin(uA)) * max(1.0, uB);
    vec3 ca = stc(ivec2(floor(vec2(p) - d + 0.5))), cb = stc(ivec2(floor(vec2(p) + d + 0.5)));
    float g = clamp(0.5 + (dot(cb, vec3(0.299, 0.587, 0.114)) - dot(ca, vec3(0.299, 0.587, 0.114))) * uC, 0.0, 1.0);
    o = vec4(vec3(g) * s.a, s.a); return; }
  if (uKind == 7) { // find edges (Sobel)
    if (s.a <= 0.0) { o = s; return; }
    vec3 gx = stc(p + ivec2(1, -1)) + 2.0 * stc(p + ivec2(1, 0)) + stc(p + ivec2(1, 1)) - stc(p + ivec2(-1, -1)) - 2.0 * stc(p + ivec2(-1, 0)) - stc(p + ivec2(-1, 1));
    vec3 gy = stc(p + ivec2(-1, 1)) + 2.0 * stc(p + ivec2(0, 1)) + stc(p + ivec2(1, 1)) - stc(p + ivec2(-1, -1)) - 2.0 * stc(p + ivec2(0, -1)) - stc(p + ivec2(1, -1));
    o = vec4((1.0 - clamp(sqrt(gx * gx + gy * gy) / 4.0, 0.0, 1.0)) * s.a, s.a); return; }
  if (uKind == 8) { // add noise: uA amount (0..1), uB gaussian, uC mono, uD seed
    if (s.a <= 0.0) { o = s; return; } vec3 c = s.rgb / s.a; int X = p.x + uOrigin.x, Y = p.y + uOrigin.y; int sd = int(uD);
    if (uC > 0.5) { float n = uB > 0.5 ? sqrt(-2.0 * log(max(1e-9, hash01(X, Y, sd)))) * cos(6.283185307179586 * hash01(X, Y, sd + 101)) * 0.5 : hash01(X, Y, sd) - 0.5; c += n * uA * 2.0; }
    else for (int k = 0; k < 3; k++) { int sk = sd + k * 7; float n = uB > 0.5 ? sqrt(-2.0 * log(max(1e-9, hash01(X, Y, sk)))) * cos(6.283185307179586 * hash01(X, Y, sk + 101)) * 0.5 : hash01(X, Y, sk) - 0.5; c[k] += n * uA * 2.0; }
    o = vec4(clamp(c, 0.0, 1.0) * s.a, s.a); return; }
  o = s;
}`;

/** Gradient / pattern fill. */
export const FS_FILL = `#version 300 es
${COMMON}
uniform sampler2D uLut; uniform int uShape, uDither, uLinear, uPattern; uniform vec4 uEnds; uniform vec2 uOrigin; uniform float uScale;
uniform sampler2D uPat; uniform vec2 uPatSize; uniform vec4 uPatXf; // (scale, angle, offX, offY)
uniform vec2 uView; // view.x, view.y (doc)
out vec4 o;
void main(){
  vec2 q = gl_FragCoord.xy + uOrigin; // output px in doc*scale space
  if (uPattern == 1) {
    vec2 X = (gl_FragCoord.xy) / uScale + uView - uPatXf.zw; float cs = cos(uPatXf.y), sn = sin(uPatXf.y);
    vec2 u = vec2(X.x * cs + X.y * sn, -X.x * sn + X.y * cs) / uPatXf.x; ivec2 t = ivec2(mod(floor(u), uPatSize));
    vec4 c = texelFetch(uPat, t, 0); if (uLinear == 1 && c.a > 0.0) c.rgb = s2l3(c.rgb / c.a) * c.a; o = c; return; }
  vec2 a = uEnds.xy, b = uEnds.zw, d = b - a; float len2 = max(1e-9, dot(d, d)), len = sqrt(len2); vec2 pp = q - a; float t;
  if (uShape == 0) t = dot(pp, d) / len2; else if (uShape == 3) t = abs(dot(pp, d) / len2);
  else if (uShape == 1) t = length(pp) / len;
  else if (uShape == 2) { float an = atan(pp.y, pp.x) - atan(d.y, d.x); an = mod(an, 6.283185307179586); t = 1.0 - an / 6.283185307179586; }
  else { float u = dot(pp, d) / len, v = (-pp.x * d.y + pp.y * d.x) / len; t = (abs(u) + abs(v)) / len; }
  t = clamp(t, 0.0, 1.0); int i = int(floor(t * 4095.0 + 0.5)); vec4 c = texelFetch(uLut, ivec2(i, 0), 0);
  float n = uDither == 1 ? (hash01(int(floor(q.x)), int(floor(q.y)), 7) - hash01(int(floor(q.x)), int(floor(q.y)), 8)) / 255.0 : 0.0;
  vec3 rgb = c.rgb + n; if (uLinear == 1) rgb = s2l3(clamp(rgb, 0.0, 1.0)); o = vec4(rgb * c.a, c.a);
}`;

/** Final present: flip y, unpremultiply, encode linear → sRGB, optional soft-proof 3D LUT, checkerboard. */
export const FS_PRESENT = `#version 300 es
${COMMON}
uniform sampler2D uSrc; uniform highp sampler3D uProof; uniform int uLinear, uProofOn, uChecker, uStraight, uFlip, uDither; uniform float uProofN;
in vec2 vUv; out vec4 o;
void main(){
  vec2 sz = vec2(textureSize(uSrc, 0)); vec4 c = uFlip == 1 ? texture(uSrc, vec2(vUv.x, 1.0 - vUv.y)) : texelFetch(uSrc, ivec2(gl_FragCoord.xy), 0);
  vec3 rgb = c.a > 0.0 ? c.rgb / c.a : vec3(0.0); if (uLinear == 1) rgb = l2s3(clamp(rgb, 0.0, 1.0));
  if (uProofOn == 1) rgb = texture(uProof, rgb * ((uProofN - 1.0) / uProofN) + 0.5 / uProofN).rgb;
  if (uChecker == 1) { vec2 g = floor(gl_FragCoord.xy / 8.0); float k = mod(g.x + g.y, 2.0) < 1.0 ? 0.92 : 0.78; o = vec4(mix(vec3(k), rgb, c.a), 1.0); return; }
  if (uDither == 1) { ivec2 q = ivec2(gl_FragCoord.xy); rgb += (hash01(q.x, q.y, 11) - hash01(q.x, q.y, 12)) / 255.0; }
  o = uStraight == 1 ? vec4(clamp(rgb, 0.0, 1.0), c.a) : vec4(rgb * c.a, c.a);
}`;
