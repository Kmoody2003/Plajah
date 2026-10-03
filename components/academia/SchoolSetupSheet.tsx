import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { SETTINGS, TRADITIONS, APPROACHES, SCRIPTURE_TRANSLATIONS, profileFor, type SchoolProfile, type Setting, type Tradition, type Approach } from '../../services/schoolProfile';

/**
 * "Tell us about your school": four short questions that shape Academia for a public, charter,
 * private, faith-based or homeschool setting. Nothing religious is switched on unless the school
 * chooses it. The facts of every lesson stay the same for everyone.
 */
const Choice: React.FC<{ on: boolean; label: string; blurb: string; onClick: () => void }> = ({ on, label, blurb, onClick }) => (
  <button type="button" onClick={onClick} aria-pressed={on}
    className={`text-left rounded-2xl border px-4 py-3 transition-colors ${on ? 'border-white bg-white/10' : 'border-white/12 bg-white/[0.03] hover:bg-white/[0.07]'}`}>
    <span className="flex items-center gap-2 text-[14px] font-black">{on && <Check size={14} className="text-emerald-300" />}{label}</span>
    <span className="block text-[12px] text-white/55 mt-0.5 leading-snug">{blurb}</span>
  </button>
);

const SchoolSetupSheet: React.FC<{ initial: SchoolProfile; onSave: (p: SchoolProfile) => Promise<unknown> | void; onClose: () => void }> = ({ initial, onSave, onClose }) => {
  const [step, setStep] = useState(0);
  const [setting, setSetting] = useState<Setting>(initial.setting);
  const [tradition, setTradition] = useState<Tradition>(initial.tradition);
  const [approach, setApproach] = useState<Approach>(initial.approach);
  const base = profileFor(setting, tradition, approach);
  const hasScripture = TRADITIONS.find(t => t.id === tradition)?.hasScripture === true;
  const [scripture, setScripture] = useState(initial.scripture?.enabled ?? base.scripture.enabled);
  const [translation, setTranslation] = useState(initial.scripture?.translation || 'kjv');
  const [name, setName] = useState(initial.name || '');
  const [region, setRegion] = useState(initial.region || '');
  const [busy, setBusy] = useState(false);

  const steps = ['Where you learn', 'Your tradition', 'How you teach', 'Finish'];
  const save = async () => {
    setBusy(true);
    await onSave({ setting, tradition, approach, name, region, scripture: { enabled: hasScripture && scripture, translation } });
    setBusy(false); onClose();
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Set up your school" className="fixed inset-0 z-[300] bg-black/75 backdrop-blur-sm grid place-items-center p-3" onClick={onClose}>
      <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#0e0b16] text-white p-5 sm:p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-1">
          <div className="flex-1"><p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#3FB98E]">Step {step + 1} of 4 · {steps[step]}</p><h2 className="text-xl font-black">Tell us about your school</h2></div>
          <button type="button" aria-label="Close" onClick={onClose} className="w-9 h-9 grid place-items-center rounded-full hover:bg-white/10 text-white/60"><X size={18} /></button>
        </div>
        <p className="text-[12px] text-white/50 mb-4">Plajah adapts to how you learn. Every lesson has the same facts for everyone; this only changes what is shown around them.</p>

        {step === 0 && <div className="grid gap-2">{SETTINGS.map(s => <Choice key={s.id} on={setting === s.id} label={s.label} blurb={s.blurb} onClick={() => setSetting(s.id)} />)}</div>}
        {step === 1 && <div className="grid gap-2">{TRADITIONS.map(t => <Choice key={t.id} on={tradition === t.id} label={t.label} blurb={`${t.blurb}${t.texts ? ` (${t.texts})` : ''}`} onClick={() => { setTradition(t.id); setScripture(t.hasScripture); }} />)}</div>}
        {step === 2 && <div className="grid gap-2">{APPROACHES.map(a => <Choice key={a.id} on={approach === a.id} label={a.label} blurb={a.blurb} onClick={() => setApproach(a.id)} />)}</div>}
        {step === 3 && (
          <div className="grid gap-4">
            <label className="grid gap-1 text-[12px] font-black text-white/65">Name (optional)
              <input value={name} onChange={e => setName(e.target.value)} placeholder="St. Brigid's Academy, The Okafor Family School..." className="rounded-xl bg-black/30 border border-white/15 px-3 py-2 text-sm text-white font-normal" /></label>
            <label className="grid gap-1 text-[12px] font-black text-white/65">State or country (optional)
              <input value={region} onChange={e => setRegion(e.target.value)} placeholder="Michigan, USA" className="rounded-xl bg-black/30 border border-white/15 px-3 py-2 text-sm text-white font-normal" />
              <span className="font-normal text-white/40">Used only to point you to the right requirements.</span></label>
            {hasScripture ? (
              <div className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={scripture} onChange={e => setScripture(e.target.checked)} className="mt-1" />
                  <span><span className="block text-[14px] font-black">Weave scripture into reading and history</span>
                    <span className="block text-[12px] text-white/55 leading-snug">Adds perspective-labelled scripture connections to classic literature and history lessons, a daily passage, and Christian reading lists. You can switch this off at any time.</span></span>
                </label>
                {scripture && (
                  <label className="grid gap-1 text-[12px] font-black text-white/65 mt-3">Translation
                    <select value={translation} onChange={e => setTranslation(e.target.value)} className="rounded-xl bg-black/30 border border-white/15 px-3 py-2 text-sm text-white font-normal">
                      {SCRIPTURE_TRANSLATIONS.map(t => <option key={t.slug} value={t.slug}>{t.label}{t.note ? ` (${t.note})` : ''}</option>)}
                    </select>
                    <span className="font-normal text-white/40">Only public-domain translations are available today. Licensed ones such as the NABRE, ESV or NIV are not included yet.</span>
                  </label>
                )}
              </div>
            ) : tradition !== 'secular' ? <p className="text-[12px] text-white/50">Scripture connections for this tradition are not available yet. The Sacred Library has study resources for the world's faiths.</p> : null}
          </div>
        )}

        <div className="flex justify-between mt-6">
          <button type="button" onClick={() => (step === 0 ? onClose() : setStep(step - 1))} className="rounded-full px-4 py-2 text-[12px] font-black border border-white/15 hover:bg-white/10 inline-flex items-center gap-1.5"><ArrowLeft size={14} /> {step === 0 ? 'Cancel' : 'Back'}</button>
          {step < 3
            ? <button type="button" onClick={() => setStep(step + 1)} className="rounded-full px-5 py-2 text-[12px] font-black bg-white text-black inline-flex items-center gap-1.5">Next <ArrowRight size={14} /></button>
            : <button type="button" disabled={busy} onClick={save} className="rounded-full px-5 py-2 text-[12px] font-black bg-[#3FB98E] text-black disabled:opacity-60">{busy ? 'Saving…' : 'Save my school'}</button>}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default SchoolSetupSheet;
