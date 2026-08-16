// KERA — the deep editor, built to the approved design: one window, not tabbed panels.
//
//   left   — groups & zones, round-robin, velocity layers          (what plays)
//   centre — the keyboard×velocity map + the wave strip beneath it  (where + how it plays)
//   right  — amp envelope, filter, LFO, spatial                     (how it's shaped)
//
// Amp shapes every zone and is saved with the program; filter, LFO and spatial drive the shared
// engine voice live (KERA runs through the same filter/amp/spatial stage as ONDA).

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { KeraProgram, KeraZone, KeraPlayMode } from '../../../../services/melos/instruments/kera/zones';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { F, flt, MOD_SOURCE } from '../../../../services/melos/instruments/onda/params';
import { Knob } from '../shared/Knob';
import { ARMED, PLAYHEAD, SELECT, SURFACE } from '../theme';

interface Props {
  program: KeraProgram;
  trackId: string;
  onChange: (next: KeraProgram) => void;
  onClose: () => void;
}

const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteLabel = (n: number) => `${NOTE[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
const ZONE_COLORS = ['#00DAF3', '#FF2E88', '#B84DFF', '#FFC24B', '#57E389', '#FF8C00'];
const LO_KEY = 21, HI_KEY = 108;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const KeraEditor: React.FC<Props> = ({ program, trackId, onChange, onClose }) => {
  const [sel, setSel] = useState(0);
  const [lfoOn, setLfoOn] = useState(false);
  const [live, setLive] = useState({ cut: 1, res: 0.12, drive: 0.1, lfoRate: 0.3, lfoDepth: 0.3, x: 0, y: 0 });
  const mapRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);

  const zones = program.zones;
  const zone = zones[sel] || zones[0];
  const sampleOf = (z?: KeraZone) => program.samples.find((s) => s.id === z?.sampleId);
  const sample = sampleOf(zone);
  const frames = sample?.channels[0]?.length ?? 0;
  const loopMode = sample?.loopMode ?? 'off';

  const inst = () => BeatsEngine.get().getInstrument(trackId);

  const commit = useCallback((mut: (p: KeraProgram) => void) => {
    const next: KeraProgram = { ...program, zones: program.zones.map((z) => ({ ...z })), amp: { ...program.amp } };
    mut(next);
    onChange(next);
  }, [program, onChange]);
  const editZone = useCallback((i: number, mut: (z: KeraZone) => void) => commit((p) => { const z = p.zones[i]; if (z) mut(z); }), [commit]);

  // live engine params (filter / lfo / spatial) — audible immediately; amp is the saved one
  const setLiveParam = useCallback((patch: Partial<typeof live>) => {
    setLive((prev) => {
      const n = { ...prev, ...patch };
      const i = inst();
      if (i) {
        if (patch.cut !== undefined) i.setParam(flt(0, F.CUTOFF), n.cut);
        if (patch.res !== undefined) i.setParam(flt(0, F.RES), n.res);
        if (patch.drive !== undefined) i.setParam(flt(0, F.DRIVE), n.drive);
        if (patch.x !== undefined || patch.y !== undefined) i.setSpatial({ position: [n.x, 0, -1 + n.y] });
      }
      return n;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleLfo = useCallback(() => {
    setLfoOn((on) => {
      const next = !on;
      inst()?.setRoute(0, MOD_SOURCE.Lfo1, flt(0, F.CUTOFF), next ? live.lfoDepth : 0);
      return next;
    });
  }, [live.lfoDepth]);

  // ── mapping drag ─────────────────────────────────────────────────────────────
  const keyToX = (k: number) => ((k - LO_KEY) / (HI_KEY - LO_KEY)) * 100;
  const velToY = (v: number) => (1 - v / 127) * 100;
  const beginDrag = (i: number, edge: 'l' | 'r' | 't' | 'b' | 'move') => (e: React.PointerEvent) => {
    e.stopPropagation(); setSel(i);
    const rect = mapRef.current?.getBoundingClientRect(); if (!rect) return;
    const s0 = { ...zones[i] }; const sx = e.clientX, sy = e.clientY;
    const move = (ev: PointerEvent) => {
      const dK = ((ev.clientX - sx) / rect.width) * (HI_KEY - LO_KEY);
      const dV = -((ev.clientY - sy) / rect.height) * 127;
      editZone(i, (z) => {
        if (edge === 'l') z.loKey = clamp(Math.round(s0.loKey + dK), LO_KEY, z.hiKey);
        else if (edge === 'r') z.hiKey = clamp(Math.round(s0.hiKey + dK), z.loKey, HI_KEY);
        else if (edge === 't') z.hiVel = clamp(Math.round(s0.hiVel + dV), z.loVel, 127);
        else if (edge === 'b') z.loVel = clamp(Math.round(s0.loVel + dV), 1, z.hiVel);
        else { const span = s0.hiKey - s0.loKey; const lo = clamp(Math.round(s0.loKey + dK), LO_KEY, HI_KEY - span); z.loKey = lo; z.hiKey = lo + span; }
      });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  // ── wave ─────────────────────────────────────────────────────────────────────
  const wavePath = useMemo(() => {
    const ch = sample?.channels?.[0]; if (!ch || !ch.length) return '';
    const N = 460, step = Math.max(1, Math.floor(ch.length / N)); let d = 'M0 40';
    for (let x = 0; x < N; x++) { let pk = 0; const b = x * step; for (let j = 0; j < step; j += Math.max(1, (step / 8) | 0)) { const v = Math.abs(ch[b + j] || 0); if (v > pk) pk = v; } d += `L${(x / N) * 460} ${40 - pk * 38}`; }
    for (let x = N - 1; x >= 0; x--) { let pk = 0; const b = x * step; for (let j = 0; j < step; j += Math.max(1, (step / 8) | 0)) { const v = Math.abs(ch[b + j] || 0); if (v > pk) pk = v; } d += `L${(x / N) * 460} ${40 + pk * 38}`; }
    return d + 'Z';
  }, [sample]);
  const dragMarker = (which: 'loopStart' | 'loopEnd') => (e: React.PointerEvent) => {
    e.stopPropagation(); const rect = waveRef.current?.getBoundingClientRect(); if (!rect || !sample || !frames) return;
    const move = (ev: PointerEvent) => {
      const f = clamp(Math.round(((ev.clientX - rect.left) / rect.width) * frames), 0, frames);
      commit((p) => { const s = p.samples.find((x) => x.id === sample.id); if (!s) return; if (which === 'loopStart') s.loopStart = clamp(f, 0, s.loopEnd || frames); else s.loopEnd = clamp(f, s.loopStart, frames); });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const setMode = (m: KeraPlayMode, lm: 'off' | 'forward' | 'sustain') => commit((p) => {
    p.playMode = m; const s = p.samples.find((x) => x.id === zone?.sampleId);
    if (s) { s.loopMode = lm; if (lm !== 'off' && s.loopEnd <= s.loopStart) { s.loopStart = Math.floor(frames * 0.3); s.loopEnd = Math.floor(frames * 0.9); } }
  });

  const addLayer = () => commit((p) => { if (!zone) return; p.zones.push({ ...zone, loVel: 1, hiVel: Math.max(1, zone.loVel - 1), rrIndex: 0 }); });

  // amp envelope curve
  const amp = program.amp;
  const ampPath = useMemo(() => {
    const A = Math.min(1, amp.attack / 2), H = Math.min(0.4, amp.hold / 2), D = Math.min(1, amp.decay / 2), S = amp.sustain, R = Math.min(1, amp.release / 2);
    const x1 = A * 40, x2 = x1 + H * 20, x3 = x2 + D * 40, xr = x3 + 30 + R * 40;
    return `M0 46 L${x1.toFixed(1)} 4 L${x2.toFixed(1)} 4 L${x3.toFixed(1)} ${(46 - S * 42).toFixed(1)} L${(x3 + 30).toFixed(1)} ${(46 - S * 42).toFixed(1)} L${Math.min(198, xr).toFixed(1)} 46`;
  }, [amp]);

  // round-robin count for the selected zone's group
  const rrCount = zone ? Math.max(1, zones.filter((z) => z.rrGroup === zone.rrGroup && z.loKey === zone.loKey && z.hiKey === zone.hiKey).length) : 1;

  const D = (label: string, value: number, color: string, onCh: (v: number) => void, fmt?: (v: number) => string, min = 0, max = 1) => (
    <Knob label={label} value={value} min={min} max={max} defaultValue={value} size={38} color={color} format={fmt || ((v) => `${Math.round(v * 100)}`)} onChange={onCh} />
  );

  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-black/72 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-5xl rounded-[20px] border border-white/[0.16] overflow-hidden shadow-2xl" style={{ background: SURFACE }} onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex items-center gap-3 px-4 h-12 border-b border-white/10" style={{ background: '#0C0C10' }}>
          <span className="w-8 h-8 rounded-lg flex-none" style={{ background: 'conic-gradient(from 210deg at 60% 40%,#0a5f6d,#00DAF3,#8a5bff,#0a5f6d)' }} />
          <span className="font-black text-[13px] tracking-[0.1em]" style={{ color: PLAYHEAD }}>KERA</span>
          <div className="flex flex-col leading-tight">
            <span className="text-[12px] font-semibold text-white">{program.name}</span>
            <span className="font-mono text-[9px] text-white/35">{program.source.toUpperCase()} · {zones.length} zones · {rrCount} RR</span>
          </div>
          <span className="flex-1" />
          <button onClick={onClose} aria-label="Close editor" className="w-8 h-8 grid place-items-center rounded-lg border border-white/10 text-white/50 hover:text-white"><X size={15} /></button>
        </div>

        <div className="grid" style={{ gridTemplateColumns: '196px 1fr 216px' }}>
          {/* LEFT — groups & zones */}
          <div className="p-3 border-r border-white/10 max-h-[480px] overflow-y-auto" style={{ background: '#0C0C10' }}>
            <p className="text-[9px] uppercase tracking-[0.18em] text-white/30 font-semibold mb-2">Groups &amp; zones</p>
            {zones.map((z, i) => (
              <button key={i} onClick={() => setSel(i)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg mb-1 text-left"
                style={i === sel ? { background: 'rgba(255,46,136,0.14)', border: '1px solid rgba(255,46,136,0.5)' } : { border: '1px solid transparent' }}>
                <span className="w-2.5 h-2.5 rounded-sm flex-none" style={{ background: ZONE_COLORS[i % ZONE_COLORS.length] }} />
                <span className="flex-1 text-[11px] text-white/70 truncate">{sampleOf(z)?.name || `Zone ${i + 1}`}</span>
                <span className="text-[9px] font-mono text-white/35">{noteLabel(z.loKey)}–{noteLabel(z.hiKey)}</span>
              </button>
            ))}

            <p className="text-[9px] uppercase tracking-[0.18em] text-white/30 font-semibold mt-3 mb-1.5">Round robin</p>
            <div className="flex gap-1">
              {Array.from({ length: Math.max(3, rrCount) }, (_, i) => (
                <span key={i} className="w-4 h-4 rounded-[4px] grid place-items-center font-mono text-[9px]"
                  style={i < rrCount ? { background: 'rgba(0,218,243,0.16)', color: PLAYHEAD, border: '1px solid rgba(0,218,243,0.4)' } : { background: '#1d1d24', color: 'rgba(255,255,255,0.3)' }}>{i + 1}</span>
              ))}
            </div>

            <p className="text-[9px] uppercase tracking-[0.18em] text-white/30 font-semibold mt-3 mb-1.5">Velocity layers</p>
            <div className="space-y-1.5">
              {zones.map((z, i) => (
                <div key={i} className="h-2 rounded-full relative" style={{ background: '#1d1d24' }}>
                  <span className="absolute top-0 bottom-0 rounded-full" style={{ left: `${(z.loVel / 127) * 100}%`, width: `${((z.hiVel - z.loVel) / 127) * 100}%`, background: ZONE_COLORS[i % ZONE_COLORS.length] }} />
                </div>
              ))}
            </div>

            <button onClick={addLayer} className="w-full h-8 mt-3 rounded-lg border border-dashed border-white/20 text-white/50 hover:text-white text-[11px]">+ Add layer</button>

            {zone && (
              <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                <Stepper label="Root" value={sampleOf(zone)?.rootNote ?? 60} fmt={noteLabel} onStep={(d) => commit((p) => { const s = p.samples.find((x) => x.id === zone.sampleId); if (s) s.rootNote = clamp(s.rootNote + d, 0, 127); })} />
                <Stepper label="Tune" value={zone.tuneSemis} fmt={(v) => `${v > 0 ? '+' : ''}${v} st`} onStep={(d) => editZone(sel, (z) => { z.tuneSemis = clamp(z.tuneSemis + d, -48, 48); })} />
              </div>
            )}
          </div>

          {/* CENTRE — map + wave */}
          <div className="p-3.5">
            <div ref={mapRef} className="relative rounded-xl border border-white/10 overflow-hidden" style={{ height: 210, background: '#0B0B0F' }}>
              <div className="absolute left-0 top-0 bottom-[18px] w-6 border-r border-white/10 flex flex-col justify-between py-1 z-10" style={{ background: '#0B0B0F' }}>
                {[127, 96, 64, 32, 1].map((v) => <span key={v} className="text-center font-mono text-[7px] text-white/30">{v}</span>)}
              </div>
              <div className="absolute" style={{ left: 24, right: 0, top: 0, bottom: 18 }}>
                {[0.25, 0.5, 0.75].map((t) => <div key={t} className="absolute left-0 right-0 h-px" style={{ top: `${t * 100}%`, background: 'rgba(255,255,255,0.05)' }} />)}
                {zones.map((z, i) => {
                  const left = keyToX(z.loKey), width = keyToX(z.hiKey) - keyToX(z.loKey);
                  const top = velToY(z.hiVel), height = velToY(z.loVel) - velToY(z.hiVel);
                  const c = ZONE_COLORS[i % ZONE_COLORS.length]; const isSel = i === sel;
                  return (
                    <div key={i} onPointerDown={beginDrag(i, 'move')} className="absolute rounded-md flex items-start p-1 cursor-move"
                      style={{ left: `${left}%`, width: `${width}%`, top: `${top}%`, height: `${height}%`, background: `${c}22`, border: `1px solid ${isSel ? SELECT : c}`, outline: isSel ? `1px solid ${SELECT}` : 'none', zIndex: isSel ? 5 : 1 }}>
                      <span className="text-[8px] font-mono truncate" style={{ color: c }}>{sampleOf(z)?.name}</span>
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
              <div className="absolute flex" style={{ left: 24, right: 0, bottom: 0, height: 18 }}>
                {Array.from({ length: HI_KEY - LO_KEY }, (_, i) => { const m = LO_KEY + i; const isC = m % 12 === 0;
                  return <div key={i} className="flex-1 relative" style={{ background: [1, 3, 6, 8, 10].includes(m % 12) ? '#141419' : '#23232c', borderRight: '1px solid rgba(0,0,0,0.5)' }}>
                    {isC && <span className="absolute bottom-0 left-0 right-0 text-center text-[6px] font-mono text-white/30">{noteLabel(m)}</span>}
                  </div>; })}
              </div>
            </div>

            {/* wave strip */}
            <div className="mt-3 rounded-xl border border-white/10 p-3" style={{ background: '#0B0B0F' }}>
              {sample && frames ? (<>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-[9px] uppercase tracking-[0.16em] text-white/30 font-semibold mr-1">Playback</span>
                  {([['One-shot', 'repitch', 'off'], ['Loop · fwd', 'repitch', 'forward'], ['Loop · sustain', 'repitch', 'sustain']] as const).map(([l, pm, lm]) => (
                    <button key={l} onClick={() => setMode(pm as KeraPlayMode, lm as 'off' | 'forward' | 'sustain')} className="h-6 px-2.5 rounded-lg text-[10px] font-mono"
                      style={loopMode === lm ? { background: PLAYHEAD, color: '#06222a', fontWeight: 600 } : { border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)' }}>{l}</button>
                  ))}
                </div>
                <div ref={waveRef} className="relative rounded-lg overflow-hidden" style={{ height: 96, background: 'linear-gradient(180deg,#0d0d12,#0a0a0e)' }}>
                  {loopMode !== 'off' && sample.loopEnd > sample.loopStart && (
                    <div className="absolute top-0 bottom-0" style={{ left: `${(sample.loopStart / frames) * 100}%`, width: `${((sample.loopEnd - sample.loopStart) / frames) * 100}%`, background: 'rgba(255,46,136,0.10)', borderLeft: `2px solid ${SELECT}`, borderRight: `2px solid ${SELECT}` }} />
                  )}
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 460 80" preserveAspectRatio="none"><path d={wavePath} fill="rgba(0,218,243,0.26)" stroke={PLAYHEAD} strokeWidth="0.6" /></svg>
                  {loopMode !== 'off' && (<>
                    <Marker x={(sample.loopStart / frames) * 100} color={SELECT} label="loop" onDown={dragMarker('loopStart')} />
                    <Marker x={(sample.loopEnd / frames) * 100} color={SELECT} label="end" onDown={dragMarker('loopEnd')} />
                  </>)}
                </div>
                <div className="flex gap-3.5 mt-2 font-mono text-[9px] text-white/40">
                  <span>root <b className="text-white/70">{noteLabel(sample.rootNote)}</b></span>
                  <span>{sample.sampleRate} Hz</span>
                  <span>{(frames / sample.sampleRate).toFixed(2)} s</span>
                  <span>{sample.channels.length === 2 ? 'stereo' : 'mono'}</span>
                </div>
              </>) : <p className="text-[11px] text-white/40 py-6 text-center">Select a zone with a sample.</p>}
            </div>
          </div>

          {/* RIGHT — modulation */}
          <div className="p-3 border-l border-white/10 space-y-2.5" style={{ background: '#0C0C10' }}>
            <div className="rounded-xl border border-white/10 p-2.5" style={{ background: '#17171D' }}>
              <p className="text-[10px] font-semibold text-white mb-1.5 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-sm" style={{ background: ARMED }} />Amp<span className="ml-auto font-mono text-[8px] text-white/30">AHDSR · saved</span></p>
              <svg viewBox="0 0 200 50" className="w-full" style={{ height: 44 }} preserveAspectRatio="none"><path d={ampPath} fill="none" stroke={ARMED} strokeWidth="2" /><path d={`${ampPath} L200 50 L0 50 Z`} fill="rgba(255,140,0,0.10)" /></svg>
              <div className="flex justify-between mt-1.5">
                {D('Atk', amp.attack, ARMED, (v) => commit((p) => { p.amp = { ...p.amp, attack: v }; }), (v) => `${(v * 1000).toFixed(0)}`, 0, 4)}
                {D('Dec', amp.decay, ARMED, (v) => commit((p) => { p.amp = { ...p.amp, decay: v }; }), (v) => `${(v * 1000).toFixed(0)}`, 0, 4)}
                {D('Sus', amp.sustain, ARMED, (v) => commit((p) => { p.amp = { ...p.amp, sustain: v }; }), (v) => `${Math.round(v * 100)}`, 0, 1)}
                {D('Rel', amp.release, ARMED, (v) => commit((p) => { p.amp = { ...p.amp, release: v }; }), (v) => `${(v * 1000).toFixed(0)}`, 0, 4)}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 p-2.5" style={{ background: '#17171D' }}>
              <p className="text-[10px] font-semibold text-white mb-1.5 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-sm" style={{ background: PLAYHEAD }} />Filter<span className="ml-auto font-mono text-[8px] text-white/30">ladder · live</span></p>
              <div className="flex justify-between">
                {D('Cut', live.cut, PLAYHEAD, (v) => setLiveParam({ cut: v }))}
                {D('Res', live.res, PLAYHEAD, (v) => setLiveParam({ res: v }))}
                {D('Drv', live.drive, PLAYHEAD, (v) => setLiveParam({ drive: v }))}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 p-2.5" style={{ background: '#17171D' }}>
              <p className="text-[10px] font-semibold text-white mb-1.5 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-sm" style={{ background: '#B84DFF' }} />LFO 1
                <button onClick={toggleLfo} className="ml-auto font-mono text-[8px] px-1.5 py-0.5 rounded" style={lfoOn ? { background: 'rgba(184,77,255,0.2)', color: '#D6B0FF' } : { color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.12)' }}>→cut {lfoOn ? 'on' : 'off'}</button></p>
              <div className="flex justify-between">
                {D('Rate', live.lfoRate, '#B84DFF', (v) => setLive((p) => ({ ...p, lfoRate: v })))}
                {D('Depth', live.lfoDepth, '#B84DFF', (v) => { setLive((p) => ({ ...p, lfoDepth: v })); if (lfoOn) inst()?.setRoute(0, MOD_SOURCE.Lfo1, flt(0, F.CUTOFF), v); })}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 p-2.5" style={{ background: '#17171D' }}>
              <p className="text-[10px] font-semibold text-white mb-1.5 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-sm" style={{ background: PLAYHEAD }} />Spatial<span className="ml-auto font-mono text-[8px] text-white/30">position</span></p>
              <div className="relative rounded-lg border border-white/10 cursor-crosshair" style={{ height: 84, background: '#0B0B0F' }}
                onPointerDown={(e) => {
                  const el = e.currentTarget; const r = el.getBoundingClientRect();
                  const mv = (cx: number, cy: number) => { const x = clamp((cx - r.left) / r.width * 2 - 1, -1, 1); const y = clamp(1 - (cy - r.top) / r.height, 0, 1); setLiveParam({ x, y }); };
                  mv(e.clientX, e.clientY);
                  const move = (ev: PointerEvent) => mv(ev.clientX, ev.clientY);
                  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
                  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
                }}>
                <div className="absolute inset-0" style={{ background: 'repeating-linear-gradient(90deg,rgba(255,255,255,.04) 0 1px,transparent 1px 25%),repeating-linear-gradient(0deg,rgba(255,255,255,.04) 0 1px,transparent 1px 25%)' }} />
                <div className="absolute w-3 h-3 rounded-full" style={{ left: `${(live.x + 1) / 2 * 100}%`, top: `${(1 - live.y) * 100}%`, transform: 'translate(-50%,-50%)', background: PLAYHEAD, boxShadow: `0 0 12px ${PLAYHEAD}` }} />
              </div>
            </div>
          </div>
        </div>
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
  </div>
);
