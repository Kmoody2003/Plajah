// Melos Beats — the room shell. Standalone in Phase 1 (launched via OPEN_MELOS_BEATS); the
// future Melos workspace mounts this same component with a `production` context. Four views of
// one groove document; the engine is a singleton the views never own.

import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Sparkles, AlignStartVertical, FolderOpen, FilePlus2, Trash2, Download } from 'lucide-react';
import { auth } from '../../../services/firebase';
import { BeatsEngine } from '../../../services/melos/beats/engine/BeatsEngine';
import { defaultPattern, grooveUid, type GrooveDoc } from '../../../services/melos/beats/grooveDoc';
import { autoFill, quantizePattern } from '../../../services/melos/beats/grooveTools';
import { ingestSample, backupToLocker } from '../../../services/melos/beats/sampleStore';
import { renderGroove, publishGroove, downloadBlob } from '../../../services/melos/beats/render';
import { exportGrooveFile, importGrooveFile } from '../../../services/melos/beats/grooveFile';
import { sendGrooveToFabula } from '../../../services/melos/beats/sendToFabula';
import { subscribeMidi, ensureMidi } from '../../../services/melos/midiInput';
import { mapMidiEvent } from '../../../services/melos/midiMap';
import { exportDawproject } from '../../../services/melos/beats/dawproject/exportDawproject';
import { importDawproject } from '../../../services/melos/beats/dawproject/importDawproject';
import { transcribeToPattern, addTranscribedPattern } from '../../../services/melos/beats/transcribeImport';
import type { MelosSampleRef } from './melosSamples';
import { useBeatsDoc } from './useBeatsDoc';
import { useEngineBridge } from './useEngineBridge';
import { useBeatsHid } from './useBeatsHid';
import { useInstrumentKeyboard } from './instrument/useInstrumentKeyboard';
import { TransportBar, type BeatsViewId } from './shared/TransportBar';
import { DiagnosticsReadout } from './shared/DiagnosticsReadout';
import { MachineView } from './machine/MachineView';
import { GlassView } from './glass/GlassView';
import { TimelineView } from './timeline/TimelineView';
import { MixerView } from './mixer/MixerView';
import { BeatsMobileShell } from './mobile/BeatsMobileShell';
import { useViewport } from '../../../hooks/useViewport';
import { InstrumentPicker } from './instrument/InstrumentPicker';
import { InstrumentPanel } from './instrument/InstrumentPanel';
import { KeraPanel } from './instrument/KeraPanel';
import { SpectraPanel } from './mixer/SpectraPanel';
import { MuseLibrary } from './muse/MuseLibrary';
import { addInstrument, addPadInstrument } from '../../../services/melos/beats/instrumentFactory';
import { SELECT, WASH_BG } from './theme';

export interface BeatsLaunchPayload {
  grooveId?: string;
  productionId?: string;
  sampleUrl?: string;
  sampleName?: string;
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
}

const AVAILABLE_VIEWS: BeatsViewId[] = ['machine', 'glass', 'timeline', 'mixer'];

