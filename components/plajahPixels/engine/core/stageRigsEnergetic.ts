// stageRigsEnergetic — the laser shows and the high-energy rigs (RIG_LASER_*, RIG_HIGH_*).
// Bodies for generatorsStage.ts: each defines setup() and rig(); see the library for the vocabulary.
//
// Programming conventions (the same an LD would use):
//   kick   → punches, chases, jumps, camera jolt        snare → blinders, strobe hits
//   hats   → 16th-note strobe sparkle, beam breakup      drop  → everything at once, pyro, CO2
//   MT     → movement: sweeps in bars, ballyhoo per beat, colour changes per bar

const L_CATHEDRAL = `
void setup(){
  ENV = 0; LEDK = 11; LEDB = 0.3; stdTruss(12.0, 3); CAMT = vec3(0.0, 8.5, 6.0);
  NTW = 2; TW[0] = vec4(-STW - 1.6, 10.0, 0.0, 0.0); TW[1] = vec4(STW + 1.6, 10.0, 0.0, 0.0); TOWH = 14.0;
  vec3 bar = cyc(barN() * 0.333);
  AMB = bar * (0.04 + KICK * 0.07);
  HAZEC = mix(iC0, iC1, 0.5) * (0.010 + LVL * 0.008);
  RIMC = mix(iC0, iC2, 0.5) * (0.4 + KICK * 0.5);
  HANDS = 0.55; CAMSWAY = 0.35;
  FLASH = SNARE * 0.3 * step(0.5, NRG);
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  // The vault: six vertical laser fans from the upstage truss arc over the crowd like ribs.
  for (int i = 0; i < 6; i++){
    float f = fan(i, 6);
    vec3 s = onTruss(2, f);
    float on = mix(1.0, chase(float(i), 3.0, 0.5), 0.55);
    vec3 c = (DROP > 0.3 ? iC2 : lookC(1.0)) * (0.7 + KICK * 0.8) * on;
    float pan = -f * 0.35 + sin(MT * PI * 0.25 + float(i)) * 0.12 * SPR;
    float tilt = 1.72 + 0.12 * sin(MT * PI * 0.125 + f * 2.0);
    acc += laserFan(ro, rd, h, s, pan, tilt, 0.7 * SPR, PI * 0.5 + f * 0.4 + sin(MT * PI * 0.25) * 0.25, 7, c);
  }
  // The spire: eight sharpies meeting at a point over the room.
  vec3 apex = vec3(sin(MT * PI * 0.125) * 4.0, 15.5, -5.0);
  for (int i = 0; i < 8; i++){
    float f = fan(i, 8);
    vec3 s = onTruss(1, f);
    vec3 d = normalize(apex + vec3(f * 8.0 * (SPR - 0.4), 0.0, 0.0) - s);
    acc += beam(ro, rd, h, s, d, 0.05, 0.010, vec3(1.0, 0.96, 0.9) * (0.12 + SNARE * 0.9), 0.0);
  }
  for (int i = 0; i < 4; i++){
    vec3 s = onTruss(0, fan(i, 4) * 0.8) + vec3(0.0, 0.3, -0.3);
    acc += panel(ro, rd, h, s, vec2(0.35, 0.09), vec3(1.0, 0.98, 0.95) * SNARE * 3.5 * step(0.5, NRG));
  }
  return acc;
}`;

const L_LIQUID_SKY = `
void setup(){
  ENV = 1; LEDK = 7; LEDB = 0.4; STW = 11.0; WALLX = 13.0; WALLY1 = 11.0;
  stdTruss(14.5, 2);
  SKYTOP = vec3(0.002, 0.004, 0.012); SKYHOR = vec3(0.02, 0.03, 0.05); STARN = 1.0; CLOUD = 0.6;
  AMB = mix(iC0, iC1, 0.5) * (0.03 + BASS * 0.04);
  HAZEC = mix(iC0, iC1, 0.6) * (0.010 + LVL * 0.01);
  RIMC = iC0 * (0.5 + KICK * 0.6); HANDS = 0.6; CAMSWAY = 0.25;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  // The liquid sky: a scanned sheet over the crowd, its swell pushed by the bass.
  vec3 src = vec3(0.0, 9.0, 1.0);
  float amp = 0.25 + BASS * 0.9 + KICK * 0.3;
  acc += laserSheet(ro, rd, h, src, 8.0, amp, 0.22, 1.57, mix(iC0, iC2, step(0.3, DROP)) * (0.8 + LVL * 0.8));
  acc += laserSheet(ro, rd, h, src + vec3(0.0, 1.5, 0.0), 10.2, amp * 0.6, 0.15, 1.0, iC1 * 0.45 * (0.3 + MIDS));
  acc += bulb(ro, rd, h, src, 0.08, iC0 * 2.0);
  for (int i = 0; i < 2; i++){
    float sx = i == 0 ? -1.0 : 1.0;
    float pan = -sx * 0.25 + sin(MT * PI * 0.5 + sx) * 0.35 * SPR;
    acc += laserFan(ro, rd, h, vec3(sx * 7.0, DECKY + 0.4, 0.6), pan, 1.75 + 0.12 * sin(MT * PI * 0.25), 0.7 * SPR, 0.0, 9, iC2 * (0.4 + KICK * 1.2));
  }
  for (int i = 0; i < 6; i++){
    float f = fan(i, 6);
    acc += beam(ro, rd, h, onTruss(0, f), aim(f * 0.5 * SPR, 0.35 + 0.25 * sin(MT * PI * 0.25 + f * 1.7)), 0.18, 0.09, mix(iC1, iC2, 0.5) * 0.8, 0.0);
  }
  return acc;
}`;

