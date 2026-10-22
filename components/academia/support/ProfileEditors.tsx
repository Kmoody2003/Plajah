import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Printer, X } from 'lucide-react';
import {
  COMM_MODES, IDENTITIES, LANGUAGE_PREFS, supportActions,
  type AboutMe, type Supports, type SupportPlan,
} from '../../../services/learningSupport';

/**
 * The two learner-owned halves of a support plan: "All about me" (strengths first, in the learner's words) and the
 * supports themselves (each switch says what it changes). Both are used by learners, families and, read-only, teachers.
 */

export const card = 'rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-6';
export const eyebrow = 'text-[11px] font-black uppercase tracking-[0.25em]';
const chip = (on: boolean) => `min-h-[40px] px-3.5 rounded-full border text-[13px] font-semibold ${on ? 'bg-[#00DAF3]/15 border-[#00DAF3] text-white' : 'border-white/15 text-white/70 hover:border-white/35'}`;

/** A list of short phrases the learner adds one at a time ("Great memory for maps", "Quiet spaces"). */
const PhraseList: React.FC<{ label: string; hint: string; items: string[]; color: string; readOnly?: boolean; onChange: (v: string[]) => void }> = ({ label, hint, items, color, readOnly, onChange }) => {
  const [draft, setDraft] = useState('');
  const add = () => { const t = draft.trim(); if (!t) return; onChange([...items, t].slice(0, 20)); setDraft(''); };
  return (
    <div>
      <p className="text-[15px] font-bold" style={{ color }}>{label}</p>
      <p className="text-[12px] text-white/50 mb-2">{hint}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((t, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] border" style={{ borderColor: `${color}55`, background: `${color}14` }}>
            {t}
            {!readOnly && <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(items.filter((_, k) => k !== i))} className="text-white/50 hover:text-white"><X size={13} /></button>}
          </span>
        ))}
        {items.length === 0 && readOnly && <span className="text-[13px] text-white/40">Nothing added yet.</span>}
      </div>
      {!readOnly && (
        <div className="flex gap-2 mt-2">
          <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} maxLength={80}
            aria-label={`Add to ${label}`} placeholder="Type and press Enter" className="flex-1 min-w-0 min-h-[44px] rounded-2xl bg-white/[0.05] border border-white/12 px-3.5 text-[14px] outline-none focus:border-[#00DAF3]" />
          <button type="button" onClick={add} aria-label={`Add to ${label}`} className="min-h-[44px] w-11 grid place-items-center rounded-2xl border border-white/15 hover:bg-white/10"><Plus size={16} /></button>
        </div>
      )}
    </div>
  );
};

