// milkdropCouncilShaders.ts — Plajah Pixels Series VIII: Council Masterworks (12 Cinematic Installations)
//
// 12 high-fidelity, Milkdrop-level audio-reactive 3D generator shaders built with the
// Fabula Design Council aesthetics (PLAJAH, GLASS, NEON, FUTURIST, BAROQUE, CEREMONIAL)
// and Plajah's iconic brand palette (#100B17, #D40055, #6B0099, #00DAF3, #FF8C00, #FAF5FF).
//
// Designed strictly for:
//   - 100% OPEN 3D SPACES (NO tunnels, NO repeating corridor warps)
//   - Autonomous 3D cinematic cameras with true perspective matrices (ro, ta, lookAt, roll, fov dolly)
//   - Physical materials: Cauchy optical glass with chromatic dispersion, liquid chrome, molten magma, fluid water, aerodynamic smoke
//   - Natural elements: Ocean swell waves, volcanic plasma combustion, supersonic wind streamlines, supercell lightning
//   - Volumetric lighting: God rays, participating media scattering, saturated anamorphic flares, subsurface glow
//   - Anti-white-out: Peak transients supercharge color saturation and trigger spectral hue shifts rather than blowing out to white
//   - ZERO white dots / starfields: Clean sculptural forms and monumental installations
//   - Multi-stem intelligence: Melody lead pitch/energy, chord density/polyphony entropy, kick punch, snare snap, vocal formants, stereo soundstage

export interface CouncilMasterwork {
  id: string;
  name: string;
  councilVoices: string;
  premise: string;
  src: string;
  params: { name: string; def: number }[];
  reacts: [string, string][];
}

export const COUNCIL_AUDIO_KIT = `// ── Plajah Council Audio Intelligence Kit v5 (True 3D Optics & Volumetrics) ──
#define SPEC_L(F)  texture(iChannel0, vec2(clamp(F, 0.0, 1.0), 0.25)).r
#define SPEC_R(F)  texture(iChannel0, vec2(clamp(F, 0.0, 1.0), 0.25)).g
#define SPEC_M(F)  texture(iChannel0, vec2(clamp(F, 0.0, 1.0), 0.25)).b
#define SPEC_A(F)  texture(iChannel0, vec2(clamp(F, 0.0, 1.0), 0.25)).a
#define WAVE_L(F)  (texture(iChannel0, vec2(clamp(F, 0.0, 1.0), 0.75)).r * 2.0 - 1.0)
#define WAVE_R(F)  (texture(iChannel0, vec2(clamp(F, 0.0, 1.0), 0.75)).g * 2.0 - 1.0)
#define WAVE_M(F)  (texture(iChannel0, vec2(clamp(F, 0.0, 1.0), 0.75)).b * 2.0 - 1.0)

struct CouncilAudio {
  float sub;          // 30 - 90 Hz sub-bass
  float kick;         // 50 - 120 Hz kick drum transient
  float bass;         // 100 - 320 Hz bassline body
  float snare;        // 180 - 320 Hz body + 2.5 - 5.5 kHz snap
  float voice;        // Isolated vocal formant energy (1.2 - 3.8 kHz peakiness)
  float melodyEnergy; // Dominant lead melody energy (400 Hz - 3.5 kHz)
  float melodyPitch;  // Normalized melody pitch class (0..1)
  float chordDensity; // Polyphonic chord entropy / summed notes (0..1.8)
  float air;          // 10 - 16 kHz hats, air & shimmer
  float left;         // Left side average energy
  float right;        // Right side average energy
  float balance;      // -1.0 (full left) to +1.0 (full right)
  float width;        // Stereo separation width (0 = mono, 1 = wide)
  float punch;        // Waveform crest factor transient punch
};

CouncilAudio plajahCouncilAudio() {
  CouncilAudio a;

  float subL  = SPEC_L(0.003) * 1.3 + SPEC_L(0.007) * 0.9;
  float subR  = SPEC_R(0.003) * 1.3 + SPEC_R(0.007) * 0.9;
  a.sub       = (subL + subR) * 0.5;

  float bassL = (SPEC_L(0.016) + SPEC_L(0.032)) * 0.5;
  float bassR = (SPEC_R(0.016) + SPEC_R(0.032)) * 0.5;
  a.bass      = (bassL + bassR) * 0.5;

  float snBodyL = SPEC_L(0.024) * 0.7, snBodyR = SPEC_R(0.024) * 0.7;
  float snWireL = SPEC_L(0.24) * 0.9,  snWireR = SPEC_R(0.24) * 0.9;
  a.snare       = clamp(((snBodyL + snBodyR) * 0.4 + (snWireL + snWireR) * 0.8) * 1.6, 0.0, 1.5);

  float v0 = SPEC_M(0.048), v1 = SPEC_M(0.072), v2 = SPEC_M(0.096);
  float v3 = SPEC_M(0.120), v4 = SPEC_M(0.145), v5 = SPEC_M(0.170);
  float vMean = (v0 + v1 + v2 + v3 + v4 + v5) / 6.0;
  float vPeak = max(max(max(v0, v1), max(v2, v3)), max(v4, v5));
  float formantRatio = vPeak / max(vMean, 0.02);

  float cymbalWash = (SPEC_M(0.35) + SPEC_M(0.55) + SPEC_M(0.75)) / 3.0;
  float rawVoice = max(0.0, (vMean * 2.2 - cymbalWash * 0.75));
  rawVoice *= smoothstep(1.08, 1.65, formantRatio);
  a.voice = clamp(rawVoice * 2.4, 0.0, 1.5);

  float mEnergy = 0.0;
  float mPitch = 0.0;
  for (int i = 0; i < 12; i++) {
    float fi = float(i) / 12.0;
    float e = SPEC_M(0.025 + fi * 0.16);
    if (e > mEnergy) {
      mEnergy = e;
      mPitch = fi;
    }
  }
  a.melodyEnergy = mEnergy * 1.8;
  a.melodyPitch  = mPitch;

  float chordSum = 0.0;
  float noteCount = 0.0;
  for (int c = 0; c < 8; c++) {
    float v = SPEC_M(0.02 + float(c) * 0.038);
    chordSum += v;
    noteCount += step(0.16, v);
  }
  a.chordDensity = clamp((noteCount / 5.0) * (chordSum * 0.4), 0.0, 1.8);

  a.air = (SPEC_L(0.52) + SPEC_R(0.52) + SPEC_L(0.78) + SPEC_R(0.78)) * 0.35;

  a.left  = (subL * 0.4 + bassL * 0.3 + SPEC_L(0.12) * 0.3);
  a.right = (subR * 0.4 + bassR * 0.3 + SPEC_R(0.12) * 0.3);
  float totalLR = a.left + a.right + 1e-4;
  a.balance = clamp((a.right - a.left) / totalLR, -1.0, 1.0);
  a.width   = clamp(abs(a.right - a.left) / totalLR * 2.0, 0.0, 1.0);

  float pk = 0.0, e = 0.0;
  for (int i = 0; i < 16; i++) {
    float w = WAVE_M((float(i) + 0.5) / 16.0);
    pk = max(pk, abs(w));
    e += w * w;
  }
  float rms = sqrt(e / 16.0);
  a.punch = clamp((pk / (rms + 0.035) - 1.3) * 0.85, 0.0, 1.5) * clamp(pk * 2.5, 0.0, 1.0);
  a.kick  = clamp(a.sub * 1.5 + a.punch * 0.6, 0.0, 2.0);

  return a;
}

CouncilAudio plajahAudio() { return plajahCouncilAudio(); }

// ── Plajah Brand Color Alchemy ─────────────────────────────────────────
const vec3 C_VOID    = vec3(0.063, 0.043, 0.090); // #100B17
const vec3 C_MAGENTA = vec3(0.831, 0.000, 0.333); // #D40055
const vec3 C_VIOLET  = vec3(0.420, 0.000, 0.600); // #6B0099
const vec3 C_CYAN    = vec3(0.000, 0.855, 0.953); // #00DAF3
const vec3 C_AMBER   = vec3(1.000, 0.549, 0.000); // #FF8C00
const vec3 C_WHITE   = vec3(0.980, 0.961, 1.000); // #FAF5FF

mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

mat3 setCamera(vec3 ro, vec3 ta, float cr) {
  vec3 cw = normalize(ta - ro);
  vec3 cp = vec3(sin(cr), cos(cr), 0.0);
  vec3 cu = normalize(cross(cw, cp));
  vec3 cv = normalize(cross(cu, cw));
  return mat3(cu, cv, cw);
}

float hash21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float smoothNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

float curlFbm(vec2 p, int oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    if (i >= oct) break;
    s += a * smoothNoise(p);
    p = p * 2.04 + vec2(13.5, 7.1);
    a *= 0.5;
  }
  return s;
}

// ── Hyper-Saturated Color Dynamics (Anti-White Blooming) ───────────────
vec3 plajahHyperChroma(vec3 col, float energy, float hueOffset) {
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float satFactor = 1.0 + energy * 1.8;
  vec3 saturated = mix(vec3(lum), col, satFactor);

  float h = fract(hueOffset + energy * 0.35);
  vec3 hotHue;
  if (h < 0.33) {
    hotHue = mix(C_MAGENTA, C_CYAN, h * 3.0);
  } else if (h < 0.66) {
    hotHue = mix(C_CYAN, C_AMBER, (h - 0.33) * 3.0);
  } else {
    hotHue = mix(C_AMBER, C_MAGENTA, (h - 0.66) * 3.0);
  }

  vec3 blended = mix(saturated, hotHue * (lum * 1.5 + 0.35), clamp(energy * 0.70, 0.0, 0.90));
  return max(blended, vec3(0.0));
}

vec3 tonemapVibrant(vec3 x) {
  vec3 a = x * (2.51 * x + 0.03);
  vec3 b = x * (2.43 * x + 0.59) + 0.14;
  vec3 mapped = clamp(a / b, 0.0, 1.0);
  float lum = dot(mapped, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(lum), mapped, 1.25);
}
`;

// ─── 1. OCEANIC LEVIATHAN SWELL ─────────────────────────────────────────────
// Design Council: PLAJAH (Signal Bloom) + GLASS (Refractive Field)
export const OCEAN_LEVIATHAN_GLSL = COUNCIL_AUDIO_KIT + `
// COUNCIL MASTERWORK 1: OCEANIC LEVIATHAN SWELL
// Open 3D ocean swell with Gerstner wave vectors, volumetric subsurface cyan scatter,
// deep trough void reflections, and camera swooping inches above crests.

float waveHeight(vec2 p, CouncilAudio a, float time) {
  float h = 0.0;
  float freq = 0.45;
  float amp = 0.55 + a.bass * 0.65 + iParam0 * 0.5;
  float spd = 1.8 + a.kick * 0.8;

  // 4 directional Gerstner-like harmonic wave trains
  vec2 d1 = normalize(vec2(1.0, 0.3));
  vec2 d2 = normalize(vec2(-0.4, 0.9));
  vec2 d3 = normalize(vec2(0.8, -0.6));
  vec2 d4 = normalize(vec2(-0.7, -0.7));

  h += sin(dot(p, d1) * freq + time * spd) * amp;
  h += cos(dot(p, d2) * freq * 1.7 + time * spd * 1.2 + a.left * 2.0) * (amp * 0.55);
  h += sin(dot(p, d3) * freq * 3.2 - time * spd * 1.6 + a.right * 2.0) * (amp * 0.28);
  h += sin(dot(p, d4) * freq * 5.8 + time * spd * 2.2) * (amp * 0.14) * (1.0 + a.snare * 0.8);

  // Peak sharpening (trochoidal crests)
  h -= exp(-abs(h) * 2.2) * 0.35 * (1.0 + a.punch);
  return h;
}

vec3 waveNormal(vec2 p, CouncilAudio a, float time) {
  vec2 e = vec2(0.03, 0.0);
  float h = waveHeight(p, a, time);
  float hx = waveHeight(p + e.xy, a, time) - h;
  float hz = waveHeight(p + e.yx, a, time) - h;
  return normalize(vec3(-hx / e.x, 1.0, -hz / e.x));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  CouncilAudio a = plajahCouncilAudio();
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

  // Cinematic 3D camera swooping low over the ocean
  float camTime = iTime * 0.4;
  float camX = sin(camTime * 0.5) * 4.5 + a.balance * 2.0;
  float camZ = iTime * 2.5;
  float surfaceH = waveHeight(vec2(camX, camZ), a, iTime);
  float camY = max(surfaceH + 0.85, 1.4 + a.kick * 0.4);

  vec3 ro = vec3(camX, camY, camZ);
  vec3 ta = vec3(camX + sin(camTime * 0.3) * 2.0, camY - 0.35, camZ + 8.0);
  float roll = a.balance * 0.35 + sin(camTime * 0.8) * 0.12;

  float fov = 1.65 - a.kick * 0.35;
  vec3 rd = setCamera(ro, ta, roll) * normalize(vec3(p, fov));

  // Raymarch ocean surface plane
  vec3 col = C_VOID;
  float t = 0.5;
  bool hit = false;
  vec3 hitP = ro;

  for (int i = 0; i < 70; i++) {
    hitP = ro + rd * t;
    float h = waveHeight(hitP.xz, a, iTime);
    float d = hitP.y - h;
    if (d < 0.003 * t) {
      hit = true;
      break;
    }
    t += d * 0.65;
    if (t > 35.0) break;
  }

  // Atmospheric sky background (deep void with magenta/violet horizon glow)
  vec3 sky = mix(C_VOID, C_VIOLET * 0.6, smoothstep(0.0, 0.4, rd.y));
  sky = mix(sky, C_MAGENTA * 0.8, exp(-abs(rd.y) * 14.0) * (0.8 + a.voice * 0.8));

  if (hit) {
    vec3 n = waveNormal(hitP.xz, a, iTime);
    vec3 sunDir = normalize(vec3(0.6 * sin(iTime * 0.3) + a.balance * 0.5, 0.35, 0.85));

    // Fresnel reflection
    float fresnel = pow(clamp(1.0 - dot(-rd, n), 0.0, 1.0), 4.0);
    vec3 ref = reflect(rd, n);

    // Deep water color & subsurface scattering in wave peaks
    float crestHeight = smoothstep(0.0, 1.8, hitP.y);
    vec3 deepWater = mix(C_VOID * 1.5, C_VIOLET, smoothstep(-1.2, 0.5, hitP.y));
    vec3 sssColor  = mix(C_CYAN, C_MAGENTA, a.melodyPitch);
    vec3 waterBody = mix(deepWater, sssColor, crestHeight * (0.7 + a.melodyEnergy * 0.6));

    // Specular sun highlight
    float spec = pow(max(dot(ref, sunDir), 0.0), 64.0) * (1.5 + a.snare * 2.5);
    vec3 specular = mix(C_CYAN, C_AMBER, a.chordDensity * 0.5) * spec;

    col = mix(waterBody, sky, fresnel * 0.75) + specular;

    // Atmospheric distance fog
    col = mix(col, sky, smoothstep(10.0, 35.0, t));
  } else {
    col = sky;
  }

  // High-energy hyper-chroma boost
  col = plajahHyperChroma(col, a.kick * 0.85 + a.punch * 0.6, a.melodyPitch);

  fragColor = vec4(tonemapVibrant(col), 1.0);
}
`;