const L_TUNNEL = `
void setup(){
  ENV = 2; LEDK = 1; STW = 8.0; DECKZ = 9.0; WALLZ = 9.5; WALLX = 8.0; WALLY0 = 1.8; WALLY1 = 7.5; LEDB = 0.5; GMF = 0.25;
  NTR = 1; TR[0] = vec4(0.0, 8.2, 2.0, 9.0); SPK = false;
  CAMT = vec3(0.0, 4.5, 6.0); CAMFOV = 50.0; CAMSWAY = 0.6;
  AMB = iC0 * (0.03 + KICK * 0.08);
  HAZEC = mix(iC0, iC1, 0.5) * (0.013 + LVL * 0.01);
  RIMC = mix(iC0, iC1, 0.5) * (0.5 + KICK * 0.7);
  FLASH = KICK * 0.22 * step(0.6, NRG) + HAT * 0.06;
  HANDS = 0.5;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  // A rotating cone of beams fired straight down the room: you stand inside the tunnel.
  vec3 s = vec3(0.0, 5.0, 7.0);
  vec3 axis = normalize(vec3(sin(MT * PI * 0.125) * 0.15, -0.05, -1.0));
  float ang = (0.10 + 0.06 * SPR) * (1.0 + BASS * 0.35 + KICK * 0.25);
  acc += laserCone(ro, rd, h, s, axis, ang, MT * 0.5, 14, lookC(2.0) * (0.7 + KICK * 0.8));
  acc += laserCone(ro, rd, h, s, axis, ang * 0.55, -MT * 0.75, 10, iC2 * (0.2 + DROP * 0.9 + MIDS * 0.4));
  for (int i = 0; i < 6; i++){
    float on = KICK * step(0.55, NRG) + HAT * 0.4 * chase(float(i), 6.0, 4.0);
    acc += panel(ro, rd, h, onTruss(0, fan(i, 6) * 0.85) + vec3(0.0, 0.25, -0.3), vec2(0.32, 0.08), vec3(1.0) * on * 3.5);
  }
  return acc;
}`;

const L_CROSSFIRE = `
void setup(){
  ENV = 0; LEDK = 4; LEDB = 0.45; stdTruss(12.0, 3);
  NTW = 2; TW[0] = vec4(-STW - 3.0, 2.0, 0.0, 0.0); TW[1] = vec4(STW + 3.0, 2.0, 0.0, 0.0); TOWH = 14.0; SPK = false;
  AMB = mix(iC0, iC1, step(0.5, fract(MT / 8.0))) * (0.03 + KICK * 0.05) + tung(DROP) * 0.3;
  HAZEC = mix(iC0, iC1, 0.5) * 0.011 + tung(DROP) * 0.02;
  RIMC = mix(iC0, iC2, 0.4) * (0.5 + KICK * 0.5) + tung(DROP);
  FLASH = DROP * 0.3; HANDS = 0.5; CAMSWAY = 0.3;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  // Three laser heads up each tower, fanning across the room so the beams cross over the crowd.
  for (int s = 0; s < 2; s++){
    float sx = s == 0 ? -1.0 : 1.0;
    for (int k = 0; k < 3; k++){
      float fk = float(k);
      vec3 p = vec3(sx * (STW + 3.0) - sx * 0.35, 4.0 + fk * 4.0, 2.0);
      float pan = -sx * (0.9 + 0.3 * sin(MT * PI * 0.5 + fk * 1.3) * SPR);
      float tilt = 1.62 + 0.10 * sin(MT * PI * 0.25 + fk + sx);
      vec3 c = (k == 1 ? iC1 : iC0) * (0.45 + 0.9 * chase(fk + float(s) * 1.5, 3.0, 1.0) + KICK * 0.4);
      acc += laserFan(ro, rd, h, p, pan, tilt, 0.35 * SPR, 0.0, 5, c);
    }
  }
  // Blinders: the drop lands like a flashbulb, then the filaments glow down through amber.
  for (int i = 0; i < 4; i++) acc += blinder(ro, rd, h, onTruss(0, fan(i, 4) * 0.75) + vec3(0.0, 0.0, -0.35), DROP * 1.1 + SNARE * 0.25 * step(0.7, NRG));
  for (int i = 0; i < 6; i++){
    float f = fan(i, 6);
    acc += beam(ro, rd, h, onTruss(2, f), aim(-f * 0.25 * SPR, 1.05 + 0.1 * sin(MT * PI * 0.5 + f)), 0.07, 0.015, iC2 * (0.25 + KICK * 0.5), 0.0);
  }
  return acc;
}`;

const L_MAINSTAGE = `
void setup(){
  ENV = 1; LEDK = 2; STW = 13.0; WALLX = 15.0; WALLY0 = 2.2; WALLY1 = 12.5; WALLZ = 12.0; DECKZ = 11.5; LEDB = 1.0;
  stdTruss(15.5, 2);
  SKYTOP = vec3(0.002, 0.003, 0.01); SKYHOR = vec3(0.025, 0.02, 0.04); STARN = 0.7; CLOUD = 0.8;
  float fire = max(DROP, KICK * step(0.75, NRG));
  AMB = mix(iC0, iC1, 0.5) * 0.04 + vec3(1.0, 0.45, 0.1) * fire * 0.25;
  HAZEC = mix(iC0, iC2, 0.4) * 0.011 + vec3(1.0, 0.4, 0.1) * fire * 0.02;
  RIMC = mix(iC0, iC1, 0.5) * (0.6 + KICK * 0.6) + vec3(1.0, 0.5, 0.15) * fire;
  FLASH = SNARE * 0.22 * step(0.6, NRG); HANDS = 0.7; CAMSWAY = 0.35;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  float fire = max(DROP, KICK * step(0.75, NRG));
  // Five laser fans along the lip, up and out over the field; vertical fans every other 8 bars.
  for (int i = 0; i < 5; i++){
    float f = fan(i, 5);
    float pan = f * 0.4 + sin(MT * PI * 0.5 + f * 2.0) * 0.25 * SPR;
    vec3 c = (fract(MT / 32.0) > 0.5 ? iC2 : lookC(1.0)) * (0.5 + KICK);   // blue only in the vertical-fan phrase
    acc += laserFan(ro, rd, h, vec3(f * 10.0, DECKY + 0.3, 1.0), pan, 2.1 + 0.15 * sin(MT * PI * 0.25 + f), 0.55 * SPR, PI * 0.5 * step(0.5, fract(MT / 32.0)), 7, c);
  }
  // Twelve sharpies on the roof: a new position on every beat.
  for (int i = 0; i < 12; i++){
    float pan = (stepRand(float(i), 3.0, 0.5) - 0.5) * 1.6 * SPR, tilt = 0.25 + stepRand(float(i), 7.0, 0.5) * 0.8;
    acc += beam(ro, rd, h, onTruss(0, fan(i, 12)), aim(pan, tilt), 0.05, 0.011, mix(vec3(1.0), iC1, 0.3) * (0.5 + KICK * 1.2), 0.0);
  }
  for (int i = 0; i < 6; i++) acc += flame(ro, rd, h, vec3(fan(i, 6) * 11.0, DECKY, 0.4), fire * (5.0 + h21(vec2(float(i), BEATN)) * 2.0), float(i) * 3.1);
  for (int i = 0; i < 4; i++){ float f = fan(i, 4); acc += co2(ro, rd, h, vec3(f * 8.0, DECKY, 0.8), DROP, f * 0.3); }
  return acc;
}`;

