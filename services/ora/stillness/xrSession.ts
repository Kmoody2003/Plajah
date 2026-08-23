// Stillness in a headset.
//
// The visuals are not the reason to do this. The reason is that spatial.rs and the Spatial Mixer
// already exist, so a bowl can be placed BEHIND someone and stay behind them when they turn their
// head — and no major meditation app ships that. The picture is the part everyone notices and the
// part that matters least.
//
// COMFORT IS THE DESIGN, NOT A SETTING
//
// Vection — the sense of self-motion from a moving visual field — is uniquely bad here. Half the
// session is spent with the eyes closed, so the vestibular system gets no correction from
// anything, and there is no task to distract from it. So: a stationary reference space, no
// locomotion, no camera motion the body did not initiate, and a horizon that stays put.
//
// Everything lives beyond two metres. Twenty minutes of near-field vergence is a headache no
// matter how beautiful it is, and at that distance stereo parallax is negligible anyway — which
// is what makes the render trick below both correct and cheap.
//
// THE FIELD AND THE HEAD RUN AT DIFFERENT RATES
//
// The field moves at under 0.05 screen-widths per second by design. Head tracking has to be
// frame-tight or it is nauseating. Those are wildly different requirements, so they are
// decoupled: the shader renders into an offscreen texture at ~20 Hz, and each eye samples that
// texture at the headset's full rate with the current head pose. Latency that matters stays
// low; latency that does not is nearly free.
//
// This is also why one texture serves both eyes. A skybox at optical infinity has zero parallax,
// so rendering the field twice would cost double for a difference no one can perceive.

export interface XrComfort {
  /** Nothing nearer than this. Sustained vergence closer in is a headache. */
  minContentMetres: number;
  /** The field's own update rate. Independent of display rate. */
  fieldHz: number;
  /** Locomotion is not offered at all, at any speed. */
  allowsLocomotion: false;
  /** The reference space we ask for, in order of preference. `local-floor` keeps the horizon
   *  anchored to the room rather than to the headset. */
  referenceSpaces: XRReferenceSpaceType[];
}

/**
 * How much to pull the field down in a headset.
 *
 * The shaders were tuned on a monitor, where the field is a bright rectangle inside a room you
 * can still see. In a headset the same image IS the room — it fills the far periphery, which is
 * where the eye is most sensitive to brightness and least able to resolve what it is looking at.
 * Measured across the five fields at their working uniforms, mean luminance runs 0.08–0.38; at
 * full scale, twenty minutes of the brightest of those with the eyes half closed is glare, not
 * a field.
 *
 * This is a judgement, not a derived number. It is deliberately gentle — enough to take the
 * glare off, not enough to make the field murky, which would be its own kind of unrestful.
 */
export const HEADSET_DIM = 0.7;

export const XR_COMFORT: XrComfort = {
  minContentMetres: 2.5,
  fieldHz: 20,
  allowsLocomotion: false,
  referenceSpaces: ['local-floor', 'local', 'viewer'],
};

export type XrMode = 'immersive-vr' | 'immersive-ar';

export interface XrAvailability {
  supported: boolean;
  /** Full immersion. */
  vr: boolean;
  /** Passthrough — the session laid over the viewer's own room. */
  ar: boolean;
  reason?: string;
}

/**
 * What this device can actually do.
 *
 * Passthrough is checked separately and deliberately, because it is the better DEFAULT for a
 * first session: full immersion is a large ask for a beginner and isolating for anyone anxious,
 * and laying light and sound over someone's own room is a much smaller commitment. It also
 * sidesteps the hardest visual problem — you no longer have to render a convincing world, only
 * to modify one.
 */
export async function xrAvailability(): Promise<XrAvailability> {
  const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
  if (!xr) return { supported: false, vr: false, ar: false, reason: 'WebXR is not available in this browser' };
  try {
    const [vr, ar] = await Promise.all([
      xr.isSessionSupported('immersive-vr').catch(() => false),
      xr.isSessionSupported('immersive-ar').catch(() => false),
    ]);
    return { supported: vr || ar, vr, ar, reason: vr || ar ? undefined : 'No immersive session type is supported' };
  } catch (e) {
    return { supported: false, vr: false, ar: false, reason: String((e as Error)?.message ?? e) };
  }
}

// ── Shaders for the enveloping shell ─────────────────────────────────────────

export const QUAD_VERT = `#version 300 es
in vec2 p;
out vec2 vUv;
void main(){ vUv = p*0.5+0.5; gl_Position = vec4(p,0.0,1.0); }`;

