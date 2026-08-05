import React, { useEffect, useState, useCallback, useRef, Component, ErrorInfo } from 'react';
import * as THREE from 'three';
import { X, Layers, Cpu, RefreshCw, ExternalLink, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { Album } from '../types';

// ── Error Boundary ────────────────────────────────────────────────────────────

interface EBState { hasError: boolean; message: string }
class CanvasErrorBoundary extends Component<{ children: React.ReactNode; onReset: () => void }, EBState> {
  state: EBState = { hasError: false, message: '' };
  static getDerivedStateFromError(e: Error): EBState {
    return { hasError: true, message: e.message || 'Render error' };
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
  // additional diagnostic maps exposed for improved rendering
  contrast?: Float32Array;
  edges?: Float32Array;
}

// ── Gaussian blur ─────────────────────────────────────────────────────────────

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

// Sobel edge map — marks depth-boundary pixels bright
function sobelEdge(gray: Float32Array, w: number, h: number): Float32Array {
  const edge = new Float32Array(w * h);
  let maxE = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx =
        -gray[(y-1)*w+(x-1)] - 2*gray[y*w+(x-1)] - gray[(y+1)*w+(x-1)] +
         gray[(y-1)*w+(x+1)] + 2*gray[y*w+(x+1)] + gray[(y+1)*w+(x+1)];
      const gy =
        -gray[(y-1)*w+(x-1)] - 2*gray[(y-1)*w+x] - gray[(y-1)*w+(x+1)] +
         gray[(y+1)*w+(x-1)] + 2*gray[(y+1)*w+x] + gray[(y+1)*w+(x+1)];
      const e = Math.sqrt(gx * gx + gy * gy);
      edge[y * w + x] = e;
      if (e > maxE) maxE = e;
    }
  }
  if (maxE > 0) for (let i = 0; i < edge.length; i++) edge[i] /= maxE;
  return edge;
}

// Local contrast (std-dev in window) — sharp areas = detailed foreground
function localContrast(gray: Float32Array, w: number, h: number, r: number): Float32Array {
  const out = new Float32Array(w * h);
  let maxC = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, s2 = 0, cnt = 0;
      for (let ky = -r; ky <= r; ky++) {
        const ny = Math.max(0, Math.min(h-1, y + ky));
        for (let kx = -r; kx <= r; kx++) {
          const v = gray[ny * w + Math.max(0, Math.min(w-1, x + kx))];
          s += v; s2 += v * v; cnt++;
        }
      }
      const mean = s / cnt;
      const c = Math.sqrt(Math.max(0, s2 / cnt - mean * mean));
      out[y * w + x] = c;
      if (c > maxC) maxC = c;
    }
  }
  if (maxC > 0) for (let i = 0; i < out.length; i++) out[i] /= maxC;
  return out;
}

// Bilateral smooth: diffuses depth within regions but STOPS at strong colour edges.
// This is the key operation that gives objects discrete depth layers instead of
// one muddy gradient — analogous to what SAM would give us via segmentation.
function bilateralSmooth(
  depth: Float32Array, edges: Float32Array,
  w: number, h: number, r: number, edgeSharpness: number,
): Float32Array {
  const out  = new Float32Array(depth.length);
  const sig2 = r * r * 0.5;
  const r2   = r * r;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, wt = 0;
      for (let ky = -r; ky <= r; ky++) {
        const ny = Math.max(0, Math.min(h-1, y + ky));
        for (let kx = -r; kx <= r; kx++) {
          const d2 = kx*kx + ky*ky;
          if (d2 > r2) continue;
          const nx  = Math.max(0, Math.min(w-1, x + kx));
          const idx = ny * w + nx;
          const sw  = Math.exp(-d2 / sig2);
          const ew  = Math.exp(-edges[idx] * edgeSharpness);
          const ww  = sw * ew;
          sum += depth[idx] * ww;
          wt  += ww;
        }
      }
      out[y * w + x] = wt > 0 ? sum / wt : depth[y * w + x];
    }
  }
  return out;
}

function normalise(a: Float32Array): Float32Array {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < a.length; i++) { if (a[i] < mn) mn = a[i]; if (a[i] > mx) mx = a[i]; }
  const range = mx - mn || 1;
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = (a[i] - mn) / range;
  return out;
}

