// isfPresets — a small starter library of ORIGINAL ISF (Interactive Shader Format)
// shaders, authored for Plajah Pixels. ISF is the shader format VDMX/Resolume use
// (vidvox/ISF spec, MIT) — writing to that spec means anything a user later drops in
// via "Import ISF" (e.g. from vidvox's own MIT-licensed ISF-Files library, or any
// other ISF source they've verified the license of) works the same way these do.
//
// These six are written from scratch for this file — not copied from any external
// shader library — so they carry no third-party licensing question. License: same
// as the rest of Plajah Pixels' first-party shader set (see isfCatalog.ts).

export interface ISFPresetSource { name: string; isf: string; }

export const ISF_PRESETS: ISFPresetSource[] = [
  {
    name: 'ISF Kaleido Mirror',
    isf: `/*{
  "DESCRIPTION": "Polar-mirrored kaleidoscope with adjustable segment count and twist.",
  "CREDIT": "Plajah",
  "CATEGORIES": ["Generator", "Geometry"],
  "INPUTS": [
    { "NAME": "segments", "TYPE": "long", "DEFAULT": 6, "VALUES": [3,4,6,8,12], "LABELS": ["3","4","6","8","12"] },
    { "NAME": "twist", "TYPE": "float", "DEFAULT": 0.4, "MIN": 0.0, "MAX": 2.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord * 2.0 - 1.0;
  uv.x *= RENDERSIZE.x / RENDERSIZE.y;
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float slice = 3.14159265 / segments;
  a = mod(a + TIME * twist * 0.2, 2.0 * slice);
  a = abs(a - slice);
  vec2 q = vec2(cos(a), sin(a)) * r;
  float band = sin(q.x * 10.0 - TIME * twist) * 0.5 + 0.5;
  vec3 col = 0.5 + 0.5 * cos(TIME * 0.3 + band * 6.0 + vec3(0.0, 2.1, 4.2));
  col *= smoothstep(1.0, 0.2, r);
  gl_FragColor = vec4(col, 1.0);
}`,
  },
  {
    name: 'ISF Audio Ring Pulse',
    isf: `/*{
  "DESCRIPTION": "Concentric rings driven by the audio spectrum image.",
  "CREDIT": "Plajah",
  "CATEGORIES": ["Audio Visualizer"],
  "INPUTS": [
    { "NAME": "spectrum", "TYPE": "audioFFT" },
    { "NAME": "glow", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0.0, "MAX": 1.0 }
  ]
}*/
void main() {
  vec2 uv = (isf_FragNormCoord * 2.0 - 1.0);
  uv.x *= RENDERSIZE.x / RENDERSIZE.y;
  float r = length(uv);
  vec3 col = vec3(0.0);
  for (int i = 1; i <= 8; i++) {
    float fi = float(i);
    float fft = IMG_NORM_PIXEL(spectrum, vec2(fi / 9.0, 0.0)).x;
    float ring = abs(r - fi * 0.09 - fft * 0.3);
    float g = (0.004 + glow * 0.01) / (ring + 0.001);
    col += g * (0.5 + 0.5 * cos(TIME + fi * 0.8 + vec3(0.0, 2.1, 4.2)));
  }
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`,
  },
  {
    name: 'ISF Chromatic Drift',
    isf: `/*{
  "DESCRIPTION": "Slow-drifting color field around a fixed center point, tinted.",
  "CREDIT": "Plajah",
  "CATEGORIES": ["Abstract", "Generator"],
  "INPUTS": [
    { "NAME": "center", "TYPE": "point2D", "DEFAULT": [0.5, 0.5] },
    { "NAME": "tint", "TYPE": "color", "DEFAULT": [0.6, 0.2, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "DEFAULT": 0.3, "MIN": 0.0, "MAX": 2.0 }
  ]
}*/
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
}
void main() {
  vec2 uv = isf_FragNormCoord;
  uv.x *= RENDERSIZE.x / RENDERSIZE.y;
  vec2 c = center; c.x *= RENDERSIZE.x / RENDERSIZE.y;
  float t = TIME * speed;
  float n = noise(uv * 4.0 + t) * 0.5 + noise(uv * 8.0 - t * 0.7) * 0.5;
  float d = length(uv - c);
  vec3 col = mix(tint.rgb * 0.3, tint.rgb, n) * exp(-d * 1.4);
  gl_FragColor = vec4(col, tint.a);
}`,
  },
  {
    name: 'ISF Scanline Burn',
    isf: `/*{
  "DESCRIPTION": "CRT-style scanline burn with an optional inverted polarity.",
  "CREDIT": "Plajah",
  "CATEGORIES": ["Cinematic", "Distortion"],
  "INPUTS": [
    { "NAME": "density", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0.05, "MAX": 1.0 },
    { "NAME": "invert", "TYPE": "bool", "DEFAULT": false },
    { "NAME": "baseColor", "TYPE": "color", "DEFAULT": [1.0, 0.55, 0.1, 1.0] }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  float lines = sin(uv.y * RENDERSIZE.y * (4.0 + density * 40.0) - TIME * 6.0) * 0.5 + 0.5;
  float burn = pow(lines, 3.0);
  vec3 col = baseColor.rgb * burn;
  if (invert) col = baseColor.rgb - col;
  float vig = 1.0 - dot(uv - 0.5, uv - 0.5) * 1.4;
  col *= clamp(vig, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}`,
  },
  {
    name: 'ISF Radial Bloom',
    isf: `/*{
  "DESCRIPTION": "Audio-reactive petal bloom, radial symmetry.",
  "CREDIT": "Plajah",
  "CATEGORIES": ["Generator", "Audio Visualizer"],
  "INPUTS": [
    { "NAME": "petals", "TYPE": "long", "DEFAULT": 8, "VALUES": [4,6,8,10,14], "LABELS": ["4","6","8","10","14"] },
    { "NAME": "bloom", "TYPE": "float", "DEFAULT": 0.6, "MIN": 0.0, "MAX": 1.0 },
    { "NAME": "spectrum", "TYPE": "audioFFT" }
  ]
}*/
void main() {
  vec2 uv = (isf_FragNormCoord * 2.0 - 1.0);
  uv.x *= RENDERSIZE.x / RENDERSIZE.y;
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float fft = IMG_NORM_PIXEL(spectrum, vec2(clamp(r, 0.0, 1.0), 0.0)).x;
  float petal = sin(a * petals + TIME * 0.6) * 0.5 + 0.5;
  float shape = smoothstep(0.02, 0.0, abs(r - (0.15 + petal * bloom * 0.4) - fft * 0.2));
  vec3 col = shape * (0.5 + 0.5 * cos(TIME * 0.4 + a * 2.0 + vec3(0.0, 2.1, 4.2)));
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`,
  },
  {
    name: 'ISF Vector Field Flow',
    isf: `/*{
  "DESCRIPTION": "A flowing vector field rendered as streaked directional lines.",
  "CREDIT": "Plajah",
  "CATEGORIES": ["Abstract", "Generator"],
  "INPUTS": [
    { "NAME": "density", "TYPE": "long", "DEFAULT": 24, "VALUES": [12,18,24,32,40], "LABELS": ["12","18","24","32","40"] },
    { "NAME": "turbulence", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0.0, "MAX": 1.5 }
  ]
}*/
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }
void main() {
  vec2 uv = isf_FragNormCoord;
  uv.x *= RENDERSIZE.x / RENDERSIZE.y;
  vec2 cellUv = uv * density;
  vec2 cell = floor(cellUv);
  vec2 local = fract(cellUv) - 0.5;
  float ang = hash(cell) * 6.2831 + TIME * turbulence + sin(cell.x * 0.7 + cell.y * 0.5 + TIME * 0.4) * turbulence;
  vec2 dir = vec2(cos(ang), sin(ang));
  float line = smoothstep(0.06, 0.0, abs(dot(local, vec2(-dir.y, dir.x))));
  line *= smoothstep(0.5, 0.35, abs(dot(local, dir)));
  vec3 col = line * (0.5 + 0.5 * cos(ang + vec3(0.0, 2.1, 4.2)));
  gl_FragColor = vec4(col, 1.0);
}`,
  },
];