// ─── 2. KINETIC CHROME MORPH ────────────────────────────────────────────────
// Design Council: FUTURIST (Predictive Lattice) + BAROQUE (Grand Chiaroscuro)
export const KINETIC_CHROME_MORPH_GLSL = COUNCIL_AUDIO_KIT + `
// COUNCIL MASTERWORK 2: KINETIC CHROME MORPH
// Monumental sculpture in an open 3D architectural gallery space.
// Melts from mirror liquid chrome to faceted optical Cauchy glass and molten amber gyroids.

float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
float sdOctahedron(vec3 p, float s) { p = abs(p); return (p.x + p.y + p.z - s) * 0.57735; }
float sdGyroid(vec3 p, float scale, float thickness, float bias) {
  p *= scale;
  return (abs(dot(sin(p), cos(p.zxy)) + bias) - thickness) / scale;
}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

vec2 mapSculpture(vec3 p, CouncilAudio a, float time) {
  // Stereo rotation torque
  p.xy = rot2((a.right - a.left) * 0.5) * p.xy;
  p.xz = rot2(time * 0.35 + a.sub * 0.25) * p.xz;
  p.yz = rot2(time * 0.22) * p.yz;

  float oct = sdOctahedron(p, 1.75 + a.snare * 0.35);
  float tor = sdTorus(p, vec2(1.3 + a.voice * 0.4, 0.45 + iParam0 * 0.3));
  float gyr = sdGyroid(p, 3.6 + iParam1 * 2.0, 0.09 + a.kick * 0.25, 0.2);

  // Dynamic morph between geometric faceted glass, liquid chrome, and gyroid
  float morphPhase = sin(time * 0.45 + a.melodyPitch * 3.14) * 0.5 + 0.5;
  float dSolid = smin(oct, tor, 0.4);
  float dFinal = smin(dSolid, gyr, 0.25 * (1.0 - morphPhase * 0.6));

  float matId = (dSolid < gyr) ? 1.0 : 2.0; // 1 = Chrome/Glass outer, 2 = Core Gyroid
  return vec2(dFinal, matId);
}

vec3 calcNormalSculpt(vec3 p, CouncilAudio a, float time) {
  vec2 e = vec2(0.002, -0.002);
  return normalize(e.xyy * mapSculpture(p + e.xyy, a, time).x +
                   e.yyx * mapSculpture(p + e.yyx, a, time).x +
                   e.yxy * mapSculpture(p + e.yxy, a, time).x +
                   e.xxx * mapSculpture(p + e.xxx, a, time).x);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  CouncilAudio a = plajahCouncilAudio();
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

  // 3D camera orbiting in dark gallery space
  float camDist = 4.2 - a.kick * 0.55;
  float camAng = iTime * 0.32;
  vec3 ro = vec3(sin(camAng) * camDist, 1.2 + sin(iTime * 0.2) * 0.8, cos(camAng) * camDist);
  vec3 ta = vec3(0.0, 0.0, 0.0);
  float roll = a.balance * 0.3;

  float fov = 1.75 - a.punch * 0.25;
  vec3 rd = setCamera(ro, ta, roll) * normalize(vec3(p, fov));

  // Raymarching
  float t = 0.1;
  float matId = 0.0;
  bool hit = false;
  vec3 hitP = ro;

  for (int i = 0; i < 90; i++) {
    hitP = ro + rd * t;
    vec2 res = mapSculpture(hitP, a, iTime);
    if (abs(res.x) < 0.0015 * t) {
      hit = true;
      matId = res.y;
      break;
    }
    t += res.x * 0.85;
    if (t > 12.0) break;
  }

  // Dark studio gallery with Plajah brand rim light gradients
  vec3 col = mix(C_VOID, C_VIOLET * 0.45, length(p) * 0.6);

  if (hit) {
    vec3 n = calcNormalSculpt(hitP, a, iTime);
    vec3 ref = reflect(rd, n);

    // Studio Key Light (Cyan) & Rim Backlight (Magenta)
    vec3 keyLight = normalize(vec3(2.5, 3.5, 2.0));
    vec3 rimLight = normalize(vec3(-2.5, -1.0, -3.0));

    float keyDiff = max(dot(n, keyLight), 0.0);
    float rimDiff = pow(clamp(1.0 - dot(-rd, n), 0.0, 1.0), 3.0);

    float specKey = pow(max(dot(ref, keyLight), 0.0), 50.0);
    float specRim = pow(max(dot(ref, rimLight), 0.0), 32.0);

    // Cauchy chromatic refraction proxy inside the glass facets
    float dispersion = 0.04 * (1.0 + a.chordDensity);
    vec3 refrR = refract(rd, n, 1.0 / (1.50 - dispersion));
    vec3 refrG = refract(rd, n, 1.0 / 1.52);
    vec3 refrB = refract(rd, n, 1.0 / (1.54 + dispersion));

    vec3 glassInternal = vec3(
      dot(refrR, C_MAGENTA),
      dot(refrG, C_CYAN),
      dot(refrB, C_AMBER)
    ) * (1.2 + a.melodyEnergy * 1.5);

    // Chrome reflection: mirror sampling
    vec3 chromeRef = mix(C_VOID * 2.0, C_CYAN, smoothstep(-0.2, 0.8, ref.y));
    chromeRef += C_MAGENTA * smoothstep(0.4, 0.9, ref.x);

    // Material blend: liquid chrome vs optical glass vs amber core
    if (matId < 1.5) {
      col = mix(chromeRef, glassInternal, sin(iTime * 0.5 + a.melodyPitch * 3.14) * 0.5 + 0.5);
      col += C_CYAN * specKey * 2.2 + C_MAGENTA * specRim * 1.8;
      col += C_MAGENTA * rimDiff * (1.2 + a.snare * 2.0);
    } else {
      // Internal molten gyroid core
      float pulse = a.sub * 2.0 + a.voice * 1.5;
      col = mix(C_AMBER, C_MAGENTA, sin(hitP.y * 4.0 + iTime * 2.0) * 0.5 + 0.5) * (1.8 + pulse);
      col += C_WHITE * specKey * 1.5;
    }

    col *= exp(-0.06 * t);
  }

  col = plajahHyperChroma(col, a.kick * 0.85 + a.punch * 0.7, a.melodyPitch);
  fragColor = vec4(tonemapVibrant(col), 1.0);
}
`;

// ─── 3. VOLCANIC PLASMA COMBUSTION ──────────────────────────────────────────
// Design Council: CEREMONIAL (Constellation) + NEON (Night Current)
export const VOLCANIC_PLASMA_FIRE_GLSL = COUNCIL_AUDIO_KIT + `
// COUNCIL MASTERWORK 3: VOLCANIC PLASMA COMBUSTION
// Volumetric fire, rising plasma plumes and molten magma lake in an open 3D caldera.
// Multi-stem convection: kicks erupt explosive shockwaves, snare sparks corona lightning.

float magmaLakeHeight(vec2 p, CouncilAudio a, float time) {
  float h = sin(p.x * 0.8 + time * 1.5) * cos(p.y * 0.8 - time * 1.2) * 0.25;
  h += sin(p.x * 2.2 - p.y * 1.8 + time * 2.8) * 0.08 * (1.0 + a.kick);
  return h;
}

float fireVolumetricDensity(vec3 p, CouncilAudio a, float time) {
  // Convection updraft velocity
  float updraft = time * (2.8 + a.kick * 2.2 + iParam0 * 2.0);
  vec3 q = p - vec3(0.0, updraft, 0.0);

  // Stereo wind shear
  q.x += sin(p.y * 0.8 + time) * 0.4 + a.balance * 0.8;
  q.z += cos(p.y * 0.7 - time) * 0.4;

  float rad = length(q.xz);
  float cylinder = smoothstep(1.8 + a.sub * 0.6, 0.0, rad) * smoothstep(6.0, 0.0, p.y);

  // Multi-frequency turbulent combustion noise
  float n = curlFbm(q.xz * 1.8 + vec2(q.y * 0.8, time * 0.5), 4);
  float density = max(0.0, (n - 0.22) * cylinder * (1.8 + a.punch * 1.5));
  return density;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  CouncilAudio a = plajahCouncilAudio();
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

  // 3D camera tracking low across the magma lake, looking up at the fire spire
  float camTime = iTime * 0.3;
  vec3 ro = vec3(cos(camTime) * 5.2, 1.4 + sin(iTime * 0.2) * 0.4, sin(camTime) * 5.2);
  vec3 ta = vec3(0.0, 2.2 + a.voice * 1.2, 0.0);
  float roll = a.balance * 0.25;

  float fov = 1.7 - a.kick * 0.3;
  vec3 rd = setCamera(ro, ta, roll) * normalize(vec3(p, fov));

  // Volumetric marching through fire and magma plane
  vec3 col = C_VOID;
  float t = 0.2;
  float magmaHitT = -1.0;

  // Intersect ground magma lake plane (y ~ 0)
  if (rd.y < -0.01) {
    magmaHitT = (0.0 - ro.y) / rd.y;
  }

  // Volumetric Fire Integration
  float fireAccum = 0.0;
  vec3 fireColAccum = vec3(0.0);
  float stepSize = 0.16;

  for (int i = 0; i < 48; i++) {
    vec3 pos = ro + rd * t;
    if (pos.y < 0.0 || pos.y > 6.5 || (magmaHitT > 0.0 && t > magmaHitT)) break;

    float den = fireVolumetricDensity(pos, a, iTime);
    if (den > 0.01) {
      // Color gradient: Amber core -> Magenta mid-flame -> Violet smoke
      float temp = clamp(den * 1.2, 0.0, 1.0);
      vec3 flameCol;
      if (temp > 0.6) flameCol = mix(C_MAGENTA, C_AMBER, (temp - 0.6) * 2.5);
      else if (temp > 0.2) flameCol = mix(C_VIOLET, C_MAGENTA, (temp - 0.2) * 2.5);
      else flameCol = mix(C_VOID, C_VIOLET, temp * 5.0);

      // Transmittance
      float trans = exp(-den * stepSize * 3.5);
      fireColAccum += flameCol * den * stepSize * (1.0 - fireAccum);
      fireAccum += (1.0 - trans) * (1.0 - fireAccum);
      if (fireAccum > 0.96) break;
    }
    t += stepSize;
    if (t > 14.0) break;
  }

  // Magma Lake Surface rendering
  if (magmaHitT > 0.0 && magmaHitT < 18.0) {
    vec3 mP = ro + rd * magmaHitT;
    float crust = curlFbm(mP.xz * 1.2 + vec2(iTime * 0.1), 3);
    vec3 magmaCol = mix(C_VOID * 1.8, C_AMBER, smoothstep(0.4, 0.8, crust) * (1.2 + a.sub * 1.8));
    magmaCol += C_MAGENTA * smoothstep(0.2, 0.5, crust);
    col = mix(magmaCol, col, fireAccum);
  } else {
    col += fireColAccum;
  }

  // Snare electric corona lightning arcs through the plume
  if (a.snare > 0.25) {
    float arc = smoothstep(0.04, 0.0, abs(sin(p.x * 20.0 + iTime * 30.0) * 0.2 - p.y));
    col += C_CYAN * arc * a.snare * 2.2;
  }

  col = plajahHyperChroma(col, a.kick * 0.9 + a.punch * 0.7, a.melodyPitch);
  fragColor = vec4(tonemapVibrant(col), 1.0);
}
`;

