import React, { useRef, useEffect } from 'react';

// ─── Simulation resolution ────────────────────────────────────────────────────
const SIM_W = 512;
const SIM_H = 512;

// ─── Vertex shader (shared) ───────────────────────────────────────────────────
const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main(){
  v_uv  = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// ─── Simulation shader ────────────────────────────────────────────────────────
// Stores: rgb = paint color, a = wave height encoded as (h*0.5+0.5) in [0,1]
// Uses two ping-pong textures (curr = current frame, prev = previous frame)
// for the 2D wave equation: h_new = 2*h_curr - h_prev + c²*(Δh)
const SIM_FRAG = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_curr;
uniform sampler2D u_prev;
uniform vec2 u_px;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform float u_time;
uniform float u_hasDrop;
uniform vec2 u_dropPos;
uniform float u_dropR;
uniform vec3 u_dropColor;

float dec(float a){ return a * 2.0 - 1.0; }
float enc(float h){ return clamp(h * 0.5 + 0.5, 0.0, 1.0); }

void main(){
  // Sample heights
  float hC = dec(texture2D(u_curr, v_uv).a);
  float hP = dec(texture2D(u_prev, v_uv).a);
  float hU = dec(texture2D(u_curr, v_uv + vec2(0.0,  u_px.y)).a);
  float hD = dec(texture2D(u_curr, v_uv - vec2(0.0,  u_px.y)).a);
  float hL = dec(texture2D(u_curr, v_uv - vec2(u_px.x, 0.0)).a);
  float hR = dec(texture2D(u_curr, v_uv + vec2(u_px.x, 0.0)).a);

  // Wave equation (c² = 0.24, stable iff c² ≤ 0.25)
  float hN = (2.0 * hC - hP) + 0.24 * (hU + hD + hL + hR - 4.0 * hC);

  // Frequency-driven surface agitation
  float b2 = u_bass * u_bass;
  float m2 = u_mid  * u_mid;
  // Low freq: slow, large undulations across the whole pool
  hN += b2 * 0.022 * sin(v_uv.x * 28.0 + u_time * 6.0) * cos(v_uv.y * 22.0 + u_time * 4.5);
  // Mid freq: medium ripples
  hN += m2 * 0.012 * sin(v_uv.x * 70.0 + u_time * 14.0) * sin(v_uv.y * 55.0 + u_time * 11.0);
  // High freq: tiny surface texture
  hN += u_treble * 0.006 * sin(v_uv.x * 160.0 + u_time * 30.0) * cos(v_uv.y * 140.0 + u_time * 25.0);

  // Damping — slightly less damping during active audio for livelier response
  hN *= 0.987 - u_bass * 0.003;
  hN  = clamp(hN, -1.0, 1.0);

  // Paint color from current state
  vec4 c = texture2D(u_curr, v_uv);
  vec3 col = c.rgb;

  // Neighbour colours
  vec3 cU = texture2D(u_curr, v_uv + vec2(0.0,  u_px.y)).rgb;
  vec3 cD = texture2D(u_curr, v_uv - vec2(0.0,  u_px.y)).rgb;
  vec3 cL = texture2D(u_curr, v_uv - vec2(u_px.x, 0.0)).rgb;
  vec3 cR = texture2D(u_curr, v_uv + vec2(u_px.x, 0.0)).rgb;
  vec3 diff = (cU + cD + cL + cR) * 0.25;

  // Advect colour along wave gradient (paint flows with the wave)
  vec2 grad   = vec2(hR - hL, hU - hD);
  vec2 advUV  = clamp(v_uv - grad * u_px * 3.5, vec2(0.0), vec2(1.0));
  vec3 adv    = texture2D(u_curr, advUV).rgb;

  // Blend: diffusion (slow mixing) + advection (wave-driven flow)
  float mixStr = 0.013 + u_bass * 0.008;
  col = mix(col, diff, mixStr * 0.35);
  col = mix(col, adv,  mixStr * 0.65);

  // Very slow decay toward dark pool base (preserves paint a long time)
  col = mix(col, vec3(0.032, 0.012, 0.052), 0.00065);

  // ── Drop injection ────────────────────────────────────────────────────────
  if (u_hasDrop > 0.5) {
    float d = length(v_uv - u_dropPos);
    float t = 1.0 - smoothstep(0.0, u_dropR, d);
    t = t * t * t;                              // sharp blob centre
    col  = mix(col, u_dropColor, t * 0.88);
    hN   = clamp(hN + t * 0.55, -1.0, 1.0);   // impact ripple
  }

  gl_FragColor = vec4(col, enc(hN));
}`;

// ─── Render shader ─────────────────────────────────────────────────────────────
// Reads the simulation state and outputs a lit, paint-like surface
const RENDER_FRAG = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_state;
uniform vec2 u_px;
uniform float u_time;
uniform float u_bass;

void main(){
  vec4 s  = texture2D(u_state, v_uv);
  float h = s.a * 2.0 - 1.0;

  float hR = texture2D(u_state, v_uv + vec2(u_px.x, 0.0)).a * 2.0 - 1.0;
  float hL = texture2D(u_state, v_uv - vec2(u_px.x, 0.0)).a * 2.0 - 1.0;
  float hU = texture2D(u_state, v_uv + vec2(0.0, u_px.y)).a * 2.0 - 1.0;
  float hD = texture2D(u_state, v_uv - vec2(0.0, u_px.y)).a * 2.0 - 1.0;

  // Surface normal from finite differences
  vec3 norm = normalize(vec3((hL - hR) * 7.0, (hD - hU) * 7.0, 1.0));

  // Key light (top-left, warm)
  vec3 keyDir = normalize(vec3(0.4, 0.65, 1.0));
  float keyDiff = clamp(dot(norm, keyDir), 0.0, 1.0);
  vec3 halfV    = normalize(keyDir + vec3(0.0, 0.0, 1.0));
  float spec    = pow(clamp(dot(norm, halfV), 0.0, 1.0), 90.0);

  // Fill light (cool, opposite side)
  vec3 fillDir  = normalize(vec3(-0.3, -0.4, 0.6));
  float fillDiff = clamp(dot(norm, fillDir), 0.0, 1.0) * 0.18;

  // Paint colour from simulation
  vec3 paint = s.rgb;
  float lum   = dot(paint, vec3(0.299, 0.587, 0.114));

  // Dark pool base — near-black deep purple
  vec3 base = vec3(0.022, 0.008, 0.042);
  float dens  = smoothstep(0.0, 0.11, lum);     // how "painted" this texel is
  vec3 col    = mix(base, paint, dens);

  // Apply lighting
  col *= 0.45 + 0.55 * keyDiff;               // key diffuse
  col += col * fillDiff;                       // fill bounce
  col += vec3(spec * 0.55 + spec * spec * 0.35); // sharp specular sheen

  // Crest highlight (wave peaks catch extra light)
  float crest = clamp(h, 0.0, 1.0);
  col += vec3(0.04, 0.03, 0.09) * crest;

  // Trough darkening (wave valleys go darker)
  col *= 1.0 + min(h * 0.45, 0.0);

  // Iridescent shimmer at wave peaks — hue shifts slowly
  float shimAmt = crest * (0.08 + u_bass * 0.06);
  float hue = fract(v_uv.x * 2.5 + v_uv.y * 1.8 + u_time * 0.25);
  vec3 shim = 0.5 + 0.5 * cos(6.2832 * (hue + vec3(0.0, 0.333, 0.667)));
  col += shim * shimAmt;

  // Thin edge vignette to ground the pool
  float vig = length((v_uv - 0.5) * 2.0);
  col *= 1.0 - vig * vig * 0.18;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

// ─── WebGL helpers ─────────────────────────────────────────────────────────────
function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('[PaintPool] shader error:', gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

function linkProgram(gl: WebGLRenderingContext, vert: string, frag: string): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vert);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, frag);
  if (!vs || !fs) return null;
  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error('[PaintPool] link error:', gl.getProgramInfoLog(p));
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return p;
}

function makeTexture(gl: WebGLRenderingContext, w: number, h: number): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function makeFBO(gl: WebGLRenderingContext, tex: WebGLTexture): WebGLFramebuffer {
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fb;
}

function bindQuad(gl: WebGLRenderingContext, prog: WebGLProgram, buf: WebGLBuffer) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  const loc = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
}

// ─── Drop colour logic ─────────────────────────────────────────────────────────
// Warm = low-freq (bass), Cool = high-freq (treble), vivid saturation throughout
function dropColor(bass: number, mid: number, treble: number): [number, number, number] {
  const total = bass + mid + treble + 0.001;
  const bW = bass / total;
  const mW = mid  / total;
  const tW = treble / total;

  // Palette anchors
  const deepRed   : [number,number,number] = [0.90, 0.08, 0.04]; // sub-bass
  const orange    : [number,number,number] = [1.00, 0.46, 0.00]; // bass
  const amber     : [number,number,number] = [0.95, 0.75, 0.00]; // bass-mid
  const cyan      : [number,number,number] = [0.00, 0.80, 0.85]; // mid-treble
  const indigo    : [number,number,number] = [0.25, 0.10, 0.95]; // treble
  const violet    : [number,number,number] = [0.65, 0.00, 0.90]; // high treble

  let r = 0, g = 0, b = 0;
  if (bW > 0.55) {
    // dominated by bass
    const t = Math.min((bW - 0.55) / 0.45, 1);
    r = deepRed[0] * t + orange[0] * (1 - t);
    g = deepRed[1] * t + orange[1] * (1 - t);
    b = deepRed[2] * t + orange[2] * (1 - t);
  } else if (bW > 0.3) {
    const t = (bW - 0.3) / 0.25;
    r = orange[0] * t + amber[0] * (1 - t);
    g = orange[1] * t + amber[1] * (1 - t);
    b = orange[2] * t + amber[2] * (1 - t);
  } else if (tW > 0.5) {
    const t = Math.min((tW - 0.5) / 0.5, 1);
    r = violet[0] * t + indigo[0] * (1 - t);
    g = violet[1] * t + indigo[1] * (1 - t);
    b = violet[2] * t + indigo[2] * (1 - t);
  } else if (tW > 0.25) {
    const t = (tW - 0.25) / 0.25;
    r = indigo[0] * t + cyan[0] * (1 - t);
    g = indigo[1] * t + cyan[1] * (1 - t);
    b = indigo[2] * t + cyan[2] * (1 - t);
  } else {
    // balanced mid: cool amber-green
    r = amber[0] * mW + cyan[0] * (1 - mW);
    g = amber[1] * mW + cyan[1] * (1 - mW);
    b = amber[2] * mW + cyan[2] * (1 - mW);
  }
  return [r, g, b];
}

// ─── Component ─────────────────────────────────────────────────────────────────
interface Props {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
}

const PaintPoolVisualizer: React.FC<Props> = ({ analyser, isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    }) as WebGLRenderingContext | null;

    if (!gl) {
      console.warn('[PaintPool] WebGL not available');
      return;
    }

    // ── Compile shaders ───────────────────────────────────────────────────────
    const simProg    = linkProgram(gl, VERT, SIM_FRAG);
    const renderProg = linkProgram(gl, VERT, RENDER_FRAG);
    if (!simProg || !renderProg) return;

    // ── Geometry — fullscreen triangle strip ──────────────────────────────────
    const quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1, -1,  1, -1,  -1, 1,  1, 1]),
      gl.STATIC_DRAW);

    // ── Ping-pong textures + FBOs ─────────────────────────────────────────────
    const texA = makeTexture(gl, SIM_W, SIM_H);
    const texB = makeTexture(gl, SIM_W, SIM_H);
    const fboA = makeFBO(gl, texA);
    const fboB = makeFBO(gl, texB);

    // Seed both textures with dark-pool base colour (wave height = 0.5 = mid)
    const seed = new Uint8Array(SIM_W * SIM_H * 4);
    for (let i = 0; i < seed.length; i += 4) {
      seed[i]   = 8;    // r – dark purple base
      seed[i+1] = 3;    // g
      seed[i+2] = 13;   // b
      seed[i+3] = 127;  // a – wave height 0 (encoded as 0.5)
    }
    for (const tex of [texA, texB]) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SIM_W, SIM_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, seed);
    }
    gl.bindTexture(gl.TEXTURE_2D, null);

    // ── State ─────────────────────────────────────────────────────────────────
    let currIdx = 0;      // which FBO/tex pair is "current"
    const fbos = [fboA, fboB];
    const texs = [texA, texB];

    let lastBeat   = 0;
    let bassAvg    = 0.05;  // exponential moving average of bass energy
    let animId     = 0;
    let pendingDrop: { pos: [number, number]; color: [number, number, number] } | null = null;
    const startTime = performance.now();

    // Frequency data buffer
    const freqBuf = new Uint8Array(analyser ? analyser.frequencyBinCount : 1024);

    // Beat detection thresholds
    const BEAT_RATIO  = 1.55;   // current / avg ratio to trigger
    const BEAT_COOLDOWN = 380;  // ms between drops

    // ── Uniform locations cache ───────────────────────────────────────────────
    // Sim uniforms
    const simLoc = {
      curr:      gl.getUniformLocation(simProg, 'u_curr'),
      prev:      gl.getUniformLocation(simProg, 'u_prev'),
      px:        gl.getUniformLocation(simProg, 'u_px'),
      bass:      gl.getUniformLocation(simProg, 'u_bass'),
      mid:       gl.getUniformLocation(simProg, 'u_mid'),
      treble:    gl.getUniformLocation(simProg, 'u_treble'),
      time:      gl.getUniformLocation(simProg, 'u_time'),
      hasDrop:   gl.getUniformLocation(simProg, 'u_hasDrop'),
      dropPos:   gl.getUniformLocation(simProg, 'u_dropPos'),
      dropR:     gl.getUniformLocation(simProg, 'u_dropR'),
      dropColor: gl.getUniformLocation(simProg, 'u_dropColor'),
    };
    // Render uniforms
    const renLoc = {
      state: gl.getUniformLocation(renderProg, 'u_state'),
      px:    gl.getUniformLocation(renderProg, 'u_px'),
      time:  gl.getUniformLocation(renderProg, 'u_time'),
      bass:  gl.getUniformLocation(renderProg, 'u_bass'),
    };

    // ── Render loop ───────────────────────────────────────────────────────────
    const frame = () => {
      animId = requestAnimationFrame(frame);

      const now  = performance.now();
      const t    = (now - startTime) * 0.001;

      // ── Audio analysis ────────────────────────────────────────────────────
      let bass = 0, mid = 0, treble = 0;
      if (analyser && isPlaying) {
        analyser.getByteFrequencyData(freqBuf);
        const bins = freqBuf.length;

        // Bass: bins 1-12 (~20-250Hz)
        for (let i = 1; i <= 12; i++) bass += freqBuf[i];
        bass = bass / (12 * 255);

        // Mid: bins 12-80 (~250-2kHz)
        for (let i = 12; i <= 80; i++) mid += freqBuf[i];
        mid = mid / (69 * 255);

        // Treble: bins 80-200 (~2k-10kHz)
        for (let i = 80; i <= Math.min(200, bins - 1); i++) treble += freqBuf[i];
        treble = treble / (121 * 255);
      } else if (isPlaying) {
        // No analyser data — gentle ambient simulation
        bass   = (Math.sin(t * 0.7) * 0.5 + 0.5) * 0.25;
        mid    = (Math.cos(t * 1.3) * 0.5 + 0.5) * 0.15;
        treble = (Math.sin(t * 2.1) * 0.5 + 0.5) * 0.10;
      }

      // ── Beat detection ────────────────────────────────────────────────────
      bassAvg = bassAvg * 0.94 + bass * 0.06;
      if (
        isPlaying &&
        bass > bassAvg * BEAT_RATIO &&
        bass > 0.12 &&
        now - lastBeat > BEAT_COOLDOWN
      ) {
        lastBeat = now;
        const col = dropColor(bass, mid, treble);
        // Drop at a random point, biased toward centre
        const px = 0.25 + Math.random() * 0.5;
        const py = 0.25 + Math.random() * 0.5;
        pendingDrop = { pos: [px, py], color: col };
      }

      // ── Resize canvas to fill its CSS size ───────────────────────────────
      const dpr = Math.min(window.devicePixelRatio, 2);
      const cw  = canvas.clientWidth  * dpr | 0;
      const ch  = canvas.clientHeight * dpr | 0;
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width  = cw;
        canvas.height = ch;
      }

      // ════════════════════════════════════════════════════════════════════
      // PASS 1 — Simulation step (render to off-screen FBO at SIM_W×SIM_H)
      // ════════════════════════════════════════════════════════════════════
      const prevIdx = currIdx;
      currIdx = 1 - currIdx;

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[currIdx]);
      gl.viewport(0, 0, SIM_W, SIM_H);

      gl.useProgram(simProg);
      bindQuad(gl, simProg, quadBuf);

      // Textures
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texs[prevIdx]); // curr (previous frame)
      gl.uniform1i(simLoc.curr, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, texs[currIdx]);  // prev (two frames ago)
      gl.uniform1i(simLoc.prev, 1);

      gl.uniform2f(simLoc.px,     1 / SIM_W, 1 / SIM_H);
      gl.uniform1f(simLoc.bass,   bass);
      gl.uniform1f(simLoc.mid,    mid);
      gl.uniform1f(simLoc.treble, treble);
      gl.uniform1f(simLoc.time,   t);

      if (pendingDrop) {
        gl.uniform1f(simLoc.hasDrop,   1.0);
        gl.uniform2f(simLoc.dropPos,   pendingDrop.pos[0], pendingDrop.pos[1]);
        gl.uniform1f(simLoc.dropR,     0.055 + Math.random() * 0.035);
        gl.uniform3f(simLoc.dropColor, ...pendingDrop.color);
        pendingDrop = null;
      } else {
        gl.uniform1f(simLoc.hasDrop, 0.0);
      }

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // ════════════════════════════════════════════════════════════════════
      // PASS 2 — Render to screen (full canvas resolution)
      // ════════════════════════════════════════════════════════════════════
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);

      gl.useProgram(renderProg);
      bindQuad(gl, renderProg, quadBuf);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texs[currIdx]);
      gl.uniform1i(renLoc.state, 0);

      gl.uniform2f(renLoc.px,   1 / SIM_W, 1 / SIM_H);
      gl.uniform1f(renLoc.time, t);
      gl.uniform1f(renLoc.bass, bass);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    animId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animId);
      gl.deleteProgram(simProg);
      gl.deleteProgram(renderProg);
      gl.deleteTexture(texA);
      gl.deleteTexture(texB);
      gl.deleteFramebuffer(fboA);
      gl.deleteFramebuffer(fboB);
      gl.deleteBuffer(quadBuf);
    };
  // Re-init if analyser or playback state changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyser, isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ display: 'block' }}
    />
  );
};

export default PaintPoolVisualizer;
