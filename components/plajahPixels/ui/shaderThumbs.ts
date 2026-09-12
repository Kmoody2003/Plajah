// shaderThumbs — one still per shader, rendered on demand and cached forever.
//
// The library is now sixty works larger and a list of text chips cannot carry
// it: you cannot choose a visual by reading its name. This renders a single
// frame of each work, at thumbnail size, through one shared WebGL context.
//
// Why one frame and one context:
//   • Sixty live canvases would exceed the browser's context limit (~16) and
//     the fill rate besides.
//   • A still is enough to choose by. Motion is what the stage is for.
//   • Compiling sixty programs at panel-open would stall the UI, so work is
//     queued one per animation frame and only for cards that are actually on
//     screen.
//
// The audio texture is a baked, plausible spectrum rather than silence — a work
// rendered against a dead analyser shows you its idle state, which is exactly
// the frame that tells you least about it.

const W = 320, H = 180;

const VERT = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const HEAD = `#version 300 es
precision highp float;
out vec4 _frag;
uniform vec3 iResolution; uniform float iTime; uniform float iTimeDelta; uniform int iFrame;
uniform vec4 iMouse; uniform sampler2D iChannel0;
uniform float iBass, iMid, iTreble, iLevel;
uniform float iParam0, iParam1, iParam2, iParam3;
`;
const TAIL = `
void main(){ vec4 c = vec4(0.0,0.0,0.0,1.0); mainImage(c, gl_FragCoord.xy); _frag = c; }
`;

let gl: WebGL2RenderingContext | null = null;
let canvas: HTMLCanvasElement | null = null;
let tex: WebGLTexture | null = null;
let ready = false;

const cache = new Map<string, string>();          // key -> dataURL

/* ── Persistence ────────────────────────────────────────────────────────────
   Compiling ninety-five shaders costs about twenty-five seconds. Doing it once
   is the price of the wall; doing it on every reload is a bug. */

const DB_NAME = 'plajah-pixels-thumbs';
const STORE = 'stills';
type Rec = { url: string; h: number };

/** djb2 over the shader source — edit a shader and its still is re-rendered. */
function srcHash(src: string): number {
  let h = 5381;
  for (let i = 0; i < src.length; i++) h = ((h * 33) ^ src.charCodeAt(i)) >>> 0;
  return h;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }   // private mode, disabled storage — render live
  });
  return dbPromise;
}

let persisted: Map<string, Rec> | null = null;
let loadingPersisted: Promise<void> | null = null;

function ensurePersisted(): Promise<void> {
  if (loadingPersisted) return loadingPersisted;
  loadingPersisted = new Promise<void>(resolve => {
    persisted = new Map();
    openDb().then(db => {
      if (!db) { resolve(); return; }
      try {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
        req.onsuccess = () => {
          const c = req.result;
          if (!c) { resolve(); return; }
          persisted!.set(String(c.key), c.value as Rec);
          c.continue();
        };
        req.onerror = () => resolve();
      } catch { resolve(); }
    });
  });
  return loadingPersisted;
}

function persist(key: string, rec: Rec): void {
  openDb().then(db => {
    if (!db) return;
    try { db.transaction(STORE, 'readwrite').objectStore(STORE).put(rec, key); } catch { /* quota */ }
  });
}
const failed = new Set<string>();
const queue: { key: string; src: string; done: (url: string | null) => void }[] = [];
let pumping = false;

/** A believable mix: a bass shelf, a presence hump with formant peaks, some air. */
function bakeAudioTexture(): Uint8Array {
  const px = new Uint8Array(512 * 2 * 4);
  for (let x = 0; x < 512; x++) {
    const f = x / 512;
    let v = 225 * Math.exp(-f * 26) + 88 * Math.exp(-Math.pow((f - 0.09) / 0.05, 2)) + 58 * Math.exp(-f * 3);
    v += 52 * Math.exp(-Math.pow((f - 0.055) / 0.006, 2))
       + 44 * Math.exp(-Math.pow((f - 0.085) / 0.006, 2))
       + 34 * Math.exp(-Math.pow((f - 0.115) / 0.008, 2));
    v = Math.min(255, v);
    let o = x * 4;
    px[o] = px[o + 1] = px[o + 2] = v; px[o + 3] = 255;
    o = (512 + x) * 4;
    const w = 128 + 108 * Math.sin(x * 0.35) * Math.exp(-((x % 64) / 64));
    px[o] = px[o + 1] = px[o + 2] = Math.max(0, Math.min(255, w)); px[o + 3] = 255;
  }
  const chord = [.92, .20, .16, .72, .22, .18, .25, .84, .18, .24, .58, .15];
  for (let i = 0; i < 12; i++) px[i * 4 + 3] = Math.round(chord[i] * 255);
  return px;
}

