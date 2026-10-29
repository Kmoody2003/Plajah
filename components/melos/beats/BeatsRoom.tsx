// Melos Beats — the room shell. Standalone in Phase 1 (launched via OPEN_MELOS_BEATS); the
// future Melos workspace mounts this same component with a `production` context. Four views of
// one groove document; the engine is a singleton the views never own.

import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Sparkles, AlignStartVertical, FolderOpen, FilePlus2, Trash2, Download, Disc3 as Disc3Icon, Radio, Cable } from 'lucide-react';
import { auth } from '../../../services/firebase';
import { BeatsEngine } from '../../../services/melos/beats/engine/BeatsEngine';
import { MeterMap } from '../../../services/melos/beats/tempoMap';
import { downloadMidi, exportProjectMidi } from '../../../services/melos/beats/midiExport';
import { downloadMusicXml, exportMusicXml, importMusicXml, musicXmlText } from '../../../services/melos/beats/notation/musicXml';
import { flattenClipNotes } from '../../../services/melos/beats/clipEdit';
import { songTime } from '../../../services/melos/beats/tempoMap';
import { docKey } from '../../../services/melos/beats/songKey';
import { defaultPattern, deserializeGroove, grooveUid, type GrooveDoc, type InstrumentType, type ArrangeTrack } from '../../../services/melos/beats/grooveDoc';
import { useContextMenu, type MenuNode } from '../../ui/ContextMenu';
import { autoFill, quantizePattern } from '../../../services/melos/beats/grooveTools';
import { GENRE_PRESETS, applyGenrePreset, type GenrePreset } from '../../../services/melos/beats/genrePresets';
import { applyHandPattern, type HandPatternResult } from '../../../services/melos/beats/patterns/applyHandPattern';
import { HandDrumLibrary, type HandDrumChoice } from './machine/HandDrumLibrary';
import { playerById } from '../../../services/melos/beats/band/roster';
import { BASSLINES, applyBassline, type BasslinePreset } from '../../../services/melos/beats/bassLines';
import { DrumPatternThumb, BasslineThumb, cachedPattern } from './PatternThumb';
import { UniversalLibraryPanel } from '../../shared/UniversalLibrary/UniversalLibraryPanel';
import { useAriaSurface } from '../../../services/aria/useAriaSurface';
import { ingestSample, backupToLocker } from '../../../services/melos/beats/sampleStore';
import { renderGroove, publishGroove, downloadBlob } from '../../../services/melos/beats/render';
import { exportGrooveFile, importGrooveFile } from '../../../services/melos/beats/grooveFile';
import { sendGrooveToFabula } from '../../../services/melos/beats/sendToFabula';
import {
  subscribeMidi, ensureMidi, noteMidiRouted, midiSendNoteOn, midiSendNoteOff,
} from '../../../services/melos/midiInput';
import { mapMidiEvent } from '../../../services/melos/midiMap';
import { learnedAction } from '../../../services/melos/midiLearn';
import { exportDawproject } from '../../../services/melos/beats/dawproject/exportDawproject';
import { importDawproject } from '../../../services/melos/beats/dawproject/importDawproject';
import { transcribeToPattern, addTranscribedPattern } from '../../../services/melos/beats/transcribeImport';
import type { MelosSampleRef } from './melosSamples';
import { useBeatsDoc } from './useBeatsDoc';
import { useChoraCoedit } from './useChoraCoedit';
import { CollabDock } from '../../collab/CollabDock';
import { useChoraJam } from './jam/useChoraJam';
import { JamPanel } from './jam/JamPanel';
import { VersionChip } from './jam/VersionChip';
import { coProjectId, listSharedWithMe, type CoProject } from '../../../services/coedit/project';
import { loadSharedDoc } from '../../../services/coedit/session';
import type { SharedMasterRef } from './project/useMasterProject';
import { useAutomationRecorder } from './useAutomationRecorder';
import { useMultitrackCapture } from './useMultitrackCapture';
import { HardwareInputsPanel } from './inputs/HardwareInputsPanel';
import {
  forgetPattern, groupLetter, groupPatterns, ideasSet, newGroupPattern, padGroup, patternGroup, scenePatternIds, syncSongFromSections,
} from '../../../services/melos/beats/songSections';
import { recordPadHit } from '../../../services/melos/beats/padRecord';
import type { Scene } from '../../../services/melos/beats/grooveDoc';
import { useEngineBridge } from './useEngineBridge';
import { useBeatsHid } from './useBeatsHid';
import { useInstrumentKeyboard, commitRecordedNote, type RecordedNote } from './instrument/useInstrumentKeyboard';
import { TransportBar, type BeatsViewId } from './shared/TransportBar';
import { VoicePanel } from './voice/VoicePanel';
import { MenuBar, type MenuGroup } from './shared/MenuBar';
import { useHasStudioMenuBar, StudioMenuPublisher } from '../StudioMenus';
import { InstrumentWindow } from './instrument/InstrumentWindow';
import { DiagnosticsReadout } from './shared/DiagnosticsReadout';
import { MidiLearnPanel } from './shared/MidiLearnPanel';
import { midiStatus } from '../../../services/melos/midiInput';
import { MachineView } from './machine/MachineView';
import { GlassView } from './glass/GlassView';
import { TimelineView } from './timeline/TimelineView';
import { MixerView } from './mixer/MixerView';
import { ProjectView } from './project/ProjectView';
import { BeatsMobileShell } from './mobile/BeatsMobileShell';
import { useViewport } from '../../../hooks/useViewport';
import { InstrumentPicker } from './instrument/InstrumentPicker';
import { InstrumentPanel } from './instrument/InstrumentPanel';
import { KeraPanel } from './instrument/KeraPanel';
import { VelaPanel } from './instrument/VelaPanel';
import { BajoPanel } from './instrument/BajoPanel';
import { AuraPanel } from './instrument/AuraPanel';
import { SomaPanel } from './instrument/SomaPanel';
import { LyraPanel } from './instrument/LyraPanel';
import { isSuite, instrumentLabel, instrumentColor, addPadInstrument, addInstrumentToNextPad, detachPadInstrument, addInstrument } from '../../../services/melos/beats/instrumentFactory';
import { SpectraPanel } from './mixer/SpectraPanel';
import { MuseLibrary } from './muse/MuseLibrary';
import BreakdownImporter from './composer/BreakdownImporter';
import { breakdownToTracks } from '../../../services/melos/composition/breakdownToTracks';
import { SELECT, WASH_BG } from './theme';
import { onAuthStateChanged } from 'firebase/auth';
import { getMusicEngines, unavailableMusicEngines, type EngineStatus } from '../../../services/melos/generation/client';
import { insertGeneratedAudio, insertGeneratedNotes } from '../../../services/melos/generation/insert';
import GenerationPanel, { type GenerationInsertion } from './composer/GenerationPanel';
import { encodeWav } from '../../../services/audio/wavEncode';
import { pushTrackPatch } from '../../../services/melos/beats/presetHub';
import { focusedPage, fromUnit, setControlFocus, stepControlPage, writeInstrumentMacro } from '../../../services/melos/beats/controlPages';
import { halloweenAudio } from '../../../services/halloween/halloweenAudioSfx';
import { stopRealtimeSympPlayback } from '../../../services/melos/melosRealtimeSympPlayer';
import {
  CLASSIC_BOOK_SOUNDTRACKS,
  buildClassicBookGrooveDoc,
  hydrateClassicBookGrooveAudioStems,
  seedAdminClassicBookProjects,
  getMasterBookScore,
} from '../../../data/classicBookSoundtracks';

export interface BeatsLaunchPayload {
  grooveId?: string;
  productionId?: string;
  sampleUrl?: string;
  sampleName?: string;
  classicBookThemeId?: string;
  classicBookTrackIndex?: number;
  classicBookGrooveDoc?: GrooveDoc;
}

interface BeatsRoomProps {
  onClose: () => void;
  payload?: BeatsLaunchPayload | null;
  /** Set by the Melos shell: grooves save under this production instead of the user's scratch. */
  production?: { prodId: string };
  /** Mounted inside the Melos shell rather than as a standalone full-screen app. */
  embedded?: boolean;
  /** Melos Samples-room candidates, so pinned samples reach the pads with their clearance state. */
  melosSamples?: MelosSampleRef[];
  /** Called when a groove is bounced inside a production — lands as a take on the linked song. */
  onRenderTake?: (take: { blob: Blob; name: string; durationSec: number }) => void;
  /** The song a bounce would attach to, for the button label. */
  takeTargetName?: string;
  /** Client-side discovery only. Generation remains protected by server-side admin checks. */
  musicLabAdmin?: boolean;
}

const AVAILABLE_VIEWS: BeatsViewId[] = ['machine', 'glass', 'timeline', 'mixer'];

