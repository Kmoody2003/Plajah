import React, { useEffect, useState, useCallback, Component, ErrorInfo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { X, Layers, Cpu, RefreshCw, ExternalLink, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { Album } from '../types';

// ── Error Boundary (prevents Canvas/R3F errors from crashing the full page) ───

interface EBState { hasError: boolean; message: string }
class CanvasErrorBoundary extends Component<{ children: React.ReactNode; onReset: () => void }, EBState> {
  state: EBState = { hasError: false, message: '' };
  static getDerivedStateFromError(e: Error): EBState {
    return { hasError: true, message: e.message || 'WebGL render error' };
  }
  componentDidCatch(e: Error, info: ErrorInfo) {
    console.error('[3DViewer]', e, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 h-full">
          <AlertTriangle size={32} className="text-red-400" />
          <p className="text-sm text-red-400 font-bold text-center max-w-xs">{this.state.message}</p>
          <button
            onClick={() => { this.setState({ hasError: false, message: '' }); this.props.onReset(); }}
            className="px-6 py-3 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface DepthData {
  map: Float32Array;
  width: number;
  height: number;
}

interface SceneObjects {
  geo: THREE.BufferGeometry;
  mat: THREE.MeshBasicMaterial;
}

// ── Gaussian blur (1D separable) ──────────────────────────────────────────────

function gaussianBlur1D(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const sigma = radius / 2;
  const size  = Math.ceil(radius * 3) | 1;
  const half  = size >> 1;
  const kernel: number[] = [];
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - half;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += kernel[i];
  }
  for (let i = 0; i < size; i++) kernel[i] /= sum;

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
  const dst = new Float32Array(src.length);
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

// ── Depth estimation ──────────────────────────────────────────────────────────

async function computeDepth(imgSrc: string, res = 256): Promise<DepthData | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = res; c.height = res;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, res, res);
      const { data } = ctx.getImageData(0, 0, res, res);
      const n = res * res;
      const raw = new Float32Array(n);

      for (let i = 0; i < n; i++) {
        const r = data[i * 4]     / 255;
        const g = data[i * 4 + 1] / 255;
        const b = data[i * 4 + 2] / 255;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        const mx  = Math.max(r, g, b);
        const mn  = Math.min(r, g, b);
        const sat = mx > 0.02 ? (mx - mn) / mx : 0;

        const cx = (i % res) / (res - 1) - 0.5;
        const cy = Math.floor(i / res) / (res - 1) - 0.5;
        const centerW = Math.max(0, 1 - Math.hypot(cx, cy) * 2.2);

        // Saturation + center weighting → subjects come forward
        raw[i] = sat * 0.42 + centerW * 0.38 + (1 - lum) * 0.20 * (1 - centerW * 0.4);
      }

      const depth = gaussianBlur1D(raw, res, res, 14);
      let mn = Infinity, mx2 = -Infinity;
      for (let i = 0; i < n; i++) {
        if (depth[i] < mn)  mn  = depth[i];
        if (depth[i] > mx2) mx2 = depth[i];
      }
      const range = mx2 - mn || 1;
      for (let i = 0; i < n; i++) depth[i] = (depth[i] - mn) / range;

      resolve({ map: depth, width: res, height: res });
    };
    img.onerror = () => resolve(null);
    img.src = imgSrc;
  });
}

// ── Build Three.js objects (called outside Canvas — no R3F hooks involved) ───

