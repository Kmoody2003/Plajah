// The deck — whenever a song plays on the desk it loads here, visually, the way DJ mode and
// Ambo load a track: cover, the song's waveform (DJ mode's WaveformCanvas, so it reads the same
// everywhere), position, and the lyrics riding the playhead in big type.
//
// It is also where the artist CHECKS the lyric sync. Every synced line is editable in place:
// fix the words the auto-sync misheard (or find-and-replace a word across the song), stamp a
// line at the playhead, nudge it ±0.1 s, click it to hear it. Auto-transcribe and tap-sync are
// here too, so a song can go from no lyrics to synced and spelled right without leaving the deck.

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Square, Wand2, Crosshair, Minus, Plus, Trash2, Replace, Keyboard, Loader2, X, ArrowDownToLine } from 'lucide-react';
import type { ProjectTrack, TimedLyric } from '../../../../../services/melos/beats/masterProject';
import { backupToLocker } from '../../../../../services/melos/beats/sampleStore';
import {
  lyricLinesFor, nudgeLyricTime, setLyricTime, parseTimeInput, transcribeCaptions, timedLyricDrift, applyLyricsToTimings,
} from '../../../../../services/lyricSync';
import { SERIF, inputCls, btnCls } from './ui';

const WaveformCanvas = React.lazy(() => import('../../../../DJModeView').then((m) => ({ default: m.WaveformCanvas })));

const fmtT = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

interface TrackDeckProps {
  track: ProjectTrack;
  index: number;
  artist: string;
  cover?: string;
  color: string;
  peaks?: Float32Array;
  /** Song-relative playhead (played-region seconds) — read every frame. */
  getPos: () => number | null;
  playing: boolean;
  onPlayFrom: (songSec: number) => void;
  onStop: () => void;
  onPatch: (fn: (t: ProjectTrack) => void) => void;
  onClose: () => void;
}

