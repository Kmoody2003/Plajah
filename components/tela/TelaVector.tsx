/**
 * TelaVector — the vector-design device (P2). A real, functional editor
 * rendered as SVG, so every object (and TEXT via <text>) is resolution
 * independent — razor-sharp at any zoom. That satisfies the sharp-text mandate
 * for the DOM/SVG postures.
 *
 * NOTE: the WGSL / Slug analytic-curve text engine (spec §04 — "GPU postures &
 * deep zoom") is a LATER dedicated push. SVG <text> already renders tack-sharp
 * under continuous zoom for these postures, so P2 ships SVG and defers the
 * curve engine rather than half-building it here.
 *
 * Objects: RECT | ELLIPSE | LINE | PATH (pen/polyline) | TEXT. Every mutation is
 * ops-shaped through the parent (add / update / delete / reorder), ids stable,
 * so multiplayer later is an op-log change. A TEXT object may be bound to a
 * Writer device (boundWriterDeviceId) and renders that Writer's text live — the
 * binding-graph "text" edge; the object's own text is a never-destroyed
 * fallback.
 */
import React, { useRef, useState } from 'react';
import {
  MousePointer2, MousePointerClick, Scan, Square, Circle, Minus, PenTool, Type,
  ChevronUp, ChevronDown, Trash2, Link2, Unlink,
} from 'lucide-react';
import type { TelaVectorDevice, TelaVectorObject, TelaVectorObjectKind } from '../../types';
import { pathDataFromNodes } from '../../services/telaImageTrace';
import { layoutTextLines } from '../../services/tela/telaText';

export type VectorTool = 'select' | 'direct' | 'marquee' | 'rect' | 'ellipse' | 'line' | 'pen' | 'text';

