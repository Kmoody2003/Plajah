const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./butterchurn-Bihc8VeM.js","./index-CRiTVTbV.js","./index-Hqe5UCLM.css","./butterchurnPresets.min-Cyk78dhK.js"])))=>i.map(i=>d[i]);
import{M as Ne,A as Xe}from"./mp4-muxer-BsaJqcyo.js";import{A as Ge}from"./audioDrivers-Djt62lbV.js";import{aL as Me,r as P,j as qe}from"./index-CRiTVTbV.js";function Ve(i){const t={alpha:!1,antialias:!1,depth:!1,stencil:!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0,powerPreference:"high-performance",desynchronized:!1};return i.getContext("webgl2",t)??null}function Se(i,t,e){const o=i.createShader(t);if(i.shaderSource(o,e),i.compileShader(o),!i.getShaderParameter(o,i.COMPILE_STATUS)){const a=i.getShaderInfoLog(o);throw i.deleteShader(o),new Error(`[PixelsCore] shader compile failed: ${a}
${$e(e)}`)}return o}function Z(i,t,e){const o=Se(i,i.VERTEX_SHADER,t),a=Se(i,i.FRAGMENT_SHADER,e),n=i.createProgram();if(i.attachShader(n,o),i.attachShader(n,a),i.linkProgram(n),i.deleteShader(o),i.deleteShader(a),!i.getProgramParameter(n,i.LINK_STATUS)){const r=i.getProgramInfoLog(n);throw i.deleteProgram(n),new Error(`[PixelsCore] program link failed: ${r}`)}return n}function me(i){const t=i.createVertexArray();i.bindVertexArray(t);const e=i.createBuffer();return i.bindBuffer(i.ARRAY_BUFFER,e),i.bufferData(i.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),i.STATIC_DRAW),i.enableVertexAttribArray(0),i.vertexAttribPointer(0,2,i.FLOAT,!1,0,0),i.bindVertexArray(null),t}function ee(i,t,e,o){if(o&&o.width===t&&o.height===e)return o;o&&(i.deleteTexture(o.tex),i.deleteFramebuffer(o.fbo));const a=i.createTexture();i.bindTexture(i.TEXTURE_2D,a),i.texImage2D(i.TEXTURE_2D,0,i.RGBA8,t,e,0,i.RGBA,i.UNSIGNED_BYTE,null),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE);const n=i.createFramebuffer();return i.bindFramebuffer(i.FRAMEBUFFER,n),i.framebufferTexture2D(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,a,0),i.bindFramebuffer(i.FRAMEBUFFER,null),{fbo:n,tex:a,width:t,height:e}}function He(i){const t=i.createTexture();return i.bindTexture(i.TEXTURE_2D,t),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE),t}function ze(i,t,e){const o=e.videoWidth??e.naturalWidth??e.width??0,a=e.videoHeight??e.naturalHeight??e.height??0;if(!o||!a)return!1;i.bindTexture(i.TEXTURE_2D,t),i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,1);try{i.texImage2D(i.TEXTURE_2D,0,i.RGBA,i.RGBA,i.UNSIGNED_BYTE,e)}catch{return i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,0),!1}return i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,0),!0}function $e(i){return i.split(`
`).map((t,e)=>`${String(e+1).padStart(3)}| ${t}`).join(`
`)}const We={normal:0,screen:1,add:2,multiply:3,overlay:4,lighten:5,darken:6,difference:7,exclusion:8,"color-dodge":9,"hard-light":10},ve=`#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`,je=`#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uDst;   // accumulator (what's already composited)
uniform sampler2D uSrc;   // this layer
uniform float uOpacity;
uniform int uMode;
uniform vec2 uTrans;      // per-layer translate (UV fraction); 0 = none
uniform float uScale;     // per-layer scale; 1 = none
uniform float uRot;       // per-layer rotation (radians); 0 = none

vec3 blend(int m, vec3 d, vec3 s) {
  if (m == 1) return d + s - d * s;                 // screen
  if (m == 2) return min(d + s, vec3(1.0));         // add (plus-lighter)
  if (m == 3) return d * s;                         // multiply
  if (m == 4) return mix(2.0*d*s, 1.0-2.0*(1.0-d)*(1.0-s), step(0.5, d)); // overlay
  if (m == 5) return max(d, s);                     // lighten
  if (m == 6) return min(d, s);                     // darken
  if (m == 7) return abs(d - s);                    // difference
  if (m == 8) return d + s - 2.0*d*s;               // exclusion
  if (m == 9) return min(vec3(1.0), d / max(1.0 - s, 1e-4)); // color-dodge
  if (m == 10) return mix(2.0*d*s, 1.0-2.0*(1.0-d)*(1.0-s), step(0.5, s)); // hard-light
  return s;                                         // normal
}

void main() {
  // Per-layer transform: rotate + scale about centre, then translate. Identity
  // (uTrans=0,uScale=1,uRot=0) reduces to suv == vUv. Outside [0,1] → transparent
  // so a moved/scaled layer reveals what's beneath it.
  vec2 suv = vUv - 0.5;
  float cs = cos(uRot), sn = sin(uRot);
  suv = mat2(cs, sn, -sn, cs) * suv;
  suv = suv / max(uScale, 1e-3);
  suv += 0.5 - uTrans;
  float inb = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
  vec4 dst = texture(uDst, vUv);
  vec4 src = texture(uSrc, clamp(suv, 0.0, 1.0)) * inb;
  float a = src.a * uOpacity;
  vec3 blended = blend(uMode, dst.rgb, src.rgb);
  outColor = vec4(mix(dst.rgb, blended, a), clamp(dst.a + a, 0.0, 1.0));
}`,Ke=`#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uShakeOff;
uniform float uShakeSin, uShakeCos, uShakeScale;
void main() {
  vec2 uv = vUv - 0.5;
  uv = mat2(uShakeCos, -uShakeSin, uShakeSin, uShakeCos) * uv; // rotate about centre
  uv = uv / uShakeScale + 0.5 + uShakeOff;                     // overscan + translate
  outColor = vec4(texture(uTex, clamp(uv, 0.0, 1.0)).rgb, 1.0);
}`,Ye=`#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform float uBright, uContrast, uSat, uGamma;
void main() {
  vec3 c = texture(uTex, vUv).rgb;
  c = (c - 0.5) * uContrast + 0.5;            // contrast around mid-grey
  c *= uBright;                                // brightness
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSat);                   // saturation
  c = pow(max(c, 0.0), vec3(1.0 / max(uGamma, 0.01))); // gamma
  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;function Qe(i){return i.brightness===1&&i.contrast===1&&i.saturation===1&&i.gamma===1}const Je={offX:0,offY:0,sin:0,cos:1,scale:1};class Ue{constructor(t){this.canvas=t,this.uShake={},this.gradeU={},this.width=0,this.height=0,this.disposed=!1;const e=Ve(t);if(!e)throw new Error("[PixelsCore] WebGL2 unavailable");this.gl=e,this.quad=me(e),this.compositeProg=Z(e,ve,je),this.presentProg=Z(e,ve,Ke),this.gradeProg=Z(e,ve,Ye),this.uDst=e.getUniformLocation(this.compositeProg,"uDst"),this.uSrc=e.getUniformLocation(this.compositeProg,"uSrc"),this.uOpacity=e.getUniformLocation(this.compositeProg,"uOpacity"),this.uMode=e.getUniformLocation(this.compositeProg,"uMode"),this.uTrans=e.getUniformLocation(this.compositeProg,"uTrans"),this.uScale=e.getUniformLocation(this.compositeProg,"uScale"),this.uRot=e.getUniformLocation(this.compositeProg,"uRot"),this.uPresentTex=e.getUniformLocation(this.presentProg,"uTex");for(const o of["uShakeOff","uShakeSin","uShakeCos","uShakeScale"])this.uShake[o]=e.getUniformLocation(this.presentProg,o);for(const o of["uTex","uBright","uContrast","uSat","uGamma"])this.gradeU[o]=e.getUniformLocation(this.gradeProg,o);this.srcTex=He(e)}resize(t,e){t=Math.max(1,Math.round(t)),e=Math.max(1,Math.round(e)),!(t===this.width&&e===this.height&&this.ping)&&(this.width=t,this.height=e,this.canvas.width=t,this.canvas.height=e,this.ping=ee(this.gl,t,e,this.ping),this.pong=ee(this.gl,t,e,this.pong))}composite(t){var o;const e=this.gl;if(!(!this.ping||!this.pong)){e.bindVertexArray(this.quad),e.disable(e.BLEND),e.bindFramebuffer(e.FRAMEBUFFER,this.ping.fbo),e.viewport(0,0,this.width,this.height),e.clearColor(0,0,0,1),e.clear(e.COLOR_BUFFER_BIT),e.useProgram(this.compositeProg),e.uniform1i(this.uDst,0),e.uniform1i(this.uSrc,1);for(const a of t){let n=null;if(a.texture?n=a.texture:a.element&&ze(e,this.srcTex,a.element)&&(n=this.srcTex),!n)continue;e.bindFramebuffer(e.FRAMEBUFFER,this.pong.fbo),e.viewport(0,0,this.width,this.height),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.ping.tex),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,n),e.uniform1f(this.uOpacity,Math.max(0,Math.min(1,a.opacity))),e.uniform1i(this.uMode,We[(o=a.blendMode)==null?void 0:o.toLowerCase()]??0);const r=a.transform;e.uniform2f(this.uTrans,(r==null?void 0:r.x)??0,(r==null?void 0:r.y)??0),e.uniform1f(this.uScale,(r==null?void 0:r.scale)??1),e.uniform1f(this.uRot,(r==null?void 0:r.rot)??0),e.drawArrays(e.TRIANGLES,0,3);const s=this.ping;this.ping=this.pong,this.pong=s}e.bindVertexArray(null)}}get outputTexture(){var t;return(t=this.ping)==null?void 0:t.tex}present(t=Je){const e=this.gl;this.ping&&(e.bindFramebuffer(e.FRAMEBUFFER,null),e.viewport(0,0,this.width,this.height),e.useProgram(this.presentProg),e.bindVertexArray(this.quad),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.ping.tex),e.uniform1i(this.uPresentTex,0),e.uniform2f(this.uShake.uShakeOff,t.offX,t.offY),e.uniform1f(this.uShake.uShakeSin,t.sin),e.uniform1f(this.uShake.uShakeCos,t.cos),e.uniform1f(this.uShake.uShakeScale,t.scale),e.drawArrays(e.TRIANGLES,0,3),e.bindVertexArray(null))}applyGrade(t){const e=this.gl;if(!this.ping||!this.pong)return;e.bindFramebuffer(e.FRAMEBUFFER,this.pong.fbo),e.viewport(0,0,this.width,this.height),e.useProgram(this.gradeProg),e.bindVertexArray(this.quad),e.disable(e.BLEND),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.ping.tex),e.uniform1i(this.gradeU.uTex,0),e.uniform1f(this.gradeU.uBright,t.brightness),e.uniform1f(this.gradeU.uContrast,t.contrast),e.uniform1f(this.gradeU.uSat,t.saturation),e.uniform1f(this.gradeU.uGamma,t.gamma),e.drawArrays(e.TRIANGLES,0,3),e.bindVertexArray(null);const o=this.ping;this.ping=this.pong,this.pong=o}render(t,e,o){this.disposed||(this.composite(t),e&&!Qe(e)&&this.applyGrade(e),this.present(o))}dispose(){this.disposed=!0;const t=this.gl;this.ping&&(t.deleteTexture(this.ping.tex),t.deleteFramebuffer(this.ping.fbo)),this.pong&&(t.deleteTexture(this.pong.tex),t.deleteFramebuffer(this.pong.fbo)),t.deleteTexture(this.srcTex),t.deleteProgram(this.compositeProg),t.deleteProgram(this.presentProg),t.deleteProgram(this.gradeProg)}}const Ze=`#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`,S=`#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 iResolution;
