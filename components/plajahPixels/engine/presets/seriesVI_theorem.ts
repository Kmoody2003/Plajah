import { SignatureWork } from './signatureShaders';

export const SERIES_VI_THEOREM: SignatureWork[] = [
  {
    id: "quantum-orbital",
    n: 85,
    name: "Quantum Orbital",
    series: "VI",
    set: "axiom",
    setTitle: "Axiom",
    kit3d: false,
    line: "Hydrogen-like electron probability clouds, spherical harmonics Ylm, quantum number-driven lobes, voice→orbital mixing.",
    params: [{"name":"Probability","def":0.4},{"name":"Orbit","def":0.3},{"name":"Glow","def":0.5}],
    reacts: [["sub","Quantum number transitions"],["low","Spin rate"],["pres","Cloud density"],["voice","Orbital mixing"],["hit","Flashes the probability nodes"]],
    body: `// QUANTUM ORBITAL — Hydrogen-like electron probability clouds mapped to 2D
// using spherical harmonics Ylm, where audio drives the state transitions.
vec3 qInk(float t){ return ramp(vec3(0.05,0.1,0.2), vec3(0.2,0.4,0.8), vec3(0.8,0.9,1.0), t); }

float Ylm(float l, float m, vec3 p){
  float r = max(length(p), 1e-4);
  float theta = acos(p.z/r);
  float phi = atan(p.y, p.x);
  float val = cos(m*phi) * sin(l*theta) * exp(-r*(0.5 + iParam0*0.5));
  return val*val;
}

void mainImage(out vec4 o, in vec2 C){
  Aud a = plajahAudio(); float pu = plajahPunch();
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;
  
  float t = iTime*(0.2 + iParam1*0.3) + comp(a.low, 0.4)*0.5;
  vec3 ro = vec3(0.0, 0.0, -10.0);
  vec3 rd = normalize(vec3(uv, 1.0));
  
  mat2 rx = rot(t*0.3), ry = rot(t*0.5);
  ro.xz *= rx; ro.yz *= ry;
  rd.xz *= rx; rd.yz *= ry;
  
  float l = 2.0 + floor(comp(a.sub, 0.5)*3.0);
  float m = 1.0 + floor(a.voice*2.0);
  
  float d = 0.0;
  for(int i=0; i<40; i++){
    vec3 p = ro + rd * float(i)*0.4;
    float psi2 = Ylm(l, m, p) * 15.0;
    float psi2_other = Ylm(l+1.0, m-1.0, vec3(p.xz*rot(iTime), p.y).xzy) * (10.0 + a.voice*20.0);
    d += (psi2 + psi2_other) * 0.05 * (0.5 + a.pres*1.5);
  }
  
  vec3 col = qInk(d * (0.3 + iParam2*0.5)) * d * (0.5 + pu);
  col = max(col, 0.0); col = col/(1.0+col*0.72);
  o = vec4(pow(col, vec3(0.88)), 1.0);
}`
  },
  {
    id: "lorenz-chaos",
    n: 86,
    name: "Lorenz Chaos",
    series: "VI",
    set: "axiom",
    setTitle: "Axiom",
    kit3d: false,
    line: "Strange attractor trajectory, projecting chaotic parameter shifts onto 2D with velocity-based trails.",
    params: [{"name":"Sigma","def":0.5},{"name":"Trail","def":0.4}],
    reacts: [["sub","Expands the attractor boundary"],["low","Pulls the beta parameter"],["pres","Brightens the trails"],["voice","Accelerates the path integration"],["hit","Flashes the dense regions"]],
    body: `// LORENZ CHAOS — Strange attractor integrated per-pixel with audio-driven parameters.
vec3 lzInk(float t){ return ramp(vec3(0.01,0.05,0.1), vec3(0.8,0.2,0.1), vec3(1.0,0.8,0.4), t); }
vec3 lorenz(vec3 p, float s, float r, float b){
  return vec3(s*(p.y-p.x), p.x*(r-p.z)-p.y, p.x*p.y - b*p.z);
}
// Centre the attractor, spin it about the vertical, and flatten to the x-z plane, which is
// the view the butterfly actually reads in.
vec2 lzProj(vec3 q, mat2 rt, float sc){
  vec3 c = q - vec3(0.0, 0.0, 25.0);
  vec2 sp = c.xy * rt;
  return vec2(sp.x, c.z) * sc;
}

void mainImage(out vec4 o, in vec2 C){
  Aud a = plajahAudio(); float pu = plajahPunch();
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;
  
  float s = 10.0 + comp(a.sub, 0.4)*10.0 + iParam0*5.0;
  float r = 28.0;
  float b = 2.666 + a.low*1.5;
  float dt = 0.013 + a.voice*0.006;
  
  vec3 p = vec3(0.1, 0.0, 0.0);
  float sum = 0.0;
  
  mat2 rt = rot(iTime*0.2);
  float sc = 0.016;
  // Trail widens the glow rather than lengthening the path, so the step budget stays fixed.
  float soft = 0.00022 + (1.0 - iParam1)*0.0016;
  vec2 sa = lzProj(p, rt, sc);
  
  for(int i=0; i<150; i++){
    vec3 nxt = p + lorenz(p, s, r, b) * dt;
    vec2 sb = lzProj(nxt, rt, sc);
    
    vec2 pa = uv - sa, ba = sb - sa;
    float h = clamp(dot(pa, ba)/max(dot(ba, ba), 1e-9), 0.0, 1.0);
    float d = length(pa - ba*h);
    
    sum += 0.00045 * (0.6 + a.pres*1.4) / (d*d + soft);
    p = nxt; sa = sb;
  }
  
  vec3 col = lzInk(sum * 0.30) * sum * 0.30 * (1.0 + pu);
  col = max(col, 0.0); col = col/(1.0+col*0.72);
  o = vec4(pow(col, vec3(0.88)), 1.0);
}`
  },
  {
    id: "calabi-yau",
    n: 87,
    name: "Calabi-Yau",
    series: "VI",
    set: "axiom",
    setTitle: "Axiom",
    kit3d: false,
    line: "2D projection of a Calabi-Yau manifold cross-section, driven by complex polynomial mapping.",
    params: [{"name":"Fold","def":0.5},{"name":"Phase","def":0.3}],
    reacts: [["low","Rotates the complex plane"],["pres","Increases fold density"],["voice","Reveals higher dimensions"],["hit","Rings the topology"]],
    body: `// CALABI-YAU — Complex polynomial cross-section of a 6D manifold.
vec3 cyInk(float t){ return ramp(vec3(0.1,0.0,0.2), vec3(0.5,0.1,0.6), vec3(0.9,0.7,1.0), t); }
vec2 cMul(vec2 a, vec2 b){ return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
vec2 cPow(vec2 z, float n){
  float r = pow(length(z), n);
  float t = atan(z.y, z.x) * n;
  return r * vec2(cos(t), sin(t));
}

void mainImage(out vec4 o, in vec2 C){
  Aud a = plajahAudio(); float pu = plajahPunch();
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y * 2.0;
  
  float t = iTime*0.2 + comp(a.low, 0.4)*0.5;
  uv *= rot(t*0.5);
  
  vec2 z2 = vec2(sin(t), cos(t)) * (1.0 + a.voice*0.5);
  float n = 5.0 + floor(iParam0*3.0);
  
  vec2 v1 = cPow(uv, n);
  vec2 v2 = cPow(z2, n);
  vec2 s = v1 + v2 - vec2(1.0, 0.0);
  
  float d = length(s);
  float fold = abs(sin(d * (10.0 + a.pres*10.0) - iTime*2.0));
  float glow = (0.05 + iParam1*0.05 + pu*0.1) / (0.01 + fold*fold);
  
  vec3 col = cyInk(d*0.5 + t) * glow;
  col += vec3(0.1, 0.0, 0.2) * (1.0 - length(uv)*0.5);
  col = max(col, 0.0); col = col/(1.0+col*0.72);
  o = vec4(pow(col, vec3(0.88)), 1.0);
}`
  },
  {
    id: "kerr-singularity",
    n: 88,
    name: "Kerr Singularity",
    series: "VI",
    set: "axiom",
    setTitle: "Axiom",
    kit3d: false,
    line: "Rotating black hole with accretion disc, frame-dragging, and gravitational lensing.",
    params: [{"name":"Mass","def":0.5},{"name":"Spin","def":0.4}],
    reacts: [["sub","Increases gravitational mass"],["low","Disc turbulence"],["pres","Doppler shift on the blue side"],["sib","Starfield twinkle"],["hit","Flares the event horizon"]],
    body: `// KERR SINGULARITY — Frame-dragging and gravitational lensing in 2D raymarching.
vec3 bhInk(float t){ return ramp(vec3(0.02,0.01,0.05), vec3(1.0,0.4,0.1), vec3(0.8,0.9,1.0), t); }

void mainImage(out vec4 o, in vec2 C){
  Aud a = plajahAudio(); float pu = plajahPunch();
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;
  
  vec3 ro = vec3(0.0, 0.5, -6.0);
  vec3 rd = normalize(vec3(uv, 1.0));
  ro.yz *= rot(0.2); rd.yz *= rot(0.2);
  float t = iTime*(0.1 + iParam1*0.2);
  ro.xz *= rot(t); rd.xz *= rot(t);
  
  float mass = 1.0 + iParam0*0.5 + comp(a.sub, 0.4)*0.3;
  vec3 p = ro; vec3 v = rd;
  float dt = 0.1;
  vec3 dCol = vec3(0.0);
  
  for(int i=0; i<80; i++){
    float r2 = dot(p,p);
    if(r2 < 0.25) { dCol = vec3(0.0); break; }
    
    vec3 g = -p * mass / (r2*sqrt(r2));
    v = normalize(v + g*dt*0.5);
    vec3 nxt = p + v*dt;
    
    if(p.y * nxt.y < 0.0){
      float r = length(p.xz);
      if(r > 0.8 && r < 4.0){
        float den = (4.0 - r)/3.2;
        float ns = fbm(p.xz*(5.0 + a.low*2.0) - iTime, 3);
        float dop = dot(v, cross(vec3(0.0,1.0,0.0), normalize(p)));
        dCol += bhInk(dop*0.5 + 0.5 + a.pres*0.2) * den * (ns*0.5 + 0.5) * 0.5;
      }
    }
    p = nxt;
  }
  
  vec3 col = dCol + pu*0.1 / (length(uv) + 0.1);
  if(dot(p,p) >= 0.25) col += step(0.99, h21(floor(v.xy*200.0))) * (0.2 + a.sib);
  col = max(col, 0.0); col = col/(1.0+col*0.72);
  o = vec4(pow(col, vec3(0.88)), 1.0);
}`
  },
  {
    id: "penrose-mosaic",
    n: 89,
    name: "Penrose Mosaic",
    series: "VI",
    set: "axiom",
    setTitle: "Axiom",
    kit3d: false,
    line: "Aperiodic Penrose tiling via pentagrid intersections and golden ratio constraints.",
    params: [{"name":"Scale","def":0.3},{"name":"Shift","def":0.5}],
    reacts: [["sub","Pushes the phase"],["pres","Highlights grid edges"],["sib","Tile noise"],["voice","Draws the master contour"],["hit","Flashes the mosaic"]],
    body: `// PENROSE MOSAIC — Aperiodic tiling (kite and dart approximations) via 5 grids.
vec3 penInk(float t){ return ramp(vec3(0.1,0.05,0.2), vec3(0.2,0.4,0.6), vec3(0.9,0.8,0.4), t); }

void mainImage(out vec4 o, in vec2 C){
  Aud a = plajahAudio(); float pu = plajahPunch();
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y * (10.0 + iParam0*10.0);
  
  float t = iTime*0.5 + comp(a.sub, 0.4);
  uv *= rot(iTime*0.05);
  
  float sum = 0.0;
  vec3 col = vec3(0.0);
  
  for(int i=0; i<5; i++){
    float ang = float(i) * 3.14159 / 5.0;
    vec2 dir = vec2(cos(ang), sin(ang));
    float ph = dot(uv, dir) - t * (1.0 + iParam1*0.5);
    float grid = abs(fract(ph) - 0.5) * 2.0;
    
    float edge = smoothstep(0.05 + a.pres*0.1, 0.0, grid);
    sum += ph;
    col += penInk(float(i)*0.2 + a.pres) * edge;
  }
  
  col += penInk(sum*0.1 + a.voice*2.0) * 0.3 * (1.0 + pu);
  col += a.sib * h21(floor(uv)) * 0.2;
  
  col = max(col, 0.0); col = col/(1.0+col*0.72);
  o = vec4(pow(col, vec3(0.88)), 1.0);
}`
  },
  {
    id: "euler-helix",
    n: 90,
    name: "Euler Helix",
    series: "VI",
    set: "axiom",
    setTitle: "Axiom",
    kit3d: false,
    line: "Cornu/Euler spiral with evolving curvature via Fresnel integral approximations.",
    params: [{"name":"Spirals","def":0.5},{"name":"Length","def":0.5}],
    reacts: [["low","Unwinds the spirals"],["pres","Colors the spiral heads"],["voice","Vibrates the curve"],["hit","Flashes the origin"]],
    body: `// EULER HELIX — Fresnel integrals C(t)/S(t) creating multiple clothoid spirals.
vec3 euInk(float t){ return ramp(vec3(0.05,0.1,0.2), vec3(0.3,0.6,0.5), vec3(0.9,1.0,0.8), t); }

void mainImage(out vec4 o, in vec2 C){
  Aud a = plajahAudio(); float pu = plajahPunch();
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y * 4.0;
  
  vec3 col = vec3(0.0);
  int num = int(3.0 + iParam0*6.0);
  float maxS = 15.0 + a.low*10.0 + iParam1*5.0;
  
  for(int j=0; j<8; j++){
    if(j >= num) break;
    float ang = float(j) * 6.28318 / float(num) + iTime*0.2;
    vec2 sUV = uv * rot(ang);
    
    vec2 p = vec2(0.0);
    float dt = maxS / 100.0;
    float dist = 1e6;
    
    for(int i=0; i<100; i++){
      float s = float(i) * dt;
      float th = s*s*0.5 + a.voice*sin(s*10.0)*0.1;
      vec2 nxt = p + vec2(cos(th), sin(th))*dt;
      
      vec2 pa = sUV - p, ba = nxt - p;
      float h = clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0);
      dist = min(dist, length(pa - ba*h));
      p = nxt;
    }
    
    float glow = 0.02 / (0.001 + dist*dist);
    col += euInk(float(j)*0.2 - iTime*0.5 + a.pres) * glow * (1.0 + pu);
  }
  
  col = max(col, 0.0); col = col/(1.0+col*0.72);
  o = vec4(pow(col, vec3(0.88)), 1.0);
}`
  },
  {
    id: "julia-storm",
    n: 91,
    name: "Julia Storm",
    series: "VI",
    set: "manifold",
    setTitle: "Manifold",
    kit3d: false,
    line: "Julia set with a smoothly orbiting c parameter and escape distance coloring.",
    params: [{"name":"Orbit","def":0.4},{"name":"Detail","def":0.6}],
    reacts: [["sub","Pushes the c parameter radius"],["low","Folds the space"],["pres","Shifts the color palette"],["voice","Opens the set interior"],["hit","Rings the exterior field"]],
    body: `// JULIA STORM — Actual z = z^2 + c iteration mapped with smooth escape coloring.
vec3 jlInk(float t){ return ramp(vec3(0.1,0.0,0.15), vec3(0.2,0.4,0.6), vec3(1.0,0.8,0.4), t); }

void mainImage(out vec4 o, in vec2 C){
  Aud a = plajahAudio(); float pu = plajahPunch();
  int OCT = plajahOct();
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y * 2.5;
  
  float t = iTime*(0.2 + iParam0*0.4);
  vec2 c = vec2(cos(t), sin(t)) * (0.7 + comp(a.sub, 0.4)*0.2);
  vec2 z = uv * rot(comp(a.low, 0.3)*0.5);
  
  float iter = 0.0;
  float maxIt = 40.0 + iParam1*40.0;
  for(int i=0; i<80; i++){
    if(float(i) > maxIt) break;
    z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;
    if(dot(z,z) > 4.0) break;
    iter += 1.0;
  }
  
  float smoothIt = iter - log2(max(1.0, log2(dot(z,z)))) + a.voice*2.0;
  vec3 col = jlInk(smoothIt*0.05 + iTime*0.1 + a.pres) * (iter/maxIt);
  
  if(iter >= maxIt) col = vec3(0.01) * (1.0 + pu);
  
  col = max(col, 0.0); col = col/(1.0+col*0.72);
  o = vec4(pow(col, vec3(0.88)), 1.0);
}`
  },
  {
    id: "klein-twist",
    n: 92,
    name: "Klein Twist",
    series: "VI",
    set: "manifold",
    setTitle: "Manifold",
    kit3d: false,
    line: "Möbius and Klein bottle parametric cross-sections unfolding impossible surface self-intersections in 2D.",
    params: [{"name":"Width","def":0.5},{"name":"Twist","def":0.5}],
    reacts: [["sub","Expands the ribbon"],["low","Rolls the projection"],["pres","Iridescent specularity"],["voice","Opens the inner loop"],["hit","Flashes the ribbon edges"]],
    body: `// KLEIN TWIST — Parametric continuous twist showing impossible self-intersections.
vec3 ktInk(float t){ return ramp(vec3(0.1,0.05,0.2), vec3(0.8,0.2,0.5), vec3(0.3,0.8,1.0), t); }

void mainImage(out vec4 o, in vec2 C){
  Aud a = plajahAudio(); float pu = plajahPunch();
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y * 3.0;
  
  float t = iTime*0.2 + a.low*0.5;
  uv *= rot(t);
  
  float r = 1.0 + a.voice*0.5;
  float w = 0.2 + iParam0*0.3 + comp(a.sub, 0.4)*0.2;
  
  float ang = atan(uv.y, uv.x);
  vec2 q = vec2(length(uv) - r, 0.0);
  q *= rot(ang * (0.5 + iParam1*0.5));
  
  float d = abs(q.x) - w;
  float edge = smoothstep(0.05, 0.0, abs(d));
  
  vec3 col = ktInk(ang/6.28 + iTime*0.1 + a.pres) * edge;
  col += ktInk(ang/6.28 * 2.0) * smoothstep(0.1, 0.0, d) * 0.2;
  col += pu * edge * 0.5;
  
  col = max(col, 0.0); col = col/(1.0+col*0.72);
  o = vec4(pow(col, vec3(0.88)), 1.0);
}`
  },
  {
    id: "zeta-landscape",
    n: 93,
    name: "Zeta Landscape",
    series: "VI",
    set: "manifold",
    setTitle: "Manifold",
    kit3d: false,
    line: "Riemann zeta function domain coloring across the critical strip, zeros as vortices.",
    params: [{"name":"Zoom","def":0.5},{"name":"Height","def":0.5}],
    reacts: [["sub","Pushes up the critical strip"],["low","Distorts the landscape"],["pres","Shifts the phase mapping"],["voice","Highlights the zeros"],["hit","Rings the contours"]],
    body: `// ZETA LANDSCAPE — Domain coloring of ζ(s) approximated via partial series sums.
vec3 ztInk(float t){ return ramp(vec3(0.05,0.1,0.2), vec3(0.8,0.4,0.1), vec3(1.0,0.9,0.8), t); }
vec2 cPowZ(float n, vec2 s){
  float r = exp(-s.x * log(n));
  float th = -s.y * log(n);
  return r * vec2(cos(th), sin(th));
}

void mainImage(out vec4 o, in vec2 C){
  Aud a = plajahAudio(); float pu = plajahPunch();
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;
  
  vec2 s = vec2(0.5 + uv.x*(2.0 - iParam0), 15.0 + uv.y*(10.0 - iParam0*5.0) + iTime + comp(a.sub,0.4)*5.0);
  s.y += iParam1*10.0 + a.low;
  
  vec2 z = vec2(0.0);
  for(int i=1; i<=30; i++){ z += cPowZ(float(i), s); }
  
  float mag = length(z);
  float ph = atan(z.y, z.x);
  
  vec3 col = ztInk(ph/6.28318 + a.pres);
  float contour = fract(log(mag + 1.0) * 5.0 + pu);
  contour = smoothstep(0.0, 0.1, contour) * smoothstep(1.0, 0.9, contour);
  
  col *= (mag / (1.0 + mag)) * contour;
  col += vec3(1.0, 0.2, 0.5) * smoothstep(0.1, 0.0, mag) * (1.0 + a.voice*2.0);
  
  col = max(col, 0.0); col = col/(1.0+col*0.72);
  o = vec4(pow(col, vec3(0.88)), 1.0);
}`
  },
  {
    id: "golden-spiral",
    n: 94,
    name: "Golden Spiral",
    series: "VI",
    set: "manifold",
    setTitle: "Manifold",
    kit3d: false,
    line: "Fibonacci phyllotaxis sunflower pattern with logarithmic growth.",
    params: [{"name":"Density","def":0.5},{"name":"Spread","def":0.4}],
    reacts: [["sub","Expands the core radius"],["low","Twists the spiral"],["pres","Brightens the outer seeds"],["voice","Draws the connection web"],["hit","Flashes the centre"]],
    body: `// GOLDEN SPIRAL — Golden angle distribution rendering a phyllotaxis pattern.
vec3 gsInk(float t){ return ramp(vec3(0.1,0.05,0.0), vec3(0.8,0.5,0.1), vec3(1.0,0.9,0.5), t); }

void mainImage(out vec4 o, in vec2 C){
  Aud a = plajahAudio(); float pu = plajahPunch();
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y * (10.0 - iParam0*5.0);
  
  uv *= rot(iTime*0.1 + a.low*0.5);
  float ga = 3.14159 * (3.0 - sqrt(5.0));
  float c = 0.5 + iParam1*0.5 + comp(a.sub, 0.4)*0.2;
  
  float minDist = 1e6;
  float idx = 0.0;
  
  for(int i=1; i<=300; i++){
    float n = float(i);
    float r = c * sqrt(n);
    float th = n * ga;
    vec2 pos = r * vec2(cos(th), sin(th));
    
    float d = length(uv - pos);
    if(d < minDist){ minDist = d; idx = n; }
  }
  
  float rad = 0.4 * sqrt(c);
  float val = smoothstep(rad, rad*0.1, minDist);
  vec3 col = gsInk(idx*0.01 - iTime*0.5 + a.pres) * val;
  
  col += gsInk(idx*0.01) * (0.05 + a.voice*0.1) / (minDist*minDist + 0.1);
  col += pu * exp(-length(uv)*2.0) * gsInk(1.0);
  
  col = max(col, 0.0); col = col/(1.0+col*0.72);
  o = vec4(pow(col, vec3(0.88)), 1.0);
}`
  },
  {
    id: "rossler-fold",
    n: 95,
    name: "Rössler Fold",
    series: "VI",
    set: "manifold",
    setTitle: "Manifold",
    kit3d: false,
    line: "Rössler attractor integration visualizing chaotic period-doubling and folding.",
    params: [{"name":"Chaos","def":0.5},{"name":"Speed","def":0.4}],
    reacts: [["sub","Pushes the C parameter deeper into chaos"],["low","Tilts the projection plane"],["pres","Highlights the folded band"],["voice","Trails stretch out"],["hit","Strobes the path"]],
    body: `// RÖSSLER FOLD — Chaotic integration path showing the folding band structure.
vec3 rfInk(float t){ return ramp(vec3(0.0,0.1,0.2), vec3(0.2,0.4,0.8), vec3(0.9,0.8,1.0), t); }
vec3 rossler(vec3 p, float a, float b, float c){
  return vec3(-p.y-p.z, p.x + a*p.y, b + p.z*(p.x-c));
}
// Centre the band and spin it on two axes; the z lift is what exposes the fold.
vec2 rfProj(vec3 q, mat2 rx, mat2 ry){
  vec3 c = q - vec3(0.0, 0.0, 6.0);
  vec2 xz = c.xz * rx;
  vec2 yz = vec2(c.y, xz.y) * ry;
  return vec2(xz.x, yz.x);
}

void mainImage(out vec4 o, in vec2 C){
  Aud au = plajahAudio(); float pu = plajahPunch();
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y * 30.0;
  
  float a = 0.2; float b = 0.2;
  float c = 5.7 + iParam0*2.0 + comp(au.sub, 0.4)*2.0;
  float dt = 0.04 + iParam1*0.02 + au.voice*0.01;
  
  mat2 rx = rot(iTime*0.3), ry = rot(0.2 + au.low*0.2);
  
  vec3 p = vec3(0.1, 0.0, 0.0);
  float sum = 0.0;
  // uv is already scaled by 30, so the attractor projects at roughly unit scale.
  vec2 sa = rfProj(p, rx, ry);
  
  for(int i=0; i<200; i++){
    vec3 nxt = p + rossler(p, a, b, c)*dt;
    vec2 sb = rfProj(nxt, rx, ry);
    
    vec2 pa = uv - sa, ba = sb - sa;
    float h = clamp(dot(pa, ba)/max(dot(ba, ba), 1e-9), 0.0, 1.0);
    float d = length(pa - ba*h);
    
    sum += 0.55 / (0.30 + d*d*1.6) * (0.5 + au.pres*0.5);
    p = nxt; sa = sb;
  }
  
  vec3 col = rfInk(fract(sum*0.05 + au.pres*0.3)) * sum * 0.020 * (1.0 + pu);
  col = max(col, 0.0); col = col/(1.0+col*0.72);
  o = vec4(pow(col, vec3(0.88)), 1.0);
}`
  }
];
