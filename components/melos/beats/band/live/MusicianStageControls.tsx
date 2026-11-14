// Chora Session Band — Live Musician Stage Controls.
// Shared interactive bar mounted inside every seated instrument (InstrumentBandSeat, LyraBandSeat,
// SomaDrumStory) so any virtual musician can:
//   1. Jam in real time against the current song's key, BPM, and chord progression (transport-synced or standby loop)
//   2. Record what they play straight into the active song track / drum pattern
//   3. Hear & study audio (Mic hum/sing/beatbox, Project Mix tap, System/Tab audio, or File) and produce a Fresh Take or Accompaniment
//   4. Research creative inspirations (books, movies, songs, styles) via Music+Story Intelligence and apply matching sub-presets & vibes

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen, Check, Circle, Disc3, Headphones, Mic, MonitorSpeaker, Play, Radio, Sparkles, Square, Upload, Wand2,
} from 'lucide-react';
import type { ArrangeTrack, InstrumentType } from '../../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../../services/melos/beats/engine/BeatsEngine';
import { recordPadHit } from '../../../../../services/melos/beats/padRecord';
import { applyPresetToDoc, pushTrackPatch } from '../../../../../services/melos/beats/presetHub';
import { songTime } from '../../../../../services/melos/beats/tempoMap';
import { playerById, playerRange } from '../../../../../services/melos/beats/band/roster';
import { cloudConsent, setCloudConsent } from '../../../../../services/melos/beats/band/bandMind';
import {
  getLatestStudiedReference,
  mutateStudioDoc,
  setLatestStudiedReference,
  subscribeStudiedReference,
  summarizeStudioContext,
} from '../../../../../services/melos/beats/band/studioContext';
import {
  captureDeviceAudioSnippet,
  captureMicSnippet,
  captureProjectMixSnippet,
  studyAudioFile,
  type StudiedReference,
} from '../../../../../services/melos/beats/band/audioEar';
import {
  researchCreativeReference,
  type PresetRecommendation,
  type ResearchBrief,
} from '../../../../../services/melos/beats/band/referenceResearch';
import {
  composeFreshTake,
  writeFreshTakeToDoc,
  type FreshTakeMode,
  type FreshTakeResult,
  type FreshTakeRole,
} from '../../../../../services/melos/beats/band/freshTake';
import type { LiveDirector } from '../../../../../services/melos/beats/band/live/director';
import { kitMap } from '../../../../../services/melos/beats/band/printTake';
import { commitRecordedNote } from '../../instrument/useInstrumentKeyboard';

export interface MusicianStageControlsProps {
  playerId: string;
  instrument: string;
  accent: string;
  track?: ArrangeTrack;
  presetName?: string;
  defaultNote?: number;
  director?: LiveDirector | null;
  playStep?: (stroke: string, velocity: number, note?: number, holdMs?: number) => void;
  onReferenceUpdate?: (summary: string) => void;
}

const INSTRUMENT_TYPES = new Set<string>([
  'onda', 'kera', 'vela', 'cantus', 'ison', 'pneuma', 'bajo', 'aura', 'soma', 'lyra', 'tonos', 'volta',
]);

function roleForPlayer(playerId: string, instrument: string): FreshTakeRole {
  if (instrument === 'soma' || instrument === 'kit' || playerId === 'amara' || playerId === 'marcus') return 'percussion';
  if (instrument === 'bajo' || playerId === 'dwayne') return 'bass';
  if (playerId === 'theo' || playerId === 'hez' || playerId === 'nova') return 'comp';
  return 'melody';
}

