// 3D book opening scene — CSS perspective + Framer Motion
// Entry gate for BookReader: book rises off table, cover flips open, then reader starts
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  coverImage?: string;
  title: string;
  author?: string;
  onBeginReading: () => void;
}

type Phase = 0 | 1 | 2 | 3 | 4;
//  0 = on table (initial)
//  1 = rising
//  2 = facing viewer
//  3 = cover opening
//  4 = fully open + CTA

export const BookOpeningScene: React.FC<Props> = ({ coverImage, title, author, onBeginReading }) => {
  const [phase, setPhase] = useState<Phase>(0);
  const [coverAngle, setCoverAngle] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 400);
    const t2 = setTimeout(() => setPhase(2), 1100);
    const t3 = setTimeout(() => { setPhase(3); setCoverAngle(-90); }, 1900);
    const t4 = setTimeout(() => { setPhase(4); setCoverAngle(-178); }, 2800);
    return () => [t1, t2, t3, t4].forEach(clearTimeout);
  }, []);

  const isOpen = phase >= 3;

  // Scene-level book transform per phase
  const bookTransform = [
    'perspective(900px) rotateX(18deg) rotateY(-28deg) translateY(80px) scale(0.92)',
    'perspective(900px) rotateX(18deg) rotateY(-28deg) translateY(-20px) scale(0.95)',
    'perspective(900px) rotateX(6deg)  rotateY(-6deg)  translateY(-20px) scale(1)',
    'perspective(900px) rotateX(6deg)  rotateY(-6deg)  translateY(-20px) scale(1)',
    'perspective(900px) rotateX(6deg)  rotateY(-6deg)  translateY(-20px) scale(1)',
  ][phase];

  const coverBg = coverImage
    ? `url(${coverImage}) center/cover no-repeat`
    : 'linear-gradient(145deg, #7A2E1A 0%, #4E1A0B 100%)';

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center select-none"
      style={{ background: 'radial-gradient(ellipse at 50% 30%, #140e1a 0%, #090608 100%)' }}
    >
      {/* Skip */}
      <button
        onClick={onBeginReading}
        className="absolute top-5 right-5 text-[8px] font-black uppercase tracking-[0.35em] text-white/25 hover:text-white/55 transition-colors z-10"
      >
        Skip →
      </button>

      {/* ── 3D scene container ── */}
      <div className="relative flex items-center justify-center" style={{ width: 500, height: 420 }}>

        {/* Table surface (perspective plane at bottom) */}
        <div
          className="absolute bottom-0 left-0 right-0 pointer-events-none"
          style={{
            height: 120,
            background: 'linear-gradient(180deg, #3c1f0c 0%, #271508 55%, #130a04 100%)',
            transform: 'perspective(600px) rotateX(72deg)',
            transformOrigin: 'bottom center',
            boxShadow: '0 -12px 60px rgba(120,60,20,0.12)',
          }}
        />

        {/* Table edge highlight */}
        <div
          className="absolute pointer-events-none"
          style={{
            bottom: 0, left: 20, right: 20, height: 3,
            background: 'linear-gradient(90deg, transparent 0%, rgba(180,100,40,0.25) 30%, rgba(180,100,40,0.25) 70%, transparent 100%)',
            borderRadius: 2,
          }}
        />

        {/* Shadow under book */}
        <div
          className="absolute pointer-events-none transition-all duration-700"
          style={{
            bottom: 22,
            left: '50%',
            transform: `translateX(-50%) scaleX(${isOpen ? 1.8 : 1})`,
            width: 200,
            height: 28,
            background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.65) 0%, transparent 70%)',
            filter: 'blur(6px)',
          }}
        />

        {/* ── Book ── */}
        <div
          className="absolute"
          style={{
            transformStyle: 'preserve-3d',
            transform: bookTransform,
            transition: phase === 0
              ? 'width 0.8s cubic-bezier(0.33, 1, 0.68, 1)'
              : 'transform 0.85s cubic-bezier(0.33, 1, 0.68, 1), width 0.8s cubic-bezier(0.33, 1, 0.68, 1)',
            width: isOpen ? 440 : 220,
          }}
        >
          {/* Left page — revealed after cover opens */}
          <AnimatePresence>
            {isOpen && (
              <motion.div
                key="left-page"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.45, delay: 0.25 }}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: 220,
                  height: 300,
                  background: 'linear-gradient(160deg, #f5e6c0 0%, #e8d49a 100%)',
                  borderRadius: '3px 0 0 3px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 28,
                  boxShadow: 'inset -10px 0 20px rgba(0,0,0,0.07), inset -1px 0 0 rgba(0,0,0,0.12)',
                }}
              >
                <div style={{ textAlign: 'center', maxWidth: '100%' }}>
                  {author && (
                    <p style={{ fontSize: 7, fontWeight: 900, letterSpacing: '0.35em', color: '#7a4820', marginBottom: 12, textTransform: 'uppercase' }}>
                      {author}
                    </p>
                  )}
                  <div style={{ width: 36, height: 1, background: '#7a4820', opacity: 0.35, margin: '0 auto 14px' }} />
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#3a1e0a', fontFamily: 'Georgia, serif', lineHeight: 1.5, wordBreak: 'break-word' }}>
                    {title}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Right side — cover (rotating) + right page interior */}
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              width: 220,
              height: 300,
              transformStyle: 'preserve-3d',
              transformOrigin: 'left center',
              transform: `rotateY(${coverAngle}deg)`,
              transition: 'transform 0.95s cubic-bezier(0.33, 1, 0.68, 1)',
            }}
          >
            {/* Front cover face */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                borderRadius: phase < 3 ? 4 : '0 4px 4px 0',
                overflow: 'hidden',
                background: coverBg,
                boxShadow: '8px 0 32px rgba(0,0,0,0.55), 2px 0 0 rgba(0,0,0,0.2)',
              }}
            >
              {!coverImage && (
                <div style={{ padding: 28, display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                  {author && (
                    <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: '0.2em', color: 'rgba(255,200,150,0.55)', textTransform: 'uppercase' }}>
                      {author}
                    </p>
                  )}
                  <p style={{ fontSize: 18, fontWeight: 900, color: '#FFD4A0', fontFamily: 'Georgia, serif', lineHeight: 1.35 }}>
                    {title}
                  </p>
                  <div style={{ width: 28, height: 2, background: 'rgba(255,200,120,0.3)', borderRadius: 1 }} />
                </div>
              )}
            </div>

            {/* Inside of cover (back face, revealed when open) */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
                background: 'linear-gradient(160deg, #f5e6c0 0%, #e8d49a 100%)',
                borderRadius: '3px 0 0 3px',
                boxShadow: 'inset 6px 0 16px rgba(0,0,0,0.06)',
              }}
            />
          </div>

          {/* Spine (only visible when book is closed) */}
          {!isOpen && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: 22,
                height: 300,
                background: 'linear-gradient(90deg, #3a1208 0%, #6b2a1e 40%, #3a1208 100%)',
                transform: 'rotateY(-90deg) translateZ(0)',
                transformOrigin: 'right center',
                borderRadius: '4px 0 0 4px',
                boxShadow: '-4px 0 12px rgba(0,0,0,0.5)',
              }}
            />
          )}

          {/* Pages edge (right side when closed) */}
          {!isOpen && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: 2,
                width: 16,
                height: 296,
                background: 'linear-gradient(90deg, #e8d9b0 0%, #f0e4c0 50%, #e2d0a0 100%)',
                transform: 'rotateY(90deg)',
                transformOrigin: 'left center',
              }}
            />
          )}

          {/* Book top face */}
          {!isOpen && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 2,
                right: 2,
                height: 22,
                background: 'linear-gradient(180deg, #e8d9b0 0%, #d4c49a 100%)',
                transform: 'rotateX(90deg)',
                transformOrigin: 'top center',
              }}
            />
          )}
        </div>
      </div>

      {/* CTA — appears after book is fully open */}
      <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <AnimatePresence>
          {phase === 4 && (
            <motion.div
              key="cta"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="flex flex-col items-center gap-4"
            >
              <p className="text-[7px] font-black uppercase tracking-[0.5em] text-white/25">
                Ready to read
              </p>
              <button
                onClick={onBeginReading}
                className="px-10 py-3 text-[9px] font-black uppercase tracking-[0.3em] rounded-full transition-all"
                style={{
                  background: 'linear-gradient(135deg, #7A2E1A 0%, #9B3D25 100%)',
                  color: '#FFD4A0',
                  boxShadow: '0 8px 32px rgba(122,46,26,0.4)',
                }}
                onMouseEnter={e => ((e.target as HTMLElement).style.boxShadow = '0 12px 40px rgba(122,46,26,0.6)')}
                onMouseLeave={e => ((e.target as HTMLElement).style.boxShadow = '0 8px 32px rgba(122,46,26,0.4)')}
              >
                Begin Reading
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default BookOpeningScene;
