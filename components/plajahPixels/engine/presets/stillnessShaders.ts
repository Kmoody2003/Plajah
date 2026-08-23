// Stillness shaders — the meditation families.
//
// Separate from the VJ library on purpose. Those shaders are built to be exciting and to react
// to transients; these are built to be ignorable, and the constraints run the opposite way.
//
// THE FOUR UNIFORMS
//
// The shader gallery has a four-parameter ceiling, and the emotional engine emits exactly four
// values, so they map straight onto ShaderLayer's existing iParam slots. That was the point of
// holding the engine to four: any shader in the library can be promoted into a session by
// declaring these.
//
//   iParam0  uBreath  0..1 within the breath cycle, eased. The only value allowed to move
//                     quickly — and even then it takes five to twelve seconds to travel.
//   iParam1  uDepth   0..1 across the session. Scale, distance, slowness.
//   iParam2  uCalm    0..1 inverse arousal. Chroma, detail density, contrast.
//   iParam3  uBloom   an impulse decaying over ~4 s. Light arrives where a sound arrived.
//
// NOT audio-reactive. iBass/iMid/iTreble are deliberately untouched: a drone has no transients,
// so analysis returns noise and the visuals would wander independently of the music. Both
// engines read the same state instead, which is also what keeps an offline render deterministic.
//
// THE RULES THESE OBEY
//
//   No strobing. Measured against a real session, these run at ~1.6 luminance transitions per
//   second of ~0.05-0.08 of full scale each — inside the Harding / ITU-R BT.1702 pair of three
//   flashes per second and 10% per flash, with margin. None of them is capable of a hard
//   transition anyway: every term is a smooth field.
//   Low spatial frequency. Fine detail is stimulating; blur is the aesthetic, not a fallback.
//   Motion slows with depth, toward roughly 0.05 screen-widths per second.
//   A luminance floor, because a fully black frame reads as the stream having died.
//   Saturated red is capped — it is the worst case for photosensitivity and reads as alarm.
//
// NO ROTATION. Radial and mandala families are excluded from the unrepeatable bursts: rotation
// has a period, and anything with a period reads as recoverable — the opposite of a moment that
// will not happen again. They belong to the shared stream.

export interface StillnessShader {
  id: string;
  name: string;
  /** One line for the picker. */
  blurb: string;
  /** Families the design calls out. `radial` is deliberately absent. */
  family: 'aurora' | 'caustics' | 'volumetric' | 'horizon' | 'dust';
  /** Which phases this is written for. The runner picks from these. */
  phases: Array<'arrival' | 'settling' | 'depth' | 'turn' | 'return'>;
  src: string;
}

/**
 * Shared GLSL. Prepended to each shader rather than duplicated.
 *
 * `safe()` is where the gates actually live: every shader ends by passing its colour through it,
 * so the floor, the red cap and the depth desaturation cannot be forgotten in one shader and
 * present in another.
 */
const PRELUDE = `
float hash11(float p){ p = fract(p*0.1031); p *= p+33.33; p *= p+p; return fract(p); }
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash21(i), hash21(i+vec2(1,0)), u.x),
             mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), u.x), u.y);
}

/** Four octaves is plenty. More just adds the fine detail these are supposed to avoid. */
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i=0;i<4;i++){ v += a*vnoise(p); p *= 2.02; a *= 0.5; }
  return v;
}

/** Curl-ish domain warp — fields that form and disperse rather than cycling. */
vec2 warp(vec2 p, float t, float amt){
  float n1 = fbm(p*1.1 + vec2(t*0.06, -t*0.04));
  float n2 = fbm(p*1.1 + vec2(-t*0.05, t*0.07) + 5.2);
  return p + amt*vec2(n1-0.5, n2-0.5);
}

/** Motion budget: slows toward the Depth ceiling. Quadratic, so most of the Depth phase is
 *  already slow rather than only the single instant of the Turn. */
float pace(float depth){ float h = 1.0-depth; return 0.05 + h*h*0.25; }

/** The gates, applied once at the end of every shader. */
vec3 safe(vec3 c, float calm, float depth){
  // Chroma falls with calm and with depth — deeper is closer to monochrome.
  float g = dot(c, vec3(0.299,0.587,0.114));
  c = mix(c, vec3(g), clamp(calm*0.45 + depth*0.35, 0.0, 0.85));
  // Saturated red is the worst case for photosensitivity and reads as alarm regardless.
  float over = max(0.0, c.r - max(c.g, c.b) - 0.18);
  c.r -= over*0.8;
  // Never fully black: a black frame reads as the stream having died.
  return clamp(c, vec3(0.035), vec3(1.0));
}

/** A bloom arriving where a sound arrived. Soft, and gone in about four seconds. */
float bloomAt(vec2 uv, vec2 at, float amount, float depth){
  if(amount < 0.002) return 0.0;
  float r = length(uv-at);
  // Wide and soft. A tight bloom is a flash however slowly it rises; spreading it over most of
  // the frame makes the same energy read as the room brightening rather than a light switching
  // on, and it keeps the per-frame luminance change inside the gate.
  float w = 0.42 + depth*0.40;
  return amount * exp(-(r*r)/(w*w)) * 0.55;
}
`;

