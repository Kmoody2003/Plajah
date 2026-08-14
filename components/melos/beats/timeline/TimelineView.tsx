// The Timeline — Bitwig Arranger / Studio One arrangement paradigm (approved mockup 05):
// track headers left, clip lanes over a bar ruler right, cyan playhead, H-zoom, snap, and the
// docked mixer underneath. Edits the SAME GrooveDoc.arrangement the Glass Sequence strip
// renders compactly; imported .dawproject tracks land here, preserved plugin tracks dimmed.
// Grammar: double-click empty lane = paint the active pattern · drag = move (bar snap) ·
// right-edge grip = trim (beat snap) · click = select · Delete = remove · drop audio = clip.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Music2, AudioWaveform } from 'lucide-react';
import type { GrooveDoc, Pattern, TimelineClip } from '../../../../services/melos/beats/grooveDoc';
import { grooveUid } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { ingestSample, backupToLocker } from '../../../../services/melos/beats/sampleStore';
import { MixerPanel } from '../shared/MixerPanel';
import { PLAYHEAD, SELECT, glassPanel } from '../theme';

const BEATS_PER_BAR = 4;
const HEADER_W = 172;
const LANE_H = 44;

interface TimelineViewProps {
  doc: GrooveDoc;
  activePattern: Pattern;
  beats: number;
  running: boolean;
  playMode: 'pattern' | 'song';
  meters: { groups: number[]; master: number };
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onPlayFrom: (fromBeats: number) => void;
}

