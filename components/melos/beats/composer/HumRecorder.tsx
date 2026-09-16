// HumRecorder — sing/hum into the mic → the shipped on-device YIN transcription (humToNotes) → MIDI
// notes laid onto an instrument track. The other half of Composer P1 (docs/MELOS_COUNCIL_AND_COMPOSER).
// All on-device: the recording never leaves the browser.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Mic, Square, Loader2 } from 'lucide-react';
import { humToNotes } from '../../../../services/melos/composition/humToMidi';
import type { NoteEvent } from '../../../../services/melos/beats/grooveDoc';

interface Props {
  onInsert: (notes: NoteEvent[], meta: { key: string; mode: 'major' | 'minor'; bpm: number }) => void;
  onClose: () => void;
  target?: string;
}

export default function HumRecorder({ onInsert, onClose, target }: Props) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'working' | 'error'>('idle');
  const [err, setErr] = useState('');
  const [secs, setSecs] = useState(0);
  const [stage, setStage] = useState('');
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopMedia = () => {
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* */ }
    if (timerRef.current) clearInterval(timerRef.current);
  };
  useEffect(() => () => { try { recRef.current?.state === 'recording' && recRef.current.stop(); } catch { /* */ } stopMedia(); }, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stopMedia();
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setPhase('working'); setStage('Listening…');
        try {
          const r = await humToNotes(url, { onProgress: (s, p) => setStage(`${s} · ${Math.round(p * 100)}%`) });
          URL.revokeObjectURL(url);
          if (!r.notes.length) { setErr('No clear pitch detected — hum a single steady line, a bit louder or closer to the mic.'); setPhase('error'); return; }
          onInsert(r.notes, { key: r.key, mode: r.mode, bpm: r.bpm });
          onClose();
        } catch (e: any) { URL.revokeObjectURL(url); setErr(e?.message || 'Could not transcribe that take.'); setPhase('error'); }
      };
      rec.start();
      recRef.current = rec;
      setPhase('recording'); setSecs(0);
      timerRef.current = setInterval(() => setSecs((s) => s + 1), 1000);
    } catch (e: any) {
      setErr(e?.name === 'NotAllowedError' ? 'Microphone permission was denied — allow it in your browser to hum a melody.' : (e?.message || 'Cannot access the microphone.'));
      setPhase('error');
    }
  };
  const stop = () => { if (timerRef.current) clearInterval(timerRef.current); try { recRef.current?.stop(); } catch { /* */ } };

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" />
      <div className="relative w-full max-w-sm bg-[#100e16] border border-white/10 rounded-3xl overflow-hidden shadow-2xl p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/60"><X size={14} /></button>
        <p className="text-[9px] font-black uppercase tracking-[0.35em] text-white/30">Hum → MIDI{target ? ` · ${target}` : ''}</p>
        <h3 className="text-base font-black text-white mt-1 mb-5">Sing or hum a melody</h3>
        {phase === 'idle' && (<>
          <button onClick={start} className="w-20 h-20 mx-auto rounded-full grid place-items-center bg-[#8B5CFF] text-white shadow-lg hover:scale-105 transition-transform"><Mic size={30} /></button>
          <p className="text-[11px] text-white/40 mt-4 leading-relaxed">Tap to record. Hum one line — we detect the pitch, key and tempo on-device and lay it out as notes. Nothing leaves your device.</p>
        </>)}
        {phase === 'recording' && (<>
          <button onClick={stop} className="w-20 h-20 mx-auto rounded-full grid place-items-center bg-red-600 text-white shadow-lg animate-pulse"><Square size={26} fill="white" /></button>
          <p className="text-2xl font-black text-white mt-4 tabular-nums">{String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}</p>
          <p className="text-[11px] text-white/40 mt-1 uppercase tracking-widest font-bold">Recording — tap to stop</p>
        </>)}
        {phase === 'working' && (<div className="py-8"><Loader2 size={30} className="mx-auto animate-spin text-[#8B5CFF]" /><p className="text-[11px] text-white/50 mt-4 uppercase tracking-widest font-bold">{stage || 'Transcribing…'}</p></div>)}
        {phase === 'error' && (<>
          <p className="text-[12px] text-red-300 mt-2 mb-4 leading-relaxed">{err}</p>
          <button onClick={() => { setPhase('idle'); setErr(''); }} className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-white text-[11px] font-black uppercase tracking-widest">Try again</button>
        </>)}
      </div>
    </div>,
    document.body,
  );
}