const newObjId = () => `obj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// ── Geometry helpers ──────────────────────────────────────────────────────────

/** Axis-aligned bounds for any object (box kinds direct; line/path from points). */
export function objBounds(o: TelaVectorObject): { x: number; y: number; w: number; h: number } {
  if ((o.kind === 'LINE' || o.kind === 'PATH') && o.points && o.points.length >= 2) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i + 1 < o.points.length; i += 2) {
      minX = Math.min(minX, o.points[i]); maxX = Math.max(maxX, o.points[i]);
      minY = Math.min(minY, o.points[i + 1]); maxY = Math.max(maxY, o.points[i + 1]);
    }
    return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
  }
  return { x: o.x, y: o.y, w: o.w, h: o.h };
}

function makeObject(kind: TelaVectorObjectKind, x: number, y: number): TelaVectorObject {
  const base: TelaVectorObject = {
    id: newObjId(), kind, x, y, w: 0, h: 0,
    fill: kind === 'LINE' || kind === 'PATH' ? 'none' : (kind === 'TEXT' ? '#1B1523' : '#6B0099'),
    stroke: kind === 'TEXT' ? 'none' : '#120D1C',
    strokeWidth: kind === 'TEXT' ? 0 : (kind === 'LINE' || kind === 'PATH' ? 3 : 1.5),
    rotation: 0, opacity: 1,
  };
  if (kind === 'TEXT') {
    base.w = 260; base.h = 48; base.text = 'Text';
    base.fontSize = 34; base.fontFamily = 'system-ui, sans-serif'; base.fontWeight = 700;
    base.fill = '#1B1523';
  }
  if (kind === 'LINE') base.points = [x, y, x, y];
  return base;
}

// ── One rendered object ───────────────────────────────────────────────────────

function textLines(o: TelaVectorObject, writerTexts?: Record<string, string>): string[] {
  const bound = o.boundWriterDeviceId ? writerTexts?.[o.boundWriterDeviceId] : undefined;
  const src = (bound !== undefined && bound !== '') ? bound : (o.text ?? '');
  return layoutTextLines(o, src);
}

const ObjectEl: React.FC<{
  o: TelaVectorObject;
  writerTexts?: Record<string, string>;
  interactive: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
  onPointerCancel?: (e: React.PointerEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}> = ({ o, writerTexts, interactive, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onContextMenu }) => {
  const b = objBounds(o);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const gradientId = `tela_gradient_${o.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const angle = (o.gradient?.angle ?? 0) * Math.PI / 180;
  const gradientDef = o.gradient ? <defs>{o.gradient.kind === 'RADIAL'
    ? <radialGradient id={gradientId}>{o.gradient.stops.map((stop, index) => <stop key={index} offset={`${stop.offset * 100}%`} stopColor={stop.color} stopOpacity={stop.opacity ?? 1}/>)}</radialGradient>
    : <linearGradient id={gradientId} x1={`${50 - Math.cos(angle) * 50}%`} y1={`${50 - Math.sin(angle) * 50}%`} x2={`${50 + Math.cos(angle) * 50}%`} y2={`${50 + Math.sin(angle) * 50}%`}>{o.gradient.stops.map((stop, index) => <stop key={index} offset={`${stop.offset * 100}%`} stopColor={stop.color} stopOpacity={stop.opacity ?? 1}/>)}</linearGradient>}</defs> : null;
  // Finish: drop shadow and/or gaussian blur become one SVG filter per object.
  const filterId = `tela_filter_${o.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const hasFilter = !!o.shadow || !!(o.blur && o.blur > 0);
  const filterDef = hasFilter ? <defs><filter id={filterId} x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
    {o.blur && o.blur > 0 ? <feGaussianBlur stdDeviation={o.blur} /> : null}
    {o.shadow ? <feDropShadow dx={o.shadow.x} dy={o.shadow.y} stdDeviation={o.shadow.blur} floodColor={o.shadow.color} /> : null}
  </filter></defs> : null;
  const decorate = (node: React.ReactNode) => <>{gradientDef}{filterDef}{node}</>;
  const finish: React.SVGProps<any> = {
    filter: hasFilter ? `url(#${filterId})` : undefined,
    strokeDasharray: o.strokeDash && o.strokeDash.length ? o.strokeDash.join(' ') : undefined,
  };
  const blendStyle: React.CSSProperties = o.blendMode && o.blendMode !== 'normal' ? { mixBlendMode: o.blendMode as any } : {};
  const common: React.SVGProps<any> = {
    fill: o.gradient ? `url(#${gradientId})` : o.fill, stroke: o.stroke, strokeWidth: o.strokeWidth, opacity: o.opacity,
    transform: o.rotation ? `rotate(${o.rotation} ${cx} ${cy})` : undefined,
    onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onContextMenu, style: { cursor: interactive ? 'move' : 'default', ...blendStyle },
    strokeLinecap: 'round', strokeLinejoin: 'round', ...finish,
  };
  if (o.kind === 'RECT') return decorate(<rect x={o.x} y={o.y} width={Math.max(0, o.w)} height={Math.max(0, o.h)} rx={o.rx ?? 2} {...common} />);
  if (o.kind === 'ELLIPSE') return decorate(<ellipse cx={o.x + o.w / 2} cy={o.y + o.h / 2} rx={Math.max(0, o.w / 2)} ry={Math.max(0, o.h / 2)} {...common} />);
  if (o.kind === 'LINE' && o.points) return <line x1={o.points[0]} y1={o.points[1]} x2={o.points[2]} y2={o.points[3]} {...common} />;
  if (o.kind === 'IMAGE' && o.sourceImageSrc && o.sourceCrop) {
    const c = o.sourceCrop;
    return decorate(<g transform={o.rotation ? `rotate(${o.rotation} ${cx} ${cy})` : undefined} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onContextMenu={onContextMenu} style={{ cursor: interactive ? 'move' : 'default', ...blendStyle }} opacity={o.opacity} {...finish}><svg x={o.x} y={o.y} width={o.w} height={o.h} viewBox={`${c.x} ${c.y} ${c.width} ${c.height}`} preserveAspectRatio="none" style={{ overflow: 'hidden' }}><image href={o.sourceImageSrc} x={0} y={0} width={c.sourceWidth} height={c.sourceHeight} preserveAspectRatio="none" /></svg></g>);
  }
  if (o.kind === 'PATH' && o.svgPathData) {
    const ox = o.pathOriginX ?? o.x, oy = o.pathOriginY ?? o.y;
    const sx = o.w / Math.max(1, o.pathOriginW ?? o.w), sy = o.h / Math.max(1, o.pathOriginH ?? o.h);
    // Stroke width is specified in artboard px; undo the origin-box scale so it stays even.
    const strokeScale = Math.max(.0001, Math.sqrt(Math.abs(sx * sy)));
    return decorate(<g transform={o.rotation ? `rotate(${o.rotation} ${cx} ${cy})` : undefined} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onContextMenu={onContextMenu} style={{ cursor: interactive ? 'move' : 'default', ...blendStyle }} opacity={o.opacity} {...finish}><path d={o.svgPathData} fill={o.gradient ? `url(#${gradientId})` : o.fill} stroke={o.stroke} strokeWidth={o.strokeWidth / strokeScale} strokeLinecap="round" strokeLinejoin="round" fillRule="evenodd" transform={`translate(${o.x} ${o.y}) scale(${sx} ${sy}) translate(${-ox} ${-oy})`} /></g>);
  }
  if (o.kind === 'PATH' && o.points) {
    const pts = [];
    for (let i = 0; i + 1 < o.points.length; i += 2) pts.push(`${o.points[i]},${o.points[i + 1]}`);
    return decorate(o.pathClosed ? <polygon points={pts.join(' ')} {...common} /> : <polyline points={pts.join(' ')} {...common} />);
  }
  if (o.kind === 'TEXT') {
    const size = o.fontSize || 24;
    const lines = textLines(o, writerTexts);
    const align = o.textAlign || 'left';
    const ax = align === 'center' ? o.x + o.w / 2 : align === 'right' ? o.x + o.w : o.x;
    const leading = size * (o.lineHeight ?? 1.22);
    const outlined = o.stroke !== 'none' && o.strokeWidth > 0;
    return decorate(
      <text
        x={ax} y={o.y + size} fill={o.gradient ? `url(#${gradientId})` : o.fill} opacity={o.opacity}
        fontSize={size} fontFamily={o.fontFamily || 'system-ui, sans-serif'} fontWeight={o.fontWeight || 400}
        fontStyle={o.fontStyle === 'italic' ? 'italic' : undefined}
        letterSpacing={o.letterSpacing ? o.letterSpacing * size : undefined}
        textAnchor={align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start'}
        stroke={outlined ? o.stroke : undefined} strokeWidth={outlined ? o.strokeWidth : undefined} paintOrder="stroke" strokeLinejoin="round"
        transform={o.rotation ? `rotate(${o.rotation} ${cx} ${cy})` : undefined}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onContextMenu={onContextMenu} style={{ cursor: interactive ? 'move' : 'default', userSelect: 'none', ...blendStyle }}
        {...finish}
      >
        {lines.map((ln, i) => (
          <tspan key={i} x={ax} dy={i === 0 ? 0 : leading}>{ln === '' ? ' ' : ln}</tspan>
        ))}
      </text>
    );
  }
  return null;
};

// ── Object properties (reused by the inline popover AND the Studio panel) ─────

export const TelaVectorObjectProps: React.FC<{
  object: TelaVectorObject;
  writers?: { id: string; name: string }[];
  onUpdate: (patch: Partial<TelaVectorObject>) => void;
  onDelete: () => void;
  onForward: () => void;
  onBack: () => void;
  compact?: boolean;
}> = ({ object: o, writers, onUpdate, onDelete, onForward, onBack, compact }) => {
  const isText = o.kind === 'TEXT';
  const isImage = o.kind === 'IMAGE';
  const isLine = o.kind === 'LINE' || o.kind === 'PATH';
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 3 };
  const rowCls = 'flex items-center gap-2 mb-2';
  const numStyle: React.CSSProperties = { width: 56, height: 28, padding: '0 7px', borderRadius: 7, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', fontSize: 12, outline: 'none' };
  const swatch: React.CSSProperties = { width: 30, height: 28, padding: 0, border: '1px solid rgba(255,255,255,0.18)', borderRadius: 7, background: 'transparent', cursor: 'pointer' };
  return (
    <div style={{ color: '#fff' }}>
      {isText && (
        <div style={{ marginBottom: 10 }}>
          <div style={lbl}>Text</div>
          <textarea
            value={o.text ?? ''}
            onChange={e => onUpdate({ text: e.target.value })}
            rows={2}
            disabled={!!o.boundWriterDeviceId}
            placeholder={o.boundWriterDeviceId ? 'Bound to a Writer — edit it there' : 'Type…'}
            style={{ width: '100%', padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: o.boundWriterDeviceId ? 'rgba(255,255,255,0.45)' : '#fff', fontSize: 12.5, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
          />
          {writers && writers.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={lbl}>Bind to Writer <span style={{ color: 'var(--pj-cyan,#00DAF3)' }}>· live</span></div>
              <div className="flex items-center gap-2">
                <select
                  value={o.boundWriterDeviceId || ''}
                  onChange={e => onUpdate({ boundWriterDeviceId: e.target.value || undefined })}
                  style={{ flex: 1, height: 30, padding: '0 8px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(0,218,243,0.35)', color: '#8fe9f6', fontSize: 12, outline: 'none' }}
                >
                  <option value="">— not bound —</option>
                  {writers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                {o.boundWriterDeviceId && (
                  <button title="Unbind" onClick={() => onUpdate({ boundWriterDeviceId: undefined })} style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', cursor: 'pointer' }}><Unlink size={14} /></button>
                )}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
            <div>
              <div style={lbl}>Size</div>
              <input type="number" value={o.fontSize || 24} onChange={e => onUpdate({ fontSize: Math.max(4, +e.target.value || 24) })} style={numStyle} />
            </div>
            <div>
              <div style={lbl}>Weight</div>
              <select value={o.fontWeight || 400} onChange={e => onUpdate({ fontWeight: +e.target.value })} style={{ ...numStyle, width: 74 }}>
                {[100, 200, 300, 400, 500, 600, 700, 800, 900].map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div>
              <div style={lbl}>Style</div>
              <button title="Italic" onClick={() => onUpdate({ fontStyle: o.fontStyle === 'italic' ? 'normal' : 'italic' })} style={{ ...numStyle, width: 34, fontStyle: 'italic', fontWeight: 700, cursor: 'pointer', color: o.fontStyle === 'italic' ? 'var(--pj-cyan,#00DAF3)' : '#fff' }}>I</button>
            </div>
          </div>
          <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
            <div>
              <div style={lbl}>Align</div>
              <div className="flex" style={{ gap: 2 }}>
                {(['left', 'center', 'right'] as const).map(a => <button key={a} title={a} onClick={() => onUpdate({ textAlign: a })} style={{ ...numStyle, width: 30, padding: 0, cursor: 'pointer', fontSize: 10, fontWeight: 800, color: (o.textAlign || 'left') === a ? 'var(--pj-cyan,#00DAF3)' : 'rgba(255,255,255,.6)' }}>{a === 'left' ? '⫷' : a === 'center' ? '☰' : '⫸'}</button>)}
              </div>
            </div>
            <div>
              <div style={lbl} title="Tracking (letter-spacing) in % of size">Track</div>
              <input type="number" step={1} value={Math.round((o.letterSpacing || 0) * 100)} onChange={e => onUpdate({ letterSpacing: (+e.target.value || 0) / 100 })} style={{ ...numStyle, width: 52 }} />
            </div>
            <div>
              <div style={lbl} title="Leading (line-height) multiple">Lead</div>
              <input type="number" step={0.05} value={o.lineHeight ?? 1.22} onChange={e => onUpdate({ lineHeight: Math.max(.6, +e.target.value || 1.22) })} style={{ ...numStyle, width: 56 }} />
            </div>
          </div>
          <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
            <select value={o.textTransform || 'none'} onChange={e => onUpdate({ textTransform: e.target.value as any })} style={{ ...numStyle, width: 96 }} title="Case">
              <option value="none">As typed</option><option value="uppercase">UPPERCASE</option><option value="lowercase">lowercase</option><option value="capitalize">Capitalize</option>
            </select>
            <label className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
              <input type="checkbox" checked={!!o.wrap} onChange={e => onUpdate({ wrap: e.target.checked })} /> Wrap to box
            </label>
          </div>
        </div>
      )}

      <div className={rowCls}>
        {!isText && !isImage && (
          <label className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
            <input type="color" value={o.fill === 'none' ? '#000000' : o.fill} onChange={e => onUpdate({ fill: e.target.value })} style={swatch} />
            Fill
          </label>
        )}
        {isText && (
          <label className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
            <input type="color" value={o.fill === 'none' ? '#000000' : o.fill} onChange={e => onUpdate({ fill: e.target.value })} style={swatch} />
            Color
          </label>
        )}
        {!isText && !isImage && (
          <button title={o.fill === 'none' ? 'No fill' : 'Clear fill'} onClick={() => onUpdate({ fill: o.fill === 'none' ? '#6B0099' : 'none' })} style={{ fontSize: 10, fontWeight: 700, padding: '4px 7px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: o.fill === 'none' ? 'var(--pj-cyan,#00DAF3)' : 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>none</button>
        )}
      </div>

      {!isText && !isImage && !isLine && (
        <div style={{ marginBottom: 10, padding: 8, borderRadius: 9, background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.08)' }}>
          <div className="flex items-center gap-2">
            <div style={{ ...lbl, marginBottom: 0 }}>Gradient fill</div>
            <button onClick={() => onUpdate({ gradient: o.gradient ? undefined : { kind: 'LINEAR', angle: 90, stops: [{ offset: 0, color: o.fill === 'none' ? '#6B0099' : o.fill }, { offset: 1, color: '#FF8A00' }] } })} className="ml-auto h-6 px-2 rounded-[7px] text-[9px] font-extrabold" style={{ color: o.gradient ? '#8ff5ff' : 'rgba(255,255,255,.55)', background: o.gradient ? 'rgba(0,218,243,.12)' : 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)' }}>{o.gradient ? 'On' : 'Add'}</button>
          </div>
          {o.gradient && <><div className="flex items-center gap-2 mt-2"><select value={o.gradient.kind} onChange={e => onUpdate({ gradient: { ...o.gradient!, kind: e.target.value as 'LINEAR' | 'RADIAL' } })} style={{ ...numStyle, width: 84 }}><option value="LINEAR">Linear</option><option value="RADIAL">Radial</option></select>{o.gradient.kind === 'LINEAR' && <input title="Gradient angle" type="number" value={o.gradient.angle || 0} onChange={e => onUpdate({ gradient: { ...o.gradient!, angle: +e.target.value } })} style={numStyle}/>}<input type="color" value={o.gradient.stops[0]?.color || '#6B0099'} onChange={e => onUpdate({ gradient: { ...o.gradient!, stops: [{ ...(o.gradient!.stops[0] || { offset: 0 }), color: e.target.value }, ...(o.gradient!.stops.slice(1))] } })} style={swatch}/><input type="color" value={o.gradient.stops.at(-1)?.color || '#FF8A00'} onChange={e => { const stops = [...o.gradient!.stops]; stops[stops.length - 1] = { ...(stops.at(-1) || { offset: 1 }), color: e.target.value }; onUpdate({ gradient: { ...o.gradient!, stops } }); }} style={swatch}/></div></>}
        </div>
      )}

      {!isText && !isImage && (
        <div className={rowCls}>
          <label className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
            <input type="color" value={o.stroke === 'none' ? '#000000' : o.stroke} onChange={e => onUpdate({ stroke: e.target.value })} style={swatch} />
            Stroke
          </label>
          <input type="number" min={0} step={0.5} value={o.strokeWidth} onChange={e => onUpdate({ strokeWidth: Math.max(0, +e.target.value || 0) })} style={numStyle} title="Stroke width" />
          <button title={o.stroke === 'none' ? 'No stroke' : 'Clear stroke'} onClick={() => onUpdate({ stroke: o.stroke === 'none' ? '#120D1C' : 'none' })} style={{ fontSize: 10, fontWeight: 700, padding: '4px 7px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: o.stroke === 'none' ? 'var(--pj-cyan,#00DAF3)' : 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>none</button>
        </div>
      )}

      <div style={{ marginBottom: 8 }}>
        <div style={lbl}>Opacity {Math.round(o.opacity * 100)}%</div>
        <input type="range" min={0} max={1} step={0.01} value={o.opacity} onChange={e => onUpdate({ opacity: +e.target.value })} style={{ width: '100%', accentColor: 'var(--pj-magenta,#D40055)' }} />
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={lbl}>Rotation {Math.round(o.rotation)}°</div>
        <input type="range" min={-180} max={180} step={1} value={o.rotation} onChange={e => onUpdate({ rotation: +e.target.value })} style={{ width: '100%', accentColor: 'var(--pj-magenta,#D40055)' }} />
      </div>

      {/* Finish — radius, shadow, blur, blend. Shared by every kind so templates stay editable. */}
      <div style={{ marginBottom: 8, padding: 8, borderRadius: 9, background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.08)' }}>
        <div className="flex items-center gap-2">
          {o.kind === 'RECT' && <div><div style={lbl}>Radius</div><input type="number" min={0} value={o.rx ?? 2} onChange={e => onUpdate({ rx: Math.max(0, +e.target.value || 0) })} style={{ ...numStyle, width: 54 }} /></div>}
          <div><div style={lbl}>Blur</div><input type="number" min={0} step={0.5} value={o.blur || 0} onChange={e => onUpdate({ blur: Math.max(0, +e.target.value || 0) || undefined })} style={{ ...numStyle, width: 54 }} /></div>
          <div style={{ flex: 1 }}><div style={lbl}>Blend</div>
            <select value={o.blendMode || 'normal'} onChange={e => onUpdate({ blendMode: e.target.value === 'normal' ? undefined : e.target.value as any })} style={{ ...numStyle, width: '100%' }}>
              {['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
          <div style={{ ...lbl, marginBottom: 0 }}>Shadow</div>
          <button onClick={() => onUpdate({ shadow: o.shadow ? undefined : { x: 0, y: 6, blur: 10, color: 'rgba(0,0,0,.35)' } })} className="h-6 px-2 rounded-[7px] text-[9px] font-extrabold" style={{ color: o.shadow ? '#8ff5ff' : 'rgba(255,255,255,.55)', background: o.shadow ? 'rgba(0,218,243,.12)' : 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', cursor: 'pointer' }}>{o.shadow ? 'On' : 'Add'}</button>
          {o.shadow && <>
            <input title="X" type="number" value={o.shadow.x} onChange={e => onUpdate({ shadow: { ...o.shadow!, x: +e.target.value || 0 } })} style={{ ...numStyle, width: 46 }} />
            <input title="Y" type="number" value={o.shadow.y} onChange={e => onUpdate({ shadow: { ...o.shadow!, y: +e.target.value || 0 } })} style={{ ...numStyle, width: 46 }} />
            <input title="Softness" type="number" min={0} value={o.shadow.blur} onChange={e => onUpdate({ shadow: { ...o.shadow!, blur: Math.max(0, +e.target.value || 0) } })} style={{ ...numStyle, width: 46 }} />
          </>}
        </div>
      </div>

      <div className="flex items-center gap-1.5" style={{ marginTop: compact ? 6 : 10 }}>
        <button title="Bring forward" onClick={onForward} className="flex-1" style={{ display: 'grid', placeItems: 'center', height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', cursor: 'pointer' }}><ChevronUp size={15} /></button>
        <button title="Send back" onClick={onBack} className="flex-1" style={{ display: 'grid', placeItems: 'center', height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', cursor: 'pointer' }}><ChevronDown size={15} /></button>
        <button title="Delete object" onClick={onDelete} style={{ display: 'grid', placeItems: 'center', width: 44, height: 30, borderRadius: 8, background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.4)', color: '#fda4a4', cursor: 'pointer' }}><Trash2 size={14} /></button>
      </div>
    </div>
  );
};

// ── Static render (thumbnails, galleries, previews) ───────────────────────────
// The exact same ObjectEl the editor uses, so a gallery card IS the template —
// never a CSS approximation of it.
export const TelaStaticSvg: React.FC<{ objects: TelaVectorObject[]; width: number; height: number; className?: string; style?: React.CSSProperties; writerTexts?: Record<string, string> }> = ({ objects, width, height, className, style, writerTexts }) => (
  <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" className={className} style={{ display: 'block', ...style }} aria-hidden>
    {objects.map(o => <ObjectEl key={o.id} o={o} writerTexts={writerTexts} interactive={false} />)}
  </svg>
);

// ── The device ────────────────────────────────────────────────────────────────

interface TelaVectorProps {
  device: TelaVectorDevice;
  readOnly?: boolean;
  /** Studio drives tool/selection + hides internal chrome; default = self-managed. */
  chrome?: boolean;
  tool?: VectorTool;
  onToolChange?: (t: VectorTool) => void;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  writerTexts?: Record<string, string>;
  writers?: { id: string; name: string }[];
  onAddObject: (object: TelaVectorObject) => void;
  onUpdateObject: (objectId: string, patch: Partial<TelaVectorObject>) => void;
  onDeleteObject: (objectId: string) => void;
  onReorder: (objectId: string, toIndex: number) => void;
  onObjectContextMenu?: (event: React.MouseEvent, object: TelaVectorObject) => void;
  objectContextBindings?: (object: TelaVectorObject) => { onContextMenu: (event: React.MouseEvent) => void; onPointerDown: (event: React.PointerEvent) => void; onPointerMove: (event: React.PointerEvent) => void; onPointerUp: () => void; onPointerCancel: () => void };
  snap?: { enabled: boolean; x: number[]; y: number[]; threshold?: number };
}

const TOOLS: { id: VectorTool; icon: React.ReactNode; label: string }[] = [
  { id: 'select', icon: <MousePointer2 size={15} />, label: 'Select' },
  { id: 'direct', icon: <MousePointerClick size={15} />, label: 'Direct select / edit anchors' },
  { id: 'marquee', icon: <Scan size={15} />, label: 'Marquee select' },
  { id: 'rect', icon: <Square size={15} />, label: 'Rectangle' },
  { id: 'ellipse', icon: <Circle size={15} />, label: 'Ellipse' },
  { id: 'line', icon: <Minus size={15} />, label: 'Line' },
  { id: 'pen', icon: <PenTool size={15} />, label: 'Pen / polyline' },
  { id: 'text', icon: <Type size={15} />, label: 'Text' },
];

const TelaVector: React.FC<TelaVectorProps> = (props) => {
  const {
    device, readOnly, chrome = true, writerTexts, writers,
    onAddObject, onUpdateObject, onDeleteObject, onReorder,
  } = props;

  // Controlled / uncontrolled tool + selection.
  const [toolI, setToolI] = useState<VectorTool>('select');
  const tool = props.tool ?? toolI;
  const setTool = (t: VectorTool) => { setToolI(t); props.onToolChange?.(t); };
  const [selI, setSelI] = useState<string | null>(null);
  const [selIdsI, setSelIdsI] = useState<string[]>([]);
  const selectedId = props.selectedId !== undefined ? props.selectedId : selI;
  const selectedIds = props.selectedIds !== undefined ? props.selectedIds : selIdsI;
  const selectMany = (ids: string[]) => {
    const next = [...new Set(ids)].filter(id => device.objects.some(object => object.id === id));
    const primary = next.at(-1) || null;
    setSelIdsI(next); setSelI(primary); props.onSelectionChange?.(next); props.onSelect?.(primary);
  };
  const select = (id: string | null) => selectMany(id ? [id] : []);

  const svgRef = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<TelaVectorObject | null>(null);
  const [penPts, setPenPts] = useState<number[] | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [snapLines, setSnapLines] = useState<{ x?: number; y?: number }>({});
  const drag = useRef<
    | { mode: 'create'; startX: number; startY: number }
    | { mode: 'move'; id: string; startX: number; startY: number; members: { id: string; ox: number; oy: number; opoints?: number[] }[] }
    | { mode: 'resize'; id: string; handle: string; }
    | { mode: 'linept'; id: string; idx: number }
    | { mode: 'pathnode'; id: string; idx: number }
    | { mode: 'marquee'; startX: number; startY: number }
    | { mode: 'rotate'; id: string }
    | null
  >(null);

  const selected = device.objects.find(o => o.id === selectedId) || null;

  const svgPoint = (e: React.PointerEvent): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  // ── Background pointer: create tools + deselect ──
  const onBgPointerDown = (e: React.PointerEvent) => {
    if (readOnly) return;
    const p = svgPoint(e);
    if (tool === 'select' || tool === 'direct') { select(null); return; }
    if (tool === 'marquee') {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      setMarquee({ x: p.x, y: p.y, w: 0, h: 0 });
      drag.current = { mode: 'marquee', startX: p.x, startY: p.y };
      return;
    }
    if (tool === 'pen') {
      setPenPts(prev => prev ? [...prev, p.x, p.y] : [p.x, p.y]);
      return;
    }
    if (tool === 'text') {
      const o = makeObject('TEXT', p.x, p.y - 24);
      onAddObject(o); select(o.id); setTool('select');
      return;
    }
    // rect / ellipse / line — start a drag-draft.
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const kind: TelaVectorObjectKind = tool === 'rect' ? 'RECT' : tool === 'ellipse' ? 'ELLIPSE' : 'LINE';
    setDraft(makeObject(kind, p.x, p.y));
    drag.current = { mode: 'create', startX: p.x, startY: p.y };
  };

  const onObjectPointerDown = (e: React.PointerEvent, id: string) => {
    if (readOnly) return;
    if (tool !== 'select' && tool !== 'direct') return; // let the bg handle creation tools
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const nextIds = (e.shiftKey || e.ctrlKey || e.metaKey)
      ? (selectedIds.includes(id) ? selectedIds.filter(item => item !== id) : [...selectedIds, id])
      : (selectedIds.includes(id) && selectedIds.length > 1 ? selectedIds : [id]);
    selectMany(nextIds);
    if (!nextIds.includes(id)) return;
    const o = device.objects.find(x => x.id === id);
    if (!o) return;
    const p = svgPoint(e);
    const members = nextIds.map(memberId => device.objects.find(object => object.id === memberId)).filter((object): object is TelaVectorObject => !!object).map(object => ({ id: object.id, ox: object.x, oy: object.y, opoints: object.points ? [...object.points] : undefined }));
    drag.current = { mode: 'move', id, startX: p.x, startY: p.y, members };
  };

  const onHandlePointerDown = (e: React.PointerEvent, handle: string) => {
    if (readOnly || !selected) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { mode: 'resize', id: selected.id, handle };
  };
  const onLinePtPointerDown = (e: React.PointerEvent, idx: number) => {
    if (readOnly || !selected) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { mode: 'linept', id: selected.id, idx };
  };
  const onPathNodePointerDown = (e: React.PointerEvent, idx: number) => {
    if (readOnly || !selected?.pathNodes) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { mode: 'pathnode', id: selected.id, idx };
  };
  const onRotatePointerDown = (e: React.PointerEvent) => {
    if (readOnly || !selected) return;
    e.stopPropagation(); (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { mode: 'rotate', id: selected.id };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = svgPoint(e);
    if (d.mode === 'create' && draft) {
      if (draft.kind === 'LINE') {
        setDraft({ ...draft, points: [d.startX, d.startY, p.x, p.y] });
      } else {
        const x = Math.min(d.startX, p.x), y = Math.min(d.startY, p.y);
        setDraft({ ...draft, x, y, w: Math.abs(p.x - d.startX), h: Math.abs(p.y - d.startY) });
      }
    } else if (d.mode === 'marquee') {
      setMarquee({ x: Math.min(d.startX, p.x), y: Math.min(d.startY, p.y), w: Math.abs(p.x - d.startX), h: Math.abs(p.y - d.startY) });
    } else if (d.mode === 'move') {
      let dx = p.x - d.startX, dy = p.y - d.startY;
      const object = device.objects.find(o => o.id === d.id);
      if (props.snap?.enabled && object) {
        const bounds = objBounds(object), threshold = props.snap.threshold ?? 6;
        const nearest = (values: number[], targets: number[]) => {
          let result: { delta: number; target: number } | null = null;
          for (const value of values) for (const target of targets) {
            const delta = target - value;
            if (Math.abs(delta) <= threshold && (!result || Math.abs(delta) < Math.abs(result.delta))) result = { delta, target };
          }
          return result;
        };
        const peerBounds = device.objects.filter(peer => peer.id !== d.id).map(objBounds);
        const xTargets = [...props.snap.x, ...peerBounds.flatMap(b => [b.x, b.x + b.w / 2, b.x + b.w])];
        const yTargets = [...props.snap.y, ...peerBounds.flatMap(b => [b.y, b.y + b.h / 2, b.y + b.h])];
        const sx = nearest([bounds.x + dx, bounds.x + bounds.w / 2 + dx, bounds.x + bounds.w + dx], xTargets);
        const sy = nearest([bounds.y + dy, bounds.y + bounds.h / 2 + dy, bounds.y + bounds.h + dy], yTargets);
        if (sx) dx += sx.delta; if (sy) dy += sy.delta;
        setSnapLines({ x: sx?.target, y: sy?.target });
      } else setSnapLines({});
      for (const member of d.members) {
        if (member.opoints) onUpdateObject(member.id, { points: member.opoints.map((value, index) => index % 2 === 0 ? value + dx : value + dy) });
        else onUpdateObject(member.id, { x: member.ox + dx, y: member.oy + dy });
      }
    } else if (d.mode === 'resize') {
      const o = device.objects.find(x => x.id === d.id); if (!o) return;
      let { x, y, w, h } = o;
      if (d.handle.includes('w')) { w = (x + w) - p.x; x = p.x; }
      if (d.handle.includes('e')) { w = p.x - x; }
      if (d.handle.includes('n')) { h = (y + h) - p.y; y = p.y; }
      if (d.handle.includes('s')) { h = p.y - y; }
      onUpdateObject(d.id, { x, y, w: Math.max(2, w), h: Math.max(2, h) });
    } else if (d.mode === 'linept') {
      const o = device.objects.find(x => x.id === d.id); if (!o || !o.points) return;
      const pts = [...o.points]; pts[d.idx * 2] = p.x; pts[d.idx * 2 + 1] = p.y;
      onUpdateObject(d.id, { points: pts });
    } else if (d.mode === 'pathnode') {
      const o = device.objects.find(x => x.id === d.id); if (!o?.pathNodes) return;
      const ox = o.pathOriginX ?? o.x, oy = o.pathOriginY ?? o.y;
      const sx = o.w / Math.max(1, o.pathOriginW ?? o.w), sy = o.h / Math.max(1, o.pathOriginH ?? o.h);
      const nodes = o.pathNodes.map((n, i) => i === d.idx ? { ...n, x: ox + (p.x - o.x) / sx, y: oy + (p.y - o.y) / sy } : n);
      onUpdateObject(d.id, { pathNodes: nodes, svgPathData: pathDataFromNodes(nodes, o.pathClosed) });
    } else if (d.mode === 'rotate') {
      const o = device.objects.find(x => x.id === d.id); if (!o) return;
      const b = objBounds(o), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      onUpdateObject(d.id, { rotation: Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI + 90 });
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    if (d?.mode === 'create' && draft) {
      // Ignore zero-size clicks.
      const bounds = objBounds(draft);
      if (bounds.w >= 3 || bounds.h >= 3 || draft.kind === 'LINE') {
        onAddObject(draft); select(draft.id); setTool('select');
      }
      setDraft(null);
    } else if (d?.mode === 'marquee' && marquee) {
      const hits = device.objects.filter(o => { const b = objBounds(o); return b.x < marquee.x + marquee.w && b.x + b.w > marquee.x && b.y < marquee.y + marquee.h && b.y + b.h > marquee.y; });
      selectMany(hits.map(object => object.id)); setMarquee(null); setTool('select');
    }
    drag.current = null;
    setSnapLines({});
  };

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (readOnly || !selectedIds.length) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); selectedIds.forEach(onDeleteObject); selectMany([]); return; }
    const delta = e.shiftKey ? 10 : 1;
    const dx = e.key === 'ArrowLeft' ? -delta : e.key === 'ArrowRight' ? delta : 0;
    const dy = e.key === 'ArrowUp' ? -delta : e.key === 'ArrowDown' ? delta : 0;
    if (!dx && !dy) return; e.preventDefault(); e.stopPropagation();
    for (const id of selectedIds) {
      const object = device.objects.find(item => item.id === id); if (!object) continue;
      if (object.points) onUpdateObject(object.id, { points: object.points.map((value, index) => value + (index % 2 === 0 ? dx : dy)) });
      else onUpdateObject(object.id, { x: object.x + dx, y: object.y + dy });
    }
  };

  const finishPen = () => {
    if (penPts && penPts.length >= 4) {
      const b = { x: Math.min(...penPts.filter((_, i) => i % 2 === 0)), y: Math.min(...penPts.filter((_, i) => i % 2 === 1)) };
      const o: TelaVectorObject = { ...makeObject('PATH', b.x, b.y), points: penPts };
      onAddObject(o); select(o.id);
    }
    setPenPts(null);
    setTool('select');
  };

  // ── z-order ──
  const reorder = (id: string, dir: 1 | -1) => {
    const i = device.objects.findIndex(o => o.id === id);
    if (i < 0) return;
    onReorder(id, Math.max(0, Math.min(device.objects.length - 1, i + dir)));
  };

  const selBounds = selected ? objBounds(selected) : null;
  const multiBounds = selectedIds.map(id => device.objects.find(object => object.id === id)).filter((object): object is TelaVectorObject => !!object).map(object => ({ id: object.id, ...objBounds(object) }));
  const handles = selBounds
    ? [
        { k: 'nw', x: selBounds.x, y: selBounds.y },
        { k: 'ne', x: selBounds.x + selBounds.w, y: selBounds.y },
        { k: 'sw', x: selBounds.x, y: selBounds.y + selBounds.h },
        { k: 'se', x: selBounds.x + selBounds.w, y: selBounds.y + selBounds.h },
      ]
    : [];

  return (
    <div className="tela-vector" style={{ position: 'relative', width: device.width, height: device.height, background: '#fff' }}>
      {/* Internal tool palette — hidden when Studio drives the tool. */}
      {chrome && !readOnly && (
        <div
          onPointerDown={e => e.stopPropagation()}
          style={{ position: 'absolute', top: 8, left: 8, zIndex: 4, display: 'flex', gap: 2, padding: 3, background: 'rgba(18,13,28,0.92)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, backdropFilter: 'blur(6px)' }}
        >
          {TOOLS.map(t => (
            <button
              key={t.id} title={t.label}
              onClick={() => { setTool(t.id); if (t.id !== 'pen') setPenPts(null); }}
              style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer', color: tool === t.id ? '#fff' : 'rgba(255,255,255,0.55)', background: tool === t.id ? 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))' : 'transparent' }}
            >
              {t.icon}
            </button>
          ))}
        </div>
      )}

      {/* Pen hint */}
      {chrome && penPts && (
        <div onPointerDown={e => e.stopPropagation()} style={{ position: 'absolute', top: 46, left: 8, zIndex: 4, display: 'flex', gap: 6, alignItems: 'center', padding: '4px 8px', background: 'rgba(18,13,28,0.92)', border: '1px solid rgba(0,218,243,0.4)', borderRadius: 9, color: '#8fe9f6', fontSize: 11, fontWeight: 700 }}>
          {penPts.length / 2} pts · click to add
          <button onClick={finishPen} style={{ padding: '2px 8px', borderRadius: 6, background: 'var(--pj-cyan,#00DAF3)', color: '#062', border: 'none', fontWeight: 800, cursor: 'pointer' }}>Finish</button>
          <button onClick={() => { setPenPts(null); setTool('select'); }} style={{ padding: '2px 6px', borderRadius: 6, background: 'transparent', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.18)', cursor: 'pointer' }}>Esc</button>
        </div>
      )}

      <svg
        ref={svgRef}
        width={device.width}
        height={device.height}
        viewBox={`0 0 ${device.width} ${device.height}`}
        style={{ display: 'block', touchAction: 'none' }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        tabIndex={0}
        onDoubleClick={() => { if (penPts) finishPen(); }}
      >
        {/* Artboard background — captures create/deselect pointers. */}
        <rect x={0} y={0} width={device.width} height={device.height} fill="#FFFFFF" onPointerDown={onBgPointerDown} />

        {device.objects.map(o => { const menu = props.objectContextBindings?.(o); return (
          <ObjectEl
            key={o.id} o={o} writerTexts={writerTexts}
            interactive={!readOnly && (tool === 'select' || tool === 'direct')}
            onPointerDown={readOnly ? undefined : e => { menu?.onPointerDown(e); onObjectPointerDown(e, o.id); }}
            onPointerMove={menu?.onPointerMove} onPointerUp={menu?.onPointerUp} onPointerCancel={menu?.onPointerCancel}
            onContextMenu={readOnly ? undefined : e => { select(o.id); if (menu) menu.onContextMenu(e); else { e.preventDefault(); e.stopPropagation(); props.onObjectContextMenu?.(e, o); } }}
          />
        ); })}

        {/* Draft preview */}
        {draft && <ObjectEl o={{ ...draft, opacity: 0.7 }} interactive={false} />}

        {/* Pen in-progress polyline */}
        {penPts && penPts.length >= 2 && (
          <polyline
            points={penPts.reduce((a: string[], _, i) => (i % 2 === 0 ? [...a, `${penPts[i]},${penPts[i + 1]}`] : a), []).join(' ')}
            fill="none" stroke="var(--pj-cyan,#00DAF3)" strokeWidth={2} strokeDasharray="4 3" vectorEffect="non-scaling-stroke"
          />
        )}
        {marquee && <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="rgba(0,218,243,.10)" stroke="var(--pj-cyan,#00DAF3)" strokeWidth={1.5} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
        {snapLines.x !== undefined && <line x1={snapLines.x} y1={0} x2={snapLines.x} y2={device.height} stroke="var(--pj-cyan,#00DAF3)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
        {snapLines.y !== undefined && <line x1={0} y1={snapLines.y} x2={device.width} y2={snapLines.y} stroke="var(--pj-cyan,#00DAF3)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />}

        {selectedIds.length > 1 && !readOnly && multiBounds.map(bounds => <rect key={bounds.id} x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} fill="none" stroke="var(--pj-cyan,#00DAF3)" strokeWidth={1.25} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" pointerEvents="none"/>)}

        {/* Selection outline + handles */}
        {selBounds && selectedIds.length === 1 && !readOnly && (tool === 'select' || tool === 'direct') && (
          <g>
            <rect x={selBounds.x} y={selBounds.y} width={selBounds.w} height={selBounds.h}
              fill="none" stroke="var(--pj-magenta,#D40055)" strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />
            {selected && (selected.kind === 'LINE') && selected.points
              ? [0, 1].map(i => (
                  <rect key={i} x={selected.points![i * 2] - 5} y={selected.points![i * 2 + 1] - 5} width={10} height={10}
                    fill="#fff" stroke="var(--pj-magenta,#D40055)" strokeWidth={1.5} vectorEffect="non-scaling-stroke"
                    style={{ cursor: 'crosshair' }} onPointerDown={e => onLinePtPointerDown(e, i)} />
                ))
              : selected?.kind === 'PATH' && selected.pathNodes && tool === 'direct' ? selected.pathNodes.map((n, i) => {
                  const ox = selected.pathOriginX ?? selected.x, oy = selected.pathOriginY ?? selected.y;
                  const sx = selected.w / Math.max(1, selected.pathOriginW ?? selected.w), sy = selected.h / Math.max(1, selected.pathOriginH ?? selected.h);
                  return <circle key={n.id} cx={selected.x + (n.x - ox) * sx} cy={selected.y + (n.y - oy) * sy} r={4.5} fill="#fff" stroke="var(--pj-magenta,#D40055)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ cursor: 'crosshair' }} onPointerDown={e => onPathNodePointerDown(e, i)} />;
                })
              : selected && selected.kind !== 'LINE' && tool === 'select' && handles.map(h => (
                  <rect key={h.k} x={h.x - 5} y={h.y - 5} width={10} height={10}
                    fill="#fff" stroke="var(--pj-magenta,#D40055)" strokeWidth={1.5} vectorEffect="non-scaling-stroke"
                    style={{ cursor: h.k === 'nw' || h.k === 'se' ? 'nwse-resize' : 'nesw-resize' }}
                    onPointerDown={e => onHandlePointerDown(e, h.k)} />
                ))}
            {selected && tool === 'select' && <><line x1={selBounds.x + selBounds.w / 2} y1={selBounds.y} x2={selBounds.x + selBounds.w / 2} y2={selBounds.y - 28} stroke="var(--pj-magenta,#D40055)" strokeWidth={1.25} vectorEffect="non-scaling-stroke"/><circle cx={selBounds.x + selBounds.w / 2} cy={selBounds.y - 32} r={5} fill="#fff" stroke="var(--pj-magenta,#D40055)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ cursor: 'grab' }} onPointerDown={onRotatePointerDown}/></>}
          </g>
        )}
      </svg>

      {/* Inline properties popover — hidden when Studio hosts the panel. */}
      {chrome && !readOnly && selected && (
        <div
          onPointerDown={e => e.stopPropagation()}
          style={{ position: 'absolute', top: 8, right: 8, zIndex: 4, width: 232, padding: 12, background: 'rgba(18,13,28,0.95)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, backdropFilter: 'blur(8px)', boxShadow: '0 16px 40px rgba(0,0,0,0.5)' }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>{selected.kind}</div>
          <TelaVectorObjectProps
            object={selected} writers={writers}
            onUpdate={patch => onUpdateObject(selected.id, patch)}
            onDelete={() => { onDeleteObject(selected.id); select(null); }}
            onForward={() => reorder(selected.id, 1)}
            onBack={() => reorder(selected.id, -1)}
          />
        </div>
      )}
    </div>
  );
};

export default TelaVector;
