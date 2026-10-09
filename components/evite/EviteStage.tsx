/**
 * EviteStage — turns a generated plate + its depth map into a living card (WebGL2, no three.js, ~1 draw call + points).
 *
 *   • 2.5D depth parallax on tilt (gyro on phones, pointer on desktop), driven by the recipe's spring
 *   • pop-up-book reveal on EVERY open: far plane grows in, near plane settles back, plate exposes, text resolves
 *   • effects keyed to the plate's own light: foil (one colour per theme), light sweep, warm flicker, caustics, fog, twinkle
 *   • depth-aware particles (snow, petals, bubbles, embers, confetti…) that hide behind nearer objects
 *   • tap → burst at the finger + a light ring; celebrate() → the RSVP "yes" moment
 *   • prefers-reduced-motion → opacity-only twin with the same timing; no WebGL → a plain <img> that still fades in
 *
 * Text is NOT drawn here: children are live DOM on top (crisp, accessible, translatable). The stage drives them through
 * CSS variables --rv-head / --rv-details / --rv-cta (0..1) so text and plate share one clock.
 *
 * Settling (Art Council): the drama is the reveal. Afterwards an activity envelope (settleEnvelope) eases every loop to
 * still over ~1.5 s — sweep, flicker and twinkle fade out, breath and ambient particles fade away, and the effect clock
 * that drives foil shimmer, caustics, fog drift and grain slows to a stop (they freeze, so the plate's look never pops).
 * Tilt, pointer movement and taps bring the loops back; once everything is still the stage stops requesting frames
 * (host gets data-idle="1") and wakes on input, resize, visibility or replay. snapshot(tMs, tilt) ignores input, so a
 * poster at a given time is deterministic.
 */
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { recipeFor, reducedRecipe, revealCurves, settleEnvelope, springStep, SETTLE_MS, type EmitterKind, type MotionRecipe } from '../../services/evite/motionRecipes';

/** snapshot: render one frame at reveal time tMs with a given tilt and return it as a JPEG data URL (posters, link previews, print, tests). */
export interface EviteStageHandle { replay(): void; celebrate(): void; snapshot(tMs?: number, tiltX?: number, tiltY?: number): string | null }
export interface EviteStageProps {
  plateUrl: string;
  depthUrl?: string;
  /** either pass a recipe or a collection/subject pair */
  recipe?: MotionRecipe;
  collection?: string;
  subject?: string;
  reducedMotion?: boolean;
  /** 2:3 portrait by default */
  aspect?: number;
  className?: string;
  style?: React.CSSProperties;
  onTap?: (x: number, y: number) => void;
  children?: React.ReactNode;
  /** accessible description of the art */
  label?: string;
}

const KIND_ID: Record<EmitterKind, number> = { confetti: 0, snow: 1, petals: 2, bubbles: 3, embers: 4, sparkles: 5, dust: 6, stars: 7, leaves: 8, fireflies: 9, hearts: 10 };
const LAYER_DEPTH = { front: 2, mid: 0.5, back: 0.22 } as const;
const MAX_P = 64;