// Main depth estimation pipeline:
//   raw signal → pre-smooth → bilateral pass 1 (large, sharp edges) →
//   bilateral pass 2 (fine cleanup) → gamma boost → optional layer quantise
async function computeDepth(
  imgSrc: string,
  res = 320,
  depthLayers = 0,
): Promise<DepthData | null> {
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

      const lumA = new Float32Array(n);
      const satA = new Float32Array(n);
      const gray = new Float32Array(n);

      for (let i = 0; i < n; i++) {
        const r = data[i*4]   / 255;
        const g = data[i*4+1] / 255;
        const b = data[i*4+2] / 255;
        lumA[i] = 0.299*r + 0.587*g + 0.114*b;
        gray[i] = lumA[i];
        const mx = Math.max(r,g,b), mn = Math.min(r,g,b);
        satA[i] = mx > 0.02 ? (mx - mn) / mx : 0;
      }

      const edges    = sobelEdge(gray, res, res);
      const contrast = localContrast(gray, res, res, 4);

      const raw = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const cx = (i % res) / (res - 1) - 0.5;
        const cy = Math.floor(i / res) / (res - 1) - 0.5;
        const cw = Math.max(0, 1 - Math.hypot(cx, cy) * 1.9);
        const brightPenalty = lumA[i] > 0.82 ? (lumA[i] - 0.82) * 4 : 0;
        raw[i] = Math.max(0,
          satA[i]      * 0.32 +
          cw           * 0.28 +
          contrast[i]  * 0.28 +
          (1 - lumA[i])* 0.12 * (1 - cw * 0.35) -
          brightPenalty
        );
      }

      const preSmooth = gaussianBlur1D(raw, res, res, 5);
      const bil1      = bilateralSmooth(preSmooth, edges, res, res, 7, 8);
      const bil2      = bilateralSmooth(bil1,      edges, res, res, 3, 6);

      // Small median filter to remove speckle noise from depth estimates
      function medianFilter(src: Float32Array, w: number, h: number): Float32Array {
        const out = new Float32Array(src.length);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const vals: number[] = [];
            for (let ky = -1; ky <= 1; ky++) {
              const ny = Math.max(0, Math.min(h - 1, y + ky));
              for (let kx = -1; kx <= 1; kx++) {
                const nx = Math.max(0, Math.min(w - 1, x + kx));
                vals.push(src[ny * w + nx]);
              }
            }
            vals.sort((a, b) => a - b);
            out[y * w + x] = vals[4];
          }
        }
        return out;
      }

      const denoised = medianFilter(bil2, res, res);
      const norm      = normalise(denoised);

      const depth = new Float32Array(n);
      if (depthLayers >= 2) {
        const L = depthLayers;
        for (let i = 0; i < n; i++) {
          depth[i] = Math.min(L - 1, Math.floor(norm[i] * L)) / (L - 1);
        }
      } else {
        for (let i = 0; i < n; i++) depth[i] = Math.pow(norm[i], 0.60);
      }

      resolve({ map: depth, width: res, height: res, contrast, edges });
    };
    img.onerror = () => resolve(null);
    img.src = imgSrc;
  });
}

// ── Pure Three.js depth viewer (no R3F — zero hook-outside-canvas risk) ───────

interface DepthViewerProps {
  imgSrc: string;
  depthData: DepthData;
  depthScale: number;
  segments: number;
}