/**
 * The eye pass.
 *
 * Rather than mapping the field onto geometry, each fragment's ray direction is reconstructed
 * from the inverse view-projection and used to look the field up. That gives a shell at optical
 * infinity for the cost of a fullscreen quad, with no mesh, no seams and no pole distortion at
 * the zenith — which a UV sphere would have, directly overhead, where a person lying down is
 * looking.
 */
export const EYE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform sampler2D uField;
uniform mat4 uInvViewProj;
uniform float uFloor;
uniform float uDim;

void main(){
  // Reconstruct the world-space ray for this pixel.
  vec4 near = uInvViewProj * vec4(vUv*2.0-1.0, -1.0, 1.0);
  vec4 far  = uInvViewProj * vec4(vUv*2.0-1.0,  1.0, 1.0);
  vec3 dir = normalize(far.xyz/far.w - near.xyz/near.w);

  // Equirectangular lookup. The field is authored as a flat image, and this is the mapping that
  // keeps its horizontal features horizontal when you turn your head.
  float u = atan(dir.z, dir.x) / 6.2831853 + 0.5;
  float v = acos(clamp(dir.y, -1.0, 1.0)) / 3.14159265;
  vec3 c = texture(uField, vec2(u, 1.0-v)).rgb;

  // Below the horizon the field darkens toward the floor rather than mirroring the sky. A
  // fully wrapped field with no ground reads as floating, and floating is not restful.
  float below = smoothstep(0.0, -0.35, dir.y);
  c = mix(c, c*0.35 + vec3(uFloor), below*0.75);

  frag = vec4(c * uDim, 1.0);
}`;

interface GlKit {
  gl: WebGL2RenderingContext;
  eyeProg: WebGLProgram;
  fieldProg: WebGLProgram;
  fieldTex: WebGLTexture;
  fieldFbo: WebGLFramebuffer;
  /** 1x1 black, bound wherever iChannel0 would otherwise point at the field itself. */
  blankTex: WebGLTexture;
  quad: WebGLBuffer;
  fieldW: number;
  fieldH: number;
  /** Uniform locations, resolved once. The eye pass runs twice per display frame — at 90 Hz
   *  that is 180 driver string lookups a second for four values that never move. */
  eyeU: {
    field: WebGLUniformLocation | null;
    invViewProj: WebGLUniformLocation | null;
    floor: WebGLUniformLocation | null;
    dim: WebGLUniformLocation | null;
  };
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s) || 'shader compile failed');
  }
  return s;
}

function link(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.bindAttribLocation(p, 0, 'p');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p) || 'program link failed');
  }
  return p;
}

/** ShaderLayer's header, so a meditation shader compiles unchanged in either host. */
const FIELD_HEADER = `#version 300 es
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
`;
const FIELD_MAIN = `
void main(){ vec4 c = vec4(0.0,0.0,0.0,1.0); mainImage(c, gl_FragCoord.xy); _frag = c; }`;

/**
 * A meditation shader wrapped for the field pass — the same wrapping ShaderLayer applies, so a
 * shader that compiles in one host compiles in the other. Exported so it can be compiled and
 * measured without a headset attached.
 */
export function fieldProgramSource(shaderSource: string): string {
  return FIELD_HEADER + shaderSource + FIELD_MAIN;
}

export interface XrRunnerOptions {
  mode: XrMode;
  /** A meditation shader's source, exactly as ShaderLayer would take it. */
  shaderSource: string;
  /** The four uniforms. Mutated in place by the caller — never replaced. */
  uniforms: number[];
  onEnd?: () => void;
  onError?: (message: string) => void;
}

/**
 * Run a Stillness session in a headset until the viewer leaves it.
 *
 * Returns a handle that can swap the shader (phases change the field) and end the session. The
 * caller keeps driving audio through the normal StillnessSession — this owns only the picture
 * and the head pose.
 */
export async function startXrSession(opts: XrRunnerOptions): Promise<{ end: () => void; setShader: (src: string) => void }> {
  const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
  if (!xr) throw new Error('WebXR is not available');

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', {
    xrCompatible: true,
    alpha: opts.mode === 'immersive-ar',
    antialias: false,
    depth: false,
  }) as WebGL2RenderingContext | null;
  if (!gl) throw new Error('WebGL2 is not available');

  const session = await xr.requestSession(opts.mode, {
    optionalFeatures: ['local-floor', 'bounded-floor'],
  });
  await (gl as unknown as { makeXRCompatible(): Promise<void> }).makeXRCompatible();
  session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });

  // Prefer a floor-relative space so the horizon stays anchored to the room. `viewer` is the
  // last resort and is the one that CAN move with the head — acceptable only because nothing
  // here is world-locked in a way that would swim.
  let refSpace: XRReferenceSpace | null = null;
  for (const type of XR_COMFORT.referenceSpaces) {
    try { refSpace = await session.requestReferenceSpace(type); break; } catch { /* try the next */ }
  }
  if (!refSpace) throw new Error('No usable reference space');

  const kit = buildKit(gl, opts.shaderSource);
  let running = true;
  let lastFieldMs = 0;
  let frameIndex = 0;
  const startMs = performance.now();

  const setShader = (src: string) => {
    try {
      const next = link(gl, QUAD_VERT, FIELD_HEADER + src + FIELD_MAIN);
      gl.deleteProgram(kit.fieldProg);
      kit.fieldProg = next;
    } catch (e) {
      opts.onError?.(String((e as Error)?.message ?? e));
    }
  };

  const onFrame = (nowMs: number, frame: XRFrame) => {
    if (!running) return;
    const s = frame.session;
    s.requestAnimationFrame(onFrame);

    const pose = frame.getViewerPose(refSpace!);
    if (!pose) return;
    const layer = s.renderState.baseLayer;
    if (!layer) return;

    // The field, at its own rate. It moves at under 0.05 screen-widths a second; redrawing it
    // ninety times a second would be pure waste.
    const fieldInterval = 1000 / XR_COMFORT.fieldHz;
    if (nowMs - lastFieldMs >= fieldInterval) {
      lastFieldMs = nowMs;
      renderField(kit, opts.uniforms, (nowMs - startMs) / 1000, frameIndex++);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
    gl.clearColor(0, 0, 0, opts.mode === 'immersive-ar' ? 0 : 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    for (const view of pose.views) {
      const vp = layer.getViewport(view);
      if (!vp) continue;
      gl.viewport(vp.x, vp.y, vp.width, vp.height);
      drawEye(kit, view);
    }
  };

  session.addEventListener('end', () => {
    running = false;
    opts.onEnd?.();
  });
  session.requestAnimationFrame(onFrame);

  return {
    end: () => { running = false; void session.end().catch(() => { /* already gone */ }); },
    setShader,
  };
}

function buildKit(gl: WebGL2RenderingContext, shaderSource: string): GlKit {
  // 1024x512 equirect. Deliberately modest: the field is low spatial frequency by design — blur
  // is the aesthetic — so a higher-resolution field would cost real milliseconds to render
  // nothing anyone can see.
  const fieldW = 1024, fieldH = 512;

  const quad = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const fieldTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, fieldTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fieldW, fieldH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  // Wrap horizontally — the field is a full turn — and clamp vertically so the zenith does not
  // fold back on itself.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fieldFbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fieldFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fieldTex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // No stillness shader samples iChannel0 today. But the eye pass leaves the field texture bound
  // to unit 0, and an unset sampler defaults to unit 0 — so the first shader that DID sample it
  // would be reading the framebuffer it is writing, which is undefined and looks like a fault in
  // the driver rather than a fault here.
  const blankTex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, blankTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  const eyeProg = link(gl, QUAD_VERT, EYE_FRAG);
  return {
    gl,
    eyeProg,
    fieldProg: link(gl, QUAD_VERT, FIELD_HEADER + shaderSource + FIELD_MAIN),
    fieldTex, fieldFbo, blankTex, quad, fieldW, fieldH,
    eyeU: {
      field: gl.getUniformLocation(eyeProg, 'uField'),
      invViewProj: gl.getUniformLocation(eyeProg, 'uInvViewProj'),
        floor: gl.getUniformLocation(eyeProg, 'uFloor'),
      dim: gl.getUniformLocation(eyeProg, 'uDim'),
    },
  };
}

function renderField(kit: GlKit, uniforms: number[], timeSec: number, frame: number): void {
  const { gl } = kit;
  gl.bindFramebuffer(gl.FRAMEBUFFER, kit.fieldFbo);
  gl.viewport(0, 0, kit.fieldW, kit.fieldH);
  gl.useProgram(kit.fieldProg);
  gl.bindBuffer(gl.ARRAY_BUFFER, kit.quad);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const u = (n: string) => gl.getUniformLocation(kit.fieldProg, n);
  gl.uniform3f(u('iResolution'), kit.fieldW, kit.fieldH, 1);
  gl.uniform1f(u('iTime'), timeSec);
  gl.uniform1f(u('iTimeDelta'), 1 / XR_COMFORT.fieldHz);
  gl.uniform1i(u('iFrame'), frame);
  gl.uniform4f(u('iMouse'), 0, 0, 0, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, kit.blankTex);
  gl.uniform1i(u('iChannel0'), 1);
  // Audio uniforms stay at zero. Nothing here analyses the signal — both engines read the
  // emotional state, which is what keeps them in step.
  gl.uniform1f(u('iBass'), 0); gl.uniform1f(u('iMid'), 0);
  gl.uniform1f(u('iTreble'), 0); gl.uniform1f(u('iLevel'), 0);
  gl.uniform1f(u('iParam0'), uniforms[0] ?? 0.5);
  gl.uniform1f(u('iParam1'), uniforms[1] ?? 0);
  gl.uniform1f(u('iParam2'), uniforms[2] ?? 1);
  gl.uniform1f(u('iParam3'), uniforms[3] ?? 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function drawEye(kit: GlKit, view: XRView): void {
  const { gl } = kit;
  gl.useProgram(kit.eyeProg);
  gl.bindBuffer(gl.ARRAY_BUFFER, kit.quad);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, kit.fieldTex);
  gl.uniform1i(kit.eyeU.field, 0);
  gl.uniformMatrix4fv(kit.eyeU.invViewProj, false,
    invViewProj(view.projectionMatrix, view.transform.inverse.matrix));
  gl.uniform1f(kit.eyeU.floor, 0.02);
  gl.uniform1f(kit.eyeU.dim, HEADSET_DIM);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// ── Matrix helpers ───────────────────────────────────────────────────────────
// Small and local rather than pulling in a maths library for two operations.

export function multiply(a: Float32Array | number[], b: Float32Array | number[]): Float32Array {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += (a[k * 4 + r] as number) * (b[c * 4 + k] as number);
      o[c * 4 + r] = sum;
    }
  }
  return o;
}

export function invert(m: Float32Array | number[]): Float32Array {
  const o = new Float32Array(16);
  const a00 = m[0] as number, a01 = m[1] as number, a02 = m[2] as number, a03 = m[3] as number;
  const a10 = m[4] as number, a11 = m[5] as number, a12 = m[6] as number, a13 = m[7] as number;
  const a20 = m[8] as number, a21 = m[9] as number, a22 = m[10] as number, a23 = m[11] as number;
  const a30 = m[12] as number, a31 = m[13] as number, a32 = m[14] as number, a33 = m[15] as number;

  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return o;
  det = 1.0 / det;

  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return o;
}

/** Inverse of projection × view — what turns a screen pixel back into a world ray. */
export function invViewProj(projection: Float32Array, viewInverse: Float32Array): Float32Array {
  return invert(multiply(projection, invert(viewInverse)));
}

/**
 * How far a sound sits, in metres.
 *
 * Deliberately NOT the visual comfort minimum. That 2.5 m exists because sustained near-field
 * vergence gives you a headache, and vergence is a property of eyes — it says nothing about
 * ears. Pushing the sound out to match the picture would only make it quieter and vaguer for
 * no gain. Just past arm's reach is close enough to feel present and far enough not to feel
 * like someone leaning in.
 */
export const AUDIO_DISTANCE_M = 1.6;

/**
 * Gain to restore the mix after the move.
 *
 * The ensemble's levels were balanced against the screen placement of one metre. The spatial
 * stage attenuates as 1/(1 + 0.6·(d−1)), so moving out to AUDIO_DISTANCE_M costs about 2.7 dB —
 * a real drop, and one nobody asked for. This puts it back, so the headset hears the same mix
 * from a different direction rather than a quieter one.
 */
export const HEADSET_GAIN = 1 + 0.6 * Math.max(0, AUDIO_DISTANCE_M - 1);

/**
 * Where a sound should sit in the room.
 *
 * Bowls go BEHIND and slightly above, never in front. Sound arriving from in front is something
 * addressing you, and a session is not addressing you — it is a space you are inside. Depth
 * raises the source rather than pushing it away: as the arc goes deeper the ensemble drifts
 * overhead, which is the one direction that has no "towards" in it.
 */
export function spatialPlacement(pan: number, depth: number): [number, number, number] {
  // spatial.rs' convention, exactly: azimuth 0 is front, positive is right, and the polar form
  // is x = d·sin(az), z = −d·cos(az). Half a turn puts the source behind; pan then swings it
  // around that point, and it must swing the RIGHT way — writing this as π + pan quietly
  // mirrors left and right, because sin(π + a) = −sin(a).
  const azimuth = Math.PI - pan * 0.9;
  const d = AUDIO_DISTANCE_M;
  return [
    Math.sin(azimuth) * d,
    0.4 + depth * 0.9,
    -Math.cos(azimuth) * d,
  ];
}
