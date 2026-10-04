/**
 * PackPicker — "What kind of business?" Visual grid of vertical packs grouped by parent vertical, an honest
 * readiness badge per pack (computed from the capability registry, never hand-typed), a preview of exactly
 * what will be set up, and a one-tap apply.
 *
 * Presentational: the caller supplies `onApply`, so this renders in the dev preview with no Firebase.
 * Overlay uses createPortal to document.body.
 */
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Check, ArrowLeft, Loader2, Sparkles, Store, ShoppingBasket, Shirt, Scissors, Flower2, Wrench,
  WashingMachine, UtensilsCrossed, Building2, Clock, Tag, Users, ShieldCheck, Lock, Package,
} from 'lucide-react';
import {
  packsByParent, packReadiness, capabilityBreakdown, READINESS_LABEL, CAPABILITIES,
  type VerticalPack, type PackReadiness,
} from '../../services/verticalPacks';

export const PACK_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  ShoppingBasket, Shirt, Scissors, Flower2, Wrench, WashingMachine, UtensilsCrossed, Building2, Store,
};

const READY_STYLE: Record<PackReadiness, { color: string; dot: string }> = {
  ready: { color: '#06D6A0', dot: '●' },
  partial: { color: '#FFD166', dot: '◐' },
  early: { color: '#FF8C00', dot: '○' },
};

export const ReadinessBadge: React.FC<{ pack: VerticalPack; compact?: boolean }> = ({ pack, compact }) => {
  const r = packReadiness(pack);
  const s = READY_STYLE[r];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest whitespace-nowrap"
      style={{ background: `${s.color}1f`, color: s.color, border: `1px solid ${s.color}40` }}>
      <span aria-hidden>{s.dot}</span>{compact ? r : READINESS_LABEL[r]}
    </span>
  );
};

export interface PackApplyProgress { done: number; total: number; label: string }

interface Props {
  currentPackId?: string | null;
  /** Do the work. Resolve when finished; reject with an Error to show it inline. */
  onApply: (pack: VerticalPack, onProgress: (p: PackApplyProgress) => void) => Promise<{ summary?: string } | void>;
  onClose: () => void;
}

