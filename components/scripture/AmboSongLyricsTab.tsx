// AmboSongLyricsTab — the Song Lyrics tab (next to Scripture).
//
// Built like the Scripture workflow: songs on the left (like books), sections
// in the middle (like chapters), lines on the right (like verses). Click a
// line to put it up; double-click a song to follow it.
//
// The difference is that the operator mostly doesn't have to touch it. With
// Listen on, Ambo:
//   · detects the song from the first line or two it hears (or from the file
//     that is playing) and switches to it — no playlist clicking
//   · follows the singing line by line or word by word
//   · when the leader goes off script, holds on the last sung word and writes
//     what they say as a blue ADLIB line, then picks the song back up
// Take to Program puts the followed lyrics on the LYRICS layer in any look.

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Mic, MicOff, Search, Plus, Pencil, Trash2, ChevronUp, ChevronDown, Radio, Sparkles, Eraser, Music, X, Check, Wand2, Loader2, LayoutTemplate, BookOpen, ScrollText,
} from 'lucide-react';
import {
  listSongs, getSong, subscribeSongs, songsVersion, searchSongs, sectionOf, parseLyricsText, songToText,
  saveUserSong, deleteUserSong, type Song,
} from '../../services/ambo/songLibrary';
import {
  ALL_SACRED_HYMNS_AND_PRAYERS,
  openHymnOrPrayerInLorea,
  type SacredHymnOrPrayer,
} from '../../data/sacredHymnsAndPrayers';
import {
  getSongFollowPrefs, getSongFollowState, subscribeSongFollow, setSongFollowPrefs, selectSong, jumpToLine, stepLine,
  clearAdlibs, startSongFollow, stopSongFollow, setSongFollowSource, type FollowListenSource,
  getCaptureState, startCapture, stopCapture, markCaptureIn, markCaptureOut, clearCapture, clearCaptureMarks, capturedLines,
} from '../../services/ambo/songFollower';
import { listAudioInputs } from '../../services/ambo/liveTranscriber';
import { getLyricsProgram, setLyricsProgram, subscribeLyricsProgram } from '../../services/ambo/lyricsProgram';
import { lyricStyleById, ADLIB_COLOR } from '../../services/ambo/lyricStyles';
import { getTypoTextState, setTypoTextPrefs, subscribeTypoText } from '../../services/ambo/typoText';
import { AmboSlideTemplateGallery } from './AmboSlideTemplateGallery';
import type { Slide } from '../../services/ambo/showModel';

const line = 'rgba(255,255,255,0.09)';
const LILAC = '#D0BCFF';
const ORANGE = '#FF8C00';
const GREEN = '#2BE0A8';
const RED = '#FF4D5E';

type Filter = 'all' | 'user' | 'chora' | 'builtin' | 'prayers';
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'user', label: 'My Songs' },
  { id: 'chora', label: 'Chora' },
  { id: 'builtin', label: 'Hymns' },
  { id: 'prayers', label: 'Prayers' },
];

