import React, { useEffect, useRef, useState } from 'react';
import { gridSrc } from '../../services/imageDerivatives';
import { heroImage, thumb, onThumbError } from '../../src/lib/imageThumb';

type Source = { url?: string; thumbUrl?: string; coverImage?: string; coverThumb?: string } | null | undefined;

export interface FastImageProps {
  /** A record carrying url/thumbUrl (photo) or coverImage/coverThumb (album); or pass raw `src`. */
  item?: Source;
  src?: string | null;
  /** 'grid' = first-party 320px WebP (else CDN thumb); 'hero' = ~1600px for lightbox/TV/backgrounds. */
  variant?: 'grid' | 'hero';
  width?: number;
  alt?: string;
  className?: string;
  /** Above the fold / TV-focused: fetch eagerly at high priority. */
  priority?: boolean;
}

/**
 * The one way to show a user image fast. Prefers the first-party WebP derivative written at upload
 * (no third-party hop), otherwise a resized CDN variant; decodes off-thread and fades in whole, so
 * grids never paint "garage door" strips. Parent must be `relative` with a defined size.
 */
export const FastImage: React.FC<FastImageProps> = ({ item, src, variant = 'grid', width = 320, alt = '', className = '', priority }) => {
  const original = src ?? item?.url ?? item?.coverImage ?? '';
  const first = item ? (item.thumbUrl || item.coverThumb) : undefined;
  const url = variant === 'hero'
    ? heroImage(original)
    : (first && width <= 320 ? first : thumb(gridSrc(item as any) || original, width));
  const [ready, setReady] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setReady(false);
    const el = ref.current;
    if (!el || !url) return;
    if (el.complete && el.naturalWidth > 0) { setReady(true); return; }
    let live = true;
    el.decode?.().then(() => live && setReady(true)).catch(() => live && setReady(true));
    return () => { live = false; };
  }, [url]);

  return (
    <img
      ref={ref}
      src={url || undefined}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      {...(priority ? { fetchPriority: 'high' as const } : {})}
      onLoad={() => setReady(true)}
      onError={onThumbError(original)}
      className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${className}`}
      style={ready ? undefined : { opacity: 0 }}
    />
  );
};

export default FastImage;
