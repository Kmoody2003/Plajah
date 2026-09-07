import { SignatureWork } from './signatureShaders';

export const SERIES_VI_PRISM: SignatureWork[] = [
  {
    id: "spectral-prism-3d", n: 73, name: "Spectral Prism",
    series: "VI", set: "refraction", setTitle: "Refraction",
    kit3d: true,
    line: "Raymarched triangular prism dispersing white light into rainbow, chromatic IOR per channel, caustic bands.",
    params: [{"name":"Dispersion","def":0.35},{"name":"Spin","def":0.4}],
    reacts: [["sub","Puts a slight throb on the dispersion width"],["pres","Lights up the caustic band"],["hit","Pulses the white core"]],
    body: "// SPECTRAL PRISM 3D \n" +
"vec3 prismPalette(float t) { return ramp(vec3(0.1,0.2,0.8), vec3(0.1,0.8,0.2), vec3(0.8,0.1,0.1), t); }\n" +
"float sdPrism(vec3 p, vec2 h) {\n" +
"  vec3 q = abs(p);\n" +
"  return max(q.z - h.y, max(q.x * 0.866025 + p.y * 0.5, -p.y) - h.x * 0.5);\n" +
"}\n" +
"vec2 map(vec3 p) {\n" +
"  vec3 q = p;\n" +
"  q.xz *= r2(iTime * (0.2 + iParam1*0.5));\n" +
"  q.yz *= r2(sin(iTime * 0.1) * 0.3);\n" +
"  float d = sdPrism(q, vec2(1.5, 0.5));\n" +
"  return vec2(d, 1.0);\n" +
"}\n" +
"void mainImage(out vec4 o, in vec2 C){\n" +
"  Aud a = plajahAudio();\n" +
"  float pu = plajahPunch();\n" +
"  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;\n" +
"  vec3 ro = vec3(0.0, 0.0, -3.5);\n" +
"  vec3 rd = normalize(vec3(uv, 1.0));\n" +
"  vec2 res = raymarch(ro, rd, 10.0);\n" +
"  vec3 col = vec3(0.02);\n" +
"  if(res.x < 10.0) {\n" +
"    vec3 p = ro + rd * res.x;\n" +
"    vec3 n = calcNormal(p);\n" +
"    vec3 l = normalize(vec3(-2.0, 1.0, -1.0));\n" +
"    vec3 v = -rd;\n" +
"    vec3 h = normalize(l + v);\n" +
"    float diff = max(dot(n, l), 0.0);\n" +
"    float spec = pow(max(dot(n, h), 0.0), 64.0);\n" +
"    float fr = fresnel(max(dot(v, n), 0.0), 0.04);\n" +
"    float dispW = 0.1 + iParam0*0.2 + a.sub*0.1;\n" +
"    vec3 refrR = refract(rd, n, 1.0 / 1.50);\n" +
"    vec3 refrG = refract(rd, n, 1.0 / (1.50 + dispW * 0.5));\n" +
"    vec3 refrB = refract(rd, n, 1.0 / (1.50 + dispW));\n" +
"    vec3 intR = prismPalette(refrR.x * 2.0 + iTime);\n" +
"    vec3 intG = prismPalette(refrG.y * 2.0 + iTime);\n" +
"    vec3 intB = prismPalette(refrB.z * 2.0 + iTime);\n" +
"    vec3 intCol = vec3(intR.r, intG.g, intB.b) * 2.0;\n" +
"    col = mix(intCol, vec3(1.0), fr) + ggx(n, v, l, 0.2) + diff * 0.1;\n" +
"    col += pu * vec3(1.0) * exp(-abs(res.x - 3.5)*4.0);\n" +
"  } else {\n" +
"    float ca = smoothstep(0.8, 1.0, sin(rd.x * 20.0 + iTime) * sin(rd.y * 20.0 - iTime));\n" +
"    col += ca * prismPalette(rd.x + rd.y + iTime*0.5) * (0.2 + a.pres*0.8);\n" +
"  }\n" +
"  col = max(col, 0.0); col = col/(1.0+col*0.72);\n" +
"  o = vec4(pow(col, vec3(0.88)), 1.0);\n" +
"}"
  },
  {
    id: "molten-crucible-3d", n: 74, name: "Molten Crucible",
    series: "VI", set: "refraction", setTitle: "Refraction",
    kit3d: true,
    line: "Raymarched sphere of molten glass, thermal gradient (white-yellow core→cherry red→blue-black edge), convection FBM.",
    params: [{"name":"Heat","def":0.35},{"name":"Convection","def":0.4}],
    reacts: [["sub","Pumps the core heat"],["low","Distorts the outer bounds"]],
    body: "// MOLTEN CRUCIBLE 3D \n" +
"vec2 map(vec3 p) {\n" +
"  Aud a = plajahAudio();\n" +
"  float d = sdSphere(p, 1.5);\n" +
"  d += fbm3(p * 2.0 + iTime * (0.5 + iParam1), 4) * 0.2 * (1.0 + a.low*2.0);\n" +
"  return vec2(d * 0.8, 1.0);\n" +
"}\n" +
"void mainImage(out vec4 o, in vec2 C){\n" +
"  Aud a = plajahAudio();\n" +
"  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;\n" +
"  vec3 ro = vec3(0.0, 0.0, -3.5);\n" +
"  vec3 rd = normalize(vec3(uv, 1.0));\n" +
"  vec2 res = raymarch(ro, rd, 10.0);\n" +
"  vec3 col = vec3(0.0);\n" +
"  if(res.x < 10.0) {\n" +
"    vec3 p = ro + rd * res.x;\n" +
"    vec3 n = calcNormal(p);\n" +
"    float thick = map(p - n * 0.5).x;\n" +
"    float heat = clamp(1.0 - abs(thick) * 2.0, 0.0, 1.0);\n" +
"    heat += fbm3(p * 3.0 - iTime, 4) * 0.5;\n" +
"    heat *= (1.0 + a.sub * 1.5 + iParam0);\n" +
"    vec3 hotCol = vec3(1.0, 0.9, 0.6);\n" +
"    vec3 warmCol = vec3(0.8, 0.2, 0.0);\n" +
"    vec3 coolCol = vec3(0.05, 0.1, 0.15);\n" +
"    vec3 emit = mix(coolCol, warmCol, smoothstep(0.0, 0.5, heat));\n" +
"    emit = mix(emit, hotCol, smoothstep(0.5, 1.0, heat));\n" +
"    float fr = fresnel(max(dot(-rd, n), 0.0), 0.04);\n" +
"    vec3 l = normalize(vec3(1.0, 2.0, -2.0));\n" +
"    float spec = ggx(n, -rd, l, 0.3);\n" +
"    col = emit + fr * 0.5 * warmCol + spec * 0.5;\n" +
"  } else {\n" +
"    col = vec3(0.01, 0.01, 0.02);\n" +
"    col += fbm3(vec3(uv * 5.0, iTime * 0.1), 4) * 0.05 * vec3(0.8, 0.3, 0.1);\n" +
"  }\n" +
"  col = max(col, 0.0); col = col/(1.0+col*0.72);\n" +
"  o = vec4(pow(col, vec3(0.88)), 1.0);\n" +
"}"
  },
  {
    id: "shatter-lattice-3d", n: 75, name: "Shatter Lattice",
    series: "VI", set: "refraction", setTitle: "Refraction",
    kit3d: true,
    line: "3D Voronoi crystal lattice, cells explode on beats then reconstruct, cyan-white glass, edge glow.",
    params: [{"name":"Explode","def":0.35},{"name":"Glow","def":0.4}],
    reacts: [["hit","Explodes the lattice"],["air","Lights up the edges"]],
    body: "// SHATTER Lattice 3D \n" +
"vec3 h33(vec3 p) {\n" +
"  p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6)));\n" +
"  return fract(sin(p)*43758.5453123);\n" +
"}\n" +
"vec2 voro(vec3 x, float sh) {\n" +
"  vec3 p = floor(x), f = fract(x);\n" +
"  float res = 100.0, res2 = 100.0;\n" +
"  for(int k=-1; k<=1; k++) for(int j=-1; j<=1; j++) for(int i=-1; i<=1; i++) {\n" +
"    vec3 b = vec3(float(i),float(j),float(k));\n" +
"    vec3 r = vec3(b) - f + h33(p + b) * (1.0 + sh * 0.5);\n" +
"    float d = dot(r,r);\n" +
"    if(d < res) { res2 = res; res = d; } else if(d < res2) res2 = d;\n" +
"  }\n" +
"  return vec2(sqrt(res), sqrt(res2));\n" +
"}\n" +
"vec2 map(vec3 p) {\n" +
"  float d = voro(p * 2.0, 0.0).y - voro(p * 2.0, 0.0).x - 0.1;\n" +
"  float bound = sdSphere(p, 2.0);\n" +
"  d = max(d, bound);\n" +
"  return vec2(d * 0.5, 1.0);\n" +
"}\n" +
"void mainImage(out vec4 o, in vec2 C){\n" +
"  Aud a = plajahAudio();\n" +
"  float pu = plajahPunch();\n" +
"  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;\n" +
"  vec3 ro = vec3(0.0, 0.0, -4.0);\n" +
"  vec3 rd = normalize(vec3(uv, 1.0));\n" +
"  float t = 0.0, glow = 0.0;\n" +
"  vec2 res;\n" +
"  for(int i = 0; i < 90; i++) {\n" +
"    vec3 p = ro + rd * t;\n" +
"    res = map(p);\n" +
"    if(res.x < 0.001) break;\n" +
"    if(t > 15.0) break;\n" +
"    t += res.x;\n" +
"    glow += 0.02 / (1.0 + res.x * 20.0);\n" +
"  }\n" +
"  vec3 col = vec3(0.0);\n" +
"  if(t < 15.0) {\n" +
"    vec3 p = ro + rd * t;\n" +
"    vec3 n = calcNormal(p);\n" +
"    vec3 refr = refract(rd, n, 1.0/1.3);\n" +
"    vec3 bgCol = mix(vec3(0.1,0.5,0.8), vec3(0.0,0.8,0.9), refr.y);\n" +
"    float fr = fresnel(max(dot(-rd, n), 0.0), 0.04);\n" +
"    vec3 l = normalize(vec3(1.0, 1.0, -1.0));\n" +
"    float spec = ggx(n, -rd, l, 0.2);\n" +
"    col = mix(bgCol, vec3(0.8, 0.9, 1.0), fr) + spec;\n" +
"  }\n" +
"  col += glow * vec3(0.1, 0.5, 0.8) * (1.0 + a.air + pu);\n" +
"  col = aces(col);\n" +
"  o = vec4(pow(col, vec3(0.88)), 1.0);\n" +
"}"
  },
  {
    id: "lens-array-3d", n: 76, name: "Lens Array",
    series: "VI", set: "refraction", setTitle: "Refraction",
    kit3d: true,
    line: "Grid of raymarched glass spheres acting as lenses, chromatic refraction, rainbow caustics.",
    params: [{"name":"Scale","def":0.35},{"name":"Caustic","def":0.4}],
    reacts: [["pres","Pumps the caustic brightness"],["voice","Modulates the spheres sizes"]],
    body: "// LENS ARRAY 3D \n" +
"vec3 getBg(vec3 rdd) {\n" +
"  float pat = sin(rdd.x * 20.0 + iTime) * sin(rdd.y * 20.0 - iTime);\n" +
"  return mix(vec3(0.1,0.3,0.8), vec3(0.8,0.2,0.3), 0.5+0.5*pat);\n" +
"}\n" +
"vec2 map(vec3 p) {\n" +
"  vec3 q = p;\n" +
"  float spacing = 1.0;\n" +
"  vec3 id = floor(q / spacing);\n" +
"  q = mod(q, spacing) - spacing * 0.5;\n" +
"  float pulse = sin(iTime * 2.0 + id.x + id.y) * 0.1;\n" +
"  float d = sdSphere(q, 0.35 + pulse);\n" +
"  float bound = sdBox(p, vec3(3.0, 2.0, 0.5));\n" +
"  d = max(d, bound);\n" +
"  return vec2(d, 1.0);\n" +
"}\n" +
"void mainImage(out vec4 o, in vec2 C){\n" +
"  Aud a = plajahAudio();\n" +
"  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;\n" +
"  vec3 ro = vec3(0.0, 0.0, -3.0);\n" +
"  vec3 rd = normalize(vec3(uv, 1.0));\n" +
"  float t = 0.0;\n" +
"  vec2 res;\n" +
"  for(int i = 0; i < 80; i++) {\n" +
"    vec3 p = ro + rd * t;\n" +
"    res = map(p);\n" +
"    if(res.x < 0.001) break;\n" +
"    if(t > 10.0) break;\n" +
"    t += res.x;\n" +
"  }\n" +
"  vec3 col = vec3(0.0);\n" +
"  if(t < 10.0) {\n" +
"    vec3 p = ro + rd * t;\n" +
"    vec3 n = calcNormal(p);\n" +
"    vec3 refrR = refract(rd, n, 1.0/1.48);\n" +
"    vec3 refrG = refract(rd, n, 1.0/1.50);\n" +
"    vec3 refrB = refract(rd, n, 1.0/1.52);\n" +
"    vec3 rCol = vec3(getBg(refrR).r, 0.0, 0.0);\n" +
"    vec3 gCol = vec3(0.0, getBg(refrG).g, 0.0);\n" +
"    vec3 bCol = vec3(0.0, 0.0, getBg(refrB).b);\n" +
"    vec3 refrCol = (rCol + gCol + bCol) * (1.0 + a.pres*2.0);\n" +
"    float fr = fresnel(max(dot(-rd, n), 0.0), 0.04);\n" +
"    vec3 l = normalize(vec3(1.0, 1.0, -1.0));\n" +
"    float spec = ggx(n, -rd, l, 0.1);\n" +
"    col = mix(refrCol, vec3(1.0), fr) + spec;\n" +
"  } else {\n" +
"    col = vec3(0.02, 0.02, 0.05);\n" +
"  }\n" +
"  col = max(col, 0.0); col = col/(1.0+col*0.72);\n" +
"  o = vec4(pow(col, vec3(0.88)), 1.0);\n" +
"}"
  },
  {
    id: "glass-monolith-3d", n: 77, name: "Glass Monolith",
    series: "VI", set: "refraction", setTitle: "Refraction",
    kit3d: true,
    line: "Tall glass rectangular monolith that bends with audio, internal stress patterns.",
    params: [{"name":"Bend","def":0.35},{"name":"Stress","def":0.4}],
    reacts: [["low","Bends the monolith"],["sib","Reveals the stress fractures inside"]],
    body: "// GLASS MONOLITH 3D \n" +
"vec2 map(vec3 p) {\n" +
"  vec3 q = p;\n" +
"  float bendAmt = sin(iTime * 1.5) * 0.2;\n" +
"  float c = cos(bendAmt * q.y);\n" +
"  float s = sin(bendAmt * q.y);\n" +
"  q.xy = mat2(c,-s,s,c) * q.xy;\n" +
"  float d = sdBox(q, vec3(0.8, 2.5, 0.3));\n" +
"  return vec2(d, 1.0);\n" +
"}\n" +
"void mainImage(out vec4 o, in vec2 C){\n" +
"  Aud a = plajahAudio();\n" +
"  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;\n" +
"  vec3 ro = vec3(0.0, 0.0, -5.0);\n" +
"  vec3 rd = normalize(vec3(uv, 1.0));\n" +
"  float t = 0.0;\n" +
"  vec2 res;\n" +
"  for(int i = 0; i < 80; i++) {\n" +
"    vec3 p = ro + rd * t;\n" +
"    res = map(p);\n" +
"    if(res.x < 0.001) break;\n" +
"    if(t > 15.0) break;\n" +
"    t += res.x;\n" +
"  }\n" +
"  vec3 col = vec3(0.0);\n" +
"  if(t < 15.0) {\n" +
"    vec3 p = ro + rd * t;\n" +
"    vec3 n = calcNormal(p);\n" +
"    vec3 refr = refract(rd, n, 1.0/1.52);\n" +
"    float stress = fbm3(p * 5.0 + iTime, 4);\n" +
"    vec3 stressCol = mix(vec3(0.0,0.2,0.4), vec3(0.8,0.2,0.1), stress) * (0.5 + a.sib*2.0);\n" +
"    float fr = fresnel(max(dot(-rd, n), 0.0), 0.04);\n" +
"    vec3 bg = vec3(0.1) * smoothstep(0.0, 0.1, fbm3(refr * 10.0, 4));\n" +
"    vec3 l = normalize(vec3(2.0, 3.0, -2.0));\n" +
"    float spec = ggx(n, -rd, l, 0.05);\n" +
"    col = mix(bg + stressCol * 0.5, vec3(1.0, 0.9, 0.8), fr) + spec * 1.5;\n" +
"  } else {\n" +
"    col = vec3(0.05) * (1.0 - length(uv));\n" +
"  }\n" +
"  col = max(col, 0.0); col = col/(1.0+col*0.72);\n" +
"  o = vec4(pow(col, vec3(0.88)), 1.0);\n" +
"}"
  },
  {
    id: "diamond-fire-3d", n: 78, name: "Diamond Fire",
    series: "VI", set: "refraction", setTitle: "Refraction",
    kit3d: true,
    line: "Rotating raymarched octahedron with high IOR, internal dispersion/fire, faceted highlights.",
    params: [{"name":"Rotate","def":0.35},{"name":"Fire","def":0.4}],
    reacts: [["pres","Pops the red fire internal reflections"],["air","Pops the blue fire"]],
    body: "// DIAMOND FIRE 3D \n" +
"float sdOctahedron(vec3 p, float s) {\n" +
"  p = abs(p);\n" +
"  return (p.x + p.y + p.z - s) * 0.57735027;\n" +
"}\n" +
"vec2 map(vec3 p) {\n" +
"  vec3 q = p;\n" +
"  q.xz *= r2(iTime * 0.3);\n" +
"  q.xy *= r2(iTime * 0.2);\n" +
"  float d = sdOctahedron(q, 1.5);\n" +
"  return vec2(d, 1.0);\n" +
"}\n" +
"void mainImage(out vec4 o, in vec2 C){\n" +
"  Aud a = plajahAudio();\n" +
"  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;\n" +
"  vec3 ro = vec3(0.0, 0.0, -4.0);\n" +
"  vec3 rd = normalize(vec3(uv, 1.0));\n" +
"  float t = 0.0;\n" +
"  vec2 res;\n" +
"  for(int i = 0; i < 80; i++) {\n" +
"    vec3 p = ro + rd * t;\n" +
"    res = map(p);\n" +
"    if(res.x < 0.001) break;\n" +
"    if(t > 10.0) break;\n" +
"    t += res.x;\n" +
"  }\n" +
"  vec3 col = vec3(0.0);\n" +
"  if(t < 10.0) {\n" +
"    vec3 p = ro + rd * t;\n" +
"    vec3 n = calcNormal(p);\n" +
"    vec3 refrR = refract(rd, n, 1.0/2.40);\n" +
"    vec3 refrG = refract(rd, n, 1.0/2.42);\n" +
"    vec3 refrB = refract(rd, n, 1.0/2.44);\n" +
"    float envR = smoothstep(0.8, 1.0, sin(atan(refrR.x, refrR.z)*10.0));\n" +
"    float envG = smoothstep(0.8, 1.0, sin(atan(refrG.x, refrG.z)*10.0));\n" +
"    float envB = smoothstep(0.8, 1.0, sin(atan(refrB.x, refrB.z)*10.0));\n" +
"    vec3 rCol = vec3(envR,0,0) * (1.0 + a.pres*2.0);\n" +
"    vec3 gCol = vec3(0,envG,0) * (1.0 + a.low*1.0);\n" +
"    vec3 bCol = vec3(0,0,envB) * (1.0 + a.air*2.0);\n" +
"    vec3 internalLight = rCol + gCol + bCol;\n" +
"    float fr = fresnel(max(dot(-rd, n), 0.0), 0.1);\n" +
"    vec3 l = normalize(vec3(1.0, 2.0, -1.0));\n" +
"    float spec = ggx(n, -rd, l, 0.02);\n" +
"    col = mix(internalLight, vec3(1.0), fr) + spec * 2.0;\n" +
"  }\n" +
"  col = max(col, 0.0); col = col/(1.0+col*0.72);\n" +
"  o = vec4(pow(col, vec3(0.88)), 1.0);\n" +
"}"
  },
  {
    id: "ice-cathedral-3d", n: 79, name: "Ice Cathedral",
    series: "VI", set: "crystalline", setTitle: "Crystalline",
    kit3d: true,
    line: "Raymarched hexagonal ice pillars, internal fractures, subsurface scattering blue.",
    params: [{"name":"Pillar height","def":0.35},{"name":"Scatter","def":0.4}],
    reacts: [["low","Lifts the pillars up"],["pres","Illuminates the subsurface scatter"]],
    body: "// ICE CATHEDRAL 3D \n" +
"float sdHexPrism(vec3 p, vec2 h) {\n" +
"  vec3 k = vec3(-0.866025, 0.5, 0.57735);\n" +
"  p = abs(p);\n" +
"  p.xy -= 2.0*min(dot(k.xy, p.xy), 0.0)*k.xy;\n" +
"  vec2 d = vec2(length(p.xy - vec2(clamp(p.x, -k.z*h.x, k.z*h.x), h.x))*sign(p.y - h.x), p.z-h.y);\n" +
"  return min(max(d.x,d.y),0.0) + length(max(d,0.0));\n" +
"}\n" +
"vec2 map(vec3 p) {\n" +
"  vec3 q = p;\n" +
"  q.xz *= r2(iTime * 0.1);\n" +
"  vec2 id = floor(q.xz / 1.5);\n" +
"  q.xz = mod(q.xz, 1.5) - 0.75;\n" +
"  float h = 2.0 + sin(id.x * 43.1 + id.y * 12.3 + iTime) * 1.0;\n" +
"  float d = sdHexPrism(vec3(q.x, q.z, q.y), vec2(0.5, h));\n" +
"  float floorD = p.y + 2.0;\n" +
"  d = min(d, floorD);\n" +
"  return vec2(d, 1.0);\n" +
"}\n" +
"void mainImage(out vec4 o, in vec2 C){\n" +
"  Aud a = plajahAudio();\n" +
"  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;\n" +
"  vec3 ro = vec3(0.0, 1.0, -5.0);\n" +
"  vec3 rd = normalize(vec3(uv, 1.0));\n" +
"  float t = 0.0, sss = 0.0;\n" +
"  vec2 res;\n" +
"  for(int i = 0; i < 90; i++) {\n" +
"    vec3 p = ro + rd * t;\n" +
"    res = map(p);\n" +
"    if(res.x < 0.001) break;\n" +
"    if(t > 20.0) break;\n" +
"    t += res.x;\n" +
"    sss += 0.01 / (1.0 + res.x * 10.0);\n" +
"  }\n" +
"  vec3 col = vec3(0.0);\n" +
"  if(t < 20.0) {\n" +
"    vec3 p = ro + rd * t;\n" +
"    vec3 n = calcNormal(p);\n" +
"    float frac = fbm3(p * 10.0, 4) * 0.5 + 0.5;\n" +
"    vec3 iceCol = vec3(0.4, 0.7, 0.9) * frac;\n" +
"    float fr = fresnel(max(dot(-rd, n), 0.0), 0.04);\n" +
"    vec3 l = normalize(vec3(1.0, 2.0, -1.0));\n" +
"    float diff = max(dot(n, l), 0.0);\n" +
"    float spec = ggx(n, -rd, l, 0.2);\n" +
"    col = iceCol * (diff * 0.8 + 0.2) + fr * vec3(0.8, 0.9, 1.0) + spec * 0.5;\n" +
"  }\n" +
"  col += sss * vec3(0.1, 0.4, 0.8) * (1.0 + a.pres*2.0);\n" +
"  col = max(col, 0.0); col = col/(1.0+col*0.72);\n" +
"  o = vec4(pow(col, vec3(0.88)), 1.0);\n" +
"}"
  },
  {
    id: "rose-mandala", n: 80, name: "Rose Window",
    series: "VI", set: "crystalline", setTitle: "Crystalline",
    kit3d: false,
    line: "2D stained glass mandala, Voronoi panels with jewel tones, light streaming through.",
    params: [{"name":"Scale","def":0.35},{"name":"Light","def":0.4}],
    reacts: [["pres","Pumps the light through the panels"],["voice","Opens up the mandala"]],
    body: "// ROSE WINDOW \n" +
"vec3 roseInk(float t) { return ramp(vec3(0.1,0.2,0.8), vec3(0.9,0.1,0.3), vec3(0.8,0.8,0.1), t); }\n" +
"vec3 voronoi(vec2 x) {\n" +
"  vec2 p = floor(x), f = fract(x);\n" +
"  float res = 8.0, id = 0.0;\n" +
"  vec2 mr;\n" +
"  for(int j=-1; j<=1; j++) for(int i=-1; i<=1; i++) {\n" +
"    vec2 b = vec2(float(i),float(j));\n" +
"    vec2 r = vec2(b) - f + vec2(h21(p+b), h11(h21(p+b)));\n" +
"    float d = dot(r,r);\n" +
"    if(d < res) { res = d; mr = r; id = h21(p+b); }\n" +
"  }\n" +
"  res = 8.0;\n" +
"  for(int j=-2; j<=2; j++) for(int i=-2; i<=2; i++) {\n" +
"    vec2 b = vec2(float(i),float(j));\n" +
"    vec2 r = vec2(b) - f + vec2(h21(p+b), h11(h21(p+b)));\n" +
"    if(dot(mr-r,mr-r)>0.00001) res = min(res, dot(0.5*(mr+r), normalize(r-mr)));\n" +
"  }\n" +
"  return vec3(sqrt(res), id, res);\n" +
"}\n" +
"void mainImage(out vec4 o, in vec2 C){\n" +
"  Aud a = plajahAudio();\n" +
"  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;\n" +
"  float r = length(uv);\n" +
"  float ang = atan(uv.y, uv.x);\n" +
"  vec2 pol = vec2(r * 3.0, ang * 3.0 / 3.14159);\n" +
"  pol.y += iTime * 0.1;\n" +
"  vec3 v = voronoi(pol * 3.0);\n" +
"  float edge = smoothstep(0.02, 0.05, v.x);\n" +
"  vec3 panelCol = roseInk(v.y * 0.1);\n" +
"  float tex = fbm(uv * 20.0, 3) * 0.5 + 0.5;\n" +
"  float light = sin(iTime * 2.0 + v.y) * 0.5 + 0.5;\n" +
"  light *= (1.0 + a.pres*2.0);\n" +
"  vec3 col = panelCol * tex * light * edge;\n" +
"  col = mix(vec3(0.05), col, edge);\n" +
"  col *= smoothstep(1.5, 1.48, r);\n" +
"  col = max(col, 0.0); col = col/(1.0+col*0.72);\n" +
"  o = vec4(pow(col, vec3(0.88)), 1.0);\n" +
"}"
  },
  {
    id: "fiber-light", n: 81, name: "Fiber Light",
    series: "VI", set: "crystalline", setTitle: "Crystalline",
    kit3d: false,
    line: "2D fiber optic bundle cross-section, each fiber carries different colored pulsing light.",
    params: [{"name":"Density","def":0.35},{"name":"Pulse","def":0.4}],
    reacts: [["low","Pulsing lights across the bundle"],["air","Twinkles individual fibers"]],
    body: "// FIBER LIGHT \n" +
"vec3 fiberInk(float t) { return ramp(vec3(0.1,0.2,0.8), vec3(0.2,0.8,0.3), vec3(0.9,0.1,0.8), t); }\n" +
"void mainImage(out vec4 o, in vec2 C){\n" +
"  Aud a = plajahAudio();\n" +
"  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;\n" +
"  vec2 q = uv * 20.0;\n" +
"  vec2 id = floor(q);\n" +
"  vec2 f = fract(q) - 0.5;\n" +
"  float h = h21(id);\n" +
"  float d = length(f) - 0.35;\n" +
"  float mask = smoothstep(0.05, 0.0, d);\n" +
"  float pulse = sin(iTime * 5.0 + h * 10.0) * 0.5 + 0.5;\n" +
"  pulse *= (1.0 + a.low*2.0 + (h < 0.1 ? a.air*3.0 : 0.0));\n" +
"  vec3 col = mask * fiberInk(h) * pulse * 2.0;\n" +
"  col += smoothstep(0.0, -0.05, d) * vec3(0.1);\n" +
"  col = max(col, 0.0); col = col/(1.0+col*0.72);\n" +
"  o = vec4(pow(col, vec3(0.88)), 1.0);\n" +
"}"
  },
  {
    id: "liquid-crystal", n: 82, name: "Liquid Crystal",
    series: "VI", set: "crystalline", setTitle: "Crystalline",
    kit3d: false,
    line: "2D birefringent liquid crystal display, flowing rainbow interference, domain-warped FBM.",
    params: [{"name":"Warp","def":0.35},{"name":"Flow","def":0.4}],
    reacts: [["sub","Pushes the domain warp"],["voice","Introduces sharp domain boundaries"]],
    body: "// LIQUID CRYSTAL \n" +
"vec3 lcInk(float t) { return ramp(vec3(0.8,0.2,0.1), vec3(0.1,0.8,0.2), vec3(0.2,0.1,0.8), t); }\n" +
"void mainImage(out vec4 o, in vec2 C){\n" +
"  Aud a = plajahAudio();\n" +
"  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;\n" +
"  vec2 p = uv * 3.0;\n" +
"  vec2 q = vec2(fbm(p + iTime * 0.2, 3), fbm(p + vec2(5.2, 1.3), 3));\n" +
"  vec2 r = vec2(fbm(p + 4.0 * q + iTime * 0.3, 3), fbm(p + 4.0 * q + vec2(8.3, 2.8), 3));\n" +
"  float f = fbm(p + 4.0 * r + a.sub*2.0, 3);\n" +
"  vec3 col = lcInk(f * 3.0);\n" +
"  float bound = abs(sin(r.x * 20.0 + a.voice*5.0));\n" +
"  col *= smoothstep(0.0, 0.2, bound);\n" +
"  col = max(col, 0.0); col = col/(1.0+col*0.72);\n" +
"  o = vec4(pow(col, vec3(0.88)), 1.0);\n" +
"}"
  },
  {
    id: "frosted-aurora", n: 83, name: "Frosted Aurora",
    series: "VI", set: "crystalline", setTitle: "Crystalline",
    kit3d: false,
    line: "2D northern lights through frosted glass micro-texture, soft dreamy diffusion.",
    params: [{"name":"Frost","def":0.35},{"name":"Aurora","def":0.4}],
    reacts: [["pres","Lifts the aurora brightness"],["sib","Catches on the frost crystals"]],
    body: "// FROSTED AURORA \n" +
"void mainImage(out vec4 o, in vec2 C){\n" +
"  Aud a = plajahAudio();\n" +
"  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;\n" +
"  vec2 glassN = vec2(\n" +
"    fbm(uv * 50.0, 4) - fbm(uv * 50.0 - vec2(0.01, 0.0), 4),\n" +
"    fbm(uv * 50.0, 4) - fbm(uv * 50.0 - vec2(0.0, 0.01), 4)\n" +
"  );\n" +
"  vec2 distUv = uv + glassN * 0.1 * (1.0 - a.sub * 0.5);\n" +
"  float t = iTime * 0.5;\n" +
"  float a1 = sin(distUv.x * 3.0 + t) * 0.5;\n" +
"  float a2 = sin(distUv.x * 2.0 - t * 1.5 + distUv.y * 2.0) * 0.5;\n" +
"  float aurora = smoothstep(0.1, 0.0, abs(distUv.y - a1 - a2));\n" +
"  vec3 aurCol = mix(vec3(0.0, 0.8, 0.4), vec3(0.6, 0.1, 0.8), distUv.y + 0.5);\n" +
"  vec3 col = aurCol * aurora * 2.0 * (1.0 + a.pres*2.0);\n" +
"  col += vec3(0.1) * (fbm(uv * 20.0, 3) * 0.5 + 0.5) * (1.0 + a.sib*3.0);\n" +
"  col = max(col, 0.0); col = col/(1.0+col*0.72);\n" +
"  o = vec4(pow(col, vec3(0.88)), 1.0);\n" +
"}"
  },
  {
    id: "tesla-discharge", n: 84, name: "Tesla Discharge",
    series: "VI", set: "crystalline", setTitle: "Crystalline",
    kit3d: false,
    line: "2D plasma discharge in glass tube, branching plasma tendrils, purple/white, beat-triggered.",
    params: [{"name":"Voltage","def":0.35},{"name":"Branch","def":0.4}],
    reacts: [["hit","Sparks a new tendril"],["sib","Crackles the edges"]],
    body: "// TESLA DISCHARGE \n" +
"void mainImage(out vec4 o, in vec2 C){\n" +
"  Aud a = plajahAudio();\n" +
"  float pu = plajahPunch();\n" +
"  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;\n" +
"  vec3 col = vec3(0.0);\n" +
"  float r = length(uv);\n" +
"  if(r < 0.9) {\n" +
"    float noise = fbm(uv * 10.0 + iTime, 4);\n" +
"    float spark = smoothstep(0.05, 0.0, abs(noise - 0.5 + uv.y));\n" +
"    spark *= (pu + a.sib);\n" +
"    col = vec3(0.8, 0.2, 1.0) * spark * 2.0;\n" +
"    col += vec3(1.0) * smoothstep(0.02, 0.0, abs(noise - 0.5 + uv.y)) * spark;\n" +
"  }\n" +
"  col += smoothstep(0.95, 0.9, r) * smoothstep(0.85, 0.9, r) * vec3(0.2, 0.5, 1.0) * 0.5;\n" +
"  col = max(col, 0.0); col = col/(1.0+col*0.72);\n" +
"  o = vec4(pow(col, vec3(0.88)), 1.0);\n" +
"}"
  }
];
