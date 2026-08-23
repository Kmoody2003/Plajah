// The partial display — VELA's hero control.
//
// Same principle as WavetableDisplay: draw the ACTUAL engine state, not a decorative squiggle.
// ONDA's state is a wavetable frame, so it draws the frame. VELA's state is 16-64 partials by
// three values each, and no arrangement of knobs makes that legible — but as a comb it reads at
// a glance:
//
//   x       frequency ratio (log), so inharmonicity is visible as the spacing stretching
//   height  amplitude, including the excitation-point null
//   tail    decay time, drawn as a fade to the right
//
// The ratio maths mirrors `ModalBank::prepare` in rust/plajah-audio/src/modal.rs. The two are
// separate implementations of the same formula, which is a real risk of drift — if the display
// stops matching what you hear, this is the file that is lying.

import React, { useEffect, useRef } from 'react';
import { MATERIALS, PARTIAL_STEPS, modalDecaySec } from '../../../../services/melos/instruments/vela/params';

interface Props {
  partials: number;   // 0..1, stepped
  inharm: number;     // 0..1
  spread: number;     // 0..1
  decay: number;      // 0..1
  decayTilt: number;  // 0..1, meaningful as -1..+1
  material: number;   // index
  position: number;   // 0..1
  height?: number;
  /** Set while a Motion handle is being dragged — dropping here routes to inharmonicity. */
  dropActive?: boolean;
  onModDrop?: () => void;
}

/** Mirrors `Material::traits` — (decay tilt bias, amplitude exponent, inharmonicity scale). */
const TRAITS: Array<[number, number, number]> = [
  [-0.25, 0.9, 1.0],   // Bronze
  [-0.1, 0.7, 1.6],    // Glass
  [-0.35, 1.05, 2.4],  // Iron
  [0.55, 1.3, 0.7],    // Wood
  [0.85, 1.55, 0.45],  // Skin
  [0.15, 1.8, 0.12],   // Air
];

/** Deterministic per-partial jitter, matching the seeded array the engine builds once. */
function jitterAt(k: number): number {
  let h = Math.imul(k + 1, 0x9e3779b1) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296 * 2 - 1;
}

export const PartialDisplay: React.FC<Props> = ({
  partials, inharm, spread, decay, decayTilt, material, position,
  height = 132, dropActive, onModDrop,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const count = PARTIAL_STEPS[Math.round(Math.max(0, Math.min(1, partials)) * 4)];
  const decaySec = modalDecaySec(decay);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w < 2) return;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const [tiltBias, ampExp, inharmScale] = TRAITS[Math.round(material)] ?? TRAITS[0];
    const b = inharm * inharmScale;
    const tilt = Math.max(-1.2, Math.min(1.8, (decayTilt * 2 - 1) + tiltBias));

    const base = h - 9;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, base + 0.5); ctx.lineTo(w, base + 0.5); ctx.stroke();

    const ratioOf = (k: number) => {
      const kn = k + 1;
      return kn * Math.sqrt(1 + b * kn * kn * 0.01);
    };
    const maxRatio = Math.log(ratioOf(count - 1));

    for (let k = 0; k < count; k++) {
      const kn = k + 1;
      const ratio = ratioOf(k) * (1 + jitterAt(k) * spread * 0.04);
      const x = 10 + (Math.log(Math.max(1, ratio)) / (maxRatio || 1)) * (w - 20);

      // Amplitude, including the excitation-point null: a partial whose node lands where the
      // body was struck cannot be excited at all.
      const node = Math.abs(Math.sin(Math.PI * kn * Math.max(0.01, Math.min(0.99, position))));
      const amp = Math.pow(kn, -ampExp) * (0.35 + 0.65 * node) * (0.55 + 0.45 * (jitterAt(k) * 0.5 + 0.5));
      const barH = Math.max(0, amp * (h - 24));
      if (barH < 0.4) continue;

      // Decay per partial, drawn as a horizontal tail — longer tail, longer ring.
      const partialDecay = Math.max(0.02, Math.min(60, decaySec * Math.pow(kn, -tilt)));
      const tail = Math.min(w * 0.28, 6 + Math.sqrt(partialDecay) * 9);

      const f = k / Math.max(1, count - 1);
      const tg = ctx.createLinearGradient(x, 0, x + tail, 0);
      tg.addColorStop(0, 'rgba(0,218,243,0.20)');
      tg.addColorStop(1, 'rgba(0,218,243,0)');
      ctx.fillStyle = tg;
      ctx.fillRect(x, base - barH, tail, barH);

      // Bronze at the fundamental, through lilac, to cyan in the high partials — the same
      // reading order as the Motion group colours.
      ctx.fillStyle = f < 0.45 ? '#FF8C00' : f < 0.8 ? '#D0BCFF' : '#00DAF3';
      ctx.fillRect(x - 0.75, base - barH, 1.5, barH);
    }
  }, [count, inharm, spread, decaySec, decayTilt, material, position, height]);

  // Named by what the ear hears, not by the number — the number is already on the knob.
  const character =
    inharm < 0.02 ? 'harmonic' : inharm < 0.09 ? 'bowl' : inharm < 0.2 ? 'glass'
      : inharm < 0.45 ? 'gong' : inharm < 0.6 ? 'iron' : 'no pitch';

  return (
    <div
      className="relative rounded-[14px] border overflow-hidden transition-colors"
      style={{
        height,
        background: 'linear-gradient(180deg, rgba(208,188,255,0.06), transparent)',
        borderColor: dropActive ? '#D0BCFF' : 'rgba(255,255,255,0.10)',
      }}
      onMouseUp={dropActive ? onModDrop : undefined}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <span className="absolute top-2 left-3 text-[9.5px] uppercase tracking-[0.16em] text-white/35">
        {MATERIALS[Math.round(material)] ?? 'Bronze'} · {count} partials
      </span>
      <span className="absolute top-2 right-3 font-mono text-[9.5px]" style={{ color: '#D0BCFF' }}>
        {character}
      </span>
      <span className="absolute bottom-2 left-3 text-[9.5px] text-white/25">
        {decaySec >= 10 ? `${decaySec.toFixed(0)} s` : `${decaySec.toFixed(1)} s`} decay
      </span>
      {dropActive && (
        <span className="absolute bottom-2 right-3 text-[9.5px] tracking-[0.14em] uppercase" style={{ color: '#D0BCFF' }}>
          drop → inharmonic
        </span>
      )}
    </div>
  );
};