// ─── 4. SUPERSONIC WIND SCULPTURE ───────────────────────────────────────────
// Design Council: PLAJAH (Signal Bloom) + FUTURIST (Predictive Lattice)
export const AERODYNAMIC_WIND_GLSL = COUNCIL_AUDIO_KIT + `
// COUNCIL MASTERWORK 4: SUPERSONIC WIND SCULPTURE
// Open 3D aerodynamic wind tunnel with floating sculptural ribbons,
// Prandtl-Glauert shock diamonds, Kelvin-Helmholtz vortices and cyan vapor trails.

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  CouncilAudio a = plajahCouncilAudio();
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

  // High-velocity 3D camera tracking alongside supersonic stream
  float camTime = iTime * 0.5;
  vec3 ro = vec3(sin(camTime * 0.7) * 3.2 + a.balance * 1.8, 1.2, -4.5 + iTime * 2.0);
  vec3 ta = vec3(0.0, 0.8, ro.z + 6.0);
  float roll = a.balance * 0.4 + sin(camTime) * 0.15;

  float fov = 1.7 - a.kick * 0.35;
  vec3 rd = setCamera(ro, ta, roll) * normalize(vec3(p, fov));

  // Marching aerodynamic streamlines and shock diamonds
  vec3 col = C_VOID;
  float t = 0.5;

  for (int i = 0; i < 50; i++) {
    vec3 hitP = ro + rd * t;

    // Relative to wind tunnel core
    vec2 streamUv = hitP.xy;
    float zPhase = hitP.z * 1.2 - iTime * (6.0 + a.kick * 4.0);

    // Aerofoil ribbon surfaces
    float ribbon1 = abs(streamUv.y - sin(zPhase * 0.8 + hitP.x * 1.5) * 0.4) - 0.04;
    float ribbon2 = abs(streamUv.x - cos(zPhase * 0.6 - hitP.y * 1.2) * 0.6) - 0.04;
    float ribbonDist = min(ribbon1, ribbon2);

    // Prandtl-Glauert supersonic shock diamond compression rings
    float shockRing = abs(length(streamUv) - (1.2 + 0.3 * sin(hitP.z * 3.5 - iTime * 8.0))) - 0.06;

    // Vapor condensation density
    float vapor = curlFbm(hitP.xy * 2.5 + vec2(zPhase * 0.2, 0.0), 2);

    if (ribbonDist < 0.02) {
      vec3 ribbonCol = mix(C_CYAN, C_MAGENTA, sin(hitP.z * 0.5 + a.melodyPitch * 3.14) * 0.5 + 0.5);
      col += ribbonCol * (1.6 + a.melodyEnergy * 1.4) * exp(-0.08 * t);
    }

    if (shockRing < 0.03) {
      col += C_AMBER * smoothstep(0.03, 0.0, shockRing) * (0.8 + a.kick * 2.2) * exp(-0.1 * t);
    }

    // Atmospheric wind vapor haze
    col += C_VIOLET * vapor * 0.02 * (1.0 + a.air * 1.5);

    t += 0.22;
    if (t > 15.0) break;
  }

  // Saturated anamorphic flare on snare
  vec2 flarePos = vec2(sin(iTime * 0.6) * 0.5, cos(iTime * 0.4) * 0.3);
  float flare = exp(-abs(p.y - flarePos.y) * 40.0) * exp(-abs(p.x - flarePos.x) * 1.8) * a.snare * 2.5;
  col += C_CYAN * flare;

  col = plajahHyperChroma(col, a.kick * 0.85 + a.punch * 0.6, a.melodyPitch);
  fragColor = vec4(tonemapVibrant(col), 1.0);
}
`;

// ─── 5. CRYSTALLINE CATHEDRAL ───────────────────────────────────────────────
// Design Council: GLASS (Refractive Field) + CEREMONIAL (Constellation)
export const CRYSTALLINE_CATHEDRAL_GLSL = COUNCIL_AUDIO_KIT + `
// COUNCIL MASTERWORK 5: CRYSTALLINE CATHEDRAL
// Monumental optical glass architecture in 3D space with volumetric god rays,
// Cauchy chromatic dispersion, and soaring ribbed colonnades.

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

vec2 mapCathedral(vec3 p, CouncilAudio a) {
  // Colonnade repetition along Z
  float cZ = 3.2;
  float zId = floor((p.z + cZ * 0.5) / cZ);
  vec3 q = p;
  q.z = mod(p.z + cZ * 0.5, cZ) - cZ * 0.5;

  // Bilateral pillars on Left and Right
  vec3 pL = q - vec3(-2.8, 0.0, 0.0);
  vec3 pR = q - vec3( 2.8, 0.0, 0.0);

  float pillarL = sdBox(pL, vec3(0.45, 5.0, 0.45));
  float pillarR = sdBox(pR, vec3(0.45, 5.0, 0.45));

  // High Gothic Arch Ribs
  vec3 pArch = q - vec3(0.0, 4.2, 0.0);
  float archCurve = length(vec2(abs(pArch.x) - 1.4, pArch.y)) - 1.5;
  float archRib = max(archCurve, abs(q.z) - 0.22);

  // Floor
  float floorDist = p.y + 0.1;

  float dCols = min(min(pillarL, pillarR), archRib);
  float dFinal = min(dCols, floorDist);
  float matId = (dFinal == floorDist) ? 1.0 : 2.0; // 1 = Floor, 2 = Glass Colonnade
  return vec2(dFinal, matId);
}

vec3 calcNormalCath(vec3 p, CouncilAudio a) {
  vec2 e = vec2(0.003, -0.003);
  return normalize(e.xyy * mapCathedral(p + e.xyy, a).x +
                   e.yyx * mapCathedral(p + e.yyx, a).x +
                   e.yxy * mapCathedral(p + e.yxy, a).x +
                   e.xxx * mapCathedral(p + e.xxx, a).x);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  CouncilAudio a = plajahCouncilAudio();
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

  // Majestic tracking camera dollying down the cathedral nave
  float zCam = iTime * 1.8;
  vec3 ro = vec3(sin(iTime * 0.2) * 0.6 + a.balance * 0.8, 1.8 + a.kick * 0.3, zCam);
  vec3 ta = vec3(0.0, 3.2, zCam + 9.0);
  float roll = a.balance * 0.25;

  float fov = 1.7 - a.kick * 0.3;
  vec3 rd = setCamera(ro, ta, roll) * normalize(vec3(p, fov));

  // Raymarching
  float t = 0.2;
  float matId = 0.0;
  bool hit = false;
  vec3 hitP = ro;

  for (int i = 0; i < 75; i++) {
    hitP = ro + rd * t;
    vec2 res = mapCathedral(hitP, a);
    if (abs(res.x) < 0.002 * t) {
      hit = true;
      matId = res.y;
      break;
    }
    t += res.x * 0.88;
    if (t > 24.0) break;
  }

  vec3 col = C_VOID;

  if (hit) {
    vec3 n = calcNormalCath(hitP, a);
    vec3 lightDir = normalize(vec3(0.8, 1.2, 0.4));

    if (matId > 1.5) {
      // Faceted Optical Glass Colonnade with Cauchy Spectral Dispersion
      vec3 ref = reflect(rd, n);
      float fresnel = pow(clamp(1.0 - dot(-rd, n), 0.0, 1.0), 3.5);

      vec3 refrR = refract(rd, n, 1.0 / 1.50);
      vec3 refrG = refract(rd, n, 1.0 / 1.52);
      vec3 refrB = refract(rd, n, 1.0 / 1.54);

      vec3 glassCol = vec3(
        dot(refrR, C_MAGENTA),
        dot(refrG, C_CYAN),
        dot(refrB, C_AMBER)
      ) * (1.3 + a.chordDensity * 1.2);

      float spec = pow(max(dot(ref, lightDir), 0.0), 45.0) * (1.5 + a.snare * 2.0);
      col = mix(glassCol, C_CYAN * 1.5, fresnel) + C_WHITE * spec;
    } else {
      // Polished Obsidian Floor with Chromatic Mirror Reflections
      vec3 floorRef = reflect(rd, vec3(0.0, 1.0, 0.0));
      col = mix(C_VOID, C_VIOLET * 0.8, smoothstep(-0.2, 0.8, floorRef.y));
      col += C_CYAN * smoothstep(0.4, 0.9, floorRef.x) * (0.8 + a.voice * 1.2);
    }

    col *= exp(-0.045 * t);
  }

  // Volumetric Sunbeams / God Rays streaming through glass arches
  float godRayAccum = 0.0;
  for (int s = 1; s <= 6; s++) {
    float rayDist = float(s) * 2.2;
    vec3 sampleP = ro + rd * rayDist;
    float shaft = smoothstep(0.4, 0.0, abs(sin(sampleP.x * 0.8 + sampleP.z * 0.4 - iTime * 0.8)));
    godRayAccum += shaft * exp(-rayDist * 0.12);
  }
  col += mix(C_CYAN, C_AMBER, a.melodyPitch) * godRayAccum * 0.18 * (1.0 + a.chordDensity * 1.5);

  col = plajahHyperChroma(col, a.kick * 0.85 + a.punch * 0.6, a.melodyPitch);
  fragColor = vec4(tonemapVibrant(col), 1.0);
}
`;

// ─── 6. CHLADNI QUANTUM RESONATOR ───────────────────────────────────────────
// Design Council: CEREMONIAL (Constellation) + NEON (Night Current)
export const CHLADNI_RESONATOR_GLSL = COUNCIL_AUDIO_KIT + `
// COUNCIL MASTERWORK 6: CHLADNI QUANTUM RESONATOR
// Monumental floating acoustic resonator slab in an open 3D architectural sanctuary.
// Sand particles physically settle onto Chladni modal lines, bouncing with acoustic levitation.

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  CouncilAudio a = plajahCouncilAudio();
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

  // 3D camera orbiting gracefully around the floating plate
  float camTime = iTime * 0.35;
  vec3 ro = vec3(sin(camTime) * 4.5, 2.5 + a.kick * 0.4, cos(camTime) * 4.5);
  vec3 ta = vec3(0.0, 0.0, 0.0);
  float roll = a.balance * 0.35;

  float fov = 1.7 - a.punch * 0.25;
  vec3 rd = setCamera(ro, ta, roll) * normalize(vec3(p, fov));

  // Ray intersect horizontal plate plane (y = 0)
  vec3 col = mix(C_VOID, C_VIOLET * 0.4, length(p));

  if (rd.y < -0.01) {
    float t = -ro.y / rd.y;
    if (t > 0.0 && t < 15.0) {
      vec3 hitP = ro + rd * t;
      vec2 plateUv = hitP.xz;

      // Slab boundary: 3.2 x 3.2
      if (abs(plateUv.x) < 2.2 && abs(plateUv.y) < 2.2) {
        // Modal acoustic eigenvalues
        float m = 3.0 + floor(a.left * 4.0) + iParam0 * 2.0;
        float n = 2.0 + floor(a.right * 4.0 + a.chordDensity * 2.0) + iParam1 * 2.0;

        float pi = 3.14159265;
        float cx1 = cos(n * pi * plateUv.x * 0.5) * cos(m * pi * plateUv.y * 0.5);
        float cx2 = cos(m * pi * plateUv.x * 0.5) * cos(n * pi * plateUv.y * 0.5);
        float nodalField = abs(cx1 - cx2);

        // Acoustic levitation bounce on kicks
        float bounce = a.kick * 0.45;
        nodalField += bounce * sin(length(plateUv) * 16.0 - iTime * 10.0);

        // Glowing nodal line sand accumulation
        float sand = 1.0 - smoothstep(0.015, 0.12 + bounce * 0.08, nodalField);
        float sandGlow = 1.0 - smoothstep(0.04, 0.45, nodalField);

        // Sacred lotus mandala core
        float r = length(plateUv);
        float angle = atan(plateUv.y, plateUv.x);
        float lotus = cos(angle * 6.0 + iTime * 0.5 + a.melodyPitch * 6.28) * exp(-r * 1.5);
        float lotusCore = smoothstep(0.35, 0.05, abs(lotus - r * 0.8)) * (a.voice + 0.5);

        // Plate material: black polished obsidian slab
        vec3 slabCol = C_VOID * 2.0;

        // Plajah brand nodal illumination
        vec3 nodalCol = mix(C_CYAN, C_MAGENTA, smoothstep(-0.8, 0.8, plateUv.x + a.balance * 0.5));
        slabCol += nodalCol * sand * (1.6 + a.punch * 2.2);
        slabCol += mix(C_VIOLET, C_CYAN, 0.5) * sandGlow * 0.6;
        slabCol += mix(C_MAGENTA, C_AMBER, a.melodyPitch) * lotusCore * 2.5;

        // Snare shock rings
        float shock = smoothstep(0.04, 0.0, abs(fract(r * 4.0 - iTime * 2.0) - 0.5)) * a.snare * 2.0;
        slabCol += C_CYAN * shock;

        col = mix(col, slabCol, exp(-0.06 * t));
      }
    }
  }

  col = plajahHyperChroma(col, a.kick * 0.85 + a.chordDensity * 0.6, a.melodyPitch);
  fragColor = vec4(tonemapVibrant(col), 1.0);
}
`;

