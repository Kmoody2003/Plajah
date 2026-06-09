// Cinematic book opening sequence
// Phase 0 → book closed on table, 3/4 angle
// Phase 1 → book rises off table
// Phase 2 → cover flips open
// Phase 3 → book descends flat/open back onto table
// Phase 4 → camera tilts to overhead view
// Phase 5 → fade to black → hand off to reader
import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';

interface Props {
  coverImage?: string;
  title: string;
  author?: string;
  onBeginReading: () => void;
}

type Phase = 0 | 1 | 2 | 3 | 4 | 5;

// Easing strings reused across transitions
const EASE_CINEMATIC = 'cubic-bezier(0.33, 1, 0.68, 1)';
const EASE_SETTLE    = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

const BOOK_W     = 220;
const BOOK_H     = 300;
const BOOK_DEPTH = 26;

export const BookOpeningScene: React.FC<Props> = ({ coverImage, title, author, onBeginReading }) => {
  const [phase, setPhase] = useState<Phase>(0);

  useEffect(() => {
    const t: ReturnType<typeof setTimeout>[] = [
      setTimeout(() => setPhase(1), 500),   // rise
      setTimeout(() => setPhase(2), 1250),  // cover opens
      setTimeout(() => setPhase(3), 2400),  // descend flat, open
      setTimeout(() => setPhase(4), 3200),  // camera overhead
      setTimeout(() => setPhase(5), 4400),  // fade out
      setTimeout(onBeginReading, 5300),     // hand off
    ];
    return () => t.forEach(clearTimeout);
  }, [onBeginReading]);

  const isOpen   = phase >= 2;
  const isClosed = phase < 2;

  // ── Book motion values per phase ────────────────────────────────────────────
  // translateY: negative = rising in scene space
  const bookY: Record<Phase, number> = { 0: 0, 1: -145, 2: -125, 3: 0, 4: 0, 5: 0 };
  // rotateY on whole book: adds slight angle before fully opening
  const bookRY: Record<Phase, number> = { 0: -32, 1: -28, 2: -14, 3: 0, 4: 0, 5: 0 };
  // rotateY on the cover: 0 = closed, -175 = fully open
  const coverRY: Record<Phase, number> = { 0: 0, 1: 0, 2: -175, 3: -175, 4: -175, 5: -175 };
  // Stage rotateX simulates camera angle: ~22° = 3/4, ~72° = overhead
  const stageRX: Record<Phase, number> = { 0: 22, 1: 22, 2: 22, 3: 22, 4: 70, 5: 70 };

  // Shadow blur/opacity grows when book is airborne
  const isAirborne = phase === 1 || phase === 2;
  const shadowBlur = isAirborne ? 28 : 10;
  const shadowSpread = isAirborne ? 0.35 : 0.55;

  const coverBg = coverImage
    ? `url(${coverImage}) center/cover no-repeat`
    : 'linear-gradient(145deg, #7a2e1a 0%, #4e1a0b 55%, #3a1208 100%)';

  const bookTransition = `transform 0.9s ${EASE_CINEMATIC}, width 0.85s ${EASE_SETTLE}`;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        // Deep interior scene, warm amber from above
        background: `
          radial-gradient(ellipse 70% 40% at 50% 0%, rgba(255,190,80,0.06) 0%, transparent 100%),
          radial-gradient(ellipse at 50% 30%, #18100e 0%, #0c0708 45%, #080506 100%)
        `,
        overflow: 'hidden',
      }}
    >
      {/* Skip */}
      <button
        onClick={onBeginReading}
        style={{
          position: 'absolute', top: 18, right: 18, zIndex: 10,
          fontSize: 8, fontWeight: 900, letterSpacing: '0.35em',
          color: 'rgba(255,255,255,0.18)', textTransform: 'uppercase',
          background: 'none', border: 'none', cursor: 'pointer', padding: '8px 12px',
          transition: 'color 0.2s',
        }}
        onMouseEnter={e => ((e.target as HTMLElement).style.color = 'rgba(255,255,255,0.5)')}
        onMouseLeave={e => ((e.target as HTMLElement).style.color = 'rgba(255,255,255,0.18)')}
      >
        Skip →
      </button>

      {/* ── Perspective container ── */}
      <div
        style={{
          perspective: '1100px',
          perspectiveOrigin: `50% ${phase >= 4 ? '20%' : '52%'}`,
          transition: `perspective-origin 1.5s ${EASE_CINEMATIC}`,
          width: 720, height: 520,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Stage — rotates to tilt camera */}
        <div
          style={{
            transformStyle: 'preserve-3d',
            transform: `rotateX(${stageRX[phase]}deg) ${phase >= 4 ? 'scale(1.08)' : ''}`,
            transition: `transform 1.5s ${EASE_CINEMATIC}`,
            width: 720, height: 520,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >

          {/* ── Table surface (mahogany wood) ── */}
          <div
            style={{
              position: 'absolute',
              left: -160, right: -160,
              top: 80, bottom: -300,
              // Multi-layer wood grain
              background: `
                repeating-linear-gradient(
                  88.5deg,
                  transparent 0px, transparent 10px,
                  rgba(255,255,255,0.013) 10px, rgba(255,255,255,0.013) 11px,
                  transparent 11px, transparent 30px,
                  rgba(0,0,0,0.05) 30px, rgba(0,0,0,0.05) 31px,
                  transparent 31px, transparent 55px,
                  rgba(255,255,255,0.007) 55px, rgba(255,255,255,0.007) 56px
                ),
                repeating-linear-gradient(
                  91deg,
                  transparent 0px, transparent 60px,
                  rgba(0,0,0,0.03) 60px, rgba(0,0,0,0.03) 61px
                ),
                linear-gradient(180deg,
                  #5c3218 0%, #4a2710 20%,
                  #3d200e 45%, #2e1809 65%,
                  #1e1005 80%, #160c04 100%
                )
              `,
              borderTop: '1px solid rgba(255,185,100,0.07)',
            }}
          />

          {/* Table specular sheen */}
          <div
            style={{
              position: 'absolute',
              left: -160, right: -160,
              top: 80, height: 100,
              background: 'linear-gradient(180deg, rgba(255,210,140,0.055) 0%, transparent 100%)',
              pointerEvents: 'none',
            }}
          />

          {/* Lamp cone of light on table (overhead reveal) */}
          {phase >= 4 && (
            <div
              style={{
                position: 'absolute',
                top: 80, left: '50%',
                transform: 'translateX(-50%)',
                width: 520, height: 400,
                background: 'radial-gradient(ellipse at 50% 0%, rgba(255,210,130,0.09) 0%, transparent 65%)',
                pointerEvents: 'none',
                transition: 'opacity 1s ease',
              }}
            />
          )}

          {/* Book cast shadow */}
          <div
            style={{
              position: 'absolute',
              // Positioned at the table-book contact point
              top: '50%',
              left: '50%',
              width: isOpen ? 460 : 240,
              height: isOpen ? 280 : 220,
              marginLeft: isOpen ? -230 : -120,
              marginTop: -20,
              borderRadius: '50%',
              background: `radial-gradient(ellipse at center, rgba(0,0,0,${shadowSpread}) 0%, transparent 70%)`,
              filter: `blur(${shadowBlur}px)`,
              transition: `width 0.85s ${EASE_SETTLE}, height 0.85s ${EASE_SETTLE}, filter 0.85s ease, background 0.85s ease`,
              pointerEvents: 'none',
              transform: `translateY(${isAirborne ? -bookY[phase] * 0.25 : 0}px)`,
            }}
          />

          {/* ── Book ── */}
          <div
            style={{
              transformStyle: 'preserve-3d',
              transform: `rotateY(${bookRY[phase]}deg) translateY(${bookY[phase]}px)`,
              transition: phase === 0 ? 'none' : bookTransition,
              position: 'absolute',
              // Width expands when book opens (right page joins left)
              width: isOpen ? BOOK_W * 2 : BOOK_W,
              height: BOOK_H,
            }}
          >

            {/* ── Left page (interior, shown when open) ── */}
            {isOpen && (
              <motion.div
                key="left-page"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.55, delay: 0.35 }}
                style={{
                  position: 'absolute',
                  left: 0, top: 0,
                  width: BOOK_W, height: BOOK_H,
                  borderRadius: '3px 0 0 3px',
                  overflow: 'hidden',
                  // Aged cream paper with ruled lines
                  background: `
                    repeating-linear-gradient(
                      180deg,
                      transparent 0px, transparent 21px,
                      rgba(110,75,35,0.09) 21px, rgba(110,75,35,0.09) 22px
                    ),
                    linear-gradient(162deg, #f9eedb 0%, #f0e2c2 55%, #e8d5ac 100%)
                  `,
                  boxShadow: `
                    inset -14px 0 28px rgba(0,0,0,0.07),
                    inset -1px 0 0 rgba(0,0,0,0.14)
                  `,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '36px 22px',
                }}
              >
                <div style={{ textAlign: 'center', maxWidth: 168 }}>
                  <div style={{ width: 28, height: 1, background: 'rgba(90,55,20,0.28)', margin: '0 auto 18px' }} />
                  {author && (
                    <p style={{
                      fontSize: 6.5, fontWeight: 900, letterSpacing: '0.35em',
                      color: '#7a4820', marginBottom: 12, textTransform: 'uppercase',
                    }}>
                      {author}
                    </p>
                  )}
                  <p style={{
                    fontSize: 14, fontWeight: 600, color: '#3a1e0a',
                    fontFamily: 'Georgia, "Times New Roman", serif',
                    lineHeight: 1.6, wordBreak: 'break-word',
                  }}>
                    {title}
                  </p>
                  <div style={{ width: 28, height: 1, background: 'rgba(90,55,20,0.28)', margin: '18px auto 0' }} />
                </div>
              </motion.div>
            )}

            {/* ── Cover + right page (rotates to open) ── */}
            <div
              style={{
                position: 'absolute',
                right: 0, top: 0,
                width: BOOK_W, height: BOOK_H,
                transformStyle: 'preserve-3d',
                transformOrigin: 'left center',
                transform: `rotateY(${coverRY[phase]}deg)`,
                transition: `transform 1.05s ${EASE_CINEMATIC}`,
              }}
            >
              {/* Front cover face */}
              <div
                style={{
                  position: 'absolute', inset: 0,
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  borderRadius: isClosed ? '2px 5px 5px 2px' : '0 5px 5px 0',
                  background: coverBg,
                  overflow: 'hidden',
                  // Layered leather-like depth
                  boxShadow: `
                    10px 0 36px rgba(0,0,0,0.55),
                    3px  0 0   rgba(0,0,0,0.22),
                    inset -3px 0 10px rgba(0,0,0,0.18),
                    inset 0 -3px 10px rgba(0,0,0,0.12),
                    inset 0 1px 1px rgba(255,255,255,0.05)
                  `,
                }}
              >
                {/* Cover gloss overlay */}
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  background: `
                    linear-gradient(
                      135deg,
                      rgba(255,255,255,0.09) 0%,
                      transparent 40%,
                      rgba(0,0,0,0.08) 100%
                    )
                  `,
                }} />
                {/* Embossed border frame */}
                <div style={{
                  position: 'absolute', inset: 10,
                  border: '1px solid rgba(255,200,120,0.10)',
                  borderRadius: 2, pointerEvents: 'none',
                }} />
                {!coverImage && (
                  <div style={{
                    padding: 28, height: '100%', display: 'flex',
                    flexDirection: 'column', justifyContent: 'space-between',
                  }}>
                    <p style={{
                      fontSize: 7, fontWeight: 900, letterSpacing: '0.2em',
                      color: 'rgba(255,200,150,0.5)', textTransform: 'uppercase',
                    }}>
                      {author}
                    </p>
                    <p style={{
                      fontSize: 19, fontWeight: 900, color: '#FFD4A0',
                      fontFamily: 'Georgia, serif', lineHeight: 1.35,
                    }}>
                      {title}
                    </p>
                    <div style={{ width: 24, height: 2, background: 'rgba(255,190,100,0.25)', borderRadius: 1 }} />
                  </div>
                )}
              </div>

              {/* Back of cover (inner side, cream) — visible when fully open */}
              <div
                style={{
                  position: 'absolute', inset: 0,
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)',
                  borderRadius: '0 3px 3px 0',
                  background: `
                    repeating-linear-gradient(
                      180deg,
                      transparent 0px, transparent 21px,
                      rgba(110,75,35,0.09) 21px, rgba(110,75,35,0.09) 22px
                    ),
                    linear-gradient(162deg, #f9eedb 0%, #f0e2c2 55%, #e8d5ac 100%)
                  `,
                  boxShadow: 'inset 8px 0 18px rgba(0,0,0,0.05)',
                }}
              />
            </div>

            {/* ── Spine (only when closed) ── */}
            {isClosed && (
              <div
                style={{
                  position: 'absolute',
                  left: -BOOK_DEPTH, top: 0,
                  width: BOOK_DEPTH, height: BOOK_H,
                  background: `
                    linear-gradient(90deg,
                      #200c04 0%, #5a1e10 28%, #7a2e1a 55%,
                      #5a1e10 78%, #1e0a04 100%
                    )
                  `,
                  transform: 'rotateY(-90deg)',
                  transformOrigin: 'right center',
                  borderRadius: '5px 0 0 5px',
                  boxShadow: '-8px 0 24px rgba(0,0,0,0.55)',
                  overflow: 'hidden',
                }}
              >
                <div style={{ position: 'absolute', top: 18, left: 5, right: 5, height: 1, background: 'rgba(255,180,100,0.13)' }} />
                <div style={{ position: 'absolute', bottom: 18, left: 5, right: 5, height: 1, background: 'rgba(255,180,100,0.13)' }} />
                {/* Vertical gold rule */}
                <div style={{ position: 'absolute', top: 18, bottom: 18, left: '50%', width: 1, background: 'rgba(255,180,100,0.07)', transform: 'translateX(-50%)' }} />
              </div>
            )}

            {/* ── Page edges (right face, closed) ── */}
            {isClosed && (
              <div
                style={{
                  position: 'absolute',
                  right: 0, top: 2,
                  width: BOOK_DEPTH, height: BOOK_H - 4,
                  transform: 'rotateY(90deg)',
                  transformOrigin: 'left center',
                  background: `
                    repeating-linear-gradient(
                      180deg,
                      transparent 0px, transparent 1.8px,
                      rgba(0,0,0,0.045) 1.8px, rgba(0,0,0,0.045) 2.4px
                    ),
                    linear-gradient(90deg, #d2c090 0%, #e8d9b0 35%, #f4e9cc 65%, #e4d5aa 100%)
                  `,
                }}
              />
            )}

            {/* ── Book top face (closed) ── */}
            {isClosed && (
              <div
                style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0,
                  height: BOOK_DEPTH,
                  transform: 'rotateX(90deg)',
                  transformOrigin: 'top center',
                  background: 'linear-gradient(180deg, #eadba8 0%, #d0c090 100%)',
                }}
              />
            )}
          </div>{/* /Book */}
        </div>{/* /Stage */}
      </div>{/* /Perspective container */}

      {/* ── Fade-out overlay ── */}
      <motion.div
        animate={{ opacity: phase >= 5 ? 1 : 0 }}
        transition={{ duration: 0.85, ease: 'easeIn' }}
        style={{
          position: 'absolute', inset: 0,
          background: '#080506',
          zIndex: 50,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};

export default BookOpeningScene;
