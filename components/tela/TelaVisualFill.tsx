// TelaVisualFill — a live visual (visualizer, Chora visual, live video, 3D avatar)
// as the fill of a Tela vector shape: fill, texture, mask or gradient-map.
// Rendered inside the shape's SVG as a clipped <foreignObject> canvas driven by
// the platform visualFill pool (one GPU instance per visual, shared).
import React, { useEffect, useRef, useState } from 'react';
import '../../services/visualFill/visualProviders';
import { visualFrame, drawFitted, texturePattern, lumaPass, gradientLut, visualCatalog, type VisualPaint, type VisualEntry, type VisualPaintMode } from '../../services/visualFill/visualFill';
import type { TelaVectorObject } from '../../types';

export const TelaVisualFillLayer: React.FC<{ o: TelaVectorObject; paint: VisualPaint; staticRender?: boolean }> = ({ o, paint, staticRender }) => {
  const cv = useRef<HTMLCanvasElement>(null);
  const clipId = `tela_vf_${o.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  useEffect(() => {
    const c = cv.current; if (!c) return;
    const W = Math.max(2, Math.round(Math.min(1280, o.w))), H = Math.max(2, Math.round(Math.min(1280, o.h)));
    c.width = W; c.height = H;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const lut = paint.mode === 'gradient-map' ? gradientLut((o.gradient?.stops || [{ offset: 0, color: '#120D1C' }, { offset: 1, color: o.fill && o.fill !== 'none' ? o.fill : '#FF8A00' }]).map(s => [s.offset, s.color] as [number, string])) : undefined;
    let raf = 0;
    const draw = () => {
      const img = visualFrame(paint.source, W, H);
      ctx.clearRect(0, 0, W, H);
      if (img) {
        if (paint.mode === 'texture') { const p = texturePattern(ctx, img, paint.scale ?? 1); if (p) { ctx.fillStyle = p; ctx.fillRect(0, 0, W, H); } }
        else if (paint.mode === 'mask' || paint.mode === 'gradient-map') { const m = lumaPass(img, W, H, paint.mode, { lut, invert: paint.invert, fill: /^#[0-9a-f]{6}$/i.test(o.fill) ? o.fill : '#ffffff' }); if (m) ctx.drawImage(m, 0, 0, W, H); }
        else drawFitted(ctx, img, 0, 0, W, H, paint.fit || 'cover');
      }
      if (!staticRender || !img) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [paint.source.engine, paint.source.value, paint.source.audio, paint.mode, paint.fit, paint.scale, paint.invert, o.w, o.h, o.fill, JSON.stringify(o.gradient?.stops || [])]); // eslint-disable-line react-hooks/exhaustive-deps
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  return (
    <g transform={o.rotation ? `rotate(${o.rotation} ${cx} ${cy})` : undefined} opacity={(paint.opacity ?? 1) * o.opacity} style={{ pointerEvents: 'none' }}>
      <defs>
        <clipPath id={clipId}>
          {o.kind === 'ELLIPSE' ? <ellipse cx={cx} cy={cy} rx={Math.max(0, o.w / 2)} ry={Math.max(0, o.h / 2)} /> : <rect x={o.x} y={o.y} width={Math.max(0, o.w)} height={Math.max(0, o.h)} rx={o.rx ?? 2} />}
        </clipPath>
      </defs>
      <foreignObject x={o.x} y={o.y} width={Math.max(1, o.w)} height={Math.max(1, o.h)} clipPath={`url(#${clipId})`}>
        <canvas ref={cv} style={{ width: '100%', height: '100%', display: 'block' }} />
      </foreignObject>
    </g>
  );
};

/** Inspector block: pick a live visual and how it paints the shape. */
export const TelaVisualFillPicker: React.FC<{ value?: VisualPaint; onChange: (v: VisualPaint | undefined) => void; labelStyle?: React.CSSProperties; inputStyle?: React.CSSProperties }> = ({ value, onChange, labelStyle, inputStyle }) => {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<VisualEntry[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => { if (open && !cat.length) visualCatalog().then(setCat).catch(() => undefined); }, [open, cat.length]);
  const list = cat.filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.group.toLowerCase().includes(q.toLowerCase())).slice(0, 120);
  return (
    <div style={{ marginBottom: 10, padding: 8, borderRadius: 9, background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.08)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ ...labelStyle, marginBottom: 0 }}>Live visual fill</div>
        <button onClick={() => (value ? onChange(undefined) : setOpen(o => !o))} style={{ marginLeft: 'auto', height: 24, padding: '0 8px', borderRadius: 7, fontSize: 9, fontWeight: 800, color: value ? '#8ff5ff' : 'rgba(255,255,255,.55)', background: value ? 'rgba(0,218,243,.12)' : 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', cursor: 'pointer' }}>{value ? 'Remove' : open ? 'Close' : 'Add'}</button>
      </div>
      {value && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', flex: '1 1 100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.source.engine} · {value.source.value.split('|')[0].split('/').pop()}</span>
          <select value={value.mode} onChange={e => onChange({ ...value, mode: e.target.value as VisualPaintMode })} style={inputStyle}>{['fill', 'texture', 'mask', 'gradient-map'].map(m => <option key={m} value={m}>{m}</option>)}</select>
          <select value={value.source.audio || 'master'} onChange={e => onChange({ ...value, source: { ...value.source, audio: e.target.value as any } })} style={inputStyle}><option value="master">Audio: master</option><option value="live-input">Audio: live in</option><option value="none">Audio: off</option></select>
          <button onClick={() => setOpen(o => !o)} style={{ height: 24, padding: '0 8px', borderRadius: 7, fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,.7)', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', cursor: 'pointer' }}>Change</button>
        </div>
      )}
      {open && (
        <div style={{ marginTop: 6 }}>
          <input placeholder={`Search ${cat.length || ''} visuals`} value={q} onChange={e => setQ(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
          <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {list.map(e => (
              <button key={e.engine + e.value} onClick={() => { onChange({ source: { engine: e.engine, value: e.value, audio: value?.source.audio || 'master' }, mode: value?.mode || 'fill', fit: 'cover' }); setOpen(false); }}
                style={{ textAlign: 'left', padding: '4px 6px', borderRadius: 6, border: 0, background: 'rgba(255,255,255,.04)', color: 'rgba(255,255,255,.85)', fontSize: 11, cursor: 'pointer' }}>
                {e.name} <span style={{ opacity: .5 }}>· {e.group}</span>
              </button>
            ))}
            {!cat.length && <span style={{ fontSize: 11, opacity: .6 }}>Loading…</span>}
          </div>
        </div>
      )}
    </div>
  );
};