export const TrackDeck: React.FC<TrackDeckProps> = ({ track, index, artist, cover, color, peaks, getPos, playing, onPlayFrom, onStop, onPatch, onClose }) => {
  const dur = Math.max(0.1, (track.playLengthSec ?? (track.sample.durationSec - (track.startOffsetSec ?? 0))));
  const timed: TimedLyric[] = track.timeCodedLyrics ?? [];
  const [pos, setPos] = useState(0);
  const [find, setFind] = useState('');
  const [repl, setRepl] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [tapping, setTapping] = useState(false);
  const [tapCursor, setTapCursor] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const getPosRef = useRef(getPos); getPosRef.current = getPos;

  // A 15 fps readout is plenty for lyrics and keeps the deck from re-rendering the desk.
  useEffect(() => {
    const id = window.setInterval(() => { const p = getPosRef.current(); if (p != null) setPos(p); }, 66);
    return () => window.clearInterval(id);
  }, []);

  const activeIdx = useMemo(() => {
    let a = -1;
    for (let i = 0; i < timed.length; i++) if (timed[i].time <= pos + 0.05) a = i; else break;
    return a;
  }, [timed, pos]);

  // Keep the active line in view in the editor.
  useEffect(() => {
    if (activeIdx < 0 || !playing) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-line="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, playing]);

  const setTimed = (next: TimedLyric[]) => onPatch((t) => { t.timeCodedLyrics = [...next].sort((a, b) => a.time - b.time); });
  const editText = (i: number, text: string) => onPatch((t) => { const l = t.timeCodedLyrics?.[i]; if (l) l.text = text; });

  /** Push the corrected lines back into the lyrics box so the two never drift. */
  const syncLyricsBox = () => onPatch((t) => { t.lyrics = (t.timeCodedLyrics ?? []).map((l) => l.text.trim()).filter(Boolean).join('\n'); });

  const replaceAll = () => {
    if (!find.trim()) return;
    const re = new RegExp(`\\b${find.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    let n = 0;
    onPatch((t) => {
      t.timeCodedLyrics = (t.timeCodedLyrics ?? []).map((l) => { const text = l.text.replace(re, () => { n++; return repl; }); return { ...l, text }; });
      if (t.lyrics) t.lyrics = t.lyrics.replace(re, repl);
    });
    setNote(`Replaced ${n} occurrence${n === 1 ? '' : 's'}.`);
    setTimeout(() => setNote(null), 4000);
  };

  const transcribe = async () => {
    setTranscribing(true);
    setNote('Listening to the song…');
    try {
      let url = track.sample.lockerUrl;
      if (!url) { setNote('Uploading a copy for the transcriber…'); url = (await backupToLocker(track.sample)) ?? undefined; }
      if (!url) { setNote('Sign in to auto-sync — the transcriber needs a hosted copy.'); return; }
      const captions = await transcribeCaptions(url, { title: track.title });
      if (!captions) { setNote('Nothing came back — type the lyrics and tap-sync instead.'); return; }
      onPatch((t) => { t.timeCodedLyrics = captions; if (!t.lyrics) t.lyrics = captions.map((c) => c.text.trim()).filter(Boolean).join('\n'); });
      setNote(`Synced ${captions.length} lines — read them against the song and fix any misheard words.`);
    } finally { setTranscribing(false); setTimeout(() => setNote(null), 7000); }
  };

  // Tap-sync: each Space/tap stamps the next line at the playhead.
  const lines = lyricLinesFor(track);
  const startTap = () => { if (!lines.length) return; setTapCursor(0); setTapping(true); onPatch((t) => { t.timeCodedLyrics = []; }); onPlayFrom(0); };
  const tap = () => {
    if (!tapping) return;
    const p = getPosRef.current() ?? pos;
    const i = tapCursor;
    onPatch((t) => { t.timeCodedLyrics = [...(t.timeCodedLyrics ?? []), { time: Math.max(0, Math.round(p * 100) / 100), text: lines[i] ?? '' }]; });
    if (i + 1 >= lines.length) setTapping(false); else setTapCursor(i + 1);
  };
  useEffect(() => {
    if (!tapping) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space') { e.preventDefault(); e.stopPropagation(); tap(); }
      if (e.key === 'Escape') setTapping(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
  useEffect(() => { if (!playing && tapping) setTapping(false); }, [playing, tapping]);

  const drift = timedLyricDrift(track);
  const cur = activeIdx >= 0 ? timed[activeIdx] : null;
  const next = timed[activeIdx + 1];

  return (
    <div className="rounded-[14px] border border-white/[0.12] overflow-hidden" style={{ background: 'linear-gradient(180deg, rgba(18,10,31,0.95), rgba(10,10,13,0.98))' }}>
      {/* ── deck head ── */}
      <div className="flex items-center gap-3 p-3 border-b border-white/[0.08]">
        <div className="w-14 h-14 rounded-lg overflow-hidden bg-black/50 flex-none border border-white/10">
          {cover ? <img src={cover} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{ background: `radial-gradient(circle, ${color}, #120a1f)` }} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-extrabold uppercase tracking-[0.18em]" style={{ color }}>Deck · Track {String(index + 1).padStart(2, '0')}</div>
          <div className="text-[15px] text-white truncate" style={{ fontFamily: SERIF }}>{track.title}</div>
          <div className="text-[10.5px] text-white/45 truncate">{artist}</div>
        </div>
        <div className="font-mono text-[15px] tabular-nums" style={{ color: '#00DAF3' }}>{fmtT(pos)}<span className="text-white/30 text-[11px]"> / {fmtT(dur)}</span></div>
        <button
          onClick={() => (playing ? onStop() : onPlayFrom(pos >= dur - 0.2 ? 0 : pos))}
          className="w-9 h-9 rounded-full grid place-items-center"
          style={playing ? { background: '#00DAF3', color: '#061014' } : { background: 'rgba(255,255,255,0.1)', color: '#fff' }}
          aria-label={playing ? 'Stop' : 'Play'}
        >{playing ? <Square size={12} fill="currentColor" /> : <Play size={13} fill="currentColor" />}</button>
        <button onClick={onClose} className="w-7 h-7 grid place-items-center text-white/35 hover:text-white" aria-label="Close deck"><X size={13} /></button>
      </div>

      {/* ── waveform (DJ mode's) ── */}
      <div className="h-[70px] px-3 pt-2">
        <Suspense fallback={<div className="h-full rounded bg-white/[0.03]" />}>
          <WaveformCanvas
            peaks={peaks ?? null}
            progress={Math.min(1, pos / dur)}
            color={color}
            hotCues={timed.slice(0, 8).map((l) => l.time)}
            loopIn={null}
            loopOut={null}
            duration={dur}
            onSeek={(t: number) => onPlayFrom(Math.max(0, Math.min(dur, t)))}
          />
        </Suspense>
      </div>

      {/* ── the lyric on the playhead ── */}
      <div className="px-4 py-3 text-center min-h-[78px]">
        {timed.length ? (
          <>
            <div className="text-[20px] leading-snug text-white transition-opacity" style={{ fontFamily: SERIF, opacity: cur ? 1 : 0.35 }}>{cur?.text || '♪'}</div>
            <div className="text-[12px] text-white/35 mt-1 truncate">{next?.text ?? ''}</div>
          </>
        ) : (
          <div className="text-[12px] text-white/35" style={{ fontFamily: SERIF, fontStyle: 'italic' }}>No synced lyrics yet — auto-sync them, or tap them in.</div>
        )}
        {tapping && <div className="mt-2 text-[11px] text-[#FF8C00]">Tap Space on each line · next: “{lines[tapCursor] ?? ''}” · Esc to stop</div>}
      </div>

      {/* ── tools ── */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
        <button className={btnCls} onClick={() => { void transcribe(); }} disabled={transcribing}>{transcribing ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />} Auto-sync</button>
        <button className={btnCls} onClick={() => (tapping ? tap() : startTap())} disabled={!lines.length}><Keyboard size={11} /> {tapping ? `Tap (${tapCursor + 1}/${lines.length})` : 'Tap-sync'}</button>
        <button className={btnCls} onClick={() => setShowReplace((v) => !v)} disabled={!timed.length}><Replace size={11} /> Find & replace</button>
        {drift !== 'none' && (
          <button className={btnCls} onClick={() => { const n = applyLyricsToTimings(track); if (n) onPatch((t) => { t.timeCodedLyrics = n; }); else syncLyricsBox(); }} title={drift === 'count' ? 'The lyrics box has a different number of lines — this copies the synced words into the box instead' : 'Put the typed lyrics onto these timings'}>
            <ArrowDownToLine size={11} /> {drift === 'count' ? 'Copy synced words to lyrics' : 'Use typed lyrics'}
          </button>
        )}
        {note && <span className="text-[10px] text-[#FF8C00]">{note}</span>}
      </div>
      {showReplace && (
        <div className="flex items-center gap-1.5 px-3 pb-2">
          <input className={inputCls} placeholder="Misheard word" value={find} onChange={(e) => setFind(e.target.value)} />
          <span className="text-white/30">→</span>
          <input className={inputCls} placeholder="Correct spelling" value={repl} onChange={(e) => setRepl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') replaceAll(); }} />
          <button className={btnCls} onClick={replaceAll} disabled={!find.trim()}>Replace all</button>
        </div>
      )}

      {/* ── the sync, line by line ── */}
      {timed.length > 0 && (
        <div ref={listRef} className="max-h-[260px] overflow-y-auto border-t border-white/[0.06]">
          {timed.map((l, i) => {
            const active = i === activeIdx;
            return (
              <div key={i} data-line={i} className="grid grid-cols-[auto_1fr_auto] gap-1.5 items-center px-3 py-1 border-b border-white/[0.03]" style={{ background: active ? 'rgba(0,218,243,0.08)' : 'transparent' }}>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => onPlayFrom(Math.max(0, l.time - 0.5))} className="w-5 h-5 grid place-items-center text-white/35 hover:text-[#00DAF3]" aria-label={`Play from line ${i + 1}`}><Play size={9} fill="currentColor" /></button>
                  <input
                    key={`${l.time}`}
                    defaultValue={fmtT(l.time)}
                    onBlur={(e) => { const s = parseTimeInput(e.target.value); if (Number.isFinite(s)) setTimed(setLyricTime(timed, i, s)); else e.target.value = fmtT(l.time); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className="w-[58px] h-6 bg-black/40 border border-white/10 rounded text-[10px] font-mono text-center outline-none"
                    style={{ color: active ? '#00DAF3' : 'rgba(255,255,255,0.6)' }}
                    aria-label={`Line ${i + 1} time`}
                  />
                  <button onClick={() => setTimed(nudgeLyricTime(timed, i, -0.1))} className="w-5 h-5 grid place-items-center text-white/30 hover:text-white" aria-label="Earlier 0.1 s"><Minus size={9} /></button>
                  <button onClick={() => setTimed(nudgeLyricTime(timed, i, 0.1))} className="w-5 h-5 grid place-items-center text-white/30 hover:text-white" aria-label="Later 0.1 s"><Plus size={9} /></button>
                  <button onClick={() => { const p = getPosRef.current(); if (p != null) setTimed(setLyricTime(timed, i, p)); }} disabled={!playing} className="w-5 h-5 grid place-items-center text-white/30 hover:text-[#FF8C00] disabled:opacity-25" title="Set this line to the playhead" aria-label="Stamp at playhead"><Crosshair size={10} /></button>
                </div>
                <input
                  value={l.text}
                  onChange={(e) => editText(i, e.target.value)}
                  onBlur={syncLyricsBox}
                  spellCheck
                  className="w-full h-6 bg-transparent text-[12px] outline-none border-b border-transparent focus:border-white/20"
                  style={{ color: active ? '#fff' : 'rgba(255,255,255,0.7)', fontFamily: SERIF }}
                  aria-label={`Line ${i + 1} words`}
                />
                <button onClick={() => setTimed(timed.filter((_, k) => k !== i))} className="w-5 h-5 grid place-items-center text-white/20 hover:text-[#EF4444]" aria-label={`Delete line ${i + 1}`}><Trash2 size={10} /></button>
              </div>
            );
          })}
        </div>
      )}
      <button
        onClick={() => setTimed([...timed, { time: Math.round((getPosRef.current() ?? pos) * 100) / 100, text: '' }])}
        className="w-full h-7 text-[10.5px] text-white/40 hover:text-white hover:bg-white/[0.03] border-t border-white/[0.06]"
      >+ Add a line at the playhead</button>
    </div>
  );
};