const VS = `#version 300 es
in vec2 a_pos; out vec2 v_uv;
void main(){ v_uv = a_pos * 0.5 + 0.5; v_uv.y = 1.0 - v_uv.y; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform sampler2D u_plate, u_depth; uniform bool u_hasDepth;
uniform vec2 u_res; uniform float u_imgAspect;
uniform vec2 u_tilt; uniform float u_par, u_pop, u_settle, u_exposure, u_breathe, u_time;
uniform vec3 u_sweep; uniform vec3 u_foilColor; uniform float u_foil, u_flicker, u_caustics, u_fog, u_twinkle, u_warmth, u_contrast;
uniform vec3 u_tap;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*noise(p); p*=2.03; a*=0.5; } return s; }
vec2 cover(vec2 uv){ float ca = u_res.x / u_res.y; vec2 s = ca > u_imgAspect ? vec2(1.0, u_imgAspect / ca) : vec2(ca / u_imgAspect, 1.0); return (uv - 0.5) * s + 0.5; }
float depthAt(vec2 uv){ return u_hasDepth ? texture(u_depth, uv).r : 0.5; }
vec2 warp(vec2 uv, float d){
  float pop = u_pop * (1.0 - u_settle);
  float s = (1.0 + u_breathe) * mix(1.0 - pop, 1.0 + pop, d);
  float over = 1.0 + u_par * 1.4 + u_pop;              // overscan so parallax never shows an edge
  vec2 c = (uv - 0.5) / (s * over);
  return 0.5 + c - u_tilt * u_par * (d - 0.35);
}
void main(){
  vec2 base = cover(v_uv);
  float d = depthAt(base);
  vec2 uv = warp(base, d); d = depthAt(uv); uv = warp(base, d); d = depthAt(uv); uv = warp(base, d);
  vec3 c = texture(u_plate, uv).rgb;
  float L = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // grade
  c.r *= 1.0 + 0.06 * u_warmth; c.b *= 1.0 - 0.06 * u_warmth;
  c = (c - 0.5) * u_contrast + 0.5;
  // light sweep across bright areas
  float ang = radians(u_sweep.z); vec2 dir = vec2(cos(ang), sin(ang));
  float pos = dot(v_uv - 0.5, dir) * 1.4 - (fract(u_time / max(0.1, u_sweep.y)) * 3.0 - 1.5);
  float band = exp(-pos * pos * 30.0);
  c += band * u_sweep.x * smoothstep(0.35, 0.9, L) * 0.45;
  // foil: bright areas pick up the theme colour and shimmer with tilt
  float sh = 0.5 + 0.5 * sin((v_uv.x * 1.3 + v_uv.y) * 22.0 + u_tilt.x * 5.0 - u_tilt.y * 3.0 + u_time * 0.7);
  float fm = smoothstep(0.62, 0.96, L) * u_foil;
  c = mix(c, c * (0.55 + u_foilColor * 0.9) + u_foilColor * 0.18 * sh, fm * (0.35 + 0.45 * sh));
  // warm flicker (candles, fire, lanterns)
  float warm = clamp((c.r - c.b) * 1.6, 0.0, 1.0) * smoothstep(0.45, 0.95, L);
  float n = noise(vec2(u_time * 7.0, 1.3)) + 0.5 * noise(vec2(u_time * 17.0, 4.1));
  c *= 1.0 + u_flicker * warm * (n - 0.75) * 0.45;
  // caustics in blue/cyan water
  float blue = clamp((c.b - c.r) * 2.0, 0.0, 1.0);
  vec2 q = uv * vec2(18.0, 26.0) + vec2(u_time * 0.35, u_time * 0.2);
  float ca = pow(abs(sin(q.x + sin(q.y * 0.8 + u_time) * 1.3) * sin(q.y + sin(q.x * 0.7 - u_time) * 1.1)), 6.0);
  c += u_caustics * blue * ca * 0.35;
  // fog drifting through the far depth
  float far = 1.0 - d;
  float fg = fbm(uv * 3.0 + vec2(u_time * 0.025, u_time * 0.01));
  c = mix(c, vec3(0.75 + 0.25 * L), u_fog * far * smoothstep(0.35, 0.8, fg) * 0.45);
  // twinkle on small bright points
  vec2 cell = floor(uv * u_res / 5.0);
  float tw = step(0.9, L) * step(0.82, hash(cell)) * (0.5 + 0.5 * sin(u_time * (3.0 + 5.0 * hash(cell + 7.0)) + hash(cell) * 6.28));
  c += u_twinkle * tw * 0.55;
  // tap ring
  float td = distance(v_uv * vec2(1.0, u_res.y / u_res.x), u_tap.xy * vec2(1.0, u_res.y / u_res.x));
  float ring = exp(-pow((td - u_tap.z * 0.9) * 18.0, 2.0)) * (1.0 - u_tap.z) * step(0.0, u_tap.z) * step(u_tap.z, 1.0);
  c += ring * 0.22;
  // exposure, vignette, grain
  float vig = smoothstep(1.15, 0.35, length((v_uv - 0.5) * vec2(1.0, 1.2)));
  c *= mix(0.82, 1.0, vig) * u_exposure;
  c += (hash(v_uv * u_res + u_time) - 0.5) * 0.025;
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

const PVS = `#version 300 es
precision highp float;
in vec2 a_p; in float a_size, a_rot, a_alpha, a_kind, a_layer; in vec3 a_col;
uniform vec2 u_res; uniform float u_dpr;
out float v_rot, v_alpha, v_kind, v_layer; out vec3 v_col; out vec2 v_scr;
void main(){ vec2 clip = (a_p / u_res) * 2.0 - 1.0; clip.y = -clip.y; gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = a_size * u_dpr; v_rot = a_rot; v_alpha = a_alpha; v_kind = a_kind; v_layer = a_layer; v_col = a_col; v_scr = a_p / u_res; }`;

const PFS = `#version 300 es
precision highp float;
in float v_rot, v_alpha, v_kind, v_layer; in vec3 v_col; in vec2 v_scr; out vec4 o;
uniform sampler2D u_depth; uniform bool u_hasDepth; uniform vec2 u_res; uniform float u_imgAspect;
vec2 cover(vec2 uv){ float ca = u_res.x / u_res.y; vec2 s = ca > u_imgAspect ? vec2(1.0, u_imgAspect / ca) : vec2(ca / u_imgAspect, 1.0); return (uv - 0.5) * s + 0.5; }
void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0; float cs = cos(v_rot), sn = sin(v_rot); p = vec2(cs * p.x - sn * p.y, sn * p.x + cs * p.y);
  int k = int(v_kind + 0.5); float a = 0.0; float r = length(p);
  if (k == 0) a = step(abs(p.x), 0.9) * step(abs(p.y), 0.45);                                   // confetti
  else if (k == 1) a = smoothstep(1.0, 0.2, r);                                                  // snow
  else if (k == 2 || k == 8) a = smoothstep(1.0, 0.85, length(p * vec2(1.0, 2.1)));              // petals / leaves
  else if (k == 3) a = smoothstep(1.0, 0.85, r) - smoothstep(0.82, 0.62, r) * 0.75 + smoothstep(0.35, 0.0, length(p + vec2(0.35, 0.35))) * 0.6;   // bubbles
  else if (k == 4 || k == 9) a = pow(smoothstep(1.0, 0.0, r), 2.2);                              // embers / fireflies glow
  else if (k == 5 || k == 7) a = smoothstep(0.22, 0.0, abs(p.x) * abs(p.y) * 4.0 + r * 0.25) + pow(smoothstep(1.0, 0.0, r), 6.0);   // sparkle star
  else if (k == 6) a = smoothstep(1.0, 0.0, r) * 0.6;                                            // dust
  else if (k == 10) { vec2 h = vec2(p.x, -p.y * 1.1 + 0.25); float q = h.x * h.x + pow(h.y - sqrt(abs(h.x)) * 0.7, 2.0); a = smoothstep(0.75, 0.6, q); }   // heart
  if (v_layer < 1.5 && u_hasDepth) { float pd = texture(u_depth, cover(v_scr)).r; a *= mix(1.0, 0.12, smoothstep(v_layer - 0.02, v_layer + 0.12, pd)); }
  o = vec4(v_col * (k == 4 || k == 9 ? 1.4 : 1.0), a * v_alpha);
  if (o.a < 0.01) discard;
}`;

interface P { x: number; y: number; vx: number; vy: number; size: number; rot: number; vr: number; life: number; max: number; kind: number; layer: number; col: [number, number, number]; burst: boolean }
const hex = (h: string): [number, number, number] => { const m = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(m.slice(i, i + 2), 16) / 255) as [number, number, number]; };

function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const mk = (t: number, s: string) => { const sh = gl.createShader(t)!; gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader'); return sh; };
  const p = gl.createProgram()!; gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
  return p;
}
const loadImage = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => rej(new Error('image ' + src)); i.src = src; });

const EviteStage = forwardRef<EviteStageHandle, EviteStageProps>(function EviteStage(props, ref) {
  const { plateUrl, depthUrl, collection = 'general', subject = 'balloons', aspect = 2 / 3, className, style, onTap, children, label } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const api = useRef<{ replay(): void; celebrate(): void; tap(x: number, y: number): void; snapshot(t?: number, x?: number, y?: number): string | null }>({ replay() {}, celebrate() {}, tap() {}, snapshot: () => null });
  const [fallback, setFallback] = useState(false);
  const [prefersReduced, setPrefersReduced] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const reduced = props.reducedMotion ?? prefersReduced;
  const recipeKey = JSON.stringify(props.recipe || [collection, subject]);

  useImperativeHandle(ref, () => ({ replay: () => api.current.replay(), celebrate: () => api.current.celebrate(), snapshot: (t, x, y) => api.current.snapshot(t, x, y) }), []);

  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)'); const on = () => setPrefersReduced(mq.matches);
    mq.addEventListener?.('change', on); return () => mq.removeEventListener?.('change', on);
  }, []);

  useEffect(() => {
    const cvEl = canvas.current, hostEl = wrap.current; if (!cvEl || !hostEl) return;
    const host: HTMLDivElement = hostEl, cv: HTMLCanvasElement = cvEl;
    const full = props.recipe || recipeFor(collection, subject);
    const R = reduced ? reducedRecipe(full) : full;
    const ctx = cv.getContext('webgl2', { premultipliedAlpha: false, antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!ctx) { setFallback(true); return; }
    const gl: WebGL2RenderingContext = ctx;
    let disposed = false, raf = 0, visible = true;
    let prog: WebGLProgram, pprog: WebGLProgram;
    try { prog = compile(gl, VS, FS); pprog = compile(gl, PVS, PFS); } catch (e) { console.warn('[EviteStage] shader', e); setFallback(true); return; }

    const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao); const aPos = gl.getAttribLocation(prog, 'a_pos'); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const U = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
    const tex = (img: HTMLImageElement | null, unit: number) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); if (img) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255])); return t; };

    // particle buffers: x,y,size,rot,alpha,kind,layer,r,g,b
    const STRIDE = 10, pdata = new Float32Array(MAX_P * STRIDE);
    const pbuf = gl.createBuffer(); const pvao = gl.createVertexArray(); gl.bindVertexArray(pvao); gl.bindBuffer(gl.ARRAY_BUFFER, pbuf); gl.bufferData(gl.ARRAY_BUFFER, pdata.byteLength, gl.DYNAMIC_DRAW);
    const attr = (n: string, size: number, off: number) => { const l = gl.getAttribLocation(pprog, n); if (l < 0) return; gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, STRIDE * 4, off * 4); };
    attr('a_p', 2, 0); attr('a_size', 1, 2); attr('a_rot', 1, 3); attr('a_alpha', 1, 4); attr('a_kind', 1, 5); attr('a_layer', 1, 6); attr('a_col', 3, 7);
    gl.bindVertexArray(null);

    let plateTex: WebGLTexture | null = null, depthTex: WebGLTexture | null = null, imgAspect = 2 / 3, hasDepth = false;
    let W = 0, H = 0, dpr = 1;
    // ── state ──
    const parUV = R.parallax / 390;            // recipe px at 390px width → uv
    let t0 = performance.now(), last = t0;
    let tiltX = 0, tiltY = 0, tvx = 0, tvy = 0, targetX = 0, targetY = 0;
    let tap = { x: 0.5, y: 0.5, age: 2 };
    // activity envelope + the effect clock it drives (loops slow to a stop instead of popping off)
    let env = 1, tEff = 0, lastInput = -Infinity, actX = 0, actY = 0;
    const idleFloor = R.idle ?? 0;
    /** (Re)start the frame loop; `input` marks real guest activity, which brings the loops back. */
    const wake = (input = false) => {
      if (input) lastInput = performance.now();
      if (disposed || raf || !plateTex || !visible || document.hidden) return;
      last = performance.now(); host.dataset.idle = '0'; raf = requestAnimationFrame(frame);
    };

    const resize = () => { const r = host.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1); W = Math.max(1, r.width); H = Math.max(1, r.height); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); gl.viewport(0, 0, cv.width, cv.height); wake(); };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(host);
    const parts: P[] = [];
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const spawn = (burst: boolean, kind: EmitterKind, colors: string[], layer: 'front' | 'mid' | 'back', x?: number, y?: number) => {
      if (parts.length >= MAX_P) return;
      const em = R.emitter; const fall = em?.fall ?? 0;
      const p: P = burst
        ? { x: x!, y: y!, vx: rnd(-1, 1) * 260, vy: rnd(-1.1, 0.3) * 300, size: rnd(7, 13), rot: rnd(0, 6.28), vr: rnd(-6, 6), life: 0, max: 0.75, kind: KIND_ID[kind], layer: LAYER_DEPTH.front, col: hex(colors[Math.floor(Math.random() * colors.length)]), burst: true }
        : { x: rnd(0, W), y: fall >= 0 ? rnd(-H * 0.2, H) : rnd(0, H * 1.1), vx: rnd(-8, 8), vy: fall + rnd(-4, 4), size: kind === 'dust' ? rnd(2, 4) : kind === 'snow' ? rnd(4, 8) : rnd(6, 11), rot: rnd(0, 6.28), vr: rnd(-1.2, 1.2), life: 0, max: rnd(5, 11), kind: KIND_ID[kind], layer: LAYER_DEPTH[layer], col: hex(colors[Math.floor(Math.random() * colors.length)]), burst: false };
      parts.push(p);
    };
    const ambient = () => parts.filter(p => !p.burst).length;
    const burst = (x: number, y: number, n: number) => { for (let i = 0; i < n; i++) spawn(true, R.burst, R.burstColors, 'front', x, y); };

    api.current.replay = () => { t0 = performance.now(); wake(); };
    api.current.celebrate = () => { if (reduced) return; for (let i = 0; i < 3; i++) burst(W * (0.25 + 0.25 * i), H * 0.55, 8); tap = { x: 0.5, y: 0.55, age: 0 }; wake(!reduced); };
    api.current.tap = (x, y) => { if (!reduced) burst(x, y, 10); tap = { x: x / W, y: y / H, age: 0 }; wake(!reduced); };

    // ── input: pointer on desktop, gyro on phones (iOS asks on first tap) ──
    // A tilt counts as activity only past a small dead-band, so a phone resting in a hand (sensor jitter) lets the card sleep.
    const tilted = () => { if (Math.abs(targetX - actX) + Math.abs(targetY - actY) < 0.03) return; actX = targetX; actY = targetY; if (!reduced) wake(true); };
    const onMove = (e: PointerEvent) => { if (e.pointerType === 'touch') return; const r = host.getBoundingClientRect(); targetX = ((e.clientX - r.left) / r.width - 0.5) * 2; targetY = ((e.clientY - r.top) / r.height - 0.5) * 2; tilted(); };
    const onLeave = () => { targetX = 0; targetY = 0; tilted(); };
    let gyroOn = false;
    const onOrient = (e: DeviceOrientationEvent) => { if (e.gamma == null || e.beta == null) return; gyroOn = true; targetX = Math.max(-1, Math.min(1, e.gamma / 25)); targetY = Math.max(-1, Math.min(1, (e.beta - 45) / 25)); tilted(); };
    const askGyro = async () => { const D: any = (window as any).DeviceOrientationEvent; if (gyroOn || !D) return; try { if (typeof D.requestPermission === 'function') { if ((await D.requestPermission()) !== 'granted') return; } window.addEventListener('deviceorientation', onOrient); } catch { /* user said no: pointer only */ } };
    const onDown = (e: PointerEvent) => { const r = host.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; api.current.tap(x, y); onTap?.(x, y); askGyro(); };
    host.addEventListener('pointermove', onMove); host.addEventListener('pointerleave', onLeave); host.addEventListener('pointerdown', onDown);
    if (!(typeof (window as any).DeviceOrientationEvent?.requestPermission === 'function')) window.addEventListener('deviceorientation', onOrient);

    const io = new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting); wake(); }, { threshold: 0.01 });
    io.observe(host);
    const onVis = () => wake();
    document.addEventListener('visibilitychange', onVis);
    const onLost = (e: Event) => { e.preventDefault(); setFallback(true); };
    cv.addEventListener('webglcontextlost', onLost);

    const uni = {
      plate: U(prog, 'u_plate'), depth: U(prog, 'u_depth'), hasDepth: U(prog, 'u_hasDepth'), res: U(prog, 'u_res'), imgAspect: U(prog, 'u_imgAspect'), tilt: U(prog, 'u_tilt'),
      par: U(prog, 'u_par'), pop: U(prog, 'u_pop'), settle: U(prog, 'u_settle'), exposure: U(prog, 'u_exposure'), breathe: U(prog, 'u_breathe'), time: U(prog, 'u_time'),
      sweep: U(prog, 'u_sweep'), foilColor: U(prog, 'u_foilColor'), foil: U(prog, 'u_foil'), flicker: U(prog, 'u_flicker'), caustics: U(prog, 'u_caustics'), fog: U(prog, 'u_fog'),
      twinkle: U(prog, 'u_twinkle'), warmth: U(prog, 'u_warmth'), contrast: U(prog, 'u_contrast'), tap: U(prog, 'u_tap'),
    };
    const puni = { res: U(pprog, 'u_res'), dpr: U(pprog, 'u_dpr'), depth: U(pprog, 'u_depth'), hasDepth: U(pprog, 'u_hasDepth'), imgAspect: U(pprog, 'u_imgAspect') };
    const foilRGB = hex(R.foil.color);

    function frame(now: number, forced?: { t: number; tx: number; ty: number }) {
      if (!forced) raf = 0;
      if (disposed || !plateTex) return;
      if (!forced && (!visible || document.hidden)) return;
      const dt = forced ? 1 / 60 : Math.min(0.05, (now - last) / 1000); if (!forced) last = now;
      const tMs = forced ? forced.t : now - t0;
      if (forced) { tiltX = forced.tx; tiltY = forced.ty; tvx = 0; tvy = 0; targetX = forced.tx; targetY = forced.ty; }
      const rv = revealCurves(tMs, R.revealMs);
      // activity: full through the reveal and while the guest moves, then a smooth release to still. Rising is eased too
      // (~0.2 s) so a first touch never pops the loops on. Snapshots ignore input: same tMs → same frame.
      const goal = settleEnvelope(tMs, R.revealMs, forced ? Infinity : now - lastInput, idleFloor);
      if (!forced) env = goal >= env ? env + (goal - env) * (1 - Math.exp(-dt / 0.2)) : goal;
      const act = forced ? goal : env;
      // the effect clock runs at the envelope's rate, so shimmer, caustics, fog and grain slow to a stop rather than vanish
      if (!forced) tEff += dt * act;
      const t = forced ? forced.t / 1000 : tEff;
      [tiltX, tvx] = springStep(tiltX, tvx, reduced ? 0 : targetX, dt, R.spring);
      [tiltY, tvy] = springStep(tiltY, tvy, reduced ? 0 : targetY, dt, R.spring);
      host.style.setProperty('--rv-head', rv.headline.toFixed(3)); host.style.setProperty('--rv-details', rv.details.toFixed(3)); host.style.setProperty('--rv-cta', rv.cta.toFixed(3));
      tap.age = Math.min(2, tap.age + dt / 0.6);

      gl.useProgram(prog); gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, plateTex); gl.uniform1i(uni.plate, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, depthTex); gl.uniform1i(uni.depth, 1); gl.uniform1i(uni.hasDepth, hasDepth ? 1 : 0);
      gl.uniform2f(uni.res, cv.width, cv.height); gl.uniform1f(uni.imgAspect, imgAspect);
      gl.uniform2f(uni.tilt, tiltX, tiltY); gl.uniform1f(uni.par, parUV); gl.uniform1f(uni.pop, R.popIn); gl.uniform1f(uni.settle, rv.settle);
      gl.uniform1f(uni.exposure, rv.exposure); gl.uniform1f(uni.breathe, act * R.breathe * Math.sin((t * 2 * Math.PI) / R.breathePeriod)); gl.uniform1f(uni.time, t);
      // loops that would look like artefacts if frozen (a parked sweep band, a dimmed flicker, stuck sparkles) fade out
      gl.uniform3f(uni.sweep, act * R.sweep.strength, R.sweep.period, R.sweep.angle); gl.uniform3f(uni.foilColor, foilRGB[0], foilRGB[1], foilRGB[2]); gl.uniform1f(uni.foil, R.foil.strength);
      gl.uniform1f(uni.flicker, act * R.flicker); gl.uniform1f(uni.caustics, R.caustics); gl.uniform1f(uni.fog, R.fog); gl.uniform1f(uni.twinkle, act * R.twinkle);
      gl.uniform1f(uni.warmth, R.warmth); gl.uniform1f(uni.contrast, R.contrast); gl.uniform3f(uni.tap, tap.x, tap.y, tap.age);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // particles
      // ambient particles live only while the card is active; they fade with the envelope (bursts are always the guest's)
      if (R.emitter && rv.exposure > 0.6 && act > 0.5) while (ambient() < R.emitter.count) spawn(false, R.emitter.kind, R.emitter.colors, R.emitter.layer);
      let n = 0;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.life += dt;
        if (p.burst) { p.vy += 520 * dt; p.vx *= 0.985; } else { p.vx += Math.sin(t * 0.7 + i) * 6 * dt; }
        p.x += p.vx * dt + tiltX * (p.layer > 1 ? 18 : 6) * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        const out = p.y > H + 30 || p.y < -60 || p.x < -40 || p.x > W + 40;
        if (p.life > p.max || out || (!p.burst && act < 0.01)) { parts.splice(i, 1); continue; }
        const fade = p.burst ? 1 - p.life / p.max : Math.min(1, p.life / 0.8) * Math.min(1, (p.max - p.life) / 0.8) * act;
        const o = n * STRIDE; pdata.set([p.x * dpr, p.y * dpr, p.size, p.rot, fade * (p.kind === 6 ? 0.55 : 0.9), p.kind, p.layer, p.col[0], p.col[1], p.col[2]], o); n++;
        if (n >= MAX_P) break;
      }
      if (n) {
        gl.useProgram(pprog); gl.bindVertexArray(pvao); gl.bindBuffer(gl.ARRAY_BUFFER, pbuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, pdata.subarray(0, n * STRIDE));
        gl.uniform2f(puni.res, cv.width, cv.height); gl.uniform1f(puni.dpr, dpr); gl.uniform1f(puni.imgAspect, imgAspect);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, depthTex); gl.uniform1i(puni.depth, 1); gl.uniform1i(puni.hasDepth, hasDepth ? 1 : 0);
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.drawArrays(gl.POINTS, 0, n); gl.disable(gl.BLEND);
      }
      if (forced) return;
      // everything still (reveal over, loops released, tilt at rest, no ring, no particles): stop drawing until woken
      const tx = reduced ? 0 : targetX, ty = reduced ? 0 : targetY;
      const still = act <= 0.001 && goal <= 0.001 && rv.done && tap.age >= 1 && parts.length === 0
        && Math.abs(tiltX - tx) < 1e-3 && Math.abs(tiltY - ty) < 1e-3 && Math.abs(tvx) < 1e-3 && Math.abs(tvy) < 1e-3;
      if (still) host.dataset.idle = '1'; else raf = requestAnimationFrame(frame);
    }
    api.current.snapshot = (t = R.revealMs + SETTLE_MS, x = 0, y = 0) => {
      if (!plateTex) return null;
      // a poster frame must not disturb the live card: keep its tilt, then let it redraw itself
      const keep = [tiltX, tiltY, tvx, tvy, targetX, targetY] as const;
      frame(performance.now(), { t, tx: x, ty: y });
      let url: string | null = null; try { url = cv.toDataURL('image/jpeg', 0.9); } catch { url = null; }
      [tiltX, tiltY, tvx, tvy, targetX, targetY] = keep; wake();
      return url;
    };

    (async () => {
      try {
        const [plate, depth] = await Promise.all([loadImage(plateUrl), depthUrl ? loadImage(depthUrl).catch(() => null) : Promise.resolve(null)]);
        if (disposed) return;
        imgAspect = plate.naturalWidth / plate.naturalHeight;
        plateTex = tex(plate, 0); depthTex = tex(depth, 1); hasDepth = !!depth;
        t0 = performance.now(); last = t0; env = 1; tEff = 0;
        wake();
      } catch (e) { console.warn('[EviteStage]', e); setFallback(true); }
    })();

    return () => {
      disposed = true; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      host.removeEventListener('pointermove', onMove); host.removeEventListener('pointerleave', onLeave); host.removeEventListener('pointerdown', onDown);
      window.removeEventListener('deviceorientation', onOrient); document.removeEventListener('visibilitychange', onVis); cv.removeEventListener('webglcontextlost', onLost);
      gl.deleteProgram(prog); gl.deleteProgram(pprog); if (plateTex) gl.deleteTexture(plateTex); if (depthTex) gl.deleteTexture(depthTex);
    };
  }, [plateUrl, depthUrl, recipeKey, reduced]);   // eslint-disable-line react-hooks/exhaustive-deps

  // No WebGL: the plate still fades in and the text still resolves, on CSS alone.
  useEffect(() => {
    if (!fallback || !wrap.current) return;
    const host = wrap.current; const ms = (props.recipe || recipeFor(collection, subject)).revealMs;
    let raf = 0; const t0 = performance.now();
    const step = (now: number) => { const rv = revealCurves(now - t0, ms); host.style.setProperty('--rv-head', String(rv.headline)); host.style.setProperty('--rv-details', String(rv.details)); host.style.setProperty('--rv-cta', String(rv.cta)); if (!rv.done) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [fallback]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={wrap} className={className}
      style={{ position: 'relative', width: '100%', aspectRatio: String(aspect), overflow: 'hidden', borderRadius: 24, background: '#0b0713', touchAction: 'manipulation', ['--rv-head' as any]: reduced ? 1 : 0, ['--rv-details' as any]: reduced ? 1 : 0, ['--rv-cta' as any]: reduced ? 1 : 0, ...style }}>
      {fallback
        ? <img src={plateUrl} alt={label || ''} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', animation: reduced ? undefined : 'eviteFade 900ms ease-out both' }} />
        : <canvas ref={canvas} role="img" aria-label={label} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{children}</div>
      <style>{'@keyframes eviteFade{from{opacity:0}to{opacity:1}}'}</style>
    </div>
  );
});

export default EviteStage;
