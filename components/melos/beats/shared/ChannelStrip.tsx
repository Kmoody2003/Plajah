// One console channel strip — the unit both the dedicated Mixer page and the Timeline's docked
// mixer are built from (approved mockup 06). Matte hardware styling: name, routing tag, vertical
// fader + live meter, M/S, pan knob, dB readout.

import React, { useRef } from 'react';
import { Knob } from './Knob';
import { SURFACE_RAISED } from '../theme';

/** A single aux-send control, rendered as a small knob in the vertical column beside the fader. */
export interface SendKnob { label: string; color: string; value: number; onChange: (v: number) => void }

export interface ChannelStripProps {
  label: string;
  color?: string;
  routeTag?: string;
  gainDb: number;
  pan?: number;
  mute?: boolean;
  solo?: boolean;
  meter?: number;            // 0..1 live peak (from the engine bridge)
  meterColor?: string;
  dimmed?: boolean;          // preserved/inert channels (imported plugin tracks)
  compact?: boolean;         // Timeline dock density
  wide?: boolean;            // Master
  /** Aux sends — a vertical column of knobs beside the fader, so any number of buses fits. */
  sends?: SendKnob[];
  children?: React.ReactNode; // extra controls (limiter chip, GR readout)
  onGain?: (db: number) => void;
  onPan?: (p: number) => void;
  onMute?: () => void;
  onSolo?: () => void;
}

const dbFormat = (db: number) => (db <= -60 ? '-inf' : `${db >= 0 ? '+' : ''}${db.toFixed(1)}`);

/** A tiny send knob for the strip's vertical send column. Drag up/down; label rides on top. */
const SendMini: React.FC<{ send: SendKnob }> = ({ send }) => {
  const drag = useRef<{ y: number; v: number } | null>(null);
  const frac = Math.max(0, Math.min(1, send.value / 1.5)); // 0..1.5 send range
  return (
    <div className="flex flex-col items-center" title={`${send.label}: ${send.value < 0.001 ? 'off' : `${(20 * Math.log10(send.value)).toFixed(0)} dB`}`}>
      <div
        role="slider"
        aria-label={`Send to ${send.label}`}
        aria-valuenow={Math.round(send.value * 100) / 100}
        tabIndex={0}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { y: e.clientY, v: send.value }; }}
        onPointerMove={(e) => { const d = drag.current; if (!d) return; send.onChange(Math.max(0, Math.min(1.5, d.v + (d.y - e.clientY) * 0.012))); }}
        onPointerUp={() => { drag.current = null; }}
        onDoubleClick={() => send.onChange(0)}
        className="w-[14px] h-[14px] rounded-full cursor-ns-resize focus:outline-none focus:ring-1 focus:ring-[#FF8C00]/60"
        style={{
          background: `conic-gradient(${send.color} ${Math.round(frac * 100)}%, rgba(255,255,255,0.12) 0)`,
          WebkitMask: 'radial-gradient(circle, transparent 3.5px, #000 4px)',
          mask: 'radial-gradient(circle, transparent 3.5px, #000 4px)',
          touchAction: 'none',
        }}
      />
      <span className="text-[6.5px] font-bold tracking-tight -mt-0.5" style={{ color: send.value > 0.001 ? send.color : 'rgba(255,255,255,0.3)' }}>{send.label}</span>
    </div>
  );
};

