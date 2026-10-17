// stageRigsGentle — the mid-tempo and mellow rigs (RIG_MID_*, RIG_MELLOW_*).
// Bodies for generatorsStage.ts: each defines setup() and rig().
//
// Mid rigs move in bars rather than beats and let the kick lift light instead of strobing it.
// Mellow rigs get envelope-smoothed audio (CALM_AUDIO_MODES): no strobes, no snaps, light that
// breathes with the level, slow drifts on iTime, warm sources, heavy soft haze.

// ── Mid ──

const M_FESTIVAL_DUSK = `
void setup(){
  ENV = 1; LEDK = 3; STW = 11.0; WALLX = 12.5; stdTruss(14.5, 2); ROOF = false; CAMT = vec3(0.0, 8.0, 6.0);
  NTW = 2; TW[0] = vec4(-STW - 1.5, 1.2, 0.0, 0.0); TW[1] = vec4(STW + 1.5, 1.2, 0.0, 0.0); TOWH = 15.5;
  SKYTOP = vec3(0.01, 0.015, 0.05); SKYHOR = iC0 * 0.22 + iC1 * 0.08; STARN = 0.25; CLOUD = 0.9;
  AMB = iC0 * (0.06 + LVL * 0.04); HAZEC = mix(iC0, iC1, 0.4) * 0.011;
  RIMC = mix(iC0, iC1, 0.3) * (0.6 + KICK * 0.3); HANDS = 0.45; PHONES = 0.15;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  // Eight beams leaning out into the dusk, sweeping over two bars.
  for (int i = 0; i < 8; i++){
    float f = fan(i, 8);
    acc += beam(ro, rd, h, onTruss(1, f), aim(f * 0.6 * SPR + sin(MT * PI * 0.125 + f) * 0.25, 1.15 + 0.25 * sin(MT * PI * 0.25 + f * 2.0)), 0.07, 0.02, mix(iC1, iC2, 0.5 + 0.5 * f) * (0.5 + KICK * 0.4), 0.0);
  }
  for (int i = 0; i < 6; i++){
    float f = fan(i, 6);
    acc += beam(ro, rd, h, onTruss(0, f), aim(f * 0.3, 0.3), 0.2, 0.1, iC0 * (0.4 + BASS * 0.3), 0.0);
  }
  return acc;
}`;

const M_POP_TOUR = `
void setup(){
  ENV = 0; LEDK = 9; stdTruss(12.0, 3);
  vec3 bc = mix(cyc(barN() * 0.333), cyc((barN() + 1.0) * 0.333), smoothstep(0.75, 1.0, fract(MT / 4.0)));
  AMB = bc * (0.05 + KICK * 0.04); HAZEC = bc * 0.01; RIMC = bc * (0.6 + KICK * 0.3);
  LIP = bc; LIPCH = 1.0; HANDS = 0.55; PHONES = 0.2; LEDB = 0.6; KEYC = vec3(1.0) * 0.45;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  vec3 bc = mix(cyc(barN() * 0.333), cyc((barN() + 1.0) * 0.333), smoothstep(0.75, 1.0, fract(MT / 4.0)));
  // Twelve beams in a travelling wave: the fan breathes in and out across the rig.
  for (int j = 0; j < 2; j++){
    for (int i = 0; i < 6; i++){
      float f = fan(i, 6);
      float pan = f * 0.5 * SPR + sin(MT * PI * 0.25 + f * 2.0 + float(j)) * 0.25;
      float tilt = 0.5 + 0.3 * sin(MT * PI * 0.25 + f * 3.0 + float(j) * PI);
      if (j == 1) tilt = mix(tilt, 1.3, smoothstep(0.6, 0.85, NRG));   // the chorus throws the back truss over the crowd
      acc += beam(ro, rd, h, onTruss(j + 1, f), aim(pan, tilt), 0.06, 0.013, mix(bc, vec3(1.0), 0.15 * float(j)) * (0.5 + KICK * 0.5), 0.0);
    }
  }
  return acc;
}`;

