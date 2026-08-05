// glUtil — minimal WebGL2 helpers for the Pixels Core compositor.
//
// Deliberately tiny and dependency-free: context creation tuned for the discrete
// GPU, shader/program compilation, a shared fullscreen-quad VBO, and FBO+texture
// allocation for the ping-pong composite. Everything the single-surface engine
// needs, nothing it doesn't.

export type GL = WebGL2RenderingContext;

export interface RenderTarget {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
  width: number;
  height: number;
}

/** Create a WebGL2 context on the discrete GPU. Returns null if unavailable. */
export function createGL(canvas: HTMLCanvasElement | OffscreenCanvas): GL | null {
  const attrs: WebGLContextAttributes = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    // Preserve the drawing buffer so canvas.captureStream() records real frames
    // (not black). Minor cost on the discrete GPU; needed for the hardware recorder.
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
    // NOT desynchronized: on Optimus laptops a low-latency/desynchronized surface
    // presents through the DISPLAY's GPU (the Intel iGPU), dragging the whole page
    // off the discrete NVIDIA GPU. Keep the normal present path so high-performance
    // actually resolves to the RTX.
    desynchronized: false,
  };
  const gl = canvas.getContext('webgl2', attrs) as GL | null;
  return gl ?? null;
}

export function compileShader(gl: GL, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`[PixelsCore] shader compile failed: ${log}\n${numberLines(src)}`);
  }
  return sh;
}

export function createProgram(gl: GL, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`[PixelsCore] program link failed: ${log}`);
  }
  return prog;
}

/** A single fullscreen triangle (covers clip space with one tri — no quad seam). */
export function createFullscreenQuad(gl: GL): WebGLVertexArrayObject {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  // clip-space positions for a big triangle
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return vao;
}

/** Allocate (or reallocate) an RGBA8 render target sized w×h. */
export function makeTarget(gl: GL, w: number, h: number, prev?: RenderTarget): RenderTarget {
  if (prev && prev.width === w && prev.height === h) return prev;
  if (prev) { gl.deleteTexture(prev.tex); gl.deleteFramebuffer(prev.fbo); }
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex, width: w, height: h };
}

/** Create a source texture used to upload layer canvases/video frames each frame. */
export function makeSourceTexture(gl: GL): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/** Upload an image/video/canvas element into a texture. Returns false if the
 *  element isn't ready (zero-sized video frame) so the caller can skip it. */
export function uploadElement(
  gl: GL,
  tex: WebGLTexture,
  el: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas,
): boolean {
  const w = (el as any).videoWidth ?? (el as any).naturalWidth ?? (el as any).width ?? 0;
  const h = (el as any).videoHeight ?? (el as any).naturalHeight ?? (el as any).height ?? 0;
  if (!w || !h) return false;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el as TexImageSource);
  } catch {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    return false;
  }
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  return true;
}

function numberLines(src: string): string {
  return src.split('\n').map((l, i) => `${String(i + 1).padStart(3)}| ${l}`).join('\n');
}