uniform float iTime;
uniform sampler2D iChannel0;            // row 0.25 = FFT, row 0.75 = waveform
uniform float iBass, iMid, iTreble, iLevel;
uniform vec3 iC0, iC1, iC2;
uniform float iParam0, iParam1, iParam2, iParam3;
float fft(float x){ return texture(iChannel0, vec2(clamp(x,0.0,1.0), 0.25)).r; }
float wave(float x){ return texture(iChannel0, vec2(clamp(x,0.0,1.0), 0.75)).r; }
`,et=S+`
void main(){
  vec2 uv = vUv;
  float w = wave(uv.x);                 // 0..1, 0.5 = silence
  float amp = (w - 0.5) * 2.0;          // -1..1
  float y = 0.5 + amp * (0.18 + iLevel * 0.30);
  float d = abs(uv.y - y);
  float core = smoothstep(0.010, 0.0, d);
  float glow = smoothstep(0.060, 0.0, d) * 0.6;
  vec3 col = mix(iC1, iC0, uv.x) * (glow) + vec3(1.0) * core * 0.9;
  fragColor = vec4(col, 1.0);
}`,tt=S+`
void main(){
  vec2 p = vUv - 0.5;
  p.x *= iResolution.x / max(iResolution.y, 1.0);
  float ang = atan(p.y, p.x);
  float a01 = (ang + 3.14159265) / 6.2831853;        // 0..1 around the ring
  float rad = length(p);
  const float BARS = 96.0;
  float bi = floor(a01 * BARS) / BARS;
  float mag = fft(bi);                               // bar height from FFT
  float inner = 0.12;
  float outer = inner + 0.05 + mag * 0.34;
  float band = step(inner, rad) * step(rad, outer);  // filled bar
  float gap = smoothstep(0.0, 0.06, abs(fract(a01 * BARS) - 0.5)); // bar gaps
  float v = band * gap;
  vec3 col = mix(iC2, iC0, mag) * v;
  col += iC1 * smoothstep(0.02, 0.0, abs(rad - outer)) * v; // bright tip
  fragColor = vec4(col, 1.0);
}`,it=S+`
void main(){
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  vec2 p = vUv - 0.5; p.x *= aspect;
  float r = length(p);
  float f = fft(clamp(r * 1.2, 0.0, 1.0));
  // receding rings, treble sharpens them
  float rings = smoothstep(0.5, 0.0, abs(fract(r * 9.0 - iTime * 0.6) - 0.5)) ;
  rings *= 0.4 + iTreble * 1.6;
  vec3 col = mix(iC2, iC0, f) * rings * (0.5 + f * 1.6);
  col *= smoothstep(0.0, 0.10, r); // fade the throat
  fragColor = vec4(col, 1.0);
}`,ot=S+`
void main(){
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  vec2 p = vUv - 0.5; p.x *= aspect;
  float r = length(p);
  float a = atan(p.y, p.x);
  float spiral = sin(a * 3.0 + r * 18.0 - iTime * 2.0);
  float m = smoothstep(0.45, 0.95, spiral);
  float f = fft(clamp(r, 0.0, 1.0));
  vec3 col = mix(iC1, iC0, clamp(r * 1.5, 0.0, 1.0)) * m * (0.5 + iLevel * 1.2 + f);
  col *= smoothstep(0.62, 0.0, r);
  fragColor = vec4(col, 1.0);
}`,rt=S+`
void main(){
  vec2 p = vUv;
  float n = 0.0;
  for (int i = 1; i <= 5; i++) {
    float fi = float(i);
    n += sin(p.x * fi * 6.0 + iTime * 0.5 * fi + p.y * 3.0) * 0.5 / fi;
  }
  float band = 0.5 + 0.5 * n;
  float glow = smoothstep(0.28, 0.92, band + iLevel * 0.45);
  vec3 col = mix(iC2, iC0, band) * glow;
  col += iC1 * pow(glow, 3.0) * 0.5;
  fragColor = vec4(col, 1.0);
}`,nt=S+`
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  vec2 p = (vUv - 0.5); p.x *= aspect;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float t = iTime * (0.3 + fi * 0.15);
    vec2 q = p * (3.0 + fi * 3.0);
    vec2 id = floor(q * 8.0);
    vec2 gv = fract(q * 8.0) - 0.5;
    float h = hash(id + fi * 19.0);
    float star = smoothstep(0.14, 0.0, length(gv)) * step(0.86, h);
    float tw = 0.5 + 0.5 * sin(t * 6.0 + h * 30.0);
    col += mix(iC2, iC0, h) * star * tw * (0.5 + iLevel);
  }
  col += iC1 * smoothstep(0.7, 0.0, length(p)) * iBass * 0.6;  // core warp glow
  fragColor = vec4(col, 1.0);
}`,at=S+`
void main(){
  vec2 uv = vUv;
  float horizon = 0.5;
  vec3 col = vec3(0.0);
  if (uv.y < horizon) {
    float z = 1.0 / ((horizon - uv.y) + 0.02);
    float gx = abs(fract((uv.x - 0.5) * z) - 0.5);
    float gz = abs(fract(z * 0.5 - iTime) - 0.5);
    float line = smoothstep(0.04, 0.0, gx) + smoothstep(0.04, 0.0, gz);
    col = mix(iC1, iC0, 0.5) * line * smoothstep(0.0, 0.4, horizon - uv.y) * (0.6 + iLevel);
  } else {
    float sun = smoothstep(0.25, 0.0, length((uv - vec2(0.5, horizon + 0.18)) * vec2(1.0, 1.4)));
    col = mix(iC2 * 0.2, iC0, sun * (0.6 + iBass));
  }
  fragColor = vec4(col, 1.0);
}`,st=S+`
void main(){
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  vec2 p = (vUv - 0.5); p.x *= aspect;
  float seg = 8.0 + floor(iMid * 8.0);
  float a = atan(p.y, p.x);
  float r = length(p);
  a = mod(a, 6.2831853 / seg);
  a = abs(a - 3.14159265 / seg);
  vec2 q = vec2(cos(a), sin(a)) * r;
  float f = fft(clamp(r * 1.5, 0.0, 1.0));
  float pat = 0.5 + 0.5 * sin(q.x * 20.0 + iTime * 1.5) * sin(q.y * 20.0 - iTime * 1.2);
  float v = pat * smoothstep(0.72, 0.0, r) * (0.4 + f * 1.5);
  vec3 col = mix(iC2, iC0, pat) * v + iC1 * f * 0.4;
  fragColor = vec4(col, 1.0);
}`,ct=S+`
void main(){
  vec2 uv = vUv;
  float panels = 14.0;
  float idx = floor(uv.x * panels);
  float f = fft(idx / panels);
  float h = 0.08 + f * 0.82;                     // panel height from its bin
  float panel = step(1.0 - h, uv.y);
  float gap = smoothstep(0.0, 0.02, abs(fract(uv.x * panels) - 0.5) - 0.42);
  float v = panel * (1.0 - gap);
  vec3 col = mix(iC2, iC0, f) * v * (0.5 + f);
  col += iC1 * smoothstep(0.03, 0.0, abs(uv.y - (1.0 - h))) * v; // bright top edge
  fragColor = vec4(col, 1.0);
}`,lt=S+`
void main(){
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  vec2 p = (vUv - 0.5); p.x *= aspect;
  float v = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 c = vec2(sin(iTime * 0.5 + fi * 1.3) * 0.3, cos(iTime * 0.4 + fi * 2.1) * 0.3);
    float r = 0.12 + 0.06 * sin(iTime * 1.5 + fi) + iBass * 0.05;
    v += smoothstep(r, r * 0.3, length(p - c));
  }
  v = smoothstep(0.6, 1.2, v);                    // metaball threshold
  vec3 col = mix(iC2, iC0, v) * v * (0.6 + iLevel);
  fragColor = vec4(col, 1.0);
}`,ut=S+`
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }
void main(){
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  vec2 p = (vUv - 0.5); p.x *= aspect;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 40; i++) {
    float fi = float(i);
    float a = h2(vec2(fi, 1.0)), b = h2(vec2(fi, 2.0));
    float ang = a * 6.2831853 + iTime * (0.2 + b * 0.5);
    float rad = 0.1 + b * 0.4 + sin(iTime + fi) * 0.05 + iBass * 0.12;
    vec2 pos = vec2(cos(ang), sin(ang)) * rad;
    col += mix(iC0, iC1, a) * smoothstep(0.02, 0.0, length(p - pos)) * (0.5 + iLevel);
  }
  fragColor = vec4(col, 1.0);
}`,ft=S+`
void main(){
  vec2 uv = vUv;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float y = 0.5 + 0.2 * sin(uv.x * 3.0 + iTime * 0.5 + fi * 1.2) + 0.1 * sin(uv.x * 7.0 - iTime * 0.3 + fi);
    col += mix(iC2, iC0, fi / 5.0) * smoothstep(0.08, 0.0, abs(uv.y - y)) * (0.4 + iMid);
  }
  fragColor = vec4(col, 1.0);
}`,mt=S+`
void main(){
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  vec2 p = (vUv - 0.5); p.x *= aspect;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    vec2 c = vec2(sin(iTime * 0.3 + fi) * 0.35, cos(iTime * 0.25 + fi * 1.7) * 0.35);
    col += mix(iC0, iC2, fi / 7.0) * smoothstep(0.25, 0.0, length(p - c)) * (0.5 + iLevel * 0.8);
  }
  fragColor = vec4(col, 1.0);
}`,dt=S+`
void main(){
  vec2 uv = vUv * vec2(5.0, 3.0);
  vec2 id = floor(uv);
  vec2 gv = fract(uv) - 0.5;
  float h = fract(sin(dot(id, vec2(12.9, 78.2))) * 43758.5);
  float shape;
  if (h < 0.33) shape = smoothstep(0.40, 0.35, length(gv));
  else if (h < 0.66) shape = step(max(abs(gv.x), abs(gv.y)), 0.38);
  else shape = step(gv.y, 0.38 - abs(gv.x) * 1.5) * step(-0.38, gv.y);
  float f = fft(h);
  vec3 col = mix(iC2, iC0, h) * shape * (0.5 + f);
  fragColor = vec4(col, 1.0);
}`,ht=S+`
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
void main(){
  vec2 uv = vUv;
  float clouds = 0.0; vec2 q = uv * 3.0 + vec2(iTime * 0.05, 0.0);
  for (int i = 0; i < 4; i++) { clouds += noise(q) * pow(0.5, float(i + 1)); q *= 2.0; }
  vec3 col = mix(vec3(0.02, 0.02, 0.05), iC2 * 0.4, clouds);
  float rain = step(0.97, h(vec2(floor(uv.x * 200.0), floor((uv.y + iTime * 2.0) * 40.0))));
  col += vec3(0.6) * rain * 0.3;
  col += iC0 * smoothstep(0.6, 1.0, iBass) * clouds * 2.0;   // lightning flash
  fragColor = vec4(col, 1.0);
}`,pt=S+`
void main(){
  vec2 uv = vUv;
  float v = 0.5 + 0.5 * sin(uv.x * 8.0 + iTime) * sin(uv.y * 8.0 - iTime * 0.7);
  v = pow(v, 1.0 + iTreble * 3.0);
  vec3 col = mix(iC2, iC0, v) * (0.3 + iLevel * 1.4) + iC1 * iBass * 0.5;
  fragColor = vec4(col, 1.0);
}`,vt=S+`
float hn(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }
void main(){
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  vec2 p = (vUv - 0.5); p.x *= aspect;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 60; i++) {
    float fi = float(i);
    float a = hn(vec2(fi, 1.0)), b = hn(vec2(fi, 2.0)), c = hn(vec2(fi, 3.0));
    float ang = a * 6.2831853 + iTime * 0.1 * (0.5 + b);
    vec2 pos = vec2(cos(ang), sin(ang)) * (0.05 + c * 0.45) * (1.0 + iBass * 0.3);
    col += mix(iC2, iC0, a) * smoothstep(0.03, 0.0, length(p - pos)) * (0.4 + iLevel);
  }
  fragColor = vec4(col, 1.0);
}`,gt=S+`
void main(){
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  vec2 p = (vUv - 0.5); p.x *= aspect;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 c = vec2(sin(iTime * 0.3 + fi * 1.6), cos(iTime * 0.4 + fi * 2.1)) * 0.3;
    float d = length(p - c);
    col += mix(iC0, iC1, fi / 4.0) * (0.02 + iLevel * 0.04) / (d * d + 0.01);
  }
  fragColor = vec4(min(col, vec3(1.5)), 1.0);
}`,xt=S+`
void main(){
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  vec2 p = (vUv - 0.5); p.x *= aspect;
  float seg = 6.0;
  float a = atan(p.y, p.x); float r = length(p);
  a = mod(a, 6.2831853 / seg); a = abs(a - 3.14159265 / seg);
  vec2 q = vec2(cos(a), sin(a)) * r;
  float grid = step(0.9, max(sin(q.x * 20.0 + iTime), sin(q.y * 20.0 - iTime)));
  vec3 col = mix(iC2, iC0, r * 1.5) * grid * smoothstep(0.7, 0.0, r) * (0.5 + iMid);
  fragColor = vec4(col, 1.0);
}`,bt=S+`
void main(){
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  vec2 p = (vUv - 0.5); p.x *= aspect;
  float r = length(p);
  float v = 0.5 + 0.5 * sin(r * 40.0 - iTime * 4.0 - iBass * 10.0);
  v *= smoothstep(0.7, 0.0, r);
  vec3 col = mix(iC2, iC0, v) * (0.4 + iLevel) + iC1 * smoothstep(0.95, 1.0, v) * 0.5;
  fragColor = vec4(col, 1.0);
}`,_e={WAVEFORM:et,SPECTRUM:tt,TUNNEL:it,VORTEX:ot,NEBULA:rt,COSMIC:nt,RETROGRID:at,KALEIDOSCOPE:st,STAGE:ct,LIQUID:lt,PARTICLES:ut,STORM:ht,LUMINANCE:pt,STUDIO_AURORA:ft,STUDIO_CHROME:mt,STUDIO_BAUHAUS:dt,STUDIO_NEBULA:vt,STUDIO_GRAVITY:gt,STUDIO_KINETIC:xt,STUDIO_RIPPLE:bt};function Ee(i){return!!i&&i in _e}class Re{constructor(t){this.gl=t,this.progs=new Map,this.pool=new Map,this.quad=me(t)}program(t){let e=this.progs.get(t);if(!e){const o=Z(this.gl,Ze,_e[t]),a={};for(const n of["iResolution","iTime","iChannel0","iBass","iMid","iTreble","iLevel","iC0","iC1","iC2","iParam0","iParam1","iParam2","iParam3"])a[n]=this.gl.getUniformLocation(o,n);e={p:o,u:a},this.progs.set(t,e)}return e}render(t,e,o,a,n){const r=this.gl,s=ee(r,o,a,this.pool.get(t));this.pool.set(t,s);const{p:c,u:l}=this.program(e);r.bindFramebuffer(r.FRAMEBUFFER,s.fbo),r.viewport(0,0,o,a),r.disable(r.BLEND),r.useProgram(c),r.bindVertexArray(this.quad),r.activeTexture(r.TEXTURE2),r.bindTexture(r.TEXTURE_2D,n.audio.tex),r.uniform1i(l.iChannel0,2),r.uniform2f(l.iResolution,o,a),r.uniform1f(l.iTime,n.time),r.uniform1f(l.iBass,n.audio.bass),r.uniform1f(l.iMid,n.audio.mid),r.uniform1f(l.iTreble,n.audio.treble),r.uniform1f(l.iLevel,n.audio.level);const u=f=>n.colors[f]??[1,1,1];return r.uniform3f(l.iC0,u(0)[0],u(0)[1],u(0)[2]),r.uniform3f(l.iC1,u(1)[0],u(1)[1],u(1)[2]),r.uniform3f(l.iC2,u(2)[0],u(2)[1],u(2)[2]),r.uniform1f(l.iParam0,n.params[0]??.5),r.uniform1f(l.iParam1,n.params[1]??.5),r.uniform1f(l.iParam2,n.params[2]??.5),r.uniform1f(l.iParam3,n.params[3]??.5),r.drawArrays(r.TRIANGLES,0,3),r.bindVertexArray(null),s.tex}dispose(){const t=this.gl;this.pool.forEach(e=>{t.deleteTexture(e.tex),t.deleteFramebuffer(e.fbo)}),this.progs.forEach(e=>t.deleteProgram(e.p)),this.pool.clear(),this.progs.clear()}}function Fe(i){const t=/^#?([0-9a-f]{6})$/i.exec(i||"");if(!t)return[1,1,1];const e=parseInt(t[1],16);return[(e>>16&255)/255,(e>>8&255)/255,(e&255)/255]}const Tt=`#version 300 es
layout(location=0) in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`,yt=`#version 300 es
precision highp float;
out vec4 _frag;
uniform vec3 iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform vec4 iMouse;
uniform sampler2D iChannel0;
uniform float iBass, iMid, iTreble, iLevel;
uniform float iParam0, iParam1, iParam2, iParam3;
`,Et=`
void main(){ vec4 c = vec4(0.0,0.0,0.0,1.0); mainImage(c, gl_FragCoord.xy); _frag = c; }
`,Rt=["iResolution","iTime","iTimeDelta","iFrame","iMouse","iChannel0","iBass","iMid","iTreble","iLevel","iParam0","iParam1","iParam2","iParam3"];class we{constructor(t){this.gl=t,this.progs=new Map,this.pool=new Map,this.quad=me(t)}program(t){let e=this.progs.get(t);if(!e){let o=null;try{o=Z(this.gl,Tt,yt+`
`+t+`
`+Et)}catch(n){console.warn("[ShaderRenderer] compile failed:",(n==null?void 0:n.message)||n),o=null}const a={};if(o)for(const n of Rt)a[n]=this.gl.getUniformLocation(o,n);e={p:o,u:a},this.progs.set(t,e)}return e}render(t,e,o,a,n){const r=this.gl,s=ee(r,o,a,this.pool.get(t));this.pool.set(t,s);const{p:c,u:l}=this.program(e);return r.bindFramebuffer(r.FRAMEBUFFER,s.fbo),r.viewport(0,0,o,a),c?(r.disable(r.BLEND),r.useProgram(c),r.bindVertexArray(this.quad),r.activeTexture(r.TEXTURE2),r.bindTexture(r.TEXTURE_2D,n.audio.tex),r.uniform1i(l.iChannel0,2),r.uniform3f(l.iResolution,o,a,1),r.uniform1f(l.iTime,n.time),r.uniform1f(l.iTimeDelta,1/60),r.uniform1i(l.iFrame,Math.max(0,Math.floor(n.time*60))),r.uniform4f(l.iMouse,0,0,0,0),r.uniform1f(l.iBass,n.audio.bass),r.uniform1f(l.iMid,n.audio.mid),r.uniform1f(l.iTreble,n.audio.treble),r.uniform1f(l.iLevel,n.audio.level),r.uniform1f(l.iParam0,n.params[0]??.5),r.uniform1f(l.iParam1,n.params[1]??.5),r.uniform1f(l.iParam2,n.params[2]??.5),r.uniform1f(l.iParam3,n.params[3]??.5),r.drawArrays(r.TRIANGLES,0,3),r.bindVertexArray(null),s.tex):(r.clearColor(0,0,0,0),r.clear(r.COLOR_BUFFER_BIT),s.tex)}dispose(){const t=this.gl;this.progs.forEach(e=>{e.p&&t.deleteProgram(e.p)}),this.pool.forEach(e=>{t.deleteTexture(e.tex),t.deleteFramebuffer(e.fbo)}),this.progs.clear(),this.pool.clear()}}let ge=null;async function wt(){return ge||(ge=(async()=>{const[i,t]=await Promise.all([Me(()=>import("./butterchurn-Bihc8VeM.js").then(n=>n.b),__vite__mapDeps([0,1,2]),import.meta.url),Me(()=>import("./butterchurnPresets.min-Cyk78dhK.js").then(n=>n.b),__vite__mapDeps([3,1,2]),import.meta.url)]),e=i.default||i,o=t.default||t,a=(o.getPresets?o.getPresets():o)||{};return{butterchurn:e,presets:a,names:Object.keys(a)}})()),ge}async function Le(i){var t;try{const{butterchurn:e,presets:o,names:a}=await wt();if(!a.length)return null;const n=i.fps||30,r=document.createElement("canvas");r.width=Math.max(2,i.width),r.height=Math.max(2,i.height);const s=e.createVisualizer(i.audioCtx,r,{width:r.width,height:r.height,pixelRatio:1,textureRatio:1}),c=((t=s.audio)==null?void 0:t.fftSize)||1024,l=new Uint8Array(c).fill(128);if(i.analyser)try{s.connectAudio(i.analyser)}catch{}const u=(f,m=0)=>{let d;typeof f=="string"?d=a.includes(f)?f:a[0]:d=a[(f%a.length+a.length)%a.length];try{s.loadPreset(o[d],m)}catch{}};return{canvas:r,presetCount:a.length,setPreset:u,renderFrame(f){try{f&&f.length?(Mt(f,l),s.render({audioLevels:{timeByteArray:l,timeByteArrayL:l,timeByteArrayR:l},elapsedTime:1/n})):s.render()}catch{}},resize(f,m){r.width=Math.max(2,f),r.height=Math.max(2,m);try{s.setRendererSize(r.width,r.height)}catch{}},dispose(){var f;try{(f=s.disconnectAudio)==null||f.call(s,i.analyser)}catch{}}}}catch(e){return console.warn("[milkdropDriver] butterchurn unavailable:",e),null}}function Mt(i,t){const e=t.length,o=i.length;if(o<2){t.fill(i[0]??128);return}for(let a=0;a<e;a++){const n=a/(e-1)*(o-1),r=Math.floor(n),s=Math.min(o-1,r+1),c=n-r;t[a]=i[r]*(1-c)+i[s]*c|0}}const St=`#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uInput;
uniform vec2 uResolution;
uniform float uTime;
uniform float iBass, iMid, iTreble, iLevel;
uniform float P0,P1,P2,P3,P4,P5,P6,P7;
vec4 inp(vec2 uv){ return texture(uInput, clamp(uv, 0.0, 1.0)); }
vec3 rgb2hsv(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g)); vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r)); float d=q.x-min(q.w,q.y); float e=1e-10; return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)), d/(q.x+e), q.x); }
vec3 hsv2rgb(vec3 c){ vec4 K=vec4(1.,2./3.,1./3.,3.); vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www); return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y); }
`,Ct=`
void main(){ outColor = fx(vUv); }
`,At=[{id:"invert",name:"Invert",params:[{key:"amt",label:"Amount",min:0,max:1,default:1}],glsl:"vec4 fx(vec2 uv){ vec4 c=inp(uv); return vec4(mix(c.rgb, 1.0-c.rgb, P0), c.a); }"},{id:"color",name:"Color",params:[{key:"bri",label:"Brightness",min:0,max:3,default:1},{key:"con",label:"Contrast",min:0,max:3,default:1},{key:"sat",label:"Saturation",min:0,max:3,default:1},{key:"hue",label:"Hue",min:-180,max:180,default:0}],glsl:"vec4 fx(vec2 uv){ vec4 c=inp(uv); vec3 h=rgb2hsv(c.rgb); h.x=fract(h.x+P3/360.0); h.y*=P2; vec3 r=hsv2rgb(h); r=(r-0.5)*P1+0.5; r*=P0; return vec4(clamp(r,0.0,1.0), c.a); }"},{id:"blur",name:"Blur",params:[{key:"rad",label:"Radius (px)",min:0,max:24,default:4}],glsl:"vec4 fx(vec2 uv){ vec2 px=P0/uResolution; vec4 s=vec4(0.0); float w=0.0; for(int i=-4;i<=4;i++){ for(int j=-4;j<=4;j++){ float g=exp(-float(i*i+j*j)/8.0); s+=inp(uv+vec2(float(i),float(j))*px*0.6)*g; w+=g; } } return s/max(w,1e-3); }"},{id:"glow",name:"Glow",params:[{key:"int",label:"Intensity",min:0,max:2,default:.6},{key:"rad",label:"Radius (px)",min:0,max:30,default:10}],glsl:"vec4 fx(vec2 uv){ vec4 base=inp(uv); vec2 px=P1/uResolution; vec3 b=vec3(0.0); float w=0.0; for(int i=-4;i<=4;i++){ for(int j=-4;j<=4;j++){ float g=exp(-float(i*i+j*j)/8.0); vec3 s=inp(uv+vec2(float(i),float(j))*px*0.7).rgb; b+=max(s-0.6,0.0)*g; w+=g; } } return vec4(base.rgb + (b/max(w,1e-3))*P0*3.0, base.a); }"},{id:"pixelate",name:"Pixelate",params:[{key:"size",label:"Cell",min:1,max:80,default:12}],glsl:"vec4 fx(vec2 uv){ vec2 d=P0/uResolution; vec2 q=(floor(uv/d)+0.5)*d; return inp(q); }"},{id:"rgbshift",name:"RGB Shift",params:[{key:"amt",label:"Amount (px)",min:0,max:40,default:6}],glsl:"vec4 fx(vec2 uv){ vec2 o=vec2(P0/uResolution.x,0.0); float r=inp(uv+o).r; float g=inp(uv).g; float b=inp(uv-o).b; return vec4(r,g,b, inp(uv).a); }"},{id:"vignette",name:"Vignette",params:[{key:"amt",label:"Amount",min:0,max:1,default:.5}],glsl:"vec4 fx(vec2 uv){ vec4 c=inp(uv); float d=distance(uv, vec2(0.5)); float v=smoothstep(0.8, 0.2, d*1.3); return vec4(c.rgb*mix(1.0, v, P0), c.a); }"},{id:"sharpen",name:"Sharpen",params:[{key:"amt",label:"Amount",min:0,max:3,default:.8}],glsl:"vec4 fx(vec2 uv){ vec2 px=1.0/uResolution; vec4 c=inp(uv); vec4 s=inp(uv+vec2(px.x,0.))+inp(uv-vec2(px.x,0.))+inp(uv+vec2(0.,px.y))+inp(uv-vec2(0.,px.y)); return vec4(clamp(c.rgb + (c.rgb*4.0 - s.rgb)*P0, 0.0, 1.0), c.a); }"},{id:"mirror",name:"Mirror",params:[{key:"mode",label:"Mode (0-2)",min:0,max:2,default:0}],glsl:"vec4 fx(vec2 uv){ if(P0<0.5) uv.x=uv.x<0.5?uv.x:1.0-uv.x; else if(P0<1.5) uv.y=uv.y<0.5?uv.y:1.0-uv.y; else { uv.x=uv.x<0.5?uv.x:1.0-uv.x; uv.y=uv.y<0.5?uv.y:1.0-uv.y; } return inp(uv); }"},{id:"shake",name:"Shake",params:[{key:"amt",label:"Amount (px)",min:0,max:40,default:8}],glsl:"vec4 fx(vec2 uv){ float t=uTime*30.0; vec2 o=vec2(sin(t*1.7),cos(t*2.3))*(P0*(0.3+iBass))/uResolution; return inp(uv+o); }"}],Pt=new Map(At.map(i=>[i.id,i]));function Ut(i){return Pt.get(i)}const _t=`#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`,xe=["P0","P1","P2","P3","P4","P5","P6","P7"];class Ft{constructor(t){this.gl=t,this.progs=new Map,this.pool=new Map,this.quad=me(t)}program(t){let e=this.progs.get(t.id);if(!e){let o=null;try{o=Z(this.gl,_t,St+`
`+t.glsl+Ct)}catch(n){console.warn(`[FxRenderer] "${t.id}" compile failed:`,(n==null?void 0:n.message)||n),o=null}const a={};if(o)for(const n of["uInput","uResolution","uTime","iBass","iMid","iTreble","iLevel",...xe])a[n]=this.gl.getUniformLocation(o,n);e={p:o,u:a},this.progs.set(t.id,e)}return e}render(t,e,o,a,n,r,s){var d;const c=this.gl,l=Ut(e),u=ee(c,n,r,this.pool.get(t));if(this.pool.set(t,u),!l)return a;const{p:f,u:m}=this.program(l);if(c.bindFramebuffer(c.FRAMEBUFFER,u.fbo),c.viewport(0,0,n,r),!f)return c.clearColor(0,0,0,1),c.clear(c.COLOR_BUFFER_BIT),u.tex;c.disable(c.BLEND),c.useProgram(f),c.bindVertexArray(this.quad),c.activeTexture(c.TEXTURE0),c.bindTexture(c.TEXTURE_2D,a),c.uniform1i(m.uInput,0),c.uniform2f(m.uResolution,n,r),c.uniform1f(m.uTime,s.time),c.uniform1f(m.iBass,s.audio.bass),c.uniform1f(m.iMid,s.audio.mid),c.uniform1f(m.iTreble,s.audio.treble),c.uniform1f(m.iLevel,s.audio.level);for(let b=0;b<xe.length;b++){const R=((d=l.params[b])==null?void 0:d.default)??0;c.uniform1f(m[xe[b]],o[b]??R)}return c.drawArrays(c.TRIANGLES,0,3),c.bindVertexArray(null),u.tex}dispose(){const t=this.gl;this.progs.forEach(e=>{e.p&&t.deleteProgram(e.p)}),this.pool.forEach(e=>{t.deleteTexture(e.tex),t.deleteFramebuffer(e.fbo)}),this.progs.clear(),this.pool.clear()}}const Lt=`#version 300 es
layout(location=0) in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`,Dt=`#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uA, uB; uniform int uMode;
vec3 blend(int m, vec3 d, vec3 s){
  if(m==1) return d+s-d*s;
  if(m==2) return min(d+s,vec3(1.0));
  if(m==3) return d*s;
  if(m==4) return mix(2.*d*s,1.-2.*(1.-d)*(1.-s),step(0.5,d));
  if(m==5) return max(d,s);
  if(m==6) return min(d,s);
  if(m==7) return abs(d-s);
  return s;
}
void main(){ vec4 a=texture(uA,vUv); vec4 b=texture(uB,vUv); vec3 bl=blend(uMode,a.rgb,b.rgb); o=vec4(mix(a.rgb,bl,b.a), max(a.a,b.a)); }`,It={normal:0,screen:1,add:2,multiply:3,overlay:4,lighten:5,darken:6,difference:7};function Bt(i){const t=i.replace("#",""),e=parseInt(t.length===3?t.split("").map(o=>o+o).join(""):t.padEnd(6,"0").slice(0,6),16);return[(e>>16&255)/255,(e>>8&255)/255,(e&255)/255]}class De{constructor(t){this.gl=t,this.pool=new Map,this.gen=new Re(t),this.shader=new we(t),this.fx=new Ft(t),this.quad=me(t),this.mergeProg=Z(t,Lt,Dt),this.uA=t.getUniformLocation(this.mergeProg,"uA"),this.uB=t.getUniformLocation(this.mergeProg,"uB"),this.uMode=t.getUniformLocation(this.mergeProg,"uMode")}evaluate(t,e,o,a){var l;if(!((l=t==null?void 0:t.nodes)!=null&&l.length)||!t.output)return null;const n=new Map(t.nodes.map(u=>[u.id,u])),r=new Map,s=new Set,c=u=>{if(r.has(u))return r.get(u);if(s.has(u))return null;s.add(u);const f=n.get(u);let m=null;if(f)if(f.type==="source")m=this.source(f,e,o,a);else if(f.type==="effect"&&f.fxId){const d=f.input?c(f.input):null;m=d?this.fx.render(f.id,f.fxId,f.fxParams||[],d,e,o,a):null}else if(f.type==="merge"){const d=f.inputA?c(f.inputA):null,b=f.inputB?c(f.inputB):null;m=this.merge(f.id,d,b,f.blendMode||"normal",e,o)}else f.type==="output"&&(m=f.input?c(f.input):null);return s.delete(u),r.set(u,m),m};return c(t.output)}source(t,e,o,a){if(t.srcKind==="generator"&&t.sceneMode&&Ee(t.sceneMode))return this.gen.render(t.id,t.sceneMode,e,o,{time:a.time,audio:a.audio,colors:a.colors,params:t.srcParams||[]});if(t.srcKind==="shader"&&t.shaderSrc)return this.shader.render(t.id,t.shaderSrc,e,o,{time:a.time,audio:a.audio,params:t.srcParams||[]});if(t.srcKind==="color"){const n=ee(this.gl,e,o,this.pool.get(t.id));this.pool.set(t.id,n);const[r,s,c]=Bt(t.fillColor||"#000");return this.gl.bindFramebuffer(this.gl.FRAMEBUFFER,n.fbo),this.gl.viewport(0,0,e,o),this.gl.clearColor(r,s,c,1),this.gl.clear(this.gl.COLOR_BUFFER_BIT),n.tex}return null}merge(t,e,o,a,n,r){if(!e)return o;if(!o)return e;const s=this.gl,c=ee(s,n,r,this.pool.get(t));return this.pool.set(t,c),s.bindFramebuffer(s.FRAMEBUFFER,c.fbo),s.viewport(0,0,n,r),s.disable(s.BLEND),s.useProgram(this.mergeProg),s.bindVertexArray(this.quad),s.activeTexture(s.TEXTURE0),s.bindTexture(s.TEXTURE_2D,e),s.uniform1i(this.uA,0),s.activeTexture(s.TEXTURE1),s.bindTexture(s.TEXTURE_2D,o),s.uniform1i(this.uB,1),s.uniform1i(this.uMode,It[a==null?void 0:a.toLowerCase()]??0),s.drawArrays(s.TRIANGLES,0,3),s.bindVertexArray(null),c.tex}dispose(){const t=this.gl;this.gen.dispose(),this.shader.dispose(),this.fx.dispose(),t.deleteProgram(this.mergeProg),this.pool.forEach(e=>{t.deleteTexture(e.tex),t.deleteFramebuffer(e.fbo)}),this.pool.clear()}}const J=512;class Ie{constructor(t){this.gl=t,this.pixels=new Uint8Array(J*2*4),this.freq=null,this.wave=null,this.bass=0,this.mid=0,this.treble=0,this.level=0,this.tex=t.createTexture(),t.bindTexture(t.TEXTURE_2D,this.tex),t.texImage2D(t.TEXTURE_2D,0,t.RGBA8,J,2,0,t.RGBA,t.UNSIGNED_BYTE,this.pixels),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE)}update(t){if(!t)return;const e=t.frequencyBinCount,o=t.fftSize;(!this.freq||this.freq.length!==e)&&(this.freq=new Uint8Array(e)),(!this.wave||this.wave.length!==o)&&(this.wave=new Uint8Array(o)),t.getByteFrequencyData(this.freq),t.getByteTimeDomainData(this.wave),this.process(this.freq,this.wave)}updateFromArrays(t,e){this.process(t,e)}process(t,e){const o=this.gl,a=t.length,n=e.length;let r=0,s=0,c=0,l=0;const u=Math.floor(a*.08),f=Math.floor(a*.35);for(let m=0;m<J;m++){const d=Math.min(a-1,m/J*a|0),b=Math.min(n-1,m/J*n|0),R=t[d],w=e[b];let T=m*4;this.pixels[T]=this.pixels[T+1]=this.pixels[T+2]=R,this.pixels[T+3]=255,T=(J+m)*4,this.pixels[T]=this.pixels[T+1]=this.pixels[T+2]=w,this.pixels[T+3]=255}for(let m=0;m<a;m++){const d=t[m];r+=d,m<u?s+=d:m<f?c+=d:l+=d}this.bass=s/Math.max(1,u)/255,this.mid=c/Math.max(1,f-u)/255,this.treble=l/Math.max(1,a-f)/255,this.level=r/a/255,o.bindTexture(o.TEXTURE_2D,this.tex),o.texSubImage2D(o.TEXTURE_2D,0,0,0,J,2,o.RGBA,o.UNSIGNED_BYTE,this.pixels)}dispose(){this.gl.deleteTexture(this.tex)}}const Ce=-100,kt=-30;function Ot(i,t){const e=i.length;for(let o=1,a=0;o<e;o++){let n=e>>1;for(;a&n;n>>=1)a^=n;if(a^=n,o<a){const r=i[o];i[o]=i[a],i[a]=r;const s=t[o];t[o]=t[a],t[a]=s}}for(let o=2;o<=e;o<<=1){const a=-2*Math.PI/o,n=Math.cos(a),r=Math.sin(a);for(let s=0;s<e;s+=o){let c=1,l=0;for(let u=0;u<o/2;u++){const f=i[s+u],m=t[s+u],d=i[s+u+o/2]*c-t[s+u+o/2]*l,b=i[s+u+o/2]*l+t[s+u+o/2]*c;i[s+u]=f+d,t[s+u]=m+b,i[s+u+o/2]=f-d,t[s+u+o/2]=m-b;const R=c*n-l*r;l=c*r+l*n,c=R}}}}class Be{constructor(t,e=2048){this.fftSize=e,this.duration=t.duration,this.sampleRate=t.sampleRate;const o=t.length,a=t.numberOfChannels,n=new Float32Array(o);for(let r=0;r<a;r++){const s=t.getChannelData(r);for(let c=0;c<o;c++)n[c]+=s[c]/a}this.mono=n,this.re=new Float32Array(e),this.im=new Float32Array(e),this.win=new Float32Array(e);for(let r=0;r<e;r++)this.win[r]=.5-.5*Math.cos(2*Math.PI*r/(e-1));this.freqOut=new Uint8Array(e/2),this.waveOut=new Uint8Array(e),this.smoothed=new Float32Array(e/2)}sample(t){const{fftSize:e,mono:o,re:a,im:n,win:r,freqOut:s,waveOut:c,smoothed:l}=this,u=Math.round(t*this.sampleRate)-(e>>1);for(let d=0;d<e;d++){const b=u+d,R=b>=0&&b<o.length?o[b]:0;a[d]=R*r[d],n[d]=0;const w=b>=0&&b<o.length?o[b]:0;c[d]=Math.max(0,Math.min(255,w*128+128|0))}Ot(a,n);const f=e>>1,m=2/e;for(let d=0;d<f;d++){const b=Math.hypot(a[d],n[d])*m,R=20*Math.log10(b+1e-9);l[d]=l[d]*.6+R*.4;const w=(l[d]-Ce)/(kt-Ce);s[d]=Math.max(0,Math.min(255,w*255|0))}return{freq:s,wave:c}}get monoData(){return this.mono}}function Nt(i,t=60,e=128,o=128){const a=new Be(i),n=Math.max(1,Math.ceil(i.duration*t)),r=new Uint8Array(n*e),s=new Uint8Array(n*o);for(let c=0;c<n;c++){const l=a.sample(c/t),u=l.freq.length/e,f=l.wave.length/o;for(let m=0;m<e;m++){const d=Math.floor(m*u),b=Math.max(d+1,Math.floor((m+1)*u));let R=0;for(let w=d;w<b;w++)R+=l.freq[w];r[c*e+m]=R/(b-d)}for(let m=0;m<o;m++)s[c*o+m]=l.wave[Math.floor(m*f)]}return{fps:t,frames:n,bins:e,waveLen:o,duration:i.duration,freq:r,wave:s}}function Xt(i,t){const e=Math.max(0,Math.min(i.frames-1,Math.round(t*i.fps)));return{freq:i.freq.subarray(e*i.bins,(e+1)*i.bins),wave:i.wave.subarray(e*i.waveLen,(e+1)*i.waveLen)}}const Gt="plajah-pixels-analysis";function qt(i){const t=new TextEncoder().encode(JSON.stringify({fps:i.fps,frames:i.frames,bins:i.bins,waveLen:i.waveLen,duration:i.duration})),e=new Uint8Array(4);return new DataView(e.buffer).setUint32(0,t.length,!1),new Blob([e,t,i.freq,i.wave],{type:"application/octet-stream"})}async function Vt(i){try{const t=new Uint8Array(await i.arrayBuffer()),e=new DataView(t.buffer).getUint32(0,!1),o=JSON.parse(new TextDecoder().decode(t.subarray(4,4+e)));let a=4+e;const n=o.frames*o.bins,r=o.frames*o.waveLen,s=t.slice(a,a+n);a+=n;const c=t.slice(a,a+r);return s.length!==n||c.length!==r?null:{...o,freq:s,wave:c}}catch{return null}}async function Ht(){var i,t;try{const e=await((t=(i=navigator.storage)==null?void 0:i.getDirectory)==null?void 0:t.call(i));return e?await e.getDirectoryHandle(Gt,{create:!0}):null}catch{return null}}async function zt(i){const t=await crypto.subtle.digest("SHA-256",i);return Array.from(new Uint8Array(t)).map(e=>e.toString(16).padStart(2,"0")).join("").slice(0,32)}const pe=new Map;async function oi(i,t){const e=await zt(i)+".an";if(pe.has(e))return pe.get(e);const o=await Ht();if(o)try{const n=await o.getFileHandle(e),r=await Vt(await n.getFile());if(r)return pe.set(e,r),r}catch{}const a=Nt(t);if(pe.set(e,a),o)try{const r=await(await o.getFileHandle(e,{create:!0})).createWritable();await r.write(qt(a)),await r.close()}catch{}return a}const ue=new Map,re=1280,be=720;function ke(i,t="#ffffff"){const e=`${i}|${t}`,o=ue.get(e);if(o)return o;const a=document.createElement("canvas");a.width=re,a.height=be;const n=a.getContext("2d");n.fillStyle="#000",n.fillRect(0,0,re,be);const r=Math.round(re*.046);n.font=`700 ${r}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`,n.textAlign="center",n.textBaseline="middle";const s=re*.86,c=String(i||"").split(/\s+/).filter(Boolean),l=[];let u="";for(const d of c){const b=u?u+" "+d:d;n.measureText(b).width>s&&u?(l.push(u),u=d):u=b}u&&l.push(u);const f=r*1.25;let m=be*.84-(l.length-1)*f;n.lineWidth=Math.max(2,r*.16),n.strokeStyle="rgba(0,0,0,0.9)",n.fillStyle=t;for(const d of l)n.strokeText(d,re/2,m),n.fillText(d,re/2,m),m+=f;if(ue.set(e,a),ue.size>240){const d=ue.keys().next().value;d&&ue.delete(d)}return a}const fe=new Map,j=1280,Te=720;function Ae(i,t,e){const o=String(t||"").split(/\s+/).filter(Boolean),a=[];let n="";for(const r of o){const s=n?n+" "+r:r;i.measureText(s).width>e&&n?(a.push(n),n=r):n=s}return n&&a.push(n),a}function Oe(i,t="",e="modern",o="#FF8C00"){const a=`${i}|${t}|${e}|${o}`,n=fe.get(a);if(n)return n;const r=document.createElement("canvas");r.width=j,r.height=Te;const s=r.getContext("2d");s.fillStyle="#000",s.fillRect(0,0,j,Te);const c=j*.5,l=Math.round(j*(e==="minimal"?.05:.058)),u=Math.round(j*.03),m=e==="classic"?'Georgia, "Times New Roman", serif':"system-ui, -apple-system, Segoe UI, Roboto, sans-serif";s.textAlign=e==="classic"?"center":"left",s.textBaseline="alphabetic";const d=e==="classic"?c:j*.12,b=Te*.8;s.font=`700 ${l}px ${m}`;const R=Ae(s,i,j*.76),w=l*1.16;let T=b-(R.length-1)*w-(t?u*1.4:0);s.fillStyle=o,e==="modern"?s.fillRect(j*.12-14,T-l*.85,7,R.length*w+(t?u*1.6:0)):e==="classic"&&s.fillRect(c-60,T-l,120,3),s.lineWidth=Math.max(2,l*.12),s.strokeStyle="rgba(0,0,0,0.9)",s.fillStyle="#fff",s.shadowColor="rgba(0,0,0,0.6)",s.shadowBlur=l*.25;const N=e==="classic"?c:d;for(const L of R)s.strokeText(L,N,T),s.fillText(L,N,T),T+=w;if(s.shadowBlur=0,t){T+=u*.4,s.font=`500 ${u}px ${m}`,s.fillStyle=e==="minimal"?"rgba(255,255,255,0.85)":o;const L=Ae(s,t,j*.76);for(const B of L)s.strokeText(B,N,T),s.fillText(B,N,T),T+=u*1.25;e==="classic"&&(s.fillStyle=o,s.fillRect(c-60,T-u*.4,120,3))}if(fe.set(a,r),fe.size>160){const L=fe.keys().next().value;L&&fe.delete(L)}return r}function $t(i,t){let e=null;for(const o of i.blocks)t>=o.start&&t<o.start+o.duration&&(e=o);return e}function Wt(i,t){return Math.max(0,t-i.start+i.trimIn)}function ri(i,t,e){var a;const o=[];for(const n of i){if(!n||n.bypassed||n.muted)continue;const r=(a=n.clips)==null?void 0:a[t];!r||r.type==="empty"||o.push({id:n.id,blendMode:n.blendMode||"normal",opacity:n.opacity??1,clip:{type:r.type,sceneMode:r.sceneMode,mediaUrl:r.mediaUrl,mediaType:r.mediaType,fillColor:r.fillColor,shaderSrc:r.shaderSrc,milkdropIdx:r.milkdropIdx,milkdropName:r.milkdropName,params:r.params,opacity:r.opacity??1}})}return{name:e,layers:o}}const jt=()=>`blk_${Math.random().toString(36).slice(2,9)}`;function ni(i,t,e){return{id:jt(),snapshot:i,start:t,duration:e,trimIn:0,loop:!0}}const Kt=["avc1.4D0033","avc1.4D0028","avc1.42E01F"];async function Yt(i,t,e,o){if(typeof VideoEncoder>"u")return null;for(const a of["prefer-hardware","no-preference"])for(const n of Kt)try{if((await VideoEncoder.isConfigSupported({codec:n,width:i,height:t,bitrate:e,framerate:o,hardwareAcceleration:a,latencyMode:"realtime"})).supported)return{codec:n,hardwareAcceleration:a}}catch{}return null}function Qt(i,t,e=1500){return new Promise(o=>{let a=!1;const n=()=>{a||(a=!0,i.removeEventListener("seeked",n),clearTimeout(r),o())},r=setTimeout(n,e);i.addEventListener("seeked",n);try{i.currentTime=t}catch{n()}})}async function Jt(i,t){try{if(t==="image"){const o=new Image;return o.crossOrigin="anonymous",o.src=i,await o.decode().catch(()=>new Promise((a,n)=>{o.onload=()=>a(),o.onerror=()=>n(new Error("img"))})),o}const e=document.createElement("video");return e.crossOrigin="anonymous",e.muted=!0,e.playsInline=!0,e.preload="auto",e.src=i,await new Promise((o,a)=>{let n=!1;const r=()=>{n||(n=!0,o())};e.oncanplaythrough=r,e.onloadeddata=()=>setTimeout(r,1200),e.onerror=()=>{n||(n=!0,a(new Error("video")))},setTimeout(r,12e3)}),e}catch{return null}}async function ai(i){const{timeline:t,resolveLayers:e,audioBuffer:o,config:a,fps:n,fast:r,analysis:s,onProgress:c,signal:l}=i,u=Math.max(2,Math.round(i.width/2)*2),f=Math.max(2,Math.round(i.height/2)*2),m=i.bitrate??Math.round(Math.min(24e6,Math.max(8e6,u*f*n*.12))),d=await Yt(u,f,m,n);if(!d)return console.warn("[Pixels render] WebCodecs H.264 unavailable in this browser"),null;const{codec:b,hardwareAcceleration:R}=d;R!=="prefer-hardware"&&console.warn("[Pixels render] no hardware H.264 encoder — falling back to software (slower).");const w=(t==null?void 0:t.duration)??i.duration??0,T=Math.max(1,Math.ceil(w*n)),N=()=>l==null?void 0:l.aborted,L=new OffscreenCanvas(u,f);let B;try{B=new Ue(L)}catch(h){return console.warn("[Pixels render] WebGL2 unavailable:",h),null}B.resize(u,f);const te=new Re(B.gl),ne=new we(B.gl),ae=new De(B.gl),$=new Ie(B.gl),W=o?new Be(o):null,ie=new Map,V=async(h,x)=>(ie.has(h)||ie.set(h,await Jt(h,x)),ie.get(h)??null),z=new Map,X=new Map;let y=null;const K=async(h,x)=>{if(!z.has(h)){y=y||new(window.AudioContext||window.webkitAudioContext);const D=await Le({width:u,height:f,audioCtx:y,fps:n});D&&(D.setPreset(x),X.set(h,x)),z.set(h,D)}const M=z.get(h)||null;return M&&X.get(h)!==x&&(M.setPreset(x,0),X.set(h,x)),M},G=new Map,Y=h=>{let x=G.get(h);if(!x){x=document.createElement("canvas"),x.width=4,x.height=4;const M=x.getContext("2d");M.fillStyle=h,M.fillRect(0,0,4,4),G.set(h,x)}return x},_=new Ne({target:new Xe,video:{codec:"avc",width:u,height:f},...o?{audio:{codec:"aac",numberOfChannels:Math.min(2,o.numberOfChannels),sampleRate:o.sampleRate}}:{},fastStart:"in-memory"});let C=null;const A=new VideoEncoder({output:(h,x)=>_.addVideoChunk(h,x),error:h=>{C=h}});A.configure({codec:b,width:u,height:f,bitrate:m,framerate:n,hardwareAcceleration:R,latencyMode:"realtime"});const se=Math.max(1,Math.round(n*2)),ce=(a.colorPalette||[]).slice(0,3).map(Fe),H={brightness:a.gradeBrightness??1,contrast:a.gradeContrast??1,saturation:a.gradeSaturation??1,gamma:a.gradeGamma??1},de=!!a.enableBassShake,E=a.bassShakeIntensity??1,g=new Ge;let F=0;try{for(let x=0;x<T;x++){if(N())throw new Error("aborted");if(C)throw C;const M=x/n;let D;const q=s?Xt(s,M):W?W.sample(M):null;if(q&&($.updateFromArrays(q.freq,q.wave),de)){g.updateFromArray(q.freq,M*1e3,(o==null?void 0:o.sampleRate)||(W==null?void 0:W.sampleRate)||48e3);const p=g.intensity*.4+g.density*.55;F=Math.max(F*.82,p),g.isSnare&&(F=Math.min(1.6,F+.9)),g.isKick&&(F=Math.min(1.6,F+.4));const v=F*E;if(v>.01){const O=v*14,I=(Math.random()-.5)*v*.015;D={offX:(Math.random()-.5)*O/u,offY:(Math.random()-.5)*O/f,sin:Math.sin(I),cos:Math.cos(I),scale:1+v*.03}}}const k=[];let Q;if(e)Q=e(M);else if(t){const p=$t(t,M),v=p?Wt(p,M):0;Q=p?p.snapshot.layers.map(O=>({...O,time:v})):[]}else Q=[];for(const p of Q){const v=p.clip,O=p.time??0,I=Math.max(0,Math.min(1,(p.opacity??1)*(v.opacity??1)));if(v.type==="generator"&&v.sceneMode&&Ee(v.sceneMode)){const U=te.render(p.id,v.sceneMode,u,f,{time:O,audio:$,colors:ce,params:v.params||[]});k.push({texture:U,opacity:I,blendMode:p.blendMode,transform:p.transform})}else if(v.type==="media"&&v.mediaUrl){const U=await V(v.mediaUrl,v.mediaType??"video");if(U instanceof HTMLVideoElement){const oe=U.duration||0;let he=O;if(oe>0&&(he=he%oe),r)try{U.currentTime=he}catch{}else await Qt(U,he);k.push({element:U,opacity:I,blendMode:p.blendMode,transform:p.transform})}else U instanceof HTMLImageElement&&k.push({element:U,opacity:I,blendMode:p.blendMode,transform:p.transform})}else if(v.type==="color"&&v.fillColor)k.push({element:Y(v.fillColor),opacity:I,blendMode:p.blendMode,transform:p.transform});else if(v.type==="text"&&v.text)k.push({element:ke(v.text,v.fillColor),opacity:I,blendMode:p.blendMode,transform:p.transform});else if(v.type==="title"&&v.text)k.push({element:Oe(v.text,v.subtitle,v.titleStyle,v.fillColor),opacity:I,blendMode:p.blendMode,transform:p.transform});else if(v.type==="shader"&&v.shaderSrc){const U=ne.render(p.id,v.shaderSrc,u,f,{time:O,audio:$,params:v.params||[]});k.push({texture:U,opacity:I,blendMode:p.blendMode,transform:p.transform})}else if(v.type==="nodegraph"&&v.graph){const U=ae.evaluate(v.graph,u,f,{time:O,audio:$,colors:ce});U&&k.push({texture:U,opacity:I,blendMode:p.blendMode,transform:p.transform})}else if(v.type==="milkdrop"){const U=v.milkdropName??v.milkdropIdx??0,oe=await K(p.id,U);oe&&(oe.renderFrame(q?q.wave:null),k.push({element:oe.canvas,opacity:I,blendMode:p.blendMode,transform:p.transform}))}}B.render(k,H,D);const le=new VideoFrame(L,{timestamp:Math.round(M*1e6),duration:Math.round(1e6/n)});for(A.encode(le,{keyFrame:x%se===0}),le.close();A.encodeQueueSize>24;){if(N())throw new Error("aborted");await new Promise(p=>setTimeout(p,1))}x%24===0&&(c==null||c(x/T*.92,"Rendering frames"),await new Promise(p=>setTimeout(p,0)))}if(await A.flush(),C)throw C;if(o&&typeof AudioEncoder<"u"){c==null||c(.94,"Encoding audio");const x=Math.min(2,o.numberOfChannels),M=o.sampleRate;let D=null;const q=new AudioEncoder({output:(p,v)=>_.addAudioChunk(p,v),error:p=>{D=p}});q.configure({codec:"mp4a.40.2",sampleRate:M,numberOfChannels:x,bitrate:192e3});const k=o.getChannelData(0),Q=x>1?o.getChannelData(1):null,le=4096;for(let p=0;p<k.length&&!D;p+=le){const v=Math.min(le,k.length-p),O=new Float32Array(v*x);O.set(k.subarray(p,p+v),0),Q&&O.set(Q.subarray(p,p+v),v);const I=new AudioData({format:"f32-planar",sampleRate:M,numberOfFrames:v,numberOfChannels:x,timestamp:Math.round(p/M*1e6),data:O});for(q.encode(I),I.close();q.encodeQueueSize>16;)await new Promise(U=>setTimeout(U,3))}await q.flush(),q.close(),D&&console.warn("[Pixels render] audio encode failed — video-only output:",D)}_.finalize();const h=_.target.buffer;return c==null||c(1,"Done"),!h||h.byteLength<1024?null:new Blob([h],{type:"video/mp4"})}catch(h){return console.warn("[Pixels render] failed:",(h==null?void 0:h.message)||h),null}finally{try{A.state!=="closed"&&A.close()}catch{}te.dispose(),ne.dispose(),ae.dispose(),$.dispose(),B.dispose(),ie.forEach(h=>{if(h instanceof HTMLVideoElement)try{h.pause(),h.removeAttribute("src"),h.load()}catch{}}),z.forEach(h=>{try{h==null||h.dispose()}catch{}});try{y==null||y.close()}catch{}}}const ye=1080,si=({snapshot:i,analyser:t,audioFrame:e,palette:o,playing:a,time:n,className:r,style:s})=>{const c=P.useRef(null),l=P.useRef(null),u=P.useRef(null),f=P.useRef(null),m=P.useRef(null),d=P.useRef(null),b=P.useRef(0),R=P.useRef(new Map),w=P.useRef(new Map),T=P.useRef(new Set),N=P.useRef(new Map),L=P.useRef(null),B=P.useRef(i);B.current=i;const te=P.useRef(t);te.current=t??null;const ne=P.useRef(e);ne.current=e??null;const ae=P.useRef(o);ae.current=o;const $=P.useRef(a);$.current=a;const W=P.useRef(n);W.current=n;const ie=(V,z)=>{let X=R.current.get(V);if(!X){if(z==="image"){const y=new Image;y.crossOrigin="anonymous",y.src=V,X=y}else{const y=document.createElement("video");y.crossOrigin="anonymous",y.muted=!0,y.loop=!0,y.playsInline=!0,y.preload="auto",y.src=V,y.load(),X=y}R.current.set(V,X)}return X};return P.useEffect(()=>{const V=c.current;if(!V)return;try{l.current=new Ue(V),u.current=new Re(l.current.gl),f.current=new we(l.current.gl),m.current=new De(l.current.gl),d.current=new Ie(l.current.gl),b.current=performance.now()}catch(y){console.warn("[SceneView] GL init failed:",y);return}let z=0;const X=()=>{const y=l.current,K=u.current,G=d.current;if(y&&K&&G){const Y=Math.min(window.devicePixelRatio||1,2);let _=Math.max(1,Math.round(V.clientWidth*Y)),C=Math.max(1,Math.round(V.clientHeight*Y));C>ye&&(_=Math.round(_*(ye/C)),C=ye),y.resize(_,C);const A=ne.current;A?G.updateFromArrays(A.freq,A.wave):G.update(te.current);const se=typeof W.current=="number"?W.current:(performance.now()-b.current)/1e3,ce=(ae.current||[]).slice(0,3).map(Fe),H=[],de=new Set;for(const E of B.current.layers||[]){const g=E.clip,F=Math.max(0,Math.min(1,(E.opacity??1)*(g.opacity??1)));if(g.type==="generator"&&g.sceneMode&&Ee(g.sceneMode)){const h=K.render(E.id,g.sceneMode,_,C,{time:se,audio:G,colors:ce,params:g.params||[]});H.push({texture:h,opacity:F,blendMode:E.blendMode})}else if(g.type==="media"&&g.mediaUrl){de.add(g.mediaUrl);const h=ie(g.mediaUrl,g.mediaType);h instanceof HTMLVideoElement&&($.current&&h.paused?h.play().catch(()=>{}):!$.current&&!h.paused&&h.pause()),H.push({element:h,opacity:F,blendMode:E.blendMode})}else if(g.type==="color"&&g.fillColor)H.push({element:Zt(g.fillColor),opacity:F,blendMode:E.blendMode});else if(g.type==="text"&&g.text)H.push({element:ke(g.text,g.fillColor),opacity:F,blendMode:E.blendMode});else if(g.type==="title"&&g.text)H.push({element:Oe(g.text,g.subtitle,g.titleStyle,g.fillColor),opacity:F,blendMode:E.blendMode});else if(g.type==="shader"&&g.shaderSrc&&f.current){const h=f.current.render(E.id,g.shaderSrc,_,C,{time:se,audio:G,params:g.params||[]});H.push({texture:h,opacity:F,blendMode:E.blendMode})}else if(g.type==="nodegraph"&&g.graph&&m.current){const h=m.current.evaluate(g.graph,_,C,{time:se,audio:G,colors:ce});h&&H.push({texture:h,opacity:F,blendMode:E.blendMode})}else if(g.type==="milkdrop"){const h=g.milkdropName??g.milkdropIdx??0,x=w.current.get(E.id);if(x)N.current.get(E.id)!==h&&(x.setPreset(h,0),N.current.set(E.id,h)),(x.canvas.width!==_||x.canvas.height!==C)&&x.resize(_,C),x.renderFrame(A?A.wave:null),H.push({element:x.canvas,opacity:F,blendMode:E.blendMode});else if(!T.current.has(E.id)){T.current.add(E.id);const M=L.current||(L.current=new(window.AudioContext||window.webkitAudioContext));Le({width:_,height:C,audioCtx:M,analyser:te.current}).then(D=>{T.current.delete(E.id),D&&(D.setPreset(h),N.current.set(E.id,h),w.current.set(E.id,D))})}}}R.current.forEach((E,g)=>{E instanceof HTMLVideoElement&&!E.paused&&!de.has(g)&&E.pause()}),y.render(H)}z=requestAnimationFrame(X)};return z=requestAnimationFrame(X),()=>{var y,K,G,Y,_,C;cancelAnimationFrame(z),(y=u.current)==null||y.dispose(),u.current=null,(K=f.current)==null||K.dispose(),f.current=null,(G=m.current)==null||G.dispose(),m.current=null,(Y=d.current)==null||Y.dispose(),d.current=null,(_=l.current)==null||_.dispose(),l.current=null,R.current.forEach(A=>{if(A instanceof HTMLVideoElement)try{A.pause(),A.removeAttribute("src"),A.load()}catch{}}),R.current.clear(),w.current.forEach(A=>{try{A.dispose()}catch{}}),w.current.clear(),T.current.clear(),N.current.clear();try{(C=L.current)==null||C.close()}catch{}L.current=null}},[]),qe.jsx("canvas",{ref:c,className:r,style:{display:"block",width:"100%",height:"100%",...s}})},Pe=new Map;function Zt(i){let t=Pe.get(i);if(!t){t=document.createElement("canvas"),t.width=4,t.height=4;const e=t.getContext("2d");e.fillStyle=i,e.fillRect(0,0,4,4),Pe.set(i,t)}return t}export{Ie as A,Ue as C,Re as G,si as S,Xt as a,Ee as b,oi as g,Fe as h,ni as m,ai as r,ri as s};