const L_GRID = `
void setup(){
  ENV = 2; LEDK = 4; STW = 8.0; DECKZ = 9.0; WALLZ = 9.5; WALLX = 8.0; WALLY0 = 1.8; WALLY1 = 7.5; LEDB = 0.9; GMF = 0.25;
  NTR = 1; TR[0] = vec4(0.0, 8.2, 2.0, 9.0); SPK = false;
  CAMT = vec3(0.0, 4.5, 5.0); CAMFOV = 50.0;
  AMB = iC0 * (0.03 + KICK * 0.06); HAZEC = iC0 * 0.013; RIMC = iC0 * (0.5 + KICK * 0.6);
  FLASH = HAT * 0.1 * step(0.6, NRG); CAMSWAY = 0.5; HANDS = 0.45;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  // A horizontal sheet of lines from the side wall and a vertical curtain from the truss: a grid you stand in.
  acc += laserFan(ro, rd, h, vec3(0.0, 3.6, DECKZ - 0.5), 0.0, 1.57 + 0.04 * sin(MT * PI * 0.25), 1.1 * SPR, 0.0, 14, iC0 * (0.55 + KICK * 0.8));
  acc += laserFan(ro, rd, h, vec3(0.0, 8.0, 3.0), sin(MT * PI * 0.25) * 0.5 * SPR, 1.0, 1.2 * SPR, PI * 0.5, 12, iC1 * (0.2 + SNARE * 1.0) * step(0.5, NRG));
  for (int i = 0; i < 6; i++){
    float f = fan(i, 6);
    acc += beam(ro, rd, h, vec3(f * 6.5, DECKY + 0.2, 8.5), aim(f * 0.3 + sin(MT * PI * 0.25 + f * 3.0) * 0.3 * SPR, 2.4 + 0.2 * sin(MT * PI * 0.5 + f)), 0.06, 0.014, iC0 * 0.6 * (0.4 + KICK * 1.2), 0.0);
  }
  for (int i = 0; i < 4; i++) acc += panel(ro, rd, h, onTruss(0, fan(i, 4) * 0.8) + vec3(0.0, 0.25, -0.3), vec2(0.32, 0.08), vec3(1.0) * HAT * 2.5 * step(0.6, NRG) * chase(float(i), 4.0, 4.0));
  return acc;
}`;

const L_HALO = `
void setup(){
  ENV = 0; LEDK = -1; NTR = 2; TR[0] = vec4(0.0, 12.5, 9.5, STW); TR[1] = vec4(0.0, 12.8, 4.5, 8.0);
  AMB = cyc(MT / 16.0) * (0.04 + KICK * 0.05);
  HAZEC = mix(iC0, iC1, 0.5) * 0.011; RIMC = mix(iC0, iC1, 0.5) * (0.5 + KICK * 0.5); HANDS = 0.5; CAMSWAY = 0.25;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  vec3 C = vec3(0.0, 12.2, 4.5); float R = 7.5;
  // A crown of lasers around a pixel ring: it opens on the kick and turns a quarter every bar.
  float open = 0.35 + 0.25 * SPR + KICK * 0.15 + DROP * 0.2;
  for (int i = 0; i < 12; i++){
    float a = float(i) / 12.0 * TAU + MT * PI * 0.125;
    vec3 ov = vec3(cos(a), 0.0, sin(a));
    vec3 s = C + ov * R;
    vec3 c = cyc(float(i) / 12.0 + MT / 16.0) * (0.8 + KICK * 0.8) * (0.55 + 0.45 * chase(float(i), 4.0, 1.0));
    acc += laser(ro, rd, h, s, normalize(vec3(0.0, -1.0, -0.35) + ov * tan(open)), c);
    acc += laser(ro, rd, h, s, normalize(vec3(0.0, -1.0, -0.2) - ov * tan(open * 0.6)), c * 0.5);
  }
  for (int i = 0; i < 36; i++){
    float a = float(i) / 36.0 * TAU;
    acc += bulb(ro, rd, h, C + vec3(cos(a) * R, 0.15, sin(a) * R), 0.08, mix(iC0, iC1, step(0.5, fract(float(i) / 36.0 + MT / 16.0))) * (0.8 + KICK));
  }
  for (int i = 0; i < 6; i++){
    float f = fan(i, 6);
    acc += beam(ro, rd, h, onTruss(0, f), aim(f * 0.3 + sin(MT * PI * 0.25 + f) * 0.2 * SPR, 0.6), 0.1, 0.03, iC2 * (0.3 + MIDS * 0.7), 1.2);
  }
  return acc;
}`;

