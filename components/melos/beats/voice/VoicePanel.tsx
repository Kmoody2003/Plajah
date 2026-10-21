// The Voice panel — sing, hum or beatbox straight into Chora Studio.
//
//   Sing     — your voice is tracked live (VoiceCapture). "Hear the synth" plays the armed instrument
//              as you sing ("sing the synth"), "Glide" bends it with your pitch, "Snap to key" keeps
//              notes in the project key. With record armed and the transport running (count-in +
//              click), the notes you sing are written into the armed track where you sang them.
//   Beatbox  — boom / psh / ts play MEKA pads; with record armed the hits land in the playing
//              pattern (the same pad recorder as the pads). "Teach" learns YOUR sounds: make each
//              one five times and the classifier matches your mouth instead of the default rules.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, X } from 'lucide-react';
import type { GrooveDoc } from '../../../../services/melos/beats/grooveDoc';
import { BeatsEngine } from '../../../../services/melos/beats/engine/BeatsEngine';
import { VoiceCapture, type VoiceMode, type VoiceStatus } from '../../../../services/melos/beats/voice/voiceCapture';
import {
  DRUM_CLASSES, defaultPadMap, loadMouthModel, saveMouthModel, type DrumClass, type MouthModel,
} from '../../../../services/melos/beats/voice/beatbox';
import { commitRecordedNote } from '../instrument/useInstrumentKeyboard';
import { docKey, keyLabel } from '../../../../services/melos/beats/songKey';
import { snapToScale } from '../../../../services/melos/theory';

const NOTE = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const noteName = (m: number) => `${NOTE[((Math.round(m) % 12) + 12) % 12]}${Math.floor(Math.round(m) / 12) - 1}`;
const CLASS_LABEL: Record<DrumClass, { label: string; say: string; color: string }> = {
  kick: { label: 'Kick', say: '“boom” / “b”', color: '#FF8C00' },
  snare: { label: 'Snare', say: '“psh” / “ka”', color: '#00DAF3' },
  hat: { label: 'Hat', say: '“ts” / “t”', color: '#F5F0FA' },
  perc: { label: 'Perc', say: 'a click, “k” or “tk”', color: '#D0BCFF' },
};
const TEACH_COUNT = 5;

interface Props {
  doc: GrooveDoc;
  mutate: (fn: (d: GrooveDoc) => void, opts?: { coalesce?: string }) => void;
  isRecording: () => boolean;
  onClose: () => void;
}

