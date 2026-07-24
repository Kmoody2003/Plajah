(function(){"use strict";function _(t){const i={alpha:!1,antialias:!1,depth:!1,stencil:!1,premultipliedAlpha:!1,preserveDrawingBuffer:!0,powerPreference:"high-performance",desynchronized:!1};return t.getContext("webgl2",i)??null}function C(t,i,e){const o=t.createShader(i);if(t.shaderSource(o,e),t.compileShader(o),!t.getShaderParameter(o,t.COMPILE_STATUS)){const r=t.getShaderInfoLog(o);throw t.deleteShader(o),new Error(`[PixelsCore] shader compile failed: ${r}
${y(e)}`)}return o}function R(t,i,e){const o=C(t,t.VERTEX_SHADER,i),r=C(t,t.FRAGMENT_SHADER,e),s=t.createProgram();if(t.attachShader(s,o),t.attachShader(s,r),t.linkProgram(s),t.deleteShader(o),t.deleteShader(r),!t.getProgramParameter(s,t.LINK_STATUS)){const a=t.getProgramInfoLog(s);throw t.deleteProgram(s),new Error(`[PixelsCore] program link failed: ${a}`)}return s}function b(t){const i=t.createVertexArray();t.bindVertexArray(i);const e=t.createBuffer();return t.bindBuffer(t.ARRAY_BUFFER,e),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),t.STATIC_DRAW),t.enableVertexAttribArray(0),t.vertexAttribPointer(0,2,t.FLOAT,!1,0,0),t.bindVertexArray(null),i}function g(t,i,e,o){if(o&&o.width===i&&o.height===e)return o;o&&(t.deleteTexture(o.tex),t.deleteFramebuffer(o.fbo));const r=t.createTexture();t.bindTexture(t.TEXTURE_2D,r),t.texImage2D(t.TEXTURE_2D,0,t.RGBA8,i,e,0,t.RGBA,t.UNSIGNED_BYTE,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);const s=t.createFramebuffer();return t.bindFramebuffer(t.FRAMEBUFFER,s),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,r,0),t.bindFramebuffer(t.FRAMEBUFFER,null),{fbo:s,tex:r,width:i,height:e}}function A(t){const i=t.createTexture();return t.bindTexture(t.TEXTURE_2D,i),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE),i}function P(t,i,e){const o=e.videoWidth??e.naturalWidth??e.width??0,r=e.videoHeight??e.naturalHeight??e.height??0;if(!o||!r)return!1;t.bindTexture(t.TEXTURE_2D,i),t.pixelStorei(t.UNPACK_FLIP_Y_WEBGL,1);try{t.texImage2D(t.TEXTURE_2D,0,t.RGBA,t.RGBA,t.UNSIGNED_BYTE,e)}catch{return t.pixelStorei(t.UNPACK_FLIP_Y_WEBGL,0),!1}return t.pixelStorei(t.UNPACK_FLIP_Y_WEBGL,0),!0}function y(t){return t.split(`
`).map((i,e)=>`${String(e+1).padStart(3)}| ${i}`).join(`
`)}const D={normal:0,screen:1,add:2,multiply:3,overlay:4,lighten:5,darken:6,difference:7,exclusion:8,"color-dodge":9,"hard-light":10},U=`#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`,L=`#version 300 es
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
}`,F=`#version 300 es
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
}`,I=`#version 300 es
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
}`;function M(t){return t.brightness===1&&t.contrast===1&&t.saturation===1&&t.gamma===1}const w={offX:0,offY:0,sin:0,cos:1,scale:1};class B{constructor(i){this.canvas=i,this.uShake={},this.gradeU={},this.width=0,this.height=0,this.disposed=!1;const e=_(i);if(!e)throw new Error("[PixelsCore] WebGL2 unavailable");this.gl=e,this.quad=b(e),this.compositeProg=R(e,U,L),this.presentProg=R(e,U,F),this.gradeProg=R(e,U,I),this.uDst=e.getUniformLocation(this.compositeProg,"uDst"),this.uSrc=e.getUniformLocation(this.compositeProg,"uSrc"),this.uOpacity=e.getUniformLocation(this.compositeProg,"uOpacity"),this.uMode=e.getUniformLocation(this.compositeProg,"uMode"),this.uTrans=e.getUniformLocation(this.compositeProg,"uTrans"),this.uScale=e.getUniformLocation(this.compositeProg,"uScale"),this.uRot=e.getUniformLocation(this.compositeProg,"uRot"),this.uPresentTex=e.getUniformLocation(this.presentProg,"uTex");for(const o of["uShakeOff","uShakeSin","uShakeCos","uShakeScale"])this.uShake[o]=e.getUniformLocation(this.presentProg,o);for(const o of["uTex","uBright","uContrast","uSat","uGamma"])this.gradeU[o]=e.getUniformLocation(this.gradeProg,o);this.srcTex=A(e)}resize(i,e){i=Math.max(1,Math.round(i)),e=Math.max(1,Math.round(e)),!(i===this.width&&e===this.height&&this.ping)&&(this.width=i,this.height=e,this.canvas.width=i,this.canvas.height=e,this.ping=g(this.gl,i,e,this.ping),this.pong=g(this.gl,i,e,this.pong))}composite(i){var o;const e=this.gl;if(!(!this.ping||!this.pong)){e.bindVertexArray(this.quad),e.disable(e.BLEND),e.bindFramebuffer(e.FRAMEBUFFER,this.ping.fbo),e.viewport(0,0,this.width,this.height),e.clearColor(0,0,0,1),e.clear(e.COLOR_BUFFER_BIT),e.useProgram(this.compositeProg),e.uniform1i(this.uDst,0),e.uniform1i(this.uSrc,1);for(const r of i){let s=null;if(r.texture?s=r.texture:r.element&&P(e,this.srcTex,r.element)&&(s=this.srcTex),!s)continue;e.bindFramebuffer(e.FRAMEBUFFER,this.pong.fbo),e.viewport(0,0,this.width,this.height),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.ping.tex),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,s),e.uniform1f(this.uOpacity,Math.max(0,Math.min(1,r.opacity))),e.uniform1i(this.uMode,D[(o=r.blendMode)==null?void 0:o.toLowerCase()]??0);const a=r.transform;e.uniform2f(this.uTrans,(a==null?void 0:a.x)??0,(a==null?void 0:a.y)??0),e.uniform1f(this.uScale,(a==null?void 0:a.scale)??1),e.uniform1f(this.uRot,(a==null?void 0:a.rot)??0),e.drawArrays(e.TRIANGLES,0,3);const m=this.ping;this.ping=this.pong,this.pong=m}e.bindVertexArray(null)}}get outputTexture(){var i;return(i=this.ping)==null?void 0:i.tex}present(i=w){const e=this.gl;this.ping&&(e.bindFramebuffer(e.FRAMEBUFFER,null),e.viewport(0,0,this.width,this.height),e.useProgram(this.presentProg),e.bindVertexArray(this.quad),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.ping.tex),e.uniform1i(this.uPresentTex,0),e.uniform2f(this.uShake.uShakeOff,i.offX,i.offY),e.uniform1f(this.uShake.uShakeSin,i.sin),e.uniform1f(this.uShake.uShakeCos,i.cos),e.uniform1f(this.uShake.uShakeScale,i.scale),e.drawArrays(e.TRIANGLES,0,3),e.bindVertexArray(null))}applyGrade(i){const e=this.gl;if(!this.ping||!this.pong)return;e.bindFramebuffer(e.FRAMEBUFFER,this.pong.fbo),e.viewport(0,0,this.width,this.height),e.useProgram(this.gradeProg),e.bindVertexArray(this.quad),e.disable(e.BLEND),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,this.ping.tex),e.uniform1i(this.gradeU.uTex,0),e.uniform1f(this.gradeU.uBright,i.brightness),e.uniform1f(this.gradeU.uContrast,i.contrast),e.uniform1f(this.gradeU.uSat,i.saturation),e.uniform1f(this.gradeU.uGamma,i.gamma),e.drawArrays(e.TRIANGLES,0,3),e.bindVertexArray(null);const o=this.ping;this.ping=this.pong,this.pong=o}render(i,e,o){this.disposed||(this.composite(i),e&&!M(e)&&this.applyGrade(e),this.present(o))}dispose(){this.disposed=!0;const i=this.gl;this.ping&&(i.deleteTexture(this.ping.tex),i.deleteFramebuffer(this.ping.fbo)),this.pong&&(i.deleteTexture(this.pong.tex),i.deleteFramebuffer(this.pong.fbo)),i.deleteTexture(this.srcTex),i.deleteProgram(this.compositeProg),i.deleteProgram(this.presentProg),i.deleteProgram(this.gradeProg)}}const O=`#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`,n=`#version 300 es
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
`,N=n+`
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
}`,X=n+`
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
}`,G=n+`
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
}`,k=n+`
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
}`,q=n+`
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
}`,V=n+`
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
}`,W=n+`
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
}`,z=n+`
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
}`,Y=n+`
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
}`,H=n+`
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
}`,K=n+`
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
}`,$=n+`
void main(){
  vec2 uv = vUv;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float y = 0.5 + 0.2 * sin(uv.x * 3.0 + iTime * 0.5 + fi * 1.2) + 0.1 * sin(uv.x * 7.0 - iTime * 0.3 + fi);
    col += mix(iC2, iC0, fi / 5.0) * smoothstep(0.08, 0.0, abs(uv.y - y)) * (0.4 + iMid);
  }
  fragColor = vec4(col, 1.0);
}`,Q=n+`
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
}`,j=n+`
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
}`,J=n+`
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
}`,Z=n+`
void main(){
  vec2 uv = vUv;
  float v = 0.5 + 0.5 * sin(uv.x * 8.0 + iTime) * sin(uv.y * 8.0 - iTime * 0.7);
  v = pow(v, 1.0 + iTreble * 3.0);
  vec3 col = mix(iC2, iC0, v) * (0.3 + iLevel * 1.4) + iC1 * iBass * 0.5;
  fragColor = vec4(col, 1.0);
}`,ee=n+`
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
}`,te=n+`
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
}`,ie=n+`
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
}`,oe=n+`
void main(){
  float aspect = iResolution.x / max(iResolution.y, 1.0);
  vec2 p = (vUv - 0.5); p.x *= aspect;
  float r = length(p);
  float v = 0.5 + 0.5 * sin(r * 40.0 - iTime * 4.0 - iBass * 10.0);
  v *= smoothstep(0.7, 0.0, r);
  vec3 col = mix(iC2, iC0, v) * (0.4 + iLevel) + iC1 * smoothstep(0.95, 1.0, v) * 0.5;
  fragColor = vec4(col, 1.0);
}`,ae={WAVEFORM:N,SPECTRUM:X,TUNNEL:G,VORTEX:k,NEBULA:q,COSMIC:V,RETROGRID:W,KALEIDOSCOPE:z,STAGE:Y,LIQUID:H,PARTICLES:K,STORM:J,LUMINANCE:Z,STUDIO_AURORA:$,STUDIO_CHROME:Q,STUDIO_BAUHAUS:j,STUDIO_NEBULA:ee,STUDIO_GRAVITY:te,STUDIO_KINETIC:ie,STUDIO_RIPPLE:oe};class re{constructor(i){this.gl=i,this.progs=new Map,this.pool=new Map,this.quad=b(i)}program(i){let e=this.progs.get(i);if(!e){const o=R(this.gl,O,ae[i]),r={};for(const s of["iResolution","iTime","iChannel0","iBass","iMid","iTreble","iLevel","iC0","iC1","iC2","iParam0","iParam1","iParam2","iParam3"])r[s]=this.gl.getUniformLocation(o,s);e={p:o,u:r},this.progs.set(i,e)}return e}render(i,e,o,r,s){const a=this.gl,m=g(a,o,r,this.pool.get(i));this.pool.set(i,m);const{p:x,u:c}=this.program(e);a.bindFramebuffer(a.FRAMEBUFFER,m.fbo),a.viewport(0,0,o,r),a.disable(a.BLEND),a.useProgram(x),a.bindVertexArray(this.quad),a.activeTexture(a.TEXTURE2),a.bindTexture(a.TEXTURE_2D,s.audio.tex),a.uniform1i(c.iChannel0,2),a.uniform2f(c.iResolution,o,r),a.uniform1f(c.iTime,s.time),a.uniform1f(c.iBass,s.audio.bass),a.uniform1f(c.iMid,s.audio.mid),a.uniform1f(c.iTreble,s.audio.treble),a.uniform1f(c.iLevel,s.audio.level);const f=u=>s.colors[u]??[1,1,1];return a.uniform3f(c.iC0,f(0)[0],f(0)[1],f(0)[2]),a.uniform3f(c.iC1,f(1)[0],f(1)[1],f(1)[2]),a.uniform3f(c.iC2,f(2)[0],f(2)[1],f(2)[2]),a.uniform1f(c.iParam0,s.params[0]??.5),a.uniform1f(c.iParam1,s.params[1]??.5),a.uniform1f(c.iParam2,s.params[2]??.5),a.uniform1f(c.iParam3,s.params[3]??.5),a.drawArrays(a.TRIANGLES,0,3),a.bindVertexArray(null),m.tex}dispose(){const i=this.gl;this.pool.forEach(e=>{i.deleteTexture(e.tex),i.deleteFramebuffer(e.fbo)}),this.progs.forEach(e=>i.deleteProgram(e.p)),this.pool.clear(),this.progs.clear()}}const d=512;class se{constructor(i){this.gl=i,this.pixels=new Uint8Array(d*2*4),this.freq=null,this.wave=null,this.bass=0,this.mid=0,this.treble=0,this.level=0,this.tex=i.createTexture(),i.bindTexture(i.TEXTURE_2D,this.tex),i.texImage2D(i.TEXTURE_2D,0,i.RGBA8,d,2,0,i.RGBA,i.UNSIGNED_BYTE,this.pixels),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE)}update(i){if(!i)return;const e=i.frequencyBinCount,o=i.fftSize;(!this.freq||this.freq.length!==e)&&(this.freq=new Uint8Array(e)),(!this.wave||this.wave.length!==o)&&(this.wave=new Uint8Array(o)),i.getByteFrequencyData(this.freq),i.getByteTimeDomainData(this.wave),this.process(this.freq,this.wave)}updateFromArrays(i,e){this.process(i,e)}process(i,e){const o=this.gl,r=i.length,s=e.length;let a=0,m=0,x=0,c=0;const f=Math.floor(r*.08),u=Math.floor(r*.35);for(let l=0;l<d;l++){const E=Math.min(r-1,l/d*r|0),ne=Math.min(s-1,l/d*s|0),ce=i[E],fe=e[ne];let v=l*4;this.pixels[v]=this.pixels[v+1]=this.pixels[v+2]=ce,this.pixels[v+3]=255,v=(d+l)*4,this.pixels[v]=this.pixels[v+1]=this.pixels[v+2]=fe,this.pixels[v+3]=255}for(let l=0;l<r;l++){const E=i[l];a+=E,l<f?m+=E:l<u?x+=E:c+=E}this.bass=m/Math.max(1,f)/255,this.mid=x/Math.max(1,u-f)/255,this.treble=c/Math.max(1,r-u)/255,this.level=a/r/255,o.bindTexture(o.TEXTURE_2D,this.tex),o.texSubImage2D(o.TEXTURE_2D,0,0,0,d,2,o.RGBA,o.UNSIGNED_BYTE,this.pixels)}dispose(){this.gl.deleteTexture(this.tex)}}const S=self;let h=null,T=null,p=null;S.onmessage=t=>{const i=t.data;if(i.type==="init"){try{h=new B(i.canvas),T=new re(h.gl),p=new se(h.gl),S.postMessage({type:"ready"})}catch(e){S.postMessage({type:"error",message:String(e)})}return}if(i.type==="frame"&&h&&T&&p){const{width:e,height:o,time:r,grade:s,freq:a,wave:m,layers:x,colors:c}=i;h.resize(e,o),p.updateFromArrays(a,m);const f=[];for(const u of x){const l=T.render(u.id,u.mode,e,o,{time:r,audio:p,colors:c,params:u.params||[]});f.push({texture:l,opacity:u.opacity,blendMode:u.blend})}h.render(f,s);return}i.type==="dispose"&&(T==null||T.dispose(),p==null||p.dispose(),h==null||h.dispose(),h=T=p=null)}})();
