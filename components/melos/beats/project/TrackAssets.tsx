// Track assets — Lyrics (with the manual timestamp tool) and Photo/Video, per song.
//
// THE POINT: data that belongs to a song must ride with it all the way to release. Lyrics typed
// (or pulled from the Melos song) live on the ProjectTrack, get timestamped here, and are copied
// onto the Chora Track by seedAlbumCreator — where the player reads them through
// src/lib/captions.ts getActiveCaption(). Timestamps are SECONDS, matching that reader.
//
// The tap-sync flow mirrors the one in AlbumCreator (play → tap each line → nudge to taste), so
// a synced lyric made here is identical to one made there.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Square, Plus, Trash2, RotateCcw, Image as ImageIcon, Wand2, AlertTriangle } from 'lucide-react';
import type { ProjectTrack, TimedLyric } from '../../../../services/melos/beats/masterProject';
import { backupToLocker } from '../../../../services/melos/beats/sampleStore';
import {
  lyricLinesFor, transcriptionToText, timedLyricDrift, applyLyricsToTimings,
  nudgeLyricTime, setLyricTime, parseTimeInput, transcribeCaptions,
} from '../../../../services/lyricSync';
import { ARMED } from '../theme';

interface TrackAssetsProps {
  track: ProjectTrack;
  /** Patch this track in the project doc. */
  onPatch: (fn: (t: ProjectTrack) => void) => void;
  /** Start/stop auditioning this track (the clock the tap-sync stamps against). */
  onToggleAudition: () => void;
  playing: boolean;
  /** Seconds elapsed in the current audition of THIS track. */
  posSec: number;
}

const fmtT = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const inputCls = 'w-full rounded-[8px] bg-black/35 border border-white/10 text-[11.5px] text-white placeholder-white/25 outline-none px-2 py-1.5 focus:border-[#FF8C00]/60';

