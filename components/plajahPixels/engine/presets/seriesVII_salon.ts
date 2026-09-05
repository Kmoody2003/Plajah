import { SignatureWork } from './signatureShaders';

export const SERIES_VII_SALON: SignatureWork[] = [
  {
    id: "cathedral-organ-3d", n: 114, name: "Cathedral Organ",
    series: "VII", set: "salon", setTitle: "Salon",
    kit3d: true,
    line: "Gilded organ pipes made of glass, with light streaming through stained translucence.",
    params: [{name: "Light angle", def: 0.35}],
    reacts: [["sub", "Lowest pipes resonate"], ["voice", "Tallest central pipe intense internal light"]],
    body: `// CATHEDRAL ORGAN — Gilded organ pipes made of glass, with light streaming
// through stained translucence. BAROQUE gold meets GLASS ice-blue.
vec2 map(vec3 p){
  float d = p.y + 1.5; // Dark floor
  float m = 0.0;
  
  float pipeD = 1e5;
  float pipeMat = 1.0;
  
  // 15 pipes in a gentle arc
  for(int i=-7; i<=7; i++){
    float fi = float(i);
    vec3 c = vec3(fi * 0.5, 0.0, 0.08 * fi * fi - 1.0);
    float r = 0.2 - abs(fi)*0.01;
    
    float bin = (abs(fi) + 1.0)*0.03;
    float e = SPEC(bin);
    // Height corresponds to FFT bin energy
    float h = 1.2 + 2.0 * exp(-abs(fi)*0.4) + e * 1.5;
    
    vec3 pc = p - c;
    pc.y -= h - 1.5;
    float pd = sdCyl(pc, r, h);
    
    // Smooth domed cap
    float cap = length(pc - vec3(0.0, h, 0.0)) - r;
    pd = opSmoothU(pd, cap, 0.05);
    
    if(pd < pipeD){
      pipeD = pd;
      pipeMat = 1.0 + abs(fi);
    }
  }
  
  if(pipeD < d){
    d = pipeD;
    m = pipeMat;
  }
  return vec2(d, m);
}

void mainImage(out vec4 o, in vec2 C){
  Aud a = plajahAudio();
  float pu = plajahPunch();
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;
  
  vec3 ro = vec3(0.0, 0.5 + a.sub*0.3, -4.5);
  vec3 ta = vec3(0.0, 1.5, 0.0);
  mat3 cam = camera(ro, ta, 0.0);
  vec3 rd = cam * normalize(vec3(uv, 1.0));
  
  vec2 hit = raymarch(ro, rd, 20.0);
  float t = hit.x;
  float id = hit.y;
  
  vec3 col = vec3(0.05, 0.03, 0.05); // Dark cathedral ambient
  
  // Single dramatic Caravaggio light source from upper-left
  float la = iParam0 * 1.5 - 0.5;
  vec3 l = normalize(vec3(-3.0 + la, 5.0, -2.0));
  
  if(id > -0.5){
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    vec3 v = -rd;
    
    float nl = max(dot(n, l), 0.0);
    float sha = softShadow(p, l, 0.05, 10.0, 16.0);
    float ao = calcAO(p, n);
    
    vec3 gold = vec3(0.83, 0.66, 0.31); // BAROQUE gold #D4A84E
    vec3 glass = vec3(0.45, 0.88, 1.00); // GLASS ice-blue #73E0FF
    
    if(id == 0.0){
      // Dark floor
      col = vec3(0.07, 0.05, 0.07) * (0.2 + 0.8*nl*sha) * ao; // #120D12 base
      
      // Glass pipes refract light creating caustic patterns on the floor
      float ca = fbm(p.xz * 3.0 + iTime*0.5, 3);
      float ca2 = fbm(p.xz * 6.0 - iTime*0.2, 3);
      col += glass * ca * ca2 * sha * nl * (0.3 + a.pres*0.5) * 1.5;
      col += gold * ca * sha * nl * a.low * 0.5;
    } else {
      // Pipes
      float fi = id - 1.0;
      float bin = (fi + 1.0)*0.03;
      float e = SPEC(bin);
      
      vec3 baseColor = mix(gold, glass, 0.5 + 0.5*sin(fi*0.5));
      col = baseColor * 0.1 * ao;
      
      float spec = ggx(n, v, l, 0.15);
      float fre = fresnel(max(dot(n, v), 0.0), 0.04);
      
      col += baseColor * nl * sha * 0.5;
      col += gold * spec * sha * 2.5; // GGX specular
      col += glass * fre * sha * 2.0; // Fresnel rim highlight
      
      // Internal light
      float glow = e * e * 2.0;
      if(fi == 0.0) glow += a.voice * 4.0; // Voice activates tallest central pipe
      if(fi > 5.0 || fi < -5.0) glow += a.sub * 3.0;    // Sub bass makes lowest pipes resonate
      
      float backLight = max(dot(n, -l), 0.0);
      col += glass * backLight * 0.8 * glow;
      col += gold * glow * 0.6;
    }
  }
  
  // Dramatic volumetric shaft of gold light
  float rayD = dot(uv - vec2(-0.5, 0.5), vec2(-0.5, -0.5));
  float shaft = exp(-pow(abs(uv.x + uv.y - 0.2), 2.0)*8.0) * (0.15 + a.pres*0.3);
  col += vec3(0.83, 0.66, 0.31) * shaft * (1.0 - clamp(t/20.0, 0.0, 1.0));
  
  col = aces(col * 1.1);
  o = vec4(pow(max(col, 0.0), vec3(0.88)), 1.0);
}`
  },
  {
    id: "protest-frequency", n: 115, name: "Protest Frequency",
    series: "VII", set: "salon", setTitle: "Salon",
    kit3d: false,
    line: "Neon signs in a back alley, flickering with dissent — protest slogans that pulse with the music.",
    params: [{name: "Flicker rate", def: 0.35}],
    reacts: [["pres", "Top bar"], ["low", "Middle bar"], ["sib", "Bottom bar"], ["sub", "Overpowers and white-outs"]],
    body: `// PROTEST FREQUENCY — Neon signs in a back alley, flickering with dissent.
// REBEL palette (red, blue, yellow) meets NEON glow and falloff.
void mainImage(out vec4 o, in vec2 C){
  Aud a = plajahAudio();
  float pu = plajahPunch();
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;
  
  vec3 bg = vec3(0.15, 0.14, 0.12); // Dark concrete #262420
  
  // Concrete spray-paint smears (REBEL influence)
  float smear = fbm(uv * 5.0 + vec2(iTime*0.05, 0.0), 3);
  float smear2 = fbm(uv * 12.0 - vec2(0.0, iTime*0.02), 3);
  bg *= 0.6 + 0.4 * smear;
  bg += vec3(0.05) * step(0.7, smear2) * a.low;
  
  vec3 col = bg;
  
  // REBEL palette
  vec3 c1 = vec3(0.93, 0.17, 0.17); // Red #EF2B2D
  vec3 c2 = vec3(0.16, 0.39, 0.78); // Blue #2864C7
  vec3 c3 = vec3(0.90, 0.71, 0.18); // Yellow #E7B52F
  
  for(int i=0; i<3; i++){
    float fi = float(i);
    float y0 = 0.3 - fi * 0.3;
    
    // Sharp angular bends for neon tubing
    float x = uv.x * 2.5;
    float zigzag = abs(fract(x + fi*0.3) - 0.5) * 0.2;
    float y = y0 + zigzag + 0.05 * sin(x * 12.0 - iTime);
    
    // Approximate distance to the piecewise curve
    float d = abs(uv.y - y) * 0.8; 
    
    // Audio mapping per bar
    float band = (i == 0) ? a.pres : (i == 1) ? a.low : a.sib;
    
    // Failing neon sign flicker
    float flickNoise = fbm(vec2(iTime * (15.0 + iParam0*10.0) + fi*7.0, 0.0), 2);
    float flicker = step(0.1, flickNoise + band * 2.0);
    flicker = mix(0.15, 1.0, flicker);
    
    // Sub bass white-out
    if (a.sub > 0.6) flicker = 1.0 + a.sub;
    
    vec3 tubeCol = (i == 0) ? c1 : (i == 1) ? c2 : c3;
    
    // NEON effect: white core + colored falloff
    float core = exp(-d * 200.0);
    float glow = exp(-d * 18.0);
    float wideGlow = exp(-d * 5.0);
    
    vec3 c = tubeCol * glow * 1.5 + vec3(1.0) * core * 2.5 + tubeCol * wideGlow * 0.4;
    c *= flicker * (0.3 + band * 1.8);
    
    col += c;
    
    // Dripping paint effect below each tube
    float px = floor(uv.x * 25.0 + fi * 5.0) / 25.0;
    float drip = h11(px * 13.0 + fi);
    if(drip > 0.75 && uv.y < y) {
       float distX = abs(uv.x - px - 0.02);
       float dl = smoothstep(0.015, 0.002, distX);
       float dy = y - uv.y;
       float dropEnd = (drip - 0.7)*2.5;
       if(dy < dropEnd) {
           float dripFade = 1.0 - dy/dropEnd;
           col += tubeCol * dl * 0.4 * dripFade * band * flicker;
           // Drip head
           col += tubeCol * step(abs(dy - dropEnd), 0.01) * dl * 1.2 * band * flicker;
       }
    }
  }
  
  // Global bass hit overpower
  col += a.sub * a.sub * 0.3 * vec3(1.0);
  
  col = max(col, 0.0);
  col = col/(1.0 + col*0.72);
  o = vec4(pow(col, vec3(0.88)), 1.0);
}`
  },
  {
    id: "zen-instrument", n: 116, name: "Zen Instrument",
    series: "VII", set: "salon", setTitle: "Salon",
    kit3d: false,
    line: "A single brush stroke that IS the waveform — the most minimal possible gesture with maximum presence.",
    params: [{name: "Stroke thickness", def: 0.35}],
    reacts: [["sub", "Heavier pressure (thickness)"], ["voice", "Ghost stroke appears above"]],
    body: `// ZEN INSTRUMENT — A single brush stroke that IS the waveform.
// RADICAL_MINIMAL exactness meets INK imperfect texture.
void mainImage(out vec4 o, in vec2 C){
  Aud a = plajahAudio();
  float pu = plajahPunch();
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;
  
  // Warm paper #EEE9DD
  vec3 paper = vec3(0.93, 0.91, 0.86);
  
  // Paper texture with visible fiber
  float fib = fbm(uv * 200.0, 4);
  float fib2 = fbm(uv * 50.0 + vec2(1.2, 3.4), 3);
  paper -= fib * 0.04;
  paper -= fib2 * 0.02;
  
  // 64 discrete points across the frame for the waveform
  float fx = clamp(uv.x * 0.5 + 0.5, 0.0, 1.0);
  float stepX = floor(fx * 64.0) / 64.0;
  float w = WAVE(stepX);
  
  // Interpolate slightly so it's not totally stair-stepped, but retains the gesture
  float wNext = WAVE(stepX + 1.0/64.0);
  float wSmooth = mix(w, wNext, fract(fx * 64.0));
  
  float y = wSmooth * 0.25;
  float dist = abs(uv.y - y);
  
  // Brush thickness: thicker in middle, thinner at start/end
  float envelope = sin(fx * 3.14159);
  float thickness = 0.004 + iParam0*0.01 + 0.02 * envelope + a.sub * 0.04; // Bass pressure
  
  // Imperfect edges using FBM
  float edgeNoise = fbm(uv * 60.0 + iTime*0.05, 3);
  float edgeNoise2 = fbm(uv * 120.0, 2);
  thickness += (edgeNoise - 0.5) * 0.02;
  thickness += (edgeNoise2 - 0.5) * 0.01;
  
  // Bristle lines inside the stroke
  float bristles = sin(dist * 800.0 + edgeNoise * 10.0) * 0.5 + 0.5;
  
  float stroke = smoothstep(thickness, thickness * 0.7, dist);
  stroke *= 0.8 + 0.2 * bristles;
  
  vec3 ink = vec3(0.11, 0.14, 0.14); // Near-black #1D2525
  
  vec3 col = mix(paper, ink, stroke * (0.8 + 0.3*edgeNoise));
  
  // Voice ghost stroke above
  if(a.voice > 0.01) {
      float y2 = wSmooth * 0.3 + 0.18;
      float dist2 = abs(uv.y - y2);
      float thick2 = 0.003 + 0.012 * envelope;
      thick2 += (fbm(uv * 80.0 - iTime*0.05, 3) - 0.5) * 0.015;
      float stroke2 = smoothstep(thick2, thick2 * 0.6, dist2);
      col = mix(col, vec3(0.5, 0.52, 0.52), stroke2 * a.voice * 1.5);
  }
  
  // Brush flicking splatters near zero crossings
  float dotNoise = h21(floor(uv * 250.0));
  if(abs(wSmooth) < 0.04 && dist > thickness && dist < thickness + 0.06) {
      if(dotNoise > 0.985) {
          float splatSize = h21(floor(uv * 250.0) + 1.0) * 0.002;
          float splatD = length(fract(uv * 250.0) - 0.5);
          float splat = step(splatD, 0.3);
          col = mix(col, ink, splat * 0.7);
      }
  }
  
  // Subtle vignette
  col *= 1.0 - length(uv) * 0.15;
  
  o = vec4(col, 1.0);
}`
  },
  {
    id: "electric-manuscript", n: 117, name: "Electric Manuscript",
    series: "VII", set: "salon", setTitle: "Salon",
    kit3d: false,
    line: "An illuminated manuscript page where the marginalia are holographic data readouts.",
    params: [{name: "Glitch threshold", def: 0.35}],
    reacts: [["pres", "Ripples main text lines"], ["voice", "Footnote markers"], ["hit", "FUTURIST glitch effect"]],
    body: `// ELECTRIC MANUSCRIPT — An illuminated manuscript page with holographic marginalia.
// EDITORIAL measured poise meets FUTURIST spatial lattice.
void mainImage(out vec4 o, in vec2 C){
  Aud a = plajahAudio();
  float pu = plajahPunch();
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;
  
  vec3 paper = vec3(0.95, 0.94, 0.91); // Cream #F2EFE8
  
  // Beat glitch effect turns page into pure FUTURIST
  float glitchLine = step(0.9 - iParam0*0.2, h21(vec2(floor(iTime * 15.0), floor(uv.y * 10.0))));
  float glitch = pu * glitchLine;
  vec3 glitchBg = vec3(0.01, 0.04, 0.07); // Dark background #030B12
  
  vec3 col = mix(paper, glitchBg, glitch);
  
  float marginX = -0.3;
  
  // Thin purple editorial accent line
  float sep = smoothstep(0.002, 0.001, abs(uv.x - marginX));
  vec3 edPurp = vec3(0.48, 0.17, 0.75); // #7B2CBF
  col = mix(col, edPurp, sep * (1.0 - glitch));
  
  if(uv.x > marginX) {
      // Main text area: horizontal ruled lines
      float lineSpace = 0.06;
      float ly = fract(uv.y / lineSpace);
      float id = floor(uv.y / lineSpace);
      
      // Ripple like seismograph trace
      float band = fract(abs(id) * 0.08);
      float e = SPEC(band) * 1.5;
      
      float wave = sin(uv.x * 25.0 + iTime * 2.5 + id) * e * 0.025 * a.pres;
      float line = smoothstep(0.02, 0.01, abs(ly - 0.5 + wave / lineSpace));
      
      vec3 lineCol = mix(vec3(0.13, 0.11, 0.12), vec3(0.0, 0.94, 1.0), glitch); // Cyan on glitch
      col = mix(col, lineCol, line * (0.6 + e*0.4));
      
      // Voice causes footnote markers (numbered dots)
      if (a.voice > 0.15) {
          vec2 fnPos = vec2(0.4, id * lineSpace + 0.015);
          float d = length(uv - fnPos);
          if (d < 0.006) col = vec3(0.78, 0.30, 0.35); // #C84C58
      }
      
  } else {
      // Marginalia: FUTURIST data
      float gridY = floor(uv.y * 40.0);
      float gridX = floor(uv.x * 40.0);
      float hash = h21(vec2(gridX, gridY));
      
      vec3 futCyan = vec3(0.0, 0.94, 1.0); // #00F0FF
      vec3 futPurp = vec3(0.54, 0.36, 1.0); // #8B5CFF
      vec3 futGrn = vec3(0.3, 1.0, 0.61); // #4DFF9B
      
      // Tiny bar graphs
      float barVal = SPEC(fract(gridX * 0.15)) * 30.0;
      float isBar = step(gridY - floor(-0.3*40.0), barVal) * step(-0.3*40.0, gridY);
      isBar *= step(-0.65, uv.x) * step(uv.x, -0.35);
      
      if(isBar > 0.0 && hash > 0.1) {
          vec3 cellCol = mix(futCyan, futGrn, hash);
          col = mix(col, cellCol, 0.85 + 0.15*a.air);
      }
      
      // Dot matrix sparklines
      float isDot = step(0.85 - a.sib*0.3, hash) * step(uv.x, -0.7);
      if(isDot > 0.0) {
          col = mix(col, futPurp, 0.9);
      }
  }
  
  // Glitch pure futurist grid overlay
  if (glitch > 0.0) {
      float grid = step(0.95, fract(uv.x * 20.0)) + step(0.95, fract(uv.y * 20.0));
      col += vec3(0.0, 0.94, 1.0) * clamp(grid, 0.0, 1.0) * 0.5;
  }
  
  o = vec4(col, 1.0);
}`
  },
  {
    id: "arena-pulse", n: 118, name: "Arena Pulse",
    series: "VII", set: "salon", setTitle: "Salon",
    kit3d: false,
    line: "The stadium scoreboard and the broadcast control room merge into one reactive surface.",
    params: [{name: "Scanline intensity", def: 0.35}],
    reacts: [["sub", "Bar chart slam"], ["voice", "Highlights relevant quadrant"], ["hit", "Dividers flash gold"]],
    body: `// ARENA PULSE — Stadium scoreboard meets broadcast control room.
// SPORTS velocity readouts meet BROADCAST discipline.
void mainImage(out vec4 o, in vec2 C){
  Aud a = plajahAudio();
  float pu = plajahPunch();
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;
  
  float isTop = step(0.0, uv.y);
  float isRight = step(0.0, uv.x);
  
  // Voice highlights the quadrant that is most relevant
  float activeQ = floor(mod(iTime*0.8 + a.voice*3.0, 4.0));
  float currQ = isRight + isTop * 2.0; // 0=BL, 1=BR, 2=TL, 3=TR
  
  vec3 bgNorm = vec3(0.05, 0.06, 0.09); // #0D1017
  vec3 bgAct = vec3(0.08, 0.12, 0.19); // #142030
  vec3 col = mix(bgNorm, bgAct, step(abs(currQ - activeQ), 0.1));
  
  // Scanline overlay
  col -= iParam0 * 0.05 * sin(uv.y * 500.0);
  
  // Thin white divider lines flash gold on hits
  float div = smoothstep(0.002, 0.001, abs(uv.x)) + smoothstep(0.002, 0.001, abs(uv.y));
  vec3 divCol = vec3(1.0);
  if(pu > 0.4) divCol = vec3(1.0, 0.70, 0.16); // Gold #FFB329
  col = mix(col, divCol, clamp(div, 0.0, 1.0));
  
  // Top-Left (2): Horizontal bar chart of 8 FFT bins
  if(currQ == 2.0) {
      vec2 luv = vec2(uv.x * 2.0 + 1.0, uv.y * 2.0); // Normalize quad to 0..1
      float bin = floor(luv.y * 8.0);
      float val = SPEC(bin * 0.02 + 0.01) * 3.0 + a.sub*0.8;
      
      float barMargin = step(0.2, fract(luv.y * 8.0));
      float bar = step(luv.x, val) * barMargin;
      
      // SPORTS gradient: Red #FF4B2B -> Blue #00C2FF
      vec3 grad = mix(vec3(1.0, 0.29, 0.17), vec3(0.0, 0.76, 1.0), luv.x);
      col = mix(col, grad, bar);
      
      // Background lane geometry for bars
      col += vec3(0.1) * barMargin * step(luv.x, 1.0) * (1.0 - bar);
  }
  
  // Top-Right (3): Circular gauge (overall level)
  if(currQ == 3.0) {
      vec2 luv = uv - vec2(0.4, 0.25);
      float r = length(luv);
      float ang = atan(luv.y, luv.x);
      float lvl = a.pres + a.low + a.sub*0.2;
      
      // BROADCAST purple #7657FF arc
      float arc = step(r, 0.22) * step(0.18, r) * step(ang, -3.14 + clamp(lvl,0.0,1.0) * 6.28);
      col = mix(col, vec3(0.46, 0.34, 1.0), arc);
      
      // Inner tick marks
      float tick = step(r, 0.15) * step(0.12, r) * step(0.96, cos(ang*30.0));
      col = mix(col, vec3(1.0), tick);
  }
  
  // Bottom-Left (0): Scrolling timeline
  if(currQ == 0.0) {
      vec2 luv = vec2(uv.x + 0.5, uv.y + 0.25);
      float scroll = uv.x - iTime * 0.4;
      float beat = step(0.95, sin(scroll * 30.0));
      float mark = step(abs(luv.y), 0.08 + pu * 0.15) * beat;
      
      col = mix(col, vec3(0.11, 0.72, 1.0), mark); // #1DB7FF
      
      // Timeline lane
      float lane = step(abs(luv.y), 0.01);
      col = mix(col, vec3(0.3), lane * (1.0 - mark));
  }
  
  // Bottom-Right (1): Pulsing reticle
  if(currQ == 1.0) {
      vec2 luv = uv - vec2(0.4, -0.25);
      float r = length(luv);
      float pulse = 0.05 + a.sub * 0.15;
      
      float ring = smoothstep(0.008, 0.004, abs(r - pulse));
      float ring2 = smoothstep(0.005, 0.002, abs(r - 0.2));
      
      float crossh = (smoothstep(0.003, 0.001, abs(luv.x)) + smoothstep(0.003, 0.001, abs(luv.y))) * step(r, 0.25);
      
      vec3 retCol = vec3(1.0, 0.29, 0.17); // SPORTS red
      col = mix(col, retCol, clamp(ring + ring2 + crossh, 0.0, 1.0));
  }
  
  o = vec4(col, 1.0);
}`
  },
  {
    id: "ceremonial-lattice", n: 119, name: "Ceremonial Lattice",
    series: "VII", set: "salon", setTitle: "Salon",
    kit3d: false,
    line: "Sacred geometry mandala with golden-ratio proportions — a ritual space that responds to sound.",
    params: [{name: "Rotation speed", def: 0.35}],
    reacts: [["sub", "Pulses innermost ring"], ["voice", "Activates entire lattice simultaneously"]],
    body: `// CEREMONIAL LATTICE — Sacred geometry mandala with golden-ratio proportions.
// CEREMONIAL luminous nodes meet CLASSICAL harmonic measure.
float sdLine(vec2 p, vec2 a, vec2 b){
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba)/max(dot(ba, ba), 1e-6), 0.0, 1.0);
    return length(pa - ba*h);
}

void mainImage(out vec4 o, in vec2 C){
  Aud a = plajahAudio();
  float pu = plajahPunch();
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;
  
  // Slow mathematical rotation
  float t = iTime * (0.1 + iParam0*0.2);
  uv = rot(t) * uv;
  
  vec3 bg = vec3(0.09, 0.07, 0.16); // Deep indigo #171329
  vec3 col = bg;
  
  // Background subtle nebula for depth
  float neb = fbm(uv * 3.0 - t*0.5, 3);
  col += vec3(0.45, 0.29, 0.57) * neb * 0.1;
  
  vec3 gold = vec3(0.84, 0.67, 0.31); // #D5AC4E
  vec3 purp = vec3(0.45, 0.29, 0.57); // #744B91
  vec3 teal = vec3(0.12, 0.54, 0.55); // #1E8A8C
  
  float phi = 1.61803398875;
  
  // Fibonacci nodes mapping
  float nodes[5] = float[5](3.0, 5.0, 8.0, 13.0, 21.0);
  float rads[5];
  rads[0] = 0.06 + a.sub*0.06; // Bass pulses innermost ring
  rads[1] = rads[0] * phi; 
  rads[2] = rads[1] * phi; 
  rads[3] = rads[2] * phi; 
  rads[4] = rads[3] * phi;
  
  float acts[5] = float[5](a.sub, a.low, a.pres, a.sib, a.air);
  vec3 colors[5] = vec3[5](gold, gold, purp, teal, teal);
  
  // Voice activates the entire lattice
  float vGlow = a.voice * 1.5;
  
  for(int i=0; i<5; i++){
      float n = nodes[i];
      float r = rads[i];
      float act = acts[i] + vGlow;
      vec3 cCol = colors[i];
      
      // Concentric rings
      float ringD = abs(length(uv) - r);
      col += cCol * exp(-ringD * 300.0) * (0.15 + act*0.6);
      
      // Dashed classical accents on the rings
      float dash = step(0.5, sin(atan(uv.y, uv.x) * n * 2.0));
      col += cCol * exp(-ringD * 600.0) * dash * 0.3;
      
      for(float j=0.0; j<21.0; j++){
          if(j >= n) break;
          float ang = (j / n) * 6.2831853;
          vec2 pos = vec2(cos(ang), sin(ang)) * r;
          
          // Nodes drawn as luminous circles
          float d = length(uv - pos);
          col += cCol * exp(-d * 200.0) * (0.5 + act*2.5);
          col += vec3(1.0) * step(d, 0.004 + act*0.002);
          
          // Web lines connecting nodes in the same ring
          float nextAng = ((j+1.0) / n) * 6.2831853;
          vec2 nextPos = vec2(cos(nextAng), sin(nextAng)) * r;
          float ld = sdLine(uv, pos, nextPos);
          col += cCol * exp(-ld * 250.0) * (0.1 + act*0.9);
          
          // Web lines connecting to the inner ring closest node
          if(i > 0){
              float innerN = nodes[i-1];
              float innerR = rads[i-1];
              float closestAng = round((ang / 6.2831853) * innerN) / innerN * 6.2831853;
              vec2 innerPos = vec2(cos(closestAng), sin(closestAng)) * innerR;
              float ldi = sdLine(uv, pos, innerPos);
              vec3 mixCol = mix(cCol, colors[i-1], 0.5);
              col += mixCol * exp(-ldi * 200.0) * (0.05 + vGlow + act*0.2);
          }
      }
  }
  
  col = max(col, 0.0);
  col = col/(1.0 + col*0.72);
  o = vec4(pow(col, vec3(0.90)), 1.0);
}`
  }
];
