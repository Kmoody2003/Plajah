// The Timeline — Bitwig Arranger / Studio One arrangement paradigm (approved mockup 05):
// track headers left, clip lanes over a bar ruler right, cyan playhead, H-zoom, snap, and the
// docked mixer underneath. Edits the SAME GrooveDoc.arrangement the Glass Sequence strip
// renders compactly; imported .dawproject tracks land here, preserved plugin tracks dimmed.
// Grammar: double-click empty lane = paint the active pattern · drag = move (bar snap) ·
// right-edge grip = trim (beat snap) · click = select · Delete = remove · drop audio = clip.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Music2, AudioWaveform, Piano, Circle } from 'lucide-react';
import type { GrooveDoc, Pattern, TimelineClip } from '../../../../services/melos/beats/grooveDoc';
import { grooveUid } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { ingestSample, backupToLocker } from '../../../../services/melos/beats/sampleStore';
import { MixerPanel } from '../shared/MixerPanel';
import { PianoRoll } from './PianoRoll';
import { InstrumentPanel } from '../instrument/InstrumentPanel';

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
  /** Room-owned: open a specific instrument's panel (so the add-picker can too). */
  onOpenInstrument?: (id: string) => void;
  /** Room-owned: open the instrument picker (choose ONDA/KERA/…). */
  onAddInstrument?: () => void;
}

