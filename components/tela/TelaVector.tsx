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
import React, { useEffect, useRef, useState } from 'react';
import {
  MousePointer2, MousePointerClick, Scan, Square, Circle, Minus, PenTool, Type, Brush, Pen, Pencil, Highlighter, Eraser, Lasso,
  ChevronUp, ChevronDown, Trash2, Link2, Unlink, Copy, Plus, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Bold, Italic, Underline, Strikethrough, Heading1, Heading2, List, Quote, Palette,
} from 'lucide-react';
import type { TelaBlock, TelaVectorDevice, TelaVectorObject, TelaVectorObjectKind } from '../../types';
import { pathDataFromNodes } from '../../services/telaImageTrace';
import { layoutTextLines } from '../../services/tela/telaText';
import { InkLayer, type NoteTool } from '../ink';
import { strokeInBox, pathData, type InkStyle } from '../../services/inkMath';
import { TelaLottieCanvas, TelaLottieInspector } from './TelaLottie';
import { TelaMotionTemplateCanvas, TelaMotionTemplateInspector } from './TelaMotionTemplate';
import { objectToSvg } from '../../services/tela/geometry/serialize';

export type VectorTool = 'select' | 'direct' | 'marquee' | 'rect' | 'ellipse' | 'line' | 'pen' | 'text' | 'ink';

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
    base.w = 340; base.h = 160;
    base.fontSize = 18; base.fontFamily = 'Inter, system-ui, sans-serif'; base.fontWeight = 400;
    base.fill = '#1B1523';
    base.lineHeight = 1.5;
    base.textAlign = 'left';
    base.wrap = true;
    base.backgroundColor = 'rgba(255, 255, 255, 0.96)';
    base.padding = 16;
    base.rx = 8;
    base.shadow = { x: 0, y: 4, blur: 16, color: 'rgba(0,0,0,0.1)' };
    base.text = 'Typography Heading\nFree-moving text box with rich paragraphing. Drag to position anywhere on any document page.';
    base.blocks = [
      { id: newObjId(), kind: 'h2', text: 'Typography Heading' },
      { id: newObjId(), kind: 'p', text: 'Free-moving text box with rich paragraphing. Drag to position anywhere on any document page.' },
    ];
  }
  if (kind === 'LINE') base.points = [x, y, x, y];
  return base;
}

// ── 3D & Advanced Typography Helpers ──────────────────────────────────────────

function compute3DTextShadow(depth?: number, mat?: string): string | undefined {
  if (!depth || depth <= 0) {
    if (mat === 'NEON_CYAN') return '0 0 8px #00DAF3, 0 0 20px #00DAF3, 0 0 40px #007088';
    if (mat === 'NEON_MAGENTA') return '0 0 8px #FF1493, 0 0 20px #D40055, 0 0 40px #8B0040';
    return undefined;
  }
  const color = mat === 'GOLD_BRASS' ? '#B8860B'
    : mat === 'CHROME_LIQUID' ? '#46556B'
    : mat === 'OBSIDIAN' ? '#050408'
    : mat === 'NEON_CYAN' ? '#007088'
    : mat === 'NEON_MAGENTA' ? '#8B0040'
    : mat === 'BAUHAUS_CLAY' ? '#5C0806'
    : 'rgba(0,0,0,0.5)';
  const layers: string[] = [];
  for (let i = 1; i <= depth; i++) {
    layers.push(`0 ${i}px 0 ${color}`);
  }
  layers.push(`0 ${depth + 4}px ${Math.round(depth * 1.4)}px rgba(0,0,0,0.65)`);
  if (mat === 'NEON_CYAN') layers.push('0 0 12px #00DAF3, 0 0 26px #00DAF3');
  if (mat === 'NEON_MAGENTA') layers.push('0 0 12px #FF1493, 0 0 26px #D40055');
  return layers.join(', ');
}

function computeShapeClipPath(shape?: string): string | undefined {
  if (!shape || shape === 'NONE') return undefined;
  if (shape === 'CIRCLE') return 'circle(48% at 50% 50%)';
  if (shape === 'HEART') return 'polygon(50% 15%, 62% 0%, 82% 0%, 98% 18%, 98% 42%, 78% 68%, 50% 98%, 22% 68%, 2% 42%, 2% 18%, 18% 0%, 38% 0%)';
  if (shape === 'STAR') return 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)';
  if (shape === 'DIAMOND') return 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
  if (shape === 'CLOUD') return 'polygon(20% 80%, 5% 70%, 2% 50%, 15% 35%, 35% 25%, 55% 15%, 75% 22%, 92% 35%, 98% 55%, 90% 75%, 75% 82%)';
  return undefined;
}

// ── One rendered object ───────────────────────────────────────────────────────

function textLines(o: TelaVectorObject, writerTexts?: Record<string, string>): string[] {
  const bound = o.boundWriterDeviceId ? writerTexts?.[o.boundWriterDeviceId] : undefined;
  const src = (bound !== undefined && bound !== '') ? bound : (o.text ?? '');
  return layoutTextLines(o, src);
}

// Engine-finished objects (geom: materials, engine gradients, mesh, clips, stroke alignment,
// engine-set type glyphs) render through the ONE canonical serialiser, so the editor, Page /
// Board postures, Fabula's timeline and Post Man letters show exactly what exports show.
// Objects without geom keep the JSX path below untouched (proven by scripts/telaThumbOracle).
const geomSvgCache = new WeakMap<TelaVectorObject, string>();
export const usesSerializer = (o: TelaVectorObject) => !!o.geom && ((o.kind === 'PATH' && !!o.svgPathData) || (o.kind === 'TEXT' && !!o.geom.glyphs?.length) || !!o.geom.clip);
function geomSvg(o: TelaVectorObject, writerTexts?: Record<string, string>): string {
  const cacheable = !(o.kind === 'TEXT' && !o.geom?.glyphs?.length);
  const hit = cacheable ? geomSvgCache.get(o) : undefined; if (hit !== undefined) return hit;
  const svg = objectToSvg(o, writerTexts); if (cacheable) geomSvgCache.set(o, svg); return svg;
}

const EditableRichBlock: React.FC<{
  block: TelaBlock;
  index: number;
  autoFocus?: boolean;
  style?: React.CSSProperties;
  placeholder?: string;
  onFocusBlock?: (idx: number) => void;
  onChangeText: (idx: number, newText: string) => void;
  onInsertBlockAfter: (idx: number) => void;
  onDeleteEmptyBlock: (idx: number) => void;
  onToggleStyle?: (kind: 'bold' | 'italic' | 'underline') => void;
  onExitEdit?: () => void;
}> = ({
  block,
  index,
  autoFocus,
  style,
  placeholder,
  onFocusBlock,
  onChangeText,
  onInsertBlockAfter,
  onDeleteEmptyBlock,
  onToggleStyle,
  onExitEdit,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement !== el && el.innerText !== (block.text ?? '')) {
      el.innerText = block.text ?? '';
    }
  }, [block.id, block.text]);

  useEffect(() => {
    if (autoFocus && ref.current) {
      const el = ref.current;
      el.focus();
      try {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      } catch {
        // ignore selection errors
      }
    }
  }, [autoFocus]);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      onFocus={() => onFocusBlock?.(index)}
      onInput={e => {
        const txt = (e.currentTarget as HTMLDivElement).innerText;
        onChangeText(index, txt);
      }}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          onExitEdit?.();
          return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
          e.preventDefault();
          onToggleStyle?.('bold');
          return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
          e.preventDefault();
          onToggleStyle?.('italic');
          return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'u') {
          e.preventDefault();
          onToggleStyle?.('underline');
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onInsertBlockAfter(index);
          return;
        }
        if (e.key === 'Backspace') {
          const currentText = (e.currentTarget as HTMLDivElement).innerText || '';
          if (currentText.trim().length === 0) {
            e.preventDefault();
            onDeleteEmptyBlock(index);
          }
        }
      }}
      style={{
        outline: 'none',
        cursor: 'text',
        userSelect: 'text',
        WebkitUserSelect: 'text',
        minHeight: '1.25em',
        minWidth: '20px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        ...style,
      }}
    />
  );
};

