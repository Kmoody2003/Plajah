// The Sequence strip — the compact render of GrooveDoc.arrangement (the same data the Timeline
// view edits in full). Pattern clips paint/erase per bar on click; the cyan playhead sweeps in
// song mode. Named "Sequence", never "Arrange" — that word belongs to the Melos running-order room.

import React, { useCallback } from 'react';
import type { GrooveDoc, Pattern } from '../../../../services/melos/beats/grooveDoc';
import { grooveUid } from '../../../../services/melos/beats/grooveDoc';
import { PLAYHEAD } from '../theme';

const BARS_SHOWN = 16;
const BEATS_PER_BAR = 4;

interface SequenceStripProps {
  doc: GrooveDoc;
  activePattern: Pattern;
  beats: number;
  running: boolean;
  playMode: 'pattern' | 'song';
  onMutate: (fn: (d: GrooveDoc) => void) => void;
}

export const SequenceStrip: React.FC<SequenceStripProps> = ({ doc, activePattern, beats, running, playMode, onMutate }) => {
  const playBar = running && playMode === 'song' ? beats / BEATS_PER_BAR : -1;

  const paintOrErase = useCallback((trackId: string, bar: number) => {
    onMutate((d) => {
      const track = d.arrangement.find((t) => t.id === trackId);
      if (!track || track.kind !== 'pattern') return;
      const startBeats = bar * BEATS_PER_BAR;
      const hit = track.clips.find((c) => startBeats >= c.startBeats && startBeats < c.startBeats + c.lengthBeats);
      if (hit) track.clips = track.clips.filter((c) => c !== hit);
      else {
        const pat = d.patterns.find((p) => p.id === activePattern.id);
        const lengthBeats = Math.max(BEATS_PER_BAR, ((pat?.length || 16) / 16) * BEATS_PER_BAR);
        track.clips.push({ id: grooveUid(), startBeats, lengthBeats, patternId: activePattern.id });
      }
    });
  }, [onMutate, activePattern.id]);

  return (
    <div className="bg-white/[0.055] border border-white/10 rounded-[18px] backdrop-blur-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <p className="text-[9px] uppercase tracking-[0.18em] text-white/30 font-semibold">Sequence</p>
        <p className="text-[9px] text-white/20">click a bar to paint “{activePattern.name}” · Song mode plays this · full editing in Timeline</p>
      </div>
      <div className="grid mb-1" style={{ gridTemplateColumns: `repeat(${BARS_SHOWN}, minmax(0,1fr))` }}>
        {Array.from({ length: BARS_SHOWN }, (_, b) => (
          <span key={b} className="text-[8px] font-mono text-white/25">{b * BEATS_PER_BAR % (BEATS_PER_BAR * 4) === 0 ? b + 1 : ''}</span>
        ))}
      </div>
      <div className="relative flex flex-col gap-1.5">
        {playBar >= 0 && playBar < BARS_SHOWN && (
          <div className="absolute top-[-2px] bottom-[-2px] w-[2px] z-10 pointer-events-none" style={{ left: `${(playBar / BARS_SHOWN) * 100}%`, background: PLAYHEAD, boxShadow: `0 0 10px ${PLAYHEAD}99` }} />
        )}
        {doc.arrangement.filter((track) => !track.padOwned).map((track) => (
          <div key={track.id} className="relative h-[30px]">
            <div className="absolute inset-0 grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${BARS_SHOWN}, minmax(0,1fr))` }}>
              {Array.from({ length: BARS_SHOWN }, (_, b) => (
                <button
                  key={b}
                  onClick={() => paintOrErase(track.id, b)}
                  aria-label={`${track.name} bar ${b + 1}`}
                  className="rounded-[6px] border border-dashed border-white/[0.07] hover:border-white/20"
                  disabled={track.kind !== 'pattern'}
                />
              ))}
            </div>
            {track.clips.map((clip) => {
              const pat = doc.patterns.find((p) => p.id === clip.patternId);
              const left = (clip.startBeats / BEATS_PER_BAR / BARS_SHOWN) * 100;
              const width = (clip.lengthBeats / BEATS_PER_BAR / BARS_SHOWN) * 100;
              if (left >= 100) return null;
              return (
                <button
                  key={clip.id}
                  onClick={() => onMutate((d) => { const t = d.arrangement.find((x) => x.id === track.id); if (t) t.clips = t.clips.filter((c) => c.id !== clip.id); })}
                  title={`${pat?.name || clip.audio?.name || 'Clip'} — click to remove`}
                  className="absolute top-0 bottom-0 rounded-[7px] flex items-center px-2 text-[10px] font-semibold text-white truncate"
                  style={{
                    left: `${left}%`, width: `calc(${Math.min(width, 100 - left)}% - 2px)`,
                    background: clip.audio
                      ? 'rgba(0,218,243,0.18)'
                      : 'linear-gradient(135deg, #6B0099, #D40055)',
                    border: clip.audio ? '1px solid rgba(0,218,243,0.4)' : 'none',
                    color: clip.audio ? PLAYHEAD : '#fff',
                  }}
                >{pat?.name || clip.audio?.name || 'Audio'}</button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
