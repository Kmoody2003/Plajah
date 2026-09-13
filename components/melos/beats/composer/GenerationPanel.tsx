import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import type { GrooveDoc, InstrumentType } from '../../../../services/melos/beats/grooveDoc';
import { cancelMusicGeneration, getGeneratedAudio, getMusicGeneration, startMusicGeneration, type EngineStatus } from '../../../../services/melos/generation/client';
import type { GenerationKind, GenerationRequest, GenerationResult } from '../../../../services/melos/generation/types';
import type { InsertTarget } from '../../../../services/melos/generation/insert';
import { validateGeneratedNotes } from '../../../../services/melos/generation/types';

export interface GenerationInsertion {
  result: GenerationResult;
  audio?: Blob;
  target: InsertTarget;
  kind: GenerationKind;
  projectId: string;
  bpm: number;
  sampleStart: number;
  sampleLength: number;
}
interface Props {
  doc: GrooveDoc; engines: EngineStatus[]; startBeats: number;
  initialDestination: 'timeline' | 'meka' | 'glass';
  onClose: () => void; onInsert: (value: GenerationInsertion) => Promise<void>;
}
const field = 'w-full rounded-lg border border-white/15 bg-[#171020] px-2 py-1.5 text-xs text-white';

export default function GenerationPanel({ doc, engines, startBeats, initialDestination, onClose, onInsert }: Props) {
  const [kind, setKind] = useState<GenerationKind>('audio');
  const [engineId, setEngineId] = useState('ace-step');
  const [prompt, setPrompt] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [key, setKey] = useState('C Major');
  const [bars, setBars] = useState(4);
  const [seconds, setSeconds] = useState(20);
  const [seed, setSeed] = useState(42);
  const [abc, setAbc] = useState('');
  const [destination, setDestination] = useState<InsertTarget['destination']>(initialDestination);
  const [trackId, setTrackId] = useState('');
  const [instrument, setInstrument] = useState<InstrumentType>('onda');
  const [atBeat, setAtBeat] = useState(startBeats);
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState<GenerationInsertion | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [sampleStart, setSampleStart] = useState(0);
  const [sampleLength, setSampleLength] = useState(4);
  const [inserted, setInserted] = useState(false);
  const [autoInsert, setAutoInsert] = useState(true);
  const active = useRef<{ id?: string; controller: AbortController } | null>(null);
  const mounted = useRef(true);
  const notesMode = kind === 'midi' || kind === 'transcribe';
  const choices = engines.filter(engine => engine.kinds.includes(kind));
  const selected = choices.find(engine => engine.id === engineId) || choices[0];
  const allowed = selected?.id === 'basic-pitch' || selected?.access.allowed;
  useEffect(() => { setTrackId(''); }, [kind, destination]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.controller.abort();
      if (active.current?.id) void cancelMusicGeneration(active.current.id).catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!ready?.audio) { setPreviewUrl(''); return; }
    const url = URL.createObjectURL(ready.audio); setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [ready?.audio]);

  const insert = async (value: GenerationInsertion) => {
    setInserting(true);
    try { await onInsert(value); if (mounted.current) { setInserted(true); setStatus('Inserted. Use Undo to remove this take.'); } }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : 'Could not insert the result'); }
    finally { if (mounted.current) setInserting(false); }
  };
  const generate = async () => {
    if (!selected || !allowed || running) return;
    setError(''); setReady(null); setInserted(false); setRunning(true); setStatus('Starting…');
    const operation = { controller: new AbortController(), id: undefined as string | undefined };
    active.current = operation;
    const signal = operation.controller.signal;
    const request: GenerationRequest = { engine: selected.id, kind, prompt, lyrics, bpm: doc.bpm, bars, seconds, key, seed, abc };
    const target: InsertTarget = { destination: notesMode ? destination : kind === 'sample' ? (destination === 'glass' ? 'glass' : 'meka') : 'timeline',
      startBeats: atBeat, trackId: trackId || undefined, instrument, name: (prompt.trim() || file?.name || 'Generated take').slice(0, 60) };
    const projectId = doc.id;
    try {
      let result: GenerationResult; let audio: Blob | undefined;
      if (selected.id === 'basic-pitch') {
        if (!file) throw new Error('Choose a recording to transcribe');
        const url = URL.createObjectURL(file);
        try {
          const { transcribeWithBasicPitch } = await import('../../../../services/basicPitchBackend');
          const notes = await transcribeWithBasicPitch(url, { signal, onProgress: (stage, amount) => { if (mounted.current) setStatus(`${stage} · ${Math.round(amount * 100)}%`); } });
          result = { notes: validateGeneratedNotes(notes.map(note => ({ startBeats: note.startSec * request.bpm / 60, lengthBeats: note.durSec * request.bpm / 60, key: note.midi, vel: Math.max(1, Math.round(note.velocity * 127)) }))) };
        } finally { URL.revokeObjectURL(url); }
      } else {
        if (kind === 'transcribe') {
          if (!file || file.size > 20000000) throw new Error('Choose a recording smaller than 20 MB');
          const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
          for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          request.inputAudio = btoa(binary);
        }
        signal.throwIfAborted();
        let job = await startMusicGeneration(request); operation.id = job.id;
        if (signal.aborted) { await cancelMusicGeneration(job.id); signal.throwIfAborted(); }
        while (job.status === 'running') {
          if (mounted.current) setStatus(job.message);
          await new Promise<void>((resolve, reject) => {
            const stop = () => { clearTimeout(timer); reject(new Error('Cancelled')); };
            const timer = setTimeout(() => { signal.removeEventListener('abort', stop); resolve(); }, 1200);
            signal.addEventListener('abort', stop, { once: true });
          });
          signal.throwIfAborted();
          job = await getMusicGeneration(job.id, signal);
        }
        if (job.status !== 'succeeded' || !job.result) throw new Error(job.message);
        result = job.result;
        if (result.audioAvailable) audio = await getGeneratedAudio(job.id, signal);
      }
      signal.throwIfAborted();
      const value: GenerationInsertion = { result, audio, target, kind, projectId, bpm: request.bpm, sampleStart: 0, sampleLength };
      setReady(value); setStatus('Ready to audition and insert');
      if (autoInsert && kind !== 'sample') await insert(value);
    } catch (cause) {
      if (mounted.current) {
        if (signal.aborted) setStatus('Cancelled');
        else setError(cause instanceof Error ? cause.message : 'Generation failed');
      }
    } finally {
      if (active.current === operation) active.current = null;
      if (mounted.current) setRunning(false);
    }
  };
  const stop = async () => {
    const operation = active.current;
    operation?.controller.abort();
    if (operation?.id) {
      try { const job = await cancelMusicGeneration(operation.id); if (mounted.current) setStatus(job.message); }
      catch { if (mounted.current) setError('Could not confirm cancellation. The runtime may still be running.'); }
    }
  };
  const downloadAbc = () => {
    if (!ready?.result.abc) return;
    const url = URL.createObjectURL(new Blob([ready.result.abc], { type: 'text/plain' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'melos-score.abc'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <aside aria-label="Generate music" className="w-[340px] max-w-full shrink-0 border-l border-white/10 bg-[#100b19] overflow-y-auto p-4 space-y-3 text-white">
    <div className="flex items-center justify-between"><h2 className="font-semibold flex items-center gap-2"><Sparkles size={16} /> Generate</h2><button aria-label="Close generation panel" onClick={onClose}><X size={16} /></button></div>
    <p className="text-[11px] text-white/50">Private music lab · local or configured runtime</p>
    {!engines.some(engine => engine.runtimeConnected) && <p role="status" className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-2 text-[11px] leading-relaxed text-amber-100">The interface is available for preview. Connect the Melos music-lab backend or run it locally to generate audio and scores.</p>}
    <fieldset disabled={running || inserting} className="space-y-3 disabled:opacity-60">
      <label className="block text-xs">Create<select className={field} value={kind} onChange={event => { setKind(event.target.value as GenerationKind); setReady(null); }}>
        <option value="audio">Audio clip</option><option value="midi">MIDI notes</option><option value="sample">Sample for a pad</option><option value="transcribe">Notes from a recording</option>
      </select></label>
      <label className="block text-xs">Engine<select className={field} value={selected?.id || ''} onChange={event => { setEngineId(event.target.value); setReady(null); }}>{choices.map(engine => <option key={engine.id} value={engine.id}>{engine.name}</option>)}</select></label>
      {!allowed && <p className="text-xs text-amber-200">{selected?.access.reason || 'No engine available'}. Configure this engine in the local server environment.</p>}
      {selected?.id === 'yue2' && <p className="text-xs text-white/60">YuE2 stays private. Its official full model needs more VRAM than this laptop; use a suitable configured runtime.</p>}
      {kind === 'transcribe' ? <label className="block text-xs">Recording<input className={field} type="file" accept="audio/*" onChange={event => setFile(event.target.files?.[0] || null)} /></label> : <label className="block text-xs">Describe the sound<textarea className={field} rows={4} maxLength={4000} placeholder={kind === 'sample' ? 'A warm muted guitar pluck, dry and isolated' : 'A gentle 4-bar piano melody in C major'} value={prompt} onChange={event => setPrompt(event.target.value)} /></label>}
      {kind === 'audio' && <label className="block text-xs">Lyrics (optional)<textarea className={field} rows={2} maxLength={12000} value={lyrics} onChange={event => setLyrics(event.target.value)} /></label>}
      <div className="grid grid-cols-2 gap-2"><label className="text-xs">Key<input className={field} value={key} maxLength={40} onChange={event => setKey(event.target.value)} /></label>
        {notesMode ? <label className="text-xs">Bars<input className={field} type="number" min={1} max={destination === 'timeline' ? 16 : 4} value={bars} onChange={event => setBars(Number(event.target.value))} /></label> : <label className="text-xs">Generate seconds<input className={field} type="number" min={10} max={120} value={seconds} onChange={event => setSeconds(Number(event.target.value))} /></label>}</div>
      <label className="block text-xs">Seed<input className={field} type="number" min={0} max={2147483647} value={seed} onChange={event => setSeed(Number(event.target.value))} /></label>
      {notesMode && <><label className="block text-xs">Destination<select className={field} value={destination} onChange={event => setDestination(event.target.value as InsertTarget['destination'])}><option value="timeline">Timeline MIDI track</option><option value="meka">MEKA pattern</option><option value="glass">Glass pattern</option></select></label><label className="block text-xs">Instrument<select className={field} value={instrument} onChange={event => setInstrument(event.target.value as InstrumentType)}><option value="onda">ONDA synth</option><option value="bajo">BAJO bass</option><option value="vela">VELA</option></select></label></>}
      {kind !== 'sample' && (!notesMode || destination === 'timeline') && <><label className="block text-xs">Track<select className={field} value={trackId} onChange={event => setTrackId(event.target.value)}><option value="">New {notesMode ? 'MIDI' : 'audio'} track</option>{doc.arrangement.filter(track => track.kind === (notesMode ? 'instrument' : 'audio') && !track.padOwned).map(track => <option key={track.id} value={track.id}>{track.name}</option>)}</select></label><label className="block text-xs">Start beat (0 = beginning)<input className={field} type="number" min={0} max={100000} step={0.25} value={atBeat} onChange={event => setAtBeat(Number(event.target.value))} /></label></>}
      {selected?.id === 'yue2' && <label className="block text-xs">ABC score (optional)<textarea className={field} rows={3} maxLength={100000} value={abc} onChange={event => setAbc(event.target.value)} /></label>}
      {kind !== 'sample' && <label className="flex gap-2 items-center text-xs"><input type="checkbox" checked={autoInsert} onChange={event => setAutoInsert(event.target.checked)} /> Insert when ready</label>}
    </fieldset>
    {running ? <button className={field} onClick={() => void stop()}>Cancel generation</button> : <button className="w-full rounded-lg bg-[#8B5CFF] py-2 text-sm font-semibold disabled:opacity-40" disabled={!allowed || inserting || (!prompt.trim() && kind !== 'transcribe')} onClick={() => void generate()}>Generate{autoInsert && kind !== 'sample' ? ' & insert' : ''}</button>}
    <p role="status" className="text-xs text-white/70">{status}</p>
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    {ready && <div className="space-y-3 border-t border-white/10 pt-3">
      {previewUrl && <audio controls src={previewUrl} className="w-full" />}
      {ready.result.notes && <p className="text-xs">{ready.result.notes.length} editable notes</p>}
      {ready.result.warning && <p className="text-xs text-amber-200">{ready.result.warning}</p>}
      {ready.kind === 'sample' && <div className="grid grid-cols-2 gap-2"><label className="text-xs">Sample start (s)<input className={field} type="number" min={0} step={0.1} value={sampleStart} onChange={event => setSampleStart(Number(event.target.value))} /></label><label className="text-xs">Length (s)<input className={field} type="number" min={0.05} max={120} step={0.1} value={sampleLength} onChange={event => setSampleLength(Number(event.target.value))} /></label></div>}
      <button className={field} disabled={inserted || inserting} onClick={() => void insert({ ...ready, sampleStart, sampleLength,
        target: { ...ready.target, startBeats: atBeat, trackId: trackId || undefined, instrument,
          destination: ready.kind === 'midi' || ready.kind === 'transcribe' ? destination : ready.kind === 'sample' ? 'meka' : 'timeline' },
      })}>{inserted ? 'Inserted' : inserting ? 'Inserting…' : ready.kind === 'sample' ? 'Insert on a new sample pad' : 'Insert into project'}</button>
      {ready.result.abc && <button className={field} onClick={downloadAbc}>Download ABC score</button>}
    </div>}
  </aside>;
}