export const ObjectEl: React.FC<{
  o: TelaVectorObject;
  writerTexts?: Record<string, string>;
  interactive: boolean;
  /** Thumbnails/galleries: LOTTIE shows its poster frame instead of a live player. */
  staticRender?: boolean;
  isSelected?: boolean;
  isEditing?: boolean;
  activeBlockIdx?: number;
  onFocusBlock?: (idx: number) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onUpdateObject?: (patch: Partial<TelaVectorObject>) => void;
  onExitEdit?: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
  onPointerCancel?: (e: React.PointerEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}> = ({
  o,
  writerTexts,
  interactive,
  staticRender,
  isSelected,
  isEditing,
  activeBlockIdx = 0,
  onFocusBlock,
  onDoubleClick,
  onUpdateObject,
  onExitEdit,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onContextMenu,
}) => {
  if (o.hidden) return null;
  if (usesSerializer(o) && !isEditing) {
    return <g data-tela-geom="1" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onContextMenu={onContextMenu} onDoubleClick={onDoubleClick}
      style={{ cursor: interactive ? 'move' : 'default', pointerEvents: 'auto' }} dangerouslySetInnerHTML={{ __html: geomSvg(o, writerTexts) }} />;
  }
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
    onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onContextMenu, onDoubleClick,
    style: { cursor: interactive ? 'move' : 'default', pointerEvents: 'auto', ...blendStyle },
    strokeLinecap: 'round', strokeLinejoin: 'round', ...finish,
  };
  if (o.kind === 'RECT') return decorate(<rect x={o.x} y={o.y} width={Math.max(0, o.w)} height={Math.max(0, o.h)} rx={o.rx ?? 2} {...common} />);
  if (o.kind === 'ELLIPSE') return decorate(<ellipse cx={o.x + o.w / 2} cy={o.y + o.h / 2} rx={Math.max(0, o.w / 2)} ry={Math.max(0, o.h / 2)} {...common} />);
  if (o.kind === 'LINE' && o.points) return <line x1={o.points[0]} y1={o.points[1]} x2={o.points[2]} y2={o.points[3]} {...common} />;
  if (o.kind === 'IMAGE' && o.sourceImageSrc && o.sourceCrop) {
    const c = o.sourceCrop;
    return decorate(<g transform={o.rotation ? `rotate(${o.rotation} ${cx} ${cy})` : undefined} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onContextMenu={onContextMenu} style={{ cursor: interactive ? 'move' : 'default', pointerEvents: 'auto', ...blendStyle }} opacity={o.opacity} {...finish}><svg x={o.x} y={o.y} width={o.w} height={o.h} viewBox={`${c.x} ${c.y} ${c.width} ${c.height}`} preserveAspectRatio="none" style={{ overflow: 'hidden' }}><image href={o.sourceImageSrc} x={0} y={0} width={c.sourceWidth} height={c.sourceHeight} preserveAspectRatio="none" /></svg></g>);
  }
  if (o.kind === 'LOTTIE') {
    const L = o.lottie;
    const w = Math.max(1, o.w), h = Math.max(1, o.h);
    const par = !L || L.fit === 'contain' ? 'xMidYMid meet' : L.fit === 'cover' ? 'xMidYMid slice' : 'none';
    const body = L && !staticRender
      ? <foreignObject x={o.x} y={o.y} width={w} height={h} style={{ overflow: 'hidden', pointerEvents: 'none' }}><TelaLottieCanvas spec={L} objectId={o.id} label={o.objectLabel} /></foreignObject>
      : L?.posterSrc
        ? <svg x={o.x} y={o.y} width={w} height={h} style={{ overflow: 'hidden' }}><image href={L.posterSrc} x={0} y={0} width={w} height={h} preserveAspectRatio={par} /></svg>
        : <g><rect x={o.x} y={o.y} width={w} height={h} rx={6} fill="rgba(0,218,243,.08)" stroke="rgba(0,163,184,.6)" strokeWidth={1.5} strokeDasharray="6 4" /><text x={o.x + w / 2} y={o.y + h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.max(10, Math.min(28, Math.min(w, h) / 6))} fontWeight={800} fontFamily="system-ui, sans-serif" fill="rgba(0,120,140,.85)">Lottie{o.objectLabel ? ` · ${o.objectLabel}` : ''}</text></g>;
    return decorate(<g transform={o.rotation ? `rotate(${o.rotation} ${cx} ${cy})` : undefined} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onContextMenu={onContextMenu} style={{ cursor: interactive ? 'move' : 'default', pointerEvents: 'auto', ...blendStyle }} opacity={o.opacity} {...finish} data-tela-kind="LOTTIE">
      {body}
      <rect x={o.x} y={o.y} width={w} height={h} fill="transparent" />
    </g>);
  }
  if (o.kind === 'MOTION_TEMPLATE') {
    const M = o.motionTemplate;
    const w = Math.max(1, o.w), h = Math.max(1, o.h);
    const body = M && !staticRender
      ? <foreignObject x={o.x} y={o.y} width={w} height={h} style={{ overflow: 'hidden', pointerEvents: 'none' }}><TelaMotionTemplateCanvas spec={M} width={w} height={h} objectId={o.id} label={o.objectLabel} /></foreignObject>
      : M?.posterSrc
        ? <svg x={o.x} y={o.y} width={w} height={h} style={{ overflow: 'hidden' }}><image href={M.posterSrc} x={0} y={0} width={w} height={h} preserveAspectRatio="none" /></svg>
        : <g><rect x={o.x} y={o.y} width={w} height={h} rx={6} fill="rgba(255,140,0,.08)" stroke="rgba(200,110,0,.6)" strokeWidth={1.5} strokeDasharray="6 4" /><text x={o.x + w / 2} y={o.y + h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.max(10, Math.min(28, Math.min(w, h) / 6))} fontWeight={800} fontFamily="system-ui, sans-serif" fill="rgba(160,90,0,.85)">Motion{o.objectLabel ? ` · ${o.objectLabel}` : ''}</text></g>;
    return decorate(<g transform={o.rotation ? `rotate(${o.rotation} ${cx} ${cy})` : undefined} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onContextMenu={onContextMenu} style={{ cursor: interactive ? 'move' : 'default', pointerEvents: 'auto', ...blendStyle }} opacity={o.opacity} {...finish} data-tela-kind="MOTION_TEMPLATE">
      {body}
      <rect x={o.x} y={o.y} width={w} height={h} fill="transparent" />
    </g>);
  }
  if (o.kind === 'PATH' && o.svgPathData) {
    const ox = o.pathOriginX ?? o.x, oy = o.pathOriginY ?? o.y;
    const sx = o.w / Math.max(1, o.pathOriginW ?? o.w), sy = o.h / Math.max(1, o.pathOriginH ?? o.h);
    const strokeScale = Math.max(.0001, Math.sqrt(Math.abs(sx * sy)));
    return decorate(<g transform={o.rotation ? `rotate(${o.rotation} ${cx} ${cy})` : undefined} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onContextMenu={onContextMenu} style={{ cursor: interactive ? 'move' : 'default', pointerEvents: 'auto', ...blendStyle }} opacity={o.opacity} {...finish}><path d={o.svgPathData} fill={o.gradient ? `url(#${gradientId})` : o.fill} stroke={o.stroke} strokeWidth={o.strokeWidth / strokeScale} strokeLinecap="round" strokeLinejoin="round" fillRule="evenodd" transform={`translate(${o.x} ${o.y}) scale(${sx} ${sy}) translate(${-ox} ${-oy})`} /></g>);
  }
  if (o.kind === 'PATH' && o.points) {
    const pts = [];
    for (let i = 0; i + 1 < o.points.length; i += 2) pts.push(`${o.points[i]},${o.points[i + 1]}`);
    if (!o.pathClosed && o.points.length >= 6) return decorate(<path d={pathData(o.points)} {...common} />);
    return decorate(o.pathClosed ? <polygon points={pts.join(' ')} {...common} /> : <polyline points={pts.join(' ')} {...common} />);
  }
  if (o.kind === 'TEXT') {
    const size = o.fontSize || 18;
    const align = o.textAlign || 'left';
    const isRichTextBox = !!isEditing || !!o.blocks?.length || !!o.wrap || !!o.backgroundColor || !!o.padding || (o.w >= 60 && o.h >= 24);

    if (isRichTextBox) {
      const boxW = Math.max(80, o.w || 320);
      const boxH = Math.max(32, o.h || 120);
      const bg = o.backgroundColor || 'transparent';
      const border = o.stroke && o.stroke !== 'none' && o.strokeWidth > 0
        ? `${o.strokeWidth}px solid ${o.stroke}`
        : 'none';
      const pad = o.padding !== undefined ? o.padding : (bg !== 'transparent' ? 14 : 4);
      const textColor = o.fill && o.fill !== 'none' ? o.fill : '#1E1B26';
      const fontFamily = o.fontFamily || 'Inter, system-ui, -apple-system, sans-serif';
      const leading = o.lineHeight ?? 1.5;
      const tracking = o.letterSpacing ? `${o.letterSpacing * size}px` : undefined;
      const textDecor = o.underline ? 'underline' : o.strike ? 'line-through' : undefined;
      // A text layer is a page-sized sheet: its empty area clicks through to the page
      // beneath, only the written lines catch the pointer (until it is selected).
      const sheet = o.textRole === 'LAYER';
      const sheetIdle = sheet && !isEditing && !isSelected;

      const renderedBlocks: TelaBlock[] = o.blocks && o.blocks.length > 0 ? o.blocks : (
        (o.text || '').split('\n').filter(Boolean).length > 0
          ? (o.text || '').split('\n').map((line, i) => ({ id: `p${i}`, kind: (i === 0 && (o.text || '').split('\n').length > 1 ? 'h2' as const : 'p' as const), text: line }))
          : [{ id: 'p0', kind: 'p' as const, text: o.text ?? '' }]
      );

      const handleBlockTextChange = (idx: number, newText: string) => {
        if (!onUpdateObject) return;
        if (!o.blocks?.length && renderedBlocks.length === 1) {
          onUpdateObject({ text: newText });
          return;
        }
        const nextBlocks = renderedBlocks.map((bItem, i) => (i === idx ? { ...bItem, text: newText } : bItem));
        onUpdateObject({
          blocks: nextBlocks,
          text: nextBlocks.map(bItem => bItem.text).join('\n'),
        });
      };

      const handleInsertBlockAfter = (idx: number) => {
        if (!onUpdateObject) return;
        const nextBlocks = [...renderedBlocks];
        nextBlocks.splice(idx + 1, 0, {
          id: `blk_${Date.now()}_${idx + 1}`,
          kind: 'p',
          text: '',
        });
        onUpdateObject({
          blocks: nextBlocks,
          text: nextBlocks.map(bItem => bItem.text).join('\n'),
          wrap: true,
        });
        onFocusBlock?.(idx + 1);
      };

      const handleDeleteEmptyBlock = (idx: number) => {
        if (!onUpdateObject || renderedBlocks.length <= 1) return;
        const nextBlocks = renderedBlocks.filter((_, i) => i !== idx);
        onUpdateObject({
          blocks: nextBlocks,
          text: nextBlocks.map(bItem => bItem.text).join('\n'),
        });
        onFocusBlock?.(Math.max(0, idx - 1));
      };

      const handleToggleStyle = (kind: 'bold' | 'italic' | 'underline') => {
        if (!onUpdateObject) return;
        if (kind === 'bold') onUpdateObject({ fontWeight: (o.fontWeight || 400) >= 700 ? 400 : 700 });
        if (kind === 'italic') onUpdateObject({ fontStyle: o.fontStyle === 'italic' ? 'normal' : 'italic' });
        if (kind === 'underline') onUpdateObject({ underline: !o.underline });
      };

      const text3DShadow = compute3DTextShadow(o.extrusion3D, o.material3D);
      const perspectiveTransform = (o.tiltX || o.tiltY)
        ? `perspective(800px) rotateX(${o.tiltX || 0}deg) rotateY(${o.tiltY || 0}deg)`
        : undefined;
      const shapeClip = computeShapeClipPath(o.textArrayShape);

      let textBg: string | undefined;
      let textFillColor: string | undefined = textColor;
      let bgClip: string | undefined;

      if (o.textMask === 'IMAGE' && o.textMaskUrl) {
        textBg = `url(${o.textMaskUrl}) center / cover`;
        textFillColor = 'transparent';
        bgClip = 'text';
      } else if (o.generativeEffect) {
        const st = o.generativeEffect.style;
        const grad = st === 'JUNGLE_FLORAL' ? 'linear-gradient(135deg, #10b981 0%, #047857 50%, #f472b6 100%)'
          : st === 'CYBER_CIRCUIT' ? 'linear-gradient(135deg, #0284c7 0%, #00f2fe 50%, #a855f7 100%)'
          : st === 'MOLTEN_MAGMA' ? 'linear-gradient(135deg, #fbbf24 0%, #ef4444 50%, #7f1d1d 100%)'
          : st === 'GLACIAL_ICE' ? 'linear-gradient(135deg, #e0f2fe 0%, #38bdf8 50%, #1e40af 100%)'
          : st === 'GOLDEN_FILIGREE' ? 'linear-gradient(135deg, #fef08a 0%, #eab308 50%, #713f12 100%)'
          : st === 'COSMIC_NEBULA' ? 'linear-gradient(135deg, #d946ef 0%, #6366f1 50%, #09090b 100%)'
          : st === 'SWEET_CANDY' ? 'linear-gradient(135deg, #f472b6 0%, #fb7185 50%, #fbcfe8 100%)'
          : 'linear-gradient(135deg, #d97706 0%, #b45309 50%, #451a03 100%)';
        textBg = o.generativeEffect.textureUrl ? `url(${o.generativeEffect.textureUrl}) center / cover` : grad;
        textFillColor = 'transparent';
        bgClip = 'text';
      } else if (o.material3D === 'HOLOGRAPHIC') {
        textBg = 'linear-gradient(135deg, #00DAF3 0%, #D40055 35%, #FFC107 70%, #06D6A0 100%)';
        textFillColor = 'transparent';
        bgClip = 'text';
      } else if (o.material3D === 'CHROME_LIQUID') {
        textBg = 'linear-gradient(135deg, #FFFFFF 0%, #B0C4DE 50%, #46556B 100%)';
        textFillColor = 'transparent';
        bgClip = 'text';
      } else if (o.material3D === 'GOLD_BRASS') {
        textBg = 'linear-gradient(135deg, #FFE57F 0%, #FFC107 50%, #B8860B 100%)';
        textFillColor = 'transparent';
        bgClip = 'text';
      }

      return decorate(
        <g
          transform={o.rotation ? `rotate(${o.rotation} ${cx} ${cy})` : undefined}
          onPointerDown={isEditing ? e => e.stopPropagation() : onPointerDown}
          onPointerMove={isEditing ? undefined : onPointerMove}
          onPointerUp={isEditing ? undefined : onPointerUp}
          onPointerCancel={isEditing ? undefined : onPointerCancel}
          onContextMenu={onContextMenu}
          onDoubleClick={onDoubleClick}
          style={{ cursor: isEditing ? 'text' : (interactive ? 'move' : 'default'), pointerEvents: sheetIdle ? 'none' : 'auto', ...blendStyle }}
          opacity={o.opacity}
          {...finish}
          data-tela-kind={sheet ? 'TEXT_LAYER' : 'TEXT_BOX'}
        >
          <foreignObject
            x={o.x}
            y={o.y}
            width={boxW}
            height={boxH}
            style={{ overflow: 'visible', pointerEvents: sheetIdle ? 'none' : 'auto' }}
          >
            {sheetIdle && <style>{'.tela-text-sheet-idle>*{pointer-events:auto}'}</style>}
            <div
              onDoubleClick={onDoubleClick}
              className={sheetIdle ? 'tela-text-sheet-idle' : undefined}
              style={{
                pointerEvents: sheetIdle ? 'none' : undefined,
                width: '100%',
                minHeight: '100%',
                boxSizing: 'border-box',
                background: textBg ? undefined : bg,
                backgroundImage: textBg,
                WebkitBackgroundClip: bgClip as any,
                WebkitTextFillColor: isEditing && textFillColor === 'transparent' ? textColor : textFillColor,
                clipPath: shapeClip,
                transform: perspectiveTransform,
                transformStyle: perspectiveTransform ? 'preserve-3d' : undefined,
                textShadow: text3DShadow,
                borderRadius: o.rx ? `${o.rx}px` : undefined,
                border: isEditing ? (sheet ? '1px dashed rgba(0, 218, 243, 0.55)' : '2px solid var(--pj-cyan, #00DAF3)') : border,
                boxShadow: isEditing && !sheet ? '0 0 0 3px rgba(0, 218, 243, 0.22)' : undefined,
                padding: `${pad}px`,
                color: textFillColor === 'transparent' && !isEditing ? undefined : textColor,
                fontFamily,
                fontSize: `${size}px`,
                lineHeight: leading,
                letterSpacing: tracking,
                textAlign: align,
                fontWeight: o.fontWeight || 400,
                fontStyle: o.fontStyle || 'normal',
                textTransform: o.textTransform || 'none',
                textDecoration: textDecor,
                columnCount: o.columns && o.columns > 1 ? o.columns : undefined,
                columnGap: o.columns && o.columns > 1 ? '18px' : undefined,
                wordBreak: 'break-word',
                userSelect: isEditing || isSelected ? 'text' : 'none',
                cursor: isEditing ? 'text' : (interactive ? 'move' : 'default'),
                mixBlendMode: o.textMask === 'KNOCKOUT' ? 'difference' : (o.blendMode || undefined) as any,
              }}
            >
              {renderedBlocks.map((blk, idx) => {
                const bText = blk.text ?? '';
                const isQuote = blk.semanticLabel?.toLowerCase().includes('quote') || (blk as any).textRole === 'QUOTE';

                if (isEditing) {
                  const blockStyle: React.CSSProperties = blk.kind === 'h1'
                    ? { fontWeight: 800, fontSize: '1.45em', marginBottom: '0.35em', lineHeight: 1.25, letterSpacing: '-0.02em' }
                    : blk.kind === 'h2'
                    ? { fontWeight: 700, fontSize: '1.2em', marginBottom: '0.3em', lineHeight: 1.3, letterSpacing: '-0.01em' }
                    : isQuote
                    ? {
                        borderLeft: '3px solid var(--pj-lilac, #8B5CFF)',
                        paddingLeft: '10px',
                        margin: '6px 0',
                        fontStyle: 'italic',
                        background: 'rgba(139, 92, 255, 0.08)',
                        borderRadius: '0 6px 6px 0',
                      }
                    : { marginBottom: '0.4em', minHeight: '1.2em' };

                  if (blk.kind === 'li') {
                    return (
                      <div key={blk.id || idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '0.25em' }}>
                        <span style={{ color: 'var(--pj-magenta, #D40055)', fontWeight: 800, userSelect: 'none' }}>•</span>
                        <EditableRichBlock
                          block={blk}
                          index={idx}
                          autoFocus={idx === activeBlockIdx}
                          style={{ flex: 1 }}
                          placeholder="List item…"
                          onFocusBlock={onFocusBlock}
                          onChangeText={handleBlockTextChange}
                          onInsertBlockAfter={handleInsertBlockAfter}
                          onDeleteEmptyBlock={handleDeleteEmptyBlock}
                          onToggleStyle={handleToggleStyle}
                          onExitEdit={onExitEdit}
                        />
                      </div>
                    );
                  }

                  return (
                    <EditableRichBlock
                      key={blk.id || idx}
                      block={blk}
                      index={idx}
                      autoFocus={idx === activeBlockIdx}
                      style={blockStyle}
                      placeholder={blk.kind === 'h1' ? 'Heading 1…' : blk.kind === 'h2' ? 'Heading 2…' : isQuote ? 'Quote…' : 'Type text…'}
                      onFocusBlock={onFocusBlock}
                      onChangeText={handleBlockTextChange}
                      onInsertBlockAfter={handleInsertBlockAfter}
                      onDeleteEmptyBlock={handleDeleteEmptyBlock}
                      onToggleStyle={handleToggleStyle}
                      onExitEdit={onExitEdit}
                    />
                  );
                }

                if (blk.kind === 'h1') {
                  return (
                    <div key={blk.id || idx} style={{ fontWeight: 800, fontSize: '1.45em', marginBottom: '0.35em', lineHeight: 1.25, letterSpacing: '-0.02em' }}>
                      {bText || <span style={{ opacity: 0.35 }}>Heading 1</span>}
                    </div>
                  );
                }
                if (blk.kind === 'h2') {
                  return (
                    <div key={blk.id || idx} style={{ fontWeight: 700, fontSize: '1.2em', marginBottom: '0.3em', lineHeight: 1.3, letterSpacing: '-0.01em' }}>
                      {bText || <span style={{ opacity: 0.35 }}>Heading 2</span>}
                    </div>
                  );
                }
                if (blk.kind === 'li') {
                  return (
                    <div key={blk.id || idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '0.25em' }}>
                      <span style={{ color: 'var(--pj-magenta, #D40055)', fontWeight: 800 }}>•</span>
                      <span>{bText || <span style={{ opacity: 0.35 }}>List item</span>}</span>
                    </div>
                  );
                }
                if (isQuote) {
                  return (
                    <div
                      key={blk.id || idx}
                      style={{
                        borderLeft: '3px solid var(--pj-lilac, #8B5CFF)',
                        paddingLeft: '10px',
                        margin: '6px 0',
                        fontStyle: 'italic',
                        background: 'rgba(139, 92, 255, 0.08)',
                        borderRadius: '0 6px 6px 0',
                      }}
                    >
                      {bText || <span style={{ opacity: 0.35 }}>Quote or callout…</span>}
                    </div>
                  );
                }
                return (
                  <div key={blk.id || idx} style={{ marginBottom: '0.4em', minHeight: '1.2em' }}>
                    {bText || <span style={{ opacity: 0.35 }}>Type text…</span>}
                  </div>
                );
              })}
            </div>
          </foreignObject>
          {!isEditing && <rect x={o.x} y={o.y} width={boxW} height={boxH} fill="transparent" onDoubleClick={onDoubleClick} />}
        </g>
      );
    }

    const lines = textLines(o, writerTexts);
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
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onContextMenu={onContextMenu} onDoubleClick={onDoubleClick}
        style={{ cursor: interactive ? 'move' : 'default', userSelect: 'none', pointerEvents: 'auto', ...blendStyle }}
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