const BeatsRoom: React.FC<BeatsRoomProps> = ({ onClose, payload, production, embedded, melosSamples, onRenderTake, takeTargetName }) => {
  const { doc, saveState, grooves, mutate, replace, saveNow, openGroove, newGroove, removeGroove } =
    useBeatsDoc(payload?.grooveId, production?.prodId || payload?.productionId);
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
  const [selectedPad, setSelectedPad] = useState(0);
  // Mirror for the MIDI CC handler — it must read the CURRENT selection without re-subscribing.
  const selectedPadRef = React.useRef(0);
  useEffect(() => { selectedPadRef.current = selectedPad; }, [selectedPad]);
  const [playMode, setPlayMode] = useState<'pattern' | 'song'>('pattern');
  const [activePatternId, setActivePatternId] = useState(doc.patterns[0]?.id || '');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showGrooves, setShowGrooves] = useState(false);
  const [octave, setOctave] = useState(4);
  const [recording, setRecording] = useState(false);
  const [showInstrumentPicker, setShowInstrumentPicker] = useState(false);
  const [openInstrumentId, setOpenInstrumentId] = useState<string | null>(null);
  // When set, the instrument picker is targeting a PAD (turn the pad into an ONDA/KERA instrument)
  // rather than adding a new arranger track.
  const [padPickerFor, setPadPickerFor] = useState<number | null>(null);
  const [showEq, setShowEq] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);

  // The armed instrument track owns the QWERTY keyboard (the pads stand down while it does),
  // and receives anything played or recorded.
  const armedTrack = doc.arrangement.find((t) => t.kind === 'instrument' && t.armed) || null;
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
  const flash = useCallback((msg: string) => { setNotice(msg); setTimeout(() => setNotice(null), 3200); }, []);
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
    void engine.init().then(() => engine.play(playMode, { patternId: pattern?.id }));
  }, [playMode, pattern?.id]);

  const handleStop = useCallback(() => { BeatsEngine.get().stop(); }, []);

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
  useEffect(() => () => { BeatsEngine.get().stop(); }, []);

  // Hardware MIDI — premapped for Maschine, Komplete Kontrol and Maschine Jam (the same devices
  // Pixels sees). mapMidiEvent turns each event into ONE Melos action given the device and
  // whether an instrument is armed, so a Maschine's pads play drums, its knobs turn the synth's
  // macros, and — when an instrument track is armed — its pads become a playable keyboard.
  useEffect(() => {
    ensureMidi(); // request access now so the device readout populates before you play
    return subscribeMidi((e) => {
      const engine = BeatsEngine.get();
      const armed = engine.armedTrack();
      const action = mapMidiEvent(e, !!armed);
      if (!action) return;
      switch (action.kind) {
        case 'pad':
          void engine.init().then(() => engine.trigger(action.pad, action.velocity));
          setSelectedPad(action.pad);
          break;
        case 'padOff':
          engine.release(action.pad);
          break;
        case 'note':
          if (armed) void engine.ensureInstrument(armed).then(() => engine.instrumentNoteOn(armed, action.note, action.velocity));
          break;
        case 'noteOff':
          if (armed) engine.instrumentNoteOff(armed, action.note);
          break;
        case 'macro':
          // The eight knobs drive the armed instrument's macros, else the selected pad's first
          // eight parameters (so a Maschine is useful whether you're on drums or a synth).
          if (armed) {
            engine.getInstrument(armed.id)?.setMacro(action.index, action.value);
            mutate((d) => {
              const t = d.arrangement.find((x) => x.id === armed.id);
              const macros = (t?.instrument?.patch as { macros?: { value: number }[] } | undefined)?.macros;
              if (macros?.[action.index]) macros[action.index].value = action.value;
            });
          } else {
            mutate((d) => {
              const p = d.kit[selectedPadRef.current];
              if (!p) return;
              const v = action.value;
              switch (action.index) {
                case 0: p.pitchSemis = Math.round(-24 + v * 48); break;
                case 1: p.env.attackMs = Math.round(v * 200); break;
                case 2: p.env.decayMs = Math.round(20 + v * 1980); break;
                case 3: p.env.holdMs = Math.round(v * 500); break;
                case 4: p.env.sustain = v; break;
                case 5: p.env.releaseMs = Math.round(5 + v * 1995); break;
                case 6: p.filter.cutoff = Math.round(60 + v * 17940); break;
                case 7: p.filter.q = 0.3 + v * 11.7; break;
              }
            });
          }
          break;
        case 'transport':
          if (action.action === 'play') handlePlay();
          else if (action.action === 'stop') handleStop();
          break;
      }
    });
  }, [mutate]); // eslint-disable-line react-hooks/exhaustive-deps

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
      p.source = 'sample';
      p.sample = result.ref;
      p.name = name.slice(0, 18);
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
        p.source = 'sample';
        p.sample = ingested.ref;
        p.name = ref.title.slice(0, 18);
        p.melos = { sampleId: ref.id, title: ref.title, clearance: ref.clearance };
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

  const addPattern = useCallback(() => {
    mutate((d: GrooveDoc) => {
      const name = `Pattern ${String.fromCharCode(65 + (d.patterns.length % 26))}`;
      const p = defaultPattern(name);
      p.id = grooveUid() + grooveUid();
      d.patterns.push(p);
      setActivePatternId(p.id);
    });
  }, [mutate]);

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
          onPlayFrom={(fromBeats) => { setPlayMode('song'); void BeatsEngine.get().init().then(() => BeatsEngine.get().play('song', { fromBeats })); }}
          onLoadSampleFile={(padIdx, file) => { void loadSampleFile(padIdx, file); }}
          melosSamples={melosSamples}
          onLoadMelosSample={(padIdx, ref) => { void loadMelosSample(padIdx, ref); }}
          onOpenInstrument={(id) => setOpenInstrumentId(id)}
          onAddInstrument={() => setShowInstrumentPicker(true)}
          onClose={onClose}
          hideClose={embedded}
          embedded={embedded}
        />
        {showInstrumentPicker && (
          <InstrumentPicker
            onClose={() => setShowInstrumentPicker(false)}
            onPick={(type) => {
              let newId = '';
              mutate((d) => { newId = addInstrument(d, type); });
              void BeatsEngine.get().init().then(() => BeatsEngine.get().syncInstruments());
              setShowInstrumentPicker(false);
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
                if (pad) { pad.source = 'instrument'; pad.instrumentTrackId = newId; if (pad.instrumentNote === undefined) pad.instrumentNote = 60; }
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
          return t.instrument?.type === 'kera'
            ? <KeraPanel doc={doc} track={t} onMutate={mutate} onClose={close} />
            : <InstrumentPanel doc={doc} track={t} onMutate={mutate} onClose={close} />;
        })()}
        {showEq && <SpectraPanel doc={doc} onMutate={mutate} onClose={() => setShowEq(false)} />}
        {showLibrary && <MuseLibrary doc={doc} onMutate={mutate} onClose={() => setShowLibrary(false)} />}
      </>
    );
  }

  return (
    <div
      className={`${embedded ? 'absolute inset-0' : 'fixed inset-0 z-[100]'} flex flex-col text-white`}
      style={{ background: `radial-gradient(1000px 460px at 12% -12%, rgba(107,0,153,0.30), transparent 60%), ${WASH_BG}` }}
    >
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
        beats={snap.beats}
        onSetLoop={(loop) => mutate((d) => { d.loop = loop; })}
        onSetPlayMode={setPlayMode}
        onToggleDiagnostics={() => setShowDiagnostics((v) => !v)}
        onOpenEq={() => { void BeatsEngine.get().init().then(() => setShowEq(true)); }}
        onOpenLibrary={() => setShowLibrary(true)}
        onExportDawproject={() => { void handleExportDawproject(); }}
        onImportDawproject={() => dawFileRef.current?.click()}
        onBounce={() => { void handleBounce(); }}
        onSendToFabula={() => { void handleSendToFabula(); }}
        bounceLabel={onRenderTake ? 'Bounce to take' : 'Bounce'}
        onPublish={() => { void handlePublish(); }}
        busy={busy}
        hideClose={embedded}
        onClose={onClose}
      />

      <input
        ref={dawFileRef}
        type="file"
        accept=".dawproject,application/zip"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImportDawproject(f); e.target.value = ''; }}
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

      <div
        className="flex items-center gap-1.5 px-4 h-9 border-b border-white/[0.07] bg-black/20 flex-none"
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
        onDrop={(e) => {
          const f = e.dataTransfer.files?.[0];
          if (!f || !/^audio\//.test(f.type || '')) return;
          e.preventDefault();
          void handleTranscribeFile(f);
        }}
        title="Drop a drum loop here to transcribe it into a new pattern"
      >
        <div className="relative flex items-center gap-1.5">
          <input
            value={doc.name}
            onChange={(e) => mutate((d) => { d.name = e.target.value; })}
            onBlur={() => { void saveNow(); }}
            aria-label="Groove name"
            className="w-32 h-6 rounded-lg bg-transparent border border-transparent hover:border-white/10 focus:border-white/25 px-2 text-[11px] font-semibold text-white outline-none"
          />
          <span
            className="w-1.5 h-1.5 rounded-full flex-none"
            title={saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : saveState === 'unsaved' ? 'Unsaved changes (autosaves)' : 'In-memory only — sign in to save'}
            style={{ background: saveState === 'saved' ? '#06D6A0' : saveState === 'saving' ? '#F59E0B' : saveState === 'unsaved' ? '#FF8C00' : 'rgba(255,255,255,0.25)' }}
          />
          <button onClick={() => setShowGrooves((v) => !v)} aria-label="My grooves" title="My grooves" className="h-6 w-6 grid place-items-center rounded-lg border border-white/10 text-white/40 hover:text-white">
            <FolderOpen size={11} />
          </button>
          <button onClick={newGroove} aria-label="New groove" title="New groove" className="h-6 w-6 grid place-items-center rounded-lg border border-white/10 text-white/40 hover:text-white">
            <FilePlus2 size={11} />
          </button>
          {showGrooves && (
            <div className="absolute top-8 left-0 z-30 w-64 max-h-72 overflow-y-auto rounded-xl border border-white/15 bg-[#0A0A0D]/95 backdrop-blur-xl p-1.5 shadow-2xl">
              <button onClick={handleSaveCopy} className="w-full h-7 mb-1 rounded-lg text-[10px] border border-[#00DAF3]/30 text-[#00DAF3] hover:bg-[#00DAF3]/10 flex items-center justify-center gap-1.5" title="Duplicate this groove as a new project in your cloud">
                <FilePlus2 size={10} /> Save a copy
              </button>
              <div className="flex gap-1 px-1 pb-1.5 mb-1 border-b border-white/10">
                <button onClick={() => { exportGrooveFile(doc); }} className="flex-1 h-7 rounded-lg text-[10px] border border-white/12 text-white/60 hover:text-white hover:bg-white/5 flex items-center justify-center gap-1.5" title="Save this groove as a local .melos file">
                  <Download size={10} /> Save as file
                </button>
                <button onClick={() => melosFileRef.current?.click()} className="flex-1 h-7 rounded-lg text-[10px] border border-white/12 text-white/60 hover:text-white hover:bg-white/5 flex items-center justify-center gap-1.5" title="Open a .melos file as a new groove">
                  <FolderOpen size={10} /> Open file
                </button>
              </div>
              {grooves.length === 0 && <p className="px-2 py-3 text-[11px] text-white/35">No saved grooves yet — they autosave as you work.</p>}
              {grooves.map((g) => (
                <div key={g.id} className="flex items-center gap-1 group">
                  <button
                    onClick={() => { setShowGrooves(false); void openGroove(g.id); }}
                    className={`flex-1 text-left px-2 py-1.5 rounded-lg text-[11px] ${g.id === doc.id ? 'text-white bg-white/10' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
                  >
                    {g.name} <span className="text-white/25 font-mono text-[9px] ml-1">{g.bpm.toFixed(0)}bpm</span>
                  </button>
                  <button onClick={() => { void removeGroove(g.id); }} aria-label={`Delete ${g.name}`} className="w-6 h-6 grid place-items-center rounded text-white/20 hover:text-[#EF4444] opacity-0 group-hover:opacity-100">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="w-px h-4 bg-white/10 mx-1" />
        <span className="text-[9px] uppercase tracking-[0.18em] text-white/25 font-semibold mr-1">Patterns</span>
        {doc.patterns.map((p) => (
          <button
            key={p.id}
            onClick={() => setActivePatternId(p.id)}
            className="h-6 px-2.5 rounded-lg text-[11px] border transition-colors"
            style={p.id === pattern?.id
              ? { background: `${SELECT}26`, borderColor: `${SELECT}66`, color: '#fff', fontWeight: 600 }
              : { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.45)' }}
          >{p.name}</button>
        ))}
        <button onClick={addPattern} aria-label="New pattern" className="h-6 w-6 grid place-items-center rounded-lg border border-white/10 text-white/40 hover:text-white">
          <Plus size={11} />
        </button>
        <div className="flex-1" />
        <button
          onClick={() => { if (pattern) mutate((d) => { const p = d.patterns.find((x) => x.id === pattern.id); if (p) autoFill(d, p, 4); }); }}
          title="Auto fill — write a snare-roll fill into the last bar of this pattern"
          className="h-6 px-2.5 rounded-lg text-[10px] border border-[#FF8C00]/35 text-[#FF8C00] hover:bg-[#FF8C00]/10 flex items-center gap-1"
        ><Sparkles size={10} /> Fill</button>
        <button
          onClick={() => { if (pattern) mutate((d) => { const p = d.patterns.find((x) => x.id === pattern.id); if (p) quantizePattern(p, 1); }); }}
          title="Quantize — snap all micro-timing in this pattern back to the grid"
          className="h-6 px-2.5 rounded-lg text-[10px] border border-white/15 text-white/50 hover:text-white hover:bg-white/10 flex items-center gap-1"
        ><AlignStartVertical size={10} /> Quantize</button>
        <span className="text-[9px] text-white/20 ml-1">{busy === 'transcribe' ? 'Listening…' : 'drop a loop here to transcribe'}</span>
      </div>

      {view === 'timeline' && pattern && (
        <TimelineView
          doc={doc}
          activePattern={pattern}
          beats={snap.beats}
          running={snap.running}
          playMode={playMode}
          meters={snap.meters}
          onMutate={mutate}
          onPlayFrom={(fromBeats) => {
            setPlayMode('song');
            const engine = BeatsEngine.get();
            void engine.init().then(() => engine.play('song', { fromBeats }));
          }}
          onOpenInstrument={(id) => setOpenInstrumentId(id)}
          onAddInstrument={() => setShowInstrumentPicker(true)}
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
        />
      )}

      {showDiagnostics && (
        <DiagnosticsReadout snap={snap} hidStatus={hid.status} onConnectHid={() => { void hid.connect(); }} />
      )}

      {/* Add an instrument from ANY view — the button is always present, and the picker leads
          with the instrument choice rather than a preset list. */}
      <button
        onClick={() => setShowInstrumentPicker(true)}
        className="absolute bottom-4 right-4 z-30 h-10 px-4 rounded-full text-[12px] font-semibold text-white flex items-center gap-2 shadow-xl"
        style={{ background: 'linear-gradient(135deg, #6B0099, #B84DFF)' }}
        title="Add an instrument to this groove"
      >
        <Plus size={15} /> Instrument
      </button>

      {showInstrumentPicker && (
        <InstrumentPicker
          onClose={() => setShowInstrumentPicker(false)}
          onPick={(type) => {
            let newId = '';
            mutate((d) => { newId = addInstrument(d, type); });
            // Instantiate the worklet now so the first note (or arp step) has something to play.
            void BeatsEngine.get().init().then(() => BeatsEngine.get().syncInstruments());
            // Jump to the arranger where instrument tracks live, and open the new one.
            setView('timeline');
            if (newId) setTimeout(() => setOpenInstrumentId(newId), 60);
          }}
        />
      )}

      {showEq && <SpectraPanel doc={doc} onMutate={mutate} onClose={() => setShowEq(false)} />}
      {showLibrary && <MuseLibrary doc={doc} onMutate={mutate} onClose={() => setShowLibrary(false)} />}

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
              newId = addPadInstrument(d, padIdx, type);
              const pad = d.kit[padIdx];
              if (pad) { pad.source = 'instrument'; pad.instrumentTrackId = newId; if (pad.instrumentNote === undefined) pad.instrumentNote = 60; }
            });
            void BeatsEngine.get().init().then(() => BeatsEngine.get().syncInstruments());
            if (newId) setTimeout(() => setOpenInstrumentId(newId), 60);
          }}
        />
      )}

      {/* Room-level instrument panel: opened by the picker or by a track header from any view. */}
      {openInstrumentId && (() => {
        const t = doc.arrangement.find((x) => x.id === openInstrumentId && x.kind === 'instrument');
        if (!t) return null;
        const close = () => setOpenInstrumentId(null);
        return t.instrument?.type === 'kera'
          ? <KeraPanel doc={doc} track={t} onMutate={mutate} onClose={close} />
          : <InstrumentPanel doc={doc} track={t} onMutate={mutate} onClose={close} />;
      })()}
    </div>
  );
};

export default BeatsRoom;
