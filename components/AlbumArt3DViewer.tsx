import React, { useRef, useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { X, Layers, Cpu, RefreshCw, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { Album } from '../types';

// ── Depth map computation ─────────────────────────────────────────────────────

interface DepthData {
  depth: Float32Array;
  r: Uint8Array;
  g: Uint8Array;
  b: Uint8Array;
  width: number;
  height: number;
}

function gaussianBlur1D(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const dst = new Float32Array(src.length);
  const sigma = radius / 2;
  const size = Math.ceil(radius * 3) | 1;
  const half = size >> 1;
  const kernel: number[] = [];
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - half;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += kernel[i];
  }
  for (let i = 0; i < size; i++) kernel[i] /= sum;

  // Horizontal pass
  const tmp = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let val = 0;
      for (let k = 0; k < size; k++) {
        const sx = Math.min(w - 1, Math.max(0, x + k - half));
        val += src[y * w + sx] * kernel[k];
      }
      tmp[y * w + x] = val;
    }
  }
  // Vertical pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let val = 0;
      for (let k = 0; k < size; k++) {
        const sy = Math.min(h - 1, Math.max(0, y + k - half));
        val += tmp[sy * w + x] * kernel[k];
      }
      dst[y * w + x] = val;
    }
  }
  return dst;
}

async function computeDepthFromImage(src: string, res = 128): Promise<DepthData | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = res;
      canvas.height = res;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, res, res);
      const { data } = ctx.getImageData(0, 0, res, res);
      const n = res * res;
      const lum = new Float32Array(n);
      const r = new Uint8Array(n);
      const g = new Uint8Array(n);
      const b = new Uint8Array(n);

      for (let i = 0; i < n; i++) {
        r[i] = data[i * 4];
        g[i] = data[i * 4 + 1];
        b[i] = data[i * 4 + 2];
        lum[i] = (0.299 * r[i] + 0.587 * g[i] + 0.114 * b[i]) / 255;
      }

      // Sobel edge detection → mix into depth for better object separation
      const edge = new Float32Array(n);
      for (let y = 1; y < res - 1; y++) {
        for (let x = 1; x < res - 1; x++) {
          const idx = y * res + x;
          const gx =
            -lum[(y - 1) * res + (x - 1)] - 2 * lum[y * res + (x - 1)] - lum[(y + 1) * res + (x - 1)] +
             lum[(y - 1) * res + (x + 1)] + 2 * lum[y * res + (x + 1)] + lum[(y + 1) * res + (x + 1)];
          const gy =
            -lum[(y - 1) * res + (x - 1)] - 2 * lum[(y - 1) * res + x] - lum[(y - 1) * res + (x + 1)] +
             lum[(y + 1) * res + (x - 1)] + 2 * lum[(y + 1) * res + x] + lum[(y + 1) * res + (x + 1)];
          edge[idx] = Math.min(1, Math.sqrt(gx * gx + gy * gy) * 3);
        }
      }

      // Depth = luminance with edge push (bright areas → close, edges → boundary)
      const raw = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        raw[i] = lum[i] * (1 - edge[i] * 0.4);
      }

      // Smooth the depth map
      const depth = gaussianBlur1D(raw, res, res, 6);

      // Normalize to [0,1]
      let mn = Infinity, mx = -Infinity;
      for (let i = 0; i < n; i++) { mn = Math.min(mn, depth[i]); mx = Math.max(mx, depth[i]); }
      const range = mx - mn || 1;
      for (let i = 0; i < n; i++) depth[i] = (depth[i] - mn) / range;

      resolve({ depth, r, g, b, width: res, height: res });
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// ── Gaussian Splat mesh (billboard quads with Gaussian falloff shader) ─────────

