import type { SignatureParam, SignatureWork } from './signatureShaders';

export const SERIES_VII_MANIFESTO: SignatureWork[] = [
  {
    id: "raw-count", n: 102, name: "Raw Count",
    series: "VII", set: "manifesto", setTitle: "Manifesto",
    kit3d: false,
    line: "Sprayed axes, inked marks, crossed-out annotations turn evidence into confrontation.",
    params: [{name: "Tag width", def: 0.35}, {name: "Drip", def: 0.4}],
    reacts: [["sub","Aggressive diagonal slash"], ["pres","FFT bars as spray paint"], ["sib","Crossing-out X marks"], ["voice","Wandering throw-up line"], ["hit","Splatter paint transients"]],
    body: "// RAW COUNT — Sprayed axes, inked marks, crossed-out annotations turn evidence into confrontation.\nvec3 bg = vec3(0.906, 0.875, 0.808);\nvec3 red = vec3(0.937, 0.169, 0.176);\nvec3 blk = vec3(0.067, 0.067, 0.067);\nvec3 blu = vec3(0.157, 0.392, 0.780);\n\nfloat spray(float d, float w) {\n  return smoothstep(w, w*0.1, d) * 0.8 + smoothstep(w*2.5, w*0.8, d) * 0.4 * h11(d*140.0);\n}\n\nvoid mainImage(out vec4 o, in vec2 C) {\n  Aud a = plajahAudio();\n  float pu = plajahPunch();\n  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;\n  vec2 p = uv;\n  vec3 col = bg;\n  \n  // Concrete grain\n  col -= 0.04 * vnoise(p*800.0);\n  \n  // FFT spray bars\n  float xBin = floor((uv.x + 0.8) * 12.0);\n  if(xBin >= 0.0 && xBin <= 20.0) {\n    float e = SPEC(xBin*0.02 + 0.005);\n    float h = -0.4 + e*1.2;\n    float barD = abs(uv.x - (xBin/12.0 - 0.75));\n    float m = spray(barD, 0.015) * step(uv.y, h) * step(-0.5, uv.y);\n    float drip = spray(abs(uv.x - (xBin/12.0 - 0.75 + 0.01*sin(uv.y*20.0))), 0.003) * step(uv.y, -0.5) * step(h - 0.8, uv.y) * e;\n    col = mix(col, blk, clamp(m + drip * iParam1, 0.0, 1.0));\n  }\n  \n  // Sub bass slash\n  float slashD = abs(p.x + p.y + 0.2);\n  col = mix(col, red, spray(slashD, 0.02 + a.sub*0.05) * a.sub);\n  \n  // Sibilance X marks\n  vec2 xp = fract(p * 8.0) - 0.5;\n  float xd = min(abs(xp.x - xp.y), abs(xp.x + xp.y));\n  float xs = spray(xd, 0.04) * step(0.95 - a.sib*0.1, h21(floor(p*8.0)));\n  col = mix(col, blk, clamp(xs * a.sib * 2.0, 0.0, 1.0));\n  \n  // Voice throw-up line\n  float vw = fbm(vec2(iTime*0.5, 0.0), 2) * 0.8 - 0.4;\n  float vd = abs(p.y - vw + sin(p.x*4.0 + iTime)*0.2);\n  col = mix(col, blu, spray(vd, 0.01 + a.voice*0.03) * a.voice * 1.5);\n  \n  // Splatter\n  float splat = h21(p*400.0 + iTime);\n  col = mix(col, red, step(0.98 - pu*0.05, splat) * pu);\n  \n  col = max(col, 0.0); col = col/(1.0 + col*0.72);\n  o = vec4(pow(col, vec3(0.88)), 1.0);\n}"
  },
  {
    id: "one-necessary-line", n: 103, name: "One Necessary Line",
    series: "VII", set: "manifesto", setTitle: "Manifesto",
    kit3d: false,
    line: "A single rule, exact spacing, one meaningful contrast remove everything that does not carry information.",
    params: [{name: "Shift", def: 0.2}],
    reacts: [["sub","Line thickness"], ["pres","Overall audio level drives vertical position"], ["voice","Dominant frequency moves the red dot horizontally"]],
    body: `vec3 hx(int c){ return vec3(float((c>>16)&255), float((c>>8)&255), float(c&255))/255.0; }

// Everything here is a hairline. The restraint is the point, so nothing is allowed to glow,
// blur, or grow a gradient: a mark is either present at full contrast or it is absent.
float hair(float d, float w){ return smoothstep(w, w*0.35, abs(d)); }

void mainImage(out vec4 o, in vec2 C){
  Aud a = plajahAudio(); float pu = plajahPunch();
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;
  vec3 paper = hx(0xFAFAF7), ink = hx(0x111111), muted = hx(0x8B8B86), red = hx(0xD43C2F);
  float pxw = 1.0/iResolution.y;                    // one device pixel: the council's lineWidth

  vec3 col = paper;

  // The rule. One horizontal line, held exactly on the lower third.
  float base = -0.14;
  col = mix(col, ink, hair(uv.y - base, pxw*1.2));

  // Exact spacing: twenty-four ticks, evenly divided, all identical. Only their LENGTH reads.
  for (int i = 0; i < 24; i++){
    float fi = float(i);
    float x = -0.69 + fi*0.06;
    float e = comp(SPEC(0.005 + fi*0.013), 0.30);
    float h = 0.012 + e*0.30*(0.4 + iParam0*1.2);
    float inTick = hair(uv.x - x, pxw*1.1)
                 * step(base, uv.y) * step(uv.y, base + h);
    col = mix(col, ink, inTick);
  }

  // Two quiet registration marks, so the field has a measure without being decorated.
  col = mix(col, muted, hair(uv.y - (base + 0.30), pxw*0.9)*0.55);
  col = mix(col, muted, hair(uv.x + 0.69, pxw*0.9)*0.55);

  // The one meaningful contrast: a single red tick, and it is the loudest bin, nothing else.
  float loud = 0.0; float which = 0.0;
  for (int i = 0; i < 24; i++){
    float e = SPEC(0.005 + float(i)*0.013);
    if (e > loud){ loud = e; which = float(i); }
  }
  float rx = -0.69 + which*0.06;
  float rh = 0.012 + comp(loud, 0.30)*0.30*(0.4 + iParam0*1.2);
  float redTick = hair(uv.x - rx, pxw*1.6)*step(base, uv.y)*step(uv.y, base + rh + 0.02);
  col = mix(col, red, redTick);
  // A transient shortens nothing and adds nothing; it only extends the red mark past the rule.
  col = mix(col, red, hair(uv.x - rx, pxw*1.6)*step(base - 0.05*pu, uv.y)*step(uv.y, base));

  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`
  },
  {
    id: "absolute-contrast", n: 104, name: "Absolute Contrast",
    series: "VII", set: "manifesto", setTitle: "Manifesto",
    kit3d: false,
    line: "No decoration, no chromatic hierarchy: scale, weight, and rhythm carry the entire argument.",
    params: [{name: "Complexity", def: 0.35}],
    reacts: [["sub","Warps the domain noise"], ["pres","Shifts the black/white threshold"], ["voice","Forces bilateral symmetry"], ["hit","Sudden shape transformation"]],
    body: `vec3 hx(int c){ return vec3(float((c>>16)&255), float((c>>8)&255), float(c&255))/255.0; }

float acBar(vec2 p, vec2 c, vec2 half_){ vec2 d = abs(p - c) - half_; return step(max(d.x, d.y), 0.0); }

void mainImage(out vec4 o, in vec2 C){
  Aud a = plajahAudio(); float pu = plajahPunch();
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;
  float asp = iResolution.x/iResolution.y;
  vec3 ink = hx(0x111111), w1 = hx(0xF4F4F4), w2 = hx(0xA9A9A9), w3 = hx(0x686868), w4 = hx(0x393939);
  vec3 col = ink;

  // Everything is rectilinear and everything is one of four values. No hue, no curve, no glow.
  // Rank the spectrum so the argument is ordered rather than merely loud.
  float lead = 0.0;
  for (int i = 0; i < 12; i++) lead = max(lead, SPEC(0.006 + float(i)*0.02));

  // The masthead slab: the largest element on the page, and the only one at full value.
  float head = comp(SPEC(0.008), 0.3);
  col = mix(col, w1, acBar(uv, vec2(-asp*0.5 + 0.44 + 0.0, 0.34), vec2(0.42, 0.045 + head*0.030)));

  // The argument: twelve measures, weight and SCALE carrying the reading. Bars share a baseline
  // and grow up; their VALUE steps down by rank, which is the only hierarchy this office allows.
  for (int i = 0; i < 12; i++){
    float fi = float(i);
    float x = -asp*0.5 + 0.30 + fi*0.135;
    float e = comp(SPEC(0.006 + fi*0.02), 0.30);
    float h = 0.03 + e*0.42*(0.55 + iParam0);
    vec3 v = fi < 3.0 ? w1 : (fi < 6.0 ? w2 : (fi < 9.0 ? w3 : w4));
    col = mix(col, v, acBar(uv, vec2(x, -0.16 + h*0.5), vec2(0.048, h*0.5)));
    // A tick under each, always the same size: the rhythm the bars are measured against.
    col = mix(col, w4, acBar(uv, vec2(x, -0.20), vec2(0.048, 0.004)));
  }

  // A counter-rhythm above: fixed blocks, present or absent, never scaled. Presence is the datum.
  for (int i = 0; i < 24; i++){
    float fi = float(i);
    float x = -asp*0.5 + 0.24 + fi*0.068;
    float on = step(0.34, SPEC(0.004 + fi*0.011));
    col = mix(col, w3, acBar(uv, vec2(x, 0.19), vec2(0.022, 0.016))*on);
  }

  // Two rules, both the council's line weight, dividing head from argument from foot.
  float px = 1.0/iResolution.y;
  col = mix(col, w2, acBar(uv, vec2(0.0, 0.255), vec2(asp*0.46, px*2.0)));
  col = mix(col, w2, acBar(uv, vec2(0.0, -0.245), vec2(asp*0.46, px*2.0)));

  // Foot: fixed-width slugs standing in for set metadata, all one value.
  for (int i = 0; i < 5; i++){
    float fi = float(i);
    col = mix(col, w4, acBar(uv, vec2(-asp*0.5 + 0.34 + fi*0.30, -0.32), vec2(0.10, 0.012)));
  }

  // A transient inverts the leading measure. Contrast is the only device available.
  float flash = step(0.5, pu)*step(0.30, lead);
  col = mix(col, w1 - col, flash*acBar(uv, vec2(-asp*0.5 + 0.30, -0.16), vec2(0.048, 0.24)));

  // SCAN: the surface of a monitor, not a texture applied for taste.
  col *= 1.0 - 0.16*step(0.5, fract(C.y*0.5));
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`
  },
  {
    id: "index-intervention", n: 105, name: "Index Intervention",
    series: "VII", set: "manifesto", setTitle: "Manifesto",
    kit3d: false,
    line: "Information hierarchy is the image; one red intervention directs the eye.",
    params: [{name: "Scroll", def: 0.4}],
    reacts: [["pres","Energy populates the grid"], ["hit","Flashes all cells grey, isolating the red one"]],
    body: `vec3 hx(int c){ return vec3(float((c>>16)&255), float((c>>8)&255), float(c&255))/255.0; }

float band(float d, float w){ return step(abs(d), w); }   // SHARP: no antialiased softness

void mainImage(out vec4 o, in vec2 C){
  Aud a = plajahAudio(); float pu = plajahPunch();
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;
  vec3 bg = hx(0xF6F5F0), fg = hx(0x151515), muted = hx(0x74736E),
       red = hx(0xE12D2D), mid = hx(0x6B6B66), pale = hx(0xC7C6C0);
  float pxw = 1.0/iResolution.y;

  vec3 col = bg;

  // RULES: the horizontal grid the whole page is measured on.
  for (int i = 0; i < 6; i++){
    float y = -0.36 + float(i)*0.144;
    col = mix(col, pale, band(uv.y - y, pxw*1.0));
  }
  // The one heavy rule that separates the head from the field.
  col = mix(col, fg, band(uv.y - 0.40, pxw*2.6));

  // The index itself: a column of sharp bars, ranked, all one weight.
  float lead = 0.0; float leadI = 0.0;
  for (int i = 0; i < 16; i++){
    float e = SPEC(0.006 + float(i)*0.018);
    if (e > lead){ lead = e; leadI = float(i); }
  }
  for (int i = 0; i < 16; i++){
    float fi = float(i);
    float x = -0.70 + fi*0.089;
    float e = comp(SPEC(0.006 + fi*0.018), 0.32);
    float h = 0.02 + e*0.62*(0.5 + iParam0);
    float inBar = band(uv.x - x, 0.026)*step(-0.36, uv.y)*step(uv.y, -0.36 + h);
    // Hierarchy is carried by VALUE, not by hue: the near bars are black, the rest step back.
    vec3 barCol = (fi < 4.0) ? fg : ((fi < 9.0) ? mid : muted);
    col = mix(col, barCol, inBar);
  }

  // The intervention. Exactly one red element on the page, on the leading measure.
  float rx = -0.70 + leadI*0.089;
  float rh = 0.02 + comp(lead, 0.32)*0.62*(0.5 + iParam0);
  col = mix(col, red, band(uv.x - rx, 0.026)*step(-0.36, uv.y)*step(uv.y, -0.36 + rh));
  // and the rule that points at it.
  col = mix(col, red, band(uv.y - (-0.36 + rh + 0.028), pxw*2.2)*step(uv.x, rx + 0.026));

  // Head: three solid blocks standing in for uppercase setting, the Swiss title convention.
  col = mix(col, fg, band(uv.x + 0.52, 0.18)*band(uv.y - 0.455, 0.026));
  col = mix(col, muted, band(uv.x + 0.10, 0.10)*band(uv.y - 0.455, 0.013));
  col = mix(col, red, band(uv.x - 0.62, 0.048)*band(uv.y - 0.455, 0.026)*(0.55 + pu*0.45));

  // Voice pushes a single measured tint into the field, and nothing else moves.
  col = mix(col, mix(col, pale, 0.5), comp(a.voice, 0.40)*0.18*step(uv.y, -0.36));

  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`
  },
  {
    id: "primary-orbit", n: 106, name: "Primary Orbit",
    series: "VII", set: "manifesto", setTitle: "Manifesto",
    kit3d: false,
    line: "Circles, bars, measured primary forms turn quantities into spatial choreography.",
    params: [{name: "Sync", def: 0.3}],
    reacts: [["sub","Circle radius"], ["pres","Rectangle height"], ["sib","Triangle size"], ["voice","Mechanical orbit coupling"], ["hit","Snap forms to 90-degree intervals"]],
    body: "// PRIMARY ORBIT — Circles, bars, measured primary forms turn quantities into spatial choreography.\nfloat sdEquilateralTriangle(in vec2 p, in float r) {\n    const float k = sqrt(3.0);\n    p.x = abs(p.x) - r;\n    p.y = p.y + r/k;\n    if( p.x + k*p.y > 0.0 ) p = vec2(p.x-k*p.y,-k*p.x-p.y)/2.0;\n    p.x -= clamp( p.x, -2.0*r, 0.0 );\n    return -length(p)*sign(p.y);\n}\nfloat sdBox(vec2 p, vec2 b) {\n    vec2 d = abs(p)-b;\n    return length(max(d,0.0)) + min(max(d.x,d.y),0.0);\n}\n\nvoid mainImage(out vec4 o, in vec2 C) {\n  Aud a = plajahAudio();\n  float pu = plajahPunch();\n  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;\n  \n  vec3 bg = vec3(0.937, 0.890, 0.780);\n  vec3 red = vec3(0.847, 0.227, 0.192);\n  vec3 blu = vec3(0.094, 0.353, 0.651);\n  vec3 yel = vec3(0.882, 0.710, 0.180);\n  vec3 ink = vec3(0.094, 0.094, 0.094);\n  \n  // Snap to 90 deg on hit\n  float angleSnap = floor(iTime * 2.0 + pu * 4.0) * 1.5708;\n  \n  float tSync = mix(iTime, floor(iTime*2.0)/2.0, a.voice);\n  \n  float a1 = tSync * 0.8 + angleSnap * 0.1;\n  float a2 = -tSync * 1.2 + angleSnap * 0.2;\n  float a3 = tSync * 0.5 + angleSnap * 0.3;\n  \n  vec2 p1 = vec2(cos(a1), sin(a1)) * 0.15;\n  vec2 p2 = vec2(cos(a2), sin(a2)) * 0.3;\n  vec2 p3 = vec2(cos(a3), sin(a3)) * 0.45;\n  \n  float px = 1.0/iResolution.y;\n  \n  // Red circle\n  float r1 = 0.08 + a.sub * 0.1;\n  float d1 = length(uv - p1) - r1;\n  float m1 = 1.0 - smoothstep(0.0, px*1.5, d1);\n  \n  // Blue rect\n  float h2 = 0.05 + a.pres * 0.15;\n  float d2 = sdBox(rot(a2)*(uv - p2), vec2(0.04, h2));\n  float m2 = 1.0 - smoothstep(0.0, px*1.5, d2);\n  \n  // Yellow tri\n  float s3 = 0.06 + a.sib * 0.1;\n  float d3 = sdEquilateralTriangle(rot(-a3)*(uv - p3), s3);\n  float m3 = 1.0 - smoothstep(0.0, px*1.5, d3);\n  \n  // Thin rules connecting forms\n  float l12 = sdBox(rot(atan(p2.y-p1.y, p2.x-p1.x)) * (uv - (p1+p2)*0.5), vec2(length(p1-p2)*0.5, 0.001));\n  float l23 = sdBox(rot(atan(p3.y-p2.y, p3.x-p2.x)) * (uv - (p2+p3)*0.5), vec2(length(p2-p3)*0.5, 0.001));\n  float lines = max(1.0 - smoothstep(0.0, px*2.0, l12), 1.0 - smoothstep(0.0, px*2.0, l23));\n  \n  // Multiply blend\n  vec3 col = bg;\n  col = mix(col, ink, lines * step(length(p1-p2), 0.35)); \n  \n  if (m1 > 0.5) col *= red;\n  if (m2 > 0.5) col *= blu;\n  if (m3 > 0.5) col *= yel;\n  \n  col = max(col, 0.0); col = col/(1.0 + col*0.72);\n  o = vec4(pow(col, vec3(0.88)), 1.0);\n}"
  },
  {
    id: "velocity-readout", n: 107, name: "Velocity Readout",
    series: "VII", set: "manifesto", setTitle: "Manifesto",
    kit3d: false,
    line: "Oversized numerals, impact timing, and instant comparison prioritize the moment.",
    params: [{name: "Density", def: 0.4}],
    reacts: [["sub","Pulses the central reticle"], ["air","Streak density and motion blur"], ["voice","Lock-on effect and gold flash"], ["hit","Shockwave ring expanding from center"]],
    body: "// VELOCITY READOUT — Oversized numerals, impact timing, and instant comparison prioritize the moment.\nvec3 velInk(float t) {\n  return mix(vec3(0.0, 0.76, 1.0), vec3(1.0, 0.29, 0.17), clamp(t, 0.0, 1.0));\n}\n\nvoid mainImage(out vec4 o, in vec2 C) {\n  Aud a = plajahAudio();\n  float pu = plajahPunch();\n  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;\n  \n  vec3 bg = vec3(0.027, 0.075, 0.133);\n  vec3 wht = vec3(1.0);\n  vec3 gld = vec3(0.961, 0.773, 0.259);\n  \n  float lockOn = smoothstep(0.1, 0.8, a.voice);\n  vec2 p = uv * (1.0 + lockOn * 0.2); // reticle contracts\n  \n  vec3 col = bg;\n  \n  // Motion blur streaks\n  float density = 15.0 + iParam0 * 20.0 + a.air * 10.0;\n  float row = floor(uv.y * density);\n  float rnd = h21(vec2(row, 1.0));\n  float speed = 2.0 + rnd * 5.0 + a.pres * 5.0;\n  float streakX = fract(uv.x * 2.0 - iTime * speed + rnd * 10.0) - 0.5;\n  \n  float e = a.sub + a.low + a.pres + a.air;\n  float activeStreak = step(0.6 - e*0.1, h21(vec2(row, floor(iTime*speed))));\n  \n  float blur = exp(-abs(streakX) * 20.0);\n  vec3 sCol = velInk(rnd + a.pres);\n  col += blur * activeStreak * sCol * 0.5;\n  \n  // Lane geometry\n  float lanes = step(0.98, fract(uv.y * 3.0));\n  col = mix(col, vec3(1.0), lanes * 0.05);\n  \n  // Central reticle\n  float r = length(p);\n  float th = 1.5 / iResolution.y;\n  float reticle = max(\n    smoothstep(th*2.0, 0.0, abs(r - 0.2 - a.sub*0.05)),\n    smoothstep(th*2.0, 0.0, abs(p.x)) * step(abs(p.y), 0.25)\n  );\n  reticle = max(reticle, smoothstep(th*2.0, 0.0, abs(p.y)) * step(abs(p.x), 0.25));\n  \n  vec3 rCol = mix(wht, gld, lockOn);\n  col = mix(col, rCol, reticle);\n  \n  // Quad indicators\n  float ang = atan(p.y, p.x);\n  float quadMask = smoothstep(0.02, 0.04, abs(fract(ang/1.5708) - 0.5));\n  float arcs = smoothstep(th*2.0, 0.0, abs(r - 0.25));\n  \n  float val = (p.x>0.0 && p.y>0.0) ? a.sub :\n              (p.x<0.0 && p.y>0.0) ? a.low :\n              (p.x<0.0 && p.y<0.0) ? a.pres : a.air;\n              \n  float arcActive = step(abs(fract(ang/1.5708 - 0.5)*2.0 - 1.0), val * 2.0);\n  col = mix(col, velInk(val), arcs * quadMask * arcActive);\n  \n  // Shockwave\n  float sw = exp(-abs(r - fract(iTime*2.0 + pu)*0.5) * 40.0) * pu;\n  col += sw * wht;\n  \n  // Scanline overlay\n  col *= 1.0 - 0.2 * sin(C.y * 3.14159);\n  \n  col = max(col, 0.0); col = col/(1.0 + col*0.72);\n  o = vec4(pow(col, vec3(0.88)), 1.0);\n}"
  }
];