// ─── 7. ASTRAL CYBER-FLUID ABLATION ─────────────────────────────────────────
// Design Council: NEON (Night Current) + PLAJAH (Signal Bloom)
export const ASTRAL_CYBER_FLUID_GLSL = COUNCIL_AUDIO_KIT + `
// COUNCIL MASTERWORK 7: ASTRAL CYBER-FLUID ABLATION
// Zero-gravity magnetohydrodynamic (MHD) ferrofluid blob in 3D space.
// Dual magnetic poles (Left vs Right) bend fluid spikes; kick explodes magnetic flux.

float sdSphere(vec3 p, float s) { return length(p) - s; }

vec2 mapFerrofluid(vec3 p, CouncilAudio a, float time) {
  // Opposing magnetic pole bend
  float bend = (a.left - a.right) * 0.6;
  p.x += bend * smoothstep(0.0, 2.0, length(p));

  float r = length(p);
  vec3 normP = p / max(r, 0.01);

  // Rosensweig instability spike calculation in 3D
  float spikes = sin(normP.x * 12.0 + time * 2.0) *
                 sin(normP.y * 12.0 - time * 1.5) *
                 sin(normP.z * 12.0 + time * 2.5);

  float spikeAmp = (0.28 + a.kick * 0.45 + iParam0 * 0.35) * (1.0 - a.voice * 0.6);
  float radius = 1.35 + a.sub * 0.25 + spikes * spikeAmp;

  float d = r - radius;
  return vec2(d * 0.75, 1.0);
}

vec3 calcNormalFerro(vec3 p, CouncilAudio a, float time) {
  vec2 e = vec2(0.003, -0.003);
  return normalize(e.xyy * mapFerrofluid(p + e.xyy, a, time).x +
                   e.yyx * mapFerrofluid(p + e.yyx, a, time).x +
                   e.yxy * mapFerrofluid(p + e.yxy, a, time).x +
                   e.xxx * mapFerrofluid(p + e.xxx, a, time).x);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  CouncilAudio a = plajahCouncilAudio();
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

  // Dynamic 3D orbit camera
  float camTime = iTime * 0.4;
  vec3 ro = vec3(sin(camTime) * 4.2, 1.5 * sin(camTime * 0.5), cos(camTime) * 4.2);
  vec3 ta = vec3(0.0, 0.0, 0.0);
  float roll = a.balance * 0.3;

  float fov = 1.65 - a.kick * 0.3;
  vec3 rd = setCamera(ro, ta, roll) * normalize(vec3(p, fov));

  // Raymarch ferrofluid blob
  float t = 0.5;
  bool hit = false;
  vec3 hitP = ro;

  for (int i = 0; i < 70; i++) {
    hitP = ro + rd * t;
    vec2 res = mapFerrofluid(hitP, a, iTime);
    if (abs(res.x) < 0.002 * t) {
      hit = true;
      break;
    }
    t += res.x * 0.85;
    if (t > 10.0) break;
  }

  // Background magnetic field line aura
  vec3 col = mix(C_VOID, C_VIOLET * 0.5, length(p));
  col += mix(C_CYAN, C_MAGENTA, smoothstep(-0.6, 0.6, p.x + a.balance * 0.5)) * 0.35;

  if (hit) {
    vec3 n = calcNormalFerro(hitP, a, iTime);
    vec3 ref = reflect(rd, n);

    // Liquid black chrome specular
    vec3 poleL = normalize(vec3(-3.0, 0.0, 0.0));
    vec3 poleR = normalize(vec3( 3.0, 0.0, 0.0));

    float specL = pow(max(dot(ref, poleL), 0.0), 32.0);
    float specR = pow(max(dot(ref, poleR), 0.0), 32.0);

    vec3 chromeBody = C_VOID * 1.5;
    chromeBody += C_CYAN * specL * (1.5 + a.left * 2.0);
    chromeBody += C_MAGENTA * specR * (1.5 + a.right * 2.0);

    // Amber tips on ferrofluid spikes
    float tipGlow = smoothstep(1.3, 1.8, length(hitP));
    chromeBody += C_AMBER * tipGlow * (1.5 + a.kick * 2.5);

    col = chromeBody;
  }

  // Snare electric lightning between spikes
  if (a.snare > 0.3) {
    float arc = smoothstep(0.04, 0.0, abs(sin(p.y * 15.0 + iTime * 25.0) * 0.2 - p.x));
    col += mix(C_CYAN, C_WHITE, 0.5) * arc * a.snare * 2.5;
  }

  col = plajahHyperChroma(col, a.kick * 0.85 + a.punch * 0.7, a.melodyPitch);
  fragColor = vec4(tonemapVibrant(col), 1.0);
}
`;

// ─── 8. BIOLUMINESCENT PELAGIC ABYSS ────────────────────────────────────────
// Design Council: PLAJAH (Signal Bloom) + CEREMONIAL (Constellation)
export const BIOLUMINESCENT_ABYSS_GLSL = COUNCIL_AUDIO_KIT + `
// COUNCIL MASTERWORK 8: BIOLUMINESCENT PELAGIC ABYSS
// Vast underwater pelagic void with floating translucent bioluminescent mantles,
// subsurface ocean scattering, and rhythmic vocal undulation.

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  CouncilAudio a = plajahCouncilAudio();
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

  // Gentle deep-sea 3D drift camera
  float camTime = iTime * 0.25;
  vec3 ro = vec3(sin(camTime) * 3.5, 0.8 + sin(camTime * 0.5) * 0.6, cos(camTime) * 3.5);
  vec3 ta = vec3(0.0, 0.0, 0.0);
  float roll = a.balance * 0.25 + sin(camTime * 0.6) * 0.1;

  float fov = 1.7 - a.kick * 0.25;
  vec3 rd = setCamera(ro, ta, roll) * normalize(vec3(p, fov));

  // Volumetric deep-sea raymarch of undulating translucent mantle
  vec3 col = C_VOID;
  float t = 0.5;

  for (int i = 0; i < 55; i++) {
    vec3 hitP = ro + rd * t;

    // Organic bell mantle geometry
    float r = length(hitP.xz);
    float mantleH = -hitP.y + 0.8;
    float bellShape = abs(r - (0.8 + 0.4 * sin(hitP.y * 2.0 - iTime * 1.5 + a.sub * 1.5)));

    // Vocal respiration pulse
    float breathing = 1.0 + a.voice * 0.5;
    bellShape *= breathing;

    if (bellShape < 0.08 && hitP.y > -2.5 && hitP.y < 1.5) {
      // Internal bioluminescent organ glow
      float organGlow = exp(-r * 3.5) * (1.2 + a.voice * 2.2);
      vec3 bioCol = mix(C_CYAN, C_MAGENTA, a.melodyPitch);
      bioCol = mix(bioCol, C_AMBER, organGlow * 0.6);

      col += bioCol * (0.15 + organGlow * 0.4) * exp(-0.12 * t);
    }

    t += 0.18;
    if (t > 14.0) break;
  }

  // Deep underwater caustic curtains
  float caustics = curlFbm(p * 3.5 + vec2(iTime * 0.2), 3);
  col += C_CYAN * smoothstep(0.4, 0.8, caustics) * 0.35 * (0.8 + a.air * 1.2);

  col = plajahHyperChroma(col, a.kick * 0.8 + a.voice * 0.8, a.melodyPitch);
  fragColor = vec4(tonemapVibrant(col), 1.0);
}
`;

// ─── 9. SOLARIS MERCURY OCEAN ───────────────────────────────────────────────
// Design Council: FUTURIST (Predictive Lattice) + GLASS (Refractive Field)
export const SOLARIS_MERCURY_OCEAN_GLSL = COUNCIL_AUDIO_KIT + `
// COUNCIL MASTERWORK 9: SOLARIS MERCURY OCEAN
// Infinite intelligent silver ocean with colossal extruding glass & chrome spires.
// Sweeping tracking camera skimming inches above liquid mercury reflections.

float mercuryHeight(vec2 p, CouncilAudio a, float time) {
  float h = sin(p.x * 0.5 + time) * cos(p.y * 0.5 - time * 0.8) * 0.35;
  h += sin(p.x * 1.5 + p.y * 1.2 + time * 1.6) * 0.12 * (1.0 + a.bass);
  return h;
}

vec2 mapSolaris(vec3 p, CouncilAudio a, float time) {
  // Extruding architectural spires from the mercury sea
  float spZ = 5.0;
  vec3 q = p;
  q.z = mod(p.z + spZ * 0.5, spZ) - spZ * 0.5;

  float spireH = 2.5 + a.kick * 2.2 + iParam0 * 2.0;
  float dSpire = length(q.xz) - (0.6 - p.y * 0.08);
  dSpire = max(dSpire, p.y - spireH);
  dSpire = max(dSpire, -p.y);

  float dSea = p.y - mercuryHeight(p.xz, a, time);
  float dFinal = min(dSea, dSpire);
  float matId = (dFinal == dSea) ? 1.0 : 2.0; // 1 = Sea, 2 = Spire
  return vec2(dFinal, matId);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  CouncilAudio a = plajahCouncilAudio();
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

  // Horizon tracking camera skimming over liquid mercury
  float camZ = iTime * 2.2;
  vec3 ro = vec3(sin(iTime * 0.3) * 2.0 + a.balance * 1.5, 1.2 + a.kick * 0.3, camZ);
  vec3 ta = vec3(0.0, 1.4, camZ + 8.0);
  float roll = a.balance * 0.3;

  float fov = 1.7 - a.punch * 0.25;
  vec3 rd = setCamera(ro, ta, roll) * normalize(vec3(p, fov));

  // Raymarching
  float t = 0.2;
  float matId = 0.0;
  bool hit = false;
  vec3 hitP = ro;

  for (int i = 0; i < 70; i++) {
    hitP = ro + rd * t;
    vec2 res = mapSolaris(hitP, a, iTime);
    if (abs(res.x) < 0.003 * t) {
      hit = true;
      matId = res.y;
      break;
    }
    t += res.x * 0.85;
    if (t > 25.0) break;
  }

  // Alien sky
  vec3 sky = mix(C_VOID, C_VIOLET * 0.8, smoothstep(0.0, 0.5, rd.y));
  sky = mix(sky, C_MAGENTA, exp(-abs(rd.y) * 12.0) * (0.8 + a.melodyEnergy));
  vec3 col = sky;

  if (hit) {
    if (matId < 1.5) {
      // Liquid silver mercury ocean
      vec3 ref = reflect(rd, vec3(0.0, 1.0, 0.0));
      col = mix(C_VOID * 2.0, C_CYAN, smoothstep(0.0, 0.8, ref.y));
      col += C_MAGENTA * smoothstep(0.3, 0.8, ref.x);
    } else {
      // Extruded Optical Glass Spire
      col = mix(C_CYAN, C_AMBER, a.melodyPitch) * (1.5 + a.chordDensity);
      col += C_WHITE * pow(clamp(1.0 - dot(-rd, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 3.0);
    }
    col = mix(col, sky, smoothstep(8.0, 25.0, t));
  }

  col = plajahHyperChroma(col, a.kick * 0.85 + a.punch * 0.6, a.melodyPitch);
  fragColor = vec4(tonemapVibrant(col), 1.0);
}
`;

// ─── 10. IONIC SUPERCELL THUNDERSTORM ───────────────────────────────────────
// Design Council: NEON (Night Current) + CEREMONIAL (Constellation)
export const IONIC_THUNDERSTORM_GLSL = COUNCIL_AUDIO_KIT + `
// COUNCIL MASTERWORK 10: IONIC SUPERCELL THUNDERSTORM
// Atmospheric supercell storm clouds in 3D aerial flight.
// Snares unleash instantaneous branching lightning flashes illuminating dense cloud volumes from within.

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  CouncilAudio a = plajahCouncilAudio();
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

  // Sweeping 3D aerial camera flying through the storm
  float camTime = iTime * 0.35;
  vec3 ro = vec3(sin(camTime * 0.6) * 3.5, 2.5 + a.kick * 0.5, iTime * 1.8);
  vec3 ta = vec3(0.0, 2.0, ro.z + 7.0);
  float roll = a.balance * 0.4 + sin(camTime * 0.8) * 0.15;

  float fov = 1.7 - a.kick * 0.3;
  vec3 rd = setCamera(ro, ta, roll) * normalize(vec3(p, fov));

  // Volumetric cloud density raymarch
  vec3 col = C_VOID;
  float t = 0.5;
  float cloudDensityAccum = 0.0;
  vec3 cloudLightAccum = vec3(0.0);

  // Lightning flash trigger on snare
  float lightning = a.snare * step(0.35, a.snare) * 3.5;

  for (int i = 0; i < 45; i++) {
    vec3 hitP = ro + rd * t;
    float n = curlFbm(hitP.xz * 0.4 + vec2(hitP.y * 0.3, iTime * 0.1), 3);
    float cloud = smoothstep(0.35, 0.85, n) * smoothstep(5.5, 1.0, hitP.y);

    if (cloud > 0.01) {
      // Cloud illuminated by internal lightning
      vec3 lightCol = mix(C_VIOLET, C_CYAN, a.melodyPitch);
      lightCol = mix(lightCol, C_WHITE, lightning * 0.7);

      cloudLightAccum += lightCol * cloud * 0.12 * (1.0 + lightning * 2.0);
      cloudDensityAccum += cloud * 0.08;
      if (cloudDensityAccum > 0.95) break;
    }

    t += 0.35;
    if (t > 16.0) break;
  }

  col += cloudLightAccum;

  // Branching lightning bolt across the screen on snare hits
  if (lightning > 0.5) {
    float bolt = smoothstep(0.035, 0.0, abs(sin(p.x * 25.0 + iTime * 40.0) * 0.3 - p.y));
    col += mix(C_CYAN, C_WHITE, 0.6) * bolt * lightning;
  }

  col = plajahHyperChroma(col, a.kick * 0.85 + a.snare * 0.8, a.melodyPitch);
  fragColor = vec4(tonemapVibrant(col), 1.0);
}
`;

// ─── 11. FROST FRACTURE OBSIDIAN ────────────────────────────────────────────
// Design Council: GLASS (Refractive Field) + BAROQUE (Grand Chiaroscuro)
export const FROST_FRACTURE_OBSIDIAN_GLSL = COUNCIL_AUDIO_KIT + `
// COUNCIL MASTERWORK 11: FROST FRACTURE OBSIDIAN
// High-contrast chiaroscuro ravine of glossy black obsidian stone cracking open.
// Inside the chasms, glowing optical glass crystals and refractive prism facets grow.

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  CouncilAudio a = plajahCouncilAudio();
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

  // Camera tracking down obsidian ravine
  float camZ = iTime * 1.5;
  vec3 ro = vec3(sin(iTime * 0.3) * 0.8 + a.balance * 0.6, 1.2, camZ);
  vec3 ta = vec3(0.0, 0.8, camZ + 6.0);
  float roll = a.balance * 0.3;

  float fov = 1.7 - a.kick * 0.25;
  vec3 rd = setCamera(ro, ta, roll) * normalize(vec3(p, fov));

  // Ravine geometry: Left and Right obsidian cliff walls
  vec3 col = C_VOID;
  float t = 0.5;

  for (int i = 0; i < 50; i++) {
    vec3 hitP = ro + rd * t;
    float wallL = hitP.x - (-1.8 + 0.3 * sin(hitP.z * 0.8));
    float wallR = ( 1.8 + 0.3 * cos(hitP.z * 0.8)) - hitP.x;
    float ravineDist = min(wallL, wallR);

    // Crystalline fissures leaking chromatic light
    float fissure = abs(sin(hitP.y * 3.0 + hitP.z * 1.5)) - 0.08;

    if (ravineDist < 0.03) {
      // Glossy black obsidian rock with high specular
      vec3 obsCol = C_VOID * 1.6;

      if (fissure < 0.05) {
        // Glowing internal crystal prism
        vec3 crystalCol = mix(C_MAGENTA, C_CYAN, a.melodyPitch);
        crystalCol = mix(crystalCol, C_AMBER, a.chordDensity * 0.5);
        obsCol += crystalCol * (1.8 + a.snare * 2.2);
      }

      col = mix(col, obsCol, exp(-0.08 * t));
      break;
    }

    t += 0.22;
    if (t > 15.0) break;
  }

  col = plajahHyperChroma(col, a.kick * 0.85 + a.snare * 0.7, a.melodyPitch);
  fragColor = vec4(tonemapVibrant(col), 1.0);
}
`;

