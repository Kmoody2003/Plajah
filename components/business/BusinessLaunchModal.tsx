import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  X, Loader2, Check, ArrowRight, ArrowLeft, Users, Store, ShieldCheck,
  Disc3, Clapperboard, BookOpen, Building2, UtensilsCrossed, Music, Sparkles,
} from 'lucide-react';
import { BUSINESS_TEMPLATES, type BusinessTemplate } from '../../services/businessTemplates';
import { launchBusinessPage } from '../../services/brandActivation';
import type { Organization } from '../../types';

// Icon-name (from the template registry) → lucide component.
const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Disc3, Clapperboard, BookOpen, Building2, UtensilsCrossed, Music, Sparkles,
};

const BusinessLaunchModal: React.FC<{
  onClose: () => void;
  onLaunched?: (org: Organization) => void;
}> = ({ onClose, onLaunched }) => {
  const [selected, setSelected] = useState<BusinessTemplate | null>(null);
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [withClub, setWithClub] = useState(false);
  const [withStore, setWithStore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneOrg, setDoneOrg] = useState<Organization | null>(null);

  const field = 'w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-[#0070FF]/50 transition-all placeholder:text-white/25';

  const launch = async () => {
    if (!selected) return;
    if (!name.trim()) { setError('Give your business a name'); return; }
    setBusy(true); setError(null);
    const r = await launchBusinessPage(selected.id, { name: name.trim(), about: about.trim(), createClub: withClub, enableStore: withStore });
    setBusy(false);
    if (r.error || !r.organization) { setError(r.error || 'Launch failed'); return; }
    setDoneOrg(r.organization);
    onLaunched?.(r.organization);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-[320] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-3xl bg-[#0a0a0d] border border-white/10" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8 sticky top-0 bg-[#0a0a0d] z-10">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#0070FF,#FFD400)' }}>
            <Building2 size={15} className="text-white" />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white leading-none">Launch a Business Page</p>
            <p className="text-[7px] font-black uppercase tracking-[0.3em] text-white/30 mt-1">Pick a template — roles come pre-built</p>
          </div>
          <button onClick={onClose} className="ml-auto w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white"><X size={15} /></button>
        </div>

        {/* Success */}
        {doneOrg ? (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[11px] font-black uppercase tracking-widest">
              <Check size={15} /> {doneOrg.name} is live
            </div>
            <p className="text-white/50 text-xs leading-relaxed">
              Your <strong className="text-white/80">{selected?.label}</strong> page is set up with {selected?.defaultRoles.length} predefined roles.
              Next, add employees and assign them roles from your dashboard.
            </p>
            <button onClick={onClose} className="w-full py-3 rounded-2xl text-black text-[11px] font-black uppercase tracking-widest" style={{ background: 'linear-gradient(135deg,#0070FF,#FFD400)' }}>Done</button>
          </div>
        ) : !selected ? (
          /* Template gallery */
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {BUSINESS_TEMPLATES.map(t => {
              const Icon = ICONS[t.icon] || Sparkles;
              return (
                <button key={t.id} onClick={() => { setSelected(t); setError(null); }}
                  className="text-left p-4 rounded-2xl bg-white/[0.03] border border-white/8 hover:border-white/20 hover:bg-white/[0.06] transition-all group">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: `${t.accentColor}22`, color: t.accentColor }}>
                    <Icon size={20} />
                  </div>
                  <p className="text-sm font-black uppercase tracking-wide text-white">{t.label}</p>
                  <p className="text-[10px] text-white/40 mt-1 leading-snug">{t.blurb}</p>
                  <p className="text-[8px] font-black uppercase tracking-widest text-white/25 mt-2">{t.defaultRoles.length} roles included</p>
                </button>
              );
            })}
          </div>
        ) : (
          /* Onboarding form */
          <div className="p-5 space-y-4">
            <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">
              <ArrowLeft size={12} /> Templates
            </button>

            <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/8">
              {(() => { const Icon = ICONS[selected.icon] || Sparkles; return (
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${selected.accentColor}22`, color: selected.accentColor }}><Icon size={20} /></div>
              ); })()}
              <div><p className="text-sm font-black uppercase tracking-wide text-white">{selected.label}</p><p className="text-[10px] text-white/40">{selected.blurb}</p></div>
            </div>

            <div className="space-y-2">
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">Business name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder={`e.g. ${selected.label} name`} className={field} />
            </div>
            <div className="space-y-2">
              <label className="block text-[9px] font-black uppercase tracking-widest text-white/40">About (optional)</label>
              <textarea value={about} onChange={e => setAbout(e.target.value)} rows={2} placeholder="What your business does…" className={`${field} resize-none`} />
            </div>

            {/* Included roles preview */}
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/8">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2 flex items-center gap-1.5"><ShieldCheck size={11} /> Predefined roles</p>
              <div className="flex flex-wrap gap-1.5">
                {selected.defaultRoles.map(r => (
                  <span key={r.key} className="px-2 py-1 rounded-lg bg-white/5 text-[9px] font-bold text-white/60">{r.label}</span>
                ))}
              </div>
            </div>

            {/* Add-ons */}
            <div className="grid grid-cols-2 gap-2">
              <Toggle icon={Users} label="Community club" on={withClub} onClick={() => setWithClub(v => !v)} />
              <Toggle icon={Store} label="Merch store" on={withStore} onClick={() => setWithStore(v => !v)} />
            </div>

            {error && <p className="text-[10px] font-bold text-red-400">{error}</p>}

            <button onClick={launch} disabled={busy}
              className="w-full py-3 rounded-2xl text-black text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#0070FF,#FFD400)' }}>
              {busy ? <><Loader2 size={14} className="animate-spin" /> Launching…</> : <>Launch {selected.label} <ArrowRight size={14} /></>}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

const Toggle: React.FC<{ icon: React.ComponentType<{ size?: number; className?: string }>; label: string; on: boolean; onClick: () => void }> = ({ icon: Icon, label, on, onClick }) => (
  <button onClick={onClick} className={`flex items-center gap-2 p-3 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all ${on ? 'bg-white/10 border-white/25 text-white' : 'bg-white/[0.02] border-white/8 text-white/40'}`}>
    <Icon size={14} /> {label} {on && <Check size={12} className="ml-auto text-emerald-400" />}
  </button>
);

export default BusinessLaunchModal;