function DepthViewer({ imgSrc, depthData, depthScale, segments }: DepthViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    // ── Build displaced geometry ───────────────────────────────────────────
    const { map, width, height } = depthData;
    const geo = new THREE.PlaneGeometry(10, 10, segments, segments);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const uv  = geo.getAttribute('uv')       as THREE.BufferAttribute;

    for (let i = 0; i < pos.count; i++) {
      const u  = uv.getX(i);
      const v  = uv.getY(i);
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
      // Apply a slight non-linear depth curve to increase perceptual parallax
      const signed = d - 0.5;
      const curved = Math.sign(signed) * Math.pow(Math.abs(signed), 1.08);
      // Clamp to avoid extreme vertex displacement that tears the texture
      const z = Math.max(-depthScale * 1.5, Math.min(depthScale * 1.5, curved * depthScale));
      pos.setZ(i, z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    // ── Material / texture ─────────────────────────────────────────────────
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = 'anonymous';
    const tex = loader.load(imgSrc);
    // Improve texture sampling to keep the image crisp while moving/zooming
    try {
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      // preserve color space where available (anisotropy set after renderer is created below)
      if ((tex as any).colorSpace !== undefined) (tex as any).colorSpace = THREE.SRGBColorSpace;
      else if ((tex as any).encoding !== undefined) (tex as any).encoding = (THREE as any)['sRGBEncoding'] ?? 3001;
    } catch (e) {}

    const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.FrontSide, roughness: 0.95, metalness: 0.0 });

    // ── Scene ──────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.add(new THREE.Mesh(geo, mat));

    // ── Renderer ───────────────────────────────────────────────────────────
    const W = el.clientWidth  || 800;
    const H = el.clientHeight || 600;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);

    // Now that renderer exists we can set texture GPU hints like anisotropy
    try {
      const maxAniso = (renderer.capabilities && (renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1)) || 1;
      if ((tex as any).anisotropy !== undefined) (tex as any).anisotropy = maxAniso;
    } catch (e) {}

    // Add subtle lighting to provide shading cues so the displaced surface keeps context
    const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 0.6);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(0.5, 1, 0.5);
    scene.add(dir);

    // ── Camera ─────────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 100);

    // Smooth orbit state with damping to avoid tearing when moving quickly
    let targetTheta = 0;
    let targetPhi = Math.PI / 2;
    let targetR = 9;
    let curTheta = 0;
    let curPhi = Math.PI / 2;
    let curR = 9;
    let auto  = true;
    let drag  = false;
    let lx = 0, ly = 0;

    const clampPhi   = (v: number) => Math.max(Math.PI * 0.22, Math.min(Math.PI * 0.78, v));
    const clampR     = (v: number) => Math.max(5, Math.min(24, v));

    const cv = renderer.domElement;

    const onDown = (e: MouseEvent) => { drag = true; auto = false; lx = e.clientX; ly = e.clientY; };
    const onMove = (e: MouseEvent) => {
      if (!drag) return;
      targetTheta -= (e.clientX - lx) * 0.006;
      targetPhi    = clampPhi(targetPhi - (e.clientY - ly) * 0.006);
      lx = e.clientX; ly = e.clientY;
    };
    const onUp   = () => { drag = false; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      targetR = clampR(targetR + e.deltaY * 0.012);
    };

    // ── Touch ──────────────────────────────────────────────────────────────
    let lt = { x: 0, y: 0 };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      drag = true; auto = false;
      lt = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!drag || e.touches.length !== 1) return;
      targetTheta -= (e.touches[0].clientX - lt.x) * 0.006;
      targetPhi    = clampPhi(targetPhi - (e.touches[0].clientY - lt.y) * 0.006);
      lt = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onTouchEnd = () => { drag = false; };

    cv.addEventListener('mousedown',  onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    cv.addEventListener('wheel',      onWheel,      { passive: false });
    cv.addEventListener('touchstart', onTouchStart, { passive: true });
    cv.addEventListener('touchmove',  onTouchMove,  { passive: true });
    cv.addEventListener('touchend',   onTouchEnd);

    // ── Resize ─────────────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(el);

    // ── RAF loop ───────────────────────────────────────────────────────────
    let raf: number;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      // auto-rotate target
      if (auto) targetTheta += 0.0022;

      // smooth interpolation
      const damp = 0.12;
      curTheta += (targetTheta - curTheta) * damp;
      curPhi   += (targetPhi - curPhi) * damp;
      curR     += (targetR - curR) * damp;

      camera.position.set(
        curR * Math.sin(curPhi) * Math.sin(curTheta),
        curR * Math.cos(curPhi),
        curR * Math.sin(curPhi) * Math.cos(curTheta),
      );
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };
    tick();

    // ── Cleanup ────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      cv.removeEventListener('mousedown',  onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
      cv.removeEventListener('wheel',      onWheel);
      cv.removeEventListener('touchstart', onTouchStart);
      cv.removeEventListener('touchmove',  onTouchMove);
      cv.removeEventListener('touchend',   onTouchEnd);
      renderer.dispose();
      geo.dispose();
      tex.dispose();
      mat.dispose();
      if (el.contains(cv)) el.removeChild(cv);
    };
  // Rebuild the entire scene whenever these change — fast and clean
  }, [imgSrc, depthData, depthScale, segments]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />;
}

