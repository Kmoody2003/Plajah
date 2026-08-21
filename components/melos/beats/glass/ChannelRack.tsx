// The FL-style channel rack — every pad as a row, all patterns' steps visible at once. The
// Glass view's document-editing heart: mute dot, name (click selects the pad everywhere),
// velocity-tinted step cells, cyan playhead column.

import React, { useCallback } from 'react';
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
}

export const ChannelRack: React.FC<ChannelRackProps> = ({ doc, pattern, selectedPad, beats, running, playMode, onSelectPad, onMutate }) => {
  const cols = Math.min(pattern.length, 16);
  const playStep = running && playMode === 'pattern'
    ? ((Math.floor(beats / 0.25) % pattern.length) + pattern.length) % pattern.length
    : -1;

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
    return [
      { kind: 'header', label: pad.name },
      { id: 'select', label: 'Select pad', onSelect: () => onSelectPad(padIdx) },
      { id: 'mute', label: 'Mute', checked: !!pad.mute, keepOpen: true, onSelect: () => onMutate((d) => { const p = d.kit[padIdx]; if (p) p.mute = !p.mute; }) },
      { kind: 'separator' },
      { id: 'clear', label: 'Clear steps', danger: true, onSelect: () => onMutate((d) => { const pat = d.patterns.find((p) => p.id === pattern.id); if (pat) pat.steps[padIdx] = {}; }) },
    ] as MenuNode<number>[];
  });

  return (
    <div className="bg-white/[0.055] border border-white/10 rounded-[18px] backdrop-blur-xl p-4">
      {rowMenu.node}
      <p className="text-[9px] uppercase tracking-[0.18em] text-white/30 font-semibold mb-2.5">Channel rack · {pattern.name}</p>
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
              <button
                onClick={() => onSelectPad(padIdx)}
                className="text-left text-[11px] truncate h-6 px-1.5 rounded-md transition-colors"
                style={selected ? { color: '#fff', background: `${SELECT}26`, fontWeight: 600 } : { color: pad.mute ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.6)' }}
              >{pad.name}</button>
              <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                {Array.from({ length: cols }, (_, c) => {
                  const step = row[c];
                  const velFrac = step ? step.v / 127 : 0;
                  return (
                    <button
                      key={c}
                      onClick={() => toggle(padIdx, c)}
                      aria-label={`${pad.name} step ${c + 1}${step ? ' on' : ''}`}
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
    </div>
  );
};