const L_SPECTRUM = `
// Mirrorball Blaze: lasers fed into a ball over the crowd, bounced back out as rotating cones.
void setup(){
  ENV = 0; LEDK = -1; stdTruss(12.5, 2); GMF = 0.25;
  MBALL = vec4(0.0, 10.8, -2.0, 0.5 + KICK * 0.3);
  AMB = lookC(2.0) * (0.03 + KICK * 0.05); HAZEC = lookC(2.0) * 0.011;
  RIMC = lookC(2.0) * (0.5 + KICK * 0.5); HANDS = 0.6; CAMSWAY = 0.25;
  FLASH = SNARE * 0.2 * step(0.6, NRG);
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  vec3 ball = MBALL.xyz;
  for (int i = 0; i < 4; i++){
    float x = (i < 2 ? -1.0 : 1.0) * (mod(float(i), 2.0) < 0.5 ? 6.0 : 3.0);
    vec3 s = vec3(x, DECKY + 0.3, 0.5);
    acc += laser(ro, rd, h, s, normalize(ball - s), iC0 * (0.6 + KICK * 0.6));
  }
  vec3 ts = ball - ro; float sd = length(ts);
  float a2 = max(2.0 - 2.0 * dot(rd, ts / sd), 0.0); float lr = 0.5 / sd;
  float sparkle = step(0.8, h21(floor(rd.xy * iResolution.y * 0.15) + floor(iTime * 6.0)));
  acc += vec3(0.8, 0.85, 1.0) * smoothstep(lr * lr, lr * lr * 0.8, a2) * (0.1 + sparkle * (0.8 + KICK));
  vec3 axis = normalize(vec3(0.0, -0.35, -1.0));
  acc += laserCone(ro, rd, h, ball, axis, 0.55 * SPR, MT * 0.25, 12, lookC(2.0) * (0.5 + KICK * 0.9));
  acc += laserCone(ro, rd, h, ball, axis, 0.3 * SPR, -MT * 0.5, 8, iC2 * (SNARE * 0.8 + DROP));
  for (int i = 0; i < 4; i++) acc += panel(ro, rd, h, onTruss(0, fan(i, 4) * 0.8) + vec3(0.0, 0.3, -0.3), vec2(0.35, 0.09), vec3(1.0) * SNARE * 3.0 * step(0.6, NRG));
  return acc;
}`;

const L_AURORA = `
void setup(){
  ENV = 5; LEDK = 9; LEDB = 0.3; STW = 12.0; WALLX = 14.0; WALLY1 = 11.0; stdTruss(15.0, 2);
  SKYTOP = vec3(0.001, 0.004, 0.01); SKYHOR = vec3(0.01, 0.03, 0.04); STARN = 1.0; CLOUD = 0.3; PHONES = 0.25;
  AMB = iC0 * (0.03 + LVL * 0.04); HAZEC = mix(iC0, iC1, 0.5) * 0.011; RIMC = iC0 * 0.6; HANDS = 0.5; CAMDRIFT = 1.4;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  // Aurora sheets: long slow folds rather than ripples.
  acc += laserSheet(ro, rd, h, vec3(0.0, 10.0, 2.0), 9.0, 0.8 + BASS * 0.8, 0.09, 0.4, iC0 * (1.1 + LVL * 0.6));
  acc += laserSheet(ro, rd, h, vec3(0.0, 11.0, 2.0), 11.5, 1.2 + MIDS * 0.6, 0.06, 0.3, iC1 * (0.55 + MIDS * 0.5));
  for (int i = 0; i < 2; i++){
    float sx = i == 0 ? -1.0 : 1.0;
    acc += laserFan(ro, rd, h, vec3(sx * (STW + 4.0), 12.0, 1.5), -sx * 0.6 + sin(MT * PI * 0.125) * 0.25 * SPR, 1.9, 0.6 * SPR, 0.0, 9, iC2 * (0.3 + KICK * 0.6));
  }
  for (int i = 0; i < 8; i++){
    float f = fan(i, 8);
    acc += beam(ro, rd, h, onTruss(1, f), aim(f * 0.6 * SPR, 0.5 + 0.3 * sin(MT * PI * 0.125 + f * 1.7)), 0.15, 0.06, mix(iC0, iC1, 0.5) * 0.55, 0.0);
  }
  return acc;
}`;

const L_STROBE_STORM = `
void setup(){
  ENV = 0; LEDK = -1; stdTruss(12.0, 3);
  NTW = 2; TW[0] = vec4(-STW - 1.6, 10.0, 0.0, 0.0); TW[1] = vec4(STW + 1.6, 10.0, 0.0, 0.0); TOWH = 14.0;
  float st = step(0.5, h21(vec2(floor(iTime * 16.0), 2.0))) * HAT;
  AMB = vec3(0.015) + cyc(BEATN * 0.25) * KICK * 0.08 + tung(DROP) * 0.3;
  FLASH = st * 0.3 * step(0.5, NRG) + KICK * 0.15 * step(0.5, NRG) + DROP * 0.3;
  HAZEC = vec3(0.01) + cyc(BEATN * 0.25) * 0.008;
  RIMC = vec3(0.7) * (0.3 + KICK + FLASH); HANDS = 0.7; CAMSWAY = 0.8;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  // Chopped laser fans: beam breakup at 12 Hz, a new look on every beat.
  for (int i = 0; i < 4; i++){
    float f = fan(i, 4);
    float chop = mix(1.0, step(0.35, h21(vec2(floor(iTime * 12.0), float(i)))), step(0.6, NRG));   // solid in the verses
    vec3 c = cyc(f * 0.3 + BEATN * 0.25) * chop * (0.6 + KICK * 0.9);
    acc += laserFan(ro, rd, h, onTruss(2, f * 0.8), f * 0.5 + (stepRand(float(i), 1.0, 0.15) - 0.5) * 1.2 * SPR, 1.7 + stepRand(float(i), 5.0, 0.15) * 0.5, 0.9 * SPR, stepRand(float(i), 9.0, 0.1) * PI, 8, c);
  }
  for (int i = 0; i < 10; i++){
    acc += beam(ro, rd, h, onTruss(1, fan(i, 10)), aim((stepRand(float(i), 2.0, 0.3) - 0.5) * 2.0 * SPR, 0.2 + stepRand(float(i), 4.0, 0.3) * 1.3), 0.05, 0.01, vec3(1.0, 0.96, 0.9) * (0.08 + KICK * 1.5), 0.0);
  }
  for (int i = 0; i < 8; i++){
    float on = step(0.55, h21(vec2(floor(iTime * 16.0), float(i) + 20.0))) * HAT * 2.0 + KICK * 0.7;
    acc += panel(ro, rd, h, onTruss(0, fan(i, 8)) + vec3(0.0, 0.3, -0.3), vec2(0.35, 0.09), vec3(1.0) * on * 3.0);
  }
  for (int i = 0; i < 4; i++) acc += blinder(ro, rd, h, onTruss(0, fan(i, 4) * 0.6) + vec3(0.0, -0.4, -0.35), DROP);
  for (int i = 0; i < 2; i++) acc += co2(ro, rd, h, vec3((float(i) * 2.0 - 1.0) * 7.0, DECKY, 0.8), DROP, (float(i) * 2.0 - 1.0) * 0.25);
  return acc;
}`;