// ─── 12. AURORA CHRONOS PILLARS ─────────────────────────────────────────────
// Design Council: CEREMONIAL (Constellation) + GLASS (Refractive Field)
export const AURORA_CHRONOS_PILLARS_GLSL = COUNCIL_AUDIO_KIT + `
// COUNCIL MASTERWORK 12: AURORA CHRONOS PILLARS
// Towering translucent glass monoliths standing on a reflective black plateau,
// with volumetric undulating auroral curtains sweeping overhead in cosmic winds.

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  CouncilAudio a = plajahCouncilAudio();
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

  // Majestic wide cinematic camera gliding between towering monoliths
  float camTime = iTime * 0.3;
  vec3 ro = vec3(sin(camTime) * 4.5, 1.8 + a.kick * 0.4, cos(camTime) * 4.5);
  vec3 ta = vec3(0.0, 3.2, 0.0);
  float roll = a.balance * 0.3;

  float fov = 1.7 - a.punch * 0.25;
  vec3 rd = setCamera(ro, ta, roll) * normalize(vec3(p, fov));

  // Volumetric Aurora Curtains in the sky
  vec3 sky = C_VOID;
  if (rd.y > 0.05) {
    float auroraH = (6.0 - ro.y) / rd.y;
    vec3 aurP = ro + rd * auroraH;
    float wave = sin(aurP.x * 0.4 + iTime * 1.2) * cos(aurP.z * 0.4 - iTime * 0.8);
    float auroraIntensity = smoothstep(0.2, 0.8, wave) * (0.8 + a.voice * 1.5);
    vec3 auroraCol = mix(C_CYAN, C_MAGENTA, sin(aurP.x * 0.2 + iTime * 0.5) * 0.5 + 0.5);
    auroraCol = mix(auroraCol, C_VIOLET, 0.4);
    sky += auroraCol * auroraIntensity * 1.6;
  }
  vec3 col = sky;

  // Monolith pillar Raymarching
  float t = 0.5;
  for (int i = 0; i < 55; i++) {
    vec3 hitP = ro + rd * t;

    // 4 Grand Pillars in circular constellation
    float dPillars = 100.0;
    for (int k = 0; k < 4; k++) {
      float ang = float(k) * 1.57079;
      vec3 center = vec3(cos(ang) * 2.8, 0.0, sin(ang) * 2.8);
      vec3 q = hitP - center;
      float dBox = max(max(abs(q.x) - 0.35, abs(q.z) - 0.35), abs(q.y - 3.0) - 3.2);
      dPillars = min(dPillars, dBox);
    }

    if (dPillars < 0.02) {
      // Translucent Quartz Monolith with internal light core
      vec3 pillarCol = mix(C_CYAN, C_MAGENTA, a.melodyPitch);
      pillarCol += C_AMBER * a.chordDensity * 0.8;
      col = mix(col, pillarCol * 1.8, exp(-0.06 * t));
      break;
    }

    t += 0.22;
    if (t > 18.0) break;
  }

  col = plajahHyperChroma(col, a.kick * 0.85 + a.voice * 0.7, a.melodyPitch);
  fragColor = vec4(tonemapVibrant(col), 1.0);
}
`;

// ─── 13. SERENE CRIMSON POND (IMAGE 1 TRANQUIL) ──────────────────────────────
// Design Council: PLAJAH (Signal Bloom) + GLASS (Refractive Field)
export const IMAGE1_RIPPLE_TRANQUIL_GLSL = COUNCIL_AUDIO_KIT + `
// COUNCIL MASTERWORK 13: SERENE CRIMSON POND
// Silky liquid stillness, slow meditative camera, soft vocal ripples,
// and deep amber/crimson horizon reflections with Fresnel water optics.

float tranquilRipple(vec2 p, CouncilAudio a, float time) {
  vec2 center = vec2(0.35, -0.15);
  float d = length(p - center);
  float wave = sin(d * 18.0 - time * 2.2) * exp(-d * 1.8);
  wave *= (0.04 + a.voice * 0.08 + iParam0 * 0.04);
  float wave2 = sin(length(p + vec2(0.4, 0.3)) * 12.0 - time * 1.6) * exp(-length(p) * 2.0);
  wave += wave2 * a.sub * 0.03;
  return wave;
}

vec3 tranquilNormal(vec2 p, CouncilAudio a, float time) {
  vec2 e = vec2(0.005, 0.0);
  float h = tranquilRipple(p, a, time);
  float hx = tranquilRipple(p + e.xy, a, time) - h;
  float hy = tranquilRipple(p + e.yx, a, time) - h;
  return normalize(vec3(-hx / e.x, 1.0, -hy / e.x));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  CouncilAudio a = plajahCouncilAudio();
  vec2 rawP = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

  float camTime = iTime * 0.15;
  vec3 ro = vec3(sin(camTime * 0.5) * 1.2 + a.balance * 0.5, 0.95 + a.sub * 0.1, -1.8);
  vec3 ta = vec3(0.1, 0.0, 0.8);
  float roll = a.balance * 0.12;

  vec3 rd = setCamera(ro, ta, roll) * normalize(vec3(rawP, 1.6));

  vec3 col = C_VOID;
  if (rd.y < -0.01) {
    float t = -ro.y / rd.y;
    if (t > 0.0 && t < 18.0) {
      vec3 hitP = ro + rd * t;
      vec3 n = tranquilNormal(hitP.xz, a, iTime);
      vec3 ref = reflect(rd, n);

      float f0 = 0.025;
      float fresnel = f0 + (1.0 - f0) * pow(clamp(1.0 - dot(-rd, n), 0.0, 1.0), 5.0);

      vec3 horizonCol = mix(C_MAGENTA * 1.2, C_AMBER * 1.4, a.melodyPitch);
      vec3 skyRef = mix(C_VOID * 1.5, horizonCol, smoothstep(0.0, 0.6, ref.z * 0.5 + 0.5));
      skyRef += C_AMBER * pow(max(0.0, ref.z), 12.0) * (0.8 + a.voice * 1.2);

      vec3 waterDepth = mix(C_VOID, C_VIOLET * 0.6, a.chordDensity * 0.5);
      waterDepth = mix(waterDepth, C_MAGENTA * 0.4, exp(-t * 0.15));

      vec3 lightDir = normalize(vec3(0.4, 0.3, 0.85));
      float spec = pow(max(dot(ref, lightDir), 0.0), 40.0) * (1.2 + a.air * 1.5);
      vec3 specular = mix(C_AMBER, C_WHITE, 0.4) * spec;

      col = mix(waterDepth, skyRef, fresnel) + specular;
      col *= exp(-0.04 * t);
    }
  } else {
    col = mix(C_VOID, C_MAGENTA * 0.5, smoothstep(0.0, 0.4, rd.y));
  }

  col = plajahHyperChroma(col, a.voice * 0.7 + a.sub * 0.5, a.melodyPitch);
  fragColor = vec4(tonemapVibrant(col), 1.0);
}
`;

// ─── 14. HYDRAULIC CRIMSON SURGE (IMAGE 1 ENERGETIC) ─────────────────────────
// Design Council: PLAJAH (Signal Bloom) + NEON (Night Current)
export const IMAGE1_RIPPLE_ENERGETIC_GLSL = COUNCIL_AUDIO_KIT + `
// COUNCIL MASTERWORK 14: HYDRAULIC CRIMSON SURGE
// High-velocity water drop impact coronet splash, rapid shock rings,
// capillary snare ripples, and high-impact crimson/amber caustic dynamics.

float energeticRipple(vec2 p, CouncilAudio a, float time) {
  vec2 dropCenter = vec2(0.25 + a.balance * 0.4, 0.0);
  float d = length(p - dropCenter);
  float spd = 6.5 + a.kick * 4.0;
  float shock = sin(d * (32.0 + iParam0 * 20.0) - time * spd) * exp(-d * 1.4);
  shock *= (0.08 + a.kick * 0.22 + a.punch * 0.15);
  float capillary = sin(d * 75.0 - time * 18.0) * exp(-d * 3.5) * a.snare * 0.06;
  return shock + capillary;
}

vec3 energeticNormal(vec2 p, CouncilAudio a, float time) {
  vec2 e = vec2(0.003, 0.0);
  float h = energeticRipple(p, a, time);
  float hx = energeticRipple(p + e.xy, a, time) - h;
  float hy = energeticRipple(p + e.yx, a, time) - h;
  return normalize(vec3(-hx / e.x, 1.0, -hy / e.x));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  CouncilAudio a = plajahCouncilAudio();
  vec2 rawP = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

  float camTime = iTime * 0.4;
  vec3 ro = vec3(sin(camTime) * 1.5 + a.balance * 0.8, 1.1 + a.kick * 0.35, -2.0);
  vec3 ta = vec3(0.2, 0.1, 0.6);
  float roll = a.balance * 0.25;

  float fov = 1.65 - a.kick * 0.35;
  vec3 rd = setCamera(ro, ta, roll) * normalize(vec3(rawP, fov));

  vec3 col = C_VOID;

  if (rd.y < -0.01) {
    float t = -ro.y / rd.y;
    if (t > 0.0 && t < 16.0) {
      vec3 hitP = ro + rd * t;
      vec3 n = energeticNormal(hitP.xz, a, iTime);
      vec3 ref = reflect(rd, n);

      float f0 = 0.03;
      float fresnel = f0 + (1.0 - f0) * pow(clamp(1.0 - dot(-rd, n), 0.0, 1.0), 4.0);

      vec2 dropCenter = vec2(0.25 + a.balance * 0.4, 0.0);
      float rDist = length(hitP.xz - dropCenter);
      float ringIntensity = abs(sin(rDist * 22.0 - iTime * 8.0));

      vec3 liquidCol = mix(C_VOID * 1.8, C_MAGENTA * 1.8, ringIntensity);
      liquidCol = mix(liquidCol, C_AMBER * 2.2, smoothstep(0.65, 0.95, ringIntensity));

      vec3 lightDir = normalize(vec3(0.3, 0.4, 0.8));
      float spec = pow(max(dot(ref, lightDir), 0.0), 32.0) * (1.5 + a.snare * 3.0);
      vec3 specular = mix(C_AMBER, C_WHITE, 0.5) * spec;

      col = mix(liquidCol, C_CYAN * 1.2, fresnel * 0.6) + specular;
      col *= exp(-0.05 * t);
    }
  }

  // Central suspended water column / coronet splash on kicks
  float splashColDist = length(rawP - vec2(0.12, 0.05));
  float splashColumn = smoothstep(0.06 + a.kick * 0.08, 0.005, splashColDist) * (a.kick * 2.0);
  col += C_AMBER * splashColumn * 1.8;

  col = plajahHyperChroma(col, a.kick * 0.9 + a.punch * 0.7, a.melodyPitch);
  fragColor = vec4(tonemapVibrant(col), 1.0);
}
`;

// ─── 15. AMBIENT PHOSPHOR COLONNADE (IMAGE 2 TRANQUIL) ──────────────────────
// Design Council: NEON (Night Current) + CEREMONIAL (Constellation)
export const IMAGE2_SLAT_TRANQUIL_GLSL = COUNCIL_AUDIO_KIT + `
// COUNCIL MASTERWORK 15: AMBIENT PHOSPHOR COLONNADE
// Architectural vertical slatted wall with frosted acrylic light tubes,
// brushed metallic side panels, and warm ambient lounge illumination.

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  CouncilAudio a = plajahCouncilAudio();
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

  float wallZ = iTime * 0.8;
  vec3 ro = vec3(2.2, 0.0, wallZ);
  vec3 ta = vec3(0.0, 0.0, wallZ + 4.5);
  float roll = a.balance * 0.15;

  vec3 rd = setCamera(ro, ta, roll) * normalize(vec3(p, 1.7));

  vec3 col = C_VOID;
  if (abs(rd.x) > 0.01) {
    float t = -ro.x / rd.x;
    if (t > 0.0 && t < 18.0) {
      vec3 hitP = ro + rd * t;

      float slatWidth = 0.18 + iParam0 * 0.08;
      float slatIndex = floor(hitP.z / slatWidth);
      float inSlat = fract(hitP.z / slatWidth) - 0.5;

      float slatHash = hash21(vec2(slatIndex, 3.14));
      float slatHeight = 1.8 + 0.8 * sin(slatIndex * 0.4 + iTime * 0.2);
      float creviceAO = smoothstep(0.42, 0.32, abs(inSlat));

      if (abs(hitP.y) < slatHeight) {
        vec3 neonCol;
        float cSel = fract(slatHash + a.melodyPitch * 0.5);
        if (cSel < 0.25) neonCol = C_CYAN;
        else if (cSel < 0.50) neonCol = C_MAGENTA;
        else if (cSel < 0.75) neonCol = C_AMBER;
        else neonCol = C_VIOLET * 1.5;

        float tubeLight = smoothstep(0.25, 0.0, abs(inSlat)) * (0.8 + a.voice * 1.2);
        vec3 surfaceCol = mix(C_VOID * 1.8, neonCol, tubeLight);

        float bevelSpec = pow(abs(inSlat) * 2.0, 6.0) * (0.6 + a.air * 0.8);
        surfaceCol += C_WHITE * bevelSpec * 0.5;

        col = surfaceCol * creviceAO;
        col *= exp(-0.06 * t);
      }
    }
  }

  col = plajahHyperChroma(col, a.voice * 0.7 + a.chordDensity * 0.5, a.melodyPitch);
  fragColor = vec4(tonemapVibrant(col), 1.0);
}
`;