export const TelaTypographyToolbar: React.FC<{
  object: TelaVectorObject;
  onUpdate: (patch: Partial<TelaVectorObject>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  bounds: { x: number; y: number; w: number; h: number };
  isEditing?: boolean;
  activeBlockIdx?: number;
  onToggleEdit?: () => void;
}> = ({ object: o, onUpdate, onDelete, onDuplicate, bounds, isEditing, activeBlockIdx = 0, onToggleEdit }) => {
  const size = o.fontSize || 18;

  const ensureBlocks = (): TelaBlock[] => {
    if (o.blocks && o.blocks.length > 0) return [...o.blocks];
    const lines = (o.text || '').split('\n').filter(Boolean);
    if (lines.length > 0) {
      return lines.map((line, i) => ({
        id: `blk_${Date.now()}_${i}`,
        kind: (i === 0 && lines.length > 1 ? 'h2' as const : 'p' as const),
        text: line,
      }));
    }
    return [{ id: `blk_${Date.now()}_0`, kind: 'p' as const, text: o.text || '' }];
  };

  const formatOrAddBlock = (kind: 'h1' | 'h2' | 'p' | 'li' | 'quote', forceAdd = false) => {
    const existing = ensureBlocks();
    const targetIdx = Math.min(Math.max(0, activeBlockIdx), existing.length - 1);
    if (!forceAdd && existing[targetIdx]) {
      existing[targetIdx] = {
        ...existing[targetIdx],
        kind: kind === 'quote' ? 'p' : kind,
        semanticLabel: kind === 'quote' ? 'quote' : undefined,
      };
    } else {
      const newId = `blk_${Date.now()}_${existing.length}`;
      if (kind === 'quote') {
        existing.push({ id: newId, kind: 'p', text: 'Callout or memorable quote', semanticLabel: 'quote' });
      } else {
        existing.push({ id: newId, kind, text: kind === 'li' ? 'New list item' : kind === 'h1' ? 'Heading 1' : kind === 'h2' ? 'Heading 2' : 'New paragraph text' });
      }
    }
    const fullText = existing.map(b => b.text).join('\n');
    onUpdate({ blocks: existing, text: fullText, wrap: true });
  };

  const fonts = [
    { label: 'Inter (Sans)', value: 'Inter, system-ui, sans-serif' },
    { label: 'Playfair (Serif)', value: 'Playfair Display, Georgia, serif' },
    { label: 'Cormorant (Editorial)', value: 'Cormorant Garamond, serif' },
    { label: 'JetBrains (Mono)', value: 'JetBrains Mono, monospace' },
    { label: 'Syne (Display)', value: 'Syne, sans-serif' },
    { label: 'Georgia (Classic)', value: 'Georgia, serif' },
  ];

  const cardBgs = [
    { label: 'Clear', value: 'transparent' },
    { label: 'White Card', value: 'rgba(255, 255, 255, 0.98)' },
    { label: 'Dark Card', value: 'rgba(24, 19, 36, 0.96)' },
    { label: 'Lilac Tint', value: 'rgba(107, 0, 153, 0.08)' },
    { label: 'Amber Tint', value: 'rgba(245, 158, 11, 0.08)' },
    { label: 'Cyan Tint', value: 'rgba(0, 218, 243, 0.08)' },
  ];

  return (
    <div
      onPointerDown={e => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: Math.max(8, bounds.x),
        top: Math.max(8, bounds.y - 48),
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        background: 'rgba(18, 13, 28, 0.95)',
        border: '1px solid rgba(255, 255, 255, 0.16)',
        borderRadius: 12,
        boxShadow: '0 12px 32px rgba(0,0,0,0.65)',
        backdropFilter: 'blur(10px)',
        color: '#fff',
        fontSize: 11,
        userSelect: 'none',
        pointerEvents: 'auto',
      }}
    >
      {/* Inline Edit Toggle */}
      {onToggleEdit && (
        <button
          onClick={onToggleEdit}
          title={isEditing ? 'Finish editing text (Esc)' : 'Double-click text box or click here to type & edit text'}
          className={`px-2 py-0.5 mr-1 rounded-[6px] font-bold text-[10px] border transition ${
            isEditing
              ? 'bg-[#00DAF3]/20 border-[#00DAF3]/50 text-[#00DAF3]'
              : 'bg-white/10 border-white/15 text-white/90 hover:bg-white/20'
          }`}
        >
          {isEditing ? '✓ Editing' : '✎ Edit Text'}
        </button>
      )}

      {/* Block formatting & quick adds */}
      <div className="flex items-center gap-1 pr-1.5 border-r border-white/15">
        <button
          onClick={e => formatOrAddBlock('h1', e.shiftKey)}
          title="Format block as Heading 1 (Shift+click to append new H1)"
          className="px-1.5 py-0.5 rounded-[6px] hover:bg-white/10 font-black text-[11px] text-[#D0BCFF]"
        >
          H1
        </button>
        <button
          onClick={e => formatOrAddBlock('h2', e.shiftKey)}
          title="Format block as Heading 2 (Shift+click to append new H2)"
          className="px-1.5 py-0.5 rounded-[6px] hover:bg-white/10 font-bold text-[11px] text-[#D0BCFF]"
        >
          H2
        </button>
        <button
          onClick={e => formatOrAddBlock('p', e.shiftKey)}
          title="Format block as Body Paragraph (Shift+click to append new paragraph)"
          className="px-1.5 py-0.5 rounded-[6px] hover:bg-white/10 font-medium text-[11px] text-white/80"
        >
          ¶
        </button>
        <button
          onClick={e => formatOrAddBlock('li', e.shiftKey)}
          title="Format block as Bullet List Item (Shift+click to append new item)"
          className="px-1.5 py-0.5 rounded-[6px] hover:bg-white/10 font-bold text-[11px] text-[#D40055]"
        >
          • List
        </button>
        <button
          onClick={e => formatOrAddBlock('quote', e.shiftKey)}
          title="Format block as Quote / Callout (Shift+click to append new quote)"
          className="px-1.5 py-0.5 rounded-[6px] hover:bg-white/10 italic font-serif text-[11px] text-[#00DAF3]"
        >
          “ ”
        </button>
        <button
          onClick={() => formatOrAddBlock('p', true)}
          title="Add a new paragraph block below"
          className="px-1.5 py-0.5 rounded-[6px] bg-white/10 hover:bg-white/20 font-bold text-[10px] text-white/90"
        >
          +¶
        </button>
      </div>

      {/* Font Family selector */}
      <select
        value={o.fontFamily || fonts[0].value}
        onChange={e => onUpdate({ fontFamily: e.target.value })}
        className="h-6 px-1.5 rounded-[6px] bg-white/10 border border-white/15 text-[11px] font-semibold text-white/90 outline-none"
      >
        {fonts.map(f => (
          <option key={f.value} value={f.value} style={{ background: '#1c1728', color: '#fff' }}>
            {f.label}
          </option>
        ))}
      </select>

      {/* Font Size */}
      <div className="flex items-center rounded-[6px] bg-white/10 border border-white/15 px-1 h-6">
        <button
          onClick={() => onUpdate({ fontSize: Math.max(8, size - 2) })}
          className="px-1 hover:text-[#00DAF3] font-bold text-[11px]"
        >
          −
        </button>
        <span className="px-1 font-mono text-[10px] min-w-[26px] text-center font-bold">{size}</span>
        <button
          onClick={() => onUpdate({ fontSize: Math.min(120, size + 2) })}
          className="px-1 hover:text-[#00DAF3] font-bold text-[11px]"
        >
          +
        </button>
      </div>

      {/* Style toggles */}
      <button
        onClick={() => onUpdate({ fontWeight: (o.fontWeight || 400) >= 700 ? 400 : 700 })}
        className={`w-6 h-6 rounded-[6px] grid place-items-center font-black text-[11px] ${
          (o.fontWeight || 400) >= 700 ? 'bg-[var(--pj-magenta,#D40055)] text-white' : 'hover:bg-white/10 text-white/70'
        }`}
        title="Bold"
      >
        B
      </button>
      <button
        onClick={() => onUpdate({ fontStyle: o.fontStyle === 'italic' ? 'normal' : 'italic' })}
        className={`w-6 h-6 rounded-[6px] grid place-items-center font-serif italic text-[11px] ${
          o.fontStyle === 'italic' ? 'bg-[var(--pj-magenta,#D40055)] text-white' : 'hover:bg-white/10 text-white/70'
        }`}
        title="Italic"
      >
        I
      </button>
      <button
        onClick={() => onUpdate({ underline: !o.underline })}
        className={`w-6 h-6 rounded-[6px] grid place-items-center underline text-[11px] ${
          o.underline ? 'bg-[var(--pj-magenta,#D40055)] text-white' : 'hover:bg-white/10 text-white/70'
        }`}
        title="Underline"
      >
        U
      </button>

      {/* Alignment */}
      <div className="flex items-center gap-0.5 pl-1 border-l border-white/15">
        {(['left', 'center', 'right'] as const).map(a => (
          <button
            key={a}
            onClick={() => onUpdate({ textAlign: a })}
            className={`w-5 h-6 rounded-[5px] grid place-items-center text-[9px] font-bold ${
              (o.textAlign || 'left') === a ? 'text-[#00DAF3] bg-white/15' : 'text-white/50 hover:bg-white/10'
            }`}
            title={`Align ${a}`}
          >
            {a === 'left' ? '⫷' : a === 'center' ? '☰' : '⫸'}
          </button>
        ))}
      </div>

      {/* Colors */}
      <div className="flex items-center gap-1.5 pl-1.5 border-l border-white/15">
        <label title="Text Color" className="flex items-center cursor-pointer">
          <input
            type="color"
            value={o.fill && o.fill !== 'none' ? o.fill : '#1E1B26'}
            onChange={e => onUpdate({ fill: e.target.value })}
            className="w-4 h-4 rounded-full border border-white/30 cursor-pointer p-0 bg-transparent"
          />
        </label>
        <button
          onClick={() => {
            const currentIdx = cardBgs.findIndex(c => c.value === (o.backgroundColor || 'transparent'));
            const next = cardBgs[(currentIdx + 1) % cardBgs.length];
            onUpdate({
              backgroundColor: next.value,
              rx: next.value !== 'transparent' ? (o.rx || 8) : o.rx,
              padding: next.value !== 'transparent' ? (o.padding || 14) : o.padding,
              wrap: true,
            });
          }}
          className="h-6 px-1.5 rounded-[6px] bg-white/10 hover:bg-white/20 text-[10px] font-bold text-white/80"
          title="Toggle Card Background style"
        >
          {o.backgroundColor && o.backgroundColor !== 'transparent' ? 'Card' : 'Clear'}
        </button>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-0.5 pl-1.5 border-l border-white/15">
        <button
          onClick={onDuplicate}
          title="Duplicate text box"
          className="w-6 h-6 rounded-[6px] hover:bg-white/10 grid place-items-center text-white/70 hover:text-white"
        >
          <Copy size={12} />
        </button>
        <button
          onClick={onDelete}
          title="Delete text box"
          className="w-6 h-6 rounded-[6px] hover:bg-red-500/20 grid place-items-center text-white/50 hover:text-red-400"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
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
  const isImage = o.kind === 'IMAGE' || o.kind === 'LOTTIE' || o.kind === 'MOTION_TEMPLATE';
  const isLine = o.kind === 'LINE' || o.kind === 'PATH';
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 3 };
  const rowCls = 'flex items-center gap-2 mb-2';
  const numStyle: React.CSSProperties = { width: 56, height: 28, padding: '0 7px', borderRadius: 7, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', fontSize: 12, outline: 'none' };
  const swatch: React.CSSProperties = { width: 30, height: 28, padding: 0, border: '1px solid rgba(255,255,255,0.18)', borderRadius: 7, background: 'transparent', cursor: 'pointer' };

  const fonts = [
    { label: 'Inter (Sans)', value: 'Inter, system-ui, sans-serif' },
    { label: 'Playfair Display (Serif)', value: 'Playfair Display, Georgia, serif' },
    { label: 'Cormorant Garamond (Editorial)', value: 'Cormorant Garamond, serif' },
    { label: 'JetBrains Mono (Code)', value: 'JetBrains Mono, monospace' },
    { label: 'Syne (Display)', value: 'Syne, sans-serif' },
    { label: 'Georgia (Classic)', value: 'Georgia, serif' },
  ];

  const addBlockToProp = (kind: 'h1' | 'h2' | 'p' | 'li' | 'quote') => {
    const existing = o.blocks && o.blocks.length > 0 ? [...o.blocks] : [
      { id: `blk_${Date.now()}_0`, kind: 'h2' as const, text: o.text || 'Heading' }
    ];
    const newId = `blk_${Date.now()}_${existing.length}`;
    if (kind === 'quote') {
      existing.push({ id: newId, kind: 'p', text: 'Callout or quote', semanticLabel: 'quote' });
    } else {
      existing.push({ id: newId, kind, text: kind === 'li' ? 'List item' : kind === 'h1' ? 'Heading 1' : kind === 'h2' ? 'Heading 2' : 'Paragraph text' });
    }
    const fullText = existing.map(b => b.text).join('\n');
    onUpdate({ blocks: existing, text: fullText, wrap: true });
  };

  return (
    <div style={{ color: '#fff' }}>
      {o.kind === 'LOTTIE' && <TelaLottieInspector object={o} onUpdate={onUpdate} />}
      {o.kind === 'MOTION_TEMPLATE' && <TelaMotionTemplateInspector object={o} onUpdate={onUpdate} />}
      {isText && (
        <div style={{ marginBottom: 12 }}>
          {/* Paragraph Blocks Toolset */}
          <div style={{ marginBottom: 8 }}>
            <div className="flex items-center justify-between mb-1.5">
              <div style={lbl}>Paragraph Blocks</div>
              <div className="flex items-center gap-1">
                <button onClick={() => addBlockToProp('h1')} className="px-1.5 py-0.5 rounded text-[10px] font-black bg-white/10 text-[#D0BCFF] hover:bg-white/20">H1</button>
                <button onClick={() => addBlockToProp('h2')} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/10 text-[#D0BCFF] hover:bg-white/20">H2</button>
                <button onClick={() => addBlockToProp('p')} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/10 text-white/80 hover:bg-white/20">¶</button>
                <button onClick={() => addBlockToProp('li')} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/10 text-[#D40055] hover:bg-white/20">• List</button>
                <button onClick={() => addBlockToProp('quote')} className="px-1.5 py-0.5 rounded text-[10px] font-serif italic bg-white/10 text-[#00DAF3] hover:bg-white/20">“ ”</button>
              </div>
            </div>

            {o.blocks && o.blocks.length > 0 ? (
              <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto custom-scrollbar p-1 rounded-lg bg-black/20 border border-white/10">
                {o.blocks.map((blk, idx) => (
                  <div key={blk.id || idx} className="flex items-center gap-1.5 p-1 rounded bg-white/[0.04]">
                    <span className="text-[9px] font-bold text-white/40 uppercase w-4">{blk.kind}</span>
                    <input
                      type="text"
                      value={blk.text ?? ''}
                      onChange={e => {
                        const updated = [...o.blocks!];
                        updated[idx] = { ...updated[idx], text: e.target.value };
                        onUpdate({ blocks: updated, text: updated.map(b => b.text).join('\n') });
                      }}
                      className="flex-1 bg-transparent border-none text-[11px] text-white outline-none"
                    />
                    <button
                      onClick={() => {
                        const updated = o.blocks!.filter((_, i) => i !== idx);
                        onUpdate({ blocks: updated, text: updated.map(b => b.text).join('\n') });
                      }}
                      className="text-white/30 hover:text-red-400 p-0.5"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <textarea
                value={o.text ?? ''}
                onChange={e => onUpdate({ text: e.target.value })}
                rows={3}
                disabled={!!o.boundWriterDeviceId}
                placeholder={o.boundWriterDeviceId ? 'Bound to a Writer — edit it there' : 'Type paragraphs here…'}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: o.boundWriterDeviceId ? 'rgba(255,255,255,0.45)' : '#fff', fontSize: 12, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
              />
            )}
          </div>

          {/* Font Family */}
          <div style={{ marginBottom: 8 }}>
            <div style={lbl}>Font Family</div>
            <select
              value={o.fontFamily || fonts[0].value}
              onChange={e => onUpdate({ fontFamily: e.target.value })}
              style={{ width: '100%', height: 28, padding: '0 8px', borderRadius: 7, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', fontSize: 11.5, outline: 'none' }}
            >
              {fonts.map(f => <option key={f.value} value={f.value} style={{ background: '#1c1728', color: '#fff' }}>{f.label}</option>)}
            </select>
          </div>

          {writers && writers.length > 0 && (
            <div style={{ marginTop: 6, marginBottom: 8 }}>
              <div style={lbl}>Bind to Writer <span style={{ color: 'var(--pj-cyan,#00DAF3)' }}>· live</span></div>
              <div className="flex items-center gap-2">
                <select
                  value={o.boundWriterDeviceId || ''}
                  onChange={e => onUpdate({ boundWriterDeviceId: e.target.value || undefined })}
                  style={{ flex: 1, height: 28, padding: '0 8px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(0,218,243,0.35)', color: '#8fe9f6', fontSize: 11, outline: 'none' }}
                >
                  <option value="">— not bound —</option>
                  {writers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                {o.boundWriterDeviceId && (
                  <button title="Unbind" onClick={() => onUpdate({ boundWriterDeviceId: undefined })} style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', cursor: 'pointer' }}><Unlink size={13} /></button>
                )}
              </div>
            </div>
          )}

          {/* Size, Weight, Style */}
          <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
            <div>
              <div style={lbl}>Size</div>
              <input type="number" value={o.fontSize || 18} onChange={e => onUpdate({ fontSize: Math.max(4, +e.target.value || 18) })} style={numStyle} />
            </div>
            <div>
              <div style={lbl}>Weight</div>
              <select value={o.fontWeight || 400} onChange={e => onUpdate({ fontWeight: +e.target.value })} style={{ ...numStyle, width: 70 }}>
                {[100, 200, 300, 400, 500, 600, 700, 800, 900].map(w => <option key={w} value={w} style={{ background: '#1c1728' }}>{w}</option>)}
              </select>
            </div>
            <div>
              <div style={lbl}>Style</div>
              <div className="flex gap-1">
                <button title="Italic" onClick={() => onUpdate({ fontStyle: o.fontStyle === 'italic' ? 'normal' : 'italic' })} style={{ ...numStyle, width: 28, padding: 0, fontStyle: 'italic', fontWeight: 700, cursor: 'pointer', color: o.fontStyle === 'italic' ? 'var(--pj-cyan,#00DAF3)' : '#fff' }}>I</button>
                <button title="Underline" onClick={() => onUpdate({ underline: !o.underline })} style={{ ...numStyle, width: 28, padding: 0, textDecoration: 'underline', fontWeight: 700, cursor: 'pointer', color: o.underline ? 'var(--pj-cyan,#00DAF3)' : '#fff' }}>U</button>
              </div>
            </div>
          </div>

          {/* Align, Track, Lead */}
          <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
            <div>
              <div style={lbl}>Align</div>
              <div className="flex" style={{ gap: 2 }}>
                {(['left', 'center', 'right'] as const).map(a => (
                  <button key={a} title={a} onClick={() => onUpdate({ textAlign: a })} style={{ ...numStyle, width: 26, padding: 0, cursor: 'pointer', fontSize: 10, fontWeight: 800, color: (o.textAlign || 'left') === a ? 'var(--pj-cyan,#00DAF3)' : 'rgba(255,255,255,.6)' }}>
                    {a === 'left' ? '⫷' : a === 'center' ? '☰' : '⫸'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={lbl} title="Tracking in %">Track</div>
              <input type="number" step={1} value={Math.round((o.letterSpacing || 0) * 100)} onChange={e => onUpdate({ letterSpacing: (+e.target.value || 0) / 100 })} style={{ ...numStyle, width: 48 }} />
            </div>
            <div>
              <div style={lbl} title="Leading multiple">Lead</div>
              <input type="number" step={0.05} value={o.lineHeight ?? 1.5} onChange={e => onUpdate({ lineHeight: Math.max(.6, +e.target.value || 1.5) })} style={{ ...numStyle, width: 50 }} />
            </div>
          </div>

          {/* Box Style (Background, Padding, Radius) */}
          <div style={{ marginTop: 10, padding: '8px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={lbl}>Card & Box Styling</div>
            <div className="flex items-center gap-2 mt-1">
              <div>
                <span className="text-[10px] text-white/50 block mb-1">Background</span>
                <input
                  type="color"
                  value={o.backgroundColor && o.backgroundColor !== 'transparent' ? o.backgroundColor : '#ffffff'}
                  onChange={e => onUpdate({ backgroundColor: e.target.value, wrap: true })}
                  style={swatch}
                />
              </div>
              <button
                onClick={() => onUpdate({ backgroundColor: o.backgroundColor === 'transparent' || !o.backgroundColor ? 'rgba(255,255,255,0.96)' : 'transparent' })}
                className="h-7 px-2 rounded text-[10px] font-bold bg-white/10 hover:bg-white/20 text-white/80"
              >
                {o.backgroundColor && o.backgroundColor !== 'transparent' ? 'Solid' : 'Clear'}
              </button>
              <div>
                <span className="text-[10px] text-white/50 block mb-1">Padding</span>
                <input
                  type="number"
                  min={0}
                  max={48}
                  value={o.padding ?? (o.backgroundColor ? 14 : 0)}
                  onChange={e => onUpdate({ padding: Math.max(0, +e.target.value || 0), wrap: true })}
                  style={{ ...numStyle, width: 48 }}
                />
              </div>
              <div>
                <span className="text-[10px] text-white/50 block mb-1">Radius</span>
                <input
                  type="number"
                  min={0}
                  max={32}
                  value={o.rx ?? 0}
                  onChange={e => onUpdate({ rx: Math.max(0, +e.target.value || 0) })}
                  style={{ ...numStyle, width: 44 }}
                />
              </div>
            </div>
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
    {objects.map(o => <ObjectEl key={o.id} o={o} writerTexts={writerTexts} interactive={false} staticRender />)}
  </svg>
);

// ── The device ────────────────────────────────────────────────────────────────

interface TelaVectorProps {
  device: TelaVectorDevice;
  readOnly?: boolean;
  /** Studio drives tool/selection + hides internal chrome; default = self-managed. */
  chrome?: boolean;
  /** When true, renders with a transparent background as an overlay on any page */
  overlay?: boolean;
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
  /** Type tool: the host creates the text layer (page-sized sheet) instead of a point-text object. */
  onTypeAt?: (p: { x: number; y: number }) => void;
  /** Ask this device to select an object and put the caret in it (nonce re-fires the same id). */
  editTextRequest?: { id: string; nonce: number } | null;
}

const TOOLS: { id: VectorTool; icon: React.ReactNode; label: string }[] = [
  { id: 'select', icon: <MousePointer2 size={15} />, label: 'Select' },
  { id: 'direct', icon: <MousePointerClick size={15} />, label: 'Direct select / edit anchors' },
  { id: 'text', icon: <Type size={15} />, label: 'Typography / Text Box' },
  { id: 'rect', icon: <Square size={15} />, label: 'Rectangle' },
  { id: 'ellipse', icon: <Circle size={15} />, label: 'Ellipse' },
  { id: 'line', icon: <Minus size={15} />, label: 'Line' },
  { id: 'pen', icon: <PenTool size={15} />, label: 'Pen / polyline' },
  { id: 'ink', icon: <Brush size={15} />, label: 'Ink — freehand pen, pencil, highlighter' },
  { id: 'marquee', icon: <Scan size={15} />, label: 'Marquee select' },
];

const INK_TOOLS: { id: NoteTool; icon: React.ReactNode; label: string }[] = [
  { id: 'pen', icon: <Pen size={14} />, label: 'Pen' },
  { id: 'pencil', icon: <Pencil size={14} />, label: 'Pencil' },
  { id: 'highlighter', icon: <Highlighter size={14} />, label: 'Highlighter' },
  { id: 'eraser', icon: <Eraser size={14} />, label: 'Eraser (whole strokes)' },
  { id: 'lasso', icon: <Lasso size={14} />, label: 'Lasso select' },
];
const INK_COLORS = ['#16131f', '#D40055', '#6B0099', '#00A3B8', '#E07A00', '#2E7D32', '#ffffff'];

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
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [activeBlockIdx, setActiveBlockIdx] = useState<number>(0);
  const selectedId = props.selectedId !== undefined ? props.selectedId : selI;
  const selectedIds = props.selectedIds !== undefined ? props.selectedIds : selIdsI;

  useEffect(() => {
    if (editingTextId && selectedId !== editingTextId) {
      setEditingTextId(null);
    }
  }, [selectedId, editingTextId]);

  // Host edit requests (a text layer born from typing) — fire once the object exists here.
  const handledEditNonce = useRef<number | null>(null);
  const editReq = props.editTextRequest;
  useEffect(() => {
    if (!editReq || readOnly || handledEditNonce.current === editReq.nonce) return;
    const target = device.objects.find(o => o.id === editReq.id && o.kind === 'TEXT');
    if (!target) return;
    handledEditNonce.current = editReq.nonce;
    const blocks = target.blocks?.length || 1;
    setEditingTextId(target.id); setActiveBlockIdx(blocks - 1);
  }, [editReq, device.objects, readOnly]);

  // Leaving an empty text layer discards it (as a click-and-abandon in any type tool would).
  const lastEditing = useRef<string | null>(null);
  useEffect(() => {
    const prev = lastEditing.current;
    lastEditing.current = editingTextId;
    if (!prev || prev === editingTextId || readOnly) return;
    const left = device.objects.find(o => o.id === prev);
    if (left?.textRole === 'LAYER' && !(left.blocks?.map(b => b.text).join('') ?? left.text ?? '').trim()) onDeleteObject(left.id);
  }, [editingTextId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectMany = (ids: string[]) => {
    const next = [...new Set(ids)].filter(id => device.objects.some(object => object.id === id));
    const primary = next.at(-1) || null;
    if (editingTextId && primary !== editingTextId) {
      setEditingTextId(null);
    }
    setSelIdsI(next); setSelI(primary); props.onSelectionChange?.(next); props.onSelect?.(primary);
  };
  const select = (id: string | null) => selectMany(id ? [id] : []);

  // Ink tool: sub-tool + style live here; strokes are ordinary PATH objects in the device.
  const [inkTool, setInkTool] = useState<NoteTool>('pen');
  const [inkStyle, setInkStyle] = useState<InkStyle>({ color: INK_COLORS[0], size: 2.4, tool: 'pen' });
  const pickInk = (t: NoteTool) => { setInkTool(t); if (t === 'pen' || t === 'pencil' || t === 'highlighter') setInkStyle(st => ({ ...st, tool: t, size: t === 'highlighter' ? 3 : t === 'pencil' ? 2 : 2.4 })); };
  const inkStrokes = device.objects.filter(o => o.kind === 'PATH' && o.points && !o.svgPathData);
  const inkErased = useRef<Set<string>>(new Set());

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
    const wasEditing = !!editingTextId;
    setEditingTextId(null);
    const p = svgPoint(e);
    if (tool === 'ink') return; // the ink layer owns pointer input
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
    if (tool === 'text' && props.onTypeAt) {
      // A click off the layer being typed just ends that edit; the next click makes a new layer.
      if (!wasEditing) props.onTypeAt(p);
      return;
    }
    if (tool === 'text') {
      const o = makeObject('TEXT', p.x, p.y - 24);
      onAddObject(o); select(o.id); setEditingTextId(o.id); setActiveBlockIdx(0); setTool('select');
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
    if (editingTextId === id) return;
    if (tool === 'text') {
      // Type tool on existing text: put the caret in it instead of making a new layer.
      const hit = device.objects.find(x => x.id === id);
      if (hit?.kind === 'TEXT' && !hit.locked) { e.stopPropagation(); select(id); setEditingTextId(id); setActiveBlockIdx(Math.max(0, (hit.blocks?.length || 1) - 1)); }
      return;
    }
    if (tool !== 'select' && tool !== 'direct') return; // let the bg handle creation tools
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const nextIds = (e.shiftKey || e.ctrlKey || e.metaKey)
      ? (selectedIds.includes(id) ? selectedIds.filter(item => item !== id) : [...selectedIds, id])
      : (selectedIds.includes(id) && selectedIds.length > 1 ? selectedIds : [id]);
    selectMany(nextIds);
    if (!nextIds.includes(id)) return;
    const o = device.objects.find(x => x.id === id);
    if (!o || o.locked) return;
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
    if (readOnly || !selectedIds.length || editingTextId) return;
    if (e.key === 'Enter' && selected && selected.kind === 'TEXT') {
      e.preventDefault();
      e.stopPropagation();
      setEditingTextId(selected.id);
      setActiveBlockIdx(0);
      return;
    }
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
    <div
      className="tela-vector"
      style={{
        position: props.overlay ? 'absolute' : 'relative',
        inset: props.overlay ? 0 : undefined,
        width: device.width,
        height: device.height,
        background: props.overlay ? 'transparent' : '#fff',
        pointerEvents: props.overlay ? 'none' : 'auto',
      }}
    >
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

      {/* Ink options — shown whenever the Ink tool is active (Studio hides the palette but not these). */}
      {!readOnly && tool === 'ink' && (
        <div onPointerDown={e => e.stopPropagation()} style={{ position: 'absolute', top: chrome ? 46 : 8, left: 8, zIndex: 4, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', padding: 4, maxWidth: 'calc(100% - 16px)', background: 'rgba(18,13,28,0.92)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, backdropFilter: 'blur(6px)' }}>
          {INK_TOOLS.map(t => (
            <button key={t.id} title={t.label} aria-label={t.label} aria-pressed={inkTool === t.id} onClick={() => pickInk(t.id)}
              style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 7, border: 'none', cursor: 'pointer', color: inkTool === t.id ? '#fff' : 'rgba(255,255,255,0.55)', background: inkTool === t.id ? 'var(--pj-grad-brand, linear-gradient(135deg,#6B0099,#D40055))' : 'transparent' }}>{t.icon}</button>
          ))}
          <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.15)' }} />
          {INK_COLORS.map(c => (
            <button key={c} aria-label={`Ink colour ${c}`} aria-pressed={inkStyle.color === c} onClick={() => { setInkStyle(st => ({ ...st, color: c })); if (inkTool === 'eraser' || inkTool === 'lasso') pickInk('pen'); }}
              style={{ width: 18, height: 18, borderRadius: 9, cursor: 'pointer', background: c, border: `2px solid ${inkStyle.color === c ? '#fff' : 'rgba(255,255,255,0.25)'}` }} />
          ))}
          <input type="range" min={1} max={12} step={0.5} value={inkStyle.size} onChange={e => setInkStyle(st => ({ ...st, size: +e.target.value }))} aria-label="Ink thickness" style={{ width: 70 }} />
        </div>
      )}

      <svg
        ref={svgRef}
        width={device.width}
        height={device.height}
        viewBox={`0 0 ${device.width} ${device.height}`}
        style={{ display: 'block', touchAction: 'none', pointerEvents: props.overlay ? 'none' : 'auto' }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        tabIndex={0}
        onDoubleClick={() => { if (penPts) finishPen(); }}
      >
        {/* Artboard background — captures create/deselect pointers. */}
        <rect
          x={0}
          y={0}
          width={device.width}
          height={device.height}
          fill={props.overlay ? 'transparent' : '#FFFFFF'}
          pointerEvents={props.overlay && (tool === 'select' || tool === 'direct') && !editingTextId ? 'none' : 'all'}
          onPointerDown={onBgPointerDown}
        />

        {device.objects.map(o => { const menu = props.objectContextBindings?.(o); return (
          <ObjectEl
            key={o.id} o={o} writerTexts={writerTexts}
            interactive={!readOnly && (tool === 'select' || tool === 'direct')}
            isSelected={o.id === selectedId}
            isEditing={!readOnly && o.kind === 'TEXT' && editingTextId === o.id}
            activeBlockIdx={activeBlockIdx}
            onFocusBlock={idx => setActiveBlockIdx(idx)}
            onDoubleClick={readOnly ? undefined : e => {
              if (o.kind === 'TEXT') {
                e.stopPropagation();
                select(o.id);
                setEditingTextId(o.id);
                setActiveBlockIdx(0);
              }
            }}
            onUpdateObject={readOnly ? undefined : patch => onUpdateObject(o.id, patch)}
            onExitEdit={() => setEditingTextId(null)}
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
          <g style={{ pointerEvents: 'auto' }}>
            <rect x={selBounds.x} y={selBounds.y} width={selBounds.w} height={selBounds.h}
              fill="none" stroke="var(--pj-magenta,#D40055)" strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />
            {selected && (selected.kind === 'LINE') && selected.points
              ? [0, 1].map(i => (
                  <rect key={i} x={selected.points![i * 2] - 5} y={selected.points![i * 2 + 1] - 5} width={10} height={10}
                    fill="#fff" stroke="var(--pj-magenta,#D40055)" strokeWidth={1.5} vectorEffect="non-scaling-stroke"
                    style={{ cursor: 'crosshair', pointerEvents: 'auto' }} onPointerDown={e => onLinePtPointerDown(e, i)} />
                ))
              : selected?.kind === 'PATH' && selected.pathNodes && tool === 'direct' ? selected.pathNodes.map((n, i) => {
                  const ox = selected.pathOriginX ?? selected.x, oy = selected.pathOriginY ?? selected.y;
                  const sx = selected.w / Math.max(1, selected.pathOriginW ?? selected.w), sy = selected.h / Math.max(1, selected.pathOriginH ?? selected.h);
                  return <circle key={n.id} cx={selected.x + (n.x - ox) * sx} cy={selected.y + (n.y - oy) * sy} r={4.5} fill="#fff" stroke="var(--pj-magenta,#D40055)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ cursor: 'crosshair', pointerEvents: 'auto' }} onPointerDown={e => onPathNodePointerDown(e, i)} />;
                })
              : selected && selected.kind !== 'LINE' && tool === 'select' && handles.map(h => (
                  <rect key={h.k} x={h.x - 5} y={h.y - 5} width={10} height={10}
                    fill="#fff" stroke="var(--pj-magenta,#D40055)" strokeWidth={1.5} vectorEffect="non-scaling-stroke"
                    style={{ cursor: h.k === 'nw' || h.k === 'se' ? 'nwse-resize' : 'nesw-resize', pointerEvents: 'auto' }}
                    onPointerDown={e => onHandlePointerDown(e, h.k)} />
                ))}
            {selected && tool === 'select' && <><line x1={selBounds.x + selBounds.w / 2} y1={selBounds.y} x2={selBounds.x + selBounds.w / 2} y2={selBounds.y - 28} stroke="var(--pj-magenta,#D40055)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" pointerEvents="none"/><circle cx={selBounds.x + selBounds.w / 2} cy={selBounds.y - 32} r={5} fill="#fff" stroke="var(--pj-magenta,#D40055)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ cursor: 'grab', pointerEvents: 'auto' }} onPointerDown={onRotatePointerDown}/></>}
          </g>
        )}
      </svg>

      {/* Floating typography toolbar above selected text box */}
      {/* Text layers (page sheets) are styled from the host's tool-options row instead. */}
      {!readOnly && selected && selected.kind === 'TEXT' && selBounds && !(selected.textRole === 'LAYER' && !chrome) && (
        <TelaTypographyToolbar
          object={selected}
          bounds={selBounds}
          isEditing={editingTextId === selected.id}
          activeBlockIdx={activeBlockIdx}
          onToggleEdit={() => {
            if (editingTextId === selected.id) {
              setEditingTextId(null);
            } else {
              setEditingTextId(selected.id);
              setActiveBlockIdx(0);
            }
          }}
          onUpdate={patch => onUpdateObject(selected.id, patch)}
          onDelete={() => { onDeleteObject(selected.id); setEditingTextId(null); select(null); }}
          onDuplicate={() => {
            const copy: TelaVectorObject = {
              ...structuredClone(selected),
              id: newObjId(),
              x: selected.x + 24,
              y: selected.y + 24,
            };
            onAddObject(copy);
            select(copy.id);
          }}
        />
      )}

      {/* Freehand ink: a pressure-aware canvas over the artboard; each stroke is committed as a PATH object. */}
      {!readOnly && tool === 'ink' && (
        <InkLayer
          width={device.width} height={device.height} tool={inkTool} style={inkStyle} fingerDraws
          strokes={inkStrokes} hiddenIds={new Set()}
          onStroke={o => onAddObject(o)}
          onErase={ids => {
            const live = new Set(device.objects.map(o => o.id));
            for (const id of [...inkErased.current]) if (!live.has(id)) inkErased.current.delete(id);
            for (const id of ids) if (live.has(id) && !inkErased.current.has(id)) { inkErased.current.add(id); onDeleteObject(id); }
          }}
          onLasso={box => selectMany(box ? inkStrokes.filter(s => strokeInBox(s.points!, box)).map(s => s.id) : [])}
          onTap={() => {}}
        />
      )}

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
