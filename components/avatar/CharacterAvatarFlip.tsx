import React, { useEffect, useRef, useState } from 'react';

/**
 * A profile picture that alternates between the person's photo and the movie character they
 * picked as their avatar. Every 4 s (and whenever the pointer moves onto it) it swaps with a
 * green lightning-bolt flash — Miriam's lightning from Pumpkin Patch. Plain photo when no
 * character is set.
 */
interface CharacterAvatarFlipProps {
  photoUrl?: string | null;
  /** Portrait of the chosen character (Ravencrest / Pumpkin Patch cast). */
  characterUrl?: string | null;
  alt?: string;
  className?: string;
  /** Seconds between automatic swaps (0 = only on hover). */
  intervalSeconds?: number;
  /** Rendered when there is no photo (initials etc.). */
  fallback?: React.ReactNode;
}

const FLASH_MS = 520;

export const CharacterAvatarFlip: React.FC<CharacterAvatarFlipProps> = ({
  photoUrl,
  characterUrl,
  alt = '',
  className = '',
  intervalSeconds = 4,
  fallback,
}) => {
  const [showCharacter, setShowCharacter] = useState(false);
  const [flashKey, setFlashKey] = useState(0);
  const swappingRef = useRef(false);
  const lastHoverSwapRef = useRef(0);

  const swap = () => {
    if (!characterUrl || swappingRef.current) return;
    swappingRef.current = true;
    setFlashKey((k) => k + 1);
    // Swap images at the brightest point of the strike, then let the flash fade.
    window.setTimeout(() => setShowCharacter((v) => !v), FLASH_MS * 0.35);
    window.setTimeout(() => (swappingRef.current = false), FLASH_MS);
  };

  useEffect(() => {
    if (!characterUrl || !intervalSeconds) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const id = window.setInterval(swap, intervalSeconds * 1000);
    return () => window.clearInterval(id);
    // swap reads only refs/setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterUrl, intervalSeconds]);

  useEffect(() => {
    if (!characterUrl) setShowCharacter(false);
  }, [characterUrl]);

  const src = showCharacter && characterUrl ? characterUrl : photoUrl;

  return (
    <span
      className={`relative inline-block overflow-hidden ${className}`}
      onPointerEnter={swap}
      // Moving across it keeps flipping back and forth (one strike at a time, ~1 per 0.7 s).
      onPointerMove={() => {
        if (performance.now() - lastHoverSwapRef.current < 700) return;
        lastHoverSwapRef.current = performance.now();
        swap();
      }}
    >
      {src ? (
        <img src={src} alt={alt} className="w-full h-full object-cover" draggable={false} />
      ) : (
        fallback
      )}
      {characterUrl && flashKey > 0 && (
        <span key={flashKey} aria-hidden className="pointer-events-none absolute inset-0 ca-flip-flash">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
            <polyline
              points="58,-4 40,34 56,38 34,72 50,75 30,108"
              fill="none"
              stroke="#d9ffb0"
              strokeWidth="5"
              strokeLinejoin="miter"
              className="ca-flip-bolt"
            />
            <polyline
              points="58,-4 40,34 56,38 34,72 50,75 30,108"
              fill="none"
              stroke="#4ade80"
              strokeWidth="12"
              strokeLinejoin="miter"
              opacity="0.55"
              className="ca-flip-bolt ca-flip-glow"
            />
          </svg>
        </span>
      )}
      <style>{`
        .ca-flip-flash { animation: ca-flip-flash ${FLASH_MS}ms ease-out forwards; mix-blend-mode: screen;
          background: radial-gradient(circle at 45% 40%, rgba(190,255,150,.95), rgba(34,197,94,.55) 45%, rgba(20,83,45,0) 75%); }
        .ca-flip-bolt { animation: ca-flip-bolt ${FLASH_MS}ms steps(1, end) forwards; }
        .ca-flip-glow { filter: blur(2px); }
        @keyframes ca-flip-flash { 0% { opacity: 0 } 18% { opacity: 1 } 30% { opacity: .35 } 42% { opacity: .95 } 100% { opacity: 0 } }
        @keyframes ca-flip-bolt { 0% { opacity: 1 } 20% { opacity: 0 } 32% { opacity: 1 } 60% { opacity: 0 } 100% { opacity: 0 } }
        @media (prefers-reduced-motion: reduce) { .ca-flip-flash, .ca-flip-bolt { animation-duration: 1ms } }
      `}</style>
    </span>
  );
};
