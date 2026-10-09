/**
 * ComposeWithCouncil: author panel for the Composer Council (services/living/composer/composerCouncil.ts).
 * Reads the book (page text, the behaviours already on each page), lets the author state ages and an optional mood, then shows what the
 * council suggests per page (play / rest, tempo, grow / slow, reasons), lets them audition a cue with the book audio engine, and applies the
 * chosen pages into the document's LivingBook (SET_LIVING_BOOK). Works with no AI key; "AI melody" is optional and falls back by itself.
 * Nothing is applied until the author presses an Apply button, and every suggestion can be declined.
 *
 * Mounted next to TelaBehaviorsPanel in components/tela/TelaView.tsx (lazy).
 */
import React, { useMemo, useRef, useState } from 'react';
import type { TelaDoc } from '../../types';
import type { TelaOp } from '../tela/telaOps';
import type { Trigger } from '../../services/living/contracts';
import { frameObjects } from '../../services/living/runtime/objects';
import { getLivingPage } from '../../services/living/authoring/livingDoc';
import {
  MOODS, applyPlanToLivingBook, planBookMusic, planBookMusicWithAi,
  type BookMusicBrief, type BookPageBrief, type ComposerPlan, type Mood, type SoundInteraction,
} from '../../services/living/composer/composerCouncil';
import { scoreToSingleClip } from '../../services/living/composer/melosBridge';

const lbl = 'text-[9px] font-extrabold uppercase tracking-[.1em] text-white/40 mb-0.5';
const inp = 'w-full h-7 px-2 rounded-[7px] text-[11px] text-white bg-white/[.06] border border-white/[.14] outline-none focus:border-[#00DAF3]/60';
const btn = 'h-7 px-2.5 rounded-[7px] text-[10px] font-extrabold border border-white/[.12] bg-white/[.05] text-white/75 hover:text-white hover:bg-white/[.1] disabled:opacity-40';

const TRIGGER_TO_SOUND: Partial<Record<Trigger['type'], SoundInteraction>> = { tap: 'tap', doubleTap: 'tap', press: 'press', drag: 'drag', proximity: 'proximity', tilt: 'tilt' };

/** Build the council's brief from the Tela document: page text from TEXT objects, sound interactions from existing behaviours. */
export function briefFromDoc(doc: TelaDoc, ages: { min: number; max: number }, moods: Record<number, Mood | 'silent' | ''>, seed: number): BookMusicBrief {
  const pages: BookPageBrief[] = doc.frames.map((frame, i) => {
    const page = i + 1;
    const objs = frameObjects(doc, frame);
    const text = objs.map((o) => (o.kind === 'TEXT' ? o.text : '')).filter(Boolean).join(' ');
    const lp = getLivingPage(doc.living, page);
    const interactions: SoundInteraction[] = [];
    for (const b of lp.behaviors) {
      const k = TRIGGER_TO_SOUND[b.on.type];
      const makesSound = b.do.some((a) => a.do === 'sfx' || a.do === 'note');
      if (k && makesSound) interactions.push(k);
    }
    return { page, text, interactions, mood: moods[page] || undefined, narrated: !!text };
  });
  return { title: doc.title as string | undefined, ages, pages, seed };
}

export interface ComposeWithCouncilProps {
  doc: TelaDoc;
  frameId: string | null;
  dispatchOp: (op: TelaOp) => void;
}

