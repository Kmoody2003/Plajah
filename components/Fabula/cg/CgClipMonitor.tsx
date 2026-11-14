// CgClipMonitor — a Fabula CG graphic placed on the timeline as a title clip
// carrying `cGraphic` (a CgGraphicRef). The monitor and the offline export both
// evaluate with t = playhead − clip.start and D = clip.duration, so dragging
// the clip handles retimes the OUT exactly like the live OUT button would.
import React, { useEffect, useRef, useState } from 'react';
import type { CgGraphicRef } from '../../../services/fabula/cg/cgTypes';
import { findCgGraphic } from '../../../services/fabula/cg/cgLibrary';
import { drawCgGraphic, ensureCgFonts, setCgImageReadyListener } from '../../../services/fabula/cg/cgRender';

export interface CgClipLike { id: string; start: number; duration: number; cGraphic?: CgGraphicRef }

export const CgClipMonitor: React.FC<{ clip: CgClipLike; playhead: number; selected: boolean; onSelect: () => void }> = ({ clip, playhead, selected, onSelect }) => {
  const cv = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  const g = findCgGraphic(clip.cGraphic);
  useEffect(() => { if (!g) return; let alive = true; ensureCgFonts(g).then(() => { if (alive) setTick(n => n + 1); }); setCgImageReadyListener(() => setTick(n => n + 1)); return () => { alive = false; }; }, [g?.id]);
  useEffect(() => {
    const c = cv.current; if (!c || !g) return;
    const host = c.parentElement; if (!host) return;
    const rect = host.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(2, Math.round(rect.width * dpr)), H = Math.max(2, Math.round(rect.height * dpr));
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    drawCgGraphic(ctx, g, playhead - clip.start, clip.duration, W, H, clip.cGraphic, { now: Date.now() });
    if (selected) { ctx.save(); ctx.strokeStyle = 'rgba(255,140,0,.9)'; ctx.lineWidth = 2 * dpr; ctx.setLineDash([6 * dpr, 4 * dpr]); ctx.strokeRect(dpr, dpr, W - 2 * dpr, H - 2 * dpr); ctx.restore(); }
  });
  void tick;
  if (!g) return null;
  return <canvas ref={cv} data-cg-clip={clip.id} onMouseDown={(e) => { e.stopPropagation(); onSelect(); }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: selected ? 'default' : 'pointer', zIndex: 55 }} />;
};

/** Inspector block for a selected CG clip: field values + palette accent. */
export const CgClipFields: React.FC<{ clipRef: CgGraphicRef; onChange: (next: CgGraphicRef) => void; onOpenWorkspace?: () => void; onTakeLive?: () => void }> = ({ clipRef, onChange, onOpenWorkspace, onTakeLive }) => {
  const g = findCgGraphic(clipRef);
  if (!g) return <div className="dim small">Graphic not found ({clipRef.graphicId}).</div>;
  const fields = clipRef.fields || {};
  const set = (k: string, v: string) => onChange({ ...clipRef, fields: { ...fields, [k]: v } });
  return (
    <>
      <div className="lbl">FABULA CG · {g.name}</div>
      {g.fields.map((f) => (
        <div key={f.key} style={{ marginTop: 5 }}>
          <div className="dim small">{f.label}</div>
          {f.type === 'multiline' || f.type === 'list'
            ? <textarea className="in" rows={2} value={fields[f.key] ?? f.default} onChange={(e) => set(f.key, e.target.value)} />
            : <input className="in" value={fields[f.key] ?? f.default} placeholder={f.type === 'image' ? 'https://…' : ''} onChange={(e) => set(f.key, e.target.value)} />}
        </div>
      ))}
      <div className="lbl" style={{ marginTop: 8 }}>ACCENT</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="color" value={/^#[0-9a-f]{6}$/i.test(clipRef.palette?.accent || g.palette.accent) ? (clipRef.palette?.accent || g.palette.accent) : '#ff0000'} onChange={(e) => onChange({ ...clipRef, palette: { ...(clipRef.palette || {}), accent: e.target.value } })} />
        {clipRef.palette && <button className="minibtn" onClick={() => onChange({ ...clipRef, palette: undefined })}>RESET</button>}
      </div>
      <div className="btnrow" style={{ marginTop: 8, gap: 4, display: 'flex', flexWrap: 'wrap' }}>
        {onOpenWorkspace && <button className="minibtn blue" onClick={onOpenWorkspace}>OPEN IN GRAPHICS</button>}
        {onTakeLive && <button className="minibtn" onClick={onTakeLive}>TAKE LIVE</button>}
      </div>
    </>
  );
};

export default CgClipMonitor;
