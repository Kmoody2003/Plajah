import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  X, Loader2, Check, Building2, Store, Users, Landmark, Palette, GraduationCap, Disc3, Trophy, Rocket, ArrowRight,
} from 'lucide-react';
import { activateBrand, type BrandActivationResult } from '../services/brandActivation';
import type { OrgType } from '../types';

// One flow to turn on a brand/org/school: provisions a public page + optional club + store.
const VERTICALS: { orgType: OrgType; label: string; blurb: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { orgType: 'BRAND',     label: 'Brand',            blurb: 'Creator brand / label front', icon: Rocket },
  { orgType: 'BUSINESS',  label: 'Business',         blurb: 'Local or online business',    icon: Building2 },
  { orgType: 'NONPROFIT', label: 'Nonprofit',        blurb: 'Charity / cause',             icon: Landmark },
  { orgType: 'CULTURAL',  label: 'Cultural',         blurb: 'Museum / institution',        icon: Palette },
  { orgType: 'OTHER',     label: 'School',           blurb: 'Academic / education org',    icon: GraduationCap },
  { orgType: 'LABEL',     label: 'Label',            blurb: 'Record / media label',        icon: Disc3 },
  { orgType: 'TEAM',      label: 'Team',             blurb: 'Sports / esports team',       icon: Trophy },
];