// ── High energy ──

const H_ARENA_ROCK = `
void setup(){
  ENV = 0; LEDK = -1; stdTruss(11.5, 3);
  NTW = 2; TW[0] = vec4(-STW - 1.0, DECKZ - 1.0, 0.0, 0.0); TW[1] = vec4(STW + 1.0, DECKZ - 1.0, 0.0, 0.0); TOWH = 12.5;
  AMB = iC0 * (0.05 + KICK * 0.07) + tung(SNARE * 0.8) * 0.12;
  HAZEC = iC0 * 0.012 + vec3(0.006, 0.004, 0.002);
  RIMC = mix(iC0, vec3(1.0, 0.7, 0.4), 0.4) * (0.6 + KICK * 0.6 + SNARE * 0.4);
  FLASH = DROP * 0.25; HANDS = 0.6; CAMSWAY = 0.5; KEYC = tung(0.75) * 0.5;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  // ACL fans: four groups of four tight white beams from the upstage deck, punched by the kick.
  for (int g = 0; g < 4; g++){
    float fg = fan(g, 4);
    vec3 base = vec3(fg * 7.5, DECKY + 0.3, DECKZ - 1.0);
    float on = mix(0.3, 1.0, chase(float(g), 2.0, 1.0)) * (0.45 + KICK * 1.4);
    for (int k = 0; k < 4; k++){
      float fk = fan(k, 4);
      acc += beam(ro, rd, h, base + vec3(fk * 0.4, 0.0, 0.0), aim(fg * 0.25 + fk * 0.22 * SPR, 2.55 - abs(fk) * 0.1), 0.05, 0.006, vec3(1.0, 0.93, 0.8) * on * 0.8, 0.0);
    }
  }
  for (int i = 0; i < 8; i++){
    float f = fan(i, 8);
    acc += beam(ro, rd, h, onTruss(1, f), aim(f * 0.4 * SPR, 0.45 + 0.2 * sin(MT * PI * 0.25 + f * 1.7)), 0.12, 0.05, iC0 * (0.6 + KICK * 0.5), 1.3);
  }
  for (int i = 0; i < 6; i++) acc += blinder(ro, rd, h, onTruss(0, fan(i, 6) * 0.8) + vec3(0.0, 0.05, -0.35), DROP + SNARE * 0.6 * step(0.6, NRG));
  for (int s = 0; s < 2; s++){
    float sx = s == 0 ? -1.0 : 1.0;
    acc += beam(ro, rd, h, vec3(sx * (STW + 1.0), 9.0, DECKZ - 1.0), aim(-sx * 1.2, 1.1 + 0.1 * sin(MT * PI * 0.5)), 0.12, 0.04, iC2 * (0.4 + MIDS * 0.8), 0.0);
  }
  return acc;
}`;

const H_EDM_DROP = `
void setup(){
  ENV = 0; LEDK = 1; WALLX = 14.0; LEDB = 1.3; GMF = 0.2; stdTruss(12.5, 2);
  vec3 bar = cyc(barN() * 0.333);
  AMB = bar * (0.04 + KICK * 0.07); HAZEC = bar * 0.011; RIMC = cyc(MT / 16.0) * (0.5 + KICK * 0.7);
  FLASH = DROP * 0.4 + KICK * 0.1 * step(0.7, NRG); HANDS = 0.5 + DROP * 0.4; CAMSWAY = 0.6;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  // Build: sixteen sharpies pinched into one point over the crowd. Drop: they blow open.
  float open = clamp(DROP * 1.4, 0.0, 1.0);
  vec3 focus = vec3(sin(MT * PI * 0.125) * 2.0, 11.0, -6.0);
  for (int j = 0; j < 2; j++){
    for (int i = 0; i < 8; i++){
      float f = fan(i, 8);
      vec3 s = onTruss(j, f);
      vec3 wide = aim(f * 1.1 * SPR + sin(MT * PI * 0.5 + float(j) * PI) * 0.3, 0.6 + float(j) * 0.5);
      vec3 d = normalize(mix(normalize(focus - s), wide, open));
      acc += beam(ro, rd, h, s, d, 0.05, 0.01, cyc(f * 0.2 + float(j) * 0.5 + barN() * 0.333) * (0.45 + KICK * 1.3), 0.0);
    }
  }
  for (int i = 0; i < 6; i++) acc += panel(ro, rd, h, onTruss(0, fan(i, 6) * 0.9) + vec3(0.0, 0.3, -0.3), vec2(0.35, 0.09), vec3(1.0) * (DROP * 2.0 + HAT * step(0.75, NRG)) * 2.0);
  for (int i = 0; i < 4; i++){ float f = fan(i, 4); acc += co2(ro, rd, h, vec3(f * 7.0, DECKY, 0.8), DROP, f * 0.25); }
  return acc;
}`;

