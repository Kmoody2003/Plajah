// generatorsStage — concert-stage generators (RIG_*): arenas, festival main stages, warehouses,
// theatres and amphitheatre shells, with virtual lighting rigs that play the music like an LD.
//
// Each rig is a real 3D scene seen from the audience, ray-traced analytically per pixel:
//   · venue      deck, LED wall / drape / cyc, box truss (see-through lattice), ground-support
//                towers, line arrays, arena seating bowl, warehouse brick, festival roof, theatre
//                proscenium + velvet, bowl shell rings, night sky
//   · light      moving-head beams through haze (closest-approach volumetrics, cone spread,
//                forward scattering, drifting haze texture, gobos, floor pools, lens glare),
//                lasers (pixel-width energy-conserving, scintillation, landing dots), laser sheets,
//                laser cones, strobes, tungsten blinders that glow down to amber, PAR bulbs,
//                festoons, kinetic orbs, mirror ball, follow spots, pyro and CO2 jets
//   · audience   silhouetted crowd rows, rim-lit by the stage, jumping on the kick, hands and phones up
//   · lens       haze veil, strobe veiling glare, anamorphic streaks, grain, ACES
//
// Music comes in through StageAudio (stageAudio.ts) as cues: kick, snare, hats, drop, energy and a
// musical clock MT in beats. Movement rides MT, so sweeps and chases stay in tempo.
//
// Composed as HEADER + CEL_COMMON + STAGE_LIB + rig body + STAGE_MAIN by generators.ts.
// Each body defines   void setup()   (scene + intensities)   and   vec3 rig(vec3 ro, vec3 rd, Hit h).
// Sliders: iParam0 Beam spread · iParam1 Haze · iParam2 Music response · iParam3 Camera (pit → FOH → balcony)

import { RIGS_ENERGETIC } from './stageRigsEnergetic';
import { RIGS_GENTLE } from './stageRigsGentle';
import { STAGE_RIGS, STAGE_ACT_ID } from './stageRigs';

