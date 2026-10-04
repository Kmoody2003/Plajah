import React, { useState } from 'react';
import { ShieldAlert, FlaskConical, Stethoscope, X, Info } from 'lucide-react';
import {
  CLINICAL_CARE_LIVE, NO_PHI_RULES, disableClinicalDemo, enableClinicalDemo, isClinicalDemoEnabled,
} from '../../services/clinic/phiGuard';

/** Shown in place of Clinical Care for a real health business until the vault is live. */
export const ClinicalCareGate: React.FC<{ businessName?: string; userId?: string; children: React.ReactNode }> = ({ businessName, userId, children }) => {
  const [enabled, setEnabled] = useState(isClinicalDemoEnabled());
  const [agreed, setAgreed] = useState(false);
  if (CLINICAL_CARE_LIVE || enabled) {
    return (
      <>
        {!CLINICAL_CARE_LIVE && <DemoBanner onExit={() => { disableClinicalDemo(); setEnabled(false); setAgreed(false); }} />}
        {children}
      </>
    );
  }
  return (
    <div className="max-w-2xl mx-auto rounded-3xl border border-white/10 bg-white/[0.03] p-8 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-[#00DAF3]/10 text-[#00DAF3] flex items-center justify-center"><Stethoscope size={22} /></div>
        <div>
          <h3 className="text-lg font-black text-white font-['Space_Grotesk']">Clinical Care is in private preview</h3>
          <p className="text-xs text-white/50">{businessName ? `${businessName} · ` : ''}not yet available for real patients</p>
        </div>
      </div>
      <p className="text-sm text-white/70 leading-relaxed">
        Scheduling, intake, visit notes, billing codes and telehealth are built, but Plajah is not yet set up to store
        real patient health information. Until the legal and security work is complete, this workspace runs as a
        <b className="text-white"> demo with fictional patients only</b>. Everything else for your business — your page,
        listings, store and POS, signage, media, marketing and billing-code lookup — works normally.
      </p>
      <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4 text-xs text-amber-100/90 space-y-2">
        <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-[10px] text-amber-300"><ShieldAlert size={13} /> Demo rules</div>
        <ul className="list-disc pl-4 space-y-1">
          <li>Enter only made-up patients. Never a real patient, even to test.</li>
          <li>Demo data stays in this browser on this device. It is not synced and not backed up.</li>
          <li>Telehealth in the demo is a simulation — do not use it for real visits.</li>
        </ul>
      </div>
      <label className="flex items-start gap-3 text-sm text-white/80 cursor-pointer">
        <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-1 accent-[#00DAF3]" />
        I understand and will enter only fictional patients.
      </label>
      <button
        disabled={!agreed}
        onClick={() => { enableClinicalDemo(userId); setEnabled(true); }}
        className="w-full py-3 rounded-2xl bg-[#00DAF3] text-black font-black text-sm disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-110 transition"
      >
        <FlaskConical size={14} className="inline -mt-0.5 mr-2" /> Open the private demo
      </button>
    </div>
  );
};

export const DemoBanner: React.FC<{ onExit?: () => void }> = ({ onExit }) => (
  <div className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-2.5 text-xs text-amber-100">
    <FlaskConical size={14} className="text-amber-300 shrink-0" />
    <span className="flex-1"><b className="uppercase tracking-wider text-amber-300">Demo — fictional patients only.</b> Stored on this device, not synced, not for real patient information.</span>
    {onExit && <button onClick={onExit} className="shrink-0 text-amber-300/80 hover:text-white flex items-center gap-1"><X size={12} /> Exit demo</button>}
  </div>
);

/** One-line reminder on the non-clinical tools of a health business (POS, signage, marketing, messaging…). */
export const NoPhiNotice: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs text-white/70">
      <div className="flex items-center gap-2">
        <Info size={13} className="text-[#00DAF3] shrink-0" />
        <span className="flex-1"><b className="text-white">No patient information here.</b> {compact ? '' : 'This tool is not set up for protected health information.'}</span>
        <button onClick={() => setOpen(o => !o)} className="text-[#00DAF3] hover:underline shrink-0">{open ? 'Hide' : 'Rules'}</button>
      </div>
      {open && <ul className="list-disc pl-8 mt-2 space-y-1 text-white/60">{NO_PHI_RULES.map(r => <li key={r}>{r}</li>)}</ul>}
    </div>
  );
};
