// "Preview page": the page as readers get it, inside the Tela editor. Real audio engine (lazy), sound off until you tap, variables shown for authors.
import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw, Volume2, VolumeX, X, Headphones } from 'lucide-react';
import type { TelaVectorObject } from '../../types';
import type { BookAudioApi, LivingBook, LivingPage, Scalar, Score } from '../../services/living/contracts';
import { loadBookAudio } from '../../services/living/runtime/audioProvider';
import TelaLivePage, { type TelaLivePageHandle } from './TelaLivePage';

export default function TelaLivePreview({ objects, width, height, page, scores, defaults, title, onClose }: {
  objects: TelaVectorObject[]; width: number; height: number; page: LivingPage; scores?: Record<string, Score>; defaults?: LivingBook['defaults']; title: string; onClose: () => void;
}) {
  const [audio, setAudio] = useState<BookAudioApi | null>(null);
  const [sound, setSound] = useState(false);
  const [reduced, setReduced] = useState(() => (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) || false);
  const [vars, setVars] = useState<Record<string, Scalar>>({});
  const [goals, setGoals] = useState<string[]>([]);
  const ref = useRef<TelaLivePageHandle>(null);
  useEffect(() => { let on = true; void loadBookAudio(scores).then(a => { if (on) setAudio(a); }); return () => { on = false; }; }, [scores]);
  useEffect(() => { if (audio) { audio.setGains({ music: defaults?.musicGain, sfx: defaults?.sfxGain }); audio.setMuted(!sound); } }, [audio, sound, defaults]);
  useEffect(() => () => { audio?.stopAll(); }, [audio]);
  useEffect(() => { const t = setInterval(() => setVars(ref.current?.getVars() ?? {}), 250); return () => clearInterval(t); }, []);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  const b = 'h-10 px-3 rounded-full text-[12px] font-bold flex items-center gap-1.5 whitespace-nowrap';
  const maxW = Math.max(240, Math.min(520, Math.floor(((typeof window !== 'undefined' ? window.innerHeight : 800) - 190) * width / Math.max(1, height))));
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 p-3" role="dialog" aria-modal="true" aria-label={`Preview ${title}`} onPointerDownCapture={() => { setSound(true); void audio?.unlock(); }}>
      <div className="w-full max-w-[560px] rounded-[18px] bg-[#0e0b14] border border-white/10 p-3 shadow-2xl">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <div className="text-[12px] font-extrabold text-white/80 mr-auto">Preview · {title}</div>
          <button className={`${b} ${sound ? 'bg-amber-400 text-black' : 'bg-white/10 text-white/80'}`} aria-pressed={sound} onClick={() => setSound(s => !s)}>{sound ? <Volume2 size={15} /> : <VolumeX size={15} />}{sound ? 'Sound on' : 'Sound off'}</button>
          <button className={`${b} ${reduced ? 'bg-sky-300 text-black' : 'bg-white/10 text-white/80'}`} aria-pressed={reduced} onClick={() => setReduced(r => !r)}>Reduced motion</button>
          <button className={`${b} bg-white/10 text-white/80`} onClick={() => ref.current?.narrate()} disabled={!sound}><Headphones size={15} />Read</button>
          <button className={`${b} bg-white/10 text-white/80`} onClick={() => ref.current?.replay()}><RotateCcw size={15} />Play again</button>
          <button className={`${b} bg-white/10 text-white/80`} onClick={onClose} aria-label="Close preview"><X size={15} /></button>
        </div>
        <div className="mx-auto rounded-[10px] overflow-hidden bg-black" style={{ width: maxW }}>
          <TelaLivePage ref={ref} objects={objects} width={width} height={height} living={page} audio={audio} reducedMotion={reduced} soundEnabled={sound} onGoal={(pg, id) => setGoals(g => (g.includes(id) ? g : [...g, id]))} onGoto={p => setGoals(g => [...g, `goto ${String(p)}`])} />
        </div>
        <div className="mt-2 text-[10px] text-white/45 font-mono break-words" aria-label="Variables">{Object.keys(vars).length ? Object.entries(vars).map(([k, v]) => `${k}=${String(v)}`).join('  ') : 'no variables'}</div>
        {goals.length > 0 && <div className="text-[10px] text-[#8FF5FF]">Goals: {goals.join(', ')}</div>}
        <div className="text-[10px] text-white/35 mt-1">Sound starts on your first tap here (as it does for readers). Esc closes.</div>
      </div>
    </div>
  );
}
