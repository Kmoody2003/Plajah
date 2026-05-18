import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Star, Sparkles } from 'lucide-react';

// ── Confetti particle ─────────────────────────────────────────────────────────

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  shape: 'rect' | 'circle' | 'star';
  size: number;
  opacity: number;
}

const COLORS = ['#FF8C00', '#FF4081', '#7C4DFF', '#00BCD4', '#FFD600', '#69F0AE', '#FF6D00', '#E040FB'];

function spawnParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: -10,
    vx: (Math.random() - 0.5) * 3,
    vy: Math.random() * 4 + 2,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 8,
    shape: (['rect', 'circle', 'star'] as const)[Math.floor(Math.random() * 3)],
    size: Math.random() * 8 + 4,
    opacity: 1,
  }));
}

function ConfettiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>(spawnParticles(180));
  const raf = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.current = particles.current
        .map(p => ({
          ...p,
          x: p.x + p.vx * 0.6,
          y: p.y + p.vy * 0.6,
          vy: p.vy + 0.07,
          rotation: p.rotation + p.rotationSpeed,
          opacity: p.y > 110 ? Math.max(0, p.opacity - 0.015) : p.opacity,
        }))
        .filter(p => p.opacity > 0);

      for (const p of particles.current) {
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        const px = (p.x / 100) * canvas.width;
        const py = (p.y / 100) * canvas.height;
        ctx.translate(px, py);
        ctx.rotate((p.rotation * Math.PI) / 180);

        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // 5-pointed star
          ctx.beginPath();
          for (let i = 0; i < 10; i++) {
            const r = i % 2 === 0 ? p.size / 2 : p.size / 5;
            const angle = (i * Math.PI) / 5 - Math.PI / 2;
            if (i === 0) ctx.moveTo(r * Math.cos(angle), r * Math.sin(angle));
            else ctx.lineTo(r * Math.cos(angle), r * Math.sin(angle));
          }
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }

      // Respawn particles in first 3 seconds
      if (particles.current.length < 80) {
        particles.current.push(...spawnParticles(15));
      }

      raf.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[2000]"
      style={{ mixBlendMode: 'normal' }}
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface WelcomeAchievementProps {
  onDone: () => void;
}

const WelcomeAchievement: React.FC<WelcomeAchievementProps> = ({ onDone }) => {
  const [phase, setPhase] = useState<'ENTER' | 'HOLD' | 'EXIT'>('ENTER');

  useEffect(() => {
    // Play pop sound
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
      osc.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.22);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
    } catch (_) {}

    // Also try an external pop SFX
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3');
    audio.volume = 0.5;
    audio.play().catch(() => {});

    const holdTimer = setTimeout(() => setPhase('HOLD'), 400);
    const exitTimer = setTimeout(() => setPhase('EXIT'), 5500);
    const doneTimer = setTimeout(onDone, 6200);

    return () => {
      clearTimeout(holdTimer);
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <>
      <ConfettiCanvas />

      <AnimatePresence>
        {phase !== 'EXIT' && (
          <motion.div
            key="welcome"
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '110%', opacity: 0, transition: { duration: 0.5, ease: 'easeIn' } }}
            transition={{ type: 'spring', damping: 20, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 z-[2001] flex justify-center pb-10 pointer-events-none"
          >
            <motion.div
              animate={{ scale: [1, 1.02, 1] }}
              transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
              className="relative"
            >
              {/* Glow ring */}
              <div className="absolute inset-0 rounded-[3rem] bg-gradient-to-r from-[#FF8C00] via-[#FF4081] to-[#7C4DFF] blur-2xl opacity-60 scale-110" />

              <div className="relative bg-black/90 backdrop-blur-3xl border border-white/20 rounded-[3rem] px-10 py-8 flex items-center gap-8 shadow-[0_0_120px_rgba(255,140,0,0.5)] min-w-[480px] max-w-[600px]">

                {/* Medal / Trophy */}
                <div className="relative shrink-0">
                  <motion.div
                    initial={{ rotate: -20, scale: 0 }}
                    animate={{ rotate: [0, -8, 8, -4, 4, 0], scale: 1 }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className="w-24 h-24 rounded-[1.8rem] flex items-center justify-center shadow-2xl"
                    style={{ background: 'linear-gradient(135deg, #FFD700 0%, #FF8C00 50%, #FF4081 100%)' }}
                  >
                    <Trophy size={44} className="text-white drop-shadow-lg" />
                  </motion.div>
                  {/* Medal ribbon */}
                  <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {['#FF8C00', '#7C4DFF', '#FF4081'].map((c, i) => (
                      <motion.div
                        key={i}
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{ delay: 0.3 + i * 0.1 }}
                        className="w-2 h-5 rounded-b-full"
                        style={{ backgroundColor: c, transformOrigin: 'top' }}
                      />
                    ))}
                  </div>
                  {/* Stars orbiting */}
                  {[0, 72, 144, 216, 288].map((deg, i) => (
                    <motion.div
                      key={deg}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: [0, 1, 0], scale: [0, 1, 0] }}
                      transition={{ delay: 0.5 + i * 0.15, duration: 1.2 }}
                      className="absolute"
                      style={{
                        top: '50%', left: '50%',
                        transform: `translate(-50%,-50%) rotate(${deg}deg) translateY(-48px)`,
                      }}
                    >
                      <Star size={10} className="text-yellow-400" fill="currentColor" />
                    </motion.div>
                  ))}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="flex items-center gap-2 mb-1"
                  >
                    <Sparkles size={13} className="text-[#FF8C00]" />
                    <span className="text-[10px] font-black uppercase tracking-[0.35em] text-[#FF8C00]">Achievement Unlocked</span>
                  </motion.div>
                  <motion.h2
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-3xl font-black uppercase tracking-tightest leading-none text-white mb-2"
                  >
                    Welcome To<br />The Playground
                  </motion.h2>
                  <motion.p
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                    className="text-xs font-bold text-white/40 uppercase tracking-widest"
                  >
                    Joined Plajah — the stage is yours
                  </motion.p>
                </div>

                {/* Points */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5, type: 'spring', stiffness: 300 }}
                  className="text-right shrink-0"
                >
                  <div className="text-4xl font-black text-white leading-none">+100</div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-white/30 mt-1">Points</div>
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default WelcomeAchievement;