export const TimelineView: React.FC<TimelineViewProps> = (p) => {
  const [pxPerBeat, setPxPerBeat] = useState(14);
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [showMixer, setShowMixer] = useState(true);
  const [openClip, setOpenClip] = useState<{ trackId: string; clipId: string } | null>(null);
  // Opening an instrument is owned by the room now (so the add-instrument picker can open one
  // from any view), and this view just asks. A local fallback keeps it working standalone.
  const [localOpen, setLocalOpen] = useState<string | null>(null);
  const openInstrument = p.onOpenInstrument ? null : localOpen;
  const requestOpen = (id: string) => (p.onOpenInstrument ? p.onOpenInstrument(id) : setLocalOpen(id));
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

  // Drop audio onto empty space → one NEW labelled audio track per file, at the drop point. The
  // Bitwig / Studio One behaviour: no manual track creation, no renaming.
  const [dropHot, setDropHot] = useState(false);
  const dropNewTracks = useCallback(async (files: File[], atBeats: number) => {
    const audio = files.filter((f) => f.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|m4a|aif|aiff)$/i.test(f.name));
    if (!audio.length) return;
    const engine = BeatsEngine.get();
    await engine.init();
    const ctx = engine.getContext();
    if (!ctx) return;
    const spb = 60 / p.doc.bpm;
    const startBar = Math.max(0, Math.floor(atBeats / BEATS_PER_BAR) * BEATS_PER_BAR);
    const made: { name: string; key: string; dur: number }[] = [];
    for (const file of audio) {
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Audio';
      const result = await ingestSample(file, name, ctx);
      if (!result) continue;
      engine.setSampleBuffer(result.ref.key, result.buffer);
      void backupToLocker(result.ref);
      made.push({ name, key: result.ref.key, dur: result.buffer.duration });
    }
    if (!made.length) return;
    p.onMutate((d) => {
      for (const m of made) {
        d.arrangement.push({
          id: grooveUid(), kind: 'audio', name: m.name, color: '#00DAF3',
          mute: false, solo: false, gainDb: 0, pan: 0,
          clips: [{
            id: grooveUid(), startBeats: startBar,
            lengthBeats: Math.max(1, Math.round((m.dur / spb) * 4) / 4),
            audio: { sampleKey: m.key, name: m.name, offsetSec: 0, gainDb: 0, durationSec: m.dur },
          }],
        });
      }
    });
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

  const addMidiClip = useCallback((trackId: string, atBeats: number) => {
    p.onMutate((d) => {
      const track = d.arrangement.find((t) => t.id === trackId);
      if (!track || track.kind !== 'instrument') return;
      const startBeats = Math.floor(atBeats / BEATS_PER_BAR) * BEATS_PER_BAR;
      if (track.clips.some((c) => startBeats < c.startBeats + c.lengthBeats && startBeats + 1 > c.startBeats)) return;
      track.clips.push({ id: grooveUid(), startBeats, lengthBeats: BEATS_PER_BAR * 2, notes: [] });
    });
  }, [p.onMutate]); // eslint-disable-line react-hooks/exhaustive-deps

  const playheadX = p.running && p.playMode === 'song' ? p.beats * pxPerBeat : -1;

  // Draggable loop/cycle region on the ruler — move the body, drag either edge to resize; snaps
  // to the bar grid, and turns the loop on the moment you touch it.
  const loop = p.doc.loop ?? { on: false, startBeats: 0, endBeats: BEATS_PER_BAR * 4 };
  const dragLoop = (mode: 'move' | 'l' | 'r') => (e: React.PointerEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
    const start = { ...loop };
    const startX = e.clientX;
    const snap = (beats: number) => Math.round(beats / BEATS_PER_BAR) * BEATS_PER_BAR;
    const move = (ev: PointerEvent) => {
      const dBeats = (ev.clientX - startX) / pxPerBeat;
      p.onMutate((d) => {
        const l = d.loop ?? { on: true, startBeats: start.startBeats, endBeats: start.endBeats };
        if (mode === 'move') { const span = start.endBeats - start.startBeats; const s = Math.max(0, snap(start.startBeats + dBeats)); l.startBeats = s; l.endBeats = s + span; }
        else if (mode === 'l') l.startBeats = Math.max(0, Math.min(l.endBeats - BEATS_PER_BAR, snap(start.startBeats + dBeats)));
        else l.endBeats = Math.max(l.startBeats + BEATS_PER_BAR, snap(start.endBeats + dBeats));
        l.on = true;
        d.loop = l;
      });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

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
                {/* loop/cycle region */}
                <div
                  className="absolute top-0 h-full cursor-grab"
                  style={{ left: loop.startBeats * pxPerBeat, width: Math.max(2, (loop.endBeats - loop.startBeats) * pxPerBeat),
                    background: loop.on ? 'rgba(0,218,243,0.18)' : 'rgba(255,255,255,0.05)',
                    borderLeft: `2px solid ${loop.on ? '#00DAF3' : 'rgba(255,255,255,0.3)'}`, borderRight: `2px solid ${loop.on ? '#00DAF3' : 'rgba(255,255,255,0.3)'}` }}
                  title="Drag to move the loop; drag an edge to resize"
                  onPointerDown={dragLoop('move')}
                >
                  <span onPointerDown={dragLoop('l')} className="absolute left-0 top-0 bottom-0 w-2 -ml-1 cursor-ew-resize" />
                  <span onPointerDown={dragLoop('r')} className="absolute right-0 top-0 bottom-0 w-2 -mr-1 cursor-ew-resize" />
                </div>
              </div>
            </div>

            {/* lanes */}
            <div className="relative">
              {playheadX >= 0 && (
                <div className="absolute top-0 bottom-0 w-[2px] z-20 pointer-events-none" style={{ left: HEADER_W + playheadX, background: PLAYHEAD, boxShadow: `0 0 12px ${PLAYHEAD}88` }} />
              )}
              {p.doc.arrangement.filter((track) => !track.padOwned).map((track) => (
                <div key={track.id} className="flex border-b border-white/[0.06]" style={{ height: LANE_H, opacity: track.foreign ? 0.65 : 1 }}>
                  <div className="sticky left-0 z-10 flex items-center gap-2 px-3 bg-[#0E0916] border-r border-white/10" style={{ width: HEADER_W, minWidth: HEADER_W }}>
                    {track.kind === 'instrument' && !track.foreign ? (
                      <button
                        onClick={() => requestOpen(track.id)}
                        className="w-[4px] h-6 rounded-[2px] flex-none hover:h-7 transition-all"
                        style={{ background: track.color }}
                        title="Open the instrument"
                        aria-label={`Open ${track.name}`}
                      />
                    ) : (
                      <span className="w-[4px] h-6 rounded-[2px] flex-none" style={{ background: track.color }} />
                    )}
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
                        {track.kind === 'instrument' && (
                          <button
                            onClick={() => p.onMutate((d) => {
                              const on = !track.armed;
                              // Only one armed track: playing the keyboard has to be unambiguous.
                              for (const t of d.arrangement) t.armed = false;
                              const t = d.arrangement.find((x) => x.id === track.id);
                              if (t) t.armed = on;
                            })}
                            className="w-[17px] h-[17px] rounded-full border grid place-items-center flex-none"
                            style={track.armed
                              ? { background: 'rgba(255,140,0,0.22)', borderColor: '#FF8C00', color: '#FF8C00' }
                              : { borderColor: 'rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.3)' }}
                            title={track.armed ? 'Armed — your keyboard plays this' : 'Arm for playing and recording'}
                            aria-label={`Arm ${track.name}`}
                          ><Circle size={7} fill="currentColor" /></button>
                        )}
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
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const at = (e.clientX - rect.left) / pxPerBeat;
                      if (track.kind === 'pattern') paintClip(track.id, at);
                      else if (track.kind === 'instrument' && !track.foreign) addMidiClip(track.id, at);
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
                          onDoubleClick={(e) => {
                            // A MIDI clip opens its editor; that's the whole point of the clip.
                            if (track.kind === 'instrument' && !track.foreign) {
                              e.stopPropagation();
                              setOpenClip({ trackId: track.id, clipId: clip.id });
                            }
                          }}
                          className="absolute top-[6px] bottom-[6px] rounded-[8px] flex items-center px-2 overflow-hidden select-none"
                          style={{
                            left: clip.startBeats * pxPerBeat,
                            width: Math.max(10, clip.lengthBeats * pxPerBeat - 2),
                            background: track.foreign
                              ? 'rgba(208,188,255,0.08)'
                              : clip.audio ? 'rgba(0,218,243,0.14)'
                              : clip.notes ? 'rgba(208,188,255,0.15)'
                              : 'linear-gradient(135deg, #6B0099, #D40055)',
                            border: track.foreign
                              ? '1px dashed rgba(208,188,255,0.4)'
                              : clip.audio ? '1px solid rgba(0,218,243,0.45)'
                              : clip.notes ? '1px solid rgba(208,188,255,0.42)' : 'none',
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
                          {/* MIDI clips draw their notes, so the arrangement shows the music. */}
                          {clip.notes && clip.notes.length > 0 && !track.foreign && (() => {
                            const keys = clip.notes.map((n) => n.key);
                            const lo = Math.min(...keys) - 1;
                            const span = Math.max(6, Math.max(...keys) + 1 - lo);
                            return (
                              <span className="absolute inset-x-0 top-[3px] bottom-[3px] pointer-events-none">
                                {clip.notes.map((n) => (
                                  <span key={n.id} className="absolute rounded-[1px]" style={{
                                    left: `${(n.startBeats / clip.lengthBeats) * 100}%`,
                                    width: `${Math.max(1.5, (n.lengthBeats / clip.lengthBeats) * 100)}%`,
                                    bottom: `${((n.key - lo) / span) * 100}%`,
                                    height: 2,
                                    background: 'rgba(208,188,255,0.85)',
                                  }} />
                                ))}
                              </span>
                            );
                          })()}
                          <span className="relative text-[10px] font-semibold truncate" style={{ color: track.foreign ? '#D0BCFF' : clip.audio ? PLAYHEAD : clip.notes ? '#D0BCFF' : '#fff' }}>
                            {track.foreign ? track.name : pat?.name || clip.audio?.name || (clip.notes ? `${clip.notes.length} notes` : 'Clip')}
                          </span>
                          {!track.foreign && <span className="absolute right-0 top-0 bottom-0 w-[8px] cursor-ew-resize" style={{ background: 'rgba(255,255,255,0.12)' }} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div
                className="flex items-center gap-2 px-3 transition-colors"
                style={{ height: 40, background: dropHot ? 'rgba(0,218,243,0.10)' : 'transparent', outline: dropHot ? '1.5px dashed rgba(0,218,243,0.5)' : 'none', outlineOffset: -3 }}
                onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropHot(true); } }}
                onDragLeave={() => setDropHot(false)}
                onDrop={(e) => {
                  e.preventDefault(); setDropHot(false);
                  const files = Array.from(e.dataTransfer.files || []);
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const atBeats = Math.max(0, (e.clientX - rect.left - HEADER_W + (e.currentTarget.parentElement?.parentElement?.scrollLeft || 0)) / pxPerBeat);
                  if (files.length) void dropNewTracks(files, atBeats);
                }}
              >
                <button onClick={() => addTrack('pattern')} className="h-6 px-2 rounded-lg border border-white/10 text-white/40 hover:text-white text-[10px] flex items-center gap-1"><Plus size={10} /><Music2 size={10} /> Pattern track</button>
                <button onClick={() => addTrack('audio')} className="h-6 px-2 rounded-lg border border-white/10 text-white/40 hover:text-white text-[10px] flex items-center gap-1"><Plus size={10} /><AudioWaveform size={10} /> Audio track</button>
                <button
                  onClick={() => p.onAddInstrument?.()}
                  className="h-6 px-2 rounded-lg border text-[10px] flex items-center gap-1"
                  style={{ borderColor: 'rgba(208,188,255,0.4)', color: '#D0BCFF' }}
                ><Plus size={10} /><Piano size={10} /> Instrument</button>
                <span className="text-[9px]" style={{ color: dropHot ? '#00DAF3' : 'rgba(255,255,255,0.2)' }}>
                  {dropHot ? 'Drop to add one labelled track per file' : 'double-click a lane to add a clip · drop audio files here to make tracks'}
                </span>
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

      {/* When standalone (no room handler), fall back to opening the panel here. */}
      {openInstrument && (() => {
        const t = p.doc.arrangement.find((x) => x.id === openInstrument);
        if (!t || t.kind !== 'instrument') return null;
        return <InstrumentPanel doc={p.doc} track={t} onMutate={p.onMutate} onClose={() => setLocalOpen(null)} />;
      })()}

      {(() => {
        if (!openClip) return null;
        const t = p.doc.arrangement.find((x) => x.id === openClip.trackId);
        const c = t?.clips.find((x) => x.id === openClip.clipId);
        if (!t || !c) return null;
        return (
          <PianoRoll
            doc={p.doc}
            trackId={t.id}
            clip={c}
            beats={p.beats}
            running={p.running}
            playMode={p.playMode}
            onMutate={p.onMutate}
            onClose={() => setOpenClip(null)}
          />
        );
      })()}
    </div>
  );
};
