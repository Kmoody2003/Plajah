// Reader setting: "Page animation". Used by the classic reader's Reading Settings panel and the Tela reader.
// The reader's own choice always beats the author's, and the OS reduced-motion preference beats both.

import React from 'react';
import {
  PAGE_TURNS, PICKABLE_STYLES, getSpec, type PageAnimationPref, type ResolvedPageTurn,
} from '../../services/lorea/pageTransitions';

interface Props {
  pref: PageAnimationPref;
  onPref: (p: PageAnimationPref) => void;
  sound: boolean;
  onSound: (s: boolean) => void;
  resolved: ResolvedPageTurn;
  reducedMotion: boolean;
  /** Tailwind classes from the host reader's theme. */
  cardClass?: string;
  activeClass?: string;
}

const REASON: Record<ResolvedPageTurn['reason'], string> = {
  off: 'Animation is off.',
  'reduced-system': 'Your device asks for reduced motion, so pages fade quickly. Pick a style below to use it anyway.',
  'reduced-pref': 'Reduced motion: pages fade quickly.',
  user: 'Your choice.',
  'author-page': "The author's choice for this page.",
  'author-chapter': "The author's choice for this chapter.",
  'author-book': "The author's choice for this book.",
  'format-default': 'Picked to suit this kind of book.',
};

export default function PageTurnSettings({ pref, onPref, sound, onSound, resolved, reducedMotion, cardClass = 'bg-white/5', activeClass = 'bg-small-orange text-white' }: Props) {
  const opt = (value: PageAnimationPref, label: string, hint?: string) => (
    <button key={value} type="button" role="radio" aria-checked={pref === value} title={hint}
      onClick={() => onPref(value)}
      className={`px-3 py-3 min-h-[44px] rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${pref === value ? activeClass : `${cardClass} hover:scale-[1.02]`}`}>
      {label}
    </button>
  );
  return (
    <section aria-labelledby="pt-set-h">
      <label id="pt-set-h" className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-4 block">Page animation</label>
      <div role="radiogroup" aria-labelledby="pt-set-h" className="grid grid-cols-2 gap-2">
        {opt('author', "Author's choice", 'Use the animation the author picked for this book')}
        {opt('reduce', 'Reduce', 'A quick fade, no motion')}
        {opt('off', 'Off', 'Pages change instantly')}
        {PICKABLE_STYLES.map(id => opt(id, getSpec(id).label, getSpec(id).blurb))}
      </div>
      <p className="text-[11px] opacity-50 mt-3 leading-relaxed" role="status">
        Playing: <strong>{PAGE_TURNS.find(t => t.id === resolved.id)?.label ?? 'None'}</strong>. {REASON[resolved.reason]}
        {reducedMotion && resolved.reason === 'user' ? ' (Your device prefers reduced motion, but you picked this style, so it plays.)' : ''}
      </p>
      <label className="flex items-center gap-3 mt-4 min-h-[44px] cursor-pointer">
        <input type="checkbox" checked={sound} onChange={e => onSound(e.target.checked)} className="h-5 w-5" disabled={resolved.id === 'none' || resolved.reason === 'reduced-system' || resolved.reason === 'reduced-pref'} />
        <span className="text-[12px] font-bold">Soft page sound</span>
      </label>
    </section>
  );
}