const M_GOSPEL_LIFT = `
void setup(){
  ENV = 0; LEDK = 9; stdTruss(12.5, 2);
  AMB = iC0 * (0.07 + LVL * 0.05); HAZEC = mix(iC0, iC1, 0.3) * 0.011;
  RIMC = mix(iC0, vec3(1.0), 0.4) * (0.6 + LVL * 0.4); HANDS = 0.85; PHONES = 0.1; LEDB = 0.55; KEYC = tung(0.85) * 0.4;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  // Uplift: white beams from behind the choir, rising and opening as the song builds.
  float open = 0.25 + LVL * 0.35 + KICK * 0.08;
  for (int i = 0; i < 10; i++){
    float f = fan(i, 10);
    acc += beam(ro, rd, h, vec3(f * 8.5, DECKY + 0.3, DECKZ - 0.8), aim(f * open * SPR + sin(MT * PI * 0.125 + f) * 0.08, 2.7 - abs(f) * 0.15), 0.06, 0.008, mix(vec3(1.0, 0.95, 0.88), iC0, 0.25) * (0.5 + LVL * 0.6), 0.0);
  }
  for (int i = 0; i < 6; i++){
    float f = fan(i, 6);
    acc += beam(ro, rd, h, onTruss(0, f), aim(f * 0.25, 0.35 + 0.1 * sin(MT * PI * 0.125 + f)), 0.18, 0.08, iC1 * (0.35 + MIDS * 0.3), 0.0);
  }
  acc += followspot(ro, rd, h, vec3(0.0, 16.0, -45.0), vec3(sin(iTime * 0.15) * 1.0, DECKY, 4.0), 1.3, vec3(1.0, 0.95, 0.85) * 0.8);
  return acc;
}`;

const M_VELVET_RNB = `
void setup(){
  ENV = 2; LEDK = 7; STW = 8.0; DECKZ = 8.5; WALLZ = 9.0; WALLX = 7.5; WALLY0 = 1.8; WALLY1 = 7.0; LEDB = 0.5;
  NTR = 1; TR[0] = vec4(0.0, 8.0, 2.5, 9.0); SPK = false;
  CAMT = vec3(0.0, 4.2, 5.0); CAMFOV = 50.0;
  MBALL = vec4(0.0, 7.2, 3.0, 0.3 + LVL * 0.3);
  AMB = iC0 * (0.05 + LVL * 0.04); HAZEC = mix(iC0, iC1, 0.5) * 0.012;
  RIMC = mix(iC0, iC1, 0.5) * (0.6 + KICK * 0.3); HANDS = 0.4; PHONES = 0.2;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  vec3 ball = MBALL.xyz;
  for (int i = 0; i < 2; i++){
    vec3 s = vec3((float(i) * 2.0 - 1.0) * 6.0, 8.0, -1.0);
    acc += beam(ro, rd, h, s, normalize(ball - s), 0.04, 0.006, vec3(1.0, 0.95, 0.9) * 0.6, 0.0);
  }
  // The ball itself: a sphere of tiny mirrors catching the pin spots.
  vec3 ts = ball - ro; float sd = length(ts);
  float a2 = max(2.0 - 2.0 * dot(rd, ts / sd), 0.0); float lr = 0.4 / sd;
  float sparkle = step(0.8, h21(floor(rd.xy * iResolution.y * 0.15) + floor(iTime * 6.0)));
  acc += vec3(0.8, 0.85, 1.0) * smoothstep(lr * lr, lr * lr * 0.8, a2) * (0.08 + sparkle * 1.2);
  for (int i = 0; i < 6; i++){
    float f = fan(i, 6);
    acc += beam(ro, rd, h, onTruss(0, f), aim(f * 0.5 * SPR + sin(MT * PI * 0.125 + f * 2.0) * 0.3, 0.6 + 0.25 * sin(MT * PI * 0.25 + f)), 0.08, 0.03, mix(iC0, iC1, 0.5 + 0.5 * f) * (0.35 + KICK * 0.4), 0.0);
  }
  return acc;
}`;