export const AboutMeEditor: React.FC<{ plan: SupportPlan; self?: boolean; readOnly?: boolean; onChange: (about: AboutMe) => void; onPrint: () => void }> = ({ plan, self, readOnly, onChange, onPrint }) => {
  const a = plan.about;
  const set = (p: Partial<AboutMe>) => onChange({ ...a, ...p });
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  const name = a.preferredName || plan.learnerName || 'this learner';
  return (
    <div className="grid gap-5">
      <section className={card} aria-labelledby="about-h">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <p className={`${eyebrow} text-[#00DAF3]`}>All about me</p>
            <h2 id="about-h" className="text-[22px] font-black mt-1" style={{ fontFamily: 'Outfit, system-ui' }}>{self ? 'Who you are' : `Who ${name} is`}, strengths first</h2>
            <p className="text-[13px] text-white/55 mt-1 max-w-[60ch]">Written with the learner, in their words where possible. It becomes a one-page profile you can print for a new teacher.</p>
          </div>
          <button type="button" onClick={onPrint} className="min-h-[44px] px-4 rounded-full border border-white/15 text-[13px] font-bold hover:bg-white/10 inline-flex items-center gap-2"><Printer size={15} /> One-page profile</button>
        </div>
        {!readOnly && (
          <label className="block mb-5 max-w-[360px]">
            <span className="text-[13px] font-bold text-white/80">Preferred name</span>
            <input value={a.preferredName || ''} onChange={e => set({ preferredName: e.target.value })} maxLength={40} className="mt-1 w-full min-h-[44px] rounded-2xl bg-white/[0.05] border border-white/12 px-3.5 text-[14px] outline-none focus:border-[#00DAF3]" />
          </label>
        )}
        <div className="grid gap-6 md:grid-cols-2">
          <PhraseList label="What people like and admire about me" hint="Strengths, talents, character" items={a.strengths} color="#F5B83D" readOnly={readOnly} onChange={v => set({ strengths: v })} />
          <PhraseList label="What I love" hint="Interests are doorways into learning" items={a.interests} color="#FF6FA8" readOnly={readOnly} onChange={v => set({ interests: v })} />
          <PhraseList label="What helps me learn" hint="Be specific: “pictures with words”, “one step at a time”" items={a.helps} color="#06D6A0" readOnly={readOnly} onChange={v => set({ helps: v })} />
          <PhraseList label="What makes learning harder" hint="Noise, surprises, timed tests, handwriting…" items={a.hard} color="#FFB266" readOnly={readOnly} onChange={v => set({ hard: v })} />
          <PhraseList label="What helps me feel calm" hint="A quiet corner, music, moving, a favourite object" items={a.calming} color="#60A5FA" readOnly={readOnly} onChange={v => set({ calming: v })} />
        </div>
      </section>

      <section className={card} aria-labelledby="comm-h">
        <p className={`${eyebrow} text-[#60A5FA]`}>Communication</p>
        <h2 id="comm-h" className="text-[18px] font-black mt-1 mb-3">How I communicate</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Ways of communicating">
          {COMM_MODES.map(m => <button key={m.id} type="button" disabled={readOnly} aria-pressed={a.communication.includes(m.id)} onClick={() => set({ communication: toggle(a.communication, m.id) })} className={chip(a.communication.includes(m.id))}>{m.label}</button>)}
        </div>
        <label className="block mt-4">
          <span className="text-[13px] font-bold text-white/80">How to communicate with me</span>
          <textarea value={a.commNotes || ''} readOnly={readOnly} onChange={e => set({ commNotes: e.target.value })} maxLength={400} rows={2} placeholder="e.g. Give me 10 seconds to answer. Short sentences help. Please don't touch my device."
            className="mt-1 w-full rounded-2xl bg-white/[0.05] border border-white/12 px-3.5 py-2.5 text-[14px] outline-none focus:border-[#00DAF3] resize-y" />
        </label>
      </section>

      <section className={card} aria-labelledby="id-h">
        <p className={`${eyebrow} text-[#c4b5fd]`}>Optional</p>
        <h2 id="id-h" className="text-[18px] font-black mt-1">How I describe myself</h2>
        <p className="text-[13px] text-white/55 mt-1 mb-3 max-w-[62ch]">Completely optional, and never needed for any support. Only the people you share your plan with can see this.</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Identities">
          {IDENTITIES.map(m => <button key={m.id} type="button" disabled={readOnly} aria-pressed={a.identities.includes(m.id)} onClick={() => set({ identities: toggle(a.identities, m.id) })} className={chip(a.identities.includes(m.id))}>{m.label}</button>)}
        </div>
        <p className="text-[13px] font-bold text-white/80 mt-5 mb-2">How I'd like people to say it</p>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Language preference">
          {LANGUAGE_PREFS.map(l => (
            <button key={l.id} type="button" role="radio" disabled={readOnly} aria-checked={a.languagePref === l.id} onClick={() => set({ languagePref: l.id })}
              className={`text-left rounded-2xl border p-3 ${a.languagePref === l.id ? 'border-[#c4b5fd] bg-[#c4b5fd]/10' : 'border-white/12 hover:border-white/30'}`}>
              <span className="block text-[14px] font-bold">{l.label}</span>
              <span className="block text-[12px] text-white/55">{l.example}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

interface SwitchDef { key: keyof Supports; label: string; does: string }
const GROUPS: Array<{ title: string; color: string; items: SwitchDef[] }> = [
  { title: 'Reading', color: '#c4b5fd', items: [
    { key: 'easyRead', label: 'Easier to read', does: 'Atkinson Hyperlegible type, no fancy capitals, more space between lines and letters.' },
    { key: 'lineFocus', label: 'Reading ruler', does: 'Dims the screen except a band of lines that follows your pointer, finger or keyboard.' },
    { key: 'readAloud', label: 'Listen buttons', does: 'A clear Listen button on lessons and questions; the part being read is highlighted.' },
  ] },
  { title: 'Senses', color: '#06D6A0', items: [
    { key: 'calm', label: 'Calm visuals', does: 'Turns off motion, glow and animation everywhere on Plajah.' },
    { key: 'mutedColor', label: 'Softer colour', does: 'Lowers colour saturation and contrast on learning screens.' },
    { key: 'lowSound', label: 'Quieter media', does: 'Videos and audio on learning screens start at a gentle volume.' },
  ] },
  { title: 'Pacing & structure', color: '#FFB266', items: [
    { key: 'chunk', label: 'One part at a time', does: 'Lessons show one short part, then a Next part button.' },
    { key: 'schedule', label: '“First, then” plan', does: 'Each lesson opens with a numbered plan of its parts and how long it takes.' },
    { key: 'transitionWarning', label: 'Heads-up before changes', does: 'A gentle notice a minute before a break.' },
  ] },
  { title: 'Checks & tests', color: '#00DAF3', items: [
    { key: 'readQuestions', label: 'Read questions aloud', does: 'Questions and answer choices are read out automatically.' },
    { key: 'fewerChoices', label: 'Fewer choices', does: 'One wrong answer is removed from multiple-choice questions.' },
    { key: 'retryFree', label: 'Retries are free', does: 'Wrong answers are never counted against you; try again any time.' },
    { key: 'untimed', label: 'No time pressure', does: 'Tells your teachers: no timed checks. Academia lesson checks are never timed.' },
  ] },
];

const Switch: React.FC<{ on: boolean; disabled?: boolean; onClick: () => void; label: string }> = ({ on, disabled, onClick, label }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onClick}
    className={`relative shrink-0 w-[52px] h-[30px] rounded-full border transition-colors ${on ? 'bg-[#00DAF3] border-[#00DAF3]' : 'bg-white/10 border-white/20'} disabled:opacity-60`}>
    <span className={`absolute top-[3px] w-[22px] h-[22px] rounded-full bg-white shadow transition-all ${on ? 'left-[26px]' : 'left-[3px]'}`} />
  </button>
);

export const SupportsEditor: React.FC<{ supports: Supports; readOnly?: boolean; onChange: (s: Supports) => void }> = ({ supports: s, readOnly, onChange }) => {
  const set = (p: Partial<Supports>) => onChange({ ...s, ...p });
  return (
    <div className="grid gap-5">
      <div className="grid gap-5 lg:grid-cols-2">
        {GROUPS.map(g => (
          <section key={g.title} className={card} aria-label={g.title}>
            <p className={eyebrow} style={{ color: g.color }}>{g.title}</p>
            <ul className="mt-3 grid gap-3">
              {g.items.map(it => (
                <li key={it.key} className="flex items-start gap-3">
                  <div className="flex-1 min-w-0"><p className="text-[15px] font-bold">{it.label}</p><p className="text-[12.5px] text-white/55 leading-snug">{it.does}</p></div>
                  <Switch label={it.label} on={!!s[it.key]} disabled={readOnly} onClick={() => set({ [it.key]: !s[it.key] } as Partial<Supports>)} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <section className={card} aria-label="Size, speed and breaks">
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <p className="text-[15px] font-bold mb-2">Text size</p>
            <div className="flex gap-2">{(['Smaller', 'Normal', 'Larger'] as const).map((l, i) => <button key={l} type="button" disabled={readOnly} aria-pressed={s.textSize === i} onClick={() => set({ textSize: i as 0 | 1 | 2 })} className={chip(s.textSize === i)}>{l}</button>)}</div>
          </div>
          <div>
            <p className="text-[15px] font-bold mb-2">Break reminders</p>
            <div className="flex flex-wrap gap-2">{[0, 10, 15, 20, 30].map(m => <button key={m} type="button" disabled={readOnly} aria-pressed={s.breakEveryMin === m} onClick={() => set({ breakEveryMin: m })} className={chip(s.breakEveryMin === m)}>{m ? `${m} min` : 'Off'}</button>)}</div>
          </div>
          <div>
            <label className="text-[15px] font-bold block mb-2" htmlFor="read-rate">Listening speed <span className="text-white/50 font-normal tabular-nums">{s.readRate.toFixed(2)}×</span></label>
            <input id="read-rate" type="range" min={0.6} max={1.2} step={0.05} value={s.readRate} disabled={readOnly} onChange={e => set({ readRate: parseFloat(e.target.value) })} className="w-full accent-[#00DAF3]" />
            <p className="text-[12px] text-white/50 mt-2">Extended time where something is timed</p>
            <div className="flex gap-2 mt-1">{([1, 1.5, 2] as const).map(x => <button key={x} type="button" disabled={readOnly} aria-pressed={s.extraTime === x} onClick={() => set({ extraTime: x })} className={chip(s.extraTime === x)}>{x === 1 ? 'Standard' : `${x}×`}</button>)}</div>
          </div>
        </div>
      </section>
    </div>
  );
};

/** Printable one-page profile. Printing hides the rest of the app. */
export const OnePageProfile: React.FC<{ plan: SupportPlan; onClose: () => void }> = ({ plan, onClose }) => {
  const a = plan.about;
  const actions = supportActions(plan.supports, a);
  const name = a.preferredName || plan.learnerName || 'Me';
  const Box: React.FC<{ title: string; items: string[]; color: string }> = ({ title, items, color }) => (
    <div className="rounded-2xl p-4 border-2" style={{ borderColor: color }}>
      <h3 className="text-[15px] font-black mb-1.5" style={{ color }}>{title}</h3>
      {items.length ? <ul className="list-disc pl-5 text-[14px] leading-relaxed">{items.map((t, i) => <li key={i}>{t}</li>)}</ul> : <p className="text-[13px] opacity-50">—</p>}
    </div>
  );
  return createPortal(
    <div id="pj-onepage" className="fixed inset-0 z-[2600] bg-black/70 overflow-y-auto p-4" role="dialog" aria-modal="true" aria-label="One-page profile">
      <style>{`@media print{body>*:not(#pj-onepage){display:none!important}#pj-onepage{position:static!important;background:#fff!important;padding:0!important}#pj-onepage .pj-noprint{display:none!important}#pj-onepage .pj-sheet{box-shadow:none!important;margin:0!important;max-width:none!important}}`}</style>
      <div className="pj-noprint max-w-[820px] mx-auto flex justify-end gap-2 mb-3">
        <button type="button" onClick={() => window.print()} className="min-h-[44px] px-4 rounded-full bg-white text-black text-[13px] font-black inline-flex items-center gap-2"><Printer size={15} /> Print</button>
        <button type="button" onClick={onClose} className="min-h-[44px] px-4 rounded-full border border-white/30 text-white text-[13px] font-bold">Close</button>
      </div>
      <div className="pj-sheet max-w-[820px] mx-auto bg-[#fffdf7] text-[#1c1a24] rounded-3xl p-8 shadow-2xl" style={{ fontFamily: '"Atkinson Hyperlegible", Verdana, sans-serif' }}>
        <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[#6B0099]">One-page profile</p>
        <h2 className="text-[34px] font-black leading-tight mb-5">{name}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Box title="What people like and admire about me" items={a.strengths} color="#b7791f" />
          <Box title="What I love" items={a.interests} color="#c2185b" />
          <Box title="What helps me learn" items={[...a.helps, ...actions]} color="#047857" />
          <Box title="What makes learning harder" items={a.hard} color="#c2410c" />
          <Box title="What helps me feel calm" items={a.calming} color="#1d4ed8" />
          <Box title="How I communicate" items={[...a.communication.map(c => COMM_MODES.find(m => m.id === c)?.label || c), ...(a.commNotes ? [a.commNotes] : [])]} color="#6d28d9" />
        </div>
        <p className="text-[11px] opacity-60 mt-5">Private. Please share it only with people who support {name}.</p>
      </div>
    </div>,
    document.body,
  );
};