export default function ComposeWithCouncil({ doc, frameId, dispatchOp }: ComposeWithCouncilProps) {
  const pageNumber = useMemo(() => { const i = doc.frames.findIndex((f) => f.id === frameId); return i < 0 ? 0 : i + 1; }, [doc.frames, frameId]);
  const [open, setOpen] = useState(false);
  const [ageMin, setAgeMin] = useState(3);
  const [ageMax, setAgeMax] = useState(6);
  const [moods, setMoods] = useState<Record<number, Mood | 'silent' | ''>>({});
  const [seed, setSeed] = useState(7);
  const [useAi, setUseAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<ComposerPlan | null>(null);
  const [note, setNote] = useState('');
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<Awaited<ReturnType<typeof loadAudio>> | null>(null);

  async function loadAudio() { return (await import('../../services/living/audio')).getBookAudio(); }

  const generate = async () => {
    setBusy(true); setNote('');
    try {
      const brief = briefFromDoc(doc, { min: Math.min(ageMin, ageMax), max: Math.max(ageMin, ageMax) }, moods, seed);
      if (!brief.pages.length) { setNote('This document has no pages yet.'); return; }
      if (useAi) {
        const r = await planBookMusicWithAi(brief);
        setPlan(r.plan);
        setNote(r.aiErrors.length ? `AI melody unavailable for ${r.aiErrors.length} cue(s), used the built-in composer instead.` : 'AI melodies used (then snapped to key and the children\'s lens).');
      } else setPlan(planBookMusic(brief));
    } finally { setBusy(false); }
  };

  const audition = async (cue: string) => {
    if (!plan) return;
    try {
      const audio = audioRef.current ?? (audioRef.current = await loadAudio());
      await audio.unlock();                       // inside the click: required before sound
      audio.registerScores({ [cue]: plan.cues[cue] });
      audio.setGains({ music: plan.caps.maxMusicGain });
      audio.playCue(cue, { fadeMs: plan.caps.fadeInMs });
      setPlaying(cue);
    } catch (e) { setNote(`Could not play: ${e instanceof Error ? e.message : String(e)}`); }
  };
  const stop = () => { try { audioRef.current?.stopMusic({ fadeMs: plan?.caps.fadeOutMs ?? 1500 }); } catch { /* ignore */ } setPlaying(null); };

  const apply = (onlyPages?: number[]) => {
    if (!plan) return;
    dispatchOp({ type: 'SET_LIVING_BOOK', living: applyPlanToLivingBook(doc.living, plan, doc.id, { onlyPages }) });
    setNote(onlyPages ? `Applied to page ${onlyPages.join(', ')}. You can edit or remove it in the Live panel.` : 'Applied to every page. You can edit or remove any of it in the Live panel.');
  };

  const copyMelos = async (cue: string) => {
    if (!plan) return;
    const { clip, tempo, loss } = scoreToSingleClip(plan.cues[cue]);
    const payload = JSON.stringify({ kind: 'melos-clip', tempo, clip, lost: loss.dropped }, null, 1);
    try { await navigator.clipboard.writeText(payload); setNote('Melos clip JSON copied. Melos has no import-clip entry point yet, so paste it where you can use it; drums and effects are not included.'); }
    catch { setNote('Could not copy to the clipboard.'); }
  };
  const openMelos = () => window.dispatchEvent(new CustomEvent('OPEN_MELOS_BEATS', { detail: {} }));

  const dir = plan?.pages.find((p) => p.page === pageNumber);

  if (!doc.frames.length) return null;
  return (
    <div className="mt-3 rounded-[10px] border border-white/[.09] p-2 text-white">
      <button type="button" className="w-full flex items-center justify-between text-left" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={lbl + ' !mb-0'}>Compose with the Council</span><span className="text-[10px] text-white/45">{open ? 'Hide' : 'Open'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="text-[10px] leading-snug text-white/55">Aria speaks for a children's-song composer, a film and game scorer, a sound designer and a lullaby specialist. They suggest; you decide. Nothing is applied until you press Apply.</div>
          <div className="grid grid-cols-3 gap-1.5">
            <label><div className={lbl}>Youngest age</div><input className={inp} type="number" min={0} max={17} value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value) || 0)} /></label>
            <label><div className={lbl}>Oldest age</div><input className={inp} type="number" min={0} max={17} value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value) || 0)} /></label>
            <label><div className={lbl}>Variation</div><input className={inp} type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} /></label>
          </div>
          {pageNumber > 0 && (
            <label><div className={lbl}>Mood of page {pageNumber} (empty = read from the text)</div>
              <select className={inp} value={moods[pageNumber] ?? ''} onChange={(e) => setMoods((m) => ({ ...m, [pageNumber]: e.target.value as Mood | 'silent' | '' }))}>
                <option value="">(from the text)</option><option value="silent">silent (no music)</option>{MOODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select></label>
          )}
          <label className="flex items-center gap-1.5 text-[10px] text-white/60"><input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />AI melody (optional, needs the AI service; falls back automatically)</label>
          <div className="flex gap-1.5">
            <button type="button" className={btn} disabled={busy} onClick={() => void generate()}>{busy ? 'Composing...' : plan ? 'Compose again' : 'Compose suggestions'}</button>
            <button type="button" className={btn} onClick={openMelos} title="Opens the Melos Beats room. Melos cannot import a clip from here yet: use Copy for Melos.">Open Melos</button>
          </div>
          {note && <div role="status" className="text-[10px] text-[#F7C46C]">{note}</div>}
          {plan && (
            <div className="space-y-2">
              <div className="text-[10.5px] text-white/80">{plan.summary}</div>
              <div className="text-[10px] text-white/50">Lens: {plan.caps.label}, tempo {plan.caps.minTempo}-{plan.caps.maxTempo} bpm, suggested music volume at most {plan.caps.maxMusicGain}. Silent pages: {plan.silentPages.join(', ') || 'none'}.</div>
              {dir && (
                <div className="rounded-[8px] bg-white/[.04] p-1.5">
                  <div className="text-[10.5px] font-extrabold">Page {dir.page}: {dir.music ? `${dir.scoredMood} cue, ${dir.tempo} bpm, ${dir.dynamic}` : 'rest (no music)'}</div>
                  <ul className="mt-0.5 list-disc pl-4 text-[10px] text-white/60">{dir.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                  {dir.duckAdvice && <div className="mt-0.5 text-[10px] text-[#F7C46C]">{dir.duckAdvice}</div>}
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {dir.cue && <button type="button" className={btn} onClick={() => void (playing === dir.cue ? stop() : audition(dir.cue!))}>{playing === dir.cue ? 'Stop' : 'Audition'}</button>}
                    <button type="button" className={btn} onClick={() => apply([dir.page])}>Apply to this page</button>
                    {dir.cue && <button type="button" className={btn} onClick={() => void copyMelos(dir.cue!)}>Copy for Melos</button>}
                  </div>
                </div>
              )}
              <div className="flex gap-1.5"><button type="button" className={btn} onClick={() => apply()}>Apply to all pages</button>{playing && <button type="button" className={btn} onClick={stop}>Stop music</button>}</div>
              <details className="text-[10px] text-white/60">
                <summary className="cursor-pointer text-white/75">What the council said</summary>
                {plan.proposals.map((p) => (
                  <div key={p.personaId} className="mt-1"><b className="text-white/80">{p.headline}</b>
                    {p.moves.map((m, i) => <div key={i} className="pl-2">{m.text}<div className="text-white/40">Your call: {m.yourCall}</div></div>)}</div>
                ))}
                {plan.tensions.map((t, i) => <div key={i} className="mt-1 text-[#F7C46C]">{t}</div>)}
              </details>
              <div className="text-[9.5px] text-white/40">Not listened to and not loudness-measured. Audition on the device your readers use.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
