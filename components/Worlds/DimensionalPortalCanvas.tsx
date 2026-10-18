import React, { useEffect, useRef } from 'react';
import { WorldPortalThemeId } from '../../data/worldsShowcaseData';

interface DimensionalPortalCanvasProps {
  theme: WorldPortalThemeId;
  warping?: boolean;
  className?: string;
}

export const DimensionalPortalCanvas: React.FC<DimensionalPortalCanvasProps> = ({
  theme,
  warping = false,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.35, targetX: 0.5, targetY: 0.35 });
  const warpRef = useRef(warping);
  warpRef.current = warping;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.targetX = e.clientX / Math.max(1, width);
      mouseRef.current.targetY = e.clientY / Math.max(1, height);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    // Generate persistent stars / particles
    const PARTICLE_COUNT = 160;
    const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      angle: (i / PARTICLE_COUNT) * Math.PI * 2 + Math.random() * 0.5,
      radius: 40 + Math.random() * Math.max(width, height) * 0.65,
      speed: (0.0006 + Math.random() * 0.0018) * (i % 2 === 0 ? 1 : -0.7),
      radialDrift: 0.15 + Math.random() * 0.55,
      size: 0.8 + Math.random() * 2.2,
      alpha: 0.25 + Math.random() * 0.75,
      huePick: i % 3,
      z: Math.random(),
    }));

    let t = 0;

    const render = () => {
      t += warpRef.current ? 0.045 : 0.008;
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.05;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.05;

      const cx = width * (0.5 + (mouseRef.current.x - 0.5) * 0.08);
      const cy = height * (0.34 + (mouseRef.current.y - 0.35) * 0.08);

      ctx.clearRect(0, 0, width, height);

      if (theme === 'ASTRAL_GATEWAY') {
        // ── THEME I: ASTRAL STARGATE (Event Horizon & Cosmic Vortex) ──────────
        const bgGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(width, height) * 0.75);
        bgGrad.addColorStop(0, 'rgba(139, 92, 246, 0.22)');
        bgGrad.addColorStop(0.28, 'rgba(255, 140, 0, 0.12)');
        bgGrad.addColorStop(0.58, 'rgba(0, 218, 243, 0.05)');
        bgGrad.addColorStop(1, 'rgba(3, 2, 10, 0)');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);

        // Concentric counter-rotating stargate aperture rings
        const ringRadii = [130, 195, 270, 360, 470];
        ringRadii.forEach((baseR, idx) => {
          const r = baseR * (warpRef.current ? 1 + Math.sin(t * 3) * 0.15 : 1);
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(t * (idx % 2 === 0 ? 0.35 : -0.25) * (1 + idx * 0.15));

          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.strokeStyle =
            idx === 0
              ? 'rgba(255, 140, 0, 0.28)'
              : idx === 1
              ? 'rgba(139, 92, 246, 0.22)'
              : idx === 2
              ? 'rgba(0, 218, 243, 0.16)'
              : 'rgba(255, 255, 255, 0.06)';
          ctx.lineWidth = idx === 0 ? 2 : 1;
          if (idx % 2 === 1) ctx.setLineDash([6, 14, 24, 14]);
          ctx.stroke();

          // Stargate chevron / rune ticks on ring 1 & 2
          if (idx < 3) {
            const ticks = 12 + idx * 6;
            for (let k = 0; k < ticks; k++) {
              const a = (k / ticks) * Math.PI * 2;
              const x1 = Math.cos(a) * (r - 5);
              const y1 = Math.sin(a) * (r - 5);
              const x2 = Math.cos(a) * (r + 5);
              const y2 = Math.sin(a) * (r + 5);
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              ctx.strokeStyle = k % 3 === 0 ? 'rgba(255, 140, 0, 0.45)' : 'rgba(255, 255, 255, 0.14)';
              ctx.lineWidth = k % 3 === 0 ? 2 : 1;
              ctx.setLineDash([]);
              ctx.stroke();
            }
          }
          ctx.restore();
        });

        // Gravitating astral particles
        particles.forEach((p) => {
          p.angle += p.speed * (warpRef.current ? 5 : 1);
          if (warpRef.current) {
            p.radius += 8;
            if (p.radius > Math.max(width, height) * 0.8) p.radius = 30;
          }
          const px = cx + Math.cos(p.angle) * p.radius;
          const py = cy + Math.sin(p.angle) * p.radius * 0.72;
          const color =
            p.huePick === 0
              ? `rgba(255, 140, 0, ${p.alpha})`
              : p.huePick === 1
              ? `rgba(139, 92, 246, ${p.alpha})`
              : `rgba(0, 218, 243, ${p.alpha})`;

          ctx.beginPath();
          ctx.arc(px, py, p.size, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        });
      } else if (theme === 'MYTHIC_ORRERY') {
        // ── THEME II: CELESTIAL SANCTUM (Grand Brass Orrery & Sovereign Atlas) ──
        const bgGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(width, height) * 0.78);
        bgGrad.addColorStop(0, 'rgba(245, 158, 11, 0.20)');
        bgGrad.addColorStop(0.35, 'rgba(180, 83, 9, 0.10)');
        bgGrad.addColorStop(0.65, 'rgba(56, 189, 248, 0.05)');
        bgGrad.addColorStop(1, 'rgba(7, 6, 9, 0)');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);

        // Celestial meridian crosshairs
        ctx.save();
        ctx.translate(cx, cy);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.10)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-width, 0);
        ctx.lineTo(width, 0);
        ctx.moveTo(0, -height);
        ctx.lineTo(0, height);
        ctx.stroke();

        // Grand Astrolabe Orbits + Planetary Nodes
        const orbits = [150, 230, 320, 430, 560];
        orbits.forEach((r, idx) => {
          ctx.save();
          ctx.rotate(t * 0.15 * (idx % 2 === 0 ? 1 : -1));
          ctx.beginPath();
          ctx.ellipse(0, 0, r, r * 0.68, idx * 0.25, 0, Math.PI * 2);
          ctx.strokeStyle = idx % 2 === 0 ? 'rgba(245, 158, 11, 0.22)' : 'rgba(254, 243, 199, 0.12)';
          ctx.lineWidth = idx === 1 ? 1.5 : 1;
          ctx.stroke();

          // Orbiting celestial body on each astrolabe track
          const bodyAngle = t * (0.4 + idx * 0.12) + idx * 1.3;
          const bx = Math.cos(bodyAngle) * r;
          const by = Math.sin(bodyAngle) * (r * 0.68);
          ctx.beginPath();
          ctx.arc(bx, by, 4 + (idx % 2) * 2, 0, Math.PI * 2);
          ctx.fillStyle = idx % 2 === 0 ? '#F59E0B' : '#38BDF8';
          ctx.shadowColor = idx % 2 === 0 ? '#F59E0B' : '#38BDF8';
          ctx.shadowBlur = 12;
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.restore();
        });
        ctx.restore();

        // Warm sanctuary gold dust
        particles.forEach((p) => {
          p.angle += p.speed * 0.5;
          const px = cx + Math.cos(p.angle) * p.radius;
          const py = cy + Math.sin(p.angle) * p.radius * 0.85;
          ctx.beginPath();
          ctx.arc(px, py, p.size * 0.9, 0, Math.PI * 2);
          ctx.fillStyle =
            p.huePick === 0
              ? `rgba(251, 191, 36, ${p.alpha * 0.85})`
              : p.huePick === 1
              ? `rgba(254, 243, 199, ${p.alpha * 0.65})`
              : `rgba(56, 189, 248, ${p.alpha * 0.55})`;
          ctx.fill();
        });
      } else {
        // ── THEME III: QUANTUM MULTIVERSE LOOM (Timeline Threads & Reality Grid) ──
        const bgGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(width, height) * 0.78);
        bgGrad.addColorStop(0, 'rgba(0, 218, 243, 0.18)');
        bgGrad.addColorStop(0.38, 'rgba(236, 72, 153, 0.11)');
        bgGrad.addColorStop(0.7, 'rgba(16, 185, 129, 0.05)');
        bgGrad.addColorStop(1, 'rgba(2, 6, 13, 0)');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);

        // Branching Multiverse Timeline Waves
        const branchColors = [
          'rgba(0, 218, 243, 0.26)',
          'rgba(236, 72, 153, 0.22)',
          'rgba(16, 185, 129, 0.20)',
          'rgba(139, 92, 246, 0.18)',
        ];
        branchColors.forEach((col, bIdx) => {
          ctx.beginPath();
          const baseY = cy + (bIdx - 1.5) * 65;
          for (let x = 0; x <= width; x += 24) {
            const normX = (x - cx) / Math.max(1, width * 0.5);
            const spread = Math.abs(normX) * 95 * (bIdx % 2 === 0 ? 1 : -1);
            const wave =
              Math.sin(x * 0.005 + t * (1.4 + bIdx * 0.3) + bIdx) * 28 +
              Math.cos(x * 0.012 - t) * 12;
            const y = baseY + spread * 0.35 + wave;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.6;
          ctx.stroke();
        });

        // Quantum data nodes
        particles.forEach((p, idx) => {
          p.angle += p.speed * 1.2;
          const px = ((p.radius * 1.7 + t * 60 * (idx % 2 === 0 ? 1 : -1)) % width + width) % width;
          const py = cy + Math.sin(px * 0.006 + idx) * 220 + (p.z - 0.5) * 260;
          ctx.fillStyle =
            p.huePick === 0
              ? `rgba(0, 218, 243, ${p.alpha})`
              : p.huePick === 1
              ? `rgba(236, 72, 153, ${p.alpha})`
              : `rgba(16, 185, 129, ${p.alpha})`;
          ctx.fillRect(px, py, p.size * 1.4, p.size * 1.4);
        });
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      className={`fixed inset-0 pointer-events-none -z-10 transition-opacity duration-700 ${className}`}
    />
  );
};

export default DimensionalPortalCanvas;
