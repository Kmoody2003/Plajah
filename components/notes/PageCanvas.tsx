import React, { useMemo, useRef } from 'react';
import { GripHorizontal, X } from 'lucide-react';
import type { TelaDoc, TelaFrame, TelaVectorObject } from '../../types';
import { applyTelaOp, type TelaOp } from '../tela/telaOps';
import { renderDevice, buildRenderMaps } from '../tela/renderDevice';
import { makeBlock } from '../tela/TelaWriter';
import { InkLayer, InkStrokes, type NoteTool } from '../ink';
import { PAGE_W, PAGE_H, inkDeviceOf, inkFrameOf, templateBackground, type PageTemplate } from '../../services/notesStructure';
import { strokeInBox, type InkStyle, type Box } from '../../services/inkMath';

/**
 * One notebook page: a paper surface (with a template), free-floating Tela containers (typed text,
 * images, tables, audio, charts) you can drag and resize like OneNote, and an ink layer on top.
 * Everything is a Tela document, so a page can be embedded or shared like any Tela document.
 */
interface Props {
  doc: TelaDoc; template: PageTemplate; tool: NoteTool; style: InkStyle; fingerDraws: boolean; zoom: number; readOnly?: boolean;
  selection: Set<string>; onSelection: (ids: Set<string>) => void; onLassoBox: (b: Box | null) => void;
  /** history=false for in-progress drags, so undo steps stay meaningful. */
  onDoc: (next: TelaDoc, history?: boolean) => void; onCommit: () => void; onToolDone: () => void;
}

const strip = (b: { text: string }) => b.text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const newId = (p: string) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

const PageCanvas: React.FC<Props> = ({ doc, template, tool, style, fingerDraws, zoom, readOnly, selection, onSelection, onLassoBox, onDoc, onCommit, onToolDone }) => {
  const ink = inkDeviceOf(doc); const inkFrame = inkFrameOf(doc);
  const strokes = useMemo(() => (ink ? ink.objects.filter(o => o.kind === 'PATH' && o.points) : []), [ink]);
  const maps = useMemo(() => buildRenderMaps(doc.devices, doc.frames, strip), [doc.devices, doc.frames]);
  const dispatchOp = (op: TelaOp) => onDoc(applyTelaOp(doc, op), true);
  const ctx = { devices: doc.devices, dispatchOp, writerTexts: maps.writerTexts, writers: maps.writers, bases: maps.bases, formulaContext: maps.formulaContext, uid: newId };
  const bg = templateBackground(template);
  const frames = doc.frames.filter(f => f.id !== inkFrame?.id);

  const addStroke = (o: TelaVectorObject) => { if (ink) onDoc(applyTelaOp(doc, { type: 'ADD_VECTOR_OBJECT', deviceId: ink.id, object: o }), true); };
  const erase = (ids: string[]) => { if (ink) onDoc(applyTelaOp(doc, { type: 'REPLACE_VECTOR_OBJECTS', deviceId: ink.id, objects: ink.objects.filter(o => !ids.includes(o.id)) }), true); };
  const lasso = (box: Box | null) => { onLassoBox(box); onSelection(new Set(box ? strokes.filter(s => strokeInBox(s.points!, box)).map(s => s.id) : [])); };
  const tap = (x: number, y: number) => {
    const wid = newId('writer'); const frame: TelaFrame = { id: newId('frame'), kind: 'BOARD', preset: 'FREE', x: Math.max(0, Math.min(PAGE_W - 240, x)), y: Math.max(0, y - 12), w: 300, h: 90, deviceIds: [wid], label: 'Text' };
    onDoc(applyTelaOp(doc, { type: 'ADD_FRAME', frame, devices: [{ id: wid, type: 'WRITER', blocks: [makeBlock('p', '')], mode: 'NOTES' }] }), true); onToolDone();
  };

  // Drag / resize a container
  const gesture = useRef<null | { kind: 'move' | 'size'; id: string; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number }>(null);
  const startGesture = (e: React.PointerEvent, f: TelaFrame, kind: 'move' | 'size') => {
    e.preventDefault(); e.stopPropagation(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    gesture.current = { kind, id: f.id, sx: e.clientX, sy: e.clientY, ox: f.x, oy: f.y, ow: f.w, oh: f.h };
  };
  const moveGesture = (e: React.PointerEvent) => {
    const g = gesture.current; if (!g) return; const dx = (e.clientX - g.sx) / zoom, dy = (e.clientY - g.sy) / zoom;
    onDoc(applyTelaOp(doc, g.kind === 'move' ? { type: 'MOVE_FRAME', frameId: g.id, x: Math.max(0, g.ox + dx), y: Math.max(0, g.oy + dy) } : { type: 'RESIZE_FRAME', frameId: g.id, w: g.ow + dx, h: g.oh + dy }), false);
  };
  const endGesture = () => { if (gesture.current) { gesture.current = null; onCommit(); } };

  const interactive = tool === 'select' || tool === 'text' ? true : false;

  return (
    <div style={{ width: PAGE_W * zoom, height: PAGE_H * zoom }} className="relative mx-auto shadow-2xl rounded-sm notes-print" data-page>
      <div style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${zoom})`, transformOrigin: '0 0', background: '#fdfcf8', color: '#16131f', position: 'relative', overflow: 'hidden', ...bg }}>
        {frames.map(f => {
          const d = f.deviceIds.map(id => doc.devices[id]).find(Boolean);
          if (!d) return null;
          return (
            <div key={f.id} className="absolute group" style={{ left: f.x, top: f.y, width: f.w, minHeight: f.h }}>
              {!readOnly && interactive && (
                <div className="absolute -top-5 left-0 right-0 h-5 flex items-center justify-between opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity" style={{ touchAction: 'none' }}>
                  <div onPointerDown={e => startGesture(e, f, 'move')} onPointerMove={moveGesture} onPointerUp={endGesture} className="flex-1 h-5 cursor-grab grid place-items-center bg-[#6B0099]/80 rounded-t text-white" aria-label="Move this box" role="button"><GripHorizontal size={12} /></div>
                  <button type="button" aria-label="Delete this box" onClick={() => onDoc(applyTelaOp(doc, { type: 'DELETE_FRAME', frameId: f.id }), true)} className="h-5 w-5 grid place-items-center bg-[#D40055]/90 text-white rounded-t ml-0.5"><X size={11} /></button>
                </div>
              )}
              <div className={`${interactive ? 'outline outline-1 outline-transparent group-hover:outline-[#6B0099]/40' : ''} bg-transparent`} style={{ pointerEvents: interactive ? 'auto' : 'none', color: '#16131f' }}>{renderDevice(d, ctx, !!readOnly)}</div>
              {!readOnly && interactive && <div onPointerDown={e => startGesture(e, f, 'size')} onPointerMove={moveGesture} onPointerUp={endGesture} aria-label="Resize this box" role="button" className="absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#6B0099] cursor-nwse-resize opacity-0 group-hover:opacity-100" style={{ touchAction: 'none' }} />}
            </div>
          );
        })}

        {/* Committed ink (display only) */}
        <InkStrokes width={PAGE_W} height={PAGE_H} strokes={strokes} selection={selection} />

        {!readOnly && <InkLayer width={PAGE_W} height={PAGE_H} tool={tool} style={style} fingerDraws={fingerDraws} strokes={strokes} hiddenIds={new Set()} onStroke={addStroke} onErase={erase} onLasso={lasso} onTap={tap} />}
      </div>
    </div>
  );
};

export default PageCanvas;
