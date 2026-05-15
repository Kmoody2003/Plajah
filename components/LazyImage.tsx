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
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) setLoaded(true);
  }, [src]);

  if (!src) return null;

  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding={priority ? 'sync' : 'async'}
      className={`${className} transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      style={style}
      onLoad={e => { setLoaded(true); onLoad?.(e); }}
      {...rest}
    />
  );
};

export default LazyImage;
