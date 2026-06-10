// BookOpeningScene — stable CSS overlay that masks the reader while it loads,
// then fades away to reveal the reader at the last-read position.
// Replaces the previous canvas/MP4/RAF compositing approach.

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  coverImage?: string;
  title: string;
  author?: string;
  onBeginReading: () => void;
  chapterTitle?: string;
  pageIndex?: number;      // 0-based; shown as "Page X"
  resuming?: boolean;      // true when opening to a saved position
}

const HOLD_MS  = 1800; // how long the cover is shown before auto-dismiss
const FADE_MS  =  400; // CSS fade-out duration

export const BookOpeningScene: React.FC<Props> = ({
  coverImage,
  title,
  author,
  onBeginReading,
  chapterTitle,
  pageIndex,
  resuming = false,
}) => {
  const [dismissed, setDismissed] = useState(false);
  const calledRef  = useRef(false);
  const holdTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = () => {
    if (calledRef.current) return;
    calledRef.current = true;
    setDismissed(true);
    // Call after fade duration
    fadeTimer.current = setTimeout(onBeginReading, FADE_MS + 50);
  };

  useEffect(() => {
    holdTimer.current = setTimeout(dismiss, HOLD_MS);
    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showResume = resuming && (chapterTitle || (pageIndex !== undefined && pageIndex > 0));

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          key="book-scene"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: FADE_MS / 1000, ease: 'easeInOut' }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: '#111',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 24,
            padding: 32,
          }}
        >
          {/* Book cover */}
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: 'relative',
              width: Math.min(220, window.innerWidth * 0.45),
              aspectRatio: '2/3',
              borderRadius: 12,
              overflow: 'hidden',
              boxShadow: '0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)',
              background: '#1e1a15',
              flexShrink: 0,
            }}
          >
            {coverImage ? (
              <img
                src={coverImage}
                alt={title}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              /* Fallback leather-look cover */
              <div style={{
                width: '100%', height: '100%',
                background: 'linear-gradient(160deg, #7a2e1a 0%, #4e1a0b 55%, #3a1208 100%)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: 20, textAlign: 'center',
              }}>
                <div style={{ color: 'rgba(255,210,140,0.85)', fontFamily: 'Georgia, serif', fontSize: 15, fontWeight: 700, lineHeight: 1.4 }}>
                  {title}
                </div>
                {author && (
                  <div style={{ color: 'rgba(255,190,110,0.45)', fontFamily: 'Georgia, serif', fontSize: 10, marginTop: 12 }}>
                    {author}
                  </div>
                )}
              </div>
            )}

            {/* Spine shadow */}
            <div style={{
              position: 'absolute', left: 0, top: 0, width: 18, height: '100%',
              background: 'linear-gradient(90deg,rgba(0,0,0,0.35),transparent)',
              pointerEvents: 'none',
            }} />
            {/* Bottom vignette */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: '30%',
              background: 'linear-gradient(transparent,rgba(0,0,0,0.5))',
              pointerEvents: 'none',
            }} />
          </motion.div>

          {/* Title + resume info */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            style={{ textAlign: 'center', maxWidth: 300 }}
          >
            <p style={{
              color: 'rgba(255,255,255,0.85)',
              fontFamily: 'Georgia, serif',
              fontSize: 16,
              fontWeight: 700,
              lineHeight: 1.35,
              marginBottom: 6,
            }}>
              {title}
            </p>
            {author && (
              <p style={{
                color: 'rgba(255,255,255,0.3)',
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: '0.05em',
                marginBottom: 10,
              }}>
                {author}
              </p>
            )}

            {showResume ? (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px',
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  {chapterTitle ? `Continuing — ${chapterTitle}` : `Continuing — Page ${(pageIndex ?? 0) + 1}`}
                </span>
              </div>
            ) : (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px',
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  Opening book…
                </span>
              </div>
            )}
          </motion.div>

          {/* Progress bar */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            style={{ width: Math.min(200, window.innerWidth * 0.5) }}
          >
            <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
              <motion.div
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: HOLD_MS / 1000 - 0.1, ease: 'linear', delay: 0.1 }}
                style={{ height: '100%', background: 'rgba(255,255,255,0.25)', borderRadius: 2 }}
              />
            </div>
          </motion.div>

          {/* Skip / Begin reading */}
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            onClick={dismiss}
            style={{
              position: 'absolute', top: 16, right: 16,
              background: 'none', border: 'none',
              color: 'rgba(255,255,255,0.18)',
              fontSize: 8, fontWeight: 900,
              letterSpacing: '0.35em', textTransform: 'uppercase',
              cursor: 'pointer', padding: '8px 14px',
              transition: 'color 0.2s',
            }}
            onMouseEnter={e => ((e.target as HTMLElement).style.color = 'rgba(255,255,255,0.5)')}
            onMouseLeave={e => ((e.target as HTMLElement).style.color = 'rgba(255,255,255,0.18)')}
          >
            Skip →
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
