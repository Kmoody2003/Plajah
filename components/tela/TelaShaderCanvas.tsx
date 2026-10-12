import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Sparkles, Sliders, Waves, Play, Pause, Activity, Disc, Radio } from 'lucide-react';

export type ShaderMode = 'CHROMATIC_FLUID' | 'AUDIO_SPECTRUM' | 'QUANTUM_WAVE';

export interface TelaShaderCanvasProps {
  initialMode?: ShaderMode;
  className?: string;
  interactive?: boolean;
}

export default function TelaShaderCanvas({
  initialMode = 'CHROMATIC_FLUID',
  className = '',
  interactive = true,
}: TelaShaderCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<ShaderMode>(initialMode);
  const [speed, setSpeed] = useState(1.4);
  const [intensity, setIntensity] = useState(1.0);
  const [colorTheme, setColorTheme] = useState<'AURA' | 'CYAN' | 'GOLD' | 'EMERALD'>('AURA');
  const [isPlaying, setIsPlaying] = useState(true);

  // Mouse & Shockwave state
  const mouseRef = useRef({ x: 0.5, y: 0.5, active: false });
  const shockwavesRef = useRef<Array<{ x: number; y: number; time: number; maxRadius: number }>>([]);

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    mouseRef.current = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
      active: true,
    };
  };

  const handlePointerLeave = () => {
    mouseRef.current.active = false;
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    shockwavesRef.current.push({ x, y, time: 0, maxRadius: 0.6 });
    if (shockwavesRef.current.length > 5) shockwavesRef.current.shift();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let time = 0;

    const render = () => {
      animId = requestAnimationFrame(render);
      if (!isPlaying) return;

      time += 0.016 * speed;
      const w = canvas.width;
      const h = canvas.height;

      // Update shockwaves
      for (let i = shockwavesRef.current.length - 1; i >= 0; i--) {
        shockwavesRef.current[i].time += 0.016 * speed;
        if (shockwavesRef.current[i].time > 1.2) {
          shockwavesRef.current.splice(i, 1);
        }
      }

      ctx.clearRect(0, 0, w, h);

      if (mode === 'CHROMATIC_FLUID') {
        // High-density fluid procedural chromatic plasma
        const mx = mouseRef.current.active ? mouseRef.current.x : 0.5 + Math.cos(time * 0.8) * 0.25;
        const my = mouseRef.current.active ? mouseRef.current.y : 0.5 + Math.sin(time * 0.9) * 0.25;

        // Base gradient
        const bgGrad = ctx.createRadialGradient(w * mx, h * my, 10, w * 0.5, h * 0.5, Math.max(w, h));
        if (colorTheme === 'AURA') {
          bgGrad.addColorStop(0, 'rgba(212, 0, 85, 0.45)');
          bgGrad.addColorStop(0.35, 'rgba(107, 0, 153, 0.35)');
          bgGrad.addColorStop(0.7, 'rgba(255, 138, 0, 0.15)');
          bgGrad.addColorStop(1, 'rgba(10, 7, 16, 0.85)');
        } else if (colorTheme === 'CYAN') {
          bgGrad.addColorStop(0, 'rgba(0, 218, 243, 0.5)');
          bgGrad.addColorStop(0.4, 'rgba(37, 99, 235, 0.35)');
          bgGrad.addColorStop(1, 'rgba(7, 14, 28, 0.85)');
        } else if (colorTheme === 'GOLD') {
          bgGrad.addColorStop(0, 'rgba(255, 184, 0, 0.5)');
          bgGrad.addColorStop(0.4, 'rgba(212, 85, 0, 0.3)');
          bgGrad.addColorStop(1, 'rgba(24, 14, 7, 0.85)');
        } else {
          bgGrad.addColorStop(0, 'rgba(16, 185, 129, 0.5)');
          bgGrad.addColorStop(0.4, 'rgba(6, 95, 70, 0.35)');
          bgGrad.addColorStop(1, 'rgba(6, 20, 15, 0.85)');
        }

        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // Fluid Wave Contours
        ctx.lineWidth = 2 * intensity;
        const numWaves = 7;
        for (let i = 0; i < numWaves; i++) {
          ctx.beginPath();
          const phase = time * 1.8 + i * 0.65;
          const yBase = h * (0.2 + (i / numWaves) * 0.6);

          for (let x = 0; x <= w; x += 12) {
            const nx = x / w;
            const distToMouse = Math.hypot(nx - mx, (yBase / h) - my);
            const mouseRipple = Math.sin(distToMouse * 16 - time * 4) * Math.exp(-distToMouse * 3.5) * 35;

            // Shockwave perturbation
            let shockRipple = 0;
            shockwavesRef.current.forEach(sw => {
              const swDist = Math.hypot(nx - sw.x, (yBase / h) - sw.y);
              const ringDist = Math.abs(swDist - sw.time * 0.45);
              if (ringDist < 0.1) {
                shockRipple += Math.cos(ringDist * Math.PI * 10) * (1.0 - sw.time) * 45;
              }
            });

            const y = yBase 
              + Math.sin(nx * 8 + phase) * 22 * intensity 
              + Math.cos(nx * 14 - phase * 0.7) * 12 
              + mouseRipple 
              + shockRipple;

            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }

          if (colorTheme === 'AURA') {
            ctx.strokeStyle = i % 2 === 0 ? 'rgba(212, 0, 85, 0.6)' : 'rgba(0, 218, 243, 0.5)';
          } else if (colorTheme === 'CYAN') {
            ctx.strokeStyle = i % 2 === 0 ? 'rgba(0, 218, 243, 0.7)' : 'rgba(147, 197, 253, 0.45)';
          } else if (colorTheme === 'GOLD') {
            ctx.strokeStyle = i % 2 === 0 ? 'rgba(255, 186, 8, 0.7)' : 'rgba(244, 140, 6, 0.45)';
          } else {
            ctx.strokeStyle = i % 2 === 0 ? 'rgba(52, 211, 153, 0.7)' : 'rgba(16, 185, 129, 0.45)';
          }
          ctx.stroke();
        }

      } else if (mode === 'AUDIO_SPECTRUM') {
        // Real-Time Audio Frequency Spectrum Bars & Oscilloscope Beam
        ctx.fillStyle = 'rgba(10, 8, 16, 0.9)';
        ctx.fillRect(0, 0, w, h);

        const bars = 28;
        const barWidth = (w - (bars * 4)) / bars;
        const centerX = w * 0.5;
        const centerY = h * 0.5;

        // Spectrum frequency bars
        for (let i = 0; i < bars; i++) {
          const freq = Math.sin(time * 3 + i * 0.4) * 0.5 + 0.5;
          const harmonic = Math.cos(time * 5 + i * 0.8) * 0.3 + 0.3;
          const barHeight = Math.max(12, (freq * 0.6 + harmonic * 0.4) * h * 0.6 * intensity);

          const x = i * (barWidth + 4) + 2;
          const y = h - barHeight - 16;

          const barGrad = ctx.createLinearGradient(0, y, 0, h - 16);
          barGrad.addColorStop(0, '#D40055');
          barGrad.addColorStop(0.5, '#6B0099');
          barGrad.addColorStop(1, '#00DAF3');

          ctx.fillStyle = barGrad;
          ctx.fillRect(x, y, barWidth, barHeight);

          // Top peak dot
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(x, y - 4, barWidth, 2);
        }

        // Oscilloscope Green Beam across center
        ctx.beginPath();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#00DAF3';
        ctx.shadowColor = '#00DAF3';
        ctx.shadowBlur = 10;
        for (let x = 0; x <= w; x += 6) {
          const nx = x / w;
          const wave = Math.sin(nx * 18 + time * 6) * Math.cos(nx * 8 - time * 3) * 28 * intensity;
          const y = centerY - 30 + wave;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

      } else if (mode === 'QUANTUM_WAVE') {
        // Quantum Physics Wave Interference & Nodal Grid for Academia
        ctx.fillStyle = 'rgba(7, 10, 18, 0.92)';
        ctx.fillRect(0, 0, w, h);

        const cols = 22;
        const rows = 14;
        const cellW = w / cols;
        const cellH = h / rows;

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const cx = (c + 0.5) * cellW;
            const cy = (r + 0.5) * cellH;

            // Interference of two coherent wave sources
            const d1 = Math.hypot(cx - w * 0.35, cy - h * 0.5);
            const d2 = Math.hypot(cx - w * 0.65, cy - h * 0.5);
            const psi = Math.sin(d1 * 0.05 - time * 3) + Math.sin(d2 * 0.05 - time * 3);
            const prob = (psi * 0.5 + 0.5);

            const radius = Math.max(1.5, prob * cellW * 0.42 * intensity);

            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fillStyle = prob > 0.65 
              ? 'rgba(0, 218, 243, 0.85)' 
              : prob > 0.35 
              ? 'rgba(168, 85, 247, 0.6)' 
              : 'rgba(255, 255, 255, 0.15)';
            ctx.fill();
          }
        }
      }
    };

    render();

    return () => cancelAnimationFrame(animId);
  }, [mode, speed, intensity, colorTheme, isPlaying]);

  return (
    <div className={`relative rounded-[20px] overflow-hidden border border-white/15 select-none ${className}`}>
      {/* Canvas Screen */}
      <canvas
        ref={canvasRef}
        width={720}
        height={380}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
        className="w-full h-full block cursor-crosshair"
      />

      {/* Interactive Controls Overlay Header */}
      <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/20 text-[8.5px] font-mono font-bold text-white shadow-lg pointer-events-auto">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>TELA GLSL SHADER BUS: 60 FPS</span>
        </div>

        {/* Mode Selector Buttons */}
        <div className="flex items-center gap-1 p-0.5 rounded-xl bg-black/75 backdrop-blur-md border border-white/15 shadow-xl pointer-events-auto">
          <button
            onClick={() => setMode('CHROMATIC_FLUID')}
            className={`px-2.5 py-1 rounded-lg text-[8px] font-mono font-bold transition-all ${
              mode === 'CHROMATIC_FLUID' ? 'bg-[#D40055] text-white' : 'text-white/60 hover:text-white'
            }`}
          >
            Fluid Plasma
          </button>
          <button
            onClick={() => setMode('AUDIO_SPECTRUM')}
            className={`px-2.5 py-1 rounded-lg text-[8px] font-mono font-bold transition-all ${
              mode === 'AUDIO_SPECTRUM' ? 'bg-[#00DAF3] text-black' : 'text-white/60 hover:text-white'
            }`}
          >
            Audio FFT
          </button>
          <button
            onClick={() => setMode('QUANTUM_WAVE')}
            className={`px-2.5 py-1 rounded-lg text-[8px] font-mono font-bold transition-all ${
              mode === 'QUANTUM_WAVE' ? 'bg-[#8B5CF6] text-white' : 'text-white/60 hover:text-white'
            }`}
          >
            Quantum Ψ
          </button>
        </div>
      </div>

      {/* Bottom Floating Parameters Strip */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between px-3 py-1.5 rounded-xl bg-black/75 backdrop-blur-md border border-white/15 text-[8.5px] font-mono text-white/80 pointer-events-auto">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex items-center gap-1 hover:text-white transition-colors"
          >
            {isPlaying ? <Pause size={11} className="text-amber-400" /> : <Play size={11} className="text-emerald-400" />}
            <span>{isPlaying ? 'Pause Shader' : 'Run'}</span>
          </button>

          <span className="text-white/20">|</span>

          <label className="flex items-center gap-1.5">
            <span className="text-white/40">Speed:</span>
            <input
              type="range"
              min={0.5}
              max={3.0}
              step={0.1}
              value={speed}
              onChange={e => setSpeed(Number(e.target.value))}
              className="w-14 accent-fuchsia-400 cursor-pointer h-1"
            />
          </label>

          <span className="hidden sm:inline text-white/20">|</span>

          <div className="hidden sm:flex items-center gap-1">
            <span className="text-white/40">Palette:</span>
            {(['AURA', 'CYAN', 'GOLD', 'EMERALD'] as const).map(thm => (
              <button
                key={thm}
                onClick={() => setColorTheme(thm)}
                className={`w-3 h-3 rounded-full border border-white/20 transition-all ${
                  colorTheme === thm ? 'scale-125 ring-1 ring-white' : 'opacity-50 hover:opacity-100'
                }`}
                style={{
                  background: thm === 'AURA' ? '#D40055' : thm === 'CYAN' ? '#00DAF3' : thm === 'GOLD' ? '#FFB800' : '#10B981'
                }}
              />
            ))}
          </div>
        </div>

        <div className="text-[7.5px] text-white/45 hidden md:inline">
          Click canvas to emit chromatic shockwave
        </div>
      </div>
    </div>
  );
}