function init(): boolean {
  if (ready) return !!gl;
  ready = true;
  try {
    canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true });
    if (!gl) return false;

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 512, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, bakeAudioTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return true;
  } catch {
    gl = null;
    return false;
  }
}

function renderOne(src: string): string | null {
  if (!gl || !canvas) return null;
  const mk = (type: number, s: string) => {
    const sh = gl!.createShader(type)!;
    gl!.shaderSource(sh, s); gl!.compileShader(sh);
    if (!gl!.getShaderParameter(sh, gl!.COMPILE_STATUS)) { gl!.deleteShader(sh); return null; }
    return sh;
  };
  const v = mk(gl.VERTEX_SHADER, VERT);
  const f = mk(gl.FRAGMENT_SHADER, HEAD + '\n' + src + '\n' + TAIL);
  if (!v || !f) { if (v) gl.deleteShader(v); if (f) gl.deleteShader(f); return null; }

  const pr = gl.createProgram()!;
  gl.attachShader(pr, v); gl.attachShader(pr, f);
  gl.bindAttribLocation(pr, 0, 'p');
  gl.linkProgram(pr);
  const linked = gl.getProgramParameter(pr, gl.LINK_STATUS);
  gl.deleteShader(v); gl.deleteShader(f);
  if (!linked) { gl.deleteProgram(pr); return null; }

  gl.useProgram(pr);
  const U = (n: string) => gl!.getUniformLocation(pr, n);
  gl.uniform3f(U('iResolution'), W, H, 1);
  // A time offset that is past every work's fade-in but not so far that the
  // slow pieces have drifted off their composition.
  gl.uniform1f(U('iTime'), 12.4);
  gl.uniform1f(U('iTimeDelta'), 1 / 60);
  gl.uniform1i(U('iFrame'), 744);
  gl.uniform4f(U('iMouse'), 0, 0, 0, 0);
  gl.uniform1f(U('iBass'), 0.58); gl.uniform1f(U('iMid'), 0.44);
  gl.uniform1f(U('iTreble'), 0.30); gl.uniform1f(U('iLevel'), 0.45);
  // Mid-travel on every control, which is where a work is designed to sit.
  gl.uniform1f(U('iParam0'), 0.4); gl.uniform1f(U('iParam1'), 0.4);
  gl.uniform1f(U('iParam2'), 0.4); gl.uniform1f(U('iParam3'), 0.4);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(U('iChannel0'), 0);

  gl.viewport(0, 0, W, H);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.deleteProgram(pr);

  try { return canvas.toDataURL('image/jpeg', 0.72); } catch { return null; }
}

function pump() {
  if (pumping) return;
  pumping = true;
  const step = () => {
    const job = queue.shift();
    if (!job) { pumping = false; return; }
    // A shader that will not compile must not take the queue down with it.
    let url: string | null = null;
    try { url = cache.get(job.key) ?? renderOne(job.src); } catch { url = null; }
    if (url) cache.set(job.key, url); else failed.add(job.key);
    job.done(url);
    // One per frame: sixty compiles in a row is a visible stall.
    if (queue.length) requestAnimationFrame(step); else pumping = false;
  };
  requestAnimationFrame(step);
}

/** Cached still for a shader, or null if it will not compile here. */
export function getShaderThumb(key: string, src: string): Promise<string | null> {
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  if (failed.has(key)) return Promise.resolve(null);

  return ensurePersisted().then(() => {
    const again = cache.get(key);
    if (again) return again;

    const h = srcHash(src);
    const rec = persisted?.get(key);
    if (rec && rec.h === h) {          // rendered on an earlier visit
      cache.set(key, rec.url);
      return rec.url;
    }

    if (!init()) return null;
    return new Promise<string | null>(resolve => {
      queue.push({
        key, src,
        done: url => { if (url) persist(key, { url, h }); resolve(url); },
      });
      pump();
    });
  });
}

/** Already rendered? Lets a card paint instantly on re-open without a flash. */
export function peekShaderThumb(key: string): string | null {
  return cache.get(key) ?? null;
}
