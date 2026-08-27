// The FL-style channel rack — every pad as a row, all patterns' steps visible at once. The
// Glass view's document-editing heart: mute dot, name (click selects the pad everywhere,
// double-click renames), velocity-tinted step cells, cyan playhead column. Patterns longer
// than 16 steps page with the bar chips on the header row. Instrument tracks that are NOT
// pad-backed (imported .dawproject synth tracks) list below the rack so nothing you add is
// ever invisible here.

import React, { useCallback, useEffect, useState } from 'react';
import type { GrooveDoc, Pattern } from '../../../../services/melos/beats/grooveDoc';
import { PLAYHEAD, SELECT } from '../theme';
import { useContextMenu, type MenuNode } from '../../../ui/ContextMenu';

interface ChannelRackProps {
  doc: GrooveDoc;
  pattern: Pattern;
  selectedPad: number;
  beats: number;
  running: boolean;
  playMode: 'pattern' | 'song';
  onSelectPad: (i: number) => void;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  /** Open an instrument's window (pad instruments and track instruments alike). */
  onOpenInstrument?: (trackId: string) => void;
}

export const ChannelRack: React.FC<ChannelRackProps> = ({ doc, pattern, selectedPad, beats, running, playMode, onSelectPad, onMutate, onOpenInstrument }) => {
  const pages = Math.max(1, Math.ceil(pattern.length / 16));
  const [page, setPage] = useState(0);
  useEffect(() => { if (page >= pages) setPage(0); }, [pages, page]);
  const cols = Math.min(pattern.length, 16);
  const colBase = Math.min(page, pages - 1) * 16;
  const globalPlayStep = running && playMode === 'pattern'
    ? ((Math.floor(beats / 0.25) % pattern.length) + pattern.length) % pattern.length
    : -1;
  // Follow the playhead across pages while running.
  useEffect(() => {
    if (globalPlayStep < 0 || pages <= 1) return;
    const wantPage = Math.floor(globalPlayStep / 16);
    if (wantPage !== page) setPage(wantPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalPlayStep >= 0 ? Math.floor(globalPlayStep / 16) : -1]);
  const playStep = globalPlayStep >= colBase && globalPlayStep < colBase + cols ? globalPlayStep - colBase : -1;

  const [renamingPad, setRenamingPad] = useState<number | null>(null);
  const [renamingTrack, setRenamingTrack] = useState<string | null>(null);
  const [nameText, setNameText] = useState('');

  const toggle = useCallback((padIdx: number, stepIdx: number) => {
    onMutate((d) => {
      const pat = d.patterns.find((p) => p.id === pattern.id);
      if (!pat) return;
      const row = pat.steps[padIdx] || (pat.steps[padIdx] = {});
      if (row[stepIdx]) delete row[stepIdx];
      else row[stepIdx] = { v: 100 };
    });
  }, [onMutate, pattern.id]);

  // Right-click / long-press a pad row — the shared design-system menu.
  const rowMenu = useContextMenu<number>((padIdx) => {
    const pad = doc.kit[padIdx];
    if (!pad) return [];
    const items: MenuNode<number>[] = [
      { kind: 'header', label: pad.name },
    ];
    if (pad.instrumentTrackId && onOpenInstrument) {
      items.push({ id: 'open', label: 'Open instrument', onSelect: () => onOpenInstrument(pad.instrumentTrackId!) });
    }
    items.push(
      { id: 'select', label: 'Select pad', onSelect: () => onSelectPad(padIdx) },
      { id: 'rename', label: 'Rename…', onSelect: () => { setNameText(pad.name); setRenamingPad(padIdx); } },
      { id: 'mute', label: 'Mute', checked: !!pad.mute, keepOpen: true, onSelect: () => onMutate((d) => { const p = d.kit[padIdx]; if (p) p.mute = !p.mute; }) },
      { kind: 'separator' },
      { id: 'clear', label: 'Clear steps', danger: true, onSelect: () => onMutate((d) => { const pat = d.patterns.find((p) => p.id === pattern.id); if (pat) pat.steps[padIdx] = {}; }) },
    );
    return items;
  });

  const commitPadRename = (padIdx: number) => {
    setRenamingPad(null);
    const name = nameText.trim().slice(0, 18);
    if (!name) return;
    onMutate((d) => {
      const p = d.kit[padIdx];
      if (!p) return;
      p.name = name;
      // Keep the paired instrument track in step, so every view agrees on the name.
      if (p.instrumentTrackId) {
        const t = d.arrangement.find((x) => x.id === p.instrumentTrackId);
        if (t) t.name = name;
      }
    });
  };

  // Instrument tracks with no pad (foreign imports) — driven by Timeline clips, not steps.
  const trackRows = doc.arrangement.filter((t) => t.kind === 'instrument' && !t.padOwned);

  return (
    <div className="bg-white/[0.055] border border-white/10 rounded-[18px] backdrop-blur-xl p-4">
      {rowMenu.node}
      <div className="flex items-center gap-2 mb-2.5">
        <p className="text-[9px] uppercase tracking-[0.18em] text-white/30 font-semibold">Channel rack · {pattern.name}</p>
        {pages > 1 && (
          <div className="flex gap-1">
            {Array.from({ length: pages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className="h-[18px] px-1.5 rounded text-[9px] font-mono border transition-colors"
                style={i === Math.min(page, pages - 1)
                  ? { borderColor: `${PLAYHEAD}66`, color: PLAYHEAD, background: 'rgba(0,218,243,0.08)' }
                  : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.35)' }}
                title={`Steps ${i * 16 + 1}–${Math.min((i + 1) * 16, pattern.length)}`}
              >{i * 16 + 1}–{Math.min((i + 1) * 16, pattern.length)}</button>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-[3px] max-h-[46vh] overflow-y-auto pr-1">
        {doc.kit.map((pad, padIdx) => {
          if (pad.empty) return null; // greyed placeholder — nothing to sequence
          const row = pattern.steps[padIdx] || {};
          const selected = padIdx === selectedPad;
          return (
            <div key={pad.id} className="grid items-center gap-2" style={{ gridTemplateColumns: '18px 108px 1fr' }} {...rowMenu.bind(padIdx)}>
              <button
                onClick={() => onMutate((d) => { const p = d.kit[padIdx]; if (p) p.mute = !p.mute; })}
                aria-label={`${pad.mute ? 'Unmute' : 'Mute'} ${pad.name}`}
                title={pad.mute ? 'Unmute' : 'Mute'}
                className="w-[18px] h-[18px] rounded-full border transition-colors"
                style={pad.mute
                  ? { borderColor: 'rgba(255,255,255,0.2)', background: 'transparent' }
                  : { borderColor: '#06D6A0', background: 'rgba(6,214,160,0.2)' }}
              />
              {renamingPad === padIdx ? (
                <input
                  autoFocus
                  value={nameText}
                  onChange={(e) => setNameText(e.target.value)}
                  onBlur={() => commitPadRename(padIdx)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitPadRename(padIdx); if (e.key === 'Escape') setRenamingPad(null); }}
                  className="h-6 px-1.5 rounded-md bg-black/40 border border-white/25 text-[11px] text-white outline-none"
                  aria-label={`Rename ${pad.name}`}
                />
              ) : (
                <button
                  onClick={() => onSelectPad(padIdx)}
                  onDoubleClick={() => { setNameText(pad.name); setRenamingPad(padIdx); }}
                  title="Click to select · double-click to rename · right-click for menu"
                  className="text-left text-[11px] truncate h-6 px-1.5 rounded-md transition-colors"
                  style={selected ? { color: '#fff', background: `${SELECT}26`, fontWeight: 600 } : { color: pad.mute ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.6)' }}
                >{pad.name}</button>
              )}
              <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                {Array.from({ length: cols }, (_, c) => {
                  const stepIdx = colBase + c;
                  if (stepIdx >= pattern.length) return <span key={c} />;
                  const step = row[stepIdx];
                  const velFrac = step ? step.v / 127 : 0;
                  return (
                    <button
                      key={c}
                      onClick={() => toggle(padIdx, stepIdx)}
                      aria-label={`${pad.name} step ${stepIdx + 1}${step ? ' on' : ''}`}
                      className="h-[22px] rounded-[7px] border-0 transition-colors"
                      style={{
                        background: step
                          ? `rgba(212,0,85,${0.35 + velFrac * 0.6})`
                          : c % 8 < 4 ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.045)',
                        outline: playStep === c ? `1.5px solid ${PLAYHEAD}` : 'none',
                        outlineOffset: 1,
                        opacity: pad.mute ? 0.35 : 1,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Instrument tracks that aren't pad channels — visible here so nothing ever "disappears"
          from Glass; their notes live in Timeline clips, so the step area points there. */}
      {trackRows.length > 0 && (
        <div className="mt-2 pt-2 border-t border-white/[0.07] flex flex-col gap-[3px]">
          <p className="text-[9px] uppercase tracking-[0.18em] text-white/25 font-semibold mb-1">Instrument tracks</p>
          {trackRows.map((t) => (
            <div key={t.id} className="grid items-center gap-2" style={{ gridTemplateColumns: '18px 108px 1fr' }}>
              <button
                onClick={() => onMutate((d) => { const x = d.arrangement.find((y) => y.id === t.id); if (x) x.mute = !x.mute; })}
                aria-label={`${t.mute ? 'Unmute' : 'Mute'} ${t.name}`}
                className="w-[18px] h-[18px] rounded-full border transition-colors"
                style={t.mute
                  ? { borderColor: 'rgba(255,255,255,0.2)', background: 'transparent' }
                  : { borderColor: '#06D6A0', background: 'rgba(6,214,160,0.2)' }}
              />
              {renamingTrack === t.id ? (
                <input
                  autoFocus
                  value={nameText}
                  onChange={(e) => setNameText(e.target.value)}
                  onBlur={() => { setRenamingTrack(null); const n = nameText.trim(); if (n) onMutate((d) => { const x = d.arrangement.find((y) => y.id === t.id); if (x) x.name = n; }); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenamingTrack(null); }}
                  className="h-6 px-1.5 rounded-md bg-black/40 border border-white/25 text-[11px] text-white outline-none"
                  aria-label={`Rename ${t.name}`}
                />
              ) : (
                <button
                  onClick={() => !t.foreign && onOpenInstrument?.(t.id)}
                  onDoubleClick={() => { if (!t.foreign) { setNameText(t.name); setRenamingTrack(t.id); } }}
                  className="text-left text-[11px] truncate h-6 px-1.5 rounded-md flex items-center gap-1.5"
                  style={{ color: t.mute ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.6)' }}
                  title={t.foreign ? 'Preserved for re-export' : 'Click to open the instrument · double-click to rename'}
                >
                  <span className="w-[3px] h-3.5 rounded-[2px] flex-none" style={{ background: t.color }} />
                  {t.name}
                </button>
              )}
              <span className="text-[9.5px] text-white/25 truncate">
                {t.foreign ? 'preserved foreign track' : `${t.clips.reduce((n, c) => n + (c.notes?.length || 0), 0)} notes · sequenced in the Timeline arranger`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