function buildSceneObjects(
  imgSrc: string,
  depthData: DepthData,
  depthScale: number,
  segments: number,
): SceneObjects {
  const { map, width, height } = depthData;

  // Subdivided plane — vertices displaced in Z by depth map
  const geo = new THREE.PlaneGeometry(10, 10, segments, segments);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const uv  = geo.getAttribute('uv')       as THREE.BufferAttribute;

  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);

    // Bilinear sample
    const sx = u           * (width  - 1);
    const sy = (1 - v)     * (height - 1);
    const x0 = Math.floor(sx), x1 = Math.min(x0 + 1, width  - 1);
    const y0 = Math.floor(sy), y1 = Math.min(y0 + 1, height - 1);
    const fx = sx - x0,    fy = sy - y0;
    const d  = (
      map[y0 * width + x0] * (1 - fx) * (1 - fy) +
      map[y0 * width + x1] * fx       * (1 - fy) +
      map[y1 * width + x0] * (1 - fx) * fy       +
      map[y1 * width + x1] * fx       * fy
    );
    pos.setZ(i, (d - 0.5) * depthScale);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  // Original photo as texture — no glow, no additive blending, exact colors
  const loader = new THREE.TextureLoader();
  loader.crossOrigin = 'anonymous';
  const tex = loader.load(imgSrc);
  try { tex.colorSpace = THREE.SRGBColorSpace; } catch (_) {}

  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide });

  return { geo, mat };
}

function disposeSceneObjects(objs: SceneObjects) {
  objs.geo.dispose();
  (objs.mat.map as THREE.Texture | null)?.dispose();
  objs.mat.dispose();
}

// ── Pure Canvas scene — no hooks, just props ──────────────────────────────────

function PhotoScene({ geo, mat }: { geo: THREE.BufferGeometry; mat: THREE.MeshBasicMaterial }) {
  return (
    <>
      <mesh geometry={geo} material={mat} />
      <OrbitControls
        enablePan={false}
        enableZoom
        minDistance={5}
        maxDistance={16}
        minAzimuthAngle={-Math.PI / 5.5}
        maxAzimuthAngle={Math.PI  / 5.5}
        minPolarAngle={Math.PI / 2 - Math.PI / 5.5}
        maxPolarAngle={Math.PI / 2 + Math.PI / 5.5}
        autoRotate
        autoRotateSpeed={0.35}
      />
      <PerspectiveCamera makeDefault position={[0, 0, 9]} fov={50} />
    </>
  );
}

// ── Gaussian Splat file viewer (real .splat / .ply captures) ─────────────────

function GaussianSplatFileViewer({ splatUrl }: { splatUrl: string }) {
  const mountRef = React.useRef<HTMLDivElement>(null);

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
      viewer.loadFile(splatUrl, { splatAlphaRemovalThreshold: 5 })
        .then(() => { if (!disposed) viewer.start(); })
        .catch(console.error);
    });

    return () => {
      disposed = true;
      try { viewer?.stop(); viewer?.dispose(); } catch (_) {}
    };
  }, [splatUrl]);

  return <div ref={mountRef} className="w-full h-full" />;
}

// ── Main component ────────────────────────────────────────────────────────────

interface AlbumArt3DViewerProps {
  album: Album;
  onClose: () => void;
}

type ViewMode = 'DEPTH' | 'SPLAT_FILE';

const QUALITY = [
  { label: 'Fast',   segments: 64  },
  { label: 'Medium', segments: 128 },
  { label: 'High',   segments: 256 },
];