const M_PIXEL_BATTENS = `
void setup(){
  ENV = 0; LEDK = -1; stdTruss(12.0, 2);
  AMB = cyc(MT / 16.0) * (0.05 + KICK * 0.04); HAZEC = mix(iC0, iC1, 0.5) * 0.01;
  RIMC = cyc(MT / 16.0) * (0.5 + KICK * 0.3); HANDS = 0.5;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  // Fourteen vertical LED battens: a colour wave rolls across them; the pattern turns every 4 bars.
  float pat = mod(floor(MT / 16.0), 3.0);
  for (int i = 0; i < 16; i++){
    float f = fan(i, 16);
    float v = pat < 0.5 ? 0.5 + 0.5 * sin(f * 4.0 - MT * PI * 0.5)
            : (pat < 1.5 ? smoothstep(0.7, 1.0, sin(abs(f) * 6.0 - MT * PI) * 0.5 + 0.5) : 0.25 + 0.75 * chase(float(i), 8.0, 2.0));
    vec3 c = mix(iC0, iC1, f * 0.5 + 0.5) * (0.2 + v * (0.7 + KICK * 0.5));
    acc += panel(ro, rd, h, vec3(f * (STW - 1.0), DECKY + 3.6, DECKZ - 0.6), vec2(0.09, 3.0), c);
  }
  for (int i = 0; i < 8; i++){
    float f = fan(i, 8);
    acc += beam(ro, rd, h, onTruss(1, f), aim(f * 0.5 * SPR + sin(MT * PI * 0.125 + f) * 0.2, 0.55 + 0.3 * sin(MT * PI * 0.25 + f * 2.0)), 0.07, 0.015, iC2 * (0.4 + KICK * 0.4), 0.0);
  }
  return acc;
}`;

const M_INDIE_ARENA = `
void setup(){
  ENV = 0; LEDK = -1; stdTruss(11.5, 3);
  AMB = tung(0.5) * 0.08 + iC1 * 0.03 * (0.5 + MIDS); HAZEC = mix(iC0, iC1, 0.5) * 0.011;
  RIMC = mix(iC0, iC1, 0.3) * (0.6 + KICK * 0.3); HANDS = 0.4;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  // Tungsten gobo breakup from overhead, cold blue washes from the back, and two strings of bulbs.
  for (int i = 0; i < 8; i++){
    float f = fan(i, 8);
    acc += beam(ro, rd, h, onTruss(0, f), aim(f * 0.3 * SPR + sin(MT * PI * 0.125 + f * 1.5) * 0.15, 0.35 + 0.15 * sin(MT * PI * 0.25 + f)), 0.12, 0.05, iC0 * (0.5 + KICK * 0.4), 3.15);
  }
  for (int i = 0; i < 6; i++){
    float f = fan(i, 6);
    acc += beam(ro, rd, h, onTruss(2, f), aim(f * 0.4, 0.9 + 0.2 * sin(MT * PI * 0.125 + f * 2.0)), 0.15, 0.06, iC1 * (0.35 + MIDS * 0.4), 0.0);
  }
  acc += festoon(ro, rd, h, vec3(-STW, 9.0, 3.0), vec3(STW, 9.0, 5.0), 1.2, 20, tung(0.6) * 1.2 * (0.6 + LVL * 0.4));
  acc += festoon(ro, rd, h, vec3(-STW + 1.0, 10.0, 7.0), vec3(STW - 1.0, 10.0, 8.0), 1.4, 18, tung(0.6) * 1.0 * (0.6 + LVL * 0.4));
  return acc;
}`;

const M_WORSHIP_ARENA = `
void setup(){
  ENV = 0; LEDK = 6; LEDB = 0.6; stdTruss(12.5, 3);
  AMB = iC0 * (0.06 + LVL * 0.04); HAZEC = mix(iC0, iC2, 0.4) * 0.011;
  RIMC = mix(iC0, iC1, 0.4) * (0.6 + LVL * 0.4); HANDS = 0.6 + 0.3 * smoothstep(0.5, 0.9, NRG); PHONES = 0.25; KEYC = tung(0.85) * 0.45;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  // Wide white beams sweeping slow over the room in four-bar phrases; blue washes underneath.
  for (int i = 0; i < 12; i++){
    float f = fan(i, 12);
    float pan = f * 0.7 * SPR + sin(MT * PI * 0.125 + f * 1.2) * 0.3;
    acc += beam(ro, rd, h, onTruss(1, f), aim(pan, 0.75 + 0.2 * sin(MT * PI * 0.125 + f * 2.0)), 0.06, 0.012, iC1 * (0.3 + LVL * 0.5), 0.0);
  }
  for (int i = 0; i < 6; i++){
    float f = fan(i, 6);
    acc += beam(ro, rd, h, onTruss(2, f), aim(f * 0.3, 0.6), 0.2, 0.1, iC0 * (0.45 + BASS * 0.3), 0.0);
  }
  acc += followspot(ro, rd, h, vec3(0.0, 17.0, -45.0), vec3(0.0, DECKY, 2.4), 1.3, vec3(1.0, 0.97, 0.92) * 0.7);
  return acc;
}`;

