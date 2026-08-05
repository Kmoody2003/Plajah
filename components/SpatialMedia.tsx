import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Layers } from 'lucide-react';
import { useSpatial } from '../contexts/SpatialContext';

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
  const { isSpatialMode } = useSpatial();
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const depthEnabled = (forceDepth ?? isSpatialMode) && !reducedMotion;

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(Boolean(mq?.matches));
    update();
    mq?.addEventListener?.('change', update);
    return () => mq?.removeEventListener?.('change', update);
  }, []);

  const transform = useMemo(() => {
    const rotateY = clamp(pointer.x * 4, -4, 4);
    const rotateX = clamp(-pointer.y * 4, -4, 4);
    return `perspective(1100px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  }, [pointer]);

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!depthEnabled || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPointer({
      x: ((event.clientX - rect.left) / rect.width - 0.5) * 2,
      y: ((event.clientY - rect.top) / rect.height - 0.5) * 2,
    });
  };

  const onPointerLeave = () => setPointer({ x: 0, y: 0 });

  const media = (layer: 'back' | 'main' | 'front') => {
    const commonClass = `absolute inset-0 w-full h-full object-cover ${layer !== 'main' ? 'pointer-events-none' : ''}`;
    const style = layer === 'back'
      ? { transform: `translate3d(${-pointer.x * 12}px, ${-pointer.y * 12}px, -22px) scale(1.08)`, filter: 'blur(10px) saturate(0.9) brightness(0.7)', opacity: 0.42 }
      : layer === 'front'
        ? { transform: `translate3d(${pointer.x * 10}px, ${pointer.y * 10}px, 34px) scale(1.015)`, opacity: 0.2, mixBlendMode: 'screen' as const, clipPath: 'ellipse(52% 44% at 50% 42%)' }
        : { transform: `translate3d(${pointer.x * 3}px, ${pointer.y * 3}px, 12px) scale(1.01)` };

    if (type === 'VIDEO') {
      return (
        <video
          src={url || undefined}
          className={commonClass}
          style={style}
          controls={layer === 'main' ? controls : false}
          autoPlay={layer === 'main' ? autoPlay : true}
          muted={layer === 'main' ? muted : true}
          loop={loop}
          playsInline
        />
      );
    }

    return (
      <img
        src={url || ''}
        alt={layer === 'main' ? alt : ''}
        className={commonClass}
        style={style}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
      />
    );
  };

  if (!depthEnabled) {
    return (
      <div className={`${className} ${roundedClassName} relative overflow-hidden bg-white/5`}>
        {type === 'VIDEO' ? (
          <video src={url || undefined} className="w-full h-full object-cover" controls={controls} autoPlay={autoPlay} muted={muted} loop={loop} playsInline />
        ) : (
          <img src={url || ''} alt={alt} className="w-full h-full object-cover" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
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
      style={{ transformStyle: 'preserve-3d', transform, transition: 'transform 180ms ease-out' }}
    >
      <div className="absolute inset-0" style={{ transformStyle: 'preserve-3d' }}>
        {media('back')}
        {media('main')}
        {media('front')}
      </div>
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.12),transparent_34%),linear-gradient(to_bottom,transparent,rgba(0,0,0,0.18))]" />
      <div className="absolute left-3 bottom-3 px-2.5 py-1.5 bg-black/45 backdrop-blur-md border border-white/10 rounded-full flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <Box size={11} className="text-cyan-300" />
        <span className="text-[7px] font-black uppercase tracking-widest text-cyan-100">Auto Depth</span>
      </div>
      <div className="absolute right-3 bottom-3 w-8 h-8 rounded-full bg-black/35 backdrop-blur-md border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <Layers size={13} className="text-white/60" />
      </div>
    </div>
  );
});

export default SpatialMedia;