const BrandActivationPanel: React.FC<{ onClose: () => void; onDone?: (r: BrandActivationResult) => void }> = ({ onClose, onDone }) => {
  const [orgType, setOrgType] = useState<OrgType>('BRAND');
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [category, setCategory] = useState('');
  const [withClub, setWithClub] = useState(true);
  const [withStore, setWithStore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<BrandActivationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activate = async () => {
    if (!name.trim()) { setError('Give your brand a name'); return; }
    setBusy(true); setError(null);
    const r = await activateBrand({ name: name.trim(), orgType, about: about.trim(), category: category.trim(), createClub: withClub, enableStore: withStore });
    setBusy(false);
    if (r.error || !r.organization) { setError(r.error || 'Activation failed'); return; }
    setDone(r); onDone?.(r);
  };

  const field = 'w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-[#FF8C00]/50 transition-all placeholder:text-white/25';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[320] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} onClick={e => e.stopPropagation()}
        className="w-full max-w-xl max-h-[88vh] overflow-y-auto rounded-3xl bg-[#0a0a0d] border border-white/10" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8 sticky top-0 bg-[#0a0a0d] z-10">
          <Rocket size={18} className="text-[#FF8C00]" />
          <div><p className="text-[11px] font-black uppercase tracking-[0.3em] text-white leading-none">Activate a Brand</p><p className="text-[7px] font-black uppercase tracking-[0.3em] text-white/30 mt-1">Page · Club · Store — provisioned together</p></div>
          <button onClick={onClose} className="ml-auto w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white"><X size={15} /></button>
        </div>

        {done ? (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[11px] font-black uppercase tracking-widest"><Check size={15} /> {name} is live</div>
            <div className="space-y-2">
              <Row icon={Building2} label={`${VERTICALS.find(v => v.orgType === orgType)?.label} page`} value="Created" />
              <Row icon={Users} label="Community club" value={done.club ? 'Created' : 'Skipped'} muted={!done.club} />
              <Row icon={Store} label="Merch store" value={done.storeEnabled ? 'Enabled' : 'Skipped'} muted={!done.storeEnabled} />
            </div>
            <p className="text-[11px] text-white/40 leading-relaxed">Your public page is ready. Add products in the Store Manager, invite your team, and post to your club. You can manage everything from your dashboard.</p>
            <button onClick={onClose} className="w-full py-3.5 rounded-full bg-[#FF8C00] text-black font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2">Go manage it <ArrowRight size={15} /></button>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Vertical */}
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-white/35 mb-2">What are you activating?</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {VERTICALS.map(v => {
                  const on = orgType === v.orgType;
                  return (
                    <button key={v.label} onClick={() => setOrgType(v.orgType)}
                      className={`text-left p-3 rounded-2xl border transition-all ${on ? 'border-[#FF8C00]/50 bg-[#FF8C00]/[0.06]' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'}`}>
                      <v.icon size={16} className={on ? 'text-[#FF8C00]' : 'text-white/40'} />
                      <p className="text-xs font-black text-white mt-1.5">{v.label}</p>
                      <p className="text-[9px] text-white/35 leading-tight">{v.blurb}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Details */}
            <div className="space-y-3">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" className={field} />
              <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Category (e.g. Apparel, Music, Ministry, STEM)" className={field} />
              <textarea value={about} onChange={e => setAbout(e.target.value)} rows={3} placeholder="About — one or two lines" className={`${field} resize-none`} />
            </div>

            {/* What gets provisioned */}
            <div className="space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-white/35">Provision</p>
              <Provisioned icon={Building2} label="Public page" desc="Your brand/org page — always on" locked />
              <Toggle icon={Users} label="Community club" desc="A space for members to gather" on={withClub} onToggle={() => setWithClub(v => !v)} />
              <Toggle icon={Store} label="Merch store" desc="Sell products (Printful/Gelato or your own)" on={withStore} onToggle={() => setWithStore(v => !v)} />
            </div>

            {error && <p className="text-[11px] font-bold text-rose-400">{error}</p>}
            <button onClick={activate} disabled={busy} className="w-full py-3.5 rounded-full bg-[#FF8C00] text-black font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-40">
              {busy ? <><Loader2 size={16} className="animate-spin" /> Activating…</> : <><Rocket size={16} /> Activate</>}
            </button>
            <p className="text-[9px] text-white/25 text-center">You can add more, rename, or turn features off later.</p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

const Row: React.FC<{ icon: React.ComponentType<{ size?: number; className?: string }>; label: string; value: string; muted?: boolean }> = ({ icon: Icon, label, value, muted }) => (
  <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.03] border border-white/8">
    <Icon size={16} className={muted ? 'text-white/25' : 'text-[#FF8C00]'} />
    <span className="text-xs font-bold text-white flex-1">{label}</span>
    <span className={`text-[9px] font-black uppercase tracking-widest ${muted ? 'text-white/30' : 'text-emerald-400'}`}>{value}</span>
  </div>
);
const Provisioned: React.FC<{ icon: React.ComponentType<{ size?: number; className?: string }>; label: string; desc: string; locked?: boolean }> = ({ icon: Icon, label, desc }) => (
  <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#FF8C00]/[0.05] border border-[#FF8C00]/20">
    <Icon size={17} className="text-[#FF8C00]" />
    <div className="flex-1"><p className="text-xs font-black text-white">{label}</p><p className="text-[9px] text-white/40">{desc}</p></div>
    <Check size={15} className="text-[#FF8C00]" />
  </div>
);
const Toggle: React.FC<{ icon: React.ComponentType<{ size?: number; className?: string }>; label: string; desc: string; on: boolean; onToggle: () => void }> = ({ icon: Icon, label, desc, on, onToggle }) => (
  <button onClick={onToggle} className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all text-left ${on ? 'border-[#FF8C00]/30 bg-[#FF8C00]/[0.04]' : 'border-white/8 bg-white/[0.02]'}`}>
    <Icon size={17} className={on ? 'text-[#FF8C00]' : 'text-white/35'} />
    <div className="flex-1"><p className="text-xs font-black text-white">{label}</p><p className="text-[9px] text-white/40">{desc}</p></div>
    <span className={`w-9 h-5 rounded-full p-0.5 transition-all ${on ? 'bg-[#FF8C00]' : 'bg-white/15'}`}><span className={`block w-4 h-4 rounded-full bg-black transition-all ${on ? 'translate-x-4' : ''}`} /></span>
  </button>
);

export default BrandActivationPanel;
