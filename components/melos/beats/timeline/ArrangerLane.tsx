// The Timeline's arranger lane (Studio One's Arranger track) over MEKA's song sections. Each block
// is a scene for N bars; drag a block to reorder the song (every Group track follows, because the
// sections write them — songSections.syncSongFromSections), right-click to change its scene or
// length, duplicate or remove it. Same list as MEKA's Song strip; two views of one song.

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import type { GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { addSection, moveSection, removeSection, sectionIndexAt, sectionSpans, syncSongFromSections } from '../../../../services/melos/beats/songSections';
import { useContextMenu } from '../../../ui/ContextMenu';

export const ARRANGER_H = 24;

export const ArrangerLane: React.FC<{
  doc: GrooveDoc;
  pxPerBeat: number;
  headerW: number;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onPlayFrom: (beat: number) => void;
}> = ({ doc, pxPerBeat, headerW, onMutate, onPlayFrom }) => {
  const spans = sectionSpans(doc);
  const scenes = doc.scenes ?? [];
  const [drag, setDrag] = useState<{ id: string; dx: number } | null>(null);
  const end = spans.length ? spans[spans.length - 1].startBeats + spans[spans.length - 1].lengthBeats : 0;

  const menu = useContextMenu<string>((id) => {
    const idx = (doc.sections ?? []).findIndex((s) => s.id === id);
    const sec = doc.sections?.[idx];
    if (!sec) return [];
    const edit = (fn: (d: GrooveDoc) => void) => onMutate((d) => { fn(d); syncSongFromSections(d); });
    return [
      { kind: 'header', label: `${scenes.find((s) => s.id === sec.sceneId)?.name ?? 'Section'} · ${sec.bars} bar${sec.bars > 1 ? 's' : ''}` },
      { id: 'scene', label: 'Scene', submenu: scenes.map((sc) => ({
        id: sc.id, label: sc.name, checked: sc.id === sec.sceneId,
        onSelect: () => edit((d) => { const s = d.sections?.find((x) => x.id === id); if (s) s.sceneId = sc.id; }),
      })) },
      { id: 'bars', label: 'Length', submenu: [1, 2, 4, 8, 16, 32].map((n) => ({
        id: `b${n}`, label: `${n} bar${n > 1 ? 's' : ''}`, checked: sec.bars === n,
        onSelect: () => edit((d) => { const s = d.sections?.find((x) => x.id === id); if (s) s.bars = n; }),
      })) },
      { id: 'dup', label: 'Duplicate', onSelect: () => onMutate((d) => { addSection(d, sec.sceneId, sec.bars, idx + 1); }) },
      { id: 'play', label: 'Play from here', onSelect: () => onPlayFrom(spans[idx]?.startBeats ?? 0) },
      { kind: 'separator' },
      { id: 'del', label: 'Remove section', danger: true, onSelect: () => onMutate((d) => removeSection(d, id)) },
    ];
  });

  const startDrag = (id: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX;
    const from = (doc.sections ?? []).findIndex((s) => s.id === id);
    const span = spans[from];
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      if (Math.abs(dx) > 3) moved = true;
      setDrag({ id, dx });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      setDrag(null);
      if (!moved || !span) return;
      // Drop on the section under the dragged block's centre.
      const centre = span.startBeats + span.lengthBeats / 2 + (ev.clientX - x0) / pxPerBeat;
      let to = sectionIndexAt(doc, centre);
      if (to > from) to -= 1;
      if (to !== from) onMutate((d) => moveSection(d, from, to));
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  return (
    <div className="flex border-b border-white/[0.06]" style={{ height: ARRANGER_H }}>
      {menu.node}
      <div className="sticky left-0 z-10 flex items-center gap-1.5 px-3 bg-[#0E0916] border-r border-white/10" style={{ width: headerW, minWidth: headerW }}>
        <span className="text-[10px] font-semibold text-white/70">Song</span>
        <span className="text-[9px] text-white/30 truncate">{spans.length} section{spans.length === 1 ? '' : 's'} · from MEKA</span>
      </div>
      <div className="relative flex-1">
        {spans.map(({ section, startBeats, lengthBeats }) => {
          const sc = scenes.find((s) => s.id === section.sceneId);
          const color = sc?.color ?? '#888';
          const dragging = drag?.id === section.id;
          return (
            <div
              key={section.id}
              onPointerDown={(e) => startDrag(section.id, e)}
              onContextMenu={menu.bind(section.id).onContextMenu}
              onDoubleClick={() => onPlayFrom(startBeats)}
              className="absolute top-[3px] bottom-[3px] rounded-md px-1.5 flex items-center text-[9.5px] font-semibold truncate cursor-grab select-none"
              style={{
                left: startBeats * pxPerBeat + (dragging ? drag!.dx : 0),
                width: Math.max(8, lengthBeats * pxPerBeat - 2),
                background: `${color}${dragging ? '66' : '33'}`,
                border: `1px solid ${color}aa`,
                color: '#fff',
                zIndex: dragging ? 5 : 1,
              }}
              title={`${sc?.name ?? 'Section'} · ${section.bars} bar${section.bars > 1 ? 's' : ''} — drag to reorder the song · double-click to play from here · right-click for more`}
            >{sc?.name ?? '?'}</div>
          );
        })}
        {scenes.length > 0 && (
          <button
            onClick={() => onMutate((d) => { const last = d.sections?.[d.sections.length - 1]; addSection(d, last?.sceneId ?? scenes[scenes.length - 1].id); })}
            className="absolute top-[3px] h-[18px] w-[18px] grid place-items-center rounded-md border border-white/15 text-white/45 hover:text-white"
            style={{ left: end * pxPerBeat + 4 }}
            title="Add a section (repeats the last scene)"
            aria-label="Add section"
          ><Plus size={10} /></button>
        )}
      </div>
    </div>
  );
};