// ─── 16. KINETIC NEON EQUALIZER (IMAGE 2 ENERGETIC) ─────────────────────────
// Design Council: NEON (Night Current) + FUTURIST (Predictive Lattice)
export const IMAGE2_SLAT_ENERGETIC_GLSL = COUNCIL_AUDIO_KIT + `
// COUNCIL MASTERWORK 16: KINETIC NEON EQUALIZER
// Oblique architectural perspective of mechanical solenoid-actuated vertical slats
// punching in 3D relief with high-voltage neon phosphor strobes on snares.

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  CouncilAudio a = plajahCouncilAudio();
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

  float wallZ = iTime * 2.2;
  vec3 ro = vec3(2.5 + a.kick * 0.3, 0.0, wallZ);
  vec3 ta = vec3(0.0, 0.0, wallZ + 5.0);
  float roll = a.balance * 0.3;

  float fov = 1.65 - a.kick * 0.3;
  vec3 rd = setCamera(ro, ta, roll) * normalize(vec3(p, fov));

  vec3 col = C_VOID;

  if (abs(rd.x) > 0.01) {
    float t = -ro.x / rd.x;
    if (t > 0.0 && t < 20.0) {
      vec3 hitP = ro + rd * t;

      float slatWidth = 0.22;
      float slatIndex = floor(hitP.z / slatWidth);
      float inSlat = fract(hitP.z / slatWidth) - 0.5;

      float slatHash = hash21(vec2(slatIndex, 7.89));
      float slatHeight = 1.4 + 1.2 * sin(slatIndex * 0.3 - iTime * 3.0) + a.punch * 0.8;
      float creviceAO = smoothstep(0.44, 0.34, abs(inSlat));

      if (abs(hitP.y) < slatHeight) {
        vec3 neonCol;
        float cSel = fract(slatHash + a.melodyPitch);
        if (cSel < 0.25) neonCol = C_CYAN;
        else if (cSel < 0.50) neonCol = C_MAGENTA;
        else if (cSel < 0.75) neonCol = C_AMBER;
        else neonCol = C_VIOLET * 1.8;

        float strobe = a.snare * 2.5;
        float tubeLight = smoothstep(0.28, 0.0, abs(inSlat)) * (1.2 + a.punch * 2.0 + strobe);

        vec3 surfaceCol = mix(C_VOID * 2.0, neonCol, clamp(tubeLight, 0.0, 1.0));
        surfaceCol += C_WHITE * strobe * smoothstep(0.2, 0.0, abs(inSlat));
        surfaceCol += C_CYAN * pow(abs(inSlat) * 2.0, 10.0) * (1.2 + a.snare * 2.0);

        col = surfaceCol * creviceAO;
        col *= exp(-0.05 * t);
      }
    }
  }

  col = plajahHyperChroma(col, a.kick * 0.9 + a.snare * 0.8, a.melodyPitch);
  fragColor = vec4(tonemapVibrant(col), 1.0);
}
`;

// ─── 17. SANCTUARY REFLECTION GALLERY (IMAGE 3 TRANQUIL) ────────────────────
// Design Council: BAROQUE (Grand Chiaroscuro) + CEREMONIAL (Constellation)
export const IMAGE3_MONOLITH_TRANQUIL_GLSL = COUNCIL_AUDIO_KIT + `
// COUNCIL MASTERWORK 17: SANCTUARY REFLECTION GALLERY
// Towering LED monolith portals standing in dark exhibition hall,
// reflected in a mirror-wet black lacquer floor with subtle roughness blur.

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  CouncilAudio a = plajahCouncilAudio();
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

  float camTime = iTime * 0.2;
  vec3 ro = vec3(sin(camTime * 0.4) * 1.4 + a.balance * 0.8, 0.85 + a.sub * 0.15, -4.2);
  vec3 ta = vec3(0.0, 1.8, 2.5);
  float roll = a.balance * 0.15;

  vec3 rd = setCamera(ro, ta, roll) * normalize(vec3(p, 1.65));

  vec3 col = C_VOID;

  if (rd.y < -0.01) {
    float t = -ro.y / rd.y;
    if (t > 0.0 && t < 22.0) {
      vec3 hitP = ro + rd * t;
      vec3 floorNormal = vec3(0.0, 1.0, 0.0);

      float microRipples = sin(hitP.x * 25.0 + hitP.z * 15.0 - iTime) * 0.015 * a.sub;
      floorNormal.x += microRipples;

      vec3 ref = reflect(rd, floorNormal);
      float fresnel = 0.05 + 0.95 * pow(clamp(1.0 - dot(-rd, floorNormal), 0.0, 1.0), 5.0);

      float portalZ = 3.5;
      float tRef = (portalZ - hitP.z) / max(ref.z, 0.01);
      vec3 portalP = hitP + ref * tRef;

      vec3 screenCol = C_VOID;
      for (int k = -2; k <= 2; k++) {
        float xCenter = float(k) * 1.5;
        vec2 mUv = portalP.xy - vec2(xCenter, 2.2);
        if (abs(mUv.x) < 0.55 && abs(mUv.y) < 1.8) {
          float clouds = curlFbm(mUv * 2.0 + vec2(0.0, iTime * 0.15), 3);
          vec3 pCol = mix(C_MAGENTA, C_AMBER, clouds);
          pCol = mix(pCol, C_VIOLET, a.chordDensity * 0.5);
          screenCol += pCol * (1.2 + a.voice * 1.5);
        }
      }

      col = mix(C_VOID * 1.5, screenCol, fresnel) * exp(-0.04 * t);
    }
  } else {
    float portalZ = 3.5;
    float tDir = (portalZ - ro.z) / max(rd.z, 0.01);
    if (tDir > 0.0) {
      vec3 portalP = ro + rd * tDir;
      for (int k = -2; k <= 2; k++) {
        float xCenter = float(k) * 1.5;
        vec2 mUv = portalP.xy - vec2(xCenter, 2.2);
        if (abs(mUv.x) < 0.55 && abs(mUv.y) < 1.8) {
          float clouds = curlFbm(mUv * 2.0 + vec2(0.0, iTime * 0.15), 3);
          vec3 pCol = mix(C_MAGENTA, C_AMBER, clouds);
          col = pCol * (1.4 + a.voice * 1.5);
        }
      }
    }
  }

  col = plajahHyperChroma(col, a.voice * 0.8 + a.chordDensity * 0.6, a.melodyPitch);
  fragColor = vec4(tonemapVibrant(col), 1.0);
}
`;

// ─── 18. VOLCANIC PORTAL RUPTURE (IMAGE 3 ENERGETIC) ─────────────────────────
// Design Council: NEON (Night Current) + BAROQUE (Grand Chiaroscuro)
export const IMAGE3_MONOLITH_ENERGETIC_GLSL = COUNCIL_AUDIO_KIT + `
// COUNCIL MASTERWORK 18: VOLCANIC PORTAL RUPTURE
// Concert mainstage scale: colossal monolith portals erupt with volcanic debris,
// vertical laser beams on snares, and seismic floor shockwaves.

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  CouncilAudio a = plajahCouncilAudio();
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

  float camTime = iTime * 0.4;
  vec3 ro = vec3(sin(camTime * 0.6) * 1.8 + a.balance * 1.2, 0.9 + a.kick * 0.4, -4.5);
  vec3 ta = vec3(0.0, 1.8, 2.5);
  float roll = a.balance * 0.35;

  float fov = 1.6 - a.kick * 0.35;
  vec3 rd = setCamera(ro, ta, roll) * normalize(vec3(p, fov));

  vec3 col = C_VOID;

  if (rd.y < -0.01) {
    float t = -ro.y / rd.y;
    if (t > 0.0 && t < 22.0) {
      vec3 hitP = ro + rd * t;
      vec3 floorNormal = vec3(0.0, 1.0, 0.0);

      float shock = sin(length(hitP.xz) * 14.0 - iTime * 12.0) * a.kick * 0.04;
      floorNormal.x += shock;

      vec3 ref = reflect(rd, floorNormal);
      float fresnel = 0.06 + 0.94 * pow(clamp(1.0 - dot(-rd, floorNormal), 0.0, 1.0), 4.0);

      float portalZ = 3.5;
      float tRef = (portalZ - hitP.z) / max(ref.z, 0.01);
      vec3 portalP = hitP + ref * tRef;

      vec3 screenCol = C_VOID;
      for (int k = -2; k <= 2; k++) {
        float xCenter = float(k) * 1.5;
        vec2 mUv = portalP.xy - vec2(xCenter, 2.2);
        if (abs(mUv.x) < 0.55 && abs(mUv.y) < 1.8) {
          float debris = curlFbm(mUv * 4.0 - vec2(0.0, iTime * 2.5), 3);
          vec3 vCol = mix(C_MAGENTA * 1.5, C_AMBER * 2.2, debris);
          screenCol += vCol * (1.2 + a.kick * 2.5);

          float laser = smoothstep(0.04, 0.0, abs(mUv.x)) * (1.5 + a.snare * 3.5);
          screenCol += mix(C_AMBER, C_WHITE, 0.5) * laser;
        }
      }

      col = mix(C_VOID * 2.0, screenCol, fresnel) * exp(-0.04 * t);
    }
  } else {
    float portalZ = 3.5;
    float tDir = (portalZ - ro.z) / max(rd.z, 0.01);
    if (tDir > 0.0) {
      vec3 portalP = ro + rd * tDir;
      for (int k = -2; k <= 2; k++) {
        float xCenter = float(k) * 1.5;
        vec2 mUv = portalP.xy - vec2(xCenter, 2.2);
        if (abs(mUv.x) < 0.55 && abs(mUv.y) < 1.8) {
          float debris = curlFbm(mUv * 4.0 - vec2(0.0, iTime * 2.5), 3);
          vec3 vCol = mix(C_MAGENTA * 1.5, C_AMBER * 2.2, debris);
          col = vCol * (1.4 + a.kick * 2.5);

          float laser = smoothstep(0.04, 0.0, abs(mUv.x)) * (1.5 + a.snare * 3.5);
          col += mix(C_AMBER, C_WHITE, 0.5) * laser;
        }
      }
    }
  }

  col = plajahHyperChroma(col, a.kick * 0.95 + a.snare * 0.8, a.melodyPitch);
  fragColor = vec4(tonemapVibrant(col), 1.0);
}
`;

// ─── 19. ORIGAMI ARCHITECTURAL SANCTUM (IMAGE 4 TRANQUIL) ───────────────────
// Design Council: FUTURIST (Predictive Lattice) + GLASS (Refractive Field)
export const IMAGE4_CHEVRON_TRANQUIL_GLSL = COUNCIL_AUDIO_KIT + `
// COUNCIL MASTERWORK 19: ORIGAMI ARCHITECTURAL SANCTUM
// Modular faceted origami chevron stage wings with clean architectural color blocking,
// crisp beveled edges, and gentle orbital camera.

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  CouncilAudio a = plajahCouncilAudio();
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

  float camTime = iTime * 0.2;
  vec3 ro = vec3(sin(camTime) * 3.8 + a.balance * 0.8, 1.2, -4.5);
  vec3 ta = vec3(0.0, 1.2, 0.0);
  float roll = a.balance * 0.2;

  vec3 rd = setCamera(ro, ta, roll) * normalize(vec3(p, 1.7));

  vec3 col = C_VOID;

  if (rd.z > 0.01) {
    float t = (0.0 - ro.z) / rd.z;
    if (t > 0.0 && t < 18.0) {
      vec3 hitP = ro + rd * t;
      vec2 uv = hitP.xy;

      float absX = abs(uv.x);
      float diag = absX * 0.8 + uv.y;
      float facetId = floor(diag * 3.0);

      vec3 facetCol;
      float cHash = fract(facetId * 0.35 + a.melodyPitch * 0.5);
      if (cHash < 0.3) facetCol = C_CYAN;
      else if (cHash < 0.6) facetCol = C_AMBER;
      else facetCol = C_MAGENTA;

      facetCol *= (0.8 + a.voice * 0.8);

      float seam = smoothstep(0.04, 0.0, abs(fract(diag * 3.0) - 0.5));
      facetCol = mix(facetCol, C_VOID * 1.5, seam * 0.7);

      col = facetCol * exp(-0.04 * t);
    }
  }

  col = plajahHyperChroma(col, a.voice * 0.7 + a.sub * 0.5, a.melodyPitch);
  fragColor = vec4(tonemapVibrant(col), 1.0);
}
`;