const BeatsRoom: React.FC<BeatsRoomProps> = ({ onClose, payload, production, embedded, melosSamples, onRenderTake, takeTargetName, musicLabAdmin = false }) => {
  const {
    doc, rev, saveState, grooves, mutate, undo: localUndo, redo: localRedo, canUndo: localCanUndo, canRedo: localCanRedo,
    replace, applyRemote, getDoc, openShared, setGuestOf, saveNow, openGroove, newGroove, removeGroove,
  } = useBeatsDoc(payload?.grooveId, production?.prodId || payload?.productionId);
  // Live collaboration on this groove (inert until the owner shares it). Remote merges fold into
  // the live doc via applyRemote; while shared, Ctrl+Z is the session's selective undo (only YOUR
  // edits) instead of the whole-doc snapshot stack, which would also revert collaborators' work.
  const co = useChoraCoedit<GrooveDoc>({ kind: 'beats', localId: doc.id, title: doc.name || 'Groove', rev, getDoc, applyRemote });
  const sharedSession = co.isShared ? co.session : null;
  const undo = useCallback(() => { if (sharedSession) sharedSession.undo(); else localUndo(); }, [sharedSession, localUndo]);
  const redo = useCallback(() => { if (sharedSession) sharedSession.redo(); else localRedo(); }, [sharedSession, localRedo]);
  const canUndo = sharedSession ? !!co.snap?.canUndo : localCanUndo;
  const canRedo = sharedSession ? !!co.snap?.canRedo : localCanRedo;
  const transportRowRef = React.useRef<HTMLDivElement>(null);
  const phoneHeaderRef = React.useRef<HTMLDivElement>(null);
  // Under the Chora Studio shell the menu bar lives at the top of the workspace; standalone,
  // the transport bar keeps drawing its own.
  const shellMenuBar = useHasStudioMenuBar();
  const snap = useEngineBridge();
  const vp = useViewport();
  const hid = useBeatsHid(doc, true);
  const [view, setViewState] = useState<BeatsViewId>(() => {
    const saved = localStorage.getItem('plajah_beats_view') as BeatsViewId | null;
    return saved && AVAILABLE_VIEWS.includes(saved) ? saved : 'machine';
  });
  const setView = useCallback((v: BeatsViewId) => {
    setViewState(v);
    try { localStorage.setItem('plajah_beats_view', v); } catch { /* private mode */ }
  }, []);
  useEffect(() => { viewRef.current = view; }, [view]);
  const [selectedPad, setSelectedPad] = useState(0);
  // Mirror for the MIDI CC handler — it must read the CURRENT selection without re-subscribing.
  const selectedPadRef = React.useRef(0);
  useEffect(() => { selectedPadRef.current = selectedPad; }, [selectedPad]);
  const [playMode, setPlayMode] = useState<'pattern' | 'song'>('pattern');
  // Touch / Latch / Write: mixer moves during song playback become automation (useAutomationRecorder).
  useAutomationRecorder(doc, snap.running, playMode, mutate);
  // Song/arrangement play position — the timeline playhead. Defaults to the very start so Play in the
  // timeline always begins at bar 1 on first load; a ruler click moves it (and remembers it).
  const [songStartBeats, setSongStartBeats] = useState(0);
  const [activePatternId, setActivePatternIdRaw] = useState(doc.patterns[0]?.id || '');
  // Maschine "Ideas": the pattern each Group plays in pattern mode. Selecting a pattern makes it
  // the edited pattern AND its Group's pick; while pattern mode runs, the switch lands on the bar.
  const [choice, setChoice] = useState<Record<number, string | undefined>>({});
  const setActivePatternId = useCallback((id: string) => {
    setActivePatternIdRaw(id);
    const pat = docRefForChoice.current?.patterns.find((x) => x.id === id);
    if (!pat) return;
    setChoice((c) => (c[patternGroup(pat)] === id ? c : { ...c, [patternGroup(pat)]: id }));
    const engine = BeatsEngine.get();
    if (engine.isRunning() && engine.playingPatternIds().length) engine.queuePattern(id);
  }, []);
  const docRefForChoice = React.useRef(doc);
  docRefForChoice.current = doc;
  const [recQuantize, setRecQuantize] = useState(() => localStorage.getItem('melos:padrec:quantize') !== '0');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showGrooves, setShowGrooves] = useState(false);
  const [octave, setOctave] = useState(4);
  const [recording, setRecording] = useState(false);
  const recordingRef = React.useRef(false);
  useEffect(() => { recordingRef.current = recording; }, [recording]);
  // Mirror the view for the MIDI handler: the Project page is for assembling releases — pads
  // and notes should not fire there (transport still works).
  const viewRef = React.useRef<BeatsViewId>('machine');
  // Metronome + record pre-roll (count-in bars) — session preferences, engine-side click.
  const [metronomeOn, setMetronomeOn] = useState(() => localStorage.getItem('plajah_beats_metronome') === '1');
  const [preRollBars, setPreRollBars] = useState(() => { const v = Number(localStorage.getItem('plajah_beats_preroll')); return v === 1 || v === 2 ? v : 1; });
  useEffect(() => {
    BeatsEngine.get().setMetronome(metronomeOn);
    try { localStorage.setItem('plajah_beats_metronome', metronomeOn ? '1' : '0'); } catch { /* */ }
  }, [metronomeOn]);
  useEffect(() => { try { localStorage.setItem('plajah_beats_preroll', String(preRollBars)); } catch { /* */ } }, [preRollBars]);
  const [showInstrumentPicker, setShowInstrumentPicker] = useState(false);
  // Where a freshly-picked instrument lands: a MEKA pad, or its own independent (clip-driven) MIDI track.
  const [instrumentDest, setInstrumentDest] = useState<'meka' | 'track'>('meka');
  const [showBreakdownImport, setShowBreakdownImport] = useState(false);
  const [musicEngines, setMusicEngines] = useState<EngineStatus[] | null>(() => musicLabAdmin ? unavailableMusicEngines() : null);
  const [showGeneration, setShowGeneration] = useState(false);
  const currentDocRef = React.useRef(doc);
  currentDocRef.current = doc;
  useEffect(() => {
    let request: AbortController | undefined;
    const unsubscribe = onAuthStateChanged(auth, user => {
      request?.abort(); request = new AbortController();
      const signal = request.signal;
      const canDiscover = musicLabAdmin || user?.email?.toLowerCase() === 'kmoody2003@gmail.com';
      setMusicEngines(canDiscover ? unavailableMusicEngines() : null); setShowGeneration(false);
      if (user && canDiscover) void getMusicEngines(signal).then(engines => {
        if (!signal.aborted) setMusicEngines(engines);
      }).catch(() => { /* Keep the disabled preview statuses visible; the server still protects generation. */ });
    });
    return () => { request?.abort(); unsubscribe(); };
  }, [musicLabAdmin]);
  const insertGeneration = async (value: GenerationInsertion) => {
    const checkProject = () => {
      if (currentDocRef.current.id !== value.projectId) throw new Error('The project changed during generation. Return to the original project before inserting.');
      if (currentDocRef.current.bpm !== value.bpm) throw new Error('The project tempo changed during generation. Restore the original tempo before inserting this take.');
    };
    checkProject();
    const engine = BeatsEngine.get(); await engine.init(); checkProject();
    let sample: Awaited<ReturnType<typeof ingestSample>> = null;
    if (value.audio) {
      const ctx = engine.getContext(); if (!ctx) throw new Error('Audio engine is unavailable');
      let blob = value.audio;
      if (value.kind === 'sample') {
        const source = await ctx.decodeAudioData(await blob.arrayBuffer());
        if (!Number.isFinite(value.sampleStart) || !Number.isFinite(value.sampleLength) || value.sampleStart < 0 || value.sampleStart >= source.duration || value.sampleLength <= 0) throw new Error('Choose a sample region inside the generated audio');
        const offset = Math.floor(value.sampleStart * source.sampleRate);
        const frames = Math.min(source.length - offset, Math.ceil(value.sampleLength * source.sampleRate));
        const trimmed = ctx.createBuffer(source.numberOfChannels, frames, source.sampleRate);
        const fade = Math.min(Math.floor(source.sampleRate * 0.005), Math.floor(frames / 2));
        for (let c = 0; c < source.numberOfChannels; c++) {
          const samples = trimmed.getChannelData(c); samples.set(source.getChannelData(c).subarray(offset, offset + frames));
          for (let i = 0; i < fade; i++) { samples[i] *= i / fade; samples[frames - 1 - i] *= i / fade; }
        }
        blob = encodeWav(trimmed, 24);
      }
      sample = await ingestSample(blob, value.target.name, ctx);
      if (!sample) throw new Error('Could not decode or save the generated audio');
      engine.setSampleBuffer(sample.ref.key, sample.buffer);
    }
    checkProject();
    // Validate on a draft first so a failed insertion never leaves a half-mutated project.
    const draft: GrooveDoc = JSON.parse(JSON.stringify(currentDocRef.current));
    const outcome = sample ? insertGeneratedAudio(draft, sample.ref, value.target, value.kind === 'sample')
      : insertGeneratedNotes(draft, value.result.notes || [], value.target);
    mutate(d => { d.kit = draft.kit; d.patterns = draft.patterns; d.arrangement = draft.arrangement; });
    engine.syncInstruments();
    if ('padIdx' in outcome && typeof outcome.padIdx === 'number') setSelectedPad(outcome.padIdx);
    if ('patternId' in outcome && outcome.patternId) setActivePatternId(outcome.patternId);
    setView(value.kind === 'sample' ? 'machine' : value.target.destination === 'meka' ? 'machine' : value.target.destination);
    // Generated audio remains in the device's OPFS; it is not published or uploaded here.
  };
  // Score a Chora breakdown → one instrument track per part (Melody/Harmony/Bass/Accent).
  const scoreFromBreakdown = (bd: Parameters<typeof breakdownToTracks>[0]) => {
    const scored = breakdownToTracks(bd);
    if (!scored.tracks.length) return;
    mutate((d) => {
      if (scored.tempo) d.bpm = Math.max(20, Math.min(300, Math.round(scored.tempo)));
      for (const st of scored.tracks) {
        const trackId = addInstrument(d, st.instrumentType);
        const t = d.arrangement.find((x) => x.id === trackId);
        if (!t) continue;
        t.name = st.name;
        const end = st.notes.reduce((m, n) => Math.max(m, n.startBeats + n.lengthBeats), 0);
        t.clips.push({ id: grooveUid(), startBeats: 0, lengthBeats: Math.max(4, Math.ceil(end / 4) * 4), notes: st.notes });
      }
    });
    void BeatsEngine.get().init().then(() => BeatsEngine.get().syncInstruments());
    setView('timeline');
  };
  const [openInstrumentId, setOpenInstrumentId] = useState<string | null>(null);
  // When set, the instrument picker is targeting a PAD (turn the pad into an ONDA/KERA instrument)
  // rather than adding a new arranger track.
  const [padPickerFor, setPadPickerFor] = useState<number | null>(null);
  const [showEq, setShowEq] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showMidi, setShowMidi] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [showInputs, setShowInputs] = useState(false);
  const [midiConnected, setMidiConnected] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.matches('input, textarea, select, [contenteditable="true"]')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);
  // Poll the WebMIDI device list so the transport dot lights when a controller is present.
  useEffect(() => { const t = setInterval(() => setMidiConnected(midiStatus().connected.length > 0), 2000); return () => clearInterval(t); }, []);

  // The armed instrument track owns the QWERTY keyboard (the pads stand down while it does),
  // and receives anything played or recorded.
  // Never a pad's own track: a pad instrument is played by its pad, not the armed keyboard.
  const armedTrack = doc.arrangement.find((t) => t.kind === 'instrument' && t.armed && !t.padOwned) || null;
  useInstrumentKeyboard({
    doc,
    armedTrack,
    recording,
    running: snap.running,
    posBeats: () => BeatsEngine.get().posBeats(),
    onMutate: mutate,
    octave,
    onOctaveChange: setOctave,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importReport, setImportReport] = useState<string[] | null>(null);
  const dawFileRef = React.useRef<HTMLInputElement>(null);
  const melosFileRef = React.useRef<HTMLInputElement>(null);
  const musicXmlRef = React.useRef<HTMLInputElement>(null);

  const flash = useCallback((msg: string) => { setNotice(msg); setTimeout(() => setNotice(null), 3200); }, []);
  // Armed hardware-input tracks record through the desktop app's ASIO engine during a record pass.
  useMultitrackCapture({ doc, mutate, recording, running: snap.running, flash });
  // A non-owner member of the live project is a guest: their autosave stays on this device and in
  // the session, never in a Melos production (useBeatsDoc.setGuestOf).
  useEffect(() => {
    const p = co.project;
    const uid = auth.currentUser?.uid;
    if (!p || !uid || p.localId !== doc.id) return;
    setGuestOf(p.ownerId !== uid ? p.ownerId : null);
  }, [co.project, doc.id, setGuestOf]);

  // ── Shared with me: grooves + albums other people shared through live collaboration ──
  const [sharedGrooves, setSharedGrooves] = useState<CoProject[]>([]);
  const [sharedAlbums, setSharedAlbums] = useState<CoProject[]>([]);
  const [sharedAlbum, setSharedAlbum] = useState<SharedMasterRef | null>(null);
  const refreshShared = useCallback(async () => {
    const [g, a] = await Promise.all([listSharedWithMe('beats'), listSharedWithMe('melos')]);
    setSharedGrooves(g);
    setSharedAlbums(a);
  }, []);
  const openSharedGroove = useCallback(async (p: CoProject) => {
    const loaded = await loadSharedDoc<GrooveDoc>(coProjectId('beats', p.localId));
    const g = loaded ? deserializeGroove(structuredClone(loaded)) : null;
    if (!g) { flash('That shared groove has no saved version yet'); return; }
    g.id = p.localId; // the live session keys on it
    openShared(g, p.ownerId);
    setShowGrooves(false);
  }, [openShared, flash]);
  const openSharedAlbum = useCallback((p: CoProject) => {
    setSharedAlbum({ projectId: coProjectId('melos', p.localId), localId: p.localId, ownerId: p.ownerId, title: p.title });
    setShowGrooves(false);
    setView('project');
  }, [setView]);
  useEffect(() => { if (showGrooves) void refreshShared(); }, [showGrooves, refreshShared]);

  // ── Live jam (shared grooves only): play, record and bring your rig together ──
  const jam = useChoraJam({
    co, rev, getDoc, mutate, melosSamples, songStartBeats, setSongStartBeats, running: snap.running, flash,
  });
  const jamApiRef = React.useRef(jam);
  jamApiRef.current = jam;
  const [showJam, setShowJam] = useState(false);
  useEffect(() => { if (!co.isShared) setShowJam(false); }, [co.isShared]);
  // A commit-mode MIDI pass becomes one tray take when recording stops.
  const wasRecording = React.useRef(false);
  useEffect(() => {
    if (wasRecording.current && !recording) void jam.flushMidiTake();
    wasRecording.current = recording;
  }, [recording]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The groove's collaboration dock — desktop puts it in the transport row, phone in its appbar.
   *  zIndex clears the standalone room (z-100) and the phone shell (z-90). */
  const grooveDock = (anchor: React.RefObject<HTMLElement | null>, pill: 'inline' | 'none') => (
    <CollabDock<GrooveDoc>
      co={co}
      kind="beats"
      title={doc.name || 'Groove'}
      doc={doc}
      localId={doc.id}
      serialize={(d) => JSON.stringify(d)}
      restoreSolo={(json) => {
        const restored = deserializeGroove(JSON.parse(json));
        if (!restored) return;
        restored.id = doc.id; // a restore is a new version of THIS groove
        restored.updatedAt = Date.now();
        replace(restored);
        void saveNow();
      }}
      anchor={anchor}
      pill={pill}
      zIndex={160}
    />
  );

  // MusicXML out: every instrument track as a part, with what its clips PLAY (slip/loop baked in).
  const handleExportMusicXml = useCallback(() => {
    const tracks = doc.arrangement.filter((t) => t.kind === 'instrument' && !t.foreign && !t.padOwned && t.clips.some((c) => c.notes?.length));
    if (!tracks.length) { flash('No instrument parts to engrave yet'); return; }
    const parts = tracks.map((t) => ({
      name: t.name,
      notes: t.clips.flatMap((c) => flattenClipNotes(c).map((n) => ({ ...n, startBeats: n.startBeats + c.startBeats }))),
    }));
    const end = Math.max(4, ...tracks.flatMap((t) => t.clips.map((c) => c.startBeats + c.lengthBeats)));
    const { meter } = songTime(doc);
    const xml = exportMusicXml(parts, { title: doc.name || 'Melos', bpm: doc.bpm, meter, key: docKey(doc), lengthBeats: end });
    downloadMusicXml(xml, doc.name || 'Melos');
    flash(`Score exported — ${parts.length} part${parts.length > 1 ? 's' : ''}`);
  }, [doc, flash]);

  // MusicXML in: each part becomes an instrument track with one clip from bar 1. Into an empty
  // song the score's tempo and time signatures come along; the key is adopted when none is set.
  const handleImportMusicXml = useCallback(async (file: File) => {
    try {
      const imp = importMusicXml(musicXmlText(new Uint8Array(await file.arrayBuffer())));
      const parts = imp.parts.filter((pt) => pt.notes.length);
      if (!parts.length) { flash('That score has no notes to import'); return; }
      mutate((d) => {
        const fresh = !d.arrangement.some((t) => t.kind === 'instrument' && !t.padOwned && t.clips.some((c) => c.notes?.length));
        if (fresh) {
          if (imp.bpm) d.bpm = Math.max(20, Math.min(300, imp.bpm));
          const meter = imp.meter.filter((m, i) => !(i === 0 && m.num === 4 && m.den === 4));
          if (meter.length) d.meter = imp.meter; else delete d.meter;
        }
        if (!docKey(d) && imp.key) d.key = imp.key;
        const { meter } = songTime(d);
        for (const pt of parts) {
          const trackId = addInstrument(d, 'onda');
          const t = d.arrangement.find((x) => x.id === trackId);
          if (!t) continue;
          t.name = pt.name.slice(0, 32);
          t.armed = false;
          const end = Math.max(...pt.notes.map((n) => n.startBeats + n.lengthBeats));
          const b = meter.at(end);
          t.clips.push({ id: grooveUid(), startBeats: 0, lengthBeats: b.beatInBar < 1e-6 ? end : b.startBeat + b.lenBeats, notes: pt.notes, name: imp.title });
        }
      });
      BeatsEngine.get().syncInstruments();
      flash(`Imported “${imp.title}” — ${parts.length} part${parts.length > 1 ? 's' : ''}`);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Could not read that MusicXML file');
    }
  }, [mutate, flash]);
  const handleOpenMelosFile = useCallback(async (file: File) => {
    const opened = await importGrooveFile(file);
    if (opened) { replace(opened); setShowGrooves(false); flash(`Opened ${opened.name}`); }
    else flash('That file could not be read as a Melos groove');
  }, [replace, flash]);
  const handleSaveCopy = useCallback(() => {
    // Fork the current groove into a NEW one (fresh id) so the original is untouched; the autosave
    // then persists the copy to the owner's cloud as a separate project.
    const copy = JSON.parse(JSON.stringify(doc));
    copy.id = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
    copy.name = `${(doc.name || 'Groove').replace(/ copy( \d+)?$/, '')} copy`;
    replace(copy); setShowGrooves(false); flash(`Saved a copy — ${copy.name}`);
  }, [doc, replace, flash]);

  const pattern = doc.patterns.find((p) => p.id === activePatternId) || doc.patterns[0];

  const handlePlay = useCallback(() => {
    const engine = BeatsEngine.get();
    // Recording with a pre-roll: count the metronome in for N bars (of the meter where playback
    // starts — two bars of 6/8 is 6 beats, not 8) before the downbeat.
    const from = view === 'timeline' ? songStartBeats : 0;
    const countInBeats = recordingRef.current ? preRollBars * MeterMap.fromDoc(doc).at(from).lenBeats : 0;
    // In the timeline (arrangement) view, Play means play the SONG from the playhead — which defaults
    // to bar 1 — not audition the loose pattern. Every other view auditions the current pattern.
    if (view === 'timeline') {
      setPlayMode('song');
      void engine.init().then(() => engine.play('song', { fromBeats: songStartBeats, countInBeats }));
    } else {
      // Pattern mode plays every Group's pick together (Maschine Ideas), not one pattern alone.
      const patternIds = ideasSet(doc, { ...choice, ...(pattern ? { [patternGroup(pattern)]: pattern.id } : {}) });
      void engine.init().then(() => engine.play(playMode, { patternIds, countInBeats }));
    }
  }, [view, playMode, pattern?.id, preRollBars, songStartBeats, doc, choice]);

  const handleStop = useCallback(() => { BeatsEngine.get().stop(); }, []);

  // Record button: while stopped it arms AND rolls (with the count-in), like every DAW; while
  // playing it just toggles capture on the fly.
  const handleToggleRecord = useCallback(() => {
    setRecording((v) => {
      const next = !v;
      recordingRef.current = next;
      if (next && !BeatsEngine.get().isRunning()) {
        const engine = BeatsEngine.get();
        const patternIds = ideasSet(doc, { ...choice, ...(pattern ? { [patternGroup(pattern)]: pattern.id } : {}) });
        void engine.init().then(() => engine.play(playMode, { patternIds, countInBeats: preRollBars * MeterMap.fromDoc(doc).at(0).lenBeats }));
      }
      return next;
    });
  }, [playMode, pattern?.id, preRollBars, doc, choice]);

  // Space = play/stop, the one shortcut every DAW agrees on.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      if (BeatsEngine.get().isRunning()) handleStop(); else handlePlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlePlay, handleStop]);

  // Stop the transport when the room unmounts — the engine singleton outlives the view.
  useEffect(() => {
    try { halloweenAudio.stopGothicCastleMusic(); } catch { /* ignore */ }
    try { stopRealtimeSympPlayback(); } catch { /* ignore */ }
    return () => { BeatsEngine.get().stop(); };
  }, []);

  // Hardware MIDI — premapped for Maschine, Komplete Kontrol and Maschine Jam (the same devices
  // Pixels sees). mapMidiEvent turns each event into ONE Melos action given the device and
  // whether an instrument is armed, so a Maschine's pads play drums, its knobs turn the synth's
  // macros, and — when an instrument track is armed — its pads become a playable keyboard.
  /**
   * Arm the first instrument track so an incoming note has somewhere to go.
   *
   * Returns the track synchronously as well as marking it armed, because the note that triggered
   * this has to sound NOW — waiting for the mutation to land and a render to follow would drop
   * the first note of every session.
   */
  const autoArm = useCallback((): ArrangeTrack | null => {
    let picked: ArrangeTrack | null = null;
    // `mutate` runs its callback synchronously against the live doc, so the track is in hand
    // before this returns — the note that triggered it still sounds on the same event.
    mutate((d) => {
      // Only a Timeline instrument track is ever armed. A pad's own (hidden) instrument track is
      // played by its pad — arming one sent every keyboard note, knob turn and Maschine pad to that
      // one pad's sound, whichever pad you had selected.
      const first = d.arrangement.find((t) => t.kind === 'instrument' && !t.padOwned);
      if (!first) return;
      for (const t of d.arrangement) if (t.kind === 'instrument') t.armed = t.id === first.id;
      picked = first;
    });
    return picked;
  }, [mutate]);

  const midiRec = React.useRef(new Map<number, RecordedNote>());
  // Keyboard notes that are playing an instrument pad (MEKA focus): MIDI note → pad index.
  const midiPadNotes = React.useRef(new Map<number, { pad: number; semi: number }>());
  useEffect(() => {
    ensureMidi(); // request access now so the device readout populates before you play
    return subscribeMidi((e) => {
      const engine = BeatsEngine.get();
      const doc0 = docRefForChoice.current;
      const armed = engine.armedTrack(); // never a pad's own track (see armedTrack)
      // MEKA follows Maschine's focus: the keys, wheels and knobs play the SELECTED sound. When that
      // is an instrument pad, keyboard notes are pitched hits on it (recorded into its pitch roll).
      const inMeka = viewRef.current === 'machine';
      const selIdx = selectedPadRef.current;
      const selPad = doc0.kit[selIdx];
      const padTrack = inMeka && selPad?.source === 'instrument' && selPad.instrumentTrackId
        ? doc0.arrangement.find((t) => t.id === selPad.instrumentTrackId && t.kind === 'instrument') ?? null
        : null;
      // Learned user bindings win over the premap; 'captured' means learn mode ate this event.
      const learned = learnedAction(e);
      if (learned === 'captured') return;
      const action = learned ?? mapMidiEvent(e, !!(padTrack ?? armed), !inMeka);
      if (!action) return;
      // MIDI plays in every view EXCEPT Project — that page assembles releases, it doesn't
      // perform. Transport controls still pass so hardware play/stop always works.
      if (viewRef.current === 'project' && action.kind !== 'transport') return;
      noteMidiRouted(e.note);
      switch (action.kind) {
        case 'pad':
          void engine.init().then(() => engine.padDown(action.pad, action.velocity));
          setSelectedPad(action.pad);
          break;
        case 'padOff':
          engine.padUp(action.pad);
          break;
        case 'note': {
          if (padTrack) {
            const semi = action.note - ((selPad.instrumentNote ?? 60) + (selPad.pitchSemis || 0));
            midiPadNotes.current.set(action.note, { pad: selIdx, semi });
            void engine.init().then(() => engine.padDownPitched(selIdx, action.velocity, semi, true));
            midiSendNoteOn(action.note, action.velocity);
            break;
          }
          // Auto-route. `mapMidiEvent` deliberately returns a note for a generic keyboard so it is
          // "never dead" — and this used to drop it on the floor whenever no track happened to be
          // armed, which is a device that connects, lights up, and makes no sound. Arm the first
          // instrument track instead; if a project genuinely has none, the meter says "receiving,
          // not routed" rather than leaving you guessing.
          const target = armed ?? autoArm();
          if (!target) break;
          const playOn = () => void engine.ensureInstrument(target).then(() => engine.instrumentNoteOn(target, action.note, action.velocity));
          // Jamming: the note goes to everyone and sounds here JAM_JITTER_MS later, together.
          if (!jamApiRef.current?.sendNote(target.id, true, action.note, action.velocity, playOn)) playOn();
          midiSendNoteOn(action.note, action.velocity);
          // Hardware takes record through the SAME path as the QWERTY keyboard.
          if (recordingRef.current && engine.isRunning()) {
            midiRec.current.set(action.note, { key: action.note, vel: action.velocity, startBeats: engine.posBeats() });
          }
          break;
        }
        case 'noteOff': {
          // A note that started on an instrument pad ends there, even if the selection moved.
          const onPad = midiPadNotes.current.get(action.note);
          if (onPad) {
            midiPadNotes.current.delete(action.note);
            engine.padNoteUp(onPad.pad, onPad.semi);
            midiSendNoteOff(action.note);
            break;
          }
          const target = armed;
          if (target) {
            const playOff = () => engine.instrumentNoteOff(target, action.note);
            if (!jamApiRef.current?.sendNote(target.id, false, action.note, 0, playOff)) playOff();
          }
          midiSendNoteOff(action.note);
          const rec = midiRec.current.get(action.note);
          if (rec && target) {
            midiRec.current.delete(action.note);
            // Jam Commit mode keeps the notes in the local Takes tray; otherwise (and in Live mode)
            // they go straight into the clip and sync to everyone through the doc.
            if (recordingRef.current && !jamApiRef.current?.captureMidiNote(target.id, rec, engine.posBeats())) {
              commitRecordedNote(target.id, rec, engine.posBeats(), mutate);
            }
          }
          break;
        }
        case 'modWheel': {
          const target = padTrack ?? armed ?? autoArm();
          if (target) engine.setInstrumentModWheel(target, action.value);
          break;
        }
        case 'pitchBend': {
          const target = padTrack ?? armed ?? autoArm();
          if (target) engine.setInstrumentPitchBend(target, action.value);
          break;
        }
        case 'sustain': {
          const target = padTrack ?? armed;
          if (target && !action.on) {
            engine.getInstrument(target.id)?.allNotesOff(false);
          }
          break;
        }
        case 'macro': {
          // The eight knobs drive the armed instrument's macros, else whatever page MEKA's control
          // area is on (Sound / Group / Master) — screen knob N and hardware knob N are one slot.
          // In MEKA the knobs follow the screen (the selected pad's page); elsewhere, the armed synth.
          if (armed && !inMeka) {
            let how: 'live' | 'reload' | null = null;
            mutate((d) => { how = writeInstrumentMacro(d, armed.id, action.index, action.value); });
            if (how === 'live') engine.getInstrument(armed.id)?.setMacro(action.index, action.value);
            else if (how === 'reload') pushTrackPatch(armed.id);
            break;
          }
          const { page } = focusedPage(docRefForChoice.current, selectedPadRef.current);
          const param = page?.params[action.index];
          if (!page || !param) break;
          mutate((d) => param.set(d, fromUnit(param, action.value)));
          if (page.instrumentTrackId) {
            const tid = page.instrumentTrackId;
            if (Array.isArray(docRefForChoice.current.arrangement.find((t) => t.id === tid)?.instrument?.patch?.macros)) engine.getInstrument(tid)?.setMacro(action.index, action.value);
            else pushTrackPatch(tid);
          }
          break;
        }
        case 'nav': {
          const pad = selectedPadRef.current;
          const a = action.action;
          if (a === 'pagePrev' || a === 'pageNext') stepControlPage(docRefForChoice.current, pad, a === 'pagePrev' ? -1 : 1);
          else if (a === 'tabMaster') setControlFocus({ tab: 'master' });
          else if (a === 'tabGroup') setControlFocus({ tab: 'group' });
          else if (a === 'tabSound') setControlFocus({ tab: 'sound' });
          else if (a === 'sampling') window.dispatchEvent(new Event('meka:sampler'));
          else {
            const banks = Math.max(1, Math.ceil(docRefForChoice.current.kit.length / 16));
            const b = (Math.floor(pad / 16) + (a === 'groupNext' ? 1 : -1) + banks) % banks;
            setSelectedPad(b * 16 + (pad % 16));
          }
          break;
        }
        case 'transport':
          if (action.action === 'play') handlePlay();
          else if (action.action === 'stop') handleStop();
          else if (action.action === 'record') setRecording((v) => !v);
          break;
      }
    });
  }, [mutate, autoArm]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSampleFile = useCallback(async (padIdx: number, file: File) => {
    const engine = BeatsEngine.get();
    await engine.init();
    const ctx = engine.getContext();
    if (!ctx) return;
    const name = file.name.replace(/\.[^.]+$/, '');
    const result = await ingestSample(file, name, ctx); // content-addressed OPFS + decode
    if (!result) return;
    engine.setSampleBuffer(result.ref.key, result.buffer);
    mutate((d) => {
      const p = d.kit[padIdx];
      if (!p) return;
      detachPadInstrument(d, padIdx); // replacing an instrument pad with a sample — drop its track
      p.source = 'sample';
      p.sample = result.ref;
      p.name = name.slice(0, 18);
      p.empty = false; // a sample fills a placeholder pad
    });
    setSelectedPad(padIdx);
    engine.trigger(padIdx, 110); // audition — instant feedback that the load worked
    // Durable locker copy in the background; the URL makes the groove portable across devices.
    void backupToLocker(result.ref).then((url) => {
      if (url) mutate((d) => { const p = d.kit[padIdx]; if (p?.sample?.key === result.ref.key) p.sample.lockerUrl = url; });
    });
  }, [mutate]);

  const handleBounce = useCallback(async () => {
    setBusy('bounce');
    try {
      const engine = BeatsEngine.get();
      await engine.init();
      const result = await renderGroove(doc, engine.getSampleEntries(), { range: 'song', bitDepth: 24 });
      if (!result) { flash('Nothing to render yet'); return; }
      // Never let a bounce quietly lose tracks — say what didn't make it.
      const missing = result.skippedInstruments
        ? ` · ${result.skippedInstruments} instrument track${result.skippedInstruments > 1 ? 's' : ''} failed to render`
        : '';
      if (onRenderTake) {
        // Inside a production with a song selected: the bounce IS a take on that song.
        onRenderTake({ blob: result.blob, name: doc.name || 'Groove', durationSec: result.seconds });
        flash(`Take saved to “${takeTargetName || 'the song'}” — ${result.seconds.toFixed(1)}s${missing}`);
      } else {
        downloadBlob(result.blob, `${(doc.name || 'groove').replace(/[^\w -]+/g, '')}.wav`);
        flash(`Rendered ${result.seconds.toFixed(1)}s — 24-bit WAV downloaded${missing}`);
      }
    } catch (e) { console.warn('[beats] bounce failed', e); flash('Render failed'); }
    finally { setBusy(null); }
  }, [doc, flash]);

  const handleSendToFabula = useCallback(async () => {
    setBusy('fabula');
    try {
      const engine = BeatsEngine.get();
      await engine.init();
      const res = await sendGrooveToFabula(doc, engine.getSampleEntries());
      if (res === 'ok') flash('Sent to Fabula — opening the editor…');
      else flash('Nothing to send yet');
    } catch (e) { console.warn('[beats] send to fabula failed', e); flash('Send to Fabula failed'); }
    finally { setBusy(null); }
  }, [doc, flash]);

  const handlePublish = useCallback(async () => {
    setBusy('publish');
    try {
      const engine = BeatsEngine.get();
      await engine.init();
      const status = await publishGroove(doc, engine.getSampleEntries());
      if (status === 'ok') flash('Opening publisher — finish in the Album Creator');
      else if (status === 'no-auth') flash('Sign in to publish to Chora');
      else flash('Render failed');
    } catch (e) { console.warn('[beats] publish failed', e); flash('Publish failed'); }
    finally { setBusy(null); }
  }, [doc, flash]);

  const handleExportDawproject = useCallback(async () => {
    setBusy('dawproject');
    try {
      const engine = BeatsEngine.get();
      await engine.init();
      const buffers = engine.getSampleEntries();
      // Print the song so the project makes sound the moment it opens in Bitwig/Studio One.
      const print = await renderGroove(doc, buffers, { range: 'song', bitDepth: 24 });
      const blob = await exportDawproject({
        doc,
        buffers,
        printBlobBytes: print ? new Uint8Array(await print.blob.arrayBuffer()) : undefined,
        printSeconds: print?.seconds,
        artist: auth.currentUser?.displayName || '',
      });
      downloadBlob(blob, `${(doc.name || 'groove').replace(/[^\w -]+/g, '')}.dawproject`);
      flash('.dawproject exported — opens in Bitwig, Studio One and Cubase');
    } catch (e) { console.warn('[beats] dawproject export failed', e); flash('Export failed'); }
    finally { setBusy(null); }
  }, [doc, flash]);

  const handleImportDawproject = useCallback(async (file: File) => {
    setBusy('import');
    try {
      const engine = BeatsEngine.get();
      await engine.init();
      const ctx = engine.getContext();
      if (!ctx) { flash('Audio engine not ready'); return; }
      const result = await importDawproject(new Uint8Array(await file.arrayBuffer()), auth.currentUser?.uid || '', ctx);
      if (!result) { flash('Not a readable .dawproject file'); return; }
      for (const [key, buf] of result.samples) engine.setSampleBuffer(key, buf);
      replace(result.doc);
      setActivePatternId(result.doc.patterns[0]?.id || '');
      setImportReport(result.report);
    } catch (e) { console.warn('[beats] dawproject import failed', e); flash('Import failed'); }
    finally { setBusy(null); }
  }, [flash, replace]);

  // Load a Melos Samples-room candidate onto a pad, stamping its clearance state on the pad.
  const loadMelosSample = useCallback(async (padIdx: number, ref: MelosSampleRef) => {
    setBusy('melos-sample');
    try {
      const engine = BeatsEngine.get();
      await engine.init();
      const ctx = engine.getContext();
      if (!ctx) return;
      const res = await fetch(ref.url);
      if (!res.ok) { flash('Could not fetch that sample'); return; }
      const ingested = await ingestSample(await res.blob(), ref.title, ctx);
      if (!ingested) { flash('Could not decode that sample'); return; }
      engine.setSampleBuffer(ingested.ref.key, ingested.buffer);
      mutate((d) => {
        const p = d.kit[padIdx];
        if (!p) return;
        detachPadInstrument(d, padIdx); // replacing an instrument pad with a sample — drop its track
        p.source = 'sample';
        p.sample = ingested.ref;
        p.name = ref.title.slice(0, 18);
        p.melos = { sampleId: ref.id, title: ref.title, clearance: ref.clearance };
        p.empty = false;
      });
      setSelectedPad(padIdx);
      engine.trigger(padIdx, 110);
      flash(ref.blocking ? `Loaded — clearance: ${ref.clearanceLabel}` : `Loaded ${ref.title}`);
      void backupToLocker(ingested.ref);
    } catch (e) { console.warn('[beats] melos sample load failed', e); flash('Could not load that sample'); }
    finally { setBusy(null); }
  }, [flash, mutate]);

  // Drop a drum loop on the pattern bar → its groove lands as a new pattern on the pads.
  const handleTranscribeFile = useCallback(async (file: File) => {
    setBusy('transcribe');
    try {
      const engine = BeatsEngine.get();
      await engine.init();
      const ctx = engine.getContext();
      if (!ctx) { flash('Audio engine not ready'); return; }
      const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
      const result = transcribeToPattern(buffer, doc.bpm, file.name.replace(/\.[^.]+$/, '').slice(0, 20));
      if (!result) { flash('No clear drum hits found in that file'); return; }
      let newId = '';
      mutate((d) => { newId = addTranscribedPattern(d, result); });
      if (newId) setActivePatternId(newId);
      flash(result.report);
    } catch (e) { console.warn('[beats] transcribe failed', e); flash('Could not read that audio file'); }
    finally { setBusy(null); }
  }, [doc.bpm, flash, mutate]);

  // The Group the user is working in follows the selected pad (MEKA's Group buttons select pads).
  const currentGroup = padGroup(selectedPad);
  const addPattern = useCallback(() => {
    let id = '';
    mutate((d: GrooveDoc) => { id = newGroupPattern(d, currentGroup).id; });
    if (id) setActivePatternId(id);
  }, [mutate, currentGroup, setActivePatternId]);
  // Entering a Group: edit its pick (or first pattern). A Group with no patterns yet gets its
  // first one, so step edits on its pads never land in another Group's pattern.
  useEffect(() => {
    if (pattern && patternGroup(pattern) === currentGroup) return;
    const list = groupPatterns(doc, currentGroup);
    if (list.length) { setActivePatternId(choice[currentGroup] && list.some((x) => x.id === choice[currentGroup]) ? choice[currentGroup]! : list[0].id); return; }
    if (currentGroup > 0) addPattern();
  }, [currentGroup]); // eslint-disable-line react-hooks/exhaustive-deps

  // Launch a MEKA scene: every Group switches to the scene's pattern at the next bar.
  const launchScene = useCallback((scene: Scene) => {
    const ids = scenePatternIds(doc, scene);
    if (!ids.length) return;
    setChoice((c) => { const n = { ...c }; for (const [g, pid] of Object.entries(scene.slots)) if (pid) n[Number(g)] = pid; return n; });
    const mine = scene.slots[currentGroup];
    if (mine) setActivePatternIdRaw(mine);
    setPlayMode('pattern');
    BeatsEngine.get().queuePatternSet(ids);
  }, [doc, currentGroup]);

  // Live pad recording: armed record + a running transport → pad hits land in the playing
  // pattern of the pad's Group (padRecord.ts). One undo step per pass.
  const recQuantRef = React.useRef(recQuantize);
  recQuantRef.current = recQuantize;
  useEffect(() => {
    let pass = '';
    return BeatsEngine.get().onPadHit((hit) => {
      if (!recordingRef.current || hit.beat === null) { pass = ''; return; }
      const engine = BeatsEngine.get();
      if (!pass) pass = `pad-rec:${Date.now()}`;
      const playing = engine.playingPatternIds();
      mutate((d) => { recordPadHit(d, { padIdx: hit.padIdx, vel: hit.vel, beat: hit.beat!, mode: hit.mode, semi: hit.semi }, playing, recQuantRef.current || hit.repeat); }, { coalesce: pass });
    });
  }, [mutate]);

  // Genre drum presets — drop a ready-made pattern in and set its tempo/swing.
  const [showGenres, setShowGenres] = useState(false);
  const [ulOpen, setUlOpen] = useState(false);
  const applyGenre = useCallback((preset: GenrePreset) => {
    let id = '';
    mutate((d: GrooveDoc) => { id = applyGenrePreset(d, preset); });
    // Genre patterns play the default kit (Group A): go there and onto the kick, so the new pattern
    // shows in the pads, the step sequencer and the piano roll rather than landing out of sight.
    if (padGroup(selectedPad) !== 0) setSelectedPad(0);
    if (id) setActivePatternId(id);
    setShowGenres(false);
  }, [mutate, selectedPad]);

  // Hand-drum library — Amara performs a rhythm into the SOMA pad's piano roll.
  const [showHands, setShowHands] = useState(false);
  const applyHands = useCallback((c: HandDrumChoice) => {
    const persona = playerById('amara')?.personas.find((p) => p.id === c.personaId) ?? playerById('amara')!.personas[0];
    let res: HandPatternResult | null = null;
    mutate((d: GrooveDoc) => {
      res = applyHandPattern(d, selectedPad, {
        rhythm: c.rhythm, persona: persona.traits, mood: c.mood, role: c.role, bars: c.bars, seed: c.seed, setTempo: c.setTempo,
        name: `${c.rhythm.name} · ${c.mood} ${c.role}`,
      }, (dd) => addInstrumentToNextPad(dd, 'soma', undefined, 'SOMA').padIdx);
    });
    const r = res as HandPatternResult | null;
    if (!r) return;
    setSelectedPad(r.padIdx);
    setActivePatternId(r.patternId);
    void BeatsEngine.get().init().then(() => BeatsEngine.get().syncInstruments());
  }, [mutate, selectedPad]);

  // Genre MIDI basslines — spawn a BAJO on the next pad and write the line into the active pattern.
  const [showBass, setShowBass] = useState(false);
  const applyBass = useCallback((preset: BasslinePreset) => {
    const pid = pattern?.id;
    if (!pid) return;
    mutate((d: GrooveDoc) => { applyBassline(d, pid, preset); });
    setShowBass(false);
  }, [mutate, pattern?.id]);

  // 12 Admin-Seeded Classic Book Literary Score & Chora DAW Showcase Template Projects
  const [showLiteraryScores, setShowLiteraryScores] = useState(false);
  const [showcaseScoreMode, setShowcaseScoreMode] = useState<'full-film-score' | 'light-background'>('full-film-score');
  const loadClassicBookTemplate = useCallback((themeId: string, trackIdx = 0, mode: 'full-film-score' | 'light-background' = showcaseScoreMode) => {
    const master = getMasterBookScore(themeId);
    const nextDoc = buildClassicBookGrooveDoc(themeId, auth.currentUser?.uid || 'lorea-classic-showcase', trackIdx, mode);
    replace(nextDoc);
    setActivePatternId(nextDoc.patterns[trackIdx]?.id || nextDoc.patterns[0]?.id || '');
    setPlayMode('song');
    setSongStartBeats(nextDoc.loop?.startBeats ?? 0);
    setView('timeline');
    setShowLiteraryScores(false);
    void BeatsEngine.get().init().then(async () => {
      BeatsEngine.get().syncInstruments();
      if (master) {
        const hydrated = await hydrateClassicBookGrooveAudioStems(nextDoc, themeId);
        replace({ ...hydrated, updatedAt: Date.now() });
      }
    });
    const durTag = nextDoc.showcaseMetadata?.durationFormatted || '3:20';
    flash(
      mode === 'full-film-score'
        ? `Loaded Chora Showcase Template "${nextDoc.name}" (${durTag} Full Film Score · 5 MPE Synths + 3 ACE-Step 2.5 / YuE2 Stems)`
        : `Loaded Light Reading Background "${nextDoc.name}" (Light Chamber Mode)`
    );
  }, [replace, setView, flash, showcaseScoreMode]);

  useEffect(() => {
    void seedAdminClassicBookProjects(auth.currentUser?.uid || 'lorea-admin-composer');
    if (payload?.classicBookThemeId) {
      loadClassicBookTemplate(payload.classicBookThemeId, payload.classicBookTrackIndex || 0);
      return;
    }
    try {
      const pendingRaw = sessionStorage.getItem('melos_classic_book_template_pending');
      if (pendingRaw) {
        sessionStorage.removeItem('melos_classic_book_template_pending');
        const parsed = JSON.parse(pendingRaw);
        if (parsed?.bookThemeId) {
          loadClassicBookTemplate(parsed.bookThemeId, parsed.trackIndex || 0);
        }
      }
    } catch {
      // ignore
    }
  }, [payload?.classicBookThemeId, payload?.classicBookTrackIndex, loadClassicBookTemplate]);

  // ── Aria music-assistant wiring ──────────────────────────────────────────────
  // Publishes the beat's live state and exposes production actions Aria can take.
  // Actions reuse the existing engine-safe handlers above. See ariaContext.ts.
  const aiFindGenre = (q: unknown) => {
    const s = String(q ?? '').toLowerCase().trim();
    if (!s) return undefined;
    return GENRE_PRESETS.find(g => g.name.toLowerCase() === s || g.genre.toLowerCase() === s || g.id.toLowerCase() === s)
      || GENRE_PRESETS.find(g => g.name.toLowerCase().includes(s) || g.genre.toLowerCase().includes(s));
  };
  const aiFindBass = (q: unknown) => {
    const s = String(q ?? '').toLowerCase().trim();
    if (!s) return undefined;
    return BASSLINES.find(b => b.name.toLowerCase() === s || b.genre.toLowerCase() === s || b.id.toLowerCase() === s)
      || BASSLINES.find(b => b.name.toLowerCase().includes(s) || b.genre.toLowerCase().includes(s));
  };

  useAriaSurface({
    surface: 'melos-beats',
    domain: 'music',
    title: `Making a beat${doc.name ? `: ${doc.name}` : ''}`,
    summary: `${doc.bpm} BPM, swing ${Math.round((doc.swing || 0) * 100)}%. Active pattern "${pattern?.name || '—'}" of ${doc.patterns.length}. Help with tempo, groove, genre feel, drum patterns, and basslines.`,
    data: {
      bpm: doc.bpm,
      swing: doc.swing,
      activePattern: pattern?.name,
      patterns: doc.patterns.map(p => p.name),
      availableGenres: GENRE_PRESETS.map(g => g.name),
      availableBasslines: BASSLINES.map(b => `${b.name} (${b.genre})`),
    },
    actions: [
      { id: 'setTempo', label: 'Set tempo',
        description: 'Set the project tempo in BPM (20–300).', params: { bpm: 'the tempo in beats per minute' } },
      { id: 'setSwing', label: 'Set swing',
        description: 'Set the swing/shuffle amount, 0 (straight) to 100 (max).', params: { amount: 'swing percent 0–100' } },
      { id: 'applyGenre', label: 'Apply a genre groove',
        description: `Drop in a ready-made drum pattern + tempo/swing for a genre. Available: ${GENRE_PRESETS.map(g => g.name).join(', ')}.`,
        params: { genre: 'the genre name from the available list' } },
      { id: 'addBassline', label: 'Add a bassline',
        description: `Spawn a bass instrument and write a genre bassline into the active pattern. Available: ${BASSLINES.map(b => b.name).join(', ')}.`,
        params: { genre: 'a bassline name or genre from the available list' } },
    ],
    handlers: {
      setTempo: ({ bpm }) => {
        const n = Math.round(Number(bpm));
        if (!Number.isFinite(n)) return { ok: false, message: 'Give a number for BPM.' };
        const clamped = Math.max(20, Math.min(300, n));
        mutate((d: GrooveDoc) => { d.bpm = clamped; });
        return { ok: true, message: `Tempo set to ${clamped} BPM.` };
      },
      setSwing: ({ amount }) => {
        const n = Number(amount);
        if (!Number.isFinite(n)) return { ok: false, message: 'Give a number 0–100 for swing.' };
        const s = Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
        mutate((d: GrooveDoc) => { d.swing = s; });
        return { ok: true, message: `Swing set to ${Math.round(s * 100)}%.` };
      },
      applyGenre: ({ genre }) => {
        const preset = aiFindGenre(genre);
        if (!preset) return { ok: false, message: `No genre preset matching "${genre}".` };
        applyGenre(preset);
        return { ok: true, message: `Applied the ${preset.name} groove (${preset.bpm} BPM).` };
      },
      addBassline: ({ genre }) => {
        if (!pattern?.id) return { ok: false, message: 'No active pattern to add a bassline to.' };
        const preset = aiFindBass(genre);
        if (!preset) return { ok: false, message: `No bassline matching "${genre}".` };
        applyBass(preset);
        return { ok: true, message: `Added the ${preset.name} bassline.` };
      },
    },
  }, [doc.bpm, doc.swing, doc.name, activePatternId, doc.patterns.length]);

  // Right-click / long-press a pattern chip — the shared design-system menu.
  const patternMenu = useContextMenu<string>((id) => {
    const p = doc.patterns.find((x) => x.id === id);
    if (!p) return [];
    return [
      { kind: 'header', label: p.name },
      { id: 'rename', label: 'Rename…', onSelect: () => { const name = window.prompt('Pattern name', p.name)?.trim(); if (name) mutate((d) => { const pt = d.patterns.find((x) => x.id === id); if (pt) pt.name = name; }); } },
      { id: 'dup', label: 'Duplicate', onSelect: () => mutate((d) => { const src = d.patterns.find((x) => x.id === id); if (!src) return; const copy = JSON.parse(JSON.stringify(src)); copy.id = grooveUid() + grooveUid(); copy.name = `${src.name} copy`; d.patterns.push(copy); setTimeout(() => setActivePatternId(copy.id)); }) },
      { id: 'clear', label: 'Clear steps', onSelect: () => mutate((d) => { const pt = d.patterns.find((x) => x.id === id); if (pt) pt.steps = {}; }) },
      { kind: 'separator' },
      { id: 'del', label: 'Delete pattern', danger: true, disabled: doc.patterns.length <= 1, onSelect: () => mutate((d) => { const i = d.patterns.findIndex((x) => x.id === id); if (i < 0 || d.patterns.length <= 1) return; d.patterns.splice(i, 1); forgetPattern(d, id); syncSongFromSections(d); if (pattern?.id === id) setActivePatternId(d.patterns[Math.max(0, i - 1)].id); }) },
    ] as MenuNode<string>[];
  });

  // The phone morph — the SAME GrooveDoc, folded into focused full-screen MODES. Gated on the live
  // viewport so the desktop layout below is never touched. Modals (instrument picker, EQ, Muse,
  // grooves) still mount from the shared tail after the branch, so nothing phone-specific is lost.
  if (vp.isPhone) {
    return (
      <>
        <BeatsMobileShell
          doc={doc}
          pattern={pattern}
          selectedPad={selectedPad}
          beats={snap.beats}
          running={snap.running}
          suspended={snap.suspended}
          frame={snap.frame}
          playMode={playMode}
          meters={snap.meters}
          limiterReduction={snap.limiterReduction}
          recording={recording}
          onMutate={mutate}
          onSelectPad={setSelectedPad}
          onPlay={handlePlay}
          onStop={handleStop}
          onToggleRecord={() => setRecording((v) => !v)}
          onSetPlayMode={setPlayMode}
          onPlayFrom={(fromBeats) => { setPlayMode('song'); setSongStartBeats(fromBeats); void BeatsEngine.get().init().then(() => BeatsEngine.get().play('song', { fromBeats })); }}
          onLoadSampleFile={(padIdx, file) => { void loadSampleFile(padIdx, file); }}
          melosSamples={melosSamples}
          onLoadMelosSample={(padIdx, ref) => { void loadMelosSample(padIdx, ref); }}
          onOpenInstrument={(id) => setOpenInstrumentId(id)}
          onAddInstrument={(dest?: 'meka' | 'track') => { setInstrumentDest(dest || 'meka'); setShowInstrumentPicker(true); }}
          onClose={onClose}
          hideClose={embedded}
          embedded={embedded}
          headerRef={phoneHeaderRef}
          headerSlot={grooveDock(phoneHeaderRef, 'inline')}
        />
        {showInstrumentPicker && (
          <InstrumentPicker
            destination={instrumentDest === 'track' ? 'as an independent MIDI track' : undefined}
            onClose={() => setShowInstrumentPicker(false)}
            onPick={(type) => {
              let newId = ''; let landedPad = 0;
              if (instrumentDest === 'track') {
                // Independent, clip-driven MIDI track — behaves like an audio track (own mixer strip,
                // draw MIDI clips on its lane). Send it to a MEKA pad later via the track's right-click.
                mutate((d) => { newId = addInstrument(d, type); });
                void BeatsEngine.get().init().then(() => BeatsEngine.get().syncInstruments());
                setShowInstrumentPicker(false);
                setView('timeline'); // the arranger — its new lane is there
                if (newId) setTimeout(() => setOpenInstrumentId(newId), 60);
                return;
              }
              mutate((d) => { const r = addInstrumentToNextPad(d, type); newId = r.trackId; landedPad = r.padIdx; });
              setSelectedPad(landedPad);
              void BeatsEngine.get().init().then(() => BeatsEngine.get().syncInstruments());
              setShowInstrumentPicker(false);
              setView('machine'); // MEKA — the pad it filled is right there
              if (newId) setTimeout(() => setOpenInstrumentId(newId), 60);
            }}
          />
        )}
        {padPickerFor !== null && (
          <InstrumentPicker
            destination={`on pad ${padPickerFor + 1}`}
            onClose={() => setPadPickerFor(null)}
            onPick={(type) => {
              const padIdx = padPickerFor;
              let newId = '';
              mutate((d) => {
                newId = addPadInstrument(d, padIdx, type);
                const pad = d.kit[padIdx];
                if (pad) {
                  const wasEmpty = pad.empty;
                  pad.source = 'instrument'; pad.instrumentTrackId = newId; pad.empty = false;
                  if (pad.instrumentNote === undefined) pad.instrumentNote = 60;
                  if (wasEmpty) { pad.name = instrumentLabel(type); pad.color = instrumentColor(type); }
                }
              });
              void BeatsEngine.get().init().then(() => BeatsEngine.get().syncInstruments());
              setPadPickerFor(null);
              if (newId) setTimeout(() => setOpenInstrumentId(newId), 60);
            }}
          />
        )}
        {openInstrumentId && (() => {
          const t = doc.arrangement.find((x) => x.id === openInstrumentId && x.kind === 'instrument');
          if (!t) return null;
          const close = () => setOpenInstrumentId(null);
          if (t.instrument?.type === 'kera') return <KeraPanel doc={doc} track={t} onMutate={mutate} onClose={close} />;
          if (t.instrument?.type === 'bajo') return <BajoPanel doc={doc} track={t} onMutate={mutate} onClose={close} />;
          if (t.instrument?.type === 'aura') return <AuraPanel doc={doc} track={t} onMutate={mutate} onClose={close} />;
          if (t.instrument?.type === 'soma') return <SomaPanel doc={doc} track={t} onMutate={mutate} onClose={close} />;
          if (t.instrument?.type === 'lyra') return <LyraPanel doc={doc} track={t} onMutate={mutate} onClose={close} />;
          if (isSuite(t.instrument?.type as InstrumentType)) return <VelaPanel doc={doc} track={t} onMutate={mutate} onClose={close} />;
          return <InstrumentPanel doc={doc} track={t} onMutate={mutate} onClose={close} />;
        })()}
        {showEq && <SpectraPanel doc={doc} onMutate={mutate} onClose={() => setShowEq(false)} />}
        {showLibrary && <MuseLibrary doc={doc} onMutate={mutate} onClose={() => setShowLibrary(false)} />}
      </>
    );
  }

  // ── The menu bar — the proper DAW File menu. A Melos Project (.melos) is the complete
  // project file; a Melos Song (.dawproject) is the interchange song that Bitwig, Studio One
  // and Cubase open natively.
  const menus: MenuGroup[] = [
    {
      label: 'File',
      items: [
        { id: 'new', label: 'New project', onSelect: newGroove },
        // The projects drawer is anchored in the pattern bar, which Mixer/Project don't show.
        { id: 'open', label: 'My Productions…', hint: 'projects', onSelect: () => { if (view === 'mixer' || view === 'project') setView('machine'); setShowGrooves(true); } },
        { id: 'save', label: 'Save now', onSelect: () => { void saveNow(); } },
        { id: 'copy', label: 'Save a copy', onSelect: handleSaveCopy },
        'sep',
        { id: 'open-melos', label: 'Open Melos Project…', hint: '.melos', onSelect: () => melosFileRef.current?.click() },
        { id: 'save-melos', label: 'Save Melos Project', hint: '.melos + audio', onSelect: () => { void exportGrooveFile(doc); } },
        'sep',
        { id: 'import-song', label: 'Import Melos Song…', hint: '.dawproject', onSelect: () => dawFileRef.current?.click() },
        { id: 'export-song', label: 'Export Melos Song', hint: '.dawproject', disabled: !!busy, onSelect: () => { void handleExportDawproject(); } },
        { id: 'export-midi', label: 'Export MIDI', hint: '.mid', onSelect: () => downloadMidi(exportProjectMidi(doc), doc.name || 'Melos') },
        { id: 'import-xml', label: 'Import score…', hint: 'MusicXML / .mxl', onSelect: () => musicXmlRef.current?.click() },
        { id: 'export-xml', label: 'Export score', hint: 'MusicXML', onSelect: handleExportMusicXml },
        'sep',
        { id: 'bounce', label: onRenderTake ? `Bounce to take${takeTargetName ? ` — ${takeTargetName}` : ''}` : 'Bounce to WAV', hint: '24-bit', disabled: !!busy, onSelect: () => { void handleBounce(); } },
        { id: 'fabula', label: 'Send to Fabula', disabled: !!busy, onSelect: () => { void handleSendToFabula(); } },
        { id: 'publish', label: 'Publish to Chora…', disabled: !!busy, onSelect: () => { void handlePublish(); } },
      ],
    },
    {
      label: 'Edit',
      items: [
        { id: 'undo', label: 'Undo', hint: 'Ctrl+Z', disabled: !canUndo, onSelect: undo },
        { id: 'redo', label: 'Redo', hint: 'Ctrl+Shift+Z / Ctrl+Y', disabled: !canRedo, onSelect: redo },
        'sep',
        { id: 'quantize', label: 'Quantize pattern', disabled: !pattern, onSelect: () => { if (pattern) mutate((d) => { const p = d.patterns.find((x) => x.id === pattern.id); if (p) quantizePattern(p, 1); }); } },
        { id: 'fill', label: 'Auto-fill last bar', disabled: !pattern, onSelect: () => { if (pattern) mutate((d) => { const p = d.patterns.find((x) => x.id === pattern.id); if (p) autoFill(d, p, 4); }); } },
        { id: 'clear', label: 'Clear pattern steps', danger: true, disabled: !pattern, onSelect: () => { if (pattern) mutate((d) => { const p = d.patterns.find((x) => x.id === pattern.id); if (p) p.steps = {}; }); } },
        'sep',
        { id: 'new-pattern', label: 'New pattern', onSelect: addPattern },
      ],
    },
    {
      label: 'View',
      items: [
        ...AVAILABLE_VIEWS.map((v) => ({
          id: v,
          label: v === 'machine' ? 'MEKA' : v === 'glass' ? 'Glass' : v.charAt(0).toUpperCase() + v.slice(1),
          checked: view === v,
          onSelect: () => setView(v),
        })),
        'sep' as const,
        { id: 'diag', label: 'Engine diagnostics', checked: showDiagnostics, onSelect: () => setShowDiagnostics((v) => !v) },
      ],
    },
    {
      label: 'Options',
      items: [
        { id: 'metro', label: 'Metronome', checked: metronomeOn, onSelect: () => setMetronomeOn((v) => !v) },
        { id: 'pre0', label: 'Pre-roll: off', checked: preRollBars === 0, onSelect: () => setPreRollBars(0) },
        { id: 'pre1', label: 'Pre-roll: 1 bar', checked: preRollBars === 1, onSelect: () => setPreRollBars(1) },
        { id: 'pre2', label: 'Pre-roll: 2 bars', checked: preRollBars === 2, onSelect: () => setPreRollBars(2) },
        'sep',
        { id: 'midi', label: 'MIDI controllers…', onSelect: () => setShowMidi(true) },
        { id: 'eq', label: 'Mix-bus EQ…', onSelect: () => { void BeatsEngine.get().init().then(() => setShowEq(true)); } },
        { id: 'library', label: 'Muse Library…', onSelect: () => setShowLibrary(true) },
      ],
    },
  ];

  return (
    <div
      className={`${embedded ? 'absolute inset-0' : 'fixed inset-0 z-[100]'} flex flex-col text-white`}
      style={{ background: `radial-gradient(1000px 460px at 12% -12%, rgba(107,0,153,0.30), transparent 60%), ${WASH_BG}` }}
    >
      {shellMenuBar && (
        <StudioMenuPublisher owner="beats" menus={menus} save={{ state: saveState, onSave: () => { void saveNow(); }, what: 'groove' }} />
      )}
      {/* Transport row + the collaboration pill at its right end. The row is the panel's anchor,
          so the collab panel opens just below the header (shell menu bar or not). */}
      <div ref={transportRowRef} className="flex items-stretch flex-none min-w-0">
      <div className="flex-1 min-w-0">
      <TransportBar
        doc={doc}
        running={snap.running}
        suspended={snap.suspended}
        view={view}
        availableViews={AVAILABLE_VIEWS}
        activePatternId={pattern?.id || ''}
        playMode={playMode}
        showDiagnostics={showDiagnostics}
        onSetView={setView}
        onPlay={handlePlay}
        onStop={handleStop}
        onPanic={() => BeatsEngine.get().panic()}
        onSetBpm={(bpm) => mutate((d) => { d.bpm = bpm; })}
        onSetSwing={(s) => mutate((d) => { d.swing = s; })}
        onSetKey={(k) => mutate((d) => { if (k) d.key = k; else delete d.key; })}
        onSetTimeSig={(num, den) => mutate((d) => {
          const rest = (d.meter ?? []).filter((m) => m.bar !== 0);
          d.meter = num === 4 && den === 4 && !rest.length ? undefined : [{ bar: 0, num, den }, ...rest];
          if (!d.meter) delete d.meter;
          syncSongFromSections(d); // song sections are counted in bars
        })}
        beats={snap.beats}
        onSetLoop={(loop) => mutate((d) => { d.loop = loop; })}
        onSetPlayMode={setPlayMode}
        onToggleDiagnostics={() => setShowDiagnostics((v) => !v)}
        onOpenMidi={() => setShowMidi(true)}
        onOpenVoice={() => setShowVoice((v) => !v)}
        voiceOpen={showVoice}
        midiConnected={midiConnected}
        onPublish={() => { void handlePublish(); }}
        busy={busy}
        recording={recording}
        onToggleRecord={handleToggleRecord}
        metronomeOn={metronomeOn}
        onToggleMetronome={() => setMetronomeOn((v) => !v)}
        preRollBars={preRollBars}
        onCyclePreRoll={() => setPreRollBars((v) => (v + 1) % 3)}
        menuSlot={shellMenuBar ? undefined : <MenuBar menus={menus} />}
        hideClose={embedded}
        onClose={onClose}
      />
      </div>
      {/* The album project has its own collaborators/dock (ProjectView); this one is the groove's. */}
      <div className="flex items-center px-2 h-14 border-b border-white/10 bg-white/[0.04] shrink-0">
        {co.isShared && view !== 'project' && <VersionChip co={co} flash={flash} />}
        {co.isShared && (
          <button onClick={() => setShowJam((v) => !v)} title="Live jam — play, record and bring your rig"
            className={`mx-1.5 h-7 px-2.5 rounded-full border text-[11px] flex items-center gap-1.5 shrink-0 ${showJam || jam.joined ? 'border-[#FF4D8D]/50 text-[#FF4D8D] bg-[#FF4D8D]/10' : 'border-white/15 text-white/70 hover:bg-white/10'}`}>
            <Radio size={12} /> {jam.joined ? `Jam · ${jam.peers.length + 1}` : 'Jam'}
            {Object.keys(jam.ghosts).length > 0 && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
          </button>
        )}
        <button onClick={() => setShowInputs((v) => !v)} title="Hardware inputs — record a console or interface, many tracks at once"
          className={`mx-1.5 h-7 px-2.5 rounded-full border text-[11px] flex items-center gap-1.5 shrink-0 ${showInputs ? 'border-[#FF4D4D]/50 text-[#FF4D4D] bg-[#FF4D4D]/10' : 'border-white/15 text-white/70 hover:bg-white/10'}`}>
          <Cable size={12} /> Inputs
        </button>
        {grooveDock(transportRowRef, view === 'project' ? 'none' : 'inline')}
      </div>
      </div>

      <input
        ref={dawFileRef}
        type="file"
        accept=".dawproject,application/zip"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImportDawproject(f); e.target.value = ''; }}
      />
      <input
        ref={musicXmlRef}
        type="file"
        accept=".musicxml,.mxl,.xml,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImportMusicXml(f); e.target.value = ''; }}
      />
      <input
        ref={melosFileRef}
        type="file"
        accept=".melos,application/json"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleOpenMelosFile(f); e.target.value = ''; }}
      />

      {importReport && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-6" onClick={() => setImportReport(null)}>
          <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0A0A0D] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#00DAF3] font-semibold mb-3">Import report</p>
            <ul className="space-y-1.5 max-h-72 overflow-y-auto">
              {importReport.map((line, i) => (
                <li key={i} className={`text-[12px] ${i === 0 ? 'text-white font-medium' : 'text-white/55'}`}>{line}</li>
              ))}
            </ul>
            <p className="text-[10px] text-white/30 mt-3">Anything Beats can't play is preserved and re-emitted when you export — nothing was destroyed.</p>
            <button onClick={() => setImportReport(null)} className="mt-4 h-8 px-4 rounded-lg bg-white/10 border border-white/15 text-[12px] text-white hover:bg-white/20">Got it</button>
          </div>
        </div>
      )}

      {notice && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-xl bg-[#0A0A0D]/95 border border-white/15 text-[12px] text-white shadow-2xl">
          {notice}
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      {/* The pattern bar belongs to the pattern-editing pages — Mixer and Project have no
          business showing pattern chips. */}
      {view !== 'mixer' && view !== 'project' && (
      <div
        className="flex items-center gap-1.5 px-4 min-h-[38px] py-1 border-b border-white/[0.07] bg-black/20 flex-none"
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
        onDrop={(e) => {
          const f = e.dataTransfer.files?.[0];
          if (!f || !/^audio\//.test(f.type || '')) return;
          e.preventDefault();
          void handleTranscribeFile(f);
        }}
        title="Drop a drum loop here to transcribe it into a new pattern"
      >
        <div className="relative flex items-center gap-1.5 shrink-0">
          <input
            value={doc.name}
            title={doc.name}
            onChange={(e) => mutate((d) => { d.name = e.target.value; })}
            onBlur={() => { void saveNow(); }}
            aria-label="Groove name"
            className="w-36 xl:w-44 h-6 rounded-lg bg-transparent border border-transparent hover:border-white/10 focus:border-white/25 px-2 text-[11px] font-semibold text-white outline-none truncate"
          />
          <span
            className="w-1.5 h-1.5 rounded-full flex-none"
            title={saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : saveState === 'unsaved' ? 'Unsaved changes (autosaves)' : 'In-memory only — sign in to save'}
            style={{ background: saveState === 'saved' ? '#06D6A0' : saveState === 'saving' ? '#F59E0B' : saveState === 'unsaved' ? '#FF8C00' : 'rgba(255,255,255,0.25)' }}
          />
          <button onClick={() => setShowGrooves((v) => !v)} aria-label="My grooves" title="My grooves" className="h-6 w-6 shrink-0 grid place-items-center rounded-lg border border-white/10 text-white/40 hover:text-white">
            <FolderOpen size={11} />
          </button>
          <button onClick={newGroove} aria-label="New groove" title="New groove" className="h-6 w-6 shrink-0 grid place-items-center rounded-lg border border-white/10 text-white/40 hover:text-white">
            <FilePlus2 size={11} />
          </button>
          {showGrooves && (
            <div className="absolute top-8 left-0 z-30 w-64 max-h-72 overflow-y-auto rounded-xl border border-white/15 bg-[#0A0A0D]/95 backdrop-blur-xl p-1.5 shadow-2xl">
              <button onClick={handleSaveCopy} className="w-full h-7 mb-1 rounded-lg text-[10px] border border-[#00DAF3]/30 text-[#00DAF3] hover:bg-[#00DAF3]/10 flex items-center justify-center gap-1.5" title="Duplicate this groove as a new project in your cloud">
                <FilePlus2 size={10} /> Save a copy
              </button>
              <div className="flex gap-1 px-1 pb-1.5 mb-1 border-b border-white/10">
                <button onClick={() => { void exportGrooveFile(doc); }} className="flex-1 h-7 rounded-lg text-[10px] border border-white/12 text-white/60 hover:text-white hover:bg-white/5 flex items-center justify-center gap-1.5" title="Save this groove and its audio as a portable .melos file">
                  <Download size={10} /> Save as file
                </button>
                <button onClick={() => melosFileRef.current?.click()} className="flex-1 h-7 rounded-lg text-[10px] border border-white/12 text-white/60 hover:text-white hover:bg-white/5 flex items-center justify-center gap-1.5" title="Open a .melos file as a new groove">
                  <FolderOpen size={10} /> Open file
                </button>
              </div>
              {(sharedGrooves.length > 0 || sharedAlbums.length > 0) && (
                <div className="mb-1 pb-1 border-b border-white/10">
                  <p className="px-2 pt-1 pb-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-[#D0BCFF]/70">Shared with me</p>
                  {sharedGrooves.map((p) => (
                    <button key={p.id} onClick={() => { void openSharedGroove(p); }}
                      className={`w-full text-left px-2 py-1.5 rounded-lg text-[11px] truncate ${p.localId === doc.id ? 'text-white bg-white/10' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
                      title={`Live groove shared by ${p.names?.[p.ownerId] || 'a collaborator'}`}>
                      {p.title || 'Groove'} <span className="text-white/25 text-[9px] ml-1">{p.names?.[p.ownerId] || 'shared'}</span>
                    </button>
                  ))}
                  {sharedAlbums.map((p) => (
                    <button key={p.id} onClick={() => openSharedAlbum(p)}
                      className={`w-full text-left px-2 py-1.5 rounded-lg text-[11px] truncate ${sharedAlbum?.localId === p.localId ? 'text-white bg-white/10' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
                      title={`Album project shared by ${p.names?.[p.ownerId] || 'a collaborator'} — opens on the Project page`}>
                      <Disc3Icon size={10} className="inline -mt-0.5 mr-1 text-[#D0BCFF]" />{p.title || 'Album project'} <span className="text-white/25 text-[9px] ml-1">{p.names?.[p.ownerId] || 'shared'}</span>
                    </button>
                  ))}
                </div>
              )}
              {grooves.length === 0 && <p className="px-2 py-3 text-[11px] text-white/35">No saved grooves yet — they autosave as you work.</p>}
              {grooves.map((g) => (
                <div key={g.id} className="flex items-center gap-1 group">
                  <button
                    onClick={() => { setShowGrooves(false); void openGroove(g.id); }}
                    className={`flex-1 text-left px-2 py-1.5 rounded-lg text-[11px] truncate ${g.id === doc.id ? 'text-white bg-white/10' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
                  >
                    {g.name} <span className="text-white/25 font-mono text-[9px] ml-1">{g.bpm.toFixed(0)}bpm</span>
                  </button>
                  <button onClick={() => { void removeGroove(g.id); }} aria-label={`Delete ${g.name}`} className="w-6 h-6 shrink-0 grid place-items-center rounded text-white/20 hover:text-[#EF4444] opacity-0 group-hover:opacity-100">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="w-px h-4 bg-white/10 mx-1 shrink-0" />
        <span className="text-[9px] uppercase tracking-[0.18em] text-white/25 font-semibold mr-1 shrink-0 whitespace-nowrap" title="Patterns of the Group you're working in (select a pad in another Group to switch)">Patterns · {groupLetter(currentGroup)}</span>
        {patternMenu.node}
        <div className="flex items-center gap-1 min-w-[120px] flex-1 overflow-x-auto py-0.5" style={{ scrollbarWidth: 'none' }}>
          {doc.patterns.map((p, pIdx) => patternGroup(p) !== currentGroup ? null : (
            <button
              key={p.id}
              onClick={() => {
                setActivePatternId(p.id);
                if (doc.showcaseMetadata?.isShowcaseTemplate && doc.showcaseMetadata.bookThemeId) {
                  loadClassicBookTemplate(doc.showcaseMetadata.bookThemeId, pIdx, doc.showcaseMetadata.scoreMode || showcaseScoreMode);
                }
              }}
              {...patternMenu.bind(p.id)}
              title={p.name}
              className="h-6 px-2.5 rounded-lg text-[11px] border transition-colors shrink-0 whitespace-nowrap max-w-[140px] truncate"
              style={p.id === pattern?.id
                ? { background: `${SELECT}26`, borderColor: `${SELECT}66`, color: '#fff', fontWeight: 600 }
                : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.45)' }}
            >{p.name}</button>
          ))}
          <button onClick={addPattern} aria-label="New pattern" title="New pattern" className="h-6 w-6 shrink-0 grid place-items-center rounded-lg border border-white/10 text-white/40 hover:text-white">
            <Plus size={11} />
          </button>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          <div className="relative shrink-0">
            <button onClick={() => setShowGenres(v => !v)} title="Load a ready-made genre drum pattern"
              className="h-6 px-2.5 rounded-lg text-[10px] border border-[#00DAF3]/35 text-[#00DAF3] hover:bg-[#00DAF3]/10 flex items-center gap-1 shrink-0 whitespace-nowrap">
              <Sparkles size={10} /> Genres
            </button>
            {showGenres && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowGenres(false)} />
                <div className="absolute z-50 top-7 left-0 w-60 max-h-80 overflow-y-auto rounded-xl border border-white/12 bg-[#0c0d12] shadow-2xl p-1">
                  <div className="px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-white/30">Genre patterns</div>
                  {GENRE_PRESETS.map(g => (
                    <button key={g.id} onClick={() => applyGenre(g)}
                      className="w-full text-left px-2 py-2 rounded-lg hover:bg-white/8 transition-colors">
                      <DrumPatternThumb pattern={cachedPattern(g.id, g.make)} bpm={g.bpm} style={{ marginBottom: 6 }} />
                      <div className="flex items-center justify-between gap-2 px-1">
                        <span className="text-[12px] font-bold text-white">{g.name}</span>
                        <span className="text-[9px] font-mono text-white/35 shrink-0">{g.bpm} BPM</span>
                      </div>
                      <div className="text-[10px] text-white/45 leading-snug mt-0.5 px-1">{g.hint}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="relative shrink-0">
            <button onClick={() => setShowHands(v => !v)} title="Hand-drum patterns for SOMA, played by Amara"
              className="h-6 px-2.5 rounded-lg text-[10px] border border-[#E86A33]/40 text-[#E86A33] hover:bg-[#E86A33]/10 flex items-center gap-1 shrink-0 whitespace-nowrap">
              <Sparkles size={10} /> Hand drums
            </button>
            {showHands && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowHands(false)} />
                <HandDrumLibrary onApply={applyHands} onClose={() => setShowHands(false)} />
              </>
            )}
          </div>
          <div className="relative shrink-0">
            <button onClick={() => setShowBass(v => !v)} title="Drop a BAJO bassline into this pattern"
              className="h-6 px-2.5 rounded-lg text-[10px] border border-[#D0BCFF]/35 text-[#D0BCFF] hover:bg-[#D0BCFF]/10 flex items-center gap-1 shrink-0 whitespace-nowrap">
              <Sparkles size={10} /> Bass
            </button>
            {showBass && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowBass(false)} />
                <div className="absolute z-50 top-7 left-0 w-60 max-h-80 overflow-y-auto rounded-xl border border-white/12 bg-[#0c0d12] shadow-2xl p-1">
                  <div className="px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-white/30">MIDI basslines · adds a BAJO</div>
                  {BASSLINES.map(b => (
                    <button key={b.id} onClick={() => applyBass(b)}
                      className="w-full text-left px-2 py-2 rounded-lg hover:bg-white/8 transition-colors">
                      <BasslineThumb notes={b.notes} bpm={b.bpm} style={{ marginBottom: 6 }} />
                      <div className="flex items-center justify-between gap-2 px-1">
                        <span className="text-[12px] font-bold text-white">{b.name}</span>
                        <span className="text-[9px] font-mono text-white/35 shrink-0">{b.genre}</span>
                      </div>
                      <div className="text-[10px] text-white/45 leading-snug mt-0.5 px-1">{b.hint}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button onClick={() => setUlOpen((v) => !v)} title="Universal Library — grooves, basslines and your assets — docks on the right"
            className={`h-6 px-2.5 rounded-lg text-[10px] border flex items-center gap-1 shrink-0 whitespace-nowrap ${ulOpen ? 'border-[#8B5CFF]/70 text-white bg-[#8B5CFF]/15' : 'border-[#8B5CFF]/40 text-[#D0BCFF] hover:bg-[#8B5CFF]/12'}`}>▦ Library</button>
          <button onClick={() => setShowBreakdownImport(true)} title="Score from Chora — turn a song's Breakdown into instrument tracks"
            className="h-6 px-2.5 rounded-lg text-[10px] border border-[#00DAF3]/35 text-[#00DAF3] hover:bg-[#00DAF3]/10 flex items-center gap-1 shrink-0 whitespace-nowrap">♪ From Chora</button>
          <div className="relative shrink-0">
            <button
              onClick={() => setShowLiteraryScores(v => !v)}
              title="Load Official Chora DAW Showcase & Film Score Template Projects (Pride & Prejudice, Dracula + 10 Classics)"
              className="h-6 px-2.5 rounded-lg text-[10px] border border-amber-400/45 text-amber-300 hover:bg-amber-400/15 flex items-center gap-1 font-semibold shrink-0 whitespace-nowrap"
            >
              <Sparkles size={10} /> Chora Showcase Templates
            </button>
            {showLiteraryScores && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowLiteraryScores(false)} />
                <div className="absolute z-50 top-7 right-0 w-[min(440px,92vw)] max-h-[480px] overflow-y-auto rounded-xl border border-amber-400/25 bg-[#0c0d12]/98 backdrop-blur-xl shadow-2xl p-2">
                  <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-white/10 mb-1.5">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-300">
                        Chora DAW Showcase & Film Score Templates
                      </div>
                      <div className="text-[9px] text-white/45">
                        ACE-Step 2.5 + YuE2 Orchestral Stems + 5 Melos MPE Synths (2:15–5:30 Min)
                      </div>
                    </div>
                    <div className="flex gap-1 bg-white/[0.06] p-0.5 rounded-lg border border-white/10 shrink-0">
                      <button
                        onClick={() => setShowcaseScoreMode('full-film-score')}
                        className={`px-2 py-0.5 rounded text-[9px] font-bold whitespace-nowrap ${
                          showcaseScoreMode === 'full-film-score' ? 'bg-amber-400 text-black' : 'text-white/50'
                        }`}
                      >
                        Full Film Score
                      </button>
                      <button
                        onClick={() => setShowcaseScoreMode('light-background')}
                        className={`px-2 py-0.5 rounded text-[9px] font-bold whitespace-nowrap ${
                          showcaseScoreMode === 'light-background' ? 'bg-sky-400 text-black' : 'text-white/50'
                        }`}
                      >
                        Light Bg
                      </button>
                    </div>
                  </div>
                  {Object.values(CLASSIC_BOOK_SOUNDTRACKS).map(album => {
                    const master = getMasterBookScore(album.bookThemeId);
                    const isPriority = album.bookThemeId === 'pride-and-prejudice' || album.bookThemeId === 'dracula';
                    return (
                      <div
                        key={album.bookThemeId}
                        className={`mb-2 rounded-lg border p-2 ${
                          isPriority ? 'border-amber-400/35 bg-amber-500/[0.06]' : 'border-white/[0.06] bg-white/[0.02]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-white truncate">{album.bookTitle}</span>
                          <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 shrink-0">
                            {isPriority ? '★ Flagship 6-Song Showcase' : '6 Film Movements'}
                          </span>
                        </div>
                        <div className="text-[9.5px] text-amber-200/80 truncate mt-0.5">
                          {master ? master.albumTitle : album.albumTitle}
                        </div>
                        {master && (
                          <div className="grid grid-cols-2 gap-1 mt-1.5">
                            {master.movements.map((mvt, mvtIdx) => {
                              const beats = showcaseScoreMode === 'light-background' ? (mvt.lightBackgroundLengthBeats || 32) : mvt.lengthBeats;
                              const durSec = Math.round((beats * 60) / mvt.bpm);
                              const durStr = `${Math.floor(durSec / 60)}:${String(durSec % 60).padStart(2, '0')}`;
                              return (
                                <button
                                  key={mvt.movementNumber}
                                  onClick={() => loadClassicBookTemplate(album.bookThemeId, mvtIdx, showcaseScoreMode)}
                                  className="text-left px-2 py-1 rounded bg-black/40 hover:bg-amber-400/20 border border-white/10 hover:border-amber-400/40 transition"
                                >
                                  <div className="flex items-center justify-between text-[9px] font-semibold text-white">
                                    <span className="truncate">{mvt.movementNumber}. {mvt.title}</span>
                                    <span className="text-amber-300 font-mono ml-1 shrink-0">{durStr}</span>
                                  </div>
                                  <div className="text-[8px] text-white/45 truncate">
                                    {mvt.key} {mvt.mode} · {mvt.bpm} BPM · ACE-Step 2.5 + MPE
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          {musicEngines && <button data-testid="music-lab-generate" onClick={() => setShowGeneration(value => !value)} title="Generate audio, MIDI notes or a sample (private music lab)"
            className={`h-6 px-2.5 rounded-lg text-[10px] border text-[#D0BCFF] flex items-center gap-1 shrink-0 whitespace-nowrap ${showGeneration ? 'border-[#D0BCFF] bg-[#8B5CFF]/20' : 'border-[#D0BCFF]/40 hover:bg-[#8B5CFF]/10'}`}><Sparkles size={10} /> AI Generate</button>}
          <button
            onClick={() => { if (pattern) mutate((d) => { const p = d.patterns.find((x) => x.id === pattern.id); if (p) autoFill(d, p, 4); }); }}
            title="Auto fill — write a snare-roll fill into the last bar of this pattern"
            className="h-6 px-2.5 rounded-lg text-[10px] border border-[#FF8C00]/35 text-[#FF8C00] hover:bg-[#FF8C00]/10 flex items-center gap-1 shrink-0 whitespace-nowrap"
          ><Sparkles size={10} /> Fill</button>
          <button
            onClick={() => { if (pattern) mutate((d) => { const p = d.patterns.find((x) => x.id === pattern.id); if (p) quantizePattern(p, 1); }); }}
            title="Quantize — snap all micro-timing in this pattern back to the grid"
            className="h-6 px-2.5 rounded-lg text-[10px] border border-white/15 text-white/50 hover:text-white hover:bg-white/10 flex items-center gap-1 shrink-0 whitespace-nowrap"
          ><AlignStartVertical size={10} /> Quantize</button>
          <span className="text-[9px] text-white/20 ml-1 hidden 2xl:inline shrink-0 whitespace-nowrap">{busy === 'transcribe' ? 'Listening…' : 'drop a loop here to transcribe'}</span>
        </div>
      </div>
      )}

      {view === 'timeline' && pattern && (
        <TimelineView
          doc={doc}
          activePattern={pattern}
          beats={snap.beats}
          running={snap.running}
          playMode={playMode}
          songStartBeats={songStartBeats}
          meters={snap.meters}
          onMutate={mutate}
          onPlayFrom={(fromBeats) => {
            setPlayMode('song');
            setSongStartBeats(fromBeats);
            const engine = BeatsEngine.get();
            void engine.init().then(() => engine.play('song', { fromBeats }));
          }}
          onOpenInstrument={(id) => setOpenInstrumentId(id)}
          onAddInstrument={(dest?: 'meka' | 'track') => { setInstrumentDest(dest || 'meka'); setShowInstrumentPicker(true); }}
        />
      )}

      {view === 'mixer' && (
        <MixerView
          doc={doc}
          meters={snap.meters}
          limiterReduction={snap.limiterReduction}
          selectedPad={selectedPad}
          onSelectPad={setSelectedPad}
          onMutate={mutate}
          onOpenInstrument={(id) => setOpenInstrumentId(id)}
          onFocusPad={(padIdx) => { setSelectedPad(padIdx); setView('machine'); }}
          onFocusTrack={() => setView('timeline')}
        />
      )}

      {view === 'project' && (
        <ProjectView
          doc={doc}
          snap={snap}
          onMutate={mutate}
          productionId={production?.prodId || payload?.productionId}
          collabAnchor={transportRowRef}
          sharedProject={sharedAlbum}
          onLeaveShared={() => setSharedAlbum(null)}
        />
      )}

      {view === 'glass' && pattern && (
        <GlassView
          doc={doc}
          pattern={pattern}
          selectedPad={selectedPad}
          beats={snap.beats}
          running={snap.running}
          playMode={playMode}
          onSelectPad={setSelectedPad}
          onMutate={mutate}
          onAddInstrument={(dest?: 'meka' | 'track') => { setInstrumentDest(dest || 'meka'); setShowInstrumentPicker(true); }}
          onOpenInstrument={(id) => setOpenInstrumentId(id)}
          onOpenPianoRoll={(padIdx) => { setSelectedPad(padIdx); setView('machine'); }}
        />
      )}

      {view === 'machine' && pattern && (
        <MachineView
          doc={doc}
          pattern={pattern}
          selectedPad={selectedPad}
          beats={snap.beats}
          running={snap.running}
          frame={snap.frame}
          playMode={playMode}
          onSelectPad={setSelectedPad}
          onMutate={mutate}
          onLoadSampleFile={(padIdx, file) => { void loadSampleFile(padIdx, file); }}
          melosSamples={melosSamples}
          onLoadMelosSample={(padIdx, ref) => { void loadMelosSample(padIdx, ref); }}
          onPickInstrumentForPad={(padIdx) => setPadPickerFor(padIdx)}
          onEditPadInstrument={(padIdx) => { const id = doc.kit[padIdx]?.instrumentTrackId; if (id) setOpenInstrumentId(id); }}
          choice={{ ...choice, ...(pattern ? { [patternGroup(pattern)]: pattern.id } : {}) }}
          onLaunchScene={launchScene}
          recQuantize={recQuantize}
          onToggleRecQuantize={() => setRecQuantize((v) => { const n = !v; try { localStorage.setItem('melos:padrec:quantize', n ? '1' : '0'); } catch { /* */ } return n; })}
          renderInstrument={(trackId) => {
            // The same panel body the instrument window shows, inline in MEKA's control area.
            const t = doc.arrangement.find((x) => x.id === trackId && x.kind === 'instrument');
            if (!t) return null;
            const close = () => setOpenInstrumentId(null);
            return t.instrument?.type === 'kera' ? <KeraPanel doc={doc} track={t} onMutate={mutate} onClose={close} embedded />
              : t.instrument?.type === 'bajo' ? <BajoPanel doc={doc} track={t} onMutate={mutate} onClose={close} embedded />
              : t.instrument?.type === 'aura' ? <AuraPanel doc={doc} track={t} onMutate={mutate} onClose={close} embedded />
              : t.instrument?.type === 'soma' ? <SomaPanel doc={doc} track={t} onMutate={mutate} onClose={close} embedded />
              : t.instrument?.type === 'lyra' ? <LyraPanel doc={doc} track={t} onMutate={mutate} onClose={close} embedded />
              : isSuite(t.instrument?.type as InstrumentType) ? <VelaPanel doc={doc} track={t} onMutate={mutate} onClose={close} embedded />
              : <InstrumentPanel doc={doc} track={t} onMutate={mutate} onClose={close} embedded />;
          }}
        />
      )}
      </div>
      {showGeneration && musicEngines && <GenerationPanel key={doc.id} doc={doc} engines={musicEngines} startBeats={songStartBeats}
        initialDestination={view === 'machine' ? 'meka' : view === 'glass' ? 'glass' : 'timeline'} onClose={() => setShowGeneration(false)} onInsert={insertGeneration} />}
      {showLibrary && <MuseLibrary docked doc={doc} onMutate={mutate} onClose={() => setShowLibrary(false)} />}
      {showJam && co.isShared && <JamPanel jam={jam} doc={doc} onClose={() => setShowJam(false)} />}
      {ulOpen && (
        <UniversalLibraryPanel accent="#FF8C00" side="right" defaultDock="docked" storageKey="melos.ullib.geo.v2" accepts={['groove', 'bassline']}
          onClose={() => setUlOpen(false)}
          onUse={(it) => {
            if (it.kind === 'groove') { const g = GENRE_PRESETS.find((x) => 'groove:' + x.id === it.id); if (g) applyGenre(g); }
            else if (it.kind === 'bassline') { const b = BASSLINES.find((x) => 'bass:' + x.id === it.id); if (b) applyBass(b); }
          }} />
      )}
      </div>

      {showDiagnostics && (
        <DiagnosticsReadout snap={snap} hidStatus={hid.status} onConnectHid={() => { void hid.connect(); }} />
      )}

      {showMidi && <MidiLearnPanel onClose={() => setShowMidi(false)} />}
      {showInputs && <HardwareInputsPanel doc={doc} mutate={mutate} recording={recording} onClose={() => setShowInputs(false)} />}
      {showVoice && <VoicePanel doc={doc} mutate={mutate} isRecording={() => recordingRef.current} onClose={() => setShowVoice(false)} />}

      {/* Add an instrument from the pattern-editing views — the picker leads with the
          instrument choice rather than a preset list. Mixer and Project don't add sounds. */}
      {view !== 'mixer' && view !== 'project' && (
        <button
          onClick={() => setShowInstrumentPicker(true)}
          className="absolute bottom-4 right-4 z-30 h-10 px-4 rounded-full text-[12px] font-semibold text-white flex items-center gap-2 shadow-xl"
          style={{ background: 'linear-gradient(135deg, #6B0099, #B84DFF)' }}
          title="Add an instrument to this groove"
        >
          <Plus size={15} /> Instrument
        </button>
      )}

      {showBreakdownImport && (
        <BreakdownImporter onClose={() => setShowBreakdownImport(false)} onImport={scoreFromBreakdown} />
      )}
      {showInstrumentPicker && (
        <InstrumentPicker
          onClose={() => setShowInstrumentPicker(false)}
          onPick={(type) => {
            let newId = ''; let landedPad = 0;
            // Maschine Groups: fill the next empty pad, spawning a new Group when one fills.
            mutate((d) => { const r = addInstrumentToNextPad(d, type); newId = r.trackId; landedPad = r.padIdx; });
            setSelectedPad(landedPad);
            // Instantiate the worklet now so the first note (or arp step) has something to play.
            void BeatsEngine.get().init().then(() => BeatsEngine.get().syncInstruments());
            // Stay on the view you added it from — it appears in Glass's rack, the Timeline's
            // pad lanes and MEKA's grid alike; being teleported to MEKA was disorienting.
            setShowInstrumentPicker(false);
            if (newId) setTimeout(() => setOpenInstrumentId(newId), 60);
          }}
        />
      )}

      {showEq && <SpectraPanel doc={doc} onMutate={mutate} onClose={() => setShowEq(false)} />}
      {/* Pad → instrument: the picker targets a specific pad. On pick we mint a padOwned instrument
          track, link it to the pad, and open its editor — the same panels a track instrument uses. */}
      {padPickerFor !== null && (
        <InstrumentPicker
          destination={`on pad ${padPickerFor + 1}`}
          onClose={() => setPadPickerFor(null)}
          onPick={(type) => {
            const padIdx = padPickerFor;
            let newId = '';
            mutate((d) => {
              // Replacing a pad that already had an instrument? Drop the old track first so it
              // doesn't orphan (a wasted worklet + phantom channel).
              const hadInstrument = !!d.kit[padIdx]?.instrumentTrackId;
              detachPadInstrument(d, padIdx);
              newId = addPadInstrument(d, padIdx, type);
              const pad = d.kit[padIdx];
              if (pad) {
                const relabel = pad.empty || pad.source === 'sample' || hadInstrument;
                pad.source = 'instrument'; pad.instrumentTrackId = newId; pad.empty = false;
                pad.sample = null;
                if (pad.instrumentNote === undefined) pad.instrumentNote = 60;
                if (relabel) { pad.name = instrumentLabel(type); pad.color = instrumentColor(type); }
              }
            });
            void BeatsEngine.get().init().then(() => BeatsEngine.get().syncInstruments());
            if (newId) setTimeout(() => setOpenInstrumentId(newId), 60);
          }}
        />
      )}

      {/* Room-level instrument window: opened by the picker or by a track header from any view.
          Every instrument shares the SAME floating, resizable window — common chrome (rename,
          preset dropdown + management, Arm, close) around each panel's own play surface. */}
      {openInstrumentId && (() => {
        const t = doc.arrangement.find((x) => x.id === openInstrumentId && x.kind === 'instrument');
        if (!t) return null;
        const close = () => setOpenInstrumentId(null);
        const body = t.instrument?.type === 'kera' ? <KeraPanel doc={doc} track={t} onMutate={mutate} onClose={close} embedded />
          : t.instrument?.type === 'bajo' ? <BajoPanel doc={doc} track={t} onMutate={mutate} onClose={close} embedded />
          : t.instrument?.type === 'aura' ? <AuraPanel doc={doc} track={t} onMutate={mutate} onClose={close} embedded />
          : t.instrument?.type === 'soma' ? <SomaPanel doc={doc} track={t} onMutate={mutate} onClose={close} embedded />
              : t.instrument?.type === 'lyra' ? <LyraPanel doc={doc} track={t} onMutate={mutate} onClose={close} embedded />
          : isSuite(t.instrument?.type as InstrumentType) ? <VelaPanel doc={doc} track={t} onMutate={mutate} onClose={close} embedded />
          : <InstrumentPanel doc={doc} track={t} onMutate={mutate} onClose={close} embedded />;
        return (
          <InstrumentWindow doc={doc} track={t} onMutate={mutate} onClose={close}>
            {body}
          </InstrumentWindow>
        );
      })()}
    </div>
  );
};

export default BeatsRoom;
