// GLSL for the original shader lenses (Big Face, Night, Heat, Aura); Matrix/Comic/South Park/Pixel/ASCII
// live in lensShadersArt.ts, the film/tape looks in lensShadersFilm.ts. Both read the composited frame as `uTex`
// (canvas uploaded un-flipped, so uv (0,0) is the TOP-left — VERT flips y to match).

export const LENS_VERT = `#version 300 es
in vec2 p; out vec2 vUv;
void main(){ vUv = vec2(p.x*0.5+0.5, 1.0-(p.y*0.5+0.5)); gl_Position = vec4(p,0.0,1.0); }`;

export const NOISE = `
float h11(float p){ p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }
float h21(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
`;

// ── BIG FACE — "big eyes, big mouth": a local magnifying bulge over each tracked eye and mouth, and
//    nothing else. The engine passes up to 9 bulges (3 faces × eyes + mouth) as (cx, cy, radius, strength)
//    in canvas px; each pulls the sample point toward its centre, magnifying 1/(1-strength) at the middle
//    and blending to no change at the rim, so the rest of the picture is untouched. ──
export const BIGFACE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform vec2 uRes;
uniform vec4 uBulge[9]; uniform int uN;
void main(){
  vec2 p = vUv * uRes;
  for(int i = 0; i < 9; i++){
    if(i >= uN) break;
    vec2 d = p - uBulge[i].xy;
    float r = length(d) / uBulge[i].z;
    if(r < 1.){
      float k = 1. - r * r;
      p = uBulge[i].xy + d * (1. - uBulge[i].w * k * k);
    }
  }
  frag = vec4(texture(uTex, p / uRes).rgb, 1.);
}`;

// ── NIGHT VISION — goggle phosphor: shadow-lifting gain, live grain, scanlines + a rolling bar, a round
//    goggle vignette, and highlight bloom. ──
export const NIGHT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform vec2 uRes; uniform float uT;
${NOISE}
const vec3 LW = vec3(.299, .587, .114);
void main(){
  vec3 c = mix(texture(uTex, vUv).rgb, textureLod(uTex, vUv, 1.6).rgb, .4);   // light denoise + bloom source
  float l = dot(c, LW);
  float g = pow(clamp(l, 0., 1.), .62) * 1.2;                                 // lift the shadows without flattening the highlights
  float n = h21(vUv * uRes + fract(uT) * 91.7);
  g += (n - .5) * .26 * (1. - g * .5);                                        // live sensor grain
  g *= .86 + .14 * sin(vUv.y * uRes.y * 3.14159);                             // scanlines
  g += .05 * smoothstep(0., .18, sin(vUv.y * 6. - uT * 2.2));                 // rolling bar
  vec2 q = (vUv - .5) * vec2(uRes.x / uRes.y, 1.) * 1.1;
  g *= smoothstep(.95, .42, length(q));                                       // goggle vignette
  g = clamp(g, 0., 1.4);
  vec3 col = vec3(.1, 1., .22) * g + vec3(.55, 1., .65) * pow(clamp(g, 0., 1.), 4.) * .55;
  frag = vec4(col, 1.);
}`;

