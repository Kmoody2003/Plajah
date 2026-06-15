// components/TimelineStrip.tsx — natural-language marker timeline. Drop a
// marker, type plain English ("drop hard, go violet, kinetic"), and as the
// playhead reaches it the parsed instruction is applied to the whole config.
// Self-contained: owns its markers; emits config patches via onApply.

import React, { useEffect, useRef, useState } from 'react';
import { Plus, Wand2, X } from 'lucide-react';
import { VisualizationConfig } from '../types';
import { parseInstruction, describeDiff } from '../engine/timeline/parser';
import { applyDiffToConfig } from '../engine/timeline/applyToConfig';
import { ParamDiff } from '../engine/timeline/types';

interface Marker { id: string; time: number; label: string; diff: ParamDiff; }

interface Props {
  duration: number;
  currentTime: number;
  visible: boolean;
  onApply: (patch: Partial<VisualizationConfig>) => void;
  /** Render inline at the bottom of the deck instead of as a floating strip. */
  embedded?: boolean;
}

const AUTOPILOT = [
  'calm aurora intro in ocean blue', 'build tension, faster', 'drop hard, kinetic, violet',
  'liquid plasma flow', 'tranquil breakdown, dark', 'sunset nebula, bright',
  'kaleido mirror peak', 'ripple outro, slow',
];
const CHIPS = ['drop hard, violet', 'tranquil aurora, ocean', 'liquid plasma flow', 'kaleido mirror peak', 'sunset nebula bright', 'half speed, dark', '3d raymarch tunnel', 'glow up, kinetic'];

const uid = () => Math.random().toString(36).slice(2, 9);