export const TimelineView: React.FC<TimelineViewProps> = (p) => {
  const [pxPerBeat, setPxPerBeat] = useState(14);
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [showMixer, setShowMixer] = useState(true);
  const drag = useRef<{ clipId: string; trackId: string; mode: 'move' | 'trim'; startX: number; orig: TimelineClip } | null>(null);

  const contentBeats = Math.max(
    32 * BEATS_PER_BAR,
    ...p.doc.arrangement.flatMap((t) => t.clips.map((c) => c.startBeats + c.lengthBeats + 8 * BEATS_PER_BAR)),
  );
  const totalBars = Math.ceil(contentBeats / BEATS_PER_BAR);
  const contentW = contentBeats * pxPerBeat;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!selectedClip) return;
      p.onMutate((d) => {
        for (const t of d.arrangement) t.clips = t.clips.filter((c) => c.id !== selectedClip);
      });
      setSelectedClip(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedClip, p.onMutate]); // eslint-disable-line react-hooks/exhaustive-deps

  const paintClip = useCallback((trackId: string, atBeats: number) => {
    p.onMutate((d) => {
      const track = d.arrangement.find((t) => t.id === trackId);
      if (!track || track.kind !== 'pattern' || track.foreign) return;
      const startBeats = Math.floor(atBeats / BEATS_PER_BAR) * BEATS_PER_BAR;
      if (track.clips.some((c) => startBeats < c.startBeats + c.lengthBeats && startBeats + 1 > c.startBeats)) return;
      const lengthBeats = Math.max(BEATS_PER_BAR, (p.activePattern.length / 16) * BEATS_PER_BAR);
      track.clips.push({ id: grooveUid(), startBeats, lengthBeats, patternId: p.activePattern.id });
    });
  }, [p.onMutate, p.activePattern]); // eslint-disable-line react-hooks/exhaustive-deps

  const dropAudio = useCallback(async (trackId: string, atBeats: number, file: File) => {
    const engine = BeatsEngine.get();
    await engine.init();
    const ctx = engine.getContext();
    if (!ctx) return;
    const name = file.name.replace(/\.[^.]+$/, '');
    const result = await ingestSample(file, name, ctx);
    if (!result) return;
    engine.setSampleBuffer(result.ref.key, result.buffer);
    const spb = 60 / p.doc.bpm;
    p.onMutate((d) => {
      const track = d.arrangement.find((t) => t.id === trackId);
      if (!track || track.kind !== 'audio' || track.foreign) return;
      track.clips.push({
        id: grooveUid(),
        startBeats: Math.floor(atBeats / BEATS_PER_BAR) * BEATS_PER_BAR,
        lengthBeats: Math.max(1, Math.round((result.buffer.duration / spb) * 4) / 4),
        audio: { sampleKey: result.ref.key, name, offsetSec: 0, gainDb: 0, durationSec: result.buffer.duration },
      });
    });
    void backupToLocker(result.ref);
  }, [p.onMutate, p.doc.bpm]); // eslint-disable-line react-hooks/exhaustive-deps

  const addTrack = useCallback((kind: 'pattern' | 'audio') => {
    p.onMutate((d) => {
      d.arrangement.push({
        id: grooveUid(), kind,
        name: kind === 'pattern' ? `Grooves ${d.arrangement.filter((t) => t.kind === 'pattern').length + 1}` : `Audio ${d.arrangement.filter((t) => t.kind === 'audio').length + 1}`,
        color: kind === 'pattern' ? '#B84DFF' : PLAYHEAD,
        mute: false, solo: false, gainDb: 0, pan: 0, clips: [],
      });
    });
  }, [p.onMutate]); // eslint-disable-line react-hooks/exhaustive-deps

  const playheadX = p.running && p.playMode === 'song' ? p.beats * pxPerBeat : -1;

  return (
    <div className="flex-1 min-h-0 flex flex-col p-4 pt-3 gap-0">
      <div className={`${glassPanel} flex-1 min-h-0 overflow-hidden flex flex-col`}>
        <div className="flex-1 min-h-0 overflow-auto">
          <div style={{ width: HEADER_W + contentW, minWidth: '100%' }}>
            {/* ruler */}
            <div className="sticky top-0 z-20 flex bg-[#100A18]/95 backdrop-blur border-b border-white/10" style={{ height: 26 }}>
              <div className="sticky left-0 z-10 flex items-center px-3 text-[9px] uppercase tracking-[0.18em] text-white/30 font-semibold bg-[#100A18]" style={{ width: HEADER_W, minWidth: HEADER_W }}>Tracks</div>
              <div
                className="relative flex-1 cursor-pointer"
                title="Click to play the song from this bar"
                onClick={(e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const beat = Math.floor(((e.clientX - rect.left) / pxPerBeat) / BEATS_PER_BAR) * BEATS_PER_BAR;
                  p.onPlayFrom(Math.max(0, beat));
                }}
              >
                {Array.from({ length: totalBars }, (_, b) => (
                  <span key={b} className="absolute top-1.5 text-[9px] font-mono text-white/30 select-none" style={{ left: b * BEATS_PER_BAR * pxPerBeat + 4 }}>
                    {b % 4 === 0 ? b + 1 : ''}
                  </span>
                ))}
              </div>
            </div>

            {/* lanes */}
            <div className="relative">
              {playheadX >= 0 && (
                <div className="absolute top-0 bottom-0 w-[2px] z-20 pointer-events-none" style={{ left: HEADER_W + playheadX, background: PLAYHEAD, boxShadow: `0 0 12px ${PLAYHEAD}88` }} />
              )}
              {p.doc.arrangement.map((track) => (
                <div key={track.id} className="flex border-b border-white/[0.06]" style={{ height: LANE_H, opacity: track.foreign ? 0.65 : 1 }}>
                  <div className="sticky left-0 z-10 flex items-center gap-2 px-3 bg-[#0E0916] border-r border-white/10" style={{ width: HEADER_W, minWidth: HEADER_W }}>
                    <span className="w-[4px] h-6 rounded-[2px] flex-none" style={{ background: track.color }} />
                    <input
                      value={track.name}
                      onChange={(e) => p.onMutate((d) => { const t = d.arrangement.find((x) => x.id === track.id); if (t) t.name = e.target.value; })}
                      className="flex-1 min-w-0 bg-transparent text-[11px] text-white/80 outline-none border border-transparent focus:border-white/20 rounded px-1"
                      aria-label={`Track name: ${track.name}`}
                      disabled={!!track.foreign}
                    />
                    {track.foreign ? (
                      <span className="text-[8px] text-[#D0BCFF] border border-[#D0BCFF]/35 rounded px-1 flex-none">preserved</span>
                    ) : (
                      <>
                        <button onClick={() => p.onMutate((d) => { const t = d.arrangement.find((x) => x.id === track.id); if (t) t.mute = !t.mute; })}
                          className="w-[17px] h-[17px] rounded-[5px] border text-[8px] grid place-items-center flex-none"
                          style={track.mute ? { background: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.3)', color: '#fff' } : { borderColor: 'rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.35)' }}
                          aria-label={`Mute ${track.name}`}>M</button>
                        <button onClick={() => p.onMutate((d) => { const t = d.arrangement.find((x) => x.id === track.id); if (t) t.solo = !t.solo; })}
                          className="w-[17px] h-[17px] rounded-[5px] border text-[8px] grid place-items-center flex-none"
                          style={track.solo ? { background: 'rgba(0,218,243,0.2)', borderColor: PLAYHEAD, color: PLAYHEAD } : { borderColor: 'rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.35)' }}
                          aria-label={`Solo ${track.name}`}>S</button>
                      </>
                    )}
                  </div>

                  <div
                    className="relative flex-1"
                    onDoubleClick={(e) => {
                      if (track.kind !== 'pattern') return;
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      paintClip(track.id, (e.clientX - rect.left) / pxPerBeat);
                    }}
                    onDragOver={(e) => { if (track.kind === 'audio' && !track.foreign) e.preventDefault(); }}
                    onDrop={(e) => {
                      if (track.kind !== 'audio' || track.foreign) return;
                      e.preventDefault();
                      const f = e.dataTransfer.files?.[0];
                      if (!f) return;
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      void dropAudio(track.id, (e.clientX - rect.left) / pxPerBeat, f);
                    }}
                    style={{ background: `repeating-linear-gradient(90deg, rgba(255,255,255,0.045) 0 1px, transparent 1px ${BEATS_PER_BAR * pxPerBeat}px)` }}
                  >
                    {track.clips.map((clip) => {
                      const pat = p.doc.patterns.find((x) => x.id === clip.patternId);
                      const selected = clip.id === selectedClip;
                      return (
                        <div
                          key={clip.id}
                          onPointerDown={(e) => {
                            if (track.foreign) return;
                            e.stopPropagation();
                            setSelectedClip(clip.id);
                            const el = e.currentTarget as HTMLElement;
                            const isTrim = e.clientX > el.getBoundingClientRect().right - 10;
                            el.setPointerCapture(e.pointerId);
                            drag.current = { clipId: clip.id, trackId: track.id, mode: isTrim ? 'trim' : 'move', startX: e.clientX, orig: { ...clip, audio: clip.audio ? { ...clip.audio } : undefined } };
                          }}
                          onPointerMove={(e) => {
                            const dr = drag.current;
                            if (!dr || dr.clipId !== clip.id) return;
                            const dBeats = (e.clientX - dr.startX) / pxPerBeat;
                            p.onMutate((d) => {
                              const t = d.arrangement.find((x) => x.id === dr.trackId);
                              const c = t?.clips.find((x) => x.id === dr.clipId);
                              if (!c) return;
                              if (dr.mode === 'move') {
                                c.startBeats = Math.max(0, Math.round((dr.orig.startBeats + dBeats) / BEATS_PER_BAR) * BEATS_PER_BAR);
                              } else {
                                c.lengthBeats = Math.max(1, Math.round(dr.orig.lengthBeats + dBeats));
                              }
                            });
                          }}
                          onPointerUp={() => { drag.current = null; }}
                          className="absolute top-[6px] bottom-[6px] rounded-[8px] flex items-center px-2 overflow-hidden select-none"
                          style={{
                            left: clip.startBeats * pxPerBeat,
                            width: Math.max(10, clip.lengthBeats * pxPerBeat - 2),
                            background: track.foreign
                              ? 'rgba(208,188,255,0.08)'
                              : clip.audio ? 'rgba(0,218,243,0.14)' : 'linear-gradient(135deg, #6B0099, #D40055)',
                            border: track.foreign
                              ? '1px dashed rgba(208,188,255,0.4)'
                              : clip.audio ? '1px solid rgba(0,218,243,0.45)' : 'none',
                            outline: selected ? `2px solid ${SELECT}` : 'none',
                            outlineOffset: 1,
                            cursor: track.foreign ? 'default' : 'grab',
                          }}
                          title={track.foreign ? 'Preserved for re-export — not played in browser' : `${pat?.name || clip.audio?.name || 'Clip'} · drag to move (bar snap), right edge to trim, Delete to remove`}
                        >
                          {clip.audio && !track.foreign && (
                            <span className="absolute inset-0 pointer-events-none" style={{
                              background: 'repeating-linear-gradient(90deg, rgba(0,218,243,0.35) 0 2px, transparent 2px 5px)',
                              WebkitMask: 'linear-gradient(180deg, transparent 0 30%, #000 45% 55%, transparent 70% 100%)',
                              mask: 'linear-gradient(180deg, transparent 0 30%, #000 45% 55%, transparent 70% 100%)',
                            }} />
                          )}
                          <span className="relative text-[10px] font-semibold truncate" style={{ color: track.foreign ? '#D0BCFF' : clip.audio ? PLAYHEAD : '#fff' }}>
                            {track.foreign ? track.name : pat?.name || clip.audio?.name || 'Clip'}
                          </span>
                          {!track.foreign && <span className="absolute right-0 top-0 bottom-0 w-[8px] cursor-ew-resize" style={{ background: 'rgba(255,255,255,0.12)' }} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="flex items-center gap-2 px-3" style={{ height: 36 }}>
                <button onClick={() => addTrack('pattern')} className="h-6 px-2 rounded-lg border border-white/10 text-white/40 hover:text-white text-[10px] flex items-center gap-1"><Plus size={10} /><Music2 size={10} /> Pattern track</button>
                <button onClick={() => addTrack('audio')} className="h-6 px-2 rounded-lg border border-white/10 text-white/40 hover:text-white text-[10px] flex items-center gap-1"><Plus size={10} /><AudioWaveform size={10} /> Audio track</button>
                <span className="text-[9px] text-white/20">double-click a pattern lane to paint “{p.activePattern.name}” · drop audio files on audio lanes</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 px-3 h-8 border-t border-white/10 flex-none text-[10px] text-white/35">
          <span>Snap: <b className="text-white/60">1 bar</b> (trim: 1 beat)</span>
          <label className="flex items-center gap-1.5">Zoom
            <input type="range" min={6} max={48} value={pxPerBeat} onChange={(e) => setPxPerBeat(Number(e.target.value))} className="w-28 accent-[#D0BCFF]" />
          </label>
          <span className="flex-1" />
          <button onClick={() => setShowMixer((v) => !v)} className="flex items-center gap-1 text-white/45 hover:text-white">
            {showMixer ? <ChevronDown size={11} /> : <ChevronUp size={11} />} Mixer
          </button>
        </div>
      </div>

      {showMixer && <div className="rounded-b-[18px] overflow-hidden -mt-px"><MixerPanel doc={p.doc} meters={p.meters} onMutate={p.onMutate} /></div>}
    </div>
  );
};