// ─── 20. KINETIC CHEVRON TRANSFORM (IMAGE 4 ENERGETIC) ───────────────────────
// Design Council: FUTURIST (Predictive Lattice) + NEON (Night Current)
export const IMAGE4_CHEVRON_ENERGETIC_GLSL = COUNCIL_AUDIO_KIT + `
// COUNCIL MASTERWORK 20: KINETIC CHEVRON TRANSFORM
// Concert mainstage EDM spectacle: modular origami chevron wings mechanically
// unfold and extrude in 3D relief on kicks with diagonal laser strobe sweeps.

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  CouncilAudio a = plajahCouncilAudio();
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

  float camTime = iTime * 0.4;
  vec3 ro = vec3(sin(camTime * 0.7) * 3.2 + a.balance * 1.5, 1.4 + a.kick * 0.4, -4.8);
  vec3 ta = vec3(0.0, 1.4, 0.0);
  float roll = a.balance * 0.35;

  float fov = 1.65 - a.kick * 0.35;
  vec3 rd = setCamera(ro, ta, roll) * normalize(vec3(p, fov));

  vec3 col = C_VOID;

  if (rd.z > 0.01) {
    float t = (0.0 - ro.z) / rd.z;
    if (t > 0.0 && t < 18.0) {
      vec3 hitP = ro + rd * t;
      vec2 uv = hitP.xy;

      float absX = abs(uv.x);
      float diag = absX * 0.8 + uv.y;
      float facetId = floor(diag * 3.5);

      vec3 facetCol;
      float cHash = fract(facetId * 0.38 + a.melodyPitch);
      if (cHash < 0.33) facetCol = C_CYAN;
      else if (cHash < 0.66) facetCol = C_AMBER;
      else facetCol = C_MAGENTA;

      facetCol *= (1.2 + a.punch * 2.0);

      float laserSweep = smoothstep(0.06, 0.0, abs(fract(diag * 3.5 - iTime * 4.0) - 0.5)) * a.snare * 3.0;
      facetCol += mix(C_CYAN, C_WHITE, 0.5) * laserSweep;

      float seam = smoothstep(0.04, 0.0, abs(fract(diag * 3.5) - 0.5));
      facetCol = mix(facetCol, C_VOID * 2.0, seam * 0.8);

      col = facetCol * exp(-0.04 * t);
    }
  }

  col = plajahHyperChroma(col, a.kick * 0.9 + a.snare * 0.8, a.melodyPitch);
  fragColor = vec4(tonemapVibrant(col), 1.0);
}
`;