const M_COUNTRY_NIGHT = `
void setup(){
  ENV = 5; LEDK = -1; STW = 13.0; WALLX = 14.0; WALLY1 = 11.0; stdTruss(15.0, 2);
  STARN = 1.0; CLOUD = 0.4; PHONES = 0.3;
  float down = mod(BEATN, 4.0) < 0.5 ? exp(-BPH * 3.0) : 0.0;
  AMB = iC0 * (0.07 + LVL * 0.05) + tung(down * 0.5) * 0.1;
  HAZEC = iC0 * 0.011; RIMC = mix(iC0, iC1, 0.3) * (0.6 + KICK * 0.3) + tung(down * 0.5); HANDS = 0.45;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  float down = mod(BEATN, 4.0) < 0.5 ? exp(-BPH * 3.0) : 0.0;
  for (int i = 0; i < 10; i++){
    float f = fan(i, 10);
    acc += beam(ro, rd, h, onTruss(1, f), aim(f * 0.6 * SPR + sin(MT * PI * 0.125 + f) * 0.2, 0.8 + 0.3 * sin(MT * PI * 0.125 + f * 2.0)), 0.09, 0.025, mix(iC0, iC1, 0.5 + 0.5 * f) * (0.45 + KICK * 0.4), 0.0);
  }
  // Blinders breathe on each bar's downbeat: a warm glow, never a flash.
  for (int i = 0; i < 6; i++) acc += blinder(ro, rd, h, onTruss(0, fan(i, 6) * 0.8) + vec3(0.0, 0.0, -0.35), down * 0.45 * RESP);
  return acc;
}`;

const M_KINETIC = `
void setup(){
  ENV = 0; LEDK = -1; NTR = 1; TR[0] = vec4(0.0, 13.0, 9.0, STW);
  AMB = mix(iC0, iC1, 0.5) * (0.04 + LVL * 0.03); HAZEC = mix(iC0, iC1, 0.5) * 0.01;
  RIMC = mix(iC0, iC1, 0.5) * (0.5 + KICK * 0.3); HANDS = 0.4; KEYC = tung(0.7) * 0.4;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  // A field of winch orbs over the stage, rolling in a wave that travels one bar per crest.
  acc += kinetic(ro, rd, h, vec3(0.0, 8.0, 4.0), vec2(STW * 0.9, 3.0), 10, 4, MT * PI * 0.25, 1.0 + LVL * 0.5, iC0 * (0.8 + KICK * 0.4), iC1 * (0.8 + KICK * 0.4));
  for (int i = 0; i < 6; i++){
    float f = fan(i, 6);
    acc += beam(ro, rd, h, onTruss(0, f), aim(f * 0.4 * SPR + sin(MT * PI * 0.125 + f * 2.0) * 0.25, 0.5 + 0.25 * sin(MT * PI * 0.25 + f)), 0.07, 0.016, iC2 * (0.35 + KICK * 0.5), 0.0);
  }
  return acc;
}`;

const M_SYNTHWAVE = `
void setup(){
  ENV = 0; LEDK = 8; stdTruss(12.0, 2);
  AMB = mix(iC0, iC1, 0.5) * (0.05 + KICK * 0.04); HAZEC = mix(iC0, iC1, 0.5) * 0.011;
  RIMC = mix(iC0, iC1, 0.5) * (0.6 + KICK * 0.3); LIP = iC1; LIPCH = 1.0; HANDS = 0.5;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  // Mirror-symmetric pairs: pink on the left, cyan on the right, swapping every 4 bars.
  float sw = mod(floor(MT / 16.0), 2.0);
  for (int i = 0; i < 10; i++){
    float f = fan(i, 10);
    vec3 c = (f < 0.0) == (sw < 0.5) ? iC0 : iC1;
    float pan = f * 0.5 * SPR + sign(f) * sin(MT * PI * 0.25) * 0.25;
    acc += beam(ro, rd, h, onTruss(1, f), aim(pan, 0.7 + 0.3 * sin(MT * PI * 0.25 + abs(f) * 2.0)), 0.06, 0.013, c * (0.45 + KICK * 0.5), 0.0);
  }
  for (int i = 0; i < 6; i++){
    float f = fan(i, 6);
    acc += beam(ro, rd, h, onTruss(0, f), aim(f * 0.3, 0.3), 0.18, 0.09, iC2 * (0.25 + BASS * 0.3), 0.0);
  }
  return acc;
}`;

// ── Mellow ──

