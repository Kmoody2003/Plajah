// The clip launcher — the Bitwig session column, docked left of the arranger. Each pattern is
// a launchable slot: click launches it quantized to the next bar (the engine's launch quantum),
// exactly the arranger's grammar of pattern clips, live. The playing slot pulses; a queued slot
// blinks until the bar line takes it. "→" captures the playing pattern into the arrangement at
// the end of the first pattern track, so a jam becomes a song without re-drawing anything.

import React, { useCallback, useEffect, useState } from 'react';
import { Play, Square, ArrowRight, Plus } from 'lucide-react';
import type { GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { grooveUid, defaultPattern } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { PLAYHEAD, SELECT } from '../theme';

interface Props {
  doc: GrooveDoc;
  activePatternId: string;
  playMode: 'pattern' | 'song';
  running: boolean;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
}

export const ClipLauncher: React.FC<Props> = ({ doc, activePatternId, playMode, running, onMutate }) => {
  // Poll the engine for what's playing / queued — launcher state is engine truth, not doc state.
  const [live, setLive] = useState<{ playing: string | null; queued: string | null }>({ playing: null, queued: null });
  useEffect(() => {
    const t = setInterval(() => {
      const e = BeatsEngine.get();
      setLive({ playing: e.isRunning() ? e.playingPatternId() : null, queued: e.queuedPatternId() });
    }, 180);
    return () => clearInterval(t);
  }, []);

  const launch = useCallback((patternId: string) => {
    BeatsEngine.get().queuePattern(patternId);
  }, []);

  const stopAll = useCallback(() => { BeatsEngine.get().stop(); }, []);

  /** Write a pattern to the arrangement: appended after the last clip on the first pattern track. */
  const capture = useCallback((patternId: string) => {
    onMutate((d) => {
      let track = d.arrangement.find((t) => t.kind === 'pattern' && !t.foreign);
      if (!track) {
        track = {
          id: grooveUid(), kind: 'pattern', name: 'Grooves', color: '#B84DFF',
          mute: false, solo: false, gainDb: 0, pan: 0, clips: [],
        };
        d.arrangement.push(track);
      }
      const pat = d.patterns.find((x) => x.id === patternId);
      const lengthBeats = Math.max(4, ((pat?.length || 16) / 16) * 4);
      const end = track.clips.reduce((m, c) => Math.max(m, c.startBeats + c.lengthBeats), 0);
      track.clips.push({ id: grooveUid(), startBeats: Math.ceil(end / 4) * 4, lengthBeats, patternId });
    });
  }, [onMutate]);

  const addPattern = useCallback(() => {
    onMutate((d) => {
      const p = defaultPattern(`Pattern ${String.fromCharCode(65 + (d.patterns.length % 26))}`);
      p.id = grooveUid() + grooveUid();
      d.patterns.push(p);
    });
  }, [onMutate]);

  return (
    <div className="w-[168px] flex-none border-r border-white/10 flex flex-col bg-[#0B0712]">
      <div className="flex items-center gap-1.5 px-2.5 h-[26px] flex-none border-b border-white/10">
        <span className="text-[9px] uppercase tracking-[0.16em] text-white/40 font-semibold flex-1">Launcher</span>
        <button
          onClick={stopAll}
          disabled={!running}
          className="w-[18px] h-[18px] grid place-items-center rounded border border-white/12 text-white/45 hover:text-white disabled:opacity-30"
          title="Stop"
          aria-label="Stop all clips"
        ><Square size={8} fill="currentColor" /></button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-1.5 flex flex-col gap-1">
        {doc.patterns.map((pat) => {
          const playing = live.playing === pat.id && playMode === 'pattern';
          const queued = live.queued === pat.id;
          const isActive = pat.id === activePatternId;
          return (
            <div
              key={pat.id}
              className="flex items-stretch gap-1 rounded-[9px] border overflow-hidden"
              style={{
                borderColor: playing ? `${PLAYHEAD}88` : queued ? `${SELECT}88` : isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)',
                background: playing ? 'rgba(0,218,243,0.10)' : queued ? 'rgba(212,0,85,0.10)' : 'rgba(255,255,255,0.03)',
              }}
            >
              <button
                onClick={() => launch(pat.id)}
                className={`w-7 grid place-items-center flex-none ${queued ? 'animate-pulse' : ''}`}
                style={{ color: playing ? PLAYHEAD : queued ? SELECT : 'rgba(255,255,255,0.5)' }}
                title={playing ? 'Playing' : queued ? 'Queued — launches on the next bar' : 'Launch on the next bar'}
                aria-label={`Launch ${pat.name}`}
              >
                <Play size={11} fill={playing ? 'currentColor' : 'none'} />
              </button>
              <span className="flex-1 min-w-0 py-1.5 text-[10.5px] text-white/75 truncate self-center">{pat.name}</span>
              <button
                onClick={() => capture(pat.id)}
                className="w-6 grid place-items-center flex-none text-white/30 hover:text-white"
                title="Add to the arrangement (after the last clip)"
                aria-label={`Add ${pat.name} to the arrangement`}
              ><ArrowRight size={10} /></button>
            </div>
          );
        })}
        <button
          onClick={addPattern}
          className="h-7 rounded-[9px] border border-dashed border-white/15 text-white/35 hover:text-white text-[10px] flex items-center justify-center gap-1"
        ><Plus size={10} /> pattern</button>
      </div>
      <p className="px-2.5 py-1.5 text-[8.5px] leading-snug text-white/25 border-t border-white/[0.07] flex-none">
        Launches quantize to the bar · → writes into the arrangement
      </p>
    </div>
  );
};