// ── Gaussian Splat file viewer (real .splat / .ply captures) ─────────────────

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
  { label: 'Fast',   segments: 128 },
  { label: 'High',   segments: 256 },
  { label: 'Ultra',  segments: 512 },
];

const AlbumArt3DViewer: React.FC<AlbumArt3DViewerProps> = ({ album, onClose }) => {
  const [depthData,    setDepthData]    = useState<DepthData | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [mode,         setMode]         = useState<ViewMode>('DEPTH');
  const [depthScale,   setDepthScale]   = useState(2.6);
  const [segments,     setSegments]     = useState(256);
  const [depthLayers,  setDepthLayers]  = useState(0);
  const [showControls, setShowControls] = useState(false);

  const src = (album as any).coverImage || '';

  const generate = useCallback(async () => {
    if (!src) return;
    setLoading(true);
    setError(null);
    setDepthData(null);
    try {
      const data = await computeDepth(src, 320, depthLayers);
      if (!data) throw new Error('Could not load image — check CORS or try a different artwork.');
      setDepthData(data);
      setMode('DEPTH');
    } catch (e: any) {
      setError(e.message || 'Failed to compute depth.');
    } finally {
      setLoading(false);
    }
  }, [src, depthLayers]);

  // Re-run whenever depthLayers changes (quantisation is baked into the depth map)
  useEffect(() => { generate(); }, [generate]);

  const hasSplatFile = !!(album as any).splatUrl;
  const showViewer   = !loading && !error && depthData;

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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10 pointer-events-none">
            <div className="w-12 h-12 border-2 border-white/10 border-t-white rounded-full animate-spin" />
            <p className="text-[9px] font-black uppercase tracking-widest text-white/40">
              Estimating depth · building 3D surface…
            </p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
            <AlertTriangle size={32} className="text-red-400" />
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
        ) : showViewer ? (
          <CanvasErrorBoundary onReset={generate}>
            <DepthViewer
              imgSrc={src}
              depthData={depthData!}
              depthScale={depthScale}
              segments={segments}
            />
          </CanvasErrorBoundary>
        ) : null}

        {showViewer && mode === 'DEPTH' && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 bg-black/60 backdrop-blur-md rounded-full border border-white/10 pointer-events-none">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-[8px] font-black uppercase tracking-widest text-cyan-400">
              {(segments * segments).toLocaleString()} vertices · Drag to orbit · Scroll to zoom
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
          <div className="grid grid-cols-3 gap-6 px-8 pb-6">
            {/* Depth Scale */}
            <div>
              <label className="text-[8px] font-black uppercase tracking-widest text-white/30 block mb-2">
                Extrusion <span className="text-white/60">{depthScale.toFixed(1)}</span>
              </label>
              <input
                type="range" min={0.5} max={6.0} step={0.1} value={depthScale}
                onChange={e => setDepthScale(parseFloat(e.target.value))}
                className="w-full accent-white h-1"
              />
            </div>

            {/* Depth Layers — 0 = smooth, 2-10 = diorama pop-out */}
            <div>
              <label className="text-[8px] font-black uppercase tracking-widest text-white/30 block mb-2">
                Depth Layers&nbsp;
                <span className="text-white/60">{depthLayers < 2 ? 'Smooth' : depthLayers}</span>
              </label>
              <input
                type="range" min={0} max={10} step={1} value={depthLayers}
                onChange={e => setDepthLayers(parseInt(e.target.value, 10))}
                className="w-full accent-white h-1"
              />
              <p className="text-[7px] text-white/20 mt-1 uppercase tracking-widest">
                {depthLayers < 2 ? 'Continuous gradient' : `${depthLayers} discrete pop-out planes`}
              </p>
            </div>

            {/* Mesh Quality */}
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
