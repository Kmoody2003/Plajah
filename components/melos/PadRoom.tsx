/**
 * Melos › Pad — the writing room. Paper tier.
 *
 * Upgraded with:
 * - Full-Song Copy & Paste with Auto Block-Breakdown & Interactive Preview Modal
 * - Highly visual lyric blocks powered by the Tela Document Engine (bidirectional sync)
 * - Inline Sheet Music Composer & Engraved Score (<SheetMusic /> + Web Audio playback + MusicXML export)
 * - Audio Drag-and-Drop / Import + Inline Backing Track / Takes Player + Arrangement assignment
 * - Dedicated Mobile Layout (vp.isPhone)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, GripVertical, Lock, Unlock, Copy, Trash2, Check, ChevronDown, LayoutPanelTop,
  ClipboardPaste, Music, Upload, Play, Pause, RefreshCw, ArrowUp, ArrowDown,
  Scissors, Merge, Download, Sparkles, Volume2, Drum, Layers, FileText, X, Disc3,
} from 'lucide-react';
import { useMelos, Label, Hearts } from './MelosWorkspace';
import {
  LyricBlock, BlockKind, BLOCK_KINDS, blockMeta, SONG_STATES, COMMITMENTS,
  stateMeta, commitmentMeta, moveBlock, duplicateBlock, autoLabelBlocks,
  syllables, uid, suggestConfidence, parseLyrics, SongSheetNote, fmtDuration,
} from '../../services/melosService';
import {
  openMelosSongInTela,
  syncMelosSongToTelaDoc,
  pullTelaSongUpdatesIfNewer,
} from '../../services/telaDomainAdapters';
import { auth } from '../../services/firebase';
import { useViewport } from '../../hooks/useViewport';
import SheetMusic from '../SheetMusic';
import { buildNotation, notationToMusicXML, type NInputNote } from '../../services/musicNotation';
import type { Transcription } from '../../services/audioTranscription';
import { isAudioFile } from './melosAudioImport';

// ─── Helpers for Rhyme & Sheet Music ────────────────────────────────────────

function lastWordSound(line: string): string {
  const clean = line.trim().replace(/[^a-zA-Z\s']/g, '').toLowerCase();
  const words = clean.split(/\s+/).filter(Boolean);
  const last = words[words.length - 1] || '';
  if (!last) return '';
  const m = last.match(/[aeiouy][a-z]*$/);
  return m ? m[0].slice(0, 4) : last.slice(-3);
}

const RHYME_COLORS = [
  '#F59E0B', '#06D6A0', '#38BDF8', '#EC4899', '#A78BFA', '#FB7185', '#34D399', '#FBBF24',
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

const DURATION_OPTIONS: { label: string; beats: number; short: string }[] = [
  { label: 'Whole', beats: 4, short: '1/1' },
  { label: 'Half', beats: 2, short: '1/2' },
  { label: 'Quarter', beats: 1, short: '1/4' },
  { label: 'Eighth', beats: 0.5, short: '1/8' },
  { label: '16th', beats: 0.25, short: '1/16' },
];

const KEY_FIFTHS_MAP: Record<string, { key: string; mode: 'major' | 'minor'; fifths: number; rootMidi: number }> = {
  'C':  { key: 'C',  mode: 'major', fifths: 0,  rootMidi: 60 },
  'Am': { key: 'A',  mode: 'minor', fifths: 0,  rootMidi: 57 },
  'G':  { key: 'G',  mode: 'major', fifths: 1,  rootMidi: 67 },
  'Em': { key: 'E',  mode: 'minor', fifths: 1,  rootMidi: 64 },
  'D':  { key: 'D',  mode: 'major', fifths: 2,  rootMidi: 62 },
  'Bm': { key: 'B',  mode: 'minor', fifths: 2,  rootMidi: 59 },
  'F':  { key: 'F',  mode: 'major', fifths: -1, rootMidi: 65 },
  'Dm': { key: 'D',  mode: 'minor', fifths: -1, rootMidi: 62 },
  'Bb': { key: 'Bb', mode: 'major', fifths: -2, rootMidi: 70 },
  'Gm': { key: 'G',  mode: 'minor', fifths: -2, rootMidi: 67 },
  'Eb': { key: 'Eb', mode: 'major', fifths: -3, rootMidi: 63 },
  'Cm': { key: 'C',  mode: 'minor', fifths: -3, rootMidi: 60 },
  'A':  { key: 'A',  mode: 'major', fifths: 3,  rootMidi: 69 },
  'F#m':{ key: 'F#', mode: 'minor', fifths: 3,  rootMidi: 66 },
  'E':  { key: 'E',  mode: 'major', fifths: 4,  rootMidi: 64 },
  'C#m':{ key: 'C#', mode: 'minor', fifths: 4,  rootMidi: 61 },
};

function parseChordRootMidi(token: string, octave = 3): { root: number; third: number; fifth: number } | null {
  const m = token.trim().match(/^([A-G])(#|b)?(m|maj|min|dim|sus|7|9|add)*$/i);
  if (!m) return null;
  const baseMap: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let semi = baseMap[m[1].toUpperCase()] ?? 0;
  if (m[2] === '#') semi += 1;
  if (m[2] === 'b') semi -= 1;
  const root = (octave + 1) * 12 + ((semi + 12) % 12);
  const isMinor = /m(?!aj)/i.test(token);
  return {
    root,
    third: root + (isMinor ? 3 : 4),
    fifth: root + 7,
  };
}

function autoBuildSheetNotesFromSong(blocks: LyricBlock[], keyStr?: string): SongSheetNote[] {
  const keyInfo = KEY_FIFTHS_MAP[keyStr || 'C'] || KEY_FIFTHS_MAP['C'];
  const scaleOffsets = keyInfo.mode === 'minor' ? [0, 2, 3, 5, 7, 8, 10, 12] : [0, 2, 4, 5, 7, 9, 11, 12];
  const notes: SongSheetNote[] = [];
  let beatCursor = 0;

  // Gather chords across blocks or default progression
  const rawChords: string[] = [];
  blocks.forEach((b) => {
    if (b.chords) {
      b.chords.split(/[\s,|·–-]+/).filter(Boolean).forEach((c) => rawChords.push(c));
    }
  });
  const chordList = rawChords.length > 0 ? rawChords : (keyInfo.mode === 'minor' ? ['Am', 'F', 'C', 'G'] : ['C', 'G', 'Am', 'F']);

  // Extract words from lyrics for melody notes
  const words: string[] = [];
  blocks.forEach((b) => {
    b.lines.forEach((line) => {
      line.trim().split(/\s+/).filter(Boolean).forEach((w) => words.push(w));
    });
  });

  const targetMeasures = Math.max(4, Math.min(12, Math.ceil((words.length || 16) / 4)));
  let wordIdx = 0;

  for (let m = 0; m < targetMeasures; m++) {
    const measureStart = m * 4;
    const chordSym = chordList[m % chordList.length];
    const parsedChord = parseChordRootMidi(chordSym, 3) || {
      root: keyInfo.rootMidi - 12,
      third: keyInfo.rootMidi - 8,
      fifth: keyInfo.rootMidi - 5,
    };

    // Bass / harmony half-note chords on beat 0 and beat 2
    notes.push(
      { id: uid('sn'), midi: parsedChord.root, startBeat: measureStart, durBeats: 2, voice: 'bass', lyric: chordSym },
      { id: uid('sn'), midi: parsedChord.fifth, startBeat: measureStart, durBeats: 2, voice: 'bass' },
      { id: uid('sn'), midi: parsedChord.root, startBeat: measureStart + 2, durBeats: 2, voice: 'bass' },
      { id: uid('sn'), midi: parsedChord.third, startBeat: measureStart + 2, durBeats: 2, voice: 'bass' },
    );

    // Melody notes across the 4 beats of the measure
    for (let b = 0; b < 4; b++) {
      const deg = (m * 2 + b) % scaleOffsets.length;
      const midi = keyInfo.rootMidi + scaleOffsets[deg];
      const lyricWord = words[wordIdx] ? words[wordIdx++] : undefined;
      notes.push({
        id: uid('sn'),
        midi,
        startBeat: measureStart + b,
        durBeats: 1,
        voice: 'melody',
        lyric: lyricWord,
      });
    }
    beatCursor = (m + 1) * 4;
  }
  void beatCursor;
  return notes;
}

// ─── Component ──────────────────────────────────────────────────────────────

const PadRoom: React.FC = () => {
  const {
    prodId, production, songs, arrangements, selectedSong, selectedSongId,
    selectSong, editSong, addSong, goRoom,
    importAudioToSong, importAudioFilesAsSongs, addSongToArrangement, openInMasteringDesk,
  } = useMelos();
  const vp = useViewport();

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [kindMenu, setKindMenu] = useState<string | null>(null);
  const [openingTela, setOpeningTela] = useState(false);
  const [telaSyncedAt, setTelaSyncedAt] = useState<number | null>(null);
  const [padMode, setPadMode] = useState<'lyrics' | 'score' | 'split'>('lyrics');
  const [mobileTab, setMobileTab] = useState<'write' | 'score' | 'audio' | 'details' | 'songs'>('write');
  const [isDraggingAudio, setIsDraggingAudio] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);

  // Full-song paste & breakdown preview modal state
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [rawPasteText, setRawPasteText] = useState('');
  const [previewBlocks, setPreviewBlocks] = useState<LyricBlock[]>([]);
  const [pasteMode, setPasteMode] = useState<'replace' | 'append'>('replace');

  // Inline audio player state for backing track / takes
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingAudioUrl, setPlayingAudioUrl] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioProgressSec, setAudioProgressSec] = useState(0);
  const [audioDurationSec, setAudioDurationSec] = useState(0);

  // Sheet Music interactive composer state
  const [notePitchIdx, setNotePitchIdx] = useState<number>(0); // C
  const [noteOctave, setNoteOctave] = useState<number>(4);
  const [noteDurBeats, setNoteDurBeats] = useState<number>(1);
  const [noteVoice, setNoteVoice] = useState<'melody' | 'bass'>('melody');
  const [noteLyric, setNoteLyric] = useState<string>('');
  const [isRestMode, setIsRestMode] = useState<boolean>(false);
  const [scorePlaying, setScorePlaying] = useState(false);
  const [scoreBeat, setScoreBeat] = useState<number | undefined>(undefined);
  const scoreTimerRef = useRef<number | null>(null);
  const scoreAudioCtxRef = useRef<AudioContext | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef<Record<string, string>>({});

  // Clear local textarea draft cache when switching songs
  useEffect(() => {
    draftRef.current = {};
  }, [selectedSongId]);

  // ── Bidirectional Tela Sync ────────────────────────────────────────────────
  // 1) Pull from Tela if the document was edited in Tela Studio
  const checkTelaUpdates = useCallback(async () => {
    if (!selectedSong) return;
    const patch = await pullTelaSongUpdatesIfNewer(prodId, selectedSong);
    if (patch) {
      draftRef.current = {};
      editSong(selectedSong.id, patch);
      setTelaSyncedAt(Date.now());
    }
  }, [prodId, selectedSong, editSong]);

  useEffect(() => {
    void checkTelaUpdates();
    const onFocus = () => { void checkTelaUpdates(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [checkTelaUpdates]);

  // 2) Auto-push Pad changes to Tela document engine (debounced)
  useEffect(() => {
    if (!selectedSong) return;
    const t = window.setTimeout(() => {
      void syncMelosSongToTelaDoc(prodId, selectedSong, songs, auth.currentUser?.uid || 'local');
      setTelaSyncedAt(Date.now());
    }, 450);
    return () => window.clearTimeout(t);
  }, [prodId, selectedSong, songs]);

  // Stop score synth on unmount
  useEffect(() => {
    return () => {
      if (scoreTimerRef.current) window.clearInterval(scoreTimerRef.current);
    };
  }, []);

  const shelved = useMemo(
    () => songs.filter(s => s.commitment === 'SHELVED' || s.commitment === 'CUT'),
    [songs],
  );
  const active = useMemo(
    () => songs.filter(s => s.commitment !== 'SHELVED' && s.commitment !== 'CUT'),
    [songs],
  );

  // Open Full-Song Breakdown Preview with raw text
  const openPasteBreakdown = useCallback((text: string, defaultMode: 'replace' | 'append' = 'replace') => {
    setRawPasteText(text);
    const parsed = parseLyrics(text);
    setPreviewBlocks(parsed);
    setPasteMode(defaultMode);
    setPasteModalOpen(true);
  }, []);

  if (!selectedSong) {
    return (
      <div className="h-full flex items-center justify-center p-10 text-center">
        <div>
          <p className="text-sm m-0" style={{ color: 'var(--mel-dim)' }}>Nothing here yet.</p>
          <button
            onClick={addSong}
            className="mt-4 px-4 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-[0.16em]"
            style={{ background: 'var(--mel-accent)', color: '#12101A', border: 0 }}
          >Start the first song</button>
        </div>
      </div>
    );
  }

  const song = selectedSong;
  const blocks = song.lyrics || [];

  // Build rhyme color map across current song lines
  const rhymeColorMap = useMemo(() => {
    const counts = new Map<string, number>();
    blocks.forEach(b => b.lines.forEach(l => {
      const s = lastWordSound(l);
      if (s.length >= 2) counts.set(s, (counts.get(s) || 0) + 1);
    }));
    const map = new Map<string, string>();
    let idx = 0;
    counts.forEach((count, sound) => {
      if (count >= 2) {
        map.set(sound, RHYME_COLORS[idx % RHYME_COLORS.length]);
        idx++;
      }
    });
    return map;
  }, [blocks]);

  const writeBlocks = (next: LyricBlock[]) => {
    draftRef.current = {};
    editSong(song.id, { lyrics: next, updatedAt: Date.now() });
  };

  const addBlock = (kind: BlockKind = 'VERSE') =>
    writeBlocks(autoLabelBlocks([...blocks, { id: uid('lb'), kind, lines: [''] }]));

  const setBlock = (id: string, patch: Partial<LyricBlock>) => {
    const next = blocks.map(b => (b.id === id ? { ...b, ...patch } : b));
    editSong(song.id, { lyrics: next, updatedAt: Date.now() });
  };

  const dropBlock = (id: string) => {
    delete draftRef.current[id];
    writeBlocks(blocks.filter(b => b.id !== id));
  };

  const splitBlockAtHalf = (idx: number) => {
    const target = blocks[idx];
    if (!target || target.lines.length < 2) return;
    const mid = Math.ceil(target.lines.length / 2);
    const first: LyricBlock = { ...target, lines: target.lines.slice(0, mid) };
    const second: LyricBlock = {
      id: uid('lb'),
      kind: target.kind,
      chords: target.chords,
      lines: target.lines.slice(mid),
    };
    const next = [...blocks.slice(0, idx), first, second, ...blocks.slice(idx + 1)];
    writeBlocks(autoLabelBlocks(next));
  };

  const mergeWithNextBlock = (idx: number) => {
    if (idx < 0 || idx >= blocks.length - 1) return;
    const curr = blocks[idx];
    const nextBlk = blocks[idx + 1];
    const merged: LyricBlock = {
      ...curr,
      chords: [curr.chords, nextBlk.chords].filter(Boolean).join(' · ') || undefined,
      lines: [...curr.lines, ...nextBlk.lines],
    };
    const next = [...blocks.slice(0, idx), merged, ...blocks.slice(idx + 2)];
    writeBlocks(autoLabelBlocks(next));
  };

  const onDropBlock = (to: number) => {
    if (dragIdx === null) return;
    writeBlocks(moveBlock(blocks, dragIdx, to));
    setDragIdx(null);
    setOverIdx(null);
  };

  // ── Audio Playback & Drop Handlers ─────────────────────────────────────────
  const primaryAudioUrl = song.trackRef?.url || song.takes?.find(t => !!t.url)?.url || null;
  const primaryAudioLabel = song.trackRef?.title || song.takes?.find(t => !!t.url)?.label || 'Backing Track';

  const togglePlayAudio = (url: string) => {
    if (!audioRef.current) return;
    if (playingAudioUrl === url && isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
      return;
    }
    if (playingAudioUrl !== url) {
      audioRef.current.src = url;
      setPlayingAudioUrl(url);
    }
    void audioRef.current.play().then(() => setIsPlayingAudio(true)).catch(() => setIsPlayingAudio(false));
  };

  const handleAudioDrop = async (files: FileList | File[]) => {
    const list = Array.from(files).filter(isAudioFile);
    if (!list.length) return;
    setUploadingAudio(true);
    try {
      await importAudioToSong(song.id, list[0]);
      if (list.length > 1) {
        await importAudioFilesAsSongs(list.slice(1));
      }
    } finally {
      setUploadingAudio(false);
    }
  };

  // ── Sheet Music Notation Builder & Playback ────────────────────────────────
  const sheetNotes: SongSheetNote[] = useMemo(() => {
    if (song.sheetNotes && song.sheetNotes.length > 0) return song.sheetNotes;
    return autoBuildSheetNotesFromSong(blocks, song.keySig || song.feel?.keySig);
  }, [song.sheetNotes, blocks, song.keySig, song.feel?.keySig]);

  const notation = useMemo(() => {
    const keyInfo = KEY_FIFTHS_MAP[song.keySig || song.feel?.keySig || 'C'] || KEY_FIFTHS_MAP['C'];
    const [beatsNum, beatDen] = (song.timeSig || '4/4').split('/').map(Number);
    const maxBeat = sheetNotes.reduce((m, n) => Math.max(m, n.startBeat + n.durBeats), 16);
    const bpm = song.tempo || song.feel?.bpm || 96;
    const t: Transcription = {
      bpm,
      firstBeatSec: 0,
      key: keyInfo.key,
      mode: keyInfo.mode,
      keyFifths: keyInfo.fifths,
      beatsPerMeasure: beatsNum || 4,
      beatUnit: beatDen || 4,
      durationSec: (maxBeat * 60) / bpm,
      confidence: 1,
      backend: 'poly-dsp',
      polyphonic: true,
      notes: sheetNotes.map(n => ({
        midi: n.midi,
        startBeat: n.startBeat,
        durBeats: n.durBeats,
        startSec: (n.startBeat * 60) / bpm,
        durSec: (n.durBeats * 60) / bpm,
        velocity: 0.82,
        voice: n.voice || 'melody',
      })),
    };
    const inputNotes: NInputNote[] = sheetNotes.map(n => ({
      midi: n.midi,
      startBeat: n.startBeat,
      durBeats: n.durBeats,
      voice: n.voice || 'melody',
      lyric: n.lyric,
    }));
    return buildNotation(t, [
      { label: 'Vocal / Lead', clef: 'treble', voice: 'melody', notes: inputNotes.filter(x => x.voice === 'melody') },
      { label: 'Harmony / Bass', clef: 'bass', voice: 'bass', notes: inputNotes.filter(x => x.voice === 'bass') },
    ]);
  }, [sheetNotes, song.keySig, song.feel?.keySig, song.timeSig, song.tempo, song.feel?.bpm]);

  const appendSheetNote = () => {
    const voiceNotes = sheetNotes.filter(n => n.voice === noteVoice);
    const nextStartBeat = voiceNotes.reduce((m, n) => Math.max(m, n.startBeat + n.durBeats), 0);
    if (isRestMode) {
      const restBump: SongSheetNote = {
        id: uid('sn'),
        midi: noteVoice === 'melody' ? 60 : 48,
        startBeat: nextStartBeat + noteDurBeats,
        durBeats: noteDurBeats,
        voice: noteVoice,
        lyric: noteLyric.trim() || undefined,
      };
      editSong(song.id, { sheetNotes: [...sheetNotes, restBump] });
      setNoteLyric('');
      return;
    }
    const midi = (noteOctave + 1) * 12 + notePitchIdx;
    const newNote: SongSheetNote = {
      id: uid('sn'),
      midi,
      startBeat: nextStartBeat,
      durBeats: noteDurBeats,
      voice: noteVoice,
      lyric: noteLyric.trim() || undefined,
    };
    editSong(song.id, { sheetNotes: [...sheetNotes, newNote] });
    setNoteLyric('');
  };

  const togglePlayScore = () => {
    if (scorePlaying) {
      if (scoreTimerRef.current) window.clearInterval(scoreTimerRef.current);
      scoreTimerRef.current = null;
      setScorePlaying(false);
      setScoreBeat(undefined);
      return;
    }
    const CtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = scoreAudioCtxRef.current || new CtxClass();
    scoreAudioCtxRef.current = ctx;
    if (ctx.state === 'suspended') void ctx.resume();

    const bpm = song.tempo || song.feel?.bpm || 96;
    const maxBeat = Math.max(8, sheetNotes.reduce((m, n) => Math.max(m, n.startBeat + n.durBeats), 8));
    const startWall = performance.now();
    const triggered = new Set<string>();

    setScorePlaying(true);
    setScoreBeat(0);

    scoreTimerRef.current = window.setInterval(() => {
      const elapsedSec = (performance.now() - startWall) / 1000;
      const beat = (elapsedSec * bpm) / 60;
      if (beat >= maxBeat) {
        if (scoreTimerRef.current) window.clearInterval(scoreTimerRef.current);
        scoreTimerRef.current = null;
        setScorePlaying(false);
        setScoreBeat(undefined);
        return;
      }
      setScoreBeat(beat);
      sheetNotes.forEach((n, idx) => {
        const key = n.id || `${idx}_${n.startBeat}_${n.midi}`;
        if (!triggered.has(key) && beat >= n.startBeat && beat < n.startBeat + 0.35) {
          triggered.add(key);
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = n.voice === 'melody' ? 'triangle' : 'sine';
          osc.frequency.value = 440 * Math.pow(2, (n.midi - 69) / 12);
          const durSec = Math.max(0.12, (n.durBeats * 60) / bpm);
          const now = ctx.currentTime;
          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(n.voice === 'melody' ? 0.14 : 0.09, now + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0008, now + durSec);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + durSec + 0.02);
        }
      });
    }, 35);
  };

  const exportMusicXml = () => {
    const xml = notationToMusicXML(
      notation,
      song.title || 'Untitled Song',
      production?.artistName || 'Artist',
      { composer: production?.artistName || 'Artist' },
    );
    const blob = new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(song.title || 'song').replace(/[^a-z0-9-_]+/gi, '_')}.musicxml`;
    a.click();
  };

  // ── Sub-renderers ──────────────────────────────────────────────────────────

  const renderSongRail = () => (
    <aside className={`${vp.isPhone ? 'h-full overflow-y-auto p-4' : 'melos-rail border-r overflow-y-auto p-4'} flex flex-col gap-1`}>
      <div className="flex items-center justify-between mb-2">
        <Label>Songs · {active.length}</Label>
        <button
          onClick={() => { addSong(); if (vp.isPhone) setMobileTab('write'); }}
          className="px-2 py-1 rounded-lg text-[9.5px] font-bold uppercase tracking-wider flex items-center gap-1"
          style={{ background: 'var(--mel-hover)', color: 'var(--mel-accent)', border: 0 }}
        ><Plus size={10} />New</button>
      </div>
      {active.map(s => {
        const on = s.id === selectedSongId;
        const hasAudio = !!(s.trackRef?.url || s.takes?.some(t => !!t.url));
        return (
          <button
            key={s.id}
            onClick={() => { selectSong(s.id); if (vp.isPhone) setMobileTab('write'); }}
            className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-[10px] text-left transition-colors w-full"
            style={{
              background: on ? 'var(--mel-hover)' : 'transparent',
              boxShadow: on ? 'inset 2px 0 0 var(--mel-accent)' : 'none',
              border: 0,
            }}
          >
            <i className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: stateMeta(s.state).color }} />
            <span
              className="text-[12.5px] flex-1 truncate"
              style={{ color: 'var(--mel-ink)', fontWeight: on ? 650 : 500 }}
            >{s.title}</span>
            {hasAudio && <Volume2 size={11} style={{ color: 'var(--mel-accent)' }} className="shrink-0 opacity-80" />}
            <span className="text-[8.5px] tracking-[0.5px] shrink-0" style={{ color: 'var(--mel-faint)' }}>
              {'●'.repeat(s.love)}{'○'.repeat(5 - s.love)}
            </span>
          </button>
        );
      })}

      {shelved.length > 0 && (
        <>
          <Label className="mt-4 mb-1">Shelved · {shelved.length}</Label>
          {shelved.map(s => (
            <button
              key={s.id}
              onClick={() => { selectSong(s.id); if (vp.isPhone) setMobileTab('write'); }}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-left w-full opacity-60"
              style={{ background: s.id === selectedSongId ? 'var(--mel-hover)' : 'transparent', border: 0 }}
            >
              <i className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: commitmentMeta(s.commitment).color }} />
              <span className="text-[12.5px] flex-1 truncate" style={{ color: 'var(--mel-dim)' }}>{s.title}</span>
            </button>
          ))}
        </>
      )}
    </aside>
  );

  const renderAudioStrip = () => (
    <div
      className="rounded-2xl p-3.5 flex flex-col gap-2.5 transition-all"
      style={{
        background: isDraggingAudio ? 'rgba(244,162,97,0.12)' : 'var(--mel-card)',
        border: isDraggingAudio ? '1.5px dashed var(--mel-accent)' : '1px solid var(--mel-edge)',
      }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {primaryAudioUrl ? (
            <button
              onClick={() => togglePlayAudio(primaryAudioUrl)}
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'var(--mel-accent)', color: '#12101A', border: 0 }}
              title={isPlayingAudio ? 'Pause backing audio' : 'Play backing audio'}
            >
              {isPlayingAudio && playingAudioUrl === primaryAudioUrl ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
            </button>
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'var(--mel-hover)', color: 'var(--mel-faint)' }}
            >
              <Volume2 size={13} />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-[12px] font-semibold truncate" style={{ color: 'var(--mel-ink)' }}>
              {primaryAudioUrl ? primaryAudioLabel : 'Drop or import a reference beat, stem, or vocal take'}
            </div>
            <div className="text-[10px] flex items-center gap-2" style={{ color: 'var(--mel-faint)' }}>
              {primaryAudioUrl ? (
                <span>
                  {fmtDuration(audioProgressSec)} / {fmtDuration(audioDurationSec || song.trackRef?.durationSec || song.durationSec)}
                  {song.tempo ? ` · ${Math.round(song.tempo)} BPM` : ''}
                  {song.keySig ? ` · Key of ${song.keySig}` : ''}
                </span>
              ) : (
                <span>Supports WAV, MP3, M4A, FLAC, OGG — auto-computes tempo & energy</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            multiple
            className="hidden"
            onChange={e => {
              if (e.target.files?.length) void handleAudioDrop(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAudio}
            className="h-7 px-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
            style={{ background: 'var(--mel-hover)', color: 'var(--mel-ink)', border: '1px solid var(--mel-edge)' }}
          >
            <Upload size={11} />
            {uploadingAudio ? 'Importing…' : 'Import Audio'}
          </button>

          {arrangements.length > 0 && (
            <select
              value=""
              onChange={e => {
                if (e.target.value) addSongToArrangement(song.id, e.target.value);
              }}
              className="h-7 px-2 rounded-lg text-[10px] font-semibold outline-none"
              style={{ background: 'var(--mel-hover)', color: 'var(--mel-dim)', border: '1px solid var(--mel-edge)' }}
              aria-label="Add song to an arrangement"
            >
              <option value="">+ Add to Arrangement…</option>
              {arrangements.map(a => (
                <option key={a.id} value={a.id} style={{ background: '#141418' }}>
                  {a.name} ({a.songIds.includes(song.id) ? 'Included ✓' : `${a.songIds.length} tracks`})
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => goRoom('beats')}
            className="h-7 px-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
            style={{ background: 'rgba(208,188,255,0.12)', color: '#D0BCFF', border: '1px solid rgba(208,188,255,0.28)' }}
            title="Open this song's DAW project in Chora Studio"
          >
            <Drum size={11} />Chora Studio
          </button>
        </div>
      </div>

      {/* Takes list if multiple takes exist */}
      {(song.takes?.length || 0) > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1">
          <span className="text-[9px] uppercase tracking-wider font-bold shrink-0" style={{ color: 'var(--mel-faint)' }}>Takes:</span>
          {(song.takes || []).map(t => {
            const isCurr = playingAudioUrl === t.url && isPlayingAudio;
            return (
              <button
                key={t.id}
                onClick={() => t.url && togglePlayAudio(t.url)}
                disabled={!t.url}
                className="px-2.5 py-1 rounded-full text-[10px] flex items-center gap-1.5 shrink-0 transition-colors"
                style={{
                  background: isCurr ? 'var(--mel-accent)' : 'var(--mel-hover)',
                  color: isCurr ? '#12101A' : 'var(--mel-dim)',
                  border: 0,
                  opacity: t.url ? 1 : 0.5,
                }}
              >
                {t.url && (isCurr ? <Pause size={9} /> : <Play size={9} />)}
                <span className="truncate max-w-[140px]">{t.label}</span>
                {t.durationSec ? <span className="opacity-70 font-mono text-[9px]">{fmtDuration(t.durationSec)}</span> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderSheetMusicComposer = () => (
    <div
      className="rounded-2xl p-4 flex flex-col gap-3.5"
      style={{ background: 'var(--mel-card)', border: '1px solid var(--mel-edge)' }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Music size={15} style={{ color: 'var(--mel-accent)' }} />
          <div>
            <div className="text-[12.5px] font-bold" style={{ color: 'var(--mel-ink)' }}>
              Sheet Music Score & Lead Sheet
            </div>
            <div className="text-[10px]" style={{ color: 'var(--mel-faint)' }}>
              Grand staff engraving · Key of {song.keySig || song.feel?.keySig || 'C'} · {song.tempo || song.feel?.bpm || 96} BPM · {song.timeSig || '4/4'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={togglePlayScore}
            className="h-7 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5"
            style={{
              background: scorePlaying ? '#EF4444' : 'var(--mel-accent)',
              color: scorePlaying ? '#fff' : '#12101A',
              border: 0,
            }}
          >
            {scorePlaying ? <Pause size={11} /> : <Play size={11} />}
            {scorePlaying ? 'Stop Score' : 'Play Score'}
          </button>

          <button
            onClick={() => {
              const generated = autoBuildSheetNotesFromSong(blocks, song.keySig || song.feel?.keySig);
              editSong(song.id, { sheetNotes: generated });
            }}
            className="h-7 px-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
            style={{ background: 'var(--mel-hover)', color: 'var(--mel-ink)', border: '1px solid var(--mel-edge)' }}
            title="Auto-generate melody & harmony staves from your lyric blocks and chords"
          >
            <Sparkles size={11} style={{ color: 'var(--mel-accent)' }} />
            Sync from Lyrics & Chords
          </button>

          <button
            onClick={exportMusicXml}
            className="h-7 px-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
            style={{ background: 'var(--mel-hover)', color: 'var(--mel-dim)', border: '1px solid var(--mel-edge)' }}
            title="Download MusicXML (.musicxml) for MuseScore, Sibelius, or Finale"
          >
            <Download size={11} />MusicXML
          </button>
        </div>
      </div>

      {/* Note Entry Bar */}
      <div
        className="rounded-xl p-2.5 flex flex-col gap-2"
        style={{ background: 'var(--mel-rail)', border: '1px solid var(--mel-edge)' }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {/* Voice selector */}
          <div className="flex rounded-lg p-0.5" style={{ background: 'var(--mel-hover)' }}>
            {(['melody', 'bass'] as const).map(v => (
              <button
                key={v}
                onClick={() => setNoteVoice(v)}
                className="px-2 py-1 rounded-md text-[9.5px] font-bold uppercase tracking-wider"
                style={{
                  background: noteVoice === v ? 'var(--mel-accent)' : 'transparent',
                  color: noteVoice === v ? '#12101A' : 'var(--mel-faint)',
                  border: 0,
                }}
              >
                {v === 'melody' ? 'Treble / Vocal' : 'Bass / Chords'}
              </button>
            ))}
          </div>

          {/* Duration selector */}
          <div className="flex items-center gap-1">
            {DURATION_OPTIONS.map(d => (
              <button
                key={d.label}
                onClick={() => setNoteDurBeats(d.beats)}
                title={`${d.label} note (${d.beats} beats)`}
                className="px-2 py-1 rounded-md text-[10px] font-mono font-bold"
                style={{
                  background: noteDurBeats === d.beats ? 'var(--mel-hover)' : 'transparent',
                  color: noteDurBeats === d.beats ? 'var(--mel-accent)' : 'var(--mel-faint)',
                  border: noteDurBeats === d.beats ? '1px solid var(--mel-accent)' : '1px solid var(--mel-edge)',
                }}
              >
                {d.short}
              </button>
            ))}
          </div>

          {/* Octave selector */}
          <div className="flex items-center gap-1">
            <span className="text-[9.5px] uppercase font-bold" style={{ color: 'var(--mel-faint)' }}>Oct</span>
            {[2, 3, 4, 5].map(oct => (
              <button
                key={oct}
                onClick={() => setNoteOctave(oct)}
                className="w-6 h-6 rounded-md text-[10px] font-mono font-bold"
                style={{
                  background: noteOctave === oct ? 'var(--mel-hover)' : 'transparent',
                  color: noteOctave === oct ? 'var(--mel-ink)' : 'var(--mel-faint)',
                  border: noteOctave === oct ? '1px solid var(--mel-accent)' : '1px solid var(--mel-edge)',
                }}
              >
                {oct}
              </button>
            ))}
          </div>

          {/* Key & Tempo quick inputs */}
          <div className="flex items-center gap-1.5 ml-auto">
            <select
              value={song.keySig || 'C'}
              onChange={e => editSong(song.id, { keySig: e.target.value })}
              className="h-6 px-1.5 rounded text-[10px] outline-none"
              style={{ background: 'var(--mel-hover)', color: 'var(--mel-ink)', border: '1px solid var(--mel-edge)' }}
              title="Song key signature"
            >
              {Object.keys(KEY_FIFTHS_MAP).map(k => (
                <option key={k} value={k} style={{ background: '#141418' }}>Key: {k}</option>
              ))}
            </select>
            <input
              type="number"
              min={40}
              max={220}
              value={song.tempo || song.feel?.bpm || 96}
              onChange={e => editSong(song.id, { tempo: Number(e.target.value) || 96 })}
              className="w-14 h-6 px-1.5 rounded text-[10px] font-mono outline-none"
              style={{ background: 'var(--mel-hover)', color: 'var(--mel-ink)', border: '1px solid var(--mel-edge)' }}
              title="Tempo (BPM)"
            />
          </div>
        </div>

        {/* Pitch buttons + Lyric syllable + Add Note */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {NOTE_NAMES.map((name, idx) => {
            const activePitch = !isRestMode && notePitchIdx === idx;
            return (
              <button
                key={name}
                onClick={() => { setIsRestMode(false); setNotePitchIdx(idx); }}
                className="h-7 px-2 rounded-md text-[10.5px] font-mono font-bold transition-all"
                style={{
                  background: activePitch ? 'var(--mel-accent)' : name.includes('#') ? 'rgba(0,0,0,0.35)' : 'var(--mel-hover)',
                  color: activePitch ? '#12101A' : 'var(--mel-ink)',
                  border: '1px solid var(--mel-edge)',
                }}
              >
                {name}{noteOctave}
              </button>
            );
          })}
          <button
            onClick={() => setIsRestMode(!isRestMode)}
            className="h-7 px-2.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
            style={{
              background: isRestMode ? 'var(--mel-accent)' : 'var(--mel-hover)',
              color: isRestMode ? '#12101A' : 'var(--mel-faint)',
              border: '1px solid var(--mel-edge)',
            }}
          >
            Rest
          </button>

          <input
            value={noteLyric}
            onChange={e => setNoteLyric(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); appendSheetNote(); } }}
            placeholder="Lyric syllable…"
            className="h-7 px-2.5 rounded-md text-[11px] outline-none w-28"
            style={{ background: 'var(--mel-hover)', color: 'var(--mel-ink)', border: '1px solid var(--mel-edge)' }}
          />

          <button
            onClick={appendSheetNote}
            className="h-7 px-3 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
            style={{ background: 'var(--mel-accent)', color: '#12101A', border: 0 }}
          >
            <Plus size={11} />Add Note
          </button>

          {sheetNotes.length > 0 && (
            <button
              onClick={() => editSong(song.id, { sheetNotes: sheetNotes.slice(0, -1) })}
              className="h-7 px-2 rounded-md text-[10px] font-semibold"
              style={{ background: 'transparent', color: 'var(--mel-faint)', border: '1px solid var(--mel-edge)' }}
              title="Remove last note"
            >
              Undo Note
            </button>
          )}
          {sheetNotes.length > 0 && (
            <button
              onClick={() => editSong(song.id, { sheetNotes: [] })}
              className="h-7 px-2 rounded-md text-[10px] font-semibold"
              style={{ background: 'transparent', color: 'var(--mel-faint)', border: '1px solid var(--mel-edge)' }}
              title="Reset score"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Engraved SVG Score */}
      <div
        className="rounded-xl p-3 overflow-x-auto"
        style={{ background: '#0E0F14', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <SheetMusic
          notation={notation}
          currentBeat={scoreBeat}
          measuresPerSystem={vp.isPhone ? 2 : 4}
          color="#F3EFE6"
        />
      </div>
    </div>
  );

  const renderLyricBlocks = () => (
    <div className="flex flex-col gap-3">
      {/* Quick action banner for pasting a full song */}
      <div
        className="rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 flex-wrap"
        style={{ background: 'var(--mel-hover)', border: '1px dashed var(--mel-edge)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardPaste size={14} style={{ color: 'var(--mel-accent)' }} className="shrink-0" />
          <span className="text-[11.5px]" style={{ color: 'var(--mel-dim)' }}>
            Have a full song written? Paste it anywhere or click <b style={{ color: 'var(--mel-ink)' }}>Paste Full Song</b> to auto-break it into visual Tela blocks with a customizable preview first.
          </span>
        </div>
        <button
          onClick={async () => {
            let clip = '';
            try { clip = await navigator.clipboard.readText(); } catch { /* manual paste fallback */ }
            openPasteBreakdown(clip || '', blocks.some(b => b.lines.some(l => l.trim())) ? 'replace' : 'replace');
          }}
          className="h-7 px-3 rounded-lg text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 shrink-0"
          style={{ background: 'var(--mel-accent)', color: '#12101A', border: 0 }}
        >
          <ClipboardPaste size={11} />Paste Full Song
        </button>
      </div>

      {blocks.map((b, i) => {
        const meta = blockMeta(b.kind);
        const isOver = overIdx === i && dragIdx !== null && dragIdx !== i;
        const text = draftRef.current[b.id] ?? b.lines.join('\n');
        const totalSyl = b.lines.reduce((sum, l) => sum + syllables(l), 0);

        return (
          <div
            key={b.id}
            draggable={!b.locked && !vp.isPhone}
            onDragStart={() => setDragIdx(i)}
            onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
            onDragOver={e => { e.preventDefault(); setOverIdx(i); }}
            onDrop={e => { e.preventDefault(); onDropBlock(i); }}
            className={`melos-sheet px-4 pt-3.5 pb-3.5 relative transition-all ${dragIdx === i ? 'melos-sheet--drag' : ''} ${b.locked ? 'melos-sheet--locked' : ''}`}
            style={{
              borderLeft: `4px solid ${meta.color}`,
              ...(isOver ? { outline: '1.5px solid var(--mel-accent)', outlineOffset: 3 } : {}),
            }}
          >
            {/* Visual Block Header */}
            <div className="flex items-center gap-2 mb-2 flex-wrap relative">
              <button
                onClick={() => setKindMenu(kindMenu === b.id ? null : b.id)}
                className="text-[9px] font-extrabold uppercase tracking-[0.18em] px-2.5 py-1 rounded-full flex items-center gap-1"
                style={{ background: `${meta.color}24`, color: meta.color, border: `1px solid ${meta.color}44` }}
              >
                {meta.label}<ChevronDown size={9} />
              </button>

              {/* Editable custom section label */}
              <input
                value={b.label ?? ''}
                onChange={e => setBlock(b.id, { label: e.target.value || undefined })}
                placeholder={`${meta.label} ${i + 1}`}
                aria-label="Custom section label"
                className="text-[11px] font-semibold bg-transparent outline-none px-1.5 py-0.5 rounded w-28"
                style={{ color: 'var(--mel-dim)', border: '1px solid transparent' }}
              />

              {/* Inline Chords / Harmony input */}
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg flex-1 min-w-[140px]" style={{ background: 'var(--mel-hover)' }}>
                <Music size={10} style={{ color: meta.color }} className="shrink-0" />
                <input
                  value={b.chords ?? ''}
                  onChange={e => setBlock(b.id, { chords: e.target.value || undefined })}
                  placeholder="Chords (e.g. Am7 · Fmaj7 · C · G)"
                  aria-label="Section chords"
                  className="w-full bg-transparent border-0 outline-none text-[10.5px] font-mono"
                  style={{ color: 'var(--mel-ink)' }}
                />
              </div>

              {kindMenu === b.id && (
                <div
                  className="absolute top-8 left-0 z-20 rounded-xl p-1.5 flex flex-col gap-0.5 min-w-[148px]"
                  style={{ background: 'var(--mel-rail)', border: '1px solid var(--mel-edge)', boxShadow: '0 16px 34px -12px rgba(0,0,0,.85)' }}
                >
                  {BLOCK_KINDS.map(k => (
                    <button
                      key={k.key}
                      onClick={() => { setBlock(b.id, { kind: k.key, label: undefined }); setKindMenu(null); }}
                      className="text-left text-[11px] font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-2"
                      style={{ color: k.color, background: b.kind === k.key ? 'var(--mel-hover)' : 'transparent', border: 0 }}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ background: k.color }} />
                      {k.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Block Tools: Up/Down, Split, Merge, Lock, Duplicate, Delete */}
              <div className="flex items-center gap-1 ml-auto">
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ color: 'var(--mel-faint)', background: 'var(--mel-hover)' }}>
                  {b.lines.filter(l => l.trim()).length}L · {totalSyl} syl
                </span>

                <button
                  onClick={() => i > 0 && writeBlocks(moveBlock(blocks, i, i - 1))}
                  disabled={i === 0 || !!b.locked}
                  title="Move block up"
                  className="p-1 rounded hover:bg-white/5 disabled:opacity-25"
                  style={{ background: 'none', border: 0, color: 'var(--mel-faint)' }}
                ><ArrowUp size={11} /></button>
                <button
                  onClick={() => i < blocks.length - 1 && writeBlocks(moveBlock(blocks, i, i + 1))}
                  disabled={i === blocks.length - 1 || !!b.locked}
                  title="Move block down"
                  className="p-1 rounded hover:bg-white/5 disabled:opacity-25"
                  style={{ background: 'none', border: 0, color: 'var(--mel-faint)' }}
                ><ArrowDown size={11} /></button>

                {b.lines.length >= 2 && (
                  <button
                    onClick={() => splitBlockAtHalf(i)}
                    title="Split block into two"
                    className="p-1 rounded hover:bg-white/5"
                    style={{ background: 'none', border: 0, color: 'var(--mel-faint)' }}
                  ><Scissors size={11} /></button>
                )}
                {i < blocks.length - 1 && (
                  <button
                    onClick={() => mergeWithNextBlock(i)}
                    title="Merge with next block"
                    className="p-1 rounded hover:bg-white/5"
                    style={{ background: 'none', border: 0, color: 'var(--mel-faint)' }}
                  ><Merge size={11} /></button>
                )}

                <button
                  onClick={() => setBlock(b.id, { locked: !b.locked })}
                  title={b.locked ? 'Unlock' : 'Lock this block'}
                  className="p-1 rounded hover:bg-white/5"
                  style={{ background: 'none', border: 0, color: b.locked ? 'var(--mel-accent)' : 'var(--mel-faint)' }}
                >
                  {b.locked ? <Lock size={11} /> : <Unlock size={11} />}
                </button>
                <button
                  onClick={() => writeBlocks(duplicateBlock(blocks, i))}
                  title="Duplicate block"
                  className="p-1 rounded hover:bg-white/5"
                  style={{ background: 'none', border: 0, color: 'var(--mel-faint)' }}
                >
                  <Copy size={11} />
                </button>
                <button
                  onClick={() => dropBlock(b.id)}
                  title="Delete block"
                  className="p-1 rounded hover:bg-white/5"
                  style={{ background: 'none', border: 0, color: 'var(--mel-faint)' }}
                >
                  <Trash2 size={11} />
                </button>
                {!b.locked && !vp.isPhone && <GripVertical size={12} style={{ color: 'var(--mel-faint)', cursor: 'grab' }} />}
              </div>
            </div>

            {/* Lyric Editor + Per-Line Syllable & Rhyme Margin */}
            <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
              <textarea
                value={text}
                readOnly={!!b.locked}
                rows={Math.max(2, b.lines.length)}
                placeholder={`Write ${(b.label || meta.label).toLowerCase()} lines… (or paste a full song here)`}
                onPaste={e => {
                  const pasted = e.clipboardData.getData('text/plain');
                  // If pasting a multi-section or multi-stanza full song (2+ blank-line stanzas or explicit [Section] headers),
                  // open the interactive Full-Song Breakdown Preview Modal first!
                  const hasHeaders = /^\s*(\[[A-Za-z0-9 _#-]+\]|\([A-Za-z0-9 _#-]+\)|(?:verse|chorus|hook|bridge|pre-?chorus|intro|outro)\b)/im.test(pasted);
                  const stanzaCount = pasted.trim().split(/\n\s*\n/).filter(Boolean).length;
                  if (hasHeaders || stanzaCount >= 2 || pasted.split('\n').length >= 8) {
                    e.preventDefault();
                    const isExistingNonEmpty = blocks.some(blk => blk.lines.some(l => l.trim().length > 0));
                    openPasteBreakdown(pasted, isExistingNonEmpty ? 'replace' : 'replace');
                  }
                }}
                onChange={e => {
                  draftRef.current[b.id] = e.target.value;
                  setBlock(b.id, { lines: e.target.value.split('\n') });
                }}
                aria-label={`${b.label || meta.label} lyrics`}
                className="w-full bg-transparent border-0 outline-none resize-none text-[14px] leading-[1.78]"
                style={{ color: 'var(--mel-ink)', fontFamily: 'var(--font-body, Inter, sans-serif)' }}
              />

              {/* Line-by-line Syllable & Rhyme Pills */}
              <div className="flex flex-col pt-0.5 select-none">
                {b.lines.map((line, li) => {
                  const syl = syllables(line);
                  const sound = lastWordSound(line);
                  const rhymeColor = sound ? rhymeColorMap.get(sound) : undefined;
                  return (
                    <div
                      key={li}
                      className="h-[24.9px] flex items-center justify-end gap-1.5"
                      title={syl ? `${syl} syllables${rhymeColor ? ` · rhyme -${sound}` : ''}` : undefined}
                    >
                      {rhymeColor && (
                        <span
                          className="text-[8.5px] font-mono font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: `${rhymeColor}22`, color: rhymeColor }}
                        >
                          -{sound}
                        </span>
                      )}
                      <span className="text-[9.5px] font-mono tabular-nums min-w-[18px] text-right" style={{ color: 'var(--mel-faint)' }}>
                        {syl > 0 ? syl : '·'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      {/* Quick Section Palette */}
      <div className="flex items-center gap-1.5 flex-wrap pt-1">
        {(['VERSE', 'PRE', 'CHORUS', 'BRIDGE', 'INTRO', 'OUTRO'] as BlockKind[]).map(k => {
          const m = blockMeta(k);
          return (
            <button
              key={k}
              onClick={() => addBlock(k)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-[0.14em]"
              style={{ background: `${m.color}18`, color: m.color, border: `1px solid ${m.color}38` }}
            >
              <Plus size={10} />{m.label}
            </button>
          );
        })}
        <button
          onClick={() => writeBlocks(autoLabelBlocks(blocks))}
          className="px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-[0.14em] ml-auto"
          style={{ background: 'transparent', color: 'var(--mel-faint)', border: '1px solid var(--mel-edge)' }}
        >
          Auto-Number Sections
        </button>
      </div>
    </div>
  );

  const renderMetaRail = () => (
    <aside className={`${vp.isPhone ? 'h-full overflow-y-auto p-4' : 'melos-rail border-l overflow-y-auto p-4'} flex flex-col gap-5`}>
      {/* Tela Bidirectional Status Card */}
      <div
        className="rounded-xl p-3 flex flex-col gap-2"
        style={{ background: 'var(--mel-card)', border: '1px solid var(--mel-edge)' }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[9.5px] font-extrabold uppercase tracking-wider text-amber-400">
            Tela Document Engine
          </span>
          <span className="text-[9px] font-mono" style={{ color: 'var(--mel-ok)' }}>
            ● Bidirectional
          </span>
        </div>
        <p className="text-[10.5px] m-0 leading-relaxed" style={{ color: 'var(--mel-dim)' }}>
          This song's visual blocks are live-backed by a <code className="text-[10px]">.tela</code> document. Edits in Tela or the Pad stay in sync automatically.
        </p>
        <div className="flex items-center gap-1.5 pt-1">
          <button
            disabled={openingTela}
            onClick={async () => {
              setOpeningTela(true);
              try {
                await syncMelosSongToTelaDoc(prodId, song, songs, auth.currentUser?.uid || 'local');
                await openMelosSongInTela(prodId, song, songs, auth.currentUser?.uid || 'local');
              } finally {
                setOpeningTela(false);
              }
            }}
            className="flex-1 h-7 px-2.5 rounded-lg text-[9.5px] font-bold uppercase tracking-wider flex items-center justify-center gap-1"
            style={{ background: 'linear-gradient(135deg,#6B0099,#D40055)', color: '#fff', border: 0 }}
          >
            <LayoutPanelTop size={11} />{openingTela ? 'Opening…' : 'Open in Tela'}
          </button>
          <button
            onClick={() => { void checkTelaUpdates(); }}
            className="h-7 px-2 rounded-lg text-[9.5px] font-bold uppercase tracking-wider flex items-center gap-1"
            style={{ background: 'var(--mel-hover)', color: 'var(--mel-dim)', border: '1px solid var(--mel-edge)' }}
            title="Pull latest changes from Tela"
          >
            <RefreshCw size={10} />Sync
          </button>
        </div>
        {telaSyncedAt && (
          <div className="text-[9px] font-mono" style={{ color: 'var(--mel-faint)' }}>
            Synced {new Date(telaSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        )}
      </div>

      <div>
        <Label className="mb-2">Commitment</Label>
        <div className="flex flex-col gap-1">
          {COMMITMENTS.map(c => {
            const on = song.commitment === c.key;
            return (
              <button
                key={c.key}
                onClick={() => editSong(song.id, { commitment: c.key })}
                title={c.hint}
                className="text-left px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[0.12em] transition-colors"
                style={{
                  background: on ? `${c.color}26` : 'transparent',
                  color: on ? c.color : 'var(--mel-faint)',
                  border: 0,
                }}
              >{c.label}</button>
            );
          })}
        </div>
      </div>

      <div>
        <Label className="mb-2">Where it's at</Label>
        <div className="flex flex-wrap gap-1">
          {SONG_STATES.map(s => {
            const on = song.state === s.key;
            return (
              <button
                key={s.key}
                onClick={() => editSong(song.id, { state: s.key })}
                title={s.hint}
                className="px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-[0.1em]"
                style={{
                  background: on ? `${s.color}26` : 'transparent',
                  color: on ? s.color : 'var(--mel-faint)',
                  border: `1px solid ${on ? `${s.color}55` : 'var(--mel-edge)'}`,
                }}
              >{s.label}</button>
            );
          })}
        </div>
      </div>

      <div>
        <Label className="mb-2">How much I love it</Label>
        <Hearts value={song.love} onChange={v => editSong(song.id, { love: v })} />
        <p className="text-[9.5px] mt-1.5 m-0" style={{ color: 'var(--mel-faint)' }}>
          For this record — not a quality score.
        </p>
      </div>

      <div>
        <Label className="mb-2">Confidence · {song.confidence}%</Label>
        <input
          type="range" min={0} max={100} value={song.confidence}
          onChange={e => editSong(song.id, { confidence: Number(e.target.value) })}
          aria-label="Confidence this makes the record"
          className="w-full"
          style={{ accentColor: 'var(--mel-accent)' }}
        />
        {(() => {
          const sug = suggestConfidence(song);
          if (Math.abs(sug - song.confidence) < 8) return null;
          return (
            <button
              onClick={() => editSong(song.id, { confidence: sug })}
              className="text-[9.5px] mt-1"
              style={{ color: 'var(--mel-accent)', background: 'none', border: 0, padding: 0 }}
            >Signals suggest {sug}% — use it</button>
          );
        })()}
      </div>

      <div>
        <Label className="mb-2">Musical Setup</Label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-[9.5px] block mb-1" style={{ color: 'var(--mel-faint)' }}>Key</span>
            <input
              value={song.keySig || ''}
              onChange={e => editSong(song.id, { keySig: e.target.value })}
              placeholder="e.g. Am, C"
              className="w-full h-7 px-2 rounded-lg text-[11px] outline-none"
              style={{ background: 'var(--mel-hover)', color: 'var(--mel-ink)', border: '1px solid var(--mel-edge)' }}
            />
          </div>
          <div>
            <span className="text-[9.5px] block mb-1" style={{ color: 'var(--mel-faint)' }}>Tempo (BPM)</span>
            <input
              type="number"
              value={song.tempo || ''}
              onChange={e => editSong(song.id, { tempo: Number(e.target.value) || undefined })}
              placeholder="96"
              className="w-full h-7 px-2 rounded-lg text-[11px] font-mono outline-none"
              style={{ background: 'var(--mel-hover)', color: 'var(--mel-ink)', border: '1px solid var(--mel-edge)' }}
            />
          </div>
        </div>
      </div>

      {song.feel && (
        <div>
          <Label className="mb-2">Feel · Breakdown</Label>
          {([
            ['Tempo', song.feel.bpm ? `${Math.round(song.feel.bpm)} BPM` : '—'],
            ['Key', song.feel.keySig || song.keySig || '—'],
            ['Form', song.feel.form || '—'],
            ['Energy', typeof song.feel.energy === 'number' ? song.feel.energy.toFixed(2) : '—'],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} className="flex justify-between items-baseline py-[3.5px] text-[11.5px] border-b"
              style={{ color: 'var(--mel-dim)', borderColor: 'var(--mel-edge)' }}>
              <span>{k}</span>
              <b className="text-[12px] font-medium tabular-nums" style={{ color: 'var(--mel-ink)', fontFamily: 'var(--font-mono-tech, monospace)' }}>{v}</b>
            </div>
          ))}
          {typeof song.feel.energy === 'number' && (
            <div className="h-[5px] rounded-full mt-2 overflow-hidden" style={{ background: 'var(--mel-hover)' }}>
              <i className="block h-full rounded-full" style={{ width: `${song.feel.energy * 100}%`, background: 'var(--mel-accent)' }} />
            </div>
          )}
        </div>
      )}

      <div>
        <Label className="mb-2">Lyrics Lock & Mastering</Label>
        <button
          onClick={() => editSong(song.id, { lyricsLockedAt: song.lyricsLockedAt ? undefined : Date.now() })}
          className="w-full px-3 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-[0.14em]"
          style={
            song.lyricsLockedAt
              ? { background: 'transparent', color: 'var(--mel-faint)', border: '1px solid var(--mel-edge)' }
              : { background: 'var(--mel-accent)', color: '#12101A', border: 0 }
          }
        >{song.lyricsLockedAt ? 'Unlock lyrics' : 'Lock lyrics'}</button>
        <button
          onClick={() => openInMasteringDesk()}
          className="w-full mt-2 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-[0.14em] flex items-center justify-center gap-1.5"
          style={{ background: 'rgba(208,188,255,0.12)', color: '#D0BCFF', border: '1px solid rgba(208,188,255,0.28)' }}
        >
          <Disc3 size={11} />Chora Mastering Desk
        </button>
      </div>
    </aside>
  );

  // ── Full-Song Paste & Auto-Breakdown Preview Modal ─────────────────────────
  const renderPasteBreakdownModal = () => {
    if (!pasteModalOpen) return null;
    return (
      <div
        className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6"
        style={{ background: 'rgba(6,6,10,0.82)', backdropFilter: 'blur(8px)' }}
      >
        <div
          className="w-full max-w-5xl max-h-[90vh] rounded-2xl flex flex-col overflow-hidden"
          style={{ background: 'var(--mel-rail)', border: '1px solid var(--mel-edge)', boxShadow: '0 28px 80px rgba(0,0,0,0.85)' }}
        >
          {/* Modal Header */}
          <div className="px-5 py-3.5 border-b flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: 'var(--mel-edge)' }}>
            <div className="flex items-center gap-2.5">
              <ClipboardPaste size={16} style={{ color: 'var(--mel-accent)' }} />
              <div>
                <h3 className="text-[14px] font-bold m-0" style={{ color: 'var(--mel-ink)' }}>
                  Full-Song Block Breakdown & Preview
                </h3>
                <p className="text-[11px] m-0" style={{ color: 'var(--mel-faint)' }}>
                  Paste your full lyrics on the left — Melos + Tela automatically detect verses, hooks, bridges, and chords. Customize any block before applying.
                </p>
              </div>
            </div>
            <button
              onClick={() => setPasteModalOpen(false)}
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--mel-hover)', color: 'var(--mel-dim)', border: 0 }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Modal Body: Left = Raw Song Paste, Right = Interactive Block Breakdown */}
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[1fr_1.35fr] overflow-hidden">
            {/* Left: Raw Full-Song Textarea */}
            <div className="p-4 border-b md:border-b-0 md:border-r flex flex-col gap-2 min-h-0" style={{ borderColor: 'var(--mel-edge)' }}>
              <div className="flex items-center justify-between">
                <Label>1. Paste or Edit Raw Full Song</Label>
                <button
                  onClick={() => setPreviewBlocks(parseLyrics(rawPasteText))}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
                  style={{ background: 'var(--mel-hover)', color: 'var(--mel-accent)', border: 0 }}
                >
                  <Sparkles size={10} />Re-Analyze Blocks
                </button>
              </div>
              <textarea
                value={rawPasteText}
                onChange={e => {
                  const val = e.target.value;
                  setRawPasteText(val);
                  setPreviewBlocks(parseLyrics(val));
                }}
                placeholder={`[Verse 1]\nAm7  Fmaj7  C  G\nStreetlights humming on the wet asphalt\nEvery late train sounds like your name\n\n[Chorus]\nHold the line till the morning breaks\nWe got miles left in the tank...`}
                className="flex-1 min-h-[180px] w-full rounded-xl p-3 text-[12.5px] leading-[1.65] outline-none resize-none"
                style={{ background: 'var(--mel-paper)', color: 'var(--mel-ink)', border: '1px solid var(--mel-edge)' }}
              />
            </div>

            {/* Right: Interactive Visual Block Preview */}
            <div className="p-4 overflow-y-auto flex flex-col gap-2.5 min-h-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label>2. Define & Customize Blocks ({previewBlocks.length} sections)</Label>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPreviewBlocks(autoLabelBlocks(previewBlocks))}
                    className="px-2 py-1 rounded-lg text-[9.5px] font-bold uppercase tracking-wider"
                    style={{ background: 'var(--mel-hover)', color: 'var(--mel-dim)', border: 0 }}
                  >
                    Auto-Number
                  </button>
                  <button
                    onClick={() => setPreviewBlocks([...previewBlocks, { id: uid('lb'), kind: 'VERSE', lines: [''] }])}
                    className="px-2 py-1 rounded-lg text-[9.5px] font-bold uppercase tracking-wider flex items-center gap-1"
                    style={{ background: 'var(--mel-hover)', color: 'var(--mel-accent)', border: 0 }}
                  >
                    <Plus size={10} />Add Block
                  </button>
                </div>
              </div>

              {previewBlocks.map((pb, idx) => {
                const m = blockMeta(pb.kind);
                return (
                  <div
                    key={pb.id}
                    className="rounded-xl p-3 flex flex-col gap-2"
                    style={{
                      background: 'var(--mel-card)',
                      border: '1px solid var(--mel-edge)',
                      borderLeft: `4px solid ${m.color}`,
                    }}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        value={pb.kind}
                        onChange={e => {
                          const nextKind = e.target.value as BlockKind;
                          setPreviewBlocks(cur => autoLabelBlocks(cur.map((x, i) => (i === idx ? { ...x, kind: nextKind, label: undefined } : x))));
                        }}
                        className="h-6 px-2 rounded-full text-[10px] font-extrabold uppercase tracking-wider outline-none"
                        style={{ background: `${m.color}22`, color: m.color, border: `1px solid ${m.color}44` }}
                      >
                        {BLOCK_KINDS.map(k => (
                          <option key={k.key} value={k.key} style={{ background: '#141418', color: k.color }}>
                            {k.label}
                          </option>
                        ))}
                      </select>

                      <input
                        value={pb.label ?? ''}
                        onChange={e => {
                          const val = e.target.value;
                          setPreviewBlocks(cur => cur.map((x, i) => (i === idx ? { ...x, label: val || undefined } : x)));
                        }}
                        placeholder={`${m.label} ${idx + 1}`}
                        className="h-6 px-2 rounded text-[11px] font-semibold bg-transparent outline-none w-28"
                        style={{ color: 'var(--mel-ink)', border: '1px solid var(--mel-edge)' }}
                      />

                      <input
                        value={pb.chords ?? ''}
                        onChange={e => {
                          const val = e.target.value;
                          setPreviewBlocks(cur => cur.map((x, i) => (i === idx ? { ...x, chords: val || undefined } : x)));
                        }}
                        placeholder="Chords (optional)"
                        className="h-6 px-2 rounded text-[10.5px] font-mono bg-transparent outline-none flex-1 min-w-[110px]"
                        style={{ color: 'var(--mel-dim)', border: '1px solid var(--mel-edge)' }}
                      />

                      <div className="flex items-center gap-1 ml-auto">
                        {pb.lines.length >= 2 && (
                          <button
                            onClick={() => {
                              const mid = Math.ceil(pb.lines.length / 2);
                              const b1: LyricBlock = { ...pb, lines: pb.lines.slice(0, mid) };
                              const b2: LyricBlock = { id: uid('lb'), kind: pb.kind, chords: pb.chords, lines: pb.lines.slice(mid) };
                              setPreviewBlocks(cur => autoLabelBlocks([...cur.slice(0, idx), b1, b2, ...cur.slice(idx + 1)]));
                            }}
                            title="Split this block in two"
                            className="p-1 rounded"
                            style={{ background: 'var(--mel-hover)', color: 'var(--mel-dim)', border: 0 }}
                          ><Scissors size={11} /></button>
                        )}
                        {idx < previewBlocks.length - 1 && (
                          <button
                            onClick={() => {
                              const nextB = previewBlocks[idx + 1];
                              const merged: LyricBlock = {
                                ...pb,
                                chords: [pb.chords, nextB.chords].filter(Boolean).join(' · ') || undefined,
                                lines: [...pb.lines, ...nextB.lines],
                              };
                              setPreviewBlocks(cur => autoLabelBlocks([...cur.slice(0, idx), merged, ...cur.slice(idx + 2)]));
                            }}
                            title="Merge with next block"
                            className="p-1 rounded"
                            style={{ background: 'var(--mel-hover)', color: 'var(--mel-dim)', border: 0 }}
                          ><Merge size={11} /></button>
                        )}
                        <button
                          onClick={() => setPreviewBlocks(cur => cur.filter((_, i) => i !== idx))}
                          title="Remove block"
                          className="p-1 rounded"
                          style={{ background: 'var(--mel-hover)', color: 'var(--mel-faint)', border: 0 }}
                        ><Trash2 size={11} /></button>
                      </div>
                    </div>

                    <textarea
                      value={pb.lines.join('\n')}
                      rows={Math.max(2, pb.lines.length)}
                      onChange={e => {
                        const nextLines = e.target.value.split('\n');
                        setPreviewBlocks(cur => cur.map((x, i) => (i === idx ? { ...x, lines: nextLines } : x)));
                      }}
                      className="w-full bg-transparent outline-none resize-none text-[12.5px] leading-[1.65]"
                      style={{ color: 'var(--mel-ink)' }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="px-5 py-3 border-t flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: 'var(--mel-edge)' }}>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPasteMode('replace')}
                className="px-3 py-1.5 rounded-lg text-[10.5px] font-bold uppercase tracking-wider"
                style={{
                  background: pasteMode === 'replace' ? 'var(--mel-hover)' : 'transparent',
                  color: pasteMode === 'replace' ? 'var(--mel-accent)' : 'var(--mel-faint)',
                  border: pasteMode === 'replace' ? '1px solid var(--mel-accent)' : '1px solid var(--mel-edge)',
                }}
              >
                Replace Current Blocks
              </button>
              <button
                onClick={() => setPasteMode('append')}
                className="px-3 py-1.5 rounded-lg text-[10.5px] font-bold uppercase tracking-wider"
                style={{
                  background: pasteMode === 'append' ? 'var(--mel-hover)' : 'transparent',
                  color: pasteMode === 'append' ? 'var(--mel-accent)' : 'var(--mel-faint)',
                  border: pasteMode === 'append' ? '1px solid var(--mel-accent)' : '1px solid var(--mel-edge)',
                }}
              >
                Append to Song
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPasteModalOpen(false)}
                className="px-3.5 py-2 rounded-xl text-[11px] font-semibold"
                style={{ background: 'transparent', color: 'var(--mel-dim)', border: '1px solid var(--mel-edge)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const cleaned = previewBlocks.filter(b => b.lines.some(l => l.trim().length > 0));
                  const finalBlocks = pasteMode === 'append'
                    ? autoLabelBlocks([...blocks.filter(b => b.lines.some(l => l.trim().length > 0)), ...cleaned])
                    : (cleaned.length ? cleaned : [{ id: uid('lb'), kind: 'VERSE' as BlockKind, lines: [''] }]);
                  writeBlocks(finalBlocks);
                  setPasteModalOpen(false);
                }}
                className="px-4 py-2 rounded-xl text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1.5"
                style={{ background: 'var(--mel-accent)', color: '#12101A', border: 0 }}
              >
                <Check size={13} />Apply {previewBlocks.length} Blocks to Pad
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Dedicated Mobile Layout (vp.isPhone) ───────────────────────────────────
  if (vp.isPhone) {
    return (
      <div
        className="h-full flex flex-col overflow-hidden"
        onDragOver={e => { e.preventDefault(); setIsDraggingAudio(true); }}
        onDragLeave={() => setIsDraggingAudio(false)}
        onDrop={e => {
          e.preventDefault();
          setIsDraggingAudio(false);
          if (e.dataTransfer.files?.length) void handleAudioDrop(e.dataTransfer.files);
        }}
      >
        <audio
          ref={audioRef}
          onTimeUpdate={e => setAudioProgressSec(e.currentTarget.currentTime)}
          onLoadedMetadata={e => setAudioDurationSec(e.currentTarget.duration || 0)}
          onEnded={() => setIsPlayingAudio(false)}
        />
        {renderPasteBreakdownModal()}

        {/* Mobile Song Header + Mode Switcher */}
        <div className="px-3.5 pt-3 pb-2 border-b flex flex-col gap-2 shrink-0" style={{ borderColor: 'var(--mel-edge)', background: 'var(--mel-rail)' }}>
          <div className="flex items-center gap-2">
            <input
              value={song.title}
              onChange={e => editSong(song.id, { title: e.target.value })}
              aria-label="Song title"
              className="text-[18px] font-bold bg-transparent border-0 outline-none flex-1 min-w-0"
              style={{ color: 'var(--mel-ink)' }}
            />
            <button
              onClick={() => openPasteBreakdown('', 'replace')}
              className="h-7 px-2.5 rounded-lg text-[9.5px] font-extrabold uppercase tracking-wider flex items-center gap-1 shrink-0"
              style={{ background: 'var(--mel-accent)', color: '#12101A', border: 0 }}
            >
              <ClipboardPaste size={11} />Paste Song
            </button>
            <button
              disabled={openingTela}
              onClick={async () => {
                setOpeningTela(true);
                try {
                  await syncMelosSongToTelaDoc(prodId, song, songs, auth.currentUser?.uid || 'local');
                  await openMelosSongInTela(prodId, song, songs, auth.currentUser?.uid || 'local');
                } finally {
                  setOpeningTela(false);
                }
              }}
              className="h-7 px-2.5 rounded-lg text-[9.5px] font-extrabold uppercase tracking-wider flex items-center gap-1 shrink-0"
              style={{ background: 'linear-gradient(135deg,#6B0099,#D40055)', color: '#fff', border: 0 }}
            >
              <LayoutPanelTop size={10} />Tela
            </button>
          </div>

          {/* Mobile Segmented Sub-Nav */}
          <div className="grid grid-cols-5 gap-1 p-1 rounded-xl" style={{ background: 'var(--mel-hover)' }}>
            {([
              { id: 'write', label: 'Write', icon: <FileText size={11} /> },
              { id: 'score', label: 'Score', icon: <Music size={11} /> },
              { id: 'audio', label: 'Audio', icon: <Volume2 size={11} /> },
              { id: 'details', label: 'Details', icon: <Layers size={11} /> },
              { id: 'songs', label: `Songs (${active.length})`, icon: <Disc3 size={11} /> },
            ] as const).map(tab => {
              const on = mobileTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setMobileTab(tab.id)}
                  className="py-1.5 px-1 rounded-lg text-[9.5px] font-bold uppercase tracking-wider flex items-center justify-center gap-1"
                  style={{
                    background: on ? 'var(--mel-card)' : 'transparent',
                    color: on ? 'var(--mel-accent)' : 'var(--mel-faint)',
                    border: 0,
                  }}
                >
                  {tab.icon}
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Mobile Tab Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3.5">
          {mobileTab === 'write' && (
            <div className="flex flex-col gap-4 pb-8">
              {renderLyricBlocks()}
              <div>
                <Label className="mb-2">From the notebook</Label>
                <textarea
                  value={song.notes || ''}
                  onChange={e => editSong(song.id, { notes: e.target.value })}
                  placeholder="What happened while you made this one…"
                  rows={3}
                  className="w-full bg-transparent outline-none resize-none text-[14px] leading-[1.6] melos-hand"
                  style={{ border: '1px dashed var(--mel-edge)', borderRadius: 'var(--mel-r-md)', padding: '10px 12px', transform: 'none' }}
                />
              </div>
            </div>
          )}
          {mobileTab === 'score' && renderSheetMusicComposer()}
          {mobileTab === 'audio' && renderAudioStrip()}
          {mobileTab === 'details' && renderMetaRail()}
          {mobileTab === 'songs' && renderSongRail()}
        </div>
      </div>
    );
  }

  // ── Desktop Layout ─────────────────────────────────────────────────────────
  return (
    <div
      className="h-full grid"
      style={{ gridTemplateColumns: 'minmax(0,228px) minmax(0,1fr) minmax(0,256px)' }}
      onDragOver={e => { e.preventDefault(); setIsDraggingAudio(true); }}
      onDragLeave={() => setIsDraggingAudio(false)}
      onDrop={e => {
        e.preventDefault();
        setIsDraggingAudio(false);
        if (e.dataTransfer.files?.length) void handleAudioDrop(e.dataTransfer.files);
      }}
    >
      <audio
        ref={audioRef}
        onTimeUpdate={e => setAudioProgressSec(e.currentTarget.currentTime)}
        onLoadedMetadata={e => setAudioDurationSec(e.currentTarget.duration || 0)}
        onEnded={() => setIsPlayingAudio(false)}
      />
      {renderPasteBreakdownModal()}

      {/* Left: Song Rail */}
      {renderSongRail()}

      {/* Center: The Writing & Sheet Music Pad */}
      <main className="overflow-y-auto px-7 py-6 flex flex-col gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <input
            value={song.title}
            onChange={e => editSong(song.id, { title: e.target.value })}
            aria-label="Song title"
            className="text-[27px] font-semibold tracking-tight bg-transparent border-0 outline-none min-w-0 flex-1"
            style={{ color: 'var(--mel-ink)' }}
          />
          {song.workingTitle && (
            <span className="melos-hand text-[17px]">— was "{song.workingTitle}"</span>
          )}
          {song.lyricsLockedAt && (
            <span
              className="text-[9px] font-bold uppercase tracking-[0.14em] px-2 py-1 rounded-full"
              style={{ background: 'var(--mel-ok)22', color: 'var(--mel-ok)' }}
            >
              <Check size={9} className="inline -mt-[1px] mr-1" />Lyrics locked
            </span>
          )}

          {/* Pad View Switcher: Lyrics | Sheet Music | Split View */}
          <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'var(--mel-hover)', border: '1px solid var(--mel-edge)' }}>
            {([
              { id: 'lyrics', label: 'Lyrics Pad', icon: <FileText size={11} /> },
              { id: 'score', label: 'Sheet Music', icon: <Music size={11} /> },
              { id: 'split', label: 'Split View', icon: <Layers size={11} /> },
            ] as const).map(m => (
              <button
                key={m.id}
                onClick={() => setPadMode(m.id)}
                className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors"
                style={{
                  background: padMode === m.id ? 'var(--mel-card)' : 'transparent',
                  color: padMode === m.id ? 'var(--mel-accent)' : 'var(--mel-faint)',
                  border: 0,
                }}
              >
                {m.icon}{m.label}
              </button>
            ))}
          </div>

          <button
            disabled={openingTela}
            onClick={async () => {
              setOpeningTela(true);
              try {
                await syncMelosSongToTelaDoc(prodId, song, songs, auth.currentUser?.uid || 'local');
                await openMelosSongInTela(prodId, song, songs, auth.currentUser?.uid || 'local');
              } finally {
                setOpeningTela(false);
              }
            }}
            className="h-8 px-3 rounded-[10px] text-[9px] font-extrabold uppercase tracking-[.12em] flex items-center gap-1.5"
            style={{ background: 'linear-gradient(135deg,#6B0099,#D40055)', color: '#fff', border: 0 }}
            title="Open the live lyrics, tracklist and song notebook as bidirectional Tela components"
          >
            <LayoutPanelTop size={12} />{openingTela ? 'Opening…' : 'Open in Tela'}
          </button>
        </div>

        {/* Audio & Reference Strip */}
        {renderAudioStrip()}

        {/* Main Workspace Body */}
        {padMode === 'lyrics' && (
          <div style={{ maxWidth: '66ch' }}>
            {renderLyricBlocks()}
          </div>
        )}

        {padMode === 'score' && renderSheetMusicComposer()}

        {padMode === 'split' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
            <div>{renderLyricBlocks()}</div>
            <div>{renderSheetMusicComposer()}</div>
          </div>
        )}

        {/* Diary entry — flows straight into Notebook view. */}
        <div className="mt-2" style={{ maxWidth: '66ch' }}>
          <Label className="mb-2">From the notebook</Label>
          <textarea
            value={song.notes || ''}
            onChange={e => editSong(song.id, { notes: e.target.value })}
            placeholder="What happened while you made this one…"
            rows={3}
            aria-label="Diary entry"
            className="w-full bg-transparent outline-none resize-none text-[15px] leading-[1.6] melos-hand"
            style={{ border: '1px dashed var(--mel-edge)', borderRadius: 'var(--mel-r-md)', padding: '12px 14px', transform: 'none' }}
          />
        </div>
      </main>

      {/* Right: Meta & Tela Sync Rail */}
      {renderMetaRail()}
    </div>
  );
};

export default PadRoom;