export const MusicianStageControls: React.FC<MusicianStageControlsProps> = ({
  playerId,
  instrument,
  accent,
  track,
  presetName,
  defaultNote = 48,
  director,
  playStep,
  onReferenceUpdate,
}) => {
  const player = useMemo(() => playerById(playerId), [playerId]);
  const role = useMemo(() => roleForPlayer(playerId, instrument), [playerId, instrument]);
  const first = player?.name.split(' ')[0] ?? 'Musician';

  const [jamming, setJamming] = useState(false);
  const [recArmed, setRecArmed] = useState(false);
  const [panel, setPanel] = useState<'none' | 'ear' | 'research'>('none');
  const [status, setStatus] = useState<string>('');
  const [listeningKind, setListeningKind] = useState<string | null>(null);
  const [studied, setStudied] = useState<StudiedReference | null>(() => getLatestStudiedReference());
  const [query, setQuery] = useState('');
  const [researching, setResearching] = useState(false);
  const [brief, setBrief] = useState<ResearchBrief | null>(null);
  const [mode, setMode] = useState<FreshTakeMode>('fresh-take');
  const [consent, setConsent] = useState(() => cloudConsent());

  const recArmedRef = useRef(recArmed);
  recArmedRef.current = recArmed;
  const studiedRef = useRef(studied);
  studiedRef.current = studied;
  const briefRef = useRef(brief);
  briefRef.current = brief;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const trackRef = useRef(track);
  trackRef.current = track;
  const presetNameRef = useRef(presetName);
  presetNameRef.current = presetName;
  const playerRef = useRef(player);
  playerRef.current = player;
  const playStepRef = useRef(playStep);
  playStepRef.current = playStep;
  const defaultNoteRef = useRef(defaultNote);
  defaultNoteRef.current = defaultNote;
  const firstRef = useRef(first);
  firstRef.current = first;
  const jamGenRef = useRef(0);

  const timersRef = useRef<number[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => subscribeStudiedReference((r) => setStudied(r)), []);

  useEffect(() => {
    const parts: string[] = [];
    if (studied) parts.push(studied.summary);
    if (brief) parts.push(`Inspiration "${brief.title}": ${brief.narrative} (${brief.bpm} BPM, ${brief.keyLabel}, ${brief.chart})`);
    onReferenceUpdate?.(parts.join(' | '));
  }, [studied, brief, onReferenceUpdate]);

  const stopTimers = useCallback(() => {
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current = [];
  }, []);

  useEffect(() => () => stopTimers(), [stopTimers]);

  const buildPhrase = useCallback((seedOffset = 0, explicitMode?: FreshTakeMode): { res: FreshTakeResult; ctx: ReturnType<typeof summarizeStudioContext>; targetTrack?: ArrangeTrack } => {
    const eng = BeatsEngine.get();
    const doc = eng.getDoc();
    const curTrack = trackRef.current;
    const curPlayer = playerRef.current;
    const targetTrack = curTrack ?? doc.arrangement.find((t) => t.kind === 'instrument' && t.instrument?.type === instrument);
    const ctx = summarizeStudioContext(doc, {
      trackId: targetTrack?.id,
      recentChords: eng.playedChords(),
      activeInstrument: instrument,
      activePreset: presetNameRef.current ?? targetTrack?.instrument?.presetName,
    });
    const range: [number, number] = curPlayer
      ? playerRange(curPlayer, briefRef.current?.genreId ?? ctx.genre)
      : role === 'bass'
        ? [28, 55]
        : [48, 84];

    const res = composeFreshTake({
      role,
      keyTonic: ctx.keyTonic,
      keyScale: ctx.keyScale,
      bpm: ctx.bpm,
      bars: 2,
      beatsPerBar: songTime(doc).meter.at(0).lenBeats || 4,
      range,
      seed: Math.floor(Date.now() / 1000) + seedOffset,
      mode: explicitMode ?? modeRef.current,
      reference: studiedRef.current,
      research: briefRef.current,
      chordSymbols: briefRef.current?.chords?.length ? briefRef.current.chords : studiedRef.current?.chords,
    });
    return { res, ctx, targetTrack };
  }, [instrument, role]);

  const recordDrumHitToDoc = useCallback((vel127: number, beatPos: number, voice = 'kick') => {
    const eng = BeatsEngine.get();
    const playingIds = eng.playingPatternIds();
    mutateStudioDoc((d) => {
      const map = kitMap(d.kit);
      const voiceIdx = (map as unknown as Record<string, number>)[voice];
      const padIdx = typeof voiceIdx === 'number' && voiceIdx >= 0 ? voiceIdx : (map.kick >= 0 ? map.kick : 0);
      const hasPatternClip = d.arrangement.some((t) => t.kind === 'pattern' && t.clips.length > 0);
      const mode: 'pattern' | 'song' = playingIds.length || !hasPatternClip ? 'pattern' : 'song';
      const targetIds = playingIds.length ? playingIds : (d.patterns[0] ? [d.patterns[0].id] : []);
      recordPadHit(d, { padIdx, vel: vel127, beat: beatPos, mode }, targetIds, false);
    });
  }, []);

  const soundOneHitOrNote = useCallback(async (
    key: number,
    vel: number,
    durSec: number,
    beatOffset: number,
    targetTrack?: ArrangeTrack,
    drumVoice = 'kick',
  ) => {
    const eng = BeatsEngine.get();
    const vel127 = Math.max(1, Math.min(127, Math.round(vel)));
    const vel01 = Math.max(0.05, Math.min(1, vel127 / 127));

    if (targetTrack && targetTrack.kind === 'instrument') {
      await eng.init();
      const inst = await eng.ensureInstrument(targetTrack);
      if (inst) {
        if (inst.hasKeraProgram()) {
          inst.keraNoteOn(key, vel127);
          window.setTimeout(() => inst.keraNoteOff(key), Math.max(60, durSec * 1000));
        } else {
          const vid = inst.noteOn(key, vel01, 0, eng.audioNow(), eng.ctx?.sampleRate ?? 48000, true);
          window.setTimeout(() => inst.noteOff(vid, true), Math.max(60, durSec * 1000));
        }
      }
      if (recArmedRef.current) {
        const beatPos = eng.isRunning() ? eng.posBeats() : beatOffset;
        const docNow = eng.getDoc();
        const st = songTime(docNow);
        const endBeat = st.secToBeat(st.beatToSec(beatPos) + Math.max(0.06, durSec));
        mutateStudioDoc((d) => {
          commitRecordedNote(targetTrack.id, { key, vel: vel127, startBeats: beatPos }, endBeat, (fn) => fn(d));
        });
      }
      return;
    }

    if (playStepRef.current) {
      playStepRef.current('tone', vel01, key - defaultNoteRef.current, durSec * 1000);
    }
    if (recArmedRef.current && role === 'percussion') {
      const beatPos = eng.isRunning() ? eng.posBeats() : beatOffset;
      recordDrumHitToDoc(vel127, beatPos, drumVoice);
    }
  }, [role, recordDrumHitToDoc]);

  // Real-time jam loop: key strictly on [jamming, track?.id, role] so doc edits / recording notes
  // never tear down and restart runCycle() from beat 0 mid-bar (which caused rapid-fire note bursts).
  useEffect(() => {
    if (!jamming) {
      jamGenRef.current += 1;
      stopTimers();
      return;
    }
    const gen = ++jamGenRef.current;

    const runCycle = (cycleIdx: number) => {
      if (jamGenRef.current !== gen) return;
      stopTimers();
      const { res, ctx, targetTrack } = buildPhrase(cycleIdx);
      const doc = BeatsEngine.get().getDoc();
      const st = songTime(doc);
      const bpb = st.meter.at(0).lenBeats || 4;
      const cycleBeats = 2 * bpb;
      const cycleSec = Math.max(0.8, st.beatToSec(cycleBeats) - st.beatToSec(0));
      const cycleMs = cycleSec * 1000;
      const startBeatBase = cycleIdx * cycleBeats;
      const secPerBeat = cycleSec / cycleBeats;

      if (res.notes.length) {
        for (const n of res.notes) {
          const beatInCycle = n.bar * bpb + n.at;
          if (beatInCycle < 0 || beatInCycle >= cycleBeats) continue;
          const ms = Math.max(0, (st.beatToSec(beatInCycle) - st.beatToSec(0)) * 1000);
          const durSec = Math.max(0.08, n.len * secPerBeat);
          const tid = window.setTimeout(() => {
            if (jamGenRef.current === gen) void soundOneHitOrNote(n.key, n.vel, durSec, startBeatBase + beatInCycle, targetTrack);
          }, ms);
          timersRef.current.push(tid);
        }
      } else if (res.hits.length) {
        const zoneNote: Record<string, { semi: number; stroke: string }> = {
          kick: { semi: 0, stroke: 'bass' },
          snare: { semi: 2, stroke: 'slap' },
          rim: { semi: 4, stroke: 'rim' },
          hatC: { semi: 5, stroke: 'edge' },
          shaker: { semi: 5, stroke: 'edge' },
          clap: { semi: 3, stroke: 'slap' },
          tomH: { semi: 7, stroke: 'tone' },
          tomL: { semi: -5, stroke: 'bass' },
        };
        for (const h of res.hits) {
          const beatInCycle = h.bar * bpb + h.at;
          if (beatInCycle < 0 || beatInCycle >= cycleBeats) continue;
          const ms = Math.max(0, (st.beatToSec(beatInCycle) - st.beatToSec(0)) * 1000);
          const mapped = zoneNote[h.voice] ?? { semi: 0, stroke: 'tone' };
          const tid = window.setTimeout(() => {
            if (jamGenRef.current !== gen) return;
            if (playStepRef.current && !targetTrack) {
              playStepRef.current(mapped.stroke, h.vel / 127, mapped.semi, 180);
              if (recArmedRef.current) {
                const engNow = BeatsEngine.get();
                const beatPos = engNow.isRunning() ? engNow.posBeats() : startBeatBase + beatInCycle;
                recordDrumHitToDoc(h.vel, beatPos, h.voice);
              }
            } else {
              void soundOneHitOrNote(Math.max(24, Math.min(96, defaultNoteRef.current + mapped.semi)), h.vel, 0.22, startBeatBase + beatInCycle, targetTrack, h.voice);
            }
          }, ms);
          timersRef.current.push(tid);
        }
      }

      setStatus(`${firstRef.current} jamming (${ctx.bpm} BPM · ${ctx.keyLabel})${recArmedRef.current ? ' · REC' : ''}`);
      const nextId = window.setTimeout(() => runCycle(cycleIdx + 1), Math.max(800, cycleMs));
      timersRef.current.push(nextId);
    };

    runCycle(0);
    return () => {
      jamGenRef.current += 1;
      stopTimers();
    };
  }, [jamming, track?.id, role, buildPhrase, soundOneHitOrNote, recordDrumHitToDoc, stopTimers]);

  const commitFourBars = useCallback((explicitMode?: FreshTakeMode) => {
    const chosenMode = explicitMode ?? mode;
    const eng = BeatsEngine.get();
    const doc = eng.getDoc();
    const targetTrack = track ?? doc.arrangement.find((t) => t.kind === 'instrument' && t.instrument?.type === instrument);
    const ctx = summarizeStudioContext(doc, {
      trackId: targetTrack?.id,
      recentChords: eng.playedChords(),
      activeInstrument: instrument,
      activePreset: presetName ?? targetTrack?.instrument?.presetName,
    });
    const range: [number, number] = player
      ? playerRange(player, brief?.genreId ?? ctx.genre)
      : role === 'bass'
        ? [28, 55]
        : [48, 84];
    const bpb = songTime(doc).meter.at(0).lenBeats || 4;
    const result = composeFreshTake({
      role,
      keyTonic: ctx.keyTonic,
      keyScale: ctx.keyScale,
      bpm: ctx.bpm,
      bars: 4,
      beatsPerBar: bpb,
      range,
      seed: Math.floor(Date.now() / 100),
      mode: chosenMode,
      reference: studied,
      research: brief,
      chordSymbols: brief?.chords?.length ? brief.chords : studied?.chords,
    });

    let written = 0;
    const ok = mutateStudioDoc((d) => {
      written = writeFreshTakeToDoc(d, targetTrack?.id, result, {
        startBeats: eng.isRunning() ? eng.posBeats() : (d.loop?.on ? d.loop.startBeats : 0),
        beatsPerBar: bpb,
        defaultNote,
        label: `${first} · ${chosenMode === 'fresh-take' ? 'Fresh Take' : 'Accompany'}`,
      });
    });

    if (ok && written > 0) {
      setStatus(`Recorded ${written} notes from ${first} onto "${targetTrack?.name ?? 'Pattern'}"`);
      director?.say(`${chosenMode === 'fresh-take' ? 'Fresh take' : 'Accompaniment'} is in the song — ${result.description}`);
    } else if (!ok) {
      setStatus('Open inside Chora Studio timeline/machine to write clips directly into the project.');
    }
  }, [mode, track, instrument, presetName, player, brief, role, studied, defaultNote, first, director]);

  const handleListen = async (kind: 'mic' | 'mix' | 'system') => {
    setListeningKind(kind);
    setStatus(kind === 'mic' ? 'Listening to your hum/voice (~4.5s)...' : kind === 'mix' ? 'Listening to project master mix...' : 'Pick tab/system audio to study...');
    try {
      const ref = kind === 'mic'
        ? await captureMicSnippet(4500, 'Hum / Vocal Idea')
        : kind === 'mix'
          ? await captureProjectMixSnippet(4500, 'Chora Mix Tap')
          : await captureDeviceAudioSnippet(5000, 'Computer Audio Study');
      setStudied(ref);
      setLatestStudiedReference(ref);
      setStatus(`Studied: ${ref.bpm} BPM · ${ref.keyLabel}${ref.chords.length ? ` · ${ref.chords.slice(0, 4).join(' | ')}` : ''}`);
      director?.say(`Got it — ${ref.bpm} BPM in ${ref.keyLabel}${ref.contourNotes.length ? `, heard ${ref.contourNotes.length} melodic notes` : ''}. Want a fresh take or accompaniment?`);
    } catch (e: any) {
      setStatus(e?.message || 'Could not capture audio.');
    } finally {
      setListeningKind(null);
    }
  };

  const handleFileStudy = async (file: File | undefined) => {
    if (!file) return;
    setListeningKind('file');
    setStatus(`Studying "${file.name}"...`);
    try {
      const ref = await studyAudioFile(file);
      setStudied(ref);
      setLatestStudiedReference(ref);
      setStatus(`Studied "${file.name}": ${ref.bpm} BPM · ${ref.keyLabel}`);
      director?.say(`I analyzed "${file.name}" — ${ref.bpm} BPM in ${ref.keyLabel}. Ready with a fresh take or matching sub-preset.`);
    } catch (e: any) {
      setStatus(e?.message || 'Could not decode that audio file.');
    } finally {
      setListeningKind(null);
    }
  };

  const handleResearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setResearching(true);
    setStatus(`Researching "${q}"...`);
    try {
      const doc = BeatsEngine.get().getDoc();
      const ctx = summarizeStudioContext(doc, {
        trackId: track?.id,
        recentChords: BeatsEngine.get().playedChords(),
        activeInstrument: instrument,
        activePreset: presetName,
      });
      const res = await researchCreativeReference(q, {
        ctx,
        studied,
        activeInstrument: INSTRUMENT_TYPES.has(instrument) ? (instrument as InstrumentType) : undefined,
        playerId,
      });
      setBrief(res);
      setPanel('research');
      setStatus(`${res.title} (${res.bpm} BPM · ${res.keyLabel})`);
      director?.say(`${res.title}: ${res.narrative}`);
    } catch (e: any) {
      setStatus(e?.message || 'Research failed.');
    } finally {
      setResearching(false);
    }
  };

  const applyPresetRec = (rec: PresetRecommendation) => {
    const doc = BeatsEngine.get().getDoc();
    const matchingTrack = track?.instrument?.type === rec.instrument
      ? track
      : doc.arrangement.find((t) => t.kind === 'instrument' && t.instrument?.type === rec.instrument);
    if (!matchingTrack) {
      setStatus(`No ${rec.instrument.toUpperCase()} track in project yet — add one to load "${rec.presetName}".`);
      return;
    }
    const ok = mutateStudioDoc((d) => {
      applyPresetToDoc(d, matchingTrack.id, rec.presetId);
    });
    if (ok) {
      pushTrackPatch(matchingTrack.id);
      setStatus(`Loaded ${rec.instrument.toUpperCase()} sub-preset "${rec.presetName}"`);
    }
  };

  const applyBriefVibeToSong = (b: ResearchBrief) => {
    const ok = mutateStudioDoc((d) => {
      d.bpm = b.bpm;
      d.key = { tonic: b.keyTonic, scale: b.keyScale };
      d.band = { seats: {}, ...d.band, genre: b.genreId, chart: b.chart };
    });
    if (ok) {
      setStatus(`Song aligned to ${b.bpm} BPM · ${b.keyLabel} · ${b.chart}`);
    }
  };

  const pillBtn = 'h-6 px-2 rounded-lg text-[10px] font-semibold border flex items-center gap-1 transition cursor-pointer disabled:opacity-45';

  return (
    <div className="flex flex-col gap-1.5 pt-1 border-t border-white/[0.08]" data-musician-stage={playerId}>
      <div className="flex items-center gap-1 flex-wrap">
        <button
          type="button"
          onClick={() => setJamming((v) => !v)}
          className={pillBtn}
          style={jamming
            ? { background: `${accent}33`, borderColor: accent, color: '#fff' }
            : { borderColor: 'rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.82)' }}
          title={`Let ${first} jam live with your song key, tempo & chords`}
        >
          {jamming ? <Square size={9} /> : <Radio size={10} />}
          {jamming ? `Stop ${first}` : `Jam ${first}`}
        </button>

        <button
          type="button"
          onClick={() => setRecArmed((v) => !v)}
          className={pillBtn}
          style={recArmed
            ? { background: 'rgba(255,59,107,0.28)', borderColor: '#FF3B6B', color: '#FFD4DF' }
            : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.68)' }}
          title="Record live jammed notes directly onto your track"
        >
          <Circle size={8} className={recArmed ? 'fill-[#FF3B6B] text-[#FF3B6B]' : ''} />
          {recArmed ? 'Rec Armed' : 'Rec Into Song'}
        </button>

        <button
          type="button"
          onClick={() => commitFourBars(mode)}
          className={pillBtn}
          style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.82)' }}
          title={`Write 4 bars (${mode === 'fresh-take' ? 'Fresh Take' : 'Accompany'}) directly to the timeline`}
        >
          <Play size={9} /> Write 4 Bars
        </button>

        <button
          type="button"
          onClick={() => setPanel((p) => (p === 'ear' ? 'none' : 'ear'))}
          className={pillBtn}
          style={panel === 'ear' || studied
            ? { background: 'rgba(0,218,243,0.16)', borderColor: 'rgba(0,218,243,0.45)', color: '#9EF4FF' }
            : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}
          title="Let the musician listen to your humming, project mix, computer audio, or an uploaded file"
        >
          <Headphones size={10} /> Hear & Study
        </button>

        <button
          type="button"
          onClick={() => setPanel((p) => (p === 'research' ? 'none' : 'research'))}
          className={pillBtn}
          style={panel === 'research' || brief
            ? { background: 'rgba(255,193,7,0.14)', borderColor: 'rgba(255,193,7,0.45)', color: '#FFE599' }
            : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}
          title="Research a book, movie, song, or vibe to bring into this session"
        >
          <BookOpen size={10} /> Inspire / Research
        </button>
      </div>

      {panel === 'ear' && (
        <div className="rounded-xl border border-cyan-400/20 bg-black/40 p-2 flex flex-col gap-1.5">
          <div className="flex items-center gap-1 flex-wrap">
            <button type="button" disabled={!!listeningKind} onClick={() => void handleListen('mic')} className={pillBtn} style={{ borderColor: 'rgba(255,255,255,0.15)', color: '#fff' }}>
              <Mic size={10} /> {listeningKind === 'mic' ? 'Listening…' : 'Listen to Hum / Mic'}
            </button>
            <button type="button" disabled={!!listeningKind} onClick={() => void handleListen('mix')} className={pillBtn} style={{ borderColor: 'rgba(255,255,255,0.15)', color: '#fff' }}>
              <Disc3 size={10} /> {listeningKind === 'mix' ? 'Listening…' : 'Hear Song Mix'}
            </button>
            <button type="button" disabled={!!listeningKind} onClick={() => void handleListen('system')} className={pillBtn} style={{ borderColor: 'rgba(255,255,255,0.15)', color: '#fff' }}>
              <MonitorSpeaker size={10} /> {listeningKind === 'system' ? 'Listening…' : 'Hear Computer Audio'}
            </button>
            <button type="button" disabled={!!listeningKind} onClick={() => fileRef.current?.click()} className={pillBtn} style={{ borderColor: 'rgba(255,255,255,0.15)', color: '#fff' }}>
              <Upload size={10} /> Study Audio File
            </button>
            <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={(e) => { void handleFileStudy(e.target.files?.[0]); e.target.value = ''; }} />
          </div>

          {studied && (
            <div className="flex items-center justify-between gap-2 flex-wrap rounded-lg bg-white/[0.04] px-2 py-1 text-[10px]">
              <span className="text-cyan-200/90 truncate">{studied.summary}</span>
              <span className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => { setMode('fresh-take'); commitFourBars('fresh-take'); }}
                  className="px-2 py-0.5 rounded bg-cyan-500/25 border border-cyan-400/50 text-cyan-100 font-semibold hover:bg-cyan-500/35"
                >
                  <Sparkles size={9} className="inline mr-1" />Fresh Take
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('accompany'); commitFourBars('accompany'); }}
                  className="px-2 py-0.5 rounded bg-white/10 border border-white/20 text-white font-semibold hover:bg-white/20"
                >
                  Accompany
                </button>
              </span>
            </div>
          )}
        </div>
      )}

      {panel === 'research' && (
        <div className="rounded-xl border border-amber-400/20 bg-black/40 p-2 flex flex-col gap-1.5">
          <form onSubmit={(e) => void handleResearch(e)} className="flex items-center gap-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Book, film, song, or vibe — e.g. "Dune", "Blade Runner", "Pride and Prejudice", "Miles noir"…'
              className="h-6 flex-1 min-w-0 rounded-lg bg-black/50 border border-white/15 px-2 text-[10.5px] text-white placeholder:text-white/35 outline-none focus:border-amber-300/60"
            />
            <button
              type="submit"
              disabled={researching || !query.trim()}
              className={pillBtn}
              style={{ background: 'rgba(255,193,7,0.2)', borderColor: 'rgba(255,193,7,0.5)', color: '#FFE599' }}
            >
              <Wand2 size={10} /> {researching ? 'Studying…' : 'Research'}
            </button>
            <button
              type="button"
              onClick={() => { const next = !consent; setCloudConsent(next); setConsent(next); }}
              className="h-6 px-1.5 rounded-lg text-[9px] border border-white/10 text-white/60 hover:text-white"
              title="Allow cloud AI research for deeper book/movie/song dives (uses your explicit consent)"
            >
              {consent ? 'Cloud ON' : 'Offline AI'}
            </button>
          </form>

          {brief && (
            <div className="flex flex-col gap-1.5 rounded-lg bg-white/[0.04] p-2 text-[10px]">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-bold text-amber-200">{brief.title} <span className="text-white/45 font-normal">({brief.category} · {brief.bpm} BPM · {brief.keyLabel})</span></span>
                <button
                  type="button"
                  onClick={() => applyBriefVibeToSong(brief)}
                  className="px-2 py-0.5 rounded bg-amber-400/20 border border-amber-400/50 text-amber-100 font-semibold hover:bg-amber-400/30"
                >
                  <Check size={9} className="inline mr-1" />Apply Tempo/Key/Chords
                </button>
              </div>
              <p className="m-0 text-white/75 leading-snug">{brief.narrative}</p>
              <p className="m-0 text-white/50 text-[9.5px] leading-snug">Direction: {brief.arrangementCue} · Chart: <span className="font-mono text-white/75">{brief.chart}</span></p>
              {brief.recommendedPresets.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[9px] text-white/40 uppercase tracking-wider mr-0.5">Sounds:</span>
                  {brief.recommendedPresets.map((p) => (
                    <button
                      key={`${p.instrument}:${p.presetId}`}
                      type="button"
                      onClick={() => applyPresetRec(p)}
                      className="px-1.5 py-0.5 rounded border border-white/15 bg-black/40 text-white/85 hover:border-amber-300/60 hover:text-amber-100 text-[9.5px]"
                      title={p.reason}
                    >
                      {p.instrument.toUpperCase()}: {p.presetName}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {status && (
        <div className="text-[9.5px] text-white/55 px-1 truncate">{status}</div>
      )}
    </div>
  );
};