export const STAGE_LIB = `
uniform vec4 iStage;    // kick · snare · musical time (beats) · energy
uniform vec4 iStage2;   // seconds since beat · hat · drop · beat length (s)
uniform float iHDR;     // 1: write scene-referred HDR for the lens pass (stageLens.ts); 0: tone-map here

float KICK, SNARE, MT, NRG, SINCE, HAT, DROP, BEATLEN, BPH, BEATN, RESP, HAZE, BASS, MIDS, TREB, LVL, PIXA, FLASH, SPR;
vec3 CO, CF, CR, CU; float CFOV; vec2 SP;

// ── Scene configuration — setup() overrides these ──
int ENV;                     // 0 arena · 1 festival · 2 warehouse · 3 theatre · 4 bowl shell · 5 stadium
float STW, DECKY, DECKZ;     // stage half-width, deck height, deck depth
float WALLX, WALLY0, WALLY1, WALLZ, LEDB, CYCB;
int LEDK;                    // LED content 0..11 · -1 black drape · -2 cyclorama
vec4 TR[6]; int NTR;         // horizontal box truss: x, y, z, half length
vec4 TW[4]; int NTW; float TOWH;   // ground-support towers: x, z
bool SPK;                    // flown line arrays
bool ROOF;                   // festival/stadium: roof canopy and scaffold wings (false = open air)
vec3 LIP; float LIPCH;       // LED strip on the deck fascia, chase amount
vec3 AMB, HAZEC, RIMC, LEDAVG;
float CROWD, HANDS, PHONES, CEIL, SIDEX, STARN, CLOUD;
vec3 SKYTOP, SKYHOR;
vec3 CAMT; float CAMFOV, CAMDRIFT, CAMSWAY, CAMROLL;
vec4 MBALL;                  // mirror ball: position, strength
vec3 SHELL[6];               // bowl ring cove colours
vec3 KEYC;                   // key light on the performers (front of house)
vec3 PHONEC;                 // colour of the crowd's phone lights
float GM, GMF;               // grand master: GMF is the floor a quiet section sits at, GM the live master
int PERF;                    // on stage: 0 empty · 1 band · 2 DJ · 3 singer · 4 choir · 5 acoustic duo

const int K_SKY = 0, K_FLOOR = 1, K_DECK = 2, K_WALL = 3, K_TRUSS = 4, K_SPK = 5, K_ENV = 6, K_PERF = 7;
struct Hit { float t; int k; vec3 p; vec3 n; float id; float u; };   // u: across-figure coordinate on performer cutouts

void stageAudio(){
  RESP = iParam2 * 2.0;
  KICK = clamp(iStage.x * RESP, 0.0, 1.5);
  SNARE = clamp(iStage.y * RESP, 0.0, 1.5);
  MT = iStage.z; BEATN = floor(MT); BPH = fract(MT);
  NRG = clamp(iStage.w, 0.0, 1.2);
  SINCE = iStage2.x; HAT = clamp(iStage2.y * RESP, 0.0, 1.5); DROP = clamp(iStage2.z * RESP, 0.0, 1.5);
  BEATLEN = max(iStage2.w, 0.25);
  BASS = smoothstep(0.03, 0.85, iBass) * RESP; MIDS = smoothstep(0.03, 0.75, iMid) * RESP;
  TREB = smoothstep(0.02, 0.60, iTreble) * RESP; LVL = smoothstep(0.03, 0.80, iLevel) * RESP;
  HAZE = 0.3 + iParam1 * 1.4;
  SPR = 0.4 + iParam0 * 1.2;
  FLASH = 0.0;
}

vec3 tung(float i);
void stageDefaults(){
  ENV = 0; STW = 10.0; DECKY = 1.5; DECKZ = 11.0;
  WALLX = 12.0; WALLY0 = 2.0; WALLY1 = 9.5; WALLZ = 11.5; LEDB = 0.9; CYCB = 1.0; LEDK = 0;
  NTR = 0; NTW = 0; TOWH = 13.0; SPK = true; ROOF = true;
  LIP = vec3(0.0); LIPCH = 0.0;
  AMB = vec3(0.02); HAZEC = vec3(0.012, 0.010, 0.016); RIMC = vec3(0.3);
  LEDAVG = (iC0 + iC1 + iC2) * 0.1;
  CROWD = 1.0; HANDS = 0.3; PHONES = 0.0; CEIL = 26.0; SIDEX = 32.0; STARN = 0.6; CLOUD = 0.0;
  SKYTOP = vec3(0.003, 0.005, 0.012); SKYHOR = vec3(0.02, 0.02, 0.035);
  CAMT = vec3(0.0, 6.0, 6.0); CAMFOV = 46.0; CAMDRIFT = 1.0; CAMSWAY = 0.0; CAMROLL = 0.0;
  MBALL = vec4(0.0); PERF = 1; KEYC = tung(0.75) * 0.35; PHONEC = vec3(0.75, 0.85, 1.0); GMF = 0.5; GM = 1.0;
  for (int i = 0; i < 6; i++){ TR[i] = vec4(0.0); SHELL[i] = vec3(0.0); }
  for (int i = 0; i < 4; i++) TW[i] = vec4(0.0);
}

// ── Helpers ──
vec3 cyc(float x){ x = fract(x) * 3.0; return x < 1.0 ? mix(iC0, iC1, x) : (x < 2.0 ? mix(iC1, iC2, x - 1.0) : mix(iC2, iC0, x - 2.0)); }
float fan(int i, int n){ return n > 1 ? float(i) / float(n - 1) * 2.0 - 1.0 : 0.0; }
// Moving-head aim. tilt 0 = straight down, PI/2 = level toward the audience (−z), more = up. pan > 0 turns toward +x.
vec3 aim(float pan, float tilt){ return normalize(vec3(sin(tilt) * sin(pan), -cos(tilt), -sin(tilt) * cos(pan))); }
// 1 when slot i is the lit one of an n-step chase advancing 'rate' steps per beat.
float chase(float i, float n, float rate){ float k = mod(i - floor(MT * rate), n); return step(k, 0.5) + step(n - 0.5, k); }
// A new random position on every beat, glided into over 'glide' of the beat.
float stepRand(float i, float seed, float glide){
  float a = h21(vec2(BEATN - 1.0 + seed * 13.0, i + seed)), b = h21(vec2(BEATN + seed * 13.0, i + seed));
  return mix(a, b, smoothstep(0.0, glide * (0.75 + 0.5 * h21(vec2(i, seed + 5.0))), BPH));   // each unit glides at its own speed
}
// Hold a focus for the phrase (bars), move in its last beat: how an LD actually programs positions.
float presetHold(float i, float seed, float bars){
  float k = floor(MT / (4.0 * bars));
  float a = h21(vec2(k - 1.0 + seed * 13.0, i)), b = h21(vec2(k + seed * 13.0, i));
  float g = 0.25 / bars * (0.75 + 0.5 * h21(vec2(i, seed + 5.0)));
  return mix(a, b, smoothstep(1.0 - g, 1.0, fract(MT / (4.0 * bars))));
}
// One colour on stage per look; looks alternate every 'bars' bars. iC2 is for accents and drops.
vec3 lookC(float bars){ float k = mod(floor(MT / (4.0 * bars)), 2.0); return k < 0.5 ? iC0 : iC1; }
float barN(){ return floor(MT / 4.0); }
vec3 tung(float i){ i = clamp(i, 0.0, 1.2); return mix(vec3(1.0, 0.22, 0.02), vec3(1.0, 0.82, 0.6), sqrt(min(i, 1.0))) * i; }
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float k = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * k); }
vec2 proj(vec3 P){ vec3 v = P - CO; float z = max(dot(v, CF), 0.01); return vec2(dot(v, CR), dot(v, CU)) * CFOV / z; }

// Standard rig: n trusses from downstage to upstage.
void stdTruss(float y, int n){
  NTR = n;
  for (int i = 0; i < 6; i++){
    if (i >= n) break;
    float f = n > 1 ? float(i) / float(n - 1) : 0.0;
    TR[i] = vec4(0.0, y + f * 0.8, mix(1.2, DECKZ - 1.5, f), STW + 1.0 - f * 1.5);
  }
}
// A fixture hanging under truss j; f in −1..1 along it.
vec3 onTruss(int j, float f){ vec4 T = TR[j]; return vec3(T.x + f * T.w * 0.92, T.y - 0.45, T.z); }

// ── Camera ──
#ifdef STAGE_DIRECTOR
// ── Director: a 3D shot list cut on the bar lines ──
// Shot length follows the rig's temperament (GMF): a cut every 2 bars, every 4 for mellow rigs.
// Shots: 0 wide push-in · 1 handheld in the crowd · 2 crane · 3 long lens on the act · 4 side profile from
// the wings · 5 rig cam over the crowd · 6 slider across the barricade · 7 reverse from upstage.
// Mellow rigs skip the handheld, the high shot and the reverse; mid rigs skip the reverse; warehouses skip the crane.
int directorPick(float k){
  int shot = int(floor(h21(vec2(k, 7.3)) * 8.0));
  if (GMF > 0.6 && (shot == 1 || shot == 5 || shot == 7)) shot = shot == 1 ? 0 : (shot == 5 ? 3 : 6);
  if (GMF >= 0.4 && shot == 7) shot = 6;            // over-the-shoulder reverse is for laser and high rigs only
  if (ENV == 2 && shot == 2) shot = 0;              // a warehouse ceiling turns a crane into a flat dolly
  return shot;
}
void directorShot(inout vec3 ro, inout vec3 ta){
  float len = GMF > 0.6 ? 16.0 : 8.0;
  float k = floor(MT / len);
  float u = fract(MT / len);
  float e = smoothstep(0.0, 1.0, u);
  int shot = directorPick(k);
  if (shot == directorPick(k - 1.0)) shot = (shot + 3) - 8 * ((shot + 3) / 8);   // never the same shot twice
  if ((ENV == 3 || ENV == 4) && (shot == 4 || shot == 7)) shot = 2;   // no wings or reverse inside a proscenium or a shell
  float sx = h21(vec2(k, 2.1)) < 0.5 ? -1.0 : 1.0;
  float ceilY = ENV == 2 ? 8.6 : (ENV == 3 ? 14.0 : 16.0);
  float t = iTime;
  vec3 hand = vec3(vnoise(vec2(t * 1.3, 1.0)), vnoise(vec2(t * 1.1, 2.0)), 0.0) - vec3(0.5, 0.5, 0.0);
  vec3 act = PERF == 0 ? vec3(0.0, DECKY + 3.0, 4.0) : vec3(0.0, DECKY + 1.35, 2.6);
  if (shot == 0){        // wide, pushing in
    ro = mix(vec3(sx * 3.0, 4.0, -22.0), vec3(sx * 1.5, 3.6, -15.0), e);
    ta = vec3(0.0, 6.5, 6.0); CAMFOV = mix(48.0, 42.0, e);
  } else if (shot == 1){ // handheld in the crowd, looking up at the rig
    ro = vec3(sx * 4.0, 1.85, -9.0 + e * 1.5) + hand * 0.12;
    ta = vec3(-sx * 1.0, 6.5, 6.0) + hand * 0.4; CAMFOV = 62.0;
  } else if (shot == 2){ // crane: high and wide, sweeping down
    ro = mix(vec3(-10.0 * sx, min(16.0, ceilY), -26.0), vec3(6.0 * sx, min(9.0, ceilY), -20.0), e);
    ta = vec3(0.0, 5.0, 5.0); CAMFOV = 44.0;
  } else if (shot == 3){ // long lens on the act, slow zoom
    ro = vec3(sx * 2.0, 3.6, -21.0);
    ta = act + vec3(sin(t * 0.2) * 0.15, 0.3, 0.0); CAMFOV = mix(22.0, 18.0, e);
  } else if (shot == 4){ // from the wings, across the stage: beams in profile
    ro = vec3(sx * (STW + 0.6), DECKY + 2.2, -1.0 + e * 1.5) + hand * 0.03;
    ta = vec3(-sx * 3.0, DECKY + 3.5, 5.0); CAMFOV = 50.0;
  } else if (shot == 5){ // high over the crowd, the beams coming at us
    ro = vec3(sx * 4.0, min(10.5, ceilY), -9.0 + e * 2.0);
    ta = vec3(-sx * 1.0, 5.5, 6.0); CAMFOV = 58.0;
  } else if (shot == 6){ // slider along the barricade
    ro = vec3(mix(-9.0, 9.0, e) * sx, 2.6, -6.0);
    ta = vec3(mix(-3.0, 3.0, e) * sx, 5.0, 5.0); CAMFOV = 40.0;
  } else {               // reverse, over the artist's shoulder, out to the crowd
    ro = vec3(sx * 2.2, DECKY + 1.9, 4.2) + hand * 0.05;
    ta = vec3(-sx * 1.0, 3.5, -20.0); CAMFOV = 58.0;
  }
  float kb = min(KICK, 1.0) * CAMSWAY * 0.5;
  ro += vec3(h21(vec2(BEATN, 1.0)) - 0.5, h21(vec2(BEATN, 2.0)) - 0.5, 0.0) * kb * 0.15;
}
#endif
void stageCamera(){
#if defined(STAGE_EMPTY) && !defined(STAGE_DIRECTOR)
  CAMDRIFT = 0.0; CAMSWAY = 0.0; CAMROLL = 0.0;   // a set-extension plate is locked off
#endif
  float v = iParam3;
  vec3 pit = vec3(0.0, 2.0, -8.0), foh = vec3(0.0, 3.4, -19.0), bal = vec3(0.0, 13.5, -33.0);
  vec3 ro = v < 0.5 ? mix(pit, foh, v * 2.0) : mix(foh, bal, v * 2.0 - 1.0);
  float t = iTime;
  vec3 drift = vec3(sin(t * 0.071) * 2.2 + sin(t * 0.023) * 1.4, sin(t * 0.053) * 0.4, sin(t * 0.037) * 1.5) * CAMDRIFT;
  ro += drift;
  float kb = min(KICK, 1.0) * CAMSWAY;
  ro += vec3(h21(vec2(BEATN, 1.0)) - 0.5, h21(vec2(BEATN, 2.0)) - 0.5, 0.0) * kb * 0.22;
  vec3 ta = CAMT + vec3(drift.x * 0.45, drift.y * 0.5, 0.0);
#ifdef STAGE_DIRECTOR
  directorShot(ro, ta);
#endif
  CO = ro; CF = normalize(ta - ro);
  float roll = CAMROLL + sin(t * 0.05) * 0.008 * CAMDRIFT + (h21(vec2(BEATN, 3.0)) - 0.5) * kb * 0.03;
  CR = normalize(cross(vec3(sin(roll), cos(roll), 0.0), CF)); CU = cross(CF, CR);
  CFOV = 0.5 / tan(radians(CAMFOV) * 0.5);
  PIXA = 1.0 / (iResolution.y * CFOV);
}

// ── Geometry ──
vec3 boxN;
vec2 boxT(vec3 ro, vec3 rd, vec3 c, vec3 hs){
  vec3 m = 1.0 / rd; vec3 n = m * (ro - c); vec3 k = abs(m) * hs;
  vec3 t1 = -n - k, t2 = -n + k;
  float tN = max(max(t1.x, t1.y), t1.z), tF = min(min(t2.x, t2.y), t2.z);
  boxN = -sign(rd) * step(t1.yzx, t1.xyz) * step(t1.zxy, t1.xyz);
  return vec2(tN, tF);
}
// Box truss face: two rails and a zig-zag of diagonals; coverage with pixel-footprint smoothing.
float latticeFace(float along, float across, float width, float px){
  float rail = min(across, width - across);
  float zz = abs(fract(along / width) * 2.0 - 1.0) * width;
  float diag = abs(across - zz) * 0.7071;
  float d = min(rail - 0.03, diag - 0.014);
  return smoothstep(px, -px, d);
}
// The nearest truss along the ray: depth, coverage (front and back lattice faces), face normal.
float TRT, TRA; vec3 TRN;
void trussTest(vec3 ro, vec3 rd, vec3 c, vec3 hs, int axis, float id, inout Hit h){
  vec2 tt = boxT(ro, rd, c, hs);
  if (tt.x > tt.y || tt.y < 0.0 || tt.x > h.t || tt.x > TRT) return;
  vec3 A = axis == 0 ? vec3(1.0, 0.0, 0.0) : (axis == 1 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0));
  float a = 0.0, t0 = -1.0; vec3 n0 = vec3(0.0);
  for (int f = 0; f < 2; f++){
    float t = f == 0 ? tt.x : tt.y;
    if (t < 0.0 || t > h.t) continue;
    vec3 P = ro + rd * t - c;
    vec3 q = abs(P) / hs;
    vec3 nn = q.x > q.y && q.x > q.z ? vec3(sign(P.x), 0.0, 0.0) : (q.y > q.z ? vec3(0.0, sign(P.y), 0.0) : vec3(0.0, 0.0, sign(P.z)));
    vec3 C = vec3(1.0) - A - abs(nn);
    if (dot(C, vec3(1.0)) < 0.5) continue;                        // end cap: open
    float width = 2.0 * dot(hs, C);
    float cov = latticeFace(dot(P, A), dot(P + hs, C), width, t * PIXA * 1.2);
    if (cov > 0.001){ if (t0 < 0.0){ t0 = t; n0 = f == 0 ? nn : -nn; } a = 1.0 - (1.0 - a) * (1.0 - cov); }
  }
  if (t0 > 0.0 && a > 0.004){ TRT = t0; TRA = a; TRN = n0; }
}
// Brushed aluminium: lit by the washes, the wall behind and the key; a long specular streak from above.
vec3 shadeTruss(vec3 rd){
  vec3 n = TRN;
  vec3 L = AMB * 0.5 + LEDAVG * 0.5 * max(n.z, 0.0) + HAZEC * 2.0 + vec3(0.012) + KEYC * 0.25 * max(-n.z, 0.0);
  vec3 col = vec3(0.6, 0.61, 0.64) * L * (0.55 + 0.45 * max(n.y, 0.0));
  float spec = pow(max(dot(reflect(rd, n), normalize(vec3(0.0, 0.8, -0.6))), 0.0), 12.0);
  return col + (AMB * 0.8 + HAZEC * 4.0 + vec3(0.01)) * spec + FLASH * 0.5;
}
void envHit(vec3 ro, vec3 rd, inout Hit h){
  if (ENV == 0 || ENV == 2 || ENV == 3){
    float side = ENV == 0 ? SIDEX : (ENV == 2 ? 17.0 : 19.0);
    float ceil = ENV == 0 ? CEIL : (ENV == 2 ? 9.6 : 16.0);
    if (rd.z > 0.0){ float t = (WALLZ + 1.5 - ro.z) / rd.z; if (t < h.t){ h.t = t; h.k = K_ENV; h.n = vec3(0.0, 0.0, -1.0); h.id = 0.0; } }
    if (rd.z < 0.0){ float t = ((ENV == 0 ? -45.0 : -30.0) - ro.z) / rd.z; if (t < h.t){ h.t = t; h.k = K_ENV; h.n = vec3(0.0, 0.0, 1.0); h.id = 8.0; } }
    float t = (sign(rd.x) * side - ro.x) / rd.x;
    if (t > 0.0 && t < h.t){ h.t = t; h.k = K_ENV; h.n = vec3(-sign(rd.x), 0.0, 0.0); h.id = 1.0; }
    if (rd.y > 0.0){ t = (ceil - ro.y) / rd.y; if (t < h.t){ h.t = t; h.k = K_ENV; h.n = vec3(0.0, -1.0, 0.0); h.id = 2.0; } }
    if (ENV == 3 && abs(rd.z) > 1e-4){
      // proscenium wall with an arched opening, velvet legs and border just upstage of it
      float ax = STW - 0.5;
      t = (0.4 - ro.z) / rd.z; vec3 P = ro + rd * t;
      float top = 10.0 + 1.5 * sqrt(max(1.0 - (P.x / ax) * (P.x / ax), 0.0));
      bool inArch = abs(P.x) < ax && P.y < top;
      if (t > 0.0 && t < h.t && !inArch){ h.t = t; h.k = K_ENV; h.n = vec3(0.0, 0.0, -1.0); h.id = 5.0; }
      t = (1.0 - ro.z) / rd.z; P = ro + rd * t;
      if (t > 0.0 && t < h.t && (abs(P.x) > ax - 1.6 || P.y > 9.6)){ h.t = t; h.k = K_ENV; h.n = vec3(0.0, 0.0, -1.0); h.id = 6.0; }
    }
  } else if ((ENV == 1 || ENV == 5) && !ROOF){
    if (rd.z > 0.0){ float t = (WALLZ + 1.0 - ro.z) / rd.z; vec3 P = ro + rd * t; if (t < h.t && abs(P.x) < WALLX + 1.0 && P.y < WALLY1 + 0.6){ h.t = t; h.k = K_ENV; h.n = vec3(0.0, 0.0, -1.0); h.id = 0.0; } }
  } else if (ENV == 1 || ENV == 5){
    vec2 tb = boxT(ro, rd, vec3(0.0, 17.0 + STW * 0.1, WALLZ * 0.5 - 1.0), vec3(STW + 6.0, 0.6, WALLZ * 0.5 + 2.0));
    if (tb.x < tb.y && tb.x > 0.0 && tb.x < h.t){ h.t = tb.x; h.k = K_ENV; h.n = boxN; h.id = 3.0; }
    for (int s = 0; s < 2; s++){
      float sx = (s == 0 ? -1.0 : 1.0) * (STW + 5.0);
      vec2 tw = boxT(ro, rd, vec3(sx, 8.8, 2.0), vec3(1.5, 8.8, 2.5));
      if (tw.x < tw.y && tw.x > 0.0 && tw.x < h.t){ h.t = tw.x; h.k = K_ENV; h.n = boxN; h.id = 4.0; }
    }
    if (rd.z > 0.0){ float t = (WALLZ + 1.0 - ro.z) / rd.z; vec3 P = ro + rd * t; if (t < h.t && abs(P.x) < STW + 6.0 && P.y < 17.5){ h.t = t; h.k = K_ENV; h.n = vec3(0.0, 0.0, -1.0); h.id = 0.0; } }
    if (ENV == 5){
      // the stadium bowl: a ring of stands 75 m round the pitch
      vec2 o = ro.xz - vec2(0.0, -10.0);
      float a = dot(rd.xz, rd.xz), b = dot(o, rd.xz), c = dot(o, o) - 75.0 * 75.0;
      float t = (-b + sqrt(max(b * b - a * c, 0.0))) / max(a, 1e-5);
      float y = ro.y + rd.y * t;
      if (t > 0.0 && t < h.t && y < 34.0){ h.t = t; h.k = K_ENV; h.n = vec3(0.0); h.id = 7.0; }
    }
  } else if (ENV == 4){
    // amphitheatre shell: concentric arches stepping in toward the stage
    for (int i = 0; i < 6; i++){
      if (rd.z <= 0.0) break;
      float fi = float(i);
      float z = -1.0 + fi * 2.2, R = 15.0 - fi * 1.6, Rp = i == 0 ? 40.0 : R + 1.6;
      float t = (z - ro.z) / rd.z;
      if (t <= 0.0 || t >= h.t) continue;
      vec2 q = (ro + rd * t).xy - vec2(0.0, DECKY);
      float r = length(q);
      if (q.y > 0.0 && r > R && r < Rp){ h.t = t; h.k = K_ENV; h.n = vec3(0.0, 0.0, -1.0); h.id = 20.0 + fi; break; }
    }
    if (rd.z > 0.0){ float t = (WALLZ + 1.0 - ro.z) / rd.z; vec3 P = ro + rd * t; if (t < h.t && length(P.xy - vec2(0.0, DECKY)) < 8.0 && P.y > 0.0){ h.t = t; h.k = K_ENV; h.n = vec3(0.0, 0.0, -1.0); h.id = 0.0; } }
  }
}
// ── Performers: planar silhouettes standing on the deck, facing the audience ──
float sdCap(vec2 p, vec2 a, vec2 b, float r){ return sdSeg(p, a, b) - r; }
// A standing figure, feet at the origin, metres. pose 0 guitar · 1 singer at a mic · 2 arms up · 3 one fist up
float figure(vec2 q, float pose, float seed){
  float k = min(KICK, 1.0) * step(0.4, NRG);
  float bang = pose < 0.5 ? k * 0.06 : 0.0;
  float sway = sin(MT * PI * 0.5 + seed * 3.0) * 0.03;
  q.x -= sway * clamp(q.y, 0.0, 1.8);
  float d = sdCap(q, vec2(-0.1, 0.0), vec2(-0.085, 0.86), 0.072);
  d = min(d, sdCap(q, vec2(0.1, 0.0), vec2(0.085, 0.86), 0.072));
  d = min(d, length(max(abs(q - vec2(0.0, 1.16)) - vec2(0.13, 0.25), 0.0)) - 0.075);
  d = min(d, length((q - vec2(bang * 0.3, 1.66 - bang)) * vec2(1.05, 0.9)) - 0.105);
  vec2 sl = vec2(-0.2, 1.38), sr = vec2(0.2, 1.38);
  if (pose < 0.5){
    d = min(d, min(sdCap(q, sl, vec2(-0.32, 1.12), 0.042), sdCap(q, vec2(-0.32, 1.12), vec2(-0.5, 1.22), 0.038)));
    float strum = sin(iTime * 9.0 + seed) * 0.04 * (0.3 + k);
    d = min(d, min(sdCap(q, sr, vec2(0.24, 1.08), 0.042), sdCap(q, vec2(0.24, 1.08), vec2(0.08, 1.0 + strum), 0.038)));
    d = min(d, length((q - vec2(0.05, 0.98)) * vec2(1.0, 1.35)) - 0.2);
    d = min(d, sdCap(q, vec2(0.05, 1.0), vec2(-0.72, 1.24), 0.024));
  } else if (pose < 1.5){
    d = min(d, min(sdCap(q, sr, vec2(0.25, 1.18), 0.042), sdCap(q, vec2(0.25, 1.18), vec2(0.07, 1.56), 0.038)));
    float reach = sin(MT * PI * 0.25 + seed) * 0.5 + 0.5;
    d = min(d, min(sdCap(q, sl, vec2(-0.38, 1.2 + reach * 0.25), 0.042), sdCap(q, vec2(-0.38, 1.2 + reach * 0.25), vec2(-0.55, 1.15 + reach * 0.6), 0.038)));
    d = min(d, sdCap(q, vec2(0.05, 0.0), vec2(0.05, 1.45), 0.012));
    d = min(d, sdCap(q, vec2(0.05, 1.45), vec2(0.04, 1.58), 0.02));
    d = min(d, length(max(abs(q - vec2(0.05, 0.02)) - vec2(0.18, 0.01), 0.0)) - 0.01);
  } else if (pose < 2.5){
    float up = 0.3 + 0.7 * smoothstep(0.1, 0.6, DROP + k * 0.5);
    d = min(d, min(sdCap(q, sl, vec2(-0.32, 1.38 + up * 0.25), 0.042), sdCap(q, vec2(-0.32, 1.38 + up * 0.25), vec2(-0.36, 1.45 + up * 0.62), 0.038)));
    d = min(d, min(sdCap(q, sr, vec2(0.32, 1.38 + up * 0.25), 0.042), sdCap(q, vec2(0.32, 1.38 + up * 0.25), vec2(0.36, 1.45 + up * 0.62), 0.038)));
  } else {
    float pump = 0.5 + 0.5 * k;
    d = min(d, min(sdCap(q, sr, vec2(0.3, 1.55), 0.042), sdCap(q, vec2(0.3, 1.55), vec2(0.28, 1.75 + pump * 0.3), 0.038)));
    d = min(d, min(sdCap(q, sl, vec2(-0.25, 1.15), 0.042), sdCap(q, vec2(-0.25, 1.15), vec2(-0.05, 1.5), 0.038)));
  }
  return d;
}
// A drum kit seen from the front: kick drum, toms, cymbals on stands, the drummer behind.
float drumKit(vec2 q){
  float d = length(q - vec2(0.0, 0.32)) - 0.3;
  d = min(d, length((q - vec2(-0.32, 0.72)) * vec2(1.0, 1.3)) - 0.15);
  d = min(d, length((q - vec2(0.3, 0.7)) * vec2(1.0, 1.3)) - 0.16);
  d = min(d, length((q - vec2(-0.75, 1.3)) * vec2(1.0, 9.0)) - 0.3);
  d = min(d, length((q - vec2(0.8, 1.45)) * vec2(1.0, 9.0)) - 0.34);
  d = min(d, length((q - vec2(-0.6, 1.0)) * vec2(1.0, 9.0)) - 0.2);
  d = min(d, min(sdCap(q, vec2(-0.75, 0.0), vec2(-0.75, 1.3), 0.012), sdCap(q, vec2(0.8, 0.0), vec2(0.8, 1.45), 0.012)));
  float hit = min(KICK + SNARE, 1.0);
  d = min(d, length(max(abs(q - vec2(0.0, 0.95)) - vec2(0.15, 0.25), 0.0)) - 0.07);
  d = min(d, length(q - vec2(0.0, 1.38 - hit * 0.04)) - 0.1);
  d = min(d, sdCap(q, vec2(-0.18, 1.12), vec2(-0.45, 0.85 + hit * 0.25), 0.04));
  d = min(d, sdCap(q, vec2(0.18, 1.12), vec2(0.42, 1.0 + (1.0 - hit) * 0.2), 0.04));
  return d;
}
// A choir row: shoulders and heads, packed.
float choirRow(vec2 q, float seed){
  float cell = floor(q.x / 0.62);
  float cx = (cell + 0.5) * 0.62;
  vec2 r = vec2(q.x - cx, q.y - 1.62 - h21(vec2(cell, seed)) * 0.12 - sin(MT * PI * 0.5 + cell) * 0.015);
  return min(length(r * vec2(1.05, 0.9)) - 0.1, length(max(vec2(abs(r.x) - 0.12, r.y + 0.34), 0.0)) - 0.11);
}
void cutout(vec3 ro, vec3 rd, vec3 base, float kind, float pose, float seed, inout Hit h){
  vec3 tc = vec3(CO.x - base.x, 0.0, CO.z - base.z);
  float yaw = clamp(atan(tc.x, -tc.z), -0.61, 0.61);      // turn toward the camera, but no more than 35°: three-quarter from the wings
  vec3 nrm = kind > 1.5 ? vec3(0.0, 0.0, -1.0) : vec3(sin(yaw), 0.0, -cos(yaw));
  float den = dot(rd, nrm);
  if (abs(den) < 1e-4) return;
  float t = dot(base - ro, nrm) / den;
  if (t <= 0.0 || t >= h.t) return;
  vec3 P = ro + rd * t;
  vec2 q = vec2(dot(P - base, cross(nrm, vec3(0.0, 1.0, 0.0))), P.y - base.y);
  if (q.y < -0.05 || q.y > 2.6 || abs(q.x) > (kind > 1.5 ? 8.0 : 1.2)) return;
  float d = kind < 0.5 ? figure(q, pose, seed) : (kind < 1.5 ? drumKit(q) : choirRow(q, seed));
  float px = t * PIXA * 1.2;
  if (d < 0.0){ h.t = t; h.k = K_PERF; h.n = vec3(0.0, 0.0, -1.0); h.id = d; h.u = q.x; }
}
void boxHit(vec3 ro, vec3 rd, vec3 c, vec3 hs, float id, inout Hit h){
  vec2 tb = boxT(ro, rd, c, hs);
  if (tb.x < tb.y && tb.x > 0.0 && tb.x < h.t){ h.t = tb.x; h.k = K_PERF; h.n = boxN; h.id = id; }
}
void performers(vec3 ro, vec3 rd, inout Hit h){
  if (PERF == 0) return;
  float y = DECKY;
  if (PERF == 1){
    boxHit(ro, rd, vec3(0.0, y + 0.3, 7.0), vec3(2.0, 0.3, 1.4), 100.0, h);
    boxHit(ro, rd, vec3(-4.6, y + 0.65, 5.8), vec3(0.75, 0.65, 0.35), 101.0, h);
    boxHit(ro, rd, vec3(4.6, y + 0.65, 5.8), vec3(0.75, 0.65, 0.35), 101.0, h);
    cutout(ro, rd, vec3(0.0, y + 0.6, 6.7), 1.0, 0.0, 9.0, h);
    cutout(ro, rd, vec3(0.0, y, 2.4), 0.0, 1.0, 1.0, h);
    cutout(ro, rd, vec3(-4.2, y, 3.6), 0.0, 0.0, 2.0, h);
    cutout(ro, rd, vec3(4.0, y, 3.9), 0.0, 0.0, 3.0, h);
  } else if (PERF == 2){
    boxHit(ro, rd, vec3(0.0, y + 0.55, 3.0), vec3(1.7, 0.55, 0.45), 102.0, h);
    cutout(ro, rd, vec3(0.0, y, 3.7), 0.0, 2.0, 4.0, h);
  } else if (PERF == 3){
    cutout(ro, rd, vec3(0.0, y, 2.6), 0.0, 1.0, 5.0, h);
  } else if (PERF == 4){
    for (int i = 0; i < 3; i++){
      float fi = float(i);
      boxHit(ro, rd, vec3(0.0, y + 0.2 + fi * 0.4, 6.4 + fi * 0.9), vec3(STW * 0.6, 0.2 + fi * 0.4, 0.45), 101.0, h);
      cutout(ro, rd, vec3(0.31 * fi, y + fi * 0.8, 6.3 + fi * 0.9), 2.0, 0.0, 20.0 + fi, h);
    }
    cutout(ro, rd, vec3(0.0, y, 2.6), 0.0, 1.0, 5.0, h);
  } else {
    cutout(ro, rd, vec3(-1.2, y, 2.8), 0.0, 0.0, 6.0, h);
    cutout(ro, rd, vec3(1.2, y, 2.6), 0.0, 1.0, 7.0, h);
  }
}
vec3 shadePerf(vec3 ro, vec3 rd, Hit h){
  if (h.id > 99.5){
    vec3 c = vec3(0.008) + AMB * 0.12;
    if (h.id > 101.5 && h.n.z < -0.5){
      vec2 q = h.p.xy - vec2(0.0, DECKY + 0.55);
      float bars = smoothstep(0.3, 0.6, sin(q.x * 6.0 - MT * PI) * 0.5 + 0.5);
      c += cyc(q.x * 0.1 + MT * 0.0625) * (0.25 + bars * (0.4 + KICK * 0.8)) * smoothstep(0.5, 0.45, abs(q.y));
    }
    if (h.id > 100.5 && h.id < 101.5 && h.n.z < -0.5) c *= 0.6 + 0.4 * step(0.5, fract(h.p.y * 12.0));
    return c + KEYC * 0.15 + FLASH * 0.06;
  }
  float px = h.t * PIXA;
  float rim = exp(-max(-h.id, 0.0) / (0.012 + px * 0.6 + (1.0 - smoothstep(6.0, 16.0, h.t)) * 0.03));
  float body = 0.45 + 0.55 * smoothstep(0.0, 0.06, -h.id);   // edges fall off, centre holds: volume, not cardboard
  float near = smoothstep(6.0, 16.0, h.t);                    // close shots go backlit: the key only reads from distance
  float skin = mix(0.22, 1.0, smoothstep(1.46, 1.56, h.p.y - DECKY));   // dark stage clothes; faces catch the key
  return vec3(0.004) + AMB * 0.18 * near
       + KEYC * 0.7 * near * body * skin * (0.6 + 0.4 * sqrt(max(1.0 - pow(h.u / 0.25, 2.0), 0.0)))   // round, not flat * (0.15 + 0.85 * smoothstep(DECKY, DECKY + 1.7, h.p.y))
       + RIMC * rim * 0.35 * smoothstep(0.7, 1.5, h.p.y - DECKY) + FLASH * 0.1;   // backlight catches heads and shoulders
}
Hit sceneHit(vec3 ro, vec3 rd){
  Hit h; h.t = 1e4; h.k = K_SKY; h.n = vec3(0.0); h.id = 0.0; h.u = 0.0;
  TRT = 1e4; TRA = 0.0; TRN = vec3(0.0);
  if (rd.y < 0.0){ float t = -ro.y / rd.y; if (t < h.t){ h.t = t; h.k = K_FLOOR; h.n = vec3(0.0, 1.0, 0.0); } }
  vec2 tb = boxT(ro, rd, vec3(0.0, DECKY * 0.5, DECKZ * 0.5), vec3(STW, DECKY * 0.5, DECKZ * 0.5));
  if (tb.x < tb.y && tb.x > 0.0 && tb.x < h.t){ h.t = tb.x; h.k = K_DECK; h.n = boxN; }
  if (rd.z > 0.0){
    float t = (WALLZ - ro.z) / rd.z; vec3 P = ro + rd * t;
    if (t < h.t && abs(P.x) < WALLX && P.y > WALLY0 && P.y < WALLY1){ h.t = t; h.k = K_WALL; h.n = vec3(0.0, 0.0, -1.0); }
  }
  envHit(ro, rd, h);
  performers(ro, rd, h);
  for (int i = 0; i < 6; i++){ if (i >= NTR) break; vec4 T = TR[i]; trussTest(ro, rd, T.xyz, vec3(T.w, 0.2, 0.2), 0, float(i), h); }
  for (int i = 0; i < 4; i++){ if (i >= NTW) break; vec4 T = TW[i]; trussTest(ro, rd, vec3(T.x, TOWH * 0.5, T.y), vec3(0.22, TOWH * 0.5, 0.22), 1, float(i) + 10.0, h); }
  if (SPK){
    for (int s = 0; s < 2; s++){
      float sx = (s == 0 ? -1.0 : 1.0) * (STW + 2.6);
      vec2 ts = boxT(ro, rd, vec3(sx, 9.2, -0.6), vec3(0.55, 3.2, 0.55));
      if (ts.x < ts.y && ts.x > 0.0 && ts.x < h.t){ h.t = ts.x; h.k = K_SPK; h.n = boxN; h.id = float(s); }
    }
  }
  h.p = ro + rd * h.t;
  return h;
}

// ── LED wall content (q in 0..1 over the wall) ──
vec3 ledImage(vec2 q, int kind){
  float t = iTime;
  float asp = (2.0 * WALLX) / max(WALLY1 - WALLY0, 0.1);
  vec2 c = (q - 0.5) * vec2(asp, 1.0);
  if (kind == 0){        // mirrored spectrum
    float x = abs(q.x - 0.5) * 2.0;
    float bins = 28.0, b = floor(x * bins) / bins;
    float f = fft(0.012 + b * 0.5);
    float top = 0.05 + f * 0.9;
    float bar = smoothstep(0.0, 0.012, top - q.y) * smoothstep(0.1, 0.22, fract(x * bins));
    float cap = smoothstep(0.02, 0.0, abs(q.y - top - 0.02)) * smoothstep(0.1, 0.22, fract(x * bins));
    return cyc(b * 0.7 + MT * 0.02) * bar * (0.3 + f * 1.3) + vec3(1.0) * cap * 0.8 + iC2 * 0.03;
  }
  if (kind == 1){        // square tunnel, a ring launched on every kick
    float r = max(abs(c.x) * 0.7, abs(c.y));
    float z = 0.18 / max(r, 0.02) + MT * 0.5;
    float ring = smoothstep(0.12, 0.0, abs(fract(z) - 0.5)) * smoothstep(0.0, 0.2, r);
    return cyc(floor(z) * 0.21) * ring * (0.45 + KICK * 0.9) + mix(iC2, iC0, smoothstep(0.0, 0.5, r)) * 0.035 + iC0 * exp(-r * 7.0) * (0.3 + BASS * 0.5);
  }
  if (kind == 2){        // radial burst
    float a = atan(c.y, c.x), r = length(c);
    float rays = smoothstep(0.55, 0.95, sin(a * 12.0 + MT * 0.8) * 0.5 + 0.5);
    float shock = smoothstep(0.05, 0.0, abs(r - fract(MT) * 1.4)) * KICK;
    return mix(iC0, iC1, rays) * (rays * 0.6 + 0.1) * (0.4 + BASS) * smoothstep(1.4, 0.1, r) + iC2 * shock * 1.5 + vec3(1.0) * exp(-r * 9.0) * (0.3 + KICK);
  }
  if (kind == 3){        // sunset: banded sun over a horizon
    float hz = 0.3;
    vec3 sky = mix(iC0, iC2 * 0.5, smoothstep(hz, 1.0, q.y));
    vec2 sc = c - vec2(0.0, hz - 0.5 + 0.18);
    float sun = smoothstep(0.24, 0.235, length(sc));
    float bands = step(0.25, fract(q.y * 18.0 - t * 0.2)) + step(hz + 0.12, q.y);
    vec3 col = sky * (0.35 + LVL * 0.3) + mix(iC1, vec3(1.0, 0.9, 0.6), smoothstep(-0.2, 0.2, sc.y)) * sun * min(bands, 1.0) * (0.9 + BASS * 0.3);
    if (q.y < hz) col = mix(iC2 * 0.06, col * 0.4, smoothstep(hz - 0.3, hz, q.y)) * (0.8 + 0.2 * sin(q.y * 140.0 - t * 2.0));
    return col;
  }
  if (kind == 4){        // vertical bars stepping on the beat
    float n = 12.0, i = floor(q.x * n);
    float on = chase(i, 4.0, 1.0) + chase(n - 1.0 - i, 4.0, 1.0);
    float bar = smoothstep(0.08, 0.16, fract(q.x * n)) * smoothstep(0.92, 0.84, fract(q.x * n));
    return cyc(i / n + barN() * 0.33) * bar * (0.08 + min(on, 1.0) * (0.6 + KICK * 0.8));
  }
  if (kind == 5){        // oscilloscope
    float w = (wave(q.x) - 0.5) * 2.0;
    float d = abs(q.y - 0.5 - w * 0.4);
    return iC0 * exp(-d * 60.0) * 1.5 + iC1 * exp(-d * 12.0) * 0.3 + iC2 * 0.02;
  }
  if (kind == 6){        // fibre-optic star drop
    vec2 g = q * vec2(asp, 1.0) * 46.0; vec2 id = floor(g); vec2 f = fract(g) - 0.5;
    float s = step(0.62, h21(id)) * smoothstep(0.18, 0.0, length(f - (h22(id) - 0.5) * 0.5));
    float tw = 0.4 + 0.6 * sin(t * (0.6 + h21(id + 3.0) * 2.0) + h21(id) * 40.0) * (0.6 + TREB * 0.6);
    return mix(vec3(1.0, 0.92, 0.8), iC1, h21(id + 9.0) * 0.5) * s * max(tw, 0.0) * 1.6 + iC0 * 0.015;
  }
  if (kind == 7){        // liquid colour field
    vec2 p = c * 1.6;
    float n = fbm(p + vec2(fbm(p + t * 0.08, 4), fbm(p * 1.3 - t * 0.06, 4)) * 1.8, 4);
    return ramp(smoothstep(0.25, 0.85, n)) * (0.25 + 0.6 * n) * (0.7 + BASS * 0.6);
  }
  if (kind == 8){        // synthwave grid + sun
    float hz = 0.42;
    if (q.y < hz){
      float z = 0.12 / max(hz - q.y, 0.01);
      vec2 g = vec2(c.x * z, z + MT * 0.5);
      vec2 l = abs(fract(g) - 0.5);
      float line = smoothstep(0.06 * z, 0.0, min(l.x, l.y) - 0.0);
      return iC0 * line * 0.9 * smoothstep(0.0, 0.3, hz - q.y + 0.05) + iC2 * 0.05;
    }
    vec2 sc = c - vec2(0.0, hz - 0.5 + 0.2);
    float sun = smoothstep(0.26, 0.25, length(sc)) * step(0.3, fract(q.y * 22.0 + t * 0.3) + smoothstep(0.1, 0.2, sc.y));
    return mix(iC1, iC2, smoothstep(-0.25, 0.25, sc.y)) * sun * (0.9 + BASS * 0.4) + iC1 * 0.06 * (1.0 - q.y);
  }
  if (kind == 9){        // soft gradient wash
    float g = q.y + 0.15 * sin(c.x * 1.5 + t * 0.2) + 0.1 * sin(c.x * 0.7 - t * 0.13);
    return mix(iC0, iC1, smoothstep(0.0, 1.0, g)) * (0.25 + LVL * 0.25) + iC2 * exp(-length(c - vec2(0.0, 0.2)) * 2.5) * 0.25;
  }
  if (kind == 10){       // strobe cells
    vec2 g = q * vec2(asp * 3.0, 3.0); vec2 id = floor(g); vec2 f = abs(fract(g) - 0.5);
    float on = step(0.6, h21(id + floor(MT * 2.0) * 7.0)) * (KICK + HAT * 0.6) + step(0.88, h21(id + floor(iTime * 15.0))) * HAT;
    float cell = smoothstep(0.48, 0.42, max(f.x, f.y));
    return mix(vec3(1.0), iC0, 0.25) * cell * (0.03 + on * 1.2);
  }
  // 11 · iris: a ring that breathes, opening on every kick
  float r = length(c);
  float R = 0.32 + BASS * 0.08 + KICK * 0.06;
  float ring = exp(-pow((r - R) / 0.03, 2.0));
  return mix(iC0, iC1, smoothstep(-0.3, 0.3, c.y)) * ring * 1.4 + iC2 * smoothstep(R, 0.0, r) * 0.18 + iC1 * exp(-r * 2.0) * 0.06;
}
vec3 ledPixel(vec2 q, float t){
  vec2 res = vec2(192.0, floor(192.0 * (WALLY1 - WALLY0) / (2.0 * WALLX)));
  float ratio = (2.0 * WALLX / res.x) / max(t * PIXA, 1e-5);   // LED pitch in screen pixels
  vec2 g = q * res;
  vec2 qq = mix(q, (floor(g) + 0.5) / res, smoothstep(1.2, 2.5, ratio));
  vec3 c = ledImage(qq, LEDK);
  if (LEDK == 6) return c;
  float dotm = smoothstep(0.5, 0.2, length(fract(g) - 0.5)) * 1.6;
  float mask = mix(0.62, dotm, smoothstep(1.5, 4.0, ratio));
  vec2 mg = abs(fract(g / 16.0) - 0.5);
  float seam = smoothstep(0.49, 0.5, max(mg.x, mg.y)) * smoothstep(1.0, 3.0, ratio);
  return c * mask * (1.0 - seam * 0.6);
}
vec3 backdrop(vec2 q, vec3 P){
  if (LEDK == -2){
    vec3 c = mix(iC0, iC2, smoothstep(0.0, 1.0, q.y));
    return c * (0.05 + exp(-q.y * 3.5) * 0.4 + LVL * 0.06) * CYCB;
  }
  float fold = 0.85 + 0.15 * sin(P.x * 2.7 + sin(P.x * 0.6) * 2.0);
  return (AMB * 0.25 + vec3(0.003)) * fold;
}

// ── Shading ──
vec3 sky(vec3 rd){
  float e = rd.y;
  vec3 c = mix(SKYHOR, SKYTOP, smoothstep(-0.05, 0.6, e));
  c += HAZEC * 1.5 * exp(-max(e, 0.0) * 5.0);
  if (STARN > 0.0){
    vec2 sp = vec2(atan(rd.x, rd.z), asin(clamp(e, -1.0, 1.0))) * 1.2;
    c += stars(sp, 70.0, 5.0, TREB) * 0.5 * STARN * smoothstep(0.0, 0.15, e);
  }
  if (CLOUD > 0.0 && e > 0.0){
    vec2 cp = rd.xz / max(e, 0.06) * 0.35 + vec2(iTime * 0.006, 0.0);
    float cl = fbm(cp, 4);
    c += (HAZEC * 3.0 + AMB * 0.1) * smoothstep(0.45, 0.85, cl) * smoothstep(0.02, 0.25, e) * CLOUD;
  }
  return c;
}
vec3 tiers(vec2 uv, float t){
  vec2 g = vec2(uv.x / 0.55, uv.y / 0.8);
  vec2 id = floor(g); vec2 f = fract(g) - 0.5;
  float px = t * PIXA / 0.55;
  float occ = step(0.22, h21(id + 7.0));
  float person = occ * smoothstep(0.42 + px, 0.3 - px, length(f * vec2(1.3, 1.0)));
  vec3 c = vec3(0.008, 0.008, 0.011) + (AMB * 0.06 + HAZEC * 0.5) * (0.3 + person);
  float ph = step(1.0 - PHONES * 0.12 - 0.004, h21(id + 3.3));
  float tw = 0.65 + 0.35 * sin(iTime * 1.7 + h21(id) * 40.0);
  float s = 0.07 + px;
  c += PHONEC * ph * tw * smoothstep(s, 0.0, length(f - vec2(0.0, 0.25))) * 1.1 * (0.07 / s);
  return c;
}
float mirrorSpots(vec3 P){
  vec3 d = normalize(P - MBALL.xyz);
  float a = atan(d.z, d.x) + iTime * 0.22, e = acos(clamp(d.y, -1.0, 1.0));
  vec2 g = vec2(a / TAU * 80.0, e / PI * 40.0);
  vec2 id = floor(g); vec2 f = fract(g) - 0.5;
  return step(0.45, h21(id)) * smoothstep(0.15, 0.06, length(f));
}
vec3 shadeEnv(vec3 ro, vec3 rd, Hit h){
  vec3 P = h.p; float id = h.id; float px = h.t * PIXA;
  if (id < 0.5){ float fold = 0.85 + 0.15 * sin(P.x * 2.7 + sin(P.x * 0.6) * 2.0); return (AMB * 0.12 + HAZEC * 0.6 + vec3(0.002)) * fold; }
  if (id < 1.5){
    if (ENV == 2){
      vec2 b = vec2(P.z / 0.5 + floor(P.y / 0.25) * 0.5, P.y / 0.25); vec2 f = abs(fract(b) - 0.5);
      float mortar = smoothstep(0.42, 0.48, max(f.x, f.y));
      return vec3(0.03, 0.013, 0.009) * (0.6 + 0.8 * h21(floor(b))) * (1.0 - mortar * 0.6) * (AMB * 3.0 + HAZEC * 8.0 + 0.12);
    }
    if (ENV == 3) return vec3(0.03, 0.006, 0.008) * (0.15 + AMB * 3.0);
    return tiers(vec2(P.z, P.y), h.t);
  }
  if (id < 2.5){
    float s = ENV == 2 ? 3.0 : 6.0;
    vec2 g = abs(fract(P.xz / s) - 0.5) * s;
    float steel = smoothstep(0.15 + px, 0.15 - px, min(g.x, g.y));
    return vec3(0.003) + (HAZEC * 1.5 + AMB * 0.05) * (0.4 + steel * 1.5);
  }
  if (id < 3.5){
    vec2 g = abs(fract(P.xz / 2.0) - 0.5) * 2.0;
    float steel = smoothstep(0.06 + px, 0.06 - px, min(g.x, g.y));
    return vec3(0.004) + (AMB * 0.06 + HAZEC * 0.5) * (0.4 + steel * 1.2);
  }
  if (id < 4.5){
    vec2 g = abs(fract(P.yz / 1.5) - 0.5) * 1.5; float x = abs(fract((P.y + P.z) / 1.5) - 0.5) * 1.5;
    float steel = smoothstep(0.04 + px, 0.04 - px, min(min(g.x, g.y), x));
    return vec3(0.003) + (AMB * 0.04 + HAZEC * 0.4) * (0.4 + steel * 1.2);
  }
  if (id < 5.5){
    float ax = STW - 0.5;
    float top = 10.0 + 1.5 * sqrt(max(1.0 - (P.x / ax) * (P.x / ax), 0.0));
    float d = abs(P.x) < ax ? P.y - top : (P.y < 10.0 ? abs(P.x) - ax : length(vec2(abs(P.x) - ax, P.y - 10.0)));
    float gilt = smoothstep(0.7, 0.5, d) * smoothstep(0.0, 0.1, d);
    vec3 plaster = vec3(0.05, 0.012, 0.012) * (0.12 + AMB * 2.5);
    return mix(plaster, vec3(0.55, 0.38, 0.13) * (0.08 + AMB * 3.0), gilt);
  }
  if (id < 6.5){
    float fold = sin(P.x * 5.0 + sin(P.x * 1.3) * 2.0 + P.y * 0.15);
    return vec3(0.30, 0.012, 0.025) * (0.02 + AMB * 1.6 + HAZEC * 2.0) * (0.35 + (0.5 + 0.5 * fold) * 0.9);
  }
  if (id < 7.5) return tiers(vec2(atan(P.x, P.z + 10.0) * 75.0, P.y), h.t);
  if (id < 8.5){                                                   // the back of the house, seen from the stage
    if (ENV == 2) return vec3(0.02, 0.009, 0.006) * (0.6 + 0.8 * h21(floor(P.xy / vec2(0.5, 0.25)))) * (AMB * 3.0 + HAZEC * 8.0 + 0.12);
    if (ENV == 3) return vec3(0.03, 0.006, 0.008) * (0.15 + AMB * 3.0);
    return tiers(vec2(P.x, P.y), h.t);
  }
  int ri = int(id - 20.0);
  vec2 q = P.xy - vec2(0.0, DECKY); float r = length(q);
  float R = 15.0 - float(ri) * 1.6;
  vec3 lc = SHELL[ri];
  vec3 c = vec3(0.5, 0.48, 0.45) * (lc * 0.22 + AMB * 0.3 + 0.003) * (0.7 + 0.3 * smoothstep(0.0, 1.6, r - R));
  return c + lc * exp(-(r - R) * 7.0) * 1.2;
}
vec3 shadeDeck(vec3 ro, vec3 rd, Hit h){
  vec3 P = h.p;
  if (h.n.y > 0.5){
    vec3 c = vec3(0.010, 0.010, 0.012) * (0.8 + 0.4 * vnoise(P.xz * 3.0)) + AMB * 0.9;
    vec2 kp = P.xz - vec2(0.0, 2.8);
    c += KEYC * 0.6 * exp(-dot(kp, kp) / 4.0);                   // the key light's pool down centre
    vec3 rr = reflect(rd, h.n);
    rr.xz += (vec2(vnoise(P.xz * 1.5), vnoise(P.xz * 1.5 + 9.0)) - 0.5) * 0.015;
    float fres = min(0.05 + 0.55 * pow(1.0 - clamp(-rd.y, 0.0, 1.0), 5.0), mix(0.08, 0.22, smoothstep(0.05, 0.25, -rd.y)));
    if (rr.z > 0.0 && LEDK >= 0){
      float tw = (WALLZ - P.z) / rr.z; vec3 Q = P + rr * tw;
      if (abs(Q.x) < WALLX && Q.y > WALLY0 && Q.y < WALLY1)
        c += min(ledImage(vec2((Q.x + WALLX) / (2.0 * WALLX), (Q.y - WALLY0) / (WALLY1 - WALLY0)), LEDK) * LEDB * mix(0.55, 1.0, GM), vec3(1.5)) * fres * 0.9;
    }
    return c;
  }
  vec3 c = vec3(0.005) * (0.7 + 0.3 * sin(P.x * 9.0)) + AMB * 0.04;
  float lip = smoothstep(DECKY - 0.14, DECKY - 0.06, P.y) * smoothstep(DECKY, DECKY - 0.03, P.y);
  float ch = mix(1.0, 0.15 + 0.85 * smoothstep(0.3, 0.9, sin(P.x * 0.9 - MT * PI) * 0.5 + 0.5), LIPCH);
  return c + LIP * lip * ch * 3.0;
}
vec3 shade(vec3 ro, vec3 rd, Hit h){
  vec3 P = h.p; vec3 col; float alb = 0.05;
  if (h.k == K_SKY) return sky(rd);
  if (h.k == K_WALL){
    vec2 q = vec2((P.x + WALLX) / (2.0 * WALLX), (P.y - WALLY0) / (WALLY1 - WALLY0));
    col = LEDK < 0 ? backdrop(q, P) : ledPixel(q, h.t) * LEDB * mix(0.55, 1.0, GM);
    alb = LEDK == -2 ? 0.3 : 0.03;
  } else if (h.k == K_DECK){ col = shadeDeck(ro, rd, h); alb = 0.03; }
  else if (h.k == K_FLOOR){ col = vec3(0.005) + AMB * 0.04 + (AMB * 0.6 + LEDAVG * 0.25 * LEDB) * exp(-max(-P.z, 0.0) / 9.0) * (0.6 + 0.4 * vnoise(P.xz * 0.8)); alb = 0.02; }
  else if (h.k == K_TRUSS){
    vec3 L = AMB * 0.5 + LEDAVG * 0.5 * max(h.n.z, 0.0) + HAZEC * 2.0 + vec3(0.015);
    col = vec3(0.55, 0.56, 0.6) * L * (0.55 + 0.45 * max(h.n.y, 0.0) + 0.2 * max(-h.n.z, 0.0));
    alb = 0.5;
  } else if (h.k == K_SPK){
    float seam = smoothstep(0.47, 0.5, abs(fract((P.y - 6.0) / 0.42) - 0.5));
    col = vec3(0.01) * (1.0 - seam * 0.8) + AMB * 0.02 + HAZEC * 0.4;
    alb = 0.04;
  } else if (h.k == K_PERF){ col = shadePerf(ro, rd, h); alb = 0.04; }
  else { col = shadeEnv(ro, rd, h); alb = 0.08; }
  col += alb * FLASH * 1.5;
  if (MBALL.w > 0.0) col += mirrorSpots(P) * MBALL.w * (0.15 + alb * 3.0) * mix(vec3(1.0), iC1, 0.25);
  return col;
}
vec3 hazeFog(vec3 col, Hit h){
  float f = 1.0 - exp(-min(h.t, 90.0) * 0.008 * HAZE);
  return col * (1.0 - f * 0.4) + HAZEC * f * HAZE * 3.0;
}

// ── Light ──
float beamEnd(vec3 s, vec3 d){
  if (d.y > -0.01) return 120.0;
  float u = (DECKY - s.y) / d.y; vec3 P = s + d * u;
  if (u > 0.0 && abs(P.x) < STW && P.z > 0.0 && P.z < DECKZ) return u;
  return max(-s.y / d.y, 0.0);
}
// A moving-head beam through haze: lens radius w0, spread k (metres of radius per metre),
// colour×intensity c, gobo (0 open · 1 spokes · 2 ring+dot · 3 leaf breakup; fraction = rotation speed).
// ── Fixture bodies: what you actually see of a moving head when it isn't pointing at you ──
// A round head (the lens on its face) in a yoke under a base box, hung from the truss (or standing on
// the deck). The nearest one along the ray is kept and composited over the light after rig().
float FXT; vec4 FXC;
float REFL;   // 1 while rendering the deck's reflection: emitters there are dimmed (a satin deck, not a mirror)
void fixtureBody(vec3 ro, vec3 rd, Hit h, vec3 s, vec3 d, vec3 c){
  vec3 hc = s - d * 0.15;
  vec3 oc = ro - hc;
  float b = dot(oc, rd);
  float tc = -b;
  if (tc <= 0.3 || tc > min(FXT, h.t)) return;
  float dist = sqrt(max(dot(oc, oc) - b * b, 0.0));
  float px = tc * PIXA;
  if (dist > 0.75 + px) return;                       // nowhere near this fixture: the common case, keep it cheap
  bool hung = s.y > DECKY + 3.0;
  vec2 tb = boxT(ro, rd, s + vec3(0.0, hung ? 0.42 : -0.42, 0.0), vec3(0.2, 0.09, 0.16));
  bool base = tb.x < tb.y && tb.x > 0.0 && tb.x < min(FXT, h.t);
  float cov = smoothstep(0.2 + px, 0.2 - px, dist);
  if (cov > 0.0){
    float disc = b * b - (dot(oc, oc) - 0.04);
    vec3 n = normalize(ro + rd * (disc > 0.0 ? -b - sqrt(disc) : tc) - hc);
    float lensF = smoothstep(0.55, 0.78, dot(n, d));
    vec3 body = vec3(0.010) * (0.4 + 0.6 * max(n.y, 0.0)) + AMB * 0.06 * max(n.y, 0.0) + KEYC * 0.12 * max(-n.z, 0.0) + LEDAVG * 0.08 * max(n.z, 0.0);
    float spec = pow(max(dot(reflect(rd, n), normalize(vec3(0.2, 0.6, -0.8))), 0.0), 24.0);
    body += vec3(0.3) * spec * (0.03 + dot(AMB + HAZEC, vec3(0.5)));
    vec3 lens = c * 1.4 + vec3(0.015, 0.016, 0.02) * (1.0 + 4.0 * spec);   // glass lit from inside
    FXC = vec4(mix(body, lens, lensF), cov); FXT = tc;
  } else if (base){
    FXC = vec4(vec3(0.008) + AMB * 0.04, 1.0); FXT = tb.x;
  }
}
vec3 beam(vec3 ro, vec3 rd, Hit h, vec3 s, vec3 d, float w0, float k, vec3 c, float gobo){
  fixtureBody(ro, rd, h, s, d, c);
  if (dot(c, vec3(1.0)) < 0.002) return vec3(0.0);
  float fv = h21(s.xz * 7.13 + s.y);                        // no two lamps are identical: output and colour temperature
  c *= (0.84 + 0.32 * fv) * mix(vec3(1.0), vec3(1.0, 0.95, 0.88), fv * 0.4);
  vec3 w = ro - s;
  float b = dot(rd, d), dd = dot(rd, w), e = dot(d, w);
  float den = max(1.0 - b * b, 1e-5);
  float uEnd = beamEnd(s, d);
  float u = clamp((e - b * dd) / den, 0.0, uEnd);
  vec3 B = s + d * u;
  float t = max(dot(B - ro, rd), 0.0);
  vec3 A = ro + rd * t;
  vec3 off = A - B;
  float dist = length(off);
  float r = w0 + k * u;
  float rEff = max(r, t * PIXA);
  vec3 acc = vec3(0.0);
  if (dist < rEff * 6.0 && t < h.t + 1.0){
    float sinT = max(sqrt(den), 0.07);
    float phase = 1.0 + 5.0 * pow(max(-b, 0.0), 10.0);
    float base = 0.05 / (rEff * sinT) * phase * HAZE * smoothstep(h.t + 0.6, h.t - 0.6, t) / (1.0 + u * 0.03);
    float scatter = exp(-dist / (rEff * 2.0)) * 0.06;          // multiple scattering: the air round a beam glows
    float core = 0.0;
    if (dist < rEff * 2.6){
      float g = exp(-dist * dist / (rEff * rEff));
      if (gobo > 0.5){
        vec3 ga = normalize(cross(d, abs(d.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), gb = cross(d, ga);
        float kind = floor(gobo);
        float ang = atan(dot(off, gb), dot(off, ga)) + iTime * fract(gobo) * 4.0;
        float rr = dist / rEff;
        float pat = kind < 1.5 ? 0.12 + 0.88 * smoothstep(0.1, 0.5, sin(ang * 5.0) * 0.5 + 0.5)
                  : (kind < 2.5 ? max(smoothstep(0.2, 0.0, abs(rr - 0.85)), smoothstep(0.38, 0.22, rr))
                  : smoothstep(0.38, 0.72, vnoise(vec2(ang * 1.6 + floor(gobo * 7.0), rr * 2.5 - iTime * fract(gobo)))));
        g *= mix(0.6, pat, smoothstep(0.03, 0.12, r / rEff));
      }
      vec3 hz = A * 0.32 + vec3(0.0, -iTime * 0.25, iTime * 0.12);
      float n = vnoise(hz) * 0.65 + vnoise(hz * 2.7 + 4.0) * 0.35;
      core = g * (0.25 + 1.3 * n * n);                         // haze is never even: it drifts in the beam
    }
    acc += c * (core + scatter * 0.55) * base;
  }
  if (h.k == K_DECK || h.k == K_FLOOR || h.k == K_ENV || h.k == K_WALL || h.k == K_PERF){
    vec3 v = h.p - s; float uu = dot(v, d);
    if (uu > 0.0){
      float rr = w0 + k * uu; vec3 rv = v - d * uu;
      float lam = max(dot(h.n, -d), 0.0) + (h.k == K_ENV && h.n == vec3(0.0) ? 0.5 : 0.0);
      acc += c * exp(-dot(rv, rv) / (rr * rr)) * lam * 0.08 / (rr * rr + 0.05) * (h.k == K_WALL ? 0.15 : 1.0);
    }
  }
  vec3 ts = s - ro; float sd = length(ts); vec3 vs = ts / sd;
  if (sd < h.t + 0.5){
    float a2 = max(2.0 - 2.0 * dot(rd, vs), 0.0);
    float lr = w0 * 1.4 / sd; float lr2 = lr * lr + PIXA * PIXA;
    float face = max(dot(-d, vs), 0.0);
    float on = 0.12 + 8.0 * pow(face, 24.0);
    acc += c * on * (smoothstep(lr2 * 1.2, lr2 * 0.6, a2) * 2.0 + lr2 * 0.6 / (a2 + lr2 * 0.8));
    float fg = pow(face, 8.0);
    acc += c * fg * 0.6 * (lr2 * 30.0) / (a2 + lr2 * 30.0);
    if (fg > 0.2){
      vec2 dp = SP - proj(s);
      acc += mix(c, vec3(0.5, 0.7, 1.0) * dot(c, LUMA), 0.6) * fg * 0.25 * exp(-pow(dp.y * iResolution.y * 0.6, 2.0)) * exp(-abs(dp.x) * 5.0);
    }
  }
  return acc;
}
vec3 bulb(vec3 ro, vec3 rd, Hit h, vec3 pos, float rad, vec3 c){
  vec3 ts = pos - ro; float sd = length(ts);
  if (sd > h.t + rad) return vec3(0.0);
  float a2 = max(2.0 - 2.0 * dot(rd, ts / sd), 0.0);
  float lr = rad / sd; float lr2 = lr * lr + PIXA * PIXA * 0.5;
  return c * (smoothstep(lr2 * 1.3, lr2 * 0.7, a2) + lr2 * 0.8 / (a2 + lr2 * 2.0));
}
// A flat emitter facing the audience (strobe, batten, LED panel): face plus bloom.
vec3 panel(vec3 ro, vec3 rd, Hit h, vec3 pos, vec2 hs, vec3 c){
  c *= 1.0 - REFL * 0.9;
  if (dot(c, vec3(1.0)) < 0.002) return vec3(0.0);
  vec3 acc = vec3(0.0);
  if (rd.z > 0.0){
    float tp = (pos.z - ro.z) / rd.z;
    if (tp < h.t + 0.05){ vec2 q = abs((ro + rd * tp).xy - pos.xy) - hs; float px = tp * PIXA; acc += c * smoothstep(px, -px, max(q.x, q.y)) * 3.0; }
  }
  vec3 ts = pos - ro; float sd = length(ts); vec3 vs = ts / sd;
  if (sd < h.t + 0.5){ float a2 = max(2.0 - 2.0 * dot(rd, vs), 0.0); float sz = hs.x * hs.y / (sd * sd) + PIXA * PIXA; acc += c * max(vs.z, 0.0) * sz * 2.0 / (a2 + sz * 1.5); }
  return acc;
}
// 2×2 molefay blinder: tungsten lamps that flash white and cool down through amber.
vec3 blinder(vec3 ro, vec3 rd, Hit h, vec3 p, float on){
  if (on < 0.01) return vec3(0.0);
  vec3 c = tung(on) * 5.0;
  vec3 acc = vec3(0.0);
  for (int k = 0; k < 4; k++){ vec2 o = vec2(float(k % 2) - 0.5, float(k / 2) - 0.5) * 0.32; acc += bulb(ro, rd, h, p + vec3(o, 0.0), 0.12, c); }
  return acc;
}
vec3 followspot(vec3 ro, vec3 rd, Hit h, vec3 from, vec3 at, float rad, vec3 c){
  vec3 d = at - from; float L = length(d);
  return beam(ro, rd, h, from, d / L, 0.15, rad / L, c, 0.0);
}
// Laser: thinner than a pixel, so the visible width is the pixel footprint and the energy is kept.
vec3 laser(vec3 ro, vec3 rd, Hit h, vec3 s, vec3 d, vec3 c){
  c *= 0.84 + 0.32 * h21(s.xz * 7.13 + s.y);
  vec3 w = ro - s;
  float b = dot(rd, d), dd = dot(rd, w), e = dot(d, w);
  float den = max(1.0 - b * b, 1e-5);
  float uEnd = beamEnd(s, d);
  float u = clamp((e - b * dd) / den, 0.0, uEnd);
  vec3 B = s + d * u;
  float t = max(dot(B - ro, rd), 0.0);
  vec3 off = ro + rd * t - B;
  float dist2 = dot(off, off);
  float rEff = max(0.006 + u * 0.0005, t * PIXA * 0.75);
  vec3 acc = vec3(0.0);
  if (dist2 < rEff * rEff * 144.0 && t < h.t + 0.2){
    float sinT = max(sqrt(den), 0.05);
    float sc = 0.6 + 0.4 * sin(dot(B, vec3(3.1, 5.3, 4.7)) + iTime * 4.0) * sin(dot(B, vec3(1.3, -2.1, 0.7)) - iTime * 2.3);
    float core = exp(-dist2 / (rEff * rEff));
    float glow = exp(-sqrt(dist2) / (rEff * 5.0)) * 0.12;
    acc = c * (core + glow) * 0.01 / (rEff * sinT) * HAZE * sc / (1.0 + u * 0.015);
  }
  if (h.k != K_SKY){
    vec3 v = h.p - s; float uu = dot(v, d);
    if (uu > 0.0 && uu < uEnd + 1.0){ vec3 rv = v - d * uu; float rr = 0.02 + h.t * PIXA; acc += c * exp(-dot(rv, rv) / (rr * rr)) * 1.5; }
  }
  return acc;
}
vec3 laserFan(vec3 ro, vec3 rd, Hit h, vec3 s, float pan, float tilt, float spread, float roll, int n, vec3 c){
  if (dot(c, vec3(1.0)) < 0.003) return vec3(0.0);
  vec3 fwd = aim(pan, tilt);
  vec3 side = cross(vec3(0.0, 1.0, 0.0), fwd);
  side = length(side) < 1e-3 ? vec3(1.0, 0.0, 0.0) : normalize(side);
  vec3 ax = side * cos(roll) + cross(fwd, side) * sin(roll);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 16; i++){
    if (i >= n) break;
    float f = n > 1 ? float(i) / float(n - 1) - 0.5 : 0.0;
    acc += laser(ro, rd, h, s, normalize(fwd + ax * tan(spread * f)), c);
  }
  return acc + bulb(ro, rd, h, s, 0.05, c * 0.8);
}
vec3 laserCone(vec3 ro, vec3 rd, Hit h, vec3 s, vec3 axis, float ang, float spin, int n, vec3 c){
  if (dot(c, vec3(1.0)) < 0.003) return vec3(0.0);
  vec3 a = normalize(cross(axis, vec3(0.0, 1.0, 0.0)) + vec3(1e-4)); vec3 b = cross(axis, a);
  vec3 acc = vec3(0.0); float ta = tan(ang);
  for (int i = 0; i < 16; i++){
    if (i >= n) break;
    float th = float(i) / float(n) * TAU + spin;
    acc += laser(ro, rd, h, s, normalize(axis + (a * cos(th) + b * sin(th)) * ta), c);
  }
  return acc + bulb(ro, rd, h, s, 0.06, c);
}
// Scanned laser sheet at height H ("liquid sky"), waves of amplitude amp travelling at spd.
vec3 laserSheet(vec3 ro, vec3 rd, Hit h, vec3 src, float H, float amp, float freq, float spd, vec3 c){
  if (abs(rd.y) < 1e-3) return vec3(0.0);
  float t = (H - ro.y) / rd.y;
  if (t < 0.0 || t > h.t) return vec3(0.0);
  vec3 P;
  for (int i = 0; i < 3; i++){
    P = ro + rd * t;
    float wv = sin(P.x * freq + MT * spd) * cos(P.z * freq * 0.7 - iTime * 0.8) * amp;
    t = (H + wv - ro.y) / rd.y;
  }
  if (t < 0.0 || t > h.t) return vec3(0.0);
  P = ro + rd * t;
  vec2 rel = P.xz - src.xz; float r = length(rel);
  float scan = 0.55 + 0.45 * sin(atan(rel.x, -rel.y) * 120.0 + iTime * 3.0);
  float edge = smoothstep(60.0, 32.0, r) * smoothstep(0.0, 3.0, r);
  float grazing = 0.015 / max(abs(rd.y), 0.025);
  float n = 0.5 + vnoise(P * 0.25 + vec3(0.0, 0.0, iTime * 0.2));
  return c * grazing * scan * edge * n * HAZE;
}
// Pyro flame column on the deck lip.
vec3 flame(vec3 ro, vec3 rd, Hit h, vec3 base, float hgt, float seed){
  if (hgt < 0.05 || rd.z <= 0.0) return vec3(0.0);
  float t = (base.z - ro.z) / rd.z;
  if (t < 0.0 || t > h.t) return vec3(0.0);
  vec2 q = (ro + rd * t).xy - base.xy;
  if (q.y < 0.0 || q.y > hgt * 1.5 || abs(q.x) > 2.5) return vec3(0.0);
  float y = q.y / hgt;
  float n = fbm(vec2(q.x * 1.6, q.y * 0.9 - iTime * 5.0) + seed, 4);
  float w = 0.35 * (0.4 + y * 1.2) * (0.6 + 0.8 * n);
  float dens = smoothstep(w, w * 0.2, abs(q.x + (n - 0.5) * 0.9 * y)) * smoothstep(1.4, 0.6, y + (n - 0.5) * 0.6);
  float heat = clamp(dens * (1.25 - y * 0.9), 0.0, 1.0);
  vec3 fc = mix(vec3(0.6, 0.05, 0.0), vec3(1.0, 0.45, 0.05), smoothstep(0.1, 0.5, heat));
  fc = mix(fc, vec3(1.0, 0.9, 0.6), smoothstep(0.55, 0.95, heat));
  return fc * dens * heat * 6.0;
}
// CO2 jet: a white plume lit by the rig.
vec3 co2(vec3 ro, vec3 rd, Hit h, vec3 base, float on, float lean){
  if (on < 0.02 || rd.z <= 0.0) return vec3(0.0);
  float t = (base.z - ro.z) / rd.z;
  if (t < 0.0 || t > h.t) return vec3(0.0);
  vec2 q = (ro + rd * t).xy - base.xy; q.x -= lean * q.y;
  float hgt = 7.0 * sqrt(min(on, 1.0));
  if (q.y < 0.0 || q.y > hgt * 1.3 || abs(q.x) > 6.0) return vec3(0.0);
  float y = q.y / hgt;
  float n = fbm(vec2(q.x * 1.2, q.y * 0.7 - iTime * 6.0) + base.x, 4);
  float w = 0.15 + y * 1.1;
  float dens = smoothstep(w, w * 0.25, abs(q.x + (n - 0.5) * y * 1.5)) * smoothstep(1.3, 0.5, y + (n - 0.5) * 0.5) * (0.4 + n);
  return (vec3(0.9, 0.93, 1.0) * 0.22 + AMB * 3.0 + HAZEC * 10.0) * dens * min(on, 1.0);
}
vec3 festoon(vec3 ro, vec3 rd, Hit h, vec3 a, vec3 b, float sag, int n, vec3 c){
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 24; i++){
    if (i >= n) break;
    float f = (float(i) + 0.5) / float(n);
    vec3 p = mix(a, b, f); p.y -= sag * 4.0 * f * (1.0 - f);
    acc += bulb(ro, rd, h, p, 0.05, c * (0.85 + 0.15 * sin(iTime * 3.0 + float(i) * 7.3)));
  }
  return acc;
}
// Kinetic winch orbs: an nx × nz grid hanging at C, heights in a travelling wave.
vec3 kinetic(vec3 ro, vec3 rd, Hit h, vec3 C, vec2 size, int nx, int nz, float t, float amp, vec3 c0, vec3 c1){
  vec3 acc = vec3(0.0);
  for (int iz = 0; iz < 6; iz++){
    if (iz >= nz) break;
    for (int ix = 0; ix < 12; ix++){
      if (ix >= nx) break;
      float fx = fan(ix, nx), fz = fan(iz, nz);
      float wv = sin(t + fx * 2.2 + fz * 1.4) * 0.6 + sin(t * 0.7 - length(vec2(fx, fz)) * 3.0) * 0.4;
      vec3 p = C + vec3(fx * size.x, wv * amp, fz * size.y);
      acc += bulb(ro, rd, h, p, 0.32, mix(c0, c1, wv * 0.5 + 0.5));
    }
  }
  return acc;
}

// ── Audience ──
vec3 crowd(vec3 col, vec3 ro, vec3 rd){
  if (CROWD <= 0.0 || abs(rd.z) < 1e-4) return col;
  vec3 glowAcc = vec3(0.0), acc = vec3(0.0);
  float T = 1.0;                                             // what still shows through the rows in front
  bool facing = rd.z > 0.0;                                   // looking at the stage (backs) or from it (faces)
  float tf = length(vec3(0.0, DECKY + 1.5, 3.0) - ro);         // the lens is focused on the stage
  for (int r = 0; r < 8; r++){
    if (T < 0.02) break;                                     // fully covered by nearer people
    int ri = facing ? 7 - r : r;                             // nearest rows first
    float fr = float(ri);
    float zr = -2.2 - fr * 2.4 - fr * fr * 0.12;              // world rows from the barricade back
    float t = (zr - ro.z) / rd.z;
    if (t < 0.4) continue;
    vec3 P = ro + rd * t;
    if (P.y > 2.9 || P.y < -0.5) continue;
    // Depth of field: rows near the camera fall out of focus.
    float coc = 0.02 * abs(1.0 - t / tf) / CFOV;
    float px = t * PIXA * 1.2 + coc;
    float sx = 0.5;
    float cell = floor(P.x / sx + fr * 0.37);
    float best = 1e3, bestY = 0.0, bestArm = 1e3;
    for (int k = -1; k <= 1; k++){
      float cid = cell + float(k);
      vec2 sd = vec2(cid, fr * 7.1);
      float hh = h21(sd);
      if (hh > CROWD + 0.04) continue;
      float cx = (cid + 0.5 + (h21(sd + 3.0) - 0.5) * 0.45 - fr * 0.37) * sx;
      float hgt = 1.58 + 0.26 * h21(sd + 11.0);
      float jump = step(0.35, hh) * (min(KICK, 1.0) * 0.07 * NRG + 0.025 * sin(MT * PI + hh * 6.0) * NRG);
      vec2 q = vec2(P.x - cx, P.y - hgt - jump);
      float head = length(q * vec2(1.08, 0.88)) - 0.105;
      float body = length(max(vec2(abs(q.x) - 0.11, q.y + 0.34), 0.0)) - 0.11;
      float neck = length(max(abs(q - vec2(0.0, -0.17)) - vec2(0.045, 0.08), 0.0));
      float d = min(min(head, body), neck);
      float arm = 1e3;
      if (h21(sd + 5.0) < HANDS){
        float side = h21(sd + 8.0) < 0.5 ? -1.0 : 1.0;
        float sway = sin(iTime * 1.1 + hh * 9.0) * 0.08 + sin(MT * PI * 0.5 + hh * 3.0) * 0.06 * NRG;
        vec2 hand = vec2(side * 0.22 + sway, 0.42 + min(KICK, 1.0) * 0.04);
        arm = sdSeg(q, vec2(side * 0.15, -0.28), hand) - 0.032;
        if (h21(sd + 9.0) < 0.45) arm = min(arm, sdSeg(q, vec2(-side * 0.15, -0.28), vec2(-side * 0.2 + sway, 0.38)) - 0.032);
        if (h21(sd + 13.0) < PHONES){
          vec2 pq = q - hand - vec2(0.0, 0.06);
          float tw = 0.8 + 0.2 * sin(iTime * 2.0 + hh * 30.0);
          glowAcc += T * PHONEC * tw * 0.55 * (smoothstep(px + 0.01, -px, max(abs(pq.x) / 0.022, abs(pq.y) / 0.04) - 1.0) * 2.0 + 0.0012 / (dot(pq, pq) + 0.0012) * 0.25) * (1.0 - smoothstep(0.0, 1.0, glowAcc.g));
        }
      }
      if (d < best){ best = d; bestY = q.y; }
      bestArm = min(bestArm, arm);
    }
    float cov = smoothstep(px, -px, min(best, bestArm));
    float armCov = smoothstep(px, -px, bestArm);
    float far = 1.0 - exp(-t * 0.025 * HAZE);
    vec3 person;
    if (facing){
      // Backlit by the show: only the top edges (heads, shoulders, raised arms) catch light.
      // Backlit: heads and shoulders catch an edge; raised arms against the stage stay black.
      float edge = exp(-max(-best, 0.0) / (0.008 + px * 0.4)) * smoothstep(px, -px, best) * smoothstep(-0.03, 0.12, bestY);
      person = vec3(0.002) + RIMC * edge * 0.3 + RIMC * 0.04 * armCov * (1.0 - smoothstep(px, -px, best));
    } else {
      // Seen from the stage: faces and shirts lit by the rig and the wall, falling off with depth.
      float lit = (0.35 + 0.65 * smoothstep(-0.5, 0.1, bestY)) * exp(-max(t - 4.0, 0.0) * 0.05);
      person = vec3(0.006) + (AMB * 0.9 + LEDAVG * 0.35 + KEYC * 0.2) * lit * (0.7 + 0.6 * h21(vec2(cell, fr)));
    }
    person += HAZEC * far * HAZE * 2.0;
    acc += T * cov * person;
    T *= 1.0 - cov;
  }
  return acc + T * col + glowAcc;
}

vec3 stagePost(vec3 col, vec2 p, vec2 fc){
  col += vec3(1.0, 0.97, 0.92) * FLASH * 0.1;
  col *= vignette(p, 0.45);
  col += (h21(fc + fract(iTime * 13.7) * 117.0) - 0.5) * 0.012 * (0.4 + sqrt(max(dot(col, LUMA), 0.0)));
  return finish(col, fc, 1.7 + LVL * 0.15, 1.1);
}
`;