export const ChannelStrip: React.FC<ChannelStripProps> = (p) => {
  const drag = useRef<{ y: number; db: number } | null>(null);
  const faderH = p.compact ? 64 : 120;
  // -60..+12 dB mapped onto the fader travel.
  const frac = Math.max(0, Math.min(1, (p.gainDb + 60) / 72));

  return (
    <div
      className={`flex flex-col gap-1.5 rounded-[10px] border p-2 flex-none ${p.wide ? 'w-[104px]' : p.compact ? 'w-[72px]' : 'w-[78px]'}`}
      style={{
        background: p.wide ? 'linear-gradient(180deg, rgba(107,0,153,0.14), rgba(212,0,85,0.08))' : SURFACE_RAISED,
        borderColor: p.wide ? 'rgba(212,0,85,0.45)' : p.dimmed ? 'rgba(208,188,255,0.3)' : 'rgba(255,255,255,0.09)',
        borderStyle: p.dimmed ? 'dashed' : 'solid',
        opacity: p.dimmed ? 0.6 : 1,
      }}
    >
      <span className={`text-center truncate ${p.wide ? 'text-[11px] font-bold' : 'text-[9.5px] font-semibold'}`} style={{ color: p.color || 'rgba(255,255,255,0.8)' }}>
        {p.label}
      </span>
      {p.routeTag && <span className="text-[8px] text-white/30 text-center -mt-1">→ {p.routeTag}</span>}

      {p.dimmed ? (
        <div className="grid place-items-center text-[8.5px] text-[#D0BCFF] text-center px-1" style={{ height: faderH }}>preserved</div>
      ) : (
        <div className="flex gap-1.5 justify-center" style={{ height: faderH }}>
          <div
            role="slider"
            aria-label={`${p.label} volume`}
            aria-valuemin={-60}
            aria-valuemax={12}
            aria-valuenow={Math.round(p.gainDb * 10) / 10}
            tabIndex={0}
            onPointerDown={(e) => { if (!p.onGain) return; (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { y: e.clientY, db: p.gainDb }; }}
            onPointerMove={(e) => { const d = drag.current; if (!d || !p.onGain) return; const fine = e.shiftKey ? 0.25 : 1; p.onGain(Math.max(-60, Math.min(12, d.db + (d.y - e.clientY) * (72 / faderH) * fine))); }}
            onPointerUp={() => { drag.current = null; }}
            onDoubleClick={() => p.onGain?.(0)}
            onKeyDown={(e) => { if (!p.onGain) return; if (e.key === 'ArrowUp') p.onGain(Math.min(12, p.gainDb + 1)); if (e.key === 'ArrowDown') p.onGain(Math.max(-60, p.gainDb - 1)); }}
            className="relative w-[7px] rounded-[4px] cursor-ns-resize focus:outline-none focus:ring-1 focus:ring-[#FF8C00]/60"
            style={{ background: 'rgba(255,255,255,0.07)', touchAction: 'none' }}
          >
            <div className="absolute bottom-0 left-0 right-0 rounded-[4px]" style={{ height: `${frac * 100}%`, background: p.color ? `${p.color}B3` : 'rgba(255,255,255,0.45)' }} />
            <div className="absolute -left-[3px] -right-[3px] h-[8px] rounded-[3px]" style={{ bottom: `calc(${frac * 100}% - 4px)`, background: '#2A2A32', border: '1px solid rgba(255,255,255,0.25)' }} />
          </div>
          <div className="relative w-[4px] rounded-[3px] overflow-hidden self-stretch" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="absolute bottom-0 left-0 right-0 rounded-[3px] transition-[height] duration-75"
              style={{ height: `${Math.min(1, p.meter || 0) * 100}%`, background: (p.meter || 0) > 0.95 ? '#EF4444' : (p.meterColor || '#06D6A0') }}
            />
          </div>
          {/* Aux sends — a vertical column beside the fader, so 2, 4, 8 buses all fit the same strip. */}
          {p.sends && p.sends.length > 0 && (
            <div className="flex flex-col gap-1 justify-start overflow-y-auto pl-0.5" style={{ maxHeight: faderH }}>
              {p.sends.map((s, i) => (
                <SendMini key={i} send={s} />
              ))}
            </div>
          )}
        </div>
      )}

      {!p.dimmed && (p.onMute || p.onSolo || p.onPan) && (
        <div className="flex gap-1 justify-center items-center">
          {p.onMute && (
            <button onClick={p.onMute} aria-label={`${p.mute ? 'Unmute' : 'Mute'} ${p.label}`}
              className="w-[16px] h-[16px] rounded-[4px] border text-[8px] grid place-items-center"
              style={p.mute ? { background: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.3)', color: '#fff' } : { borderColor: 'rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.35)' }}
            >M</button>
          )}
          {p.onSolo && (
            <button onClick={p.onSolo} aria-label={`${p.solo ? 'Unsolo' : 'Solo'} ${p.label}`}
              className="w-[16px] h-[16px] rounded-[4px] border text-[8px] grid place-items-center"
              style={p.solo ? { background: 'rgba(0,218,243,0.2)', borderColor: '#00DAF3', color: '#00DAF3' } : { borderColor: 'rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.35)' }}
            >S</button>
          )}
          {p.onPan && !p.compact && (
            <Knob label="" value={p.pan ?? 0} min={-1} max={1} defaultValue={0} size={16}
              format={(v) => (Math.abs(v) < 0.02 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`)}
              onChange={p.onPan} />
          )}
        </div>
      )}
      {p.children}
      <span className="font-mono text-[8.5px] text-white/35 text-center">{p.dimmed ? '—' : dbFormat(p.gainDb)}</span>
    </div>
  );
};
