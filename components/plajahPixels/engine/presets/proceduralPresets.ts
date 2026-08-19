// proceduralPresets — original SDF / vector-field style generative shaders, in the
// same raw Shadertoy-style `mainImage()` convention as ShaderPanel's own SHADERS
// array (no new runtime dependency: this is hand-authored GLSL, not a compiled
// output of a JS shader DSL). Tagged kind:'procedural' so the library can filter
// "vector/field/geometry" style content separately from freeform audio-reactive
// or cinematic shaders.

export interface ProceduralPreset { name: string; cat: 'audio' | 'generative' | 'cinematic' | 'abstract'; src: string; }

export const PROCEDURAL_PRESETS: ProceduralPreset[] = [
  {
    name: 'Vector Grid Warp',
    cat: 'generative',
    src: `void mainImage(out vec4 o, in vec2 C){
  vec2 uv = C/iResolution.xy;
  vec2 grid = uv * vec2(20.0, 12.0);
  vec2 cell = floor(grid);
  vec2 local = fract(grid) - 0.5;
  float fft = texture(iChannel0, vec2(cell.x/20.0, 0.0)).x;
  float ang = sin(cell.x*0.6 + cell.y*0.4 + iTime*0.6) + fft*3.0 + iParam0*3.0;
  vec2 dir = vec2(cos(ang), sin(ang)) * (0.35 + iBass*0.3);
  float shaft = smoothstep(0.05, 0.0, abs(dot(local, vec2(-dir.y, dir.x)))) * smoothstep(0.5, 0.0, abs(dot(local, dir) - length(dir)*0.5));
  float head = smoothstep(0.12, 0.0, length(local - dir));
  vec3 col = (shaft + head) * (0.5+0.5*cos(ang + vec3(0.0,2.1,4.2)));
  o = vec4(col, 1.0);
}`,
  },
  {
    name: 'SDF Orb Cluster',
    cat: 'abstract',
    src: `float sdOrb(vec2 p, vec2 c, float r){ return length(p-c)-r; }
void mainImage(out vec4 o, in vec2 C){
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;
  float t = iTime*0.4;
  float d = 1e9;
  for(int i=0; i<6; i++){
    float fi = float(i);
    vec2 c = 0.35*vec2(cos(t*(0.6+fi*0.15)+fi*2.1), sin(t*(0.5+fi*0.12)+fi*1.7));
    float r = 0.12 + 0.05*sin(t*2.0+fi) + iParam1*0.08 + iBass*0.06;
    float di = sdOrb(uv, c, r);
    float k = 0.25;
    float h = clamp(0.5 + 0.5*(d-di)/k, 0.0, 1.0);
    d = mix(d, di, h) - k*h*(1.0-h);
  }
  float shape = smoothstep(0.01, -0.01, d);
  vec3 col = shape * (0.5+0.5*cos(d*8.0 + iTime*0.5 + vec3(0.0,2.1,4.2)));
  col += 0.15*exp(-abs(d)*6.0)*vec3(0.6,0.3,1.0);
  o = vec4(clamp(col,0.0,1.0), 1.0);
}`,
  },
  {
    name: 'Contour Flow Lines',
    cat: 'abstract',
    src: `float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5); }
float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
void mainImage(out vec4 o, in vec2 C){
  vec2 uv = C/iResolution.xy;
  float t = iTime*0.15 + iParam2*2.0;
  float field = noise(uv*3.0 + t) + 0.5*noise(uv*6.0 - t*0.7) + iMid*0.5;
  float lines = abs(fract(field*8.0) - 0.5)*2.0;
  float contour = smoothstep(0.08, 0.0, lines);
  vec3 col = contour * (0.5+0.5*cos(field*10.0 + iTime*0.3 + vec3(0.0,2.1,4.2)));
  col += 0.03*vec3(0.3,0.5,1.0);
  o = vec4(clamp(col,0.0,1.0), 1.0);
}`,
  },
  {
    name: 'Streak Particle Field',
    cat: 'generative',
    src: `float hash(float n){ return fract(sin(n)*43758.5453); }
void mainImage(out vec4 o, in vec2 C){
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;
  vec3 col = vec3(0.0);
  float speed = 0.4 + iParam3*1.2 + iLevel*0.6;
  for(int i=0; i<80; i++){
    float fi = float(i);
    vec2 seed = vec2(hash(fi), hash(fi+50.0))*2.0-1.0;
    float phase = fract(hash(fi+100.0) + iTime*speed*0.1);
    vec2 p = seed * (1.0 - phase);
    vec2 dir = normalize(seed + 0.0001);
    vec2 tail = p + dir*phase*0.15;
    float d = length(uv - mix(p, tail, 0.5));
    float streak = smoothstep(0.01, 0.0, abs(dot(uv-p, vec2(-dir.y,dir.x)))) * smoothstep(0.15, 0.0, length(uv-p));
    col += streak * (0.5+0.5*cos(fi*0.3+iTime*0.4+vec3(0.0,2.1,4.2))) * (1.0-phase);
  }
  o = vec4(clamp(col,0.0,1.0), 1.0);
}`,
  },
];