export const STAGE_MAIN = `
void main(){
  stageAudio();
  stageDefaults();
  setup();
#ifdef STAGE_EMPTY
  PERF = 0;                                       // a set-extension plate: the stage, lit and waiting
  HANDS = 0.0; PHONES = min(PHONES, 0.1);         // nothing crosses the deck lip where talent is composited
#endif
  GM = mix(GMF, 1.0, smoothstep(0.25, 0.85, NRG)) + DROP * 0.15;   // quiet sections sit low; the song opens them up
  stageCamera();
  vec2 fc = vUv * iResolution;
  vec2 p = aspectUv(); SP = p;
  vec3 rd = normalize(CF * CFOV + CR * p.x + CU * p.y);
  vec3 ro = CO;
  Hit h = sceneHit(ro, rd);
  vec3 col = shade(ro, rd, h);
  col = hazeFog(col, h);
  if (TRT < h.t){                                 // truss over whatever is behind it, by lattice coverage
    float f = 1.0 - exp(-min(TRT, 90.0) * 0.008 * HAZE);
    col = mix(col, shadeTruss(rd) * (1.0 - f * 0.4) + HAZEC * f * HAZE * 3.0, TRA);
  }
  // The rig is evaluated from one call site (ANGLE inlines every call): a second pass only on the deck,
  // where the satin floor mirrors the show, then the direct view.
  int passes = (h.k == K_DECK && h.n.y > 0.5) ? 2 : 1;
  for (int ps = 0; ps < 2; ps++){
    if (ps >= passes) break;
    vec3 o = ro, d = rd; Hit hh = h; float w = GM;
    FXT = 1e4; FXC = vec4(0.0); REFL = 0.0;
    if (ps == 0 && passes == 2){
      d = reflect(rd, h.n);
      d.xz += (vec2(vnoise(h.p.xz * 1.5), vnoise(h.p.xz * 1.5 + 7.0)) - 0.5) * 0.015;
      d = normalize(d); o = h.p + h.n * 0.02;
      hh.t = 1e4; hh.k = K_SKY; hh.p = o + d * 1e4; hh.n = vec3(0.0); hh.id = 0.0;
      w *= min(0.04 + 0.5 * pow(1.0 - clamp(-rd.y, 0.0, 1.0), 5.0), mix(0.08, 0.22, smoothstep(0.05, 0.25, -rd.y))) * 0.4;   // satin, not a mirror
      REFL = 1.0;
    }
    vec3 lit = rig(o, d, hh);
    if (REFL > 0.5) lit = min(lit, vec3(1.5));       // no single hot spot glares off the deck
    col += lit * w;
  }
  if (FXC.a > 0.0){                               // the fixtures themselves, over their own light
    float f = 1.0 - exp(-min(FXT, 90.0) * 0.008 * HAZE);
    col = mix(col, FXC.rgb * (1.0 - f * 0.4) + HAZEC * f * HAZE * 3.0, FXC.a);
  }
  col = crowd(col, ro, rd);
  if (iHDR > 0.5){
    col += vec3(1.0, 0.97, 0.92) * FLASH * 0.1;
    fragColor = vec4(max(col, 0.0) * (1.7 + LVL * 0.15), 1.0);
  } else fragColor = vec4(stagePost(col, p, fc), 1.0);
}
`;

/** Rig bodies by mode. Composed with HEADER + CEL_COMMON + STAGE_LIB … STAGE_MAIN in generators.ts. */
export const STAGE_BODIES: Record<string, string> = Object.fromEntries(Object.entries({ ...RIGS_ENERGETIC, ...RIGS_GENTLE }).map(([mode, body]) => {
  const rig = STAGE_RIGS.find(r => r.mode === mode);
  const gmf = { laser: 0.3, high: 0.3, mid: 0.5, mellow: 0.7 }[rig?.tier ?? 'mid'];
  return [mode, body.replace('void setup(){', `void setup(){\n  PERF = ${STAGE_ACT_ID[rig?.act ?? 'band']}; GMF = ${gmf.toFixed(2)};`)];
}));

/** Rigs render at 0.62 and are developed through the lens at that size: bloom and grain hide the upscale, lasers carry their own pixel-footprint width. */
export const STAGE_RENDER_SCALE: Record<string, number> = Object.fromEntries(Object.keys(STAGE_BODIES).flatMap(k => [[k, 0.62], [k + '_DIRECTOR', 0.62], [k + '_EMPTY', 0.62], [k + '_EMPTY_DIRECTOR', 0.62]]));