const PackPicker: React.FC<Props> = ({ currentPackId, onApply, onClose }) => {
  const groups = useMemo(() => packsByParent(), []);
  const [picked, setPicked] = useState<VerticalPack | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<PackApplyProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  const apply = async () => {
    if (!picked || busy) return;
    setBusy(true); setError(null);
    try {
      const r = await onApply(picked, setProgress);
      setDoneMsg((r && r.summary) || 'Your business is set up.');
    } catch (e: any) {
      setError(e?.message || 'Could not apply this pack.');
    } finally { setBusy(false); }
  };

  const overlay = (
    <div className="fixed inset-0 z-[400] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4" onClick={busy ? undefined : onClose}>
      <div onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#0a0a0d] border border-white/10 shadow-2xl"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.08] sticky top-0 bg-[#0a0a0d]/95 backdrop-blur z-10">
          {picked && !busy && !doneMsg && (
            <button onClick={() => setPicked(null)} aria-label="Back" className="w-8 h-8 rounded-full bg-white/5 border border-white/10 grid place-items-center text-white/50 hover:text-white"><ArrowLeft size={14} /></button>
          )}
          <div className="min-w-0">
            <h2 className="text-xl text-white leading-none truncate" style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 900, fontStyle: 'italic' }}>
              {picked ? picked.label : 'What kind of business?'}
            </h2>
            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/35 mt-1">
              {picked ? 'Here is exactly what gets set up' : 'Pick one. We set up the rest.'}
            </p>
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="ml-auto w-8 h-8 rounded-full bg-white/5 border border-white/10 grid place-items-center text-white/40 hover:text-white disabled:opacity-30"><X size={15} /></button>
        </div>

        {doneMsg ? (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[11px] font-black uppercase tracking-widest"><Check size={15} /> {picked?.label} is set up</div>
            <p className="text-white/55 text-xs leading-relaxed">{doneMsg} Your Overview now has a Go live checklist with live progress.</p>
            <button onClick={onClose} className="w-full py-3 rounded-2xl text-black text-[11px] font-black uppercase tracking-widest" style={{ background: 'linear-gradient(135deg,#FF8C00,#D40055)' }}>See my checklist</button>
          </div>
        ) : !picked ? (
          <div className="p-5 space-y-6">
            {groups.map(g => (
              <section key={g.parent}>
                <h3 className="text-[9px] font-black uppercase tracking-[0.3em] mb-2.5" style={{ color: g.color }}>{g.label}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {g.packs.map(p => {
                    const Icon = PACK_ICONS[p.icon] || Store;
                    const current = p.id === currentPackId;
                    return (
                      <button key={p.id} onClick={() => setPicked(p)}
                        className="text-left p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:border-white/25 hover:bg-white/[0.06] hover:-translate-y-0.5 transition-all flex gap-3">
                        <span className="w-11 h-11 rounded-xl grid place-items-center shrink-0" style={{ background: `${p.color}24`, color: p.color }}><Icon size={21} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-black text-white leading-tight">{p.label}</span>
                            {current && <span className="text-[8px] font-black uppercase tracking-widest text-[#06D6A0]">Current</span>}
                          </span>
                          <span className="block text-[10.5px] text-white/45 leading-snug mt-1">{p.blurb}</span>
                          <span className="flex items-center gap-2 mt-2 flex-wrap">
                            <ReadinessBadge pack={p} />
                            <span className="text-[8px] font-black uppercase tracking-widest text-white/25">{p.starterCatalog.items.length} starter {p.vocabulary.catalogNoun.toLowerCase()}</span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            <p className="text-[10px] text-white/30 leading-relaxed">Badges are computed from what the platform can really do today. Anything marked coming soon is shown honestly and never switched on.</p>
          </div>
        ) : (
          <PackPreview pack={picked} busy={busy} progress={progress} error={error} onApply={apply} current={picked.id === currentPackId} />
        )}
      </div>
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : overlay;
};

const Chip: React.FC<{ children: React.ReactNode; tone?: string }> = ({ children, tone }) => (
  <span className="px-2 py-1 rounded-lg text-[9.5px] font-bold" style={{ background: tone ? `${tone}1a` : 'rgba(255,255,255,0.05)', color: tone || 'rgba(255,255,255,0.6)' }}>{children}</span>
);

const Block: React.FC<{ icon: React.ComponentType<{ size?: number; className?: string }>; title: string; children: React.ReactNode }> = ({ icon: I, title, children }) => (
  <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.07]">
    <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2 flex items-center gap-1.5"><I size={11} /> {title}</p>
    {children}
  </div>
);

const PackPreview: React.FC<{ pack: VerticalPack; busy: boolean; progress: PackApplyProgress | null; error: string | null; onApply: () => void; current: boolean }> = ({ pack, busy, progress, error, onApply, current }) => {
  const Icon = PACK_ICONS[pack.icon] || Store;
  const bd = capabilityBreakdown(pack);
  const services = pack.starterCatalog.items.filter(i => i.kind === 'service').length;
  const products = pack.starterCatalog.items.filter(i => i.kind === 'product').length;
  const drafts = pack.starterCatalog.items.filter(i => i.requires && CAPABILITIES[i.requires].status === 'planned').length;
  const minutes = pack.checklist.filter(s => !s.optional && !(s.requires && CAPABILITIES[s.requires].status === 'planned')).reduce((n, s) => n + s.minutes, 0);
  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center gap-3 p-3.5 rounded-2xl border" style={{ background: `${pack.color}12`, borderColor: `${pack.color}33` }}>
        <span className="w-12 h-12 rounded-xl grid place-items-center shrink-0" style={{ background: `${pack.color}28`, color: pack.color }}><Icon size={24} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-white/60 leading-snug">{pack.blurb}</p>
          <div className="mt-1.5"><ReadinessBadge pack={pack} /></div>
        </div>
      </div>

      <Block icon={Package} title={`Starter ${pack.vocabulary.catalogNoun.toLowerCase()}`}>
        <p className="text-[11px] text-white/60 leading-snug mb-2">
          {products > 0 && <>{products} {products === 1 ? 'product' : 'products'}</>}{products > 0 && services > 0 && ' and '}{services > 0 && <>{services} {services === 1 ? 'service' : 'services'}</>}
          {' '}with realistic starter prices. All are tagged <strong className="text-white/80">sample</strong> so you can edit or delete them in one tap.
        </p>
        <div className="flex flex-wrap gap-1.5">{pack.starterCatalog.categories.map(c => <Chip key={c.name}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</Chip>)}</div>
        {drafts > 0 && <p className="text-[10px] text-[#FF8C00] mt-2 leading-snug">{drafts} items need a feature that is coming soon, so they are added as drafts and stay off until it ships.</p>}
      </Block>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Block icon={Clock} title="Hours and page">
          <p className="text-[11px] text-white/60 leading-snug">Typical opening hours, public page sections ({pack.publicSections.join(', ')}), and your dashboard tabs reordered for a {pack.label.toLowerCase()}.</p>
        </Block>
        <Block icon={Users} title={`${pack.vocabulary.staffPlural[0].toUpperCase()}${pack.vocabulary.staffPlural.slice(1)} and roles`}>
          <div className="flex flex-wrap gap-1.5">{pack.roles.map(r => <Chip key={r.key}>{r.label}</Chip>)}</div>
        </Block>
        <Block icon={Tag} title="Deals and rewards">
          <ul className="text-[11px] text-white/60 space-y-0.5">
            {pack.deals.map(d => <li key={d.key}>{d.label}{!d.startActive && <span className="text-white/30"> (off until you switch it on)</span>}</li>)}
            {pack.loyalty.rewardsEnabled && <li>{pack.loyalty.pointsPerDollar} point per $1 rewards</li>}
          </ul>
        </Block>
        <Block icon={ShieldCheck} title="What works today">
          <ul className="text-[11px] space-y-0.5">
            {bd.ready.map(c => <li key={c.id} className="text-white/60"><span className="text-[#06D6A0]">✓</span> {c.label}</li>)}
            {bd.partial.map(c => <li key={c.id} className="text-white/60"><span className="text-[#FFD166]">◐</span> {c.label} <span className="text-white/30">· {c.note}</span></li>)}
            {bd.planned.map(c => <li key={c.id} className="text-white/35"><Lock size={9} className="inline -mt-0.5 mr-1" />{c.label} <span className="text-white/25">· coming soon</span></li>)}
          </ul>
        </Block>
      </div>

      <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-white/[0.03] border border-white/[0.07] text-[11px] text-white/60">
        <Sparkles size={13} className="text-[#FF8C00] shrink-0" /> Then a {pack.checklist.length - pack.checklist.filter(s => s.optional).length}-step checklist gets you live in about {minutes} minutes, with progress detected automatically.
      </div>

      {error && <p className="text-[11px] font-bold text-red-400">{error}</p>}
      {busy && (
        <div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#FF8C00,#D40055)' }} /></div>
          <p className="text-[9px] font-black uppercase tracking-widest text-white/35 mt-1.5 truncate">{progress?.label || 'Starting'}</p>
        </div>
      )}
      <button onClick={onApply} disabled={busy}
        className="w-full py-3.5 rounded-2xl text-black text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-60"
        style={{ background: 'linear-gradient(135deg,#FF8C00,#D40055)' }}>
        {busy ? <><Loader2 size={14} className="animate-spin" /> Setting up…</> : current ? 'Re-run setup (adds only what is missing)' : `Set up my ${pack.label}`}
      </button>
    </div>
  );
};

export default PackPicker;
