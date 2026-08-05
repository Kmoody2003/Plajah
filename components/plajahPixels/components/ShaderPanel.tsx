// ShaderPanel — full production shader library (25+ shaders, categorized).
// Shadertoy-compatible uniforms. Click a chip to load into editor, Apply to run live.

import React, { useState, useMemo } from 'react';
import { Play, Power, Code2, AlertTriangle, Search } from 'lucide-react';

// ─── Shader library ────────────────────────────────────────────────────────────

interface ShaderEntry { name: string; cat: string; src: string; }

const SHADERS: ShaderEntry[] = [
  // ── Audio-Reactive ────────────────────────────────────────────────────────────
  {
    name: 'Spectrum Bars',
    cat: 'audio',
    src: `void mainImage(out vec4 o, in vec2 C){
  vec2 uv = C/iResolution.xy;
  float fft = texture(iChannel0, vec2(uv.x, 0.0)).x;
  float bar = smoothstep(0.0, 0.015, fft - uv.y);
  vec3 col = bar * (0.6 + 0.4*cos(iTime*0.5 + uv.x*8.0 + vec3(0.0,2.1,4.2)));
  col += 0.04*vec3(0.4,0.2,1.0) * (1.0-uv.y);
  col = pow(col, vec3(0.85));
  o = vec4(col + iBass*0.12*vec3(1.0,0.3,0.7), 1.0);
}`,
  },
  {
    name: 'Reactive Plasma',
    cat: 'audio',
    src: `void mainImage(out vec4 o, in vec2 C){
  vec2 u = (C - 0.5*iResolution.xy)/iResolution.y;
  float t = iTime*0.35 + iLevel*1.8;
  float v  = sin(u.x*8.0+t*1.2) + sin(u.y*7.0+t);
  v += sin((u.x+u.y)*6.0+t*0.8);
  v += iTreble*3.5*sin(length(u)*22.0 - t*4.5);
  v += iBass*2.0*cos(u.x*3.0 - u.y*5.0 + t*2.0);
  vec3 col = 0.5 + 0.5*cos(v*1.2 + vec3(0.0,2.09,4.19) + iTime*0.3);
  col = pow(max(col,vec3(0.0)), vec3(0.9));
  o = vec4(col, 1.0);
}`,
  },
  {
    name: 'Bass Tunnel',
    cat: 'audio',
    src: `void mainImage(out vec4 o, in vec2 C){
  vec2 u = (C - 0.5*iResolution.xy)/iResolution.y;
  float a = atan(u.y,u.x), r = length(u);
  float t = iTime*0.7;
  float v = sin(10.0*a + t + iBass*14.0) * 0.5 + 0.5;
  float rings = sin(1.0/r*5.0 - t*2.5 + iMid*10.0)*0.5+0.5;
  float ripple = sin(r*30.0 - t*8.0 + iBass*6.0)*0.5+0.5;
  vec3 col = mix(vec3(0.05,0.0,0.2), vec3(1.0,0.25,0.9), v*rings);
  col += 0.2*ripple*vec3(0.3,0.8,1.0)*iTreble;
  col *= smoothstep(0.0, 0.4, r) * (1.0 + iBass*0.4);
  o = vec4(col, 1.0);
}`,
  },
  {
    name: 'Audio Rings',
    cat: 'audio',
    src: `void mainImage(out vec4 o, in vec2 C){
  vec2 u = (C - 0.5*iResolution.xy)/iResolution.y;
  float r = length(u);
  float a = atan(u.y,u.x);
  vec3 col = vec3(0.0);
  for(int i=1; i<=8; i++){
    float fi = float(i);
    float fft = texture(iChannel0, vec2(fi/9.0, 0.0)).x;
    float ring = abs(r - fi*0.09 - fft*0.25);
    float glow = 0.004 / (ring + 0.001);
    float warp = 1.0 + 0.08*sin(a*float(i*2)+iTime*1.5+iBass*4.0);
    glow *= warp;
    col += glow * (0.5+0.5*cos(iTime + fi*0.8 + vec3(0.0,2.1,4.2)));
  }
  col = pow(clamp(col, 0.0, 1.0), vec3(0.8));
  o = vec4(col, 1.0);
}`,
  },
  {
    name: 'Waveform Landscape',
    cat: 'audio',
    src: `float hash(float n){ return fract(sin(n)*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i.x+i.y*57.0),hash(i.x+1.0+i.y*57.0),f.x),mix(hash(i.x+(i.y+1.0)*57.0),hash(i.x+1.0+(i.y+1.0)*57.0),f.x),f.y); }
void mainImage(out vec4 o, in vec2 C){
  vec2 uv = C/iResolution.xy;
  vec2 p = uv * vec2(4.0, 2.0);
  float wave = texture(iChannel0, vec2(uv.x, 0.1)).x * 0.8;
  float n = noise(p + vec2(iTime*0.2, 0.0));
  float terrain = n * 0.4 + wave * 0.5 + iBass * 0.2;
  float horizon = 0.45 + terrain * 0.25;
  float above = smoothstep(horizon+0.01, horizon-0.01, uv.y);
  vec3 sky = mix(vec3(0.02,0.0,0.12), vec3(0.6,0.1,0.8), uv.y*0.7+iMid*0.3);
  float dist = (uv.y-horizon) / (1.0-horizon+0.001);
  vec3 ground = mix(vec3(0.5,0.0,1.0)*0.6, vec3(0.0,0.3,0.6), dist);
  ground *= 1.0 + noise(p*2.0 + iTime*0.5)*0.4;
  vec3 col = mix(sky, ground, above);
  col += 0.05*iTreble*vec3(1.0,0.8,0.2) * above;
  o = vec4(col, 1.0);
}`,
  },
  {
    name: 'Frequency Mandala',
    cat: 'audio',
    src: `void mainImage(out vec4 o, in vec2 C){
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  int N = 8;
  float mirror = a / (3.14159/float(N));
  mirror = abs(fract(mirror)*2.0-1.0) * (3.14159/float(N));
  vec2 q = vec2(cos(mirror), sin(mirror)) * r;
  float band = floor(r * 10.0);
  float fft = texture(iChannel0, vec2(clamp(band/10.0,0.0,1.0), 0.0)).x;
  float petal = sin(q.x*20.0 + iTime + iBass*6.0)*0.5+0.5;
  float glow = fft * petal / (r*4.0+0.5);
  float ring = 0.003 / (abs(r - 0.12 - iBass*0.15) + 0.001);
  vec3 col = glow * (0.5+0.5*cos(iTime*0.5+r*8.0+vec3(0.0,2.1,4.2)));
  col += ring * vec3(1.0,0.4,0.8);
  col += 0.05*iTreble*vec3(0.8,0.5,1.0);
  o = vec4(clamp(col,0.0,1.0), 1.0);
}`,
  },
  {
    name: 'Beat Pulse Grid',
    cat: 'audio',
    src: `void mainImage(out vec4 o, in vec2 C){
  vec2 uv = C/iResolution.xy;
  float cols = 16.0, rows = 10.0;
  vec2 cell = floor(uv * vec2(cols, rows));
  vec2 local = fract(uv * vec2(cols, rows));
  float id = cell.y * cols + cell.x;
  float phase = fract(id / (cols*rows) * 3.0 + iTime*0.2);
  float cx = cell.x / cols;
  float fft = texture(iChannel0, vec2(cx, 0.0)).x;
  float pulse = fft + iBass * 0.4 * sin(iTime*6.0 + id*0.8);
  float mask = smoothstep(0.5+pulse*0.3, 0.05+pulse*0.3, length(local-0.5));
  vec3 col = (0.5+0.5*cos(iTime + phase*6.28 + vec3(0.0,2.1,4.2))) * mask;
  col += mask * iBass * 0.5 * vec3(1.0,0.2,0.5);
  o = vec4(col, 1.0);
}`,
  },
  {
    name: 'Sonic Vortex',
    cat: 'audio',
    src: `void mainImage(out vec4 o, in vec2 C){
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float twist = iTime*1.2 + iBass*8.0 + r*12.0;
  float arm = sin(a*3.0 + twist)*0.5+0.5;
  float fft = texture(iChannel0, vec2(r*0.9, 0.0)).x;
  float brightness = arm * fft * (1.0 + iMid*2.0);
  brightness /= (r*2.5 + 0.2);
  float edge = smoothstep(0.6,0.3,r);
  vec3 col = brightness * (0.5+0.5*cos(iTime*0.5 + r*6.0 + a*0.5 + vec3(0.0,2.1,4.2)));
  col *= edge;
  col += 0.3*iBass*vec3(1.0,0.1,0.5)*edge*(1.0-r);
  o = vec4(clamp(col,0.0,1.5), 1.0);
}`,
  },

  // ── Generative ────────────────────────────────────────────────────────────────
  {
    name: 'Voronoi Flow',
    cat: 'generative',
    src: `vec2 hash2(vec2 p){ p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))); return fract(sin(p)*43758.5453); }
void mainImage(out vec4 o, in vec2 C){
  vec2 uv = C/iResolution.yy;
  float t = iTime*0.3;
  float minD = 1e9; vec2 minP;
  for(int y=-1; y<=1; y++) for(int x=-1; x<=1; x++){
    vec2 g = floor(uv*6.0)+vec2(x,y);
    vec2 o2 = hash2(g);
    vec2 pt = g + 0.5 + 0.45*sin(t + 6.28*o2);
    float d = length(uv*6.0 - pt);
    if(d<minD){ minD=d; minP=o2; }
  }
  float edge = smoothstep(0.02, 0.12, minD);
  vec3 col = 0.5+0.5*cos(iTime*0.4 + minP.x*8.0 + vec3(0.0,2.1,4.2));
  col *= edge;
  col += (1.0-edge)*0.08*vec3(1.0,0.7,0.3);
  o = vec4(col, 1.0);
}`,
  },
  {
    name: 'Fractal Zoom',
    cat: 'generative',
    src: `void mainImage(out vec4 o, in vec2 C){
  float zoom = fract(iTime*0.12)*8.0;
  float scale = pow(2.0, zoom);
  vec2 center = vec2(-0.745428, 0.113009);
  vec2 uv = (C - 0.5*iResolution.xy) / (iResolution.y * 0.4 * scale);
  uv += center;
  vec2 z = vec2(0.0); int i=0; const int N=96;
  for(; i<N; i++){
    z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + uv;
    if(dot(z,z) > 4.0) break;
  }
  float smooth_i = float(i) - log2(log2(dot(z,z))) + 4.0;
  float t = smooth_i / float(N);
  if(i==N){ o=vec4(0.0,0.0,0.0,1.0); return; }
  vec3 col = 0.5+0.5*cos(iTime*0.2 + t*16.0 + vec3(0.0,0.8,1.6));
  col = pow(col, vec3(0.85));
  o = vec4(col, 1.0);
}`,
  },
  {
    name: 'Plasma Cloud',
    cat: 'generative',
    src: `float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5); }
float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<6;i++){ v+=a*noise(p); p*=2.1; a*=0.5; } return v; }
void mainImage(out vec4 o, in vec2 C){
  vec2 uv = C/iResolution.yy;
  float t = iTime*0.18;
  float n1 = fbm(uv*3.0 + t + fbm(uv*2.5 + t*0.7)*1.2);
  float n2 = fbm(uv*2.5 - t*0.5 + n1*1.5);
  float n3 = fbm(uv*4.0 + n2*0.9 + t*0.3);
  vec3 c1 = vec3(0.6,0.0,1.0), c2 = vec3(0.0,0.5,1.0), c3 = vec3(1.0,0.1,0.4);
  vec3 col = mix(c1, c2, n2);
  col = mix(col, c3, n3*0.6);
  col *= 1.2 + 0.5*n1;
  col = pow(clamp(col,0.0,1.0), vec3(0.9));
  o = vec4(col, 1.0);
}`,
  },
  {
    name: 'Lissajous Web',
    cat: 'generative',
    src: `void mainImage(out vec4 o, in vec2 C){
  vec2 uv = C/iResolution.xy;
  vec3 col = vec3(0.02);
  int N = 5;
  for(int a=1; a<=N; a++) for(int b=1; b<=N; b++){
    float fa=float(a), fb=float(b);
    float ph = iTime*0.3 + fa*0.7 + fb*0.5;
    vec2 pt = vec2(sin(fa*iTime*0.4+ph)*0.45+0.5, sin(fb*iTime*0.3+ph*1.2)*0.45+0.5);
    float d = length(uv - pt);
    float glow = 0.002 / (d*d + 0.0001);
    col += glow * (0.5+0.5*cos(iTime + fa*1.1 + vec3(0.0,2.1,4.2)));
  }
  // Draw connecting lines
  col = pow(clamp(col,0.0,1.0), vec3(0.85));
  o = vec4(col, 1.0);
}`,
  },
  {
    name: 'Electric Lightning',
    cat: 'generative',
    src: `float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5); }
float bolt(vec2 uv, vec2 a, vec2 b, float t){
  vec2 ab=b-a, au=uv-a;
  float s=clamp(dot(au,ab)/dot(ab,ab),0.0,1.0);
  vec2 closest=a+s*ab;
  float jitter = hash(vec2(floor(s*20.0), t))*0.06 - 0.03;
  closest.y += jitter;
  float d=length(uv-closest);
  return 0.0015/(d+0.0005);
}
void mainImage(out vec4 o, in vec2 C){
  vec2 uv = C/iResolution.xy;
  vec3 col = vec3(0.0);
  float t = floor(iTime*8.0);
  for(int i=0; i<5; i++){
    float fi=float(i);
    vec2 a = vec2(hash(vec2(fi,t))*0.8+0.1, 0.0);
    vec2 b = vec2(hash(vec2(fi+10.0,t))*0.8+0.1, 1.0);
    float b0 = bolt(uv, a, b, t+fi);
    col += b0 * (0.5+0.5*cos(fi*1.3 + vec3(0.0,2.1,4.2)));
  }
  col *= 1.0 + 0.3*sin(iTime*60.0);
  col = pow(clamp(col,0.0,1.0), vec3(0.7));
  o = vec4(col, 1.0);
}`,
  },
  {
    name: 'Galaxy Swirl',
    cat: 'generative',
    src: `float hash(float n){ return fract(sin(n)*43758.5453); }
void mainImage(out vec4 o, in vec2 C){
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  float arms = 3.0;
  float spiral = sin(arms*a - r*12.0 + iTime*0.5 + iBass*3.0)*0.5+0.5;
  float falloff = exp(-r*3.5);
  vec3 col = spiral * falloff * vec3(0.8,0.5,1.0);
  // Stars
  float t = iTime*0.05;
  for(int i=0; i<120; i++){
    float fi = float(i);
    float sr = hash(fi)*0.8;
    float sa = hash(fi+100.0)*6.28;
    vec2 sp = vec2(cos(sa+t*hash(fi+200.0)),sin(sa+t*hash(fi+300.0)))*sr;
    float sd = length(uv-sp);
    float star = 0.0006/(sd+0.0002);
    col += star * mix(vec3(1.0,0.9,0.7), vec3(0.7,0.9,1.0), hash(fi+400.0));
  }
  col += falloff*0.1*vec3(0.3,0.1,0.8);
  o = vec4(clamp(col,0.0,1.0), 1.0);
}`,
  },

  // ── Cinematic ─────────────────────────────────────────────────────────────────
  {
    name: 'Film Noir',
    cat: 'cinematic',
    src: `float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5); }
void mainImage(out vec4 o, in vec2 C){
  vec2 uv = C/iResolution.xy;
  // Noise grain
  float grain = (hash(uv + fract(iTime*100.0)) - 0.5)*0.12;
  // Scanlines
  float scan = sin(uv.y * iResolution.y * 1.5)*0.04;
  // Heavy vignette
  vec2 vig = uv*2.0-1.0;
  float vignette = 1.0 - dot(vig,vig)*0.7;
  vignette = pow(max(vignette,0.0), 1.5);
  // Base: procedural light cone
  vec2 center = vec2(0.5, 0.3);
  float cone = exp(-length(uv-center)*2.5);
  vec3 col = vec3(cone*0.7 + 0.08);
  col = col * vignette + grain;
  col += scan;
  // Hard contrast
  col = pow(clamp(col,0.0,1.0), vec3(1.6));
  col = col * 0.9 + 0.02;
  o = vec4(col, 1.0);
}`,
  },
  {
    name: 'Hologram Scan',
    cat: 'cinematic',
    src: `void mainImage(out vec4 o, in vec2 C){
  vec2 uv = C/iResolution.xy;
  float t = iTime;
  // Scan line sweep
  float sweep = fract(t*0.4);
  float scanLine = smoothstep(0.01,0.0, abs(uv.y - sweep));
  // Static scan lines
  float lines = sin(uv.y * iResolution.y * 0.5) * 0.04 + 0.96;
  // Flicker
  float flicker = 0.95 + 0.05*sin(t*60.0 + uv.y*4.0);
  // Edge glow
  float edge = exp(-length((uv-0.5)*vec2(1.6,1.0))*3.0);
  // Noise interference
  float noise = fract(sin(dot(floor(uv*vec2(80.0,120.0)), vec2(127.1,311.7)))*43758.5);
  noise = step(0.98, noise)*0.3;
  vec3 base = vec3(0.0,1.0,0.6) * (0.12*lines*flicker + edge*0.4);
  base += scanLine * vec3(0.2,1.0,0.7);
  base += noise * vec3(0.0,0.8,0.5);
  o = vec4(clamp(base,0.0,1.0), 1.0);
}`,
  },
  {
    name: 'VHS Glitch',
    cat: 'cinematic',
    src: `float hash(float n){ return fract(sin(n)*43758.5453); }
void mainImage(out vec4 o, in vec2 C){
  vec2 uv = C/iResolution.xy;
  float t = iTime;
  // Band glitch
  float band = floor(uv.y * 20.0);
  float glitchStrength = step(0.85, hash(band + floor(t*8.0)));
  float shift = (hash(band + floor(t*24.0))*2.0-1.0) * 0.08 * glitchStrength;
  vec2 glitchUV = uv + vec2(shift, 0.0);
  // Chromatic aberration
  float r = texture(iChannel0, glitchUV + vec2(0.005,0)).x;
  float g = texture(iChannel0, glitchUV).x;
  float b = texture(iChannel0, glitchUV - vec2(0.005,0)).x;
  // Composite without actual image — make VHS pattern
  float scan = sin(uv.y * iResolution.y * 0.5)*0.08;
  float noise = hash(uv.y*iResolution.y + floor(t*60.0));
  float luma = 0.3 + 0.4*sin(uv.y*3.0 + t*0.5) + scan + noise*0.05;
  vec3 col = vec3(luma+shift*2.0, luma*0.95, luma-shift*2.0);
  col -= 0.2 * (1.0 - step(0.5, fract(uv.y*iResolution.y*0.5)));
  o = vec4(clamp(col,0.0,1.0), 1.0);
}`,
  },
  {
    name: 'Neon City',
    cat: 'cinematic',
    src: `float hash(float n){ return fract(sin(n)*43758.5453); }
void mainImage(out vec4 o, in vec2 C){
  vec2 uv = C/iResolution.xy;
  // Buildings
  float ground = 0.35;
  vec3 col = mix(vec3(0.01,0.0,0.04), vec3(0.06,0.02,0.12), uv.y/ground);
  float buildingX = floor(uv.x * 18.0);
  float bh = 0.15 + 0.4*hash(buildingX+10.0);
  float bw = 0.7 + 0.2*hash(buildingX+20.0);
  float isBuilding = step(uv.y, bh + ground) * step(ground, uv.y) * bw;
  col = mix(col, vec3(0.03,0.02,0.06), isBuilding);
  // Windows
  vec2 winUV = fract(vec2(uv.x*18.0, (uv.y-ground)*18.0));
  float win = step(0.15,winUV.x)*step(winUV.x,0.85)*step(0.2,winUV.y)*step(winUV.y,0.8);
  float litUp = step(0.4, hash(floor(uv.x*18.0)+floor((uv.y-ground)*18.0)*77.0+floor(iTime*0.3)*13.0));
  win *= litUp * isBuilding;
  vec3 winColor = mix(vec3(1.0,0.8,0.3), vec3(0.3,0.8,1.0), hash(uv.x*99.0));
  col += win * winColor * 0.9;
  // Neon signs glow
  float s = iTime*0.2;
  col += 0.3*exp(-abs(uv.y - 0.35)*25.0) * (0.5+0.5*sin(uv.x*20.0+s)) * vec3(1.0,0.1,0.6);
  col += 0.2*exp(-abs(uv.y - 0.35)*20.0) * (0.5+0.5*cos(uv.x*15.0-s)) * vec3(0.1,0.5,1.0);
  o = vec4(clamp(col,0.0,1.0), 1.0);
}`,
  },
  {
    name: 'Starfield Warp',
    cat: 'cinematic',
    src: `float hash(float n){ return fract(sin(n)*43758.5453); }
void mainImage(out vec4 o, in vec2 C){
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;
  float t = iTime*0.5;
  vec3 col = vec3(0.0);
  for(int i=0; i<120; i++){
    float fi = float(i);
    vec3 star = vec3(hash(fi)*2.0-1.0, hash(fi+100.0)*2.0-1.0, hash(fi+200.0));
    star.z = fract(star.z + t);
    float z = star.z;
    vec2 proj = star.xy / z;
    float size = (1.0-z)*0.005 + 0.001;
    float d = length(uv - proj);
    float glow = size / (d + size*0.5);
    glow = pow(glow, 1.5);
    float streak = max(0.0, 1.0 - abs(uv.x - proj.x)*40.0*z);
    streak *= step(uv.y, proj.y)*step(proj.y-0.05*(1.0-z), uv.y);
    col += glow * vec3(0.9,0.95,1.0) + streak*0.003*(1.0-z);
  }
  // Blue center warp gradient
  col += vec3(0.0,0.02,0.08)*exp(-length(uv)*3.0);
  o = vec4(clamp(col,0.0,1.0), 1.0);
}`,
  },
  {
    name: 'Matrix Rain',
    cat: 'cinematic',
    src: `float hash(float n){ return fract(sin(n)*43758.5453); }
float hash2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5); }
void mainImage(out vec4 o, in vec2 C){
  vec2 uv = C/iResolution.xy;
  float cols = 48.0;
  float col_idx = floor(uv.x * cols);
  float speed = 0.4 + hash(col_idx)*0.6;
  float offset = hash(col_idx+100.0);
  float t = iTime * speed + offset * 20.0;
  float char_row = floor((uv.y + fract(t)) * 28.0);
  float char_idx = hash2(vec2(col_idx, char_row + floor(t)));
  float alpha = fract(t) < 0.12 + hash(col_idx)*0.1 ? 1.0 : 0.0;
  // Fade trail
  float trail = 1.0 - fract(uv.y*28.0 + t)*0.7;
  float lit = step(0.4, char_idx) * trail;
  // Head glow
  float head = step(0.96, fract(t))*1.5;
  vec3 color = lit * (vec3(0.0,1.0,0.3)*0.8 + head*vec3(0.8,1.0,0.9));
  o = vec4(color, 1.0);
}`,
  },

  // ── Abstract ──────────────────────────────────────────────────────────────────
  {
    name: 'Liquid Metal',
    cat: 'abstract',
    src: `float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5); }
float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.0; a*=0.5; } return v; }
void mainImage(out vec4 o, in vec2 C){
  vec2 uv = C/iResolution.yy;
  float t = iTime*0.25;
  vec2 q = vec2(fbm(uv + t), fbm(uv + vec2(5.2,1.3) + t*0.7));
  vec2 r = vec2(fbm(uv + 4.0*q + vec2(1.7,9.2) + t*0.5), fbm(uv + 4.0*q + vec2(8.3,2.8) + t*0.3));
  float f = fbm(uv + 4.5*r);
  float s = f*f*2.0;
  vec3 chrome = mix(vec3(0.3,0.35,0.4), vec3(0.9,0.95,1.0), s);
  chrome = mix(chrome, vec3(0.6,0.4,0.8)*1.2, s*s);
  // Specular hotspot
  float spec = pow(max(f*1.5-0.3,0.0), 4.0);
  chrome += spec * vec3(1.0,0.95,0.9);
  o = vec4(clamp(chrome,0.0,1.0), 1.0);
}`,
  },
  {
    name: 'Kaleidoscope',
    cat: 'abstract',
    src: `float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5); }
float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
void mainImage(out vec4 o, in vec2 C){
  vec2 uv = (C - 0.5*iResolution.xy)/iResolution.y;
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  int N = 8;
  float slice = 3.14159/float(N);
  a = mod(a, 2.0*slice);
  if(a > slice) a = 2.0*slice - a;
  vec2 q = vec2(cos(a), sin(a)) * r;
  q *= 3.0;
  q += iTime*0.15;
  float n1 = noise(q);
  float n2 = noise(q*2.1 + vec2(5.2,1.3));
  float n3 = noise(q*4.3 + vec2(1.7,9.2));
  float v = n1*0.5 + n2*0.3 + n3*0.2;
  vec3 col = 0.5+0.5*cos(v*8.0 + iTime*0.5 + vec3(0.0,2.1,4.2));
  col *= smoothstep(0.7,0.4,r);
  o = vec4(col, 1.0);
}`,
  },
  {
    name: 'Aurora Borealis',
    cat: 'abstract',
    src: `float hash(float n){ return fract(sin(n)*43758.5453); }
float noise(vec2 p){ float i=floor(p.x); float f=fract(p.x); return mix(hash(i+p.y*57.0),hash(i+1.0+p.y*57.0),f*f*(3.0-2.0*f)); }
void mainImage(out vec4 o, in vec2 C){
  vec2 uv = C/iResolution.xy;
  vec3 col = mix(vec3(0.0,0.01,0.05), vec3(0.0,0.02,0.1), uv.y);
  float t = iTime*0.3;
  for(int i=0; i<5; i++){
    float fi = float(i);
    float wave = noise(vec2(uv.x*2.5+fi*3.7+t*0.5, fi))*0.5;
    float center = 0.55 + fi*0.06 + wave*0.2;
    float band = exp(-pow((uv.y - center)*8.0, 2.0));
    float shimmer = 0.6 + 0.4*sin(uv.x*15.0 + t*(1.0+fi*0.3) + fi*2.5);
    vec3 aColor;
    if(i==0) aColor=vec3(0.0,1.0,0.5);
    else if(i==1) aColor=vec3(0.0,0.5,1.0);
    else if(i==2) aColor=vec3(0.4,0.0,1.0);
    else if(i==3) aColor=vec3(0.0,1.0,0.8);
    else aColor=vec3(0.8,0.2,1.0);
    col += band * shimmer * aColor * 0.35;
  }
  // Stars
  float star = step(0.998, noise(vec2(uv.x*iResolution.x*0.2, uv.y*iResolution.y*0.2)));
  col += star * vec3(0.8,0.9,1.0) * (1.0 - uv.y*0.5);
  o = vec4(clamp(col,0.0,1.0), 1.0);
}`,
  },
  {
    name: 'Color Smoke',
    cat: 'abstract',
    src: `float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5); }
float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p, float t){ float v=0.0,a=0.5; for(int i=0;i<7;i++){ v+=a*noise(p+t*vec2(0.2,0.1)); p*=2.05; t*=1.1; a*=0.5; } return v; }
void mainImage(out vec4 o, in vec2 C){
  vec2 uv = C/iResolution.yy;
  float t = iTime*0.2;
  float s1 = fbm(uv*2.5, t);
  float s2 = fbm(uv*2.5 + vec2(3.4, 1.7), t*0.8);
  float s3 = fbm(uv*3.0 + s1*0.5, t*1.2);
  float sd = s1*s2*2.5;
  vec3 c1=vec3(0.9,0.1,0.5), c2=vec3(0.1,0.4,1.0), c3=vec3(0.8,0.6,0.0);
  vec3 col = mix(c1, c2, s1);
  col = mix(col, c3, s3*0.5);
  col *= 0.6 + sd*0.8;
  col = pow(clamp(col,0.0,1.0), vec3(0.85));
  o = vec4(col, 1.0);
}`,
  },
  {
    name: 'Crystal Growth',
    cat: 'abstract',
    src: `float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5); }
float voronoi(vec2 p, float t){
  float minD=1e9;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 g=floor(p)+vec2(x,y);
    vec2 o2=vec2(hash(g),hash(g+vec2(7.3,2.1)));
    o2=0.5+0.45*sin(t*0.5+6.28*o2);
    minD=min(minD,length(p-g-o2));
  }
  return minD;
}
void mainImage(out vec4 o, in vec2 C){
  vec2 uv = C/iResolution.yy;
  float t = iTime*0.4;
  float v1 = voronoi(uv*6.0, t);
  float v2 = voronoi(uv*12.0, t*1.3);
  float v3 = voronoi(uv*3.0, t*0.7);
  float crystal = v1*0.5 + v2*0.3 + v3*0.2;
  float edge = 1.0-smoothstep(0.02, 0.1, crystal);
  float face = pow(crystal, 1.5)*0.5;
  vec3 col = vec3(0.0);
  col += edge * (0.5+0.5*cos(iTime*0.5+v1*8.0+vec3(0.0,2.1,4.2)));
  col += face * vec3(0.1,0.3,0.6)*0.5;
  col += edge * edge * vec3(1.0)*0.8;
  o = vec4(clamp(col,0.0,1.0), 1.0);
}`,
  },
];

