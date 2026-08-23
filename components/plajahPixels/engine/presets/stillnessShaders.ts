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
// THE SOUND, SUBTLY
//
// Structure comes from the four uniforms above and nothing else. That is deliberate: a drone has
// no transients, so an FFT-driven layout would wander independently of the music, and an offline
// render would not match a live one.
//
// But the sound is allowed to BREATHE into the picture. iBass/iMid/iTreble ride heavily smoothed
// (the players set smoothingTimeConstant to 0.92, roughly a one-second window), and they modulate
// only intensity and chroma — never position, never scale, never anything that would move if the
// analysis jittered. Read them through `voice()`, which floors and softens them further, so a
// shader cannot accidentally make them structural.
//
//   iBass    the drone under everything — ISON. Ground luminance.
//   iMid     the sung body — CANTUS. Chroma and warmth.
//   iTreble  breath and air — PNEUMA. Filament brightness, sparkle.
//
// The test for whether a use is legitimate: if the audio froze, would the picture stop MOVING, or
// only stop shimmering? Only the second is allowed.
//
// THE RULES THESE OBEY
//
// TWO HOSTS, ONE SHADER
//
// `iSanctuary` is 1 in Stillness and on channel 8.1, and 0 in the Pixels studio. Everything
// below describes the sanctuary behaviour. Loaded as an ordinary clip these run about four times
// faster with the colour gates off — the same field, unbound. The rules are constraints of the
// meditative CONTEXT, not properties of the shaders, and the code should say which is which.
//
//   NOTHING ZOOMS. The breath must never scale the frame. A field that grows and shrinks reads
//   as a camera pushing in and pulling out — motion the viewer's body did not initiate, which is
//   vection on a screen and nausea in a headset, and on a channel left on for hours it is the
//   one thing that becomes unbearable rather than unnoticeable. Breath is expressed as
//   luminance, density, softness and lateral drift, all of which are felt without being watched.
//   No shader may multiply or divide `uv` by anything derived from uBreath.
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
  // These rates multiply through every field that warps, so they are the single biggest lever on
  // how fast the whole set feels. Halved.
  float n1 = fbm(p*1.1 + vec2(t*0.030, -t*0.020));
  float n2 = fbm(p*1.1 + vec2(-t*0.025, t*0.035) + 5.2);
  return p + amt*vec2(n1-0.5, n2-0.5);
}

/** The quadratic depth term, split out so pace() stays readable. */
float h_(float depth){ float h = 1.0-depth; return h*h*0.075; }

/**
 * Motion budget.
 *
 * Roughly a third of what it was. The old ceiling of 0.30 was set against the design target of
 * "under 0.05 screen-widths per second" — but that target describes the field's DRIFT, and every
 * shader also has its own internal rates multiplying through it, so the thing you actually watch
 * was moving several times faster than the number suggested. On a channel left on for hours, the
 * difference between slow and very slow is the difference between something you stop noticing
 * and something you keep noticing.
 *
 * Still quadratic in depth, so most of the Depth phase is already near-still rather than only
 * the single instant of the Turn.
 */
float pace(float depth){
  float slow = 0.016 + h_(depth);
  // Outside a meditative host these are ordinary Pixels clips and may move like one. Four times
  // the motion is still gentle by VJ standards and is roughly where they sat before.
  return mix(slow*4.0, slow, iSanctuary);
}

/**
 * The gates, applied once at the end of every shader.
 *
 * The desaturation here used to be a blanket pull toward grey of up to 0.85, which is why every
 * field read as colourless — at rest, with calm high and depth low, it was already throwing away
 * nearly half the chroma before anything else happened.
 *
 * The rule it was reaching for is real but was stated too broadly. What is stimulating is
 * SATURATED WARMTH — reds and oranges at high value. Cool chroma at low value is the opposite;
 * it is what a dim room at dusk looks like. So the pull is now hue-aware: warm hues lose chroma
 * as calm and depth rise, cool hues keep nearly all of theirs. Deep is now blue and violet rather
 * than grey, which is both more restful and considerably better to look at.
 */
vec3 safe(vec3 c, float calm, float depth){
  // In the VJ studio the gates come off: full chroma, no red cap, no floor. A field that is
  // restful on channel 8.1 has no reason to be restrained on a stage.
  if (iSanctuary < 0.5) return clamp(c, vec3(0.0), vec3(1.0));
  float g = dot(c, vec3(0.299,0.587,0.114));
  // How warm is this pixel? 1 at pure red/orange, 0 at cyan/blue.
  float warmth = clamp((c.r - c.b)*1.6 + 0.15, 0.0, 1.0);
  // Warm content is pulled hard; cool content is barely touched.
  float pull = (0.10 + calm*0.10 + depth*0.14) + warmth*(0.30 + depth*0.34);
  c = mix(c, vec3(g), clamp(pull, 0.0, 0.80));
  // Saturated red is the worst case for photosensitivity and reads as alarm regardless.
  float over = max(0.0, c.r - max(c.g, c.b) - 0.18);
  c.r -= over*0.8;
  // Never fully black: a black frame reads as the stream having died.
  return clamp(c, vec3(0.035), vec3(1.0));
}

