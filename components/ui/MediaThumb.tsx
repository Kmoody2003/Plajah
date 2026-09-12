/**
 * MediaThumb — a video/cover thumbnail that never distorts or over-crops its source.
 *
 * Reello cards are 16:9. A 9:16 phone clip dropped into one and rendered with
 * `object-cover` gets scaled ~3x and cropped to a sliver — which is how vertical
 * uploads ended up as blown-out, unflattering close-ups of people's faces.
 *
 * So: crop (object-cover) while the source is at least as wide as its frame, and
 * as soon as it is meaningfully narrower, letterbox it (object-contain) over a
 * blurred, scaled copy of itself. The vertical frame keeps its real shape and the
 * card still reads as a filled rectangle.
 *
 * Orientation is measured from the decoded image, not guessed from metadata, so
 * it works for Mux stills, uploaded posters and external URLs alike.
 */
import React, { useCallback, useRef, useState } from 'react';
import ThreeDImage from '../ThreeDImage';

/** A source only a hair narrower than its frame still crops cleanly — don't letterbox 16:10 in 16:9. */
const NARROW_TOLERANCE = 0.92;

/**
 * Frames wider than 16:9 (cinematic banners, hero strips) are compared as if they were
 * 16:9, so an ordinary widescreen still keeps filling them edge to edge. Only genuinely
 * tall sources — phone video — trip the letterbox.
 */
const MAX_FRAME_AR = 16 / 9;

const FIT_CLASS = { cover: 'object-cover', contain: 'object-contain' } as const;

export interface MediaThumbProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onLoad'> {
  src?: string | null;
  alt?: string;
  /** Classes for the foreground image — hover transforms and transitions belong here. */
  className?: string;
  /** Extra classes for the frame-filling wrapper. */
  containerClassName?: string;
  /** 'auto' (default) decides per image; 'contain' always letterboxes; 'cover' always crops. */
  fit?: 'auto' | 'cover' | 'contain';
  /** Route the foreground through ThreeDImage, for surfaces that opt into the parallax tilt. */
  threeD?: boolean;
  /** Rendered instead of the image when there is no src. */
  fallback?: React.ReactNode;
  onLoad?: React.ReactEventHandler<HTMLImageElement>;
}

const MediaThumb: React.FC<MediaThumbProps> = ({
  src,
  alt = '',
  className = '',
  containerClassName = '',
  fit = 'auto',
  threeD = false,
  fallback = null,
  onLoad,
  ...imgProps
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  // Keyed by src so a recycled card doesn't inherit the previous clip's orientation.
  const [narrowSrc, setNarrowSrc] = useState<string | null>(null);

  const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const { naturalWidth: iw, naturalHeight: ih } = img;
    if (iw && ih) {
      const box = boxRef.current?.getBoundingClientRect();
      // A hidden/unlaid-out card measures 0 — fall back to the 16:9 frame these cards use.
      const measured = box && box.width > 0 && box.height > 0 ? box.width / box.height : MAX_FRAME_AR;
      const frameAR = Math.min(measured, MAX_FRAME_AR);
      setNarrowSrc(iw / ih < frameAR * NARROW_TOLERANCE ? (src ?? null) : null);
    }
    onLoad?.(e);
  }, [src, onLoad]);

  const letterbox = fit === 'contain' || (fit === 'auto' && !!src && narrowSrc === src);
  const fitClass = FIT_CLASS[letterbox ? 'contain' : 'cover'];

  return (
    <div ref={boxRef} className={`absolute inset-0 overflow-hidden ${containerClassName}`}>
      {!src && fallback}

      {/* Blurred fill — the same frame, scaled past the edges so the blur has pixels to pull from. */}
      {src && letterbox && (
        <>
          <img
            src={src}
            alt=""
            aria-hidden
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl saturate-150 opacity-60"
          />
          <div className="absolute inset-0 bg-black/30" />
        </>
      )}

      {src && (
        threeD
          ? (
            <ThreeDImage
              src={src}
              alt={alt}
              fit={letterbox ? 'contain' : 'cover'}
              containerClassName="w-full h-full"
              className={`relative w-full h-full ${fitClass} ${className}`}
              onLoad={handleLoad}
              {...(imgProps as any)}
            />
          )
          : (
            <img
              src={src}
              alt={alt}
              onLoad={handleLoad}
              referrerPolicy="no-referrer"
              className={`relative w-full h-full ${fitClass} ${className}`}
              {...imgProps}
            />
          )
      )}
    </div>
  );
};

export default MediaThumb;
