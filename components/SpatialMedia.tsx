import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Layers, Eye, Sparkles } from 'lucide-react';
import { useSpatialOptional } from '../contexts/SpatialContext';
import { autoConvert2DtoSpatial, getCachedSpatialLDI, type LayeredDepthImage } from '../services/fabula/spatialEngine';
import { SpatialDibrRenderer } from '../services/fabula/spatialDibrShader';
import { checkWebXrSupport, launchStereoXrSession } from '../services/fabula/spatialXrSession';

interface SpatialMediaProps {
  url: string;
  type?: 'IMAGE' | 'VIDEO';
  alt?: string;
  className?: string;
  roundedClassName?: string;
  forceDepth?: boolean;
  controls?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const SpatialMedia: React.FC<SpatialMediaProps> = memo(({
  url,
  type = 'IMAGE',
  alt = '',
  className = 'w-full h-full',
  roundedClassName = 'rounded-[2rem]',
  forceDepth,
  controls,
  autoPlay,
  muted = true,
  loop = true,
}) => {
  const { isSpatialMode } = useSpatialOptional();
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);
  const [ldi, setLdi] = useState<LayeredDepthImage | null>(() => getCachedSpatialLDI(url));
  const [converting, setConverting] = useState(false);
  const [hasWebXr, setHasWebXr] = useState(false);
  const [isXrActive, setIsXrActive] = useState(false);

  const ref = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLImageElement | HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<SpatialDibrRenderer | null>(null);

  const depthEnabled = (forceDepth ?? isSpatialMode) && !reducedMotion;

  // Reduced motion preference
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(Boolean(mq?.matches));
    update();
    mq?.addEventListener?.('change', update);
    return () => mq?.removeEventListener?.('change', update);
  }, []);

  // Check WebXR headset availability (Meta Quest Browser / Android XR / Vision Pro)
  useEffect(() => {
    checkWebXrSupport().then(setHasWebXr).catch(() => setHasWebXr(false));
  }, []);

  // Auto-convert to 3D Layered Depth Image when depth is enabled
  useEffect(() => {
    if (!depthEnabled || !url) return;
    const cached = getCachedSpatialLDI(url);
    if (cached) {
      setLdi(cached);
      return;
    }

    let cancelled = false;
    const triggerAutoConvert = () => {
      const el = mediaRef.current;
      if (!el || converting) return;

      // Ensure media has dimensions before processing
      const hasDims = (el as any).naturalWidth > 0 || (el as any).videoWidth > 0;
      if (!hasDims) return;

      setConverting(true);
      autoConvert2DtoSpatial(el, { assetId: url, width: 640 })
        .then((result) => {
          if (!cancelled && result) {
            setLdi(result);
          }
        })
        .catch((err) => console.warn('[SpatialMedia] Auto-depth failed:', err))
        .finally(() => {
          if (!cancelled) setConverting(false);
        });
    };

    const timer = setTimeout(triggerAutoConvert, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [depthEnabled, url]);

  // Initialize and drive WebGL DIBR GPU renderer when LDI is available
  useEffect(() => {
    if (!canvasRef.current || !ldi) {
      rendererRef.current?.dispose();
      rendererRef.current = null;
      return;
    }

    const cv = canvasRef.current;
    const renderer = new SpatialDibrRenderer(cv);
    renderer.uploadTextures(
      ldi.sourceCanvas,
      ldi.depthCanvas,
      ldi.foregroundMatte,
      ldi.backgroundPlate
    );
    rendererRef.current = renderer;

    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [ldi]);

  // Update renderer on pointer/gyroscope movement
  useEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.render({
      mode: 3, // Interactive 2.5D Parallax Window
      disparity: 0.035,
      convergence: 0.5,
      relief: 1.2,
      pointerX: pointer.x,
      pointerY: pointer.y,
    });
  }, [pointer, ldi]);

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!depthEnabled || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPointer({
      x: ((event.clientX - rect.left) / rect.width - 0.5) * 2,
      y: ((event.clientY - rect.top) / rect.height - 0.5) * 2,
    });
  };

  const onPointerLeave = () => setPointer({ x: 0, y: 0 });

  const enterVrHeadset = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!ldi) return;
    try {
      setIsXrActive(true);
      await launchStereoXrSession(ldi, undefined, () => setIsXrActive(false));
    } catch (err) {
      console.warn('[SpatialMedia] WebXR launch error:', err);
      setIsXrActive(false);
    }
  };

  if (!depthEnabled) {
    return (
      <div className={`${className} ${roundedClassName} relative overflow-hidden bg-white/5`}>
        {type === 'VIDEO' ? (
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            src={url || undefined}
            className="w-full h-full object-cover"
            controls={controls}
            autoPlay={autoPlay}
            muted={muted}
            loop={loop}
            playsInline
          />
        ) : (
          <img
            ref={mediaRef as React.RefObject<HTMLImageElement>}
            src={url || ''}
            alt={alt}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        )}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className={`${className} ${roundedClassName} group relative overflow-hidden bg-black border border-white/10 shadow-2xl`}
      style={{ transformStyle: 'preserve-3d' }}
    >
      {/* Hidden source element used for texture frames */}
      {type === 'VIDEO' ? (
        <video
          ref={mediaRef as React.RefObject<HTMLVideoElement>}
          src={url || undefined}
          className={ldi ? "hidden" : "w-full h-full object-cover"}
          controls={controls}
          autoPlay={autoPlay}
          muted={muted}
          loop={loop}
          playsInline
        />
      ) : (
        <img
          ref={mediaRef as React.RefObject<HTMLImageElement>}
          src={url || ''}
          alt={alt}
          className={ldi ? "hidden" : "w-full h-full object-cover"}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      )}

      {/* GPU DIBR WebGL Canvas */}
      {ldi && (
        <canvas
          ref={canvasRef}
          width={ldi.width}
          height={ldi.height}
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            transform: `perspective(1000px) rotateX(${-pointer.y * 3.5}deg) rotateY(${pointer.x * 3.5}deg) scale(1.02)`,
            transition: 'transform 100ms ease-out',
          }}
        />
      )}

      {/* Vignette lighting */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.08),transparent_40%),linear-gradient(to_bottom,transparent,rgba(0,0,0,0.25))]" />

      {/* Badges */}
      <div className="absolute left-3 bottom-3 px-2.5 py-1.5 bg-black/60 backdrop-blur-md border border-white/15 rounded-full flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity pointer-events-none">
        <Box size={11} className={ldi ? "text-cyan-400" : "text-amber-400 animate-pulse"} />
        <span className="text-[7.5px] font-black uppercase tracking-widest text-cyan-100">
          {ldi ? "Spatial 3D" : converting ? "Depth AI…" : "Auto Depth"}
        </span>
      </div>

      {/* WebXR Headset Button (Meta Quest / Android XR / Apple Vision Pro) */}
      {hasWebXr && ldi && (
        <button
          onClick={enterVrHeadset}
          title="View in VR Headset (Meta Quest / Android XR / Vision Pro)"
          className="absolute right-3 top-3 px-3 py-1.5 bg-cyan-500/90 hover:bg-cyan-400 text-black rounded-full flex items-center gap-1.5 text-[8px] font-black uppercase tracking-wider shadow-lg hover:scale-105 transition-all z-20"
        >
          <Eye size={12} />
          <span>ENTER 3D VR</span>
        </button>
      )}

      <div className="absolute right-3 bottom-3 w-8 h-8 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <Layers size={13} className="text-white/70" />
      </div>
    </div>
  );
});

export default SpatialMedia;
