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
    body: `// Measured Poise - EDITORIAL voice
// Fine rules, generous margins, footnotes, and selective color make evidence feel considered.

vec3 hex(int c) {
    return vec3(float((c>>16)&255), float((c>>8)&255), float(c&255))/255.0;
}

void mainImage(out vec4 o, in vec2 C) {
    vec2 uv = C / iResolution.xy;
    vec2 centered = (C - 0.5 * iResolution.xy) / iResolution.y;
    Aud a = plajahAudio();
    
    vec3 bg = hex(0xF2EFE8); // Cream paper
    vec3 ink = hex(0x211D20); // Fine ink
    vec3 accent = hex(0x7B2CBF); // Editorial purple
    
    // Paper texture
    float grain = vnoise(centered * 500.0);
    bg -= grain * 0.03;
    
    vec3 col = bg;
    
    // Generous margins
    float marginX = 0.15;
    float marginY = 0.15;
    
    if(uv.x > marginX && uv.x < 1.0 - marginX && uv.y > marginY && uv.y < 1.0 - marginY) {
        
        float speed = mix(0.5, 2.0, iParam0);
        float ampScale = mix(0.01, 0.05, iParam1);
        
        // Find loudest band for selective color
        float bands[6];
        bands[0] = comp(a.sub, 0.5);
        bands[1] = comp(a.low, 0.5);
        bands[2] = comp(a.voice, 0.5);
        bands[3] = comp(a.pres, 0.5);
        bands[4] = comp(a.sib, 0.5);
        bands[5] = comp(a.air, 0.5);
        
        int maxId = 0;
        float maxVal = bands[0];
        for(int j=1; j<6; j++) {
            if(bands[j] > maxVal) {
                maxVal = bands[j];
                maxId = j;
            }
        }
        
        // 6 horizontal ruled lines
        for(int i=0; i<6; i++) {
            float fi = float(i);
            // Modular scale spacing
            float baseY = marginY + (1.0 - 2.0*marginY) * (fi / 5.0);
            
            // Seismograph displacement
            // We use fbm combined with audio
            float trackX = uv.x * 10.0 - iTime * speed;
            float noiseT = fbm(vec2(trackX, fi * 10.0), 3);
            
            float displacement = (noiseT - 0.5) * bands[i] * ampScale * 5.0;
            float lineY = baseY + displacement;
            
            float dist = abs(uv.y - lineY);
            // Fine rule thickness
            float thickness = 0.001;
            float lineAlpha = smoothstep(thickness + 0.002, thickness, dist);
            
            vec3 lineCol = (i == maxId) ? accent : ink;
            col = mix(col, lineCol, lineAlpha);
            
            // Dot markers at peaks
            float peakCheck = fbm(vec2(trackX * 5.0, fi * 10.0), 3);
            if (peakCheck > 0.8 && bands[i] > 0.3) {
                float dotDist = length(vec2(uv.x, uv.y) - vec2(uv.x, lineY));
                float dotAlpha = smoothstep(0.004, 0.002, dotDist);
                col = mix(col, lineCol, dotAlpha);
            }
        }
        
        // Margin bounding box lines
        float boxAlpha = 0.0;
        boxAlpha += smoothstep(0.002, 0.0, abs(uv.x - marginX));
        boxAlpha += smoothstep(0.002, 0.0, abs(uv.x - (1.0 - marginX)));
        col = mix(col, ink, boxAlpha * 0.2); // Subtle bounds
    }
    
    col = max(col, 0.0);
    o = vec4(pow(col, vec3(0.88)), 1.0);
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
    body: `// Terrain Signal - TOPOGRAPHIC voice
// Contour, elevation, and layered terrain make relationships feel geographic.

vec3 hex(int c) {
    return vec3(float((c>>16)&255), float((c>>8)&255), float(c&255))/255.0;
}

void mainImage(out vec4 o, in vec2 C) {
    vec2 uv = (C - 0.5 * iResolution.xy) / iResolution.y;
    Aud a = plajahAudio();
    
    vec3 bg = hex(0x102924); // Dark green background
    vec3 contourCol = hex(0xA8D59B); // Green-tinted lines
    vec3 warmPeak = hex(0xE7C76E); // Warm peaks
    vec3 riverCol = hex(0x65B4A4); // Blue-green rivers
    
    float density = mix(10.0, 40.0, iParam0);
    float speed = mix(0.1, 0.5, iParam1);
    
    // Drifting landscape
    vec2 pos = uv * 2.0 + vec2(iTime * speed * 0.5, iTime * speed * 0.3);
    
    // Base FBM terrain
    float h = fbm(pos, 4);
    h += fbm(pos * 2.0, 3) * 0.5;
    h += fbm(pos * 4.0, 2) * 0.25;
    h *= 0.5; // Normalize somewhat
    
    // Audio influences elevation
    float subVol = comp(a.sub, 0.5);
    float presVol = comp(a.pres, 0.5);
    float voiceVol = comp(a.voice, 0.5);
    
    h += subVol * 0.2; // Sub raises overall elevation
    h += presVol * 0.3 * smoothstep(0.4, 0.8, fbm(pos*3.0, 3)); // Presence adds peaks
    
    // Voice mountain
    float mountain = 1.0 - smoothstep(0.0, 0.5, length(uv));
    h += mountain * voiceVol * 0.5;
    
    vec3 col = bg;
    
    // Contour lines
    float contourVal = h * density;
    float line = fract(contourVal);
    
    // Calculate gradient for line thickness (steep = close = thin)
    // We approximate derivative via fwidth or finite difference (fwidth not available in pure shader without extension, using manual offset)
    vec2 eps = vec2(0.01, 0.0);
    float hx = (fbm(pos + eps, 4) - h) / eps.x;
    float hy = (fbm(pos + eps.yx, 4) - h) / eps.x;
    float slope = length(vec2(hx, hy)) + 0.1;
    
    float thickness = 0.1 / slope; // Thicker where flat
    thickness = clamp(thickness, 0.02, 0.15);
    
    float contourAlpha = smoothstep(thickness, 0.0, min(line, 1.0-line));
    
    // Elevation color shift
    vec3 currentLineCol = mix(contourCol, warmPeak, smoothstep(0.3, 1.0, h));
    col = mix(col, currentLineCol, contourAlpha);
    
    // Rivers form in deep valleys (where h is low)
    float valley = smoothstep(0.2, 0.0, h) * smoothstep(0.8, 1.0, fbm(pos*5.0, 3));
    col = mix(col, riverCol, valley * 0.6);
    
    col = max(col, 0.0);
    col = aces(col * 0.90);
    o = vec4(pow(col, vec3(0.88)), 1.0);
}`
  }
];
