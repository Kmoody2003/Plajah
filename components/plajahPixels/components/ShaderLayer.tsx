// ShaderLayer — render a user-pasted, Shadertoy-style fragment shader full-screen,
// audio-reactive. Exposes the Shadertoy uniform surface (iResolution, iTime,
// iTimeDelta, iFrame, iMouse) PLUS an audio iChannel0 texture (row 0 = FFT,
// row 1 = waveform, à la Shadertoy's audio input) and iBass/iMid/iTreble/iLevel
// scalars. Paste a shader, it compiles live; errors are surfaced to the UI.

import React, { useEffect, useRef } from 'react';

interface Props {
  analyser: AnalyserNode;
  /** User fragment source (must define `void mainImage(out vec4, in vec2)`). */
  source: string;
  startTimeMs: number;
  onError?: (msg: string | null) => void;
  /** CSS mix-blend-mode for layer compositing. */
  blendMode?: string;
  /** 0–1 layer opacity. */
  layerOpacity?: number;
  /** Up to 4 user-controlled parameters exposed as iParam0..iParam3 uniforms (0–1). */
  params?: number[];
}

const VERT = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG_HEADER = `#version 300 es
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
const FRAG_MAIN = `
void main(){ vec4 c = vec4(0.0,0.0,0.0,1.0); mainImage(c, gl_FragCoord.xy); _frag = c; }
`;

const ShaderLayer: React.FC<Props> = ({ analyser, source, startTimeMs, onError, blendMode, layerOpacity, params }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const progRef = useRef<WebGLProgram | null>(null);
  const texRef = useRef<WebGLTexture | null>(null);
  const rafRef = useRef<number>(0);
  const fftRef = useRef<Uint8Array>(new Uint8Array(0));
  const waveRef = useRef<Uint8Array>(new Uint8Array(0));
  const texDataRef = useRef<Uint8Array>(new Uint8Array(0));
  const frameRef = useRef(0);
  const lastRef = useRef(0);
  // Compiled-program cache keyed by exact source. Switching back to a previously
  // seen shader (the common case during beat-driven scene switches) then reuses
  // the linked program instantly instead of re-running compileShader/linkProgram
  // — which is a synchronous GPU stall and the main per-switch hitch.
  const progCacheRef = useRef<Map<string, WebGLProgram>>(new Map());

  // Init GL once.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, powerPreference: 'high-performance' } as WebGLContextAttributes);
    if (!gl) { onError?.('WebGL2 unavailable'); return; }
    glRef.current = gl;
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Audio texture: width = FFT bins, height = 2 (row0 FFT, row1 waveform).
    const W = 512;
    fftRef.current = new Uint8Array(analyser.frequencyBinCount);
    waveRef.current = new Uint8Array(analyser.fftSize);
    texDataRef.current = new Uint8Array(W * 2 * 4);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, texDataRef.current);
    texRef.current = tex;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; gl.viewport(0, 0, canvas.width, canvas.height); };
    window.addEventListener('resize', resize); resize();
    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyser]);

  // (Re)compile on source change.
  useEffect(() => {
    const gl = glRef.current; if (!gl) return;
    // Fast path: this exact source was already compiled — just point at it. No
    // GPU stall, so a rapid scene switch back to a known shader is instant.
    const cached = progCacheRef.current.get(source);
    if (cached) {
      progRef.current = cached;
      frameRef.current = 0;
      onError?.(null);
      return;
    }
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(s) || 'compile error'; gl.deleteShader(s); throw new Error(log); }
      return s;
    };
    try {
      const v = compile(gl.VERTEX_SHADER, VERT);
      const f = compile(gl.FRAGMENT_SHADER, FRAG_HEADER + '\n' + source + '\n' + FRAG_MAIN);
      const prog = gl.createProgram()!;
      gl.attachShader(prog, v); gl.attachShader(prog, f); gl.bindAttribLocation(prog, 0, 'p'); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link error');
      // Keep compiled programs cached (don't delete the previous one — it may be
      // re-fired). Sources are bounded by the clips the user added, so the cache
      // stays small.
      progCacheRef.current.set(source, prog);
      progRef.current = prog;
      frameRef.current = 0;
      onError?.(null);
    } catch (e: any) {
      onError?.(String(e?.message || e).slice(0, 500));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // Render loop.
  useEffect(() => {
    const loop = () => {
      const gl = glRef.current, prog = progRef.current, canvas = canvasRef.current;
      if (gl && prog && canvas) {
        const now = performance.now();
        const dt = lastRef.current ? (now - lastRef.current) / 1000 : 0; lastRef.current = now;

        // Update audio texture + bands.
        analyser.getByteFrequencyData(fftRef.current as any);
        analyser.getByteTimeDomainData(waveRef.current as any);
        const W = 512, td = texDataRef.current;
        const fb = fftRef.current, wb = waveRef.current;
        let bass = 0, mid = 0, treble = 0, level = 0;
        for (let x = 0; x < W; x++) {
          const fv = fb[Math.floor((x / W) * fb.length)] || 0;
          const wv = wb[Math.floor((x / W) * wb.length)] || 128;
          let o = x * 4;            // row 0 = FFT
          td[o] = td[o + 1] = td[o + 2] = fv; td[o + 3] = 255;
          o = (W + x) * 4;          // row 1 = waveform
          td[o] = td[o + 1] = td[o + 2] = wv; td[o + 3] = 255;
          if (x < W * 0.08) bass += fv; else if (x < W * 0.35) mid += fv; else treble += fv;
          level += fv;
        }
        bass /= (W * 0.08 * 255); mid /= (W * 0.27 * 255); treble /= (W * 0.65 * 255); level /= (W * 255);

        gl.useProgram(prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texRef.current);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, 2, gl.RGBA, gl.UNSIGNED_BYTE, td);
        const u = (n: string) => gl.getUniformLocation(prog, n);
        gl.uniform3f(u('iResolution'), canvas.width, canvas.height, 1);
        gl.uniform1f(u('iTime'), (now - startTimeMs) / 1000);
        gl.uniform1f(u('iTimeDelta'), dt);
        gl.uniform1i(u('iFrame'), frameRef.current);
        gl.uniform4f(u('iMouse'), 0, 0, 0, 0);
        gl.uniform1i(u('iChannel0'), 0);
        gl.uniform1f(u('iBass'), bass); gl.uniform1f(u('iMid'), mid);
        gl.uniform1f(u('iTreble'), treble); gl.uniform1f(u('iLevel'), level);
        gl.uniform1f(u('iParam0'), params?.[0] ?? 0.5);
        gl.uniform1f(u('iParam1'), params?.[1] ?? 0.5);
        gl.uniform1f(u('iParam2'), params?.[2] ?? 0.5);
        gl.uniform1f(u('iParam3'), params?.[3] ?? 0.5);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        frameRef.current++;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyser, startTimeMs]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{
        mixBlendMode: (blendMode ?? 'normal') as any,
        opacity: layerOpacity ?? 1,
      }}
    />
  );
};

export default ShaderLayer;