const Toggle: React.FC<{ on: boolean; onClick: () => void; title?: string; children: React.ReactNode; color?: string }> = ({ on, onClick, title, children, color = LILAC }) => (
  <button
    onClick={onClick}
    title={title}
    className="px-2 h-6 rounded-md text-[10px] font-bold border transition-all whitespace-nowrap"
    style={on ? { color, background: `${color}22`, borderColor: `${color}66` } : { color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.1)' }}
  >
    {children}
  </button>
);

interface AmboSongLyricsTabProps {
  onInsertSlide?: (slide: Slide) => void;
  activeShowTitle?: string;
}

const AmboSongLyricsTab: React.FC<AmboSongLyricsTabProps> = ({ onInsertSlide, activeShowTitle }) => {
  useSyncExternalStore(subscribeSongs, songsVersion);
  const fs = useSyncExternalStore(subscribeSongFollow, getSongFollowState);
  const fp = useSyncExternalStore(subscribeSongFollow, getSongFollowPrefs);
  const program = useSyncExternalStore(subscribeLyricsProgram, getLyricsProgram);
  const typo = useSyncExternalStore(subscribeTypoText, getTypoTextState);
  const cap = useSyncExternalStore(subscribeSongFollow, getCaptureState);

  // The follower itself is installed studio-wide (typoTextDriver, started by
  // AmboProPresenter) so it keeps following while this tab is closed.

  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [viewId, setViewId] = useState<string | null>(() => getSongFollowState().songId ?? listSongs()[0]?.id ?? null);
  // `fromCapture`: this draft came from Transcribe IN→OUT; saving clears the marks and follows it.
  const [editing, setEditing] = useState<{ id?: string; title: string; artist: string; text: string; fromCapture?: boolean } | null>(null);
  const [inputs, setInputs] = useState<Array<{ deviceId: string; label: string }>>([]);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [showProvenance, setShowProvenance] = useState(true);
  useEffect(() => { void listAudioInputs().then(setInputs).catch(() => {}); }, [fs.listening]);

  // Detection / file switch → show that song (the operator never has to go looking).
  useEffect(() => { if (fs.songId) setViewId(fs.songId); }, [fs.songId]);
  // Transcribe: stay on the newest words unless the operator scrolled up to mark something.
  useEffect(() => {
    const el = listRef.current;
    if (!cap.on || !el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight;
  }, [cap.on, cap.lines.length, cap.partial]);

  const songs = useMemo(() => {
    return searchSongs(q).filter(s => {
      if (filter === 'all') return true;
      if (filter === 'prayers') return s.sacredKind === 'CATHOLIC_PRAYER' || s.sacredKind === 'ORTHODOX_PRAYER';
      if (filter === 'builtin') return s.source === 'builtin' && s.sacredKind !== 'CATHOLIC_PRAYER' && s.sacredKind !== 'ORTHODOX_PRAYER';
      return s.source === filter;
    });
  }, [q, filter, songsVersion()]);
  const view: Song | null = getSong(viewId);
  const sacredMeta: SacredHymnOrPrayer | null = useMemo(
    () => (view?.sacredMetaId ? ALL_SACRED_HYMNS_AND_PRAYERS.find(x => x.id === view.sacredMetaId) ?? null : null),
    [view?.sacredMetaId]
  );
  const following = !!view && view.id === fs.songId;
  const onProgram = program.wantLive && program.source === 'follow';

  // Keep the live line in view.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!following || fs.entry < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-entry="${fs.entry}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [following, fs.entry, fs.entries.length]);

  const sourceValue = fp.source.kind === 'device' ? 'dev:' + fp.source.deviceId : fp.source.kind;
  const chooseSource = (v: string) => {
    const next: FollowListenSource = v.startsWith('dev:')
      ? { kind: 'device', deviceId: v.slice(4) }
      : (v === 'program' || v === 'playlist' || v === 'dj' || v === 'system')
      ? { kind: v }
      : { kind: 'mic' };
    setSongFollowSource(next);
  };

  const take = () => {
    if (!fs.songId && view) selectSong(view.id);
    setLyricsProgram({ source: 'follow', wantLive: true });
  };
  const clear = () => setLyricsProgram({ wantLive: false });

  const curSongLine = following && fs.entry >= 0 ? fs.entries[fs.entry]?.songLine : undefined;
  const curSection = view && curSongLine !== undefined ? sectionOf(view, curSongLine) : null;

  const scrollToSection = (start: number) => {
    const idx = following ? fs.entries.findIndex(e => e.kind === 'song' && e.songLine === start) : start;
    listRef.current?.querySelector<HTMLElement>(`[data-entry="${idx}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const clickLine = (songLine: number) => {
    if (!view) return;
    if (following) jumpToLine(songLine);
    else selectSong(view.id, songLine);
  };

  const saveEdit = () => {
    if (!editing) return;
    const parsed = parseLyricsText(editing.text);
    if (!editing.title.trim() || !parsed.lines.length) return;
    const s = saveUserSong({ id: editing.id, title: editing.title.trim(), artist: editing.artist.trim() || undefined, ...parsed });
    if (editing.fromCapture) {
      // First time this song was sung here — from now on Ambo knows it.
      clearCaptureMarks();
      stopCapture();
      selectSong(s.id);
    }
    setEditing(null);
    setViewId(s.id);
  };

  /** IN→OUT lines → the song editor, ready to title, add [Chorus] markers and save. */
  const openCaptureDraft = () => {
    const lines = capturedLines();
    if (!lines.length) return;
    const stamp = new Date().toLocaleDateString([], { month: 'short', day: 'numeric' });
    setEditing({ title: `New song · ${stamp}`, artist: '', text: lines.join('\n'), fromCapture: true });
  };

  // ── rows for the lines column ──
  type Row = { key: string; entry: number; text: string; adlib: boolean; songLine?: number; header?: string };
  const rows: Row[] = useMemo(() => {
    if (!view) return [];
    const out: Row[] = [];
    if (following) {
      let lastSec: string | null = null;
      fs.entries.forEach((e, i) => {
        if (e.kind === 'song' && e.songLine !== undefined) {
          const sec = sectionOf(view, e.songLine);
          if (sec && sec.start === e.songLine && sec.name !== lastSec) { out.push({ key: `h${i}`, entry: -2, text: '', adlib: false, header: sec.name }); lastSec = sec.name; }
        }
        out.push({ key: `e${i}`, entry: i, text: e.text, adlib: e.kind === 'adlib', songLine: e.songLine });
      });
    } else {
      view.lines.forEach((t, i) => {
        const sec = sectionOf(view, i);
        if (sec && sec.start === i) out.push({ key: `h${i}`, entry: -2, text: '', adlib: false, header: sec.name });
        out.push({ key: `l${i}`, entry: i, text: t, adlib: false, songLine: i });
      });
    }
    return out;
  }, [view, following, fs.entries]);

  const wordsOf = (t: string) => t.split(/(\s+)/);
  const currentStyle = lyricStyleById(program.styleId);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* ── Follow bar ── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b flex-none flex-wrap" style={{ borderColor: line, background: 'rgba(255,255,255,0.02)' }}>
        <button
          onClick={() => {
            if (fs.listening) {
              stopSongFollow();
            } else {
              void startSongFollow();
              setLyricsProgram({ source: 'follow', wantLive: true });
            }
          }}
          disabled={fs.starting}
          className="px-2.5 h-7 rounded-md text-[10.5px] font-black relative overflow-hidden flex items-center gap-1.5 disabled:opacity-80 transition-all select-none"
          style={
            fs.listening
              ? { color: '#000', background: GREEN }
              : fs.starting
              ? { color: GREEN, background: 'rgba(43,224,168,0.1)', border: '1px solid rgba(43,224,168,0.4)', boxShadow: '0 0 10px rgba(43,224,168,0.2)' }
              : { color: '#fff', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }
          }
          title="Listen to the service: detect the song, follow the singing, transcribe live audio, and show on Program"
        >
          {fs.starting && (
            <>
              <div className="absolute inset-y-0 left-0 bg-[#2BE0A8]/20 w-3/4 animate-pulse pointer-events-none" />
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-black/40 pointer-events-none">
                <div className="h-full bg-[#2BE0A8] w-3/4 animate-pulse shadow-[0_0_6px_#2BE0A8]" />
              </div>
            </>
          )}
          {fs.starting ? (
            <Loader2 size={12} className="animate-spin text-[#2BE0A8] relative z-10" />
          ) : fs.listening ? (
            <Mic size={12} className="relative z-10" />
          ) : (
            <MicOff size={12} className="relative z-10" />
          )}
          <span className="relative z-10">{fs.starting ? 'Readying…' : fs.listening ? 'Listening' : 'Listen'}</span>
        </button>
        <select
          value={sourceValue}
          onChange={e => chooseSource(e.target.value)}
          className="h-7 max-w-[190px] rounded-md bg-white/5 border border-white/10 text-[10.5px] text-white px-1.5"
          title="What Song Follow listens to when no other feature already has a transcription running"
        >
          <option value="mic" className="bg-[#14101e]">Default microphone</option>
          {inputs.map(d => <option key={d.deviceId} value={'dev:' + d.deviceId} className="bg-[#14101e]">Input · {d.label}</option>)}
          <option value="playlist" className="bg-[#14101e]">Audio Playlist / Bus</option>
          <option value="dj" className="bg-[#14101e]">DJ Deck Player</option>
          <option value="program" className="bg-[#14101e]">Program mix (playback)</option>
          <option value="system" className="bg-[#14101e]">System audio (Windows)</option>
        </select>
        <div className="w-px h-5 bg-white/10" />
        <div className="flex items-center rounded-md border border-white/10 overflow-hidden">
          {(['line', 'word'] as const).map(m => (
            <button key={m} onClick={() => setSongFollowPrefs({ mode: m })}
              className={`px-2 h-6 text-[10px] font-bold ${fp.mode === m ? 'text-black bg-[#D0BCFF]' : 'text-white/55 hover:text-white'}`}>
              {m === 'line' ? 'Line' : 'Word'}
            </button>
          ))}
        </div>
        <Toggle on={fp.autoDetect} onClick={() => setSongFollowPrefs({ autoDetect: !fp.autoDetect })} title="Recognise the song from the first line or two and switch to it">Auto-detect</Toggle>
        <Toggle on={fp.adlibs} onClick={() => setSongFollowPrefs({ adlibs: !fp.adlibs })} color={ADLIB_COLOR} title="Off-script singing/speaking pauses the sync on the last word and becomes a blue adlib line">Adlibs</Toggle>
        <Toggle on={fp.followPlayback} onClick={() => setSongFollowPrefs({ followPlayback: !fp.followPlayback })} title="When a file is playing (audio playlist / DJ deck), follow it — synced lyrics follow its clock exactly">Follow playback</Toggle>
        {fp.mode === 'line' && (
          <Toggle on={fp.preRoll} onClick={() => setSongFollowPrefs({ preRoll: !fp.preRoll })} title="Bring up the next line as the last word of this one is sung">Pre-roll</Toggle>
        )}
        <Toggle
          on={cap.on}
          onClick={() => (cap.on ? stopCapture() : void startCapture())}
          color={RED}
          title="Transcribe everything heard. Mark IN when a new song starts and OUT when it ends, then save it — next time Ambo will know it."
        >
          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: cap.on ? RED : 'rgba(255,255,255,0.4)' }} />Transcribe new song</span>
        </Toggle>
        <Toggle
          on={typo.prefs.sendLyrics}
          onClick={() => setTypoTextPrefs({ sendLyrics: !typo.prefs.sendLyrics })}
          color="#ff7aa8"
          title="Feed the line being sung to typographic visualizers"
        >
          <span className="inline-flex items-center gap-1"><Sparkles size={10} />Send to visualizer</span>
        </Toggle>
        <div className="flex-1" />
        <button
          onClick={() => window.open('/worship-gallery.html', '_blank', 'noopener')}
          className="h-7 px-2.5 rounded-md bg-[#E5B84B]/15 hover:bg-[#E5B84B]/25 border border-[#E5B84B]/45 text-[10.5px] font-bold text-[#FFE399] flex items-center gap-1.5 transition-all"
          title="Open the interactive 72 Sanctuary Worship, Uptempo Praise/Hymnal & Scripture Reading Visualizer Gallery"
        >
          <Sparkles size={12} />
          <span>72 Worship Gallery</span>
        </button>
        <button
          onClick={() => setGalleryOpen(true)}
          className="h-7 px-2.5 rounded-md bg-white/5 hover:bg-white/10 border border-[#D0BCFF]/30 text-[10.5px] font-bold text-[#D0BCFF] flex items-center gap-1.5 transition-all"
          title="Choose Lyric Slide Template in the unified Slide Template Gallery"
        >
          <LayoutTemplate size={12} />
          <span className="truncate max-w-[160px]">Template · {currentStyle.name}</span>
        </button>
        {onProgram ? (
          <button onClick={clear} className="px-3 h-7 rounded-md text-[10.5px] font-bold text-white bg-white/10 hover:bg-white/20 border border-white/15">Clear lyrics</button>
        ) : (
          <button onClick={take} disabled={!view && !fs.songId && !fs.playback && !fs.listening}
            className="px-3 h-7 rounded-md text-[10.5px] font-black text-black hover:brightness-110 disabled:opacity-30" style={{ background: ORANGE }}
            title="Put the followed lyrics on Program">
            Take to Program
          </button>
        )}
      </div>

      {/* ── Status strip ── */}
      <div className="flex items-center gap-3 px-3 py-1 border-b flex-none text-[10px]" style={{ borderColor: line, background: 'rgba(0,0,0,0.25)' }}>
        {onProgram && <span className="px-1.5 py-0.5 rounded text-[8.5px] font-black text-black" style={{ background: ORANGE }}>ON PROGRAM</span>}
        {fs.playback ? (
          <span className="text-white/70 truncate"><Radio size={10} className="inline mr-1" style={{ color: GREEN }} />
            Playing {fs.playback.source === 'dj' ? 'DJ deck' : 'audio playlist'}: <b className="text-white">{fs.playback.title}</b>
            {fs.playback.synced ? ' · synced lyrics (exact timing)' : fs.songId ? ' · following by ear' : ' · no lyrics found — listening'}
          </span>
        ) : fs.title ? (
          <span className="text-white/70 truncate"><Music size={10} className="inline mr-1" style={{ color: LILAC }} />
            Following <b className="text-white">{fs.title}</b>{fs.artist ? ` · ${fs.artist}` : ''}{curSection ? ` · ${curSection.name}` : ''}
          </span>
        ) : (
          <span className="text-white/40">{fs.listening ? 'Listening for a song… sing or play the first line or two.' : 'Pick a song, or press Listen and let Ambo detect it.'}</span>
        )}
        {fs.offScript && <span className="px-1.5 py-0.5 rounded text-[8.5px] font-black" style={{ color: '#000', background: ADLIB_COLOR }}>ADLIB · holding on last word</span>}
        {fs.sharedWith.length > 0 && <span className="text-white/35 whitespace-nowrap">sharing mic with {fs.sharedWith.join(', ')}</span>}
        {fs.error && <span className="text-[#F5C542] truncate">{fs.error}</span>}
        <div className="flex-1 min-w-0 text-right text-white/45 truncate italic" title="What the transcription heard">{fs.heard ? `“${fs.heard}”` : ''}</div>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* ── Songs (like books) ── */}
        <div className="w-60 border-r flex flex-col flex-none min-h-0" style={{ borderColor: line, background: 'rgba(0,0,0,0.2)' }}>
          <div className="p-2 flex flex-col gap-1.5 flex-none">
            <div className="flex items-center gap-1.5">
              <div className="flex-1 flex items-center gap-1.5 h-7 px-2 rounded-md bg-white/5 border border-white/10">
                <Search size={11} className="text-white/40" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Title, artist or a lyric…"
                  className="flex-1 min-w-0 bg-transparent text-[10.5px] text-white outline-hidden" />
              </div>
              <button onClick={() => setEditing({ title: '', artist: '', text: '' })} title="New song (paste lyrics)"
                className="h-7 w-7 rounded-md flex items-center justify-center text-white/70 bg-white/5 border border-white/10 hover:bg-white/15"><Plus size={13} /></button>
            </div>
            <div className="flex gap-1">
              {FILTERS.map(f => (
                <button key={f.id} onClick={() => setFilter(f.id)}
                  className={`flex-1 h-5 rounded text-[9px] font-bold ${filter === f.id ? 'text-black bg-[#D0BCFF]' : 'text-white/50 bg-white/5 hover:text-white'}`}>{f.label}</button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-1.5 pb-2 custom-scrollbar">
            {songs.map(s => {
              const isFollow = s.id === fs.songId;
              return (
                <div key={s.id}
                  onClick={() => { setViewId(s.id); selectSong(s.id); }}
                  onDoubleClick={() => selectSong(s.id)}
                  title="Click to view · double-click to follow"
                  className={`group px-2 py-1.5 rounded-lg cursor-pointer flex items-center gap-2 ${viewId === s.id ? 'bg-white/12' : 'hover:bg-white/5'}`}
                  style={viewId === s.id ? { background: 'rgba(255,255,255,0.1)' } : undefined}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold text-white truncate">{s.title}</div>
                    <div className="text-[9px] text-white/40 truncate">{s.artist || (s.source === 'builtin' ? 'Hymn · public domain' : s.source === 'chora' ? 'Chora' : 'My song')} · {s.lines.length} lines</div>
                  </div>
                  {isFollow && <span className="px-1 py-0.5 rounded text-[7.5px] font-black text-black" style={{ background: onProgram ? ORANGE : GREEN }}>{onProgram ? 'LIVE' : 'FOLLOW'}</span>}
                </div>
              );
            })}
            {!songs.length && <div className="px-2 py-4 text-[10px] text-white/35 text-center">No songs match.</div>}
          </div>
          {fs.detections.length > 0 && (
            <div className="border-t p-2 flex-none" style={{ borderColor: line }}>
              <div className="text-[8.5px] font-extrabold uppercase tracking-wider text-white/35 mb-1 flex items-center gap-1"><Wand2 size={9} />Detected</div>
              {fs.detections.slice(0, 4).map(d => (
                <div key={d.at} className="text-[9.5px] text-white/60 truncate">
                  <span className="text-white/35">{new Date(d.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>{' '}
                  {d.title} <span className="text-white/30">· {d.via === 'audio' ? 'heard' : d.via === 'file' ? 'file' : 'title'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Sections (like chapters) ── */}
        {view && !editing && !cap.on && (
          <div className="w-36 border-r flex-none overflow-y-auto p-1.5 custom-scrollbar" style={{ borderColor: line, background: 'rgba(0,0,0,0.12)' }}>
            <div className="text-[8.5px] font-extrabold uppercase tracking-wider text-white/35 px-1 mb-1">Sections</div>
            {view.sections.map(sec => {
              const active = curSection?.start === sec.start;
              return (
                <button key={sec.start}
                  onClick={() => scrollToSection(sec.start)}
                  onDoubleClick={() => clickLine(sec.start)}
                  title="Click to scroll · double-click to put its first line up"
                  className={`w-full text-left px-2 py-1 rounded-md text-[10.5px] font-medium truncate ${active ? 'text-black font-bold' : 'text-white/65 hover:text-white hover:bg-white/5'}`}
                  style={active ? { background: LILAC } : undefined}
                >{sec.name}</button>
              );
            })}
          </div>
        )}

        {/* ── Lines (like verses) / editor ── */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0" style={{ background: 'rgba(5,3,9,0.7)' }}>
          {editing ? (
            <div className="flex-1 flex flex-col gap-2 p-3 min-h-0">
              <div className="flex items-center gap-2">
                <input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="Song title"
                  className="flex-1 h-8 rounded-md bg-white/5 border border-white/10 text-[12px] font-bold text-white px-2" />
                <input value={editing.artist} onChange={e => setEditing({ ...editing, artist: e.target.value })} placeholder="Artist / author"
                  className="w-48 h-8 rounded-md bg-white/5 border border-white/10 text-[11px] text-white px-2" />
              </div>
              <textarea value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value })}
                placeholder={'Paste lyrics. Section markers are understood:\n\n[Verse 1]\nAmazing grace, how sweet the sound\nThat saved a wretch like me\n\n[Chorus]\n…'}
                className="flex-1 min-h-0 rounded-md bg-black/40 border border-white/10 text-[11.5px] leading-relaxed text-white p-2 font-mono resize-none" />
              <div className="flex items-center gap-2">
                <span className="text-[9.5px] text-white/40 flex-1">
                  {(() => { const p = parseLyricsText(editing.text); return `${p.lines.length} lines · ${p.sections.length} sections`; })()}
                  {editing.fromCapture && ' · from the live transcript — fix any misheard words, add [Verse]/[Chorus] markers, then save'}
                </span>
                <button onClick={() => setEditing(null)} className="px-3 h-7 rounded-md text-[10.5px] font-bold text-white/70 bg-white/5 border border-white/10 flex items-center gap-1"><X size={11} />Cancel</button>
                <button onClick={saveEdit} className="px-3 h-7 rounded-md text-[10.5px] font-black text-black flex items-center gap-1" style={{ background: LILAC }}><Check size={11} />Save song</button>
              </div>
            </div>
          ) : cap.on ? (
            <>
              {/* ── Transcribe: every word heard, IN / OUT marks, save as a new song ── */}
              <div className="flex items-center gap-2 px-3 py-1.5 border-b flex-none flex-wrap" style={{ borderColor: line }}>
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-white">
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: fs.listening ? RED : 'rgba(255,255,255,0.3)' }} />
                  Transcribing {fs.listening ? '' : '(not listening — press Listen)'}
                </span>
                <div className="flex-1" />
                <button onClick={() => markCaptureIn()} title="The new song starts now (or with the phrase that just ended)"
                  className="px-2.5 h-7 rounded-md text-[10.5px] font-black text-black" style={{ background: GREEN }}>
                  ⟦ Set IN
                </button>
                <button onClick={() => markCaptureOut()} disabled={cap.inIdx === null} title="The song ended with the phrase just sung"
                  className="px-2.5 h-7 rounded-md text-[10.5px] font-black text-black disabled:opacity-30" style={{ background: RED }}>
                  Set OUT ⟧
                </button>
                <button onClick={openCaptureDraft} disabled={cap.inIdx === null}
                  title="Open the IN→OUT lines in the song editor to name and save"
                  className="px-2.5 h-7 rounded-md text-[10.5px] font-black text-black disabled:opacity-30" style={{ background: LILAC }}>
                  Save as song…
                </button>
                <button onClick={clearCapture} title="Clear the transcript" className="px-2 h-7 rounded-md text-[10px] font-bold text-white/60 bg-white/5 border border-white/10 hover:text-white">Clear</button>
              </div>
              <div className="px-3 py-1 text-[9.5px] text-white/40 border-b flex-none" style={{ borderColor: line }}>
                {cap.inIdx === null
                  ? 'Press Set IN when the new song begins. Click any line to move IN there; Shift-click to move OUT.'
                  : `${capturedLines().length} lines marked${cap.outIdx === null ? ' — still recording; press Set OUT when the song ends' : ''}. Click / Shift-click lines to adjust.`}
              </div>
              <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-0.5 custom-scrollbar">
                {cap.lines.map((l, i) => {
                  const inside = cap.inIdx !== null && i >= cap.inIdx && (cap.outIdx === null || i <= cap.outIdx);
                  return (
                    <React.Fragment key={l.at + ':' + i}>
                      {cap.inIdx === i && <div className="text-[8.5px] font-black tracking-wider pt-1" style={{ color: GREEN }}>⟦ IN</div>}
                      <div
                        onClick={e => (e.shiftKey ? markCaptureOut(i) : markCaptureIn(i))}
                        title="Click: song starts here · Shift-click: song ends here"
                        className="px-3 py-1 rounded-md text-[12px] leading-snug cursor-pointer border"
                        style={inside
                          ? { color: '#fff', background: 'rgba(43,224,168,0.08)', borderColor: 'rgba(43,224,168,0.25)' }
                          : { color: 'rgba(255,255,255,0.45)', borderColor: 'transparent' }}
                      >
                        <span className="mr-2 font-mono text-[8.5px] text-white/30">{new Date(l.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                        {l.text}
                      </div>
                      {cap.outIdx === i && <div className="text-[8.5px] font-black tracking-wider pb-1" style={{ color: RED }}>OUT ⟧</div>}
                    </React.Fragment>
                  );
                })}
                {cap.partial && (
                  <div className="px-3 py-1 text-[12px] italic text-white/70" data-entry="partial">
                    {cap.inIdx === cap.lines.length && <span className="mr-2 text-[8.5px] font-black not-italic" style={{ color: GREEN }}>⟦ IN</span>}
                    {cap.partial}<span className="animate-pulse">▍</span>
                  </div>
                )}
                {!cap.lines.length && !cap.partial && (
                  <div className="py-8 text-center text-[11px] text-white/35">Every word Ambo hears will appear here, line by line.</div>
                )}
              </div>
            </>
          ) : view ? (
            <>
              <div className="flex items-center gap-2 px-3 py-1.5 border-b flex-none" style={{ borderColor: line }}>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-bold text-white truncate">{view.title}</div>
                  <div className="text-[9.5px] text-white/40 truncate">{view.artist || ''}{view.timeCodedLyrics?.length ? ' · synced recording available' : ''}</div>
                </div>
                {sacredMeta && (
                  <>
                    <button
                      onClick={() => setShowProvenance(p => !p)}
                      className="h-6 px-2 rounded-md text-[10px] font-bold border flex items-center gap-1 transition-all"
                      style={
                        showProvenance
                          ? { color: '#E8C170', background: 'rgba(232,193,112,0.14)', borderColor: 'rgba(232,193,112,0.45)' }
                          : { color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.12)' }
                      }
                      title="Toggle Historical Provenance & SATB Accompaniment Score strip"
                    >
                      <ScrollText size={10} />
                      <span>{sacredMeta.score ? 'History & Score' : 'History & Parallel'}</span>
                    </button>
                    <button
                      onClick={() => openHymnOrPrayerInLorea(sacredMeta)}
                      className="h-6 px-2.5 rounded-md text-[10px] font-black text-black flex items-center gap-1 hover:brightness-110 transition-all"
                      style={{ background: '#E8C170' }}
                      title="Open this Hymn or Prayer in Lorea Folio with full History Essay, Parallel Ancient Text, and Accompaniment Score"
                    >
                      <BookOpen size={10} />
                      <span>Open in Lorea</span>
                    </button>
                  </>
                )}
                {!following && (
                  <button onClick={() => selectSong(view.id)} className="px-2.5 h-6 rounded-md text-[10px] font-black text-black" style={{ background: GREEN }}>Follow this song</button>
                )}
                {following && (
                  <>
                    <button onClick={() => stepLine(-1)} title="Previous line" className="h-6 w-6 rounded-md flex items-center justify-center text-white/70 bg-white/5 border border-white/10 hover:bg-white/15"><ChevronUp size={13} /></button>
                    <button onClick={() => stepLine(1)} title="Next line" className="h-6 w-6 rounded-md flex items-center justify-center text-white/70 bg-white/5 border border-white/10 hover:bg-white/15"><ChevronDown size={13} /></button>
                    {fs.entries.some(e => e.kind === 'adlib') && (
                      <button onClick={clearAdlibs} title="Remove the adlib lines" className="px-2 h-6 rounded-md text-[10px] font-bold flex items-center gap-1 border" style={{ color: ADLIB_COLOR, borderColor: `${ADLIB_COLOR}55` }}><Eraser size={11} />Clear adlibs</button>
                    )}
                  </>
                )}
                {view.source === 'user' && (
                  <>
                    <button onClick={() => setEditing({ id: view.id, title: view.title, artist: view.artist || '', text: songToText(view) })} title="Edit song"
                      className="h-6 w-6 rounded-md flex items-center justify-center text-white/60 bg-white/5 border border-white/10 hover:text-white"><Pencil size={11} /></button>
                    <button onClick={() => { if (confirm(`Delete “${view.title}”?`)) { if (following) selectSong(null); deleteUserSong(view.id); setViewId(null); } }} title="Delete song"
                      className="h-6 w-6 rounded-md flex items-center justify-center text-white/60 bg-white/5 border border-white/10 hover:text-[#ff6b6b]"><Trash2 size={11} /></button>
                  </>
                )}
                {view.source !== 'user' && (
                  <button onClick={() => setEditing({ title: view.title, artist: view.artist || '', text: songToText(view) })} title="Copy into My Songs to edit sections"
                    className="h-6 px-2 rounded-md text-[10px] font-bold text-white/60 bg-white/5 border border-white/10 hover:text-white flex items-center gap-1"><Pencil size={10} />Copy & edit</button>
                )}
              </div>
              {sacredMeta && showProvenance && (
                <div
                  className="px-3 py-2 border-b flex-none space-y-1.5"
                  style={{
                    borderColor: line,
                    background: 'linear-gradient(135deg, rgba(107,0,153,0.18), rgba(18,9,36,0.92))',
                  }}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#E8C170]">
                      Lorea Provenance · {sacredMeta.historyTitle}
                    </span>
                    <span className="text-[9.5px] text-white/55 font-mono">
                      {sacredMeta.year} · {sacredMeta.scriptureRefs.slice(0, 3).join(' · ')}
                    </span>
                  </div>
                  <p className="text-[10.5px] leading-snug text-white/75 line-clamp-2">
                    {sacredMeta.historyEssay}
                  </p>
                  {sacredMeta.score && (
                    <div className="flex items-center gap-2 flex-wrap pt-0.5 text-[9.5px]">
                      <span className="px-1.5 py-0.5 rounded bg-[#E8C170]/15 border border-[#E8C170]/35 text-[#FFE399] font-bold">
                        Score · {sacredMeta.score.tuneName} ({sacredMeta.score.meter} · {sacredMeta.score.timeSignature})
                      </span>
                      <span className="text-white/60">
                        Keys: <b className="text-white/85">{sacredMeta.score.availableKeys.join(' · ')}</b>
                      </span>
                      <span className="text-white/55 font-mono truncate">
                        Cadence: {sacredMeta.score.chordProgression.join(' → ')}
                      </span>
                    </div>
                  )}
                  {sacredMeta.originalStanzas && sacredMeta.originalStanzas.length > 0 && (
                    <div className="text-[10px] italic text-[#E0CEFF]/80 truncate">
                      <span className="not-italic font-bold uppercase tracking-wider text-[8.5px] text-[#E8C170] mr-1.5">
                        {sacredMeta.originalLanguage ?? 'Ancient'}:
                      </span>
                      {sacredMeta.originalStanzas[0]?.replace(/\n/g, ' / ')}
                    </div>
                  )}
                </div>
              )}
              <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
                {rows.map(r => {
                  if (r.header) {
                    return <div key={r.key} className="pt-2 pb-0.5 text-[9px] font-extrabold uppercase tracking-wider" style={{ color: LILAC }}>{r.header}</div>;
                  }
                  const isCur = following && r.entry === fs.entry;
                  const isPast = following && fs.entry >= 0 && r.entry < fs.entry;
                  const showWords = isCur && fp.mode === 'word' && !r.adlib;
                  let wi = -1;
                  return (
                    <div key={r.key}
                      data-entry={r.entry}
                      onClick={() => r.songLine !== undefined && clickLine(r.songLine)}
                      className={`px-3 py-1.5 rounded-lg border text-[12.5px] leading-snug transition-all ${r.songLine !== undefined ? 'cursor-pointer' : 'cursor-default'} ${
                        isCur ? '' : 'border-transparent hover:bg-white/5'
                      }`}
                      style={{
                        color: r.adlib ? ADLIB_COLOR : isPast ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.85)',
                        ...(isCur ? { borderColor: onProgram ? ORANGE : (r.adlib ? ADLIB_COLOR : LILAC), background: r.adlib ? `${ADLIB_COLOR}18` : 'rgba(208,188,255,0.1)' } : {}),
                        ...(r.adlib ? { fontStyle: 'italic', marginLeft: 16 } : {}),
                      }}
                      title={r.adlib ? 'Adlib — what was sung/said off script' : 'Click to put this line up'}
                    >
                      {r.adlib && <span className="mr-2 px-1 py-0.5 rounded text-[7.5px] font-black not-italic align-middle" style={{ color: '#000', background: ADLIB_COLOR }}>ADLIB</span>}
                      {showWords
                        ? wordsOf(r.text).map((w, k) => {
                            if (!w.trim()) return <span key={k}>{w}</span>;
                            wi++;
                            const lit = wi <= fs.word;
                            return <span key={k} style={{ color: lit ? '#fff' : 'rgba(255,255,255,0.45)', fontWeight: lit ? 700 : 400 }}>{w}</span>;
                          })
                        : r.text}
                      {isCur && onProgram && <span className="ml-2 px-1 py-0.5 rounded text-[7.5px] font-black text-black align-middle not-italic" style={{ background: ORANGE }}>LIVE</span>}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[11px] text-white/35 p-6 text-center">
              Pick a song — or press <b className="mx-1 text-white/60">Listen</b> and Ambo will recognise it from the first line or two.
            </div>
          )}
        </div>
      </div>
      <AmboSlideTemplateGallery
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        initialCategory="Lyrics"
        initialTemplateId={`lyrics-${program.styleId}`}
        onSelectLyricStyle={styleId => setLyricsProgram({ styleId })}
        onInsert={onInsertSlide}
        activeShowTitle={activeShowTitle}
      />
    </div>
  );
};

export default AmboSongLyricsTab;