const H_PYRO = `
void setup(){
  ENV = 1; LEDK = 7; LEDB = 0.22; STW = 12.0; WALLX = 13.0; stdTruss(14.5, 2);
  STARN = 0.6; CLOUD = 0.9;
  float fire = max(DROP, KICK * step(0.55, NRG) * step(mod(BEATN, 4.0), 0.5));   // downbeats only; all heads on the drop
  AMB = vec3(1.0, 0.45, 0.12) * fire * 0.3 + iC0 * 0.04;
  HAZEC = vec3(1.0, 0.4, 0.1) * 0.007 * (1.0 + fire * 3.0) + iC1 * 0.005;
  RIMC = vec3(1.0, 0.55, 0.2) * (0.4 + fire * 1.4); HANDS = 0.65; CAMSWAY = 0.4;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  float fire = max(DROP, KICK * step(0.55, NRG) * step(mod(BEATN, 4.0), 0.5));   // downbeats only; all heads on the drop
  // Eight flame heads on the lip: odd/even on alternating kicks, all of them on the drop.
  for (int i = 0; i < 8; i++){
    float pat = DROP > 0.3 ? 1.0 : step(0.5, fract((float(i) + BEATN) * 0.5));
    acc += flame(ro, rd, h, vec3(fan(i, 8) * 11.0, DECKY, 0.4), fire * pat * (4.5 + 2.5 * h21(vec2(float(i), BEATN))), float(i) * 2.3);
  }
  for (int i = 0; i < 10; i++){
    float f = fan(i, 10);
    acc += beam(ro, rd, h, onTruss(0, f), aim(f * 0.5 * SPR + sin(MT * PI * 0.25 + f * 2.0) * 0.25, 0.5 + 0.3 * sin(MT * PI * 0.5 + f)), 0.08, 0.03, mix(iC0, iC1, 0.5 + 0.5 * f) * (0.4 + KICK * 0.9), 0.0);
  }
  for (int i = 0; i < 6; i++){
    float f = fan(i, 6);
    acc += beam(ro, rd, h, onTruss(1, f), aim((stepRand(float(i), 4.0, 0.4) - 0.5) * 1.4 * SPR, 0.3 + stepRand(float(i), 6.0, 0.4) * 0.7), 0.05, 0.01, vec3(1.0, 0.9, 0.75) * (0.3 + SNARE * 1.2), 0.0);
  }
  return acc;
}`;

const H_SHARPY_FAN = `
void setup(){
  ENV = 0; LEDK = -1; stdTruss(12.0, 3);
  vec3 bar = cyc(barN() * 0.333);
  AMB = bar * (0.03 + KICK * 0.06); HAZEC = bar * 0.011; RIMC = bar * (0.5 + KICK * 0.7);
  LIP = bar; LIPCH = 1.0; HANDS = 0.6; CAMSWAY = 0.45; FLASH = KICK * 0.08 * step(0.75, NRG);
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  // Twenty-four sharpies, one colour per bar, white on the kick; every beat a new ballyhoo.
  vec3 c = mix(cyc(barN() * 0.333), vec3(1.0), min(KICK, 1.0) * 0.6) * (0.4 + KICK * 1.2);
  for (int j = 0; j < 3; j++){
    for (int i = 0; i < 8; i++){
      float f = fan(i, 8), id = float(i + j * 8);
      float hit = step(0.3, DROP);   // phrase-held focus; ballyhoo on every beat only after a drop
      float pan = f * 0.45 * SPR + (mix(presetHold(id, 1.0, 1.0), stepRand(id, 1.0, 0.45), hit) - 0.5) * 0.9 * SPR;
      float tilt = 0.3 + mix(presetHold(id, 2.0, 1.0), stepRand(id, 2.0, 0.45), hit) * (0.9 + float(j) * 0.2);
      acc += beam(ro, rd, h, onTruss(j, f), aim(pan, tilt), 0.045, 0.009, c, 0.0);
    }
  }
  return acc;
}`;

const H_STROBE_WALL = `
void setup(){
  ENV = 2; LEDK = -1; LEDB = 1.8; STW = 9.0; DECKZ = 9.0; WALLZ = 9.5; WALLX = 9.0; WALLY0 = 1.6; WALLY1 = 8.0;
  NTR = 2; TR[0] = vec4(0.0, 8.0, 1.5, 9.5); TR[1] = vec4(0.0, 8.6, 6.5, 9.0); SPK = false;
  CAMT = vec3(0.0, 4.5, 5.0); CAMFOV = 50.0;
  AMB = iC0 * (0.03 + KICK * 0.08); HAZEC = iC0 * 0.012; RIMC = mix(iC0, vec3(1.0), 0.4) * (0.4 + KICK);
  FLASH = KICK * 0.25 * step(0.6, NRG) + HAT * 0.08; HANDS = 0.55; CAMSWAY = 0.7;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  // Two rows of strobes; the pattern changes every bar: chase, random sixteenths, all-on kicks.
  float mode = mod(barN(), 3.0);
  for (int j = 0; j < 4; j++){          // the strobes are the wall: 4 rows × 6
    for (int i = 0; i < 6; i++){
      float id = float(i + j * 6);
      float on = mode < 0.5 ? chase(id, 24.0, 4.0) * (0.5 + HAT)
               : (mode < 1.5 ? step(0.6, h21(vec2(floor(iTime * 16.0), id))) * HAT * 1.5 : KICK);
      acc += panel(ro, rd, h, vec3(fan(i, 6) * 6.5, DECKY + 1.6 + float(j) * 1.5, DECKZ - 0.3), vec2(0.45, 0.12), vec3(1.0) * on * 3.0 * step(0.4, NRG));
    }
  }
  for (int i = 0; i < 4; i++){
    float sx = i < 2 ? -1.0 : 1.0; float fi = mod(float(i), 2.0) * 1.5;
    acc += beam(ro, rd, h, vec3(sx * 8.5, DECKY + 0.2, 2.0 + fi * 2.5), aim(-sx * (0.6 + 0.4 * sin(MT * PI * 0.5 + fi)), 2.2 + 0.2 * sin(MT * PI * 0.25 + fi)), 0.05, 0.012, iC2 * (0.4 + KICK), 0.0);
  }
  return acc;
}`;