const shader = (body: string) => PRELUDE + body;

export const STILLNESS_SHADERS: StillnessShader[] = [
  {
    id: 'still-aurora',
    name: 'Aurora',
    blurb: 'vertical curtains, drifting',
    family: 'aurora',
    phases: ['arrival', 'settling', 'return'],
    src: shader(`
void mainImage(out vec4 o, in vec2 C){
  vec2 R = iResolution.xy;
  vec2 uv = (C - 0.5*R)/R.y;
  float breath = iParam0, depth = iParam1, calm = iParam2, bloom = iParam3;

  float t = iTime * pace(depth);
  // The field expands and contracts with the breath — the screen doing the exercise with you.
  uv /= (0.86 + breath*0.22 + depth*0.18);

  // Curtains: vertical bands whose horizontal position wanders, never repeating.
  float acc = 0.0;
  for(int i=0;i<3;i++){
    float fi = float(i);
    vec2 q = warp(uv*vec2(1.6,0.7) + vec2(fi*3.1, t*0.10), t, 0.55);
    float band = fbm(q + vec2(0.0, uv.y*0.6));
    // Soft vertical falloff so the curtains hang rather than fill.
    float veil = smoothstep(1.05, -0.25, abs(uv.y*1.15 + 0.15 - band*0.5));
    acc += veil * (0.34 - fi*0.07);
  }

  vec3 cool = vec3(0.42, 0.62, 0.86);
  vec3 warm = vec3(0.74, 0.60, 0.92);
  vec3 col = mix(cool, warm, fbm(uv*0.8 + t*0.05)) * acc;

  col += vec3(0.80,0.74,1.0) * bloomAt(uv, vec2(-0.35, 0.10), bloom, depth) * 0.5;
  col += vec3(0.05,0.06,0.10);
  o = vec4(safe(col, calm, depth), 1.0);
}`),
  },
  {
    id: 'still-caustics',
    name: 'Caustics',
    blurb: 'water light on a ceiling',
    family: 'caustics',
    phases: ['settling', 'depth'],
    src: shader(`
void mainImage(out vec4 o, in vec2 C){
  vec2 R = iResolution.xy;
  vec2 uv = (C - 0.5*R)/R.y;
  float breath = iParam0, depth = iParam1, calm = iParam2, bloom = iParam3;

  float t = iTime * pace(depth);
  uv *= (1.18 - breath*0.14 - depth*0.16);

  // Two warped noise fields differenced — the classic caustic ridge, without the sharp edges
  // a true caustic would have. Sharpness here would be detail, and detail is stimulating.
  vec2 p = warp(uv*2.1, t, 0.85);
  float a = fbm(p + vec2(t*0.10, 0.0));
  float b = fbm(p*1.07 + vec2(0.0, -t*0.08) + 11.3);
  float ridge = 1.0 - abs(a-b)*3.4;
  ridge = smoothstep(0.30, 1.0, ridge);
  // Squared, so the bright filaments stay narrow while the ground stays dark and calm.
  ridge *= ridge;

  vec3 water = mix(vec3(0.16,0.30,0.40), vec3(0.55,0.78,0.86), ridge);
  vec3 col = water * (0.16 + ridge*0.72);

  col += vec3(0.70,0.86,0.92) * bloomAt(uv, vec2(0.30,-0.12), bloom, depth) * 0.45;
  o = vec4(safe(col, calm, depth), 1.0);
}`),
  },
  {
    id: 'still-veil',
    name: 'Veil',
    blurb: 'volumetric light through slow noise',
    family: 'volumetric',
    phases: ['settling', 'depth', 'turn'],
    src: shader(`
void mainImage(out vec4 o, in vec2 C){
  vec2 R = iResolution.xy;
  vec2 uv = (C - 0.5*R)/R.y;
  float breath = iParam0, depth = iParam1, calm = iParam2, bloom = iParam3;

  float t = iTime * pace(depth);
  vec2 src = vec2(0.0, 0.62 + breath*0.10);

  // March a few samples toward the light, accumulating density. Twelve steps is enough for a
  // soft shaft and cheap enough to hold 60 fps on a phone.
  float acc = 0.0;
  vec2 dir = (src - uv) / 12.0;
  vec2 s = uv;
  for(int i=0;i<12;i++){
    s += dir;
    float d = fbm(warp(s*1.5, t, 0.4) + vec2(0.0, -t*0.05));
    acc += d * (1.0 - float(i)/12.0);
  }
  acc /= 12.0;

  float halo = exp(-length(uv-src)*(1.6 + depth*0.8));
  vec3 col = vec3(0.62,0.60,0.78) * (acc*1.5) + vec3(0.90,0.86,1.0)*halo*0.30;
  col *= (0.55 + breath*0.35);

  col += vec3(0.86,0.82,1.0) * bloomAt(uv, vec2(-0.28,0.05), bloom, depth) * 0.6;
  o = vec4(safe(col, calm, depth), 1.0);
}`),
  },
  {
    id: 'still-horizon',
    name: 'Horizon',
    blurb: 'almost nothing happening',
    family: 'horizon',
    phases: ['depth'],
    src: shader(`
void mainImage(out vec4 o, in vec2 C){
  vec2 R = iResolution.xy;
  vec2 uv = (C - 0.5*R)/R.y;
  float breath = iParam0, depth = iParam1, calm = iParam2, bloom = iParam3;

  // The stillest thing in the set, and the one written for Depth. Reserve it: there is nothing
  // to look at here, which is the point.
  float t = iTime * pace(depth) * 0.5;

  float h = uv.y + (breath-0.5)*0.05 + fbm(vec2(uv.x*0.7, t*0.12))*0.10 - 0.05;
  float sky = smoothstep(-0.55, 0.75, h);

  vec3 low  = vec3(0.10,0.10,0.16);
  vec3 mid  = vec3(0.30,0.28,0.44);
  vec3 high = vec3(0.16,0.20,0.32);
  vec3 col = mix(low, mid, smoothstep(0.0,0.55,sky));
  col = mix(col, high, smoothstep(0.55,1.0,sky));

  // A single band of light at the horizon, breathing.
  col += vec3(0.42,0.40,0.55) * exp(-abs(h)*(7.0 - breath*2.0)) * 0.34;

  col += vec3(0.70,0.68,0.86) * bloomAt(uv, vec2(0.0,-0.05), bloom, depth) * 0.35;
  o = vec4(safe(col, calm, depth), 1.0);
}`),
  },
  {
    id: 'still-dust',
    name: 'Dust',
    blurb: 'motes, forming and dispersing',
    family: 'dust',
    phases: ['arrival', 'return'],
    src: shader(`
void mainImage(out vec4 o, in vec2 C){
  vec2 R = iResolution.xy;
  vec2 uv = (C - 0.5*R)/R.y;
  float breath = iParam0, depth = iParam1, calm = iParam2, bloom = iParam3;

  float t = iTime * pace(depth);
  float acc = 0.0;

  // Accumulation and dispersal, never orbiting. Each mote drifts on its own irrational rate, so
  // the field never returns to a configuration it has already been in.
  for(int i=0;i<14;i++){
    float fi = float(i);
    float sp = 0.05 + hash11(fi*1.7)*0.09;
    vec2 c = vec2(
      (hash11(fi*3.1)-0.5)*1.7 + sin(t*sp + fi)*0.12,
      fract(hash11(fi*5.3) + t*sp*0.25)*1.5 - 0.75
    );
    float r = length(uv-c);
    float size = 0.020 + hash11(fi*7.9)*0.035 + breath*0.010;
    // Motes fade in and out independently — nothing here has a shared period.
    float life = 0.45 + 0.55*sin(t*sp*1.6 + fi*2.3);
    acc += smoothstep(size, 0.0, r) * max(0.0, life) * 0.42;
  }

  vec3 ground = mix(vec3(0.07,0.07,0.11), vec3(0.13,0.12,0.20), fbm(uv*0.9 + t*0.04));
  vec3 col = ground + vec3(0.78,0.76,0.94)*acc;

  col += vec3(0.84,0.80,1.0) * bloomAt(uv, vec2(0.22,0.18), bloom, depth) * 0.5;
  o = vec4(safe(col, calm, depth), 1.0);
}`),
  },
];

export const stillnessShader = (id: string): StillnessShader | undefined =>
  STILLNESS_SHADERS.find((s) => s.id === id);

/**
 * Which shader a phase should be showing.
 *
 * Deterministic from the seed, so a session's visuals are as reproducible as its audio — the
 * pre-baked headset path and the offline render both depend on that. The choice is made once
 * per phase rather than per frame; changing the field mid-phase would be an event, and the arc
 * has exactly one of those.
 */
export function shaderForPhase(phase: StillnessShader['phases'][number], seed: number): StillnessShader {
  const eligible = STILLNESS_SHADERS.filter((s) => s.phases.includes(phase));
  const pool = eligible.length ? eligible : STILLNESS_SHADERS;
  let h = (seed ^ (phase.length * 0x9e3779b1)) >>> 0;
  for (let i = 0; i < phase.length; i++) h = (Math.imul(h ^ phase.charCodeAt(i), 0x85ebca6b)) >>> 0;
  return pool[(h >>> 8) % pool.length];
}
