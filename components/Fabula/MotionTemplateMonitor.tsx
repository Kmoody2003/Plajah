// MotionTemplateMonitor — an Ambo slide template / scripture look placed on Fabula's
// timeline as a title clip carrying `mGraphic` (a TelaMotionTemplateSpec). The
// monitor and the offline export both call renderMotionTemplateAt with the clip's
// own duration driving the motion (entrance from the clip start, exit into the
// clip end) — drag the clip handles and the animation retimes.
import React, { useEffect, useRef, useState } from 'react';
import type { TelaMotionTemplateSpec } from '../../types';
import {
  renderMotionClipFrame, ensureMotionTemplateFonts, motionTemplateFields, motionTemplateDefaults, motionTemplateName,
} from '../../services/tela/telaMotionTemplate';

export interface MTClipLike { id: string; start: number; duration: number; mGraphic?: TelaMotionTemplateSpec }

export const MotionTemplateMonitor: React.FC<{ clip: MTClipLike; playhead: number; selected: boolean; onSelect: () => void }> = ({ clip, playhead, selected, onSelect }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fontsTick, setFontsTick] = useState(0);
  const spec = clip.mGraphic;
  useEffect(() => { if (!spec) return; let alive = true; ensureMotionTemplateFonts(spec).then(() => { if (alive) setFontsTick(n => n + 1); }); return () => { alive = false; }; }, [spec?.templateId, spec?.layoutId, spec?.theme]);

  useEffect(() => {
    const c = canvasRef.current; if (!c || !spec) return;
    const host = c.parentElement; if (!host) return;
    const rect = host.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(2, Math.round(rect.width * dpr)), H = Math.max(2, Math.round(rect.height * dpr));
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    renderMotionClipFrame(ctx, spec, playhead - clip.start, clip.duration, W, H);
    if (selected) { ctx.save(); ctx.strokeStyle = 'rgba(255,140,0,.9)'; ctx.lineWidth = 2 * dpr; ctx.setLineDash([6 * dpr, 4 * dpr]); ctx.strokeRect(dpr, dpr, W - 2 * dpr, H - 2 * dpr); ctx.restore(); }
  }); // every render — lockstep with the playhead
  void fontsTick;

  return <canvas ref={canvasRef} data-motion-clip={clip.id} onMouseDown={(e) => { e.stopPropagation(); onSelect(); }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: selected ? 'default' : 'pointer' }} />;
};

/** Inspector block: the template's text fields (edits re-render the clip at once). */
export const MotionTemplateClipFields: React.FC<{ spec: TelaMotionTemplateSpec; onChange: (next: TelaMotionTemplateSpec) => void }> = ({ spec, onChange }) => {
  const defs = motionTemplateFields(spec);
  const dflt = motionTemplateDefaults(spec);
  return (
    <>
      <div className="lbl">MOTION TEMPLATE · {motionTemplateName(spec)}</div>
      {defs.map((f) => (
        <div key={f.key} style={{ marginTop: 5 }}>
          <div className="dim small">{f.label}</div>
          {f.multiline
            ? <textarea className="in" rows={2} value={spec.fields?.[f.key] ?? dflt[f.key] ?? f.default} onChange={(e) => onChange({ ...spec, fields: { ...(spec.fields || {}), [f.key]: e.target.value } })} />
            : <input className="in" value={spec.fields?.[f.key] ?? dflt[f.key] ?? f.default} onChange={(e) => onChange({ ...spec, fields: { ...(spec.fields || {}), [f.key]: e.target.value } })} />}
        </div>
      ))}
    </>
  );
};

export default MotionTemplateMonitor;
