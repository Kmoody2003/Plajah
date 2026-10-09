// Reader controls for living pages: Sound, Read-to-me, Reduced motion, Play again. Choices are remembered (localStorage, guarded).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Headphones, RotateCcw, Volume2, VolumeX, Sparkles, Ban } from 'lucide-react';

export type NarrateMode = 'off' | 'on-demand' | 'auto';
type SoundPref = 'on' | 'off' | null;
type ReducedPref = 'system' | 'on' | 'off';

const KEY = 'plajah-living-prefs';
interface Stored { sound: SoundPref; reduced: ReducedPref; narrate: NarrateMode | null }
const read = (): Stored => {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && typeof v === 'object') return { sound: v.sound === 'on' || v.sound === 'off' ? v.sound : null, reduced: ['system', 'on', 'off'].includes(v.reduced) ? v.reduced : 'system', narrate: ['off', 'on-demand', 'auto'].includes(v.narrate) ? v.narrate : null }; } catch { /* blocked or corrupt */ }
  return { sound: null, reduced: 'system', narrate: null };
};
const write = (s: Stored) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked */ } };

export interface LivingPrefs {
  /** Effective: true only after a real gesture AND the reader has not muted. */
  soundOn: boolean;
  /** The reader has interacted (audio can be unlocked). */
  gesture: boolean;
  soundPref: SoundPref;
  reduced: boolean;
  reducedPref: ReducedPref;
  narrate: NarrateMode;
  markGesture(): void;
  toggleSound(): void;
  cycleReduced(): void;
  setNarrate(m: NarrateMode): void;
}

/** Sound is OFF until the first gesture (contract rule 2); after it, on unless the reader muted it earlier. */
export function useLivingPrefs(defaults?: { narrate?: NarrateMode }): LivingPrefs {
  const [st, setSt] = useState<Stored>(read);
  const [gesture, setGesture] = useState(false);
  const [sys, setSys] = useState(() => (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) || false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)'); if (!mq) return;
    const h = () => setSys(mq.matches); mq.addEventListener?.('change', h); return () => mq.removeEventListener?.('change', h);
  }, []);
  const update = useCallback((f: (s: Stored) => Stored) => setSt(prev => { const n = f(prev); write(n); return n; }), []);
  const markGesture = useCallback(() => setGesture(true), []);
  const narrate = st.narrate ?? defaults?.narrate ?? 'on-demand';
  const soundOn = gesture && st.sound !== 'off';
  return useMemo<LivingPrefs>(() => ({
    soundOn, gesture, soundPref: st.sound,
    reduced: st.reduced === 'system' ? sys : st.reduced === 'on', reducedPref: st.reduced, narrate,
    markGesture,
    toggleSound: () => update(s => ({ ...s, sound: soundOn ? 'off' : 'on' })),
    cycleReduced: () => update(s => ({ ...s, reduced: s.reduced === 'system' ? 'on' : s.reduced === 'on' ? 'off' : 'system' })),
    setNarrate: m => update(s => ({ ...s, narrate: m })),
  }), [soundOn, gesture, st, sys, narrate, markGesture, update]);
}

const btn = 'h-11 min-w-[44px] px-3 rounded-full text-[12px] font-bold flex items-center justify-center gap-1.5 whitespace-nowrap';

export function LivingReaderBar({ prefs, onReplay, onReadNow, canNarrate = true }: { prefs: LivingPrefs; onReplay: () => void; onReadNow: () => void; canNarrate?: boolean }) {
  const soundLabel = prefs.soundOn ? 'Sound on' : prefs.soundPref === 'off' ? 'Sound off' : prefs.gesture ? 'Sound off' : 'Sound: tap to start';
  const motion = prefs.reducedPref === 'system' ? `Motion: system${prefs.reduced ? ' (reduced)' : ''}` : prefs.reducedPref === 'on' ? 'Reduced motion: on' : 'Reduced motion: off';
  return (
    <div role="toolbar" aria-label="Living page controls" data-living-bar className="sticky top-[60px] z-10 flex flex-wrap items-center justify-center gap-2 px-3 py-1.5 bg-[#0A0A0A]/90 backdrop-blur border-b border-white/10">
      <button type="button" onClick={prefs.toggleSound} aria-pressed={prefs.soundOn} aria-label={soundLabel} className={`${btn} ${prefs.soundOn ? 'bg-amber-400 text-black' : 'bg-white/10 text-white/80 hover:bg-white/20'}`}>
        {prefs.soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}<span>{soundLabel}</span>
      </button>
      {canNarrate && (
        <div role="radiogroup" aria-label="Read to me" className="flex items-center gap-1 rounded-full bg-white/[0.06] p-1">
          <Headphones size={14} className="ml-2 text-white/50" aria-hidden="true" />
          {([['off', 'Off'], ['on-demand', 'On request'], ['auto', 'Auto']] as Array<[NarrateMode, string]>).map(([m, label]) => (
            <button key={m} type="button" role="radio" aria-checked={prefs.narrate === m} onClick={() => prefs.setNarrate(m)} className={`h-9 px-3 rounded-full text-[11px] font-bold ${prefs.narrate === m ? 'bg-white text-black' : 'text-white/70 hover:bg-white/10'}`}>{label}</button>
          ))}
        </div>
      )}
      {canNarrate && prefs.narrate !== 'off' && (
        <button type="button" onClick={onReadNow} disabled={!prefs.soundOn} title={prefs.soundOn ? 'Read this page aloud' : 'Turn sound on to hear the story'} className={`${btn} bg-white/10 text-white/85 hover:bg-white/20 disabled:opacity-40`}><Headphones size={16} /><span>Read this page</span></button>
      )}
      <button type="button" onClick={prefs.cycleReduced} aria-label={motion} title="Click to change: system, on, off" className={`${btn} ${prefs.reducedPref === 'on' ? 'bg-sky-300 text-black' : 'bg-white/10 text-white/80 hover:bg-white/20'}`}>
        {prefs.reduced ? <Ban size={16} /> : <Sparkles size={16} />}<span>{motion}</span>
      </button>
      <button type="button" onClick={onReplay} aria-label="Play this page again" className={`${btn} bg-white/10 text-white/85 hover:bg-white/20`}><RotateCcw size={16} /><span>Play again</span></button>
    </div>
  );
}
