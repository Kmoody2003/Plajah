import React, { useState, useRef, useEffect } from 'react';

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  alt?: string;
  /** Skip lazy loading for above-the-fold / LCP images */
  priority?: boolean;
}

/**
 * Drop-in <img> replacement with lazy loading and a smooth fade-in.
 * Renders a plain <img> — no wrapper div — so it slots into any layout.
 */
const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt = '',
  className = '',
  priority = false,
  style,
  onLoad,
  ...rest
}) => {
  const isInstant = Boolean(priority || src?.startsWith('data:') || src?.startsWith('blob:'));
  const [loaded, setLoaded] = useState(isInstant);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (isInstant) {
      setLoaded(true);
      return;
    }
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [src, isInstant]);

  if (!src) return null;

  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      loading={isInstant ? 'eager' : 'lazy'}
      decoding={priority ? 'sync' : 'async'}
      className={`${className} transition-opacity duration-200 ${loaded || isInstant ? 'opacity-100' : 'opacity-95'}`}
      style={style}
      onLoad={e => { setLoaded(true); onLoad?.(e); }}
      {...rest}
    />
  );
};

export default LazyImage;