// ─── Category config ───────────────────────────────────────────────────────────

const CATS: { id: string; label: string; color: string }[] = [
  { id: 'audio',      label: 'Audio-Reactive', color: '#a855f7' },
  { id: 'generative', label: 'Generative',     color: '#0ea5e9' },
  { id: 'cinematic',  label: 'Cinematic',       color: '#f59e0b' },
  { id: 'abstract',   label: 'Abstract',        color: '#10b981' },
];

/** Exported shader library for use in ClipLauncher's SHADERS source tab. */
export const SHADER_LIBRARY: { name: string; src: string; category: string }[] =
  SHADERS.map(s => ({
    name:     s.name,
    src:      s.src,
    category: s.cat === 'audio'     ? 'Audio-Reactive'
             : s.cat === 'gen'      ? 'Generative'
             : s.cat === 'cinematic'? 'Cinematic'
             : 'Abstract',
  }));

// ─── Component ─────────────────────────────────────────────────────────────────

interface Props {
  active: boolean;
  error: string | null;
  onApply: (src: string) => void;
  onOff: () => void;
}

const ShaderPanel: React.FC<Props> = ({ active, error, onApply, onOff }) => {
  const [src, setSrc]         = useState(SHADERS[0].src);
  const [search, setSearch]   = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return SHADERS.filter(s => !q || s.name.toLowerCase().includes(q) || s.cat.includes(q));
  }, [search]);

  return (
    <div className="w-[380px] max-w-[95vw] flex flex-col bg-black/85 backdrop-blur-2xl border border-white/10 border-t-0 rounded-b-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
        <Code2 className="w-3.5 h-3.5 text-cyan-300" />
        <span className="text-[9px] font-black uppercase tracking-widest text-white/60 flex-1">Custom GLSL · Shadertoy-style</span>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/08">
        <Search className="w-3 h-3 text-white/25" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search shaders…"
          className="flex-1 bg-transparent text-[10px] text-white/70 placeholder-white/25 outline-none"
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-[8px] text-white/30 hover:text-white">✕</button>
        )}
      </div>

      {/* Shader library — categorized */}
      <div className="max-h-52 overflow-y-auto px-2 py-2 space-y-3 scrollbar-none">
        {CATS.map(cat => {
          const items = filtered.filter(s => s.cat === cat.id);
          if (!items.length) return null;
          return (
            <div key={cat.id}>
              <p className="text-[7px] font-black uppercase tracking-widest mb-1.5 px-1"
                style={{ color: cat.color + 'cc' }}>
                {cat.label}
              </p>
              <div className="flex flex-wrap gap-1">
                {items.map(shader => (
                  <button
                    key={shader.name}
                    onClick={() => setSrc(shader.src)}
                    className="px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-wide transition-all border"
                    style={{
                      background: src === shader.src ? cat.color + '30' : 'rgba(255,255,255,0.04)',
                      borderColor: src === shader.src ? cat.color + 'aa' : 'rgba(255,255,255,0.1)',
                      color: src === shader.src ? '#fff' : 'rgba(255,255,255,0.55)',
                    }}
                  >
                    {shader.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Editor */}
      <textarea
        value={src}
        onChange={e => setSrc(e.target.value)}
        spellCheck={false}
        className="w-full h-44 bg-black/50 border-t border-white/08 px-3 py-2 text-[10px] font-mono text-cyan-100/90 outline-none resize-none leading-relaxed scrollbar-none"
        placeholder="void mainImage(out vec4 o, in vec2 fragCoord){ ... }"
      />

      {/* Error */}
      {error && (
        <div className="flex items-start gap-1.5 px-3 py-2 bg-red-500/10 border-t border-red-500/20">
          <AlertTriangle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
          <p className="text-[8px] font-mono text-red-300 leading-snug break-words max-h-16 overflow-y-auto">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 p-2 border-t border-white/10">
        <button
          onClick={() => onApply(src)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-cyan-600/40 hover:bg-cyan-600/60 border border-cyan-400/40 text-[10px] font-black uppercase tracking-widest text-white transition-all"
        >
          <Play className="w-3 h-3" /> Apply
        </button>
        <button
          onClick={onOff}
          disabled={!active}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/70 disabled:opacity-40 transition-all"
        >
          <Power className="w-3 h-3" /> Off
        </button>
      </div>

      {/* Uniforms reference */}
      <p className="px-3 pb-2 text-[7px] text-white/20 leading-relaxed">
        Uniforms: iResolution · iTime · iTimeDelta · iFrame · iMouse · iChannel0 (row0=FFT row1=wave) · iBass · iMid · iTreble · iLevel
      </p>
    </div>
  );
};

export default ShaderPanel;
