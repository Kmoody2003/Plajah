import React, { useRef, useEffect } from 'react';
import { setPaintColor } from '../services/smartLightingService';

const SIM_W = 512;
const SIM_H = 512;

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main(){
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// ─── Simulation shader ─────────────────────────────────────────────────────────
// Wave equation + color advection.
// New: u_vocal (1-4kHz vocal presence), u_energy (RMS), u_dropStr (beat strength 0-1).
// Damping and wave speed are now energy-reactive.
const SIM_FRAG = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_curr;
uniform sampler2D u_prev;
uniform vec2  u_px;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform float u_vocal;
uniform float u_energy;
uniform float u_time;
uniform float u_hasDrop;
uniform vec2  u_dropPos;
uniform float u_dropR;
uniform float u_dropStr;
uniform vec3  u_dropColor;

float dec(float a){ return a * 2.0 - 1.0; }
float enc(float h){ return clamp(h * 0.5 + 0.5, 0.0, 1.0); }

void main(){
  float hC = dec(texture2D(u_curr, v_uv).a);
  float hP = dec(texture2D(u_prev, v_uv).a);
  float hU = dec(texture2D(u_curr, v_uv + vec2(0.0,   u_px.y)).a);
  float hD = dec(texture2D(u_curr, v_uv - vec2(0.0,   u_px.y)).a);
  float hL = dec(texture2D(u_curr, v_uv - vec2(u_px.x, 0.0  )).a);
  float hR = dec(texture2D(u_curr, v_uv + vec2(u_px.x, 0.0  )).a);

  // Wave propagation — speed increases with energy (more alive at high energy)
  float speed = 0.21 + u_energy * 0.07;
  float hN = (2.0 * hC - hP) + speed * (hU + hD + hL + hR - 4.0 * hC);

  // ── Frequency-band surface perturbations ──────────────────────────────────
  // Bass — large slow undulations, amplitude scales as bass^2 for punchiness
  float b2 = u_bass * u_bass;
  hN += b2 * 0.048 * sin(v_uv.x * 16.0 + u_time * 4.5) * cos(v_uv.y * 12.0 + u_time * 3.2);
  hN += u_bass * 0.020 * cos(v_uv.x *  8.0 + u_time * 2.2) * sin(v_uv.y *  6.5 + u_time * 1.8);

  // Mid — medium ripple texture
  float m2 = u_mid * u_mid;
  hN += m2 * 0.026 * sin(v_uv.x * 50.0 + u_time * 10.0) * sin(v_uv.y * 42.0 + u_time *  8.5);
  hN += u_mid * 0.012 * cos(v_uv.x * 28.0 + u_time *  6.0) * cos(v_uv.y * 24.0 + u_time *  5.0);

  // Vocal presence (1-4kHz) — high-freq modulation, creates shimmering texture on vocals
  float voc2 = u_vocal * u_vocal;
  hN += voc2 * 0.022 * sin(v_uv.x * 130.0 + u_time * 26.0) * cos(v_uv.y * 110.0 + u_time * 21.0);
  hN += u_vocal * 0.013 * sin(v_uv.x * 190.0 + u_time * 38.0 + v_uv.y * 170.0);
  hN += voc2 * 0.010 * cos(v_uv.x * 250.0 + u_time * 52.0) * sin(v_uv.y * 220.0 + u_time * 45.0);

  // Treble — fine surface sparkle
  hN += u_treble * 0.010 * sin(v_uv.x * 300.0 + u_time * 62.0) * cos(v_uv.y * 280.0 + u_time * 55.0);

  // Dynamic damping: high energy = less damping (waves persist, build chaos)
  float damp = 0.981 + u_energy * 0.010;
  hN *= damp;
  hN  = clamp(hN, -1.0, 1.0);

  // ── Color advection ───────────────────────────────────────────────────────
  vec4 c   = texture2D(u_curr, v_uv);
  vec3 col = c.rgb;
  vec3 cU  = texture2D(u_curr, v_uv + vec2(0.0,   u_px.y)).rgb;
  vec3 cD  = texture2D(u_curr, v_uv - vec2(0.0,   u_px.y)).rgb;
  vec3 cL  = texture2D(u_curr, v_uv - vec2(u_px.x, 0.0  )).rgb;
  vec3 cR  = texture2D(u_curr, v_uv + vec2(u_px.x, 0.0  )).rgb;
  vec3 diff = (cU + cD + cL + cR) * 0.25;

  // Advection follows the surface gradient — energy boosts how far paint flows
  vec2 grad  = vec2(hR - hL, hU - hD);
  float advD = 3.2 + u_energy * 4.5;
  vec2 advUV = clamp(v_uv - grad * u_px * advD, vec2(0.0), vec2(1.0));
  vec3 adv   = texture2D(u_curr, advUV).rgb;

  float mixStr = 0.011 + u_energy * 0.012;
  col = mix(col, diff, mixStr * 0.28);
  col = mix(col, adv,  mixStr * 0.72);
  // Slow sink to deep pool — slightly faster at rest so idle clears to black
  float fade = 0.00080 - u_energy * 0.00020;
  col = mix(col, vec3(0.026, 0.009, 0.046), fade);

  // ── Drop impact ───────────────────────────────────────────────────────────
  if (u_hasDrop > 0.5) {
    float d = length(v_uv - u_dropPos);

    // Core splash — cubic falloff, bigger and deeper on stronger beats
    float core  = 1.0 - smoothstep(0.0, u_dropR, d);
    core = core * core * core;
    float paintStr = 0.78 + u_dropStr * 0.20;
    float waveStr  = 0.40 + u_dropStr * 0.80;
    col = mix(col, u_dropColor, core * paintStr);
    hN  = clamp(hN + core * waveStr, -1.0, 1.0);

    // Outer ring splash — bigger beats create a visible ring around the core
    float ringR  = u_dropR * (1.6 + u_dropStr * 1.4);
    float ringW  = u_dropR * (0.25 + u_dropStr * 0.15);
    float ring   = (1.0 - smoothstep(0.0, ringW, abs(d - ringR))) * u_dropStr;
    hN = clamp(hN + ring * 0.35, -1.0, 1.0);
    col = mix(col, u_dropColor * 0.7, ring * 0.30 * u_dropStr);
  }

  gl_FragColor = vec4(col, enc(hN));
}`;

// ─── Render shader ─────────────────────────────────────────────────────────────
// Normal-mapped lighting + energy-reactive specular, shimmer, treble sparkle.
const RENDER_FRAG = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_state;
uniform vec2  u_px;
uniform float u_time;
uniform float u_bass;
uniform float u_energy;
uniform float u_vocal;
uniform float u_treble;

void main(){
  vec4  s  = texture2D(u_state, v_uv);
  float h  = s.a * 2.0 - 1.0;
  float hR = texture2D(u_state, v_uv + vec2(u_px.x, 0.0 )).a * 2.0 - 1.0;
  float hL = texture2D(u_state, v_uv - vec2(u_px.x, 0.0 )).a * 2.0 - 1.0;
  float hU = texture2D(u_state, v_uv + vec2(0.0,  u_px.y)).a * 2.0 - 1.0;
  float hD = texture2D(u_state, v_uv - vec2(0.0,  u_px.y)).a * 2.0 - 1.0;

  // Normal map — steeper normals at high energy = more dramatic lighting contrast
  float nScale   = 7.0 + u_energy * 14.0 + u_bass * 5.0;
  vec3  norm     = normalize(vec3((hL - hR) * nScale, (hD - hU) * nScale, 1.0));

  vec3  keyDir   = normalize(vec3(0.42, 0.68, 1.0));
  float keyDiff  = clamp(dot(norm, keyDir), 0.0, 1.0);

  // Specular — tighter and brighter at high energy
  float specPow  = 55.0 + u_energy * 90.0 + u_bass * 30.0;
  vec3  halfV    = normalize(keyDir + vec3(0.0, 0.0, 1.0));
  float spec     = pow(clamp(dot(norm, halfV), 0.0, 1.0), specPow);

  vec3  fillDir  = normalize(vec3(-0.28, -0.42, 0.6));
  float fillDiff = clamp(dot(norm, fillDir), 0.0, 1.0) * 0.24;

  // Base paint color
  vec3  paint = s.rgb;
  float lum   = dot(paint, vec3(0.299, 0.587, 0.114));
  vec3  base  = vec3(0.020, 0.007, 0.042);
  float dens  = smoothstep(0.0, 0.09, lum);
  vec3  col   = mix(base, paint, dens);

  // Diffuse lighting — contrast increases with energy
  float diffStr = 0.36 + u_energy * 0.28;
  col *= (1.0 - diffStr) + diffStr * keyDiff;
  col += col * fillDiff;

  // Specular highlights — much brighter on beat, scales hard with energy
  float specStr = 0.40 + u_energy * 1.0 + u_bass * 0.55;
  col += vec3(spec * specStr + spec * spec * 0.55);

  // Wave crest glow — purple/blue tint on peaks, energy-scaled
  float crest = clamp(h, 0.0, 1.0);
  float trough = clamp(-h, 0.0, 1.0);
  col += vec3(0.04, 0.03, 0.14) * crest * (1.0 + u_energy * 2.2 + u_bass * 1.0);
  // Troughs darken slightly for depth
  col *= 1.0 + min(h * (0.55 + u_energy * 0.35), 0.0);

  // Iridescent shimmer — driven by bass for slow roll, vocal adds rapid fine shimmer
  float shimBase = crest * (0.07 + u_bass * 0.08 + u_energy * 0.12);
  float hue      = fract(v_uv.x * 2.5 + v_uv.y * 1.8 + u_time * 0.22 + u_vocal * 0.4);
  vec3  shim     = 0.5 + 0.5 * cos(6.2832 * (hue + vec3(0.0, 0.333, 0.667)));
  col += shim * shimBase;

  // Vocal micro-shimmer — rapid fine iridescence that flickers with voice
  float vocalShim = u_vocal * u_vocal * 0.06 * sin(v_uv.x * 340.0 + u_time * 68.0 + v_uv.y * 310.0);
  float hueV      = fract(v_uv.x * 8.0 + v_uv.y * 6.0 + u_time * 1.2);
  vec3  shimV     = 0.5 + 0.5 * cos(6.2832 * (hueV + vec3(0.1, 0.44, 0.77)));
  col += shimV * max(vocalShim, 0.0);

  // Treble sparkle — hot white-ish flashes on high-frequency transients
  float sparkle = u_treble * 0.18 * pow(max(0.0, dot(norm, keyDir)), 5.0);
  col += vec3(sparkle * 0.9, sparkle * 0.85, sparkle);

  // Vignette
  float vig = length((v_uv - 0.5) * 2.0);
  col *= 1.0 - vig * vig * 0.22;

  // Global brightness envelope — dark and moody at rest, explosive at peak
  col *= 0.72 + u_energy * 0.55 + u_bass * 0.15;

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

function makeTexture(gl: WebGLRenderingContext, w: number, h: number, data?: Uint8Array): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data ?? null);
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

// ─── Colour palettes ──────────────────────────────────────────────────────────
const PALETTE: [number, number, number][] = [
  [0.92, 0.08, 0.04],
  [1.00, 0.46, 0.00],
  [0.95, 0.75, 0.00],
  [0.00, 0.82, 0.88],
  [0.25, 0.10, 0.96],
  [0.68, 0.00, 0.92],
  [0.00, 0.72, 0.42],
  [0.88, 0.10, 0.58],
];

function dropColor(bass: number, mid: number, treble: number, vocal: number): [number, number, number] {
  const total = bass + mid + treble + vocal + 0.001;
  const bW = bass   / total;
  const tW = treble / total;
  const vW = vocal  / total;
  const mW = mid    / total;
  const [deepRed, orange, amber, cyan, indigo, violet, green, magenta] = PALETTE;
  let r = 0, g = 0, b = 0;

  if (bW > 0.50) {
    const t = Math.min((bW - 0.50) / 0.50, 1);
    [r, g, b] = deepRed.map((v, i) => v * t + orange[i] * (1 - t)) as unknown as [number, number, number];
  } else if (bW > 0.28) {
    const t = (bW - 0.28) / 0.22;
    [r, g, b] = orange.map((v, i) => v * t + amber[i] * (1 - t)) as unknown as [number, number, number];
  } else if (vW > 0.40) {
    // Vocals drive magenta/violet
    const t = Math.min((vW - 0.40) / 0.60, 1);
    [r, g, b] = magenta.map((v, i) => v * t + violet[i] * (1 - t)) as unknown as [number, number, number];
  } else if (tW > 0.45) {
    const t = Math.min((tW - 0.45) / 0.55, 1);
    [r, g, b] = violet.map((v, i) => v * t + indigo[i] * (1 - t)) as unknown as [number, number, number];
  } else if (tW > 0.22) {
    const t = (tW - 0.22) / 0.23;
    [r, g, b] = indigo.map((v, i) => v * t + cyan[i] * (1 - t)) as unknown as [number, number, number];
  } else {
    [r, g, b] = amber.map((v, i) => v * mW + cyan[i] * (1 - mW)) as unknown as [number, number, number];
  }
  return [r, g, b];
}

function ambientColor(seed: number): [number, number, number] {
  return PALETTE[Math.abs(Math.floor(seed * 7.3)) % PALETTE.length];
}

// ─── Component ─────────────────────────────────────────────────────────────────
interface Props {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  alwaysAnimate?: boolean;
}

const PaintPoolVisualizer: React.FC<Props> = ({ analyser, isPlaying, alwaysAnimate }) => {
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

    const simProg    = linkProgram(gl, VERT, SIM_FRAG);
    const renderProg = linkProgram(gl, VERT, RENDER_FRAG);
    if (!simProg || !renderProg) return;

    const quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1, -1,  1, -1,  -1, 1,  1, 1]),
      gl.STATIC_DRAW);

    const seed = new Uint8Array(SIM_W * SIM_H * 4);
    for (let i = 0; i < seed.length; i += 4) {
      seed[i] = 7; seed[i+1] = 3; seed[i+2] = 12; seed[i+3] = 127;
    }

    const texA = makeTexture(gl, SIM_W, SIM_H, seed);
    const texB = makeTexture(gl, SIM_W, SIM_H, seed);
    const texC = makeTexture(gl, SIM_W, SIM_H, seed);
    gl.bindTexture(gl.TEXTURE_2D, null);

    const fboA = makeFBO(gl, texA);
    const fboB = makeFBO(gl, texB);
    const fboC = makeFBO(gl, texC);

    const texs = [texA, texB, texC];
    const fbos = [fboA, fboB, fboC];

    let currIdx  = 0;
    let prevIdx  = 1;
    let writeIdx = 2;

    // ── Beat detection state ───────────────────────────────────────────────
    let bassAvg    = 0.05;
    let energyAvg  = 0.05;
    let lastBeat   = 0;
    let lastDrop   = -9999;
    let animId     = 0;
    let frameCount = 0;
    let dropSeed   = 0;

    // Multiple drops can be queued per beat (big beats scatter satellites)
    type PendingDrop = { pos: [number, number]; color: [number, number, number]; str: number };
    const dropQueue: PendingDrop[] = [];

    const startTime = performance.now();
    const bins      = analyser ? analyser.frequencyBinCount : 1024;
    const freqBuf   = new Uint8Array(bins);

    // At 44100Hz / 1024 bins → ~43Hz per bin
    // Bass:   bins  1-12  (43-516Hz)
    // Mid:    bins 12-40  (516Hz-1.7kHz)
    // Vocal:  bins 40-120 (1.7-5.2kHz) — where voice presence cuts through
    // Treble: bins 120-220 (5.2-9.5kHz)
    const BASS_END   = 12;
    const MID_END    = 40;
    const VOCAL_END  = 120;
    const TREBLE_END = 220;

    const BEAT_RATIO    = 1.50; // bass must be 1.5× running average to trigger
    const BEAT_COOLDOWN = 260;  // ms min between beats (allows ~230 BPM)
    const IDLE_INTERVAL = 520;

    // ── Uniform location cache ─────────────────────────────────────────────
    const simLoc = {
      curr:      gl.getUniformLocation(simProg, 'u_curr'),
      prev:      gl.getUniformLocation(simProg, 'u_prev'),
      px:        gl.getUniformLocation(simProg, 'u_px'),
      bass:      gl.getUniformLocation(simProg, 'u_bass'),
      mid:       gl.getUniformLocation(simProg, 'u_mid'),
      treble:    gl.getUniformLocation(simProg, 'u_treble'),
      vocal:     gl.getUniformLocation(simProg, 'u_vocal'),
      energy:    gl.getUniformLocation(simProg, 'u_energy'),
      time:      gl.getUniformLocation(simProg, 'u_time'),
      hasDrop:   gl.getUniformLocation(simProg, 'u_hasDrop'),
      dropPos:   gl.getUniformLocation(simProg, 'u_dropPos'),
      dropR:     gl.getUniformLocation(simProg, 'u_dropR'),
      dropStr:   gl.getUniformLocation(simProg, 'u_dropStr'),
      dropColor: gl.getUniformLocation(simProg, 'u_dropColor'),
    };
    const renLoc = {
      state:   gl.getUniformLocation(renderProg, 'u_state'),
      px:      gl.getUniformLocation(renderProg, 'u_px'),
      time:    gl.getUniformLocation(renderProg, 'u_time'),
      bass:    gl.getUniformLocation(renderProg, 'u_bass'),
      energy:  gl.getUniformLocation(renderProg, 'u_energy'),
      vocal:   gl.getUniformLocation(renderProg, 'u_vocal'),
      treble:  gl.getUniformLocation(renderProg, 'u_treble'),
    };

    const frame = () => {
      animId = requestAnimationFrame(frame);

      const now = performance.now();
      const t   = (now - startTime) * 0.001;

      // ── Audio analysis ────────────────────────────────────────────────────
      let bass = 0, mid = 0, vocal = 0, treble = 0, energy = 0;

      if (analyser && isPlaying) {
        analyser.getByteFrequencyData(freqBuf);

        for (let i = 1; i <= BASS_END; i++)       bass   += freqBuf[i];
        for (let i = BASS_END; i <= MID_END; i++) mid    += freqBuf[i];
        for (let i = MID_END; i <= VOCAL_END; i++) vocal  += freqBuf[i];
        for (let i = VOCAL_END; i <= Math.min(TREBLE_END, bins - 1); i++) treble += freqBuf[i];

        bass   /= (BASS_END)            * 255;
        mid    /= (MID_END - BASS_END)  * 255;
        vocal  /= (VOCAL_END - MID_END) * 255;
        treble /= (TREBLE_END - VOCAL_END) * 255;

        // RMS energy across lower 300 bins
        let sq = 0;
        const eBins = Math.min(300, bins);
        for (let i = 0; i < eBins; i++) sq += (freqBuf[i] / 255) ** 2;
        energy = Math.sqrt(sq / eBins);

      } else if (isPlaying || alwaysAnimate) {
        bass   = (Math.sin(t * 0.7)  * 0.5 + 0.5) * 0.50;
        mid    = (Math.cos(t * 1.3)  * 0.5 + 0.5) * 0.40;
        vocal  = (Math.sin(t * 2.5)  * 0.5 + 0.5) * 0.30;
        treble = (Math.sin(t * 3.8)  * 0.5 + 0.5) * 0.25;
        energy = (bass + mid + vocal + treble) * 0.35;
      }

      // ── Beat detection ────────────────────────────────────────────────────
      bassAvg   = bassAvg   * 0.93 + bass   * 0.07;
      energyAvg = energyAvg * 0.96 + energy * 0.04;

      if (isPlaying && analyser && bass > bassAvg * BEAT_RATIO && bass > 0.10 && now - lastBeat > BEAT_COOLDOWN) {
        lastBeat = now;

        // Beat strength: 0 = barely above threshold, 1 = massive hit
        const beatStr = Math.min((bass / (bassAvg * BEAT_RATIO) - 1.0) * 0.8, 1.0);

        const col = dropColor(bass, mid, treble, vocal);

        // Primary drop — radius scales with beat strength
        const dropR = 0.045 + beatStr * 0.130;
        dropQueue.push({
          pos: [0.20 + Math.random() * 0.60, 0.20 + Math.random() * 0.60],
          color: col,
          str: beatStr,
        });

        // Satellite drops on strong beats (beatStr > 0.55 → 2 extra; > 0.80 → 3 extra)
        const extras = beatStr > 0.80 ? 3 : beatStr > 0.55 ? 2 : beatStr > 0.30 ? 1 : 0;
        for (let i = 0; i < extras; i++) {
          const angle = (i / extras) * Math.PI * 2 + Math.random() * 0.8;
          const dist  = 0.12 + Math.random() * 0.18;
          const cx    = 0.5 + Math.cos(angle) * dist;
          const cy    = 0.5 + Math.sin(angle) * dist;
          // Satellites slightly shifted color
          const shift = (i + 1) % PALETTE.length;
          const sat: PendingDrop = {
            pos: [Math.max(0.05, Math.min(0.95, cx)), Math.max(0.05, Math.min(0.95, cy))],
            color: PALETTE[shift],
            str: beatStr * 0.55,
          };
          dropQueue.push(sat);
        }
      }

      // ── Idle ambient drops ────────────────────────────────────────────────
      if (alwaysAnimate && dropQueue.length === 0 && now - lastDrop > IDLE_INTERVAL) {
        lastDrop = now;
        dropQueue.push({
          pos:   [0.12 + Math.random() * 0.76, 0.12 + Math.random() * 0.76],
          color: ambientColor(dropSeed++),
          str:   0.25,
        });
      }

      // ── Canvas resize ─────────────────────────────────────────────────────
      const dpr = Math.min(window.devicePixelRatio, 2);
      const cw  = canvas.clientWidth  * dpr | 0;
      const ch  = canvas.clientHeight * dpr | 0;
      if (cw > 0 && ch > 0 && (canvas.width !== cw || canvas.height !== ch)) {
        canvas.width  = cw;
        canvas.height = ch;
      }
      if (canvas.width === 0 || canvas.height === 0) return;

      // ════════════════════════════════════════════════════════════════════
      // PASS 1 — Simulation (process one drop per frame from the queue)
      // ════════════════════════════════════════════════════════════════════
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[writeIdx]);
      gl.viewport(0, 0, SIM_W, SIM_H);
      gl.useProgram(simProg);
      bindQuad(gl, simProg, quadBuf);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texs[currIdx]);
      gl.uniform1i(simLoc.curr, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, texs[prevIdx]);
      gl.uniform1i(simLoc.prev, 1);

      gl.uniform2f(simLoc.px,     1 / SIM_W, 1 / SIM_H);
      gl.uniform1f(simLoc.bass,   bass);
      gl.uniform1f(simLoc.mid,    mid);
      gl.uniform1f(simLoc.treble, treble);
      gl.uniform1f(simLoc.vocal,  vocal);
      gl.uniform1f(simLoc.energy, energy);
      gl.uniform1f(simLoc.time,   t);

      const drop = dropQueue.shift();
      if (drop) {
        const dropR = 0.045 + drop.str * 0.130;
        gl.uniform1f(simLoc.hasDrop,   1.0);
        gl.uniform2f(simLoc.dropPos,   drop.pos[0], drop.pos[1]);
        gl.uniform1f(simLoc.dropR,     dropR);
        gl.uniform1f(simLoc.dropStr,   drop.str);
        gl.uniform3f(simLoc.dropColor, ...drop.color);
        lastDrop = now;
      } else {
        gl.uniform1f(simLoc.hasDrop, 0.0);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // ════════════════════════════════════════════════════════════════════
      // PASS 2 — Render to screen
      // ════════════════════════════════════════════════════════════════════
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(renderProg);
      bindQuad(gl, renderProg, quadBuf);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texs[writeIdx]);
      gl.uniform1i(renLoc.state,  0);
      gl.uniform2f(renLoc.px,     1 / SIM_W, 1 / SIM_H);
      gl.uniform1f(renLoc.time,   t);
      gl.uniform1f(renLoc.bass,   bass);
      gl.uniform1f(renLoc.energy, energy);
      gl.uniform1f(renLoc.vocal,  vocal);
      gl.uniform1f(renLoc.treble, treble);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Sample center pixel every 8 frames for smart lighting paint mode
      frameCount++;
      if (frameCount % 8 === 0) {
        const px = new Uint8Array(4);
        gl.readPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        if (px[0] || px[1] || px[2]) setPaintColor([px[0], px[1], px[2]]);
      }

      // Rotate ping-pong indices
      const nextWrite = prevIdx;
      prevIdx  = currIdx;
      currIdx  = writeIdx;
      writeIdx = nextWrite;
    };

    animId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animId);
      gl.deleteProgram(simProg);
      gl.deleteProgram(renderProg);
      gl.deleteTexture(texA);
      gl.deleteTexture(texB);
      gl.deleteTexture(texC);
      gl.deleteFramebuffer(fboA);
      gl.deleteFramebuffer(fboB);
      gl.deleteFramebuffer(fboC);
      gl.deleteBuffer(quadBuf);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyser, isPlaying, alwaysAnimate]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ display: 'block' }}
    />
  );
};

export default PaintPoolVisualizer;