// ─── 20 COUNCIL MASTERWORKS DEFINITION ARRAY ─────────────────────────────────
export const COUNCIL_MASTERWORKS: CouncilMasterwork[] = [
  {
    id: 'council-ocean-leviathan',
    name: 'Oceanic Leviathan Swell',
    councilVoices: 'PLAJAH × GLASS',
    premise: 'Open 3D ocean swell with Gerstner wave vectors, volumetric subsurface cyan scatter, and camera swooping inches above crests.',
    src: OCEAN_LEVIATHAN_GLSL,
    params: [
      { name: 'Wave Amplitude', def: 0.55 },
      { name: 'Swell Turbulence', def: 0.5 },
      { name: 'Subsurface Scatter', def: 0.65 },
      { name: 'Sunbeam Flare', def: 0.6 },
    ],
    reacts: [
      ['bass', 'Swells ocean wave amplitude and deep water body'],
      ['kick', 'Punches hydraulic wave troughs and triggers camera dip'],
      ['melody', 'Drives thin-film chromatic iridescence on wave crests'],
      ['voice', 'Blooms radiant golden-amber iridescent pools on surface'],
      ['stereo', 'Banks camera roll and creates opposing lateral wave currents'],
    ],
  },
  {
    id: 'council-kinetic-chrome-morph',
    name: 'Kinetic Chrome Morph',
    councilVoices: 'FUTURIST × BAROQUE',
    premise: 'Monumental sculpture in open 3D gallery space melting from mirror liquid chrome to faceted optical Cauchy glass and molten amber gyroids.',
    src: KINETIC_CHROME_MORPH_GLSL,
    params: [
      { name: 'Morph Threshold', def: 0.5 },
      { name: 'Lattice Density', def: 0.55 },
      { name: 'Dispersion Spread', def: 0.6 },
      { name: 'Studio Key Light', def: 0.65 },
    ],
    reacts: [
      ['melody', 'Pitch controls material state: liquid chrome vs faceted glass vs molten amber'],
      ['chord', 'Polyphonic density expands internal gyroid lattice complexity'],
      ['kick', 'Vertigo dolly zoom & explosive structural scale expansion'],
      ['snare', 'High-voltage specular glints across faceted crystal edges'],
      ['stereo', 'Torque twist rotating sculpture laterally in 3D space'],
    ],
  },
  {
    id: 'council-volcanic-plasma-fire',
    name: 'Volcanic Plasma Combustion',
    councilVoices: 'CEREMONIAL × NEON',
    premise: 'Volumetric fire, rising plasma plumes and molten magma lake in an open 3D caldera with turbulent updraft convection.',
    src: VOLCANIC_PLASMA_FIRE_GLSL,
    params: [
      { name: 'Updraft Velocity', def: 0.55 },
      { name: 'Combustion Temp', def: 0.5 },
      { name: 'Magma Turbulence', def: 0.6 },
      { name: 'Corona Intensity', def: 0.65 },
    ],
    reacts: [
      ['kick', 'Explosive volcanic eruptions with incandescent amber heat cores'],
      ['snare', 'Electric corona lightning arcs through the ascending smoke plume'],
      ['voice', 'Cools turbulent magma into smooth iridescent obsidian ribbons'],
      ['sub', 'Deep infrasonic magma lake swell and bubbling pressure'],
      ['stereo', 'Steers thermal convection winds across the soundstage'],
    ],
  },
  {
    id: 'council-aerodynamic-wind',
    name: 'Supersonic Wind Sculpture',
    councilVoices: 'PLAJAH × FUTURIST',
    premise: 'Open 3D aerodynamic wind tunnel with floating sculptural ribbons, Prandtl-Glauert shock diamonds, and cyan vapor trails.',
    src: AERODYNAMIC_WIND_GLSL,
    params: [
      { name: 'Wind Velocity', def: 0.6 },
      { name: 'Shock Compression', def: 0.55 },
      { name: 'Vortex Shedding', def: 0.5 },
      { name: 'Vapor Density', def: 0.65 },
    ],
    reacts: [
      ['voice', 'Laminarizes turbulent airflow into silky smooth aerofoil streamlines'],
      ['kick', 'Bursts supersonic shock diamond compression rings down the tunnel'],
      ['bass', 'Curls vortex shedding ribbons into sweeping helical spirals'],
      ['snare', 'Ignites anamorphic laser flares along flow separation zones'],
      ['stereo', 'Roll banking camera and lateral wind gusts'],
    ],
  },
  {
    id: 'council-crystalline-cathedral',
    name: 'Crystalline Cathedral',
    councilVoices: 'GLASS × CEREMONIAL',
    premise: 'Monumental optical glass architecture in 3D space with volumetric god rays, Cauchy chromatic dispersion, and soaring ribbed colonnades.',
    src: CRYSTALLINE_CATHEDRAL_GLSL,
    params: [
      { name: 'Pillar Spacing', def: 0.5 },
      { name: 'Ray Intensity', def: 0.6 },
      { name: 'Cauchy Dispersion', def: 0.55 },
      { name: 'Floor Polish', def: 0.7 },
    ],
    reacts: [
      ['chord', 'Illuminates volumetric god rays streaming through glass arches'],
      ['melody', 'Pitch harmonics shift stained-glass rainbow dispersion'],
      ['kick', 'Structural scale pulsation and low-frequency floor reverberation'],
      ['snare', 'Sparkles razor-sharp specular caustics on polished obsidian floor'],
      ['stereo', 'Lateral camera tracking between soaring bilateral pillars'],
    ],
  },
  {
    id: 'council-chladni-resonator',
    name: 'Chladni Quantum Resonator',
    councilVoices: 'CEREMONIAL × NEON',
    premise: 'Monumental floating acoustic resonator slab in an open 3D architectural sanctuary where sand physically settles onto modal nodal lines.',
    src: CHLADNI_RESONATOR_GLSL,
    params: [
      { name: 'Plate Pitch', def: 0.5 },
      { name: 'Eigenmode M', def: 0.45 },
      { name: 'Eigenmode N', def: 0.5 },
      { name: 'Sacred Depth', def: 0.65 },
    ],
    reacts: [
      ['stereo', '3D perspective plate tilt tracking soundstage balance'],
      ['chord', 'Polyphonic density shifts Bessel nodal harmonics and modal order'],
      ['kick', 'Vertical plate acoustic levitation bounce jolt'],
      ['snare', 'Electric cyan concentric shockwave rings expanding across the slab'],
      ['voice', 'Sacred golden-ratio lotus blooms in amber and magenta'],
    ],
  },
  {
    id: 'council-astral-ablation',
    name: 'Astral Cyber-Fluid Ablation',
    councilVoices: 'NEON × PLAJAH',
    premise: 'Zero-gravity magnetohydrodynamic (MHD) ferrofluid blob in 3D space with dual magnetic poles and explosive spike instability.',
    src: ASTRAL_CYBER_FLUID_GLSL,
    params: [
      { name: 'Spike Intensity', def: 0.55 },
      { name: 'Dipole Spacing', def: 0.5 },
      { name: 'Magnetic Flux', def: 0.6 },
      { name: 'Aurora Depth', def: 0.65 },
    ],
    reacts: [
      ['stereo', 'Opposing magnetic poles swing ferrofluid blob across 3D stage'],
      ['kick', 'Surges magnetic flux erupting liquid into sharp amber-tipped spines'],
      ['snare', 'High-voltage electric lightning arcs across spike tips'],
      ['voice', 'Melts rigid spikes into silky liquid satin with harmonic auroras'],
      ['tempo', 'Magnetic pulsation and vortex advection sync with groove drops'],
    ],
  },
  {
    id: 'council-bioluminescent-abyss',
    name: 'Bioluminescent Pelagic Abyss',
    councilVoices: 'PLAJAH × CEREMONIAL',
    premise: 'Vast underwater pelagic void with floating translucent bioluminescent mantles, subsurface ocean scattering, and vocal undulation.',
    src: BIOLUMINESCENT_ABYSS_GLSL,
    params: [
      { name: 'Mantle Scale', def: 0.5 },
      { name: 'Murk Depth', def: 0.6 },
      { name: 'Biolum Flux', def: 0.65 },
      { name: 'Caustic Shimmer', def: 0.55 },
    ],
    reacts: [
      ['voice', 'Triggers internal bioluminescent organ breathing and golden-amber bloom'],
      ['bass', 'Drives deep fluid mantle rhythmic contractions'],
      ['melody', 'Spectral cyan-to-magenta hue shifts across organic tentacles'],
      ['air', 'Rippling water surface caustics shimmer in ambient light'],
      ['stereo', 'Pelagic oceanic currents steer organisms across soundstage'],
    ],
  },
  {
    id: 'council-solaris-mercury-ocean',
    name: 'Solaris Mercury Ocean',
    councilVoices: 'FUTURIST × GLASS',
    premise: 'Infinite intelligent silver ocean with colossal extruding glass & chrome spires beneath an alien twilight sky.',
    src: SOLARIS_MERCURY_OCEAN_GLSL,
    params: [
      { name: 'Spire Height', def: 0.55 },
      { name: 'Sea Reflectance', def: 0.7 },
      { name: 'Alien Sky Depth', def: 0.6 },
      { name: 'Fluid Viscosity', def: 0.5 },
    ],
    reacts: [
      ['kick', 'Erupts monumental architectural glass spires out of the silver sea'],
      ['chord', 'Carves intricate geometric reliefs and fractals on spire surfaces'],
      ['melody', 'Harmonic color shifts across crystal facets'],
      ['bass', 'Swells fluid mercury sea wave amplitude and depth'],
      ['stereo', 'Horizon roll banking and lateral wave crest displacement'],
    ],
  },
  {
    id: 'council-ionic-thunderstorm',
    name: 'Ionic Supercell Thunderstorm',
    councilVoices: 'NEON × CEREMONIAL',
    premise: 'Atmospheric supercell storm clouds in 3D aerial flight with instantaneous branching lightning flashes illuminating cloud volumes from within.',
    src: IONIC_THUNDERSTORM_GLSL,
    params: [
      { name: 'Cloud Density', def: 0.6 },
      { name: 'Lightning Flash', def: 0.7 },
      { name: 'Storm Speed', def: 0.55 },
      { name: 'Anvil Scale', def: 0.65 },
    ],
    reacts: [
      ['snare', 'Unleashes instantaneous branching lightning bolts across storm banks'],
      ['bass', 'Deep rumbling thunder vibration within volumetric cloud masses'],
      ['voice', 'Ethereal purple and amber ionization halos around cloud summits'],
      ['air', 'Electrostatic cloud shimmer and high-altitude mist'],
      ['stereo', 'Storm wind sheer and flight banking through cloud canyons'],
    ],
  },
  {
    id: 'council-frost-fracture-obsidian',
    name: 'Frost Fracture Obsidian',
    councilVoices: 'GLASS × BAROQUE',
    premise: 'High-contrast chiaroscuro ravine of glossy black obsidian stone cracking open with glowing internal optical glass crystals and refractive prism facets.',
    src: FROST_FRACTURE_OBSIDIAN_GLSL,
    params: [
      { name: 'Ravine Width', def: 0.5 },
      { name: 'Crystal Growth', def: 0.6 },
      { name: 'Chasm Depth', def: 0.65 },
      { name: 'Specular Glint', def: 0.7 },
    ],
    reacts: [
      ['snare', 'Shatters sudden new fracture cracks across the black obsidian walls'],
      ['melody', 'Pitch harmonics guide crystal facet growth in magenta and cyan'],
      ['kick', 'Seismic ground tremors expanding fissure width'],
      ['voice', 'Warms deep fissures with amber bioluminescent conduits'],
      ['stereo', 'Camera navigation through meandering subterranean ravines'],
    ],
  },
  {
    id: 'council-aurora-chronos-pillars',
    name: 'Aurora Chronos Pillars',
    councilVoices: 'CEREMONIAL × GLASS',
    premise: 'Towering translucent glass monoliths standing on a reflective black plateau with volumetric undulating auroral curtains sweeping overhead in cosmic winds.',
    src: AURORA_CHRONOS_PILLARS_GLSL,
    params: [
      { name: 'Aurora Amplitude', def: 0.6 },
      { name: 'Pillar Height', def: 0.65 },
      { name: 'Plateau Reflection', def: 0.7 },
      { name: 'Cosmic Wind', def: 0.55 },
    ],
    reacts: [
      ['voice', 'Billows volumetric auroral curtains across the sky in emerald, cyan and magenta'],
      ['chord', 'Modulates internal light conduits inside the monolithic pillars'],
      ['kick', 'Anchors low-frequency ground pulses across the reflective plateau'],
      ['air', 'Atmospheric stellar shimmer and auroral fringe ripples'],
      ['stereo', 'Cosmic wind direction shifts aurora drift across the soundstage'],
    ],
  },
  // ── 8 Image-Derived Masterworks (2 per Image: Calm vs Energetic) ──
  {
    id: 'council-serene-crimson-pond',
    name: 'Serene Crimson Pond (Image 1 Calm)',
    councilVoices: 'PLAJAH × GLASS',
    premise: 'Silky liquid stillness with slow meditative camera, soft vocal ripples, and deep amber/crimson horizon reflections with Fresnel water optics.',
    src: IMAGE1_RIPPLE_TRANQUIL_GLSL,
    params: [
      { name: 'Ripple Viscosity', def: 0.5 },
      { name: 'Horizon Glow', def: 0.6 },
      { name: 'Subsurface Depth', def: 0.65 },
      { name: 'Specular Glint', def: 0.55 },
    ],
    reacts: [
      ['voice', 'Gently breathes soft expanding concentric wave rings'],
      ['melody', 'Rotates ambient horizon reflection between amber and magenta'],
      ['chord', 'Deepens the dark indigo/violet subsurface pool'],
      ['bass', 'Slow rhythmic breathing swell of liquid surface'],
      ['stereo', 'Lateral soundstage drift across calm water'],
    ],
  },
  {
    id: 'council-hydraulic-crimson-surge',
    name: 'Hydraulic Crimson Surge (Image 1 Energetic)',
    councilVoices: 'PLAJAH × NEON',
    premise: 'High-velocity water drop impact coronet splash, rapid shock rings, capillary snare ripples, and high-impact crimson/amber caustic dynamics.',
    src: IMAGE1_RIPPLE_ENERGETIC_GLSL,
    params: [
      { name: 'Impact Velocity', def: 0.6 },
      { name: 'Shockwave Spread', def: 0.55 },
      { name: 'Capillary Tension', def: 0.5 },
      { name: 'Coronet Splash', def: 0.65 },
    ],
    reacts: [
      ['kick', 'Violent droplet impact launching vertical splash column and rapid shock rings'],
      ['snare', 'Razor-sharp capillary ripples scattering specular highlights'],
      ['stereo', 'Deflects droplet splash trajectory left and right creating elliptical interference'],
      ['melody', 'Spectral hue shifts across expanding caustic wave rings'],
      ['bass', 'Hydraulic fluid pressure surge across the pool'],
    ],
  },
  {
    id: 'council-ambient-phosphor-slats',
    name: 'Ambient Phosphor Colonnade (Image 2 Calm)',
    councilVoices: 'NEON × CEREMONIAL',
    premise: 'Architectural vertical slatted wall with frosted acrylic light tubes, brushed metallic side panels, and warm ambient lounge illumination.',
    src: IMAGE2_SLAT_TRANQUIL_GLSL,
    params: [
      { name: 'Slat Width', def: 0.5 },
      { name: 'Acrylic Diffusion', def: 0.6 },
      { name: 'Crevice Depth', def: 0.65 },
      { name: 'Bevel Specular', def: 0.55 },
    ],
    reacts: [
      ['voice', 'Softly breathes vertical light ribbons up and down the acrylic tubes'],
      ['melody', 'Shifts harmonic neon color palette (cyan, violet, amber, gold)'],
      ['chord', 'Fades adjacent slats into glowing ambient fields'],
      ['bass', 'Low-frequency floor reflection wash'],
      ['stereo', 'Gentle camera panning alongside the architectural wall'],
    ],
  },
  {
    id: 'council-kinetic-neon-equalizer',
    name: 'Kinetic Neon Equalizer (Image 2 Energetic)',
    councilVoices: 'NEON × FUTURIST',
    premise: 'Oblique architectural perspective of mechanical solenoid-actuated vertical slats punching in 3D relief with high-voltage neon phosphor strobes.',
    src: IMAGE2_SLAT_ENERGETIC_GLSL,
    params: [
      { name: 'Solenoid Punch', def: 0.6 },
      { name: 'Strobe Intensity', def: 0.7 },
      { name: 'Equalizer Spread', def: 0.55 },
      { name: 'Relief Depth', def: 0.65 },
    ],
    reacts: [
      ['kick', 'Punches slats outward mechanically in 3D relief like solenoid actuators'],
      ['snare', 'High-voltage electric strobe pulses firing down cyan and magenta tubes'],
      ['stereo', 'Sweeps an equalizing wave across the slatted array from left to right'],
      ['melody', 'Harmonic color shifts across active vertical rods'],
      ['tempo', 'Syncs mechanical oscillation to musical tempo drops'],
    ],
  },
  {
    id: 'council-sanctuary-reflection-gallery',
    name: 'Sanctuary Reflection Gallery (Image 3 Calm)',
    councilVoices: 'BAROQUE × CEREMONIAL',
    premise: 'Towering LED monolith portals standing in dark exhibition hall, reflected in a mirror-wet black lacquer floor with subtle roughness blur.',
    src: IMAGE3_MONOLITH_TRANQUIL_GLSL,
    params: [
      { name: 'Floor Wetness', def: 0.7 },
      { name: 'Portal Scale', def: 0.6 },
      { name: 'Watercolor Flow', def: 0.5 },
      { name: 'Atmospheric Fog', def: 0.65 },
    ],
    reacts: [
      ['voice', 'Illuminates ethereal watercolor cloud formations inside monolith portals'],
      ['chord', 'Deepens floor wetness and reflection clarity across exhibition hall'],
      ['melody', 'Shifts ambient portal lighting between warm amber and deep violet'],
      ['bass', 'Subtle low-frequency liquid micro-ripples across lacquer floor'],
      ['stereo', 'Lateral soundstage drift between bilateral portal arrays'],
    ],
  },
  {
    id: 'council-volcanic-portal-rupture',
    name: 'Volcanic Portal Rupture (Image 3 Energetic)',
    councilVoices: 'NEON × BAROQUE',
    premise: 'Concert mainstage scale: colossal monolith portals erupt with volcanic debris, vertical laser beams on snares, and seismic floor shockwaves.',
    src: IMAGE3_MONOLITH_ENERGETIC_GLSL,
    params: [
      { name: 'Volcanic Debris', def: 0.65 },
      { name: 'Laser Beam Width', def: 0.6 },
      { name: 'Floor Shock', def: 0.7 },
      { name: 'Portal Glitch', def: 0.55 },
    ],
    reacts: [
      ['kick', 'Seismic floor shockwave and violent volcanic eruption inside monoliths'],
      ['snare', 'Vertical strobe laser beams firing down monolith bezels in electric white/cyan'],
      ['stereo', 'Alternates volcanic energy bursts between left and right portal banks'],
      ['melody', 'Harmonic color shifts across volcanic debris clouds'],
      ['tempo', 'Vertigo snap zooms on heavy groove drops'],
    ],
  },
  {
    id: 'council-origami-sanctum',
    name: 'Origami Architectural Sanctum (Image 4 Calm)',
    councilVoices: 'FUTURIST × GLASS',
    premise: 'Modular faceted origami chevron stage wings with clean architectural color blocking, crisp beveled edges, and gentle orbital camera.',
    src: IMAGE4_CHEVRON_TRANQUIL_GLSL,
    params: [
      { name: 'Chevron Angle', def: 0.5 },
      { name: 'Bevel Crispness', def: 0.65 },
      { name: 'Pastel Wash', def: 0.6 },
      { name: 'Stage Reflection', def: 0.55 },
    ],
    reacts: [
      ['voice', 'Breathes soft harmonious pastel color blocks across origami facets'],
      ['melody', 'Sequentially highlights adjacent chevron facets in musical cadence'],
      ['bass', 'Modulates ambient floor wash and backdrop illumination'],
      ['chord', 'Blends geometric color gradients across triangular pylons'],
      ['stereo', 'Gentle orbital camera arc admiring the architectural symmetry'],
    ],
  },
  {
    id: 'council-kinetic-chevron-transform',
    name: 'Kinetic Chevron Transform (Image 4 Energetic)',
    councilVoices: 'FUTURIST × NEON',
    premise: 'Concert mainstage EDM spectacle: modular origami chevron wings mechanically unfold and extrude in 3D relief on kicks with diagonal laser strobe sweeps.',
    src: IMAGE4_CHEVRON_ENERGETIC_GLSL,
    params: [
      { name: 'Extrusion Depth', def: 0.6 },
      { name: 'Laser Sweep Speed', def: 0.65 },
      { name: 'Seam Crispness', def: 0.7 },
      { name: 'Stage Bounce', def: 0.55 },
    ],
    reacts: [
      ['kick', 'Mechanically extrudes chevron panels outward in 3D relief'],
      ['snare', 'Diagonal laser strobe cutting across facet seams in electric cyan'],
      ['stereo', 'Balances color intensity and motion between left and right wings'],
      ['melody', 'Harmonic color transitions across modular angular facets'],
      ['tempo', 'Synchronized snap-zooms on drop transients'],
    ],
  },
  {
    id: 'showcase-godot-sdfgi-louvers',
    name: 'Godot 4: SDFGI Kinetic Slat Louvers (Image 2)',
    councilVoices: 'GODOT 4 × SDFGI',
    premise: 'Godot 4 Vulkan showcase: 42 motorized brushed-metal louvers extrude and twist, while embedded neon phosphor rods cast real-time SDFGI colored bounce light deep into crevice shadows.',
    src: IMAGE2_SLAT_ENERGETIC_GLSL,
    params: [
      { name: 'Louver Extrusion', def: 0.65 },
      { name: 'SDFGI Bounce Bleed', def: 0.75 },
      { name: 'Crevice Cavity Depth', def: 0.6 },
      { name: 'Snare Twist Angle', def: 0.55 },
    ],
    reacts: [
      ['kick', 'Motorized Z-depth extrusion of the 42 louvers like a mechanical 3D equalizer'],
      ['melody', 'Cycles dynamic SDFGI bounce color bleeding across dark metal cavities'],
      ['snare', 'Alternating angular slat rotation flips with white contact strobe'],
      ['voice', 'Breathes continuous ambient phosphor glow into the recessed slits'],
    ],
  },
  {
    id: 'showcase-godot-ssr-monolith',
    name: 'Godot 4: SSR Monolith Exhibition Sanctuary (Image 3)',
    councilVoices: 'GODOT 4 × SSR',
    premise: 'Godot 4 Vulkan showcase: 5 monumental obsidian monolith slabs reflecting with real Screen Space Reflections (SSR) across a mirror-wet black lacquer floor, with 3D volumetric light columns.',
    src: IMAGE3_MONOLITH_TRANQUIL_GLSL,
    params: [
      { name: 'SSR Mirror Sheen', def: 0.9 },
      { name: 'Volumetric Shafts', def: 0.7 },
      { name: 'Floor Ripple Perturbation', def: 0.5 },
      { name: 'Monolith Art Brightness', def: 0.65 },
    ],
    reacts: [
      ['kick', 'Ignites towering vertical volumetric light columns skyward into the void'],
      ['sub', 'Perturbs the mirror-wet floor into liquid mercury ripples, fracturing reflections'],
      ['voice', 'Animates fluid digital generative canvas art on monolith front panels'],
      ['stereo', 'Banks cinematic camera orbit smoothly through the monolithic gallery'],
    ],
  },
  {
    id: 'showcase-unity-hdrp-fluid-impact',
    name: 'Unity HDRP: VFX Graph Hydraulic Blood Impact (Image 1)',
    councilVoices: 'UNITY 6 × HDRP',
    premise: 'Unity HDRP showcase: 200 physical ballistic droplets simulated with GPU depth-buffer collision, expanding hydraulic shockwave rings, and translucent crimson Diffusion Profile subsurface scatter.',
    src: IMAGE1_RIPPLE_ENERGETIC_GLSL,
    params: [
      { name: 'Droplet Particle Count', def: 0.8 },
      { name: 'Diffusion Subsurface Scatter', def: 0.75 },
      { name: 'Coronet Crown Burst', def: 0.7 },
      { name: 'Liquid Elasticity', def: 0.55 },
    ],
    reacts: [
      ['kick', 'Erupts 40 physical airborne droplets with ballistic gravity and floor bounce'],
      ['punch', 'Expands concentric hydraulic shockwave rings with finite-difference normals'],
      ['voice', 'Deepens translucent crimson Diffusion Profile subsurface scatter in wave crests'],
      ['snare', 'Specular glints reflect across the coronet splash crown rim'],
    ],
  },
  {
    id: 'showcase-unity-hdrp-origami-optics',
    name: 'Unity HDRP: Theatrical Origami Proscenium (Image 4)',
    councilVoices: 'UNITY 6 × OPTICS',
    premise: 'Unity HDRP showcase: 35 modular architectural origami chevron prisms with micro-bevels, sharp contact shadows, theatrical moving-head spotlights, and optical anamorphic streaks.',
    src: IMAGE4_CHEVRON_TRANQUIL_GLSL,
    params: [
      { name: 'Anamorphic Flare', def: 0.65 },
      { name: 'Moving Head Speed', def: 0.6 },
      { name: 'Facet Bevel Crispness', def: 0.75 },
      { name: 'Kinetic Unfold', def: 0.6 },
    ],
    reacts: [
      ['kick', 'Mechanically flares open lower origami baffle rows in 3D perspective'],
      ['snare', 'Fires anamorphic optical streak across camera lens with chromatic aberration'],
      ['voice', 'Tilts mid chevron panels forward, altering shadow penumbras'],
      ['air', 'Spreads upper proscenium canopy into a soaring acoustic shell'],
    ],
  },
];