/**
 * An audio band, made safe to use.
 *
 * Floors it so a silent passage does not black the field out, compresses the top so a loud one
 * cannot spike, and biases toward 1 — the audio should lift the picture a little, not gate it.
 * Everything a shader does with sound goes through here, which is what keeps the influence
 * subtle by construction rather than by each shader remembering to be careful.
 */
float voice(float band, float amount){
  float v = clamp(band, 0.0, 1.0);
  v = sqrt(v);                       // compress: the top of the range is where drones live
  return 1.0 + amount*(v - 0.45);
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
  // Depth may scale the frame — it moves once across twenty minutes, far too slowly to read as
  // camera motion. Breath may not: see the rule at the top of this file.
  uv /= (0.97 + depth*0.18);

  // Curtains: vertical bands whose horizontal position wanders, never repeating.
  float acc = 0.0;
  for(int i=0;i<3;i++){
    float fi = float(i);
    vec2 q = warp(uv*vec2(1.6,0.7) + vec2(fi*3.1, t*0.10), t, 0.55);
    float band = fbm(q + vec2(0.0, uv.y*0.6));
    // Soft vertical falloff so the curtains hang rather than fill.
    // Breath instead reaches the curtain's height: it hangs lower and fills more on the in-
    // breath. The frame never changes size, so nothing reads as movement toward the viewer.
    float veil = smoothstep(1.05 + breath*0.20, -0.25, abs(uv.y*1.15 + 0.15 - band*0.5));
    acc += veil * (0.34 - fi*0.07) * (0.86 + breath*0.20);
  }

  // Three colours rather than two, so the curtain has a gradient through it instead of a blend
  // between two neighbours. Teal at the feet, through a cold blue, to violet at the tips — the
  // real thing's own progression, and none of it warm enough to be activating.
  vec3 foot = vec3(0.10, 0.52, 0.50);
  vec3 mid  = vec3(0.24, 0.44, 0.86);
  vec3 tip  = vec3(0.62, 0.40, 0.95);
  float h = clamp(fbm(uv*0.8 + t*0.05)*1.3 - uv.y*0.35 + 0.35, 0.0, 1.0);
  vec3 col = (h < 0.5 ? mix(foot, mid, h*2.0) : mix(mid, tip, (h-0.5)*2.0)) * acc;

  // CANTUS lifts the violet in the tips; PNEUMA puts air in the very top of the curtain.
  col *= voice(iMid, 0.22);
  col += tip * acc*acc * 0.35 * (voice(iTreble, 0.5) - 0.78);

  col += vec3(0.80,0.74,1.0) * bloomAt(uv, vec2(-0.35, 0.10), bloom, depth) * 0.5;
  // The ground glow sits on the drone. It is the only place ISON is visible, and it moves by
  // maybe a tenth of a stop — enough to feel, not enough to watch.
  col += vec3(0.045,0.055,0.105) * voice(iBass, 0.35);
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
  uv *= (1.11 - depth*0.16);

  // Two warped noise fields differenced — the classic caustic ridge, without the sharp edges
  // a true caustic would have. Sharpness here would be detail, and detail is stimulating.
  vec2 p = warp(uv*2.1, t, 0.85);
  float a = fbm(p + vec2(t*0.10, 0.0));
  float b = fbm(p*1.07 + vec2(0.0, -t*0.08) + 11.3);
  float ridge = 1.0 - abs(a-b)*3.4;
  ridge = smoothstep(0.30, 1.0, ridge);
  // Squared, so the bright filaments stay narrow while the ground stays dark and calm.
  ridge *= ridge;

  // Deep green-teal in the troughs rising to a pale aqua on the filaments, with a slow wander
  // toward indigo across the frame so the whole field is never one colour at once.
  float tide = fbm(uv*0.55 + vec2(t*0.03, -t*0.02));
  vec3 deepC = mix(vec3(0.05,0.20,0.26), vec3(0.10,0.14,0.34), tide);
  vec3 lit   = mix(vec3(0.52,0.86,0.88), vec3(0.62,0.74,0.98), tide);
  // Breath is the light above the water getting stronger and weaker, which is what actually
  // happens to caustics — the pattern holds still and the brightness moves through it.
  vec3 col = mix(deepC, lit, ridge) * (0.20 + ridge*0.78) * (0.84 + breath*0.26);

  // Air on the filaments only — the ridges brighten with PNEUMA while the ground stays put,
  // which reads as the light on the water moving rather than the water.
  col += lit * ridge*ridge * 0.30 * (voice(iTreble, 0.6) - 0.73);
  col *= voice(iBass, 0.16);

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
  // Fixed. The source used to drift up and down with the breath, which is a slow vertical pan —
  // milder than a zoom but the same category of unrequested motion.
  vec2 src = vec2(0.0, 0.66);

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

  // Light through a medium picks up colour on the way, and the far end of a shaft is always
  // cooler than its source — Rayleigh, roughly, and the reason a sunbeam in dust goes gold at
  // the window and blue in the room. The shaft is graded along its own length by how much
  // density it has come through.
  vec3 nearC = vec3(0.86, 0.78, 0.62);
  vec3 farC  = vec3(0.36, 0.44, 0.82);
  float travel = clamp(length(uv - src)*0.85, 0.0, 1.0);
  vec3 shaft = mix(nearC, farC, travel);

  vec3 col = shaft * (acc*1.55) + vec3(0.96,0.90,0.98)*halo*0.32;
  col *= (0.55 + breath*0.35);
  // CANTUS warms the near end of the shaft. It is the only warm thing in the set, and safe()
  // pulls it back as depth rises — so the beam cools as the session goes down, on its own.
  col += nearC * halo * 0.16 * (voice(iMid, 0.55) - 0.75);
  col *= voice(iBass, 0.14);

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

  // The stillest field can afford the most colour, because nothing in it moves. This is the
  // twenty minutes after sunset: deep indigo below, a band of rose and amber at the line, cold
  // blue climbing above it. All of it low-value, none of it saturated enough to be a light.
  vec3 low  = vec3(0.06,0.07,0.15);
  vec3 mid  = vec3(0.34,0.24,0.38);
  vec3 high = vec3(0.10,0.17,0.34);
  vec3 col = mix(low, mid, smoothstep(0.0,0.55,sky));
  col = mix(col, high, smoothstep(0.55,1.0,sky));

  // A single band of light at the horizon, breathing. Amber into rose, and the only place in
  // the set where warmth is allowed to sit — one narrow line, far from the eye's centre.
  float band = exp(-abs(h)*(7.0 - breath*2.0));
  vec3 ember = mix(vec3(0.72,0.44,0.34), vec3(0.62,0.40,0.60), 0.35 + 0.35*sin(t*0.4));
  col += ember * band * 0.38 * voice(iMid, 0.20);

  // The drone under the whole sky. A tenth of a stop on the ground, nothing else.
  col *= voice(iBass, 0.18);

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
  vec3 tint = vec3(0.0);

  // Accumulation and dispersal, never orbiting. Each mote drifts on its own irrational rate, so
  // the field never returns to a configuration it has already been in.
  for(int i=0;i<14;i++){
    float fi = float(i);
    float sp = 0.05 + hash11(fi*1.7)*0.09;
    // Vertical drift used to be fract(), which teleports a mote from the top of the frame to the
    // bottom every time it wraps — a hard cut, in a set whose whole premise is that nothing cuts.
    // A slow sine on an irrational-ish rate wanders instead, and never wraps.
    vec2 c = vec2(
      (hash11(fi*3.1)-0.5)*1.7 + sin(t*sp + fi)*0.12,
      (hash11(fi*5.3)-0.5)*1.5 + sin(t*sp*0.37 + fi*1.7)*0.22
    );
    float r = length(uv-c);
    float size = 0.020 + hash11(fi*7.9)*0.035;
    // Motes fade in and out independently — nothing here has a shared period.
    // Fade rate slowed to match: a mote used to complete a full appear-and-vanish cycle in
    // about a minute and a half, which on a still field is a visible pulse.
    float life = 0.45 + 0.55*sin(t*sp*0.7 + fi*2.3);
    // Breath brightens the motes rather than swelling them. Every mote growing together is a
    // zoom in disguise: the field appears to approach even though nothing has moved.
    float m = smoothstep(size, 0.0, r) * max(0.0, life) * 0.42 * (0.82 + breath*0.30);
    acc += m;
    // Each mote carries its own hue, drawn from its index rather than its position, so the
    // field is a scatter of colours instead of one colour at different brightnesses.
    tint += m * mix(vec3(0.42,0.72,0.92), vec3(0.86,0.62,0.94), hash11(fi*11.3));
  }

  // A ground that is not one colour: teal in some corners, violet in others, wandering slowly
  // enough that you would have to watch for a minute to catch it changing.
  float wash = fbm(uv*0.9 + t*0.04);
  float wash2 = fbm(uv*0.6 - t*0.03 + 21.0);
  vec3 ground = mix(vec3(0.05,0.10,0.14), vec3(0.13,0.09,0.20), wash);
  ground = mix(ground, vec3(0.07,0.13,0.19), wash2*0.5);

  // Air moves the motes' brightness, not their positions — the field shimmers, it does not
  // dance. PNEUMA is the breath instrument, so this is the one place it should be visible.
  vec3 col = ground + tint * voice(iTreble, 0.45);
  col *= voice(iBass, 0.12);

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
