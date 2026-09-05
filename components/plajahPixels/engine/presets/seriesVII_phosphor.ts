import { SignatureWork } from './signatureShaders';

export const SERIES_VII_PHOSPHOR: SignatureWork[] = [
  {
    id: "night-current", n: 108, name: "Night Current",
    series: "VII", set: "phosphor", setTitle: "Phosphor",
    kit3d: false,
    line: "Marks emit light, trails retain musical memory, and the grid feels like an instrument.",
    params: [{name: "Decay", def: 0.35}, {name: "Jitter", def: 0.4}],
    reacts: [["sub","Cyan tube intensity and glow"],["low","Magenta tube intensity"],["pres","Purple tube presence"],["sib","Tube flicker and spark jitter"],["air","Cyan highs and crosshair pop"],["voice","Pulsing unison expansion"],["hit","Floor reflection flash"]],
    body: "// NIGHT CURRENT — Neon tube simulation. Six curved tubes bend across the frame,\n// each one a different audio band. The tube is a thin core of pure white surrounded\n// by colored glow that falls off with distance. Phosphor persistence is simulated\n// by layering multiple time-stepped samples of the same curve, so fast movements\n// leave a glowing trail. Additive color mixing happens where tubes cross.\n\nvec3 neonCyan = vec3(0.22, 0.95, 1.00); // #38F2FF\nvec3 neonMag  = vec3(1.00, 0.24, 0.82); // #FF3CD1\nvec3 neonPurp = vec3(0.55, 0.36, 1.00); // #8D5BFF\nvec3 neonGold = vec3(1.00, 0.82, 0.40); // #FFD166\n\nfloat tubeCurve(vec2 p, float t, float fi, float band) {\n  float off = fi * 1.3 + t * 0.35;\n  // A complex parametric curve for the tube to follow\n  float y = sin(p.x * 2.5 + off) * (0.2 + 0.08 * fi) \n          + cos(p.x * 1.2 - off * 1.5) * 0.15 \n          + 0.12 * fi - 0.3;\n  // Voice expands the amplitude\n  y *= 1.0 + band * 0.4;\n  return abs(p.y - y);\n}\n\nvoid mainImage(out vec4 o, in vec2 C){\n  Aud a = plajahAudio();\n  float pu = plajahPunch();\n  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;\n  float t = iTime * (0.8 + iParam0 * 1.2);\n\n  // Background near-black with subtle glow\n  vec3 col = vec3(0.027, 0.035, 0.102); // #07091A\n  \n  // Crosshair grid barely visible\n  vec2 g = fract(uv * 12.0) - 0.5;\n  float gridLines = smoothstep(0.03, 0.01, abs(g.x)) * smoothstep(0.4, 0.0, abs(g.y))\n                  + smoothstep(0.03, 0.01, abs(g.y)) * smoothstep(0.4, 0.0, abs(g.x));\n  col += vec3(0.05, 0.07, 0.15) * gridLines * (0.2 + a.air * 1.5);\n\n  // Reflection on a wet floor below the tubes\n  float floorMask = smoothstep(-0.1, -0.3, uv.y);\n  vec2 p = uv;\n  float isFloor = step(uv.y, -0.15);\n  if (isFloor > 0.5) {\n    p.y = -0.15 - (uv.y + 0.15) * 0.6; // mirror and compress\n    p.x += fbm(p * 5.0 + t, 3) * 0.05; // wet ripple\n  }\n\n  for (int i = 0; i < 6; i++) {\n    float fi = float(i);\n    float band = (i==0) ? a.sub : (i==1) ? a.low : (i==2) ? a.pres : (i==3) ? a.sib : (i==4) ? a.air : a.voice;\n    vec3 cInk = (i==0||i==4) ? neonCyan : (i==1) ? neonMag : (i==2||i==5) ? neonPurp : neonGold;\n    \n    // Flicker and high-frequency jitter\n    float flick = 1.0 + 0.3 * sin(t * 30.0 + fi * 11.0) * a.sib * (0.5 + iParam1);\n    float intensity = 0.15 + comp(band, 0.2) * 2.5 * flick + a.voice * 1.2;\n    \n    // Phosphor persistence via multiple time samples\n    vec3 tubeAccum = vec3(0.0);\n    for (int j = 0; j < 4; j++) {\n      float dt = t - float(j) * 0.03;\n      float d = tubeCurve(p, dt, fi, a.voice);\n      \n      float core = smoothstep(0.006, 0.0, d);\n      float glow = 0.008 / (d + 0.004);\n      // Glow radius expands on peaks\n      glow += 0.02 / (d + 0.02) * intensity;\n      \n      float decay = 1.0 - float(j)*0.25;\n      vec3 tubeColor = cInk * glow * intensity + vec3(1.0) * core * intensity * 0.8;\n      tubeAccum += tubeColor * decay;\n    }\n    \n    col += tubeAccum * mix(1.0, 0.2, isFloor); // Floor is dimmer\n  }\n\n  // Transient flashes the floor reflection\n  col += pu * 0.8 * floorMask * neonCyan * fbm(uv*10.0, 2);\n  \n  col = max(col, 0.0); col = col/(1.0 + col*0.72);\n  o = vec4(pow(col, vec3(0.88)), 1.0);\n}"
  },
  {
    id: "predictive-lattice", n: 109, name: "Predictive Lattice",
    series: "VII", set: "phosphor", setTitle: "Phosphor",
    kit3d: false,
    line: "Values inhabit a responsive spatial lattice with forecast trails, depth cues, and machine-legible precision.",
    params: [{name: "Speed", def: 0.4}, {name: "Depth", def: 0.5}],
    reacts: [["sub","Pulse wave through the lattice"],["low","Lifts grid points"],["pres","Mesh line brightness"],["air","Sparkles in the distant points"],["voice","Highlights a specific data column"],["hit","Grid intersection flash"]],
    body: "// PREDICTIVE LATTICE — 3D perspective grid of points receding into the frame.\n// Each grid point's Y-position (lift) responds to the FFT bin at its column.\n// The lattice has depth-of-field: near points are sharp, far points are dim and soft.\n// Connecting lines between adjacent points create a mesh surface. It scrolls toward\n// the viewer like a holographic instrument readout.\n\nvec3 futCyan = vec3(0.00, 0.94, 1.00); // #00F0FF\nvec3 futPurp = vec3(0.55, 0.36, 1.00); // #8B5CFF\nvec3 futGrn  = vec3(0.30, 1.00, 0.61); // #4DFF9B\nvec3 futPink = vec3(1.00, 0.31, 0.64); // #FF4FA3\n\nvoid mainImage(out vec4 o, in vec2 C){\n  Aud a = plajahAudio();\n  float pu = plajahPunch();\n  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;\n  float t = iTime * (1.2 + iParam0 * 1.5);\n\n  vec3 col = vec3(0.012, 0.043, 0.071); // #030B12\n  \n  // Background dot grid pattern\n  vec2 bgGrid = fract(uv * 30.0) - 0.5;\n  col += vec3(0.05, 0.1, 0.15) * smoothstep(0.1, 0.0, length(bgGrid)) * (0.2 + a.pres*0.5);\n\n  // Fake 3D Perspective projection\n  float camY = 0.5 + a.low * 0.1;\n  float camZ = t * 2.0;\n  vec3 ro = vec3(0.0, camY, camZ - 2.0);\n  vec3 rd = normalize(vec3(uv.x, uv.y - 0.2, 1.0));\n\n  if (rd.y < -0.01) {\n    float dist = (-0.3 - ro.y) / rd.y;\n    vec3 hit = ro + rd * dist;\n    \n    vec2 lp = hit.xz;\n    vec2 gridId = floor(lp * 2.5);\n    vec2 gridF = fract(lp * 2.5) - 0.5;\n    \n    // Column data from FFT\n    float bin = fract(abs(gridId.x) * 0.05);\n    float colData = SPEC(bin * 0.5 + 0.01);\n    float lift = comp(colData, 0.1) * 1.5;\n    \n    // Pulse wave traveling from front to back on beat hits\n    float wave = smoothstep(0.8, 0.0, abs(fract(hit.z * 0.2 - t * 0.5) - 0.5));\n    lift += wave * comp(a.sub, 0.2) * 1.2;\n    \n    // Depth of field cues\n    float fog = exp(-dist * (0.15 + iParam1 * 0.1));\n    float dofBlur = smoothstep(2.0, 15.0, dist) * 0.1;\n    \n    float d = length(gridF);\n    float dotSize = 0.06 + lift * 0.05;\n    float point = smoothstep(dotSize + dofBlur, dotSize - 0.02 - dofBlur, d);\n    \n    vec3 c = mix(futCyan, futPurp, clamp(lift, 0.0, 1.0));\n    c = mix(c, futGrn, wave * 0.8);\n    \n    // Voice highlights one tracking column with hot pink\n    float trackCol = floor(sin(t * 0.5) * 5.0);\n    float hCol = smoothstep(1.0, 0.0, abs(gridId.x - trackCol));\n    c = mix(c, futPink, hCol * a.voice * 1.5);\n    \n    // Connecting lines\n    float lines = smoothstep(0.04 + dofBlur, 0.0, abs(gridF.x)) * smoothstep(0.4, 0.0, abs(gridF.y))\n                + smoothstep(0.04 + dofBlur, 0.0, abs(gridF.y)) * smoothstep(0.4, 0.0, abs(gridF.x));\n    col += lines * 0.15 * futCyan * fog * (1.0 + a.pres * 2.0);\n    \n    // Points\n    col += point * c * (0.5 + lift * 2.0 + a.air) * fog;\n    \n    // FACET marks at intersections (small crosses)\n    float facet = step(abs(gridF.x), 0.01) * step(abs(gridF.y), 0.15)\n                + step(abs(gridF.y), 0.01) * step(abs(gridF.x), 0.15);\n    col += facet * 0.5 * futPink * pu * fog;\n  }\n\n  // Overall tint and transient flash\n  col += pu * 0.15 * futCyan * exp(-length(uv)*2.0);\n  \n  col = max(col, 0.0); col = col/(1.0 + col*0.72);\n  o = vec4(pow(col, vec3(0.88)), 1.0);\n}"
  },
  {
    id: "signal-bloom", n: 110, name: "Signal Bloom",
    series: "VII", set: "phosphor", setTitle: "Phosphor",
    kit3d: false,
    line: "Data behaves like an audiovisual signal: blooming, bending, and resolving in time.",
    params: [{name: "Warp", def: 0.35}, {name: "Size", def: 0.5}],
    reacts: [["sub","Bloom radius expansion"],["pres","Petal count and warm highlights"],["sib","Detail veins inside petals"],["voice","Asymmetric shift and petal resolution"],["hit","Core flash and expanding shockwave"]],
    body: "// SIGNAL BLOOM — THE Plajah signature. A central point emits radial petals\n// that bloom outward. Each petal is a frequency band visualized as a parametric\n// rose curve. The bloom has domain warping so the petal edges feel organic,\n// not purely mathematical. Between blooms, the petals contract and the colors\n// resolve to a calm state.\n\nvec3 plaMag  = vec3(0.83, 0.00, 0.33); // #D40055\nvec3 plaPurp = vec3(0.42, 0.00, 0.60); // #6B0099\nvec3 plaCyan = vec3(0.00, 0.85, 0.95); // #00DAF3\nvec3 plaOrg  = vec3(1.00, 0.55, 0.00); // #FF8C00\n\nvoid mainImage(out vec4 o, in vec2 C){\n  Aud a = plajahAudio();\n  float pu = plajahPunch();\n  int OCT = plajahOct();\n  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;\n  float t = iTime * (0.5 + iParam0 * 0.5);\n\n  vec3 col = vec3(0.063, 0.043, 0.090); // #100B17\n  \n  // Subtle radial grid glowing beneath\n  float rOrig = length(uv);\n  float thOrig = atan(uv.y, uv.x);\n  float radGrid = smoothstep(0.48, 0.5, fract(thOrig * 12.0 / 6.28318))\n                * smoothstep(0.45, 0.5, fract(rOrig * 8.0 - t));\n  col += radGrid * 0.08 * plaPurp * (1.0 + a.low);\n\n  // Voice makes the bloom asymmetric by shifting the coordinate center slightly\n  vec2 centerOffset = vec2(cos(t), sin(t)) * a.voice * 0.15;\n  vec2 p = uv - centerOffset;\n  \n  float r = length(p);\n  float th = atan(p.y, p.x);\n  \n  // Petal count shifts with presence\n  float basePetals = 4.0 + floor(comp(a.pres, 0.3) * 6.0);\n  float petals = mix(basePetals, basePetals + 2.0, smoothstep(0.3, 0.7, a.air));\n  \n  // Domain warping for organic edges\n  float dWarp = fbm(p * 4.0 + vec2(t * 0.3, -t * 0.2), OCT) * (0.15 + iParam1 * 0.2);\n  \n  // Sub bass controls the overall bloom radius\n  float bloomRad = 0.15 + comp(a.sub, 0.2) * 0.45 + a.low * 0.2;\n  float curve = bloomRad * (0.6 + 0.4 * cos(petals * th + t * 0.5 + dWarp * 6.0));\n  \n  float petalDist = r - curve;\n  \n  // Soft anti-aliased shape and bloom glow\n  float shape = smoothstep(0.03, -0.01, petalDist);\n  float innerHole = smoothstep(-0.05, 0.05, r - 0.02 * a.voice);\n  shape *= innerHole;\n  \n  float glow = 0.015 / (abs(petalDist) + 0.01);\n  \n  // Plajah palette radial gradient\n  vec3 pCol = mix(plaMag, plaPurp, smoothstep(0.0, 0.15, r));\n  pCol = mix(pCol, plaCyan, smoothstep(0.15, 0.35, r));\n  pCol = mix(pCol, plaOrg, smoothstep(0.3, 0.5, r) * (a.pres + a.voice * 1.5));\n  \n  // Add detail lines inside the petals\n  float veins = smoothstep(0.2, 0.0, abs(fract(th * petals / 6.28318) - 0.5));\n  pCol += veins * 0.2 * plaCyan * a.sib;\n  \n  col += (shape * 0.8 + glow * 1.2) * pCol * (0.6 + a.pres * 1.2 + a.sib * 0.5);\n  \n  // Beat hits trigger a bright core flash and expanding ring\n  col += pu * 1.2 * exp(-r * (10.0 - pu * 5.0)) * vec3(1.0, 0.9, 0.9);\n  float shock = smoothstep(0.02, 0.0, abs(rOrig - fract(t * 2.0 + pu) * 1.5));\n  col += shock * 0.3 * plaCyan * pu;\n  \n  col = max(col, 0.0); col = col/(1.0 + col*0.72);\n  o = vec4(pow(col, vec3(0.88)), 1.0);\n}"
  },
  {
    id: "live-decision", n: 111, name: "Live Decision",
    series: "VII", set: "phosphor", setTitle: "Phosphor",
    kit3d: false,
    line: "Modular information straps, breaking-state accents, and disciplined density support live storytelling.",
    params: [{name: "Ticker speed", def: 0.5}, {name: "Density", def: 0.4}],
    reacts: [["sub","Main strap fill energy"],["pres","Secondary strap pop and fill level"],["air","Ticker line brightness"],["voice","Bar graph segment highs"],["hit","Breaking-state red flash"]],
    body: `vec3 hx(int c){ return vec3(float((c>>16)&255), float((c>>8)&255), float(c&255))/255.0; }

// CAPSULE is this council member's mark, so every element is a rounded strap.
float capsule(vec2 p, vec2 c, vec2 half_, float r){
  vec2 d = abs(p - c) - (half_ - r);
  return smoothstep(r, r*0.35, max(d.x, d.y) > 0.0 ? length(max(d, 0.0)) : max(d.x, d.y));
}

void mainImage(out vec4 o, in vec2 C){
  Aud a = plajahAudio(); float pu = plajahPunch();
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;
  vec3 bg = hx(0x0D1017), fg = hx(0xF8FAFC), muted = hx(0x8B96A8),
       redC = hx(0xFF304F), blue = hx(0x1DB7FF), purple = hx(0x7657FF), amber = hx(0xFFB329);

  vec3 col = bg;
  // DOTS grid: the studio floor under everything, disciplined and quiet.
  vec2 g = fract(uv*26.0) - 0.5;
  col += vec3(0.055, 0.075, 0.105)*smoothstep(0.10, 0.0, length(g))*0.55;

  // The strap stack on the left: four modular readings, each a capsule that fills.
  for (int i = 0; i < 4; i++){
    float fi = float(i);
    float y = 0.26 - fi*0.135;
    float e = comp(SPEC(0.010 + fi*0.052), 0.30);
    vec3 c = i == 0 ? redC : (i == 1 ? blue : (i == 2 ? purple : amber));
    // The track, then the fill: a bar that means something only because the track bounds it.
    col = mix(col, mix(bg, muted, 0.22), capsule(uv, vec2(-0.30, y), vec2(0.42, 0.036), 0.030));
    float w = 0.02 + e*0.40;
    col = mix(col, c, capsule(uv, vec2(-0.72 + w, y), vec2(w, 0.030), 0.026));
    // Label block at the head of each strap, uppercase by implication.
    col = mix(col, fg, capsule(uv, vec2(0.19, y), vec2(0.055 + e*0.03, 0.012), 0.010)*0.85);
  }

  // The right-hand column: a dense stack of small capsules — the density the premise asks for.
  for (int i = 0; i < 12; i++){
    float fi = float(i);
    float y = 0.34 - fi*0.052;
    float e = SPEC(0.02 + fi*0.030);
    float lit = step(0.30, e);
    col = mix(col, mix(muted*0.35, blue, lit), capsule(uv, vec2(0.52, y), vec2(0.10, 0.016), 0.014)*0.9);
    col = mix(col, amber, capsule(uv, vec2(0.66, y), vec2(0.012, 0.012), 0.011)*lit*(0.4 + e));
  }

  // The lower third: the strap that carries the decision.
  float lowerY = -0.36;
  col = mix(col, mix(bg, purple, 0.55), capsule(uv, vec2(0.0, lowerY), vec2(0.86, 0.062), 0.050));
  col = mix(col, fg, capsule(uv, vec2(-0.60, lowerY), vec2(0.20, 0.014), 0.012)*0.9);
  col = mix(col, muted, capsule(uv, vec2(-0.14, lowerY - 0.026), vec2(0.30, 0.007), 0.006)*0.8);

  // BREAKING state: the accent only appears on a transient, and it takes the whole strap.
  float brk = clamp(pu*1.6, 0.0, 1.0);
  col = mix(col, redC, capsule(uv, vec2(-0.74, lowerY), vec2(0.11, 0.040), 0.030)*(0.35 + brk*0.65));
  col += redC*brk*0.10*smoothstep(0.14, 0.0, abs(uv.y - lowerY));

  // A live tally sweeping the top edge, which is what keeps the frame feeling on air.
  float sweep = fract(iTime*0.16 + iParam0);
  float sx = mix(-0.86, 0.86, sweep);
  col = mix(col, blue, capsule(uv, vec2(sx, 0.46), vec2(0.045, 0.008), 0.007)*(0.5 + a.air*1.4));
  col = mix(col, muted, capsule(uv, vec2(0.0, 0.46), vec2(0.86, 0.0016), 0.0015)*0.45);

  // No filmic curve here: this council member's texture is CLEAN, and tone-mapping pulls the
  // straps towards pastel exactly where the palette needs to stay saturated.
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`
  },
  {
    id: "refractive-field", n: 112, name: "Refractive Field",
    series: "VII", set: "phosphor", setTitle: "Phosphor",
    kit3d: false,
    line: "Translucent volumes, caustic highlights, and real depth turn numbers into physical objects.",
    // The body reads iParam0 as the drift speed, iParam1 as refraction strength and iParam2 as
    // the Fresnel exponent. Declaring only two left the labels off by one and pinned Fresnel
    // at zero, because the renderer only uploads the parameters a work names.
    params: [{name: "Speed", def: 0.4}, {name: "Refraction", def: 0.5}, {name: "Fresnel", def: 0.3}],
    reacts: [["sub","Bubble expansion"],["pres","Caustic bright spots on the floor"],["air","Small bubble spawning"],["voice","Central bubble gold fresnel highlight"],["hit","Specular flash on bubbles"]],
    body: "// REFRACTIVE FIELD — A field of floating translucent bubbles at different depths.\n// Each bubble refracts the background by shifting UVs along the bubble's normal.\n// Chromatic aberration splits the RGB channels. Voice highlights one large central\n// bubble with enhanced Fresnel rim glow. Caustic bright spots on the floor converge\n// based on presence.\n\nvec3 glsIce = vec3(0.45, 0.88, 1.00); // #73E0FF\nvec3 glsLav = vec3(0.72, 0.57, 1.00); // #B791FF\nvec3 glsPnk = vec3(1.00, 0.56, 0.73); // #FF8FB9\nvec3 glsGld = vec3(1.00, 0.82, 0.55); // #FFD28B\n\nvoid mainImage(out vec4 o, in vec2 C){\n  Aud a = plajahAudio();\n  float pu = plajahPunch();\n  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;\n  float t = iTime * (0.4 + iParam0 * 0.6);\n\n  // Background dark blue-grey\n  vec3 bgCol = vec3(0.094, 0.125, 0.173); // #18202C\n  \n  // Glass texture depth behind everything\n  bgCol += vec3(0.02, 0.03, 0.05) * fbm(uv * 8.0 - vec2(0.0, t*0.2), 3);\n  \n  // Caustics on the floor\n  float floorMask = smoothstep(0.0, -0.4, uv.y);\n  float causticWarp = fbm(uv * 6.0 + vec2(t * 0.5, -t * 0.3), 3);\n  float caustic = smoothstep(0.6, 0.8, sin(uv.x * 15.0 + causticWarp * 5.0)) \n                * smoothstep(0.6, 0.8, sin(uv.y * 10.0 + causticWarp * 4.0));\n  bgCol += caustic * floorMask * glsIce * (0.5 + a.pres * 2.5);\n\n  vec3 col = bgCol;\n\n  // 12 bubbles rendered back to front\n  for (int i = 0; i < 12; i++) {\n    float fi = float(i);\n    \n    // Bubble sizes and positions\n    float size = 0.08 + 0.06 * sin(fi * 13.0) + comp(a.sub, 0.3) * 0.04;\n    if (i > 5) size *= (0.3 + a.air * 0.6); // Small bubbles driven by air\n    \n    vec2 pos = vec2(sin(t * 0.3 + fi * 2.1) * 0.8, cos(t * 0.4 + fi * 1.7) * 0.4);\n    // The first bubble is the large central one\n    if (i == 0) {\n      pos = vec2(sin(t*0.2)*0.1, cos(t*0.15)*0.1);\n      size = 0.25 + a.low * 0.05;\n    }\n    \n    vec2 d = uv - pos;\n    float dist = length(d);\n    \n    if (dist < size) {\n      // Sphere normal\n      float z = sqrt(1.0 - (dist / size) * (dist / size));\n      vec3 n = vec3(d / size, z);\n      \n      // Refraction with chromatic aberration\n      float refrStr = 0.15 * (1.0 + iParam1);\n      vec2 rUvR = uv + n.xy * refrStr * 0.9;\n      vec2 rUvG = uv + n.xy * refrStr * 1.0;\n      vec2 rUvB = uv + n.xy * refrStr * 1.1;\n      \n      // Sample the background (approximated here by regenerating it)\n      vec3 refrBg = vec3(\n        smoothstep(0.0, -0.4, rUvR.y) * glsIce.r * 0.5 + 0.094,\n        smoothstep(0.0, -0.4, rUvG.y) * glsIce.g * 0.5 + 0.125,\n        smoothstep(0.0, -0.4, rUvB.y) * glsIce.b * 0.5 + 0.173\n      );\n      \n      // Fresnel rim glow\n      float fres = pow(1.0 - n.z, 3.0 + iParam2 * 2.0);\n      vec3 rimCol = (i == 0) ? mix(glsLav, glsGld, a.voice) : \n                    (mod(fi, 2.0) == 0.0) ? glsIce : glsPnk;\n      vec3 rim = fres * rimCol * (1.5 + a.pres * 1.5);\n      \n      // Specular highlight from a top-left light\n      vec3 l = normalize(vec3(0.5, 0.7, 1.0));\n      float spec = pow(max(dot(n, l), 0.0), 40.0) * (0.8 + pu * 2.0);\n      \n      // Combine bubble layering\n      float alpha = smoothstep(size, size - 0.005, dist);\n      col = mix(col, refrBg * 0.8 + rim + spec * vec3(1.0, 0.95, 0.9), alpha);\n    }\n  }\n\n  col = max(col, 0.0); col = col/(1.0 + col*0.72);\n  o = vec4(pow(col, vec3(0.88)), 1.0);\n}"
  },
  {
    id: "field-atlas", n: 113, name: "Field Atlas",
    series: "VII", set: "phosphor", setTitle: "Phosphor",
    kit3d: false,
    line: "Mapped routes, field notes, multilingual labels, and material samples situate every number in a specific place.",
    params: [{name: "Scroll", def: 0.3}, {name: "Contours", def: 0.5}],
    reacts: [["sub","Route trace Y-coordinate"],["pres","Route trace X-coordinate"],["air","Field note marker details"],["voice","Draws a prominent mountain peak"],["hit","Impact flashes high elevation areas"]],
    body: "// FIELD ATLAS — A living topographic cartographic map. Domain-warped FBM creates\n// the base terrain, with contour lines drawn at regular height intervals. A ROUTE\n// traces across the map, its waypoints driven by audio (sub and presence). Terrain\n// colors map to elevations. Field notes appear at peaks. The map feels like it is\n// being drawn by the music in real-time.\n\nvec3 atlPap = vec3(0.86, 0.82, 0.73); // #DCD2BB\nvec3 atlRed = vec3(0.71, 0.29, 0.20); // #B44932\nvec3 atlTea = vec3(0.18, 0.44, 0.41); // #2E6F68\nvec3 atlOch = vec3(0.76, 0.55, 0.21); // #C18D35\n\nvoid mainImage(out vec4 o, in vec2 C){\n  Aud a = plajahAudio();\n  float pu = plajahPunch();\n  int OCT = plajahOct();\n  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;\n  float t = iTime * (0.15 + iParam0 * 0.5);\n\n  // Terrain generation via domain warping\n  vec2 warp = vec2(fbm(uv * 2.0 + vec2(t * 0.2, 0.0), 3), \n                   fbm(uv * 2.0 - vec2(0.0, t * 0.15), 3));\n  vec2 q = uv + warp * 0.4;\n  float h = fbm(q * 2.5, OCT);\n  \n  // Voice adds a prominent peak (mountain rising)\n  float peak = exp(-length(uv + vec2(0.2, -0.1)) * 4.0) * a.voice * 0.6;\n  h = clamp(h + peak, 0.0, 1.0);\n  \n  // Base paper with subtle grain texture\n  float grain = h21(uv * 200.0 + t * 5.0);\n  vec3 col = atlPap * (0.92 + 0.08 * grain);\n  \n  // Elevation coloring\n  if (h < 0.35) {\n    col = mix(atlTea, atlPap, smoothstep(0.15, 0.35, h));\n  } else if (h < 0.65) {\n    col = mix(atlPap, atlOch, smoothstep(0.35, 0.65, h));\n  } else {\n    col = mix(atlOch, atlRed, smoothstep(0.65, 0.95, h));\n  }\n  \n  // Contour lines\n  float contourInterval = 20.0 + iParam1 * 10.0;\n  float contourF = fract(h * contourInterval);\n  float contour = smoothstep(0.06, 0.0, min(contourF, 1.0 - contourF));\n  // Thicker index contours\n  float indexContour = step(fract(h * contourInterval / 5.0), 0.1);\n  col = mix(col, vec3(0.15, 0.18, 0.17), contour * (0.3 + 0.3 * indexContour));\n  \n  // Map grid overlay (thin lines)\n  float gridX = smoothstep(0.015, 0.0, abs(fract(uv.x * 8.0) - 0.5));\n  float gridY = smoothstep(0.015, 0.0, abs(fract(uv.y * 8.0) - 0.5));\n  col = mix(col, vec3(0.5, 0.45, 0.4), max(gridX, gridY) * 0.3);\n  \n  // The ROUTE: a dotted line path tracing audio\n  // Sub determines Y, presence determines X\n  float routeX = (comp(a.pres, 0.3) * 2.0 - 1.0) * 0.6;\n  float routeY = (comp(a.sub, 0.3) * 2.0 - 1.0) * 0.4;\n  vec2 routeP = vec2(routeX, routeY);\n  \n  float rDist = length(uv - routeP);\n  // Dotted trail leaving history\n  float trailDot = step(0.6, fract(length(uv * 15.0) - t * 2.0));\n  float trailAlpha = exp(-rDist * 8.0) * trailDot;\n  col = mix(col, atlRed, trailAlpha * (0.6 + a.pres * 0.8));\n  \n  // Field note markers at peaks\n  if (h > 0.7) {\n    float noteCirc = smoothstep(0.02, 0.015, abs(rDist - 0.05));\n    float noteTick = step(0.9, fract(atan(uv.y - routeY, uv.x - routeX) * 2.0));\n    col = mix(col, vec3(0.1), noteCirc * noteTick * 0.5 * (0.5 + a.air));\n  }\n  \n  // Transient impact flashes the highest elevations\n  col += pu * 0.25 * atlPap * smoothstep(0.6, 0.9, h);\n\n  col = max(col, 0.0); col = col/(1.0 + col*0.72);\n  o = vec4(pow(col, vec3(0.88)), 1.0);\n}"
  }
];