const AlbumArt3DViewer: React.FC<AlbumArt3DViewerProps> = ({ album, onClose }) => {
  const [depthData,    setDepthData]    = useState<DepthData | null>(null);
  const [sceneObjs,    setSceneObjs]    = useState<SceneObjects | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [mode,         setMode]         = useState<ViewMode>('DEPTH');
  const [depthScale,   setDepthScale]   = useState(1.8);
  const [segments,     setSegments]     = useState(128);
  const [showControls, setShowControls] = useState(false);

  const src = album.coverImage || '';

  // ── Step 1: compute depth map ───────────────────────────────────────────────
  const generate = useCallback(async () => {
    if (!src) return;
    setLoading(true);
    setError(null);
    setDepthData(null);
    setSceneObjs(prev => { if (prev) disposeSceneObjects(prev); return null; });
    try {
      const data = await computeDepth(src, 256);
      if (!data) throw new Error('Could not load image — check CORS or try a different artwork.');
      setDepthData(data);
      setMode('DEPTH');
    } catch (e: any) {
      setError(e.message || 'Failed to compute depth.');
    } finally {
      setLoading(false);
    }
  }, [src]);

  useEffect(() => { generate(); }, [generate]);

  // ── Step 2: build Three.js objects whenever depth/scale/quality changes ─────
  useEffect(() => {
    if (!depthData || !src) return;
    const objs = buildSceneObjects(src, depthData, depthScale, segments);
    setSceneObjs(prev => { if (prev) disposeSceneObjects(prev); return objs; });
    return () => { disposeSceneObjects(objs); };
  }, [src, depthData, depthScale, segments]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => { setSceneObjs(prev => { if (prev) disposeSceneObjects(prev); return null; }); };
  }, []);

  const hasSplatFile = !!(album as any).splatUrl;

  return (
    <div
      className="fixed inset-0 z-[300] bg-black/95 backdrop-blur-2xl flex flex-col"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0">
            <img src={src} alt="" className="w-full h-full object-cover" />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest">{album.title}</h2>
            <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mt-0.5">
              {mode === 'SPLAT_FILE' ? 'Gaussian Splat Capture' : '2D → 3D Depth Projection'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white/5 rounded-full p-1 gap-1">
            <button
              onClick={() => setMode('DEPTH')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${mode === 'DEPTH' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
            >
              <Cpu size={10} /> Depth 3D
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
            <p className="text-[9px] font-black uppercase tracking-widest text-white/40">
              Estimating depth · building 3D surface…
            </p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
            <p className="text-sm text-red-400 font-bold max-w-sm text-center">{error}</p>
            <button onClick={generate} className="px-6 py-3 bg-white text-black rounded-full text-[10px] font-black uppercase tracking-widest">
              Retry
            </button>
          </div>
        )}

        {mode === 'SPLAT_FILE' && hasSplatFile ? (
          <CanvasErrorBoundary onReset={() => setMode('DEPTH')}>
            <GaussianSplatFileViewer splatUrl={(album as any).splatUrl} />
          </CanvasErrorBoundary>
        ) : sceneObjs && !loading ? (
          <CanvasErrorBoundary onReset={generate}>
            <Canvas
              gl={{ antialias: true, alpha: false }}
              style={{ background: '#000' }}
              onCreated={({ gl }) => gl.setClearColor(0x000000, 1)}
            >
              <PhotoScene geo={sceneObjs.geo} mat={sceneObjs.mat} />
            </Canvas>
          </CanvasErrorBoundary>
        ) : null}

        {sceneObjs && !loading && mode === 'DEPTH' && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 bg-black/60 backdrop-blur-md rounded-full border border-white/10 pointer-events-none">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-[8px] font-black uppercase tracking-widest text-cyan-400">
              {(segments * segments).toLocaleString()} vertices · Drag to orbit
            </span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="shrink-0 border-t border-white/5">
        <button
          onClick={() => setShowControls(v => !v)}
          className="w-full flex items-center justify-center gap-2 py-3 text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 transition-all"
        >
          {showControls ? <ChevronDown size={10} /> : <ChevronUp size={10} />}
          3D Parameters
        </button>

        {showControls && (
          <div className="grid grid-cols-2 gap-6 px-8 pb-6">
            <div>
              <label className="text-[8px] font-black uppercase tracking-widest text-white/30 block mb-2">
                Depth Scale <span className="text-white/60">{depthScale.toFixed(1)}</span>
              </label>
              <input
                type="range" min={0.3} max={4.0} step={0.1} value={depthScale}
                onChange={e => setDepthScale(parseFloat(e.target.value))}
                className="w-full accent-white h-1"
              />
            </div>
            <div>
              <label className="text-[8px] font-black uppercase tracking-widest text-white/30 block mb-3">
                Mesh Quality
              </label>
              <div className="flex items-center gap-2">
                {QUALITY.map(q => (
                  <button
                    key={q.segments}
                    onClick={() => setSegments(q.segments)}
                    className={`flex-1 py-2 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${segments === q.segments ? 'bg-white text-black' : 'bg-white/10 text-white/40 hover:text-white'}`}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AlbumArt3DViewer;