const TimelineStrip: React.FC<Props> = ({ duration, currentTime, visible, onApply, embedded }) => {
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [pop, setPop] = useState<{ time: number; x: number } | null>(null);
  const [text, setText] = useState('');
  const trackRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<Marker | null>(null);
  const dur = duration || 180;

  // evaluate active marker as the playhead advances
  useEffect(() => {
    let cur: Marker | null = null;
    for (const m of markers) { if (m.time <= currentTime) cur = m; else break; }
    if (cur && cur !== activeRef.current) { activeRef.current = cur; onApply(applyDiffToConfig(cur.diff)); }
    if (!cur) activeRef.current = null;
  }, [currentTime, markers, onApply]);

  const sorted = (list: Marker[]) => [...list].sort((a, b) => a.time - b.time);
  function addMarker(time: number, label: string) {
    if (!label.trim()) return;
    setMarkers(m => sorted([...m, { id: uid(), time, label: label.trim(), diff: parseInstruction(label) }]));
  }
  function removeMarker(id: string) { setMarkers(m => m.filter(x => x.id !== id)); }
  function autopilot() {
    setMarkers(sorted(AUTOPILOT.map((t, i) => ({ id: uid(), time: dur * (i / AUTOPILOT.length), label: t, diff: parseInstruction(t) }))));
  }

  function openPop(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('.tl-marker')) return;
    const r = trackRef.current!.getBoundingClientRect();
    const time = (e.clientX - r.left) / r.width * dur;
    setText(''); setPop({ time, x: Math.min(Math.max(12, e.clientX - 160), window.innerWidth - 332) });
  }

  if (!visible) return null;
  const preview = text.trim() ? '→ ' + describeDiff(parseInstruction(text)) : '';

  return (
    <>
      <div style={embedded ? {
        position: 'relative', zIndex: 27, height: 54, margin: '0 10px 8px',
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12,
        padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, flex: 'none',
      } : {
        position: 'absolute', bottom: 96, left: 18, right: 18, zIndex: 27, height: 54,
        background: 'rgba(18,18,26,0.45)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 16,
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', padding: '8px 12px',
        display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
      }}>
        <div style={{ fontSize: 9, letterSpacing: '0.16em', color: 'rgba(244,242,255,0.32)', textTransform: 'uppercase', writingMode: 'vertical-rl', transform: 'rotate(180deg)', flex: 'none' }}>Timeline</div>
        <div ref={trackRef} onClick={openPop} style={{ position: 'relative', flex: 1, height: 38, background: 'linear-gradient(rgba(255,255,255,0.04),rgba(255,255,255,0.02))', borderRadius: 9, cursor: 'crosshair', overflow: 'hidden' }}>
          {Array.from({ length: 15 }).map((_, i) => (
            <i key={i} style={{ position: 'absolute', top: 0, bottom: 0, width: 1, left: `${(i + 1) / 16 * 100}%`, background: 'rgba(255,255,255,0.05)' }} />
          ))}
          <div style={{ position: 'absolute', top: 0, bottom: 0, width: 2, left: `${currentTime / dur * 100}%`, background: '#ff5db1', boxShadow: '0 0 8px #ff5db1', zIndex: 5 }} />
          {markers.map(m => {
            const active = activeRef.current?.id === m.id;
            return (
              <div key={m.id} className="tl-marker" title={describeDiff(m.diff)}
                style={{ position: 'absolute', top: 3, bottom: 3, left: `${m.time / dur * 100}%`, minWidth: 5, borderRadius: 5, background: 'linear-gradient(160deg, rgba(181,108,255,0.85), rgba(255,93,177,0.7))', border: '1px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', padding: '0 6px', overflow: 'hidden', boxShadow: '0 4px 14px rgba(150,80,255,0.4)', outline: active ? '2px solid #fff' : 'none' }}>
                <span style={{ fontSize: 9, fontWeight: 600, whiteSpace: 'nowrap', color: '#fff', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.label}</span>
                <span onClick={(e) => { e.stopPropagation(); removeMarker(m.id); }} style={{ marginLeft: 4, fontSize: 9, color: '#fff', cursor: 'pointer', opacity: 0.8 }}>✕</span>
              </div>
            );
          })}
        </div>
        <button onClick={autopilot} title="Auto-pilot show" style={btn()}><Wand2 size={14} /></button>
        <button onClick={() => setPop({ time: currentTime, x: window.innerWidth / 2 - 160 })} title="Add marker at playhead" style={btn()}><Plus size={16} /></button>
      </div>

      {pop && (
        <div style={{ position: 'fixed', zIndex: 240, width: 320, left: pop.x, bottom: 160, background: 'rgba(20,18,30,0.94)', border: '1px solid rgba(255,255,255,0.22)', borderRadius: 16, backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)', padding: 14, boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ fontSize: 12, color: '#f4f2ff', margin: 0 }}>Marker instruction</h4>
            <X size={14} style={{ cursor: 'pointer', color: 'rgba(244,242,255,0.6)' }} onClick={() => setPop(null)} />
          </div>
          <p style={{ fontSize: 10, color: 'rgba(244,242,255,0.32)', margin: '3px 0 10px' }}>Tell the show what to do here — plain English.</p>
          <input autoFocus value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { addMarker(pop.time, text); setPop(null); } if (e.key === 'Escape') setPop(null); }}
            placeholder="e.g. drop hard, go violet, kinetic"
            style={{ width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 10, color: '#f4f2ff', fontSize: 12, outline: 'none' }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, margin: '9px 0' }}>
            {CHIPS.map(c => (
              <span key={c} onClick={() => setText(c)} style={{ fontSize: 9.5, padding: '4px 8px', borderRadius: 20, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', color: 'rgba(244,242,255,0.55)' }}>{c}</span>
            ))}
          </div>
          <div style={{ fontSize: 9.5, color: '#5ef0a8', fontFamily: 'ui-monospace, monospace', minHeight: 13, marginBottom: 8 }}>{preview}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setPop(null)} style={{ ...btn(), flex: 1, width: 'auto', height: 34 }}>Cancel</button>
            <button onClick={() => { addMarker(pop.time, text); setPop(null); }} style={{ flex: 1, height: 34, borderRadius: 11, border: 'none', background: 'linear-gradient(135deg,#b56cff,#ff5db1)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Add marker</button>
          </div>
        </div>
      )}
    </>
  );
};

function btn(): React.CSSProperties {
  return { flex: 'none', width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)', color: '#f4f2ff', cursor: 'pointer', display: 'grid', placeItems: 'center' };
}

export default TimelineStrip;