export const VoicePanel: React.FC<Props> = ({ doc, mutate, isRecording, onClose }) => {
  const cap = VoiceCapture.get();
  const engine = BeatsEngine.get();
  const [mode, setMode] = useState<VoiceMode>(() => (localStorage.getItem('melos:voice:mode') === 'beatbox' ? 'beatbox' : 'sing'));
  const [status, setStatus] = useState<VoiceStatus>({ running: cap.isRunning(), levelDb: -100, pitch: null, note: null });
  const [error, setError] = useState('');
  const [hear, setHear] = useState(true);
  const [glide, setGlide] = useState(false);
  const [snap, setSnap] = useState(true);
  const [sens, setSens] = useState(0.55);
  const [padMap, setPadMap] = useState<Record<DrumClass, number>>(() => defaultPadMap(doc.kit));
  const [model, setModel] = useState<MouthModel | null>(() => loadMouthModel());
  const [teach, setTeach] = useState<{ cls: DrumClass; got: number } | null>(null);
  const [lastHit, setLastHit] = useState<{ cls: DrumClass; at: number } | null>(null);
  const [recCount, setRecCount] = useState(0);

  // Latest options for the capture callbacks (they're registered once per mic session).
  const live = useRef({ hear, glide, snap, padMap, model, teach, doc });
  live.current = { hear, glide, snap, padMap, model, teach, doc };
  const heldNote = useRef<number | null>(null);
  const pass = useRef('');
  const lastStatusAt = useRef(0);
  const lastRunning = useRef(cap.isRunning());

  const key = docKey(doc);
  const toKey = (midi: number) => {
    const k = docKey(live.current.doc);
    return live.current.snap && k ? snapToScale(midi, k.tonic, k.scale, 'nearest') : midi;
  };

  useEffect(() => { cap.setMode(mode); try { localStorage.setItem('melos:voice:mode', mode); } catch { /* */ } }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cap.setSensitivity(sens); }, [sens]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cap.setModel(model); saveMouthModel(model); }, [model]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cap.setHandlers({
      onSing: (e) => {
        const track = engine.armedTrack();
        if (!track || !live.current.hear) return;
        if (e.type === 'on') {
          if (heldNote.current !== null) engine.instrumentNoteOff(track, heldNote.current);
          const k = toKey(e.midi);
          heldNote.current = k;
          engine.setInstrumentPitchBend(track, 0);
          void engine.ensureInstrument(track).then(() => engine.instrumentNoteOn(track, k, e.vel));
        } else if (e.type === 'off') {
          if (heldNote.current !== null) engine.instrumentNoteOff(track, heldNote.current);
          heldNote.current = null;
          engine.setInstrumentPitchBend(track, 0);
        } else if (live.current.glide && heldNote.current !== null) {
          // Pitch bend follows the voice (±2 semitones = full bend).
          engine.setInstrumentPitchBend(track, Math.max(-1, Math.min(1, (e.midi - heldNote.current) / 2)));
        }
      },
      onNote: (n) => {
        if (!isRecording() || !engine.isRunning()) return;
        const track = engine.armedTrack();
        if (!track) return;
        if (!pass.current) pass.current = `voice-rec:${Date.now()}`;
        const p = pass.current;
        commitRecordedNote(track.id, { key: toKey(n.midi), vel: n.vel, startBeats: engine.beatAt(n.t0) }, engine.beatAt(n.t1), (fn) => mutate(fn, { coalesce: p }));
        setRecCount((c) => c + 1);
      },
      onHit: (h) => {
        const t = live.current.teach;
        if (t) {
          // Teaching: this hit is an example of the class being taught.
          setModel((m) => {
            const next: MouthModel = { examples: { ...(m?.examples ?? {}) } };
            next.examples[t.cls] = [...(t.got === 0 ? [] : next.examples[t.cls] ?? []), h.features].slice(-TEACH_COUNT);
            return next;
          });
          const got = t.got + 1;
          setTeach(got >= TEACH_COUNT ? null : { cls: t.cls, got });
          engine.performPadHit(live.current.padMap[t.cls], h.vel, h.t);
          setLastHit({ cls: t.cls, at: performance.now() });
          return;
        }
        engine.performPadHit(live.current.padMap[h.cls], h.vel, h.t);
        setLastHit({ cls: h.cls, at: performance.now() });
      },
      onStatus: (s) => {
        if (!engine.isRunning()) pass.current = ''; // a new take starts a new undo step
        const now = performance.now();
        if (now - lastStatusAt.current < 40 && s.running === lastRunning.current) return; // ~25 fps
        lastStatusAt.current = now;
        lastRunning.current = s.running;
        setStatus(s);
      },
    });
    return () => { cap.setHandlers({}); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Release a held synth note and the mic when the panel closes.
  useEffect(() => () => {
    const track = engine.armedTrack();
    if (track && heldNote.current !== null) engine.instrumentNoteOff(track, heldNote.current);
    cap.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMic = async () => {
    setError('');
    if (cap.isRunning()) { cap.stop(); return; }
    try { cap.setSensitivity(sens); cap.setModel(model); cap.setMode(mode); await cap.start(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open the microphone'); }
  };

  const armed = engine.armedTrack();
  const levelPct = Math.max(0, Math.min(100, ((status.levelDb + 60) / 60) * 100));
  const cents = status.pitch !== null ? Math.round((status.pitch - Math.round(status.pitch)) * 100) : 0;
  const recording = isRecording() && engine.isRunning();
  const sounding = useMemo(() => doc.kit.map((p, i) => ({ i, p })).filter(({ p }) => !p.empty), [doc.kit]);

  return (
    <div className="fixed right-4 bottom-4 z-[80] w-[340px] rounded-2xl border border-white/12 bg-[#110D18]/95 backdrop-blur-xl shadow-2xl text-white">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold">Voice</span>
        <div className="flex gap-0.5 bg-white/[0.06] border border-white/10 rounded-lg p-0.5 ml-1">
          {(['sing', 'beatbox'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`h-6 px-2.5 rounded-md text-[10.5px] ${mode === m ? 'bg-white/15 font-semibold' : 'text-white/45'}`}>
              {m === 'sing' ? 'Sing / hum' : 'Beatbox'}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        {recording && <span className="text-[9px] font-semibold text-[#FF4D8C] animate-pulse">● REC</span>}
        <button onClick={onClose} className="w-6 h-6 grid place-items-center rounded-md text-white/40 hover:text-white" aria-label="Close voice panel"><X size={13} /></button>
      </div>

      <div className="px-4 pb-3 flex items-center gap-3">
        <button
          onClick={() => { void toggleMic(); }}
          className="w-11 h-11 rounded-full grid place-items-center shrink-0 transition-transform hover:scale-105"
          style={status.running ? { background: '#D40055', boxShadow: '0 0 18px rgba(212,0,85,0.55)' } : { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
          aria-label={status.running ? 'Stop listening' : 'Start listening'}
          title={status.running ? 'Stop listening' : 'Start listening (asks for the microphone)'}
        >{status.running ? <Mic size={18} /> : <MicOff size={18} className="text-white/60" />}</button>
        <div className="flex-1 min-w-0">
          {mode === 'sing' ? (
            <div className="flex items-baseline gap-2">
              <span className="text-[26px] font-black tabular-nums leading-none" style={{ color: status.note !== null ? '#fff' : 'rgba(255,255,255,0.25)' }}>
                {status.note !== null ? noteName(toKey(status.note)) : status.pitch !== null ? noteName(status.pitch) : '—'}
              </span>
              {status.pitch !== null && (
                <span className="text-[10px] font-mono" style={{ color: Math.abs(cents) < 15 ? '#06D6A0' : '#FFD166' }}>{cents > 0 ? '+' : ''}{cents}¢</span>
              )}
            </div>
          ) : (
            <div className="text-[22px] font-black leading-none" style={{ color: lastHit && performance.now() - lastHit.at < 400 ? CLASS_LABEL[lastHit.cls].color : 'rgba(255,255,255,0.25)' }}>
              {lastHit ? CLASS_LABEL[lastHit.cls].label : '—'}
            </div>
          )}
          <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full transition-[width] duration-75" style={{ width: `${levelPct}%`, background: levelPct > 92 ? '#EF4444' : '#06D6A0' }} />
          </div>
        </div>
      </div>
      {error && <p className="px-4 pb-2 text-[11px] text-[#FF8B8B]">{error}</p>}

      <div className="px-4 pb-2 flex items-center gap-2 text-[10px] text-white/45">
        <span className="shrink-0">Sensitivity</span>
        <input type="range" min={0} max={1} step={0.01} value={sens} onChange={(e) => setSens(Number(e.target.value))} className="flex-1 accent-[#D0BCFF]" />
      </div>

      {mode === 'sing' ? (
        <div className="px-4 pb-4 flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {([
              ['hear', 'Hear the synth', hear, setHear, 'Play the armed instrument as you sing'],
              ['glide', 'Glide', glide, setGlide, 'Bend the synth with your voice (scoops, vibrato)'],
              ['snap', key ? `Snap to ${keyLabel(key)}` : 'Snap to key', snap, setSnap, key ? 'Keep sung notes in the project key' : 'Set a project key in the transport bar'],
            ] as const).map(([id, label, on, set, tip]) => (
              <button key={id} onClick={() => set((v: boolean) => !v)} title={tip} aria-pressed={on}
                className={`h-7 px-2.5 rounded-lg border text-[10.5px] ${on ? 'border-[#D0BCFF]/50 text-[#D0BCFF] bg-[#D0BCFF]/12' : 'border-white/12 text-white/45'}`}>{label}</button>
            ))}
          </div>
          <p className="text-[10.5px] leading-snug text-white/45">
            {armed
              ? <>Plays and records <b className="text-white/75">{armed.name || 'the armed track'}</b>. Arm record (●) and press play — the count-in and click keep you in time; what you sing lands on the track.{recCount ? ` ${recCount} note${recCount > 1 ? 's' : ''} recorded.` : ''}</>
              : <span className="text-[#FFD166]">Arm an instrument track (● on its header) to play and record your voice.</span>}
          </p>
        </div>
      ) : (
        <div className="px-4 pb-4 flex flex-col gap-1.5">
          {DRUM_CLASSES.map((cls) => {
            const n = model?.examples[cls]?.length ?? 0;
            const teaching = teach?.cls === cls;
            return (
              <div key={cls} className="flex items-center gap-2">
                <span className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: CLASS_LABEL[cls].color }} />
                <span className="text-[11px] w-12 shrink-0">{CLASS_LABEL[cls].label}</span>
                <select value={padMap[cls]} onChange={(e) => setPadMap((m) => ({ ...m, [cls]: Number(e.target.value) }))}
                  className="flex-1 min-w-0 h-6 bg-black/40 border border-white/12 rounded-md text-[10.5px] text-white/80 outline-none px-1" aria-label={`${CLASS_LABEL[cls].label} pad`}>
                  {sounding.map(({ i, p }) => <option key={i} value={i}>{i + 1} · {p.name}</option>)}
                </select>
                <button
                  onClick={() => setTeach(teaching ? null : { cls, got: 0 })}
                  disabled={!status.running}
                  title={status.running ? `Teach: make your ${CLASS_LABEL[cls].label.toLowerCase()} sound (${CLASS_LABEL[cls].say}) ${TEACH_COUNT} times` : 'Start listening first'}
                  className="h-6 px-2 rounded-md border text-[10px] shrink-0 disabled:opacity-30"
                  style={teaching ? { borderColor: '#FF4D8C', color: '#FF4D8C', background: 'rgba(255,77,140,0.12)' } : n ? { borderColor: 'rgba(6,214,160,0.5)', color: '#06D6A0' } : { borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}
                >{teaching ? `${teach!.got}/${TEACH_COUNT}…` : n ? `Taught ${n}` : 'Teach'}</button>
              </div>
            );
          })}
          <p className="text-[10.5px] leading-snug text-white/45 mt-1">
            {teach
              ? <span className="text-[#FF4D8C]">Make your {CLASS_LABEL[teach.cls].label.toLowerCase()} sound — {CLASS_LABEL[teach.cls].say} — {TEACH_COUNT - teach.got} more.</span>
              : model ? <>Matching your taught sounds. <button onClick={() => setModel(null)} className="underline hover:text-white">Forget them</button></>
                : 'Works out of the box; “Teach” makes it learn your mouth. Arm record and play to drop hits into the pattern.'}
          </p>
        </div>
      )}
    </div>
  );
};