const H_HEADLINER = `
void setup(){
  ENV = 0; LEDK = -1; WALLX = 15.0; WALLY1 = 11.0; stdTruss(13.0, 3); KEYC = tung(0.9) * 0.6;
  float fire = DROP;
  AMB = iC0 * (0.05 + KICK * 0.08) + vec3(1.0, 0.5, 0.15) * fire * 0.2;
  HAZEC = iC0 * 0.011 + vec3(0.004); RIMC = mix(iC0, vec3(1.0), 0.3) * (0.6 + KICK * 0.8);
  FLASH = SNARE * 0.15 * step(0.7, NRG) + DROP * 0.25; HANDS = 0.75; CAMSWAY = 0.5;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  // Gold beams punched at the crowd on every kick.
  for (int j = 0; j < 2; j++){
    for (int i = 0; i < 5; i++){
      float f = fan(i, 5);
      acc += beam(ro, rd, h, onTruss(j + 1, f), aim(f * 0.6 * SPR, 1.25 + KICK * 0.2 - float(j) * 0.25), 0.06, 0.012, mix(iC0, vec3(1.0), 0.25 * float(j)) * (0.15 + KICK * 1.6), 0.0);
    }
  }
  acc += followspot(ro, rd, h, vec3(0.0, 18.0, -45.0), vec3(0.0, DECKY, 2.6), 1.0, tung(0.95) * 0.9);   // the headliner is lit
  for (int i = 0; i < 4; i++) acc += blinder(ro, rd, h, onTruss(0, fan(i, 4) * 0.7) + vec3(0.0, 0.0, -0.35), DROP + SNARE * 0.4 * step(0.8, NRG));
  for (int i = 0; i < 4; i++){ float f = fan(i, 4); acc += co2(ro, rd, h, vec3(f * 9.0, DECKY, 0.8), DROP, f * 0.3); }
  for (int i = 0; i < 2; i++) acc += flame(ro, rd, h, vec3((float(i) * 2.0 - 1.0) * 11.0, DECKY, 0.4), DROP * 6.0, float(i) * 4.0);
  return acc;
}`;

const H_TECHNO = `
void setup(){
  ENV = 2; LEDK = -1; STW = 8.0; DECKZ = 8.0; WALLZ = 8.5; WALLX = 8.0; WALLY0 = 1.6; WALLY1 = 8.0;
  NTR = 1; TR[0] = vec4(0.0, 8.0, 2.5, 9.0); SPK = false;
  CAMT = vec3(0.0, 4.0, 5.0); CAMFOV = 52.0; GMF = 0.2;
  HAZE *= 1.35;
  AMB = iC0 * (0.02 + KICK * 0.05); HAZEC = iC0 * 0.014; RIMC = mix(iC0, vec3(1.0), KICK * 0.5) * (0.4 + KICK * 0.6);
  FLASH = KICK * 0.3 * step(0.5, NRG); HANDS = 0.6; CAMSWAY = 0.6;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  // Low red beams from the back of the room, slow and heavy, through thick haze.
  for (int i = 0; i < 8; i++){
    float f = fan(i, 8);
    float sw = sin(MT * PI * 0.125 + f * 2.5) * 0.35 * SPR;
    acc += beam(ro, rd, h, vec3(f * 7.0, DECKY + 0.2, 7.5), aim(f * 0.2 + sw, 2.0 + 0.15 * sin(MT * PI * 0.25 + f)), 0.07, 0.016, iC0 * (0.35 + KICK * 0.9 + DROP * 0.5), 0.0);
  }
  for (int i = 0; i < 4; i++) acc += panel(ro, rd, h, onTruss(0, fan(i, 4) * 0.85) + vec3(0.0, 0.3, -0.3), vec2(0.34, 0.08), vec3(1.0) * KICK * 3.0 * step(0.5, NRG));
  acc += beam(ro, rd, h, vec3(0.0, 8.5, 1.0), aim(0.0, 0.35), 0.2, 0.12, iC1 * (0.2 + SNARE * 0.8), 0.0);
  return acc;
}`;

const H_STADIUM = `
void setup(){
  ENV = 5; LEDK = 2; STW = 16.0; WALLX = 17.0; WALLY0 = 2.4; WALLY1 = 14.0; WALLZ = 13.0; DECKZ = 12.5; LEDB = 1.0;
  stdTruss(17.0, 3); STARN = 0.5; CLOUD = 0.5; PHONES = 0.3;
  CAMT = vec3(0.0, 6.5, 6.0); CAMFOV = 42.0;
  AMB = mix(iC0, iC1, 0.5) * (0.04 + KICK * 0.06) + tung(DROP) * 0.25;
  HAZEC = mix(iC0, iC1, 0.5) * 0.011; RIMC = mix(iC0, iC2, 0.5) * (0.6 + KICK * 0.6) + tung(DROP);
  FLASH = DROP * 0.3; HANDS = 0.6; CAMSWAY = 0.3;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  // Sixteen big beams sweeping the whole bowl, in bars.
  for (int j = 0; j < 2; j++){
    for (int i = 0; i < 8; i++){
      float f = fan(i, 8);
      float sw = sin(MT * PI * 0.25 + f * 1.4 + float(j) * PI) * 0.5 * SPR;
      acc += beam(ro, rd, h, onTruss(j + 1, f), aim(f * 0.7 + sw, 0.9 + 0.35 * sin(MT * PI * 0.5 + f)), 0.08, 0.02, cyc(f * 0.3 + float(j) * 0.4 + barN() * 0.25) * (0.5 + KICK * 1.1), 0.0);
    }
  }
  for (int i = 0; i < 2; i++){
    float sx = float(i) * 2.0 - 1.0;
    acc += followspot(ro, rd, h, vec3(sx * 30.0, 22.0, -60.0), vec3(sx * 4.2, DECKY, 3.7), 1.4, vec3(1.0, 0.97, 0.92) * 0.9);
  }
  for (int i = 0; i < 6; i++) acc += blinder(ro, rd, h, onTruss(0, fan(i, 6) * 0.8) + vec3(0.0, 0.0, -0.35), DROP + SNARE * 0.3 * step(0.85, NRG));
  return acc;
}`;