const C_CANDLELIGHT = `
void setup(){
  ENV = 3; LEDK = -2; CYCB = 0.5; STW = 9.0; DECKZ = 9.0; WALLZ = 9.5; WALLX = 9.0; WALLY0 = 0.0; WALLY1 = 11.0;
  NTR = 1; TR[0] = vec4(0.0, 10.5, 4.0, 9.0); SPK = false;
  CAMT = vec3(0.0, 5.0, 5.0); CAMFOV = 48.0; CAMDRIFT = 0.6;
  float flick = 0.9 + 0.1 * vnoise(vec2(iTime * 3.0, 1.0));
  AMB = tung(0.55) * 0.12 * flick * (0.7 + LVL * 0.4);
  HAZEC = tung(0.5) * 0.012; RIMC = tung(0.6) * 0.8; HANDS = 0.08; CROWD = 0.85;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  float glow = 0.6 + LVL * 0.5;
  // Three strings of tungsten bulbs, low over the stage.
  acc += festoon(ro, rd, h, vec3(-8.5, 8.5, 2.0), vec3(8.5, 8.5, 3.0), 1.4, 22, tung(0.55) * 1.4 * glow);
  acc += festoon(ro, rd, h, vec3(-8.0, 9.0, 5.0), vec3(8.0, 9.0, 5.5), 1.6, 20, tung(0.5) * 1.2 * glow);
  acc += festoon(ro, rd, h, vec3(-7.5, 9.5, 8.0), vec3(7.5, 9.5, 8.0), 1.8, 18, tung(0.45) * 1.0 * glow);
  for (int i = 0; i < 4; i++){
    float f = fan(i, 4);
    acc += beam(ro, rd, h, onTruss(0, f), aim(f * 0.25 * SPR + sin(iTime * 0.1 + f) * 0.06, 0.2 + 0.05 * sin(iTime * 0.13 + f)), 0.14, 0.06, tung(0.6) * (0.4 + LVL * 0.3), 3.05);
  }
  acc += followspot(ro, rd, h, vec3(0.0, 13.0, -35.0), vec3(sin(iTime * 0.08) * 0.6, DECKY, 3.5), 1.1, tung(0.8) * 0.6);
  return acc;
}`;

const C_KINETIC_ORBS = `
void setup(){
  ENV = 0; LEDK = -1; NTR = 1; TR[0] = vec4(0.0, 14.0, 9.0, STW);
  AMB = mix(iC0, iC1, 0.5) * (0.025 + LVL * 0.025); HAZEC = mix(iC0, iC1, 0.5) * 0.009;
  RIMC = mix(iC0, iC1, 0.5) * 0.45; HANDS = 0.15; PHONES = 0.3; CAMDRIFT = 0.7; KEYC = tung(0.7) * 0.35;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  // Fifty orbs on winches, a slow tide lifting and lowering them; the music swells the light.
  acc += kinetic(ro, rd, h, vec3(0.0, 9.0, 4.5), vec2(STW * 0.95, 4.5), 10, 5, MT * PI * 0.0625, 1.6 + LVL * 0.5, iC0 * (0.6 + LVL * 0.5), iC1 * (0.6 + LVL * 0.5));
  for (int i = 0; i < 4; i++){
    float f = fan(i, 4);
    acc += beam(ro, rd, h, onTruss(0, f), aim(f * 0.35 * SPR + sin(iTime * 0.09 + f * 2.0) * 0.12, 0.35 + 0.1 * sin(iTime * 0.11 + f)), 0.15, 0.07, iC2 * (0.25 + LVL * 0.25), 0.0);
  }
  return acc;
}`;

const C_BOWL_SHELL = `
void setup(){
  ENV = 4; LEDK = -2; CYCB = 0.8; STW = 9.0; DECKZ = 10.5; WALLZ = 11.0; WALLX = 7.0; WALLY0 = 0.0; WALLY1 = 9.0;
  NTR = 0; SPK = true; STARN = 1.0; CLOUD = 0.3;
  SKYTOP = vec3(0.002, 0.004, 0.012); SKYHOR = vec3(0.015, 0.02, 0.04);
  for (int i = 0; i < 6; i++){
    float fi = float(i);
    SHELL[i] = ramp(fract(fi / 6.0 + iTime * 0.01)) * (0.35 + LVL * 0.35) * (0.6 + 0.4 * sin(iTime * 0.3 - fi * 0.6));
  }
  AMB = mix(iC0, iC1, 0.5) * (0.04 + LVL * 0.03); HAZEC = mix(iC0, iC1, 0.5) * 0.008;
  RIMC = mix(iC0, iC1, 0.5) * 0.5; HANDS = 0.1; PHONES = 0.3; CAMDRIFT = 0.7;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 4; i++){
    float f = fan(i, 4);
    acc += beam(ro, rd, h, vec3(f * 6.0, DECKY + 0.2, DECKZ - 1.0), aim(f * 0.3 * SPR + sin(iTime * 0.08 + f) * 0.1, 2.6 + 0.08 * sin(iTime * 0.1 + f)), 0.08, 0.02, ramp(0.5 + 0.5 * f) * (0.35 + LVL * 0.3), 0.0);
  }
  return acc;
}`;