export const TrackAssets: React.FC<TrackAssetsProps> = ({ track, onPatch, onToggleAudition, playing, posSec }) => {
  const [tab, setTab] = useState<'lyrics' | 'media'>('lyrics');
  const [syncing, setSyncing] = useState(false);
  const [cursor, setCursor] = useState(0);        // which line the next tap stamps
  const [transcribing, setTranscribing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const stamps = useRef<number[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // The SAME line resolution the Album Creator uses: typed lyrics, else the transcript's text —
  // without that fallback a transcribed track can't be hand-synced at all.
  const lines = lyricLinesFor(track);
  const timed = track.timeCodedLyrics ?? [];
  const drift = timedLyricDrift(track);

  // Stop syncing when playback stops.
  useEffect(() => { if (!playing && syncing) setSyncing(false); }, [playing, syncing]);

  const startSync = useCallback(() => {
    if (!lines.length) return;
    stamps.current = [];
    setCursor(0);
    setSyncing(true);
    if (!playing) onToggleAudition();
  }, [lines.length, playing, onToggleAudition]);

  /** Stamp the current line at the playhead and advance — the tap-sync gesture. */
  const tap = useCallback(() => {
    if (!syncing) return;
    const t = Math.max(0, posSec);
    stamps.current = [...stamps.current, t];
    const next = cursor + 1;
    setCursor(next);
    const built: TimedLyric[] = stamps.current.map((time, i) => ({ time, text: lines[i] ?? '' }));
    onPatch((tr) => { tr.timeCodedLyrics = built; });
    if (next >= lines.length) { setSyncing(false); }
  }, [syncing, posSec, cursor, lines, onPatch]);

  // Space bar taps while syncing — hands stay on the beat.
  useEffect(() => {
    if (!syncing) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space') { e.preventDefault(); tap(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [syncing, tap]);

  const nudge = (i: number, by: number) => onPatch((tr) => { tr.timeCodedLyrics = nudgeLyricTime(tr.timeCodedLyrics ?? [], i, by); });
  const setTime = (i: number, secs: number) => onPatch((tr) => { tr.timeCodedLyrics = setLyricTime(tr.timeCodedLyrics ?? [], i, secs); });

  /**
   * Auto-transcribe — the same windowed `/api/ai/captions` pass the player's "Sync Lyrics" uses.
   * The server fetches the audio, so the track needs a durable https URL; a Project track lives
   * in OPFS, so push a locker copy first when it hasn't got one yet.
   */
  const autoTranscribe = useCallback(async () => {
    setTranscribing(true);
    setNote('Listening to the track…');
    try {
      let url = track.sample.lockerUrl;
      if (!url) { setNote('Uploading a copy so it can be transcribed…'); url = (await backupToLocker(track.sample)) ?? undefined; }
      if (!url) { setNote('Sign in to auto-transcribe — the transcriber needs a hosted copy.'); return; }
      const captions = await transcribeCaptions(url, { title: track.title });
      if (!captions) { setNote('Transcription came back empty — type the lyrics and tap-sync instead.'); return; }
      onPatch((tr) => {
        tr.timeCodedLyrics = captions;
        // Seed the editable box from the transcript so it can be corrected by hand.
        if (!tr.lyrics) tr.lyrics = captions.map((c) => c.text.trim()).filter(Boolean).join('\n');
      });
      setNote(`Transcribed ${captions.length} lines — correct any wording, timings stay put.`);
    } finally {
      setTranscribing(false);
      setTimeout(() => setNote(null), 6000);
    }
  }, [track.sample, track.title, onPatch]);

  const addImages = async (files: FileList) => {
    // Data URLs keep this self-contained; the Album Creator owns the durable upload on publish.
    for (const f of Array.from(files).slice(0, 6)) {
      const url = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); });
      onPatch((tr) => { tr.images = [...(tr.images ?? []), url].slice(0, 8); });
    }
  };

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        {(['lyrics', 'media'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="h-6 px-2.5 rounded-lg text-[10px] font-bold border"
            style={tab === t
              ? { color: '#fff', borderColor: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.08)' }
              : { color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.12)' }}
          >{t === 'lyrics' ? 'Lyrics' : 'Photo / Video'}</button>
        ))}
        {tab === 'lyrics' && timed.length > 0 && (
          <span className="font-mono text-[9px] text-[#06D6A0] ml-1">{timed.length}/{lines.length || '?'} synced</span>
        )}
      </div>

      {tab === 'lyrics' ? (
        <div className="flex flex-col gap-2">
          <textarea
            className={`${inputCls} min-h-[76px] resize-y`}
            placeholder="Lyrics — one line per line. Pulled from the Melos song when you build from an arrangement."
            value={track.lyrics ?? ''}
            onChange={(e) => onPatch((tr) => { tr.lyrics = e.target.value; })}
            aria-label="Lyrics"
          />
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* No lyrics yet? Let the transcriber write them AND time them. */}
            <button
              onClick={() => { void autoTranscribe(); }}
              disabled={transcribing}
              className="h-7 px-2.5 rounded-lg text-[10px] font-bold border border-[#D0BCFF]/45 text-[#D0BCFF] hover:bg-[#D0BCFF]/10 disabled:opacity-40 flex items-center gap-1"
              title="Transcribe the audio and time-code it automatically"
            ><Wand2 size={10} /> {transcribing ? 'Transcribing…' : lines.length ? 'Re-transcribe' : 'Auto-transcribe'}</button>
            <button
              onClick={startSync}
              disabled={!lines.length}
              className="h-7 px-2.5 rounded-lg text-[10px] font-bold border border-[#00DAF3]/40 text-[#00DAF3] hover:bg-[#00DAF3]/10 disabled:opacity-30 flex items-center gap-1"
              title="Play the track and tap each line onto the beat"
            ><Play size={10} fill="currentColor" /> Sync by hand</button>
            {syncing && (
              <button
                onClick={tap}
                className="h-7 px-3 rounded-lg text-[10px] font-black"
                style={{ background: ARMED, color: '#12080a' }}
              >TAP (space) · line {Math.min(cursor + 1, lines.length)}/{lines.length}</button>
            )}
            {playing && (
              <button onClick={onToggleAudition} className="h-7 px-2 rounded-lg text-[10px] border border-white/15 text-white/50 flex items-center gap-1">
                <Square size={9} fill="currentColor" /> Stop
              </button>
            )}
            {timed.length > 0 && (
              <button
                onClick={() => onPatch((tr) => { tr.timeCodedLyrics = []; })}
                className="h-7 px-2 rounded-lg text-[10px] border border-white/15 text-white/40 hover:text-[#EF4444] flex items-center gap-1"
              ><RotateCcw size={9} /> Clear</button>
            )}
            <span className="font-mono text-[9px] text-white/30 ml-auto">{playing ? fmtT(posSec) : '—'}</span>
          </div>

          {note && <p className="text-[9.5px] text-[#D0BCFF]">{note}</p>}

          {/* Drift: the lyrics box and the synced captions disagree. The player renders the
              CAPTIONS, so a typo fixed in the box would otherwise never reach playback. */}
          {drift !== 'none' && (
            <div className="rounded-[8px] border border-[#F59E0B]/40 bg-[#F59E0B]/[0.08] px-2.5 py-2 flex items-start gap-2">
              <AlertTriangle size={12} className="text-[#F59E0B] mt-0.5 flex-none" />
              <div className="min-w-0">
                <div className="text-[10px] text-[#f0c674]">
                  {drift === 'text'
                    ? 'Your lyrics have edits the synced captions don’t have — playback shows the captions.'
                    : 'The lyrics and the synced captions have different line counts, so the timings can’t be mapped.'}
                </div>
                <div className="flex gap-1.5 mt-1.5">
                  {drift === 'text' && (
                    <button
                      onClick={() => onPatch((tr) => { const next = applyLyricsToTimings(tr); if (next) tr.timeCodedLyrics = next; })}
                      className="h-6 px-2 rounded text-[9.5px] font-bold border border-[#F59E0B]/50 text-[#F59E0B] hover:bg-[#F59E0B]/10"
                    >Apply words to timings</button>
                  )}
                  <button
                    onClick={() => onPatch((tr) => { tr.lyrics = transcriptionToText(tr); })}
                    className="h-6 px-2 rounded text-[9.5px] border border-white/15 text-white/50 hover:text-white"
                  >Use the captions&rsquo; words</button>
                </div>
              </div>
            </div>
          )}

          {syncing && lines[cursor] && (
            <div className="rounded-[8px] border border-[#FF8C00]/40 bg-[#FF8C00]/[0.08] px-2.5 py-2">
              <div className="text-[8px] uppercase tracking-[0.16em] text-white/35">Next line</div>
              <div className="text-[12.5px] text-white font-semibold">{lines[cursor]}</div>
            </div>
          )}

          {timed.length > 0 && (
            <div className="max-h-[190px] overflow-auto rounded-[8px] border border-white/[0.08]">
              {timed.map((l, i) => (
                <div key={i} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-2 py-1 border-b border-white/[0.05]">
                  <input
                    defaultValue={l.time.toFixed(2)}
                    onBlur={(e) => { const v = parseTimeInput(e.target.value); if (Number.isFinite(v)) setTime(i, v); }}
                    className="w-14 bg-black/40 border border-white/10 rounded px-1 py-0.5 font-mono text-[9.5px] text-[#00DAF3] outline-none"
                    aria-label={`Timestamp for line ${i + 1}`}
                  />
                  <span className="text-[11px] text-white/75 truncate">{l.text}</span>
                  <span className="flex gap-0.5">
                    <button onClick={() => nudge(i, -0.1)} className="w-5 h-5 rounded text-white/35 hover:text-white text-[10px]" aria-label="Nudge earlier">−</button>
                    <button onClick={() => nudge(i, 0.1)} className="w-5 h-5 rounded text-white/35 hover:text-white text-[10px]" aria-label="Nudge later">+</button>
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[9px] text-white/25">Synced lyrics publish with the track — Chora's player reads them for lyric sync.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { if (e.target.files?.length) void addImages(e.target.files); e.target.value = ''; }} />
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => fileRef.current?.click()}
              className="h-7 px-2.5 rounded-lg text-[10px] font-bold border border-white/15 text-white/60 hover:text-white hover:bg-white/10 flex items-center gap-1"
            ><Plus size={10} /> Add photos</button>
            <span className="text-[9px] text-white/25">{(track.images ?? []).length}/8</span>
          </div>
          {(track.images ?? []).length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {(track.images ?? []).map((src, i) => (
                <div key={i} className="relative w-[64px] h-[64px] rounded-[8px] overflow-hidden border border-white/12">
                  <img src={src} alt={`${track.title} art ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => onPatch((tr) => { tr.images = (tr.images ?? []).filter((_, j) => j !== i); })}
                    className="absolute top-0.5 right-0.5 w-4 h-4 grid place-items-center rounded bg-black/70 text-white/70 hover:text-[#EF4444]"
                    aria-label={`Remove image ${i + 1}`}
                  ><Trash2 size={9} /></button>
                </div>
              ))}
            </div>
          )}
          <input
            className={inputCls}
            placeholder="Music video URL (Reello, YouTube…)"
            value={track.videoUrl ?? ''}
            onChange={(e) => onPatch((tr) => { tr.videoUrl = e.target.value; })}
            aria-label="Music video URL"
          />
          <p className="text-[9px] text-white/25 flex items-center gap-1">
            <ImageIcon size={10} /> Artwork and video ride with the track into the Album Creator on publish.
          </p>
        </div>
      )}
    </div>
  );
};