const H_POP_SPECTACLE = `
void setup(){
  ENV = 0; LEDK = 11; stdTruss(12.5, 3);
  vec3 c = mod(BEATN, 2.0) < 0.5 ? iC0 : iC1;
  AMB = c * (0.05 + KICK * 0.07); HAZEC = mix(iC0, iC1, 0.5) * 0.012; RIMC = c * (0.6 + KICK * 0.6);
  LIP = mix(iC0, iC1, 0.5); LIPCH = 1.0; FLASH = SNARE * 0.2 * step(0.6, NRG); HANDS = 0.7; CAMSWAY = 0.35; KEYC = mix(vec3(1.0), iC0, 0.2) * 0.6;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  // Prism beams: each head throws three, alternating pink and cyan on the beat.
  for (int i = 0; i < 8; i++){
    float f = fan(i, 8);
    vec3 c = (mod(float(i) + BEATN, 2.0) < 0.5 ? iC0 : iC1) * (0.35 + KICK * 1.1);
    float pan = f * 0.5 * SPR + sin(MT * PI * 0.25 + f * 2.0) * 0.3, tilt = 0.55 + 0.3 * sin(MT * PI * 0.5 + f * 1.3);
    for (int k = 0; k < 3; k++){ float fk = float(k - 1); acc += beam(ro, rd, h, onTruss(1, f), aim(pan + fk * 0.14, tilt + fk * 0.06), 0.05, 0.009, c * 0.6, 0.0); }
  }
  for (int i = 0; i < 6; i++) acc += panel(ro, rd, h, onTruss(2, fan(i, 6) * 0.85) + vec3(0.0, 0.3, -0.3), vec2(0.34, 0.08), iC2 * (SNARE + HAT * 0.5) * 2.5 * step(0.6, NRG));
  return acc;
}`;

const H_METAL = `
void setup(){
  ENV = 0; LEDK = -1; stdTruss(11.5, 3);
  float fire = KICK * step(0.6, NRG) + DROP;
  AMB = iC0 * (0.05 + KICK * 0.08) + vec3(1.0, 0.45, 0.1) * fire * 0.2;
  HAZEC = iC0 * 0.013 + vec3(0.006, 0.002, 0.0) * (1.0 + fire);
  RIMC = mix(iC0, iC1, 0.4) * (0.6 + KICK * 0.8);
  FLASH = SNARE * 0.3 * step(0.55, NRG) + DROP * 0.3; HANDS = 0.7; CAMSWAY = 0.6;
}
vec3 rig(vec3 ro, vec3 rd, Hit h){
  vec3 acc = vec3(0.0);
  float fire = min(KICK * step(0.6, NRG) + DROP, 1.0);
  for (int i = 0; i < 6; i++){
    float pat = step(0.5, fract((float(i) + BEATN) * 0.5)) + step(0.3, DROP);
    acc += flame(ro, rd, h, vec3(fan(i, 6) * 9.5, DECKY, 0.4), fire * min(pat, 1.0) * 5.5, float(i) * 1.7);
  }
  // Red downlight on the band with spoke gobos, snapped to a new angle on every snare.
  for (int i = 0; i < 8; i++){
    float f = fan(i, 8);
    acc += beam(ro, rd, h, onTruss(1, f), aim(f * 0.3 * SPR + (stepRand(float(i), 3.0, 0.2) - 0.5) * 0.5, 0.25 + stepRand(float(i), 5.0, 0.2) * 0.4), 0.1, 0.035, iC0 * (0.5 + KICK * 0.9), 1.6);
  }
  for (int i = 0; i < 6; i++) acc += panel(ro, rd, h, onTruss(2, fan(i, 6) * 0.85) + vec3(0.0, 0.3, -0.3), vec2(0.34, 0.08), vec3(1.0) * SNARE * 3.0 * step(0.55, NRG));
  for (int i = 0; i < 4; i++) acc += blinder(ro, rd, h, onTruss(0, fan(i, 4) * 0.75) + vec3(0.0, 0.0, -0.35), DROP);
  return acc;
}`;

export const RIGS_ENERGETIC: Record<string, string> = {
  RIG_LASER_CATHEDRAL: L_CATHEDRAL,
  RIG_LASER_LIQUID_SKY: L_LIQUID_SKY,
  RIG_LASER_TUNNEL: L_TUNNEL,
  RIG_LASER_CROSSFIRE: L_CROSSFIRE,
  RIG_LASER_MAINSTAGE: L_MAINSTAGE,
  RIG_LASER_GRID: L_GRID,
  RIG_LASER_HALO: L_HALO,
  RIG_LASER_SPECTRUM: L_SPECTRUM,
  RIG_LASER_AURORA: L_AURORA,
  RIG_LASER_STROBE_STORM: L_STROBE_STORM,
  RIG_HIGH_ARENA_ROCK: H_ARENA_ROCK,
  RIG_HIGH_EDM_DROP: H_EDM_DROP,
  RIG_HIGH_PYRO: H_PYRO,
  RIG_HIGH_SHARPY_FAN: H_SHARPY_FAN,
  RIG_HIGH_STROBE_WALL: H_STROBE_WALL,
  RIG_HIGH_HEADLINER: H_HEADLINER,
  RIG_HIGH_TECHNO: H_TECHNO,
  RIG_HIGH_STADIUM: H_STADIUM,
  RIG_HIGH_POP_SPECTACLE: H_POP_SPECTACLE,
  RIG_HIGH_METAL: H_METAL,
};