const C_VELVET_THEATER = `
void setup(){
  ENV = 3; LEDK = -2; CYCB = 0.6; STW = 9.0; DECKZ = 9.0; WALLZ = 9.5; WALLX = 9.0; WALLY0 = 0.0; WALLY1 = 11.0;
  NTR = 1; TR[0] = vec4(0.0, 10.5, 3.0, 9.0); SPK = false;
  CAMT = vec3(0.0, 5.0, 5.0); CAMFOV = 48.0; CAMDRIFT = 0.5;
  AMB = tung(0.6) * (0.10 + LVL * 0.04); HAZEC = tung(0.5) * 0.008;
  RIMC = tung(0.7) * 0.7; HANDS = 0.0; CROWD = 0.9;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  // Footlights along the lip, a follow spot from the booth, and soft colour from the border.
  for (int i = 0; i < 16; i++) acc += bulb(ro, rd, h, vec3(fan(i, 16) * (STW - 0.6), DECKY + 0.08, 0.15), 0.06, tung(0.7) * (0.8 + LVL * 0.4));
  acc += followspot(ro, rd, h, vec3(0.0, 12.0, -32.0), vec3(sin(iTime * 0.07) * 0.8, DECKY, 3.5), 1.0, vec3(1.0, 0.95, 0.88) * (0.6 + LVL * 0.3));
  for (int i = 0; i < 4; i++){
    float f = fan(i, 4);
    acc += beam(ro, rd, h, onTruss(0, f), aim(f * 0.2 * SPR, 0.25 + 0.05 * sin(iTime * 0.1 + f)), 0.16, 0.07, mix(iC0, iC2, 0.5 + 0.5 * f) * (0.25 + LVL * 0.2), 0.0);
  }
  return acc;
}`;

const C_SLOW_DANCE = `
void setup(){
  ENV = 0; LEDK = -1; stdTruss(12.0, 2);
  MBALL = vec4(0.0, 11.0, 2.0, 0.45 + LVL * 0.3); KEYC = tung(0.8) * 0.3;
  AMB = iC0 * (0.025 + LVL * 0.02); HAZEC = iC0 * 0.009;
  RIMC = mix(iC0, iC1, 0.4) * 0.5; HANDS = 0.1; CAMDRIFT = 0.6;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  vec3 ball = MBALL.xyz;
  for (int i = 0; i < 2; i++){
    vec3 s = onTruss(0, float(i) * 2.0 - 1.0);
    acc += beam(ro, rd, h, s, normalize(ball - s), 0.04, 0.006, vec3(1.0, 0.95, 0.9) * 0.5, 0.0);
  }
  vec3 ts = ball - ro; float sd = length(ts);
  float a2 = max(2.0 - 2.0 * dot(rd, ts / sd), 0.0); float lr = 0.55 / sd;
  float sparkle = step(0.82, h21(floor(rd.xy * iResolution.y * 0.12) + floor(iTime * 4.0)));
  acc += vec3(0.8, 0.85, 1.0) * smoothstep(lr * lr, lr * lr * 0.8, a2) * (0.06 + sparkle);
  acc += vec3(0.8, 0.85, 1.0) * lr * lr * 0.4 / (a2 + lr * lr * 3.0);
  for (int i = 0; i < 4; i++){
    float f = fan(i, 4);
    acc += beam(ro, rd, h, onTruss(1, f), aim(f * 0.3 * SPR, 0.4 + 0.1 * sin(iTime * 0.1 + f)), 0.2, 0.09, iC0 * (0.25 + LVL * 0.25), 0.0);
  }
  return acc;
}`;

