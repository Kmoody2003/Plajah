import { SignatureWork } from './signatureShaders';

export const SERIES_VII_ATELIER: SignatureWork[] = [
  {
    id: 'harmonic-measure',
    n: 96,
    name: 'Harmonic Measure',
    series: 'VII',
    set: 'atelier',
    setTitle: 'Atelier',
    kit3d: false,
    line: 'Proportion, cadence, and contrapuntal series create an ordered score.',
    params: [
      { name: 'Spiral Density', def: 0.5 },
      { name: 'Counterpoint', def: 0.5 }
    ],
    reacts: [
      ['sub', 'Inner coils amplitude'],
      ['pres', 'Mid sweeps presence'],
      ['air', 'Outer curves activity']
    ],
    body: `// Harmonic Measure - CLASSICAL voice
// Proportion, cadence, and contrapuntal series create an ordered score.

vec3 hex(int c) {
    return vec3(float((c>>16)&255), float((c>>8)&255), float(c&255))/255.0;
}

vec3 palette(float id) {
    // Parchment lines #22201D on #EEE8D8
    // Wine highlight #7A263A
    vec3 base = hex(0x22201D);
    vec3 highlight = hex(0x7A263A);
    return mix(base, highlight, step(0.8, id));
}

void mainImage(out vec4 o, in vec2 C) {
    vec2 uv = (C - 0.5 * iResolution.xy) / iResolution.y;
    Aud a = plajahAudio();
    float pu = plajahPunch();
    
    vec3 bg = hex(0xEEE8D8); // Parchment
    // Paper grain
    float grain = vnoise(uv * 800.0 + iTime);
    bg -= grain * 0.05;
    
    vec3 col = bg;
    float phi = 1.618033;
    
    // Draw logarithmic spirals
    float r = length(uv);
    float theta = atan(uv.y, uv.x);
    
    float density = mix(1.0, 3.0, iParam0);
    float counter = mix(0.1, 1.0, iParam1);
    
    // Multiple spiral arms for different audio bands
    for(int i=0; i<5; i++) {
        float fi = float(i);
        float dir = mod(fi, 2.0) == 0.0 ? 1.0 : -1.0;
        
        // Audio mapping to arms
        float audVal = 0.0;
        if(i==0) audVal = comp(a.sub, 0.5);
        if(i==1) audVal = comp(a.low, 0.5);
        if(i==2) audVal = comp(a.voice, 0.5);
        if(i==3) audVal = comp(a.pres, 0.5);
        if(i==4) audVal = comp(a.air, 0.5);
        
        float timeRot = iTime * 0.2 * dir * counter;
        float th = theta + timeRot + fi * (6.28318 / 5.0);
        
        // Logarithmic spiral math: r = a * e^(b * theta)
        // Adjust theta to continuous space
        float b = 0.3 * density;
        float logR = log(r + 0.0001);
        float expectedTh = logR / b;
        
        // Distance to the spiral arm
        float diff = fract((expectedTh - th) / 6.28318 + 0.5) - 0.5;
        diff *= 6.28318 * b * r; // approximate spatial distance
        
        // Thickness pulses with audio
        float thick = 0.002 + audVal * 0.015;
        float line = smoothstep(thick + 0.002, thick, abs(diff));
        
        // Highlight dominant arm
        vec3 armCol = palette(audVal + (i==2 ? 0.9 : 0.0));
        col = mix(col, armCol, line * 0.8);
    }
    
    // Subtle punch impact
    col -= pu * 0.1 * grain;
    
    col = max(col, 0.0);
    col = col / (1.0 + col * 0.2);
    o = vec4(pow(col, vec3(0.88)), 1.0);
}`
  },
  {
    id: 'grand-chiaroscuro',
    n: 97,
    name: 'Grand Chiaroscuro',
    series: 'VII',
    set: 'atelier',
    setTitle: 'Atelier',
    kit3d: true,
    line: 'Sweeping curves, deep shadow, gilded highlights make magnitude physically felt.',
    params: [
      { name: 'Relief Detail', def: 0.5 },
      { name: 'Light Sweep', def: 0.5 }
    ],
    reacts: [
      ['sub', 'Sphere scale'],
      ['pres', 'Relief depth'],
      ['voice', 'Gilded rim light'],
      ['sib', 'Specular sparkles']
    ],
    body: `vec3 hx(int c){ return vec3(float((c>>16)&255), float((c>>8)&255), float(c&255))/255.0; }

vec2 map(vec3 p){
  Aud a = plajahAudio();
  float sub = comp(a.sub, 0.45), pres = comp(a.pres, 0.45);
  // Ornamental relief carved into the form: domain-warped noise, the carved marble of it.
  float detail = mix(1.6, 4.2, iParam0);
  vec3 q = p*detail;
  float f = fbm3(q + fbm3(q*0.7 + iTime*0.12, 3), 4);
  float body = sdSphere(p, 0.92 + sub*0.14) - (f - 0.5)*(0.07 + pres*0.11);
  // A sweeping drape behind, which is what supplies the baroque diagonal.
  vec3 dp = p - vec3(0.15, -0.55, 1.15);
  dp.xy = r2(0.5)*dp.xy;
  float drape = sdTorus(vec3(dp.x, dp.y, dp.z*0.55), vec2(2.15, 0.42));
  return opU(vec2(body, 1.0), vec2(drape, 2.0));
}

void mainImage(out vec4 o, in vec2 C){
  Aud a = plajahAudio(); float pu = plajahPunch();
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;
  vec3 gold = hx(0xD4A84E), wine = hx(0x8B2744), cream = hx(0xE5D2A6);

  vec3 ro = vec3(0.15, 0.30, -3.90);
  vec3 rd = normalize(vec3(uv, 1.55));

  // The ground of the picture is near-black, but warmed on one side so it reads as unlit air.
  vec3 col = vec3(0.017, 0.012, 0.017);
  col += vec3(0.042, 0.026, 0.016)*exp(-length(uv - vec2(-0.42, 0.30))*2.9);

  vec2 h = raymarch(ro, rd, 18.0);
  if (h.y > 0.0){
    vec3 p = ro + rd*h.x;
    vec3 n = calcNormal(p);
    // One hard key, swept by hand or by the clock. Everything else is bounce.
    float sweep = mix(-1.1, 1.1, iParam1) + iTime*0.16;
    vec3 lp = vec3(sin(sweep)*3.0 - 1.5, 2.5, cos(sweep)*2.0 - 2.8);
    vec3 l = normalize(lp - p);
    float dif = max(dot(n, l), 0.0);
    dif *= mix(0.12, 1.0, softShadow(p + n*0.02, l, 0.04, 12.0, 9.0));
    float ao = calcAO(p, n);
    float voice = comp(a.voice, 0.45);

    vec3 base = h.y < 1.5 ? mix(vec3(0.13, 0.10, 0.085), gold*0.55, 0.40) : wine*0.30;
    col  = base*(0.03 + 1.45*dif*dif)*ao;
    col += gold*ggx(n, -rd, l, 0.26)*(1.6 + a.sib*3.0);
    // The gilding: a rim that only exists where the form turns away from the eye.
    col += gold*pow(1.0 - max(dot(n, -rd), 0.0), 3.0)*(0.35 + voice*1.5);
    col += cream*pow(max(dot(n, l), 0.0), 48.0)*0.85;
    col += wine*(1.0 - ao)*0.16;
    col = mix(col, col*0.30, 1.0 - exp(-h.x*h.x*0.005));
  }

  col += gold*pu*0.09;
  col = aces(col*0.92);
  // The shadow is the subject, so the vignette is heavy and deliberate.
  col *= 1.0 - smoothstep(0.30, 1.15, length(uv))*0.78;
  o = vec4(pow(col, vec3(0.4545)), 1.0);
}`
  },
  {
    id: 'constellation-map',
    n: 98,
    name: 'Constellation Map',
    series: 'VII',
    set: 'atelier',
    setTitle: 'Atelier',
    kit3d: false,
    line: 'Routes, rings, luminous nodes gather separate measures into a dignified shared whole.',
    params: [
      { name: 'Star Count', def: 0.5 },
      { name: 'Constellation Range', def: 0.5 }
    ],
    reacts: [
      ['sub', 'Lower constellations'],
      ['air', 'Upper constellations'],
      ['punch', 'Flare connections']
    ],
    body: `vec3 hx(int c){ return vec3(float((c>>16)&255), float((c>>8)&255), float(c&255))/255.0; }

float cRing(vec2 p, float r, float w){ return smoothstep(w, 0.0, abs(length(p) - r)); }
float cSeg(vec2 p, vec2 a, vec2 b, float w){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba)/max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return smoothstep(w, 0.0, length(pa - ba*h));
}
// A facet, not a dot: the council's mark for this voice is cut, not printed.
float cFacet(vec2 p, float r){
  float d = max(abs(p.x)*0.866 + abs(p.y)*0.5, abs(p.y));
  return smoothstep(r, r*0.25, d);
}
vec2 cNode(int i, float t, float rad){
  float fi = float(i);
  float ang = fi/12.0*6.2831853 + t;
  float e = SPEC(0.008 + fi*0.021);
  return vec2(cos(ang), sin(ang))*(rad + e*0.085);
}

void mainImage(out vec4 o, in vec2 C){
  Aud a = plajahAudio(); float pu = plajahPunch();
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;
  vec3 bg = hx(0x171329), gold = hx(0xD5AC4E), purple = hx(0x744B91),
       teal = hx(0x1E8A8C), rose = hx(0xB8525A), cream = hx(0xF5EAD0);

  // Ground: the deep blue-violet, lifted slightly at the centre so the ring sits in a space.
  vec3 col = bg*(1.0 + 0.22*exp(-length(uv)*2.2));
  col += (vnoise(C*1.7) - 0.5)*0.022;                     // GRAIN

  float t = iTime*0.10;
  float rad = 0.30 + iParam0*0.12;

  // Concentric measures. Each ring answers to its own part of the spectrum.
  for (int i = 0; i < 4; i++){
    float fi = float(i);
    float e = comp(SPEC(0.014 + fi*0.055), 0.35);
    float r = rad*(0.42 + fi*0.30);
    vec3 c = i == 0 ? gold : (i == 1 ? teal : (i == 2 ? purple : rose));
    col += c*cRing(uv, r, 0.0028 + e*0.006)*(0.30 + e*1.9);
  }

  // Routes: every node reaches across to the far side, which is what makes it one whole
  // rather than twelve separate readings.
  float pres = comp(a.pres, 0.30);
  for (int i = 0; i < 12; i++){
    vec2 A = cNode(i, t, rad);
    vec2 B = cNode((i + 5) - 12*((i + 5)/12), t, rad);
    float e = SPEC(0.008 + float(i)*0.021);
    col += mix(purple, teal, fract(float(i)*0.37))
         * cSeg(uv, A, B, 0.0022 + e*0.004)*(0.16 + e*1.15 + pres*0.35);
  }

  // The nodes themselves, cut as facets and lit from within.
  for (int i = 0; i < 12; i++){
    vec2 A = cNode(i, t, rad);
    float e = comp(SPEC(0.008 + float(i)*0.021), 0.28);
    float s = 0.016 + e*0.020;
    col += gold*cFacet(uv - A, s)*(0.65 + e*2.4);
    col += cream*cFacet(uv - A, s*0.34)*(0.5 + e*1.6);
    col += gold*(0.0009 + e*0.0032)/(length(uv - A) + 0.055);   // halo, kept tight
  }

  // A slow ceremonial sweep, and the centre holding the whole.
  float sweepAng = atan(uv.y, uv.x);
  float sweep = smoothstep(0.9, 1.0, cos(sweepAng - iTime*0.45));
  col += teal*sweep*smoothstep(rad*1.25, 0.0, length(uv))*(0.05 + a.air*0.26);
  col += cream*cFacet(uv, 0.020 + pu*0.012)*(0.55 + pu*1.5);

  // The council states its palette in sRGB hex, and this work paints with those values directly
  // rather than lighting a surface. Gamma-encoding here would lift the #171329 ground to a mid
  // lavender — the deep blue-violet is most of the identity, so the frame stays in display space.
  col *= 1.0 - smoothstep(0.55, 1.30, length(uv))*0.42;
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`
  },
  {
    id: 'measured-poise',
    n: 99,
    name: 'Measured Poise',
    series: 'VII',
    set: 'atelier',
    setTitle: 'Atelier',
    kit3d: false,
    line: 'Fine rules, generous margins, footnotes, and selective color make evidence feel considered.',
    params: [
      { name: 'Trace Speed', def: 0.5 },
      { name: 'Amplitude Scale', def: 0.5 }
    ],
    reacts: [
      ['sub', 'Line 1 trace'],
      ['pres', 'Line 4 trace'],
      ['voice', 'Selective color trigger']
    ],
    body: `vec3 hx(int c){ return vec3(float((c>>16)&255), float((c>>8)&255), float(c&255))/255.0; }

float mpRule(vec2 p, float y, float w){ return smoothstep(w, 0.0, abs(p.y - y)); }
float mpTick(vec2 p, float x, float y0, float y1, float w){
  return smoothstep(w, 0.0, abs(p.x - x)) * step(y0, p.y) * step(p.y, y1);
}

void mainImage(out vec4 o, in vec2 C){
  Aud a = plajahAudio(); float pu = plajahPunch();
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;
  float asp = iResolution.x/iResolution.y;
  vec3 paper = hx(0xF2EFE8), ink = hx(0x211D20), muted = hx(0x756D73),
       purple = hx(0x7B2CBF), teal = hx(0x00A7B5), rose = hx(0xC84C58), ochre = hx(0xC79B32);
  float px = 1.0/iResolution.y;

  // A warm sheet with a little tooth, and a page edge rather than a bleed.
  vec3 col = paper - vec3(0.014, 0.012, 0.010)*fbm(uv*9.0, 3);
  col -= vec3(0.012)*vnoise(C*1.9);

  // Generous margins. The measure is narrow on purpose: this desk sets short lines.
  float mL = -asp*0.5 + 0.34, mR = asp*0.5 - 0.20;
  float inMeasure = step(mL, uv.x)*step(uv.x, mR);

  // The baseline grid the whole page hangs from — hairlines, never a heavy rule.
  for (int i = 0; i < 7; i++){
    float y = 0.30 - float(i)*0.075;
    col = mix(col, muted, mpRule(uv, y, px*0.9)*0.30*inMeasure);
  }
  // One heavy rule under the head, and one at the foot above the notes.
  col = mix(col, ink, mpRule(uv, 0.355, px*2.2)*inMeasure);
  col = mix(col, muted, mpRule(uv, -0.315, px*1.1)*inMeasure*0.75);

  // The evidence: a tick series along the measure, each answering its own bin. TICK is this
  // council's mark, so the data is a set of rules, not bars.
  float lead = 0.0; float leadX = 0.0;
  for (int i = 0; i < 26; i++){
    float fi = float(i);
    float t = fi/25.0;
    float x = mix(mL + 0.02, mR - 0.02, t);
    float e = comp(SPEC(0.005 + fi*0.012), 0.32);
    float h = 0.02 + e*0.26;
    col = mix(col, ink, mpTick(uv, x, -0.30, -0.30 + h, px*1.3)*0.88);
    if (e > lead){ lead = e; leadX = x; }
  }
  // Selective colour: exactly one measure is picked out, and a hairline leader points at it.
  float leadH = 0.02 + comp(lead, 0.32)*0.26;
  col = mix(col, purple, mpTick(uv, leadX, -0.30, -0.30 + leadH + 0.012, px*2.0));
  col = mix(col, purple, mpRule(uv, -0.30 + leadH + 0.012, px*1.0)*step(uv.x, leadX)*step(mL, uv.x)*0.55);

  // Set text: the head, a standfirst, and a body column. Blocks stand in for setting, sized so
  // the page reads as a page rather than as a diagram of one.
  for (int i = 0; i < 3; i++){
    float y = 0.245 - float(i)*0.052;
    float w = i == 0 ? 0.52 : (i == 1 ? 0.44 : 0.48);
    float bar = step(mL + 0.02, uv.x)*step(uv.x, mL + 0.02 + w)*step(y, uv.y)*step(uv.y, y + 0.028);
    col = mix(col, ink, bar*(i == 0 ? 0.92 : 0.30));
  }
  for (int i = 0; i < 6; i++){
    float y = 0.06 - float(i)*0.036;
    float w = 0.40 + 0.14*fract(sin(float(i)*7.13)*43758.5453);
    float bar = step(mL + 0.02, uv.x)*step(uv.x, mL + 0.02 + w)*step(y, uv.y)*step(uv.y, y + 0.013);
    col = mix(col, muted, bar*0.55);
  }

  // Footnotes in the lower margin, and a marginal note in the outer one.
  for (int i = 0; i < 3; i++){
    float y = -0.345 - float(i)*0.026;
    float w = 0.26 - float(i)*0.05;
    float bar = step(mL + 0.02, uv.x)*step(uv.x, mL + 0.02 + w)*step(y, uv.y)*step(uv.y, y + 0.009);
    vec3 c = i == 0 ? rose : muted;
    col = mix(col, c, bar*0.6);
  }
  float marginal = step(mL - 0.26, uv.x)*step(uv.x, mL - 0.06)
                 * step(0.11, uv.y)*step(uv.y, 0.125);
  col = mix(col, teal, marginal*(0.35 + comp(a.voice, 0.4)*0.5));

  // A transient lifts one ochre reference mark in the outer margin. Nothing else moves.
  col = mix(col, ochre, mpTick(uv, mR + 0.06, 0.0, 0.0 + 0.05 + pu*0.06, px*2.4)*0.8);

  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`
  },
  {
    id: 'quiet-evidence',
    n: 100,
    name: 'Quiet Evidence',
    series: 'VII',
    set: 'atelier',
    setTitle: 'Atelier',
    kit3d: false,
    line: 'Imperfect pressure, handmade dots, and quiet annotation make the dataset feel observed.',
    params: [
      { name: 'Bleed Amount', def: 0.5 },
      { name: 'Ink Spacing', def: 0.5 }
    ],
    reacts: [
      ['sub', 'Large slow bleeds'],
      ['air', 'Tiny precise dots'],
      ['voice', 'Wandering line']
    ],
    body: `vec3 hx(int c){ return vec3(float((c>>16)&255), float((c>>8)&255), float(c&255))/255.0; }

// Ink sits unevenly: a mark is darker where the nib pressed and frays where it lifted.
float inkDot(vec2 p, vec2 c, float r, float seed){
  float d = length(p - c);
  float edge = r*(0.86 + 0.30*vnoise(vec2(atan(p.y - c.y, p.x - c.x)*2.4, seed*7.0)));
  float m = smoothstep(edge, edge*0.55, d);
  return m*(0.72 + 0.28*vnoise((p - c)*90.0 + seed*13.0));
}
float inkRule(vec2 p, float y, float w, float seed){
  float wobble = (vnoise(vec2(p.x*3.2, seed)) - 0.5)*0.006;
  return smoothstep(w, 0.0, abs(p.y - y - wobble))*(0.62 + 0.38*vnoise(vec2(p.x*70.0, seed*3.0)));
}

void mainImage(out vec4 o, in vec2 C){
  Aud a = plajahAudio(); float pu = plajahPunch();
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;
  vec3 paper = hx(0xEEE9DD), ink = hx(0x1D2525), red = hx(0xA33E32),
       teal = hx(0x315E5B), ochre = hx(0xB4863F);

  // Laid paper: a warm ground with fibre and a faint tint towards the edges.
  vec3 col = paper;
  col -= vec3(0.030, 0.032, 0.028)*fbm(uv*7.0, 3)*0.55;
  col -= vec3(0.020)*vnoise(C*2.1);
  col *= 1.0 - smoothstep(0.35, 1.05, length(uv))*0.10;

  float lift = 0.34;                                       // the baseline the series sits on
  // The observed series: eighteen readings, each a pressed dot with a stem down to the rule.
  for (int i = 0; i < 18; i++){
    float fi = float(i);
    float x = -0.72 + fi*0.085;
    float e = comp(SPEC(0.006 + fi*0.016), 0.30);
    float y = -lift + e*0.62;
    vec2 c = vec2(x, y);
    float seed = fi*1.37;
    // Stem first, so the dot presses over it.
    float stem = smoothstep(0.0022, 0.0, abs(uv.x - x))*step(-lift, uv.y)*step(uv.y, y);
    col = mix(col, ink, stem*0.30*(0.6 + 0.4*vnoise(vec2(uv.y*80.0, seed))));
    float dot = inkDot(uv, c, 0.014 + e*0.016, seed);
    vec3 markInk = i == 11 ? red : (fract(fi*0.5) > 0.4 ? ink : teal);
    col = mix(col, markInk, clamp(dot*1.05, 0.0, 1.0));
  }

  // The rule the reader measures against, drawn by hand and therefore not quite straight.
  col = mix(col, ink, inkRule(uv, -lift, 0.0022, 3.1)*0.85);
  // Two quiet annotations: a threshold in ochre and a note-mark that answers the transient.
  col = mix(col, ochre, inkRule(uv, -lift + 0.34, 0.0013, 8.7)*0.45);
  vec2 note = vec2(0.60, 0.30);
  col = mix(col, red, inkDot(uv, note, 0.010 + pu*0.014, 21.0)*(0.55 + pu*0.45));
  // Marginal tick marks: the observer counting.
  for (int i = 0; i < 5; i++){
    float fi = float(i);
    float y = -lift + 0.085 + fi*0.085;
    float tick = smoothstep(0.0016, 0.0, abs(uv.y - y))*smoothstep(0.055, 0.0, abs(uv.x + 0.78));
    col = mix(col, ink, tick*0.40);
  }

  // Voice bleeds a faint wash, the way a wet brush would.
  col = mix(col, mix(col, teal, 0.30), comp(a.voice, 0.40)*0.35*smoothstep(0.9, 0.0, length(uv - vec2(0.0, -lift))));
  o = vec4(pow(clamp(col, 0.0, 1.0), vec3(0.98)), 1.0);
}`
  },
  {
    id: 'terrain-signal',
    n: 101,
    name: 'Terrain Signal',
    series: 'VII',
    set: 'atelier',
    setTitle: 'Atelier',
    kit3d: false,
    line: 'Contour, elevation, and layered terrain make relationships feel geographic.',
    params: [
      { name: 'Contour Density', def: 0.5 },
      { name: 'Drift Speed', def: 0.5 }
    ],
    reacts: [
      ['sub', 'Overall elevation boost'],
      ['pres', 'Terrain peaks'],
      ['voice', 'Prominent singular mountain']
    ],
    body: `vec3 hx(int c){ return vec3(float((c>>16)&255), float((c>>8)&255), float(c&255))/255.0; }

// Elevation. Ridged noise gives the land a spine instead of the soft blobs plain fbm produces.
float tsElev(vec2 p, float lift){
  float e = 0.0, amp = 0.5;
  for (int i = 0; i < 5; i++){
    float n = vnoise(p);
    n = 1.0 - abs(n*2.0 - 1.0);          // ridged
    e += amp*n*n;
    p = p*2.03 + 11.7;
    amp *= 0.5;
  }
  return e*(0.75 + lift*0.5);
}

void mainImage(out vec4 o, in vec2 C){
  Aud a = plajahAudio(); float pu = plajahPunch();
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;
  vec3 deep = hx(0x102924), pale = hx(0xEAF3DA), green = hx(0xA8D59B),
       ochre = hx(0xE7C76E), teal = hx(0x65B4A4), coral = hx(0xD78062);

  // The survey drifts slowly north; the low band lifts the whole landmass.
  vec2 p = uv*(2.6 - iParam0*1.2) + vec2(iTime*0.035, -iTime*0.018);
  float lift = comp(a.low, 0.35);
  float h = tsElev(p, lift);

  // Hypsometric tint: sea, lowland, upland, ridge — the reading a real elevation map gives.
  vec3 col = deep;
  col = mix(col, teal*0.55,  smoothstep(0.16, 0.30, h));
  col = mix(col, green*0.85, smoothstep(0.30, 0.50, h));
  col = mix(col, ochre,      smoothstep(0.50, 0.70, h));
  col = mix(col, pale,       smoothstep(0.70, 0.88, h));

  // Relief shading from the gradient of the field, so the land has a light direction.
  vec2 e = vec2(2.0/iResolution.y, 0.0);
  float hx1 = tsElev(p + e.xy, lift), hy1 = tsElev(p + e.yx, lift);
  vec3 n = normalize(vec3(h - hx1, 0.014, h - hy1));
  float lam = clamp(dot(n, normalize(vec3(-0.55, 0.7, -0.45))), 0.0, 1.0);
  col *= 0.62 + 0.55*lam;

  // Contours. fwidth keeps every line one pixel wide however steep the ground is — without it
  // flat country grows fat bands and cliffs lose their lines entirely.
  float bands = 16.0 + floor(iParam1*18.0);
  float band = h*bands;
  float line = abs(fract(band) - 0.5)/max(fwidth(band), 1e-4);
  col = mix(col, pale, (1.0 - smoothstep(0.6, 1.4, line))*0.34);
  // Index contours: every fifth line is heavier, the way a printed map marks its counting.
  float idx = band/5.0;
  float major = abs(fract(idx) - 0.5)/max(fwidth(idx), 1e-4);
  col = mix(col, pale, (1.0 - smoothstep(0.5, 1.2, major))*0.55);

  // A survey traverse crossing the sheet, with stations on it — the geographic relationship the
  // premise is actually about, rather than terrain for its own sake.
  float route = abs(uv.y - (sin(uv.x*2.1 + iTime*0.12)*0.13 - 0.04));
  col = mix(col, coral, (1.0 - smoothstep(0.004, 0.010, route))*(0.5 + comp(a.pres, 0.3)*0.5));
  for (int i = 0; i < 7; i++){
    float fi = float(i);
    float sx = -0.72 + fi*0.24;
    vec2 st = vec2(sx, sin(sx*2.1 + iTime*0.12)*0.13 - 0.04);
    float d = length(uv - st);
    float ev = comp(SPEC(0.01 + fi*0.03), 0.3);
    col = mix(col, pale, (1.0 - smoothstep(0.008, 0.013, d))*(0.6 + ev*0.4));
    col += coral*(0.0016 + ev*0.006)/(d + 0.05);
  }

  // Air lifts a haze over the low ground; a transient flares the ridges.
  col = mix(col, col + teal*0.10, comp(a.air, 0.4)*smoothstep(0.5, 0.0, h));
  col += pale*pu*0.10*smoothstep(0.62, 0.9, h);

  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`
  }
];
