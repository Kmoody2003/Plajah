// fluxBrand — the Plajah logo gradient as a GLSL recolour for the Flux scenes.
//
// The logo ramp (styles/plajah-ds.css --pj-purple → --pj-magenta → --pj-orange, #6B0099 → #D40055 →
// #FF8C00) in linear light, looped purple → magenta → orange → magenta → purple so it can cycle.
// `plajahBrand(c, shift)` keeps a colour's brightness (value) and structure but moves its hue onto
// the ramp; the source hue and brightness pick the position (bright → orange end), so a scene's own palette variation
// becomes variation along the brand gradient. Near-white cores keep the brand hue with only a light
// lift toward white, and highlights roll off above 1.0, so the bloom glows in colour, not white.
// `shift` slides along the ramp (spec.hue, slow time drift).
export const PLAJAH_BRAND_GLSL = `
vec3 plajahRamp(float t){
  t = fract(t);
  float s = 1.0 - abs(2.0 * t - 1.0);
  vec3 P = vec3(0.152, 0.0, 0.319), Mg = vec3(0.658, 0.0, 0.091), O = vec3(1.0, 0.262, 0.0);
  return s < 0.5 ? mix(P, Mg, s * 2.0) : mix(Mg, O, s * 2.0 - 1.0);
}
vec3 plajahBrand(vec3 c, float shift){
  float v = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), ch = v - mn;
  float sat = v > 1e-4 ? ch / v : 0.0;
  float h = 0.0;
  if (ch > 1e-4) {
    if (v == c.r) h = mod((c.g - c.b) / ch, 6.0);
    else if (v == c.g) h = (c.b - c.r) / ch + 2.0;
    else h = (c.r - c.g) / ch + 4.0;
    h /= 6.0;
  }
  // Hue spreads the scene's own variation; brightness walks dark → purple, bright → orange like the logo.
  vec3 b = plajahRamp(h * 1.5 + clamp(v, 0.0, 1.5) * 0.4 + shift);
  b /= max(b.r, max(b.g, b.b));
  // Highlights roll off above 1.0 so the bloom glows in colour instead of blowing out to white,
  // and near-white cores keep the brand hue (only a light lift toward white).
  float vv = v > 1.0 ? 1.0 + (v - 1.0) * 0.45 : v;
  vec3 core = mix(b, vec3(1.0), 0.16) * vv;
  return mix(core, b * vv, smoothstep(0.08, 0.4, sat));
}
`;