const C_SEA_OF_LIGHTS = `
void setup(){
  ENV = 0; LEDK = -1; stdTruss(12.5, 2);
  PHONES = 1.0; HANDS = 0.7; PHONEC = vec3(0.7, 0.8, 1.0);
  AMB = iC0 * (0.02 + LVL * 0.02); HAZEC = mix(iC0, iC1, 0.5) * 0.008;
  RIMC = iC1 * 0.35; CAMDRIFT = 0.7;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  // Six soft blue beams swaying like the crowd's lights below them.
  for (int i = 0; i < 6; i++){
    float f = fan(i, 6);
    acc += beam(ro, rd, h, onTruss(1, f), aim(f * 0.45 * SPR + sin(MT * PI * 0.0625 + f * 1.3) * 0.18, 0.75 + 0.1 * sin(MT * PI * 0.0625 + f)), 0.12, 0.04, iC0 * (0.3 + LVL * 0.35), 0.0);
  }
  return acc;
}`;

const C_GOBO_FOREST = `
void setup(){
  ENV = 0; LEDK = -1; stdTruss(12.0, 3);
  HAZE *= 1.35;
  AMB = mix(iC0, iC1, 0.4) * (0.05 + LVL * 0.04); HAZEC = mix(iC0, iC2, 0.5) * 0.01;
  RIMC = mix(iC0, iC1, 0.5) * 0.45; HANDS = 0.15; CAMDRIFT = 0.6;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  // Leaf breakup from overhead: light through a canopy, drifting like branches in a breeze.
  for (int j = 0; j < 2; j++){
    for (int i = 0; i < 5; i++){
      float f = fan(i, 5);
      vec3 c = (j == 0 && mod(float(i), 2.0) > 0.5) ? iC1 * 0.5 : iC0 * (0.7 + LVL * 0.5);   // one colour; amber only as an accent
      acc += beam(ro, rd, h, onTruss(j * 2, f), aim(f * 0.3 * SPR + sin(iTime * 0.07 + f * 2.0 + float(j)) * 0.12, 0.3 + 0.12 * sin(iTime * 0.09 + f)), 0.25, 0.1, c, 3.04 + float(i) * 0.002);
    }
  }
  return acc;
}`;

const C_UNPLUGGED = `
void setup(){
  ENV = 2; LEDK = -1; STW = 7.0; DECKY = 0.8; DECKZ = 7.0; WALLZ = 7.5; WALLX = 7.0; WALLY0 = 0.8; WALLY1 = 7.0;
  NTR = 1; TR[0] = vec4(0.0, 7.0, 6.5, 7.5); SPK = false;
  CAMT = vec3(0.0, 3.2, 4.0); CAMFOV = 42.0; CAMDRIFT = 0.5; KEYC = tung(0.7) * 0.45;
  AMB = tung(0.55) * (0.08 + LVL * 0.04); HAZEC = tung(0.5) * 0.012;
  RIMC = tung(0.6) * 0.8; HANDS = 0.05; CROWD = 0.8;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  // Backlight: five warm shafts from behind the players, angled down through the haze toward us.
  for (int i = 0; i < 5; i++){
    float f = fan(i, 5);
    acc += beam(ro, rd, h, onTruss(0, f), aim(f * 0.15 * SPR + sin(iTime * 0.06 + f) * 0.04, 1.05 + 0.04 * sin(iTime * 0.08 + f)), 0.12, 0.045, tung(0.65) * (0.45 + LVL * 0.4), 0.0);
  }
  acc += festoon(ro, rd, h, vec3(-6.5, 6.0, 1.5), vec3(6.5, 6.0, 3.0), 0.9, 16, tung(0.5) * (0.9 + LVL * 0.4));
  acc += beam(ro, rd, h, vec3(-6.0, 6.5, -1.0), normalize(vec3(5.5, -5.5, 4.0)), 0.15, 0.06, iC2 * (0.2 + LVL * 0.15), 0.0);
  return acc;
}`;

