// KERA — the sampler panel (Phase 1).
//
// Drop an audio file, or load a SoundFont, and play it across the keys. The rich Kontakt-style
// zone map and the four playback modes are the next phase; this is the honest MVP: the shared
// Rust sample engine, actually making sound, with the formats that are open to play.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Upload, Piano, Waves, Info } from 'lucide-react';
import type { GrooveDoc, ArrangeTrack } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { programFromFile, programFromSf2 } from '../../../../services/melos/instruments/kera/loader';
import { programStats, type KeraProgram } from '../../../../services/melos/instruments/kera/zones';
import { serializeKeraProgram, deserializeKeraProgram, keraProgramShell, type SerializedKeraProgram } from '../../../../services/melos/instruments/kera/persist';
import { KeraEditor } from './KeraEditor';
import { PLAYHEAD, SELECT, SURFACE } from '../theme';

interface Props {
  doc: GrooveDoc;
  track: ArrangeTrack;
  onMutate: (fn: (d: GrooveDoc) => void) => void;
  onClose: () => void;
}

export const KeraPanel: React.FC<Props> = ({ track, onMutate, onClose }) => {
  const [program, setProgram] = useState<KeraProgram | null>(null);
  const [status, setStatus] = useState('Drop a sound to begin');
  const [sf2Presets, setSf2Presets] = useState<{ name: string; index: number }[] | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const sf2Bytes = useRef<Uint8Array | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reopening a saved KERA track: show what's loaded from the doc's metadata instantly (the audible
  // program hydrates separately in the engine). Runs once for the initial saved program.
  useEffect(() => {
    const saved = track.instrument?.kera as unknown as SerializedKeraProgram | undefined;
    if (saved?.samples?.length) {
      const shell = keraProgramShell(saved);
      setProgram(shell);
      const s = programStats(shell);
      setStatus(`${saved.name} · ${s.zones} zone${s.zones !== 1 ? 's' : ''}, ${s.samples} sample${s.samples !== 1 ? 's' : ''} · saved`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyProgram = useCallback(async (prog: KeraProgram | null, label: string) => {
    if (!prog) { setStatus('Could not read that file'); return; }
    setProgram(prog);
    const s = programStats(prog);
    setStatus(`${label} · ${s.zones} zone${s.zones !== 1 ? 's' : ''}, ${s.samples} sample${s.samples !== 1 ? 's' : ''}`);
    await BeatsEngine.get().loadKeraProgram(track, prog);
    // Name the track after the loaded content, immediately.
    onMutate((d) => { const t = d.arrangement.find((x) => x.id === track.id); if (t) t.name = prog.name; });
    // Persist the program so it survives reload: samples → the owner's OPFS + private locker,
    // zones/metadata → the doc (which autosaves to the owner's Firestore). Runs after the sound is
    // already playing, so a heavy SoundFont doesn't block audition.
    setStatus(`${label} · saving to your library…`);
    try {
      const serialized = await serializeKeraProgram(prog);
      onMutate((d) => {
        const t = d.arrangement.find((x) => x.id === track.id);
        if (t?.instrument) t.instrument.kera = serialized as unknown as Record<string, unknown>;
      });
      setStatus(`${label} · ${s.zones} zone${s.zones !== 1 ? 's' : ''}, ${s.samples} sample${s.samples !== 1 ? 's' : ''} · saved`);
    } catch (e) {
      console.warn('[kera] save failed', e);
      setStatus(`${label} · loaded (save failed — will retry on next change)`);
    }
  }, [track, onMutate]);

  // An edit from the deep editor: reload the live engine immediately, then persist (debounced, and
  // reusing prior sample refs so metadata-only edits never re-hash the PCM).
  const commitProgram = useCallback((next: KeraProgram) => {
    setProgram(next);
    void BeatsEngine.get().loadKeraProgram(track, next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const prior = track.instrument?.kera as unknown as SerializedKeraProgram | undefined;
      void serializeKeraProgram(next, prior).then((serialized) => {
        onMutate((d) => {
          const t = d.arrangement.find((x) => x.id === track.id);
          if (t?.instrument) t.instrument.kera = serialized as unknown as Record<string, unknown>;
        });
      });
    }, 500);
  }, [track, onMutate]);

  // Opening the deep editor needs real PCM for the waveform. A freshly loaded program already has
  // it; a reopened one is a metadata shell, so hydrate the full program first.
  const openEditor = useCallback(async () => {
    if (program && program.samples.some((s) => s.channels.length && s.channels[0]?.length)) { setEditorOpen(true); return; }
    const saved = track.instrument?.kera as unknown as SerializedKeraProgram | undefined;
    if (saved) {
      setStatus('Loading samples to edit…');
      const full = await deserializeKeraProgram(saved);
      if (full) setProgram(full);
      setStatus(`${saved.name} · ready to edit`);
    }
    setEditorOpen(true);
  }, [program, track]);

  const handleFile = useCallback(async (file: File) => {
    setStatus('Loading…');
    const engine = BeatsEngine.get();
    await engine.init();
    const ctx = engine.getContext();
    if (!ctx) return;
    const name = file.name.replace(/\.[^.]+$/, '');
    if (/\.sf[23]$/i.test(file.name)) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      sf2Bytes.current = bytes;
      const { program: prog, presets } = programFromSf2(bytes, 0);
      if (presets.length > 1) setSf2Presets(presets);
      await applyProgram(prog, name);
    } else {
      setSf2Presets(null);
      const prog = await programFromFile(file, name, ctx);
      await applyProgram(prog, name);
    }
  }, [applyProgram]);

  const pickPreset = useCallback(async (index: number) => {
    if (!sf2Bytes.current) return;
    const { program: prog } = programFromSf2(sf2Bytes.current, index);
    await applyProgram(prog, prog?.name || 'Preset');
  }, [applyProgram]);

  const audition = useCallback((key: number) => {
    const engine = BeatsEngine.get();
    void engine.ensureInstrument(track).then(() => {
      engine.instrumentNoteOn(track, key, 100);
      setTimeout(() => engine.instrumentNoteOff(track, key), 500);
    });
  }, [track]);

  const stats = program ? programStats(program) : null;

  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/65 backdrop-blur-sm p-5" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-[22px] border border-white/[0.16] overflow-hidden shadow-2xl" style={{ background: SURFACE }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 h-12 border-b border-white/10" style={{ background: '#0E0E12' }}>
          <span className="font-black text-[13px] tracking-[0.06em]" style={{ color: PLAYHEAD }}>KERA</span>
          <span className="text-[11px] text-white/55">{program?.name || 'No sound loaded'}</span>
          <span className="flex-1" />
          <button
            onClick={() => onMutate((d) => {
              const on = !track.armed;
              for (const t of d.arrangement) t.armed = false;
              const t = d.arrangement.find((x) => x.id === track.id);
              if (t) t.armed = on;
            })}
            className="h-7 px-3 rounded-lg text-[11px] border flex items-center gap-1.5"
            style={track.armed
              ? { borderColor: '#FF8C00', color: '#FF8C00', background: 'rgba(255,140,0,0.12)' }
              : { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }}
          ><Piano size={12} /> {track.armed ? 'Armed' : 'Arm'}</button>
          {stats && stats.zones > 0 && (
            <button onClick={() => void openEditor()}
              className="h-7 px-3 rounded-lg text-[11px] font-semibold border"
              style={{ borderColor: 'rgba(0,218,243,0.45)', color: PLAYHEAD, background: 'rgba(0,218,243,0.12)' }}
              title="Zone map, loops and playback modes"
            >Edit ▸</button>
          )}
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 grid place-items-center rounded-lg border border-white/10 text-white/50 hover:text-white"><X size={15} /></button>
        </div>

        {editorOpen && program && (
          <KeraEditor program={program} onChange={commitProgram} onClose={() => setEditorOpen(false)} />
        )}

        <div className="p-4 space-y-3">
          {/* drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void handleFile(f); }}
            onClick={() => fileRef.current?.click()}
            className="rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 cursor-pointer"
            style={{ height: 120, borderColor: 'rgba(0,218,243,0.35)', background: 'rgba(0,218,243,0.04)' }}
          >
            <Upload size={22} style={{ color: PLAYHEAD }} />
            <span className="text-[12px] text-white/70">{status}</span>
            <span className="text-[10px] text-white/30">WAV · AIFF · FLAC · MP3 · OGG · SoundFont (.sf2 / .sf3)</span>
          </div>
          <input
            ref={fileRef} type="file" className="hidden"
            accept=".wav,.aiff,.aif,.flac,.mp3,.ogg,.m4a,.sf2,.sf3,audio/*"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }}
          />

          {/* SF2 preset picker */}
          {sf2Presets && (
            <div>
              <p className="text-[9.5px] uppercase tracking-[0.18em] text-white/35 font-semibold mb-1.5">SoundFont presets</p>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                {sf2Presets.map((p) => (
                  <button key={p.index} onClick={() => void pickPreset(p.index)}
                    className="h-7 px-2.5 rounded-lg text-[11px] border border-white/12 text-white/60 hover:text-white hover:border-white/30">
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* zone summary */}
          {stats && (
            <div className="flex items-center gap-4 text-[11px] text-white/50 rounded-xl border border-white/10 px-3 py-2" style={{ background: '#111116' }}>
              <span className="flex items-center gap-1.5"><Waves size={12} style={{ color: PLAYHEAD }} /> {stats.zones} zones</span>
              <span>{stats.samples} samples</span>
              {stats.keyHi > 0 && <span>keys {stats.keyLo}–{stats.keyHi}</span>}
              {stats.layers > 1 && <span style={{ color: SELECT }}>velocity layered</span>}
            </div>
          )}

          {/* mini keyboard */}
          <div>
            <div className="flex rounded-lg overflow-hidden border border-white/10" style={{ height: 52 }}>
              {Array.from({ length: 24 }, (_, i) => {
                const key = 48 + i;
                const black = [1, 3, 6, 8, 10].includes(((key % 12) + 12) % 12);
                return (
                  <button key={i} onPointerDown={() => audition(key)}
                    className="flex-1 border-r border-black/60 transition-colors"
                    style={{ background: black ? '#15151A' : '#E8E4EE' }}
                    aria-label={`Play note ${key}`} />
                );
              })}
            </div>
            <p className="text-[9px] text-white/22 mt-1.5 flex items-start gap-1">
              <Info size={9} className="flex-none mt-0.5" />
              Arm this track to play from your keyboard or MIDI controller. KERA shares ONDA's filters and spatial output — the deep zone map and the four playback modes are coming next.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
