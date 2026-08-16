// KERA — the deep editor. The Play panel's "Edit ▸" leads here.
//
// Three tabs make KERA a sampler and not just a player: Mapping (the keyboard×velocity zone grid,
// Kontakt-style), Wave (start/end/loop handles + playback mode, Bitwig-style), and Amp (the AHDSR
// that shapes every zone). Every edit reloads the live engine AND re-saves — the parent owns the
// program and the persistence, so this component is pure editing over a KeraProgram.

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { KeraProgram, KeraZone, KeraPlayMode } from '../../../../services/melos/instruments/kera/zones';
import { PLAYHEAD, SELECT, SURFACE } from '../theme';

interface Props {
  program: KeraProgram;
  /** Push an edited program: parent reloads the engine and persists (debounced). */
  onChange: (next: KeraProgram) => void;
  onClose: () => void;
}

type Tab = 'map' | 'wave' | 'amp';
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteLabel = (n: number) => `${NOTE[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
const ZONE_COLORS = ['#00DAF3', '#FF2E88', '#B84DFF', '#FFC24B', '#57E389', '#FF8C00'];
const LO_KEY = 21, HI_KEY = 108; // A0..C8, the mapped span of the grid

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const KeraEditor: React.FC<Props> = ({ program, onChange, onClose }) => {
  const [tab, setTab] = useState<Tab>('map');
  const [sel, setSel] = useState(0); // selected zone index
  const mapRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);

  const zones = program.zones;
  const zone = zones[sel] || zones[0];
  const sampleOf = (z?: KeraZone) => program.samples.find((s) => s.id === z?.sampleId);
  const sample = sampleOf(zone);

  /** Shallow-clone the program and hand it up (keeps the caller's reload/persist in one place). */
  const commit = useCallback((mut: (p: KeraProgram) => void) => {
    const next: KeraProgram = { ...program, zones: program.zones.map((z) => ({ ...z })), amp: { ...program.amp } };
    mut(next);
    onChange(next);
  }, [program, onChange]);

  const editZone = useCallback((i: number, mut: (z: KeraZone) => void) => {
    commit((p) => { const z = p.zones[i]; if (z) mut(z); });
  }, [commit]);

  // ── Mapping: drag a zone edge to reshape its key/velocity span ────────────────
  const keyToX = (k: number) => ((k - LO_KEY) / (HI_KEY - LO_KEY)) * 100;
  const velToY = (v: number) => (1 - v / 127) * 100;

  const beginDrag = (i: number, edge: 'l' | 'r' | 't' | 'b' | 'move') => (e: React.PointerEvent) => {
    e.stopPropagation();
    setSel(i);
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startZone = { ...zones[i] };
    const startX = e.clientX, startY = e.clientY;
    const move = (ev: PointerEvent) => {
      const dxKeys = ((ev.clientX - startX) / rect.width) * (HI_KEY - LO_KEY);
      const dyVel = -((ev.clientY - startY) / rect.height) * 127;
      editZone(i, (z) => {
        if (edge === 'l') z.loKey = clamp(Math.round(startZone.loKey + dxKeys), LO_KEY, z.hiKey);
        else if (edge === 'r') z.hiKey = clamp(Math.round(startZone.hiKey + dxKeys), z.loKey, HI_KEY);
        else if (edge === 't') z.hiVel = clamp(Math.round(startZone.hiVel + dyVel), z.loVel, 127);
        else if (edge === 'b') z.loVel = clamp(Math.round(startZone.loVel + dyVel), 1, z.hiVel);
        else if (edge === 'move') {
          const span = startZone.hiKey - startZone.loKey;
          const lo = clamp(Math.round(startZone.loKey + dxKeys), LO_KEY, HI_KEY - span);
          z.loKey = lo; z.hiKey = lo + span;
        }
      });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  // ── Wave: drag start / end / loop markers ────────────────────────────────────
  const frames = sample?.channels[0]?.length ?? 0;
  const wavePath = useMemo(() => {
    const ch = sample?.channels?.[0];
    if (!ch || !ch.length) return '';
    const N = 480, step = Math.max(1, Math.floor(ch.length / N));
    let d = 'M0 40';
    for (let x = 0; x < N; x++) {
      let peak = 0; const base = x * step;
      for (let j = 0; j < step; j += Math.max(1, (step / 8) | 0)) { const v = Math.abs(ch[base + j] || 0); if (v > peak) peak = v; }
      d += `L${(x / N) * 480} ${40 - peak * 38}`;
    }
    for (let x = N - 1; x >= 0; x--) {
      let peak = 0; const base = x * step;
      for (let j = 0; j < step; j += Math.max(1, (step / 8) | 0)) { const v = Math.abs(ch[base + j] || 0); if (v > peak) peak = v; }
      d += `L${(x / N) * 480} ${40 + peak * 38}`;
    }
    return d + 'Z';
  }, [sample]);

  const dragMarker = (which: 'start' | 'loopStart' | 'loopEnd' | 'end') => (e: React.PointerEvent) => {
    e.stopPropagation();
    const rect = waveRef.current?.getBoundingClientRect();
    if (!rect || !sample || !frames) return;
    const move = (ev: PointerEvent) => {
      const f = clamp(Math.round(((ev.clientX - rect.left) / rect.width) * frames), 0, frames);
      commit((p) => {
        const s = p.samples.find((x) => x.id === sample.id); if (!s) return;
        if (which === 'loopStart') s.loopStart = clamp(f, 0, s.loopEnd || frames);
        else if (which === 'loopEnd') s.loopEnd = clamp(f, s.loopStart, frames);
        // start/end are engine-wide sample bounds; modelled on loop for now (Phase 2: true trim).
      });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const setMode = (m: KeraPlayMode, loopMode: 'off' | 'forward' | 'sustain') => {
    commit((p) => {
      p.playMode = m;
      const s = p.samples.find((x) => x.id === zone?.sampleId);
      if (s) { s.loopMode = loopMode; if (loopMode !== 'off' && s.loopEnd <= s.loopStart) { s.loopStart = Math.floor(frames * 0.3); s.loopEnd = Math.floor(frames * 0.9); } }
    });
  };

  const loopMode = sample?.loopMode ?? 'off';

  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-4xl rounded-[20px] border border-white/[0.16] overflow-hidden shadow-2xl" style={{ background: SURFACE }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 h-12 border-b border-white/10" style={{ background: '#0C0C10' }}>
          <span className="font-black text-[13px] tracking-[0.08em]" style={{ color: PLAYHEAD }}>KERA</span>
          <span className="text-[11px] text-white/55">{program.name}</span>
          <div className="flex gap-1 ml-3">
            {([['map', 'Mapping'], ['wave', 'Wave'], ['amp', 'Amp']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                className="h-7 px-3 rounded-lg text-[11px]"
                style={tab === id ? { background: 'rgba(0,218,243,0.14)', color: PLAYHEAD } : { color: 'rgba(255,255,255,0.45)' }}>{label}</button>
            ))}
          </div>
          <span className="flex-1" />
          <button onClick={onClose} aria-label="Close editor" className="w-8 h-8 grid place-items-center rounded-lg border border-white/10 text-white/50 hover:text-white"><X size={15} /></button>
        </div>

        {/* ── MAPPING ── */}
        {tab === 'map' && (
          <div className="grid" style={{ gridTemplateColumns: '190px 1fr' }}>
            <div className="p-3 border-r border-white/10 max-h-[440px] overflow-y-auto" style={{ background: '#0C0C10' }}>
              <p className="text-[9px] uppercase tracking-[0.18em] text-white/30 font-semibold mb-2">Zones · {zones.length}</p>
              {zones.map((z, i) => (
                <button key={i} onClick={() => setSel(i)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg mb-1 text-left"
                  style={i === sel ? { background: 'rgba(255,46,136,0.14)', border: '1px solid rgba(255,46,136,0.5)' } : { border: '1px solid transparent' }}>
                  <span className="w-2.5 h-2.5 rounded-sm flex-none" style={{ background: ZONE_COLORS[i % ZONE_COLORS.length] }} />
                  <span className="flex-1 text-[11px] text-white/70 truncate">{sampleOf(z)?.name || `Zone ${i + 1}`}</span>
                  <span className="text-[9px] font-mono text-white/35">{noteLabel(z.loKey)}–{noteLabel(z.hiKey)}</span>
                </button>
              ))}
              {zone && (
                <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                  <p className="text-[9px] uppercase tracking-[0.18em] text-white/30 font-semibold">Selected zone</p>
                  <Stepper label="Root" value={sampleOf(zone)?.rootNote ?? 60} fmt={noteLabel} onStep={(d) => commit((p) => { const s = p.samples.find((x) => x.id === zone.sampleId); if (s) s.rootNote = clamp(s.rootNote + d, 0, 127); })} />
                  <Stepper label="Tune" value={zone.tuneSemis} fmt={(v) => `${v > 0 ? '+' : ''}${v} st`} onStep={(d) => editZone(sel, (z) => { z.tuneSemis = clamp(z.tuneSemis + d, -48, 48); })} />
                  <Stepper label="Vel lo" value={zone.loVel} fmt={String} onStep={(d) => editZone(sel, (z) => { z.loVel = clamp(z.loVel + d * 8, 1, z.hiVel); })} />
                  <Stepper label="Vel hi" value={zone.hiVel} fmt={String} onStep={(d) => editZone(sel, (z) => { z.hiVel = clamp(z.hiVel + d * 8, z.loVel, 127); })} />
                </div>
              )}
            </div>

            <div className="p-4">
              <div ref={mapRef} className="relative rounded-xl border border-white/10 overflow-hidden" style={{ height: 300, background: '#0B0B0F' }}>
                {/* velocity gridlines */}
                {[0.25, 0.5, 0.75].map((t) => <div key={t} className="absolute left-0 right-0 h-px" style={{ top: `${t * 100}%`, background: 'rgba(255,255,255,0.05)' }} />)}
                {/* zones */}
                {zones.map((z, i) => {
                  const left = keyToX(z.loKey), width = keyToX(z.hiKey) - keyToX(z.loKey);
                  const top = velToY(z.hiVel), height = velToY(z.loVel) - velToY(z.hiVel);
                  const c = ZONE_COLORS[i % ZONE_COLORS.length];
                  const isSel = i === sel;
                  return (
                    <div key={i} onPointerDown={beginDrag(i, 'move')}
                      className="absolute rounded-md flex items-start p-1.5 cursor-move"
                      style={{ left: `${left}%`, width: `${width}%`, top: `${top}%`, height: `${height}%`,
                        background: `${c}22`, border: `1px solid ${isSel ? SELECT : c}`, outline: isSel ? `1px solid ${SELECT}` : 'none', zIndex: isSel ? 5 : 1 }}>
                      <span className="text-[8.5px] font-mono truncate" style={{ color: c }}>{sampleOf(z)?.name}</span>
                      {isSel && (<>
                        <span onPointerDown={beginDrag(i, 'l')} className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize" style={{ background: SELECT }} />
                        <span onPointerDown={beginDrag(i, 'r')} className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize" style={{ background: SELECT }} />
                        <span onPointerDown={beginDrag(i, 't')} className="absolute left-0 right-0 top-0 h-1.5 cursor-ns-resize" style={{ background: SELECT }} />
                        <span onPointerDown={beginDrag(i, 'b')} className="absolute left-0 right-0 bottom-0 h-1.5 cursor-ns-resize" style={{ background: SELECT }} />
                      </>)}
                    </div>
                  );
                })}
              </div>
              {/* keyboard */}
              <div className="flex mt-1.5 rounded overflow-hidden border border-white/10" style={{ height: 20 }}>
                {Array.from({ length: HI_KEY - LO_KEY }, (_, i) => {
                  const m = LO_KEY + i; const isC = m % 12 === 0;
                  return <div key={i} className="flex-1 relative" style={{ background: [1, 3, 6, 8, 10].includes(m % 12) ? '#141419' : '#23232c', borderRight: '1px solid rgba(0,0,0,0.5)' }}>
                    {isC && <span className="absolute bottom-0 left-0 right-0 text-center text-[6px] font-mono text-white/30">{noteLabel(m)}</span>}
                  </div>;
                })}
              </div>
              <p className="text-[9px] text-white/25 mt-2">Drag a zone to move it; drag its edges to reshape the key and velocity span. Vertical = velocity, horizontal = pitch.</p>
            </div>
          </div>
        )}

        {/* ── WAVE ── */}
        {tab === 'wave' && (
          <div className="p-4">
            {sample && frames ? (
              <>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="text-[9px] uppercase tracking-[0.18em] text-white/30 font-semibold mr-1">Playback</span>
                  {([['One-shot', 'repitch', 'off'], ['Loop · fwd', 'repitch', 'forward'], ['Loop · sustain', 'repitch', 'sustain']] as const).map(([label, pm, lm]) => (
                    <button key={label} onClick={() => setMode(pm as KeraPlayMode, lm as 'off' | 'forward' | 'sustain')}
                      className="h-7 px-3 rounded-lg text-[11px] font-mono"
                      style={loopMode === lm ? { background: PLAYHEAD, color: '#06222a', fontWeight: 600 } : { border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)' }}>{label}</button>
                  ))}
                </div>
                <div ref={waveRef} className="relative rounded-xl border border-white/10 overflow-hidden" style={{ height: 160, background: 'linear-gradient(180deg,#0d0d12,#0a0a0e)' }}>
                  {loopMode !== 'off' && sample.loopEnd > sample.loopStart && (
                    <div className="absolute top-0 bottom-0" style={{ left: `${(sample.loopStart / frames) * 100}%`, width: `${((sample.loopEnd - sample.loopStart) / frames) * 100}%`, background: 'rgba(255,46,136,0.12)', borderLeft: `2px solid ${SELECT}`, borderRight: `2px solid ${SELECT}` }} />
                  )}
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 480 80" preserveAspectRatio="none"><path d={wavePath} fill="rgba(0,218,243,0.28)" stroke={PLAYHEAD} strokeWidth="0.6" /></svg>
                  {loopMode !== 'off' && (<>
                    <Marker x={(sample.loopStart / frames) * 100} color={SELECT} label="loop" onDown={dragMarker('loopStart')} />
                    <Marker x={(sample.loopEnd / frames) * 100} color={SELECT} label="end" onDown={dragMarker('loopEnd')} />
                  </>)}
                </div>
                <div className="flex gap-4 mt-3 text-[10px] font-mono text-white/40">
                  <span>root <b className="text-white/70">{noteLabel(sample.rootNote)}</b></span>
                  <span>{sample.sampleRate} Hz</span>
                  <span>{(frames / sample.sampleRate).toFixed(2)} s</span>
                  <span>{sample.channels.length === 2 ? 'stereo' : 'mono'}</span>
                  {loopMode !== 'off' && <span>loop <b className="text-white/70">{sample.loopStart}–{sample.loopEnd}</b></span>}
                </div>
                <p className="text-[9px] text-white/25 mt-2">Pick a loop mode, then drag the pink markers to set the loop. Sustain loops hold under a held note; forward loops run the whole time.</p>
              </>
            ) : (
              <p className="text-[12px] text-white/40 py-10 text-center">Select a zone with a sample on the Mapping tab.</p>
            )}
          </div>
        )}

        {/* ── AMP ── */}
        {tab === 'amp' && (
          <div className="p-5">
            <p className="text-[9px] uppercase tracking-[0.18em] text-white/30 font-semibold mb-3">Amp envelope · shapes every zone</p>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
              {([['attack', 'Attack', 4], ['hold', 'Hold', 2], ['decay', 'Decay', 4], ['sustain', 'Sustain', 1], ['release', 'Release', 4]] as const).map(([k, label, max]) => (
                <Slider key={k} label={label} value={program.amp[k]} max={max} unit={k === 'sustain' ? '' : 's'}
                  onChange={(v) => commit((p) => { p.amp = { ...p.amp, [k]: v }; })} />
              ))}
            </div>
            <p className="text-[9px] text-white/25 mt-4">The sampler's own AHDSR, before KERA's shared filter and spatial stage. Sustain holds while a key is down; release shapes the tail.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const Stepper: React.FC<{ label: string; value: number; fmt: (v: number) => string; onStep: (d: number) => void }> = ({ label, value, fmt, onStep }) => (
  <div className="flex items-center gap-2">
    <span className="text-[10px] text-white/45 flex-1">{label}</span>
    <button onClick={() => onStep(-1)} className="w-6 h-6 rounded-md border border-white/12 text-white/60 hover:text-white text-[13px] leading-none">–</button>
    <span className="w-12 text-center text-[11px] font-mono text-white/80">{fmt(value)}</span>
    <button onClick={() => onStep(1)} className="w-6 h-6 rounded-md border border-white/12 text-white/60 hover:text-white text-[13px] leading-none">+</button>
  </div>
);

const Marker: React.FC<{ x: number; color: string; label: string; onDown: (e: React.PointerEvent) => void }> = ({ x, color, label, onDown }) => (
  <div className="absolute top-0 bottom-0 cursor-ew-resize" style={{ left: `${x}%`, width: 0, borderLeft: `2px solid ${color}` }} onPointerDown={onDown}>
    <span className="absolute top-1 left-1 text-[8px] font-mono px-1 rounded" style={{ background: 'rgba(0,0,0,0.6)', color }}>{label}</span>
    <span className="absolute bottom-2 -left-1.5 w-3 h-4 rounded-sm" style={{ background: color }} />
  </div>
);

const Slider: React.FC<{ label: string; value: number; max: number; unit: string; onChange: (v: number) => void }> = ({ label, value, max, unit, onChange }) => (
  <div className="flex flex-col items-center gap-2">
    <span className="text-[10px] text-white/45">{label}</span>
    <input type="range" min={0} max={max} step={max / 200} value={value} onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full" style={{ accentColor: '#FF8C00' }} />
    <span className="text-[10px] font-mono text-white/65">{unit === 's' ? `${(value * 1000).toFixed(0)}ms` : value.toFixed(2)}</span>
  </div>
);