const C_STARLIGHT = `
// Candle Vigil: a choir on risers holding candles, a soloist in the follow spot, cool backlight.
void setup(){
  ENV = 0; LEDK = -2; CYCB = 0.55; stdTruss(12.0, 2); GMF = 0.7;
  PHONES = 0.6; PHONEC = tung(0.5); HANDS = 0.15; KEYC = tung(0.7) * 0.1;
  AMB = tung(0.5) * (0.05 + LVL * 0.03); HAZEC = mix(tung(0.5), iC1, 0.4) * 0.01;
  RIMC = mix(tung(0.6), iC1, 0.3) * 0.5; CAMDRIFT = 0.6;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  for (int r = 0; r < 3; r++){
    float fi = float(r);
    for (int i = 0; i < 12; i++){
      vec3 p = vec3((float(i) - 5.5) * 0.62 + 0.31 * fi, DECKY + fi * 0.8 + 1.25, 6.3 + fi * 0.9 - 0.2);
      acc += bulb(ro, rd, h, p, 0.06, tung(0.6) * 2.5 * (0.85 + 0.15 * vnoise(vec2(iTime * 3.0, float(i + r * 12)))));
    }
  }
  for (int i = 0; i < 4; i++){
    float f = fan(i, 4);
    acc += beam(ro, rd, h, onTruss(1, f), aim(f * 0.2 * SPR, 0.55 + 0.05 * sin(MT * PI * 0.0625 + f)), 0.15, 0.06, iC1 * (0.35 + LVL * 0.3), 0.0);
  }
  acc += followspot(ro, rd, h, vec3(0.0, 16.0, -40.0), vec3(0.0, DECKY, 2.6), 1.0, tung(0.85) * 0.6);
  return acc;
}`;

const C_SUNRISE = `
void setup(){
  ENV = 1; LEDK = 3; LEDB = 0.5; STW = 11.0; WALLX = 12.0; stdTruss(14.5, 2); ROOF = false; CAMT = vec3(0.0, 8.0, 6.0);
  NTW = 2; TW[0] = vec4(-STW - 1.5, 1.2, 0.0, 0.0); TW[1] = vec4(STW + 1.5, 1.2, 0.0, 0.0); TOWH = 15.5;
  float dawn = 0.6 + LVL * 0.35;
  SKYHOR = (iC0 * 0.35 + iC1 * 0.12) * dawn * 1.4; SKYTOP = mix(vec3(0.02, 0.03, 0.08), iC2 * 0.18, 0.5) * dawn; STARN = 0.15; CLOUD = 1.0;
  AMB = iC0 * (0.07 + LVL * 0.04); HAZEC = mix(iC0, iC1, 0.4) * 0.012;
  RIMC = mix(iC0, iC1, 0.3) * 0.7; HANDS = 0.3; CAMDRIFT = 0.7;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 8; i++){
    float f = fan(i, 8);
    acc += beam(ro, rd, h, onTruss(1, f), aim(f * 0.55 * SPR + sin(iTime * 0.07 + f) * 0.12, 1.35 + 0.15 * sin(iTime * 0.09 + f * 2.0)), 0.1, 0.03, mix(iC0, iC1, 0.5 + 0.5 * f) * (0.3 + LVL * 0.3), 0.0);
  }
  return acc;
}`;

export const RIGS_GENTLE: Record<string, string> = {
  RIG_MID_FESTIVAL_DUSK: M_FESTIVAL_DUSK,
  RIG_MID_POP_TOUR: M_POP_TOUR,
  RIG_MID_GOSPEL_LIFT: M_GOSPEL_LIFT,
  RIG_MID_VELVET_RNB: M_VELVET_RNB,
  RIG_MID_PIXEL_BATTENS: M_PIXEL_BATTENS,
  RIG_MID_INDIE_ARENA: M_INDIE_ARENA,
  RIG_MID_WORSHIP_ARENA: M_WORSHIP_ARENA,
  RIG_MID_COUNTRY_NIGHT: M_COUNTRY_NIGHT,
  RIG_MID_KINETIC: M_KINETIC,
  RIG_MID_SYNTHWAVE: M_SYNTHWAVE,
  RIG_MELLOW_CANDLELIGHT: C_CANDLELIGHT,
  RIG_MELLOW_KINETIC_ORBS: C_KINETIC_ORBS,
  RIG_MELLOW_BOWL_SHELL: C_BOWL_SHELL,
  RIG_MELLOW_VELVET_THEATER: C_VELVET_THEATER,
  RIG_MELLOW_SLOW_DANCE: C_SLOW_DANCE,
  RIG_MELLOW_SEA_OF_LIGHTS: C_SEA_OF_LIGHTS,
  RIG_MELLOW_GOBO_FOREST: C_GOBO_FOREST,
  RIG_MELLOW_UNPLUGGED: C_UNPLUGGED,
  RIG_MELLOW_STARLIGHT: C_STARLIGHT,
  RIG_MELLOW_SUNRISE: C_SUNRISE,
};