const VERT = /* glsl */`
attribute float aDepth;
attribute vec3 aColor;
attribute float aAlpha;
uniform float uSplatSize;
uniform float uDepthScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec3 pos = position;
  pos.z = (aDepth - 0.5) * uDepthScale;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = uSplatSize * aAlpha / max(0.1, -mv.z * 0.2);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */`
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = 2.0 * gl_PointCoord - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float g = exp(-3.5 * r2);
  gl_FragColor = vec4(vColor, g * vAlpha);
}`;

interface SplatMeshProps {
  depthData: DepthData;
  depthScale: number;
  splatSize: number;
  density: number;
}

function SplatMesh({ depthData, depthScale, splatSize, density }: SplatMeshProps) {
  const { camera } = useThree();
  const pointsRef = useRef<THREE.Points>(null);

  const { geometry, material } = useMemo(() => {
    const { depth, r, g, b, width, height } = depthData;
    const step = Math.max(1, Math.floor(1 / density));
    const positions: number[] = [];
    const colors: number[] = [];
    const depths: number[] = [];
    const alphas: number[] = [];

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const i = y * width + x;
        const d = depth[i];
        // UV in [-1, 1]
        const px = (x / (width - 1)) * 2 - 1;
        const py = -((y / (height - 1)) * 2 - 1);
        positions.push(px * 5, py * 5, 0);
        colors.push(r[i] / 255, g[i] / 255, b[i] / 255);
        depths.push(d);
        alphas.push(0.6 + d * 0.4);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('aColor',   new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('aDepth',   new THREE.Float32BufferAttribute(depths, 1));
    geo.setAttribute('aAlpha',   new THREE.Float32BufferAttribute(alphas, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uSplatSize:  { value: splatSize },
        uDepthScale: { value: depthScale },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    return { geometry: geo, material: mat };
  }, [depthData, density]);

  useEffect(() => {
    material.uniforms.uSplatSize.value  = splatSize;
    material.uniforms.uDepthScale.value = depthScale;
  }, [splatSize, depthScale, material]);

  useFrame(() => {
    // Sort splats by depth relative to camera each frame for correct alpha blending
    if (!pointsRef.current) return;
    const mat = pointsRef.current.material as THREE.ShaderMaterial;
    mat.uniforms.uSplatSize.value = splatSize;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}

// ── Gaussian Splat file viewer (uses gaussian-splats-3d library) ──────────────

function GaussianSplatFileViewer({ splatUrl }: { splatUrl: string }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    let viewer: any = null;
    let disposed = false;

    import('gaussian-splats-3d').then(({ Viewer }) => {
      if (disposed || !mountRef.current) return;
      viewer = new Viewer({
        rootElement: mountRef.current,
        selfDrivenMode: true,
        useBuiltInControls: true,
        renderMode: 0,
      });
      viewer.loadFile(splatUrl, {
        splatAlphaRemovalThreshold: 5,
      }).then(() => {
        if (!disposed) viewer.start();
      }).catch(console.error);
    });

    return () => {
      disposed = true;
      try { viewer?.stop(); viewer?.dispose(); } catch (_) {}
    };
  }, [splatUrl]);

  return <div ref={mountRef} className="w-full h-full" />;
}

// ── Scene wrapper ─────────────────────────────────────────────────────────────

function SplatScene({
  depthData, depthScale, splatSize, density,
}: SplatMeshProps) {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={0.6} />
      <SplatMesh depthData={depthData} depthScale={depthScale} splatSize={splatSize} density={density} />
      <OrbitControls
        enablePan={false}
        enableZoom
        minDistance={4}
        maxDistance={18}
        autoRotate
        autoRotateSpeed={0.4}
      />
      <PerspectiveCamera makeDefault position={[0, 0, 9]} fov={50} />
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface AlbumArt3DViewerProps {
  album: Album;
  onClose: () => void;
}

type ViewMode = 'GAUSSIAN' | 'SPLAT_FILE';

const AlbumArt3DViewer: React.FC<AlbumArt3DViewerProps> = ({ album, onClose }) => {
  const [depthData, setDepthData]   = useState<DepthData | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [mode, setMode]             = useState<ViewMode>('GAUSSIAN');
  const [depthScale, setDepthScale] = useState(3.5);
  const [splatSize, setSplatSize]   = useState(180);
  const [density, setDensity]       = useState(1.0);
  const [showControls, setShowControls] = useState(false);

  const src = album.coverImage || '';

  const generate = useCallback(async () => {
    if (!src) return;
    setLoading(true);
    setError(null);
    try {
      const data = await computeDepthFromImage(src, 160);
      if (!data) throw new Error('Could not load image — check CORS or try a different artwork.');
      setDepthData(data);
      setMode('GAUSSIAN');
    } catch (e: any) {
      setError(e.message || 'Failed to generate depth map.');
    } finally {
      setLoading(false);
    }
  }, [src]);

  // Auto-generate on mount
  useEffect(() => { generate(); }, [generate]);

  const hasSplatFile = !!(album as any).splatUrl;

  return (
    <div className="fixed inset-0 z-[300] bg-black/95 backdrop-blur-2xl flex flex-col" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0">
            <img src={src} alt="" className="w-full h-full object-cover" />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest">{album.title}</h2>
            <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mt-0.5">
              {mode === 'SPLAT_FILE' ? 'Gaussian Splat File' : 'Depth-Estimated Gaussian Splat'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Mode toggle */}
          <div className="flex items-center bg-white/5 rounded-full p-1 gap-1">
            <button
              onClick={() => setMode('GAUSSIAN')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${mode === 'GAUSSIAN' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
            >
              <Cpu size={10} /> Depth Splat
            </button>
            {hasSplatFile && (
              <button
                onClick={() => setMode('SPLAT_FILE')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${mode === 'SPLAT_FILE' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
              >
                <Layers size={10} /> Splat File
              </button>
            )}
          </div>

          <button
            onClick={generate}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 border border-white/10 rounded-full text-[9px] font-black uppercase tracking-widest hover:bg-white/20 transition-all disabled:opacity-40"
          >
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Processing…' : 'Regenerate'}
          </button>

          <a
            href={`https://lumalabs.ai/capture?url=${encodeURIComponent(src)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-violet-600/20 border border-violet-500/30 rounded-full text-[9px] font-black uppercase tracking-widest text-violet-300 hover:bg-violet-600/40 transition-all"
          >
            <ExternalLink size={10} /> Luma AI
          </a>

          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-all">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Viewport */}
      <div className="flex-1 relative overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
            <div className="w-12 h-12 border-2 border-white/10 border-t-white rounded-full animate-spin" />
            <p className="text-[9px] font-black uppercase tracking-widest text-white/40">Computing depth map + generating splats…</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
            <p className="text-sm text-red-400 font-bold">{error}</p>
            <button onClick={generate} className="px-6 py-3 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest">Retry</button>
          </div>
        )}

        {mode === 'SPLAT_FILE' && hasSplatFile ? (
          <GaussianSplatFileViewer splatUrl={(album as any).splatUrl} />
        ) : depthData && !loading ? (
          <Canvas
            gl={{ antialias: true, alpha: false, premultipliedAlpha: false }}
            style={{ background: '#000' }}
            onCreated={({ gl }) => { gl.setClearColor(0x000000, 1); }}
          >
            <SplatScene
              depthData={depthData}
              depthScale={depthScale}
              splatSize={splatSize}
              density={density}
            />
          </Canvas>
        ) : null}

        {/* Info overlay */}
        {depthData && !loading && mode === 'GAUSSIAN' && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 bg-black/60 backdrop-blur-md rounded-full border border-white/10">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
            <span className="text-[8px] font-black uppercase tracking-widest text-cyan-400">
              {(depthData.width * depthData.height).toLocaleString()} Gaussian Splats · Drag to orbit
            </span>
          </div>
        )}
      </div>

      {/* Controls panel */}
      <div className="shrink-0 border-t border-white/5">
        <button
          onClick={() => setShowControls(v => !v)}
          className="w-full flex items-center justify-center gap-2 py-3 text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 transition-all"
        >
          {showControls ? <ChevronDown size={10} /> : <ChevronUp size={10} />}
          Splat Parameters
        </button>

        {showControls && (
          <div className="grid grid-cols-3 gap-6 px-8 pb-6">
            <div>
              <label className="text-[8px] font-black uppercase tracking-widest text-white/30 block mb-2">
                Depth Scale <span className="text-white/60">{depthScale.toFixed(1)}</span>
              </label>
              <input type="range" min={0.5} max={8} step={0.1} value={depthScale}
                onChange={e => setDepthScale(parseFloat(e.target.value))}
                className="w-full accent-white h-1" />
            </div>
            <div>
              <label className="text-[8px] font-black uppercase tracking-widest text-white/30 block mb-2">
                Splat Size <span className="text-white/60">{splatSize}</span>
              </label>
              <input type="range" min={40} max={400} step={10} value={splatSize}
                onChange={e => setSplatSize(parseFloat(e.target.value))}
                className="w-full accent-white h-1" />
            </div>
            <div>
              <label className="text-[8px] font-black uppercase tracking-widest text-white/30 block mb-2">
                Density <span className="text-white/60">{density.toFixed(2)}</span>
              </label>
              <input type="range" min={0.2} max={1} step={0.05} value={density}
                onChange={e => setDensity(parseFloat(e.target.value))}
                className="w-full accent-white h-1" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AlbumArt3DViewer;
