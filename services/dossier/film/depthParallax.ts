// Depth parallax ("2.5D camera") for still paintings: a WebGL pass that shifts each pixel by its
// depth as the camera drifts, so a flat reconstruction painting moves like a set with real
// foreground and background. Depth maps come from scripts/dossier/buildDepthMaps.ts
// (Depth Anything V2, near = white). Falls back to a flat draw when WebGL or the map is missing.

const VERT = `attribute vec2 p; varying vec2 v; void main(){ v = p * .5 + .5; v.y = 1. - v.y; gl_Position = vec4(p, 0., 1.); }`;
const FRAG = `precision mediump float;
varying vec2 v;
uniform sampler2D img, dep;
uniform vec4 rect;      // image-uv = rect.xy + v * rect.zw
uniform vec2 shift;     // camera parallax offset in image-uv units
uniform float focus;    // depth that stays put
uniform vec2 texel;     // one depth-map pixel in uv (reserved for edge-aware sampling)
// Depth maps are pre-softened (dilated + blurred) by scripts/dossier/fetchFilmAssets.ts, so the
// foreground carries its own silhouette and displacement is a smooth gradient — no halo.
float depthAt(vec2 p){ return texture2D(dep, p).r; }
void main(){
  vec2 uv = rect.xy + v * rect.zw;
  // Damped iterative relief lookup: converges smoothly instead of oscillating at depth edges.
  vec2 o = vec2(0.);
  for (int i = 0; i < 8; i++) {
    float d = depthAt(uv + o);
    o = mix(o, shift * (d - focus), .55);
  }
  vec2 q = clamp(uv + o, vec2(.001), vec2(.999));
  gl_FragColor = texture2D(img, q);
}`;

export interface ParallaxView { x: number; y: number; zoom: number; shiftX: number; shiftY: number; focus?: number }

export class DepthParallax {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null;
  private prog: WebGLProgram | null = null;
  private tex = new Map<string, { img: WebGLTexture; dep: WebGLTexture; w: number; h: number; dw: number; dh: number }>();
  private u: Record<string, WebGLUniformLocation | null> = {};

  constructor(w: number, h: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    this.gl = this.canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (this.gl) this.init(this.gl);
  }

  get ok() { return !!this.gl && !!this.prog; }

  private init(gl: WebGLRenderingContext) {
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const p = gl.createProgram()!;
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return;
    this.prog = p;
    gl.useProgram(p);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['img', 'dep', 'rect', 'shift', 'focus', 'texel']) this.u[n] = gl.getUniformLocation(p, n);
    gl.uniform1i(this.u.img, 0); gl.uniform1i(this.u.dep, 1);
  }

  private upload(el: TexImageSource): WebGLTexture {
    const gl = this.gl!;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el);
    return t;
  }

  add(id: string, img: HTMLImageElement, depth: HTMLImageElement) {
    if (!this.ok || this.tex.has(id)) return;
    this.tex.set(id, { img: this.upload(img), dep: this.upload(depth), w: img.naturalWidth, h: img.naturalHeight, dw: depth.naturalWidth || 512, dh: depth.naturalHeight || 512 });
  }

  has(id: string) { return this.tex.has(id); }

  /** Render `id` with the camera; returns the canvas to drawImage, or null if unavailable. */
  render(id: string, view: ParallaxView): HTMLCanvasElement | null {
    const t = this.tex.get(id);
    const gl = this.gl;
    if (!t || !gl || !this.prog) return null;
    const W = this.canvas.width, H = this.canvas.height;
    // Cover-fit visible window in image uv, with margin so the shift never reveals an edge.
    const margin = 1 + Math.hypot(view.shiftX, view.shiftY) * 2.2;
    const s = Math.max(W / t.w, H / t.h) * view.zoom * margin;
    const vw = W / (t.w * s), vh = H / (t.h * s);
    const x0 = Math.min(1 - vw, Math.max(0, view.x - vw / 2));
    const y0 = Math.min(1 - vh, Math.max(0, view.y - vh / 2));
    gl.viewport(0, 0, W, H);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t.img);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, t.dep);
    gl.uniform4f(this.u.rect, x0, y0, vw, vh);
    gl.uniform2f(this.u.shift, view.shiftX * vw, view.shiftY * vh);
    gl.uniform1f(this.u.focus, view.focus ?? .45);
    gl.uniform2f(this.u.texel, 1 / t.dw, 1 / t.dh);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }
}