// ── HEAT MAP — thermal camera: blocky low-res sensor look, brightness read as heat, YOU run hotter than
//    the room (person matte), a warm halo, shimmer, and a temperature legend bar. ──
export const HEAT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform sampler2D uMask;
uniform vec2 uRes; uniform float uT; uniform float uHasMask;
uniform vec2 uMapA; uniform vec2 uMapB;
${NOISE}
const vec3 LW = vec3(.299, .587, .114);
float mk(vec2 off){ return texture(uMask, (vUv + off) * uMapA + uMapB).r; }
float dil(float r){
  float m = 0.; vec2 s = r / uRes;
  for(int i=0;i<8;i++){ float a = float(i) * .785398; m = max(m, mk(vec2(cos(a), sin(a)) * s)); }
  return m;
}
vec3 pal(float t){                         // ironbow: black → indigo → magenta → orange → yellow → white
  t = clamp(t, 0., 1.) * 5.;
  vec3 c0 = vec3(0., 0., .04), c1 = vec3(.22, 0., .45), c2 = vec3(.72, .08, .38), c3 = vec3(1., .42, .04), c4 = vec3(1., .9, .25), c5 = vec3(1.);
  if(t < 1.) return mix(c0, c1, t);
  if(t < 2.) return mix(c1, c2, t - 1.);
  if(t < 3.) return mix(c2, c3, t - 2.);
  if(t < 4.) return mix(c3, c4, t - 3.);
  return mix(c4, c5, t - 4.);
}
void main(){
  vec2 px = vUv * uRes;
  vec2 buv = (floor(px / 4.) * 4. + 2.) / uRes;                   // chunky thermal-sensor pixels
  float l = dot(textureLod(uTex, buv, 2.).rgb, LW);
  float heat = pow(clamp(l, 0., 1.), .8);
  if (uHasMask > .5) {
    float m = smoothstep(.42, .58, mk(vec2(0.)));
    float halo = clamp(smoothstep(.42, .58, dil(16.)) - m, 0., 1.);
    heat = mix(heat * .5, .5 + heat * .55, m);                    // body hot, room cool
    heat += halo * .14;
  }
  heat += (vn(px / 34. + vec2(0., uT * .6)) - .5) * .05;          // heat shimmer
  vec3 col = pal(heat);
  if (vUv.x > .94 && vUv.x < .965 && vUv.y > .25 && vUv.y < .75) {   // legend bar
    col = pal(1. - (vUv.y - .25) / .5);
  }
  frag = vec4(col, 1.);
}`;

// ── AURA — a living halo around the person (needs the matte), coloured by the estimated emotion
//    (uAuraA inner → uAuraB outer; uAuraAmt = how strongly they are feeling it), drifting upward like
//    flame, with sparkle motes and a wrap-light on the silhouette. ──
export const AURA_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 frag;
uniform sampler2D uTex; uniform sampler2D uMask;
uniform vec2 uRes; uniform float uT; uniform float uHasMask;
uniform vec2 uMapA; uniform vec2 uMapB;
uniform vec3 uAuraA; uniform vec3 uAuraB; uniform float uAuraAmt;
${NOISE}
float mk(vec2 off){ return texture(uMask, (vUv + off) * uMapA + uMapB).r; }
float dil(float r){
  float m = 0.; vec2 s = r / uRes;
  for(int i=0;i<8;i++){ float a = float(i) * .785398; m = max(m, mk(vec2(cos(a), sin(a)) * s)); }
  return m;
}
float ero(float r){
  float m = 1.; vec2 s = r / uRes;
  for(int i=0;i<8;i++){ float a = float(i) * .785398; m = min(m, mk(vec2(cos(a), sin(a)) * s)); }
  return m;
}
void main(){
  vec2 px = vUv * uRes;
  vec3 scene = texture(uTex, vUv).rgb;
  float m = 0., halo = 0., inner = 0.;
  if (uHasMask > .5) {
    m = smoothstep(.42, .58, mk(vec2(0.)));
    float h1 = smoothstep(.4, .6, dil(9.)), h2 = smoothstep(.4, .6, dil(26.)), h3 = smoothstep(.4, .6, dil(58.));
    halo = clamp(.55 * h1 + .38 * h2 + .3 * h3 - m, 0., 1.);
    inner = clamp(m - smoothstep(.4, .6, ero(6.)), 0., 1.);
  } else {                                                        // no cut-out yet: glow from the frame edges
    float e = min(min(vUv.x, 1. - vUv.x), min(vUv.y, 1. - vUv.y));
    halo = smoothstep(.2, .0, e) * .8;
  }
  float n = vn(px / 48. + vec2(0., -uT * 1.5)) * .6 + vn(px / 20. + vec2(uT * .6, -uT * 2.3)) * .4;
  float flame = smoothstep(.12, .85, halo * (.55 + .9 * n));
  float outward = clamp(smoothstep(.95, .15, halo) + (n - .5) * .35, 0., 1.);
  vec3 aura = mix(uAuraA, uAuraB, outward);
  float pulse = .86 + .14 * sin(uT * 2.4 + n * 3.);
  float amt = .55 + .75 * uAuraAmt;
  vec3 col = scene * (1. - flame * .3);
  col += aura * flame * 1.7 * amt * pulse;                        // the glow
  col += aura * inner * .55 * amt;                                // wrap-light on you
  float mote = step(.993, h21(floor(px / 3.) + floor(uT * 7.))) * halo;
  col += vec3(1., .95, .85) * mote * .9;                          // drifting sparks
  frag = vec4(clamp(col, 0., 1.), 1.);
}`;
