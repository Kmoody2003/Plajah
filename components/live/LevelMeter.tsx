/**
 * LevelMeter — peak + RMS bar with a peak-hold tick and a latching CLIP light, for any live audio
 * input (services/audio/levelMeter). Give it the exact track/stream being published, or a mixer
 * channel's AnalyserNode, so the bar shows what the audience hears.
 *
 * Draws by writing styles on refs from the shared meter loop — no React re-render per frame.
 */
import React, { useEffect, useRef, useState } from 'react';
import { meterTrack, meterAnalyser, dbToFraction, resumeMeters, METER_FLOOR_DB, type LevelReading } from '../../services/audio/levelMeter';

export type MeterSource = MediaStreamTrack | MediaStream | AnalyserNode | null | undefined;

const TICKS = [-48, -36, -24, -12, 0];
// Green to -18 dBFS, amber to -6, red above — positions on the -60..0 scale.
const GRADIENT = 'linear-gradient(90deg, #22c55e 0%, #22c55e 70%, #facc15 70%, #facc15 90%, #ef4444 90%, #ef4444 100%)';

function useAudioTrack(source: MeterSource): MediaStreamTrack | AnalyserNode | null {
  // A MediaStream can swap its audio track (device switch) — follow it.
  const [, bump] = useState(0);
  useEffect(() => {
    if (!(source instanceof MediaStream)) return;
    const on = () => bump(n => n + 1);
    source.addEventListener('addtrack', on);
    source.addEventListener('removetrack', on);
    return () => { source.removeEventListener('addtrack', on); source.removeEventListener('removetrack', on); };
  }, [source]);
  if (!source) return null;
  if (source instanceof MediaStream) return source.getAudioTracks().find(t => t.readyState === 'live') ?? null;
  return source;
}

export const LevelMeter: React.FC<{
  source: MeterSource;
  label?: string;
  /** Show the input as muted (bar keeps metering — a muted track reads as silence anyway). */
  muted?: boolean;
  size?: 'sm' | 'md';
  /** Called (at most a few times a second) while RMS is above -45 dBFS — "we hear you". */
  onSignal?: () => void;
  className?: string;
}> = ({ source, label, muted, size = 'md', onSignal, className = '' }) => {
  const input = useAudioTrack(source);
  const peakRef = useRef<HTMLDivElement>(null);
  const rmsRef = useRef<HTMLDivElement>(null);
  const holdRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLButtonElement>(null);
  const readRef = useRef<HTMLSpanElement>(null);
  const clipResetRef = useRef(0);
  const onSignalRef = useRef(onSignal);
  onSignalRef.current = onSignal;

  useEffect(() => {
    const paint = (r: LevelReading) => {
      const clipPath = (db: number) => `inset(0 ${((1 - dbToFraction(db)) * 100).toFixed(2)}% 0 0)`;
      if (peakRef.current) peakRef.current.style.clipPath = clipPath(r.peakDb);
      if (rmsRef.current) rmsRef.current.style.clipPath = clipPath(r.rmsDb);
      if (holdRef.current) {
        holdRef.current.style.left = `${(dbToFraction(r.holdDb) * 100).toFixed(2)}%`;
        holdRef.current.style.opacity = r.holdDb > METER_FLOOR_DB ? '1' : '0';
      }
      const clip = r.clip && r.clipAt > clipResetRef.current;
      if (clipRef.current) clipRef.current.dataset.on = clip ? '1' : '0';
      if (readRef.current) {
        const n = Number(readRef.current.dataset.n || 0) + 1;
        readRef.current.dataset.n = String(n);
        if (n % 6 === 0) {
          readRef.current.textContent = r.peakDb <= METER_FLOOR_DB ? '−∞' : `${Math.round(r.peakDb)} pk · ${Math.round(r.rmsDb)} rms`;
          if (r.rmsDb > -45) onSignalRef.current?.();
        }
      }
    };
    const idle: LevelReading = { peakDb: METER_FLOOR_DB, rmsDb: METER_FLOOR_DB, holdDb: METER_FLOOR_DB, clip: false, clipAt: 0 };
    if (!input) { paint(idle); if (readRef.current) readRef.current.textContent = 'no input'; return; }
    if (input instanceof AnalyserNode) return meterAnalyser(input, paint);
    if (input.readyState !== 'live') { paint(idle); return; }
    let off = meterTrack(input, paint);
    const ended = () => { off(); off = () => {}; paint(idle); };
    input.addEventListener('ended', ended, { once: true });
    return () => { input.removeEventListener('ended', ended); off(); };
  }, [input]);

  const sm = size === 'sm';
  return (
    <div className={`flex items-center gap-2 min-w-0 ${className}`} onPointerDown={resumeMeters}
      data-level-meter={label || 'input'}>
      {label && <span className={`shrink-0 font-black uppercase tracking-wider text-white/60 truncate ${sm ? 'text-[8px] w-9' : 'text-[9px] w-11'}`}>{label}</span>}
      <div className="flex-1 min-w-0">
        <div className={`relative w-full rounded-full overflow-hidden bg-white/10 ${sm ? 'h-1.5' : 'h-2.5'} ${muted ? 'opacity-40' : ''}`}>
          <div ref={peakRef} className="absolute inset-0 opacity-45" style={{ background: GRADIENT, clipPath: 'inset(0 100% 0 0)' }} />
          <div ref={rmsRef} className="absolute inset-0" style={{ background: GRADIENT, clipPath: 'inset(0 100% 0 0)' }} />
          <div ref={holdRef} className="absolute top-0 bottom-0 w-[2px] -ml-px bg-white" style={{ left: '0%', opacity: 0 }} />
        </div>
        {!sm && (
          <div className="relative h-3 mt-0.5">
            {TICKS.map(db => (
              <span key={db} className="absolute -translate-x-1/2 text-[7px] font-bold text-white/30 tabular-nums" style={{ left: `${dbToFraction(db) * 100}%` }}>
                {db}
              </span>
            ))}
          </div>
        )}
      </div>
      {!sm && <span ref={readRef} className="shrink-0 w-[78px] text-right text-[9px] font-mono text-white/55 tabular-nums whitespace-nowrap">{muted ? 'muted' : ''}</span>}
      {sm && <span ref={readRef} className="hidden" />}
      <button ref={clipRef} type="button" data-on="0" title="Clipping — tap to reset"
        onClick={() => { clipResetRef.current = performance.now(); if (clipRef.current) clipRef.current.dataset.on = '0'; }}
        className={`shrink-0 rounded font-black uppercase tracking-wider transition-colors bg-white/10 text-white/30 data-[on='1']:bg-red-600 data-[on='1']:text-white ${sm ? 'text-[7px] px-1 py-px' : 'text-[8px] px-1.5 py-0.5'}`}>
        Clip
      </button>
    </div>
  );
};

export default LevelMeter;
