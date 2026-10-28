// MEKA's Scenes + Song strip — Maschine's Ideas → Song, MPC's sequences → song, in MEKA's slab.
//
//   Scenes: each captures the pattern every Group is playing. Click = launch it (all Groups switch
//   at the next bar); "+" captures what's playing now. Right-click: rename, update, add to song,
//   delete.
//   Song: the scenes in order, each for N bars. These sections BUILD the Timeline — one track per
//   Group, one clip per section (songSections.syncSongFromSections) — so arranging here writes the
//   arrangement, and dragging sections on the Timeline's arranger lane edits the same list.

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus, X } from 'lucide-react';
import type { GrooveDoc, Scene } from '../../../../services/melos/beats/grooveDoc';
import {
  addScene, addSection, deleteScene, groupLetter, moveSection, patternGroup, removeSection, scenePatternIds,
  sectionSpans, slotsFromChoice, syncSongFromSections,
} from '../../../../services/melos/beats/songSections';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { useContextMenu } from '../../../ui/ContextMenu';

interface Props {
  doc: GrooveDoc;
  /** The per-Group pattern choice (what pattern mode plays). */
  choice: Record<number, string | undefined>;
  onLaunchScene: (scene: Scene) => void;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
}

export const ScenesBar: React.FC<Props> = ({ doc, choice, onLaunchScene, onMutate }) => {
  const scenes = doc.scenes ?? [];
  const spans = sectionSpans(doc);
  const [selScene, setSelScene] = useState<string | null>(null);
  const [selSection, setSelSection] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [nameText, setNameText] = useState('');
  const playing = new Set(BeatsEngine.get().playingPatternIds());

  const sceneMenu = useContextMenu<string>((id) => {
    const sc = scenes.find((s) => s.id === id);
    if (!sc) return [];
    const parts = Object.entries(sc.slots).filter(([, pid]) => pid).map(([g, pid]) => `${groupLetter(Number(g))}: ${doc.patterns.find((p) => p.id === pid)?.name ?? '—'}`);
    return [
      { kind: 'header', label: `${sc.name} · ${parts.join(' · ') || 'empty'}` },
      { id: 'add', label: 'Add to song', onSelect: () => onMutate((d) => { addSection(d, id); }) },
      { id: 'update', label: 'Update from what’s playing', onSelect: () => onMutate((d) => {
        const s = d.scenes?.find((x) => x.id === id);
        if (!s) return;
        s.slots = slotsFromChoice(d, choice);
        syncSongFromSections(d);
      }) },
      { id: 'rename', label: 'Rename', onSelect: () => { setNameText(sc.name); setRenaming(id); } },
      // Reorder the scene strip (song order lives in the sections, so this is layout only).
      ...(['left', 'right'] as const).map((dir) => {
        const i = scenes.findIndex((s) => s.id === id);
        const j = dir === 'left' ? i - 1 : i + 1;
        return { id: `move-${dir}`, label: dir === 'left' ? 'Move left' : 'Move right', disabled: j < 0 || j >= scenes.length,
          onSelect: () => onMutate((d) => { const list = d.scenes ?? []; const a = list.findIndex((s) => s.id === id); const b = dir === 'left' ? a - 1 : a + 1; if (a >= 0 && b >= 0 && b < list.length) [list[a], list[b]] = [list[b], list[a]]; }) };
      }),
      { kind: 'separator' },
      { id: 'del', label: 'Delete scene (and its song sections)', danger: true, onSelect: () => onMutate((d) => deleteScene(d, id)) },
    ];
  });

  const sectionIdx = selSection ? (doc.sections ?? []).findIndex((s) => s.id === selSection) : -1;
  const editSection = (fn: (d: GrooveDoc, i: number) => void) => onMutate((d) => {
    const i = (d.sections ?? []).findIndex((s) => s.id === selSection);
    if (i >= 0) fn(d, i);
  });

  return (
    <div className="w-full max-w-[520px] mx-auto mb-2.5 flex flex-col gap-1.5">
      {sceneMenu.node}
      {/* Scenes */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-[8px] uppercase tracking-[0.18em] text-white/25 font-semibold w-[42px] shrink-0">Scenes</span>
        <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0" style={{ scrollbarWidth: 'none' }}>
          {scenes.map((sc) => {
            const ids = scenePatternIds(doc, sc);
            const live = ids.length > 0 && ids.every((id) => playing.has(id));
            const picked = ids.length > 0 && ids.every((id) => {
              const p = doc.patterns.find((x) => x.id === id);
              return p && choice[patternGroup(p)] === id;
            });
            return renaming === sc.id ? (
              <input key={sc.id} autoFocus value={nameText} onChange={(e) => setNameText(e.target.value)}
                onBlur={() => { const n = nameText.trim(); if (n) onMutate((d) => { const s = d.scenes?.find((x) => x.id === sc.id); if (s) s.name = n.slice(0, 32); }); setRenaming(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null); }}
                className="h-6 w-24 px-1.5 rounded-md bg-black/40 border border-white/25 text-[10.5px] text-white outline-none" aria-label="Scene name" />
            ) : (
              <button
                key={sc.id}
                onClick={() => { setSelScene(sc.id); onLaunchScene(sc); }}
                onDoubleClick={() => { setNameText(sc.name); setRenaming(sc.id); }}
                onContextMenu={sceneMenu.bind(sc.id).onContextMenu}
                title={`${sc.name} — click to launch (switches at the bar) · double-click to rename · right-click for more`}
                className="h-6 px-2 rounded-md text-[10.5px] border shrink-0 whitespace-nowrap transition-colors"
                style={{
                  color: live || picked ? '#fff' : 'rgba(255,255,255,0.55)',
                  borderColor: selScene === sc.id || picked ? sc.color : 'rgba(255,255,255,0.12)',
                  background: live ? `${sc.color}38` : picked ? `${sc.color}1c` : 'transparent',
                  boxShadow: live ? `0 0 10px ${sc.color}55` : 'none',
                }}
              >{sc.name}</button>
            );
          })}
          <button
            onClick={() => { let made = ''; onMutate((d) => { made = addScene(d, choice).id; }); if (made) setSelScene(made); }}
            className="h-6 px-1.5 rounded-md border border-white/12 text-white/45 hover:text-white text-[10px] flex items-center gap-0.5 shrink-0"
            title="Capture what every Group is playing as a new scene"
          ><Plus size={10} /> Scene</button>
        </div>
      </div>

      {/* Song: scene sections in order — these build the Timeline's Group tracks. */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-[8px] uppercase tracking-[0.18em] text-white/25 font-semibold w-[42px] shrink-0">Song</span>
        <div className="flex items-center gap-[3px] overflow-x-auto flex-1 min-w-0" style={{ scrollbarWidth: 'none' }}>
          {spans.length === 0 && (
            <span className="text-[9.5px] text-white/25 whitespace-nowrap">{scenes.length ? 'Pick a scene, then “Add” — sections fill the Timeline' : 'Capture a scene first'}</span>
          )}
          {spans.map(({ section, startBar }) => {
            const sc = scenes.find((s) => s.id === section.sceneId);
            const sel = section.id === selSection;
            return (
              <button
                key={section.id}
                onClick={() => setSelSection(sel ? null : section.id)}
                title={`${sc?.name ?? '?'} · bar ${startBar + 1} · ${section.bars} bar${section.bars > 1 ? 's' : ''}`}
                className="h-6 rounded-md text-[9.5px] border shrink-0 whitespace-nowrap px-1.5 font-mono"
                style={{
                  minWidth: 22 + section.bars * 6,
                  color: '#fff',
                  borderColor: sel ? '#fff' : `${sc?.color ?? '#888'}aa`,
                  background: `${sc?.color ?? '#888'}${sel ? '55' : '2a'}`,
                }}
              >{sc?.name.slice(0, 10) ?? '?'}<span className="text-white/45 ml-1">×{section.bars}</span></button>
            );
          })}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {sectionIdx >= 0 ? (
            <>
              <button onClick={() => editSection((d, i) => moveSection(d, i, i - 1))} className="w-5 h-6 grid place-items-center text-white/45 hover:text-white" aria-label="Move section earlier"><ChevronLeft size={12} /></button>
              <button onClick={() => editSection((d, i) => moveSection(d, i, i + 1))} className="w-5 h-6 grid place-items-center text-white/45 hover:text-white" aria-label="Move section later"><ChevronRight size={12} /></button>
              <button onClick={() => editSection((d, i) => { const s = d.sections![i]; s.bars = Math.max(1, s.bars - 1); syncSongFromSections(d); })} className="w-5 h-6 grid place-items-center text-white/45 hover:text-white" aria-label="Fewer bars"><Minus size={11} /></button>
              <button onClick={() => editSection((d, i) => { const s = d.sections![i]; s.bars = Math.min(256, s.bars + 1); syncSongFromSections(d); })} className="w-5 h-6 grid place-items-center text-white/45 hover:text-white" aria-label="More bars"><Plus size={11} /></button>
              <button onClick={() => { const id = selSection!; onMutate((d) => removeSection(d, id)); setSelSection(null); }} className="w-5 h-6 grid place-items-center text-white/45 hover:text-[#EF4444]" aria-label="Remove section"><X size={11} /></button>
            </>
          ) : (
            <button
              disabled={!scenes.length}
              onClick={() => {
                const sid = selScene && scenes.some((s) => s.id === selScene) ? selScene : scenes[scenes.length - 1]?.id;
                if (sid) onMutate((d) => { addSection(d, sid); });
              }}
              className="h-6 px-1.5 rounded-md border border-white/12 text-white/45 hover:text-white text-[10px] flex items-center gap-0.5 disabled:opacity-30"
              title="Add the selected scene to the end of the song"
            ><Plus size={10} /> Add</button>
          )}
        </div>
      </div>
    </div>
  );
};
